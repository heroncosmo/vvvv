import makeWASocket, {
  DisconnectReason,
  WASocket,
  proto,
  WAMessage,
  downloadMediaMessage,
  jidNormalizedUser,
  jidDecode,
  makeCacheableSignalKeyStore,
  Browsers,
  fetchLatestWaWebVersion,
  normalizeMessageContent,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs/promises";
import { clearBaileysAuthState, useBaileysAuthState } from "./baileysAuthStateStore";
import { registerWhatsAppSession, unregisterWhatsAppSession } from "./whatsappSender";
import { sendMetaCloudMediaMessage, sendMetaCloudTextMessage } from "./metaCloudApi";
import {
  isOfficialCoexistenceConnection,
  WHATSAPP_PROVIDER_STATUS,
} from "./whatsappCoexistence";
import { memoryCache, storage, type PendingAIResponseMutationGuard } from "./storage";
import {
  executeRetryableCodexNoSend,
  readPositiveIntegerEnv,
} from "./codexNoSendRetry";
import { getAccessEntitlement } from "./accessEntitlement";
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
import {
  classifyConversationAttentionOnly,
  generateAIResponse,
  type AIResponseResult,
  type AIResponseOptions,
} from "./aiAgent";
import { evaluateAgentTriggerMatch } from "./agentTriggerGate";
import { executeMediaActions, downloadMediaAsBuffer } from "./mediaService";
import { registerFollowUpCallback, registerScheduledContactCallback, followUpService } from "./followUpService";
import { userFollowUpService } from "./userFollowUpService";
import { supabase } from "./supabaseAuth";
import { messageQueueService } from "./messageQueueService";
import {
  INITIAL_META_STUB_FALLBACK_TEXT,
  UNRESOLVED_INCOMING_STUB_TEXT,
  isTechnicalStubMessage,
  normalizeInitialStubMessageForAI,
} from "./incomingStubFallback";
import {
  buildPendingFirstMessageAgentText,
  buildPendingFirstMessagePendingPayload,
  decidePendingFirstMessageRecovery,
  getPendingFirstMessageRecoveryFromMessages,
  PENDING_FIRST_MESSAGE_INTEREST_TEXT,
  shouldReplacePendingFirstMessagePayloadWithRealText,
  type PendingFirstMessageRecoveryContext,
  type PendingFirstMessageRecoverySource,
} from "./pendingFirstMessageRecovery";
import {
  shouldPromoteIncomingMessageToConversationList,
  type IncomingConversationMessageKind,
} from "./incomingConversationVisibility";
import { db } from "./db";
import { conversations, type Conversation, type WhatsappConnection } from "@shared/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { uploadMediaToStorage } from "./mediaStorageService";
// Mantém mídia manual enviada fora das linhas de mensagem; o buffer ainda alimenta o Baileys.
import { prepareOutgoingMediaForSend } from "./outgoingMediaPersistence";
import { convertToWhatsAppAudio } from "./audioConverter";
import { shouldProcessInboundAdminAutomation } from "./adminConversationPolicy";
import { isAdminLiveAiEnabled } from "./adminMessagingFeaturePolicy";
import { getAudioResponseSettings, processAudioResponseForAgent } from "./audioResponseService";
import { isConfirmedOutgoingMessageStatus } from "./pendingAiDeliveryState";
import { prependWhatsappSignature, resolveAgentSignatureName } from "@shared/agentSignature";
import {
  buildOutgoingMessageFingerprint,
  isOutgoingMessageNearDuplicate,
} from "./outgoingMessageSimilarity";
import {
  joinBubbleMessages,
  parseExplicitBubbleMessages,
  sanitizeAgentResponseTail,
} from "./whatsappMessageSplit";
import {
  buildGatewayTextSendBody,
  buildPlainTextWhatsAppPayload,
  normalizeOutboundTextForCustomer,
} from "./outboundTextPolicy";
import { resolvePendingAIResponseRetryDelaySeconds } from "./pendingAiRetryPolicy";
import { persistTrackedSharedAutomaticOutgoingMessage } from "./trackedAutomaticOutgoing";
import {
  FOLLOWUP_PRIORITY_EMAIL,
  findPriorityUserConversationByContact,
} from "./followupPriorityService";
import {
  consumePendingOutgoingMessageConfirmation,
  rememberOutgoingMessageConfirmation,
} from "./outgoingMessageConfirmation";
import {
  classifyRealtimeMessageUpdate,
  getIgnoredRealtimeIncomingReason,
  isRecoverableRealtimeAppendMessage,
  isRecoverableRealtimePlaceholder,
  shouldProcessRealtimeWhatsappEvent,
  shouldReplayRealtimeChatUpdateMessage,
  shouldRequestRealtimeChatHistorySync,
} from "./whatsappRealtimeEventGate";
import { consumeLeadReplyForConversation, queueConversationLeadQualification } from "./leadIntelligenceService";
import { queueConversationCourseSchedulingInsight } from "./courseSchedulingInsightsService";
import { queueConversationAgendamento2Insight } from "./agendamento2InsightsService";
import { AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID, shouldBlockAutomatedConversationSend } from "./conversationAutoPauseGuard";
import { resolveAutomatedSendOrigin } from "./automatedSendOrigin";
import { applyConversationRoutingDecision } from "./sectorRoutingService";
import { neutralizeMirroredUserConversation } from "./adminConversationMirrorService";
import {
  computePendingConnectionExpiresAt,
  getPairingRequiredCooldownRemainingMs,
  isPendingConnectionExpired,
} from "./whatsappReconnectPolicy";
import {
  describeHistorySyncType,
  shouldAutoReplyRecoveredHistoryMessage,
  shouldPersistRecoveredHistoryMessage,
  shouldSyncHistoryMessageType,
} from "./whatsappHistorySyncPolicy";
import {
  QR_RECONNECT_CUTOFF_DRIFT_MS,
  QR_RECONNECT_PERSISTED_QR_HANDOFF_MAX_AGE_MS,
  getLastQrCodeIssuedAtMsFromSessionData,
  getQrReconnectCutoffMs,
  getUnansweredInboundTextsAtOrAfterQrReconnectCutoff,
  parseTimestampMs,
  shouldSuppressAutoReplyForQrReconnectBacklog,
} from "./whatsappReconnectBacklogPolicy";
import { isPendingAudioTranscriptionText } from "./audioTranscriptionText";
import { sendWebPushToUser } from "./webPushService";
import { evaluateInboundAutomationGuard } from "./inboundAutomationGuard";
// ?? ANTI-REENVIO: Importar serviï¿½o de deduplicaï¿½ï¿½o para proteï¿½ï¿½o contra instabilidade
import { isIncomingMessageProcessed, markIncomingMessageProcessed, canSendMessage, getDeduplicationStats, MessageType, MessageSource } from "./messageDeduplicationService";
// ?? v4.0 ANTI-BAN: Serviï¿½o de proteï¿½ï¿½o contra bloqueio (rate limiting, safe mode, etc)
import { antiBanProtectionService, simulateTyping } from "./antiBanProtectionService";

// ?? SISTEMA DE RECUPERAï¿½ï¿½O DE MENSAGENS PENDENTES
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

import { startBackgroundSync } from "./contactSyncService";
import {
  connectGatewayInstance,
  disconnectGatewayInstance,
  resetGatewayInstance,
  sendGatewayInstanceMedia,
  sendGatewayInstanceText,
} from "./whatsappGatewayClient";
import {
  ensureManagedPhoneConnectionContinuity,
  reconcileDuplicatePhoneConnectionsForUser,
  recoverStructuralFollowUpsForConnection,
} from "./whatsappConnectionContinuity";
import { isUserRemovedConnection } from "./internalSimulatorConnection";
import { mergeConnectionAuditEvent } from "./whatsappConnectionAudit";
import {
  isConnectionOwnedByCurrentProcess,
  isWhatsAppGatewayRuntime,
  resolveWhatsAppConnectionOwner,
} from "./whatsappGatewayOwnership";
import { registerWhatsappRuntimeConnectionResolver } from "./whatsappRuntimeConnectionRegistry";
import {
  addAdminWebSocketClient,
  addWebSocketClient,
  broadcastToAdmin,
  broadcastToUser,
  hasAdminWebSocketClient,
  hasWebSocketClient,
} from "./appRealtime";
import {
  deleteWhatsAppSessionSnapshot,
  scheduleWhatsAppSessionSnapshot,
} from "./whatsappSessionSnapshotService";
import {
  deriveStoredPhoneNumber,
  extractPhoneDigitsFromWhatsAppIdentity,
  isGroupWhatsAppJid,
  normalizeWhatsAppIdentity,
} from "./whatsappContactIdentity";

export { addAdminWebSocketClient, addWebSocketClient, broadcastToUser } from "./appRealtime";

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

interface CachedGroupMetadataEntry {
  id: string;
  subject: string;
  participants?: string[];
  admins?: string[];
  fetchedAt: number;
}

// Cache global de mensagens por userId
const messageCache = new Map<string, Map<string, CachedMessage>>();
const groupMetadataCache = new Map<string, CachedGroupMetadataEntry>();
const GROUP_METADATA_CACHE_TTL_MS = 30 * 60 * 1000;

// TTL do cache: 24 horas
const MESSAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GROUP_HISTORY_SYNC_DEFAULT_WAIT_MS = 6500;
const GROUP_HISTORY_SYNC_FORCE_TIMEOUT_MS = 10000;
const GROUP_HISTORY_SYNC_IDLE_SETTLE_MS = 1200;
const GROUP_HISTORY_SYNC_RECENT_DAYS = 30;
const CHAT_UPDATE_RECOVERY_RECENT_MS = 10 * 60 * 1000;
const CHAT_UPDATE_RECOVERY_MAX_AGE_MS = Math.max(
  Number(process.env.WA_CHAT_UPDATE_RECOVERY_MAX_AGE_MS || 72 * 60 * 60 * 1000),
  CHAT_UPDATE_RECOVERY_RECENT_MS,
);
const CHAT_UPDATE_REPLAY_DEDUPE_TTL_MS = 5 * 60 * 1000;
const CHAT_UPDATE_REPLAY_DELAY_MS = 1200;
const DIRECT_CONVERSATION_HISTORY_RECOVERY_DELAY_MS = 1200;
const DIRECT_CONVERSATION_HISTORY_RECOVERY_COOLDOWN_MS = 2 * 60 * 1000;
const DIRECT_CONVERSATION_HISTORY_RECOVERY_COUNT = 20;
const INCOMING_PROFILE_PICTURE_TIMEOUT_MS = 1200;
const INCOMING_PRESENCE_TIMEOUT_MS = 1200;
const chatUpdateReplayedMessageIds = new Map<string, number>();
const directConversationHistoryRecoveryScheduledAt = new Map<string, number>();

type GroupHistorySyncResult = {
  status: "already_loaded" | "synced" | "skipped" | "timeout";
  importedCount: number;
  requestId?: string;
};

type ConversationHistorySyncResult = GroupHistorySyncResult;

type PendingGroupHistorySync = {
  requestId: string;
  connectionId: string;
  conversationId: string;
  groupJid: string;
  startedAt: number;
  importedCount: number;
  finished: boolean;
  timeout: NodeJS.Timeout;
  settleTimer?: NodeJS.Timeout;
  resolve: (result: GroupHistorySyncResult) => void;
};

type PendingConversationHistorySync = {
  internalId: string;
  requestId?: string;
  connectionId: string;
  conversationId: string;
  targetJid: string;
  startedAt: number;
  importedCount: number;
  finished: boolean;
  timeout: NodeJS.Timeout;
  settleTimer?: NodeJS.Timeout;
  resolve: (result: ConversationHistorySyncResult) => void;
};

// Fun??o para obter o cache de um usu?rio espec?fico
function getUserMessageCache(userId: string): Map<string, CachedMessage> {
  let cache = messageCache.get(userId);
  if (!cache) {
    cache = new Map<string, CachedMessage>();
    messageCache.set(userId, cache);
  }
  return cache;
}

function buildPushPreview(text: string | null | undefined, fallback: string) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return fallback;
  }
  if (normalized.length <= 160) {
    return normalized;
  }
  return `${normalized.slice(0, 157)}...`;
}

function extractTrackedMediaNames(value?: string | null): string[] {
  if (!value) return [];

  const regexes = [
    /\bMEDIA_NAME:([^\s,\]\r\n]+)/gi,
    /\[(?:MEDIA|MIDIA|ENVIAR_MIDIA):([^\]]+)\]/gi,
  ];
  const found = new Set<string>();

  for (const regex of regexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(String(value))) !== null) {
      const mediaName = String(match[1] || "").trim().toUpperCase();
      if (mediaName) {
        found.add(mediaName);
      }
    }
  }

  return Array.from(found);
}

async function notifyInboxUserAboutIncomingMessage(
  userId: string,
  conversation: Pick<Conversation, "id" | "contactName" | "contactNumber">,
  messageText: string | null | undefined,
) {
  try {
    await sendWebPushToUser(userId, {
      title: conversation.contactName || conversation.contactNumber || "Nova mensagem",
      body: buildPushPreview(messageText, "Voce recebeu uma nova mensagem."),
      url: `/conversas/${conversation.id}`,
      tag: `conversation-${conversation.id}`,
      topic: `conv-${conversation.id}`,
      urgency: "high",
      ttlSeconds: 6 * 60 * 60,
      renotify: true,
      vibrate: [180, 80, 180],
      timestamp: Date.now(),
      data: {
        conversationId: conversation.id,
        kind: "incoming_message",
      },
    });
  } catch (error) {
    console.error("[WEB PUSH] Falha ao notificar mensagem recebida:", error);
  }
}

async function resolveLinkedPlatformUserIdFromAdminConversation(conversation: {
  id?: string | null;
  linkedUserId?: string | null;
  contactNumber?: string | null;
}) {
  if (conversation.linkedUserId) {
    return conversation.linkedUserId;
  }

  if (!conversation.contactNumber) {
    return null;
  }

  const linkedUser = await storage.getUserByPhone(conversation.contactNumber);
  if (!linkedUser) {
    return null;
  }

  if (conversation.id) {
    try {
      await storage.updateAdminConversation(conversation.id, { linkedUserId: linkedUser.id });
    } catch (error) {
      console.warn("[WEB PUSH] Falha ao vincular admin conversation ao user:", error);
    }
  }

  return linkedUser.id;
}

async function notifyLinkedPlatformUserAboutAdminOutgoing(
  conversation: {
    id?: string | null;
    linkedUserId?: string | null;
    contactNumber?: string | null;
  },
  text: string | null | undefined,
) {
  try {
    const linkedUserId = await resolveLinkedPlatformUserIdFromAdminConversation(conversation);
    if (!linkedUserId) {
      return;
    }

    await sendWebPushToUser(linkedUserId, {
      title: "AgenteZap",
      body: buildPushPreview(text, "Uma nova mensagem foi enviada para voce no WhatsApp."),
      url: "/conversas",
      tag: `linked-user-${linkedUserId}`,
      topic: `user-${linkedUserId}`,
      urgency: "high",
      ttlSeconds: 6 * 60 * 60,
      renotify: true,
      vibrate: [180, 80, 180],
      timestamp: Date.now(),
      data: {
        kind: "admin_outgoing",
      },
    });
  } catch (error) {
    console.error("[WEB PUSH] Falha ao notificar usuario vinculado:", error);
  }
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
    console.log(`?? [MSG CACHE] Limpeza periï¿½dica: ${totalCleaned} mensagens expiradas removidas`);
  }
}, 30 * 60 * 1000);

// -----------------------------------------------------------------------
// ? MUTEX DE CRIAï¿½ï¿½O DE CONVERSA (FIX DUPLICATAS)
// -----------------------------------------------------------------------
// Previne race condition quando mï¿½ltiplas mensagens do mesmo contato
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
  
  // Se jï¿½ existe um lock ativo, esperar ele terminar e usar o resultado
  const existingLock = conversationCreationLocks.get(lockKey);
  if (existingLock) {
    try {
      await existingLock;
    } catch {}
    // Apï¿½s o lock liberar, buscar a conversa que foi criada
    const existing = await lookupFn();
    if (existing) return { conversation: existing, wasCreated: false };
  }
  
  // Verificar se jï¿½ existe
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
// ??? SISTEMA DE VERIFICAï¿½ï¿½O DE MENSAGENS Nï¿½O PROCESSADAS
// -----------------------------------------------------------------------
// NOTA: A implementaï¿½ï¿½o real estï¿½ mais abaixo no arquivo, apï¿½s as declaraï¿½ï¿½es
// de pendingResponses, conversationsBeingProcessed, etc.
// -----------------------------------------------------------------------

// Map para rastrear ï¿½ltima verificaï¿½ï¿½o por userId (evita spam)
const lastMissedMessageCheck = new Map<string, number>();

// Map para rastrear mensagens jï¿½ detectadas como faltantes (evita reprocessar)
const detectedMissedMessages = new Set<string>(); // key: conversationId_messageId

// Placeholder - serï¿½ substituï¿½do pela funï¿½ï¿½o real mais abaixo
let checkForMissedMessages: (session: WhatsAppSession) => Promise<void> = async () => {};

// Flag para controlar se o polling foi iniciado
let missedMessagePollingStarted = false;

// Funï¿½ï¿½o para iniciar o polling (serï¿½ chamada depois que sessions for declarado)
function startMissedMessagePolling() {
  // ?? MODO DEV: Pular polling de missed messages se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`?? [MISSED MSG] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  if (missedMessagePollingStarted) return;
  missedMessagePollingStarted = true;
  
  // Iniciar polling de mensagens nï¿½o processadas a cada 45 segundos
  setInterval(async () => {
    // Verificar se sessions estï¿½ disponï¿½vel
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
  
  console.log(`?? [MISSED MSG] Polling de mensagens nï¿½o processadas iniciado (a cada 45s)`);
}

// -----------------------------------------------------------------------
// ? UPLOAD DE Mï¿½DIA PARA STORAGE (Economia de Egress)
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
      console.log(`?? [STORAGE] Mï¿½dia enviada para Storage: ${result.url.substring(0, 80)}...`);
      return result.url;
    } else {
      console.warn(`?? [STORAGE] Upload retornou resultado invï¿½lido:`, result);
    }
  } catch (error) {
    console.error(`? [STORAGE] Erro ao enviar para Storage:`, error);
  }
  
  // SEM fallback base64 para evitar egress excessivo!
  console.warn(`?? [STORAGE] Upload falhou, mï¿½dia nï¿½o serï¿½ salva (sem fallback base64)`);
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
// ?? WRAPPER: uploadMediaSimple - Compatibilidade com cï¿½digo legado
// A funï¿½ï¿½o importada uploadMediaToStorage de mediaStorageService.ts retorna 
// { url, path, size } e precisa de (buffer, mimeType, userId, conversationId?)
// Esta wrapper aceita (buffer, mimeType, fileName) e retorna apenas a URL
// -----------------------------------------------------------------------
async function uploadMediaSimple(
  buffer: Buffer, 
  mimeType: string, 
  fileName?: string
): Promise<string | null> {
  try {
    // Usar "system" como userId genï¿½rico para uploads sem contexto de usuï¿½rio
    const result = await uploadMediaToStorage(buffer, mimeType, "system");
    if (result && result.url) {
      console.log(`? [STORAGE] Upload concluï¿½do: ${result.url.substring(0, 80)}...`);
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
  shutdownReason?: string;
  contactsCache: Map<string, Contact>;
  // -----------------------------------------------------------------------
  // FIX 2026-02-24: Track if connection actually reached "open" state
  // Prevents stuck connections where socket exists but never fully connected
  // -----------------------------------------------------------------------
  isOpen?: boolean;
  connectedAt?: number;   // timestamp when connection.update fired "open"
  createdAt?: number;     // timestamp when session was created
  openTimeout?: NodeJS.Timeout; // auto-reconnect if "open" never fires
  qrIssuedAt?: number;
  qrConnectSource?: string;
  lastQrCodeDataUrl?: string;
  lastQrCodeGeneratedAt?: string;
  hadAuthBeforeConnect?: boolean;
  phoneNumberBeforeConnect?: string | null;
  providerStatusBeforeConnect?: string | null;
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
const groupHistorySyncLocks = new Map<string, Promise<GroupHistorySyncResult>>();
const pendingGroupHistorySyncs = new Map<string, PendingGroupHistorySync>();
const conversationHistorySyncLocks = new Map<string, Promise<ConversationHistorySyncResult>>();
const pendingConversationHistorySyncs = new Map<string, PendingConversationHistorySync>();

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

function requestSessionShutdown(session: WhatsAppSession, reason: string): void {
  if (session.shutdownReason === reason) {
    return;
  }

  session.shutdownReason = reason;

  try {
    session.socket?.end(new Error(reason));
  } catch (error) {
    console.warn(
      `[WHATSAPP] Falha ao encerrar socket ${session.connectionId.substring(0, 8)}... (${reason}):`,
      error,
    );
  }
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

function buildBaileysConnectionStatePatch(
  isConnected: boolean,
  extras: Record<string, unknown> = {},
) {
  return {
    ...extras,
    isConnected,
    providerStatus: isConnected
      ? WHATSAPP_PROVIDER_STATUS.CONNECTED
      : WHATSAPP_PROVIDER_STATUS.DISCONNECTED,
  };
}

const MANUAL_DISCONNECT_AUTO_RECONNECT_BLOCK_FLAG = "manualDisconnectAutoReconnectBlocked";

function getConnectionProviderConfigRecord(
  connection?: Pick<WhatsappConnection, "providerConfig"> | null,
): Record<string, unknown> {
  const providerConfig = connection?.providerConfig;
  if (!providerConfig || typeof providerConfig !== "object" || Array.isArray(providerConfig)) {
    return {};
  }
  return { ...(providerConfig as Record<string, unknown>) };
}

function buildManualDisconnectProviderConfig(
  connection: Pick<WhatsappConnection, "providerConfig">,
  source: string,
): Record<string, unknown> {
  return {
    ...getConnectionProviderConfigRecord(connection),
    [MANUAL_DISCONNECT_AUTO_RECONNECT_BLOCK_FLAG]: true,
    manualDisconnectBlockedAt: new Date().toISOString(),
    manualDisconnectSource: source,
  };
}

function clearManualDisconnectProviderConfig(
  connection?: Pick<WhatsappConnection, "providerConfig"> | null,
): Record<string, unknown> | null {
  const providerConfig = getConnectionProviderConfigRecord(connection);
  delete providerConfig[MANUAL_DISCONNECT_AUTO_RECONNECT_BLOCK_FLAG];
  delete providerConfig.manualDisconnectBlockedAt;
  delete providerConfig.manualDisconnectSource;
  return Object.keys(providerConfig).length > 0 ? providerConfig : null;
}

function isManualDisconnectAutoReconnectBlocked(
  connection?: Pick<WhatsappConnection, "providerConfig"> | null,
): boolean {
  return getConnectionProviderConfigRecord(connection)[MANUAL_DISCONNECT_AUTO_RECONNECT_BLOCK_FLAG] === true;
}

function shouldRespectManualDisconnectBlock(connectSource: string): boolean {
  const source = String(connectSource || "direct").trim().toLowerCase();
  return source !== "direct" && source !== "manual_connect" && source !== "user_connect";
}

// ?? Set para rastrear IDs de mensagens enviadas pelo agente/usu?rio via sendMessage
// Evita duplicatas quando Baileys dispara evento fromMe ap?s socket.sendMessage()
const agentMessageIds = new Set<string>();
const adminAgentMessageIds = new Map<string, number>();
const ADMIN_AGENT_MESSAGE_ID_TTL_MS = 10 * 60 * 1000;

interface TrackedAdminOutgoingMessage {
  messageId?: string;
  adminId: string;
  conversationId?: string;
  contactNumber: string;
  text?: string;
  mediaType?: string;
  mediaMimeType?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  isFromAgent: boolean;
  alreadyPersisted: boolean;
  source: string;
  createdAt: number;
}

const trackedAdminOutgoingByMessageId = new Map<string, TrackedAdminOutgoingMessage>();
const trackedAdminOutgoingByFingerprint = new Map<string, TrackedAdminOutgoingMessage[]>();

interface TrackedSharedAutomaticOutgoingMessage {
  messageId: string;
  contactNumber: string;
  conversationId?: string;
  text?: string;
  mediaType?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  isFromAgent: boolean;
  source: string;
  createdAt: number;
}

const trackedSharedAutomaticOutgoingByMessageId = new Map<string, TrackedSharedAutomaticOutgoingMessage>();
const trackedSharedAutomaticOutgoingByFingerprint = new Map<string, TrackedSharedAutomaticOutgoingMessage[]>();

function isManualAdminPauseSource(source: string): boolean {
  return source === "admin_whatsapp_manual" || source.startsWith("admin_panel_");
}

function normalizeTrackedAdminOutgoingText(text?: string): string {
  return (text || "").trim().toLowerCase().slice(0, 240);
}

function buildTrackedAdminOutgoingFingerprint(params: {
  adminId: string;
  contactNumber: string;
  text?: string;
  mediaType?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
}): string {
  const mediaType = params.mediaType || "text";
  const textPart = mediaType === "text"
    ? normalizeTrackedAdminOutgoingText(params.text)
    : normalizeTrackedAdminOutgoingText(params.mediaCaption || params.text);

  return [
    params.adminId,
    params.contactNumber,
    mediaType,
    params.mediaMimeType || "",
    textPart,
  ].join("|");
}

function cleanupTrackedAdminOutgoingMessages(now = Date.now()): void {
  for (const [messageId, entry] of trackedAdminOutgoingByMessageId.entries()) {
    if (now - entry.createdAt > ADMIN_AGENT_MESSAGE_ID_TTL_MS) {
      trackedAdminOutgoingByMessageId.delete(messageId);
    }
  }

  for (const [fingerprint, entries] of trackedAdminOutgoingByFingerprint.entries()) {
    const freshEntries = entries.filter((entry) => now - entry.createdAt <= ADMIN_AGENT_MESSAGE_ID_TTL_MS);
    if (freshEntries.length > 0) {
      trackedAdminOutgoingByFingerprint.set(fingerprint, freshEntries);
    } else {
      trackedAdminOutgoingByFingerprint.delete(fingerprint);
    }
  }
}

function cleanupTrackedSharedAutomaticOutgoingMessages(now = Date.now()): void {
  for (const [messageId, entry] of trackedSharedAutomaticOutgoingByMessageId.entries()) {
    if (now - entry.createdAt > ADMIN_AGENT_MESSAGE_ID_TTL_MS) {
      trackedSharedAutomaticOutgoingByMessageId.delete(messageId);
    }
  }

  for (const [fingerprint, entries] of trackedSharedAutomaticOutgoingByFingerprint.entries()) {
    const freshEntries = entries.filter((entry) => now - entry.createdAt <= ADMIN_AGENT_MESSAGE_ID_TTL_MS);
    if (freshEntries.length > 0) {
      trackedSharedAutomaticOutgoingByFingerprint.set(fingerprint, freshEntries);
    } else {
      trackedSharedAutomaticOutgoingByFingerprint.delete(fingerprint);
    }
  }
}

function normalizeTrackedSharedAutomaticText(text?: string): string {
  return (text || "").trim().toLowerCase().slice(0, 240);
}

function buildTrackedSharedAutomaticOutgoingFingerprint(params: {
  contactNumber: string;
  mediaType?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  text?: string;
}): string {
  const mediaType = params.mediaType || "text";
  const textPart =
    mediaType === "text"
      ? normalizeTrackedSharedAutomaticText(params.text)
      : normalizeTrackedSharedAutomaticText(params.mediaCaption || "");

  return [
    params.contactNumber,
    mediaType,
    params.mediaMimeType || "",
    textPart,
  ].join("|");
}

function trackAdminOutgoingMessage(entry: Omit<TrackedAdminOutgoingMessage, "createdAt">): void {
  const trackedEntry: TrackedAdminOutgoingMessage = {
    ...entry,
    createdAt: Date.now(),
  };

  cleanupTrackedAdminOutgoingMessages(trackedEntry.createdAt);

  if (trackedEntry.messageId) {
    trackedAdminOutgoingByMessageId.set(trackedEntry.messageId, trackedEntry);
  }

  const fingerprint = buildTrackedAdminOutgoingFingerprint(trackedEntry);
  const entries = trackedAdminOutgoingByFingerprint.get(fingerprint) || [];
  entries.push(trackedEntry);
  trackedAdminOutgoingByFingerprint.set(fingerprint, entries.slice(-10));
}

function removeTrackedAdminOutgoingMessage(entry: TrackedAdminOutgoingMessage): void {
  if (entry.messageId) {
    trackedAdminOutgoingByMessageId.delete(entry.messageId);
  }

  const fingerprint = buildTrackedAdminOutgoingFingerprint(entry);
  const entries = trackedAdminOutgoingByFingerprint.get(fingerprint) || [];
  const filtered = entries.filter((candidate) => candidate !== entry);

  if (filtered.length > 0) {
    trackedAdminOutgoingByFingerprint.set(fingerprint, filtered);
  } else {
    trackedAdminOutgoingByFingerprint.delete(fingerprint);
  }
}

function consumeTrackedAdminOutgoingMessage(params: {
  messageId?: string | null;
  adminId: string;
  contactNumber: string;
  text?: string;
  mediaType?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
}): TrackedAdminOutgoingMessage | undefined {
  cleanupTrackedAdminOutgoingMessages();

  if (params.messageId) {
    const exact = trackedAdminOutgoingByMessageId.get(params.messageId);
    if (exact) {
      removeTrackedAdminOutgoingMessage(exact);
      return exact;
    }
  }

  const fingerprint = buildTrackedAdminOutgoingFingerprint({
    adminId: params.adminId,
    contactNumber: params.contactNumber,
    text: params.text,
    mediaType: params.mediaType,
    mediaMimeType: params.mediaMimeType,
    mediaCaption: params.mediaCaption,
  });

  const candidates = trackedAdminOutgoingByFingerprint.get(fingerprint) || [];
  const match = candidates[candidates.length - 1];
  if (!match) return undefined;

  removeTrackedAdminOutgoingMessage(match);
  return match;
}

function trackSharedAutomaticOutgoingMessage(entry: Omit<TrackedSharedAutomaticOutgoingMessage, "createdAt">): void {
  cleanupTrackedSharedAutomaticOutgoingMessages();

  const trackedEntry: TrackedSharedAutomaticOutgoingMessage = {
    ...entry,
    createdAt: Date.now(),
  };

  if (trackedEntry.messageId) {
    const existingEntry = trackedSharedAutomaticOutgoingByMessageId.get(trackedEntry.messageId);
    if (existingEntry) {
      removeTrackedSharedAutomaticOutgoingMessage(existingEntry);
    }
    trackedSharedAutomaticOutgoingByMessageId.set(trackedEntry.messageId, trackedEntry);
  }

  const fingerprint = buildTrackedSharedAutomaticOutgoingFingerprint(trackedEntry);
  const entries = trackedSharedAutomaticOutgoingByFingerprint.get(fingerprint) || [];
  entries.push(trackedEntry);
  trackedSharedAutomaticOutgoingByFingerprint.set(fingerprint, entries.slice(-10));
}

function removeTrackedSharedAutomaticOutgoingMessage(entry: TrackedSharedAutomaticOutgoingMessage): void {
  if (entry.messageId) {
    trackedSharedAutomaticOutgoingByMessageId.delete(entry.messageId);
  }

  const fingerprint = buildTrackedSharedAutomaticOutgoingFingerprint(entry);
  const entries = trackedSharedAutomaticOutgoingByFingerprint.get(fingerprint) || [];
  const filtered = entries.filter((candidate) => candidate !== entry);

  if (filtered.length > 0) {
    trackedSharedAutomaticOutgoingByFingerprint.set(fingerprint, filtered);
  } else {
    trackedSharedAutomaticOutgoingByFingerprint.delete(fingerprint);
  }
}

function consumeTrackedSharedAutomaticOutgoingMessage(params: {
  messageId?: string | null;
  contactNumber: string;
  mediaType?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  text?: string;
}): TrackedSharedAutomaticOutgoingMessage | undefined {
  cleanupTrackedSharedAutomaticOutgoingMessages();

  if (params.messageId) {
    const exact = trackedSharedAutomaticOutgoingByMessageId.get(params.messageId);
    if (exact) {
      removeTrackedSharedAutomaticOutgoingMessage(exact);
      return exact;
    }
  }

  const fingerprint = buildTrackedSharedAutomaticOutgoingFingerprint({
    contactNumber: params.contactNumber,
    mediaType: params.mediaType,
    mediaMimeType: params.mediaMimeType,
    mediaCaption: params.mediaCaption,
    text: params.text,
  });
  const candidates = trackedSharedAutomaticOutgoingByFingerprint.get(fingerprint) || [];
  const match = candidates[candidates.length - 1];
  if (!match) return undefined;

  removeTrackedSharedAutomaticOutgoingMessage(match);
  return match;
}

function isUniqueMessagePersistenceError(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown };
  const message = String(err?.message || error || "").toLowerCase();
  return err?.code === "23505" || message.includes("unique") || message.includes("duplicate key");
}

function isLocalOutboxWriteFailure(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown };
  const message = String(err?.message || error || "");
  return err?.code === "ENOSPC" || /no space left on device/i.test(message);
}

function peekTrackedSharedAutomaticOutgoingMessage(params: {
  messageId?: string | null;
  contactNumber: string;
  mediaType?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  text?: string;
}): TrackedSharedAutomaticOutgoingMessage | undefined {
  cleanupTrackedSharedAutomaticOutgoingMessages();

  if (params.messageId) {
    const exact = trackedSharedAutomaticOutgoingByMessageId.get(params.messageId);
    if (exact) {
      return exact;
    }
  }

  const fingerprint = buildTrackedSharedAutomaticOutgoingFingerprint({
    contactNumber: params.contactNumber,
    mediaType: params.mediaType,
    mediaMimeType: params.mediaMimeType,
    mediaCaption: params.mediaCaption,
    text: params.text,
  });
  const candidates = trackedSharedAutomaticOutgoingByFingerprint.get(fingerprint) || [];
  return candidates[candidates.length - 1];
}

async function getPriorityUserOwnershipForAdminLiveContact(
  contactNumber: string,
): Promise<{ ownerConversationId: string } | null> {
  const ownerConversation = await findPriorityUserConversationByContact(contactNumber);
  if (!ownerConversation) {
    return null;
  }

  return {
    ownerConversationId: ownerConversation.id,
  };
}

async function enforcePriorityUserOwnershipForAdminLiveAutomation(params: {
  contactNumber: string;
  conversationId?: string;
  source: string;
}): Promise<{ ownerConversationId: string } | null> {
  const ownership = await getPriorityUserOwnershipForAdminLiveContact(params.contactNumber);
  if (!ownership) {
    return null;
  }

  if (params.conversationId) {
    const currentConversation = await storage.getAdminConversation(params.conversationId).catch(() => undefined);
    if (currentConversation?.isAgentEnabled === true) {
      await storage.toggleAdminConversationAgent(params.conversationId, false);
    }
  }

  console.log(
    `[ADMIN PRIORITY] Atendimento ao vivo bloqueado para ${params.contactNumber} via ${params.source}. ` +
      `Controle pertence a ${FOLLOWUP_PRIORITY_EMAIL} na conversa ${ownership.ownerConversationId}.`,
  );

  return ownership;
}

async function shouldMirrorSharedAutomaticIntoAdmin(params: {
  contactNumber: string;
  trackedMessage: TrackedSharedAutomaticOutgoingMessage;
}): Promise<boolean> {
  if (!params.trackedMessage.source.startsWith("customer_")) {
    return true;
  }

  const ownership = await getPriorityUserOwnershipForAdminLiveContact(params.contactNumber);
  if (!ownership) {
    return true;
  }

  console.log(
    `[ADMIN PRIORITY] Espelhamento ignorado para ${params.contactNumber} (${params.trackedMessage.source}). ` +
      `Contato pertence a ${FOLLOWUP_PRIORITY_EMAIL} na conversa ${ownership.ownerConversationId}.`,
  );
  return false;
}

function trackAdminAgentMessageId(messageId?: string | null): void {
  if (!messageId) return;

  const now = Date.now();
  adminAgentMessageIds.set(messageId, now);

  if (adminAgentMessageIds.size > 2000) {
    for (const [id, ts] of adminAgentMessageIds.entries()) {
      if (now - ts > ADMIN_AGENT_MESSAGE_ID_TTL_MS) {
        adminAgentMessageIds.delete(id);
      }
    }
  }
}

function consumeAdminAgentMessageId(messageId?: string | null): boolean {
  if (!messageId) return false;

  const ts = adminAgentMessageIds.get(messageId);
  if (!ts) return false;

  adminAgentMessageIds.delete(messageId);
  return Date.now() - ts <= ADMIN_AGENT_MESSAGE_ID_TTL_MS;
}

// ?? Fun??o exportada para registrar messageIds de m?dias enviadas pelo agente
// Usado pelo mediaService para evitar que handleOutgoingMessage pause a IA incorretamente
export function registerAgentMessageId(messageId: string): void {
  if (messageId) {
    agentMessageIds.add(messageId);
    console.log(`?? [AGENT MSG] Registrado messageId do agente: ${messageId}`);
  }
}

export function registerSharedAutomaticOutgoingMessageForPersistence(entry: {
  messageId?: string | null;
  contactNumber?: string | null;
  conversationId?: string;
  text?: string;
  mediaType?: string;
  mediaUrl?: string;
  mediaMimeType?: string | null;
  mediaCaption?: string | null;
  isFromAgent?: boolean;
  source?: string;
}): void {
  const messageId = String(entry.messageId || "").trim();
  if (!messageId) return;

  const contactNumber = cleanContactNumber(entry.contactNumber || "");
  if (!contactNumber) return;

  trackSharedAutomaticOutgoingMessage({
    messageId,
    contactNumber,
    conversationId: entry.conversationId,
    text: entry.text,
    mediaType: entry.mediaType,
    mediaUrl: entry.mediaUrl,
    mediaMimeType: entry.mediaMimeType || undefined,
    mediaCaption: entry.mediaCaption || undefined,
    isFromAgent: entry.isFromAgent === true,
    source: entry.source || "customer_shared_outbox",
  });
}

// ?? Map para rastrear solicita??es de c?digo de pareamento em andamento
// Evita m?ltiplas solicita??es simult?neas para o mesmo usu?rio
const pendingPairingRequests = new Map<string, Promise<string | null>>();

// ?? Map para rastrear sess?es de pairing ativas com expiraï¿½ï¿½o
// Se o usuï¿½rio nï¿½o digitar o cï¿½digo em 3 minutos, limpa a sessï¿½o automaticamente
interface PairingSession {
  startedAt: number;
  phone: string;
  codeIssuedAt?: number;
  expiresAt: number;
  timeoutId?: NodeJS.Timeout;
}
const pairingSessions = new Map<string, PairingSession>();
const PAIRING_SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos - WhatsApp ï¿½s vezes demora para achar a opï¿½ï¿½o

// -----------------------------------------------------------------------
// ?? PAIRING STATE MANAGER - Gerencia estado de pairing com restart automï¿½tico
// -----------------------------------------------------------------------
// Mantï¿½m o estado do pairing entre restarts do socket (515 restartRequired)
// Permite reconexï¿½o automï¿½tica sem perder o auth_pairing
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
  socketRef?: any;  // Referï¿½ncia ao socket atual
  sessionRef?: WhatsAppSession;  // Referï¿½ncia ï¿½ sessï¿½o atual
}
const pairingStateMap = new Map<string, PairingState>();

// Funï¿½ï¿½es auxiliares do pairing manager
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
const MAX_PAIRING_RETRIES = 5; // Mï¿½ximo de restarts permitidos
const PAIRING_RETRY_COOLDOWN_MS = 10000; // 10 segundos entre retries

// ?? Map para rastrear conex?es em andamento
// Evita m?ltiplas tentativas de conex?o simult?neas para o mesmo usu?rio
// FIX 2026-02-24: Evoluï¿½do de Map<string, Promise<void>> para estrutura com metadata + TTL
interface PendingConnectionEntry {
  promise: Promise<void>;
  startedAt: number;
  expiresAt?: number;
  connectionId?: string;
  userId: string;
  distributedLock?: DistributedLockHandle;
  distributedLockRefresh?: NodeJS.Timeout;
}
const pendingConnections = new Map<string, PendingConnectionEntry>();
const PENDING_LOCK_TTL_MS = 90_000; // 90 seconds ï¿½ lock expires after this
const WA_REDIS_CONNECT_LOCK_ENABLED = process.env.WA_REDIS_CONNECT_LOCK !== "false";
const WA_REDIS_PENDING_LOCK_PREFIX = process.env.WA_REDIS_PENDING_LOCK_PREFIX || "wa:connect:lock:";
const WA_REDIS_COOLDOWN_PREFIX = process.env.WA_REDIS_COOLDOWN_PREFIX || "wa:open-timeout:";
const WA_REDIS_PENDING_CRON_LOCK_KEY =
  process.env.WA_REDIS_PENDING_CRON_LOCK_KEY || "wa:pending-cron:lock";
const WA_REDIS_PENDING_INCOMING_RECOVERY_LOCK_KEY =
  process.env.WA_REDIS_PENDING_INCOMING_RECOVERY_LOCK_KEY || "wa:pending-incoming-recovery:lock";
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
  10_000
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
type WaSocketVersion = [number, number, number];
const WA_SOCKET_VERSION_FALLBACK: WaSocketVersion = [2, 3000, 1042645886];
const WA_SOCKET_VERSION_CACHE_TTL_MS = Math.max(
  Number(process.env.WA_SOCKET_VERSION_CACHE_TTL_MS || 15 * 60 * 1000),
  60_000,
);
let cachedWaSocketVersion: { version: WaSocketVersion; fetchedAt: number; source: string } | null = null;

function isWaSocketVersion(value: unknown): value is WaSocketVersion {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => Number.isInteger(part) && part > 0)
  );
}

function parseWaSocketVersionOverride(value: string | undefined): WaSocketVersion | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const version = raw
    .split(/[.,\s]+/)
    .filter(Boolean)
    .map((part) => Number(part));
  if (!isWaSocketVersion(version)) {
    console.warn(`[WA VERSION] Ignoring invalid WA socket version override: ${raw}`);
    return null;
  }
  return version;
}

async function resolveWaSocketVersion(source: string): Promise<WaSocketVersion> {
  const override = parseWaSocketVersionOverride(
    process.env.WA_WEB_VERSION_OVERRIDE || process.env.WA_SOCKET_VERSION_OVERRIDE,
  );
  if (override) return override;

  const now = Date.now();
  if (cachedWaSocketVersion && now - cachedWaSocketVersion.fetchedAt < WA_SOCKET_VERSION_CACHE_TTL_MS) {
    return cachedWaSocketVersion.version;
  }

  try {
    const latest = await fetchLatestWaWebVersion();
    if ("error" in latest && latest.error) {
      throw latest.error;
    }
    if (!isWaSocketVersion(latest.version)) {
      throw new Error(`Invalid WA Web version payload: ${JSON.stringify(latest.version)}`);
    }

    cachedWaSocketVersion = {
      version: latest.version,
      fetchedAt: now,
      source: "fetchLatestWaWebVersion",
    };
    console.log(
      `[WA VERSION] ${source} using WA Web ${latest.version.join(".")} from fetchLatestWaWebVersion (isLatest=${latest.isLatest})`,
    );
    return latest.version;
  } catch (error) {
    if (cachedWaSocketVersion) {
      console.warn(
        `[WA VERSION] ${source} failed to refresh WA Web version; using cached ${cachedWaSocketVersion.version.join(".")}:`,
        error,
      );
      return cachedWaSocketVersion.version;
    }

    console.warn(
      `[WA VERSION] ${source} failed to fetch WA Web version; using fallback ${WA_SOCKET_VERSION_FALLBACK.join(".")}:`,
      error,
    );
    return WA_SOCKET_VERSION_FALLBACK;
  }
}
const IS_MONOLITH_RUNTIME = String(process.env.SERVICE_MODE || "").trim().toLowerCase() === "monolith";
const PENDING_TIMERS_CRON_INTERVAL_MS = Math.max(
  Number(process.env.WA_PENDING_TIMERS_CRON_INTERVAL_MS || (IS_MONOLITH_RUNTIME ? 60_000 : 15_000)),
  15_000,
);
const PENDING_TIMERS_CRON_INITIAL_DELAY_MS = Math.max(
  Number(process.env.WA_PENDING_TIMERS_CRON_INITIAL_DELAY_MS || (IS_MONOLITH_RUNTIME ? 90_000 : 10_000)),
  5_000,
);
const PENDING_TIMERS_MAX_PER_CYCLE = Math.max(
  Number(process.env.WA_PENDING_TIMERS_MAX_PER_CYCLE || (IS_MONOLITH_RUNTIME ? 3 : 25)),
  1,
);
const PENDING_INCOMING_RECOVERY_CRON_INTERVAL_MS = Math.max(
  Number(process.env.WA_PENDING_INCOMING_RECOVERY_CRON_INTERVAL_MS || (IS_MONOLITH_RUNTIME ? 90_000 : 45_000)),
  30_000,
);
const PENDING_INCOMING_RECOVERY_INITIAL_DELAY_MS = Math.max(
  Number(process.env.WA_PENDING_INCOMING_RECOVERY_INITIAL_DELAY_MS || (IS_MONOLITH_RUNTIME ? 120_000 : 30_000)),
  10_000,
);
const PENDING_INCOMING_RECOVERY_MAX_SCOPES_PER_CYCLE = Math.max(
  Number(process.env.WA_PENDING_INCOMING_RECOVERY_MAX_SCOPES_PER_CYCLE || (IS_MONOLITH_RUNTIME ? 4 : 12)),
  1,
);
const PENDING_INCOMING_RECOVERY_SCAN_LIMIT = Math.max(
  Number(process.env.WA_PENDING_INCOMING_RECOVERY_SCAN_LIMIT || (IS_MONOLITH_RUNTIME ? 200 : 500)),
  PENDING_INCOMING_RECOVERY_MAX_SCOPES_PER_CYCLE,
);
const PENDING_INCOMING_RECOVERY_MIN_AGE_SECONDS = Math.max(
  Number(process.env.WA_PENDING_INCOMING_RECOVERY_MIN_AGE_SECONDS || 30),
  5,
);
const AUTO_RECOVERY_CRON_INTERVAL_MS = Math.max(
  Number(process.env.WA_AUTO_RECOVERY_CRON_INTERVAL_MS || (IS_MONOLITH_RUNTIME ? 15 * 60_000 : 5 * 60_000)),
  60_000,
);
const AUTO_RECOVERY_INITIAL_DELAY_MS = Math.max(
  Number(process.env.WA_AUTO_RECOVERY_INITIAL_DELAY_MS || (IS_MONOLITH_RUNTIME ? 10 * 60_000 : 2 * 60_000)),
  60_000,
);
const AUTO_RECOVERY_MAX_PER_CYCLE = Math.max(
  Number(process.env.WA_AUTO_RECOVERY_MAX_PER_CYCLE || (IS_MONOLITH_RUNTIME ? 2 : 10)),
  1,
);
const AUTO_RECOVERY_MAX_TOTAL_PER_CYCLE = Math.max(
  Number(process.env.WA_AUTO_RECOVERY_MAX_TOTAL_PER_CYCLE || (IS_MONOLITH_RUNTIME ? 3 : 15)),
  AUTO_RECOVERY_MAX_PER_CYCLE,
);
const RESTORE_SKIP_CONTACT_CACHE_WARMING =
  IS_MONOLITH_RUNTIME && process.env.WA_RESTORE_SKIP_CONTACT_CACHE_WARMING !== "false";
const RESTORE_DEFER_OPEN_SIDE_JOBS =
  IS_MONOLITH_RUNTIME && process.env.WA_RESTORE_DEFER_OPEN_SIDE_JOBS !== "false";
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
 * Helper unificado para limpar lock de conexï¿½o pendente.
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
    if (isPendingConnectionExpired(entry, now, PENDING_LOCK_TTL_MS)) {
      const expiresAt = entry.expiresAt || entry.startedAt + PENDING_LOCK_TTL_MS;
      console.log(`?? [PENDING LOCK] STALE_EVICTED: ${key.substring(0, 8)}... age=${Math.round((now - entry.startedAt) / 1000)}s > TTL=${PENDING_LOCK_TTL_MS / 1000}s`);
      console.log(`?? [PENDING LOCK] Expiração efetiva: ${Math.max(0, Math.round((expiresAt - entry.startedAt) / 1000))}s`);
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
  return (
    source.startsWith("pending_") ||
    source.startsWith("health_") ||
    source.startsWith("session_ensure")
  );
}

function shouldPauseAutomatedReconnectWhileAwaitingPairing(source?: string): boolean {
  if (!source) return false;
  if (OPEN_TIMEOUT_COOLDOWN_SOURCES.has(source)) return true;
  return (
    source.startsWith("pending_") ||
    source.startsWith("health_") ||
    source.startsWith("session_ensure") ||
    source.startsWith("close_")
  );
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
const MAX_RECONNECT_ATTEMPTS = Math.max(
  Number(process.env.WA_MAX_RECONNECT_ATTEMPTS || 8),
  5,
);
// Back-off exponencial: 5s, 15s, 45s, 2min, 5min (NUNCA resetar contador)
const RECONNECT_BACKOFF_MS = [5000, 15000, 45000, 120000, 300000];
const RECONNECT_LONG_TAIL_DELAY_MS = Math.max(
  Number(process.env.WA_RECONNECT_LONG_TAIL_DELAY_MS || 15 * 60 * 1000),
  60_000,
);

function shouldResetReconnectAttemptsForSource(source: string): boolean {
  return (
    source === "direct" ||
    source === "logout_auto_retry" ||
    source.startsWith("manual") ||
    source.startsWith("user_action")
  );
}

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

function setRestoreInProgress(value: boolean): void {
  _isRestoringInProgress = value;
  process.env.WA_RESTORE_IN_PROGRESS = value ? "true" : "false";
  if (!value) {
    delete process.env.WA_RESTORE_BOOT_GUARD_UNTIL;
  }
}

function setAdminRestoreInProgress(value: boolean): void {
  _isAdminRestoringInProgress = value;
  process.env.WA_ADMIN_RESTORE_IN_PROGRESS = value ? "true" : "false";
}

// Export function to check if restore is in progress (used by API endpoints)
export function isRestoringInProgress(): boolean {
  return _isRestoringInProgress;
}

export function isAdminRestoreInProgress(): boolean {
  return _isAdminRestoringInProgress;
}

// ?? Map para rastrear auto-retry apï¿½s logout (QR Code)
// Permite um ï¿½nico auto-retry quando auth invï¿½lido causa logout imediato
interface LogoutAutoRetry {
  count: number;
  lastAttempt: number;
}
const logoutAutoRetry = new Map<string, LogoutAutoRetry>();
const LOGOUT_AUTO_RETRY_COOLDOWN_MS = 60000; // 60 segundos
const MAX_LOGOUT_AUTO_RETRY = 1; // Apenas 1 tentativa automï¿½tica

// ?? Iniciar polling de mensagens nï¿½o processadas
// (variï¿½veis necessï¿½rias jï¿½ foram declaradas acima)
startMissedMessagePolling();

// ?? SISTEMA DE RECUPERAï¿½ï¿½O: Registrar callback de processamento
// Este callback serï¿½ usado pelo pendingMessageRecoveryService para reprocessar
// mensagens que nï¿½o foram processadas durante instabilidade/deploys
// NOTA: O registerMessageProcessor jï¿½ foi importado no topo do arquivo junto
// com outras funï¿½ï¿½es do pendingMessageRecoveryService.
// A funï¿½ï¿½o handleIncomingMessage precisa estar definida primeiro
// O registro ï¿½ feito no final do arquivo via setTimeout para garantir ordem

// -----------------------------------------------------------------------
// ?? CACHE DE AGENDA - OTIMIZAï¿½ï¿½O PARA ENVIO EM MASSA
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
  pendingFirstMessageRecovery?: PendingFirstMessageRecoveryContext;
  isCTWAFallback?: boolean; // ?? Flag: mensagem veio de Meta Ads (CTWA) e PDO falhou - IA deve tratar como saudaï¿½ï¿½o de interesse
  forceRespond?: boolean;
  retryCount?: number;
  responseDelaySeconds?: number;
}
const pendingResponses = new Map<string, PendingResponse>(); // key: conversationId

async function normalizePendingStubForAI(params: {
  pending: PendingResponse;
  conversationRecord: any;
  conversationHistory: any[];
}): Promise<{
  messages: string[];
  conversationHistory: any[];
  applied: boolean;
}> {
  const { pending, conversationRecord } = params;
  const conversationHistory = Array.isArray(params.conversationHistory)
    ? [...params.conversationHistory]
    : [];
  const combinedText = pending.messages.join("\n\n");
  const normalizedInbound = normalizeInitialStubMessageForAI(combinedText, conversationHistory);

  if (!normalizedInbound.wasNormalized) {
    return {
      messages: pending.messages,
      conversationHistory,
      applied: false,
    };
  }

  const normalizedMessages = [normalizedInbound.text || INITIAL_META_STUB_FALLBACK_TEXT];

  try {
    await storage.replacePendingAIResponseMessages(pending.conversationId, normalizedMessages);
  } catch (error) {
    console.error(
      `⚠️ [STUB-RECOVERY] Falha ao normalizar pending_ai_responses ${pending.conversationId}:`,
      error,
    );
  }

  const latestInboundMessage = [...conversationHistory]
    .reverse()
    .find((message) => message && !message.fromMe);

  if (
    latestInboundMessage?.id &&
    (isStubOrIncompleteText(latestInboundMessage.text) ||
      String(latestInboundMessage.text || "").trim().toLowerCase() === "oi")
  ) {
    try {
      await storage.updateMessage(latestInboundMessage.id, { text: normalizedMessages[0] });
      latestInboundMessage.text = normalizedMessages[0];

      broadcastToUser(pending.userId, {
        type: "message_updated",
        conversationId: pending.conversationId,
        messageId: latestInboundMessage.id,
        text: normalizedMessages[0],
      });
    } catch (error) {
      console.error(
        `⚠️ [STUB-RECOVERY] Falha ao atualizar última mensagem ${latestInboundMessage.id}:`,
        error,
      );
    }
  }

  if (
    conversationRecord?.lastMessageText &&
    (isStubOrIncompleteText(conversationRecord.lastMessageText) ||
      String(conversationRecord.lastMessageText || "").trim().toLowerCase() === "oi")
  ) {
    try {
      await storage.updateConversation(pending.conversationId, {
        lastMessageText: normalizedMessages[0],
      });
      conversationRecord.lastMessageText = normalizedMessages[0];
    } catch (error) {
      console.error(
        `⚠️ [STUB-RECOVERY] Falha ao atualizar conversa ${pending.conversationId}:`,
        error,
      );
    }
  }

  pending.messages = normalizedMessages;
  console.log(
    `🔄 [STUB-RECOVERY] Pending ${pending.conversationId} normalizado para "${normalizedMessages[0]}"`,
  );

  return {
    messages: normalizedMessages,
    conversationHistory,
    applied: true,
  };
}

export async function cancelPendingAIResponseForConversation(
  conversationId: string,
  reason: string = "manual_cancel",
): Promise<boolean> {
  const pending = pendingResponses.get(conversationId);
  const persisted = await storage.getPendingAIResponse(conversationId);

  if (!pending && !persisted) {
    return false;
  }

  if (pending) {
    clearTimeout(pending.timeout);
    pendingResponses.delete(conversationId);
  }

  conversationsBeingProcessed.delete(conversationId);
  pendingRetryCounter.delete(conversationId);
  await storage.markPendingAIResponseSkipped(conversationId, reason);
  return true;
}

interface LinkedOwnerInboxContext {
  adminId: string;
  adminEmail: string;
  userId: string;
  connectionId: string;
  adminPhoneNumber: string | null;
  ownerPhoneNumber: string | null;
}

async function resolveLinkedOwnerInboxContext(adminId: string): Promise<LinkedOwnerInboxContext | null> {
  const admin = await storage.getAdminById(adminId);
  if (!admin?.email) {
    return null;
  }

  const [adminConnection, ownerUser] = await Promise.all([
    storage.getAdminWhatsappConnection(adminId),
    storage.getUserByEmail(admin.email),
  ]);

  if (!ownerUser?.id) {
    return null;
  }

  const ownerConnection = await storage.getUserActiveConnection(ownerUser.id);
  if (!ownerConnection?.id) {
    return null;
  }

  const adminPhoneNumber = cleanContactNumber(adminConnection?.phoneNumber || "") || null;
  const ownerPhoneNumber = cleanContactNumber(ownerConnection.phoneNumber || "") || null;

  if (adminPhoneNumber && ownerPhoneNumber && adminPhoneNumber !== ownerPhoneNumber) {
    return null;
  }

  return {
    adminId,
    adminEmail: admin.email,
    userId: ownerUser.id,
    connectionId: ownerConnection.id,
    adminPhoneNumber,
    ownerPhoneNumber,
  };
}

async function getOrCreateLinkedOwnerConversation(params: {
  context: LinkedOwnerInboxContext;
  contactNumber: string;
  remoteJid: string;
  contactName?: string;
}): Promise<Conversation> {
  const { context, contactNumber, remoteJid, contactName } = params;

  const existingConversation = await storage.getActiveConversationByContactNumber(
    context.connectionId,
    contactNumber,
  );
  if (existingConversation) {
    return existingConversation;
  }

  const { conversation } = await getOrCreateConversationSafe(
    context.connectionId,
    contactNumber,
    () =>
      storage.createConversation({
        connectionId: context.connectionId,
        contactNumber,
        remoteJid,
        jidSuffix: remoteJid.includes("@lid") ? "lid" : "s.whatsapp.net",
        contactName: contactName || contactNumber,
        contactAvatar: null,
        lastMessageText: null,
        lastMessageTime: null,
        lastMessageFromMe: false,
        unreadCount: 0,
      }),
    () => storage.getActiveConversationByContactNumber(context.connectionId, contactNumber),
  );

  return conversation;
}

async function applyLinkedOwnerManualPause(params: {
  userId: string;
  conversationId: string;
  contactNumber: string;
}): Promise<void> {
  const { userId, conversationId, contactNumber } = params;

  try {
    const agentConfig = await storage.getAgentConfig(userId);
    const shouldPauseOnManualReply = agentConfig?.pauseOnManualReply !== false;
    const autoReactivateMinutes = (agentConfig as any)?.autoReactivateMinutes ?? null;

    if (shouldPauseOnManualReply) {
      const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversationId);
      if (!isAlreadyDisabled) {
        await storage.disableAgentForConversation(conversationId, autoReactivateMinutes);

        const pendingResponse = pendingResponses.get(conversationId);
        if (pendingResponse) {
          clearTimeout(pendingResponse.timeout);
          pendingResponses.delete(conversationId);
        }

        broadcastToUser(userId, {
          type: "agent_auto_paused",
          conversationId,
          reason: "manual_reply",
          autoReactivateMinutes,
        });
      } else {
        await storage.updateDisabledConversationOwnerReply(conversationId, autoReactivateMinutes);
      }
    } else {
      const pendingResponse = pendingResponses.get(conversationId);
      if (pendingResponse) {
        clearTimeout(pendingResponse.timeout);
        pendingResponses.delete(conversationId);
      }
    }
  } catch (error) {
    console.error("[ADMIN OWNER LINK] Erro ao aplicar pausa manual:", error);
  }
}

async function persistMirroredAdminOutgoingToOwnerInbox(params: {
  context: LinkedOwnerInboxContext;
  contactNumber: string;
  remoteJid: string;
  contactName?: string;
  messageId?: string | null;
  messageText: string;
  timestamp: Date;
  mediaType?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaCaption?: string | null;
  source: string;
}): Promise<void> {
  const conversation = await getOrCreateLinkedOwnerConversation({
    context: params.context,
    contactNumber: params.contactNumber,
    remoteJid: params.remoteJid,
    contactName: params.contactName,
  });

  let existingMessage = params.messageId
    ? await storage.getMessageByMessageId(params.messageId)
    : null;

  if (!existingMessage && params.messageId) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    existingMessage = await storage.getMessageByMessageId(params.messageId);
  }

  if (existingMessage) {
    if (existingMessage.conversationId === conversation.id) {
      await reconcileExistingOutgoingMessage(params.messageId, params.timestamp);
      await storage.updateConversation(conversation.id, {
        lastMessageText: params.messageText,
        lastMessageTime: params.timestamp,
        lastMessageFromMe: true,
        hasReplied: true,
        unreadCount: 0,
      });
    }
    return;
  }

  const savedMessage = await storage.createMessage({
    conversationId: conversation.id,
    messageId: params.messageId || `admin_owner_${Date.now()}`,
    fromMe: true,
    text: params.messageText,
    timestamp: params.timestamp,
    status: "sent",
    isFromAgent: false,
    mediaType: params.mediaType || null,
    mediaUrl: params.mediaUrl || null,
    mediaMimeType: params.mediaMimeType || null,
    mediaCaption: params.mediaCaption || null,
  });

  await storage.updateConversation(conversation.id, {
    lastMessageText: savedMessage.text || params.messageText,
    lastMessageTime: params.timestamp,
    lastMessageFromMe: true,
    hasReplied: true,
    unreadCount: 0,
  });

  try {
    await userFollowUpService.resetFollowUpCycle(
      conversation.id,
      isManualAdminPauseSource(params.source)
        ? "Dono respondeu manualmente via admin"
        : "Notificacao enviada pelo admin",
      params.timestamp,
    );
  } catch (error) {
    console.error("[ADMIN OWNER LINK] Erro ao reiniciar follow-up:", error);
  }

  if (isManualAdminPauseSource(params.source)) {
    await applyLinkedOwnerManualPause({
      userId: params.context.userId,
      conversationId: conversation.id,
      contactNumber: params.contactNumber,
    });
  }

  broadcastToUser(params.context.userId, {
    type: "new_message",
    conversationId: conversation.id,
    message: savedMessage.text || params.messageText,
    mediaType: params.mediaType || null,
    messageData: {
      id: savedMessage.id,
      conversationId: conversation.id,
      messageId: savedMessage.messageId,
      fromMe: true,
      text: savedMessage.text || params.messageText,
      timestamp: savedMessage.timestamp?.toISOString?.() || params.timestamp.toISOString(),
      isFromAgent: false,
      status: "sent",
      mediaType: savedMessage.mediaType || null,
      mediaUrl: savedMessage.mediaUrl || null,
      mediaMimeType: savedMessage.mediaMimeType || null,
      mediaCaption: savedMessage.mediaCaption || null,
    },
    conversationUpdate: {
      id: conversation.id,
      connectionId: conversation.connectionId,
      contactNumber: conversation.contactNumber,
      contactName: conversation.contactName,
      contactAvatar: conversation.contactAvatar,
      lastMessageText: savedMessage.text || params.messageText,
      lastMessageTime: params.timestamp.toISOString(),
      lastMessageFromMe: true,
      unreadCount: 0,
      hasReplied: true,
    },
  });
}

async function suppressUserConversationMirroredByAdmin(params: {
  session: WhatsAppSession;
  contactNumber: string;
  adminConversationId: string;
}): Promise<void> {
  const { session, contactNumber, adminConversationId } = params;
  const conversation = await storage.getActiveConversationByContactNumber(
    session.connectionId,
    contactNumber,
  );

  if (!conversation) {
    return;
  }

  const result = await neutralizeMirroredUserConversation({
    conversation,
    adminConversationId,
    userId: session.userId,
    cancelPendingAIResponse: async (conversationId) => {
      await cancelPendingAIResponseForConversation(conversationId, "admin_mirror");
    },
    broadcast: ({ userId, conversationId }) => {
      broadcastToUser(userId, {
        type: "conversation_mirrored_to_admin",
        conversationId,
      });
    },
  });

  if (!result.changed) {
    return;
  }

  console.log(
    `🛡️ [ADMIN MIRROR] Conversa ${conversation.id} (${contactNumber}) neutralizada no inbox do usuário; admin=${adminConversationId}`,
  );
}

// ?? ANTI-DUPLICAï¿½ï¿½O: Map para rastrear conversas em processamento (value = timestamp)
// Evita que mï¿½ltiplos timeouts processem a mesma conversa simultaneamente
// Agora com TTL: se uma conversa ficar presa por mais de PROCESSING_TTL_MS, ï¿½ liberada
const conversationsBeingProcessed = new Map<string, number>();
const DEFAULT_PENDING_LOCK_TTL_MS = 5 * 60 * 1000;
const PROCESSING_TTL_MS = Number(process.env.PENDING_PROCESSING_TTL_MS || DEFAULT_PENDING_LOCK_TTL_MS);
const PENDING_IN_MEMORY_TTL_MS = Number(process.env.PENDING_IN_MEMORY_TTL_MS || PROCESSING_TTL_MS);
const PENDING_CONCURRENCY_RETRY_BASE_DELAY_MS = Number(process.env.PENDING_CONCURRENCY_RETRY_BASE_DELAY_MS || 3000);
const PENDING_CONCURRENCY_RETRY_MAX_DELAY_MS = Number(process.env.PENDING_CONCURRENCY_RETRY_MAX_DELAY_MS || 15000);

function clearPendingResponseTimeout(pending?: PendingResponse | null): void {
  if (pending?.timeout) {
    clearTimeout(pending.timeout);
  }
}

function reschedulePendingResponse(
  conversationId: string,
  pending: PendingResponse,
  delayMs: number,
  reason: string,
): void {
  clearPendingResponseTimeout(pendingResponses.get(conversationId));
  pending.timeout = schedulePendingResponseProcessing(pending, delayMs, reason);
  pendingResponses.set(conversationId, pending);
}

async function promotePendingFirstMessageDisplayToInterest(params: {
  userId: string;
  conversation: any;
  messageId?: string | null;
  timestamp?: Date | null;
}): Promise<void> {
  const conversationId = String(params.conversation?.id || "");
  if (!conversationId) return;

  let updatedMessage: any = null;
  if (params.messageId) {
    try {
      updatedMessage = await storage.updateMessage(params.messageId, {
        text: PENDING_FIRST_MESSAGE_INTEREST_TEXT,
      });
      broadcastToUser(params.userId, {
        type: "message_updated",
        conversationId,
        messageId: params.messageId,
        text: PENDING_FIRST_MESSAGE_INTEREST_TEXT,
      });
    } catch (error) {
      console.warn(
        `[PENDING-FIRST-MESSAGE] Falha ao promover mensagem ${params.messageId} para interesse inicial:`,
        error,
      );
    }
  }

  const currentConversation =
    (await storage.getConversation(conversationId).catch(() => null)) || params.conversation;
  const rawLastMessageTime =
    updatedMessage?.timestamp ||
    params.timestamp ||
    currentConversation?.lastMessageTime ||
    new Date();
  const lastMessageTime =
    rawLastMessageTime instanceof Date ? rawLastMessageTime : new Date(rawLastMessageTime);
  const attentionQualifiedAt = new Date();
  const attentionReason =
    "Novo interesse recebido. Confira a conversa se quiser assumir manualmente.";

  await storage.updateConversation(conversationId, {
    lastMessageText: PENDING_FIRST_MESSAGE_INTEREST_TEXT,
    lastMessageTime,
    lastMessageFromMe: false,
    needsHumanAttention: true,
    attentionPriority: "high",
    attentionReason,
    attentionQualifiedAt,
  });

  broadcastToUser(params.userId, {
    type: "conversation_attention_updated",
    conversationId,
    conversationUpdate: {
      id: conversationId,
      connectionId: currentConversation?.connectionId || params.conversation?.connectionId,
      contactNumber: currentConversation?.contactNumber || params.conversation?.contactNumber,
      remoteJid: currentConversation?.remoteJid || params.conversation?.remoteJid || null,
      jidSuffix: currentConversation?.jidSuffix || params.conversation?.jidSuffix || null,
      contactName: currentConversation?.contactName || params.conversation?.contactName || null,
      contactAvatar: currentConversation?.contactAvatar || params.conversation?.contactAvatar || null,
      lastMessageText: PENDING_FIRST_MESSAGE_INTEREST_TEXT,
      lastMessageTime: lastMessageTime.toISOString(),
      lastMessageFromMe: false,
      unreadCount: currentConversation?.unreadCount ?? params.conversation?.unreadCount ?? 1,
      isArchived: Boolean(currentConversation?.isArchived || params.conversation?.isArchived),
      needsHumanAttention: true,
      attentionPriority: "high",
      attentionReason,
      attentionQualifiedAt: attentionQualifiedAt.toISOString(),
    },
  });
}

async function schedulePendingFirstMessageAIResponse(params: {
  source: PendingFirstMessageRecoverySource;
  userId: string;
  connectionId?: string | null;
  conversation: any;
  contactNumber: string;
  jidSuffix?: string | null;
  unreadCount?: number | null;
  conversationWasCreated?: boolean | null;
  existingMessages?: any[] | null;
  pendingMessages?: Array<string | null | undefined> | null;
  displayMessageId?: string | null;
  displayTimestamp?: Date | null;
  reason: string;
}): Promise<boolean> {
  const conversationId = String(params.conversation?.id || "");
  if (!conversationId) {
    return false;
  }

  const jidSuffix = params.jidSuffix || params.conversation?.jidSuffix || DEFAULT_JID_SUFFIX;
  const remoteJid = String(params.conversation?.remoteJid || "");
  const isDirectChat = jidSuffix !== "g.us" && !remoteJid.endsWith("@g.us");
  const existingMessages =
    params.existingMessages ?? (await storage.getMessagesByConversationId(conversationId));
  const pendingMessages = params.pendingMessages || [];

  const decision = decidePendingFirstMessageRecovery({
    source: params.source,
    isDirectChat,
    unreadCount: params.unreadCount,
    conversationWasCreated: params.conversationWasCreated,
    existingMessages,
    pendingMessages,
  });

  if (!decision.eligible || !decision.context) {
    console.log(
      `[PENDING-FIRST-MESSAGE] skip conversation=${conversationId} source=${params.source} reason=${decision.reason}`,
    );
    return false;
  }

  const existingPending = pendingResponses.get(conversationId);
  if (existingPending) {
    const existingOnlyPendingFirstMessage =
      shouldReplacePendingFirstMessagePayloadWithRealText(existingPending.messages) ||
      Boolean(existingPending.pendingFirstMessageRecovery);
    const existingOnlyTechnical =
      existingPending.messages.length > 0 &&
      existingPending.messages.every((message) => isTechnicalStubMessage(message));

    if (!existingOnlyPendingFirstMessage && !existingOnlyTechnical) {
      console.log(
        `[PENDING-FIRST-MESSAGE] skip conversation=${conversationId} source=${params.source} reason=pending_real_text_exists`,
      );
      return false;
    }

    clearPendingResponseTimeout(existingPending);
    pendingResponses.delete(conversationId);
  }

  try {
    const persisted = await storage.getPendingAIResponse(conversationId);
    if (persisted?.messages?.length) {
      const persistedOnlyPendingFirstMessage =
        shouldReplacePendingFirstMessagePayloadWithRealText(persisted.messages);
      const persistedOnlyTechnical = persisted.messages.every((message) => isTechnicalStubMessage(message));
      if (!persistedOnlyPendingFirstMessage && !persistedOnlyTechnical) {
        console.log(
          `[PENDING-FIRST-MESSAGE] skip conversation=${conversationId} source=${params.source} reason=persisted_pending_real_text_exists`,
        );
        return false;
      }
    }
  } catch (error) {
    console.warn(
      `[PENDING-FIRST-MESSAGE] Falha ao consultar pending persistido conversation=${conversationId}:`,
      error,
    );
  }

  await promotePendingFirstMessageDisplayToInterest({
    userId: params.userId,
    conversation: params.conversation,
    messageId: params.displayMessageId,
    timestamp: params.displayTimestamp,
  });

  const agentConfig = await storage.getAgentConfig(params.userId);
  const responseDelaySeconds = Number.isFinite(Number(agentConfig?.responseDelaySeconds))
    ? Number(agentConfig?.responseDelaySeconds)
    : 30;
  const responseDelayMs = responseDelaySeconds * 1000;
  const payload = buildPendingFirstMessagePendingPayload(params.source);
  const pending: PendingResponse = {
    timeout: null as any,
    messages: [payload],
    conversationId,
    userId: params.userId,
    connectionId: params.connectionId || params.conversation?.connectionId,
    contactNumber: params.contactNumber,
    jidSuffix,
    startTime: Date.now(),
    pendingFirstMessageRecovery: decision.context,
    responseDelaySeconds,
  };

  pending.timeout = schedulePendingResponseProcessing(
    pending,
    responseDelayMs,
    params.reason,
  );
  pendingResponses.set(conversationId, pending);

  try {
    await storage.savePendingAIResponse({
      conversationId,
      userId: params.userId,
      contactNumber: params.contactNumber,
      jidSuffix,
      messages: [payload],
      executeAt: new Date(Date.now() + responseDelayMs),
    });
  } catch (error) {
    console.error(
      `[PENDING-FIRST-MESSAGE] Falha ao persistir pending conversation=${conversationId}:`,
      error,
    );
  }

  console.log(
    `[PENDING-FIRST-MESSAGE] IA agendada conversation=${conversationId} contact=${params.contactNumber} ` +
      `source=${params.source} delay=${responseDelaySeconds}s`,
  );
  return true;
}

function releaseStalePendingResponseInMemory(params: {
  conversationId: string;
  contactNumber: string;
  executeAtMs?: number;
  reason: string;
}): boolean {
  const pending = pendingResponses.get(params.conversationId);
  if (!pending) {
    return false;
  }

  const now = Date.now();
  const pendingAge = now - (pending.startTime || now);
  const dueAge = params.executeAtMs ? now - params.executeAtMs : pendingAge;
  const effectiveAge = Math.max(pendingAge, dueAge);

  if (effectiveAge <= PENDING_IN_MEMORY_TTL_MS) {
    return false;
  }

  clearPendingResponseTimeout(pending);
  pendingResponses.delete(params.conversationId);
  console.warn(
    `⚠️ [PENDING CRON] PENDING_IN_MEMORY_STALE_RELEASED: ${params.contactNumber} ` +
      `(conv ${params.conversationId.substring(0, 8)}) preso ha ${Math.round(effectiveAge / 1000)}s, ` +
      `liberando timer em memoria (${params.reason})`,
  );
  return true;
}

// -----------------------------------------------------------------------
// FIX 2026-02-24: RETRY COUNTER for Connection Closed errors
// Tracks how many times a conversation has been retried due to send failures.
// After MAX_SEND_RETRIES, the timer is marked as failed to prevent infinite loops.
// Entries are cleaned up when a timer completes or fails.
// -----------------------------------------------------------------------
const pendingRetryCounter = new Map<string, number>(); // key: conversationId ? retry count
const MAX_SEND_RETRIES = 12; // Max 12 retries with exponential backoff

const MAX_CODEX_NO_SEND_RETRIES = readPositiveIntegerEnv("AGENTEZAP_CODEX_NO_SEND_MAX_RETRIES", 3);

const SESSION_AVAILABLE_RETRY_MS = 30 * 1000;
const SESSION_UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;
const SESSION_UNAVAILABLE_MAX_AGE_MS = 30 * 60 * 1000;
// ? FIX: Retry rï¿½pido quando erro ï¿½ Connection Closed (socket reconectando)
const CONNECTION_CLOSED_RETRY_MS = 5 * 1000; // 5 segundos
const SESSION_RECOVERY_ATTEMPT_COOLDOWN_MS = 60 * 1000; // evita storm de reconnect por timer
const sessionRecoveryAttemptAt = new Map<string, number>(); // key: connectionId or userId

// -----------------------------------------------------------------------
// ?? IMPLEMENTAï¿½ï¿½O REAL: checkForMissedMessages
// -----------------------------------------------------------------------
// Agora que pendingResponses e conversationsBeingProcessed foram declarados,
// podemos implementar a funï¿½ï¿½o real.
// -----------------------------------------------------------------------
checkForMissedMessages = async function(session: WhatsAppSession): Promise<void> {
  if (!session.socket || !session.isConnected) return;
  
  const { userId, connectionId } = session;
  
  // Rate limit: verificar apenas a cada 45 segundos por sessï¿½o
  const lastCheck = lastMissedMessageCheck.get(userId) || 0;
  if (Date.now() - lastCheck < 45000) return;
  lastMissedMessageCheck.set(userId, Date.now());
  
  try {
    // 1. Buscar conversas com mensagens recentes (ï¿½ltimos 5 minutos)
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
    
    // 3. Processar mensagens nï¿½o respondidas
    for (const row of result.rows) {
      const cacheKey = `${row.conversation_id}_${row.message_id}`;
      
      // Evitar reprocessar mensagens jï¿½ detectadas
      if (detectedMissedMessages.has(cacheKey)) continue;
      detectedMissedMessages.add(cacheKey);
      
      // Limpar cache antigo (manter ï¿½ltimas 1000 entradas)
      if (detectedMissedMessages.size > 1000) {
        const entries = Array.from(detectedMissedMessages);
        entries.slice(0, 500).forEach(e => detectedMissedMessages.delete(e));
      }
      
      // Verificar se jï¿½ tem resposta pendente
      if (pendingResponses.has(row.conversation_id)) {
        console.log(`?? [MISSED MSG] ${row.contact_number} - Jï¿½ tem resposta pendente`);
        continue;
      }
      
      // Verificar se estï¿½ sendo processada
      if (conversationsBeingProcessed.has(row.conversation_id)) {
        console.log(`?? [MISSED MSG] ${row.contact_number} - Em processamento`);
        continue;
      }
      
      console.log(`\n?? [MISSED MSG] MENSAGEM Nï¿½O PROCESSADA DETECTADA!`);
      console.log(`   ?? Contato: ${row.contact_number}`);
      console.log(`   ?? Mensagem: "${(row.text || '[mï¿½dia]').substring(0, 50)}..."`);
      console.log(`   ? Enviada em: ${row.timestamp}`);
      console.log(`   ?? Triggando resposta da IA...`);
      
      // Agendar resposta com delay
      const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
      
      const pending: PendingResponse = {
        timeout: null as any,
        messages: [row.text || '[mï¿½dia recebida]'],
        conversationId: row.conversation_id,
        userId,
        connectionId,
        contactNumber: row.contact_number,
        jidSuffix: row.jid_suffix || DEFAULT_JID_SUFFIX,
        startTime: Date.now(),
        responseDelaySeconds,
      };
      
        pending.timeout = schedulePendingResponseProcessing(
          pending,
          responseDelaySeconds * 1000,
          `missed_message:${row.contact_number}`,
        );
      
      pendingResponses.set(row.conversation_id, pending);
      console.log(`   ? Resposta agendada em ${responseDelaySeconds}s\n`);
    }
    
  } catch (error) {
    // Silenciar erros para nï¿½o poluir logs
    if ((error as any).code !== 'ECONNREFUSED') {
      console.error(`? [MISSED MSG] Erro na verificaï¿½ï¿½o:`, error);
    }
  }
};

// ?? ANTI-DUPLICAï¿½ï¿½O: Cache de mensagens recentes enviadas (ï¿½ltimos 5 minutos)
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

function findRecentAutomatedReplyConflict(
  conversationHistory: Array<{
    fromMe?: boolean | null;
    isFromAgent?: boolean | null;
    text?: string | null;
    timestamp?: Date | string | null;
  }>,
  lastCustomerAt: Date | null,
  candidateText: string,
): { matchedText: string; similarity: number } | null {
  if (!lastCustomerAt) {
    return null;
  }

  const candidateFingerprint = buildOutgoingMessageFingerprint(candidateText);
  if (!candidateFingerprint) {
    return null;
  }

  const automatedRepliesAfterCustomer = conversationHistory
    .filter((message) => message?.fromMe && message?.isFromAgent === true)
    .map((message) => ({
      text: String(message?.text || "").trim(),
      timestamp: message?.timestamp ? new Date(message.timestamp) : null,
    }))
    .filter(
      (message) =>
        !!message.text &&
        !!message.timestamp &&
        !Number.isNaN(message.timestamp.getTime()) &&
        message.timestamp.getTime() >= lastCustomerAt.getTime(),
    )
    .sort((left, right) => left.timestamp!.getTime() - right.timestamp!.getTime());

  if (automatedRepliesAfterCustomer.length === 0) {
    return null;
  }

  for (const previousReply of automatedRepliesAfterCustomer) {
    if (buildOutgoingMessageFingerprint(previousReply.text) === candidateFingerprint) {
      return {
        matchedText: previousReply.text,
        similarity: 1,
      };
    }

    if (isOutgoingMessageNearDuplicate(candidateText, previousReply.text, 0.82)) {
      return {
        matchedText: previousReply.text,
        similarity: 0.82,
      };
    }
  }

  if (automatedRepliesAfterCustomer.length > 1) {
    const recentBlock = joinBubbleMessages(
      automatedRepliesAfterCustomer.slice(-3).map((message) => message.text),
    );
    if (recentBlock && isOutgoingMessageNearDuplicate(candidateText, recentBlock, 0.82)) {
      return {
        matchedText: recentBlock,
        similarity: 0.82,
      };
    }
  }

  return null;
}

// ðŸ“¦ SISTEMA DE ACUMULAÃ‡ÃƒO (ADMIN AUTO-ATENDIMENTO)
// V23f: Agora acumula TODOS os tipos de mensagem (texto, Ã¡udio, imagem)
function collectUnansweredInboundMessageRecords<T extends {
  fromMe?: boolean | null;
}>(
  conversationHistory: T[],
): T[] {
  const records: T[] = [];

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const message = conversationHistory[i];
    if (message?.fromMe) break;
    records.unshift(message);
  }

  return records;
}

type PendingInboundFreshnessRecord = {
  fromMe?: boolean | null;
  id?: string | null;
  messageId?: string | null;
  message_id?: string | null;
  timestamp?: Date | string | number | null;
  createdAt?: Date | string | number | null;
  created_at?: Date | string | number | null;
  text?: string | null;
  mediaType?: string | null;
  media_type?: string | null;
  mediaMimeType?: string | null;
  media_mime_type?: string | null;
  mediaUrl?: string | null;
  media_url?: string | null;
  mediaKey?: string | null;
  media_key?: string | null;
  directPath?: string | null;
  direct_path?: string | null;
};

function resolvePendingInboundFreshnessRecords(
  conversationHistory: unknown[],
  qrReconnectCutoffMs?: number | null,
): PendingInboundFreshnessRecord[] {
  const records = collectUnansweredInboundMessageRecords(
    conversationHistory as PendingInboundFreshnessRecord[],
  );
  if (!qrReconnectCutoffMs) {
    return records;
  }

  const threshold = qrReconnectCutoffMs - QR_RECONNECT_CUTOFF_DRIFT_MS;
  return records.filter((message) => {
    const timestampMs = parseTimestampMs(message.timestamp ?? message.createdAt ?? message.created_at);
    return timestampMs !== null && timestampMs >= threshold;
  });
}

function buildPendingInboundFreshnessSignature(
  message: PendingInboundFreshnessRecord,
  index: number,
): string {
  const id = String(message.id || message.messageId || message.message_id || "").trim();
  const timestampMs = parseTimestampMs(message.timestamp ?? message.createdAt ?? message.created_at);
  const mediaType = String(
    message.mediaType || message.media_type || message.mediaMimeType || message.media_mime_type || "",
  ).trim();
  const mediaRef = String(
    message.mediaUrl || message.media_url || message.mediaKey || message.media_key || message.directPath || message.direct_path || "",
  )
    .trim()
    .slice(-160);
  const text = String(message.text || "").trim();

  return [
    id ? `id:${id}` : `idx:${index}`,
    `ts:${timestampMs ?? "none"}`,
    `media:${mediaType}`,
    `ref:${mediaRef}`,
    `text:${text}`,
  ].join("|");
}

function resolveLatestUnansweredInboundBatchForPending(
  conversationHistory: unknown[],
  qrReconnectCutoffMs?: number | null,
): { texts: string[]; signatures: string[] } {
  const records = resolvePendingInboundFreshnessRecords(conversationHistory, qrReconnectCutoffMs);
  return {
    texts: records
      .map((message) => String(message?.text || "").trim())
      .filter(Boolean),
    signatures: records.map((message, index) => buildPendingInboundFreshnessSignature(message, index)),
  };
}

function collectUnansweredInboundTexts(
  conversationHistory: Array<{
    fromMe?: boolean | null;
    text?: string | null;
  }>,
): string[] {
  return collectUnansweredInboundMessageRecords(conversationHistory)
    .map((message) => String(message?.text || "").trim())
    .filter(Boolean);
}

function normalizePendingMessageBatch(messages: string[]): string[] {
  return messages
    .map((message) => String(message || "").trim())
    .filter(Boolean);
}

function arePendingMessageBatchesEquivalent(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizePendingMessageBatch(left);
  const normalizedRight = normalizePendingMessageBatch(right);

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((message, index) => message === normalizedRight[index])
  );
}

function arePendingInboundRecordBatchesEquivalent(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((signature, index) => signature === right[index])
  );
}

function resolveLatestUnansweredTextsForPending(
  conversationHistory: unknown[],
  qrReconnectCutoffMs?: number | null,
): string[] {
  if (qrReconnectCutoffMs) {
    return getUnansweredInboundTextsAtOrAfterQrReconnectCutoff(
      conversationHistory,
      qrReconnectCutoffMs,
    );
  }

  return collectUnansweredInboundTexts(
    conversationHistory as Array<{
      fromMe?: boolean | null;
      text?: string | null;
    }>,
  );
}

async function refreshPendingAIResponseBeforeSend(params: {
  conversationId: string;
  pending: PendingResponse;
  pendingMessagesForAI: string[];
  pendingInboundRecordSignatureForAI: string[];
  pendingMutationGuard: PendingAIResponseMutationGuard;
  qrReconnectCutoffMs?: number | null;
  delayMs?: number;
}): Promise<boolean> {
  const freshConversationHistory = await storage.getMessagesByConversationId(params.conversationId);
  const latestInboundBatch = resolveLatestUnansweredInboundBatchForPending(
    freshConversationHistory,
    params.qrReconnectCutoffMs,
  );
  const latestUnansweredTexts = latestInboundBatch.texts;
  const latestInboundSignatures = latestInboundBatch.signatures;

  if (
    latestUnansweredTexts.length === 0 &&
    latestInboundSignatures.length === 0
  ) {
    return false;
  }

  if (
    arePendingMessageBatchesEquivalent(params.pendingMessagesForAI, latestUnansweredTexts) &&
    arePendingInboundRecordBatchesEquivalent(params.pendingInboundRecordSignatureForAI, latestInboundSignatures)
  ) {
    return false;
  }

  const retryDelayMs = Math.max(250, params.delayMs ?? 1000);
  const executeAt = new Date(Date.now() + retryDelayMs);
  params.pending.messages = latestUnansweredTexts;
  params.pending.retryCount = 0;
  params.pending.startTime = Date.now();
  params.pendingMutationGuard.expectedMessages = [...latestUnansweredTexts];
  params.pendingMutationGuard.notUpdatedAfter = new Date(Date.now() + 5000);

  try {
    await storage.updatePendingAIResponseMessages(
      params.conversationId,
      latestUnansweredTexts,
      executeAt,
      { resetRetry: true },
    );
  } catch (error) {
    console.warn(
      `[AI AGENT] Falha ao persistir refresh final antes do envio ${params.conversationId}:`,
      error,
    );
  }

  clearPendingResponseTimeout(params.pending);
  params.pending.timeout = schedulePendingResponseProcessing(
    params.pending,
    retryDelayMs,
    `fresh_inbound_before_send:${params.pending.contactNumber}`,
  );
  pendingResponses.set(params.conversationId, params.pending);

  console.log(
    `[AI AGENT] Resposta gerada foi descartada antes do envio porque chegaram mensagens novas ` +
      `(textosAntes=${params.pendingMessagesForAI.length}, textosDepois=${latestUnansweredTexts.length}, ` +
      `registrosAntes=${params.pendingInboundRecordSignatureForAI.length}, registrosDepois=${latestInboundSignatures.length}) ` +
      `conversation=${params.conversationId}`,
  );

  return true;
}

function hasPendingInboundAudioTranscription(
  conversationHistory: Array<{
    fromMe?: boolean | null;
    mediaType?: string | null;
    mediaUrl?: string | null;
    text?: string | null;
  }>,
): boolean {
  return conversationHistory.some((message) =>
    message?.fromMe === false &&
    message.mediaType === "audio" &&
    !!message.mediaUrl &&
    isPendingAudioTranscriptionText(message.text),
  );
}

function resolveAudioTranscriptionPendingRetryDelayMs(params: {
  retryAfterMs?: number;
  retryCount?: number;
  responseDelaySeconds?: number | null;
}): number {
  const policyDelayMs = resolvePendingAIResponseRetryDelaySeconds({
    retryCount: Math.max(0, Number(params.retryCount || 0)) + 1,
    responseDelaySeconds: params.responseDelaySeconds,
  }) * 1000;
  const requestedDelayMs = Math.max(params.retryAfterMs || 0, policyDelayMs, 15_000);
  return Math.min(requestedDelayMs, 15 * 60_000);
}

interface PendingAdminMessage {
  text: string;
  mediaType?: string;
  mediaUrl?: string;
  mediaMimeType?: string | null;
}

interface PendingAdminResponse {
  timeout: NodeJS.Timeout | null;
  messages: PendingAdminMessage[];
  remoteJid: string;
  contactNumber: string;
  adminId: string;
  generation: number;
  startTime: number;
  conversationId?: string;
  lastKnownPresence?: string;
  lastPresenceUpdate?: number;
  retryCount?: number;
}
const pendingAdminResponses = new Map<string, PendingAdminResponse>(); // key: contactNumber
const pendingAdminStubRecoveries = new Map<string, NodeJS.Timeout>(); // key: adminId:messageId

async function autoPauseAdminConversationOnManualReply(params: {
  adminId: string;
  conversationId: string;
  contactNumber: string;
  source: string;
}): Promise<void> {
  const { adminId, conversationId, contactNumber, source } = params;

  if (!isManualAdminPauseSource(source)) {
    console.log(
      `[ADMIN AUTO-PAUSE] Ignorado para conversa ${conversationId} (${contactNumber}) via ${source} â€” fonte automatica`,
    );
    return;
  }

  const pending = pendingAdminResponses.get(contactNumber);
  if (pending?.timeout) {
    clearTimeout(pending.timeout);
  }
  pendingAdminResponses.delete(contactNumber);

  await storage.toggleAdminConversationAgent(conversationId, false);
  broadcastToAdmin(adminId, {
    type: "admin_conversation_agent_paused",
    conversationId,
    contactNumber,
    isAgentEnabled: false,
    source,
  });

  console.log(
    `[ADMIN AUTO-PAUSE] IA pausada automaticamente para conversa ${conversationId} (${contactNumber}) via ${source}`,
  );
}

function rescheduleAdminPendingResponse(params: {
  socket: WASocket;
  key: string;
  delayMs: number;
  reason: string;
}): boolean {
  const { socket, key, delayMs, reason } = params;
  const pending = pendingAdminResponses.get(key);
  if (!pending) return false;

  if (pending.timeout) {
    clearTimeout(pending.timeout);
  }

  const safeDelay = Math.max(1000, delayMs);
  pending.timeout = setTimeout(() => {
    const refreshedSocket = adminSessions.get(pending.adminId)?.socket || socket;
    void processAdminAccumulatedMessages({
      socket: refreshedSocket,
      key,
      generation: pending.generation,
    });
  }, safeDelay);

  console.log(`â³ [ADMIN AGENT] Reagendado para ${key} em ${Math.round(safeDelay / 1000)}s. Motivo: ${reason}`);
  return true;
}

function isTransientAdminProcessingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("connection closed") ||
    normalized.includes("not connected") ||
    normalized.includes("websocket") ||
    normalized.includes("socket") ||
    normalized.includes("timed out") ||
    normalized.includes("stream errored out")
  );
}

async function recoverAdminConversationsAfterReconnect(adminId: string): Promise<void> {
  try {
    const session = await getConnectedAdminSessionOrRecover(adminId);
    if (!session?.socket) return;

    const threshold = Date.now() - (2 * 60 * 60 * 1000);
    const conversations = await storage.getAdminConversations(adminId);
    const candidates = conversations
      .filter((conversation: any) => {
        if (!conversation?.isAgentEnabled || !conversation?.lastMessageTime) return false;
        return new Date(conversation.lastMessageTime).getTime() >= threshold;
      })
      .slice(0, 20);

    if (candidates.length === 0) return;

    console.log(`[ADMIN RECOVERY] Verificando ${candidates.length} conversa(s) recentes para retomar respostas`);
    for (const conversation of candidates) {
      if (pendingAdminResponses.has(conversation.contactNumber)) continue;
      const result = await triggerAdminAgentResponseForConversation(conversation.id);
      if (result.triggered) {
        console.log(`[ADMIN RECOVERY] Conversa ${conversation.id} reagendada apÃ³s reconnect`);
      }
    }
  } catch (error) {
    console.error(`[ADMIN RECOVERY] Erro ao recuperar conversas do admin ${adminId}:`, error);
  }
}

async function scheduleAdminStubRecovery(params: {
  adminId: string;
  socket: WASocket;
  waMessage: any;
  contactNumber: string;
  realRemoteJid: string;
  contactName?: string;
}): Promise<void> {
  const { adminId, socket, waMessage, contactNumber, realRemoteJid, contactName } = params;
  const stubMsgId = waMessage?.key?.id;
  if (!stubMsgId) return;

  const recoveryKey = `${adminId}:${stubMsgId}`;
  if (pendingAdminStubRecoveries.has(recoveryKey)) return;

  const cacheScope = `admin_${adminId}`;
  const MAX_PDO_RETRIES = 4;
  const PDO_RETRY_INTERVAL_MS = 2000;
  const FINAL_FALLBACK_MS = MAX_PDO_RETRIES * PDO_RETRY_INTERVAL_MS;

  const ensureConversationAndStub = async () => {
    const conversation = await storage.getOrCreateAdminConversation(
      adminId,
      contactNumber,
      realRemoteJid,
      contactName,
    );

    let adminMessage = await storage.getAdminMessageByMessageId(stubMsgId);
    if (!adminMessage) {
      adminMessage = await storage.createAdminMessage({
        conversationId: conversation.id,
        messageId: stubMsgId,
        fromMe: false,
        text: UNRESOLVED_INCOMING_STUB_TEXT,
        timestamp: new Date(),
        status: "received",
        isFromAgent: false,
      });

      await storage.updateAdminConversation(conversation.id, {
        lastMessageText: UNRESOLVED_INCOMING_STUB_TEXT,
        lastMessageTime: new Date(),
      });
    }

    return { conversation, adminMessage };
  };

  const checkResolved = async (): Promise<boolean> => {
    const cached = getCachedMessage(cacheScope, stubMsgId);
    if (cached && isMeaningfulIncomingContent(cached)) {
      return true;
    }

    const dbMessage = await storage.getAdminMessageByMessageId(stubMsgId);
    if (dbMessage?.text && !isStubOrIncompleteText(dbMessage.text)) {
      return true;
    }

    return false;
  };

  const pdoMessageKey = {
    remoteJid: waMessage.key.remoteJid,
    fromMe: waMessage.key.fromMe,
    id: waMessage.key.id,
    participant: waMessage.key.participant,
  };
  const pdoMsgData = {
    key: waMessage.key,
    messageTimestamp: waMessage.messageTimestamp,
    pushName: waMessage.pushName,
    participant: waMessage.participant,
    verifiedBizName: waMessage.verifiedBizName,
  };

  const runFallback = async () => {
    pendingAdminStubRecoveries.delete(recoveryKey);

    if (await checkResolved()) {
      return;
    }

    const fallbackText = UNRESOLVED_INCOMING_STUB_TEXT;
    const { conversation, adminMessage } = await ensureConversationAndStub();
    await storage.updateAdminMessage(adminMessage.id, {
      text: fallbackText,
      timestamp: new Date(),
    });
    await storage.updateAdminConversation(conversation.id, {
      lastMessageText: fallbackText,
      lastMessageTime: new Date(),
    });

    console.log(
      `âš ï¸ [ADMIN CTWA FALLBACK] Mensagem ${stubMsgId} ainda incompleta apÃ³s ${FINAL_FALLBACK_MS / 1000}s, usando fallback "${fallbackText}"`,
    );

    console.warn(`[ADMIN CTWA PENDING] Mensagem ${stubMsgId} mantida pendente sem automacao.`);
    return;

    const adminConnection = await storage.getAdminWhatsappConnection(adminId);
    const isAgentEnabled = await storage.isAdminAgentEnabledForConversation(conversation.id);
    if (!shouldProcessInboundAdminAutomation({
      isAgentEnabled,
      isConnectionAiEnabled: adminConnection?.aiEnabled !== false,
      followupActive: conversation.followupActive,
    })) {
      console.log(`[ADMIN CTWA FALLBACK] Conversa ${conversation.id} pausada, fallback salvo sem resposta automÃ¡tica`);
      return;
    }

    await scheduleAdminAccumulatedResponse({
      adminId,
      socket,
      remoteJid: realRemoteJid,
      contactNumber,
      messageText: fallbackText,
      conversationId: conversation.id,
    });
  };

  const attemptPDO = async (attemptNum: number) => {
    if (await checkResolved()) return;
    try {
      const requestId = await (socket as any).requestPlaceholderResend?.(pdoMessageKey, pdoMsgData);
      console.log(
        `ðŸ” [ADMIN CTWA PDO] Tentativa #${attemptNum} para ${stubMsgId} (${contactNumber})${requestId ? ` requestId=${requestId}` : ""}`,
      );
    } catch (error) {
      console.error(`âŒ [ADMIN CTWA PDO] Erro na tentativa #${attemptNum} para ${stubMsgId}:`, error);
    }
  };

  await ensureConversationAndStub();

  for (let attemptNum = 1; attemptNum <= MAX_PDO_RETRIES; attemptNum++) {
    setTimeout(() => {
      void attemptPDO(attemptNum);
    }, (attemptNum - 1) * PDO_RETRY_INTERVAL_MS);
  }

  const fallbackTimer = setTimeout(() => {
    void runFallback();
  }, FINAL_FALLBACK_MS);
  pendingAdminStubRecoveries.set(recoveryKey, fallbackTimer);
}

// ?? Set para rastrear conversas j? verificadas na sess?o atual (evita reprocessamento)
const checkedConversationsThisSession = new Set<string>();

// -----------------------------------------------------------------------
// ??? SISTEMA ANTI-BLOQUEIO v4.0 - Registro do Callback de Envio Real
// -----------------------------------------------------------------------
// Esta funï¿½ï¿½o ï¿½ chamada pelo messageQueueService para enviar mensagens reais
// O callback permite que a fila controle o timing entre mensagens
// ?? v4.0: Agora simula "digitando..." antes de enviar para parecer mais humano
// ?? v4.1: Wait-for-reconnect ï¿½ se a sessï¿½o estï¿½ reconectando, espera atï¿½ 15s
async function internalSendMessageRaw(
  userId: string, 
  jid: string, 
  text: string, 
  options?: { isFromAgent?: boolean; conversationId?: string; connectionId?: string; source?: "owner" | "agent" | "followup" | "system"; fastLane?: boolean; skipTyping?: boolean }
): Promise<string | null> {
  const SEND_WAIT_MAX_MS = 15_000; // mï¿½x 15s esperando reconexï¿½o
  const SEND_WAIT_INTERVAL_MS = 2_000; // checar a cada 2s
  const RECOVERY_WAIT_MS = 8_000;
  const automationOrigin = resolveAutomatedSendOrigin(options?.source);

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
    console.log(`? [SEND] Sessï¿½o indisponï¿½vel para ${userId.substring(0, 8)}... ï¿½ aguardando reconexï¿½o (mï¿½x ${Math.round(maxWaitMs / 1000)}s)`);
    while (Date.now() - startWait < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, SEND_WAIT_INTERVAL_MS));
      candidate = resolveReadySession(preferredConnectionId);
      if (isSessionReadyForMessaging(candidate)) {
        console.log(`? [SEND] Sessï¿½o reconectada para ${userId.substring(0, 8)}... apï¿½s ${Math.round((Date.now() - startWait) / 1000)}s`);
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
        `(${userConnections.length} connections). conversationId/connectionId obrigatï¿½rio para evitar envio no nï¿½mero errado.`,
      );
      throw new Error("Ambiguous connection context: conversationId or connectionId required");
    } else {
      const fallbackConnection = await storage.getConnectionByUserId(userId);
      resolvedConnectionId = fallbackConnection?.id;
    }
  }

  if (options?.isFromAgent) {
    const pausedBeforeTyping = await shouldBlockAutomatedConversationSend({
      userId,
      jid,
      conversationId: options?.conversationId,
      origin: automationOrigin,
    });

    if (pausedBeforeTyping.blocked) {
      console.log(`⏸️ [SEND] Envio automático bloqueado para ${jid} - conversa ${pausedBeforeTyping.conversationId} está pausada`);
      return AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID;
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
    if (!options?.skipTyping) {
    try {
      const typingDuration = options?.fastLane
        ? Math.min(antiBanProtectionService.calculateTypingDuration(text.length), 1200)
        : antiBanProtectionService.calculateTypingDuration(text.length);
      await activeSession.socket.sendPresenceUpdate('composing', jid);
      console.log(`??? [ANTI-BAN] ?? Simulando digitaï¿½ï¿½o por ${Math.round(typingDuration/1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, typingDuration));
      await activeSession.socket.sendPresenceUpdate('paused', jid);
      const finalDelay = options?.fastLane
        ? 100 + Math.random() * 200
        : 500 + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, finalDelay));
    } catch (err) {
      // Nï¿½o falhar se nï¿½o conseguir enviar status de digitaï¿½ï¿½o
      console.log(`??? [ANTI-BAN] ?? Nï¿½o foi possï¿½vel enviar status de digitaï¿½ï¿½o:`, err);
    }

    }

    const wsBeforeSend = getSessionWsReadyState(activeSession);
    if (wsBeforeSend !== undefined && wsBeforeSend !== 1) {
      throw new Error("Connection Closed");
    }

    if (options?.isFromAgent) {
      const pausedBeforeSend = await shouldBlockAutomatedConversationSend({
        userId,
        jid,
        conversationId: options?.conversationId,
        origin: automationOrigin,
      });

      if (pausedBeforeSend.blocked) {
        console.log(`⏸️ [SEND] Envio automático bloqueado imediatamente antes do envio para ${jid}`);
        return AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID;
      }
    }

    const normalizedSendText = normalizeOutboundTextForCustomer(text);
    const sentMessage = await activeSession.socket.sendMessage(
      jid,
      buildPlainTextWhatsAppPayload(normalizedSendText),
    );

    if (sentMessage?.key.id) {
      if (options?.conversationId) {
        trackSharedAutomaticOutgoingMessage({
          messageId: sentMessage.key.id,
          contactNumber: cleanContactNumber(jid),
          conversationId: options.conversationId,
          text: normalizedSendText,
          isFromAgent: options?.isFromAgent ?? false,
          source: `queue_callback_${options?.source || "unknown"}`,
        });
      }
      agentMessageIds.add(sentMessage.key.id);
      try {
        if (sentMessage.message) {
          cacheMessage(userId, sentMessage.key.id, sentMessage.message);
        } else {
          cacheMessage(userId, sentMessage.key.id, { conversation: normalizedSendText });
        }
      } catch (cacheError) {
        console.warn(
          `?? [ANTI-BLOCK] Falha local ao guardar cache da mensagem ${sentMessage.key.id}; envio remoto preservado:`,
          cacheError,
        );
      }
      console.log(`??? [ANTI-BLOCK] ? Mensagem enviada - ID: ${sentMessage.key.id}`);
    }

    return sentMessage?.key.id || null;
  };

  let initialSession = await waitForReadySession(resolvedConnectionId);
  if (!isSessionReadyForMessaging(initialSession)) {
    initialSession = await ensureUserSessionOperational(userId, resolvedConnectionId, {
      waitMs: SEND_WAIT_MAX_MS,
      source: `queue_send:${options?.conversationId || jid}`,
    });
  }
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
        console.warn(`?? [SEND] Connection Closed ao enviar para ${jid}. Forï¿½ando reconnect (conn=${resolvedConnectionId.substring(0, 8)}, user=${userId.substring(0, 8)})`);
        try {
          await connectWhatsApp(userId, resolvedConnectionId, { source: "send_recovery" });
        } catch (reconnectError) {
          console.warn(`?? [SEND] Reconnect apï¿½s Connection Closed falhou:`, reconnectError);
        }
      }
    }

    let recoveredSession = await waitForReadySession(resolvedConnectionId, RECOVERY_WAIT_MS);
    if (!isSessionReadyForMessaging(recoveredSession)) {
      recoveredSession = await ensureUserSessionOperational(userId, resolvedConnectionId, {
        waitMs: RECOVERY_WAIT_MS,
        source: `queue_send_retry:${options?.conversationId || jid}`,
      });
    }
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
// Garante delay humano mínimo de 10s entre mensagens do MESMO WhatsApp.

/**
 * Envia qualquer tipo de mensagem respeitando a fila anti-bloqueio
 * @param queueId - ID da fila (userId para usu?rios, "admin_" + adminId para admins)
 * @param description - Descri??o do envio para logs
 * @param sendFn - Fun??o que faz o envio real
 */
async function sendWithQueue<T>(
  queueId: string,
  description: string,
  sendFn: () => Promise<T>,
  options?: {
    yieldQueue?: boolean;
    skipDelay?: boolean;
    ownerManualContactNumber?: string;
  },
): Promise<T> {
  return messageQueueService.executeWithDelay(queueId, description, sendFn, options);
}

function getAdminQueueId(adminId: string): string {
  return `admin_${adminId}`;
}

// -----------------------------------------------------------------------
// VERIFICACAO DE MENSAGENS NAO RESPONDIDAS AO RECONECTAR
// -----------------------------------------------------------------------
// Quando o WhatsApp reconecta apos desconexao/restart, verificamos se ha
// clientes que mandaram mensagem nas ultimas 24h e nao foram respondidos.
// Isso resolve o problema de mensagens perdidas durante desconexoes.
// -----------------------------------------------------------------------
async function checkUnrespondedMessages(session: WhatsAppSession): Promise<void> {
  const { userId, connectionId } = session;
  
  console.log(`\n[UNRESPONDED CHECK] Iniciando verificacao de mensagens nao respondidas...`);
  console.log(`   Usuario: ${userId}`);
  
  try {
    // 1. Verificar se o agente esta ativo
    const agentConfig = await storage.getAgentConfig(userId);
    if (!agentConfig?.isActive) {
      console.log(`[UNRESPONDED CHECK] Agente inativo, pulando verificacao`);
      return;
    }

    let connectionRecordForBacklog: WhatsappConnection | null = null;
    try {
      connectionRecordForBacklog = (await storage.getConnectionById(connectionId)) ?? null;
    } catch (connectionLookupError) {
      console.warn(
        `[UNRESPONDED CHECK] Falha ao ler conexao ${connectionId.substring(0, 8)} para politica de backlog:`,
        connectionLookupError,
      );
    }

    if (connectionRecordForBacklog?.aiEnabled === false) {
      console.log(`[UNRESPONDED CHECK] IA desativada para a conexao, pulando verificacao`);
      return;
    }

    const qrReconnectCutoffMs = getQrReconnectCutoffMs(connectionRecordForBacklog, session);
    
    // 2. Buscar apenas o estado mínimo das conversas recentes
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentConversations = await storage.getRecentConversationRecoveryState(
      connectionId,
      twentyFourHoursAgo,
    );
    
    console.log(`[UNRESPONDED CHECK] ${recentConversations.length} conversas nas ultimas 24h`);
    
    let unrespondedCount = 0;
    let processedCount = 0;

    const uncheckedConversations = recentConversations.filter((conversation) => {
      if (checkedConversationsThisSession.has(conversation.id)) {
        return false;
      }

      checkedConversationsThisSession.add(conversation.id);
      return true;
    });

    const disabledConversationIds = new Set(
      await storage.getDisabledConversationIds(
        uncheckedConversations.map((conversation) => conversation.id),
      ),
    );
    
    for (const conversation of uncheckedConversations) {
      // 4. Verificar se agente esta pausado para esta conversa
      if (disabledConversationIds.has(conversation.id)) {
        continue;
      }

      // 5. Se a conversa ja termina com mensagem nossa, nao ha nada pendente
      if (conversation.lastMessageFromMe) {
        continue;
      }

      unrespondedCount++;
      
      // 6. Verificar se ja tem resposta pendente
      if (pendingResponses.has(conversation.id)) {
        console.log(`[UNRESPONDED CHECK] ${conversation.contactNumber} - ja tem resposta pendente`);
        continue;
      }
      
      console.log(`[UNRESPONDED CHECK] ${conversation.contactNumber} - ultima mensagem do cliente SEM RESPOSTA`);
      console.log(`   Mensagem: "${(conversation.lastMessageText || '[midia]').substring(0, 50)}..."`);
      console.log(`   Enviada em: ${conversation.lastMessageTime}`);

      const lastMessageTimeMs = parseTimestampMs(conversation.lastMessageTime);
      if (
        qrReconnectCutoffMs &&
        lastMessageTimeMs !== null &&
        lastMessageTimeMs < qrReconnectCutoffMs - QR_RECONNECT_CUTOFF_DRIFT_MS
      ) {
        console.log(
          `[UNRESPONDED CHECK] ${conversation.contactNumber} - pulando backlog anterior ao QR reconnect`,
        );
        continue;
      }
      
      // 7. Agendar resposta com delay para nao sobrecarregar
      const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
      const delayForThisMessage = (processedCount * 5000) + (responseDelaySeconds * 1000); // 5s entre cada + delay normal
      
      const pending: PendingResponse = {
        timeout: null as any,
        messages: [conversation.lastMessageText || '[midia recebida]'],
        conversationId: conversation.id,
        userId,
        connectionId,
        contactNumber: conversation.contactNumber,
        jidSuffix: conversation.jidSuffix || DEFAULT_JID_SUFFIX,
        startTime: Date.now(),
        responseDelaySeconds,
      };
      
      pending.timeout = schedulePendingResponseProcessing(
        pending,
        delayForThisMessage,
        `unresponded_check:${conversation.contactNumber}`,
      );
      
      pendingResponses.set(conversation.id, pending);
      processedCount++;
      
      console.log(`[UNRESPONDED CHECK] Resposta agendada em ${Math.round(delayForThisMessage/1000)}s`);
    }
    
    console.log(`\n[UNRESPONDED CHECK] Verificacao concluida:`);
    console.log(`   Total conversas 24h: ${recentConversations.length}`);
    console.log(`   Nao respondidas: ${unrespondedCount}`);
    console.log(`   Respostas agendadas: ${processedCount}\n`);
    
  } catch (error) {
    console.error(`[UNRESPONDED CHECK] Erro na verificacao:`, error);
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
  adminId: string;
  socket: WASocket;
  remoteJid: string;
  contactNumber: string;
  messageText: string;
  conversationId?: string;
  mediaType?: string;
  mediaUrl?: string;
  mediaMimeType?: string | null;
}): Promise<void> {
  const { adminId, socket, remoteJid, contactNumber, messageText, conversationId, mediaType, mediaUrl, mediaMimeType } = params;
  const config = await getAdminAgentRuntimeConfig();
  const key = contactNumber;

  console.log(`\nðŸ“¦ [ADMIN AGENT] Mensagem recebida de ${contactNumber}${mediaType ? ` (${mediaType})` : ''}`);
  console.log(`   â±ï¸ Delay configurado: ${config.responseDelayMs}ms (${config.responseDelayMs/1000}s)`);

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
    existing.adminId = adminId;
    existing.messages.push({ text: messageText, mediaType, mediaUrl, mediaMimeType });
    existing.generation += 1;
    console.log(`   ðŸ“Ž Acumulando msg ${existing.messages.length}${mediaType ? ` (${mediaType})` : ''}. Reset do timer para ${config.responseDelayMs}ms`);
    existing.timeout = setTimeout(() => {
      void processAdminAccumulatedMessages({ socket, key, generation: existing.generation });
    }, config.responseDelayMs);
    return;
  }

  // Verificar se conversa jÃ¡ existe no banco
  const existingConversation = conversationId ? await storage.getAdminConversation(conversationId) : null;
  const isNewConversation = !existingConversation;

  const pending: PendingAdminResponse = {
    timeout: null,
    messages: [{ text: messageText, mediaType, mediaUrl, mediaMimeType }],
    remoteJid,
    contactNumber,
    adminId,
    generation: 1,
    startTime: Date.now(),
    conversationId,
    retryCount: 0,
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
  const adminQueueId = getAdminQueueId(pending.adminId);

  const config = await getAdminAgentRuntimeConfig();
  // V23f: Combinar textos e extrair Ãºltima mÃ­dia do lote acumulado
  let combinedText = pending.messages.map(m => m.text).join("\n\n");
  const imageBatch = pending.messages.filter(
    (m) => m.mediaType === "image" && Boolean(m.mediaUrl),
  );
  const lastMedia = [...pending.messages].reverse().find(m => m.mediaType && m.mediaUrl);
  const accMediaType = lastMedia?.mediaType;
  const accMediaUrl = lastMedia?.mediaUrl;
  const accMediaMimeType = lastMedia?.mediaMimeType || undefined;
  let responseDeliveredToClient = false;

  const waitSeconds = ((Date.now() - pending.startTime) / 1000).toFixed(1);
  console.log(`\nðŸ¤– [ADMIN AGENT] =========== PROCESSANDO RESPOSTA ==========`);
  console.log(`   â±ï¸ Aguardou ${waitSeconds}s | ${pending.messages.length} msg(s) acumulada(s)${accMediaType ? ` | mÃ­dia: ${accMediaType}` : ''}`);
  console.log(`   ðŸ“± Cliente: ${pending.contactNumber}`);
  console.log(`   ðŸ“‹ Config carregada:`);
  console.log(`      - Tempo resposta: ${config.responseDelayMs}ms`);
  console.log(`      - Typing delay: ${config.typingDelayMinMs}-${config.typingDelayMaxMs}ms`);
  console.log(`      - Split chars: ${config.messageSplitChars}`);
  console.log(`      - Intervalo blocos: ${config.messageIntervalMinMs}-${config.messageIntervalMaxMs}ms`);

  if (imageBatch.length > 1) {
    try {
      const { analyzeImageForAdmin } = await import("./mistralClient");
      const analyses = await Promise.allSettled(
        imageBatch.map(async (msg, index) => {
          const analysis = await analyzeImageForAdmin(msg.mediaUrl!);
          const summary = String(analysis?.summary || "").trim();
          const description = String(analysis?.description || "").trim();
          const parts = [summary, description].filter(Boolean);
          if (!parts.length) return null;
          return `Imagem ${index + 1}: ${parts.join(" - ")}`;
        }),
      );

      const successfulAnalyses = analyses
        .filter((result): result is PromiseFulfilledResult<string | null> => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((value): value is string => Boolean(value));

      if (successfulAnalyses.length > 0) {
        combinedText += `\n\n[SISTEMA: O cliente enviou ${imageBatch.length} imagens em lote. Analise TODAS como um conjunto antes de responder. Resumos visuais: ${successfulAnalyses.join(" | ")}]`;
        console.log(`ðŸ–¼ï¸ [ADMIN AGENT] Lote de ${imageBatch.length} imagens enriquecido com ${successfulAnalyses.length} anÃ¡lise(s).`);
      }
    } catch (batchErr) {
      console.warn("[ADMIN AGENT] Falha ao enriquecer lote de imagens do admin:", batchErr);
    }
  }

  try {
    const adminConnection = await storage.getAdminWhatsappConnection(pending.adminId);
    const isConnectionAiEnabled = adminConnection?.aiEnabled !== false;
    const ownership = await enforcePriorityUserOwnershipForAdminLiveAutomation({
      conversationId: pending.conversationId,
      contactNumber: pending.contactNumber,
      source: "admin_pending_response",
    });
    if (ownership) {
      pendingAdminResponses.delete(key);
      return;
    }

    // ?? RE-VERIFICAR STATUS DO AGENTE (Double Check)
    // Isso previne que mensagens acumuladas sejam enviadas se o agente foi desativado durante o delay
    // ou se a verifica??o inicial falhou.
    if (pending.conversationId) {
        const isEnabled = await storage.isAdminAgentEnabledForConversation(pending.conversationId);
        const conversation = await storage.getAdminConversation(pending.conversationId);
        if (!shouldProcessInboundAdminAutomation({
            isAgentEnabled: isEnabled,
            isConnectionAiEnabled,
            followupActive: conversation?.followupActive,
        })) {
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
                if (conv && !shouldProcessInboundAdminAutomation({
                    isAgentEnabled: conv.isAgentEnabled === true,
                    isConnectionAiEnabled,
                    followupActive: conv.followupActive,
                })) {
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

    // V23j: Callback para enviar mensagens intermediÃ¡rias durante operaÃ§Ãµes longas
    const sendIntermediateMessage = async (text: string) => {
      try {
        const sentMessage = await sendWithQueue(adminQueueId, 'mensagem intermediÃ¡ria', async () => {
          return await socket.sendMessage(pending.remoteJid, { text });
        });
        trackAdminAgentMessageId((sentMessage as any)?.key?.id);
        trackAdminOutgoingMessage({
          messageId: (sentMessage as any)?.key?.id,
          adminId: pending.adminId,
          conversationId: pending.conversationId,
          contactNumber: pending.contactNumber,
          text,
          isFromAgent: true,
          alreadyPersisted: true,
          source: "admin_agent_intermediate",
        });
        // Salvar no banco tambÃ©m
        if (pending.conversationId) {
          await storage.createAdminMessage({
            conversationId: pending.conversationId,
            messageId: `agent_intermediate_${Date.now()}`,
            fromMe: true,
            text,
            timestamp: new Date(),
            status: "sent",
            isFromAgent: true,
          });
        }
      } catch (err) {
        console.warn('[ADMIN AGENT] Falha ao enviar mensagem intermediÃ¡ria:', err);
      }
    };

    // V23f: Passar mÃ­dia acumulada (se houver) para processAdminMessage
    // skipTriggerCheck = false para aplicar validaÃ§Ã£o de frases gatilho no WhatsApp real
    // V23j: Passar sendIntermediateMessage para operaÃ§Ãµes longas
    let response: any = null;
    const cannedLeadReply = await consumeLeadReplyForConversation({
      conversationId: pending.conversationId,
      contactNumber: pending.contactNumber,
    });

    if (cannedLeadReply?.replyMessage) {
      console.log(`🎯 [ADMIN AGENT] Usando mensagem pronta de campanha para ${pending.contactNumber}`);
      response = {
        text: cannedLeadReply.replyMessage,
        splitMessages: [cannedLeadReply.replyMessage],
      };
    } else {
      response = await processAdminMessage(
        pending.contactNumber,
        combinedText,
        accMediaType,
        accMediaUrl,
        false,
        undefined,
        sendIntermediateMessage,
        accMediaMimeType,
      );
    }

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
    
    while (checkPresence && checkPresence.lastKnownPresence === 'composing' && retryCount < maxRetries) {
        console.log(`? [ADMIN AGENT] Usu?rio digitando (check final). Aguardando confirma??o... (${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, 5000)); // Espera 5s
        checkPresence = pendingAdminResponses.get(key);
        retryCount++;
    }

    if (checkPresence && checkPresence.lastKnownPresence === 'composing') {
        // Se ainda estiver digitando ap?s retries, verificar se o status ? antigo (stale)
        const lastUpdate = checkPresence.lastPresenceUpdate || 0;
        const timeSinceUpdate = Date.now() - lastUpdate;
        const STALE_THRESHOLD = 45000; // 45 segundos

        if (timeSinceUpdate > STALE_THRESHOLD) {
             console.log(`?? [ADMIN AGENT] Status 'composing' parece travado (${Math.floor(timeSinceUpdate/1000)}s). Ignorando e enviando.`);
             // Prossegue para envio...
        } else {
             console.log(`? [ADMIN AGENT] Usu?rio segue digitando (check final). Reagendando envio.`);
             rescheduleAdminPendingResponse({
               socket,
               key,
               delayMs: 6000,
               reason: "cliente ainda digitando no check final",
             });
             return;
        }
    }

    // V17: Enviar mensagem completa sem dividir em partes (bolhas)
    // O admin chat mostra a mensagem inteira - WhatsApp deve receber igual
    const fullText = (response.text || "").trim();

    if (fullText) {
      const current = pendingAdminResponses.get(key);
      if (!current || current.generation !== generation) {
        console.log(`?? [ADMIN AGENT] Cancelando envio (mensagens novas chegaram)`);
        return;
      }

      // ?? CHECK DE PRESEN?A FINAL
      if (current.lastKnownPresence === 'composing') {
          const lastUpdate = current.lastPresenceUpdate || 0;
          const timeSinceUpdate = Date.now() - lastUpdate;
          
          if (timeSinceUpdate > 45000) {
              console.log(`?? [ADMIN AGENT] Status 'composing' travado durante envio. Ignorando.`);
          } else {
              console.log(`? [ADMIN AGENT] Usu?rio voltou a digitar durante envio. Reagendando.`);
              rescheduleAdminPendingResponse({
                socket,
                key,
                delayMs: 6000,
                reason: "cliente voltou a digitar durante envio",
              });
              return;
          }
      }

      // V22: Enviar em bolhas separadas se a IA usou [BOLHA], senÃ£o mensagem Ãºnica
      const messageParts = response.splitMessages && response.splitMessages.length > 1
        ? response.splitMessages
        : [fullText];
      
      console.log(`ðŸ’¬ [ADMIN AGENT] Enviando ${messageParts.length} bolha(s) para ${pending.contactNumber} (${fullText.length} chars total)`);
      
      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i].trim();
        if (!part) continue;
        
        // Verificar se cliente voltou a digitar entre bolhas
        if (i > 0) {
          const current2 = pendingAdminResponses.get(key);
          if (!current2 || current2.generation !== generation) {
            console.log(`âš ï¸ [ADMIN AGENT] Cancelando bolha ${i+1}/${messageParts.length} (novas mensagens)`);
            break;
          }
          // Pequeno delay entre bolhas para parecer natural
          await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
        }
        
        const sentMessage = await sendWithQueue(adminQueueId, `admin bolha ${i+1}/${messageParts.length}`, async () => {
          return await socket.sendMessage(pending.remoteJid, { text: part });
        });
        trackAdminAgentMessageId((sentMessage as any)?.key?.id);
        trackAdminOutgoingMessage({
          messageId: (sentMessage as any)?.key?.id,
          adminId: pending.adminId,
          conversationId: pending.conversationId,
          contactNumber: pending.contactNumber,
          text: part,
          isFromAgent: true,
          alreadyPersisted: true,
          source: "admin_agent_text",
        });
        responseDeliveredToClient = true;
      }
    }

    console.log(`? [ADMIN AGENT] Resposta enviada para ${pending.contactNumber}`);

    // Salvar resposta do agente no banco de dados
    const cleanDbText = (response.text || '').trim();
    if (pending.conversationId && cleanDbText) {
      try {
        await storage.createAdminMessage({
          conversationId: pending.conversationId,
          messageId: `agent_${Date.now()}`,
          fromMe: true,
          text: cleanDbText,
          timestamp: new Date(),
          status: "sent",
          isFromAgent: true,
        });
        
        // Atualizar ?ltima mensagem da conversa
        await storage.updateAdminConversation(pending.conversationId, {
          lastMessageText: cleanDbText.substring(0, 255),
          lastMessageTime: new Date(),
        });

        await followUpService.scheduleInitialFollowUp(pending.conversationId, { forceRestart: true });
        
        console.log(`?? [ADMIN AGENT] Resposta salva na conversa ${pending.conversationId}`);
      } catch (dbError) {
        console.error(`? [ADMIN AGENT] Erro ao salvar resposta no banco:`, dbError);
      }
    }

    // Notifica??o de pagamento
    if (response.actions?.notifyOwner) {
      const ownerNumber = await getOwnerNotificationNumber();
      const ownerJid = `${ownerNumber}@s.whatsapp.net`;
      const notificationText = `*NOTIFICACAO DE PAGAMENTO*\n\nCliente: ${pending.contactNumber}\n${new Date().toLocaleString("pt-BR")}\n\nVerificar comprovante e liberar conta`;
      // ??? ANTI-BLOQUEIO
      await sendWithQueue(adminQueueId, 'notifica??o pagamento', async () => {
        await socket.sendMessage(ownerJid, { text: notificationText });
      });
      console.log(`?? [ADMIN AGENT] Notifica??o enviada para ${ownerNumber}`);

      // V23f: Encaminhar comprovante (imagem) ao dono se houver
      if (accMediaType === "image" && accMediaUrl) {
        try {
          const base64Data = accMediaUrl.split(",")[1];
          if (base64Data) {
            const buffer = Buffer.from(base64Data, "base64");
            await sendWithQueue(adminQueueId, 'comprovante imagem', async () => {
              await socket.sendMessage(ownerJid, {
                image: buffer,
                caption: `?? Comprovante do cliente ${pending.contactNumber}`,
              });
            });
            console.log(`?? [ADMIN AGENT] Comprovante encaminhado para ${ownerNumber}`);
          }
        } catch (err) {
          console.error("[ADMIN AGENT] Erro ao encaminhar comprovante:", err);
        }
      }
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
                  {
                    const sentMessage = await sendWithQueue(adminQueueId, 'm?dia imagem', async () => {
                      return await socket.sendMessage(pending.remoteJid, {
                        image: mediaBuffer,
                        caption: media.caption || undefined,
                      });
                    });
                    trackAdminOutgoingMessage({
                      messageId: (sentMessage as any)?.key?.id,
                      adminId: pending.adminId,
                      conversationId: pending.conversationId,
                      contactNumber: pending.contactNumber,
                      mediaType: "image",
                      mediaMimeType: media.mimeType || undefined,
                      mediaCaption: media.caption || undefined,
                      text: media.caption || "*Imagem*",
                      isFromAgent: true,
                      alreadyPersisted: false,
                      source: "admin_agent_media_image",
                    });
                  }
                  responseDeliveredToClient = true;
                  break;
                case 'audio':
                  // ??? ANTI-BLOQUEIO
                  {
                    const sentMessage = await sendWithQueue(adminQueueId, 'm?dia ?udio', async () => {
                      return await socket.sendMessage(pending.remoteJid, {
                        audio: mediaBuffer,
                        mimetype: media.mimeType || 'audio/ogg; codecs=opus',
                        ptt: true, // Voice message
                      });
                    });
                    trackAdminOutgoingMessage({
                      messageId: (sentMessage as any)?.key?.id,
                      adminId: pending.adminId,
                      conversationId: pending.conversationId,
                      contactNumber: pending.contactNumber,
                      mediaType: "audio",
                      mediaMimeType: media.mimeType || 'audio/ogg; codecs=opus',
                      text: "*Audio*",
                      isFromAgent: true,
                      alreadyPersisted: false,
                      source: "admin_agent_media_audio",
                    });
                  }
                  responseDeliveredToClient = true;
                  break;
                case 'video':
                  // ??? ANTI-BLOQUEIO
                  {
                    const sentMessage = await sendWithQueue(adminQueueId, 'm?dia v?deo', async () => {
                      return await socket.sendMessage(pending.remoteJid, {
                        video: mediaBuffer,
                        caption: media.caption || undefined,
                      });
                    });
                    trackAdminOutgoingMessage({
                      messageId: (sentMessage as any)?.key?.id,
                      adminId: pending.adminId,
                      conversationId: pending.conversationId,
                      contactNumber: pending.contactNumber,
                      mediaType: "video",
                      mediaMimeType: media.mimeType || undefined,
                      mediaCaption: media.caption || undefined,
                      text: media.caption || "*Video*",
                      isFromAgent: true,
                      alreadyPersisted: false,
                      source: "admin_agent_media_video",
                    });
                  }
                  responseDeliveredToClient = true;
                  break;
                case 'document':
                  // ??? ANTI-BLOQUEIO
                  {
                    const sentMessage = await sendWithQueue(adminQueueId, 'm?dia documento', async () => {
                      return await socket.sendMessage(pending.remoteJid, {
                        document: mediaBuffer,
                        fileName: media.fileName || 'document',
                        mimetype: media.mimeType || 'application/octet-stream',
                      });
                    });
                    trackAdminOutgoingMessage({
                      messageId: (sentMessage as any)?.key?.id,
                      adminId: pending.adminId,
                      conversationId: pending.conversationId,
                      contactNumber: pending.contactNumber,
                      mediaType: "document",
                      mediaMimeType: media.mimeType || 'application/octet-stream',
                      text: media.fileName || "*Documento*",
                      isFromAgent: true,
                      alreadyPersisted: false,
                      source: "admin_agent_media_document",
                    });
                  }
                  responseDeliveredToClient = true;
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
          await sendWithQueue(adminQueueId, 'desconex?o confirma??o', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "Pronto! ?? Seu WhatsApp foi desconectado. Quando quiser reconectar, ? s? me avisar!" });
          });
          console.log(`? [ADMIN AGENT] WhatsApp desconectado para ${clientSession.userId}`);
        } else {
          // ??? ANTI-BLOQUEIO
          await sendWithQueue(adminQueueId, 'desconex?o n?o encontrada', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "N?o encontrei uma conex?o ativa para desconectar. Voc? j? est? desconectado!" });
          });
        }
      } catch (disconnectError) {
        console.error("? [ADMIN AGENT] Erro ao desconectar WhatsApp:", disconnectError);
        // ??? ANTI-BLOQUEIO
        await sendWithQueue(adminQueueId, 'desconex?o erro', async () => {
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
            sendText: (text) => sendWithQueue(adminQueueId, 'pareamento c?digo', async () => {
              await socket.sendMessage(pending.remoteJid, { text });
            }).then(() => undefined),
          });
        } else {
          // ??? ANTI-BLOQUEIO
          await sendWithQueue(adminQueueId, 'pareamento email', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "Antes de conectar, preciso criar sua conta. Me passa seu email?" });
          });
        }
      } catch (codeError) {
        console.error("? [ADMIN AGENT] Erro ao gerar c?digo de pareamento:", codeError);
        const errorMsg = (codeError as Error).message || String(codeError);
        console.error("? [ADMIN AGENT] Detalhes do erro:", errorMsg);
        // ??? ANTI-BLOQUEIO
        await sendWithQueue(adminQueueId, 'pareamento erro', async () => {
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
            sendText: (text) => sendWithQueue(adminQueueId, 'QR c?digo texto', async () => {
              await socket.sendMessage(pending.remoteJid, { text });
            }).then(() => undefined),
            sendImage: (image, caption) => sendWithQueue(adminQueueId, 'QR c?digo imagem', async () => {
              await socket.sendMessage(pending.remoteJid, { image, caption });
            }).then(() => undefined),
          });
        } else {
          // ??? ANTI-BLOQUEIO
          await sendWithQueue(adminQueueId, 'QR email pedido', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "Antes de conectar, preciso criar sua conta. Me passa seu email?" });
          });
        }
      } catch (qrError) {
        console.error("? [ADMIN AGENT] Erro ao enviar QR Code:", qrError);
        // ??? ANTI-BLOQUEIO
        await sendWithQueue(adminQueueId, 'QR erro', async () => {
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
    const current = pendingAdminResponses.get(key);
    if (!current || current.generation !== generation) {
      return;
    }

    if (responseDeliveredToClient) {
      pendingAdminResponses.delete(key);
      return;
    }

    current.retryCount = (current.retryCount || 0) + 1;
    const latestSocket = adminSessions.get(current.adminId)?.socket || socket;
    const shouldRetry = isTransientAdminProcessingError(error) || !adminSessions.get(current.adminId)?.socket;

    if (shouldRetry && current.retryCount <= 12) {
      const delayMs = adminSessions.get(current.adminId)?.socket ? 15000 : 30000;
      const retried = rescheduleAdminPendingResponse({
        socket: latestSocket,
        key,
        delayMs,
        reason: `erro transitÃ³rio (${current.retryCount}/12)`,
      });
      if (retried) {
        return;
      }
    }

    pendingAdminResponses.delete(key);
  }
}

// ?? HUMANIZA??O: Quebra mensagem longa em partes menores
// Best practices: WhatsApp, Intercom, Drift quebram a cada 2-3 par?grafos ou 300-500 chars
// Fonte: https://www.drift.com/blog/conversational-marketing-best-practices/
// CORRE??O 2025: N?o corta palavras nem frases no meio - divide corretamente respeitando limites naturais
// EXPORTADA para uso no simulador (/api/agent/test) - garante consist?ncia entre simulador e WhatsApp real
export function splitMessageHumanLike(message: string, maxChars: number = 400): string[] {
  const explicitBubbleParts = parseExplicitBubbleMessages(message);
  if (explicitBubbleParts.hasExplicitBubbles) {
    console.log(`💬 [SPLIT] Marcador [BOLHA] respeitado em ${explicitBubbleParts.parts.length} parte(s)`);
    const sanitizedExplicitParts = sanitizeFinalMessageParts(explicitBubbleParts.parts);
    return sanitizedExplicitParts.length > 0
      ? sanitizedExplicitParts
      : [String(message || "").trim()];
  }
  const normalizedMessage = explicitBubbleParts.parts.length === 1
    ? explicitBubbleParts.parts[0]
    : String(message || "").trim();

  // Se maxChars = 0, retorna mensagem completa sem divis?o
  if (maxChars === 0) {
    return sanitizeFinalMessageParts([normalizedMessage]);
  }
  
  // Mensagem pequena - retorna diretamente
  if (normalizedMessage.length <= maxChars) {
    return sanitizeFinalMessageParts([normalizedMessage]);
  }
  
  const MAX_CHARS = maxChars;
  const finalParts: string[] = [];
  
  // FASE 1: Dividir por par?grafos duplos (quebras de se??o)
  const sections = normalizedMessage.split('\n\n').filter(s => s.trim());
  
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
  
  const sanitizedParts = sanitizeFinalMessageParts(
    optimizedParts.length > 0 ? optimizedParts : [normalizedMessage],
  );
  return sanitizedParts.length > 0 ? sanitizedParts : [normalizedMessage];
}

function sanitizeFinalMessageParts(parts: string[]): string[] {
  const sanitizedParts = parts
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (sanitizedParts.length === 0) {
    return [];
  }

  const lastIndex = sanitizedParts.length - 1;
  const sanitizedTail = sanitizeAgentResponseTail(sanitizedParts[lastIndex]);
  if (sanitizedTail) {
    sanitizedParts[lastIndex] = sanitizedTail;
  } else {
    sanitizedParts.pop();
  }

  return sanitizedParts;
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
  // PROTE??O DE URLs: Substituir URLs inteiras por placeholder tempor?rio
  // para evitar que a regex de frases corte no meio de URLs
  // V20 FIX: Placeholder usa __ em vez de ? para nÃ£o conflitar com sentencePattern [.!?]
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const protectedUrls: string[] = [];
  
  // Substituir URLs por placeholders numerados (sem ? . ! para nao conflitar com regex)
  let protectedText = text.replace(urlRegex, (match) => {
    const index = protectedUrls.length;
    protectedUrls.push(match);
    return `__URLPROT_${index}__`;
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
      restored = restored.replace(`__URLPROT_${index}__`, url);
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
const ADMIN_SESSIONS_BASE = process.env.ADMIN_SESSIONS_DIR || SESSIONS_BASE;

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

if (process.env.ADMIN_SESSIONS_DIR) {
  console.log(`[WHATSAPP] Using ADMIN_SESSIONS_DIR=${ADMIN_SESSIONS_BASE}`);
  void ensureDirExists(ADMIN_SESSIONS_BASE);
}

function cleanContactNumber(input?: string | null): string {
  return (input?.split(":")[0] || "").replace(/\D/g, "");
}

const AGENTEZAP_PROTECTED_ADMIN_NUMBERS = ["5517991648288"];

function buildBrazilPhoneVariants(rawValue?: string | null): Set<string> {
  const digits = normalizeDigitsOnly(String(rawValue || ""));
  const variants = new Set<string>();

  if (!digits) return variants;

  const addVariant = (value?: string | null) => {
    const normalized = normalizeDigitsOnly(String(value || ""));
    if (normalized) variants.add(normalized);
  };

  addVariant(digits);

  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  addVariant(local);

  if (digits.startsWith("55")) {
    if (digits.length === 13 && digits[4] === "9") {
      addVariant(digits.slice(0, 4) + digits.slice(5));
    } else if (digits.length === 12) {
      addVariant(digits.slice(0, 4) + "9" + digits.slice(4));
    }
  } else if (digits.length === 11 && digits[2] === "9") {
    addVariant(digits.slice(0, 2) + digits.slice(3));
  } else if (digits.length === 10) {
    addVariant(digits.slice(0, 2) + "9" + digits.slice(2));
  }

  for (const variant of Array.from(variants)) {
    if (!variant.startsWith("55") && (variant.length === 10 || variant.length === 11)) {
      addVariant(`55${variant}`);
    }
  }

  return variants;
}

const AGENTEZAP_PROTECTED_ADMIN_VARIANTS = new Set<string>(
  AGENTEZAP_PROTECTED_ADMIN_NUMBERS.flatMap((value) => Array.from(buildBrazilPhoneVariants(value)))
);

function isProtectedAgenteZapAdminNumber(value?: string | null): boolean {
  const candidates = buildBrazilPhoneVariants(value);
  for (const candidate of candidates) {
    if (AGENTEZAP_PROTECTED_ADMIN_VARIANTS.has(candidate)) {
      return true;
    }
  }
  return false;
}

function getWAMessageTimestamp(waMessage: WAMessage): Date {
  const raw = (waMessage as any)?.messageTimestamp;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000);
  return new Date();
}

function coerceBaileysTimestampNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const candidate = value as any;
  if (typeof candidate.toNumber === "function") {
    const parsed = Number(candidate.toNumber());
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (candidate.low != null) {
    const parsed = Number(candidate.low);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function coerceBaileysTimestampMs(value: unknown): number | null {
  const parsed = coerceBaileysTimestampNumber(value);
  if (!parsed || parsed <= 0) return null;
  return parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
}

function getChatUpdateTimestampMs(update: any): number | null {
  const candidates = [
    update?.conversationTimestamp,
    update?.lastMessageRecvTimestamp,
    update?.lastMessageTimestamp,
    update?.timestamp,
  ];

  for (const candidate of candidates) {
    const parsed = coerceBaileysTimestampMs(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function getChatUpdateUnreadCount(update: any): number {
  const parsed = Number(update?.unreadCount ?? update?.unread ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeChatUpdateMessage(
  chatJid: string,
  rawMessage: any,
  fallbackTimestamp?: unknown,
): WAMessage | null {
  const candidate =
    rawMessage?.key
      ? rawMessage
      : rawMessage?.message?.key
        ? rawMessage.message
        : rawMessage?.webMessageInfo?.key
          ? rawMessage.webMessageInfo
          : rawMessage?.messageInfo?.key
            ? rawMessage.messageInfo
            : null;

  if (!candidate?.key?.id) {
    return null;
  }

  return {
    ...candidate,
    key: {
      ...candidate.key,
      remoteJid: candidate.key.remoteJid || chatJid,
    },
    messageTimestamp: candidate.messageTimestamp ?? fallbackTimestamp,
  } as WAMessage;
}

function rememberChatUpdateReplay(replayKey: string): boolean {
  const now = Date.now();
  const existing = chatUpdateReplayedMessageIds.get(replayKey);
  if (existing && now - existing < CHAT_UPDATE_REPLAY_DEDUPE_TTL_MS) {
    return false;
  }

  chatUpdateReplayedMessageIds.set(replayKey, now);
  if (chatUpdateReplayedMessageIds.size > 1000) {
    for (const [key, timestamp] of chatUpdateReplayedMessageIds.entries()) {
      if (now - timestamp > CHAT_UPDATE_REPLAY_DEDUPE_TTL_MS) {
        chatUpdateReplayedMessageIds.delete(key);
      }
    }
  }

  return true;
}

function scheduleChatUpdateMessageReplay(params: {
  socket: WASocket;
  connectionId: string;
  message: WAMessage;
  remoteJid: string;
  ageMs: number;
}) {
  const messageId = params.message.key.id;
  if (!messageId) {
    return;
  }

  setTimeout(() => {
    (async () => {
      const existing = await storage.getMessageByMessageId(messageId);
      if (existing) {
        console.log(`[CHAT-UPDATE] Mensagem ${messageId} ja persistida; replay dispensado`);
        return;
      }

      console.log(
        `[CHAT-UPDATE] Reemitindo mensagem direta ${messageId} de ${params.remoteJid} ` +
          `ageMs=${params.ageMs || "unknown"}`,
      );
      params.socket.ev.emit("messages.upsert", {
        type: "notify",
        messages: [params.message],
      } as any);
    })().catch((error) => {
      console.warn(`[CHAT-UPDATE] Falha ao reemitir mensagem ${messageId}:`, error);
    });
  }, CHAT_UPDATE_REPLAY_DELAY_MS);
}

function scheduleDirectConversationHistoryRecovery(params: {
  connectionId: string;
  conversationId: string;
  contactNumber: string;
  reason: string;
}) {
  const lockKey = `${params.connectionId}:${params.conversationId}`;
  const now = Date.now();
  const previous = directConversationHistoryRecoveryScheduledAt.get(lockKey);
  if (previous && now - previous < DIRECT_CONVERSATION_HISTORY_RECOVERY_COOLDOWN_MS) {
    return;
  }

  directConversationHistoryRecoveryScheduledAt.set(lockKey, now);
  for (const [key, timestamp] of directConversationHistoryRecoveryScheduledAt.entries()) {
    if (now - timestamp > DIRECT_CONVERSATION_HISTORY_RECOVERY_COOLDOWN_MS * 5) {
      directConversationHistoryRecoveryScheduledAt.delete(key);
    }
  }

  console.log(
    `[HISTORY RECOVERY] Agendada sincronizacao curta para ${params.contactNumber} ` +
      `conversation=${params.conversationId} reason=${params.reason}`,
  );

  setTimeout(() => {
    syncConversationHistoryOnDemand({
      connectionId: params.connectionId,
      conversationId: params.conversationId,
      count: DIRECT_CONVERSATION_HISTORY_RECOVERY_COUNT,
    })
      .then((result) => {
        console.log(
          `[HISTORY RECOVERY] Resultado ${params.contactNumber} conversation=${params.conversationId}: ` +
            `${result.status} imported=${result.importedCount}`,
        );
      })
      .catch((error) => {
        console.warn(
          `[HISTORY RECOVERY] Falha ao sincronizar ${params.contactNumber} ` +
            `conversation=${params.conversationId}:`,
          error,
        );
      });
  }, DIRECT_CONVERSATION_HISTORY_RECOVERY_DELAY_MS);
}

function withIncomingTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeout: NodeJS.Timeout | null = null;
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function refreshIncomingContactAvatarInBackground(params: {
  session: WhatsAppSession;
  normalizedJid: string;
  contactNumber: string;
  conversationId: string;
  currentAvatar?: string | null;
  skip?: boolean;
}) {
  if (params.skip || params.currentAvatar || !params.session.socket || !params.normalizedJid) {
    return;
  }

  setTimeout(() => {
    (async () => {
      const profilePicUrl = await withIncomingTimeout(
        params.session.socket!.profilePictureUrl(params.normalizedJid, "image"),
        INCOMING_PROFILE_PICTURE_TIMEOUT_MS,
      );
      if (!profilePicUrl) {
        return;
      }
      await storage.updateConversation(params.conversationId, {
        contactAvatar: profilePicUrl,
      });
      console.log(`[AVATAR] Foto de perfil atualizada em segundo plano para ${params.contactNumber}`);
    })().catch((error) => {
      console.log(`[AVATAR] Sem foto de perfil em segundo plano para ${params.contactNumber}:`, error?.message || error);
    });
  }, 0);
}

function sendNewContactPresenceInBackground(params: {
  session: WhatsAppSession;
  normalizedJid: string;
  contactNumber: string;
}) {
  if (!params.session.socket || !params.normalizedJid) {
    return;
  }

  setTimeout(() => {
    (async () => {
      await withIncomingTimeout(
        params.session.socket!.sendPresenceUpdate("available", params.normalizedJid),
        INCOMING_PRESENCE_TIMEOUT_MS,
      );
      await withIncomingTimeout(
        params.session.socket!.presenceSubscribe(params.normalizedJid),
        INCOMING_PRESENCE_TIMEOUT_MS,
      );
      console.log(`[NEW-CONTACT-FIX] Presence + Subscribe enviados em segundo plano para ${params.contactNumber}`);
    })().catch((error) => {
      console.log(`[NEW-CONTACT-FIX] Presence em segundo plano falhou para ${params.contactNumber}:`, error?.message || error);
    });
  }, 0);
}

async function ensureUnreadDirectChatPlaceholderFromUpdate(params: {
  session: WhatsAppSession;
  chatJid: string;
  chatUpdate: any;
  parsed: Awaited<ReturnType<typeof parseRemoteJid>>;
  eventTs: Date;
  unreadCount: number;
}) {
  const { session, chatJid, chatUpdate, parsed, eventTs } = params;
  const contactNumber = parsed.contactNumber;
  if (!contactNumber) {
    return null;
  }

  const continuityConnection = await ensureManagedPhoneConnectionContinuity({
    userId: session.userId,
    connectionId: session.connectionId,
    runtimePhoneNumber: session.phoneNumber,
    runtimeIsConnected: true,
  });
  if (!continuityConnection) {
    console.warn(
      `[CHAT-UPDATE] Ignorando unread sem payload da conexao ${session.connectionId.substring(0, 8)}... ` +
        `porque o numero ${session.phoneNumber || "?"} pertence a outra conta ativa`,
    );
    requestSessionShutdown(session, "phone_conflict_other_user");
    return null;
  }

  const effectiveConnectionId = continuityConnection.id;
  const placeholderText = UNRESOLVED_INCOMING_STUB_TEXT;
  const nextUnreadCount = Math.max(1, Number(params.unreadCount || 0));
  const contactName =
    String(chatUpdate?.name || chatUpdate?.pushName || chatUpdate?.verifiedName || "").trim() ||
    contactNumber;

  const conversationResult = await getOrCreateConversationSafe(
    effectiveConnectionId,
    contactNumber,
    async () => {
      return storage.createConversation({
        connectionId: effectiveConnectionId,
        contactNumber,
        remoteJid: parsed.normalizedJid || jidNormalizedUser(chatJid),
        jidSuffix: parsed.jidSuffix || DEFAULT_JID_SUFFIX,
        contactName,
        contactAvatar: null,
        lastMessageText: placeholderText,
        lastMessageTime: eventTs,
        lastMessageFromMe: false,
        unreadCount: nextUnreadCount,
        needsHumanAttention: true,
        attentionPriority: "high",
        attentionReason: "Mensagem recebida ainda carregando. Confira a conversa antes de responder.",
        attentionQualifiedAt: new Date(),
      });
    },
    async () => {
      return storage.getActiveConversationByContactNumber(effectiveConnectionId, contactNumber);
    },
  );

  const conversation = conversationResult.conversation;
  const existingMessages = await storage.getMessagesByConversationId(conversation.id);
  const placeholderMessageId = `chat_update_unread_${effectiveConnectionId}_${contactNumber}_${Math.floor(eventTs.getTime() / 1000)}`;
  let savedMessage: any = existingMessages.find((message: any) =>
    String(message?.messageId || message?.message_id || "") === placeholderMessageId
  );

  if (!savedMessage && existingMessages.length === 0) {
    try {
      savedMessage = await storage.createMessage({
        conversationId: conversation.id,
        messageId: placeholderMessageId,
        fromMe: false,
        text: placeholderText,
        timestamp: eventTs,
        isFromAgent: false,
      });
    } catch (error: any) {
      const isDuplicate =
        error?.code === "23505" ||
        String(error?.message || "").toLowerCase().includes("unique");
      if (!isDuplicate) {
        throw error;
      }
      savedMessage = await storage.getMessageByConversationAndMessageId(
        conversation.id,
        placeholderMessageId,
      );
    }
  }

  await storage.updateConversation(conversation.id, {
    lastMessageText: placeholderText,
    lastMessageTime: eventTs,
    lastMessageFromMe: false,
    unreadCount: Math.max(nextUnreadCount, Number(conversation.unreadCount || 0)),
    needsHumanAttention: true,
    attentionPriority: "high",
    attentionReason: "Mensagem recebida ainda carregando. Confira a conversa antes de responder.",
    attentionQualifiedAt: new Date(),
  });

  broadcastToUser(session.userId, {
    type: "new_message",
    conversationId: conversation.id,
    message: placeholderText,
    conversationUpdate: {
      id: conversation.id,
      contactNumber,
      contactName: conversation.contactName || contactName,
      contactAvatar: conversation.contactAvatar || null,
      lastMessageText: placeholderText,
      lastMessageTime: eventTs.toISOString(),
      lastMessageFromMe: false,
      unreadCount: Math.max(nextUnreadCount, Number(conversation.unreadCount || 0)),
      isArchived: conversation.isArchived || false,
      isNew: conversationResult.wasCreated,
    },
    messageData: savedMessage
      ? {
          id: savedMessage.id,
          conversationId: conversation.id,
          messageId: savedMessage.messageId || placeholderMessageId,
          fromMe: false,
          text: placeholderText,
          timestamp: eventTs.toISOString(),
          isFromAgent: false,
          mediaType: null,
          mediaUrl: null,
          mediaMimeType: null,
          mediaDuration: null,
          mediaCaption: null,
        }
      : undefined,
  });

  await schedulePendingFirstMessageAIResponse({
    source: "chat_update_unread",
    userId: session.userId,
    connectionId: effectiveConnectionId,
    conversation,
    contactNumber,
    jidSuffix: parsed.jidSuffix || DEFAULT_JID_SUFFIX,
    unreadCount: nextUnreadCount,
    conversationWasCreated: conversationResult.wasCreated || existingMessages.length === 0,
    existingMessages: savedMessage ? [...existingMessages, savedMessage] : existingMessages,
    displayMessageId: savedMessage?.id,
    displayTimestamp: eventTs,
    reason: "chat_update_unread_pending_first_message",
  });

  console.log(
    `[CHAT-UPDATE] Conversa criada/atualizada por sinal unread sem payload: ` +
      `${contactNumber} conversation=${conversation.id} unread=${nextUnreadCount}`,
  );
  return conversation;
}

// New leads (notably Meta ads) can wrap the real payload in envelopes (ephemeral/viewOnce).
// We unwrap only generic envelopes so existing specific handlers still work.
function unwrapIncomingMessageContent(message: any): any {
  return normalizeMessageContent(message as any);
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
  if (normalized.includes("mensagem recebida ainda carregando")) return true;
  if (normalized === "[mensagem de protocolo]") return true;
  return false;
}

function extractIncomingContextInfo(messageContent: any): any | null {
  const candidates = [
    messageContent?.messageContextInfo,
    messageContent?.extendedTextMessage?.contextInfo,
    messageContent?.imageMessage?.contextInfo,
    messageContent?.videoMessage?.contextInfo,
    messageContent?.audioMessage?.contextInfo,
    messageContent?.documentMessage?.contextInfo,
    messageContent?.documentWithCaptionMessage?.message?.documentMessage?.contextInfo,
    messageContent?.buttonsResponseMessage?.contextInfo,
    messageContent?.listResponseMessage?.contextInfo,
    messageContent?.templateButtonReplyMessage?.contextInfo,
    messageContent?.interactiveResponseMessage?.contextInfo,
  ];

  for (const candidate of candidates) {
    if (hasIncomingContextSignal(candidate)) {
      return candidate;
    }
  }

  return null;
}

function hasIncomingContextSignal(candidate: any): boolean {
  if (!candidate || typeof candidate !== "object") return false;
  const adReply = candidate.externalAdReply || candidate.adReplyInfo || candidate.referral || {};
  return Boolean(
    candidate.stanzaId ||
      candidate.quotedMessage ||
      candidate.ctwaClid ||
      candidate.ctwa_clid ||
      candidate.sourceId ||
      candidate.source_id ||
      candidate.sourceUrl ||
      candidate.source_url ||
      adReply.ctwaClid ||
      adReply.ctwa_clid ||
      adReply.sourceId ||
      adReply.source_id ||
      adReply.sourceUrl ||
      adReply.source_url ||
      adReply.sourceType ||
      adReply.source_type,
  );
}

function cleanWhatsappAdsAttributionField(value: unknown, maxLength = 512): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function extractWhatsappAdsAttributionFromContextInfo(
  contextInfo: any,
  messageId?: string | null,
): Record<string, any> | null {
  if (!contextInfo || typeof contextInfo !== "object") return null;
  const adReply = contextInfo.externalAdReply || contextInfo.adReplyInfo || contextInfo.referral || contextInfo;
  if (!adReply || typeof adReply !== "object") return null;

  const attribution = {
    ctwaClid: cleanWhatsappAdsAttributionField(adReply.ctwaClid ?? adReply.ctwa_clid ?? contextInfo.ctwaClid ?? contextInfo.ctwa_clid, 1024),
    sourceId: cleanWhatsappAdsAttributionField(adReply.sourceId ?? adReply.source_id ?? contextInfo.sourceId ?? contextInfo.source_id, 128),
    sourceUrl: cleanWhatsappAdsAttributionField(adReply.sourceUrl ?? adReply.source_url ?? contextInfo.sourceUrl ?? contextInfo.source_url, 1024),
    sourceType: cleanWhatsappAdsAttributionField(adReply.sourceType ?? adReply.source_type ?? contextInfo.sourceType ?? contextInfo.source_type, 64),
    title: cleanWhatsappAdsAttributionField(adReply.title ?? adReply.headline ?? contextInfo.title ?? contextInfo.headline, 256),
    body: cleanWhatsappAdsAttributionField(adReply.body ?? contextInfo.body, 512),
    mediaType: cleanWhatsappAdsAttributionField(adReply.mediaType ?? adReply.media_type ?? contextInfo.mediaType ?? contextInfo.media_type, 64),
    thumbnailUrl: cleanWhatsappAdsAttributionField(adReply.thumbnailUrl ?? adReply.thumbnail_url ?? contextInfo.thumbnailUrl ?? contextInfo.thumbnail_url, 1024),
    capturedAt: new Date().toISOString(),
    messageId: cleanWhatsappAdsAttributionField(messageId, 128),
  };

  if (!attribution.ctwaClid && !attribution.sourceId && !attribution.sourceUrl && !attribution.sourceType) {
    return null;
  }

  return attribution;
}

function buildQuotedMessagePreviewFromPayload(quotedMessage: any): string {
  const quoted = unwrapIncomingMessageContent(quotedMessage as any);
  if (!quoted || typeof quoted !== "object") {
    return "";
  }

  if (quoted.conversation) return String(quoted.conversation).trim();
  if (quoted.extendedTextMessage?.text) return String(quoted.extendedTextMessage.text).trim();
  if (quoted.imageMessage) return String(quoted.imageMessage.caption || "[imagem citada]").trim();
  if (quoted.videoMessage) return String(quoted.videoMessage.caption || "[video citado]").trim();
  if (quoted.documentMessage) {
    return String(quoted.documentMessage.caption || quoted.documentMessage.fileName || "[documento citado]").trim();
  }
  if (quoted.documentWithCaptionMessage?.message?.documentMessage) {
    const documentMessage = quoted.documentWithCaptionMessage.message.documentMessage;
    return String(documentMessage.caption || documentMessage.fileName || "[documento citado]").trim();
  }
  if (quoted.audioMessage) return "[audio citado]";

  return "";
}

function buildCatalogAwareMessageTextForAi(params: {
  text?: string | null;
  mediaCaption?: string | null;
  mediaType?: string | null;
  quotedContext?: string | null;
}): string {
  const text = String(params.text || "").trim();
  const mediaCaption = String(params.mediaCaption || "").trim();
  const parts: string[] = [];

  if (params.quotedContext) {
    parts.push(params.quotedContext);
  }

  if (mediaCaption && !text.includes(mediaCaption)) {
    parts.push(`[LEGENDA DA IMAGEM ENVIADA PELO CLIENTE]\n${mediaCaption}`);
  }

  if (text) {
    const label = params.mediaType ? "[CONTEUDO DA MENSAGEM DO CLIENTE]" : "";
    parts.push(label ? `${label}\n${text}` : text);
  } else if (params.mediaType) {
    parts.push(`[MIDIA ENVIADA PELO CLIENTE]\nTipo: ${params.mediaType}`);
  }

  return parts.filter(Boolean).join("\n\n").trim();
}

function shouldEnhanceCatalogContextForAi(params: {
  text?: string | null;
  mediaCaption?: string | null;
  mediaType?: string | null;
  quotedContext?: string | null;
}): boolean {
  const text = String(params.text || "").toLowerCase();
  const mediaCaption = String(params.mediaCaption || "").toLowerCase();
  const quotedContext = String(params.quotedContext || "").trim();

  if (quotedContext) {
    return true;
  }

  if (params.mediaType === "image" && (mediaCaption || text.includes("[catalogo_identificado:"))) {
    return true;
  }

  if (text.includes("[catalogo_identificado:")) {
    return true;
  }

  return (
    mediaCaption.includes("código") ||
    mediaCaption.includes("codigo") ||
    mediaCaption.includes("cod ") ||
    mediaCaption.includes("preço") ||
    mediaCaption.includes("preco") ||
    mediaCaption.includes("nome ") ||
    text.includes("código ") ||
    text.includes("codigo ") ||
    text.includes("quero esse") ||
    text.includes("quero essa")
  );
}

function buildStoredMessageCatalogContext(message: any): string {
  return [message?.mediaCaption, message?.text]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

async function isCatalogModuleActiveForAi(userId: string | null | undefined): Promise<boolean> {
  if (!userId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("products_config")
      .select("is_active, send_to_ai")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("[WhatsApp] Falha ao consultar products_config para contexto de catálogo:", error);
      return false;
    }

    return data?.is_active === true && data?.send_to_ai !== false;
  } catch (error) {
    console.warn("[WhatsApp] Erro ao verificar módulo de catálogo ativo:", error);
    return false;
  }
}

async function resolveQuotedMessageContextForAi(
  conversationId: string,
  contextInfo: any,
): Promise<string> {
  if (!contextInfo || typeof contextInfo !== "object") {
    return "";
  }

  let quotedText = "";
  const stanzaId = String(contextInfo.stanzaId || "").trim();

  if (stanzaId) {
    try {
      const storedQuoted =
        (await storage.getMessageByConversationAndMessageId(conversationId, stanzaId)) ||
        (await storage.getMessageByMessageId(stanzaId));
      quotedText = buildStoredMessageCatalogContext(storedQuoted);
    } catch (error) {
      console.warn("[WhatsApp] Falha ao buscar mensagem citada para contexto da IA:", error);
    }
  }

  if (!quotedText && contextInfo.quotedMessage) {
    quotedText = buildQuotedMessagePreviewFromPayload(contextInfo.quotedMessage);
  }

  if (!quotedText) {
    return "";
  }

  return [
    "[MENSAGEM OU IMAGEM CITADA PELO CLIENTE NO WHATSAPP]",
    quotedText,
    'Use esta referência como o item exato quando o cliente disser "esse", "essa", "esses", "essa foto", "quero esse" ou responder puxando a mensagem para o lado.',
  ].join("\n");
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

type RealtimeMessageMutationPreview = {
  text: string | null;
  mediaType: string | null;
  mediaMimeType: string | null;
  mediaDuration: number | null;
  mediaCaption: string | null;
};

type OutgoingMessageStatusSignal = {
  canonicalStatus: "failed" | "server_ack" | "delivered" | "read" | "played";
  dbStatus: "failed" | "sent" | "delivered" | "read" | "played";
  statusCode: number;
  webhookEvent: "message.failed" | "message.server_ack" | "message.delivered" | "message.read" | "message.played";
  rank: number;
};

function extractRealtimeMessageMutationPreview(
  message?: proto.IMessage | null,
): RealtimeMessageMutationPreview | null {
  const msg = unwrapIncomingMessageContent(message as any);
  if (!msg) return null;

  if (msg.conversation) {
    return {
      text: msg.conversation,
      mediaType: null,
      mediaMimeType: null,
      mediaDuration: null,
      mediaCaption: null,
    };
  }

  if (msg.extendedTextMessage?.text) {
    return {
      text: msg.extendedTextMessage.text,
      mediaType: null,
      mediaMimeType: null,
      mediaDuration: null,
      mediaCaption: null,
    };
  }

  if (msg.imageMessage) {
    return {
      text: msg.imageMessage.caption || "[Imagem]",
      mediaType: "image",
      mediaMimeType: msg.imageMessage.mimetype || "image/jpeg",
      mediaDuration: null,
      mediaCaption: msg.imageMessage.caption || null,
    };
  }

  if (msg.videoMessage) {
    return {
      text: msg.videoMessage.caption || "[Video]",
      mediaType: "video",
      mediaMimeType: msg.videoMessage.mimetype || "video/mp4",
      mediaDuration: msg.videoMessage.seconds || null,
      mediaCaption: msg.videoMessage.caption || null,
    };
  }

  if (msg.documentMessage) {
    const fileName = msg.documentMessage.fileName || "Documento";
    return {
      text: msg.documentMessage.caption || `[${fileName}]`,
      mediaType: "document",
      mediaMimeType: msg.documentMessage.mimetype || "application/octet-stream",
      mediaDuration: null,
      mediaCaption: msg.documentMessage.caption || null,
    };
  }

  if (msg.audioMessage) {
    return {
      text: "[Audio]",
      mediaType: "audio",
      mediaMimeType: msg.audioMessage.mimetype || "audio/ogg; codecs=opus",
      mediaDuration: msg.audioMessage.seconds || null,
      mediaCaption: null,
    };
  }

  return null;
}

async function syncConversationPreviewAfterRealtimeMutation(params: {
  userId: string;
  messageRecord: any;
  nextText: string;
  fallbackTimestamp?: Date | null;
}): Promise<void> {
  const conversationId =
    params.messageRecord?.conversationId || params.messageRecord?.conversation_id;
  if (!conversationId) return;

  const lastMessage = await storage.getLastMessageByConversationId(conversationId);
  if (!lastMessage || lastMessage.id !== params.messageRecord.id) {
    return;
  }

  const conversation = await storage.getConversation(conversationId);
  if (!conversation) return;

  const lastMessageTime =
    lastMessage.timestamp instanceof Date
      ? lastMessage.timestamp
      : params.fallbackTimestamp || new Date();

  await storage.updateConversation(conversationId, {
    lastMessageText: params.nextText,
    lastMessageTime,
  });

  broadcastToUser(params.userId, {
    type: "message_updated",
    conversationId,
    messageId: params.messageRecord.id,
    text: params.nextText,
  });
}

function getOutgoingMessageStatusSignal(status: unknown): OutgoingMessageStatusSignal | null {
  const code = Number(status);

  if (!Number.isFinite(code)) {
    return null;
  }

  switch (code) {
    case Number(proto.WebMessageInfo.Status.ERROR):
      return {
        canonicalStatus: "failed",
        dbStatus: "failed",
        statusCode: code,
        webhookEvent: "message.failed",
        rank: 0,
      };
    case Number(proto.WebMessageInfo.Status.SERVER_ACK):
      return {
        canonicalStatus: "server_ack",
        dbStatus: "sent",
        statusCode: code,
        webhookEvent: "message.server_ack",
        rank: 2,
      };
    case Number(proto.WebMessageInfo.Status.DELIVERY_ACK):
      return {
        canonicalStatus: "delivered",
        dbStatus: "delivered",
        statusCode: code,
        webhookEvent: "message.delivered",
        rank: 3,
      };
    case Number(proto.WebMessageInfo.Status.READ):
      return {
        canonicalStatus: "read",
        dbStatus: "read",
        statusCode: code,
        webhookEvent: "message.read",
        rank: 4,
      };
    case Number(proto.WebMessageInfo.Status.PLAYED):
      return {
        canonicalStatus: "played",
        dbStatus: "played",
        statusCode: code,
        webhookEvent: "message.played",
        rank: 5,
      };
    default:
      return null;
  }
}

function getStoredOutgoingMessageStatusRank(status?: string | null): number {
  switch (String(status || "").trim().toLowerCase()) {
    case "failed":
      return 0;
    case "queued":
    case "pending":
    case "pending_delivery":
      return 1;
    case "sent":
    case "server_ack":
      return 2;
    case "delivered":
      return 3;
    case "read":
      return 4;
    case "played":
      return 5;
    default:
      return 2;
  }
}

function toIsoFromUnixSeconds(value: unknown): string | null {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return new Date(numericValue * 1000).toISOString();
}

async function applyRealtimeOutgoingMessageStatus(params: {
  userId: string;
  targetMessageId?: string | null;
  signal: OutgoingMessageStatusSignal;
  source: "message_status_updated" | "message_receipt_updated";
  participantJid?: string | null;
  receiptTimestamp?: number | null;
  readTimestamp?: number | null;
  playedTimestamp?: number | null;
}): Promise<void> {
  if (!params.targetMessageId) {
    return;
  }

  const existingMessage = await storage.getMessageByMessageId(params.targetMessageId);
  if (!existingMessage || !existingMessage.fromMe) {
    return;
  }

  const currentRank = getStoredOutgoingMessageStatusRank(existingMessage.status);
  const nextRank = params.signal.rank;
  const shouldUpdateStatus =
    params.signal.dbStatus !== existingMessage.status &&
    (nextRank >= currentRank || params.signal.dbStatus === "failed");

  const messageRecord = shouldUpdateStatus
    ? await storage.updateMessage(existingMessage.id, { status: params.signal.dbStatus })
    : existingMessage;

  const shouldBroadcast =
    params.source === "message_receipt_updated" ||
    shouldUpdateStatus ||
    currentRank < nextRank;

  if (!shouldBroadcast) {
    return;
  }

  broadcastToUser(params.userId, {
    type: params.source,
    conversationId: messageRecord.conversationId,
    id: messageRecord.id,
    messageId: messageRecord.messageId || params.targetMessageId,
    status: messageRecord.status || params.signal.dbStatus,
    statusCanonical: params.signal.canonicalStatus,
    statusCode: params.signal.statusCode,
    webhookEvent: params.signal.webhookEvent,
    participant: params.participantJid || null,
    receipt: {
      userJid: params.participantJid || null,
      receiptTimestamp: toIsoFromUnixSeconds(params.receiptTimestamp),
      readTimestamp: toIsoFromUnixSeconds(params.readTimestamp),
      playedTimestamp: toIsoFromUnixSeconds(params.playedTimestamp),
    },
    messageData: {
      id: messageRecord.id,
      conversationId: messageRecord.conversationId,
      messageId: messageRecord.messageId || params.targetMessageId,
      fromMe: true,
      text: messageRecord.text,
      timestamp:
        messageRecord.timestamp instanceof Date
          ? messageRecord.timestamp.toISOString()
          : String(messageRecord.timestamp || ""),
      status: messageRecord.status || params.signal.dbStatus,
      mediaType: messageRecord.mediaType || null,
      mediaUrl: messageRecord.mediaUrl || null,
      mediaMimeType: messageRecord.mediaMimeType || null,
      mediaCaption: messageRecord.mediaCaption || null,
      isFromAgent: Boolean((messageRecord as any).isFromAgent),
    },
  });
}

async function applyRealtimeMessageEdit(params: {
  userId: string;
  targetMessageId?: string | null;
  normalizedMessage?: proto.IMessage | null;
  eventTs?: Date | null;
}): Promise<void> {
  if (!params.targetMessageId || !params.normalizedMessage) {
    return;
  }

  const existingMessage = await storage.getMessageByMessageId(params.targetMessageId);
  if (!existingMessage) {
    console.log(`[MSG-EDIT] Mensagem alvo ${params.targetMessageId} nao encontrada para edicao`);
    return;
  }

  const preview = extractRealtimeMessageMutationPreview(params.normalizedMessage);
  if (!preview?.text?.trim()) {
    console.log(`[MSG-EDIT] Conteudo editado sem texto util para ${params.targetMessageId}`);
    return;
  }

  const updatedMessage = await storage.updateMessage(existingMessage.id, {
    text: preview.text,
    mediaType: preview.mediaType || undefined,
    mediaMimeType: preview.mediaMimeType || undefined,
    mediaDuration: preview.mediaDuration || undefined,
    mediaCaption: preview.mediaCaption || undefined,
  });

  await syncConversationPreviewAfterRealtimeMutation({
    userId: params.userId,
    messageRecord: updatedMessage,
    nextText: preview.text,
    fallbackTimestamp: params.eventTs,
  });

  console.log(`[MSG-EDIT] Mensagem ${params.targetMessageId} atualizada sem disparar IA`);
}

async function applyRealtimeMessageRevoke(params: {
  userId: string;
  targetMessageId?: string | null;
  eventTs?: Date | null;
}): Promise<void> {
  if (!params.targetMessageId) {
    return;
  }

  const existingMessage = await storage.getMessageByMessageId(params.targetMessageId);
  if (!existingMessage) {
    console.log(`[MSG-REVOKE] Mensagem alvo ${params.targetMessageId} nao encontrada para revogacao`);
    return;
  }

  const nextText = "[Mensagem apagada]";
  const updatedMessage =
    existingMessage.text === nextText
      ? existingMessage
      : await storage.updateMessage(existingMessage.id, { text: nextText });

  await syncConversationPreviewAfterRealtimeMutation({
    userId: params.userId,
    messageRecord: updatedMessage,
    nextText,
    fallbackTimestamp: params.eventTs,
  });

  console.log(`[MSG-REVOKE] Mensagem ${params.targetMessageId} marcada como apagada sem disparar IA`);
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
  const jidSuffix = decoded?.server || remoteJid.split("@")[1]?.split(":")[0] || DEFAULT_JID_SUFFIX;
  const normalizedRemoteJid = normalizeWhatsAppIdentity(remoteJid) || remoteJid;

  if (normalizedRemoteJid.endsWith("@lid")) {
    const resolveMappedPhone = (value: string | null | undefined) => {
      const normalized = normalizeWhatsAppIdentity(value);
      const digits = extractPhoneDigitsFromWhatsAppIdentity(normalized);
      if (!normalized || !digits || normalized.endsWith("@lid")) {
        return null;
      }

      const phoneJid = normalized.includes("@")
        ? normalized
        : `${digits}@${DEFAULT_JID_SUFFIX}`;

      return {
        contactNumber: cleanContactNumber(phoneJid),
        jidSuffix: DEFAULT_JID_SUFFIX,
        normalizedJid: jidNormalizedUser(phoneJid),
      };
    };

    const cachedContact = contactsCache?.get(normalizedRemoteJid) || contactsCache?.get(remoteJid);
    const cachedResolution = resolveMappedPhone(cachedContact?.phoneNumber);
    if (cachedResolution) {
      return cachedResolution;
    }

    if (connectionId) {
      try {
        const storedContact = await storage.getContactByLid(normalizedRemoteJid, connectionId);
        const storedResolution = resolveMappedPhone(storedContact?.phoneNumber);
        if (storedResolution) {
          if (contactsCache) {
            contactsCache.set(normalizedRemoteJid, {
              id: storedContact?.contactId || normalizedRemoteJid,
              lid: normalizedRemoteJid,
              phoneNumber: storedContact?.phoneNumber || storedResolution.normalizedJid,
              name: storedContact?.name || undefined,
            });
          }
          return storedResolution;
        }
      } catch (error) {
        console.warn(`[LID RESOLVE] Falha ao buscar mapeamento ${normalizedRemoteJid}:`, error);
      }
    }
  }

  const contactNumber = cleanContactNumber(rawUser);
  const normalizedJid = contactNumber
    ? jidNormalizedUser(`${contactNumber}@${jidSuffix}`)
    : jidNormalizedUser(remoteJid);

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

function isBroadcastOrStatusJid(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.endsWith("@broadcast");
}

function extractGroupNumber(remoteJid: string) {
  return remoteJid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") || "";
}

function resolveGroupParticipantName(waMessage: WAMessage) {
  const pushName = String(waMessage.pushName || "").trim();
  if (pushName) {
    return pushName;
  }

  const participant =
    String(waMessage.key.participant || (waMessage as any).participant || "").trim();
  const participantDigits = participant.replace(/\D/g, "");
  return participantDigits || null;
}

function formatIncomingGroupMessageText(
  messageText: string,
  participantName: string | null,
) {
  const baseText = String(messageText || "").trim();
  if (!baseText) {
    return baseText;
  }

  const safeParticipantName = String(participantName || "").trim();
  if (!safeParticipantName) {
    return baseText;
  }

  return `*${safeParticipantName}*: ${baseText}`;
}

async function resolveGroupSubject(
  session: WhatsAppSession,
  groupJid: string,
): Promise<string | null> {
  const cached = groupMetadataCache.get(groupJid);
  if (cached && Date.now() - cached.fetchedAt > GROUP_METADATA_CACHE_TTL_MS) {
    groupMetadataCache.delete(groupJid);
  } else if (cached?.subject?.trim()) {
    return cached.subject.trim();
  }

  if (!session.socket) {
    return null;
  }

  try {
    const metadata = await session.socket.groupMetadata(groupJid);
    const subject = String(metadata?.subject || "").trim();
    if (subject) {
      groupMetadataCache.set(groupJid, {
        id: groupJid,
        subject,
        participants: metadata?.participants?.map((participant: any) => String(participant?.id || "")),
        admins: metadata?.participants
          ?.filter((participant: any) => participant?.admin === "admin" || participant?.admin === "superadmin")
          .map((participant: any) => String(participant?.id || "")),
        fetchedAt: Date.now(),
      });
      return subject;
    }
  } catch (error) {
    console.warn(`[GROUPS] Não foi possível carregar metadados do grupo ${groupJid}:`, error);
  }

  return null;
}

async function enforceManualOnlyForGroupConversation(conversationId: string) {
  try {
    if (!(await storage.isAgentDisabledForConversation(conversationId))) {
      await storage.disableAgentForConversation(conversationId, null);
    }
  } catch (error) {
    console.error(`[GROUPS] Erro ao travar IA em modo manual na conversa ${conversationId}:`, error);
  }

  try {
    await userFollowUpService.disableFollowUp(
      conversationId,
      "Grupo em modo manual: follow-up automático indisponível.",
    );
  } catch (error) {
    console.error(`[GROUPS] Erro ao desativar follow-up na conversa ${conversationId}:`, error);
  }
}

function buildGroupHistorySyncLockKey(connectionId: string, conversationId: string) {
  return `${connectionId}:${conversationId}`;
}

function clearPendingGroupHistorySyncTimers(pending: PendingGroupHistorySync) {
  clearTimeout(pending.timeout);
  if (pending.settleTimer) {
    clearTimeout(pending.settleTimer);
    pending.settleTimer = undefined;
  }
}

function settlePendingGroupHistorySync(
  pending: PendingGroupHistorySync,
  status: GroupHistorySyncResult["status"],
) {
  if (pending.finished) {
    return;
  }

  pending.finished = true;
  clearPendingGroupHistorySyncTimers(pending);
  pendingGroupHistorySyncs.delete(pending.requestId);
  pending.resolve({
    status,
    importedCount: pending.importedCount,
    requestId: pending.requestId,
  });
}

function hasPendingGroupHistorySyncForConnection(connectionId: string) {
  for (const pending of pendingGroupHistorySyncs.values()) {
    if (!pending.finished && pending.connectionId === connectionId) {
      return true;
    }
  }

  return false;
}

function schedulePendingGroupHistorySyncSettle(
  pending: PendingGroupHistorySync,
  delayMs = GROUP_HISTORY_SYNC_IDLE_SETTLE_MS,
) {
  if (pending.finished) {
    return;
  }

  if (pending.settleTimer) {
    clearTimeout(pending.settleTimer);
  }

  pending.settleTimer = setTimeout(() => {
    settlePendingGroupHistorySync(
      pending,
      pending.importedCount > 0 ? "synced" : "skipped",
    );
  }, delayMs);
}

async function processPendingGroupHistorySyncMessages(
  session: WhatsAppSession,
  peerDataRequestSessionId: string | undefined,
  syncMessages: WAMessage[] | undefined,
) {
  const pendingMatches = Array.from(pendingGroupHistorySyncs.values()).filter((pending) => {
    if (pending.finished || pending.connectionId !== session.connectionId) {
      return false;
    }

    if (peerDataRequestSessionId) {
      return pending.requestId === peerDataRequestSessionId;
    }

    return true;
  });

  if (pendingMatches.length === 0) {
    return;
  }

  if (!syncMessages || syncMessages.length === 0) {
    for (const pending of pendingMatches) {
      schedulePendingGroupHistorySyncSettle(pending);
    }
    return;
  }

  for (const pending of pendingMatches) {
    let matchedGroupMessage = false;

    for (const message of syncMessages) {
      const remoteJid = jidNormalizedUser(String(message?.key?.remoteJid || ""));
      if (!remoteJid || remoteJid !== pending.groupJid) {
        continue;
      }
      if (!message?.message || message.key?.fromMe) {
        continue;
      }

      matchedGroupMessage = true;

      try {
        await handleIncomingMessage(session, message, {
          source: "history_sync",
          allowAutoReply: false,
          isHistorySync: true,
        });
        pending.importedCount += 1;
      } catch (error) {
        console.error(
          `[GROUPS] Falha ao importar mensagem historica do grupo ${pending.groupJid}:`,
          error,
        );
      }
    }

    if (matchedGroupMessage) {
      schedulePendingGroupHistorySyncSettle(pending);
    }
  }
}

export async function syncGroupConversationHistoryOnDemand(params: {
  connectionId: string;
  conversationId: string;
}): Promise<GroupHistorySyncResult> {
  const lockKey = buildGroupHistorySyncLockKey(params.connectionId, params.conversationId);
  const existingLock = groupHistorySyncLocks.get(lockKey);
  if (existingLock) {
    return existingLock;
  }

  const syncPromise = (async () => {
    const conversation = await storage.getConversation(params.conversationId);
    if (!conversation || conversation.connectionId !== params.connectionId) {
      throw new Error("Conversa nao encontrada para esta conexao");
    }
    if (conversation.jidSuffix !== "g.us") {
      return { status: "skipped", importedCount: 0 };
    }

    const existingMessages = await storage.getMessagesByConversationId(params.conversationId);
    if (existingMessages.length > 0) {
      return {
        status: "already_loaded",
        importedCount: existingMessages.length,
      };
    }

    const session = getSession(params.connectionId);
    if (!session?.socket) {
      throw new Error("Sessao WhatsApp indisponivel para sincronizar historico do grupo");
    }

    const requestId = `${params.connectionId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const groupJid = jidNormalizedUser(String(conversation.remoteJid || `${conversation.contactNumber}@g.us`));

    const pendingResult = new Promise<GroupHistorySyncResult>((resolve) => {
      const pending: PendingGroupHistorySync = {
        requestId,
        connectionId: params.connectionId,
        conversationId: params.conversationId,
        groupJid,
        startedAt: Date.now(),
        importedCount: 0,
        finished: false,
        timeout: setTimeout(() => {
          settlePendingGroupHistorySync(pending, "timeout");
        }, GROUP_HISTORY_SYNC_FORCE_TIMEOUT_MS),
        resolve,
      };

      pendingGroupHistorySyncs.set(requestId, pending);
      schedulePendingGroupHistorySyncSettle(pending, GROUP_HISTORY_SYNC_DEFAULT_WAIT_MS);
    });

    try {
      await session.socket.sendPeerDataOperationMessage({
        fullHistorySyncOnDemandRequest: {
          requestMetadata: {
            requestId,
          },
          historySyncConfig: {
            fullSyncDaysLimit: GROUP_HISTORY_SYNC_RECENT_DAYS,
            recentSyncDaysLimit: GROUP_HISTORY_SYNC_RECENT_DAYS,
            supportGroupHistory: true,
            supportHostedGroupMsg: true,
            supportMessageAssociation: true,
            supportCagReactionsAndPolls: true,
            onDemandReady: true,
            completeOnDemandReady: true,
          },
        },
        peerDataOperationRequestType:
          proto.Message.PeerDataOperationRequestType.FULL_HISTORY_SYNC_ON_DEMAND,
      });
    } catch (error) {
      const pending = pendingGroupHistorySyncs.get(requestId);
      if (pending) {
        settlePendingGroupHistorySync(pending, "skipped");
      }
      throw error;
    }

    const result = await pendingResult;
    const refreshedMessages = await storage.getMessagesByConversationId(params.conversationId);
    if (refreshedMessages.length > 0 && result.importedCount === 0) {
      return {
        ...result,
        status: result.status === "timeout" ? "timeout" : "synced",
        importedCount: refreshedMessages.length,
      };
    }

    return result;
  })();

  groupHistorySyncLocks.set(lockKey, syncPromise);

  try {
    return await syncPromise;
  } finally {
    groupHistorySyncLocks.delete(lockKey);
  }
}

function buildConversationHistorySyncLockKey(connectionId: string, conversationId: string) {
  return `${connectionId}:${conversationId}`;
}

function clearPendingConversationHistorySyncTimers(pending: PendingConversationHistorySync) {
  clearTimeout(pending.timeout);
  if (pending.settleTimer) {
    clearTimeout(pending.settleTimer);
    pending.settleTimer = undefined;
  }
}

function settlePendingConversationHistorySync(
  pending: PendingConversationHistorySync,
  status: ConversationHistorySyncResult["status"],
) {
  if (pending.finished) {
    return;
  }

  pending.finished = true;
  clearPendingConversationHistorySyncTimers(pending);
  pendingConversationHistorySyncs.delete(pending.internalId);
  pending.resolve({
    status,
    importedCount: pending.importedCount,
    requestId: pending.requestId || pending.internalId,
  });
}

function schedulePendingConversationHistorySyncSettle(
  pending: PendingConversationHistorySync,
  delayMs = GROUP_HISTORY_SYNC_IDLE_SETTLE_MS,
) {
  if (pending.finished) {
    return;
  }

  if (pending.settleTimer) {
    clearTimeout(pending.settleTimer);
  }

  pending.settleTimer = setTimeout(() => {
    settlePendingConversationHistorySync(
      pending,
      pending.importedCount > 0 ? "synced" : "skipped",
    );
  }, delayMs);
}

function hasPendingConversationHistorySyncForConnection(connectionId: string) {
  for (const pending of pendingConversationHistorySyncs.values()) {
    if (!pending.finished && pending.connectionId === connectionId) {
      return true;
    }
  }

  return false;
}

function getHistoryMessageEventTs(message: WAMessage) {
  const msgTs = Number((message as any).messageTimestamp) * 1000;
  return Number.isFinite(msgTs) && msgTs > 0 ? new Date(msgTs) : new Date();
}

function historyMessageMatchesConversationTarget(message: WAMessage, targetJid: string) {
  const candidates = [
    message?.key?.remoteJid,
    (message?.key as any)?.remoteJidAlt,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => jidNormalizedUser(value));

  return candidates.includes(targetJid);
}

async function importConversationHistoryMessage(
  session: WhatsAppSession,
  message: WAMessage,
) {
  if (!message?.key?.remoteJid || !message.message) {
    return false;
  }

  const eventTs = getHistoryMessageEventTs(message);
  if (message.key.fromMe) {
    await handleOutgoingMessage(session, message, {
      isHistorySync: true,
      eventTs,
    });
    return true;
  }

  await handleIncomingMessage(session, message, {
    source: "history_sync",
    allowAutoReply: false,
    isHistorySync: true,
    eventTs,
  });
  return true;
}

async function processPendingConversationHistorySyncMessages(
  session: WhatsAppSession,
  peerDataRequestSessionId: string | undefined,
  syncMessages: WAMessage[] | undefined,
) {
  const pendingMatches = Array.from(pendingConversationHistorySyncs.values()).filter((pending) => {
    if (pending.finished || pending.connectionId !== session.connectionId) {
      return false;
    }

    if (peerDataRequestSessionId && pending.requestId) {
      return pending.requestId === peerDataRequestSessionId;
    }

    return true;
  });

  if (pendingMatches.length === 0) {
    return;
  }

  if (!syncMessages || syncMessages.length === 0) {
    for (const pending of pendingMatches) {
      schedulePendingConversationHistorySyncSettle(pending);
    }
    return;
  }

  for (const pending of pendingMatches) {
    let matchedMessage = false;

    for (const message of syncMessages) {
      if (!historyMessageMatchesConversationTarget(message, pending.targetJid)) {
        continue;
      }

      try {
        const imported = await importConversationHistoryMessage(session, message);
        if (imported) {
          matchedMessage = true;
          pending.importedCount += 1;
        }
      } catch (error) {
        console.error(
          `[HISTORY SYNC] Falha ao importar mensagem historica da conversa ${pending.conversationId}:`,
          error,
        );
      }
    }

    if (matchedMessage) {
      schedulePendingConversationHistorySyncSettle(pending);
    }
  }
}

async function processPendingConversationHistoryUpsertMessage(
  session: WhatsAppSession,
  message: WAMessage,
  requestId?: string,
) {
  const pendingMatches = Array.from(pendingConversationHistorySyncs.values()).filter((pending) => {
    if (pending.finished || pending.connectionId !== session.connectionId) {
      return false;
    }

    if (requestId && pending.requestId) {
      return pending.requestId === requestId;
    }

    return historyMessageMatchesConversationTarget(message, pending.targetJid);
  });

  if (pendingMatches.length === 0) {
    return false;
  }

  let importedAny = false;
  for (const pending of pendingMatches) {
    if (!historyMessageMatchesConversationTarget(message, pending.targetJid)) {
      continue;
    }

    try {
      const imported = await importConversationHistoryMessage(session, message);
      if (imported) {
        importedAny = true;
        pending.importedCount += 1;
        schedulePendingConversationHistorySyncSettle(pending);
      }
    } catch (error) {
      console.error(
        `[HISTORY SYNC] Falha ao importar append historico da conversa ${pending.conversationId}:`,
        error,
      );
    }
  }

  return importedAny;
}

export async function syncConversationHistoryOnDemand(params: {
  connectionId: string;
  conversationId: string;
  count?: number;
}): Promise<ConversationHistorySyncResult> {
  const lockKey = buildConversationHistorySyncLockKey(params.connectionId, params.conversationId);
  const existingLock = conversationHistorySyncLocks.get(lockKey);
  if (existingLock) {
    return existingLock;
  }

  const syncPromise = (async () => {
    const conversation = await storage.getConversation(params.conversationId);
    if (!conversation || conversation.connectionId !== params.connectionId) {
      throw new Error("Conversa nao encontrada para esta conexao");
    }

    const existingMessages = await storage.getMessagesByConversationId(params.conversationId);
    if (existingMessages.length === 0) {
      if (conversation.jidSuffix === "g.us") {
        return syncGroupConversationHistoryOnDemand({
          connectionId: params.connectionId,
          conversationId: params.conversationId,
        });
      }

      return { status: "skipped", importedCount: 0 };
    }

    const oldestMessage = existingMessages[0];
    const oldestMessageId = String((oldestMessage as any).messageId || "").trim();
    if (!oldestMessageId) {
      return { status: "skipped", importedCount: 0 };
    }

    const session = getSession(params.connectionId);
    if (!session?.socket) {
      throw new Error("Sessao WhatsApp indisponivel para sincronizar historico da conversa");
    }

    const targetJid = buildSendJid(conversation);
    const historyCount = Math.max(1, Math.min(Number(params.count || 50), 50));
    const parsedOldestTimestampMs = oldestMessage.timestamp
      ? new Date(oldestMessage.timestamp as any).getTime()
      : Date.now();
    const oldestTimestampMs = Number.isFinite(parsedOldestTimestampMs)
      ? parsedOldestTimestampMs
      : Date.now();
    const oldestTimestampSeconds = Math.floor(oldestTimestampMs / 1000);

    const requestHistory = async (
      timestampValue: number,
      timestampMode: "ms" | "seconds",
      startingMessageCount: number,
    ): Promise<ConversationHistorySyncResult> => {
      const internalId = `${params.connectionId}-${params.conversationId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

      const pendingResult = new Promise<ConversationHistorySyncResult>((resolve) => {
        const pending: PendingConversationHistorySync = {
          internalId,
          connectionId: params.connectionId,
          conversationId: params.conversationId,
          targetJid,
          startedAt: Date.now(),
          importedCount: 0,
          finished: false,
          timeout: setTimeout(() => {
            settlePendingConversationHistorySync(pending, "timeout");
          }, GROUP_HISTORY_SYNC_FORCE_TIMEOUT_MS),
          resolve,
        };

        pendingConversationHistorySyncs.set(internalId, pending);
        schedulePendingConversationHistorySyncSettle(pending, GROUP_HISTORY_SYNC_DEFAULT_WAIT_MS);
      });

      try {
        console.log(
          `[HISTORY SYNC] fetch conversation=${params.conversationId} target=${targetJid} anchor=${oldestMessageId} timestampMode=${timestampMode} timestamp=${timestampValue} count=${historyCount}`,
        );
        const requestId = await session.socket.fetchMessageHistory(
          historyCount,
          {
            remoteJid: targetJid,
            fromMe: Boolean(oldestMessage.fromMe),
            id: oldestMessageId,
          },
          timestampValue,
        );
        console.log(
          `[HISTORY SYNC] fetch requested conversation=${params.conversationId} timestampMode=${timestampMode} requestId=${requestId || "none"}`,
        );
        const pending = pendingConversationHistorySyncs.get(internalId);
        if (pending) {
          pending.requestId = requestId;
        }
      } catch (error) {
        const pending = pendingConversationHistorySyncs.get(internalId);
        if (pending) {
          settlePendingConversationHistorySync(pending, "skipped");
        }
        throw error;
      }

      const result = await pendingResult;
      const refreshedMessages = await storage.getMessagesByConversationId(params.conversationId);
      const addedCount = Math.max(0, refreshedMessages.length - startingMessageCount);
      if (addedCount > 0 && result.importedCount === 0) {
        return {
          ...result,
          status: result.status === "timeout" ? "timeout" : "synced",
          importedCount: addedCount,
        };
      }

      return result;
    };

    const firstResult = await requestHistory(
      oldestTimestampMs,
      "ms",
      existingMessages.length,
    );
    if (
      firstResult.importedCount === 0 &&
      firstResult.status !== "synced" &&
      oldestTimestampSeconds !== oldestTimestampMs
    ) {
      const beforeFallbackMessages = await storage.getMessagesByConversationId(params.conversationId);
      console.log(
        `[HISTORY SYNC] retrying conversation=${params.conversationId} with timestampMode=seconds after empty ${firstResult.status}`,
      );
      return requestHistory(
        oldestTimestampSeconds,
        "seconds",
        beforeFallbackMessages.length,
      );
    }

    return firstResult;
  })();

  conversationHistorySyncLocks.set(lockKey, syncPromise);

  try {
    return await syncPromise;
  } finally {
    conversationHistorySyncLocks.delete(lockKey);
  }
}

function roundAttentionConfidence(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Math.round(value * 100) / 100;
}

function hasAttentionStateChanged(
  conversation: Conversation,
  nextAttention: AIResponseResult["attention"],
): boolean {
  if (!nextAttention) return false;

  const nextReason = nextAttention.reason?.trim() || null;
  const currentReason = conversation.attentionReason?.trim() || null;
  const nextConfidence = roundAttentionConfidence(nextAttention.confidence);
  const currentConfidence = roundAttentionConfidence(
    conversation.attentionConfidence == null
      ? null
      : Number(conversation.attentionConfidence),
  );

  return (
    conversation.attentionPriority !== nextAttention.priority ||
    conversation.needsHumanAttention !== nextAttention.needsHumanAttention ||
    currentReason !== nextReason ||
    currentConfidence !== nextConfidence
  );
}

async function persistConversationAttentionAssessment(params: {
  userId: string;
  conversationId: string;
  conversation: Conversation;
  attention: AIResponseResult["attention"];
  sourceLabel: string;
}): Promise<Conversation> {
  const { userId, conversationId, attention, sourceLabel } = params;
  let realtimeConversation = params.conversation;

  const shouldPersistAttentionQualification =
    realtimeConversation &&
    attention &&
    (
      hasAttentionStateChanged(realtimeConversation, attention) ||
      !realtimeConversation.attentionQualifiedAt
    );

  if (!shouldPersistAttentionQualification || !attention) {
    return realtimeConversation;
  }

  const nextAttentionQualifiedAt = new Date();
  realtimeConversation = await storage.updateConversation(conversationId, {
    attentionPriority: attention.priority,
    attentionReason: attention.reason,
    attentionConfidence:
      attention.confidence == null
        ? null
        : String(roundAttentionConfidence(attention.confidence)),
    needsHumanAttention: attention.needsHumanAttention,
    attentionQualifiedAt: nextAttentionQualifiedAt,
  });
  console.log(
    `🎯 [AI AGENT] Atenção atualizada (${sourceLabel}): ${attention.priority || "sem prioridade"} | human=${attention.needsHumanAttention}`,
  );
  broadcastToUser(userId, {
    type: "conversation_attention_updated",
    conversationId,
    conversationUpdate: buildConversationRealtimeUpdate(realtimeConversation),
  });

  return realtimeConversation;
}

function buildConversationRealtimeUpdate(
  conversation: Conversation,
  overrides?: Partial<Conversation>,
) {
  return {
    id: conversation.id,
    connectionId: overrides?.connectionId ?? conversation.connectionId,
    contactNumber: overrides?.contactNumber ?? conversation.contactNumber,
    contactName: overrides?.contactName ?? conversation.contactName,
    contactAvatar: overrides?.contactAvatar ?? conversation.contactAvatar,
    lastMessageText: overrides?.lastMessageText ?? conversation.lastMessageText,
    lastMessageTime:
      (overrides?.lastMessageTime ?? conversation.lastMessageTime)?.toISOString?.() ??
      (overrides?.lastMessageTime ?? conversation.lastMessageTime) ??
      null,
    lastMessageFromMe: overrides?.lastMessageFromMe ?? conversation.lastMessageFromMe,
    unreadCount: overrides?.unreadCount ?? conversation.unreadCount,
    attentionPriority: overrides?.attentionPriority ?? conversation.attentionPriority,
    attentionReason: overrides?.attentionReason ?? conversation.attentionReason,
    attentionConfidence:
      overrides?.attentionConfidence ?? conversation.attentionConfidence ?? null,
    needsHumanAttention:
      overrides?.needsHumanAttention ?? conversation.needsHumanAttention,
    attentionQualifiedAt:
      (overrides?.attentionQualifiedAt ?? conversation.attentionQualifiedAt)?.toISOString?.() ??
      (overrides?.attentionQualifiedAt ?? conversation.attentionQualifiedAt) ??
      null,
  };
}

async function routeManualOwnerReplyToIntakeSector(params: {
  userId: string;
  conversation: Conversation;
  messageText: string | null;
}): Promise<Conversation> {
  const { userId, conversation, messageText } = params;
  if (conversation.sectorId || conversation.assignedToMemberId) {
    return conversation;
  }

  try {
    const result = await applyConversationRoutingDecision({
      ownerId: userId,
      conversationId: conversation.id,
      decision: {
        mode: "keep_current",
        targetSectorId: null,
        confidence: 0.72,
        intent: "manual_owner_intake_fallback",
        reason: "Resposta manual em conversa sem setor.",
      },
      handedOffBy: "system",
      routingMethod: "manual_owner_reply_intake_fallback",
    });

    if (!result.sectorId) {
      return conversation;
    }

    const updatedConversation = await storage.getConversation(conversation.id);
    if (!updatedConversation) {
      return conversation;
    }

    broadcastToUser(userId, {
      type: "conversation_updated",
      conversationId: conversation.id,
      conversationUpdate: buildConversationRealtimeUpdate(updatedConversation, {
        lastMessageText: messageText || conversation.lastMessageText,
        lastMessageFromMe: true,
      }),
    });

    console.log(
      `[FROM ME] Conversa ${conversation.id} encaminhada para setor de entrada apos resposta manual`,
    );

    return updatedConversation;
  } catch (error) {
    console.warn(
      `[FROM ME] Falha ao encaminhar conversa ${conversation.id} para setor de entrada apos resposta manual:`,
      error,
    );
    return conversation;
  }
}

async function applyInboundAutomationGuardBlock(params: {
  userId: string;
  conversation: Conversation;
  reason: string;
  reasonCode: string | null;
}): Promise<void> {
  const disableReason = `Automação pausada: ${params.reason}`;

  await storage.disableAgentForConversation(params.conversation.id, null);

  if (params.conversation.followupActive) {
    try {
      await userFollowUpService.disableFollowUp(params.conversation.id, disableReason);
    } catch (error) {
      console.error("[AUTOMATION GUARD] Erro ao desativar follow-up:", error);
    }
  }

  const updatedConversation = await storage.getConversation(params.conversation.id);
  if (updatedConversation) {
    broadcastToUser(params.userId, {
      type: "conversation_updated",
      conversationId: params.conversation.id,
      conversationUpdate: buildConversationRealtimeUpdate(updatedConversation),
    });
  }

  console.log(
    `[AUTOMATION GUARD] Automação bloqueada para conversa ${params.conversation.id} (${params.conversation.contactNumber}) | code=${params.reasonCode || "sem_codigo"} | reason=${params.reason}`,
  );
}

async function resolveRuntimeOwnedConnection(userId: string, connectionId?: string): Promise<WhatsappConnection | null> {
  let connection =
    connectionId
      ? await storage.getConnectionById(connectionId)
      : await storage.getConnectionByUserId(userId);

  if (!connection || connection.userId !== userId) {
    connection = await storage.getConnectionByUserId(userId);
  }

  if (!connection || connection.userId !== userId) {
    return null;
  }

  return connection;
}

async function shouldSkipConnectionForCurrentRuntime(
  userId: string,
  connectionId?: string,
): Promise<{ connection: WhatsappConnection | null; owner: "local" | "gateway"; skip: boolean }> {
  const connection = await resolveRuntimeOwnedConnection(userId, connectionId);
  if (!connection) {
    return { connection: null, owner: "local", skip: false };
  }

  const owner = await resolveWhatsAppConnectionOwner(connection);
  return {
    connection,
    owner,
    skip: !await isConnectionOwnedByCurrentProcess(connection),
  };
}

// Funï¿½ï¿½o para limpar arquivos de autenticaï¿½ï¿½o
async function clearAuthFiles(authPath: string): Promise<void> {
  try {
    await clearBaileysAuthState(authPath);
    const exists = await fs.access(authPath).then(() => true).catch(() => false);
    if (exists) {
      await deleteWhatsAppSessionSnapshot(authPath, "clear-auth");
      await fs.rm(authPath, { recursive: true, force: true });
      console.log(`Cleared auth files at: ${authPath}`);
    }
  } catch (error) {
    console.error(`Error clearing auth files at ${authPath}:`, error);
  }
}

// Forï¿½a reconexï¿½o limpando sessï¿½o existente na memï¿½ria (sem apagar arquivos de auth)
function isRecordValue(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const QR_RECONNECT_BACKLOG_CUTOFF_REASON = "qr_reconnect_backlog_cutoff";
const MANUAL_RECONNECT_BACKLOG_CUTOFF_REASON = "manual_reconnect_backlog_cutoff";

function isUserInitiatedConnectSource(source: string): boolean {
  const normalized = String(source || "").trim().toLowerCase();
  return (
    normalized === "direct" ||
    normalized.startsWith("manual") ||
    normalized.startsWith("user_action")
  );
}

function mergeConnectionQrMetadata(
  sessionData: unknown,
  event: {
    at: string;
    source?: string;
    details?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const root = isRecordValue(sessionData) ? { ...sessionData } : {};
  const runtimeDiagnostics = isRecordValue(root.runtimeDiagnostics)
    ? { ...root.runtimeDiagnostics }
    : {};

  runtimeDiagnostics.lastQrCode = {
    at: event.at,
    source: event.source || null,
    details: event.details ? { ...event.details } : {},
  };

  root.runtimeDiagnostics = runtimeDiagnostics;
  return root;
}

function mergeConnectionFreeTrialConnectionMetadata(
  sessionData: unknown,
  connectedAtIso: string,
): Record<string, unknown> {
  const root = isRecordValue(sessionData) ? { ...sessionData } : {};
  const freeTrial = isRecordValue(root.freeTrial) ? { ...root.freeTrial } : {};
  if (!freeTrial.firstConnectedAt) {
    freeTrial.firstConnectedAt = connectedAtIso;
  }
  freeTrial.lastConnectedAt = connectedAtIso;
  root.freeTrial = freeTrial;
  return root;
}

function mergeConnectionQrReconnectCutoffMetadata(
  sessionData: unknown,
  event: {
    at: string;
    qrIssuedAt?: string;
    source?: string;
    details?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const root = isRecordValue(sessionData) ? { ...sessionData } : {};
  const runtimeDiagnostics = isRecordValue(root.runtimeDiagnostics)
    ? { ...root.runtimeDiagnostics }
    : {};

  runtimeDiagnostics.lastQrReconnectCutoff = {
    at: event.at,
    qrIssuedAt: event.qrIssuedAt || null,
    source: event.source || null,
    details: event.details ? { ...event.details } : {},
  };

  root.runtimeDiagnostics = runtimeDiagnostics;
  return root;
}

function mergeConnectionManualReconnectCutoffMetadata(
  sessionData: unknown,
  event: {
    at: string;
    source?: string;
    details?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const root = isRecordValue(sessionData) ? { ...sessionData } : {};
  const runtimeDiagnostics = isRecordValue(root.runtimeDiagnostics)
    ? { ...root.runtimeDiagnostics }
    : {};

  runtimeDiagnostics.lastManualReconnectCutoff = {
    at: event.at,
    reason: MANUAL_RECONNECT_BACKLOG_CUTOFF_REASON,
    source: event.source || null,
    details: event.details ? { ...event.details } : {},
  };

  root.runtimeDiagnostics = runtimeDiagnostics;
  return root;
}

async function buildQrReconnectCutoffSessionData(
  session: WhatsAppSession,
  source: string,
  fallbackSessionData?: unknown,
): Promise<Record<string, unknown> | null> {
  let baseSessionData = fallbackSessionData;
  let latestConnection: WhatsappConnection | null = null;
  try {
    latestConnection = (await storage.getConnectionById(session.connectionId)) ?? null;
    if (latestConnection) {
      baseSessionData = latestConnection.sessionData;
    }
  } catch (error) {
    console.warn(
      `[QR BACKLOG] Failed to read latest session_data for ${session.connectionId.substring(0, 8)} before cutoff persist:`,
      error,
    );
  }

  const inMemoryQrIssuedAtMs = parseTimestampMs(session.qrIssuedAt);
  const persistedQrCandidateMs =
    latestConnection?.qrCode && (session.connectedAt || latestConnection.isConnected)
      ? getLastQrCodeIssuedAtMsFromSessionData(latestConnection.sessionData)
      : null;
  const handoffReferenceMs = session.connectedAt || Date.now();
  const persistedQrIssuedAtMs =
    persistedQrCandidateMs &&
    persistedQrCandidateMs <= handoffReferenceMs + QR_RECONNECT_CUTOFF_DRIFT_MS &&
    handoffReferenceMs - persistedQrCandidateMs <= QR_RECONNECT_PERSISTED_QR_HANDOFF_MAX_AGE_MS
      ? persistedQrCandidateMs
      : null;
  const qrIssuedAtMs = inMemoryQrIssuedAtMs || persistedQrIssuedAtMs;
  if (!qrIssuedAtMs) {
    return null;
  }

  const cutoffAt = new Date(session.connectedAt || Date.now()).toISOString();
  const qrIssuedAt = new Date(qrIssuedAtMs).toISOString();
  console.log(
    `[QR BACKLOG] Persisting QR reconnect cutoff for conn ${session.connectionId.substring(0, 8)} at ${cutoffAt}`,
  );

  return mergeConnectionQrReconnectCutoffMetadata(baseSessionData, {
    at: cutoffAt,
    qrIssuedAt,
    source: session.qrConnectSource || (persistedQrIssuedAtMs ? "persisted_qr_handoff_open" : source),
    details: {
      userId: session.userId,
      connectionId: session.connectionId,
    },
  });
}

async function buildManualReconnectCutoffSessionData(
  session: WhatsAppSession,
  source: string,
  fallbackSessionData?: unknown,
): Promise<Record<string, unknown> | null> {
  if (!isUserInitiatedConnectSource(source) || session.qrIssuedAt) {
    return null;
  }

  let baseSessionData = fallbackSessionData;
  let latestConnection: WhatsappConnection | null = null;
  try {
    latestConnection = await storage.getConnectionById(session.connectionId);
    if (latestConnection) {
      baseSessionData = latestConnection.sessionData;
    }
  } catch (error) {
    console.warn(
      `[MANUAL BACKLOG] Failed to read latest session_data for ${session.connectionId.substring(0, 8)} before cutoff persist:`,
      error,
    );
  }

  const previousPhoneNumber =
    (typeof latestConnection?.phoneNumber === "string" && latestConnection.phoneNumber.trim()) ||
    (typeof session.phoneNumberBeforeConnect === "string" && session.phoneNumberBeforeConnect.trim()) ||
    "";
  const hadExistingIdentity = Boolean(previousPhoneNumber || session.hadAuthBeforeConnect);
  if (!hadExistingIdentity) {
    return null;
  }

  const cutoffAt = new Date(session.connectedAt || Date.now()).toISOString();
  console.log(
    `[MANUAL BACKLOG] Persisting manual reconnect cutoff for conn ${session.connectionId.substring(0, 8)} at ${cutoffAt}`,
  );

  return mergeConnectionManualReconnectCutoffMetadata(baseSessionData, {
    at: cutoffAt,
    source,
    details: {
      userId: session.userId,
      connectionId: session.connectionId,
      previousPhoneNumber: previousPhoneNumber || null,
      previousProviderStatus: latestConnection?.providerStatus ?? session.providerStatusBeforeConnect ?? null,
      hadAuthBeforeConnect: session.hadAuthBeforeConnect === true,
    },
  });
}

async function buildReconnectBacklogCutoffSessionData(
  session: WhatsAppSession,
  source: string,
  fallbackSessionData?: unknown,
): Promise<Record<string, unknown> | null> {
  const qrReconnectSessionData = await buildQrReconnectCutoffSessionData(
    session,
    source,
    fallbackSessionData,
  );
  if (qrReconnectSessionData) {
    return qrReconnectSessionData;
  }

  return buildManualReconnectCutoffSessionData(session, source, fallbackSessionData);
}

async function recordConnectionAuditEvent(
  connectionId: string | undefined,
  event: {
    kind: "force_reset" | "logout" | "open_timeout" | "manual_disconnect";
    source?: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  if (!connectionId) {
    return;
  }

  try {
    const connection = await storage.getConnectionById(connectionId);
    if (!connection) {
      return;
    }

    const details = isRecordValue(event.details) ? event.details : undefined;
    const sessionData = mergeConnectionAuditEvent(connection.sessionData, {
      kind: event.kind,
      at: new Date().toISOString(),
      source: event.source,
      details,
    });

    await storage.updateConnection(connectionId, {
      sessionData: sessionData as any,
    });
  } catch (error) {
    console.error(`[WA AUDIT] Falha ao persistir auditoria da conexão ${connectionId}:`, error);
  }
}

function scheduleConnectWhatsAppRetry(
  userId: string,
  connectionId: string,
  delayMs: number,
  source: string,
): void {
  const timer = setTimeout(() => {
    void connectWhatsApp(userId, connectionId, { source }).catch((error) => {
      console.error(
        `[RECONNECT] Falha no reconnect agendado para user ${userId.substring(0, 8)} conn ${connectionId.substring(0, 8)} (${source}):`,
        error,
      );
    });
  }, delayMs);
  timer.unref?.();
}

async function buildRuntimeContinuityCandidates(
  userId: string,
  connectedConnectionId?: string,
  phoneNumber?: string | null,
) {
  const userConnections = await storage.getConnectionsByUserId(userId);
  return userConnections.map((connection) => {
    const liveSession = sessions.get(connection.id);
    const runtimePhoneNumber =
      connection.id === connectedConnectionId
        ? phoneNumber || connection.phoneNumber || null
        : liveSession?.phoneNumber || connection.phoneNumber || null;
    const runtimeIsConnected =
      connection.id === connectedConnectionId
        ? true
        : liveSession?.isOpen === true;

    return {
      ...connection,
      runtimePhoneNumber,
      runtimeIsConnected,
    };
  });
}

async function reconcileDuplicateConnectionsAfterOpen(
  userId: string,
  connectedConnectionId: string,
  phoneNumber?: string | null,
): Promise<void> {
  try {
    const candidates = await buildRuntimeContinuityCandidates(
      userId,
      connectedConnectionId,
      phoneNumber,
    );
    const result = await reconcileDuplicatePhoneConnectionsForUser(userId, candidates);
    if (!result.changed) {
      return;
    }

    const recoveredCount = await recoverStructuralFollowUpsForConnection(connectedConnectionId);
    if (recoveredCount > 0) {
      console.log(
        `[CONTINUITY] Recuperados ${recoveredCount} follow-ups estruturais após reconciliar duplicatas para ${userId.substring(0, 8)}...`,
      );
    }
  } catch (error) {
    console.error(`[CONTINUITY] Falha ao reconciliar conexões duplicadas para ${userId.substring(0, 8)}...:`, error);
  }
}

export async function forceReconnectWhatsApp(userId: string, connectionId?: string): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: Bloquear reconexï¿½es para evitar conflito com produï¿½ï¿½o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] forceReconnectWhatsApp bloqueado para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sessï¿½es do WhatsApp em produï¿½ï¿½o nï¿½o serï¿½o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessï¿½es em produï¿½ï¿½o.');
  }
  
  const lookupKey = connectionId || userId;
  console.log(`[FORCE RECONNECT] Starting force reconnection for ${lookupKey}...`);
  
  // Limpar sessï¿½o existente na memï¿½ria (se houver)
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
    unregisterWhatsAppSession(userId, connectionId);
  }
  
  // Limpar pending connections e tentativas de reconexï¿½o
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
    const isResponsive = isAdminSocketOperational(currentSession);

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
// Esta funï¿½ï¿½o forï¿½a uma reconexï¿½o REAL do WhatsApp para que o Baileys
// dispare novamente o evento contacts.upsert com TODOS os contatos.
//
// Segundo a documentaï¿½ï¿½o do Baileys:
// - contacts.upsert envia TODOS os contatos na PRIMEIRA conexï¿½o
// - Para forï¿½ar novo envio, precisa reconectar a sessï¿½o
// - Ref: https://github.com/WhiskeySockets/Baileys/issues/266
// ======================================================================
export async function forceFullContactSync(userId: string): Promise<{ success: boolean; message: string }> {
  // ??? MODO DESENVOLVIMENTO: Bloquear reconexï¿½es
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] forceFullContactSync bloqueado para user ${userId}`);
    return { success: false, message: 'Modo desenvolvimento - WhatsApp desabilitado' };
  }

  console.log(`\n========================================`);
  console.log(`?? [FORCE FULL SYNC] Iniciando sincronizaï¿½ï¿½o COMPLETA de contatos`);
  console.log(`?? [FORCE FULL SYNC] User ID: ${userId}`);
  console.log(`========================================\n`);

  // Limpar cache de agenda existente para forï¿½ar nova sincronizaï¿½ï¿½o
  agendaContactsCache.delete(userId);
  console.log(`?? [FORCE FULL SYNC] Cache de agenda limpo`);

  // Verificar se existe sessï¿½o ativa
  const existingSession = sessions.get(userId);
  if (!existingSession?.socket) {
    console.log(`?? [FORCE FULL SYNC] Nenhuma sessï¿½o ativa - conectando do zero...`);
    await connectWhatsApp(userId);
    return { success: true, message: 'Conexï¿½o iniciada - aguarde os contatos serem sincronizados' };
  }

  console.log(`?? [FORCE FULL SYNC] Sessï¿½o encontrada - reconectando para buscar todos os contatos...`);

  try {
    // 1. Fechar socket atual (mantï¿½m credenciais)
    console.log(`?? [FORCE FULL SYNC] Fechando conexï¿½o atual...`);
    try {
      existingSession.socket.end(undefined);
    } catch (e) {
      console.log(`?? [FORCE FULL SYNC] Erro ao fechar socket (ignorando):`, e);
    }

    // 2. Limpar da memï¿½ria
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
    console.log(`?? [FORCE FULL SYNC] Aguardando sincronizaï¿½ï¿½o de contatos...`);

    // Aguardar atï¿½ 30 segundos para os contatos serem sincronizados
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
    console.log(`?? [FORCE FULL SYNC] ? CONCLUï¿½DO!`);
    console.log(`?? [FORCE FULL SYNC] Total de contatos sincronizados: ${contactCount}`);
    console.log(`========================================\n`);

    return {
      success: true,
      message: `? Sincronizaï¿½ï¿½o completa! ${contactCount} contatos encontrados.`
    };

  } catch (error) {
    console.error(`?? [FORCE FULL SYNC] ? Erro:`, error);
    return {
      success: false,
      message: `Erro na sincronizaï¿½ï¿½o: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

// Forï¿½a reset COMPLETO - apaga arquivos de autenticaï¿½ï¿½o (forï¿½a novo QR Code)
type ForceResetOptions = {
  source?: string;
};

export async function forceResetWhatsApp(
  userId: string,
  connectionId?: string,
  options?: ForceResetOptions,
): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: Bloquear reset para evitar conflito com produï¿½ï¿½o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] forceResetWhatsApp bloqueado para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sessï¿½es do WhatsApp em produï¿½ï¿½o nï¿½o serï¿½o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessï¿½es em produï¿½ï¿½o.');
  }

  const ownership = await shouldSkipConnectionForCurrentRuntime(userId, connectionId);
  if (ownership.connection && ownership.skip) {
    if (!isWhatsAppGatewayRuntime() && ownership.owner === "gateway") {
      await resetGatewayInstance(ownership.connection.id, {
        source: options?.source || "app_force_reset_forwarded_to_gateway",
      });
      return;
    }
    throw new Error(`Connection ${ownership.connection.id} is owned by ${ownership.owner}`);
  }
  
  const lookupKey = connectionId || userId;
  console.log(`[FORCE RESET] Starting complete reset for ${lookupKey}...`);
  
  // Limpar sessï¿½o existente na memï¿½ria (se houver)
  const existingSession = sessions.get(lookupKey);
  if (existingSession?.socket) {
    console.log(`[FORCE RESET] Found existing session in memory, closing it...`);
    try {
      existingSession.socket.end(undefined);
    } catch (e) {
      console.log(`[FORCE RESET] Error closing existing socket (ignoring):`, e);
    }
    sessions.delete(lookupKey);
    unregisterWhatsAppSession(userId, connectionId);
  }
  
  // Limpar pending connections e tentativas de reconexï¿½o
  clearPendingConnectionLock(lookupKey, 'force_reset');
  reconnectAttempts.delete(lookupKey);
  
  // APAGAR arquivos de autenticaï¿½ï¿½o (forï¿½a novo QR Code)
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
    await storage.updateConnection(
      connection.id,
      buildBaileysConnectionStatePatch(false, {
        qrCode: null,
        providerConfig: clearManualDisconnectProviderConfig(connection),
      }),
    );
    await recordConnectionAuditEvent(connection.id, {
      kind: "force_reset",
      source: options?.source || "force_reset",
      details: {
        userId,
        connectionId: connection.id,
        lookupKey,
        clearedAuthScope: isSecondary ? "secondary_connection" : "primary_user_scope",
      },
    });
  }

  memoryCache.invalidate(`api:wa-conn:${userId}`);
  
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
  // ??? MODO DESENVOLVIMENTO: Bloquear conexï¿½es para evitar conflito com produï¿½ï¿½o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] Conexï¿½o WhatsApp bloqueada para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sessï¿½es do WhatsApp em produï¿½ï¿½o nï¿½o serï¿½o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessï¿½es em produï¿½ï¿½o.');
  }

  const ownership = await shouldSkipConnectionForCurrentRuntime(userId, targetConnectionId);
  if (ownership.connection && ownership.skip) {
    if (!isWhatsAppGatewayRuntime() && ownership.owner === "gateway") {
      await connectGatewayInstance(ownership.connection.id);
      return;
    }
    throw new Error(`Connection ${ownership.connection.id} is owned by ${ownership.owner}`);
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
  
  // ? Verificar se jï¿½ existe uma conexï¿½o em andamento
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

  // ?? Resetar contador de tentativas de reconexï¿½o quando usuï¿½rio inicia conexï¿½o manualmente
  if (shouldResetReconnectAttemptsForSource(connectSource)) {
    reconnectAttempts.delete(lockKey);
  }

  // ?? CRï¿½TICO: Criar e registrar a promise IMEDIATAMENTE para evitar race conditions
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
  
  // Registrar ANTES de qualquer operaï¿½ï¿½o async ï¿½ now with metadata
  const pendingStartedAt = Date.now();
  const pendingEntry: PendingConnectionEntry = {
    promise: connectionPromise,
    startedAt: pendingStartedAt,
    expiresAt: computePendingConnectionExpiresAt(
      pendingStartedAt,
      effectiveOpenTimeoutMs,
      PENDING_LOCK_TTL_MS,
      WA_REDIS_PENDING_LOCK_EXTRA_MS,
    ),
    connectionId: targetConnectionId,
    userId,
    distributedLock,
  };
  pendingConnections.set(lockKey, pendingEntry);
  if (pendingEntry.distributedLock) {
    registerDistributedPendingLockRefresh(lockKey, pendingEntry, distributedLockTtlMs);
  }
  console.log(`[CONNECT] Registered pending connection for user ${userId}${targetConnectionId ? ` (connectionId: ${targetConnectionId})` : ''}`);

  // Agora executar a lï¿½gica de conexï¿½o
  (async () => {
    try {
      console.log(`[CONNECT] Starting connection for user ${userId}${targetConnectionId ? ` connectionId=${targetConnectionId}` : ''}...`);
      
      // Verificar se jï¿½ existe uma sessï¿½o ativa para esta conexï¿½o especï¿½fica
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
          // Sessï¿½o existe mas nï¿½o estï¿½ conectada - limpar e recriar
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

    if (isUserRemovedConnection(connection)) {
      console.log(`[CONNECT] Connection ${connection.id.substring(0, 8)} was removed from the app; skipping reconnect`);
      clearPendingConnectionLock(lockKey, "removed_connection");
      settleConnectionPromise(
        "reject",
        "removed_connection",
        new Error(`Connection ${connection.id} was removed from the app`),
      );
      return;
    }

    if (isManualDisconnectAutoReconnectBlocked(connection)) {
      if (shouldRespectManualDisconnectBlock(connectSource)) {
        console.log(
          `[CONNECT] Connection ${connection.id.substring(0, 8)} was manually disconnected; skipping automated reconnect from ${connectSource}`,
        );
        clearPendingConnectionLock(lockKey, "manual_disconnect_blocked");
        const manualDisconnectError = new Error(
          `Connection ${connection.id} was manually disconnected and is waiting for user reconnect`,
        );
        (manualDisconnectError as any).code = "WA_MANUAL_DISCONNECT_BLOCKED";
        settleConnectionPromise("reject", "manual_disconnect_blocked", manualDisconnectError);
        return;
      }

      connection.providerConfig = clearManualDisconnectProviderConfig(connection);
      await storage.updateConnection(connection.id, {
        providerConfig: connection.providerConfig as any,
      });
    }

    if (shouldPauseAutomatedReconnectWhileAwaitingPairing(connectSource)) {
      const pairingCooldownRemainingMs = getPairingRequiredCooldownRemainingMs(connection);
      if (pairingCooldownRemainingMs > 0) {
        const cooldownError = new Error(
          `Reconnect blocked while awaiting QR scan (${Math.ceil(pairingCooldownRemainingMs / 1000)}s remaining, source=${connectSource})`,
        );
        (cooldownError as any).code = "WA_PAIRING_REQUIRED_COOLDOWN";
        throw cooldownError;
      }
    }

    const resolvedAuth = await resolveConnectionAuthScope(userId, connection, connection.id);
    const userAuthPath =
      resolvedAuth.path || path.join(SESSIONS_BASE, `auth_${connection.id || userId}`);

    await ensureDirExists(userAuthPath);

    let authFileCount = 0;
    try {
      const authFiles = await fs.readdir(userAuthPath);
      authFileCount = authFiles.length;
    } catch {
      // dir doesn't exist yet - ensureDirExists above handles first-link case
    }

    const authLabel = path.basename(userAuthPath);
    console.log(
      `[CONNECT] Auth scope resolved for conn ${connection.id.substring(0, 8)}: ${resolvedAuth.scopeKey || "fallback"} -> ${authLabel} (${authFileCount > 0 ? `${authFileCount} files` : "EMPTY - will show QR"})`,
    );
    
    const { state, saveCreds } = await useBaileysAuthState(userAuthPath);

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
    console.log(
      `[CONNECT] History sync mode for conn ${connection.id.substring(0, 8)}: fullSync=${shouldEnableFullHistorySync} recoverRecent=true`,
    );

    const waSocketVersion = await resolveWaSocketVersion("connectWhatsApp");
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      // FIX 2026-02: Custom CTWA-intercepting logger
      // Captures CTWA/PDO/placeholder debug messages from Baileys while keeping other logs silent
      logger: ctwaLogger as any,
      // ======================================================================
      // ?? FIX 2025: SINCRONIZAï¿½ï¿½O COMPLETA DE CONTATOS DA AGENDA
      // ======================================================================
      // IMPORTANTE: Estas configuraï¿½ï¿½es fazem o Baileys receber TODOS os
      // contatos da agenda do WhatsApp na PRIMEIRA conexï¿½o apï¿½s scan do QR.
      //
      // 1. browser: Browsers.macOS('Desktop') - Emula conexï¿½o desktop para
      //    receber histï¿½rico completo (mais contatos e mensagens)
      // 2. syncFullHistory: true - Habilita sync completo de contatos e histï¿½rico
      // 3. shouldSyncHistoryMessage: () => true - Necessï¿½rio apï¿½s atualizaï¿½ï¿½o
      //    do Baileys (master 2026-02) que mudou o default para pular FULL sync
      //
      // O evento contacts.upsert serï¿½ disparado com TODOS os contatos logo
      // apï¿½s o QR Code ser escaneado e conexï¿½o estabelecida.
      // Ref: https://github.com/WhiskeySockets/Baileys/issues/266
      // ======================================================================
      browser: Browsers.macOS('Desktop'),
      // -----------------------------------------------------------------------
      // FIX 2026-02-24: WhatsApp rejeitou Platform.WEB (405 error)
      // Versï¿½o fixa que funciona com Platform.MACOS
      // Ref: https://github.com/WhiskeySockets/Baileys/issues/2370
      // -----------------------------------------------------------------------
      version: waSocketVersion,
      // -----------------------------------------------------------------------
      // FIX 2026-02-24: Estabilidade de conexï¿½o para SaaS multi-session
      // connectTimeoutMs: Aumentado para 60s (auth com 3000+ files demora)
      // keepAliveIntervalMs: 25s heartbeat (evita 408 timeout com 70+ sessï¿½es)
      // retryRequestDelayMs: Retry rï¿½pido de requests falhados
      // -----------------------------------------------------------------------
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 250,
      syncFullHistory: shouldEnableFullHistorySync,
      shouldSyncHistoryMessage: ({ syncType }) =>
        shouldSyncHistoryMessageType(syncType, shouldEnableFullHistorySync),
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
            // FIX 2026: Retornar proto.IMessage completo quando disponï¿½vel
            // Para mï¿½dia, o formato { conversation: text } nï¿½o funciona no retry
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
      hadAuthBeforeConnect: resolvedAuth.hasCreds || authFileCount > 0,
      phoneNumberBeforeConnect: typeof connection.phoneNumber === "string" ? connection.phoneNumber : null,
      providerStatusBeforeConnect: typeof connection.providerStatus === "string" ? connection.providerStatus : null,
    };

    // ?? MULTI-CONNECTION: Store by connectionId (SessionMap handles userId lookups)
    sessions.set(connection.id, session);

    // Failsafe para nï¿½o manter lock/promise indefinidamente quando "open" nunca chega.
    connectionOpenTimeout = setTimeout(() => {
      const currentSession = sessions.get(session.connectionId);
      if (currentSession?.socket !== sock || currentSession?.isOpen === true) {
        return;
      }

      if (currentSession && promoteSessionOpenState(currentSession, "open_timeout_socket_ready")) {
        const phoneNumber = sock.user?.id?.split(":")[0] || currentSession.phoneNumber || "";
        currentSession.phoneNumber = phoneNumber;
        clearPendingConnectionLock(session.connectionId, "open_timeout_socket_ready");
        clearPendingConnectionLock(userId, "open_timeout_socket_ready");
        clearOpenTimeoutCooldown(session.connectionId, "open_timeout_socket_ready");
        clearOpenTimeoutCooldown(userId, "open_timeout_socket_ready");
        void (async () => {
          const openTimeoutExtras: Record<string, unknown> = {
            phoneNumber,
            qrCode: null,
          };
          const reconnectBacklogSessionData = await buildReconnectBacklogCutoffSessionData(
            currentSession,
            connectSource,
            connection.sessionData,
          );
          if (reconnectBacklogSessionData) {
            openTimeoutExtras.sessionData = reconnectBacklogSessionData as any;
          }
          await storage.updateConnection(
            session.connectionId,
            buildBaileysConnectionStatePatch(true, openTimeoutExtras),
          );
        })().catch((promoteDbErr) => {
            console.error(
              `[CONNECT] Failed to persist open-timeout socket-ready promotion for ${session.connectionId}:`,
              promoteDbErr,
            );
          });
        broadcastToUser(userId, { type: "connected", phoneNumber, connectionId: session.connectionId });
        settleConnectionPromise("resolve", "open_timeout_socket_ready");
        return;
      }

      const timeoutError = new Error(`Connection did not reach open within ${effectiveOpenTimeoutMs}ms`);
      console.log(`?? [CONNECT] OPEN TIMEOUT for user ${userId.substring(0, 8)}... conn ${session.connectionId.substring(0, 8)} ï¿½ closing socket`);
      registerOpenTimeoutCooldown(session.connectionId, "open_timeout");
      registerOpenTimeoutCooldown(userId, "open_timeout");
      clearPendingConnectionLock(session.connectionId, 'connect_open_timeout');
      clearPendingConnectionLock(userId, 'connect_open_timeout');
      void recordConnectionAuditEvent(session.connectionId, {
        kind: "open_timeout",
        source: options?.source || "connect_open_timeout",
        details: {
          userId,
          connectionId: session.connectionId,
          timeoutMs: effectiveOpenTimeoutMs,
        },
      });
      try {
        sock.end(timeoutError);
      } catch (_endErr) {
        // noop
      }
      sessions.delete(session.connectionId);
      memoryCache.invalidate(`api:wa-conn:${userId}`);
      memoryCache.invalidate(`api:wa-conn:${userId}:default`);
      memoryCache.invalidate(`api:wa-conn:${userId}:${session.connectionId}`);
      broadcastToUser(userId, {
        type: "disconnected",
        reason: "open_timeout",
        connectionId: session.connectionId,
        qr: null,
        qrCode: null,
        qrCodeGeneratedAt: null,
      });
      void (async () => {
        await storage.updateConnection(
          session.connectionId,
          buildBaileysConnectionStatePatch(false, { qrCode: null }),
        );
      })()
        .catch((openTimeoutDbErr) => {
          console.error(
            `[CONNECT] Failed to persist open-timeout disconnect for ${session.connectionId}:`,
            openTimeoutDbErr,
          );
        });
      settleConnectionPromise("reject", "open_timeout", timeoutError);
    }, effectiveOpenTimeoutMs);
    session.openTimeout = connectionOpenTimeout;
    
    // ?? Registrar sessï¿½o no serviï¿½o de envio para notificaï¿½ï¿½es do sistema (delivery, etc)
    registerWhatsAppSession(userId, connection.id, sock);

    // ======================================================================
    // FIX LID 2025 - CACHE WARMING (Carregar contatos do DB para mem?ria)
    // ======================================================================
    // Previne race condition: mensagens @lid chegam antes de contacts.upsert
    const skipRestoreContactCacheWarming =
      connectSource === "restore" && isRestoringInProgress() && RESTORE_SKIP_CONTACT_CACHE_WARMING;
    if (skipRestoreContactCacheWarming) {
      console.log(
        `[CACHE WARMING] Skipped during startup restore for conn ${connection.id.substring(0, 8)} to keep database/auth responsive`,
      );
    } else {
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
    }

    // ======================================================================
    // ?? CONTACTS SYNC - SINCRONIZAï¿½ï¿½O COMPLETA DA AGENDA DO WHATSAPP
    // ======================================================================
    // IMPORTANTE: Este evento ï¿½ disparado pelo Baileys com TODOS os contatos
    // da agenda do WhatsApp na PRIMEIRA conexï¿½o apï¿½s scan do QR Code.
    //
    // Com a configuraï¿½ï¿½o browser: Browsers.macOS('Desktop') + syncFullHistory: true,
    // o Baileys emula uma conexï¿½o desktop que recebe histï¿½rico completo.
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
      console.log(`?? [CONTACTS.UPSERT] ï¿½ltimo contato: ${contacts[contacts.length - 1]?.id || 'N/A'}`);
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
        // Extrair nï¿½mero do contact.id quando phoneNumber nï¿½o vem preenchido
        const normalizedContactId = normalizeWhatsAppIdentity(contact.id);
        const storedPhoneNumber = deriveStoredPhoneNumber(
          normalizedContactId,
          contact.phoneNumber,
        );
        const agendaPhoneNumber = extractPhoneDigitsFromWhatsAppIdentity(
          storedPhoneNumber,
        );

        // 1. Atualizar cache em memï¿½ria da sessï¿½o (para resolver @lid)
        contactsCache.set(contact.id, contact);
        if (contact.lid) {
          contactsCache.set(contact.lid, contact);
        }

        // 2. Preparar para salvar no banco de dados
        dbContacts.push({
          connectionId: connection.id,
          contactId: normalizedContactId || contact.id,
          lid: contact.lid || undefined,
          phoneNumber: storedPhoneNumber || undefined,
          name: contact.name || contact.notify || undefined,
        });

        // 3. Adicionar ao array de agenda (se tiver nï¿½mero vï¿½lido)
        if (
          agendaPhoneNumber &&
          agendaPhoneNumber.length >= 8 &&
          !isGroupWhatsAppJid(normalizedContactId)
        ) {
          newAgendaContacts.push({
            id: normalizedContactId || contact.id,
            phoneNumber: agendaPhoneNumber,
            name: contact.name || contact.notify || '',
            lid: contact.lid,
          });
        }
      }

      // 4. PERSISTIR NO BANCO DE DADOS - IMPORTANTE!
      // Salvar contatos no banco para nï¿½o perder em restart
      try {
        if (dbContacts.length > 0) {
          await storage.batchUpsertContacts(dbContacts);
          console.log(`?? [CONTACTS.UPSERT] ?? Salvou ${dbContacts.length} contatos no banco de dados`);

          const lidRepairs = dbContacts
            .map((dbContact) => {
              const lid = normalizeWhatsAppIdentity(dbContact.lid);
              const phoneJid = normalizeWhatsAppIdentity(dbContact.phoneNumber);
              const phoneDigits = extractPhoneDigitsFromWhatsAppIdentity(phoneJid);
              const lidDigits = extractPhoneDigitsFromWhatsAppIdentity(lid);

              if (!lid || !phoneJid || !phoneDigits || !lidDigits || phoneJid.endsWith("@lid")) {
                return null;
              }

              return {
                lid,
                lidDigits,
                phoneJid,
                phoneDigits,
                name: dbContact.name,
              };
            })
            .filter((repair): repair is {
              lid: string;
              lidDigits: string;
              phoneJid: string;
              phoneDigits: string;
              name?: string;
            } => Boolean(repair));

          for (const repair of lidRepairs) {
            const staleConversations = await db
              .select({
                id: conversations.id,
                contactNumber: conversations.contactNumber,
                remoteJid: conversations.remoteJid,
                contactName: conversations.contactName,
              })
              .from(conversations)
              .where(and(
                eq(conversations.connectionId, connection.id),
                or(
                  eq(conversations.remoteJid, repair.lid),
                  eq(conversations.contactNumber, repair.lidDigits),
                ),
              ))
              .limit(10);

            for (const staleConversation of staleConversations) {
              await storage.updateConversation(staleConversation.id, {
                contactNumber: repair.phoneDigits,
                remoteJid: repair.phoneJid,
                jidSuffix: DEFAULT_JID_SUFFIX,
                contactName: staleConversation.contactName || repair.name || repair.phoneDigits,
              });
              console.log(
                `[LID REPAIR] Conversa ${staleConversation.id} atualizada de ${repair.lid} para ${repair.phoneJid}`,
              );
            }
          }
        }
      } catch (dbError) {
        console.error(`?? [CONTACTS.UPSERT] ? Erro ao salvar contatos no DB:`, dbError);
      }

      // 5. IMPORTANTE: Mesclar com contatos existentes no cache (acumula mï¿½ltiplas batches)
      // O Baileys pode emitir contacts.upsert mï¿½ltiplas vezes durante a sincronizaï¿½ï¿½o inicial
      const existingCache = getAgendaContacts(userId);
      const existingContacts = existingCache?.contacts || [];
      const existingPhones = new Set(existingContacts.map(c => c.phoneNumber));

      // Filtrar apenas contatos novos (evitar duplicatas)
      const uniqueNewContacts = newAgendaContacts.filter(c => !existingPhones.has(c.phoneNumber));
      const mergedContacts = [...existingContacts, ...uniqueNewContacts];

      if (mergedContacts.length > 0) {
        saveAgendaToCache(userId, mergedContacts);

        // Broadcast para o frontend informando que os contatos estï¿½o prontos
        broadcastToUser(userId, {
          type: "agenda_synced",
          count: mergedContacts.length,
          status: "ready",
          message: `?? ${mergedContacts.length} contatos sincronizados da agenda!`
        });

        console.log(`?? [CONTACTS.UPSERT] ? Novos: ${uniqueNewContacts.length} | Total no cache: ${mergedContacts.length}`);
      } else {
        console.log(`?? [CONTACTS.UPSERT] ?? Nenhum contato vï¿½lido encontrado nesta batch`);
      }
    });

    // ======================================================================
    // ?? HISTORY SYNC - BUSCA TODOS OS CONTATOS DO HISTï¿½RICO DO WHATSAPP
    // ======================================================================
    // Este evento ï¿½ disparado durante o sync inicial e traz TODOS os contatos
    // do histï¿½rico do WhatsApp (chats, contacts, messages)
    // Ref: https://baileys.wiki/docs/socket/history-sync/
    // ======================================================================
    sock.ev.on("messaging-history.set", async ({ chats, contacts, messages, isLatest, syncType, peerDataRequestSessionId }) => {
      const hasPendingGroupHistorySync = hasPendingGroupHistorySyncForConnection(connection.id);
      const hasPendingConversationHistorySync = hasPendingConversationHistorySyncForConnection(connection.id);
      const shouldHandleHistorySync = shouldSyncHistoryMessageType(syncType, shouldEnableFullHistorySync);
      const historySyncTypeLabel = describeHistorySyncType(syncType);

      if (!shouldHandleHistorySync && !hasPendingGroupHistorySync && !hasPendingConversationHistorySync) {
        return;
      }

      if (hasPendingGroupHistorySync) {
        await processPendingGroupHistorySyncMessages(session, peerDataRequestSessionId, messages);
      }
      if (hasPendingConversationHistorySync) {
        await processPendingConversationHistorySyncMessages(session, peerDataRequestSessionId, messages);
      }

      console.log(`\n========================================`);
      console.log(`[HISTORY SYNC] ?? Baileys emitiu messaging-history.set`);
      console.log(`[HISTORY SYNC] User ID: ${userId}`);
      console.log(`[HISTORY SYNC] syncType: ${historySyncTypeLabel}`);
      console.log(`[HISTORY SYNC] Chats: ${chats?.length || 0}`);
      console.log(`[HISTORY SYNC] Contacts: ${contacts?.length || 0}`);
      console.log(`[HISTORY SYNC] Messages: ${messages?.length || 0}`);
      console.log(`[HISTORY SYNC] isLatest: ${isLatest}`);
      console.log(`========================================\n`);

      // -------------------------------------------------------------------------
      // FIX 2026: Processar mensagens RECENTES do history sync para auto-resposta
      // Mensagens que chegaram durante desconexï¿½o precisam ser processadas
      // -------------------------------------------------------------------------
      if (messages && messages.length > 0) {
        const now = Date.now();
        let recoveredCount = 0;
        let displayImportedCount = 0;
        const conversationsToTrigger = new Set<string>();

        for (const msg of messages) {
          if (!msg || !msg.key) continue;
          if (!msg.key.remoteJid || msg.key.remoteJid.includes("@g.us") || msg.key.remoteJid.includes("@broadcast")) continue;
          if (!msg.message) continue;

          const msgTs = Number(msg.messageTimestamp) * 1000;
          const eventTs = Number.isFinite(msgTs) && msgTs > 0 ? new Date(msgTs) : new Date();
          const ageMs = Math.max(0, now - eventTs.getTime());

          if (!shouldPersistRecoveredHistoryMessage({ syncType, ageMs })) {
            continue;
          }

          if (msg.key.id && msg.message) {
            cacheMessage(userId, msg.key.id, msg.message);
          }

          try {
            const shouldTriggerAutoReply =
              !msg.key.fromMe && shouldAutoReplyRecoveredHistoryMessage({ syncType, ageMs });

            if (msg.key.fromMe) {
              await handleOutgoingMessage(session, msg as any, {
                isHistorySync: !shouldTriggerAutoReply,
                eventTs,
              });
            } else {
              await handleIncomingMessage(session, msg as any, {
                source: shouldTriggerAutoReply ? "notify" : "history_sync",
                allowAutoReply: false,
                isHistorySync: !shouldTriggerAutoReply,
                eventTs,
              });
            }
            recoveredCount++;
            if (!shouldTriggerAutoReply) {
              displayImportedCount++;
            }
          } catch (historyRecoveryErr) {
            console.error(`[HISTORY SYNC] Falha ao recuperar mensagem ${msg.key.id || "sem-id"}:`, historyRecoveryErr);
            continue;
          }

          if (msg.key.fromMe || !shouldAutoReplyRecoveredHistoryMessage({ syncType, ageMs })) {
            continue;
          }

          if (shouldSuppressAutoReplyForQrReconnectBacklog(connection, eventTs, session)) {
            console.log(
              `[QR BACKLOG] History sync salvo sem IA para msg anterior ao QR reconnect (conn=${session.connectionId.substring(0, 8)})`,
            );
            continue;
          }

          const candidateContactNumber = cleanContactNumber(
            ((msg.key as any).remoteJidAlt as string | undefined) || msg.key.remoteJid,
          );
          if (!candidateContactNumber) {
            continue;
          }

          try {
            const candidateConversation = await storage.getActiveConversationByContactNumber(
              session.connectionId,
              candidateContactNumber,
            );
            if (candidateConversation?.id) {
              conversationsToTrigger.add(candidateConversation.id);
            }
          } catch (historyLookupErr) {
            console.error(
              `[HISTORY SYNC] Falha ao localizar conversa recuperada para ${candidateContactNumber}:`,
              historyLookupErr,
            );
          }
        }

        for (const conversationId of conversationsToTrigger) {
          try {
            await triggerAgentResponseForConversation(session.userId, conversationId);
          } catch (historyTriggerErr) {
            console.error(`[HISTORY SYNC] Falha ao disparar IA para conversa ${conversationId}:`, historyTriggerErr);
          }
        }

        if (recoveredCount > 0 || conversationsToTrigger.size > 0) {
          console.log(
            `[HISTORY SYNC] ?? ${recoveredCount} mensagens recuperadas (${historySyncTypeLabel}); ${displayImportedCount} salvas so para historico; ${conversationsToTrigger.size} conversa(s) reenfileirada(s) para IA`,
          );
        }
      }

      if (!shouldEnableFullHistorySync) {
        return;
      }

      // Processar contatos do histï¿½rico
      if (contacts && contacts.length > 0) {
        const agendaContacts: AgendaContact[] = [];

        for (const contact of contacts) {
          // Extrair nï¿½mero do contact.id
          let phoneNumber: string | null = null;

          // Tentar pegar do phoneNumber primeiro
          if (contact.id) {
            const match = contact.id.match(/^(\d+)@/);
            if (match && match[1].length >= 8) {
              phoneNumber = match[1];
            }
          }

          if (phoneNumber) {
            // Adicionar ao cache da sessï¿½o
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
            message: `?? ${mergedContacts.length} contatos sincronizados do histï¿½rico!`
          });
        }
      }

      // Processar chats para extrair contatos adicionais
      if (chats && chats.length > 0) {
        const chatContacts: AgendaContact[] = [];

        for (const chat of chats) {
          // Ignorar grupos
          if (chat.id?.endsWith('@g.us')) continue;

          // Extrair nï¿½mero do chat.id
          const match = chat.id?.match(/^(\d+)@/);
          if (match && match[1].length >= 8) {
            const phoneNumber = match[1];

            // Verificar se jï¿½ nï¿½o estï¿½ no cache
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

    sock.ev.on("creds.update", async (creds) => {
      await saveCreds(creds);
      scheduleWhatsAppSessionSnapshot(userAuthPath, "customer-creds-update");
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection: conn, lastDisconnect, qr } = update;

      try {

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
          const implicitOpenExtras: Record<string, unknown> = {
            phoneNumber,
            qrCode: null,
          };
          const reconnectBacklogSessionData = await buildReconnectBacklogCutoffSessionData(
            session,
            connectSource,
            connection.sessionData,
          );
          if (reconnectBacklogSessionData) {
            implicitOpenExtras.sessionData = reconnectBacklogSessionData as any;
          }
          await storage.updateConnection(
            session.connectionId,
            buildBaileysConnectionStatePatch(true, implicitOpenExtras),
          );
        } catch (implicitOpenDbErr) {
          console.error(`[CONNECTION UPDATE] Failed to persist implicit open for ${session.connectionId}:`, implicitOpenDbErr);
        }
        broadcastToUser(userId, { type: "connected", phoneNumber, connectionId: session.connectionId });
        console.log(`? [CONN OPEN FALLBACK] Promoted ${session.connectionId.substring(0, 8)} via connection=undefined + socket.user`);
      }

      // Log adicional em caso de close para diagnï¿½stico
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

        // Logar amostra dos arquivos de auth sem varrer diretï¿½rio inteiro
        // (evita overhead alto quando hï¿½ dezenas de milhares de arquivos).
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
        session.qrIssuedAt = Date.now();
        session.qrConnectSource = connectSource;
        try {
          const qrCodeDataURL = await QRCode.toDataURL(qr);
          const qrCodeGeneratedAt = new Date().toISOString();
          session.lastQrCodeDataUrl = qrCodeDataURL;
          session.lastQrCodeGeneratedAt = qrCodeGeneratedAt;
          console.log(`[QR CODE] QR Code generated successfully for user ${userId}, length: ${qrCodeDataURL.length}`);

          // Broadcast immediately so the client sees the QR without waiting
          // for the database write. Persist the QR asynchronously to avoid
          // making the user wait on potentially slow DB operations.
          try {
            broadcastToUser(userId, { type: "qr", qr: qrCodeDataURL, qrCodeGeneratedAt, connectionId: connection.id });
            console.log(`[QR CODE] QR Code broadcasted to user ${userId} (connection: ${connection.id})`);
          } catch (bErr) {
            console.error(`[QR CODE ERROR] Failed to broadcast QR code for user ${userId}:`, bErr);
          }

          const saveStart = Date.now();
          (async () => {
            const latestConnection = await storage.getConnectionById(session.connectionId);
            const sessionData = mergeConnectionQrMetadata(latestConnection?.sessionData, {
              at: qrCodeGeneratedAt,
              source: "baileys_qr",
              details: {
                userId,
                connectionId: session.connectionId,
              },
            });

            await storage.updateConnection(session.connectionId, {
              qrCode: qrCodeDataURL,
              sessionData: sessionData as any,
            });

            // Opening can race with the async QR write or occur on a replacement
            // socket. If the line is already open, ensure the persisted QR also
            // produces a backlog cutoff before any recovered message is answered.
            const connectionAfterQrSave = await storage.getConnectionById(session.connectionId);
            if (session.connectedAt || connectionAfterQrSave?.isConnected) {
              const cutoffSessionData = await buildQrReconnectCutoffSessionData(
                session,
                connectSource,
                sessionData,
              );
              if (cutoffSessionData) {
                await storage.updateConnection(session.connectionId, {
                  qrCode: null,
                  sessionData: cutoffSessionData as any,
                });
              }
            }
          })()
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

      // Estado "connecting" - quando o QR Code foi escaneado e estï¿½ conectando
      if (conn === "connecting") {
        console.log(`User ${userId} is connecting... (connection: ${connection.id})`);
        broadcastToUser(userId, { type: "connecting", connectionId: connection.id });
      }

      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorMsg = (lastDisconnect?.error as any)?.message || '';
        const plannedSessionReason = session.shutdownReason;
        if (plannedSessionReason === "phone_conflict_other_user") {
          console.log(
            `[PHONE OWNERSHIP] Encerrando ${connection.id.substring(0, 8)}... sem reconnect porque o numero pertence a outra conta ativa.`,
          );
          if (session.openTimeout) {
            clearTimeout(session.openTimeout);
            session.openTimeout = undefined;
          }
          session.isOpen = false;
          sessions.delete(session.connectionId);
          clearPendingConnectionLock(session.connectionId, "phone_conflict_other_user");
          clearPendingConnectionLock(userId, "phone_conflict_other_user");
          settleConnectionPromise(
            "reject",
            "phone_conflict_other_user",
            new Error("Phone conflict with another active user"),
          );
          await storage.updateConnection(session.connectionId, {
            isConnected: false,
            providerStatus: "phone_conflict_other_user",
            qrCode: null,
          });
          broadcastToUser(userId, {
            type: "disconnected",
            reason: "phone_conflict_other_user",
            connectionId: connection.id,
          });
          reconnectAttempts.delete(connection.id);
          session.shutdownReason = undefined;
          return;
        }
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
          await storage.updateConnection(
            connection.id,
            buildBaileysConnectionStatePatch(false, { qrCode: null }),
          );
          broadcastToUser(userId, { type: "disconnected", reason: "connection_replaced", connectionId: connection.id });
          reconnectAttempts.delete(connection.id);
          return; // EXIT ï¿½ do NOT reconnect
        }

        // -----------------------------------------------------------------------
        // ?? GUARD CONTRA SOCKET STALE
        // -----------------------------------------------------------------------
        // Um socket "antigo" pode fechar depois que um socket mais novo jï¿½ conectou.
        // Se processarmos o close do socket antigo, vamos apagar a sessï¿½o nova e
        // marcar isConnected=false no banco, mesmo com o socket ativo.
        //
        // Soluï¿½ï¿½o: verificar se este sock ainda ï¿½ o socket atual antes de tomar
        // aï¿½ï¿½es destrutivas (delete, update DB, reconnect).
        // -----------------------------------------------------------------------
        const currentSession = sessions.get(connection.id);

        if (currentSession?.socket !== sock) {
          console.log(`[CONNECTION CLOSE] ?? STALE SOCKET IGNORED - Connection ${connection.id.substring(0, 8)}... User ${userId.substring(0, 8)}...`);
          console.log(`[CONNECTION CLOSE] Current socket differs from closing socket, ignoring close event`);
          // FIX 2026-05-27: Do NOT settle the promise here. This close event belongs
          // to a stale (old) socket ï¿½ the current socket is still alive and its own
          // event handlers will resolve or reject its promise in due course.
          return;
        }

        if (_isShuttingDown) {
          console.log(`[CONNECTION CLOSE] Planned shutdown active for conn ${session.connectionId.substring(0, 8)} - skipping DB disconnect/reconnect side effects`);
          if (session.openTimeout) {
            clearTimeout(session.openTimeout);
            session.openTimeout = undefined;
          }
          session.isOpen = false;
          sessions.delete(session.connectionId);
          clearPendingConnectionLock(session.connectionId, 'planned_shutdown');
          clearPendingConnectionLock(userId, 'planned_shutdown');
          settleConnectionPromise(
            "reject",
            "planned_shutdown",
            new Error(`Planned shutdown closed connection ${session.connectionId}`),
          );
          return;
        }

        // -----------------------------------------------------------------------
        // ??? SISTEMA DE RECUPERAï¿½ï¿½O: Registrar desconexï¿½o
        // -----------------------------------------------------------------------
        // Salvar evento de desconexï¿½o para diagnï¿½stico e recuperaï¿½ï¿½o
        try {
          const disconnectReason = (lastDisconnect?.error as any)?.message ||
                                   `statusCode: ${statusCode}`;
          await logConnectionDisconnection(userId, session.connectionId, disconnectReason);
        } catch (logErr) {
          console.error(`?? [RECOVERY] Erro ao logar desconexï¿½o:`, logErr);
        }

        // Sempre deletar a sessï¿½o primeiro (sï¿½ se for o socket atual, verificado acima)
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

        // Atualizar banco de dados - conexï¿½o principal
        await storage.updateConnection(
          session.connectionId,
          buildBaileysConnectionStatePatch(false, { qrCode: null }),
        );

        // NOTE: In multi-connection mode, we do NOT sync other connections as disconnected.
        // Each connection has its own socket and lifecycle.

        // -----------------------------------------------------------------------
        // ??? RECONEXï¿½O INTELIGENTE: Sï¿½ reconecta se a sessï¿½o tinha auth vï¿½lido
        // Verifica cred_*.json no disco ï¿½ sem creds = sessï¿½o nunca completou pareamento
        // Contador ABSOLUTO com back-off exponencial (NUNCA reseta)
        // -----------------------------------------------------------------------
        const reconnectKey = session.connectionId;
        let attempt = reconnectAttempts.get(reconnectKey) || { count: 0, lastAttempt: 0 };

        if (shouldReconnect) {
          const connectionRecord = await storage.getConnectionById(session.connectionId);
          const siblingConnections = connectionRecord
            ? await storage.getConnectionsByUserId(userId)
            : [];
          const resolvedAuth = await resolveConnectionAuthScope(userId, connectionRecord, session.connectionId);
          const recoveryDecision = connectionRecord
            ? canConnectionAutoRecoverUsingResolvedAuthScope(
                userId,
                connectionRecord,
                siblingConnections,
                resolvedAuth,
              )
            : { allowed: resolvedAuth.hasCreds, reason: resolvedAuth.hasCreds ? "unknown_connection_record" : "no_auth" };
          // ?? Verificar se tem arquivos de auth vï¿½lidos no disco
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
              } catch { /* dir nï¿½o existe */ }
            }
          } catch { /* erro lendo disco */ }

          hasValidAuth = resolvedAuth.hasCreds;
          if (hasValidAuth && !recoveryDecision.allowed) {
            console.log(
              `[RECONNECT] User ${userId.substring(0,8)} conn ${session.connectionId.substring(0,8)} - auth compartilhado jÃ¡ reclamado por ${recoveryDecision.claimantId?.substring(0, 8) || "outra conexÃ£o"}. Abortando auto-reconnect para evitar conflito.`,
            );
            broadcastToUser(userId, { type: "disconnected", reason: "shared_auth_claimed", connectionId: session.connectionId });
            reconnectAttempts.delete(reconnectKey);
            return;
          }

          if (!hasValidAuth) {
            // Sem auth no disco = sessï¿½o nunca foi pareada com sucesso. Nï¿½O reconectar.
            console.log(`[RECONNECT] User ${userId.substring(0,8)} conn ${session.connectionId.substring(0,8)} - NO auth files on disk. Stopping reconnection (was never paired).`);
            broadcastToUser(userId, { type: "disconnected", reason: "no_auth", connectionId: session.connectionId });
            reconnectAttempts.delete(reconnectKey);
            await storage.updateConnection(session.connectionId, { qrCode: null });
          } else {
            // Tem auth ï¿½ reconectar com back-off exponencial (contador NUNCA reseta)
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
              scheduleConnectWhatsAppRetry(
                userId,
                session.connectionId,
                delayMs,
                "close_reconnect_backoff",
              );
            } else {
              console.log(`[RECONNECT] User ${userId.substring(0,8)} conn ${session.connectionId.substring(0,8)} - max fast reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Auth exists; scheduling slow recovery in ${Math.round(RECONNECT_LONG_TAIL_DELAY_MS / 1000)}s.`);
              broadcastToUser(userId, { type: "disconnected", reason: "slow_reconnect_scheduled", connectionId: session.connectionId });
              await storage.updateConnection(session.connectionId, { qrCode: null });
              scheduleConnectWhatsAppRetry(
                userId,
                session.connectionId,
                RECONNECT_LONG_TAIL_DELAY_MS,
                "close_reconnect_long_tail",
              );
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

          // Resetar tentativas de reconexï¿½o
          reconnectAttempts.delete(session.connectionId);

          // -----------------------------------------------------------------------
          // ?? AUTO-RETRY APï¿½S LOGOUT: Recuperar automaticamente se o usuï¿½rio estiver na tela
          // -----------------------------------------------------------------------
          // Quando hï¿½ um auth invï¿½lido no volume, o Baileys retorna loggedOut imediatamente.
          // Se o usuï¿½rio clicou em "Conectar" (tem WS client ativo), faremos um auto-retry
          // ï¿½nico para gerar o QR code sem exigir um segundo clique.
          // -----------------------------------------------------------------------
          const now = Date.now();
          const hasLiveClient = hasWebSocketClient(userId); // Cliente estï¿½ na tela
          const retryState = logoutAutoRetry.get(userId) || { count: 0, lastAttempt: 0 };

          // Resetar contador se passou do cooldown
          if (now - retryState.lastAttempt > LOGOUT_AUTO_RETRY_COOLDOWN_MS) {
            retryState.count = 0;
          }

          await recordConnectionAuditEvent(session.connectionId, {
            kind: "logout",
            source: "baileys_logged_out",
            details: {
              userId,
              connectionId: session.connectionId,
              statusCode: statusCode || null,
              hasLiveClient,
              autoRetryScheduled: hasLiveClient && retryState.count < MAX_LOGOUT_AUTO_RETRY,
            },
          });

          console.log(`[LOGOUT AUTO-RETRY] User ${userId.substring(0, 8)}... - hasLiveClient: ${hasLiveClient}, retryCount: ${retryState.count}/${MAX_LOGOUT_AUTO_RETRY}`);

          if (hasLiveClient && retryState.count < MAX_LOGOUT_AUTO_RETRY) {
            retryState.count++;
            retryState.lastAttempt = now;
            logoutAutoRetry.set(userId, retryState);

            console.log(`[LOGOUT AUTO-RETRY] Iniciando auto-retry para ${userId.substring(0, 8)}... conn ${session.connectionId.substring(0, 8)} em 750ms`);
            scheduleConnectWhatsAppRetry(
              userId,
              session.connectionId,
              750,
              "logout_auto_retry",
            );
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
          console.log(`? [CONN OPEN] Connection ${session.connectionId.substring(0, 8)} reached "open" ï¿½ timeout cleared`);
        }

        // Conexï¿½o estabelecida com sucesso - limpar pendentes
        // Nï¿½O resetar reconnectAttempts imediatamente ï¿½ sï¿½ apï¿½s 2min de estabilidade
        // Isso evita loop infinito: open?close?attempt1?open?close?attempt1...
        clearPendingConnectionLock(session.connectionId, 'conn_open');
        clearPendingConnectionLock(userId, 'conn_open');
        clearOpenTimeoutCooldown(session.connectionId, "conn_open");
        clearOpenTimeoutCooldown(userId, "conn_open");
        settleConnectionPromise("resolve", "conn_open");

        // Agendar reset do contador de reconexï¿½o apï¿½s 2 minutos de estabilidade
        const STABILITY_DELAY_MS = 120_000; // 2 min
        setTimeout(() => {
          // Sï¿½ reseta se este MESMO socket ainda estiver ativo
          const currentSess = sessions.get(session.connectionId);
          if (currentSess?.socket === sock) {
            reconnectAttempts.delete(session.connectionId);
            console.log(`[RECONNECT] Counter reset for conn ${session.connectionId.substring(0,8)} after ${STABILITY_DELAY_MS/1000}s stability`);
          }
        }, STABILITY_DELAY_MS);

        const phoneNumber = sock.user?.id?.split(":")[0] || "";
        const connectedAtIso = new Date(session.connectedAt || Date.now()).toISOString();
        session.phoneNumber = phoneNumber;

        const openStateExtras: Record<string, unknown> = {
          phoneNumber,
          qrCode: null,
        };
        const reconnectBacklogSessionData = await buildReconnectBacklogCutoffSessionData(
          session,
          connectSource,
          connection.sessionData,
        );
        const openSessionData = reconnectBacklogSessionData || connection.sessionData;
        openStateExtras.sessionData = mergeConnectionFreeTrialConnectionMetadata(openSessionData, connectedAtIso) as any;

        await storage.updateConnection(
          session.connectionId,
          buildBaileysConnectionStatePatch(true, openStateExtras),
        );

        const ownershipConnection = await ensureManagedPhoneConnectionContinuity({
          userId,
          connectionId: session.connectionId,
          runtimePhoneNumber: phoneNumber,
          runtimeIsConnected: true,
        });
        if (!ownershipConnection) {
          console.warn(
            `[PHONE OWNERSHIP] Encerrando ${session.connectionId.substring(0, 8)}... apos open porque o numero ${phoneNumber || "?"} pertence a outra conta ativa.`,
          );
          requestSessionShutdown(session, "phone_conflict_other_user");
          return;
        }

        await reconcileDuplicateConnectionsAfterOpen(
          userId,
          session.connectionId,
          phoneNumber,
        );

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
        // FIX 2026: Enviar presenceUpdate('available') apï¿½s conexï¿½o aberta
        // Sem isso, WhatsApp pode nï¿½o rotear mensagens novas pro Baileys
        // ---------------------------------------------------------------------
        try {
          await sock.sendPresenceUpdate('available');
          console.log(`? [PRESENCE] Status 'available' enviado para socket principal`);
        } catch (presErr) {
          console.error(`? [PRESENCE] Erro ao enviar presenï¿½a:`, presErr);
        }

        console.log(`\n?? [CONTACTS INFO] Aguardando contatos do Baileys...`);
        console.log(`   Contatos serï¿½o sincronizados automaticamente quando:`);
        console.log(`   1. Evento contacts.upsert do Baileys disparar`);
        console.log(`   2. Mensagens forem recebidas/enviadas`);
        console.log(`   Cache warming carregou ${contactsCache.size} contatos do DB\n`);

        const deferRestoreOpenSideJobs =
          connectSource === "restore" && isRestoringInProgress() && RESTORE_DEFER_OPEN_SIDE_JOBS;
        if (deferRestoreOpenSideJobs) {
          console.log(
            `[RESTORE] Deferred post-open DB side jobs for conn ${session.connectionId.substring(0, 8)} until restore completes`,
          );
        } else {
        
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
        // ?? SISTEMA DE RECUPERAï¿½ï¿½O: Processar mensagens pendentes
        // ======================================================================
        // Quando a conexï¿½o estabiliza, verificar se hï¿½ mensagens que chegaram
        // durante instabilidade/deploy e nï¿½o foram processadas
        // ======================================================================
        try {
          console.log(`?? [RECOVERY] Iniciando recuperaï¿½ï¿½o de mensagens pendentes para ${userId.substring(0, 8)}...`);
          await startMessageRecovery(userId, session.connectionId);
        } catch (recoveryError) {
          console.error(`?? [RECOVERY] Erro ao iniciar recuperaï¿½ï¿½o:`, recoveryError);
        }
        
        // ======================================================================
        // ? FIX: Processar timers de IA pendentes IMEDIATAMENTE apï¿½s reconexï¿½o
        // ======================================================================
        // Quando Connection Closed causou falha de envio, o timer fica pendente
        // no banco com retry de 5-30s. Ao reconectar, processar IMEDIATAMENTE
        // para que o cliente nï¿½o espere mais.
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
                  retryCount: timer.retryCount,
                };
                
                const delayMs = processed * 2000; // 2s entre cada para nï¿½o sobrecarregar
                rPending.timeout = schedulePendingResponseProcessing(
                  rPending,
                  delayMs,
                  `reconnect_recovery:${timer.contactNumber}`,
                );
                
                pendingResponses.set(timer.conversationId, rPending);
                processed++;
                
                if (processed >= 10) break; // Limitar a 10 por reconexï¿½o
              }
              
              if (processed > 0) {
                console.log(`? [RECONNECT-RECOVERY] ${processed} timers processados imediatamente apï¿½s reconexï¿½o`);
              }
            }
          } catch (recErr) {
            console.error(`? [RECONNECT-RECOVERY] Erro ao processar timers pendentes:`, recErr);
          }
        }, 3000); // 3s apï¿½s reconexï¿½o para dar tempo ao socket estabilizar
        
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

        // ======================================================================
        // ? SINCRONIZACAO AUTOMATICA DE CONTATOS
        // ======================================================================
        // Apos a conexao estabilizar, sincronizar contatos em background
        // sem notificar o cliente por WebSocket
        // ======================================================================
        setTimeout(async () => {
          try {
            console.log(`[SYNC] Iniciando sincronizacao automatica de contatos para ${userId.substring(0, 8)}...`);
            startBackgroundSync(userId, session.connectionId).catch(err => {
              console.error('[SYNC] Erro em background sync automatico:', err);
            });
          } catch (syncError) {
            console.error(`[SYNC] Erro ao disparar sync automatico:`, syncError);
          }
        }, 5000); // 5 segundos apos conexao
        }
      }
      } catch (connectionUpdateError) {
        console.error(
          `[CONNECTION UPDATE] Handler failed for ${session.connectionId.substring(0, 8)}...; runtime preservado sem derrubar o gateway:`,
          connectionUpdateError,
        );
      }
    });

    // ---------------------------------------------------------------------------
    // ---------------------------------------------------------------------------
    // HANDLER DE ATUALIZAï¿½ï¿½ES DE MENSAGENS (messages.update) v3.1
    // - Processa votos de enquete (poll updates)
    // - FIX 2026: Processa mensagens que chegam descriptografadas via retry
    //   (resolve "Aguardando mensagem" / "Waiting for this message")
    // - FIX 2026-02: Detecta CTWA placeholder resend requests (PR #2334)
    // ---------------------------------------------------------------------------
    sock.ev.on("messages.update", async (updates) => {
      for (const { key, update } of updates) {
        const statusSignal = getOutgoingMessageStatusSignal((update as any)?.status);
        if (statusSignal) {
          await applyRealtimeOutgoingMessageStatus({
            userId,
            targetMessageId: key.id,
            signal: statusSignal,
            source: "message_status_updated",
          });
        }

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
        // FIX 2026: Se uma mensagem que estava "pending" agora tem conteï¿½do,
        // cachear para retry e re-emitir como upsert para processamento
        // ---------------------------------------------------------------------
        const updateDecision = classifyRealtimeMessageUpdate({ key, update });
        if (updateDecision.action === "edit") {
          await applyRealtimeMessageEdit({
            userId,
            targetMessageId: updateDecision.targetMessageId,
            normalizedMessage: updateDecision.normalizedMessage,
            eventTs: update?.messageTimestamp
              ? new Date(Number(update.messageTimestamp) * 1000)
              : undefined,
          });
        } else if (updateDecision.action === "revoke") {
          await applyRealtimeMessageRevoke({
            userId,
            targetMessageId: updateDecision.targetMessageId,
            eventTs: update?.messageTimestamp
              ? new Date(Number(update.messageTimestamp) * 1000)
              : undefined,
          });
        } else if (updateDecision.action === "ignore") {
          console.log(`[MSG-UPDATE] Ignorando atualizacao ${updateDecision.reason} para ${key.id || "sem-id"}`);
        } else if (updateDecision.action === "reemit" && key.remoteJid && !key.fromMe) {
          const msgContent = updateDecision.normalizedMessage || (update as any).message;
          if (key.id && msgContent) {
            cacheMessage(userId, key.id, msgContent);
            console.log(`?? [MSG-UPDATE] Mensagem ${key.id} descriptografada via retry, re-emitindo como upsert`);
            console.log(`   ?? JID: ${key.remoteJid}`);
            console.log(`   ?? Tipo de conteï¿½do: ${Object.keys(msgContent).join(', ')}`);
            // Re-emitir como upsert notify para que seja processada normalmente
            // NOTA: O dedupe system permite reprocessamento pois stubs Nï¿½O sï¿½o marcados
            sock.ev.emit('messages.upsert', {
              type: 'notify',
              messages: [{
                key,
                message: msgContent,
                messageTimestamp: Math.floor(Date.now() / 1000),
                // Preservar pushName se disponï¿½vel no update
                pushName: (update as any).pushName || undefined,
              } as any],
            });
          }
        }

        // Verificar se ï¿½ um voto de enquete
        if (update.pollUpdates && update.pollUpdates.length > 0) {
          try {
            console.log(`??? [POLL-UPDATE v2.0] Recebido voto de enquete!`);
            console.log(`   ?? Poll ID: ${key.id}`);
            console.log(`   ?? JID: ${key.remoteJid}`);
            
            // Importar funï¿½ï¿½es de mapeamento de polls
            const { getButtonIdFromPollVote, getPollMapping } = await import('./centralizedMessageSender');
            
            // Obter mapping da enquete original
            const pollMapping = key.id ? getPollMapping(key.id) : null;
            
            if (!pollMapping) {
              console.log(`??? [POLL-UPDATE] Poll nï¿½o encontrado no mapeamento, ignorando...`);
              continue;
            }
            
            // Processar cada atualizaï¿½ï¿½o de voto usando getAggregateVotesInPollMessage
            for (const pollUpdate of update.pollUpdates) {
              const vote = pollUpdate.vote;
              
              // Verificar se hï¿½ opï¿½ï¿½es selecionadas
              if (!vote?.selectedOptions || vote.selectedOptions.length === 0) {
                console.log(`??? [POLL-UPDATE] Nenhuma opï¿½ï¿½o selecionada, pulando...`);
                continue;
              }
              
              console.log(`??? [POLL-UPDATE] Votos detectados. Buscando no mapeamento...`);
              console.log(`   ?? Opï¿½ï¿½es disponï¿½veis: ${pollMapping.buttons.map((b: any) => b.title || b.reply?.title).join(', ')}`);
              console.log(`   ?? Hashes selecionados: ${vote.selectedOptions.length}`);
              
              // ---------------------------------------------------------------
              // NOVA ABORDAGEM: Usar o primeiro hash SHA256 para encontrar opï¿½ï¿½o
              // Os hashes sï¿½o SHA256 dos textos das opï¿½ï¿½es
              // ---------------------------------------------------------------
              
              // Criar hash map das opï¿½ï¿½es do poll
              const crypto = await import('crypto');
              const optionHashMap = new Map<string, string>();
              
              pollMapping.buttons.forEach((btn: any) => {
                const title = btn.title || btn.reply?.title || '';
                const hash = crypto.createHash('sha256').update(title).digest('hex');
                optionHashMap.set(hash, title);
                console.log(`   ?? Hash: ${hash.substring(0, 16)}... ? "${title}"`);
              });
              
              // Tentar encontrar a opï¿½ï¿½o votada pelo hash
              let votedOptionText: string | null = null;
              
              for (const selectedHash of vote.selectedOptions) {
                // selectedOptions sï¿½o Buffer/Uint8Array - converter para hex
                const hashHex = Buffer.from(selectedHash).toString('hex');
                console.log(`   ?? Buscando hash: ${hashHex.substring(0, 16)}...`);
                
                if (optionHashMap.has(hashHex)) {
                  votedOptionText = optionHashMap.get(hashHex)!;
                  console.log(`   ? Encontrado! Opï¿½ï¿½o: "${votedOptionText}"`);
                  break;
                }
              }
              
              // Se nï¿½o encontrou pelo hash, usar a primeira opï¿½ï¿½o como fallback
              if (!votedOptionText) {
                console.log(`   ?? Hash nï¿½o encontrado, usando primeira opï¿½ï¿½o como fallback`);
                votedOptionText = pollMapping.buttons[0]?.title || pollMapping.buttons[0]?.reply?.title || '1';
              }
              
              // Criar mensagem fake com o texto da opï¿½ï¿½o votada
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

    sock.ev.on("message-receipt.update", async (receipts) => {
      for (const { key, receipt } of receipts) {
        const statusSignal = getOutgoingMessageStatusSignal(
          receipt?.playedTimestamp
            ? proto.WebMessageInfo.Status.PLAYED
            : receipt?.readTimestamp
              ? proto.WebMessageInfo.Status.READ
              : receipt?.receiptTimestamp
                ? proto.WebMessageInfo.Status.DELIVERY_ACK
                : undefined,
        );

        if (!statusSignal) {
          continue;
        }

        await applyRealtimeOutgoingMessageStatus({
          userId,
          targetMessageId: key.id,
          signal: statusSignal,
          source: "message_receipt_updated",
          participantJid: receipt?.userJid ? jidNormalizedUser(receipt.userJid) : null,
          receiptTimestamp: receipt?.receiptTimestamp ? Number(receipt.receiptTimestamp) : null,
          readTimestamp: receipt?.readTimestamp ? Number(receipt.readTimestamp) : null,
          playedTimestamp: receipt?.playedTimestamp ? Number(receipt.playedTimestamp) : null,
        });
      }
    });

    sock.ev.on("chats.update", async (updates) => {
      for (const chatUpdate of updates || []) {
        const chatJid = String((chatUpdate as any)?.id || "").trim();
        if (!chatJid || isBroadcastOrStatusJid(chatJid) || isGroupWhatsAppJid(chatJid)) {
          continue;
        }

        const fallbackTimestamp = (chatUpdate as any)?.conversationTimestamp;
        const rawMessages = Array.isArray((chatUpdate as any)?.messages)
          ? (chatUpdate as any).messages
          : [];
        let replayedMessages = 0;

        for (const rawMessage of rawMessages) {
          const message = normalizeChatUpdateMessage(chatJid, rawMessage, fallbackTimestamp);
          if (!message?.key?.id) {
            continue;
          }

          const remoteJid = message.key.remoteJid || chatJid;
          const messageTimestampMs = coerceBaileysTimestampMs((message as any).messageTimestamp);
          const hasValidTimestamp = Boolean(messageTimestampMs);
          const ageMs = messageTimestampMs ? Math.max(0, Date.now() - messageTimestampMs) : 0;
          const isRecent = !messageTimestampMs || ageMs <= CHAT_UPDATE_RECOVERY_RECENT_MS;
          const isRecoverableHistoryWindow =
            !messageTimestampMs || ageMs <= CHAT_UPDATE_RECOVERY_MAX_AGE_MS;

          if (!shouldReplayRealtimeChatUpdateMessage({
            remoteJid,
            fromMe: message.key.fromMe,
            messageId: message.key.id,
            isRecent,
            isRecoverableHistoryWindow,
            hasValidTimestamp,
          })) {
            continue;
          }

          const replayKey = `${session.connectionId}:${message.key.id}`;
          if (!rememberChatUpdateReplay(replayKey)) {
            continue;
          }

          scheduleChatUpdateMessageReplay({
            socket: sock,
            connectionId: session.connectionId,
            message,
            remoteJid,
            ageMs,
          });
          replayedMessages += 1;
        }

        if (replayedMessages > 0) {
          continue;
        }

        const chatTimestampMs = getChatUpdateTimestampMs(chatUpdate);
        const hasValidTimestamp = Boolean(chatTimestampMs);
        const ageMs = chatTimestampMs ? Math.max(0, Date.now() - chatTimestampMs) : 0;
        const isRecent = !chatTimestampMs || ageMs <= CHAT_UPDATE_RECOVERY_RECENT_MS;
        const isRecoverableHistoryWindow =
          !chatTimestampMs || ageMs <= CHAT_UPDATE_RECOVERY_MAX_AGE_MS;
        const unreadCount = getChatUpdateUnreadCount(chatUpdate);

        if (!shouldRequestRealtimeChatHistorySync({
          remoteJid: chatJid,
          unreadCount,
          isRecent,
          isRecoverableHistoryWindow,
          hasValidTimestamp,
        })) {
          continue;
        }

        try {
          const parsed = await parseRemoteJid(chatJid, session.contactsCache, session.connectionId);
          if (!parsed.contactNumber) {
            continue;
          }

          const conversation = await storage.getActiveConversationByContactNumber(
            session.connectionId,
            parsed.contactNumber,
          );
          if (!conversation) {
            console.log(
              `[CHAT-UPDATE] Sinal unread sem conversa ancora para ${chatJid}; ` +
                `criando pendencia visivel sem acionar IA`,
            );
            await ensureUnreadDirectChatPlaceholderFromUpdate({
              session,
              chatJid,
              chatUpdate,
              parsed,
              eventTs: chatTimestampMs ? new Date(chatTimestampMs) : new Date(),
              unreadCount,
            });
            continue;
          }

          scheduleDirectConversationHistoryRecovery({
            connectionId: conversation.connectionId,
            conversationId: conversation.id,
            contactNumber: parsed.contactNumber,
            reason: "chat_update_unread",
          });
        } catch (chatUpdateRecoveryError) {
          console.warn(`[CHAT-UPDATE] Falha ao tratar sinal unread de ${chatJid}:`, chatUpdateRecoveryError);
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
      // Quando requestId estï¿½ presente, significa que o Baileys resolveu
      // uma mensagem de anï¿½ncio Instagram/Facebook via PDO (Peer Data Operation)
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
        
        // Atualizar mensagem stub no banco com o conteï¿½do real
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

        // FIX 2026: Aumentado threshold de 2min para 10min para nï¿½o perder
        // mensagens recentes que chegam via append apï¿½s reconexï¿½o.
        // Meta ads leads e mensagens durante desconexï¿½o podem chegar como append.
        const isAppendRecent =
          source === "append" &&
          ((hasValidTs && ageMs <= 10 * 60 * 1000) || (!hasValidTs && (m.messages?.length || 0) <= 5 && !!message.key.id));
        const hasMeaningfulContent = isMeaningfulIncomingContent(message.message as any);
        
        // FIX 2026-02: CTWA resolved messages (from PDO) come with requestId
        // and may arrive as 'append' type from process-message.js
        // Always process these regardless of source/age
        const isCTWAResolved = !!requestId && !!message.message;
        const isRecoverableAppendMessage = isRecoverableRealtimeAppendMessage({
          source,
          remoteJid,
          messageId: message.key.id,
          hasMeaningfulContent,
          hasValidTimestamp: hasValidTs,
          ageMs,
        });
        const isRecoverablePlaceholder = isRecoverableRealtimePlaceholder({
          source,
          remoteJid,
          fromMe: message.key.fromMe,
          messageId: message.key.id,
          hasMeaningfulContent,
        });
        
        const shouldProcess = shouldProcessRealtimeWhatsappEvent({
          source,
          isAppendRecent,
          isRecoverableAppendMessage,
          isCTWAResolved,
          isRecoverablePlaceholder,
        });
        
        if (isCTWAResolved) {
          console.log(`?? [CTWA-PROCESS] Processing CTWA-resolved message from PDO: ${message.key.id} from ${remoteJid} (source=${source}, requestId=${requestId})`);
        }
        if (isRecoverablePlaceholder && !isAppendRecent && !isCTWAResolved) {
          console.log(`[CTWA-LEAD-GUARD] Processing old append placeholder to create a recoverable stub: ${message.key.id} from ${remoteJid} (source=${source})`);
        }
        if (isRecoverableAppendMessage && !isAppendRecent && !isCTWAResolved) {
          console.log(`[APPEND-RECOVERY] Processing recovered append message ${message.key.id} from ${remoteJid} (ageMs=${ageMs})`);
        }

        const ignoredRealtimeReason = getIgnoredRealtimeIncomingReason(message);
        if (ignoredRealtimeReason) {
          console.log(`[MSG-UPSERT] Ignorando evento de sistema ${ignoredRealtimeReason} para ${message.key.id || "sem-id"}`);
          continue;
        }

        // Cache message for getMessage() retries
        if (message.key.id && message.message) {
          cacheMessage(userId, message.key.id, message.message);
        }

        const importedPendingHistoryMessage = await processPendingConversationHistoryUpsertMessage(
          session,
          message,
          requestId,
        );
        if (importedPendingHistoryMessage) {
          continue;
        }

        // -------------------------------------------------------------------
        // FIX 2026-02: MONITORAMENTO DE MENSAGENS CTWA (Anï¿½ncios Instagram/Facebook)
        // -------------------------------------------------------------------
        // Apï¿½s atualizaï¿½ï¿½o do Baileys para master (PR #2334), mensagens de
        // anï¿½ncios CTWA agora sï¿½o detectadas automaticamente pelo Baileys.
        // O Baileys chama requestPlaceholderResend() internamente e re-emite
        // a mensagem real via messages.upsert com type: 'notify'.
        //
        // Este bloco monitora e loga quando uma mensagem chega como stub/
        // placeholder (sem conteï¿½do), que pode indicar CTWA ou retry em andamento.
        // -------------------------------------------------------------------
        if (!message.message && remoteJid && !message.key.fromMe) {
          if (!remoteJid.includes("@broadcast")) {
            const stubType = (message as any).messageStubType;
            const stubParams = (message as any).messageStubParameters;
            console.log(`?? [CTWA-MONITOR] Mensagem sem conteï¿½do de ${remoteJid} (stub=${stubType}, params=${JSON.stringify(stubParams)}, source=${source}) - Baileys irï¿½ solicitar placeholder resend automaticamente`);
          }
        }

        if (!shouldProcess) continue;

        // Save to pending_incoming_messages BEFORE processing, so we can recover after crashes.
        if (!message.key.fromMe && remoteJid) {
          if (!remoteJid.includes("@broadcast")) {
            try {
              const msg = unwrapIncomingMessageContent(message.message as any);
              let textContent: string | null = null;
              let msgType = "text";

              if (!message.message) {
                msgType = "stub";
                const stubType = (message as any).messageStubType;
                if (stubType != null) {
                  console.log(`[RECOVERY] Mensagem pendente sem payload (stubType=${stubType}) id=${message.key.id || "sem-id"}`);
                }
                textContent = UNRESOLVED_INCOMING_STUB_TEXT;
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
            if (shouldProcess) {
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

    // Socket inicializado; promise permanece pendente atï¿½ "open" (ou close/timeout).
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
async function reconcileExistingOutgoingMessage(
  messageId: string | null | undefined,
  confirmedAt: Date,
  conversationId?: string | null,
): Promise<void> {
  if (!messageId) {
    return;
  }

  const existingMessage = conversationId
    ? await storage.getMessageByConversationAndMessageId(conversationId, messageId)
    : await storage.getMessageByMessageId(messageId);
  if (!existingMessage) {
    rememberOutgoingMessageConfirmation(messageId, confirmedAt);
    return;
  }

  const nextStatus = isConfirmedOutgoingMessageStatus(existingMessage.status)
    ? existingMessage.status
    : "sent";
  const currentTimestamp = existingMessage.timestamp ? new Date(existingMessage.timestamp) : null;
  const shouldUpdateTimestamp =
    !currentTimestamp || currentTimestamp.getTime() !== confirmedAt.getTime();
  const shouldUpdateStatus = nextStatus !== existingMessage.status;

  if (!shouldUpdateStatus && !shouldUpdateTimestamp) {
    return;
  }

  await storage.updateMessage(existingMessage.id, {
    ...(shouldUpdateStatus ? { status: nextStatus || "sent" } : {}),
    ...(shouldUpdateTimestamp ? { timestamp: confirmedAt } : {}),
  });
}

async function handleOutgoingMessage(
  session: WhatsAppSession,
  waMessage: WAMessage,
  opts?: {
    isHistorySync?: boolean;
    eventTs?: Date;
  },
) {
  // ?? MODO DEV: Pular processamento se DISABLE_WHATSAPP_PROCESSING=true
  if (DISABLE_MESSAGE_PROCESSING) {
    console.log(`?? [DEV MODE] Ignorando mensagem enviada (processamento desabilitado)`);
    return;
  }

  const remoteJid = waMessage.key.remoteJid;
  if (!remoteJid) return;
  const isHistorySync = opts?.isHistorySync === true;
  const messageTimestamp = opts?.eventTs ?? getWAMessageTimestamp(waMessage);
  const messageId = waMessage.key.id;
  const isKnownQueuedSendEcho = Boolean(messageId && agentMessageIds.has(messageId));
  if (isKnownQueuedSendEcho && messageId) {
    console.log(`?? [FROM ME] Eco confirmado de mensagem do agente: ${messageId}`);
    agentMessageIds.delete(messageId);
  }

  const isGroupJid = isGroupWhatsAppJid(remoteJid);
  if (isBroadcastOrStatusJid(remoteJid)) {
    console.log(`?? [FROM ME] Ignoring broadcast/status message`);
    return;
  }

  const isIndividualJid =
    remoteJid.includes("@s.whatsapp.net") || remoteJid.includes("@lid");

  if (!isIndividualJid && !isGroupJid) {
    console.log(`?? [FROM ME] Ignoring non-individual message`);
    return;
  }

  // Resolver contactNumber usando mesma l?gica do handleIncomingMessage
  let contactNumber: string;
  let normalizedJid: string;

  if (isGroupJid) {
    contactNumber = extractGroupNumber(remoteJid);
    normalizedJid = jidNormalizedUser(remoteJid);
  } else if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
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

  if (false) {
    const mirroredAdminConversation = await storage.findAdminMirrorConversationForConnection(
    session.connectionId,
    contactNumber,
  );
  if (mirroredAdminConversation) {
    console.log(
      `🛡️ [ADMIN MIRROR] Ignorando outbound ${contactNumber} no fluxo normal; adminConversation=${mirroredAdminConversation.adminConversationId}`,
    );
    await suppressUserConversationMirroredByAdmin({
      session,
      contactNumber,
      adminConversationId: mirroredAdminConversation.adminConversationId,
    });
    return;
  }
  }

  // ?? v4.0 ANTI-BAN CRï¿½TICO: Registrar mensagem MANUAL do dono no sistema de proteï¿½ï¿½o
  // Isso faz com que o bot ESPERE antes de enviar qualquer mensagem para evitar
  // padrï¿½o de "bot enviando imediatamente apï¿½s humano" que a Meta detecta como spam
  const msg = waMessage.message;
  let messageType: 'text' | 'media' | 'audio' = 'text';
  if (msg?.audioMessage) {
    messageType = 'audio';
  } else if (msg?.imageMessage || msg?.videoMessage || msg?.documentMessage || msg?.documentWithCaptionMessage) {
    messageType = 'media';
  }
  
  if (!isHistorySync) {
    antiBanProtectionService.registerOwnerManualMessage(session.userId, contactNumber, messageType);
  console.log(`??? [ANTI-BAN v4.0] ?? Mensagem MANUAL do DONO registrada - Bot aguardarï¿½ antes de responder`);
  
  // Extrair texto da mensagem E Mï¿½DIA (incluindo ï¿½udio para transcriï¿½ï¿½o)
  }

  let messageText = "";
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let mediaMimeType: string | null = null;
  let mediaCaption: string | null = null;
  
  // ?? METADADOS PARA RE-DOWNLOAD DE Mï¿½DIA (igual handleIncomingMessage)
  // Esses campos permitem baixar a mï¿½dia novamente do WhatsApp
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
    mediaCaption = msg.imageMessage.caption;
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
    mediaCaption = msg.videoMessage.caption;
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.videoMessage.mediaKey) {
      mediaKey = Buffer.from(msg.videoMessage.mediaKey).toString("base64");
    }
    directPath = msg.videoMessage.directPath || null;
    mediaUrlOriginal = msg.videoMessage.url || null;
    
    // ?? Vï¿½DEO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`?? [FROM ME] Baixando vï¿½deo do dono com caption...`);
      console.log(`?? [FROM ME] waMessage.key:`, JSON.stringify(waMessage.key));
      console.log(`?? [FROM ME] mediaKey presente:`, !!msg.videoMessage.mediaKey);
      console.log(`?? [FROM ME] directPath presente:`, !!msg.videoMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] Vï¿½deo do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar vï¿½deo:", error?.message || error);
      console.error("? [FROM ME] Erro completo:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      mediaUrl = null;
    }
  } else if (msg?.videoMessage) {
    messageText = "[Video enviado]";
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.videoMessage.mediaKey) {
      mediaKey = Buffer.from(msg.videoMessage.mediaKey).toString("base64");
    }
    directPath = msg.videoMessage.directPath || null;
    mediaUrlOriginal = msg.videoMessage.url || null;
    
    // ?? Vï¿½DEO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`?? [FROM ME] Baixando vï¿½deo do dono sem caption...`);
      console.log(`?? [FROM ME] waMessage.key:`, JSON.stringify(waMessage.key));
      console.log(`?? [FROM ME] mediaKey presente:`, !!msg.videoMessage.mediaKey);
      console.log(`?? [FROM ME] directPath presente:`, !!msg.videoMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] Vï¿½deo do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar vï¿½deo:", error?.message || error);
      console.error("? [FROM ME] Erro completo:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      mediaUrl = null;
    }
  } else if (msg?.audioMessage) {
    // ?? ï¿½UDIO DO DONO: Baixar e preparar para transcriï¿½ï¿½o (igual cliente)
    mediaType = "audio";
    mediaMimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
    messageText = "[Audio enviado]"; // Texto placeholder, sera substituido pela transcricao
    
    // ?? Extrair metadados para re-download posterior
    if (msg.audioMessage.mediaKey) {
      mediaKey = Buffer.from(msg.audioMessage.mediaKey).toString("base64");
    }
    directPath = msg.audioMessage.directPath || null;
    mediaUrlOriginal = msg.audioMessage.url || null;
    
    try {
      console.log(`?? [FROM ME] Baixando ï¿½udio do dono para transcriï¿½ï¿½o...`);
      console.log(`?? [FROM ME] mediaKey presente:`, !!msg.audioMessage.mediaKey);
      console.log(`?? [FROM ME] directPath presente:`, !!msg.audioMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // ?? Upload para Storage em vez de base64 para economizar egress
      // ? FIX: Usar session.userId em vez de userId (que nï¿½o existe neste escopo)
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`? [FROM ME] ï¿½udio do dono processado: ${buffer.length} bytes`);
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
    messageText = docMsg.caption || (docMsg.fileName || "*Documento*");
    mediaCaption = docMsg.caption || null;
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
    mediaCaption = msg.documentMessage.caption;
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
      messageText = msg.documentMessage.fileName || "*Documento*";
      console.log(`? [FROM ME] Documento do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar documento:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.documentMessage) {
    messageText = msg.documentMessage.fileName || "*Documento*";
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

  // Buscar/criar conversa - FIX: usar getActiveConversation para nï¿½o pegar conversa fechada
  const continuityConnection =
    await ensureManagedPhoneConnectionContinuity({
      userId: session.userId,
      connectionId: session.connectionId,
      runtimePhoneNumber: session.phoneNumber,
      runtimeIsConnected: true,
    });
  if (!continuityConnection) {
    console.warn(
      `[FROM ME] Ignorando eco da conexao ${session.connectionId.substring(0, 8)}... ` +
        `porque o numero ${session.phoneNumber || "?"} pertence a outra conta ativa`,
    );
    requestSessionShutdown(session, "phone_conflict_other_user");
    return;
  }
  const effectiveConnectionId = continuityConnection.id;

  let conversation = await storage.getActiveConversationByContactNumber(
    effectiveConnectionId,
    contactNumber
  );

  // Se não existir thread ativa, o próximo envio abre uma nova conversa.
  const wasNewConversation = !conversation;

  if (!conversation) {
    console.log(`?? [FROM ME] Creating new conversation for ${contactNumber}`);
    const groupSubject =
      isGroupJid
        ? await resolveGroupSubject(session, normalizedJid)
        : null;
    conversation = await storage.createConversation({
      connectionId: effectiveConnectionId,
      contactNumber,
      remoteJid: normalizedJid,
      jidSuffix: isGroupJid ? "g.us" : "s.whatsapp.net",
      contactName: groupSubject || contactNumber,
      contactAvatar: null,
      lastMessageText: messageText,
      lastMessageTime: messageTimestamp,
      lastMessageFromMe: true,
      unreadCount: 0,
    });
  }

  const trackedSharedAutomatic = isHistorySync
    ? null
    : consumeTrackedSharedAutomaticOutgoingMessage({
        messageId: waMessage.key.id,
        contactNumber,
        mediaType: mediaType || undefined,
        mediaMimeType: mediaMimeType || undefined,
        mediaCaption: mediaCaption || undefined,
        text: messageText,
      });
  if (trackedSharedAutomatic?.conversationId) {
    try {
      await persistTrackedSharedAutomaticOutgoingMessage({
        baseConversation: conversation,
        trackedMessage: trackedSharedAutomatic,
        userId: session.userId,
        fallbackMessageText: messageText,
        waMessageId: waMessage.key.id,
        waMessageTimestamp: waMessage.messageTimestamp,
        mediaType,
        mediaUrl,
        mediaMimeType,
        mediaKey,
        directPath,
        mediaUrlOriginal,
        loadConversation: (conversationId) => storage.getConversation(conversationId),
        createMessage: (payload) => storage.createMessage(payload as any),
        updateConversation: (conversationId, payload) => storage.updateConversation(conversationId, payload as any),
        scheduleFollowUp: (conversationId) =>
          userFollowUpService.resetFollowUpCycle(
            conversationId,
            "Automacao enviou mensagem",
            new Date(),
          ),
        broadcastToUser,
        onFollowUpError: (followUpError) => {
          console.error("Erro ao reagendar follow-up após mídia automática:", followUpError);
        },
      });
    } catch (trackedError) {
      if (isUniqueMessagePersistenceError(trackedError) && waMessage.key.id) {
        await reconcileExistingOutgoingMessage(
          waMessage.key.id,
          messageTimestamp,
          trackedSharedAutomatic.conversationId,
        );
        return;
      }

      console.error(`? [FROM ME] Erro ao salvar mídia automática rastreada:`, trackedError);
      return;
    }

    console.log(
      `?? [FROM ME] Mídia automática rastreada sincronizada: ${contactNumber} (${trackedSharedAutomatic.source})`
    );
    return;
  }

  // ?? VERIFICA??O DE DUPLICATA: Antes de salvar, verificar se a mensagem j? existe no banco
  // Isso resolve race conditions onde o agente pode salvar antes ou depois deste handler
  let existingMessage = waMessage.key.id
    ? await storage.getMessageByConversationAndMessageId(conversation.id, waMessage.key.id)
    : null;

  // ?? RACE CONDITION FIX: Se n?o existe, esperar 500ms e verificar novamente
  // O agente pode estar salvando a mensagem neste exato momento
  if (!existingMessage) {
    await new Promise(resolve => setTimeout(resolve, 500));
    existingMessage = waMessage.key.id
      ? await storage.getMessageByConversationAndMessageId(conversation.id, waMessage.key.id)
      : null;
  }

  if (existingMessage) {
    console.log(`?? [FROM ME] Mensagem j? existe no banco (messageId: ${waMessage.key.id}), ignorando duplicata`);
    await reconcileExistingOutgoingMessage(
      waMessage.key.id,
      messageTimestamp,
      conversation.id,
    );
    
    // Se a mensagem existente ? do agente, N?O pausar a IA e sair
    if (existingMessage.isFromAgent) {
      console.log(`? [FROM ME] Mensagem ? do agente - N?O pausar IA`);
      return;
    }
    
    // Se n?o ? do agente mas j? existe, apenas atualizar conversa e sair (evita duplicata)
    if (!isHistorySync) {
      await storage.updateConversation(conversation.id, {
        lastMessageText: messageText,
        lastMessageTime: messageTimestamp,
        lastMessageFromMe: true,
        hasReplied: true,
        unreadCount: 0,
      });
      if (isGroupJid) {
        await enforceManualOnlyForGroupConversation(conversation.id);
      }
    }
    return;
  }

  if (waMessage.key.id && messageText) {
    try {
      const recentPage = await storage.getMessagesByConversationIdPaginated(conversation.id, 20);
      const normalizedEchoText = normalizeOutboundTextForCustomer(messageText);
      const localRecoveredDuplicate = recentPage.messages.find((recentMessage: any) => {
        if (!recentMessage?.fromMe) return false;
        if (!String(recentMessage?.messageId || "").startsWith("local_recovered:")) return false;
        const recentText = normalizeOutboundTextForCustomer(String(recentMessage?.text || ""));
        if (recentText !== normalizedEchoText) return false;
        const recentAt = recentMessage.timestamp ? new Date(recentMessage.timestamp) : null;
        if (!recentAt || Number.isNaN(recentAt.getTime())) return false;
        return Math.abs(recentAt.getTime() - messageTimestamp.getTime()) <= 10 * 60 * 1000;
      });

      if (localRecoveredDuplicate) {
        await storage.updateMessage(localRecoveredDuplicate.id, {
          messageId: waMessage.key.id,
          status: "sent",
          timestamp: messageTimestamp,
        } as any);
        await storage.updateConversation(conversation.id, {
          lastMessageText: messageText,
          lastMessageTime: messageTimestamp,
          lastMessageFromMe: true,
          hasReplied: true,
          unreadCount: 0,
        });
        console.log(
          `?? [FROM ME] Eco real reconciliado com mensagem recuperada localmente (${waMessage.key.id})`
        );
        return;
      }
    } catch (recoverError) {
      console.warn("[FROM ME] Falha ao verificar mensagem recuperada localmente:", recoverError);
    }
  }

  if (isKnownQueuedSendEcho && messageId) {
    rememberOutgoingMessageConfirmation(messageId, messageTimestamp);
    console.log(
      `?? [FROM ME] Eco de envio rastreado ainda sem persistencia principal (${messageId}); aguardando createMessage do caminho de envio`
    );
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
      timestamp: messageTimestamp,
      isFromAgent: false,
      mediaType,
      mediaUrl,        // ?? Incluir URL do ï¿½udio para transcriï¿½ï¿½o automï¿½tica
      mediaMimeType,   // ?? Tipo MIME do ï¿½udio
      // ?? Metadados para re-download de mï¿½dia do WhatsApp (igual handleIncomingMessage)
      mediaKey,
      directPath,
      mediaUrlOriginal,
    });
  } catch (createError: any) {
    // Se erro for de duplicata (constraint unique), verificar se ? do agente
    if (createError?.message?.includes('unique') || createError?.code === '23505') {
      console.log(`?? [FROM ME] Erro de duplicata ao salvar - mensagem j? existe (messageId: ${waMessage.key.id})`);

      // Re-verificar se ? do agente
      const recheck = waMessage.key.id
        ? await storage.getMessageByConversationAndMessageId(conversation.id, waMessage.key.id)
        : null;
      if (recheck?.isFromAgent) {
        console.log(`? [FROM ME] Confirmado: mensagem ? do agente - N?O pausar IA`);
        return;
      }
    } else {
      console.error(`? [FROM ME] Erro ao salvar mensagem:`, createError);
    }
    return;
  }

  if (isHistorySync) {
    return;
  }

  // Atualizar conversa
  const updatedAfterManualReply = await storage.updateConversation(conversation.id, {
    lastMessageText: messageText,
    lastMessageTime: messageTimestamp,
    lastMessageFromMe: true, // Mensagem enviada pelo usuario
    hasReplied: true, // Marca como respondida
    unreadCount: 0, // Mensagens do dono nao geram unread
  });
  if (updatedAfterManualReply) {
    conversation = updatedAfterManualReply;
  }
  conversation = await routeManualOwnerReplyToIntakeSector({
    userId: session.userId,
    conversation,
    messageText,
  });

  if (isGroupJid) {
    await enforceManualOnlyForGroupConversation(conversation.id);
  } else {
    // ?? FOLLOW-UP: resposta manual do dono no WhatsApp deve reiniciar o ciclo do usuario.
    try {
      await userFollowUpService.resetFollowUpCycle(
        conversation.id,
        "Dono respondeu manualmente no WhatsApp",
        messageTimestamp,
      );
    } catch (error) {
      console.error("Erro ao agendar follow-up:", error);
    }
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
        await storage.updateDisabledConversationOwnerReply(conversation.id, autoReactivateMinutes);
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
      timestamp: savedOutgoingMsg.timestamp?.toISOString?.() || messageTimestamp.toISOString(),
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
      lastMessageTime: messageTimestamp.toISOString(),
      lastMessageFromMe: true,
      unreadCount: 0,
    },
  });

  if (wasNewConversation && isIndividualJid && savedOutgoingMsg) {
    scheduleDirectConversationHistoryRecovery({
      connectionId: effectiveConnectionId,
      conversationId: conversation.id,
      contactNumber,
      reason: "new_direct_conversation_from_manual_outgoing",
    });
  }

  console.log(`?? [FROM ME] Mensagem sincronizada: ${contactNumber} - "${messageText}"`);
}

async function handleIncomingMessage(
  session: WhatsAppSession,
  waMessage: WAMessage,
  opts?: {
    source?: string;
    allowAutoReply?: boolean;
    isAppendRecent?: boolean;
    eventTs?: Date;
    isCTWAResolved?: boolean;
    isHistorySync?: boolean;
    bypassIncomingDedupe?: boolean;
  }
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
  const isHistorySync = opts?.isHistorySync === true;

  // +-----------------------------------------------------------------------+
  // ï¿½  ??? ANTI-REENVIO: VERIFICAï¿½ï¿½O DE DEDUPLICAï¿½ï¿½O DE MENSAGENS          ï¿½
  // ï¿½  Protege contra reprocessamento apï¿½s instabilidade/restart           ï¿½
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
  if (incomingDedupeParams && opts?.bypassIncomingDedupe !== true) {
    const alreadyProcessed = await isIncomingMessageProcessed(incomingDedupeParams);
    if (alreadyProcessed) {
      console.log(`[ANTI-REENVIO] Mensagem recebida BLOQUEADA (ja processada)`);
      console.log(`   De: ${remoteJid.substring(0, 20)}...`);
      console.log(`   WhatsApp ID: ${whatsappMessageId}`);
      return;
    }
  }

  const isGroupJid = isGroupWhatsAppJid(remoteJid);

  // Filtrar status/listas de transmiss?o
  if (isBroadcastOrStatusJid(remoteJid)) {
    console.log(`Ignoring broadcast/status message from: ${remoteJid}`);
    return;
  }

  // Aceitar apenas mensagens individuais (@s.whatsapp.net ou @lid) e grupos (@g.us)
  const isIndividualJid =
    remoteJid.includes("@s.whatsapp.net") || remoteJid.includes("@lid");

  if (!isIndividualJid && !isGroupJid) {
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
  if (isGroupJid) {
    contactNumber = extractGroupNumber(remoteJid);
    jidSuffix = "g.us";
    normalizedJid = jidNormalizedUser(remoteJid);
  } else if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
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

  const groupSubject = isGroupJid
    ? await resolveGroupSubject(session, normalizedJid)
    : null;

  if (false) {
    const mirroredAdminConversation = await storage.findAdminMirrorConversationForConnection(
    session.connectionId,
    contactNumber,
  );
  if (mirroredAdminConversation) {
    console.log(
      `🛡️ [ADMIN MIRROR] Ignorando inbound ${contactNumber} no fluxo normal; adminConversation=${mirroredAdminConversation.adminConversationId}`,
    );
    await suppressUserConversationMirroredByAdmin({
      session,
      contactNumber,
      adminConversationId: mirroredAdminConversation.adminConversationId,
    });
    return;
  }
  }

  // Extract message data including media
  let messageText = "";
  let canAutoReplyThis = true;
  let messageKind: IncomingConversationMessageKind = "normal";
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
  const incomingContextInfo = extractIncomingContextInfo(msg);
    if (!msg) {
    messageKind = "stub";
    canAutoReplyThis = false;
    const stubType = (waMessage as any).messageStubType;
    if (stubType != null) {
      console.log(`[INCOMING-STUB] Mensagem sem payload (stubType=${stubType}) id=${waMessage.key.id || "sem-id"}`);
    }
    messageText = UNRESOLVED_INCOMING_STUB_TEXT;
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
    messageText = mediaCaption || "*Imagem*";
    
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
        console.warn(`?? [CLIENT] Falha no upload de imagem, nï¿½o serï¿½ salva`);
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
    messageText = "*Audio*";
    
    // ?? Extrair metadados para re-download posterior
    if (msg.audioMessage.mediaKey) {
      mediaKey = Buffer.from(msg.audioMessage.mediaKey).toString("base64");
    }
    directPath = msg.audioMessage.directPath || null;
    mediaUrlOriginal = msg.audioMessage.url || null;
    
    try {
      console.log(`??? [CLIENT] Baixando ï¿½udio...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`??? [CLIENT] ï¿½udio baixado: ${buffer.length} bytes`);
      // Upload para Supabase Storage (SEM fallback base64 para evitar egress!)
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, "audio");
      if (!mediaUrl) {
        console.warn(`?? [CLIENT] Falha no upload de ï¿½udio, nï¿½o serï¿½ salvo`);
      }
    } catch (error) {
      console.error("? [CLIENT] Erro ao baixar ï¿½udio:", error);
      mediaUrl = null;
    }
  }
  // Check for video
  else if (msg?.videoMessage) {
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    mediaCaption = msg.videoMessage.caption || null;
    mediaDuration = msg.videoMessage.seconds || null;
    messageText = mediaCaption || "*Video*";
    
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
    messageText = mediaCaption || fileName;
    
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
    messageText = mediaCaption || fileName;
    
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
    messageText = `Contato: ${displayName}${parsed.phone ? ` - ${parsed.phone}` : ""}`;
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

  // ?? RESPOSTA DE BOTï¿½O INTERATIVO (interactiveResponseMessage)
  // Quando usuï¿½rio clica em botï¿½o nativo (nativeFlowMessage quick_reply)
  // ---------------------------------------------------------------------------
  else if (msg?.interactiveResponseMessage) {
    try {
      const interactiveResponse = msg.interactiveResponseMessage;
      const nativeFlowResponse = interactiveResponse?.nativeFlowResponseMessage;
      
      if (nativeFlowResponse?.paramsJson) {
        // Extrair ID e texto do botï¿½o clicado
        const params = JSON.parse(nativeFlowResponse.paramsJson);
        messageText = params.id || params.display_text || 'Opï¿½ï¿½o selecionada';
        console.log(`?? [INTERACTIVE] Resposta de botï¿½o nativo recebida: "${messageText}"`);
        console.log(`   ?? Params: ${JSON.stringify(params)}`);
      } else if (interactiveResponse?.body?.text) {
        // Fallback: usar texto do body
        messageText = interactiveResponse.body.text;
        console.log(`?? [INTERACTIVE] Resposta interativa (body): "${messageText}"`);
      } else {
        messageText = 'Opï¿½ï¿½o selecionada';
        console.log(`?? [INTERACTIVE] Resposta interativa sem texto, usando fallback`);
      }
    } catch (parseError) {
      console.error(`?? [INTERACTIVE] Erro ao parsear resposta:`, parseError);
      messageText = 'Opï¿½ï¿½o selecionada';
    }
  }
  // ---------------------------------------------------------------------------
  // ?? RESPOSTA DE LISTA INTERATIVA (listResponseMessage)  
  // Quando usuï¿½rio seleciona item de lista nativa (single_select)
  // ---------------------------------------------------------------------------
  else if (msg?.listResponseMessage) {
    try {
      const listResponse = msg.listResponseMessage;
      const selectedRowId = listResponse?.singleSelectReply?.selectedRowId;
      const title = listResponse?.title;
      
      // Usar o ID do item selecionado (que foi definido no nï¿½)
      messageText = selectedRowId || title || 'Opï¿½ï¿½o selecionada';
      console.log(`?? [LIST-RESPONSE] Item de lista selecionado: "${messageText}"`);
      console.log(`   ?? Row ID: ${selectedRowId || 'N/A'}`);
      console.log(`   ?? Title: ${title || 'N/A'}`);
    } catch (parseError) {
      console.error(`?? [LIST-RESPONSE] Erro ao parsear resposta:`, parseError);
      messageText = 'Opï¿½ï¿½o selecionada';
    }
  }
  // ---------------------------------------------------------------------------
  // ?? RESPOSTA DE BOTï¿½O ANTIGO (buttonsResponseMessage)
  // Compatibilidade com formato antigo de botï¿½es
  // ---------------------------------------------------------------------------
  else if (msg?.buttonsResponseMessage) {
    try {
      const buttonsResponse = msg.buttonsResponseMessage;
      messageText = buttonsResponse?.selectedButtonId || 
                    buttonsResponse?.selectedDisplayText || 
                    'Opï¿½ï¿½o selecionada';
      console.log(`?? [BUTTONS-RESPONSE] Botï¿½o antigo selecionado: "${messageText}"`);
    } catch (parseError) {
      console.error(`?? [BUTTONS-RESPONSE] Erro ao parsear resposta:`, parseError);
      messageText = 'Opï¿½ï¿½o selecionada';
    }
  }
    // Ignorar mensagens de tipos nï¿½o suportados (reaï¿½ï¿½es, status, etc)
  else {
    const msgTypes = Object.keys(msg || {});
    console.log(`Ignoring unsupported message type from ${contactNumber}:`, msgTypes);
    messageText = msgTypes.length ? `[Mensagem nao suportada: ${msgTypes.join(', ')}]` : '[Mensagem nao suportada]';
    canAutoReplyThis = false;
    messageKind = 'unsupported';
  }

  if (isGroupJid) {
    canAutoReplyThis = false;
    messageText = formatIncomingGroupMessageText(
      messageText,
      resolveGroupParticipantName(waMessage),
    );
  }

  // Avatar nao pode bloquear persistencia/broadcast da mensagem recebida.
  let contactAvatar: string | null = null;

  // FIX Encerramento: buscar apenas conversa ATIVA (nao fechada) - se fechada, cria nova
  // FIX 2026-02-21: Usa mutex para prevenir race condition de criaï¿½ï¿½o duplicada
  const continuityConnection =
    await ensureManagedPhoneConnectionContinuity({
      userId: session.userId,
      connectionId: session.connectionId,
      runtimePhoneNumber: session.phoneNumber,
      runtimeIsConnected: true,
    });
  if (!continuityConnection) {
    console.warn(
      `[MESSAGES UPSERT] Ignorando mensagem da conexao ${session.connectionId.substring(0, 8)}... ` +
        `porque o numero ${session.phoneNumber || "?"} pertence a outra conta ativa`,
    );
    requestSessionShutdown(session, "phone_conflict_other_user");
    return;
  }
  const effectiveConnectionId = continuityConnection.id;
  const shouldPromoteIncomingMessage =
    shouldPromoteIncomingMessageToConversationList(messageKind);

  if (!shouldPromoteIncomingMessage) {
    const existingConversation = await storage.getActiveConversationByContactNumber(
      effectiveConnectionId,
      contactNumber,
    );

    if (!existingConversation) {
      if (waMessage.key.id) {
        try {
          await markMessageAsProcessed(waMessage.key.id);
        } catch (markErr) {
          console.error(`?? [RECOVERY] Erro ao marcar protocolo sem conversa como processado:`, markErr);
        }
      }
      return;
    }
  }

  const conversationResult = await getOrCreateConversationSafe(
    effectiveConnectionId,
    contactNumber,
    // createFn
    async () => {
      return await storage.createConversation({
        connectionId: effectiveConnectionId,
        contactNumber,
        remoteJid: normalizedJid,
        jidSuffix,
        contactName: groupSubject || (isGroupJid ? `Grupo ${contactNumber}` : waMessage.pushName),
        contactAvatar,
        lastMessageText: messageText,
        lastMessageTime: eventTs,
        lastMessageFromMe: false,
        unreadCount: isHistorySync ? 0 : 1,
      });
    },
    // lookupFn
    async () => {
      return await storage.getActiveConversationByContactNumber(
        effectiveConnectionId,
        contactNumber
      );
    }
  );
  let conversation = conversationResult.conversation;
  refreshIncomingContactAvatarInBackground({
    session,
    normalizedJid,
    contactNumber,
    conversationId: conversation.id,
    currentAvatar: conversation.contactAvatar,
    skip: isHistorySync || isGroupJid,
  });

  // Used later to decide append-based auto-reply eligibility (Meta/Instagram leads).
  const wasNewConversation = conversationResult.wasCreated;
  const nextUnreadCount = wasNewConversation
    ? (isHistorySync || !shouldPromoteIncomingMessage ? 0 : Math.max(1, conversation.unreadCount || 1))
    : (
        isHistorySync || !shouldPromoteIncomingMessage
          ? (conversation.unreadCount || 0)
          : (conversation.unreadCount || 0) + 1
      );
  const nextIsArchived = isGroupJid ? Boolean(conversation.isArchived) : false;

  if (!wasNewConversation && shouldPromoteIncomingMessage && !isHistorySync) {
    await storage.updateConversation(conversation.id, {
      remoteJid: normalizedJid,
      jidSuffix,
      lastMessageText: messageText,
      lastMessageTime: eventTs,
      lastMessageFromMe: false,
      unreadCount: nextUnreadCount,
      isArchived: nextIsArchived,
      contactName: groupSubject || (isGroupJid ? conversation.contactName || `Grupo ${contactNumber}` : waMessage.pushName || conversation.contactName),
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
      isArchived: nextIsArchived,
      contactName: groupSubject || (isGroupJid ? conversation.contactName || `Grupo ${contactNumber}` : waMessage.pushName || conversation.contactName),
      contactAvatar: contactAvatar || conversation.contactAvatar,
    };
  }

  if (isGroupJid) {
    await enforceManualOnlyForGroupConversation(conversation.id);
  }

  // ---------------------------------------------------------------------------
  // FIX 2026: PRESENCE + SUBSCRIBE PARA NOVOS CONTATOS
  // ---------------------------------------------------------------------------
  // Para contatos novos (primeira mensagem), estabelecer a sessï¿½o Signal
  // Protocol enviando presence e fazendo presenceSubscribe.
  // Isso ï¿½ CRï¿½TICO para que o retry de mensagens "Aguardando" funcione.
  // ---------------------------------------------------------------------------
  if (wasNewConversation && !isGroupJid && !isHistorySync) {
    sendNewContactPresenceInBackground({ session, normalizedJid, contactNumber });
  }

  // ? FOLLOW-UP USUï¿½RIOS: Resetar ciclo quando cliente responde
  // O sistema de follow-up para usuï¿½rios usa a tabela "conversations" (nï¿½o admin_conversations)
    const inboundMessageId =
      waMessage.key.id || `wa_${eventTs.getTime()}_${Math.random().toString(16).slice(2, 10)}`;

    const whatsappAdsAttribution = extractWhatsappAdsAttributionFromContextInfo(
      incomingContextInfo,
      inboundMessageId,
    );
    if (whatsappAdsAttribution && !isHistorySync && !isGroupJid) {
      storage.recordConversationWhatsappAdsAttribution({
        conversationId: conversation.id,
        connectionId: conversation.connectionId,
        userId: session.userId,
        contactNumber: conversation.contactNumber,
        contactName: conversation.contactName,
        attribution: whatsappAdsAttribution,
      }).catch((error) => {
        console.error("[WHATSAPP ADS] Falha ao registrar atribuicao da conversa:", error);
      });
    }

    // -------------------------------------------------------------------
    // FIX CTWA-RESOLVED: Quando PDO descriptografa, a mensagem jï¿½ existe
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
          // ?? Metadados para re-download de mï¿½dia do WhatsApp
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
          `?? [INCOMING-DUPLICATE] Colisï¿½o de message_id=${inboundMessageId} em conversation=${conversation.id}. Tentando reaproveitar sem abortar pipeline.`,
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
            console.error(`? [INCOMING-DUPLICATE] Falha no fallback de persistï¿½ncia:`, fallbackErr);
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
    // ?? SISTEMA DE RECUPERAï¿½ï¿½O: Marcar mensagem como PROCESSADA com sucesso
    // -----------------------------------------------------------------------
    // Se chegou atï¿½ aqui, a mensagem foi salva no banco de dados
    // Podemos marcar como processada na tabela pending_incoming_messages
    // -----------------------------------------------------------------------
    if (waMessage.key.id) {
      try {
        await markMessageAsProcessed(waMessage.key.id);
      } catch (markErr) {
        console.error(`?? [RECOVERY] Erro ao marcar como processada:`, markErr);
        // Nï¿½o bloqueia - mensagem jï¿½ foi salva no banco principal
      }
    }

    if (!shouldPromoteIncomingMessage) {
      return;
    }

    // ?? FIX CR?TICO: savedMessage.text pode conter transcri??o de ?udio!
    // createMessage() transcreve automaticamente ?udios ANTES de retornar.
    // Por isso SEMPRE usamos savedMessage.text (e n?o messageText original).
    const effectiveText = savedMessage.text || messageText;
    let effectiveTextForAi = effectiveText;

    // Se a mensagem de m?dia (ex: ?udio) tiver sido transcrita ao salvar,
    // garantimos que o ?ltimo texto da conversa use essa transcri??o.
    if (effectiveText !== messageText && !isHistorySync) {
      await storage.updateConversation(conversation.id, {
        lastMessageText: effectiveText,
        lastMessageTime: eventTs,
      });
    }

    if (!isHistorySync) {
      broadcastToUser(session.userId, {
        type: "new_message",
        conversationId: conversation.id,
        message: effectiveText,
        mediaType,
        // ?? FIX 2026: Enviar dados da conversa inline para real-time update sem refetch
        conversationUpdate: {
          id: conversation.id,
          contactNumber,
          contactName: groupSubject || conversation.contactName || (isGroupJid ? `Grupo ${contactNumber}` : waMessage.pushName || null),
          contactAvatar: conversation.contactAvatar || null,
          lastMessageText: effectiveText,
          lastMessageTime: eventTs.toISOString(),
          lastMessageFromMe: false,
          unreadCount: nextUnreadCount,
          isArchived: nextIsArchived,
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

      if (!nextIsArchived) {
        void notifyInboxUserAboutIncomingMessage(session.userId, conversation, effectiveText);
      }
    }

  if (!isGroupJid && !isHistorySync && shouldPromoteIncomingMessage) {
    void userFollowUpService.pauseFollowUpUntilCompanyReply(
      conversation.id,
      "Cliente respondeu - aguardando resposta da empresa",
    ).catch((error) => {
      console.error("Erro ao pausar follow-up do usuario:", error);
    });
  }

  if (isGroupJid) {
    return;
  }

  // ?? AI Agent/Chatbot Auto-Response com SISTEMA DE ACUMULAï¿½ï¿½O DE MENSAGENS
  // ?? IMPORTANTE: O check de "isAgentDisabled" se aplica TANTO ï¿½ IA quanto ao CHATBOT/FLUXO!
  // Quando o dono responde manualmente, AMBOS os sistemas sï¿½o pausados.
  try {
    const catalogModuleActiveForAi = await isCatalogModuleActiveForAi(session.userId);
    const quotedContextForAi = catalogModuleActiveForAi
      ? await resolveQuotedMessageContextForAi(
          conversation.id,
          incomingContextInfo,
        )
      : "";
    const shouldApplyCatalogEnhancement =
      catalogModuleActiveForAi &&
      shouldEnhanceCatalogContextForAi({
        text: effectiveText,
        mediaCaption: savedMessage.mediaCaption || mediaCaption,
        mediaType: savedMessage.mediaType || mediaType,
        quotedContext: quotedContextForAi,
      });

    if (shouldApplyCatalogEnhancement) {
      effectiveTextForAi = (
        buildCatalogAwareMessageTextForAi({
          text: effectiveText,
          mediaCaption: savedMessage.mediaCaption || mediaCaption,
          mediaType: savedMessage.mediaType || mediaType,
          quotedContext: quotedContextForAi,
        }) || effectiveText
      );
    }
  } catch (catalogContextError) {
    console.warn("[CATALOG-AI] Falha ao preparar contexto de catalogo apos salvar mensagem:", catalogContextError);
  }

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
        `?? [STUB-FALLBACK] Forï¿½ando pipeline de stub para mensagem ${waMessage.key.id} (source=${source}, appendRecent=${isAppendRecent})`
      );
    }

    // Multi-connection: Check if aiEnabled is false for this specific connection
    let connRecordForAutoReply: WhatsappConnection | null = null;
    if (session.connectionId) {
      try {
        connRecordForAutoReply = (await storage.getConnectionById(session.connectionId)) ?? null;
        if (connRecordForAutoReply && connRecordForAutoReply.aiEnabled === false) {
          console.log(`?? [AI AGENT] IA desativada para conexï¿½o ${session.connectionId} - nï¿½o responder automaticamente`);
          return;
        }
      } catch (e) {
        // Ignore lookup errors, proceed with AI
      }
    }

    const qrReconnectCutoffMsForAutoReply = getQrReconnectCutoffMs(connRecordForAutoReply, session);
    if (shouldSuppressAutoReplyForQrReconnectBacklog(connRecordForAutoReply, eventTs, session)) {
      console.log(
        `[QR BACKLOG] Auto-reply bloqueado para mensagem anterior ao QR reconnect (conversation=${conversation.id}, conn=${session.connectionId.substring(0, 8)})`,
      );
      return;
    }

    // If we have no usable text, do not trigger chatbot/IA.
    if (!effectiveText || !effectiveText.trim()) {
      return;
    }

    const isAgentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
    
    // ?? LISTA DE EXCLUSï¿½O: Verificar se o nï¿½mero estï¿½ na lista de exclusï¿½o
    const isExcluded = await storage.isNumberExcluded(session.userId, contactNumber);
    if (isExcluded) {
      console.log(`?? [AI AGENT] Nï¿½mero ${contactNumber} estï¿½ na LISTA DE EXCLUSï¿½O - nï¿½o responder automaticamente`);
      return;
    }

    const automationGuardDecision = await evaluateInboundAutomationGuard({
      userId: session.userId,
      connectionId: session.connectionId,
      conversationId: conversation.id,
      contactNumber,
      contactName: conversation.contactName || waMessage.pushName || null,
      inboundText: effectiveTextForAi,
      conversationHistory: await storage.getMessagesByConversationId(conversation.id),
    });

    if (automationGuardDecision.shouldBlock) {
      await applyInboundAutomationGuardBlock({
        userId: session.userId,
        conversation,
        reason: automationGuardDecision.reason,
        reasonCode: automationGuardDecision.reasonCode,
      });
      return;
    }

    // +-------------------------------------------------------------------------+
    // ï¿½ ?? FIX CRï¿½TICO: Verificar se AMBOS (IA E CHATBOT) estï¿½o pausados       ï¿½
    // ï¿½ Quando dono responde manualmente, o sistema inteiro pausa, nï¿½o sï¿½ IA!  ï¿½
    // ï¿½ Data: 2025-01-XX - Sincronizaï¿½ï¿½o Flow Builder + IA Agent               ï¿½
    // +-------------------------------------------------------------------------+
    if (isAgentDisabled) {
      console.log(`?? [AUTO-PAUSE ATIVO] IA/Chatbot pausados para conversa ${conversation.id}`);
      console.log(`   ?? Contato: ${contactNumber} | Motivo: dono respondeu manualmente ou transferï¿½ncia`);
      
      // Marcar que cliente tem mensagem pendente (para auto-reativaï¿½ï¿½o responder depois)
      try {
        await storage.markClientPendingMessage(conversation.id);
        console.log(`?? [AUTO-REATIVATE] Cliente enviou mensagem enquanto pausado - marcado como pendente`);
      } catch (err) {
        console.error("Erro ao marcar mensagem pendente:", err);
      }
      
      // ?? Nï¿½O processar nem pelo chatbot nem pela IA enquanto pausado!
      return;
    }
    
    if (!canAutoReplyThis) {
      if (messageKind === "stub") {
        // -------------------------------------------------------------------
        // FIX 2026-02-24: PDO RETRY CURTO + FALLBACK "OI"
        // -------------------------------------------------------------------
        // Mensagens CTWA (Click-to-WhatsApp de anï¿½ncios Meta/Instagram)
        // chegam SEM encriptaï¿½ï¿½o (sem nï¿½ 'enc') ? Baileys gera stub CIPHERTEXT.
        //
        // O Baileys PR #2334 internamente chama requestPlaceholderResend()
        // para pedir ao CELULAR que reenvie o conteï¿½do real via PDO.
        // Porï¿½m o celular tem apenas 8s para responder ? frequentemente falha
        // se o celular estiver dormindo/sem internet/em background.
        //
        // Estratï¿½gia:
        //   - 4 tentativas de PDO, intervalo de 2s
        //   - fallback "Oi" em ~8s se continuar sem conteï¿½do ï¿½til
        // Objetivo: destravar IA rï¿½pido sem texto hardcoded de resposta.
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
        } catch (_presErr) { /* nï¿½o-crï¿½tico */ }

        try {
          await session.socket.readMessages([waMessage.key]);
          console.log(`?? [STUB-PDO-RETRY] Read receipt enviado para ${stubMsgId}`);
        } catch (_readErr) { /* nï¿½o-crï¿½tico */ }

        // Presenï¿½a extra apï¿½s 3s e 5s (whatsmeow envia IMEDIATAMENTE para CTWA)
        setTimeout(async () => {
          try { await session.socket.sendPresenceUpdate('available', normalizedJid); } catch (_e) { /* */ }
          try { await session.socket.readMessages([waMessage.key]); } catch (_e) { /* */ }
        }, 3000);
        setTimeout(async () => {
          try { await session.socket.sendPresenceUpdate('available', normalizedJid); } catch (_e) { /* */ }
        }, 5000);

        // Capturar params de dedupe para verificar apï¿½s timeouts
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

        // -- Funï¿½ï¿½o helper: verificar se stub jï¿½ foi resolvido --
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
                  // segue para outras validaï¿½ï¿½es
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

          // Sï¿½ considerar cache quando houver conteï¿½do realmente ï¿½til
          const cached = getCachedMessage(stubUserId, stubMsgId || "");
          if (cached && isMeaningfulIncomingContent(cached)) return true;

          if (cached) {
            console.log(`?? [STUB-PDO-RETRY] Cache tï¿½cnico detectado para ${stubMsgId}, mantendo retry/fallback.`);
          }
          return false;
        };

        // -- Funï¿½ï¿½o helper: tentar PDO via requestPlaceholderResend --
        const attemptPDO = async (attemptNum: number): Promise<void> => {
          try {
            if (await checkIfResolved()) {
              console.log(`? [STUB-PDO-RETRY] Mensagem ${stubMsgId} jï¿½ resolvida antes da tentativa #${attemptNum}`);
              return;
            }

            console.log(`?? [STUB-PDO-RETRY] Tentativa #${attemptNum} de PDO para ${stubMsgId} de ${stubContactNumber}`);

            // Enviar presenï¿½a para manter sessï¿½o ativa
            try { await session.socket.sendPresenceUpdate('available', normalizedJid); } catch (_e) { /* */ }
            try { await session.socket.readMessages([waMessage.key]); } catch (_e) { /* */ }

            // Chamar requestPlaceholderResend do Baileys
            // Apï¿½s o timeout de 8s do Baileys, o placeholderResendCache ï¿½ limpo
            // para este msgId, permitindo nova tentativa
            const requestId = await (session.socket as any).requestPlaceholderResend(pdoMessageKey, pdoMsgData);
            
            if (requestId === 'RESOLVED') {
              console.log(`? [STUB-PDO-RETRY] Mensagem ${stubMsgId} resolvida durante tentativa #${attemptNum}!`);
            } else if (requestId) {
              console.log(`?? [STUB-PDO-RETRY] PDO #${attemptNum} enviado para ${stubMsgId} (requestId=${requestId})`);
            } else {
              console.log(`?? [STUB-PDO-RETRY] PDO #${attemptNum} retornou undefined para ${stubMsgId} (jï¿½ em cache ou resolvido)`);
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
            // Verificar uma ï¿½ltima vez se foi resolvido
            if (await checkIfResolved()) {
              console.log(`? [STUB-PDO-RETRY] Mensagem ${stubMsgId} resolvida apï¿½s ${FINAL_FALLBACK_MS/1000}s! Nenhum fallback necessï¿½rio.`);
              return;
            }

            // -- FALLBACK: Usar texto amigável para IA responder --
            const fallbackText = INITIAL_META_STUB_FALLBACK_TEXT;
            console.log(`?? [STUB-FALLBACK] Mensagem ${stubMsgId} ainda incompleta apï¿½s ${MAX_PDO_RETRIES} tentativas PDO (${FINAL_FALLBACK_MS/1000}s) - usando fallback "${fallbackText}"`);
            console.log(`[STUB-PENDING] stub_pending_without_payload conversation=${stubConversationId} message=${stubMsgId} user=${stubUserId} connection=${stubConnectionId || "none"}`);

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

            try {
              await storage.updateConversation(stubConversationId, {
                needsHumanAttention: true,
                attentionPriority: "high",
                attentionReason: "Mensagem recebida ainda carregando. Confira a conversa antes de responder.",
                attentionQualifiedAt: new Date(),
              });
            } catch (attentionErr) {
              console.error(`[STUB-PENDING] Erro ao marcar atencao humana:`, attentionErr);
            }

            try {
              broadcastToUser(stubUserId, {
                type: "message_updated",
                conversationId: stubConversationId,
                messageId: stubSavedMessageId,
                text: fallbackText,
              });
            } catch (_broadcastErr) { /* */ }

            let pendingFirstMessageScheduled = false;
            try {
              const stubConversation = await storage.getConversation(stubConversationId);
              if (stubConversation) {
                const stubMessages = await storage.getMessagesByConversationId(stubConversationId);
                pendingFirstMessageScheduled = await schedulePendingFirstMessageAIResponse({
                  source: "stub_unresolved",
                  userId: stubUserId,
                  connectionId: stubConnectionId || stubConversation.connectionId,
                  conversation: stubConversation,
                  contactNumber: stubContactNumber,
                  jidSuffix: stubJidSuffix,
                  conversationWasCreated: stubMessages.length <= 1,
                  existingMessages: stubMessages,
                  pendingMessages: [fallbackText],
                  displayMessageId: stubSavedMessageId,
                  reason: "stub_unresolved_pending_first_message",
                });
              }
            } catch (scheduleErr) {
              console.error(`[STUB-PENDING] Erro ao agendar primeira mensagem pendente:`, scheduleErr);
            }

            console.warn(
              `[STUB-PENDING] Mensagem ${stubMsgId} mantida pendente sem payload real; ` +
                `IA de abertura ${pendingFirstMessageScheduled ? "agendada" : "nao agendada"}.`,
            );
            return;

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
                  console.log(`?? [STUB-FALLBACK] IA desativada para conexï¿½o ${stubConnectionId}`);
                  console.log(`?? [STUB-FALLBACK] decrypt_fallback_blocked_by_rules:ai_disabled connection=${stubConnectionId}`);
                  return;
                }
              } catch (_e) { /* prosseguir */ }
            }

            const isExcluded = await storage.isNumberExcluded(stubUserId, stubContactNumber);
            if (isExcluded) {
              console.log(`?? [STUB-FALLBACK] Nï¿½mero ${stubContactNumber} na lista de exclusï¿½o`);
              console.log(`?? [STUB-FALLBACK] decrypt_fallback_blocked_by_rules:number_excluded contact=${stubContactNumber}`);
              return;
            }

            const stubConversation = await storage.getConversation(stubConversationId);
            if (stubConversation) {
              const automationGuardDecision = await evaluateInboundAutomationGuard({
                userId: stubUserId,
                connectionId: stubConnectionId || stubConversation.connectionId,
                conversationId: stubConversationId,
                contactNumber: stubContactNumber,
                contactName: stubConversation.contactName || null,
                inboundText: fallbackText,
                conversationHistory: await storage.getMessagesByConversationId(stubConversationId),
              });

              if (automationGuardDecision.shouldBlock) {
                await applyInboundAutomationGuardBlock({
                  userId: stubUserId,
                  conversation: stubConversation,
                  reason: automationGuardDecision.reason,
                  reasonCode: automationGuardDecision.reasonCode,
                });
                return;
              }
            }

            const stubConversationHistory = stubConversation
              ? await storage.getMessagesByConversationId(stubConversationId)
              : [];
            const stubAgentConfig = await storage.getAgentConfig(stubUserId);
            const stubTriggerMatch = evaluateAgentTriggerMatch({
              triggerPhrases: stubAgentConfig?.triggerPhrases,
              currentMessages: fallbackText,
              conversationHistory: stubConversationHistory,
            });

            if (!stubTriggerMatch.matched) {
              console.log(
                `[STUB-FALLBACK] Sem resposta: conversa ${stubConversationId} nao contem frase gatilho do cliente`,
              );
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

            // Processar via IA (sistema de acumulaï¿½ï¿½o)
            try {
              const responseDelaySeconds = stubAgentConfig?.responseDelaySeconds ?? 30;
              const responseDelayMs = responseDelaySeconds * 1000;

              const existingPending = pendingResponses.get(stubConversationId);

              if (existingPending) {
                clearTimeout(existingPending.timeout);
                existingPending.messages.push(fallbackText);
                existingPending.isCTWAFallback = true; // ?? Marcar como CTWA fallback
                existingPending.retryCount = 0;
                existingPending.responseDelaySeconds = responseDelaySeconds;
                const executeAt = new Date(Date.now() + responseDelayMs);
                existingPending.timeout = schedulePendingResponseProcessing(
                  existingPending,
                  responseDelayMs,
                  `stub_fallback_existing:${stubContactNumber}`,
                );
                console.log(`?? [STUB-FALLBACK] Mensagem acumulada (${existingPending.messages.length} msgs) para ${stubContactNumber}`);
                try {
                  await storage.updatePendingAIResponseMessages(stubConversationId, existingPending.messages, executeAt, { resetRetry: true });
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
                  responseDelaySeconds,
                };
                pending.timeout = schedulePendingResponseProcessing(
                  pending,
                  responseDelayMs,
                  `stub_fallback_new:${stubContactNumber}`,
                );
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
              // Nï¿½O enviar mensagem de erro para o cliente - apenas logar
              // A mensagem "reenviar por favor" causava UX ruim
              console.log(`?? [STUB-FALLBACK] IA falhou para ${stubContactNumber} - aguardando prï¿½xima mensagem do cliente`);
            }
          } catch (err) {
            console.error(`? [STUB-FALLBACK] Erro no timeout final:`, err);
          }
        }, FINAL_FALLBACK_MS);
      }
      return;
    }

    // ? Agente/Chatbot Nï¿½O estï¿½ pausado - processar normalmente

    // ?? CHATBOT DE FLUXO: Verificar se o usuï¿½rio tem chatbot ativo ANTES da IA
    // O chatbot tem prioridade sobre a IA quando ambos estï¿½o configurados
    const agentConfigForAutoReply = await storage.getAgentConfig(session.userId);
    const autoReplyTriggerMatch = evaluateAgentTriggerMatch({
      triggerPhrases: agentConfigForAutoReply?.triggerPhrases,
      currentMessages: effectiveTextForAi,
      conversationHistory: await storage.getMessagesByConversationId(conversation.id),
    });

    if (!autoReplyTriggerMatch.matched) {
      console.log(
        `[AI AGENT] Sem resposta automatica: conversa ${conversation.id} nao contem frase gatilho do cliente`,
      );
      return;
    }

    const { tryProcessChatbotMessage, isNewContact } = await import("./chatbotIntegration");
    const isFirstContact = await isNewContact(conversation.id);
    const chatbotResult = await tryProcessChatbotMessage(
      session.userId,
      conversation.id,
      contactNumber,
      effectiveTextForAi,
      isFirstContact
    );
    
    if (chatbotResult.handled) {
      console.log(`?? [CHATBOT] Mensagem processada pelo chatbot de fluxo`);
      if (chatbotResult.transferToHuman) {
        console.log(`?? [CHATBOT] Conversa transferida para humano - IA/Chatbot desativados para esta conversa`);
      }
      return; // Chatbot jï¿½ processou, nï¿½o precisa da IA
    }
    
    // ?? CRï¿½TICO: Verificar se ï¿½ltima mensagem foi do cliente (nï¿½o do agente)
    // Se ï¿½ltima mensagem for do agente, Nï¿½O responder (evita loop)
    const lastMessage = await storage.getLastMessageByConversationId(conversation.id);
    
    if (lastMessage && lastMessage.fromMe) {
      console.log(`?? [AI AGENT] ï¿½ltima mensagem foi do agente, nï¿½o respondendo (evita loop)`);
      return;
    }
    
    // ? IA pode responder (nï¿½o estï¿½ pausada e chatbot nï¿½o processou)
    {
      const userId = session.userId;
      const conversationId = conversation.id;
      const targetNumber = contactNumber;
      const finalText = effectiveTextForAi;

      // ?? SISTEMA DE ACUMULA??O: Buscar delay configurado
      const agentConfig = agentConfigForAutoReply;
      const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
      const responseDelayMs = responseDelaySeconds * 1000;
      
      // Verificar se j? existe um timeout pendente para esta conversa
      const existingPending = pendingResponses.get(conversationId);
      
      if (existingPending) {
        // ? ACUMULAï¿½ï¿½O: Nova mensagem chegou - cancelar timeout anterior e acumular
        clearTimeout(existingPending.timeout);
        if (
          existingPending.pendingFirstMessageRecovery ||
          shouldReplacePendingFirstMessagePayloadWithRealText(existingPending.messages)
        ) {
          existingPending.messages = [finalText];
          existingPending.startTime = Date.now();
          existingPending.pendingFirstMessageRecovery = undefined;
          existingPending.isCTWAFallback = false;
          console.log(
            `[PENDING-FIRST-MESSAGE] Payload real chegou; substituindo abertura pendente na conversa ${conversationId}`,
          );
        } else if (
          qrReconnectCutoffMsForAutoReply &&
          existingPending.startTime < qrReconnectCutoffMsForAutoReply - QR_RECONNECT_CUTOFF_DRIFT_MS
        ) {
          existingPending.messages = [finalText];
          existingPending.startTime = Date.now();
          console.log(
            `[QR BACKLOG] Pending antigo da conversa ${conversationId} substituido pela mensagem nova pos-QR`,
          );
        } else {
          existingPending.messages.push(finalText);
        }
        existingPending.retryCount = 0;
        existingPending.responseDelaySeconds = responseDelaySeconds;
        console.log(`?? [AI AGENT] Mensagem acumulada (${existingPending.messages.length} mensagens) para ${targetNumber}`);
        console.log(`?? [AI AGENT] Mensagens acumuladas: ${existingPending.messages.map(m => `"${m.substring(0, 30)}..."`).join(' | ')}`);
        
        const executeAt = new Date(Date.now() + responseDelayMs);
        
        // Criar novo timeout com as mensagens acumuladas
        existingPending.timeout = schedulePendingResponseProcessing(
          existingPending,
          responseDelayMs,
          `schedule_ai_existing:${targetNumber}`,
        );
        
        console.log(`?? [AI AGENT] Timer reiniciado: ${responseDelaySeconds}s para ${targetNumber}`);
        
        // ?? PERSISTENT TIMER: Atualizar no banco
        try {
          await storage.updatePendingAIResponseMessages(conversationId, existingPending.messages, executeAt, { resetRetry: true });
          console.log(`?? [AI AGENT] Timer atualizado no banco - ${existingPending.messages.length} msgs - executa ï¿½s ${executeAt.toISOString()}`);
        } catch (dbError) {
          console.error(`?? [AI AGENT] Erro ao atualizar timer no banco (nï¿½o crï¿½tico):`, dbError);
        }
      } else {
        // Nova conversa - criar entrada de acumulaï¿½ï¿½o
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
          responseDelaySeconds,
        };
        
        pending.timeout = schedulePendingResponseProcessing(
          pending,
          responseDelayMs,
          `schedule_ai_new:${targetNumber}`,
        );
        
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
          console.log(`?? [AI AGENT] Timer persistido no banco - executa ï¿½s ${executeAt.toISOString()}`);
        } catch (dbError) {
          console.error(`?? [AI AGENT] Erro ao persistir timer (nï¿½o crï¿½tico):`, dbError);
        }
      }
    }
  } catch (error) {
    console.error("Error scheduling AI response:", error);
  }
}

function schedulePendingResponseProcessing(
  pending: PendingResponse,
  delayMs: number,
  reason: string,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    void processAccumulatedMessages(pending).catch((error) => {
      console.error(
        `❌ [AI AGENT] Falha no processamento agendado (${reason}) para conversa ${pending.conversationId}:`,
        error,
      );
    });
  }, delayMs);
}

// ?? FUNï¿½ï¿½O PARA PROCESSAR MENSAGENS ACUMULADAS
async function processAccumulatedMessages(pending: PendingResponse): Promise<void> {
  const { conversationId, userId, connectionId, contactNumber, jidSuffix } = pending;
  let resolvedConnectionIdForRetry: string | undefined = connectionId;
  let responseDelaySecondsForRetry: number | null =
    Number.isFinite(Number(pending.responseDelaySeconds)) ? Number(pending.responseDelaySeconds) : null;
  
  // Se uma resposta anterior ainda esta enviando texto/midia, mantenha a nova
  // pendencia viva ate a conversa liberar. Nao descartar apos poucos retries.
  const processingStartedAt = conversationsBeingProcessed.get(conversationId);
  if (processingStartedAt) {
    const processingAge = Date.now() - processingStartedAt;
    if (processingAge > PROCESSING_TTL_MS) {
      console.warn(
        `⚠️ [AI AGENT] PROCESSING_STALE_RELEASED_BEFORE_REQUEUE: ` +
          `${conversationId} preso ha ${Math.round(processingAge / 1000)}s; liberando lock`,
      );
      conversationsBeingProcessed.delete(conversationId);
    } else {
      const retryCount = (pending as any)._concurrencyRetries || 0;
      (pending as any)._concurrencyRetries = retryCount + 1;
      const retryDelay = Math.min(
        PENDING_CONCURRENCY_RETRY_MAX_DELAY_MS,
        PENDING_CONCURRENCY_RETRY_BASE_DELAY_MS * Math.max(1, retryCount + 1),
      );
      console.log(
        `🔄 [AI AGENT] 🔒 Conversa ${conversationId} ainda em processamento ha ` +
          `${Math.round(processingAge / 1000)}s — RE-QUEUE em ${retryDelay}ms ` +
          `(retry ${(pending as any)._concurrencyRetries})`,
      );
      reschedulePendingResponse(conversationId, pending, retryDelay, "concurrency_wait");
      return;
    }
  }
  
  // ?? Marcar como em processamento ANTES de qualquer coisa
  conversationsBeingProcessed.set(conversationId, Date.now());
  const pendingMutationGuard = {
    expectedMessages: [...pending.messages],
    notUpdatedAfter: new Date(),
  };
  let pendingFirstMessageRecovery =
    pending.pendingFirstMessageRecovery ||
    getPendingFirstMessageRecoveryFromMessages(pending.messages) ||
    undefined;
  if (pendingFirstMessageRecovery) {
    pending.pendingFirstMessageRecovery = pendingFirstMessageRecovery;
  }
  let pendingMessagesForAI = pendingFirstMessageRecovery
    ? [buildPendingFirstMessageAgentText(pendingFirstMessageRecovery.source)]
    : pending.messages;

  // ?? FLAG DE SUCESSO: Sï¿½ marca completed se a mensagem foi REALMENTE enviada
  let responseSuccessful = false;
  let responseRequeuedForFreshInbound = false;
  let responseRequeuedForTransportRetry = false;
  let shouldRunAttentionOnlyForDisabledConversation = false;
  let finalizedPendingState: {
    kind: "completed" | "failed" | "skipped";
    reason?: string;
  } | null = null;

  const finalizePendingState = async (
    kind: "completed" | "failed" | "skipped",
    reason?: string,
    lastError?: string,
  ): Promise<void> => {
    finalizedPendingState = { kind, reason };

    if (kind === "completed") {
      await storage.markPendingAIResponseCompleted(conversationId, pendingMutationGuard);
      return;
    }

    if (kind === "skipped") {
      await storage.markPendingAIResponseSkipped(conversationId, reason || "skipped", pendingMutationGuard);
      return;
    }

    await storage.markPendingAIResponseFailed(conversationId, reason || "failed", lastError, pendingMutationGuard);
  };

  try {
    // ?? CRï¿½TICO: Verificar se IA foi desativada ANTES de processar timer
    // Bug: Timer criado quando IA ativa pode executar depois que IA foi desativada
    const isAgentDisabled = await storage.isAgentDisabledForConversation(conversationId);
    shouldRunAttentionOnlyForDisabledConversation = isAgentDisabled && !pending.forceRespond;
    if (shouldRunAttentionOnlyForDisabledConversation) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`?? [AI AGENT] IA DESATIVADA - usando classificação de atenção sem resposta`);
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   contactNumber: ${contactNumber}`);
      console.log(`   ?? IA foi desativada entre criaï¿½ï¿½o e execuï¿½ï¿½o do timer`);
      console.log(`${'!'.repeat(60)}\n`);
    }

    // Remover da fila de pendentes
    pendingResponses.delete(conversationId);

    const totalWaitTime = ((Date.now() - pending.startTime) / 1000).toFixed(1);
    console.log(`\n?? [AI AGENT] =========== PROCESSANDO RESPOSTA ===========`);
    console.log(`   ?? Aguardou ${totalWaitTime}s | ${pending.messages.length} mensagem(s) acumulada(s)`);
    console.log(`   ?? Contato: ${contactNumber}`);
    if (pending.isCTWAFallback) {
      console.log(`   ?? CTWA FALLBACK: IA vai receber contexto de cliente via Meta Ads`);
    }
    if (pendingFirstMessageRecovery) {
      console.log(
        `   [PENDING-FIRST-MESSAGE] Contexto estruturado ativo source=${pendingFirstMessageRecovery.source}`,
      );
    }

    const conversationRecord = await storage.getConversation(conversationId);
    if (!conversationRecord) {
      console.warn(`?? [AI AGENT] Conversa ${conversationId} nï¿½o encontrada. Marcando timer como skipped.`);
      await finalizePendingState("skipped", "conversation_not_found");
      return;
    }

    const effectiveConnectionId = conversationRecord.connectionId || connectionId;
    if (!effectiveConnectionId) {
      console.warn(`?? [AI AGENT] Sem connectionId para conversa ${conversationId}. Marcando timer como failed.`);
      await finalizePendingState(
        "failed",
        "missing_connection_id",
        "Conversation has no connection scope",
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
        `?? [AI AGENT] Escopo invï¿½lido de conexï¿½o para conversa ${conversationId}. connectionId=${effectiveConnectionId}`,
      );
      await finalizePendingState(
        "failed",
        "connection_scope_invalid",
        `Connection ${effectiveConnectionId} not owned by user ${userId}`,
      );
      return;
    }

    if (scopedConnection.aiEnabled === false) {
      console.log(`[AI AGENT] IA desativada para conexao ${effectiveConnectionId} - timer cancelado`);
      await finalizePendingState("skipped", "connection_ai_disabled");
      return;
    }

    let conversationHistory = await storage.getMessagesByConversationId(conversationId);
    const qrReconnectCutoffMsForPending = getQrReconnectCutoffMs(scopedConnection);
    if (qrReconnectCutoffMsForPending && !pending.forceRespond && !pendingFirstMessageRecovery) {
      const recentUnansweredTexts = getUnansweredInboundTextsAtOrAfterQrReconnectCutoff(
        conversationHistory,
        qrReconnectCutoffMsForPending,
      );

      if (recentUnansweredTexts.length === 0) {
        console.log(
          `[QR BACKLOG] Timer ignorado: conversa ${conversationId} so tem pendencia anterior ao QR reconnect`,
        );
        await finalizePendingState("skipped", QR_RECONNECT_BACKLOG_CUTOFF_REASON);
        return;
      }

      pending.messages = recentUnansweredTexts;
      pendingMessagesForAI = pending.messages;
    }

    const stubNormalization = await normalizePendingStubForAI({
      pending,
      conversationRecord,
      conversationHistory,
    });
    if (stubNormalization.applied) {
      conversationHistory = stubNormalization.conversationHistory;
      pendingFirstMessageRecovery = undefined;
      pending.pendingFirstMessageRecovery = undefined;
      pendingMessagesForAI = pending.messages;
    }

    const effectiveContactNumber = conversationRecord.contactNumber || contactNumber;
    const isExcluded = await storage.isNumberExcluded(userId, effectiveContactNumber);
    if (isExcluded) {
      console.log(`?? [AI AGENT] Timer cancelado porque ${effectiveContactNumber} entrou na lista de exclusÃ£o`);
      await finalizePendingState("skipped", "number_excluded");
      return;
    }

    let unansweredInboundRecords = collectUnansweredInboundMessageRecords(conversationHistory);
    let pendingPayloadHasAudioPlaceholder = pending.messages.some((message) =>
      isPendingAudioTranscriptionText(message),
    );
    let historyHasPendingAudioTranscription = hasPendingInboundAudioTranscription(unansweredInboundRecords);

    if (pendingPayloadHasAudioPlaceholder || historyHasPendingAudioTranscription) {
      console.log(
        `[AUDIO TRANSCRIPTION] Conversa ${conversationId} tem audio inbound pendente antes da IA. Tentando transcrever antes de responder.`,
      );

      const transcriptionRetry = await storage.retryPendingAudioTranscriptionsForConversation(
        conversationId,
        { limit: 30 },
      );

      if (transcriptionRetry.updatedCount > 0) {
        conversationHistory = await storage.getMessagesByConversationId(conversationId);
        unansweredInboundRecords = collectUnansweredInboundMessageRecords(conversationHistory);
        const refreshedPendingMessages = collectUnansweredInboundTexts(conversationHistory);
        if (refreshedPendingMessages.length > 0) {
          pending.messages = refreshedPendingMessages;
          await storage.replacePendingAIResponseMessages(conversationId, pending.messages);
          pendingMutationGuard.expectedMessages = [...pending.messages];
          pendingMutationGuard.notUpdatedAfter = new Date(Date.now() + 5000);
        }
      }

      pendingPayloadHasAudioPlaceholder = pending.messages.some((message) =>
        isPendingAudioTranscriptionText(message),
      );
      historyHasPendingAudioTranscription = hasPendingInboundAudioTranscription(unansweredInboundRecords);

      if (pendingPayloadHasAudioPlaceholder || historyHasPendingAudioTranscription) {
        const lastError = transcriptionRetry.lastError || "Audio pendente de transcricao.";

        if (transcriptionRetry.retryableFailure) {
          const retryDelayMs = resolveAudioTranscriptionPendingRetryDelayMs({
            retryAfterMs: transcriptionRetry.retryAfterMs,
            retryCount: pending.retryCount,
            responseDelaySeconds: responseDelaySecondsForRetry,
          });
          const retryDelaySec = Math.ceil(retryDelayMs / 1000);

          await storage.resetPendingAIResponseForRetry(
            conversationId,
            retryDelaySec,
            pendingMutationGuard,
            { lastError },
          );

          reschedulePendingResponse(
            conversationId,
            pending,
            retryDelayMs,
            "audio_transcription_retry",
          );
          console.warn(
            `[AUDIO TRANSCRIPTION] IA aguardando transcricao retryable na conversa ${conversationId}; retry em ${retryDelaySec}s.`,
          );
          conversationsBeingProcessed.delete(conversationId);
          return;
        }

        try {
          await storage.updateConversation(conversationId, {
            needsHumanAttention: true,
            attentionPriority: "high",
            attentionReason: "Audio do cliente precisa ser transcrito antes da IA responder.",
            attentionQualifiedAt: new Date(),
          });
        } catch (attentionError) {
          console.warn(
            `[AUDIO TRANSCRIPTION] Falha ao marcar atencao humana para audio sem transcricao ${conversationId}:`,
            attentionError,
          );
        }

        await finalizePendingState(
          "failed",
          transcriptionRetry.permanentFailure
            ? "audio_transcription_unavailable"
            : "audio_transcription_pending_without_media",
          lastError,
        );
        console.warn(
          `[AUDIO TRANSCRIPTION] IA bloqueada na conversa ${conversationId}: ${lastError}`,
        );
        return;
      }
    }

    const pendingOnlyHasTechnicalStub =
      !pendingFirstMessageRecovery &&
      pending.messages.length > 0 &&
      pending.messages.every((message) => isTechnicalStubMessage(message));
    if (pendingOnlyHasTechnicalStub) {
      try {
        await storage.updateConversation(conversationId, {
          needsHumanAttention: true,
          attentionPriority: "high",
          attentionReason: "Mensagem recebida ainda carregando. Confira a conversa antes de responder.",
          attentionQualifiedAt: new Date(),
        });
      } catch (attentionError) {
        console.warn(
          `[STUB-PENDING] Falha ao marcar atencao humana para conversa ${conversationId}:`,
          attentionError,
        );
      }

      await finalizePendingState("skipped", "incoming_stub_unresolved");
      console.warn(`[STUB-PENDING] IA bloqueada na conversa ${conversationId}: mensagem incompleta sem payload real.`);
      return;
    }

    if (!pendingFirstMessageRecovery && !pending.isCTWAFallback && !pending.forceRespond) {
      const latestUnansweredTextsForAI = resolveLatestUnansweredTextsForPending(
        conversationHistory,
        qrReconnectCutoffMsForPending,
      );

      if (
        latestUnansweredTextsForAI.length > 0 &&
        !arePendingMessageBatchesEquivalent(pendingMessagesForAI, latestUnansweredTextsForAI)
      ) {
        console.log(
          `[AI AGENT] Payload pendente sincronizado com mensagens inbound sem resposta ` +
            `(antes=${pendingMessagesForAI.length}, depois=${latestUnansweredTextsForAI.length}) ` +
            `conversation=${conversationId}`,
        );

        pending.messages = latestUnansweredTextsForAI;
        pendingMessagesForAI = latestUnansweredTextsForAI;
        pendingMutationGuard.expectedMessages = [...pending.messages];
        pendingMutationGuard.notUpdatedAfter = new Date(Date.now() + 5000);

        try {
          await storage.replacePendingAIResponseMessages(conversationId, pending.messages);
        } catch (syncError) {
          console.warn(
            `[AI AGENT] Falha ao persistir sincronizacao do payload pendente ${conversationId}:`,
            syncError,
          );
        }
      }
    }
    const pendingInboundRecordSignatureForAI = resolveLatestUnansweredInboundBatchForPending(
      conversationHistory,
      qrReconnectCutoffMsForPending,
    ).signatures;

    const automationGuardDecision = await evaluateInboundAutomationGuard({
      userId,
      connectionId: effectiveConnectionId,
      conversationId,
      contactNumber: effectiveContactNumber,
      contactName: conversationRecord.contactName || null,
      inboundText: pendingMessagesForAI.join("\n\n"),
      conversationHistory,
    });

    if (automationGuardDecision.shouldBlock) {
      await applyInboundAutomationGuardBlock({
        userId,
        conversation: conversationRecord,
        reason: automationGuardDecision.reason,
        reasonCode: automationGuardDecision.reasonCode,
      });
      responseSuccessful = true;
      return;
    }

    let lastCustomerAt: Date | null = null;
    let lastAgentAt: Date | null = null;
    let lastOwnerAt: Date | null = null;

    // Idempotency: if the conversation already has a reply (owner or agent) newer than
    // the last customer message, this timer is obsolete and must not re-send.
    try {
      const lastMessageTimes = await storage.getConversationLastMessageTimes(conversationId);
      lastCustomerAt = lastMessageTimes.lastCustomerAt ? new Date(lastMessageTimes.lastCustomerAt) : null;
      lastAgentAt = lastMessageTimes.lastAgentAt ? new Date(lastMessageTimes.lastAgentAt) : null;
      lastOwnerAt = lastMessageTimes.lastOwnerAt ? new Date(lastMessageTimes.lastOwnerAt) : null;
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
      console.log(`?? [AI Agent] BLOQUEIO: Session/socket nï¿½o disponï¿½vel`);
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
          console.log(`?? [AI AGENT] Sessï¿½o ausente mas DB=connected. Forï¿½ando reconnect (conn=${connectionState.id.substring(0, 8)}, user=${userId.substring(0, 8)})`);
          void connectWhatsApp(userId, connectionState.id, { source: "ai_missing_session_recovery" }).catch((reconnectErr) => {
            console.error(`?? [AI AGENT] Falha ao disparar reconnect por sessï¿½o indisponï¿½vel:`, reconnectErr);
          });
        }
      }

      if (!isConnectionMarkedConnected && pendingAgeMs >= SESSION_UNAVAILABLE_MAX_AGE_MS) {
        console.warn(`?? [AI AGENT] Timer antigo sem sessï¿½o e conexï¿½o offline (${Math.round(pendingAgeMs / 60000)}min). Marcando como failed para evitar loop infinito.`);
        try {
          await finalizePendingState(
            "failed",
            "session_unavailable_offline",
            `Session offline for ${Math.round(pendingAgeMs / 60000)}min, connection disconnected in DB`,
          );
        } catch (dbErr) {
          console.error(`?? [AI AGENT] Erro ao marcar timer como failed:`, dbErr);
        }
        conversationsBeingProcessed.delete(conversationId);
        return;
      }

      const retryDelayMs = isConnectionMarkedConnected
        ? SESSION_AVAILABLE_RETRY_MS
        : SESSION_UNAVAILABLE_RETRY_MS;
      (pending as any)._lastErrorMsg = isConnectionMarkedConnected
        ? "session_unavailable_db_connected_retry"
        : "session_unavailable_offline_retry";

      console.log(`?? [AI AGENT] Reagendando timer para ${contactNumber} em ${Math.round(retryDelayMs / 1000)}s (sessï¿½o indisponï¿½vel, connected=${isConnectionMarkedConnected})...`);
      
      const retryPending: PendingResponse = {
        timeout: null as any,
        messages: [...pending.messages],
        conversationId,
        userId,
        connectionId: connectionState?.id || effectiveConnectionId,
        contactNumber,
        jidSuffix,
        startTime: pending.startTime, // Manter tempo original
        isCTWAFallback: pending.isCTWAFallback, // Preservar flag CTWA no retry
        pendingFirstMessageRecovery: pending.pendingFirstMessageRecovery,
        forceRespond: pending.forceRespond,
        retryCount: pending.retryCount,
        responseDelaySeconds: responseDelaySecondsForRetry ?? undefined,
      };
      
      retryPending.timeout = schedulePendingResponseProcessing(
        retryPending,
        retryDelayMs,
        `session_retry:${contactNumber}`,
      );
      
      pendingResponses.set(conversationId, retryPending);
      
      // Atualizar execute_at no banco para refletir o novo horï¿½rio
      try {
        const retryDelaySec = Math.ceil(retryDelayMs / 1000);
        await storage.resetPendingAIResponseForRetry(conversationId, retryDelaySec, pendingMutationGuard, {
          lastError: (pending as any)._lastErrorMsg,
        });
        responseRequeuedForTransportRetry = true;
        console.log(`?? [AI AGENT] Timer reagendado no banco para retry de transporte em ${retryDelaySec}s`);
      } catch (dbErr) {
        console.error(`?? [AI AGENT] Erro ao reagendar no banco:`, dbErr);
      }
      
      // Remover do processamento para permitir retry
      conversationsBeingProcessed.delete(conversationId);
      return;
    }
    
    // ? FIX: Verificar se o socket estï¿½ REALMENTE pronto para enviar
    // O session pode existir mas o WebSocket interno pode estar fechado/reconectando
    // Sem essa verificaï¿½ï¿½o, gastamos tokens de LLM e depois falhamos no envio
    const socketUser = currentSession.socket?.user;
    const socketWs = (currentSession.socket as any)?.ws;
    const wsReadyState = socketWs?.readyState;
    
    // WebSocket.OPEN = 1. Se != 1, o socket nï¿½o estï¿½ pronto para enviar
    if (!socketUser || (wsReadyState !== undefined && wsReadyState !== 1)) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`? [AI Agent] BLOQUEIO: Socket existe mas WebSocket Nï¿½O estï¿½ OPEN`);
      console.log(`   userId: ${userId}`);
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   contactNumber: ${contactNumber}`);
      console.log(`   socketUser: ${socketUser ? 'sim' : 'nï¿½o'}`);
      console.log(`   wsReadyState: ${wsReadyState} (OPEN=1)`);
      console.log(`   ?? Socket reconectando, retry rï¿½pido em ${CONNECTION_CLOSED_RETRY_MS/1000}s`);
      console.log(`${'!'.repeat(60)}\n`);

      (pending as any)._lastErrorMsg = `socket_not_open_retry readyState=${wsReadyState ?? 'unknown'} socketUser=${socketUser ? 'yes' : 'no'}`;

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
          console.log(`?? [AI AGENT] Socket nï¿½o OPEN mas DB=connected. Forï¿½ando reconnect (conn=${socketConnectionState.id.substring(0, 8)}, user=${userId.substring(0, 8)})`);
          void connectWhatsApp(userId, socketConnectionState.id, { source: "ai_socket_not_open_recovery" }).catch((reconnectErr) => {
            console.error(`?? [AI AGENT] Falha ao disparar reconnect por socket nï¿½o OPEN:`, reconnectErr);
          });
        }
      }
      
      const retryPending: PendingResponse = {
        timeout: null as any,
        messages: [...pending.messages],
        conversationId,
        userId,
        connectionId: effectiveConnectionId,
        contactNumber,
        jidSuffix,
        startTime: pending.startTime,
        isCTWAFallback: pending.isCTWAFallback,
        pendingFirstMessageRecovery: pending.pendingFirstMessageRecovery,
        forceRespond: pending.forceRespond,
        retryCount: pending.retryCount,
        responseDelaySeconds: responseDelaySecondsForRetry ?? undefined,
      };
      
      retryPending.timeout = schedulePendingResponseProcessing(
        retryPending,
        CONNECTION_CLOSED_RETRY_MS,
        `socket_not_ready_retry:${contactNumber}`,
      );
      
      pendingResponses.set(conversationId, retryPending);
      
      try {
        const retryDelaySec = Math.ceil(CONNECTION_CLOSED_RETRY_MS / 1000);
        await storage.resetPendingAIResponseForRetry(conversationId, retryDelaySec, pendingMutationGuard, {
          lastError: (pending as any)._lastErrorMsg,
        });
        responseRequeuedForTransportRetry = true;
      } catch (dbErr) {
        console.error(`?? [AI AGENT] Erro ao reagendar no banco:`, dbErr);
      }
      
      conversationsBeingProcessed.delete(conversationId);
      return;
    }
    
    // ?? CHECK DE LIMITE DE MENSAGENS E PLANO VENCIDO
    // Sem plano ativo continua no Gratis; prioridade/espera e controlada pelo Modo Economico.
    const legacyTrialBlockDisabled = Number.MAX_SAFE_INTEGER;
    const connection = scopedConnection;
    if (connection) {
      const entitlement = await getAccessEntitlement(userId);
      
      // ? CORREï¿½ï¿½O: Verificar status E se o plano estï¿½ vencido por data
      const hasActiveSubscription = entitlement.hasActiveSubscription;
      const isSubscriptionExpired = entitlement.isExpired;
      const isSubscriptionPendingPayment = entitlement.isPendingReceiptAccess && !hasActiveSubscription;
      
      if (entitlement.isPendingReceiptAccess) {
        console.log(`?? [AI AGENT] Comprovante pendente de aprovacao para user ${userId.substring(0, 8)}...`);
      }
      
      // ?? Verificar se o plano estï¿½ vencido pela data_fim
      
      // ?? Verificar tambï¿½m pelo next_payment_date (para assinaturas recorrentes)
      
      if (isSubscriptionExpired) {
        console.log(`?? [AI AGENT] Assinatura vencida bloqueou resposta automatica para user ${userId.substring(0, 8)}...`);
        try {
          await finalizePendingState("skipped", "subscription_expired");
        } catch (e) { /* ignora */ }
        conversationsBeingProcessed.delete(conversationId);
        return;
      }

      if (isSubscriptionPendingPayment) {
        console.log(`?? [AI AGENT] Pagamento pendente bloqueou resposta automatica para user ${userId.substring(0, 8)}...`);
        try {
          await finalizePendingState("skipped", "subscription_pending_payment");
        } catch (e) { /* ignora */ }
        conversationsBeingProcessed.delete(conversationId);
        return;
      }

      if (!hasActiveSubscription) {
        const agentMessagesCount = await storage.getAgentMessagesCount(connection.id);
        
        // Guarda legada mantida apenas por compatibilidade; vencidos retornam antes deste ponto.
        if (isSubscriptionExpired) {
          console.log(`?? [AI AGENT] Guarda legada de vencido inesperadamente acionada.`);
          console.log(`   ?? Mensagens historicas: ${agentMessagesCount}`);
          
          // Bloco legado mantido desativado por compatibilidade; Gratis nao bloqueia por contador antigo.
          if (agentMessagesCount >= legacyTrialBlockDisabled) {
            console.log(`\n${'!'.repeat(60)}`);
            console.log(`?? [AI AGENT] BLOQUEIO legado desativado para Gratis/Modo Economico`);
            console.log(`   userId: ${userId}`);
            console.log(`   contactNumber: ${contactNumber}`);
            console.log(`   Mensagens historicas: ${agentMessagesCount}`);
            console.log(`   ?? IA PAUSADA para este cliente - precisa renovar assinatura`);
            console.log(`   ?? Timer marcado como COMPLETED (sem retry - bloqueio permanente)`);
            console.log(`${'!'.repeat(60)}\n`);
            // ?? FIX: Marcar como completed para PARAR retry loop infinito
            // Gratis/Modo Economico nao bloqueia por contador antigo.
            try {
              await finalizePendingState("completed");
            } catch (e) { /* ignora */ }
            conversationsBeingProcessed.delete(conversationId);
            return;
          }
        }
        
        if (agentMessagesCount >= legacyTrialBlockDisabled) {
          console.log(`\n${'!'.repeat(60)}`);
          console.log(`?? [AI AGENT] BLOQUEIO legado desativado`);
          console.log(`   userId: ${userId}`);
          console.log(`   contactNumber: ${contactNumber}`);
          console.log(`   Mensagens historicas: ${agentMessagesCount}`);
          console.log(`   ?? Usuario segue no Gratis/Modo Economico`);
          console.log(`   ?? Timer marcado como COMPLETED (sem retry - bloqueio permanente)`);
          console.log(`${'!'.repeat(60)}\n`);
          // ?? FIX: Marcar como completed para PARAR retry loop infinito
          // Contador antigo nao deve gerar bloqueio permanente.
          try {
            await finalizePendingState("completed");
          } catch (e) { /* ignora */ }
          conversationsBeingProcessed.delete(conversationId);
          return;
        }
        
        console.log(`?? [AI AGENT] Usuario no Gratis/Modo Economico. Mensagens historicas da conexao: ${agentMessagesCount}.`);
      } else {
        const paidPlanLabel = entitlement.planName || (
          entitlement.source === 'reseller' ? 'Plano Revenda' : 'Plano'
        );
        console.log(`✅ [AI AGENT] Usuário tem plano pago ativo e válido: ${paidPlanLabel}`);
      }
    }
    
    // Combinar todas as mensagens acumuladas
    const combinedText = pendingMessagesForAI.join('\n\n');
    console.log(`   ?? Texto combinado: "${combinedText.substring(0, 150)}..."`);
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
          for (const mediaName of extractTrackedMediaNames(msg.text)) {
            if (!sentMedias.includes(mediaName)) {
              sentMedias.push(mediaName);
            }
          }
        }
        
        // M?todo 2: Detectar tags no campo mediaCaption (novo formato)
        if (msg.mediaCaption) {
          for (const mediaName of extractTrackedMediaNames(msg.mediaCaption)) {
            if (!sentMedias.includes(mediaName)) {
              sentMedias.push(mediaName);
            }
          }
        }
      }
    }
    console.log(`?? [AI AGENT] M?dias j? enviadas: ${sentMedias.length > 0 ? sentMedias.join(', ') : 'nenhuma'}`);
    
    // Verificar se modo hist?rico est? ativo
    const agentConfig = await storage.getAgentConfig(userId);
    responseDelaySecondsForRetry = Number.isFinite(Number(agentConfig?.responseDelaySeconds))
      ? Number(agentConfig?.responseDelaySeconds)
      : responseDelaySecondsForRetry;
    
    if (agentConfig?.fetchHistoryOnFirstResponse) {
      console.log(`?? [AI AGENT] Modo hist?rico ATIVO - ${conversationHistory.length} mensagens dispon?veis para contexto`);
      
      if (conversationHistory.length > 40) {
        console.log(`?? [AI AGENT] Hist?rico grande - ser? usado sistema de resumo inteligente`);
      }
    }

    const normalizedInbound = pendingFirstMessageRecovery
      ? {
          text: combinedText,
          wasNormalized: false,
          reason: "pending_first_message_structured_context",
        }
      : normalizeInitialStubMessageForAI(combinedText, conversationHistory);
    const inboundTextForAI = normalizedInbound.text;
    if (normalizedInbound.wasNormalized) {
      console.log(
        `?? [AI AGENT] Mensagem inicial tecnica normalizada para IA (${normalizedInbound.reason}) em ${conversationId}: "${combinedText.substring(0, 80)}" -> "${inboundTextForAI}"`,
      );
    }

    const pendingTriggerMatch = pendingFirstMessageRecovery
      ? { matched: true, foundIn: "no-filter" as const }
      : evaluateAgentTriggerMatch({
          triggerPhrases: agentConfig?.triggerPhrases,
          currentMessages: pendingMessagesForAI,
          conversationHistory,
        });

    if (!pendingTriggerMatch.matched) {
      console.log(
        `[AI AGENT] Timer ignorado: conversa ${conversationId} nao contem frase gatilho do cliente`,
      );
      await finalizePendingState("skipped", "trigger_not_found");
      return;
    }

    const attentionOnlySkipReason =
      shouldRunAttentionOnlyForDisabledConversation
        ? "agent_disabled"
        : scopedConnection.aiEnabled === false
          ? "connection_ai_disabled"
          : !agentConfig?.isActive
            ? "agent_config_inactive"
            : null;

    if (attentionOnlySkipReason) {
      const attentionAssessment = await classifyConversationAttentionOnly(
        userId,
        conversationHistory,
        inboundTextForAI,
        {
          contactName,
          contactPhone: contactNumber,
        },
      );

      await persistConversationAttentionAssessment({
        userId,
        conversationId,
        conversation: conversationRecord,
        attention: attentionAssessment,
        sourceLabel: attentionOnlySkipReason,
      });

      await finalizePendingState("skipped", attentionOnlySkipReason);
      conversationsBeingProcessed.delete(conversationId);
      return;
    }

    const aiResult = await generateAIResponse(
      userId,
      conversationHistory,
      inboundTextForAI, // ? Texto normalizado para evitar resposta em cima de stub tecnico
      {
        contactName, // ? Nome do cliente para personaliza??o
        contactPhone: contactNumber, // ? Telefone do cliente para agendamento
        sentMedias,  // ? M?dias j? enviadas para evitar repeti??o
        conversationId, // ?? ID da conversa para vincular pedidos de delivery
        isCTWAFallback: pending.isCTWAFallback, // ?? Flag CTWA: IA deve tratar como saudaï¿½ï¿½o de interesse via Meta Ads
        pendingFirstMessageRecovery,
      }
    );

    let realtimeConversation = await persistConversationAttentionAssessment({
      userId,
      conversationId,
      conversation: conversationRecord,
      attention: aiResult?.attention,
      sourceLabel: "auto_reply",
    });

    if (aiResult?.routing) {
      try {
        const routingResult = await applyConversationRoutingDecision({
          ownerId: userId,
          conversationId,
          decision: aiResult.routing,
          handedOffBy: "system",
          routingMethod: "ai_reply_structured_router",
        });

        console.log(
          `🧭 [AI AGENT] Decisão de handoff: mode=${aiResult.routing.mode} sector=${routingResult.sectorId || "sem_setor"} intent=${routingResult.intent || "sem_intent"} reason="${routingResult.reason}"`,
        );

        const routedConversation = await storage.getConversation(conversationId);
        const routingChanged =
          !!routedConversation &&
          (
            String(routedConversation.sectorId || "") !== String(realtimeConversation?.sectorId || conversationRecord.sectorId || "") ||
            String(routedConversation.assignedToMemberId || "") !==
              String(realtimeConversation?.assignedToMemberId || conversationRecord.assignedToMemberId || "") ||
            String(routedConversation.orchestrationMode || "") !==
              String(realtimeConversation?.orchestrationMode || conversationRecord.orchestrationMode || "")
          );

        if (routedConversation && routingChanged) {
          realtimeConversation = routedConversation;
          broadcastToUser(userId, {
            type: "conversation_updated",
            conversationId,
            conversationUpdate: buildConversationRealtimeUpdate(routedConversation),
          });
        }
      } catch (routingError) {
        console.error("🧭 [AI AGENT] Falha ao aplicar handoff estruturado:", routingError);
      }
    }

    // ?? Extrair texto e a??es de m?dia da resposta
    const aiResponse = aiResult?.text || null;
    const mediaActions = aiResult?.mediaActions || [];
    if (!aiResponse && mediaActions.length === 0 && !aiResult?.skipAutoReplyReason) {
      (pending as any)._lastErrorMsg = aiResult
        ? "ai_result_without_text_or_media"
        : "generate_ai_response_returned_null";
    }
    let freshnessCheckedBeforeFirstOutbound = false;
    const ensureFreshnessBeforeFirstOutbound = async (): Promise<boolean> => {
      if (freshnessCheckedBeforeFirstOutbound) {
        return false;
      }
      freshnessCheckedBeforeFirstOutbound = true;
      if (pendingFirstMessageRecovery || pending.isCTWAFallback || pending.forceRespond) {
        return false;
      }
      return refreshPendingAIResponseBeforeSend({
        conversationId,
        pending,
        pendingMessagesForAI,
        pendingInboundRecordSignatureForAI,
        pendingMutationGuard,
        qrReconnectCutoffMs: qrReconnectCutoffMsForPending,
      });
    };

    if (!aiResponse && mediaActions.length === 0 && aiResult?.skipAutoReplyReason) {
      if (await ensureFreshnessBeforeFirstOutbound()) {
        responseRequeuedForFreshInbound = true;
        return;
      }

      const codexNoSendRetry = await executeRetryableCodexNoSend({
        aiResult,
        conversationId,
        pending,
        pendingMutationGuard,
        pendingRetryCounter,
        maxRetries: MAX_CODEX_NO_SEND_RETRIES,
        responseDelaySecondsForRetry,
        resolveDelaySeconds: resolvePendingAIResponseRetryDelaySeconds,
        resetPendingAIResponseForRetry: storage.resetPendingAIResponseForRetry.bind(storage),
        updateConversation: storage.updateConversation.bind(storage),
        finalizePendingState,
        onAttentionError: (attentionError, failureReason) => {
          console.warn(
            `[AI AGENT] Falha ao marcar atencao humana apos ${failureReason}:`,
            attentionError,
          );
        },
      });
      if (codexNoSendRetry) {
        if (codexNoSendRetry.status === "requeued") {
          responseRequeuedForTransportRetry = true;
          console.warn(
            `[AI AGENT] Codex no_send tecnico reagendado retry ` +
              `${codexNoSendRetry.currentRetries}/${MAX_CODEX_NO_SEND_RETRIES} ` +
              `em ${codexNoSendRetry.backoffSec}s (${codexNoSendRetry.reason})`,
          );
        }
        return;
      }

      console.log(
        `[AI AGENT] Codex/IA decidiu nao enviar resposta publica para ${contactNumber}; ` +
          `finalizando pendencia como skipped (${aiResult.skipAutoReplyReason}).`,
      );
      await finalizePendingState("skipped", aiResult.skipAutoReplyReason);
      return;
    }

    if (await ensureFreshnessBeforeFirstOutbound()) {
      responseRequeuedForFreshInbound = true;
      return;
    }

    // ?? NOTIFICATION SYSTEM UNIVERSAL (AI + Manual + Resposta do Agente)
    const businessConfig = await storage.getBusinessAgentConfig(userId);
    
    // ?? DEBUG: Log detalhado do businessConfig para diagnï¿½stico
    console.log(`?? [NOTIFICATION DEBUG] userId: ${userId}`);
    console.log(`?? [NOTIFICATION DEBUG] businessConfig exists: ${!!businessConfig}`);
    if (businessConfig) {
      console.log(`?? [NOTIFICATION DEBUG] notificationEnabled: ${businessConfig.notificationEnabled}`);
      console.log(`?? [NOTIFICATION DEBUG] notificationMode: ${businessConfig.notificationMode}`);
      console.log(`?? [NOTIFICATION DEBUG] notificationManualKeywords: ${businessConfig.notificationManualKeywords}`);
      console.log(`?? [NOTIFICATION DEBUG] notificationPhoneNumber: ${businessConfig.notificationPhoneNumber}`);
    }
    console.log(`?? [NOTIFICATION DEBUG] clientMessage (combinedText): "${inboundTextForAI?.substring(0, 100)}"`);
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
    // ?? DEBUG: Log da condiï¿½ï¿½o de verificaï¿½ï¿½o
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
      const clientMessage = inboundTextForAI.toLowerCase();
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
    
    // Log completo da deteccao
    if (shouldNotify) {
      console.log(`?? [AI Agent] NOTIFICATION TRIGGERED via: ${keywordSource}`);
    }
    
    // Send notification if triggered
    if (shouldNotify && businessConfig?.notificationPhoneNumber) {
      const notifyNumber = businessConfig.notificationPhoneNumber.replace(/\D/g, '');
      const notifyJid = `${notifyNumber}@s.whatsapp.net`;
      
      // Mensagem de notificacao melhorada com contexto.
      const notifyMessage = `*NOTIFICACAO DO AGENTE*\n\n` +
        `*Motivo:* ${notifyReason}\n` +
        `*Fonte:* ${keywordSource}\n\n` +
        `*Cliente:* ${contactNumber}\n` +
        `*Mensagem do cliente:* "${inboundTextForAI.substring(0, 200)}${inboundTextForAI.length > 200 ? '...' : ''}"\n` +
        (aiResponse ? `*Resposta do agente:* "${aiResponse.substring(0, 200)}${aiResponse.length > 200 ? '...' : ''}"` : '');
      
      if (isProtectedAgenteZapAdminNumber(notifyNumber)) {
        console.log(`[AI Agent] Bloqueando notificacao automatica para numero protegido do admin: ${notifyNumber}`);
      } else {
        try {
          // Anti-bloqueio: usar fila do usuario para notificacao.
          await sendWithQueue(userId, 'notificacao NOTIFY', async () => {
            await currentSession.socket.sendMessage(notifyJid, { text: notifyMessage });
          });
          console.log(`?? [AI Agent] Notification sent to ${notifyNumber}`);
        } catch (error) {
          console.error(`? [AI Agent] Failed to send notification to ${notifyNumber}:`, error);
        }
      }
    }

    console.log(`?? [AI Agent] generateAIResponse retornou: ${aiResponse ? `"${aiResponse.substring(0, 100)}..."` : 'NULL'}`);
    if (mediaActions.length > 0) {
      console.log(`?? [AI Agent] ${mediaActions.length} a??es de m?dia: ${mediaActions.map(a => a.media_name).join(', ')}`);
    }

    if (aiResponse || mediaActions.length > 0) {
      // Buscar remoteJid original do banco
      const conversationData = await storage.getConversation(conversationId);
      const jid = conversationData
        ? buildSendJid(conversationData)
        : `${contactNumber}@${jidSuffix || DEFAULT_JID_SUFFIX}`;
      const isProtectedAdminContact =
        isProtectedAgenteZapAdminNumber(contactNumber) ||
        isProtectedAgenteZapAdminNumber(jid) ||
        isProtectedAgenteZapAdminNumber(conversationData?.contactNumber);

      if (isProtectedAdminContact) {
        console.log(`ðŸš« [AI Agent] Resposta automÃ¡tica bloqueada para nÃºmero protegido do admin: ${contactNumber} (conversation=${conversationId})`);
        responseSuccessful = true;
        return;
      }
      const lastCustomerMessage = [...conversationHistory].reverse().find((msg) => !msg.fromMe);
      const customerMessageWasAudio = lastCustomerMessage?.mediaType === "audio";
      const firstAgentReplyInConversation = !lastAgentAt && !lastOwnerAt;
      const audioResponseSettings = await getAudioResponseSettings(userId, {
        customerMessageWasAudio,
        firstAgentReplyInConversation,
      });
      let followUpCycleResetAfterAgentReply = false;
      const resetFollowUpAfterAutomatedAgentReply = async (
        referenceTime: Date = new Date(),
        reason = "IA respondeu ao cliente",
      ) => {
        if (followUpCycleResetAfterAgentReply) {
          return;
        }

        try {
          await userFollowUpService.resetFollowUpCycle(
            conversationId,
            reason,
            referenceTime,
          );
          followUpCycleResetAfterAgentReply = true;
        } catch (error) {
          console.error("Erro ao agendar follow-up:", error);
        }
      };
      const persistAutomatedAgentMessage = async (params: {
        messageId?: string | null;
        text: string;
        previewText: string;
        mediaType?: string | null;
        mediaMimeType?: string | null;
        mediaCaption?: string | null;
        status?: string;
      }) => {
        if (!params.messageId) {
          return null;
        }

        const sentAt = new Date();
        const status = params.status || "queued";
        let savedAgentMsg: any = null;

        try {
          savedAgentMsg = await storage.createMessage({
            conversationId,
            messageId: params.messageId,
            fromMe: true,
            text: params.text,
            timestamp: sentAt,
            status,
            isFromAgent: true,
            mediaType: params.mediaType ?? undefined,
            mediaMimeType: params.mediaMimeType ?? undefined,
            mediaCaption: params.mediaCaption ?? undefined,
          });
        } catch (dbSendErr) {
          console.warn(`?? [AI AGENT] Falha ao salvar mensagem automatica no banco (n?o cr?tico):`, dbSendErr);
        }

        try {
          await storage.updateConversation(conversationId, {
            lastMessageText: params.previewText,
            lastMessageTime: sentAt,
            hasReplied: true,
            lastMessageFromMe: true,
          });
        } catch (dbConvErr) {
          console.warn(`?? [AI AGENT] Falha ao atualizar conversa apos mensagem automatica (n?o cr?tico):`, dbConvErr);
        }

        broadcastToUser(userId, {
          type: "message_sent",
          conversationId,
          message: params.text,
          messageData: savedAgentMsg ? {
            id: savedAgentMsg.id,
            conversationId,
            messageId: savedAgentMsg.messageId,
            fromMe: true,
            text: params.text,
            timestamp: savedAgentMsg.timestamp || sentAt.toISOString(),
            isFromAgent: true,
            status,
            mediaType: params.mediaType ?? null,
            mediaUrl: null,
            mediaMimeType: params.mediaMimeType ?? null,
            mediaCaption: params.mediaCaption ?? null,
          } : {
            conversationId,
            messageId: params.messageId,
            fromMe: true,
            text: params.text,
            timestamp: sentAt.toISOString(),
            isFromAgent: true,
            status,
            mediaType: params.mediaType ?? null,
            mediaUrl: null,
            mediaMimeType: params.mediaMimeType ?? null,
            mediaCaption: params.mediaCaption ?? null,
          },
          conversationUpdate: {
            id: conversationId,
            connectionId: conversationData?.connectionId || effectiveConnectionId,
            contactNumber: conversationData?.contactNumber || contactNumber,
            contactName: conversationData?.contactName,
            contactAvatar: conversationData?.contactAvatar,
            lastMessageText: params.previewText,
            lastMessageTime: sentAt.toISOString(),
            lastMessageFromMe: true,
            unreadCount: 0,
          },
        });

        await resetFollowUpAfterAutomatedAgentReply(sentAt);

        return savedAgentMsg;
      };
      let textSentToCustomer = false;
      let audioSent = false;
      let mediaActionsSent = false;
      let aiSignatureName: string | null = null;
      
      if (aiResponse) {
      // ?? ANTI-DUPLICA??O: Verificar se resposta j? foi enviada recentemente
      // NOTE: N?o chamar canSendMessage aqui antes do envio. A fila (messageQueueService) j? faz o dedupe
      // e o pre-check registrava a mensagem como enviada, fazendo o envio real ser BLOQUEADO.

      if (isRecentDuplicate(conversationId, aiResponse)) {
        console.log(`?? [AI AGENT] ?? Resposta ID?NTICA j? enviada nos ?ltimos 2 minutos, IGNORANDO duplicata`);
        console.log(`   ?? Texto: "${aiResponse.substring(0, 100)}..."`);
        await finalizePendingState("skipped", "recent_duplicate_cache_blocked");
        return;
      }

      const recentAutomatedReplyConflict = findRecentAutomatedReplyConflict(
        conversationHistory,
        lastCustomerAt,
        aiResponse,
      );
      if (recentAutomatedReplyConflict) {
        console.log(
          `?? [AI AGENT] Resposta automatica bloqueada por similaridade apos a ultima mensagem do cliente (${(recentAutomatedReplyConflict.similarity * 100).toFixed(0)}%).`,
        );
        console.log(
          `   ?? Texto anterior: "${recentAutomatedReplyConflict.matchedText.substring(0, 120)}..."`,
        );
        await finalizePendingState("skipped", "recent_automatic_reply_similarity_blocked");
        return;
      }

      // ?? Registrar resposta no cache anti-duplica??o
      registerSentMessageCache(conversationId, aiResponse);
      
      // ?? HUMANIZA??O: Quebrar mensagens longas em m?ltiplas
      const agentConfig = await storage.getAgentConfig(userId);
      const maxChars = agentConfig?.messageSplitChars ?? 400;
      const messageParts = splitMessageHumanLike(aiResponse, maxChars);
      const normalizedAiResponse = joinBubbleMessages(messageParts);
      aiSignatureName =
        agentConfig?.aiSignatureEnabled === true
          ? resolveAgentSignatureName({
              configuredSignature: agentConfig.aiSignature,
              prompt: agentConfig.prompt,
            }) || "Agente"
          : null;
      const signedAgentResponse =
        aiSignatureName && audioResponseSettings.shouldSendText
          ? messageParts.map((messagePart) => prependWhatsappSignature(messagePart, aiSignatureName)).join("\n\n")
          : normalizedAiResponse;
      
      console.log(`[AI Agent] Sending to original JID: ${jid} (${messageParts.length} parts)`);
      
      const processTextResponse = async (sendToWhatsApp: boolean): Promise<boolean> => {
        let deliveredToCustomer = false;

        for (let i = 0; i < messageParts.length; i++) {
          const part = messageParts[i];
          const outboundText =
            sendToWhatsApp && aiSignatureName
              ? prependWhatsappSignature(part, aiSignatureName)
              : part;
          const finalOutboundText = normalizeOutboundTextForCustomer(outboundText);
          const isLast = i === messageParts.length - 1;
          let savedAgentMsg: any = null;
          let queueResult: { success?: boolean; messageId?: string; error?: string } = {
            success: true,
            messageId: sendToWhatsApp ? undefined : `audio-transcript-${Date.now()}-${i}`,
          };

          if (sendToWhatsApp) {
            queueResult = await messageQueueService.enqueue(userId, jid, finalOutboundText, {
              isFromAgent: true,
              conversationId,
              connectionId: effectiveConnectionId,
              priority: 'high',
              latestCustomerMessageAt: lastCustomerAt,
            });
          }

          if (queueResult.messageId === AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID) {
            await finalizePendingState("skipped", "automation_paused_by_owner_reply");
            console.log(`⏸️ [AI AGENT] Parte bloqueada porque a conversa foi pausada manualmente.`);
            break;
          }

          if (queueResult.messageId !== 'DEDUPLICATED_BLOCKED' && queueResult.success !== false) {
            const messageId = queueResult.messageId || `${Date.now()}-${i}`;

            if (sendToWhatsApp) {
              trackSharedAutomaticOutgoingMessage({
                messageId,
                contactNumber,
                text: finalOutboundText,
                isFromAgent: true,
                source: "customer_ai_text",
              });
            }

            try {
              savedAgentMsg = await storage.createMessage({
                conversationId: conversationId,
                messageId,
                fromMe: true,
                text: finalOutboundText,
                timestamp: new Date(),
                status: sendToWhatsApp ? "queued" : "sent",
                isFromAgent: true,
              });
            } catch (dbSendErr) {
              console.warn(`?? [AI AGENT] Falha ao salvar mensagem enviada no banco (n?o cr?tico):`, dbSendErr);
            }
          } else {
            console.log(`??? [AI AGENT] Parte bloqueada por dedupe (j? enviada antes). Pulando persist?ncia no DB.`);
            if (queueResult.messageId === 'DEDUPLICATED_BLOCKED') {
              await finalizePendingState("skipped", "duplicate_automatic_reply_blocked");
              break;
            }
          }

          if (isLast) {
            try {
              await storage.updateConversation(conversationId, {
                lastMessageText: finalOutboundText,
                lastMessageTime: new Date(),
                hasReplied: true,
                lastMessageFromMe: true,
              });
            } catch (dbConvErr) {
              console.warn(`?? [AI AGENT] Falha ao atualizar conversa no banco (n?o cr?tico):`, dbConvErr);
            }
            broadcastToUser(userId, {
              type: "agent_response",
              conversationId: conversationId,
              message: signedAgentResponse,
              messageData: savedAgentMsg ? {
                id: savedAgentMsg.id,
                conversationId: conversationId,
                messageId: savedAgentMsg.messageId,
                fromMe: true,
                text: finalOutboundText,
                timestamp: new Date().toISOString(),
                isFromAgent: true,
                mediaType: null,
                mediaUrl: null,
              } : undefined,
              conversationUpdate: {
                id: conversationId,
                lastMessageText: finalOutboundText,
                lastMessageTime: new Date().toISOString(),
                lastMessageFromMe: true,
              },
            });
          }

          console.log(
            sendToWhatsApp
              ? `[AI Agent] Part ${i + 1}/${messageParts.length} SENT to WhatsApp ${contactNumber}`
              : `[AI Agent] Part ${i + 1}/${messageParts.length} registrada apenas como transcricao interna do audio`
          );

          if (
            sendToWhatsApp &&
            queueResult.success !== false &&
            queueResult.messageId !== 'DEDUPLICATED_BLOCKED' &&
            queueResult.messageId !== AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID
          ) {
            deliveredToCustomer = true;
            await resetFollowUpAfterAutomatedAgentReply(new Date());
          }
        }

        return deliveredToCustomer;
      };

      textSentToCustomer = false;
      if (audioResponseSettings.shouldSendText) {
        textSentToCustomer = await processTextResponse(true);
        responseSuccessful = textSentToCustomer;
        if (textSentToCustomer) {
          console.log(`? [AI AGENT] Texto enviado com sucesso (marcando timer como completed ao final)`);
        }
      } else {
        console.log(
          `[AI Agent] Texto suprimido para ${contactNumber}. Mode=${audioResponseSettings.responseMode}, customerMessageWasAudio=${customerMessageWasAudio}`
        );
      }

      audioSent = false;
      try {
        if (audioResponseSettings.shouldGenerateAudio) {
          audioSent = await processAudioResponseForAgent(
            userId,
            jid,
            normalizedAiResponse,
            currentSession.socket,
            {
              customerMessageWasAudio,
              firstAgentReplyInConversation,
              conversationId,
            },
            {
              registerSentMessageId: registerAgentMessageId,
              signatureName: aiSignatureName,
              onSent: async ({ messageId, mediaMimeType }) => {
                if (!messageId) {
                  return;
                }

                trackSharedAutomaticOutgoingMessage({
                  messageId,
                  contactNumber,
                  conversationId,
                  text: `[AUDIO ENVIADO PELO AGENTE]: ${aiResponse}`,
                  mediaType: "audio",
                  mediaMimeType,
                  isFromAgent: true,
                  source: "customer_ai_audio",
                });

                await persistAutomatedAgentMessage({
                  messageId,
                  text: `[AUDIO ENVIADO PELO AGENTE]: ${aiResponse}`,
                  previewText: "[Audio do agente]",
                  mediaType: "audio",
                  mediaMimeType,
                });
              },
              onTextCompanionSent: async ({ messageId, text }) => {
                if (!messageId) {
                  return;
                }

                trackSharedAutomaticOutgoingMessage({
                  messageId,
                  contactNumber,
                  conversationId,
                  text,
                  isFromAgent: true,
                  source: "customer_ai_audio_companion",
                });

                await persistAutomatedAgentMessage({
                  messageId,
                  text,
                  previewText: text,
                });
              },
            }
          );
        }
        if (audioSent) {
          console.log(`[AI Agent] Audio TTS enviado junto com a resposta`);
          responseSuccessful = true;
        }
      } catch (audioError) {
        console.error(`[AI Agent] Erro ao processar audio TTS (nao critico):`, audioError);
      }

      if (!textSentToCustomer && !audioSent && audioResponseSettings.fallbackToTextIfAudioFails) {
        console.warn(`[AI Agent] Audio nao foi enviado. Fazendo fallback para texto em ${contactNumber}`);
        textSentToCustomer = await processTextResponse(true);
        if (textSentToCustomer) {
          responseSuccessful = true;
        }
      }
      
      // ?? EXECUTAR Aï¿½ï¿½ES DE Mï¿½DIA (enviar ï¿½udios, imagens, vï¿½deos)
      }
      if (mediaActions.length > 0) {
        console.log(`?? [AI Agent] Executando ${mediaActions.length} aï¿½ï¿½es de mï¿½dia...`);
        
        const conversationDataForMedia = await storage.getConversation(conversationId);
        const mediaJid = conversationDataForMedia
          ? buildSendJid(conversationDataForMedia)
          : jid;
        let flowTextAudioHandled = false;
        
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
        
        try {
        await executeMediaActions({
          userId,
          jid: mediaJid,
          conversationId, // Passar conversationId para salvar mensagens de m?dia
          actions: mediaActions,
          socket: currentSession.socket,
          contactName: conversationDataForMedia?.contactName || undefined,
          onOutgoingPersisted: async (sentAt) => {
            mediaActionsSent = true;
            await resetFollowUpAfterAutomatedAgentReply(sentAt);
          },
          onFirstTextActionSent:
            !aiResponse && audioResponseSettings.shouldGenerateAudio
              ? async (text) => {
                  if (flowTextAudioHandled) {
                    return;
                  }

                  flowTextAudioHandled = await processAudioResponseForAgent(
                    userId,
                    mediaJid,
                    text,
                    currentSession.socket,
                    {
                      customerMessageWasAudio,
                      firstAgentReplyInConversation,
                      conversationId,
                    },
                    {
                      signatureName: aiSignatureName,
                    },
                  );
                }
              : undefined,
        });
        } catch (mediaErr) {
          console.error(`?? [AI Agent] Erro ao executar a??es de m?dia (n?o cr?tico):`, mediaErr);
        }
        
        console.log(`?? [AI Agent] M?dias enviadas com sucesso!`);
      }

      // ?? FOLLOW-UP: a resposta automatica da IA precisa reiniciar o ciclo do usuario.
      if (textSentToCustomer || audioSent || mediaActionsSent) {
        await resetFollowUpAfterAutomatedAgentReply(new Date());
      }

      void queueConversationLeadQualification({
        conversationId,
        latestAgentReply: aiResponse || "[fluxo de abertura]",
      });
      void queueConversationCourseSchedulingInsight({
        conversationId,
        latestAgentReply: aiResponse || "[fluxo de abertura]",
      }).then((insight) => {
        if (!insight) {
          return;
        }

        broadcastToUser(userId, {
          type: "course_scheduling_updated",
          conversationId,
          insight,
        });
      });
      void queueConversationAgendamento2Insight({
        conversationId,
        latestAgentReply: aiResponse || "[fluxo de abertura]",
      }).then((insight) => {
        if (!insight) {
          return;
        }

        broadcastToUser(userId, {
          type: "agendamento2_updated",
          conversationId,
          insight,
        });
      });
      
      // So marque sucesso quando houve saida real para o cliente.
      responseSuccessful = textSentToCustomer || audioSent || mediaActionsSent;
      if (responseSuccessful) {
        console.log(`? [AI AGENT] Resposta enviada com sucesso para ${contactNumber}`);
      } else {
        (pending as any)._lastErrorMsg = "no_outbound_delivered_after_ai_response";
        console.warn(
          `?? [AI AGENT] IA gerou resposta/acoes, mas nenhuma saida foi entregue. Timer ficara em retry (${conversationId}).`,
        );
      }
    } else {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`?? [AI Agent] RESPOSTA NULL - Nenhuma resposta gerada!`);
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   contactNumber: ${contactNumber}`);
      console.log(`   Possï¿½veis causas (verifique logs acima para "RETURN NULL"):`);
      console.log(`   1. Usuï¿½rio SUSPENSO`);
      console.log(`   2. Mensagem de BOT detectada`);
      console.log(`   3. agentConfig nï¿½o encontrado ou isActive=false`);
      console.log(`   4. Trigger phrases configuradas mas nenhuma encontrada`);
      console.log(`   5. Erro na API de LLM (timeout, rate limit)`);
      console.log(`${'='.repeat(60)}\n`);
      
      // ? Nï¿½O marcar responseSuccessful - timer serï¿½ mantido como pending para retry
    }
  } catch (error: any) {
    console.error("? [AI AGENT] RETURN NULL #6: Exceï¿½ï¿½o capturada no catch externo:", error);
    // ? FIX: Detectar erro de Connection Closed para retry rï¿½pido
    const errorMsg = error?.message || String(error);
    (pending as any)._lastErrorMsg = errorMsg.substring(0, 500);
    if (errorMsg.includes('Connection Closed') || errorMsg.includes('connection closed')) {
      (pending as any)._connectionClosedError = true;
    }
  } finally {
    // ?? ANTI-DUPLICAï¿½ï¿½O: Remover da lista de conversas em processamento
    conversationsBeingProcessed.delete(conversationId);
    
    // ?? PERSISTENT TIMER: respeitar finalizacao explicita antes de qualquer retry
    const pendingStateForLog = finalizedPendingState as {
      kind: "completed" | "failed" | "skipped";
      reason?: string;
    } | null;
    if (pendingStateForLog) {
      pendingRetryCounter.delete(conversationId);
      console.log(
        `? [AI AGENT] Timer finalizado como ${pendingStateForLog.kind}` +
          (pendingStateForLog.reason ? ` (${pendingStateForLog.reason})` : ""),
      );
    } else if (responseRequeuedForFreshInbound) {
      pendingRetryCounter.delete(conversationId);
      console.log(
        `? [AI AGENT] Timer mantido pendente para reprocessar mensagens inbound mais novas antes do envio.`,
      );
    } else if (responseRequeuedForTransportRetry) {
      console.log(
        `? [AI AGENT] Timer mantido pendente para retry de transporte com last_error registrado.`,
      );
    } else if (responseSuccessful) {
      try {
        await storage.markPendingAIResponseCompleted(conversationId, pendingMutationGuard);
        pendingRetryCounter.delete(conversationId); // ?? Limpar contador de retries
        console.log(`? [AI AGENT] Timer marcado como completed - resposta enviada com sucesso!`);
      } catch (dbError) {
        console.error(`?? [AI AGENT] Erro ao marcar timer como completed (nï¿½o crï¿½tico):`, dbError);
      }
    } else {
      // ? FIX: Se foi erro de Connection Closed, usar retry rï¿½pido com backoff
      const isConnectionClosed = (pending as any)._connectionClosedError === true;
      const errorMsg = (pending as any)._lastErrorMsg || 'unknown';
      
      // ?? FIX 2026-02-25: RETRY COUNTER with exponential backoff
      const persistedRetries = Math.max(0, Number(pending.retryCount || 0));
      const currentRetries = Math.max(
        (pendingRetryCounter.get(conversationId) || 0) + 1,
        persistedRetries + 1,
      );
      pending.retryCount = currentRetries;
      pendingRetryCounter.set(conversationId, currentRetries);
      
      if (currentRetries > MAX_SEND_RETRIES) {
        // ?? MAX RETRIES EXCEEDED - mark as failed with full details
        try {
          const reason = isConnectionClosed 
            ? `connection_closed_max_retries_${currentRetries}` 
            : `send_failed_max_retries_${currentRetries}`;
          await storage.markPendingAIResponseFailed(conversationId, reason, errorMsg, pendingMutationGuard);
          pendingRetryCounter.delete(conversationId);
          waObservability.pendingAI_maxRetriesExhausted++;
          console.error(`?? [AI AGENT] Timer ABANDONADO apï¿½s ${currentRetries} tentativas (${reason}) - conversationId: ${conversationId}`);
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
            void connectWhatsApp(userId, reconnectConnection.id, { source: "ai_send_connection_closed_recovery" }).catch((reconnectErr) => {
              console.error(`?? [AI AGENT] Falha ao reconnect apï¿½s Connection Closed:`, reconnectErr);
            });
          }

          // Retry com exponential backoff: 5s, 10s, 20s, 30s, 30s...
          const backoffSec = resolvePendingAIResponseRetryDelaySeconds({
            retryCount: currentRetries,
            responseDelaySeconds: responseDelaySecondsForRetry,
            connectionClosed: true,
          });
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
              AND messages = ${JSON.stringify(pendingMutationGuard.expectedMessages)}::jsonb
              AND updated_at <= ${pendingMutationGuard.notUpdatedAfter.toISOString()}::timestamptz
          `);
          waObservability.pendingAI_connectionClosedRetries++;
          console.warn(`? [AI AGENT] Timer reagendado retry ${currentRetries}/${MAX_SEND_RETRIES} em ${backoffSec}s - Connection Closed (conversationId: ${conversationId})`);
        } catch (dbError) {
          console.error(`?? [AI AGENT] Erro ao reagendar timer para retry rï¿½pido:`, dbError);
        }
      } else {
        // Retry com backoff: 30s, 60s, 120s... (cap at 5 min)
        const backoffSec = resolvePendingAIResponseRetryDelaySeconds({
          retryCount: currentRetries,
          responseDelaySeconds: responseDelaySecondsForRetry,
        });
        try {
          await storage.resetPendingAIResponseForRetry(conversationId, backoffSec, pendingMutationGuard, {
            lastError: errorMsg === 'unknown' ? null : errorMsg,
          });
          console.warn(`?? [AI AGENT] Timer reagendado retry ${currentRetries}/${MAX_SEND_RETRIES} em ${backoffSec}s - resposta falhou (conversationId: ${conversationId})`);
        } catch (dbError) {
          console.error(`?? [AI AGENT] Erro ao reagendar timer para retry:`, dbError);
        }
      }
    }
    
    console.log(`?? [AI AGENT] Conversa ${conversationId} liberada para prï¿½ximo processamento`);
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
  console.log(`[TRIGGER] FUNï¿½ï¿½O INICIADA - ${new Date().toISOString()}`);
  console.log(`[TRIGGER] userId: ${userId}`);
  console.log(`[TRIGGER] conversationId: ${conversationId}`);
  console.log(`[TRIGGER] forceRespond: ${forceRespond}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // 1. Buscar a sessï¿½o do usuï¿½rio (preferir via conversation's connectionId)
    console.log(`[TRIGGER] Verificando sessï¿½o no Map sessions...`);
    console.log(`[TRIGGER] Total de sessï¿½es no Map: ${sessions.size}`);
    
    // Debug: listar todas as chaves do Map
    const sessionKeys = Array.from(sessions.keys());
    console.log(`[TRIGGER] Chaves no Map sessions: [${sessionKeys.join(', ')}]`);
    
    // Try to get connection via conversation first for multi-connection
    const triggerConversation = await storage.getConversation(conversationId);
    if (!triggerConversation) {
      console.log(`[TRIGGER] FALHA: Conversa nï¿½o encontrada para resolver conexï¿½o`);
      return { triggered: false, reason: "Conversa nï¿½o encontrada." };
    }
    const session = sessions.get(triggerConversation.connectionId);
    console.log(`[TRIGGER] Sessï¿½o encontrada: ${session ? 'SIM' : 'Nï¿½O'} (connectionId: ${triggerConversation?.connectionId || 'N/A'})`);
    
    // Check per-connection aiEnabled flag
    let triggerConnectionForAutoReply: WhatsappConnection | null = null;
    if (triggerConversation) {
      triggerConnectionForAutoReply = (await storage.getConnectionById(triggerConversation.connectionId)) ?? null;
      if (triggerConnectionForAutoReply && triggerConnectionForAutoReply.aiEnabled === false) {
        console.log(`[TRIGGER] FALHA: IA desativada para esta conexï¿½o (${triggerConversation.connectionId})`);
        return { triggered: false, reason: "IA desativada para este nï¿½mero. Ative na tela de Conexï¿½es." };
      }
    }
    
    if (!session?.socket) {
      // Verificar se estamos em modo dev sem WhatsApp
      const skipRestore = process.env.SKIP_WHATSAPP_RESTORE === 'true';
      console.log(`[TRIGGER] FALHA: Sessï¿½o WhatsApp nï¿½o disponï¿½vel (socket: ${session?.socket ? 'existe' : 'undefined'})`);
      console.log(`[TRIGGER] SKIP_WHATSAPP_RESTORE: ${skipRestore}`);
      
      if (skipRestore) {
        return { triggered: false, reason: "Modo desenvolvimento: WhatsApp nï¿½o conectado localmente. Em produï¿½ï¿½o, a sessï¿½o serï¿½ restaurada automaticamente." };
      }
      return { triggered: false, reason: "WhatsApp nï¿½o conectado. Verifique a conexï¿½o em 'Conexï¿½o'." };
    }
    console.log(`[TRIGGER] Sessï¿½o WhatsApp OK - socket existe`);
    
    // 2. Verificar se o agente estï¿½ ativo globalmente
    console.log(`[TRIGGER] Verificando agentConfig...`);
    const agentConfig = await storage.getAgentConfig(userId);
    console.log(`[TRIGGER] agentConfig encontrado: ${agentConfig ? 'SIM' : 'Nï¿½O'}`);
    console.log(`[TRIGGER] agentConfig.isActive: ${agentConfig?.isActive}`);
    
    if (!agentConfig?.isActive) {
      console.log(`[TRIGGER] FALHA: Agente globalmente inativo`);
      return { triggered: false, reason: "Ative o agente em 'Meu Agente IA' primeiro." };
    }
    console.log(`[TRIGGER] Agente estï¿½ ATIVO`);
    
    // 2.5 ?? FIX: Verificar tambï¿½m businessAgentConfig (toggle "IA ON" em /agent-config)
    console.log(`[TRIGGER] Verificando businessAgentConfig...`);
    const businessAgentConfig = await storage.getBusinessAgentConfig(userId);
    console.log(`[TRIGGER] businessAgentConfig encontrado: ${businessAgentConfig ? 'SIM' : 'Nï¿½O'}`);
    console.log(`[TRIGGER] businessAgentConfig.isActive: ${businessAgentConfig?.isActive}`);
    
    if (!businessAgentConfig?.isActive) {
      console.log(`[TRIGGER] FALHA: IA desativada globalmente em businessAgentConfig`);
      return { triggered: false, reason: "A IA estï¿½ desativada globalmente. Ative em 'Configuraï¿½ï¿½es' primeiro." };
    }
    console.log(`[TRIGGER] businessAgentConfig ATIVO`);
    
    // 3. Buscar dados da conversa
    console.log(`[TRIGGER] Buscando conversa...`);
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      console.log(`[TRIGGER] FALHA: Conversa nï¿½o encontrada`);
      return { triggered: false, reason: "Conversa nï¿½o encontrada." };
    }
    console.log(`[TRIGGER] Conversa encontrada: ${conversation.contactName || conversation.contactNumber}`);
    
    // 4. Buscar mensagens da conversa
    const lastMessage = await storage.getLastMessageByConversationId(conversationId);
    if (!lastMessage) {
      console.log(`?? [TRIGGER] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa para responder." };
    }

    // 5. Verificar ?ltima mensagem
    // Se ?ltima mensagem ? do agente/dono, s? responder se forceRespond=true
    if (lastMessage.fromMe && !forceRespond) {
      console.log(`?? [TRIGGER] ?ltima mensagem ? do agente/dono - n?o precisa responder`);
      return { triggered: false, reason: "?ltima mensagem j? foi respondida." };
    }

    const messages = await storage.getMessagesByConversationId(conversationId);
    if (messages.length === 0) {
      console.log(`?? [TRIGGER] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa para responder." };
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
    
    // 6. Verificar se jï¿½ tem resposta pendente
    const triggerQrReconnectCutoffMs = getQrReconnectCutoffMs(triggerConnectionForAutoReply, session);
    if (triggerQrReconnectCutoffMs && !forceRespond) {
      const recentUnansweredTexts = getUnansweredInboundTextsAtOrAfterQrReconnectCutoff(
        messages,
        triggerQrReconnectCutoffMs,
      );

      if (recentUnansweredTexts.length === 0) {
        console.log(
          `[QR BACKLOG] Trigger ignorado: conversa ${conversationId} so tem mensagens anteriores ao QR reconnect`,
        );
        return { triggered: false, reason: "Mensagens anteriores a reconexao por QR foram mantidas sem resposta automatica." };
      }

      messagesToProcess = recentUnansweredTexts;
    }

    const automationGuardDecision = await evaluateInboundAutomationGuard({
      userId,
      connectionId: conversation.connectionId,
      conversationId,
      contactNumber: conversation.contactNumber,
      contactName: conversation.contactName || null,
      inboundText: messagesToProcess.join('\n\n'),
      conversationHistory: messages,
    });

    if (automationGuardDecision.shouldBlock) {
      await applyInboundAutomationGuardBlock({
        userId,
        conversation,
        reason: automationGuardDecision.reason,
        reasonCode: automationGuardDecision.reasonCode,
      });
      return { triggered: false, reason: automationGuardDecision.reason };
    }

    if (pendingResponses.has(conversationId)) {
      console.log(`?? [TRIGGER] Jï¿½ existe resposta pendente para esta conversa`);
      return { triggered: false, reason: "Resposta jï¿½ em processamento. Aguarde." };
    }
    
    console.log(`?? [TRIGGER] ${messagesToProcess.length} mensagem(s) para processar`);
    console.log(`   ?? Cliente: ${conversation.contactNumber}`);
    
    // +-------------------------------------------------------------------------+
    // ï¿½ ?? FIX: Tentar CHATBOT primeiro antes de usar IA                       ï¿½
    // ï¿½ Quando auto-reativaï¿½ï¿½o ocorre, precisamos respeitar a prioridade:      ï¿½
    // ï¿½ 1ï¿½ CHATBOT/FLOW (se ativo)                                             ï¿½
    // ï¿½ 2ï¿½ IA AGENT (se chatbot nï¿½o processou)                                 ï¿½
    // ï¿½ Data: 2025-01-XX - Sincronizaï¿½ï¿½o Flow Builder + IA Agent               ï¿½
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
      
      console.log(`?? [TRIGGER] Chatbot nï¿½o processou (inativo ou sem match), delegando para IA...`);
    } catch (chatbotError) {
      console.error(`?? [TRIGGER] Erro ao tentar chatbot (continuando com IA):`, chatbotError);
    }
    
    // 7. Criar resposta pendente com delay mï¿½nimo (1s quando forï¿½ado, senï¿½o 3s)
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
      forceRespond,
      responseDelaySeconds,
    };
    
    pending.timeout = schedulePendingResponseProcessing(
      pending,
      responseDelaySeconds * 1000,
      `trigger_agent_response:${conversation.contactNumber}`,
    );
    
    pendingResponses.set(conversationId, pending);
    try {
      await storage.savePendingAIResponse({
        conversationId,
        userId,
        contactNumber: conversation.contactNumber,
        jidSuffix: conversation.jidSuffix || DEFAULT_JID_SUFFIX,
        messages: messagesToProcess,
        executeAt: new Date(Date.now() + responseDelaySeconds * 1000),
      });
    } catch (dbError) {
      console.error(`?? [TRIGGER] Erro ao persistir resposta pendente:`, dbError);
    }
    
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

    const ownership = await enforcePriorityUserOwnershipForAdminLiveAutomation({
      conversationId: conversation.id,
      contactNumber: conversation.contactNumber,
      source: "admin_trigger_resume",
    });
    if (ownership) {
      return {
        triggered: false,
        reason: `Contato controlado por ${FOLLOWUP_PRIORITY_EMAIL} (${ownership.ownerConversationId})`,
      };
    }
    
    // 2. Verificar se h? sess?o admin ativa
    const adminId = conversation.adminId;
    const adminConnection = await storage.getAdminWhatsappConnection(adminId);
    if (!isAdminLiveAiEnabled() || adminConnection?.aiEnabled === false) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Toggle global da IA pausado para o admin ${adminId}`);
      return { triggered: false, reason: "IA automÃ¡tica do admin estÃ¡ pausada" };
    }
    const adminSession = await ensureAdminSessionOperational(adminId, {
      waitMs: 8_000,
      source: "trigger_admin_agent_response",
      allowPersistedAuthRecovery: true,
    });
    if (!adminSession?.socket) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Sess?o admin WhatsApp n?o dispon?vel`);
      return { triggered: false, reason: "WhatsApp admin n?o conectado" };
    }
    
    // 3. Buscar mensagens da conversa admin
    const lastMessage = await storage.getLastAdminMessageByConversationId(conversationId);
    if (!lastMessage) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa" };
    }

    // 4. Verificar ?ltima mensagem
    // Se ?ltima mensagem ? do admin/agente (fromMe = true), n?o precisa responder
    if (lastMessage.fromMe) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] ?ltima mensagem ? do agente - n?o precisa responder`);
      return { triggered: false, reason: "?ltima mensagem j? foi respondida" };
    }

    const messages = await storage.getAdminMessages(conversationId);
    if (messages.length === 0) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa" };
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
      adminId,
      generation: 1,
      startTime: Date.now(),
      conversationId,
      retryCount: 0,
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

export async function triggerPendingAdminResponsesAfterGlobalEnable(
  adminId: string,
  options?: { limit?: number; lookbackHours?: number }
): Promise<{ scanned: number; triggered: number }> {
  const limit = Math.max(1, options?.limit ?? 20);
  const lookbackMs = Math.max(1, options?.lookbackHours ?? 24) * 60 * 60 * 1000;
  const threshold = Date.now() - lookbackMs;

  try {
    const adminConnection = await storage.getAdminWhatsappConnection(adminId);
    if (!isAdminLiveAiEnabled() || adminConnection?.aiEnabled === false) {
      return { scanned: 0, triggered: 0 };
    }

    const conversations = await storage.getAdminConversations(adminId);
    const candidates = conversations
      .filter((conversation) => {
        const lastMessageTime = conversation.lastMessageTime ? new Date(conversation.lastMessageTime).getTime() : 0;
        if (!lastMessageTime || lastMessageTime < threshold) return false;
        if (conversation.isAgentEnabled === false) return false;
        return Number(conversation.unreadCount || 0) > 0;
      })
      .slice(0, limit);

    let triggered = 0;

    for (const conversation of candidates) {
      const result = await triggerAdminAgentResponseForConversation(conversation.id);
      if (result.triggered) {
        triggered++;
      }
    }

    console.log(`[ADMIN TRIGGER ON ENABLE] ${triggered}/${candidates.length} conversa(s) reagendadas para admin ${adminId}`);
    return { scanned: candidates.length, triggered };
  } catch (error) {
    console.error("[ADMIN TRIGGER ON ENABLE] Falha ao varrer conversas pendentes do admin:", error);
    return { scanned: 0, triggered: 0 };
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
  }
): Promise<{ success: boolean; messageId?: string; reason?: string; blocked?: boolean }> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const connection = await storage.getConnectionById(conversation.connectionId);
  if (!connection || connection.userId !== userId) {
    throw new Error("Unauthorized access to conversation");
  }

  const messageSource = options?.source ?? (options?.isFromAgent ? "agent" : "owner");
  const destinationDigits = cleanContactNumber(conversation.contactNumber || conversation.remoteJid || "");

  if (!await isConnectionOwnedByCurrentProcess(connection)) {
    if (!isWhatsAppGatewayRuntime() && await resolveWhatsAppConnectionOwner(connection) === "gateway") {
      if (messageSource !== "owner" && isProtectedAgenteZapAdminNumber(destinationDigits)) {
        console.log(`[sendMessage] Bloqueando envio automatico para numero protegido do admin: ${destinationDigits} (source=${messageSource}, conversation=${conversationId})`);
        if (messageSource === "followup") {
          try {
            await userFollowUpService.disableFollowUp(
              conversationId,
              "Numero protegido do admin da AgenteZap - follow-up automatico bloqueado"
            );
          } catch (error) {
            console.error("[sendMessage] Erro ao desativar follow-up para numero protegido:", error);
          }
        }
        return { success: false, blocked: true, reason: "Numero protegido do admin" };
      }

      const result = await sendGatewayInstanceText(connection.id, buildGatewayTextSendBody({
        conversationId,
        text,
        to: conversation.contactNumber,
        contactName: conversation.contactName,
        validateDestination: options?.validateDestination === true,
        acceptQueued: options?.acceptQueued === true,
        isFromAgent: options?.isFromAgent === true,
        source: messageSource,
      }));

      if ((result as any)?.success !== false) {
        const gatewaySentAt = new Date();
        const gatewayNormalizedText = normalizeOutboundTextForCustomer(text);
        const gatewayMessageId =
          String((result as any)?.messageId || "").trim() ||
          `gateway:${messageSource}:${Date.now()}`;
        let savedGatewayMessage: any = null;

        try {
          savedGatewayMessage = await storage.createMessage({
            conversationId,
            messageId: gatewayMessageId,
            fromMe: true,
            text: gatewayNormalizedText,
            timestamp: gatewaySentAt,
            status: (result as any)?.queued === true ? "queued" : "sent",
            isFromAgent: options?.isFromAgent ?? false,
          });
        } catch (dbErr) {
          console.warn("[sendMessage] Falha ao salvar mensagem via gateway no DB:", dbErr);
        }

        const ownerPhoneNumber = cleanContactNumber(connection.phoneNumber || "") || null;
        const updatePayload: Partial<Conversation> = {
          lastMessageText: gatewayNormalizedText,
          lastMessageTime: gatewaySentAt,
          lastMessageFromMe: true,
          hasReplied: true,
          unreadCount: 0,
        };

        if (ownerPhoneNumber && !cleanContactNumber(conversation.ownerPhoneNumber || "")) {
          (updatePayload as any).ownerPhoneNumber = ownerPhoneNumber;
          (updatePayload as any).ownerPhoneVerifiedAt = new Date();
          (updatePayload as any).ownerPhoneSource = "gateway_outgoing_current_connection";
        }

        try {
          await storage.updateConversation(conversationId, updatePayload as any);
        } catch (dbErr) {
          console.warn("[sendMessage] Falha ao atualizar conversa apos envio via gateway:", dbErr);
        }

        if (
          messageSource === "owner" ||
          messageSource === "agent" ||
          messageSource === "system"
        ) {
          try {
            await userFollowUpService.resetFollowUpCycle(
              conversationId,
              messageSource === "owner"
                ? "Dono respondeu manualmente"
                : messageSource === "agent"
                  ? "IA respondeu ao cliente"
                  : "Mensagem do sistema enviada pela empresa",
              new Date(),
            );
          } catch (error) {
            console.error("Erro ao reiniciar follow-up do usuario:", error);
          }
        }

        if (messageSource === "owner" && options?.isFromAgent !== true) {
          await applyLinkedOwnerManualPause({
            userId,
            conversationId,
            contactNumber: destinationDigits,
          });
        }

        broadcastToUser(userId, {
          type: "message_sent",
          conversationId,
          message: gatewayNormalizedText,
          messageData: savedGatewayMessage ? {
            id: savedGatewayMessage.id,
            conversationId,
            messageId: savedGatewayMessage.messageId || gatewayMessageId,
            fromMe: true,
            text: gatewayNormalizedText,
            timestamp: savedGatewayMessage.timestamp || gatewaySentAt.toISOString(),
            isFromAgent: options?.isFromAgent ?? false,
            status: savedGatewayMessage.status || ((result as any)?.queued === true ? "queued" : "sent"),
          } : {
            conversationId,
            messageId: gatewayMessageId,
            fromMe: true,
            text: gatewayNormalizedText,
            timestamp: gatewaySentAt.toISOString(),
            isFromAgent: options?.isFromAgent ?? false,
            status: (result as any)?.queued === true ? "queued" : "sent",
          },
          conversationUpdate: {
            id: conversationId,
            connectionId: conversation.connectionId,
            contactNumber: conversation.contactNumber,
            contactName: conversation.contactName,
            contactAvatar: conversation.contactAvatar,
            lastMessageText: gatewayNormalizedText,
            lastMessageTime: gatewaySentAt.toISOString(),
            lastMessageFromMe: true,
            unreadCount: 0,
            isArchived: false,
          },
        });
      }

      return result as { success: boolean; messageId?: string; reason?: string; blocked?: boolean };
    }
    throw new Error(`Connection ${connection.id} is not owned by this runtime`);
  }

  const normalizedText = normalizeOutboundTextForCustomer(text);
  const shouldTrackRecentDuplicate = options?.isFromAgent === true;

  if (shouldTrackRecentDuplicate) {
    if (isRecentDuplicate(conversationId, normalizedText)) {
      console.log(`?? [sendMessage] Mensagem IDENTICA ja enviada recentemente, IGNORANDO duplicata`);
      console.log(`   Texto: "${normalizedText.substring(0, 80)}..."`);
      return { success: false, blocked: true, reason: "Mensagem duplicada recente" };
    }
  }

  if (messageSource !== "owner" && isProtectedAgenteZapAdminNumber(destinationDigits)) {
    console.log(`[sendMessage] Bloqueando envio autom??tico para n??mero protegido do admin: ${destinationDigits} (source=${messageSource}, conversation=${conversationId})`);
    if (messageSource === "followup") {
      try {
        await userFollowUpService.disableFollowUp(
          conversationId,
          "N??mero protegido do admin da AgenteZap - follow-up autom??tico bloqueado"
        );
      } catch (error) {
        console.error("[sendMessage] Erro ao desativar follow-up para n??mero protegido:", error);
      }
    }
    return { success: false, blocked: true, reason: "Numero protegido do admin" };
  }

  let messageId = Date.now().toString();
  let savedSentMsg: any = null;

  if (isOfficialCoexistenceConnection(connection)) {
    const officialResult = await sendMetaCloudTextMessage(connection, conversation, normalizedText);
    messageId = officialResult.messageId || `meta-${Date.now()}`;

    console.log(`[sendMessage] Sending via official provider to conversation ${conversationId}`);

    trackSharedAutomaticOutgoingMessage({
      messageId,
      contactNumber: destinationDigits || cleanContactNumber(conversation.remoteJid || ""),
      text: normalizedText,
      isFromAgent: options?.isFromAgent ?? false,
      source: `customer_system_${messageSource}`,
    });

    try {
      savedSentMsg = await storage.createMessage({
        conversationId,
        messageId,
        fromMe: true,
        text: normalizedText,
        timestamp: new Date(),
        status: "sent",
        isFromAgent: options?.isFromAgent ?? false,
      });
    } catch (dbErr) {
      console.warn(`?? [sendMessage] Falha ao salvar mensagem oficial no DB (nao critico):`, dbErr);
    }
  } else {
    const session = await ensureUserSessionOperational(userId, conversation.connectionId, {
      waitMs: 10_000,
      source: `sendMessage:${conversationId}`,
    });
    if (!session?.socket) {
      throw new Error("WhatsApp not connected for this connection");
    }

    const jid = buildSendJid(conversation);
    const queuePriority = messageSource === "followup" ? "low" : "high";
    const isManualOwnerSend = messageSource === "owner" && options?.isFromAgent !== true;

    console.log(`[sendMessage] Sending to: ${jid}${options?.isFromAgent ? " (from agent/follow-up)" : ""}`);

    let queueResult: any;
    let acceptedWithLocalWriteFailure = false;
    try {
      queueResult = await messageQueueService.enqueue(userId, jid, normalizedText, {
        isFromAgent: options?.isFromAgent,
        conversationId,
        connectionId: conversation.connectionId,
        priority: queuePriority,
        messageType: messageSource === "followup" ? "followup" : options?.isFromAgent ? "ai_response" : "manual",
        source: messageSource === "followup" ? "userFollowUpService" : "whatsapp.ts",
        fastLane: isManualOwnerSend,
        skipDelay: isManualOwnerSend,
        skipTyping: isManualOwnerSend,
      });
    } catch (queueError) {
      if (messageSource !== "owner" && isLocalOutboxWriteFailure(queueError)) {
        acceptedWithLocalWriteFailure = true;
        queueResult = {
          success: true,
          messageId: `local_recovered:${messageSource}:${Date.now()}`,
          localRecovery: true,
        };
        console.error(
          `[sendMessage] Envio automatico ficou sem confirmacao local por falta de espaco; gravando sem reenvio para evitar duplicidade (${conversationId})`,
          queueError,
        );
      } else {
        throw queueError;
      }
    }

    if (
      queueResult.messageId === "DEDUPLICATED_BLOCKED" ||
      queueResult.messageId === AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID
    ) {
      console.log(`?? [sendMessage] Dedupe bloqueou envio. Ignorando persistencia/side-effects.`);
      return {
        success: false,
        blocked: true,
        reason:
          queueResult.messageId === AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID
            ? "Conversa pausada por resposta manual do dono"
            : "Mensagem bloqueada por deduplicacao",
      };
    }

    messageId = queueResult.messageId || Date.now().toString();

    trackSharedAutomaticOutgoingMessage({
      messageId,
      contactNumber: destinationDigits || cleanContactNumber(jid),
      text: normalizedText,
      isFromAgent: options?.isFromAgent ?? false,
      source: `customer_system_${messageSource}`,
    });

    try {
      savedSentMsg = await storage.createMessage({
        conversationId,
        messageId,
        fromMe: true,
        text: normalizedText,
        timestamp: new Date(),
      status: acceptedWithLocalWriteFailure ? "sent" : "queued",
      isFromAgent: options?.isFromAgent ?? false,
    });

      const pendingConfirmedAt = acceptedWithLocalWriteFailure
        ? null
        : consumePendingOutgoingMessageConfirmation(messageId);
      if (savedSentMsg?.id && pendingConfirmedAt) {
        await storage.updateMessage(savedSentMsg.id, {
          status: "sent",
          timestamp: pendingConfirmedAt,
        });
        savedSentMsg = {
          ...savedSentMsg,
          status: "sent",
          timestamp: pendingConfirmedAt,
        };
      }
    } catch (dbErr) {
      console.warn(`?? [sendMessage] Falha ao salvar mensagem enviada no DB (nao critico):`, dbErr);
    }
  }

  if (shouldTrackRecentDuplicate) {
    registerSentMessageCache(conversationId, normalizedText);
  }

  if (
    messageSource === "owner" ||
    messageSource === "agent" ||
    messageSource === "system"
  ) {
    try {
      await userFollowUpService.resetFollowUpCycle(
        conversationId,
        messageSource === "owner"
          ? "Dono respondeu manualmente"
          : messageSource === "agent"
            ? "IA respondeu ao cliente"
            : "Mensagem do sistema enviada pela empresa",
        new Date(),
      );
    } catch (error) {
      console.error("Erro ao reiniciar follow-up do usuario:", error);
    }
  }

  if (messageSource === "owner" && options?.isFromAgent !== true) {
    await applyLinkedOwnerManualPause({
      userId,
      conversationId,
      contactNumber: destinationDigits,
    });
  }

  try {
    await storage.updateConversation(conversationId, {
      lastMessageText: normalizedText,
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
    message: normalizedText,
    messageData: savedSentMsg ? {
      id: savedSentMsg.id,
      conversationId,
      messageId: savedSentMsg.messageId || messageId,
      fromMe: true,
      text: normalizedText,
      timestamp: savedSentMsg.timestamp || new Date().toISOString(),
      isFromAgent: options?.isFromAgent ?? false,
      status: savedSentMsg.status || "queued",
    } : undefined,
    conversationUpdate: {
      id: conversationId,
      lastMessageText: normalizedText,
      lastMessageTime: new Date().toISOString(),
      lastMessageFromMe: true,
    },
  });

  return { success: true, messageId };
}

export async function sendAdminConversationMessage(adminId: string, conversationId: string, text: string): Promise<void> {
  const session = await getConnectedAdminSessionOrRecover(adminId);
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

  await autoPauseAdminConversationOnManualReply({
    adminId,
    conversationId,
    contactNumber: conversation.contactNumber,
    source: "admin_panel_text",
  });

  console.log(`[sendAdminConversationMessage] Sending to: ${jid} (Original: ${conversation.remoteJid})`);
  
  // ??? ANTI-BLOQUEIO: Usar fila do admin
  const sentMessage = await sendWithQueue(`admin_${adminId}`, 'admin conversa msg', async () => {
    await simulateTyping(session.socket, jid, text.length);
    return await session.socket.sendMessage(jid, { text });
  });

  const sentAt = new Date();
  const linkedUserPushPromise = notifyLinkedPlatformUserAboutAdminOutgoing(conversation, text);
  const linkedOwnerContext = await resolveLinkedOwnerInboxContext(adminId);
  if (linkedOwnerContext) {
    trackAdminOutgoingMessage({
      messageId: (sentMessage as any)?.key?.id,
      adminId,
      contactNumber: conversation.contactNumber,
      text,
      isFromAgent: false,
      alreadyPersisted: true,
      source: "admin_panel_text",
    });

    await persistMirroredAdminOutgoingToOwnerInbox({
      context: linkedOwnerContext,
      contactNumber: conversation.contactNumber,
      remoteJid: jid,
      contactName: conversation.contactName || undefined,
      messageId: (sentMessage as any)?.key?.id,
      messageText: text,
      timestamp: sentAt,
      source: "admin_panel_text",
    });
    await linkedUserPushPromise;
    return;
  }

  trackAdminOutgoingMessage({
    messageId: (sentMessage as any)?.key?.id,
    adminId,
    conversationId,
    contactNumber: conversation.contactNumber,
    text,
    isFromAgent: false,
    alreadyPersisted: true,
    source: "admin_panel_text",
  });

  // Salvar mensagem
  await storage.createAdminMessage({
    conversationId,
    messageId: sentMessage?.key?.id || Date.now().toString(),
    fromMe: true,
    text,
    timestamp: sentAt,
    status: "sent",
    isFromAgent: false,
  });

  await storage.updateAdminConversation(conversationId, {
    lastMessageText: text,
    lastMessageTime: sentAt,
  });

  await followUpService.scheduleInitialFollowUp(conversationId, { forceRestart: true });
  await linkedUserPushPromise;
}

export async function sendAdminDirectMessage(adminId: string, phoneNumber: string, text: string): Promise<void> {
  const session = await getConnectedAdminSessionOrRecover(adminId);
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
// Para envio de notificaï¿½ï¿½es automï¿½ticas (lembretes de pagamento, check-ins, etc)
// Nï¿½O ï¿½ para chatbot - apenas envio de mensagens informativas
function normalizeDigitsOnly(value: string) {
  let digits = "";
  for (const char of String(value || "")) {
    if (char >= "0" && char <= "9") {
      digits += char;
    }
  }
  return digits;
}

async function withAsyncTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  return new Promise<T>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} excedeu ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolve(value);
      },
      (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        reject(error);
      },
    );
  });
}

export async function sendAdminNotification(
  adminId: string, 
  phoneNumber: string, 
  message: string
): Promise<{
  success: boolean;
  error?: string;
  validatedPhone?: string;
  originalPhone?: string;
  messageId?: string;
  remoteJid?: string;
}> {
  try {
    const session = await getConnectedAdminSessionOrRecover(adminId);
    if (!session?.socket) {
      console.log(`[sendAdminNotification] ? Admin ${adminId} nï¿½o conectado`);
      return { success: false, error: "Admin WhatsApp not connected" };
    }

    // Clean phone number - remover tudo exceto nï¿½meros
    let cleanPhone = normalizeDigitsOnly(phoneNumber);
    
    // Garantir que tem o DDI 55 do Brasil
    if (!cleanPhone.startsWith('55') && cleanPhone.length <= 11) {
      cleanPhone = '55' + cleanPhone;
    }
    
    // Verificar formato vï¿½lido: 55 + DDD (2) + nï¿½mero (8-9)
    if (cleanPhone.length < 12 || cleanPhone.length > 13) {
      console.log(`[sendAdminNotification] ? Nï¿½mero invï¿½lido: ${phoneNumber} -> ${cleanPhone} (length: ${cleanPhone.length})`);
      return { success: false, error: `Nï¿½mero invï¿½lido: ${phoneNumber}` };
    }
    
    // ? CORREï¿½ï¿½O: Testar mï¿½ltiplas variaï¿½ï¿½es do nï¿½mero
    // Alguns nï¿½meros podem estar cadastrados com 9 extra ou faltando o 9
    const phoneVariations: string[] = [cleanPhone];
    
    // Se tem 13 dï¿½gitos (55 + DDD + 9 + 8 dï¿½gitos), criar variaï¿½ï¿½o sem o 9
    if (cleanPhone.length === 13 && cleanPhone[4] === '9') {
      const withoutNine = cleanPhone.slice(0, 4) + cleanPhone.slice(5);
      phoneVariations.push(withoutNine);
      console.log(`[sendAdminNotification] ?? Variaï¿½ï¿½o sem 9: ${withoutNine}`);
    }
    
    // Se tem 12 dï¿½gitos (55 + DDD + 8 dï¿½gitos), criar variaï¿½ï¿½o com o 9
    if (cleanPhone.length === 12) {
      const withNine = cleanPhone.slice(0, 4) + '9' + cleanPhone.slice(4);
      phoneVariations.push(withNine);
      console.log(`[sendAdminNotification] ?? Variaï¿½ï¿½o com 9: ${withNine}`);
    }
    
    console.log(`[sendAdminNotification] ?? Verificando variaï¿½ï¿½es: ${phoneVariations.join(', ')}`);
    
    // ? Verificar qual variaï¿½ï¿½o existe no WhatsApp
    let validPhone: string | null = null;
    
    for (const phone of phoneVariations) {
      try {
        const [result] = await withAsyncTimeout(
          session.socket.onWhatsApp(phone),
          20_000,
          `Verificaï¿½ï¿½o WhatsApp ${phone}`,
        );
        if (result?.exists === true) {
          validPhone = phone;
          console.log(`[sendAdminNotification] ? Nï¿½mero encontrado: ${phone}`);
          break;
        } else {
          console.log(`[sendAdminNotification] ? ${phone} nï¿½o existe no WhatsApp`);
        }
      } catch (checkError) {
        console.log(`[sendAdminNotification] ?? Erro ao verificar ${phone}:`, checkError);
      }
    }
    
    // Se nenhuma variaï¿½ï¿½o foi encontrada, retornar erro
    if (!validPhone) {
      console.log(`[sendAdminNotification] ? Nenhuma variaï¿½ï¿½o do nï¿½mero existe no WhatsApp: ${phoneVariations.join(', ')}`);
      return { success: false, error: `Nï¿½mero nï¿½o existe no WhatsApp: ${phoneNumber} (testado: ${phoneVariations.join(', ')})` };
    }
    
    const jid = `${validPhone}@s.whatsapp.net`;
    console.log(`[sendAdminNotification] ?? Enviando para: ${jid}`);
    
    // Enviar mensagem usando a fila anti-banimento
    let sendSuccess = false;
    let sendError: string | undefined;
    let sentMessageId: string | undefined;
    
    await sendWithQueue(`admin_${adminId}`, 'admin notification', async () => {
      try {
        const result = await withAsyncTimeout(
          session.socket.sendMessage(jid, { text: message }),
          45_000,
          `Envio admin notification ${validPhone}`,
        );
        
        if (result?.key?.id) {
          sendSuccess = true;
          sentMessageId = result.key.id;
          console.log(`[sendAdminNotification] ? Mensagem enviada com sucesso para ${validPhone} (msgId: ${result.key.id})`);
        } else {
          sendError = 'Nenhum ID de mensagem retornado';
          console.log(`[sendAdminNotification] ?? Envio sem confirmaï¿½ï¿½o para ${validPhone}`);
        }
      } catch (sendErr) {
        sendError = sendErr instanceof Error ? sendErr.message : 'Erro desconhecido';
        console.error(`[sendAdminNotification] ? Erro ao enviar para ${validPhone}:`, sendErr);
        throw sendErr; // Re-throw para que sendWithQueue capture
      }
    });

    if (sendSuccess) {
      trackAdminOutgoingMessage({
        messageId: sentMessageId,
        adminId,
        contactNumber: validPhone,
        text: message,
        isFromAgent: false,
        alreadyPersisted: false,
        source: "admin_notification",
      });

      const linkedOwnerContext = await resolveLinkedOwnerInboxContext(adminId);
      if (linkedOwnerContext) {
        console.log(
          `[sendAdminNotification] Continuidade vinculada ao inbox ${linkedOwnerContext.adminEmail} (${linkedOwnerContext.connectionId})`,
        );

        return {
          success: true,
          validatedPhone: validPhone,
          originalPhone: phoneNumber,
          messageId: sentMessageId,
          remoteJid: jid,
        };
      }

      trackAdminOutgoingMessage({
        messageId: sentMessageId,
        adminId,
        contactNumber: validPhone,
        text: message,
        isFromAgent: false,
        alreadyPersisted: true,
        source: "admin_notification",
      });

      const conversation = await storage.getOrCreateAdminConversation(
        adminId,
        validPhone,
        jid,
        undefined,
      );

      await storage.createAdminMessage({
        conversationId: conversation.id,
        messageId: sentMessageId || `${Date.now()}_admin_notification`,
        fromMe: true,
        text: message,
        timestamp: new Date(),
        status: "sent",
        isFromAgent: false,
      });

      await storage.updateAdminConversation(conversation.id, {
        lastMessageText: message.substring(0, 255),
        lastMessageTime: new Date(),
      });

      await followUpService.scheduleInitialFollowUp(conversation.id);

      return {
        success: true,
        validatedPhone: validPhone,
        originalPhone: phoneNumber,
        messageId: sentMessageId,
        remoteJid: jid,
      };
    } else {
      return {
        success: false,
        error: sendError || 'Falha no envio',
        validatedPhone: validPhone,
        originalPhone: phoneNumber,
        remoteJid: jid,
      };
    }
  } catch (error) {
    console.error('[sendAdminNotification] ? Erro geral:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function deleteAdminSentMessage(params: {
  adminId: string;
  remoteJid: string;
  messageId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getConnectedAdminSessionOrRecover(params.adminId);
    if (!session?.socket) {
      return { success: false, error: "Admin WhatsApp not connected" };
    }

    await withAsyncTimeout(
      session.socket.sendMessage(params.remoteJid, {
        delete: {
          remoteJid: params.remoteJid,
          fromMe: true,
          id: params.messageId,
        },
      } as any),
      30_000,
      `Delete admin sent message ${params.messageId}`,
    );

    const storedMessage = await storage.getAdminMessageByMessageId(params.messageId);
    if (storedMessage?.id) {
      await storage.updateAdminMessage(storedMessage.id, {
        status: "deleted",
      });
    }

    return { success: true };
  } catch (error) {
    console.error("[deleteAdminSentMessage] Falha ao apagar mensagem enviada pelo admin:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
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

  await autoPauseAdminConversationOnManualReply({
    adminId,
    conversationId,
    contactNumber: conversation.contactNumber,
    source: `admin_panel_${media.type}`,
  });

  console.log(`[sendAdminMediaMessage] Sending ${media.type} to: ${jid}`);

  const {
    buffer: mediaBuffer,
    persistedMediaUrl,
  } = await prepareOutgoingMediaForSend({
    mediaData: media.data,
    mimeType: media.mimetype || "application/octet-stream",
    ownerId: adminId,
    conversationId,
  });

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

  trackAdminOutgoingMessage({
    messageId: (sentMessage as any)?.key?.id,
    adminId,
    conversationId,
    contactNumber: conversation.contactNumber,
    text: media.caption || (
      media.type === "image" ? "*Imagem*" :
      media.type === "audio" ? "*Audio*" :
      media.type === "video" ? "*Video*" :
      media.filename || "*Documento*"
    ),
    mediaType: media.type,
    mediaMimeType: media.mimetype,
    mediaCaption: media.caption,
    isFromAgent: false,
    alreadyPersisted: true,
    source: `admin_panel_${media.type}`,
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
    mediaUrl: persistedMediaUrl,
    mediaMimeType: media.mimetype,
    mediaCaption: media.caption,
  });

  await storage.updateAdminConversation(conversationId, {
    lastMessageText: media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)}]`,
    lastMessageTime: new Date(),
  });

  await followUpService.scheduleInitialFollowUp(conversationId, { forceRestart: true });
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
  media: UserMediaPayload,
  options?: {
    isFromAgent?: boolean;
    yieldQueue?: boolean;
    skipQueueDelay?: boolean;
    skipAutoPause?: boolean;
    validateDestination?: boolean;
  },
): Promise<{ success: boolean; messageId?: string | null; conversationId: string }> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const connection = await storage.getConnectionById(conversation.connectionId);
  if (!connection || connection.userId !== userId) {
    throw new Error("Unauthorized access to conversation");
  }

  let mediaDataForSend = media.data;
  let mediaMimeTypeForSend = media.mimetype || "application/octet-stream";
  if (media.type === "audio") {
    const converted = await convertToWhatsAppAudio(
      mediaDataForSend,
      mediaMimeTypeForSend || "audio/webm",
    );
    mediaMimeTypeForSend = converted.mimeType || "audio/ogg; codecs=opus";
    mediaDataForSend = `data:${mediaMimeTypeForSend};base64,${converted.data}`;
  }

  if (!await isConnectionOwnedByCurrentProcess(connection)) {
    if (!isWhatsAppGatewayRuntime() && await resolveWhatsAppConnectionOwner(connection) === "gateway") {
      const result = await sendGatewayInstanceMedia(connection.id, {
        conversationId,
        to: conversation.contactNumber,
        contactName: conversation.contactName,
        type: media.type,
        data: mediaDataForSend,
        mimetype: mediaMimeTypeForSend,
        filename: media.filename,
        caption: media.caption,
        ptt: media.ptt,
        seconds: media.seconds,
        validateDestination: options?.validateDestination === true,
      });
      return {
        success: Boolean((result as any)?.success ?? true),
        messageId: (result as any)?.messageId || null,
        conversationId: String((result as any)?.conversationId || conversationId),
      };
    }
    throw new Error(`Connection ${connection.id} is not owned by this runtime`);
  }

  const sentAt = new Date();
  const persistedText = media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)} enviado]`;
  const previewText = media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)}]`;
  const {
    buffer: mediaBuffer,
    persistedMediaUrl,
  } = await prepareOutgoingMediaForSend({
    mediaData: mediaDataForSend,
    mimeType: mediaMimeTypeForSend,
    ownerId: userId,
    conversationId,
  });

  let sentMessageId = Date.now().toString();

  if (isOfficialCoexistenceConnection(connection)) {
    const officialResult = await sendMetaCloudMediaMessage(connection, conversation, {
      type: media.type,
      data: mediaDataForSend,
      mimetype: mediaMimeTypeForSend,
      filename: media.filename,
      caption: media.caption,
      ptt: media.ptt,
      seconds: media.seconds,
    });
    sentMessageId = officialResult.messageId || `meta-${Date.now()}`;
    console.log(`[sendUserMediaMessage] Sent ${media.type} via official provider. ID: ${sentMessageId}`);
  } else {
    const session = await ensureUserSessionOperational(userId, conversation.connectionId, {
      waitMs: 10_000,
      source: `sendUserMediaMessage:${conversationId}`,
    });
    if (!session?.socket) {
      throw new Error("WhatsApp not connected for this connection");
    }
    const activeSocket = session.socket;

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

    console.log(`[sendUserMediaMessage] Buffer size: ${mediaBuffer.length} bytes, mimetype: ${mediaMimeTypeForSend}`);

    let messageContent: any;

    switch (media.type) {
      case 'audio':
        messageContent = {
          audio: mediaBuffer,
          mimetype: mediaMimeTypeForSend,
          ptt: media.ptt !== false,
          seconds: media.seconds,
        };
        console.log(`[sendUserMediaMessage] Audio prepared:`, {
          size: mediaBuffer.length,
          mimetype: messageContent.mimetype,
          ptt: messageContent.ptt,
          seconds: messageContent.seconds
        });
        break;
      case 'image':
        messageContent = {
          image: mediaBuffer,
          mimetype: mediaMimeTypeForSend || 'image/jpeg',
          caption: media.caption,
        };
        break;
      case 'video':
        messageContent = {
          video: mediaBuffer,
          mimetype: mediaMimeTypeForSend || 'video/mp4',
          caption: media.caption,
        };
        break;
      case 'document':
        messageContent = {
          document: mediaBuffer,
          mimetype: mediaMimeTypeForSend || 'application/pdf',
          fileName: media.filename || 'document',
          caption: media.caption,
        };
        break;
      default:
        throw new Error(`Unsupported media type: ${media.type}`);
    }

    console.log(`[sendUserMediaMessage] Sending to WhatsApp...`);

    const sentMessage = await sendWithQueue(
      userId,
      `usuario midia ${media.type}`,
      async () => {
        return await activeSocket.sendMessage(jid, messageContent);
      },
      {
        yieldQueue: options?.yieldQueue === true || options?.skipQueueDelay === true,
        skipDelay: options?.skipQueueDelay === true,
        ownerManualContactNumber: options?.skipQueueDelay === true && options?.isFromAgent !== true
          ? cleanContactNumber(conversation.contactNumber || conversation.remoteJid || "")
          : undefined,
      },
    );
    sentMessageId = sentMessage?.key?.id || Date.now().toString();
    console.log(`[sendUserMediaMessage] Message sent. ID: ${sentMessageId}`);
  }

  trackSharedAutomaticOutgoingMessage({
    messageId: sentMessageId,
    contactNumber: cleanContactNumber(conversation.contactNumber || conversation.remoteJid || ""),
    conversationId,
    text: persistedText,
    mediaType: media.type,
    mediaUrl: persistedMediaUrl,
    mediaMimeType: mediaMimeTypeForSend,
    mediaCaption: media.caption,
    isFromAgent: options?.isFromAgent === true,
    source: options?.isFromAgent === true ? "customer_agent_media" : "customer_owner_media",
  });

  let savedSentMsg: any | undefined;
  try {
    savedSentMsg = await storage.createMessage({
      conversationId,
      messageId: sentMessageId,
      fromMe: true,
      text: persistedText,
      timestamp: sentAt,
      status: "sent",
      isFromAgent: options?.isFromAgent === true,
      mediaType: media.type,
      mediaUrl: persistedMediaUrl,
      mediaMimeType: mediaMimeTypeForSend,
      mediaCaption: media.caption,
    });
  } catch (messageError) {
    if (isUniqueMessagePersistenceError(messageError)) {
      savedSentMsg = await storage.getMessageByConversationAndMessageId(conversationId, sentMessageId);
    } else {
      console.error(
        `[sendUserMediaMessage] WhatsApp aceitou ${media.type}, mas a persistencia local falhou. ` +
          `messageId=${sentMessageId} conversationId=${conversationId}`,
        messageError,
      );
    }
  }

  try {
    await storage.updateConversation(conversationId, {
      lastMessageText: previewText,
      lastMessageTime: sentAt,
      lastMessageFromMe: true,
      unreadCount: 0,
      hasReplied: true,
    });
  } catch (conversationError) {
    console.error(
      `[sendUserMediaMessage] WhatsApp aceitou ${media.type}, mas a conversa nao atualizou localmente. ` +
        `messageId=${sentMessageId} conversationId=${conversationId}`,
      conversationError,
    );
  }

  broadcastToUser(userId, {
    type: "message_sent",
    conversationId,
    message: persistedText,
    messageData: savedSentMsg
      ? {
          id: savedSentMsg.id,
          conversationId,
          messageId: savedSentMsg.messageId || sentMessageId,
          fromMe: true,
          text: persistedText,
          timestamp: savedSentMsg.timestamp || sentAt.toISOString(),
          isFromAgent: options?.isFromAgent === true,
          status: "sent",
          mediaType: media.type,
          mediaUrl: persistedMediaUrl,
          mediaMimeType: mediaMimeTypeForSend,
          mediaCaption: media.caption,
        }
      : undefined,
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

  try {
    await userFollowUpService.resetFollowUpCycle(
      conversationId,
      options?.isFromAgent === true ? "IA enviou midia ao cliente" : "Dono enviou midia manualmente",
      sentAt,
    );
  } catch (followUpError) {
    console.error("Erro ao reiniciar follow-up apos envio de midia:", followUpError);
  }

  try {
    const agentConfig = await storage.getAgentConfig(userId);
    const shouldPauseOnManualReply = agentConfig?.pauseOnManualReply !== false;
    const autoReactivateMinutes = agentConfig?.autoReactivateMinutes ?? null;
    const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversationId);
    const shouldPauseConversation =
      shouldPauseOnManualReply &&
      options?.skipAutoPause !== true &&
      options?.isFromAgent !== true;
    if (shouldPauseConversation && !isAlreadyDisabled) {
      await storage.disableAgentForConversation(conversationId, autoReactivateMinutes);
      console.log(`?? [AUTO-PAUSE] IA pausada automaticamente para conversa ${conversationId} - dono enviou m?dia pelo sistema`);
    } else if (shouldPauseConversation && isAlreadyDisabled) {
      await storage.updateDisabledConversationOwnerReply(conversationId, autoReactivateMinutes);
    }
  } catch (pauseError) {
    console.error("Erro ao pausar IA automaticamente:", pauseError);
  }

  return {
    success: true,
    messageId: sentMessageId,
    conversationId,
  };
}

// ==================== BULK SEND / ENVIO EM MASSA ====================
export async function sendBulkMessages(
  userId: string, 
  phones: string[], 
  message: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const activeConnection = await storage.getConnectionByUserId(userId);
  const session = activeConnection ? sessions.get(activeConnection.id) : sessions.get(userId);
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
        if (queueResult.messageId && queueResult.messageId !== 'DEDUPLICATED_BLOCKED') {
          trackSharedAutomaticOutgoingMessage({
            messageId: queueResult.messageId,
            contactNumber: formattedPhone,
            text: message,
            isFromAgent: true,
            source: "customer_bulk_send",
          });
        }
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
  const activeConnection = await storage.getConnectionByUserId(userId);
  const session = activeConnection ? sessions.get(activeConnection.id) : sessions.get(userId);
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

  // Fun??o para aplicar template [nome] - usa sanitizaÃ§Ã£o para nomes invÃ¡lidos
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
        if (queueResult.messageId && queueResult.messageId !== 'DEDUPLICATED_BLOCKED') {
          trackSharedAutomaticOutgoingMessage({
            messageId: queueResult.messageId,
            contactNumber: formattedPhone,
            text: finalMessage,
            isFromAgent: true,
            source: "customer_bulk_send_advanced",
          });
        }
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

function resolveUserGroupSession(userId: string, preferredConnectionId?: string | null) {
  const normalizedConnectionId = String(preferredConnectionId || "").trim();
  if (normalizedConnectionId) {
    return sessions.get(normalizedConnectionId) || sessions.get(userId);
  }

  return sessions.get(userId);
}

/**
 * Busca todos os grupos que o usu?rio participa
 * Usa groupFetchAllParticipating do Baileys
 */
export async function fetchUserGroups(
  userId: string,
  preferredConnectionId?: string | null,
): Promise<WhatsAppGroup[]> {
  const session = resolveUserGroupSession(userId, preferredConnectionId);
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

async function ensureGroupConversationForSend(params: {
  connectionId: string;
  groupJid: string;
  groupName: string;
}) {
  const groupNumber = params.groupJid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") || "";
  if (!groupNumber) {
    throw new Error("Nao foi possivel identificar o grupo");
  }

  let conversation = await storage.findConversationByIdentity(params.connectionId, {
    contactNumber: groupNumber,
    remoteJid: params.groupJid,
    activeOnly: false,
  });

  if (!conversation) {
    conversation = await storage.createConversation({
      connectionId: params.connectionId,
      contactNumber: groupNumber,
      remoteJid: params.groupJid,
      jidSuffix: "g.us",
      contactName: params.groupName,
      lastMessageText: null,
      lastMessageTime: null,
      lastMessageFromMe: false,
      unreadCount: 0,
    });
  } else {
    conversation = await storage.updateConversation(conversation.id, {
      remoteJid: params.groupJid,
      jidSuffix: "g.us",
      contactName: params.groupName,
      isArchived: false,
    });
  }

  if (!(await storage.isAgentDisabledForConversation(conversation.id))) {
    await storage.disableAgentForConversation(conversation.id, null);
  }

  await userFollowUpService.disableFollowUp(
    conversation.id,
    "Grupo em modo manual: follow-up automático indisponível.",
  );

  return conversation;
}

/**
 * Envia mensagem para um ou mais grupos
 */
export async function sendMessageToGroups(
  userId: string,
  groupIds: string[],
  message: string,
  options: {
    connectionId?: string | null;
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
  const session = resolveUserGroupSession(userId, options.connectionId);
  if (!session?.socket) {
    throw new Error("WhatsApp n?o conectado");
  }
  const dispatchConnectionId = options.connectionId || session.connectionId || undefined;
  if (!dispatchConnectionId) {
    throw new Error("Conexao do grupo nao identificada");
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
      
      const conversation = await ensureGroupConversationForSend({
        connectionId: dispatchConnectionId,
        groupJid: jid,
        groupName,
      });

      const sendResult = await sendMessage(userId, conversation.id, finalMessage, {
        source: "system",
      });

      if (sendResult.success) {
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
        const errorMsg = sendResult.reason || 'Sem confirmação de envio';
        errors.push(`${groupName}: ${errorMsg}`);
        details.failed.push({
          groupId: jid,
          groupName,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
        console.log(`[GROUP SEND] ? Falha: ${groupName}`);
      }

      if (groupIndex < groupIds.length - 1) {
        const waitMs = delayMin >= delayMax
          ? delayMin
          : Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        console.log(`[GROUP SEND] Aguardando ${Math.ceil(waitMs / 1000)}s antes do proximo grupo...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
      
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

// FunÃ§Ã£o auxiliar para obter sessÃµes (usado em rotas de debug)
export function getSessions(): Map<string, WhatsAppSession> {
  return sessions;
}

export type NativeWhatsappChatLabelResult =
  | { applied: true; jid: string; labelId: string; labelName: string }
  | { applied: false; skipped: string; jid?: string; labelId?: string; labelName?: string; error?: string };

function normalizeNativeWhatsappLabelId(value: string | null | undefined): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.slice(0, 48);
}

export async function applyNativeWhatsappChatLabel(params: {
  connectionId?: string | null;
  userId?: string | null;
  remoteJid?: string | null;
  contactNumber?: string | null;
  jidSuffix?: string | null;
  labelId?: string | null;
  labelName: string;
  color?: number | null;
}): Promise<NativeWhatsappChatLabelResult> {
  const labelName = String(params.labelName || "").trim();
  const labelId = normalizeNativeWhatsappLabelId(params.labelId || labelName);
  if (!labelName || !labelId) {
    return { applied: false, skipped: "missing_label" };
  }

  let session =
    (params.connectionId ? sessions.get(params.connectionId) : undefined) ||
    (params.userId ? sessions.get(params.userId) : undefined);

  if (!hasOperationalSocket(session) && params.userId && params.connectionId) {
    try {
      await connectWhatsApp(params.userId, params.connectionId, {
        source: "native_label_apply",
        openTimeoutMs: 30_000,
      });
      session = sessions.get(params.connectionId) || sessions.get(params.userId);
    } catch (error) {
      return {
        applied: false,
        skipped: "whatsapp_session_reconnect_failed",
        labelId,
        labelName,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (!hasOperationalSocket(session)) {
    return { applied: false, skipped: "whatsapp_session_unavailable", labelId, labelName };
  }

  const jid = buildSendJid({
    contactNumber: params.contactNumber || undefined,
    remoteJid: params.remoteJid || undefined,
    jidSuffix: params.jidSuffix || undefined,
  });
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast")) {
    return { applied: false, skipped: "unsupported_jid", jid, labelId, labelName };
  }

  const socket = session?.socket as any;
  if (typeof socket?.addLabel !== "function" || typeof socket?.addChatLabel !== "function") {
    return { applied: false, skipped: "baileys_label_api_unavailable", jid, labelId, labelName };
  }

  try {
    const color = Number.isFinite(Number(params.color)) ? Math.max(0, Math.min(19, Number(params.color))) : 0;
    await socket.addLabel(jid, { id: labelId, name: labelName, color });
    await socket.addChatLabel(jid, labelId);
    return { applied: true, jid, labelId, labelName };
  } catch (error) {
    return {
      applied: false,
      skipped: "baileys_label_apply_failed",
      jid,
      labelId,
      labelName,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// V23f: Graceful shutdown - fecha todas as sessÃµes Baileys antes de sair
export async function closeAllSessions(): Promise<void> {
  _isShuttingDown = true;
  console.log(`ðŸ›‘ [GRACEFUL] Fechando ${sessions.size} sessÃµes WhatsApp + ${adminSessions.size} admin sessions...`);
  const closePromises: Promise<void>[] = [];
  
  // Fechar sessÃµes de clientes
  for (const [connId, session] of sessions.entries()) {
    if (session?.socket) {
      closePromises.push(
        (async () => {
          try {
            session.socket.end(undefined);
            console.log(`  âœ… SessÃ£o ${connId.substring(0, 8)} fechada`);
          } catch (e) {
            console.log(`  âš ï¸ Erro ao fechar sessÃ£o ${connId.substring(0, 8)}:`, e);
          }
        })()
      );
    }
  }
  
  // Fechar sessÃµes admin
  for (const [adminId, session] of adminSessions.entries()) {
    if (session?.socket) {
      closePromises.push(
        (async () => {
          try {
            session.socket.end(undefined);
            console.log(`  âœ… Admin sessÃ£o ${adminId.substring(0, 8)} fechada`);
          } catch (e) {
            console.log(`  âš ï¸ Erro ao fechar admin sessÃ£o ${adminId.substring(0, 8)}:`, e);
          }
        })()
      );
    }
  }
  
  await Promise.allSettled(closePromises);
  console.log('âœ… [GRACEFUL] Todas as sessÃµes WhatsApp fechadas');
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
  // ??? MODO DESENVOLVIMENTO: Bloquear desconexï¿½es para evitar conflito com produï¿½ï¿½o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] disconnectWhatsApp bloqueado para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sessï¿½es do WhatsApp em produï¿½ï¿½o nï¿½o serï¿½o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessï¿½es em produï¿½ï¿½o.');
  }

  const ownership = await shouldSkipConnectionForCurrentRuntime(userId, connectionId);
  if (ownership.connection && ownership.skip) {
    if (!isWhatsAppGatewayRuntime() && ownership.owner === "gateway") {
      await disconnectGatewayInstance(ownership.connection.id);
      return;
    }
    throw new Error(`Connection ${ownership.connection.id} is owned by ${ownership.owner}`);
  }
  
  const connection = connectionId
    ? await storage.getConnectionById(connectionId)
    : await storage.getConnectionByUserId(userId);
  if (!connection || connection.userId !== userId) {
    return;
  }

  const resolvedConnectionId = connection.id;
  const session = sessions.get(resolvedConnectionId);
  if (session?.openTimeout) {
    clearTimeout(session.openTimeout);
    session.openTimeout = undefined;
  }
  if (session?.socket) {
    // Use end() instead of logout() to avoid cascade disconnect
    // logout() sends a revoke command to WhatsApp servers, disconnecting ALL linked devices (phone, PC, etc.)
    // end() only closes this local connection, leaving the phone and other devices connected
    try {
      session.socket.end(undefined);
    } catch (e) {
      console.log(`[DISCONNECT] Error closing socket for ${resolvedConnectionId}:`, e);
    }
  }

  if (session) {
    session.isOpen = false;
  }
  sessions.delete(resolvedConnectionId);
  unregisterWhatsAppSession(userId, resolvedConnectionId);

  clearPendingConnectionLock(resolvedConnectionId, 'manual_disconnect');
  reconnectAttempts.delete(resolvedConnectionId);

  if (!connectionId || connection.isPrimary !== false) {
    clearPendingConnectionLock(userId, 'manual_disconnect_primary');
    reconnectAttempts.delete(userId);
  }

  await storage.updateConnection(
    connection.id,
    buildBaileysConnectionStatePatch(false, {
      qrCode: null,
      providerConfig: buildManualDisconnectProviderConfig(connection, "manual_disconnect"),
    }),
  );

  await recordConnectionAuditEvent(connection.id, {
    kind: "manual_disconnect",
    source: "manual_disconnect",
    details: {
      userId,
      connectionId: connection.id,
      preservedAuth: true,
    },
  });

  // Limpar arquivos de autenticaï¿½ï¿½o para permitir nova conexï¿½o - always use auth_{userId}
  memoryCache.invalidate(`api:wa-conn:${userId}`);
  memoryCache.invalidate(`api:wa-conn:${userId}:${resolvedConnectionId}`);

  broadcastToUser(userId, {
    type: "disconnected",
    reason: "manual_disconnect",
    connectionId: resolvedConnectionId,
  });
}

// ?? Map para rastrear conex?es em andamento do ADMIN (evita m?ltiplas tentativas simult?neas)
interface PendingAdminConnectionEntry {
  promise: Promise<void>;
  startedAt: number;
  expiresAt?: number;
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
    if (isPendingConnectionExpired(entry, now, ADMIN_PENDING_LOCK_TTL_MS)) {
      const expiresAt = entry.expiresAt || entry.startedAt + ADMIN_PENDING_LOCK_TTL_MS;
      console.log(
        `?? [ADMIN PENDING LOCK] STALE_EVICTED: ${adminId.substring(0, 8)}... age=${Math.round(
          (now - entry.startedAt) / 1000,
        )}s > TTL=${Math.round(ADMIN_PENDING_LOCK_TTL_MS / 1000)}s`,
      );
      console.log(
        `?? [ADMIN PENDING LOCK] Expiração efetiva: ${Math.max(
          0,
          Math.round((expiresAt - entry.startedAt) / 1000),
        )}s`,
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

registerWhatsappRuntimeConnectionResolver((connectionId) => {
  const session = sessions.get(connectionId);
  if (!session) {
    return null;
  }

  return {
    phoneNumber: session.phoneNumber || null,
    isConnected: hasOperationalSocket(session),
  };
});

export function getAdminSession(adminId: string): AdminWhatsAppSession | undefined {
  return adminSessions.get(adminId);
}

function getUserAuthPaths(userId: string, connectionId?: string): string[] {
  const paths = [path.join(SESSIONS_BASE, `auth_${userId}`)];
  if (connectionId && connectionId !== userId) {
    paths.push(path.join(SESSIONS_BASE, `auth_${connectionId}`));
  }
  return paths;
}

type ConnectionAuthScopeCandidate = {
  path: string;
  scopeKey: string;
  isSharedUserScope: boolean;
};

type ConnectionAuthScopeResolution = ConnectionAuthScopeCandidate & {
  hasCreds: boolean;
};

function isSecondaryConnectionRecord(
  connection: Pick<WhatsappConnection, "id" | "isPrimary" | "connectionType"> | null | undefined,
  userId: string,
): boolean {
  if (!connection) {
    return false;
  }

  return (
    connection.isPrimary === false ||
    (connection.id !== userId && connection.connectionType === "secondary")
  );
}

function getConnectionAuthScopeCandidates(
  userId: string,
  connection?: Pick<WhatsappConnection, "id" | "isPrimary" | "connectionType"> | null,
  connectionId?: string,
): ConnectionAuthScopeCandidate[] {
  const resolvedConnectionId = connection?.id || connectionId;

  if (connection && isSecondaryConnectionRecord(connection, userId) && resolvedConnectionId) {
    return [
      {
        path: path.join(SESSIONS_BASE, `auth_${resolvedConnectionId}`),
        scopeKey: `connection:${resolvedConnectionId}`,
        isSharedUserScope: false,
      },
    ];
  }

  const candidates: ConnectionAuthScopeCandidate[] = [
    {
      path: path.join(SESSIONS_BASE, `auth_${userId}`),
      scopeKey: `user:${userId}`,
      isSharedUserScope: true,
    },
  ];

  if (resolvedConnectionId && resolvedConnectionId !== userId) {
    candidates.push({
      path: path.join(SESSIONS_BASE, `auth_${resolvedConnectionId}`),
      scopeKey: `connection:${resolvedConnectionId}`,
      isSharedUserScope: false,
    });
  }

  return candidates;
}

async function resolveConnectionAuthScope(
  userId: string,
  connection?: Pick<WhatsappConnection, "id" | "isPrimary" | "connectionType"> | null,
  connectionId?: string,
): Promise<ConnectionAuthScopeResolution> {
  const candidates = getConnectionAuthScopeCandidates(userId, connection, connectionId);

  for (const candidate of candidates) {
    try {
      const authFiles = await fs.readdir(candidate.path);
      if (authFiles.some((file) => file === "creds.json")) {
        return {
          ...candidate,
          hasCreds: true,
        };
      }
    } catch {
      // ignore missing auth path
    }
  }

  const fallback = candidates[0];
  if (fallback) {
    return {
      ...fallback,
      hasCreds: false,
    };
  }

  return {
    path: "",
    scopeKey: "",
    isSharedUserScope: false,
    hasCreds: false,
  };
}

function toConnectionPriorityMillis(value: unknown): number {
  if (!value) return 0;
  const parsed = new Date(value as any).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareConnectionAutoRecoveryPriority(
  a: Pick<WhatsappConnection, "isConnected" | "updatedAt" | "aiEnabled" | "isPrimary" | "createdAt">,
  b: Pick<WhatsappConnection, "isConnected" | "updatedAt" | "aiEnabled" | "isPrimary" | "createdAt">,
): number {
  if (a.isConnected && !b.isConnected) return -1;
  if (!a.isConnected && b.isConnected) return 1;

  const updatedDiff = toConnectionPriorityMillis(b.updatedAt) - toConnectionPriorityMillis(a.updatedAt);
  if (updatedDiff !== 0) return updatedDiff;

  if (a.aiEnabled && !b.aiEnabled) return -1;
  if (!a.aiEnabled && b.aiEnabled) return 1;

  if (a.isPrimary && !b.isPrimary) return -1;
  if (!a.isPrimary && b.isPrimary) return 1;

  return toConnectionPriorityMillis(b.createdAt) - toConnectionPriorityMillis(a.createdAt);
}

function selectSharedUserAuthClaimant(
  userId: string,
  connections: WhatsappConnection[],
): WhatsappConnection | undefined {
  const claimableConnections = connections.filter((connection) => !isSecondaryConnectionRecord(connection, userId));
  if (claimableConnections.length === 0) {
    return undefined;
  }

  return [...claimableConnections].sort(compareConnectionAutoRecoveryPriority)[0];
}

function canConnectionAutoRecoverUsingResolvedAuthScope(
  userId: string,
  connection: WhatsappConnection,
  siblingConnections: WhatsappConnection[],
  resolvedAuth: ConnectionAuthScopeResolution,
): {
  allowed: boolean;
  claimantId?: string;
  reason: string;
} {
  if (!resolvedAuth.hasCreds) {
    return { allowed: false, reason: "no_auth" };
  }

  if (!resolvedAuth.isSharedUserScope) {
    return { allowed: true, reason: "dedicated_auth_scope" };
  }

  const claimant = selectSharedUserAuthClaimant(userId, siblingConnections);
  if (!claimant || claimant.id === connection.id) {
    return { allowed: true, reason: "shared_scope_claimed_by_self" };
  }

  return {
    allowed: false,
    claimantId: claimant.id,
    reason: "shared_scope_claimed_by_other_connection",
  };
}

export async function hasPersistedAuthForConnection(
  userId: string,
  connectionId?: string,
): Promise<boolean> {
  const connection = connectionId ? await storage.getConnectionById(connectionId) : undefined;
  if (connection && !await isConnectionOwnedByCurrentProcess(connection)) {
    return false;
  }
  const resolvedAuth = await resolveConnectionAuthScope(userId, connection, connectionId);
  if (!resolvedAuth.hasCreds) {
    return false;
  }

  if (!connection || !resolvedAuth.isSharedUserScope) {
    return true;
  }

  const siblingConnections = await storage.getConnectionsByUserId(userId);
  const recoveryDecision = canConnectionAutoRecoverUsingResolvedAuthScope(
    userId,
    connection,
    siblingConnections,
    resolvedAuth,
  );

  if (!recoveryDecision.allowed) {
    console.log(
      `[AUTH SCOPE] Shared auth recovery blocked for conn ${connection.id.substring(0, 8)}... - claimed by ${recoveryDecision.claimantId?.substring(0, 8) || "unknown"}`,
    );
    return false;
  }

  return true;
}

async function waitForOperationalUserSession(
  userId: string,
  connectionId: string,
  waitMs: number,
  pollMs = 250,
): Promise<WhatsAppSession | undefined> {
  const allowUserFallback = connectionId === userId;
  const resolveCandidate = (): WhatsAppSession | undefined => {
    const byConnection = sessions.get(connectionId);
    if (hasOperationalSocket(byConnection)) {
      return byConnection;
    }

    if (allowUserFallback) {
      const byUser = sessions.get(userId);
      if (hasOperationalSocket(byUser)) {
        return byUser;
      }
    }

    return undefined;
  };

  const immediateSession = resolveCandidate();
  if (immediateSession) {
    return immediateSession;
  }

  if (waitMs <= 0) {
    return undefined;
  }

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const candidate = resolveCandidate();
    if (candidate) {
      return candidate;
    }
  }

  return resolveCandidate();
}

function getEnsureWaitBudgetRemainingMs(startedAt: number, waitMs: number): number {
  const remaining = waitMs - (Date.now() - startedAt);
  return remaining > 0 ? remaining : 0;
}

async function waitForPendingConnectionWithinBudget(
  promise: Promise<void>,
  budgetMs: number,
  source: string,
  scopeKey: string,
  label = "pending lock",
): Promise<"settled" | "timed_out"> {
  if (budgetMs <= 0) {
    return "timed_out";
  }

  return new Promise<"settled" | "timed_out">((resolve) => {
    let finished = false;

    const finish = (result: "settled" | "timed_out") => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timeoutHandle);
      resolve(result);
    };

    const timeoutHandle = setTimeout(() => {
      console.warn(
        `[USER SESSION ENSURE] ${source}: ${label} ${scopeKey.substring(0, 8)}... excedeu budget de ${budgetMs}ms; continuando sem aguardar indefinidamente`,
      );
      finish("timed_out");
    }, budgetMs);
    timeoutHandle.unref?.();

    promise
      .then(() => finish("settled"))
      .catch(() => finish("settled"));
  });
}

export async function ensureUserSessionOperational(
  userId: string,
  connectionId?: string,
  options?: {
    waitMs?: number;
    source?: string;
    allowPersistedAuthRecovery?: boolean;
  },
): Promise<WhatsAppSession | undefined> {
  const waitMs = options?.waitMs ?? 8_000;
  const source = options?.source ?? "unknown";
  const allowPersistedAuthRecovery = options?.allowPersistedAuthRecovery !== false;
  const ensureStartedAt = Date.now();

  const ownership = await shouldSkipConnectionForCurrentRuntime(userId, connectionId);
  if (ownership.connection && ownership.skip) {
    return undefined;
  }

  evictStalePendingLocks();
  let resolvedConnectionId = connectionId;
  let session = resolvedConnectionId ? sessions.get(resolvedConnectionId) : sessions.get(userId);
  if (hasOperationalSocket(session)) {
    return session;
  }

  const pendingConnection = resolvedConnectionId
    ? pendingConnections.get(resolvedConnectionId)
    : pendingConnections.get(userId);
  if (pendingConnection) {
    const pendingScopeKey = pendingConnection.connectionId || resolvedConnectionId || userId;
    const pendingWaitResult = await waitForPendingConnectionWithinBudget(
      pendingConnection.promise,
      getEnsureWaitBudgetRemainingMs(ensureStartedAt, waitMs),
      source,
      pendingScopeKey,
    );

    try {
      if (pendingWaitResult === "settled") {
        await pendingConnection.promise;
      }
    } catch {
      // final recheck below decides if it recovered
    }

    session = resolvedConnectionId ? sessions.get(resolvedConnectionId) : sessions.get(userId);
    if (hasOperationalSocket(session)) {
      return session;
    }

    if (pendingWaitResult === "timed_out") {
      return waitForOperationalUserSession(
        userId,
        pendingScopeKey,
        getEnsureWaitBudgetRemainingMs(ensureStartedAt, waitMs),
      );
    }
  }

  let connection =
    resolvedConnectionId
      ? await storage.getConnectionById(resolvedConnectionId)
      : await storage.getConnectionByUserId(userId);

  if (!connection || connection.userId !== userId) {
    if (connectionId) {
      return undefined;
    }
    connection = await storage.getConnectionByUserId(userId);
  }

  if (!connection) {
    return undefined;
  }

  resolvedConnectionId = connection.id;
  const hasPersistedAuth = allowPersistedAuthRecovery
    ? await hasPersistedAuthForConnection(userId, resolvedConnectionId)
    : false;

  if (!connection.isConnected && !hasPersistedAuth) {
    return undefined;
  }

  console.log(
    `[USER SESSION ENSURE] ${source}: tentando reidratar sessao user ${userId.substring(0, 8)}... conn=${resolvedConnectionId.substring(0, 8)} (dbConnected=${connection.isConnected}, hasPersistedAuth=${hasPersistedAuth})`,
  );

  const recoveryPromise = connectWhatsApp(userId, resolvedConnectionId, {
    source: `session_ensure:${source}`,
  });

  void recoveryPromise.catch((error) => {
    console.error(
      `[USER SESSION ENSURE] ${source}: falha ao iniciar recuperacao user ${userId.substring(0, 8)}... conn=${resolvedConnectionId.substring(0, 8)}:`,
      error,
    );
  });

  await waitForPendingConnectionWithinBudget(
    recoveryPromise,
    getEnsureWaitBudgetRemainingMs(ensureStartedAt, waitMs),
    source,
    resolvedConnectionId,
    "connect start",
  );

  return waitForOperationalUserSession(
    userId,
    resolvedConnectionId,
    getEnsureWaitBudgetRemainingMs(ensureStartedAt, waitMs),
  );
}

function isAdminSocketOperational(session?: AdminWhatsAppSession): boolean {
  if (!session?.socket) return false;
  const wsReadyState = (session.socket as any)?.ws?.readyState;
  return session.socket.user !== undefined && (wsReadyState === undefined || wsReadyState === 1);
}

function getAdminAuthPath(adminId: string): string {
  return path.join(ADMIN_SESSIONS_BASE, `auth_admin_${adminId}`);
}

export async function hasAdminPersistedAuth(adminId: string): Promise<boolean> {
  try {
    const authFiles = await fs.readdir(getAdminAuthPath(adminId));
    return authFiles.some((file) => file === "creds.json");
  } catch {
    return false;
  }
}

async function waitForAdminOperationalSession(
  adminId: string,
  waitMs: number,
  pollMs = 250,
): Promise<AdminWhatsAppSession | undefined> {
  const immediateSession = adminSessions.get(adminId);
  if (isAdminSocketOperational(immediateSession)) {
    return immediateSession;
  }

  if (waitMs <= 0) {
    return undefined;
  }

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const session = adminSessions.get(adminId);
    if (isAdminSocketOperational(session)) {
      return session;
    }
  }

  const finalSession = adminSessions.get(adminId);
  return isAdminSocketOperational(finalSession) ? finalSession : undefined;
}

export async function ensureAdminSessionOperational(
  adminId: string,
  options?: {
    waitMs?: number;
    source?: string;
    allowPersistedAuthRecovery?: boolean;
  },
): Promise<AdminWhatsAppSession | undefined> {
  const waitMs = options?.waitMs ?? 8_000;
  const source = options?.source ?? "unknown";
  const allowPersistedAuthRecovery = options?.allowPersistedAuthRecovery !== false;

  let session = adminSessions.get(adminId);
  if (isAdminSocketOperational(session)) {
    return session;
  }

  const pendingConnection = pendingAdminConnections.get(adminId);
  if (pendingConnection) {
    try {
      await pendingConnection.promise;
    } catch {
      // A verificaÃ§Ã£o final abaixo decide se a sessÃ£o ficou operacional.
    }
    session = adminSessions.get(adminId);
    if (isAdminSocketOperational(session)) {
      return session;
    }
  }

  const connection = await storage.getAdminWhatsappConnection(adminId);
  const hasPersistedAuth = allowPersistedAuthRecovery
    ? await hasAdminPersistedAuth(adminId)
    : false;

  if (!connection?.isConnected && !hasPersistedAuth) {
    return undefined;
  }

  console.log(
    `[ADMIN SESSION ENSURE] ${source}: tentando reidratar sessÃ£o do admin ${adminId.substring(0, 8)}... (dbConnected=${connection?.isConnected ?? false}, hasPersistedAuth=${hasPersistedAuth})`,
  );

  try {
    await connectAdminWhatsApp(adminId);
  } catch (error) {
    console.error(
      `[ADMIN SESSION ENSURE] ${source}: falha ao iniciar recuperaÃ§Ã£o do admin ${adminId.substring(0, 8)}...:`,
      error,
    );
  }

  return waitForAdminOperationalSession(adminId, waitMs);
}

async function getConnectedAdminSessionOrRecover(adminId: string): Promise<AdminWhatsAppSession | undefined> {
  return ensureAdminSessionOperational(adminId, {
    waitMs: 8_000,
    source: "admin_send_recovery",
    allowPersistedAuthRecovery: true,
  });
}

export async function connectAdminWhatsApp(adminId: string): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: Bloquear conexï¿½es para evitar conflito com produï¿½ï¿½o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] Conexï¿½o Admin WhatsApp bloqueada para admin ${adminId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sessï¿½es do WhatsApp em produï¿½ï¿½o nï¿½o serï¿½o afetadas\n`);
    throw new Error('WhatsApp Admin desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessï¿½es em produï¿½ï¿½o.');
  }

  // ? Evict stale locks before checking.
  evictStalePendingAdminLocks();

  // ?? Verificar se jï¿½ existe uma conexï¿½o em andamento
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

  // ?? Resetar contador de tentativas quando admin inicia conexï¿½o manualmente
  adminReconnectAttempts.delete(adminId);

  // ?? CRï¿½TICO: Criar e registrar a promise IMEDIATAMENTE para evitar race conditions
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

  // Registrar ANTES de qualquer operaï¿½ï¿½o async
  const pendingStartedAt = Date.now();
  const pendingEntry: PendingAdminConnectionEntry = {
    promise: connectionPromise,
    startedAt: pendingStartedAt,
    expiresAt: computePendingConnectionExpiresAt(
      pendingStartedAt,
      ADMIN_CONNECT_OPEN_TIMEOUT_MS,
      ADMIN_PENDING_LOCK_TTL_MS,
      WA_REDIS_PENDING_LOCK_EXTRA_MS,
    ),
    distributedLock,
  };
  pendingAdminConnections.set(adminId, pendingEntry);
  if (pendingEntry.distributedLock) {
    registerDistributedAdminPendingLockRefresh(adminId, pendingEntry, distributedLockTtlMs);
  }
  console.log(`[ADMIN CONNECT] Registered pending connection for admin ${adminId}`);

  // Executar a lï¿½gica de conexï¿½o
  (async () => {
    try {
      // Verificar se jï¿½ existe uma sessï¿½o ativa
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
          // Sessï¿½o existe mas nï¿½o estï¿½ conectada - limpar e recriar
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

    const adminAuthPath = getAdminAuthPath(adminId);
    await ensureDirExists(adminAuthPath);
    const { state, saveCreds } = await useBaileysAuthState(adminAuthPath);

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

    const waSocketVersion = await resolveWaSocketVersion("connectAdminWhatsApp");
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
      version: waSocketVersion,
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
        `?? [ADMIN CONNECT] OPEN TIMEOUT for admin ${adminId.substring(0, 8)}... ï¿½ closing socket`,
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

    socket.ev.on("creds.update", async (creds) => {
      await saveCreds(creds);
      scheduleWhatsAppSessionSnapshot(adminAuthPath, "admin-creds-update");
    });

    // -----------------------------------------------------------------------
    // ?? FUNï¿½ï¿½O: Processar mensagens enviadas pelo ADMIN no WhatsApp
    // -----------------------------------------------------------------------
    // Quando o admin responde direto no WhatsApp (fromMe: true),
    // precisamos salvar essa mensagem no sistema E transcrever ï¿½udios
    // -----------------------------------------------------------------------
    async function handleAdminOutgoingMessage(adminId: string, waMessage: WAMessage) {
      const remoteJid = waMessage.key.remoteJid;
      if (!remoteJid) return;

      const outgoingMessageId = waMessage.key.id;
      if (consumeAdminAgentMessageId(outgoingMessageId)) {
        console.log(`?? [ADMIN FROM ME] Ignorando mensagem automatica do agente (messageId: ${outgoingMessageId})`);
        return;
      }
      
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
        console.log(`?? [ADMIN FROM ME] Nï¿½o foi possï¿½vel extrair nï¿½mero de: ${remoteJid}`);
        return;
      }
      
      // Extrair texto e mï¿½dia
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
        messageText = msg.imageMessage.caption || "*Imagem*";
        try {
          const buffer = await downloadMediaMessage(waMessage, "buffer", {});
          const mimetype = msg.imageMessage.mimetype || "image/jpeg";
          mediaMimeType = mimetype;
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
        messageText = "*Audio*"; // Sera substituido pela transcricao
        try {
          const buffer = await downloadMediaMessage(waMessage, "buffer", {});
          const mimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
          const result = await uploadMediaToStorage(buffer, mimeType, adminId);
          if (result?.url) {
            mediaUrl = result.url;
            mediaMimeType = mimeType;
            console.log(`? [ADMIN FROM ME] ï¿½udio salvo: ${buffer.length} bytes (${mimeType})`);
          }
        } catch (err) {
          console.error("? [ADMIN FROM ME] Erro ao baixar ï¿½udio:", err);
        }
      } else if (msg?.videoMessage) {
        mediaType = "video";
        messageText = msg.videoMessage.caption || "*Video*";
        mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
      } else if (msg?.documentMessage) {
        mediaType = "document";
        messageText = msg.documentMessage.fileName || "*Documento*";
        mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
      } else {
        // Tipo nï¿½o suportado
        const msgTypes = Object.keys(msg || {});
        if (!msgTypes.includes("protocolMessage")) {
          console.log(`?? [ADMIN FROM ME] Tipo de mensagem nï¿½o suportado:`, msgTypes);
        }
        return;
      }
      
      console.log(`?? [ADMIN FROM ME] Salvando mensagem do admin: ${messageText.substring(0, 50)}...`);

      const trackedOutgoing = consumeTrackedAdminOutgoingMessage({
        messageId: waMessage.key.id,
        adminId,
        contactNumber,
        text: messageText,
        mediaType,
        mediaMimeType,
        mediaCaption: mediaType ? messageText : undefined,
      });

      const linkedOwnerContext = await resolveLinkedOwnerInboxContext(adminId);
      if (linkedOwnerContext) {
        await persistMirroredAdminOutgoingToOwnerInbox({
          context: linkedOwnerContext,
          contactNumber,
          remoteJid: realRemoteJid,
          contactName: waMessage.pushName || undefined,
          messageId: waMessage.key.id,
          messageText,
          timestamp: new Date(Number(waMessage.messageTimestamp) * 1000),
          mediaType: mediaType || null,
          mediaUrl: mediaUrl || null,
          mediaMimeType: mediaMimeType || null,
          mediaCaption: mediaType ? messageText : null,
          source: trackedOutgoing?.source || "admin_whatsapp_manual",
        });

        console.log(
          `[ADMIN FROM ME] Continuidade roteada para o inbox ${linkedOwnerContext.adminEmail} (${linkedOwnerContext.connectionId})`,
        );
        await notifyLinkedPlatformUserAboutAdminOutgoing({ contactNumber }, messageText);
        return;
      }

      if (trackedOutgoing) {
        console.log(`?? [ADMIN FROM ME] Eco reconhecido de ${trackedOutgoing.source} para ${contactNumber}`);

        if (!trackedOutgoing.alreadyPersisted && trackedOutgoing.conversationId) {
          const trackedTimestamp = new Date(Number(waMessage.messageTimestamp) * 1000);
          const savedTrackedMessage = await storage.createAdminMessage({
            conversationId: trackedOutgoing.conversationId,
            messageId: waMessage.key.id || `tracked_${Date.now()}`,
            fromMe: true,
            text: messageText,
            timestamp: trackedTimestamp,
            status: "sent",
            isFromAgent: trackedOutgoing.isFromAgent,
            mediaType,
            mediaUrl,
            mediaMimeType,
            mediaCaption: trackedOutgoing.mediaCaption,
          });

          await storage.updateAdminConversation(trackedOutgoing.conversationId, {
            lastMessageText: (savedTrackedMessage?.text || messageText || "").substring(0, 255),
            lastMessageTime: trackedTimestamp,
          });

          if (
            trackedOutgoing.source !== "admin_followup_text" &&
            trackedOutgoing.source !== "admin_scheduled_contact"
          ) {
            await followUpService.scheduleInitialFollowUp(trackedOutgoing.conversationId, { forceRestart: true });
          }
        }

        return;
      }

      const trackedSharedAutomaticPreview = peekTrackedSharedAutomaticOutgoingMessage({
        messageId: waMessage.key.id,
        contactNumber,
        mediaType,
        mediaMimeType,
        mediaCaption: mediaType ? messageText : undefined,
        text: messageText,
      });
      if (trackedSharedAutomaticPreview) {
        const shouldMirror = await shouldMirrorSharedAutomaticIntoAdmin({
          contactNumber,
          trackedMessage: trackedSharedAutomaticPreview,
        });
        if (!shouldMirror) {
          return;
        }
      }

      const trackedSharedAutomatic = consumeTrackedSharedAutomaticOutgoingMessage({
        messageId: waMessage.key.id,
        contactNumber,
        mediaType,
        mediaMimeType,
        mediaCaption: mediaType ? messageText : undefined,
        text: messageText,
      });
      if (trackedSharedAutomatic) {
        console.log(`ðŸ¤ [ADMIN FROM ME] Eco reconhecido de automaÃ§Ã£o externa (${trackedSharedAutomatic.source}) para ${contactNumber}`);

        const trackedTimestamp = new Date(Number(waMessage.messageTimestamp) * 1000);
        const sharedConversation = await storage.getOrCreateAdminConversation(
          adminId,
          contactNumber,
          realRemoteJid,
          waMessage.pushName || undefined
        );

        const savedSharedMessage = await storage.createAdminMessage({
          conversationId: sharedConversation.id,
          messageId: waMessage.key.id || `shared_auto_${Date.now()}`,
          fromMe: true,
          text: messageText,
          timestamp: trackedTimestamp,
          status: "sent",
          isFromAgent: trackedSharedAutomatic.isFromAgent,
          mediaType,
          mediaUrl,
          mediaMimeType,
          mediaCaption: trackedSharedAutomatic.mediaCaption,
        });

        await storage.updateAdminConversation(sharedConversation.id, {
          lastMessageText: (savedSharedMessage?.text || messageText || "").substring(0, 255),
          lastMessageTime: trackedTimestamp,
        });

        if (
          trackedSharedAutomatic.source !== "admin_followup_text" &&
          trackedSharedAutomatic.source !== "admin_scheduled_contact"
        ) {
          await followUpService.scheduleInitialFollowUp(sharedConversation.id, { forceRestart: true });
        }

        return;
      }
      
      // Buscar/criar conversa
      let conversation;
      try {
        conversation = await storage.getOrCreateAdminConversation(
          adminId,
          contactNumber,
          realRemoteJid,
          waMessage.pushName || undefined
        );

        await autoPauseAdminConversationOnManualReply({
          adminId,
          conversationId: conversation.id,
          contactNumber,
          source: "admin_whatsapp_manual",
        });
        
        // Salvar mensagem (transcriï¿½ï¿½o de ï¿½udio acontece automaticamente em createAdminMessage)
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
        
        // Se foi ï¿½udio e temos transcriï¿½ï¿½o, usar o texto transcrito
        if (savedMessage?.text && savedMessage.text !== messageText) {
          console.log(`?? [ADMIN FROM ME] Texto atualizado com transcriï¿½ï¿½o: ${savedMessage.text.substring(0, 100)}...`);
          messageText = savedMessage.text;
        }
        
        // Atualizar ï¿½ltima mensagem da conversa
        await storage.updateAdminConversation(conversation.id, {
          lastMessageText: messageText.substring(0, 255),
          lastMessageTime: new Date(),
        });

        await followUpService.scheduleInitialFollowUp(conversation.id, { forceRestart: true });
        await notifyLinkedPlatformUserAboutAdminOutgoing(conversation, messageText);

        console.log(`? [ADMIN FROM ME] Mensagem salva na conversa ${conversation.id}`);
      } catch (error) {
        console.error(`? [ADMIN FROM ME] Erro ao salvar mensagem:`, error);
      }
    }

    // -----------------------------------------------------------------------
    // ??? HANDLER DE PRESENï¿½A (TYPING/PAUSED) - DETECï¿½ï¿½O DE DIGITAï¿½ï¿½O
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
      const previousPresence = pending.lastKnownPresence;
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

        if (
          previousPresence === 'composing' &&
          presence !== 'composing' &&
          pending.timeout === null &&
          pending.messages.length > 0
        ) {
          rescheduleAdminPendingResponse({
            socket,
            key: contactNumber,
            delayMs: 6000,
            reason: `presenca mudou para ${presence}`,
          });
        }
      }
    });

    // -----------------------------------------------------------------------
    // ?? HANDLER DE ATUALIZACOES DE MENSAGEM DO ADMIN (retry/CTWA)
    // -----------------------------------------------------------------------
    socket.ev.on("messages.update", async (updates) => {
      for (const { key, update } of updates) {
        const stubParams = (update as any).messageStubParameters;
        if (stubParams && Array.isArray(stubParams) && stubParams.length >= 2) {
          const requestIdFromStub = stubParams[1];
          if (requestIdFromStub && typeof requestIdFromStub === "string" && requestIdFromStub.length > 5) {
            console.log(`ðŸ“£ [ADMIN CTWA PDO] Placeholder resend solicitado para ${key.id} de ${key.remoteJid} (requestId=${requestIdFromStub})`);
          }
        }

        const updateDecision = classifyRealtimeMessageUpdate({ key, update });
        if (updateDecision.action === "edit") {
          await applyRealtimeMessageEdit({
            userId: adminId,
            targetMessageId: updateDecision.targetMessageId,
            normalizedMessage: updateDecision.normalizedMessage,
            eventTs: update?.messageTimestamp
              ? new Date(Number(update.messageTimestamp) * 1000)
              : undefined,
          });
        } else if (updateDecision.action === "revoke") {
          await applyRealtimeMessageRevoke({
            userId: adminId,
            targetMessageId: updateDecision.targetMessageId,
            eventTs: update?.messageTimestamp
              ? new Date(Number(update.messageTimestamp) * 1000)
              : undefined,
          });
        } else if (updateDecision.action === "ignore") {
          console.log(`[ADMIN MSG-UPDATE] Ignorando atualizacao ${updateDecision.reason} para ${key.id || "sem-id"}`);
        } else if (updateDecision.action === "reemit" && key.remoteJid && !key.fromMe) {
          const msgContent = updateDecision.normalizedMessage || (update as any).message;
          if (key.id && msgContent) {
            cacheMessage(`admin_${adminId}`, key.id, msgContent);
            console.log(`ðŸ”„ [ADMIN MSG-UPDATE] Mensagem ${key.id} descriptografada via retry, reemitindo como upsert`);
            socket.ev.emit("messages.upsert", {
              type: "notify",
              messages: [{
                key,
                message: msgContent,
                messageTimestamp: Math.floor(Date.now() / 1000),
                pushName: (update as any).pushName || undefined,
              } as any],
            });
          }
        }
      }
    });

    // -----------------------------------------------------------------------
    // ?? HANDLER DE MENSAGENS DO ADMIN - ATENDIMENTO AUTOMATIZADO
    // -----------------------------------------------------------------------
    socket.ev.on("messages.upsert", async (m) => {
      const source = m.type;
      const requestId = (m as any).requestId;
      const message = m.messages[0];

      if (!message) return;

      const protocolMsg = message?.message?.protocolMessage;
      const pdoResponse = (protocolMsg as any)?.peerDataOperationRequestResponseMessage;
      if (pdoResponse) {
        const peerResults = pdoResponse.peerDataOperationResult || [];
        console.log(`ðŸ“¨ [ADMIN CTWA PDO] Resposta PDO recebida do celular (stanzaId=${pdoResponse.stanzaId}, results=${peerResults.length})`);
        for (const result of peerResults) {
          const resendResponse = result?.placeholderMessageResendResponse;
          if (!resendResponse?.webMessageInfoBytes) continue;
          try {
            const decoded = proto.WebMessageInfo.decode(resendResponse.webMessageInfoBytes);
            const decodedMsgId = decoded?.key?.id;
            if (decodedMsgId && decoded?.message && !getCachedMessage(`admin_${adminId}`, decodedMsgId)) {
              console.log(`ðŸ” [ADMIN CTWA PDO] Reemitindo mensagem decodificada manualmente: ${decodedMsgId}`);
              socket.ev.emit("messages.upsert", {
                messages: [decoded],
                type: "notify",
                requestId: pdoResponse.stanzaId || "admin-userland-fallback",
              } as any);
            }
          } catch (error) {
            console.error("âŒ [ADMIN CTWA PDO] Falha ao decodificar webMessageInfoBytes:", error);
          }
        }
        return;
      }
      
      // ?? FIX TRANSCRIï¿½ï¿½O: Capturar mensagens enviadas pelo prï¿½prio admin (fromMe: true)
      // para salvar no banco e transcrever ï¿½udios
      if (message.key.fromMe) {
        console.log(`?? [ADMIN] Mensagem enviada pelo admin detectada`);
        try {
          await handleAdminOutgoingMessage(adminId, message);
        } catch (err) {
          console.error("? [ADMIN] Erro ao processar mensagem do admin:", err);
        }
        return; // Nï¿½o processar como mensagem recebida
      }
      
      const remoteJid = message.key.remoteJid;
      if (!remoteJid) return;

      const rawTs = (message as any)?.messageTimestamp;
      const nTs = Number(rawTs);
      const hasValidTs = Number.isFinite(nTs) && nTs > 0;
      const eventTs = hasValidTs ? new Date(nTs * 1000) : new Date();
      const ageMs = Math.max(0, Date.now() - eventTs.getTime());
      const isAppendRecent =
        source === "append" &&
        ((hasValidTs && ageMs <= 10 * 60 * 1000) || (!hasValidTs && (m.messages?.length || 0) <= 5 && !!message.key.id));
      const hasMeaningfulContent = isMeaningfulIncomingContent(message.message as any);
      const isCTWAResolved = !!requestId && !!message.message;
      const isRecoverableAppendMessage = isRecoverableRealtimeAppendMessage({
        source,
        remoteJid,
        messageId: message.key.id,
        hasMeaningfulContent,
        hasValidTimestamp: hasValidTs,
        ageMs,
      });
      const isRecoverablePlaceholder = isRecoverableRealtimePlaceholder({
        source,
        remoteJid,
        fromMe: message.key.fromMe,
        messageId: message.key.id,
        hasMeaningfulContent,
      });
      const shouldProcess = shouldProcessRealtimeWhatsappEvent({
        source,
        isAppendRecent,
        isRecoverableAppendMessage,
        isCTWAResolved,
        isRecoverablePlaceholder,
      });
      if (isRecoverablePlaceholder && !isAppendRecent && !isCTWAResolved) {
        console.log(`[ADMIN CTWA-LEAD-GUARD] Processing old append placeholder to create a recoverable stub: ${message.key.id} from ${remoteJid} (source=${source})`);
      }
      if (isRecoverableAppendMessage && !isAppendRecent && !isCTWAResolved) {
        console.log(`[ADMIN APPEND-RECOVERY] Processing recovered append message ${message.key.id} from ${remoteJid} (ageMs=${ageMs})`);
      }

      const ignoredRealtimeReason = getIgnoredRealtimeIncomingReason(message);
      if (ignoredRealtimeReason) {
        console.log(`[ADMIN MSG-UPSERT] Ignorando evento de sistema ${ignoredRealtimeReason} para ${message.key.id || "sem-id"}`);
        return;
      }

      if (message.key.id && message.message) {
        cacheMessage(`admin_${adminId}`, message.key.id, message.message);
      }
      
      // Filtrar grupos e status
      if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
        console.log(`?? [ADMIN] Ignorando mensagem de grupo/status`);
        return;
      }
      
      try {
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

        if (!shouldProcess) {
          console.log(`â„¹ï¸ [ADMIN] Ignorando upsert antigo/source=${source} para ${contactNumber}`);
          return;
        }

        const unwrappedMsg = unwrapIncomingMessageContent(message.message as any);
        const hasMeaningfulContent = isMeaningfulIncomingContent(message.message as any);

        if (!hasMeaningfulContent || !unwrappedMsg) {
          console.log(`ðŸ“¡ [ADMIN CTWA] Mensagem placeholder/incompleta de ${contactNumber} (source=${source}${requestId ? ` requestId=${requestId}` : ""})`);
          await scheduleAdminStubRecovery({
            adminId,
            socket,
            waMessage: message,
            contactNumber,
            realRemoteJid,
            contactName: message.pushName || undefined,
          });
          return;
        }
        
        // Extrair texto e m?dia da mensagem
        let messageText = "";
        let mediaType: string | undefined;
        let mediaUrl: string | undefined;
        let mediaMimeType: string | undefined;
        let mediaCaption: string | undefined;
        
        const msg = unwrappedMsg;
        const incomingContextInfo = extractIncomingContextInfo(msg);
        const whatsappAdsAttribution = extractWhatsappAdsAttributionFromContextInfo(
          incomingContextInfo,
          message.key.id,
        );
        
        if (msg?.conversation) {
          messageText = msg.conversation;
        } else if (msg?.extendedTextMessage?.text) {
          messageText = msg.extendedTextMessage.text;
        } else if (msg?.imageMessage) {
          mediaType = "image";
          mediaCaption = msg.imageMessage.caption || undefined;
          mediaMimeType = msg.imageMessage.mimetype || "image/jpeg";
          messageText = mediaCaption || "(imagem enviada pelo cliente)";
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            const mimetype = mediaMimeType || "image/jpeg";
            // ?? Usar Storage em vez de base64 para reduzir egress
            const result = await uploadMediaToStorage(buffer, mimetype, adminId);
            if (result?.url) {
              mediaUrl = result.url;
              console.log(`? [ADMIN] Imagem salva no Storage: ${result.url}`);
            } else {
              console.warn(`?? [ADMIN] Falha no upload, imagem nï¿½o salva`);
            }
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar imagem:", err);
          }
        } else if (msg?.audioMessage) {
          mediaType = "audio";
          mediaMimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
          messageText = "(audio enviado pelo cliente)";
          // ??? Baixar ï¿½udio para transcriï¿½ï¿½o (serï¿½ transcrito em createAdminMessage)
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            const mimeType = mediaMimeType || "audio/ogg; codecs=opus";
            // ?? Usar Storage em vez de base64 para reduzir egress
            const result = await uploadMediaToStorage(buffer, mimeType, adminId);
            if (result?.url) {
              mediaUrl = result.url;
              console.log(`? [ADMIN] ï¿½udio salvo no Storage: ${buffer.length} bytes (${mimeType})`);
            } else {
              console.warn(`?? [ADMIN] Falha no upload de ï¿½udio`);
            }
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar ï¿½udio:", err);
          }
        } else if (msg?.videoMessage) {
          mediaType = "video";
          mediaCaption = msg.videoMessage.caption || undefined;
          mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
          messageText = mediaCaption || "(video enviado pelo cliente)";
          // V23j: Baixar e fazer upload de vÃ­deo para Storage
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            const mimeType = mediaMimeType || "video/mp4";
            const result = await uploadMediaToStorage(buffer, mimeType, adminId);
            if (result?.url) {
              mediaUrl = result.url;
              console.log(`âœ… [ADMIN] VÃ­deo salvo no Storage: ${result.url}`);
            }
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar vÃ­deo:", err);
          }
        } else if (msg?.documentWithCaptionMessage?.message?.documentMessage) {
          // V23j: Documento com legenda
          const docMsg = msg.documentWithCaptionMessage.message.documentMessage;
          mediaType = "document";
          mediaCaption = docMsg.caption || undefined;
          mediaMimeType = docMsg.mimetype || "application/octet-stream";
          messageText = mediaCaption || docMsg.fileName || "(documento enviado pelo cliente)";
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            const mimeType = mediaMimeType || "application/octet-stream";
            const result = await uploadMediaToStorage(buffer, mimeType, adminId);
            if (result?.url) {
              mediaUrl = result.url;
              console.log(`âœ… [ADMIN] Documento (com legenda) salvo no Storage: ${result.url}`);
            }
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar documento (com legenda):", err);
          }
        } else if (msg?.documentMessage) {
          mediaType = "document";
          mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
          messageText = msg.documentMessage.fileName || "(documento enviado pelo cliente)";
          // V23j: Baixar e fazer upload de documento para Storage
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            const mimeType = mediaMimeType || "application/octet-stream";
            const result = await uploadMediaToStorage(buffer, mimeType, adminId);
            if (result?.url) {
              mediaUrl = result.url;
              console.log(`âœ… [ADMIN] Documento salvo no Storage: ${result.url}`);
            }
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar documento:", err);
          }
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

        const linkedOwnerContext = await resolveLinkedOwnerInboxContext(adminId);
        if (linkedOwnerContext) {
          const ownerSession = sessions.get(linkedOwnerContext.connectionId);
          if (ownerSession) {
            await handleIncomingMessage(ownerSession, message, {
              source: "notify",
              allowAutoReply: true,
              eventTs: new Date(),
            });
            console.log(
              `[ADMIN] Inbound ${contactNumber} roteado para o inbox ${linkedOwnerContext.adminEmail} (${linkedOwnerContext.connectionId})`,
            );
          } else {
            console.warn(
              `[ADMIN] Inbox ${linkedOwnerContext.adminEmail} sem sessao ativa para ${contactNumber}; admin nao continuara a conversa`,
            );
          }
          return;
        }

        // -----------------------------------------------------------------------
        // ?? SALVAR CONVERSA E MENSAGEM NO BANCO DE DADOS
        // -----------------------------------------------------------------------
        let conversation: any;
        let savedMessage: any = null;
        try {
          // IMPORTANTE: Usar realRemoteJid (n?mero real) para envio de respostas
          conversation = await storage.getOrCreateAdminConversation(
            adminId, 
            contactNumber, 
            realRemoteJid, 
            message.pushName || undefined
          );

          if (whatsappAdsAttribution) {
            storage.recordAdminConversationWhatsappAdsAttribution(
              conversation.id,
              whatsappAdsAttribution,
            ).catch((error) => {
              console.error("[WHATSAPP ADS] Falha ao registrar atribuicao admin:", error);
            });
          }

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
          
          const existingAdminMessage = message.key.id
            ? await storage.getAdminMessageByMessageId(message.key.id)
            : null;

          if (existingAdminMessage) {
            savedMessage = await storage.updateAdminMessage(existingAdminMessage.id, {
              text: messageText,
              timestamp: new Date(),
              status: "received",
              mediaType,
              mediaUrl,
              mediaMimeType,
              mediaCaption,
            });
          } else {
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
              mediaMimeType,
              mediaCaption,
            });
          }
          
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
          const ownership = await enforcePriorityUserOwnershipForAdminLiveAutomation({
            conversationId: conversation.id,
            contactNumber,
            source: "admin_inbound_message",
          });
          if (ownership) {
            return;
          }

          const adminConnection = await storage.getAdminWhatsappConnection(adminId);
          const isAgentEnabled = await storage.isAdminAgentEnabledForConversation(conversation.id);
          console.log(`?? [ADMIN] Status do agente para ${contactNumber}: ${isAgentEnabled ? '? ATIVO' : '? DESATIVADO'}`);

          if (!shouldProcessInboundAdminAutomation({
            isAgentEnabled,
            isConnectionAiEnabled: adminConnection?.aiEnabled !== false,
            followupActive: conversation.followupActive,
          })) {
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
        
        // V23f: TODOS os tipos de mensagem passam pelo sistema de acumulaÃ§Ã£o.
        // Texto, Ã¡udio (transcrito), imagem, vÃ­deo, documento â€” tudo acumula.
        // Isso garante que quando cliente manda texto + imagem + Ã¡udio rÃ¡pido,
        // o agente processa TUDO como UMA mensagem combinada.
        await scheduleAdminAccumulatedResponse({
          adminId,
          socket,
          remoteJid: realRemoteJid,
          contactNumber,
          messageText,
          conversationId: conversation?.id,
          mediaType,
          mediaUrl,
          mediaMimeType,
        });
        return;
        
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

      // Estado "connecting" - quando o QR Code foi escaneado e estï¿½ conectando
      if (connStatus === "connecting") {
        console.log(`[ADMIN] Admin ${adminId} is connecting...`);
        broadcastToAdmin(adminId, { type: "connecting" });
      }

      if (connStatus === "open") {
        // ? CONSISTï¿½NCIA: Resetar tentativas quando conecta
        const phoneNumber = socket.user?.id.split(":")[0];
        console.log(`? [ADMIN] WhatsApp conectado: ${phoneNumber}`);
        
        // Forï¿½ar presenï¿½a disponï¿½vel
        socket.sendPresenceUpdate('available').catch(err => console.error("[ADMIN] Erro ao enviar presenï¿½a:", err));
        
        // Resetar tentativas de reconexï¿½o e limpar pendentes
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
        setTimeout(() => {
          void recoverAdminConversationsAfterReconnect(adminId);
        }, 8000);
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

        if (_isShuttingDown) {
          console.log(`[ADMIN CONNECTION CLOSE] Planned shutdown active for admin ${adminId.substring(0, 8)} - skipping DB disconnect/reconnect side effects`);
          stopAdminHeartbeat(adminId);
          adminSessions.delete(adminId);
          clearPendingAdminConnectionLock(adminId, "planned_shutdown");
          settleConnectionPromise(
            "reject",
            "planned_shutdown",
            new Error(`Planned shutdown closed admin connection ${adminId}`),
          );
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

        // Sempre deletar a sessï¿½o primeiro
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

        const hasPersistedAuth = shouldReconnect
          ? await hasAdminPersistedAuth(adminId)
          : false;

        if (shouldReconnect && hasPersistedAuth) {
          console.log(`[ADMIN CONNECTION CLOSE] Mantendo estado conectado no banco para auto-recuperaÃ§Ã£o do admin ${adminId.substring(0, 8)}...`);
          await storage.updateAdminWhatsappConnection(adminId, {
            isConnected: true,
            qrCode: null,
          });
          broadcastToAdmin(adminId, { type: "connecting" });
        } else {
          await storage.updateAdminWhatsappConnection(adminId, {
            isConnected: false,
            qrCode: null,
          });
        }

        // Verificar limite de tentativas de reconexï¿½o
        const now = Date.now();
        let attempt = adminReconnectAttempts.get(adminId) || { count: 0, lastAttempt: 0 };
        
        // Se passou mais de 30 segundos desde o ï¿½ltimo ciclo, resetar contador
        if (now - attempt.lastAttempt > ADMIN_RECONNECT_COOLDOWN_MS) {
          attempt = { count: 0, lastAttempt: now };
        }

        if (shouldReconnect) {
          attempt.count++;
          attempt.lastAttempt = now;
          adminReconnectAttempts.set(adminId, attempt);

          if (attempt.count <= MAX_ADMIN_RECONNECT_ATTEMPTS) {
            console.log(`[ADMIN] Reconnecting in 5s... (attempt ${attempt.count}/${MAX_ADMIN_RECONNECT_ATTEMPTS})`);
            if (attempt.count === 1 && !hasPersistedAuth) {
              broadcastToAdmin(adminId, { type: "disconnected" });
            } else if (attempt.count === 1) {
              broadcastToAdmin(adminId, { type: "connecting" });
            }
            setTimeout(() => connectAdminWhatsApp(adminId).catch(console.error), 5000);
          } else {
            console.log(`[ADMIN] Max reconnect attempts reached. Waiting for admin action.`);
            if (hasPersistedAuth) {
              broadcastToAdmin(adminId, { type: "connecting", reason: "retrying_with_auth" });
            } else {
              broadcastToAdmin(adminId, { type: "disconnected", reason: "max_attempts" });
            }
            adminReconnectAttempts.delete(adminId);
            await storage.updateAdminWhatsappConnection(adminId, {
              isConnected: hasPersistedAuth,
              qrCode: null,
            });
          }
        } else {
          // Foi logout
          console.log(`[ADMIN] Admin logged out, clearing auth files...`);
          
          const adminAuthPath = getAdminAuthPath(adminId);
          await clearAuthFiles(adminAuthPath);

          broadcastToAdmin(adminId, { type: "disconnected", reason: "logout" });
          adminReconnectAttempts.delete(adminId);

          // ?? AUTO-RETRY APï¿½S LOGOUT
          const hasLiveClient = hasAdminWebSocketClient(adminId);
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
  // ??? MODO DESENVOLVIMENTO: Bloquear desconexï¿½es para evitar conflito com produï¿½ï¿½o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] disconnectAdminWhatsApp bloqueado para admin ${adminId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sessï¿½es do WhatsApp em produï¿½ï¿½o nï¿½o serï¿½o afetadas\n`);
    throw new Error('WhatsApp Admin desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessï¿½es em produï¿½ï¿½o.');
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

  // Limpar arquivos de autenticaï¿½ï¿½o para permitir nova conexï¿½o
  const adminAuthPath = getAdminAuthPath(adminId);
  await clearAuthFiles(adminAuthPath);

  broadcastToAdmin(adminId, { type: "disconnected" });
}

export async function sendWelcomeMessage(userPhone: string): Promise<void> {
  try {
    console.log(`[WELCOME] Iniciando envio de mensagem de boas-vindas para ${userPhone}`);

    try {
      const { sendPrimaryOwnerWorkspaceWelcomeMessage } = await import("./ownerNotificationWorkspaceService");
      const sentByOwnerWorkspace = await sendPrimaryOwnerWorkspaceWelcomeMessage(userPhone);
      if (sentByOwnerWorkspace) {
        console.log("[WELCOME] Mensagem enviada pelo workspace do proprietário");
        return;
      }
    } catch (ownerWorkspaceError) {
      console.error("[WELCOME] Falha ao tentar workspace do proprietário:", ownerWorkspaceError);
    }

    // Obter admin (assumindo que hï¿½ apenas um admin owner)
    const allAdmins = await storage.getAllAdmins();
    const adminUser = allAdmins.find(a => a.role === 'owner');

    if (!adminUser) {
      console.log('[WELCOME] Admin nï¿½o encontrado');
      return;
    }

    console.log(`[WELCOME] Admin encontrado: ${adminUser.id}`);

    // ? PRIORIDADE: Verificar config do painel de notificaï¿½ï¿½es (admin_notification_config)
    const notifConfig = await storage.getAdminNotificationConfig?.(adminUser.id);
    
    let messageText = '';
    let aiEnabled = false;
    let aiPrompt = '';
    
    if (notifConfig && notifConfig.welcome_message_enabled) {
      // Usar variaï¿½ï¿½es do painel de notificaï¿½ï¿½es
      const variations = notifConfig.welcome_message_variations;
      if (Array.isArray(variations) && variations.length > 0) {
        // Escolher variaï¿½ï¿½o aleatï¿½ria
        messageText = variations[Math.floor(Math.random() * variations.length)];
        aiEnabled = notifConfig.welcome_message_ai_enabled ?? false;
        aiPrompt = notifConfig.welcome_message_ai_prompt || '';
        console.log(`[WELCOME] Usando config do painel de notificaï¿½ï¿½es (${variations.length} variaï¿½ï¿½es)`);
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
        console.log('[WELCOME] Mensagem de boas-vindas nï¿½o configurada');
        return;
      }
      
      messageText = messageConfig.valor;
      console.log('[WELCOME] Usando config do sistema legado');
    }

    // Substituir variï¿½veis
    const normalizedWelcomePhone = cleanContactNumber(userPhone) || userPhone.replace(/\D/g, '');
    let recipientName = 'Cliente';

    if (normalizedWelcomePhone) {
      const userByPhone = await storage.getUserByPhone(normalizedWelcomePhone);
      const userName = String(userByPhone?.name || '').trim();
      if (userName) {
        recipientName = userName;
      } else {
        const adminConversation = await storage.getAdminConversationByPhone(normalizedWelcomePhone);
        const conversationName = String(adminConversation?.contactName || '').trim();
        if (conversationName) {
          recipientName = conversationName;
        }
      }
    }

    messageText = messageText
      .replace(/\{\{name\}\}/g, recipientName)
      .replace(/\{nome\}/g, recipientName)
      .trim();

    // Aplicar variaï¿½ï¿½o IA se habilitado
    if (aiEnabled && aiPrompt) {
      try {
        const { applyAIVariation } = await import('./notificationSchedulerService');
        messageText = await applyAIVariation(messageText, aiPrompt, recipientName);
        messageText = messageText
          .replace(/\{\{name\}\}/g, recipientName)
          .replace(/\{nome\}/g, recipientName)
          .trim();
        console.log('[WELCOME] Variaï¿½ï¿½o IA aplicada');
      } catch (aiError) {
        console.error('[WELCOME] Erro ao aplicar variaï¿½ï¿½o IA:', aiError);
        // Continua com a mensagem original
      }
    }

    // Verificar se admin tem WhatsApp conectado
    const adminConnection = await storage.getAdminWhatsappConnection(adminUser.id);

    if (!adminConnection || !adminConnection.isConnected) {
      console.log('[WELCOME] Admin WhatsApp nï¿½o conectado');
      return;
    }

    console.log('[WELCOME] Admin WhatsApp conectado, procurando sessï¿½o...');

    let adminSession = adminSessions.get(adminUser.id);

    // Se a sessï¿½o nï¿½o existe, tentar restaurï¿½-la
    if (!adminSession || !adminSession.socket) {
      console.log('[WELCOME] Admin WhatsApp session nï¿½o encontrada, tentando restaurar...');
      try {
        await connectAdminWhatsApp(adminUser.id);
        adminSession = adminSessions.get(adminUser.id);

        if (!adminSession || !adminSession.socket) {
          console.log('[WELCOME] Falha ao restaurar sessï¿½o do admin');
          return;
        }

        console.log('[WELCOME] Sessï¿½o do admin restaurada com sucesso');
      } catch (restoreError) {
        console.error('[WELCOME] Erro ao restaurar sessï¿½o do admin:', restoreError);
        return;
      }
    }

    console.log('[WELCOME] Sessï¿½o encontrada, enviando mensagem...');

    // Formatar nï¿½mero para envio (remover + e adicionar @s.whatsapp.net)
    const formattedNumber = `${cleanContactNumber(userPhone) || userPhone.replace('+', '')}@${DEFAULT_JID_SUFFIX}`;

    // ? ANTI-BLOQUEIO: Enviar via fila
    await sendWithQueue(getAdminQueueId(adminUser.id), 'credenciais welcome', async () => {
      await adminSession!.socket!.sendMessage(formattedNumber, {
        text: messageText,
      });
    });

    // ? Registrar log na tabela de notificaï¿½ï¿½es
    try {
      await storage.createAdminNotificationLog?.({
        adminId: adminUser.id,
        userId: null as any,
        notificationType: 'welcome',
        recipientPhone: userPhone,
        recipientName,
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
    // Nï¿½o lanï¿½a erro para nï¿½o bloquear o cadastro
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
    setRestoreInProgress(true);
    _restoreStartedAt = Date.now();
    console.log("Checking for existing WhatsApp connections...");
    // Multi-connection: Restore ALL visible connections (each gets its own socket).
    // Removed connections may still have auth files or stale DB flags; keep them
    // out of restore and normalize them so they cannot appear operational again.
    const allConnections = await storage.getAllConnections();
    const connections: typeof allConnections = [];
    let removedConnectionSkipCount = 0;
    for (const connection of allConnections) {
      if (!isUserRemovedConnection(connection)) {
        connections.push(connection);
        continue;
      }

      removedConnectionSkipCount++;
      if (connection.isConnected || connection.providerStatus !== "removed" || connection.aiEnabled || connection.isPrimary) {
        await storage.updateConnection(connection.id, {
          isConnected: false,
          qrCode: null,
          providerStatus: "removed",
          aiEnabled: false,
          isPrimary: false,
        } as any);
      }
    }
    if (removedConnectionSkipCount > 0) {
      console.log(`[RESTORE] Skipped ${removedConnectionSkipCount} removed connection(s) during startup restore`);
    }

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
            // Direct userId match ï¿½ use this path (highest priority)
            authDirsWithFiles.set(id, dirPath);
            console.log(`[RESTORE] Found auth_${id.substring(0, 8)}... (userId, ${files.length} files)`);
          } else {
            // Check if this ID is a connectionId
            const mappedUserId = connIdToUserId.get(id);
            if (mappedUserId) {
              // ConnectionId match ï¿½ store per-connection auth
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
      if (!await isConnectionOwnedByCurrentProcess(connection)) {
        continue;
      }

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

      const resolvedAuth = await resolveConnectionAuthScope(connection.userId, connection, connection.id);
      const hasAuthFiles = resolvedAuth.hasCreds;
      
      if (hasAuthFiles) {
        const authScope = resolvedAuth.path;

        // DEDUP: If another connection already claimed this auth scope, skip
        if (restoredAuthScopes.has(authScope)) {
          waObservability.restoreDedupSkipped++;
          console.log(`[RESTORE] ?? DEDUP: conn ${connection.id.substring(0, 8)} skipped ï¿½ auth scope already claimed by another connection (prevents 440 conflict)`);
          // Mark as disconnected to avoid stale isConnected=true in DB
          await storage.updateConnection(
            connection.id,
            buildBaileysConnectionStatePatch(false, { qrCode: null }),
          );
          skippedCount++;
          continue;
        }

        restoredAuthScopes.add(authScope);
        restoredConnIds.add(connection.id);
        toRestore.push({ userId: connection.userId, connectionId: connection.id });
      } else if (connection.isConnected) {
        console.log(`[RESTORE] User ${connection.userId.substring(0, 8)} conn ${connection.id.substring(0, 8)} has no auth files on disk - marking disconnected`);
        await storage.updateConnection(
          connection.id,
          buildBaileysConnectionStatePatch(false, { qrCode: null }),
        );
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
          const isPairingCooldown = reason?.code === "WA_PAIRING_REQUIRED_COOLDOWN";

          // Timeout during restore is usually transient (slow WA handshake/startup pressure).
          // Keep DB state and let health check/pending cron trigger reconnect without forcing disconnect.
          if ((isOpenTimeout || isPairingCooldown) && failedEntry) {
            const deferredReason = isPairingCooldown ? "qr_pendente" : "open-timeout";
            console.warn(`[RESTORE] Deferred reconnect for ${failedEntry.connectionId.substring(0, 8)} after ${deferredReason}; keeping DB state unchanged`);
            continue;
          }

          if (failedEntry) {
            try {
              await storage.updateConnection(
                failedEntry.connectionId,
                buildBaileysConnectionStatePatch(false, { qrCode: null }),
              );
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
    setRestoreInProgress(false);
    _restoreStartedAt = 0;
    console.log(`[RESTORE] ?? Restore guard released ï¿½ health check can now run`);
    setTimeout(() => {
      void connectionHealthCheck();
    }, 2000);
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
      const adminAuthPath = getAdminAuthPath(admin.id);
      let hasAuthFiles = false;
      try {
        const files = await fs.readdir(adminAuthPath);
        hasAuthFiles = files.some(f => f.includes('creds'));
      } catch {
        // Directory doesn't exist
      }

      const shouldRestore = hasAuthFiles || (adminConnection && adminConnection.isConnected);

      if (shouldRestore) {
        setAdminRestoreInProgress(true);
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
    setAdminRestoreInProgress(false);
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
    throw new Error('WebSocket nï¿½o encontrado no socket Baileys');
  }

  // Jï¿½ estï¿½ aberto
  if (ws.isOpen === true) {
    console.log(`[WS] WebSocket jï¿½ estï¿½ aberto (isOpen=true)`);
    return;
  }

  console.log(`[WS] Aguardando WebSocket abrir... (ws.isOpen=${ws.isOpen}, timeout=${timeoutMs}ms)`);

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout aguardando conexï¿½o WebSocket (${timeoutMs}ms). O WebSocket nï¿½o abriu a tempo.`));
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
// pronto (evento QR recebido), o cï¿½digo pode atï¿½ ser gerado mas o pareamento
// falha com "Nï¿½o foi possï¿½vel conectar o dispositivo" no celular.
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

      // QR recebido = socket estï¿½ pronto para pairing
      if (qr) {
        console.log(`[QR EVENT] ? QR event recebido! Socket pronto para pairing.`);
        cleanup();
        resolve({ success: true });
        return;
      }

      // Conexï¿½o fechada antes do QR
      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorMessage = (lastDisconnect?.error as any)?.message || "Connection closed";

        console.log(`[QR EVENT] ? Conexï¿½o fechada antes do QR - statusCode: ${statusCode}`);

        cleanup();
        resolve({
          success: false,
          closedBeforeQr: true,
          statusCode,
          errorMessage
        });
        return;
      }

      // Conexï¿½o aberta (nï¿½o deveria acontecer antes do QR/pairing, mas logamos)
      if (conn === "open") {
        console.log(`[QR EVENT] Conexï¿½o aberta inesperadamente antes do pairing`);
        cleanup();
        resolve({ success: true }); // Consideramos sucesso pois jï¿½ estï¿½ conectado
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
// ?? FUNï¿½ï¿½O AUXILIAR: Criar socket de pairing com configuraï¿½ï¿½o otimizada
// -----------------------------------------------------------------------
// Cria um socket Baileys com version, browser e configuraï¿½ï¿½es recomendadas
// para pairing code, reduzindo a ocorrï¿½ncia de 515 restartRequired.
// -----------------------------------------------------------------------
async function createPairingSocket(
  userId: string,
  authPath: string,
  connectionId: string
): Promise<{ sock: any; state: any; saveCreds: (creds: any) => void }> {
  // WA Web version is resolved dynamically because stale Baileys defaults can
  // generate a QR/pairing code that WhatsApp later refuses on the phone.
  const version = await resolveWaSocketVersion("createPairingSocket");
  console.log(`[PAIRING] WA Web version: ${version.join(".")}`);

  const { state, saveCreds } = await useBaileysAuthState(authPath);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    // -----------------------------------------------------------------------
    // Use the live WA Web version instead of Baileys' stale bundled default.
    // -----------------------------------------------------------------------
    version,
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 250,
    // -----------------------------------------------------------------------
    // ?? BROWSER CONFIG: Ubuntu + Chrome (compatï¿½vel com WhatsApp Web)
    // -----------------------------------------------------------------------
    browser: Browsers.ubuntu('Chrome'),
    // -----------------------------------------------------------------------
    // ?? REDUZIR INSTABILIDADE: Configuraï¿½ï¿½es recomendadas para pairing
    // -----------------------------------------------------------------------
    defaultQueryTimeoutMs: undefined,  // Reduz "Connection Closed"
    syncFullHistory: false,  // Pairing ï¿½ sï¿½ autenticar, sync depois
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
// ?? FUNï¿½ï¿½O AUXILIAR: Handler de conexï¿½o para pairing com restart
// -----------------------------------------------------------------------
// Configura os handlers de connection.update para um socket de pairing,
// tratando automaticamente restartRequired (515) com reconexï¿½o.
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
        scheduleWhatsAppSessionSnapshot(mainAuthPath, "pairing-promoted");
        await clearAuthFiles(authPath);
      } catch (promoteErr) {
        console.error(`?? [PAIRING] Erro ao promover auth:`, promoteErr);
      }

      // Cancelar timeout de expiraï¿½ï¿½o
      const pairingRecord = pairingSessions.get(userId);
      if (pairingRecord?.timeoutId) {
        clearTimeout(pairingRecord.timeoutId);
      }
      pairingSessions.delete(userId);
      clearPairingState(userId);

      await storage.updateConnection(
        session.connectionId,
        buildBaileysConnectionStatePatch(true, {
          phoneNumber: phoneNum,
          qrCode: null,
        }),
      );

      console.log(`[PAIRING] WhatsApp conectado: ${phoneNum}`);
      broadcastToUser(userId, { type: "connected", phoneNumber: phoneNum, connectionId: session.connectionId });
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

        await storage.updateConnection(
          session.connectionId,
          buildBaileysConnectionStatePatch(false, { qrCode: null }),
        );

        broadcastToUser(userId, { type: "disconnected", reason: "pairing_failed", connectionId: session.connectionId });
        return;
      }

      // -----------------------------------------------------------------------
      // ?? 515 restartRequired / 408 timedOut / 428 connectionClosed
      // -----------------------------------------------------------------------
      // Estes sï¿½o "closes transitï¿½rios" que devem iniciar reconexï¿½o automï¿½tica
      // -----------------------------------------------------------------------
      if (statusCode === DisconnectReason.restartRequired || statusCode === 515 ||
          statusCode === DisconnectReason.timedOut || statusCode === 408 ||
          statusCode === DisconnectReason.connectionClosed || statusCode === 428) {

        console.log(`?? [PAIRING] Close transitorio (${statusCode}) - iniciando restart...`);

        const state = getPairingState(userId);
        if (!state) {
          console.log(`?? [PAIRING] Estado de pairing nï¿½o encontrado, abortando restart`);
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

        // Chamar callback de restart (serï¿½ tratado fora do handler)
        setTimeout(() => onRestartNeeded(), 3000);
        return;
      }

      // Outros closes - log e aguardar
      console.log(`?? [PAIRING] Close nï¿½o tratado (statusCode: ${statusCode}), aguardando...`);
    }
  });
}

export async function requestClientPairingCode(userId: string, phoneNumber: string, targetConnectionId?: string): Promise<string | null> {
  // ??? MODO DESENVOLVIMENTO: Bloquear pairing para evitar conflito com produï¿½ï¿½o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n??? [DEV MODE] requestClientPairingCode bloqueado para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ? Sessï¿½es do WhatsApp em produï¿½ï¿½o nï¿½o serï¿½o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessï¿½es em produï¿½ï¿½o.');
  }

  // Verificar cooldown de rate limit
  const cooldown = pairingRateLimitCooldown.get(userId);
  if (cooldown && cooldown.until > Date.now()) {
    const remainingMinutes = Math.ceil((cooldown.until - Date.now()) / 60000);
    throw new Error(`WhatsApp limitou as tentativas de conexï¿½o. Aguarde ${remainingMinutes} minutos antes de tentar novamente.`);
  }

  // Verificar se jï¿½ hï¿½ uma solicitaï¿½ï¿½o em andamento para este usuï¿½rio
  const pairingRequestKey = targetConnectionId || userId;
  const existingRequest = pendingPairingRequests.get(pairingRequestKey);
  if (existingRequest) {
    console.log(`? [PAIRING] J? existe solicita??o em andamento para ${pairingRequestKey}, aguardando...`);
    return existingRequest;
  }

  // Criar Promise da solicita??o
  const requestPromise = (async () => {
    // Usar auth_pairing_<userId> para isolar do QR normal
    const pairingAuthPath = path.join(SESSIONS_BASE, `auth_pairing_${pairingRequestKey}`);
    let mainAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
    let cleanupSessionKey = pairingRequestKey;
    let sock: any = null;  // Socket atual do pairing (pode ser substituï¿½do em restarts)
    let pairingTimeoutId: NodeJS.Timeout | undefined;

    try {
      console.log(`?? [PAIRING] Solicitando c?digo para ${phoneNumber} (user: ${userId})`);

      // Limpar sessï¿½o anterior se existir
      const lookupKey = pairingRequestKey;
      const existingSession = sessions.get(lookupKey);
      if (existingSession?.socket) {
        try {
          console.log(`[PAIRING] Limpando sessï¿½o anterior (encerrando conexï¿½o local)...`);
          await existingSession.socket.end(undefined);
        } catch (e) {
          console.log(`[PAIRING] Erro ao encerrar sessï¿½o anterior (ignorando):`, e);
        }
        sessions.delete(lookupKey);
        unregisterWhatsAppSession(userId, targetConnectionId);
      }

      // Criar/obter conexï¿½o
      let connection;
      if (targetConnectionId) {
        connection = await storage.getConnectionById(targetConnectionId);
        if (!connection || connection.userId !== userId) {
          throw new Error("Conexao de WhatsApp nao encontrada para este usuario.");
        }
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
      cleanupSessionKey = connection.id;
      const resolvedMainAuth = await resolveConnectionAuthScope(userId, connection, connection.id);
      mainAuthPath = resolvedMainAuth.path || path.join(SESSIONS_BASE, `auth_${connection.id || userId}`);

      // -----------------------------------------------------------------------
      // ?? ISOLAMENTO DO AUTH DE PAIRING
      // -----------------------------------------------------------------------
      // Usar auth_pairing_<userId> separado para nï¿½o interferir no QR normal.
      // Se o pairing falhar, apenas limpamos essa pasta especï¿½fica.
      // -----------------------------------------------------------------------

      // Limpar auth de pairing anterior (se existir)
      await clearAuthFiles(pairingAuthPath);

      // Recriar a pasta para o multi-file auth state
      await ensureDirExists(pairingAuthPath);

      // -----------------------------------------------------------------------
      // Criar socket usando WA Web version atual/cacheada.
      // -----------------------------------------------------------------------
      // A funï¿½ï¿½o createPairingSocket jï¿½ busca a versï¿½o mais recente do Baileys
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
    
    sock.ev.on("creds.update", async (creds) => {
      await saveCreds(creds);
      scheduleWhatsAppSessionSnapshot(pairingAuthPath, "pairing-creds-update");
    });
    
    // Handler de conex?o
    sock.ev.on("connection.update", async (update) => {
      const { connection: conn, lastDisconnect } = update;
      try {

      if (conn === "open") {
        // FIX 2026-02-24: Mark session as truly open
        session.isOpen = true;
        session.connectedAt = Date.now();
        const phoneNum = sock.user?.id?.split(":")[0] || "";
        session.phoneNumber = phoneNum;

        // -----------------------------------------------------------------------
        // ?? PROMOVER AUTH_PAIRING PARA AUTH PRINCIPAL
        // -----------------------------------------------------------------------
        // Quando o pairing tem sucesso, o auth_pairing_<userId> contï¿½m a
        // sessï¿½o vï¿½lida. Precisamos promover para auth_<userId> para que
        // restauraï¿½ï¿½es futuras funcionem normalmente via QR.
        // -----------------------------------------------------------------------
        try {
          // pairingAuthPath jï¿½ estï¿½ definido no escopo da funï¿½ï¿½o

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

          console.log(`?? [PAIRING] Auth promovido: auth_pairing_${pairingRequestKey.substring(0, 8)}... -> ${path.basename(mainAuthPath)}`);
          scheduleWhatsAppSessionSnapshot(mainAuthPath, "pairing-promoted");

          // Limpar auth_pairing (nï¿½o ï¿½ mais necessï¿½rio)
          await clearAuthFiles(pairingAuthPath);
        } catch (promoteErr) {
          console.error(`?? [PAIRING] Erro ao promover auth (nï¿½o crï¿½tico, sessï¿½o jï¿½ funciona):`, promoteErr);
        }

        // Cancelar timeout de expiraï¿½ï¿½o
        const pairingRecord = pairingSessions.get(pairingRequestKey);
        if (pairingRecord?.timeoutId) {
          clearTimeout(pairingRecord.timeoutId);
          pairingSessions.delete(pairingRequestKey);
          console.log(`?? [PAIRING] Timeout de expiraï¿½ï¿½o cancelado, sessï¿½o estï¿½vel`);
        }

        await storage.updateConnection(
          session.connectionId,
          buildBaileysConnectionStatePatch(true, {
            phoneNumber: phoneNum,
            qrCode: null,
          }),
        );

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
            console.error(`?? [PAIRING] Erro ao limpar auth apï¿½s rate limit:`, e);
          }

          // Cancelar timeout
          const pairingRecord = pairingSessions.get(pairingRequestKey);
          if (pairingRecord?.timeoutId) {
            clearTimeout(pairingRecord.timeoutId);
          }
          pairingSessions.delete(pairingRequestKey);

          broadcastToUser(userId, {
            type: "disconnected",
            reason: "pairing_rate_limited"
          });

          return;
        }

        // -----------------------------------------------------------------------
        // ?? TRATAR 515 restartRequired - RECONEXï¿½O AUTOMï¿½TICA
        // -----------------------------------------------------------------------
        // O statusCode 515 (restartRequired) ï¿½ comum apï¿½s requestPairingCode.
        // O Baileys fecha a conexï¿½o mas o auth_pairing ainda ï¿½ vï¿½lido.
        // Precisamos reconectar sem limpar o auth para que o cï¿½digo continue funcionando.
        // -----------------------------------------------------------------------
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(`?? [PAIRING RESTART] restartRequired (515) detectado - iniciando reconexï¿½o automï¿½tica...`);

          // Verificar limite de retries
          const now = Date.now();
          let retryState = pairingRetries.get(pairingRequestKey) || { count: 0, lastAttempt: 0 };

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

            const pairingRecord = pairingSessions.get(pairingRequestKey);
            if (pairingRecord?.timeoutId) {
              clearTimeout(pairingRecord.timeoutId);
            }
            pairingSessions.delete(pairingRequestKey);
            pairingRetries.delete(pairingRequestKey);

            broadcastToUser(userId, {
              type: "disconnected",
              reason: "pairing_failed"
            });

            return;
          }

          // Incrementar e agendar reconexï¿½o
          retryState.count++;
          retryState.lastAttempt = now;
          pairingRetries.set(pairingRequestKey, retryState);

          console.log(`?? [PAIRING RESTART] Agendando retry ${retryState.count}/${MAX_PAIRING_RETRIES} em 5s...`);

          // Notificar frontend sobre reconexï¿½o
          broadcastToUser(userId, {
            type: "pairing_restarting",
            retryCount: retryState.count,
            maxRetries: MAX_PAIRING_RETRIES
          });

          // Agendar reconexï¿½o apï¿½s delay
          setTimeout(async () => {
            try {
              console.log(`?? [PAIRING RESTART] Executando reconexï¿½o ${retryState.count}/${MAX_PAIRING_RETRIES}...`);

              // Criar novo socket com o mesmo auth
              const { state: newState, saveCreds: newSaveCreds } = await useBaileysAuthState(pairingAuthPath);
              const restartVersion = await resolveWaSocketVersion("pairingRestartSocket");

              const newSock = makeWASocket({
                auth: {
                  creds: newState.creds,
                  keys: makeCacheableSignalKeyStore(newState.keys, pino({ level: "silent" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                // FIX 2026-02-24: WhatsApp rejeitou Platform.WEB (405 error)
                version: restartVersion,
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

              // Atualizar sessï¿½o
              session.socket = newSock;
              sessions.set(session.connectionId, session);

              // Re-configurar handlers
              newSock.ev.on("creds.update", async (creds) => {
                await newSaveCreds(creds);
                scheduleWhatsAppSessionSnapshot(pairingAuthPath, "pairing-restart-creds-update");
              });

              // Re-atribuir handler de connection.update (recursivamente)
              // Nota: isso ï¿½ simplificado; em produï¿½ï¿½o idealmente usarï¿½amos uma funï¿½ï¿½o reutilizï¿½vel
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
                    await clearAuthFiles(mainAuthPath);
                    await ensureDirExists(mainAuthPath);

                    const pairingFiles = await fs.readdir(pairingAuthPath);
                    for (const file of pairingFiles) {
                      const srcPath = path.join(pairingAuthPath, file);
                      const destPath = path.join(mainAuthPath, file);
                      const content = await fs.readFile(srcPath);
                      await fs.writeFile(destPath, content);
                    }

                    console.log(`?? [PAIRING RESTART] Auth promovido apï¿½s restart`);

                    scheduleWhatsAppSessionSnapshot(mainAuthPath, "pairing-restart-promoted");
                    await clearAuthFiles(pairingAuthPath);
                  } catch (promoteErr) {
                    console.error(`?? [PAIRING RESTART] Erro ao promover auth:`, promoteErr);
                  }

                  // Cancelar timeouts
                  const pRecord = pairingSessions.get(pairingRequestKey);
                  if (pRecord?.timeoutId) {
                    clearTimeout(pRecord.timeoutId);
                  }
                  pairingSessions.delete(pairingRequestKey);
                  pairingRetries.delete(pairingRequestKey);

                  await storage.updateConnection(
                    session.connectionId,
                    buildBaileysConnectionStatePatch(true, {
                      phoneNumber: phoneNum,
                      qrCode: null,
                    }),
                  );

                  console.log(`? [PAIRING RESTART] WhatsApp conectado apï¿½s restart: ${phoneNum}`);
                  broadcastToUser(userId, { type: "connected", phoneNumber: phoneNum, connectionId: session.connectionId });
                }

                if (newConn === "close") {
                  // Recursivamente tratar close (esta mesma lï¿½gica)
                  const newStatusCode = (newLastDisconnect?.error as any)?.output?.statusCode;
                  console.log(`?? [PAIRING RESTART] Close apï¿½s restart - statusCode: ${newStatusCode}`);
                  // A lï¿½gica continuarï¿½ sendo tratada pelo handler principal
                }
              });

              console.log(`?? [PAIRING RESTART] Novo socket configurado, aguardando conexï¿½o...`);

            } catch (restartErr) {
              console.error(`?? [PAIRING RESTART] Erro na reconexï¿½o:`, restartErr);
              // Em caso de erro, tentarï¿½ novamente no prï¿½ximo ciclo (count aumenta)
            }
          }, 5000);

          return;
        }

        // -----------------------------------------------------------------------
        // ?? LIMPEZA FORTE NO CLOSE DURING PAIRING
        // -----------------------------------------------------------------------
        // Se a conexï¿½o fechar durante o pairing (antes de open), emitir evento
        // de falha para o frontend e limpar auth_pairing para nï¿½o "envenenar" o QR.
        // -----------------------------------------------------------------------
        console.log(`?? [PAIRING] Conexï¿½o fechada durante pairing - statusCode: ${statusCode}`);

        // pairingAuthPath jï¿½ estï¿½ definido no escopo da funï¿½ï¿½o

        if (statusCode === DisconnectReason.loggedOut) {
          // Logout durante pairing = auth invï¿½lido ou erro de formato
          console.log(`?? [PAIRING] Logout durante pairing - limpando auth_pairing e notificando falha`);

          try {
            await clearAuthFiles(pairingAuthPath);
            await ensureDirExists(pairingAuthPath);
          } catch (cleanupErr) {
            console.error(`?? [PAIRING] Erro ao limpar auth_pairing:`, cleanupErr);
          }

          // Cancelar timeout
          const pairingRecord = pairingSessions.get(pairingRequestKey);
          if (pairingRecord?.timeoutId) {
            clearTimeout(pairingRecord.timeoutId);
          }
          pairingSessions.delete(pairingRequestKey);
          pairingRetries.delete(pairingRequestKey);

          // Atualizar DB
          try {
            await storage.updateConnection(
              session.connectionId,
              buildBaileysConnectionStatePatch(false, { qrCode: null }),
            );
          } catch (dbErr) {
            console.error(`?? [PAIRING] Erro ao atualizar DB:`, dbErr);
          }

          // Notificar falha especï¿½fica
          broadcastToUser(userId, {
            type: "disconnected",
            reason: "pairing_failed"
          });
        } else if (statusCode !== undefined) {
          // Outro erro de conexï¿½o (nï¿½o loggedOut, nï¿½o restartRequired)
          console.log(`?? [PAIRING] Desconectado temporariamente (statusCode: ${statusCode}), aguardando...`);
          // Nï¿½o limpamos auth aqui pois pode ser reconexï¿½o temporï¿½ria
        } else {
          // Close sem statusCode ( WebSocket fechado, timeout, etc)
          console.log(`?? [PAIRING] Conexï¿½o fechada sem statusCode - limpando auth_pairing`);
          try {
            await clearAuthFiles(pairingAuthPath);
            await ensureDirExists(pairingAuthPath);
          } catch (cleanupErr) {
            console.error(`?? [PAIRING] Erro ao limpar auth_pairing:`, cleanupErr);
          }

          // Cancelar timeout
          const pairingRecord = pairingSessions.get(pairingRequestKey);
          if (pairingRecord?.timeoutId) {
            clearTimeout(pairingRecord.timeoutId);
          }
          pairingSessions.delete(pairingRequestKey);
          pairingRetries.delete(pairingRequestKey);

          broadcastToUser(userId, {
            type: "disconnected",
            reason: "pairing_failed"
          });
        }
      }
      } catch (pairingConnectionUpdateError) {
        console.error(
          `?? [PAIRING] Handler principal de connection.update falhou para ${session.connectionId.substring(0, 8)}..., mantendo runtime ativo:`,
          pairingConnectionUpdateError,
        );
      }
    });

    // Handler de mensagens
    sock.ev.on("messages.upsert", async (m) => {
      const source = m.type;
      const requestId = (m as any).requestId;

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
        const hasMeaningfulContent = isMeaningfulIncomingContent(message.message as any);
        const isCTWAResolved = !!requestId && !!message.message;
        const isRecoverableAppendMessage = isRecoverableRealtimeAppendMessage({
          source,
          remoteJid,
          messageId: message.key.id,
          hasMeaningfulContent,
          hasValidTimestamp: hasValidTs,
          ageMs,
        });
        const isRecoverablePlaceholder = isRecoverableRealtimePlaceholder({
          source,
          remoteJid,
          fromMe: message.key.fromMe,
          messageId: message.key.id,
          hasMeaningfulContent,
        });
        const shouldProcess = shouldProcessRealtimeWhatsappEvent({
          source,
          isAppendRecent,
          isRecoverableAppendMessage,
          isCTWAResolved,
          isRecoverablePlaceholder,
        });
        if (isRecoverablePlaceholder && !isAppendRecent && !isCTWAResolved) {
          console.log(`[PAIRING CTWA-LEAD-GUARD] Processing old append placeholder to create a recoverable stub: ${message.key.id} from ${remoteJid} (source=${source})`);
        }
        if (isRecoverableAppendMessage && !isAppendRecent && !isCTWAResolved) {
          console.log(`[PAIRING APPEND-RECOVERY] Processing recovered append message ${message.key.id} from ${remoteJid} (ageMs=${ageMs})`);
        }

        if (message.key.id && message.message) {
          cacheMessage(userId, message.key.id, message.message);
        }

        if (!shouldProcess) continue;

        if (!message.key.fromMe && remoteJid) {
          if (!remoteJid.includes("@broadcast")) {
            try {
              const msg = unwrapIncomingMessageContent(message.message as any);
              let textContent: string | null = null;
              let msgType = "text";

              if (!message.message) {
                msgType = "stub";
                const stubType = (message as any).messageStubType;
                if (stubType != null) {
                  console.log(`[PAIRING RECOVERY] Mensagem pendente sem payload (stubType=${stubType}) id=${message.key.id || "sem-id"}`);
                }
                textContent = UNRESOLVED_INCOMING_STUB_TEXT;
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
            if (shouldProcess) {
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
    console.log(`?? [PAIRING] Nï¿½mero formatado para pareamento: ${cleanNumber}`);

    // -----------------------------------------------------------------------
    // ?? FIX: Aguardar QR Event antes de solicitar pairing code (RECOMENDAï¿½ï¿½O BAILEYS)
    // -----------------------------------------------------------------------
    // O Baileys requer explicitamente: "WAIT TILL QR EVENT BEFORE REQUESTING
    // THE PAIRING CODE". Se chamarmos requestPairingCode antes do socket estar
    // pronto (evento QR recebido), o cï¿½digo pode atï¿½ ser gerado mas o pareamento
    // falha com "Nï¿½o foi possï¿½vel conectar o dispositivo" no celular.
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

          // Outro erro de conexï¿½o
          throw new Error(`Conexï¿½o fechada antes do QR event: ${qrEventResult.errorMessage || 'statusCode ' + qrEventResult.statusCode}`);
        }

        // Timeout ou outro erro
        throw new Error('Timeout aguardando QR event. Tente novamente.');
      }

      console.log(`?? [PAIRING] QR Event recebido, aguardando WebSocket abrir...`);
      // WebSocket geralmente jï¿½ estï¿½ aberto depois do QR event, mas vamos garantir
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
      // ?? RETENï¿½ï¿½O DE SESSï¿½O: Manter vivo por 3 minutos
      // -----------------------------------------------------------------------
      // Se o usuï¿½rio nï¿½o digitar o cï¿½digo, a sessï¿½o expira automaticamente
      // -----------------------------------------------------------------------
      const expiresAt = Date.now() + PAIRING_SESSION_TIMEOUT_MS;

      pairingSessions.set(pairingRequestKey, {
        startedAt: Date.now(),
        phone: cleanNumber,
        codeIssuedAt: Date.now(),
        expiresAt
      });

      console.log(`?? [PAIRING] Sessï¿½o registrada, expira em ${PAIRING_SESSION_TIMEOUT_MS / 1000} segundos`);

      // Configurar timeout de expiraï¿½ï¿½o
      pairingTimeoutId = setTimeout(async () => {
        console.log(`?? [PAIRING] Sessï¿½o expirou para ${userId.substring(0, 8)}... (usuï¿½rio nï¿½o digitou o cï¿½digo)`);

        // Limpar auth de pairing
        try {
          await clearAuthFiles(pairingAuthPath);
        } catch (e) {
          console.error(`?? [PAIRING] Erro ao limpar auth expirado:`, e);
        }

        // Remover da memï¿½ria
        pairingSessions.delete(pairingRequestKey);

        // Notificar frontend (se ainda estiver conectado)
        broadcastToUser(userId, {
          type: "disconnected",
          reason: "pairing_expired"
        });
      }, PAIRING_SESSION_TIMEOUT_MS);

      // Armazenar o timeoutId no pairingSession para poder cancelar se conectar
      const sessionRecord = pairingSessions.get(pairingRequestKey);
      if (sessionRecord) {
        sessionRecord.timeoutId = pairingTimeoutId;
      }

      // Aguardar um pouco para garantir que o c?digo foi processado
      await new Promise(resolve => setTimeout(resolve, 1000));

      return code ?? null;
    } catch (pairingError: any) {
      console.error(`? [PAIRING] Erro ao chamar requestPairingCode:`, pairingError);
      console.error(`? [PAIRING] Stack trace:`, (pairingError).stack);

      // Verificar se ï¿½ erro de rate limit
      const errorMsg = String(pairingError?.message || pairingError || '');
      if (errorMsg.includes('429') || errorMsg.includes('rate-overlimit') || errorMsg.includes('rate limit')) {
        console.error(`?? [PAIRING] RATE LIMIT DETECTED (429) ao solicitar cï¿½digo`);

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
    // Se houver erro durante o pairing, ï¿½ possï¿½vel que creds.json parcial tenha
    // sido criado. Se nï¿½o limparmos, a prï¿½xima tentativa de QR vai falhar com
    // loggedOut imediato porque o Baileys tenta usar esse auth parcial.
    // -----------------------------------------------------------------------

    // 1. Limpar sessï¿½o da memï¿½ria
    sessions.delete(cleanupSessionKey);
    unregisterWhatsAppSession(userId, cleanupSessionKey === userId ? undefined : cleanupSessionKey);

    // Cancelar timeout de expiraï¿½ï¿½o se existir
    const pairingSession = pairingSessions.get(pairingRequestKey);
    if (pairingSession?.timeoutId) {
      clearTimeout(pairingSession.timeoutId);
    }
    pairingSessions.delete(pairingRequestKey);

    // 2. Limpar arquivos de auth de pairing (Nï¿½O o auth principal!)
    try {
      await clearAuthFiles(pairingAuthPath);
      await ensureDirExists(pairingAuthPath); // Recriar pasta vazia
      console.log(`?? [PAIRING] Auth pairing limpo apï¿½s erro: ${pairingAuthPath}`);
    } catch (cleanupErr) {
      console.error(`?? [PAIRING] Erro ao limpar auth pairing:`, cleanupErr);
    }

    // 3. Atualizar banco para estado limpo
    try {
      const conn = targetConnectionId
        ? await storage.getConnectionById(targetConnectionId)
        : await storage.getConnectionByUserId(userId);
      if (conn) {
        await storage.updateConnection(
          conn.id,
          buildBaileysConnectionStatePatch(false, { qrCode: null }),
        );
      }
    } catch (dbErr) {
      console.error(`?? [PAIRING] Erro ao atualizar DB:`, dbErr);
    }

    // 4. Notificar frontend sobre falha especï¿½fica
    broadcastToUser(userId, {
      type: "disconnected",
      reason: "pairing_failed"
    });

    return null;
  } finally {
    // Remover da fila de pendentes
    pendingPairingRequests.delete(pairingRequestKey);
  }
  })();
  
  // Adicionar ? fila de pendentes
  pendingPairingRequests.set(pairingRequestKey, requestPromise);
  
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
  },
  options?: {
    source?: string;
    conversationId?: string;
    isFromAgent?: boolean;
  }
): Promise<boolean> {
  try {
    const allAdmins = await storage.getAllAdmins();
    const ownerAdmins = allAdmins.filter(a => a.role === 'owner');
    let adminUser = ownerAdmins.find((admin) => isAdminSocketOperational(adminSessions.get(admin.id)));

    if (!adminUser) {
      for (const candidate of ownerAdmins) {
        const connection = await storage.getAdminWhatsappConnection(candidate.id);
        if (connection?.isConnected) {
          adminUser = candidate;
          break;
        }
      }
    }

    if (!adminUser) {
      adminUser = ownerAdmins[0];
    }
    
    if (!adminUser) {
      console.error("[ADMIN MSG] Admin n?o encontrado");
      return false;
    }
    
    const adminSession = await getConnectedAdminSessionOrRecover(adminUser.id);
    
    if (!adminSession?.socket) {
      console.error(`[ADMIN MSG] Sess?o do admin n?o encontrada para owner ${adminUser.id}`);
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
    let sentMessage: any = null;
    
    if (media) {
      // Enviar m?dia com delay anti-bloqueio
      switch (media.type) {
        case "image":
          // ??? ANTI-BLOQUEIO
          sentMessage = await sendWithQueue(getAdminQueueId(adminUser.id), 'admin msg imagem', async () => {
            return await adminSession.socket!.sendMessage(jid, {
              image: media.buffer,
              caption: media.caption || text,
              mimetype: media.mimetype,
            });
          });
          break;
        case "audio":
          // ??? ANTI-BLOQUEIO
          sentMessage = await sendWithQueue(getAdminQueueId(adminUser.id), 'admin msg ?udio', async () => {
            return await adminSession.socket!.sendMessage(jid, {
              audio: media.buffer,
              mimetype: media.mimetype,
              ptt: true, // Enviar como ?udio de voz
            });
          });
          break;
        case "video":
          // ??? ANTI-BLOQUEIO
          sentMessage = await sendWithQueue(getAdminQueueId(adminUser.id), 'admin msg v?deo', async () => {
            return await adminSession.socket!.sendMessage(jid, {
              video: media.buffer,
              caption: media.caption || text,
              mimetype: media.mimetype,
            });
          });
          break;
        case "document":
          // ??? ANTI-BLOQUEIO
          sentMessage = await sendWithQueue(getAdminQueueId(adminUser.id), 'admin msg documento', async () => {
            return await adminSession.socket!.sendMessage(jid, {
              document: media.buffer,
              fileName: media.filename || "documento",
              mimetype: media.mimetype,
            });
          });
          break;
      }
    } else {
      // ??? ANTI-BLOQUEIO: Enviar apenas texto
      sentMessage = await sendWithQueue(getAdminQueueId(adminUser.id), 'admin msg texto', async () => {
        await simulateTyping(adminSession.socket!, jid, text.length);
        return await adminSession.socket!.sendMessage(jid, { text });
      });
    }

    trackAdminOutgoingMessage({
      messageId: sentMessage?.key?.id,
      adminId: adminUser.id,
      conversationId: options?.conversationId,
      contactNumber: cleanNumber,
      text,
      mediaType: media?.type,
      mediaMimeType: media?.mimetype,
      mediaCaption: media?.caption,
      isFromAgent: options?.isFromAgent ?? true,
      alreadyPersisted: false,
      source: options?.source || "admin_followup_text",
    });
    
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
    const sent = await sendAdminMessage(phoneNumber, text, undefined, {
      source: "admin_followup_text",
      isFromAgent: true,
    });
    if (!sent) {
      return { success: false, error: "Envio real pelo WhatsApp do admin falhou", message: text };
    }
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
    await sendAdminMessage(phoneNumber, text, undefined, {
      source: "admin_scheduled_contact",
      isFromAgent: true,
    });
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
        `[HEALTH CHECK] ? Skipped ï¿½ session restore still in progress (${Math.round(restoreAgeMs / 1000)}s/${Math.round(RESTORE_GUARD_MAX_BLOCK_MS / 1000)}s guard)`
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
    // 1. Verificar conexï¿½es de usuï¿½rios (Multi-connection: check ALL connections individually)
    const connections = (await storage.getAllConnections()).filter(
      (connection) => !isUserRemovedConnection(connection),
    );
    const connectionsByUserId = new Map<string, WhatsappConnection[]>();
    for (const connection of connections) {
      if (!connection.userId) continue;
      const userConnections = connectionsByUserId.get(connection.userId) || [];
      userConnections.push(connection);
      connectionsByUserId.set(connection.userId, userConnections);
    }
    let reconnectedUsers = 0;
    let healedUsers = 0;  // DB=false mas socket ativo (curado)
    let healthyUsers = 0;
    let disconnectedUsers = 0;
    
    for (const connection of connections) {
      if (!connection.userId) continue;
      if (!await isConnectionOwnedByCurrentProcess(connection)) {
        continue;
      }
      
      const isDbConnected = connection.isConnected;
      // Check session by connectionId (each connection has its own socket)
      const session = sessions.get(connection.id);
      const hasActiveSocket = hasOperationalSocket(session);
      const siblingConnections = connectionsByUserId.get(connection.userId) || [connection];
      const resolvedAuth = await resolveConnectionAuthScope(connection.userId, connection, connection.id);
      const recoveryDecision = canConnectionAutoRecoverUsingResolvedAuthScope(
        connection.userId,
        connection,
        siblingConnections,
        resolvedAuth,
      );

      if (isManualDisconnectAutoReconnectBlocked(connection)) {
        if (hasActiveSocket) {
          try {
            session?.socket?.end(undefined);
          } catch (error) {
            console.log(`[HEALTH CHECK] Error closing manually disconnected socket for ${connection.id}:`, error);
          }
          sessions.delete(connection.id);
          unregisterWhatsAppSession(connection.userId, connection.id);
        }
        clearPendingConnectionLock(connection.id, "manual_disconnect_blocked");
        clearPendingConnectionLock(connection.userId, "manual_disconnect_blocked");
        reconnectAttempts.delete(connection.id);
        console.log(
          `[HEALTH CHECK] Connection ${connection.id.substring(0, 8)} is manually disconnected; auto-reconnect paused until user reconnects`,
        );
        disconnectedUsers++;
        continue;
      }
      
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

        hasAuthFiles = resolvedAuth.hasCreds;
        if (hasAuthFiles && !recoveryDecision.allowed) {
          console.log(
            `[HEALTH CHECK] Shared auth scope de ${connection.id.substring(0, 8)}... jÃ¡ pertence a ${recoveryDecision.claimantId?.substring(0, 8) || "outra conexÃ£o"} - marcando como desconectada sem reconectar`,
          );
          await storage.updateConnection(
            connection.id,
            buildBaileysConnectionStatePatch(false, { qrCode: null }),
          );
          disconnectedUsers++;
          continue;
        }
        
        if (hasAuthFiles) {
          console.log(`[HEALTH CHECK] Tentando reconectar connection ${connection.id}...`);
          await storage.updateConnection(
            connection.id,
            buildBaileysConnectionStatePatch(false, { qrCode: null }),
          );
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
              console.log(`?? [HEALTH CHECK] HEALTH_RECONNECT_NOT_OPEN: Connection ${connection.id} ï¿½ connectWhatsApp() retornou mas isOpen ainda false apï¿½s 8s`);
              // Don't count as reconnected ï¿½ will retry on next health check
            }
          } catch (error: any) {
            if (error?.code === "WA_OPEN_TIMEOUT_COOLDOWN") {
              console.log(`[HEALTH CHECK] Cooldown ativo para connection ${connection.id} - tentativa adiada`);
            } else if (error?.code === "WA_PAIRING_REQUIRED_COOLDOWN") {
              console.log(`[HEALTH CHECK] Connection ${connection.id} aguardando leitura do QR - tentativa automática pausada`);
            } else {
              console.error(`[HEALTH CHECK] Falha ao reconectar connection ${connection.id}:`, error);
            }
            // SAFE: Do NOT mark is_connected=false. Will retry on next health check (5 min).
            console.log(`[HEALTH CHECK] Serï¿½ tentado novamente no prï¿½ximo health check.`);
          }
        } else {
          console.log(`?? [HEALTH CHECK] ${connection.userId} sem arquivos de auth - marcando como desconectado`);
          await storage.updateConnection(
            connection.id,
            buildBaileysConnectionStatePatch(false, { qrCode: null }),
          );
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
          const STUCK_THRESHOLD_MS = 300_000; // 5 minutes ï¿½ give Baileys time to negotiate
          if (stuckDurationMs > STUCK_THRESHOLD_MS) {
            // Connection has been stuck for 5+ min without reaching "open".
            // End socket so zombie handler can reconnect on next health check cycle.
            console.log(`?? [HEALTH CHECK] STUCK CONNECTION: user ${connection.userId.substring(0, 8)} conn ${connection.id.substring(0, 8)} ï¿½ isOpen=false for ${Math.round(stuckDurationMs / 1000)}s. Cleaning socket (zombie handler will reconnect).`);
            try {
              if (session.openTimeout) { clearTimeout(session.openTimeout); session.openTimeout = undefined; }
              session.socket?.ev?.removeAllListeners('connection.update');
              session.socket?.ev?.removeAllListeners('creds.update');
              session.socket?.end(new Error('Health check: stuck connection'));
            } catch(e) { /* ignore */ }
            sessions.delete(connection.id);
            clearPendingConnectionLock(connection.id, 'health_stuck_cleanup');
            clearPendingConnectionLock(connection.userId, 'health_stuck_cleanup');
            await storage.updateConnection(
              connection.id,
              buildBaileysConnectionStatePatch(false, { qrCode: null }),
            );
            disconnectedUsers++;
            // Don't count as disconnected ï¿½ DB stays is_connected=true
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
        // 2. O lï¿½der reconectou mas nï¿½o atualizou o DB ainda
        // 3. Deploy/reconnect causou discrepï¿½ncia temporï¿½ria
        //
        // Como estamos no lï¿½der (health check sï¿½ roda no lï¿½der),
        // podemos curar o estado global.
        // -----------------------------------------------------------------------
        console.log(`?? [HEALTH CHECK] CURANDO user ${connection.userId.substring(0, 8)}...: DB=false mas socket ATIVO`);

        try {
          if (session && session.isOpen === false && promoteSessionOpenState(session, 'health_check_db_false_socket_ready')) {
            clearPendingConnectionLock(connection.id, 'health_promote_open');
            clearPendingConnectionLock(connection.userId, 'health_promote_open');
            console.log(`? [HEALTH CHECK] Promoted isOpen=true for ${connection.id.substring(0, 8)} no branch de cura`);
          }

          const phoneNumber = session.socket.user.id.split(':')[0];
          await storage.updateConnection(
            connection.id,
            buildBaileysConnectionStatePatch(true, {
              phoneNumber,
              qrCode: null,
            }),
          );
          broadcastToUser(connection.userId, { type: "connected", phoneNumber, connectionId: connection.id });
          console.log(`? [HEALTH CHECK] User ${connection.userId.substring(0, 8)}... curado - DB atualizado para connected`);
          healedUsers++;
        } catch (healErr) {
          console.error(`? [HEALTH CHECK] Erro ao curar user ${connection.userId.substring(0, 8)}...:`, healErr);
        }
      } else if (!isDbConnected && !hasActiveSocket) {
        // -----------------------------------------------------------------------
        // ?? 4th branch: DB=false, no socket, but auth files exist on disk
        // Common after graceful deploy/restart when auth is valid but restore
        // did not rehydrate this connection in the initial pass.
        // -----------------------------------------------------------------------
        let hasAuthFiles = false;

        try {
          const userAuthPath = path.join(SESSIONS_BASE, `auth_${connection.userId}`);
          const authFiles = await fs.readdir(userAuthPath);
          hasAuthFiles = authFiles.some((file) => file === 'creds.json');
        } catch (e) {
          // Directory doesn't exist
        }

        if (!hasAuthFiles && connection.id !== connection.userId) {
          try {
            const connAuthPath = path.join(SESSIONS_BASE, `auth_${connection.id}`);
            const connAuthFiles = await fs.readdir(connAuthPath);
            hasAuthFiles = connAuthFiles.some((file) => file === 'creds.json');
          } catch (e) {
            // Directory doesn't exist
          }
        }

        hasAuthFiles = resolvedAuth.hasCreds;
        if (hasAuthFiles && !recoveryDecision.allowed) {
          console.log(
            `[HEALTH CHECK] Skip auto-recovery para conn ${connection.id.substring(0, 8)}... - auth compartilhado jÃ¡ reclamado por ${recoveryDecision.claimantId?.substring(0, 8) || "outra conexÃ£o"}`,
          );
          continue;
        }

        if (hasAuthFiles) {
          console.log(`?? [HEALTH CHECK] User ${connection.userId.substring(0, 8)}... DB=false sem socket, mas auth existe. Tentando reconectar ${connection.id.substring(0, 8)}...`);
          try {
            await connectWhatsApp(connection.userId, connection.id, { source: "health_check" });
            reconnectedUsers++;
            console.log(`? [HEALTH CHECK] User ${connection.userId.substring(0, 8)}... reconectado a partir de auth files!`);
          } catch (error: any) {
            if (error?.code === "WA_OPEN_TIMEOUT_COOLDOWN") {
              console.log(`[HEALTH CHECK] Cooldown ativo para connection ${connection.id} - tentativa adiada`);
            } else if (error?.code === "WA_PAIRING_REQUIRED_COOLDOWN") {
              console.log(`[HEALTH CHECK] Connection ${connection.id} aguardando leitura do QR - tentativa automática pausada`);
            } else {
              console.error(`? [HEALTH CHECK] Falha ao reconectar user ${connection.userId.substring(0, 8)}... (DB=false + auth):`, error);
            }
          }
        }
      }
    }

    // 2. Verificar conexï¿½es de admin
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
        
        const hasAuthFiles = await hasAdminPersistedAuth(admin.id);

        if (hasAuthFiles) {
          console.log(`?? [HEALTH CHECK] Tentando reconectar admin ${admin.id}...`);
          try {
            await connectAdminWhatsApp(admin.id);
            reconnectedAdmins++;
            console.log(`? [HEALTH CHECK] Admin ${admin.id} reconectado!`);
          } catch (error) {
            console.error(`? [HEALTH CHECK] Falha ao reconectar admin ${admin.id}:`, error);
            console.log(`[HEALTH CHECK] Admin ${admin.id} manteve auth persistido; nova tentativa ocorrerÃ¡ no prÃ³ximo ciclo.`);
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
        const hasAuthFiles4 = await hasAdminPersistedAuth(admin.id);
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
    console.log(`   ?? Usuï¿½rios: ${healthyUsers} saudï¿½veis, ${healedUsers} curados, ${reconnectedUsers} reconectados, ${disconnectedUsers} desconectados`);
    console.log(`   ?? Admins: ${healthyAdmins} saudï¿½veis, ${healedAdmins} curados, ${reconnectedAdmins} reconectados`);
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
  console.log(`   ?? Primeira execuï¿½ï¿½o em: ${Math.round(HEALTH_CHECK_INITIAL_DELAY_MS / 1000)}s`);
  
  // Executar primeiro check cedo; restore guard impede reconexï¿½es agressivas.
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

// Exportar funï¿½ï¿½o para check manual (ï¿½til para debug)
export { connectionHealthCheck };

// ==================== RESTORE PENDING AI TIMERS ====================
// ?? Restaura timers de resposta da IA que estavam pendentes antes do restart
// Isso garante que mensagens nï¿½o sejam perdidas em deploys/crashes
export async function restorePendingAITimers(): Promise<void> {
  // ?? MODO DEV: Pular restauraï¿½ï¿½o de timers se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`?? [RESTORE TIMERS] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`?? [RESTORE TIMERS] Iniciando restauraï¿½ï¿½o de timers pendentes...`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // Buscar todos os timers pendentes do banco
    const rawPendingTimers = await storage.getPendingAIResponsesForRestore();
    const pendingTimers = [];
    for (const timer of rawPendingTimers) {
      const ownedConnection = timer.connectionId
        ? await storage.getConnectionById(timer.connectionId)
        : await storage.getConnectionByUserId(timer.userId);
      if (ownedConnection && !await isConnectionOwnedByCurrentProcess(ownedConnection)) {
        continue;
      }
      pendingTimers.push(timer);
    }
    
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
      
      // Verificar se jï¿½ tem timer em memï¿½ria
      if (pendingResponses.has(conversationId)) {
        console.log(`?? [RESTORE TIMERS] ${contactNumber} - Jï¿½ tem timer em memï¿½ria, pulando`);
        skipped++;
        continue;
      }
      
      // Verificar se jï¿½ estï¿½ sendo processada
      if (conversationsBeingProcessed.has(conversationId)) {
        console.log(`?? [RESTORE TIMERS] ${contactNumber} - Em processamento, pulando`);
        skipped++;
        continue;
      }
      
      // Calcular tempo restante atï¿½ execuï¿½ï¿½o
      const now = Date.now();
      const executeTime = executeAt.getTime();
      const remainingMs = executeTime - now;
      
      // Se o tempo jï¿½ passou, processar imediatamente (com pequeno delay)
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
          retryCount: timer.retryCount,
        };
        
        // Processar com delay escalonado para nï¿½o sobrecarregar
        const delayMs = processed * 3000; // 3s entre cada
        pending.timeout = schedulePendingResponseProcessing(
          pending,
          delayMs + 1000,
          `restore_expired_timer:${contactNumber}`,
        ); // Mï¿½nimo 1s
        
        pendingResponses.set(conversationId, pending);
        processed++;
        restored++;
        
      } else {
        // Timer ainda nï¿½o expirou, re-agendar normalmente
        console.log(`? [RESTORE TIMERS] ${contactNumber} - Reagendando em ${Math.round(remainingMs/1000)}s`);
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages,
          conversationId,
          userId,
          connectionId: timer.connectionId,
          contactNumber,
          jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: timer.scheduledAt instanceof Date
            ? timer.scheduledAt.getTime()
            : new Date(timer.scheduledAt as any).getTime() || (executeTime - Math.max(remainingMs, 0)),
          retryCount: timer.retryCount,
        };
        
        pending.timeout = schedulePendingResponseProcessing(
          pending,
          remainingMs,
          `restore_timer:${contactNumber}`,
        );
        
        pendingResponses.set(conversationId, pending);
        restored++;
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`? [RESTORE TIMERS] Restauraï¿½ï¿½o concluï¿½da!`);
    console.log(`   ?? Total encontrados: ${pendingTimers.length}`);
    console.log(`   ? Restaurados: ${restored}`);
    console.log(`   ?? Pulados: ${skipped}`);
    console.log(`   ?? Processados imediatamente: ${processed}`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`? [RESTORE TIMERS] Erro na restauraï¿½ï¿½o:`, error);
  }
}

// ==================== CRON JOB: RETRY TIMERS PENDENTES ====================
// Verifica a cada 15 segundos se hï¿½ timers pendentes "ï¿½rfï¿½os" e os processa
// Isso garante que nenhuma mensagem fique sem resposta, mesmo apï¿½s instabilidades
let pendingTimersCronInterval: NodeJS.Timeout | null = null;
let pendingIncomingRecoveryCronInterval: NodeJS.Timeout | null = null;

type PendingIncomingRecoveryScope = {
  user_id: string;
  connection_id: string;
  oldest_received_at: Date | string | null;
  pending_count: number | string;
};

async function listPendingIncomingRecoveryScopes(): Promise<PendingIncomingRecoveryScope[]> {
  const result = await db.execute(sql`
    WITH oldest_pending AS (
      SELECT
        user_id,
        connection_id,
        received_at
      FROM pending_incoming_messages
      WHERE status = 'pending'
        AND COALESCE(process_attempts, 0) < 3
        AND received_at <= ((now() AT TIME ZONE 'UTC') - (${PENDING_INCOMING_RECOVERY_MIN_AGE_SECONDS} * INTERVAL '1 second'))
        AND user_id IS NOT NULL
        AND connection_id IS NOT NULL
      ORDER BY received_at ASC
      LIMIT ${PENDING_INCOMING_RECOVERY_SCAN_LIMIT}
    )
    SELECT
      user_id,
      connection_id,
      MIN(received_at) AS oldest_received_at,
      COUNT(*)::int AS pending_count
    FROM oldest_pending
    GROUP BY user_id, connection_id
    ORDER BY MIN(received_at) ASC
    LIMIT ${PENDING_INCOMING_RECOVERY_MAX_SCOPES_PER_CYCLE}
  `);

  return ((result as any)?.rows || []) as PendingIncomingRecoveryScope[];
}

async function processPendingIncomingRecoveryCron(): Promise<void> {
  let distributedCronLock: DistributedLockHandle | null = null;

  if (isRedisAvailable()) {
    const cronLockResult = await tryAcquireDistributedLock(
      WA_REDIS_PENDING_INCOMING_RECOVERY_LOCK_KEY,
      WA_REDIS_PENDING_CRON_LOCK_TTL_MS,
    );
    if (cronLockResult.status === "acquired") {
      distributedCronLock = cronLockResult.lock;
    } else if (cronLockResult.status === "busy") {
      return;
    }
  }

  try {
    if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
      return;
    }

    if (sessions.size === 0) {
      console.log(`[PENDING INCOMING RECOVERY] Aguardando sessoes conectarem`);
      return;
    }

    const scopes = await listPendingIncomingRecoveryScopes();
    if (scopes.length === 0) {
      return;
    }

    let triggered = 0;
    let skipped = 0;

    for (const scope of scopes) {
      const connectionId = String(scope.connection_id || "");
      const userId = String(scope.user_id || "");
      if (!connectionId || !userId) {
        skipped++;
        continue;
      }

      const session = sessions.get(connectionId);
      if (!session?.socket || session.isOpen !== true || session.userId !== userId) {
        skipped++;
        continue;
      }

      const connection = await storage.getConnectionById(connectionId);
      if (!connection?.isConnected) {
        skipped++;
        continue;
      }

      if (!await isConnectionOwnedByCurrentProcess(connection)) {
        skipped++;
        continue;
      }

      await startMessageRecovery(userId, connectionId);
      triggered++;
    }

    if (triggered > 0 || skipped > 0) {
      console.log(
        `[PENDING INCOMING RECOVERY] Ciclo: scopes=${scopes.length}, disparados=${triggered}, pulados=${skipped}`,
      );
    }
  } catch (error) {
    console.error("[PENDING INCOMING RECOVERY] Erro no cron:", error);
  } finally {
    if (distributedCronLock) {
      await releaseDistributedLock(distributedCronLock).catch(() => undefined);
    }
  }
}

export function startPendingIncomingRecoveryCron(): void {
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`[PENDING INCOMING RECOVERY] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }

  if (pendingIncomingRecoveryCronInterval) {
    console.log(`[PENDING INCOMING RECOVERY] Cron ja esta rodando`);
    return;
  }

  console.log(
    `[PENDING INCOMING RECOVERY] Iniciando cron (intervalo: ${Math.round(PENDING_INCOMING_RECOVERY_CRON_INTERVAL_MS / 1000)}s, limite ${PENDING_INCOMING_RECOVERY_MAX_SCOPES_PER_CYCLE}/ciclo)`,
  );

  pendingIncomingRecoveryCronInterval = setInterval(async () => {
    await processPendingIncomingRecoveryCron();
  }, PENDING_INCOMING_RECOVERY_CRON_INTERVAL_MS);

  setTimeout(async () => {
    await processPendingIncomingRecoveryCron();
  }, PENDING_INCOMING_RECOVERY_INITIAL_DELAY_MS);
}

export function stopPendingIncomingRecoveryCron(): void {
  if (!pendingIncomingRecoveryCronInterval) {
    return;
  }

  clearInterval(pendingIncomingRecoveryCronInterval);
  pendingIncomingRecoveryCronInterval = null;
  console.log(`[PENDING INCOMING RECOVERY] Cron parado`);
}

export function startPendingTimersCron(): void {
  // ?? MODO DEV: Pular cron de timers pendentes se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`?? [PENDING CRON] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  if (pendingTimersCronInterval) {
    console.log(`?? [PENDING CRON] Cron jï¿½ estï¿½ rodando`);
    return;
  }
  
  console.log(
    `?? [PENDING CRON] Iniciando cron de retry de timers pendentes (intervalo: ${Math.round(PENDING_TIMERS_CRON_INTERVAL_MS / 1000)}s, ${PENDING_TIMERS_MAX_PER_CYCLE}/ciclo)`,
  );
  
  // Executar a cada 15 segundos para maior responsividade
  pendingTimersCronInterval = setInterval(async () => {
    await processPendingTimersCron();
  }, PENDING_TIMERS_CRON_INTERVAL_MS);
  
  // Primeira execuï¿½ï¿½o apï¿½s 10 segundos (dar tempo para sessï¿½es conectarem)
  setTimeout(async () => {
    await processPendingTimersCron();
  }, PENDING_TIMERS_CRON_INITIAL_DELAY_MS);
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
    // ?? FIX 2026-02-25: READINESS GATE ï¿½ don't process timers if no sessions are connected yet
    // This prevents timers from exhausting retries during boot before WhatsApp reconnects
    if (sessions.size === 0) {
      console.log(`?? [PENDING CRON] Aguardando sessï¿½es conectarem (readiness gate)...`);
      return;
    }
    
    // Buscar timers pendentes (sem filtro de 2h - LIMIT 200 no query)
    const rawPendingTimers = await storage.getPendingAIResponsesForRestore();
    const pendingTimers = [];
    for (const timer of rawPendingTimers) {
      const ownedConnection = timer.connectionId
        ? await storage.getConnectionById(timer.connectionId)
        : await storage.getConnectionByUserId(timer.userId);
      if (ownedConnection && !await isConnectionOwnedByCurrentProcess(ownedConnection)) {
        continue;
      }
      pendingTimers.push(timer);
    }
    
    if (pendingTimers.length === 0) {
      return; // Nada para processar
    }
    
    // -----------------------------------------------------------------------
    // FIX 2026-02-24: STALE TIMER POLICY
    // Timers >24h sï¿½o marcados como failed (o cliente jï¿½ desistiu)
    // Timers =24h sï¿½o processados normalmente
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
    
    // Filtrar apenas os que jï¿½ expiraram e nï¿½o estï¿½o em memï¿½ria (excluir os >24h jï¿½ marcados)
    const expiredTimers = pendingTimers.filter(timer => {
      const timeSinceExecute = Date.now() - timer.executeAt.getTime();
      const isExpired = timeSinceExecute > 0;
      const isStale24h = timeSinceExecute > STALE_24H_MS;
      let isInMemory = pendingResponses.has(timer.conversationId);
      let isBeingProcessed = conversationsBeingProcessed.has(timer.conversationId);
      
      // ?? SECTION 4: TTL check ï¿½ release stale processing locks
      if (isBeingProcessed) {
        const processingStartedAt = conversationsBeingProcessed.get(timer.conversationId)!;
        const processingAge = Date.now() - processingStartedAt;
        if (processingAge > PROCESSING_TTL_MS) {
          console.log(`?? [PENDING CRON] PROCESSING_STALE_RELEASED: ${timer.contactNumber} (conv ${timer.conversationId.substring(0, 8)}) ï¿½ preso hï¿½ ${Math.round(processingAge / 1000)}s, liberando lock`);
          conversationsBeingProcessed.delete(timer.conversationId);
          isBeingProcessed = false;
        }
      }

      if (isExpired && !isStale24h && isInMemory) {
        const released = releaseStalePendingResponseInMemory({
          conversationId: timer.conversationId,
          contactNumber: timer.contactNumber,
          executeAtMs: timer.executeAt.getTime(),
          reason: "expired_pending_cron_filter",
        });
        if (released) {
          isInMemory = false;
        }
      }
      
      // ?? DEBUG: Logar por que alguns timers sï¿½o filtrados
      if (isExpired && !isStale24h && (isInMemory || isBeingProcessed)) {
        console.log(`?? [PENDING CRON] ${timer.contactNumber} - Filtrado: inMemory=${isInMemory}, beingProcessed=${isBeingProcessed}`);
      }
      
      return isExpired && !isStale24h && !isInMemory && !isBeingProcessed;
    });
    
    if (expiredTimers.length === 0) {
      if (pendingTimers.length > staleTimers.length) {
        console.log(`?? [PENDING CRON] Ciclo: ${pendingTimers.length} timers (${staleTimers.length} stale removidos), restantes filtrados (em memï¿½ria/processando/futuros)`);
      }
      return;
    }
    
    console.log(`\n?? [PENDING CRON] =========================================`);
    console.log(`?? [PENDING CRON] Encontrados ${expiredTimers.length} timers ï¿½rfï¿½os para processar`);
    console.log(`?? [PENDING CRON] Sessï¿½es ativas: ${sessions.size} | Stale removidos: ${staleTimers.length}`);
    
    let processed = 0;
    let skipped = 0;
    const reconnectAttemptedScopes = new Set<string>(); // Guard: 1 reconnect per connection scope per cron cycle
    
    for (const timer of expiredTimers) {
      const { conversationId, userId, contactNumber, jidSuffix, messages } = timer;
      
      // ?? SECTION 5: Resolver sessï¿½o por connectionId do timer PRIMEIRO,
      // fallback para lookup da conversa e por ï¿½ltimo userId.
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
          // Non-critical ï¿½ fallback to userId
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
          console.log(`?? [PENDING CRON] ${contactNumber} - Mï¿½ltiplas sessï¿½es prontas para user ${userId.substring(0,8)} sem connectionId. Pulando para evitar envio no nï¿½mero errado.`);
        } else if (userSessions.length === 1) {
          session = userSessions[0];
          resolvedConnectionId = session.connectionId;
          promoteSessionOpenState(session, 'pending_cron_user_fallback_single_session');
        } else if (userSessions.length > 1) {
          console.log(`?? [PENDING CRON] ${contactNumber} - Mï¿½ltiplas sessï¿½es para user ${userId.substring(0,8)} sem connectionId. Pulando por ambiguidade.`);
        }
      }
      
      if (!isSessionReadyForMessaging(session)) {
        // -----------------------------------------------------------------------
        // FIX 2026-02-24: Quando sessï¿½o indisponï¿½vel mas DB diz conectado,
        // tentar reconectar ao invï¿½s de simplesmente pular.
        // Guard: Sï¿½ tenta reconectar 1x por usuï¿½rio por ciclo do CRON.
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
              console.log(`?? [PENDING CRON] ${contactNumber} - Nï¿½o foi possï¿½vel determinar conexï¿½o ï¿½nica para reconnect (user ${userId.substring(0,8)}).`);
            }
          }
          const connId = connState?.id || resolvedConnectionId;
          if (connState?.isConnected && connId) {
            const existingSession = sessions.get(connId);
            if (!isSessionReadyForMessaging(existingSession)) {
              console.log(`?? [PENDING CRON] ${contactNumber} - Sessï¿½o indisponï¿½vel (conn: ${connId.substring(0,8)}, userId: ${userId.substring(0,8)}) mas DB=connected. Tentando reconectar...`);
              reconnectAttemptedScopes.add(reconnectScopeKey);
              try {
                await connectWhatsApp(userId, connId, { source: "pending_cron" });
              } catch (reconErr: any) {
                if (reconErr?.code === "WA_OPEN_TIMEOUT_COOLDOWN") {
                  console.log(`?? [PENDING CRON] ${contactNumber} - Cooldown ativo apï¿½s open_timeout, aguardando prï¿½ximo ciclo`);
                } else {
                  console.log(`?? [PENDING CRON] ${contactNumber} - Reconexï¿½o falhou, pulando`);
                }
              }
            } else {
              if (existingSession) {
                promoteSessionOpenState(existingSession, 'pending_cron_existing_ready');
              }
              console.log(`?? [PENDING CRON] ${contactNumber} - Socket jï¿½ estï¿½ operacional (isOpen=${existingSession?.isOpen}), aguardando prï¿½ximo ciclo`);
            }
          } else {
            console.log(`?? [PENDING CRON] ${contactNumber} - Sessï¿½o indisponï¿½vel (DB: connected=${connState?.isConnected || false})`);
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
      
      console.log(`?? [PENDING CRON] Processando ${contactNumber} (timer ï¿½rfï¿½o hï¿½ ${Math.round(timeSinceExecute/1000)}s)`);
      
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
        retryCount: timer.retryCount,
      };
      
      // Processar com delay escalonado (1.5s entre cada para evitar ban)
      const delayMs = processed * 1500;
      pending.timeout = schedulePendingResponseProcessing(
        pending,
        delayMs,
        `pending_cron:${contactNumber}`,
      );
      pendingResponses.set(conversationId, pending);

      processed++;
      waObservability.pendingAI_cronProcessed++;
      
      if (processed >= PENDING_TIMERS_MAX_PER_CYCLE) {
        console.log(`?? [PENDING CRON] Limite de ${PENDING_TIMERS_MAX_PER_CYCLE} por ciclo atingido, continuara no proximo ciclo`);
        break;
      }
    }
    
    console.log(`?? [PENDING CRON] Ciclo concluï¿½do: ${processed} processados, ${skipped} pulados`);
    console.log(`?? [PENDING CRON] =========================================\n`);
    
  } catch (error) {
    console.error(`? [PENDING CRON] Erro no cron:`, error);
  } finally {
    if (distributedCronLock) {
      await releaseDistributedLock(distributedCronLock);
    }
  }
}

export async function runPendingTimersCronCycle(): Promise<void> {
  await processPendingTimersCron();
}

export function stopPendingTimersCron(): void {
  if (pendingTimersCronInterval) {
    clearInterval(pendingTimersCronInterval);
    pendingTimersCronInterval = null;
    console.log(`?? [PENDING CRON] Cron parado`);
  }
}

// ==================== CRON JOB: AUTO-RECUPERAï¿½ï¿½O DE RESPOSTAS FALHADAS ====================
// Verifica a cada 5 minutos se hï¿½ timers "completed" que na verdade nï¿½o receberam resposta
// Isso ï¿½ um "safety net" para garantir que nenhum cliente fique sem resposta
let autoRecoveryCronInterval: NodeJS.Timeout | null = null;

export function startAutoRecoveryCron(): void {
  // ?? MODO DEV: Pular cron de auto-recovery se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`?? [AUTO-RECOVERY] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  if (autoRecoveryCronInterval) {
    console.log(`?? [AUTO-RECOVERY] Cron jï¿½ estï¿½ rodando`);
    return;
  }
  
  console.log(
    `?? [AUTO-RECOVERY] Iniciando cron de auto-recuperacao (intervalo: ${Math.round(AUTO_RECOVERY_CRON_INTERVAL_MS / 60000)}min, limite ${AUTO_RECOVERY_MAX_PER_CYCLE}/ciclo)`,
  );
  
  autoRecoveryCronInterval = setInterval(async () => {
    await processAutoRecovery();
  }, AUTO_RECOVERY_CRON_INTERVAL_MS);
  
  setTimeout(async () => {
    await processAutoRecovery();
  }, AUTO_RECOVERY_INITIAL_DELAY_MS);
}

async function processAutoRecovery(): Promise<void> {
  try {
    // Buscar timers "completed" que nï¿½o tï¿½m resposta real
    const rawFailedTimers = await storage.getCompletedTimersWithoutResponse();
    
    // ?? FIX 2026-02-25: Also recover "failed" timers with transient reasons
    const rawTransientFailed = await storage.getFailedTransientTimers();
    const failedTimers = [];
    for (const timer of rawFailedTimers) {
      const conversation = await storage.getConversation(timer.conversationId);
      const ownedConnection = conversation?.connectionId
        ? await storage.getConnectionById(conversation.connectionId)
        : await storage.getConnectionByUserId(timer.userId);
      if (ownedConnection && !await isConnectionOwnedByCurrentProcess(ownedConnection)) {
        continue;
      }
      failedTimers.push(timer);
    }
    const transientFailed = [];
    for (const timer of rawTransientFailed) {
      const conversation = await storage.getConversation(timer.conversationId);
      const ownedConnection = conversation?.connectionId
        ? await storage.getConnectionById(conversation.connectionId)
        : await storage.getConnectionByUserId(timer.userId);
      if (ownedConnection && !await isConnectionOwnedByCurrentProcess(ownedConnection)) {
        continue;
      }
      transientFailed.push(timer);
    }
    
    if (failedTimers.length === 0 && transientFailed.length === 0) {
      return; // Nada para recuperar
    }
    
    console.log(`\n?? [AUTO-RECOVERY] =========================================`);
    console.log(`?? [AUTO-RECOVERY] Encontrados ${failedTimers.length} completed sem resposta + ${transientFailed.length} failed transitï¿½rios`);
    
    let recovered = 0;
    let skipped = 0;
    
    // Process completed-without-response timers first
    
    for (const timer of failedTimers) {
      const { conversationId, userId, contactNumber, jidSuffix, messages } = timer;
      
      // Verificar se jï¿½ estï¿½ em processamento
      if (conversationsBeingProcessed.has(conversationId)) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - Em processamento, pulando`);
        skipped++;
        continue;
      }
      
      // Verificar se jï¿½ tem timer em memï¿½ria
      if (pendingResponses.has(conversationId)) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - Jï¿½ tem timer ativo, pulando`);
        skipped++;
        continue;
      }
      
      // Resolver conexï¿½o da conversa para evitar enviar pelo nï¿½mero errado em multi-conexï¿½o
      const conversation = await storage.getConversation(conversationId);
      if (!conversation?.connectionId) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - Conversa sem connectionId, pulando`);
        skipped++;
        continue;
      }
      const scopedConnection = await storage.getConnectionById(conversation.connectionId);
      if (!scopedConnection || scopedConnection.userId !== userId) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - Escopo invï¿½lido da conversa (${conversation.connectionId}), pulando`);
        skipped++;
        continue;
      }
      if (scopedConnection.aiEnabled === false) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - IA desativada para conexï¿½o ${conversation.connectionId}, pulando`);
        skipped++;
        continue;
      }

      // Verificar se a sessï¿½o da conexï¿½o da conversa estï¿½ disponï¿½vel
      const session = sessions.get(conversation.connectionId);
      if (!isSessionReadyForMessaging(session)) {
        console.log(`?? [AUTO-RECOVERY] ${contactNumber} - Sessï¿½o ${conversation.connectionId.substring(0,8)}... indisponï¿½vel, pulando`);
        skipped++;
        continue;
      }
      
      console.log(`?? [AUTO-RECOVERY] Recuperando resposta para ${contactNumber} (conn: ${conversation.connectionId.substring(0,8)}..., ${messages.length} msgs)`);
      
      // Resetar o timer para pending
      await storage.resetPendingAIResponseForRetry(conversationId);
      
      // Criar objeto PendingResponse
      // NOTA: Cada WhatsApp (userId) tem sua PRï¿½PRIA fila no messageQueueService
      // Nï¿½o precisamos escalonar aqui - a fila anti-ban cuida de tudo
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
      // Cada userId tem sua prï¿½pria fila, entï¿½o mï¿½ltiplos WhatsApps podem processar em paralelo
      processAccumulatedMessages(pending).catch(err => {
        console.error(`? [AUTO-RECOVERY] Erro ao processar ${contactNumber}:`, err);
      });
      
      recovered++;
      
      if (recovered >= AUTO_RECOVERY_MAX_PER_CYCLE) {
        console.log(`?? [AUTO-RECOVERY] Limite de ${AUTO_RECOVERY_MAX_PER_CYCLE} por ciclo atingido, continuara no proximo`);
        break;
      }
    }
    
    // ?? FIX 2026-02-25: Recover failed transient timers
    for (const timer of transientFailed) {
      if (recovered >= AUTO_RECOVERY_MAX_TOTAL_PER_CYCLE) break;
      
      const { conversationId, userId, contactNumber, jidSuffix, messages, failureReason, retryCount } = timer;
      
      // Verificar se jï¿½ estï¿½ em processamento
      if (conversationsBeingProcessed.has(conversationId) || pendingResponses.has(conversationId)) {
        skipped++;
        continue;
      }
      
      // Resolver conexï¿½o da conversa para evitar enviar pelo nï¿½mero errado em multi-conexï¿½o
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

      // Verificar sessï¿½o da conexï¿½o da conversa
      const session = sessions.get(conversation.connectionId);
      if (!isSessionReadyForMessaging(session)) {
        skipped++;
        continue;
      }
      
      console.log(`?? [AUTO-RECOVERY] Recuperando FAILED transitï¿½rio: ${contactNumber} (conn: ${conversation.connectionId.substring(0,8)}, reason: ${failureReason}, retries: ${retryCount})`);
      
      // Reset para pending com retry_count preservado
      await storage.resetPendingAIResponseForRetry(conversationId, 5, undefined, {
        resetRetryCount: true,
        lastError: `auto_recovery_retry_after_${failureReason}`,
      });
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
        retryCount: 0,
      };
      
      processAccumulatedMessages(pending).catch(err => {
        console.error(`? [AUTO-RECOVERY] Erro ao processar failed transitï¿½rio ${contactNumber}:`, err);
      });
      
      recovered++;
    }
    
    console.log(`?? [AUTO-RECOVERY] Ciclo concluï¿½do: ${recovered} enviados para fila, ${skipped} pulados`);
    console.log(`?? [AUTO-RECOVERY] =========================================\n`);
    
  } catch (error) {
    console.error(`? [AUTO-RECOVERY] Erro no cron:`, error);
  }
}

export async function runAutoRecoveryCycle(): Promise<void> {
  await processAutoRecovery();
}

export function stopAutoRecoveryCron(): void {
  if (autoRecoveryCronInterval) {
    clearInterval(autoRecoveryCronInterval);
    autoRecoveryCronInterval = null;
    console.log(`?? [AUTO-RECOVERY] Cron parado`);
  }
}

// ==================== RE-DOWNLOAD DE Mï¿½DIA ====================
// Funï¿½ï¿½o para tentar re-baixar mï¿½dia do WhatsApp usando metadados salvos
export async function redownloadMedia(
  connectionId: string,
  mediaKeyBase64: string,
  directPath: string,
  originalUrl: string | undefined,
  mediaType: string,
  mediaMimeType: string
): Promise<{ success: boolean; mediaUrl?: string; error?: string }> {
  try {
    console.log(`?? [REDOWNLOAD] Tentando re-baixar mï¿½dia...`);
    console.log(`?? [REDOWNLOAD] connectionId: ${connectionId}`);
    console.log(`?? [REDOWNLOAD] mediaType: ${mediaType}`);
    console.log(`?? [REDOWNLOAD] directPath: ${directPath?.substring(0, 50)}...`);

    // Encontrar a sessï¿½o ativa para esta conexï¿½o
    const session = Array.from(sessions.values()).find(s => s.connectionId === connectionId);
    
    if (!session || !session.socket) {
      return { 
        success: false, 
        error: "WhatsApp nï¿½o conectado. Conecte-se primeiro para re-baixar mï¿½dias." 
      };
    }

    // Importar downloadContentFromMessage do Baileys
    const { downloadContentFromMessage, MediaType } = await import("@whiskeysockets/baileys");

    // Converter mediaKey de base64 para Uint8Array
    const mediaKey = Buffer.from(mediaKeyBase64, "base64");

    // Mapear tipo de mï¿½dia para MediaType do Baileys
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

    console.log(`? [REDOWNLOAD] Mï¿½dia re-baixada: ${buffer.length} bytes`);

    if (buffer.length === 0) {
      return { success: false, error: "Mï¿½dia vazia - pode ter expirado no WhatsApp" };
    }

    // Upload para Supabase Storage (funï¿½ï¿½o jï¿½ estï¿½ definida no topo deste arquivo)
    // A funï¿½ï¿½o uploadMediaSimple recebe: (buffer, mimeType, originalFileName?)
    const filename = `redownloaded_${Date.now()}.${mediaType}`;
    const newMediaUrl = await uploadMediaSimple(buffer, mediaMimeType, filename);

    if (!newMediaUrl) {
      // SEM fallback para base64 - evitar egress!
      console.warn(`?? [REDOWNLOAD] Falha no upload, mï¿½dia nï¿½o serï¿½ salva`);
      return { success: false, error: "Erro ao fazer upload da mï¿½dia re-baixada" };
    }

    console.log(`? [REDOWNLOAD] Nova URL gerada com sucesso!`);
    return { success: true, mediaUrl: newMediaUrl };

  } catch (error: any) {
    console.error(`? [REDOWNLOAD] Erro ao re-baixar mï¿½dia:`, error);
    
    // Erros comuns do WhatsApp
    if (error.message?.includes("gone") || error.message?.includes("404") || error.message?.includes("expired")) {
      return { success: false, error: "Mï¿½dia expirada - nï¿½o estï¿½ mais disponï¿½vel no WhatsApp" };
    }
    if (error.message?.includes("decrypt")) {
      return { success: false, error: "Erro de descriptografia - chave pode estar corrompida" };
    }
    
    return { success: false, error: error.message || "Erro desconhecido ao re-baixar mï¿½dia" };
  }
}


// -------------------------------------------------------------------------------
// ?? SISTEMA DE RECUPERAï¿½ï¿½O: Registrar processador de mensagens pendentes
// -------------------------------------------------------------------------------
// Este callback permite que o pendingMessageRecoveryService reprocesse mensagens
// que chegaram durante instabilidade/deploys do Railway
// 
// IMPORTANTE: Este cï¿½digo deve ficar no FINAL do arquivo para garantir que
// todas as funï¿½ï¿½es necessï¿½rias jï¿½ foram definidas
// -------------------------------------------------------------------------------

setTimeout(() => {
  try {
    registerMessageProcessor(async (userId: string, connectionId: string, waMessage: WAMessage) => {
      // Buscar sessï¿½o ativa
      const session = sessions.get(connectionId);
      
      if (!session?.socket) {
        console.log(`?? [RECOVERY] Sessï¿½o nï¿½o encontrada para ${userId.substring(0, 8)}... conn=${connectionId.substring(0, 8)} - pulando`);
        throw new Error('Sessï¿½o nï¿½o disponï¿½vel');
      }
      
      // Usar a funï¿½ï¿½o handleIncomingMessage existente
      await handleIncomingMessage(session, waMessage, {
        source: "notify",
        allowAutoReply: true,
        bypassIncomingDedupe: true,
      });
    });
    
    console.log(`?? [RECOVERY] ? Message processor registrado com sucesso!`);
  } catch (err) {
    console.error(`?? [RECOVERY] ? Erro ao registrar message processor:`, err);
  }
}, 1000); // Aguardar 1 segundo para garantir que tudo foi inicializado
// todas as funï¿½ï¿½es necessï¿½rias jï¿½ foram definidas
// -------------------------------------------------------------------------------

setTimeout(() => {
  try {
    registerMessageProcessor(async (userId: string, connectionId: string, waMessage: WAMessage) => {
      // Buscar sessï¿½o ativa
      const session = sessions.get(connectionId);
      
      if (!session?.socket) {
        console.log(`?? [RECOVERY] Sessï¿½o nï¿½o encontrada para ${userId.substring(0, 8)}... conn=${connectionId.substring(0, 8)} - pulando`);
        throw new Error('Sessï¿½o nï¿½o disponï¿½vel');
      }
      
      // Usar a funï¿½ï¿½o handleIncomingMessage existente
      await handleIncomingMessage(session, waMessage, {
        source: "notify",
        allowAutoReply: true,
        bypassIncomingDedupe: true,
      });
    });
    
    console.log(`?? [RECOVERY] ? Message processor registrado com sucesso!`);
  } catch (err) {
    console.error(`?? [RECOVERY] ? Erro ao registrar message processor:`, err);
  }
}, 1000); // Aguardar 1 segundo para garantir que tudo foi inicializado
