/**
 * 📱 SERVIÇO DE SINCRONIZAÇÃO DE CONTATOS EM BACKGROUND
 * 
 * ⚠️ OTIMIZADO PARA ESCALA - Todos os clientes usam este sistema!
 * 
 * OTIMIZAÇÕES:
 * - Máximo 1 sincronização por vez no servidor inteiro
 * - Lotes MUITO pequenos (3 contatos por vez)
 * - Delay GRANDE entre lotes (3 segundos)
 * - Cache em memória para evitar queries repetidas
 * - Limite de 500 contatos por sync (paginar se precisar de mais)
 * 
 * REGRA: Somente contatos que JÁ CONVERSARAM (clientes reais)
 */

import { storage } from "./storage";
import { db } from "./db";
import { whatsappContacts, conversations } from "../shared/schema";
import { eq, and, desc, sql, isNotNull, ne, inArray } from "drizzle-orm";

// ============================================
// CONFIGURAÇÕES DE PERFORMANCE
// ============================================
const CONFIG = {
  BATCH_SIZE: 10,          // Contatos por lote 
  DELAY_BETWEEN_BATCHES: 500,   // 500ms entre lotes
  MAX_CONTACTS_PER_SYNC: 2000,  // Limite de contatos por sync (2k)
  MAX_CONCURRENT_SYNCS: 2,      // 2 syncs por vez no servidor
  CACHE_TTL_MS: 5 * 60 * 1000,  // Cache de 5 minutos
};

// Status de sincronização por userId
interface SyncStatus {
  userId: string;
  connectionId: string;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'error';
  progress: number; // 0-100
  totalContacts: number;
  processedContacts: number;
  lastSyncAt?: Date;
  error?: string;
  queuePosition?: number;
}

// Map de status por usuário
const syncStatusMap = new Map<string, SyncStatus>();

// Fila GLOBAL de sincronização (todos os usuários)
const globalSyncQueue: string[] = [];
let activeSyncs = 0;

// Cache de contagem de contatos (conexãoId:search => contagem + timestamp)
const countCache = new Map<string, { count: number; timestamp: number }>();

// Cache de contatos já no banco (evita queries repetidas)
const contactExistsCache = new Map<string, { exists: boolean; timestamp: number }>();

/**
 * Limpa cache antigo
 */
function cleanOldCache() {
  const now = Date.now();
  for (const [key, value] of contactExistsCache.entries()) {
    if (now - value.timestamp > CONFIG.CACHE_TTL_MS) {
      contactExistsCache.delete(key);
    }
  }
}

function normalizeSyncedContactSearch(search: string) {
  return String(search || "").trim();
}

