import { db } from "./db";
import { 
  aiAgentConfig,
  conversations, 
  userFollowupLogs, 
  followupConfigs,
  messages,
  whatsappConnections,
  users,
  businessAgentConfigs,
  type FollowupAudioMode,
} from "@shared/schema";
import { eq, and, lte, isNotNull, isNull, inArray, or, sql } from "drizzle-orm";
import { getLLMClient } from "./llm";
import { runWithLLMUserContext } from "./llmUserContext";
import { generateGrupoOlxCatalogPromptBlock, getGrupoOlxCatalogForAI } from "./realEstateCatalogService";
import { buildRealEstateConversationContext } from "./realEstateReplyGrounding";
import { memoryCache, storage } from "./storage";
import { getSessions } from "./whatsapp";
import {
  isWhatsAppGatewayRuntime,
} from "./whatsappGatewayOwnership";
import { resolveAppVisibleConnectionOwner } from "./whatsappGatewayAppOwnership";
import {
  gatewayStatusLooksConnected,
  getAppVisibleGatewayInstanceStatus,
} from "./whatsappGatewayAppRuntime";
import {
  USER_FOLLOWUP_DEFAULT_INTERVALS,
  addRandomSeconds,
  alignDateToBusinessWindow as alignConfiguredDateToBusinessWindow,
  buildFollowUpStageScheduleDate,
  buildMissingFollowUpScheduleDate,
  getNextBusinessTime as getConfiguredNextBusinessTime,
  isWithinBusinessHours,
} from "./userFollowUpScheduling";
import {
  buildStageCooldownDeadline,
  buildResetFollowUpSchedule,
  getConfiguredDelayMinutesForStage,
  resolveUserFollowUpDecisionWindow,
} from "./userFollowUpTiming";
import {
  buildUserFollowUpBacklogDecisions,
  sortUserFollowUpBacklogEntries,
} from "./userFollowUpBacklogGovernor";
import { centralizedMessageSender } from "./centralizedMessageSender";
import {
  generateAudioForResponse,
  prepareTtsAudioForWhatsAppVoiceMessage,
} from "./audioResponseService";
import {
  disableAdminFollowupsForPriorityUser,
  FOLLOWUP_PRIORITY_EMAIL,
  getFollowupPriorityUserId,
  normalizePriorityPhoneDigits,
} from "./followupPriorityService";
import {
  buildGlobalFollowUpPauseReason,
  GLOBAL_FOLLOWUP_DISABLED_REASON_ASCII,
  isGlobalFollowUpPauseReason,
  resolveRecoveredGlobalFollowUpDate,
} from "./userFollowUpGlobalPause";
import {
  isWaitingForCompanyReplyReason,
  shouldHoldFollowUpUntilCompanyReply,
  WAITING_FOR_COMPANY_REPLY_REASON,
} from "./userFollowUpAwaitingCompanyReply";
import {
  canReactivateFollowUpOnCompanyReply,
  isHardStopFollowUpDisableReason,
} from "./userFollowUpReactivationPolicy";
import { resolveUserFollowUpSocketFromSessions } from "./userFollowUpConnectionState";
import { canRecoverFollowUpAfterCompanyOutbound } from "./userFollowUpOutboundRecoveryPolicy";
import { isUnconfirmedOutgoingMessageStatus } from "./pendingAiDeliveryState";
import {
  formatBrazilWallClockDate,
  getBrazilWallClockNow,
  parseBrazilWallClockDateTime,
  serializeBrazilWallClockDateTime,
  toBrazilWallClockDate,
} from "./brazilWallClock";
import {
  buildOutgoingMessageFingerprint,
  calculateOutgoingMessageSimilarity,
  isOutgoingMessageNearDuplicate,
} from "./outgoingMessageSimilarity";

// ============================================================================
// � VERIFICAÇÃO DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
// ============================================================================
async function checkUserSuspensionForFollowUp(userId: string): Promise<boolean> {
  try {
    const suspensionStatus = await storage.isUserSuspended(userId);
    if (suspensionStatus.suspended) {
      console.log(`🚫 [USER-FOLLOW-UP] Usuário ${userId} está SUSPENSO - Follow-up desativado`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`⚠️ [USER-FOLLOW-UP] Erro ao verificar suspensão do usuário ${userId}:`, error);
    return false;
  }
}

// ============================================================================
// �🚀 SISTEMA DE CACHE PARA REDUZIR QUERIES NO DB
// ============================================================================
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Cache de configurações de follow-up por usuário
const followupConfigCache = new Map<string, CacheEntry<typeof followupConfigs.$inferSelect | null>>();

// Cache de configurações de agente por usuário
const agentConfigCache = new Map<string, CacheEntry<any>>();

// Cache global da chave Mistral
let mistralKeyCache: CacheEntry<string | null> | null = null;

// 🔒 ANTI-DUPLICAÇÃO: Cache de mensagens enviadas recentemente
// Armazena hash das mensagens enviadas por conversa nos últimos 30 minutos
const sentMessagesCache = new Map<string, { hash: string; timestamp: number }[]>();

// 🔒 ANTI-DUPLICAÇÃO: Set de conversas sendo processadas agora
// Evita que a mesma conversa seja processada em paralelo
const conversationsBeingProcessed = new Set<string>();
const WAITING_FOR_OUTGOING_CONFIRMATION_REASON =
  "Aguardando confirmação da última mensagem enviada pela empresa";
const OUTGOING_CONFIRMATION_RECHECK_MS = 30 * 60 * 1000;
interface FollowUpDeliveryResult {
  success: boolean;
  error?: string;
  deferred?: boolean;
  retryAfterMs?: number;
}

function normalizePhoneDigits(value: string | null | undefined): string {
  return normalizePriorityPhoneDigits(value);
}

export function shouldHoldFollowUpForOutgoingConfirmation(message: {
  fromMe?: boolean | null;
  status?: string | null;
} | null | undefined): boolean {
  return message?.fromMe === true && isUnconfirmedOutgoingMessageStatus(message.status);
}

function hashConversationStage(conversationId: string, stage: number): number {
  const base = `${conversationId}:${stage}`;
  let hash = 0;

  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 31 + base.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

function resolveFollowupAudioMode(
  mode: FollowupAudioMode | null | undefined,
  conversationId: string,
  stage: number
): "text" | "audio" {
  if (mode === "audio_only") {
    return "audio";
  }

  if (mode === "alternate_text_audio") {
    return stage % 2 === 0 ? "text" : "audio";
  }

  if (mode === "random_text_audio") {
    return hashConversationStage(conversationId, stage) % 2 === 0 ? "text" : "audio";
  }

  return "text";
}

function buildAudioRate(speed: string): string {
  const speedNum = parseFloat(speed);
  const ratePercent = Math.round((speedNum - 1) * 100);
  return ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
}

// Limpar cache de mensagens enviadas a cada 10 minutos
setInterval(() => {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  
  for (const [convId, messages] of Array.from(sentMessagesCache.entries())) {
    const filtered = messages.filter((m: { hash: string; timestamp: number }) => now - m.timestamp < THIRTY_MINUTES);
    if (filtered.length === 0) {
      sentMessagesCache.delete(convId);
    } else {
      sentMessagesCache.set(convId, filtered);
    }
  }
}, 10 * 60 * 1000);

function generateNormalizedMessageHash(message: string): string {
  const normalized = buildOutgoingMessageFingerprint(message);
  let hash = 0;

  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash = hash & hash;
  }

  return hash.toString(16);
}

/**
 * Gera hash simples de uma mensagem para detectar duplicatas
 */
function generateMessageHash(message: string): string {
  const normalized = message.toLowerCase()
    .replace(/[^a-záéíóúàèìòùâêîôûãõ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Hash simples baseado em soma de caracteres
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Verifica se uma mensagem similar já foi enviada recentemente
 */
function wasMessageRecentlySent(conversationId: string, message: string): boolean {
  const cache = sentMessagesCache.get(conversationId);
  if (!cache || cache.length === 0) return false;
  
  const newHash = generateNormalizedMessageHash(message);
  return cache.some(m => m.hash === newHash);
}

/**
 * Registra uma mensagem como enviada
 */
function registerSentMessage(conversationId: string, message: string): void {
  const hash = generateNormalizedMessageHash(message);
  const existing = sentMessagesCache.get(conversationId) || [];
  existing.push({ hash, timestamp: Date.now() });
  
  // Manter apenas últimas 20 mensagens no cache
  if (existing.length > 20) {
    existing.shift();
  }
  
  sentMessagesCache.set(conversationId, existing);
}

async function getCachedAgentPromptConfig(userId: string): Promise<{
  prompt: string;
  isActive: boolean;
  flowModeActive: boolean;
  flowScript: string | null;
} | null> {
  const cached = agentConfigCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const config = await db.query.aiAgentConfig.findFirst({
    where: eq(aiAgentConfig.userId, userId),
  });

  const normalized = config
    ? {
        prompt: String(config.prompt || "").trim(),
        isActive: Boolean(config.isActive),
        flowModeActive: Boolean(config.flowModeActive),
        flowScript: config.flowScript || null,
      }
    : null;

  agentConfigCache.set(userId, {
    data: normalized,
    timestamp: Date.now(),
  });

  return normalized;
}

// Limpar caches expirados periodicamente
setInterval(() => {
  const now = Date.now();
  
  for (const [key, entry] of Array.from(followupConfigCache.entries())) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      followupConfigCache.delete(key);
    }
  }
  
  for (const [key, entry] of Array.from(agentConfigCache.entries())) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      agentConfigCache.delete(key);
    }
  }
  
  if (mistralKeyCache && now - mistralKeyCache.timestamp > CACHE_TTL_MS) {
    mistralKeyCache = null;
  }
}, 10 * 60 * 1000); // Limpar a cada 10 minutos

/**
 * Verifica se um usuário específico tem conexão WhatsApp ativa em memória
 * 🚀 OTIMIZADO: Não faz query no DB, apenas verifica memória
 * 
 * IMPORTANTE: Baileys usa socket.user para indicar conexão ativa (não socket.ws.readyState)
 */
async function isUserConnectionActive(userId: string, preferredConnectionId?: string): Promise<boolean> {
  const sessions = getSessions();
  if (preferredConnectionId) {
    const preferred = sessions.get(preferredConnectionId);
    if (preferred?.userId === userId) {
      return preferred.isOpen === true && preferred.socket?.user !== undefined;
    }

    const preferredConnection = await storage.getConnectionById(preferredConnectionId);
    if (!preferredConnection || preferredConnection.userId !== userId) {
      return false;
    }

    const owner = await resolveAppVisibleConnectionOwner(preferredConnection);
    if (owner === "gateway" && !isWhatsAppGatewayRuntime()) {
      try {
        const status = await getAppVisibleGatewayInstanceStatus(preferredConnection);
        return gatewayStatusLooksConnected(status);
      } catch {
        return false;
      }
    }

    return false;
  }

  const candidates = Array.from(sessions.values()).filter((s) => s.userId === userId);
  for (const session of candidates) {
    if (!session?.socket || session.socket.user === undefined) continue;
    if (session.isOpen === true) return true;
  }

  return false;
}

// ============================================================================
// FOLLOW-UP INTELIGENTE PARA USUÁRIOS
// Serviço que gerencia follow-ups automáticos para cada agente de usuário
// ============================================================================

// Intervalos padrão em minutos
const DEFAULT_INTERVALS = USER_FOLLOWUP_DEFAULT_INTERVALS;
const USER_FOLLOWUP_MAX_SENDS_PER_USER_PER_CYCLE = 4;
const USER_FOLLOWUP_MAX_GLOBAL_PER_CYCLE = 12;
const USER_FOLLOWUP_BACKLOG_WAVE_MINUTES = 5;
const USER_FOLLOWUP_BACKLOG_SLOT_SECONDS = 20;
const WAITING_FOR_WHATSAPP_CONNECTION_REASON = "🔄 Aguardando conexão WhatsApp...";
const FOLLOWUP_GROUP_DISABLED_REASON = "Follow-up automatico nao esta disponivel para grupos.";
const FOLLOWUP_OWNER_UNVERIFIED_REASON = "Aguardando confirmacao do numero dono da conversa.";
const FOLLOWUP_OWNER_MISMATCH_REASON =
  "Numero dono da conversa nao confere com a conexao atual. Follow-up bloqueado para evitar envio pelo numero errado.";
const FOLLOWUP_CONNECTION_REMOVED_REASON = "Conexao removida - sem userId";

export function shouldRecoverWaitingConnectionReason(
  followupDisabledReason: string | null | undefined,
  isConnectionActive: boolean,
): boolean {
  return isConnectionActive && followupDisabledReason === WAITING_FOR_WHATSAPP_CONNECTION_REASON;
}

function isGroupConversationForFollowUp(conversation: any): boolean {
  const remoteJid = String(conversation?.remoteJid || "").trim();
  const jidSuffix = String(conversation?.jidSuffix || "").trim();
  const contactNumber = normalizePhoneDigits(conversation?.contactNumber || "");

  return Boolean(
    jidSuffix === "g.us" ||
      remoteJid.endsWith("@g.us") ||
      (contactNumber.startsWith("120363") && contactNumber.length >= 15),
  );
}

function parseFollowUpDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getConnectionRuntimeDiagnosticDate(connection: any, key: "lastForceReset" | "lastLogout"): Date | null {
  const sessionData = connection?.sessionData;
  if (!sessionData || typeof sessionData !== "object") {
    return null;
  }

  return parseFollowUpDate((sessionData as any)?.runtimeDiagnostics?.[key]?.at);
}

function getFollowUpConnectionPhone(conversation: any, connection?: any): string {
  return normalizePhoneDigits(
    conversation?.connectionPhoneNumber ||
      connection?.phoneNumber ||
      conversation?.connection?.phoneNumber ||
      "",
  );
}

function getFollowUpOwnerPhone(conversation: any): string {
  return normalizePhoneDigits(
    conversation?.conversationOwnerPhoneNumber ||
      conversation?.ownerPhoneNumber ||
      "",
  );
}

function resolveFollowUpOwnerPhoneState(
  conversation: any,
  connectionPhone?: string | null,
  liveGatewayPhone?: string | null,
): { ok: boolean; reason: string } {
  const ownerPhone = getFollowUpOwnerPhone(conversation);
  const dbPhone = normalizePhoneDigits(connectionPhone || "");
  const livePhone = normalizePhoneDigits(liveGatewayPhone || "");

  if (!ownerPhone) {
    return { ok: false, reason: FOLLOWUP_OWNER_UNVERIFIED_REASON };
  }

  if (dbPhone && ownerPhone !== dbPhone) {
    return { ok: false, reason: FOLLOWUP_OWNER_MISMATCH_REASON };
  }

  if (livePhone && ownerPhone !== livePhone) {
    return { ok: false, reason: FOLLOWUP_OWNER_MISMATCH_REASON };
  }

  return { ok: true, reason: "" };
}

/**
 * Validação básica de segurança - só rejeita casos extremos
 * A IA deve fazer o trabalho principal de gerar mensagens corretas
 */
function validateMessage(message: string): boolean {
  if (!message || message.trim().length < 10) {
    console.warn(`⚠️ [FOLLOW-UP] Mensagem muito curta ou vazia`);
    return false;
  }
  
  // Verificar se a mensagem está EXATAMENTE duplicada (mesma string 2x)
  const trimmed = message.trim();
  const halfLen = Math.floor(trimmed.length / 2);
  if (halfLen > 30) {
    const firstHalf = trimmed.substring(0, halfLen).trim();
    const secondHalf = trimmed.substring(halfLen).trim();
    if (firstHalf === secondHalf) {
      console.warn(`⚠️ [FOLLOW-UP] Mensagem exatamente duplicada detectada`);
      return false;
    }
  }
  
  return true;
}

type FollowUpCallback = (
  userId: string,
  conversationId: string,
  phoneNumber: string,
  remoteJid: string,
  message: string,
  stage: number
) => Promise<{ success: boolean; error?: string; deferred?: boolean; retryAfterMs?: number }>;

