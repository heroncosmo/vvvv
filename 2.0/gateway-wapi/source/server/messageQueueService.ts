/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    🛡️ SISTEMA ANTI-BLOQUEIO WHATSAPP v5.1                    ║
 * ║                                                                              ║
 * ║  Sistema SIMPLIFICADO e FUNCIONAL anti-banimento:                           ║
 * ║                                                                              ║
 * ║  1. Fila de mensagens POR CANAL WHATSAPP (cada cliente SaaS tem sua fila)   ║
 * ║  2. Delay REALISTA de 5-15 segundos entre mensagens                         ║
 * ║  3. Sistema de LOTES: após 10 mensagens, pausa de 1 MINUTO                  ║
 * ║  4. Detecta mensagem manual do DONO e conta no delay                        ║
 * ║  5. Simulação de digitação antes de cada mensagem (TYPING INDICATOR)        ║
 * ║  6. DEDUPLICAÇÃO - Nunca reenvia após instabilidade                         ║
 * ║  7. Cache de metadados de grupos (evita rate limit)                         ║
 * ║                                                                              ║
 * ║  ❌ SEM rate limiting absurdo (10 msgs/hora era ridículo)                   ║
 * ║  ❌ SEM safe mode desnecessário                                             ║
 * ║  ❌ SEM limites diários que atrapalham negócios                             ║
 * ║                                                                              ║
 * ║  IMPORTANTE: Cada canal WhatsApp (cliente SaaS) tem sua própria fila!       ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { WASocket } from "@whiskeysockets/baileys";
import { canSendMessage, MessageType, MessageSource } from './messageDeduplicationService';
import { antiBanProtectionService, ANTI_BAN_CONFIG } from './antiBanProtectionService';
import { AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID } from './conversationAutoPauseGuard';
import { channelDispatchLock } from './channelDispatchLock';
import { countPendingPriorityConversations, resolvePendingPriorityWaitMs } from './outboundPriorityGuard';

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERFACE E TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

interface QueuedMessage {
  id: string;
  jid: string;
  text: string;
  originalText: string;
  options?: {
    isFromAgent?: boolean;
    mediaType?: string;
    mediaUrl?: string;
    caption?: string;
    conversationId?: string;
    messageType?: MessageType;
    source?: MessageSource;
    bypassDeduplication?: boolean;
  };
  priority: 'high' | 'normal' | 'low';
  addedAt: number;
  resolve: (result: MessageSendResult) => void;
  reject: (error: Error) => void;
  dedupChecked?: boolean;
}

interface MessageSendResult {
  success: boolean;
  messageId?: string;
  variedText?: string;
  error?: string;
}

interface WhatsAppQueueState {
  queue: QueuedMessage[];
  isProcessing: boolean;
  lastSentAt: number;
  totalSent: number;
  totalErrors: number;
  directExecutionPending: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 CLASSE PRINCIPAL DO SERVIÇO DE FILA (SIMPLIFICADO v5.0)
// ═══════════════════════════════════════════════════════════════════════════════

class MessageQueueService {
  // Mapa de filas: userId -> estado da fila daquele WhatsApp
  private queues = new Map<string, WhatsAppQueueState>();
  // Serializa execuções diretas (executeWithDelay) por canal para evitar bursts concorrentes
  private directExecutionChains = new Map<string, Promise<void>>();
  
  // Callback para enviar mensagem real (injetado pelo whatsapp.ts)
  private sendCallback: ((userId: string, jid: string, text: string, options?: any) => Promise<string | null>) | null = null;

  constructor() {
    console.log('🛡️ [ANTI-BLOCK v5.0] MessageQueueService SIMPLIFICADO iniciado');
    console.log(`   📊 Config: ${ANTI_BAN_CONFIG.MIN_DELAY_MS/1000}-${ANTI_BAN_CONFIG.MAX_DELAY_MS/1000}s delay, ${ANTI_BAN_CONFIG.BATCH_SIZE} msgs/lote, ${ANTI_BAN_CONFIG.BATCH_PAUSE_MS/1000}s pausa`);
    
    // Limpar filas vazias a cada 5 minutos
    setInterval(() => this.cleanupEmptyQueues(), 5 * 60 * 1000);
  }

