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
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
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

type LocalPendingMessage = PendingMessage & {
  local_path?: string;
};

function isGatewayRuntime(): boolean {
  return (process.env.SERVICE_MODE || "").trim() === "wa-gateway";
}

function getLocalPendingRoot(): string {
  return (
    process.env.WA_GATEWAY_PENDING_INCOMING_DIR ||
    process.env.AGENTEZAP_GATEWAY_PENDING_INCOMING_DIR ||
    join(process.cwd(), "logs", "gateway-pending-incoming")
  ).trim();
}

function getLocalPendingDir(): string {
  return join(getLocalPendingRoot(), "pending");
}

function ensureLocalPendingDir(): void {
  const dir = getLocalPendingDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function safeLocalName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function buildLocalPendingFileName(userId: string, connectionId: string, messageId: string): string {
  const hash = createHash("sha1").update(`${userId}:${connectionId}:${messageId}`).digest("hex");
  return `${safeLocalName(messageId).slice(0, 80)}_${hash.slice(0, 16)}.json`;
}

function getLocalPendingPath(userId: string, connectionId: string, messageId: string): string {
  return join(getLocalPendingDir(), buildLocalPendingFileName(userId, connectionId, messageId));
}

function writeLocalPending(record: LocalPendingMessage): void {
  ensureLocalPendingDir();
  const path = getLocalPendingPath(record.user_id, record.connection_id, record.whatsapp_message_id);
  if (existsSync(path)) {
    return;
  }
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(record)}\n`, "utf8");
  renameSync(tmpPath, path);
}

function quarantineUnreadableLocalPending(path: string, error: unknown): void {
  try {
    const corruptDir = join(getLocalPendingRoot(), "corrupt");
    const corruptPath = join(corruptDir, `${Date.now()}-${basename(path)}`);
    mkdirSync(dirname(corruptPath), { recursive: true });
    renameSync(path, corruptPath);
    console.warn("[RECOVERY LOCAL] Quarantined unreadable pending local:", path, "->", corruptPath, error);
  } catch (quarantineError) {
    console.warn("[RECOVERY LOCAL] Failed to quarantine unreadable pending local:", path, quarantineError);
  }
}

function readLocalPending(path: string): LocalPendingMessage | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed?.user_id || !parsed?.connection_id || !parsed?.whatsapp_message_id) {
      quarantineUnreadableLocalPending(path, "missing required fields");
      return null;
    }
    return { ...(parsed as LocalPendingMessage), local_path: path };
  } catch (error) {
    quarantineUnreadableLocalPending(path, error);
    return null;
  }
}

function listLocalPending(userId: string, connectionId: string, limit = CONFIG.MAX_MESSAGES_PER_CYCLE): LocalPendingMessage[] {
  const dir = getLocalPendingDir();
  if (!existsSync(dir)) {
    return [];
  }
  const minAgeMs = getLocalPendingMinAgeMs();
  const now = Date.now();

  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readLocalPending(join(dir, name)))
    .filter((record): record is LocalPendingMessage => {
      if (!record || record.user_id !== userId || record.connection_id !== connectionId || record.status === "processed") {
        return false;
      }
      if (!isRecoverablePrivatePendingMessage(record)) {
        return false;
      }
      const receivedAt = new Date(record.received_at || 0).getTime();
      return !Number.isFinite(receivedAt) || now - receivedAt >= minAgeMs;
    })
    .sort((left, right) => String(left.received_at).localeCompare(String(right.received_at)))
    .slice(0, limit);
}

function listLocalPendingScopes(): Array<{ userId: string; connectionId: string; oldestReceivedAt: string; pendingCount: number }> {
  const dir = getLocalPendingDir();
  if (!existsSync(dir)) {
    return [];
  }
  const scopes = new Map<string, { userId: string; connectionId: string; oldestReceivedAt: string; pendingCount: number }>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const record = readLocalPending(join(dir, name));
    if (!record || record.status === "processed") {
      continue;
    }
    if (!isRecoverablePrivatePendingMessage(record)) {
      continue;
    }
    const key = `${record.user_id}:${record.connection_id}`;
    const receivedAt = String(record.received_at || "");
    const existing = scopes.get(key);
    if (!existing) {
      scopes.set(key, {
        userId: record.user_id,
        connectionId: record.connection_id,
        oldestReceivedAt: receivedAt,
        pendingCount: 1,
      });
    } else {
      existing.pendingCount += 1;
      if (!existing.oldestReceivedAt || (receivedAt && receivedAt < existing.oldestReceivedAt)) {
        existing.oldestReceivedAt = receivedAt;
      }
    }
  }
  return Array.from(scopes.values()).sort((left, right) => {
    const byAge = String(left.oldestReceivedAt).localeCompare(String(right.oldestReceivedAt));
    if (byAge !== 0) return byAge;
    return right.pendingCount - left.pendingCount;
  });
}

function getLocalPendingMinAgeMs(): number {
  const parsed = Number.parseInt(String(process.env.WA_GATEWAY_PENDING_INCOMING_MIN_AGE_MS || ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30_000;
}

function getLocalRecoverySweepIntervalMs(): number {
  const parsed = Number.parseInt(String(process.env.WA_GATEWAY_PENDING_INCOMING_SWEEP_INTERVAL_MS || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(10_000, parsed) : 60_000;
}

function getLocalRecoverySweepConcurrency(): number {
  const parsed = Number.parseInt(String(process.env.WA_GATEWAY_PENDING_INCOMING_SWEEP_CONCURRENCY || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.max(parsed, 1), 8) : 4;
}

function removeLocalPendingByMessageId(messageId: string): void {
  const dir = getLocalPendingDir();
  if (!existsSync(dir)) {
    return;
  }
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const path = join(dir, name);
    const record = readLocalPending(path);
    if (record?.whatsapp_message_id === messageId) {
      rmSync(path, { force: true });
    }
  }
}

function isRecoverablePrivatePendingMessage(row: {
  remote_jid?: string | null;
  message_type?: string | null;
}): boolean {
  const remoteJid = String(row.remote_jid || "").toLowerCase();
  const messageType = String(row.message_type || "").toLowerCase();

  if (!remoteJid) {
    return false;
  }

  if (remoteJid.includes("@g.us") || remoteJid.includes("@newsletter")) {
    return false;
  }

  if (messageType === "protocol" || messageType === "stub") {
    return false;
  }

  return true;
}

function describeNonRecoverablePendingReason(row: {
  remote_jid?: string | null;
  message_type?: string | null;
}): string | null {
  const remoteJid = String(row.remote_jid || "").toLowerCase();
  const messageType = String(row.message_type || "").toLowerCase();

  if (!remoteJid) {
    return "missing_remote_jid";
  }

  if (remoteJid.includes("@g.us")) {
    return "group_low_priority";
  }

  if (remoteJid.includes("@newsletter")) {
    return "newsletter_noise";
  }

  if (messageType === "protocol" || messageType === "stub") {
    return "protocol_or_stub_noise";
  }

  return null;
}

class PendingMessageRecoveryService {
  private supabase: SupabaseClient;
  private initialized = false;
  private processingScopes = new Set<string>(); // Evita processamento paralelo por conexão
  private localRecoverySweepTimer: NodeJS.Timeout | null = null;
  private localRecoveryScopeBackoff = new Map<string, number>();
  private localRecoveryScopeTimers = new Map<string, NodeJS.Timeout>();
  
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

    if (isGatewayRuntime()) {
      console.log('[RECOVERY] PendingMessageRecoveryService carregado em modo gateway; recovery local em disco ativo.');
      this.initialized = true;
      this.startLocalRecoverySweep();
      return;
    }
    
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

    const nonRecoverableReason = describeNonRecoverablePendingReason({
      remote_jid: remoteJid,
      message_type: messageType,
    });

    if (nonRecoverableReason) {
      this.stats.totalSkipped++;
      console.log(`[RECOVERY] Durable queue ignorou evento ${nonRecoverableReason}: ${remoteJid}`);
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
    const rawMessage = this.sanitizeMessageForStorage(waMessage);

    if (isGatewayRuntime()) {
      try {
        const now = new Date();
        writeLocalPending({
          id: `${connectionId}:${messageId}`,
          user_id: userId,
          connection_id: connectionId,
          whatsapp_message_id: messageId,
          remote_jid: remoteJid,
          contact_number: contactNumber,
          push_name: waMessage.pushName || null,
          message_content: messageContent,
          message_type: messageType,
          raw_message: rawMessage,
          status: 'pending',
          process_attempts: 0,
          last_attempt_at: null,
          error_message: null,
          received_at: now.toISOString(),
          processed_at: null,
          expires_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
        });
        this.scheduleLocalRecoveryForUser(userId, connectionId);
      } catch (localErr) {
        console.error('[RECOVERY LOCAL] Falha ao salvar pending local:', localErr);
      }
    }
    
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
          raw_message: rawMessage,
          status: 'pending',
          process_attempts: 0,
          received_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h
        }, {
          onConflict: 'whatsapp_message_id',
          ignoreDuplicates: true, // Não atualizar se já existe
        })
        .select('id')
        .maybeSingle(); // FIX 2026-02-25: .single() causes PGRST116 when upsert ignores duplicate (no row returned)
      
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
      
      this.stats.totalSaved++;
      console.log(`🚨 [RECOVERY] ✅ Mensagem salva: ${messageId} | Contato: ${contactNumber}`);
      
      return { id: data?.id || '', isDuplicate: false };
    } catch (err) {
      console.error('🚨 [RECOVERY] Exceção ao salvar mensagem:', err);
      return { id: '', isDuplicate: false };
    }
  }

  /**
   * Marca mensagem como processada com sucesso
   */
  async markAsProcessed(whatsappMessageId: string): Promise<void> {
    if (isGatewayRuntime()) {
      try {
        removeLocalPendingByMessageId(whatsappMessageId);
      } catch (localErr) {
        console.error('[RECOVERY LOCAL] Erro ao remover pending local processado:', localErr);
      }
    }

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
  private startLocalRecoverySweep(): void {
    if (this.localRecoverySweepTimer) {
      return;
    }
    const intervalMs = getLocalRecoverySweepIntervalMs();
    this.localRecoverySweepTimer = setInterval(() => {
      void this.processLocalRecoverySweep();
    }, intervalMs);
    this.localRecoverySweepTimer.unref?.();
    setTimeout(() => {
      void this.processLocalRecoverySweep();
    }, CONFIG.POST_CONNECT_DELAY_MS).unref?.();
    console.log(`[RECOVERY LOCAL] Sweep ativo a cada ${intervalMs}ms`);
  }

  private async processLocalRecoverySweep(): Promise<void> {
    if (!isGatewayRuntime() || !this.messageProcessor) {
      return;
    }

    const scopes = listLocalPendingScopes();
    if (scopes.length === 0) {
      return;
    }

    const concurrency = Math.min(getLocalRecoverySweepConcurrency(), scopes.length);
    let nextIndex = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (nextIndex < scopes.length) {
        const scope = scopes[nextIndex++];
        await this.processLocalRecoveryForUser(scope.userId, scope.connectionId);
      }
    });
    await Promise.all(workers);
  }

  async startRecoveryForUser(userId: string, connectionId: string): Promise<void> {
    if (isGatewayRuntime()) {
      await this.startLocalRecoveryForUser(userId, connectionId);
      return;
    }
    // Verificar se já está processando
    const scopeKey = `${userId}:${connectionId}`;
    if (this.processingScopes.has(scopeKey)) {
      console.log(`🚨 [RECOVERY] Usuário ${userId} já em processamento de recovery`);
      return;
    }
    
    // Aguardar estabilização da conexão
    console.log(`🚨 [RECOVERY] Aguardando ${CONFIG.POST_CONNECT_DELAY_MS/1000}s para estabilizar conexão...`);
    
    setTimeout(async () => {
      await this.processRecoveryForUser(userId, connectionId);
    }, CONFIG.POST_CONNECT_DELAY_MS);
  }

  /**
   * Processa mensagens pendentes de um usuário
   */
  async startLocalRecoveryForUser(userId: string, connectionId: string): Promise<void> {
    const scopeKey = `local:${userId}:${connectionId}`;
    this.localRecoveryScopeBackoff.delete(scopeKey);
    if (this.processingScopes.has(scopeKey)) {
      console.log(`[RECOVERY LOCAL] Usuario ${userId.substring(0, 8)} ja em processamento`);
      return;
    }

    setTimeout(async () => {
      await this.processLocalRecoveryForUser(userId, connectionId);
    }, CONFIG.POST_CONNECT_DELAY_MS);
  }

  private scheduleLocalRecoveryForUser(userId: string, connectionId: string, delayMs = getLocalPendingMinAgeMs()): void {
    if (!isGatewayRuntime()) {
      return;
    }
    const scopeKey = `local:${userId}:${connectionId}`;
    if (this.localRecoveryScopeTimers.has(scopeKey) || this.processingScopes.has(scopeKey)) {
      return;
    }
    const timer = setTimeout(async () => {
      this.localRecoveryScopeTimers.delete(scopeKey);
      await this.processLocalRecoveryForUser(userId, connectionId);
    }, Math.max(1_000, delayMs));
    timer.unref?.();
    this.localRecoveryScopeTimers.set(scopeKey, timer);
  }

  private async processLocalRecoveryForUser(userId: string, connectionId: string): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      success: false,
      messagesProcessed: 0,
      messagesFailed: 0,
      messagesSkipped: 0,
      errors: [],
    };
    const scopeKey = `local:${userId}:${connectionId}`;
    const retryAfter = this.localRecoveryScopeBackoff.get(scopeKey) || 0;
    if (retryAfter > Date.now()) {
      result.success = true;
      return result;
    }

    if (!this.messageProcessor) {
      result.errors.push('Message processor nao registrado');
      console.error('[RECOVERY LOCAL] Message processor nao registrado');
      return result;
    }

    this.processingScopes.add(scopeKey);

    try {
      const pendingMessages = listLocalPending(userId, connectionId);
      if (pendingMessages.length === 0) {
        result.success = true;
        return result;
      }

      console.log(`[RECOVERY LOCAL] ${pendingMessages.length} mensagens pendentes locais para ${userId.substring(0, 8)}...`);

      for (const pending of pendingMessages) {
        try {
          const waMessage = pending.raw_message as WAMessage;
          if (!waMessage) {
            result.messagesSkipped++;
            if (pending.local_path) rmSync(pending.local_path, { force: true });
            continue;
          }

          await this.messageProcessor(userId, pending.connection_id || connectionId, waMessage);
          if (pending.local_path) rmSync(pending.local_path, { force: true });
          result.messagesProcessed++;
          this.stats.totalRecovered++;
          this.localRecoveryScopeBackoff.delete(scopeKey);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          result.messagesFailed++;
          result.errors.push(errorMsg);
          console.error(`[RECOVERY LOCAL] Erro ao reprocessar ${pending.whatsapp_message_id}:`, errorMsg);
          if (/sess.*(indispon|n.o dispon|nao dispon)/i.test(errorMsg.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
            this.localRecoveryScopeBackoff.set(scopeKey, Date.now() + 5 * 60_000);
            break;
          }
        }
      }

      result.success = result.messagesFailed === 0;
      return result;
    } finally {
      this.processingScopes.delete(scopeKey);
    }
  }

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
        .not('remote_jid', 'like', '%@g.us')
        .not('remote_jid', 'like', '%@newsletter')
        .not('message_type', 'in', '(protocol,stub)')
        .lt('process_attempts', CONFIG.MAX_PROCESS_ATTEMPTS)
        .order('received_at', { ascending: true })
        .limit(CONFIG.MAX_MESSAGES_PER_CYCLE);
      
      if (error) {
        console.error('🚨 [RECOVERY] Erro ao buscar pendentes:', error);
        result.errors.push(error.message);
        return result;
      }
      
      const recoverablePendingMessages = ((pendingMessages || []) as PendingMessage[])
        .filter(isRecoverablePrivatePendingMessage);

      if (recoverablePendingMessages.length === 0) {
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
      
      console.log(`🚨 [RECOVERY] 📥 ${recoverablePendingMessages.length} mensagens pendentes encontradas!`);
      console.log(`🚨 [RECOVERY] Usando Exponential Backoff com Jitter (AWS Best Practice)`);
      
      let consecutiveFailuresInCycle = 0;
      
      for (let i = 0; i < recoverablePendingMessages.length; i++) {
        const pending = recoverablePendingMessages[i] as PendingMessage;
        
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
          
          console.log(`🚨 [RECOVERY] 🔄 [${i+1}/${recoverablePendingMessages.length}] Processando: ${pending.contact_number} - "${(pending.message_content || '').substring(0, 30)}..."`);
          
          // Processar usando o callback registrado
          await this.messageProcessor(userId, pending.connection_id || connectionId, waMessage);
          
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
      usersProcessing: this.processingScopes.size,
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
