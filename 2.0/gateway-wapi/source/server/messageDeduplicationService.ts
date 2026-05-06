/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║           🛡️ SISTEMA ANTI-REENVIO - DEDUPLICAÇÃO DE MENSAGENS              ║
 * ║                                                                              ║
 * ║  Este serviço GARANTE que mensagens NUNCA sejam reenviadas, mesmo após:     ║
 * ║  - Instabilidade na conexão WhatsApp (conecta/desconecta)                   ║
 * ║  - Restart do servidor Railway                                               ║
 * ║  - Reconexão após desconexão temporária                                     ║
 * ║  - Crash e recovery do sistema                                               ║
 * ║                                                                              ║
 * ║  ARQUITETURA:                                                                ║
 * ║  1. Cache em memória (rápido, mas perde no restart)                         ║
 * ║  2. Persistência no Supabase (sobrevive restart)                            ║
 * ║  3. Verificação dupla: memória primeiro, banco depois                       ║
 * ║                                                                              ║
 * ║  USO: TODOS os pontos de envio DEVEM chamar este serviço antes de enviar!   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { createSupabaseServiceClient } from './supabaseService';
import { buildOutgoingMessageFingerprint } from './outgoingMessageSimilarity';

// ═══════════════════════════════════════════════════════════════════════════════
//  TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export type MessageType = 
  | 'ai_response'      // Resposta do agente IA
  | 'followup'         // Follow-up automático
  | 'manual'           // Mensagem manual do dono
  | 'bulk'             // Envio em massa
  | 'admin'            // Mensagem do admin
  | 'notification'     // Notificação do sistema
  | 'media'            // Mídia (áudio, imagem, etc)
  | 'unknown';

export type MessageSource = 
  | 'whatsapp.ts'
  | 'messageQueueService'
  | 'userFollowUpService'
  | 'mediaService'
  | 'audioResponseService'
  | 'adminWhatsapp'
  | 'bulkSend'
  | 'queue'  // 🆕 Adicionado para mensagens vindas da fila
  | 'unknown';

interface DeduplicationRecord {
  dedupKey: string;
  userId: string;
  conversationId?: string;
  contactNumber?: string;
  messageType: MessageType;
  source: MessageSource;
  contentHash: string;
  createdAt: number;
}

interface IncomingMessageRecord {
  whatsappMessageId: string;
  userId: string;
  conversationId?: string;
  contactNumber?: string;
  processed: boolean;
  receivedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Cache em memória
  MEMORY_CACHE_TTL_MS: 2 * 60 * 60 * 1000,  // 2 horas em memória
  MEMORY_CACHE_MAX_SIZE: 50000,             // Máximo de registros em memória
  
  // Banco de dados
  DB_EXPIRY_HOURS: 48,                       // 48 horas no banco
  
  // Deduplicação
  SAME_MESSAGE_WINDOW_MS: 60 * 1000,         // 60 segundos - janela para considerar "mesma mensagem"
  SIMILAR_MESSAGE_WINDOW_MS: 5 * 60 * 1000,  // 5 minutos - janela para mensagens similares
  AUTOMATED_REPEAT_LOOKBACK_HOURS: 12,       // 12 horas - bloqueia automações que repetem exatamente o mesmo texto

  // Cleanup
  CLEANUP_INTERVAL_MS: 30 * 60 * 1000,       // Limpar cache a cada 30 minutos
};

// ═══════════════════════════════════════════════════════════════════════════════
//  CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

class MessageDeduplicationService {
  // Cache em memória para mensagens enviadas (rápido)
  private outgoingCache = new Map<string, DeduplicationRecord>();
  
  // Cache em memória para mensagens recebidas (evita reprocessamento)
  private incomingCache = new Map<string, IncomingMessageRecord>();
  
  // Cliente Supabase
  private supabase: SupabaseClient;
  
  // Estatísticas
  private stats = {
    outgoingBlocked: 0,
    outgoingAllowed: 0,
    incomingBlocked: 0,
    incomingAllowed: 0,
    dbErrors: 0,
    lastCleanup: Date.now(),
  };
  
