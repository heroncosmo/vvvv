/**
 * 🔄 SERVIÇO DE SINCRONIZAÇÃO COMPLETA DE CONTATOS - FILA ASSÍNCRONA GLOBAL
 * 
 * ⚠️ OTIMIZADO PARA ESCALA - Todos os clientes do sistema usam este serviço!
 * 
 * FUNCIONALIDADES:
 * - Sincronização de TODOS os contatos (agenda + conversas)
 * - Fila FIFO global para não sobrecarregar o Supabase
 * - Batch upserts otimizados (máximo 50 contatos por batch)
 * - Rate limiting: 1 sync por vez no sistema inteiro
 * - Cron job automático: 1x por dia às 03:00 (horário de menor uso)
 * - Botão manual "Sincronizar" disponível a qualquer momento
 * 
 * OTIMIZAÇÕES PARA SUPABASE:
 * - Egress: Batches pequenos, sem retornar dados desnecessários
 * - Disk IO: Upsert com ON CONFLICT para evitar duplicatas
 * - Connection Pool: Reusa conexões do pool existente
 * 
 * @author Agentezap Team
 * @version 2.0.0
 */

import { storage } from "./storage";
import { db } from "./db";
import { whatsappContacts, conversations, whatsappConnections } from "../shared/schema";
import { eq, and, desc, sql, isNotNull, ne } from "drizzle-orm";
import {
  deriveStoredPhoneNumber,
  extractPhoneDigitsFromWhatsAppIdentity,
  normalizeWhatsAppIdentity,
} from "./whatsappContactIdentity";

// ============================================
// CONFIGURAÇÕES DE PERFORMANCE
// ============================================
const CONFIG = {
  // Batching
  BATCH_SIZE: 50,                  // Contatos por batch (otimizado para Supabase)
  DELAY_BETWEEN_BATCHES_MS: 1000,  // 1s entre batches para não sobrecarregar
  
  // Limites
  MAX_CONTACTS_PER_SYNC: 50000,    // Máximo de contatos por cliente
  MAX_CONCURRENT_SYNCS: 1,         // Apenas 1 sync por vez (evita sobrecarga)
  
  // Cache
  CACHE_TTL_MS: 30 * 60 * 1000,    // 30 minutos de cache
  
  // Rate Limiting
  MIN_HOURS_BETWEEN_SYNCS: 6,      // Mínimo de 6 horas entre syncs do mesmo cliente
  
  // Cron
  CRON_HOUR_UTC: 6,                // 03:00 BRT = 06:00 UTC
};

// ============================================
// TIPOS E INTERFACES
// ============================================
interface FullSyncStatus {
  connectionId: string;
  userId: string;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'error';
  progress: number;
  totalContacts: number;
  processedContacts: number;
  contactsFromWhatsapp: number;  // Contatos da agenda
  contactsFromConversations: number;  // Contatos de conversas
  lastSyncAt?: Date;
  nextAutoSyncAt?: Date;
  error?: string;
  queuePosition?: number;
}

interface ContactToSync {
  contactId: string;
  phone?: string;
  name: string;
  source: 'whatsapp' | 'conversation';
  lid?: string;
}

// ============================================
// ESTADO GLOBAL
// ============================================
const fullSyncStatusMap = new Map<string, FullSyncStatus>();
const globalFullSyncQueue: string[] = [];  // connectionIds na fila
let activeFullSyncs = 0;
let cronJobStarted = false;
let dailySyncCronInterval: NodeJS.Timeout | null = null;

// Cache de contatos já processados
const processedContactsCache = new Map<string, Set<string>>();

// ============================================
// FUNÇÕES PÚBLICAS
// ============================================

/**
 * Obtém status da sincronização completa
 */
export function getFullSyncStatus(connectionId: string): FullSyncStatus {
  const status = fullSyncStatusMap.get(connectionId);
  if (status) {
    const queuePosition = globalFullSyncQueue.indexOf(connectionId);
    return {
      ...status,
      queuePosition: queuePosition >= 0 ? queuePosition + 1 : undefined,
    };
  }
  
  return {
    connectionId,
    userId: '',
    status: 'idle',
    progress: 0,
    totalContacts: 0,
    processedContacts: 0,
    contactsFromWhatsapp: 0,
    contactsFromConversations: 0,
  };
}

