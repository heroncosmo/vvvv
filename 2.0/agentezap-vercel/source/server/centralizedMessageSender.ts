/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  🚀 CENTRALIZED MESSAGE SENDER v3.0 - POLL-BASED BUTTONS
 *  Sistema unificado para envio de TODAS as mensagens
 *  TODOS os sistemas DEVEM usar este serviço para enviar mensagens!
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Sistemas que DEVEM usar este serviço:
 * - ✅ Follow-up automático
 * - ✅ Notificador inteligente
 * - ✅ Mensagem manual (admin)
 * - ✅ Conversas normais
 * - ✅ Delivery
 * - ✅ Catálogo
 * - ✅ Agendamento
 * - ✅ AI Agent
 * - ✅ Broadcast
 * - ✅ Recovery
 * - ✅ Media (imagens, vídeos, áudios)
 * 
 * NUNCA faça socket.sendMessage() diretamente! Use este serviço.
 * 
 * v3.0 - NOVA IMPLEMENTAÇÃO COM ENQUETES/POLLS:
 * - Usa ENQUETES (polls) do WhatsApp para simular botões
 * - FUNCIONA EM TODOS OS DISPOSITIVOS (Android, iOS, Web)
 * - As enquetes aparecem como opções clicáveis
 * - Usuário vota na enquete = seleciona opção
 */

import { antiBanProtectionService, simulateTyping, groupMetadataCache, ANTI_BAN_CONFIG } from './antiBanProtectionService';
import { proto, generateWAMessageFromContent, generateWAMessageContent, getAggregateVotesInPollMessage } from '@whiskeysockets/baileys';
import type { AnyMessageContent, WASocket } from '@whiskeysockets/baileys';
import { shouldBlockAutomatedConversationSend } from './conversationAutoPauseGuard';
import { channelDispatchLock } from './channelDispatchLock';
import {
  countPendingPriorityConversations,
  resolveDispatchPriorityRank,
  resolvePendingPriorityWaitMs,
  shouldDeferAutomatedOrigin,
} from './outboundPriorityGuard';
import { buildPlainTextWhatsAppPayload } from './outboundTextPolicy';

// ═══════════════════════════════════════════════════════════════════════════════
//  🎛️ CONFIGURAÇÃO DE MENU NUMÉRICO
// ═══════════════════════════════════════════════════════════════════════════════

// DESABILITADO: Agora usamos TEXTO COM NÚMEROS para melhor compatibilidade
// O cliente digita o número ou escreve o que quer
const USE_POLLS_FOR_BUTTONS = false;

// Enviar texto antes explicando as opções
const SEND_CONTEXT_BEFORE_POLL = false;

// ═══════════════════════════════════════════════════════════════════════════════
//  📋 TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface SendMessageOptions {
  userId: string;          // ID do usuário/conexão
  jid: string;             // ID do destinatário
  content: AnyMessageContent; // Conteúdo da mensagem
  socket: WASocket;        // Socket do WhatsApp
  origin: MessageOrigin;   // Origem da mensagem (para logs e auditoria)
  priority?: MessagePriority; // Prioridade (normal, alta, urgente)
  quotedMessage?: any;     // Mensagem citada (reply)
  skipTyping?: boolean;    // Pular indicador de digitação
  isOwnerInitiated?: boolean; // Se o dono iniciou a conversa
  conversationId?: string; // Conversa alvo para respeitar auto-pause
}

type MessageOrigin = 
  | 'follow_up'
  | 'user_follow_up'
  | 'delivery'
  | 'catalog'
  | 'scheduling'
  | 'ai_agent'
  | 'broadcast'
  | 'recovery'
  | 'manual_admin'
  | 'conversation'
  | 'media'
  | 'notification'
  | 'whatsapp_sender'
  | 'chatbot_flow'
  | 'unknown';

type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  waitedMs?: number;
  deferred?: boolean;
  retryAfterMs?: number;
}

