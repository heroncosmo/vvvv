import { and, desc, eq, gte, sql } from "drizzle-orm";
import { conversations, messages, plans, subscriptions, whatsappConnections } from "@shared/schema";
import { db } from "./db";

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║              🛡️ SISTEMA ANTI-BLOQUEIO WHATSAPP v5.0 - SIMPLES E EFICAZ              ║
 * ╠══════════════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                                      ║
 * ║  📋 FUNCIONALIDADES PRINCIPAIS:                                                      ║
 * ║                                                                                      ║
 * ║  1. Delay entre mensagens (3-8 segundos) - variável para parecer humano             ║
 * ║  2. Detectar quando o DONO envia mensagem manual - contar no delay                  ║
 * ║  3. Sistema de LOTES: após 10 mensagens, pausa de 1 minuto                          ║
 * ║  4. Simulação de digitação ("composing") antes de cada mensagem                     ║
 * ║  5. Logs detalhados para monitoramento                                              ║
 * ║                                                                                      ║
 * ║  ❌ SEM rate limiting absurdo (10 msgs/hora é ridículo para negócios)               ║
 * ║  ❌ SEM limites diários que atrapalham o atendimento                                ║
 * ║                                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES ANTI-BANIMENTO v5.0 - REALISTAS E FUNCIONAIS
// ═══════════════════════════════════════════════════════════════════════════════

export const ANTI_BAN_CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // DELAYS ENTRE MENSAGENS (valores realistas - 10 a 20 segundos)
  // ═══════════════════════════════════════════════════════════════════════════
  
  MIN_DELAY_MS: 10000,          // 10 segundos mínimo
  MAX_DELAY_MS: 20000,          // 20 segundos máximo
  
  // Delay após mensagem manual do DONO
  OWNER_MESSAGE_DELAY_MS: 10000, // 10 segundos após dono enviar manualmente
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SISTEMA DE LOTES - Pausa após 10 mensagens consecutivas
  // ═══════════════════════════════════════════════════════════════════════════
  
  BATCH_SIZE: 10,               // Após 10 envios consecutivos
  BATCH_PAUSE_MS: 60000,        // Pausa de 1 MINUTO (60 segundos)
  BATCH_PAUSE_SEQUENCE_MS: [60000, 120000, 180000, 300000], // 1m → 2m → 3m → 5m em tráfego sustentado

  // ═══════════════════════════════════════════════════════════════════════════
  // JANELAS DE VAZÃO - evita campanha contínua quando existir backlog grande
  // ═══════════════════════════════════════════════════════════════════════════

  MAX_MESSAGES_PER_MINUTE: 8,   // Proteção adicional para rajadas curtas
  MAX_MESSAGES_PER_HOUR: 160,   // Proteção para backlog sustentado por muito tempo
  RATE_WINDOW_MINUTE_MS: 60_000,
  RATE_WINDOW_HOUR_MS: 60 * 60 * 1000,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITANDO (typing indicator) - Simula digitação antes de enviar
  // ═══════════════════════════════════════════════════════════════════════════
  
  TYPING_ENABLED: true,         // Habilitar simulação de digitação
  TYPING_MIN_MS: 1500,          // 1.5 segundos mínimo digitando
  TYPING_MAX_MS: 4000,          // 4 segundos máximo digitando
  TYPING_CHARS_PER_SECOND: 35,  // Velocidade simulada de digitação
};

// Para compatibilidade com código existente
export const ANTI_BAN_CONFIG_V4 = ANTI_BAN_CONFIG;

const HIGH_VOLUME_CONTACT_THRESHOLD = 100;
const HIGH_VOLUME_DELAY_MIN_MS = 60_000;
const HIGH_VOLUME_DELAY_MAX_MS = 240_000;
const ADAPTIVE_DELAY_CACHE_TTL_MS = 15_000;
const DEDICATED_AI_PLAN_ID = "d0cb4b21-f795-4b2f-bb8c-fb5be5118f6e";

// ═══════════════════════════════════════════════════════════════════════════════
//  TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface ChannelStats {
  userId: string;
  consecutiveMessages: number;  // Contador para sistema de lotes
  lastMessageAt: number;
  lastOwnerMessageAt: number;   // Última msg manual do dono
  lastOwnerMessageContact: string | null;
  isPaused: boolean;
  pauseEndAt: number;
  messageTimestamps: number[];
  batchPauseLevel: number;
  lastBatchPauseAt: number;
  currentPauseDurationMs: number;
}