export function stopDailySyncCron(): void {
  if (dailySyncCronInterval) {
    clearInterval(dailySyncCronInterval);
    dailySyncCronInterval = null;
  }

  cronJobStarted = false;
}

/**
 * Inicia sincronização COMPLETA de todos os contatos
 * Combina contatos do WhatsApp (contacts.upsert) + conversas
 */
export async function startFullContactSync(
  userId: string, 
  connectionId: string,
  force: boolean = false
): Promise<{ 
  message: string; 
  status: 'started' | 'queued' | 'already_running' | 'rate_limited' | 'error';
  queuePosition?: number;
}> {
  console.log(`\n📱 [FULL SYNC] Iniciando sincronização completa para connection ${connectionId}`);
  
  const currentStatus = fullSyncStatusMap.get(connectionId);
  
  // Verificar se já está rodando
  if (currentStatus?.status === 'running') {
    console.log(`[FULL SYNC] ⏳ Sincronização já em andamento para ${connectionId}`);
    return { 
      message: '⏳ Sincronização já está em andamento. Aguarde até 15 minutos.',
      status: 'already_running'
    };
  }
  
  // Verificar se já está na fila
  if (currentStatus?.status === 'queued') {
    const position = globalFullSyncQueue.indexOf(connectionId) + 1;
    console.log(`[FULL SYNC] ⏳ Connection ${connectionId} já está na fila (posição ${position})`);
    return { 
      message: `⏳ Você está na posição ${position} da fila. Aguarde sua vez.`,
      status: 'queued',
      queuePosition: position
    };
  }
  
  // Verificar rate limiting (a menos que seja forçado)
  if (!force) {
    const lastSync = await getLastSyncTime(connectionId);
    if (lastSync) {
      const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync < CONFIG.MIN_HOURS_BETWEEN_SYNCS) {
        const hoursRemaining = CONFIG.MIN_HOURS_BETWEEN_SYNCS - hoursSinceSync;
        console.log(`[FULL SYNC] ⏰ Rate limited para ${connectionId}. Próximo sync em ${hoursRemaining.toFixed(1)}h`);
        return {
          message: `⏰ Última sincronização foi há ${hoursSinceSync.toFixed(1)}h. Aguarde mais ${hoursRemaining.toFixed(1)}h ou use o botão "Forçar Sincronização".`,
          status: 'rate_limited'
        };
      }
    }
  }
  
  // Adicionar à fila
  if (!globalFullSyncQueue.includes(connectionId)) {
    globalFullSyncQueue.push(connectionId);
  }
  
  const position = globalFullSyncQueue.indexOf(connectionId) + 1;
  
  // Calcular próximo sync automático
  const nextAutoSync = getNextAutoSyncTime();
  
  // Inicializar status
  fullSyncStatusMap.set(connectionId, {
    connectionId,
    userId,
    status: 'queued',
    progress: 0,
    totalContacts: 0,
    processedContacts: 0,
    contactsFromWhatsapp: 0,
    contactsFromConversations: 0,
    queuePosition: position,
    nextAutoSyncAt: nextAutoSync,
  });
  
  console.log(`[FULL SYNC] ✅ Connection ${connectionId} adicionado à fila (posição ${position})`);
  
  // Iniciar processamento da fila
  processFullSyncQueue();
  
  if (position === 1 && activeFullSyncs < CONFIG.MAX_CONCURRENT_SYNCS) {
    return {
      message: '✅ Sincronização completa iniciada! Aguarde até 15 minutos para todos os contatos aparecerem.',
      status: 'started'
    };
  }
  
  const estimatedMinutes = position * 10;
  return {
    message: `⏳ Você está na posição ${position} da fila. Tempo estimado: ${estimatedMinutes} minutos.`,
    status: 'queued',
    queuePosition: position
  };
}

/**
 * Agenda sincronização para TODOS os clientes ativos
 * Usado pelo cron job diário
 */