interface QueuedMessage {
  options: SendMessageOptions;
  resolve: (result: SendResult) => void;
  queuedAt: number;
  priorityRank: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  📊 ESTATÍSTICAS E LOGS
// ═══════════════════════════════════════════════════════════════════════════════

interface SendStats {
  totalSent: number;
  totalFailed: number;
  byOrigin: Record<MessageOrigin, number>;
  lastSentAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  🗳️ MAPEAMENTO DE POLLS PARA CAPTURAR VOTOS
// ═══════════════════════════════════════════════════════════════════════════════

interface PollMapping {
  pollMsgId: string;
  jid: string;
  buttons: any[]; // Array original de botões
  createdAt: number;
}

// Mapa global de polls: pollMsgId -> PollMapping
const pollMappings = new Map<string, PollMapping>();

// Limpar polls antigos (mais de 1 hora)
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const entries = Array.from(pollMappings.entries());
  for (const [msgId, mapping] of entries) {
    if (mapping.createdAt < oneHourAgo) {
      pollMappings.delete(msgId);
    }
  }
}, 10 * 60 * 1000); // Limpar a cada 10 minutos

// Exportar função para buscar mapping
export function getPollMapping(pollMsgId: string): PollMapping | undefined {
  return pollMappings.get(pollMsgId);
}

// Exportar função para obter ID do botão pelo texto votado
export function getButtonIdFromPollVote(pollMsgId: string, votedText: string): string | null {
  const mapping = pollMappings.get(pollMsgId);
  if (!mapping) return null;
  
  // Encontrar o botão cujo título corresponde ao texto votado
  const button = mapping.buttons.find((btn: any) => {
    const btnTitle = btn.reply?.title || btn.title || '';
    return btnTitle.toLowerCase() === votedText.toLowerCase();
  });
  
  if (button) {
    return button.reply?.id || button.id || votedText;
  }
  
  return votedText; // Retorna o próprio texto se não encontrar
}

// ═══════════════════════════════════════════════════════════════════════════════
//  🎯 CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

class CentralizedMessageSender {
  private stats: Map<string, SendStats> = new Map();
  private processing = new Map<string, boolean>();
  private queues = new Map<string, QueuedMessage[]>();

  private shouldApplyAdaptiveDelay(options: Pick<SendMessageOptions, "origin" | "isOwnerInitiated">): boolean {
    return options.isOwnerInitiated !== true && options.origin !== "manual_admin";
  }

  constructor() {
    console.log('🚀 [CENTRALIZED-SENDER v3.0] Sistema com ENQUETES inicializado');
    console.log(`   🗳️ Polls: ${USE_POLLS_FOR_BUTTONS ? 'ATIVADO' : 'DESATIVADO'}`);
    console.log(`   ⏱️ Delays: ${ANTI_BAN_CONFIG.MIN_DELAY_MS/1000}s - ${ANTI_BAN_CONFIG.MAX_DELAY_MS/1000}s`);
    console.log(`   ⌨️ Typing: ${ANTI_BAN_CONFIG.TYPING_ENABLED ? 'ATIVADO' : 'DESATIVADO'}`);
    console.log(`   📦 Batch: ${ANTI_BAN_CONFIG.BATCH_SIZE} msgs, pausa ${ANTI_BAN_CONFIG.BATCH_PAUSE_MS/1000}s`);
  }

  private async runExclusivePerUser<T>(userId: string, reason: string, task: () => Promise<T>): Promise<T> {
    return channelDispatchLock.runExclusive(userId, reason, task);
  }

  private insertByPriority(queue: QueuedMessage[], item: QueuedMessage): void {
    const index = queue.findIndex((queued) => queued.priorityRank < item.priorityRank);
    if (index === -1) {
      queue.push(item);
      return;
    }
    queue.splice(index, 0, item);
  }

