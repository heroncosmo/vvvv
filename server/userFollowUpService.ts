import { db } from "./db";
import { 
  conversations, 
  userFollowupLogs, 
  followupConfigs,
  messages,
  whatsappConnections,
  users,
  businessAgentConfigs
} from "@shared/schema";
import { eq, and, lte, isNotNull, isNull, sql } from "drizzle-orm";
import { getLLMClient } from "./llm";
import { storage } from "./storage";
import { getSessions } from "./whatsapp";

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

// Limpar cache de mensagens enviadas a cada 10 minutos
setInterval(() => {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  
  for (const [convId, messages] of sentMessagesCache.entries()) {
    const filtered = messages.filter(m => now - m.timestamp < THIRTY_MINUTES);
    if (filtered.length === 0) {
      sentMessagesCache.delete(convId);
    } else {
      sentMessagesCache.set(convId, filtered);
    }
  }
}, 10 * 60 * 1000);

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
  
  const newHash = generateMessageHash(message);
  return cache.some(m => m.hash === newHash);
}

/**
 * Registra uma mensagem como enviada
 */
function registerSentMessage(conversationId: string, message: string): void {
  const hash = generateMessageHash(message);
  const existing = sentMessagesCache.get(conversationId) || [];
  existing.push({ hash, timestamp: Date.now() });
  
  // Manter apenas últimas 20 mensagens no cache
  if (existing.length > 20) {
    existing.shift();
  }
  
  sentMessagesCache.set(conversationId, existing);
}

// Limpar caches expirados periodicamente
setInterval(() => {
  const now = Date.now();
  
  for (const [key, entry] of followupConfigCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      followupConfigCache.delete(key);
    }
  }
  
  for (const [key, entry] of agentConfigCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      agentConfigCache.delete(key);
    }
  }
  
  if (mistralKeyCache && now - mistralKeyCache.timestamp > CACHE_TTL_MS) {
    mistralKeyCache = null;
  }
}, 10 * 60 * 1000); // Limpar a cada 10 minutos

const WAITING_FOR_WHATSAPP_CONNECTION_REASON = "Aguardando conexao WhatsApp...";
const FOLLOWUP_GROUP_DISABLED_REASON = "Follow-up automatico nao esta disponivel para grupos.";
const FOLLOWUP_OWNER_UNVERIFIED_REASON = "Aguardando confirmacao do numero dono da conversa.";
const FOLLOWUP_OWNER_MISMATCH_REASON = "Numero dono da conversa nao confere com a conexao atual. Follow-up bloqueado para evitar envio pelo numero errado.";
const FOLLOWUP_CONNECTION_REMOVED_REASON = "Conexao removida - sem userId";
const WAITING_FOR_COMPANY_REPLY_REASON = "Aguardando resposta da empresa.";

function normalizePhoneDigits(value?: string | null): string {
  return String(value || "").replace(/\D/g, "");
}

function isGroupConversationForFollowUp(conversation: any): boolean {
  const remoteJid = String(conversation?.remoteJid || "").toLowerCase();
  const contactNumber = String(conversation?.contactNumber || "").toLowerCase();
  return remoteJid.includes("@g.us") || contactNumber.includes("@g.us") || contactNumber.endsWith("-group");
}

function getConnectionPhone(connection: any, status?: any): string {
  return normalizePhoneDigits(status?.phoneNumber || status?.connectedPhone || connection?.phoneNumber);
}

function gatewayStatusLooksConnected(status: any): boolean {
  if (!status) return false;
  if (status.isConnected === true) return true;
  const providerStatus = String(status.providerStatus || status.status || "").toLowerCase();
  return providerStatus === "connected" || providerStatus === "open";
}

async function requestGateway(path: string): Promise<any | null> {
  const baseUrl = String(process.env.WA_GATEWAY_URL || "").trim().replace(/\/+$/, "");
  if (!baseUrl) return null;

  const token = String(process.env.WA_GATEWAY_INTERNAL_TOKEN || "agentezap-internal-wa-gateway").trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "content-type": "application/json",
        "x-wa-gateway-token": token,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) return null;
    return payload;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getGatewayStatusForConnection(connectionId: string): Promise<any | null> {
  return requestGateway(`/api/integration/instances/${connectionId}/status`);
}

function getConnectionBoundaryDate(connection: any): Date | null {
  const diagnostics = connection?.sessionData?.runtimeDiagnostics;
  const candidates = [
    diagnostics?.lastForceReset?.at,
    diagnostics?.lastLogout?.at,
    diagnostics?.lastQrCode?.at,
  ]
    .map((value) => value ? new Date(value) : null)
    .filter((date): date is Date => Boolean(date && Number.isFinite(date.getTime())));
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((date) => date.getTime())));
}

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
    if (preferred?.userId === userId && preferred.isOpen === true && preferred.socket?.user !== undefined) {
      return true;
    }

    const connection = await storage.getConnectionById(preferredConnectionId).catch(() => null);
    if (!connection || connection.userId !== userId) return false;
    const status = await getGatewayStatusForConnection(preferredConnectionId);
    if (gatewayStatusLooksConnected(status)) return true;

    const persistedStatus = String((connection as any).providerStatus || "").toLowerCase();
    return connection.isConnected === true || persistedStatus === "connected";
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
const DEFAULT_INTERVALS = [10, 30, 180, 1440, 2880, 4320, 10080, 21600];

/**
 * Adiciona segundos aleatórios a uma data para parecer mais humano
 * Evita que todos os follow-ups sejam no mesmo segundo (parece robô)
 */
function addRandomSeconds(date: Date): Date {
  const randomSeconds = Math.floor(Math.random() * 45) + 5; // Entre 5 e 50 segundos
  return new Date(date.getTime() + randomSeconds * 1000);
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
) => Promise<{ success: boolean; error?: string }>;