export class UserFollowUpService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  // 🔧 FIX: Guard contra ciclos sobrepostos (timer overlap pode spammar leads)
  private isProcessingCycle = false;
  private isRepairCycleRunning = false;
  private onFollowUpReady: FollowUpCallback | null = null;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("🚀 [USER-FOLLOW-UP] Serviço iniciado");
    
    // Verificar a cada 5 minutos (otimizado para reduzir carga no DB)
    this.checkInterval = setInterval(() => this.processFollowUps(), 5 * 60 * 1000);
    // Aguardar 60s antes da primeira execução para não sobrecarregar na inicialização
    setTimeout(async () => {
      await this.repairMissingSchedules();
      await this.repairMissedCycleResetsAfterCompanyReply();
      await this.repairMissingActivationAfterCompanyOutbound();
      await this.repairTooEarlySchedulesAfterTimezoneRegression();
      await this.processFollowUps();
    }, 60 * 1000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 [USER-FOLLOW-UP] Serviço parado");
  }

  registerCallback(callback: FollowUpCallback) {
    this.onFollowUpReady = callback;
    console.log("📲 [USER-FOLLOW-UP] Callback registrado");
  }

  private async pruneUnsafeScheduledFollowUps(onlyUserId?: string): Promise<void> {
    const userScope = onlyUserId
      ? sql`AND EXISTS (
          SELECT 1
          FROM whatsapp_connections scope_wc
          WHERE scope_wc.id::text = c.connection_id::text
            AND scope_wc.user_id = ${onlyUserId}
        )`
      : sql``;

    await db.execute(sql`
      UPDATE conversations c
      SET next_followup_at = NULL,
          followup_disabled_reason = CASE
            WHEN COALESCE(c.followup_active, false) = false
              THEN COALESCE(c.followup_disabled_reason, 'Follow-up desativado.')
            WHEN COALESCE(c.jid_suffix, '') = 'g.us'
              OR COALESCE(c.remote_jid, '') LIKE '%@g.us'
              OR COALESCE(c.contact_number, '') LIKE '%@g.us'
              THEN ${FOLLOWUP_GROUP_DISABLED_REASON}
            WHEN c.connection_id IS NULL
              THEN ${FOLLOWUP_OWNER_UNVERIFIED_REASON}
            WHEN NULLIF(regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g'), '') IS NULL
              THEN ${FOLLOWUP_OWNER_UNVERIFIED_REASON}
            WHEN NOT EXISTS (
              SELECT 1
              FROM whatsapp_connections wc
              WHERE wc.id::text = c.connection_id::text
            )
              THEN ${FOLLOWUP_OWNER_UNVERIFIED_REASON}
            WHEN EXISTS (
              SELECT 1
              FROM whatsapp_connections wc
              WHERE wc.id::text = c.connection_id::text
                AND NULLIF(regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g'), '') IS NOT NULL
                AND regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g')
                  <> regexp_replace(COALESCE(wc.phone_number, ''), '\\D', '', 'g')
            )
              THEN ${FOLLOWUP_OWNER_MISMATCH_REASON}
            WHEN EXISTS (
              SELECT 1
              FROM whatsapp_connections wc
              WHERE wc.id::text = c.connection_id::text
                AND COALESCE(wc.is_connected, false) = false
                AND LOWER(COALESCE(wc.provider_status, '')) NOT IN ('connected', 'open')
            )
              THEN ${WAITING_FOR_WHATSAPP_CONNECTION_REASON}
            ELSE ${FOLLOWUP_OWNER_UNVERIFIED_REASON}
          END,
          updated_at = NOW()
      WHERE c.next_followup_at IS NOT NULL
        ${userScope}
        AND (
          COALESCE(c.followup_active, false) = false
          OR COALESCE(c.jid_suffix, '') = 'g.us'
          OR COALESCE(c.remote_jid, '') LIKE '%@g.us'
          OR COALESCE(c.contact_number, '') LIKE '%@g.us'
          OR c.connection_id IS NULL
          OR NULLIF(regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g'), '') IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM whatsapp_connections wc
            WHERE wc.id::text = c.connection_id::text
              AND regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g')
                = regexp_replace(COALESCE(wc.phone_number, ''), '\\D', '', 'g')
              AND (
                COALESCE(wc.is_connected, false) = true
                OR LOWER(COALESCE(wc.provider_status, '')) IN ('connected', 'open')
              )
          )
        )
    `);
  }

  private buildCurrentStageScheduleDate(conversation: any, config: any, now: Date = new Date()): Date | null {
    return buildFollowUpStageScheduleDate({
      config,
      stageIndex: Math.max(0, Number(conversation.followupStage || 0)),
      now,
    });
  }

  private buildMinimumExpectedScheduleForStage(
    currentStage: number,
    config: any,
    referenceTime: Date,
  ): Date | null {
    if (currentStage <= 0) {
      return buildResetFollowUpSchedule(config, referenceTime, {
        randomizeDate: (date) => date,
      }).nextFollowupAt;
    }

    return buildFollowUpStageScheduleDate({
      config,
      stageIndex: currentStage,
      now: referenceTime,
      randomFn: () => 0,
    });
  }

  private buildCorrectedScheduleForStage(
    currentStage: number,
    config: any,
    referenceTime: Date,
  ): Date | null {
    if (currentStage <= 0) {
      return buildResetFollowUpSchedule(config, referenceTime, {
        randomizeDate: addRandomSeconds,
      }).nextFollowupAt;
    }

    return buildFollowUpStageScheduleDate({
      config,
      stageIndex: currentStage,
      now: referenceTime,
    });
  }

  private getSocketForConversation(userId: string, preferredConnectionId?: string) {
    const sessions = getSessions();
    return resolveUserFollowUpSocketFromSessions(sessions, userId, preferredConnectionId);
  }

  private async getLatestConversationMessage(conversationId: string) {
    return db.query.messages.findFirst({
      where: eq(messages.conversationId, conversationId),
      orderBy: (msgs) => [
        sql`COALESCE(${msgs.timestamp}, ${msgs.createdAt}) DESC`,
      ],
    });
  }

  private async getLatestRealConversationMessage(conversationId: string): Promise<any | null> {
    const result = await db.execute(sql`
      SELECT
        id,
        message_id AS "messageId",
        from_me AS "fromMe",
        status,
        timestamp,
        created_at AS "createdAt",
        text,
        media_type AS "mediaType",
        media_url AS "mediaUrl",
        media_caption AS "mediaCaption"
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND (
          NULLIF(BTRIM(COALESCE(text, '')), '') IS NOT NULL
          OR media_type IS NOT NULL
          OR media_url IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(media_caption, '')), '') IS NOT NULL
        )
      ORDER BY COALESCE(timestamp, created_at) DESC
      LIMIT 1
    `);

    return (result.rows || [])[0] || null;
  }

  private async getFirstRealConversationMessage(conversationId: string): Promise<any | null> {
    const result = await db.execute(sql`
      SELECT
        id,
        message_id AS "messageId",
        from_me AS "fromMe",
        status,
        timestamp,
        created_at AS "createdAt",
        text,
        media_type AS "mediaType",
        media_url AS "mediaUrl",
        media_caption AS "mediaCaption"
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND (
          NULLIF(BTRIM(COALESCE(text, '')), '') IS NOT NULL
          OR media_type IS NOT NULL
          OR media_url IS NOT NULL
          OR NULLIF(BTRIM(COALESCE(media_caption, '')), '') IS NOT NULL
        )
      ORDER BY COALESCE(timestamp, created_at) ASC
      LIMIT 1
    `);

    return (result.rows || [])[0] || null;
  }

  private async holdFollowUpOutOfQueue(conversation: any, reason: string): Promise<void> {
    if (!conversation?.id) {
      return;
    }

    if (!conversation.nextFollowupAt && conversation.followupDisabledReason === reason) {
      return;
    }

    await db.update(conversations)
      .set({
        nextFollowupAt: null,
        followupDisabledReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id));

    conversation.nextFollowupAt = null;
    conversation.followupDisabledReason = reason;
  }

  private async loadConversationConnection(conversation: any, userId?: string): Promise<any | null> {
    const connectionId = conversation?.connectionId || conversation?.connection?.id;
    if (!connectionId) {
      return null;
    }

    const cachedConnection = conversation?.connection;
    if (
      cachedConnection?.id &&
      cachedConnection?.userId &&
      typeof cachedConnection?.phoneNumber !== "undefined" &&
      typeof cachedConnection?.providerStatus !== "undefined"
    ) {
      if (!userId || cachedConnection.userId === userId) {
        return cachedConnection;
      }
    }

    const connection = await storage.getConnectionById(connectionId);
    if (!connection || (userId && connection.userId !== userId)) {
      return null;
    }

    conversation.connection = {
      ...(conversation.connection || {}),
      ...connection,
    };

    return connection;
  }

  private async tryBackfillOwnerPhoneFromCurrentSession(conversation: any, userId: string): Promise<boolean> {
    if (!conversation?.id || getFollowUpOwnerPhone(conversation)) {
      return false;
    }

    const connection = await this.loadConversationConnection(conversation, userId);
    if (!connection) {
      return false;
    }

    const resetAt = getConnectionRuntimeDiagnosticDate(connection, "lastForceReset");
    const logoutAt = getConnectionRuntimeDiagnosticDate(connection, "lastLogout");
    const sessionBoundary = [resetAt, logoutAt].filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;

    if (!sessionBoundary) {
      return false;
    }

    const currentDbPhone = getFollowUpConnectionPhone(conversation, connection);
    if (!currentDbPhone) {
      return false;
    }

    const owner = await resolveAppVisibleConnectionOwner(connection);
    if (owner === "gateway" && !isWhatsAppGatewayRuntime()) {
      const status = await getAppVisibleGatewayInstanceStatus(connection).catch(() => null);
      const gatewayPhone = normalizePhoneDigits((status as any)?.phoneNumber || "");
      if (!gatewayStatusLooksConnected(status) || !gatewayPhone || gatewayPhone !== currentDbPhone) {
        return false;
      }
    }

    const firstMessage = await this.getFirstRealConversationMessage(conversation.id);
    const firstTimestamp = parseFollowUpDate(firstMessage?.timestamp || firstMessage?.createdAt);
    if (!firstTimestamp || firstTimestamp.getTime() < sessionBoundary.getTime()) {
      return false;
    }

    const [updated] = await db.update(conversations)
      .set({
        ownerPhoneNumber: currentDbPhone,
        ownerPhoneVerifiedAt: new Date(),
        ownerPhoneSource: "current_session_first_message_after_reset",
        updatedAt: new Date(),
      })
      .where(and(
        eq(conversations.id, conversation.id),
        isNull(conversations.ownerPhoneNumber),
      ))
      .returning({
        ownerPhoneNumber: conversations.ownerPhoneNumber,
        ownerPhoneVerifiedAt: conversations.ownerPhoneVerifiedAt,
        ownerPhoneSource: conversations.ownerPhoneSource,
      });

    if (!updated?.ownerPhoneNumber) {
      return false;
    }

    conversation.ownerPhoneNumber = updated.ownerPhoneNumber;
    conversation.conversationOwnerPhoneNumber = updated.ownerPhoneNumber;
    conversation.ownerPhoneVerifiedAt = updated.ownerPhoneVerifiedAt;
    conversation.conversationOwnerPhoneVerifiedAt = updated.ownerPhoneVerifiedAt;
    conversation.ownerPhoneSource = updated.ownerPhoneSource;
    conversation.conversationOwnerPhoneSource = updated.ownerPhoneSource;
    return true;
  }

  private async resolveConversationConnectionAvailability(conversation: any, userId: string): Promise<{
    available: boolean;
    reason: string;
    connectionPhone: string | null;
    liveGatewayPhone: string | null;
  }> {
    const connection = await this.loadConversationConnection(conversation, userId);
    if (!connection) {
      return {
        available: false,
        reason: FOLLOWUP_CONNECTION_REMOVED_REASON,
        connectionPhone: null,
        liveGatewayPhone: null,
      };
    }

    const connectionPhone = getFollowUpConnectionPhone(conversation, connection) || null;
    const providerStatus = String(connection.providerStatus || "").trim().toLowerCase();
    const dbAvailable =
      connection.isConnected === true ||
      providerStatus === "connected" ||
      providerStatus === "open";
    return {
      available: dbAvailable,
      reason: dbAvailable
        ? ""
        : `A conexao vinculada a esta conversa (${connection.connectionName || connection.id}) nao esta conectada.`,
      connectionPhone,
      liveGatewayPhone: null,
    };

    const owner = await resolveAppVisibleConnectionOwner(connection);
    if (owner === "gateway" && !isWhatsAppGatewayRuntime()) {
      try {
        const status = await getAppVisibleGatewayInstanceStatus(connection);
        const liveGatewayPhone = normalizePhoneDigits((status as any)?.phoneNumber || "") || null;
        return {
          available: gatewayStatusLooksConnected(status),
          reason: gatewayStatusLooksConnected(status)
            ? ""
            : `A conexao vinculada a esta conversa (${connection.connectionName || connection.id}) nao esta conectada.`,
          connectionPhone,
          liveGatewayPhone,
        };
      } catch (error: any) {
        return {
          available: false,
          reason: error?.message || "Falha ao consultar status da conexao no gateway.",
          connectionPhone,
          liveGatewayPhone: null,
        };
      }
    }

    const available = await isUserConnectionActive(userId, connection.id);
    return {
      available,
      reason: available
        ? ""
        : `A conexao vinculada a esta conversa (${connection.connectionName || connection.id}) nao esta conectada.`,
      connectionPhone,
      liveGatewayPhone: null,
    };
  }

  private async ensureConversationSafeForFollowUpQueue(conversation: any, userId: string): Promise<boolean> {
    if (isGroupConversationForFollowUp(conversation)) {
      await this.holdFollowUpOutOfQueue(conversation, FOLLOWUP_GROUP_DISABLED_REASON);
      return false;
    }

    if (!getFollowUpOwnerPhone(conversation)) {
      await this.tryBackfillOwnerPhoneFromCurrentSession(conversation, userId);
    }

    const connectionState = await this.resolveConversationConnectionAvailability(conversation, userId);
    if (!connectionState.available) {
      await this.deferFollowUpUntilConnectionIsAvailable(conversation);
      return false;
    }

    const ownerState = resolveFollowUpOwnerPhoneState(
      conversation,
      connectionState.connectionPhone,
      connectionState.liveGatewayPhone,
    );
    if (!ownerState.ok) {
      await this.holdFollowUpOutOfQueue(conversation, ownerState.reason);
      return false;
    }

    return true;
  }

  private async syncFollowUpStageFromSentLogs(conversation: any, userId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT MAX(stage) AS "maxStage"
      FROM user_followup_logs
      WHERE user_id = ${userId}
        AND conversation_id = ${conversation.id}
        AND status = 'sent'
    `);
    const maxStageValue = (result.rows || [])[0]?.maxStage;
    const rawMaxStage = maxStageValue === null || typeof maxStageValue === "undefined"
      ? NaN
      : Number(maxStageValue);
    const nextStage = Number.isFinite(rawMaxStage)
      ? rawMaxStage + 1
      : Math.max(0, Number(conversation.followupStage || 0));

    if (nextStage !== Number(conversation.followupStage || 0)) {
      await db.update(conversations)
        .set({
          followupStage: nextStage,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));
      conversation.followupStage = nextStage;
    }

    return nextStage;
  }

  private async pauseIfLatestMessageIsFromClient(
    conversation: any,
    userId: string,
    phase: string,
  ): Promise<boolean> {
    const latestMessage = await this.getLatestRealConversationMessage(conversation.id);
    if (!latestMessage || latestMessage.fromMe === true) {
      return false;
    }

    await this.pauseFollowUpUntilCompanyReply(conversation.id, WAITING_FOR_COMPANY_REPLY_REASON);
    await this.logFollowUp(
      conversation,
      userId,
      'skipped',
      null,
      {
        action: 'wait',
        reason: WAITING_FOR_COMPANY_REPLY_REASON,
        context: {
          phase,
          latestMessageId: latestMessage.messageId || latestMessage.id,
          latestMessageAt: latestMessage.timestamp || latestMessage.createdAt,
        },
      },
      WAITING_FOR_COMPANY_REPLY_REASON,
    );

    console.log(
      `[USER-FOLLOW-UP] Cliente foi o ultimo a falar em ${conversation.contactNumber}; follow-up pausado ate a empresa responder.`,
    );
    return true;
  }

  private async deferFollowUpUntilConnectionIsAvailable(conversation: any): Promise<void> {
    if (
      !conversation.nextFollowupAt &&
      conversation.followupDisabledReason === WAITING_FOR_WHATSAPP_CONNECTION_REASON
    ) {
      return;
    }

    await db.update(conversations)
      .set({
        nextFollowupAt: null,
        followupDisabledReason: WAITING_FOR_WHATSAPP_CONNECTION_REASON,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id));

    if (conversation.followupDisabledReason !== WAITING_FOR_WHATSAPP_CONNECTION_REASON) {
      console.log(
        `[USER-FOLLOW-UP] Connection ${conversation.connectionId || conversation.connection?.id || "?"} offline - ` +
        `removing ${conversation.contactNumber} from the queue until reconnect`,
      );
    }
  }

  private async sendFollowUpAsText(
    userId: string,
    remoteJid: string,
    message: string,
    socket: any
  ): Promise<FollowUpDeliveryResult> {
    const result = await centralizedMessageSender.sendText(
      userId,
      remoteJid,
      message,
      socket,
      "user_follow_up",
      { skipTyping: false }
    );

    return result.success
      ? { success: true }
      : { success: false, error: result.error || "Falha ao enviar texto" };
  }

  private async sendFollowUpAsAudio(
    userId: string,
    remoteJid: string,
    message: string,
    socket: any
  ): Promise<FollowUpDeliveryResult> {
    const audioConfig = await storage.getAudioConfig(userId);
    if (!audioConfig?.isEnabled) {
      return { success: false, error: "Áudio desativado na conta" };
    }

    const usage = await storage.canSendAudio(userId);
    if (!usage.canSend) {
      return { success: false, error: "Limite diário de áudio atingido" };
    }

    const voice = ["male", "santa", "alex"].includes(String(audioConfig.voiceType || ""))
      ? "pt-BR-AntonioNeural"
      : "pt-BR-FranciscaNeural";
    const rate = buildAudioRate(String(audioConfig.speed ?? "1.00"));
    const audioBuffer = await generateAudioForResponse(message, voice, rate);

    if (!audioBuffer) {
      return { success: false, error: "Falha ao gerar áudio" };
    }

    const preparedAudio = await prepareTtsAudioForWhatsAppVoiceMessage(audioBuffer);

    const sendResult = await centralizedMessageSender.sendAudio(
      userId,
      remoteJid,
      preparedAudio.audioBuffer,
      preparedAudio.ptt,
      socket,
      "user_follow_up",
      {
        skipTyping: true,
        mimetype: preparedAudio.mimeType,
      }
    );

    if (!sendResult.success) {
      return { success: false, error: sendResult.error || "Falha ao enviar áudio" };
    }

    await storage.incrementAudioMessageCounter(userId);
    return { success: true };
  }

  private async deliverFollowUpMessage(
    conversation: any,
    userId: string,
    message: string,
    config: typeof followupConfigs.$inferSelect
  ): Promise<FollowUpDeliveryResult> {
    if (!conversation.remoteJid) {
      return { success: false, error: "remoteJid ausente" };
    }

    const socket = this.getSocketForConversation(userId, conversation.connectionId || conversation.connection?.id);
    if (!socket) {
      return { success: false, error: "WhatsApp not connected" };
    }

    const deliveryMode = resolveFollowupAudioMode(
      config.followupAudioMode as FollowupAudioMode | null | undefined,
      conversation.id,
      conversation.followupStage || 0
    );

    if (deliveryMode === "text") {
      return this.sendFollowUpAsText(userId, conversation.remoteJid, message, socket);
    }

    const audioResult = await this.sendFollowUpAsAudio(userId, conversation.remoteJid, message, socket);
    if (audioResult.success) {
      return audioResult;
    }

    console.warn(
      `⚠️ [USER-FOLLOW-UP] Áudio indisponível para ${conversation.contactNumber}, fallback para texto: ${audioResult.error}`
    );

    const textFallback = await this.sendFollowUpAsText(userId, conversation.remoteJid, message, socket);
    if (textFallback.success) {
      return { success: true };
    }

    return {
      success: false,
      error: textFallback.error || audioResult.error || "Falha ao enviar follow-up",
    };
  }

  private async applyBacklogGovernor(conversationsToProcess: any[], now: Date): Promise<any[]> {
    const decisions = buildUserFollowUpBacklogDecisions(
      conversationsToProcess
        .filter((conversation) => conversation.connection?.userId)
        .map((conversation) => ({
          conversationId: conversation.id,
          userId: conversation.connection.userId,
          connectionId: conversation.connectionId || conversation.connection?.id || null,
          nextFollowupAt: conversation.nextFollowupAt,
          lastMessageTime: conversation.lastMessageTime,
          updatedAt: conversation.updatedAt,
          createdAt: conversation.createdAt,
        })),
      USER_FOLLOWUP_MAX_SENDS_PER_USER_PER_CYCLE,
    );

    const decisionsByConversationId = new Map(
      decisions.map((decision) => [decision.conversationId, decision]),
    );
    const configCache = new Map<string, typeof followupConfigs.$inferSelect | null>();
    const readyToProcess: any[] = [];
    const deferredByScope = new Map<string, { userId: string; connectionId: string; count: number }>();

    for (const conversation of conversationsToProcess) {
      const userId = conversation.connection?.userId;
      if (!userId) {
        readyToProcess.push(conversation);
        continue;
      }

      const decision = decisionsByConversationId.get(conversation.id);
      if (!decision || decision.action === "process_now") {
        readyToProcess.push(conversation);
        continue;
      }

      let config = configCache.get(userId);
      if (config === undefined) {
        config = await this.getFollowupConfig(userId);
        configCache.set(userId, config ?? null);
      }

      if (config?.isEnabled === false) {
        readyToProcess.push(conversation);
        continue;
      }

      let nextDate = new Date(
        now.getTime() +
        decision.wave * USER_FOLLOWUP_BACKLOG_WAVE_MINUTES * 60 * 1000 +
        decision.slotInWave * USER_FOLLOWUP_BACKLOG_SLOT_SECONDS * 1000,
      );

      if (config?.respectBusinessHours) {
        nextDate = this.alignDateToBusinessWindow(nextDate, config);
      }

      nextDate = addRandomSeconds(nextDate);

      await db.update(conversations)
        .set({
          nextFollowupAt: nextDate,
          followupDisabledReason: null,
        })
        .where(eq(conversations.id, conversation.id));

      const connectionId = conversation.connectionId || conversation.connection?.id || "sem-conexao";
      const scopeKey = `${userId}:${connectionId}`;
      const currentScope = deferredByScope.get(scopeKey);
      deferredByScope.set(scopeKey, {
        userId,
        connectionId,
        count: (currentScope?.count || 0) + 1,
      });
    }

    for (const { userId, connectionId, count } of Array.from(deferredByScope.values())) {
      console.log(
        `🛡️ [USER-FOLLOW-UP] Backlog redistribuído para ${userId.substring(0, 8)}... ` +
        `conexao ${connectionId.substring(0, 8)}..., adiados ${count} follow-up(s), ` +
        `limite imediato ${USER_FOLLOWUP_MAX_SENDS_PER_USER_PER_CYCLE}/ciclo/conexao`,
      );
    }

    return readyToProcess;
  }

  private async enforcePriorityOverAdminConflicts(conversation: any, userId: string, source: string): Promise<void> {
    const priorityUserId = await getFollowupPriorityUserId();
    if (!priorityUserId || userId !== priorityUserId) {
      return;
    }

    const result = await disableAdminFollowupsForPriorityUser(conversation.contactNumber, conversation.id);
    if (result.disabled <= 0) {
      return;
    }

    console.log(
      `Prioridade de ${FOLLOWUP_PRIORITY_EMAIL} aplicada para ${conversation.contactNumber}. ${result.disabled} follow-up(s) do admin bloqueados durante ${source}.`,
    );

  }

  private async recoverStaleWaitingConnectionReasons(): Promise<void> {
    const waitingConversations = await db.query.conversations.findMany({
      where: and(
        eq(conversations.followupActive, true),
        eq(conversations.followupDisabledReason, WAITING_FOR_WHATSAPP_CONNECTION_REASON),
      ),
      with: {
        connection: true,
      },
    });

    if (waitingConversations.length === 0) {
      return;
    }

    const connectionIds = new Set<string>();
    for (const conversation of waitingConversations) {
      const connectionId = conversation.connectionId || conversation.connection?.id;
      const userId = conversation.connection?.userId;
      if (!connectionId || !userId || connectionIds.has(connectionId)) {
        continue;
      }

      connectionIds.add(connectionId);
      const isActive = await isUserConnectionActive(userId, connectionId);
      if (!shouldRecoverWaitingConnectionReason(conversation.followupDisabledReason, isActive)) {
        continue;
      }

      await this.clearConnectionWaitingStatus(connectionId);
    }
  }

  /**
   * Processa todas as conversas pendentes de follow-up
   */
  async runCycleOnce(options?: {
    includeRepairs?: boolean;
    repairLimit?: number;
    onlyUserId?: string;
  }): Promise<{
    accepted: boolean;
    skipped?: string;
    repairs: Record<string, any> | null;
  }> {
    const includeRepairs = options?.includeRepairs !== false;
    const repairLimit = Math.max(1, Number(options?.repairLimit || 5000));
    let repairSummary: Record<string, any> | null = null;

    if (this.isProcessingCycle) {
      return {
        accepted: false,
        skipped: "busy",
        repairs: repairSummary,
      };
    }

    await this.processFollowUps(options?.onlyUserId);

    const runRepair = async <T>(
      name: string,
      action: () => Promise<T>,
    ): Promise<T | { failed: true; error: string }> => {
      try {
        return await action();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[USER-FOLLOW-UP] Repair ${name} failed; follow-up cycle kept alive:`, error);
        return { failed: true, error: message };
      }
    };

    if (includeRepairs) {
      if (this.isRepairCycleRunning) {
        repairSummary = { skipped: "repair_busy" };
      } else {
        this.isRepairCycleRunning = true;
        try {
          repairSummary = {
            missingSchedules: await runRepair(
              "missingSchedules",
              () => this.repairMissingSchedules(repairLimit, options?.onlyUserId),
            ),
            missedCycleResets: await runRepair(
              "missedCycleResets",
              () => this.repairMissedCycleResetsAfterCompanyReply(repairLimit, options?.onlyUserId),
            ),
            missingActivation: await runRepair(
              "missingActivation",
              () => this.repairMissingActivationAfterCompanyOutbound(repairLimit, options?.onlyUserId),
            ),
            earlySchedules: await runRepair(
              "earlySchedules",
              () => this.repairTooEarlySchedulesAfterTimezoneRegression(repairLimit, options?.onlyUserId),
            ),
          };
        } finally {
          this.isRepairCycleRunning = false;
        }
      }
    }

    return {
      accepted: true,
      repairs: repairSummary,
    };
  }

  private async processFollowUps(onlyUserId?: string) {
    // 🔧 FIX: Guard contra ciclos sobrepostos
    if (this.isProcessingCycle) {
      console.log("⏭️ [USER-FOLLOW-UP] Verificação anterior ainda em execução, pulando ciclo para evitar duplicatas");
      return;
    }

    this.isProcessingCycle = true;
    try {
      await this.pruneUnsafeScheduledFollowUps(onlyUserId);

      // 🚀 REMOVIDO: Verificação global hasAnyActiveWhatsAppConnection()
      // Motivo: Após restart do servidor, a memória está vazia mas o banco tem conexões ativas
      // NOVA ESTRATÉGIA: Verificar conexão por usuário específico no executeFollowUp
      // Isso permite processar follow-ups de usuários conectados mesmo se outros não estão
      
      const now = new Date();
      
      // Buscar conversas que precisam de follow-up
      const allPendingConversations = await db.query.conversations.findMany({
        where: and(
          eq(conversations.followupActive, true),
          isNotNull(conversations.nextFollowupAt),
          lte(conversations.nextFollowupAt, now),
          sql`COALESCE(${conversations.jidSuffix}, 's.whatsapp.net') <> 'g.us'`,
          sql`COALESCE(${conversations.remoteJid}, '') NOT LIKE '%@g.us'`,
          sql`NOT (
            regexp_replace(COALESCE(${conversations.contactNumber}, ''), '\\D', '', 'g') LIKE '120363%'
            AND length(regexp_replace(COALESCE(${conversations.contactNumber}, ''), '\\D', '', 'g')) >= 15
          )`,
        ),
        with: {
          connection: {
            columns: {
              id: true,
              userId: true,
              connectionName: true,
              phoneNumber: true,
              isConnected: true,
              provider: true,
              providerStatus: true,
              connectionMethod: true,
              sessionData: true,
            },
          }
        }
      });
      const pendingConversations = onlyUserId
        ? allPendingConversations.filter((conversation) => conversation.connection?.userId === onlyUserId)
        : allPendingConversations;

      if (pendingConversations.length > 0) {
        console.log(`[USER-FOLLOW-UP] Found ${pendingConversations.length} conversations pending processing`);
      }

      const seenConversationScopes = new Set<string>();
      const uniqueConversations = [];
      
      // Priorizar sempre o follow-up mais vencido/antigo primeiro.
      // Em backlog grande, favorecer as conversas mais recentes faz a fila
      // girar nas conversas "quentes" e pode impedir que as antigas cheguem ao envio.
      const sorted = sortUserFollowUpBacklogEntries(pendingConversations);
      
      for (const conv of sorted) {
        const scopeKey = `${conv.connectionId || conv.connection?.id || 'unknown'}:${conv.contactNumber}`;
        if (!seenConversationScopes.has(scopeKey)) {
          seenConversationScopes.add(scopeKey);
          uniqueConversations.push(conv);
        } else {
          // Conversa duplicada no mesmo escopo (conexão+número) - desativar para evitar spam
          console.log(`🔧 [USER-FOLLOW-UP] Desativando followup DUPLICADO no escopo ${scopeKey} (conv ${conv.id})`);
          await db.update(conversations)
            .set({ followupActive: false, nextFollowupAt: null, followupDisabledReason: 'Duplicado na mesma conexão - outra conversa ativa' })
            .where(eq(conversations.id, conv.id));
        }
      }
      
      if (uniqueConversations.length !== pendingConversations.length) {
        console.log(`[USER-FOLLOW-UP] Deduplication: ${pendingConversations.length} -> ${uniqueConversations.length} unique conversations`);
      }

      const governedConversations = await this.applyBacklogGovernor(uniqueConversations, now);

      if (governedConversations.length !== uniqueConversations.length) {
        console.log(
          `🛡️ [USER-FOLLOW-UP] Governador anti-backlog: ${uniqueConversations.length} pendentes → ` +
          `${governedConversations.length} processadas neste ciclo`,
        );
      }

      const cycleConversations = governedConversations.slice(0, USER_FOLLOWUP_MAX_GLOBAL_PER_CYCLE);
      if (governedConversations.length > cycleConversations.length) {
        console.log(
          `[USER-FOLLOW-UP] Global cycle cap: ${governedConversations.length} ready -> ` +
          `${cycleConversations.length} processed now; remaining will be retried in the next cycle`,
        );
      }

      const readyGovernedConversations: any[] = [];
      let skippedForInactiveConnection = 0;
      let skippedForUnsafeScope = 0;

      for (const conversation of cycleConversations) {
        const userId = conversation.connection?.userId;
        if (!userId) {
          readyGovernedConversations.push(conversation);
          continue;
        }

        if (await this.ensureConversationSafeForFollowUpQueue(conversation, userId)) {
          readyGovernedConversations.push(conversation);
          continue;
        }

        if (conversation.followupDisabledReason === WAITING_FOR_WHATSAPP_CONNECTION_REASON) {
          skippedForInactiveConnection += 1;
        } else {
          skippedForUnsafeScope += 1;
        }
      }

      if (skippedForInactiveConnection > 0) {
        console.log(
          `[USER-FOLLOW-UP] ${skippedForInactiveConnection} conversation(s) skipped this cycle because the owning connection is offline`,
        );
      }
      if (skippedForUnsafeScope > 0) {
        console.log(
          `[USER-FOLLOW-UP] ${skippedForUnsafeScope} conversation(s) removed from queue by safety checks`,
        );
      }

      for (const conv of readyGovernedConversations) {
        await this.executeFollowUp(conv);
      }
    } catch (error) {
      console.error("❌ [USER-FOLLOW-UP] Erro ao processar follow-ups:", error);
    } finally {
      this.isProcessingCycle = false;
    }
  }

  /**
   * Executa follow-up para uma conversa específica
   */
  private async executeFollowUp(conversation: any) {
    const userId = conversation.connection?.userId;
    if (!userId) {
      // 🔧 FIX: Desativar follow-up para conversas órfãs (sem conexão/userId válido)
      // Evita log spam repetitivo a cada 5 minutos para conversas que nunca serão processadas
      console.warn(`⚠️ [USER-FOLLOW-UP] Conversa ${conversation.id} sem userId - desativando follow-up (conexão removida)`);
      try {
        await db.update(conversations)
          .set({ followupActive: false, nextFollowupAt: null, followupDisabledReason: 'Conexão removida - sem userId' })
          .where(eq(conversations.id, conversation.id));
      } catch (e) { /* ignore */ }
      return;
    }

    return runWithLLMUserContext(userId, async () => {

    // � VERIFICAÇÃO CRÍTICA: Re-validar se followup ainda está ativo
    // Evita enviar mensagens de followup que foram desativadas entre a query inicial e o processamento
    const [currentConv] = await db.select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
      .limit(1);
    
    if (!currentConv || !currentConv.followupActive) {
      console.log(`🛑 [USER-FOLLOW-UP] Follow-up foi DESATIVADO para conversa ${conversation.contactNumber} - cancelando envio`);
      return;
    }

    // �🚫 VERIFICAÇÃO DE SUSPENSÃO: Usuários suspensos não podem usar follow-up
    await this.enforcePriorityOverAdminConflicts(conversation, userId, "execucao");

    const isSuspended = await checkUserSuspensionForFollowUp(userId);
    if (isSuspended) {
      console.log(`🚫 [USER-FOLLOW-UP] Usuário ${userId} está SUSPENSO - desativando follow-up da conversa`);
      await this.disableFollowUp(conversation.id, "Conta suspensa por violação de políticas");
      return;
    }

    // 🔌 VERIFICAÇÃO POR USUÁRIO: Verificar se ESTE usuário específico tem conexão ativa
    // Isso permite processar follow-ups de outros usuários mesmo se este não está conectado
    if (!await this.ensureConversationSafeForFollowUpQueue(conversation, userId)) {
      return;
    }

    if (shouldRecoverWaitingConnectionReason(conversation.followupDisabledReason, true)) {
      await db.update(conversations)
        .set({ followupDisabledReason: null })
        .where(eq(conversations.id, conversation.id));
      conversation.followupDisabledReason = null;
    }

    // 🔒 ANTI-DUPLICAÇÃO: Verificar se esta conversa já está sendo processada
    if (conversationsBeingProcessed.has(conversation.id)) {
      console.log(`⏳ [USER-FOLLOW-UP] Conversa ${conversation.contactNumber} já está sendo processada - ignorando`);
      return;
    }
    
    // Marcar como em processamento
    conversationsBeingProcessed.add(conversation.id);

    console.log(`👉 [USER-FOLLOW-UP] Processando ${conversation.contactNumber} (Estágio ${conversation.followupStage})`);

    try {
      const config = await this.getFollowupConfig(userId);
      if (!config || !config.isEnabled) {
        console.log(`🛑 [USER-FOLLOW-UP] Follow-up desativado para usuário ${userId}`);
        await this.disableFollowUp(conversation.id, "Usuário desativou follow-up");
        return;
      }

      await this.syncFollowUpStageFromSentLogs(conversation, userId);

      // � FIX CRÍTICO: Anti-spam cooldown - verificar se a última mensagem (nossa ou do cliente)
      // foi há menos do intervalo configurado para o estágio atual (limitado a 10 min).
      // Isso evita enviar follow-up enquanto a conversa ainda está claramente ativa,
      // sem quebrar tempos menores configurados pelo usuário.
      if (await this.pauseIfLatestMessageIsFromClient(conversation, userId, "before_ai_analysis")) {
        return;
      }

      try {
        const recentMsg = await this.getLatestConversationMessage(conversation.id);

        if (recentMsg && shouldHoldFollowUpForOutgoingConfirmation(recentMsg)) {
          const retryDate = addRandomSeconds(new Date(Date.now() + OUTGOING_CONFIRMATION_RECHECK_MS));
          const reasonChanged =
            conversation.followupDisabledReason !== WAITING_FOR_OUTGOING_CONFIRMATION_REASON;

          await db.update(conversations)
            .set({
              nextFollowupAt: retryDate,
              followupDisabledReason: WAITING_FOR_OUTGOING_CONFIRMATION_REASON,
              updatedAt: new Date(),
            })
            .where(eq(conversations.id, conversation.id));

          console.log(
            `[USER-FOLLOW-UP] Última mensagem da empresa ainda sem confirmação (${recentMsg.status}) para ${conversation.contactNumber}; reagendando para rechecagem.`,
          );

          if (reasonChanged) {
            await this.logFollowUp(
              conversation,
              userId,
              'skipped',
              null,
              {
                action: 'wait',
                reason: WAITING_FOR_OUTGOING_CONFIRMATION_REASON,
                context: recentMsg.messageId || recentMsg.id,
              },
              WAITING_FOR_OUTGOING_CONFIRMATION_REASON,
            );
          }

          return;
        }
        
        if (recentMsg?.timestamp) {
          const ageMs = Date.now() - new Date(recentMsg.timestamp as any).getTime();
          const cooldown = buildStageCooldownDeadline(
            config,
            conversation.followupStage || 0,
            new Date(recentMsg.timestamp as any),
          );
          const cooldownMs = cooldown.nextAllowedAt.getTime() - new Date(recentMsg.timestamp as any).getTime();
          if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < cooldownMs) {
            console.log(`🧊 [USER-FOLLOW-UP] Cooldown ativo (${Math.round(ageMs / 1000)}s desde última msg) para ${conversation.contactNumber}, reagendando`);
            // Reagendar para o fim do cooldown da última mensagem.
            const nextDate = addRandomSeconds(cooldown.nextAllowedAt);
            await db.update(conversations)
              .set({ nextFollowupAt: nextDate })
              .where(eq(conversations.id, conversation.id));
            return;
          }
        }
      } catch (cooldownErr) {
        console.warn('⚠️ [USER-FOLLOW-UP] Falha ao checar cooldown, continuando:', cooldownErr);
      }

      // �🚫 LISTA DE EXCLUSÃO: Verificar se o número está excluído de follow-up
      const isExcludedFromFollowup = await storage.isNumberExcludedFromFollowup(userId, conversation.contactNumber);
      if (isExcludedFromFollowup) {
        console.log(`🚫 [USER-FOLLOW-UP] Número ${conversation.contactNumber} está na LISTA DE EXCLUSÃO - não enviar follow-up`);
        await this.disableFollowUp(conversation.id, "Número na lista de exclusão");
        return;
      }

      // 1. Verificar horário comercial
      if (config.respectBusinessHours && !this.isBusinessHours(config)) {
        console.log(`⏰ [USER-FOLLOW-UP] Fora do horário comercial para ${conversation.contactNumber}`);
        // Agendar para o próximo horário comercial
        const nextBusinessTime = this.getNextBusinessTime(config);
        await this.scheduleNextFollowUp(conversation.id, nextBusinessTime);
        return;
      }

      // 2. Analisar histórico com IA - COM SISTEMA DE REGENERAÇÃO
      // 🔄 NOVO: Tentar até 3x se mensagem for repetitiva, ao invés de simplesmente pular
      let decision = await this.analyzeWithAI(conversation, config);
      let regenerationAttempts = 0;
      const MAX_REGENERATION_ATTEMPTS = 3;
      
      // Se a IA detectou repetição mas action=wait com motivo de repetição, REGENERAR!
      while (
        decision.action === 'wait' && 
        regenerationAttempts < MAX_REGENERATION_ATTEMPTS &&
        (decision.reason.includes('repetida') || 
         decision.reason.includes('similar') || 
         decision.reason.includes('repetitiva') ||
         decision.reason.includes('igual'))
      ) {
        regenerationAttempts++;
        console.log(`🔄 [USER-FOLLOW-UP] Tentativa ${regenerationAttempts}/${MAX_REGENERATION_ATTEMPTS} de regenerar mensagem para ${conversation.contactNumber}`);
        console.log(`   Motivo da regeneração: ${decision.reason}`);
        
        // Chamar IA novamente com contexto de regeneração
        decision = await this.analyzeWithAI(conversation, config, regenerationAttempts);
        
        // Se conseguiu gerar mensagem diferente, sair do loop
        if (decision.action === 'send' && decision.message) {
          console.log(`✅ [USER-FOLLOW-UP] Regeneração ${regenerationAttempts} bem sucedida!`);
          break;
        }
      }
      
      // Se após todas as tentativas ainda está repetindo, logar e pular
      if (regenerationAttempts >= MAX_REGENERATION_ATTEMPTS && decision.action === 'wait') {
        console.warn(`⚠️ [USER-FOLLOW-UP] Após ${MAX_REGENERATION_ATTEMPTS} tentativas, não conseguiu gerar mensagem única para ${conversation.contactNumber}`);
        await this.logFollowUp(conversation, userId, 'skipped', null, decision, `Após ${regenerationAttempts} tentativas: ${decision.reason}`);
        const nextDate = this.buildCurrentStageScheduleDate(conversation, config);
        if (!nextDate) {
          await this.disableFollowUp(conversation.id, "Sequência completa");
          return;
        }
        await this.scheduleNextFollowUp(conversation.id, nextDate);
        return;
      }
      
      if (decision.action === 'abort') {
        console.log(`🛑 [USER-FOLLOW-UP] Abortado pela IA para ${conversation.contactNumber}: ${decision.reason}`);
        await this.disableFollowUp(conversation.id, decision.reason);
        await this.logFollowUp(conversation, userId, 'cancelled', null, decision, decision.reason);
        return;
      }

      // 📅 NOVO: Cliente pediu para retornar em data específica
      if (decision.action === 'schedule' && decision.scheduleDate) {
        const scheduleDate = new Date(decision.scheduleDate);
        console.log(`📅 [USER-FOLLOW-UP] Cliente pediu para retornar em ${scheduleDate.toLocaleDateString('pt-BR')}: ${decision.reason}`);
        await this.scheduleNextFollowUp(conversation.id, scheduleDate);
        await this.logFollowUp(conversation, userId, 'skipped', null, decision, `Reagendado para ${scheduleDate.toLocaleDateString('pt-BR')} conforme combinado`);
        // Atualizar motivo visível
        await db.update(conversations)
          .set({ followupDisabledReason: `📅 Combinado retornar em ${scheduleDate.toLocaleDateString('pt-BR')}` })
          .where(eq(conversations.id, conversation.id));
        return;
      }

      if (decision.action === 'wait') {
        console.log(`⏳ [USER-FOLLOW-UP] IA sugeriu esperar para ${conversation.contactNumber}: ${decision.reason}`);
        if (decision.reason === WAITING_FOR_COMPANY_REPLY_REASON) {
          await this.pauseFollowUpUntilCompanyReply(conversation.id, decision.reason);
          await this.logFollowUp(conversation, userId, 'skipped', null, decision, decision.reason);
          return;
        }
        const nextDate = this.buildCurrentStageScheduleDate(conversation, config);
        if (!nextDate) {
          await this.disableFollowUp(conversation.id, "Sequência completa");
          return;
        }
        await this.scheduleNextFollowUp(conversation.id, nextDate);
        await this.logFollowUp(conversation, userId, 'skipped', null, decision, decision.reason);
        return;
      }

      // 3. Gerar mensagem de follow-up
      if (decision.action === 'send' && decision.message) {
        // ⚠️ VERIFICAÇÃO CRÍTICA: Re-validar estado do followup antes de enviar
        // Evita enviar se usuário desativou followup enquanto IA estava processando
        const [recheck] = await db.select()
          .from(conversations)
          .where(eq(conversations.id, conversation.id))
          .limit(1);
        
        if (!recheck || !recheck.followupActive) {
          console.log(`🛑 [USER-FOLLOW-UP] Follow-up foi DESATIVADO durante processamento para ${conversation.contactNumber} - cancelando envio`);
          return;
        }
        
        // ⚠️ IMPORTANTE: Follow-up é INDEPENDENTE da IA!
        // A desativação da IA (isAgentEnabled) NÃO deve cancelar o follow-up
        // Follow-up só deve ser cancelado quando:
        // 1. Toggle global em /followup está desativado (followup_configs.is_enabled)
        // 2. Toggle individual na conversa está desativado (conversations.followupActive)
        // A IA e o Follow-up são sistemas separados e independentes!
        
        if (await this.pauseIfLatestMessageIsFromClient(conversation, userId, "before_send")) {
          return;
        }

        // 🔒 ANTI-DUPLICAÇÃO: Verificar se mensagem similar já foi enviada recentemente
        if (wasMessageRecentlySent(conversation.id, decision.message)) {
          console.warn(`🔒 [USER-FOLLOW-UP] Mensagem DUPLICADA detectada para ${conversation.contactNumber} - NÃO enviando`);
          const nextDate = this.buildCurrentStageScheduleDate(conversation, config);
          if (!nextDate) {
            await this.disableFollowUp(conversation.id, "Sequência completa");
            return;
          }
          await this.scheduleNextFollowUp(conversation.id, nextDate);
          await this.logFollowUp(conversation, userId, 'skipped', decision.message, decision, 'Mensagem duplicada bloqueada');
          return;
        }
        
        // 3.1 Validação básica de segurança (a IA deve gerar mensagem correta)
        if (!validateMessage(decision.message)) {
          console.warn(`⚠️ [USER-FOLLOW-UP] Mensagem inválida para ${conversation.contactNumber}, reagendando`);
          const nextDate = this.buildCurrentStageScheduleDate(conversation, config);
          if (!nextDate) {
            await this.disableFollowUp(conversation.id, "Sequência completa");
            return;
          }
          await this.scheduleNextFollowUp(conversation.id, nextDate);
          await this.logFollowUp(conversation, userId, 'skipped', decision.message, decision, 'Mensagem inválida');
          return;
        }

        if (conversation.remoteJid) {
          console.log(`📤 [USER-FOLLOW-UP] Disparando follow-up para ${conversation.contactNumber}`);
          
          // 🔧 FIX: Definir nextFollowupAt futuro ANTES de enviar
          // Se advanceToNextStage falhar depois do envio, a conversa
          // não será reprocessada no próximo ciclo (evita duplicatas rápidas)
          const safetyDate = addRandomSeconds(new Date(Date.now() + 60 * 60 * 1000)); // 1h safety
          await db.update(conversations)
            .set({ nextFollowupAt: safetyDate })
            .where(eq(conversations.id, conversation.id));
          
          const result = this.onFollowUpReady
            ? await this.onFollowUpReady(
                userId,
                conversation.id,
                conversation.contactNumber,
                conversation.remoteJid,
                decision.message,
                conversation.followupStage || 0
              )
            : await this.deliverFollowUpMessage(conversation, userId, decision.message, config);

          if (result.success) {
            // ✅ Registrar mensagem enviada no cache anti-duplicação
            registerSentMessage(conversation.id, decision.message);
            
            // Sucesso: Logar e agendar próximo estágio
            await this.logFollowUp(
              conversation, 
              userId, 
              'sent', 
              decision.message,
              decision, 
              undefined
            );
            await this.advanceToNextStage(conversation, config);
            
            // ⚠️ IMPORTANTE: NÃO reativamos a IA automaticamente após follow-up!
            // Follow-up e IA são sistemas INDEPENDENTES:
            // - Se o usuário desativou a IA, ela deve permanecer desativada
            // - O follow-up pode continuar funcionando mesmo com IA desativada
            // - A IA só deve ser reativada quando o usuário ativar manualmente
            console.log(`✅ [USER-FOLLOW-UP] Follow-up enviado para ${conversation.contactNumber} (IA permanece no estado atual)`);
          } else if (result.deferred && result.retryAfterMs) {
            let retryDate = addRandomSeconds(new Date(Date.now() + result.retryAfterMs));
            if (config?.respectBusinessHours) {
              retryDate = this.alignDateToBusinessWindow(retryDate, config);
            }

            console.log(
              `⏳ [USER-FOLLOW-UP] Follow-up adiado para priorizar clientes aguardando resposta: ` +
              `${conversation.contactNumber} por ${Math.ceil(result.retryAfterMs / 1000)}s`,
            );

            await db.update(conversations)
              .set({
                nextFollowupAt: retryDate,
                followupDisabledReason: null,
              })
              .where(eq(conversations.id, conversation.id));

            await this.logFollowUp(
              conversation,
              userId,
              'skipped',
              decision.message,
              decision,
              result.error || `Canal priorizando conversas ativas; novo envio em ${Math.ceil(result.retryAfterMs / 1000)}s`,
            );
          } else {
            // Falha (ex: WhatsApp desconectado): NÃO logar como falha, apenas reagendar
            // Isso evita poluir o histórico com "falhas" que são apenas reconexões
            const isConnectionError = result.error?.toLowerCase().includes('not connected') || 
                                       result.error?.toLowerCase().includes('connection') ||
                                       result.error?.toLowerCase().includes('socket');
            
            if (isConnectionError) {
              // Erro de conexão: reagendar silenciosamente para tentar em 2 minutos
              console.log(`🔄 [USER-FOLLOW-UP] WhatsApp desconectado, reagendando em 2 minutos: ${result.error}`);
              const retryDate = addRandomSeconds(new Date(Date.now() + 2 * 60 * 1000));
              await db.update(conversations)
                .set({ 
                  nextFollowupAt: retryDate,
                  followupDisabledReason: WAITING_FOR_WHATSAPP_CONNECTION_REASON
                })
                .where(eq(conversations.id, conversation.id));
            } else {
              // Outro tipo de erro: logar como falha
              await this.logFollowUp(
                conversation, 
                userId, 
                'failed', 
                decision.message, 
                decision, 
                result.error
              );
              // Reagendar para tentar novamente em 5 minutos
              const retryDate = addRandomSeconds(new Date(Date.now() + 5 * 60 * 1000));
              await db.update(conversations)
                .set({ 
                  nextFollowupAt: retryDate,
                  followupDisabledReason: `⚠️ Erro: ${result.error}`
                })
                .where(eq(conversations.id, conversation.id));
            }
          }
        } else {
          console.warn("⚠️ [USER-FOLLOW-UP] remoteJid ausente para o follow-up");
          // Reagendar para tentar em 5 minutos com segundos aleatórios
          const retryDate = addRandomSeconds(new Date(Date.now() + 5 * 60 * 1000));
          await db.update(conversations)
            .set({ nextFollowupAt: retryDate })
            .where(eq(conversations.id, conversation.id));
        }
      }

    } catch (error) {
      console.error(`❌ [USER-FOLLOW-UP] Erro ao executar para ${conversation.contactNumber}:`, error);
    } finally {
      // 🔓 ANTI-DUPLICAÇÃO: Liberar lock da conversa
      conversationsBeingProcessed.delete(conversation.id);
    }
    });
  }

  /**
   * Busca ou cria configuração de follow-up para o usuário (COM CACHE)
   */
  async getFollowupConfig(userId: string) {
    // 🚀 Verificar cache primeiro
    const cached = followupConfigCache.get(userId);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return cached.data;
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    });
    const shouldBootstrapAlternateAudio = user?.email?.toLowerCase() === FOLLOWUP_PRIORITY_EMAIL;
    
    let config = await db.query.followupConfigs.findFirst({
      where: eq(followupConfigs.userId, userId)
    });

    if (!config) {
      const followupAudioMode: FollowupAudioMode =
        shouldBootstrapAlternateAudio ? "alternate_text_audio" : "text_only";

      // Criar configuração padrão - DESATIVADO por padrão, usuário precisa ativar
      const [newConfig] = await db.insert(followupConfigs).values({
        userId,
        isEnabled: false,
        maxAttempts: 8,
        intervalsMinutes: DEFAULT_INTERVALS,
        businessHoursStart: "09:00",
        businessHoursEnd: "18:00",
        businessDays: [1, 2, 3, 4, 5],
        respectBusinessHours: true,
        tone: "consultivo",
        formalityLevel: 5,
        useEmojis: true,
        importantInfo: [],
        infiniteLoop: true,
        infiniteLoopMinDays: 15,
        infiniteLoopMaxDays: 30,
        followupAudioMode,
      }).returning();
      config = newConfig;
    } else if (shouldBootstrapAlternateAudio && config.followupAudioMode === "text_only") {
      const [updatedConfig] = await db
        .update(followupConfigs)
        .set({
          followupAudioMode: "alternate_text_audio",
          updatedAt: new Date(),
        })
        .where(eq(followupConfigs.userId, userId))
        .returning();

      config = updatedConfig;
    }

    // 🚀 Salvar no cache
    followupConfigCache.set(userId, { data: config, timestamp: Date.now() });
    
    return config;
  }

  /**
   * Atualiza configuração de follow-up (invalida cache)
   */
  async updateFollowupConfig(userId: string, data: Partial<typeof followupConfigs.$inferInsert>) {
    // 🚀 Invalidar cache ao atualizar
    followupConfigCache.delete(userId);
    
    // Remover campos que não devem ser atualizados pelo frontend
    const { id, userId: _, createdAt, updatedAt, ...cleanData } = data as any;
    
    const existing = await db.query.followupConfigs.findFirst({
      where: eq(followupConfigs.userId, userId)
    });

    const wasEnabledBefore = existing?.isEnabled !== false;
    const willBeEnabled = cleanData.isEnabled === undefined
      ? wasEnabledBefore
      : cleanData.isEnabled !== false;

    let result;
    if (existing) {
      const [updated] = await db.update(followupConfigs)
        .set({ ...cleanData, updatedAt: new Date() })
        .where(eq(followupConfigs.userId, userId))
        .returning();
      
      // 🚀 Atualizar cache
      followupConfigCache.set(userId, { data: updated, timestamp: Date.now() });
      result = updated;
    } else {
      const [created] = await db.insert(followupConfigs)
        .values({ userId, ...cleanData })
        .returning();
      
      // 🚀 Salvar no cache
      followupConfigCache.set(userId, { data: created, timestamp: Date.now() });
      result = created;
    }

    // 🔧 FIX CRÍTICO 2026-02-26: Quando o follow-up global é DESATIVADO,
    // desativar TODAS as conversas ativas desse usuário IMEDIATAMENTE!
    // Isso evita que follow-ups continuem sendo enviados após o usuário desativar.
    if (false && cleanData.isEnabled === false) {
      console.log(`🛑 [USER-FOLLOW-UP] Follow-up GLOBAL desativado pelo usuário ${userId}. Desativando TODAS as conversas ativas...`);
      try {
        // Buscar todas as conexões do usuário
        const userConnections = await db.query.whatsappConnections.findMany({
          where: eq(whatsappConnections.userId, userId)
        });
        
        const connectionIds = userConnections.map(c => c.id);
        
        if (connectionIds.length > 0) {
          // Desativar follow-up em todas as conversas ativas dessas conexões
          for (const connId of connectionIds) {
            await db.update(conversations)
              .set({ 
                followupActive: false, 
                nextFollowupAt: null,
                followupDisabledReason: 'Usuário desativou follow-up global'
              })
              .where(
                and(
                  eq(conversations.connectionId, connId),
                  eq(conversations.followupActive, true)
                )
              );
          }
          console.log(`✅ [USER-FOLLOW-UP] Todas as conversas ativas do usuário ${userId} foram desativadas.`);
        }
      } catch (err) {
        console.error(`❌ [USER-FOLLOW-UP] Erro ao desativar conversas ativas:`, err);
      }
    }

    if (wasEnabledBefore && cleanData.isEnabled === false) {
      console.log(`ðŸ›‘ [USER-FOLLOW-UP] Follow-up GLOBAL desativado pelo usuÃ¡rio ${userId}. Pausando conversas ativas com snapshot...`);
      try {
        const paused = await this.pauseActiveConversationsForGlobalDisable(userId);
        console.log(`âœ… [USER-FOLLOW-UP] ${paused} conversas do usuÃ¡rio ${userId} foram pausadas com snapshot da agenda.`);
      } catch (err) {
        console.error(`âŒ [USER-FOLLOW-UP] Erro ao pausar conversas ativas:`, err);
      }
    }

    if (!wasEnabledBefore && willBeEnabled) {
      try {
        const restored = await this.restoreGlobalDisabledConversations(userId, result);
        console.log(`âœ… [USER-FOLLOW-UP] Follow-up GLOBAL reativado para ${userId}. ${restored.restored} conversas restauradas, ${restored.skipped} ignoradas.`);
      } catch (err) {
        console.error(`âŒ [USER-FOLLOW-UP] Erro ao restaurar conversas pausadas globalmente:`, err);
      }
    }

    return result;
  }

  /**
   * Usa IA para analisar se deve enviar follow-up e qual mensagem
   * VERSÃO MELHORADA: Lê contexto completo, entende o negócio, evita repetições
   * @param regenerationAttempt - Número da tentativa de regeneração (0 = primeira vez)
   */
  private async analyzeWithAI(conversation: any, config: any, regenerationAttempt: number = 0): Promise<{
    action: 'send' | 'wait' | 'abort' | 'schedule';
    reason: string;
    message?: string;
    context?: string;
    scheduleDate?: string;
  }> {
    // Buscar mensagens recentes - AUMENTADO para ter contexto COMPLETO da conversa
    // Isso é essencial para o follow-up entender onde a conversa parou
    const recentMessages = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversation.id),
      orderBy: (messages, { desc }) => [desc(messages.timestamp)],
      limit: 40 // Aumentado para 40 mensagens para contexto completo
    });

    // Buscar configuração do agente para entender o negócio
    const userId = conversation.connection?.userId;
    let businessContext = "";
    let agentName = "";
    let companyName = "";
    let agentPromptContext = "";
    
    if (userId) {
      try {
        const agentPromptConfig = await getCachedAgentPromptConfig(userId);
        if (agentPromptConfig?.prompt) {
          const trimmedAgentPrompt = agentPromptConfig.prompt.length > 4500
            ? `${agentPromptConfig.prompt.slice(0, 4500).trim()}\n...[continua]`
            : agentPromptConfig.prompt;

          agentPromptContext = `
REGRAS REAIS DO AGENTE DESTA CONTA:
- Agente principal ativo: ${agentPromptConfig.isActive ? "SIM" : "NÃO"}
- Fluxo guiado ativo: ${agentPromptConfig.flowModeActive ? "SIM" : "NÃO"}
${agentPromptConfig.flowScript ? "- Existe um roteiro/fluxo salvo para esse agente.\n" : ""}
PROMPT OPERACIONAL DO AGENTE:
${trimmedAgentPrompt}
`;
        }

        const businessConfig = await db.query.businessAgentConfigs.findFirst({
          where: eq(businessAgentConfigs.userId, userId)
        });
        
        if (businessConfig) {
          agentName = businessConfig.agentName || "";
          companyName = businessConfig.companyName || "";
          const products = businessConfig.productsServices || [];
          const productsList = Array.isArray(products) && products.length > 0
            ? products.map((p: any) => `- ${p.name}: ${p.description || ''} ${p.price ? `(${p.price})` : ''}`).join('\n')
            : '';
          
          businessContext = `
SOBRE O NEGÓCIO:
- Empresa: ${companyName || 'Não informado'}
- Agente: ${agentName || 'Assistente'}
- Cargo: ${businessConfig.agentRole || 'Assistente Virtual'}
- Descrição: ${businessConfig.companyDescription || 'Não informada'}
${productsList ? `\nPRODUTOS/SERVIÇOS:\n${productsList}` : ''}
`;
        }
      } catch (e) {
        console.warn("Erro ao buscar business config:", e);
      }
    }

    // Formatar histórico de forma limpa e completa
    const historyFormatted = [...recentMessages]
      .reverse()
      .map(m => {
        let content = m.text || '';
        // Se é mídia sem texto, indicar de forma natural
        if (!content && m.mediaType) {
          if (m.mediaType === 'audio') content = '(cliente enviou um áudio)';
          else if (m.mediaType === 'image') content = '(cliente enviou uma imagem)';
          else if (m.mediaType === 'video') content = '(cliente enviou um vídeo)';
          else if (m.mediaType === 'document') content = '(cliente enviou um documento)';
          else content = '(cliente enviou uma mídia)';
        }
        // Limpar a palavra "Áudio" que pode ter ficado
        content = content.replace(/\s*Áudio\s*$/gi, '').trim();
        content = content.replace(/\s*Audio\s*$/gi, '').trim();
        
        return {
          de: m.fromMe ? "NÓS" : "CLIENTE",
          mensagem: content,
          hora: m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
        };
      });

    // Calcular tempo desde última mensagem
    const lastClientMessage = recentMessages.find(m => !m.fromMe);
    const lastOurMessage = recentMessages.find(m => m.fromMe);
    const lastClientTime = lastClientMessage?.timestamp ? new Date(lastClientMessage.timestamp) : null;
    const lastOurTime = lastOurMessage?.timestamp ? new Date(lastOurMessage.timestamp) : null;
    const now = new Date();
    
    // Data atual em formato brasileiro
    const brazilNow = toBrazilWallClockDate(now);
    const todayStr = brazilNow.toLocaleDateString('pt-BR');
    const dayOfWeek = brazilNow.getDay();
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const todayName = dayNames[dayOfWeek];
    
    const minutesSinceClient = lastClientTime 
      ? Math.floor((now.getTime() - lastClientTime.getTime()) / (1000 * 60)) 
      : 9999;
    const minutesSinceOur = lastOurTime 
      ? Math.floor((now.getTime() - lastOurTime.getTime()) / (1000 * 60)) 
      : 9999;
    const silenceThresholdMinutes = getConfiguredDelayMinutesForStage(config, conversation.followupStage || 0);
    
    // Determinar quem falou por último
    const lastMessageWasOurs = lastOurTime && lastClientTime ? lastOurTime > lastClientTime : !!lastOurTime;
    const decisionWindow = resolveUserFollowUpDecisionWindow({
      lastMessageWasOurs,
      minutesSinceOur,
      minutesSinceClient,
      thresholdMinutes: silenceThresholdMinutes,
    });
    const authoritativeSilenceMinutes = decisionWindow.authoritativeSilenceMinutes;
    const allowedActionsLabel = decisionWindow.allowedActions.map((action) => action.toUpperCase()).join(", ");
    const orchestratorGuardBlock =
      decisionWindow.state === "awaiting_company_reply"
        ? `## 🚦 RESTRIÇÃO DO ORQUESTRADOR
- O cliente foi o último a falar.
- Follow-up está BLOQUEADO até a empresa responder.
- A única action válida agora é WAIT.`
        : decisionWindow.state === "cooldown_after_company_reply"
          ? `## 🚦 RESTRIÇÃO DO ORQUESTRADOR
- Nós falamos por último.
- Ainda NÃO passaram ${silenceThresholdMinutes} minutos desde a nossa última mensagem.
- SEND está proibido agora.
- Ações válidas neste momento: ${allowedActionsLabel}.`
          : `## 🚦 RESTRIÇÃO DO ORQUESTRADOR
- Nós falamos por último.
- Já passaram pelo menos ${silenceThresholdMinutes} minutos desde a nossa última mensagem.
- WAIT está proibido nesta situação.
- Ações válidas neste momento: ${allowedActionsLabel}.`;
     
    // Nome do cliente (do WhatsApp)
    const clientName = conversation.contactName || '';
    
    // Pegar últimas 5 mensagens que enviamos para evitar repetição
    const ourLastMessages = recentMessages
      .filter(m => m.fromMe && m.text)
      .slice(0, 5)
      .map(m => m.text?.replace(/\s*Áudio\s*$/gi, '').trim());

    const recentSentFollowupLogs = await db.query.userFollowupLogs.findMany({
      where: and(
        eq(userFollowupLogs.conversationId, conversation.id),
        eq(userFollowupLogs.status, "sent"),
      ),
      orderBy: (logs, { desc }) => [desc(logs.executedAt)],
      limit: 8,
    });

    const recentOutboundHistory = [...ourLastMessages];
    for (const log of recentSentFollowupLogs) {
      const messageContent = String(log.messageContent || "").trim();
      if (!messageContent) {
        continue;
      }

      const isAlreadyTracked = recentOutboundHistory.some((existing) =>
        buildOutgoingMessageFingerprint(existing) ===
        buildOutgoingMessageFingerprint(messageContent),
      );

      if (!isAlreadyTracked) {
        recentOutboundHistory.push(messageContent);
      }
    }

    // Identificar se o cliente reclamou ou deu feedback negativo
    const clientFeedback = recentMessages
      .filter(m => !m.fromMe && m.text)
      .map(m => m.text?.toLowerCase() || '')
      .join(' ');
    
    const hasNegativeFeedback = 
      clientFeedback.includes('repetiu') ||
      clientFeedback.includes('repetindo') ||
      clientFeedback.includes('sem ler') ||
      clientFeedback.includes('não leu') ||
      clientFeedback.includes('lendo') ||
      clientFeedback.includes('mesmo texto') ||
      clientFeedback.includes('já disse') ||
      clientFeedback.includes('já falei');
    
    // 🔴 DETECÇÃO DE CLIENTE IRRITADO - DESATIVA AUTOMATICAMENTE O FOLLOW-UP
    const clientIrritadoPhrases = [
      'para de mandar', 'pare de mandar', 'para de enviar', 'pare de enviar',
      'não manda mais', 'não mande mais', 'não envia mais', 'não envie mais',
      'chega de mensagem', 'para com isso', 'pare com isso',
      'me deixa em paz', 'deixa em paz', 'saco cheio', 'encheu o saco',
      'irritado', 'irritada', 'p*rra', 'porra', 'caralho', 'merda',
      'não quero mais', 'não quero saber', 'desiste', 'desista',
      'bloquear', 'vou bloquear', 'vou te bloquear',
      'spam', 'isso é spam', 'tá spamando', 'spamando',
      'para de insistir', 'pare de insistir', 'já disse não', 'já falei não',
      'não me manda', 'não me mande', 'não me envia', 'não me envie',
      'cansa', 'cansado', 'cansada', 'chato', 'chata', 'chatice',
      'que saco', 'que droga', 'pqp', 'vsf', 'vai se',
      'não enche', 'não encha', 'me esquece', 'esquece de mim',
      'some daqui', 'sai fora', 'vai embora',
      'número errado', 'engano', 'não te conheço', 'quem é você'
    ];
    
    const isClientIrritado = clientIrritadoPhrases.some(phrase => 
      clientFeedback.includes(phrase)
    );
    
    // 🔴 Se cliente está irritado, desativar follow-up IMEDIATAMENTE
    if (isClientIrritado) {
      console.log(`🔴 [USER-FOLLOW-UP] CLIENTE IRRITADO detectado para ${conversation.contactNumber}!`);
      console.log(`   Frase detectada no histórico: "${clientFeedback.slice(0, 200)}..."`);
      return {
        action: 'abort',
        reason: 'Cliente demonstrou irritação/desejo de não receber mais mensagens - follow-up desativado automaticamente'
      };
    }

    if (decisionWindow.state === "awaiting_company_reply") {
      console.log(`⏸️ [FOLLOW-UP] Cliente foi o último a falar há ${minutesSinceClient}min - pausando follow-up até a empresa responder`);
      return { action: 'wait', reason: WAITING_FOR_COMPANY_REPLY_REASON };
    }

    // Extrair última mensagem do cliente para contexto
    const lastClientText = lastClientMessage?.text?.replace(/\s*Áudio\s*$/gi, '').trim() || '';
    let realEstatePromptBlock = "";

    const realEstateConversationHistory = buildRealEstateConversationContext(
      [...recentMessages]
        .reverse()
        .map((message) => ({
          text: String(message.text || "").trim(),
          fromMe: message.fromMe,
          isFromAgent: message.isFromAgent,
        })),
    );

    const toneMap: Record<string, string> = {
      'consultivo': 'consultivo e prestativo',
      'vendedor': 'vendedor persuasivo mas sutil',
      'humano': 'casual e amigável',
      'técnico': 'profissional e direto'
    };

    // Identificar o último assunto/tópico da conversa
    const lastTopics = historyFormatted.slice(-5).map(h => h.mensagem).join(' ');

    if (userId) {
      try {
        const realEstateCatalog = await getGrupoOlxCatalogForAI(
          userId,
          [lastClientText, lastTopics, conversation.contactName || ""].filter(Boolean).join(" "),
          {
            conversationHistory: realEstateConversationHistory,
          },
        );

        if (realEstateCatalog?.active) {
          realEstatePromptBlock = generateGrupoOlxCatalogPromptBlock(realEstateCatalog);
        }
      } catch (error) {
        console.warn("[USER-FOLLOW-UP] Erro ao carregar regras da imobiliaria:", error);
      }
    }
    
    // Verificar se já oferecemos algo específico
    const offeredDemo = recentOutboundHistory.some(m => m?.toLowerCase().includes('demo') || m?.toLowerCase().includes('vídeo') || m?.toLowerCase().includes('teste'));
    const offeredPrice = recentOutboundHistory.some(m => m?.toLowerCase().includes('99') || m?.toLowerCase().includes('199') || m?.toLowerCase().includes('preço') || m?.toLowerCase().includes('plano'));
    const askedQuestion = ourLastMessages[0]?.includes('?');
    
    // 🔴 Verificar se conversamos hoje (para evitar saudações)
    const lastOurMessageToday = recentMessages.find(m => {
      if (!m.fromMe || !m.timestamp) return false;
      const msgDate = new Date(m.timestamp);
      const msgDay = msgDate.toLocaleDateString('pt-BR');
      return msgDay === todayStr;
    });
    const conversedToday = !!lastOurMessageToday;
    
    // 🔄 Contexto de regeneração (quando estamos tentando novamente)
    const regenerationContext = regenerationAttempt > 0 ? `

🔴🔴🔴 **ATENÇÃO CRÍTICA - TENTATIVA ${regenerationAttempt} DE REGENERAÇÃO** 🔴🔴🔴
A mensagem que você gerou na tentativa anterior FOI REJEITADA por ser muito similar às mensagens anteriores.
VOCÊ PRECISA SER COMPLETAMENTE DIFERENTE AGORA!

REGRAS EXTRAS PARA REGENERAÇÃO:
1. Use uma ABORDAGEM TOTALMENTE DIFERENTE (se perguntou antes, agora ofereça algo; se ofereceu, agora pergunte)
2. NÃO use NENHUMA das frases das mensagens anteriores
3. Seja mais CURTO e DIRETO (máximo 1-2 frases)
4. Tente um ÂNGULO NOVO: benefício diferente, informação nova, pergunta criativa
5. Se estágio > 2, tente algo mais criativo como compartilhar um case, estatística interessante, ou novidade

EXEMPLOS DE VARIAÇÃO (use como inspiração, não copie):
- Estágio 1: "Ficou alguma dúvida sobre o que conversamos?"
- Estágio 2: "Conseguiu dar uma olhada naquilo?"  
- Estágio 3: "Surgiu algo novo aqui que pode te interessar..."
- Estágio 4: "Tô terminando o expediente, quer que eu te mande mais info amanhã?"
` : '';

    const prompt = `## 📌 O QUE É FOLLOW-UP INTELIGENTE

FOLLOW-UP = AQUECER O LEAD de forma NATURAL, como se fosse um amigo ou vendedor experiente retomando contato.

🎯 **OBJETIVO**: Fazer o cliente RESPONDER sem parecer insistente ou robótico.

---

## 🎯 SUA IDENTIDADE
- Você é: ${agentName || 'Assistente Virtual'} da ${companyName || 'empresa'}
${businessContext}
${agentPromptContext}

## 📅 MOMENTO ATUAL
- Data: ${todayStr} (${todayName})  
- Hora: ${brazilNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
- Já conversamos HOJE: **${conversedToday ? 'SIM - NÃO cumprimentar de novo!' : 'NÃO'}**

## 👤 CLIENTE: ${clientName || 'Não identificado'}

${realEstatePromptBlock ? `## 🏠 REGRAS DA IMOBILIARIA\n${realEstatePromptBlock}\n` : ''}

