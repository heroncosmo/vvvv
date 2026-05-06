/**
 * 📁 STORE DE MÍDIAS DO ADMIN AGENT
 * Gerencia as mídias disponíveis para o agente admin usar nas respostas
 * IMPORTANTE: As mídias agora são persistidas no banco de dados Supabase
 */

import { storage } from "./storage";
import { getAgentMediaLibrary } from "./mediaService";

export interface AdminMedia {
  id: string;
  adminId: string;
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
  displayOrder: number;
  createdAt: string;
}

// Cache em memória para performance (recarregado do banco)
const adminMediaCache: Map<string, AdminMedia> = new Map();
const lastCacheUpdate: Map<string, number> = new Map();
const CACHE_TTL = 60000; // 1 minuto
const BASE_MEDIA_SOURCE_EMAIL = "rodrigo4@gmail.com";
let baseAdminMediaCache: AdminMedia[] = [];
let lastBaseMediaUpdate = 0;

function mapBaseMediaToAdminMedia(baseUserId: string, media: any): AdminMedia {
  return {
    id: `base:${media.id}`,
    adminId: baseUserId,
    name: media.name,
    mediaType: media.mediaType as "audio" | "image" | "video" | "document",
    storageUrl: media.storageUrl,
    fileName: media.fileName || undefined,
    fileSize: media.fileSize || undefined,
    mimeType: media.mimeType || undefined,
    durationSeconds: media.durationSeconds || undefined,
    description: media.description || "",
    whenToUse: media.whenToUse || undefined,
    caption: media.caption || undefined,
    transcription: media.transcription || undefined,
    isActive: media.isActive !== false,
    sendAlone: media.sendAlone === true,
    displayOrder: media.displayOrder || 0,
    createdAt: media.createdAt?.toISOString?.() || new Date().toISOString(),
  };
}

async function getBaseAdminMedia(): Promise<AdminMedia[]> {
  const now = Date.now();
  if (lastBaseMediaUpdate > 0 && now - lastBaseMediaUpdate < CACHE_TTL) {
    return baseAdminMediaCache;
  }

  try {
    const baseUser = await storage.getUserByEmail(BASE_MEDIA_SOURCE_EMAIL);
    if (!baseUser?.id) {
      baseAdminMediaCache = [];
      lastBaseMediaUpdate = now;
      return baseAdminMediaCache;
    }

    const baseMedia = await getAgentMediaLibrary(baseUser.id);
    baseAdminMediaCache = baseMedia
      .filter((media) => media.isActive !== false)
      .map((media) => mapBaseMediaToAdminMedia(baseUser.id, media));
    lastBaseMediaUpdate = now;
  } catch (error) {
    console.error("📁 [AdminMediaStore] Erro ao carregar base de mídias do Rodrigo 4:", error);
    baseAdminMediaCache = [];
    lastBaseMediaUpdate = now;
  }

  return baseAdminMediaCache;
}

