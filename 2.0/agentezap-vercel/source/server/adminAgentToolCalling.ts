/**
 * Admin Agent orchestration bridge.
 *
 * The live path is Codex CLI context + structured JSON contract.
 * Local helpers only apply deterministic side effects after a Codex contract.
 */

import {
  executeCodexCreateAgentContract,
  getOrCreateSimulatorUrlForUser,
  type CodexCreateAgentExecutionResult,
  type PendingAction,
} from './actionExecutorV2';
import { storage } from './storage';
import { listarVersoes } from './promptHistoryService';
import { db } from './db';
import { agentMediaLibrary } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import {
  generateAdminMediaPromptBlock,
  getAdminMediaList,
  getAdminMediaByName,
  type AdminMedia,
} from './adminMediaStore';
import { clampAdminReplyLength } from './adminReplyPolicy';
import {
  isAgenteZapLiveCliRuntimeEnabled,
  isAgenteZapLiveCliRuntimeShadowEnabled,
  runAgenteZapLiveCliRuntime,
  type AgenteZapLiveCliAction,
  type AgenteZapLiveCliScope,
} from './agenteZapLiveCliRuntime';
import { extractStructuredJsonObject } from './agenteZapLiveCliJson';
import { buildMediaEvidenceContext } from './mediaEvidenceContext';
import type { MediaEvidenceContext } from './mediaEvidenceContext';
import { approveVisualPaymentReceiptFromWhatsApp } from './paymentReceiptService';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

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