## ⏰ ANÁLISE TEMPORAL
- CLIENTE respondeu há: **${minutesSinceClient} minutos** (${Math.floor(minutesSinceClient/60)}h ${minutesSinceClient % 60}min)
- NÓS enviamos há: **${minutesSinceOur} minutos**
- Quem falou por ÚLTIMO: **${lastMessageWasOurs ? '⚠️ NÓS (cliente não respondeu)' : '🟢 CLIENTE'}**
- Estágio: ${conversation.followupStage || 0}
${hasNegativeFeedback ? '\n⛔ **ALERTA**: Cliente reclamou de repetições!' : ''}
${regenerationContext}

## 💬 HISTÓRICO DA CONVERSA (LEIA COM ATENÇÃO!)
${historyFormatted.map(h => `[${h.hora}] ${h.de}: ${h.mensagem}`).join('\n')}

## 🚫 MENSAGENS ANTERIORES (EVITE COMPLETAMENTE!)
${recentOutboundHistory.length > 0 ? recentOutboundHistory.map((m, i) => `${i+1}. "${m}"`).join('\n') : '(nenhuma)'}

## 📊 CONTEXTO
- Última fala do cliente: "${lastClientText}"
- Oferecemos demo/teste: ${offeredDemo ? 'SIM' : 'NÃO'}
- Falamos de preço: ${offeredPrice ? 'SIM' : 'NÃO'}
- Relógio relevante para follow-up agora: "${lastMessageWasOurs ? 'tempo desde a última mensagem da empresa' : 'tempo desde a última mensagem do cliente'}"
- Minutos relevantes para a decisão: ${authoritativeSilenceMinutes}
- Ações válidas agora: ${allowedActionsLabel}

