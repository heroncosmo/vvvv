import { spawn } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { parseAgenteZapLiveCliJson } from './agenteZapLiveCliJson';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export const AGENTEZAP_LIVE_CLI_SCHEMA_VERSION = 'agentezap_live_cli_plan_v1';
export const RODRIGO_AGENT_CREATOR_EMAIL = 'rodrigo4@gmail.com';

export type AgenteZapLiveCliScope =
  | 'tenant_customer_support'
  | 'rodrigo_agent_creator'
  | 'rodrigo_existing_account_support'
  | 'personalize_prompt'
  | 'simulator_validation';

export type AgenteZapLiveCliDecision =
  | 'respond'
  | 'ask_more_context'
  | 'propose_action'
  | 'handoff_human'
  | 'no_send';

export type AgenteZapLiveCliActionType =
  | 'reply_text'
  | 'confirm_pending_action'
  | 'cancel_pending_action'
  | 'keep_pending_action'
  | 'ask_business_context'
  | 'summarize_before_create_agent'
  | 'prepare_create_agent'
  | 'revise_agent_summary'
  | 'prepare_prompt_edit'
  | 'prepare_save_media'
  | 'approve_payment_from_visual_receipt'
  | 'request_simulator_test'
  | 'prepare_connection_link'
  | 'prepare_payment_link'
  | 'send_media'
  | 'route_sector'
  | 'schedule_followup'
  | 'handoff_human'
  | 'no_send';

export interface AgenteZapLiveCliAction {
  type: AgenteZapLiveCliActionType;
  requiresConfirmation?: boolean;
  reason?: string;
  arguments?: Record<string, unknown>;
}

export interface AgenteZapLiveCliPlan {
  schemaVersion: typeof AGENTEZAP_LIVE_CLI_SCHEMA_VERSION;
  scope: AgenteZapLiveCliScope;
  decision: AgenteZapLiveCliDecision;
  confidence: number;
  customerFacingMessages: string[];
  messages: string[];
  actions: AgenteZapLiveCliAction[];
  evidence: {
    filesRead?: string[];
    contextUsed?: string[];
    uncertainty?: string[];
  };
}

export interface AgenteZapLiveCliRuntimeResult {
  plan: AgenteZapLiveCliPlan;
  rawText: string;
  violations: string[];
}

export type AgenteZapLiveCliRuntimeInput = {
  scope: AgenteZapLiveCliScope;
  ownerEmail?: string;
  userId?: string;
  conversationId: string;
  contactPhone?: string;
  messages: ChatMessage[];
  currentMessage: string;
  pendingAction?: AgenteZapLiveCliPendingActionContext;
  contextArtifacts?: Record<string, unknown>;
  maxTokens?: number;
  timeoutMs?: number;
};

export interface AgenteZapLiveCliPendingActionContext {
  type: string;
  payload?: Record<string, unknown>;
  proposedText?: string;
  expiresAt?: number;
  isExpired?: boolean;
}

const BASE_ACTIONS: AgenteZapLiveCliActionType[] = [
  'reply_text',
  'confirm_pending_action',
  'cancel_pending_action',
  'keep_pending_action',
  'handoff_human',
  'no_send',
  'schedule_followup',
];

const TENANT_SUPPORT_ACTIONS: AgenteZapLiveCliActionType[] = [
  ...BASE_ACTIONS,
  'send_media',
  'route_sector',
];

const RODRIGO_CREATOR_ACTIONS: AgenteZapLiveCliActionType[] = [
  ...BASE_ACTIONS,
  'send_media',
  'ask_business_context',
  'summarize_before_create_agent',
  'prepare_create_agent',
  'revise_agent_summary',
  'request_simulator_test',
  'prepare_connection_link',
  'prepare_payment_link',
  'approve_payment_from_visual_receipt',
];

const RODRIGO_EXISTING_ACCOUNT_ACTIONS: AgenteZapLiveCliActionType[] = [
  ...BASE_ACTIONS,
  'send_media',
  'ask_business_context',
  'summarize_before_create_agent',
  'prepare_create_agent',
  'revise_agent_summary',
  'prepare_prompt_edit',
  'prepare_save_media',
  'request_simulator_test',
  'prepare_connection_link',
  'prepare_payment_link',
  'approve_payment_from_visual_receipt',
];

const PERSONALIZE_ACTIONS: AgenteZapLiveCliActionType[] = [
  'reply_text',
  'prepare_prompt_edit',
  'handoff_human',
  'no_send',
];

const SIMULATOR_ACTIONS: AgenteZapLiveCliActionType[] = [
  'reply_text',
  'request_simulator_test',
  'prepare_prompt_edit',
  'handoff_human',
  'no_send',
];

const ALL_ACTIONS: AgenteZapLiveCliActionType[] = [
  ...new Set([
    ...TENANT_SUPPORT_ACTIONS,
    ...RODRIGO_CREATOR_ACTIONS,
    ...RODRIGO_EXISTING_ACCOUNT_ACTIONS,
    ...PERSONALIZE_ACTIONS,
    ...SIMULATOR_ACTIONS,
  ]),
];

const ACTION_ARGUMENT_KEYS = [
  'nomeEmpresa',
  'companyName',
  'ramoAtuacao',
  'businessSegment',
  'descricaoAtendimento',
  'serviceDescription',
  'sourceCustomerBrief',
  'originalCustomerBrief',
  'customerBrief',
  'fullCustomerContext',
  'instructions',
  'descricaoMudanca',
  'changeDescription',
  'name',
  'nome',
  'whenToUse',
  'quandoUsar',
  'description',
  'descricao',
  'mediaUrl',
  'mediaType',
  'mediaName',
  'media_name',
  'media',
  'plan',
  'url',
  'reason',
  'sectorName',
  'followUpAt',
  'amountPaid',
  'valorPago',
  'amount',
  'valor',
  'expectedAmount',
  'valorEsperado',
  'paymentDate',
  'dataPagamento',
  'date',
  'data',
  'receiptStatus',
  'statusComprovante',
  'status',
  'evidenceSummary',
  'visualEvidenceSummary',
  'receiverName',
  'recebedor',
  'receiverInstitution',
  'instituicaoRecebedor',
  'bancoRecebedor',
  'payerName',
  'pagador',
  'customerEmail',
  'subscriptionId',
] as const;