export async function scheduleFullSyncForAllClients(): Promise<{
  scheduled: number;
  skipped: number;
  errors: number;
}> {
  console.log(`\n🕐 [CRON] Iniciando agendamento de sincronização para todos os clientes...`);
  
  let scheduled = 0;
  let skipped = 0;
  let errors = 0;
  
  try {
    // Buscar todas as conexões ativas
    const activeConnections = await db
      .select({
        id: whatsappConnections.id,
        userId: whatsappConnections.userId,
        isConnected: whatsappConnections.isConnected,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.isConnected, true));
    
    console.log(`[CRON] Encontradas ${activeConnections.length} conexões ativas`);
    
    for (const conn of activeConnections) {
      try {
        // Verificar se já está na fila ou rodando
        const status = fullSyncStatusMap.get(conn.id);
        if (status?.status === 'running' || status?.status === 'queued') {
          console.log(`[CRON] ⏭️ Connection ${conn.id} já está processando, pulando...`);
          skipped++;
          continue;
        }
        
        // Verificar rate limiting
        const lastSync = await getLastSyncTime(conn.id);
        if (lastSync) {
          const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
          if (hoursSinceSync < CONFIG.MIN_HOURS_BETWEEN_SYNCS) {
            console.log(`[CRON] ⏭️ Connection ${conn.id} sincronizado recentemente, pulando...`);
            skipped++;
            continue;
          }
        }
        
        // Adicionar à fila
        if (!globalFullSyncQueue.includes(conn.id)) {
          globalFullSyncQueue.push(conn.id);
          
          fullSyncStatusMap.set(conn.id, {
            connectionId: conn.id,
            userId: conn.userId,
            status: 'queued',
            progress: 0,
            totalContacts: 0,
            processedContacts: 0,
            contactsFromWhatsapp: 0,
            contactsFromConversations: 0,
            queuePosition: globalFullSyncQueue.length,
            nextAutoSyncAt: getNextAutoSyncTime(),
          });
          
          scheduled++;
          console.log(`[CRON] ✅ Connection ${conn.id} agendado (posição ${globalFullSyncQueue.length})`);
        }
      } catch (err) {
        console.error(`[CRON] ❌ Erro ao agendar ${conn.id}:`, err);
        errors++;
      }
    }
    
    // Iniciar processamento da fila
    if (scheduled > 0) {
      processFullSyncQueue();
    }
    
    console.log(`[CRON] ✅ Agendamento concluído: ${scheduled} agendados, ${skipped} pulados, ${errors} erros`);
    
  } catch (error) {
    console.error(`[CRON] ❌ Erro ao buscar conexões:`, error);
  }
  
  return { scheduled, skipped, errors };
}

/**
 * Inicia o cron job de sincronização diária
 */
export function startDailySyncCron(): void {
  if (cronJobStarted) {
    console.log(`[CRON] Cron job já está rodando, ignorando...`);
    return;
  }
  
  cronJobStarted = true;
  console.log(`\n🕐 [CRON] Iniciando cron job de sincronização diária (${CONFIG.CRON_HOUR_UTC}:00 UTC / 03:00 BRT)`);
  
  // Verificar a cada hora se é hora de rodar
  dailySyncCronInterval = setInterval(async () => {
    const now = new Date();
    const currentHourUTC = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    
    // Rodar apenas na hora exata (entre :00 e :05)
    if (currentHourUTC === CONFIG.CRON_HOUR_UTC && currentMinute < 5) {
      console.log(`\n🕐 [CRON] Hora de sincronização diária! ${now.toISOString()}`);
      await scheduleFullSyncForAllClients();
    }
  }, 60 * 1000);  // Verificar a cada minuto
  
  console.log(`[CRON] ✅ Cron job iniciado com sucesso`);
}

/**
 * Retorna estatísticas da fila
 */
export function getQueueStats(): {
  queueLength: number;
  activeSyncs: number;
  connections: string[];
} {
  return {
    queueLength: globalFullSyncQueue.length,
    activeSyncs: activeFullSyncs,
    connections: [...globalFullSyncQueue],
  };
}