---

## 🎯 REGRAS DE DECISÃO

${orchestratorGuardBlock}

${decisionWindow.state === "eligible_after_company_reply"
  ? `### SEND - Enviar quando:
- Nós falamos por último
- Já se passaram pelo menos ${silenceThresholdMinutes} minutos desde NOSSA última mensagem
- Temos algo NOVO para falar
- Conversa não teve fechamento negativo

### SCHEDULE - Agendar quando:
- Cliente combinou retorno em outra data/período específico
- Faz mais sentido voltar em outro momento do que responder agora

### ABORT - Cancelar quando:
- Cliente disse NÃO claramente
- Cliente demonstrou irritação
- Cliente pediu para parar de enviar mensagens`
  : `### WAIT - Esperar quando:
- Cliente respondeu há menos de ${silenceThresholdMinutes} minutos
- Nós enviamos há menos de ${silenceThresholdMinutes} minutos sem resposta
- Não temos nada novo para agregar

### SCHEDULE - Agendar quando:
- Cliente combinou retorno em outra data/período específico

### ABORT - Cancelar quando:
- Cliente disse NÃO claramente
- Cliente demonstrou irritação
- Cliente pediu para parar de enviar mensagens`}

---

## ✍️ COMO ESCREVER A MENSAGEM

⛔ **PROIBIDO** (NUNCA FAÇA):
${conversedToday ? '- NUNCA use "Oi", "Olá", "Bom dia/tarde/noite" - JÁ CONVERSAMOS HOJE!' : ''}
- NUNCA repita mensagens anteriores (nem com palavras diferentes)
- NUNCA use frases genéricas como "passo a passo", "entendi", "fico à disposição"
- NUNCA se apresente de novo (sem "sou X da empresa Y")
- NUNCA seja robótico ou formal demais
- NUNCA escreva bastidores da tarefa, como "Entendi", "aqui vai", "segue uma sugestão", "retomada natural", "mensagem para o cliente" ou qualquer explicação sobre a mensagem.
- NUNCA use título, introdução, separador, markdown, aspas em volta da mensagem, rascunho, comentário ou justificativa dentro do campo "message".
- NUNCA diga que entendeu o pedido do sistema. O cliente final não pode ver que você recebeu instruções.
- NUNCA use a mesma abertura, mesma pergunta ou mesma estrutura dos follow-ups anteriores. Se a ideia for parecida, mude o ângulo real da conversa, não apenas as palavras.
- NUNCA cumprimente de novo no mesmo dia. Se já houve conversa hoje, vá direto ao ponto.

