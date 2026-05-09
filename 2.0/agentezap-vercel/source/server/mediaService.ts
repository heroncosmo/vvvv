/**
 * Agent Media Service
 * 
 * Gerencia biblioteca de mÃ­dias dos agentes e envio via WhatsApp (w-api ou Baileys).
 * O Mistral decide qual mÃ­dia enviar baseado nas descriÃ§Ãµes no prompt.
 * 
 * âš ï¸ IMPORTANTE: Todos os envios passam pelo sistema anti-ban centralizado!
 */

import { db } from "./db";
import { agentMediaLibrary, messages, type AgentMedia, type InsertAgentMedia, mistralResponseSchema, type MistralResponse } from "@shared/schema";
import { eq, and, asc, or, sql } from "drizzle-orm";
import {
  AudioTranscriptionError,
  formatAudioTranscriptionErrorMessage,
  getAudioTranscriptionRetryAfterMs,
  getMistralClient,
  isRetryableAudioTranscriptionError,
  resolveAudioTranscriptionHttpStatus,
  transcribeAudioWithMistral,
} from "./mistralClient";
import { registerAgentMessageId, broadcastToUser } from "./whatsapp";
import { storage } from "./storage";
import { messageQueueService } from "./messageQueueService";
import { centralizedMessageSender } from "./centralizedMessageSender";
import { antiBanProtectionService, simulateTyping, ANTI_BAN_CONFIG } from "./antiBanProtectionService";
import { shouldBlockAutomatedConversationSend } from "./conversationAutoPauseGuard";
import { processResponsePlaceholders } from "./textUtils";
import { buildMediaTrackingTag } from "./mediaTrackingTag";
import { detectMediaSendingIntent } from "./llm";
import {
  sendGatewayInstanceContactPresence,
  sendGatewayInstanceMedia,
  sendGatewayInstanceText,
} from "./whatsappGatewayClient";
import { isWhatsAppGatewayRuntime, resolveWhatsAppConnectionOwner } from "./whatsappGatewayOwnership";
import {
  buildGatewayTextSendBody,
  buildPlainTextWhatsAppPayload,
  normalizeOutboundTextForCustomer,
} from "./outboundTextPolicy";

// =============================================================================
// MEDIA LIBRARY CRUD
// =============================================================================

/**
 * Busca todas as mÃ­dias ativas de um usuÃ¡rio
 */
export async function getAgentMediaLibrary(userId: string): Promise<AgentMedia[]> {
  try {
    const media = await db
      .select()
      .from(agentMediaLibrary)
      .where(and(
        eq(agentMediaLibrary.userId, userId),
        eq(agentMediaLibrary.isActive, true)
      ))
      .orderBy(asc(agentMediaLibrary.displayOrder));
    
    return media;
  } catch (error) {
    console.error(`[MediaService] Error fetching media library for user ${userId}:`, error);
    return [];
  }
}

export function normalizeMediaName(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
}

export function foldMediaName(value: string | null | undefined): string {
  return normalizeMediaName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Gera um nome Ãºnico para mÃ­dia adicionando sufixo _2, _3, etc se necessÃ¡rio
 */
async function generateUniqueMediaName(userId: string, baseName: string): Promise<string> {
  const normalizedBaseName = normalizeMediaName(baseName);
  
  // Verifica se o nome base jÃ¡ existe
  const existing = await getMediaByName(userId, normalizedBaseName);
  if (!existing) {
    return normalizedBaseName;
  }
  
  // Busca todos os nomes similares (CARDAPIO, CARDAPIO_2, CARDAPIO_3, etc)
  const allMedia = await db
    .select({ name: agentMediaLibrary.name })
    .from(agentMediaLibrary)
    .where(eq(agentMediaLibrary.userId, userId));
  
  const pattern = new RegExp(`^${normalizedBaseName}(_\\d+)?$`);
  const similarNames = allMedia
    .map(m => m.name)
    .filter(name => pattern.test(name));
  
  // Encontra o maior sufixo numÃ©rico
  let maxSuffix = 1;
  for (const name of similarNames) {
    const match = name.match(/_(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSuffix) maxSuffix = num;
    }
  }
  
  // Retorna prÃ³ximo nÃºmero disponÃ­vel
  return `${normalizedBaseName}_${maxSuffix + 1}`;
}

/**
 * Busca uma mÃ­dia pelo nome
 */
export async function getMediaByName(userId: string, name: string): Promise<AgentMedia | null> {
  try {
    const normalizedName = normalizeMediaName(name);
    const [media] = await db
      .select()
      .from(agentMediaLibrary)
      .where(and(
        eq(agentMediaLibrary.userId, userId),
        eq(agentMediaLibrary.name, normalizedName)
      ))
      .limit(1);

    if (media) {
      return media;
    }

    const foldedTargetName = foldMediaName(normalizedName);
    const mediaLibrary = await getAgentMediaLibrary(userId);
    return mediaLibrary.find(item => foldMediaName(item.name) === foldedTargetName) || null;
  } catch (error) {
    console.error(`[MediaService] Error fetching media ${name} for user ${userId}:`, error);
    return null;
  }
}

/**
 * Cria ou atualiza uma mÃ­dia na biblioteca
 */
/**
 * Cria uma nova mÃ­dia (sempre insere, nunca atualiza)
 * Se o nome jÃ¡ existir, adiciona sufixo _2, _3, etc automaticamente
 */
export async function insertAgentMedia(data: InsertAgentMedia): Promise<AgentMedia | null> {
  try {
    // Gera nome Ãºnico (adiciona _2, _3 se necessÃ¡rio)
    const uniqueName = await generateUniqueMediaName(data.userId, data.name);
    
    const normalizedData = {
      ...data,
      name: uniqueName,
    };

    const [inserted] = await db
      .insert(agentMediaLibrary)
      .values(normalizedData)
      .returning();
    
    console.log(`[MediaService] Created media ${uniqueName} for user ${data.userId}`);
    return inserted;
  } catch (error) {
    console.error(`[MediaService] Error inserting media:`, error);
    return null;
  }
}

/**
 * Atualiza uma mÃ­dia existente
 * Se mudar o nome e jÃ¡ existir, retorna erro
 */
export async function updateAgentMedia(mediaId: string, userId: string, data: Partial<InsertAgentMedia>): Promise<AgentMedia | null> {
  try {
    // Se estÃ¡ mudando o nome, normaliza e valida
    if (data.name) {
      const normalizedName = normalizeMediaName(data.name);
      
      // Verifica se o novo nome jÃ¡ existe em outra mÃ­dia
      const existing = await getMediaByName(userId, normalizedName);
      if (existing && existing.id !== mediaId) {
        console.error(`[MediaService] Name conflict: ${normalizedName} already exists`);
        throw new Error(`Nome ${normalizedName} jÃ¡ existe em outra mÃ­dia`);
      }
      
      data.name = normalizedName;
    }

    const [updated] = await db
      .update(agentMediaLibrary)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(agentMediaLibrary.id, mediaId),
        eq(agentMediaLibrary.userId, userId)
      ))
      .returning();
    
    if (!updated) {
      console.error(`[MediaService] Media ${mediaId} not found for user ${userId}`);
      return null;
    }
    
    console.log(`[MediaService] Updated media ${updated.name} for user ${userId}`);
    return updated;
  } catch (error) {
    console.error(`[MediaService] Error updating media:`, error);
    throw error; // Re-throw para capturar no route
  }
}

/**
 * Remove uma mÃ­dia da biblioteca
 */