const RODRIGO_ONLY_ACTIONS = new Set<AgenteZapLiveCliActionType>([
  'ask_business_context',
  'summarize_before_create_agent',
  'prepare_create_agent',
  'revise_agent_summary',
  'prepare_prompt_edit',
  'prepare_save_media',
  'request_simulator_test',
  'prepare_connection_link',
  'prepare_payment_link',
  'approve_payment_from_visual_receipt',
]);

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function buildEmptyActionArguments(): Record<(typeof ACTION_ARGUMENT_KEYS)[number], string | null> {
  return Object.fromEntries(ACTION_ARGUMENT_KEYS.map((key) => [key, null])) as Record<
    (typeof ACTION_ARGUMENT_KEYS)[number],
    string | null
  >;
}

function normalizeScopeForOwner(scope: AgenteZapLiveCliScope, ownerEmail?: string): AgenteZapLiveCliScope {
  if (!scope.startsWith('rodrigo_')) {
    return scope;
  }
  return normalizeEmail(ownerEmail) === RODRIGO_AGENT_CREATOR_EMAIL ? scope : 'tenant_customer_support';
}

export function getAgenteZapLiveCliAllowedActionTypes(
  scope: AgenteZapLiveCliScope,
  ownerEmail?: string,
): AgenteZapLiveCliActionType[] {
  const effectiveScope = normalizeScopeForOwner(scope, ownerEmail);
  switch (effectiveScope) {
    case 'rodrigo_agent_creator':
      return [...RODRIGO_CREATOR_ACTIONS];
    case 'rodrigo_existing_account_support':
      return [...RODRIGO_EXISTING_ACCOUNT_ACTIONS];
    case 'personalize_prompt':
      return [...PERSONALIZE_ACTIONS];
    case 'simulator_validation':
      return [...SIMULATOR_ACTIONS];
    case 'tenant_customer_support':
    default:
      return [...TENANT_SUPPORT_ACTIONS];
  }
}

export function isAgenteZapLiveCliRuntimeEnabled(): boolean {
  return true;
}

export function isAgenteZapLiveCliRuntimeShadowEnabled(): boolean {
  return false;
}

function readBooleanEnv(key: string, fallback: boolean): boolean {
  const raw = String(process.env[key] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'sim', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'nao', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
}

function clampConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const raw = item as Record<string, unknown>;
        return String(raw.content || raw.text || raw.message || '').trim();
      }
      return String(item || '').trim();
    })
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeCustomerFacingMessages(raw: Record<string, unknown>): string[] {
  const direct = normalizeMessages(raw.customerFacingMessages);
  if (direct.length > 0) return direct;

  const fromMessages = normalizeMessages(raw.messages);
  if (fromMessages.length > 0) return fromMessages;

  const single = String(raw.responseText || raw.response || raw.message || raw.reply || '').trim();
  return single ? [single].slice(0, 1) : [];
}

function normalizeAction(value: unknown): AgenteZapLiveCliAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const type = String(raw.type || '').trim() as AgenteZapLiveCliActionType;
  if (!type) return null;
  const args = raw.arguments && typeof raw.arguments === 'object' && !Array.isArray(raw.arguments)
    ? raw.arguments as Record<string, unknown>
    : {};
  return {
    type,
    requiresConfirmation: raw.requiresConfirmation === true,
    reason: String(raw.reason || '').trim() || undefined,
    arguments: args,
  };
}

export function sanitizeAgenteZapLiveCliPlan(
  candidate: unknown,
  params: {
    scope: AgenteZapLiveCliScope;
    ownerEmail?: string;
  },
): { plan: AgenteZapLiveCliPlan; violations: string[] } {
  const raw = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : {};
  const violations: string[] = [];
  const effectiveScope = normalizeScopeForOwner(params.scope, params.ownerEmail);
  if (effectiveScope !== params.scope) {
    violations.push('rodrigo_scope_blocked_for_non_rodrigo_owner');
  }

  const allowed = new Set(getAgenteZapLiveCliAllowedActionTypes(params.scope, params.ownerEmail));
  const rawActions = Array.isArray(raw.actions) ? raw.actions : [];
  const actions: AgenteZapLiveCliAction[] = [];
  for (const rawAction of rawActions) {
    const action = normalizeAction(rawAction);
    if (!action) continue;
    if (!allowed.has(action.type)) {
      violations.push(
        RODRIGO_ONLY_ACTIONS.has(action.type)
          ? `rodrigo_only_action_blocked:${action.type}`
          : `action_not_allowed:${action.type}`,
      );
      continue;
    }
    if (
      (action.type === 'prepare_create_agent' ||
        action.type === 'summarize_before_create_agent' ||
        action.type === 'revise_agent_summary') &&
      !['rodrigo_agent_creator', 'rodrigo_existing_account_support'].includes(effectiveScope)
    ) {
      violations.push(`create_agent_action_requires_rodrigo_creator_scope:${action.type}`);
      continue;
    }
    if (
      (action.type === 'prepare_prompt_edit' ||
        action.type === 'prepare_save_media') &&
      !['rodrigo_existing_account_support', 'personalize_prompt', 'simulator_validation'].includes(effectiveScope)
    ) {
      violations.push(`agent_edit_action_requires_existing_account_scope:${action.type}`);
      continue;
    }
    actions.push(action);
  }

  const allowedDecisions: AgenteZapLiveCliDecision[] = [
    'respond',
    'ask_more_context',
    'propose_action',
    'handoff_human',
    'no_send',
  ];
  const decision = allowedDecisions.includes(raw.decision as AgenteZapLiveCliDecision)
    ? raw.decision as AgenteZapLiveCliDecision
    : actions.length > 0
      ? 'propose_action'
      : 'respond';

  const evidence = raw.evidence && typeof raw.evidence === 'object' && !Array.isArray(raw.evidence)
    ? raw.evidence as Record<string, unknown>
    : {};
  const customerFacingMessages = normalizeCustomerFacingMessages(raw);

  return {
    plan: {
      schemaVersion: AGENTEZAP_LIVE_CLI_SCHEMA_VERSION,
      scope: effectiveScope,
      decision,
      confidence: clampConfidence(raw.confidence),
      customerFacingMessages,
      messages: customerFacingMessages,
      actions,
      evidence: {
        filesRead: Array.isArray(evidence.filesRead) ? evidence.filesRead.map(String).slice(0, 40) : [],
        contextUsed: Array.isArray(evidence.contextUsed) ? evidence.contextUsed.map(String).slice(0, 40) : [],
        uncertainty: Array.isArray(evidence.uncertainty) ? evidence.uncertainty.map(String).slice(0, 20) : [],
      },
    },
    violations,
  };
}