function normalizeSyncedContactConnectionIds(connectionIds: string | string[]) {
  const rawIds = Array.isArray(connectionIds) ? connectionIds : [connectionIds];
  return Array.from(
    new Set(
      rawIds
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function buildSyncedContactsCacheKey(connectionIds: string | string[], search: string = "") {
  const normalizedIds = normalizeSyncedContactConnectionIds(connectionIds);
  return `${normalizedIds.join(",")}:${normalizeSyncedContactSearch(search)}`;
}

function buildConnectionScopeSql(columnExpression: string, connectionIds: string[]) {
  const column = sql.raw(columnExpression);

  if (connectionIds.length === 1) {
    return sql`${column} = ${connectionIds[0]}`;
  }

  return sql`${column} in (${sql.join(connectionIds.map((id) => sql`${id}`), sql`, `)})`;
}

function extractPhoneFromContactId(contactId: string | null | undefined) {
  const rawValue = String(contactId || "").trim();
  if (!rawValue) {
    return "";
  }

  const atIndex = rawValue.indexOf("@");
  if (atIndex <= 0) {
    return "";
  }

  return rawValue.slice(0, atIndex).trim();
}

/**
 * Obtém o status atual da sincronização
 */
export function getSyncStatus(userId: string): SyncStatus {
  const status = syncStatusMap.get(userId);
  if (status) {
    // Atualizar posição na fila
    const queuePosition = globalSyncQueue.indexOf(userId);
    return {
      ...status,
      queuePosition: queuePosition >= 0 ? queuePosition + 1 : undefined,
    };
  }
  
  return {
    userId,
    connectionId: '',
    status: 'idle',
    progress: 0,
    totalContacts: 0,
    processedContacts: 0,
  };
}

/**
 * Inicia sincronização em background
 * Retorna imediatamente com mensagem para o usuário
 */
export async function startBackgroundSync(userId: string, connectionId: string): Promise<{ 
  message: string; 
  status: 'started' | 'queued' | 'already_running' | 'error' 
}> {
  const currentStatus = syncStatusMap.get(userId);
  
  // Se já está rodando ou na fila, não adiciona novamente
  if (currentStatus?.status === 'running') {
    return { 
      message: '⏳ Sincronização já está em andamento. Aguarde até 10 minutos.',
      status: 'already_running'
    };
  }
  
  if (currentStatus?.status === 'queued') {
    const position = globalSyncQueue.indexOf(userId) + 1;
    return { 
      message: `⏳ Você está na posição ${position} da fila. Aguarde sua vez.`,
      status: 'queued'
    };
  }
  
  // Verificar se já tem contatos sincronizados recentemente
  const hasSynced = await hasSyncedBefore(connectionId);
  if (hasSynced) {
    // Verificar quando foi a última sync
    const recentContacts = await db
      .select({ lastSync: whatsappContacts.lastSyncedAt })
      .from(whatsappContacts)
      .where(eq(whatsappContacts.connectionId, connectionId))
      .orderBy(desc(whatsappContacts.lastSyncedAt))
      .limit(1);
    
    if (recentContacts[0]?.lastSync) {
      const hoursSinceSync = (Date.now() - recentContacts[0].lastSync.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync < 1) {
        return {
          message: '✅ Contatos já estão atualizados! Última sincronização há menos de 1 hora.',
          status: 'already_running'
        };
      }
    }
  }
  
  // Adiciona à fila
  if (!globalSyncQueue.includes(userId)) {
    globalSyncQueue.push(userId);
  }
  
  const position = globalSyncQueue.indexOf(userId) + 1;
  
  // Inicializa status como "na fila"
  syncStatusMap.set(userId, {
    userId,
    connectionId,
    status: 'queued',
    progress: 0,
    totalContacts: 0,
    processedContacts: 0,
    queuePosition: position,
  });
  
  // Inicia processamento da fila se não estiver no limite
  processGlobalQueue();
  
  if (position === 1 && activeSyncs < CONFIG.MAX_CONCURRENT_SYNCS) {
    return {
      message: '✅ Sincronização iniciada! Os contatos aparecerão em até 10 minutos.',
      status: 'started'
    };
  }
  
  return {
    message: `⏳ Você está na posição ${position} da fila. Aguarde sua vez (estimativa: ${position * 5} minutos).`,
    status: 'queued'
  };
}

/**
 * Processa a fila GLOBAL de sincronização
 * Apenas 1 sync por vez para não sobrecarregar
 */
async function processGlobalQueue() {
  // Se já tem sync ativa, não inicia outra
  if (activeSyncs >= CONFIG.MAX_CONCURRENT_SYNCS || globalSyncQueue.length === 0) {
    return;
  }
  
  // Pega o próximo da fila
  const userId = globalSyncQueue[0];
  const status = syncStatusMap.get(userId);
  
  if (!status || status.status !== 'queued') {
    globalSyncQueue.shift();
    processGlobalQueue();
    return;
  }
  
  // Marca como rodando
  activeSyncs++;
  syncStatusMap.set(userId, { ...status, status: 'running' });
  globalSyncQueue.shift();
  
  // Atualiza posições na fila para os outros
  globalSyncQueue.forEach((uid, index) => {
    const s = syncStatusMap.get(uid);
    if (s) {
      syncStatusMap.set(uid, { ...s, queuePosition: index + 1 });
    }
  });
  
  try {
    await syncContactsForUser(userId, status.connectionId);
  } catch (error) {
    console.error(`[SYNC ERROR] Falha ao sincronizar para ${userId}:`, error);
    syncStatusMap.set(userId, {
      ...status,
      status: 'error',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  } finally {
    activeSyncs--;
    // Processa próximo da fila
    setTimeout(() => processGlobalQueue(), 1000);
  }
}

/**
 * Sincroniza contatos de um usuário em lotes MUITO pequenos
 * REGRA: Somente contatos que já conversaram (têm conversas)
 */
async function syncContactsForUser(userId: string, connectionId: string) {
  console.log(`[SYNC] 🚀 Iniciando sincronização para user ${userId}`);
  
  const status = syncStatusMap.get(userId)!;
  
  // Limpar cache antigo
  cleanOldCache();
  
  try {
    // 1. Buscar conversas em lote limitado (não buscar tudo de uma vez!)
    const allConversations = await db
      .select({
        contactNumber: conversations.contactNumber,
        contactName: conversations.contactName,
      })
      .from(conversations)
      .where(and(
        eq(conversations.connectionId, connectionId),
        isNotNull(conversations.contactNumber),
        sql`${conversations.contactNumber} NOT LIKE '%@lid%'`,
        sql`${conversations.contactNumber} NOT LIKE '%@g.us%'`  // Ignorar grupos
      ))
      .orderBy(desc(conversations.lastMessageTime))
      .limit(CONFIG.MAX_CONTACTS_PER_SYNC);  // LIMITA!
    
    console.log(`[SYNC] Encontradas ${allConversations.length} conversas (limite: ${CONFIG.MAX_CONTACTS_PER_SYNC})`);
    
    if (allConversations.length === 0) {
      syncStatusMap.set(userId, {
        ...status,
        status: 'completed',
        progress: 100,
        totalContacts: 0,
        processedContacts: 0,
        lastSyncAt: new Date(),
      });
      return;
    }
    
    // Extrair contatos únicos
    const uniqueContacts = new Map<string, string>();
    for (const conv of allConversations) {
      if (!conv.contactNumber) continue;
      
      const phone = conv.contactNumber
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .trim();
      
      if (!phone || phone.includes('@') || phone.length < 8) continue;
      
      if (!uniqueContacts.has(phone)) {
        uniqueContacts.set(phone, conv.contactName || '');
      }
    }
    
    const contactsArray = Array.from(uniqueContacts.entries()).map(([phone, name]) => ({ phone, name }));
    console.log(`[SYNC] ${contactsArray.length} contatos únicos para processar`);
    
    // Atualizar total
    status.totalContacts = contactsArray.length;
    syncStatusMap.set(userId, { ...status });
    
    // 2. Processar em lotes MUITO pequenos com delay GRANDE
    for (let i = 0; i < contactsArray.length; i += CONFIG.BATCH_SIZE) {
      const batch = contactsArray.slice(i, i + CONFIG.BATCH_SIZE);
      
      // Processar cada contato do lote
      for (const contact of batch) {
        const cacheKey = `${connectionId}:${contact.phone}`;
        const cached = contactExistsCache.get(cacheKey);
        
        // Se está no cache e existe, pula
        if (cached && cached.exists && Date.now() - cached.timestamp < CONFIG.CACHE_TTL_MS) {
          continue;
        }
        
        try {
          // Verificar se já existe (query leve)
          const existing = await db
            .select({ id: whatsappContacts.id })
            .from(whatsappContacts)
            .where(and(
              eq(whatsappContacts.connectionId, connectionId),
              eq(whatsappContacts.phoneNumber, contact.phone)
            ))
            .limit(1);
          
          if (existing.length === 0) {
            await storage.upsertContact({
              connectionId,
              contactId: `${contact.phone}@s.whatsapp.net`,
              phoneNumber: contact.phone,
              name: contact.name || null,
              imgUrl: null,
              lid: null,
            });
            contactExistsCache.set(cacheKey, { exists: true, timestamp: Date.now() });
          } else {
            // Já existe - cachear
            contactExistsCache.set(cacheKey, { exists: true, timestamp: Date.now() });
          }
        } catch (err) {
          // Ignora erros individuais, continua
          console.error(`[SYNC] Erro ao processar ${contact.phone}:`, err);
        }
      }
      
      // Atualizar progresso
      status.processedContacts = Math.min(i + CONFIG.BATCH_SIZE, contactsArray.length);
      status.progress = Math.round((status.processedContacts / contactsArray.length) * 100);
      syncStatusMap.set(userId, { ...status });
      
      // Log a cada 20%
      if (status.progress % 20 === 0) {
        console.log(`[SYNC] Progresso: ${status.progress}%`);
      }
      
      // Delay GRANDE entre lotes para não sobrecarregar Supabase
      if (i + CONFIG.BATCH_SIZE < contactsArray.length) {
        await sleep(CONFIG.DELAY_BETWEEN_BATCHES);
      }
    }
    
    // 3. Marcar como concluído
    syncStatusMap.set(userId, {
      ...status,
      status: 'completed',
      progress: 100,
      processedContacts: contactsArray.length,
      lastSyncAt: new Date(),
    });
    
    console.log(`[SYNC] ✅ Concluído! ${contactsArray.length} contatos.`);
    
  } catch (error) {
    console.error(`[SYNC] ❌ Erro:`, error);
    syncStatusMap.set(userId, {
      ...status,
      status: 'error',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
}

/**
 * Busca contatos sincronizados do banco de dados com paginação e busca
 * RÁPIDO: Direto do banco, sem processar nada
 * 
 * FIX 2025: Agora busca TODOS os contatos e extrai número do contact_id
 * quando phone_number não está preenchido (ex: "553199999999@s.whatsapp.net")
 */
export async function getSyncedContactsFromDB(
  connectionIdsOrId: string | string[],
  page: number = 1,
  limit: number = 50,
  search: string = ""
): Promise<{
  contacts: Array<{
    id: string;
    name: string;
    phone: string;
    pushName?: string;
    hasResponded: boolean;
    conversationCount?: number;
    isGroup: boolean;
    lastSeen?: Date;
  }>;
  total: number;
  page: number;
  totalPages: number;
}> {
  try {
    const connectionIds = normalizeSyncedContactConnectionIds(connectionIdsOrId);
    if (connectionIds.length === 0) {
      return { contacts: [], total: 0, page, totalPages: 0 };
    }

    const effectiveLimit = Math.min(limit, 50);
    const offset = (page - 1) * effectiveLimit;
    const normalizedSearch = normalizeSyncedContactSearch(search);
    const searchTerm = normalizedSearch ? `%${normalizedSearch}%` : "";
    const searchClause = normalizedSearch
      ? sql`and (
          coalesce(name, '') ilike ${searchTerm}
          or coalesce(phone_number, '') like ${searchTerm}
          or contact_id like ${searchTerm}
        )`
      : sql``;
    
    // Construir condição base de filtro

    // Obter contagem do cache ou executar query
    const cacheKey = buildSyncedContactsCacheKey(connectionIds, normalizedSearch);
    let total = 0;
    const connectionFilter = buildConnectionScopeSql("wc.connection_id", connectionIds);
    
    const cached = countCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_TTL_MS) {
      total = cached.count;
    } else {
      const countResult = await db.execute(sql`
        with filtered as (
          select
            case
              when coalesce(phone_number, '') like '%@%' then split_part(phone_number, '@', 1)
              else coalesce(nullif(phone_number, ''), split_part(contact_id, '@', 1))
            end as person_key
          from whatsapp_contacts wc
          where ${connectionFilter}
            and contact_id not like '%@g.us%'
            and (contact_id like '%@s.whatsapp.net' or contact_id like '%@c.us')
            and not exists (
              select 1
              from whatsapp_contacts lid_wc
              where lid_wc.connection_id = wc.connection_id
                and split_part(lid_wc.contact_id, '@', 1) = split_part(wc.contact_id, '@', 1)
                and lid_wc.contact_id like '%@lid'
                and coalesce(wc.phone_number, '') not like '%@s.whatsapp.net'
                and coalesce(wc.phone_number, '') not like '%@c.us'
            )
            ${searchClause}
        )
        select count(*)::int as count
        from (
          select distinct person_key
          from filtered
          where coalesce(person_key, '') <> ''
        ) unique_people
      `);

      total = Number(countResult.rows?.[0]?.count ?? 0);

      countCache.set(cacheKey, { count: total, timestamp: Date.now() });
    }
    
    // Query otimizada - busca contatos com paginação
    const contactsResult = await db.execute(sql`
      with filtered as (
        select
          id,
          connection_id,
          contact_id,
          phone_number,
          name,
          last_synced_at,
          case
            when coalesce(phone_number, '') like '%@%' then split_part(phone_number, '@', 1)
            else coalesce(nullif(phone_number, ''), split_part(contact_id, '@', 1))
          end as person_key
        from whatsapp_contacts wc
        where ${connectionFilter}
          and contact_id not like '%@g.us%'
          and (contact_id like '%@s.whatsapp.net' or contact_id like '%@c.us')
          and not exists (
            select 1
            from whatsapp_contacts lid_wc
            where lid_wc.connection_id = wc.connection_id
              and split_part(lid_wc.contact_id, '@', 1) = split_part(wc.contact_id, '@', 1)
              and lid_wc.contact_id like '%@lid'
              and coalesce(wc.phone_number, '') not like '%@s.whatsapp.net'
              and coalesce(wc.phone_number, '') not like '%@c.us'
          )
          ${searchClause}
      ),
      deduped as (
        select distinct on (person_key)
          id,
          contact_id,
          phone_number,
          name,
          last_synced_at,
          person_key
        from filtered
        where coalesce(person_key, '') <> ''
        order by person_key, last_synced_at desc nulls last, id desc
      )
      select
        id,
        contact_id,
        phone_number,
        name,
        last_synced_at,
        person_key
      from deduped
      order by last_synced_at desc nulls last, id desc
      limit ${effectiveLimit}
      offset ${offset}
    `);
    
    // Extrair número do contact_id quando phone_number é nulo
    const contacts = (contactsResult.rows || []).map((row: any) => {
      // Tentar usar phoneNumber, se não tiver, extrair do contactId
      const phone =
        String(row.person_key || "").trim() ||
        String(row.phone_number || "").trim() ||
        extractPhoneFromContactId(row.contact_id);
      
        // Extrair número do formato "553199999999@s.whatsapp.net" ou "553199999999@c.us"

      // Pular contatos sem número válido
      if (!phone || phone.length < 8) {
        return null;
      }
      
      return {
        id: String(row.id),
        name: String(row.name || ''),
        phone,
        pushName: row.name ? String(row.name) : undefined,
        hasResponded: true,
        conversationCount: 1,
        isGroup: false,
        lastSeen: row.last_synced_at ? new Date(row.last_synced_at) : undefined,
      };
    }).filter(Boolean) as Array<{
      id: string;
      name: string;
      phone: string;
      pushName?: string;
      hasResponded: boolean;
      conversationCount?: number;
      isGroup: boolean;
      lastSeen?: Date;
    }>;
    
    const totalPages = Math.ceil(total / effectiveLimit);
    
    console.log(
      `[SYNC] Página ${page}/${totalPages}: Retornando ${contacts.length} contatos ` +
      `(search: "${normalizedSearch}", total: ${total})`
    );
    
    return { contacts, total, page, totalPages };
    
  } catch (error) {
    console.error('[SYNC] Erro ao buscar contatos:', error);
    return { contacts: [], total: 0, page: 1, totalPages: 0 };
  }
}

/**
 * Retorna a contagem de contatos sincronizados
 * Usa cache com TTL para não sobrecarregar o banco
 */
export async function getSyncedContactsCount(connectionIdsOrId: string | string[]): Promise<{ total: number }> {
  try {
    const connectionIds = normalizeSyncedContactConnectionIds(connectionIdsOrId);
    if (connectionIds.length === 0) {
      return { total: 0 };
    }

    const cacheKey = buildSyncedContactsCacheKey(connectionIds);
    
    const cached = countCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONFIG.CACHE_TTL_MS) {
      return { total: cached.count };
    }
    
    const countResult = await db.execute(sql`
      with filtered as (
        select
          case
            when coalesce(phone_number, '') like '%@%' then split_part(phone_number, '@', 1)
            else coalesce(nullif(phone_number, ''), split_part(contact_id, '@', 1))
          end as person_key
        from whatsapp_contacts wc
        where ${buildConnectionScopeSql("wc.connection_id", connectionIds)}
          and contact_id not like '%@g.us%'
          and (contact_id like '%@s.whatsapp.net' or contact_id like '%@c.us')
          and not exists (
            select 1
            from whatsapp_contacts lid_wc
            where lid_wc.connection_id = wc.connection_id
              and split_part(lid_wc.contact_id, '@', 1) = split_part(wc.contact_id, '@', 1)
              and lid_wc.contact_id like '%@lid'
              and coalesce(wc.phone_number, '') not like '%@s.whatsapp.net'
              and coalesce(wc.phone_number, '') not like '%@c.us'
          )
      )
      select count(*)::int as count
      from (
        select distinct person_key
        from filtered
        where coalesce(person_key, '') <> ''
      ) unique_people
    `);

    const total = Number(countResult.rows?.[0]?.count ?? 0);
    
    // Salvar no cache
    countCache.set(cacheKey, { count: total, timestamp: Date.now() });
    
    console.log(`[SYNC] Contagem total para ${connectionIds.join(",")}: ${total} contatos`);
    
    return { total };
  } catch (error) {
    console.error('[SYNC] Erro ao contar contatos:', error);
    return { total: 0 };
  }
}

/**
 * Verifica se a sincronização inicial já foi feita
 */
export async function hasSyncedBefore(connectionIdsOrId: string | string[]): Promise<boolean> {
  try {
    const connectionIds = normalizeSyncedContactConnectionIds(connectionIdsOrId);
    if (connectionIds.length === 0) {
      return false;
    }

    const result = await db
      .select({ id: whatsappContacts.id })
      .from(whatsappContacts)
      .where(
        connectionIds.length === 1
          ? eq(whatsappContacts.connectionId, connectionIds[0])
          : inArray(whatsappContacts.connectionId, connectionIds),
      )
      .limit(1);
    
    return result.length > 0;
  } catch {
    return false;
  }
}

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  getSyncStatus,
  startBackgroundSync,
  getSyncedContactsFromDB,
  getSyncedContactsCount,
  hasSyncedBefore,
};