const TEXTUAL_MEDIA_TAG_PATTERN = /\[\s*(?:MEDIA|ENVIAR_MIDIA|MIDIA)\s*:/i;

function hasTextualMediaTag(text: string): boolean {
  return TEXTUAL_MEDIA_TAG_PATTERN.test(String(text || ''));
}

function getStructuredMediaActionName(action: AgenteZapLiveCliAction): string {
  const args = action.arguments || {};
  const value =
    args['mediaName'] ??
    args['media_name'] ??
    args['name'] ??
    args['media'];
  return String(value || '').trim();
}

async function resolveMediaActionsFromPlanActions(
  actions: AgenteZapLiveCliAction[],
): Promise<ToolCallingMediaAction[] | undefined> {
  const mediaActions = actions.filter((action) => action.type === 'send_media');
  if (!mediaActions.length) {
    return undefined;
  }

  const resolvedMediaActions: ToolCallingMediaAction[] = [];
  for (const action of mediaActions) {
    const mediaName = getStructuredMediaActionName(action);
    if (!mediaName) continue;

    const mediaData = await getAdminMediaByName(undefined, mediaName);
    if (!mediaData) continue;
    resolvedMediaActions.push({
      type: 'send_media',
      media_name: mediaName,
      mediaData,
    });
  }

  return resolvedMediaActions.length > 0 ? resolvedMediaActions : undefined;
}

function normalizeToolArguments(
  toolName: string,
  toolArgs: Record<string, any>,
): Record<string, any> {
  return toolArgs;
}

function buildCreateAgentSourceBriefFromHistory(
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessageText: string,
): string {
  const entries = [
    ...conversationHistory,
    { role: 'user' as const, content: String(currentMessageText || '').trim() },
  ];
  const userMessages = entries
    .filter((msg) => msg.role === 'user')
    .map((msg) => String(msg.content || '').trim())
    .filter(Boolean);

  return userMessages.join('\n\n');
}

function mergeCreateAgentSourceBrief(
  currentBrief: unknown,
  newText: unknown,
): string {
  const current = String(currentBrief || '').trim();
  const next = String(newText || '').trim();
  if (!current) return next;
  if (!next || current.includes(next)) return current;
  return [current, next].join('\n\n');
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

function isRodrigoAdminScope(scope: AgenteZapLiveCliScope): boolean {
  return scope === 'rodrigo_agent_creator' || scope === 'rodrigo_existing_account_support';
}

function getActionStringArg(args: Record<string, unknown>, keys: string[]): string | null {
  return firstNonEmptyString(...keys.map((key) => args[key]));
}

function isUsableVisualPaymentEvidence(
  evidence: MediaEvidenceContext | null | undefined,
  expectedMediaUrl?: string,
): evidence is MediaEvidenceContext {
  if (!evidence || evidence.status !== 'ok') return false;
  if (evidence.kind !== 'image' && evidence.kind !== 'pdf') return false;
  if (evidence.provider === 'metadata_only' || evidence.provider === 'unavailable') return false;
  if (!String(evidence.extractedText || '').trim()) return false;

  const expected = normalizePublicUrlForComparison(expectedMediaUrl || '');
  const actual = normalizePublicUrlForComparison(evidence.mediaUrl || '');
  return !expected || actual === expected;
}

// Main export - Codex context-only loop
// -----------------------------------------------------------------------------

async function resolveAdminToolCallingOwnerEmail(): Promise<string | undefined> {
  return String(process.env.AGENTEZAP_ADMIN_OWNER_EMAIL || 'rodrigo4@gmail.com').trim();
}

async function resolveAdminToolCallingLLMUserId(userId?: string): Promise<string | undefined> {
  return userId || String(process.env.AGENTEZAP_ADMIN_OWNER_USER_ID || '').trim() || undefined;
}

function buildAdminToolCallingConversationId(userId: string | undefined, phoneNumber: string): string {
  return `admin-agentic-${userId || 'new'}-${String(phoneNumber || '').replace(/\D/g, '') || 'unknown'}`;
}

function resolveAdminLiveCliScope(userId?: string): AgenteZapLiveCliScope {
  return userId ? 'rodrigo_existing_account_support' : 'rodrigo_agent_creator';
}

function firstLiveCliAction(
  actions: AgenteZapLiveCliAction[],
  types: string[],
): AgenteZapLiveCliAction | null {
  const allowed = new Set(types);
  return actions.find((action) => allowed.has(action.type)) || null;
}

function buildLiveCliFailureClosedResult(params: {
  pendingAction?: PendingAction;
  userId?: string;
}): {
  responseText: string;
  newPendingAction?: PendingAction;
  clearPendingAction?: boolean;
} {
  return {
    responseText: '',
    newPendingAction: params.pendingAction,
    clearPendingAction: false,
  };
}

function buildCodexCreateAgentPendingContract(params: {
  args: Record<string, unknown>;
  phoneNumber: string;
  proposedText: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  messageText: string;
}): PendingAction | null {
  const args = params.args || {};
  const companyName = String(args.nomeEmpresa || args.companyName || '').trim();
  if (!companyName) return null;
  const sourceCustomerBrief = firstNonEmptyString(
    args.sourceCustomerBrief,
    args.originalCustomerBrief,
    args.customerBrief,
    args.fullCustomerContext,
  ) || buildCreateAgentSourceBriefFromHistory(params.conversationHistory, params.messageText);

  return {
    type: 'codex_create_agent_contract',
    payload: {
      nomeEmpresa: companyName,
      ramoAtuacao: String(args.ramoAtuacao || args.businessSegment || '').trim(),
      descricaoAtendimento: String(
        args.descricaoAtendimento ||
          args.serviceDescription ||
          args.instructions ||
          '',
      ).trim(),
      sourceCustomerBrief,
      originalCustomerBrief: sourceCustomerBrief,
      phoneNumber: params.phoneNumber,
    },
    proposedText: params.proposedText,
    expiresAt: Date.now() + 12 * 60_000,
  };
}

function normalizePublicUrlForComparison(value: string): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/[)\].,;!?]+$/g, '')
    .replace(/^http:\/\//i, 'https://')
    .replace(/\/+$/g, '');
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    if (parsed.hostname.toLowerCase() === 'agentezap.online') {
      parsed.hostname = 'www.agentezap.online';
    }
    return parsed.toString().replace(/\/+$/g, '');
  } catch {
    return cleaned;
  }
}