// ============================================
// FUNÇÕES INTERNAS
// ============================================

/**
 * Processa a fila global de sincronização
 */
async function processFullSyncQueue(): Promise<void> {
  // Verificar se pode processar
  if (activeFullSyncs >= CONFIG.MAX_CONCURRENT_SYNCS || globalFullSyncQueue.length === 0) {
    return;
  }
  
  // Pegar próximo da fila
  const connectionId = globalFullSyncQueue[0];
  const status = fullSyncStatusMap.get(connectionId);
  
  if (!status || status.status !== 'queued') {
    globalFullSyncQueue.shift();
    processFullSyncQueue();
    return;
  }
  
  // Marcar como rodando
  activeFullSyncs++;
  fullSyncStatusMap.set(connectionId, { ...status, status: 'running' });
  globalFullSyncQueue.shift();
  
  // Atualizar posições na fila
  globalFullSyncQueue.forEach((connId, index) => {
    const s = fullSyncStatusMap.get(connId);
    if (s) {
      fullSyncStatusMap.set(connId, { ...s, queuePosition: index + 1 });
    }
  });
  
  console.log(`\n🚀 [FULL SYNC] Iniciando sincronização para ${connectionId}`);
  
  try {
    await executeFullSync(connectionId, status.userId);
  } catch (error) {
    console.error(`[FULL SYNC] ❌ Erro ao sincronizar ${connectionId}:`, error);
    fullSyncStatusMap.set(connectionId, {
      ...status,
      status: 'error',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  } finally {
    activeFullSyncs--;
    // Processar próximo após delay
    setTimeout(() => processFullSyncQueue(), 2000);
  }
}

/**
 * Executa a sincronização completa para uma conexão
 */
async function executeFullSync(connectionId: string, userId: string): Promise<void> {
  const status = fullSyncStatusMap.get(connectionId)!;
  
  console.log(`[FULL SYNC] 📥 Coletando contatos para ${connectionId}...`);
  
  // Limpar cache antigo para esta conexão
  processedContactsCache.delete(connectionId);
  const processedPhones = new Set<string>();
  processedContactsCache.set(connectionId, processedPhones);
  
  // 1. BUSCAR CONTATOS JÁ SALVOS DO WHATSAPP (contacts.upsert)
  console.log(`[FULL SYNC] 1️⃣ Buscando contatos salvos do WhatsApp...`);
  const whatsappContacts = await getWhatsappContacts(connectionId);
  console.log(`[FULL SYNC]    → ${whatsappContacts.length} contatos do WhatsApp`);
  
  // 2. BUSCAR CONTATOS DAS CONVERSAS
  console.log(`[FULL SYNC] 2️⃣ Buscando contatos das conversas...`);
  const conversationContacts = await getConversationContacts(connectionId);
  console.log(`[FULL SYNC]    → ${conversationContacts.length} contatos de conversas`);
  
  // 3. MESCLAR E DEDUPLIC AR
  const allContacts = new Map<string, ContactToSync>();
  
  // Primeiro os contatos do WhatsApp (têm mais dados)
  for (const contact of whatsappContacts) {
    if (contact.phone && !allContacts.has(contact.phone)) {
      allContacts.set(contact.phone, contact);
    }
  }
  
  // Depois os das conversas (preenche gaps)
  for (const contact of conversationContacts) {
    if (contact.phone && !allContacts.has(contact.phone)) {
      allContacts.set(contact.phone, contact);
    } else if (contact.phone && !allContacts.get(contact.phone)?.name && contact.name) {
      // Atualizar nome se o contato do WhatsApp não tinha
      const existing = allContacts.get(contact.phone)!;
      allContacts.set(contact.phone, { ...existing, name: contact.name });
    }
  }
  
  const contactsToSync = Array.from(allContacts.values());
  const total = contactsToSync.length;
  
  console.log(`[FULL SYNC] 📊 Total de contatos únicos: ${total}`);
  
  // Atualizar status
  fullSyncStatusMap.set(connectionId, {
    ...status,
    totalContacts: total,
    contactsFromWhatsapp: whatsappContacts.length,
    contactsFromConversations: conversationContacts.length,
  });
  
  if (total === 0) {
    fullSyncStatusMap.set(connectionId, {
      ...status,
      status: 'completed',
      progress: 100,
      totalContacts: 0,
      processedContacts: 0,
      lastSyncAt: new Date(),
      nextAutoSyncAt: getNextAutoSyncTime(),
    });
    console.log(`[FULL SYNC] ✅ Nenhum contato para sincronizar`);
    return;
  }
  
  // 4. PROCESSAR EM BATCHES
  console.log(`[FULL SYNC] 📤 Salvando contatos em batches de ${CONFIG.BATCH_SIZE}...`);
  
  for (let i = 0; i < contactsToSync.length; i += CONFIG.BATCH_SIZE) {
    const batch = contactsToSync.slice(i, i + CONFIG.BATCH_SIZE);
    
    try {
      await saveBatchToDatabase(connectionId, batch);
      
      // Marcar como processados
      for (const contact of batch) {
        if (contact.phone) {
          processedPhones.add(contact.phone);
        }
      }
      
      // Atualizar progresso
      const processed = Math.min(i + CONFIG.BATCH_SIZE, total);
      const progress = Math.round((processed / total) * 100);
      
      fullSyncStatusMap.set(connectionId, {
        ...fullSyncStatusMap.get(connectionId)!,
        processedContacts: processed,
        progress,
      });
      
      // Log a cada 25%
      if (progress % 25 === 0 || processed === total) {
        console.log(`[FULL SYNC] 📊 Progresso: ${progress}% (${processed}/${total})`);
      }
      
      // Delay entre batches
      if (i + CONFIG.BATCH_SIZE < total) {
        await sleep(CONFIG.DELAY_BETWEEN_BATCHES_MS);
      }
    } catch (err) {
      console.error(`[FULL SYNC] ❌ Erro no batch ${i}:`, err);
      // Continua com o próximo batch
    }
  }
  
  // 5. FINALIZAR
  fullSyncStatusMap.set(connectionId, {
    ...fullSyncStatusMap.get(connectionId)!,
    status: 'completed',
    progress: 100,
    processedContacts: total,
    lastSyncAt: new Date(),
    nextAutoSyncAt: getNextAutoSyncTime(),
  });
  
  console.log(`\n✅ [FULL SYNC] Concluído para ${connectionId}!`);
  console.log(`   📊 Total: ${total} contatos`);
  console.log(`   📱 WhatsApp: ${whatsappContacts.length}`);
  console.log(`   💬 Conversas: ${conversationContacts.length}`);
}

/**
 * Busca contatos já salvos do WhatsApp (via contacts.upsert)
 */
async function getWhatsappContacts(connectionId: string): Promise<ContactToSync[]> {
  try {
    const contacts = await db
      .select({
        contactId: whatsappContacts.contactId,
        phoneNumber: whatsappContacts.phoneNumber,
        name: whatsappContacts.name,
        lid: whatsappContacts.lid,
      })
      .from(whatsappContacts)
      .where(and(
        eq(whatsappContacts.connectionId, connectionId),
        isNotNull(whatsappContacts.contactId),
        sql`not (
          ${whatsappContacts.contactId} like '%@s.whatsapp.net'
          and coalesce(${whatsappContacts.phoneNumber}, '') not like '%@s.whatsapp.net'
          and coalesce(${whatsappContacts.phoneNumber}, '') not like '%@c.us'
          and exists (
            select 1
            from whatsapp_contacts lid_wc
            where lid_wc.connection_id = ${connectionId}
              and split_part(lid_wc.contact_id, '@', 1) = split_part(${whatsappContacts.contactId}, '@', 1)
              and lid_wc.contact_id like '%@lid'
          )
        )`
      ))
      .limit(CONFIG.MAX_CONTACTS_PER_SYNC);
    
    return contacts
      .map((contact) => {
        const contactId = normalizeWhatsAppIdentity(contact.contactId);
        const storedPhoneNumber = deriveStoredPhoneNumber(
          contact.contactId,
          contact.phoneNumber,
        );
        const phone = extractPhoneDigitsFromWhatsAppIdentity(storedPhoneNumber);

        if (!contactId) {
          return null;
        }

        return {
          contactId,
          phone: phone || undefined,
          name: contact.name || '',
          source: 'whatsapp' as const,
          lid: contact.lid || undefined,
        };
      })
      .filter(Boolean) as ContactToSync[];
  } catch (error) {
    console.error(`[FULL SYNC] Erro ao buscar contatos WhatsApp:`, error);
    return [];
  }
}

/**
 * Busca contatos das conversas
 */
async function getConversationContacts(connectionId: string): Promise<ContactToSync[]> {
  try {
    const convContacts = await db
      .select({
        contactNumber: conversations.contactNumber,
        contactName: conversations.contactName,
      })
      .from(conversations)
      .where(and(
        eq(conversations.connectionId, connectionId),
        isNotNull(conversations.contactNumber),
        sql`${conversations.contactNumber} NOT LIKE '%@lid%'`,
        sql`${conversations.contactNumber} NOT LIKE '%@g.us%'`
      ))
      .orderBy(desc(conversations.lastMessageTime))
      .limit(CONFIG.MAX_CONTACTS_PER_SYNC);
    
    // Deduplicar
    const uniqueContacts = new Map<string, string>();
    for (const c of convContacts) {
      if (!c.contactNumber) continue;
      const phone = cleanPhoneNumber(c.contactNumber);
      if (phone && phone.length >= 8 && !uniqueContacts.has(phone)) {
        uniqueContacts.set(phone, c.contactName || '');
      }
    }
    
    return Array.from(uniqueContacts.entries()).map(([phone, name]) => ({
      contactId: `${phone}@s.whatsapp.net`,
      phone,
      name,
      source: 'conversation' as const,
    }));
  } catch (error) {
    console.error(`[FULL SYNC] Erro ao buscar contatos de conversas:`, error);
    return [];
  }
}

/**
 * Salva batch de contatos no banco de dados
 * Usa UPSERT para evitar duplicatas
 */
async function saveBatchToDatabase(connectionId: string, batch: ContactToSync[]): Promise<void> {
  if (batch.length === 0) return;
  
  const now = new Date();
  const values = batch.map(c => ({
    connectionId,
    contactId: c.contactId,
    phoneNumber: c.phone ? `${c.phone}@s.whatsapp.net` : null,
    name: c.name || null,
    lid: c.lid || null,
    lastSyncedAt: now,
    updatedAt: now,
  }));
  
  await db
    .insert(whatsappContacts)
    .values(values)
    .onConflictDoUpdate({
      target: [whatsappContacts.connectionId, whatsappContacts.contactId],
      set: {
        name: sql`COALESCE(EXCLUDED.name, ${whatsappContacts.name})`,
        lid: sql`COALESCE(EXCLUDED.lid, ${whatsappContacts.lid})`,
        lastSyncedAt: now,
        updatedAt: now,
      },
    });
}

/**
 * Obtém última sincronização de uma conexão
 */
async function getLastSyncTime(connectionId: string): Promise<Date | null> {
  try {
    const result = await db
      .select({ lastSync: whatsappContacts.lastSyncedAt })
      .from(whatsappContacts)
      .where(eq(whatsappContacts.connectionId, connectionId))
      .orderBy(desc(whatsappContacts.lastSyncedAt))
      .limit(1);
    
    return result[0]?.lastSync || null;
  } catch {
    return null;
  }
}

/**
 * Calcula próximo horário de sync automático
 */
function getNextAutoSyncTime(): Date {
  const now = new Date();
  const next = new Date();
  
  next.setUTCHours(CONFIG.CRON_HOUR_UTC, 0, 0, 0);
  
  // Se já passou da hora hoje, agendar para amanhã
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  
  return next;
}

/**
 * Limpa número de telefone
 */
function cleanPhoneNumber(phone: string): string {
  return phone
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace(/\D/g, '')
    .trim();
}

/**
 * Helper sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export default
export default {
  startFullContactSync,
  getFullSyncStatus,
  scheduleFullSyncForAllClients,
  startDailySyncCron,
  getQueueStats,
};
