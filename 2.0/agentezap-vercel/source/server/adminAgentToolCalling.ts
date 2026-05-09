/**
 * Admin Agent Tool Calling â€” Motor de decisÃ£o autÃ´nomo via LLM Tool Calling
 *
 * Substitui o sistema de stages/regex por chamadas nativas de ferramentas (Mistral).
 * O LLM decide autonomamente qual ferramenta usar com base no contexto da conversa.
 *
 * Feature flag: ADMIN_TOOL_CALLING=true
 *
 * Ferramentas disponÃ­veis:
 *   1. informar_planos   â€” Retorna tabela de planos e preÃ§os
 *   2. gerar_link_conexao â€” Gera link auto-login para conectar WhatsApp (QR Code)
 *   3. gerar_link_planos  â€” Gera link auto-login para pÃ¡gina de planos/assinatura
 *   4. editar_prompt      â€” Edita o prompt do agente IA do cliente
 *   5. salvar_midia       â€” Salva mÃ­dia na biblioteca do agente
 *   6. criar_agente       â€” Cria conta de teste + agente IA completo
 *   7. registrar_pagamento â€” Registra comprovante de pagamento PIX
 */

import { getMistralClient } from './mistralClient';
import { chatComplete, type ChatMessage } from './llm';
import { type PendingAction } from './actionExecutorV2';
import { getOrCreateSimulatorUrlForUser } from './actionExecutorV2';
import { executeActionWithTechnicalRetry } from './adminPendingActionExecutor';
import { storage } from './storage';
import { listarVersoes } from './promptHistoryService';
import { db } from './db';
import { agentMediaLibrary } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import {
  generateAdminMediaPromptBlock,
  parseAdminMediaTags,
  getAdminMediaList,
  getAdminMediaByName,
  type AdminMedia,
} from './adminMediaStore';
import { forceMediaDetection } from './mediaService';
import {
  buildAdminPlanReplyText,
  containsLegacyAdminPlanPricing,
  detectAdminPlanFocusFromText,
  isAdminPlanRequest,
} from './adminPlanPricing';
import {
  buildPendingActionRecoveryReply,
  getPendingActionExecutionPolicy,
  isTechnicalFailureMessage,
} from './adminPendingActionExecutionPolicy';
import { canConfirmSaveMediaPendingAction } from './adminPendingActionPolicy';
import { buildAdminPanelPitch, clampAdminReplyLength } from './adminReplyPolicy';

export interface PendingToolCallingMedia {
  url: string;
  type: 'image' | 'audio' | 'video' | 'document';
  description?: string;
  whenCandidate?: string;
  summary?: string;
}

export interface RecentToolCallingMedia {
  id: string;
  url: string;
  type: 'image' | 'audio' | 'video' | 'document';
  description?: string;
  summary?: string;
  receivedAt?: string;
}

interface ToolCallingMediaAction {
  type: 'send_media';
  media_name: string;
  mediaData?: AdminMedia;
}

function normalizeMediaFingerprint(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}

function extractSentAdminMediaNames(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  mediaLibrary: AdminMedia[],
): string[] {
  const sent = new Set<string>();

  for (const message of conversationHistory) {
    if (message.role !== 'assistant') continue;
    const content = String(message.content || '');
    const normalizedContent = normalizeMediaFingerprint(content);

    for (const media of mediaLibrary) {
      const normalizedName = normalizeMediaFingerprint(media.name);
      if (!normalizedName) continue;

      if (normalizedContent.includes(normalizedName)) {
        sent.add(normalizedName);
        continue;
      }

      if (media.storageUrl && content.includes(media.storageUrl)) {
        sent.add(normalizedName);
        continue;
      }

      const captionFingerprint = normalizeMediaFingerprint(media.caption);
      if (captionFingerprint && normalizedContent.includes(captionFingerprint)) {
        sent.add(normalizedName);
      }
    }
  }

  return Array.from(sent);
}

function shouldSkipAdminMediaSuggestion(params: {
  messageText: string;
  responseText: string;
}): boolean {
  const normalizedMessage = normalizeComparableText(params.messageText);
  const normalizedResponse = normalizeComparableText(params.responseText);
  const source = `${normalizedMessage} ${normalizedResponse}`;

  const mediaKeywords = ['midia', 'audio', 'video', 'imagem', 'foto', 'documento', 'arquivo'];
  const flowKeywords = ['fluxo', 'funil', 'sequencia', 'roteiro'];
  const configKeywords = ['salvar', 'cadastrar', 'configurar', 'organizar', 'montar'];

  const hasMediaIntent = mediaKeywords.some((keyword) => source.includes(keyword));
  const hasFlowIntent = flowKeywords.some((keyword) => source.includes(keyword));
  const hasConfigIntent = configKeywords.some((keyword) => source.includes(keyword));

  return hasMediaIntent && (hasFlowIntent || hasConfigIntent);
}