export class UserFollowUpService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  // 🔧 FIX: Guard contra ciclos sobrepostos (timer overlap pode spammar leads)
  private isProcessingCycle = false;
  private onFollowUpReady: FollowUpCallback | null = null;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("🚀 [USER-FOLLOW-UP] Serviço iniciado");
    
    // Verificar a cada 5 minutos (otimizado para reduzir carga no DB)
    this.checkInterval = setInterval(() => this.processFollowUps(), 5 * 60 * 1000);
    // Aguardar 60s antes da primeira execução para não sobrecarregar na inicialização
    setTimeout(() => this.processFollowUps(), 60 * 1000);
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

  private async holdFollowUpOutOfQueue(conversation: any, reason: string): Promise<void> {
    await db.update(conversations)
      .set({
        nextFollowupAt: null,
        followupDisabledReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id));
  }

  private async getLatestRealConversationMessage(conversationId: string): Promise<any | null> {
    const result = await db.execute(sql`
      SELECT id, from_me as "fromMe", text, media_type as "mediaType", timestamp, created_at as "createdAt"
      FROM messages
      WHERE conversation_id = ${conversationId}
        AND (
          NULLIF(BTRIM(COALESCE(text, '')), '') IS NOT NULL
          OR media_type IS NOT NULL
          OR media_url IS NOT NULL
        )
      ORDER BY COALESCE(timestamp, created_at) DESC
      LIMIT 1
    `);
    return (result.rows || [])[0] || null;
  }

  private async tryBackfillOwnerPhoneFromCurrentConnection(conversation: any, connection: any, connectionPhone: string): Promise<string> {
    const currentOwnerPhone = normalizePhoneDigits(conversation.ownerPhoneNumber);
    if (currentOwnerPhone || !connectionPhone) {
      return currentOwnerPhone;
    }

    const boundaryDate = getConnectionBoundaryDate(connection);
    if (!boundaryDate) {
      return "";
    }

    const latestMessage = await this.getLatestRealConversationMessage(conversation.id);
    const latestAt = latestMessage?.timestamp || latestMessage?.createdAt
      ? new Date(latestMessage.timestamp || latestMessage.createdAt)
      : null;
    if (!latestMessage?.fromMe || !latestAt || latestAt <= boundaryDate) {
      return "";
    }

    await db.update(conversations)
      .set({
        ownerPhoneNumber: connectionPhone,
        ownerPhoneVerifiedAt: new Date(),
        ownerPhoneSource: "connection_runtime_after_reset",
        updatedAt: new Date(),
      } as any)
      .where(eq(conversations.id, conversation.id));

    conversation.ownerPhoneNumber = connectionPhone;
    return connectionPhone;
  }

  private async ensureConversationSafeForFollowUpQueue(conversation: any, userId: string): Promise<boolean> {
    if (!conversation?.connectionId || isGroupConversationForFollowUp(conversation)) {
      await this.holdFollowUpOutOfQueue(conversation, FOLLOWUP_GROUP_DISABLED_REASON);
      return false;
    }

    const connection = conversation.connection || await storage.getConnectionById(conversation.connectionId).catch(() => null);
    if (!connection || connection.userId !== userId) {
      await this.holdFollowUpOutOfQueue(conversation, FOLLOWUP_CONNECTION_REMOVED_REASON);
      return false;
    }

    const status = await getGatewayStatusForConnection(connection.id);
    const connectionPhone = getConnectionPhone(connection, status);
    if (!gatewayStatusLooksConnected(status) && connection.isConnected !== true && String((connection as any).providerStatus || "").toLowerCase() !== "connected") {
      await this.holdFollowUpOutOfQueue(conversation, WAITING_FOR_WHATSAPP_CONNECTION_REASON);
      return false;
    }

    const ownerPhone = await this.tryBackfillOwnerPhoneFromCurrentConnection(conversation, connection, connectionPhone);
    if (!ownerPhone) {
      await this.holdFollowUpOutOfQueue(conversation, FOLLOWUP_OWNER_UNVERIFIED_REASON);
      return false;
    }

    if (connectionPhone && ownerPhone !== connectionPhone) {
      await this.holdFollowUpOutOfQueue(conversation, FOLLOWUP_OWNER_MISMATCH_REASON);
      return false;
    }

    return true;
  }

  private async syncFollowUpStageFromSentLogs(conversation: any, userId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT MAX(stage) AS "maxStage"
      FROM user_followup_logs
      WHERE conversation_id = ${conversation.id}
        AND user_id = ${userId}
        AND status = 'sent'
    `);
    const maxStageValue = (result.rows || [])[0]?.maxStage;
    const rawMaxStage = maxStageValue === null || typeof maxStageValue === "undefined" ? NaN : Number(maxStageValue);
    if (!Number.isFinite(rawMaxStage) || rawMaxStage < 0) {
      return Number(conversation.followupStage || 0);
    }

    const nextStage = Math.max(Number(conversation.followupStage || 0), Math.floor(rawMaxStage) + 1);
    if (nextStage !== Number(conversation.followupStage || 0)) {
      await db.update(conversations)
        .set({ followupStage: nextStage, updatedAt: new Date() })
        .where(eq(conversations.id, conversation.id));
      conversation.followupStage = nextStage;
    }
    return nextStage;
  }

  private async repairMissingSchedules(limit: number = 5000, onlyUserId?: string): Promise<{ scanned: number; repaired: number; skipped: number }> {
    const rows = await db.query.conversations.findMany({
      where: and(
        eq(conversations.followupActive, true),
        isNull(conversations.nextFollowupAt)
      ),
      with: { connection: true },
      limit,
    });

    let scanned = 0;
    let repaired = 0;
    let skipped = 0;

    for (const conversation of rows) {
      const userId = conversation.connection?.userId;
      if (!userId || (onlyUserId && userId !== onlyUserId)) continue;
      scanned++;

      const config = await this.getFollowupConfig(userId);
      if (!config?.isEnabled) {
        skipped++;
        continue;
      }

      if (!(await this.ensureConversationSafeForFollowUpQueue(conversation, userId))) {
        skipped++;
        continue;
      }

      const latestMessage = await this.getLatestRealConversationMessage(conversation.id);
      if (latestMessage && !latestMessage.fromMe) {
        await this.holdFollowUpOutOfQueue(conversation, WAITING_FOR_COMPANY_REPLY_REASON);
        skipped++;
        continue;
      }

      const stage = await this.syncFollowUpStageFromSentLogs(conversation, userId);
      const intervals = config.intervalsMinutes || DEFAULT_INTERVALS;
      const delayMinutes = intervals[stage] || intervals[intervals.length - 1] || 10;
      const baseDate = conversation.lastMessageTime ? new Date(conversation.lastMessageTime) : new Date();
      let nextDate = addRandomSeconds(new Date(baseDate.getTime() + delayMinutes * 60 * 1000));
      if (nextDate <= new Date()) {
        nextDate = addRandomSeconds(new Date(Date.now() + 60 * 1000));
      }

      await db.update(conversations)
        .set({
          nextFollowupAt: nextDate,
          followupDisabledReason: null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));
      repaired++;
    }

    if (scanned > 0) {
      console.log(`[USER-FOLLOW-UP] Repair missing schedules: scanned=${scanned} repaired=${repaired} skipped=${skipped}`);
    }
    return { scanned, repaired, skipped };
  }

  /**
   * Processa todas as conversas pendentes de follow-up
   */
  private async processFollowUps() {
    // 🔧 FIX: Guard contra ciclos sobrepostos
    if (this.isProcessingCycle) {
      console.log("⏭️ [USER-FOLLOW-UP] Verificação anterior ainda em execução, pulando ciclo para evitar duplicatas");
      return;
    }

    this.isProcessingCycle = true;
    try {
      // 🚀 REMOVIDO: Verificação global hasAnyActiveWhatsAppConnection()
      // Motivo: Após restart do servidor, a memória está vazia mas o banco tem conexões ativas
      // NOVA ESTRATÉGIA: Verificar conexão por usuário específico no executeFollowUp
      // Isso permite processar follow-ups de usuários conectados mesmo se outros não estão
      
      const now = new Date();
      await this.repairMissingSchedules();
      
      // Buscar conversas que precisam de follow-up
      const pendingConversations = await db.query.conversations.findMany({
        where: and(
          eq(conversations.followupActive, true),
          isNotNull(conversations.nextFollowupAt),
          lte(conversations.nextFollowupAt, now)
        ),
        with: {
          connection: {
            with: {
              user: true
            }
          }
        }
      });

      if (pendingConversations.length > 0) {
        console.log(`🔍 [USER-FOLLOW-UP] Encontradas ${pendingConversations.length} conversas para processar`);
      }

      // 🔧 FIX: Deduplicar por conexão + número de telefone.
      // O mesmo número pode existir em duas conexões diferentes e deve gerar
      // follow-up independente em cada canal.
      const seenConversationScopes = new Set<string>();
      const uniqueConversations = [];
      
      // Ordenar por last_message_time desc para pegar a mais recente primeiro
      const sorted = [...pendingConversations].sort((a, b) => {
        const aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
        const bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
        return bTime - aTime;
      });
      
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
        console.log(`🔧 [USER-FOLLOW-UP] Deduplicação: ${pendingConversations.length} → ${uniqueConversations.length} conversas únicas`);
      }

      for (const conv of uniqueConversations) {
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
    conversation = { ...conversation, ...currentConv };

    const isSuspended = await checkUserSuspensionForFollowUp(userId);
    if (isSuspended) {
      console.log(`🚫 [USER-FOLLOW-UP] Usuário ${userId} está SUSPENSO - desativando follow-up da conversa`);
      await this.disableFollowUp(conversation.id, "Conta suspensa por violação de políticas");
      return;
    }

    // 🔌 VERIFICAÇÃO POR USUÁRIO: Verificar se ESTE usuário específico tem conexão ativa
    // Isso permite processar follow-ups de outros usuários mesmo se este não está conectado
    if (!(await this.ensureConversationSafeForFollowUpQueue(conversation, userId))) {
      return;
    }
    await this.syncFollowUpStageFromSentLogs(conversation, userId);

    const preferredConnectionId = conversation.connectionId || conversation.connection?.id;
    if (!(await isUserConnectionActive(userId, preferredConnectionId))) {
      // 🔧 FIX 2026-02-25: NÃO sobrescrever nextFollowupAt se a conversa já está agendada
      // para o futuro (>10min). Isso evita que PM2 restarts destruam agendamentos corretos.
      const existingNext = conversation.nextFollowupAt ? new Date(conversation.nextFollowupAt) : null;
      const tenMinFromNow = new Date(Date.now() + 10 * 60 * 1000);
      
      if (existingNext && existingNext > tenMinFromNow) {
        // Conversa já tem agendamento futuro válido - só marcar reason sem mudar data
        if (conversation.followupDisabledReason !== '🔄 Aguardando conexão WhatsApp...') {
          await db.update(conversations)
            .set({ followupDisabledReason: '🔄 Aguardando conexão WhatsApp...' })
            .where(eq(conversations.id, conversation.id));
          console.log(`⏸️ [USER-FOLLOW-UP] Usuário ${userId} sem conexão - marcando ${conversation.contactNumber} (preservando agenda: ${existingNext.toLocaleString()})`);
        }
      } else {
        // Conversa sem agendamento futuro - reagendar para 5 minutos
        const retryDate = addRandomSeconds(new Date(Date.now() + 5 * 60 * 1000));
        await db.update(conversations)
          .set({ 
            nextFollowupAt: retryDate,
            followupDisabledReason: '🔄 Aguardando conexão WhatsApp...'
          })
          .where(eq(conversations.id, conversation.id));
        if (conversation.followupDisabledReason !== '🔄 Aguardando conexão WhatsApp...') {
          console.log(`⏸️ [USER-FOLLOW-UP] Usuário ${userId} sem conexão ativa - reagendando ${conversation.contactNumber} para ${retryDate.toLocaleString()}`);
        }
      }
      return;
    }

    // 🔒 ANTI-DUPLICAÇÃO: Verificar se esta conversa já está sendo processada
    if (conversationsBeingProcessed.has(conversation.id)) {
      console.log(`⏳ [USER-FOLLOW-UP] Conversa ${conversation.contactNumber} já está sendo processada - ignorando`);
      return;
    }
    
    // Marcar como em processamento
    conversationsBeingProcessed.add(conversation.id);

    const latestRealMessage = await this.getLatestRealConversationMessage(conversation.id);
    if (latestRealMessage && !latestRealMessage.fromMe) {
      await this.holdFollowUpOutOfQueue(conversation, WAITING_FOR_COMPANY_REPLY_REASON);
      await this.logFollowUp(conversation, userId, 'skipped', null, { action: 'wait', reason: WAITING_FOR_COMPANY_REPLY_REASON }, WAITING_FOR_COMPANY_REPLY_REASON);
      conversationsBeingProcessed.delete(conversation.id);
      return;
    }

    console.log(`👉 [USER-FOLLOW-UP] Processando ${conversation.contactNumber} (Estágio ${conversation.followupStage})`);

    try {
      // � FIX CRÍTICO: Anti-spam cooldown - verificar se a última mensagem (nossa ou do cliente)
      // foi há menos de 10 minutos. Se sim, NÃO enviar follow-up agora.
      // Isso evita enviar follow-up enquanto conversa está ativa.
      try {
        const recentMsg = await db.query.messages.findFirst({
          where: eq(messages.conversationId, conversation.id),
          orderBy: (msgs, { desc }) => [desc(msgs.timestamp)],
        });
        
        if (recentMsg?.timestamp) {
          const ageMs = Date.now() - new Date(recentMsg.timestamp as any).getTime();
          const cooldownMs = 10 * 60 * 1000; // 10 minutos de cooldown mínimo
          if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < cooldownMs) {
            console.log(`🧊 [USER-FOLLOW-UP] Cooldown ativo (${Math.round(ageMs / 1000)}s desde última msg) para ${conversation.contactNumber}, reagendando`);
            // Reagendar para 10 min após a última mensagem
            const nextDate = addRandomSeconds(new Date(new Date(recentMsg.timestamp as any).getTime() + cooldownMs));
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

      // 1. Buscar configuração de follow-up do usuário
      const config = await this.getFollowupConfig(userId);
      if (!config || !config.isEnabled) {
        console.log(`🛑 [USER-FOLLOW-UP] Follow-up desativado para usuário ${userId}`);
        await this.disableFollowUp(conversation.id, "Usuário desativou follow-up");
        return;
      }

      // 2. Verificar horário comercial
      if (config.respectBusinessHours && !this.isBusinessHours(config)) {
        console.log(`⏰ [USER-FOLLOW-UP] Fora do horário comercial para ${conversation.contactNumber}`);
        // Agendar para o próximo horário comercial
        const nextBusinessTime = this.getNextBusinessTime(config);
        await this.scheduleNextFollowUp(conversation.id, nextBusinessTime);
        return;
      }

      // 3. Analisar histórico com IA - COM SISTEMA DE REGENERAÇÃO
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
        const nextDate = addRandomSeconds(new Date(Date.now() + 12 * 60 * 60 * 1000)); // 12h ao invés de 24h
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
        // Adiar por 24h com segundos aleatórios
        const nextDate = addRandomSeconds(new Date(Date.now() + 24 * 60 * 60 * 1000));
        await this.scheduleNextFollowUp(conversation.id, nextDate);
        await this.logFollowUp(conversation, userId, 'skipped', null, decision, decision.reason);
        return;
      }

      // 4. Gerar mensagem de follow-up
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
        
        // 🔒 ANTI-DUPLICAÇÃO: Verificar se mensagem similar já foi enviada recentemente
        if (wasMessageRecentlySent(conversation.id, decision.message)) {
          console.warn(`🔒 [USER-FOLLOW-UP] Mensagem DUPLICADA detectada para ${conversation.contactNumber} - NÃO enviando`);
          const nextDate = addRandomSeconds(new Date(Date.now() + 60 * 60 * 1000)); // 1 hora
          await this.scheduleNextFollowUp(conversation.id, nextDate);
          await this.logFollowUp(conversation, userId, 'skipped', decision.message, decision, 'Mensagem duplicada bloqueada');
          return;
        }
        
        // 4.1 Validação básica de segurança (a IA deve gerar mensagem correta)
        if (!validateMessage(decision.message)) {
          console.warn(`⚠️ [USER-FOLLOW-UP] Mensagem inválida para ${conversation.contactNumber}, reagendando`);
          const nextDate = addRandomSeconds(new Date(Date.now() + 30 * 60 * 1000)); // 30 min
          await this.scheduleNextFollowUp(conversation.id, nextDate);
          await this.logFollowUp(conversation, userId, 'skipped', decision.message, decision, 'Mensagem inválida');
          return;
        }

        if (this.onFollowUpReady && conversation.remoteJid) {
          console.log(`📤 [USER-FOLLOW-UP] Disparando follow-up para ${conversation.contactNumber}`);
          
          // 🔧 FIX: Definir nextFollowupAt futuro ANTES de enviar
          // Se advanceToNextStage falhar depois do envio, a conversa
          // não será reprocessada no próximo ciclo (evita duplicatas rápidas)
          const safetyDate = addRandomSeconds(new Date(Date.now() + 60 * 60 * 1000)); // 1h safety
          await db.update(conversations)
            .set({ nextFollowupAt: safetyDate })
            .where(eq(conversations.id, conversation.id));
          
          const result = await this.onFollowUpReady(
            userId,
            conversation.id,
            conversation.contactNumber,
            conversation.remoteJid,
            decision.message, // Mensagem da IA (já deve estar correta)
            conversation.followupStage || 0
          );

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
              null
            );
            await this.advanceToNextStage(conversation, config);
            
            // ⚠️ IMPORTANTE: NÃO reativamos a IA automaticamente após follow-up!
            // Follow-up e IA são sistemas INDEPENDENTES:
            // - Se o usuário desativou a IA, ela deve permanecer desativada
            // - O follow-up pode continuar funcionando mesmo com IA desativada
            // - A IA só deve ser reativada quando o usuário ativar manualmente
            console.log(`✅ [USER-FOLLOW-UP] Follow-up enviado para ${conversation.contactNumber} (IA permanece no estado atual)`);
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
                  followupDisabledReason: `🔄 Aguardando conexão WhatsApp...`
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
          console.warn("⚠️ [USER-FOLLOW-UP] Callback não registrado ou remoteJid ausente");
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
    
    let config = await db.query.followupConfigs.findFirst({
      where: eq(followupConfigs.userId, userId)
    });

    if (!config) {
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
      }).returning();
      config = newConfig;
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
    if (cleanData.isEnabled === false) {
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
    
    if (userId) {
      try {
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
    const historyFormatted = recentMessages
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
    const brazilNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
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
    
    // Determinar quem falou por último
    const lastMessageWasOurs = lastOurTime && lastClientTime ? lastOurTime > lastClientTime : !!lastOurTime;
    
    // Nome do cliente (do WhatsApp)
    const clientName = conversation.contactName || '';
    
    // Pegar últimas 5 mensagens que enviamos para evitar repetição
    const ourLastMessages = recentMessages
      .filter(m => m.fromMe && m.text)
      .slice(0, 5)
      .map(m => m.text?.replace(/\s*Áudio\s*$/gi, '').trim());

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

    // Extrair última mensagem do cliente para contexto
    const lastClientText = lastClientMessage?.text?.replace(/\s*Áudio\s*$/gi, '').trim() || '';

    const toneMap: Record<string, string> = {
      'consultivo': 'consultivo e prestativo',
      'vendedor': 'vendedor persuasivo mas sutil',
      'humano': 'casual e amigável',
      'técnico': 'profissional e direto'
    };

    // Identificar o último assunto/tópico da conversa
    const lastTopics = historyFormatted.slice(-5).map(h => h.mensagem).join(' ');
    
    // Verificar se já oferecemos algo específico
    const offeredDemo = ourLastMessages.some(m => m?.toLowerCase().includes('demo') || m?.toLowerCase().includes('vídeo') || m?.toLowerCase().includes('teste'));
    const offeredPrice = ourLastMessages.some(m => m?.toLowerCase().includes('99') || m?.toLowerCase().includes('199') || m?.toLowerCase().includes('preço') || m?.toLowerCase().includes('plano'));
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

## 📅 MOMENTO ATUAL
- Data: ${todayStr} (${todayName})  
- Hora: ${brazilNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
- Já conversamos HOJE: **${conversedToday ? 'SIM - NÃO cumprimentar de novo!' : 'NÃO'}**

## 👤 CLIENTE: ${clientName || 'Não identificado'}

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
${ourLastMessages.length > 0 ? ourLastMessages.map((m, i) => `${i+1}. "${m}"`).join('\n') : '(nenhuma)'}

## 📊 CONTEXTO
- Última fala do cliente: "${lastClientText}"
- Oferecemos demo/teste: ${offeredDemo ? 'SIM' : 'NÃO'}
- Falamos de preço: ${offeredPrice ? 'SIM' : 'NÃO'}

---

## 🎯 REGRAS DE DECISÃO

### SEND - Enviar quando:
- Cliente parou de responder há mais de 2 horas
- Temos algo NOVO para falar
- Conversa não teve fechamento negativo

### WAIT - Esperar quando:
- Cliente respondeu há menos de 2 horas
- Nós enviamos há menos de 2 horas sem resposta
- Não temos nada novo para agregar

### ABORT - Cancelar quando:
- Cliente disse NÃO claramente
- Cliente demonstrou irritação
- Cliente pediu para parar de enviar mensagens

---

## ✍️ COMO ESCREVER A MENSAGEM

⛔ **PROIBIDO** (NUNCA FAÇA):
${conversedToday ? '- NUNCA use "Oi", "Olá", "Bom dia/tarde/noite" - JÁ CONVERSAMOS HOJE!' : ''}
- NUNCA repita mensagens anteriores (nem com palavras diferentes)
- NUNCA use frases genéricas como "passo a passo", "entendi", "fico à disposição"
- NUNCA se apresente de novo (sem "sou X da empresa Y")
- NUNCA seja robótico ou formal demais

✅ **OBRIGATÓRIO** (SEMPRE FAÇA):
- Continue o ASSUNTO da conversa naturalmente
- Seja CURTO (1-2 frases no máximo)
- Pareça HUMANO, como um amigo/vendedor real
- Traga VALOR NOVO ou pergunta DIFERENTE
- Use o NOME do cliente se souber

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
{"action":"send|wait|abort|schedule","reason":"motivo curto","message":"texto (só se send)","scheduleDate":"YYYY-MM-DDTHH:MM (só se schedule)"}`;

    try {
      const mistral = await getLLMClient();
      // Usa modelo configurado no banco de dados (sem hardcode)
      const response = await mistral.chat.complete({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8 // Mais criatividade para variar mensagens
      });
      
      const rawContent = response.choices?.[0]?.message?.content || "";
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Tentar parsear JSON
      const parsed = JSON.parse(jsonStr);
      
      // 🔧 NOVA VERIFICAÇÃO: Se quem falou por último foi o CLIENTE, não é follow-up!
      // Follow-up é para retomar conversa quando CLIENTE não respondeu
      if (!lastMessageWasOurs && minutesSinceClient < 120) {
        console.log(`⏸️ [FOLLOW-UP] Cliente respondeu há ${minutesSinceClient}min e foi o último a falar - aguardando NOSSA resposta normal, não follow-up`);
        return { action: 'wait', reason: 'Cliente foi o último a falar - aguardar resposta normal da IA, não follow-up' };
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
        const isSimilar = ourLastMessages.some(prev => {
          if (!prev) return false;
          const similarity = this.calculateTextSimilarity(message, prev);
          console.log(`📊 Similaridade com msg anterior: ${(similarity * 100).toFixed(1)}%`);
          return similarity > 0.6; // 60% similar = muito parecido (MAIS RESTRITIVO)
        });
        
        if (isSimilar) {
          console.warn(`⚠️ [FOLLOW-UP] Mensagem SIMILAR detectada (>60%) - NÃO ENVIANDO`);
          return { action: 'wait', reason: 'Mensagem muito similar à anterior - evitando repetição' };
        }
        
        // Verificar se a mensagem parece repetitiva (mesma estrutura)
        const sameStructure = ourLastMessages.some(prev => {
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
        const hasExactPhrase = ourLastMessages.some(prev => {
          if (!prev || prev.length < 20) return false;
          // Dividir em frases e verificar se alguma é igual
          const prevPhrases = prev.split(/[.!?]/).filter(p => p.trim().length > 12);
          const newPhrases = message.split(/[.!?]/).filter(p => p.trim().length > 12);
          
          return newPhrases.some(np => 
            prevPhrases.some(pp => 
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
          const usedBefore = ourLastMessages.some(prev => prev?.toLowerCase().includes(phrase));
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
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matches = 0;
    for (const word of words1) {
      if (word.length > 3 && words2.includes(word)) matches++;
    }
    
    return matches / Math.max(words1.length, words2.length);
  }

  /**
   * Verifica se está em horário comercial (timezone Brasil)
   */
  private isBusinessHours(config: any): boolean {
    // Usar timezone do Brasil
    const now = new Date();
    const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentDay = brazilTime.getDay(); // 0 = domingo
    const currentHour = brazilTime.getHours();
    const currentMin = brazilTime.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;

    const businessDays = config.businessDays || [1, 2, 3, 4, 5];
    if (!businessDays.includes(currentDay)) {
      console.log(`⏰ [FOLLOW-UP] Dia ${currentDay} não está nos dias úteis ${JSON.stringify(businessDays)}`);
      return false;
    }

    const start = String(config.businessHoursStart || "09:00").slice(0, 5);
    const end = String(config.businessHoursEnd || "18:00").slice(0, 5);

    const isOpen = currentTime >= start && currentTime <= end;
    console.log(`⏰ [FOLLOW-UP] Horário atual: ${currentTime}, Horário comercial: ${start}-${end}, Aberto: ${isOpen}`);
    
    return isOpen;
  }

  /**
   * Calcula próximo horário comercial disponível (timezone Brasil)
   */
  private getNextBusinessTime(config: any): Date {
    const now = new Date();
    const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const businessDays = config.businessDays || [1, 2, 3, 4, 5];
    const start = String(config.businessHoursStart || "09:00").slice(0, 5);
    const [startHour, startMin] = start.split(':').map(Number);

    // Próximo dia útil às 9h
    let next = new Date(brazilTime);
    next.setHours(startHour, startMin, 0, 0);

    // Se já passou do horário de início hoje, ir para amanhã
    if (brazilTime >= next) {
      next.setDate(next.getDate() + 1);
    }

    // Avançar até encontrar um dia útil
    while (!businessDays.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }

    console.log(`📅 [FOLLOW-UP] Próximo horário comercial: ${next.toLocaleString('pt-BR')}`);
    return next;
  }

  /**
   * Avança para o próximo estágio de follow-up
   */
  private async advanceToNextStage(conversation: any, config: any) {
    const currentStage = conversation.followupStage || 0;
    const nextStage = currentStage + 1;
    const intervals = config.intervalsMinutes || DEFAULT_INTERVALS;

    let nextDate: Date;

    if (nextStage >= intervals.length) {
      if (config.infiniteLoop) {
        // Loop infinito: aleatorizar entre min e max dias
        const minDays = config.infiniteLoopMinDays || 15;
        const maxDays = config.infiniteLoopMaxDays || 30;
        const randomDays = Math.floor(Math.random() * (maxDays - minDays + 1) + minDays);
        nextDate = addRandomSeconds(new Date(Date.now() + randomDays * 24 * 60 * 60 * 1000));
        console.log(`🔄 [USER-FOLLOW-UP] Loop infinito: próximo em ${randomDays} dias`);
      } else {
        // Desativar follow-up
        await this.disableFollowUp(conversation.id, "Sequência completa");
        return;
      }
    } else {
      // FIX: Usar o intervalo do PRÓXIMO estágio, não do atual
      const delayMinutes = intervals[nextStage];
      nextDate = addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));
      console.log(`⏰ [USER-FOLLOW-UP] Estágio ${currentStage} → ${nextStage}, intervalo: ${delayMinutes} minutos`);
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
    
    await db.update(conversations)
      .set({ 
        followupActive: false, 
        nextFollowupAt: null,
        followupDisabledReason: reason
      })
      .where(eq(conversations.id, conversationId));
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
      const isManuallyDisabled = 
        reason.includes('Desativado pelo usuário') ||
        reason.includes('Usuário desativou') ||
        reason.includes('Desativado manualmente') ||
        reason.includes('Conta suspensa') ||
        reason.includes('lista de exclusão') ||
        reason.includes('Sequência completa') ||
        reason.includes('Conexão removida');
      
      if (isManuallyDisabled) {
        console.log(`🛑 [USER-FOLLOW-UP] Follow-up foi DESATIVADO para ${conversationId}. Motivo: ${reason}. NÃO reativando automaticamente.`);
        return;
      }
    }

    const intervals = config?.intervalsMinutes || DEFAULT_INTERVALS;
    const delayMinutes = intervals[0] || 10;
    const nextDate = addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));

    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: nextDate,
        followupDisabledReason: null
      })
      .where(eq(conversations.id, conversationId));

    console.log(`✅ [USER-FOLLOW-UP] Ativado para conversa ${conversationId}`);
  }

  /**
   * Reseta o ciclo quando o cliente responde
   * TÉCNICA DE FOLLOW-UP: Quando cliente responde, NÃO incomodar imediatamente.
   * Esperar um tempo maior (2h) para dar espaço à conversa fluir naturalmente.
   * Se o cliente está ATIVO conversando, não faz sentido mandar follow-up.
   */
  async resetFollowUpCycle(conversationId: string, reason?: string) {
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

    // 🔧 FIX CRÍTICO: NÃO reativar se foi desativado MANUALMENTE pelo usuário
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
    
    // 🔧 FIX CRÍTICO: Quando cliente responde, dar mais tempo antes do próximo follow-up
    // TÉCNICA: Esperar 2 HORAS após cliente responder, mas MANTER o estágio atual!
    // NÃO resetar para stage 0 - isso causava envio repetido do mesmo estágio dezenas de vezes.
    // Ex: Cliente no stage 3 responde "ok" → antes resetava pra 0 → stage 0 enviado de novo.
    // Agora: mantém stage 3, pausa 2h, e na próxima execução avança para stage 4.
    const delayMinutes = 120; // 2 horas de "respiro" após cliente responder
    const twoHoursFromNow = addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));
    const currentStage = conversation.followupStage || 0;

    // 🔧 FIX BUG "ENVIANDO SEM PARAR" 2026-02-26:
    // Se advanceToNextStage já agendou o próximo follow-up para ALÉM de 2h (ex: 15-30 dias no infinite_loop),
    // NÃO encurtar o intervalo para 2h! Isso causava:
    // 1. Follow-up stage 6 enviado → advanceToNextStage → stage 7 com 20 dias
    // 2. Cliente responde → resetFollowUpCycle → SOBRESCREVE 20 dias para 2h (BUG!)
    // 3. Após 2h, envia stage 7 → advance → stage 8 com 25 dias
    // 4. Cliente responde novamente → 2h → repete → enviando "sem parar"
    // 
    // CORREÇÃO: Só aplicar pausa de 2h se nextFollowupAt NÃO está além de 2h.
    // Se já está agendado para daqui 15 dias, manter esse agendamento.
    const existingNext = conversation.nextFollowupAt ? new Date(conversation.nextFollowupAt) : null;
    
    if (existingNext && existingNext > twoHoursFromNow) {
      console.log(`ℹ️ [USER-FOLLOW-UP] ${reason || 'Cliente respondeu'}. Follow-up já agendado para ${existingNext.toLocaleString()} (> 2h). Mantendo agendamento existente para ${conversationId} (stage ${currentStage}).`);
      return;
    }

    await db.update(conversations)
      .set({ 
        followupActive: true,
        // 🔧 MANTER estágio atual - NÃO resetar para 0!
        // followupStage permanece inalterado (não incluído no set)
        nextFollowupAt: twoHoursFromNow,
        followupDisabledReason: null
      })
      .where(eq(conversations.id, conversationId));
      
    console.log(`🔄 [USER-FOLLOW-UP] ${reason || 'Cliente respondeu'}. Ciclo pausado por 2h para ${conversationId} (stage ${currentStage} mantido, dar espaço à conversa)`);
  }

  /**
   * Agenda um follow-up manual para uma data/hora específica
   */
  async scheduleManualFollowUp(conversationId: string, scheduledFor: Date, note?: string) {
    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: -1, // -1 indica agendamento manual
        nextFollowupAt: scheduledFor,
        followupDisabledReason: note ? `📅 Agendado: ${note}` : '📅 Agendamento manual'
      })
      .where(eq(conversations.id, conversationId));
      
    console.log(`📅 [USER-FOLLOW-UP] Agendamento manual criado para ${conversationId}: ${scheduledFor.toLocaleString()}`);
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
    const logs = await db.query.userFollowupLogs.findMany({
      where: eq(userFollowupLogs.userId, userId)
    });

    const pendingConversations = await db.query.conversations.findMany({
      where: and(
        eq(conversations.followupActive, true),
        isNotNull(conversations.nextFollowupAt)
      ),
      with: {
        connection: true
      }
    });

    const userPending = pendingConversations.filter(c => c.connection?.userId === userId);

    return {
      totalSent: logs.filter(l => l.status === 'sent').length,
      totalFailed: logs.filter(l => l.status === 'failed').length,
      totalCancelled: logs.filter(l => l.status === 'cancelled').length,
      totalSkipped: logs.filter(l => l.status === 'skipped').length,
      pending: userPending.length,
      scheduledToday: userPending.filter(c => {
        if (!c.nextFollowupAt) return false;
        const today = new Date();
        const scheduled = new Date(c.nextFollowupAt);
        return scheduled.toDateString() === today.toDateString();
      }).length
    };
  }

  /**
   * Lista conversas com follow-up ativo do usuário
   */
  async getPendingFollowUps(userId: string) {
    const allPending = await db.query.conversations.findMany({
      where: and(
        eq(conversations.followupActive, true),
        isNotNull(conversations.nextFollowupAt)
      ),
      with: {
        connection: true
      },
      orderBy: (conv, { asc }) => [asc(conv.nextFollowupAt)]
    });

    return allPending.filter(c => c.connection?.userId === userId);
  }

  /**
   * Reorganiza todos os follow-ups pendentes de um usuário
   * Recalcula as datas baseado na configuração atual (horários, dias úteis, etc.)
   */
  async reorganizeAllFollowups(userId: string): Promise<{ reorganized: number; skipped: number }> {
    console.log(`🔄 [USER-FOLLOW-UP] Reorganizando todos os follow-ups para usuário ${userId}`);
    
    const config = await this.getFollowupConfig(userId);
    if (!config || !config.isEnabled) {
      console.log(`⚠️ [USER-FOLLOW-UP] Follow-up desabilitado para usuário ${userId}`);
      return { reorganized: 0, skipped: 0 };
    }

    await this.repairMissingSchedules(50000, userId);

    // Buscar todas as conversas com follow-up ativo
    const pendingConversations = await db.query.conversations.findMany({
      where: eq(conversations.followupActive, true),
      with: {
        connection: true
      }
    });

    // Filtrar só as do usuário
    const userConversations = pendingConversations.filter(c => c.connection?.userId === userId);
    
    let reorganized = 0;
    let skipped = 0;
    const intervals = config.intervalsMinutes || DEFAULT_INTERVALS;
    const now = new Date();

    for (const conversation of userConversations) {
      try {
        if (!(await this.ensureConversationSafeForFollowUpQueue(conversation, userId))) {
          skipped++;
          continue;
        }

        const latestMessage = await this.getLatestRealConversationMessage(conversation.id);
        if (latestMessage && !latestMessage.fromMe) {
          await this.holdFollowUpOutOfQueue(conversation, WAITING_FOR_COMPANY_REPLY_REASON);
          skipped++;
          continue;
        }

        const stage = await this.syncFollowUpStageFromSentLogs(conversation, userId);
        const delayMinutes = intervals[stage] || intervals[intervals.length - 1] || 10;
        
        // Calcular nova data baseada em lastMessageTime ou now
        const baseDate = conversation.lastMessageTime 
          ? new Date(conversation.lastMessageTime) 
          : now;
        
        let newDate = new Date(baseDate.getTime() + delayMinutes * 60 * 1000);
        
        // Se a nova data já passou, usar a partir de agora
        if (newDate < now) {
          newDate = new Date(now.getTime() + 1 * 60 * 1000); // 1 minuto a partir de agora
        }
        
        // Verificar horário comercial e ajustar se necessário
        if (!this.isBusinessHours(config)) {
          const nextBusinessTime = this.getNextBusinessTime(config);
          if (nextBusinessTime && nextBusinessTime > newDate) {
            newDate = nextBusinessTime;
          }
        } else {
          // Verificar se a nova data está dentro do horário comercial
          const brazilTime = new Date(newDate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
          const day = brazilTime.getDay();
          const hours = brazilTime.getHours();
          const minutes = brazilTime.getMinutes();
          const currentMinutes = hours * 60 + minutes;
          
          const businessDays = config.businessDays || [1, 2, 3, 4, 5];
          const [startHour, startMin] = (config.businessHoursStart || '09:00').split(':').map(Number);
          const [endHour, endMin] = (config.businessHoursEnd || '18:00').split(':').map(Number);
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;
          
          if (!businessDays.includes(day) || currentMinutes < startMinutes || currentMinutes >= endMinutes) {
            const nextBusinessTime = this.getNextBusinessTime(config);
            if (nextBusinessTime) {
              newDate = nextBusinessTime;
            }
          }
        }
        
        // Adicionar segundos aleatórios para parecer mais humano
        newDate = addRandomSeconds(newDate);
        
        await db.update(conversations)
          .set({ 
            nextFollowupAt: newDate,
            followupDisabledReason: null
          })
          .where(eq(conversations.id, conversation.id));
        
        reorganized++;
        console.log(`✅ [USER-FOLLOW-UP] Reorganizado: ${conversation.contactNumber} -> ${newDate.toISOString()}`);
      } catch (error) {
        console.error(`❌ [USER-FOLLOW-UP] Erro ao reorganizar ${conversation.id}:`, error);
        skipped++;
      }
    }
    
    console.log(`🔄 [USER-FOLLOW-UP] Reorganização concluída: ${reorganized} reorganizados, ${skipped} ignorados`);
    return { reorganized, skipped };
  }

  /**
   * Limpa o status de "aguardando conexão" para todas as conversas de uma conexão específica
   * Chamado quando o WhatsApp reconecta para permitir que os follow-ups sejam processados novamente
   * 
   * 🚀 OTIMIZADO: Faz apenas 1 UPDATE direto sem SELECT prévio
   */
  async clearConnectionWaitingStatus(connectionId: string): Promise<number> {
    try {
      {
        const connection = await storage.getConnectionById(connectionId).catch(() => null);
        const status = await getGatewayStatusForConnection(connectionId);
        const connectionPhone = getConnectionPhone(connection, status);

        if (!connection || !connectionPhone) {
          return 0;
        }

        const nextDate = addRandomSeconds(new Date(Date.now() + 2 * 60 * 1000));
        const futureThreshold = new Date(Date.now() + 10 * 60 * 1000);

        await db.execute(sql`
          UPDATE conversations
          SET next_followup_at = NULL,
              followup_disabled_reason = ${FOLLOWUP_OWNER_UNVERIFIED_REASON},
              updated_at = NOW()
          WHERE connection_id = ${connectionId}
            AND followup_active = TRUE
            AND (
              owner_phone_number IS NULL
              OR regexp_replace(owner_phone_number, '\\D', '', 'g') = ''
            )
            AND (
              followup_disabled_reason = ${WAITING_FOR_WHATSAPP_CONNECTION_REASON}
              OR followup_disabled_reason ILIKE '%Aguardando%conex%'
            )
        `);

        await db.execute(sql`
          UPDATE conversations
          SET next_followup_at = NULL,
              followup_disabled_reason = ${FOLLOWUP_OWNER_MISMATCH_REASON},
              updated_at = NOW()
          WHERE connection_id = ${connectionId}
            AND followup_active = TRUE
            AND owner_phone_number IS NOT NULL
            AND regexp_replace(owner_phone_number, '\\D', '', 'g') <> ${connectionPhone}
            AND (
              followup_disabled_reason = ${WAITING_FOR_WHATSAPP_CONNECTION_REASON}
              OR followup_disabled_reason ILIKE '%Aguardando%conex%'
            )
        `);

        const result = await db.execute(sql`
          UPDATE conversations
          SET next_followup_at = ${nextDate},
              followup_disabled_reason = NULL,
              updated_at = NOW()
          WHERE connection_id = ${connectionId}
            AND followup_active = TRUE
            AND owner_phone_number IS NOT NULL
            AND regexp_replace(owner_phone_number, '\\D', '', 'g') = ${connectionPhone}
            AND (
              followup_disabled_reason = ${WAITING_FOR_WHATSAPP_CONNECTION_REASON}
              OR followup_disabled_reason ILIKE '%Aguardando%conex%'
            )
            AND (next_followup_at IS NULL OR next_followup_at <= ${futureThreshold})
          RETURNING id
        `);

        await db.execute(sql`
          UPDATE conversations
          SET followup_disabled_reason = NULL,
              updated_at = NOW()
          WHERE connection_id = ${connectionId}
            AND followup_active = TRUE
            AND owner_phone_number IS NOT NULL
            AND regexp_replace(owner_phone_number, '\\D', '', 'g') = ${connectionPhone}
            AND (
              followup_disabled_reason = ${WAITING_FOR_WHATSAPP_CONNECTION_REASON}
              OR followup_disabled_reason ILIKE '%Aguardando%conex%'
            )
            AND next_followup_at > ${futureThreshold}
        `);

        const count = result.rowCount || (result.rows || []).length || 0;
        if (count > 0) {
          console.log(`[USER-FOLLOW-UP] ${count} conversas reativadas para conexao ${connectionId} com owner_phone conferido`);
        }
        return count;
      }

      // Reagendar para 2 minutos no futuro
      const nextDate = addRandomSeconds(new Date(Date.now() + 2 * 60 * 1000));
      
      // 🔧 FIX 2026-02-25: PROTEGER conversas que já têm nextFollowupAt no futuro (>10min).
      // Sem isso, após PM2 restart + reconexão, clearConnectionWaitingStatus SOBRESCREVIA
      // o nextFollowupAt de conversas que já foram corretamente agendadas por advanceToNextStage
      // (ex: 48h → overwritten para now+2min), causando follow-ups disparados em rajada.
      // Agora: só reagenda conversas cujo nextFollowupAt já passou ou está próximo (<10min).
      const futureThreshold = new Date(Date.now() + 10 * 60 * 1000); // 10 min no futuro
      
      const result = await db.update(conversations)
        .set({ 
          followupDisabledReason: null,
          nextFollowupAt: nextDate
        })
        .where(and(
          eq(conversations.connectionId, connectionId),
          eq(conversations.followupActive, true),
          eq(conversations.followupDisabledReason, '🔄 Aguardando conexão WhatsApp...'),
          lte(conversations.nextFollowupAt, futureThreshold)
        ))
        .returning({ id: conversations.id });
      
      // Também limpar a reason (sem mudar nextFollowupAt) para conversas futuras
      // para que não fiquem marcadas como 'Aguardando' eternamente
      const futureClean = await db.update(conversations)
        .set({ 
          followupDisabledReason: null
        })
        .where(and(
          eq(conversations.connectionId, connectionId),
          eq(conversations.followupActive, true),
          eq(conversations.followupDisabledReason, '🔄 Aguardando conexão WhatsApp...')
        ))
        .returning({ id: conversations.id });
      
      const count = result.length;
      const futureCount = futureClean.length;
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