  // Flag de inicialização
  private initialized = false;

  constructor() {
    this.supabase = createSupabaseServiceClient();
    
    console.log('🛡️ [ANTI-REENVIO] MessageDeduplicationService inicializado');
    
    // Iniciar cleanup periódico
    setInterval(() => this.cleanupExpiredCache(), CONFIG.CLEANUP_INTERVAL_MS);
    
    // Limpar banco a cada 6 horas
    setInterval(() => this.cleanupDatabase(), 6 * 60 * 60 * 1000);
    
    this.initialized = true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FUNÇÕES DE HASH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gera hash MD5 de uma string
   */
  private generateHash(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex').substring(0, 16);
  }

  /**
   * Gera chave única de deduplicação para mensagens enviadas
   * Formato: {userId}:{contactNumber}:{contentHash}:{timestamp_bucket}
   */
  private generateOutgoingDedupKey(
    userId: string,
    contactNumber: string,
    content: string,
    windowMs: number = CONFIG.SAME_MESSAGE_WINDOW_MS
  ): string {
    const contentHash = this.generateHash(content);
    const timestampBucket = Math.floor(Date.now() / windowMs);
    return `out:${userId}:${contactNumber}:${contentHash}:${timestampBucket}`;
  }

  /**
   * Gera chave para verificar mensagens similares (janela maior)
   */
  private generateSimilarMessageKey(
    userId: string,
    contactNumber: string,
    content: string
  ): string {
    const contentHash = this.generateHash(content);
    const timestampBucket = Math.floor(Date.now() / CONFIG.SIMILAR_MESSAGE_WINDOW_MS);
    return `similar:${userId}:${contactNumber}:${contentHash}:${timestampBucket}`;
  }

  private isAutomatedMessage(messageType: MessageType, source: MessageSource): boolean {
    return (
      messageType === "ai_response" ||
      messageType === "followup" ||
      source === "userFollowUpService"
    );
  }

  private generateAutomationRepeatHash(content: string): string {
    return this.generateHash(buildOutgoingMessageFingerprint(content));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VERIFICAÇÃO DE MENSAGENS ENVIADAS (OUTGOING)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 🛡️ VERIFICAÇÃO PRINCIPAL - Checa se pode enviar uma mensagem
   * 
   * Retorna TRUE se pode enviar, FALSE se é duplicata
   * 
   * IMPORTANTE: Esta função DEVE ser chamada ANTES de qualquer envio!
   */
  async canSendMessage(params: {
    userId: string;
    contactNumber: string;
    content: string;
    conversationId?: string;
    messageType?: MessageType;
    source?: MessageSource;
  }): Promise<boolean> {
    const { userId, contactNumber, content, conversationId, messageType = 'unknown', source = 'unknown' } = params;
    
    // Gerar chaves de deduplicação
    const dedupKey = this.generateOutgoingDedupKey(userId, contactNumber, content);
    const similarKey = this.generateSimilarMessageKey(userId, contactNumber, content);
    const contentHash = this.generateHash(content);
    const isAutomated = this.isAutomatedMessage(messageType, source);
    const automationRepeatHash = isAutomated
      ? this.generateAutomationRepeatHash(content)
      : contentHash;
    
    // 1️⃣ VERIFICAÇÃO RÁPIDA: Cache em memória
    if (this.outgoingCache.has(dedupKey)) {
      console.log(`🛡️ [ANTI-REENVIO] ❌ BLOQUEADO (cache memória): ${contactNumber} - "${content.substring(0, 30)}..."`);
      console.log(`   📍 Source: ${source} | Type: ${messageType}`);
      this.stats.outgoingBlocked++;
      return false;
    }
    
    // Verificar mensagem similar também
    if (this.outgoingCache.has(similarKey)) {
      console.log(`🛡️ [ANTI-REENVIO] ❌ BLOQUEADO (similar em 5min): ${contactNumber} - "${content.substring(0, 30)}..."`);
      this.stats.outgoingBlocked++;
      return false;
    }
    
    // 2️⃣ VERIFICAÇÃO PERSISTENTE: Banco de dados Supabase
    if (isAutomated) {
      const automatedRepeatCacheKey = `auto:${userId}:${contactNumber}:${automationRepeatHash}`;
      if (this.outgoingCache.has(automatedRepeatCacheKey)) {
        console.log(`ðŸ›¡ï¸ [ANTI-REENVIO] âŒ BLOQUEADO (automacao repetida em cache): ${contactNumber} - "${content.substring(0, 30)}..."`);
        console.log(`   ðŸ“ Source: ${source} | Type: ${messageType}`);
        this.stats.outgoingBlocked++;
        return false;
      }
    }

    try {
      const { data: existing, error } = await this.supabase
        .from('message_deduplication')
        .select('id')
        .eq('dedup_key', dedupKey)
        .single();
      
      if (existing) {
        console.log(`🛡️ [ANTI-REENVIO] ❌ BLOQUEADO (banco): ${contactNumber} - "${content.substring(0, 30)}..."`);
        console.log(`   📍 Source: ${source} | Type: ${messageType}`);
        this.stats.outgoingBlocked++;
        
        // Adicionar ao cache em memória para próxima verificação ser mais rápida
        this.addToOutgoingCache(dedupKey, {
          dedupKey,
          userId,
          conversationId,
          contactNumber,
          messageType,
          source,
          contentHash,
          createdAt: Date.now(),
        });
        
        return false;
      }
      
      if (isAutomated) {
        const lookbackDate = new Date(
          Date.now() - CONFIG.AUTOMATED_REPEAT_LOOKBACK_HOURS * 60 * 60 * 1000,
        ).toISOString();

        const { data: repeatedAutomation, error: repeatedAutomationError } = await this.supabase
          .from('message_deduplication')
          .select('id')
          .eq('user_id', userId)
          .eq('contact_number', contactNumber)
          .eq('content_hash', automationRepeatHash)
          .in('message_type', ['ai_response', 'followup'])
          .gte('created_at', lookbackDate)
          .limit(1);

        if (repeatedAutomation && repeatedAutomation.length > 0) {
          console.log(`ðŸ›¡ï¸ [ANTI-REENVIO] âŒ BLOQUEADO (automacao repetida no banco): ${contactNumber} - "${content.substring(0, 30)}..."`);
          console.log(`   ðŸ“ Source: ${source} | Type: ${messageType}`);
          this.stats.outgoingBlocked++;

          this.addToOutgoingCache(`auto:${userId}:${contactNumber}:${automationRepeatHash}`, {
            dedupKey: `auto:${userId}:${contactNumber}:${automationRepeatHash}`,
            userId,
            conversationId,
            contactNumber,
            messageType,
            source,
            contentHash: automationRepeatHash,
            createdAt: Date.now(),
          });

          return false;
        }

        if (repeatedAutomationError) {
          console.error('ðŸ›¡ï¸ [ANTI-REENVIO] Erro ao verificar automacao repetida:', repeatedAutomationError);
          this.stats.dbErrors++;
        }
      }

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = not found (esperado quando não existe)
        console.error('🛡️ [ANTI-REENVIO] Erro ao verificar banco:', error);
        this.stats.dbErrors++;
        // Em caso de erro de banco, permitir envio mas logar
      }
    } catch (err) {
      console.error('🛡️ [ANTI-REENVIO] Exceção ao verificar banco:', err);
      this.stats.dbErrors++;
    }
    
    // ✅ PODE ENVIAR - Registrar para evitar reenvio futuro
    await this.registerOutgoingMessage({
      userId,
      contactNumber,
      content,
      conversationId,
      messageType,
      source,
      contentHashOverride: isAutomated ? automationRepeatHash : undefined,
    });
    
    this.stats.outgoingAllowed++;
    return true;
  }

  /**
   * Registra uma mensagem como enviada (cache + banco)
   */
  async registerOutgoingMessage(params: {
    userId: string;
    contactNumber: string;
    content: string;
    conversationId?: string;
    messageType: MessageType;
    source: MessageSource;
    contentHashOverride?: string;
  }): Promise<void> {
    const { userId, contactNumber, content, conversationId, messageType, source, contentHashOverride } = params;
    
    const dedupKey = this.generateOutgoingDedupKey(userId, contactNumber, content);
    const similarKey = this.generateSimilarMessageKey(userId, contactNumber, content);
    const contentHash = contentHashOverride || this.generateHash(content);
    const isAutomated = this.isAutomatedMessage(messageType, source);
    
    const record: DeduplicationRecord = {
      dedupKey,
      userId,
      conversationId,
      contactNumber,
      messageType,
      source,
      contentHash,
      createdAt: Date.now(),
    };
    
    // 1️⃣ Adicionar ao cache em memória
    this.addToOutgoingCache(dedupKey, record);
    this.addToOutgoingCache(similarKey, { ...record, dedupKey: similarKey });
    if (isAutomated) {
      this.addToOutgoingCache(`auto:${userId}:${contactNumber}:${contentHash}`, {
        ...record,
        dedupKey: `auto:${userId}:${contactNumber}:${contentHash}`,
      });
    }
    
    // 2️⃣ Persistir no banco (async, não bloqueia)
    this.persistOutgoingMessage(record).catch(err => {
      console.error('🛡️ [ANTI-REENVIO] Erro ao persistir no banco:', err);
      this.stats.dbErrors++;
    });
    if (isAutomated) {
      this.persistOutgoingMessage({
        ...record,
        dedupKey: `auto:${userId}:${contactNumber}:${contentHash}`,
      }).catch(err => {
        console.error('ðŸ›¡ï¸ [ANTI-REENVIO] Erro ao persistir chave de automacao:', err);
        this.stats.dbErrors++;
      });
    }
  }

  /**
   * Adiciona registro ao cache com limite de tamanho
   */
  private addToOutgoingCache(key: string, record: DeduplicationRecord): void {
    // Verificar limite de tamanho
    if (this.outgoingCache.size >= CONFIG.MEMORY_CACHE_MAX_SIZE) {
      // Remover entradas mais antigas (10% do cache)
      const toRemove = Math.floor(CONFIG.MEMORY_CACHE_MAX_SIZE * 0.1);
      const keys = Array.from(this.outgoingCache.keys()).slice(0, toRemove);
      keys.forEach(k => this.outgoingCache.delete(k));
      console.log(`🛡️ [ANTI-REENVIO] Cache cheio, removidas ${toRemove} entradas antigas`);
    }
    
    this.outgoingCache.set(key, record);
  }

  /**
   * Persiste mensagem no banco Supabase
   */
  private async persistOutgoingMessage(record: DeduplicationRecord): Promise<void> {
    const expiresAt = new Date(Date.now() + CONFIG.DB_EXPIRY_HOURS * 60 * 60 * 1000);
    
    await this.supabase
      .from('message_deduplication')
      .upsert({
        dedup_key: record.dedupKey,
        user_id: record.userId,
        conversation_id: record.conversationId,
        contact_number: record.contactNumber,
        message_type: record.messageType,
        source: record.source,
        content_hash: record.contentHash,
        created_at: new Date(record.createdAt).toISOString(),
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'dedup_key',
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  VERIFICAÇÃO DE MENSAGENS RECEBIDAS (INCOMING)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 🛡️ Verifica se uma mensagem recebida já foi processada
   * 
   * Retorna TRUE se pode processar, FALSE se já foi processada
   */
  async checkIncomingMessageProcessed(params: {
    whatsappMessageId: string;
    userId: string;
    contactNumber?: string;
    conversationId?: string;
  }): Promise<{ processed: boolean; source: "cache" | "db" | "none" }> {
    const { whatsappMessageId, userId, contactNumber, conversationId } = params;

    // 1) Cache em memoria
    if (this.incomingCache.has(whatsappMessageId)) {
      return { processed: true, source: "cache" };
    }

    // 2) Banco de dados
    try {
      const { data: existing } = await this.supabase
        .from('incoming_message_log')
        .select('id')
        .eq('whatsapp_message_id', whatsappMessageId)
        .single();

      if (existing) {
        // Adicionar ao cache para proxima verificacao ser mais rapida
        this.incomingCache.set(whatsappMessageId, {
          whatsappMessageId,
          userId,
          contactNumber,
          conversationId,
          processed: true,
          receivedAt: Date.now(),
        });
        return { processed: true, source: "db" };
      }
    } catch (err) {
      // Ignorar erros de banco para nao bloquear mensagens legitimas
      console.error('??????? [ANTI-REENVIO] Erro ao verificar incoming:', err);
    }

    return { processed: false, source: "none" };
  }

  /**
   * ??????? Verifica se uma mensagem recebida ja foi processada
   * 
   * Retorna TRUE se pode processar, FALSE se ja foi processada
   */
  async canProcessIncomingMessage(params: {
    whatsappMessageId: string;
    userId: string;
    contactNumber?: string;
    conversationId?: string;
  }): Promise<boolean> {
    const { whatsappMessageId, userId, contactNumber, conversationId } = params;

    const check = await this.checkIncomingMessageProcessed({
      whatsappMessageId,
      userId,
      contactNumber,
      conversationId,
    });

    if (check.processed) {
      if (check.source === "cache") {
        console.log(`??????? [ANTI-REENVIO] ??? Mensagem ja processada (cache): ${whatsappMessageId}`);
      } else {
        console.log(`??????? [ANTI-REENVIO] ??? Mensagem ja processada (banco): ${whatsappMessageId}`);
      }
      this.stats.incomingBlocked++;
      return false;
    }

    // Pode processar: registrar para evitar reprocessamento (apenas para caminho legacy)
    await this.registerIncomingMessage({
      whatsappMessageId,
      userId,
      contactNumber,
      conversationId,
    });

    this.stats.incomingAllowed++;
    return true;
  }

  /**
   * ??????? Check-only: TRUE se ja foi processada (nao registra).
   */
  async isIncomingMessageProcessed(params: {
    whatsappMessageId: string;
    userId: string;
    contactNumber?: string;
    conversationId?: string;
  }): Promise<boolean> {
    const check = await this.checkIncomingMessageProcessed(params);
    return check.processed;
  }

  /**
   * Registra uma mensagem recebida como processada
   */
  async registerIncomingMessage(params: {
    whatsappMessageId: string;
    userId: string;
    contactNumber?: string;
    conversationId?: string;
  }): Promise<void> {
    const { whatsappMessageId, userId, contactNumber, conversationId } = params;
    
    // 1️⃣ Adicionar ao cache em memória
    this.incomingCache.set(whatsappMessageId, {
      whatsappMessageId,
      userId,
      contactNumber,
      conversationId,
      processed: true,
      receivedAt: Date.now(),
    });
    
    // 2️⃣ Persistir no banco (async, não bloqueia)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
    
    this.supabase
      .from('incoming_message_log')
      .upsert({
        whatsapp_message_id: whatsappMessageId,
        user_id: userId,
        contact_number: contactNumber,
        conversation_id: conversationId,
        processed: true,
        processed_at: new Date().toISOString(),
        received_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'whatsapp_message_id',
      })
      .then(({ error }) => {
        if (error) {
          console.error('🛡️ [ANTI-REENVIO] Erro ao persistir incoming:', error);
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LIMPEZA E MANUTENÇÃO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Limpa registros expirados do cache em memória
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiryTime = now - CONFIG.MEMORY_CACHE_TTL_MS;
    let cleaned = 0;
    const keysToDelete: string[] = [];
    
    // Limpar cache de saída
    this.outgoingCache.forEach((record, key) => {
      if (record.createdAt < expiryTime) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => {
      this.outgoingCache.delete(key);
      cleaned++;
    });
    
    // Limpar cache de entrada
    const incomingKeysToDelete: string[] = [];
    this.incomingCache.forEach((record, key) => {
      if (record.receivedAt < expiryTime) {
        incomingKeysToDelete.push(key);
      }
    });
    incomingKeysToDelete.forEach(key => {
      this.incomingCache.delete(key);
      cleaned++;
    });
    
    if (cleaned > 0) {
      console.log(`🛡️ [ANTI-REENVIO] Limpeza de cache: ${cleaned} registros removidos`);
    }
    
    this.stats.lastCleanup = now;
  }

  /**
   * Limpa registros expirados do banco de dados
   */
  private async cleanupDatabase(): Promise<void> {
    try {
      const { data, error } = await this.supabase.rpc('cleanup_expired_deduplication');
      
      if (error) {
        console.error('🛡️ [ANTI-REENVIO] Erro ao limpar banco:', error);
      } else {
        console.log(`🛡️ [ANTI-REENVIO] Limpeza de banco concluída: ${data || 0} registros removidos`);
      }
    } catch (err) {
      console.error('🛡️ [ANTI-REENVIO] Exceção ao limpar banco:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ESTATÍSTICAS E DEBUG
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna estatísticas do serviço
   */
  getStats(): {
    outgoingCacheSize: number;
    incomingCacheSize: number;
    outgoingBlocked: number;
    outgoingAllowed: number;
    incomingBlocked: number;
    incomingAllowed: number;
    dbErrors: number;
    lastCleanup: string;
  } {
    return {
      outgoingCacheSize: this.outgoingCache.size,
      incomingCacheSize: this.incomingCache.size,
      ...this.stats,
      lastCleanup: new Date(this.stats.lastCleanup).toISOString(),
    };
  }

  /**
   * Força limpeza de todos os caches (usar com cuidado!)
   */
  clearAllCaches(): void {
    this.outgoingCache.clear();
    this.incomingCache.clear();
    console.log('🛡️ [ANTI-REENVIO] ⚠️ Todos os caches foram limpos!');
  }

  /**
   * Remove registros de um usuário específico dos caches
   */
  clearUserCache(userId: string): void {
    let removed = 0;
    const keysToDelete: string[] = [];
    
    this.outgoingCache.forEach((record, key) => {
      if (record.userId === userId) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => {
      this.outgoingCache.delete(key);
      removed++;
    });
    
    const incomingKeysToDelete: string[] = [];
    this.incomingCache.forEach((record, key) => {
      if (record.userId === userId) {
        incomingKeysToDelete.push(key);
      }
    });
    incomingKeysToDelete.forEach(key => {
      this.incomingCache.delete(key);
      removed++;
    });
    
    console.log(`🛡️ [ANTI-REENVIO] Cache do usuário ${userId.substring(0, 8)}... limpo: ${removed} registros`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INSTÂNCIA SINGLETON E EXPORTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════

// Instância única do serviço
export const messageDeduplicationService = new MessageDeduplicationService();

// Funções de conveniência para uso direto
export async function canSendMessage(params: {
  userId: string;
  contactNumber: string;
  content: string;
  conversationId?: string;
  messageType?: MessageType;
  source?: MessageSource;
}): Promise<boolean> {
  return messageDeduplicationService.canSendMessage(params);
}

export async function canProcessIncomingMessage(params: {
  whatsappMessageId: string;
  userId: string;
  contactNumber?: string;
  conversationId?: string;
}): Promise<boolean> {
  return messageDeduplicationService.canProcessIncomingMessage(params);
}

export async function isIncomingMessageProcessed(params: {
  whatsappMessageId: string;
  userId: string;
  contactNumber?: string;
  conversationId?: string;
}): Promise<boolean> {
  return messageDeduplicationService.isIncomingMessageProcessed(params);
}

export async function markIncomingMessageProcessed(params: {
  whatsappMessageId: string;
  userId: string;
  contactNumber?: string;
  conversationId?: string;
}): Promise<void> {
  return messageDeduplicationService.registerIncomingMessage(params);
}

export function getDeduplicationStats() {
  return messageDeduplicationService.getStats();
}

export default messageDeduplicationService;