  private async maybeDeferAutomatedSend(options: SendMessageOptions): Promise<SendResult | null> {
    const origin = options.origin;
    if (!shouldDeferAutomatedOrigin(origin as any)) {
      return null;
    }

    const pendingCount = await countPendingPriorityConversations(options.userId, options.conversationId);
    if (pendingCount <= 0) {
      return null;
    }

    const retryAfterMs = resolvePendingPriorityWaitMs(pendingCount);
    console.log(
      `⏳ [CENTRALIZED-SENDER] Adiando [${origin}] para priorizar ${pendingCount} conversa(s) aguardando resposta`,
    );

    return {
      success: false,
      deferred: true,
      retryAfterMs,
      error: `Há ${pendingCount} conversa(s) aguardando resposta antes do follow-up`,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  🗳️ REGISTRO DE POLL MAPPING
  // ═══════════════════════════════════════════════════════════════════════════
  
  private async getPausedConversationBlockResult(
    options: SendMessageOptions,
    stage: string,
  ): Promise<SendResult | null> {
    const pauseCheck = await shouldBlockAutomatedConversationSend({
      userId: options.userId,
      jid: options.jid,
      conversationId: options.conversationId,
      origin: options.origin,
      isOwnerInitiated: options.isOwnerInitiated,
    });

    if (!pauseCheck.blocked) {
      return null;
    }

    console.log(
      `⏸️ [CENTRALIZED-SENDER] Envio automático bloqueado (${stage}) para ${options.jid} ` +
      `- conversa ${pauseCheck.conversationId} está pausada`,
    );

    return {
      success: false,
      error: pauseCheck.reason || 'Conversa pausada por resposta manual do dono',
    };
  }

  private registerPollMapping(pollMsgId: string, jid: string, buttons: any[]): void {
    pollMappings.set(pollMsgId, {
      pollMsgId,
      jid,
      buttons,
      createdAt: Date.now()
    });
    console.log(`🗳️ [POLL-MAPPING] Registrado poll ${pollMsgId.substring(0, 10)}... com ${buttons.length} opções`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  📤 MÉTODO PRINCIPAL DE ENVIO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Envia uma mensagem através do sistema anti-ban
   * ESTE É O ÚNICO MÉTODO QUE DEVE SER USADO PARA ENVIAR MENSAGENS
   */
  async sendMessage(options: SendMessageOptions): Promise<SendResult> {
    const { userId, jid, socket, origin, priority = 'normal' } = options;

    // Validações
    if (!socket) {
      console.error(`❌ [CENTRALIZED-SENDER] Socket não fornecido para ${origin}`);
      return { success: false, error: 'Socket não disponível' };
    }

    if (!jid) {
      console.error(`❌ [CENTRALIZED-SENDER] JID não fornecido para ${origin}`);
      return { success: false, error: 'JID não fornecido' };
    }

    // Log de entrada
    console.log(`📥 [CENTRALIZED-SENDER] Nova mensagem de [${origin}] para ${jid.substring(0, 15)}...`);

    // Mensagens urgentes (do dono) têm delay menor
    const pausedBeforeQueue = await this.getPausedConversationBlockResult(options, 'before_queue');
    if (pausedBeforeQueue) {
      this.recordSent(userId, origin, false);
      return pausedBeforeQueue;
    }

    if (options.isOwnerInitiated || priority === 'urgent') {
      return this.sendImmediateWithMinimalDelay(options);
    }

    // Adicionar à fila e processar
    return this.enqueueAndProcess(options);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  🔥 ENVIO IMEDIATO (para mensagens do dono)
  // ═══════════════════════════════════════════════════════════════════════════

  private async sendImmediateWithMinimalDelay(options: SendMessageOptions): Promise<SendResult> {
    const { userId, jid, content, socket, origin, quotedMessage, skipTyping } = options;
    const contactNumber = this.getContactNumber(jid);

    return this.runExclusivePerUser(userId, `envio prioritario [${origin}]`, async () => {
      try {
        // Delay mínimo de 5 segundos mesmo para urgente
        const pausedBeforeDelay = await this.getPausedConversationBlockResult(options, 'immediate_before_delay');
        if (pausedBeforeDelay) {
          this.recordSent(userId, origin, false);
          return pausedBeforeDelay;
        }

        const antiBanCheck = antiBanProtectionService.canSendMessage(userId);
        if (!antiBanCheck.canSend) {
          console.log(
            `⚡ [CENTRALIZED-SENDER] Proteção anti-ban ativa para envio prioritário [${origin}] - aguardando ${Math.ceil(antiBanCheck.waitMs / 1000)}s`,
          );
          await new Promise((resolve) => setTimeout(resolve, antiBanCheck.waitMs));
        }

        await antiBanProtectionService.prepareAdaptiveDelayPolicy(userId);
        const delay = Math.max(
          ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS,
          antiBanProtectionService.calculateDelay(userId, contactNumber, {
            applyHighVolumeDelay: this.shouldApplyAdaptiveDelay({ origin, isOwnerInitiated: options.isOwnerInitiated }),
          }),
        );
        console.log(`⚡ [CENTRALIZED-SENDER] Envio prioritário de [${origin}] - delay ${delay/1000}s`);
        
        // Typing indicator (se não pulado)
        if (!skipTyping && ANTI_BAN_CONFIG.TYPING_ENABLED) {
          await simulateTyping(socket, jid, this.getMessageLength(content));
        }

        await new Promise(resolve => setTimeout(resolve, delay));

        const pausedBeforeSend = await this.getPausedConversationBlockResult(options, 'immediate_before_send');
        if (pausedBeforeSend) {
          this.recordSent(userId, origin, false);
          return pausedBeforeSend;
        }

        // Enviar mensagem
        const result = await socket.sendMessage(jid, content, {
          quoted: quotedMessage,
        });

        antiBanProtectionService.registerMessageSent(userId, contactNumber);
        this.recordSent(userId, origin, true);
        
        return {
          success: true,
          messageId: result?.key?.id || undefined,
          waitedMs: delay,
        };
      } catch (error) {
        console.error(`❌ [CENTRALIZED-SENDER] Erro no envio prioritário:`, error);
        this.recordSent(userId, origin, false);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        };
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  📋 SISTEMA DE FILA
  // ═══════════════════════════════════════════════════════════════════════════

  private async enqueueAndProcess(options: SendMessageOptions): Promise<SendResult> {
    const { userId } = options;
    const priorityRank = resolveDispatchPriorityRank({
      origin: options.origin as any,
      priority: options.priority,
      isOwnerInitiated: options.isOwnerInitiated,
    });

    return new Promise((resolve) => {
      // Obter ou criar fila para este usuário
      if (!this.queues.has(userId)) {
        this.queues.set(userId, []);
      }

      const queue = this.queues.get(userId)!;
      
      // Adicionar à fila
      this.insertByPriority(queue, {
        options,
        resolve,
        queuedAt: Date.now(),
        priorityRank,
      });

      console.log(`📋 [CENTRALIZED-SENDER] Mensagem enfileirada. Fila de ${userId.substring(0, 8)}: ${queue.length} msgs`);

      // Iniciar processamento se não estiver rodando
      if (!this.processing.get(userId)) {
        this.processQueue(userId);
      }
    });
  }

  private async processQueue(userId: string): Promise<void> {
    if (this.processing.get(userId)) return;
    
    this.processing.set(userId, true);
    const queue = this.queues.get(userId) || [];

    console.log(`🔄 [CENTRALIZED-SENDER] Iniciando processamento da fila de ${userId.substring(0, 8)}...`);

    while (queue.length > 0) {
      const item = queue.shift()!;
      const { options, resolve } = item;
      const { jid, content, socket, origin, quotedMessage, skipTyping } = options;

      try {
        const sendResult = await this.runExclusivePerUser(userId, `fila [${origin}]`, async () => {
          const deferredSend = await this.maybeDeferAutomatedSend(options);
          if (deferredSend) {
            this.recordSent(userId, origin, false);
            return deferredSend;
          }

          // 1. Obter delay do anti-ban (usa calculateDelay com contactNumber extraído do jid)
          const pausedBeforeDelay = await this.getPausedConversationBlockResult(options, 'queue_before_delay');
          if (pausedBeforeDelay) {
            this.recordSent(userId, origin, false);
            return pausedBeforeDelay;
          }

          const contactNumber = this.getContactNumber(jid);
          await antiBanProtectionService.prepareAdaptiveDelayPolicy(userId);
          const delay = antiBanProtectionService.calculateDelay(userId, contactNumber, {
            applyHighVolumeDelay: this.shouldApplyAdaptiveDelay({ origin, isOwnerInitiated: options.isOwnerInitiated }),
          });

          console.log(`⏱️ [CENTRALIZED-SENDER] Aguardando ${Math.ceil(delay/1000)}s antes de enviar [${origin}]...`);

          // 2. Typing indicator (se não pulado)
          if (!skipTyping && ANTI_BAN_CONFIG.TYPING_ENABLED) {
            await simulateTyping(socket, jid, this.getMessageLength(content));
          }

          // 3. Aguardar delay
          await new Promise(r => setTimeout(r, delay));

          const pausedBeforeSend = await this.getPausedConversationBlockResult(options, 'queue_before_send');
          if (pausedBeforeSend) {
            this.recordSent(userId, origin, false);
            return pausedBeforeSend;
          }

          // 4. Enviar mensagem
          const result = await socket.sendMessage(jid, content, {
            quoted: quotedMessage,
          });

          // 5. Registrar envio no anti-ban
          antiBanProtectionService.registerMessageSent(userId, contactNumber);
          this.recordSent(userId, origin, true);

          console.log(`✅ [CENTRALIZED-SENDER] Mensagem enviada [${origin}] → ${jid.substring(0, 15)}...`);

          return {
            success: true,
            messageId: result?.key?.id || undefined,
            waitedMs: delay,
          };
        });

        resolve(sendResult);

      } catch (error) {
        console.error(`❌ [CENTRALIZED-SENDER] Erro ao enviar [${origin}]:`, error);
        this.recordSent(userId, origin, false);

        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    this.processing.set(userId, false);
    console.log(`✅ [CENTRALIZED-SENDER] Fila de ${userId.substring(0, 8)} processada`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  🛠️ MÉTODOS AUXILIARES
  // ═══════════════════════════════════════════════════════════════════════════

  private isGroupJid(jid: string): boolean {
    return jid.endsWith('@g.us');
  }

  private getMessageLength(content: AnyMessageContent): number {
    if ('text' in content && typeof content.text === 'string') {
      return content.text.length;
    }
    if ('caption' in content && typeof content.caption === 'string') {
      return content.caption.length;
    }
    return 100; // Default para mídia
  }

  private getContactNumber(jid: string): string {
    const separatorIndex = jid.indexOf('@');
    return separatorIndex >= 0 ? jid.slice(0, separatorIndex) : jid;
  }

  private recordSent(userId: string, origin: MessageOrigin, success: boolean): void {
    if (!this.stats.has(userId)) {
      this.stats.set(userId, {
        totalSent: 0,
        totalFailed: 0,
        byOrigin: {} as Record<MessageOrigin, number>,
        lastSentAt: 0,
      });
    }

    const stats = this.stats.get(userId)!;
    
    if (success) {
      stats.totalSent++;
    } else {
      stats.totalFailed++;
    }
    
    stats.byOrigin[origin] = (stats.byOrigin[origin] || 0) + 1;
    stats.lastSentAt = Date.now();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  📊 ESTATÍSTICAS
  // ═══════════════════════════════════════════════════════════════════════════

  getStats(userId: string): SendStats | null {
    return this.stats.get(userId) || null;
  }

  getQueueSize(userId: string): number {
    return this.queues.get(userId)?.length || 0;
  }

  getQueueSnapshot(userId: string): {
    queueSize: number;
    byOrigin: Record<string, number>;
  } {
    const queue = this.queues.get(userId) || [];
    const byOrigin: Record<string, number> = {};
    for (const item of queue) {
      const origin = item.options.origin || 'unknown';
      byOrigin[origin] = (byOrigin[origin] || 0) + 1;
    }

    return {
      queueSize: queue.length,
      byOrigin,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ⚡ MÉTODOS DE CONVENIÊNCIA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Envia mensagem de texto
   */
  async sendText(
    userId: string,
    jid: string,
    text: string,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    return this.sendMessage({
      userId,
      jid,
      content: buildPlainTextWhatsAppPayload(text),
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia imagem
   */
  async sendImage(
    userId: string,
    jid: string,
    image: Buffer | string,
    caption: string | undefined,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    const content: AnyMessageContent = typeof image === 'string'
      ? { image: { url: image }, caption }
      : { image, caption };

    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia vídeo
   */
  async sendVideo(
    userId: string,
    jid: string,
    video: Buffer | string,
    caption: string | undefined,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    const content: AnyMessageContent = typeof video === 'string'
      ? { video: { url: video }, caption }
      : { video, caption };

    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia áudio
   */
  async sendAudio(
    userId: string,
    jid: string,
    audio: Buffer | string,
    ptt: boolean,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions> & { mimetype?: string }
  ): Promise<SendResult> {
    const mimetype = options?.mimetype;
    const content: AnyMessageContent = typeof audio === 'string'
      ? { audio: { url: audio }, ptt, mimetype }
      : { audio, ptt, mimetype };

    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia documento
   */
  async sendDocument(
    userId: string,
    jid: string,
    document: Buffer | string,
    filename: string,
    mimetype: string,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    const content: AnyMessageContent = typeof document === 'string'
      ? { document: { url: document }, fileName: filename, mimetype }
      : { document, fileName: filename, mimetype };

    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia botões usando ENQUETES (polls) do WhatsApp
   * @param payload - Pode ser objeto completo {body, buttons, header?, footer?} ou text simples
   * 
   * v3.0: Usa ENQUETES para simular botões interativos
   * FUNCIONA EM TODOS OS DISPOSITIVOS (Android, iOS, Web)
   */
  async sendButtons(
    userId: string,
    jid: string,
    payload: any, // Aceita payload completo ou text simples
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    // Se payload é string simples, enviar como texto
    if (typeof payload === 'string') {
      return this.sendMessage({
        userId,
        jid,
        content: { text: payload },
        socket,
        origin,
        ...options,
      });
    }

    // Se não tem body ou buttons, enviar como está
    if (!payload.body || !payload.buttons?.length) {
      return this.sendMessage({
        userId,
        jid,
        content: payload,
        socket,
        origin,
        ...options,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🗳️ NOVA IMPLEMENTAÇÃO v3.0: Usar ENQUETES (polls) do WhatsApp
    // Funciona em TODOS os dispositivos (Android, iOS, Web)
    // ═══════════════════════════════════════════════════════════════════════
    
    if (USE_POLLS_FOR_BUTTONS) {
      try {
        console.log(`🗳️ [POLL-BUTTONS] Enviando ${payload.buttons.length} opções como enquete para ${jid.substring(0, 15)}...`);
        
        // 1. Primeiro, enviar o texto de contexto (body + footer)
        if (SEND_CONTEXT_BEFORE_POLL) {
          let contextText = payload.body;
          if (payload.footer?.text) {
            contextText += `\n\n${payload.footer.text}`;
          }
          
          // Aguardar proteção anti-ban
          const contactNumber = jid.replace(/@.*$/, '');
          const canSendResult = antiBanProtectionService.canSendMessage(userId);
          
          if (canSendResult.canSend) {
            await antiBanProtectionService.prepareAdaptiveDelayPolicy(userId);
            const delay = antiBanProtectionService.calculateDelay(userId, contactNumber);
            await new Promise(r => setTimeout(r, delay));
            
            // Enviar texto de contexto
            await socket.sendMessage(jid, { text: contextText });
            antiBanProtectionService.registerMessageSent(userId, contactNumber);
            console.log(`📝 [POLL-BUTTONS] Texto de contexto enviado`);
            
            // Pequeno delay antes da enquete
            await new Promise(r => setTimeout(r, 500));
          }
        }
        
        // 2. Extrair opções dos botões para a enquete
        const pollOptions = payload.buttons.map((btn: any) => 
          btn.reply?.title || btn.title || `Opção`
        );
        
        // 3. Criar o nome da enquete (pergunta)
        const pollName = payload.header?.text || 'Selecione uma opção:';
        
        // 4. Enviar a enquete usando sendMessage com poll
        // Formato do Baileys para polls: { poll: { name, values, selectableCount } }
        const pollResult = await socket.sendMessage(jid, {
          poll: {
            name: pollName,
            values: pollOptions,
            selectableCount: 1 // Usuário só pode votar em UMA opção
          }
        });

        console.log(`✅ [POLL-BUTTONS] Enquete enviada com sucesso! ID: ${pollResult?.key?.id}`);
        
        // Registrar mapeamento do poll para depois capturar o voto
        if (pollResult?.key?.id) {
          this.registerPollMapping(pollResult.key.id, jid, payload.buttons);
        }
        
        this.recordSent(userId, origin, true);
        return {
          success: true,
          messageId: pollResult?.key?.id || undefined,
          waitedMs: 500,
        };
        
      } catch (pollError) {
        console.error(`⚠️ [POLL-BUTTONS] Falha ao enviar enquete, usando fallback texto:`, pollError);
        // Continuar para fallback de texto
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 📝 MENU NUMÉRICO: Cliente digita o número da opção
    // ═══════════════════════════════════════════════════════════════════════
    
    let formattedText = payload.body;
    
    // Adicionar footer se existir
    if (payload.footer?.text) {
      formattedText += `\n\n${payload.footer.text}`;
    }
    
    // Adicionar botões como menu numérico
    if (payload.buttons && payload.buttons.length > 0) {
      formattedText += '\n\n*📋 Escolha uma opção:*\n';
      payload.buttons.forEach((btn: any, index: number) => {
        const number = index + 1;
        const title = btn.reply?.title || btn.title || `Opção ${number}`;
        formattedText += `\n*${number}.* ${title}`;
      });
      formattedText += '\n\n_👆 Digite o número ou escreva sua escolha_';
    }
    
    console.log(`🔢 [MENU-NUMERICO] Enviando ${payload.buttons?.length || 0} opções como texto numerado`);
    
    
    const content = { text: formattedText };
    
    console.log(`📱 [BUTTONS→TEXT] Enviando ${payload.buttons?.length || 0} botões como texto para ${jid.substring(0, 15)}...`);
    
    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia lista usando ENQUETES (polls) do WhatsApp
   * @param payload - Pode ser objeto completo {body, buttonText, sections, header?, footer?} ou text simples
   * 
   * v3.0: Usa ENQUETES para simular listas interativas
   * FUNCIONA EM TODOS OS DISPOSITIVOS (Android, iOS, Web)
   */
  async sendList(
    userId: string,
    jid: string,
    payload: any, // Aceita payload completo ou parâmetros individuais
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    // Se payload é string simples, enviar como texto
    if (typeof payload === 'string') {
      return this.sendMessage({
        userId,
        jid,
        content: { text: payload },
        socket,
        origin,
        ...options,
      });
    }

    // Se não tem body ou sections, enviar como está
    if (!payload.body || !payload.sections?.length) {
      return this.sendMessage({
        userId,
        jid,
        content: payload,
        socket,
        origin,
        ...options,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🗳️ NOVA IMPLEMENTAÇÃO v3.0: Usar ENQUETES (polls) para listas
    // Funciona em TODOS os dispositivos (Android, iOS, Web)
    // ═══════════════════════════════════════════════════════════════════════
    
    if (USE_POLLS_FOR_BUTTONS) {
      try {
        // Contar total de itens
        const totalItems = payload.sections.reduce((acc: number, s: any) => acc + (s.rows?.length || 0), 0);
        console.log(`🗳️ [POLL-LIST] Enviando lista com ${totalItems} itens como enquete para ${jid.substring(0, 15)}...`);
        
        // 1. Primeiro, enviar o texto de contexto (body + footer)
        if (SEND_CONTEXT_BEFORE_POLL) {
          let contextText = payload.body;
          if (payload.footer?.text) {
            contextText += `\n\n${payload.footer.text}`;
          }
          
          // Aguardar proteção anti-ban
          const contactNumber = jid.replace(/@.*$/, '');
          const canSendResult = antiBanProtectionService.canSendMessage(userId);
          
          if (canSendResult.canSend) {
            await antiBanProtectionService.prepareAdaptiveDelayPolicy(userId);
            const delay = antiBanProtectionService.calculateDelay(userId, contactNumber);
            await new Promise(r => setTimeout(r, delay));
            
            // Enviar texto de contexto
            await socket.sendMessage(jid, { text: contextText });
            antiBanProtectionService.registerMessageSent(userId, contactNumber);
            console.log(`📝 [POLL-LIST] Texto de contexto enviado`);
            
            // Pequeno delay antes da enquete
            await new Promise(r => setTimeout(r, 500));
          }
        }
        
        // 2. Extrair TODOS os itens das seções (flatten)
        const allItems: any[] = [];
        const buttonMappings: any[] = [];
        
        for (const section of payload.sections) {
          for (const row of (section.rows || [])) {
            allItems.push(row.title || 'Opção');
            buttonMappings.push({
              reply: { id: row.id, title: row.title },
              id: row.id,
              title: row.title
            });
          }
        }
        
        // WhatsApp limita polls a 12 opções
        const pollOptions = allItems.slice(0, 12);
        const limitedMappings = buttonMappings.slice(0, 12);
        
        // 3. Criar o nome da enquete (pergunta)
        const pollName = payload.header?.text || payload.buttonText || 'Selecione uma opção:';
        
        // 4. Enviar a enquete usando sendMessage com poll
        const pollResult = await socket.sendMessage(jid, {
          poll: {
            name: pollName,
            values: pollOptions,
            selectableCount: 1 // Usuário só pode votar em UMA opção
          }
        });

        console.log(`✅ [POLL-LIST] Enquete enviada com sucesso! ID: ${pollResult?.key?.id}`);
        
        // Registrar mapeamento do poll para depois capturar o voto
        if (pollResult?.key?.id) {
          this.registerPollMapping(pollResult.key.id, jid, limitedMappings);
        }
        
        this.recordSent(userId, origin, true);
        return {
          success: true,
          messageId: pollResult?.key?.id || undefined,
          waitedMs: 500,
        };
        
      } catch (pollError) {
        console.error(`⚠️ [POLL-LIST] Falha ao enviar enquete, usando fallback texto:`, pollError);
        // Continuar para fallback de texto
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 📝 MENU NUMÉRICO PARA LISTAS: Cliente digita o número
    // ═══════════════════════════════════════════════════════════════════════
    
    let formattedText = payload.body;
    
    // Adicionar footer se existir
    if (payload.footer?.text) {
      formattedText += `\n\n${payload.footer.text}`;
    }
    
    // Adicionar seções e itens como menu numérico
    if (payload.sections && payload.sections.length > 0) {
      let itemIndex = 1;
      payload.sections.forEach((section: any) => {
        if (section.title) {
          formattedText += `\n\n*📂 ${section.title}*`;
        }
        if (section.rows && section.rows.length > 0) {
          section.rows.forEach((row: any) => {
            formattedText += `\n*${itemIndex}.* ${row.title}`;
            if (row.description) {
              formattedText += `\n   _${row.description}_`;
            }
            itemIndex++;
          });
        }
      });
      formattedText += '\n\n_👆 Digite o número ou escreva sua escolha_';
    }
    
    const content = { text: formattedText };
    
    const totalItems = payload.sections?.reduce((acc: number, s: any) => acc + (s.rows?.length || 0), 0) || 0;
    console.log(`📋 [LIST→TEXT] Enviando lista com ${totalItems} itens como texto para ${jid.substring(0, 15)}...`);
    
    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Reseta contador de batch (quando cliente interage)
   */
  resetBatchCounter(userId: string): void {
    antiBanProtectionService.resetBatchCounter(userId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const centralizedMessageSender = new CentralizedMessageSender();
export default centralizedMessageSender;

// Exportar tipos para uso em outros módulos
export type { SendMessageOptions, MessageOrigin, MessagePriority, SendResult };