function extractPublicUrlsFromText(text: string): string[] {
  return Array.from(String(text || '').matchAll(/https?:\/\/[^\s<>"')\]]+/gi))
    .map((match) => normalizePublicUrlForComparison(match[0]))
    .filter(Boolean);
}

function isCodexAuthoredCreateAgentDeliveryTextValid(text: string, expectedSimulatorUrl: string): boolean {
  const normalizedExpected = normalizePublicUrlForComparison(expectedSimulatorUrl);
  if (!normalizedExpected) return false;
  const urls = extractPublicUrlsFromText(text);
  const uniqueUrls = Array.from(new Set(urls));
  if (uniqueUrls.length !== 1 || uniqueUrls[0] !== normalizedExpected) {
    return false;
  }

  const textWithoutExpectedUrl = String(text || '').replaceAll(expectedSimulatorUrl, '');
  if (/\/(?:plans|conexao|connect|login)\b|token=|senha|password|credencia(?:l|is)|painel/i.test(textWithoutExpectedUrl)) {
    return false;
  }

  return true;
}

async function renderCodexCreateAgentDeliveryMessage(params: {
  executionResult: CodexCreateAgentExecutionResult;
  scope: AgenteZapLiveCliScope;
  ownerEmail?: string;
  llmUserId?: string;
  conversationId: string;
  phoneNumber: string;
  messages: ChatMessage[];
  contextArtifacts?: Record<string, unknown>;
}): Promise<string> {
  const artifacts = params.executionResult.artifacts;
  if (!params.executionResult.success || !artifacts?.simulatorUrl) {
    return '';
  }

  const evidence = {
    sideEffect: 'codex_create_agent_contract',
    status: 'validated',
    simulatorUrl: normalizePublicUrlForComparison(artifacts.simulatorUrl),
    simulatorToken: artifacts.simulatorToken,
    validationTurns: artifacts.validationTurns,
    validationTranscript: artifacts.validationTranscript,
    isExistingAccount: artifacts.isExistingAccount,
    companyName: artifacts.companyName || null,
  };

  const deliveryInstruction = [
    '[SISTEMA: EVIDENCIA NEUTRA DE SIDE EFFECT VALIDADO]',
    'O executor deterministico materializou e validou o agente pedido pelo contrato JSON do Codex.',
    'Agora escreva a mensagem publica final somente em customerFacingMessages, no tom/configuracao do tenant e historico real.',
    'Inclua exatamente o simulatorUrl abaixo se for entregar o link. Nao invente credenciais, painel, preco, conexao ou dados tecnicos.',
    'Links publicos do AgenteZap devem aparecer com o dominio completo https://www.agentezap.online/... para ficar claro para clientes leigos.',
    'Nao devolva novas actions nesta etapa; se nao conseguir escrever com seguranca, use no_send sem texto.',
    JSON.stringify(evidence),
  ].join('\n');

  const deliveryResult = await runAgenteZapLiveCliRuntime({
    scope: params.scope,
    ownerEmail: params.ownerEmail,
    userId: params.llmUserId,
    conversationId: params.conversationId,
    contactPhone: params.phoneNumber,
    messages: [
      ...params.messages,
      { role: 'user', content: deliveryInstruction } as ChatMessage,
    ],
    currentMessage: deliveryInstruction,
    contextArtifacts: {
      ...(params.contextArtifacts || {}),
      codexCreateAgentExecution: evidence,
    },
    timeoutMs: ADMIN_TOOL_CALLING_AUX_TIMEOUT_MS,
  });

  const hasUnexpectedAction = deliveryResult.plan.actions.some(
    (action) => !['reply_text', 'no_send'].includes(action.type),
  );
  const text = deliveryResult.plan.customerFacingMessages.filter(Boolean).join('\n\n').trim();
  if (hasUnexpectedAction || !text || hasTextualMediaTag(text) || !isCodexAuthoredCreateAgentDeliveryTextValid(text, evidence.simulatorUrl)) {
    console.warn('[ToolCalling] Entrega de agente criada, mas Codex nao retornou mensagem publica valida com o link validado; falhando fechado.');
    return '';
  }

  return clampAdminReplyLength(text);
}

async function executeVisualReceiptApprovalFromCodexAction(params: {
  action: AgenteZapLiveCliAction;
  scope: AgenteZapLiveCliScope;
  phoneNumber: string;
  userId?: string;
  liveText: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaEvidence?: MediaEvidenceContext | null;
  pendingActionCleared?: boolean;
  pendingAction?: PendingAction;
}): Promise<{
  responseText: string;
  newPendingAction?: PendingAction;
  clearPendingAction?: boolean;
}> {
  if (!isRodrigoAdminScope(params.scope) || !params.liveText) {
    return buildLiveCliFailureClosedResult({ pendingAction: params.pendingAction, userId: params.userId });
  }

  if (!isUsableVisualPaymentEvidence(params.mediaEvidence, params.mediaUrl)) {
    console.warn('[ToolCalling] approve_payment_from_visual_receipt sem evidencia visual atual suficiente; falhando fechado.');
    return buildLiveCliFailureClosedResult({ pendingAction: params.pendingAction, userId: params.userId });
  }

  const args = params.action.arguments || {};
  const amountPaid = getActionStringArg(args, ['valorPago', 'amountPaid', 'amount', 'valor']);
  const paymentDate = getActionStringArg(args, ['dataPagamento', 'paymentDate', 'date', 'data']);
  const receiptStatus = getActionStringArg(args, ['statusComprovante', 'receiptStatus', 'status']);
  const receiverName = getActionStringArg(args, ['recebedor', 'receiverName']);
  const receiverInstitution = getActionStringArg(args, ['instituicaoRecebedor', 'receiverInstitution', 'bancoRecebedor']);
  const subscriptionId = getActionStringArg(args, ['subscriptionId']);
  const evidenceSummary =
    getActionStringArg(args, ['evidenceSummary', 'visualEvidenceSummary', 'reason']) ||
    String(params.mediaEvidence.extractedText || '').slice(0, 1000);

  if (!amountPaid || !paymentDate || !receiptStatus || !receiverName || !receiverInstitution || !subscriptionId) {
    console.warn('[ToolCalling] approve_payment_from_visual_receipt sem subscriptionId/valor/data/status/recebedor estruturados; falhando fechado.');
    return buildLiveCliFailureClosedResult({ pendingAction: params.pendingAction, userId: params.userId });
  }

  try {
    const approval = await approveVisualPaymentReceiptFromWhatsApp({
      userId: params.userId,
      phoneNumber: params.phoneNumber,
      sourceUrl: params.mediaEvidence.mediaUrl,
      subscriptionId,
      amountPaid,
      paymentDate,
      receiptStatus,
      receiverName,
      receiverInstitution,
      evidenceSummary,
      mimeTypeHint: params.mediaMimeType || params.mediaEvidence.mimeType || undefined,
    });

    console.log('[ToolCalling] Pagamento aprovado por evidencia visual via Codex action', {
      receiptId: approval.receiptId,
      subscriptionId: approval.subscriptionId,
      userId: approval.userId,
      amountPaid: approval.amountPaid,
      expectedAmount: approval.expectedAmount,
    });

    return {
      responseText: clampAdminReplyLength(params.liveText),
      clearPendingAction: params.pendingActionCleared,
    };
  } catch (error) {
    console.warn(
      '[ToolCalling] Falha ao aprovar pagamento por evidencia visual:',
      error instanceof Error ? error.message : String(error || ''),
    );
    return buildLiveCliFailureClosedResult({ pendingAction: params.pendingAction, userId: params.userId });
  }
}

async function maybeRunAgenteZapLiveCliRuntime(params: {
  messages: ChatMessage[];
  userId?: string;
  conversationId?: string;
  phoneNumber: string;
  messageText: string;
  pendingAction?: PendingAction;
  mediaType?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  pendingMedia?: PendingToolCallingMedia;
  recentMediaBuffer?: RecentToolCallingMedia[];
  pendingActionCleared?: boolean;
  contextArtifacts?: Record<string, unknown>;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{
  responseText: string;
  mediaActions?: ToolCallingMediaAction[];
  consumedPendingMedia?: boolean;
  newPendingAction?: PendingAction;
  clearPendingAction?: boolean;
} | null> {
  const enabled = isAgenteZapLiveCliRuntimeEnabled();
  const shadow = isAgenteZapLiveCliRuntimeShadowEnabled() && !enabled;
  if (!enabled && !shadow) return null;

  const ownerEmail = await resolveAdminToolCallingOwnerEmail();
  const llmUserId = await resolveAdminToolCallingLLMUserId(params.userId);
  const scope = resolveAdminLiveCliScope(params.userId);
  const result = await runAgenteZapLiveCliRuntime({
    scope,
    ownerEmail,
    userId: llmUserId,
    conversationId: params.conversationId || buildAdminToolCallingConversationId(llmUserId || params.userId, params.phoneNumber),
    contactPhone: params.phoneNumber,
    messages: params.messages,
    currentMessage: params.messageText,
    pendingAction: params.pendingAction
      ? {
          type: params.pendingAction.type,
          payload: params.pendingAction.payload || {},
          proposedText: params.pendingAction.proposedText || '',
          expiresAt: params.pendingAction.expiresAt,
          isExpired: params.pendingAction.expiresAt < Date.now(),
        }
      : undefined,
    contextArtifacts: params.contextArtifacts,
    timeoutMs: ADMIN_TOOL_CALLING_MAIN_TIMEOUT_MS,
  });

  console.log('[ToolCalling] AgenteZapLiveCliRuntime plan', {
    scope: result.plan.scope,
    decision: result.plan.decision,
    actions: result.plan.actions.map((action) => action.type),
    violations: result.violations,
    shadow,
  });

  if (!enabled) return null;

  const liveText = result.plan.customerFacingMessages.filter(Boolean).join('\n\n').trim();
  if (hasTextualMediaTag(liveText)) {
    console.warn('[ToolCalling] Codex retornou tag textual de midia em fala publica; falhando fechado para exigir send_media estruturado.');
    return buildLiveCliFailureClosedResult({ pendingAction: params.pendingAction, userId: params.userId });
  }

  const pendingControlAction = params.pendingAction
    ? firstLiveCliAction(result.plan.actions, ['confirm_pending_action', 'cancel_pending_action', 'keep_pending_action'])
    : null;

  if (pendingControlAction && params.pendingAction) {
    if (pendingControlAction.type === 'confirm_pending_action') {
      if (params.pendingAction.type === 'codex_create_agent_contract') {
        const executionResult = await executeCodexCreateAgentContract({
          phoneNumber: params.phoneNumber,
          payload: params.pendingAction.payload || {},
        });
        const responseText = await renderCodexCreateAgentDeliveryMessage({
          executionResult,
          scope,
          ownerEmail,
          llmUserId,
          conversationId: params.conversationId || buildAdminToolCallingConversationId(llmUserId || params.userId, params.phoneNumber),
          phoneNumber: params.phoneNumber,
          messages: params.messages,
          contextArtifacts: params.contextArtifacts,
        });
        return {
          responseText,
          clearPendingAction: executionResult.success,
          newPendingAction: executionResult.success ? undefined : params.pendingAction,
        };
      }

      return buildLiveCliFailureClosedResult({ pendingAction: params.pendingAction, userId: params.userId });
    }

    if (pendingControlAction.type === 'cancel_pending_action') {
      return { responseText: liveText, clearPendingAction: true };
    }

    return {
      responseText: liveText,
      newPendingAction: params.pendingAction,
      clearPendingAction: false,
    };
  }

  const createAction = firstLiveCliAction(result.plan.actions, [
    'summarize_before_create_agent',
    'prepare_create_agent',
    'revise_agent_summary',
  ]);
  if (createAction && (result.plan.scope === 'rodrigo_agent_creator' || result.plan.scope === 'rodrigo_existing_account_support')) {
    const pendingContract = buildCodexCreateAgentPendingContract({
      args: createAction.arguments || {},
      phoneNumber: params.phoneNumber,
      proposedText: liveText,
      conversationHistory: params.conversationHistory,
      messageText: params.messageText,
    });
    if (!pendingContract || !liveText) {
      return buildLiveCliFailureClosedResult({ pendingAction: params.pendingAction, userId: params.userId });
    }

    if (createAction.type === 'prepare_create_agent' && createAction.requiresConfirmation !== true) {
      const executionResult = await executeCodexCreateAgentContract({
        phoneNumber: params.phoneNumber,
        payload: pendingContract.payload,
      });
      const responseText = await renderCodexCreateAgentDeliveryMessage({
        executionResult,
        scope,
        ownerEmail,
        llmUserId,
        conversationId: params.conversationId || buildAdminToolCallingConversationId(llmUserId || params.userId, params.phoneNumber),
        phoneNumber: params.phoneNumber,
        messages: params.messages,
        contextArtifacts: params.contextArtifacts,
      });
      return {
        responseText,
        clearPendingAction: executionResult.success,
      };
    }

    return {
      responseText: pendingContract.proposedText,
      newPendingAction: pendingContract,
      clearPendingAction: false,
    };
  }

  const visualReceiptApprovalAction = firstLiveCliAction(result.plan.actions, ['approve_payment_from_visual_receipt']);
  if (visualReceiptApprovalAction) {
    return executeVisualReceiptApprovalFromCodexAction({
      action: visualReceiptApprovalAction,
      scope: result.plan.scope,
      phoneNumber: params.phoneNumber,
      userId: params.userId,
      liveText,
      mediaUrl: params.mediaUrl,
      mediaMimeType: params.mediaMimeType,
      mediaEvidence: params.contextArtifacts?.currentMediaEvidence as MediaEvidenceContext | null | undefined,
      pendingActionCleared: params.pendingActionCleared,
      pendingAction: params.pendingAction,
    });
  }

  if (liveText) {
    const mediaActions = await resolveMediaActionsFromPlanActions(result.plan.actions);
    return {
      responseText: liveText,
      mediaActions,
      clearPendingAction: params.pendingActionCleared,
    };
  }

  return buildLiveCliFailureClosedResult({ pendingAction: params.pendingAction, userId: params.userId });
}

const MAX_TOOL_ROUNDS = 3;

export async function processToolCallingMessage(
  phoneNumber: string,
  messageText: string,
  userId: string | undefined,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  pendingAction?: PendingAction,
  agentConfig?: {
    name?: string;
    company?: string;
    role?: string;
    prompt?: string;
    companyDescription?: string;
    businessFaqItems?: unknown;
    productsServices?: unknown;
    businessInfo?: unknown;
    policies?: unknown;
  },
  contactName?: string,
  mediaType?: string,
  mediaUrl?: string,
  sendIntermediateMessage?: (text: string) => Promise<void>,
  pendingMedia?: PendingToolCallingMedia,
  recentMediaBuffer?: RecentToolCallingMedia[],
  runtimeOptions?: { conversationId?: string; mediaMimeType?: string | null },
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

  if (pendingAction && pendingAction.type !== 'codex_create_agent_contract') {
    pendingAction = undefined;
  }

  if (pendingAction) {
    shouldClearPendingAction = true;
  }

  // 1. Gather context before any sensitive branch. The live CLI plan is the only
  // semantic decision point for this bridge.
  const context = await gatherClientContext(userId, phoneNumber, runtimeOptions?.conversationId);
  const mediaFromRecentBuffer = mediaUrl
    ? (recentMediaBuffer || []).find((item) => String(item.url || '').trim() === String(mediaUrl || '').trim())
    : null;
  const mediaMimeType = String(
    runtimeOptions?.mediaMimeType ||
    mediaFromRecentBuffer?.mimeType ||
    pendingMedia?.mimeType ||
    '',
  ).trim();
  const currentMediaEvidence = mediaType && mediaUrl
    ? await buildMediaEvidenceContext({
        mediaType,
        mimeType: mediaMimeType || undefined,
        mediaUrl,
        userId,
      })
    : null;

  // 2. Build system prompt
  const systemPrompt = buildToolCallingSystemPrompt(phoneNumber, userId, {
    ...context,
    agentConfig,
    contactName,
    pendingMedia,
    recentMediaBuffer,
    hasDeliveredTestLink,
  });

  // 3. Build the real conversation transcript. Codex-live receives complete
  // tenant/conversation context without using a local system prompt as a public
  // message author.
  const historySlice = conversationHistory;
  const liveCliMessages: any[] = [
    ...historySlice.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: messageText },
  ];

  // Add media annotation if present
  if (mediaType && mediaType !== 'text' && mediaType !== 'chat' && mediaUrl) {
    liveCliMessages.push({
      role: 'user',
      content: `[O cliente enviou uma midia do tipo "${mediaType}"${mediaMimeType ? `; mime="${mediaMimeType}"` : ''}. URL: ${mediaUrl}]`,
    });

    liveCliMessages.push({
      role: 'user',
      content: !userId
        ? '[SISTEMA: Esta midia foi enviada apenas para contextualizar o negocio durante o onboarding. Use o conteudo como contexto para criar a conta e entender a operacao. Nao entre em cadastro de midia nem pergunte quando o agente deve usar esse arquivo, a menos que o lead peca isso explicitamente.]'
        : '[SISTEMA: Esta midia pode ser apenas o meio pelo qual o cliente falou com voce. Trate a transcricao/conteudo como conversa normal. Nao presuma cadastro de midia so porque ele enviou audio, imagem, video ou documento. Se a intencao principal for outra, nao mencione o arquivo na resposta.]',
    });

    if (currentMediaEvidence) {
      liveCliMessages.push({
        role: 'user',
        content: [
          '[SISTEMA: Evidencia neutra extraida da midia atual. Use como contexto factual, mas nao trate isto como aprovacao automatica, liberacao de conta ou mensagem publica pronta.]',
          JSON.stringify({
            ...currentMediaEvidence,
            extractedText: currentMediaEvidence.extractedText
              ? currentMediaEvidence.extractedText.slice(0, 6000)
              : null,
          }),
        ].join('\n'),
      });
    }
  }

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...liveCliMessages,
  ];

  const liveCliRuntimeResult = await maybeRunAgenteZapLiveCliRuntime({
    messages: liveCliMessages as ChatMessage[],
    userId,
    conversationId: runtimeOptions?.conversationId,
    phoneNumber,
    messageText,
    pendingAction,
    mediaType,
    mediaUrl,
    mediaMimeType,
    pendingMedia,
    recentMediaBuffer,
    pendingActionCleared: shouldClearPendingAction,
    conversationHistory,
    contextArtifacts: {
      adminToolCallingContext: context,
      agentConfig,
      contactName,
      pendingMedia: pendingMedia || null,
      recentMediaBuffer: recentMediaBuffer || [],
      currentMediaEvidence: currentMediaEvidence || null,
      mediaType: mediaType || null,
      mediaMimeType: mediaMimeType || null,
      mediaUrl: mediaUrl || null,
      pendingActionCleared: shouldClearPendingAction,
      hasDeliveredTestLink,
    },
  });
  if (liveCliRuntimeResult) {
    return liveCliRuntimeResult;
  }

  return buildLiveCliFailureClosedResult({
    pendingAction,
    userId,
  });
}
