/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  🚨 SISTEMA DE RECUPERAÇÃO DE MENSAGENS PENDENTES                            ║
 * ║                                                                              ║
 * ║  Este serviço resolve o problema de mensagens perdidas quando:              ║
 * ║  - Servidor está atualizando no Railway                                      ║
 * ║  - Conexão WhatsApp está instável (reconnecting)                            ║
 * ║  - Mensagens chegam mostrando "Carregando..." no WhatsApp                   ║
 * ║                                                                              ║
 * ║  FLUXO:                                                                       ║
 * ║  1. Mensagem chega do Baileys → salva IMEDIATAMENTE na pending_incoming     ║
 * ║  2. Tenta processar normalmente                                              ║
 * ║  3. Se falhar → permanece na fila pending                                    ║
 * ║  4. Quando conexão estabiliza → reprocessa pendentes                        ║
 * ║                                                                              ║
 * ║  CLIENTES AFETADOS:                                                           ║
 * ║  - jefersonlv26@gmail.com                                                    ║
 * ║  - marcelomarquesterapeuta@gmail.com                                         ║
 * ║  - rodrigo4@gmail.com                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { WAMessage, proto } from '@whiskeysockets/baileys';
import { createHash } from 'crypto';
import { createSupabaseServiceClient } from './supabaseService';

// ═══════════════════════════════════════════════════════════════════════════════
//  TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface PendingMessage {
  id: string;
  user_id: string;
  connection_id: string;
  whatsapp_message_id: string;
  remote_jid: string;
  contact_number: string | null;
  push_name: string | null;
  message_content: string | null;
  message_type: string;
  raw_message: any;
  status: 'pending' | 'processing' | 'processed' | 'failed' | 'skipped';
  process_attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  expires_at: string;
}

interface ConnectionHealthEvent {
  user_id: string;
  connection_id: string;
  event_type: 'connected' | 'disconnected' | 'reconnecting' | 'error' | 'qr_generated' | 'messages_recovered';
  event_details?: any;
  messages_pending?: number;
  messages_recovered?: number;
}

interface RecoveryResult {
  success: boolean;
  messagesProcessed: number;
  messagesFailed: number;
  messagesSkipped: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES (BASEADO EM MELHORES PRÁTICAS AWS/MICROSOFT)
// ═══════════════════════════════════════════════════════════════════════════════
// Referência: AWS Architecture Blog - Exponential Backoff And Jitter
// https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Máximo de tentativas antes de marcar como failed
  MAX_PROCESS_ATTEMPTS: 3,
  
  // ════════════════════════════════════════════════════════════════════════════
  // EXPONENTIAL BACKOFF COM JITTER (Padrão AWS/Microsoft)
  // ════════════════════════════════════════════════════════════════════════════
  // Em vez de delay fixo, usamos backoff exponencial com jitter para:
  // 1. Evitar "thundering herd" - múltiplos clientes retentando ao mesmo tempo
  // 2. Reduzir carga no servidor em casos de falha massiva
  // 3. Melhorar taxa de sucesso geral (AWS relata redução de 50% no trabalho)
  // ════════════════════════════════════════════════════════════════════════════
  
  // Delay base entre mensagens (ms)
  BASE_DELAY_MS: 1000,
  
  // Delay máximo (cap) para exponential backoff (ms)
  MAX_DELAY_MS: 32000,
  
  // Jitter máximo como percentual do delay (0.0 a 1.0)
  // AWS recomenda "Full Jitter": random between 0 and calculated_delay
  JITTER_FACTOR: 1.0,
  
  // ════════════════════════════════════════════════════════════════════════════
  // CIRCUIT BREAKER (Padrão Microsoft)
  // ════════════════════════════════════════════════════════════════════════════
  // Se muitas falhas consecutivas, para de tentar temporariamente
  // ════════════════════════════════════════════════════════════════════════════
  
  // Número de falhas consecutivas para abrir circuit breaker
  CIRCUIT_BREAKER_THRESHOLD: 5,
  
  // Tempo que circuit breaker fica aberto antes de tentar novamente (ms)
  CIRCUIT_BREAKER_RESET_MS: 60000, // 1 minuto
  
  // Máximo de mensagens a processar por ciclo
  MAX_MESSAGES_PER_CYCLE: 50,
  
  // Intervalo de limpeza de expirados (ms)
  CLEANUP_INTERVAL_MS: 30 * 60 * 1000, // 30 minutos
  