function mergeAdminMediaWithBase(primaryMedia: AdminMedia[], baseMedia: AdminMedia[]): AdminMedia[] {
  const merged = new Map<string, AdminMedia>();

  for (const media of baseMedia) {
    const key = media.name.toUpperCase();
    if (!merged.has(key)) {
      merged.set(key, media);
    }
  }

  for (const media of primaryMedia) {
    const key = media.name.toUpperCase();
    merged.set(key, media);
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return b.displayOrder - a.displayOrder;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Recarrega o cache do banco de dados
 */
async function reloadCache(adminId?: string): Promise<void> {
  const now = Date.now();
  const cacheKey = adminId || 'default';
  const lastUpdate = lastCacheUpdate.get(cacheKey) || 0;
  
  // Se cache ainda é válido, não recarregar
  if (now - lastUpdate < CACHE_TTL && adminMediaCache.size > 0) {
    return;
  }

  try {
    // Sistema single-admin: busca todas as mídias ativas
    const mediaList = await storage.getActiveAdminMedia();
    
    for (const media of mediaList) {
      adminMediaCache.set(media.id!, {
        id: media.id!,
        adminId: media.adminId,
        name: media.name,
        mediaType: media.mediaType as "audio" | "image" | "video" | "document",
        storageUrl: media.storageUrl,
        fileName: media.fileName || undefined,
        fileSize: media.fileSize || undefined,
        mimeType: media.mimeType || undefined,
        durationSeconds: media.durationSeconds || undefined,
        description: media.description,
        whenToUse: media.whenToUse || undefined,
        caption: media.caption || undefined,
        transcription: media.transcription || undefined,
        isActive: media.isActive,
        sendAlone: media.sendAlone,
        displayOrder: media.displayOrder,
        createdAt: media.createdAt?.toISOString() || new Date().toISOString(),
      });
    }
    
    lastCacheUpdate.set(cacheKey, now);
    console.log(`📁 [AdminMediaStore] Cache recarregado: ${mediaList.length} mídias`);
  } catch (error) {
    console.error("📁 [AdminMediaStore] Erro ao recarregar cache:", error);
  }
}

/**
 * Obtém todas as mídias ativas do admin (com cache)
 * @param adminId - ID do admin (opcional para sistema single-admin)
 */
export async function getAdminMediaList(adminId?: string): Promise<AdminMedia[]> {
  await reloadCache(adminId);
  const directMedia = Array.from(adminMediaCache.values()).filter(m => m.isActive);
  const baseMedia = await getBaseAdminMedia();
  return mergeAdminMediaWithBase(directMedia, baseMedia);
}

/**
 * Obtém uma mídia por nome (com cache)
 * @param adminId - ID do admin (opcional para sistema single-admin)
 * @param name - Nome da mídia
 */
export let getAdminMediaByName = async function(adminId: string | undefined, name: string): Promise<AdminMedia | undefined> {
  const normalizedName = name.toUpperCase().replace(/\s+/g, '_');
  const values = await getAdminMediaList(adminId);
  
  for (const media of values) {
    if (media.name.toUpperCase() === normalizedName && media.isActive) {
      return media;
    }
  }
  return undefined;
}

/**
 * Obtém mídias que correspondem a um padrão de nome
 */
export async function getAdminMediasByPattern(adminId: string | undefined, pattern: string): Promise<AdminMedia[]> {
  await reloadCache(adminId);
  
  const normalizedPattern = pattern.toUpperCase().replace(/\s+/g, '_');
  const results: AdminMedia[] = [];
  const values = Array.from(adminMediaCache.values());
  
  for (const media of values) {
    if (media.adminId === adminId && media.isActive && media.name.toUpperCase().includes(normalizedPattern)) {
      results.push(media);
    }
  }
  return results;
}

/**
 * Adiciona uma mídia ao store e banco de dados
 */
export async function addAdminMedia(media: Omit<AdminMedia, 'id' | 'createdAt'>): Promise<AdminMedia> {
  const saved = await storage.createAdminMedia(media);
  
  const adminMedia: AdminMedia = {
    id: saved.id!,
    adminId: saved.adminId,
    name: saved.name,
    mediaType: saved.mediaType as "audio" | "image" | "video" | "document",
    storageUrl: saved.storageUrl,
    fileName: saved.fileName || undefined,
    fileSize: saved.fileSize || undefined,
    mimeType: saved.mimeType || undefined,
    durationSeconds: saved.durationSeconds || undefined,
    description: saved.description,
    whenToUse: saved.whenToUse || undefined,
    caption: saved.caption || undefined,
    transcription: saved.transcription || undefined,
    isActive: saved.isActive,
    sendAlone: saved.sendAlone,
    displayOrder: saved.displayOrder,
    createdAt: saved.createdAt?.toISOString() || new Date().toISOString(),
  };
  
  adminMediaCache.set(saved.id!, adminMedia);
  lastCacheUpdate.set(media.adminId, Date.now());
  console.log(`📁 [AdminMediaStore] Mídia adicionada ao banco: ${media.name} (${media.mediaType})`);
  return adminMedia;
}

/**
 * Atualiza uma mídia existente no banco e cache
 */
export async function updateAdminMedia(id: string, updates: Partial<AdminMedia>): Promise<AdminMedia | null> {
  const saved = await storage.updateAdminMedia(id, updates);
  
  if (!saved) return null;
  
  const adminMedia: AdminMedia = {
    id: saved.id!,
    adminId: saved.adminId,
    name: saved.name,
    mediaType: saved.mediaType as "audio" | "image" | "video" | "document",
    storageUrl: saved.storageUrl,
    fileName: saved.fileName || undefined,
    fileSize: saved.fileSize || undefined,
    mimeType: saved.mimeType || undefined,
    durationSeconds: saved.durationSeconds || undefined,
    description: saved.description,
    whenToUse: saved.whenToUse || undefined,
    caption: saved.caption || undefined,
    transcription: saved.transcription || undefined,
    isActive: saved.isActive,
    sendAlone: saved.sendAlone,
    displayOrder: saved.displayOrder,
    createdAt: saved.createdAt?.toISOString() || new Date().toISOString(),
  };
  
  adminMediaCache.set(id, adminMedia);
  if (saved.adminId) {
    lastCacheUpdate.set(saved.adminId, Date.now());
  }
  return adminMedia;
}

/**
 * Remove uma mídia do store e banco de dados
 */
export async function deleteAdminMedia(id: string, adminId: string): Promise<boolean> {
  const success = await storage.deleteAdminMedia(id);
  if (success) {
    adminMediaCache.delete(id);
    lastCacheUpdate.set(adminId, Date.now());
  }
  return success;
}

/**
 * Verifica se mídia existe (busca em cache primeiro, depois banco)
 */
export async function hasAdminMedia(id: string, adminId: string): Promise<boolean> {
  if (adminMediaCache.has(id)) return true;
  
  const media = await storage.getAdminMediaById(id);
  if (media) {
    const adminMedia: AdminMedia = {
      id: media.id!,
      adminId: media.adminId,
      name: media.name,
      mediaType: media.mediaType as "audio" | "image" | "video" | "document",
      storageUrl: media.storageUrl,
      fileName: media.fileName || undefined,
      fileSize: media.fileSize || undefined,
      mimeType: media.mimeType || undefined,
      durationSeconds: media.durationSeconds || undefined,
      description: media.description,
      whenToUse: media.whenToUse || undefined,
      caption: media.caption || undefined,
      transcription: media.transcription || undefined,
      isActive: media.isActive,
      sendAlone: media.sendAlone,
      displayOrder: media.displayOrder,
      createdAt: media.createdAt?.toISOString() || new Date().toISOString(),
    };
    adminMediaCache.set(id, adminMedia);
    return true;
  }
  return false;
}

/**
 * Obtém mídia por ID (busca em cache primeiro, depois banco)
 */
export async function getAdminMediaById(id: string): Promise<AdminMedia | undefined> {
  if (adminMediaCache.has(id)) {
    return adminMediaCache.get(id);
  }
  
  const media = await storage.getAdminMediaById(id);
  if (!media) return undefined;
  
  const adminMedia: AdminMedia = {
    id: media.id!,
    adminId: media.adminId,
    name: media.name,
    mediaType: media.mediaType as "audio" | "image" | "video" | "document",
    storageUrl: media.storageUrl,
    fileName: media.fileName || undefined,
    fileSize: media.fileSize || undefined,
    mimeType: media.mimeType || undefined,
    durationSeconds: media.durationSeconds || undefined,
    description: media.description,
    whenToUse: media.whenToUse || undefined,
    caption: media.caption || undefined,
    transcription: media.transcription || undefined,
    isActive: media.isActive,
    sendAlone: media.sendAlone,
    displayOrder: media.displayOrder,
    createdAt: media.createdAt?.toISOString() || new Date().toISOString(),
  };
  
  adminMediaCache.set(id, adminMedia);
  return adminMedia;
}

/**
 * Retorna o tamanho do store (conta mídias no cache)
 */
export function getAdminMediaCount(): number {
  return adminMediaCache.size;
}

/**
 * Força recarga do cache para um admin específico
 */
export async function forceReloadCache(adminId: string): Promise<void> {
  lastCacheUpdate.delete(adminId);
  lastBaseMediaUpdate = 0;
  await reloadCache(adminId);
}

// Definição dos gatilhos padrão (Exportado para uso no fallback)
export const defaultTriggers = [
  { keywords: ["como funciona", "funciona assim", "deixa eu explicar", "vou te explicar", "te explico", "vale a pena"], mediaName: "COMO_FUNCIONA" },
  { keywords: ["vídeo", "demonstra", "ver na prática", "te mostro"], mediaName: "VIDEO_DEMONSTRACAO" },
  { keywords: ["preço", "quanto custa", "valor", "investimento", "tabela"], mediaName: "TABELA_PRECOS" },
  { keywords: ["contrato", "termos", "documento"], mediaName: "PDF_CONTRATO" }
];

/**
 * Obtém os gatilhos ativos baseados nas mídias disponíveis
 */
export async function getActiveTriggers(adminId?: string) {
  const mediaList = await getAdminMediaList(adminId);
  const allMediaNames = mediaList.map(m => m.name);
  return defaultTriggers.filter(t => allMediaNames.includes(t.mediaName));
}

/**
 * Gera gatilhos inteligentes baseados no campo "whenToUse" das mídias
 * Isso permite que mídias personalizadas (como VALE_A_PENA) funcionem automaticamente
 */
export async function getSmartTriggers(adminId?: string) {
  const mediaList = await getAdminMediaList(adminId);
  const triggers: { keywords: string[], mediaName: string }[] = [];

  // 1. Gerar gatilhos dinâmicos do "whenToUse" (MAIOR PRIORIDADE - ESPECÍFICOS)
  for (const media of mediaList) {
    if (media.whenToUse && media.whenToUse.length > 3) {
      // Palavras comuns de início de frase de instrução que devem ser removidas DO INÍCIO
      const instructionStartWords = [
        'quando', 'se', 'caso', 'ao', 'para', 'em', 'nos', 'nas', 'no', 'na', 
        'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
        'cliente', 'usuario', 'pessoa', 'lead',
        'perguntar', 'falar', 'disser', 'solicitar', 'questionar', 'pedir', 'quiser',
        'sobre', 'que', 'como', 'informar', 'ver', 'saber', 'onde'
      ];
      
      // Separar por vírgulas, pontos ou ponto e vírgula para pegar frases isoladas
      // Ex: "Quando pedir X, Y ou Z" -> ["Quando pedir X", " Y ou Z"] - não é perfeito, melhor separar por "," explícita
      const rawPhrases = media.whenToUse.toLowerCase().split(/[,;.]+/);

      for (let rawPhrase of rawPhrases) {
        // Limpeza básica inicial
        let cleanPhrase = rawPhrase.trim();

        if (cleanPhrase.length < 2) continue;

        // Remover palavras de instrução do INÍCIO da frase repetidamente
        // Ex: "quando o cliente perguntar sobre envio" -> "envio"
        let changed = true;
        while (changed && cleanPhrase.length > 0) {
          changed = false;
          const firstWord = cleanPhrase.split(' ')[0];
          if (instructionStartWords.includes(firstWord)) {
             cleanPhrase = cleanPhrase.substring(firstWord.length).trim();
             changed = true;
          }
        }

        // Limpar pontuação restante, mas manter estrutura interna
        cleanPhrase = cleanPhrase.replace(/[^\w\sà-úÀ-Ú\-]/g, "").trim();

        // Se sobrou uma frase válida
        if (cleanPhrase.length > 2) {
             const existing = triggers.find(t => t.mediaName === media.name);
             if (existing) {
               if (!existing.keywords.includes(cleanPhrase)) {
                 existing.keywords.push(cleanPhrase);
               }
             } else {
               triggers.push({
                 keywords: [cleanPhrase], 
                 mediaName: media.name
               });
             }
        }
      }
      
      // Adicionar também o texto completo original (limpo de preposições iniciais) como fallback
      let fullText = media.whenToUse.toLowerCase().trim();
      let changed = true;
      while (changed && fullText.length > 0) {
          changed = false;
          const firstWord = fullText.split(' ')[0];
          if (instructionStartWords.includes(firstWord)) {
             fullText = fullText.substring(firstWord.length).trim();
             changed = true;
          }
      }
      if (fullText.length > 5) {
         const existing = triggers.find(t => t.mediaName === media.name);
         if (existing && !existing.keywords.includes(fullText)) {
             existing.keywords.push(fullText);
         }
      }

    }
  }

  // DEBUG TRIGGERS
  console.log('🔍 [AdminMediaStore] DYNAMIC TRIGGERS GENERATED:', 
        triggers.map(t => `${t.mediaName}: [${t.keywords.join(', ')}]`).join(' | ')
  );

  // 2. Adicionar gatilhos padrão (MENOR PRIORIDADE - GENÉRICOS)
  const activeDefaultTriggers = await getActiveTriggers(adminId);
  for (const dt of activeDefaultTriggers) {
      const existing = triggers.find(t => t.mediaName === dt.mediaName);
      if (existing) {
          existing.keywords.push(...dt.keywords);
      } else {
          triggers.push(dt);
      }
  }
  
  return triggers;
}

/**
 * Gera o bloco de prompt para as mídias do admin
 * COPIADO DO mediaService.ts QUE FUNCIONA CORRETAMENTE
 */
export let generateAdminMediaPromptBlock = async function(adminId?: string): Promise<string> {
  const mediaList = await getAdminMediaList(adminId);
  
  if (mediaList.length === 0) {
    return '';
  }

  // Filtrar gatilhos para mídias que realmente existem (Smart Triggers inclui todos)
  const activeTriggers = await getSmartTriggers(adminId);

  let mediaBlock = `
═══════════════════════════════════════════════════════════════════════════════
📁 MÍDIAS DISPONÍVEIS E REGRAS DE ENVIO
═══════════════════════════════════════════════════════════════════════════════
`;

  if (activeTriggers.length > 0) {
    mediaBlock += `
🚨 GATILHOS OBRIGATÓRIOS (Se falar isso, TEM que enviar a mídia):
`;
    for (const trigger of activeTriggers) {
      mediaBlock += `• Se falar "${trigger.keywords[0]}" ou similar → Use [ENVIAR_MIDIA:${trigger.mediaName}]\n`;
    }
  }

  mediaBlock += `
📋 LISTA COMPLETA DE MÍDIAS (Use quando o contexto pedir):
`;

  for (const media of mediaList) {
    const tipo = media.mediaType === 'audio' ? '🎤 ÁUDIO' :
                 media.mediaType === 'video' ? '🎥 VÍDEO' :
                 media.mediaType === 'image' ? '🖼️ IMAGEM' : '📄 DOC';
    
    mediaBlock += `
${tipo}: ${media.name}
   📝 Descrição: ${media.description || 'Sem descrição'}
   🎯 Quando usar: ${media.whenToUse || 'Quando relevante'}
   👉 Tag para enviar: [ENVIAR_MIDIA:${media.name}]
`;
  }

  mediaBlock += `
⚠️ REGRAS DE ENVIO DE MÍDIA (SIGA RIGOROSAMENTE):
1. LEIA o campo "Quando usar" de CADA mídia ANTES de decidir enviar.
2. SÓ envie a mídia se a mensagem do cliente bater EXATAMENTE com a situação descrita em "Quando usar".
3. Se "Quando usar" diz "NÃO ENVIAR" em determinada situação, OBEDEÇA e não envie.
4. NUNCA envie mídia "do nada" ou por conta própria. Só envie se o cliente falou algo que ativa o gatilho.
5. Máximo 1 mídia por resposta. Não envie 2 ou mais mídias de uma vez.
6. Se já enviou aquela mídia antes nesta conversa, NÃO envie de novo.
7. Na dúvida, NÃO envie. É melhor não enviar do que enviar fora de contexto.
`;

  return mediaBlock;
}

/**
 * Parseia a resposta e extrai tags de mídia
 */
export let parseAdminMediaTags = function(responseText: string): {
  cleanText: string;
  mediaActions: { type: 'send_media'; media_name: string }[];
} {
  const normalizeAdminMediaName = (value: string) =>
    value.trim().replace(/\s+/g, "_").toUpperCase();
  const mediaTagRegex = /\[ENVIAR_MIDIA:\s*([^\]\r\n]+?)\s*\]/giu;
  const mediaTagCleanupRegex = /\[ENVIAR_MIDIA:\s*([^\]\r\n]+?)\s*\]/giu;
  const mediaActions: { type: 'send_media'; media_name: string }[] = [];
  
  let match: RegExpExecArray | null;
  while ((match = mediaTagRegex.exec(responseText)) !== null) {
    const mediaName = normalizeAdminMediaName(match[1]);
    if (!mediaName) continue;
    mediaActions.push({
      type: 'send_media',
      media_name: mediaName,
    });
    console.log(`📁 [AdminMediaStore] Tag de mídia detectada: ${mediaName}`);
  }
  
  // Remover as tags do texto final (usando a mesma regex permissiva)
  const cleanText = responseText.replace(mediaTagCleanupRegex, '').trim();
  
  return { cleanText, mediaActions };
}

export function setMockAdminMediaStore(mocks: any) {
  if (mocks.generateAdminMediaPromptBlock) generateAdminMediaPromptBlock = mocks.generateAdminMediaPromptBlock;
  if (mocks.getAdminMediaByName) getAdminMediaByName = mocks.getAdminMediaByName;
  if (mocks.parseAdminMediaTags) parseAdminMediaTags = mocks.parseAdminMediaTags;
}

