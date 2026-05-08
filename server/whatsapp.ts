import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  WAMessage,
  downloadMediaMessage,
  jidNormalizedUser,
  jidDecode,
  makeCacheableSignalKeyStore,
  Browsers,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs/promises";
import { registerWhatsAppSession, unregisterWhatsAppSession } from "./whatsappSender";
import { storage } from "./storage";
import {
  clearDistributedKey,
  getDistributedKeyRemainingMs,
  isRedisAvailable,
  refreshDistributedLock,
  releaseDistributedLock,
  setDistributedExpiringKey,
  tryAcquireDistributedLock,
  type DistributedLockHandle,
} from "./redisCoordinator";
import WebSocket from "ws";
import { generateAIResponse, type AIResponseResult, type AIResponseOptions } from "./aiAgent";
import { executeMediaActions, downloadMediaAsBuffer } from "./mediaService";
import { registerFollowUpCallback, registerScheduledContactCallback, followUpService } from "./followUpService";
import { userFollowUpService } from "./userFollowUpService";
import { supabase } from "./supabaseAuth";
import { messageQueueService } from "./messageQueueService";
import { db } from "./db";
import { conversations } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { uploadMediaToStorage } from "./mediaStorageService";
import { processAudioResponseForAgent } from "./audioResponseService";
// ?? ANTI-REENVIO: Importar servi�o de deduplica��o para prote��o contra instabilidade
import { isIncomingMessageProcessed, markIncomingMessageProcessed, canSendMessage, getDeduplicationStats, MessageType, MessageSource } from "./messageDeduplicationService";
// ?? v4.0 ANTI-BAN: Servi�o de prote��o contra bloqueio (rate limiting, safe mode, etc)
import { antiBanProtectionService } from "./antiBanProtectionService";

// ?? SISTEMA DE RECUPERA��O DE MENSAGENS PENDENTES
// Resolve problema de mensagens perdidas durante instabilidade/deploys Railway
import { 
  pendingMessageRecoveryService,
  saveIncomingMessage,
  markMessageAsProcessed,
  markMessageAsFailed,
  startMessageRecovery,
  logConnectionDisconnection,
  getRecoveryStats,
  registerMessageProcessor 
} from "./pendingMessageRecoveryService";

// -----------------------------------------------------------------------
// ?? SISTEMA DE CACHE DE MENSAGENS PARA RETRY (FIX "AGUARDANDO MENSAGEM")
// -----------------------------------------------------------------------
// O WhatsApp mostra "Aguardando para carregar mensagem" quando:
// 1. A mensagem falhou na decripta??o
// 2. O Baileys precisa reenviar a mensagem mas n?o tem o conte?do original
// 
// SOLU??O: Armazenar mensagens enviadas em cache para que o Baileys possa
// recuper?-las via getMessage() quando precisar fazer retry.
// 
// Cache TTL: 24 horas (mensagens mais antigas s?o removidas automaticamente)
// -----------------------------------------------------------------------
interface CachedMessage {
  message: proto.IMessage;
  timestamp: number;
}

// Cache global de mensagens por userId
const messageCache = new Map<string, Map<string, CachedMessage>>();

// TTL do cache: 24 horas
const MESSAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Fun??o para obter o cache de um usu?rio espec?fico
function getUserMessageCache(userId: string): Map<string, CachedMessage> {
  let cache = messageCache.get(userId);
  if (!cache) {
    cache = new Map<string, CachedMessage>();
    messageCache.set(userId, cache);
  }
  return cache;
}

// Fun??o para armazenar mensagem no cache
function cacheMessage(userId: string, messageId: string, message: proto.IMessage): void {
  const cache = getUserMessageCache(userId);
  cache.set(messageId, {
    message,
    timestamp: Date.now(),
  });
  console.log(`?? [MSG CACHE] Armazenada mensagem ${messageId} para user ${userId.substring(0, 8)}... (cache size: ${cache.size})`);
}

// Fun??o para recuperar mensagem do cache
function getCachedMessage(userId: string, messageId: string): proto.IMessage | undefined {
  const cache = getUserMessageCache(userId);
  const cached = cache.get(messageId);
  
  if (!cached) {
    console.log(`?? [MSG CACHE] Mensagem ${messageId} N?O encontrada no cache para user ${userId.substring(0, 8)}...`);
    return undefined;
  }
  
  // Verificar se expirou
  if (Date.now() - cached.timestamp > MESSAGE_CACHE_TTL_MS) {
    cache.delete(messageId);
    console.log(`? [MSG CACHE] Mensagem ${messageId} expirada e removida do cache`);
    return undefined;
  }
  
  console.log(`? [MSG CACHE] Mensagem ${messageId} recuperada do cache para retry`);
  return cached.message;
}

// Limpar mensagens expiradas do cache periodicamente (a cada 30 minutos)
setInterval(() => {
  const now = Date.now();
  let totalCleaned = 0;
  
  for (const [userId, cache] of messageCache.entries()) {
    for (const [msgId, cached] of cache.entries()) {
      if (now - cached.timestamp > MESSAGE_CACHE_TTL_MS) {
        cache.delete(msgId);
        totalCleaned++;
      }
    }
    // Remover caches vazios
    if (cache.size === 0) {
      messageCache.delete(userId);
    }
  }
  
  if (totalCleaned > 0) {
    console.log(`?? [MSG CACHE] Limpeza peri�dica: ${totalCleaned} mensagens expiradas removidas`);
  }
}, 30 * 60 * 1000);

// -----------------------------------------------------------------------
// ? MUTEX DE CRIA��O DE CONVERSA (FIX DUPLICATAS)
// -----------------------------------------------------------------------
// Previne race condition quando m�ltiplas mensagens do mesmo contato
// chegam simultaneamente e ambas tentam criar conversa nova.
// Chave: "connectionId:contactNumber" ? Promise que resolve com a conversa
// -----------------------------------------------------------------------
const conversationCreationLocks = new Map<string, Promise<any>>();

async function getOrCreateConversationSafe(
  connectionId: string,
  contactNumber: string,
  createFn: () => Promise<any>,
  lookupFn: () => Promise<any>
): Promise<{ conversation: any; wasCreated: boolean }> {
  const lockKey = `${connectionId}:${contactNumber}`;
  
  // Se j� existe um lock ativo, esperar ele terminar e usar o resultado
  const existingLock = conversationCreationLocks.get(lockKey);
  if (existingLock) {
    try {
      await existingLock;
    } catch {}
    // Ap�s o lock liberar, buscar a conversa que foi criada
    const existing = await lookupFn();
    if (existing) return { conversation: existing, wasCreated: false };
  }
  
  // Verificar se j� existe
  const existing = await lookupFn();
  if (existing) return { conversation: existing, wasCreated: false };
  
  // Criar com lock
  const createPromise = createFn();
  conversationCreationLocks.set(lockKey, createPromise);
  
  try {
    const result = await createPromise;
    return { conversation: result, wasCreated: true };
  } finally {
    conversationCreationLocks.delete(lockKey);
  }
}

// -----------------------------------------------------------------------
// ??? SISTEMA DE VERIFICA��O DE MENSAGENS N�O PROCESSADAS
// -----------------------------------------------------------------------
// NOTA: A implementa��o real est� mais abaixo no arquivo, ap�s as declara��es
// de pendingResponses, conversationsBeingProcessed, etc.
// -----------------------------------------------------------------------

// Map para rastrear �ltima verifica��o por userId (evita spam)
const lastMissedMessageCheck = new Map<string, number>();

// Map para rastrear mensagens j� detectadas como faltantes (evita reprocessar)
const detectedMissedMessages = new Set<string>(); // key: conversationId_messageId

// Placeholder - ser� substitu�do pela fun��o real mais abaixo
let checkForMissedMessages: (session: WhatsAppSession) => Promise<void> = async () => {};

// Flag para controlar se o polling foi iniciado
let missedMessagePollingStarted = false;

// Fun��o para iniciar o polling (ser� chamada depois que sessions for declarado)
function startMissedMessagePolling() {
  // ?? MODO DEV: Pular polling de missed messages se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`?? [MISSED MSG] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  if (missedMessagePollingStarted) return;
  missedMessagePollingStarted = true;
  
  // Iniciar polling de mensagens n�o processadas a cada 45 segundos
  setInterval(async () => {
    // Verificar se sessions est� dispon�vel
    if (typeof sessions === 'undefined') return;
    
    for (const [userId, session] of sessions.entries()) {
      if (session.isConnected && session.socket) {
        try {
          await checkForMissedMessages(session);
        } catch (error) {
          // Silenciar erros individuais
        }
      }
    }
  }, 45 * 1000);
  
  console.log(`?? [MISSED MSG] Polling de mensagens n�o processadas iniciado (a cada 45s)`);
}

// -----------------------------------------------------------------------
// ? UPLOAD DE M�DIA PARA STORAGE (Economia de Egress)
// -----------------------------------------------------------------------
// Em vez de salvar base64 no banco (que consome muito egress),
// fazemos upload para o Supabase Storage (usa cached egress via CDN).
// 
// Economia estimada: ~90% de redu??o no egress de m?dia
// -----------------------------------------------------------------------

/**
 * Faz upload de m?dia para Storage ou cria URL base64 como fallback
 * @param buffer Buffer da m?dia
 * @param mimeType Tipo MIME (ex: image/jpeg, audio/ogg)
 * @param userId ID do usu?rio
 * @param conversationId ID da conversa (opcional)
 * @returns URL do storage ou data URL base64
 */
async function uploadMediaOrFallback(
  buffer: Buffer,
  mimeType: string,
  userId: string,
  conversationId?: string
): Promise<string | null> {
  try {
    const result = await uploadMediaToStorage(buffer, mimeType, userId, conversationId);
    if (result && result.url) {
      console.log(`?? [STORAGE] M�dia enviada para Storage: ${result.url.substring(0, 80)}...`);
      return result.url;
    } else {
      console.warn(`?? [STORAGE] Upload retornou resultado inv�lido:`, result);
    }
  } catch (error) {
    console.error(`? [STORAGE] Erro ao enviar para Storage:`, error);
  }
  
  // SEM fallback base64 para evitar egress excessivo!
  console.warn(`?? [STORAGE] Upload falhou, m�dia n�o ser� salva (sem fallback base64)`);
  return null;
}

// -----------------------------------------------------------------------
// ???? SAFE MODE: Prote??o Anti-Bloqueio para Clientes
// -----------------------------------------------------------------------
// Esta funcionalidade ? ativada pelo admin quando um cliente tomou bloqueio
// do WhatsApp e est? reconectando. Ao reconectar com Safe Mode ativo:
// 1. Zera a fila de mensagens pendentes
// 2. Desativa todos os follow-ups programados
// 3. Come?a do zero para evitar novo bloqueio
// -----------------------------------------------------------------------

/**
 * Executa limpeza completa quando um cliente reconecta com Safe Mode ativo
 * Chamado automaticamente quando conn === "open" e safeModeEnabled === true
 */
async function executeSafeModeCleanup(userId: string, connectionId: string): Promise<{
  success: boolean;
  messagesCleared: number;
  followupsCleared: number;
  error?: string;
}> {
  console.log(`\n??? ---------------------------------------------------------------`);
  console.log(`??? [SAFE MODE] Iniciando limpeza para usu?rio ${userId.substring(0, 8)}...`);
  console.log(`??? ---------------------------------------------------------------\n`);

  let messagesCleared = 0;
  let followupsCleared = 0;

  try {
    // 1. Limpar fila de mensagens pendentes
    const queueResult = messageQueueService.clearUserQueue(userId);
    messagesCleared = queueResult.cleared;
    console.log(`??? [SAFE MODE] ? Fila de mensagens: ${messagesCleared} mensagens removidas`);

    // 2. Desativar follow-ups de todas as conversas deste usu?rio
    // Atualizar todas as conversas para: followupActive = false, nextFollowupAt = null
    const followupResult = await db
      .update(conversations)
      .set({
        followupActive: false,
        nextFollowupAt: null,
        followupStage: 0,
        followupDisabledReason: 'Safe Mode - limpeza ap?s bloqueio do WhatsApp',
        updatedAt: new Date(),
      })
      .where(eq(conversations.connectionId, connectionId))
      .returning({ id: conversations.id });

    followupsCleared = followupResult.length;
    console.log(`??? [SAFE MODE] ? Follow-ups: ${followupsCleared} conversas com follow-up desativado`);

    // 3. Registrar data/hora da ?ltima limpeza
    await storage.updateConnection(connectionId, {
      safeModeLastCleanupAt: new Date(),
    });

    console.log(`\n??? [SAFE MODE] ? Limpeza conclu?da com sucesso!`);
    console.log(`??? [SAFE MODE] ?? Resumo:`);
    console.log(`???   - Mensagens removidas da fila: ${messagesCleared}`);
    console.log(`???   - Follow-ups desativados: ${followupsCleared}`);
    console.log(`???   - Cliente pode usar o WhatsApp normalmente agora`);
    console.log(`??? ---------------------------------------------------------------\n`);

    return {
      success: true,
      messagesCleared,
      followupsCleared,
    };
  } catch (error: any) {
    console.error(`??? [SAFE MODE] ? Erro na limpeza:`, error);
    return {
      success: false,
      messagesCleared,
      followupsCleared,
      error: error.message,
    };
  }
}

// -----------------------------------------------------------------------
// ?? WRAPPER: uploadMediaSimple - Compatibilidade com c�digo legado
// A fun��o importada uploadMediaToStorage de mediaStorageService.ts retorna 
// { url, path, size } e precisa de (buffer, mimeType, userId, conversationId?)
// Esta wrapper aceita (buffer, mimeType, fileName) e retorna apenas a URL
// -----------------------------------------------------------------------
async function uploadMediaSimple(
  buffer: Buffer, 
  mimeType: string, 
  fileName?: string
): Promise<string | null> {
  try {
    // Usar "system" como userId gen�rico para uploads sem contexto de usu�rio
    const result = await uploadMediaToStorage(buffer, mimeType, "system");
    if (result && result.url) {
      console.log(`? [STORAGE] Upload conclu�do: ${result.url.substring(0, 80)}...`);
      return result.url;
    }
    console.warn(`?? [STORAGE] Upload retornou sem URL`);
    return null;
  } catch (error) {
    console.error(`? [STORAGE] Erro no upload:`, error);
    return null;
  }
}

// Cache manual de contatos para mapear @lid ? phoneNumber
interface Contact {
  id: string;
  lid?: string;
  phoneNumber?: string;
  name?: string;
}

interface WhatsAppSession {
  socket: WASocket | null;
  userId: string;
  connectionId: string;
  phoneNumber?: string;
  contactsCache: Map<string, Contact>;
  // -----------------------------------------------------------------------
  // FIX 2026-02-24: Track if connection actually reached "open" state
  // Prevents stuck connections where socket exists but never fully connected
  // -----------------------------------------------------------------------
  isOpen?: boolean;
  connectedAt?: number;   // timestamp when connection.update fired "open"
  createdAt?: number;     // timestamp when session was created
  openTimeout?: NodeJS.Timeout; // auto-reconnect if "open" never fires
}

interface AdminWhatsAppSession {
  socket: WASocket | null;
  adminId: string;
  phoneNumber?: string;
  contactsCache: Map<string, Contact>;
  // ??? SESSION STABILITY - Heartbeat and connection health
  lastHeartbeat?: number;
  heartbeatInterval?: NodeJS.Timeout;
  connectionHealth?: 'healthy' | 'degraded' | 'unhealthy';
  consecutiveDisconnects?: number;
}

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  adminId?: string;
}

// ---------------------------------------------------------------------------
// ?? MULTI-CONNECTION SESSION MAP
// ---------------------------------------------------------------------------
// Custom Map that stores sessions keyed by connectionId but also supports
// lookup by userId for backward compatibility. This enables multiple
// WhatsApp numbers per user account while keeping existing code working.
// ---------------------------------------------------------------------------
class SessionMap extends Map<string, WhatsAppSession> {
  private userIdIndex = new Map<string, Set<string>>(); // userId -> Set<connectionId>

  set(connectionId: string, session: WhatsAppSession): this {
    // Clean up old entry if connectionId was already mapped
    const oldSession = super.get(connectionId);
    if (oldSession) {
      this.userIdIndex.get(oldSession.userId)?.delete(connectionId);
    }
    super.set(connectionId, session);
    if (!this.userIdIndex.has(session.userId)) {
      this.userIdIndex.set(session.userId, new Set());
    }
    this.userIdIndex.get(session.userId)!.add(connectionId);
    return this;
  }

  delete(key: string): boolean {
    // Try direct delete by connectionId first
    if (super.has(key)) {
      const session = super.get(key)!;
      this.userIdIndex.get(session.userId)?.delete(key);
      if (this.userIdIndex.get(session.userId)?.size === 0) {
        this.userIdIndex.delete(session.userId);
      }
      return super.delete(key);
    }
    // Fallback: delete by userId (deletes first session found for that user)
    const connIds = this.userIdIndex.get(key);
    if (connIds && connIds.size > 0) {
      const firstConnId = connIds.values().next().value;
      if (firstConnId) {
        connIds.delete(firstConnId);
        if (connIds.size === 0) this.userIdIndex.delete(key);
        return super.delete(firstConnId);
      }
    }
    return false;
  }

  get(key: string): WhatsAppSession | undefined {
    // Direct lookup by connectionId
    const direct = super.get(key);
    if (direct) return direct;
    // Fallback: lookup by userId (returns first session found)
    const connIds = this.userIdIndex.get(key);
    if (connIds) {
      for (const connId of connIds) {
        const session = super.get(connId);
        if (session?.socket) return session; // prefer connected session
      }
      // If no connected one found, return any
      for (const connId of connIds) {
        const session = super.get(connId);
        if (session) return session;
      }
    }
    return undefined;
  }

  has(key: string): boolean {
    if (super.has(key)) return true;
    const connIds = this.userIdIndex.get(key);
    return !!connIds && connIds.size > 0;
  }

  // Get all sessions for a specific user
  getAllByUserId(userId: string): WhatsAppSession[] {
    const result: WhatsAppSession[] = [];
    const connIds = this.userIdIndex.get(userId);
    if (connIds) {
      for (const connId of connIds) {
        const session = super.get(connId);
        if (session) result.push(session);
      }
    }
    return result;
  }

  // Get all connectionIds for a user
  getConnectionIdsForUser(userId: string): string[] {
    const connIds = this.userIdIndex.get(userId);
    return connIds ? Array.from(connIds) : [];
  }

  // Delete all sessions for a specific user
  deleteAllByUserId(userId: string): number {
    const connIds = this.userIdIndex.get(userId);
    if (!connIds) return 0;
    let count = 0;
    for (const connId of Array.from(connIds)) {
      if (super.delete(connId)) count++;
    }
    this.userIdIndex.delete(userId);
    return count;
  }
}

const sessions = new SessionMap();
const adminSessions = new Map<string, AdminWhatsAppSession>();
const wsClients = new Map<string, Set<AuthenticatedWebSocket>>();
const adminWsClients = new Map<string, Set<AuthenticatedWebSocket>>();

// ??? SESSION STABILITY - Heartbeat configuration
const ADMIN_HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const ADMIN_MAX_CONSECUTIVE_DISCONNECTS = 3; // Maximum consecutive disconnects before alert
const ADMIN_RECONNECT_BACKOFF_BASE_MS = 5000; // Base 5 seconds
const ADMIN_RECONNECT_BACKOFF_MULTIPLIER = 2; // Exponential backoff multiplier

const DEFAULT_JID_SUFFIX = "s.whatsapp.net";

function getSessionWsReadyState(session?: WhatsAppSession): number | undefined {
  return (session?.socket as any)?.ws?.readyState;
}

function hasOperationalSocket(session?: WhatsAppSession): boolean {
  if (!session?.socket) {
    return false;
  }

  if (session.socket.user === undefined) {
    return false;
  }

  const wsReadyState = getSessionWsReadyState(session);
  return wsReadyState === undefined || wsReadyState === 1;
}

function isSessionReadyForMessaging(session?: WhatsAppSession): boolean {
  return hasOperationalSocket(session);
}

function promoteSessionOpenState(session: WhatsAppSession, reason: string): boolean {
  if (!isSessionReadyForMessaging(session)) {
    return false;
  }
  if (session.isOpen === true) {
    return false;
  }

  session.isOpen = true;
  session.connectedAt = session.connectedAt || Date.now();
  if (session.openTimeout) {
    clearTimeout(session.openTimeout);
    session.openTimeout = undefined;
  }
  console.log(`? [SESSION PROMOTE] conn ${session.connectionId.substring(0, 8)} marked isOpen=true via ${reason}`);
  return true;
}

// ?? Set para rastrear IDs de mensagens enviadas pelo agente/usu?rio via sendMessage
// Evita duplicatas quando Baileys dispara evento fromMe ap?s socket.sendMessage()
const agentMessageIds = new Set<string>();

// ?? Fun??o exportada para registrar messageIds de m?dias enviadas pelo agente
// Usado pelo mediaService para evitar que handleOutgoingMessage pause a IA incorretamente
export function registerAgentMessageId(messageId: string): void {
  if (messageId) {
    agentMessageIds.add(messageId);
    console.log(`?? [AGENT MSG] Registrado messageId do agente: ${messageId}`);
  }
}

// ?? Map para rastrear solicita??es de c?digo de pareamento em andamento
// Evita m?ltiplas solicita??es simult?neas para o mesmo usu?rio
const pendingPairingRequests = new Map<string, Promise<string | null>>();

// ?? Map para rastrear sess?es de pairing ativas com expira��o
// Se o usu�rio n�o digitar o c�digo em 3 minutos, limpa a sess�o automaticamente
interface PairingSession {
  startedAt: number;
  phone: string;
  codeIssuedAt?: number;
  expiresAt: number;
  timeoutId?: NodeJS.Timeout;
}
const pairingSessions = new Map<string, PairingSession>();
const PAIRING_SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos - WhatsApp �s vezes demora para achar a op��o

// -----------------------------------------------------------------------
// ?? PAIRING STATE MANAGER - Gerencia estado de pairing com restart autom�tico
// -----------------------------------------------------------------------
// Mant�m o estado do pairing entre restarts do socket (515 restartRequired)
// Permite reconex�o autom�tica sem perder o auth_pairing
// -----------------------------------------------------------------------
interface PairingState {
  userId: string;
  authPath: string;
  phone: string;
  code?: string;
  startedAt: number;
  expiresAt: number;
  retryCount: number;
  lastRetryAt: number;
  isRestarting: boolean;
  socketRef?: any;  // Refer�ncia ao socket atual
  sessionRef?: WhatsAppSession;  // Refer�ncia � sess�o atual
}
const pairingStateMap = new Map<string, PairingState>();

// Fun��es auxiliares do pairing manager
function getPairingState(userId: string): PairingState | undefined {
  return pairingStateMap.get(userId);
}

function setPairingState(userId: string, state: Partial<PairingState>): PairingState {
  const current = pairingStateMap.get(userId) || {
    userId,
    authPath: '',
    phone: '',
    startedAt: Date.now(),
    expiresAt: Date.now() + PAIRING_SESSION_TIMEOUT_MS,
    retryCount: 0,
    lastRetryAt: 0,
    isRestarting: false,
  };

  const updated = { ...current, ...state };
  pairingStateMap.set(userId, updated);
  return updated;
}

function clearPairingState(userId: string): void {
  pairingStateMap.delete(userId);
}

function isPairingExpired(userId: string): boolean {
  const state = pairingStateMap.get(userId);
  if (!state) return true;
  return Date.now() > state.expiresAt;
}

// ?? Map para controle de cooldown de rate limit (429)
// Quando o WhatsApp retorna rate limit, bloqueia novas tentativas por X minutos
const pairingRateLimitCooldown = new Map<string, { until: number; statusCode: number }>();
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutos de cooldown

// ?? Map para controle de retries de pairing (para tratar 515 restartRequired)
// Quando o Baileys fecha com 515, precisamos reconectar mantendo o mesmo auth
const pairingRetries = new Map<string, { count: number; lastAttempt: number }>();
const MAX_PAIRING_RETRIES = 5; // M�ximo de restarts permitidos
const PAIRING_RETRY_COOLDOWN_MS = 10000; // 10 segundos entre retries

// ?? Map para rastrear conex?es em andamento
// Evita m?ltiplas tentativas de conex?o simult?neas para o mesmo usu?rio
// FIX 2026-02-24: Evolu�do de Map<string, Promise<void>> para estrutura com metadata + TTL
interface PendingConnectionEntry {
  promise: Promise<void>;
  startedAt: number;
  connectionId?: string;
  userId: string;
  distributedLock?: DistributedLockHandle;
  distributedLockRefresh?: NodeJS.Timeout;
}
const pendingConnections = new Map<string, PendingConnectionEntry>();
const PENDING_LOCK_TTL_MS = 90_000; // 90 seconds � lock expires after this
const WA_REDIS_CONNECT_LOCK_ENABLED = process.env.WA_REDIS_CONNECT_LOCK !== "false";
const WA_REDIS_PENDING_LOCK_PREFIX = process.env.WA_REDIS_PENDING_LOCK_PREFIX || "wa:connect:lock:";
const WA_REDIS_COOLDOWN_PREFIX = process.env.WA_REDIS_COOLDOWN_PREFIX || "wa:open-timeout:";
const WA_REDIS_PENDING_CRON_LOCK_KEY =
  process.env.WA_REDIS_PENDING_CRON_LOCK_KEY || "wa:pending-cron:lock";
const WA_REDIS_PENDING_CRON_LOCK_TTL_MS = Math.max(
  Number(process.env.WA_REDIS_PENDING_CRON_LOCK_TTL_MS || 90_000),
  30_000,
);
const WA_REDIS_PENDING_LOCK_EXTRA_MS = Math.max(
  Number(process.env.WA_REDIS_PENDING_LOCK_EXTRA_MS || 30_000),
  5_000,
);
const WA_REDIS_PENDING_LOCK_REFRESH_MS = Math.max(
  Number(process.env.WA_REDIS_PENDING_LOCK_REFRESH_MS || 30_000),
  5_000,
);
const CONNECT_OPEN_TIMEOUT_MS = Math.max(
  Number(process.env.WA_CONNECT_OPEN_TIMEOUT_MS || 120_000),
  60_000
); // wait for "open" before failing the connect promise
const RESTORE_CONNECT_OPEN_TIMEOUT_MS = Math.max(
  Number(process.env.WA_RESTORE_CONNECT_OPEN_TIMEOUT_MS || 90_000),
  30_000
); // balanced timeout for restore: avoid false timeout without stalling queue too long
const RESTORE_BATCH_SIZE = Math.max(
  Number(process.env.WA_RESTORE_BATCH_SIZE || 1),
  1
);
const RESTORE_BATCH_DELAY_MS = Math.max(
  Number(process.env.WA_RESTORE_BATCH_DELAY_MS || 2000),
  0
);
const RESTORE_GUARD_MAX_BLOCK_MS = Math.max(
  Number(process.env.WA_RESTORE_GUARD_MAX_BLOCK_MS || 120_000),
  60_000
); // health-check can run after this even if restore still running
const RESTORE_CONNECTED_ONLY = process.env.WA_RESTORE_CONNECTED_ONLY !== "false";
const RESTORE_RECENT_GRACE_MS = Math.max(
  Number(process.env.WA_RESTORE_RECENT_GRACE_MS || 15 * 60 * 1000),
  0
);
const OPEN_TIMEOUT_RETRY_COOLDOWN_MS = Math.max(
  Number(process.env.WA_OPEN_TIMEOUT_RETRY_COOLDOWN_MS || 180_000),
  30_000
);
const openTimeoutRetryUntil = new Map<string, number>();
const OPEN_TIMEOUT_COOLDOWN_SOURCES = new Set([
  "restore",
  "health_check",
  "pending_cron",
  "auto_recovery",
]);

function toDistributedPendingLockKey(lockKey: string): string {
  return `${WA_REDIS_PENDING_LOCK_PREFIX}${lockKey}`;
}

function toDistributedCooldownKey(scopeKey: string): string {
  return `${WA_REDIS_COOLDOWN_PREFIX}${scopeKey}`;
}

function stopDistributedLockRefresh(lockKey: string, entry?: PendingConnectionEntry): void {
  const targetEntry = entry || pendingConnections.get(lockKey);
  if (targetEntry?.distributedLockRefresh) {
    clearInterval(targetEntry.distributedLockRefresh);
    targetEntry.distributedLockRefresh = undefined;
  }
}

function releaseDistributedPendingLock(lockKey: string, reason: string, entry?: PendingConnectionEntry): void {
  const targetEntry = entry || pendingConnections.get(lockKey);
  if (!targetEntry?.distributedLock) {
    return;
  }

  const lock = targetEntry.distributedLock;
  targetEntry.distributedLock = undefined;
  stopDistributedLockRefresh(lockKey, targetEntry);

  void releaseDistributedLock(lock)
    .then((released) => {
      if (released) {
        console.log(
          `?? [PENDING LOCK][REDIS] Released distributed lock for ${lockKey.substring(0, 8)}... (${reason})`,
        );
      }
    })
    .catch((err) => {
      console.warn(
        `?? [PENDING LOCK][REDIS] Failed to release distributed lock for ${lockKey.substring(0, 8)}... (${reason}):`,
        err,
      );
    });
}

function registerDistributedPendingLockRefresh(
  lockKey: string,
  entry: PendingConnectionEntry,
  ttlMs: number,
): void {
  if (!entry.distributedLock) {
    return;
  }

  const refreshIntervalMs = Math.max(
    Math.min(Math.floor(ttlMs / 2), WA_REDIS_PENDING_LOCK_REFRESH_MS),
    5_000,
  );

  entry.distributedLockRefresh = setInterval(async () => {
    if (!entry.distributedLock) {
      return;
    }
    const refreshed = await refreshDistributedLock(entry.distributedLock, ttlMs);
    if (!refreshed) {
      console.warn(
        `?? [PENDING LOCK][REDIS] Lock refresh lost for ${lockKey.substring(0, 8)}...`,
      );
      stopDistributedLockRefresh(lockKey, entry);
    }
  }, refreshIntervalMs);
  entry.distributedLockRefresh.unref?.();
}

/**
 * Helper unificado para limpar lock de conex�o pendente.
 * Chamado em: conn=open, conn=close, 440 conflict, catch, health check.
 */
function clearPendingConnectionLock(lockKey: string, reason: string): void {
  const entry = pendingConnections.get(lockKey);
  if (entry) {
    stopDistributedLockRefresh(lockKey, entry);
    pendingConnections.delete(lockKey);
    releaseDistributedPendingLock(lockKey, reason, entry);
    console.log(`?? [PENDING LOCK] Cleared lock for ${lockKey.substring(0, 8)}... reason: ${reason}`);
  }
}

/**
 * Check and evict stale pending connection locks (older than TTL).
 * Called at the start of connectWhatsApp and in health check.
 */
function evictStalePendingLocks(): number {
  let evicted = 0;
  const now = Date.now();
  for (const [key, entry] of pendingConnections.entries()) {
    if (now - entry.startedAt > PENDING_LOCK_TTL_MS) {
      console.log(`?? [PENDING LOCK] STALE_EVICTED: ${key.substring(0, 8)}... age=${Math.round((now - entry.startedAt) / 1000)}s > TTL=${PENDING_LOCK_TTL_MS / 1000}s`);
      stopDistributedLockRefresh(key, entry);
      releaseDistributedPendingLock(key, "stale_evicted", entry);
      pendingConnections.delete(key);
      evicted++;
    }
  }
  return evicted;
}

function shouldApplyOpenTimeoutCooldown(source?: string): boolean {
  if (!source) return false;
  if (OPEN_TIMEOUT_COOLDOWN_SOURCES.has(source)) return true;
  return source.startsWith("pending_") || source.startsWith("health_");
}

function getOpenTimeoutCooldownRemainingMs(scopeKey: string): number {
  const until = openTimeoutRetryUntil.get(scopeKey);
  if (!until) return 0;
  const remaining = until - Date.now();
  if (remaining <= 0) {
    openTimeoutRetryUntil.delete(scopeKey);
    return 0;
  }
  return remaining;
}

async function getMaxOpenTimeoutCooldownRemainingMs(scopeKeys: string[]): Promise<number> {
  const localRemaining = scopeKeys.reduce(
    (max, key) => Math.max(max, getOpenTimeoutCooldownRemainingMs(key)),
    0,
  );

  if (!isRedisAvailable()) {
    return localRemaining;
  }

  let remoteRemaining = 0;
  for (const key of scopeKeys) {
    const ttl = await getDistributedKeyRemainingMs(toDistributedCooldownKey(key));
    if (ttl > remoteRemaining) {
      remoteRemaining = ttl;
    }
  }

  return Math.max(localRemaining, remoteRemaining);
}

function registerOpenTimeoutCooldown(scopeKey: string, reason: string): void {
  const until = Date.now() + OPEN_TIMEOUT_RETRY_COOLDOWN_MS;
  openTimeoutRetryUntil.set(scopeKey, until);
  void setDistributedExpiringKey(
    toDistributedCooldownKey(scopeKey),
    reason || "open_timeout",
    OPEN_TIMEOUT_RETRY_COOLDOWN_MS,
  );
  console.log(
    `? [OPEN TIMEOUT COOLDOWN] ${scopeKey.substring(0, 8)}... paused for ${Math.round(
      OPEN_TIMEOUT_RETRY_COOLDOWN_MS / 1000,
    )}s (reason=${reason})`,
  );
}

function clearOpenTimeoutCooldown(scopeKey: string, reason: string): void {
  void clearDistributedKey(toDistributedCooldownKey(scopeKey));
  if (openTimeoutRetryUntil.delete(scopeKey)) {
    console.log(`? [OPEN TIMEOUT COOLDOWN] Cleared for ${scopeKey.substring(0, 8)}... (reason=${reason})`);
  }
}

// ?? Map para rastrear tentativas de reconex?o e evitar loops infinitos
interface ReconnectAttempt {
  count: number;
  lastAttempt: number;
}
const reconnectAttempts = new Map<string, ReconnectAttempt>();
const MAX_RECONNECT_ATTEMPTS = 5;
// Back-off exponencial: 5s, 15s, 45s, 2min, 5min (NUNCA resetar contador)
const RECONNECT_BACKOFF_MS = [5000, 15000, 45000, 120000, 300000];

// =========================================================================
// FIX 2026-02-25: OBSERVABILITY COUNTERS
// Simple counters for monitoring key events. Logged periodically.
// =========================================================================
const waObservability = {
  conflict440Count: 0,
  connectionClosedSendFail: 0,
  recoveryPgrst116Count: 0,
  restoreDedupSkipped: 0,
  reconnectAttemptTotal: 0,
  // FIX 2026-02-24: Pending AI response metrics
  pendingAI_cronProcessed: 0,
  pendingAI_cronSkipped: 0,
  pendingAI_staleFailedOver24h: 0,
  pendingAI_connectionClosedRetries: 0,
  pendingAI_maxRetriesExhausted: 0,
  startTime: Date.now(),
};

// Log observability counters every 5 minutes
setInterval(() => {
  const uptimeMin = Math.floor((Date.now() - waObservability.startTime) / 60000);
  const hasActivity = waObservability.conflict440Count > 0 || waObservability.recoveryPgrst116Count > 0 || 
    waObservability.restoreDedupSkipped > 0 || waObservability.pendingAI_cronProcessed > 0 || 
    waObservability.pendingAI_staleFailedOver24h > 0 || waObservability.pendingAI_maxRetriesExhausted > 0;
  if (hasActivity) {
    console.log(`[WA_METRICS] uptime=${uptimeMin}min 440=${waObservability.conflict440Count} pgrst116=${waObservability.recoveryPgrst116Count} dedup=${waObservability.restoreDedupSkipped} reconnect=${waObservability.reconnectAttemptTotal} send_fail_closed=${waObservability.connectionClosedSendFail} pending_processed=${waObservability.pendingAI_cronProcessed} pending_skipped=${waObservability.pendingAI_cronSkipped} pending_stale_24h=${waObservability.pendingAI_staleFailedOver24h} pending_max_retries=${waObservability.pendingAI_maxRetriesExhausted} pending_conn_closed_retries=${waObservability.pendingAI_connectionClosedRetries}`);
  }
}, 5 * 60 * 1000);

// ?? RESTORE GUARD: Prevent health check from killing sessions during restore
let _isRestoringInProgress = false;
let _restoreStartedAt = 0;
let _isAdminRestoringInProgress = false;

// Export function to check if restore is in progress (used by API endpoints)
export function isRestoringInProgress(): boolean {
  return _isRestoringInProgress;
}

// ?? Map para rastrear auto-retry ap�s logout (QR Code)
// Permite um �nico auto-retry quando auth inv�lido causa logout imediato
interface LogoutAutoRetry {
  count: number;
  lastAttempt: number;
}
const logoutAutoRetry = new Map<string, LogoutAutoRetry>();
const LOGOUT_AUTO_RETRY_COOLDOWN_MS = 60000; // 60 segundos
const MAX_LOGOUT_AUTO_RETRY = 1; // Apenas 1 tentativa autom�tica

// ?? Iniciar polling de mensagens n�o processadas
// (vari�veis necess�rias j� foram declaradas acima)
startMissedMessagePolling();

// ?? SISTEMA DE RECUPERA��O: Registrar callback de processamento
// Este callback ser� usado pelo pendingMessageRecoveryService para reprocessar
// mensagens que n�o foram processadas durante instabilidade/deploys
// NOTA: O registerMessageProcessor j� foi importado no topo do arquivo junto
// com outras fun��es do pendingMessageRecoveryService.
// A fun��o handleIncomingMessage precisa estar definida primeiro
// O registro � feito no final do arquivo via setTimeout para garantir ordem

// -----------------------------------------------------------------------
// ?? CACHE DE AGENDA - OTIMIZA��O PARA ENVIO EM MASSA
// -----------------------------------------------------------------------
// Contatos do WhatsApp s?o armazenados APENAS em mem?ria (n?o no banco)
// Isso evita crescimento exponencial do Supabase e otimiza Egress/Disk IO
// Cliente sincroniza sob demanda quando precisa usar Envio em Massa
// -----------------------------------------------------------------------
interface AgendaContact {
  id: string;
  phoneNumber: string;
  name: string;
  lid?: string;
}

interface AgendaCacheEntry {
  contacts: AgendaContact[];
  syncedAt: Date;
  expiresAt: Date;
  status: 'syncing' | 'ready' | 'error';
  error?: string;
}

// Cache global de contatos da agenda (expira em 2 HORAS)
// N?o deixa o site lento - ? apenas um Map em mem?ria
// Impacto: ~1KB por 1000 contatos (muito leve)
const agendaContactsCache = new Map<string, AgendaCacheEntry>();
const AGENDA_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 HORAS (antes era 30 min)

// Exportar fun??o para obter contatos da agenda do cache
export function getAgendaContacts(userId: string): AgendaCacheEntry | undefined {
  const cached = agendaContactsCache.get(userId);
  if (cached && cached.expiresAt > new Date()) {
    return cached;
  }
  // Cache expirado, remover
  if (cached) {
    agendaContactsCache.delete(userId);
  }
  return undefined;
}

// Fun??o para salvar contatos no cache (chamada quando contacts.upsert dispara)
function saveAgendaToCache(userId: string, contacts: AgendaContact[]): void {
  const now = new Date();
  agendaContactsCache.set(userId, {
    contacts,
    syncedAt: now,
    expiresAt: new Date(now.getTime() + AGENDA_CACHE_TTL_MS),
    status: 'ready',
  });
  console.log(`?? [AGENDA CACHE] Salvou ${contacts.length} contatos para user ${userId} (expira em 2 HORAS)`);
}

// Fun??o para marcar sync como iniciado
export function markAgendaSyncing(userId: string): void {
  agendaContactsCache.set(userId, {
    contacts: [],
    syncedAt: new Date(),
    expiresAt: new Date(Date.now() + AGENDA_CACHE_TTL_MS),
    status: 'syncing',
  });
}

// Fun??o para marcar sync como erro
export function markAgendaError(userId: string, error: string): void {
  agendaContactsCache.set(userId, {
    contacts: [],
    syncedAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min em caso de erro
    status: 'error',
    error,
  });
}

// ===== NOVA: Fun??o para popular agenda do cache da sess?o =====
// Chamada quando usu?rio clica em "Sincronizar Agenda" e n?o tem cache
// Busca contatos do contactsCache da sess?o (j? carregados do WhatsApp)
export function syncAgendaFromSessionCache(userId: string): { success: boolean; count: number; message: string } {
  const session = sessions.get(userId);
  
  if (!session) {
    return {
      success: false,
      count: 0,
      message: '? WhatsApp n?o est? conectado. Conecte primeiro para sincronizar a agenda.',
    };
  }
  
  if (!session.contactsCache || session.contactsCache.size === 0) {
    // Cache vazio - salvar com 0 contatos e status ready
    // Isso evita ficar eternamente em 'syncing'
    saveAgendaToCache(userId, []);
    console.log(`?? [AGENDA SYNC] Cache da sess?o est? vazio - salvou cache com 0 contatos`);
    return {
      success: true,
      count: 0,
      message: '?? Nenhum contato encontrado no momento. Os contatos ser?o carregados automaticamente quando chegarem do WhatsApp.',
    };
  }
  
  console.log(`?? [AGENDA SYNC DEBUG] session.contactsCache tem ${session.contactsCache.size} entradas`);
  
  // Converter contactsCache para AgendaContact[]
  const agendaContacts: AgendaContact[] = [];
  const seenPhones = new Set<string>();
  let skippedCount = 0;
  
  session.contactsCache.forEach((contact, key) => {
    // Extrair phoneNumber do contact ou do key
    let phoneNumber = contact.phoneNumber || null;
    
    // Se n?o tem phoneNumber, tentar extrair do contact.id
    if (!phoneNumber && contact.id) {
      // Tentar formato: 5511999887766@s.whatsapp.net
      const match1 = contact.id.match(/^(\d{8,15})@s\.whatsapp\.net$/);
      if (match1) {
        phoneNumber = match1[1];
      } else {
        // Tentar formato gen?rico: n?meros@qualquercoisa
        const match2 = contact.id.match(/^(\d+)@/);
        if (match2 && match2[1].length >= 8) {
          phoneNumber = match2[1];
        }
      }
    }
    
    // Se ainda n?o tem, tentar extrair da key do Map
    if (!phoneNumber && key) {
      const match1 = key.match(/^(\d{8,15})@s\.whatsapp\.net$/);
      if (match1) {
        phoneNumber = match1[1];
      } else {
        const match2 = key.match(/^(\d+)@/);
        if (match2 && match2[1].length >= 8) {
          phoneNumber = match2[1];
        }
      }
    }
    
    // Evitar duplicatas e validar n?mero
    if (phoneNumber && phoneNumber.length >= 8 && !seenPhones.has(phoneNumber)) {
      seenPhones.add(phoneNumber);
      agendaContacts.push({
        id: contact.id || key,
        phoneNumber: phoneNumber,
        name: contact.name || '',
        lid: contact.lid,
      });
    } else {
      skippedCount++;
      if (skippedCount <= 5) {
        console.log(`?? [AGENDA SYNC DEBUG] Pulou contato - id: ${contact.id}, key: ${key}, phoneNumber: ${contact.phoneNumber}, name: ${contact.name}`);
      }
    }
  });
  
  console.log(`?? [AGENDA SYNC DEBUG] Processou ${agendaContacts.length} contatos, pulou ${skippedCount}`);
  
  // SEMPRE salvar no cache, mesmo que vazio - isso evita ficar preso em 'syncing'
  saveAgendaToCache(userId, agendaContacts);
  
  if (agendaContacts.length > 0) {
    console.log(`?? [AGENDA SYNC] Populou cache com ${agendaContacts.length} contatos da sess?o`);
    return {
      success: true,
      count: agendaContacts.length,
      message: `? ${agendaContacts.length} contatos carregados da agenda!`,
    };
  }
  
  // Se processou mas n?o encontrou nenhum, retornar ready com 0 contatos
  console.log(`?? [AGENDA SYNC] Nenhum contato encontrado no cache da sess?o (size: ${session.contactsCache.size})`);
  return {
    success: true,
    count: 0,
    message: '?? Nenhum contato encontrado. Os contatos ser?o carregados automaticamente quando chegarem do WhatsApp.',
  };
}

// ?? MODO DESENVOLVIMENTO: Desabilita processamento de mensagens em localhost
// ?til quando Railway est? rodando em produ??o e voc? quer desenvolver sem conflitos
// Defina DISABLE_WHATSAPP_PROCESSING=true no .env para ativar
const DISABLE_MESSAGE_PROCESSING = process.env.DISABLE_WHATSAPP_PROCESSING === 'true';

if (DISABLE_MESSAGE_PROCESSING) {
  console.log(`\n?? [DEV MODE] ?????????????????????????????????????????????????????`);
  console.log(`?? [DEV MODE] PROCESSAMENTO DE MENSAGENS WHATSAPP DESABILITADO`);
  console.log(`?? [DEV MODE] Isso evita conflitos com servidor de produ??o (Railway)`);
  console.log(`?? [DEV MODE] Para reativar, remova DISABLE_WHATSAPP_PROCESSING do .env`);
  console.log(`?? [DEV MODE] ?????????????????????????????????????????????????????\n`);
}

// ?? SISTEMA DE ACUMULA??O DE MENSAGENS
// Rastreia timeouts pendentes e mensagens acumuladas por conversa
interface PendingResponse {
  timeout: NodeJS.Timeout;
  messages: string[];
  conversationId: string;
  userId: string;
  connectionId?: string;
  contactNumber: string;
  jidSuffix: string;
  startTime: number;
  isProcessing?: boolean; // ?? FLAG ANTI-DUPLICA??O
  isCTWAFallback?: boolean; // ?? Flag: mensagem veio de Meta Ads (CTWA) e PDO falhou - IA deve tratar como sauda��o de interesse
}
const pendingResponses = new Map<string, PendingResponse>(); // key: conversationId

// ?? ANTI-DUPLICA��O: Map para rastrear conversas em processamento (value = timestamp)
// Evita que m�ltiplos timeouts processem a mesma conversa simultaneamente
// Agora com TTL: se uma conversa ficar presa por mais de PROCESSING_TTL_MS, � liberada
const conversationsBeingProcessed = new Map<string, number>();
const PROCESSING_TTL_MS = 120_000; // 2 minutos � m�ximo esperado para processar IA

// -----------------------------------------------------------------------
// FIX 2026-02-24: RETRY COUNTER for Connection Closed errors
// Tracks how many times a conversation has been retried due to send failures.
// After MAX_SEND_RETRIES, the timer is marked as failed to prevent infinite loops.
// Entries are cleaned up when a timer completes or fails.
// -----------------------------------------------------------------------
const pendingRetryCounter = new Map<string, number>(); // key: conversationId ? retry count
const MAX_SEND_RETRIES = 12; // Max 12 retries with exponential backoff

const SESSION_AVAILABLE_RETRY_MS = 30 * 1000;
const SESSION_UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;
const SESSION_UNAVAILABLE_MAX_AGE_MS = 30 * 60 * 1000;
// ? FIX: Retry r�pido quando erro � Connection Closed (socket reconectando)
const CONNECTION_CLOSED_RETRY_MS = 5 * 1000; // 5 segundos
const SESSION_RECOVERY_ATTEMPT_COOLDOWN_MS = 60 * 1000; // evita storm de reconnect por timer
const sessionRecoveryAttemptAt = new Map<string, number>(); // key: connectionId or userId

// -----------------------------------------------------------------------
// ?? IMPLEMENTA��O REAL: checkForMissedMessages
// -----------------------------------------------------------------------
// Agora que pendingResponses e conversationsBeingProcessed foram declarados,
// podemos implementar a fun��o real.
// -----------------------------------------------------------------------
checkForMissedMessages = async function(session: WhatsAppSession): Promise<void> {
  if (!session.socket || !session.isConnected) return;
  
  const { userId, connectionId } = session;
  
  // Rate limit: verificar apenas a cada 45 segundos por sess�o
  const lastCheck = lastMissedMessageCheck.get(userId) || 0;
  if (Date.now() - lastCheck < 45000) return;
  lastMissedMessageCheck.set(userId, Date.now());
  
  try {
    // 1. Buscar conversas com mensagens recentes (�ltimos 5 minutos)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const { pool } = await import("./db");
    const result = await pool.query(`
      SELECT 
        c.id as conversation_id,
        c.contact_number,
        c.jid_suffix,
        m.id as message_id,
        m.text,
        m.timestamp,
        m.from_me
      FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      WHERE c.connection_id = $1
        AND m.timestamp > $2
        AND m.from_me = false
        AND NOT EXISTS (
          SELECT 1 FROM messages m2 
          WHERE m2.conversation_id = c.id 
            AND m2.from_me = true 
            AND m2.timestamp > m.timestamp
        )
        AND NOT EXISTS (
          SELECT 1 FROM agent_disabled_conversations adc
          WHERE adc.conversation_id = c.id
        )
      ORDER BY m.timestamp DESC
      LIMIT 10
    `, [connectionId, fiveMinutesAgo.toISOString()]);
    
    if (result.rows.length === 0) return;
    
    // 2. Verificar config do agente
    const agentConfig = await storage.getAgentConfig(userId);
    if (!agentConfig?.isActive) return;
    
    // 3. Processar mensagens n�o respondidas
    for (const row of result.rows) {
      const cacheKey = `${row.conversation_id}_${row.message_id}`;
      
      // Evitar reprocessar mensagens j� detectadas
      if (detectedMissedMessages.has(cacheKey)) continue;
      detectedMissedMessages.add(cacheKey);
      
      // Limpar cache antigo (manter �ltimas 1000 entradas)
      if (detectedMissedMessages.size > 1000) {
        const entries = Array.from(detectedMissedMessages);
        entries.slice(0, 500).forEach(e => detectedMissedMessages.delete(e));
      }
      
      // Verificar se j� tem resposta pendente
      if (pendingResponses.has(row.conversation_id)) {
        console.log(`?? [MISSED MSG] ${row.contact_number} - J� tem resposta pendente`);
        continue;
      }
      
      // Verificar se est� sendo processada
      if (conversationsBeingProcessed.has(row.conversation_id)) {
        console.log(`?? [MISSED MSG] ${row.contact_number} - Em processamento`);
        continue;
      }
      
      console.log(`\n?? [MISSED MSG] MENSAGEM N�O PROCESSADA DETECTADA!`);
      console.log(`   ?? Contato: ${row.contact_number}`);
      console.log(`   ?? Mensagem: "${(row.text || '[m�dia]').substring(0, 50)}..."`);
      console.log(`   ? Enviada em: ${row.timestamp}`);
      console.log(`   ?? Triggando resposta da IA...`);
      
      // Agendar resposta com delay
      const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
      
      const pending: PendingResponse = {
        timeout: null as any,
        messages: [row.text || '[m�dia recebida]'],
        conversationId: row.conversation_id,
        userId,
        connectionId,
        contactNumber: row.contact_number,
        jidSuffix: row.jid_suffix || DEFAULT_JID_SUFFIX,
        startTime: Date.now(),
      };
      
      pending.timeout = setTimeout(async () => {
        console.log(`?? [MISSED MSG] Processando resposta para ${row.contact_number}`);
        await processAccumulatedMessages(pending);
      }, responseDelaySeconds * 1000);
      
      pendingResponses.set(row.conversation_id, pending);
      console.log(`   ? Resposta agendada em ${responseDelaySeconds}s\n`);
    }
    
  } catch (error) {
    // Silenciar erros para n�o poluir logs
    if ((error as any).code !== 'ECONNREFUSED') {
      console.error(`? [MISSED MSG] Erro na verifica��o:`, error);
    }
  }
};

// ?? ANTI-DUPLICA��O: Cache de mensagens recentes enviadas (�ltimos 5 minutos)
// Evita enviar mensagens id?nticas em sequ?ncia
const recentlySentMessages = new Map<string, { text: string; timestamp: number }[]>();

// Limpar cache de mensagens enviadas a cada 5 minutos
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [convId, messages] of recentlySentMessages.entries()) {
    const filtered = messages.filter(m => m.timestamp > fiveMinutesAgo);
    if (filtered.length === 0) {
      recentlySentMessages.delete(convId);
    } else {
      recentlySentMessages.set(convId, filtered);
    }
  }
}, 60 * 1000);

// ?? Fun??o para verificar se mensagem ? duplicata recente
function isRecentDuplicate(conversationId: string, text: string): boolean {
  const recent = recentlySentMessages.get(conversationId) || [];
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
  
  for (const msg of recent) {
    if (msg.timestamp > twoMinutesAgo && msg.text === text) {
      return true;
    }
  }
  return false;
}

// ?? Fun??o para registrar mensagem enviada
function registerSentMessageCache(conversationId: string, text: string): void {
  const recent = recentlySentMessages.get(conversationId) || [];
  recent.push({ text, timestamp: Date.now() });
  // Manter apenas ?ltimas 10 mensagens
  if (recent.length > 10) recent.shift();
  recentlySentMessages.set(conversationId, recent);
}

// ?? SISTEMA DE ACUMULA??O (ADMIN AUTO-ATENDIMENTO)
interface PendingAdminResponse {
  timeout: NodeJS.Timeout | null;
  messages: string[];
  remoteJid: string;
  contactNumber: string;
  generation: number;
  startTime: number;
  conversationId?: string;
  lastKnownPresence?: string;
  lastPresenceUpdate?: number;
}
const pendingAdminResponses = new Map<string, PendingAdminResponse>(); // key: contactNumber

// ?? Set para rastrear conversas j? verificadas na sess?o atual (evita reprocessamento)
const checkedConversationsThisSession = new Set<string>();

// -----------------------------------------------------------------------
// ??? SISTEMA ANTI-BLOQUEIO v4.0 - Registro do Callback de Envio Real
// -----------------------------------------------------------------------
// Esta fun��o � chamada pelo messageQueueService para enviar mensagens reais
// O callback permite que a fila controle o timing entre mensagens
// ?? v4.0: Agora simula "digitando..." antes de enviar para parecer mais humano
// ?? v4.1: Wait-for-reconnect � se a sess�o est� reconectando, espera at� 15s
async function internalSendMessageRaw(
  userId: string, 
  jid: string, 
  text: string, 
  options?: { isFromAgent?: boolean; conversationId?: string; connectionId?: string }
): Promise<string | null> {
  const SEND_WAIT_MAX_MS = 15_000; // m�x 15s esperando reconex�o
  const SEND_WAIT_INTERVAL_MS = 2_000; // checar a cada 2s
  const RECOVERY_WAIT_MS = 8_000;

  const isConnectionClosedError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error || "");
    return /connection closed/i.test(message);
  };

  const resolveReadySession = (preferredConnectionId?: string): WhatsAppSession | undefined => {
    if (preferredConnectionId) {
      return sessions.get(preferredConnectionId);
    }

    const userSessions = sessions.getAllByUserId(userId);
    const readySessions = userSessions.filter((session) => isSessionReadyForMessaging(session));

    if (readySessions.length === 1) {
      return readySessions[0];
    }

    if (readySessions.length > 1) {
      console.warn(
        `?? [SEND] Multiple ready sessions for user ${userId.substring(0, 8)}... without connectionId context. Blocking ambiguous send.`,
      );
      return undefined;
    }

    if (userSessions.length === 1) {
      return userSessions[0];
    }

    if (userSessions.length > 1) {
      console.warn(
        `?? [SEND] Multiple sessions for user ${userId.substring(0, 8)}... without connectionId context. Blocking ambiguous send.`,
      );
      return undefined;
    }

    return undefined;
  };

  const waitForReadySession = async (
    preferredConnectionId?: string,
    maxWaitMs: number = SEND_WAIT_MAX_MS
  ): Promise<WhatsAppSession | undefined> => {
    let candidate = resolveReadySession(preferredConnectionId);
    if (isSessionReadyForMessaging(candidate)) {
      return candidate;
    }

    const startWait = Date.now();
    console.log(`? [SEND] Sess�o indispon�vel para ${userId.substring(0, 8)}... � aguardando reconex�o (m�x ${Math.round(maxWaitMs / 1000)}s)`);
    while (Date.now() - startWait < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, SEND_WAIT_INTERVAL_MS));
      candidate = resolveReadySession(preferredConnectionId);
      if (isSessionReadyForMessaging(candidate)) {
        console.log(`? [SEND] Sess�o reconectada para ${userId.substring(0, 8)}... ap�s ${Math.round((Date.now() - startWait) / 1000)}s`);
        return candidate;
      }
    }

    return candidate;
  };

  let resolvedConnectionId = options?.connectionId;

  if (!resolvedConnectionId && options?.conversationId) {
    try {
      const conversation = await storage.getConversation(options.conversationId);
      resolvedConnectionId = conversation?.connectionId;
    } catch (error) {
      console.warn(`?? [SEND] Falha ao resolver connectionId por conversationId (${options.conversationId}):`, error);
    }
  }

  if (!resolvedConnectionId) {
    const userConnections = await storage.getConnectionsByUserId(userId);
    if (userConnections.length === 1) {
      resolvedConnectionId = userConnections[0].id;
    } else if (userConnections.length > 1) {
      console.warn(
        `?? [SEND] Ambiguous connection context for user ${userId.substring(0, 8)}... ` +
        `(${userConnections.length} connections). conversationId/connectionId obrigat�rio para evitar envio no n�mero errado.`,
      );
      throw new Error("Ambiguous connection context: conversationId or connectionId required");
    } else {
      const fallbackConnection = await storage.getConnectionByUserId(userId);
      resolvedConnectionId = fallbackConnection?.id;
    }
  }

  const sendWithSession = async (activeSession: WhatsAppSession, attemptReason: string): Promise<string | null> => {
    promoteSessionOpenState(activeSession, attemptReason);
    if (!activeSession.socket) {
      throw new Error("WhatsApp not connected");
    }

    const wsBeforeTyping = getSessionWsReadyState(activeSession);
    if (wsBeforeTyping !== undefined && wsBeforeTyping !== 1) {
      throw new Error("Connection Closed");
    }

    // ?? v4.0 ANTI-BAN: Simular "digitando..." antes de enviar
    try {
      const typingDuration = antiBanProtectionService.calculateTypingDuration(text.length);
      await activeSession.socket.sendPresenceUpdate('composing', jid);
      console.log(`??? [ANTI-BAN] ?? Simulando digita��o por ${Math.round(typingDuration/1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, typingDuration));
      await activeSession.socket.sendPresenceUpdate('paused', jid);
      const finalDelay = 500 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, finalDelay));
    } catch (err) {
      // N�o falhar se n�o conseguir enviar status de digita��o
      console.log(`??? [ANTI-BAN] ?? N�o foi poss�vel enviar status de digita��o:`, err);
    }

    const wsBeforeSend = getSessionWsReadyState(activeSession);
    if (wsBeforeSend !== undefined && wsBeforeSend !== 1) {
      throw new Error("Connection Closed");
    }

    const sentMessage = await activeSession.socket.sendMessage(jid, { text });

    if (sentMessage?.key.id) {
      agentMessageIds.add(sentMessage.key.id);
      if (sentMessage.message) {
        cacheMessage(userId, sentMessage.key.id, sentMessage.message);
      } else {
        cacheMessage(userId, sentMessage.key.id, { conversation: text });
      }
      console.log(`??? [ANTI-BLOCK] ? Mensagem enviada - ID: ${sentMessage.key.id}`);
    }

    return sentMessage?.key.id || null;
  };

  const initialSession = await waitForReadySession(resolvedConnectionId);
  if (!initialSession?.socket) {
    throw new Error("WhatsApp not connected");
  }
  if (!isSessionReadyForMessaging(initialSession)) {
    throw new Error("Connection Closed");
  }

  try {
    return await sendWithSession(initialSession, 'send_path_ready');
  } catch (error) {
    if (!isConnectionClosedError(error)) {
      throw error;
    }

    const recoveryScope = resolvedConnectionId || userId;
    const lastRecoveryAt = sessionRecoveryAttemptAt.get(recoveryScope) || 0;
    const sinceLastRecoveryMs = Date.now() - lastRecoveryAt;

    if (sinceLastRecoveryMs >= SESSION_RECOVERY_ATTEMPT_COOLDOWN_MS) {
      if (!resolvedConnectionId) {
        const fallbackConnection = await storage.getConnectionByUserId(userId);
        resolvedConnectionId = fallbackConnection?.id;
      }

      if (resolvedConnectionId) {
        sessionRecoveryAttemptAt.set(recoveryScope, Date.now());
        console.warn(`?? [SEND] Connection Closed ao enviar para ${jid}. For�ando reconnect (conn=${resolvedConnectionId.substring(0, 8)}, user=${userId.substring(0, 8)})`);
        try {
          await connectWhatsApp(userId, resolvedConnectionId);
        } catch (reconnectError) {
          console.warn(`?? [SEND] Reconnect ap�s Connection Closed falhou:`, reconnectError);
        }
      }
    }

    const recoveredSession = await waitForReadySession(resolvedConnectionId, RECOVERY_WAIT_MS);
    if (!recoveredSession?.socket || !isSessionReadyForMessaging(recoveredSession)) {
      throw error;
    }

    return await sendWithSession(recoveredSession, 'send_retry_after_reconnect');
  }
}

// Registrar callback no messageQueueService
messageQueueService.registerSendCallback(internalSendMessageRaw);

// -----------------------------------------------------------------------
// ??? WRAPPER UNIVERSAL PARA ENVIO COM DELAY ANTI-BLOQUEIO
// -----------------------------------------------------------------------
// Esta fun??o DEVE ser usada para TODOS os envios de mensagem!
// Garante delay de 5-10s entre mensagens do MESMO WhatsApp.

/**
 * Envia qualquer tipo de mensagem respeitando a fila anti-bloqueio
 * @param queueId - ID da fila (userId para usu?rios, "admin_" + adminId para admins)
 * @param description - Descri??o do envio para logs
 * @param sendFn - Fun??o que faz o envio real
 */
async function sendWithQueue<T>(
  queueId: string,
  description: string,
  sendFn: () => Promise<T>
): Promise<T> {
  return messageQueueService.executeWithDelay(queueId, description, sendFn);
}

// -----------------------------------------------------------------------
// ?? VERIFICA??O DE MENSAGENS N?O RESPONDIDAS AO RECONECTAR
// -----------------------------------------------------------------------
// Quando o WhatsApp reconecta (ap?s desconex?o/restart), verificamos se h?
// clientes que mandaram mensagem nas ?ltimas 24h e n?o foram respondidos.
// Isso resolve o problema de mensagens perdidas durante desconex?es.
// -----------------------------------------------------------------------
async function checkUnrespondedMessages(session: WhatsAppSession): Promise<void> {
  const { userId, connectionId } = session;
  
  console.log(`\n?? [UNRESPONDED CHECK] Iniciando verifica??o de mensagens n?o respondidas...`);
  console.log(`   ?? Usu?rio: ${userId}`);
  
  try {
    // 1. Verificar se o agente est? ativo
    const agentConfig = await storage.getAgentConfig(userId);
    if (!agentConfig?.isActive) {
      console.log(`?? [UNRESPONDED CHECK] Agente inativo, pulando verifica??o`);
      return;
    }
    
    // 2. Buscar todas as conversas deste usu?rio
    const allConversations = await storage.getConversationsByConnectionId(connectionId);
    
    // 3. Filtrar conversas das ?ltimas 24 horas
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentConversations = allConversations.filter(conv => {
      if (!conv.lastMessageTime) return false;
      const lastMsgTime = new Date(conv.lastMessageTime);
      return lastMsgTime >= twentyFourHoursAgo;
    });
    
    console.log(`?? [UNRESPONDED CHECK] ${recentConversations.length} conversas nas ?ltimas 24h`);
    
    let unrespondedCount = 0;
    let processedCount = 0;
    
    for (const conversation of recentConversations) {
      // Evitar reprocessar na mesma sess?o
      if (checkedConversationsThisSession.has(conversation.id)) {
        continue;
      }
      checkedConversationsThisSession.add(conversation.id);
      
      // 4. Verificar se agente est? pausado para esta conversa
      const isDisabled = await storage.isAgentDisabledForConversation(conversation.id);
      if (isDisabled) {
        continue;
      }
      
      // 5. Buscar mensagens desta conversa
      const messages = await storage.getMessagesByConversationId(conversation.id);
      if (messages.length === 0) continue;
      
      // 6. Verificar ?ltima mensagem
      const lastMessage = messages[messages.length - 1];
      
      // Se ?ltima mensagem ? do cliente (n?o ? fromMe), precisa responder
      if (!lastMessage.fromMe) {
        unrespondedCount++;
        
        // 7. Verificar se j? tem resposta pendente
        if (pendingResponses.has(conversation.id)) {
          console.log(`? [UNRESPONDED CHECK] ${conversation.contactNumber} - J? tem resposta pendente`);
          continue;
        }
        
        console.log(`?? [UNRESPONDED CHECK] ${conversation.contactNumber} - ?ltima mensagem do cliente SEM RESPOSTA`);
        console.log(`   ?? Mensagem: "${(lastMessage.text || '[m?dia]').substring(0, 50)}..."`);
        console.log(`   ?? Enviada em: ${lastMessage.timestamp}`);
        
        // 8. Agendar resposta com delay para n?o sobrecarregar
        const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
        const delayForThisMessage = (processedCount * 5000) + (responseDelaySeconds * 1000); // 5s entre cada + delay normal
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages: [lastMessage.text || '[m?dia recebida]'],
          conversationId: conversation.id,
          userId,
          connectionId,
          contactNumber: conversation.contactNumber,
          jidSuffix: conversation.jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: Date.now(),
        };
        
        pending.timeout = setTimeout(async () => {
          console.log(`?? [UNRESPONDED CHECK] Processando resposta atrasada para ${conversation.contactNumber}`);
          await processAccumulatedMessages(pending);
        }, delayForThisMessage);
        
        pendingResponses.set(conversation.id, pending);
        processedCount++;
        
        console.log(`?? [UNRESPONDED CHECK] Resposta agendada em ${Math.round(delayForThisMessage/1000)}s`);
      }
    }
    
    console.log(`\n? [UNRESPONDED CHECK] Verifica??o conclu?da:`);
    console.log(`   ?? Total conversas 24h: ${recentConversations.length}`);
    console.log(`   ? N?o respondidas: ${unrespondedCount}`);
    console.log(`   ?? Respostas agendadas: ${processedCount}\n`);
    
  } catch (error) {
    console.error(`? [UNRESPONDED CHECK] Erro na verifica??o:`, error);
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function randomBetween(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}

async function getAdminAgentRuntimeConfig(): Promise<{
  responseDelayMs: number;
  messageSplitChars: number;
  typingDelayMinMs: number;
  typingDelayMaxMs: number;
  messageIntervalMinMs: number;
  messageIntervalMaxMs: number;
}> {
  try {
    const [splitChars, responseDelay, typingMin, typingMax, intervalMin, intervalMax, promptStyle] = await Promise.all([
      storage.getSystemConfig("admin_agent_message_split_chars"),
      storage.getSystemConfig("admin_agent_response_delay_seconds"),
      storage.getSystemConfig("admin_agent_typing_delay_min"),
      storage.getSystemConfig("admin_agent_typing_delay_max"),
      storage.getSystemConfig("admin_agent_message_interval_min"),
      storage.getSystemConfig("admin_agent_message_interval_max"),
      storage.getSystemConfig("admin_agent_prompt_style"),
    ]);

    const messageSplitChars = clampInt(parseInt(splitChars?.valor || "400", 10) || 400, 0, 5000);
    // Alterado padr?o de 30s para 6s conforme solicita??o
    let responseDelaySeconds = clampInt(parseInt(responseDelay?.valor || "6", 10) || 6, 1, 180);
    const typingDelayMin = clampInt(parseInt(typingMin?.valor || "2", 10) || 2, 0, 60);
    const typingDelayMax = clampInt(parseInt(typingMax?.valor || "5", 10) || 5, typingDelayMin, 120);
    const messageIntervalMin = clampInt(parseInt(intervalMin?.valor || "3", 10) || 3, 0, 120);
    const messageIntervalMax = clampInt(parseInt(intervalMax?.valor || "8", 10) || 8, messageIntervalMin, 240);

    // Se o estilo for "human", for?ar um delay menor para parecer mais natural (se estiver alto)
    const style = promptStyle?.valor || "nuclear";
    if (style === "human" && responseDelaySeconds > 10) {
      console.log(`? [ADMIN AGENT] Estilo Human detectado: Reduzindo delay de ${responseDelaySeconds}s para 6s`);
      responseDelaySeconds = 6;
    }

    return {
      responseDelayMs: responseDelaySeconds * 1000,
      messageSplitChars,
      typingDelayMinMs: typingDelayMin * 1000,
      typingDelayMaxMs: typingDelayMax * 1000,
      messageIntervalMinMs: messageIntervalMin * 1000,
      messageIntervalMaxMs: messageIntervalMax * 1000,
    };
  } catch (error) {
    console.error("[ADMIN AGENT] Failed to load runtime config, using defaults", error);
    return {
      responseDelayMs: 6000, // Default 6s
      messageSplitChars: 400,
      typingDelayMinMs: 2000,
      typingDelayMaxMs: 5000,
      messageIntervalMinMs: 3000,
      messageIntervalMaxMs: 8000,
    };
  }
}

async function scheduleAdminAccumulatedResponse(params: {
  socket: WASocket;
  remoteJid: string;
  contactNumber: string;
  messageText: string;
  conversationId?: string;
}): Promise<void> {
  const { socket, remoteJid, contactNumber, messageText, conversationId } = params;
  const config = await getAdminAgentRuntimeConfig();
  const key = contactNumber;

  console.log(`\n?? [ADMIN AGENT] Mensagem recebida de ${contactNumber}`);
  console.log(`   ?? Delay configurado: ${config.responseDelayMs}ms (${config.responseDelayMs/1000}s)`);

  // ?? FIX: Inscrever-se explicitamente para receber atualiza??es de presen?a (digitando/pausado)
  // Sem isso, o Baileys pode n?o receber os eventos 'presence.update'
  try {
    const normalizedJid = jidNormalizedUser(remoteJid);
    await socket.presenceSubscribe(normalizedJid);
    await socket.sendPresenceUpdate('available'); // For?ar status online
    console.log(`   ?? [PRESENCE] Inscrito para atualiza??es de: ${normalizedJid}`);
  } catch (err) {
    console.error(`   ? [PRESENCE] Falha ao inscrever:`, err);
  }

  const existing = pendingAdminResponses.get(key);
  if (existing) {
    if (existing.timeout) {
      clearTimeout(existing.timeout);
    }
    existing.messages.push(messageText);
    existing.generation += 1;
    console.log(`   ?? Acumulando msg ${existing.messages.length}. Reset do timer para ${config.responseDelayMs}ms`);
    existing.timeout = setTimeout(() => {
      void processAdminAccumulatedMessages({ socket, key, generation: existing.generation });
    }, config.responseDelayMs);
    return;
  }

  // Verificar se conversa j? existe no banco
  const existingConversation = conversationId ? await storage.getAdminConversation(conversationId) : null;
  const isNewConversation = !existingConversation;

  const pending: PendingAdminResponse = {
    timeout: null,
    messages: [messageText],
    remoteJid,
    contactNumber,
    generation: 1,
    startTime: Date.now(),
    conversationId,
  };

  if (isNewConversation) {
    console.log(`   ?? Nova conversa. Timer de ${config.responseDelayMs}ms iniciado`);
  } else {
    console.log(`   ?? Conversa existente. Timer de ${config.responseDelayMs}ms iniciado`);
  }
  
  pending.timeout = setTimeout(() => {
    void processAdminAccumulatedMessages({ socket, key, generation: pending.generation });
  }, config.responseDelayMs);

  pendingAdminResponses.set(key, pending);
}

async function processAdminAccumulatedMessages(params: {
  socket: WASocket;
  key: string;
  generation: number;
}): Promise<void> {
  const { socket, key, generation } = params;
  const pending = pendingAdminResponses.get(key);
  if (!pending) return;
  if (pending.generation !== generation) return;

  // Mark timer as consumed
  pending.timeout = null;

  const config = await getAdminAgentRuntimeConfig();
  const combinedText = pending.messages.join("\n\n");

  const waitSeconds = ((Date.now() - pending.startTime) / 1000).toFixed(1);
  console.log(`\n?? [ADMIN AGENT] =========== PROCESSANDO RESPOSTA ==========`);
  console.log(`   ?? Aguardou ${waitSeconds}s | ${pending.messages.length} msg(s) acumulada(s)`);
  console.log(`   ?? Cliente: ${pending.contactNumber}`);
  console.log(`   ?? Config carregada:`);
  console.log(`      - Tempo resposta: ${config.responseDelayMs}ms`);
  console.log(`      - Typing delay: ${config.typingDelayMinMs}-${config.typingDelayMaxMs}ms`);
  console.log(`      - Split chars: ${config.messageSplitChars}`);
  console.log(`      - Intervalo blocos: ${config.messageIntervalMinMs}-${config.messageIntervalMaxMs}ms`);

  try {
    // ?? RE-VERIFICAR STATUS DO AGENTE (Double Check)
    // Isso previne que mensagens acumuladas sejam enviadas se o agente foi desativado durante o delay
    // ou se a verifica??o inicial falhou.
    if (pending.conversationId) {
        const isEnabled = await storage.isAdminAgentEnabledForConversation(pending.conversationId);
        if (!isEnabled) {
            console.log(`?? [ADMIN AGENT] Agente desativado durante acumula??o para ${pending.contactNumber}. Cancelando envio.`);
            pendingAdminResponses.delete(key);
            return;
        }
    } else {
        // Fallback: Tentar buscar conversa pelo n?mero se n?o tiver ID salvo no pending
        try {
            const admins = await storage.getAllAdmins();
            if (admins.length > 0) {
                const conv = await storage.getAdminConversationByContact(admins[0].id, pending.contactNumber);
                if (conv && !conv.isAgentEnabled) {
                    console.log(`?? [ADMIN AGENT] Agente desativado (verifica??o tardia) para ${pending.contactNumber}. Cancelando envio.`);
                    pendingAdminResponses.delete(key);
                    return;
                }
            }
        } catch (err) {
            console.error("Erro na verifica??o tardia de status:", err);
        }
    }

    const { processAdminMessage, getOwnerNotificationNumber } = await import("./adminAgentService");

    // skipTriggerCheck = false para aplicar valida??o de frases gatilho no WhatsApp real
    const response = await processAdminMessage(pending.contactNumber, combinedText, undefined, undefined, false);

    // Se response ? null, significa que n?o passou na valida??o de frase gatilho
    if (response === null) {
      console.log(`?? [ADMIN AGENT] Mensagem ignorada - sem frase gatilho`);
      pendingAdminResponses.delete(key);
      return;
    }

    // Se novas mensagens chegaram enquanto a IA processava, cancela este envio
    const stillCurrent = pendingAdminResponses.get(key);
    if (!stillCurrent || stillCurrent.generation !== generation) {
      console.log(`?? [ADMIN AGENT] Nova mensagem chegou durante processamento; descartando resposta antiga`);
      return;
    }

    // Delay de digita??o humanizada
    const typingDelay = randomBetween(config.typingDelayMinMs, config.typingDelayMaxMs);
    await new Promise((r) => setTimeout(r, typingDelay));

    // ?? CHECK FINAL DE PRESEN?A (Double Check)
    // Se o usu?rio come?ou a digitar durante o delay de digita??o, abortar envio
    let checkPresence = pendingAdminResponses.get(key);
    
    // L?gica de Retry para "Composing" travado (Solicitado pelo usu?rio: "logica profunda")
    // Se estiver digitando, vamos aguardar um pouco e verificar novamente
    // Isso resolve casos onde a conex?o cai e n?o recebemos o "paused"
    let retryCount = 0;
    const maxRetries = 3;
    
    while (checkPresence && (checkPresence.timeout !== null || checkPresence.lastKnownPresence === 'composing') && retryCount < maxRetries) {
        console.log(`? [ADMIN AGENT] Usu?rio digitando (check final). Aguardando confirma??o... (${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, 5000)); // Espera 5s
        checkPresence = pendingAdminResponses.get(key);
        retryCount++;
    }

    if (checkPresence && (checkPresence.timeout !== null || checkPresence.lastKnownPresence === 'composing')) {
        // Se ainda estiver digitando ap?s retries, verificar se o status ? antigo (stale)
        const lastUpdate = checkPresence.lastPresenceUpdate || 0;
        const timeSinceUpdate = Date.now() - lastUpdate;
        const STALE_THRESHOLD = 45000; // 45 segundos

        if (timeSinceUpdate > STALE_THRESHOLD) {
             console.log(`?? [ADMIN AGENT] Status 'composing' parece travado (${Math.floor(timeSinceUpdate/1000)}s). Ignorando e enviando.`);
             // Prossegue para envio...
        } else {
             console.log(`? [ADMIN AGENT] Usu?rio voltou a digitar (check final). Abortando envio.`);
             return;
        }
    }

    // Quebrar mensagem longa em partes
    const parts = splitMessageHumanLike(response.text || "", config.messageSplitChars);

    for (let i = 0; i < parts.length; i++) {
      const current = pendingAdminResponses.get(key);
      if (!current || current.generation !== generation) {
        console.log(`?? [ADMIN AGENT] Cancelando envio (mensagens novas chegaram)`);
        return;
      }

      // ?? CHECK DE PRESEN?A NO LOOP
      if (current.timeout !== null || current.lastKnownPresence === 'composing') {
          // Verificar se ? stale
          const lastUpdate = current.lastPresenceUpdate || 0;
          const timeSinceUpdate = Date.now() - lastUpdate;
          
          if (timeSinceUpdate > 45000) {
              console.log(`?? [ADMIN AGENT] Status 'composing' travado durante envio. Ignorando.`);
          } else {
              console.log(`? [ADMIN AGENT] Usu?rio voltou a digitar durante envio. Abortando.`);
              return;
          }
      }

      if (i > 0) {
        const interval = randomBetween(config.messageIntervalMinMs, config.messageIntervalMaxMs);
        await new Promise((r) => setTimeout(r, interval));
      }

      // ??? ANTI-BLOQUEIO: Usar fila do Admin Agent
      await sendWithQueue('ADMIN_AGENT', `admin resposta parte ${i+1}`, async () => {
        await socket.sendMessage(pending.remoteJid, { text: parts[i] });
      });
    }

    console.log(`? [ADMIN AGENT] Resposta enviada para ${pending.contactNumber}`);

    // ?? Salvar resposta do agente no banco de dados
    if (pending.conversationId && response.text) {
      try {
        await storage.createAdminMessage({
          conversationId: pending.conversationId,
          messageId: `agent_${Date.now()}`,
          fromMe: true,
          text: response.text,
          timestamp: new Date(),
          status: "sent",
          isFromAgent: true,
        });
        
        // Atualizar ?ltima mensagem da conversa
        await storage.updateAdminConversation(pending.conversationId, {
          lastMessageText: response.text.substring(0, 255),
          lastMessageTime: new Date(),
        });
        
        console.log(`?? [ADMIN AGENT] Resposta salva na conversa ${pending.conversationId}`);
      } catch (dbError) {
        console.error(`? [ADMIN AGENT] Erro ao salvar resposta no banco:`, dbError);
      }
    }

    // Notifica??o de pagamento
    if (response.actions?.notifyOwner) {
      const ownerNumber = await getOwnerNotificationNumber();
      const ownerJid = `${ownerNumber}@s.whatsapp.net`;
      const notificationText = `?? *NOTIFICA??O DE PAGAMENTO*\n\n?? Cliente: ${pending.contactNumber}\n? ${new Date().toLocaleString("pt-BR")}\n\n?? Verificar comprovante e liberar conta`;
      // ??? ANTI-BLOQUEIO
      await sendWithQueue('ADMIN_AGENT', 'notifica??o pagamento', async () => {
        await socket.sendMessage(ownerJid, { text: notificationText });
      });
      console.log(`?? [ADMIN AGENT] Notifica??o enviada para ${ownerNumber}`);
    }

    // ?? Enviar m?dias se houver
    if (response.mediaActions && response.mediaActions.length > 0) {
      console.log(`?? [ADMIN AGENT] Enviando ${response.mediaActions.length} m?dia(s)...`);
      
      for (const action of response.mediaActions) {
        if (action.mediaData) {
          try {
            const media = action.mediaData;
            console.log(`?? [ADMIN AGENT] Enviando m?dia: ${media.name} (${media.mediaType})`);
            
            // Baixar m?dia da URL
            const mediaBuffer = await downloadMediaAsBuffer(media.storageUrl);
            
            if (mediaBuffer) {
              switch (media.mediaType) {
                case 'image':
                  // ??? ANTI-BLOQUEIO
                  await sendWithQueue('ADMIN_AGENT', 'm?dia imagem', async () => {
                    await socket.sendMessage(pending.remoteJid, {
                      image: mediaBuffer,
                      caption: media.caption || undefined,
                    });
                  });
                  break;
                case 'audio':
                  // ??? ANTI-BLOQUEIO
                  await sendWithQueue('ADMIN_AGENT', 'm?dia ?udio', async () => {
                    await socket.sendMessage(pending.remoteJid, {
                      audio: mediaBuffer,
                      mimetype: media.mimeType || 'audio/ogg; codecs=opus',
                      ptt: true, // Voice message
                    });
                  });
                  break;
                case 'video':
                  // ??? ANTI-BLOQUEIO
                  await sendWithQueue('ADMIN_AGENT', 'm?dia v?deo', async () => {
                    await socket.sendMessage(pending.remoteJid, {
                      video: mediaBuffer,
                      caption: media.caption || undefined,
                    });
                  });
                  break;
                case 'document':
                  // ??? ANTI-BLOQUEIO
                  await sendWithQueue('ADMIN_AGENT', 'm?dia documento', async () => {
                    await socket.sendMessage(pending.remoteJid, {
                      document: mediaBuffer,
                      fileName: media.fileName || 'document',
                      mimetype: media.mimeType || 'application/octet-stream',
                    });
                  });
                  break;
              }
              console.log(`? [ADMIN AGENT] M?dia ${media.name} enviada com sucesso`);
            } else {
              console.error(`? [ADMIN AGENT] Falha ao baixar m?dia: ${media.storageUrl}`);
            }
          } catch (mediaError) {
            console.error(`? [ADMIN AGENT] Erro ao enviar m?dia ${action.media_name}:`, mediaError);
          }
          
          // Pequeno delay entre m?dias
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // ?? Desconectar WhatsApp se solicitado
    if (response.actions?.disconnectWhatsApp) {
      try {
        const { getClientSession } = await import("./adminAgentService");
        const clientSession = getClientSession(pending.contactNumber);
        
        if (clientSession?.userId) {
          console.log(`?? [ADMIN AGENT] Desconectando WhatsApp do usu?rio ${clientSession.userId}...`);
          await disconnectWhatsApp(clientSession.userId);
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'desconex?o confirma??o', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "Pronto! ?? Seu WhatsApp foi desconectado. Quando quiser reconectar, ? s? me avisar!" });
          });
          console.log(`? [ADMIN AGENT] WhatsApp desconectado para ${clientSession.userId}`);
        } else {
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'desconex?o n?o encontrada', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "N?o encontrei uma conex?o ativa para desconectar. Voc? j? est? desconectado!" });
          });
        }
      } catch (disconnectError) {
        console.error("? [ADMIN AGENT] Erro ao desconectar WhatsApp:", disconnectError);
        // ??? ANTI-BLOQUEIO
        await sendWithQueue('ADMIN_AGENT', 'desconex?o erro', async () => {
          await socket.sendMessage(pending.remoteJid, { text: "Tive um problema ao tentar desconectar. Pode tentar de novo?" });
        });
      }
    }

    // ?? Enviar c?digo de pareamento se solicitado
    if (response.actions?.connectWhatsApp) {
      console.log(`?? [ADMIN AGENT] A??o connectWhatsApp (c?digo pareamento) detectada!`);
      try {
        // Buscar userId da sess?o do cliente
        const { getClientSession, createClientAccount, updateClientSession } = await import("./adminAgentService");
        const { ensurePairingCodeSentToClient } = await import("./adminConnectionFlows");
        let clientSession = getClientSession(pending.contactNumber);
        console.log(`?? [ADMIN AGENT] Sess?o do cliente para pareamento:`, clientSession ? `userId=${clientSession.userId}, email=${clientSession.email}` : "n?o encontrada");
        
        // ?? BUSCAR NO BANCO SE N?O TEM userId NA SESS?O
        if (!clientSession?.userId) {
          const cleanPhone = "+" + pending.contactNumber.replace(/\D/g, "");
          console.log(`?? [ADMIN AGENT] Buscando usu?rio no banco pelo telefone: ${cleanPhone}`);
          const existingUser = await storage.getUserByPhone(cleanPhone);
          if (existingUser) {
            console.log(`?? [ADMIN AGENT] Usu?rio encontrado no banco: ${existingUser.id}`);
            // Atualizar sess?o com userId do banco
            updateClientSession(pending.contactNumber, { userId: existingUser.id, email: existingUser.email || undefined });
            clientSession = getClientSession(pending.contactNumber);
          }
        }
        
        // Se n?o tem userId mas tem email, criar conta automaticamente
        if (!clientSession?.userId && clientSession?.email) {
          console.log(`?? [ADMIN AGENT] Criando conta para ${clientSession.email} antes de gerar c?digo...`);
          const result = await createClientAccount(clientSession);
          if (result.success) {
            clientSession = getClientSession(pending.contactNumber); // Recarregar sess?o atualizada
            console.log(`? [ADMIN AGENT] Conta criada com ID: ${result.userId}`);
          }
        }
        
        if (clientSession?.userId) {
          await ensurePairingCodeSentToClient({
            userId: clientSession.userId,
            contactNumber: pending.contactNumber,
            getConnectionByUserId: (userId) => storage.getConnectionByUserId(userId),
            requestPairingCode: requestClientPairingCode,
            // ??? ANTI-BLOQUEIO: Enviar via fila
            sendText: (text) => sendWithQueue('ADMIN_AGENT', 'pareamento c?digo', async () => {
              await socket.sendMessage(pending.remoteJid, { text });
            }).then(() => undefined),
          });
        } else {
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'pareamento email', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "Antes de conectar, preciso criar sua conta. Me passa seu email?" });
          });
        }
      } catch (codeError) {
        console.error("? [ADMIN AGENT] Erro ao gerar c?digo de pareamento:", codeError);
        const errorMsg = (codeError as Error).message || String(codeError);
        console.error("? [ADMIN AGENT] Detalhes do erro:", errorMsg);
        // ??? ANTI-BLOQUEIO
        await sendWithQueue('ADMIN_AGENT', 'pareamento erro', async () => {
          await socket.sendMessage(pending.remoteJid, {
            text: "Desculpa, tive um problema t?cnico ao gerar o c?digo agora. Eu continuo tentando e te envio automaticamente assim que sair.\n\nSe preferir, tamb?m posso conectar por QR Code.",
          });
        });
      }
    }

    // ?? Enviar QR Code como imagem se solicitado
    if (response.actions?.sendQrCode) {
      console.log(`?? [ADMIN AGENT] A??o sendQrCode detectada! Iniciando processo...`);
      try {
        const { getClientSession, createClientAccount, updateClientSession } = await import("./adminAgentService");
        const { ensureQrCodeSentToClient } = await import("./adminConnectionFlows");
        let clientSession = getClientSession(pending.contactNumber);
        console.log(`?? [ADMIN AGENT] Sess?o do cliente:`, clientSession ? `userId=${clientSession.userId}, email=${clientSession.email}` : "n?o encontrada");
        
        // ?? BUSCAR NO BANCO SE N?O TEM userId NA SESS?O
        if (!clientSession?.userId) {
          const cleanPhone = "+" + pending.contactNumber.replace(/\D/g, "");
          console.log(`?? [ADMIN AGENT] Buscando usu?rio no banco pelo telefone: ${cleanPhone}`);
          const existingUser = await storage.getUserByPhone(cleanPhone);
          if (existingUser) {
            console.log(`?? [ADMIN AGENT] Usu?rio encontrado no banco: ${existingUser.id}`);
            // Atualizar sess?o com userId do banco
            updateClientSession(pending.contactNumber, { userId: existingUser.id, email: existingUser.email || undefined });
            clientSession = getClientSession(pending.contactNumber);
          }
        }
        
        // Se n?o tem userId mas tem email, criar conta automaticamente
        if (!clientSession?.userId && clientSession?.email) {
          console.log(`?? [ADMIN AGENT] Criando conta para ${clientSession.email} antes de gerar QR Code...`);
          const result = await createClientAccount(clientSession);
          if (result.success) {
            clientSession = getClientSession(pending.contactNumber); // Recarregar sess?o atualizada
            console.log(`? [ADMIN AGENT] Conta criada com ID: ${result.userId}`);
          }
        }
        
        if (clientSession?.userId) {
          await ensureQrCodeSentToClient({
            userId: clientSession.userId,
            contactNumber: pending.contactNumber,
            getConnectionByUserId: (userId) => storage.getConnectionByUserId(userId),
            connectWhatsApp,
            // ??? ANTI-BLOQUEIO: Enviar via fila
            sendText: (text) => sendWithQueue('ADMIN_AGENT', 'QR c?digo texto', async () => {
              await socket.sendMessage(pending.remoteJid, { text });
            }).then(() => undefined),
            sendImage: (image, caption) => sendWithQueue('ADMIN_AGENT', 'QR c?digo imagem', async () => {
              await socket.sendMessage(pending.remoteJid, { image, caption });
            }).then(() => undefined),
          });
        } else {
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'QR email pedido', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "Antes de conectar, preciso criar sua conta. Me passa seu email?" });
          });
        }
      } catch (qrError) {
        console.error("? [ADMIN AGENT] Erro ao enviar QR Code:", qrError);
        // ??? ANTI-BLOQUEIO
        await sendWithQueue('ADMIN_AGENT', 'QR erro', async () => {
          await socket.sendMessage(pending.remoteJid, {
            text: "Desculpa, tive um problema pra gerar o QR Code agora. Eu continuo tentando e te envio automaticamente assim que aparecer.\n\nSe preferir, tamb?m posso conectar pelo c?digo de 8 d?gitos.",
          });
        });
      }
    }

    // Limpar fila (somente se ainda for a gera??o atual)
    const current = pendingAdminResponses.get(key);
    if (current && current.generation === generation) {
      pendingAdminResponses.delete(key);
    }
  } catch (error) {
    console.error("? [ADMIN AGENT] Erro ao processar mensagens acumuladas:", error);
  }
}

// ?? HUMANIZA??O: Quebra mensagem longa em partes menores
// Best practices: WhatsApp, Intercom, Drift quebram a cada 2-3 par?grafos ou 300-500 chars
// Fonte: https://www.drift.com/blog/conversational-marketing-best-practices/
// CORRE??O 2025: N?o corta palavras nem frases no meio - divide corretamente respeitando limites naturais
// EXPORTADA para uso no simulador (/api/agent/test) - garante consist?ncia entre simulador e WhatsApp real
export function splitMessageHumanLike(message: string, maxChars: number = 400): string[] {
  // Se maxChars = 0, retorna mensagem completa sem divis?o
  if (maxChars === 0) {
    return [message];
  }
  
  // Mensagem pequena - retorna diretamente
  if (message.length <= maxChars) {
    return [message];
  }
  
  const MAX_CHARS = maxChars;
  const finalParts: string[] = [];
  
  // FASE 1: Dividir por par?grafos duplos (quebras de se??o)
  const sections = message.split('\n\n').filter(s => s.trim());
  
  // FASE 2: Processar cada se??o, quebrando em partes menores se necess?rio
  for (const section of sections) {
    const sectionParts = splitSectionIntoChunks(section, MAX_CHARS);
    finalParts.push(...sectionParts);
  }
  
  // FASE 3: Agrupar partes pequenas respeitando o limite
  const optimizedParts: string[] = [];
  let currentBuffer = '';
  
  for (const part of finalParts) {
    const separator = currentBuffer ? '\n\n' : '';
    const combined = currentBuffer + separator + part;
    
    if (combined.length <= MAX_CHARS) {
      currentBuffer = combined;
    } else {
      if (currentBuffer.trim()) {
        optimizedParts.push(currentBuffer.trim());
      }
      currentBuffer = part;
    }
  }
  
  // Adicionar ?ltimo buffer
  if (currentBuffer.trim()) {
    optimizedParts.push(currentBuffer.trim());
  }
  
  console.log(`?? [SPLIT] Mensagem dividida em ${optimizedParts.length} partes (limite: ${MAX_CHARS} chars)`);
  optimizedParts.forEach((p, i) => {
    console.log(`   Parte ${i+1}/${optimizedParts.length}: ${p.length} chars`);
  });
  
  return optimizedParts.length > 0 ? optimizedParts : [message];
}

// Fun??o auxiliar para dividir uma se??o em chunks menores sem cortar palavras/frases
function splitSectionIntoChunks(section: string, maxChars: number): string[] {
  // Se a se??o cabe no limite, retorna direto
  if (section.length <= maxChars) {
    return [section];
  }
  
  const chunks: string[] = [];
  
  // ESTRAT?GIA 1: Tentar dividir por quebras de linha simples
  const lines = section.split('\n').filter(l => l.trim());
  if (lines.length > 1) {
    let currentChunk = '';
    for (const line of lines) {
      const separator = currentChunk ? '\n' : '';
      if ((currentChunk + separator + line).length <= maxChars) {
        currentChunk = currentChunk + separator + line;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        // Se a linha individual ? maior que o limite, processa ela recursivamente
        if (line.length > maxChars) {
          const subChunks = splitTextBySentences(line, maxChars);
          chunks.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = line;
        }
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    return chunks;
  }
  
  // ESTRAT?GIA 2: Dividir por frases (pontua??o)
  return splitTextBySentences(section, maxChars);
}

// Divide texto por frases, garantindo que n?o corte palavras ou URLs
function splitTextBySentences(text: string, maxChars: number): string[] {
  // PROTE??O DE URLs: Substituir pontos em URLs por placeholder tempor?rio
  // para evitar que a regex de frases corte no meio de URLs
  const urlPlaceholder = '?URL_DOT?';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const protectedUrls: string[] = [];
  
  // Substituir URLs por placeholders numerados
  let protectedText = text.replace(urlRegex, (match) => {
    const index = protectedUrls.length;
    protectedUrls.push(match);
    // Substituir pontos dentro da URL por placeholder
    return `?URL_${index}?`;
  });
  
  // Regex para encontrar frases (terminadas em . ! ? seguidos de espa?o/fim)
  // IMPORTANTE: Removido o h?fen (-) como delimitador de frase para n?o cortar
  // palavras compostas como "segunda-feira", "ter?a-feira", etc.
  const sentencePattern = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;
  const sentences = protectedText.match(sentencePattern) || [protectedText];
  
  // Restaurar URLs nos resultados
  const restoredSentences = sentences.map(sentence => {
    let restored = sentence;
    protectedUrls.forEach((url, index) => {
      restored = restored.replace(`?URL_${index}?`, url);
    });
    return restored;
  });
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of restoredSentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    const combined = currentChunk ? currentChunk + ' ' + trimmedSentence : trimmedSentence;
    
    if (combined.length <= maxChars) {
      currentChunk = combined;
    } else {
      // Salvar chunk atual se existir
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      // Se a frase individual ? maior que o limite, divide por palavras
      if (trimmedSentence.length > maxChars) {
        const wordChunks = splitByWords(trimmedSentence, maxChars);
        chunks.push(...wordChunks);
        currentChunk = '';
      } else {
        currentChunk = trimmedSentence;
      }
    }
  }
  
  // Adicionar ?ltimo chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// ?ltima estrat?gia: divide por palavras (nunca corta uma palavra no meio, PROTEGE URLs)
function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const word of words) {
    if (!word) continue;
    
    const combined = currentChunk ? currentChunk + ' ' + word : word;
    
    if (combined.length <= maxChars) {
      currentChunk = combined;
    } else {
      // Salvar chunk atual
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      // Se a palavra individual ? maior que o limite
      if (word.length > maxChars) {
        // PROTE??O: Se for uma URL, NUNCA quebrar - coloca inteira mesmo que ultrapasse o limite
        if (word.match(/^https?:\/\//i)) {
          console.log(`?? [SPLIT] URL protegida (n?o ser? cortada): ${word.substring(0, 50)}...`);
          currentChunk = word; // URL fica inteira, mesmo que ultrapasse o limite
        } else {
          // ?ltimo recurso para palavras n?o-URL: quebra caractere por caractere
          console.log(`?? [SPLIT] Palavra muito longa sendo quebrada: ${word.substring(0, 30)}...`);
          let remaining = word;
          while (remaining.length > maxChars) {
            chunks.push(remaining.substring(0, maxChars));
            remaining = remaining.substring(maxChars);
          }
          currentChunk = remaining;
        }
      } else {
        currentChunk = word;
      }
    }
  }
  
  // Adicionar ?ltimo chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// Base directory for storing Baileys multi-file auth state.
// Defaults to current working directory (backwards compatible with ./auth_*)
// You can set SESSIONS_DIR (e.g., "/data/whatsapp-sessions" on Railway volumes)
// to persist sessions between deploys and avoid baking them into the image.
const SESSIONS_BASE = process.env.SESSIONS_DIR || "./";

async function ensureDirExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`[WHATSAPP] Failed to ensure sessions directory exists: ${dirPath}`, error);
  }
}

// Best-effort: ensure the base dir exists when configured via env.
// This helps confirm Railway volumes are mounted and writable.
if (process.env.SESSIONS_DIR) {
  console.log(`[WHATSAPP] Using SESSIONS_DIR=${SESSIONS_BASE}`);
  void ensureDirExists(SESSIONS_BASE);
} else {
  console.log(`[WHATSAPP] Using default sessions dir (ephemeral): ${SESSIONS_BASE}`);
}

function cleanContactNumber(input?: string | null): string {
  return (input?.split(":")[0] || "").replace(/\D/g, "");
}

function getWAMessageTimestamp(waMessage: WAMessage): Date {
  const raw = (waMessage as any)?.messageTimestamp;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000);
  return new Date();
}

// New leads (notably Meta ads) can wrap the real payload in envelopes (ephemeral/viewOnce).
// We unwrap only generic envelopes so existing specific handlers still work.
function unwrapIncomingMessageContent(message: any): any {
  let m = message;
  for (let i = 0; i < 5; i++) {
    if (!m) return m;
    if (m.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
      continue;
    }
    if (m.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
      continue;
    }
    if (m.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
      continue;
    }
    if (m.viewOnceMessageV2Extension?.message) {
      m = m.viewOnceMessageV2Extension.message;
      continue;
    }
    break;
  }
  return m;
}

const NON_MEANINGFUL_MESSAGE_KEYS = new Set([
  "messageContextInfo",
  "protocolMessage",
  "senderKeyDistributionMessage",
  "deviceSentMessage",
  "reactionMessage",
]);

function isStubOrIncompleteText(text?: string | null): boolean {
  if (!text) return true;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes("mensagem incompleta")) return true;
  if (normalized === "[mensagem de protocolo]") return true;
  return false;
}

function isMeaningfulIncomingContent(message?: proto.IMessage | null): boolean {
  const unwrapped = unwrapIncomingMessageContent(message as any);
  if (!unwrapped || typeof unwrapped !== "object") return false;

  const keys = Object.entries(unwrapped)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key]) => key);

  if (keys.length === 0) return false;

  const meaningfulKeys = keys.filter((key) => !NON_MEANINGFUL_MESSAGE_KEYS.has(key));
  return meaningfulKeys.length > 0;
}

function parseVCardBasic(vcard?: string | null): { waid?: string; phone?: string } {
  if (!vcard) return {};
  const m = vcard.match(/waid=(\d+):\+?([0-9 +()\\-]+)/i);
  if (m) return { waid: m[1], phone: m[2]?.trim() };
  const m2 = vcard.match(/\bTEL[^:]*:\s*(\+?[0-9 +()\\-]{8,})/i);
  if (m2) return { phone: m2[1]?.trim() };
  return {};
}

async function parseRemoteJid(remoteJid: string, contactsCache?: Map<string, Contact>, connectionId?: string) {
  const decoded = jidDecode(remoteJid);
  const rawUser = decoded?.user || remoteJid.split("@")[0] || "";
  let jidSuffix = decoded?.server || remoteJid.split("@")[1]?.split(":")[0] || DEFAULT_JID_SUFFIX;

  console.log(`\n?? [parseRemoteJid] ========== DEBUG START ==========`);
  console.log(`   Input remoteJid: ${remoteJid}`);
  console.log(`   Decoded user: ${rawUser}`);
  console.log(`   Decoded server: ${jidSuffix}`);
  console.log(`   Is @lid?: ${remoteJid.includes("@lid")}`);
  console.log(`   Cache size: ${contactsCache?.size || 0}`);
  console.log(`   ConnectionId provided: ${connectionId || "N/A"}`);

  // FIX LID 2025: Para @lid, retornar o pr?prio LID (sem tentar converter)
  let contactNumber = cleanContactNumber(rawUser);
  
  if (remoteJid.includes("@lid")) {
    console.log(`   ?? [LID DETECTED] Instagram/Facebook Business contact`);
    console.log(`      LID: ${remoteJid}`);
    console.log(`      ?? LIDs s?o IDs do Meta, n?o n?meros WhatsApp`);
    console.log(`      ? Usando LID diretamente (comportamento correto)`);
  }  const normalizedJid = contactNumber
    ? jidNormalizedUser(`${contactNumber}@${jidSuffix}`)
    : jidNormalizedUser(remoteJid);

  console.log(`   ?? [parseRemoteJid] Resultado final:`);
  console.log(`      contactNumber: ${contactNumber}`);
  console.log(`      jidSuffix: ${jidSuffix}`);
  console.log(`      normalizedJid: ${normalizedJid}`);
  console.log(`   ========== DEBUG END ==========\n`);

  return { contactNumber, jidSuffix, normalizedJid };
}

function buildSendJid(conversation: { contactNumber?: string; remoteJid?: string | null; jidSuffix?: string | null }) {
  if (conversation.remoteJid) {
    return jidNormalizedUser(conversation.remoteJid);
  }

  const suffix = conversation.jidSuffix || DEFAULT_JID_SUFFIX;
  const number = cleanContactNumber(conversation.contactNumber || "");
  return jidNormalizedUser(`${number}@${suffix}`);
}

export function addWebSocketClient(ws: AuthenticatedWebSocket, userId: string) {
  if (!wsClients.has(userId)) {
    wsClients.set(userId, new Set());
  }
  wsClients.get(userId)!.add(ws);

  ws.on("close", () => {
    const userClients = wsClients.get(userId);
    if (userClients) {
      userClients.delete(ws);
      if (userClients.size === 0) {
        wsClients.delete(userId);
      }
    }
  });
}

export function addAdminWebSocketClient(ws: AuthenticatedWebSocket, adminId: string) {
  if (!adminWsClients.has(adminId)) {
    adminWsClients.set(adminId, new Set());
  }
  adminWsClients.get(adminId)!.add(ws);

  ws.on("close", () => {
    const adminClients = adminWsClients.get(adminId);
    if (adminClients) {
      adminClients.delete(ws);
      if (adminClients.size === 0) {
        adminWsClients.delete(adminId);
      }
    }
  });
}

export function broadcastToUser(userId: string, data: any) {
  const userClients = wsClients.get(userId);
  if (!userClients) {
    console.log(`[BROADCAST] No WebSocket clients found for user ${userId}`);
    return;
  }

  let sentCount = 0;
  userClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
      sentCount++;
    }
  });
  console.log(`[BROADCAST] Sent message to ${sentCount}/${userClients.size} clients for user ${userId}, type: ${data.type}`);
}

function broadcastToAdmin(adminId: string, data: any) {
  const adminClients = adminWsClients.get(adminId);
  if (!adminClients) {
    return;
  }

  adminClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Fun��o para limpar arquivos de autentica��o
async function clearAuthFiles(authPath: string): Promise<void> {
  try {
    const exists = await fs.access(authPath).then(() => true).catch(() => false);
    if (exists) {
      await fs.rm(authPath, { recursive: true, force: true });
      console.log(`Cleared auth files at: ${authPath}`);
    }
  } catch (error) {
    console.error(`Error clearing auth files at ${authPath}:`, error);
  }
}

// For�a reconex�o limpando sess�o existente na mem�ria (sem apagar arquivos de auth)
export async function forceReconnectWhatsApp(userId: string, connectionId?: string): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: Bloquear reconex�es para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] forceReconnectWhatsApp bloqueado para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sess�es do WhatsApp em produ��o n�o ser�o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sess�es em produ��o.');
  }
  
  const lookupKey = connectionId || userId;
  console.log(`[FORCE RECONNECT] Starting force reconnection for ${lookupKey}...`);
  
  // Limpar sess�o existente na mem�ria (se houver)
  const existingSession = sessions.get(lookupKey);
  if (existingSession?.socket) {
    console.log(`[FORCE RECONNECT] Found existing session in memory, closing it...`);
    try {
      // Fechar socket sem fazer logout (preserva credenciais)
      existingSession.socket.end(undefined);
    } catch (e) {
      console.log(`[FORCE RECONNECT] Error closing existing socket (ignoring):`, e);
    }
    sessions.delete(lookupKey);
    unregisterWhatsAppSession(lookupKey);
  }
  
  // Limpar pending connections e tentativas de reconex�o
  clearPendingConnectionLock(lookupKey, 'disconnect_before_reconnect');
  reconnectAttempts.delete(lookupKey);
  
  // Agora chamar connectWhatsApp normalmente
  await connectWhatsApp(userId, connectionId);
}

// ======================================================================
// ??? SESSION STABILITY - Heartbeat and Auto-Reconnection
// ======================================================================
/**
 * Start heartbeat mechanism to keep admin session alive
 * Pings every 30 seconds to detect connection issues early
 */
function startAdminHeartbeat(adminId: string): void {
  const session = adminSessions.get(adminId);
  if (!session?.socket) {
    console.log(`[HEARTBEAT] No active session for admin ${adminId}, skipping heartbeat`);
    return;
  }

  // Clear existing heartbeat if any
  if (session.heartbeatInterval) {
    clearInterval(session.heartbeatInterval);
  }

  session.heartbeatInterval = setInterval(() => {
    const currentSession = adminSessions.get(adminId);
    if (!currentSession?.socket) {
      console.log(`[HEARTBEAT] No active socket for admin ${adminId}, stopping heartbeat`);
      if (currentSession?.heartbeatInterval) {
        clearInterval(currentSession.heartbeatInterval);
      }
      return;
    }

    const now = Date.now();
    const timeSinceLastHeartbeat = now - (currentSession.lastHeartbeat || 0);

    // Check if connection is still responsive
    const isResponsive = currentSession.socket.user !== undefined;

    if (!isResponsive) {
      console.warn(`[HEARTBEAT] ?? Admin ${adminId} connection is not responsive (last heartbeat: ${Math.round(timeSinceLastHeartbeat / 1000)}s ago)`);
      currentSession.connectionHealth = 'unhealthy';
      currentSession.consecutiveDisconnects = (currentSession.consecutiveDisconnects || 0) + 1;

      if (currentSession.consecutiveDisconnects >= ADMIN_MAX_CONSECUTIVE_DISCONNECTS) {
        console.error(`[HEARTBEAT] ? Admin ${adminId} has ${currentSession.consecutiveDisconnects} consecutive disconnects - forcing reconnect`);
        currentSession.consecutiveDisconnects = 0;
        // Force reconnect with exponential backoff
        const backoffMs = ADMIN_RECONNECT_BACKOFF_BASE_MS * Math.pow(ADMIN_RECONNECT_BACKOFF_MULTIPLIER, 0);
        setTimeout(() => connectAdminWhatsApp(adminId).catch(console.error), backoffMs);
      }
    } else {
      currentSession.connectionHealth = 'healthy';
      currentSession.lastHeartbeat = now;
      currentSession.consecutiveDisconnects = 0;
    }
  }, ADMIN_HEARTBEAT_INTERVAL_MS);

  console.log(`[HEARTBEAT] Started for admin ${adminId} (interval: ${ADMIN_HEARTBEAT_INTERVAL_MS / 1000}s)`);
}

/**
 * Stop heartbeat mechanism for admin
 */
function stopAdminHeartbeat(adminId: string): void {
  const session = adminSessions.get(adminId);
  if (session?.heartbeatInterval) {
    clearInterval(session.heartbeatInterval);
    session.heartbeatInterval = undefined;
    console.log(`[HEARTBEAT] Stopped for admin ${adminId}`);
  }
}

// ======================================================================
// ?? FORCE FULL CONTACT SYNC - Reconecta para buscar TODOS os contatos
// ======================================================================
// Esta fun��o for�a uma reconex�o REAL do WhatsApp para que o Baileys
// dispare novamente o evento contacts.upsert com TODOS os contatos.
//
// Segundo a documenta��o do Baileys:
// - contacts.upsert envia TODOS os contatos na PRIMEIRA conex�o
// - Para for�ar novo envio, precisa reconectar a sess�o
// - Ref: https://github.com/WhiskeySockets/Baileys/issues/266
// ======================================================================
export async function forceFullContactSync(userId: string): Promise<{ success: boolean; message: string }> {
  // ??? MODO DESENVOLVIMENTO: Bloquear reconex�es
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] forceFullContactSync bloqueado para user ${userId}`);
    return { success: false, message: 'Modo desenvolvimento - WhatsApp desabilitado' };
  }

  console.log(`\n========================================`);
  console.log(`?? [FORCE FULL SYNC] Iniciando sincroniza��o COMPLETA de contatos`);
  console.log(`?? [FORCE FULL SYNC] User ID: ${userId}`);
  console.log(`========================================\n`);

  // Limpar cache de agenda existente para for�ar nova sincroniza��o
  agendaContactsCache.delete(userId);
  console.log(`?? [FORCE FULL SYNC] Cache de agenda limpo`);

  // Verificar se existe sess�o ativa
  const existingSession = sessions.get(userId);
  if (!existingSession?.socket) {
    console.log(`?? [FORCE FULL SYNC] Nenhuma sess�o ativa - conectando do zero...`);
    await connectWhatsApp(userId);
    return { success: true, message: 'Conex�o iniciada - aguarde os contatos serem sincronizados' };
  }

  console.log(`?? [FORCE FULL SYNC] Sess�o encontrada - reconectando para buscar todos os contatos...`);

  try {
    // 1. Fechar socket atual (mant�m credenciais)
    console.log(`?? [FORCE FULL SYNC] Fechando conex�o atual...`);
    try {
      existingSession.socket.end(undefined);
    } catch (e) {
      console.log(`?? [FORCE FULL SYNC] Erro ao fechar socket (ignorando):`, e);
    }

    // 2. Limpar da mem�ria
    sessions.delete(userId);
    unregisterWhatsAppSession(userId);
    clearPendingConnectionLock(userId, 'force_full_sync');
    reconnectAttempts.delete(userId);

    // 3. Aguardar um pouco para garantir que fechou
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Reconectar - isso vai disparar contacts.upsert com TODOS os contatos
    console.log(`?? [FORCE FULL SYNC] Reconectando para sincronizar todos os contatos...`);
    await connectWhatsApp(userId);

    // 5. Aguardar sync inicial (o contacts.upsert acontece automaticamente)
    console.log(`?? [FORCE FULL SYNC] Aguardando sincroniza��o de contatos...`);

    // Aguardar at� 30 segundos para os contatos serem sincronizados
    let attempts = 0;
    const maxAttempts = 15;
    let contactCount = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const agendaData = getAgendaContacts(userId);
      contactCount = agendaData?.contacts?.length || 0;

      console.log(`?? [FORCE FULL SYNC] Tentativa ${attempts + 1}/${maxAttempts} - ${contactCount} contatos encontrados`);

      // Se tiver mais de 100 contatos, provavelmente terminou o sync inicial
      if (contactCount > 100) {
        console.log(`?? [FORCE FULL SYNC] ? Sync parece completo com ${contactCount} contatos`);
        break;
      }

      attempts++;
    }

    console.log(`\n========================================`);
    console.log(`?? [FORCE FULL SYNC] ? CONCLU�DO!`);
    console.log(`?? [FORCE FULL SYNC] Total de contatos sincronizados: ${contactCount}`);
    console.log(`========================================\n`);

    return {
      success: true,
      message: `? Sincroniza��o completa! ${contactCount} contatos encontrados.`
    };

  } catch (error) {
    console.error(`?? [FORCE FULL SYNC] ? Erro:`, error);
    return {
      success: false,
      message: `Erro na sincroniza��o: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

// For�a reset COMPLETO - apaga arquivos de autentica��o (for�a novo QR Code)
export async function forceResetWhatsApp(userId: string, connectionId?: string): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: Bloquear reset para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] forceResetWhatsApp bloqueado para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sess�es do WhatsApp em produ��o n�o ser�o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sess�es em produ��o.');
  }
  
  const lookupKey = connectionId || userId;
  console.log(`[FORCE RESET] Starting complete reset for ${lookupKey}...`);
  
  // Limpar sess�o existente na mem�ria (se houver)
  const existingSession = sessions.get(lookupKey);
  if (existingSession?.socket) {
    console.log(`[FORCE RESET] Found existing session in memory, closing it...`);
    try {
      existingSession.socket.end(undefined);
    } catch (e) {
      console.log(`[FORCE RESET] Error closing existing socket (ignoring):`, e);
    }
    sessions.delete(lookupKey);
    unregisterWhatsAppSession(lookupKey);
  }
  
  // Limpar pending connections e tentativas de reconex�o
  clearPendingConnectionLock(lookupKey, 'force_reset');
  reconnectAttempts.delete(lookupKey);
  
  // APAGAR arquivos de autentica��o (for�a novo QR Code)
  // For secondary connections, ONLY clear auth_{connectionId} (don't touch primary's auth_{userId})
  let isSecondary = false;
  if (connectionId) {
    const connRecord = await storage.getConnectionById(connectionId);
    isSecondary = connRecord?.isPrimary === false;
  }
  
  if (isSecondary && connectionId) {
    // Secondary: only clear its own auth dir
    const connAuthPath = path.join(SESSIONS_BASE, `auth_${connectionId}`);
    await clearAuthFiles(connAuthPath);
    console.log(`[FORCE RESET] Auth files cleared for secondary connection ${connectionId.substring(0, 8)}`);
  } else {
    // Primary: clear both possible paths
    const authPath = path.join(SESSIONS_BASE, `auth_${userId}`);
    await clearAuthFiles(authPath);
    if (connectionId && connectionId !== userId) {
      const connAuthPath = path.join(SESSIONS_BASE, `auth_${connectionId}`);
      await clearAuthFiles(connAuthPath);
    }
    console.log(`[FORCE RESET] Auth files cleared for user ${userId}`);
  }
  
  // Atualizar banco de dados
  let connection;
  if (connectionId) {
    connection = await storage.getConnectionById(connectionId);
  } else {
    connection = await storage.getConnectionByUserId(userId);
  }
  if (connection) {
    await storage.updateConnection(connection.id, {
      isConnected: false,
      qrCode: null,
    });
  }
  
  console.log(`[FORCE RESET] Complete reset done for ${lookupKey}. User will need to scan new QR code.`);
}

interface ConnectWhatsAppOptions {
  openTimeoutMs?: number;
  source?: string;
}

export async function connectWhatsApp(
  userId: string,
  targetConnectionId?: string,
  options?: ConnectWhatsAppOptions,
): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: Bloquear conex�es para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] Conex�o WhatsApp bloqueada para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sess�es do WhatsApp em produ��o n�o ser�o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sess�es em produ��o.');
  }
  
  // ?? Determine the connection lock key: use connectionId if provided, otherwise userId
  const lockKey = targetConnectionId || userId;
  const connectSource = options?.source || "direct";
  const effectiveOpenTimeoutMs = Math.max(options?.openTimeoutMs ?? CONNECT_OPEN_TIMEOUT_MS, 15_000);

  // Prevent reconnect storms after open-timeout for automated flows.
  if (shouldApplyOpenTimeoutCooldown(connectSource)) {
    const scopeKeys = [lockKey, userId];
    if (targetConnectionId && targetConnectionId !== lockKey) {
      scopeKeys.push(targetConnectionId);
    }
    const remaining = await getMaxOpenTimeoutCooldownRemainingMs(scopeKeys);
    if (remaining > 0) {
      const cooldownError = new Error(
        `Reconnect blocked by open-timeout cooldown (${Math.ceil(remaining / 1000)}s remaining, source=${connectSource})`,
      );
      (cooldownError as any).code = "WA_OPEN_TIMEOUT_COOLDOWN";
      throw cooldownError;
    }
  }
  
  // ? FIX: Evict stale locks before checking
  evictStalePendingLocks();
  
  // ? Verificar se j� existe uma conex�o em andamento
  const existingPendingConnection = pendingConnections.get(lockKey);
  if (existingPendingConnection) {
    console.log(`[CONNECT] Connection already in progress for ${lockKey}, waiting for it to complete...`);
    return existingPendingConnection.promise;
  }

  let distributedLock: DistributedLockHandle | undefined;
  const distributedLockTtlMs = Math.max(
    effectiveOpenTimeoutMs + WA_REDIS_PENDING_LOCK_EXTRA_MS,
    PENDING_LOCK_TTL_MS,
  );
  if (WA_REDIS_CONNECT_LOCK_ENABLED && isRedisAvailable()) {
    const lockResult = await tryAcquireDistributedLock(
      toDistributedPendingLockKey(lockKey),
      distributedLockTtlMs,
    );
    if (lockResult.status === "acquired") {
      distributedLock = lockResult.lock;
      console.log(
        `?? [PENDING LOCK][REDIS] Acquired distributed lock for ${lockKey.substring(0, 8)}... ttl=${Math.round(
          distributedLockTtlMs / 1000,
        )}s`,
      );
    } else if (lockResult.status === "busy") {
      const remainingSec = Math.max(1, Math.ceil(lockResult.remainingMs / 1000));
      console.log(
        `?? [PENDING LOCK][REDIS] Lock busy for ${lockKey.substring(0, 8)}... (${remainingSec}s remaining). Skipping duplicate connect attempt.`,
      );
      return;
    }
  }

  // ?? Resetar contador de tentativas de reconex�o quando usu�rio inicia conex�o manualmente
  reconnectAttempts.delete(lockKey);

  // ?? CR�TICO: Criar e registrar a promise IMEDIATAMENTE para evitar race conditions
  let resolveConnection: () => void;
  let rejectConnection: (error: Error) => void;
  let connectionPromiseSettled = false;
  let connectionOpenTimeout: NodeJS.Timeout | undefined;
  
  const connectionPromise = new Promise<void>((resolve, reject) => {
    resolveConnection = resolve;
    rejectConnection = reject;
  });

  const settleConnectionPromise = (
    mode: "resolve" | "reject",
    reason: string,
    error?: Error,
  ): void => {
    if (connectionPromiseSettled) {
      return;
    }
    connectionPromiseSettled = true;
    if (connectionOpenTimeout) {
      clearTimeout(connectionOpenTimeout);
      connectionOpenTimeout = undefined;
    }

    if (mode === "resolve") {
      console.log(`[CONNECT] Connection promise resolved for ${lockKey} (${reason})`);
      resolveConnection!();
      return;
    }

    const rejectError = error || new Error(`Connection failed before open (${reason})`);
    console.log(`[CONNECT] Connection promise rejected for ${lockKey} (${reason}): ${rejectError.message}`);
    rejectConnection!(rejectError);
  };
  
  // Registrar ANTES de qualquer opera��o async � now with metadata
  const pendingEntry: PendingConnectionEntry = {
    promise: connectionPromise,
    startedAt: Date.now(),
    connectionId: targetConnectionId,
    userId,
    distributedLock,
  };
  pendingConnections.set(lockKey, pendingEntry);
  if (pendingEntry.distributedLock) {
    registerDistributedPendingLockRefresh(lockKey, pendingEntry, distributedLockTtlMs);
  }
  console.log(`[CONNECT] Registered pending connection for user ${userId}${targetConnectionId ? ` (connectionId: ${targetConnectionId})` : ''}`);

  // Agora executar a l�gica de conex�o
  (async () => {
    try {
      console.log(`[CONNECT] Starting connection for user ${userId}${targetConnectionId ? ` connectionId=${targetConnectionId}` : ''}...`);
      
      // Verificar se j� existe uma sess�o ativa para esta conex�o espec�fica
      const existingSession = targetConnectionId ? sessions.get(targetConnectionId) : sessions.get(userId);
      if (existingSession?.socket) {
        const wsReadyState = getSessionWsReadyState(existingSession);
        const isSocketOperational = hasOperationalSocket(existingSession);
        if (isSocketOperational && existingSession.isOpen === true) {
          console.log(`[CONNECT] ${lockKey} already has an active/open session, reusing existing socket`);
          clearPendingConnectionLock(lockKey, 'already_connected');
          settleConnectionPromise("resolve", "already_connected");
          return;
        } else {
          // Sess�o existe mas n�o est� conectada - limpar e recriar
          console.log(
            `[CONNECT] ${lockKey} has stale session (isOpen=${existingSession.isOpen}, hasUser=${existingSession.socket.user !== undefined}, wsReadyState=${wsReadyState ?? 'unknown'}), cleaning up...`,
          );
          try {
            existingSession.socket.end(undefined);
          } catch (e) {
            console.log(`[CONNECT] Error closing stale socket:`, e);
          }
          sessions.delete(existingSession.connectionId);
        }
      }

      // Get the specific connection record
      let connection: any;
      if (targetConnectionId) {
        // Specific connection requested (multi-connection)
        connection = await storage.getConnectionById(targetConnectionId);
        if (!connection || connection.userId !== userId) {
          throw new Error(`Connection ${targetConnectionId} not found or unauthorized`);
        }
      } else {
        // Legacy: get primary connection for user
        connection = await storage.getConnectionByUserId(userId);
      }
    
    if (!connection) {
      console.log(`[CONNECT] No connection record found, creating new one for ${userId}`);
      connection = await storage.createConnection({
        userId,
        isConnected: false,
      });
    } else {
      console.log(`[CONNECT] Found existing connection record for ${userId} (connId=${connection.id}): isConnected=${connection.isConnected}`);
    }

    // Auth path: determine based on whether this is a primary or secondary connection
    // Primary connection: check auth_{userId} first, fall back to auth_{connectionId}
    // Secondary connection: ALWAYS use auth_{connectionId} (separate phone number)
    const isSecondaryConnection = connection.isPrimary === false || (targetConnectionId && connection.id !== userId && connection.connectionType === 'secondary');
    
    let userAuthPath: string;
    let authFileCount = 0;
    
    if (isSecondaryConnection) {
      // Secondary connections always use their own connectionId-based auth dir
      userAuthPath = path.join(SESSIONS_BASE, `auth_${connection.id}`);
      console.log(`[CONNECT] Secondary connection - using auth_${connection.id.substring(0, 8)}`);
      try {
        const authFiles = await fs.readdir(userAuthPath);
        authFileCount = authFiles.length;
      } catch (e) {
        // dir doesn't exist yet - will show QR
      }
    } else {
      // Primary connection: check auth_{userId} first, fall back to auth_{connectionId}
      userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
      try {
        const authFiles = await fs.readdir(userAuthPath);
        authFileCount = authFiles.length;
      } catch (e) {
        // dir doesn't exist
      }
      
      // If auth_{userId} is empty/missing, try auth_{connectionId}
      if (authFileCount === 0 && connection.id && connection.id !== userId) {
        const connAuthPath = path.join(SESSIONS_BASE, `auth_${connection.id}`);
        try {
          const connAuthFiles = await fs.readdir(connAuthPath);
          if (connAuthFiles.length > 0) {
            console.log(`[CONNECT] Found auth files at auth_${connection.id.substring(0, 8)} (${connAuthFiles.length} files) - using connectionId path`);
            userAuthPath = connAuthPath;
            authFileCount = connAuthFiles.length;
          }
        } catch (e) {
          // dir doesn't exist either
        }
      }
    }
    
    await ensureDirExists(userAuthPath);
    console.log(`[CONNECT] Auth path: ${userAuthPath.split('/').pop()} (${authFileCount > 0 ? authFileCount + ' files' : 'EMPTY - will show QR'})`);
    
    const { state, saveCreds } = await useMultiFileAuthState(userAuthPath);

    // FIX LID 2025: Cache manual para mapear @lid ? phone number
    const contactsCache = new Map<string, Contact>();

    console.log(`[CONNECT] Creating WASocket for ${userId}...`);
    // Create a custom Baileys logger that captures CTWA-related debug messages
    // while keeping everything else silent to avoid log flooding.
    // NOTE: Avoid logging raw Baileys error objects here (they can contain huge
    // payloads and sensitive session internals that flood logs and hurt latency).
    const getBaileysLogText = (arg: any): string => {
      if (arg == null) return "";
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.message || String(arg);
      if (typeof arg === "object") {
        const candidate = [
          arg.message,
          arg.msg,
          arg.error?.message,
          arg.err?.message,
          arg.fullErrorNode?.tag,
          arg.fullErrorNode?.attrs?.code,
          arg.reason,
          arg.type,
        ]
          .filter((item) => typeof item === "string" && item.length > 0)
          .join(" ");
        if (candidate) return candidate;
      }
      return "";
    };
    const summarizeBaileysArgs = (...args: any[]): string => {
      const summary = args
        .map((arg) => getBaileysLogText(arg))
        .filter(Boolean)
        .join(" | ")
        .slice(0, 300);
      return summary;
    };
    // Create a selective wrapper that only outputs CTWA/PDO related messages
    const isCTWARelated = (...args: any[]) => {
      const str = summarizeBaileysArgs(...args).toLowerCase();
      return (
        str.includes("placeholder") ||
        str.includes("absent") ||
        str.includes("pdo") ||
        str.includes("peerdata") ||
        str.includes("unavailable_fanout")
      );
    };
    const isDecryptNoise = (...args: any[]) => {
      const str = summarizeBaileysArgs(...args).toLowerCase();
      return str.includes("no session found to decrypt message") || str.includes("failed to decrypt message");
    };
    const ctwaLogger: any = {
      level: 'debug',
      fatal: (...args: any[]) => {
        const summary = summarizeBaileysArgs(...args);
        if (summary) console.error(`?? [BAILEYS] ${summary}`);
      },
      error: (...args: any[]) => {
        if (isDecryptNoise(...args)) return;
        if (!isCTWARelated(...args)) return;
        const summary = summarizeBaileysArgs(...args);
        if (summary) console.error(`? [BAILEYS-CTWA] ${summary}`);
      },
      warn: (...args: any[]) => {
        if (!isCTWARelated(...args)) return;
        const summary = summarizeBaileysArgs(...args);
        if (summary) console.warn(`?? [BAILEYS-CTWA] ${summary}`);
      },
      info: (...args: any[]) => {
        if (!isCTWARelated(...args)) return;
        const summary = summarizeBaileysArgs(...args);
        if (summary) console.log(`?? [BAILEYS-CTWA] ${summary}`);
      },
      debug: (...args: any[]) => {
        if (!isCTWARelated(...args)) return;
        const summary = summarizeBaileysArgs(...args);
        if (summary) console.log(`?? [BAILEYS-CTWA] ${summary}`);
      },
      trace: (...args: any[]) => { /* silent */ },
      child: () => ctwaLogger,
    };
    
    // Full history sync is expensive and should only run on first link/new auth.
    // On normal reconnects it can delay live processing and replay old messages.
    const shouldEnableFullHistorySync =
      process.env.WA_ENABLE_FULL_HISTORY_SYNC === "true" || !connection.phoneNumber;
    const shouldReplayHistoryMessages = process.env.WA_ENABLE_HISTORY_REPLAY === "true";
    console.log(
      `[CONNECT] History sync mode for conn ${connection.id.substring(0, 8)}: fullSync=${shouldEnableFullHistorySync} replay=${shouldReplayHistoryMessages}`,
    );

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      // FIX 2026-02: Custom CTWA-intercepting logger
      // Captures CTWA/PDO/placeholder debug messages from Baileys while keeping other logs silent
      logger: ctwaLogger as any,
      // ======================================================================
      // ?? FIX 2025: SINCRONIZA��O COMPLETA DE CONTATOS DA AGENDA
      // ======================================================================
      // IMPORTANTE: Estas configura��es fazem o Baileys receber TODOS os
      // contatos da agenda do WhatsApp na PRIMEIRA conex�o ap�s scan do QR.
      //
      // 1. browser: Browsers.macOS('Desktop') - Emula conex�o desktop para
      //    receber hist�rico completo (mais contatos e mensagens)
      // 2. syncFullHistory: true - Habilita sync completo de contatos e hist�rico
      // 3. shouldSyncHistoryMessage: () => true - Necess�rio ap�s atualiza��o
      //    do Baileys (master 2026-02) que mudou o default para pular FULL sync
      //
      // O evento contacts.upsert ser� disparado com TODOS os contatos logo
      // ap�s o QR Code ser escaneado e conex�o estabelecida.
      // Ref: https://github.com/WhiskeySockets/Baileys/issues/266
      // ======================================================================
      browser: Browsers.macOS('Desktop'),
      // -----------------------------------------------------------------------
      // FIX 2026-02-24: WhatsApp rejeitou Platform.WEB (405 error)
      // Vers�o fixa que funciona com Platform.MACOS
      // Ref: https://github.com/WhiskeySockets/Baileys/issues/2370
      // -----------------------------------------------------------------------
      version: [2, 3000, 1033893291],
      // -----------------------------------------------------------------------
      // FIX 2026-02-24: Estabilidade de conex�o para SaaS multi-session
      // connectTimeoutMs: Aumentado para 60s (auth com 3000+ files demora)
      // keepAliveIntervalMs: 25s heartbeat (evita 408 timeout com 70+ sess�es)
      // retryRequestDelayMs: Retry r�pido de requests falhados
      // -----------------------------------------------------------------------
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 250,
      syncFullHistory: shouldEnableFullHistorySync,
      shouldSyncHistoryMessage: () => shouldEnableFullHistorySync,
      // -----------------------------------------------------------------------
      // FIX 2026: Evita que WhatsApp redirecione mensagens pro Baileys
      // Sem isso, mensagens ficam como "Aguardando mensagem" no celular
      // Ref: https://github.com/WhiskeySockets/Baileys/issues/1767
      // -----------------------------------------------------------------------
      markOnlineOnConnect: false,
      // -----------------------------------------------------------------------
      // FIX 2026-02-25: Ignore status@broadcast to reduce noise and processing
      // Ref: https://github.com/WhiskeySockets/Baileys/issues/2364
      // -----------------------------------------------------------------------
      shouldIgnoreJid: (jid: string) => jid === 'status@broadcast',
      // -----------------------------------------------------------------------
      // ?? FIX "AGUARDANDO PARA CARREGAR MENSAGEM" (WAITING FOR MESSAGE)
      // -----------------------------------------------------------------------
      // Esta fun??o ? chamada pelo Baileys quando precisa reenviar uma mensagem
      // que falhou na decripta??o. Sem ela, o WhatsApp mostra "Aguardando..."
      // 
      // Ref: https://github.com/WhiskeySockets/Baileys/issues/1767
      // -----------------------------------------------------------------------
      getMessage: async (key) => {
        if (!key.id) return undefined;
        
        console.log(`?? [getMessage] Baileys solicitou mensagem ${key.id} para retry`);
        
        // Tentar recuperar do cache em mem?ria
        const cached = getCachedMessage(userId, key.id);
        if (cached) {
          return cached;
        }
        
        // Fallback: tentar buscar do banco de dados
        try {
          const dbMessage = await storage.getMessageByMessageId(key.id);
          if (dbMessage) {
            console.log(`?? [getMessage] Mensagem ${key.id} recuperada do banco de dados (tipo: ${(dbMessage as any).messageType || 'text'})`);
            // FIX 2026: Retornar proto.IMessage completo quando dispon�vel
            // Para m�dia, o formato { conversation: text } n�o funciona no retry
            if ((dbMessage as any).rawMessage) {
              try {
                const raw = JSON.parse((dbMessage as any).rawMessage);
                return raw;
              } catch {}
            }
            if (dbMessage.text) {
              return { conversation: dbMessage.text };
            }
          }
        } catch (err) {
          console.error(`? [getMessage] Erro ao buscar mensagem do banco:`, err);
        }
        
        console.log(`?? [getMessage] Mensagem ${key.id} n?o encontrada em nenhum cache`);
        return undefined;
      },
    });

    // ======================================================================
    // ?? CTWA FIX VERIFICATION: Verify Baileys has PR #2334 CTWA fix loaded
    // ======================================================================
    try {
      // Test 1: Check if proto has PLACEHOLDER_MESSAGE_RESEND (basic proto check)
      const hasPDOType = !!(proto?.Message?.PeerDataOperationRequestType as any)?.PLACEHOLDER_MESSAGE_RESEND;
      // Test 2: Check if proto has CIPHERTEXT stub type (used by CTWA fix)
      const hasCiphertextStub = !!(proto?.Message?.MessageStubType as any)?.CIPHERTEXT;
      // Test 3: Read package version from Baileys (via createRequire for ESM compat)
      let baileysVersion = 'unknown';
      try {
        const { createRequire } = await import('module');
        const req = createRequire(import.meta.url);
        const pkg = req('@whiskeysockets/baileys/package.json');
        baileysVersion = pkg.version || 'no-version';
      } catch { baileysVersion = 'read-failed'; }
      
      console.log(`?? [CTWA-STARTUP] Baileys v${baileysVersion} | PLACEHOLDER_MESSAGE_RESEND=${hasPDOType} | CIPHERTEXT_STUB=${hasCiphertextStub}`);
      if (hasPDOType) {
        console.log(`? [CTWA-STARTUP] Baileys CTWA fix (PR #2334) proto definitions present. PDO placeholder resend should work.`);
      } else {
        console.error(`? [CTWA-STARTUP] Baileys may be missing CTWA fix proto definitions!`);
      }
    } catch (e) {
      console.error(`?? [CTWA-STARTUP] Could not verify Baileys CTWA fix:`, e);
    }

    const session: WhatsAppSession = {
      socket: sock,
      userId,
      connectionId: connection.id,
      contactsCache,
      isOpen: false,
      createdAt: Date.now(),
    };

    // ?? MULTI-CONNECTION: Store by connectionId (SessionMap handles userId lookups)
    sessions.set(connection.id, session);

    // Failsafe para n�o manter lock/promise indefinidamente quando "open" nunca chega.
    connectionOpenTimeout = setTimeout(() => {
      const currentSession = sessions.get(session.connectionId);
      if (currentSession?.socket !== sock || currentSession?.isOpen === true) {
        return;
      }
      const timeoutError = new Error(`Connection did not reach open within ${effectiveOpenTimeoutMs}ms`);
      console.log(`?? [CONNECT] OPEN TIMEOUT for user ${userId.substring(0, 8)}... conn ${session.connectionId.substring(0, 8)} � closing socket`);
      registerOpenTimeoutCooldown(session.connectionId, "open_timeout");
      registerOpenTimeoutCooldown(userId, "open_timeout");
      clearPendingConnectionLock(session.connectionId, 'connect_open_timeout');
      clearPendingConnectionLock(userId, 'connect_open_timeout');
      try {
        sock.end(timeoutError);
      } catch (_endErr) {
        // noop
      }
      sessions.delete(session.connectionId);
      settleConnectionPromise("reject", "open_timeout", timeoutError);
    }, effectiveOpenTimeoutMs);
    session.openTimeout = connectionOpenTimeout;
    
    // ?? Registrar sess�o no servi�o de envio para notifica��es do sistema (delivery, etc)
    registerWhatsAppSession(userId, sock);

    // ======================================================================
    // FIX LID 2025 - CACHE WARMING (Carregar contatos do DB para mem?ria)
    // ======================================================================
    // Previne race condition: mensagens @lid chegam antes de contacts.upsert
    try {
      const dbContacts = await storage.getContactsByConnectionId(connection.id);
      console.log(`[CACHE WARMING] Loading ${dbContacts.length} contacts from DB...`);
      
      for (const dbContact of dbContacts) {
        const contact: Contact = {
          id: dbContact.contactId,
          lid: dbContact.lid || undefined,
          phoneNumber: dbContact.phoneNumber || undefined,
          name: dbContact.name || undefined,
        };
        
        contactsCache.set(dbContact.contactId, contact);
        if (dbContact.lid) {
          contactsCache.set(dbContact.lid, contact);
        }
      }
      
      console.log(`[CACHE WARMING] ? Loaded ${dbContacts.length} contacts into memory`);
    } catch (error) {
      console.error(`[CACHE WARMING] ? Failed to load contacts:`, error);
    }

    // ======================================================================
    // ?? CONTACTS SYNC - SINCRONIZA��O COMPLETA DA AGENDA DO WHATSAPP
    // ======================================================================
    // IMPORTANTE: Este evento � disparado pelo Baileys com TODOS os contatos
    // da agenda do WhatsApp na PRIMEIRA conex�o ap�s scan do QR Code.
    //
    // Com a configura��o browser: Browsers.macOS('Desktop') + syncFullHistory: true,
    // o Baileys emula uma conex�o desktop que recebe hist�rico completo.
    //
    // Ref: https://github.com/WhiskeySockets/Baileys/issues/266
    // "After scanning the QR code and establishing the first connection,
    // 'contacts.upsert' transmits the entire contact list once."
    // ======================================================================
    sock.ev.on("contacts.upsert", async (contacts) => {
      console.log(`\n========================================`);
      console.log(`?? [CONTACTS.UPSERT] Baileys emitiu ${contacts.length} contatos`);
      console.log(`?? [CONTACTS.UPSERT] User ID: ${userId}`);
      console.log(`?? [CONTACTS.UPSERT] Connection ID: ${connection.id}`);
      console.log(`?? [CONTACTS.UPSERT] Primeiro contato: ${contacts[0]?.id || 'N/A'}`);
      console.log(`?? [CONTACTS.UPSERT] �ltimo contato: ${contacts[contacts.length - 1]?.id || 'N/A'}`);
      console.log(`========================================\n`);

      // Array para novos contatos desta batch
      const newAgendaContacts: AgendaContact[] = [];
      // Array para persistir no banco de dados
      const dbContacts: Array<{
        connectionId: string;
        contactId: string;
        lid?: string;
        phoneNumber?: string;
        name?: string;
      }> = [];

      for (const contact of contacts) {
        // Extrair n�mero do contact.id quando phoneNumber n�o vem preenchido
        let phoneNumber = contact.phoneNumber || null;
        if (!phoneNumber && contact.id) {
          const match = contact.id.match(/^(\d+)@/);
          if (match) {
            phoneNumber = match[1];
          }
        }

        // 1. Atualizar cache em mem�ria da sess�o (para resolver @lid)
        contactsCache.set(contact.id, contact);
        if (contact.lid) {
          contactsCache.set(contact.lid, contact);
        }

        // 2. Preparar para salvar no banco de dados
        dbContacts.push({
          connectionId: connection.id,
          contactId: contact.id,
          lid: contact.lid || undefined,
          phoneNumber: phoneNumber || undefined,
          name: contact.name || contact.notify || undefined,
        });

        // 3. Adicionar ao array de agenda (se tiver n�mero v�lido)
        if (phoneNumber && phoneNumber.length >= 8) {
          newAgendaContacts.push({
            id: contact.id,
            phoneNumber: phoneNumber,
            name: contact.name || contact.notify || '',
            lid: contact.lid,
          });
        }
      }

      // 4. PERSISTIR NO BANCO DE DADOS - IMPORTANTE!
      // Salvar contatos no banco para n�o perder em restart
      try {
        if (dbContacts.length > 0) {
          await storage.batchUpsertContacts(dbContacts);
          console.log(`?? [CONTACTS.UPSERT] ?? Salvou ${dbContacts.length} contatos no banco de dados`);
        }
      } catch (dbError) {
        console.error(`?? [CONTACTS.UPSERT] ? Erro ao salvar contatos no DB:`, dbError);
      }

      // 5. IMPORTANTE: Mesclar com contatos existentes no cache (acumula m�ltiplas batches)
      // O Baileys pode emitir contacts.upsert m�ltiplas vezes durante a sincroniza��o inicial
      const existingCache = getAgendaContacts(userId);
      const existingContacts = existingCache?.contacts || [];
      const existingPhones = new Set(existingContacts.map(c => c.phoneNumber));

      // Filtrar apenas contatos novos (evitar duplicatas)
      const uniqueNewContacts = newAgendaContacts.filter(c => !existingPhones.has(c.phoneNumber));
      const mergedContacts = [...existingContacts, ...uniqueNewContacts];

      if (mergedContacts.length > 0) {
        saveAgendaToCache(userId, mergedContacts);

        // Broadcast para o frontend informando que os contatos est�o prontos
        broadcastToUser(userId, {
          type: "agenda_synced",
          count: mergedContacts.length,
          status: "ready",
          message: `?? ${mergedContacts.length} contatos sincronizados da agenda!`
        });

        console.log(`?? [CONTACTS.UPSERT] ? Novos: ${uniqueNewContacts.length} | Total no cache: ${mergedContacts.length}`);
      } else {
        console.log(`?? [CONTACTS.UPSERT] ?? Nenhum contato v�lido encontrado nesta batch`);
      }
    });

    // ======================================================================
    // ?? HISTORY SYNC - BUSCA TODOS OS CONTATOS DO HIST�RICO DO WHATSAPP
    // ======================================================================
    // Este evento � disparado durante o sync inicial e traz TODOS os contatos
    // do hist�rico do WhatsApp (chats, contacts, messages)
    // Ref: https://baileys.wiki/docs/socket/history-sync/
    // ======================================================================
    sock.ev.on("messaging-history.set", async ({ chats, contacts, messages, isLatest }) => {
      if (!shouldEnableFullHistorySync) {
        return;
      }

      console.log(`\n========================================`);
      console.log(`[HISTORY SYNC] ?? Baileys emitiu messaging-history.set`);
      console.log(`[HISTORY SYNC] User ID: ${userId}`);
      console.log(`[HISTORY SYNC] Chats: ${chats?.length || 0}`);
      console.log(`[HISTORY SYNC] Contacts: ${contacts?.length || 0}`);
      console.log(`[HISTORY SYNC] Messages: ${messages?.length || 0}`);
      console.log(`[HISTORY SYNC] isLatest: ${isLatest}`);
      console.log(`========================================\n`);

      // -------------------------------------------------------------------------
      // FIX 2026: Processar mensagens RECENTES do history sync para auto-resposta
      // Mensagens que chegaram durante desconex�o precisam ser processadas
      // -------------------------------------------------------------------------
      if (shouldReplayHistoryMessages && messages && messages.length > 0) {
        const now = Date.now();
        const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutos
        let processedCount = 0;

        for (const msg of messages) {
          if (!msg || !msg.key || msg.key.fromMe) continue;
          if (!msg.key.remoteJid || msg.key.remoteJid.includes('@g.us') || msg.key.remoteJid.includes('@broadcast')) continue;
          if (!msg.message) continue;

          const msgTs = Number(msg.messageTimestamp) * 1000;
          const age = now - msgTs;
          if (age > MAX_AGE_MS) continue;

          // Cachear para getMessage retry
          if (msg.key.id && msg.message) {
            cacheMessage(userId, msg.key.id, msg.message);
          }

          // Re-emitir como upsert notify para processamento
          processedCount++;
          sock.ev.emit('messages.upsert', {
            type: 'notify',
            messages: [msg as any],
          });
        }

        if (processedCount > 0) {
          console.log(`[HISTORY SYNC] ?? ${processedCount} mensagens recentes re-emitidas para processamento`);
        }
      }

      // Processar contatos do hist�rico
      if (contacts && contacts.length > 0) {
        const agendaContacts: AgendaContact[] = [];

        for (const contact of contacts) {
          // Extrair n�mero do contact.id
          let phoneNumber: string | null = null;

          // Tentar pegar do phoneNumber primeiro
          if (contact.id) {
            const match = contact.id.match(/^(\d+)@/);
            if (match && match[1].length >= 8) {
              phoneNumber = match[1];
            }
          }

          if (phoneNumber) {
            // Adicionar ao cache da sess�o
            contactsCache.set(contact.id, contact);

            // Adicionar ao array de agenda
            agendaContacts.push({
              id: contact.id,
              phoneNumber: phoneNumber,
              name: contact.name || contact.notify || '',
              lid: undefined,
            });
          }
        }

        // Merge com contatos existentes no cache
        const existingCache = getAgendaContacts(userId);
        const existingContacts = existingCache?.contacts || [];
        const existingPhones = new Set(existingContacts.map(c => c.phoneNumber));

        // Adicionar novos contatos (sem duplicatas)
        const newContacts = agendaContacts.filter(c => !existingPhones.has(c.phoneNumber));
        const mergedContacts = [...existingContacts, ...newContacts];

        if (mergedContacts.length > 0) {
          saveAgendaToCache(userId, mergedContacts);

          console.log(`[HISTORY SYNC] ? ${newContacts.length} novos contatos adicionados`);
          console.log(`[HISTORY SYNC] ?? Total no cache: ${mergedContacts.length} contatos`);

          // Broadcast para o frontend
          broadcastToUser(userId, {
            type: "agenda_synced",
            count: mergedContacts.length,
            status: "ready",
            message: `?? ${mergedContacts.length} contatos sincronizados do hist�rico!`
          });
        }
      }

      // Processar chats para extrair contatos adicionais
      if (chats && chats.length > 0) {
        const chatContacts: AgendaContact[] = [];

        for (const chat of chats) {
          // Ignorar grupos
          if (chat.id?.endsWith('@g.us')) continue;

          // Extrair n�mero do chat.id
          const match = chat.id?.match(/^(\d+)@/);
          if (match && match[1].length >= 8) {
            const phoneNumber = match[1];

            // Verificar se j� n�o est� no cache
            const existingCache = getAgendaContacts(userId);
            const existingPhones = new Set((existingCache?.contacts || []).map(c => c.phoneNumber));

            if (!existingPhones.has(phoneNumber)) {
              chatContacts.push({
                id: chat.id,
                phoneNumber: phoneNumber,
                name: chat.name || '',
                lid: undefined,
              });
            }
          }
        }

        if (chatContacts.length > 0) {
          const existingCache = getAgendaContacts(userId);
          const existingContacts = existingCache?.contacts || [];
          const mergedContacts = [...existingContacts, ...chatContacts];

          saveAgendaToCache(userId, mergedContacts);

          console.log(`[HISTORY SYNC] ?? ${chatContacts.length} contatos adicionados dos chats`);
          console.log(`[HISTORY SYNC] ?? Total no cache: ${mergedContacts.length} contatos`);

          // Broadcast atualizado
          broadcastToUser(userId, {
            type: "agenda_synced",
            count: mergedContacts.length,
            status: "ready",
            message: `?? ${mergedContacts.length} contatos sincronizados!`
          });
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection: conn, lastDisconnect, qr } = update;

      // -----------------------------------------------------------------------
      // ?? LOGS ESTRUTURADOS PARA DEBUG
      // -----------------------------------------------------------------------
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const errorMessage = (lastDisconnect?.error as any)?.message;

      console.log(`[CONNECTION UPDATE] User ${userId.substring(0, 8)}... - connection: ${conn}, hasQR: ${!!qr}, statusCode: ${statusCode || 'none'}`);

      // Fallback for cases where Baileys never emits conn="open" but socket is authenticated.
      if (!conn && promoteSessionOpenState(session, 'connection_update_undefined')) {
        clearPendingConnectionLock(session.connectionId, 'implicit_open');
        clearPendingConnectionLock(userId, 'implicit_open');
        settleConnectionPromise("resolve", "implicit_open_socket_user");

        const phoneNumber = sock.user?.id?.split(":")[0] || session.phoneNumber || "";
        session.phoneNumber = phoneNumber;
        try {
          await storage.updateConnection(session.connectionId, {
            isConnected: true,
            phoneNumber,
            qrCode: null,
          });
        } catch (implicitOpenDbErr) {
          console.error(`[CONNECTION UPDATE] Failed to persist implicit open for ${session.connectionId}:`, implicitOpenDbErr);
        }
        broadcastToUser(userId, { type: "connected", phoneNumber, connectionId: session.connectionId });
        console.log(`? [CONN OPEN FALLBACK] Promoted ${session.connectionId.substring(0, 8)} via connection=undefined + socket.user`);
      }

      // Log adicional em caso de close para diagn�stico
      if (conn === "close") {
        console.log(`[CONNECTION CLOSE] Details:`, {
          userId: userId.substring(0, 8) + '...',
          statusCode,
          errorMessage: errorMessage || 'none',
          DisconnectReason: statusCode === DisconnectReason.loggedOut ? 'loggedOut' :
                           statusCode === DisconnectReason.connectionClosed ? 'connectionClosed' :
                           statusCode === DisconnectReason.connectionReplaced ? 'connectionReplaced(440)' :
                           statusCode === DisconnectReason.timedOut ? 'timedOut' :
                           `unknown(${statusCode})`
        });

        // Logar amostra dos arquivos de auth sem varrer diret�rio inteiro
        // (evita overhead alto quando h� dezenas de milhares de arquivos).
        try {
          const userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
          const sample: string[] = [];
          const dir = await fs.opendir(userAuthPath);
          try {
            for await (const entry of dir) {
              sample.push(entry.name);
              if (sample.length >= 10) break;
            }
          } finally {
            await dir.close().catch(() => undefined);
          }
          console.log(`[CONNECTION CLOSE] Auth files sample(${sample.length}): ${sample.join(", ")}`);
        } catch (e) {
          console.log(`[CONNECTION CLOSE] Could not read auth directory`);
        }
      }

      if (qr) {
        console.log(`[QR CODE] Generating QR Code for user ${userId}...`);
        try {
          const qrCodeDataURL = await QRCode.toDataURL(qr);
          console.log(`[QR CODE] QR Code generated successfully for user ${userId}, length: ${qrCodeDataURL.length}`);

          // Broadcast immediately so the client sees the QR without waiting
          // for the database write. Persist the QR asynchronously to avoid
          // making the user wait on potentially slow DB operations.
          try {
            broadcastToUser(userId, { type: "qr", qr: qrCodeDataURL, connectionId: connection.id });
            console.log(`[QR CODE] QR Code broadcasted to user ${userId} (connection: ${connection.id})`);
          } catch (bErr) {
            console.error(`[QR CODE ERROR] Failed to broadcast QR code for user ${userId}:`, bErr);
          }

          const saveStart = Date.now();
          storage
            .updateConnection(session.connectionId, { qrCode: qrCodeDataURL })
            .then(() => {
              console.log(`[QR CODE] QR Code saved to database for user ${userId} (took ${Date.now() - saveStart}ms)`);
            })
            .catch((dbErr) => {
              console.error(`[QR CODE ERROR] Failed to save QR code for user ${userId}:`, dbErr);
            });
        } catch (err) {
          console.error(`[QR CODE ERROR] Failed to generate/send QR code for user ${userId}:`, err);
        }
      }

      // Estado "connecting" - quando o QR Code foi escaneado e est� conectando
      if (conn === "connecting") {
        console.log(`User ${userId} is connecting... (connection: ${connection.id})`);
        broadcastToUser(userId, { type: "connecting", connectionId: connection.id });
      }

      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorMsg = (lastDisconnect?.error as any)?.message || '';
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        // -----------------------------------------------------------------------
        // FIX 2026-02-25: BREAKER FOR 440 (connectionReplaced) CONFLICTS
        // -----------------------------------------------------------------------
        // 440 means another device/socket took over this WhatsApp session.
        // Reconnecting would just kick the other socket, creating an infinite loop.
        // Also detect "replaced" or "conflict" in error messages.
        // -----------------------------------------------------------------------
        const isConnectionReplaced = statusCode === DisconnectReason.connectionReplaced ||
                                     statusCode === 440 ||
                                     /replaced|conflict/i.test(errorMsg);
        if (isConnectionReplaced) {
          waObservability.conflict440Count++;
          console.log(`[440 CONFLICT] ? Connection ${connection.id.substring(0, 8)} replaced by another session (status=${statusCode}). NOT reconnecting to prevent infinite loop.`);
          console.log(`[440 CONFLICT] Error: ${errorMsg}`);
          // Clean up session but do NOT reconnect
          const currentSession440 = sessions.get(connection.id);
          if (currentSession440?.socket !== sock) {
            console.log(`[440 CONFLICT] Stale socket, ignoring.`);
            settleConnectionPromise("reject", "440_conflict_stale_socket", new Error("440 conflict received from stale socket"));
            return;
          }
          if (currentSession440?.openTimeout) {
            clearTimeout(currentSession440.openTimeout);
            currentSession440.openTimeout = undefined;
          }
          currentSession440.isOpen = false;
          sessions.delete(connection.id);
          clearPendingConnectionLock(connection.id, '440_conflict');
          clearPendingConnectionLock(userId, '440_conflict');
          settleConnectionPromise("reject", "440_conflict", new Error(`Connection replaced/conflict (status=${statusCode})`));
          await storage.updateConnection(connection.id, { isConnected: false, qrCode: null });
          broadcastToUser(userId, { type: "disconnected", reason: "connection_replaced", connectionId: connection.id });
          reconnectAttempts.delete(connection.id);
          return; // EXIT � do NOT reconnect
        }

        // -----------------------------------------------------------------------
        // ?? GUARD CONTRA SOCKET STALE
        // -----------------------------------------------------------------------
        // Um socket "antigo" pode fechar depois que um socket mais novo j� conectou.
        // Se processarmos o close do socket antigo, vamos apagar a sess�o nova e
        // marcar isConnected=false no banco, mesmo com o socket ativo.
        //
        // Solu��o: verificar se este sock ainda � o socket atual antes de tomar
        // a��es destrutivas (delete, update DB, reconnect).
        // -----------------------------------------------------------------------
        const currentSession = sessions.get(connection.id);

        if (currentSession?.socket !== sock) {
          console.log(`[CONNECTION CLOSE] ?? STALE SOCKET IGNORED - Connection ${connection.id.substring(0, 8)}... User ${userId.substring(0, 8)}...`);
          console.log(`[CONNECTION CLOSE] Current socket differs from closing socket, ignoring close event`);
          // FIX 2026-05-27: Do NOT settle the promise here. This close event belongs
          // to a stale (old) socket � the current socket is still alive and its own
          // event handlers will resolve or reject its promise in due course.
          return;
        }

        // -----------------------------------------------------------------------
        // ??? SISTEMA DE RECUPERA��O: Registrar desconex�o
        // -----------------------------------------------------------------------
        // Salvar evento de desconex�o para diagn�stico e recupera��o
        try {
          const disconnectReason = (lastDisconnect?.error as any)?.message ||
                                   `statusCode: ${statusCode}`;
          await logConnectionDisconnection(userId, session.connectionId, disconnectReason);
        } catch (logErr) {
          console.error(`?? [RECOVERY] Erro ao logar desconex�o:`, logErr);
        }

        // Sempre deletar a sess�o primeiro (s� se for o socket atual, verificado acima)
        // ?? MULTI-CONNECTION: Delete by connectionId, NOT userId
        // FIX 2026-02-24: Clear open timeout to prevent double reconnects
        if (session.openTimeout) {
          clearTimeout(session.openTimeout);
          session.openTimeout = undefined;
        }
        session.isOpen = false;
        if (!session.connectedAt) {
          settleConnectionPromise("reject", "close_before_open", new Error(`Connection closed before open (status=${statusCode || 'unknown'})`));
        }
        sessions.delete(session.connectionId);
        clearPendingConnectionLock(session.connectionId, 'conn_close');
        clearPendingConnectionLock(userId, 'conn_close');

        // Atualizar banco de dados - conex�o principal
        await storage.updateConnection(session.connectionId, {
          isConnected: false,
          qrCode: null,
        });

        // NOTE: In multi-connection mode, we do NOT sync other connections as disconnected.
        // Each connection has its own socket and lifecycle.

        // -----------------------------------------------------------------------
        // ??? RECONEX�O INTELIGENTE: S� reconecta se a sess�o tinha auth v�lido
        // Verifica cred_*.json no disco � sem creds = sess�o nunca completou pareamento
        // Contador ABSOLUTO com back-off exponencial (NUNCA reseta)
        // -----------------------------------------------------------------------
        const reconnectKey = session.connectionId;
        let attempt = reconnectAttempts.get(reconnectKey) || { count: 0, lastAttempt: 0 };

        if (shouldReconnect) {
          // ?? Verificar se tem arquivos de auth v�lidos no disco
          let hasValidAuth = false;
          try {
            const authPaths = [
              path.join(SESSIONS_BASE, `auth_${session.connectionId}`),
              path.join(SESSIONS_BASE, `auth_${userId}`),
            ];
            for (const authPath of authPaths) {
              try {
                const files = await fs.readdir(authPath);
                const hasCredFiles = files.some(f => f === 'creds.json');
                if (hasCredFiles) {
                  hasValidAuth = true;
                  break;
                }
              } catch { /* dir n�o existe */ }
            }
          } catch { /* erro lendo disco */ }

          if (!hasValidAuth) {
            // Sem auth no disco = sess�o nunca foi pareada com sucesso. N�O reconectar.
            console.log(`[RECONNECT] User ${userId.substring(0,8)} conn ${session.connectionId.substring(0,8)} - NO auth files on disk. Stopping reconnection (was never paired).`);
            broadcastToUser(userId, { type: "disconnected", reason: "no_auth", connectionId: session.connectionId });
            reconnectAttempts.delete(reconnectKey);
            await storage.updateConnection(session.connectionId, { qrCode: null });
          } else {
            // Tem auth � reconectar com back-off exponencial (contador NUNCA reseta)
            attempt.count++;
            attempt.lastAttempt = Date.now();
            reconnectAttempts.set(reconnectKey, attempt);
            waObservability.reconnectAttemptTotal++;

            if (attempt.count <= MAX_RECONNECT_ATTEMPTS) {
              const delayMs = RECONNECT_BACKOFF_MS[Math.min(attempt.count - 1, RECONNECT_BACKOFF_MS.length - 1)];
              console.log(`[RECONNECT] User ${userId.substring(0,8)} conn ${session.connectionId.substring(0,8)} has valid auth, reconnecting in ${delayMs/1000}s... (attempt ${attempt.count}/${MAX_RECONNECT_ATTEMPTS})`);
              if (attempt.count === 1) {
                broadcastToUser(userId, { type: "disconnected", connectionId: session.connectionId });
              }
              // ?? MULTI-CONNECTION: Reconnect the specific connection with back-off
              setTimeout(() => connectWhatsApp(userId, session.connectionId), delayMs);
            } else {
              console.log(`[RECONNECT] User ${userId.substring(0,8)} conn ${session.connectionId.substring(0,8)} - max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Auth exists but connection unstable.`);
              broadcastToUser(userId, { type: "disconnected", reason: "max_attempts", connectionId: session.connectionId });
              reconnectAttempts.delete(reconnectKey);
              await storage.updateConnection(session.connectionId, { qrCode: null });
            }
          }
        } else {
          // Foi logout (desconectado pelo celular), limpar TUDO
          console.log(`User ${userId} conn ${session.connectionId.substring(0,8)} logged out from device, clearing auth files...`);

          // Auth path: For secondary connections, only clear auth_{connectionId}
          // For primary connections, clear both possible paths
          const connRecord = await storage.getConnectionById(session.connectionId);
          const isSecondary = connRecord?.isPrimary === false;
          
          if (isSecondary) {
            // Secondary: only clear its own auth dir
            const connAuthPath = path.join(SESSIONS_BASE, `auth_${session.connectionId}`);
            await clearAuthFiles(connAuthPath);
            console.log(`[LOGOUT] Cleared auth for secondary connection ${session.connectionId.substring(0,8)}`);
          } else {
            // Primary: clear both possible paths
            const authPath = path.join(SESSIONS_BASE, `auth_${userId}`);
            await clearAuthFiles(authPath);
            if (session.connectionId !== userId) {
              const connAuthPath = path.join(SESSIONS_BASE, `auth_${session.connectionId}`);
              await clearAuthFiles(connAuthPath);
            }
          }

          broadcastToUser(userId, { type: "disconnected", reason: "logout", connectionId: session.connectionId });

          // Resetar tentativas de reconex�o
          reconnectAttempts.delete(session.connectionId);

          // -----------------------------------------------------------------------
          // ?? AUTO-RETRY AP�S LOGOUT: Recuperar automaticamente se o usu�rio estiver na tela
          // -----------------------------------------------------------------------
          // Quando h� um auth inv�lido no volume, o Baileys retorna loggedOut imediatamente.
          // Se o usu�rio clicou em "Conectar" (tem WS client ativo), faremos um auto-retry
          // �nico para gerar o QR code sem exigir um segundo clique.
          // -----------------------------------------------------------------------
          const now = Date.now();
          const hasLiveClient = wsClients.has(userId); // Cliente est� na tela
          const retryState = logoutAutoRetry.get(userId) || { count: 0, lastAttempt: 0 };

          // Resetar contador se passou do cooldown
          if (now - retryState.lastAttempt > LOGOUT_AUTO_RETRY_COOLDOWN_MS) {
            retryState.count = 0;
          }

          console.log(`[LOGOUT AUTO-RETRY] User ${userId.substring(0, 8)}... - hasLiveClient: ${hasLiveClient}, retryCount: ${retryState.count}/${MAX_LOGOUT_AUTO_RETRY}`);

          if (hasLiveClient && retryState.count < MAX_LOGOUT_AUTO_RETRY) {
            retryState.count++;
            retryState.lastAttempt = now;
            logoutAutoRetry.set(userId, retryState);

            console.log(`[LOGOUT AUTO-RETRY] Iniciando auto-retry para ${userId.substring(0, 8)}... conn ${session.connectionId.substring(0, 8)} em 750ms`);
            setTimeout(() => {
              console.log(`[LOGOUT AUTO-RETRY] Executando connectWhatsApp para ${userId.substring(0, 8)}...`);
              connectWhatsApp(userId, session.connectionId).catch((err) => {
                console.error(`[LOGOUT AUTO-RETRY] Erro na reconex�o autom�tica:`, err);
              });
            }, 750);
          } else {
            if (retryState.count >= MAX_LOGOUT_AUTO_RETRY) {
              console.log(`[LOGOUT AUTO-RETRY] Limite atingido para ${userId.substring(0, 8)}..., removendo estado`);
              logoutAutoRetry.delete(userId);
            }
            console.log(`User ${userId} needs to click Connect again to generate new QR code.`);
          }
        }
      } else if (conn === "open") {
        // -----------------------------------------------------------------------
        // ?? MULTI-CONNECTION: Store by connectionId on open
        // -----------------------------------------------------------------------
        sessions.set(session.connectionId, session);

        // -----------------------------------------------------------------------
        // FIX 2026-02-24: Mark session as truly open & clear timeout
        // -----------------------------------------------------------------------
        session.isOpen = true;
        session.connectedAt = Date.now();
        if (session.openTimeout) {
          clearTimeout(session.openTimeout);
          session.openTimeout = undefined;
          console.log(`? [CONN OPEN] Connection ${session.connectionId.substring(0, 8)} reached "open" � timeout cleared`);
        }

        // Conex�o estabelecida com sucesso - limpar pendentes
        // N�O resetar reconnectAttempts imediatamente � s� ap�s 2min de estabilidade
        // Isso evita loop infinito: open?close?attempt1?open?close?attempt1...
        clearPendingConnectionLock(session.connectionId, 'conn_open');
        clearPendingConnectionLock(userId, 'conn_open');
        clearOpenTimeoutCooldown(session.connectionId, "conn_open");
        clearOpenTimeoutCooldown(userId, "conn_open");
        settleConnectionPromise("resolve", "conn_open");

        // Agendar reset do contador de reconex�o ap�s 2 minutos de estabilidade
        const STABILITY_DELAY_MS = 120_000; // 2 min
        setTimeout(() => {
          // S� reseta se este MESMO socket ainda estiver ativo
          const currentSess = sessions.get(session.connectionId);
          if (currentSess?.socket === sock) {
            reconnectAttempts.delete(session.connectionId);
            console.log(`[RECONNECT] Counter reset for conn ${session.connectionId.substring(0,8)} after ${STABILITY_DELAY_MS/1000}s stability`);
          }
        }, STABILITY_DELAY_MS);

        const phoneNumber = sock.user?.id?.split(":")[0] || "";
        session.phoneNumber = phoneNumber;

        await storage.updateConnection(session.connectionId, {
          isConnected: true,
          phoneNumber,
          qrCode: null,
        });

        // ?? MULTI-CONNECTION: Each connection is independent, no cross-sync

        broadcastToUser(userId, { type: "connected", phoneNumber, connectionId: session.connectionId });

        // ======================================================================
        // ??? SAFE MODE: Verificar se o cliente est? em modo seguro anti-bloqueio
        // ======================================================================
        // Se o admin ativou o Safe Mode para este cliente (p?s-bloqueio),
        // executar limpeza completa antes de permitir qualquer envio
        try {
          const currentConnection = await storage.getConnectionByUserId(userId);
          if (currentConnection?.safeModeEnabled) {
            console.log(`??? [SAFE MODE] Cliente ${userId.substring(0, 8)}... est? em modo seguro - executando limpeza!`);
            
            const cleanupResult = await executeSafeModeCleanup(userId, session.connectionId);
            
            if (cleanupResult.success) {
              // Notificar o cliente sobre a limpeza
              broadcastToUser(userId, { 
                type: "safe_mode_cleanup",
                messagesCleared: cleanupResult.messagesCleared,
                followupsCleared: cleanupResult.followupsCleared,
              });
            } else {
              console.error(`??? [SAFE MODE] Erro na limpeza:`, cleanupResult.error);
            }
          }
        } catch (safeModeError) {
          console.error(`??? [SAFE MODE] Erro ao verificar modo seguro:`, safeModeError);
        }

        // ======================================================================
        // FIX LID 2025 - WORKAROUND: Contatos ser?o populados ao receber mensagens
        // ======================================================================
        // Baileys 7.0.0-rc.6 n?o tem makeInMemoryStore e n?o emite contacts.upsert
        // em sess?es restauradas. Os contatos ser?o populados quando:
        // 1. Primeira mensagem de cada contato chegar (contacts.upsert dispara)
        // 2. Usu?rio enviar mensagem (parseRemoteJid salva no DB via fallback)
        
        // ---------------------------------------------------------------------
        // FIX 2026: Enviar presenceUpdate('available') ap�s conex�o aberta
        // Sem isso, WhatsApp pode n�o rotear mensagens novas pro Baileys
        // ---------------------------------------------------------------------
        try {
          await sock.sendPresenceUpdate('available');
          console.log(`? [PRESENCE] Status 'available' enviado para socket principal`);
        } catch (presErr) {
          console.error(`? [PRESENCE] Erro ao enviar presen�a:`, presErr);
        }

        console.log(`\n?? [CONTACTS INFO] Aguardando contatos do Baileys...`);
        console.log(`   Contatos ser�o sincronizados automaticamente quando:`);
        console.log(`   1. Evento contacts.upsert do Baileys disparar`);
        console.log(`   2. Mensagens forem recebidas/enviadas`);
        console.log(`   Cache warming carregou ${contactsCache.size} contatos do DB\n`);
        
        // ======================================================================
        // ?? VERIFICA??O DE MENSAGENS N?O RESPONDIDAS (24H)
        // ======================================================================
        // Aguardar 10s para socket estabilizar, depois verificar se h? clientes
        // que mandaram mensagem nas ?ltimas 24h e n?o foram respondidos
        // (resolve problema de mensagens perdidas durante desconex?es)
        setTimeout(async () => {
          try {
            await checkUnrespondedMessages(session);
          } catch (error) {
            console.error(`? [UNRESPONDED CHECK] Erro ao verificar mensagens:`, error);
          }
        }, 10000); // 10 segundos ap?s conex?o
        
        // ======================================================================
        // ?? SISTEMA DE RECUPERA��O: Processar mensagens pendentes
        // ======================================================================
        // Quando a conex�o estabiliza, verificar se h� mensagens que chegaram
        // durante instabilidade/deploy e n�o foram processadas
        // ======================================================================
        try {
          console.log(`?? [RECOVERY] Iniciando recupera��o de mensagens pendentes para ${userId.substring(0, 8)}...`);
          await startMessageRecovery(userId, session.connectionId);
        } catch (recoveryError) {
          console.error(`?? [RECOVERY] Erro ao iniciar recupera��o:`, recoveryError);
        }
        
        // ======================================================================
        // ? FIX: Processar timers de IA pendentes IMEDIATAMENTE ap�s reconex�o
        // ======================================================================
        // Quando Connection Closed causou falha de envio, o timer fica pendente
        // no banco com retry de 5-30s. Ao reconectar, processar IMEDIATAMENTE
        // para que o cliente n�o espere mais.
        // ======================================================================
        setTimeout(async () => {
          try {
            const pendingTimers = await storage.getPendingAIResponsesForRestore();
            const userTimers = pendingTimers.filter((t) => {
              if (t.connectionId) {
                return t.connectionId === session.connectionId;
              }
              return t.userId === userId;
            });
            if (userTimers.length > 0) {
              console.log(`? [RECONNECT-RECOVERY] ${userTimers.length} timers pendentes para ${userId.substring(0, 8)}... - processando IMEDIATAMENTE!`);
              
              let processed = 0;
              for (const timer of userTimers) {
                if (pendingResponses.has(timer.conversationId) || conversationsBeingProcessed.has(timer.conversationId)) {
                  continue;
                }
                
                const rPending: PendingResponse = {
                  timeout: null as any,
                  messages: timer.messages,
                  conversationId: timer.conversationId,
                  userId: timer.userId,
                  connectionId: timer.connectionId,
                  contactNumber: timer.contactNumber,
                  jidSuffix: timer.jidSuffix || DEFAULT_JID_SUFFIX,
                  startTime: timer.scheduledAt.getTime(),
                };
                
                const delayMs = processed * 2000; // 2s entre cada para n�o sobrecarregar
                rPending.timeout = setTimeout(async () => {
                  await processAccumulatedMessages(rPending);
                }, delayMs);
                
                pendingResponses.set(timer.conversationId, rPending);
                processed++;
                
                if (processed >= 10) break; // Limitar a 10 por reconex�o
              }
              
              if (processed > 0) {
                console.log(`? [RECONNECT-RECOVERY] ${processed} timers processados imediatamente ap�s reconex�o`);
              }
            }
          } catch (recErr) {
            console.error(`? [RECONNECT-RECOVERY] Erro ao processar timers pendentes:`, recErr);
          }
        }, 3000); // 3s ap�s reconex�o para dar tempo ao socket estabilizar
        
        // ======================================================================
        // ?? FOLLOW-UP: Reativar follow-ups que estavam aguardando conex?o
        // ======================================================================
        // Quando o WhatsApp reconecta, os follow-ups que foram pausados por falta
        // de conex?o devem ser reagendados para processar em breve
        // ?? IMPORTANTE: N?O reativar se Safe Mode est? ativo (cliente p?s-bloqueio)
        setTimeout(async () => {
          try {
            // Verificar se Safe Mode est? ativo - se sim, N?O reativar follow-ups
            const connCheck = await storage.getConnectionByUserId(userId);
            if (connCheck?.safeModeEnabled) {
              console.log(`??? [SAFE MODE] Pulando reativa??o de follow-ups - modo seguro ativo`);
              return;
            }
            
            await userFollowUpService.clearConnectionWaitingStatus(session.connectionId);
            console.log(`? [FOLLOW-UP] Status de aguardo de conex?o limpo para ${userId}`);
          } catch (error) {
            console.error(`? [FOLLOW-UP] Erro ao limpar status de aguardo:`, error);
          }
        }, 5000); // 5 segundos ap?s conex?o
      }
    });

    // ---------------------------------------------------------------------------
    // ---------------------------------------------------------------------------
    // HANDLER DE ATUALIZA��ES DE MENSAGENS (messages.update) v3.1
    // - Processa votos de enquete (poll updates)
    // - FIX 2026: Processa mensagens que chegam descriptografadas via retry
    //   (resolve "Aguardando mensagem" / "Waiting for this message")
    // - FIX 2026-02: Detecta CTWA placeholder resend requests (PR #2334)
    // ---------------------------------------------------------------------------
    sock.ev.on("messages.update", async (updates) => {
      for (const { key, update } of updates) {
        // ---------------------------------------------------------------------
        // FIX 2026-02: Log CTWA placeholder resend status (from Baileys PR #2334)
        // When Baileys detects a CTWA message, it emits an update with
        // requestId in messageStubParameters[1]. Log this for monitoring.
        // ---------------------------------------------------------------------
        const stubParams = (update as any).messageStubParameters;
        if (stubParams && Array.isArray(stubParams) && stubParams.length >= 2) {
          const requestIdFromStub = stubParams[1];
          if (requestIdFromStub && typeof requestIdFromStub === 'string' && requestIdFromStub.length > 5) {
            console.log(`?? [CTWA-PDO-REQUEST] Baileys solicitou placeholder resend para mensagem ${key.id} de ${key.remoteJid} (requestId=${requestIdFromStub})`);
          }
        }

        // ---------------------------------------------------------------------
        // FIX 2026: Se uma mensagem que estava "pending" agora tem conte�do,
        // cachear para retry e re-emitir como upsert para processamento
        // ---------------------------------------------------------------------
        if ((update as any).message && key.remoteJid && !key.fromMe) {
          const msgContent = (update as any).message;
          if (key.id && msgContent) {
            cacheMessage(userId, key.id, msgContent);
            console.log(`?? [MSG-UPDATE] Mensagem ${key.id} descriptografada via retry, re-emitindo como upsert`);
            console.log(`   ?? JID: ${key.remoteJid}`);
            console.log(`   ?? Tipo de conte�do: ${Object.keys(msgContent).join(', ')}`);
            // Re-emitir como upsert notify para que seja processada normalmente
            // NOTA: O dedupe system permite reprocessamento pois stubs N�O s�o marcados
            sock.ev.emit('messages.upsert', {
              type: 'notify',
              messages: [{
                key,
                message: msgContent,
                messageTimestamp: Math.floor(Date.now() / 1000),
                // Preservar pushName se dispon�vel no update
                pushName: (update as any).pushName || undefined,
              } as any],
            });
          }
        }

        // Verificar se � um voto de enquete
        if (update.pollUpdates && update.pollUpdates.length > 0) {
          try {
            console.log(`??? [POLL-UPDATE v2.0] Recebido voto de enquete!`);
            console.log(`   ?? Poll ID: ${key.id}`);
            console.log(`   ?? JID: ${key.remoteJid}`);
            
            // Importar fun��es de mapeamento de polls
            const { getButtonIdFromPollVote, getPollMapping } = await import('./centralizedMessageSender');
            
            // Obter mapping da enquete original
            const pollMapping = key.id ? getPollMapping(key.id) : null;
            
            if (!pollMapping) {
              console.log(`??? [POLL-UPDATE] Poll n�o encontrado no mapeamento, ignorando...`);
              continue;
            }
            
            // Processar cada atualiza��o de voto usando getAggregateVotesInPollMessage
            for (const pollUpdate of update.pollUpdates) {
              const vote = pollUpdate.vote;
              
              // Verificar se h� op��es selecionadas
              if (!vote?.selectedOptions || vote.selectedOptions.length === 0) {
                console.log(`??? [POLL-UPDATE] Nenhuma op��o selecionada, pulando...`);
                continue;
              }
              
              console.log(`??? [POLL-UPDATE] Votos detectados. Buscando no mapeamento...`);
              console.log(`   ?? Op��es dispon�veis: ${pollMapping.buttons.map((b: any) => b.title || b.reply?.title).join(', ')}`);
              console.log(`   ?? Hashes selecionados: ${vote.selectedOptions.length}`);
              
              // ---------------------------------------------------------------
              // NOVA ABORDAGEM: Usar o primeiro hash SHA256 para encontrar op��o
              // Os hashes s�o SHA256 dos textos das op��es
              // ---------------------------------------------------------------
              
              // Criar hash map das op��es do poll
              const crypto = await import('crypto');
              const optionHashMap = new Map<string, string>();
              
              pollMapping.buttons.forEach((btn: any) => {
                const title = btn.title || btn.reply?.title || '';
                const hash = crypto.createHash('sha256').update(title).digest('hex');
                optionHashMap.set(hash, title);
                console.log(`   ?? Hash: ${hash.substring(0, 16)}... ? "${title}"`);
              });
              
              // Tentar encontrar a op��o votada pelo hash
              let votedOptionText: string | null = null;
              
              for (const selectedHash of vote.selectedOptions) {
                // selectedOptions s�o Buffer/Uint8Array - converter para hex
                const hashHex = Buffer.from(selectedHash).toString('hex');
                console.log(`   ?? Buscando hash: ${hashHex.substring(0, 16)}...`);
                
                if (optionHashMap.has(hashHex)) {
                  votedOptionText = optionHashMap.get(hashHex)!;
                  console.log(`   ? Encontrado! Op��o: "${votedOptionText}"`);
                  break;
                }
              }
              
              // Se n�o encontrou pelo hash, usar a primeira op��o como fallback
              if (!votedOptionText) {
                console.log(`   ?? Hash n�o encontrado, usando primeira op��o como fallback`);
                votedOptionText = pollMapping.buttons[0]?.title || pollMapping.buttons[0]?.reply?.title || '1';
              }
              
              // Criar mensagem fake com o texto da op��o votada
              const fakeMessage = {
                key: {
                  id: `poll_vote_${Date.now()}`,
                  remoteJid: key.remoteJid,
                  fromMe: false,
                },
                message: {
                  conversation: votedOptionText,
                },
                messageTimestamp: Math.floor(Date.now() / 1000),
                pushName: 'Voto de Enquete',
              };
              
              console.log(`??? [POLL-UPDATE] Processando voto como mensagem: "${fakeMessage.message.conversation}"`);
              
              // Disparar evento fake de mensagem para processar o voto
              sock.ev.emit('messages.upsert', {
                type: 'notify',
                messages: [fakeMessage as any],
              });
            }
          } catch (pollError) {
            console.error(`??? [POLL-UPDATE] Erro ao processar voto:`, pollError);
          }
        }
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      const source = m.type;
      const requestId = (m as any).requestId;

      // -------------------------------------------------------------------
      // ?? ALL-MESSAGES LOGGER v1.0: Log EVERY message for CTWA debugging
      // Shows message type, content keys, stub info - essential for diagnosing
      // missing Instagram/Facebook ads messages (CTWA/Click-to-WhatsApp)
      // -------------------------------------------------------------------
      for (const msg of m.messages || []) {
        const jid = msg?.key?.remoteJid || 'unknown';
        const msgId = msg?.key?.id || 'no-id';
        const fromMe = msg?.key?.fromMe ? 'OUT' : 'IN';
        const contentKeys = msg?.message ? Object.keys(msg.message).join(',') : 'NO-CONTENT';
        const stubType = (msg as any).messageStubType;
        const stubParams = (msg as any).messageStubParameters;
        const hasProtocol = msg?.message?.protocolMessage ? true : false;
        
        // Only log non-fromMe or protocol messages (to reduce noise)
        if (!msg?.key?.fromMe || hasProtocol || stubType) {
          console.log(`?? [MSG-UPSERT] ${fromMe} ${source}${requestId ? ' PDO:'+requestId : ''} | ${jid.split('@')[0]} | id=${msgId.substring(0,12)} | content=[${contentKeys}] | stub=${stubType || 'none'}${stubParams ? ' params='+JSON.stringify(stubParams) : ''}`);
        }
        
        // -------------------------------------------------------------------
        // ?? USERLAND PDO RESPONSE HANDLER (Fallback for Baileys PR #2334)
        // If Baileys' internal processMessage fails to decode the PDO response,
        // this catches it and manually decodes webMessageInfoBytes.
        // This handles the case where the phone responds to the placeholder
        // resend request but Baileys fails to process it internally.
        // -------------------------------------------------------------------
        const protocolMsg = msg?.message?.protocolMessage;
        if (protocolMsg) {
          const pdoResponse = (protocolMsg as any).peerDataOperationRequestResponseMessage;
          if (pdoResponse) {
            const peerResults = pdoResponse.peerDataOperationResult || [];
            console.log(`?? [CTWA-PDO-RESPONSE] Received PDO response from phone! stanzaId=${pdoResponse.stanzaId}, results=${peerResults.length}`);
            
            for (const result of peerResults) {
              const resendResponse = result?.placeholderMessageResendResponse;
              if (resendResponse?.webMessageInfoBytes) {
                console.log(`?? [CTWA-PDO-DECODE] Found webMessageInfoBytes in PDO response (${resendResponse.webMessageInfoBytes.length} bytes)`);
                
                // Note: Baileys' processMessage should handle this automatically.
                // This log confirms the phone DID respond - if CTWA-RESOLVED doesn't
                // follow, then processMessage has a bug.
                try {
                  const decoded = proto.WebMessageInfo.decode(resendResponse.webMessageInfoBytes);
                  console.log(`?? [CTWA-PDO-DECODE] Decoded message: id=${decoded?.key?.id}, from=${decoded?.key?.remoteJid}, contentKeys=${decoded?.message ? Object.keys(decoded.message).join(',') : 'NONE'}`);
                  
                  // If Baileys didn't emit the resolved message within 3 seconds, do it ourselves
                  const decodedMsgId = decoded?.key?.id;
                  if (decodedMsgId && decoded?.message) {
                    setTimeout(() => {
                      // Check if this message was already processed by checking our cache
                      const alreadyCached = getCachedMessage(userId, decodedMsgId);
                      if (!alreadyCached) {
                        console.log(`?? [CTWA-FALLBACK] Baileys didn't emit resolved message after 3s. Manually emitting as upsert!`);
                        sock.ev.emit('messages.upsert', {
                          messages: [decoded],
                          type: 'notify',
                          requestId: pdoResponse.stanzaId || 'userland-fallback'
                        } as any);
                      } else {
                        console.log(`? [CTWA-PDO-DECODE] Message ${decodedMsgId} already in cache - Baileys handled it correctly`);
                      }
                    }, 3000);
                  }
                } catch (decodeErr) {
                  console.error(`? [CTWA-PDO-DECODE] Failed to decode webMessageInfoBytes:`, decodeErr);
                }
              }
            }
          }
        }
      }

      // -------------------------------------------------------------------
      // LOG + FIX: Mensagem CTWA resolvida via Placeholder Resend (PR #2334)
      // Quando requestId est� presente, significa que o Baileys resolveu
      // uma mensagem de an�ncio Instagram/Facebook via PDO (Peer Data Operation)
      // -------------------------------------------------------------------
      if (requestId) {
        const msgIds = (m.messages || []).map(msg => msg?.key?.id).join(', ');
        const remoteJids = (m.messages || []).map(msg => msg?.key?.remoteJid).join(', ');
        const contentTypes = (m.messages || []).map(msg => msg?.message ? Object.keys(msg.message).join(',') : 'NONE').join('; ');
        console.log(`?? [CTWA-RESOLVED] ? Mensagem CTWA DESCRIPTOGRAFADA com sucesso!`);
        console.log(`   ?? requestId=${requestId}`);
        console.log(`   ?? msgs=[${msgIds}]`);
        console.log(`   ?? from=[${remoteJids}]`);
        console.log(`   ?? content=[${contentTypes}]`);
        
        // Atualizar mensagem stub no banco com o conte�do real
        for (const msg of m.messages || []) {
          if (msg?.key?.id && msg?.message) {
            // Cachear mensagem resolvida
            cacheMessage(userId, msg.key.id, msg.message);
            
            // Extrair texto real da mensagem descriptografada
            const realContent = msg.message;
            let realText = '';
            if ((realContent as any)?.conversation) {
              realText = (realContent as any).conversation;
            } else if ((realContent as any)?.extendedTextMessage?.text) {
              realText = (realContent as any).extendedTextMessage.text;
            } else if ((realContent as any)?.imageMessage?.caption) {
              realText = `[Imagem] ${(realContent as any).imageMessage.caption}`;
            } else {
              const keys = Object.keys(realContent);
              realText = `[${keys.join(',')}]`;
            }
            
            if (realText) {
              console.log(`   ?? Texto real descriptografado: "${realText.substring(0, 100)}"`);
              
              // Tentar atualizar a mensagem stub no banco para o texto real
              try {
                const dbMsg = await storage.getMessageByMessageId(msg.key.id);
                if (dbMsg && dbMsg.text && (dbMsg.text.includes('Mensagem incompleta') || dbMsg.text === 'Oi' || dbMsg.text === 'oi')) {
                  await storage.updateMessage(dbMsg.id, { text: realText });
                  console.log(`   ?? Mensagem ${dbMsg.id} atualizada no banco: stub ? "${realText.substring(0, 50)}"`);
                  
                  // Broadcast para UI
                  broadcastToUser(userId, {
                    type: "message_updated",
                    conversationId: (dbMsg as any).conversationId || (dbMsg as any).conversation_id,
                    messageId: dbMsg.id,
                    text: realText,
                  });
                }
              } catch (dbErr) {
                console.error(`   ? Erro ao atualizar mensagem no banco:`, dbErr);
              }
            }
          }
        }
      }

      for (const message of m.messages || []) {
        if (!message) continue;

        const remoteJid = message.key.remoteJid || null;
        const rawTs = (message as any)?.messageTimestamp;
        const nTs = Number(rawTs);
        const hasValidTs = Number.isFinite(nTs) && nTs > 0;
        const eventTs = hasValidTs ? new Date(nTs * 1000) : new Date();
        const ageMs = Math.max(0, Date.now() - eventTs.getTime());

        // FIX 2026: Aumentado threshold de 2min para 10min para n�o perder
        // mensagens recentes que chegam via append ap�s reconex�o.
        // Meta ads leads e mensagens durante desconex�o podem chegar como append.
        const isAppendRecent =
          source === "append" &&
          ((hasValidTs && ageMs <= 10 * 60 * 1000) || (!hasValidTs && (m.messages?.length || 0) <= 5 && !!message.key.id));
        
        // FIX 2026-02: CTWA resolved messages (from PDO) come with requestId
        // and may arrive as 'append' type from process-message.js
        // Always process these regardless of source/age
        const isCTWAResolved = !!requestId && !!message.message;
        
        const shouldProcess = source === "notify" || isAppendRecent || isCTWAResolved;
        
        if (isCTWAResolved) {
          console.log(`?? [CTWA-PROCESS] Processing CTWA-resolved message from PDO: ${message.key.id} from ${remoteJid} (source=${source}, requestId=${requestId})`);
        }

        // Cache message for getMessage() retries
        if (message.key.id && message.message) {
          cacheMessage(userId, message.key.id, message.message);
        }

        // -------------------------------------------------------------------
        // FIX 2026-02: MONITORAMENTO DE MENSAGENS CTWA (An�ncios Instagram/Facebook)
        // -------------------------------------------------------------------
        // Ap�s atualiza��o do Baileys para master (PR #2334), mensagens de
        // an�ncios CTWA agora s�o detectadas automaticamente pelo Baileys.
        // O Baileys chama requestPlaceholderResend() internamente e re-emite
        // a mensagem real via messages.upsert com type: 'notify'.
        //
        // Este bloco monitora e loga quando uma mensagem chega como stub/
        // placeholder (sem conte�do), que pode indicar CTWA ou retry em andamento.
        // -------------------------------------------------------------------
        if (!message.message && remoteJid && !message.key.fromMe) {
          if (!remoteJid.includes("@g.us") && !remoteJid.includes("@broadcast")) {
            const stubType = (message as any).messageStubType;
            const stubParams = (message as any).messageStubParameters;
            console.log(`?? [CTWA-MONITOR] Mensagem sem conte�do de ${remoteJid} (stub=${stubType}, params=${JSON.stringify(stubParams)}, source=${source}) - Baileys ir� solicitar placeholder resend automaticamente`);
          }
        }

        if (!shouldProcess) continue;

        // Save to pending_incoming_messages BEFORE processing, so we can recover after crashes.
        if (!message.key.fromMe && remoteJid) {
          if (!remoteJid.includes("@g.us") && !remoteJid.includes("@broadcast")) {
            try {
              const msg = unwrapIncomingMessageContent(message.message as any);
              let textContent: string | null = null;
              let msgType = "text";

              if (!message.message) {
                msgType = "stub";
                const stubType = (message as any).messageStubType;
                textContent = stubType != null ? `[WhatsApp] Mensagem incompleta (stubType=${stubType})` : null;
              } else if (msg?.conversation) {
                textContent = msg.conversation;
              } else if (msg?.extendedTextMessage?.text) {
                textContent = msg.extendedTextMessage.text;
              } else if (msg?.imageMessage) {
                textContent = msg.imageMessage.caption || "[Imagem]";
                msgType = "image";
              } else if (msg?.audioMessage) {
                textContent = "[Audio]";
                msgType = "audio";
              } else if (msg?.videoMessage) {
                textContent = msg.videoMessage.caption || "[Video]";
                msgType = "video";
              } else if (msg?.documentMessage) {
                textContent = msg.documentMessage.fileName || "[Documento]";
                msgType = "document";
              } else if (msg?.stickerMessage) {
                textContent = "[Sticker]";
                msgType = "sticker";
              } else if (msg?.contactMessage) {
                const displayName = msg.contactMessage.displayName || "Contato";
                const parsed = parseVCardBasic(msg.contactMessage.vcard || "");
                textContent = `[Contato] ${displayName}${parsed.phone ? ` - ${parsed.phone}` : ""}`;
                msgType = "contact";
              } else if (msg?.protocolMessage) {
                const protoType = msg.protocolMessage.type;
                if (protoType === 0 || protoType === "REVOKE") {
                  textContent = "[Mensagem apagada]";
                  msgType = "protocol_revoke";
                } else {
                  textContent = "[Mensagem de protocolo]";
                  msgType = "protocol";
                }
              } else if (msg?.contactsArrayMessage) {
                const count = msg.contactsArrayMessage.contacts?.length || 0;
                textContent = `[${count} contatos compartilhados]`;
                msgType = "contacts";
              } else if (msg?.locationMessage) {
                textContent = "[Localizacao]";
                msgType = "location";
              } else if (msg?.liveLocationMessage) {
                textContent = "[Localizacao em tempo real]";
                msgType = "live_location";
              } else {
                msgType = "unknown";
                textContent = "[Mensagem nao suportada]";
              }

              await saveIncomingMessage({
                userId: userId,
                connectionId: session.connectionId,
                waMessage: message,
                messageContent: textContent,
                messageType: msgType,
              });
            } catch (saveErr) {
              console.error(`[RECOVERY] Erro ao salvar mensagem pendente:`, saveErr);
            }
          }
        }

        // Outgoing messages (fromMe): sync only in realtime.
        if (message.key.fromMe) {
          try {
            if (source === "notify") {
              await handleOutgoingMessage(session, message);
            }
          } catch (err) {
            console.error("Error handling outgoing message:", err);
          }
          continue;
        }

        // Extra check: ignore echo from own number
        if (message.key.remoteJid && session.phoneNumber) {
          const remoteNumber = cleanContactNumber(message.key.remoteJid);
          const myNumber = cleanContactNumber(session.phoneNumber);
          if (remoteNumber && myNumber && remoteNumber === myNumber) {
            console.log(`Ignoring echo message from own number: ${remoteNumber}`);
            continue;
          }
        }

        try {
          await handleIncomingMessage(session, message, {
            source,
            allowAutoReply: source === "notify" || isAppendRecent,
            isAppendRecent,
            eventTs,
          });
        } catch (err) {
          console.error("Error handling incoming message:", err);
        }
      }
    });

    // Socket inicializado; promise permanece pendente at� "open" (ou close/timeout).
    console.log(`[CONNECT] WhatsApp socket initialized for user ${userId}, waiting for conn=open...`);

    } catch (error) {
      console.error("Error connecting WhatsApp:", error);
      clearPendingConnectionLock(lockKey, 'connect_error');
      settleConnectionPromise("reject", "connect_error", error as Error);
    }
  })();

  // Retornar a promise (j? foi registrada no mapa antes de iniciar a async)
  return connectionPromise;
}

// -----------------------------------------------------------------------
// ?? NOVA FUN??O: Processar mensagens enviadas pelo DONO no WhatsApp
// -----------------------------------------------------------------------
// Quando o dono responde direto no WhatsApp (fromMe: true),
// precisamos salvar essa mensagem no sistema para evitar "buracos"
// na conversa quando a IA voltar a responder.
// -----------------------------------------------------------------------
async function handleOutgoingMessage(session: WhatsAppSession, waMessage: WAMessage) {
  // ?? MODO DEV: Pular processamento se DISABLE_WHATSAPP_PROCESSING=true
  if (DISABLE_MESSAGE_PROCESSING) {
    console.log(`?? [DEV MODE] Ignorando mensagem enviada (processamento desabilitado)`);
    return;
  }

  const remoteJid = waMessage.key.remoteJid;
  if (!remoteJid) return;
  // ?? FIX BUG DUPLICATA: Ignorar mensagens enviadas pelo agente IA
  // Quando IA envia via socket.sendMessage(), Baileys dispara evento fromMe:true
  // MAS a mensagem j? foi salva no createMessage() do setTimeout do agente.
  // Se salvar novamente aqui = DUPLICATA!
  const messageId = waMessage.key.id;
  if (messageId && agentMessageIds.has(messageId)) {
    console.log(`?? [FROM ME] Ignorando mensagem do agente (j? salva): ${messageId}`);
    agentMessageIds.delete(messageId); // Limpar ap?s verificar
    return;
  }

  // Filtrar grupos e status
  if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
    console.log(`?? [FROM ME] Ignoring group/status message`);
    return;
  }

  const isIndividualJid =
    remoteJid.includes("@s.whatsapp.net") || remoteJid.includes("@lid");

  if (!isIndividualJid) {
    console.log(`?? [FROM ME] Ignoring non-individual message`);
    return;
  }

  // Resolver contactNumber usando mesma l?gica do handleIncomingMessage
  let contactNumber: string;
  let normalizedJid: string;

  if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
    const realJid = (waMessage.key as any).remoteJidAlt;
    contactNumber = cleanContactNumber(realJid);
    normalizedJid = realJid;
    console.log(`?? [FROM ME] LID resolvido: ${remoteJid} ? ${realJid}`);
  } else {
    const parsed = await parseRemoteJid(remoteJid, session.contactsCache, session.connectionId);
    contactNumber = parsed.contactNumber;
    normalizedJid = parsed.normalizedJid;
  }

  if (!contactNumber) {
    console.log(`?? [FROM ME] Could not extract contact number from JID: ${remoteJid}`);
    return;
  }
  
  // ?? v4.0 ANTI-BAN CR�TICO: Registrar mensagem MANUAL do dono no sistema de prote��o
  // Isso faz com que o bot ESPERE antes de enviar qualquer mensagem para evitar
  // padr�o de "bot enviando imediatamente ap�s humano" que a Meta detecta como spam
  const msg = waMessage.message;
  let messageType: 'text' | 'media' | 'audio' = 'text';
  if (msg?.audioMessage) {
    messageType = 'audio';
  } else if (msg?.imageMessage || msg?.videoMessage || msg?.documentMessage || msg?.documentWithCaptionMessage) {
    messageType = 'media';
  }
  
  antiBanProtectionService.registerOwnerManualMessage(session.userId, contactNumber, messageType);
  console.log(`??? [ANTI-BAN v4.0] ?? Mensagem MANUAL do DONO registrada - Bot aguardar� antes de responder`);
  
  // Extrair texto da mensagem E M�DIA (incluindo �udio para transcri��o)
  let messageText = "";
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let mediaMimeType: string | null = null;
  
  // ?? METADADOS PARA RE-DOWNLOAD DE M�DIA (igual handleIncomingMessage)
  // Esses campos permitem baixar a m�dia novamente do WhatsApp
  let mediaKey: string | null = null;
  let directPath: string | null = null;
  let mediaUrlOriginal: string | null = null;

  if (msg?.conversation) {
    messageText = msg.conversation;
  } else if (msg?.extendedTextMessage?.text) {
    messageText = msg.extendedTextMessage.text;
    
    // ?? FIX BUG DUPLICATA: Baileys as vezes envia texto 2x no mesmo campo
    // Exemplo: "Texto\nTexto" (repetido separado por \n)
    // Detectar e remover duplica??o
    const lines = messageText.split('\n');
    const halfLength = Math.floor(lines.length / 2);
    if (lines.length > 2 && lines.length % 2 === 0) {
      const firstHalf = lines.slice(0, halfLength).join('\n');
      const secondHalf = lines.slice(halfLength).join('\n');
      if (firstHalf === secondHalf) {
        console.log(`?? [FROM ME] Texto duplicado detectado, usando apenas primeira metade`);
        messageText = firstHalf;
      }
    }
  } else if (msg?.imageMessage?.caption) {
    messageText = msg.imageMessage.caption;
    mediaType = "image";
    mediaMimeType = msg.imageMessage.mimetype || "image/jpeg";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.imageMessage.mediaKey) {
      mediaKey = Buffer.from(msg.imageMessage.mediaKey).toString("base64");
    }
    directPath = msg.imageMessage.directPath || null;
    mediaUrlOriginal = msg.imageMessage.url || null;
    
    // ??? IMAGEM DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`??? [FROM ME] Baixando imagem do dono com caption...`);
      console.log(`??? [FROM ME] mediaKey presente:`, !!msg.imageMessage.mediaKey);
      console.log(`??? [FROM ME] directPath presente:`, !!msg.imageMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] Imagem do dono processada: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar imagem:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.imageMessage) {
    messageText = "[Imagem enviada]";
    mediaType = "image";
    mediaMimeType = msg.imageMessage.mimetype || "image/jpeg";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.imageMessage.mediaKey) {
      mediaKey = Buffer.from(msg.imageMessage.mediaKey).toString("base64");
    }
    directPath = msg.imageMessage.directPath || null;
    mediaUrlOriginal = msg.imageMessage.url || null;
    
    // ??? IMAGEM DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`??? [FROM ME] Baixando imagem do dono sem caption...`);
      console.log(`??? [FROM ME] mediaKey presente:`, !!msg.imageMessage.mediaKey);
      console.log(`??? [FROM ME] directPath presente:`, !!msg.imageMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] Imagem do dono processada: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar imagem:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.videoMessage?.caption) {
    messageText = msg.videoMessage.caption;
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.videoMessage.mediaKey) {
      mediaKey = Buffer.from(msg.videoMessage.mediaKey).toString("base64");
    }
    directPath = msg.videoMessage.directPath || null;
    mediaUrlOriginal = msg.videoMessage.url || null;
    
    // ?? V�DEO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`?? [FROM ME] Baixando v�deo do dono com caption...`);
      console.log(`?? [FROM ME] waMessage.key:`, JSON.stringify(waMessage.key));
      console.log(`?? [FROM ME] mediaKey presente:`, !!msg.videoMessage.mediaKey);
      console.log(`?? [FROM ME] directPath presente:`, !!msg.videoMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] V�deo do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar v�deo:", error?.message || error);
      console.error("? [FROM ME] Erro completo:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      mediaUrl = null;
    }
  } else if (msg?.videoMessage) {
    messageText = "[V�deo enviado]";
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.videoMessage.mediaKey) {
      mediaKey = Buffer.from(msg.videoMessage.mediaKey).toString("base64");
    }
    directPath = msg.videoMessage.directPath || null;
    mediaUrlOriginal = msg.videoMessage.url || null;
    
    // ?? V�DEO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`?? [FROM ME] Baixando v�deo do dono sem caption...`);
      console.log(`?? [FROM ME] waMessage.key:`, JSON.stringify(waMessage.key));
      console.log(`?? [FROM ME] mediaKey presente:`, !!msg.videoMessage.mediaKey);
      console.log(`?? [FROM ME] directPath presente:`, !!msg.videoMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] V�deo do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar v�deo:", error?.message || error);
      console.error("? [FROM ME] Erro completo:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      mediaUrl = null;
    }
  } else if (msg?.audioMessage) {
    // ?? �UDIO DO DONO: Baixar e preparar para transcri��o (igual cliente)
    mediaType = "audio";
    mediaMimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
    messageText = "[�udio enviado]"; // Texto placeholder, ser� substitu�do pela transcri��o
    
    // ?? Extrair metadados para re-download posterior
    if (msg.audioMessage.mediaKey) {
      mediaKey = Buffer.from(msg.audioMessage.mediaKey).toString("base64");
    }
    directPath = msg.audioMessage.directPath || null;
    mediaUrlOriginal = msg.audioMessage.url || null;
    
    try {
      console.log(`?? [FROM ME] Baixando �udio do dono para transcri��o...`);
      console.log(`?? [FROM ME] mediaKey presente:`, !!msg.audioMessage.mediaKey);
      console.log(`?? [FROM ME] directPath presente:`, !!msg.audioMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      // ? FIX: Usar session.userId em vez de userId (que n�o existe neste escopo)
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] �udio do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar ?udio:", error?.message || error);
      mediaUrl = null;
    }
  }
  // -----------------------------------------------------------------------
  // ?? DOCUMENTO COM LEGENDA (documentWithCaptionMessage) - FROM ME
  // -----------------------------------------------------------------------
  else if (msg?.documentWithCaptionMessage?.message?.documentMessage) {
    const docMsg = msg.documentWithCaptionMessage.message.documentMessage;
    messageText = docMsg.caption || `?? ${docMsg.fileName || "Documento"}`;
    mediaType = "document";
    mediaMimeType = docMsg.mimetype || "application/octet-stream";
    
    // ?? Extrair metadados para re-download posterior
    if (docMsg.mediaKey) {
      mediaKey = Buffer.from(docMsg.mediaKey).toString("base64");
    }
    directPath = docMsg.directPath || null;
    mediaUrlOriginal = docMsg.url || null;
    
    // ?? DOCUMENTO DO DONO (COM CAPTION): Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`?? [FROM ME] Baixando documento do dono (com caption): ${docMsg.fileName}...`);
      console.log(`?? [FROM ME] mediaKey presente:`, !!docMsg.mediaKey);
      console.log(`?? [FROM ME] directPath presente:`, !!docMsg.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] Documento do dono (com caption) processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar documento (com caption):", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.documentMessage?.caption) {
    messageText = msg.documentMessage.caption;
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.documentMessage.mediaKey) {
      mediaKey = Buffer.from(msg.documentMessage.mediaKey).toString("base64");
    }
    directPath = msg.documentMessage.directPath || null;
    mediaUrlOriginal = msg.documentMessage.url || null;
    
    // ?? DOCUMENTO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`?? [FROM ME] Baixando documento do dono com caption: ${msg.documentMessage.fileName}...`);
      console.log(`?? [FROM ME] mediaKey presente:`, !!msg.documentMessage.mediaKey);
      console.log(`?? [FROM ME] directPath presente:`, !!msg.documentMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      messageText = `?? ${msg.documentMessage.fileName || "Documento"}`;
      console.log(`? [FROM ME] Documento do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar documento:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.documentMessage) {
    messageText = `?? ${msg.documentMessage.fileName || "Documento"}`;
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.documentMessage.mediaKey) {
      mediaKey = Buffer.from(msg.documentMessage.mediaKey).toString("base64");
    }
    directPath = msg.documentMessage.directPath || null;
    mediaUrlOriginal = msg.documentMessage.url || null;
    
    // ?? DOCUMENTO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`?? [FROM ME] Baixando documento do dono: ${msg.documentMessage.fileName}...`);
      console.log(`?? [FROM ME] mediaKey presente:`, !!msg.documentMessage.mediaKey);
      console.log(`?? [FROM ME] directPath presente:`, !!msg.documentMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] Documento do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar documento:", error?.message || error);
      mediaUrl = null;
    }
  } else {
    console.log(`?? [FROM ME] Unsupported message type, skipping`);
    return;
  }

  // Buscar/criar conversa - FIX: usar getActiveConversation para n�o pegar conversa fechada
  let conversation = await storage.getActiveConversationByContactNumber(
    session.connectionId,
    contactNumber
  );

  // Fallback: se n�o tem conversa ativa, tentar a antiga (para outgoing em conversa fechada)
  if (!conversation) {
    conversation = await storage.getConversationByContactNumber(
      session.connectionId,
      contactNumber
    );
  }

  const wasNewConversation = !conversation;

  if (!conversation) {
    console.log(`?? [FROM ME] Creating new conversation for ${contactNumber}`);
    conversation = await storage.createConversation({
      connectionId: session.connectionId,
      contactNumber,
      remoteJid: normalizedJid,
      jidSuffix: "s.whatsapp.net",
      contactName: contactNumber,
      contactAvatar: null,
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      lastMessageFromMe: false,
      unreadCount: 0,
    });
  }

  // ?? VERIFICA??O DE DUPLICATA: Antes de salvar, verificar se a mensagem j? existe no banco
  // Isso resolve race conditions onde o agente pode salvar antes ou depois deste handler
  let existingMessage = waMessage.key.id ? await storage.getMessageByMessageId(waMessage.key.id) : null;
  
  // ?? RACE CONDITION FIX: Se n?o existe, esperar 500ms e verificar novamente
  // O agente pode estar salvando a mensagem neste exato momento
  if (!existingMessage) {
    await new Promise(resolve => setTimeout(resolve, 500));
    existingMessage = waMessage.key.id ? await storage.getMessageByMessageId(waMessage.key.id) : null;
  }
  
  if (existingMessage) {
    console.log(`?? [FROM ME] Mensagem j? existe no banco (messageId: ${waMessage.key.id}), ignorando duplicata`);
    
    // Se a mensagem existente ? do agente, N?O pausar a IA e sair
    if (existingMessage.isFromAgent) {
      console.log(`? [FROM ME] Mensagem ? do agente - N?O pausar IA`);
      return;
    }
    
    // Se n?o ? do agente mas j? existe, apenas atualizar conversa e sair (evita duplicata)
    await storage.updateConversation(conversation.id, {
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      lastMessageFromMe: false,
      unreadCount: 0,
    });
    return;
  }
  
  // Mensagem realmente nova do dono - salvar e processar auto-pause
  let savedOutgoingMsg: any = null;
  try {
    savedOutgoingMsg = await storage.createMessage({
      conversationId: conversation.id,
      messageId: waMessage.key.id || `msg_${Date.now()}`,
      fromMe: true,
      text: messageText,
      timestamp: new Date(Number(waMessage.messageTimestamp) * 1000),
      isFromAgent: false,
      mediaType,
      mediaUrl,        // ?? Incluir URL do �udio para transcri��o autom�tica
      mediaMimeType,   // ?? Tipo MIME do �udio
      // ?? Metadados para re-download de m�dia do WhatsApp (igual handleIncomingMessage)
      mediaKey,
      directPath,
      mediaUrlOriginal,
    });
  } catch (createError: any) {
    // Se erro for de duplicata (constraint unique), verificar se ? do agente
    if (createError?.message?.includes('unique') || createError?.code === '23505') {
      console.log(`?? [FROM ME] Erro de duplicata ao salvar - mensagem j? existe (messageId: ${waMessage.key.id})`);
      
      // Re-verificar se ? do agente
      const recheck = waMessage.key.id ? await storage.getMessageByMessageId(waMessage.key.id) : null;
      if (recheck?.isFromAgent) {
        console.log(`? [FROM ME] Confirmado: mensagem ? do agente - N?O pausar IA`);
        return;
      }
    } else {
      console.error(`? [FROM ME] Erro ao salvar mensagem:`, createError);
    }
    return;
  }

  // Atualizar conversa
  await storage.updateConversation(conversation.id, {
    lastMessageText: messageText,
    lastMessageTime: new Date(),
    lastMessageFromMe: true, // Mensagem enviada pelo usu�rio
    hasReplied: true, // Marca como respondida
    unreadCount: 0, // Mensagens do dono n�o geram unread
  });

  // ?? FOLLOW-UP: Se admin enviou mensagem, agendar follow-up inicial
  try {
    await followUpService.scheduleInitialFollowUp(conversation.id);
  } catch (error) {
    console.error("Erro ao agendar follow-up:", error);
  }

  // -----------------------------------------------------------------------
  // ?? AUTO-PAUSE IA: Quando o dono responde manualmente, PAUSA a IA
  // A IA s? volta a responder quando o usu?rio reativar em /conversas
  // CONFIGUR?VEL: S? pausa se pauseOnManualReply estiver ativado (padr?o: true)
  // NOVO: Suporta auto-reativa??o ap?s timer configur?vel
  // -----------------------------------------------------------------------
  try {
    // Verificar configura??o do agente para pauseOnManualReply
    const agentConfig = await storage.getAgentConfig(session.userId);
    const shouldPauseOnManualReply = agentConfig?.pauseOnManualReply !== false; // Padr?o: true
    const autoReactivateMinutes = (agentConfig as any)?.autoReactivateMinutes ?? null; // NULL = nunca
    
    if (shouldPauseOnManualReply) {
      const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversation.id);
      if (!isAlreadyDisabled) {
        // Pausar com timer de auto-reativa??o (se configurado)
        await storage.disableAgentForConversation(conversation.id, autoReactivateMinutes);
        console.log(`?? [AUTO-PAUSE] IA pausada automaticamente para conversa ${conversation.id} - dono respondeu manualmente` + 
          (autoReactivateMinutes ? ` (reativa em ${autoReactivateMinutes}min)` : ' (manual only)'));
        
        // Cancelar qualquer resposta pendente do agente para esta conversa
        const pendingResponse = pendingResponses.get(conversation.id);
        if (pendingResponse) {
          clearTimeout(pendingResponse.timeout);
          pendingResponses.delete(conversation.id);
          console.log(`?? [AUTO-PAUSE] Resposta pendente do agente cancelada para ${contactNumber}`);
        }
        
        // ?? Notificar que a IA foi pausada para esta conversa (APENAS quando realmente pausar)
        broadcastToUser(session.userId, {
          type: "agent_auto_paused",
          conversationId: conversation.id,
          reason: "manual_reply",
          autoReactivateMinutes,
        });
      } else {
        // J? estava pausada, apenas atualizar timestamp do dono (reset timer)
        await storage.updateDisabledConversationOwnerReply(conversation.id);
        console.log(`?? [AUTO-PAUSE] Timer resetado para conversa ${conversation.id} - dono respondeu novamente`);
      }
    } else {
      console.log(`? [AUTO-PAUSE DESATIVADO] Dono respondeu manualmente mas pauseOnManualReply est? desativado - IA continua ativa`);
      
      // Ainda cancelar resposta pendente para evitar duplica??o
      const pendingResponse = pendingResponses.get(conversation.id);
      if (pendingResponse) {
        clearTimeout(pendingResponse.timeout);
        pendingResponses.delete(conversation.id);
        console.log(`? [AUTO-PAUSE DESATIVADO] Resposta pendente cancelada (dono respondeu primeiro) para ${contactNumber}`);
      }
    }
  } catch (error) {
    console.error("Erro ao verificar pauseOnManualReply:", error);
  }

  // Broadcast para atualizar UI em tempo real
  broadcastToUser(session.userId, {
    type: "new_message",
    conversationId: conversation.id,
    message: messageText,
    mediaType,
    // ? REAL-TIME: Enviar mensagem completa para append inline
    messageData: savedOutgoingMsg ? {
      id: savedOutgoingMsg.id,
      conversationId: conversation.id,
      messageId: savedOutgoingMsg.messageId,
      fromMe: true,
      text: messageText,
      timestamp: savedOutgoingMsg.timestamp?.toISOString?.() || new Date().toISOString(),
      isFromAgent: false,
      mediaType: mediaType || null,
      mediaUrl: savedOutgoingMsg.mediaUrl || null,
      mediaMimeType: savedOutgoingMsg.mediaMimeType || null,
      mediaDuration: savedOutgoingMsg.mediaDuration || null,
      mediaCaption: savedOutgoingMsg.mediaCaption || null,
    } : undefined,
    // Conversation update for list
    conversationUpdate: {
      id: conversation.id,
      contactNumber,
      contactName: conversation.contactName || null,
      lastMessageText: messageText,
      lastMessageTime: new Date().toISOString(),
      lastMessageFromMe: true,
      unreadCount: 0,
    },
  });

  console.log(`?? [FROM ME] Mensagem sincronizada: ${contactNumber} - "${messageText}"`);
}

async function handleIncomingMessage(
  session: WhatsAppSession,
  waMessage: WAMessage,
  opts?: { source?: string; allowAutoReply?: boolean; isAppendRecent?: boolean; eventTs?: Date; isCTWAResolved?: boolean }
) {
  // ?? MODO DEV: Pular processamento se DISABLE_WHATSAPP_PROCESSING=true
  if (DISABLE_MESSAGE_PROCESSING) {
    console.log(`?? [DEV MODE] Ignorando mensagem recebida (processamento desabilitado)`);
    return;
  }

  const remoteJid = waMessage.key.remoteJid;
  if (!remoteJid) return;

  const source = opts?.source ?? "notify";
  const isAppendRecent = opts?.isAppendRecent ?? false;
  const allowAutoReplyRequested = opts?.allowAutoReply ?? (source === "notify");
  const eventTs = opts?.eventTs ?? getWAMessageTimestamp(waMessage);

  // +-----------------------------------------------------------------------+
  // �  ??? ANTI-REENVIO: VERIFICA��O DE DEDUPLICA��O DE MENSAGENS          �
  // �  Protege contra reprocessamento ap�s instabilidade/restart           �
  // +-----------------------------------------------------------------------+
  const whatsappMessageId = waMessage.key.id;
  const incomingDedupeParams = whatsappMessageId
    ? {
        whatsappMessageId,
        userId: session.userId,
        // Use a stable key for incoming dedupe (not the DB conversation UUID).
        conversationId: `${session.connectionId}:${remoteJid
          .replace("@s.whatsapp.net", "")
          .replace("@lid", "")
          .replace("@g.us", "")}`,
        contactNumber: remoteJid
          .replace("@s.whatsapp.net", "")
          .replace("@lid", "")
          .replace("@g.us", ""),
      }
    : null;

  // ANTI-REENVIO (incoming): check-only first.
  // IMPORTANT: do NOT mark as processed before we know the message is not a stub/incomplete.
  // Meta ads leads sometimes arrive as 'stub' (WhatsApp shows "carregando mensagem").
  if (incomingDedupeParams) {
    const alreadyProcessed = await isIncomingMessageProcessed(incomingDedupeParams);
    if (alreadyProcessed) {
      console.log(`[ANTI-REENVIO] Mensagem recebida BLOQUEADA (ja processada)`);
      console.log(`   De: ${remoteJid.substring(0, 20)}...`);
      console.log(`   WhatsApp ID: ${whatsappMessageId}`);
      return;
    }
  }

  // Filtrar grupos e status - aceitar apenas conversas individuais
  // @g.us = grupos, @broadcast = status/listas de transmiss?o
  if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
    console.log(`Ignoring group/status message from: ${remoteJid}`);
    return;
  }

  // Aceitar apenas mensagens de n?meros individuais (@s.whatsapp.net ou @lid)
  const isIndividualJid =
    remoteJid.includes("@s.whatsapp.net") || remoteJid.includes("@lid");

  if (!isIndividualJid) {
    console.log(`Ignoring non-individual message from: ${remoteJid}`);
    return;
  }

  // +-----------------------------------------------------------------------+
  // ?  ?? ATEN??O: C?DIGO CR?TICO - N?O ALTERAR SEM APROVA??O! ??          ?
  // ?-----------------------------------------------------------------------?
  // ?  FIX LID 2025 - RESOLU??O DE CONTATOS INSTAGRAM/FACEBOOK             ?
  // ?                                                                       ?
  // ?  PROBLEMA RESOLVIDO:                                                  ?
  // ?  ? Contatos do Instagram/Facebook v?m com @lid ao inv?s de n?mero    ?
  // ?  ? Exemplo: "254635809968349@lid" (ID interno do Meta)               ?
  // ?                                                                       ?
  // ?  SOLU??O IMPLEMENTADA (TESTADA E FUNCIONANDO):                        ?
  // ?  ? message.key.remoteJidAlt cont?m o n?mero REAL do WhatsApp         ?
  // ?  ? Exemplo: "5517991956944@s.whatsapp.net"                           ?
  // ?                                                                       ?
  // ?  FLUXO CORRETO (MANTER SEMPRE ASSIM):                                 ?
  // ?  1. Extrair n?mero real de remoteJidAlt                              ?
  // ?  2. Usar n?mero real em contactNumber (exibi??o no CRM)              ?
  // ?  3. Usar n?mero real em normalizedJid (envio de mensagens)           ?
  // ?  4. Salvar mapeamento LID ? n?mero no whatsapp_contacts              ?
  // ?                                                                       ?
  // ?  ??  NUNCA MAIS USAR remoteJid DIRETAMENTE PARA @lid!                ?
  // ?  ??  SEMPRE USAR remoteJidAlt COMO FONTE DA VERDADE!                 ?
  // ?                                                                       ?
  // ?  Data: 2025-11-22                                                     ?
  // ?  Testado: ? Produ??o Railway                                         ?
  // ?  Status: ? 100% FUNCIONAL                                            ?
  // +-----------------------------------------------------------------------+
  
  console.log(`\n?? [MESSAGE KEY DEBUG]`);
  console.log(`   remoteJid: ${remoteJid}`);
  console.log(`   remoteJidAlt: ${(waMessage.key as any).remoteJidAlt || "N/A"}`);
  console.log(`   pushName: ${waMessage.pushName || "N/A"}`);
  console.log(`   participantPn: ${(waMessage.key as any).participantPn || "N/A"}`);
  
  let contactNumber: string;
  let jidSuffix: string;
  let normalizedJid: string;
  
  // -----------------------------------------------------------------------
  // ?? SOLU??O DEFINITIVA: Usar remoteJidAlt (n?mero real para @lid)
  // -----------------------------------------------------------------------
  if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
    const realJid = (waMessage.key as any).remoteJidAlt;
    const realNumber = cleanContactNumber(realJid);
    
    console.log(`\n? [LID RESOLVIDO] N?mero real encontrado via remoteJidAlt!`);
    console.log(`   LID: ${remoteJid}`);
    console.log(`   JID WhatsApp REAL: ${realJid}`);
    console.log(`   N?mero limpo: ${realNumber}`);
    console.log(`   Nome: ${waMessage.pushName || "N/A"}\n`);
    
    // ??  CR?TICO: Usar n?mero REAL em todos os lugares, NUNCA o LID!
    contactNumber = realNumber;              // ? Para exibi??o (5517991956944)
    jidSuffix = "s.whatsapp.net";           // ? Suffix WhatsApp normal
    normalizedJid = realJid;                // ? Para enviar mensagens
    
    // ?? SALVAR NO CACHE EM MEM?RIA: Mapeamento LID ? n?mero
    // N?O salva mais no banco para economizar Egress/Disk IO
    // O cache de sess?o ? suficiente para resolver @lid durante a sess?o
    session.contactsCache.set(remoteJid, {
      id: remoteJid,
      lid: remoteJid,
      phoneNumber: realJid,
      name: waMessage.pushName || undefined,
    });
    console.log(`?? [CACHE] Mapeamento LID ? phoneNumber salvo em mem?ria: ${remoteJid} ? ${realJid}`);
  } else {
    // Fallback: Contatos normais do WhatsApp (@s.whatsapp.net)
    const parsed = await parseRemoteJid(remoteJid, session.contactsCache, session.connectionId);
    contactNumber = parsed.contactNumber;
    jidSuffix = parsed.jidSuffix;
    normalizedJid = parsed.normalizedJid;
  }
  // -----------------------------------------------------------------------
  
  if (!contactNumber) {
    console.log(`[WhatsApp] Could not extract contact number from JID: ${remoteJid}`);
    return;
  }

  // BAILEYS 2025 OFICIAL: jidNormalizedUser() retorna JID limpo sem :device
  console.log(`[WhatsApp] Original JID: ${remoteJid}`);
  console.log(`[WhatsApp] Normalized JID: ${normalizedJid}`);
  console.log(`[WhatsApp] Clean number: ${contactNumber}`);
  
  // Ignorar mensagens do pr?prio n?mero conectado
  if (session.phoneNumber && contactNumber === session.phoneNumber) {
    console.log(`Ignoring message from own number: ${contactNumber}`);
    return;
  }
  
  // Extract message data including media
  let messageText = "";
  let canAutoReplyThis = true;
  let messageKind: "normal" | "stub" | "contact" | "protocol" | "unsupported" = "normal";
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let mediaMimeType: string | null = null;
  let mediaDuration: number | null = null;
  let mediaCaption: string | null = null;
  
  // ?? METADADOS PARA RE-DOWNLOAD DE M?DIA
  // Esses campos permitem baixar a m?dia novamente do WhatsApp enquanto ainda estiver dispon?vel
  let mediaKey: string | null = null;      // Chave de descriptografia (base64)
  let directPath: string | null = null;    // Caminho no servidor WhatsApp
  let mediaUrlOriginal: string | null = null; // URL original do WhatsApp

  const msg = unwrapIncomingMessageContent(waMessage.message as any);
    if (!msg) {
    messageKind = "stub";
    canAutoReplyThis = false;
    const stubType = (waMessage as any).messageStubType;
    messageText = stubType != null ? `[WhatsApp] Mensagem incompleta (stubType=${stubType})` : "[WhatsApp] Mensagem incompleta";
  }
  // Check for text messages
  else if (msg?.conversation) {
    messageText = msg.conversation;
  } else if (msg?.extendedTextMessage?.text) {
    messageText = msg.extendedTextMessage.text;
  }
  // Check for image
  else if (msg?.imageMessage) {
    mediaType = "image";
    mediaMimeType = msg.imageMessage.mimetype || "image/jpeg";
    mediaCaption = msg.imageMessage.caption || null;
    messageText = mediaCaption || "?? Imagem";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.imageMessage.mediaKey) {
      mediaKey = Buffer.from(msg.imageMessage.mediaKey).toString("base64");
    }
    directPath = msg.imageMessage.directPath || null;
    mediaUrlOriginal = msg.imageMessage.url || null;
    
    try {
      console.log(`?? [CLIENT] Baixando imagem...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`?? [CLIENT] Imagem baixada: ${buffer.length} bytes`);
      // Upload para Supabase Storage (SEM fallback base64 para evitar egress!)
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, "imagem");
      if (!mediaUrl) {
        console.warn(`?? [CLIENT] Falha no upload de imagem, n�o ser� salva`);
      }
    } catch (error) {
      console.error("? [CLIENT] Erro ao baixar imagem:", error);
      mediaUrl = null;
    }
  }
  // Check for audio
  else if (msg?.audioMessage) {
    mediaType = "audio";
    mediaMimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
    mediaDuration = msg.audioMessage.seconds || null;
    messageText = "?? �udio";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.audioMessage.mediaKey) {
      mediaKey = Buffer.from(msg.audioMessage.mediaKey).toString("base64");
    }
    directPath = msg.audioMessage.directPath || null;
    mediaUrlOriginal = msg.audioMessage.url || null;
    
    try {
      console.log(`??? [CLIENT] Baixando �udio...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`??? [CLIENT] �udio baixado: ${buffer.length} bytes`);
      // Upload para Supabase Storage (SEM fallback base64 para evitar egress!)
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, "audio");
      if (!mediaUrl) {
        console.warn(`?? [CLIENT] Falha no upload de �udio, n�o ser� salvo`);
      }
    } catch (error) {
      console.error("? [CLIENT] Erro ao baixar �udio:", error);
      mediaUrl = null;
    }
  }
  // Check for video
  else if (msg?.videoMessage) {
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    mediaCaption = msg.videoMessage.caption || null;
    mediaDuration = msg.videoMessage.seconds || null;
    messageText = mediaCaption || "?? V�deo";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.videoMessage.mediaKey) {
      mediaKey = Buffer.from(msg.videoMessage.mediaKey).toString("base64");
    }
    directPath = msg.videoMessage.directPath || null;
    mediaUrlOriginal = msg.videoMessage.url || null;
    
    try {
      console.log(`?? [CLIENT] Baixando v?deo...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`?? [CLIENT] V?deo baixado: ${buffer.length} bytes`);
      // Upload para Supabase Storage (v?deos s?o sempre grandes)
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, "video");
    } catch (error) {
      console.error("? [CLIENT] Erro ao baixar v?deo:", error);
      mediaUrl = null;
    }
  }
  // -----------------------------------------------------------------------
  // ?? DOCUMENTO COM LEGENDA (documentWithCaptionMessage) - WRAPPER DO WHATSAPP
  // Documentos com legenda chegam em: msg.documentWithCaptionMessage.message.documentMessage
  // -----------------------------------------------------------------------
  else if (msg?.documentWithCaptionMessage?.message?.documentMessage) {
    const docMsg = msg.documentWithCaptionMessage.message.documentMessage;
    mediaType = "document";
    mediaMimeType = docMsg.mimetype || "application/octet-stream";
    mediaCaption = docMsg.caption || null;
    const fileName = docMsg.fileName || "Documento";
    messageText = mediaCaption || `?? ${fileName}`;
    
    // ?? Extrair metadados para re-download posterior
    if (docMsg.mediaKey) {
      mediaKey = Buffer.from(docMsg.mediaKey).toString("base64");
    }
    directPath = docMsg.directPath || null;
    mediaUrlOriginal = docMsg.url || null;
    
    // ?? DOCUMENTO DO CLIENTE (COM CAPTION): Baixar e upload para Supabase Storage
    try {
      console.log(`?? [CLIENT] Baixando documento (com caption): ${fileName}...`);
      console.log(`?? [CLIENT] mediaKey presente:`, !!docMsg.mediaKey);
      console.log(`?? [CLIENT] directPath presente:`, !!docMsg.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`?? [CLIENT] Documento baixado: ${buffer.length} bytes, fazendo upload...`);
      // Upload para Supabase Storage
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, fileName);
      console.log(`? [CLIENT] Documento (com caption) processado: ${mediaUrl ? 'URL gerada' : 'falhou'}`);
    } catch (error) {
      console.error("? [CLIENT] Erro ao baixar documento (com caption):", error);
      mediaUrl = null;
    }
  }
  // -----------------------------------------------------------------------
  // ?? DOCUMENTO SIMPLES (documentMessage) - SEM WRAPPER
  // -----------------------------------------------------------------------
  else if (msg?.documentMessage) {
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    mediaCaption = msg.documentMessage.caption || null;
    const fileName = msg.documentMessage.fileName || "Documento";
    messageText = mediaCaption || `?? ${fileName}`;
    
    // ?? Extrair metadados para re-download posterior
    if (msg.documentMessage.mediaKey) {
      mediaKey = Buffer.from(msg.documentMessage.mediaKey).toString("base64");
    }
    directPath = msg.documentMessage.directPath || null;
    mediaUrlOriginal = msg.documentMessage.url || null;
    
    // ?? DOCUMENTO DO CLIENTE: Baixar e upload para Supabase Storage
    try {
      console.log(`?? [CLIENT] Baixando documento: ${fileName}...`);
      console.log(`?? [CLIENT] mediaKey presente:`, !!msg.documentMessage.mediaKey);
      console.log(`?? [CLIENT] directPath presente:`, !!msg.documentMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`?? [CLIENT] Documento baixado: ${buffer.length} bytes, fazendo upload...`);
      // Upload para Supabase Storage
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, fileName);
      console.log(`? [CLIENT] Documento processado: ${mediaUrl ? 'URL gerada' : 'falhou'}`);
    } catch (error) {
      console.error("? [CLIENT] Erro ao baixar documento:", error);
      mediaUrl = null;
    }
  }
  // ---------------------------------------------------------------------------
  // -----------------------------------------------------------------------
  // Contato compartilhado (vCard)
  // -----------------------------------------------------------------------
  else if (msg?.contactMessage) {
    const displayName = msg.contactMessage.displayName || "Contato";
    const parsed = parseVCardBasic(msg.contactMessage.vcard || "");
    messageText = `?? Contato: ${displayName}${parsed.phone ? ` - ${parsed.phone}` : ""}`;
    canAutoReplyThis = false;
    messageKind = "contact";
  }
  // -----------------------------------------------------------------------
  // Mensagens de protocolo (ex: revoke/delete)
  // -----------------------------------------------------------------------
  else if (msg?.protocolMessage) {
    const protoType = msg.protocolMessage.type;
    messageText = protoType === 0 || protoType === "REVOKE" ? "[Mensagem apagada]" : "[Mensagem de protocolo]";
    canAutoReplyThis = false;
    messageKind = "protocol";
  }

  // ?? RESPOSTA DE BOT�O INTERATIVO (interactiveResponseMessage)
  // Quando usu�rio clica em bot�o nativo (nativeFlowMessage quick_reply)
  // ---------------------------------------------------------------------------
  else if (msg?.interactiveResponseMessage) {
    try {
      const interactiveResponse = msg.interactiveResponseMessage;
      const nativeFlowResponse = interactiveResponse?.nativeFlowResponseMessage;
      
      if (nativeFlowResponse?.paramsJson) {
        // Extrair ID e texto do bot�o clicado
        const params = JSON.parse(nativeFlowResponse.paramsJson);
        messageText = params.id || params.display_text || 'Op��o selecionada';
        console.log(`?? [INTERACTIVE] Resposta de bot�o nativo recebida: "${messageText}"`);
        console.log(`   ?? Params: ${JSON.stringify(params)}`);
      } else if (interactiveResponse?.body?.text) {
        // Fallback: usar texto do body
        messageText = interactiveResponse.body.text;
        console.log(`?? [INTERACTIVE] Resposta interativa (body): "${messageText}"`);
      } else {
        messageText = 'Op��o selecionada';
        console.log(`?? [INTERACTIVE] Resposta interativa sem texto, usando fallback`);
      }
    } catch (parseError) {
      console.error(`?? [INTERACTIVE] Erro ao parsear resposta:`, parseError);
      messageText = 'Op��o selecionada';
    }
  }
  // ---------------------------------------------------------------------------
  // ?? RESPOSTA DE LISTA INTERATIVA (listResponseMessage)  
  // Quando usu�rio seleciona item de lista nativa (single_select)
  // ---------------------------------------------------------------------------
  else if (msg?.listResponseMessage) {
    try {
      const listResponse = msg.listResponseMessage;
      const selectedRowId = listResponse?.singleSelectReply?.selectedRowId;
      const title = listResponse?.title;
      
      // Usar o ID do item selecionado (que foi definido no n�)
      messageText = selectedRowId || title || 'Op��o selecionada';
      console.log(`?? [LIST-RESPONSE] Item de lista selecionado: "${messageText}"`);
      console.log(`   ?? Row ID: ${selectedRowId || 'N/A'}`);
      console.log(`   ?? Title: ${title || 'N/A'}`);
    } catch (parseError) {
      console.error(`?? [LIST-RESPONSE] Erro ao parsear resposta:`, parseError);
      messageText = 'Op��o selecionada';
    }
  }
  // ---------------------------------------------------------------------------
  // ?? RESPOSTA DE BOT�O ANTIGO (buttonsResponseMessage)
  // Compatibilidade com formato antigo de bot�es
  // ---------------------------------------------------------------------------
  else if (msg?.buttonsResponseMessage) {
    try {
      const buttonsResponse = msg.buttonsResponseMessage;
      messageText = buttonsResponse?.selectedButtonId || 
                    buttonsResponse?.selectedDisplayText || 
                    'Op��o selecionada';
      console.log(`?? [BUTTONS-RESPONSE] Bot�o antigo selecionado: "${messageText}"`);
    } catch (parseError) {
      console.error(`?? [BUTTONS-RESPONSE] Erro ao parsear resposta:`, parseError);
      messageText = 'Op��o selecionada';
    }
  }
    // Ignorar mensagens de tipos n�o suportados (rea��es, status, etc)
  else {
    const msgTypes = Object.keys(msg || {});
    console.log(`Ignoring unsupported message type from ${contactNumber}:`, msgTypes);
    messageText = msgTypes.length ? `[Mensagem nao suportada: ${msgTypes.join(', ')}]` : '[Mensagem nao suportada]';
    canAutoReplyThis = false;
    messageKind = 'unsupported';
  }

  // ??? BUSCAR FOTO DE PERFIL DO CONTATO
  let contactAvatar: string | null = null;
  try {
    if (session.socket) {
      const profilePicUrl = await session.socket.profilePictureUrl(normalizedJid, "image");
      if (profilePicUrl) {
        contactAvatar = profilePicUrl;
        console.log(`??? [AVATAR] Foto de perfil obtida para ${contactNumber}`);
      }
    }
  } catch (error) {
    // Contato sem foto de perfil (normal, n?o ? erro)
    console.log(`?? [AVATAR] Sem foto de perfil para ${contactNumber}`);
  }

  // FIX Encerramento: buscar apenas conversa ATIVA (nao fechada) - se fechada, cria nova
  // FIX 2026-02-21: Usa mutex para prevenir race condition de cria��o duplicada
  const conversationResult = await getOrCreateConversationSafe(
    session.connectionId,
    contactNumber,
    // createFn
    async () => {
      return await storage.createConversation({
        connectionId: session.connectionId,
        contactNumber,
        remoteJid: normalizedJid,
        jidSuffix,
        contactName: waMessage.pushName,
        contactAvatar,
        lastMessageText: messageText,
        lastMessageTime: eventTs,
        lastMessageFromMe: false,
        unreadCount: 1,
      });
    },
    // lookupFn
    async () => {
      return await storage.getActiveConversationByContactNumber(
        session.connectionId,
        contactNumber
      );
    }
  );
  let conversation = conversationResult.conversation;

  // Used later to decide append-based auto-reply eligibility (Meta/Instagram leads).
  const wasNewConversation = conversationResult.wasCreated;
  const nextUnreadCount = wasNewConversation
    ? Math.max(1, conversation.unreadCount || 1)
    : (conversation.unreadCount || 0) + 1;

  if (!wasNewConversation) {
    await storage.updateConversation(conversation.id, {
      remoteJid: normalizedJid,
      jidSuffix,
      lastMessageText: messageText,
      lastMessageTime: eventTs,
      lastMessageFromMe: false,
      unreadCount: nextUnreadCount,
      contactName: waMessage.pushName || conversation.contactName,
      contactAvatar: contactAvatar || conversation.contactAvatar,
    });
    conversation = {
      ...conversation,
      remoteJid: normalizedJid,
      jidSuffix,
      lastMessageText: messageText,
      lastMessageTime: eventTs,
      lastMessageFromMe: false,
      unreadCount: nextUnreadCount,
      contactName: waMessage.pushName || conversation.contactName,
      contactAvatar: contactAvatar || conversation.contactAvatar,
    };
  }

  // ---------------------------------------------------------------------------
  // FIX 2026: PRESENCE + SUBSCRIBE PARA NOVOS CONTATOS
  // ---------------------------------------------------------------------------
  // Para contatos novos (primeira mensagem), estabelecer a sess�o Signal
  // Protocol enviando presence e fazendo presenceSubscribe.
  // Isso � CR�TICO para que o retry de mensagens "Aguardando" funcione.
  // ---------------------------------------------------------------------------
  if (wasNewConversation) {
    try {
      await session.socket.sendPresenceUpdate('available', normalizedJid);
      await session.socket.presenceSubscribe(normalizedJid);
      console.log(`?? [NEW-CONTACT-FIX] Presence + Subscribe enviados para novo contato ${contactNumber} (${normalizedJid})`);
    } catch (presErr) {
      console.log(`?? [NEW-CONTACT-FIX] Erro ao enviar presence para novo contato:`, presErr);
    }
  }

  // ? FOLLOW-UP USU�RIOS: Resetar ciclo quando cliente responde
  // O sistema de follow-up para usu�rios usa a tabela "conversations" (n�o admin_conversations)
  try {
    await userFollowUpService.resetFollowUpCycle(conversation.id, "Cliente respondeu");
  } catch (error) {
    console.error("Erro ao resetar follow-up do usu?rio:", error);
  }

    const inboundMessageId =
      waMessage.key.id || `wa_${eventTs.getTime()}_${Math.random().toString(16).slice(2, 10)}`;

    // -------------------------------------------------------------------
    // FIX CTWA-RESOLVED: Quando PDO descriptografa, a mensagem j� existe
    // como stub no banco. Atualizar em vez de criar duplicata.
    // -------------------------------------------------------------------
    const isCTWAResolved = opts?.isCTWAResolved ?? false;
    let savedMessage: any;
    let ctwaUpdatedExisting = false;

    if (isCTWAResolved && waMessage.key.id) {
      try {
        const existingStub = await storage.getMessageByMessageId(waMessage.key.id);
        if (existingStub) {
          // Atualizar mensagem existente (stub ? texto real)
          await storage.updateMessage(existingStub.id, {
            text: messageText,
            mediaType: mediaType || undefined,
            mediaUrl: mediaUrl || undefined,
            mediaMimeType: mediaMimeType || undefined,
          });
          savedMessage = { ...existingStub, text: messageText };
          ctwaUpdatedExisting = true;
          console.log(`? [CTWA-RESOLVED-PIPELINE] Stub atualizado ? "${messageText.substring(0, 80)}" (msg=${existingStub.id})`);
        }
      } catch (lookupErr) {
        console.error(`?? [CTWA-RESOLVED-PIPELINE] Erro ao buscar stub:`, lookupErr);
      }
    }

    if (!ctwaUpdatedExisting) {
      try {
        savedMessage = await storage.createMessage({
          conversationId: conversation.id,
          messageId: inboundMessageId,
          fromMe: false,
          text: messageText,
          timestamp: eventTs,
          isFromAgent: false,
          mediaType,
          mediaUrl,
          mediaMimeType,
          mediaDuration,
          mediaCaption,
          // ?? Metadados para re-download de m�dia do WhatsApp
          mediaKey,
          directPath,
          mediaUrlOriginal,
        });
      } catch (createErr: any) {
        const isDuplicate =
          createErr?.code === "23505" ||
          String(createErr?.message || "").toLowerCase().includes("unique");

        if (!isDuplicate) {
          throw createErr;
        }

        console.warn(
          `?? [INCOMING-DUPLICATE] Colis�o de message_id=${inboundMessageId} em conversation=${conversation.id}. Tentando reaproveitar sem abortar pipeline.`,
        );

        const existingByMessageId = inboundMessageId
          ? await storage.getMessageByMessageId(inboundMessageId)
          : undefined;

        if (existingByMessageId) {
          const existingConversationId =
            (existingByMessageId as any).conversationId || (existingByMessageId as any).conversation_id;

          if (existingConversationId === conversation.id) {
            const shouldUpdateExisting =
              isStubOrIncompleteText(existingByMessageId.text) ||
              existingByMessageId.text === "Oi" ||
              existingByMessageId.text === "oi";

            if (shouldUpdateExisting && !isStubOrIncompleteText(messageText)) {
              try {
                savedMessage = await storage.updateMessage(existingByMessageId.id, {
                  text: messageText,
                  mediaType: mediaType || undefined,
                  mediaUrl: mediaUrl || undefined,
                  mediaMimeType: mediaMimeType || undefined,
                  mediaDuration: mediaDuration || undefined,
                  mediaCaption: mediaCaption || undefined,
                  mediaKey: mediaKey || undefined,
                  directPath: directPath || undefined,
                  mediaUrlOriginal: mediaUrlOriginal || undefined,
                });
              } catch (updateErr) {
                console.error(
                  `? [INCOMING-DUPLICATE] Falha ao atualizar mensagem existente ${existingByMessageId.id}:`,
                  updateErr,
                );
                savedMessage = existingByMessageId;
              }
            } else {
              savedMessage = existingByMessageId;
            }
          }
        }

        if (!savedMessage) {
          const fallbackMessageId = `${inboundMessageId}_dup_${Date.now().toString(36)}`;
          try {
            savedMessage = await storage.createMessage({
              conversationId: conversation.id,
              messageId: fallbackMessageId,
              fromMe: false,
              text: messageText,
              timestamp: eventTs,
              isFromAgent: false,
              mediaType,
              mediaUrl,
              mediaMimeType,
              mediaDuration,
              mediaCaption,
              mediaKey,
              directPath,
              mediaUrlOriginal,
            });
            console.warn(
              `?? [INCOMING-DUPLICATE] Pipeline preservado com message_id alternativo=${fallbackMessageId}.`,
            );
          } catch (fallbackErr) {
            console.error(`? [INCOMING-DUPLICATE] Falha no fallback de persist�ncia:`, fallbackErr);
            savedMessage = {
              id: fallbackMessageId,
              conversationId: conversation.id,
              messageId: fallbackMessageId,
              fromMe: false,
              text: messageText,
              timestamp: eventTs,
              isFromAgent: false,
              mediaType,
              mediaUrl,
              mediaMimeType,
              mediaDuration,
              mediaCaption,
            } as any;
          }
        }
      }
    }

    // Marcar como processada no anti-reenvio APENAS quando nao for stub/incompleta.
    // Isso evita perder mensagens de leads Meta que chegam primeiro como stub e depois descriptografam.
    if (incomingDedupeParams && messageKind !== 'stub') {
      try {
        await markIncomingMessageProcessed(incomingDedupeParams);
      } catch (dedupErr) {
        console.error('??????? [ANTI-REENVIO] Erro ao registrar incoming processado (nao critico):', dedupErr);
      }
    }
    
    // -----------------------------------------------------------------------
    // ?? SISTEMA DE RECUPERA��O: Marcar mensagem como PROCESSADA com sucesso
    // -----------------------------------------------------------------------
    // Se chegou at� aqui, a mensagem foi salva no banco de dados
    // Podemos marcar como processada na tabela pending_incoming_messages
    // -----------------------------------------------------------------------
    if (waMessage.key.id) {
      try {
        await markMessageAsProcessed(waMessage.key.id);
      } catch (markErr) {
        console.error(`?? [RECOVERY] Erro ao marcar como processada:`, markErr);
        // N�o bloqueia - mensagem j� foi salva no banco principal
      }
    }

    // ?? FIX CR?TICO: savedMessage.text pode conter transcri??o de ?udio!
    // createMessage() transcreve automaticamente ?udios ANTES de retornar.
    // Por isso SEMPRE usamos savedMessage.text (e n?o messageText original).
    const effectiveText = savedMessage.text || messageText;

    // Se a mensagem de m?dia (ex: ?udio) tiver sido transcrita ao salvar,
    // garantimos que o ?ltimo texto da conversa use essa transcri??o.
    if (effectiveText !== messageText) {
      await storage.updateConversation(conversation.id, {
        lastMessageText: effectiveText,
        lastMessageTime: eventTs,
      });
    }

    broadcastToUser(session.userId, {
      type: "new_message",
      conversationId: conversation.id,
      message: effectiveText,
      mediaType,
      // ?? FIX 2026: Enviar dados da conversa inline para real-time update sem refetch
      conversationUpdate: {
        id: conversation.id,
        contactNumber,
        contactName: conversation.contactName || waMessage.pushName || null,
        contactAvatar: conversation.contactAvatar || null,
        lastMessageText: effectiveText,
        lastMessageTime: eventTs.toISOString(),
        lastMessageFromMe: false,
        unreadCount: nextUnreadCount,
        isNew: wasNewConversation,
      },
      // ? REAL-TIME: Enviar mensagem completa para append inline (sem refetch)
      messageData: {
        id: savedMessage.id,
        conversationId: conversation.id,
        messageId: savedMessage.messageId,
        fromMe: false,
        text: effectiveText,
        timestamp: eventTs.toISOString(),
        isFromAgent: false,
        mediaType: mediaType || null,
        mediaUrl: savedMessage.mediaUrl || null,
        mediaMimeType: savedMessage.mediaMimeType || null,
        mediaDuration: savedMessage.mediaDuration || null,
        mediaCaption: savedMessage.mediaCaption || null,
      },
  });

  // ?? AI Agent/Chatbot Auto-Response com SISTEMA DE ACUMULA��O DE MENSAGENS
  // ?? IMPORTANTE: O check de "isAgentDisabled" se aplica TANTO � IA quanto ao CHATBOT/FLUXO!
  // Quando o dono responde manualmente, AMBOS os sistemas s�o pausados.
  try {
    const appendEligible =
      source === "append" && isAppendRecent;
    const allowAutoReplyCandidate =
      allowAutoReplyRequested && (source === "notify" || appendEligible);
    const shouldForceStubFallback =
      messageKind === "stub" && !canAutoReplyThis;

    if (!allowAutoReplyCandidate && !shouldForceStubFallback) {
      return;
    }

    if (!allowAutoReplyCandidate && shouldForceStubFallback) {
      console.log(
        `?? [STUB-FALLBACK] For�ando pipeline de stub para mensagem ${waMessage.key.id} (source=${source}, appendRecent=${isAppendRecent})`
      );
    }

    // Multi-connection: Check if aiEnabled is false for this specific connection
    if (session.connectionId) {
      try {
        const connRecord = await storage.getConnectionById(session.connectionId);
        if (connRecord && connRecord.aiEnabled === false) {
          console.log(`?? [AI AGENT] IA desativada para conex�o ${session.connectionId} - n�o responder automaticamente`);
          return;
        }
      } catch (e) {
        // Ignore lookup errors, proceed with AI
      }
    }

    // If we have no usable text, do not trigger chatbot/IA.
    if (!effectiveText || !effectiveText.trim()) {
      return;
    }

    const isAgentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
    
    // ?? LISTA DE EXCLUS�O: Verificar se o n�mero est� na lista de exclus�o
    const isExcluded = await storage.isNumberExcluded(session.userId, contactNumber);
    if (isExcluded) {
      console.log(`?? [AI AGENT] N�mero ${contactNumber} est� na LISTA DE EXCLUS�O - n�o responder automaticamente`);
      return;
    }
    
    // +-------------------------------------------------------------------------+
    // � ?? FIX CR�TICO: Verificar se AMBOS (IA E CHATBOT) est�o pausados       �
    // � Quando dono responde manualmente, o sistema inteiro pausa, n�o s� IA!  �
    // � Data: 2025-01-XX - Sincroniza��o Flow Builder + IA Agent               �
    // +-------------------------------------------------------------------------+
    if (isAgentDisabled) {
      console.log(`?? [AUTO-PAUSE ATIVO] IA/Chatbot pausados para conversa ${conversation.id}`);
      console.log(`   ?? Contato: ${contactNumber} | Motivo: dono respondeu manualmente ou transfer�ncia`);
      
      // Marcar que cliente tem mensagem pendente (para auto-reativa��o responder depois)
      try {
        await storage.markClientPendingMessage(conversation.id);
        console.log(`?? [AUTO-REATIVATE] Cliente enviou mensagem enquanto pausado - marcado como pendente`);
      } catch (err) {
        console.error("Erro ao marcar mensagem pendente:", err);
      }
      
      // ?? N�O processar nem pelo chatbot nem pela IA enquanto pausado!
      return;
    }
    
    if (!canAutoReplyThis) {
      if (messageKind === "stub") {
        // -------------------------------------------------------------------
        // FIX 2026-02-24: PDO RETRY CURTO + FALLBACK "OI"
        // -------------------------------------------------------------------
        // Mensagens CTWA (Click-to-WhatsApp de an�ncios Meta/Instagram)
        // chegam SEM encripta��o (sem n� 'enc') ? Baileys gera stub CIPHERTEXT.
        //
        // O Baileys PR #2334 internamente chama requestPlaceholderResend()
        // para pedir ao CELULAR que reenvie o conte�do real via PDO.
        // Por�m o celular tem apenas 8s para responder ? frequentemente falha
        // se o celular estiver dormindo/sem internet/em background.
        //
        // Estrat�gia:
        //   - 4 tentativas de PDO, intervalo de 2s
        //   - fallback "Oi" em ~8s se continuar sem conte�do �til
        // Objetivo: destravar IA r�pido sem texto hardcoded de resposta.
        //
        // Ref: https://github.com/WhiskeySockets/Baileys/pull/2334
        // Ref: https://github.com/WhiskeySockets/Baileys/issues/1767
        // -------------------------------------------------------------------
        const stubMsgId = waMessage.key.id;
        const stubConversationId = conversation.id;
        const stubUserId = session.userId;
        const stubContactNumber = contactNumber;
        const stubConnectionId = session.connectionId;
        const stubRemoteJid = remoteJid;
        const stubSavedMessageId = savedMessage.id;
        const stubJidSuffix = jidSuffix || DEFAULT_JID_SUFFIX;

        const MAX_PDO_RETRIES = 4;
        const PDO_RETRY_INTERVAL_MS = 2000;
        const FINAL_FALLBACK_MS = MAX_PDO_RETRIES * PDO_RETRY_INTERVAL_MS;

        console.log(`? [STUB-PDO-RETRY] Mensagem stub de ${stubContactNumber} (id=${stubMsgId}) - iniciando ${MAX_PDO_RETRIES} tentativas PDO (intervalo=${PDO_RETRY_INTERVAL_MS / 1000}s)`);
        console.log(`   ?? Plano: #1 (0s) ? #2 (2s) ? #3 (4s) ? #4 (6s) ? fallback (${FINAL_FALLBACK_MS / 1000}s)`);

        // -- RETRY BOOST: Sinais agressivos para ajudar na descriptografia --
        try {
          await session.socket.sendPresenceUpdate('available', normalizedJid);
        } catch (_presErr) { /* n�o-cr�tico */ }

        try {
          await session.socket.readMessages([waMessage.key]);
          console.log(`?? [STUB-PDO-RETRY] Read receipt enviado para ${stubMsgId}`);
        } catch (_readErr) { /* n�o-cr�tico */ }

        // Presen�a extra ap�s 3s e 5s (whatsmeow envia IMEDIATAMENTE para CTWA)
        setTimeout(async () => {
          try { await session.socket.sendPresenceUpdate('available', normalizedJid); } catch (_e) { /* */ }
          try { await session.socket.readMessages([waMessage.key]); } catch (_e) { /* */ }
        }, 3000);
        setTimeout(async () => {
          try { await session.socket.sendPresenceUpdate('available', normalizedJid); } catch (_e) { /* */ }
        }, 5000);

        // Capturar params de dedupe para verificar ap�s timeouts
        const stubDedupeParams = incomingDedupeParams ? { ...incomingDedupeParams } : null;

        // Dados do PDO: chave da mensagem + metadados para preservar
        const pdoMessageKey = {
          remoteJid: waMessage.key.remoteJid,
          fromMe: waMessage.key.fromMe,
          id: waMessage.key.id,
          participant: waMessage.key.participant,
        };
        const pdoMsgData = {
          key: waMessage.key,
          messageTimestamp: (waMessage as any).messageTimestamp,
          pushName: waMessage.pushName,
          participant: (waMessage as any).participant,
          verifiedBizName: (waMessage as any).verifiedBizName,
        };

        // -- Fun��o helper: verificar se stub j� foi resolvido --
        const checkIfResolved = async (): Promise<boolean> => {
          if (stubDedupeParams) {
            const wasDecrypted = await isIncomingMessageProcessed(stubDedupeParams);
            if (wasDecrypted) {
              if (stubMsgId) {
                try {
                  const dbMessage = await storage.getMessageByMessageId(stubMsgId);
                  if (dbMessage && !isStubOrIncompleteText(dbMessage.text)) {
                    return true;
                  }
                } catch (_dbErr) {
                  // segue para outras valida��es
                }
              } else {
                return true;
              }
            }
          }

          if (stubMsgId) {
            try {
              const dbMessage = await storage.getMessageByMessageId(stubMsgId);
              if (dbMessage && !isStubOrIncompleteText(dbMessage.text)) {
                return true;
              }
            } catch (_dbErr) {
              // segue para cache
            }
          }

          // S� considerar cache quando houver conte�do realmente �til
          const cached = getCachedMessage(stubUserId, stubMsgId || "");
          if (cached && isMeaningfulIncomingContent(cached)) return true;

          if (cached) {
            console.log(`?? [STUB-PDO-RETRY] Cache t�cnico detectado para ${stubMsgId}, mantendo retry/fallback.`);
          }
          return false;
        };

        // -- Fun��o helper: tentar PDO via requestPlaceholderResend --
        const attemptPDO = async (attemptNum: number): Promise<void> => {
          try {
            if (await checkIfResolved()) {
              console.log(`? [STUB-PDO-RETRY] Mensagem ${stubMsgId} j� resolvida antes da tentativa #${attemptNum}`);
              return;
            }

            console.log(`?? [STUB-PDO-RETRY] Tentativa #${attemptNum} de PDO para ${stubMsgId} de ${stubContactNumber}`);

            // Enviar presen�a para manter sess�o ativa
            try { await session.socket.sendPresenceUpdate('available', normalizedJid); } catch (_e) { /* */ }
            try { await session.socket.readMessages([waMessage.key]); } catch (_e) { /* */ }

            // Chamar requestPlaceholderResend do Baileys
            // Ap�s o timeout de 8s do Baileys, o placeholderResendCache � limpo
            // para este msgId, permitindo nova tentativa
            const requestId = await (session.socket as any).requestPlaceholderResend(pdoMessageKey, pdoMsgData);
            
            if (requestId === 'RESOLVED') {
              console.log(`? [STUB-PDO-RETRY] Mensagem ${stubMsgId} resolvida durante tentativa #${attemptNum}!`);
            } else if (requestId) {
              console.log(`?? [STUB-PDO-RETRY] PDO #${attemptNum} enviado para ${stubMsgId} (requestId=${requestId})`);
            } else {
              console.log(`?? [STUB-PDO-RETRY] PDO #${attemptNum} retornou undefined para ${stubMsgId} (j� em cache ou resolvido)`);
            }
          } catch (pdoErr) {
            console.error(`? [STUB-PDO-RETRY] Erro na tentativa #${attemptNum} para ${stubMsgId}:`, pdoErr);
          }
        };

        // -- RETRY PDO: 4 tentativas em janela curta --
        for (let attemptNum = 1; attemptNum <= MAX_PDO_RETRIES; attemptNum++) {
          setTimeout(() => {
            void attemptPDO(attemptNum);
          }, (attemptNum - 1) * PDO_RETRY_INTERVAL_MS);
        }

        // -- FALLBACK FINAL (t=8s): Se nenhuma PDO funcionou ? "Oi" --
        setTimeout(async () => {
          try {
            // Verificar uma �ltima vez se foi resolvido
            if (await checkIfResolved()) {
              console.log(`? [STUB-PDO-RETRY] Mensagem ${stubMsgId} resolvida ap�s ${FINAL_FALLBACK_MS/1000}s! Nenhum fallback necess�rio.`);
              return;
            }

            // -- FALLBACK: Usar "Oi" como texto para IA responder --
            const fallbackText = "Oi";
            console.log(`?? [STUB-FALLBACK] Mensagem ${stubMsgId} ainda incompleta ap�s ${MAX_PDO_RETRIES} tentativas PDO (${FINAL_FALLBACK_MS/1000}s) - usando fallback "${fallbackText}"`);
            console.log(`?? [STUB-FALLBACK] decrypt_fallback_oi_triggered conversation=${stubConversationId} message=${stubMsgId} user=${stubUserId} connection=${stubConnectionId || "none"}`);

            // Atualizar texto da mensagem salva
            try {
              await storage.updateMessage(stubSavedMessageId, { text: fallbackText });
              console.log(`?? [STUB-FALLBACK] Mensagem ${stubSavedMessageId} atualizada para "${fallbackText}"`);
            } catch (updateErr) {
              console.error(`? [STUB-FALLBACK] Erro ao atualizar mensagem:`, updateErr);
            }

            // Atualizar lastMessageText da conversa
            try {
              await storage.updateConversation(stubConversationId, { lastMessageText: fallbackText });
            } catch (convErr) {
              console.error(`? [STUB-FALLBACK] Erro ao atualizar conversa:`, convErr);
            }

            // Marcar como processada no anti-reenvio
            if (stubDedupeParams) {
              try { await markIncomingMessageProcessed(stubDedupeParams); } catch (_dedupErr) { /* */ }
            }

            // Broadcast para UI
            try {
              broadcastToUser(stubUserId, {
                type: "message_updated",
                conversationId: stubConversationId,
                messageId: stubSavedMessageId,
                text: fallbackText,
              });
            } catch (_broadcastErr) { /* */ }

            // Verificar se agente pode responder
            const isAgentDisabled = await storage.isAgentDisabledForConversation(stubConversationId);
            if (isAgentDisabled) {
              console.log(`?? [STUB-FALLBACK] Agente pausado para conversa ${stubConversationId}`);
              console.log(`?? [STUB-FALLBACK] decrypt_fallback_blocked_by_rules:agent_paused conversation=${stubConversationId}`);
              return;
            }

            if (stubConnectionId) {
              try {
                const connRecord = await storage.getConnectionById(stubConnectionId);
                if (connRecord && connRecord.aiEnabled === false) {
                  console.log(`?? [STUB-FALLBACK] IA desativada para conex�o ${stubConnectionId}`);
                  console.log(`?? [STUB-FALLBACK] decrypt_fallback_blocked_by_rules:ai_disabled connection=${stubConnectionId}`);
                  return;
                }
              } catch (_e) { /* prosseguir */ }
            }

            const isExcluded = await storage.isNumberExcluded(stubUserId, stubContactNumber);
            if (isExcluded) {
              console.log(`?? [STUB-FALLBACK] N�mero ${stubContactNumber} na lista de exclus�o`);
              console.log(`?? [STUB-FALLBACK] decrypt_fallback_blocked_by_rules:number_excluded contact=${stubContactNumber}`);
              return;
            }

            // Processar via Chatbot (prioridade)
            try {
              const { tryProcessChatbotMessage, isNewContact } = await import("./chatbotIntegration");
              const isFirstContact = await isNewContact(stubConversationId);
              const chatbotResult = await tryProcessChatbotMessage(
                stubUserId,
                stubConversationId,
                stubContactNumber,
                fallbackText,
                isFirstContact
              );

              if (chatbotResult.handled) {
                console.log(`?? [STUB-FALLBACK] Mensagem processada pelo chatbot de fluxo`);
                return;
              }
            } catch (chatbotErr) {
              console.error(`?? [STUB-FALLBACK] Erro no chatbot (tentando IA):`, chatbotErr);
            }

            // Processar via IA (sistema de acumula��o)
            try {
              const agentConfig = await storage.getAgentConfig(stubUserId);
              const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
              const responseDelayMs = responseDelaySeconds * 1000;

              const existingPending = pendingResponses.get(stubConversationId);

              if (existingPending) {
                clearTimeout(existingPending.timeout);
                existingPending.messages.push(fallbackText);
                existingPending.isCTWAFallback = true; // ?? Marcar como CTWA fallback
                const executeAt = new Date(Date.now() + responseDelayMs);
                existingPending.timeout = setTimeout(async () => {
                  await processAccumulatedMessages(existingPending);
                }, responseDelayMs);
                console.log(`?? [STUB-FALLBACK] Mensagem acumulada (${existingPending.messages.length} msgs) para ${stubContactNumber}`);
                try {
                  await storage.updatePendingAIResponseMessages(stubConversationId, existingPending.messages, executeAt);
                } catch (_dbErr) { /* */ }
              } else {
                const executeAt = new Date(Date.now() + responseDelayMs);
                const pending: PendingResponse = {
                  timeout: null as any,
                  messages: [fallbackText],
                  conversationId: stubConversationId,
                  userId: stubUserId,
                  connectionId: stubConnectionId,
                  contactNumber: stubContactNumber,
                  jidSuffix: stubJidSuffix,
                  startTime: Date.now(),
                  isCTWAFallback: true, // ?? Marcar como CTWA fallback
                };
                pending.timeout = setTimeout(async () => {
                  await processAccumulatedMessages(pending);
                }, responseDelayMs);
                pendingResponses.set(stubConversationId, pending);
                console.log(`?? [STUB-FALLBACK] Timer IA de ${responseDelaySeconds}s iniciado para ${stubContactNumber}`);
                try {
                  await storage.savePendingAIResponse({
                    conversationId: stubConversationId,
                    userId: stubUserId,
                    contactNumber: stubContactNumber,
                    jidSuffix: stubJidSuffix,
                    messages: [fallbackText],
                    executeAt,
                  });
                } catch (_dbErr) { /* */ }
              }

              console.log(`?? [STUB-FALLBACK] IA ativada para ${stubContactNumber} com texto "${fallbackText}"`);
            } catch (aiErr) {
              console.error(`? [STUB-FALLBACK] Erro ao iniciar IA:`, aiErr);
              // N�O enviar mensagem de erro para o cliente - apenas logar
              // A mensagem "reenviar por favor" causava UX ruim
              console.log(`?? [STUB-FALLBACK] IA falhou para ${stubContactNumber} - aguardando pr�xima mensagem do cliente`);
            }
          } catch (err) {
            console.error(`? [STUB-FALLBACK] Erro no timeout final:`, err);
          }
        }, FINAL_FALLBACK_MS);
      }
      return;
    }

    // ? Agente/Chatbot N�O est� pausado - processar normalmente
    
    // ?? CHATBOT DE FLUXO: Verificar se o usu�rio tem chatbot ativo ANTES da IA
    // O chatbot tem prioridade sobre a IA quando ambos est�o configurados
    const { tryProcessChatbotMessage, isNewContact } = await import("./chatbotIntegration");
    const isFirstContact = await isNewContact(conversation.id);
    const chatbotResult = await tryProcessChatbotMessage(
      session.userId,
      conversation.id,
      contactNumber,
      effectiveText,
      isFirstContact
    );
    
    if (chatbotResult.handled) {
      console.log(`?? [CHATBOT] Mensagem processada pelo chatbot de fluxo`);
      if (chatbotResult.transferToHuman) {
        console.log(`?? [CHATBOT] Conversa transferida para humano - IA/Chatbot desativados para esta conversa`);
      }
      return; // Chatbot j� processou, n�o precisa da IA
    }
    
    // ?? CR�TICO: Verificar se �ltima mensagem foi do cliente (n�o do agente)
    // Se �ltima mensagem for do agente, N�O responder (evita loop)
    const recentMessages = await storage.getMessagesByConversationId(conversation.id);
    const lastMessage = recentMessages[recentMessages.length - 1];
    
    if (lastMessage && lastMessage.fromMe) {
      console.log(`?? [AI AGENT] �ltima mensagem foi do agente, n�o respondendo (evita loop)`);
      return;
    }
    
    // ? IA pode responder (n�o est� pausada e chatbot n�o processou)
    {
      const userId = session.userId;
      const conversationId = conversation.id;
      const targetNumber = contactNumber;
      const finalText = effectiveText;
      
      // ?? SISTEMA DE ACUMULA??O: Buscar delay configurado
      const agentConfig = await storage.getAgentConfig(userId);
      const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
      const responseDelayMs = responseDelaySeconds * 1000;
      
      // Verificar se j? existe um timeout pendente para esta conversa
      const existingPending = pendingResponses.get(conversationId);
      
      if (existingPending) {
        // ? ACUMULA��O: Nova mensagem chegou - cancelar timeout anterior e acumular
        clearTimeout(existingPending.timeout);
        existingPending.messages.push(finalText);
        console.log(`?? [AI AGENT] Mensagem acumulada (${existingPending.messages.length} mensagens) para ${targetNumber}`);
        console.log(`?? [AI AGENT] Mensagens acumuladas: ${existingPending.messages.map(m => `"${m.substring(0, 30)}..."`).join(' | ')}`);
        
        const executeAt = new Date(Date.now() + responseDelayMs);
        
        // Criar novo timeout com as mensagens acumuladas
        existingPending.timeout = setTimeout(async () => {
          await processAccumulatedMessages(existingPending);
        }, responseDelayMs);
        
        console.log(`?? [AI AGENT] Timer reiniciado: ${responseDelaySeconds}s para ${targetNumber}`);
        
        // ?? PERSISTENT TIMER: Atualizar no banco
        try {
          await storage.updatePendingAIResponseMessages(conversationId, existingPending.messages, executeAt);
          console.log(`?? [AI AGENT] Timer atualizado no banco - ${existingPending.messages.length} msgs - executa �s ${executeAt.toISOString()}`);
        } catch (dbError) {
          console.error(`?? [AI AGENT] Erro ao atualizar timer no banco (n�o cr�tico):`, dbError);
        }
      } else {
        // Nova conversa - criar entrada de acumula��o
        console.log(`?? [AI AGENT] Novo timer de ${responseDelaySeconds}s para ${targetNumber}...`);
        console.log(`?? [AI AGENT] Primeira mensagem: "${finalText}"`);
        
        const executeAt = new Date(Date.now() + responseDelayMs);
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages: [finalText],
          conversationId,
          userId,
          connectionId: session.connectionId,
          contactNumber: targetNumber,
          jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: Date.now(),
        };
        
        pending.timeout = setTimeout(async () => {
          await processAccumulatedMessages(pending);
        }, responseDelayMs);
        
        pendingResponses.set(conversationId, pending);
        
        // ?? PERSISTENT TIMER: Salvar no banco para sobreviver a restarts
        try {
          await storage.savePendingAIResponse({
            conversationId,
            userId,
            contactNumber: targetNumber,
            jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
            messages: [finalText],
            executeAt,
          });
          console.log(`?? [AI AGENT] Timer persistido no banco - executa �s ${executeAt.toISOString()}`);
        } catch (dbError) {
          console.error(`?? [AI AGENT] Erro ao persistir timer (n�o cr�tico):`, dbError);
        }
      }
    }
  } catch (error) {
    console.error("Error scheduling AI response:", error);
  }
}

// ?? FUN��O PARA PROCESSAR MENSAGENS ACUMULADAS
async function processAccumulatedMessages(pending: PendingResponse): Promise<void> {
  const { conversationId, userId, connectionId, contactNumber, jidSuffix, messages } = pending;
  let resolvedConnectionIdForRetry: string | undefined = connectionId;
  
  // ?? ANTI-DUPLICA��O: Verificar se j� est� processando esta conversa
  if (conversationsBeingProcessed.has(conversationId)) {
    console.log(`?? [AI AGENT] ?? Conversa ${conversationId} j� est� sendo processada, IGNORANDO duplicata`);
    return;
  }
  
  // ?? Marcar como em processamento ANTES de qualquer coisa
  conversationsBeingProcessed.set(conversationId, Date.now());
  
  // ?? CR�TICO: Verificar se IA foi desativada ANTES de processar timer
  // Bug: Timer criado quando IA ativa pode executar depois que IA foi desativada
  const isAgentDisabled = await storage.isAgentDisabledForConversation(conversationId);
  if (isAgentDisabled) {
    console.log(`\n${'!'.repeat(60)}`);
    console.log(`?? [AI AGENT] IA DESATIVADA - Timer cancelado`);
    console.log(`   conversationId: ${conversationId}`);
    console.log(`   contactNumber: ${contactNumber}`);
    console.log(`   ?? IA foi desativada entre cria��o e execu��o do timer`);
    console.log(`${'!'.repeat(60)}\n`);
    
    // Marcar timer como skipped (n�o � falha t�cnica, � regra de neg�cio)
    await storage.markPendingAIResponseSkipped(conversationId, 'agent_disabled');
    conversationsBeingProcessed.delete(conversationId);
    pendingResponses.delete(conversationId);
    return;
  }
  
  // Remover da fila de pendentes
  pendingResponses.delete(conversationId);
  
  const totalWaitTime = ((Date.now() - pending.startTime) / 1000).toFixed(1);
  console.log(`\n?? [AI AGENT] =========== PROCESSANDO RESPOSTA ===========`);
  console.log(`   ?? Aguardou ${totalWaitTime}s | ${messages.length} mensagem(s) acumulada(s)`);
  console.log(`   ?? Contato: ${contactNumber}`);
  if (pending.isCTWAFallback) {
    console.log(`   ?? CTWA FALLBACK: IA vai receber contexto de cliente via Meta Ads`);
  }
  
  // ?? FLAG DE SUCESSO: S� marca completed se a mensagem foi REALMENTE enviada
  let responseSuccessful = false;
  
  try {
    const conversationRecord = await storage.getConversation(conversationId);
    if (!conversationRecord) {
      console.warn(`?? [AI AGENT] Conversa ${conversationId} n�o encontrada. Marcando timer como skipped.`);
      await storage.markPendingAIResponseSkipped(conversationId, 'conversation_not_found');
      return;
    }

    const effectiveConnectionId = conversationRecord.connectionId || connectionId;
    if (!effectiveConnectionId) {
      console.warn(`?? [AI AGENT] Sem connectionId para conversa ${conversationId}. Marcando timer como failed.`);
      await storage.markPendingAIResponseFailed(
        conversationId,
        'missing_connection_id',
        'Conversation has no connection scope',
      );
      return;
    }
    resolvedConnectionIdForRetry = effectiveConnectionId;

    if (connectionId && connectionId !== effectiveConnectionId) {
      console.warn(
        `?? [AI AGENT] Timer com connectionId divergente (timer=${connectionId}, conv=${effectiveConnectionId}) para conversa ${conversationId}. Usando connection da conversa.`,
      );
    }

    const scopedConnection = await storage.getConnectionById(effectiveConnectionId);
    if (!scopedConnection || scopedConnection.userId !== userId) {
      console.warn(
        `?? [AI AGENT] Escopo inv�lido de conex�o para conversa ${conversationId}. connectionId=${effectiveConnectionId}`,
      );
      await storage.markPendingAIResponseFailed(
        conversationId,
        'connection_scope_invalid',
        `Connection ${effectiveConnectionId} not owned by user ${userId}`,
      );
      return;
    }

    if (scopedConnection.aiEnabled === false) {
      console.log(`?? [AI AGENT] IA desativada para conex�o ${effectiveConnectionId} - timer cancelado`);
      await storage.markPendingAIResponseSkipped(conversationId, 'connection_ai_disabled');
      return;
    }

    // Idempotency: if the conversation already has a reply (owner or agent) newer than
    // the last customer message, this timer is obsolete and must not re-send.
    try {
      const { lastCustomerAt, lastAgentAt, lastOwnerAt } = await storage.getConversationLastMessageTimes(conversationId);
      const lastReplyAt = [lastAgentAt, lastOwnerAt].filter(Boolean).reduce((a: any, b: any) => (a && a > b ? a : b), null as any);

      if (lastCustomerAt && lastReplyAt && lastReplyAt > lastCustomerAt) {
        console.log(`?? [AI AGENT] Timer obsoleto: j? existe resposta mais recente que a ?ltima msg do cliente. Marcando como completed.`);
        responseSuccessful = true;
        return;
      }
    } catch (stateErr) {
      console.warn(`?? [AI AGENT] Falha ao checar estado de idempot?ncia (n?o cr?tico):`, stateErr);
    }

    const currentSession = sessions.get(effectiveConnectionId);
    if (!currentSession?.socket) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`?? [AI Agent] BLOQUEIO: Session/socket n�o dispon�vel`);
      console.log(`   userId: ${userId}`);
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   contactNumber: ${contactNumber}`);
      console.log(`   ?? WhatsApp provavelmente desconectado`);
      console.log(`${'!'.repeat(60)}\n`);

      const pendingAgeMs = Date.now() - pending.startTime;
      let connectionState = await storage.getConnectionById(effectiveConnectionId);
      if (!connectionState) {
        connectionState = await storage.getConnectionByUserId(userId, effectiveConnectionId);
      }
      const isConnectionMarkedConnected = !!connectionState?.isConnected;
      const recoveryScope = connectionState?.id || effectiveConnectionId;

      if (isConnectionMarkedConnected && connectionState?.id) {
        const lastRecoveryAt = sessionRecoveryAttemptAt.get(recoveryScope) || 0;
        const sinceLastRecoveryMs = Date.now() - lastRecoveryAt;
        if (sinceLastRecoveryMs >= SESSION_RECOVERY_ATTEMPT_COOLDOWN_MS) {
          sessionRecoveryAttemptAt.set(recoveryScope, Date.now());
          console.log(`?? [AI AGENT] Sess�o ausente mas DB=connected. For�ando reconnect (conn=${connectionState.id.substring(0, 8)}, user=${userId.substring(0, 8)})`);
          void connectWhatsApp(userId, connectionState.id).catch((reconnectErr) => {
            console.error(`?? [AI AGENT] Falha ao disparar reconnect por sess�o indispon�vel:`, reconnectErr);
          });
        }
      }

      if (!isConnectionMarkedConnected && pendingAgeMs >= SESSION_UNAVAILABLE_MAX_AGE_MS) {
        console.warn(`?? [AI AGENT] Timer antigo sem sess�o e conex�o offline (${Math.round(pendingAgeMs / 60000)}min). Marcando como failed para evitar loop infinito.`);
        try {
          await storage.markPendingAIResponseFailed(conversationId, 'session_unavailable_offline', `Session offline for ${Math.round(pendingAgeMs / 60000)}min, connection disconnected in DB`);
        } catch (dbErr) {
          console.error(`?? [AI AGENT] Erro ao marcar timer como failed:`, dbErr);
        }
        conversationsBeingProcessed.delete(conversationId);
        return;
      }

      const retryDelayMs = isConnectionMarkedConnected
        ? SESSION_AVAILABLE_RETRY_MS
        : SESSION_UNAVAILABLE_RETRY_MS;

      console.log(`?? [AI AGENT] Reagendando timer para ${contactNumber} em ${Math.round(retryDelayMs / 1000)}s (sess�o indispon�vel, connected=${isConnectionMarkedConnected})...`);
      
      const retryPending: PendingResponse = {
        timeout: null as any,
        messages,
        conversationId,
        userId,
        connectionId: connectionState?.id || effectiveConnectionId,
        contactNumber,
        jidSuffix,
        startTime: pending.startTime, // Manter tempo original
        isCTWAFallback: pending.isCTWAFallback, // Preservar flag CTWA no retry
      };
      
      retryPending.timeout = setTimeout(async () => {
        console.log(`?? [AI AGENT] Retry: Tentando processar ${contactNumber} novamente...`);
        await processAccumulatedMessages(retryPending);
      }, retryDelayMs);
      
      pendingResponses.set(conversationId, retryPending);
      
      // Atualizar execute_at no banco para refletir o novo hor�rio
      const newExecuteAt = new Date(Date.now() + retryDelayMs);
      try {
        await storage.updatePendingAIResponseMessages(conversationId, messages, newExecuteAt);
        console.log(`?? [AI AGENT] Timer reagendado no banco para ${newExecuteAt.toISOString()}`);
      } catch (dbErr) {
        console.error(`?? [AI AGENT] Erro ao reagendar no banco:`, dbErr);
      }
      
      // Remover do processamento para permitir retry
      conversationsBeingProcessed.delete(conversationId);
      return;
    }
    
    // ? FIX: Verificar se o socket est� REALMENTE pronto para enviar
    // O session pode existir mas o WebSocket interno pode estar fechado/reconectando
    // Sem essa verifica��o, gastamos tokens de LLM e depois falhamos no envio
    const socketUser = currentSession.socket?.user;
    const socketWs = (currentSession.socket as any)?.ws;
    const wsReadyState = socketWs?.readyState;
    
    // WebSocket.OPEN = 1. Se != 1, o socket n�o est� pronto para enviar
    if (!socketUser || (wsReadyState !== undefined && wsReadyState !== 1)) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`? [AI Agent] BLOQUEIO: Socket existe mas WebSocket N�O est� OPEN`);
      console.log(`   userId: ${userId}`);
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   contactNumber: ${contactNumber}`);
      console.log(`   socketUser: ${socketUser ? 'sim' : 'n�o'}`);
      console.log(`   wsReadyState: ${wsReadyState} (OPEN=1)`);
      console.log(`   ?? Socket reconectando, retry r�pido em ${CONNECTION_CLOSED_RETRY_MS/1000}s`);
      console.log(`${'!'.repeat(60)}\n`);

      let socketConnectionState = await storage.getConnectionById(effectiveConnectionId);
      if (!socketConnectionState) {
        socketConnectionState = await storage.getConnectionByUserId(userId, effectiveConnectionId);
      }
      const socketRecoveryScope = socketConnectionState?.id || effectiveConnectionId;
      if (socketConnectionState?.isConnected && socketConnectionState.id) {
        const lastSocketRecoveryAt = sessionRecoveryAttemptAt.get(socketRecoveryScope) || 0;
        const sinceLastSocketRecoveryMs = Date.now() - lastSocketRecoveryAt;
        if (sinceLastSocketRecoveryMs >= SESSION_RECOVERY_ATTEMPT_COOLDOWN_MS) {
          sessionRecoveryAttemptAt.set(socketRecoveryScope, Date.now());
          console.log(`?? [AI AGENT] Socket n�o OPEN mas DB=connected. For�ando reconnect (conn=${socketConnectionState.id.substring(0, 8)}, user=${userId.substring(0, 8)})`);
          void connectWhatsApp(userId, socketConnectionState.id).catch((reconnectErr) => {
            console.error(`?? [AI AGENT] Falha ao disparar reconnect por socket n�o OPEN:`, reconnectErr);
          });
        }
      }
      
      const retryPending: PendingResponse = {
        timeout: null as any,
        messages,
        conversationId,
        userId,
        connectionId: effectiveConnectionId,
        contactNumber,
        jidSuffix,
        startTime: pending.startTime,
        isCTWAFallback: pending.isCTWAFallback,
      };
      
      retryPending.timeout = setTimeout(async () => {
        console.log(`?? [AI AGENT] Retry r�pido (socket n�o pronto): ${contactNumber}`);
        await processAccumulatedMessages(retryPending);
      }, CONNECTION_CLOSED_RETRY_MS);
      
      pendingResponses.set(conversationId, retryPending);
      
      try {
        const newExecuteAt = new Date(Date.now() + CONNECTION_CLOSED_RETRY_MS);
        await storage.updatePendingAIResponseMessages(conversationId, messages, newExecuteAt);
      } catch (dbErr) {
        console.error(`?? [AI AGENT] Erro ao reagendar no banco:`, dbErr);
      }
      
      conversationsBeingProcessed.delete(conversationId);
      return;
    }
    
    // ?? CHECK DE LIMITE DE MENSAGENS E PLANO VENCIDO
    const FREE_TRIAL_LIMIT = 25;
    const connection = scopedConnection;
    if (connection) {
      const subscription = await storage.getUserSubscription(userId);
      
      // ? CORRE��O: Verificar status E se o plano est� vencido por data
      let hasActiveSubscription = subscription?.status === 'active';
      let isSubscriptionExpired = false;
      
      // ?? Verificar se o plano est� vencido pela data_fim
      if (subscription?.dataFim) {
        const endDate = new Date(subscription.dataFim);
        const now = new Date();
        if (now > endDate) {
          isSubscriptionExpired = true;
          hasActiveSubscription = false;
          console.log(`?? [AI AGENT] PLANO VENCIDO! data_fim: ${endDate.toISOString()} < agora: ${now.toISOString()}`);
        }
      }
      
      // ?? Verificar tamb�m pelo next_payment_date (para assinaturas recorrentes)
      if (subscription?.nextPaymentDate && !isSubscriptionExpired) {
        const nextPayment = new Date(subscription.nextPaymentDate);
        const now = new Date();
        // Considerar vencido se passou mais de 5 dias da data de pagamento
        const daysOverdue = Math.floor((now.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 5) {
          isSubscriptionExpired = true;
          hasActiveSubscription = false;
          console.log(`?? [AI AGENT] PAGAMENTO EM ATRASO! ${daysOverdue} dias - nextPaymentDate: ${nextPayment.toISOString()}`);
        }
      }
      
      if (!hasActiveSubscription) {
        const agentMessagesCount = await storage.getAgentMessagesCount(connection.id);
        
        // ?? Se plano venceu, tamb�m volta pro limite de 25 mensagens (plano de teste)
        if (isSubscriptionExpired) {
          console.log(`?? [AI AGENT] Plano vencido! Cliente volta ao limite de ${FREE_TRIAL_LIMIT} mensagens de teste.`);
          console.log(`   ?? Mensagens usadas: ${agentMessagesCount}/${FREE_TRIAL_LIMIT}`);
          
          // Se j� usou as mensagens de teste, bloqueia completamente
          if (agentMessagesCount >= FREE_TRIAL_LIMIT) {
            console.log(`\n${'!'.repeat(60)}`);
            console.log(`?? [AI AGENT] BLOQUEIO: Plano vencido E limite de teste atingido`);
            console.log(`   userId: ${userId}`);
            console.log(`   contactNumber: ${contactNumber}`);
            console.log(`   Mensagens usadas: ${agentMessagesCount}/${FREE_TRIAL_LIMIT}`);
            console.log(`   ?? IA PAUSADA para este cliente - precisa renovar assinatura`);
            console.log(`   ?? Timer marcado como COMPLETED (sem retry - bloqueio permanente)`);
            console.log(`${'!'.repeat(60)}\n`);
            // ?? FIX: Marcar como completed para PARAR retry loop infinito
            // Plano vencido + limite atingido = bloqueio permanente, n�o adianta retry
            try {
              await storage.markPendingAIResponseCompleted(conversationId);
            } catch (e) { /* ignora */ }
            conversationsBeingProcessed.delete(conversationId);
            return;
          }
        }
        
        if (agentMessagesCount >= FREE_TRIAL_LIMIT) {
          console.log(`\n${'!'.repeat(60)}`);
          console.log(`?? [AI AGENT] BLOQUEIO: Limite de ${FREE_TRIAL_LIMIT} mensagens atingido`);
          console.log(`   userId: ${userId}`);
          console.log(`   contactNumber: ${contactNumber}`);
          console.log(`   Mensagens usadas: ${agentMessagesCount}/${FREE_TRIAL_LIMIT}`);
          console.log(`   ?? Usu�rio precisa assinar plano`);
          console.log(`   ?? Timer marcado como COMPLETED (sem retry - bloqueio permanente)`);
          console.log(`${'!'.repeat(60)}\n`);
          // ?? FIX: Marcar como completed para PARAR retry loop infinito
          // Limite atingido = bloqueio permanente, n�o adianta retry a cada 30s
          try {
            await storage.markPendingAIResponseCompleted(conversationId);
          } catch (e) { /* ignora */ }
          conversationsBeingProcessed.delete(conversationId);
          return;
        }
        
        console.log(`?? [AI AGENT] Uso: ${agentMessagesCount + 1}/${FREE_TRIAL_LIMIT} mensagens`);
      } else {
        console.log(`? [AI AGENT] Usu�rio tem plano pago ativo e v�lido: ${subscription?.plan?.nome || 'Plano'}`);
      }
    }
    
    // Combinar todas as mensagens acumuladas
    const combinedText = messages.join('\n\n');
    console.log(`   ?? Texto combinado: "${combinedText.substring(0, 150)}..."`);

    // ?? BUSCAR HIST?RICO DE CONVERSAS
    let conversationHistory = await storage.getMessagesByConversationId(conversationId);
    
    // ?? BUSCAR NOME DO CLIENTE DA CONVERSA
    const conversation = await storage.getConversation(conversationId);
    const contactName = conversation?.contactName || undefined;
    console.log(`?? [AI AGENT] Nome do cliente: ${contactName || 'N?o identificado'}`);
    
    // ?? BUSCAR M?DIAS J? ENVIADAS NESTA CONVERSA (para evitar repeti??o)
    const sentMedias: string[] = [];
    for (const msg of conversationHistory) {
      if (msg.fromMe && msg.isFromAgent) {
        // M?todo 1: Detectar tags de m?dia no texto das mensagens
        if (msg.text) {
          const mediaMatches = msg.text.match(/\[MEDIA:([A-Z0-9_]+)\]/gi);
          if (mediaMatches) {
            for (const match of mediaMatches) {
              const mediaName = match.replace(/\[MEDIA:|]/gi, '').toUpperCase();
              if (!sentMedias.includes(mediaName)) {
                sentMedias.push(mediaName);
              }
            }
          }
        }
        
        // M?todo 2: Detectar tags no campo mediaCaption (novo formato)
        if (msg.mediaCaption) {
          const captionMatches = msg.mediaCaption.match(/\[MEDIA:([A-Z0-9_]+)\]/gi);
          if (captionMatches) {
            for (const match of captionMatches) {
              const mediaName = match.replace(/\[MEDIA:|]/gi, '').toUpperCase();
              if (!sentMedias.includes(mediaName)) {
                sentMedias.push(mediaName);
              }
            }
          }
        }
      }
    }
    console.log(`?? [AI AGENT] M?dias j? enviadas: ${sentMedias.length > 0 ? sentMedias.join(', ') : 'nenhuma'}`);
    
    // Verificar se modo hist?rico est? ativo
    const agentConfig = await storage.getAgentConfig(userId);
    
    if (agentConfig?.fetchHistoryOnFirstResponse) {
      console.log(`?? [AI AGENT] Modo hist?rico ATIVO - ${conversationHistory.length} mensagens dispon?veis para contexto`);
      
      if (conversationHistory.length > 40) {
        console.log(`?? [AI AGENT] Hist?rico grande - ser? usado sistema de resumo inteligente`);
      }
    }

    const aiResult = await generateAIResponse(
      userId,
      conversationHistory,
      combinedText, // ? Todas as mensagens combinadas
      {
        contactName, // ? Nome do cliente para personaliza??o
        contactPhone: contactNumber, // ? Telefone do cliente para agendamento
        sentMedias,  // ? M?dias j? enviadas para evitar repeti??o
        conversationId, // ?? ID da conversa para vincular pedidos de delivery
        isCTWAFallback: pending.isCTWAFallback, // ?? Flag CTWA: IA deve tratar como sauda��o de interesse via Meta Ads
      }
    );

    // ?? Extrair texto e a??es de m?dia da resposta
    const aiResponse = aiResult?.text || null;
    const mediaActions = aiResult?.mediaActions || [];

    // ?? NOTIFICATION SYSTEM UNIVERSAL (AI + Manual + Resposta do Agente)
    const businessConfig = await storage.getBusinessAgentConfig(userId);
    
    // ?? DEBUG: Log detalhado do businessConfig para diagn�stico
    console.log(`?? [NOTIFICATION DEBUG] userId: ${userId}`);
    console.log(`?? [NOTIFICATION DEBUG] businessConfig exists: ${!!businessConfig}`);
    if (businessConfig) {
      console.log(`?? [NOTIFICATION DEBUG] notificationEnabled: ${businessConfig.notificationEnabled}`);
      console.log(`?? [NOTIFICATION DEBUG] notificationMode: ${businessConfig.notificationMode}`);
      console.log(`?? [NOTIFICATION DEBUG] notificationManualKeywords: ${businessConfig.notificationManualKeywords}`);
      console.log(`?? [NOTIFICATION DEBUG] notificationPhoneNumber: ${businessConfig.notificationPhoneNumber}`);
    }
    console.log(`?? [NOTIFICATION DEBUG] clientMessage (combinedText): "${combinedText?.substring(0, 100)}"`);
    console.log(`?? [NOTIFICATION DEBUG] aiResponse: "${aiResponse?.substring(0, 100) || 'null'}"`);
    
    let shouldNotify = false;
    let notifyReason = "";
    let keywordSource = ""; // Para tracking de onde veio o gatilho
    
    // Check AI notification (tag [NOTIFY:] na resposta)
    if (aiResult?.notification?.shouldNotify) {
      shouldNotify = true;
      notifyReason = aiResult.notification.reason;
      keywordSource = "IA";
      console.log(`?? [AI Agent] AI detected notification trigger: ${notifyReason}`);
    }
    
    // Check Manual keyword notification (if mode is "manual" or "both")
    // ?? DEBUG: Log da condi��o de verifica��o
    const conditionCheck = {
      notificationEnabled: !!businessConfig?.notificationEnabled,
      notificationManualKeywords: !!businessConfig?.notificationManualKeywords,
      notificationMode: businessConfig?.notificationMode,
      modeMatches: businessConfig?.notificationMode === "manual" || businessConfig?.notificationMode === "both"
    };
    console.log(`?? [NOTIFICATION DEBUG] Keyword check condition: ${JSON.stringify(conditionCheck)}`);
    
    if (businessConfig?.notificationEnabled && 
        businessConfig?.notificationManualKeywords &&
        (businessConfig.notificationMode === "manual" || businessConfig.notificationMode === "both")) {
      
      console.log(`?? [NOTIFICATION DEBUG] ? Entering keyword check block!`);
      
      const keywords = businessConfig.notificationManualKeywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);
      
      console.log(`?? [NOTIFICATION DEBUG] Keywords to check: ${JSON.stringify(keywords)}`);
      
      // ?? VERIFICAR TANTO NA MENSAGEM DO CLIENTE QUANTO NA RESPOSTA DO AGENTE
      const clientMessage = combinedText.toLowerCase();
      const agentMessage = (aiResponse || "").toLowerCase();
      
      console.log(`?? [NOTIFICATION DEBUG] clientMessage: "${clientMessage.substring(0, 100)}"`);
      console.log(`?? [NOTIFICATION DEBUG] agentMessage: "${agentMessage.substring(0, 100)}"`);
      
      for (const keyword of keywords) {
        console.log(`?? [NOTIFICATION DEBUG] Checking keyword: "${keyword}"`);
        console.log(`?? [NOTIFICATION DEBUG] Client includes "${keyword}": ${clientMessage.includes(keyword)}`);
        console.log(`?? [NOTIFICATION DEBUG] Agent includes "${keyword}": ${agentMessage.includes(keyword)}`);
        
        // Verificar na mensagem do cliente
        if (clientMessage.includes(keyword)) {
          shouldNotify = true;
          const source = "cliente";
          notifyReason = notifyReason 
            ? `${notifyReason} + Palavra-chave (${source}): "${keyword}"` 
            : `Palavra-chave detectada (${source}): "${keyword}"`;
          keywordSource = keywordSource ? `${keywordSource} + Manual (cliente)` : "Manual (cliente)";
          console.log(`?? [AI Agent] Manual keyword in CLIENT message: "${keyword}"`);
          break;
        }
        
        // ?? Verificar na resposta do agente (NOVO!)
        if (agentMessage.includes(keyword)) {
          shouldNotify = true;
          const source = "agente";
          notifyReason = notifyReason 
            ? `${notifyReason} + Palavra-chave (${source}): "${keyword}"` 
            : `Palavra-chave detectada (${source}): "${keyword}"`;
          keywordSource = keywordSource ? `${keywordSource} + Manual (agente)` : "Manual (agente)";
          console.log(`?? [AI Agent] Manual keyword in AGENT response: "${keyword}"`);
          break;
        }
      }
    } else {
      console.log(`?? [NOTIFICATION DEBUG] ? Skipping keyword check - conditions not met`);
    }
    
    // Log completo da detec��o
    if (shouldNotify) {
      console.log(`?? [AI Agent] NOTIFICATION TRIGGERED via: ${keywordSource}`);
    }
    
    // Send notification if triggered
    if (shouldNotify && businessConfig?.notificationPhoneNumber) {
      const notifyNumber = businessConfig.notificationPhoneNumber.replace(/\D/g, '');
      const notifyJid = `${notifyNumber}@s.whatsapp.net`;
      
      // ?? Mensagem de notifica��o melhorada com contexto
      const notifyMessage = `?? *NOTIFICA��O DO AGENTE*\n\n` +
        `?? *Motivo:* ${notifyReason}\n` +
        `?? *Fonte:* ${keywordSource}\n\n` +
        `?? *Cliente:* ${contactNumber}\n` +
        `?? *Mensagem do cliente:* "${combinedText.substring(0, 200)}${combinedText.length > 200 ? '...' : ''}"\n` +
        (aiResponse ? `?? *Resposta do agente:* "${aiResponse.substring(0, 200)}${aiResponse.length > 200 ? '...' : ''}"` : '');
      
      try {
        // ??? ANTI-BLOQUEIO: Usar fila do usu?rio para notifica??o
        await sendWithQueue(userId, 'notifica??o NOTIFY', async () => {
          await currentSession.socket.sendMessage(notifyJid, { text: notifyMessage });
        });
        console.log(`?? [AI Agent] Notification sent to ${notifyNumber}`);
      } catch (error) {
        console.error(`? [AI Agent] Failed to send notification to ${notifyNumber}:`, error);
      }
    }

    console.log(`?? [AI Agent] generateAIResponse retornou: ${aiResponse ? `"${aiResponse.substring(0, 100)}..."` : 'NULL'}`);
    if (mediaActions.length > 0) {
      console.log(`?? [AI Agent] ${mediaActions.length} a??es de m?dia: ${mediaActions.map(a => a.media_name).join(', ')}`);
    }

    if (aiResponse) {
      // Buscar remoteJid original do banco
      const conversationData = await storage.getConversation(conversationId);
      const jid = conversationData
        ? buildSendJid(conversationData)
        : `${contactNumber}@${jidSuffix || DEFAULT_JID_SUFFIX}`;
      
      // ?? ANTI-DUPLICA??O: Verificar se resposta j? foi enviada recentemente
      // NOTE: N?o chamar canSendMessage aqui antes do envio. A fila (messageQueueService) j? faz o dedupe
      // e o pre-check registrava a mensagem como enviada, fazendo o envio real ser BLOQUEADO.

      if (isRecentDuplicate(conversationId, aiResponse)) {
        console.log(`?? [AI AGENT] ?? Resposta ID?NTICA j? enviada nos ?ltimos 2 minutos, IGNORANDO duplicata`);
        console.log(`   ?? Texto: "${aiResponse.substring(0, 100)}..."`);
        responseSuccessful = true;
        return;
      }
      
      // ?? Registrar resposta no cache anti-duplica??o
      registerSentMessageCache(conversationId, aiResponse);
      
      // ?? HUMANIZA??O: Quebrar mensagens longas em m?ltiplas
      const agentConfig = await storage.getAgentConfig(userId);
      const maxChars = agentConfig?.messageSplitChars ?? 400;
      const messageParts = splitMessageHumanLike(aiResponse, maxChars);
      
      console.log(`[AI Agent] Sending to original JID: ${jid} (${messageParts.length} parts)`);
      
      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        const isLast = i === messageParts.length - 1;
        let savedAgentMsg: any = null;
        
        // ??? ANTI-BLOQUEIO: Usar fila de mensagens para garantir delay entre envios
        // Cada WhatsApp tem sua pr?pria fila - m?ltiplos usu?rios podem enviar ao mesmo tempo
        // ? Texto enviado EXATAMENTE como gerado pela IA (varia??o REMOVIDA do sistema)
        const queueResult = await messageQueueService.enqueue(userId, jid, part, {
          isFromAgent: true,
          conversationId,
          connectionId: effectiveConnectionId,
          priority: 'high', // Respostas da IA = prioridade alta
        });

        // Se a fila bloqueou por dedupe, n?o salvar de novo no banco nem tratar como erro.
        if (queueResult.messageId !== 'DEDUPLICATED_BLOCKED') {
          const messageId = queueResult.messageId || `${Date.now()}-${i}`;

          try {
            savedAgentMsg = await storage.createMessage({
              conversationId: conversationId,
              messageId,
              fromMe: true,
              text: part, // ? Texto original sem varia??o
              timestamp: new Date(),
              status: "sent",
              isFromAgent: true,
            });
          } catch (dbSendErr) {
            // A mensagem j? pode ter sido enviada no WhatsApp; n?o fazer retry agressivo por falha de DB.
            console.warn(`?? [AI AGENT] Falha ao salvar mensagem enviada no banco (n?o cr?tico):`, dbSendErr);
          }
        } else {
          console.log(`??? [AI AGENT] Parte bloqueada por dedupe (j? enviada antes). Pulando persist?ncia no DB.`);
        }
        // S� atualizar conversa na �ltima parte
        if (isLast) {
          try {
            await storage.updateConversation(conversationId, {
              lastMessageText: part,
              lastMessageTime: new Date(),
              // ?? FIX: Marcar que a conversa foi respondida (IA tamb?m conta!)
              hasReplied: true,
              lastMessageFromMe: true,
            });
          } catch (dbConvErr) {
            console.warn(`?? [AI AGENT] Falha ao atualizar conversa no banco (n?o cr?tico):`, dbConvErr);
          }
          broadcastToUser(userId, {
            type: "agent_response",
            conversationId: conversationId,
            message: aiResponse,
            // ? REAL-TIME: Enviar mensagem completa para append inline
            messageData: savedAgentMsg ? {
              id: savedAgentMsg.id,
              conversationId: conversationId,
              messageId: savedAgentMsg.messageId,
              fromMe: true,
              text: part,
              timestamp: new Date().toISOString(),
              isFromAgent: true,
              mediaType: null,
              mediaUrl: null,
            } : undefined,
            conversationUpdate: {
              id: conversationId,
              lastMessageText: part,
              lastMessageTime: new Date().toISOString(),
              lastMessageFromMe: true,
            },
          });
        }

        console.log(`[AI Agent] Part ${i+1}/${messageParts.length} SENT to WhatsApp ${contactNumber}`);
      }
      
      // ? MARCAR COMO SUCESSO assim que o texto foi enviado (evita retry/spam se tarefas n?o-cr?ticas falharem)
      responseSuccessful = true;
      console.log(`? [AI AGENT] Texto enviado com sucesso (marcando timer como completed ao final)`);

      // ?? TTS: Gerar e enviar �udio da resposta (se configurado)
      try {
        const audioSent = await processAudioResponseForAgent(
          userId,
          jid,
          aiResponse,
          currentSession.socket
        );
        if (audioSent) {
          console.log(`?? [AI Agent] �udio TTS enviado junto com a resposta`);
        }
      } catch (audioError) {
        console.error(`?? [AI Agent] Erro ao processar �udio TTS (n�o cr�tico):`, audioError);
        // Continuar mesmo se falhar - o texto j� foi enviado
      }
      
      // ?? EXECUTAR A��ES DE M�DIA (enviar �udios, imagens, v�deos)
      if (mediaActions.length > 0) {
        console.log(`?? [AI Agent] Executando ${mediaActions.length} a��es de m�dia...`);
        
        const conversationDataForMedia = await storage.getConversation(conversationId);
        const mediaJid = conversationDataForMedia
          ? buildSendJid(conversationDataForMedia)
          : jid;
        
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
        
        try {
        await executeMediaActions({
          userId,
          jid: mediaJid,
          conversationId, // Passar conversationId para salvar mensagens de m?dia
          actions: mediaActions,
          socket: currentSession.socket,
        });
        } catch (mediaErr) {
          console.error(`?? [AI Agent] Erro ao executar a??es de m?dia (n?o cr?tico):`, mediaErr);
        }
        
        console.log(`?? [AI Agent] M?dias enviadas com sucesso!`);
      }

      // ?? FOLLOW-UP: Se agente enviou mensagem, agendar follow-up inicial
      try {
        await followUpService.scheduleInitialFollowUp(conversationId);
      } catch (error) {
        console.error("Erro ao agendar follow-up:", error);
      }
      
      // ? MARCAR COMO SUCESSO - A resposta foi enviada
      responseSuccessful = true;
      console.log(`? [AI AGENT] Resposta enviada com sucesso para ${contactNumber}`);
    } else {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`?? [AI Agent] RESPOSTA NULL - Nenhuma resposta gerada!`);
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   contactNumber: ${contactNumber}`);
      console.log(`   Poss�veis causas (verifique logs acima para "RETURN NULL"):`);
      console.log(`   1. Usu�rio SUSPENSO`);
      console.log(`   2. Mensagem de BOT detectada`);
      console.log(`   3. agentConfig n�o encontrado ou isActive=false`);
      console.log(`   4. Trigger phrases configuradas mas nenhuma encontrada`);
      console.log(`   5. Erro na API de LLM (timeout, rate limit)`);
      console.log(`${'='.repeat(60)}\n`);
      
      // ? N�O marcar responseSuccessful - timer ser� mantido como pending para retry
    }
  } catch (error: any) {
    console.error("? [AI AGENT] RETURN NULL #6: Exce��o capturada no catch externo:", error);
    // ? FIX: Detectar erro de Connection Closed para retry r�pido
    const errorMsg = error?.message || String(error);
    (pending as any)._lastErrorMsg = errorMsg.substring(0, 500);
    if (errorMsg.includes('Connection Closed') || errorMsg.includes('connection closed')) {
      (pending as any)._connectionClosedError = true;
    }
  } finally {
    // ?? ANTI-DUPLICA��O: Remover da lista de conversas em processamento
    conversationsBeingProcessed.delete(conversationId);
    
    // ?? PERSISTENT TIMER: Marcar como completed APENAS se resposta foi enviada com sucesso
    if (responseSuccessful) {
      try {
        await storage.markPendingAIResponseCompleted(conversationId);
        pendingRetryCounter.delete(conversationId); // ?? Limpar contador de retries
        console.log(`? [AI AGENT] Timer marcado como completed - resposta enviada com sucesso!`);
      } catch (dbError) {
        console.error(`?? [AI AGENT] Erro ao marcar timer como completed (n�o cr�tico):`, dbError);
      }
    } else {
      // ? FIX: Se foi erro de Connection Closed, usar retry r�pido com backoff
      const isConnectionClosed = (pending as any)._connectionClosedError === true;
      const errorMsg = (pending as any)._lastErrorMsg || 'unknown';
      
      // ?? FIX 2026-02-25: RETRY COUNTER with exponential backoff
      const currentRetries = (pendingRetryCounter.get(conversationId) || 0) + 1;
      pendingRetryCounter.set(conversationId, currentRetries);
      
      if (currentRetries > MAX_SEND_RETRIES) {
        // ?? MAX RETRIES EXCEEDED - mark as failed with full details
        try {
          const reason = isConnectionClosed 
            ? `connection_closed_max_retries_${currentRetries}` 
            : `send_failed_max_retries_${currentRetries}`;
          await storage.markPendingAIResponseFailed(conversationId, reason, errorMsg);
          pendingRetryCounter.delete(conversationId);
          waObservability.pendingAI_maxRetriesExhausted++;
          console.error(`?? [AI AGENT] Timer ABANDONADO ap�s ${currentRetries} tentativas (${reason}) - conversationId: ${conversationId}`);
        } catch (dbError) {
          console.error(`?? [AI AGENT] Erro ao marcar timer como failed:`, dbError);
        }
      } else if (isConnectionClosed) {
        try {
          const reconnectConnection = resolvedConnectionIdForRetry
            ? await storage.getConnectionById(resolvedConnectionIdForRetry)
            : undefined;

          const reconnectScope = reconnectConnection?.id || resolvedConnectionIdForRetry || userId;
          const lastReconnectAt = sessionRecoveryAttemptAt.get(reconnectScope) || 0;
          const reconnectAgeMs = Date.now() - lastReconnectAt;
          if (reconnectConnection?.id && reconnectAgeMs >= SESSION_RECOVERY_ATTEMPT_COOLDOWN_MS) {
            sessionRecoveryAttemptAt.set(reconnectScope, Date.now());
            console.log(`?? [AI AGENT] Connection Closed detectado no envio. Disparando reconnect (conn=${reconnectConnection.id.substring(0, 8)}, user=${userId.substring(0, 8)})`);
            void connectWhatsApp(userId, reconnectConnection.id).catch((reconnectErr) => {
              console.error(`?? [AI AGENT] Falha ao reconnect ap�s Connection Closed:`, reconnectErr);
            });
          }

          // Retry com exponential backoff: 5s, 10s, 20s, 30s, 30s...
          const backoffSec = Math.min(5 * Math.pow(2, currentRetries - 1), 30);
          await db.execute(sql`
            UPDATE pending_ai_responses
            SET status = 'pending',
                scheduled_at = NOW(),
                execute_at = NOW() + (${backoffSec} || ' seconds')::interval,
                retry_count = COALESCE(retry_count, 0) + 1,
                last_attempt_at = NOW(),
                last_error = ${'Connection Closed retry ' + currentRetries},
                updated_at = NOW()
            WHERE conversation_id = ${conversationId}
          `);
          waObservability.pendingAI_connectionClosedRetries++;
          console.warn(`? [AI AGENT] Timer reagendado retry ${currentRetries}/${MAX_SEND_RETRIES} em ${backoffSec}s - Connection Closed (conversationId: ${conversationId})`);
        } catch (dbError) {
          console.error(`?? [AI AGENT] Erro ao reagendar timer para retry r�pido:`, dbError);
        }
      } else {
        // Retry com backoff: 30s, 60s, 120s... (cap at 5 min)
        const backoffSec = Math.min(30 * Math.pow(2, currentRetries - 1), 300);
        try {
          await storage.resetPendingAIResponseForRetry(conversationId, backoffSec);
          console.warn(`?? [AI AGENT] Timer reagendado retry ${currentRetries}/${MAX_SEND_RETRIES} em ${backoffSec}s - resposta falhou (conversationId: ${conversationId})`);
        } catch (dbError) {
          console.error(`?? [AI AGENT] Erro ao reagendar timer para retry:`, dbError);
        }
      }
    }
    
    console.log(`?? [AI AGENT] Conversa ${conversationId} liberada para pr�ximo processamento`);
  }
}

// ---------------------------------------------------------------------------
// ?? TRIGGER RESPONSE ON AI RE-ENABLE
// ---------------------------------------------------------------------------
// Quando o usu?rio reativa a IA para uma conversa, verificamos se h? mensagens
// pendentes do cliente que ainda n?o foram respondidas e disparamos a resposta.
// 
// Par?metro forceRespond: Quando true (chamado pelo bot?o "Responder com IA"),
// ignora a verifica??o de "?ltima mensagem ? do dono" e responde mesmo assim.
// ---------------------------------------------------------------------------
export async function triggerAgentResponseForConversation(
  userId: string,
  conversationId: string,
  forceRespond: boolean = false
): Promise<{ triggered: boolean; reason: string }> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[TRIGGER] FUN��O INICIADA - ${new Date().toISOString()}`);
  console.log(`[TRIGGER] userId: ${userId}`);
  console.log(`[TRIGGER] conversationId: ${conversationId}`);
  console.log(`[TRIGGER] forceRespond: ${forceRespond}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // 1. Buscar a sess�o do usu�rio (preferir via conversation's connectionId)
    console.log(`[TRIGGER] Verificando sess�o no Map sessions...`);
    console.log(`[TRIGGER] Total de sess�es no Map: ${sessions.size}`);
    
    // Debug: listar todas as chaves do Map
    const sessionKeys = Array.from(sessions.keys());
    console.log(`[TRIGGER] Chaves no Map sessions: [${sessionKeys.join(', ')}]`);
    
    // Try to get connection via conversation first for multi-connection
    const triggerConversation = await storage.getConversation(conversationId);
    if (!triggerConversation) {
      console.log(`[TRIGGER] FALHA: Conversa n�o encontrada para resolver conex�o`);
      return { triggered: false, reason: "Conversa n�o encontrada." };
    }
    const session = sessions.get(triggerConversation.connectionId);
    console.log(`[TRIGGER] Sess�o encontrada: ${session ? 'SIM' : 'N�O'} (connectionId: ${triggerConversation?.connectionId || 'N/A'})`);
    
    // Check per-connection aiEnabled flag
    if (triggerConversation) {
      const connRecord = await storage.getConnectionById(triggerConversation.connectionId);
      if (connRecord && connRecord.aiEnabled === false) {
        console.log(`[TRIGGER] FALHA: IA desativada para esta conex�o (${triggerConversation.connectionId})`);
        return { triggered: false, reason: "IA desativada para este n�mero. Ative na tela de Conex�es." };
      }
    }
    
    if (!session?.socket) {
      // Verificar se estamos em modo dev sem WhatsApp
      const skipRestore = process.env.SKIP_WHATSAPP_RESTORE === 'true';
      console.log(`[TRIGGER] FALHA: Sess�o WhatsApp n�o dispon�vel (socket: ${session?.socket ? 'existe' : 'undefined'})`);
      console.log(`[TRIGGER] SKIP_WHATSAPP_RESTORE: ${skipRestore}`);
      
      if (skipRestore) {
        return { triggered: false, reason: "Modo desenvolvimento: WhatsApp n�o conectado localmente. Em produ��o, a sess�o ser� restaurada automaticamente." };
      }
      return { triggered: false, reason: "WhatsApp n�o conectado. Verifique a conex�o em 'Conex�o'." };
    }
    console.log(`[TRIGGER] Sess�o WhatsApp OK - socket existe`);
    
    // 2. Verificar se o agente est� ativo globalmente
    console.log(`[TRIGGER] Verificando agentConfig...`);
    const agentConfig = await storage.getAgentConfig(userId);
    console.log(`[TRIGGER] agentConfig encontrado: ${agentConfig ? 'SIM' : 'N�O'}`);
    console.log(`[TRIGGER] agentConfig.isActive: ${agentConfig?.isActive}`);
    
    if (!agentConfig?.isActive) {
      console.log(`[TRIGGER] FALHA: Agente globalmente inativo`);
      return { triggered: false, reason: "Ative o agente em 'Meu Agente IA' primeiro." };
    }
    console.log(`[TRIGGER] Agente est� ATIVO`);
    
    // 2.5 ?? FIX: Verificar tamb�m businessAgentConfig (toggle "IA ON" em /agent-config)
    console.log(`[TRIGGER] Verificando businessAgentConfig...`);
    const businessAgentConfig = await storage.getBusinessAgentConfig(userId);
    console.log(`[TRIGGER] businessAgentConfig encontrado: ${businessAgentConfig ? 'SIM' : 'N�O'}`);
    console.log(`[TRIGGER] businessAgentConfig.isActive: ${businessAgentConfig?.isActive}`);
    
    if (!businessAgentConfig?.isActive) {
      console.log(`[TRIGGER] FALHA: IA desativada globalmente em businessAgentConfig`);
      return { triggered: false, reason: "A IA est� desativada globalmente. Ative em 'Configura��es' primeiro." };
    }
    console.log(`[TRIGGER] businessAgentConfig ATIVO`);
    
    // 3. Buscar dados da conversa
    console.log(`[TRIGGER] Buscando conversa...`);
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      console.log(`[TRIGGER] FALHA: Conversa n�o encontrada`);
      return { triggered: false, reason: "Conversa n�o encontrada." };
    }
    console.log(`[TRIGGER] Conversa encontrada: ${conversation.contactName || conversation.contactNumber}`);
    
    // 4. Buscar mensagens da conversa
    const messages = await storage.getMessagesByConversationId(conversationId);
    if (messages.length === 0) {
      console.log(`?? [TRIGGER] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa para responder." };
    }
    
    // 5. Verificar ?ltima mensagem
    const lastMessage = messages[messages.length - 1];
    
    // Se ?ltima mensagem ? do agente/dono, s? responder se forceRespond=true
    if (lastMessage.fromMe && !forceRespond) {
      console.log(`?? [TRIGGER] ?ltima mensagem ? do agente/dono - n?o precisa responder`);
      return { triggered: false, reason: "?ltima mensagem j? foi respondida." };
    }
    
    // Se forceRespond mas ?ltima ? do agente, precisamos de contexto anterior
    let messagesToProcess: string[] = [];
    
    if (lastMessage.fromMe && forceRespond) {
      // For?ar resposta: usar ?ltimas mensagens do cliente como contexto
      console.log(`?? [TRIGGER] For?ando resposta - buscando contexto anterior...`);
      
      // Buscar ?ltimas mensagens do cliente (n?o do agente)
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (!msg.fromMe && msg.text) {
          messagesToProcess.unshift(msg.text);
          if (messagesToProcess.length >= 3) break; // ?ltimas 3 mensagens do cliente
        }
      }
      
      if (messagesToProcess.length === 0) {
        return { triggered: false, reason: "N?o h? mensagens do cliente para processar." };
      }
    } else {
      // Comportamento normal: coletar mensagens n?o respondidas do cliente
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.fromMe) break; // Parar quando encontrar mensagem do agente/dono
        if (msg.text) {
          messagesToProcess.unshift(msg.text);
        }
      }
      
      if (messagesToProcess.length === 0) {
        messagesToProcess.push('[mensagem recebida]');
      }
    }
    
    // 6. Verificar se j� tem resposta pendente
    if (pendingResponses.has(conversationId)) {
      console.log(`?? [TRIGGER] J� existe resposta pendente para esta conversa`);
      return { triggered: false, reason: "Resposta j� em processamento. Aguarde." };
    }
    
    console.log(`?? [TRIGGER] ${messagesToProcess.length} mensagem(s) para processar`);
    console.log(`   ?? Cliente: ${conversation.contactNumber}`);
    
    // +-------------------------------------------------------------------------+
    // � ?? FIX: Tentar CHATBOT primeiro antes de usar IA                       �
    // � Quando auto-reativa��o ocorre, precisamos respeitar a prioridade:      �
    // � 1� CHATBOT/FLOW (se ativo)                                             �
    // � 2� IA AGENT (se chatbot n�o processou)                                 �
    // � Data: 2025-01-XX - Sincroniza��o Flow Builder + IA Agent               �
    // +-------------------------------------------------------------------------+
    try {
      const { tryProcessChatbotMessage, isNewContact } = await import("./chatbotIntegration");
      const isFirstContact = await isNewContact(conversationId);
      const combinedText = messagesToProcess.join('\n\n');
      
      console.log(`?? [TRIGGER] Tentando processar via CHATBOT primeiro...`);
      const chatbotResult = await tryProcessChatbotMessage(
        userId,
        conversationId,
        conversation.contactNumber,
        combinedText,
        isFirstContact
      );
      
      if (chatbotResult.handled) {
        console.log(`? [TRIGGER] Mensagem processada pelo CHATBOT de fluxo!`);
        if (chatbotResult.transferToHuman) {
          console.log(`?? [TRIGGER] Conversa transferida para humano - IA/Chatbot desativados`);
        }
        return { triggered: true, reason: "Resposta processada pelo chatbot de fluxo!" };
      }
      
      console.log(`?? [TRIGGER] Chatbot n�o processou (inativo ou sem match), delegando para IA...`);
    } catch (chatbotError) {
      console.error(`?? [TRIGGER] Erro ao tentar chatbot (continuando com IA):`, chatbotError);
    }
    
    // 7. Criar resposta pendente com delay m�nimo (1s quando for�ado, sen�o 3s)
    const responseDelaySeconds = forceRespond ? 1 : Math.max(agentConfig?.responseDelaySeconds ?? 3, 3);
    
    const pending: PendingResponse = {
      timeout: null as any,
      messages: messagesToProcess,
      conversationId,
      userId,
      connectionId: conversation.connectionId,
      contactNumber: conversation.contactNumber,
      jidSuffix: conversation.jidSuffix || DEFAULT_JID_SUFFIX,
      startTime: Date.now(),
    };
    
    pending.timeout = setTimeout(async () => {
      console.log(`?? [TRIGGER] Processando resposta para ${conversation.contactNumber}`);
      await processAccumulatedMessages(pending);
    }, responseDelaySeconds * 1000);
    
    pendingResponses.set(conversationId, pending);
    
    console.log(`? [TRIGGER] Resposta agendada em ${responseDelaySeconds}s`);
    
    return { triggered: true, reason: `Resposta da IA agendada! Processando ${messagesToProcess.length} mensagem(s)...` };
    
  } catch (error) {
    console.error(`? [TRIGGER] Erro:`, error);
    return { triggered: false, reason: "Erro ao processar. Tente novamente." };
  }
}

// ---------------------------------------------------------------------------
// ?? TRIGGER RESPONSE ON ADMIN AI RE-ENABLE
// ---------------------------------------------------------------------------
// Para conversas do ADMIN (sistema de vendas AgenteZap) - quando a IA ? 
// reativada, verifica se h? mensagens do cliente sem resposta e dispara.
// ---------------------------------------------------------------------------
export async function triggerAdminAgentResponseForConversation(
  conversationId: string
): Promise<{ triggered: boolean; reason: string }> {
  console.log(`\n?? [ADMIN TRIGGER ON ENABLE] Verificando mensagens pendentes para conversa admin ${conversationId}...`);
  
  try {
    // 1. Buscar dados da conversa admin
    const conversation = await storage.getAdminConversation(conversationId);
    if (!conversation) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Conversa ${conversationId} n?o encontrada`);
      return { triggered: false, reason: "Conversa n?o encontrada" };
    }
    
    // 2. Verificar se h? sess?o admin ativa
    const adminSession = adminSessions.values().next().value;
    if (!adminSession?.socket) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Sess?o admin WhatsApp n?o dispon?vel`);
      return { triggered: false, reason: "WhatsApp admin n?o conectado" };
    }
    
    // 3. Buscar mensagens da conversa admin
    const messages = await storage.getAdminMessages(conversationId);
    if (messages.length === 0) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa" };
    }
    
    // 4. Verificar ?ltima mensagem
    const lastMessage = messages[messages.length - 1];
    
    // Se ?ltima mensagem ? do admin/agente (fromMe = true), n?o precisa responder
    if (lastMessage.fromMe) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] ?ltima mensagem ? do agente - n?o precisa responder`);
      return { triggered: false, reason: "?ltima mensagem j? foi respondida" };
    }
    
    // 5. Verificar se j? tem resposta pendente
    const contactNumber = conversation.contactNumber;
    if (pendingAdminResponses.has(contactNumber)) {
      console.log(`? [ADMIN TRIGGER ON ENABLE] J? existe resposta pendente para este contato`);
      return { triggered: false, reason: "Resposta j? em processamento" };
    }
    
    console.log(`?? [ADMIN TRIGGER ON ENABLE] Mensagem do cliente sem resposta encontrada!`);
    console.log(`   ?? Cliente: ${contactNumber}`);
    console.log(`   ?? ?ltima mensagem: "${(lastMessage.text || '[m?dia]').substring(0, 50)}..."`);
    console.log(`   ?? Enviada em: ${lastMessage.timestamp}`);
    
    // 6. Coletar todas as mensagens do cliente desde a ?ltima do agente
    const clientMessagesBuffer: string[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.fromMe) break;
      if (msg.text) {
        clientMessagesBuffer.unshift(msg.text);
      }
    }
    
    if (clientMessagesBuffer.length === 0) {
      clientMessagesBuffer.push('[mensagem recebida]');
    }
    
    console.log(`?? [ADMIN TRIGGER ON ENABLE] ${clientMessagesBuffer.length} mensagem(s) do cliente para processar`);
    
    // 7. Agendar resposta usando o sistema de acumula??o existente
    const config = await getAdminAgentRuntimeConfig();
    const responseDelayMs = Math.max(config.responseDelayMs, 3000); // M?nimo 3 segundos
    
    const pending: PendingAdminResponse = {
      timeout: null,
      messages: clientMessagesBuffer,
      remoteJid: conversation.remoteJid || `${contactNumber}@s.whatsapp.net`,
      contactNumber,
      generation: 1,
      startTime: Date.now(),
      conversationId,
    };
    
    pending.timeout = setTimeout(() => {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Processando resposta para ${contactNumber}`);
      void processAdminAccumulatedMessages({ socket: adminSession.socket!, key: contactNumber, generation: 1 });
    }, responseDelayMs);
    
    pendingAdminResponses.set(contactNumber, pending);
    
    console.log(`? [ADMIN TRIGGER ON ENABLE] Resposta agendada em ${responseDelayMs/1000}s para ${contactNumber}`);
    
    return { triggered: true, reason: `Resposta agendada para ${clientMessagesBuffer.length} mensagem(s) pendente(s)` };
    
  } catch (error) {
    console.error(`? [ADMIN TRIGGER ON ENABLE] Erro:`, error);
    return { triggered: false, reason: "Erro ao processar" };
  }
}

export async function sendMessage(
  userId: string, 
  conversationId: string, 
  text: string,
  options?: {
    isFromAgent?: boolean;
    source?: "owner" | "agent" | "followup" | "system";
    validateDestination?: boolean;
    acceptQueued?: boolean;
    bypassDeduplication?: boolean;
    clientMessageId?: string | null;
    existingMessageDbId?: string | null;
  }
): Promise<{ success: boolean; messageId?: string; reason?: string; blocked?: boolean }> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Verify ownership - conversation must belong to a connection of this user
  const connection = await storage.getConnectionById(conversation.connectionId);
  if (!connection || connection.userId !== userId) {
    throw new Error("Unauthorized access to conversation");
  }

  const messageSource = options?.source ?? (options?.isFromAgent ? "agent" : "owner");
  const gatewayBaseUrl = String(process.env.WA_GATEWAY_URL || "").trim().replace(/\/+$/, "");

  // Multi-connection strict mode: conversation must send only through its own connection
  const session = sessions.get(conversation.connectionId);
  if (!session?.socket) {
    if (gatewayBaseUrl) {
      const token = String(process.env.WA_GATEWAY_INTERNAL_TOKEN || "agentezap-internal-wa-gateway").trim();
      const connectionPhone = cleanContactNumber(connection.phoneNumber || "");

      if (connectionPhone && !cleanContactNumber((conversation as any).ownerPhoneNumber || "")) {
        await db.update(conversations)
          .set({
            ownerPhoneNumber: connectionPhone,
            ownerPhoneVerifiedAt: new Date(),
            ownerPhoneSource: "outbound_send",
            updatedAt: new Date(),
          } as any)
          .where(eq(conversations.id, conversationId));
      }

      const response = await fetch(`${gatewayBaseUrl}/api/integration/instances/${conversation.connectionId}/messages/send`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wa-gateway-token": token,
        },
        body: JSON.stringify({
          conversationId,
          text,
          to: conversation.contactNumber,
          contactName: conversation.contactName,
          validateDestination: options?.validateDestination === true,
          acceptQueued: options?.acceptQueued === true,
          isFromAgent: options?.isFromAgent === true,
          source: messageSource,
          bypassDeduplication: options?.bypassDeduplication === true,
          clientMessageId: options?.clientMessageId || undefined,
          existingMessageDbId: options?.existingMessageDbId || undefined,
        }),
      });
      const bodyText = await response.text();
      let payload: any = null;
      try {
        payload = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        payload = { reason: bodyText };
      }

      if (!response.ok || payload?.success === false) {
        return {
          success: false,
          reason: payload?.reason || payload?.message || `Gateway send failed (${response.status})`,
          blocked: payload?.blocked === true,
        };
      }

      if (messageSource !== "followup") {
        try {
          await userFollowUpService.resetFollowUpCycle(conversationId, "Empresa respondeu");
        } catch (error) {
          console.error("Erro ao reiniciar follow-up do usuario:", error);
        }
      }

      return {
        success: true,
        messageId: payload?.messageId || undefined,
        reason: payload?.reason || undefined,
        blocked: payload?.blocked === true,
      };
    }
    throw new Error("WhatsApp not connected for this connection");
  }

  // ANTI-DUPLICACAO: Verificar se mensagem ja foi enviada recentemente (para follow-up)
  if (options?.isFromAgent) {
    if (isRecentDuplicate(conversationId, text)) {
      console.log(`?? [sendMessage] Mensagem IDENTICA ja enviada recentemente, IGNORANDO duplicata`);
      console.log(`   Texto: "${text.substring(0, 80)}..."`);
      return { success: false, blocked: true, reason: "Mensagem duplicada recente" };
    }
    registerSentMessageCache(conversationId, text);
  }

  // Usar remoteJid normalizado do banco (suporta @lid, @s.whatsapp.net, etc)
  const jid = buildSendJid(conversation);

  console.log(`[sendMessage] Sending to: ${jid}${options?.isFromAgent ? " (from agent/follow-up)" : ""}`);

  const queueResult = await messageQueueService.enqueue(userId, jid, text, {
    isFromAgent: options?.isFromAgent,
    conversationId,
    connectionId: conversation.connectionId,
    priority: options?.isFromAgent ? "normal" : "high", // Mensagens manuais do dono = prioridade alta
  });

  // Se a fila bloqueou por dedupe, nada foi enviado. Nao persistir e nem disparar side-effects.
  if (queueResult.messageId === "DEDUPLICATED_BLOCKED") {
    console.log(`?? [sendMessage] Dedupe bloqueou envio. Ignorando persistencia/side-effects.`);
    return { success: false, blocked: true, reason: "Mensagem bloqueada por deduplicacao" };
  }

  const messageId = queueResult.messageId || Date.now().toString();

  let savedSentMsg: any = null;
  try {
    savedSentMsg = await storage.createMessage({
      conversationId,
      messageId,
      fromMe: true,
      text: text,
      timestamp: new Date(),
      status: "sent",
      isFromAgent: options?.isFromAgent ?? false,
    });
  } catch (dbErr) {
    // A mensagem pode ter sido enviada no WhatsApp; nao fazer retry agressivo por falha de DB.
    console.warn(`?? [sendMessage] Falha ao salvar mensagem enviada no DB (nao critico):`, dbErr);
  }

  // FOLLOW-UP USUARIOS: (re)ativar somente apos mensagens do dono/agente, nunca apos um follow-up.
  // Caso contrario, o follow-up reativa a si mesmo e entra em loop.
  if (messageSource != "followup") {
    try {
      await userFollowUpService.resetFollowUpCycle(conversationId, "Empresa respondeu");
    } catch (error) {
      console.error("Erro ao ativar follow-up do usuario:", error);
    }
  }

  try {
    await storage.updateConversation(conversationId, {
      lastMessageText: text,
      lastMessageTime: new Date(),
      lastMessageFromMe: true,
      hasReplied: true,
      unreadCount: 0,
    });
  } catch (dbErr) {
    console.warn(`?? [sendMessage] Falha ao atualizar conversa no DB (nao critico):`, dbErr);
  }

  broadcastToUser(userId, {
    type: "message_sent",
    conversationId,
    message: text,
    messageData: savedSentMsg ? {
      id: savedSentMsg.id,
      conversationId,
      messageId: savedSentMsg.messageId || messageId,
      fromMe: true,
      text: text,
      timestamp: savedSentMsg.timestamp || new Date().toISOString(),
      isFromAgent: options?.isFromAgent ?? false,
      status: "sent",
    } : undefined,
    conversationUpdate: {
      id: conversationId,
      lastMessageText: text,
      lastMessageTime: new Date().toISOString(),
      lastMessageFromMe: true,
    },
  });

  return { success: true, messageId };
}

export async function sendAdminConversationMessage(adminId: string, conversationId: string, text: string): Promise<void> {
  const session = adminSessions.get(adminId);
  if (!session?.socket) {
    throw new Error("Admin WhatsApp not connected");
  }

  const conversation = await storage.getAdminConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Resolver JID para envio (preferir n?mero real)
  let jid = conversation.remoteJid;
  
  // Se for LID, tentar resolver para n?mero real
  if (jid && jid.includes("@lid")) {
    // 1. Tentar cache
    const cached = session.contactsCache.get(jid);
    if (cached && cached.phoneNumber) {
      jid = cached.phoneNumber;
    } else {
      // 2. Tentar construir do contactNumber se dispon?vel
      if (conversation.contactNumber) {
         jid = `${conversation.contactNumber}@s.whatsapp.net`;
      }
    }
  }
  
  // Fallback se n?o tiver remoteJid mas tiver contactNumber
  if (!jid && conversation.contactNumber) {
    jid = `${conversation.contactNumber}@s.whatsapp.net`;
  }
  
  if (!jid) {
    throw new Error("Could not determine destination JID");
  }

  console.log(`[sendAdminConversationMessage] Sending to: ${jid} (Original: ${conversation.remoteJid})`);
  
  // ??? ANTI-BLOQUEIO: Usar fila do admin
  const sentMessage = await sendWithQueue(`admin_${adminId}`, 'admin conversa msg', async () => {
    return await session.socket.sendMessage(jid, { text });
  });

  // Salvar mensagem
  await storage.createAdminMessage({
    conversationId,
    messageId: sentMessage?.key?.id || Date.now().toString(),
    fromMe: true,
    text,
    timestamp: new Date(),
    status: "sent",
    isFromAgent: false,
  });

  await storage.updateAdminConversation(conversationId, {
    lastMessageText: text,
    lastMessageTime: new Date(),
  });
}

export async function sendAdminDirectMessage(adminId: string, phoneNumber: string, text: string): Promise<void> {
  const session = adminSessions.get(adminId);
  if (!session?.socket) {
    throw new Error("Admin WhatsApp not connected");
  }

  // Clean phone number
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;
  
  console.log(`[sendAdminDirectMessage] Sending to: ${jid}`);
  
  // ??? ANTI-BLOQUEIO: Usar fila do admin
  await sendWithQueue(`admin_${adminId}`, 'admin msg direta', async () => {
    await session.socket.sendMessage(jid, { text });
  });
}

// ==================== ADMIN NOTIFICATION MESSAGE ====================
// Para envio de notifica��es autom�ticas (lembretes de pagamento, check-ins, etc)
// N�O � para chatbot - apenas envio de mensagens informativas
export async function sendAdminNotification(
  adminId: string, 
  phoneNumber: string, 
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = adminSessions.get(adminId);
    if (!session?.socket) {
      console.log(`[sendAdminNotification] ? Admin ${adminId} n�o conectado`);
      return { success: false, error: "Admin WhatsApp not connected" };
    }

    // Clean phone number - remover tudo exceto n�meros
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Garantir que tem o DDI 55 do Brasil
    if (!cleanPhone.startsWith('55') && cleanPhone.length <= 11) {
      cleanPhone = '55' + cleanPhone;
    }
    
    // Verificar formato v�lido: 55 + DDD (2) + n�mero (8-9)
    if (cleanPhone.length < 12 || cleanPhone.length > 13) {
      console.log(`[sendAdminNotification] ? N�mero inv�lido: ${phoneNumber} -> ${cleanPhone} (length: ${cleanPhone.length})`);
      return { success: false, error: `N�mero inv�lido: ${phoneNumber}` };
    }
    
    // ? CORRE��O: Testar m�ltiplas varia��es do n�mero
    // Alguns n�meros podem estar cadastrados com 9 extra ou faltando o 9
    const phoneVariations: string[] = [cleanPhone];
    
    // Se tem 13 d�gitos (55 + DDD + 9 + 8 d�gitos), criar varia��o sem o 9
    if (cleanPhone.length === 13 && cleanPhone[4] === '9') {
      const withoutNine = cleanPhone.slice(0, 4) + cleanPhone.slice(5);
      phoneVariations.push(withoutNine);
      console.log(`[sendAdminNotification] ?? Varia��o sem 9: ${withoutNine}`);
    }
    
    // Se tem 12 d�gitos (55 + DDD + 8 d�gitos), criar varia��o com o 9
    if (cleanPhone.length === 12) {
      const withNine = cleanPhone.slice(0, 4) + '9' + cleanPhone.slice(4);
      phoneVariations.push(withNine);
      console.log(`[sendAdminNotification] ?? Varia��o com 9: ${withNine}`);
    }
    
    console.log(`[sendAdminNotification] ?? Verificando varia��es: ${phoneVariations.join(', ')}`);
    
    // ? Verificar qual varia��o existe no WhatsApp
    let validPhone: string | null = null;
    
    for (const phone of phoneVariations) {
      try {
        const [result] = await session.socket.onWhatsApp(phone);
        if (result?.exists === true) {
          validPhone = phone;
          console.log(`[sendAdminNotification] ? N�mero encontrado: ${phone}`);
          break;
        } else {
          console.log(`[sendAdminNotification] ? ${phone} n�o existe no WhatsApp`);
        }
      } catch (checkError) {
        console.log(`[sendAdminNotification] ?? Erro ao verificar ${phone}:`, checkError);
      }
    }
    
    // Se nenhuma varia��o foi encontrada, retornar erro
    if (!validPhone) {
      console.log(`[sendAdminNotification] ? Nenhuma varia��o do n�mero existe no WhatsApp: ${phoneVariations.join(', ')}`);
      return { success: false, error: `N�mero n�o existe no WhatsApp: ${phoneNumber} (testado: ${phoneVariations.join(', ')})` };
    }
    
    const jid = `${validPhone}@s.whatsapp.net`;
    console.log(`[sendAdminNotification] ?? Enviando para: ${jid}`);
    
    // Enviar mensagem usando a fila anti-banimento
    let sendSuccess = false;
    let sendError: string | undefined;
    
    await sendWithQueue(`admin_${adminId}`, 'admin notification', async () => {
      try {
        const result = await session.socket.sendMessage(jid, { text: message });
        
        if (result?.key?.id) {
          sendSuccess = true;
          console.log(`[sendAdminNotification] ? Mensagem enviada com sucesso para ${validPhone} (msgId: ${result.key.id})`);
        } else {
          sendError = 'Nenhum ID de mensagem retornado';
          console.log(`[sendAdminNotification] ?? Envio sem confirma��o para ${validPhone}`);
        }
      } catch (sendErr) {
        sendError = sendErr instanceof Error ? sendErr.message : 'Erro desconhecido';
        console.error(`[sendAdminNotification] ? Erro ao enviar para ${validPhone}:`, sendErr);
        throw sendErr; // Re-throw para que sendWithQueue capture
      }
    });

    if (sendSuccess) {
      return { success: true, validatedPhone: validPhone, originalPhone: phoneNumber };
    } else {
      return { success: false, error: sendError || 'Falha no envio', validatedPhone: validPhone, originalPhone: phoneNumber };
    }
  } catch (error) {
    console.error('[sendAdminNotification] ? Erro geral:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// ==================== ADMIN MEDIA MESSAGE ====================

interface AdminMediaPayload {
  type: 'audio' | 'image' | 'video' | 'document';
  data: string; // base64 data URL or URL
  mimetype: string;
  filename?: string;
  caption?: string;
  ptt?: boolean; // push to talk (voice note)
  seconds?: number;
}

export async function sendAdminMediaMessage(
  adminId: string, 
  conversationId: string, 
  media: AdminMediaPayload
): Promise<void> {
  const session = adminSessions.get(adminId);
  if (!session?.socket) {
    throw new Error("Admin WhatsApp not connected");
  }

  const conversation = await storage.getAdminConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Resolver JID
  let jid = conversation.remoteJid;
  
  if (jid && jid.includes("@lid")) {
    const cached = session.contactsCache.get(jid);
    if (cached && cached.phoneNumber) {
      jid = cached.phoneNumber;
    } else if (conversation.contactNumber) {
      jid = `${conversation.contactNumber}@s.whatsapp.net`;
    }
  }
  
  if (!jid && conversation.contactNumber) {
    jid = `${conversation.contactNumber}@s.whatsapp.net`;
  }
  
  if (!jid) {
    throw new Error("Could not determine destination JID");
  }

  console.log(`[sendAdminMediaMessage] Sending ${media.type} to: ${jid}`);

  // Converter base64 para buffer se necess?rio
  let mediaBuffer: Buffer;
  if (media.data.startsWith('data:')) {
    const base64Data = media.data.split(',')[1];
    mediaBuffer = Buffer.from(base64Data, 'base64');
  } else {
    mediaBuffer = Buffer.from(media.data, 'base64');
  }

  let messageContent: any;
  let mediaTypeForStorage = media.type;

  switch (media.type) {
    case 'audio':
      messageContent = {
        audio: mediaBuffer,
        mimetype: media.mimetype || 'audio/ogg; codecs=opus',
        ptt: media.ptt !== false, // Default to true for voice notes
        seconds: media.seconds,
      };
      break;
      
    case 'image':
      messageContent = {
        image: mediaBuffer,
        mimetype: media.mimetype || 'image/jpeg',
        caption: media.caption,
      };
      break;
      
    case 'video':
      messageContent = {
        video: mediaBuffer,
        mimetype: media.mimetype || 'video/mp4',
        caption: media.caption,
      };
      break;
      
    case 'document':
      messageContent = {
        document: mediaBuffer,
        mimetype: media.mimetype || 'application/pdf',
        fileName: media.filename || 'document',
        caption: media.caption,
      };
      break;
      
    default:
      throw new Error(`Unsupported media type: ${media.type}`);
  }

  // ??? ANTI-BLOQUEIO: Usar fila do admin
  const sentMessage = await sendWithQueue(`admin_${adminId}`, `admin m?dia ${media.type}`, async () => {
    return await session.socket.sendMessage(jid, messageContent);
  });

  // Salvar mensagem no banco
  await storage.createAdminMessage({
    conversationId,
    messageId: sentMessage?.key?.id || Date.now().toString(),
    fromMe: true,
    text: media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)} enviado]`,
    timestamp: new Date(),
    status: "sent",
    isFromAgent: false,
    mediaType: mediaTypeForStorage,
    mediaUrl: media.data, // Guardar base64 para exibi??o
    mediaMimeType: media.mimetype,
    mediaCaption: media.caption,
  });

  await storage.updateAdminConversation(conversationId, {
    lastMessageText: media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)}]`,
    lastMessageTime: new Date(),
  });
}

// ==================== USER MEDIA SEND (SaaS Users) ====================

export interface UserMediaPayload {
  type: 'audio' | 'image' | 'video' | 'document';
  data: string; // base64 data URL or URL
  mimetype: string;
  filename?: string;
  caption?: string;
  ptt?: boolean; // push to talk (voice note)
  seconds?: number;
}

export async function sendUserMediaMessage(
  userId: string, 
  conversationId: string, 
  media: UserMediaPayload
): Promise<void> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Verify ownership by conversation connection (strict multi-connection)
  const connection = await storage.getConnectionById(conversation.connectionId);
  if (!connection || connection.userId !== userId) {
    throw new Error("Unauthorized access to conversation");
  }

  const session = sessions.get(conversation.connectionId);
  if (!session?.socket) {
    throw new Error("WhatsApp not connected for this connection");
  }

  // Resolver JID
  let jid = conversation.remoteJid;
  
  if (jid && jid.includes("@lid")) {
    const cached = session.contactsCache.get(jid);
    if (cached && cached.phoneNumber) {
      jid = cached.phoneNumber;
    } else if (conversation.contactNumber) {
      jid = `${conversation.contactNumber}@s.whatsapp.net`;
    }
  }
  
  if (!jid && conversation.contactNumber) {
    jid = `${conversation.contactNumber}@s.whatsapp.net`;
  }
  
  if (!jid) {
    throw new Error("Could not determine destination JID");
  }

  console.log(`[sendUserMediaMessage] Sending ${media.type} to: ${jid}`);

  // Converter base64 para buffer se necess?rio (ANTES da fila para n?o ocupar tempo na fila)
  let mediaBuffer: Buffer;
  if (media.data.startsWith('data:')) {
    const base64Data = media.data.split(',')[1];
    mediaBuffer = Buffer.from(base64Data, 'base64');
  } else {
    mediaBuffer = Buffer.from(media.data, 'base64');
  }

  console.log(`[sendUserMediaMessage] ?? Buffer size: ${mediaBuffer.length} bytes, mimetype: ${media.mimetype}`);

  let messageContent: any;
  let mediaTypeForStorage = media.type;

  switch (media.type) {
    case 'audio':
      // Para ?udio PTT (nota de voz), usar o mimetype fornecido
      messageContent = {
        audio: mediaBuffer,
        mimetype: media.mimetype || 'audio/ogg; codecs=opus',
        ptt: media.ptt !== false, // Default to true for voice notes
        seconds: media.seconds,
      };
      console.log(`[sendUserMediaMessage] ?? Audio prepared:`, {
        size: mediaBuffer.length,
        mimetype: messageContent.mimetype,
        ptt: messageContent.ptt,
        seconds: messageContent.seconds
      });
      break;
      
    case 'image':
      messageContent = {
        image: mediaBuffer,
        mimetype: media.mimetype || 'image/jpeg',
        caption: media.caption,
      };
      break;
      
    case 'video':
      messageContent = {
        video: mediaBuffer,
        mimetype: media.mimetype || 'video/mp4',
        caption: media.caption,
      };
      break;
      
    case 'document':
      messageContent = {
        document: mediaBuffer,
        mimetype: media.mimetype || 'application/pdf',
        fileName: media.filename || 'document',
        caption: media.caption,
      };
      break;
      
    default:
      throw new Error(`Unsupported media type: ${media.type}`);
  }

  console.log(`[sendUserMediaMessage] ?? Sending to WhatsApp...`);
  
  // ??? ANTI-BLOQUEIO: Usar fila do usu?rio
  const sentMessage = await sendWithQueue(userId, `usu?rio m?dia ${media.type}`, async () => {
    return await session.socket.sendMessage(jid, messageContent);
  });
  console.log(`[sendUserMediaMessage] ? Message sent! ID: ${sentMessage?.key?.id}`);

  const sentAt = new Date();
  const persistedText = media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)} enviado]`;
  const previewText = media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)}]`;

  // Salvar mensagem no banco
  const savedSentMsg = await storage.createMessage({
    conversationId,
    messageId: sentMessage?.key?.id || Date.now().toString(),
    fromMe: true,
    text: persistedText,
    timestamp: sentAt,
    status: "sent",
    isFromAgent: false,
    mediaType: mediaTypeForStorage,
    mediaUrl: media.data, // Guardar base64 para exibi??o
    mediaMimeType: media.mimetype,
    mediaCaption: media.caption,
  });

  await storage.updateConversation(conversationId, {
    lastMessageText: previewText,
    lastMessageTime: sentAt,
    lastMessageFromMe: true,
    unreadCount: 0,
    hasReplied: true,
  });

  // Atualiza��o em tempo real para evitar lista/mensagens desatualizadas ap�s envio de m�dia.
  broadcastToUser(userId, {
    type: "message_sent",
    conversationId,
    message: persistedText,
    messageData: {
      id: savedSentMsg.id,
      conversationId,
      messageId: savedSentMsg.messageId || sentMessage?.key?.id || Date.now().toString(),
      fromMe: true,
      text: persistedText,
      timestamp: savedSentMsg.timestamp || sentAt.toISOString(),
      isFromAgent: false,
      status: "sent",
      mediaType: mediaTypeForStorage,
      mediaUrl: media.data,
      mediaMimeType: media.mimetype,
      mediaCaption: media.caption,
    },
    conversationUpdate: {
      id: conversationId,
      connectionId: conversation.connectionId,
      contactNumber: conversation.contactNumber,
      contactName: conversation.contactName,
      contactAvatar: conversation.contactAvatar,
      lastMessageText: previewText,
      lastMessageTime: sentAt.toISOString(),
      lastMessageFromMe: true,
      unreadCount: 0,
    },
  });

  // ?? AUTO-PAUSE IA: Quando o dono envia m?dia pelo sistema, PAUSA a IA
  try {
    const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversationId);
    if (!isAlreadyDisabled) {
      await storage.disableAgentForConversation(conversationId);
      console.log(`?? [AUTO-PAUSE] IA pausada automaticamente para conversa ${conversationId} - dono enviou m?dia pelo sistema`);
    }
  } catch (pauseError) {
    console.error("Erro ao pausar IA automaticamente:", pauseError);
  }
}

// ==================== BULK SEND / ENVIO EM MASSA ====================
export async function sendBulkMessages(
  userId: string, 
  phones: string[], 
  message: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp n?o conectado");
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  console.log(`[BULK SEND] ??? Iniciando envio ANTI-BLOQUEIO para ${phones.length} n?meros`);

  for (const phone of phones) {
    try {
      // Formatar n?mero para JID
      const cleanPhone = phone.replace(/\D/g, '');
      
      // Adicionar c?digo do pa?s se necess?rio (Brasil = 55)
      let formattedPhone = cleanPhone;
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        formattedPhone = '55' + cleanPhone;
      }
      
      const jid = `${formattedPhone}@s.whatsapp.net`;
      
      console.log(`[BULK SEND] Enviando para: ${jid}`);
      
      // ??? ANTI-BLOQUEIO: Usar fila de mensagens com delay autom?tico de 5-10s
      // ? Texto enviado EXATAMENTE como recebido (varia??o REMOVIDA do sistema)
      const queueResult = await messageQueueService.enqueue(userId, jid, message, {
        isFromAgent: true,
        priority: 'low', // Bulk = prioridade baixa (respostas de IA passam na frente)
      });
      
      if (queueResult.success) {
        sent++;
        console.log(`[BULK SEND] ? Enviado para ${phone}`);
      } else {
        failed++;
        errors.push(`${phone}: ${queueResult.error || 'Sem ID de mensagem retornado'}`);
        console.log(`[BULK SEND] ? Falha ao enviar para ${phone}: ${queueResult.error}`);
      }
      
      // ??? A fila j? controla o delay - n?o precisa de delay extra aqui
      
    } catch (error: any) {
      failed++;
      const errorMsg = error.message || 'Erro desconhecido';
      errors.push(`${phone}: ${errorMsg}`);
      console.log(`[BULK SEND] ? Erro ao enviar para ${phone}: ${errorMsg}`);
      
      // Delay extra em caso de erro (pode ser rate limit)
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`[BULK SEND] Conclu?do: ${sent} enviados, ${failed} falharam`);
  
  return { sent, failed, errors };
}

// ==================== BULK SEND ADVANCED - COM [nome] E IA ====================
export async function sendBulkMessagesAdvanced(
  userId: string, 
  contacts: { phone: string; name: string }[], 
  messageTemplate: string,
  options: {
    delayMin?: number;
    delayMax?: number;
    useAI?: boolean;
    onProgress?: (sent: number, failed: number) => Promise<void>;
  } = {}
): Promise<{ 
  sent: number; 
  failed: number; 
  errors: string[];
  details: {
    sent: { phone: string; name?: string; timestamp: string; message: string }[];
    failed: { phone: string; name?: string; error: string; timestamp: string }[];
  };
}> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp n?o conectado");
  }

  const delayMin = options.delayMin || 5000;
  const delayMax = options.delayMax || 15000;
  const useAI = options.useAI || false;
  const onProgress = options.onProgress;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const details = {
    sent: [] as { phone: string; name?: string; timestamp: string; message: string }[],
    failed: [] as { phone: string; name?: string; error: string; timestamp: string }[],
  };

  console.log(`[BULK SEND ADVANCED] Iniciando envio para ${contacts.length} contatos`);
  console.log(`[BULK SEND ADVANCED] Delay: ${delayMin/1000}-${delayMax/1000}s, IA: ${useAI}`);

  // Fun??o para aplicar template [nome] - usa sanitização para nomes inválidos
  const applyTemplate = (template: string, name: string): string => {
    const { sanitizeContactName } = require("./textUtils");
    const safeName = sanitizeContactName(name) || 'Cliente';
    return template.replace(/\[nome\]/gi, safeName);
  };

  // Fun??o para gerar varia??o com IA (par?frase e sin?nimos)
  const generateVariation = async (message: string, contactIndex: number): Promise<string> => {
    if (!useAI) return message;
    
    try {
      // Sin?nimos comuns em portugu?s
      const synonyms: Record<string, string[]> = {
        'ol?': ['oi', 'eae', 'e a?', 'hey'],
        'oi': ['ol?', 'eae', 'e a?', 'hey'],
        'tudo bem': ['como vai', 'tudo certo', 'tudo ok', 'como voc? est?'],
        'como vai': ['tudo bem', 'tudo certo', 'como est?', 'tudo ok'],
        'obrigado': ['valeu', 'grato', 'agrade?o', 'muito obrigado'],
        'obrigada': ['valeu', 'grata', 'agrade?o', 'muito obrigada'],
        'por favor': ['poderia', 'seria poss?vel', 'gentilmente', 'se poss?vel'],
        'aqui': ['por aqui', 'neste momento', 'agora'],
        'agora': ['neste momento', 'atualmente', 'no momento'],
        'hoje': ['neste dia', 'agora', 'no dia de hoje'],
        'gostaria': ['queria', 'preciso', 'necessito', 'adoraria'],
        'pode': ['consegue', 'seria poss?vel', 'poderia', 'daria para'],
        'grande': ['enorme', 'imenso', 'vasto', 'extenso'],
        'pequeno': ['menor', 'reduzido', 'compacto', 'm?nimo'],
        'bom': ['?timo', 'excelente', 'legal', 'incr?vel'],
        'bonito': ['lindo', 'maravilhoso', 'belo', 'encantador'],
        'r?pido': ['veloz', '?gil', 'ligeiro', 'imediato'],
        'ajudar': ['auxiliar', 'apoiar', 'assistir', 'dar uma for?a'],
        'entrar em contato': ['falar com voc?', 'te contatar', 'enviar mensagem', 'me comunicar'],
        'informa??es': ['detalhes', 'dados', 'informes', 'esclarecimentos'],
        'produto': ['item', 'mercadoria', 'artigo', 'oferta'],
        'servi?o': ['atendimento', 'solu??o', 'suporte', 'trabalho'],
        'empresa': ['companhia', 'neg?cio', 'organiza??o', 'firma'],
        'cliente': ['consumidor', 'comprador', 'parceiro', 'usu?rio'],
        'qualidade': ['excel?ncia', 'padr?o', 'n?vel', 'categoria'],
        'pre?o': ['valor', 'custo', 'investimento', 'oferta'],
        'desconto': ['promo??o', 'oferta especial', 'condi??o especial', 'vantagem'],
        'interessado': ['curioso', 'interessando', 'querendo saber', 'buscando'],
      };
      
      // Prefixos variados para humanizar
      const prefixes = ['', '', '', '?? ', '?? ', '?? ', '?? ', 'Hey, ', 'Ei, '];
      // Sufixos variados
      const suffixes = ['', '', '', ' ??', ' ??', ' ?', '!', '.', ' Abra?os!', ' Att.'];
      // Estruturas de abertura alternativas
      const openings: Record<string, string[]> = {
        'ol? [nome]': ['Oi [nome]', 'E a? [nome]', 'Ei [nome]', '[nome], tudo bem?', 'Fala [nome]'],
        'oi [nome]': ['Ol? [nome]', 'E a? [nome]', 'Ei [nome]', '[nome], como vai?', 'Fala [nome]'],
        'bom dia': ['Bom dia!', 'Dia!', 'Bom diaa', '?timo dia'],
        'boa tarde': ['Boa tarde!', 'Tarde!', 'Boa tardee', '?tima tarde'],
        'boa noite': ['Boa noite!', 'Noite!', 'Boa noitee', '?tima noite'],
      };
      
      let varied = message;
      
      // 1. Aplicar substitui??es de abertura
      for (const [pattern, replacements] of Object.entries(openings)) {
        const regex = new RegExp(pattern, 'gi');
        if (regex.test(varied)) {
          const randomReplacement = replacements[Math.floor(Math.random() * replacements.length)];
          varied = varied.replace(regex, randomReplacement);
          break; // S? substitui uma abertura
        }
      }
      
      // 2. Aplicar 1-3 substitui??es de sin?nimos aleatoriamente
      const wordsToReplace = Math.floor(Math.random() * 3) + 1;
      let replacedCount = 0;
      
      for (const [word, syns] of Object.entries(synonyms)) {
        if (replacedCount >= wordsToReplace) break;
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(varied)) {
          const randomSyn = syns[Math.floor(Math.random() * syns.length)];
          varied = varied.replace(regex, randomSyn);
          replacedCount++;
        }
      }
      
      // 3. Adicionar varia??o de pontua??o
      if (Math.random() > 0.7) {
        varied = varied.replace(/\!$/g, '.');
      } else if (Math.random() > 0.8) {
        varied = varied.replace(/\.$/g, '!');
      }
      
      // 4. Usar ?ndice para variar prefixo/sufixo de forma distribu?da
      const prefixIndex = (contactIndex + Math.floor(Math.random() * 3)) % prefixes.length;
      const suffixIndex = (contactIndex + Math.floor(Math.random() * 3)) % suffixes.length;
      
      // N?o adicionar prefixo/sufixo se j? come?ar com emoji ou terminar com emoji
      // Usa regex sem flag 'u' para compatibilidade com ES5
      const emojiPattern = /[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
      const startsWithEmoji = emojiPattern.test(varied.slice(0, 2));
      const endsWithEmoji = emojiPattern.test(varied.slice(-2));
      
      if (!startsWithEmoji && prefixes[prefixIndex]) {
        varied = prefixes[prefixIndex] + varied;
      }
      if (!endsWithEmoji && suffixes[suffixIndex] && !varied.endsWith(suffixes[suffixIndex])) {
        // Remover pontua??o final antes de adicionar sufixo
        if (suffixes[suffixIndex].match(/^[.!?]/) || suffixes[suffixIndex].match(/^\s*[A-Za-z]/)) {
          varied = varied.replace(/[.!?]+$/, '');
        }
        varied = varied + suffixes[suffixIndex];
      }
      
      console.log(`[BULK SEND AI] Varia??o #${contactIndex + 1}: "${varied.substring(0, 60)}..."`);
      return varied;
    } catch (error) {
      console.error('[BULK SEND] Erro ao gerar varia??o IA:', error);
      return message;
    }
  };

  let contactIndex = 0;
  for (const contact of contacts) {
    try {
      // Formatar n?mero para JID
      const cleanPhone = contact.phone.replace(/\D/g, '');
      
      // Adicionar c?digo do pa?s se necess?rio (Brasil = 55)
      let formattedPhone = cleanPhone;
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        formattedPhone = '55' + cleanPhone;
      }
      
      const jid = `${formattedPhone}@s.whatsapp.net`;
      
      // Aplicar template [nome] e varia??o IA
      let finalMessage = applyTemplate(messageTemplate, contact.name);
      if (useAI) {
        finalMessage = await generateVariation(finalMessage, contactIndex);
      }
      
      const sendStartTime = Date.now();
      console.log(`[BULK SEND ADVANCED] [${contactIndex + 1}/${contacts.length}] Enviando para: ${contact.name || contact.phone} (${jid})`);
      console.log(`[BULK SEND ADVANCED] Mensagem: ${finalMessage.substring(0, 50)}...`);
      console.log(`[BULK SEND ADVANCED] Timestamp in?cio: ${new Date(sendStartTime).toISOString()}`);
      
      // ??? ANTI-BLOQUEIO: Usar fila de mensagens com delay autom?tico de 5-10s
      // ? Texto enviado EXATAMENTE como recebido (varia??o REMOVIDA do sistema)
      const queueResult = await messageQueueService.enqueue(userId, jid, finalMessage, {
        isFromAgent: true,
        priority: 'low', // Bulk = prioridade baixa
      });
      
      const queueEndTime = Date.now();
      console.log(`[BULK SEND ADVANCED] Queue processada em ${((queueEndTime - sendStartTime) / 1000).toFixed(2)}s`);
      
      if (queueResult.success) {
        sent++;
        details.sent.push({
          phone: contact.phone,
          name: contact.name,
          timestamp: new Date().toISOString(),
          message: finalMessage,
        });
        console.log(`[BULK SEND ADVANCED] ? Enviado para ${contact.name || contact.phone}`);
        
        // ?? Atualizar progresso em tempo real
        if (onProgress) {
          try {
            await onProgress(sent, failed);
          } catch (progressError) {
            console.error('[BULK SEND] Erro ao atualizar progresso:', progressError);
          }
        }
      } else {
        failed++;
        const errorMsg = queueResult.error || 'Sem ID de mensagem retornado';
        errors.push(`${contact.phone}: ${errorMsg}`);
        details.failed.push({
          phone: contact.phone,
          name: contact.name,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
        console.log(`[BULK SEND ADVANCED] ? Falha: ${contact.phone}`);
        
        // ?? Atualizar progresso em tempo real (tamb?m para falhas)
        if (onProgress) {
          try {
            await onProgress(sent, failed);
          } catch (progressError) {
            console.error('[BULK SEND] Erro ao atualizar progresso:', progressError);
          }
        }
      }

      // ??? DELAY COMPLETO CONFIGURADO PELO USU?RIO
      // A fila tem delay base de 5-10s, MAS para envio em massa queremos o delay configurado COMPLETO
      // Para garantir, aplicamos o delay configurado AP?S o enqueue retornar
      // Isso garante que mesmo com varia??es da fila, teremos pelo menos o delay configurado
      if (contactIndex < contacts.length - 1) {
        const configuredDelay = delayMin + Math.random() * (delayMax - delayMin);
        console.log(`??? [BULK SEND] Delay configurado: ${(configuredDelay/1000).toFixed(1)}s (perfil: ${delayMin/1000}-${delayMax/1000}s)`);
        await new Promise(resolve => setTimeout(resolve, configuredDelay));
      }
      
    } catch (error: any) {
      failed++;
      const errorMsg = error.message || 'Erro desconhecido';
      errors.push(`${contact.phone}: ${errorMsg}`);
      details.failed.push({
        phone: contact.phone,
        name: contact.name,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
      console.log(`[BULK SEND ADVANCED] ? Erro: ${contact.phone} - ${errorMsg}`);
      
      // ?? Atualizar progresso em tempo real (tamb?m para erros)
      if (onProgress) {
        try {
          await onProgress(sent, failed);
        } catch (progressError) {
          console.error('[BULK SEND] Erro ao atualizar progresso:', progressError);
        }
      };
      
      // Delay extra em caso de erro
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    contactIndex++;
  }

  console.log(`[BULK SEND ADVANCED] Conclu?do: ${sent} enviados, ${failed} falharam`);
  
  return { sent, failed, errors, details };
}

// ==================== BULK SEND WITH MEDIA / ENVIO EM MASSA COM M?DIA ====================

export interface BulkMediaPayload {
  type: 'audio' | 'image' | 'video' | 'document';
  data: string; // base64 data URL or URL
  mimetype: string;
  filename?: string;
  caption?: string;
  ptt?: boolean;
}

/**
 * Envia mensagem com m?dia em massa para m?ltiplos contatos
 * Suporta: imagem, v?deo, ?udio e documento
 */
export async function sendBulkMediaMessages(
  userId: string,
  contacts: { phone: string; name: string }[],
  messageTemplate: string,
  media: BulkMediaPayload,
  options: {
    delayMin?: number;
    delayMax?: number;
    onProgress?: (sent: number, failed: number) => Promise<void>;
  } = {}
): Promise<{
  sent: number;
  failed: number;
  errors: string[];
  details: {
    sent: { phone: string; name?: string; timestamp: string }[];
    failed: { phone: string; name?: string; error: string; timestamp: string }[];
  };
}> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp n?o conectado");
  }

  const delayMin = options.delayMin || 5000;
  const delayMax = options.delayMax || 15000;
  const { onProgress } = options;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const details = {
    sent: [] as { phone: string; name?: string; timestamp: string }[],
    failed: [] as { phone: string; name?: string; error: string; timestamp: string }[],
  };

  console.log(`[BULK MEDIA SEND] ??? Iniciando envio de ${media.type} para ${contacts.length} contatos`);
  console.log(`[BULK MEDIA SEND] Delay: ${delayMin/1000}-${delayMax/1000}s`);

  // Converter base64 para buffer UMA VEZ (performance)
  let mediaBuffer: Buffer;
  try {
    if (media.data.startsWith('data:')) {
      const base64Data = media.data.split(',')[1];
      mediaBuffer = Buffer.from(base64Data, 'base64');
    } else {
      mediaBuffer = Buffer.from(media.data, 'base64');
    }
    console.log(`[BULK MEDIA SEND] ?? Buffer preparado: ${mediaBuffer.length} bytes`);
  } catch (bufferError: any) {
    throw new Error(`Erro ao processar m?dia: ${bufferError.message}`);
  }

  // Fun??o para aplicar template [nome]
  const applyTemplate = (template: string, name: string): string => {
    if (!template) return '';
    return template.replace(/\[nome\]/gi, name || 'Cliente');
  };

  let contactIndex = 0;
  for (const contact of contacts) {
    try {
      // Formatar n?mero para JID
      const cleanPhone = contact.phone.replace(/\D/g, '');
      let formattedPhone = cleanPhone;
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        formattedPhone = '55' + cleanPhone;
      }
      const jid = `${formattedPhone}@s.whatsapp.net`;

      // Aplicar template na legenda
      const finalCaption = applyTemplate(messageTemplate, contact.name);

      console.log(`[BULK MEDIA SEND] [${contactIndex + 1}/${contacts.length}] Enviando ${media.type} para: ${contact.name || contact.phone}`);

      // Preparar conte?do de m?dia
      let messageContent: any;

      switch (media.type) {
        case 'audio':
          messageContent = {
            audio: mediaBuffer,
            mimetype: media.mimetype || 'audio/ogg; codecs=opus',
            ptt: media.ptt !== false,
          };
          break;

        case 'image':
          messageContent = {
            image: mediaBuffer,
            mimetype: media.mimetype || 'image/jpeg',
            caption: finalCaption || undefined,
          };
          break;

        case 'video':
          messageContent = {
            video: mediaBuffer,
            mimetype: media.mimetype || 'video/mp4',
            caption: finalCaption || undefined,
          };
          break;

        case 'document':
          messageContent = {
            document: mediaBuffer,
            mimetype: media.mimetype || 'application/pdf',
            fileName: media.filename || 'document',
            caption: finalCaption || undefined,
          };
          break;

        default:
          throw new Error(`Tipo de m?dia n?o suportado: ${media.type}`);
      }

      // Enviar m?dia via socket (n?o usar fila para m?dia - enviamos diretamente)
      const sendStartTime = Date.now();
      const sentMessage = await session.socket.sendMessage(jid, messageContent);
      const sendEndTime = Date.now();

      console.log(`[BULK MEDIA SEND] ? Enviado para ${contact.name || contact.phone} em ${sendEndTime - sendStartTime}ms`);

      sent++;
      details.sent.push({
        phone: contact.phone,
        name: contact.name,
        timestamp: new Date().toISOString(),
      });

      // Atualizar progresso
      if (onProgress) {
        try {
          await onProgress(sent, failed);
        } catch (progressError) {
          console.error('[BULK MEDIA SEND] Erro ao atualizar progresso:', progressError);
        }
      }

      // Delay entre envios (mais conservador para m?dia)
      if (contactIndex < contacts.length - 1) {
        const configuredDelay = delayMin + Math.random() * (delayMax - delayMin);
        console.log(`??? [BULK MEDIA SEND] Delay: ${(configuredDelay/1000).toFixed(1)}s`);
        await new Promise(resolve => setTimeout(resolve, configuredDelay));
      }

    } catch (error: any) {
      failed++;
      const errorMsg = error.message || 'Erro desconhecido';
      errors.push(`${contact.phone}: ${errorMsg}`);
      details.failed.push({
        phone: contact.phone,
        name: contact.name,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
      console.log(`[BULK MEDIA SEND] ? Erro: ${contact.phone} - ${errorMsg}`);

      if (onProgress) {
        try {
          await onProgress(sent, failed);
        } catch (progressError) {
          console.error('[BULK MEDIA SEND] Erro ao atualizar progresso:', progressError);
        }
      }

      // Delay extra em caso de erro
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    contactIndex++;
  }

  console.log(`[BULK MEDIA SEND] Conclu?do: ${sent} enviados, ${failed} falharam`);
  return { sent, failed, errors, details };
}

// ==================== GRUPOS / GROUPS ====================

interface WhatsAppGroup {
  id: string;
  name: string;
  participantsCount: number;
  description?: string;
  owner?: string;
  createdAt?: number;
  isAdmin?: boolean;
}

/**
 * Busca todos os grupos que o usu?rio participa
 * Usa groupFetchAllParticipating do Baileys
 */
export async function fetchUserGroups(userId: string): Promise<WhatsAppGroup[]> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp n?o conectado");
  }

  try {
    console.log(`[GROUPS] Buscando grupos para usu?rio ${userId}...`);
    
    // Buscar todos os grupos participantes via Baileys
    const groups = await session.socket.groupFetchAllParticipating();
    
    const groupList: WhatsAppGroup[] = [];
    
    for (const [jid, metadata] of Object.entries(groups)) {
      // Verificar se o usu?rio ? admin do grupo
      const meJid = session.socket.user?.id;
      const meParticipant = metadata.participants?.find(p => 
        p.id === meJid || p.id?.includes(session.phoneNumber || '')
      );
      const isAdmin = meParticipant?.admin === 'admin' || meParticipant?.admin === 'superadmin';
      
      groupList.push({
        id: jid,
        name: metadata.subject || 'Grupo sem nome',
        participantsCount: metadata.participants?.length || metadata.size || 0,
        description: metadata.desc || undefined,
        owner: metadata.owner || undefined,
        createdAt: metadata.creation,
        isAdmin,
      });
    }
    
    console.log(`[GROUPS] Encontrados ${groupList.length} grupos`);
    return groupList;
    
  } catch (error: any) {
    console.error(`[GROUPS] Erro ao buscar grupos:`, error);
    throw new Error(`Falha ao buscar grupos: ${error.message}`);
  }
}

/**
 * Envia mensagem para um ou mais grupos
 */
export async function sendMessageToGroups(
  userId: string,
  groupIds: string[],
  message: string,
  options: {
    delayMin?: number;
    delayMax?: number;
    useAI?: boolean;
  } = {}
): Promise<{
  sent: number;
  failed: number;
  errors: string[];
  details: {
    sent: { groupId: string; groupName?: string; timestamp: string; message: string }[];
    failed: { groupId: string; groupName?: string; error: string; timestamp: string }[];
  };
}> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp n?o conectado");
  }

  const delayMin = options.delayMin || 5000;
  const delayMax = options.delayMax || 15000;
  const useAI = options.useAI || false;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const details = {
    sent: [] as { groupId: string; groupName?: string; timestamp: string; message: string }[],
    failed: [] as { groupId: string; groupName?: string; error: string; timestamp: string }[],
  };

  console.log(`[GROUP SEND] Iniciando envio para ${groupIds.length} grupos`);
  console.log(`[GROUP SEND] Delay: ${delayMin/1000}-${delayMax/1000}s, IA: ${useAI}`);

  // Buscar metadados dos grupos para obter nomes
  let groupsMetadata: Record<string, any> = {};
  try {
    groupsMetadata = await session.socket.groupFetchAllParticipating();
  } catch (e) {
    console.warn('[GROUP SEND] N?o foi poss?vel buscar metadados dos grupos');
  }

  // Fun??o para gerar varia??o b?sica com IA
  const generateGroupVariation = (baseMessage: string, groupIndex: number): string => {
    if (!useAI) return baseMessage;
    
    // Varia??es simples de prefixo/sufixo
    const prefixes = ['', '', '?? ', '?? ', '?? ', '?? '];
    const suffixes = ['', '', '', ' ??', ' ?', '!'];
    
    const prefixIndex = groupIndex % prefixes.length;
    const suffixIndex = groupIndex % suffixes.length;
    
    let varied = baseMessage;
    
    // Adicionar varia??o se n?o come?ar/terminar com emoji
    const emojiPattern = /[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
    const startsWithEmoji = emojiPattern.test(varied.slice(0, 2));
    const endsWithEmoji = emojiPattern.test(varied.slice(-2));
    
    if (!startsWithEmoji && prefixes[prefixIndex]) {
      varied = prefixes[prefixIndex] + varied;
    }
    if (!endsWithEmoji && suffixes[suffixIndex]) {
      varied = varied.replace(/[.!?]+$/, '') + suffixes[suffixIndex];
    }
    
    return varied;
  };

  let groupIndex = 0;
  for (const groupId of groupIds) {
    try {
      // Verificar se ? um JID de grupo v?lido
      const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
      const groupName = groupsMetadata[jid]?.subject || groupId;
      
      // Aplicar varia??o se IA estiver ativada
      const finalMessage = useAI ? generateGroupVariation(message, groupIndex) : message;
      
      console.log(`[GROUP SEND] Enviando para grupo: ${groupName} (${jid})`);
      console.log(`[GROUP SEND] Mensagem: ${finalMessage.substring(0, 50)}...`);
      
      // ??? ANTI-BLOQUEIO: Usar fila de mensagens com delay autom?tico de 5-10s
      // ? Texto enviado EXATAMENTE como recebido (varia??o REMOVIDA do sistema)
      const queueResult = await messageQueueService.enqueue(userId, jid, finalMessage, {
        isFromAgent: true,
        priority: 'low', // Grupos = prioridade baixa
      });
      
      if (queueResult.success) {
        sent++;
        details.sent.push({
          groupId: jid,
          groupName,
          timestamp: new Date().toISOString(),
          message: finalMessage,
        });
        console.log(`[GROUP SEND] ? Enviado para ${groupName}`);
      } else {
        failed++;
        const errorMsg = queueResult.error || 'Sem ID de mensagem retornado';
        errors.push(`${groupName}: ${errorMsg}`);
        details.failed.push({
          groupId: jid,
          groupName,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
        console.log(`[GROUP SEND] ? Falha: ${groupName}`);
      }

      // ??? A fila j? controla o delay de 5-10s - n?o precisa de delay extra aqui
      
    } catch (error: any) {
      const groupName = groupsMetadata[groupId]?.subject || groupId;
      failed++;
      const errorMsg = error.message || 'Erro desconhecido';
      errors.push(`${groupName}: ${errorMsg}`);
      details.failed.push({
        groupId,
        groupName,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
      console.log(`[GROUP SEND] ? Erro: ${groupName} - ${errorMsg}`);
      
      // Delay extra em caso de erro
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    groupIndex++;
  }

  console.log(`[GROUP SEND] Conclu?do: ${sent} enviados, ${failed} falharam`);
  
  return { sent, failed, errors, details };
}

// Fun��o auxiliar para obter sess�es (usado em rotas de debug)
export function getSessions(): Map<string, WhatsAppSession> {
  return sessions;
}

// =========================================================================
// FIX 2026-02-25: Connection health diagnostic (read-only)
// Returns connection state, reconnect attempts, and observability data
// =========================================================================
export function getConnectionHealth(userId?: string): {
  sessions: Array<{
    connectionId: string;
    userId: string;
    isOpen: boolean;
    connectedAt: string | null;
    reconnectAttempts: number;
    hasPendingConnection: boolean;
  }>;
  metrics: typeof waObservability;
  reconnectAttemptsMap: Record<string, { count: number; lastAttempt: string }>;
} {
  const sessionList: Array<{
    connectionId: string;
    userId: string;
    isOpen: boolean;
    connectedAt: string | null;
    reconnectAttempts: number;
    hasPendingConnection: boolean;
  }> = [];

  for (const [connId, session] of sessions) {
    if (userId && session.userId !== userId) continue;
    const attempt = reconnectAttempts.get(connId);
    sessionList.push({
      connectionId: connId,
      userId: session.userId,
      isOpen: session.isOpen || false,
      connectedAt: session.connectedAt ? new Date(session.connectedAt).toISOString() : null,
      reconnectAttempts: attempt?.count || 0,
      hasPendingConnection: pendingConnections.has(connId),
    });
  }

  const reconnectMap: Record<string, { count: number; lastAttempt: string }> = {};
  for (const [key, val] of reconnectAttempts) {
    if (userId) {
      // Only include if this key belongs to the user
      const session = sessions.get(key);
      if (session && session.userId !== userId) continue;
    }
    reconnectMap[key] = {
      count: val.count,
      lastAttempt: new Date(val.lastAttempt).toISOString(),
    };
  }

  return {
    sessions: sessionList,
    metrics: { ...waObservability },
    reconnectAttemptsMap: reconnectMap,
  };
}

export async function disconnectWhatsApp(userId: string, connectionId?: string): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: Bloquear desconex�es para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] disconnectWhatsApp bloqueado para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sess�es do WhatsApp em produ��o n�o ser�o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sess�es em produ��o.');
  }
  
  const lookupKey = connectionId || userId;
  const session = sessions.get(lookupKey);
  if (session?.socket) {
    // Use end() instead of logout() to avoid cascade disconnect
    // logout() sends a revoke command to WhatsApp servers, disconnecting ALL linked devices (phone, PC, etc.)
    // end() only closes this local connection, leaving the phone and other devices connected
    try {
      session.socket.end(undefined);
    } catch (e) {
      console.log(`[DISCONNECT] Error closing socket for ${lookupKey}:`, e);
    }
    sessions.delete(lookupKey);
  }

  let connection;
  if (connectionId) {
    connection = await storage.getConnectionById(connectionId);
  } else {
    connection = await storage.getConnectionByUserId(userId);
  }
  if (connection) {
    await storage.updateConnection(connection.id, {
      isConnected: false,
      qrCode: null,
    });
  }

  // Limpar arquivos de autentica��o para permitir nova conex�o - always use auth_{userId}
  const authPath = path.join(SESSIONS_BASE, `auth_${userId}`);
  await clearAuthFiles(authPath);

  broadcastToUser(userId, { type: "disconnected", connectionId: lookupKey });
}

// ?? Map para rastrear conex?es em andamento do ADMIN (evita m?ltiplas tentativas simult?neas)
interface PendingAdminConnectionEntry {
  promise: Promise<void>;
  startedAt: number;
  distributedLock?: DistributedLockHandle;
  distributedLockRefresh?: NodeJS.Timeout;
}
const pendingAdminConnections = new Map<string, PendingAdminConnectionEntry>();
const ADMIN_PENDING_LOCK_TTL_MS = Math.max(
  Number(process.env.WA_ADMIN_PENDING_LOCK_TTL_MS || PENDING_LOCK_TTL_MS),
  30_000,
);
const ADMIN_CONNECT_OPEN_TIMEOUT_MS = Math.max(
  Number(process.env.WA_ADMIN_CONNECT_OPEN_TIMEOUT_MS || CONNECT_OPEN_TIMEOUT_MS),
  30_000,
);
const WA_REDIS_ADMIN_PENDING_LOCK_PREFIX =
  process.env.WA_REDIS_ADMIN_PENDING_LOCK_PREFIX || "wa:admin:connect:lock:";

function toDistributedAdminPendingLockKey(adminId: string): string {
  return `${WA_REDIS_ADMIN_PENDING_LOCK_PREFIX}${adminId}`;
}

function stopAdminDistributedLockRefresh(
  adminId: string,
  entry?: PendingAdminConnectionEntry,
): void {
  const targetEntry = entry || pendingAdminConnections.get(adminId);
  if (targetEntry?.distributedLockRefresh) {
    clearInterval(targetEntry.distributedLockRefresh);
    targetEntry.distributedLockRefresh = undefined;
  }
}

function releaseDistributedAdminPendingLock(
  adminId: string,
  reason: string,
  entry?: PendingAdminConnectionEntry,
): void {
  const targetEntry = entry || pendingAdminConnections.get(adminId);
  if (!targetEntry?.distributedLock) {
    return;
  }

  const lock = targetEntry.distributedLock;
  targetEntry.distributedLock = undefined;
  stopAdminDistributedLockRefresh(adminId, targetEntry);

  void releaseDistributedLock(lock)
    .then((released) => {
      if (released) {
        console.log(
          `?? [ADMIN PENDING LOCK][REDIS] Released distributed lock for ${adminId.substring(0, 8)}... (${reason})`,
        );
      }
    })
    .catch((err) => {
      console.warn(
        `?? [ADMIN PENDING LOCK][REDIS] Failed to release distributed lock for ${adminId.substring(0, 8)}... (${reason}):`,
        err,
      );
    });
}

function registerDistributedAdminPendingLockRefresh(
  adminId: string,
  entry: PendingAdminConnectionEntry,
  ttlMs: number,
): void {
  if (!entry.distributedLock) {
    return;
  }

  const refreshIntervalMs = Math.max(
    Math.min(Math.floor(ttlMs / 2), WA_REDIS_PENDING_LOCK_REFRESH_MS),
    5_000,
  );

  entry.distributedLockRefresh = setInterval(async () => {
    if (!entry.distributedLock) {
      return;
    }
    const refreshed = await refreshDistributedLock(entry.distributedLock, ttlMs);
    if (!refreshed) {
      console.warn(
        `?? [ADMIN PENDING LOCK][REDIS] Lock refresh lost for ${adminId.substring(0, 8)}...`,
      );
      stopAdminDistributedLockRefresh(adminId, entry);
    }
  }, refreshIntervalMs);
  entry.distributedLockRefresh.unref?.();
}

function clearPendingAdminConnectionLock(adminId: string, reason: string): void {
  const entry = pendingAdminConnections.get(adminId);
  if (entry) {
    stopAdminDistributedLockRefresh(adminId, entry);
    pendingAdminConnections.delete(adminId);
    releaseDistributedAdminPendingLock(adminId, reason, entry);
    console.log(`?? [ADMIN PENDING LOCK] Cleared lock for ${adminId.substring(0, 8)}... reason: ${reason}`);
  }
}

function evictStalePendingAdminLocks(): number {
  let evicted = 0;
  const now = Date.now();
  for (const [adminId, entry] of pendingAdminConnections.entries()) {
    if (now - entry.startedAt > ADMIN_PENDING_LOCK_TTL_MS) {
      console.log(
        `?? [ADMIN PENDING LOCK] STALE_EVICTED: ${adminId.substring(0, 8)}... age=${Math.round(
          (now - entry.startedAt) / 1000,
        )}s > TTL=${Math.round(ADMIN_PENDING_LOCK_TTL_MS / 1000)}s`,
      );
      stopAdminDistributedLockRefresh(adminId, entry);
      releaseDistributedAdminPendingLock(adminId, "stale_evicted", entry);
      pendingAdminConnections.delete(adminId);
      evicted++;
    }
  }
  return evicted;
}

// ?? Map para rastrear tentativas de reconex?o do ADMIN (evita loops infinitos)
interface AdminReconnectAttempt {
  count: number;
  lastAttempt: number;
}
const adminReconnectAttempts = new Map<string, AdminReconnectAttempt>();
const MAX_ADMIN_RECONNECT_ATTEMPTS = 999; // Sessao permanece ativa - reconexao automatica ilimitada
const ADMIN_RECONNECT_COOLDOWN_MS = 30000; // 30 segundos entre ciclos de reconex?o

// ?? Map para rastrear auto-retry ap?s logout do ADMIN
interface AdminLogoutAutoRetry {
  count: number;
  lastAttempt: number;
}
const adminLogoutAutoRetry = new Map<string, AdminLogoutAutoRetry>();
const ADMIN_LOGOUT_AUTO_RETRY_COOLDOWN_MS = 60000; // 60 segundos
const MAX_ADMIN_LOGOUT_AUTO_RETRY = 10; // 10 tentativas automaticas apos logout

export function getSession(userIdOrConnectionId: string): WhatsAppSession | undefined {
  return sessions.get(userIdOrConnectionId);
}

export function getAdminSession(adminId: string): AdminWhatsAppSession | undefined {
  return adminSessions.get(adminId);
}

export async function connectAdminWhatsApp(adminId: string): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: Bloquear conex�es para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] Conex�o Admin WhatsApp bloqueada para admin ${adminId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sess�es do WhatsApp em produ��o n�o ser�o afetadas\n`);
    throw new Error('WhatsApp Admin desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sess�es em produ��o.');
  }

  // ? Evict stale locks before checking.
  evictStalePendingAdminLocks();

  // ?? Verificar se j� existe uma conex�o em andamento
  const existingPendingConnection = pendingAdminConnections.get(adminId);
  if (existingPendingConnection) {
    console.log(`[ADMIN CONNECT] Connection already in progress for admin ${adminId}, waiting...`);
    return existingPendingConnection.promise;
  }

  let distributedLock: DistributedLockHandle | undefined;
  const distributedLockTtlMs = Math.max(
    ADMIN_CONNECT_OPEN_TIMEOUT_MS + WA_REDIS_PENDING_LOCK_EXTRA_MS,
    ADMIN_PENDING_LOCK_TTL_MS,
  );
  if (WA_REDIS_CONNECT_LOCK_ENABLED && isRedisAvailable()) {
    const lockResult = await tryAcquireDistributedLock(
      toDistributedAdminPendingLockKey(adminId),
      distributedLockTtlMs,
    );
    if (lockResult.status === "acquired") {
      distributedLock = lockResult.lock;
      console.log(
        `?? [ADMIN PENDING LOCK][REDIS] Acquired distributed lock for ${adminId.substring(0, 8)}... ttl=${Math.round(
          distributedLockTtlMs / 1000,
        )}s`,
      );
    } else if (lockResult.status === "busy") {
      const remainingSec = Math.max(1, Math.ceil(lockResult.remainingMs / 1000));
      console.log(
        `?? [ADMIN PENDING LOCK][REDIS] Lock busy for ${adminId.substring(0, 8)}... (${remainingSec}s remaining). Skipping duplicate connect attempt.`,
      );
      return;
    }
  }

  // ?? Resetar contador de tentativas quando admin inicia conex�o manualmente
  adminReconnectAttempts.delete(adminId);

  // ?? CR�TICO: Criar e registrar a promise IMEDIATAMENTE para evitar race conditions
  let resolveConnection!: () => void;
  let rejectConnection!: (error: Error) => void;
  let connectionPromiseSettled = false;
  let connectionOpenTimeout: NodeJS.Timeout | undefined;

  const connectionPromise = new Promise<void>((resolve, reject) => {
    resolveConnection = resolve;
    rejectConnection = reject;
  });

  const settleConnectionPromise = (
    mode: "resolve" | "reject",
    reason: string,
    error?: Error,
  ): void => {
    if (connectionPromiseSettled) {
      return;
    }
    connectionPromiseSettled = true;
    if (connectionOpenTimeout) {
      clearTimeout(connectionOpenTimeout);
      connectionOpenTimeout = undefined;
    }
    if (mode === "resolve") {
      console.log(`[ADMIN CONNECT] Connection promise resolved for admin ${adminId.substring(0, 8)}... (${reason})`);
      resolveConnection();
      return;
    }
    const rejectError = error || new Error(`Admin connection failed before open (${reason})`);
    console.log(
      `[ADMIN CONNECT] Connection promise rejected for admin ${adminId.substring(0, 8)}... (${reason}): ${rejectError.message}`,
    );
    rejectConnection(rejectError);
  };

  // Registrar ANTES de qualquer opera��o async
  const pendingEntry: PendingAdminConnectionEntry = {
    promise: connectionPromise,
    startedAt: Date.now(),
    distributedLock,
  };
  pendingAdminConnections.set(adminId, pendingEntry);
  if (pendingEntry.distributedLock) {
    registerDistributedAdminPendingLockRefresh(adminId, pendingEntry, distributedLockTtlMs);
  }
  console.log(`[ADMIN CONNECT] Registered pending connection for admin ${adminId}`);

  // Executar a l�gica de conex�o
  (async () => {
    try {
      // Verificar se j� existe uma sess�o ativa
      const existingSession = adminSessions.get(adminId);
      if (existingSession?.socket) {
        const wsReadyState = (existingSession.socket as any)?.ws?.readyState;
        const isSocketOperational =
          existingSession.socket.user !== undefined &&
          (wsReadyState === undefined || wsReadyState === 1);
        if (isSocketOperational) {
          console.log(`[ADMIN CONNECT] Admin ${adminId} already has an active connected session`);
          clearPendingAdminConnectionLock(adminId, "already_connected");
          settleConnectionPromise("resolve", "already_connected");
          return;
        } else {
          // Sess�o existe mas n�o est� conectada - limpar e recriar
          console.log(
            `[ADMIN CONNECT] Admin ${adminId} has stale session (hasUser=${existingSession.socket.user !== undefined}, wsReadyState=${wsReadyState ?? 'unknown'}), cleaning up...`,
          );
          try {
            existingSession.socket.end(undefined);
          } catch (e) {
            console.log(`[ADMIN CONNECT] Error closing stale socket:`, e);
          }
          adminSessions.delete(adminId);
        }
      }

    let connection = await storage.getAdminWhatsappConnection(adminId);

    if (!connection) {
      connection = await storage.createAdminWhatsappConnection({
        adminId,
        isConnected: false,
      });
    }

    const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${adminId}`);
    await ensureDirExists(adminAuthPath);
    const { state, saveCreds } = await useMultiFileAuthState(adminAuthPath);

    // FIX LID 2025: Cache manual para mapear @lid ? phone number
    // Tentar carregar do banco de dados ao iniciar
    const contactsCache = new Map<string, Contact>();
    
    try {
        // Carregar conversas existentes para popular o cache LID -> Phone
        const conversations = await storage.getAdminConversations(adminId);
        for (const conv of conversations) {
            if (conv.remoteJid && conv.contactNumber) {
                const contact: Contact = {
                    id: conv.remoteJid,
                    phoneNumber: conv.contactNumber,
                    name: conv.contactName || undefined
                };
                
                // Se tivermos o LID salvo em algum lugar (remoteJidAlt?), mapear tamb?m
                // Por enquanto, mapeamos o remoteJid normal
                contactsCache.set(conv.remoteJid, contact);
                contactsCache.set(conv.contactNumber, contact); // Mapear pelo n?mero tamb?m
                
                // Tentar inferir LID se poss?vel ou se tivermos salvo
                // (Futuramente salvar o LID na tabela admin_conversations seria ideal)
            }
        }
        console.log(`[ADMIN CACHE] Pr?-carregados ${conversations.length} contatos do hist?rico`);
    } catch (err) {
        console.error("[ADMIN CACHE] Erro ao pr?-carregar contatos:", err);
    }

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      // -----------------------------------------------------------------------
      // FIX 2026-02-24: WhatsApp rejeitou Platform.WEB (405 error)
      // -----------------------------------------------------------------------
      version: [2, 3000, 1033893291],
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 250,
      // -----------------------------------------------------------------------
      // FIX 2026-02-25: Ignore status@broadcast to reduce noise (Admin socket)
      // -----------------------------------------------------------------------
      shouldIgnoreJid: (jid: string) => jid === 'status@broadcast',
      // -----------------------------------------------------------------------
      // ?? FIX "AGUARDANDO PARA CARREGAR MENSAGEM" (WAITING FOR MESSAGE) - ADMIN
      // -----------------------------------------------------------------------
      getMessage: async (key) => {
        if (!key.id) return undefined;
        
        console.log(`?? [getMessage ADMIN] Baileys solicitou mensagem ${key.id} para retry`);
        
        // Tentar recuperar do cache em mem?ria
        const cached = getCachedMessage(`admin_${adminId}`, key.id);
        if (cached) {
          return cached;
        }
        
        console.log(`?? [getMessage ADMIN] Mensagem ${key.id} n?o encontrada no cache`);
        return undefined;
      },
    });

    adminSessions.set(adminId, {
      socket,
      adminId,
      contactsCache,
    });

    connectionOpenTimeout = setTimeout(() => {
      const currentSession = adminSessions.get(adminId);
      if (currentSession?.socket !== socket || currentSession?.socket?.user) {
        return;
      }
      const timeoutError = new Error(
        `Admin connection did not reach open within ${ADMIN_CONNECT_OPEN_TIMEOUT_MS}ms`,
      );
      console.log(
        `?? [ADMIN CONNECT] OPEN TIMEOUT for admin ${adminId.substring(0, 8)}... � closing socket`,
      );
      clearPendingAdminConnectionLock(adminId, "connect_open_timeout");
      try {
        socket.end(timeoutError);
      } catch (_endErr) {
        // noop
      }
      adminSessions.delete(adminId);
      settleConnectionPromise("reject", "open_timeout", timeoutError);
    }, ADMIN_CONNECT_OPEN_TIMEOUT_MS);
    connectionOpenTimeout.unref?.();

    // Verificar se j? est? conectado ao criar o socket (sess?o restaurada)
    if (socket.user) {
      const phoneNumber = socket.user.id.split(':')[0];
      console.log(`? [ADMIN] Socket criado j? conectado (sess?o restaurada): ${phoneNumber}`);
      
      // For?ar presen?a dispon?vel para receber updates de outros usu?rios
      setTimeout(() => {
        socket.sendPresenceUpdate('available').catch(err => console.error("Erro ao enviar presen?a inicial:", err));
      }, 2000);

      await storage.updateAdminWhatsappConnection(adminId, {
        isConnected: true,
        phoneNumber,
        qrCode: null,
      });
      broadcastToAdmin(adminId, { type: "connected", phoneNumber });
      clearPendingAdminConnectionLock(adminId, "implicit_open");
      settleConnectionPromise("resolve", "implicit_open");
    }

    // Listener para cachear contatos quando Baileys emitir contacts.upsert
    let contactCacheCount = 0;
    socket.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        contactsCache.set(contact.id, contact);
        if (contact.lid) {
          contactsCache.set(contact.lid, contact);
        }
        // Log apenas primeiros 50 contatos para evitar rate limit
        if (contactCacheCount < 50) {
          console.log(`[ADMIN CONTACT CACHE] Added: ${contact.id}`);
          contactCacheCount++;
        }
      }
      // Log resumo final
      if (contacts.length > 0 && contactCacheCount >= 50) {
        console.log(`[ADMIN CONTACT CACHE] Total cached: ${contactsCache.size} contacts (logs suppressed after 50)`);
        contactCacheCount = 51; // Prevenir log repetido
      }
    });

    socket.ev.on("creds.update", saveCreds);

    // -----------------------------------------------------------------------
    // ?? FUN��O: Processar mensagens enviadas pelo ADMIN no WhatsApp
    // -----------------------------------------------------------------------
    // Quando o admin responde direto no WhatsApp (fromMe: true),
    // precisamos salvar essa mensagem no sistema E transcrever �udios
    // -----------------------------------------------------------------------
    async function handleAdminOutgoingMessage(adminId: string, waMessage: WAMessage) {
      const remoteJid = waMessage.key.remoteJid;
      if (!remoteJid) return;
      
      // Filtrar grupos e status
      if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
        console.log(`?? [ADMIN FROM ME] Ignorando mensagem de grupo/status`);
        return;
      }
      
      // Resolver contactNumber
      let contactNumber: string;
      let realRemoteJid = remoteJid;
      
      if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
        const realJid = (waMessage.key as any).remoteJidAlt;
        contactNumber = cleanContactNumber(realJid);
        realRemoteJid = realJid;
        console.log(`?? [ADMIN FROM ME] LID resolvido: ${remoteJid} ? ${realJid}`);
      } else {
        contactNumber = cleanContactNumber(remoteJid);
      }
      
      if (!contactNumber) {
        console.log(`?? [ADMIN FROM ME] N�o foi poss�vel extrair n�mero de: ${remoteJid}`);
        return;
      }
      
      // Extrair texto e m�dia
      let messageText = "";
      let mediaType: string | undefined;
      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;
      
      const msg = waMessage.message;
      
      if (msg?.conversation) {
        messageText = msg.conversation;
      } else if (msg?.extendedTextMessage?.text) {
        messageText = msg.extendedTextMessage.text;
      } else if (msg?.imageMessage) {
        mediaType = "image";
        messageText = msg.imageMessage.caption || "?? Imagem";
        try {
          const buffer = await downloadMediaMessage(waMessage, "buffer", {});
          const mimetype = msg.imageMessage.mimetype || "image/jpeg";
          const result = await uploadMediaToStorage(buffer, mimetype, adminId);
          if (result?.url) {
            mediaUrl = result.url;
            console.log(`? [ADMIN FROM ME] Imagem salva: ${result.url}`);
          }
        } catch (err) {
          console.error("? [ADMIN FROM ME] Erro ao baixar imagem:", err);
        }
      } else if (msg?.audioMessage) {
        mediaType = "audio";
        messageText = "?? �udio"; // Ser� substitu�do pela transcri��o
        try {
          const buffer = await downloadMediaMessage(waMessage, "buffer", {});
          const mimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
          const result = await uploadMediaToStorage(buffer, mimeType, adminId);
          if (result?.url) {
            mediaUrl = result.url;
            mediaMimeType = mimeType;
            console.log(`? [ADMIN FROM ME] �udio salvo: ${buffer.length} bytes (${mimeType})`);
          }
        } catch (err) {
          console.error("? [ADMIN FROM ME] Erro ao baixar �udio:", err);
        }
      } else if (msg?.videoMessage) {
        mediaType = "video";
        messageText = msg.videoMessage.caption || "?? V�deo";
      } else if (msg?.documentMessage) {
        mediaType = "document";
        messageText = `?? ${msg.documentMessage.fileName || "Documento"}`;
      } else {
        // Tipo n�o suportado
        const msgTypes = Object.keys(msg || {});
        if (!msgTypes.includes("protocolMessage")) {
          console.log(`?? [ADMIN FROM ME] Tipo de mensagem n�o suportado:`, msgTypes);
        }
        return;
      }
      
      console.log(`?? [ADMIN FROM ME] Salvando mensagem do admin: ${messageText.substring(0, 50)}...`);
      
      // Buscar/criar conversa
      let conversation;
      try {
        conversation = await storage.getOrCreateAdminConversation(
          adminId,
          contactNumber,
          realRemoteJid,
          waMessage.pushName || undefined
        );
        
        // Salvar mensagem (transcri��o de �udio acontece automaticamente em createAdminMessage)
        const savedMessage = await storage.createAdminMessage({
          conversationId: conversation.id,
          messageId: waMessage.key.id || `msg_${Date.now()}`,
          fromMe: true,
          text: messageText,
          timestamp: new Date(Number(waMessage.messageTimestamp) * 1000),
          status: "sent",
          isFromAgent: false,
          mediaType,
          mediaUrl,
          mediaMimeType,
        });
        
        // Se foi �udio e temos transcri��o, usar o texto transcrito
        if (savedMessage?.text && savedMessage.text !== messageText) {
          console.log(`?? [ADMIN FROM ME] Texto atualizado com transcri��o: ${savedMessage.text.substring(0, 100)}...`);
          messageText = savedMessage.text;
        }
        
        // Atualizar �ltima mensagem da conversa
        await storage.updateAdminConversation(conversation.id, {
          lastMessageText: messageText.substring(0, 255),
          lastMessageTime: new Date(),
        });
        
        console.log(`? [ADMIN FROM ME] Mensagem salva na conversa ${conversation.id}`);
      } catch (error) {
        console.error(`? [ADMIN FROM ME] Erro ao salvar mensagem:`, error);
      }
    }

    // -----------------------------------------------------------------------
    // ??? HANDLER DE PRESEN�A (TYPING/PAUSED) - DETEC��O DE DIGITA��O
    // -----------------------------------------------------------------------
    socket.ev.on("presence.update", async (update) => {
      const { id, presences } = update;
      
      // LOG DE DEBUG PARA DIAGN?STICO (ATIVADO)
      if (!id.includes("@g.us") && !id.includes("@broadcast")) {
         console.log(`??? [PRESENCE RAW] ID: ${id} | Presences: ${JSON.stringify(presences)}`);
      }

      // Verificar se ? um chat individual
      if (id.includes("@g.us") || id.includes("@broadcast")) return;

      // Verificar se temos uma resposta pendente para este chat
      // FIX: O ID que vem no presence.update pode ser um LID (ex: 254635809968349@lid)
      // Precisamos mapear esse LID para o n?mero de telefone real (contactNumber)
      // O pendingAdminResponses usa o contactNumber como chave (ex: 5517991956944)
      
      let contactNumber = cleanContactNumber(id);
      
      // Se for LID, tentar encontrar o n?mero real no cache de contatos
      if (id.includes("@lid")) {
         const contact = contactsCache.get(id);
         if (contact && contact.phoneNumber) {
             contactNumber = cleanContactNumber(contact.phoneNumber);
             console.log(`??? [PRESENCE MAP] Mapeado LID ${id} -> ${contactNumber}`);
         } else {
             // Se n?o achou no cache, tentar buscar no banco (fallback)
             // Mas como ? async, talvez n?o d? tempo. Vamos tentar varrer o pendingAdminResponses
             // para ver se algum remoteJid bate com esse LID? N?o, remoteJid geralmente ? s.whatsapp.net
             
             // TENTATIVA DE RECUPERA??O:
             // Se o ID for LID, e n?o achamos o contactNumber, vamos tentar ver se existe
             // alguma resposta pendente onde o remoteJidAlt seja esse LID
             // OU se s? existe UMA resposta pendente no sistema, assumimos que ? ela (para testes)
             
             if (pendingAdminResponses.size === 1) {
                 contactNumber = pendingAdminResponses.keys().next().value || "";
                 console.log(`??? [PRESENCE GUESS] LID desconhecido ${id}, mas s? h? 1 pendente: ${contactNumber}. Assumindo match.`);
             } else {
                 console.log(`?? [PRESENCE FAIL] N?o foi poss?vel mapear LID ${id} para um n?mero de telefone.`);
             }
         }
      }

      if (!contactNumber) return;

      const pending = pendingAdminResponses.get(contactNumber);
      
      // Se n?o tiver resposta pendente, n?o precisamos fazer nada (n?o estamos esperando para responder)
      if (!pending) return;

      console.log(`??? [PRESENCE MATCH] Update para ${contactNumber} (tem resposta pendente)`);
      console.log(`   Dados: ${JSON.stringify(presences)}`);

      // Encontrar o participante correto (o cliente)
      // Em chats privados, a chave deve conter o n?mero do cliente
      const participantKey = Object.keys(presences).find(key => key.includes(contactNumber));
      
      // FIX: Se n?o encontrar pelo n?mero, pode ser que a chave seja o JID completo ou diferente
      // Vamos tentar pegar qualquer chave que N?O seja o nosso pr?prio n?mero
      let finalKey = participantKey;
      
      if (!finalKey) {
        const myNumber = cleanContactNumber(socket.user?.id);
        const otherKeys = Object.keys(presences).filter(k => !k.includes(myNumber));
        
        if (otherKeys.length > 0) {
          finalKey = otherKeys[0];
        }
      }

      if (!finalKey) {
         console.log(`   ?? [PRESENCE] N?o foi poss?vel identificar o participante alvo. Chaves: ${Object.keys(presences)}`);
         return;
      }

      const presence = presences[finalKey]?.lastKnownPresence;
      
      if (!presence) return;

      // Atualizar presen?a conhecida
      pending.lastKnownPresence = presence;
      pending.lastPresenceUpdate = Date.now();

      console.log(`   ??? [PRESENCE DETECTED] Status: ${presence} | User: ${finalKey}`);

      if (presence === 'composing') {
        console.log(`?? [ADMIN AGENT] Usu?rio ${contactNumber} est? digitando... Estendendo espera.`);
        
        // Se estiver digitando, estender o timeout para aguardar
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        
        // Adicionar 25 segundos de "buffer de digita??o"
        // Isso evita responder enquanto o usu?rio ainda est? escrevendo
        const typingBuffer = 25000; // 25s
        
        pending.timeout = setTimeout(() => {
          console.log(`? [ADMIN AGENT] Timeout de digita??o (25s) expirou para ${contactNumber}. Processando...`);
          void processAdminAccumulatedMessages({ 
            socket, 
            key: contactNumber, 
            generation: pending.generation 
          });
        }, typingBuffer);
        
      } else if (presence === 'paused') {
        console.log(`? [ADMIN AGENT] Usu?rio ${contactNumber} parou de digitar. Retomando espera padr?o (6s).`);
        
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        
        // Voltar para o delay padr?o de 6s
        // Importante: Dar um pequeno delay extra (ex: 6s) para garantir que n?o ? apenas uma pausa breve
        const standardDelay = 6000; 
        
        pending.timeout = setTimeout(() => {
          console.log(`? [ADMIN AGENT] Timeout padr?o (6s) expirou para ${contactNumber} (ap?s pausa). Processando...`);
          void processAdminAccumulatedMessages({ 
            socket, 
            key: contactNumber, 
            generation: pending.generation 
          });
        }, standardDelay);
      } else {
        // Logar outros estados de presen?a para debug (ex: available, unavailable)
        console.log(`?? [ADMIN AGENT] Presen?a atualizada para ${contactNumber}: ${presence}`);
      }
    });

    // -----------------------------------------------------------------------
    // ?? HANDLER DE MENSAGENS DO ADMIN - ATENDIMENTO AUTOMATIZADO
    // -----------------------------------------------------------------------
    socket.ev.on("messages.upsert", async (m) => {
      const message = m.messages[0];
      
      if (!message.message) return;
      
      // -----------------------------------------------------------------------
      // ?? CACHEAR MENSAGEM PARA getMessage() - FIX "AGUARDANDO MENSAGEM" ADMIN
      // -----------------------------------------------------------------------
      if (message.key.id && message.message) {
        cacheMessage(`admin_${adminId}`, message.key.id, message.message);
      }
      
      // ?? FIX TRANSCRI��O: Capturar mensagens enviadas pelo pr�prio admin (fromMe: true)
      // para salvar no banco e transcrever �udios
      if (message.key.fromMe) {
        console.log(`?? [ADMIN] Mensagem enviada pelo admin detectada`);
        try {
          await handleAdminOutgoingMessage(adminId, message);
        } catch (err) {
          console.error("? [ADMIN] Erro ao processar mensagem do admin:", err);
        }
        return; // N�o processar como mensagem recebida
      }
      
      const remoteJid = message.key.remoteJid;
      if (!remoteJid) return;
      
      // Filtrar grupos e status
      if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
        console.log(`?? [ADMIN] Ignorando mensagem de grupo/status`);
        return;
      }
      
      try {
        // Importar dinamicamente para evitar circular dependency
        const { processAdminMessage, getOwnerNotificationNumber } = await import("./adminAgentService");
        
        // -----------------------------------------------------------------------
        // ?? FIX LID 2025: Resolver @lid para n?mero real usando remoteJidAlt
        // -----------------------------------------------------------------------
        let contactNumber: string;
        let realRemoteJid = remoteJid;  // JID real para envio de mensagens
        
        if (remoteJid.includes("@lid") && (message.key as any).remoteJidAlt) {
          const realJid = (message.key as any).remoteJidAlt;
          contactNumber = cleanContactNumber(realJid);
          realRemoteJid = realJid;
          
          console.log(`\n? [ADMIN LID RESOLVIDO] N?mero real encontrado via remoteJidAlt!`);
          console.log(`   LID: ${remoteJid}`);
          console.log(`   JID WhatsApp REAL: ${realJid}`);
          console.log(`   N?mero limpo: ${contactNumber}\n`);
          
          // Salvar mapeamento LID ? n?mero no cache do admin
          contactsCache.set(remoteJid, {
            id: remoteJid,
            name: message.pushName || undefined,
            phoneNumber: realJid,
          });
        } else {
          contactNumber = cleanContactNumber(remoteJid);
        }
        
        if (!contactNumber) {
          console.log(`?? [ADMIN] N?o foi poss?vel extrair n?mero de: ${remoteJid}`);
          return;
        }
        
        // Extrair texto e m?dia da mensagem
        let messageText = "";
        let mediaType: string | undefined;
        let mediaUrl: string | undefined;
        
        const msg = message.message;
        
        if (msg?.conversation) {
          messageText = msg.conversation;
        } else if (msg?.extendedTextMessage?.text) {
          messageText = msg.extendedTextMessage.text;
        } else if (msg?.imageMessage) {
          mediaType = "image";
          messageText = msg.imageMessage.caption || "?? Imagem";
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            const mimetype = msg.imageMessage.mimetype || "image/jpeg";
            // ?? Usar Storage em vez de base64 para reduzir egress
            const result = await uploadMediaToStorage(buffer, mimetype, adminId);
            if (result?.url) {
              mediaUrl = result.url;
              console.log(`? [ADMIN] Imagem salva no Storage: ${result.url}`);
            } else {
              console.warn(`?? [ADMIN] Falha no upload, imagem n�o salva`);
            }
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar imagem:", err);
          }
        } else if (msg?.audioMessage) {
          mediaType = "audio";
          messageText = "?? �udio"; // Texto inicial, ser� substitu�do pela transcri��o
          // ??? Baixar �udio para transcri��o (ser� transcrito em createAdminMessage)
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            const mimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
            // ?? Usar Storage em vez de base64 para reduzir egress
            const result = await uploadMediaToStorage(buffer, mimeType, adminId);
            if (result?.url) {
              mediaUrl = result.url;
              console.log(`? [ADMIN] �udio salvo no Storage: ${buffer.length} bytes (${mimeType})`);
            } else {
              console.warn(`?? [ADMIN] Falha no upload de �udio`);
            }
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar �udio:", err);
          }
        } else if (msg?.videoMessage) {
          mediaType = "video";
          messageText = msg.videoMessage.caption || "?? V?deo";
        } else if (msg?.documentMessage) {
          mediaType = "document";
          messageText = `?? ${msg.documentMessage.fileName || "Documento"}`;
        } else {
          // Suprimir logs de protocolMessage (system messages) para evitar spam
          const msgTypes = Object.keys(msg || {});
          if (!msgTypes.includes("protocolMessage")) {
            console.log(`?? [ADMIN] Tipo de mensagem n?o suportado:`, msgTypes);
          }
          return;
        }
        
        console.log(`\n?? [ADMIN AGENT] ========================================`);
        console.log(`   ?? De: ${contactNumber}`);
        console.log(`   ?? Mensagem: ${messageText.substring(0, 100)}...`);
        console.log(`   ??? M?dia: ${mediaType || "nenhuma"}`);
        console.log(`   ========================================\n`);
        
        // -----------------------------------------------------------------------
        // ?? SALVAR CONVERSA E MENSAGEM NO BANCO DE DADOS
        // -----------------------------------------------------------------------
        let conversation;
        let savedMessage: any = null;
        try {
          // IMPORTANTE: Usar realRemoteJid (n?mero real) para envio de respostas
          conversation = await storage.getOrCreateAdminConversation(
            adminId, 
            contactNumber, 
            realRemoteJid, 
            message.pushName || undefined
          );

          // ?? Tentar buscar foto de perfil se n?o tiver (ass?ncrono para n?o bloquear)
          if (!conversation.contactAvatar) {
             socket.profilePictureUrl(realRemoteJid, 'image')
               .then(url => {
                 if (url) {
                   storage.updateAdminConversation(conversation.id, { contactAvatar: url })
                     .catch(err => console.error(`? [ADMIN] Erro ao salvar avatar:`, err));
                 }
               })
               .catch(() => {}); // Ignorar erro (sem foto/privado)
          }
          
          // Salvar a mensagem recebida (transcri??o de ?udio acontece dentro)
          savedMessage = await storage.createAdminMessage({
            conversationId: conversation.id,
            messageId: message.key.id || `msg_${Date.now()}`,
            fromMe: false,
            text: messageText,
            timestamp: new Date(),
            status: "received",
            isFromAgent: false,
            mediaType,
            mediaUrl,
          });
          
          // ?? Se foi ?udio e temos transcri??o, usar o texto transcrito
          if (savedMessage?.text && savedMessage.text !== messageText) {
            console.log(`[ADMIN] ?? Texto atualizado com transcri??o: ${savedMessage.text.substring(0, 100)}...`);
            messageText = savedMessage.text;
          }
          
          // Atualizar ?ltima mensagem da conversa
          await storage.updateAdminConversation(conversation.id, {
            lastMessageText: messageText.substring(0, 255),
            lastMessageTime: new Date(),
          });
          
          console.log(`?? [ADMIN] Mensagem salva na conversa ${conversation.id}`);
        } catch (dbError) {
          console.error(`? [ADMIN] Erro ao salvar mensagem no banco:`, dbError);
          // Continuar processamento mesmo com erro no banco
        }
        
        // -----------------------------------------------------------------------
        // ?? VERIFICAR SE AGENTE EST? HABILITADO PARA ESTA CONVERSA
        // -----------------------------------------------------------------------
        if (conversation) {
          const isAgentEnabled = await storage.isAdminAgentEnabledForConversation(conversation.id);
          console.log(`?? [ADMIN] Status do agente para ${contactNumber}: ${isAgentEnabled ? '? ATIVO' : '? DESATIVADO'}`);
          
          if (!isAgentEnabled) {
            console.log(`?? [ADMIN] Agente pausado para conversa ${conversation.id} (${contactNumber}) - Ignorando mensagem.`);
            return;
          }
        } else {
          console.warn(`?? [ADMIN] Objeto 'conversation' indefinido para ${contactNumber}. Verifica??o de status ignorada (Risco de resposta indesejada).`);
        }
        
        // Verificar se ? mensagem para atendimento automatizado
        const adminAgentEnabled = await storage.getSystemConfig("admin_agent_enabled");
        
        if (adminAgentEnabled?.valor !== "true") {
          console.log(`?? [ADMIN] Agente admin desativado, n?o processando`);
          return;
        }
        
        // Para m?dias (ex: comprovante) processar imediatamente.
        // Para textos (inclusive v?rias mensagens em linhas separadas), acumular e responder uma vez.
        // ?UDIOS: Tratar como TEXTO pois s?o transcritos - mesmas regras de acumula??o, delay, trigger
        // IMAGENS: Processar imediatamente pois podem ser comprovantes de pagamento
        const shouldAccumulate = !mediaType || mediaType === 'audio';
        
        if (shouldAccumulate) {
          // ?udios e textos usam o sistema de acumula??o
          // Isso garante: tempo de resposta, delay humanizado, verifica??o de trigger
          await scheduleAdminAccumulatedResponse({
            socket,
            remoteJid: realRemoteJid,  // IMPORTANTE: Usar JID real para envio
            contactNumber,
            messageText,  // Para ?udios, j? ? o texto transcrito
            conversationId: conversation?.id,
          });
          return;
        }

        // Para IMAGENS APENAS:
        // - N?o acumular (processar imediatamente)
        // - N?o verificar trigger (podem ser comprovantes)
        console.log(`?? [ADMIN] M?dia ${mediaType} - processamento imediato (poss?vel comprovante)`);
        
        const response = await processAdminMessage(contactNumber, messageText, mediaType, mediaUrl, true);

        if (response && response.text) {
          const cfg = await getAdminAgentRuntimeConfig();
          const typingDelay = randomBetween(cfg.typingDelayMinMs, cfg.typingDelayMaxMs);
          await new Promise(resolve => setTimeout(resolve, typingDelay));

          const parts = splitMessageHumanLike(response.text, cfg.messageSplitChars);
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
              const interval = randomBetween(cfg.messageIntervalMinMs, cfg.messageIntervalMaxMs);
              await new Promise(resolve => setTimeout(resolve, interval));
            }
            // ??? ANTI-BLOQUEIO: Usar fila do Admin
            await sendWithQueue('ADMIN_AGENT', `m?dia resposta parte ${i+1}`, async () => {
              await socket.sendMessage(realRemoteJid, { text: parts[i] });  // IMPORTANTE: Usar JID real
            });
          }
          console.log(`? [ADMIN AGENT] Resposta enviada para ${contactNumber}`);
          
          // ?? Salvar resposta do agente no banco de dados
          if (conversation?.id) {
            try {
              await storage.createAdminMessage({
                conversationId: conversation.id,
                messageId: `agent_media_${Date.now()}`,
                fromMe: true,
                text: response.text,
                timestamp: new Date(),
                status: "sent",
                isFromAgent: true,
              });
              
              await storage.updateAdminConversation(conversation.id, {
                lastMessageText: response.text.substring(0, 255),
                lastMessageTime: new Date(),
              });
              
              console.log(`?? [ADMIN AGENT] Resposta (m?dia) salva na conversa ${conversation.id}`);
            } catch (dbError) {
              console.error(`? [ADMIN AGENT] Erro ao salvar resposta no banco:`, dbError);
            }
          }
        }

        if (response && response.actions?.notifyOwner) {
          const ownerNumber = await getOwnerNotificationNumber();
          const ownerJid = `${ownerNumber}@s.whatsapp.net`;

          const notificationText = `?? *NOTIFICA??O DE PAGAMENTO*\n\n?? Cliente: ${contactNumber}\n? ${new Date().toLocaleString("pt-BR")}\n\n?? Verificar comprovante e liberar conta`;
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'notifica??o pagamento m?dia', async () => {
            await socket.sendMessage(ownerJid, { text: notificationText });
          });
          console.log(`?? [ADMIN AGENT] Notifica??o enviada para ${ownerNumber}`);

          if (mediaType === "image" && mediaUrl) {
            try {
              const base64Data = mediaUrl.split(",")[1];
              const buffer = Buffer.from(base64Data, "base64");
              // ??? ANTI-BLOQUEIO
              await sendWithQueue('ADMIN_AGENT', 'comprovante imagem', async () => {
                await socket.sendMessage(ownerJid, {
                  image: buffer,
                  caption: `?? Comprovante do cliente ${contactNumber}`,
                });
              });
            } catch (err) {
              console.error("[ADMIN AGENT] Erro ao encaminhar comprovante:", err);
            }
          }
        }
        
        // ?? Enviar m?dias se houver (para handler de m?dia)
        if (response && response.mediaActions && response.mediaActions.length > 0) {
          console.log(`?? [ADMIN AGENT MEDIA] Enviando ${response.mediaActions.length} m?dia(s)...`);
          console.log(`?? [ADMIN AGENT MEDIA] JID de destino: ${realRemoteJid}`);
          
          for (const action of response.mediaActions) {
            if (action.mediaData) {
              try {
                const media = action.mediaData;
                console.log(`?? [ADMIN AGENT MEDIA] ========================================`);
                console.log(`?? [ADMIN AGENT MEDIA] Preparando envio de m?dia:`);
                console.log(`   - Nome: ${media.name}`);
                console.log(`   - Tipo: ${media.mediaType}`);
                console.log(`   - MimeType: ${media.mimeType}`);
                console.log(`   - URL: ${media.storageUrl}`);
                
                const mediaBuffer = await downloadMediaAsBuffer(media.storageUrl);
                
                if (mediaBuffer) {
                  console.log(`?? [ADMIN AGENT MEDIA] Buffer baixado: ${mediaBuffer.length} bytes`);
                  
                  let sendResult: any;
                  
                  switch (media.mediaType) {
                    case 'image':
                      console.log(`?? [ADMIN AGENT MEDIA] Enviando como IMAGEM...`);
                      // ??? ANTI-BLOQUEIO
                      sendResult = await sendWithQueue('ADMIN_AGENT', 'm?dia handler imagem', async () => {
                        return await socket.sendMessage(realRemoteJid, {
                          image: mediaBuffer,
                          caption: media.caption || undefined,
                        });
                      });
                      break;
                    case 'audio':
                      console.log(`?? [ADMIN AGENT MEDIA] Enviando como ?UDIO PTT...`);
                      // ??? ANTI-BLOQUEIO
                      try {
                        sendResult = await sendWithQueue('ADMIN_AGENT', 'm?dia handler ?udio', async () => {
                          return await socket.sendMessage(realRemoteJid, {
                            audio: mediaBuffer,
                            mimetype: media.mimeType || 'audio/ogg; codecs=opus',
                            ptt: true,
                          });
                        });
                      } catch (audioErr: any) {
                        console.log(`?? [ADMIN AGENT MEDIA] Erro ao enviar como PTT, tentando como audio normal...`);
                        console.log(`   Erro: ${audioErr.message}`);
                        // ??? ANTI-BLOQUEIO
                        sendResult = await sendWithQueue('ADMIN_AGENT', 'm?dia handler ?udio fallback', async () => {
                          return await socket.sendMessage(realRemoteJid, {
                            audio: mediaBuffer,
                            mimetype: 'audio/mpeg',
                          });
                        });
                      }
                      break;
                    case 'video':
                      console.log(`?? [ADMIN AGENT MEDIA] Enviando como V?DEO...`);
                      // ??? ANTI-BLOQUEIO
                      sendResult = await sendWithQueue('ADMIN_AGENT', 'm?dia handler v?deo', async () => {
                        return await socket.sendMessage(realRemoteJid, {
                          video: mediaBuffer,
                          caption: media.caption || undefined,
                        });
                      });
                      break;
                    case 'document':
                      console.log(`?? [ADMIN AGENT MEDIA] Enviando como DOCUMENTO...`);
                      // ??? ANTI-BLOQUEIO
                      sendResult = await sendWithQueue('ADMIN_AGENT', 'm?dia handler documento', async () => {
                        return await socket.sendMessage(realRemoteJid, {
                          document: mediaBuffer,
                          fileName: media.fileName || media.name || 'document',
                          mimetype: media.mimeType || 'application/octet-stream',
                        });
                      });
                      break;
                    default:
                      console.log(`?? [ADMIN AGENT MEDIA] Tipo de m?dia n?o suportado: ${media.mediaType}`);
                  }
                  
                  if (sendResult) {
                    console.log(`? [ADMIN AGENT MEDIA] M?dia ${media.name} enviada com sucesso!`);
                    console.log(`   - Message ID: ${sendResult.key?.id || 'N/A'}`);
                    console.log(`   - Status: ${sendResult.status || 'N/A'}`);
                  } else {
                    console.log(`?? [ADMIN AGENT MEDIA] sendMessage retornou null/undefined para ${media.name}`);
                  }
                } else {
                  console.log(`? [ADMIN AGENT MEDIA] Falha ao baixar m?dia: buffer vazio`);
                }
              } catch (mediaError: any) {
                console.error(`? [ADMIN AGENT MEDIA] Erro ao enviar m?dia ${action.media_name}:`);
                console.error(`   - Mensagem: ${mediaError.message}`);
                console.error(`   - Stack: ${mediaError.stack?.substring(0, 300)}`);
              }
              await new Promise(r => setTimeout(r, 500));
            } else {
              console.log(`?? [ADMIN AGENT MEDIA] action.mediaData ? null para ${action.media_name}`);
            }
          }
          console.log(`?? [ADMIN AGENT MEDIA] ========================================`);
        }

        // ?? Desconectar WhatsApp se solicitado (para handler de m?dia)
        if (response && response.actions?.disconnectWhatsApp) {
          try {
            const { getClientSession } = await import("./adminAgentService");
            const clientSession = getClientSession(contactNumber);
            
            if (clientSession?.userId) {
              console.log(`?? [ADMIN AGENT MEDIA] Desconectando WhatsApp do usu?rio ${clientSession.userId}...`);
              await disconnectWhatsApp(clientSession.userId);
              // ??? ANTI-BLOQUEIO
              await sendWithQueue('ADMIN_AGENT', 'desconex?o m?dia', async () => {
                await socket.sendMessage(realRemoteJid, { text: "Pronto! ?? Seu WhatsApp foi desconectado. Quando quiser reconectar, ? s? me avisar!" });
              });
            } else {
              // ??? ANTI-BLOQUEIO
              await sendWithQueue('ADMIN_AGENT', 'desconex?o n?o encontrada m?dia', async () => {
                await socket.sendMessage(realRemoteJid, { text: "N?o encontrei uma conex?o ativa para desconectar." });
              });
            }
          } catch (disconnectError) {
            console.error("? [ADMIN AGENT MEDIA] Erro ao desconectar WhatsApp:", disconnectError);
          }
        }
        
      } catch (error) {
        console.error(`? [ADMIN AGENT] Erro ao processar mensagem:`, error);
      }
    });

    socket.ev.on("connection.update", async (update) => {
      const { connection: connStatus, lastDisconnect, qr } = update;

      if (qr) {
        const qrCodeDataUrl = await QRCode.toDataURL(qr);
        await storage.updateAdminWhatsappConnection(adminId, {
          qrCode: qrCodeDataUrl,
        });
        broadcastToAdmin(adminId, { type: "qr", qr: qrCodeDataUrl });
      }

      // Estado "connecting" - quando o QR Code foi escaneado e est� conectando
      if (connStatus === "connecting") {
        console.log(`[ADMIN] Admin ${adminId} is connecting...`);
        broadcastToAdmin(adminId, { type: "connecting" });
      }

      if (connStatus === "open") {
        // ? CONSIST�NCIA: Resetar tentativas quando conecta
        const phoneNumber = socket.user?.id.split(":")[0];
        console.log(`? [ADMIN] WhatsApp conectado: ${phoneNumber}`);
        
        // For�ar presen�a dispon�vel
        socket.sendPresenceUpdate('available').catch(err => console.error("[ADMIN] Erro ao enviar presen�a:", err));
        
        // Resetar tentativas de reconex�o e limpar pendentes
        adminReconnectAttempts.delete(adminId);
        clearPendingAdminConnectionLock(adminId, "conn_open");
        settleConnectionPromise("resolve", "conn_open");
        
        await storage.updateAdminWhatsappConnection(adminId, {
          isConnected: true,
          phoneNumber,
          qrCode: null,
        });

        const session = adminSessions.get(adminId);
        if (session) {
          session.phoneNumber = phoneNumber;
          session.lastHeartbeat = Date.now();
          session.connectionHealth = 'healthy';
          session.consecutiveDisconnects = 0;
        }

        broadcastToAdmin(adminId, { type: "connected", phoneNumber });

        // ??? SESSION STABILITY - Start heartbeat mechanism
        startAdminHeartbeat(adminId);
      }

      if (connStatus === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const errorMessage = (lastDisconnect?.error as any)?.message;

        // ??? GUARD CONTRA SOCKET STALE
        const currentSession = adminSessions.get(adminId);
        if (currentSession?.socket !== socket) {
          console.log(`[ADMIN CONNECTION CLOSE] ??? STALE SOCKET IGNORED - Admin ${adminId.substring(0, 8)}...`);
          return;
        }

        // ??? SESSION STABILITY - Update consecutive disconnects counter
        if (currentSession) {
          currentSession.consecutiveDisconnects = (currentSession.consecutiveDisconnects || 0) + 1;
          currentSession.connectionHealth = 'unhealthy';
          console.log(`[ADMIN DISCONNECT] Admin ${adminId} disconnected. StatusCode: ${statusCode}, consecutive disconnects: ${currentSession.consecutiveDisconnects}`);
        }

        // Stop heartbeat
        stopAdminHeartbeat(adminId);

        // Sempre deletar a sess�o primeiro
        adminSessions.delete(adminId);
        clearPendingAdminConnectionLock(adminId, "conn_close");
        settleConnectionPromise(
          "reject",
          "conn_close",
          new Error(
            `Admin connection closed (status=${statusCode ?? "unknown"}${
              errorMessage ? `, message=${errorMessage}` : ""
            })`,
          ),
        );

        // Atualizar banco de dados
        await storage.updateAdminWhatsappConnection(adminId, {
          isConnected: false,
          qrCode: null,
        });

        // Verificar limite de tentativas de reconex�o
        const now = Date.now();
        let attempt = adminReconnectAttempts.get(adminId) || { count: 0, lastAttempt: 0 };
        
        // Se passou mais de 30 segundos desde o �ltimo ciclo, resetar contador
        if (now - attempt.lastAttempt > ADMIN_RECONNECT_COOLDOWN_MS) {
          attempt = { count: 0, lastAttempt: now };
        }

        if (shouldReconnect) {
          attempt.count++;
          attempt.lastAttempt = now;
          adminReconnectAttempts.set(adminId, attempt);

          if (attempt.count <= MAX_ADMIN_RECONNECT_ATTEMPTS) {
            console.log(`[ADMIN] Reconnecting in 5s... (attempt ${attempt.count}/${MAX_ADMIN_RECONNECT_ATTEMPTS})`);
            if (attempt.count === 1) {
              broadcastToAdmin(adminId, { type: "disconnected" });
            }
            setTimeout(() => connectAdminWhatsApp(adminId).catch(console.error), 5000);
          } else {
            console.log(`[ADMIN] Max reconnect attempts reached. Waiting for admin action.`);
            broadcastToAdmin(adminId, { type: "disconnected", reason: "max_attempts" });
            adminReconnectAttempts.delete(adminId);
            await storage.updateAdminWhatsappConnection(adminId, { qrCode: null });
          }
        } else {
          // Foi logout
          console.log(`[ADMIN] Admin logged out, clearing auth files...`);
          
          const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${adminId}`);
          await clearAuthFiles(adminAuthPath);

          broadcastToAdmin(adminId, { type: "disconnected", reason: "logout" });
          adminReconnectAttempts.delete(adminId);

          // ?? AUTO-RETRY AP�S LOGOUT
          const hasLiveClient = adminWsClients.has(adminId);
          const retryState = adminLogoutAutoRetry.get(adminId) || { count: 0, lastAttempt: 0 };

          if (now - retryState.lastAttempt > ADMIN_LOGOUT_AUTO_RETRY_COOLDOWN_MS) {
            retryState.count = 0;
          }

          if (hasLiveClient && retryState.count < MAX_ADMIN_LOGOUT_AUTO_RETRY) {
            retryState.count++;
            retryState.lastAttempt = now;
            adminLogoutAutoRetry.set(adminId, retryState);
            console.log(`[ADMIN LOGOUT AUTO-RETRY] Starting auto-retry...`);
            setTimeout(() => connectAdminWhatsApp(adminId).catch(console.error), 750);
          } else {
            if (retryState.count >= MAX_ADMIN_LOGOUT_AUTO_RETRY) {
              adminLogoutAutoRetry.delete(adminId);
            }
          }
        }
      }
    });
  } catch (error) {
    console.error(`Error connecting admin ${adminId} WhatsApp:`, error);
    clearPendingAdminConnectionLock(adminId, "connect_error");
    settleConnectionPromise(
      "reject",
      "connect_error",
      error instanceof Error ? error : new Error(String(error)),
    );
  }
})(); // Fechar a IIFE

  return connectionPromise;
}

export async function disconnectAdminWhatsApp(adminId: string): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: Bloquear desconex�es para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] disconnectAdminWhatsApp bloqueado para admin ${adminId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sess�es do WhatsApp em produ��o n�o ser�o afetadas\n`);
    throw new Error('WhatsApp Admin desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sess�es em produ��o.');
  }
  
  const session = adminSessions.get(adminId);
  if (session?.socket) {
    // Use end() instead of logout() to avoid cascade disconnect
    // logout() sends a revoke command to WhatsApp servers, disconnecting ALL linked devices
    // end() only closes this local server connection
    try {
      session.socket.end(undefined);
    } catch (e) {
      console.log(`[DISCONNECT] Error closing admin socket for ${adminId}:`, e);
    }
    adminSessions.delete(adminId);
  }
  clearPendingAdminConnectionLock(adminId, "manual_disconnect");

  const connection = await storage.getAdminWhatsappConnection(adminId);
  if (connection) {
    await storage.updateAdminWhatsappConnection(adminId, {
      isConnected: false,
      qrCode: null,
    });
  }

  // Limpar arquivos de autentica��o para permitir nova conex�o
  const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${adminId}`);
  await clearAuthFiles(adminAuthPath);

  broadcastToAdmin(adminId, { type: "disconnected" });
}

export async function sendWelcomeMessage(userPhone: string): Promise<void> {
  try {
    console.log(`[WELCOME] Iniciando envio de mensagem de boas-vindas para ${userPhone}`);

    // Obter admin (assumindo que h� apenas um admin owner)
    const allAdmins = await storage.getAllAdmins();
    const adminUser = allAdmins.find(a => a.role === 'owner');

    if (!adminUser) {
      console.log('[WELCOME] Admin n�o encontrado');
      return;
    }

    console.log(`[WELCOME] Admin encontrado: ${adminUser.id}`);

    // ? PRIORIDADE: Verificar config do painel de notifica��es (admin_notification_config)
    const notifConfig = await storage.getAdminNotificationConfig?.(adminUser.id);
    
    let messageText = '';
    let aiEnabled = false;
    let aiPrompt = '';
    
    if (notifConfig && notifConfig.welcome_message_enabled) {
      // Usar varia��es do painel de notifica��es
      const variations = notifConfig.welcome_message_variations;
      if (Array.isArray(variations) && variations.length > 0) {
        // Escolher varia��o aleat�ria
        messageText = variations[Math.floor(Math.random() * variations.length)];
        aiEnabled = notifConfig.welcome_message_ai_enabled ?? false;
        aiPrompt = notifConfig.welcome_message_ai_prompt || '';
        console.log(`[WELCOME] Usando config do painel de notifica��es (${variations.length} varia��es)`);
      }
    }
    
    // Fallback: config do sistema antigo
    if (!messageText) {
      const enabledConfig = await storage.getSystemConfig('welcome_message_enabled');
      const messageConfig = await storage.getSystemConfig('welcome_message_text');
      
      if (!enabledConfig || enabledConfig.valor !== 'true') {
        console.log('[WELCOME] Mensagem de boas-vindas desabilitada');
        return;
      }
      
      if (!messageConfig || !messageConfig.valor) {
        console.log('[WELCOME] Mensagem de boas-vindas n�o configurada');
        return;
      }
      
      messageText = messageConfig.valor;
      console.log('[WELCOME] Usando config do sistema legado');
    }

    // Substituir vari�veis
    messageText = messageText.replace(/\{\{name\}\}/g, '').replace(/\{nome\}/g, '').trim();

    // Aplicar varia��o IA se habilitado
    if (aiEnabled && aiPrompt) {
      try {
        const { applyAIVariation } = await import('./notificationSchedulerService');
        messageText = await applyAIVariation(messageText, aiPrompt, '');
        console.log('[WELCOME] Varia��o IA aplicada');
      } catch (aiError) {
        console.error('[WELCOME] Erro ao aplicar varia��o IA:', aiError);
        // Continua com a mensagem original
      }
    }

    // Verificar se admin tem WhatsApp conectado
    const adminConnection = await storage.getAdminWhatsappConnection(adminUser.id);

    if (!adminConnection || !adminConnection.isConnected) {
      console.log('[WELCOME] Admin WhatsApp n�o conectado');
      return;
    }

    console.log('[WELCOME] Admin WhatsApp conectado, procurando sess�o...');

    let adminSession = adminSessions.get(adminUser.id);

    // Se a sess�o n�o existe, tentar restaur�-la
    if (!adminSession || !adminSession.socket) {
      console.log('[WELCOME] Admin WhatsApp session n�o encontrada, tentando restaurar...');
      try {
        await connectAdminWhatsApp(adminUser.id);
        adminSession = adminSessions.get(adminUser.id);

        if (!adminSession || !adminSession.socket) {
          console.log('[WELCOME] Falha ao restaurar sess�o do admin');
          return;
        }

        console.log('[WELCOME] Sess�o do admin restaurada com sucesso');
      } catch (restoreError) {
        console.error('[WELCOME] Erro ao restaurar sess�o do admin:', restoreError);
        return;
      }
    }

    console.log('[WELCOME] Sess�o encontrada, enviando mensagem...');

    // Formatar n�mero para envio (remover + e adicionar @s.whatsapp.net)
    const formattedNumber = `${cleanContactNumber(userPhone) || userPhone.replace('+', '')}@${DEFAULT_JID_SUFFIX}`;

    // ? ANTI-BLOQUEIO: Enviar via fila
    await sendWithQueue('ADMIN_AGENT', 'credenciais welcome', async () => {
      await adminSession!.socket!.sendMessage(formattedNumber, {
        text: messageText,
      });
    });

    // ? Registrar log na tabela de notifica��es
    try {
      await storage.createAdminNotificationLog?.({
        adminId: adminUser.id,
        userId: null as any,
        notificationType: 'welcome',
        recipientPhone: userPhone,
        recipientName: '',
        messageSent: messageText,
        messageOriginal: messageText,
        status: 'sent',
        errorMessage: null as any,
        metadata: { source: notifConfig?.welcome_message_enabled ? 'notification_panel' : 'system_config' },
      });
    } catch (logError) {
      console.error('[WELCOME] Erro ao registrar log:', logError);
    }

    console.log(`[WELCOME] ? Mensagem de boas-vindas enviada com sucesso para ${userPhone}`);
  } catch (error) {
    console.error('[WELCOME] ? Erro ao enviar mensagem de boas-vindas:', error);
    // N�o lan�a erro para n�o bloquear o cadastro
  }
}

// =========================================================================
// ?? GRACEFUL SHUTDOWN: Close all WhatsApp sockets on SIGTERM (deploy)
// This ensures clean disconnects so the next instance restores faster.
// =========================================================================
let _isShuttingDown = false;
process.once('SIGTERM', async () => {
  if (_isShuttingDown) return;
  _isShuttingDown = true;
  console.log('[SHUTDOWN] SIGTERM received - closing all WhatsApp sessions gracefully...');
  const startTime = Date.now();
  let closed = 0;
  for (const [connId, session] of sessions) {
    try {
      if (session.socket) {
        session.socket.end(undefined);
        closed++;
      }
    } catch (e) {
      // ignore per-socket errors during shutdown
    }
  }
  console.log(`[SHUTDOWN] Closed ${closed} WhatsApp sockets in ${Date.now() - startTime}ms`);
});

export async function restoreExistingSessions(): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: N?o restaurar sess?es para evitar conflito com produ??o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log("\n?? [DEV MODE] SKIP_WHATSAPP_RESTORE=true - Pulando restaura??o de sess?es WhatsApp");
    console.log("   ?? Isso evita conflitos com sess?es ativas no Railway/produ??o");
    console.log("   ?? Para conectar WhatsApp em dev, remova SKIP_WHATSAPP_RESTORE do .env\n");
    return;
  }
  
  try {
    _isRestoringInProgress = true;
    _restoreStartedAt = Date.now();
    console.log("Checking for existing WhatsApp connections...");
    // Multi-connection: Restore ALL connections (each gets its own socket)
    const connections = await storage.getAllConnections();

    // ========================================================================
    // DISK SCAN: Find ALL auth dirs with files and map them to users
    // Auth dirs can be named auth_{userId} OR auth_{connectionId} (legacy)
    // ========================================================================
    const connIdToUserId = new Map<string, string>();
    const userConnectionMap = new Map<string, typeof connections>();
    for (const conn of connections) {
      if (!conn.userId) continue;
      connIdToUserId.set(conn.id, conn.userId);
      const existing = userConnectionMap.get(conn.userId) || [];
      existing.push(conn);
      userConnectionMap.set(conn.userId, existing);
    }

    // Scan disk for ALL auth_* dirs that have files
    // MULTI-CANAL: Track auth both per-userId AND per-connectionId
    const authDirsWithFiles = new Map<string, string>(); // userId -> actual auth dir path
    const authDirsByConnId = new Map<string, string>(); // connectionId -> actual auth dir path
    try {
      const entries = await fs.readdir(SESSIONS_BASE);
      for (const entry of entries) {
        if (!entry.startsWith('auth_')) continue;
        const dirPath = path.join(SESSIONS_BASE, entry);
        try {
          const files = await fs.readdir(dirPath);
          if (files.length === 0) continue; // Empty dir, skip
          
          const id = entry.replace('auth_', '');
          
          // Check if this ID is a userId directly
          if (userConnectionMap.has(id)) {
            // Direct userId match � use this path (highest priority)
            authDirsWithFiles.set(id, dirPath);
            console.log(`[RESTORE] Found auth_${id.substring(0, 8)}... (userId, ${files.length} files)`);
          } else {
            // Check if this ID is a connectionId
            const mappedUserId = connIdToUserId.get(id);
            if (mappedUserId) {
              // ConnectionId match � store per-connection auth
              authDirsByConnId.set(id, dirPath);
              // Also set user-level fallback if not already set
              if (!authDirsWithFiles.has(mappedUserId)) {
                authDirsWithFiles.set(mappedUserId, dirPath);
              }
              console.log(`[RESTORE] Found auth_${id.substring(0, 8)}... (connectionId ? user ${mappedUserId.substring(0, 8)}, ${files.length} files)`);
            }
          }
        } catch (e) {
          // Can't read dir, skip
        }
      }
      console.log(`[RESTORE] Total users with auth files on disk: ${authDirsWithFiles.size}, per-connection auth dirs: ${authDirsByConnId.size}`);
    } catch (scanErr) {
      console.error(`[RESTORE] Error scanning sessions dir:`, scanErr);
    }

    // ========================================================================
    // RESTORE: ALL connections with valid auth (MULTI-CANAL ready)
    // Each connection that has auth files on disk gets restored.
    // ========================================================================
    const restoredConnIds = new Set<string>();

    const toMillis = (value: unknown): number => {
      if (!value) return 0;
      const parsed = new Date(value as any).getTime();
      return Number.isFinite(parsed) ? parsed : 0;
    };

    // Global priority:
    // 1) currently connected in DB
    // 2) recently updated connections
    // 3) AI-enabled and primary connections
    // 4) newer records first
    const sortedConnections: typeof connections = connections
      .filter((conn) => !!conn.userId)
      .sort((a, b) => {
        if (a.isConnected && !b.isConnected) return -1;
        if (!a.isConnected && b.isConnected) return 1;

        const aUpdated = toMillis(a.updatedAt);
        const bUpdated = toMillis(b.updatedAt);
        if (aUpdated !== bUpdated) return bUpdated - aUpdated;

        if (a.aiEnabled && !b.aiEnabled) return -1;
        if (!a.aiEnabled && b.aiEnabled) return 1;

        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;

        const aCreated = toMillis(a.createdAt);
        const bCreated = toMillis(b.createdAt);
        return bCreated - aCreated;
      });

    // ========================================================================
    // PARALLEL BATCH RESTORE: Connect sessions in batches to minimize downtime
    // ========================================================================
    const BATCH_SIZE = RESTORE_BATCH_SIZE;
    const BATCH_DELAY_MS = RESTORE_BATCH_DELAY_MS;
    let restoredCount = 0;
    let skippedCount = 0;
    let noAuthCount = 0;
    let dormantSkipped = 0;
    const toRestore: Array<{ userId: string; connectionId: string }> = [];

    // ========================================================================
    // FIX 2026-02-25: DEDUPLICATE AUTH SCOPES
    // Multiple connectionIds can share the same auth directory (auth_userId).
    // If we restore ALL of them simultaneously, they fight for the same
    // WhatsApp session causing 440 (connectionReplaced) infinite loops.
    // Solution: For connections sharing the same auth scope, only restore
    // the FIRST one (highest priority due to sort: connected > primary > oldest).
    // ========================================================================
    const restoredAuthScopes = new Set<string>(); // Track which auth dirs are already being restored

    for (const connection of sortedConnections) {
      if (!connection.userId) continue;

      // Skip if this specific connection was already queued
      if (restoredConnIds.has(connection.id)) {
        skippedCount++;
        continue;
      }

      const updatedAtMs = connection.updatedAt
        ? new Date(connection.updatedAt as any).getTime()
        : 0;
      const isRecentlyUpdated =
        Number.isFinite(updatedAtMs) &&
        updatedAtMs > 0 &&
        Date.now() - updatedAtMs <= RESTORE_RECENT_GRACE_MS;

      // Keep startup restore focused on connections that were active/recent.
      if (RESTORE_CONNECTED_ONLY && !connection.isConnected && !isRecentlyUpdated) {
        dormantSkipped++;
        continue;
      }

      // MULTI-CANAL: Check auth files per connectionId first, then fallback to userId
      const hasOwnAuth = authDirsByConnId.has(connection.id);
      const hasUserAuth = authDirsWithFiles.has(connection.userId);
      const hasAuthFiles = hasOwnAuth || hasUserAuth;
      
      if (hasAuthFiles) {
        // Determine which auth scope (directory) this connection will use
        const authScope = hasOwnAuth
          ? authDirsByConnId.get(connection.id)!
          : authDirsWithFiles.get(connection.userId)!;

        // DEDUP: If another connection already claimed this auth scope, skip
        if (restoredAuthScopes.has(authScope)) {
          waObservability.restoreDedupSkipped++;
          console.log(`[RESTORE] ?? DEDUP: conn ${connection.id.substring(0, 8)} skipped � auth scope already claimed by another connection (prevents 440 conflict)`);
          // Mark as disconnected to avoid stale isConnected=true in DB
          await storage.updateConnection(connection.id, { isConnected: false, qrCode: null });
          skippedCount++;
          continue;
        }

        restoredAuthScopes.add(authScope);
        restoredConnIds.add(connection.id);
        toRestore.push({ userId: connection.userId, connectionId: connection.id });
      } else if (connection.isConnected) {
        console.log(`[RESTORE] User ${connection.userId.substring(0, 8)} conn ${connection.id.substring(0, 8)} has no auth files on disk - marking disconnected`);
        await storage.updateConnection(connection.id, { isConnected: false, qrCode: null });
        noAuthCount++;
      }
    }

    console.log(
      `[RESTORE] Found ${toRestore.length} sessions with auth files to restore (${skippedCount} secondary skipped, ${noAuthCount} no auth, ${dormantSkipped} dormant skipped, connectedOnly=${RESTORE_CONNECTED_ONLY}, recentGraceMs=${RESTORE_RECENT_GRACE_MS})`
    );
    console.log(
      `[RESTORE] Runtime restore config: batchSize=${BATCH_SIZE}, batchDelayMs=${BATCH_DELAY_MS}, openTimeoutMs=${RESTORE_CONNECT_OPEN_TIMEOUT_MS} (restore), defaultOpenTimeoutMs=${CONNECT_OPEN_TIMEOUT_MS}`
    );

    // Parallel batch restore: connect BATCH_SIZE sessions at a time
    for (let batchStart = 0; batchStart < toRestore.length; batchStart += BATCH_SIZE) {
      const batch = toRestore.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(toRestore.length / BATCH_SIZE);
      console.log(`[RESTORE] Batch ${batchNum}/${totalBatches}: Connecting ${batch.length} sessions in parallel...`);

      const results = await Promise.allSettled(
        batch.map(async ({ userId, connectionId }, idx) => {
          const globalIdx = batchStart + idx + 1;
          console.log(`[RESTORE] (${globalIdx}/${toRestore.length}) Restoring session for user ${userId.substring(0, 8)}... (connId=${connectionId.substring(0, 8)})`);
          await connectWhatsApp(userId, connectionId, {
            openTimeoutMs: RESTORE_CONNECT_OPEN_TIMEOUT_MS,
            source: 'restore',
          });
          return { userId, connectionId };
        })
      );

      for (let resultIdx = 0; resultIdx < results.length; resultIdx++) {
        const result = results[resultIdx];
        const failedEntry = batch[resultIdx];
        if (result.status === 'fulfilled') {
          restoredCount++;
        } else {
          const reason = result.reason;
          console.error(`[RESTORE] Failed to restore session:`, reason);
          const reasonText = `${reason?.message || reason || ''}`;
          const isOpenTimeout = /open within|open_timeout|timeout/i.test(reasonText);

          // Timeout during restore is usually transient (slow WA handshake/startup pressure).
          // Keep DB state and let health check/pending cron trigger reconnect without forcing disconnect.
          if (isOpenTimeout && failedEntry) {
            console.warn(`[RESTORE] Deferred reconnect for ${failedEntry.connectionId.substring(0, 8)} after open-timeout; keeping DB state unchanged`);
            continue;
          }

          if (failedEntry) {
            try {
              await storage.updateConnection(failedEntry.connectionId, {
                isConnected: false,
                qrCode: null,
              });
            } catch (_cleanupErr) {
              // ignore cleanup errors
            }
          }
        }
      }

      // Wait between batches to avoid WhatsApp rate-limiting
      if (batchStart + BATCH_SIZE < toRestore.length) {
        console.log(`[RESTORE] Waiting ${BATCH_DELAY_MS}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
    console.log(`[RESTORE] ? Session restoration complete: ${restoredCount}/${toRestore.length} restored successfully`);
  } catch (error) {
    console.error("Error restoring sessions:", error);
  } finally {
    _isRestoringInProgress = false;
    _restoreStartedAt = 0;
    console.log(`[RESTORE] ?? Restore guard released � health check can now run`);
  }
}

export async function restoreAdminSessions(): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: N?o restaurar sess?es para evitar conflito com produ??o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log("?? [DEV MODE] SKIP_WHATSAPP_RESTORE=true - Pulando restaura??o de sess?es Admin WhatsApp");
    return;
  }
  
  try {
    console.log("Checking for existing admin WhatsApp connections...");
    const allAdmins = await storage.getAllAdmins();

    for (const admin of allAdmins) {
      const adminConnection = await storage.getAdminWhatsappConnection(admin.id);

      // Check for auth files on disk (persistent volume) - this avoids the race
      // condition where the API endpoint syncs isConnected=false to DB before
      // this restore function runs after a worker restart.
      const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${admin.id}`);
      let hasAuthFiles = false;
      try {
        const files = await fs.readdir(adminAuthPath);
        hasAuthFiles = files.some(f => f.includes('creds'));
      } catch {
        // Directory doesn't exist
      }

      const shouldRestore = hasAuthFiles || (adminConnection && adminConnection.isConnected);

      if (shouldRestore) {
        _isAdminRestoringInProgress = true;
        console.log(`Restoring admin WhatsApp session for admin ${admin.id} (authFiles=${hasAuthFiles}, dbConnected=${adminConnection?.isConnected})...`);
        try {
          await connectAdminWhatsApp(admin.id);
          console.log(`? Admin WhatsApp session restored for ${admin.id}`);
        } catch (error: any) {
          console.error(`Failed to restore admin session for ${admin.id}:`, error);
          const reasonText = `${error?.message || error || ''}`;
          const isOpenTimeout = /open within|open_timeout|timeout/i.test(reasonText);
          if (isOpenTimeout && hasAuthFiles) {
            // Timeout during restore is transient - keep DB state so health check retries
            console.warn(`[RESTORE ADMIN] Deferred reconnect for admin ${admin.id} after open-timeout; keeping DB state unchanged`);
          } else {
            await storage.updateAdminWhatsappConnection(admin.id, {
              isConnected: false,
              qrCode: null,
            });
          }
        }
      }
    }
    console.log("Admin session restoration complete");
  } catch (error) {
    console.error("Error restoring admin sessions:", error);
  } finally {
    _isAdminRestoringInProgress = false;
    console.log(`[RESTORE ADMIN] ?? Admin restore guard released`);
  }
}

// -----------------------------------------------------------------------
// ?? CONEX?O VIA PAIRING CODE (SEM QR CODE)
// -----------------------------------------------------------------------
// Baileys suporta conex?o via c?digo de pareamento de 8 d?gitos
// Isso permite conectar pelo celular sem precisar escanear QR Code
// -----------------------------------------------------------------------

/**
 * Helper para aguardar o WebSocket do Baileys abrir antes de enviar mensagens.
 * O Baileys lanza erro se tentar enviar antes do WS estar aberto (Connection Closed).
 */
async function waitForBaileysWsOpen(sock: any, timeoutMs: number = 15000): Promise<void> {
  const ws = sock?.ws;
  if (!ws) {
    throw new Error('WebSocket n�o encontrado no socket Baileys');
  }

  // J� est� aberto
  if (ws.isOpen === true) {
    console.log(`[WS] WebSocket j� est� aberto (isOpen=true)`);
    return;
  }

  console.log(`[WS] Aguardando WebSocket abrir... (ws.isOpen=${ws.isOpen}, timeout=${timeoutMs}ms)`);

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout aguardando conex�o WebSocket (${timeoutMs}ms). O WebSocket n�o abriu a tempo.`));
    }, timeoutMs);

    const onOpen = () => {
      console.log(`[WS] WebSocket aberto com sucesso!`);
      cleanup();
      resolve();
    };

    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket fechado antes de abrir (connection closed)'));
    };

    const onError = (err: any) => {
      cleanup();
      reject(new Error(`WebSocket erro antes de abrir: ${err?.message || err}`));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      try {
        ws.off('open', onOpen);
        ws.off('close', onClose);
        ws.off('error', onError);
      } catch (e) {
        // Ignorar erros ao remover listeners
      }
    };

    // Inscrever listeners
    try {
      ws.on('open', onOpen);
      ws.on('close', onClose);
      ws.on('error', onError);
    } catch (e) {
      cleanup();
      reject(new Error(`Erro ao inscrever listeners no WebSocket: ${e}`));
    }
  });
}

// -----------------------------------------------------------------------
// ?? HELPER PARA AGUARDAR QR EVENT ANTES DO PAIRING CODE
// -----------------------------------------------------------------------
// O Baileys requer explicitamente: "WAIT TILL QR EVENT BEFORE REQUESTING
// THE PAIRING CODE". Se chamarmos requestPairingCode antes do socket estar
// pronto (evento QR recebido), o c�digo pode at� ser gerado mas o pareamento
// falha com "N�o foi poss�vel conectar o dispositivo" no celular.
// Ref: https://www.npmjs.com/package/@whiskeysockets/baileys
// -----------------------------------------------------------------------

interface QrEventResult {
  success: boolean;
  closedBeforeQr?: boolean;
  statusCode?: number;
  errorMessage?: string;
}

async function waitForBaileysQrEvent(sock: any, timeoutMs: number = 20000): Promise<QrEventResult> {
  console.log(`[QR EVENT] Aguardando evento QR do Baileys antes do pairing (timeout=${timeoutMs}ms)...`);

  return new Promise<QrEventResult>((resolve) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      console.log(`[QR EVENT] Timeout aguardando QR event`);
      resolve({ success: false });
    }, timeoutMs);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(timeoutId);
      try {
        sock.ev.off("connection.update", onConnectionUpdate);
      } catch (e) {
        // Ignorar erros ao remover listener
      }
    };

    const onConnectionUpdate = (update: any) => {
      const { connection: conn, qr, lastDisconnect } = update;

      // QR recebido = socket est� pronto para pairing
      if (qr) {
        console.log(`[QR EVENT] ? QR event recebido! Socket pronto para pairing.`);
        cleanup();
        resolve({ success: true });
        return;
      }

      // Conex�o fechada antes do QR
      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorMessage = (lastDisconnect?.error as any)?.message || "Connection closed";

        console.log(`[QR EVENT] ? Conex�o fechada antes do QR - statusCode: ${statusCode}`);

        cleanup();
        resolve({
          success: false,
          closedBeforeQr: true,
          statusCode,
          errorMessage
        });
        return;
      }

      // Conex�o aberta (n�o deveria acontecer antes do QR/pairing, mas logamos)
      if (conn === "open") {
        console.log(`[QR EVENT] Conex�o aberta inesperadamente antes do pairing`);
        cleanup();
        resolve({ success: true }); // Consideramos sucesso pois j� est� conectado
        return;
      }
    };

    // Inscrever listener
    try {
      sock.ev.on("connection.update", onConnectionUpdate);
    } catch (e) {
      cleanup();
      console.error(`[QR EVENT] Erro ao inscrever listener:`, e);
      resolve({ success: false, errorMessage: String(e) });
    }
  });
}

// -----------------------------------------------------------------------
// ?? FUN��O AUXILIAR: Criar socket de pairing com configura��o otimizada
// -----------------------------------------------------------------------
// Cria um socket Baileys com version, browser e configura��es recomendadas
// para pairing code, reduzindo a ocorr�ncia de 515 restartRequired.
// -----------------------------------------------------------------------
async function createPairingSocket(
  userId: string,
  authPath: string,
  connectionId: string
): Promise<{ sock: any; state: any; saveCreds: (creds: any) => void }> {
  // FIX 2026-02-24: Vers�o fixa em vez de fetchLatestBaileysVersion()
  // WhatsApp rejeitou Platform.WEB, vers�o fixa compat�vel com MACOS
  const version: [number, number, number] = [2, 3000, 1033893291];
  console.log(`?? [PAIRING] Baileys version (fixed): ${version}`);

  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    // -----------------------------------------------------------------------
    // FIX 2026-02-24: WhatsApp rejeitou Platform.WEB (405 error)
    // Vers�o fixa em vez de fetchLatestBaileysVersion()
    // Ref: https://github.com/WhiskeySockets/Baileys/issues/2370
    // -----------------------------------------------------------------------
    version: [2, 3000, 1033893291],
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 250,
    // -----------------------------------------------------------------------
    // ?? BROWSER CONFIG: Ubuntu + Chrome (compat�vel com WhatsApp Web)
    // -----------------------------------------------------------------------
    browser: Browsers.ubuntu('Chrome'),
    // -----------------------------------------------------------------------
    // ?? REDUZIR INSTABILIDADE: Configura��es recomendadas para pairing
    // -----------------------------------------------------------------------
    defaultQueryTimeoutMs: undefined,  // Reduz "Connection Closed"
    syncFullHistory: false,  // Pairing � s� autenticar, sync depois
    // -----------------------------------------------------------------------
    // ?? getMessage handler para retry de mensagens
    // -----------------------------------------------------------------------
    getMessage: async (key) => {
      if (!key.id) return undefined;
      const cached = getCachedMessage(userId, key.id);
      if (cached) return cached;
      try {
        const dbMessage = await storage.getMessageByMessageId(key.id);
        if (dbMessage && dbMessage.text) {
          return { conversation: dbMessage.text };
        }
      } catch (err) {
        // Ignorar
      }
      return undefined;
    },
  });

  return { sock, state, saveCreds };
}

// -----------------------------------------------------------------------
// ?? FUN��O AUXILIAR: Handler de conex�o para pairing com restart
// -----------------------------------------------------------------------
// Configura os handlers de connection.update para um socket de pairing,
// tratando automaticamente restartRequired (515) com reconex�o.
// -----------------------------------------------------------------------
function setupPairingConnectionHandler(
  userId: string,
  sock: any,
  session: WhatsAppSession,
  authPath: string,
  onRestartNeeded: () => void
): void {
  sock.ev.on("connection.update", async (update) => {
    const { connection: conn, lastDisconnect } = update;

    if (conn === "open") {
      // FIX 2026-02-24: Mark session as truly open
      session.isOpen = true;
      session.connectedAt = Date.now();
      const phoneNum = sock.user?.id?.split(":")[0] || "";
      session.phoneNumber = phoneNum;

      // Promover auth_pairing -> auth
      try {
        const mainAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
        await clearAuthFiles(mainAuthPath);
        await ensureDirExists(mainAuthPath);

        const pairingFiles = await fs.readdir(authPath);
        for (const file of pairingFiles) {
          const srcPath = path.join(authPath, file);
          const destPath = path.join(mainAuthPath, file);
          const content = await fs.readFile(srcPath);
          await fs.writeFile(destPath, content);
        }

        console.log(`?? [PAIRING] Auth promovido: ${authPath.split('/').pop()} -> auth_${userId.substring(0, 8)}...`);
        await clearAuthFiles(authPath);
      } catch (promoteErr) {
        console.error(`?? [PAIRING] Erro ao promover auth:`, promoteErr);
      }

      // Cancelar timeout de expira��o
      const pairingRecord = pairingSessions.get(userId);
      if (pairingRecord?.timeoutId) {
        clearTimeout(pairingRecord.timeoutId);
      }
      pairingSessions.delete(userId);
      clearPairingState(userId);

      await storage.updateConnection(session.connectionId, {
        isConnected: true,
        phoneNumber: phoneNum,
        qrCode: null,
      });

      console.log(`[PAIRING] WhatsApp conectado: ${phoneNum}`);
      broadcastToUser(userId, { type: "connected", phoneNumber: phoneNum, connectionId: connection.id });
    }

    if (conn === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const errorMessage = (lastDisconnect?.error as any)?.message || "";

      console.log(`?? [PAIRING] Close - statusCode: ${statusCode}, errorMessage: ${errorMessage?.substring(0, 50)}`);

      // -----------------------------------------------------------------------
      // ?? TRATAMENTO DE STATUS CODES
      // -----------------------------------------------------------------------
      // 515 / restartRequired: Reconectar automaticamente
      // 429 / rate-overlimit: Cooldown de 30 min
      // 401 / loggedOut: Erro definitivo
      // 408 / timedOut, 428 / connectionClosed: Reconectar
      // -----------------------------------------------------------------------

      // 429 Rate Limit
      if (statusCode === 429 || errorMessage.includes('rate-overlimit')) {
        console.error(`?? [PAIRING] RATE LIMIT 429`);

        pairingRateLimitCooldown.set(userId, {
          until: Date.now() + RATE_LIMIT_COOLDOWN_MS,
          statusCode: 429
        });

        try {
          await clearAuthFiles(authPath);
          await ensureDirExists(authPath);
        } catch (e) {}

        const pairingRecord = pairingSessions.get(userId);
        if (pairingRecord?.timeoutId) clearTimeout(pairingRecord.timeoutId);
        pairingSessions.delete(userId);
        clearPairingState(userId);

        broadcastToUser(userId, { type: "disconnected", reason: "pairing_rate_limited", connectionId: session.connectionId });
        return;
      }

      // 401 loggedOut - Erro definitivo
      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`?? [PAIRING] LoggedOut - limpando auth`);

        try {
          await clearAuthFiles(authPath);
          await ensureDirExists(authPath);
        } catch (e) {}

        const pairingRecord = pairingSessions.get(userId);
        if (pairingRecord?.timeoutId) clearTimeout(pairingRecord.timeoutId);
        pairingSessions.delete(userId);
        clearPairingState(userId);

        await storage.updateConnection(session.connectionId, {
          isConnected: false,
          qrCode: null,
        });

        broadcastToUser(userId, { type: "disconnected", reason: "pairing_failed", connectionId: session.connectionId });
        return;
      }

      // -----------------------------------------------------------------------
      // ?? 515 restartRequired / 408 timedOut / 428 connectionClosed
      // -----------------------------------------------------------------------
      // Estes s�o "closes transit�rios" que devem iniciar reconex�o autom�tica
      // -----------------------------------------------------------------------
      if (statusCode === DisconnectReason.restartRequired || statusCode === 515 ||
          statusCode === DisconnectReason.timedOut || statusCode === 408 ||
          statusCode === DisconnectReason.connectionClosed || statusCode === 428) {

        console.log(`?? [PAIRING] Close transitorio (${statusCode}) - iniciando restart...`);

        const state = getPairingState(userId);
        if (!state) {
          console.log(`?? [PAIRING] Estado de pairing n�o encontrado, abortando restart`);
          return;
        }

        // Verificar limite de retries
        const now = Date.now();
        const timeSinceLastRetry = now - state.lastRetryAt;

        // Resetar contador se passou do cooldown
        if (timeSinceLastRetry > PAIRING_RETRY_COOLDOWN_MS) {
          state.retryCount = 0;
        }

        if (state.retryCount >= MAX_PAIRING_RETRIES) {
          console.error(`?? [PAIRING] Limite de restarts (${MAX_PAIRING_RETRIES}) atingido`);

          try {
            await clearAuthFiles(authPath);
            await ensureDirExists(authPath);
          } catch (e) {}

          const pairingRecord = pairingSessions.get(userId);
          if (pairingRecord?.timeoutId) clearTimeout(pairingRecord.timeoutId);
          pairingSessions.delete(userId);
          clearPairingState(userId);

          broadcastToUser(userId, {
            type: "disconnected",
            reason: "pairing_failed_restart_loop"
          });
          return;
        }

        // Incrementar e agendar restart
        state.retryCount++;
        state.lastRetryAt = now;
        state.isRestarting = true;
        setPairingState(userId, state);

        console.log(`?? [PAIRING] Restart ${state.retryCount}/${MAX_PAIRING_RETRIES} agendado em 3s...`);

        broadcastToUser(userId, {
          type: "pairing_restarting",
          retryCount: state.retryCount,
          maxRetries: MAX_PAIRING_RETRIES
        });

        // Chamar callback de restart (ser� tratado fora do handler)
        setTimeout(() => onRestartNeeded(), 3000);
        return;
      }

      // Outros closes - log e aguardar
      console.log(`?? [PAIRING] Close n�o tratado (statusCode: ${statusCode}), aguardando...`);
    }
  });
}

export async function requestClientPairingCode(userId: string, phoneNumber: string, targetConnectionId?: string): Promise<string | null> {
  // ??? MODO DESENVOLVIMENTO: Bloquear pairing para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] requestClientPairingCode bloqueado para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sess�es do WhatsApp em produ��o n�o ser�o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sess�es em produ��o.');
  }

  // Verificar cooldown de rate limit
  const cooldown = pairingRateLimitCooldown.get(userId);
  if (cooldown && cooldown.until > Date.now()) {
    const remainingMinutes = Math.ceil((cooldown.until - Date.now()) / 60000);
    throw new Error(`WhatsApp limitou as tentativas de conex�o. Aguarde ${remainingMinutes} minutos antes de tentar novamente.`);
  }

  // Verificar se j� h� uma solicita��o em andamento para este usu�rio
  const existingRequest = pendingPairingRequests.get(userId);
  if (existingRequest) {
    console.log(`? [PAIRING] J? existe solicita??o em andamento para ${userId}, aguardando...`);
    return existingRequest;
  }

  // Criar Promise da solicita??o
  const requestPromise = (async () => {
    // Usar auth_pairing_<userId> para isolar do QR normal
    const pairingAuthPath = path.join(SESSIONS_BASE, `auth_pairing_${userId}`);
    let sock: any = null;  // Socket atual do pairing (pode ser substitu�do em restarts)
    let pairingTimeoutId: NodeJS.Timeout | undefined;

    try {
      console.log(`?? [PAIRING] Solicitando c?digo para ${phoneNumber} (user: ${userId})`);

      // Limpar sess�o anterior se existir
      const lookupKey = targetConnectionId || userId;
      const existingSession = sessions.get(lookupKey);
      if (existingSession?.socket) {
        try {
          console.log(`[PAIRING] Limpando sess�o anterior (encerrando conex�o local)...`);
          await existingSession.socket.end(undefined);
        } catch (e) {
          console.log(`[PAIRING] Erro ao encerrar sess�o anterior (ignorando):`, e);
        }
        sessions.delete(lookupKey);
        unregisterWhatsAppSession(lookupKey);
      }

      // Criar/obter conex�o
      let connection;
      if (targetConnectionId) {
        connection = await storage.getConnectionById(targetConnectionId);
      }
      if (!connection) {
        connection = await storage.getConnectionByUserId(userId);
      }

      if (!connection) {
        connection = await storage.createConnection({
          userId,
          isConnected: false,
        });
      }

      // -----------------------------------------------------------------------
      // ?? ISOLAMENTO DO AUTH DE PAIRING
      // -----------------------------------------------------------------------
      // Usar auth_pairing_<userId> separado para n�o interferir no QR normal.
      // Se o pairing falhar, apenas limpamos essa pasta espec�fica.
      // -----------------------------------------------------------------------

      // Limpar auth de pairing anterior (se existir)
      await clearAuthFiles(pairingAuthPath);

      // Recriar a pasta para o multi-file auth state
      await ensureDirExists(pairingAuthPath);

      // -----------------------------------------------------------------------
      // ?? CRIAR SOCKET USANDO fetchLatestBaileysVersion
      // -----------------------------------------------------------------------
      // A fun��o createPairingSocket j� busca a vers�o mais recente do Baileys
      // e configura o browser como Ubuntu Chrome para melhor compatibilidade.
      // -----------------------------------------------------------------------
      const { sock: newSock, state, saveCreds } = await createPairingSocket(
        userId,
        pairingAuthPath,
        connection.id
      );
      sock = newSock;
    
    const contactsCache = new Map<string, Contact>();
    
    const session: WhatsAppSession = {
      socket: sock,
      userId,
      connectionId: connection.id,
      contactsCache,
      isOpen: false,
      createdAt: Date.now(),
    };
    
    sessions.set(connection.id, session);
    
    sock.ev.on("creds.update", saveCreds);
    
    // Handler de conex?o
    sock.ev.on("connection.update", async (update) => {
      const { connection: conn, lastDisconnect } = update;

      if (conn === "open") {
        // FIX 2026-02-24: Mark session as truly open
        session.isOpen = true;
        session.connectedAt = Date.now();
        const phoneNum = sock.user?.id?.split(":")[0] || "";
        session.phoneNumber = phoneNum;

        // -----------------------------------------------------------------------
        // ?? PROMOVER AUTH_PAIRING PARA AUTH PRINCIPAL
        // -----------------------------------------------------------------------
        // Quando o pairing tem sucesso, o auth_pairing_<userId> cont�m a
        // sess�o v�lida. Precisamos promover para auth_<userId> para que
        // restaura��es futuras funcionem normalmente via QR.
        // -----------------------------------------------------------------------
        try {
          const mainAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
          // pairingAuthPath j� est� definido no escopo da fun��o

          // Copiar arquivos do pairing para o principal
          await clearAuthFiles(mainAuthPath); // Limpar auth principal antigo
          await ensureDirExists(mainAuthPath);

          const pairingFiles = await fs.readdir(pairingAuthPath);
          for (const file of pairingFiles) {
            const srcPath = path.join(pairingAuthPath, file);
            const destPath = path.join(mainAuthPath, file);
            const content = await fs.readFile(srcPath);
            await fs.writeFile(destPath, content);
          }

          console.log(`?? [PAIRING] Auth promovido: auth_pairing_${userId.substring(0, 8)}... -> auth_${userId.substring(0, 8)}...`);

          // Limpar auth_pairing (n�o � mais necess�rio)
          await clearAuthFiles(pairingAuthPath);
        } catch (promoteErr) {
          console.error(`?? [PAIRING] Erro ao promover auth (n�o cr�tico, sess�o j� funciona):`, promoteErr);
        }

        // Cancelar timeout de expira��o
        const pairingRecord = pairingSessions.get(userId);
        if (pairingRecord?.timeoutId) {
          clearTimeout(pairingRecord.timeoutId);
          pairingSessions.delete(userId);
          console.log(`?? [PAIRING] Timeout de expira��o cancelado, sess�o est�vel`);
        }

        await storage.updateConnection(session.connectionId, {
          isConnected: true,
          phoneNumber: phoneNum,
          qrCode: null,
        });

        console.log(`? [PAIRING] WhatsApp conectado: ${phoneNum}`);
        broadcastToUser(userId, { type: "connected", phoneNumber: phoneNum, connectionId: session.connectionId });
      }

      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorMessage = (lastDisconnect?.error as any)?.message || "";

        // -----------------------------------------------------------------------
        // ?? DETECTAR RATE LIMIT 429
        // -----------------------------------------------------------------------
        if (statusCode === 429 || errorMessage.includes('rate-overlimit') || errorMessage.includes('429')) {
          console.error(`?? [PAIRING] RATE LIMIT DETECTED (429) durante pairing`);

          // Aplicar cooldown
          pairingRateLimitCooldown.set(userId, {
            until: Date.now() + RATE_LIMIT_COOLDOWN_MS,
            statusCode: 429
          });

          // Limpar auth de pairing
          try {
            await clearAuthFiles(pairingAuthPath);
            await ensureDirExists(pairingAuthPath);
          } catch (e) {
            console.error(`?? [PAIRING] Erro ao limpar auth ap�s rate limit:`, e);
          }

          // Cancelar timeout
          const pairingRecord = pairingSessions.get(userId);
          if (pairingRecord?.timeoutId) {
            clearTimeout(pairingRecord.timeoutId);
          }
          pairingSessions.delete(userId);

          broadcastToUser(userId, {
            type: "disconnected",
            reason: "pairing_rate_limited"
          });

          return;
        }

        // -----------------------------------------------------------------------
        // ?? TRATAR 515 restartRequired - RECONEX�O AUTOM�TICA
        // -----------------------------------------------------------------------
        // O statusCode 515 (restartRequired) � comum ap�s requestPairingCode.
        // O Baileys fecha a conex�o mas o auth_pairing ainda � v�lido.
        // Precisamos reconectar sem limpar o auth para que o c�digo continue funcionando.
        // -----------------------------------------------------------------------
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(`?? [PAIRING RESTART] restartRequired (515) detectado - iniciando reconex�o autom�tica...`);

          // Verificar limite de retries
          const now = Date.now();
          let retryState = pairingRetries.get(userId) || { count: 0, lastAttempt: 0 };

          // Resetar contador se passou do cooldown
          if (now - retryState.lastAttempt > PAIRING_RETRY_COOLDOWN_MS) {
            retryState.count = 0;
          }

          if (retryState.count >= MAX_PAIRING_RETRIES) {
            console.error(`?? [PAIRING RESTART] Limite de retries atingido (${MAX_PAIRING_RETRIES}), desistindo`);

            // Limpar tudo
            try {
              await clearAuthFiles(pairingAuthPath);
              await ensureDirExists(pairingAuthPath);
            } catch (e) {
              console.error(`?? [PAIRING] Erro ao limpar auth:`, e);
            }

            const pairingRecord = pairingSessions.get(userId);
            if (pairingRecord?.timeoutId) {
              clearTimeout(pairingRecord.timeoutId);
            }
            pairingSessions.delete(userId);
            pairingRetries.delete(userId);

            broadcastToUser(userId, {
              type: "disconnected",
              reason: "pairing_failed"
            });

            return;
          }

          // Incrementar e agendar reconex�o
          retryState.count++;
          retryState.lastAttempt = now;
          pairingRetries.set(userId, retryState);

          console.log(`?? [PAIRING RESTART] Agendando retry ${retryState.count}/${MAX_PAIRING_RETRIES} em 5s...`);

          // Notificar frontend sobre reconex�o
          broadcastToUser(userId, {
            type: "pairing_restarting",
            retryCount: retryState.count,
            maxRetries: MAX_PAIRING_RETRIES
          });

          // Agendar reconex�o ap�s delay
          setTimeout(async () => {
            try {
              console.log(`?? [PAIRING RESTART] Executando reconex�o ${retryState.count}/${MAX_PAIRING_RETRIES}...`);

              // Criar novo socket com o mesmo auth
              const { state: newState, saveCreds: newSaveCreds } = await useMultiFileAuthState(pairingAuthPath);

              const newSock = makeWASocket({
                auth: {
                  creds: newState.creds,
                  keys: makeCacheableSignalKeyStore(newState.keys, pino({ level: "silent" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                // FIX 2026-02-24: WhatsApp rejeitou Platform.WEB (405 error)
                version: [2, 3000, 1033893291],
                connectTimeoutMs: 60_000,
                keepAliveIntervalMs: 25_000,
                retryRequestDelayMs: 250,
                browser: Browsers.macOS('Desktop'),
                // FIX 2026-02-25: Ignore status@broadcast (Pairing restart)
                shouldIgnoreJid: (jid: string) => jid === 'status@broadcast',
                getMessage: async (key) => {
                  if (!key.id) return undefined;
                  const cached = getCachedMessage(userId, key.id);
                  if (cached) return cached;
                  try {
                    const dbMessage = await storage.getMessageByMessageId(key.id);
                    if (dbMessage && dbMessage.text) {
                      return { conversation: dbMessage.text };
                    }
                  } catch (err) {
                    // Ignorar
                  }
                  return undefined;
                },
              });

              // Atualizar sess�o
              session.socket = newSock;
              sessions.set(userId, session);

              // Re-configurar handlers
              newSock.ev.on("creds.update", newSaveCreds);

              // Re-atribuir handler de connection.update (recursivamente)
              // Nota: isso � simplificado; em produ��o idealmente usar�amos uma fun��o reutiliz�vel
              newSock.ev.on("connection.update", async (update: any) => {
                const { connection: newConn, lastDisconnect: newLastDisconnect } = update;

                if (newConn === "open") {
                  // FIX 2026-02-24: Mark session as truly open
                  session.isOpen = true;
                  session.connectedAt = Date.now();
                  const phoneNum = newSock.user?.id?.split(":")[0] || "";
                  session.phoneNumber = phoneNum;

                  // Promover auth
                  try {
                    const mainAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
                    await clearAuthFiles(mainAuthPath);
                    await ensureDirExists(mainAuthPath);

                    const pairingFiles = await fs.readdir(pairingAuthPath);
                    for (const file of pairingFiles) {
                      const srcPath = path.join(pairingAuthPath, file);
                      const destPath = path.join(mainAuthPath, file);
                      const content = await fs.readFile(srcPath);
                      await fs.writeFile(destPath, content);
                    }

                    console.log(`?? [PAIRING RESTART] Auth promovido ap�s restart`);

                    await clearAuthFiles(pairingAuthPath);
                  } catch (promoteErr) {
                    console.error(`?? [PAIRING RESTART] Erro ao promover auth:`, promoteErr);
                  }

                  // Cancelar timeouts
                  const pRecord = pairingSessions.get(userId);
                  if (pRecord?.timeoutId) {
                    clearTimeout(pRecord.timeoutId);
                  }
                  pairingSessions.delete(userId);
                  pairingRetries.delete(userId);

                  await storage.updateConnection(session.connectionId, {
                    isConnected: true,
                    phoneNumber: phoneNum,
                    qrCode: null,
                  });

                  console.log(`? [PAIRING RESTART] WhatsApp conectado ap�s restart: ${phoneNum}`);
                  broadcastToUser(userId, { type: "connected", phoneNumber: phoneNum, connectionId: session.connectionId });
                }

                if (newConn === "close") {
                  // Recursivamente tratar close (esta mesma l�gica)
                  const newStatusCode = (newLastDisconnect?.error as any)?.output?.statusCode;
                  console.log(`?? [PAIRING RESTART] Close ap�s restart - statusCode: ${newStatusCode}`);
                  // A l�gica continuar� sendo tratada pelo handler principal
                }
              });

              console.log(`?? [PAIRING RESTART] Novo socket configurado, aguardando conex�o...`);

            } catch (restartErr) {
              console.error(`?? [PAIRING RESTART] Erro na reconex�o:`, restartErr);
              // Em caso de erro, tentar� novamente no pr�ximo ciclo (count aumenta)
            }
          }, 5000);

          return;
        }

        // -----------------------------------------------------------------------
        // ?? LIMPEZA FORTE NO CLOSE DURING PAIRING
        // -----------------------------------------------------------------------
        // Se a conex�o fechar durante o pairing (antes de open), emitir evento
        // de falha para o frontend e limpar auth_pairing para n�o "envenenar" o QR.
        // -----------------------------------------------------------------------
        console.log(`?? [PAIRING] Conex�o fechada durante pairing - statusCode: ${statusCode}`);

        // pairingAuthPath j� est� definido no escopo da fun��o

        if (statusCode === DisconnectReason.loggedOut) {
          // Logout durante pairing = auth inv�lido ou erro de formato
          console.log(`?? [PAIRING] Logout durante pairing - limpando auth_pairing e notificando falha`);

          try {
            await clearAuthFiles(pairingAuthPath);
            await ensureDirExists(pairingAuthPath);
          } catch (cleanupErr) {
            console.error(`?? [PAIRING] Erro ao limpar auth_pairing:`, cleanupErr);
          }

          // Cancelar timeout
          const pairingRecord = pairingSessions.get(userId);
          if (pairingRecord?.timeoutId) {
            clearTimeout(pairingRecord.timeoutId);
          }
          pairingSessions.delete(userId);
          pairingRetries.delete(userId);

          // Atualizar DB
          try {
            await storage.updateConnection(session.connectionId, {
              isConnected: false,
              qrCode: null,
            });
          } catch (dbErr) {
            console.error(`?? [PAIRING] Erro ao atualizar DB:`, dbErr);
          }

          // Notificar falha espec�fica
          broadcastToUser(userId, {
            type: "disconnected",
            reason: "pairing_failed"
          });
        } else if (statusCode !== undefined) {
          // Outro erro de conex�o (n�o loggedOut, n�o restartRequired)
          console.log(`?? [PAIRING] Desconectado temporariamente (statusCode: ${statusCode}), aguardando...`);
          // N�o limpamos auth aqui pois pode ser reconex�o tempor�ria
        } else {
          // Close sem statusCode ( WebSocket fechado, timeout, etc)
          console.log(`?? [PAIRING] Conex�o fechada sem statusCode - limpando auth_pairing`);
          try {
            await clearAuthFiles(pairingAuthPath);
            await ensureDirExists(pairingAuthPath);
          } catch (cleanupErr) {
            console.error(`?? [PAIRING] Erro ao limpar auth_pairing:`, cleanupErr);
          }

          // Cancelar timeout
          const pairingRecord = pairingSessions.get(userId);
          if (pairingRecord?.timeoutId) {
            clearTimeout(pairingRecord.timeoutId);
          }
          pairingSessions.delete(userId);
          pairingRetries.delete(userId);

          broadcastToUser(userId, {
            type: "disconnected",
            reason: "pairing_failed"
          });
        }
      }
    });

    // Handler de mensagens
    sock.ev.on("messages.upsert", async (m) => {
      const source = m.type;

      for (const message of m.messages || []) {
        if (!message) continue;

        const remoteJid = message.key.remoteJid || null;
        const rawTs = (message as any)?.messageTimestamp;
        const nTs = Number(rawTs);
        const hasValidTs = Number.isFinite(nTs) && nTs > 0;
        const eventTs = hasValidTs ? new Date(nTs * 1000) : new Date();
        const ageMs = Math.max(0, Date.now() - eventTs.getTime());

        const isAppendRecent =
          source === "append" &&
          ((hasValidTs && ageMs <= 2 * 60 * 1000) || (!hasValidTs && (m.messages?.length || 0) <= 3 && !!message.key.id));
        const shouldProcess = source === "notify" || isAppendRecent;

        if (message.key.id && message.message) {
          cacheMessage(userId, message.key.id, message.message);
        }

        if (!shouldProcess) continue;

        if (!message.key.fromMe && remoteJid) {
          if (!remoteJid.includes("@g.us") && !remoteJid.includes("@broadcast")) {
            try {
              const msg = unwrapIncomingMessageContent(message.message as any);
              let textContent: string | null = null;
              let msgType = "text";

              if (!message.message) {
                msgType = "stub";
                const stubType = (message as any).messageStubType;
                textContent = stubType != null ? `[WhatsApp] Mensagem incompleta (stubType=${stubType})` : null;
              } else if (msg?.conversation) {
                textContent = msg.conversation;
              } else if (msg?.extendedTextMessage?.text) {
                textContent = msg.extendedTextMessage.text;
              } else {
                msgType = "unknown";
                textContent = "[Mensagem nao suportada]";
              }

              await saveIncomingMessage({
                userId: userId,
                connectionId: session.connectionId,
                waMessage: message,
                messageContent: textContent,
                messageType: msgType,
              });
            } catch (saveErr) {
              console.error(`[RECOVERY] Erro ao salvar mensagem pendente (pairing):`, saveErr);
            }
          }
        }

        if (message.key.fromMe) {
          try {
            if (source === "notify") {
              await handleOutgoingMessage(session, message);
            }
          } catch (err) {
            console.error("Error handling outgoing message:", err);
          }
          continue;
        }

        try {
          await handleIncomingMessage(session, message, {
            source,
            allowAutoReply: source === "notify" || isAppendRecent,
            isAppendRecent,
            eventTs,
          });
        } catch (err) {
          console.error("Error handling incoming message:", err);
        }
      }
    });

    // Formatar n?mero para pairing (sem + e sem @)
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    console.log(`?? [PAIRING] N�mero formatado para pareamento: ${cleanNumber}`);

    // -----------------------------------------------------------------------
    // ?? FIX: Aguardar QR Event antes de solicitar pairing code (RECOMENDA��O BAILEYS)
    // -----------------------------------------------------------------------
    // O Baileys requer explicitamente: "WAIT TILL QR EVENT BEFORE REQUESTING
    // THE PAIRING CODE". Se chamarmos requestPairingCode antes do socket estar
    // pronto (evento QR recebido), o c�digo pode at� ser gerado mas o pareamento
    // falha com "N�o foi poss�vel conectar o dispositivo" no celular.
    // Ref: https://www.npmjs.com/package/@whiskeysockets/baileys
    // -----------------------------------------------------------------------
    try {
      console.log(`?? [PAIRING] Aguardando QR Event do Baileys antes do pairing...`);
      const qrEventResult = await waitForBaileysQrEvent(sock, 20000);

      if (!qrEventResult.success) {
        if (qrEventResult.closedBeforeQr) {
          // Verificar se foi rate limit
          if (qrEventResult.statusCode === 429 ||
              qrEventResult.errorMessage?.includes('rate-overlimit') ||
              qrEventResult.errorMessage?.includes('429')) {
            console.error(`?? [PAIRING] RATE LIMIT DETECTED (429) antes do QR`);

            // Aplicar cooldown
            pairingRateLimitCooldown.set(userId, {
              until: Date.now() + RATE_LIMIT_COOLDOWN_MS,
              statusCode: 429
            });

            broadcastToUser(userId, {
              type: "disconnected",
              reason: "pairing_rate_limited"
            });

            throw new Error('WhatsApp limitou as tentativas. Aguarde 20-40 minutos e tente novamente.');
          }

          // Outro erro de conex�o
          throw new Error(`Conex�o fechada antes do QR event: ${qrEventResult.errorMessage || 'statusCode ' + qrEventResult.statusCode}`);
        }

        // Timeout ou outro erro
        throw new Error('Timeout aguardando QR event. Tente novamente.');
      }

      console.log(`?? [PAIRING] QR Event recebido, aguardando WebSocket abrir...`);
      // WebSocket geralmente j� est� aberto depois do QR event, mas vamos garantir
      await waitForBaileysWsOpen(sock, 5000);
      console.log(`?? [PAIRING] Socket pronto, solicitando pairing code para ${cleanNumber}`);
    } catch (wsError: any) {
      console.error(`?? [PAIRING] Erro ao aguardar socket pronto:`, wsError);
      throw wsError; // Propagar para o catch geral fazer limpeza
    }

    // Solicitar c?digo de pareamento
    // O c?digo ser? enviado via WhatsApp para o n?mero informado
    let code: string | undefined;
    try {
      code = await sock.requestPairingCode(cleanNumber);

      console.log(`? [PAIRING] C?digo gerado com sucesso: ${code}`);

      // -----------------------------------------------------------------------
      // ?? RETEN��O DE SESS�O: Manter vivo por 3 minutos
      // -----------------------------------------------------------------------
      // Se o usu�rio n�o digitar o c�digo, a sess�o expira automaticamente
      // -----------------------------------------------------------------------
      const expiresAt = Date.now() + PAIRING_SESSION_TIMEOUT_MS;

      pairingSessions.set(userId, {
        startedAt: Date.now(),
        phone: cleanNumber,
        codeIssuedAt: Date.now(),
        expiresAt
      });

      console.log(`?? [PAIRING] Sess�o registrada, expira em ${PAIRING_SESSION_TIMEOUT_MS / 1000} segundos`);

      // Configurar timeout de expira��o
      pairingTimeoutId = setTimeout(async () => {
        console.log(`?? [PAIRING] Sess�o expirou para ${userId.substring(0, 8)}... (usu�rio n�o digitou o c�digo)`);

        // Limpar auth de pairing
        try {
          await clearAuthFiles(pairingAuthPath);
        } catch (e) {
          console.error(`?? [PAIRING] Erro ao limpar auth expirado:`, e);
        }

        // Remover da mem�ria
        pairingSessions.delete(userId);

        // Notificar frontend (se ainda estiver conectado)
        broadcastToUser(userId, {
          type: "disconnected",
          reason: "pairing_expired"
        });
      }, PAIRING_SESSION_TIMEOUT_MS);

      // Armazenar o timeoutId no pairingSession para poder cancelar se conectar
      const sessionRecord = pairingSessions.get(userId);
      if (sessionRecord) {
        sessionRecord.timeoutId = pairingTimeoutId;
      }

      // Aguardar um pouco para garantir que o c?digo foi processado
      await new Promise(resolve => setTimeout(resolve, 1000));

      return code;
    } catch (pairingError: any) {
      console.error(`? [PAIRING] Erro ao chamar requestPairingCode:`, pairingError);
      console.error(`? [PAIRING] Stack trace:`, (pairingError).stack);

      // Verificar se � erro de rate limit
      const errorMsg = String(pairingError?.message || pairingError || '');
      if (errorMsg.includes('429') || errorMsg.includes('rate-overlimit') || errorMsg.includes('rate limit')) {
        console.error(`?? [PAIRING] RATE LIMIT DETECTED (429) ao solicitar c�digo`);

        // Aplicar cooldown
        pairingRateLimitCooldown.set(userId, {
          until: Date.now() + RATE_LIMIT_COOLDOWN_MS,
          statusCode: 429
        });

        broadcastToUser(userId, {
          type: "disconnected",
          reason: "pairing_rate_limited"
        });

        throw new Error('WhatsApp limitou as tentativas. Aguarde 20-40 minutos e tente novamente.');
      }

      throw pairingError;
    }
  } catch (error) {
    console.error(`?? [PAIRING] Erro geral ao solicitar c?digo:`, error);
    console.error(`?? [PAIRING] Tipo de erro:`, typeof error);
    console.error(`?? [PAIRING] Mensagem:`, (error as Error).message);

    // -----------------------------------------------------------------------
    // ?? LIMPEZA FORTE EM ERRO: Evitar credenciais parciais que "envenenam" o QR
    // -----------------------------------------------------------------------
    // Se houver erro durante o pairing, � poss�vel que creds.json parcial tenha
    // sido criado. Se n�o limparmos, a pr�xima tentativa de QR vai falhar com
    // loggedOut imediato porque o Baileys tenta usar esse auth parcial.
    // -----------------------------------------------------------------------

    // 1. Limpar sess�o da mem�ria
    sessions.delete(userId);
    unregisterWhatsAppSession(userId);

    // Cancelar timeout de expira��o se existir
    const pairingSession = pairingSessions.get(userId);
    if (pairingSession?.timeoutId) {
      clearTimeout(pairingSession.timeoutId);
    }
    pairingSessions.delete(userId);

    // 2. Limpar arquivos de auth de pairing (N�O o auth principal!)
    try {
      await clearAuthFiles(pairingAuthPath);
      await ensureDirExists(pairingAuthPath); // Recriar pasta vazia
      console.log(`?? [PAIRING] Auth pairing limpo ap�s erro: ${pairingAuthPath}`);
    } catch (cleanupErr) {
      console.error(`?? [PAIRING] Erro ao limpar auth pairing:`, cleanupErr);
    }

    // 3. Atualizar banco para estado limpo
    try {
      const conn = await storage.getConnectionByUserId(userId);
      if (conn) {
        await storage.updateConnection(conn.id, {
          isConnected: false,
          qrCode: null,
        });
      }
    } catch (dbErr) {
      console.error(`?? [PAIRING] Erro ao atualizar DB:`, dbErr);
    }

    // 4. Notificar frontend sobre falha espec�fica
    broadcastToUser(userId, {
      type: "disconnected",
      reason: "pairing_failed"
    });

    return null;
  } finally {
    // Remover da fila de pendentes
    pendingPairingRequests.delete(userId);
  }
  })();
  
  // Adicionar ? fila de pendentes
  pendingPairingRequests.set(userId, requestPromise);
  
  return requestPromise;
}

// -----------------------------------------------------------------------
// ?? ENVIAR MENSAGEM VIA WHATSAPP DO ADMIN
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// ??? ANTI-SPAM (ADMIN AUTO SEND)
// -----------------------------------------------------------------------
// Protege contra loops acidentais (follow-up/recovery) que podem enviar v?rias
// mensagens parecidas para o mesmo lead.
//
// Regra: limitar bursts por n?mero e impor cooldown m?nimo.
// Observa??o: envios manuais do admin normalmente N?O usam sendAdminMessage.

type AdminAutoSendState = {
  windowStart: number;
  count: number;
  lastSentAt: number;
  lastNorm: string;
};

const adminAutoSendState = new Map<string, AdminAutoSendState>();
const ADMIN_AUTOSEND_WINDOW_MS = 20 * 60 * 1000;
const ADMIN_AUTOSEND_MAX_PER_WINDOW = 3;
const ADMIN_AUTOSEND_MIN_INTERVAL_MS = 90 * 1000;
const ADMIN_AUTOSEND_IDENTICAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function normalizeAutoSendText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?-??]/g, '')
    .trim()
    .slice(0, 400);
}

export async function sendAdminMessage(
  toNumber: string, 
  text: string,
  media?: {
    type: "image" | "audio" | "video" | "document";
    buffer: Buffer;
    mimetype: string;
    filename?: string;
    caption?: string;
  }
): Promise<boolean> {
  try {
    const allAdmins = await storage.getAllAdmins();
    const adminUser = allAdmins.find(a => a.role === 'owner');
    
    if (!adminUser) {
      console.error("[ADMIN MSG] Admin n?o encontrado");
      return false;
    }
    
    const adminSession = adminSessions.get(adminUser.id);
    
    if (!adminSession?.socket) {
      console.error("[ADMIN MSG] Sess?o do admin n?o encontrada");
      return false;
    }
    
    const cleanNumber = toNumber.replace(/\D/g, "");
    const nowMs = Date.now();
    const norm = normalizeAutoSendText(text);
    const prev = adminAutoSendState.get(cleanNumber);

    if (prev) {
      const inWindow = nowMs - prev.windowStart < ADMIN_AUTOSEND_WINDOW_MS;
      const tooSoon = nowMs - prev.lastSentAt < ADMIN_AUTOSEND_MIN_INTERVAL_MS;
      const identicalTooSoon = prev.lastNorm && norm && prev.lastNorm === norm && (nowMs - prev.lastSentAt) < ADMIN_AUTOSEND_IDENTICAL_COOLDOWN_MS;
      const tooMany = inWindow && prev.count >= ADMIN_AUTOSEND_MAX_PER_WINDOW;

      if (identicalTooSoon || tooSoon || tooMany) {
        console.warn(`??? [ADMIN MSG] Bloqueado por anti-spam para ${cleanNumber}: ` +
          (identicalTooSoon ? 'texto id?ntico recente' : tooSoon ? 'cooldown' : 'burst')); 
        return false;
      }
    }

    // Reserve slot (prevents concurrent loops from flooding before the first send completes)
    const nextState: AdminAutoSendState = prev && (nowMs - prev.windowStart < ADMIN_AUTOSEND_WINDOW_MS)
      ? { windowStart: prev.windowStart, count: prev.count + 1, lastSentAt: nowMs, lastNorm: norm }
      : { windowStart: nowMs, count: 1, lastSentAt: nowMs, lastNorm: norm };
    adminAutoSendState.set(cleanNumber, nextState);

    const jid = `${cleanNumber}@${DEFAULT_JID_SUFFIX}`;
    
    if (media) {
      // Enviar m?dia com delay anti-bloqueio
      switch (media.type) {
        case "image":
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'admin msg imagem', async () => {
            await adminSession.socket!.sendMessage(jid, {
              image: media.buffer,
              caption: media.caption || text,
              mimetype: media.mimetype,
            });
          });
          break;
        case "audio":
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'admin msg ?udio', async () => {
            await adminSession.socket!.sendMessage(jid, {
              audio: media.buffer,
              mimetype: media.mimetype,
              ptt: true, // Enviar como ?udio de voz
            });
          });
          break;
        case "video":
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'admin msg v?deo', async () => {
            await adminSession.socket!.sendMessage(jid, {
              video: media.buffer,
              caption: media.caption || text,
              mimetype: media.mimetype,
            });
          });
          break;
        case "document":
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'admin msg documento', async () => {
            await adminSession.socket!.sendMessage(jid, {
              document: media.buffer,
              fileName: media.filename || "documento",
              mimetype: media.mimetype,
            });
          });
          break;
      }
    } else {
      // ??? ANTI-BLOQUEIO: Enviar apenas texto
      await sendWithQueue('ADMIN_AGENT', 'admin msg texto', async () => {
        await adminSession.socket!.sendMessage(jid, { text });
      });
    }
    
    console.log(`? [ADMIN MSG] Mensagem enviada para ${cleanNumber}`);
    return true;
  } catch (error) {
    console.error("[ADMIN MSG] Erro ao enviar mensagem:", error);
    return false;
  }
}

// -----------------------------------------------------------------------
// ?? INTEGRA??O: FOLLOW-UPS / AGENDAMENTOS ? ENVIO PELO WHATSAPP DO ADMIN
// -----------------------------------------------------------------------

registerFollowUpCallback(async (phoneNumber: string, context: string) => {
  try {
    const { generateFollowUpResponse } = await import("./adminAgentService");
    const text = await generateFollowUpResponse(phoneNumber, context);
    if (!text?.trim()) return { success: false, error: "Mensagem vazia gerada" };
    await sendAdminMessage(phoneNumber, text);
    return { success: true, message: text };
  } catch (error) {
    console.error("[FOLLOW-UP] Erro ao executar callback de follow-up:", error);
    return { success: false, error: String(error) };
  }
});

registerScheduledContactCallback(async (phoneNumber: string, reason: string) => {
  try {
    const { generateScheduledContactResponse } = await import("./adminAgentService");
    const text = await generateScheduledContactResponse(phoneNumber, reason);
    if (!text?.trim()) return;
    await sendAdminMessage(phoneNumber, text);
  } catch (error) {
    console.error("[AGENDAMENTO] Erro ao executar callback de agendamento:", error);
  }
});

// -------------------------------------------------------------------------------
// ?? HEALTH CHECK MONITOR - RECONEX?O AUTOM?TICA DE SESS?ES
// -------------------------------------------------------------------------------
// Este sistema verifica periodicamente se as conex?es do WhatsApp est?o saud?veis.
// Se detectar que uma conex?o est? marcada como "conectada" no banco mas n?o tem
// socket ativo na mem?ria, tenta reconectar automaticamente.
//
// Intervalo: A cada 5 minutos (300.000ms)
// Isso resolve problemas de:
// - Desconex?es silenciosas por timeout de rede
// - Perda de conex?o durante restarts do container
// - Sess?es "zumbis" no banco de dados
// -------------------------------------------------------------------------------

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const HEALTH_CHECK_INITIAL_DELAY_MS = Math.max(
  Number(process.env.WA_HEALTH_CHECK_INITIAL_DELAY_MS || 60_000),
  5_000,
);
let healthCheckInterval: NodeJS.Timeout | null = null;

async function connectionHealthCheck(): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: N?o executar health check
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    return;
  }

  // ?? RESTORE GUARD: block only for a short window, then let health-check run
  if (_isRestoringInProgress) {
    const restoreAgeMs = _restoreStartedAt > 0 ? Date.now() - _restoreStartedAt : 0;
    if (restoreAgeMs < RESTORE_GUARD_MAX_BLOCK_MS) {
      console.log(
        `[HEALTH CHECK] ? Skipped � session restore still in progress (${Math.round(restoreAgeMs / 1000)}s/${Math.round(RESTORE_GUARD_MAX_BLOCK_MS / 1000)}s guard)`
      );
      return;
    }
    console.log(
      `[HEALTH CHECK] ?? Restore guard stale (${Math.round(restoreAgeMs / 1000)}s). Running health check anyway.`
    );
  }
  
  console.log(`\n?? [HEALTH CHECK] -------------------------------------------`);
  console.log(`?? [HEALTH CHECK] Iniciando verifica??o de conex?es...`);
  console.log(`?? [HEALTH CHECK] Timestamp: ${new Date().toISOString()}`);
  
  // ?? Evict stale pending connection locks before any reconnection attempt
  evictStalePendingLocks();
  evictStalePendingAdminLocks();
  
  try {
    // 1. Verificar conex�es de usu�rios (Multi-connection: check ALL connections individually)
    const connections = await storage.getAllConnections();
    let reconnectedUsers = 0;
    let healedUsers = 0;  // DB=false mas socket ativo (curado)
    let healthyUsers = 0;
    let disconnectedUsers = 0;
    
    for (const connection of connections) {
      if (!connection.userId) continue;
      
      const isDbConnected = connection.isConnected;
      // Check session by connectionId (each connection has its own socket)
      const session = sessions.get(connection.id);
      const hasActiveSocket = hasOperationalSocket(session);
      
      if (isDbConnected && !hasActiveSocket) {
        // ?? Conex?o "zumbi" detectada - DB diz conectado mas n?o tem socket
        console.log(`?? [HEALTH CHECK] Conex?o zumbi detectada: ${connection.userId}`);
        console.log(`   ?? DB: isConnected=${isDbConnected}, Socket: ${hasActiveSocket ? 'ATIVO' : 'INATIVO'}`);
        
        // Check auth files at auth_{userId} OR auth_{connectionId} (dual-path lookup)
        let authPath = path.join(SESSIONS_BASE, `auth_${connection.userId}`);
        let hasAuthFiles = false;
        
        try {
          const authFiles = await fs.readdir(authPath);
          hasAuthFiles = authFiles.length > 0;
        } catch (e) {
          // Directory doesn't exist
        }
        
        // Fallback: check auth_{connectionId}
        if (!hasAuthFiles && connection.id !== connection.userId) {
          const connAuthPath = path.join(SESSIONS_BASE, `auth_${connection.id}`);
          try {
            const connAuthFiles = await fs.readdir(connAuthPath);
            if (connAuthFiles.length > 0) {
              hasAuthFiles = true;
              console.log(`[HEALTH CHECK] Found auth at auth_${connection.id.substring(0, 8)} (connectionId path)`)
            }
          } catch (e) { /* no auth */ }
        }
        
        if (hasAuthFiles) {
          console.log(`[HEALTH CHECK] Tentando reconectar connection ${connection.id}...`);
          try {
            await connectWhatsApp(connection.userId, connection.id, { source: "health_check" });
            
            // ?? SECTION 3: Validate isOpen before declaring success
            const reconnectedSession = sessions.get(connection.id);
            let isOpenValidated = reconnectedSession?.isOpen === true;
            if (!isOpenValidated) {
              const HEALTH_OPEN_TIMEOUT_MS = 8000;
              const HEALTH_OPEN_POLL_MS = 500;
              const deadline = Date.now() + HEALTH_OPEN_TIMEOUT_MS;
              while (Date.now() < deadline) {
                await new Promise(r => setTimeout(r, HEALTH_OPEN_POLL_MS));
                const s = sessions.get(connection.id);
                if (s?.isOpen === true) {
                  isOpenValidated = true;
                  break;
                }
              }
            }
            
            if (isOpenValidated) {
              reconnectedUsers++;
              console.log(`? [HEALTH CHECK] Connection ${connection.id} reconectado e isOpen=true!`);
            } else {
              console.log(`?? [HEALTH CHECK] HEALTH_RECONNECT_NOT_OPEN: Connection ${connection.id} � connectWhatsApp() retornou mas isOpen ainda false ap�s 8s`);
              // Don't count as reconnected � will retry on next health check
            }
          } catch (error: any) {
            if (error?.code === "WA_OPEN_TIMEOUT_COOLDOWN") {
              console.log(`[HEALTH CHECK] Cooldown ativo para connection ${connection.id} - tentativa adiada`);
            } else {
              console.error(`[HEALTH CHECK] Falha ao reconectar connection ${connection.id}:`, error);
            }
            // SAFE: Do NOT mark is_connected=false. Will retry on next health check (5 min).
            console.log(`[HEALTH CHECK] Ser� tentado novamente no pr�ximo health check.`);
          }
        } else {
          console.log(`?? [HEALTH CHECK] ${connection.userId} sem arquivos de auth - marcando como desconectado`);
          await storage.updateConnection(connection.id, {
            isConnected: false,
            qrCode: null,
          });
          disconnectedUsers++;
        }
      } else if (isDbConnected && hasActiveSocket) {
        // -----------------------------------------------------------------------
        // FIX 2026-02-24: STUCK CONNECTION DETECTION
        // Session has socket with user credential, but isOpen may be false
        // meaning connection.update never fired with "open" state.
        // This catches sessions stuck in "connection: undefined" loop.
        // -----------------------------------------------------------------------
        if (session && session.isOpen === false && session.createdAt) {
          // Recover sessions that are already authenticated but never emitted conn=open.
          if (promoteSessionOpenState(session, 'health_check_socket_ready')) {
            clearPendingConnectionLock(connection.id, 'health_promote_open');
            clearPendingConnectionLock(connection.userId, 'health_promote_open');
            console.log(`? [HEALTH CHECK] Promoted isOpen=true for ${connection.id.substring(0, 8)} using socket.user/ws readiness`);
            healthyUsers++;
            continue;
          }

          const stuckDurationMs = Date.now() - session.createdAt;
          const STUCK_THRESHOLD_MS = 300_000; // 5 minutes � give Baileys time to negotiate
          if (stuckDurationMs > STUCK_THRESHOLD_MS) {
            // Connection has been stuck for 5+ min without reaching "open".
            // End socket so zombie handler can reconnect on next health check cycle.
            console.log(`?? [HEALTH CHECK] STUCK CONNECTION: user ${connection.userId.substring(0, 8)} conn ${connection.id.substring(0, 8)} � isOpen=false for ${Math.round(stuckDurationMs / 1000)}s. Cleaning socket (zombie handler will reconnect).`);
            try {
              if (session.openTimeout) { clearTimeout(session.openTimeout); session.openTimeout = undefined; }
              session.socket?.ev?.removeAllListeners('connection.update');
              session.socket?.ev?.removeAllListeners('creds.update');
              session.socket?.end(new Error('Health check: stuck connection'));
            } catch(e) { /* ignore */ }
            sessions.delete(connection.id);
            clearPendingConnectionLock(connection.id, 'health_stuck_cleanup');
            clearPendingConnectionLock(connection.userId, 'health_stuck_cleanup');
            // Don't count as disconnected � DB stays is_connected=true
            // Next health check cycle will detect as zombie and reconnect
          } else {
            // Still within grace period, count as healthy
            healthyUsers++;
          }
        } else {
          healthyUsers++;
        }
      } else if (!isDbConnected && hasActiveSocket) {
        // -----------------------------------------------------------------------
        // ?? HEALER: DB=false mas socket ativo (caso inverso do zumbi)
        // -----------------------------------------------------------------------
        // Isso acontece quando:
        // 1. Um follower atualizou DB para false incorretamente
        // 2. O l�der reconectou mas n�o atualizou o DB ainda
        // 3. Deploy/reconnect causou discrep�ncia tempor�ria
        //
        // Como estamos no l�der (health check s� roda no l�der),
        // podemos curar o estado global.
        // -----------------------------------------------------------------------
        console.log(`?? [HEALTH CHECK] CURANDO user ${connection.userId.substring(0, 8)}...: DB=false mas socket ATIVO`);

        try {
          const phoneNumber = session.socket.user.id.split(':')[0];
          await storage.updateConnection(connection.id, {
            isConnected: true,
            phoneNumber,
            qrCode: null,
          });
          console.log(`? [HEALTH CHECK] User ${connection.userId.substring(0, 8)}... curado - DB atualizado para connected`);
          healedUsers++;
        } catch (healErr) {
          console.error(`? [HEALTH CHECK] Erro ao curar user ${connection.userId.substring(0, 8)}...:`, healErr);
        }
      }
    }

    // 2. Verificar conex�es de admin
    const allAdmins = await storage.getAllAdmins();
    let reconnectedAdmins = 0;
    let healedAdmins = 0;
    let healthyAdmins = 0;
    
    for (const admin of allAdmins) {
      const adminConnection = await storage.getAdminWhatsappConnection(admin.id);
      if (!adminConnection) continue;
      
      const isDbConnected = adminConnection.isConnected;
      const adminSession = adminSessions.get(admin.id);
      const adminWsReadyState = (adminSession?.socket as any)?.ws?.readyState;
      const hasActiveSocket =
        adminSession?.socket?.user !== undefined &&
        (adminWsReadyState === undefined || adminWsReadyState === 1);
      
      if (isDbConnected && !hasActiveSocket) {
        console.log(`?? [HEALTH CHECK] Admin conex?o zumbi: ${admin.id}`);
        
        const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${admin.id}`);
        let hasAuthFiles = false;
        
        try {
          const authFiles = await fs.readdir(adminAuthPath);
          hasAuthFiles = authFiles.length > 0;
        } catch (e) {
          // Diret?rio n?o existe
        }
        
        if (hasAuthFiles) {
          console.log(`?? [HEALTH CHECK] Tentando reconectar admin ${admin.id}...`);
          try {
            await connectAdminWhatsApp(admin.id);
            reconnectedAdmins++;
            console.log(`? [HEALTH CHECK] Admin ${admin.id} reconectado!`);
          } catch (error) {
            console.error(`? [HEALTH CHECK] Falha ao reconectar admin ${admin.id}:`, error);
            await storage.updateAdminWhatsappConnection(admin.id, {
              isConnected: false,
              qrCode: null,
            });
          }
        } else {
          await storage.updateAdminWhatsappConnection(admin.id, {
            isConnected: false,
            qrCode: null,
          });
        }
      } else if (isDbConnected && hasActiveSocket) {
        healthyAdmins++;
      } else if (!isDbConnected && hasActiveSocket) {
        // -----------------------------------------------------------------------
        // ?? HEALER: Admin DB=false mas socket ativo
        // -----------------------------------------------------------------------
        console.log(`?? [HEALTH CHECK] CURANDO admin ${admin.id}: DB=false mas socket ATIVO`);

        try {
          const phoneNumber = adminSession.socket.user.id.split(':')[0];
          await storage.updateAdminWhatsappConnection(admin.id, {
            isConnected: true,
            phoneNumber,
            qrCode: null,
          });
          console.log(`? [HEALTH CHECK] Admin ${admin.id} curado - DB atualizado para connected`);
          healedAdmins++;
        } catch (healErr) {
          console.error(`? [HEALTH CHECK] Erro ao curar admin ${admin.id}:`, healErr);
        }
      } else if (!isDbConnected && !hasActiveSocket) {
        // -----------------------------------------------------------------------
        // ?? 4th branch: DB=false, no socket, but auth files exist on disk
        // This happens after deploy/restart when restore failed with timeout
        // and set isConnected=false. Auth files are still valid, so reconnect.
        // -----------------------------------------------------------------------
        if (_isAdminRestoringInProgress) {
          console.log(`?? [HEALTH CHECK] Admin ${admin.id} desconectado - restore still in progress, skipping`);
          continue;
        }
        const adminAuthPath4 = path.join(SESSIONS_BASE, `auth_admin_${admin.id}`);
        let hasAuthFiles4 = false;
        try {
          const authFiles4 = await fs.readdir(adminAuthPath4);
          hasAuthFiles4 = authFiles4.some(f => f.includes('creds'));
        } catch (e) {
          // Directory doesn't exist
        }
        if (hasAuthFiles4) {
          console.log(`?? [HEALTH CHECK] Admin ${admin.id} desconectado mas tem auth files. Tentando reconectar...`);
          try {
            await connectAdminWhatsApp(admin.id);
            reconnectedAdmins++;
            console.log(`? [HEALTH CHECK] Admin ${admin.id} reconectado a partir de auth files!`);
          } catch (error) {
            console.error(`? [HEALTH CHECK] Falha ao reconectar admin ${admin.id} (4th branch):`, error);
          }
        }
      }
    }

    console.log(`\n?? [HEALTH CHECK] Resumo:`);
    console.log(`   ?? Usu�rios: ${healthyUsers} saud�veis, ${healedUsers} curados, ${reconnectedUsers} reconectados, ${disconnectedUsers} desconectados`);
    console.log(`   ?? Admins: ${healthyAdmins} saud�veis, ${healedAdmins} curados, ${reconnectedAdmins} reconectados`);
    console.log(`?? [HEALTH CHECK] -------------------------------------------\n`);
    
  } catch (error) {
    console.error(`? [HEALTH CHECK] Erro no health check:`, error);
  }
}

export function startConnectionHealthCheck(): void {
  // ??? MODO DESENVOLVIMENTO: N?o iniciar health check
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log("?? [HEALTH CHECK] Desabilitado em modo desenvolvimento");
    return;
  }
  
  if (healthCheckInterval) {
    console.log("?? [HEALTH CHECK] J? est? rodando");
    return;
  }
  
  console.log(`\n?? [HEALTH CHECK] Iniciando monitor de conex?es...`);
  console.log(`   ?? Intervalo: ${HEALTH_CHECK_INTERVAL_MS / 1000 / 60} minutos`);
  console.log(`   ?? Primeira execu��o em: ${Math.round(HEALTH_CHECK_INITIAL_DELAY_MS / 1000)}s`);
  
  // Executar primeiro check cedo; restore guard impede reconex�es agressivas.
  setTimeout(() => {
    connectionHealthCheck();
  }, HEALTH_CHECK_INITIAL_DELAY_MS);
  
  // Agendar checks peri?dicos
  healthCheckInterval = setInterval(() => {
    connectionHealthCheck();
  }, HEALTH_CHECK_INTERVAL_MS);
  
  console.log(`? [HEALTH CHECK] Monitor iniciado com sucesso!\n`);
}

export function stopConnectionHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log("?? [HEALTH CHECK] Monitor parado");
  }
}

// Exportar fun��o para check manual (�til para debug)
export { connectionHealthCheck };

// ==================== RESTORE PENDING AI TIMERS ====================
// ?? Restaura timers de resposta da IA que estavam pendentes antes do restart
// Isso garante que mensagens n�o sejam perdidas em deploys/crashes
export async function restorePendingAITimers(): Promise<void> {
  // ?? MODO DEV: Pular restaura��o de timers se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`?? [RESTORE TIMERS] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`?? [RESTORE TIMERS] Iniciando restaura��o de timers pendentes...`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // Buscar todos os timers pendentes do banco
    const pendingTimers = await storage.getPendingAIResponsesForRestore();
    
    if (pendingTimers.length === 0) {
      console.log(`? [RESTORE TIMERS] Nenhum timer pendente para restaurar`);
      return;
    }
    
    console.log(`?? [RESTORE TIMERS] Encontrados ${pendingTimers.length} timers para restaurar`);
    
    let restored = 0;
    let skipped = 0;
    let processed = 0;
    
    for (const timer of pendingTimers) {
      const { conversationId, userId, contactNumber, jidSuffix, messages, executeAt } = timer;
      
      // Verificar se j� tem timer em mem�ria
      if (pendingResponses.has(conversationId)) {
        console.log(`?? [RESTORE TIMERS] ${contactNumber} - J� tem timer em mem�ria, pulando`);
        skipped++;
        continue;
      }
      
      // Verificar se j� est� sendo processada
      if (conversationsBeingProcessed.has(conversationId)) {
        console.log(`?? [RESTORE TIMERS] ${contactNumber} - Em processamento, pulando`);
        skipped++;
        continue;
      }
      
      // Calcular tempo restante at� execu��o
      const now = Date.now();
      const executeTime = executeAt.getTime();
      const remainingMs = executeTime - now;
      
      // Se o tempo j� passou, processar imediatamente (com pequeno delay)
      if (remainingMs <= 0) {
        console.log(`?? [RESTORE TIMERS] ${contactNumber} - Timer expirado, processando AGORA`);
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages,
          conversationId,
          userId,
          connectionId: timer.connectionId,
          contactNumber,
          jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: Date.now() - Math.abs(remainingMs), // Tempo original
        };
        
        // Processar com delay escalonado para n�o sobrecarregar
        const delayMs = processed * 3000; // 3s entre cada
        pending.timeout = setTimeout(async () => {
          console.log(`?? [RESTORE TIMERS] Processando timer restaurado para ${contactNumber}`);
          await processAccumulatedMessages(pending);
        }, delayMs + 1000); // M�nimo 1s
        
        pendingResponses.set(conversationId, pending);
        processed++;
        restored++;
        
      } else {
        // Timer ainda n�o expirou, re-agendar normalmente
        console.log(`? [RESTORE TIMERS] ${contactNumber} - Reagendando em ${Math.round(remainingMs/1000)}s`);
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages,
          conversationId,
          userId,
          connectionId: timer.connectionId,
          contactNumber,
          jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: Date.now() - (executeTime - now), // Calcular tempo original
        };
        
        pending.timeout = setTimeout(async () => {
          console.log(`?? [RESTORE TIMERS] Executando timer restaurado para ${contactNumber}`);
          await processAccumulatedMessages(pending);
        }, remainingMs);
        
        pendingResponses.set(conversationId, pending);
        restored++;
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`? [RESTORE TIMERS] Restaura��o conclu�da!`);
    console.log(`   ?? Total encontrados: ${pendingTimers.length}`);
    console.log(`   ? Restaurados: ${restored}`);
    console.log(`   ?? Pulados: ${skipped}`);
    console.log(`   ?? Processados imediatamente: ${processed}`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`? [RESTORE TIMERS] Erro na restaura��o:`, error);
  }
}

// ==================== CRON JOB: RETRY TIMERS PENDENTES ====================
// Verifica a cada 15 segundos se h� timers pendentes "�rf�os" e os processa
// Isso garante que nenhuma mensagem fique sem resposta, mesmo ap�s instabilidades
let pendingTimersCronInterval: NodeJS.Timeout | null = null;

export function startPendingTimersCron(): void {
  // ?? MODO DEV: Pular cron de timers pendentes se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`?? [PENDING CRON] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  if (pendingTimersCronInterval) {
    console.log(`?? [PENDING CRON] Cron j� est� rodando`);
    return;
  }
  
  console.log(`?? [PENDING CRON] Iniciando cron de retry de timers pendentes (intervalo: 15s, 25/ciclo)`);
  
  // Executar a cada 15 segundos para maior responsividade
  pendingTimersCronInterval = setInterval(async () => {
    await processPendingTimersCron();
  }, 15 * 1000); // 15 segundos (era 30)
  
  // Primeira execu��o ap�s 10 segundos (dar tempo para sess�es conectarem)
  setTimeout(async () => {
    await processPendingTimersCron();
  }, 10 * 1000);
}

async function processPendingTimersCron(): Promise<void> {
  let distributedCronLock: DistributedLockHandle | null = null;

  if (isRedisAvailable()) {
    const cronLockResult = await tryAcquireDistributedLock(
      WA_REDIS_PENDING_CRON_LOCK_KEY,
      WA_REDIS_PENDING_CRON_LOCK_TTL_MS,
    );
    if (cronLockResult.status === "acquired") {
      distributedCronLock = cronLockResult.lock;
    } else if (cronLockResult.status === "busy") {
      return;
    }
  }

  try {
    // ?? FIX 2026-02-25: READINESS GATE � don't process timers if no sessions are connected yet
    // This prevents timers from exhausting retries during boot before WhatsApp reconnects
    if (sessions.size === 0) {
      console.log(`?? [PENDING CRON] Aguardando sess�es conectarem (readiness gate)...`);
      return;
    }
    
    // Buscar timers pendentes (sem filtro de 2h - LIMIT 200 no query)
    const pendingTimers = await storage.getPendingAIResponsesForRestore();
    
    if (pendingTimers.length === 0) {
      return; // Nada para processar
    }
    
    // -----------------------------------------------------------------------
    // FIX 2026-02-24: STALE TIMER POLICY
    // Timers >24h s�o marcados como failed (o cliente j� desistiu)
    // Timers =24h s�o processados normalmente
    // -----------------------------------------------------------------------
    const STALE_24H_MS = 24 * 60 * 60 * 1000;
    const staleTimers = pendingTimers.filter(t => (Date.now() - t.executeAt.getTime()) > STALE_24H_MS);
    
    if (staleTimers.length > 0) {
      console.log(`??? [PENDING CRON] Marcando ${staleTimers.length} timers >24h como FAILED (stale_over_24h)`);
      for (const stale of staleTimers) {
        try {
          await storage.markPendingAIResponseFailed(stale.conversationId, 'stale_over_24h');
          waObservability.pendingAI_staleFailedOver24h++;
        } catch (e) {
          // Ignore individual failures
        }
      }
    }
    
    // Filtrar apenas os que j� expiraram e n�o est�o em mem�ria (excluir os >24h j� marcados)
    const expiredTimers = pendingTimers.filter(timer => {
      const timeSinceExecute = Date.now() - timer.executeAt.getTime();
      const isExpired = timeSinceExecute > 0;
      const isStale24h = timeSinceExecute > STALE_24H_MS;
      const isInMemory = pendingResponses.has(timer.conversationId);
      let isBeingProcessed = conversationsBeingProcessed.has(timer.conversationId);
      
      // ?? SECTION 4: TTL check � release stale processing locks
      if (isBeingProcessed) {
        const processingStartedAt = conversationsBeingProcessed.get(timer.conversationId)!;
        const processingAge = Date.now() - processingStartedAt;
        if (processingAge > PROCESSING_TTL_MS) {
          console.log(`?? [PENDING CRON] PROCESSING_STALE_RELEASED: ${timer.contactNumber} (conv ${timer.conversationId.substring(0, 8)}) � preso h� ${Math.round(processingAge / 1000)}s, liberando lock`);
          conversationsBeingProcessed.delete(timer.conversationId);
          isBeingProcessed = false;
        }
      }
      
      // ?? DEBUG: Logar por que alguns timers s�o filtrados
      if (isExpired && !isStale24h && (isInMemory || isBeingProcessed)) {
        console.log(`?? [PENDING CRON] ${timer.contactNumber} - Filtrado: inMemory=${isInMemory}, beingProcessed=${isBeingProcessed}`);
      }
      
      return isExpired && !isStale24h && !isInMemory && !isBeingProcessed;
    });
    
    if (expiredTimers.length === 0) {
      if (pendingTimers.length > staleTimers.length) {
        console.log(`?? [PENDING CRON] Ciclo: ${pendingTimers.length} timers (${staleTimers.length} stale removidos), restantes filtrados (em mem�ria/processando/futuros)`);
      }
      return;
    }
    
    console.log(`\n?? [PENDING CRON] =========================================`);
    console.log(`?? [PENDING CRON] Encontrados ${expiredTimers.length} timers �rf�os para processar`);
    console.log(`?? [PENDING CRON] Sess�es ativas: ${sessions.size} | Stale removidos: ${staleTimers.length}`);
    
    let processed = 0;
    let skipped = 0;
    const reconnectAttemptedScopes = new Set<string>(); // Guard: 1 reconnect per connection scope per cron cycle
    
    for (const timer of expiredTimers) {
      const { conversationId, userId, contactNumber, jidSuffix, messages } = timer;
      
      // ?? SECTION 5: Resolver sess�o por connectionId do timer PRIMEIRO,
      // fallback para lookup da conversa e por �ltimo userId.
      let session: WhatsAppSession | undefined;
      let resolvedConnectionId: string | undefined = timer.connectionId;
      
      // Passo 1: usar connectionId retornado diretamente do restore
      if (resolvedConnectionId) {
        const byTimerConnection = sessions.get(resolvedConnectionId);
        if (isSessionReadyForMessaging(byTimerConnection)) {
          if (byTimerConnection) {
            promoteSessionOpenState(byTimerConnection, 'pending_cron_timer_connection');
          }
          session = byTimerConnection;
        }
      }

      // Passo 2: fallback para buscar connection_id atual da conversa
      if (!session && !resolvedConnectionId) {
        try {
          const conversation = await storage.getConversation(conversationId);
          if (conversation?.connectionId) {
            resolvedConnectionId = conversation.connectionId;
            const byConversationConnection = sessions.get(conversation.connectionId);
            if (isSessionReadyForMessaging(byConversationConnection)) {
              if (byConversationConnection) {
                promoteSessionOpenState(byConversationConnection, 'pending_cron_conversation_connection');
              }
              session = byConversationConnection;
            }
          }
        } catch (_convErr) {
          // Non-critical � fallback to userId
        }
      }
      
      // Passo 3: Fallback para userId (SessionMap has userId index)
      if (!session) {
        const userSessions = sessions.getAllByUserId(userId);
        const readyUserSessions = userSessions.filter((candidate) => isSessionReadyForMessaging(candidate));
        if (readyUserSessions.length === 1) {
          session = readyUserSessions[0];
          resolvedConnectionId = session.connectionId;
          promoteSessionOpenState(session, 'pending_cron_user_fallback_single_ready');
        } else if (readyUserSessions.length > 1) {
          console.log(`?? [PENDING CRON] ${contactNumber} - M�ltiplas sess�es prontas para user ${userId.substring(0,8)} sem connectionId. Pulando para evitar envio no n�mero errado.`);
        } else if (userSessions.length === 1) {
          session = userSessions[0];
          resolvedConnectionId = session.connectionId;
          promoteSessionOpenState(session, 'pending_cron_user_fallback_single_session');
        } else if (userSessions.length > 1) {
          console.log(`?? [PENDING CRON] ${contactNumber} - M�ltiplas sess�es para user ${userId.substring(0,8)} sem connectionId. Pulando por ambiguidade.`);
        }
      }
      
      if (!isSessionReadyForMessaging(session)) {
        // -----------------------------------------------------------------------
        // FIX 2026-02-24: Quando sess�o indispon�vel mas DB diz conectado,
        // tentar reconectar ao inv�s de simplesmente pular.
        // Guard: S� tenta reconectar 1x por usu�rio por ciclo do CRON.
        // -----------------------------------------------------------------------
        const reconnectScopeKey = resolvedConnectionId || userId;
        if (!reconnectAttemptedScopes.has(reconnectScopeKey)) {
          let connState = resolvedConnectionId
            ? await storage.getConnectionById(resolvedConnectionId)
            : undefined;
          if (!connState) {
            const userConnections = await storage.getConnectionsByUserId(userId);
            if (userConnections.length === 1) {
              connState = userConnections[0];
              resolvedConnectionId = connState.id;
            } else if (userConnections.length > 1) {
              console.log(`?? [PENDING CRON] ${contactNumber} - N�o foi poss�vel determinar conex�o �nica para reconnect (user ${userId.substring(0,8)}).`);
            }
          }
          const connId = connState?.id || resolvedConnectionId;
          if (connState?.isConnected && connId) {
            const existingSession = sessions.get(connId);
            if (!isSessionReadyForMessaging(existingSession)) {
              console.log(`?? [PENDING CRON] ${contactNumber} - Sess�o indispon�vel (conn: ${connId.substring(0,8)}, userId: ${userId.substring(0,8)}) mas DB=connected. Tentando reconectar...`);
              reconnectAttemptedScopes.add(reconnectScopeKey);
              try {
                await connectWhatsApp(userId, connId, { source: "pending_cron" });
              } catch (reconErr: any) {
                if (reconErr?.code === "WA_OPEN_TIMEOUT_COOLDOWN") {
                  console.log(`?? [PENDING CRON] ${contactNumber} - Cooldown ativo ap�s open_timeout, aguardando pr�ximo ciclo`);
                } else {
                  console.log(`?? [PENDING CRON] ${contactNumber} - Reconex�o falhou, pulando`);
                }
              }
            } else {
              if (existingSession) {
                promoteSessionOpenState(existingSession, 'pending_cron_existing_ready');
              }
              console.log(`?? [PENDING CRON] ${contactNumber} - Socket j� est� operacional (isOpen=${existingSession?.isOpen}), aguardando pr�ximo ciclo`);
            }
          } else {
            console.log(`?? [PENDING CRON] ${contactNumber} - Sess�o indispon�vel (DB: connected=${connState?.isConnected || false})`);
          }
        }
        skipped++;
        waObservability.pendingAI_cronSkipped++;
        continue;
      }
      
      // Calcular quanto tempo desde que deveria ter executado
      const timeSinceExecute = Date.now() - timer.executeAt.getTime();
      
      if (timeSinceExecute > 2 * 60 * 60 * 1000) {
        console.log(`?? [PENDING CRON] ${contactNumber} - Timer antigo (${Math.round(timeSinceExecute/60000)}min), processando com prioridade!`);
      } else if (timeSinceExecute > 30 * 60 * 1000) {
        console.log(`?? [PENDING CRON] ${contactNumber} - Timer atrasado (${Math.round(timeSinceExecute/60000)}min), PROCESSANDO AGORA!`);
      }
      
      console.log(`?? [PENDING CRON] Processando ${contactNumber} (timer �rf�o h� ${Math.round(timeSinceExecute/1000)}s)`);
      
      // Criar objeto PendingResponse e processar
      const pending: PendingResponse = {
        timeout: null as any,
        messages,
        conversationId,
        userId,
        connectionId: resolvedConnectionId,
        contactNumber,
        jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
        startTime: timer.scheduledAt.getTime(),
      };
      
      // Processar com delay escalonado (1.5s entre cada para evitar ban)
      const delayMs = processed * 1500;
      setTimeout(async () => {
        await processAccumulatedMessages(pending);
      }, delayMs);
      
      processed++;
      waObservability.pendingAI_cronProcessed++;
      
      // Limitar a 25 por ciclo
      if (processed >= 25) {
        console.log(`?? [PENDING CRON] Limite de 25 por ciclo atingido, continuar� no pr�ximo ciclo`);
        break;
      }
    }
    
    console.log(`?? [PENDING CRON] Ciclo conclu�do: ${processed} processados, ${skipped} pulados`);
    console.log(`?? [PENDING CRON] =========================================\n`);
    
  } catch (error) {
    console.error(`? [PENDING CRON] Erro no cron:`, error);
  } finally {
    if (distributedCronLock) {
      await releaseDistributedLock(distributedCronLock);
    }
  }
}

export function stopPendingTimersCron(): void {
  if (pendingTimersCronInterval) {
    clearInterval(pendingTimersCronInterval);
    pendingTimersCronInterval = null;
    console.log(`?? [PENDING CRON] Cron parado`);
  }
}

// ==================== CRON JOB: AUTO-RECUPERA��O DE RESPOSTAS FALHADAS ====================
// Verifica a cada 5 minutos se h� timers "completed" que na verdade n�o receberam resposta
// Isso � um "safety net" para garantir que nenhum cliente fique sem resposta
let autoRecoveryCronInterval: NodeJS.Timeout | null = null;

export function startAutoRecoveryCron(): void {
  // ?? MODO DEV: Pular cron de auto-recovery se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`?? [AUTO-RECOVERY] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  if (autoRecoveryCronInterval) {
    console.log(`?? [AUTO-RECOVERY] Cron j� est� rodando`);
    return;
  }
  
  console.log(`?? [AUTO-RECOVERY] Iniciando cron de auto-recupera��o (intervalo: 5min)`);
  
  // Executar a cada 5 minutos
  autoRecoveryCronInterval = setInterval(async () => {
    await processAutoRecovery();
  }, 5 * 60 * 1000); // 5 minutos
  
  // Primeira execu��o ap�s 2 minutos
  setTimeout(async () => {
    await processAutoRecovery();
  }, 2 * 60 * 1000);
}

async function processAutoRecovery(): Promise<void> {
  try {
    // Buscar timers "completed" que n�o t�m resposta real
    const failedTimers = await storage.getCompletedTimersWithoutResponse();
    
    // ?? FIX 2026-02-25: Also recover "failed" timers with transient reasons
    const transientFailed = await storage.getFailedTransientTimers();
    
    if (failedTimers.length === 0 && transientFailed.length === 0) {
      return; // Nada para recuperar
    }
    
    console.log(`\n?? [AUTO-RECOVERY] =========================================`);
    console.log(`?? [AUTO-RECOVERY] Encontrados ${failedTimers.length} completed sem resposta + ${transientFailed.length} failed transit�rios`);
    
    let recovered = 0;
    let skipped = 0;
    
    // Process completed-without-response timers first
    
    for (const timer of failedTimers) {
      const { conversationId, userId, contactNumber, jidSuffix, messages } = timer;
      
      // Verificar se j� est� em processamento
      if (conversationsBeingProcessed.has(conversationId)) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - Em processamento, pulando`);
        skipped++;
        continue;
      }
      
      // Verificar se j� tem timer em mem�ria
      if (pendingResponses.has(conversationId)) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - J� tem timer ativo, pulando`);
        skipped++;
        continue;
      }
      
      // Resolver conex�o da conversa para evitar enviar pelo n�mero errado em multi-conex�o
      const conversation = await storage.getConversation(conversationId);
      if (!conversation?.connectionId) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - Conversa sem connectionId, pulando`);
        skipped++;
        continue;
      }
      const scopedConnection = await storage.getConnectionById(conversation.connectionId);
      if (!scopedConnection || scopedConnection.userId !== userId) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - Escopo inv�lido da conversa (${conversation.connectionId}), pulando`);
        skipped++;
        continue;
      }
      if (scopedConnection.aiEnabled === false) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - IA desativada para conex�o ${conversation.connectionId}, pulando`);
        skipped++;
        continue;
      }

      // Verificar se a sess�o da conex�o da conversa est� dispon�vel
      const session = sessions.get(conversation.connectionId);
      if (!isSessionReadyForMessaging(session)) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - Sess�o ${conversation.connectionId.substring(0,8)}... indispon�vel, pulando`);
        skipped++;
        continue;
      }
      
      console.log(`?? [AUTO-RECOVERY] Recuperando resposta para ${contactNumber} (conn: ${conversation.connectionId.substring(0,8)}..., ${messages.length} msgs)`);
      
      // Resetar o timer para pending
      await storage.resetPendingAIResponseForRetry(conversationId);
      
      // Criar objeto PendingResponse
      // NOTA: Cada WhatsApp (userId) tem sua PR�PRIA fila no messageQueueService
      // N�o precisamos escalonar aqui - a fila anti-ban cuida de tudo
      const pending: PendingResponse = {
        timeout: null as any,
        messages,
        conversationId,
        userId,
        connectionId: conversation.connectionId,
        contactNumber,
        jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
        startTime: Date.now(),
      };
      
      // Processar imediatamente - a fila do messageQueueService vai organizar
      // Cada userId tem sua pr�pria fila, ent�o m�ltiplos WhatsApps podem processar em paralelo
      processAccumulatedMessages(pending).catch(err => {
        console.error(`? [AUTO-RECOVERY] Erro ao processar ${contactNumber}:`, err);
      });
      
      recovered++;
      
      // Limitar quantidade por ciclo para n�o sobrecarregar o servidor
      if (recovered >= 10) {
        console.log(`?? [AUTO-RECOVERY] Limite de 10 por ciclo atingido, continuar� no pr�ximo`);
        break;
      }
    }
    
    // ?? FIX 2026-02-25: Recover failed transient timers
    for (const timer of transientFailed) {
      if (recovered >= 15) break; // Limit total per cycle
      
      const { conversationId, userId, contactNumber, jidSuffix, messages, failureReason, retryCount } = timer;
      
      // Verificar se j� est� em processamento
      if (conversationsBeingProcessed.has(conversationId) || pendingResponses.has(conversationId)) {
        skipped++;
        continue;
      }
      
      // Resolver conex�o da conversa para evitar enviar pelo n�mero errado em multi-conex�o
      const conversation = await storage.getConversation(conversationId);
      if (!conversation?.connectionId) {
        skipped++;
        continue;
      }
      const scopedConnection = await storage.getConnectionById(conversation.connectionId);
      if (!scopedConnection || scopedConnection.userId !== userId || scopedConnection.aiEnabled === false) {
        skipped++;
        continue;
      }

      // Verificar sess�o da conex�o da conversa
      const session = sessions.get(conversation.connectionId);
      if (!isSessionReadyForMessaging(session)) {
        skipped++;
        continue;
      }
      
      console.log(`?? [AUTO-RECOVERY] Recuperando FAILED transit�rio: ${contactNumber} (conn: ${conversation.connectionId.substring(0,8)}, reason: ${failureReason}, retries: ${retryCount})`);
      
      // Reset para pending com retry_count preservado
      await storage.resetPendingAIResponseForRetry(conversationId, 5);
      // Reset in-memory retry counter to give another chance
      pendingRetryCounter.delete(conversationId);
      
      const pending: PendingResponse = {
        timeout: null as any,
        messages,
        conversationId,
        userId,
        connectionId: conversation.connectionId,
        contactNumber,
        jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
        startTime: Date.now(),
      };
      
      processAccumulatedMessages(pending).catch(err => {
        console.error(`? [AUTO-RECOVERY] Erro ao processar failed transit�rio ${contactNumber}:`, err);
      });
      
      recovered++;
    }
    
    console.log(`?? [AUTO-RECOVERY] Ciclo conclu�do: ${recovered} enviados para fila, ${skipped} pulados`);
    console.log(`?? [AUTO-RECOVERY] =========================================\n`);
    
  } catch (error) {
    console.error(`? [AUTO-RECOVERY] Erro no cron:`, error);
  }
}

export function stopAutoRecoveryCron(): void {
  if (autoRecoveryCronInterval) {
    clearInterval(autoRecoveryCronInterval);
    autoRecoveryCronInterval = null;
    console.log(`?? [AUTO-RECOVERY] Cron parado`);
  }
}

// ==================== RE-DOWNLOAD DE M�DIA ====================
// Fun��o para tentar re-baixar m�dia do WhatsApp usando metadados salvos
export async function redownloadMedia(
  connectionId: string,
  mediaKeyBase64: string,
  directPath: string,
  originalUrl: string | undefined,
  mediaType: string,
  mediaMimeType: string
): Promise<{ success: boolean; mediaUrl?: string; error?: string }> {
  try {
    console.log(`?? [REDOWNLOAD] Tentando re-baixar m�dia...`);
    console.log(`?? [REDOWNLOAD] connectionId: ${connectionId}`);
    console.log(`?? [REDOWNLOAD] mediaType: ${mediaType}`);
    console.log(`?? [REDOWNLOAD] directPath: ${directPath?.substring(0, 50)}...`);

    // Encontrar a sess�o ativa para esta conex�o
    const session = Array.from(sessions.values()).find(s => s.connectionId === connectionId);
    
    if (!session || !session.socket) {
      return { 
        success: false, 
        error: "WhatsApp n�o conectado. Conecte-se primeiro para re-baixar m�dias." 
      };
    }

    // Importar downloadContentFromMessage do Baileys
    const { downloadContentFromMessage, MediaType } = await import("@whiskeysockets/baileys");

    // Converter mediaKey de base64 para Uint8Array
    const mediaKey = Buffer.from(mediaKeyBase64, "base64");

    // Mapear tipo de m�dia para MediaType do Baileys
    const mediaTypeMap: { [key: string]: string } = {
      image: "image",
      audio: "audio",
      video: "video",
      document: "document",
      sticker: "sticker",
    };
    const baileysMediaType = mediaTypeMap[mediaType] || "document";

    // Tentar re-baixar usando downloadContentFromMessage
    console.log(`?? [REDOWNLOAD] Chamando downloadContentFromMessage...`);
    
    const stream = await downloadContentFromMessage(
      { 
        mediaKey: mediaKey, 
        directPath: directPath, 
        url: originalUrl 
      },
      baileysMediaType as any
    );

    // Ler o stream para buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    console.log(`? [REDOWNLOAD] M�dia re-baixada: ${buffer.length} bytes`);

    if (buffer.length === 0) {
      return { success: false, error: "M�dia vazia - pode ter expirado no WhatsApp" };
    }

    // Upload para Supabase Storage (fun��o j� est� definida no topo deste arquivo)
    // A fun��o uploadMediaSimple recebe: (buffer, mimeType, originalFileName?)
    const filename = `redownloaded_${Date.now()}.${mediaType}`;
    const newMediaUrl = await uploadMediaSimple(buffer, mediaMimeType, filename);

    if (!newMediaUrl) {
      // SEM fallback para base64 - evitar egress!
      console.warn(`?? [REDOWNLOAD] Falha no upload, m�dia n�o ser� salva`);
      return { success: false, error: "Erro ao fazer upload da m�dia re-baixada" };
    }

    console.log(`? [REDOWNLOAD] Nova URL gerada com sucesso!`);
    return { success: true, mediaUrl: newMediaUrl };

  } catch (error: any) {
    console.error(`? [REDOWNLOAD] Erro ao re-baixar m�dia:`, error);
    
    // Erros comuns do WhatsApp
    if (error.message?.includes("gone") || error.message?.includes("404") || error.message?.includes("expired")) {
      return { success: false, error: "M�dia expirada - n�o est� mais dispon�vel no WhatsApp" };
    }
    if (error.message?.includes("decrypt")) {
      return { success: false, error: "Erro de descriptografia - chave pode estar corrompida" };
    }
    
    return { success: false, error: error.message || "Erro desconhecido ao re-baixar m�dia" };
  }
}


// -------------------------------------------------------------------------------
// ?? SISTEMA DE RECUPERA��O: Registrar processador de mensagens pendentes
// -------------------------------------------------------------------------------
// Este callback permite que o pendingMessageRecoveryService reprocesse mensagens
// que chegaram durante instabilidade/deploys do Railway
// 
// IMPORTANTE: Este c�digo deve ficar no FINAL do arquivo para garantir que
// todas as fun��es necess�rias j� foram definidas
// -------------------------------------------------------------------------------

setTimeout(() => {
  try {
    registerMessageProcessor(async (userId: string, connectionId: string, waMessage: WAMessage) => {
      // Buscar sess�o ativa
      const session = sessions.get(connectionId);
      
      if (!session?.socket) {
        console.log(`?? [RECOVERY] Sess�o n�o encontrada para ${userId.substring(0, 8)}... conn=${connectionId.substring(0, 8)} - pulando`);
        throw new Error('Sess�o n�o dispon�vel');
      }
      
      // Usar a fun��o handleIncomingMessage existente
      await handleIncomingMessage(session, waMessage);
    });
    
    console.log(`?? [RECOVERY] ? Message processor registrado com sucesso!`);
  } catch (err) {
    console.error(`?? [RECOVERY] ? Erro ao registrar message processor:`, err);
  }
}, 1000); // Aguardar 1 segundo para garantir que tudo foi inicializado