interface AdaptiveDelayPolicy {
  fetchedAt: number;
  appliesHighVolumeDelay: boolean;
  isDedicatedAiPlan: boolean;
  uniqueInboundContactsToday: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CLASSE PRINCIPAL - PROTEÇÃO ANTI-BAN SIMPLIFICADA
// ═══════════════════════════════════════════════════════════════════════════════

class AntiBanProtectionService {
  private channelStats: Map<string, ChannelStats> = new Map();
  private adaptiveDelayPolicies = new Map<string, AdaptiveDelayPolicy>();
  private adaptiveDelayInflight = new Map<string, Promise<AdaptiveDelayPolicy>>();
  
  constructor() {
    console.log('🛡️ [ANTI-BAN v5.0] Sistema SIMPLIFICADO inicializado');
    console.log(`   📊 Delay entre msgs: ${ANTI_BAN_CONFIG.MIN_DELAY_MS/1000}-${ANTI_BAN_CONFIG.MAX_DELAY_MS/1000}s`);
    console.log(`   📊 Após msg do dono: +${ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS/1000}s`);
    console.log(`   📊 Lote: ${ANTI_BAN_CONFIG.BATCH_SIZE} msgs → pausa ${ANTI_BAN_CONFIG.BATCH_PAUSE_MS/1000}s`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  OBTER STATS DO CANAL
  // ═══════════════════════════════════════════════════════════════════════════
  
  private getChannelStats(userId: string): ChannelStats {
    if (!this.channelStats.has(userId)) {
      this.channelStats.set(userId, {
        userId,
        consecutiveMessages: 0,
        lastMessageAt: 0,
        lastOwnerMessageAt: 0,
        lastOwnerMessageContact: null,
        isPaused: false,
        pauseEndAt: 0,
        messageTimestamps: [],
        batchPauseLevel: 0,
        lastBatchPauseAt: 0,
        currentPauseDurationMs: ANTI_BAN_CONFIG.BATCH_PAUSE_MS,
      });
    }
    return this.channelStats.get(userId)!;
  }

  private clearExpiredPause(stats: ChannelStats, now: number): void {
    if (!stats.isPaused || now < stats.pauseEndAt) {
      return;
    }

    stats.isPaused = false;
    stats.consecutiveMessages = 0;
    stats.currentPauseDurationMs = ANTI_BAN_CONFIG.BATCH_PAUSE_MS;
    console.log(`🛡️ [ANTI-BAN v5.0] ▶️ Pausa de lote FINALIZADA - retomando`);
  }

  private pruneMessageTimestamps(stats: ChannelStats, now: number): void {
    const oldestAllowed = now - ANTI_BAN_CONFIG.RATE_WINDOW_HOUR_MS;
    stats.messageTimestamps = stats.messageTimestamps.filter((timestamp) => timestamp > oldestAllowed);
  }

  private resolveRateWindowWait(stats: ChannelStats, now: number): { waitMs: number; reason: string } {
    this.pruneMessageTimestamps(stats, now);

    const minuteCutoff = now - ANTI_BAN_CONFIG.RATE_WINDOW_MINUTE_MS;
    const minuteTimestamps = stats.messageTimestamps.filter((timestamp) => timestamp > minuteCutoff);

    let waitMs = 0;
    let reason = "OK";

    if (stats.messageTimestamps.length >= ANTI_BAN_CONFIG.MAX_MESSAGES_PER_HOUR) {
      const oldestHourTimestamp = stats.messageTimestamps[0];
      const hourWait = Math.max(0, oldestHourTimestamp + ANTI_BAN_CONFIG.RATE_WINDOW_HOUR_MS - now);
      if (hourWait > waitMs) {
        waitMs = hourWait;
        reason = `Janela horária (${stats.messageTimestamps.length}/${ANTI_BAN_CONFIG.MAX_MESSAGES_PER_HOUR})`;
      }
    }

    if (minuteTimestamps.length >= ANTI_BAN_CONFIG.MAX_MESSAGES_PER_MINUTE) {
      const oldestMinuteTimestamp = minuteTimestamps[0];
      const minuteWait = Math.max(0, oldestMinuteTimestamp + ANTI_BAN_CONFIG.RATE_WINDOW_MINUTE_MS - now);
      if (minuteWait > waitMs) {
        waitMs = minuteWait;
        reason = `Janela por minuto (${minuteTimestamps.length}/${ANTI_BAN_CONFIG.MAX_MESSAGES_PER_MINUTE})`;
      }
    }

    return { waitMs, reason };
  }

  private resolveBatchPauseDuration(stats: ChannelStats, now: number): number {
    const sequence = ANTI_BAN_CONFIG.BATCH_PAUSE_SEQUENCE_MS;
    const sustainedTraffic =
      stats.lastBatchPauseAt > 0 &&
      now - stats.lastBatchPauseAt <= ANTI_BAN_CONFIG.RATE_WINDOW_HOUR_MS;

    if (!sustainedTraffic) {
      stats.batchPauseLevel = 0;
    } else {
      stats.batchPauseLevel = Math.min(stats.batchPauseLevel + 1, sequence.length - 1);
    }

    const pauseDuration = sequence[stats.batchPauseLevel] || ANTI_BAN_CONFIG.BATCH_PAUSE_MS;
    stats.lastBatchPauseAt = now;
    stats.currentPauseDurationMs = pauseDuration;
    return pauseDuration;
  }

  private getCachedAdaptiveDelayPolicy(userId: string): AdaptiveDelayPolicy | null {
    const cached = this.adaptiveDelayPolicies.get(userId);
    if (!cached) {
      return null;
    }

    if (Date.now() - cached.fetchedAt > ADAPTIVE_DELAY_CACHE_TTL_MS) {
      this.adaptiveDelayPolicies.delete(userId);
      return null;
    }

    return cached;
  }

  private setAdaptiveDelayPolicy(userId: string, policy: Omit<AdaptiveDelayPolicy, "fetchedAt">): AdaptiveDelayPolicy {
    const resolvedPolicy: AdaptiveDelayPolicy = {
      ...policy,
      fetchedAt: Date.now(),
    };

    this.adaptiveDelayPolicies.set(userId, resolvedPolicy);
    return resolvedPolicy;
  }

  private normalizePlanText(value: string | null | undefined): string {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  private isDedicatedAiPlan(plan: { id?: string | null; nome?: string | null; caracteristicas?: string[] | null } | null | undefined): boolean {
    if (!plan) {
      return false;
    }

    if (plan.id === DEDICATED_AI_PLAN_ID) {
      return true;
    }

    if (this.normalizePlanText(plan.nome) === "ia dedicada") {
      return true;
    }

    return Array.isArray(plan.caracteristicas)
      && plan.caracteristicas.some((feature) => this.normalizePlanText(feature).includes("ia dedicada"));
  }

  private async getActivePlanSnapshot(userId: string): Promise<{
    id: string;
    nome: string;
    caracteristicas: string[] | null;
  } | null> {
    const [activePlan] = await db
      .select({
        id: plans.id,
        nome: plans.nome,
        caracteristicas: plans.caracteristicas,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "active"),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    return activePlan ?? null;
  }

  private async getTodayUniqueInboundContactsCount(userId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [result] = await db
      .select({
        count: sql<number>`cast(count(distinct ${conversations.contactNumber}) as integer)`,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .innerJoin(whatsappConnections, eq(conversations.connectionId, whatsappConnections.id))
      .where(
        and(
          eq(whatsappConnections.userId, userId),
          eq(messages.fromMe, false),
          gte(messages.timestamp, todayStart),
        ),
      );

    return result?.count ?? 0;
  }

  async prepareAdaptiveDelayPolicy(userId: string): Promise<AdaptiveDelayPolicy> {
    const cached = this.getCachedAdaptiveDelayPolicy(userId);
    if (cached) {
      return cached;
    }

    const inflight = this.adaptiveDelayInflight.get(userId);
    if (inflight) {
      return inflight;
    }

    const promise = (async () => {
      try {
        const [activePlan, uniqueInboundContactsToday] = await Promise.all([
          this.getActivePlanSnapshot(userId),
          this.getTodayUniqueInboundContactsCount(userId),
        ]);

        const isDedicatedAiPlan = this.isDedicatedAiPlan(activePlan);
        return this.setAdaptiveDelayPolicy(userId, {
          appliesHighVolumeDelay: !isDedicatedAiPlan && uniqueInboundContactsToday >= HIGH_VOLUME_CONTACT_THRESHOLD,
          isDedicatedAiPlan,
          uniqueInboundContactsToday,
        });
      } catch (error) {
        console.error(`🛡️ [ANTI-BAN v5.0] Falha ao atualizar política adaptativa para ${userId.substring(0, 8)}...`, error);
        return this.setAdaptiveDelayPolicy(userId, {
          appliesHighVolumeDelay: false,
          isDedicatedAiPlan: false,
          uniqueInboundContactsToday: 0,
        });
      } finally {
        this.adaptiveDelayInflight.delete(userId);
      }
    })();

    this.adaptiveDelayInflight.set(userId, promise);
    return promise;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  REGISTRAR MENSAGEM MANUAL DO DONO
  // ═══════════════════════════════════════════════════════════════════════════
  
  registerOwnerManualMessage(userId: string, contactNumber: string, _messageType?: string): void {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    
    // Atualizar stats
    stats.lastOwnerMessageAt = now;
    stats.lastOwnerMessageContact = contactNumber;
    
    // Mensagem manual do dono "reinicia" o contador de lote
    // (ele está ativamente conversando, então o padrão é mais humano)
    stats.consecutiveMessages = 0;
    stats.batchPauseLevel = 0;
    stats.currentPauseDurationMs = ANTI_BAN_CONFIG.BATCH_PAUSE_MS;
    
    console.log(`🛡️ [ANTI-BAN v5.0] 👤 Mensagem MANUAL do DONO detectada`);
    console.log(`   📱 Contato: ${contactNumber}`);
    console.log(`   🔄 Contador de lote reiniciado`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  CALCULAR DELAY ANTES DE ENVIAR
  // ═══════════════════════════════════════════════════════════════════════════
  
  calculateDelay(userId: string, contactNumber: string, options?: { applyHighVolumeDelay?: boolean }): number {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    this.clearExpiredPause(stats, now);

    if (stats.isPaused && now < stats.pauseEndAt) {
      const remainingPause = stats.pauseEndAt - now;
      console.log(`🛡️ [ANTI-BAN v5.0] ⏸️ Canal em PAUSA de lote por mais ${Math.ceil(remainingPause/1000)}s`);
      return remainingPause;
    }
    
    // Delay base aleatório (10-20 segundos)
    let delay = this.randomBetween(
      ANTI_BAN_CONFIG.MIN_DELAY_MS,
      ANTI_BAN_CONFIG.MAX_DELAY_MS
    );

    const adaptivePolicy = this.getCachedAdaptiveDelayPolicy(userId);
    if (options?.applyHighVolumeDelay !== false && adaptivePolicy?.appliesHighVolumeDelay) {
      const highVolumeDelay = this.randomBetween(HIGH_VOLUME_DELAY_MIN_MS, HIGH_VOLUME_DELAY_MAX_MS);
      delay = Math.max(delay, highVolumeDelay);
      console.log(
        `🛡️ [ANTI-BAN v5.0] 🐢 Alto volume ativo (${adaptivePolicy.uniqueInboundContactsToday} contatos hoje) - delay ${Math.ceil(highVolumeDelay / 1000)}s`,
      );
    }
    
    // Se o dono enviou mensagem recentemente para este contato, adicionar delay extra
    const timeSinceOwnerMessage = now - stats.lastOwnerMessageAt;
    if (timeSinceOwnerMessage < ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS &&
        stats.lastOwnerMessageContact === contactNumber) {
      const extraDelay = ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS - timeSinceOwnerMessage;
      delay += extraDelay;
      console.log(`🛡️ [ANTI-BAN v5.0] 👤 Dono enviou msg há ${Math.ceil(timeSinceOwnerMessage/1000)}s - delay extra: ${Math.ceil(extraDelay/1000)}s`);
    }
    
    // Verificar tempo desde última mensagem
    const timeSinceLastMessage = now - stats.lastMessageAt;
    if (timeSinceLastMessage < delay) {
      delay = Math.max(delay - timeSinceLastMessage, ANTI_BAN_CONFIG.MIN_DELAY_MS);
    }

    const rateWindow = this.resolveRateWindowWait(stats, now);
    if (rateWindow.waitMs > 0) {
      console.log(`🛡️ [ANTI-BAN v5.0] 🚦 ${rateWindow.reason} - aguardando ${Math.ceil(rateWindow.waitMs/1000)}s`);
    }

    return Math.max(delay, rateWindow.waitMs);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  REGISTRAR ENVIO DE MENSAGEM
  // ═══════════════════════════════════════════════════════════════════════════
  
  registerMessageSent(userId: string, contactNumber: string): { shouldPause: boolean; pauseDuration: number } {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    this.clearExpiredPause(stats, now);
    this.pruneMessageTimestamps(stats, now);

    // Atualizar stats
    stats.lastMessageAt = now;
    stats.consecutiveMessages++;
    stats.messageTimestamps.push(now);
    
    // Verificar se atingiu o limite de lote
    if (stats.consecutiveMessages >= ANTI_BAN_CONFIG.BATCH_SIZE) {
      const pauseDuration = this.resolveBatchPauseDuration(stats, now);
      stats.isPaused = true;
      stats.pauseEndAt = now + pauseDuration;
      
      console.log(`🛡️ [ANTI-BAN v5.0] 📦 LOTE DE ${ANTI_BAN_CONFIG.BATCH_SIZE} MSGS ATINGIDO`);
      console.log(`   ⏸️ Iniciando pausa de ${pauseDuration/1000} segundos (nível ${stats.batchPauseLevel + 1})`);
      
      return {
        shouldPause: true,
        pauseDuration,
      };
    }
    
    const minuteCutoff = now - ANTI_BAN_CONFIG.RATE_WINDOW_MINUTE_MS;
    const minuteCount = stats.messageTimestamps.filter((timestamp) => timestamp > minuteCutoff).length;
    const hourCount = stats.messageTimestamps.length;

    console.log(
      `🛡️ [ANTI-BAN v5.0] ✅ Msg enviada - Lote: ${stats.consecutiveMessages}/${ANTI_BAN_CONFIG.BATCH_SIZE} | ` +
      `1m: ${minuteCount}/${ANTI_BAN_CONFIG.MAX_MESSAGES_PER_MINUTE} | ` +
      `1h: ${hourCount}/${ANTI_BAN_CONFIG.MAX_MESSAGES_PER_HOUR}`,
    );
    
    return { shouldPause: false, pauseDuration: 0 };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  VERIFICAR SE PODE ENVIAR
  // ═══════════════════════════════════════════════════════════════════════════
  
  canSendMessage(userId: string): { canSend: boolean; waitMs: number; reason: string } {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    this.clearExpiredPause(stats, now);

    if (stats.isPaused && now < stats.pauseEndAt) {
      const waitMs = stats.pauseEndAt - now;
      return {
        canSend: false,
        waitMs,
        reason: `Pausa de lote (${Math.ceil(waitMs/1000)}s restantes)`,
      };
    }

    const rateWindow = this.resolveRateWindowWait(stats, now);
    if (rateWindow.waitMs > 0) {
      return {
        canSend: false,
        waitMs: rateWindow.waitMs,
        reason: `${rateWindow.reason} - aguarde ${Math.ceil(rateWindow.waitMs/1000)}s`,
      };
    }

    return { canSend: true, waitMs: 0, reason: 'OK' };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  CALCULAR DURAÇÃO DA DIGITAÇÃO
  // ═══════════════════════════════════════════════════════════════════════════
  
  calculateTypingDuration(messageLength: number): number {
    // Calcular tempo baseado no tamanho da mensagem
    const typingTime = (messageLength / ANTI_BAN_CONFIG.TYPING_CHARS_PER_SECOND) * 1000;
    
    // Limitar entre min e max
    return Math.min(
      Math.max(typingTime, ANTI_BAN_CONFIG.TYPING_MIN_MS),
      ANTI_BAN_CONFIG.TYPING_MAX_MS
    );
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  UTILITÁRIOS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  OBTER ESTATÍSTICAS
  // ═══════════════════════════════════════════════════════════════════════════
  
  getStats(userId: string): {
    consecutiveMessages: number;
    isPaused: boolean;
    pauseRemainingMs: number;
    minuteCount: number;
    hourCount: number;
    dayCount: number;
    batchPauseLevel: number;
    currentPauseDurationMs: number;
  } {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    this.clearExpiredPause(stats, now);
    this.pruneMessageTimestamps(stats, now);

    const minuteCutoff = now - ANTI_BAN_CONFIG.RATE_WINDOW_MINUTE_MS;
    const minuteCount = stats.messageTimestamps.filter((timestamp) => timestamp > minuteCutoff).length;
    const dayCutoff = now - 24 * 60 * 60 * 1000;
    const dayCount = stats.messageTimestamps.filter((timestamp) => timestamp > dayCutoff).length;

    return {
      consecutiveMessages: stats.consecutiveMessages,
      isPaused: stats.isPaused && now < stats.pauseEndAt,
      pauseRemainingMs: stats.isPaused ? Math.max(0, stats.pauseEndAt - now) : 0,
      minuteCount,
      hourCount: stats.messageTimestamps.length,
      dayCount,
      batchPauseLevel: stats.batchPauseLevel,
      currentPauseDurationMs: stats.currentPauseDurationMs,
    };
  }
  
  // Método para resetar contador (útil quando há interação do cliente)
  resetBatchCounter(userId: string): void {
    const stats = this.getChannelStats(userId);
    stats.consecutiveMessages = 0;
    stats.batchPauseLevel = 0;
    stats.currentPauseDurationMs = ANTI_BAN_CONFIG.BATCH_PAUSE_MS;
    console.log(`🛡️ [ANTI-BAN v5.0] 🔄 Contador de lote resetado para ${userId.substring(0, 8)}...`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  🗂️ CACHE DE METADADOS DE GRUPOS (evitar rate limits)
// ═══════════════════════════════════════════════════════════════════════════════

interface GroupMetadata {
  id: string;
  subject: string;
  participants?: string[];
  admins?: string[];
  fetchedAt: number;
}

class GroupMetadataCache {
  private cache = new Map<string, GroupMetadata>();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutos

  set(groupId: string, metadata: Omit<GroupMetadata, 'fetchedAt'>): void {
    this.cache.set(groupId, {
      ...metadata,
      fetchedAt: Date.now(),
    });
    console.log(`📦 [GROUP-CACHE] Metadados cacheados para grupo ${groupId.substring(0, 20)}...`);
  }

  get(groupId: string): GroupMetadata | null {
    const cached = this.cache.get(groupId);
    if (!cached) return null;
    
    // Verificar se expirou
    if (Date.now() - cached.fetchedAt > this.TTL_MS) {
      this.cache.delete(groupId);
      return null;
    }
    
    return cached;
  }

  has(groupId: string): boolean {
    const cached = this.get(groupId);
    return cached !== null;
  }

  delete(groupId: string): void {
    this.cache.delete(groupId);
  }

  clear(): void {
    this.cache.clear();
  }

  // Limpar entradas expiradas periodicamente
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.cache.forEach((value, key) => {
      if (now - value.fetchedAt > this.TTL_MS) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

export const groupMetadataCache = new GroupMetadataCache();

// Limpar cache a cada 10 minutos
setInterval(() => groupMetadataCache.cleanup(), 10 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════════
//  ⌨️ SIMULADOR DE DIGITAÇÃO (typing indicator)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Envia indicador de "digitando" antes de uma mensagem
 * @param socket - Socket do Baileys
 * @param jid - ID do chat
 * @param messageLength - Tamanho da mensagem (para calcular duração)
 */
export async function simulateTyping(
  socket: any,
  jid: string,
  messageLength: number = 100
): Promise<void> {
  if (!ANTI_BAN_CONFIG.TYPING_ENABLED || !socket) return;
  
  try {
    // Calcular duração baseada no tamanho da mensagem
    const duration = antiBanProtectionService.calculateTypingDuration(messageLength);
    
    // Enviar "composing" (digitando)
    await socket.sendPresenceUpdate('composing', jid);
    
    // Aguardar o tempo calculado
    await new Promise(resolve => setTimeout(resolve, duration));
    
    // Enviar "paused" (parou de digitar)
    await socket.sendPresenceUpdate('paused', jid);
    
    console.log(`⌨️ [TYPING] Simulação de digitação: ${Math.ceil(duration/1000)}s para ${jid.substring(0, 15)}...`);
  } catch (error) {
    // Erro de typing não deve bloquear envio
    console.warn(`⚠️ [TYPING] Erro ao simular digitação:`, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const antiBanProtectionService = new AntiBanProtectionService();
export default antiBanProtectionService;