async function resolveAdminMediaActions(params: {
  responseText: string;
  messageText: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{
  responseText: string;
  mediaActions?: ToolCallingMediaAction[];
}> {
  const tagged = await resolveMediaActionsFromResponse(params.responseText);
  if (tagged.mediaActions?.length) {
    return tagged;
  }

  if (
    shouldSkipAdminMediaSuggestion({
      messageText: params.messageText,
      responseText: tagged.responseText,
    })
  ) {
    return tagged;
  }

  const mediaLibrary = await getAdminMediaList(undefined);
  const activeMediaLibrary = mediaLibrary.filter((media) => media.isActive !== false);
  if (!activeMediaLibrary.length) {
    return tagged;
  }

  const sentMedias = extractSentAdminMediaNames(params.conversationHistory, activeMediaLibrary);
  const forceResult = await forceMediaDetection(
    params.messageText,
    params.conversationHistory.map((item) => ({
      text: item.content,
      fromMe: item.role === 'assistant',
    })),
    activeMediaLibrary.map((media) => ({
      id: media.id,
      userId: media.adminId,
      name: media.name,
      mediaType: media.mediaType,
      type: media.mediaType,
      storageUrl: media.storageUrl,
      fileName: media.fileName || null,
      fileSize: media.fileSize || null,
      mimeType: media.mimeType || null,
      durationSeconds: media.durationSeconds || null,
      description: media.description,
      whenToUse: media.whenToUse || null,
      caption: media.caption || null,
      transcription: media.transcription || null,
      isActive: media.isActive,
      sendAlone: media.sendAlone,
      displayOrder: media.displayOrder,
      createdAt: new Date(media.createdAt),
      updatedAt: new Date(media.createdAt),
    })) as any,
    sentMedias,
    tagged.responseText,
  );

  if (!forceResult.shouldSendMedia || !forceResult.mediaToSend) {
    return tagged;
  }

  const mediaData =
    activeMediaLibrary.find(
      (media) => normalizeMediaFingerprint(media.name) === normalizeMediaFingerprint(forceResult.mediaToSend?.name),
    ) || (await getAdminMediaByName(undefined, forceResult.mediaToSend.name));

  if (!mediaData) {
    return tagged;
  }

  console.log(
    `[ToolCalling] Midia selecionada por classificacao secundaria: ${mediaData.name} | motivo=${forceResult.reason}`,
  );

  return {
    responseText: tagged.responseText,
    mediaActions: [
      {
        type: 'send_media',
        media_name: mediaData.name,
        mediaData,
      },
    ],
  };
}

async function resolveMediaActionsFromResponse(responseText: string): Promise<{
  responseText: string;
  mediaActions?: ToolCallingMediaAction[];
}> {
  const { cleanText, mediaActions } = parseAdminMediaTags(String(responseText || ''));
  if (!mediaActions.length) {
    return { responseText: cleanText };
  }

  const resolvedMediaActions: ToolCallingMediaAction[] = [];
  for (const action of mediaActions) {
    const mediaData = await getAdminMediaByName(undefined, action.media_name);
    if (!mediaData) continue;
    resolvedMediaActions.push({
      type: 'send_media',
      media_name: action.media_name,
      mediaData,
    });
  }

  return {
    responseText: cleanText,
    mediaActions: resolvedMediaActions.length > 0 ? resolvedMediaActions : undefined,
  };
}

function normalizeShortReply(text: string): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ');
}

function extractSimulatorUrlFromText(text: string): string | null {
  const tokens = String(text || '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const match = tokens.find((token) => token.includes('/test/'));
  return match || null;
}

function summarizeRecentMediaBuffer(recentMediaBuffer?: RecentToolCallingMedia[]): string {
  const items = Array.isArray(recentMediaBuffer) ? recentMediaBuffer.slice(-6) : [];
  if (!items.length) return '';

  const lines = items.map((item, index) => {
    const details = [
      `tipo=${item.type}`,
      item.summary ? `resumo=${item.summary}` : '',
      item.description ? `descricao=${item.description}` : '',
    ].filter(Boolean);

    return `${index + 1}. ${details.join('; ')}`;
  });

  return `\nArquivos recentes disponiveis para montar fluxo de midias:\n${lines.join('\n')}`;
}

function normalizeFlowItemsFromArgs(
  flowItems: unknown,
  recentMediaBuffer?: RecentToolCallingMedia[],
): Array<Record<string, any>> {
  if (!Array.isArray(flowItems)) return [];

  const recentItems = Array.isArray(recentMediaBuffer) ? recentMediaBuffer.slice(-6) : [];

  return flowItems
    .map((rawItem, index) => {
      const item = rawItem && typeof rawItem === 'object' ? { ...(rawItem as Record<string, any>) } : {};
      const type = String(item.type || '').trim().toLowerCase();
      if (type === 'text') {
        const text = String(item.text || '').trim();
        if (!text) return null;
        return {
          id: String(item.id || `flow-text-${index}`),
          order: index,
          type: 'text',
          text,
        };
      }

      if (type !== 'media') return null;

      const recentMediaIndex = Number(item.recentMediaIndex);
      const fromRecent =
        Number.isInteger(recentMediaIndex) &&
        recentMediaIndex >= 1 &&
        recentMediaIndex <= recentItems.length
          ? recentItems[recentMediaIndex - 1]
          : undefined;

      const storageUrl = String(item.storageUrl || item.mediaUrl || fromRecent?.url || '').trim();
      const mediaType = String(item.mediaType || fromRecent?.type || '').trim();

      if (!storageUrl || !mediaType) return null;

      return {
        id: String(item.id || fromRecent?.id || `flow-media-${index}`),
        order: index,
        type: 'media',
        storageUrl,
        mediaType,
        caption: String(item.caption || '').trim() || undefined,
        fileName: String(item.fileName || '').trim() || undefined,
        mimeType: String(item.mimeType || '').trim() || undefined,
      };
    })
    .filter((item): item is Record<string, any> => Boolean(item));
}

function summarizeFlowItemsForConfirmation(flowItems: Array<Record<string, any>>): string {
  return flowItems
    .map((item, index) => {
      if (item.type === 'text') {
        return `${index + 1}. Texto: ${String(item.text || '').trim()}`;
      }

      const mediaLabel = String(item.mediaType || 'midia').trim();
      const caption = String(item.caption || '').trim();
      return `${index + 1}. Midia ${mediaLabel}${caption ? ` (${caption})` : ''}`;
    })
    .join('\n');
}

function normalizeComparableText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extractQuotedTexts(value: string): Array<{ text: string; index: number }> {
  const source = String(value || '');
  const results: Array<{ text: string; index: number }> = [];
  const quoteChars = [`'`, `"`];

  for (const quoteChar of quoteChars) {
    let cursor = 0;

    while (cursor < source.length) {
      const start = source.indexOf(quoteChar, cursor);
      if (start === -1) break;

      const end = source.indexOf(quoteChar, start + 1);
      if (end === -1) break;

      const text = source.slice(start + 1, end).trim();
      if (text) {
        results.push({ text, index: start });
      }

      cursor = end + 1;
    }
  }

  return results.sort((a, b) => a.index - b.index);
}

function collectMediaMentions(
  messageText: string,
  recentMediaBuffer?: RecentToolCallingMedia[],
): Array<{ index: number; item: RecentToolCallingMedia }> {
  const normalizedMessage = normalizeComparableText(messageText);
  const recentItems = Array.isArray(recentMediaBuffer) ? recentMediaBuffer.slice(-6) : [];
  const mentions: Array<{ index: number; item: RecentToolCallingMedia }> = [];
  const usedIds = new Set<string>();

  const typeHints: Record<RecentToolCallingMedia['type'], string[]> = {
    audio: ['audio', 'audios'],
    video: ['video', 'videos'],
    image: ['imagem', 'imagens', 'foto', 'fotos'],
    document: ['documento', 'documentos', 'arquivo', 'arquivos', 'pdf'],
  };

  for (const mediaType of ['audio', 'video', 'image', 'document'] as const) {
    const candidates = recentItems.filter((item) => item.type === mediaType);
    if (!candidates.length) continue;

    let searchFrom = 0;
    for (const hint of typeHints[mediaType]) {
      let position = normalizedMessage.indexOf(hint, searchFrom);
      while (position !== -1) {
        const candidate = candidates.find((item) => !usedIds.has(item.id));
        if (!candidate) break;

        mentions.push({ index: position, item: candidate });
        usedIds.add(candidate.id);
        searchFrom = position + hint.length;
        position = normalizedMessage.indexOf(hint, searchFrom);
      }
    }
  }

  if (!mentions.length) {
    const genericHints = ['essa midia', 'esse arquivo', 'essa imagem', 'esse audio', 'esse video'];
    const genericMention = genericHints
      .map((hint) => ({ hint, index: normalizedMessage.indexOf(hint) }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index)[0];

    if (genericMention && recentItems.length) {
      mentions.push({ index: genericMention.index, item: recentItems[0] });
    }
  }

  return mentions.sort((a, b) => a.index - b.index);
}

export function inferFlowItemsHeuristically(params: {
  messageText?: string;
  recentMediaBuffer?: RecentToolCallingMedia[];
}): Array<Record<string, any>> {
  const messageText = String(params.messageText || '').trim();
  const recentMediaBuffer = Array.isArray(params.recentMediaBuffer) ? params.recentMediaBuffer.slice(-6) : [];
  if (!messageText || recentMediaBuffer.length === 0) return [];

  const timeline: Array<{ index: number; item: Record<string, any> }> = [];

  for (const quotedText of extractQuotedTexts(messageText)) {
    timeline.push({
      index: quotedText.index,
      item: {
        type: 'text',
        text: quotedText.text,
      },
    });
  }

  for (const mention of collectMediaMentions(messageText, recentMediaBuffer)) {
    timeline.push({
      index: mention.index,
      item: {
        type: 'media',
        recentMediaIndex: recentMediaBuffer.findIndex((item) => item.id === mention.item.id) + 1,
        mediaType: mention.item.type,
      },
    });
  }

  if (timeline.length < 2) {
    return [];
  }

  const ordered = timeline
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.item);

  return normalizeFlowItemsFromArgs(ordered, recentMediaBuffer);
}

async function inferFlowItemsFromMessage(params: {
  messageText?: string;
  recentMediaBuffer?: RecentToolCallingMedia[];
}): Promise<Array<Record<string, any>>> {
  const messageText = String(params.messageText || '').trim();
  const recentMediaBuffer = Array.isArray(params.recentMediaBuffer) ? params.recentMediaBuffer.slice(-6) : [];
  if (!messageText || recentMediaBuffer.length === 0) return [];

  const heuristicItems = inferFlowItemsHeuristically({ messageText, recentMediaBuffer });
  if (heuristicItems.length >= 2) {
    return heuristicItems;
  }

  const mediaContext = recentMediaBuffer
    .map((item, index) => `${index + 1}. tipo=${item.type}; descricao=${item.description || item.summary || 'sem descricao'}`)
    .join('\n');

  const prompt = `Voce recebe o pedido de um cliente para cadastrar um fluxo de midias no agente.

Pedido do cliente:
${messageText}

Arquivos recentes disponiveis:
${mediaContext}

Monte a sequencia do fluxo em ordem.

Regras:
- Use SOMENTE os arquivos recentes disponiveis.
- Para item de texto, retorne { "type": "text", "text": "..." }.
- Para item de midia, retorne { "type": "media", "recentMediaIndex": N, "mediaType": "audio|image|video|document", "caption": "..." }.
- Se o cliente citar "primeiro", "depois", "em seguida", respeite a ordem.
- Se houver um texto literal entre aspas, preserve esse texto.
- Nao invente itens que o cliente nao pediu.
- Se nao der para montar pelo menos 2 itens, retorne array vazio.

Responda SOMENTE com JSON valido:
{"flowItems":[...]} `;

  try {
    const response = await Promise.race([
      chatComplete({
        messages: [{ role: 'system', content: prompt }],
        maxTokens: 400,
        temperature: 0.1,
        skipMistralQueue: true,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout_infer_flow_items')), 8000),
      ),
    ]);

    const rawText = response.choices?.[0]?.message?.content || '';
    const jsonText = extractJsonObject(rawText);
    if (!jsonText) return [];
    const parsed = JSON.parse(jsonText) as { flowItems?: Array<Record<string, any>> };
    return Array.isArray(parsed.flowItems) ? parsed.flowItems : [];
  } catch (error) {
    console.warn('[ToolCalling] Falha ao inferir flowItems da mensagem:', error);
    return [];
  }
}

function extractPanelUrlFromText(text: string): string | null {
  const tokens = String(text || '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const match = tokens.find(
    (token) =>
      token.includes('agentezap.online') &&
      !token.includes('/test/') &&
      !token.includes('/plans') &&
      !token.includes('/conexao'),
  );

  return match || null;
}

function normalizeCreateAgentDeliveryText(text: string): string {
  const simulatorUrl = extractSimulatorUrlFromText(text);
  if (!simulatorUrl) {
    return clampAdminReplyLength(String(text || '').trim());
  }

  const panelUrl = extractPanelUrlFromText(text);
  const finalPanelUrl = panelUrl || 'https://agentezap.online/meu-agente-ia';

  return clampAdminReplyLength(
    `Criei seu teste.\n\nTeste: ${simulatorUrl}\n\n${buildAdminPanelPitch(finalPanelUrl)}\n\nAbre o teste e me fala se você quer assinar ou já conectar o seu WhatsApp.`,
  );
}

function normalizeSimulatorLinkDeliveryText(text: string): string {
  const simulatorUrl = extractSimulatorUrlFromText(text);
  if (!simulatorUrl) {
    return clampAdminReplyLength(String(text || '').trim());
  }

  const panelUrl = extractPanelUrlFromText(text);
  const finalPanelUrl = panelUrl || 'https://agentezap.online/meu-agente-ia';

  return clampAdminReplyLength(
    `Aqui está seu teste.\n\nTeste: ${simulatorUrl}\n\n${buildAdminPanelPitch(finalPanelUrl)}\n\nAbre o teste e me fala se você quer assinar ou conectar o seu WhatsApp.`,
  );
}

function normalizeActionExecutionResponseText(pendingAction: PendingAction, text: string): string {
  if (pendingAction.type === 'criar_agente') {
    return normalizeCreateAgentDeliveryText(text);
  }

  return String(text || '').trim();
}

function buildPendingActionClarificationReply(toolName: string): string {
  switch (toolName) {
    case 'editar_prompt':
      return 'Perfeito. Me diz em uma frase o que você quer mudar no agente que eu monto a proposta por aqui.';
    case 'salvar_midia':
      return 'Perfeito. Me confirma só o nome da mídia e quando ela deve ser enviada que eu sigo por aqui.';
    case 'registrar_pagamento':
      return 'Perfeito. Me confirma se esse arquivo é o comprovante do pagamento para eu passar ao setor responsável.';
    default:
      return 'Perfeito. Me passa o detalhe que falta e eu sigo por aqui.';
  }
}

async function executePendingActionWithSilentRetry(params: {
  pendingAction: PendingAction;
  executionUserId: string;
}): Promise<{
  ok: boolean;
  responseText: string;
  keepPendingAction?: PendingAction;
  consumedPendingMedia?: true;
}> {
  const { pendingAction, executionUserId } = params;
  const result = await executeActionWithTechnicalRetry(pendingAction, executionUserId);
  if (result.success) {
    return {
      ok: true,
      responseText: normalizeActionExecutionResponseText(pendingAction, result.responseText),
      consumedPendingMedia: pendingAction.type === 'save_media' ? true : undefined,
    };
  }

  const lastFailureText = String(result.responseText || '').trim();
  if (!result.lastFailureWasTechnical) {
    return {
      ok: false,
      responseText: lastFailureText || buildPendingActionRecoveryReply(pendingAction.type),
    };
  }

  const policy = getPendingActionExecutionPolicy(pendingAction.type);
  const refreshedPendingAction: PendingAction = {
    ...pendingAction,
    expiresAt: Date.now() + policy.keepPendingAliveMs,
  };

  console.warn(
    `[ToolCalling] PendingAction ${pendingAction.type} continua pendente após retries silenciosos. Última falha: ${lastFailureText || 'sem detalhe'}`,
  );

  return {
    ok: false,
    responseText: buildPendingActionRecoveryReply(pendingAction.type),
    keepPendingAction: refreshedPendingAction,
  };
}

function conversationHistoryHasSimulatorLink(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): boolean {
  return conversationHistory.some(
    (item) =>
      item.role === 'assistant' &&
      /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i.test(String(item.content || '')),
  );
}

async function shouldRescueSimulatorLinkWithLLM(params: {
  messageText: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  pendingAction: PendingAction;
}): Promise<boolean> {
  const { messageText, conversationHistory, pendingAction } = params;
  const cleanMessage = String(messageText || '').trim();
  if (!cleanMessage) return false;

  const historySummary = conversationHistory
    .slice(-8)
    .map((msg) => `${msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE'}: ${msg.content}`)
    .join('\n');

  const prompt = `Você analisa se o cliente está cobrando, pedindo ou retomando o LINK DE TESTE/SIMULADOR após uma criação já concluída.

Ação pendente:
- tipo: ${pendingAction.type}
- proposta anterior: ${pendingAction.proposedText || 'não informada'}

Conversa recente:
${historySummary || 'sem histórico'}

Mensagem atual:
${cleanMessage}

Responda SOMENTE com JSON válido:
{"rescue":true}
ou
{"rescue":false}

Use rescue=true quando a mensagem significar algo como:
- pedir o link de teste
- cobrar "cadê o link"
- dizer que quer testar agora
- pedir acesso ao simulador
- responder de forma curta depois da criação indicando que quer abrir/ver o teste

Use rescue=false quando:
- o cliente estiver cancelando
- trouxer uma nova instrução que muda a criação
- fizer uma pergunta que não seja sobre abrir/ver o teste agora`;

  try {
    const response = await chatComplete({
      messages: [{ role: 'system', content: prompt }],
      maxTokens: 80,
      temperature: 0.1,
      skipMistralQueue: true,
    });

    const rawText = response.choices?.[0]?.message?.content || '';
    const jsonText = extractJsonObject(rawText);
    if (!jsonText) return false;
    const parsed = JSON.parse(jsonText) as { rescue?: boolean };
    return parsed.rescue === true;
  } catch (error) {
    console.warn('[ToolCalling] Falha ao classificar resgate de link do simulador:', error);
    return false;
  }
}

function isExplicitPendingConfirmationReply(
  messageText: string,
  pendingAction: PendingAction,
): boolean {
  const normalized = normalizeShortReply(messageText);
  if (!normalized) return false;

  if (
    [
      'nao',
      'não',
      'cancel',
      'deixa',
      'esquece',
      'melhor nao',
      'melhor não',
    ].some((fragment) => normalized.includes(fragment))
  ) {
    return false;
  }

  const confirmationReplies = new Set([
    'sim',
    's',
    'ok',
    'okay',
    'pode',
    'pode sim',
    'isso',
    'isso mesmo',
    'exato',
    'correto',
    'certo',
    'perfeito',
    'fechou',
    'bora',
    'vamos',
    'confirmo',
    'confirma',
    'prosseguir',
    'pode prosseguir',
    'pode seguir',
    'segue',
    'seguir',
  ]);

  if (confirmationReplies.has(normalized)) {
    return true;
  }

  if (
    [
      'confirmo',
      'pode prosseguir',
      'pode seguir',
      'pode continuar',
      'pode salvar',
      'pode cadastrar',
      'pode inserir',
      'segue com',
      'prossegue com',
      'combinado',
    ].some((fragment) => normalized.includes(fragment))
  ) {
    return true;
  }

  if (
    pendingAction.type === 'criar_agente' &&
    (normalized === 'cria' || normalized === 'criar' || normalized === 'quero')
  ) {
    return true;
  }

  return false;
}

function isExplicitPendingCancelReply(messageText: string): boolean {
  const normalized = normalizeShortReply(messageText);
  if (!normalized) return false;

  const cancelReplies = new Set([
    'nao',
    'não',
    'cancelar',
    'cancela',
    'deixa',
    'deixa quieto',
    'deixa pra la',
    'deixa para la',
    'esquece',
    'melhor nao',
    'melhor não',
    'pare',
    'para',
  ]);

  if (cancelReplies.has(normalized)) {
    return true;
  }

  return [
    'nao quero',
    'não quero',
    'deixa pra la',
    'deixa para la',
    'pode parar',
    'cancela isso',
  ].some((fragment) => normalized.includes(fragment));
}

function buildHumanFallbackReply(params: {
  messageText: string;
  userId?: string;
  pendingAction?: PendingAction;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}): string {
  const { messageText, userId, pendingAction, conversationHistory } = params;

  if (pendingAction?.proposedText) {
    return pendingAction.proposedText;
  }

  const trimmed = String(messageText || '').trim();
  if (!trimmed) {
    return 'Me fala em uma frase o que você quer colocar para rodar no WhatsApp que eu sigo por aqui.';
  }

  if (userId) {
    if (conversationHistoryHasSimulatorLink(conversationHistory)) {
      return 'Tive uma instabilidade rápida aqui. Me diz se você quer testar o agente ou ajustar alguma parte dele que eu continuo daqui.';
    }
    return 'Tive uma instabilidade rápida aqui. Me diz em uma frase o que você quer ajustar que eu sigo por aqui.';
  }

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    const company = lines[0];
    const focus = lines.slice(1, 3).join(', ');
    return `Entendi. Seu foco é ${company}${focus ? `, com ${focus}` : ''}. Se for isso mesmo, eu monto seu teste e te entrego pronto. Posso prosseguir?`;
  }

  return 'Entendi. Me confirma só o nome do negócio e o que você quer colocar para rodar no WhatsApp que eu sigo por aqui.';
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tool Definitions (Mistral Function Calling format)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'informar_planos',
      description:
        'Retorna a tabela de planos disponÃ­veis do AgenteZap com preÃ§os e recursos. Use quando o cliente perguntar sobre preÃ§os, planos, quanto custa, assinatura, etc.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'gerar_link_conexao',
      description:
        'Gera um link de auto-login direto para a pÃ¡gina de conexÃ£o do WhatsApp (QR Code). Use quando o cliente quiser conectar o WhatsApp, escanear QR Code, parear nÃºmero, etc.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'gerar_link_planos',
      description:
        'Gera um link de auto-login direto para a pÃ¡gina de planos/assinatura. Use quando o cliente quiser assinar, ativar um plano, pagar, ou pedir o link de assinatura. O cliente clica e jÃ¡ entra logado na pÃ¡gina de planos.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'editar_prompt',
      description:
        'Edita/calibra o prompt do agente IA do cliente com base numa instruÃ§Ã£o de mudanÃ§a. Use quando o cliente pedir para mudar comportamento, tom, adicionar instruÃ§Ãµes, etc.',
      parameters: {
        type: 'object' as const,
        properties: {
          descricaoMudanca: {
            type: 'string' as const,
            description: 'DescriÃ§Ã£o detalhada da mudanÃ§a desejada no prompt do agente.',
          },
        },
        required: ['descricaoMudanca'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'salvar_midia',
      description:
        'Salva uma mÃ­dia simples OU um fluxo de mÃ­dias/textos na biblioteca do agente para uso automÃ¡tico. Use somente quando o cliente pedir explicitamente para cadastrar ou usar esse arquivo/fluxo no agente e informar quando ele deve ser enviado.',
      parameters: {
        type: 'object' as const,
        properties: {
          name: {
            type: 'string' as const,
            description: 'Nome descritivo da mÃ­dia (ex: "CardÃ¡pio", "Foto da loja").',
          },
          mediaUrl: {
            type: 'string' as const,
            description: 'URL da mÃ­dia enviada pelo cliente.',
          },
          mediaType: {
            type: 'string' as const,
            description: 'Tipo da mÃ­dia: image, video, audio, document ou flow. Use flow quando o cliente quiser uma sequencia/funil com varias midias e textos.',
          },
          whenToUse: {
            type: 'string' as const,
            description: 'Contexto de quando o agente deve usar essa mÃ­dia (ex: "quando pedirem cardÃ¡pio").',
          },
          description: {
            type: 'string' as const,
            description: 'DescriÃ§Ã£o breve da mÃ­dia.',
          },
          flowItems: {
            type: 'array' as const,
            description: 'Somente para mediaType=flow. Sequencia ordenada do funil. Cada item pode ser texto ({type:"text", text:"..."}) ou midia ({type:"media", recentMediaIndex:1, mediaType:"audio", caption:"..."}). recentMediaIndex referencia um dos arquivos recentes listados no contexto.',
            items: {
              type: 'object' as const,
              properties: {
                type: { type: 'string' as const },
                text: { type: 'string' as const },
                recentMediaIndex: { type: 'number' as const },
                mediaUrl: { type: 'string' as const },
                storageUrl: { type: 'string' as const },
                mediaType: { type: 'string' as const },
                caption: { type: 'string' as const },
                fileName: { type: 'string' as const },
                mimeType: { type: 'string' as const },
              },
              required: ['type'],
            },
          },
        },
        required: ['name', 'whenToUse'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'criar_agente',
      description:
        'Cria uma conta de teste gratuita com um agente IA personalizado para o negÃ³cio do cliente. Use quando jÃ¡ tiver informaÃ§Ãµes suficientes sobre o negÃ³cio (nome da empresa, tipo de atendimento) e o cliente quiser testar ou criar o agente. TambÃ©m use quando o cliente disser que quer experimentar, testar, criar seu agente, etc.',
      parameters: {
        type: 'object' as const,
        properties: {
          nomeEmpresa: {
            type: 'string' as const,
            description: 'Nome da empresa/negÃ³cio do cliente.',
          },
          ramoAtuacao: {
            type: 'string' as const,
            description: 'Ramo de atuaÃ§Ã£o (ex: pizzaria, barbearia, loja de roupas, clÃ­nica).',
          },
          descricaoAtendimento: {
            type: 'string' as const,
            description: 'Como o agente deve se comportar, o que deve responder, tom de voz, etc.',
          },
        },
        required: ['nomeEmpresa'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'registrar_pagamento',
      description:
        'Prepara o registro oficial no sistema de um comprovante de pagamento PIX enviado neste chat e faz ele aparecer em /admin#receipts depois da confirmacao final do cliente. Use SOMENTE quando o cliente realmente anexar o comprovante por aqui (imagem ou PDF). Se o cliente apenas disser que pagou, sem anexo, nao use esta ferramenta.',
      parameters: {
        type: 'object' as const,
        properties: {
          comprovanteUrl: {
            type: 'string' as const,
            description: 'URL do comprovante enviado pelo cliente neste chat, de preferencia imagem ou PDF.',
          },
          valorInformado: {
            type: 'string' as const,
            description: 'Valor informado pelo cliente (se mencionado).',
          },
          planoEscolhido: {
            type: 'string' as const,
            description: 'Plano escolhido pelo cliente (starter, pro, business).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'gerar_link_simulador',
      description:
        'Gera o link do simulador de teste do agente IA do cliente. Use quando o cliente pedir para testar o agente, ver o simulador, link de teste, ou quiser experimentar como o agente atende. O link abre o simulador onde o cliente pode conversar com o agente como se fosse um cliente real dele.',
      parameters: {
        type: 'object' as const,
        properties: {},
        required: [] as string[],
      },
    },
  },
];

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// System Prompt
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildToolCallingSystemPrompt(
  phoneNumber: string,
  userId: string | undefined,
  contextInfo: {
    accountStatus?: string;
    promptSummary?: string;
    mediaLibrarySummary?: string;
    mediaPromptBlock?: string;
    agentConfig?: { name?: string; company?: string; role?: string };
    pendingMedia?: PendingToolCallingMedia;
    recentMediaBuffer?: RecentToolCallingMedia[];
    contactName?: string;
    hasDeliveredTestLink?: boolean;
  },
): string {
  const isExistingClient = Boolean(userId);
  const normalizedAccountStatus = (contextInfo.accountStatus || '').toLowerCase();
  const firstName = (contextInfo.contactName || '').trim().split(/\s+/)[0] || '';
  const hasActiveSubscription =
    normalizedAccountStatus.includes('(ativo)') ||
    normalizedAccountStatus.includes('plano ativo') ||
    normalizedAccountStatus.includes('assinatura ativa');

  const accountCtx = contextInfo.accountStatus
    ? `\nStatus da conta: ${contextInfo.accountStatus}`
    : '\nCliente ainda nÃ£o tem conta (novo lead).';

  const promptCtx = contextInfo.promptSummary
    ? `\nPrompt do agente: ${contextInfo.promptSummary}`
    : '';

  const mediaLibCtx = contextInfo.mediaLibrarySummary
    ? `\nBiblioteca de mÃ­dia: ${contextInfo.mediaLibrarySummary}`
    : '';
  const mediaPromptCtx = contextInfo.mediaPromptBlock
    ? `\n${contextInfo.mediaPromptBlock}`
    : '';

  const companyCtx = contextInfo.agentConfig?.company
    ? `\nEmpresa do cliente: ${contextInfo.agentConfig.company}`
    : '';

  const contactCtx = firstName
    ? `\nNome do cliente no WhatsApp: ${firstName}`
    : '';

  const pendingMediaCtx = contextInfo.pendingMedia
    ? `\nArquivo recente disponÃ­vel no contexto: tipo=${contextInfo.pendingMedia.type}; descriÃ§Ã£o=${contextInfo.pendingMedia.description || 'nÃ£o informada'}; contexto sugerido=${contextInfo.pendingMedia.whenCandidate || 'ainda nÃ£o definido'}. Use essa URL interna na ferramenta salvar_midia SOMENTE se o cliente pedir explicitamente para cadastrar ou usar esse arquivo no agente. Caso contrÃ¡rio, ignore esse arquivo e siga a conversa normal.`
    : '';
  const recentMediaCtx = summarizeRecentMediaBuffer(contextInfo.recentMediaBuffer);
  const deliveredTestCtx = contextInfo.hasDeliveredTestLink
    ? '\nHistorico recente: este cliente ja recebeu link de teste/simulador nesta conversa.'
    : '';

  const clientTypeInstructions = isExistingClient
    ? `
CLIENTE EXISTENTE (jÃ¡ tem conta):
- Este cliente JÃ tem conta e agente criado. NUNCA ofereÃ§a ou use criar_agente.
- Foco: ajudar com configuraÃ§Ã£o, ediÃ§Ã£o de prompt, cadastro de mÃ­dias, planos e conexÃ£o do WhatsApp.
- ${hasActiveSubscription
      ? 'Este cliente JÃ tem plano ativo. NÃƒO ofereÃ§a assinatura, pagamento, preÃ§o ou link de planos por iniciativa prÃ³pria. SÃ³ fale de plano se ele pedir explicitamente sobre cobranÃ§a, renovaÃ§Ã£o, upgrade, pagamento, comprovante ou outro tema comercial.'
      : 'Se ele pedir ou demonstrar intenÃ§Ã£o clara de assinar, pagar, renovar ou ver preÃ§os, use gerar_link_planos para enviar o link com auto-login.'}
- Se ele pedir mudanÃ§as no agente, use editar_prompt diretamente.
- Se quiser assinar um plano, use gerar_link_planos para enviar o link com auto-login.
- Se quiser conectar o WhatsApp, use gerar_link_conexao.
- ApÃ³s editar o prompt, sempre informe o link do simulador para testar as mudanÃ§as.
- Se o cliente pedir para testar o agente ou pedir o link do simulador, use gerar_link_simulador.`
    : `
CLIENTE NOVO (sem conta):
- Este Ã© um lead novo. Apresente-se brevemente como Rodrigo, Inteligencia Artificial da AgenteZap.
- Se houver nome no WhatsApp, use esse nome com naturalidade logo na primeira resposta.
- Primeiro entenda a dÃºvida, interesse ou contexto do cliente. SÃ³ depois conduza para a criaÃ§Ã£o do teste.
- Fale de forma curta, humana e fÃ¡cil de entender. Evite texto longo explicando a plataforma inteira logo de saÃ­da.
- A primeira resposta deve seguir esta linha: "Boa tarde, tudo bem, Rafael? Rodrigo da AgenteZAP aqui. Me conta: o que você faz hoje? Vendas, atendimento ou qualificação?" Se não houver nome, fale sem nome.
- NUNCA invente nome. Use o nome somente se ele estiver no contexto real do WhatsApp. Sem nome no contexto, fale sem nome.
- NUNCA use placeholder em resposta final, como NOME_DO_CLIENTE, [seu nome] ou equivalente.
- Mesmo que a mensagem inicial venha falando de R$49, interesse no anúncio ou pedido genérico de informação, a abertura continua curta e focada em entender o negócio dele. Não puxe preço logo na primeira resposta.
- A segunda resposta deve ser curta e mais vendedora: primeiro mostre o principal beneficio para o ramo do cliente em linguagem simples, depois diga que no sistema ele encontra CRM, conversas, kanban, notificador inteligente, follow-up, fluxos e conexao do WhatsApp. Em seguida diga que ele pode ver tudo em https://agentezap.online/ ou testar direto por um link real. So fale em configuracao assistida se o cliente pedir isso explicitamente. Feche com uma pergunta curta para avancar no sistema, como testar agora ou conhecer por dentro.
- A segunda resposta nao deve usar lista, bullets ou menu. Use no maximo 2 ou 3 frases curtas.
- Se o cliente preferir criar sozinho, informe de forma objetiva o site: https://agentezap.online/
- Se o cliente ja tiver conta e pedir para ele mesmo ajustar, editar, configurar ou arrumar, responda de forma curta com o painel em https://agentezap.online/meu-agente-ia e diga que voce tambem pode continuar ajudando por aqui.
- Na primeira resposta, seja curto: no maximo 2 frases curtas e uma pergunta simples.
- Se o cliente mandar "teste" ou "quero testar", interprete como desejo de ver funcionando na pratica, e nao como piada ou meta-comentario.
- SÃ³ proponha a criaÃ§Ã£o do agente quando houver interesse claro em testar, configurar ou criar. Se o cliente apenas disser o que faz, continue a conversa e explique rapidamente como o teste ajuda. Nunca crie conta sÃ³ porque jÃ¡ tem dados suficientes.
- NÃ£o peÃ§a informaÃ§Ãµes demais: o mÃ­nimo Ã© o nome da empresa. Ramo e descriÃ§Ã£o entram conforme a conversa evoluir.`;
  return `VocÃª Ã© o Rodrigo, Inteligencia Artificial da AgenteZap, uma plataforma que permite criar agentes de IA para atendimento via WhatsApp.

Seu papel:
- Receber leads interessados em automaÃ§Ã£o de atendimento
- Entender o negÃ³cio do cliente (nome, ramo, como quer que o agente atenda)
- Quando tiver informaÃ§Ãµes suficientes, usar a ferramenta criar_agente para gerar uma conta de teste gratuita
- Ajudar clientes ativos a configurar e calibrar seu agente
- Responder dÃºvidas sobre planos e preÃ§os
- Enviar links com auto-login para assinar plano (gerar_link_planos) e conectar WhatsApp (gerar_link_conexao)

InformaÃ§Ãµes do contexto:
Telefone: ${phoneNumber}
${userId ? `UserId: ${userId}` : 'Sem conta criada'}${accountCtx}${promptCtx}${mediaLibCtx}${mediaPromptCtx}${companyCtx}${contactCtx}${pendingMediaCtx}${recentMediaCtx}${deliveredTestCtx}
${clientTypeInstructions}

REGRAS IMPORTANTES:
1. Seja natural, empÃ¡tico e conversacional, como um atendente humano real
2. NUNCA mencione JSON, ferramentas, tool_calls, parÃ¢metros ou termos tÃ©cnicos internos
3. Use as ferramentas disponÃ­veis quando a situaÃ§Ã£o exigir. Para informar_planos, gerar_link_conexao e gerar_link_planos: execute direto. Para criar_agente, editar_prompt, salvar_midia e registrar_pagamento: SEMPRE peÃ§a confirmaÃ§Ã£o antes (veja regra 5). Para registrar_pagamento: sÃ³ use se houver comprovante realmente anexado nesta conversa.
4. Para CRIAR AGENTE: colete pelo menos o nome da empresa antes. Quando entender o que o cliente quer, primeiro resuma o que vai criar e peÃ§a confirmaÃ§Ã£o. Nunca crie direto sem confirmaÃ§Ã£o explÃ­cita.
5. Para CRIAR AGENTE, EDITAR PROMPT ou SALVAR MÃDIA: SEMPRE confirme com o cliente ANTES de executar. Diga o que pretende fazer e pergunte "Posso prosseguir?" ou "Confirma?". SÃ³ execute DEPOIS que o cliente confirmar. NUNCA crie, edite ou salve sem confirmaÃ§Ã£o explÃ­cita.
6. Para clientes NOVOS: apresente-se brevemente, pergunte sobre o negÃ³cio, e quando tiver informaÃ§Ã£o suficiente, proponha a criaÃ§Ã£o do agente e peÃ§a confirmaÃ§Ã£o.
7. Para clientes que jÃ¡ TÃŠM CONTA: ajude com configuraÃ§Ãµes, ediÃ§Ãµes de prompt, mÃ­dia, planos
8. NUNCA use emojis, emoticons ou simbolos decorativos na resposta ao cliente
8A. NUNCA use travessÃ£o ou em dash (â€”) na resposta ao cliente. Prefira vÃ­rgula, ponto, dois-pontos ou parÃªnteses.
9. Se a intenÃ§Ã£o nÃ£o estiver clara, faÃ§a UMA pergunta aberta â€” nunca liste opÃ§Ãµes como menu
10. Adapte o tom: acolhedor com novos, prestativo com ativos, direto com quem tem pressa
10A. Use o nome do cliente quando ele estiver no contexto, sobretudo na primeira resposta ou quando quiser soar mais prÃ³ximo
10B. Quando o cliente trouxer uma dÃºvida objetiva, responda a dÃºvida antes de convidar para criar conta
10C. Evite comeÃ§ar respostas com "nÃ£o". Prefira caminhos positivos e naturais
10D. Seja breve e profissional. Evite texto longo, lista grande e floreio. O ideal e responder como um vendedor humano no WhatsApp.
10E. Se o cliente ja estiver em conversa de teste ou ja tiver recebido simulador, foque em orientar o proximo passo. Nao volte para a pergunta inicial do negocio.
10F. Na primeira abordagem, use no maximo 3 linhas curtas e uma unica pergunta objetiva.
10G. Antes de criar a conta, tire as dúvidas principais do cliente e sinta o interesse real. Só proponha criar quando ele demonstrar que quer testar.
10G.1. Se o cliente já disse que quer testar, criar ou ver funcionando, não volte para perguntas genéricas. Aproveite o que ele já informou na conversa, confirme o que entendeu e avance.
10G.1A. Se o cliente disser que quer testar, mas ainda não deixou claro o próximo passo, priorize avançar para o teste e para o site. Só ofereça configuração assistida se ele pedir explicitamente que vocês montem por ele.
10G.2. Se o cliente pedir o link de teste, simulador ou cobrar "cadê o link", entregue o link real na mesma resposta usando a ferramenta correta. Não volte a pedir nome da empresa se isso já apareceu no contexto.
10G.3. Se o cliente perguntar como saber se está ativo, responda objetivamente como conferir IA ligada e WhatsApp conectado. Não diga que vai editar nada.
10G.4. Se o cliente pedir humano, call ou suporte, explique em uma frase o que você resolve por aqui e passe o número do suporte humano: +55 17 99164-8288.
10H. Quando entregar o link do teste, seja curto: diga para ele abrir, conversar com o agente e falar o que quer ajustar. Se fizer sentido, avise que ele também pode conectar o WhatsApp ainda no teste gratuito.
11. NUNCA diga "aguarde", "espere", "um momento" ou "jÃ¡ busco" â€” os resultados das ferramentas chegam INSTANTANEAMENTE. Quando chamar uma ferramenta, INCLUA o resultado dela diretamente na sua resposta final. Ex: se chamou informar_planos, apresente os planos na mesma mensagem.
12. ApÃ³s executar uma ferramenta, SEMPRE apresente o resultado completo ao cliente na mesma mensagem. Nunca diga que vai buscar algo sem mostrar o resultado.
13. ApÃ³s informar os planos, OFEREÃ‡A enviar o link direto para assinar usando gerar_link_planos (se o cliente tiver conta e NÃƒO tiver plano ativo, ou se ele estiver pedindo explicitamente algo comercial como renovaÃ§Ã£o, upgrade ou pagamento).
13A. Preco comercial do admin: mensal padrao *R$99/mes* e anual promocional *R$599*.
13A.0. Se o cliente vier do anuncio/oferta de *R$49* ou retomar claramente essa oferta na conversa, use *R$49 por mes* e envie o link promocional https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e.
13A.1. Se o cliente estiver descrevendo o funil dele, um roteiro de atendimento, uma sequencia com audio, video, imagens, depoimentos, tempo de espera ou automacao, nao trate palavras como "valor", "plano" ou "assinatura" como pergunta sobre o preco da AgenteZap. Nesses casos, responda a configuracao que ele quer fazer.
13A.2. Se o cliente perguntar so de preco, valor, assinatura ou plano sem citar anual, responda somente o mensal. Use *R$49 por mes* apenas no contexto da oferta de 49. Nos demais casos, use *R$99 por mes*.
13A.3. So mencione o anual promocional de *R$599* quando o cliente perguntar do anual.
13A.4. Nao fale de cupom por conta propria. So explique diferenca de preco do site se o cliente perguntar diretamente.
13B. Se o cliente demonstrar intenção clara de assinar, fechar, pagar ou pedir link de planos, chame gerar_link_planos na mesma resposta. Não deixe para depois. Se o cliente já tiver plano ativo, só faça isso quando ele pedir explicitamente algo comercial.
13C. Ao enviar link de planos, envie SOMENTE o link de planos retornado pela ferramenta. NÃ£o acrescente link de conexÃ£o, painel ou qualquer outro link, a menos que o cliente peÃ§a.
13D. NUNCA use links em markdown no formato [texto](url). Escreva a URL pura exatamente como veio da ferramenta.
14. NUNCA diga que ativou, liberou ou assinou o plano do cliente sem aÃ§Ã£o real do sistema. A ativaÃ§Ã£o exige pagamento no site. Se o cliente sÃ³ disser que pagou, reenvie o link de planos e oriente clicar em "Eu jÃ¡ paguei". SÃ³ use registrar_pagamento quando houver comprovante anexado nesta conversa e confirme antes de registrar.
15. ApÃ³s criar ou editar o agente, SEMPRE inclua o link do simulador para o cliente testar as mudanÃ§as. O link do simulador Ã© o que vem no resultado da ferramenta (formato /test/TOKEN). NÃƒO substitua por link de planos.
16. PROIBIDO FABRICAR URLs: NUNCA invente, crie ou escreva URLs manualmente. Links de planos, conexÃ£o e simulador sÃ£o gerados EXCLUSIVAMENTE pelas ferramentas gerar_link_planos, gerar_link_conexao e criar_agente. Se o cliente pedir um link, CHAME a ferramenta correspondente â€” NUNCA escreva uma URL por conta prÃ³pria.
17. Se o cliente pedir link para PLANOS/ASSINATURA â†’ chame gerar_link_planos. Se pedir link para CONEXÃƒO/WHATSAPP â†’ chame gerar_link_conexao. Se pedir para TESTAR/SIMULADOR â†’ chame gerar_link_simulador. Se pedir para CRIAR CONTA â†’ chame criar_agente. SEMPRE use a ferramenta, NUNCA gere o link na mensagem.
18. URLs vÃ¡lidas SOMENTE vÃªm do resultado das ferramentas. Qualquer URL que vocÃª escrever diretamente serÃ¡ INVÃLIDA e causarÃ¡ erro para o cliente.
19. Quando o resultado de uma ferramenta contiver URLs, copie-as EXATAMENTE como estÃ£o. NUNCA modifique, reescreva ou substitua as URLs retornadas pelas ferramentas.
20. Apos criar_agente, entregue de forma curta que o teste foi criado, mande o link do simulador (/test/TOKEN) e diga que ele pode testar e depois conectar o WhatsApp ainda no teste gratuito. Nao envie email e senha por iniciativa propria. So envie acesso interno se o cliente pedir painel, login, CRM ou credenciais.
20A. Se o cliente ainda NAO tem conta e enviar audio, imagem, video ou documento durante o onboarding, trate isso apenas como contexto do negocio. Nao entre em cadastro de midia e nao pergunte quando o agente deve usar esse arquivo, a menos que o lead peca explicitamente para cadastrar essa midia.
20B. Se o cliente ja tem conta e responder de forma vaga logo apos receber link de teste ou credenciais, trate isso como pedido de ajuda com acesso. Nesse caso, chame gerar_link_simulador e entregue o link novo na mesma resposta. NUNCA diga que vai gerar depois ou que esta gerando sem trazer o resultado da ferramenta.
20C. Se o cliente já te passou nome da empresa, ramo ou objetivo e depois disser "pode criar", "quero testar", "agora cria" ou equivalente, não reinicie o questionário. Confirme o resumo e avance para a criação.

CADASTRO DE MIDIAS:
21. Receber Ã¡udio, imagem, vÃ­deo ou documento NÃƒO significa pedido de cadastrar mÃ­dia. Por padrÃ£o, trate a transcriÃ§Ã£o/conteÃºdo como conversa normal.
22. SÃ³ entre em cadastro de mÃ­dia se o cliente pedir EXPLICITAMENTE para cadastrar, adicionar, salvar, anexar ou fazer o agente usar aquele arquivo, ou se existir "MÃ­dia pendente ainda nÃ£o salva" no contexto e o cliente estiver completando os dados dessa mÃ­dia.
23. Se a mÃ­dia foi enviada apenas para explicar algo sobre o negÃ³cio ou pedir uma alteraÃ§Ã£o no agente, siga o fluxo normal da conversa. NÃƒO pergunte sobre nome da mÃ­dia nem quando usar.
23A. Quando a mÃ­dia for sÃ³ o meio pelo qual o cliente falou com vocÃª, NÃƒO mencione o arquivo na resposta. Responda apenas Ã  intenÃ§Ã£o principal do cliente.
24. Quando houver pedido explÃ­cito de cadastro, pergunte o nome da mÃ­dia e em qual situaÃ§Ã£o o agente deve enviÃ¡-la.
25. Quando tiver o nome e o contexto de uso, CONFIRME com o cliente antes de salvar (regra 5). Ao salvar, preencha TODOS os campos: name (nome descritivo), whenToUse (quando o agente deve enviar esta mÃ­dia â€” esse campo Ã© OBRIGATÃ“RIO), description (descriÃ§Ã£o do conteÃºdo), mediaType (image/audio/video/document).
26. A URL da mÃ­dia jÃ¡ Ã© preenchida automaticamente pelo sistema â€” NÃƒO invente URLs de mÃ­dia. Se o campo mediaUrl nÃ£o vier automaticamente, peÃ§a ao cliente para reenviar a mÃ­dia.
27. Para clientes que jÃ¡ tÃªm conta, o userId Ã© usado automaticamente. A mÃ­dia fica vinculada ao agente do cliente.
28. Se existir "MÃ­dia pendente ainda nÃ£o salva" no contexto, isso significa que o arquivo jÃ¡ foi recebido e a URL interna jÃ¡ estÃ¡ disponÃ­vel. Se o cliente responder com nome, descriÃ§Ã£o, quando usar, ou confirmar o salvamento, chame salvar_midia neste turno usando essa mÃ­dia pendente.
29. Se o cliente quiser montar um funil/sequencia com varias midias e textos, use salvar_midia com mediaType="flow" e preencha flowItems na ordem correta. Para itens de midia, use recentMediaIndex apontando para os arquivos recentes do contexto.
30. NUNCA diga que a mÃ­dia ou o fluxo foi salvo, configurado ou adicionado Ã  biblioteca se vocÃª nÃ£o chamou salvar_midia com sucesso neste turno.`;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Context gathering
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function gatherClientContext(userId: string | undefined): Promise<{
  accountStatus?: string;
  promptSummary?: string;
  mediaLibrarySummary?: string;
  mediaPromptBlock?: string;
}> {
  const ctx: {
    accountStatus?: string;
    promptSummary?: string;
    mediaLibrarySummary?: string;
    mediaPromptBlock?: string;
  } = {};

  try {
    const mediaPromptBlock = await generateAdminMediaPromptBlock(undefined);
    if (mediaPromptBlock?.trim()) {
      ctx.mediaPromptBlock = mediaPromptBlock.trim();
    }
  } catch (e) {
    console.warn('[ToolCalling] Erro ao montar prompt detalhado de mÃ­dia do admin:', e);
  }

  if (!userId) return ctx;

  try {
    const subscription = await storage.getUserSubscription(userId);
    if (subscription && subscription.plan) {
      ctx.accountStatus = `${(subscription.plan as any).name || (subscription.plan as any).planName || 'Ativo'} (ativo)`;
    } else {
      ctx.accountStatus = 'Conta criada (plano gratuito de teste)';
    }
  } catch (e) {
    console.warn('[ToolCalling] Erro ao buscar assinatura:', e);
  }

  try {
    const versions = await listarVersoes(userId);
    if (versions && versions.length > 0) {
      const current = versions.find((v: any) => v.is_current) || versions[0];
      const versionNumber = (current as any).version_number || versions.length;
      ctx.promptSummary = `${versions.length} versÃ£o${versions.length > 1 ? 's' : ''} (v${versionNumber} atual)`;
    } else {
      ctx.promptSummary = 'Nenhuma versÃ£o registrada';
    }
  } catch (e) {
    console.warn('[ToolCalling] Erro ao buscar versÃµes de prompt:', e);
  }

  try {
    const mediaRecords = await db
      .select()
      .from(agentMediaLibrary)
      .where(eq(agentMediaLibrary.userId, userId))
      .orderBy(desc(agentMediaLibrary.id))
      .limit(5);

    if (mediaRecords && mediaRecords.length > 0) {
      const names = mediaRecords.map((m: any) => m.name).join(', ');
      ctx.mediaLibrarySummary = `${mediaRecords.length} mÃ­dia${mediaRecords.length > 1 ? 's' : ''} (${names})`;
    } else {
      ctx.mediaLibrarySummary = 'Nenhuma mÃ­dia salva';
    }
  } catch (e) {
    console.warn('[ToolCalling] Erro ao buscar biblioteca de mÃ­dia:', e);
  }

  return ctx;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// URL fabrication detection â€” replaces hallucinated URLs with warning
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const APP_DOMAIN = (process.env.APP_URL || 'https://agentezap.online').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const APP_BASE_URL = process.env.APP_URL || 'https://agentezap.online';

interface SanitizeResult {
  text: string;
  hadFabricatedPlansUrl: boolean;
  hadFabricatedConexaoUrl: boolean;
  hadFabricatedSimulatorUrl: boolean;
}

const PLANS_LINK_PLACEHOLDER = '{{PLANS_LINK_PLACEHOLDER}}';
const CONEXAO_LINK_PLACEHOLDER = '{{CONEXAO_LINK_PLACEHOLDER}}';
const SIMULATOR_LINK_PLACEHOLDER = '{{SIMULATOR_LINK_PLACEHOLDER}}';
const UUID_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIMULATOR_TOKEN_PATTERN = /^[a-f0-9]{16,}$/i;

function firstNonEmptyString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function getPlaceholderForLinkType(type: 'plans' | 'conexao' | 'simulator'): string {
  if (type === 'plans') return PLANS_LINK_PLACEHOLDER;
  if (type === 'conexao') return CONEXAO_LINK_PLACEHOLDER;
  return SIMULATOR_LINK_PLACEHOLDER;
}

function buildPendingConfirmationAction(
  toolName: string,
  toolArgs: Record<string, any>,
  phoneNumber: string,
): PendingAction | null {
  if (toolName === 'criar_agente') {
    const companyName = String(
      toolArgs.nomeEmpresa ||
      toolArgs.companyName ||
      toolArgs.company ||
      toolArgs.businessName ||
      toolArgs.nomeNegocio ||
      '',
    ).trim();
    const businessSegment = String(
      toolArgs.ramoAtuacao ||
      toolArgs.businessSegment ||
      toolArgs.businessType ||
      toolArgs.segment ||
      toolArgs.ramo ||
      '',
    ).trim();
    const serviceDescription = String(
      toolArgs.descricaoAtendimento ||
      toolArgs.attendanceDescription ||
      toolArgs.promptDescription ||
      toolArgs.instructions ||
      toolArgs.prompt ||
      '',
    ).trim();

    if (!companyName) return null;

    const details = [
      `Empresa: ${companyName}`,
      businessSegment ? `Ramo/segmento: ${businessSegment}` : '',
      serviceDescription ? `Como o agente deve atuar: ${serviceDescription}` : '',
    ].filter(Boolean);

    return {
      type: 'criar_agente',
      payload: { ...toolArgs, phoneNumber },
      proposedText:
        `Perfeito. Antes de criar seu teste, deixa eu confirmar se entendi certo:\n\n${details.join('\n')}\n\nSe for isso mesmo, eu crio e já te entrego o link para testar. Posso prosseguir?`,
      expiresAt: Date.now() + 10 * 60_000,
    };
  }

  if (toolName === 'editar_prompt') {
    const descricaoMudanca = String(toolArgs.descricaoMudanca || '').trim();
    if (!descricaoMudanca) return null;

    return {
      type: 'edit_prompt',
      payload: { ...toolArgs, phoneNumber },
      proposedText:
        `Entendi. Vou atualizar seu agente com esta mudanÃ§a:\n\n${descricaoMudanca}\n\nPosso prosseguir?`,
      expiresAt: Date.now() + 10 * 60_000,
    };
  }

  if (toolName === 'salvar_midia') {
    const mediaName = String(toolArgs.name || 'essa mÃ­dia').trim() || 'essa mÃ­dia';
    const mediaUrl = firstNonEmptyString(toolArgs.mediaUrl, toolArgs.storageUrl);
    const mediaType = String(toolArgs.mediaType || '').trim().toLowerCase();
    const flowItems = Array.isArray(toolArgs.flowItems) ? toolArgs.flowItems : [];
    const whenToUse = String(toolArgs.whenToUse || '').trim();
    const description = String(toolArgs.description || '').trim();
    if (!canConfirmSaveMediaPendingAction({ mediaUrl, whenToUse, mediaType, flowItems })) {
      return null;
    }
    const details =
      mediaType === 'flow'
        ? [
            `Nome: ${mediaName}`,
            `Tipo: fluxo`,
            whenToUse ? `Quando usar: ${whenToUse}` : '',
            description ? `DescriÃ§Ã£o: ${description}` : '',
            `Sequencia:\n${summarizeFlowItemsForConfirmation(flowItems)}`,
          ].filter(Boolean)
        : [
            `Nome: ${mediaName}`,
            whenToUse ? `Quando usar: ${whenToUse}` : '',
            description ? `DescriÃ§Ã£o: ${description}` : '',
          ].filter(Boolean);

    return {
      type: 'save_media',
      payload: { ...toolArgs, phoneNumber },
      proposedText:
        `Perfeito. Vou salvar esta mÃ­dia no seu agente com estes dados:\n\n${details.join('\n')}\n\nConfirma que posso prosseguir?`,
      expiresAt: Date.now() + 10 * 60_000,
    };
  }

  if (toolName === 'registrar_pagamento') {
    const amount = String(toolArgs.valorInformado || toolArgs.amount || '').trim();
    const plan = String(toolArgs.planoEscolhido || toolArgs.plan || '').trim();
    const details = [
      'Acao: registrar oficialmente o comprovante no sistema',
      amount ? `Valor informado: ${amount}` : '',
      plan ? `Plano mencionado: ${plan}` : '',
    ].filter(Boolean);

    return {
      type: 'registrar_pagamento',
      payload: { ...toolArgs, phoneNumber },
      proposedText:
        `Recebi um comprovante por aqui e vou encaminhar isso para registro oficial no sistema.\n\n${details.join('\n')}\n\nConfirma que posso prosseguir?`,
      expiresAt: Date.now() + 10 * 60_000,
    };
  }

  return null;
}

function normalizePendingConfirmationAction(pendingAction: PendingAction): PendingAction {
  if (pendingAction.type === 'criar_agente') {
    const rebuilt = buildPendingConfirmationAction(
      'criar_agente',
      pendingAction.payload || {},
      String(pendingAction.payload?.phoneNumber || '').trim(),
    );

    if (rebuilt) {
      return {
        ...rebuilt,
        expiresAt: pendingAction.expiresAt || rebuilt.expiresAt,
      };
    }
  }

  if (pendingAction.type === 'edit_prompt') {
    const rebuilt = buildPendingConfirmationAction(
      'editar_prompt',
      pendingAction.payload || {},
      String(pendingAction.payload?.phoneNumber || '').trim(),
    );

    if (rebuilt) {
      return {
        ...rebuilt,
        expiresAt: pendingAction.expiresAt || rebuilt.expiresAt,
      };
    }
  }

  if (pendingAction.type === 'save_media') {
    const rebuilt = buildPendingConfirmationAction(
      'salvar_midia',
      pendingAction.payload || {},
      String(pendingAction.payload?.phoneNumber || '').trim(),
    );

    if (rebuilt) {
      return {
        ...rebuilt,
        expiresAt: pendingAction.expiresAt || rebuilt.expiresAt,
      };
    }
  }

  if (pendingAction.type === 'registrar_pagamento') {
    const rebuilt = buildPendingConfirmationAction(
      'registrar_pagamento',
      pendingAction.payload || {},
      String(pendingAction.payload?.phoneNumber || '').trim(),
    );

    if (rebuilt) {
      return {
        ...rebuilt,
        expiresAt: pendingAction.expiresAt || rebuilt.expiresAt,
      };
    }
  }

  return pendingAction;
}

function pendingActionAlreadyAsksForConfirmation(text: string): boolean {
  const normalized = text.toLowerCase();
  return normalized.includes('posso prosseguir') || normalized.includes('confirma');
}

function extractToolResultText(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return String(parsed?.message || parsed?.responseText || content);
  } catch {
    return content;
  }
}

function classifySuspiciousOwnDomainUrl(urlObj: URL): 'plans' | 'conexao' | 'simulator' | null {
  const pathname = urlObj.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const token = urlObj.searchParams.get('token');

  if (pathname.startsWith('/test/')) {
    const tokenCandidate = pathname.split('/')[2] || '';
    return SIMULATOR_TOKEN_PATTERN.test(tokenCandidate) ? null : 'simulator';
  }

  if (pathname === '/connect' || pathname.startsWith('/connect/')) {
    return 'conexao';
  }

  if (pathname === '/conexao') {
    if (!token) return null;
    return UUID_TOKEN_PATTERN.test(token) ? null : 'conexao';
  }

  if (pathname.startsWith('/conexao/')) {
    return 'conexao';
  }

  if (pathname === '/plans') {
    if (!token) return null;
    return UUID_TOKEN_PATTERN.test(token) ? null : 'plans';
  }

  if (pathname.startsWith('/plans/')) {
    return 'plans';
  }

  return null;
}

function classifyFabricatedExternalUrl(url: string): 'plans' | 'conexao' | 'simulator' | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('simulador') || lowerUrl.includes('simulator') || lowerUrl.includes('/test/') || lowerUrl.includes('teste')) {
    return 'simulator';
  }
  if (lowerUrl.includes('conex') || lowerUrl.includes('/connect') || lowerUrl.includes('/conexao') || lowerUrl.includes('qr') || lowerUrl.includes('parear') || lowerUrl.includes('whatsapp')) {
    return 'conexao';
  }
  if (lowerUrl.includes('plan') || lowerUrl.includes('assin') || lowerUrl.includes('pricing') || lowerUrl.includes('checkout') || lowerUrl.includes('token=')) {
    return 'plans';
  }
  return null;
}

function normalizeToolArguments(
  toolName: string,
  toolArgs: Record<string, any>,
): Record<string, any> {
  if (toolName !== 'criar_agente') {
    return toolArgs;
  }

  const normalizedArgs = { ...toolArgs };
  const nomeEmpresa = firstNonEmptyString(
    toolArgs.nomeEmpresa,
    toolArgs.companyName,
    toolArgs.company,
    toolArgs.businessName,
    toolArgs.nomeNegocio,
  );
  const ramoAtuacao = firstNonEmptyString(
    toolArgs.ramoAtuacao,
    toolArgs.businessSegment,
    toolArgs.businessType,
    toolArgs.segment,
    toolArgs.ramo,
  );
  const descricaoAtendimento = firstNonEmptyString(
    toolArgs.descricaoAtendimento,
    toolArgs.attendanceDescription,
    toolArgs.promptDescription,
    toolArgs.instructions,
    toolArgs.prompt,
  );

  if (nomeEmpresa) normalizedArgs.nomeEmpresa = nomeEmpresa;
  if (ramoAtuacao) normalizedArgs.ramoAtuacao = ramoAtuacao;
  if (descricaoAtendimento) normalizedArgs.descricaoAtendimento = descricaoAtendimento;

  return normalizedArgs;
}

function sanitizeFabricatedUrls(text: string): SanitizeResult {
  // Valid URLs are only those from our own domain (agentezap.online)
  // Any URL from other domains (agentezap.com, agentezap.com.br, etc.) is fabricated
  const urlPattern = /https?:\/\/[^\s\)>\]"']+/gi;
  let result = text;
  let hadFabricatedPlansUrl = false;
  let hadFabricatedConexaoUrl = false;
  let hadFabricatedSimulatorUrl = false;
  const matches = text.match(urlPattern);
  if (!matches) return { text, hadFabricatedPlansUrl: false, hadFabricatedConexaoUrl: false, hadFabricatedSimulatorUrl: false };

  for (const url of matches) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Allow our real domain
      if (hostname === APP_DOMAIN || hostname === 'www.' + APP_DOMAIN) {
        const suspiciousType = classifySuspiciousOwnDomainUrl(urlObj);
        if (!suspiciousType) continue;

        console.warn(`[ToolCalling] URL do domÃ­nio prÃ³prio mas suspeita: ${url}`);
        if (suspiciousType === 'plans') hadFabricatedPlansUrl = true;
        if (suspiciousType === 'conexao') hadFabricatedConexaoUrl = true;
        if (suspiciousType === 'simulator') hadFabricatedSimulatorUrl = true;
        result = result.replace(url, getPlaceholderForLinkType(suspiciousType));
        continue;
      }

      // Allow Supabase storage URLs
      if (hostname.includes('supabase.co')) continue;

      // Allow common media URLs (imgur, etc)
      if (hostname.includes('imgur.com') || hostname.includes('i.imgur.com')) continue;

      // Detect fabricated URLs and classify them
      const fabricatedType =
        hostname.includes('agentezap')
          ? classifyFabricatedExternalUrl(url) || 'plans'
          : classifyFabricatedExternalUrl(url);
      if (fabricatedType) {
        console.warn(`[ToolCalling] URL fabricada detectada e removida: ${url}`);
        if (fabricatedType === 'plans') hadFabricatedPlansUrl = true;
        if (fabricatedType === 'conexao') hadFabricatedConexaoUrl = true;
        if (fabricatedType === 'simulator') hadFabricatedSimulatorUrl = true;
        result = result.replace(url, getPlaceholderForLinkType(fabricatedType));
      }
    } catch {
      // Not a valid URL, skip
    }
  }

  return { text: result, hadFabricatedPlansUrl, hadFabricatedConexaoUrl, hadFabricatedSimulatorUrl };
}

/**
 * V23k: Ensure simulator URLs from tool results are preserved in the LLM response.
 * The LLM sometimes replaces /test/TOKEN with bare /plans â€” this catches that.
 */
function preserveSimulatorUrlFromToolResults(
  responseText: string,
  toolResultMessages: Array<{ role: string; content: string }>,
): string {
  // Extract /test/TOKEN URLs from tool results
  const testUrlPattern = /https?:\/\/[^\s"'\]>]+\/test\/[a-f0-9]+/gi;
  let simulatorUrl: string | null = null;

  for (const msg of toolResultMessages) {
    const match = extractToolResultText(msg.content).match(testUrlPattern);
    if (match) {
      simulatorUrl = match[0];
      break;
    }
  }

  if (!simulatorUrl) return responseText; // No simulator URL in tool results

  // Check if the response already contains a /test/ URL
  if (/\/test\/[a-f0-9]+/i.test(responseText)) return responseText;

  // The LLM dropped the simulator URL. Replace bare /plans URLs with simulator URL.
  const barePlansRegex = /https?:\/\/agentezap\.online\/plans(?![?\w/])/gi;
  if (barePlansRegex.test(responseText)) {
    console.log(`[ToolCalling] LLM substituiu /test/ por /plans â€” corrigindo para: ${simulatorUrl}`);
    return responseText.replace(/https?:\/\/agentezap\.online\/plans(?![?\w/])/gi, simulatorUrl);
  }

  // If response mentions testing/simulator but no URL, append it
  if (/test[ae]|simulador|simulat/i.test(responseText)) {
    console.log(`[ToolCalling] LLM mencionou teste mas omitiu URL â€” adicionando: ${simulatorUrl}`);
    return responseText + `\n\nðŸ”— Link do simulador: ${simulatorUrl}`;
  }

  return responseText;
}

function preserveAutologinUrlsFromToolResults(
  responseText: string,
  toolResultMessages: Array<{ role: string; content: string }>,
): string {
  const plansUrlPattern = /https?:\/\/[^\s"'\]>]+\/plans\?token=[0-9a-f-]+/i;
  const conexaoUrlPattern = /https?:\/\/[^\s"'\]>]+\/conexao\?token=[0-9a-f-]+/i;
  const existingPlansUrlPattern = /https?:\/\/(?:www\.)?agentezap\.online\/(?:plans(?:\?token=[^\s"'\]>]+)?|plans\/[^\s"'\]>]+|p\/[^\s"'\]>]+)/gi;
  const existingConexaoUrlPattern = /https?:\/\/(?:www\.)?agentezap\.online\/(?:conexao(?:\?token=[^\s"'\]>]+)?|conexao\/[^\s"'\]>]+|connect(?:\?token=[^\s"'\]>]+)?|connect\/[^\s"'\]>]+)/gi;
  let plansUrl: string | null = null;
  let conexaoUrl: string | null = null;

  for (const msg of toolResultMessages) {
    const textContent = extractToolResultText(msg.content);
    if (!plansUrl) {
      const plansMatch = textContent.match(plansUrlPattern);
      if (plansMatch) plansUrl = plansMatch[0];
    }
    if (!conexaoUrl) {
      const conexaoMatch = textContent.match(conexaoUrlPattern);
      if (conexaoMatch) conexaoUrl = conexaoMatch[0];
    }
  }

  let result = responseText;

  if (plansUrl) {
    if (result.includes(plansUrl)) {
      // already correct
    } else if (existingPlansUrlPattern.test(result)) {
      console.log(`[ToolCalling] Corrigindo link de planos para URL real: ${plansUrl}`);
      result = result.replace(existingPlansUrlPattern, plansUrl);
    } else if (/(assin|plano|pagamento|checkout)/i.test(result)) {
      console.log(`[ToolCalling] Resposta mencionou planos sem URL real - anexando: ${plansUrl}`);
      result = `${result}\n\nðŸ”— Link direto para assinar: ${plansUrl}`;
    }
  }

  if (conexaoUrl) {
    if (result.includes(conexaoUrl)) {
      // already correct
    } else if (existingConexaoUrlPattern.test(result)) {
      console.log(`[ToolCalling] Corrigindo link de conexÃ£o para URL real: ${conexaoUrl}`);
      result = result.replace(existingConexaoUrlPattern, conexaoUrl);
    } else if (/(conex|whatsapp|qr\s*code|parea|pareamento)/i.test(result)) {
      console.log(`[ToolCalling] Resposta mencionou conexÃ£o sem URL real - anexando: ${conexaoUrl}`);
      result = `${result}\n\nðŸ”— Link direto para conectar o WhatsApp: ${conexaoUrl}`;
    }
  }

  return result;
}

function extractPlansUrlFromText(text: string): string | null {
  const match = String(text || '').match(/https?:\/\/[^\s"'\]>]+\/plans(?:\?token=[^\s"'\]>]+)?/i);
  return match?.[0] || null;
}

function extractPlansUrlFromToolResults(toolResultMessages: Array<{ role: string; content: string }>): string | null {
  for (const msg of toolResultMessages) {
    const url = extractPlansUrlFromText(extractToolResultText(msg.content));
    if (url) {
      return url;
    }
  }

  return null;
}

async function normalizeAdminPlanResponse(params: {
  responseText: string;
  toolResultMessages: Array<{ role: string; content: string }>;
  messageText: string;
  userId?: string;
  phoneNumber: string;
}): Promise<string> {
  const { responseText, toolResultMessages, messageText, userId, phoneNumber } = params;
  const shouldNormalizePlanReply =
    containsLegacyAdminPlanPricing(responseText) ||
    isAdminPlanRequest(messageText);

  if (!shouldNormalizePlanReply) {
    return responseText;
  }

  const focus = detectAdminPlanFocusFromText(messageText);
  let planUrl = extractPlansUrlFromToolResults(toolResultMessages) || extractPlansUrlFromText(responseText);

  if (!planUrl && userId) {
    try {
      const toolResult = await executeToolCall(
        'gerar_link_planos',
        { focus, requestText: messageText },
        userId,
        phoneNumber,
      );
      const parsed = JSON.parse(toolResult);
      planUrl = extractPlansUrlFromText(String(parsed?.message || parsed?.responseText || '')) || planUrl;
    } catch (error) {
      console.warn('[ToolCalling] Falha ao reforçar link de planos para resposta comercial:', error);
    }
  }

  return buildAdminPlanReplyText({ focus, link: planUrl || undefined });
}

/**
 * V23k: Ensure real credentials from criar_agente tool results are preserved.
 * The LLM often fabricates "nicer-looking" emails/passwords instead of using the real ones.
 */
function preserveCredentialsFromToolResults(
  responseText: string,
  toolResultMessages: Array<{ role: string; content: string }>,
): string {
  // Look for real credentials in tool results (parse JSON first to get actual text)
  let realEmail: string | null = null;
  let realPassword: string | null = null;

  for (const msg of toolResultMessages) {
    let textContent = msg.content;
    try {
      const parsed = JSON.parse(msg.content);
      textContent = parsed.message || msg.content;
    } catch { /* not JSON, use raw */ }

    const emailMatch = textContent.match(/E-mail(?:\s+REAL)?:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+)/i);
    if (emailMatch) realEmail = emailMatch[1];
    const passMatch = textContent.match(/Senha(?:\s+REAL)?:\s*([^\s\n]+)/i);
    if (passMatch) realPassword = passMatch[1];
  }

  if (!realEmail && !realPassword) return responseText;

  let result = responseText;

  // Replace any fabricated email with the real one
  if (realEmail) {
    const emailPattern = /(?:ðŸ“§|e-?mail|E-?mail)[^\n]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+)/gi;
    let match;
    while ((match = emailPattern.exec(result)) !== null) {
      const foundEmail = match[1];
      if (foundEmail !== realEmail) {
        console.log(`[ToolCalling] LLM fabricou email "${foundEmail}" â€” corrigindo para: ${realEmail}`);
        result = result.replace(foundEmail, realEmail);
      }
    }
  }

  // Replace any fabricated password with the real one
  if (realPassword) {
    const passPattern = /(?:ðŸ”‘|senha|Senha|password)[^\n]*?([^\s\n*]+)$/gmi;
    let match;
    while ((match = passPattern.exec(result)) !== null) {
      const foundPass = match[1];
      if (foundPass !== realPassword && foundPass.length > 2) {
        console.log(`[ToolCalling] LLM fabricou senha "${foundPass}" â€” corrigindo para: ${realPassword}`);
        result = result.replace(foundPass, realPassword);
      }
    }
  }

  return result;
}

/**
 * Sanitize response and auto-inject real links when LLM fabricates URLs.
 * If fabricated plan/conexao URLs are detected, calls the real tool and replaces placeholder.
 */
async function sanitizeAndInjectRealLinks(
  responseText: string,
  userId: string | undefined,
  phoneNumber: string,
): Promise<string> {
  const { text, hadFabricatedPlansUrl, hadFabricatedConexaoUrl, hadFabricatedSimulatorUrl } = sanitizeFabricatedUrls(responseText);

  if (!hadFabricatedPlansUrl && !hadFabricatedConexaoUrl && !hadFabricatedSimulatorUrl) {
    return text; // No fabrication detected, return as-is
  }

  let result = text;

  // Auto-inject real simulator link
  if (hadFabricatedSimulatorUrl && userId) {
    try {
      console.log('[ToolCalling] Auto-injetando link REAL de simulador (LLM fabricou URL)');
      const realSimUrl = await getOrCreateSimulatorUrlForUser(userId);
      result = result.replace(new RegExp(SIMULATOR_LINK_PLACEHOLDER, 'g'), realSimUrl);
      console.log(`[ToolCalling] Link real de simulador injetado: ${realSimUrl}`);
    } catch (err) {
      console.error('[ToolCalling] Erro ao gerar link real de simulador:', err);
      result = result.replace(new RegExp(SIMULATOR_LINK_PLACEHOLDER, 'g'), APP_BASE_URL);
    }
  } else if (hadFabricatedSimulatorUrl) {
    result = result.replace(new RegExp(SIMULATOR_LINK_PLACEHOLDER, 'g'), APP_BASE_URL);
  }

  // Auto-inject real plans link
  if (hadFabricatedPlansUrl && userId) {
    try {
      console.log('[ToolCalling] Auto-injetando link REAL de planos (LLM fabricou URL)');
      const toolResult = await executeToolCall('gerar_link_planos', {}, userId, phoneNumber);
      const parsed = JSON.parse(toolResult);
      if (parsed.success && parsed.message) {
        // Extract the real URL from the tool result
        const realUrlMatch = parsed.message.match(/https?:\/\/[^\s\)>\]"']+/i);
        if (realUrlMatch) {
          result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), realUrlMatch[0]);
          console.log(`[ToolCalling] Link real de planos injetado: ${realUrlMatch[0]}`);
        } else {
          result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/plans`);
        }
      } else {
        result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/plans`);
      }
    } catch (err) {
      console.error('[ToolCalling] Erro ao gerar link real de planos:', err);
      result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/plans`);
    }
  } else if (hadFabricatedPlansUrl) {
    // No userId â€” can't generate autologin, use generic URL
    result = result.replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/plans`);
  }

  // Auto-inject real conexao link
  if (hadFabricatedConexaoUrl && userId) {
    try {
      console.log('[ToolCalling] Auto-injetando link REAL de conexÃ£o (LLM fabricou URL)');
      const toolResult = await executeToolCall('gerar_link_conexao', {}, userId, phoneNumber);
      const parsed = JSON.parse(toolResult);
      if (parsed.success && parsed.message) {
        const realUrlMatch = parsed.message.match(/https?:\/\/[^\s\)>\]"']+/i);
        if (realUrlMatch) {
          result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), realUrlMatch[0]);
          console.log(`[ToolCalling] Link real de conexÃ£o injetado: ${realUrlMatch[0]}`);
        } else {
          result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/conexao`);
        }
      } else {
        result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/conexao`);
      }
    } catch (err) {
      console.error('[ToolCalling] Erro ao gerar link real de conexÃ£o:', err);
      result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/conexao`);
    }
  } else if (hadFabricatedConexaoUrl) {
    result = result.replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/conexao`);
  }

  // Clean up any remaining placeholders
  result = result
    .replace(new RegExp(PLANS_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/plans`)
    .replace(new RegExp(CONEXAO_LINK_PLACEHOLDER, 'g'), `${APP_BASE_URL}/conexao`)
    .replace(new RegExp(SIMULATOR_LINK_PLACEHOLDER, 'g'), APP_BASE_URL)
    .replace(/\{\{LINK_PLACEHOLDER\}\}/g, APP_BASE_URL);

  return result;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tool execution bridge â€” maps tool calls to actionExecutorV2
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function executeToolCall(
  toolName: string,
  toolArgs: Record<string, any>,
  userId: string | undefined,
  phoneNumber: string,
  mediaType?: string,
  mediaUrl?: string,
  pendingMedia?: PendingToolCallingMedia,
  recentMediaBuffer?: RecentToolCallingMedia[],
  currentMessageText?: string,
): Promise<string> {
  console.log(`[ToolCalling] Executando tool: ${toolName}`, JSON.stringify(toolArgs).slice(0, 200));

  if ((toolName === 'informar_planos' || toolName === 'gerar_link_planos') && currentMessageText) {
    if (!toolArgs.requestText) {
      toolArgs.requestText = currentMessageText;
    }
    if (!toolArgs.focus) {
      toolArgs.focus = detectAdminPlanFocusFromText(currentMessageText);
    }
  }

  // V23k: Handle gerar_link_simulador directly (no PendingAction type needed)
  if (toolName === 'gerar_link_simulador') {
    if (!userId) {
      return JSON.stringify({ success: false, error: 'Cliente nÃ£o tem conta ativa. Crie uma conta primeiro com criar_agente.' });
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const simUrl = await getOrCreateSimulatorUrlForUser(userId);
        return JSON.stringify({
          success: true,
          message: `ðŸ”— Link do simulador para testar seu agente:\n${simUrl}\n\nðŸ’¡ Abra o link e converse com o agente como se fosse um cliente. Teste diferentes perguntas para ver como ele responde!`,
        });
      } catch (e: any) {
        console.error(`[ToolCalling] Erro ao gerar link do simulador (tentativa ${attempt}/2):`, e);
        if (attempt < 2) {
          await waitBeforeRetry(1200 * attempt);
        }
      }
    }

    return JSON.stringify({ success: false, error: 'Nao consegui concluir o link do simulador agora.' });
  }

  // Map tool names to PendingAction types
  const toolToActionType: Record<string, PendingAction['type']> = {
    informar_planos: 'INFORMAR_PLANOS',
    gerar_link_conexao: 'GERAR_LINK_CONEXAO',
    gerar_link_planos: 'GERAR_LINK_PLANOS',
    editar_prompt: 'edit_prompt',
    salvar_midia: 'save_media',
    criar_agente: 'criar_agente',
    registrar_pagamento: 'registrar_pagamento',
  };

  const actionType = toolToActionType[toolName];
  if (!actionType) {
    return JSON.stringify({ success: false, error: `Ferramenta "${toolName}" nÃ£o reconhecida.` });
  }

  // For tools that don't require userId (informar_planos on new leads)
  if (!userId && actionType !== 'INFORMAR_PLANOS' && actionType !== 'criar_agente' && actionType !== 'registrar_pagamento') {
    return JSON.stringify({ success: false, error: 'Cliente nÃ£o tem conta ativa. Crie uma conta primeiro com criar_agente.' });
  }

  // Enrich media params from message context
  if (toolName === 'salvar_midia') {
    if (mediaUrl && !toolArgs.mediaUrl) toolArgs.mediaUrl = mediaUrl;
    if (mediaType && !toolArgs.mediaType) toolArgs.mediaType = mediaType;
    if (pendingMedia?.url && !toolArgs.mediaUrl) toolArgs.mediaUrl = pendingMedia.url;
    if (pendingMedia?.type && !toolArgs.mediaType) toolArgs.mediaType = pendingMedia.type;
    if (pendingMedia?.description && !toolArgs.description) toolArgs.description = pendingMedia.description;
    if (pendingMedia?.whenCandidate && !toolArgs.whenToUse) toolArgs.whenToUse = pendingMedia.whenCandidate;

    const normalizedToolMediaType = String(toolArgs.mediaType || '').trim().toLowerCase();
    if (normalizedToolMediaType === 'flow') {
      let normalizedFlowItems = normalizeFlowItemsFromArgs(toolArgs.flowItems, recentMediaBuffer);
      if (normalizedFlowItems.length < 2) {
        const inferredRawFlowItems = await inferFlowItemsFromMessage({
          messageText: currentMessageText,
          recentMediaBuffer,
        });
        const inferredNormalizedFlowItems = normalizeFlowItemsFromArgs(inferredRawFlowItems, recentMediaBuffer);
        if (inferredNormalizedFlowItems.length > normalizedFlowItems.length) {
          normalizedFlowItems = inferredNormalizedFlowItems;
        }
      }
      toolArgs.flowItems = normalizedFlowItems;

      if (!String(toolArgs.whenToUse || '').trim()) {
        return JSON.stringify({
          success: false,
          error: 'Perfeito. Me confirma so em qual situacao o agente deve disparar esse fluxo que eu sigo por aqui.',
        });
      }

      if (normalizedFlowItems.length < 2) {
        return JSON.stringify({
          success: false,
          error: 'Para salvar esse fluxo, preciso da sequencia com pelo menos 2 itens entre textos e midias. Me manda a ordem exata que eu organizo.',
        });
      }
    } else {
      if (!String(toolArgs.mediaUrl || '').trim()) {
        return JSON.stringify({
          success: false,
          error: 'Recebi a instrucao, mas preciso que voce reenvie o arquivo para cadastrar essa midia agora.',
        });
      }

      if (!String(toolArgs.whenToUse || '').trim()) {
        return JSON.stringify({
          success: false,
          error: 'Perfeito. Me confirma so em qual situacao o agente deve enviar essa midia que eu sigo por aqui.',
        });
      }
    }
  }

  if (toolName === 'registrar_pagamento') {
    if (mediaUrl && !toolArgs.comprovanteUrl) toolArgs.comprovanteUrl = mediaUrl;
  }

  if (toolName === 'criar_agente' || toolName === 'editar_prompt' || toolName === 'salvar_midia' || toolName === 'registrar_pagamento') {
    const pendingConfirmationAction = buildPendingConfirmationAction(toolName, toolArgs, phoneNumber);
    if (!pendingConfirmationAction) {
      if (toolName === 'criar_agente') {
        return JSON.stringify({
          success: false,
          error: 'Entendi. Me confirma só o nome da empresa e o que você quer que o agente faça no WhatsApp que eu sigo por aqui.',
        });
      }

      return JSON.stringify({
        success: false,
        error: buildPendingActionClarificationReply(toolName),
      });
    }

    return JSON.stringify({
      success: true,
      requiresConfirmation: true,
      message: pendingConfirmationAction.proposedText,
      pendingAction: pendingConfirmationAction,
    });
  }

  // Build PendingAction and delegate to executeAction
  const pendingAction: PendingAction = {
    type: actionType,
    payload: { ...toolArgs, phoneNumber },
    proposedText: '',
    expiresAt: Date.now() + 60_000,
  };

  try {
    const result = await executeActionWithTechnicalRetry(pendingAction, userId || phoneNumber);
    return JSON.stringify({
      success: result.success,
      message: result.responseText,
      responseText: result.responseText,
      error: result.success ? undefined : result.responseText,
    });
  } catch (err: any) {
    console.error(`[ToolCalling] Erro ao executar tool ${toolName}:`, err);
    return JSON.stringify({ success: false, error: err?.message || 'Erro interno ao executar aÃ§Ã£o.' });
  }
}

function getActionTypeForToolName(toolName: string): PendingAction['type'] | null {
  switch (toolName) {
    case 'editar_prompt':
      return 'edit_prompt';
    case 'salvar_midia':
      return 'save_media';
    case 'criar_agente':
      return 'criar_agente';
    case 'registrar_pagamento':
      return 'registrar_pagamento';
    default:
      return null;
  }
}

function buildDirectToolFailureReply(toolName: string, rawFailureText: string): string {
  const actionType = getActionTypeForToolName(toolName);
  if (actionType && isTechnicalFailureMessage(rawFailureText)) {
    return buildPendingActionRecoveryReply(actionType);
  }

  return rawFailureText.trim();
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// JSON-in-text fallback parser
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface FallbackToolCall {
  tool: string;
  arguments: Record<string, any>;
}

interface PendingMediaRecoveryResult {
  action: 'save_now' | 'ask_user' | 'none';
  name?: string;
  whenToUse?: string;
  description?: string;
}

interface PendingActionDecisionResult {
  action: 'confirm' | 'cancel' | 'modify' | 'unclear';
}

interface MissingToolRecoveryResult {
  action: 'edit_prompt' | 'save_media' | 'criar_agente' | 'none';
  descricaoMudanca?: string;
  name?: string;
  whenToUse?: string;
  description?: string;
  companyName?: string;
  businessSegment?: string;
  serviceDescription?: string;
}

interface ImplicitCreateRecoveryResult {
  action: 'execute_create' | 'none';
  companyName?: string;
  businessSegment?: string;
  serviceDescription?: string;
}

function parseFallbackToolCalls(text: string): FallbackToolCall[] {
  // Try to find JSON block with tool_calls array
  const patterns = [
    /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i,
    /(\{[\s\S]*"tool_calls"[\s\S]*\})/i,
    /(\{[\s\S]*"ferramenta"[\s\S]*\})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
          return parsed.tool_calls.map((tc: any) => ({
            tool: tc.name || tc.tool || tc.function,
            arguments: tc.arguments || tc.params || tc.parametros || {},
          }));
        }
        if (parsed.ferramenta) {
          return [{
            tool: parsed.ferramenta,
            arguments: parsed.argumentos || parsed.parametros || {},
          }];
        }
      } catch {
        // Continue trying other patterns
      }
    }
  }

  return [];
}

function extractJsonObject(text: string): string | null {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const directMatch = text.match(/\{[\s\S]*\}/);
  return directMatch ? directMatch[0].trim() : null;
}

async function tryRecoverPendingMediaSave(params: {
  phoneNumber: string;
  userId: string | undefined;
  messageText: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  pendingMedia?: PendingToolCallingMedia;
}): Promise<{ responseText: string; consumedPendingMedia: true } | null> {
  const { phoneNumber, userId, messageText, conversationHistory, pendingMedia } = params;

  if (!pendingMedia || !userId) {
    return null;
  }

  const historySummary = conversationHistory
    .slice(-8)
    .map((msg) => `${msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE'}: ${msg.content}`)
    .join('\n');

  const recoveryPrompt = `VocÃª recebe uma conversa do admin do AgenteZap sobre UMA mÃ­dia pendente que jÃ¡ foi enviada.

Seu trabalho Ã© decidir se jÃ¡ existem dados suficientes para salvar a mÃ­dia AGORA.

MÃDIA PENDENTE:
- tipo: ${pendingMedia.type}
- descriÃ§Ã£o existente: ${pendingMedia.description || 'nÃ£o informada'}
- contexto sugerido anterior: ${pendingMedia.whenCandidate || 'nÃ£o informado'}

CONVERSA RECENTE:
${historySummary}

MENSAGEM ATUAL DO CLIENTE:
${messageText}

Regras:
- action="save_now" somente se jÃ¡ houver nome + quando usar suficientes na conversa e o cliente estiver informando isso agora ou confirmando o salvamento.
- action="ask_user" se ainda faltar nome ou quando usar.
- action="none" se a mensagem atual for sobre outro assunto.
- NÃ£o invente URL.
- description deve ser curta e objetiva.

Responda SOMENTE com JSON vÃ¡lido neste formato:
{"action":"save_now|ask_user|none","name":"...","whenToUse":"...","description":"..."}`;

  try {
    const response = await chatComplete({
      messages: [{ role: 'system', content: recoveryPrompt }],
      maxTokens: 300,
      temperature: 0.1,
      skipMistralQueue: true,
    });

    const rawText = response.choices?.[0]?.message?.content || '';
    const jsonText = extractJsonObject(rawText);
    if (!jsonText) {
      return null;
    }

    const parsed = JSON.parse(jsonText) as PendingMediaRecoveryResult;
    if (parsed.action !== 'save_now') {
      return null;
    }

    const name = String(parsed.name || '').trim();
    const whenToUse = String(parsed.whenToUse || '').trim();
    const description =
      String(parsed.description || '').trim() ||
      pendingMedia.description ||
      whenToUse;

    if (!name || !whenToUse) {
      return null;
    }

    const toolResult = await executeToolCall(
      'salvar_midia',
      { name, whenToUse, description },
      userId,
      phoneNumber,
      undefined,
      undefined,
      pendingMedia,
      undefined,
    );

    const parsedToolResult = JSON.parse(toolResult);
    if (parsedToolResult?.success && parsedToolResult?.message) {
      console.log('[ToolCalling] RecuperaÃ§Ã£o de mÃ­dia pendente executou salvar_midia com sucesso');
      return {
        responseText: parsedToolResult.message,
        consumedPendingMedia: true,
      };
    }
  } catch (error) {
    console.warn('[ToolCalling] Falha ao recuperar salvamento de mÃ­dia pendente:', error);
  }

  return null;
}

async function decidePendingActionReply(params: {
  pendingAction: PendingAction;
  messageText: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<PendingActionDecisionResult['action']> {
  const { pendingAction, messageText, conversationHistory } = params;
  const historySummary = conversationHistory
    .slice(-8)
    .map((msg) => `${msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE'}: ${msg.content}`)
    .join('\n');

  const decisionPrompt = `VocÃª estÃ¡ analisando a resposta do cliente para uma aÃ§Ã£o pendente do admin do AgenteZap.

AÃ§Ã£o pendente:
- tipo: ${pendingAction.type}
- payload: ${JSON.stringify(pendingAction.payload || {})}
- proposta exibida ao cliente: ${pendingAction.proposedText || 'nÃ£o informada'}

Conversa recente:
${historySummary}

Mensagem atual do cliente:
${messageText}

Classifique a mensagem atual em UMA destas aÃ§Ãµes:
- "confirm": o cliente confirmou claramente que quer executar a aÃ§Ã£o pendente agora
- "cancel": o cliente cancelou claramente a aÃ§Ã£o pendente
- "modify": o cliente mudou o pedido, corrigiu algo, ou trouxe nova instruÃ§Ã£o que substitui a aÃ§Ã£o pendente
- "unclear": nÃ£o ficou claro

Regras:
- "confirm" exige confirmaÃ§Ã£o clara e contextual.
- Se o cliente disser que NÃƒO quer usar a mÃ­dia, ou corrigir o que deve ser alterado, isso Ã© "modify".
- Se a mensagem sÃ³ trouxer continuaÃ§Ã£o vaga sem confirmaÃ§Ã£o clara, use "unclear".

Responda SOMENTE com JSON vÃ¡lido:
{"action":"confirm|cancel|modify|unclear"}`;

  try {
    const response = await chatComplete({
      messages: [{ role: 'system', content: decisionPrompt }],
      maxTokens: 120,
      temperature: 0.1,
      skipMistralQueue: true,
    });

    const rawText = response.choices?.[0]?.message?.content || '';
    const jsonText = extractJsonObject(rawText);
    if (!jsonText) return 'unclear';
    const parsed = JSON.parse(jsonText) as PendingActionDecisionResult;
    if (parsed.action === 'confirm' || parsed.action === 'cancel' || parsed.action === 'modify') {
      return parsed.action;
    }
  } catch (error) {
    console.warn('[ToolCalling] Falha ao interpretar resposta da pendingAction:', error);
  }

  return 'unclear';
}

async function inferPendingActionFromAssistantReply(params: {
  assistantResponse: string;
  messageText: string;
  phoneNumber: string;
  userId?: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  mediaType?: string;
  mediaUrl?: string;
  pendingMedia?: PendingToolCallingMedia;
}): Promise<PendingAction | null> {
  const { assistantResponse, messageText, phoneNumber, userId, conversationHistory, mediaType, mediaUrl, pendingMedia } = params;
  const historySummary = conversationHistory
    .slice(-8)
    .map((msg) => `${msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE'}: ${msg.content}`)
    .join('\n');

  const inferencePrompt = `VocÃª analisa uma resposta do admin do AgenteZap para decidir se ela deixou UMA aÃ§Ã£o pendente pronta para confirmaÃ§Ã£o.

Conversa recente:
${historySummary}

Mensagem atual do cliente:
${messageText}

Resposta que serÃ¡ enviada pelo assistente:
${assistantResponse}

MÃ­dia disponÃ­vel no contexto:
- mediaType atual: ${mediaType || 'nenhum'}
- mediaUrl atual: ${mediaUrl || 'nenhuma'}
- pendingMedia: ${pendingMedia ? JSON.stringify(pendingMedia) : 'nenhuma'}
- existe conta ativa: ${userId ? 'sim' : 'nao'}

Retorne action="criar_agente" SOMENTE se a resposta estiver propondo criar um teste/conta e a conversa ja tiver dados suficientes para confirmacao.
Retorne action="edit_prompt" SOMENTE se houver conta ativa e a resposta estiver propondo uma alteraÃ§Ã£o pronta para confirmaÃ§Ã£o.
Retorne action="save_media" SOMENTE se houver conta ativa e a resposta estiver propondo salvar mÃ­dia e jÃ¡ houver nome + whenToUse suficientes.
Retorne action="none" se a resposta estiver apenas esclarecendo, perguntando mais detalhes, ou concluindo algo sem depender de confirmaÃ§Ã£o futura.

Regras:
- proposedText deve ser a prÃ³pria resposta do assistente.
- Para edit_prompt, preencha descricaoMudanca com a alteraÃ§Ã£o concreta jÃ¡ definida.
- Para save_media, nÃ£o invente mediaUrl. Use a mÃ­dia jÃ¡ presente no contexto.
- Se ainda faltar detalhe essencial, action="none".

Responda SOMENTE com JSON vÃ¡lido:
{"action":"edit_prompt|save_media|criar_agente|none","descricaoMudanca":"...","name":"...","whenToUse":"...","description":"...","companyName":"...","businessSegment":"...","serviceDescription":"..."}`;

  try {
    const response = await chatComplete({
      messages: [{ role: 'system', content: inferencePrompt }],
      maxTokens: 240,
      temperature: 0.1,
      skipMistralQueue: true,
    });

    const rawText = response.choices?.[0]?.message?.content || '';
    const jsonText = extractJsonObject(rawText);
    if (!jsonText) return null;
    const parsed = JSON.parse(jsonText) as MissingToolRecoveryResult;

    if (parsed.action === 'edit_prompt') {
      if (!userId) return null;
      const descricaoMudanca = String(parsed.descricaoMudanca || '').trim();
      if (!descricaoMudanca) return null;
      return buildPendingConfirmationAction(
        'editar_prompt',
        { descricaoMudanca },
        phoneNumber,
      );
    }

    if (parsed.action === 'save_media') {
      if (!userId) return null;
      const name = String(parsed.name || '').trim();
      const whenToUse = String(parsed.whenToUse || '').trim();
      const effectiveMediaUrl = String(pendingMedia?.url || mediaUrl || '').trim();
      const effectiveMediaType = String(pendingMedia?.type || mediaType || '').trim();
      if (!name || !whenToUse || !effectiveMediaUrl || !effectiveMediaType) return null;
      return buildPendingConfirmationAction(
        'salvar_midia',
        {
          name,
          whenToUse,
          description:
            String(parsed.description || '').trim() ||
            pendingMedia?.description ||
            whenToUse,
          mediaUrl: effectiveMediaUrl,
          mediaType: effectiveMediaType,
        },
        phoneNumber,
      );
    }

    if (parsed.action === 'criar_agente') {
      const companyName = String(parsed.companyName || '').trim();
      if (!companyName) return null;

      return buildPendingConfirmationAction(
        'criar_agente',
        {
          nomeEmpresa: companyName,
          ramoAtuacao: String(parsed.businessSegment || '').trim(),
          descricaoAtendimento: String(parsed.serviceDescription || '').trim(),
        },
        phoneNumber,
      );
    }
  } catch (error) {
    console.warn('[ToolCalling] Falha ao inferir pendingAction pela resposta do assistente:', error);
  }

  return null;
}

async function tryRecoverImplicitCreateConfirmation(params: {
  messageText: string;
  phoneNumber: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<PendingAction | null> {
  const { messageText, phoneNumber, conversationHistory } = params;

  if (!isExplicitPendingConfirmationReply(messageText, { type: 'criar_agente', payload: {}, proposedText: '', expiresAt: 0 })) {
    return null;
  }

  const historySummary = conversationHistory
    .slice(-10)
    .map((msg) => `${msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE'}: ${msg.content}`)
    .join('\n');

  const prompt = `VocÃª analisa uma conversa do admin da AgenteZap.

Objetivo:
- identificar se o cliente acabou de CONFIRMAR uma proposta recente de criar uma conta/teste do agente
- se sim, extrair os dados necessarios para executar criar_agente agora

Conversa recente:
${historySummary}

Mensagem atual do cliente:
${messageText}

Regras:
- action="execute_create" somente se a conversa mostrar claramente que o assistente acabou de propor criar o teste/agente e o cliente respondeu confirmando
- se ainda faltar o nome da empresa, retorne "none"
- companyName e obrigatorio para execute_create
- businessSegment e serviceDescription podem ficar vazios se a conversa nao tiver isso claro

Responda SOMENTE com JSON valido:
{"action":"execute_create|none","companyName":"...","businessSegment":"...","serviceDescription":"..."}`;

  try {
    const response = await chatComplete({
      messages: [{ role: 'system', content: prompt }],
      maxTokens: 220,
      temperature: 0.1,
      skipMistralQueue: true,
    });

    const rawText = response.choices?.[0]?.message?.content || '';
    const jsonText = extractJsonObject(rawText);
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as ImplicitCreateRecoveryResult;
    if (parsed.action !== 'execute_create') return null;

    const companyName = String(parsed.companyName || '').trim();
    if (!companyName) return null;

    return {
      type: 'criar_agente',
      payload: {
        nomeEmpresa: companyName,
        ramoAtuacao: String(parsed.businessSegment || '').trim(),
        descricaoAtendimento: String(parsed.serviceDescription || '').trim(),
        phoneNumber,
      },
      proposedText: '',
      expiresAt: Date.now() + 60_000,
    };
  } catch (error) {
    console.warn('[ToolCalling] Falha ao recuperar confirmacao implicita de criar_agente:', error);
    return null;
  }
}

async function tryRecoverMissingToolExecution(params: {
  phoneNumber: string;
  userId: string | undefined;
  messageText: string;
  assistantResponse: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  mediaType?: string;
  mediaUrl?: string;
  pendingMedia?: PendingToolCallingMedia;
}): Promise<{ responseText: string; consumedPendingMedia?: true; newPendingAction?: PendingAction } | null> {
  const { phoneNumber, userId, messageText, assistantResponse, conversationHistory, mediaType, mediaUrl, pendingMedia } = params;

  if (!userId) {
    return null;
  }

  const historySummary = conversationHistory
    .slice(-10)
    .map((msg) => `${msg.role === 'assistant' ? 'ASSISTENTE' : 'CLIENTE'}: ${msg.content}`)
    .join('\n');

  const recoveryPrompt = `VocÃª estÃ¡ validando uma resposta do admin do AgenteZap.

PROBLEMA A EVITAR:
- O assistente NÃƒO pode dizer que jÃ¡ alterou o prompt ou jÃ¡ salvou uma mÃ­dia se nenhuma ferramenta foi executada neste turno.

Conversa recente:
${historySummary}

Mensagem atual do cliente:
${messageText}

Resposta gerada neste turno:
${assistantResponse}

MÃ­dia disponÃ­vel no contexto:
- mediaType atual: ${mediaType || 'nenhum'}
- mediaUrl atual: ${mediaUrl || 'nenhuma'}
- pendingMedia: ${pendingMedia ? JSON.stringify(pendingMedia) : 'nenhuma'}

Se a resposta acima estÃ¡ apenas esclarecendo, perguntando ou ainda aguardando confirmaÃ§Ã£o, retorne action="none".
Se a resposta acima estÃ¡ afirmando ou implicando que uma alteraÃ§Ã£o de prompt jÃ¡ foi feita, e a conversa jÃ¡ traz a instruÃ§Ã£o confirmada, retorne action="edit_prompt" e preencha descricaoMudanca.
Se a resposta acima estÃ¡ afirmando ou implicando que uma mÃ­dia jÃ¡ foi salva, e a conversa jÃ¡ traz nome + quando usar, retorne action="save_media" com name/whenToUse/description.

Regras:
- SÃ³ retorne uma aÃ§Ã£o quando a conversa jÃ¡ tiver informaÃ§Ã£o suficiente para EXECUTAR agora.
- NÃ£o invente mediaUrl; a URL jÃ¡ vem do contexto.
- NÃ£o retorne "edit_prompt" se ainda faltar definiÃ§Ã£o essencial do que mudar.
- NÃ£o retorne "save_media" se ainda faltar nome ou whenToUse.

Responda SOMENTE com JSON vÃ¡lido:
{"action":"edit_prompt|save_media|none","descricaoMudanca":"...","name":"...","whenToUse":"...","description":"..."}`;

  try {
    const response = await chatComplete({
      messages: [{ role: 'system', content: recoveryPrompt }],
      maxTokens: 260,
      temperature: 0.1,
      skipMistralQueue: true,
    });

    const rawText = response.choices?.[0]?.message?.content || '';
    const jsonText = extractJsonObject(rawText);
    if (!jsonText) return null;
    const parsed = JSON.parse(jsonText) as MissingToolRecoveryResult;

    if (parsed.action === 'edit_prompt') {
      const descricaoMudanca = String(parsed.descricaoMudanca || '').trim();
      if (!descricaoMudanca) return null;
      const pendingConfirmationAction = buildPendingConfirmationAction(
        'editar_prompt',
        { descricaoMudanca },
        phoneNumber,
      );
      if (pendingConfirmationAction) {
        console.log('[ToolCalling] RecuperaÃ§Ã£o converteu falso positivo de editar_prompt em confirmaÃ§Ã£o pendente');
        return {
          responseText: pendingConfirmationAction.proposedText,
          newPendingAction: pendingConfirmationAction,
        };
      }
      return null;
    }

    if (parsed.action === 'save_media') {
      const name = String(parsed.name || '').trim();
      const whenToUse = String(parsed.whenToUse || '').trim();
      if (!name || !whenToUse) return null;
      const description =
        String(parsed.description || '').trim() ||
        pendingMedia?.description ||
        whenToUse;

      const pendingConfirmationAction = buildPendingConfirmationAction(
        'salvar_midia',
        {
          name,
          whenToUse,
          description,
          mediaUrl: String(pendingMedia?.url || mediaUrl || '').trim(),
          mediaType: String(pendingMedia?.type || mediaType || '').trim(),
        },
        phoneNumber,
      );
      if (pendingConfirmationAction) {
        console.log('[ToolCalling] RecuperaÃ§Ã£o converteu falso positivo de salvar_midia em confirmaÃ§Ã£o pendente');
        return {
          responseText: pendingConfirmationAction.proposedText,
          newPendingAction: pendingConfirmationAction,
        };
      }
    }
  } catch (error) {
    console.warn('[ToolCalling] Falha ao recuperar ferramenta ausente apÃ³s falso positivo:', error);
  }

  return null;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main export â€” Multi-turn tool calling loop
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MAX_TOOL_ROUNDS = 3;

export async function processToolCallingMessage(
  phoneNumber: string,
  messageText: string,
  userId: string | undefined,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  pendingAction?: PendingAction,
  agentConfig?: { name?: string; company?: string; role?: string },
  contactName?: string,
  mediaType?: string,
  mediaUrl?: string,
  sendIntermediateMessage?: (text: string) => Promise<void>,
  pendingMedia?: PendingToolCallingMedia,
  recentMediaBuffer?: RecentToolCallingMedia[],
): Promise<{
  responseText: string;
  mediaActions?: ToolCallingMediaAction[];
  consumedPendingMedia?: boolean;
  newPendingAction?: PendingAction;
  clearPendingAction?: boolean;
}> {
  console.log(`[ToolCalling] Processando mensagem de ${phoneNumber}, userId=${userId || 'novo'}, msg="${messageText.slice(0, 60)}"`);
  let shouldClearPendingAction = false;
  const hasDeliveredTestLink = conversationHistoryHasSimulatorLink(conversationHistory);

  if (pendingAction && (pendingAction.type === 'criar_agente' || pendingAction.type === 'edit_prompt' || pendingAction.type === 'save_media' || pendingAction.type === 'registrar_pagamento')) {
    pendingAction = normalizePendingConfirmationAction(pendingAction);
  }

  if (pendingAction) {
    shouldClearPendingAction = true;

    if (userId && pendingAction.type === 'criar_agente') {
      const shouldRescueSimulatorLink =
        !hasDeliveredTestLink &&
        (
          isExplicitPendingConfirmationReply(messageText, pendingAction) ||
          await shouldRescueSimulatorLinkWithLLM({
            messageText,
            conversationHistory,
            pendingAction,
          })
        );

      if (shouldRescueSimulatorLink) {
        try {
          const toolResult = await executeToolCall('gerar_link_simulador', {}, userId, phoneNumber);
          const parsed = JSON.parse(toolResult);
          if (parsed?.success && parsed?.message) {
            console.log('[ToolCalling] Recuperando link do simulador para pendingAction stale de criar_agente');
            return {
              responseText: normalizeSimulatorLinkDeliveryText(String(parsed.message)),
              clearPendingAction: true,
            };
          }
        } catch (error) {
          console.warn('[ToolCalling] Falha ao recuperar link do simulador para conta ja criada:', error);
        }
      }

      console.log('[ToolCalling] Limpando pendingAction stale de criar_agente para cliente que ja possui conta');
      pendingAction = undefined;
    }
  }

  if (!pendingAction && !userId) {
    const recoveredCreateAction = await tryRecoverImplicitCreateConfirmation({
      messageText,
      phoneNumber,
      conversationHistory,
    });

    if (recoveredCreateAction) {
      const result = await executePendingActionWithSilentRetry({
        pendingAction: recoveredCreateAction,
        executionUserId: phoneNumber,
      });
      return {
        responseText: result.responseText,
        clearPendingAction: result.ok ? true : false,
        newPendingAction: result.keepPendingAction,
      };
    }
  }

  if (pendingAction) {
    shouldClearPendingAction = true;

    if (!userId && pendingAction.type !== 'criar_agente') {
      return {
        responseText: 'NÃ£o encontrei uma conta ativa para concluir aquela aÃ§Ã£o. Me diz o que vocÃª quer fazer e eu sigo por aqui.',
        clearPendingAction: true,
      };
    }

    if (pendingAction.expiresAt >= Date.now()) {
      if (isExplicitPendingConfirmationReply(messageText, pendingAction)) {
        const executionUserId = userId || phoneNumber;
        const result = await executePendingActionWithSilentRetry({
          pendingAction,
          executionUserId,
        });
        return {
          responseText: result.responseText,
          consumedPendingMedia: result.consumedPendingMedia,
          clearPendingAction: result.ok ? true : false,
          newPendingAction: result.keepPendingAction,
        };
      }

      if (isExplicitPendingCancelReply(messageText)) {
        return {
          responseText: 'Perfeito. Deixei essa aÃ§Ã£o de lado. Me diz como vocÃª quer seguir.',
          clearPendingAction: true,
        };
      }

      const decision = await decidePendingActionReply({
        pendingAction,
        messageText,
        conversationHistory,
      });

      if (decision === 'confirm') {
        const executionUserId = userId || phoneNumber;
        const result = await executePendingActionWithSilentRetry({
          pendingAction,
          executionUserId,
        });
        return {
          responseText: result.responseText,
          consumedPendingMedia: result.consumedPendingMedia,
          clearPendingAction: result.ok ? true : false,
          newPendingAction: result.keepPendingAction,
        };
      }

      if (decision === 'cancel') {
        return {
          responseText: 'Beleza, nÃ£o apliquei essa aÃ§Ã£o. Me diz como vocÃª quer seguir.',
          clearPendingAction: true,
        };
      }

      if (decision === 'modify') {
        if (pendingAction.type === 'criar_agente') {
          const currentDescription = firstNonEmptyString(
            pendingAction.payload.descricaoAtendimento,
            pendingAction.payload.attendanceDescription,
            pendingAction.payload.promptDescription,
            pendingAction.payload.instructions,
            pendingAction.payload.prompt,
          );

          const mergedDescription = [currentDescription, String(messageText || '').trim()]
            .filter(Boolean)
            .join('. ');

          const refreshedPendingAction = buildPendingConfirmationAction(
            'criar_agente',
            {
              ...pendingAction.payload,
              descricaoAtendimento: mergedDescription,
            },
            phoneNumber,
          );

          if (refreshedPendingAction) {
            return {
              responseText: refreshedPendingAction.proposedText,
              newPendingAction: refreshedPendingAction,
            };
          }
        }
      }

      if (decision === 'unclear') {
        return {
          responseText: pendingActionAlreadyAsksForConfirmation(pendingAction.proposedText)
            ? pendingAction.proposedText
            : `${pendingAction.proposedText}\n\nSe estiver certo, me confirma. Se quiser ajustar algo antes, me fala o que mudar.`,
          newPendingAction: pendingAction,
        };
      }
    }
  }

  // 1. Gather context
  const context = await gatherClientContext(userId);

  // 2. Build system prompt
  const systemPrompt = buildToolCallingSystemPrompt(phoneNumber, userId, {
    ...context,
    agentConfig,
    contactName,
    pendingMedia,
    recentMediaBuffer,
    hasDeliveredTestLink,
  });

  // 3. Build messages array with conversation history
  const historySlice = conversationHistory.slice(-20); // Last 10 exchanges
  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...historySlice.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: messageText },
  ];

  // Add media annotation if present
  if (mediaType && mediaType !== 'text' && mediaType !== 'chat' && mediaUrl) {
    messages.push({
      role: 'user',
      content: `[O cliente enviou uma midia do tipo "${mediaType}". URL: ${mediaUrl}]`,
    });

    messages.push({
      role: 'user',
      content: !userId
        ? '[SISTEMA: Esta midia foi enviada apenas para contextualizar o negocio durante o onboarding. Use o conteudo como contexto para criar a conta e entender a operacao. Nao entre em cadastro de midia nem pergunte quando o agente deve usar esse arquivo, a menos que o lead peca isso explicitamente.]'
        : '[SISTEMA: Esta midia pode ser apenas o meio pelo qual o cliente falou com voce. Trate a transcricao/conteudo como conversa normal. Nao presuma cadastro de midia so porque ele enviou audio, imagem, video ou documento. So entre em salvar_midia se o cliente pedir explicitamente para cadastrar esse arquivo no agente, ou se estiver completando/confirmando uma midia pendente. Se a intencao principal for outra, nao mencione o arquivo na resposta.]',
    });
  }

  // 4. Try native tool calling via Mistral SDK (with retry for 429)
  try {
    const mistral = await getMistralClient();
    let finalResponse = '';
    let consumedPendingMedia = false;

    const callMistralWithRetry = async (params: any, retries = 2): Promise<any> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await mistral.chat.complete(params);
        } catch (err: any) {
          const is429 = err?.statusCode === 429 || err?.message?.includes('429') || err?.message?.includes('Rate limit');
          if (is429 && attempt < retries) {
            const delay = (attempt + 1) * 2000; // 2s, 4s
            console.log(`[ToolCalling] Rate limit 429 â€” retry ${attempt + 1} em ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      console.log(`[ToolCalling] Round ${round + 1}/${MAX_TOOL_ROUNDS}`);

      const response = await callMistralWithRetry({
        model: 'mistral-small-latest',
        messages: messages as any,
        tools: TOOL_DEFINITIONS as any,
        toolChoice: 'auto' as any,
        maxTokens: 1024,
        temperature: 0.4,
      });

      const choice = response.choices?.[0];
      if (!choice) {
        console.error('[ToolCalling] LLM retornou sem choices');
        break;
      }

      const assistantMessage = choice.message;
      const toolCalls = (assistantMessage as any)?.toolCalls;

      // If no tool calls, we have the final text response
      if (!toolCalls || toolCalls.length === 0) {
        finalResponse = assistantMessage?.content as string || '';
        console.log(`[ToolCalling] Resposta final (round ${round + 1}): "${finalResponse.slice(0, 100)}..."`);
        break;
      }

      // Add assistant message with tool calls to history
      messages.push(assistantMessage);

      // Execute each tool call
      for (const tc of toolCalls) {
        const fnName = tc.function?.name || '';
        let fnArgs: Record<string, any> = {};

        try {
          fnArgs = typeof tc.function?.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : tc.function?.arguments || {};
        } catch {
          console.warn(`[ToolCalling] Falha ao parsear argumentos do tool ${fnName}`);
        }

        fnArgs = normalizeToolArguments(fnName, fnArgs);
        console.log(`[ToolCalling] Tool call: ${fnName}(${JSON.stringify(fnArgs).slice(0, 150)})`);

        // V23j: Enviar mensagem intermediÃ¡ria ANTES de operaÃ§Ãµes longas
        if (false && fnName === 'criar_agente' && sendIntermediateMessage) {
          try {
            await sendIntermediateMessage('â³ Estou preparando sua conta de teste agora, um momento...');
            console.log('[ToolCalling] Mensagem intermediÃ¡ria enviada antes de criar_agente');
          } catch (err) {
            console.warn('[ToolCalling] Falha ao enviar mensagem intermediÃ¡ria:', err);
          }
        }

        const toolResult = await executeToolCall(fnName, fnArgs, userId, phoneNumber, mediaType, mediaUrl, pendingMedia, recentMediaBuffer, messageText);

        try {
          const parsed = JSON.parse(toolResult);
          if (parsed?.requiresConfirmation && parsed?.pendingAction?.type && parsed?.message) {
            console.log(`[ToolCalling] ${fnName}: aguardando confirmaÃ§Ã£o explÃ­cita antes de executar`);
            return {
              responseText: parsed.message,
              newPendingAction: parsed.pendingAction,
              clearPendingAction: false,
            };
          }
        } catch {
          // segue fluxo normal
        }

        // For direct action results, intercept technical failures before they can leak back to the client.
        // criar_agente and editar_prompt are the most sensitive paths here because a retry/recovery
        // is better than exposing an internal execution error in the WhatsApp conversation.
        if (fnName === 'editar_prompt') {
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.success && parsed.message) {
              return {
                responseText: String(parsed.message).trim(),
                clearPendingAction: shouldClearPendingAction,
              };
            }
            if (parsed.success === false) {
              const rawFailureText = String(parsed.responseText || parsed.error || '').trim();
              return {
                responseText: buildDirectToolFailureReply(fnName, rawFailureText) || 'Estou aplicando esse ajuste aqui e te confirmo assim que terminar.',
                clearPendingAction: false,
              };
            }
          } catch {
            // segue fluxo normal
          }
        }

        // V23k: For criar_agente, return tool result DIRECTLY â€” bypasses LLM reformatting
        // which was fabricating fake emails/passwords and replacing simulator URLs
        if (fnName === 'criar_agente') {
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.success && parsed.message) {
              console.log('[ToolCalling] criar_agente: retornando resultado direto (bypass LLM reformat)');
              return {
                responseText: normalizeCreateAgentDeliveryText(parsed.message),
                clearPendingAction: shouldClearPendingAction,
              };
            }
            if (parsed.success === false) {
              console.warn('[ToolCalling] criar_agente falhou - retornando erro direto sem deixar a LLM inventar entrega');
              const rawFailureText = String(parsed.responseText || parsed.error || '').trim();
              return {
                responseText: buildDirectToolFailureReply(fnName, rawFailureText) || 'Estou terminando a configuracao do seu teste aqui e te mando o acesso assim que concluir.',
              };
            }
          } catch { /* parse failed, continue normal flow */ }
        }

        if (fnName === 'salvar_midia') {
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.success && parsed.message) {
              consumedPendingMedia = true;
              console.log('[ToolCalling] salvar_midia: retornando resultado direto para evitar confirmaÃ§Ã£o falsa');
              return { responseText: parsed.message, consumedPendingMedia: true, clearPendingAction: shouldClearPendingAction };
            }
            if (parsed.success === false) {
              const rawFailureText = String(parsed.responseText || parsed.error || '').trim();
              return {
                responseText: buildDirectToolFailureReply(fnName, rawFailureText) || 'Estou finalizando o cadastro dessa midia aqui e te confirmo assim que concluir.',
                clearPendingAction: false,
              };
            }
          } catch { /* parse failed, continue normal flow */ }
        }

        if (fnName === 'registrar_pagamento') {
          try {
            const parsed = JSON.parse(toolResult);
            if (parsed.success === false) {
              const rawFailureText = String(parsed.responseText || parsed.error || '').trim();
              return {
                responseText: buildDirectToolFailureReply(fnName, rawFailureText) || 'Estou validando esse comprovante aqui e te confirmo assim que terminar.',
                clearPendingAction: false,
              };
            }
          } catch { /* parse failed, continue normal flow */ }
        }

        // Add tool result to messages for next round
        messages.push({
          role: 'tool',
          toolCallId: tc.id,
          name: fnName,
          content: toolResult,
        });
      }

      // If this was the last round, force a text response
      if (round === MAX_TOOL_ROUNDS - 1) {
        console.log('[ToolCalling] Max rounds atingido â€” forÃ§ando resposta de texto');
        const finalResp = await callMistralWithRetry({
          model: 'mistral-small-latest',
          messages: messages as any,
          maxTokens: 800,
          temperature: 0.4,
        });
        finalResponse = finalResp.choices?.[0]?.message?.content as string || '';
      }
    }

    if (finalResponse) {
      const sanitized = await sanitizeAndInjectRealLinks(finalResponse, userId, phoneNumber);
      // V23k: Ensure simulator URLs from tool results survive LLM reformatting
      const toolMsgs = messages.filter((m: any) => m.role === 'tool');
      const preserved = preserveSimulatorUrlFromToolResults(sanitized, toolMsgs);
      const withAutologin = preserveAutologinUrlsFromToolResults(preserved, toolMsgs);
      const withCreds = preserveCredentialsFromToolResults(withAutologin, toolMsgs);
      const withNormalizedPlanReply = await normalizeAdminPlanResponse({
        responseText: withCreds,
        toolResultMessages: toolMsgs,
        messageText,
        userId,
        phoneNumber,
      });
      const recoveredMissingTool = await tryRecoverMissingToolExecution({
        phoneNumber,
        userId,
        messageText,
        assistantResponse: withNormalizedPlanReply,
        conversationHistory,
        mediaType,
        mediaUrl,
        pendingMedia,
      });
      if (recoveredMissingTool) {
        return {
          ...recoveredMissingTool,
          clearPendingAction: true,
        };
      }
      if (!consumedPendingMedia && pendingMedia) {
        const recovered = await tryRecoverPendingMediaSave({
          responseText: withNormalizedPlanReply,
          phoneNumber,
          userId,
          messageText,
          conversationHistory,
          pendingMedia,
        });
        if (recovered) {
          return { ...recovered, clearPendingAction: shouldClearPendingAction };
        }
      }
      const inferredPendingAction = await inferPendingActionFromAssistantReply({
        assistantResponse: withNormalizedPlanReply,
        messageText,
        phoneNumber,
        userId,
        conversationHistory,
        mediaType,
        mediaUrl,
        pendingMedia,
      });
      if (inferredPendingAction) {
        return {
          responseText: inferredPendingAction.proposedText,
          consumedPendingMedia,
          newPendingAction: inferredPendingAction,
        };
      }
      const mediaResolved = await resolveAdminMediaActions({
        responseText: withNormalizedPlanReply,
        messageText,
        conversationHistory,
      });
      return {
        responseText: mediaResolved.responseText,
        mediaActions: mediaResolved.mediaActions,
        consumedPendingMedia,
        clearPendingAction: shouldClearPendingAction,
      };
    }
  } catch (err: any) {
    console.error('[ToolCalling] Erro no tool calling nativo, tentando fallback JSON-in-text:', err?.message || err);

    // If tools were already executed (tool result messages exist), extract their results
    // so the fallback can include them instead of losing the data
    const toolResultMessages = messages.filter((m: any) => m.role === 'tool');
    if (toolResultMessages.length > 0) {
      console.log(`[ToolCalling] ${toolResultMessages.length} tool(s) jÃ¡ executada(s) â€” usando resultados diretos`);
      const results = toolResultMessages.map((m: any) => {
        try {
          const parsed = JSON.parse(m.content);
          return parsed.message || parsed.error || m.content;
        } catch {
          return m.content;
        }
      });
      // If we have tool results, return them directly (the tool already did the work)
      const combinedResult = results.join('\n\n');
      if (combinedResult && combinedResult.length > 10) {
        const sanitizedCombined = await sanitizeAndInjectRealLinks(combinedResult, userId, phoneNumber);
        const preservedCombined = preserveSimulatorUrlFromToolResults(sanitizedCombined, toolResultMessages);
        const withAutologinCombined = preserveAutologinUrlsFromToolResults(preservedCombined, toolResultMessages);
        const withCredsCombined = preserveCredentialsFromToolResults(withAutologinCombined, toolResultMessages);
        const consumedPendingMedia = toolResultMessages.some((m: any) => {
          if (m.name !== 'salvar_midia') return false;
          try {
            const parsed = JSON.parse(m.content);
            return Boolean(parsed?.success);
          } catch {
            return false;
          }
        });
        const mediaResolved = await resolveAdminMediaActions({
          responseText: withCredsCombined,
          messageText: String(messages[messages.length - 1]?.content || ''),
          conversationHistory: messages
            .filter((m: any) => m.role === 'user' || m.role === 'assistant')
            .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content || '') })),
        });
        return {
          responseText: mediaResolved.responseText,
          mediaActions: mediaResolved.mediaActions,
          consumedPendingMedia,
          clearPendingAction: shouldClearPendingAction,
        };
      }
    }
  }

  // 5. Fallback: JSON-in-text via chatComplete (works with any provider)
  console.log('[ToolCalling] Usando fallback JSON-in-text');
  return processWithJsonFallback(messages, userId, phoneNumber, messageText, mediaType, mediaUrl, pendingMedia, recentMediaBuffer, shouldClearPendingAction);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// JSON-in-text fallback (when native tool calling fails)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function processWithJsonFallback(
  messages: any[],
  userId: string | undefined,
  phoneNumber: string,
  messageText: string,
  mediaType?: string,
  mediaUrl?: string,
  pendingMedia?: PendingToolCallingMedia,
  recentMediaBuffer?: RecentToolCallingMedia[],
  pendingActionCleared: boolean = false,
): Promise<{
  responseText: string;
  mediaActions?: ToolCallingMediaAction[];
  consumedPendingMedia?: boolean;
  newPendingAction?: PendingAction;
  clearPendingAction?: boolean;
}> {
  // Append instruction for JSON tool calling format
  const toolNames = TOOL_DEFINITIONS.map(t => t.function.name).join(', ');
  const fallbackInstruction = `

INSTRUÃ‡ÃƒO ESPECIAL: Se vocÃª precisar executar uma aÃ§Ã£o, inclua EXATAMENTE este formato JSON no inÃ­cio da sua resposta:
\`\`\`json
{"tool_calls": [{"name": "NOME_DA_FERRAMENTA", "arguments": {PARAMETROS}}]}
\`\`\`

Ferramentas disponÃ­veis: ${toolNames}
Depois do JSON, escreva a mensagem normal para o cliente.
Se NÃƒO precisar de aÃ§Ã£o, responda normalmente sem JSON.`;

  // Modify system message to include fallback instruction
  const fallbackMessages: ChatMessage[] = messages.map((m, i) => {
    if (i === 0 && m.role === 'system') {
      return { role: 'system' as const, content: m.content + fallbackInstruction };
    }
    // Only include user/assistant/system messages (skip tool messages)
    if (['user', 'assistant', 'system'].includes(m.role)) {
      return { role: m.role as 'user' | 'assistant' | 'system', content: m.content || '' };
    }
    return null;
  }).filter(Boolean) as ChatMessage[];

  try {
    const response = await chatComplete({
      messages: fallbackMessages,
      maxTokens: 1024,
      temperature: 0.4,
      skipMistralQueue: true,
    });
    let rawText = response.choices?.[0]?.message?.content || '';

    // Check for embedded tool calls
    const toolCalls = parseFallbackToolCalls(rawText);
    if (toolCalls.length > 0) {
      // Remove JSON block from response text
      rawText = rawText
        .replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, '')
        .replace(/\{[\s\S]*"tool_calls"[\s\S]*?\}/i, '')
        .trim();

      // Execute tool calls
        const results: string[] = [];
        for (const tc of toolCalls) {
        const normalizedArgs = normalizeToolArguments(tc.tool, tc.arguments);
        const result = await executeToolCall(tc.tool, normalizedArgs, userId, phoneNumber, mediaType, mediaUrl, pendingMedia, recentMediaBuffer, messageText);
        results.push(result);

        try {
          const parsed = JSON.parse(result);
          if (parsed?.requiresConfirmation && parsed?.pendingAction?.type && parsed?.message) {
            console.log(`[ToolCalling-Fallback] ${tc.tool}: aguardando confirmaÃ§Ã£o explÃ­cita antes de executar`);
            return {
              responseText: parsed.message,
              newPendingAction: parsed.pendingAction,
              clearPendingAction: false,
            };
          }
        } catch {
          // segue fluxo normal
        }

        if (tc.tool === 'editar_prompt') {
          try {
            const parsed = JSON.parse(result);
            if (parsed.success && parsed.message) {
              return {
                responseText: String(parsed.message).trim(),
                clearPendingAction: pendingActionCleared,
              };
            }
              if (parsed.success === false) {
                const rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                return {
                  responseText: buildDirectToolFailureReply(tc.tool, rawFailureText) || 'Estou aplicando esse ajuste aqui e te confirmo assim que terminar.',
                  clearPendingAction: false,
                };
              }
          } catch { /* continue */ }
        }

        // V23k: For criar_agente, return tool result DIRECTLY (bypass LLM reformatting)
          if (tc.tool === 'criar_agente') {
            try {
              const parsed = JSON.parse(result);
              if (parsed.success && parsed.message) {
                console.log('[ToolCalling-Fallback] criar_agente: retornando resultado direto');
                return {
                  responseText: normalizeCreateAgentDeliveryText(parsed.message),
                  clearPendingAction: pendingActionCleared,
                };
              }
              if (parsed.success === false) {
                console.warn('[ToolCalling-Fallback] criar_agente falhou - retornando erro direto');
                const rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                return {
                  responseText: buildDirectToolFailureReply(tc.tool, rawFailureText) || 'Estou terminando a configuracao do seu teste aqui e te mando o acesso assim que concluir.',
                };
              }
            } catch { /* continue */ }
          }

          if (tc.tool === 'salvar_midia') {
            try {
              const parsed = JSON.parse(result);
              if (parsed.success && parsed.message) {
                console.log('[ToolCalling-Fallback] salvar_midia: retornando resultado direto');
                return { responseText: parsed.message, consumedPendingMedia: true, clearPendingAction: pendingActionCleared };
              }
              if (parsed.success === false) {
                const rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                return {
                  responseText: buildDirectToolFailureReply(tc.tool, rawFailureText) || 'Estou finalizando o cadastro dessa midia aqui e te confirmo assim que concluir.',
                  clearPendingAction: false,
                };
              }
            } catch { /* continue */ }
          }

          if (tc.tool === 'registrar_pagamento') {
            try {
              const parsed = JSON.parse(result);
              if (parsed.success === false) {
                const rawFailureText = String(parsed.responseText || parsed.error || '').trim();
                return {
                  responseText: buildDirectToolFailureReply(tc.tool, rawFailureText) || 'Estou validando esse comprovante aqui e te confirmo assim que terminar.',
                  clearPendingAction: false,
                };
              }
            } catch { /* continue */ }
          }
        }

      // If we have remaining text, return it enriched with tool results
      if (rawText) {
        const sanitizedFallback = await sanitizeAndInjectRealLinks(rawText, userId, phoneNumber);
        const toolMsgsFallback = results.map(r => ({ role: 'tool', content: r }));
        const preservedFallback = preserveSimulatorUrlFromToolResults(sanitizedFallback, toolMsgsFallback);
        const withAutologinFallback = preserveAutologinUrlsFromToolResults(preservedFallback, toolMsgsFallback);
        const withCredsFallback = preserveCredentialsFromToolResults(withAutologinFallback, toolMsgsFallback);
        const fallbackConversationHistory = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content || '') }));
        const recoveredMissingTool = await tryRecoverMissingToolExecution({
          phoneNumber,
          userId,
          messageText: String(messages[messages.length - 1]?.content || ''),
          assistantResponse: withCredsFallback,
          conversationHistory: fallbackConversationHistory,
          mediaType,
          mediaUrl,
          pendingMedia,
        });
        if (recoveredMissingTool) {
          return { ...recoveredMissingTool, clearPendingAction: true };
        }
        if (pendingMedia) {
          const recovered = await tryRecoverPendingMediaSave({
            phoneNumber,
            userId,
            messageText: String(messages[messages.length - 1]?.content || ''),
            conversationHistory: fallbackConversationHistory,
            pendingMedia,
          });
          if (recovered) {
            return { ...recovered, clearPendingAction: pendingActionCleared };
          }
        }
        const inferredPendingAction = await inferPendingActionFromAssistantReply({
          assistantResponse: withCredsFallback,
          messageText: String(messages[messages.length - 1]?.content || ''),
          phoneNumber,
          userId,
          conversationHistory: fallbackConversationHistory,
          mediaType,
          mediaUrl,
          pendingMedia,
        });
        if (inferredPendingAction) {
          return {
            responseText: inferredPendingAction.proposedText,
            newPendingAction: inferredPendingAction,
          };
        }
        const mediaResolved = await resolveAdminMediaActions({
          responseText: withCredsFallback,
          messageText: String(messages[messages.length - 1]?.content || ''),
          conversationHistory: fallbackConversationHistory,
        });
        return {
          responseText: mediaResolved.responseText,
          mediaActions: mediaResolved.mediaActions,
          clearPendingAction: pendingActionCleared,
        };
      }

      // Otherwise, generate a response incorporating tool results
      const toolResultsSummary = results.map(r => {
        try {
          const parsed = JSON.parse(r);
          return parsed.message || parsed.error || r;
        } catch {
          return r;
        }
      }).join('\n');

      const mediaResolved = await resolveAdminMediaActions({
        responseText: toolResultsSummary,
        messageText: String(messages[messages.length - 1]?.content || ''),
        conversationHistory: messages
          .filter((m: any) => m.role === 'user' || m.role === 'assistant')
          .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content || '') })),
      });
      return {
        responseText: mediaResolved.responseText,
        mediaActions: mediaResolved.mediaActions,
        clearPendingAction: pendingActionCleared,
      };
    }

    // No tool calls â€” still validate if the LLM only proposed or falsely claimed execution
    const sanitizedNoTool = await sanitizeAndInjectRealLinks(
      rawText || 'Desculpe, tive uma dificuldade tÃ©cnica. Como posso ajudar?',
      userId,
      phoneNumber,
    );
    const noToolConversationHistory = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content || '') }));
    const noToolMessageText = String(messages[messages.length - 1]?.content || '');

    const recoveredMissingTool = await tryRecoverMissingToolExecution({
      phoneNumber,
      userId,
      messageText: noToolMessageText,
      assistantResponse: sanitizedNoTool,
      conversationHistory: noToolConversationHistory,
      mediaType,
      mediaUrl,
      pendingMedia,
    });
    if (recoveredMissingTool) {
      return {
        ...recoveredMissingTool,
        clearPendingAction: true,
      };
    }

    if (pendingMedia) {
      const recovered = await tryRecoverPendingMediaSave({
        phoneNumber,
        userId,
        messageText: noToolMessageText,
        conversationHistory: noToolConversationHistory,
        pendingMedia,
      });
      if (recovered) {
        return { ...recovered, clearPendingAction: pendingActionCleared };
      }
    }

    const inferredPendingAction = await inferPendingActionFromAssistantReply({
      assistantResponse: sanitizedNoTool,
      messageText: noToolMessageText,
      phoneNumber,
      userId,
      conversationHistory: noToolConversationHistory,
      mediaType,
      mediaUrl,
      pendingMedia,
    });
    if (inferredPendingAction) {
      return {
        responseText: inferredPendingAction.proposedText,
        newPendingAction: inferredPendingAction,
      };
    }

    const mediaResolved = await resolveAdminMediaActions({
      responseText: sanitizedNoTool,
      messageText: noToolMessageText,
      conversationHistory: noToolConversationHistory,
    });
    return {
      responseText: mediaResolved.responseText,
      mediaActions: mediaResolved.mediaActions,
      clearPendingAction: pendingActionCleared,
    };
  } catch (err: any) {
    console.error('[ToolCalling] Fallback falhou:', err?.message || err);
    const fallbackConversationHistory = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content || '') }));

    return {
      responseText: buildHumanFallbackReply({
        messageText: String(messages[messages.length - 1]?.content || ''),
        userId,
        conversationHistory: fallbackConversationHistory,
      }),
      clearPendingAction: pendingActionCleared,
    };
  }
}