  /**
   * Registra o callback para envio real de mensagens
   * Deve ser chamado pelo whatsapp.ts após inicialização
   */
  registerSendCallback(callback: (userId: string, jid: string, text: string, options?: any) => Promise<string | null>): void {
    this.sendCallback = callback;
    console.log('🛡️ [ANTI-BLOCK] Callback de envio registrado');
  }

  /**
   * Adiciona mensagem à fila do WhatsApp específico
   * Retorna uma Promise que resolve quando a mensagem for enviada
   */
  async enqueue(
    userId: string,
    jid: string,
    text: string,
    options?: {
      isFromAgent?: boolean;
      priority?: 'high' | 'normal' | 'low';
      conversationId?: string;
      connectionId?: string;
      messageType?: MessageType;
      source?: MessageSource;
      bypassDeduplication?: boolean;
    }
  ): Promise<MessageSendResult> {
    // Inicializar fila do usuário se não existir
    if (!this.queues.has(userId)) {
      this.queues.set(userId, {
        queue: [],
        isProcessing: false,
        lastSentAt: Date.now(),
        totalSent: 0,
        totalErrors: 0,
        directExecutionPending: 0,
      });
      console.log(`🛡️ [ANTI-BLOCK v5.0] Nova fila criada para ${userId.substring(0, 8)}...`);
    }

    const state = this.queues.get(userId)!;
    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const queuedMessage: QueuedMessage = {
        id: messageId,
        jid,
        text: text,
        originalText: text,
        options,
        priority: options?.priority || 'normal',
        addedAt: Date.now(),
        resolve,
        reject,
      };

      // Inserir na posição correta baseado em prioridade
      this.insertByPriority(state.queue, queuedMessage);

      console.log(`🛡️ [ANTI-BLOCK v5.0] Mensagem enfileirada para ${userId.substring(0, 8)}...`);
      console.log(`   📊 Fila: ${state.queue.length} | Prioridade: ${options?.priority || 'normal'}`);
      console.log(`   📝 Texto: "${text.substring(0, 50)}..."`);

      // Iniciar processamento se não estiver rodando
      if (!state.isProcessing) {
        this.processQueue(userId);
      }
    });
  }

  /**
   * Insere mensagem na fila respeitando prioridade
   * high > normal > low
   */
  private insertByPriority(queue: QueuedMessage[], message: QueuedMessage): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const msgPriority = priorityOrder[message.priority];

    // Encontrar posição correta
    let insertIndex = queue.length;
    for (let i = 0; i < queue.length; i++) {
      if (priorityOrder[queue[i].priority] > msgPriority) {
        insertIndex = i;
        break;
      }
    }

    queue.splice(insertIndex, 0, message);
  }

  /**
   * Processa a fila de um canal WhatsApp específico
   * v5.1 SIMPLIFICADO: Delay 5-15s + pausa 1 min após 10 msgs
   */
  private async processQueue(userId: string): Promise<void> {
    const state = this.queues.get(userId);
    if (!state || state.isProcessing) return;

    state.isProcessing = true;

    while (state.queue.length > 0) {
      if (state.directExecutionPending > 0) {
        console.log(
          `🛡️ [ANTI-BLOCK v5.0] Cedendo fila comum para envio direto prioritario: ${userId.substring(0, 8)}...`,
        );
        break;
      }

      const message = state.queue.shift()!;
      const contactNumber = message.jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      
      try {
        // Verificar se pode enviar (pausa de lote?)
        const canSendCheck = antiBanProtectionService.canSendMessage(userId);
        if (!canSendCheck.canSend) {
          console.log(`🛡️ [ANTI-BLOCK v5.0] ⏸️ ${canSendCheck.reason}`);
          
          // Colocar mensagem de volta na fila
          state.queue.unshift(message);
          
          // Aguardar
          await this.sleep(canSendCheck.waitMs);
          continue;
        }
        
        // Calcular delay (usa o serviço anti-ban)
        await antiBanProtectionService.prepareAdaptiveDelayPolicy(userId);
        const delay = antiBanProtectionService.calculateDelay(userId, contactNumber);
        
        // Calcular delay restante baseado no tempo desde último envio
        const now = Date.now();
        const timeSinceLastSent = now - state.lastSentAt;
        const remainingDelay = Math.max(0, delay - timeSinceLastSent);

        if (remainingDelay > 0) {
          console.log(`🛡️ [ANTI-BLOCK v5.0] ⏳ Aguardando ${(remainingDelay/1000).toFixed(1)}s antes de enviar...`);
          await this.sleep(remainingDelay);
        }

        const shouldYieldForReplies =
          message.priority === 'low' &&
          (!message.options?.conversationId || message.options?.isFromAgent === true);

        if (shouldYieldForReplies) {
          const pendingCount = await countPendingPriorityConversations(userId, message.options?.conversationId);
          if (pendingCount > 0) {
            const waitMs = resolvePendingPriorityWaitMs(pendingCount);
            console.log(
              `🛡️ [ANTI-BLOCK v5.0] ⏳ Cedendo canal para ${pendingCount} conversa(s) aguardando resposta por ${Math.ceil(waitMs / 1000)}s`,
            );
            state.queue.unshift(message);
            await this.sleep(waitMs);
            continue;
          }
        }

        // Enviar mensagem com exclusão mútua global do canal
        const result = await channelDispatchLock.runExclusive(
          userId,
          `legacy-queue ${message.priority}`,
          async () => this.sendMessage(userId, message),
        );
        
        state.lastSentAt = Date.now();
        state.totalSent++;
        
        // Registrar no serviço anti-ban (contador de lote)
        const batchResult = antiBanProtectionService.registerMessageSent(userId, contactNumber);
        
        if (batchResult.shouldPause) {
          console.log(
            `🛡️ [ANTI-BLOCK v5.0] 📦 Iniciando pausa de ${batchResult.pauseDuration/1000}s ` +
            `(nível progressivo do anti-ban)`,
          );
        }

        message.resolve(result);

      } catch (error: any) {
        state.totalErrors++;
        console.error(`🛡️ [ANTI-BLOCK v5.0] ❌ Erro ao enviar:`, error.message);
        message.reject(error);
      }
    }

    state.isProcessing = false;
  }

  /**
   * Envia mensagem real usando o callback registrado
   * 🆕 AGORA COM VERIFICAÇÃO DE DEDUPLICAÇÃO ANTES DO ENVIO!
   */
  private async sendMessage(userId: string, message: QueuedMessage): Promise<MessageSendResult> {
    if (!this.sendCallback) {
      throw new Error('Send callback not registered');
    }

    // 🆕 VERIFICAÇÃO DE DEDUPLICAÇÃO - NUNCA ENVIAR DUPLICATAS!
    // Isso protege contra reenvio após instabilidade/restart do servidor
    const contactNumber = message.jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    const conversationId = message.options?.conversationId || `${userId}:${contactNumber}`;
    const messageType = message.options?.messageType || 'ai_response';
    const source = message.options?.source || 'queue';
    
    const canSend = message.options?.bypassDeduplication === true
      ? true
      : await canSendMessage({
          userId,
          conversationId,
          contactNumber,
          content: message.text,
          messageType,
          source
        });

    if (message.options?.bypassDeduplication === true) {
      console.log(`[ANTI-BLOCK] Deduplicacao ignorada por opcao explicita para ${message.jid.substring(0, 15)}...`);
    }
    
    if (!canSend) {
      console.log(`🛡️ [ANTI-BLOCK] 🚫 MENSAGEM BLOQUEADA POR DEDUPLICAÇÃO!`);
      console.log(`   📧 Para: ${message.jid.substring(0, 15)}...`);
      console.log(`   📝 Texto: ${message.text.substring(0, 50)}...`);
      console.log(`   ⚠️ Esta mensagem já foi enviada anteriormente (proteção anti-reenvio)`);
      
      // Retornar sucesso SEM enviar - a mensagem já foi processada antes
      return {
        success: true,
        messageId: 'DEDUPLICATED_BLOCKED',
        variedText: undefined,
      };
    }

    console.log(`🛡️ [ANTI-BLOCK] 📤 Enviando mensagem para ${message.jid.substring(0, 15)}...`);
    
    const messageId = await this.sendCallback(userId, message.jid, message.text, message.options);

    if (messageId === AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID) {
      return {
        success: false,
        messageId,
        error: 'Conversa pausada por resposta manual do dono',
      };
    }

    return {
      success: true,
      messageId: messageId || undefined,
      variedText: message.text !== message.originalText ? message.text : undefined,
    };
  }

  /**
   * Gera delay aleatório entre MIN e MAX
   */
  private getRandomDelay(): number {
    return ANTI_BAN_CONFIG.MIN_DELAY_MS + 
      Math.random() * (ANTI_BAN_CONFIG.MAX_DELAY_MS - ANTI_BAN_CONFIG.MIN_DELAY_MS);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Limpa filas vazias para liberar memória
   */
  private cleanupEmptyQueues(): void {
    const now = Date.now();
    const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

    const entries = Array.from(this.queues.entries());
    for (const [userId, state] of entries) {
      if (state.queue.length === 0 && !state.isProcessing) {
        // Verificar se última mensagem foi há mais de 30 min
        if (now - state.lastSentAt > IDLE_TIMEOUT_MS) {
          this.queues.delete(userId);
          console.log(`🛡️ [ANTI-BLOCK v5.0] Fila removida por inatividade: ${userId.substring(0, 8)}...`);
        }
      }
    }
  }

  /**
   * Retorna estatísticas do serviço
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {
      version: 'v5.0-SIMPLES',
      totalQueues: this.queues.size,
      config: {
        minDelayMs: ANTI_BAN_CONFIG.MIN_DELAY_MS,
        maxDelayMs: ANTI_BAN_CONFIG.MAX_DELAY_MS,
        batchSize: ANTI_BAN_CONFIG.BATCH_SIZE,
        batchPauseMs: ANTI_BAN_CONFIG.BATCH_PAUSE_MS,
      },
      queues: {},
    };

    const entries = Array.from(this.queues.entries());
    for (const [userId, state] of entries) {
      const antiBanStats = antiBanProtectionService.getStats(userId);
      stats.queues[userId.substring(0, 8)] = {
        queueLength: state.queue.length,
        isProcessing: state.isProcessing,
        totalSent: state.totalSent,
        totalErrors: state.totalErrors,
        lastSentAt: state.lastSentAt ? new Date(state.lastSentAt).toISOString() : null,
        // Stats do serviço anti-ban
        batchCount: antiBanStats.consecutiveMessages,
        isPaused: antiBanStats.isPaused,
        pauseRemainingMs: antiBanStats.pauseRemainingMs,
      };
    }

    return stats;
  }

  getUserStats(userId: string): {
    queueLength: number;
    isProcessing: boolean;
    totalSent: number;
    totalErrors: number;
    lastSentAt: string | null;
    batchCount: number;
    isPaused: boolean;
    pauseRemainingMs: number;
    minuteCount: number;
    hourCount: number;
    dayCount: number;
    batchPauseLevel: number;
    currentPauseDurationMs: number;
  } {
    const state = this.queues.get(userId);
    const antiBanStats = antiBanProtectionService.getStats(userId);

    return {
      queueLength: state?.queue.length || 0,
      isProcessing: state?.isProcessing || false,
      totalSent: state?.totalSent || 0,
      totalErrors: state?.totalErrors || 0,
      lastSentAt: state?.lastSentAt ? new Date(state.lastSentAt).toISOString() : null,
      batchCount: antiBanStats.consecutiveMessages,
      isPaused: antiBanStats.isPaused,
      pauseRemainingMs: antiBanStats.pauseRemainingMs,
      minuteCount: antiBanStats.minuteCount,
      hourCount: antiBanStats.hourCount,
      dayCount: antiBanStats.dayCount,
      batchPauseLevel: antiBanStats.batchPauseLevel,
      currentPauseDurationMs: antiBanStats.currentPauseDurationMs,
    };
  }

  /**
   * Força limpeza de todas as filas (para shutdown)
   */
  clearAllQueues(): void {
    const entries = Array.from(this.queues.entries());
    for (const [userId, state] of entries) {
      // Rejeitar todas as mensagens pendentes
      for (const msg of state.queue) {
        msg.reject(new Error('Queue cleared'));
      }
      state.queue = [];
    }
    this.queues.clear();
    console.log('🛡️ [ANTI-BLOCK v5.0] Todas as filas limpas');
  }

  /**
   * Limpa a fila de um usuário específico
   */
  clearUserQueue(userId: string): { cleared: number; wasPending: boolean } {
    const state = this.queues.get(userId);
    if (!state) {
      console.log(`🛡️ [ANTI-BLOCK v5.0] Nenhuma fila encontrada para ${userId.substring(0, 8)}...`);
      return { cleared: 0, wasPending: false };
    }

    const queueSize = state.queue.length;
    const wasPending = state.isProcessing;

    // Rejeitar todas as mensagens pendentes
    for (const msg of state.queue) {
      msg.reject(new Error('Queue cleared'));
    }
    state.queue = [];
    state.isProcessing = false;

    // Resetar contador de lote no serviço anti-ban
    antiBanProtectionService.resetBatchCounter(userId);

    console.log(`🛡️ [ANTI-BLOCK v5.0] ✅ Fila do usuário ${userId.substring(0, 8)}... limpa: ${queueSize} mensagens removidas`);
    return { cleared: queueSize, wasPending };
  }

  /**
   * Obtém tamanho da fila de um usuário específico
   */
  getQueueSize(userId: string): number {
    return this.queues.get(userId)?.queue.length || 0;
  }

  /**
   * Verifica se um WhatsApp pode enviar mensagem agora
   */
  canSendNow(userId: string): { canSend: boolean; waitMs: number; reason?: string } {
    const state = this.queues.get(userId);
    if (!state) {
      return { canSend: true, waitMs: 0 };
    }

    // Verificar no serviço anti-ban
    const antiBanCheck = antiBanProtectionService.canSendMessage(userId);
    if (!antiBanCheck.canSend) {
      return { 
        canSend: false, 
        waitMs: antiBanCheck.waitMs,
        reason: antiBanCheck.reason 
      };
    }

    const timeSinceLastSent = Date.now() - state.lastSentAt;
    const waitMs = Math.max(0, ANTI_BAN_CONFIG.MIN_DELAY_MS - timeSinceLastSent);

    return {
      canSend: waitMs === 0 && state.queue.length === 0,
      waitMs,
    };
  }

  /**
   * Aguarda vez na fila para enviar mídia ou outros tipos
   */
  async waitForTurn(userId: string, description: string = 'mídia'): Promise<void> {
    return this.waitForTurnInternal(userId, description, false);
  }

  private async waitForTurnInternal(
    userId: string,
    description: string,
    prioritizeOverQueue: boolean,
  ): Promise<void> {
    // Obter ou criar estado da fila
    let state = this.queues.get(userId);
    if (!state) {
      state = {
        queue: [],
        isProcessing: false,
        lastSentAt: Date.now(),
        totalSent: 0,
        totalErrors: 0,
        directExecutionPending: 0,
      };
      this.queues.set(userId, state);
      console.log(`🛡️ [ANTI-BLOCK v5.0] Nova fila criada para mídia: ${userId.substring(0, 8)}...`);
    }

    if (prioritizeOverQueue) {
      state.directExecutionPending += 1;
    }

    try {
      // Verificar se está em pausa de lote
      const antiBanCheck = antiBanProtectionService.canSendMessage(userId);
      if (!antiBanCheck.canSend) {
        console.log(`🛡️ [ANTI-BLOCK v5.0] ⏸️ ${antiBanCheck.reason} - aguardando ${Math.ceil(antiBanCheck.waitMs/1000)}s`);
        await this.sleep(antiBanCheck.waitMs);
      }

      if (prioritizeOverQueue) {
        while (state.isProcessing) {
          console.log(`🛡️ [ANTI-BLOCK v5.0] ⏳ Aguardando envio em andamento terminar antes de enviar ${description}...`);
          await this.sleep(250);
          state = this.queues.get(userId)!;
        }
      } else {
        while (state.isProcessing || state.queue.length > 0) {
          console.log(`🛡️ [ANTI-BLOCK v5.0] ⏳ Aguardando fila de texto terminar antes de enviar ${description}...`);
          await this.sleep(1000);
          state = this.queues.get(userId)!;
        }
      }

      // Calcular delay necessário
      const contactNumber = 'media'; // Para mídia não temos contato específico
      await antiBanProtectionService.prepareAdaptiveDelayPolicy(userId);
      const delay = antiBanProtectionService.calculateDelay(userId, contactNumber);
      const timeSinceLastSent = Date.now() - state.lastSentAt;
      const remainingDelay = Math.max(0, delay - timeSinceLastSent);

      if (remainingDelay > 0) {
        console.log(`🛡️ [ANTI-BLOCK v5.0] 🎵 Aguardando ${(remainingDelay/1000).toFixed(1)}s antes de enviar ${description}`);
        await this.sleep(remainingDelay);
      }

      // Registrar envio no serviço anti-ban
      antiBanProtectionService.registerMessageSent(userId, contactNumber);

      state.lastSentAt = Date.now();
      state.totalSent++;

      console.log(`🛡️ [ANTI-BLOCK v5.0] ✅ Liberado para enviar ${description}`);
    } finally {
      if (prioritizeOverQueue) {
        const latestState = this.queues.get(userId);
        if (latestState) {
          latestState.directExecutionPending = Math.max(0, latestState.directExecutionPending - 1);
        }
      }
    }
  }

  /**
   * Notifica que um envio de mídia foi concluído
   */
  markMediaSent(userId: string): void {
    const state = this.queues.get(userId);
    if (state) {
      state.lastSentAt = Date.now();
    }
  }

  /**
   * Executa qualquer função de envio respeitando a fila
   */
  async executeWithDelay<T>(
    userId: string,
    description: string,
    sendFn: () => Promise<T>,
    options?: {
      yieldQueue?: boolean;
    },
  ): Promise<T> {
    const previous = this.directExecutionChains.get(userId) || Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const chain = previous
      .catch(() => undefined)
      .then(() => current);

    this.directExecutionChains.set(userId, chain);

    await previous.catch(() => undefined);

    try {
      await this.waitForTurnInternal(userId, description, Boolean(options?.yieldQueue));

      try {
        const result = await sendFn();
        this.markMediaSent(userId);
        return result;
      } catch (error) {
        this.markMediaSent(userId);
        throw error;
      }
    } finally {
      release();
      const state = this.queues.get(userId);
      if (state && state.queue.length > 0 && !state.isProcessing) {
        void this.processQueue(userId);
      }
      const latest = this.directExecutionChains.get(userId);
      if (latest === chain) {
        this.directExecutionChains.delete(userId);
      }
    }
  }
}

// Singleton exportado
export const messageQueueService = new MessageQueueService();

// ⚠️ VARIAÇÃO DE IA REMOVIDA - não re-exportar mais
// A humanização agora só está disponível em messageHumanizer.ts para uso em bulk send
// export { humanizeMessageWithAI } from "./messageHumanizer";

// Tipos exportados
export type { QueuedMessage, MessageSendResult, WhatsAppQueueState };