export function buildAgenteZapLiveCliPrompt(params: {
  scope: AgenteZapLiveCliScope;
  ownerEmail?: string;
  currentMessage: string;
  messageCount: number;
  pendingAction?: AgenteZapLiveCliPendingActionContext;
}): string {
  const effectiveScope = normalizeScopeForOwner(params.scope, params.ownerEmail);
  const allowed = getAgenteZapLiveCliAllowedActionTypes(params.scope, params.ownerEmail);
  const pendingActionBlock = params.pendingAction
    ? JSON.stringify({
        type: params.pendingAction.type,
        proposedText: params.pendingAction.proposedText || '',
        payload: params.pendingAction.payload || {},
        expiresAt: params.pendingAction.expiresAt || null,
        isExpired: params.pendingAction.isExpired === true,
      })
    : 'nenhuma';
  const scopeContractLines = effectiveScope === 'rodrigo_agent_creator'
    ? [
        'Contrato Rodrigo/agente novo: este scope pode atender leads do AgenteZap e devolver actions estruturadas de criacao/configuracao quando o prompt/config do tenant e o historico indicarem isso.',
        'Identidade, tom, oferta, ordem de perguntas e jeito de conduzir o lead devem vir do prompt/configuracao do tenant Rodrigo e do historico completo, nao deste contrato tecnico.',
        'Se a conversa ja trouxe dados do negocio, use esses dados como contexto. Nao descarte historico, transcricoes, midias ou evidencias ja entregues.',
        'Ao devolver summarize_before_create_agent, prepare_create_agent ou revise_agent_summary, preencha sourceCustomerBrief com o briefing original completo informado pelo cliente na conversa. descricaoAtendimento pode ser um resumo; sourceCustomerBrief deve preservar detalhes, precos, regras, objecoes, exemplos e instrucoes do cliente sem reescrever como frase pronta.',
        'Se o historico/briefing trouxer um e-mail explicito do cliente ou da conta, copie esse e-mail exatamente em arguments.customerEmail nas actions summarize_before_create_agent, prepare_create_agent ou revise_agent_summary. Nao invente e-mail e deixe customerEmail null se estiver ausente ou incerto.',
        'Depois de resumo/proposta sensivel, use pendingAction e actions estruturadas para o executor aplicar efeitos auditaveis; nao diga que executou sem action executavel.',
        'Pagamento Rodrigo: quando a midia atual tiver evidencia visual/OCR/PDF suficiente de pagamento concluido, valor pago, data, recebedor, instituicao do recebedor e vinculo ao cliente/plano, devolva action approve_payment_from_visual_receipt com arguments.subscriptionId, arguments.valorPago, arguments.dataPagamento, arguments.statusComprovante, arguments.recebedor, arguments.instituicaoRecebedor e arguments.evidenceSummary. O executor validara tecnicamente e so entao ativara assinatura e pausara follow-up.',
        'Nao aprove pagamento por texto solto, promessa, comprovante ilegivel, subscriptionId ausente/divergente, valor/data/recebedor/instituicao ausentes, valor divergente, data fora da janela, recebedor/banco errado, cliente/plano errado ou sem currentMediaEvidence ok; nesses casos use handoff_human/no_send/ask_more_context.',
        'Quando o contexto do executor/banco indicar pagamento aprovado, assinatura ativa, manual_receipt_approved ou admin_mark_paid, trate o cliente como pago: nao agende cobranca/follow-up de nao pagante. O executor de pagamento pausara follow-up e filas abertas como side effect auditavel.',
      ]
    : effectiveScope === 'rodrigo_existing_account_support'
      ? [
          'Contrato Rodrigo/conta vinculada: use a conta existente como contexto para criar, atualizar, editar, testar, conectar ou orientar plano pelo WhatsApp, sempre com action estruturada e confirmacao antes de efeito sensivel.',
          'Se a conta ja tem agente e o cliente pede ajuste especifico, use prepare_prompt_edit. Se ele quer testar, recriar, montar ou atualizar o agente de demonstracao com novo briefing, use summarize_before_create_agent, revise_agent_summary ou prepare_create_agent conforme o historico.',
          'Nao trate conta vinculada como motivo para mandar o cliente criar conta no site. Painel/login/conexao so entram quando o cliente pedir esse acesso ou quando o contrato JSON pedir a capacidade/side effect auditavel correspondente.',
          'Pagamento Rodrigo: quando a midia atual tiver evidencia visual/OCR/PDF suficiente de pagamento concluido, valor pago, data, recebedor, instituicao do recebedor e vinculo ao cliente/plano, devolva action approve_payment_from_visual_receipt com arguments.subscriptionId, arguments.valorPago, arguments.dataPagamento, arguments.statusComprovante, arguments.recebedor, arguments.instituicaoRecebedor e arguments.evidenceSummary. O executor validara tecnicamente e so entao ativara assinatura e pausara follow-up.',
          'Nao aprove pagamento por texto solto, promessa, comprovante ilegivel, subscriptionId ausente/divergente, valor/data/recebedor/instituicao ausentes, valor divergente, data fora da janela, recebedor/banco errado, cliente/plano errado ou sem currentMediaEvidence ok; nesses casos use handoff_human/no_send/ask_more_context.',
          'Quando o contexto do executor/banco indicar pagamento aprovado, assinatura ativa, manual_receipt_approved ou admin_mark_paid, trate o cliente como pago: nao agende cobranca/follow-up de nao pagante. O executor de pagamento pausara follow-up e filas abertas como side effect auditavel.',
        ]
      : effectiveScope === 'tenant_customer_support'
        ? [
            'Contrato tenant normal: responda como agente do proprio cliente usando todo contexto do tenant/conversa. Nao ofereca capacidades internas do Rodrigo e nao crie conta/agente do AgenteZap.',
            'Identidade, tom, saudacao, perguntas, oferta e estilo de mensagem devem vir do prompt/configuracao/dados do tenant e do historico completo, nao deste contrato tecnico.',
            'Se houver midias/catalogo/funil no contexto, use isso como evidencia do tenant. Para efeito externo, devolva action estruturada; para texto publico, siga o prompt do tenant.',
            'Nao use respostas genericas de fallback quando o historico ja mostra o assunto. Leia a conversa inteira e use a ultima correcao do cliente como fonte mais forte.',
          ]
        : [
            'Contrato especializado: use o contexto recebido e devolva somente resposta/action estruturada para o executor SaaS.',
          ];

  return [
    'Voce e o cerebro Codex CLI real do AgenteZap, executado por codex exec.',
    'Trabalhe como CLI vivo: leia os arquivos de contexto/evidencia do turno com rg, cat, sed ou ls antes de decidir.',
    'O contexto completo fica em arquivos do diretorio do turno. Use esses arquivos como fonte primaria, nao memoria nem regra local.',
    'No WhatsApp, humanos costumam mandar varias mensagens curtas em segundos. Trate a mensagem atual como um lote do turno e use o historico inteiro para nao responder apenas a primeira linha.',
    'Antes do envio publico, o runtime relera a conversa; se houver nova mensagem do cliente depois do snapshot que voce recebeu, sua resposta sera descartada e o turno sera reprocessado com o lote completo.',
    'Nao execute efeito externo direto. O Codex decide em JSON; o executor SaaS aplica capacidades/side effects auditaveis depois.',
    'Responda somente JSON valido, sem markdown, sem texto fora do objeto JSON.',
    'Se nao tiver seguranca para responder ou agir, use decision no_send ou handoff_human com uncertainty explicita. Nao invente fallback.',
    `schemaVersion obrigatorio: ${AGENTEZAP_LIVE_CLI_SCHEMA_VERSION}.`,
    `scope efetivo: ${effectiveScope}.`,
    `acoes permitidas neste scope: ${allowed.join(', ')}.`,
    `pendingAction atual: ${pendingActionBlock}.`,
    ...scopeContractLines,
    'Se existir pendingAction, decida por contexto: confirm_pending_action quando confirmou claramente sem mudar nada; cancel_pending_action quando cancelou; keep_pending_action quando incompleto/ambiguo; revise/prepare quando confirmou mas tambem corrigiu ou acrescentou algo.',
    'Nunca trate uma confirmacao misturada com correcao como confirm_pending_action. Atualize o resumo/proposta e peca nova confirmacao.',
    'Para criacao/edicao/salvamento sensivel, proponha resumo e confirmacao por action. Nao diga que executou se nao devolver action executavel.',
    'Para send_media, use arguments.mediaName com o nome exato da midia no contexto quando souber. Se nao souber o nome exato, responda pedindo esclarecimento em vez de inventar.',
    'Para respostas comuns de atendimento, prefira customerFacingMessages com texto pronto para WhatsApp e actions vazio, salvo quando existir efeito claro para executor.',
    'Formato exato esperado pelo schema:',
    JSON.stringify({
      schemaVersion: AGENTEZAP_LIVE_CLI_SCHEMA_VERSION,
      scope: effectiveScope,
      decision: 'respond',
      confidence: 0.7,
      customerFacingMessages: ['texto publico para WhatsApp'],
      messages: ['texto publico para WhatsApp'],
      actions: params.pendingAction
        ? [{
          type: 'keep_pending_action',
            requiresConfirmation: false,
            reason: 'aguardar confirmacao clara',
            arguments: {
              ...buildEmptyActionArguments(),
              reason: 'aguardar confirmacao clara',
            },
          }]
        : [],
      evidence: {
        filesRead: ['turn-context/00-runtime-contract.md', 'turn-context/02-conversation.md'],
        contextUsed: ['prompt do tenant', 'historico completo'],
        uncertainty: [],
      },
    }),
    `Quantidade de mensagens entregues pelo caller: ${params.messageCount}.`,
    `Mensagem atual do cliente: ${params.currentMessage || '[sem texto]'}`,
  ].join('\n');
}