✅ **OBRIGATÓRIO** (SEMPRE FAÇA):
- Continue o ASSUNTO da conversa naturalmente
- Seja CURTO (1-2 frases no máximo)
- Pareça HUMANO, como um amigo/vendedor real
- Traga VALOR NOVO ou pergunta DIFERENTE: reduza risco, mostre benefício específico, sugira próximo passo pequeno, tire uma objeção ou pergunte algo que avance a decisão.
- Aqueça o cliente com contexto real do histórico. Não mande "só passando para saber" quando já existe assunto melhor para continuar.
- Use o NOME do cliente se souber
- A regra de links abaixo tem prioridade sobre textos prontos/exatos que contenham URL: preserve o conteudo, mas ajuste a separacao da URL com [BOLHA].
- Se for realmente necessário enviar uma URL/link existente no prompt, histórico ou contexto, escreva primeiro a mensagem sem URL, depois use [BOLHA] e coloque a URL sozinha na próxima bolha.
- Nunca invente link e nunca force link quando o cliente/prompt não tiver um link aplicável.
- A bolha do link deve conter somente a URL, sem frase, emoji, pontuação ou outro texto. O sistema envia sem preview; por isso a URL precisa ficar visível e clara.
- Quando usar URL com domínio simples, prefira o formato completo com https://www. para o cliente leigo reconhecer que é um link.
- Quando enviar link, encerre a resposta no link. Nao continue com pergunta, CTA ou complemento depois da URL.
- Se precisar continuar depois do link, use outra [BOLHA] apos a URL: "Texto antes[BOLHA]https://exemplo.com[BOLHA]Pergunta final".
- Nunca escreva pergunta, CTA ou complemento na mesma bolha da URL.
- Se for imobiliaria, nao invente valor de imovel e nao cite preco em follow-up sem confirmacao explicita no catalogo ou no historico
- Se for imobiliaria e o anuncio ja estiver ancorado no historico, continue falando do MESMO imovel.
- Se for imobiliaria, nunca troque endereco, codigo, bairro, metragem, dormitorios, vagas, preco ou link por outro anuncio sem o cliente pedir alternativas explicitamente.
- Se faltar algum detalhe do imovel, diga apenas que vai confirmar a atualizacao. Nunca invente.
- O campo "message" deve ser somente o texto exato que será enviado no WhatsApp para o cliente, sem nenhuma frase antes ou depois.

🌟 **EXEMPLOS DE MENSAGENS BOAS** (adapte ao contexto):
- "E aí [nome], conseguiu pensar sobre aquilo?"
- "Vi que ficou uma dúvida sobre X, quer que eu explique melhor?"
- "Surgiu uma novidade aqui que achei sua cara..."
- "Opa, tava aqui pensando no seu caso..."
- "[nome], rápido: ainda faz sentido aquilo pra você?"

**Tom**: ${toneMap[config.tone] || 'casual e amigável'}
**Emojis**: ${config.useEmojis ? 'Pode usar 1 emoji no máximo' : 'NÃO use emojis'}

---