  // Delay após conexão para iniciar recovery (dar tempo para estabilizar)
  POST_CONNECT_DELAY_MS: 15000, // 15 segundos
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

class PendingMessageRecoveryService {
  private supabase: SupabaseClient;
  private initialized = false;
  private processingScopes = new Set<string>(); // Evita processamento paralelo por conexão
  private scheduledScopes = new Set<string>(); // Evita agendar varios recoveries para a mesma conexao
  
  // Callback para processar mensagens (será registrado pelo whatsapp.ts)
  private messageProcessor: ((userId: string, connectionId: string, message: WAMessage) => Promise<void>) | null = null;
  
  // ════════════════════════════════════════════════════════════════════════════
  // CIRCUIT BREAKER STATE (Padrão Microsoft para falhas longas)
  // ════════════════════════════════════════════════════════════════════════════
  private circuitBreaker = {
    consecutiveFailures: 0,
    isOpen: false,
    lastFailureTime: 0,
    openedAt: 0,
  };
  
  // Stats
  private stats = {
    totalSaved: 0,
    totalRecovered: 0,
    totalFailed: 0,
    totalSkipped: 0,
    lastCleanup: Date.now(),
    circuitBreakerTrips: 0,
  };

  constructor() {
    this.supabase = createSupabaseServiceClient();
    
    console.log('🚨 [RECOVERY] PendingMessageRecoveryService inicializado');
    
    // Iniciar limpeza periódica
    setInterval(() => this.cleanupExpired(), CONFIG.CLEANUP_INTERVAL_MS);
    
    this.initialized = true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  REGISTRO DO PROCESSADOR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Registra o callback que será usado para processar mensagens pendentes
   * Este método deve ser chamado pelo whatsapp.ts na inicialização
   */
  registerMessageProcessor(processor: (userId: string, connectionId: string, message: WAMessage) => Promise<void>): void {
    this.messageProcessor = processor;
    console.log('🚨 [RECOVERY] Message processor registrado');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SALVAR MENSAGEM PENDENTE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 🚨 PONTO CRÍTICO: Salva mensagem IMEDIATAMENTE ao receber do Baileys
   * Deve ser chamado ANTES de qualquer processamento
   */
  async saveIncomingMessage(params: {
    userId: string;
    connectionId: string;
    waMessage: WAMessage;
    messageContent: string | null;
    messageType?: string;
  }): Promise<{ id: string; isDuplicate: boolean }> {
    const { userId, connectionId, waMessage, messageContent, messageType = 'text' } = params;
    
    const remoteJid = waMessage.key.remoteJid;
    
    if (!remoteJid) {
      console.log('?? [RECOVERY] Mensagem sem remoteJid, ignorando save');
      return { id: '', isDuplicate: false };
    }

    // Alguns eventos podem chegar sem key.id (stub/protocol/history edge-cases).
    // Persistimos com um id deterministico para nao perder o lead.
    let messageId = waMessage.key.id;
    if (!messageId) {
      const ts = Number((waMessage as any)?.messageTimestamp) || 0;
      const base = `${remoteJid}|${ts}|${messageType}|${messageContent || ''}`;
      const hash = createHash('sha1').update(base).digest('hex').slice(0, 16);
      messageId = `noid_${hash}`;
    }
    
    // Extrair número do contato
    const contactNumber = remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '');
    
    try {
      const { data, error } = await this.supabase
        .from('pending_incoming_messages')
        .upsert({
          user_id: userId,
          connection_id: connectionId,
          whatsapp_message_id: messageId,
          remote_jid: remoteJid,
          contact_number: contactNumber,
          push_name: waMessage.pushName || null,
          message_content: messageContent,
          message_type: messageType,
          raw_message: this.sanitizeMessageForStorage(waMessage),
          status: 'pending',
          process_attempts: 0,
          received_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h
        }, {
          onConflict: 'whatsapp_message_id',
          ignoreDuplicates: true, // Não atualizar se já existe
        })
        .select('id');
      
      if (error) {
        // Erro 23505 = duplicata (constraint violation) - é esperado e OK
        if (error.code === '23505' || error.code === 'PGRST116') {
          console.log(`🚨 [RECOVERY] Mensagem ${messageId} já existe (duplicata, code=${error.code})`);
          this.stats.totalSkipped++;
          return { id: '', isDuplicate: true };
        }
        
        console.error('🚨 [RECOVERY] Erro ao salvar mensagem pendente:', error);
        return { id: '', isDuplicate: false };
      }
      
      const insertedRow = Array.isArray(data) ? data[0] : null;
      if (!insertedRow) {
        this.stats.totalSkipped++;
        return { id: '', isDuplicate: true };
      }

      this.stats.totalSaved++;
      console.log(`🚨 [RECOVERY] ✅ Mensagem salva: ${messageId} | Contato: ${contactNumber}`);
      
      return { id: insertedRow.id || '', isDuplicate: false };
    } catch (err) {
      console.error('🚨 [RECOVERY] Exceção ao salvar mensagem:', err);
      return { id: '', isDuplicate: false };
    }
  }

  /**
   * Marca mensagem como processada com sucesso
   */
  async markAsProcessed(whatsappMessageId: string): Promise<void> {
    try {
      await this.supabase
        .from('pending_incoming_messages')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('whatsapp_message_id', whatsappMessageId);
      
      console.log(`🚨 [RECOVERY] ✅ Mensagem ${whatsappMessageId} marcada como processada`);
    } catch (err) {
      console.error('🚨 [RECOVERY] Erro ao marcar processada:', err);
    }
  }

  /**
   * Marca mensagem como falha
   */
  async markAsFailed(whatsappMessageId: string, errorMessage: string): Promise<void> {
    try {
      const { data } = await this.supabase
        .from('pending_incoming_messages')
        .select('process_attempts')
        .eq('whatsapp_message_id', whatsappMessageId)
        .maybeSingle(); // FIX 2026-02-25: .single() causes PGRST116 if row doesn't exist
      
      const attempts = (data?.process_attempts || 0) + 1;
      const newStatus = attempts >= CONFIG.MAX_PROCESS_ATTEMPTS ? 'failed' : 'pending';
      
      await this.supabase
        .from('pending_incoming_messages')
        .update({
          status: newStatus,
          process_attempts: attempts,
          last_attempt_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq('whatsapp_message_id', whatsappMessageId);
      
      if (newStatus === 'failed') {
        this.stats.totalFailed++;
      }
      
      console.log(`🚨 [RECOVERY] Mensagem ${whatsappMessageId} falhou (tentativa ${attempts}/${CONFIG.MAX_PROCESS_ATTEMPTS})`);
    } catch (err) {
      console.error('🚨 [RECOVERY] Erro ao marcar falha:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RECUPERAÇÃO DE MENSAGENS PENDENTES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 🚨 Inicia recuperação de mensagens após conexão estabilizar
   * Deve ser chamado após conn === 'open' no whatsapp.ts
   */
  private shouldRequireVisibleMessage(pending: PendingMessage): boolean {
    const messageType = String(pending.message_type || '').toLowerCase();
    const remoteJid = String(pending.remote_jid || '').toLowerCase();
    const supportedVisibleJid =
      remoteJid.includes('@s.whatsapp.net') ||
      remoteJid.includes('@lid') ||
      remoteJid.includes('@g.us');

    return supportedVisibleJid && messageType !== 'protocol' && messageType !== 'protocol_revoke';
  }

  private async hasPersistedVisibleMessage(whatsappMessageId: string): Promise<boolean> {
    if (!whatsappMessageId) return false;

    const { data: exactRows, error: exactError } = await this.supabase
      .from('messages')
      .select('id')
      .eq('message_id', whatsappMessageId)
      .limit(1);

    if (exactError) {
      throw new Error(`Erro ao verificar mensagem persistida: ${exactError.message}`);
    }

    if (exactRows && exactRows.length > 0) {
      return true;
    }

    const duplicatePrefix = `${whatsappMessageId}_dup_`;
    const duplicateUpperBound = `${duplicatePrefix}~`;
    const { data: fallbackRows, error: fallbackError } = await this.supabase
      .from('messages')
      .select('id')
      .gte('message_id', duplicatePrefix)
      .lt('message_id', duplicateUpperBound)
      .limit(1);

    if (fallbackError) {
      throw new Error(`Erro ao verificar fallback de mensagem persistida: ${fallbackError.message}`);
    }

    return Boolean(fallbackRows && fallbackRows.length > 0);
  }

  async startRecoveryForUser(userId: string, connectionId: string): Promise<void> {
    // Verificar se já está processando
    const scopeKey = `${userId}:${connectionId}`;
    if (this.processingScopes.has(scopeKey) || this.scheduledScopes.has(scopeKey)) {
      console.log(`🚨 [RECOVERY] Usuário ${userId} já em processamento de recovery`);
      return;
    }
    
    // Aguardar estabilização da conexão
    console.log(`🚨 [RECOVERY] Aguardando ${CONFIG.POST_CONNECT_DELAY_MS/1000}s para estabilizar conexão...`);
    this.scheduledScopes.add(scopeKey);
    
    setTimeout(async () => {
      try {
        await this.processRecoveryForUser(userId, connectionId);
      } finally {
        this.scheduledScopes.delete(scopeKey);
      }
    }, CONFIG.POST_CONNECT_DELAY_MS);
  }

  /**
   * Processa mensagens pendentes de um usuário
   */
  private async processRecoveryForUser(userId: string, connectionId: string): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      success: false,
      messagesProcessed: 0,
      messagesFailed: 0,
      messagesSkipped: 0,
      errors: [],
    };
    const scopeKey = `${userId}:${connectionId}`;
    
    if (!this.messageProcessor) {
      console.error('🚨 [RECOVERY] Message processor não registrado!');
      result.errors.push('Message processor não registrado');
      return result;
    }
    
    this.processingScopes.add(scopeKey);
    
    try {
      console.log(`\n🚨 ========================================`);
      console.log(`🚨 [RECOVERY] Iniciando recuperação para usuário: ${userId.substring(0, 8)}...`);
      console.log(`🚨 ========================================\n`);
      
      // Buscar mensagens pendentes
      const { data: pendingMessages, error } = await this.supabase
        .from('pending_incoming_messages')
        .select('*')
        .eq('user_id', userId)
        .eq('connection_id', connectionId)
        .eq('status', 'pending')
        .lt('process_attempts', CONFIG.MAX_PROCESS_ATTEMPTS)
        .order('received_at', { ascending: true })
        .limit(CONFIG.MAX_MESSAGES_PER_CYCLE);
      
      if (error) {
        console.error('🚨 [RECOVERY] Erro ao buscar pendentes:', error);
        result.errors.push(error.message);
        return result;
      }
      
      if (!pendingMessages || pendingMessages.length === 0) {
        console.log(`🚨 [RECOVERY] ✅ Nenhuma mensagem pendente para ${userId.substring(0, 8)}...`);
        result.success = true;
        
        // Log de health
        await this.logConnectionHealth({
          user_id: userId,
          connection_id: connectionId,
          event_type: 'connected',
          event_details: { no_pending_messages: true },
          messages_pending: 0,
          messages_recovered: 0,
        });
        
        return result;
      }
      
      console.log(`🚨 [RECOVERY] 📥 ${pendingMessages.length} mensagens pendentes encontradas!`);
      console.log(`🚨 [RECOVERY] Usando Exponential Backoff com Jitter (AWS Best Practice)`);
      
      let consecutiveFailuresInCycle = 0;
      
      for (let i = 0; i < pendingMessages.length; i++) {
        const pending = pendingMessages[i] as PendingMessage;
        
        // ════════════════════════════════════════════════════════════════════
        // CIRCUIT BREAKER CHECK
        // ════════════════════════════════════════════════════════════════════
        if (!this.checkCircuitBreaker()) {
          console.log(`🚨 [RECOVERY] ⛔ Circuit breaker aberto, parando processamento`);
          result.errors.push('Circuit breaker aberto - muitas falhas consecutivas');
          break;
        }
        
        try {
          // Marcar como em processamento
          await this.supabase
            .from('pending_incoming_messages')
            .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
            .eq('id', pending.id);
          
          // Reconstruir WAMessage do JSON armazenado
          const waMessage = pending.raw_message as WAMessage;
          
          if (!waMessage) {
            console.log(`🚨 [RECOVERY] Mensagem ${pending.whatsapp_message_id} sem raw_message, pulando`);
            result.messagesSkipped++;
            await this.markAsProcessed(pending.whatsapp_message_id);
            continue;
          }
          
          console.log(`🚨 [RECOVERY] 🔄 [${i+1}/${pendingMessages.length}] Processando: ${pending.contact_number} - "${(pending.message_content || '').substring(0, 30)}..."`);
          
          const requiresVisibleMessage = this.shouldRequireVisibleMessage(pending);
          if (requiresVisibleMessage && await this.hasPersistedVisibleMessage(pending.whatsapp_message_id)) {
            await this.markAsProcessed(pending.whatsapp_message_id);
            result.messagesSkipped++;
            consecutiveFailuresInCycle = 0;
            this.onProcessingSuccess();
            console.log(`ðŸš¨ [RECOVERY] âœ… Mensagem ${pending.whatsapp_message_id} ja estava persistida; pendente reconciliado.`);
            continue;
          }

          // Processar usando o callback registrado
          await this.messageProcessor(userId, pending.connection_id || connectionId, waMessage);

          if (requiresVisibleMessage && !await this.hasPersistedVisibleMessage(pending.whatsapp_message_id)) {
            throw new Error(`message_processor_completed_without_visible_message:${pending.whatsapp_message_id}`);
          }
          
          // Marcar como sucesso
          await this.markAsProcessed(pending.whatsapp_message_id);
          result.messagesProcessed++;
          this.stats.totalRecovered++;
          consecutiveFailuresInCycle = 0; // Reset local counter
          
          // Reset circuit breaker on success
          this.onProcessingSuccess();
          
          console.log(`🚨 [RECOVERY] ✅ Mensagem recuperada com sucesso!`);
          
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
          console.error(`🚨 [RECOVERY] ❌ Erro ao processar ${pending.whatsapp_message_id}:`, errorMsg);
          
          await this.markAsFailed(pending.whatsapp_message_id, errorMsg);
          result.messagesFailed++;
          result.errors.push(errorMsg);
          consecutiveFailuresInCycle++;
          
          // Update circuit breaker
          this.onProcessingFailure();
        }
        
        // ════════════════════════════════════════════════════════════════════
        // EXPONENTIAL BACKOFF COM JITTER
        // ════════════════════════════════════════════════════════════════════
        // Em vez de delay fixo, usar backoff exponencial baseado em falhas
        // Mais falhas = mais delay, com jitter para evitar thundering herd
        // ════════════════════════════════════════════════════════════════════
        const delay = this.calculateBackoffWithJitter(consecutiveFailuresInCycle);
        console.log(`🚨 [RECOVERY] ⏱️ Delay: ${delay}ms (backoff level: ${consecutiveFailuresInCycle})`);
        await this.sleep(delay);
      }
      
      result.success = true;
      
      // Log de health
      await this.logConnectionHealth({
        user_id: userId,
        connection_id: connectionId,
        event_type: 'messages_recovered',
        event_details: {
          total_pending: pendingMessages.length,
          processed: result.messagesProcessed,
          failed: result.messagesFailed,
          skipped: result.messagesSkipped,
        },
        messages_pending: pendingMessages.length,
        messages_recovered: result.messagesProcessed,
      });
      
      console.log(`\n🚨 ========================================`);
      console.log(`🚨 [RECOVERY] ✅ Recuperação concluída para ${userId.substring(0, 8)}...`);
      console.log(`🚨   • Processadas: ${result.messagesProcessed}`);
      console.log(`🚨   • Falhas: ${result.messagesFailed}`);
      console.log(`🚨   • Puladas: ${result.messagesSkipped}`);
      console.log(`🚨 ========================================\n`);
      
    } catch (err) {
      console.error('🚨 [RECOVERY] Erro geral na recuperação:', err);
      result.errors.push(err instanceof Error ? err.message : 'Erro geral');
    } finally {
      this.processingScopes.delete(scopeKey);
    }
    
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOG DE SAÚDE DA CONEXÃO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Registra evento de saúde da conexão
   */
  async logConnectionHealth(event: ConnectionHealthEvent): Promise<void> {
    try {
      await this.supabase
        .from('connection_health_log')
        .insert(event);
    } catch (err) {
      console.error('🚨 [RECOVERY] Erro ao logar health:', err);
    }
  }

  /**
   * Registra desconexão
   */
  async logDisconnection(userId: string, connectionId: string, reason?: string): Promise<void> {
    // Contar mensagens pendentes
    const { count } = await this.supabase
      .from('pending_incoming_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('connection_id', connectionId)
      .eq('status', 'pending');
    
    await this.logConnectionHealth({
      user_id: userId,
      connection_id: connectionId,
      event_type: 'disconnected',
      event_details: { reason },
      messages_pending: count || 0,
    });
    
    console.log(`🚨 [RECOVERY] 📡 Desconexão registrada - ${count || 0} mensagens pendentes`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ESTATÍSTICAS E MANUTENÇÃO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna estatísticas do serviço (incluindo circuit breaker)
   */
  getStats(): {
    totalSaved: number;
    totalRecovered: number;
    totalFailed: number;
    totalSkipped: number;
    usersProcessing: number;
    lastCleanup: string;
    circuitBreakerTrips: number;
    circuitBreakerStatus: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    consecutiveFailures: number;
  } {
    // Determinar status do circuit breaker
    let circuitBreakerStatus: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    if (this.circuitBreaker.isOpen) {
      const timeSinceOpened = Date.now() - this.circuitBreaker.openedAt;
      if (timeSinceOpened >= CONFIG.CIRCUIT_BREAKER_RESET_MS) {
        circuitBreakerStatus = 'HALF_OPEN';
      } else {
        circuitBreakerStatus = 'OPEN';
      }
    }
    
    return {
      ...this.stats,
      usersProcessing: this.processingScopes.size + this.scheduledScopes.size,
      lastCleanup: new Date(this.stats.lastCleanup).toISOString(),
      circuitBreakerStatus,
      consecutiveFailures: this.circuitBreaker.consecutiveFailures,
    };
  }

  /**
   * Busca estatísticas por usuário
   */
  async getStatsForUser(userId: string): Promise<{
    pending: number;
    processed: number;
    failed: number;
    oldest_pending: string | null;
  }> {
    const { data } = await this.supabase
      .from('pending_messages_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(); // FIX 2026-02-25: .single() causes PGRST116 if no stats row exists
    
    return {
      pending: data?.pending_count || 0,
      processed: data?.processed_count || 0,
      failed: data?.failed_count || 0,
      oldest_pending: data?.oldest_pending || null,
    };
  }

  /**
   * Limpa mensagens expiradas
   */
  private async cleanupExpired(): Promise<void> {
    try {
      const { data, error } = await this.supabase.rpc('cleanup_expired_pending_messages');
      
      if (error) {
        console.error('🚨 [RECOVERY] Erro ao limpar expiradas:', error);
        return;
      }
      
      this.stats.lastCleanup = Date.now();
      
      if (data && data > 0) {
        console.log(`🚨 [RECOVERY] 🧹 ${data} mensagens expiradas removidas`);
      }
    } catch (err) {
      console.error('🚨 [RECOVERY] Exceção na limpeza:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  UTILITÁRIOS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * EXPONENTIAL BACKOFF COM FULL JITTER (AWS Best Practice)
   * ════════════════════════════════════════════════════════════════════════════
   * 
   * Fórmula: sleep = random_between(0, min(cap, base * 2 ^ attempt))
   * 
   * Por que usar jitter?
   * - Sem jitter: todos os clientes retentam ao mesmo tempo → sobrecarga
   * - Com "Full Jitter": cada cliente retenta em momento diferente
   * - AWS relata redução de ~50% no trabalho total do cliente
   * 
   * Referência: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
   * ════════════════════════════════════════════════════════════════════════════
   */
  private calculateBackoffWithJitter(attempt: number): number {
    // Exponential backoff: base * 2^attempt
    const exponentialDelay = CONFIG.BASE_DELAY_MS * Math.pow(2, attempt);
    
    // Cap no máximo configurado
    const cappedDelay = Math.min(exponentialDelay, CONFIG.MAX_DELAY_MS);
    
    // Full Jitter: random between 0 and cappedDelay
    // Isso distribui os retries uniformemente no tempo
    const jitteredDelay = Math.random() * cappedDelay * CONFIG.JITTER_FACTOR;
    
    return Math.floor(jitteredDelay);
  }

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * CIRCUIT BREAKER (Microsoft Best Practice)
   * ════════════════════════════════════════════════════════════════════════════
   * 
   * Estados:
   * - CLOSED: Operação normal, contando falhas
   * - OPEN: Muitas falhas consecutivas, rejeitando requisições
   * - HALF-OPEN: Testando se o serviço voltou (após timeout)
   * 
   * Por que usar circuit breaker?
   * - Evita sobrecarregar um serviço que está falhando
   * - Permite recuperação mais rápida do sistema
   * - Fornece feedback rápido em vez de timeout lento
   * 
   * Referência: Microsoft Azure Architecture Docs - Circuit Breaker Pattern
   * ════════════════════════════════════════════════════════════════════════════
   */
  private checkCircuitBreaker(): boolean {
    // Se não está aberto, permitir
    if (!this.circuitBreaker.isOpen) {
      return true;
    }
    
    // Verificar se passou tempo suficiente para tentar novamente (half-open)
    const timeSinceOpened = Date.now() - this.circuitBreaker.openedAt;
    
    if (timeSinceOpened >= CONFIG.CIRCUIT_BREAKER_RESET_MS) {
      console.log(`🚨 [RECOVERY] 🔌 Circuit Breaker: Tentando half-open após ${timeSinceOpened/1000}s`);
      return true; // Half-open: permite uma tentativa
    }
    
    console.log(`🚨 [RECOVERY] ⛔ Circuit Breaker ABERTO - ${(CONFIG.CIRCUIT_BREAKER_RESET_MS - timeSinceOpened)/1000}s restantes`);
    return false;
  }

  private onProcessingSuccess(): void {
    // Reset circuit breaker on success
    if (this.circuitBreaker.consecutiveFailures > 0) {
      console.log(`🚨 [RECOVERY] ✅ Circuit Breaker: Reset após sucesso`);
    }
    this.circuitBreaker.consecutiveFailures = 0;
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.openedAt = 0;
  }

  private onProcessingFailure(): void {
    this.circuitBreaker.consecutiveFailures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    // Verificar se deve abrir circuit breaker
    if (this.circuitBreaker.consecutiveFailures >= CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
      if (!this.circuitBreaker.isOpen) {
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.openedAt = Date.now();
        this.stats.circuitBreakerTrips++;
        console.log(`🚨 [RECOVERY] ⛔ Circuit Breaker ABERTO após ${this.circuitBreaker.consecutiveFailures} falhas consecutivas!`);
      }
    }
  }

  /**
   * Sanitiza mensagem para armazenamento (remove dados binários grandes)
   */
  private sanitizeMessageForStorage(waMessage: WAMessage): any {
    try {
      // Clonar para não modificar original
      const clone = JSON.parse(JSON.stringify(waMessage));
      
      // Remover conteúdo binário de mídia (muito grande)
      if (clone.message) {
        // Preservar estrutura mas limitar tamanho de jpegThumbnail
        ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage', 'documentMessage'].forEach(type => {
          if (clone.message[type]) {
            // Manter metadados mas remover thumbnail se for muito grande
            if (clone.message[type].jpegThumbnail?.length > 1000) {
              clone.message[type].jpegThumbnail = '[THUMBNAIL_REMOVED]';
            }
          }
        });
      }
      
      return clone;
    } catch (err) {
      // Se falhar parse, retornar objeto mínimo
      return {
        key: waMessage.key,
        pushName: waMessage.pushName,
        messageTimestamp: waMessage.messageTimestamp,
      };
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTÂNCIA SINGLETON E EXPORTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════

export const pendingMessageRecoveryService = new PendingMessageRecoveryService();

// Funções de conveniência
export function registerMessageProcessor(processor: (userId: string, connectionId: string, message: WAMessage) => Promise<void>): void {
  pendingMessageRecoveryService.registerMessageProcessor(processor);
}

export function saveIncomingMessage(params: {
  userId: string;
  connectionId: string;
  waMessage: WAMessage;
  messageContent: string | null;
  messageType?: string;
}): Promise<{ id: string; isDuplicate: boolean }> {
  return pendingMessageRecoveryService.saveIncomingMessage(params);
}

export function markMessageAsProcessed(whatsappMessageId: string): Promise<void> {
  return pendingMessageRecoveryService.markAsProcessed(whatsappMessageId);
}

export function markMessageAsFailed(whatsappMessageId: string, error: string): Promise<void> {
  return pendingMessageRecoveryService.markAsFailed(whatsappMessageId, error);
}

export function startMessageRecovery(userId: string, connectionId: string): Promise<void> {
  return pendingMessageRecoveryService.startRecoveryForUser(userId, connectionId);
}

export function logConnectionDisconnection(userId: string, connectionId: string, reason?: string): Promise<void> {
  return pendingMessageRecoveryService.logDisconnection(userId, connectionId, reason);
}

export function getRecoveryStats() {
  return pendingMessageRecoveryService.getStats();
}

export function getRecoveryStatsForUser(userId: string) {
  return pendingMessageRecoveryService.getStatsForUser(userId);
}

export default pendingMessageRecoveryService;