function buildAgenteZapCodexCliOutputSchema(scope: AgenteZapLiveCliScope, ownerEmail?: string): Record<string, unknown> {
  const effectiveScope = normalizeScopeForOwner(scope, ownerEmail);
  const nullableString = { type: ['string', 'null'] };
  const actionArgumentProperties = Object.fromEntries(
    ACTION_ARGUMENT_KEYS.map((key) => [key, nullableString]),
  );
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'schemaVersion',
      'scope',
      'decision',
      'confidence',
      'customerFacingMessages',
      'messages',
      'actions',
      'evidence',
    ],
    properties: {
      schemaVersion: { type: 'string', const: AGENTEZAP_LIVE_CLI_SCHEMA_VERSION },
      scope: { type: 'string', const: effectiveScope },
      decision: { type: 'string', enum: ['respond', 'ask_more_context', 'propose_action', 'handoff_human', 'no_send'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      customerFacingMessages: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      messages: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      actions: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'requiresConfirmation', 'reason', 'arguments'],
          properties: {
            type: { type: 'string', enum: ALL_ACTIONS },
            requiresConfirmation: { type: 'boolean' },
            reason: nullableString,
            arguments: {
              type: 'object',
              additionalProperties: false,
              required: ACTION_ARGUMENT_KEYS,
              properties: actionArgumentProperties,
            },
          },
        },
      },
      evidence: {
        type: 'object',
        additionalProperties: false,
        required: ['filesRead', 'contextUsed', 'uncertainty'],
        properties: {
          filesRead: { type: 'array', items: { type: 'string' }, maxItems: 40 },
          contextUsed: { type: 'array', items: { type: 'string' }, maxItems: 40 },
          uncertainty: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        },
      },
    },
  };
}