## 📋 RESPONDA APENAS EM JSON:
{"action":"${decisionWindow.allowedActions.join("|")}","reason":"motivo curto","message":"texto (só se send)","scheduleDate":"YYYY-MM-DDTHH:MM (só se schedule)"}`;

    try {
      const mistral = await getLLMClient();
      // Usa modelo configurado no banco de dados (sem hardcode)
      const response = await mistral.chat.complete({
        messages: [{ role: "user", content: prompt }],
        temperature: realEstatePromptBlock ? 0.1 : 0.8
      });
      
      const rawContent = response.choices?.[0]?.message?.content || "";
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Tentar parsear JSON
      const parsed = JSON.parse(jsonStr);

      if (!decisionWindow.allowedActions.includes(parsed.action)) {
        if (decisionWindow.state === "cooldown_after_company_reply") {
          return {
            action: 'wait',
            reason: `Ainda não passaram ${silenceThresholdMinutes} minutos desde a última mensagem da empresa`,
          };
        }

        if (decisionWindow.state === "eligible_after_company_reply") {
          console.warn(
            `[USER-FOLLOW-UP] IA retornou action inválida (${parsed.action}) em janela elegível para ${conversation.contactNumber}. Reagendando para nova tentativa controlada.`,
          );
          const fallbackDate = this.buildCurrentStageScheduleDate(conversation, config);
          return {
            action: 'schedule',
            reason: parsed.reason || 'Janela elegível após resposta da empresa, mas a IA não retornou uma action compatível',
            scheduleDate: (fallbackDate || new Date(now.getTime() + silenceThresholdMinutes * 60 * 1000)).toISOString(),
          };
        }

        return { action: 'wait', reason: WAITING_FOR_COMPANY_REPLY_REASON };
      }
      
      // Se action é schedule, validar a data
      if (parsed.action === 'schedule' && parsed.scheduleDate) {
        const scheduleDate = new Date(parsed.scheduleDate);
        if (isNaN(scheduleDate.getTime())) {
          console.warn(`⚠️ [FOLLOW-UP] Data inválida retornada pela IA: ${parsed.scheduleDate}`);
          return { action: 'wait', reason: 'Data de agendamento inválida' };
        }
        // Se a data é no passado, ajustar para o futuro
        if (scheduleDate < now) {
          scheduleDate.setDate(scheduleDate.getDate() + 7);
        }
        return {
          action: 'schedule',
          reason: parsed.reason || 'Cliente combinou data',
          scheduleDate: scheduleDate.toISOString(),
          context: parsed.strategy
        };
      }
      
      // Validar e limpar mensagem gerada
      let message = parsed.message;
      if (message) {
        // Remover colchetes e conteúdo problemático
        message = message.replace(/\[.*?\]/g, '').trim();
        // Remover opções com barra
        message = message.replace(/\b\w+\/\w+(\/\w+)*/g, '').trim();
        // Remover "Áudio" do final
        message = message.replace(/\s*Áudio\s*$/gi, '').trim();
        message = message.replace(/\s*Audio\s*$/gi, '').trim();
        
        // 🔧 FIX 2026-02-26: Remover padrões de traços que parecem IA/GPT
        // Traços consecutivos (---, -----, etc)
        message = message.replace(/\-{2,}/g, '');
        // Bullet dash no início de linha: "- item" → "• item"  
        message = message.replace(/^[\s]*-\s+/gm, '• ');
        // Em-dash como separador: " — " → ", "
        message = message.replace(/\s*—\s*/g, ', ');
        // En-dash como separador: " – " → ", "
        message = message.replace(/\s*–\s*/g, ', ');
        // Traço isolado como separador: " - " → ", " (cuidado com palavras compostas)
        message = message.replace(/(?<=[a-záéíóúàâêôãõ\s])\s+-\s+(?=[a-záéíóúàâêôãõA-Z])/g, ', ');
        // Separadores como ━━━, ═══, ─── 
        message = message.replace(/^[\s]*[━═─_*]{3,}[\s]*$/gm, '');
        // Limpar vírgulas duplicadas e espaços extras
        message = message.replace(/,\s*,/g, ',');
        message = message.replace(/^\s*,\s*/gm, '');
        
        // Limpar espaços duplos
        message = message.replace(/\s+/g, ' ').trim();

        // 🔧 VERIFICAÇÃO MELHORADA DE REPETIÇÃO - THRESHOLD AUMENTADO PARA 60%
        // Verificar se é muito similar a mensagens anteriores
        const exactDuplicate = recentOutboundHistory.find((prev) =>
          buildOutgoingMessageFingerprint(prev) === buildOutgoingMessageFingerprint(message),
        );

        if (exactDuplicate) {
          console.warn(`⚠️ [FOLLOW-UP] Mensagem EXATAMENTE repetida - NÃO ENVIANDO`);
          return {
            action: 'wait',
            reason: 'Mensagem exatamente igual a uma anterior - gerar follow-up novo',
          };
        }

        const isSimilar = recentOutboundHistory.some(prev => {
          if (!prev) return false;
          const similarity = this.calculateTextSimilarity(message, prev);
          console.log(`📊 Similaridade com msg anterior: ${(similarity * 100).toFixed(1)}%`);
          return similarity >= 0.82 || isOutgoingMessageNearDuplicate(message, prev, 0.82);
        });
        
        if (isSimilar) {
          console.warn(`⚠️ [FOLLOW-UP] Mensagem SIMILAR detectada (>60%) - NÃO ENVIANDO`);
          return { action: 'wait', reason: 'Mensagem muito similar à anterior - evitando repetição' };
        }
        
        // Verificar se a mensagem parece repetitiva (mesma estrutura)
        const sameStructure = recentOutboundHistory.some(prev => {
          if (!prev) return false;
          // Se começa igual (primeiras 30 chars) ou termina igual (últimas 30 chars)
          const msgStart = message.substring(0, 30).toLowerCase();
          const msgEnd = message.substring(Math.max(0, message.length - 30)).toLowerCase();
          const prevStart = prev.substring(0, 30).toLowerCase();
          const prevEnd = prev.substring(Math.max(0, prev.length - 30)).toLowerCase();
          
          const startSame = msgStart === prevStart && msgStart.length > 12;
          const endSame = msgEnd === prevEnd && msgEnd.length > 12;
          
          if (startSame || endSame) {
            console.log(`📊 Estrutura similar: início=${startSame}, fim=${endSame}`);
          }
          return startSame || endSame;
        });
        
        if (sameStructure) {
          console.warn(`⚠️ [FOLLOW-UP] Estrutura REPETITIVA - NÃO ENVIANDO`);
          return { action: 'wait', reason: 'Estrutura de mensagem repetitiva - evitando irritar cliente' };
        }
        
        // Verificar se contém frases exatamente iguais de msgs anteriores
        const hasExactPhrase = recentOutboundHistory.some(prev => {
          if (!prev || prev.length < 20) return false;
          // Dividir em frases e verificar se alguma é igual
          const prevPhrases = prev.split(/[.!?]/).filter((p: string) => p.trim().length > 12);
          const newPhrases = message.split(/[.!?]/).filter((p: string) => p.trim().length > 12);
          
          return newPhrases.some((np: string) => 
            prevPhrases.some((pp: string) => 
              np.trim().toLowerCase() === pp.trim().toLowerCase()
            )
          );
        });
        
        if (hasExactPhrase) {
          console.warn(`⚠️ [FOLLOW-UP] Frase EXATA repetida - NÃO ENVIANDO`);
          return { action: 'wait', reason: 'Contém frase exatamente igual a anterior' };
        }
        
        // 🆕 VERIFICAÇÃO EXTRA: Palavras-chave muito repetidas
        const keyPhrases = ['entendi', 'vamos resolver', 'passo a passo', 'fico feliz', 'estou à disposição'];
        const msgLower = message.toLowerCase();
        for (const phrase of keyPhrases) {
          const usedBefore = recentOutboundHistory.some(prev => prev?.toLowerCase().includes(phrase));
          if (usedBefore && msgLower.includes(phrase)) {
            console.warn(`⚠️ [FOLLOW-UP] Frase "${phrase}" já usada antes - NÃO ENVIANDO`);
            return { action: 'wait', reason: `Frase "${phrase}" repetida - gerar mensagem diferente` };
          }
        }
      }
      
      return {
        action: parsed.action || 'wait',
        reason: parsed.reason || 'Decisão da IA',
        message: message,
        context: parsed.strategy
      };
    } catch (e) {
      console.error("Erro na análise de IA:", e);
      return { action: 'wait', reason: "Erro na análise de IA" };
    }
  }
  
  /**
   * Calcula similaridade entre dois textos (0 a 1)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    return calculateOutgoingMessageSimilarity(text1, text2);
  }

  /**
   * Verifica se está em horário comercial (timezone Brasil)
   */
  private isBusinessHours(config: any): boolean {
    return isWithinBusinessHours(config, new Date());
  }

  /**
   * Calcula próximo horário comercial disponível (timezone Brasil)
   */
  private getNextBusinessTime(config: any): Date {
    return getConfiguredNextBusinessTime(config, new Date());
  }

  private alignDateToBusinessWindow(candidate: Date, config: any): Date {
    return alignConfiguredDateToBusinessWindow(candidate, config);
  }

  private buildMissingScheduleDate(conversation: any, config: any, now: Date = new Date()): Date | null {
    const baseTimestamp = conversation.lastMessageTime || conversation.createdAt || now;
    return buildMissingFollowUpScheduleDate({
      config,
      currentStage: Math.max(0, Number(conversation.followupStage || 0)),
      baseDate: new Date(baseTimestamp),
      now,
    });
  }

  private async pauseActiveConversationsForGlobalDisable(userId: string) {
    const userConnections = await db.query.whatsappConnections.findMany({
      where: eq(whatsappConnections.userId, userId),
    });
    const connectionIds = new Set(userConnections.map((connection) => connection.id));

    const activeConversations = await db.query.conversations.findMany({
      where: eq(conversations.followupActive, true),
    });

    const userConversations = activeConversations.filter((conversation) => connectionIds.has(conversation.connectionId));
    let paused = 0;

    for (const conversation of userConversations) {
      const disabledReason = buildGlobalFollowUpPauseReason({
        currentStage: conversation.followupStage,
        nextFollowupAt: conversation.nextFollowupAt,
      });

      await db.update(conversations)
        .set({
          followupActive: false,
          nextFollowupAt: null,
          followupDisabledReason: disabledReason,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));

      paused += 1;
    }

    return paused;
  }

  private async restoreGlobalDisabledConversations(
    userId: string,
    config: typeof followupConfigs.$inferSelect,
  ) {
    const userConnections = await db.query.whatsappConnections.findMany({
      where: eq(whatsappConnections.userId, userId),
      columns: {
        id: true,
      },
    });
    const connectionIds = userConnections.map((connection) => connection.id);
    if (connectionIds.length === 0) {
      return { restored: 0, skipped: 0 };
    }

    const scopedConversations = await db.query.conversations.findMany({
      where: and(
        inArray(conversations.connectionId, connectionIds),
        isNotNull(conversations.followupDisabledReason),
      ),
      with: { connection: true },
    });
    const candidates = scopedConversations.filter((conversation) =>
      isGlobalFollowUpPauseReason(conversation.followupDisabledReason),
    );

    let restored = 0;
    let skipped = 0;

    for (const conversation of candidates) {
      const nextDate = resolveRecoveredGlobalFollowUpDate({
        reason: conversation.followupDisabledReason,
        currentStage: conversation.followupStage,
        config,
      });

      if (!nextDate) {
        skipped += 1;
        continue;
      }

      if (!await this.ensureConversationSafeForFollowUpQueue(conversation, userId)) {
        skipped += 1;
        continue;
      }

      await db.update(conversations)
        .set({
          followupActive: true,
          nextFollowupAt: nextDate,
          followupDisabledReason: null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));

      restored += 1;
    }

    return { restored, skipped };
  }

  async repairMissingSchedules(limit: number = 50000, onlyUserId?: string): Promise<{ scanned: number; repaired: number; disabled: number; skipped: number }> {
    const rows = await db
      .select({
        conversation: conversations,
        connectionId: whatsappConnections.id,
        connectionUserId: whatsappConnections.userId,
        connectionName: whatsappConnections.connectionName,
        connectionPhoneNumber: whatsappConnections.phoneNumber,
        connectionIsConnected: whatsappConnections.isConnected,
        connectionProvider: whatsappConnections.provider,
        connectionProviderStatus: whatsappConnections.providerStatus,
        connectionMethod: whatsappConnections.connectionMethod,
        connectionSessionData: whatsappConnections.sessionData,
      })
      .from(conversations)
      .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
      .where(
        and(
          eq(conversations.followupActive, true),
          isNull(conversations.nextFollowupAt),
          onlyUserId ? eq(whatsappConnections.userId, onlyUserId) : sql`true`,
          sql`NULLIF(regexp_replace(COALESCE(${conversations.ownerPhoneNumber}, ''), '\\D', '', 'g'), '') IS NOT NULL`,
          sql`regexp_replace(COALESCE(${conversations.ownerPhoneNumber}, ''), '\\D', '', 'g') = regexp_replace(COALESCE(${whatsappConnections.phoneNumber}, ''), '\\D', '', 'g')`,
          or(
            eq(whatsappConnections.isConnected, true),
            sql`LOWER(COALESCE(${whatsappConnections.providerStatus}, '')) IN ('connected', 'open')`,
          ),
          sql`COALESCE(${conversations.jidSuffix}, 's.whatsapp.net') <> 'g.us'`,
          sql`COALESCE(${conversations.remoteJid}, '') NOT LIKE '%@g.us'`,
        ),
      )
      .limit(limit);

    const missingSchedules = rows.map((row) => ({
      ...row.conversation,
      connection: {
        id: row.connectionId,
        userId: row.connectionUserId,
        connectionName: row.connectionName,
        phoneNumber: row.connectionPhoneNumber,
        isConnected: row.connectionIsConnected,
        provider: row.connectionProvider,
        providerStatus: row.connectionProviderStatus,
        connectionMethod: row.connectionMethod,
        sessionData: row.connectionSessionData,
      },
    }));

    let repaired = 0;
    let disabled = 0;
    let skipped = 0;

    for (const conversation of missingSchedules) {
      const userId = conversation.connection?.userId;

      if (!userId) {
        await this.disableFollowUp(conversation.id, "Conexao removida - sem userId");
        disabled += 1;
        continue;
      }

      const config = await this.getFollowupConfig(userId);
      if (!config?.isEnabled) {
        await this.disableFollowUp(conversation.id, GLOBAL_FOLLOWUP_DISABLED_REASON_ASCII);
        disabled += 1;
        continue;
      }

      if (!await this.ensureConversationSafeForFollowUpQueue(conversation, userId)) {
        skipped += 1;
        continue;
      }

      if (shouldHoldFollowUpUntilCompanyReply(conversation)) {
        if (!isWaitingForCompanyReplyReason(conversation.followupDisabledReason)) {
          await db.update(conversations)
            .set({
              followupDisabledReason: WAITING_FOR_COMPANY_REPLY_REASON,
              updatedAt: new Date(),
            })
            .where(eq(conversations.id, conversation.id));
        }

        skipped += 1;
        continue;
      }

      const latestMessage = await this.getLatestRealConversationMessage(conversation.id);

      if (!latestMessage || latestMessage.fromMe !== true) {
        await this.holdFollowUpOutOfQueue(conversation, WAITING_FOR_COMPANY_REPLY_REASON);
        skipped += 1;
        continue;
      }

      if (shouldHoldFollowUpForOutgoingConfirmation(latestMessage)) {
        const retryDate = addRandomSeconds(new Date(Date.now() + OUTGOING_CONFIRMATION_RECHECK_MS));
        await db.update(conversations)
          .set({
            nextFollowupAt: retryDate,
            followupDisabledReason: WAITING_FOR_OUTGOING_CONFIRMATION_REASON,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conversation.id));

        skipped += 1;
        continue;
      }

      const nextDate = this.buildMissingScheduleDate(conversation, config);
      if (!nextDate) {
        await this.disableFollowUp(conversation.id, "Sequencia completa");
        disabled += 1;
        continue;
      }

      await db.update(conversations)
        .set({
          nextFollowupAt: nextDate,
          followupDisabledReason: null,
          updatedAt: new Date()
        })
        .where(eq(conversations.id, conversation.id));

      repaired += 1;
    }

    return {
      scanned: missingSchedules.length,
      repaired,
      disabled,
      skipped,
    };
  }

  /**
   * Avança para o próximo estágio de follow-up
   */
  private async advanceToNextStage(conversation: any, config: any) {
    const currentStage = conversation.followupStage || 0;
    const nextStage = currentStage + 1;
    const nextDate = buildFollowUpStageScheduleDate({
      config,
      stageIndex: nextStage,
      now: new Date(),
    });

    if (!nextDate) {
      await this.disableFollowUp(conversation.id, "Sequência completa");
      return;
    }

    // 🔧 FIX 2026-02-25: SEMPRE limpar followupDisabledReason ao avançar estágio.
    // Sem isso, uma reason stale de 'Aguardando conexão' pode fazer clearConnectionWaitingStatus
    // SOBRESCREVER nextFollowupAt com now+2min após PM2 restart, causando follow-ups em rajada.
    await db.update(conversations)
      .set({ 
        followupStage: nextStage,
        nextFollowupAt: nextDate,
        followupDisabledReason: null
      })
      .where(eq(conversations.id, conversation.id));

    console.log(`📅 [USER-FOLLOW-UP] Próximo follow-up agendado para ${nextDate.toLocaleString()} (stage ${nextStage}, reason limpa)`);
  }

  /**
   * Agenda próximo follow-up para uma data específica
   */
  private async scheduleNextFollowUp(conversationId: string, date: Date) {
    await db.update(conversations)
      .set({ nextFollowupAt: date })
      .where(eq(conversations.id, conversationId));
  }

  /**
   * Desativa follow-up para uma conversa
   */
  async disableFollowUp(conversationId: string, reason: string = "Desativado") {
    console.log(`🛑 [USER-FOLLOW-UP] Desativando para conversa ${conversationId}. Motivo: ${reason}`);

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { connection: true }
    });

    if (!conversation?.connection?.userId || !await this.ensureConversationSafeForFollowUpQueue(conversation, conversation.connection.userId)) {
      throw new Error("Conversa sem numero dono confirmado para follow-up.");
    }

    await db.update(conversations)
      .set({
        followupActive: false, 
        nextFollowupAt: null,
        followupDisabledReason: reason
      })
      .where(eq(conversations.id, conversationId));

    if (conversation?.connection?.userId) {
      await this.enforcePriorityOverAdminConflicts(conversation, conversation.connection.userId, "desativacao");
    }
  }

  /**
   * Ativa follow-up para uma conversa
   * 🔧 FIX CRÍTICO: NÃO resetar se follow-up já está ativo!
   * Apenas ativar se estava desativado. Isso evita que o agent response
   * resete o timer a cada mensagem, criando loop de spam.
   */
  async enableFollowUp(conversationId: string) {
    // Buscar conversa para obter userId via connection
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { connection: true }
    });

    if (!conversation?.connection?.userId) {
      console.log(`⚠️ [USER-FOLLOW-UP] Não foi possível ativar follow-up: userId não encontrado`);
      return;
    }

    const userId = conversation.connection.userId;
    const config = await this.getFollowupConfig(userId);
    
    // 🔧 FIX CRÍTICO 2026-02-26: Verificar config GLOBAL antes de qualquer re-ativação!
    // Se o usuário desativou o follow-up globalmente na página /followup,
    // NUNCA reativar automaticamente, independente do motivo de desativação.
    if (!config?.isEnabled) {
      console.log(`🛑 [USER-FOLLOW-UP] Follow-up GLOBAL desabilitado para usuário ${userId}. NÃO reativando conversa ${conversationId}.`);
      return;
    }

    if (!await this.ensureConversationSafeForFollowUpQueue(conversation, userId)) {
      return;
    }

    // 🔧 FIX CRÍTICO: Se follow-up JÁ está ativo, NÃO resetar!
    // Isso evita que cada resposta do agente resete o timer para 10 min,
    // criando um loop infinito de follow-ups a cada 10 minutos.
    if (conversation.followupActive && conversation.nextFollowupAt) {
      console.log(`ℹ️ [USER-FOLLOW-UP] Follow-up já ativo para ${conversationId} (stage=${conversation.followupStage}, next=${conversation.nextFollowupAt}). NÃO resetando.`);
      return;
    }

    // ⚠️ IMPORTANTE: Follow-up é INDEPENDENTE da IA!
    // Follow-up pode ser ativado/desativado independentemente do estado da IA
    // A IA e o Follow-up são sistemas separados e independentes!
    // 
    // Follow-up é controlado por:
    // 1. Toggle global em /followup (followup_configs.is_enabled)
    // 2. Toggle individual na conversa (conversations.followupActive)
    //
    // A desativação da IA (isAgentEnabled) NÃO deve afetar o follow-up!

    // 🔧 FIX BUG REATIVAÇÃO 2026-02-26: Se foi desativado MANUALMENTE pelo usuário OU pelo sistema,
    // NÃO reativar automaticamente. Checar múltiplos padrões de motivo de desativação.
    if (conversation.followupDisabledReason) {
      const reason = conversation.followupDisabledReason;
      const wasGloballyPaused = isGlobalFollowUpPauseReason(reason);
      const isManuallyDisabled = 
        reason.includes('Desativado pelo usuário') ||
        reason.includes('Usuário desativou') ||
        reason.includes('Desativado manualmente') ||
        reason.includes('Conta suspensa') ||
        reason.includes('lista de exclusão') ||
        reason.includes('Sequência completa') ||
        reason.includes('Conexão removida');
      
      if (isManuallyDisabled && !wasGloballyPaused) {
        console.log(`🛑 [USER-FOLLOW-UP] Follow-up foi DESATIVADO para ${conversationId}. Motivo: ${reason}. NÃO reativando automaticamente.`);
        return;
      }
    }

    const intervals = config?.intervalsMinutes || DEFAULT_INTERVALS;
    const delayMinutes = intervals[0] || 10;
    const restoredDate = isGlobalFollowUpPauseReason(conversation.followupDisabledReason)
      ? resolveRecoveredGlobalFollowUpDate({
          reason: conversation.followupDisabledReason,
          currentStage: conversation.followupStage,
          config,
        })
      : null;
    const nextDate = restoredDate || addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));

    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: restoredDate ? conversation.followupStage : 0,
        nextFollowupAt: nextDate,
        followupDisabledReason: null
      })
      .where(eq(conversations.id, conversationId));

    await this.enforcePriorityOverAdminConflicts(conversation, userId, "ativacao");

    console.log(`✅ [USER-FOLLOW-UP] Ativado para conversa ${conversationId}`);
  }

  /**
   * Pausa o follow-up enquanto a última mensagem for do cliente.
   * O cronômetro só deve voltar a contar depois que a empresa responder.
   */
  async pauseFollowUpUntilCompanyReply(conversationId: string, reason?: string) {
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { connection: true }
    });

    if (!conversation?.connection?.userId) {
      console.log(`⚠️ [USER-FOLLOW-UP] Não foi possível pausar follow-up: userId não encontrado`);
      return;
    }

    if (!conversation.followupActive) {
      console.log(`ℹ️ [USER-FOLLOW-UP] Follow-up já está desativado para ${conversationId}, nada para pausar`);
      return;
    }

    if (conversation.followupDisabledReason) {
      const disableReason = conversation.followupDisabledReason;
      const isIntentionallyDisabled =
        disableReason.includes('Desativado pelo usuário') ||
        disableReason.includes('Usuário desativou') ||
        disableReason.includes('Desativado manualmente') ||
        disableReason.includes('Conta suspensa') ||
        disableReason.includes('lista de exclusão') ||
        disableReason.includes('Sequência completa') ||
        disableReason.includes('Conexão removida');

      if (isIntentionallyDisabled) {
        console.log(`🛑 [USER-FOLLOW-UP] Follow-up desativado intencionalmente para ${conversationId}. Não pausando/reativando.`);
        return;
      }
    }

    await db.update(conversations)
      .set({
        followupStage: 0,
        nextFollowupAt: null,
        followupDisabledReason: WAITING_FOR_COMPANY_REPLY_REASON,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    if (reason && reason !== WAITING_FOR_COMPANY_REPLY_REASON) {
      console.log(
        `⏸️ [USER-FOLLOW-UP] Conversa ${conversationId} entrou em espera pela empresa. Contexto: ${reason}`,
      );
    }

    console.log(`⏸️ [USER-FOLLOW-UP] Pausado e resetado para ${conversationId} até a empresa responder novamente.`);
  }

  /**
   * Reinicia o ciclo após uma resposta da empresa (IA ou manual).
   * O cronômetro do follow-up deve sempre partir do último envio nosso.
   */
  async resetFollowUpCycle(conversationId: string, reason?: string, referenceTime?: Date) {
    // Buscar conversa para obter userId via connection
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { connection: true }
    });

    if (!conversation?.connection?.userId) {
      console.log(`⚠️ [USER-FOLLOW-UP] Não foi possível resetar follow-up: userId não encontrado`);
      return;
    }

    const userId = conversation.connection.userId;
    const config = await this.getFollowupConfig(userId);
    
    // 🔧 FIX CRÍTICO 2026-02-26: Verificar config GLOBAL ANTES de tudo!
    // Se o usuário desativou o follow-up globalmente na página /followup,
    // NUNCA resetar/reativar automaticamente.
    if (!config?.isEnabled) {
      console.log(`🛑 [USER-FOLLOW-UP] Follow-up GLOBAL desativado para usuário ${userId}. NÃO resetando ciclo para ${conversationId}.`);
      return;
    }

    if (!await this.ensureConversationSafeForFollowUpQueue(conversation, userId)) {
      return;
    }

    // 🔧 FIX CRÍTICO: NÃO reativar se foi desativado MANUALMENTE pelo usuário
    const resetCanReactivate = canReactivateFollowUpOnCompanyReply({
      followupActive: conversation.followupActive,
      followupDisabledReason: conversation.followupDisabledReason,
      isGlobalFollowUpEnabled: config?.isEnabled,
    });

    if (!resetCanReactivate) {
      console.log(
        `[USER-FOLLOW-UP] Reset automático bloqueado para ${conversationId}. Motivo atual: ${conversation.followupDisabledReason || "sem motivo"}.`,
      );
      return;
    }

    if (!conversation.followupActive) {
      console.log(
        `[USER-FOLLOW-UP] Conversa ${conversationId} será reativada após nova resposta da empresa. Motivo anterior: ${conversation.followupDisabledReason || "sem motivo"}.`,
      );
      (conversation as typeof conversation & { followupActive: boolean }).followupActive = true;
    }

    if (
      conversation.followupDisabledReason &&
      !isHardStopFollowUpDisableReason(conversation.followupDisabledReason)
    ) {
      (
        conversation as typeof conversation & { followupDisabledReason: string | null }
      ).followupDisabledReason = null;
    }

    // Checar tanto followupActive quanto followupDisabledReason
    if (!conversation.followupActive) {
      console.log(`ℹ️ [USER-FOLLOW-UP] Follow-up estava desativado para ${conversationId}, não resetando automaticamente`);
      return;
    }

    // 🔧 FIX BUG REATIVAÇÃO 2026-02-26: Se existe motivo de desativação que indica desativação intencional,
    // NUNCA reativar automaticamente. Checar TODOS os padrões possíveis.
    if (conversation.followupDisabledReason) {
      const disableReason = conversation.followupDisabledReason;
      const isIntentionallyDisabled = 
        disableReason.includes('Desativado pelo usuário') ||
        disableReason.includes('Usuário desativou') ||
        disableReason.includes('Desativado manualmente') ||
        disableReason.includes('Conta suspensa') ||
        disableReason.includes('lista de exclusão') ||
        disableReason.includes('Sequência completa') ||
        disableReason.includes('Conexão removida');
      
      if (isIntentionallyDisabled) {
        console.log(`🛑 [USER-FOLLOW-UP] Follow-up DESATIVADO intencionalmente para ${conversationId}. Motivo: ${disableReason}. NÃO resetando.`);
        return;
      }
    }
    
    const canReactivate = canReactivateFollowUpOnCompanyReply({
      followupActive: conversation.followupActive,
      followupDisabledReason: conversation.followupDisabledReason,
      isGlobalFollowUpEnabled: config?.isEnabled,
    });

    if (!canReactivate) {
      console.log(
        `[USER-FOLLOW-UP] Reset automático bloqueado para ${conversationId}. Motivo atual: ${conversation.followupDisabledReason || "sem motivo"}.`,
      );
      return;
    }

    if (!conversation.followupActive) {
      console.log(
        `[USER-FOLLOW-UP] Conversa ${conversationId} será reativada após nova resposta da empresa. Motivo anterior: ${conversation.followupDisabledReason || "sem motivo"}.`,
      );
      (conversation as typeof conversation & { followupActive: boolean }).followupActive = true;
    }

    if (
      conversation.followupDisabledReason &&
      !isHardStopFollowUpDisableReason(conversation.followupDisabledReason)
    ) {
      (
        conversation as typeof conversation & { followupDisabledReason: string | null }
      ).followupDisabledReason = null;
    }

    const restartSchedule = buildResetFollowUpSchedule(
      config,
      referenceTime || new Date(),
      { randomizeDate: addRandomSeconds },
    );

    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: restartSchedule.followupStage,
        nextFollowupAt: restartSchedule.nextFollowupAt,
        followupDisabledReason: null
      })
      .where(eq(conversations.id, conversationId));

    await this.enforcePriorityOverAdminConflicts(conversation, userId, "reset");
      
    console.log(`🔄 [USER-FOLLOW-UP] ${reason || 'Empresa respondeu'}. Ciclo reiniciado para ${conversationId} com estágio 0 e próximo follow-up em ${restartSchedule.delayMinutes}min (${restartSchedule.nextFollowupAt.toLocaleString()}).`);
  }

  /**
   * Agenda um follow-up manual para uma data/hora específica
   */
  async scheduleManualFollowUp(conversationId: string, scheduledFor: Date, note?: string) {
    const normalizedScheduledFor = parseBrazilWallClockDateTime(scheduledFor);
    if (!normalizedScheduledFor) {
      throw new Error("Data de agendamento inválida");
    }

    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { connection: true }
    });

    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: -1, // -1 indica agendamento manual
        nextFollowupAt: normalizedScheduledFor,
        followupDisabledReason: note ? `📅 Agendado: ${note}` : '📅 Agendamento manual'
      })
      .where(eq(conversations.id, conversationId));

    if (conversation?.connection?.userId) {
      await this.enforcePriorityOverAdminConflicts(conversation, conversation.connection.userId, "agendamento_manual");
    }
      
    console.log(
      `📅 [USER-FOLLOW-UP] Agendamento manual criado para ${conversationId}: ${
        serializeBrazilWallClockDateTime(normalizedScheduledFor) || "data inválida"
      }`,
    );
  }

  /**
   * Log de follow-up
   */
  private async logFollowUp(
    conversation: any, 
    userId: string, 
    status: string, 
    messageContent: string | null, 
    aiDecision: any, 
    errorReason?: string
  ) {
    try {
      await db.insert(userFollowupLogs).values({
        conversationId: conversation.id,
        userId,
        contactNumber: conversation.contactNumber,
        status,
        messageContent,
        aiDecision,
        stage: conversation.followupStage || 0,
        errorReason
      });
    } catch (error) {
      console.error("Erro ao logar follow-up:", error);
    }
  }

  /**
   * Busca logs de follow-up
   */
  async getFollowUpLogs(userId: string, limit: number = 50) {
    return await db.query.userFollowupLogs.findMany({
      where: eq(userFollowupLogs.userId, userId),
      orderBy: (logs, { desc }) => [desc(logs.executedAt)],
      limit
    });
  }

  /**
   * Estatísticas de follow-up do usuário
   */
  async getFollowUpStats(userId: string) {
    const cacheKey = `followup:user:stats:${userId}`;
    return memoryCache.getOrCompute(cacheKey, async () => {
      const [logStats] = await db
        .select({
          totalSent: sql<number>`cast(coalesce(sum(case when ${userFollowupLogs.status} = 'sent' then 1 else 0 end), 0) as integer)`,
          totalFailed: sql<number>`cast(coalesce(sum(case when ${userFollowupLogs.status} = 'failed' then 1 else 0 end), 0) as integer)`,
          totalCancelled: sql<number>`cast(coalesce(sum(case when ${userFollowupLogs.status} = 'cancelled' then 1 else 0 end), 0) as integer)`,
          totalSkipped: sql<number>`cast(coalesce(sum(case when ${userFollowupLogs.status} = 'skipped' then 1 else 0 end), 0) as integer)`,
        })
        .from(userFollowupLogs)
        .where(eq(userFollowupLogs.userId, userId));

      const [pendingStats] = await db
        .select({
          pending: sql<number>`cast(count(*) as integer)`,
          scheduledToday: sql<number>`cast(coalesce(sum(case when date(${conversations.nextFollowupAt}) = date(now() at time zone 'America/Sao_Paulo') then 1 else 0 end), 0) as integer)`,
        })
        .from(conversations)
        .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
        .where(
          and(
            eq(whatsappConnections.userId, userId),
            eq(conversations.followupActive, true),
            isNotNull(conversations.nextFollowupAt),
          ),
        );

      return {
        totalSent: Number(logStats?.totalSent || 0),
        totalFailed: Number(logStats?.totalFailed || 0),
        totalCancelled: Number(logStats?.totalCancelled || 0),
        totalSkipped: Number(logStats?.totalSkipped || 0),
        pending: Number(pendingStats?.pending || 0),
        scheduledToday: Number(pendingStats?.scheduledToday || 0),
      };
    }, 30000);
  }

  /**
   * Lista conversas com follow-up ativo do usuário
   */
  async getPendingFollowUps(userId: string) {
    const cacheKey = `followup:user:pending:${userId}`;
    return memoryCache.getOrCompute(cacheKey, async () => {
      const rows = await db
        .select({ conversation: conversations })
        .from(conversations)
        .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
        .where(
          and(
            eq(whatsappConnections.userId, userId),
            eq(conversations.followupActive, true),
            isNotNull(conversations.nextFollowupAt),
          ),
        )
        .orderBy(sql`${conversations.nextFollowupAt} asc`);

      return rows.map((row) => row.conversation);
    }, 30000);
  }

  async repairTooEarlySchedulesAfterTimezoneRegression(
    limit: number = 50000,
    onlyUserId?: string,
  ): Promise<{ scanned: number; repaired: number; skipped: number }> {
    const userFilter = onlyUserId ? sql`AND wc.user_id = ${onlyUserId}` : sql``;
    const safeOwnerFilter = sql`
      AND NULLIF(regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g'), '') IS NOT NULL
      AND regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g') = regexp_replace(COALESCE(wc.phone_number, ''), '\\D', '', 'g')
      AND (
        COALESCE(wc.is_connected, false) = true
        OR LOWER(COALESCE(wc.provider_status, '')) IN ('connected', 'open')
      )
      AND COALESCE(c.jid_suffix, 's.whatsapp.net') <> 'g.us'
      AND COALESCE(c.remote_jid, '') NOT LIKE '%@g.us'
    `;

    const result = await db.execute(sql`
      WITH last_followup_sent AS (
        SELECT DISTINCT ON (l.conversation_id)
          l.conversation_id,
          l.executed_at AS last_followup_sent_at
        FROM user_followup_logs l
        WHERE l.status = 'sent'
        ORDER BY l.conversation_id, l.executed_at DESC
      ),
      latest_message AS (
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id,
          m.from_me AS latest_from_me,
          m.status AS latest_status,
          m.timestamp AS latest_message_at
        FROM messages m
        ORDER BY m.conversation_id, m.timestamp DESC
      )
      SELECT
        c.id AS conversation_id,
        wc.user_id,
        c.contact_number,
        c.followup_stage,
        c.next_followup_at,
        c.last_message_time,
        c.last_message_from_me,
        c.followup_disabled_reason,
        lfs.last_followup_sent_at,
        lm.latest_from_me,
        lm.latest_status,
        lm.latest_message_at
      FROM conversations c
      JOIN whatsapp_connections wc
        ON wc.id = c.connection_id
      LEFT JOIN last_followup_sent lfs
        ON lfs.conversation_id = c.id
      LEFT JOIN latest_message lm
        ON lm.conversation_id = c.id
      WHERE c.followup_active = true
        AND c.next_followup_at IS NOT NULL
        AND c.followup_stage >= 0
        ${userFilter}
        ${safeOwnerFilter}
      ORDER BY c.next_followup_at ASC
      LIMIT ${limit}
    `);

    const rows = (result.rows || []) as Array<{
      conversation_id: string;
      user_id: string;
      contact_number: string | null;
      followup_stage: number | null;
      next_followup_at: Date | string | null;
      last_message_time: Date | string | null;
      last_message_from_me: boolean | null;
      followup_disabled_reason: string | null;
      last_followup_sent_at: Date | string | null;
      latest_from_me: boolean | null;
      latest_status: string | null;
      latest_message_at: Date | string | null;
    }>;

    let repaired = 0;
    let skipped = 0;

    for (const row of rows) {
      const config = await this.getFollowupConfig(row.user_id);
      if (!config?.isEnabled) {
        skipped += 1;
        continue;
      }

      const currentStage = Math.max(0, Number(row.followup_stage || 0));
      const currentNext = row.next_followup_at ? new Date(row.next_followup_at) : null;
      if (!currentNext || !Number.isFinite(currentNext.getTime())) {
        skipped += 1;
        continue;
      }

      let referenceTime: Date | null = null;
      if (currentStage === 0) {
        if (
          !row.last_message_from_me ||
          !row.latest_from_me ||
          !row.latest_message_at ||
          isUnconfirmedOutgoingMessageStatus(row.latest_status)
        ) {
          skipped += 1;
          continue;
        }
        referenceTime = new Date(row.latest_message_at);
      } else if (row.last_followup_sent_at) {
        referenceTime = new Date(row.last_followup_sent_at);
      }

      if (!referenceTime || !Number.isFinite(referenceTime.getTime())) {
        skipped += 1;
        continue;
      }

      const minimumExpectedDate = this.buildMinimumExpectedScheduleForStage(
        currentStage,
        config,
        referenceTime,
      );
      const correctedDate = this.buildCorrectedScheduleForStage(
        currentStage,
        config,
        referenceTime,
      );

      if (!minimumExpectedDate || !correctedDate) {
        skipped += 1;
        continue;
      }

      if (currentNext.getTime() + 60 * 1000 >= minimumExpectedDate.getTime()) {
        skipped += 1;
        continue;
      }

      await db.update(conversations)
        .set({
          nextFollowupAt: correctedDate,
          followupDisabledReason: null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, row.conversation_id));

      repaired += 1;
      console.log(
        `🔧 [USER-FOLLOW-UP] Agenda adiantada corrigida para ${row.contact_number || row.conversation_id}: ` +
        `${currentNext.toISOString()} -> ${correctedDate.toISOString()} (stage ${currentStage})`,
      );
    }

    return {
      scanned: rows.length,
      repaired,
      skipped,
    };
  }

  /**
   * Reorganiza todos os follow-ups pendentes de um usuário
   * Recalcula as datas baseado na configuração atual (horários, dias úteis, etc.)
   */
  async repairMissedCycleResetsAfterCompanyReply(
    limit: number = 5000,
    onlyUserId?: string,
  ): Promise<{ scanned: number; repaired: number; skipped: number }> {
    const userFilter = onlyUserId ? sql`AND wc.user_id = ${onlyUserId}` : sql``;
    const safeOwnerFilter = sql`
      AND NULLIF(regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g'), '') IS NOT NULL
      AND regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g') = regexp_replace(COALESCE(wc.phone_number, ''), '\\D', '', 'g')
      AND (
        COALESCE(wc.is_connected, false) = true
        OR LOWER(COALESCE(wc.provider_status, '')) IN ('connected', 'open')
      )
      AND COALESCE(c.jid_suffix, 's.whatsapp.net') <> 'g.us'
      AND COALESCE(c.remote_jid, '') NOT LIKE '%@g.us'
    `;

    const result = await db.execute(sql`
      WITH last_followup_sent AS (
        SELECT DISTINCT ON (l.conversation_id)
          l.user_id,
          l.conversation_id,
          l.executed_at AS last_followup_sent_at
        FROM user_followup_logs l
        WHERE l.status = 'sent'
        ${onlyUserId ? sql`AND l.user_id = ${onlyUserId}` : sql``}
        ORDER BY l.conversation_id, l.executed_at DESC
      ),
      reply_flow AS (
        SELECT
          lfs.user_id,
          lfs.conversation_id,
          MAX(m.timestamp) FILTER (
            WHERE m.from_me = false
              AND m.timestamp > lfs.last_followup_sent_at
          ) AS last_customer_after_followup,
          MAX(m.timestamp) FILTER (
            WHERE m.from_me = true
              AND m.timestamp > lfs.last_followup_sent_at
              AND (
                m.status IS NULL
                OR lower(m.status) NOT IN ('queued', 'pending', 'pending_delivery', 'failed')
              )
              AND (
                nullif(btrim(coalesce(m.text, '')), '') IS NOT NULL
                OR m.media_type IS NOT NULL
                OR m.media_url IS NOT NULL
                OR nullif(btrim(coalesce(m.media_caption, '')), '') IS NOT NULL
              )
          ) AS last_company_after_followup
        FROM last_followup_sent lfs
        JOIN messages m
          ON m.conversation_id = lfs.conversation_id
        GROUP BY lfs.user_id, lfs.conversation_id
      )
      SELECT
        c.id AS conversation_id,
        wc.user_id,
        c.contact_number,
        c.followup_active,
        c.followup_disabled_reason,
        c.last_message_time,
        rf.last_company_after_followup
      FROM conversations c
      JOIN whatsapp_connections wc
        ON wc.id = c.connection_id
      JOIN reply_flow rf
        ON rf.conversation_id = c.id
       AND rf.user_id = wc.user_id
      WHERE rf.last_customer_after_followup IS NOT NULL
        AND rf.last_company_after_followup IS NOT NULL
        AND rf.last_company_after_followup > rf.last_customer_after_followup
        AND c.last_message_from_me = true
        AND (c.followup_active = false OR c.next_followup_at IS NULL)
        ${userFilter}
        ${safeOwnerFilter}
      ORDER BY rf.last_company_after_followup DESC
      LIMIT ${limit}
    `);

    const rows = (result.rows || []) as Array<{
      conversation_id: string;
      user_id: string;
      contact_number: string | null;
      followup_active: boolean | null;
      followup_disabled_reason: string | null;
      last_message_time: Date | string | null;
      last_company_after_followup: Date | string | null;
    }>;

    let repaired = 0;
    let skipped = 0;

    for (const row of rows) {
      const config = await this.getFollowupConfig(row.user_id);
      const canReactivate = canReactivateFollowUpOnCompanyReply({
        followupActive: row.followup_active,
        followupDisabledReason: row.followup_disabled_reason,
        isGlobalFollowUpEnabled: config?.isEnabled,
      });

      if (!config?.isEnabled || !canReactivate) {
        skipped += 1;
        continue;
      }

      const referenceTime = row.last_company_after_followup
        ? new Date(row.last_company_after_followup)
        : row.last_message_time
          ? new Date(row.last_message_time)
          : new Date();
      const restartSchedule = buildResetFollowUpSchedule(
        config,
        referenceTime,
        { randomizeDate: addRandomSeconds },
      );

      await db.update(conversations)
        .set({
          followupActive: true,
          followupStage: restartSchedule.followupStage,
          nextFollowupAt: restartSchedule.nextFollowupAt,
          followupDisabledReason: null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, row.conversation_id));

      repaired += 1;
      console.log(
        `🔧 [USER-FOLLOW-UP] Reset perdido reparado para ${row.contact_number || row.conversation_id}: próximo follow-up em ${restartSchedule.delayMinutes}min.`,
      );
    }

    return {
      scanned: rows.length,
      repaired,
      skipped,
    };
  }

  async repairMissingActivationAfterCompanyOutbound(
    limit: number = 5000,
    onlyUserId?: string,
  ): Promise<{ scanned: number; repaired: number; skipped: number }> {
    const userFilter = onlyUserId ? sql`AND wc.user_id = ${onlyUserId}` : sql``;
    const safeOwnerFilter = sql`
      AND NULLIF(regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g'), '') IS NOT NULL
      AND regexp_replace(COALESCE(c.owner_phone_number, ''), '\\D', '', 'g') = regexp_replace(COALESCE(wc.phone_number, ''), '\\D', '', 'g')
      AND (
        COALESCE(wc.is_connected, false) = true
        OR LOWER(COALESCE(wc.provider_status, '')) IN ('connected', 'open')
      )
      AND COALESCE(c.jid_suffix, 's.whatsapp.net') <> 'g.us'
      AND COALESCE(c.remote_jid, '') NOT LIKE '%@g.us'
    `;

    const result = await db.execute(sql`
      WITH followup_log_stats AS (
        SELECT
          l.conversation_id,
          MAX(l.executed_at) FILTER (WHERE l.status = 'cancelled') AS last_cancelled_at
        FROM user_followup_logs l
        ${onlyUserId ? sql`WHERE l.user_id = ${onlyUserId}` : sql``}
        GROUP BY l.conversation_id
      ),
      latest_message AS (
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id,
          m.from_me AS latest_from_me,
          m.status AS latest_status,
          m.timestamp AS latest_message_at,
          m.text AS latest_text,
          m.media_type AS latest_media_type,
          m.media_url AS latest_media_url,
          m.media_caption AS latest_media_caption
        FROM messages m
        ORDER BY m.conversation_id, m.timestamp DESC
      )
      SELECT
        c.id AS conversation_id,
        wc.user_id,
        c.contact_number,
        c.followup_active,
        c.followup_disabled_reason,
        c.last_message_time,
        c.last_message_from_me,
        lm.latest_message_at,
        lm.latest_status,
        fls.last_cancelled_at
      FROM conversations c
      JOIN whatsapp_connections wc
        ON wc.id = c.connection_id
      LEFT JOIN followup_log_stats fls
        ON fls.conversation_id = c.id
      LEFT JOIN latest_message lm
        ON lm.conversation_id = c.id
      WHERE c.followup_active = false
        AND c.next_followup_at IS NULL
        AND c.last_message_from_me = true
        AND c.last_message_time >= NOW() - INTERVAL '14 days'
        AND lm.latest_from_me = true
        AND (
          lm.latest_status IS NULL
          OR lower(lm.latest_status) NOT IN ('queued', 'pending', 'pending_delivery', 'failed')
        )
        AND (
          nullif(btrim(coalesce(lm.latest_text, '')), '') IS NOT NULL
          OR lm.latest_media_type IS NOT NULL
          OR lm.latest_media_url IS NOT NULL
          OR nullif(btrim(coalesce(lm.latest_media_caption, '')), '') IS NOT NULL
        )
        ${userFilter}
        ${safeOwnerFilter}
      ORDER BY lm.latest_message_at DESC
      LIMIT ${limit}
    `);

    const rows = (result.rows || []) as Array<{
      conversation_id: string;
      user_id: string;
      contact_number: string | null;
      followup_active: boolean | null;
      followup_disabled_reason: string | null;
      last_message_time: Date | string | null;
      last_message_from_me: boolean | null;
      latest_message_at: Date | string | null;
      latest_status: string | null;
      last_cancelled_at: Date | string | null;
    }>;

    let repaired = 0;
    let skipped = 0;

    for (const row of rows) {
      const config = await this.getFollowupConfig(row.user_id);
      const canRecover = canRecoverFollowUpAfterCompanyOutbound({
        followupActive: row.followup_active,
        followupDisabledReason: row.followup_disabled_reason,
        isGlobalFollowUpEnabled: config?.isEnabled,
        lastMessageFromMe: row.last_message_from_me,
        lastCompanyOutboundAt: row.latest_message_at,
        lastCancelledFollowUpAt: row.last_cancelled_at,
      });

      if (!config?.isEnabled || !canRecover) {
        skipped += 1;
        continue;
      }

      const referenceTime = row.latest_message_at
        ? new Date(row.latest_message_at)
        : new Date();
      const restartSchedule = buildResetFollowUpSchedule(
        config,
        referenceTime,
        { randomizeDate: addRandomSeconds },
      );

      await db.update(conversations)
        .set({
          followupActive: true,
          followupStage: restartSchedule.followupStage,
          nextFollowupAt: restartSchedule.nextFollowupAt,
          followupDisabledReason: null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, row.conversation_id));

      repaired += 1;
      console.log(
        `🔧 [USER-FOLLOW-UP] Ativação perdida reparada para ${row.contact_number || row.conversation_id}: próximo follow-up em ${restartSchedule.delayMinutes}min.`,
      );
    }

    return {
      scanned: rows.length,
      repaired,
      skipped,
    };
  }

  async reorganizeAllFollowups(userId: string): Promise<{ reorganized: number; skipped: number }> {
    console.log(`🔄 [USER-FOLLOW-UP] Reorganizando todos os follow-ups para usuário ${userId}`);
    
    const config = await this.getFollowupConfig(userId);
    if (!config || !config.isEnabled) {
      console.log(`⚠️ [USER-FOLLOW-UP] Follow-up desabilitado para usuário ${userId}`);
      return { reorganized: 0, skipped: 0 };
    }

    const restoreResult = await this.restoreGlobalDisabledConversations(userId, config);
    const restartRepairResult = await this.repairMissedCycleResetsAfterCompanyReply(5000, userId);
    const missingActivationRepairResult = await this.repairMissingActivationAfterCompanyOutbound(5000, userId);
    const earlyScheduleRepairResult = await this.repairTooEarlySchedulesAfterTimezoneRegression(5000, userId);

    const userConversationRows = await db
      .select({
        conversation: conversations,
        connectionId: whatsappConnections.id,
        connectionUserId: whatsappConnections.userId,
        connectionName: whatsappConnections.connectionName,
        connectionPhoneNumber: whatsappConnections.phoneNumber,
        connectionIsConnected: whatsappConnections.isConnected,
        connectionProvider: whatsappConnections.provider,
        connectionProviderStatus: whatsappConnections.providerStatus,
        connectionMethod: whatsappConnections.connectionMethod,
        connectionSessionData: whatsappConnections.sessionData,
      })
      .from(conversations)
      .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
      .where(
        and(
          eq(whatsappConnections.userId, userId),
          eq(conversations.followupActive, true),
          isNotNull(conversations.nextFollowupAt),
        ),
      )
      .orderBy(sql`${conversations.nextFollowupAt} asc`);

    const userConversations = userConversationRows.map((row) => ({
      ...row.conversation,
      connection: {
        id: row.connectionId,
        userId: row.connectionUserId,
        connectionName: row.connectionName,
        phoneNumber: row.connectionPhoneNumber,
        isConnected: row.connectionIsConnected,
        provider: row.connectionProvider,
        providerStatus: row.connectionProviderStatus,
        connectionMethod: row.connectionMethod,
        sessionData: row.connectionSessionData,
      },
    }));
    
    let reorganized = 0;
    let skipped = 0;
    const repairResult = await this.repairMissingSchedules(50000, userId);
    const now = new Date();

    for (const conversation of userConversations) {
      try {
        await this.enforcePriorityOverAdminConflicts(conversation, userId, "reorganizacao");

        if (!conversation.nextFollowupAt) {
          continue;
        }

        if (Number(conversation.followupStage) < 0) {
          skipped++;
          continue;
        }

        if (!await this.ensureConversationSafeForFollowUpQueue(conversation, userId)) {
          skipped++;
          continue;
        }

        if (
          shouldHoldFollowUpUntilCompanyReply(conversation) ||
          await this.pauseIfLatestMessageIsFromClient(conversation, userId, "reorganizacao")
        ) {
          skipped++;
          continue;
        }

        const rebuiltDate = this.buildCurrentStageScheduleDate(conversation, config, now);
        if (!rebuiltDate) {
          skipped++;
          continue;
        }

        await db.update(conversations)
          .set({
            nextFollowupAt: rebuiltDate,
            followupDisabledReason: null,
          })
          .where(eq(conversations.id, conversation.id));

        reorganized++;
        console.log(
          `✅ [USER-FOLLOW-UP] Reorganizado: ${conversation.contactNumber} -> ${
            serializeBrazilWallClockDateTime(rebuiltDate) || "data inválida"
          }`,
        );
        continue;
      } catch (error) {
        console.error(`❌ [USER-FOLLOW-UP] Erro ao reorganizar ${conversation.id}:`, error);
        skipped++;
      }
    }
    
    console.log(
      `🔄 [USER-FOLLOW-UP] Reorganização concluída: ${reorganized} reorganizados, ${skipped} ignorados, ` +
      `${restartRepairResult.repaired} resets reparados, ${missingActivationRepairResult.repaired} ativações reparadas, ` +
      `${earlyScheduleRepairResult.repaired} agendas adiantadas corrigidas`,
    );
    return {
      reorganized:
        reorganized +
        repairResult.repaired +
        restoreResult.restored +
        restartRepairResult.repaired +
        missingActivationRepairResult.repaired +
        earlyScheduleRepairResult.repaired,
      skipped:
        skipped +
        repairResult.disabled +
        repairResult.skipped +
        restoreResult.skipped +
        restartRepairResult.skipped +
        missingActivationRepairResult.skipped +
        earlyScheduleRepairResult.skipped,
    };
  }

  /**
   * Limpa o status de "aguardando conexão" para todas as conversas de uma conexão específica
   * Chamado quando o WhatsApp reconecta para permitir que os follow-ups sejam processados novamente
   * 
   * 🚀 OTIMIZADO: Faz apenas 1 UPDATE direto sem SELECT prévio
   */
  async clearConnectionWaitingStatus(connectionId: string): Promise<number> {
    try {
      const connection = await storage.getConnectionById(connectionId);
      const connectionPhone = normalizePhoneDigits(connection?.phoneNumber || "");
      if (!connection || !connectionPhone) {
        console.warn(
          `[USER-FOLLOW-UP] Nao foi possivel recuperar aguardando conexao ${connectionId}: numero dono ausente.`,
        );
        return 0;
      }

      await db.execute(sql`
        UPDATE conversations
        SET next_followup_at = NULL,
            followup_disabled_reason = ${FOLLOWUP_OWNER_UNVERIFIED_REASON},
            updated_at = NOW()
        WHERE connection_id = ${connectionId}
          AND followup_active = true
          AND followup_disabled_reason = ${WAITING_FOR_WHATSAPP_CONNECTION_REASON}
          AND NULLIF(regexp_replace(COALESCE(owner_phone_number, ''), '\\D', '', 'g'), '') IS NULL
      `);

      await db.execute(sql`
        UPDATE conversations
        SET next_followup_at = NULL,
            followup_disabled_reason = ${FOLLOWUP_OWNER_MISMATCH_REASON},
            updated_at = NOW()
        WHERE connection_id = ${connectionId}
          AND followup_active = true
          AND followup_disabled_reason = ${WAITING_FOR_WHATSAPP_CONNECTION_REASON}
          AND NULLIF(regexp_replace(COALESCE(owner_phone_number, ''), '\\D', '', 'g'), '') IS NOT NULL
          AND regexp_replace(COALESCE(owner_phone_number, ''), '\\D', '', 'g') <> ${connectionPhone}
      `);

      // Reagendar para 2 minutos no futuro
      const nextDate = addRandomSeconds(new Date(Date.now() + 2 * 60 * 1000));
      
      // 🔧 FIX 2026-02-25: PROTEGER conversas que já têm nextFollowupAt no futuro (>10min).
      // Sem isso, após PM2 restart + reconexão, clearConnectionWaitingStatus SOBRESCREVIA
      // o nextFollowupAt de conversas que já foram corretamente agendadas por advanceToNextStage
      // (ex: 48h → overwritten para now+2min), causando follow-ups disparados em rajada.
      // Agora: só reagenda conversas cujo nextFollowupAt já passou ou está próximo (<10min).
      const futureThreshold = new Date(Date.now() + 10 * 60 * 1000); // 10 min no futuro
      
      const result = await db.execute(sql`
        UPDATE conversations
        SET followup_disabled_reason = NULL,
            next_followup_at = ${nextDate},
            updated_at = NOW()
        WHERE connection_id = ${connectionId}
          AND followup_active = true
          AND followup_disabled_reason = ${WAITING_FOR_WHATSAPP_CONNECTION_REASON}
          AND regexp_replace(COALESCE(owner_phone_number, ''), '\\D', '', 'g') = ${connectionPhone}
          AND COALESCE(jid_suffix, 's.whatsapp.net') <> 'g.us'
          AND COALESCE(remote_jid, '') NOT LIKE '%@g.us'
          AND NOT (
            regexp_replace(COALESCE(contact_number, ''), '\\D', '', 'g') LIKE '120363%'
            AND length(regexp_replace(COALESCE(contact_number, ''), '\\D', '', 'g')) >= 15
          )
          AND (
            next_followup_at IS NULL
            OR next_followup_at <= ${futureThreshold}
          )
        RETURNING id
      `);
      
      // Também limpar a reason (sem mudar nextFollowupAt) para conversas futuras
      // para que não fiquem marcadas como 'Aguardando' eternamente
      const futureClean = await db.execute(sql`
        UPDATE conversations
        SET followup_disabled_reason = NULL,
            updated_at = NOW()
        WHERE connection_id = ${connectionId}
          AND followup_active = true
          AND followup_disabled_reason = ${WAITING_FOR_WHATSAPP_CONNECTION_REASON}
          AND regexp_replace(COALESCE(owner_phone_number, ''), '\\D', '', 'g') = ${connectionPhone}
          AND next_followup_at > ${futureThreshold}
        RETURNING id
      `);
      
      const count = (result.rows || []).length;
      const futureCount = (futureClean.rows || []).length;
      if (count > 0 || futureCount > 0) {
        console.log(`🔄 [USER-FOLLOW-UP] ${count} conversas reativadas (now+2min) + ${futureCount} limpas (mantendo agenda) para conexão ${connectionId}`);
      }
      return count;
    } catch (error) {
      console.error(`❌ [USER-FOLLOW-UP] Erro ao limpar status de aguardo:`, error);
      return 0;
    }
  }
}

// Singleton
export const userFollowUpService = new UserFollowUpService();