export async function deleteAgentMedia(userId: string, mediaId: string): Promise<boolean> {
  try {
    await db
      .delete(agentMediaLibrary)
      .where(and(
        eq(agentMediaLibrary.id, mediaId),
        eq(agentMediaLibrary.userId, userId)
      ));
    
    console.log(`[MediaService] Deleted media ${mediaId} for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`[MediaService] Error deleting media:`, error);
    return false;
  }
}

/**
 * @deprecated Use insertAgentMedia para criar ou updateAgentMedia para atualizar
 * Mantido apenas para compatibilidade com testes antigos
 */
export async function upsertAgentMedia(data: InsertAgentMedia): Promise<AgentMedia | null> {
  console.warn('[MediaService] upsertAgentMedia is deprecated. Use insertAgentMedia or updateAgentMedia instead.');
  return insertAgentMedia(data);
}

// =============================================================================
// PROMPT GENERATION FOR MISTRAL
// =============================================================================

/**
 * Gera o bloco de mÃ­dias para incluir no prompt do Mistral
 * 
 * NOVA ABORDAGEM: O sistema de mÃ­dias funciona INDEPENDENTE do prompt do cliente
 * 
 * O cliente configura apenas:
 * - Tom de voz, estilo, informaÃ§Ãµes do negÃ³cio
 * 
 * As mÃ­dias sÃ£o enviadas AUTOMATICAMENTE baseadas no campo "when_to_use"
 * O cliente NÃƒO precisa colocar instruÃ§Ãµes de mÃ­dia no prompt
 * 
 * Este bloco Ã© adicionado AUTOMATICAMENTE pelo sistema e a IA deve seguir
 */
export function generateMediaPromptBlock(mediaList: AgentMedia[]): string {
  if (!mediaList || mediaList.length === 0) {
    return '';
  }

  // Filtrar apenas mÃ­dias ativas
  const activeMedias = mediaList.filter(m => m.isActive !== false);
  
  if (activeMedias.length === 0) {
    return '';
  }

  let mediaBlock = `

=== SISTEMA DE MIDIAS DISPONIVEIS ===

Voce tem arquivos para enviar ao cliente SOMENTE quando ele pedir ou quando o contexto
da conversa corresponder EXATAMENTE ao campo "QUANDO ENVIAR" abaixo.
NAO envie midias por conta propria. SOMENTE envie quando o cliente PEDIR EXPLICITAMENTE
ou quando a conversa for DIRETAMENTE sobre o tema descrito em "QUANDO ENVIAR".

ARQUIVOS DISPONIVEIS:
`;

  // Lista cada mÃ­dia com gatilhos explÃ­citos extraÃ­dos do whenToUse
  for (let i = 0; i < activeMedias.length; i++) {
    const media = activeMedias[i];
    const whenToUse = media.whenToUse || 'quando solicitado';
    const mediaType = media.mediaType === 'audio' ? 'ðŸŽ¤ ÃUDIO' :
                      media.mediaType === 'video' ? 'ðŸŽ¥ VÃDEO' :
                      media.mediaType === 'image' ? 'ðŸ–¼ï¸ IMAGEM' :
                      media.mediaType === 'flow' ? 'ðŸ”€ FLUXO' : 'ðŸ“„ DOCUMENTO/PDF';
    
    // Para fluxos, mostrar resumo dos itens
    const flowSummary = media.mediaType === 'flow' && media.flowItems && Array.isArray(media.flowItems) && media.flowItems.length > 0
      ? `(${media.flowItems.length} itens: ${(media.flowItems as any[]).map((it: any) => it.type === 'text' ? 'ðŸ’¬texto' : `ðŸ“Ž${it.mediaType||'mÃ­dia'}`).join('â†’')})`
      : '';
    
    // Extrair palavras-chave do whenToUse para criar gatilhos explÃ­citos
    const keywordsRaw = whenToUse.toLowerCase()
      .replace(/enviar apenas quando:|nÃ£o enviar:|quando:/gi, '')
      .replace(/quando|se|ou|e|o|a|cliente|solicitar|pedir|enviar|quiser|falar|mencionar|perguntar|sobre|apenas|somente/gi, ' ')
      .split(/[,\s]+/)
      .filter(k => k.length > 3);
    
    const keywords = [...new Set(keywordsRaw)].slice(0, 8);
    
    mediaBlock += `
- ${mediaType}: ${media.name}${flowSummary ? ' ' + flowSummary : ''}
  QUANDO ENVIAR: ${whenToUse}
  ${media.suppressTextResponse ? 'MODO DE RESPOSTA: se esta mídia for acionada, responda somente com a tag, sem texto adicional' : ''}
  TAG: [MEDIA:${media.name}]
`;
  }

  mediaBlock += `
=== REGRAS DE ENVIO DE MIDIA ===

1. SO envie midia quando o cliente PEDIR EXPLICITAMENTE ou a conversa for DIRETAMENTE sobre o tema.
2. Para enviar, inclua a tag [MEDIA:NOME] na resposta. Sem a tag, nada e enviado.
3. Max 1 midia por resposta. Nao repita midias ja enviadas.
4. NAO envie midia em saudacoes genericas a menos que o "QUANDO ENVIAR" diga especificamente para fazer isso.
5. Se voce mencionou que vai enviar, OBRIGATORIO colocar a tag.

Formato: [MEDIA:NOME_DA_MIDIA]
Exemplo: "Aqui esta o que voce pediu! [MEDIA:VIDEO_DEMO]"
`;

  return mediaBlock;
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

/**
 * Parseia a resposta do Mistral e extrai aÃ§Ãµes de mÃ­dia
 * 
 * SUPORTA MÃšLTIPLOS FORMATOS DE TAG:
 * - [MEDIA:NOME] - formato simplificado
 * - [ENVIAR_MIDIA:NOME] - formato legacy/antigo
 * - [MIDIA:NOME] - formato alternativo
 * 
 * A IA pode usar qualquer um destes formatos e o sistema detectarÃ¡ corretamente.
 */
export function parseMistralResponse(responseText: string): MistralResponse | null {
  try {
    // ðŸ”¥ REGEX UNIFICADO: Aceita TODOS os formatos de tag de mÃ­dia
    // [MEDIA:NOME], [ENVIAR_MIDIA:NOME], [MIDIA:NOME]
    const mediaTagRegex = /\[(MEDIA|ENVIAR_MIDIA|MIDIA):\s*([^\]\r\n]+?)\s*\]/giu;
    const mediaTagCleanupRegex = /\[(MEDIA|ENVIAR_MIDIA|MIDIA):\s*([^\]\r\n]+?)\s*\]/giu;
    
    const actions: MistralResponse['actions'] = [];
    let match: RegExpExecArray | null;
    const detectedNames = new Set<string>(); // Evitar duplicatas
    
    while ((match = mediaTagRegex.exec(responseText)) !== null) {
      const tagType = match[1].toUpperCase(); // MEDIA, ENVIAR_MIDIA ou MIDIA
      const mediaName = normalizeMediaName(match[2]);
      if (!mediaName) continue;
      
      // Evitar adicionar a mesma mÃ­dia duas vezes
      if (!detectedNames.has(mediaName)) {
        detectedNames.add(mediaName);
        actions.push({
          type: 'send_media',
          media_name: mediaName,
        });
        console.log(`ðŸ“ [MediaService] Tag de mÃ­dia detectada [${tagType}]: ${mediaName}`);
      }
    }
    
    // ðŸ§¹ Remover TODAS as variantes de tags do texto final
    const cleanText = responseText
      .replace(mediaTagCleanupRegex, '')
      .replace(/\s{2,}/g, ' ') // Remover espaÃ§os duplicados
      .trim();
    
    if (actions.length > 0) {
      console.log(`ðŸ“ [MediaService] Total de ${actions.length} mÃ­dia(s) para enviar: ${actions.map(a => a.media_name).join(', ')}`);
    }
    
    return {
      messages: [{ type: "text", content: cleanText }],
      actions,
    };
  } catch (error) {
    console.error(`[MediaService] Error parsing Mistral response:`, error);
    return {
      messages: [{ type: "text", content: responseText }],
      actions: [],
    };
  }
}

// =============================================================================
// ðŸš¨ FORÃ‡AR ENVIO DE MÃDIA - SISTEMA AUTOMÃTICO COM IA
// =============================================================================
// Este sistema usa uma CHAMADA DE IA DEDICADA para decidir qual mÃ­dia enviar.
// Funciona para QUALQUER conta, independente de keywords hardcoded!
// A IA analisa: mensagem, histÃ³rico, biblioteca de mÃ­dia e campo whenToUse.
// =============================================================================

import { classifyMediaWithLLM } from "./llm";

interface ForceMediaResult {
  shouldSendMedia: boolean;
  mediaToSend: AgentMedia | null;
  matchedKeywords: string[];
  reason: string;
}

export function isFirstClientMessageForKeywordFallback(
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>
): boolean {
  const priorClientMessages = conversationHistory.filter(message => !message.fromMe).length;
  const clientTurnIndex = priorClientMessages + 1;
  return clientTurnIndex === 1;
}

/**
 * ðŸš¨ FORÃ‡A o envio de mÃ­dia baseado em classificaÃ§Ã£o da IA
 * 
 * NOVA VERSÃƒO: Usa uma chamada de IA dedicada para decidir qual mÃ­dia enviar.
 * 
 * Esta funÃ§Ã£o:
 * 1. Recebe a mensagem do cliente e histÃ³rico
 * 2. Chama a IA com a biblioteca de mÃ­dias e descriÃ§Ãµes whenToUse
 * 3. A IA decide de forma INTELIGENTE se deve enviar mÃ­dia e qual
 * 
 * VANTAGENS:
 * - Funciona para QUALQUER conta com QUALQUER biblioteca de mÃ­dia
 * - Entende semÃ¢ntica, nÃ£o apenas keywords
 * - NÃ£o envia mÃ­dia aleatoriamente
 * - Respeita o contexto da conversa
 */
export async function forceMediaDetection(
  clientMessage: string,
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>,
  mediaLibrary: AgentMedia[],
  sentMedias: string[] = [],
  aiResponseText?: string
): Promise<ForceMediaResult> {
  console.log(`\nðŸš¨ [FORCE MEDIA] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`);
  console.log(`ðŸš¨ [FORCE MEDIA] Iniciando classificaÃ§Ã£o com IA...`);
  console.log(`ðŸš¨ [FORCE MEDIA] Mensagem: "${clientMessage.substring(0, 100)}..."`);
  console.log(`ðŸš¨ [FORCE MEDIA] MÃ­dias disponÃ­veis: ${mediaLibrary.length}`);
  console.log(`ðŸš¨ [FORCE MEDIA] MÃ­dias jÃ¡ enviadas: ${sentMedias.join(', ') || 'nenhuma'}`);
  if (aiResponseText) {
    console.log(`ðŸš¨ [FORCE MEDIA] ðŸŽ¯ IA principal disse: "${aiResponseText.substring(0, 150)}..."`);
  }
  
  if (!mediaLibrary || mediaLibrary.length === 0) {
    console.log(`ðŸš¨ [FORCE MEDIA] âŒ Nenhuma mÃ­dia disponÃ­vel`);
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Nenhuma mÃ­dia disponÃ­vel' };
  }
  
  // ðŸ”§ FIX: Filtrar mÃ­dias jÃ¡ enviadas ANTES de processar
  const availableMedias = mediaLibrary.filter(m => {
    const alreadySent = sentMedias.some(sent => sent.toUpperCase() === m.name.toUpperCase());
    return !alreadySent && m.isActive !== false;
  });
  
  if (availableMedias.length === 0) {
    console.log(`ðŸš¨ [FORCE MEDIA] âŒ Todas as mÃ­dias jÃ¡ foram enviadas`);
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Todas as mÃ­dias jÃ¡ foram enviadas' };
  }
  
  try {
    // Chamar IA para classificaÃ§Ã£o (usa Groq ou Mistral conforme configuraÃ§Ã£o do admin)
    const aiResult = await classifyMediaWithLLM({
      clientMessage,
      conversationHistory,
      mediaLibrary: availableMedias.map(m => ({
        name: m.name,
        type: m.mediaType,
        whenToUse: m.whenToUse,
        isActive: m.isActive
      })),
      sentMedias,
      aiResponseText
    });
    
    if (aiResult.shouldSend && aiResult.mediaName) {
      // Encontrar a mÃ­dia correspondente
      const mediaToSend = availableMedias.find(m => 
        m.name.toUpperCase() === aiResult.mediaName!.toUpperCase()
      );
      
      if (mediaToSend) {
        console.log(`ðŸš¨ [FORCE MEDIA] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`);
        console.log(`ðŸš¨ [FORCE MEDIA] ðŸ† IA DECIDIU ENVIAR: ${mediaToSend.name}`);
        console.log(`ðŸš¨ [FORCE MEDIA] ðŸ“Š ConfianÃ§a: ${aiResult.confidence}%`);
        console.log(`ðŸš¨ [FORCE MEDIA] ðŸ’¡ RazÃ£o: ${aiResult.reason}`);
        console.log(`ðŸš¨ [FORCE MEDIA] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n`);
        
        return {
          shouldSendMedia: true,
          mediaToSend,
          matchedKeywords: ['IA_DECISION'],
          reason: aiResult.reason
        };
      }
    }
    
    const aiExpressedImmediateMediaIntent = Boolean(aiResponseText && detectMediaSendingIntent(aiResponseText));

    // ðŸ”§ FIX v2: FALLBACK apenas quando IA falhou (JSON invÃ¡lido, erro, etc)
    // NÃƒO fazer fallback quando IA decidiu NO_MEDIA com alta confianÃ§a
    const aiConfidentlyDecidedNoMedia = 
      !aiResult.shouldSend && 
      aiResult.confidence >= 60 && 
      aiResult.reason && 
      !aiResult.reason.includes('JSON') && 
      !aiResult.reason.includes('Erro');
    
    if (aiConfidentlyDecidedNoMedia) {
      // IA decidiu explicitamente nÃ£o enviar - respeitar a decisÃ£o
      console.log(`ðŸš¨ [FORCE MEDIA] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`);
      console.log(`ðŸš¨ [FORCE MEDIA] âŒ IA decidiu NÃƒO enviar mÃ­dia`);
      console.log(`ðŸš¨ [FORCE MEDIA] ðŸ’¡ RazÃ£o: ${aiResult.reason}`);
      console.log(`ðŸš¨ [FORCE MEDIA] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n`);
      return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: aiResult.reason };
    }

    if (aiExpressedImmediateMediaIntent && !aiResult.shouldSend) {
      console.log(`ðŸš¨ [FORCE MEDIA] âŒ Sem fallback por keyword: a IA prometeu mÃ­dia, mas a classificaÃ§Ã£o nÃ£o foi confiÃ¡vel`);
      console.log(`ðŸš¨ [FORCE MEDIA] ðŸ’¡ RazÃ£o: ${aiResult.reason}`);
      console.log(`ðŸš¨ [FORCE MEDIA] ðŸ§  PolÃ­tica de seguranÃ§a: melhor nÃ£o enviar do que disparar a mÃ­dia errada`);
      return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: aiResult.reason };
    }
    
    // Fallback: IA nÃ£o conseguiu decidir (JSON invÃ¡lido, erro, baixa confianÃ§a)
    console.log(`ðŸš¨ [FORCE MEDIA] âš ï¸ IA nÃ£o decidiu - tentando FALLBACK por keywords...`);
    const fallbackResult = keywordBasedMediaFallback(clientMessage, conversationHistory, availableMedias);
    
    if (fallbackResult.shouldSendMedia && fallbackResult.mediaToSend) {
      console.log(`ðŸš¨ [FORCE MEDIA] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`);
      console.log(`ðŸš¨ [FORCE MEDIA] ðŸ”„ FALLBACK FUNCIONOU: ${fallbackResult.mediaToSend.name}`);
      console.log(`ðŸš¨ [FORCE MEDIA] ðŸ”‘ Keywords: ${fallbackResult.matchedKeywords.join(', ')}`);
      console.log(`ðŸš¨ [FORCE MEDIA] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n`);
      return fallbackResult;
    }
    
    console.log(`ðŸš¨ [FORCE MEDIA] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`);
    console.log(`ðŸš¨ [FORCE MEDIA] âŒ Sem mÃ­dia para enviar`);
    console.log(`ðŸš¨ [FORCE MEDIA] ðŸ’¡ RazÃ£o: ${aiResult.reason || 'Nenhum match'}`);
    console.log(`ðŸš¨ [FORCE MEDIA] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n`);
    
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: aiResult.reason };
    
  } catch (error: any) {
    console.error(`ðŸš¨ [FORCE MEDIA] âŒ ERRO na classificaÃ§Ã£o IA: ${error.message}`);

    if (aiResponseText && detectMediaSendingIntent(aiResponseText)) {
      console.log(`ðŸš¨ [FORCE MEDIA] âŒ Erro com promessa de mÃ­dia detectada - sem fallback por keyword para evitar envio incorreto`);
      return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: `Erro: ${error.message}` };
    }
    
    // ðŸ”§ FIX: FALLBACK por keywords quando IA falha completamente
    console.log(`ðŸš¨ [FORCE MEDIA] ðŸ”„ Tentando FALLBACK por keywords apÃ³s erro...`);
    const fallbackResult = keywordBasedMediaFallback(clientMessage, conversationHistory, availableMedias);
    
    if (fallbackResult.shouldSendMedia && fallbackResult.mediaToSend) {
      console.log(`ðŸš¨ [FORCE MEDIA] âœ… FALLBACK SALVOU: ${fallbackResult.mediaToSend.name}`);
      return fallbackResult;
    }
    
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: `Erro: ${error.message}` };
  }
}

/**
 * ðŸ”§ FALLBACK: Sistema de detecÃ§Ã£o por keywords
 * Usado quando a IA nÃ£o consegue classificar ou falha
 * Analisa o campo whenToUse de cada mÃ­dia e busca keywords na mensagem
 */
function keywordBasedMediaFallback(
  clientMessage: string,
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>,
  mediaLibrary: AgentMedia[]
): ForceMediaResult {
  const msgLower = clientMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Detectar primeira mensagem (saudaÃ§Ã£o)
  const isFirstMessage = isFirstClientMessageForKeywordFallback(conversationHistory);
  const isSaudacao = /^(oi|ola|olÃ¡|bom dia|boa tarde|boa noite|eai|e ai|hey|hello|hi)[\s!?.,]*$/i.test(clientMessage.trim());
  
  interface MediaScore {
    media: AgentMedia;
    score: number;
    keywords: string[];
    reason: string;
  }
  
  const mediaScores: MediaScore[] = [];
  
  for (const media of mediaLibrary) {
    let score = 0;
    const matchedKeywords: string[] = [];
    let reason = '';
    
    // Extrair keywords do nome da mÃ­dia
    const mediaNameWords = media.name.toLowerCase().replace(/_/g, ' ').split(/\s+/);
    
    // Extrair keywords do whenToUse
    const whenToUse = (media.whenToUse || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Verificar se Ã© mÃ­dia de primeira mensagem/saudaÃ§Ã£o
    const mediaNameLower = media.name.toLowerCase();
    const isWelcomeMedia = /primeira|inicio|comeco|oi|ola|saudacao|boas.?vindas|bem.?vindo|mensagem.?inicio|cliente.?vem.?conversar|welcome|greeting/.test(whenToUse) ||
                          /inicio|welcome|greeting|saudacao|primeira|mensagem.*inicio|cliente.*vem.*conversar/.test(mediaNameLower);
    
    if ((isFirstMessage || isSaudacao) && isWelcomeMedia) {
      score += 100; // ðŸ”§ FIX: Score mais alto para garantir que primeira mensagem tenha prioridade
      matchedKeywords.push('PRIMEIRA_MENSAGEM');
      reason = 'Primeira mensagem do cliente - mÃ­dia de boas-vindas';
    }
    
    // Verificar keywords do nome da mÃ­dia na mensagem
    for (const word of mediaNameWords) {
      if (word.length > 3 && msgLower.includes(word)) {
        score += 15;
        matchedKeywords.push(word);
      }
    }
    
    // Verificar keywords do whenToUse na mensagem
    const whenToUseWords = whenToUse
      .replace(/enviar apenas quando:|nao enviar:|quando:/gi, '')
      .replace(/quando|se|ou|e|o|a|cliente|solicitar|pedir|enviar|quiser|falar|mencionar|perguntar|sobre|apenas|somente/gi, ' ')
      .split(/[,\s]+/)
      .filter(k => k.length > 3);
    
    for (const word of whenToUseWords) {
      if (msgLower.includes(word)) {
        score += 10;
        if (!matchedKeywords.includes(word)) {
          matchedKeywords.push(word);
        }
      }
    }
    
    // Keywords comuns para tipos de mÃ­dia
    const commonKeywords: Record<string, string[]> = {
      'video': ['mostrar', 'ver', 'demonstracao', 'demo', 'como funciona', 'funcionamento'],
      'audio': ['ouvir', 'escutar', 'audio', 'voz'],
      'image': ['foto', 'imagem', 'ver', 'mostra'],
      'document': ['documento', 'pdf', 'arquivo', 'baixar']
    };
    
    const typeKeywords = commonKeywords[media.mediaType] || [];
    for (const kw of typeKeywords) {
      if (msgLower.includes(kw)) {
        score += 5;
        if (!matchedKeywords.includes(kw)) {
          matchedKeywords.push(kw);
        }
      }
    }
    
    if (score > 0) {
      mediaScores.push({
        media,
        score,
        keywords: matchedKeywords,
        reason: reason || `Keywords encontradas: ${matchedKeywords.join(', ')}`
      });
    }
  }
  
  // Ordenar por score e retornar o melhor
  mediaScores.sort((a, b) => b.score - a.score);
  
  if (mediaScores.length > 0 && mediaScores[0].score >= 10) {
    const winner = mediaScores[0];
    return {
      shouldSendMedia: true,
      mediaToSend: winner.media,
      matchedKeywords: winner.keywords,
      reason: `FALLBACK: ${winner.reason} (score: ${winner.score})`
    };
  }
  
  return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Nenhum match significativo (fallback)' };
}

// Manter a versÃ£o sync para compatibilidade (usa a funÃ§Ã£o async internamente via wrapper)
// DEPRECATED: Use a versÃ£o async diretamente
export function forceMediaDetectionSync(
  clientMessage: string,
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>,
  mediaLibrary: AgentMedia[],
  sentMedias: string[] = []
): ForceMediaResult {
  console.warn(`âš ï¸ [FORCE MEDIA] forceMediaDetectionSync estÃ¡ DEPRECATED - use forceMediaDetection (async)`);
  // Retorna resultado vazio para nÃ£o quebrar cÃ³digo antigo
  return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Use async version' };
}

// =============================================================================
// W-API MEDIA SENDING
// =============================================================================

interface WApiConfig {
  apiUrl: string;
  apiKey: string;
  instanceId: string;
}

interface SendMediaParams {
  to: string; // NÃºmero do destinatÃ¡rio (ex: 5511999999999)
  mediaType: 'audio' | 'image' | 'video' | 'document';
  mediaUrl: string; // URL pÃºblica da mÃ­dia
  caption?: string; // Legenda (para imagem/vÃ­deo/documento)
  fileName?: string; // Nome do arquivo (para documento)
  isPtt?: boolean; // Push-to-talk (Ã¡udio gravado) - default: true para Ã¡udio
}

export interface MediaUrlActionPayload {
  media_url: string;
  media_type: 'audio' | 'image' | 'video' | 'document';
  caption?: string;
  file_name?: string;
  delay_seconds?: number;
}

type GatewayMediaType = 'audio' | 'image' | 'video' | 'document';

function inferAudioMimeTypeFromUrl(mediaUrl?: string | null): string | null {
  const pathname = String(mediaUrl || "").split("?")[0].toLowerCase();
  if (pathname.endsWith(".ogg") || pathname.endsWith(".opus")) {
    return "audio/ogg; codecs=opus";
  }
  if (pathname.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (pathname.endsWith(".m4a") || pathname.endsWith(".mp4")) {
    return "audio/mp4";
  }
  if (pathname.endsWith(".wav")) {
    return "audio/wav";
  }
  return null;
}

function normalizeGatewayMediaMimeType(
  mediaType: GatewayMediaType,
  mimeType?: string | null,
  mediaUrl?: string | null,
): string {
  const normalized = String(mimeType || "").trim().toLowerCase();

  if (mediaType === "image") return normalized || "image/jpeg";
  if (mediaType === "video") return normalized || "video/mp4";
  if (mediaType === "document") return normalized || "application/octet-stream";

  if (normalized.includes("codecs=opus") || normalized === "audio/opus") {
    return "audio/ogg; codecs=opus";
  }
  if (normalized === "audio/ogg" || normalized === "application/ogg") {
    return "audio/ogg; codecs=opus";
  }
  if (normalized) {
    return normalized;
  }

  return inferAudioMimeTypeFromUrl(mediaUrl) || "audio/mp4";
}

function shouldSendGatewayAudioAsPtt(mediaType: GatewayMediaType, mimeType: string): boolean {
  if (mediaType !== "audio") return false;
  const normalized = String(mimeType || "").toLowerCase();
  return normalized.includes("opus") || normalized === "audio/ogg";
}

/**
 * Envia mÃ­dia via W-API
 * ReferÃªncia: https://www.postman.com/w-api/w-api-api-do-whatsapp/
 */
export async function sendMediaViaWApi(
  config: WApiConfig,
  params: SendMediaParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { apiUrl, apiKey, instanceId } = config;
    const { to, mediaType, mediaUrl, caption, fileName, isPtt } = params;

    // Formata nÃºmero para formato WhatsApp
    const formattedNumber = to.replace(/\D/g, '');
    const chatId = formattedNumber.includes('@') ? formattedNumber : `${formattedNumber}@s.whatsapp.net`;

    // Endpoint baseado no tipo de mÃ­dia
    const endpoints: Record<string, string> = {
      audio: '/message/sendMedia',
      image: '/message/sendMedia',
      video: '/message/sendMedia',
      document: '/message/sendMedia',
    };

    const endpoint = `${apiUrl}${endpoints[mediaType]}`;

    // Payload para W-API
    const payload: Record<string, any> = {
      chatId,
      mediatype: mediaType,
      media: mediaUrl,
    };

    if (caption) {
      payload.caption = caption;
    }

    if (fileName && mediaType === 'document') {
      payload.fileName = fileName;
    }
    
    // Para Ã¡udio, incluir flag PTT (push-to-talk = mensagem de voz gravada)
    if (mediaType === 'audio') {
      payload.ptt = isPtt !== false; // PTT por padrÃ£o
    }

    console.log(`[MediaService] Sending ${mediaType} to ${chatId} via W-API`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-instance-id': instanceId,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok && result.key?.id) {
      console.log(`[MediaService] Media sent successfully. MessageId: ${result.key.id}`);
      return { success: true, messageId: result.key.id };
    } else {
      console.error(`[MediaService] W-API error:`, result);
      return { success: false, error: result.message || 'Unknown error' };
    }
  } catch (error) {
    console.error(`[MediaService] Error sending media via W-API:`, error);
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// BAILEYS MEDIA SENDING (Fallback)
// =============================================================================

/**
 * Baixa arquivo da URL e retorna como Buffer
 * Essencial para enviar Ã¡udio PTT que precisa de buffer, nÃ£o URL
 */
export async function downloadMediaAsBuffer(url: string): Promise<Buffer> {
  console.log(`[MediaService] Downloading media from: ${url}`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`[MediaService] Downloaded ${buffer.length} bytes`);
  
  // ValidaÃ§Ã£o bÃ¡sica
  if (buffer.length === 0) {
    throw new Error('Downloaded buffer is empty');
  }
  
  return buffer;
}

/**
 * Envia mÃ­dia via Baileys (socket WhatsApp direto)
 * Usado como fallback se W-API nÃ£o estiver configurada
 * 
 * IMPORTANTE: Para Ã¡udio PTT, precisamos baixar o arquivo como Buffer
 * porque Baileys tem problemas com URLs para Ã¡udio PTT
 * 
 * ðŸ›¡ï¸ ANTI-BLOQUEIO: Agora passa pelo sistema de fila para respeitar
 * delay de 5-10s entre mensagens do mesmo WhatsApp
 */
export async function sendMediaViaBaileys(
  socket: any, // WASocket do Baileys
  jid: string,
  media: AgentMedia,
  userId?: string, // Para aplicar delay anti-bloqueio
  conversationId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!socket) {
      return { success: false, error: 'Socket not connected' };
    }

    // ðŸ›¡ï¸ ANTI-BLOQUEIO: Aguardar vez na fila antes de enviar mÃ­dia
    if (userId) {
      await messageQueueService.waitForTurn(userId, `mÃ­dia ${media.mediaType}: ${media.name}`, {
        prioritizeOverQueue: Boolean(conversationId),
      });
    }

    if (userId) {
      const pauseCheck = await shouldBlockAutomatedConversationSend({
        userId,
        jid,
        conversationId,
        origin: "ai_agent",
      });
      if (pauseCheck.blocked) {
        messageQueueService.markMediaSent(userId);
        return { success: false, error: "Conversa pausada por resposta manual do dono" };
      }
    }

    console.log(`[MediaService] Sending ${media.mediaType} to ${jid} via Baileys`);
    console.log(`[MediaService] Media URL: ${media.storageUrl}`);
    console.log(`[MediaService] Media MimeType: ${media.mimeType}`);

    let messageContent: any;

    switch (media.mediaType) {
      case 'audio': {
        // IMPORTANTE: Baileys Ã© MUITO especÃ­fico com Ã¡udio
        // Use estratÃ©gia com fallback (PTT e mimetypes diferentes)
        try {
          const audioBuffer = await downloadMediaAsBuffer(media.storageUrl);
          console.log(`[MediaService] Audio buffer downloaded: ${audioBuffer.length} bytes`);

          // IMPORTANTE: Baileys E2E tests usam audio/mp4 para PTT, nÃ£o ogg/opus!
          // Veja: https://github.com/WhiskeySockets/Baileys/blob/main/src/__tests__/e2e/send-receive-message.test-e2e.ts#L212
          const isPtt = media.isPtt !== false;
          // FORÃ‡AR audio/mp4 porque Ã© o que funciona nos testes oficiais do Baileys
          const mimeType = 'audio/mp4';

          console.log(`[MediaService] ðŸŽµ Audio config:`);
          console.log(`    - Buffer size: ${audioBuffer.length} bytes`);
          console.log(`    - MimeType: ${mimeType}`);
          console.log(`    - isPtt (gravado): ${isPtt}`);

          // Tenta enviar com fallback inteligente (PTT -> sem PTT -> outros mimetypes)
          const audioResult = await sendAudioWithFallback(socket, jid, audioBuffer, media.storageUrl, mimeType, isPtt);
          // ðŸ›¡ï¸ ANTI-BLOQUEIO: Marcar como enviado apÃ³s fallback de Ã¡udio
          if (userId) {
            messageQueueService.markMediaSent(userId);
          }
          return audioResult;
        } catch (downloadError) {
          // ðŸ›¡ï¸ ANTI-BLOQUEIO: Marcar como enviado mesmo em erro
          if (userId) {
            messageQueueService.markMediaSent(userId);
          }
          console.error(`[MediaService] âŒ Failed to download audio:`, downloadError);
          return { success: false, error: `Failed to download audio: ${String(downloadError)}` };
        }
      }
      break;

      case 'image':
        // Imagens funcionam bem com URL, mas vamos tentar buffer tambÃ©m para consistÃªncia
        try {
          const imageBuffer = await downloadMediaAsBuffer(media.storageUrl);
          messageContent = {
            image: imageBuffer,
            caption: media.caption || undefined, // Usa caption (nÃ£o description)
            mimetype: media.mimeType || 'image/jpeg',
          };
        } catch (downloadError) {
          // Fallback para URL se download falhar
          console.warn(`[MediaService] Image download failed, trying URL: ${downloadError}`);
          messageContent = {
            image: { url: media.storageUrl },
            caption: media.caption || undefined, // Usa caption (nÃ£o description)
            mimetype: media.mimeType || 'image/jpeg',
          };
        }
        break;

      case 'video':
        // VÃ­deos podem ser grandes, tentar URL primeiro
        try {
          const videoBuffer = await downloadMediaAsBuffer(media.storageUrl);
          messageContent = {
            video: videoBuffer,
            caption: media.caption || undefined, // Usa caption (nÃ£o description)
            mimetype: media.mimeType || 'video/mp4',
          };
        } catch (downloadError) {
          console.warn(`[MediaService] Video download failed, trying URL: ${downloadError}`);
          messageContent = {
            video: { url: media.storageUrl },
            caption: media.caption || undefined, // Usa caption (nÃ£o description)
            mimetype: media.mimeType || 'video/mp4',
          };
        }
        break;

      case 'document':
        // Documentos precisam de buffer para manter o fileName
        try {
          const docBuffer = await downloadMediaAsBuffer(media.storageUrl);
          messageContent = {
            document: docBuffer,
            mimetype: media.mimeType || 'application/pdf',
            fileName: media.fileName || 'document',
          };
        } catch (downloadError) {
          console.warn(`[MediaService] Document download failed, trying URL: ${downloadError}`);
          messageContent = {
            document: { url: media.storageUrl },
            mimetype: media.mimeType || 'application/pdf',
            fileName: media.fileName || 'document',
          };
        }
        break;

      default:
        return { success: false, error: `Unknown media type: ${media.mediaType}` };
    }

    console.log(`[MediaService] Sending message to Baileys...`);
    let result = await socket.sendMessage(jid, messageContent);

    // ðŸ›¡ï¸ ANTI-BLOQUEIO: Marcar como enviado para liberar prÃ³ximo
    if (userId) {
      messageQueueService.markMediaSent(userId);
    }

    if (result?.key?.id) {
      console.log(`[MediaService] âœ… Media sent via Baileys. MessageId: ${result.key.id}`);
      return { success: true, messageId: result.key.id };
    } else {
      console.error(`[MediaService] âŒ No message ID returned from Baileys`);
      return { success: false, error: 'No message ID returned' };
    }
  } catch (error) {
    // ðŸ›¡ï¸ ANTI-BLOQUEIO: Marcar como enviado mesmo em erro para liberar fila
    if (userId) {
      messageQueueService.markMediaSent(userId);
    }
    console.error(`[MediaService] âŒ Error sending media via Baileys:`, error);
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// AUDIO VALIDATION & CONVERSION
// =============================================================================

/**
 * Valida o formato do Ã¡udio e retorna informaÃ§Ãµes de diagnÃ³stico
 * Ajuda a identificar problemas com o arquivo de Ã¡udio
 */
export async function validateAudioBuffer(buffer: Buffer, mimeType: string): Promise<{
  isValid: boolean;
  format: string;
  hasHeader: boolean;
  size: number;
  issues: string[];
}> {
  const issues: string[] = [];
  let format = 'unknown';
  let hasHeader = false;

  // Verificar tamanho
  if (buffer.length === 0) {
    issues.push('Buffer vazio');
    return { isValid: false, format, hasHeader, size: 0, issues };
  }

  if (buffer.length < 100) {
    issues.push('Buffer muito pequeno (< 100 bytes) - pode estar corrompido');
  }

  // Verificar headers conhecidos
  const header = buffer.slice(0, 4).toString('hex').toUpperCase();
  
  // OGG header
  if (header.startsWith('4F6767')) {
    format = 'OGG';
    hasHeader = true;
  }
  // OPUS header (OggS)
  else if (buffer.slice(0, 4).toString() === 'OggS') {
    format = 'OGG-OPUS';
    hasHeader = true;
  }
  // MP3 header
  else if ((buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) || header.startsWith('ID3')) {
    format = 'MP3';
    hasHeader = true;
  }
  // WAV header
  else if (header === '52494646') { // RIFF
    format = 'WAV';
    hasHeader = true;
  }
  // M4A header
  else if (header.slice(4) === '66747970') { // ftyp
    format = 'M4A';
    hasHeader = true;
  }
  else {
    issues.push(`Formato desconhecido (header: ${header})`);
    issues.push('Arquivo pode estar em formato Opus puro sem container OGG');
  }

  const isValid = hasHeader && issues.length === 0;

  console.log(`[MediaService] ðŸ” Audio validation:`, {
    format,
    mimeType,
    hasHeader,
    size: buffer.length,
    isValid,
    issues
  });

  return { isValid, format, hasHeader, size: buffer.length, issues };
}

/**
 * Gera um Ã¡udio WAV de teste (beep de 1s) em runtime para diagnÃ³stico
 * Ãštil para validar se o problema Ã© o arquivo ou o envio Baileys
 */
export function generateTestWavBuffer(durationMs: number = 1000, freq: number = 440): Buffer {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const amplitude = 0.2; // 20% da escala mÃ¡xima

  // WAV header (16-bit PCM, mono)
  const headerSize = 44;
  const dataSize = numSamples * 2; // 16-bit = 2 bytes
  const buffer = Buffer.alloc(headerSize + dataSize);

  // Escrever header RIFF/WAVE
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4); // chunk size
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size (PCM)
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Dados PCM (senoide)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * amplitude;
    const intSample = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(intSample * 32767, headerSize + i * 2);
  }

  return buffer;
}

/**
 * Tenta diferentes estratÃ©gias de envio de Ã¡udio para Baileys
 * Se uma falhar, tenta outra
 */
async function sendAudioWithFallback(
  socket: any,
  jid: string,
  audioBuffer: Buffer,
  storageUrl: string,
  mimeType: string,
  isPtt: boolean
): Promise<{ success: boolean; messageId?: string; error?: string; strategy?: string }> {
  
  // Validar buffer
  const validation = await validateAudioBuffer(audioBuffer, mimeType);
  
  // ðŸ›¡ï¸ Helper para micro-delay entre retries (2-3s para nÃ£o spammar)
  const microDelay = () => new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
  
  // EstratÃ©gia 1: Enviar como estÃ¡ (com validaÃ§Ã£o)
  console.log(`[MediaService] ðŸ“‹ EstratÃ©gia 1: Enviar ${isPtt ? 'COM' : 'SEM'} PTT (${mimeType})`);
  
  try {
    const result = await socket.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: mimeType,
      ptt: isPtt,
    });

    if (result?.key?.id) {
      console.log(`[MediaService] âœ… EstratÃ©gia 1 funcionou! MessageId: ${result.key.id}`);
      return { success: true, messageId: result.key.id, strategy: `Env com ${isPtt ? 'PTT' : 'sem PTT'}` };
    }
  } catch (e) {
    console.warn(`[MediaService] âŒ EstratÃ©gia 1 falhou:`, e);
  }

  // ðŸ›¡ï¸ Micro-delay entre retries
  await microDelay();

  // EstratÃ©gia 2: Se falhou com PTT, tentar SEM PTT
  if (isPtt) {
    console.log(`[MediaService] ðŸ“‹ EstratÃ©gia 2: Tentar SEM PTT`);
    try {
      const result = await socket.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: mimeType,
        ptt: false,
      });

      if (result?.key?.id) {
        console.log(`[MediaService] âœ… EstratÃ©gia 2 funcionou (sem PTT)! MessageId: ${result.key.id}`);
        return { success: true, messageId: result.key.id, strategy: 'Enviado sem PTT (fallback)' };
      }
    } catch (e) {
      console.warn(`[MediaService] âŒ EstratÃ©gia 2 falhou:`, e);
    }
    
    // ðŸ›¡ï¸ Micro-delay entre retries
    await microDelay();
  }

  // EstratÃ©gia 3: Tentar com diferentes mimetypes (baseado nos testes do Baileys)
  // audio/mp4 Ã© o padrÃ£o usado em E2E tests: https://github.com/WhiskeySockets/Baileys/blob/main/src/__tests__/e2e/send-receive-message.test-e2e.ts#L212
  const mimetypeOptions = ['audio/mp4', 'audio/ogg; codecs=opus', 'audio/mpeg', 'audio/ogg'];
  for (const mt of mimetypeOptions) {
    if (mt === mimeType) continue; // JÃ¡ tentamos
    
    console.log(`[MediaService] ðŸ“‹ EstratÃ©gia 3: Tentar com mimetype ${mt}`);
    try {
      const result = await socket.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: mt,
        ptt: false,
      });

      if (result?.key?.id) {
        console.log(`[MediaService] âœ… EstratÃ©gia 3 funcionou (${mt})! MessageId: ${result.key.id}`);
        return { success: true, messageId: result.key.id, strategy: `Enviado com mimetype ${mt}` };
      }
    } catch (e) {
      console.warn(`[MediaService] âŒ EstratÃ©gia 3 falhou com ${mt}:`, e);
    }
    
    // ðŸ›¡ï¸ Micro-delay entre retries de mimetype
    await microDelay();
  }

  // EstratÃ©gia 4: Tentar via URL (alguns cenÃ¡rios de Baileys preferem streaming)
  console.log(`[MediaService] ðŸ“‹ EstratÃ©gia 4: Enviar via URL direta (sem buffer)`);
  try {
    const result = await socket.sendMessage(jid, {
      audio: { url: storageUrl },
      mimetype: mimeType,
      ptt: isPtt,
    });

    if (result?.key?.id) {
      console.log(`[MediaService] âœ… EstratÃ©gia 4 funcionou (URL)! MessageId: ${result.key.id}`);
      return { success: true, messageId: result.key.id, strategy: 'Enviado via URL' };
    }
  } catch (e) {
    console.warn(`[MediaService] âŒ EstratÃ©gia 4 falhou (URL):`, e);
  }

  return {
    success: false,
    error: `Todas as estratÃ©gias falharam. Validation: ${JSON.stringify(validation)}`,
    strategy: 'Nenhuma estratÃ©gia funcionou'
  };
}

export async function sendMediaUrlViaBaileys(
  socket: any,
  jid: string,
  action: MediaUrlActionPayload,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!socket) {
      return { success: false, error: 'Socket not connected' };
    }

    let messageContent: any;

    switch (action.media_type) {
      case 'audio': {
        const audioBuffer = await downloadMediaAsBuffer(action.media_url);
        return await sendAudioWithFallback(
          socket,
          jid,
          audioBuffer,
          action.media_url,
          'audio/mp4',
          true,
        );
      }

      case 'image':
        try {
          const imageBuffer = await downloadMediaAsBuffer(action.media_url);
          messageContent = {
            image: imageBuffer,
            caption: action.caption || undefined,
            mimetype: 'image/jpeg',
          };
        } catch (downloadError) {
          console.warn(`[MediaService] Image URL action download failed, trying URL: ${downloadError}`);
          messageContent = {
            image: { url: action.media_url },
            caption: action.caption || undefined,
            mimetype: 'image/jpeg',
          };
        }
        break;

      case 'video':
        try {
          const videoBuffer = await downloadMediaAsBuffer(action.media_url);
          messageContent = {
            video: videoBuffer,
            caption: action.caption || undefined,
            mimetype: 'video/mp4',
          };
        } catch (downloadError) {
          console.warn(`[MediaService] Video URL action download failed, trying URL: ${downloadError}`);
          messageContent = {
            video: { url: action.media_url },
            caption: action.caption || undefined,
            mimetype: 'video/mp4',
          };
        }
        break;

      case 'document':
        try {
          const documentBuffer = await downloadMediaAsBuffer(action.media_url);
          messageContent = {
            document: documentBuffer,
            mimetype: 'application/octet-stream',
            fileName: action.file_name || 'document',
            caption: action.caption || undefined,
          };
        } catch (downloadError) {
          console.warn(`[MediaService] Document URL action download failed, trying URL: ${downloadError}`);
          messageContent = {
            document: { url: action.media_url },
            mimetype: 'application/octet-stream',
            fileName: action.file_name || 'document',
            caption: action.caption || undefined,
          };
        }
        break;

      default:
        return { success: false, error: `Unknown media type: ${action.media_type}` };
    }

    const result = await socket.sendMessage(jid, messageContent);
    if (result?.key?.id) {
      return { success: true, messageId: result.key.id };
    }

    return { success: false, error: 'No message ID returned' };
  } catch (error) {
    console.error('[MediaService] Error sending media URL via Baileys:', error);
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// AUDIO TRANSCRIPTION
// =============================================================================

/**
 * Transcreve Ã¡udio usando Mistral (voxtral-mini-latest)
 * Usado para transcrever Ã¡udios recebidos do usuÃ¡rio
 */
export async function transcribeAudio(
  audioUrl: string,
  mimeType: string = 'audio/ogg',
  userId?: string,
): Promise<string | null> {
  const maxAttempts = 6;
  const initialDelayMs = 8_000;
  const maxDelayMs = 20_000;
  const model = process.env.MISTRAL_TRANSCRIPTION_MODEL || 'voxtral-mini-latest';

  const inferAudioFileName = () => {
    try {
      const pathname = new URL(audioUrl).pathname;
      const candidate = pathname.split('/').filter(Boolean).pop();
      if (candidate) {
        return decodeURIComponent(candidate);
      }
    } catch {
      // Usa fallback baseado no mimeType.
    }

    if (mimeType.includes('ogg')) return 'audio.ogg';
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'audio.mp3';
    if (mimeType.includes('wav')) return 'audio.wav';
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'audio.m4a';
    if (mimeType.includes('webm')) return 'audio.webm';
    return 'audio.bin';
  };

  const waitBeforeRetry = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));
  const fileName = inferAudioFileName();

  try {
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new AudioTranscriptionError('NÃ£o foi possÃ­vel baixar o Ã¡udio para transcriÃ§Ã£o.', {
        retryable: audioResponse.status >= 500,
        statusCode: audioResponse.status,
      });
    }

    const audioBuffer = new Uint8Array(await audioResponse.arrayBuffer());

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const mistral = await getMistralClient(userId);
        const response = await mistral.audio.transcriptions.complete({
          model,
          file: {
            fileName,
            content: audioBuffer,
          },
        });

        const transcription = typeof response?.text === 'string' ? response.text.trim() : '';
        if (!transcription) {
          return null;
        }

        console.log(`[MediaService] Audio transcribed: ${transcription.substring(0, 100)}...`);
        return transcription;
      } catch (error) {
        const wrappedError =
          error instanceof AudioTranscriptionError
            ? error
            : new AudioTranscriptionError(formatAudioTranscriptionErrorMessage(error), {
                retryable: isRetryableAudioTranscriptionError(error),
                retryAfterMs: getAudioTranscriptionRetryAfterMs(error),
                statusCode: resolveAudioTranscriptionHttpStatus(error),
                cause: error,
              });

        if (!wrappedError.retryable || attempt >= maxAttempts) {
          throw wrappedError;
        }

        const delayMs = Math.max(
          wrappedError.retryAfterMs ?? 0,
          Math.min(initialDelayMs * attempt, maxDelayMs),
        );
        console.warn(
          `[MediaService] TranscriÃ§Ã£o de Ã¡udio em retry tÃ©cnico (${attempt}/${maxAttempts}). Nova tentativa em ${Math.ceil(
            delayMs / 1000,
          )}s.`,
        );
        await waitBeforeRetry(delayMs);
      }
    }

    return null;
  } catch (error) {
    console.error('[MediaService] Error transcribing audio:', error);
    throw error;
  }
}

// =============================================================================
// EXECUTE MEDIA ACTIONS
// =============================================================================

interface ExecuteMediaActionsParams {
  userId: string;
  jid: string; // WhatsApp JID do destinatÃ¡rio
  conversationId: string; // ID da conversa para salvar mensagens
  actions: MistralResponse['actions'];
  socket?: any; // WASocket do Baileys
  wapiConfig?: WApiConfig; // ConfiguraÃ§Ã£o W-API
  onFirstTextActionSent?: (text: string) => Promise<void> | void;
  contactName?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPositiveSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function resolveRangeSeconds(value: unknown): number | null {
  if (Array.isArray(value) && value.length > 0) {
    const min = toPositiveSeconds(value[0]);
    const max = toPositiveSeconds(value.length > 1 ? value[1] : value[0]);
    if (min !== null && max !== null) {
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      return low + Math.random() * (high - low);
    }
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return resolveRangeSeconds([
      record.min ?? record.from ?? record.start,
      record.max ?? record.to ?? record.end,
    ]);
  }

  return toPositiveSeconds(value);
}

function getFlowItemDelaySeconds(item: Record<string, unknown>, index: number): number {
  return (
    resolveRangeSeconds(item.delay_range_seconds) ??
    resolveRangeSeconds(item.delayRangeSeconds) ??
    resolveRangeSeconds(item.initial_delay_range_seconds) ??
    resolveRangeSeconds(item.initialDelayRangeSeconds) ??
    resolveRangeSeconds(item.delay_seconds) ??
    resolveRangeSeconds(item.delaySeconds) ??
    (index > 0 ? 1.2 : 0)
  );
}

function getFlowItemTypingSeconds(item: Record<string, unknown>): number {
  return (
    resolveRangeSeconds(item.typing_range_seconds) ??
    resolveRangeSeconds(item.typingRangeSeconds) ??
    resolveRangeSeconds(item.typing_seconds) ??
    resolveRangeSeconds(item.typingSeconds) ??
    0
  );
}

function formatOutgoingMediaLabel(mediaType?: string | null): string {
  switch (mediaType) {
    case "audio":
      return "*Audio*";
    case "image":
      return "*Imagem*";
    case "video":
      return "*Video*";
    case "document":
      return "*Documento*";
    default:
      return "*Midia*";
  }
}

/**
 * Executa as aÃ§Ãµes de mÃ­dia retornadas pelo Mistral
 * 
 * Suporta enviar mÃºltiplas mÃ­dias quando elas compartilham a mesma tag
 * (ex: vÃ­deo + Ã¡udio + imagem para "restaurante")
 * 
 * NOVO: Salva as mensagens de mÃ­dia no banco de dados e transcreve Ã¡udios
 */
export async function executeMediaActions(
  params: ExecuteMediaActionsParams
): Promise<void> {
  const { userId, jid, conversationId, actions, socket, wapiConfig, onFirstTextActionSent, contactName } = params;

  if (!actions || actions.length === 0) {
    return;
  }

  let firstTextActionCallbackDispatched = false;
  let gatewayConnectionIdPromise: Promise<string | null> | null = null;

  const resolveGatewayConnectionId = async (): Promise<string | null> => {
    if (!conversationId) {
      return null;
    }

    if (!gatewayConnectionIdPromise) {
      gatewayConnectionIdPromise = (async () => {
        try {
          const conversation = await storage.getConversation(conversationId);
          if (!conversation?.connectionId) {
            return null;
          }

          const connection = await storage.getConnectionById(conversation.connectionId);
          if (!connection || connection.userId !== userId) {
            return null;
          }

          if (!isWhatsAppGatewayRuntime() && await resolveWhatsAppConnectionOwner(connection) === "gateway") {
            return connection.id;
          }

          return null;
        } catch (error) {
          console.error("[MediaService] Falha ao resolver gateway remoto da conversa:", error);
          return null;
        }
      })();
    }

    return gatewayConnectionIdPromise;
  };

  const applyFlowItemTiming = async (item: Record<string, unknown>, index: number) => {
    const delaySeconds = getFlowItemDelaySeconds(item, index);
    if (delaySeconds > 0) {
      console.log(`[MediaService] Fluxo aguardando ${delaySeconds.toFixed(1)}s antes do item ${index + 1}`);
      await sleep(delaySeconds * 1000);
    }

    const typingSeconds = getFlowItemTypingSeconds(item);
    if (typingSeconds <= 0) {
      return;
    }

    const presence = item.type === "media" && item.mediaType === "audio" ? "recording" : "composing";
    try {
      if (socket?.sendPresenceUpdate) {
        await socket.sendPresenceUpdate(presence, jid);
        await sleep(typingSeconds * 1000);
        await socket.sendPresenceUpdate("paused", jid);
        return;
      }

      const gatewayConnectionId = await resolveGatewayConnectionId();
      if (gatewayConnectionId) {
        const phoneNumber = jid.replace("@s.whatsapp.net", "").replace("@c.us", "");
        await sendGatewayInstanceContactPresence(gatewayConnectionId, { phoneNumber, presence });
        await sleep(typingSeconds * 1000);
        await sendGatewayInstanceContactPresence(gatewayConnectionId, { phoneNumber, presence: "paused" });
        return;
      }

      await sleep(typingSeconds * 1000);
    } catch (error) {
      console.warn(`[MediaService] Falha ao aplicar typing/presence do fluxo item ${index + 1}:`, error);
      await sleep(typingSeconds * 1000);
    }
  };

  const persistOutgoingAndBroadcast = async (payload: {
    text: string;
    messageId?: string;
    isFromAgent?: boolean;
    mediaType?: "audio" | "image" | "video" | "document";
    mediaUrl?: string;
    mediaMimeType?: string | null;
    mediaDuration?: number | null;
    mediaCaption?: string | null;
  }) => {
    if (!conversationId) return;

    const sentAt = new Date();
    const safeMessageId =
      payload.messageId || `media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let savedMessage: any | undefined;

    try {
      try {
        const inserted = await db
          .insert(messages)
          .values({
            conversationId,
            messageId: safeMessageId,
            fromMe: true,
            text: payload.text,
            timestamp: sentAt,
            status: "sent",
            isFromAgent: payload.isFromAgent ?? true,
            mediaType: payload.mediaType,
            mediaUrl: payload.mediaUrl,
            mediaMimeType: payload.mediaMimeType || undefined,
            mediaDuration: payload.mediaDuration || undefined,
            mediaCaption: payload.mediaCaption || null,
          })
          .returning();
        savedMessage = inserted?.[0];
      } catch (insertError: any) {
        if (insertError?.code === "23505") {
          const existing = await db
            .select()
            .from(messages)
            .where(and(
              eq(messages.conversationId, conversationId),
              eq(messages.messageId, safeMessageId),
            ))
            .limit(1);
          savedMessage = existing?.[0];
          if (savedMessage && (payload.mediaCaption || payload.isFromAgent === true)) {
            const updateValues: Record<string, any> = {};
            if (payload.mediaCaption && savedMessage.mediaCaption !== payload.mediaCaption) {
              updateValues.mediaCaption = payload.mediaCaption;
            }
            if (payload.isFromAgent === true && savedMessage.isFromAgent !== true) {
              updateValues.isFromAgent = true;
            }

            if (Object.keys(updateValues).length > 0) {
              const updated = await db
                .update(messages)
                .set(updateValues)
                .where(eq(messages.id, savedMessage.id))
                .returning();
              savedMessage = updated?.[0] || savedMessage;
            }
          }
          console.warn(`[MediaService] Duplicate messageId detected, reusing existing message: ${safeMessageId}`);
        } else {
          throw insertError;
        }
      }

      await storage.updateConversation(conversationId, {
        lastMessageText: payload.text,
        lastMessageTime: sentAt,
        lastMessageFromMe: true,
        hasReplied: true,
        unreadCount: 0,
      });

      const conversation = await storage.getConversation(conversationId);

      broadcastToUser(userId, {
        type: "message_sent",
        conversationId,
        message: payload.text,
        messageData: savedMessage
          ? {
              id: savedMessage.id,
              conversationId,
              messageId: savedMessage.messageId || safeMessageId,
              fromMe: true,
              text: payload.text,
              timestamp: savedMessage.timestamp || sentAt.toISOString(),
              isFromAgent: payload.isFromAgent ?? true,
              status: "sent",
              mediaType: payload.mediaType || null,
              mediaUrl: payload.mediaUrl || null,
              mediaMimeType: payload.mediaMimeType || null,
              mediaDuration: payload.mediaDuration || null,
              mediaCaption: payload.mediaCaption || null,
            }
          : undefined,
        conversationUpdate: {
          id: conversationId,
          connectionId: conversation?.connectionId,
          contactNumber: conversation?.contactNumber,
          contactName: conversation?.contactName,
          contactAvatar: conversation?.contactAvatar,
          lastMessageText: payload.text,
          lastMessageTime: sentAt.toISOString(),
          lastMessageFromMe: true,
          unreadCount: 0,
        },
      });
    } catch (error) {
      console.error("[MediaService] Erro ao salvar/broadcast de mÃ­dia:", error);
    }
  };

  const sendTextAction = async (action: { text: string; delay_seconds?: number; media_name?: string }) => {
    const textContent = processResponsePlaceholders(String(action.text || "").trim(), contactName);
    if (!textContent) {
      return;
    }

    const trackingMediaName = String(action.media_name || "").trim();
    const mediaCaption = trackingMediaName ? buildMediaTrackingTag(trackingMediaName) : "[ACTION:TEXT]";
    const delaySeconds = action.delay_seconds ?? 0;
    if (delaySeconds > 0) {
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
    }

    try {
      let textMsgId: string | undefined;
      if (wapiConfig) {
        const textEndpoint = `${wapiConfig.apiUrl}/message/sendText`;
        const formattedNumber = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const chatId = formattedNumber.includes('@') ? formattedNumber : `${formattedNumber}@s.whatsapp.net`;
        const textResp = await fetch(textEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${wapiConfig.apiKey}`,
            'x-instance-id': wapiConfig.instanceId,
          },
          body: JSON.stringify({ chatId, message: textContent }),
        });
        const textJson = await textResp.json() as any;
        textMsgId = textJson.key?.id;
      } else if (socket) {
        const pauseCheck = await shouldBlockAutomatedConversationSend({
          userId,
          jid,
          conversationId,
          origin: "ai_agent",
        });
        if (pauseCheck.blocked) {
          console.log(`â¸ï¸ [MediaService] AÃ§Ã£o de texto bloqueada para conversa ${conversationId}`);
          return;
        }

        const normalizedText = normalizeOutboundTextForCustomer(textContent);
        const result = await socket.sendMessage(jid, buildPlainTextWhatsAppPayload(normalizedText));
        textMsgId = result?.key?.id;
      } else {
        const gatewayConnectionId = await resolveGatewayConnectionId();
        if (gatewayConnectionId) {
          const result = await sendGatewayInstanceText(gatewayConnectionId, buildGatewayTextSendBody({
            conversationId,
            text: textContent,
            isFromAgent: true,
            source: "agent",
          }));
          textMsgId = result?.messageId;
        }
      }

      if (!textMsgId) {
        console.error(`[MediaService] Falha ao enviar ação de texto: nenhum transporte disponível para ${conversationId}`);
        return;
      }

      registerAgentMessageId(textMsgId);

      if (conversationId) {
        await persistOutgoingAndBroadcast({
          text: textContent,
          messageId: textMsgId,
          isFromAgent: true,
          mediaCaption,
        });
      }

      if (!firstTextActionCallbackDispatched && onFirstTextActionSent) {
        firstTextActionCallbackDispatched = true;
        await onFirstTextActionSent(textContent);
      }
    } catch (error) {
      console.error("[MediaService] Erro ao enviar aÃ§Ã£o de texto:", error);
    }
  };

  const sendMediaUrlAction = async (action: MediaUrlActionPayload) => {
    try {
      const delaySeconds = action.delay_seconds ?? 0;
      if (delaySeconds > 0) {
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      }

      const hydratedCaption = action.caption
        ? processResponsePlaceholders(String(action.caption || ""), contactName)
        : undefined;
      let sendResult: { success: boolean; messageId?: string; error?: string } = { success: false };
      let sentViaGateway = false;

      if (wapiConfig) {
        sendResult = await sendMediaViaWApi(wapiConfig, {
          to: jid.split('@')[0],
          mediaType: action.media_type,
          mediaUrl: action.media_url,
          caption: hydratedCaption,
          fileName: action.file_name || undefined,
          isPtt: action.media_type === 'audio',
        });
      } else if (socket) {
        const pauseCheck = await shouldBlockAutomatedConversationSend({
          userId,
          jid,
          conversationId,
          origin: "ai_agent",
        });
        if (pauseCheck.blocked) {
          console.log(`⏸️ [MediaService] Mídia por URL bloqueada para conversa ${conversationId}`);
          return;
        }

        sendResult = await sendMediaUrlViaBaileys(socket, jid, action);
      } else {
        const gatewayConnectionId = await resolveGatewayConnectionId();
        if (gatewayConnectionId) {
          sentViaGateway = true;
          const gatewayMimeType = normalizeGatewayMediaMimeType(
            action.media_type,
            undefined,
            action.media_url,
          );
          const result = await sendGatewayInstanceMedia(gatewayConnectionId, {
            conversationId,
            type: action.media_type,
            data: action.media_url,
            mimetype: gatewayMimeType,
            filename: action.file_name || undefined,
            caption: hydratedCaption,
            ptt: shouldSendGatewayAudioAsPtt(action.media_type, gatewayMimeType),
          });
          sendResult = {
            success: true,
            messageId: result?.messageId || result?.id,
          };

          if (!sendResult.messageId) {
            sendResult.messageId = `gateway-media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            console.warn(
              `[MediaService] Gateway enviou mídia sem messageId para ${conversationId}; usando fallback interno ${sendResult.messageId}`,
            );
          }
        }
      }

      if (!sendResult.success || !sendResult.messageId) {
        console.error(`[MediaService] Falha ao enviar mídia por URL: ${sendResult.error || 'sem messageId'}`);
        return;
      }

      registerAgentMessageId(sendResult.messageId);

      if (conversationId && !sentViaGateway) {
        const messageText = hydratedCaption || formatOutgoingMediaLabel(action.media_type);

        await persistOutgoingAndBroadcast({
          text: messageText,
          messageId: sendResult.messageId,
          isFromAgent: true,
          mediaType: action.media_type,
          mediaUrl: action.media_url,
          mediaCaption: buildMediaTrackingTag((action as { media_name?: string }).media_name),
        });
      }
    } catch (error) {
      console.error('[MediaService] Erro ao enviar mídia por URL:', error);
    }
  };

  if (actions.some((action: any) => action?.type === 'send_text')) {
    for (const action of actions as any[]) {
      if (action?.type === 'send_text') {
        await sendTextAction(action);
      } else if (action?.type === 'send_media_url' && action.media_url) {
        await sendMediaUrlAction(action);
      } else if (action?.type === 'send_media' && action.media_name) {
        await executeMediaActions({
          userId,
          jid,
          conversationId,
          actions: [action],
          socket,
          wapiConfig,
          contactName,
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return;
  }

  const urlActions = actions.filter(action => action.type === 'send_media_url') as Array<{
    type: 'send_media_url';
    media_url: string;
    media_type: 'audio' | 'image' | 'video' | 'document';
    caption?: string;
    file_name?: string;
    delay_seconds?: number;
  }>;

  // Agrupar aÃ§Ãµes por media_name para enviar mÃ­dias relacionadas juntas
  const groupedActions = new Map<string, typeof actions>();
  
  for (const action of actions) {
    if (action.type === 'send_media') {
      if (!groupedActions.has(action.media_name)) {
        groupedActions.set(action.media_name, []);
      }
      groupedActions.get(action.media_name)!.push(action);
    }
  }

  // Enviar mÃ­dias diretas por URL (sem biblioteca)
  for (const action of urlActions) {
    try {
      const delaySeconds = action.delay_seconds ?? 0;
      if (delaySeconds > 0) {
        await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
      }

      let sendResult: { success: boolean; messageId?: string; error?: string } = { success: false };
      let sentViaGateway = false;

      if (wapiConfig) {
        sendResult = await sendMediaViaWApi(wapiConfig, {
          to: jid.split('@')[0],
          mediaType: action.media_type,
          mediaUrl: action.media_url,
          caption: action.caption || undefined,
          fileName: action.file_name || undefined,
          isPtt: action.media_type === 'audio',
        });
      } else if (socket) {
        const payload: Record<string, any> = {};
        if (action.media_type === 'image') {
          payload.image = { url: action.media_url };
          if (action.caption) payload.caption = action.caption;
        } else if (action.media_type === 'video') {
          payload.video = { url: action.media_url };
          if (action.caption) payload.caption = action.caption;
        } else if (action.media_type === 'document') {
          payload.document = { url: action.media_url };
          if (action.caption) payload.caption = action.caption;
          if (action.file_name) payload.fileName = action.file_name;
        } else if (action.media_type === 'audio') {
          payload.audio = { url: action.media_url };
          payload.ptt = true;
        }

        const pauseCheck = await shouldBlockAutomatedConversationSend({
          userId,
          jid,
          conversationId,
          origin: "ai_agent",
        });
        if (pauseCheck.blocked) {
          console.log(`â¸ï¸ [MediaService] MÃ­dia por URL bloqueada para conversa ${conversationId}`);
          return;
        }

        const result = await socket.sendMessage(jid, payload);
        sendResult = {
          success: true,
          messageId: result?.key?.id,
        };
      } else {
        const gatewayConnectionId = await resolveGatewayConnectionId();
        if (gatewayConnectionId) {
          sentViaGateway = true;
          const gatewayMimeType = normalizeGatewayMediaMimeType(
            action.media_type,
            undefined,
            action.media_url,
          );
          const result = await sendGatewayInstanceMedia(gatewayConnectionId, {
            conversationId,
            type: action.media_type,
            data: action.media_url,
            mimetype: gatewayMimeType,
            filename: action.file_name || undefined,
            caption: action.caption || undefined,
            ptt: shouldSendGatewayAudioAsPtt(action.media_type, gatewayMimeType),
          });
          sendResult = {
            success: true,
            messageId: result?.messageId || result?.id,
          };
        }
      }

      if (sendResult.success && sendResult.messageId) {
        registerAgentMessageId(sendResult.messageId);
      }

      if (sendResult.success && conversationId && !sentViaGateway) {
        try {
          const messageId = sendResult.messageId || `media-url-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const messageText = action.caption || formatOutgoingMediaLabel(action.media_type);

          await persistOutgoingAndBroadcast({
            text: messageText,
            messageId,
            isFromAgent: true,
            mediaType: action.media_type,
            mediaUrl: action.media_url,
            mediaCaption: buildMediaTrackingTag((action as { media_name?: string }).media_name),
          });
        } catch (saveError) {
          console.error('[MediaService] Erro ao salvar mensagem de mÃ­dia URL:', saveError);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('[MediaService] Erro ao enviar mÃ­dia por URL:', error);
    }
  }

  // Processa cada grupo de mÃ­dias
  for (const [mediaName, mediaActions] of Array.from(groupedActions.entries())) {
    console.log(`\nðŸ“ [MediaService] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•`);
    console.log(`ðŸ“ [MediaService] Processando mÃ­dia: ${mediaName} (${mediaActions.length} aÃ§Ãµes)`);
    
    // Busca TODAS as mÃ­dias com esse nome de diferentes tipos
    // Exemplo: RESTAURANTE pode ter image, video, audio, document
    const allMediasForName = await getMediasByNamePattern(userId, mediaName);
    
    if (allMediasForName.length === 0) {
      console.error(`ðŸ“ [MediaService] âŒ ERRO CRÃTICO: Nenhuma mÃ­dia encontrada para: "${mediaName}" (userId: ${userId})`);
      console.error(`ðŸ“ [MediaService] ðŸ’¡ Verifique se a mÃ­dia existe no banco de dados`);
      continue;
    }

    console.log(`ðŸ“ [MediaService] âœ… Encontradas ${allMediasForName.length} mÃ­dias para "${mediaName}":`);
    allMediasForName.forEach(m => {
      console.log(`   - ${m.mediaType}: ${m.name} | URL: ${m.storageUrl?.substring(0, 60)}...`);
    });

    // Enviar todas as mÃ­dias relacionadas
    for (const media of allMediasForName) {
      // === SUPORTE A FLUXO (PARTE 6) ===
      // Se for tipo 'flow', iterar pelos flowItems em ordem e enviar cada um
      if (media.mediaType === 'flow') {
        const flowItems = (media.flowItems as any[] | null) || [];
        if (flowItems.length === 0) {
          console.error(`ðŸ“ [MediaService] âŒ Fluxo "${media.name}" nÃ£o tem itens configurados`);
          continue;
        }
        
        // Ordenar por campo 'order'
        const sortedItems = [...flowItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        
        console.log(`ðŸ”€ [MediaService] Iniciando fluxo "${media.name}" com ${sortedItems.length} itens`);
        
        for (let idx = 0; idx < sortedItems.length; idx++) {
          const item = sortedItems[idx] as Record<string, any>;
          console.log(`ðŸ”€ [MediaService] Fluxo item ${idx + 1}/${sortedItems.length}: type=${item.type}`);

          await applyFlowItemTiming(item, idx);
          
          if (item.type === 'text') {
            // Enviar como mensagem de texto
            const textContent = processResponsePlaceholders(String(item.text || ''), contactName);
            if (!textContent.trim()) continue;
            
            try {
              let textMsgId: string | undefined;
              if (wapiConfig) {
                const textEndpoint = `${wapiConfig.apiUrl}/message/sendText`;
                const formattedNumber = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
                const chatId = formattedNumber.includes('@') ? formattedNumber : `${formattedNumber}@s.whatsapp.net`;
                const textResp = await fetch(textEndpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${wapiConfig.apiKey}`,
                    'x-instance-id': wapiConfig.instanceId,
                  },
                  body: JSON.stringify({ chatId, message: textContent }),
                });
                const textJson = await textResp.json() as any;
                textMsgId = textJson.key?.id;
              } else if (socket) {
                const pauseCheck = await shouldBlockAutomatedConversationSend({
                  userId,
                  jid,
                  conversationId,
                  origin: "ai_agent",
                });
                if (pauseCheck.blocked) {
                  console.log(`â¸ï¸ [MediaService] Item de texto do fluxo bloqueado para conversa ${conversationId}`);
                  break;
                }

                const normalizedText = normalizeOutboundTextForCustomer(textContent);
                const result = await socket.sendMessage(jid, buildPlainTextWhatsAppPayload(normalizedText));
                textMsgId = result?.key?.id;
              } else {
                const gatewayConnectionId = await resolveGatewayConnectionId();
                if (gatewayConnectionId) {
                  const result = await sendGatewayInstanceText(gatewayConnectionId, buildGatewayTextSendBody({
                    conversationId,
                    text: textContent,
                  }));
                  textMsgId = result?.messageId;
                }
              }
              
              if (!textMsgId) {
                console.error(`[MediaService] Fluxo de texto sem transporte disponível para ${conversationId}`);
                continue;
              }

              registerAgentMessageId(textMsgId);
              
              // Salvar no banco
              if (conversationId) {
                await persistOutgoingAndBroadcast({
                  text: textContent,
                  messageId: textMsgId,
                  isFromAgent: true,
                  mediaCaption: `[FLOW:${media.name}:${idx}]`,
                });
              }
              
              console.log(`ðŸ”€ [MediaService] Fluxo item texto enviado: "${textContent.substring(0, 50)}..."`);
            } catch (textErr) {
              console.error(`ðŸ”€ [MediaService] Erro ao enviar texto do fluxo item ${idx}:`, textErr);
            }
            
          } else if (item.type === 'media') {
            // Enviar como mÃ­dia
            const itemMediaType = item.mediaType as 'audio' | 'image' | 'video' | 'document';
            const itemUrl = item.storageUrl || '';
            if (!itemUrl || !itemMediaType) continue;
            
            try {
              let sendResult: { success: boolean; messageId?: string; error?: string } = { success: false };
              
              // Criar objeto AgentMedia temporÃ¡rio para reutilizar sendMediaViaBaileys
              const tempMedia: AgentMedia = {
                id: `flow-item-${idx}`,
                userId,
                name: `${media.name}_ITEM_${idx}`,
                mediaType: itemMediaType,
                storageUrl: itemUrl,
                fileName: item.fileName || null,
                fileSize: null,
                mimeType: item.mimeType || null,
                durationSeconds: null,
                description: '',
                whenToUse: null,
                caption: item.caption
                  ? processResponsePlaceholders(String(item.caption || ""), contactName)
                  : null,
                transcription: null,
                isPtt: itemMediaType === 'audio',
                sendAlone: false,
                isActive: true,
                displayOrder: idx,
                wapiMediaId: null,
                flowItems: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              
              if (wapiConfig) {
                sendResult = await sendMediaViaWApi(wapiConfig, {
                  to: jid.split('@')[0],
                  mediaType: itemMediaType,
                  mediaUrl: itemUrl,
                  caption: itemMediaType !== 'audio'
                    ? (item.caption
                      ? processResponsePlaceholders(String(item.caption || ""), contactName)
                      : undefined)
                    : undefined,
                  fileName: item.fileName || undefined,
                  isPtt: itemMediaType === 'audio',
                });
              } else if (socket) {
                sendResult = await sendMediaViaBaileys(socket, jid, tempMedia, userId, conversationId);
              } else {
                const gatewayConnectionId = await resolveGatewayConnectionId();
                if (gatewayConnectionId) {
                  const gatewayMimeType = normalizeGatewayMediaMimeType(
                    itemMediaType,
                    item.mimeType,
                    itemUrl,
                  );
                  const result = await sendGatewayInstanceMedia(gatewayConnectionId, {
                    conversationId,
                    type: itemMediaType,
                    data: itemUrl,
                    mimetype: gatewayMimeType,
                    filename: item.fileName || undefined,
                    caption: itemMediaType !== "audio"
                      ? (item.caption
                        ? processResponsePlaceholders(String(item.caption || ""), contactName)
                        : undefined)
                      : undefined,
                    ptt: shouldSendGatewayAudioAsPtt(itemMediaType, gatewayMimeType),
                  });
                  sendResult = {
                    success: true,
                    messageId: result?.messageId || result?.id,
                  };
                }
              }
              
              if (sendResult.success && sendResult.messageId) {
                registerAgentMessageId(sendResult.messageId);
              }
              
              if (sendResult.success && conversationId) {
                const msgText = item.caption
                  ? processResponsePlaceholders(String(item.caption || ""), contactName)
                  : formatOutgoingMediaLabel(itemMediaType);
                await persistOutgoingAndBroadcast({
                  text: msgText,
                  messageId: sendResult.messageId || `flow-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  isFromAgent: true,
                  mediaType: itemMediaType,
                  mediaUrl: itemUrl,
                  mediaCaption: `[FLOW:${media.name}:${idx}]`,
                });
              }
              
              console.log(`ðŸ”€ [MediaService] Fluxo item mÃ­dia enviada: ${itemMediaType} url=${itemUrl.substring(0, 50)}`);
            } catch (mediaErr) {
              console.error(`ðŸ”€ [MediaService] Erro ao enviar mÃ­dia do fluxo item ${idx}:`, mediaErr);
            }
          }
        }
        
        console.log(`ðŸ”€ [MediaService] âœ… Fluxo "${media.name}" concluÃ­do (${sortedItems.length} itens enviados)`);
        continue; // Vai para prÃ³xima mÃ­dia no grupo
      }
      // === FIM SUPORTE A FLUXO ===
      
      let retryCount = 0;
      const maxRetries = 2;
      let sendSuccess = false;
      
      while (retryCount <= maxRetries && !sendSuccess) {
        try {
          // Delay opcional antes de enviar (com verificaÃ§Ã£o de undefined)
          const delaySeconds = mediaActions[0]?.delay_seconds;
          if (delaySeconds && delaySeconds > 0 && retryCount === 0) {
            console.log(`â³ [MediaService] Aguardando ${delaySeconds}s antes de enviar ${media.mediaType}...`);
            await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
          }
          
          // Retry delay
          if (retryCount > 0) {
            console.log(`ðŸ”„ [MediaService] Retry ${retryCount}/${maxRetries} para ${media.name}...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }

          console.log(`ðŸ“¤ [MediaService] Enviando ${media.mediaType} "${media.name}" para ${jid}...`);
          
          // Validar URL antes de enviar
          if (!media.storageUrl || media.storageUrl.length < 10) {
            console.error(`ðŸ“ [MediaService] âŒ URL invÃ¡lida para mÃ­dia ${media.name}: "${media.storageUrl}"`);
            break; // NÃ£o faz retry para URL invÃ¡lida
          }

          let sendResult: { success: boolean; messageId?: string; error?: string } = { success: false };

          // Tenta enviar via W-API primeiro, depois Baileys
          if (wapiConfig) {
            sendResult = await sendMediaViaWApi(wapiConfig, {
              to: jid.split('@')[0],
              mediaType: media.mediaType as any,
              mediaUrl: media.storageUrl,
              caption: media.mediaType !== 'audio' ? (media.caption || undefined) : undefined,
              fileName: media.fileName || undefined,
              isPtt: media.isPtt !== false, // PTT por padrÃ£o para Ã¡udio
            });
          } else if (socket) {
            sendResult = await sendMediaViaBaileys(socket, jid, media, userId, conversationId);
          } else {
            const gatewayConnectionId = await resolveGatewayConnectionId();
            if (gatewayConnectionId) {
              const gatewayMimeType = normalizeGatewayMediaMimeType(
                media.mediaType as GatewayMediaType,
                media.mimeType,
                media.storageUrl,
              );
              const result = await sendGatewayInstanceMedia(gatewayConnectionId, {
                conversationId,
                type: media.mediaType,
                data: media.storageUrl,
                mimetype: gatewayMimeType,
                filename: media.fileName || undefined,
                caption: media.mediaType !== "audio" ? (media.caption || undefined) : undefined,
                ptt: media.mediaType === "audio"
                  ? shouldSendGatewayAudioAsPtt(media.mediaType, gatewayMimeType)
                  : undefined,
                seconds: media.durationSeconds || undefined,
              });
              sendResult = {
                success: true,
                messageId: result?.messageId || result?.id,
              };
            } else {
              console.error(`[MediaService] âŒ Nenhum transporte disponÃ­vel para enviar mÃ­dia ${media.name}`);
              break;
            }
          }

          if (sendResult.success) {
            sendSuccess = true;
            console.log(`ðŸ“ [MediaService] âœ… MÃDIA ENVIADA COM SUCESSO: ${media.name}`);
            
            // Registrar messageId para evitar que handleOutgoingMessage pause a IA
            if (sendResult.messageId) {
              registerAgentMessageId(sendResult.messageId);
            }
          } else {
            console.error(`ðŸ“ [MediaService] âŒ Falha ao enviar ${media.name}: ${sendResult.error}`);
            retryCount++;
          }
        } catch (error: any) {
          console.error(`ðŸ“ [MediaService] âŒ ExceÃ§Ã£o ao enviar ${media.name}: ${error.message}`);
          retryCount++;
        }
      }
      
      if (!sendSuccess) {
        console.error(`ðŸ“ [MediaService] âŒ FALHA DEFINITIVA apÃ³s ${maxRetries} retries para: ${media.name}`);
      }

      // ðŸ“ SALVAR MENSAGEM DE MÃDIA NO BANCO DE DADOS
      if (sendSuccess && conversationId) {
        try {
          let transcriptionText: string | null = null;
          
          // ðŸŽ¤ Se for Ã¡udio, transcrever para manter contexto na conversa
          if (media.mediaType === 'audio') {
            console.log(`ðŸŽ¤ [MediaService] Transcrevendo Ã¡udio enviado "${media.name}"...`);
            
            // Primeiro verificar se jÃ¡ temos transcriÃ§Ã£o salva na mÃ­dia
            if (media.transcription) {
              transcriptionText = media.transcription;
              console.log(`ðŸŽ¤ [MediaService] Usando transcriÃ§Ã£o existente da mÃ­dia`);
            } else {
              // Transcrever o Ã¡udio
              try {
                const audioBuffer = await downloadMediaAsBuffer(media.storageUrl);
                transcriptionText = await transcribeAudioWithMistral(audioBuffer, {
                  fileName: media.fileName || 'agent-audio.ogg',
                });
                
                if (transcriptionText) {
                  console.log(`ðŸŽ¤ [MediaService] Ãudio transcrito: "${transcriptionText.substring(0, 100)}..."`);
                  
                  // Atualizar a mÃ­dia com a transcriÃ§Ã£o para uso futuro
                  await db
                    .update(agentMediaLibrary)
                    .set({ transcription: transcriptionText, updatedAt: new Date() })
                    .where(eq(agentMediaLibrary.id, media.id));
                }
              } catch (transcribeError) {
                console.error(`ðŸŽ¤ [MediaService] Erro ao transcrever Ã¡udio:`, transcribeError);
              }
            }
          }

          // Gerar texto descritivo da mensagem
          const messageText =
            media.mediaType === 'image' || media.mediaType === 'video'
              ? media.caption || formatOutgoingMediaLabel(media.mediaType)
              : formatOutgoingMediaLabel(media.mediaType);

          // Salvar mensagem no banco
          const messageId = `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          await persistOutgoingAndBroadcast({
            text: messageText,
            messageId,
            isFromAgent: true,
            mediaType: media.mediaType as "audio" | "image" | "video" | "document",
            mediaUrl: media.storageUrl,
            mediaMimeType: media.mimeType || undefined,
            mediaDuration: media.durationSeconds || undefined,
            mediaCaption: `[MEDIA:${media.name}]`,
          });

          console.log(`ðŸ“ [MediaService] Mensagem de mÃ­dia salva no banco (conversationId: ${conversationId}, type: ${media.mediaType})`);
        } catch (saveError) {
          console.error(`ðŸ“ [MediaService] Erro ao salvar mensagem de mÃ­dia:`, saveError);
        }
      }

      // Pequeno delay entre envios para nÃ£o sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`ðŸ“ [MediaService] â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n`);
}

/**
 * Busca TODAS as mÃ­dias que correspondem a um padrÃ£o de nome
 * Exemplo: "RESTAURANTE" retorna image/RESTAURANTE + video/RESTAURANTE + audio/RESTAURANTE
 * Se nÃ£o encontrar, tenta buscar por nome exato como fallback
 */
async function getMediasByNamePattern(userId: string, pattern: string): Promise<AgentMedia[]> {
  try {
    // Primeiro tenta buscar por padrÃ£o (todas as mÃ­dias com esse nome)
    const medias = await db
      .select()
      .from(agentMediaLibrary)
      .where(
        and(
          eq(agentMediaLibrary.userId, userId),
          or(
            // Match exato do name
            eq(agentMediaLibrary.name, pattern),
            // Match case-insensitive
            sql`LOWER(${agentMediaLibrary.name}) = LOWER(${pattern})`
          )
        )
      );

    if (medias.length > 0) {
      return medias as AgentMedia[];
    }

    // Se nÃ£o encontrar com padrÃ£o, tenta buscar por nome exato (fallback)
    console.warn(`[MediaService] PadrÃ£o "${pattern}" nÃ£o encontrado, tentando busca exata...`);
    const exactMedia = await db
      .select()
      .from(agentMediaLibrary)
      .where(
        and(
          eq(agentMediaLibrary.userId, userId),
          eq(agentMediaLibrary.name, pattern)
        )
      )
      .limit(1);

    return exactMedia as AgentMedia[];
  } catch (error) {
    console.error(`[MediaService] Erro ao buscar mÃ­dias para padrÃ£o "${pattern}":`, error);
    return [];
  }
}