export function extractAgenteZapLiveCliText(plan: AgenteZapLiveCliPlan): string {
  return (plan.customerFacingMessages || [])
    .map((message) => String(message || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function readIntEnv(key: string, fallback: number): number {
  const parsed = Number.parseInt(String(process.env[key] ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getProjectRoot(): string {
  return path.resolve(process.env.AGENTEZAP_CODEX_CLI_PROJECT_ROOT || process.cwd());
}

function getCodexBinary(): string {
  const configured = String(process.env.AGENTEZAP_CODEX_CLI_BIN || process.env.CODEX_CLI_BIN || '').trim();
  if (configured) return configured;
  return process.platform === 'win32' ? 'codex.cmd' : 'codex';
}

function getCodexHome(projectRoot: string): string {
  const configured = String(process.env.AGENTEZAP_CODEX_CLI_HOME || '').trim();
  return path.resolve(configured || path.join(projectRoot, '.codex-runs', 'agentezap-codex-chatgpt-home'));
}

function selectCodexModel(params: { scope: AgenteZapLiveCliScope; ownerEmail?: string; contextArtifacts?: Record<string, unknown> }): string {
  if (params.scope === 'personalize_prompt') {
    return String(process.env.AGENTEZAP_CODEX_CLI_PERSONALIZE_MODEL || 'gpt-5.5').trim();
  }
  if (normalizeEmail(params.ownerEmail) === RODRIGO_AGENT_CREATOR_EMAIL) {
    return String(process.env.AGENTEZAP_CODEX_CLI_RODRIGO_MODEL || 'gpt-5.5').trim();
  }
  return String(process.env.AGENTEZAP_CODEX_CLI_TENANT_MODEL || 'gpt-5.4-mini').trim();
}

function selectCodexTenantFallbackModel(): string {
  return String(process.env.AGENTEZAP_CODEX_CLI_TENANT_FALLBACK_MODEL || 'gpt-5.4-mini').trim();
}

function isRodrigoCodexOwner(ownerEmail?: string): boolean {
  return normalizeEmail(ownerEmail) === RODRIGO_AGENT_CREATOR_EMAIL;
}

function isCodexModelQuotaFailure(error: unknown): boolean {
  const text = (error instanceof Error ? error.message : String(error || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return (
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('ratelimit') ||
    text.includes('rate_limit') ||
    text.includes('usage limit') ||
    text.includes('usage_limit') ||
    text.includes('insufficient credits') ||
    text.includes('insufficient_credit') ||
    text.includes('insufficient_quota') ||
    text.includes('limit exceeded') ||
    text.includes('limite') ||
    text.includes('cota')
  );
}

function isCodexRetryableExecutionTimeout(error: unknown): boolean {
  const text = (error instanceof Error ? error.message : String(error || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return text.includes('codex_exec_failed') && text.includes('timedout=true');
}

function getCodexExecutionTimeoutRetryMs(timeoutMs: number): number {
  return readIntEnv('AGENTEZAP_CODEX_CLI_TIMEOUT_RETRY_MS', Math.max(timeoutMs, 300_000));
}

function buildCodexExecutionTimeoutRetryInstructions(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error || '');
  const shortEvidence = message.replace(/\s+/g, ' ').slice(0, 900);
  return [
    'A tentativa anterior do codex exec atingiu timeout antes de gravar um JSON final confiavel.',
    'Isso nao autoriza resposta local, fallback textual, frase pronta, resumo inventado ou decisao fora do Codex.',
    'Rode a decisao final agora usando os mesmos arquivos/evidencias do turno e o PACOTE CRITICO INLINE DE RECUPERACAO.',
    'Se a tentativa anterior exibiu JSON intermediario/no_send apenas para ler arquivos, trate aquilo como rascunho operacional, nao como decisao final.',
    'A mensagem publica, se houver, ainda deve vir somente do prompt/configuracao/dados do tenant e do historico real.',
    `Evidencia resumida do timeout anterior: ${shortEvidence}`,
  ];
}

function selectCodexReasoningEffort(params: { scope: AgenteZapLiveCliScope; ownerEmail?: string; contextArtifacts?: Record<string, unknown> }): string {
  if (normalizeEmail(params.ownerEmail) === RODRIGO_AGENT_CREATOR_EMAIL) {
    return String(process.env.AGENTEZAP_CODEX_CLI_RODRIGO_REASONING_EFFORT || process.env.AGENTEZAP_CODEX_CLI_REASONING_EFFORT || 'xhigh').trim();
  }
  return String(process.env.AGENTEZAP_CODEX_CLI_TENANT_REASONING_EFFORT || process.env.AGENTEZAP_CODEX_CLI_REASONING_EFFORT || 'medium').trim();
}

function buildCodexEnv(codexHome: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_HOME: codexHome,
    NO_COLOR: '1',
  };
  if (String(process.env.AGENTEZAP_CODEX_CLI_AUTH_MODE || 'chatgpt').toLowerCase() !== 'api_key') {
    delete env.OPENAI_API_KEY;
    delete env.CODEX_API_KEY;
  }
  return env;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function compactForInlineContext(value: unknown, maxChars: number): string {
  const text = typeof value === 'string' ? value : safeJson(value);
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.72);
  const tail = Math.max(0, maxChars - head - 160);
  return [
    text.slice(0, head),
    `\n\n[...conteudo compactado para caber no prompt inline; arquivos do turno contem a versao completa. caracteres_originais=${text.length}...]\n\n`,
    tail > 0 ? text.slice(-tail) : '',
  ].join('');
}

function writeContextFile(filePath: string, content: string): string {
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function extractTenantPromptContext(contextArtifacts: Record<string, unknown> | undefined): string {
  const root: any = contextArtifacts || {};
  const candidates = [
    root?.agentConfig?.prompt,
    root?.aiAgentConfig?.prompt,
    root?.config?.prompt,
    root?.businessConfig?.prompt,
    root?.tenantConfig?.prompt,
    root?.adminToolCallingContext?.agentConfig?.prompt,
    root?.adminToolCallingContext?.aiAgentConfig?.prompt,
    root?.adminToolCallingContext?.config?.prompt,
    root?.adminToolCallingContext?.businessConfig?.prompt,
    root?.tenantContext?.effectivePrompt,
    root?.tenantContext?.activePrompt,
    root?.tenantContext?.agentConfig?.prompt,
    root?.tenantContext?.aiAgentConfig?.prompt,
    root?.tenantContext?.config?.prompt,
  ];
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text) return text;
  }
  return '';
}

function formatConversationMarkdown(messages: ChatMessage[]): string {
  return messages
    .map((message, index) => {
      const role = String(message.role || 'unknown');
      const content = String(message.content || '');
      return `## ${index + 1}. ${role}\n\n${content}`;
    })
    .join('\n\n---\n\n');
}

function buildAgenteZapInlineRecoveryContext(input: AgenteZapLiveCliRuntimeInput): string {
  const inlineLimit = readIntEnv('AGENTEZAP_CODEX_CLI_INLINE_CONTEXT_CHARS', 70_000);
  const effectiveScope = normalizeScopeForOwner(input.scope, input.ownerEmail);
  const tenantPrompt = extractTenantPromptContext(input.contextArtifacts || {});
  const tenantPromptInlineLimit = Math.max(12_000, Math.floor(inlineLimit * 0.65));
  return safeJson({
    note: 'PACOTE CRITICO INLINE DE RECUPERACAO. Os arquivos do turno continuam sendo a fonte completa, mas este pacote impede no_send falso quando o shell sandbox do Codex CLI nao conseguir ler arquivos por bwrap/namespace/permissao.',
    operational_rule: 'Se comandos como cat/rg/ls/sed falharem por sandbox, bwrap, namespace ou permissao, continue com este pacote inline e devolva decisao JSON. Isso nao e motivo valido para no_send quando ha contexto abaixo.',
    tenant_prompt_rule: 'O campo tenantPromptMarkdown abaixo e copia neutra do prompt/configuracao do tenant. Use como fonte de contexto quando nao conseguir ler 08-tenant-prompt.md; nao transforme isso em regra global do produto.',
    schemaVersion: AGENTEZAP_LIVE_CLI_SCHEMA_VERSION,
    scope: input.scope,
    effectiveScope,
    ownerEmail: input.ownerEmail || null,
    userId: input.userId || null,
    conversationId: input.conversationId,
    contactPhone: input.contactPhone || null,
    currentMessage: input.currentMessage,
    pendingAction: input.pendingAction || null,
    tenantPromptAvailable: Boolean(tenantPrompt),
    tenantPromptChars: tenantPrompt.length,
    tenantPromptInlineTruncated: tenantPrompt.length > tenantPromptInlineLimit,
    tenantPromptMarkdown: tenantPrompt
      ? compactForInlineContext(tenantPrompt, tenantPromptInlineLimit)
      : '',
    contextArtifacts: compactForInlineContext(input.contextArtifacts || {}, Math.max(12_000, Math.floor(inlineLimit * 0.35))),
    allowedActions: getAgenteZapLiveCliAllowedActionTypes(input.scope, input.ownerEmail),
    conversationMarkdown: compactForInlineContext(formatConversationMarkdown(input.messages), inlineLimit),
    conversationJson: compactForInlineContext(input.messages.map((message, index) => ({
      index,
      role: message.role,
      content: message.content,
    })), Math.max(12_000, Math.floor(inlineLimit * 0.45))),
  });
}

function writeCodexCliContextFiles(params: {
  contextDir: string;
  runtimePrompt: string;
  runtimeInput: AgenteZapLiveCliRuntimeInput;
  model: string;
  reasoningEffort: string;
  schema: Record<string, unknown>;
}): string[] {
  mkdirSync(params.contextDir, { recursive: true });
  const input = params.runtimeInput;
  const effectiveScope = normalizeScopeForOwner(input.scope, input.ownerEmail);
  const files: string[] = [];

  files.push(writeContextFile(
    path.join(params.contextDir, '00-runtime-contract.md'),
    params.runtimePrompt,
  ));
  files.push(writeContextFile(
    path.join(params.contextDir, '01-turn.json'),
    safeJson({
      schemaVersion: AGENTEZAP_LIVE_CLI_SCHEMA_VERSION,
      scope: input.scope,
      effectiveScope,
      ownerEmail: input.ownerEmail || null,
      userId: input.userId || null,
      conversationId: input.conversationId,
      contactPhone: input.contactPhone || null,
      currentMessage: input.currentMessage,
      pendingAction: input.pendingAction || null,
      model: params.model,
      reasoningEffort: params.reasoningEffort,
      allowedActions: getAgenteZapLiveCliAllowedActionTypes(input.scope, input.ownerEmail),
      createdAt: new Date().toISOString(),
    }),
  ));
  files.push(writeContextFile(
    path.join(params.contextDir, '02-conversation.md'),
    formatConversationMarkdown(input.messages),
  ));
  files.push(writeContextFile(
    path.join(params.contextDir, '03-conversation.json'),
    safeJson(input.messages.map((message, index) => ({
      index,
      role: message.role,
      content: message.content,
    }))),
  ));
  files.push(writeContextFile(
    path.join(params.contextDir, '04-pending-action.json'),
    safeJson(input.pendingAction || null),
  ));
  files.push(writeContextFile(
    path.join(params.contextDir, '05-output-schema.json'),
    safeJson(params.schema),
  ));
  files.push(writeContextFile(
    path.join(params.contextDir, '06-allowed-actions.json'),
    safeJson({
      allowedActions: getAgenteZapLiveCliAllowedActionTypes(input.scope, input.ownerEmail),
      rodrigoOnlyActions: Array.from(RODRIGO_ONLY_ACTIONS),
    }),
  ));
  files.push(writeContextFile(
    path.join(params.contextDir, '07-context-artifacts.json'),
    safeJson(input.contextArtifacts || {}),
  ));
  const tenantPrompt = extractTenantPromptContext(input.contextArtifacts || {});
  if (tenantPrompt) {
    files.push(writeContextFile(
      path.join(params.contextDir, '08-tenant-prompt.md'),
      tenantPrompt,
    ));
  }
  return files;
}

function buildCodexCliInstruction(params: {
  contextDir: string;
  runtimePrompt: string;
  runtimeInput: AgenteZapLiveCliRuntimeInput;
  extraInstructions?: string[];
}): string {
  const relativeContextDir = path.relative(getProjectRoot(), params.contextDir) || params.contextDir;
  const inlineRecoveryContext = buildAgenteZapInlineRecoveryContext(params.runtimeInput);
  return [
    params.runtimePrompt,
    '',
    'Arquivos de contexto do turno:',
    relativeContextDir,
    '',
    'Antes de responder, inspecione os arquivos desse diretorio. No minimo leia:',
    '- 00-runtime-contract.md',
    '- 01-turn.json',
    '- 02-conversation.md',
    '- 04-pending-action.json',
    '- 06-allowed-actions.json',
    '- 07-context-artifacts.json',
    '- 08-tenant-prompt.md, quando existir',
    '',
    'Use comandos locais somente para leitura, como rg, cat, sed e ls. Nao faca rede, banco, WhatsApp, escrita externa ou efeito colateral.',
    'Se qualquer comando somente-leitura falhar por sandbox, bwrap, namespace ou permissao, NAO use isso como motivo para no_send. Use o PACOTE CRITICO INLINE DE RECUPERACAO abaixo e continue a decisao.',
    'A resposta final precisa ser somente um objeto JSON conforme 05-output-schema.json.',
    'Se o contexto estiver insuficiente ou a acao for arriscada, devolva decision no_send ou handoff_human. Nao invente uma frase de fallback.',
    '',
    'PACOTE CRITICO INLINE DE RECUPERACAO:',
    inlineRecoveryContext,
    ...(params.extraInstructions && params.extraInstructions.length > 0
      ? ['', 'INSTRUCOES EXTRAS DE RETRY/REPARO PELO PROPRIO CODEX:', ...params.extraInstructions]
      : []),
  ].join('\n');
}

type CodexProcessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

function runCodexProcess(args: string[], stdin: string, env: NodeJS.ProcessEnv, cwd: string, timeoutMs: number): Promise<CodexProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(getCodexBinary(), args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const limit = 160_000;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3_000).unref();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = (stdout + String(chunk)).slice(-limit);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + String(chunk)).slice(-limit);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function assertCodexAuth(env: NodeJS.ProcessEnv, cwd: string, timeoutMs: number): Promise<void> {
  if (readBooleanEnv('AGENTEZAP_CODEX_CLI_SKIP_LOGIN_STATUS', false)) return;
  const result = await runCodexProcess(['login', 'status'], '', env, cwd, Math.min(timeoutMs, 20_000));
  if (result.exitCode !== 0 || result.timedOut) {
    const codexHome = String(env.CODEX_HOME || '');
    throw new Error(
      [
        `codex_login_status_failed CODEX_HOME=${codexHome}`,
        'Autentique uma vez nesse ambiente com: CODEX_HOME=<esse_diretorio> codex login --device-auth',
        result.stderr || result.stdout,
      ].join('\n'),
    );
  }
}

async function runCodexCliTurn(params: {
  runtimeInput: AgenteZapLiveCliRuntimeInput;
  runtimePrompt: string;
  projectRoot: string;
  codexHome: string;
  contextDir: string;
  timeoutMs: number;
  extraInstructions?: string[];
  modelOverride?: string;
}): Promise<string> {
  const model = String(params.modelOverride || selectCodexModel(params.runtimeInput)).trim();
  const reasoningEffort = selectCodexReasoningEffort(params.runtimeInput);
  const schema = buildAgenteZapCodexCliOutputSchema(params.runtimeInput.scope, params.runtimeInput.ownerEmail);
  const schemaFile = path.join(params.contextDir, 'output-schema.json');
  const outputFile = path.join(params.contextDir, 'codex-final.json');
  if (existsSync(outputFile)) {
    rmSync(outputFile, { force: true });
  }
  writeFileSync(schemaFile, safeJson(schema), 'utf8');
  writeCodexCliContextFiles({
    contextDir: params.contextDir,
    runtimePrompt: params.runtimePrompt,
    runtimeInput: params.runtimeInput,
    model,
    reasoningEffort,
    schema,
  });

  const env = buildCodexEnv(params.codexHome);
  mkdirSync(params.codexHome, { recursive: true });
  await assertCodexAuth(env, params.projectRoot, params.timeoutMs);

  const cliArgs = [
    'exec',
    '--ignore-user-config',
    '--ephemeral',
    '--config',
    'history.persistence="none"',
    '--config',
    'features.memories=false',
    '--config',
    'memories.use_memories=false',
    '--config',
    'memories.generate_memories=false',
    '--sandbox',
    'read-only',
    '--skip-git-repo-check',
    '--cd',
    params.projectRoot,
    '--model',
    model,
    '--config',
    `model_reasoning_effort="${reasoningEffort}"`,
    '--json',
    '--output-schema',
    schemaFile,
    '--output-last-message',
    outputFile,
    '-',
  ];

  const instruction = buildCodexCliInstruction({
    contextDir: params.contextDir,
    runtimePrompt: params.runtimePrompt,
    runtimeInput: params.runtimeInput,
    extraInstructions: params.extraInstructions,
  });
  const result = await runCodexProcess(cliArgs, instruction, env, params.projectRoot, params.timeoutMs);
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`codex_exec_failed exit=${result.exitCode} timedOut=${result.timedOut}\n${result.stderr || result.stdout}`);
  }
  const rawText = existsSync(outputFile) ? readFileSync(outputFile, 'utf8').trim() : '';
  return rawText || result.stdout.trim();
}

function planIndicatesSandboxReadFailure(plan: AgenteZapLiveCliPlan): boolean {
  if (plan.decision !== 'no_send') return false;
  const actionText = (plan.actions || []).map((action) => [
    action.type,
    action.reason || '',
    safeJson(action.arguments || {}),
  ].join(' ')).join(' ');
  const text = [
    ...(plan.customerFacingMessages || []),
    ...(plan.messages || []),
    ...(plan.evidence?.uncertainty || []),
    actionText,
  ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return (
    text.includes('bwrap') ||
    text.includes('sandbox') ||
    text.includes('namespace') ||
    text.includes('no permissions') ||
    text.includes('permissao') ||
    text.includes('comandos de leitura') ||
    text.includes('ler arquivos') ||
    text.includes('read files') ||
    text.includes('nao foi possivel inspecionar')
  );
}

function buildFailClosedPlan(
  params: {
    scope: AgenteZapLiveCliScope;
    ownerEmail?: string;
  },
): AgenteZapLiveCliPlan {
  return {
    schemaVersion: AGENTEZAP_LIVE_CLI_SCHEMA_VERSION,
    scope: normalizeScopeForOwner(params.scope, params.ownerEmail),
    decision: 'no_send',
    confidence: 0,
    customerFacingMessages: [],
    messages: [],
    actions: [],
    evidence: {
      filesRead: [],
      contextUsed: [],
      uncertainty: ['codex_cli_failed_closed'],
    },
  };
}

function cleanupOldCodexContextDirs(contextBase: string): void {
  const retentionDays = readIntEnv('AGENTEZAP_CODEX_CLI_CONTEXT_RETENTION_DAYS', 3);
  const maxDirs = readIntEnv('AGENTEZAP_CODEX_CLI_CONTEXT_MAX_DIRS', 500);
  const now = Date.now();
  const maxAgeMs = Math.max(1, retentionDays) * 24 * 60 * 60 * 1000;

  try {
    const entries = readdirSync(contextBase)
      .filter((name) => name.startsWith('turn-'))
      .map((name) => {
        const fullPath = path.join(contextBase, name);
        const stats = statSync(fullPath);
        return { name, fullPath, mtimeMs: stats.mtimeMs, isDirectory: stats.isDirectory() };
      })
      .filter((entry) => entry.isDirectory)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    entries.forEach((entry, index) => {
      const expired = now - entry.mtimeMs > maxAgeMs;
      const overLimit = index >= maxDirs;
      if (!expired && !overLimit) return;
      const resolved = path.resolve(entry.fullPath);
      const resolvedBase = path.resolve(contextBase);
      if (!resolved.startsWith(resolvedBase + path.sep)) return;
      rmSync(resolved, { recursive: true, force: true });
    });
  } catch (error) {
    console.warn('[AgenteZapCodexCliRuntime] context cleanup skipped:', error instanceof Error ? error.message : String(error));
  }
}

export async function runAgenteZapLiveCliRuntime(params: AgenteZapLiveCliRuntimeInput): Promise<AgenteZapLiveCliRuntimeResult> {
  const runtimePrompt = buildAgenteZapLiveCliPrompt({
    scope: params.scope,
    ownerEmail: params.ownerEmail,
    currentMessage: params.currentMessage,
    messageCount: params.messages.length,
    pendingAction: params.pendingAction,
  });
  const projectRoot = getProjectRoot();
  const codexHome = getCodexHome(projectRoot);
  const contextBase = path.join(projectRoot, '.codex-runs', 'agentezap-turn-contexts');
  mkdirSync(contextBase, { recursive: true });
  cleanupOldCodexContextDirs(contextBase);
  const contextDir = mkdtempSync(path.join(contextBase, 'turn-'));
  const timeoutMs = params.timeoutMs ?? Number(process.env.AGENTEZAP_CODEX_CLI_TIMEOUT_MS || 180_000);

  try {
    const primaryModel = selectCodexModel(params);
    const fallbackModel = selectCodexTenantFallbackModel();
    let usedModel = primaryModel;
    let rawText: string;
    const runWithModel = async (modelOverride: string, extraInstructions?: string[], runTimeoutMs = timeoutMs) => runCodexCliTurn({
      runtimeInput: params,
      runtimePrompt,
      projectRoot,
      codexHome,
      contextDir,
      timeoutMs: runTimeoutMs,
      extraInstructions,
      modelOverride,
    });
    const runtimeViolations: string[] = [];
    const runWithOperationalRetry = async (modelOverride: string, extraInstructions?: string[], runTimeoutMs = timeoutMs) => {
      try {
        return await runWithModel(modelOverride, extraInstructions, runTimeoutMs);
      } catch (error) {
        if (!isCodexRetryableExecutionTimeout(error)) throw error;
        runtimeViolations.push('codex_cli_retry_after_timeout_before_final_json');
        return runWithModel(
          modelOverride,
          [
            ...(extraInstructions || []),
            ...buildCodexExecutionTimeoutRetryInstructions(error),
          ],
          getCodexExecutionTimeoutRetryMs(runTimeoutMs),
        );
      }
    };

    try {
      rawText = await runWithOperationalRetry(primaryModel);
    } catch (error) {
      if (
        !isRodrigoCodexOwner(params.ownerEmail) &&
        fallbackModel &&
        fallbackModel !== primaryModel &&
        isCodexModelQuotaFailure(error)
      ) {
        usedModel = fallbackModel;
        rawText = await runWithOperationalRetry(fallbackModel, [
          `A tentativa anterior com ${primaryModel} falhou por cota/limite do modelo. Continue com ${fallbackModel} usando o mesmo contexto completo e o mesmo contrato JSON.`,
          'Nao simplifique a decisao por causa do fallback: use o contexto/evidencia do turno como no padrao llll.',
        ]);
      } else {
        throw error;
      }
    }
    let sanitized = sanitizeAgenteZapLiveCliPlan(parseAgenteZapLiveCliJson(rawText), {
      scope: params.scope,
      ownerEmail: params.ownerEmail,
    });
    sanitized.violations.unshift(...runtimeViolations);

    if (planIndicatesSandboxReadFailure(sanitized.plan)) {
      sanitized.violations.push('codex_cli_retry_after_sandbox_read_failure');
      rawText = await runWithOperationalRetry(usedModel, [
        'A tentativa anterior devolveu no_send porque comandos de leitura falharam por sandbox/bwrap/namespace/permissao.',
        'Isso e um falso bloqueio operacional quando existe o PACOTE CRITICO INLINE DE RECUPERACAO no prompt.',
        'Nao existe fallback textual local depois deste retry: a decisao final precisa ser sua, usando o pacote inline, os dados reais do turno e o contrato de actions.',
        'Se realmente faltar seguranca por outro motivo concreto, use no_send com motivo estrutural diferente de falha ao ler arquivos. Caso contrario, responda ou proponha action conforme o contexto.',
      ], Number(process.env.AGENTEZAP_CODEX_CLI_RETRY_TIMEOUT_MS || Math.min(timeoutMs, 120_000)));
      const retrySanitized = sanitizeAgenteZapLiveCliPlan(parseAgenteZapLiveCliJson(rawText), {
        scope: params.scope,
        ownerEmail: params.ownerEmail,
      });
      retrySanitized.violations.unshift(...Array.from(new Set([
        ...sanitized.violations,
        ...runtimeViolations,
      ])));
      sanitized = retrySanitized;
    }

    if (
      sanitized.plan.decision !== 'no_send' &&
      sanitized.plan.actions.length === 0 &&
      sanitized.plan.customerFacingMessages.length === 0
    ) {
      sanitized.violations.push('codex_cli_missing_public_output_fail_closed');
      sanitized.plan.decision = 'no_send';
      sanitized.plan.customerFacingMessages = [];
      sanitized.plan.messages = [];
      sanitized.plan.actions = [];
    }

    sanitized.plan.evidence.filesRead = [
      ...(sanitized.plan.evidence.filesRead || []),
      path.relative(projectRoot, contextDir),
    ].slice(0, 40);
    sanitized.plan.evidence.contextUsed = [
      ...(sanitized.plan.evidence.contextUsed || []),
      'codex_exec_context_files',
      `model:${usedModel}`,
      !isRodrigoCodexOwner(params.ownerEmail) && usedModel !== primaryModel ? `tenant_model_fallback_from:${primaryModel}` : '',
    ].filter(Boolean).slice(0, 40);

    return {
      plan: sanitized.plan,
      rawText,
      violations: sanitized.violations,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[AgenteZapCodexCliRuntime] fail-closed:', message);
    return {
      plan: buildFailClosedPlan({ scope: params.scope, ownerEmail: params.ownerEmail }),
      rawText: '',
      violations: ['codex_cli_failed_closed', message.slice(0, 500)],
    };
  }
}

export function getAgenteZapLiveCliAllowedActionTypesForTest(
  scope: AgenteZapLiveCliScope,
  ownerEmail?: string,
): AgenteZapLiveCliActionType[] {
  return getAgenteZapLiveCliAllowedActionTypes(scope, ownerEmail);
}

export function isAgenteZapLiveCliRodrigoOnlyActionForTest(action: AgenteZapLiveCliActionType): boolean {
  return RODRIGO_ONLY_ACTIONS.has(action);
}

export function buildAgenteZapCodexCliOutputSchemaForTest(
  scope: AgenteZapLiveCliScope,
  ownerEmail?: string,
): Record<string, unknown> {
  return buildAgenteZapCodexCliOutputSchema(scope, ownerEmail);
}
