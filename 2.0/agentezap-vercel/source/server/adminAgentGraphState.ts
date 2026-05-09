/**
 * ========================================================================
 * ADMIN AGENT GRAPH STATE — Contrato de Estado do Orquestrador
 * ========================================================================
 * Define tipos, enums e interfaces para o grafo de estado do admin agent.
 * Funciona como "single source of truth" para todos os módulos do POC.
 *
 * Princípios:
 *  - Imutável por turno (cada turno gera novo snapshot)
 *  - Totalmente serializável (JSON-safe para persistência)
 *  - Slots explícitos (nenhuma informação implícita)
 */

// ============================================================================
// ENUMS
// ============================================================================

/** Modo principal do agente admin */
export type AdminMode =
  | "onboarding"       // Coleta inicial de dados do negócio
  | "test_mode"        // Cliente testando o agente via simulador
  | "post_test"        // Pós-teste: feedback, ajustes, pagamento
  | "payment_pending"  // Aguardando comprovante de pagamento
  | "active"           // Conta ativa, suporte/edição
  | "media_upload"     // Upload de mídias para o agente
  | "prompt_edit"      // Edição de prompt/instruções
  | "unknown";         // Estado não determinado

/** Estágio do onboarding guiado */
export type OnboardingStage =
  | "business"    // Dados do negócio (nome, ramo, oferta)
  | "behavior"    // Comportamento desejado do agente
  | "workflow"    // Follow-up, agendamento, modo de pedido
  | "hours"       // Dias e horários de funcionamento
  | "ready";      // Todos os slots preenchidos

/** Tipo de workflow do negócio */
export type WorkflowKind =
  | "generic"     // Genérico (seguimento ou não)
  | "scheduling"  // Agendamento (salão, clínica, etc.)
  | "salon"       // Salão de beleza (scheduling + specializations)
  | "delivery";   // Delivery (restaurante, loja)

/** Classificação de intenção do turno */
export type TurnIntent =
  | "answer_stage"         // Resposta direta ao estágio atual
  | "side_question"        // Pergunta lateral (não muda estágio)
  | "command"              // Comando especial (#reset, #limpar, etc.)
  | "test_request"         // Quer testar o agente
  | "payment_proof"        // Enviou comprovante de pagamento
  | "media_upload"         // Upload de mídia
  | "prompt_edit"          // Quer editar prompt/instruções
  | "resume_session"       // Retomada de sessão (followp, fup, etc.)
  | "greeting"             // Saudação simples
  | "confirmation"         // Confirmação (sim, ok, pode ser)
  | "negation"             // Negação (não, sem isso)
  | "unclear"              // Intenção não clara
  | "exit_test"            // Sair do modo teste (#sair)
  | "change_plan"          // Quer mudar plano/preço
  | "support";             // Pedido de suporte/ajuda

/** Status de validação de delivery */
export type DeliveryStatus =
  | "not_started"          // Ainda não tentou entregar
  | "account_created"      // Conta criada no Supabase
  | "agent_saved"          // Agente salvo no banco
  | "token_generated"      // Token de teste gerado
  | "simulator_verified"   // Simulador funciona
  | "credentials_sent"     // Credenciais enviadas ao cliente
  | "confirmed";           // Cliente confirmou recebimento

// ============================================================================
// SLOT TYPES
// ============================================================================

/** Slot individual coletado no onboarding */
export interface CapturedSlot {
  key: string;
  value: string;
  capturedAt: number;     // Timestamp de captura
  turnIndex: number;      // Qual turno capturou
  confidence: number;     // 0-1, confiança da extração
}

/** Fato "sticky" — informação que não deve ser re-perguntada */
export interface StickyFact {
  key: string;
  value: string;
  source: "user" | "inferred" | "db_restored";
  capturedAt: number;
}

// ============================================================================
// TURN CLASSIFICATION RESULT
// ============================================================================

/** Resultado da classificação de um turno pelo TurnClassifier */
export interface TurnClassification {
  intent: TurnIntent;
  confidence: number;                  // 0-1

  // Dados extraídos do turno (se houver)
  extractedSlots?: Record<string, string>;

  // Flags booleanas para rápida inspeção
  hasBusinessInfo: boolean;
  hasBehaviorInfo: boolean;
  hasWorkflowInfo: boolean;
  hasHoursInfo: boolean;
  isAffirmative: boolean;
  isNegative: boolean;
  isMediaMessage: boolean;

  // Dados de mídia (se aplicável)
  mediaType?: string;
  mediaUrl?: string;

  // Raw input normalizado
  normalizedInput: string;
  originalInput: string;
}

// ============================================================================
// STATE POLICY DECISION
// ============================================================================

/** Decisão do StatePolicy — o que fazer neste turno */
export interface PolicyDecision {
  /** Ação principal a executar */
  action:
    | "advance_stage"          // Avançar para próximo estágio
    | "stay_stage"             // Permanecer no estágio atual (re-perguntar)
    | "side_question"          // Responder pergunta lateral sem perder estado
    | "execute_command"        // Executar comando especial
    | "create_agent"           // Criar agente (onboarding completo)
    | "enter_test_mode"        // Entrar em modo teste
    | "exit_test_mode"         // Sair do modo teste
    | "process_payment"        // Processar pagamento/comprovante
    | "upload_media"           // Processar upload de mídia
    | "edit_prompt"            // Processar edição de prompt
    | "generate_response"      // Gerar resposta genérica via LLM
    | "deliver_credentials"    // Entregar credenciais ao cliente
    | "send_pix"               // Enviar QR de PIX
    | "noop";                  // Não fazer nada

  /** Próximo estágio (se action = advance_stage) */
  nextStage?: OnboardingStage;

  /** Slot que está pendente (se action = stay_stage) */
  pendingSlot?: string;

  /** Motivo legível da decisão (para auditoria) */
  reason: string;

  /** Se o turno deve ser logado no auditor */
  shouldAudit: boolean;
}

// ============================================================================
// ADMIN GRAPH STATE (Principal)
// ============================================================================

/** Estado completo do grafo para um turno */
export interface AdminGraphState {
  // ---- Identidade ----
  phoneNumber: string;
  contactName?: string;
  linkedUserId?: string;

  // ---- Modo e Estágio ----
  mode: AdminMode;
  onboardingStage: OnboardingStage;

  // ---- Slots coletados ----
  capturedSlots: Record<string, CapturedSlot>;

  // ---- Fatos "sticky" (não re-perguntar) ----
  stickyFacts: Record<string, StickyFact>;

  // ---- Config do agente em construção ----
  agentConfig: {
    name?: string;
    company?: string;
    role?: string;
    prompt?: string;
  };

  // ---- Workflow ----
  workflowKind: WorkflowKind;
  usesScheduling: boolean;
  wantsAutoFollowUp: boolean;
  restaurantOrderMode?: "full_order" | "first_contact";

  // ---- Horários ----
  workDays?: number[];
  workStartTime?: string;
  workEndTime?: string;

  // ---- Delivery ----
  deliveryStatus: DeliveryStatus;
  lastTestToken?: string;
  testAccountCredentials?: {
    email: string;
    password?: string;
    loginUrl: string;
    simulatorToken?: string;
    isExistingAccount?: boolean;
  };

  // ---- Pagamento ----
  awaitingPaymentProof: boolean;
  awaitingPaymentChoice: boolean;

  // ---- Mídia ----
  pendingMedia?: {
    url: string;
    type: string;
    description?: string;
    whenCandidate?: string;
    summary?: string;
  };
  uploadedMedia: Array<{
    url: string;
    type: string;
    description?: string;
    whenToUse: string;
  }>;

  // ---- Memória ----
  memorySummary?: string;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }>;

  // ---- Auditoria ----
  turnIndex: number;
  lastAction?: string;
  lastActionValidated?: boolean;
  resumeHint?: string;

  // ---- Metadados ----
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// TURN AUDIT RECORD
// ============================================================================

/** Registro de auditoria para um turno processado */
export interface TurnAuditRecord {
  turnIndex: number;
  timestamp: number;
  phoneNumber: string;

  // Input
  rawInput: string;
  normalizedInput: string;
  mediaType?: string;

  // Classification
  classification: TurnClassification;

  // Policy
  decision: PolicyDecision;

  // State transitions
  previousMode: AdminMode;
  previousStage: OnboardingStage;
  newMode: AdminMode;
  newStage: OnboardingStage;

  // Output
  responseText: string;
  responseLength: number;
  hadMojibake: boolean;
  hadFalseExisting: boolean;

  // Performance
  processingTimeMs: number;
  llmCalls: number;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/** Cria um AdminGraphState inicial para novo cliente */
export function createInitialGraphState(phoneNumber: string, contactName?: string): AdminGraphState {
  const now = Date.now();
  return {
    phoneNumber,
    contactName,
    mode: "onboarding",
    onboardingStage: "business",
    capturedSlots: {},
    stickyFacts: {},
    agentConfig: {},
    workflowKind: "generic",
    usesScheduling: false,
    wantsAutoFollowUp: false,
    deliveryStatus: "not_started",
    awaitingPaymentProof: false,
    awaitingPaymentChoice: false,
    uploadedMedia: [],
    conversationHistory: [],
    turnIndex: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Converte ClientSession legado → AdminGraphState */
export function fromLegacySession(session: {
  phoneNumber: string;
  contactName?: string;
  userId?: string;
  flowState: string;
  agentConfig?: { name?: string; company?: string; role?: string; prompt?: string };
  setupProfile?: {
    questionStage?: string;
    businessSummary?: string;
    mainOffer?: string;
    desiredAgentBehavior?: string;
    wantsAutoFollowUp?: boolean;
    workflowKind?: string;
    usesScheduling?: boolean;
    restaurantOrderMode?: string;
    workDays?: number[];
    workStartTime?: string;
    workEndTime?: string;
    answeredBusiness?: boolean;
    answeredBehavior?: boolean;
    answeredWorkflow?: boolean;
    rawAnswers?: Record<string, string>;
  };
  memorySummary?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>;
  awaitingPaymentProof?: boolean;
  pendingMedia?: any;
  uploadedMedia?: any[];
}): AdminGraphState {
  const now = Date.now();
  const profile = session.setupProfile || {};

  // Map captured slots from rawAnswers + answered flags
  const capturedSlots: Record<string, CapturedSlot> = {};
  if (profile.answeredBusiness && profile.businessSummary) {
    capturedSlots["businessSummary"] = {
      key: "businessSummary",
      value: profile.businessSummary,
      capturedAt: now,
      turnIndex: 0,
      confidence: 1,
    };
  }
  if (profile.mainOffer) {
    capturedSlots["mainOffer"] = {
      key: "mainOffer",
      value: profile.mainOffer,
      capturedAt: now,
      turnIndex: 0,
      confidence: 1,
    };
  }
  if (profile.answeredBehavior && profile.desiredAgentBehavior) {
    capturedSlots["desiredAgentBehavior"] = {
      key: "desiredAgentBehavior",
      value: profile.desiredAgentBehavior,
      capturedAt: now,
      turnIndex: 0,
      confidence: 1,
    };
  }
  if (profile.answeredWorkflow) {
    capturedSlots["workflowPreference"] = {
      key: "workflowPreference",
      value: profile.wantsAutoFollowUp ? "follow_up" : "no_follow_up",
      capturedAt: now,
      turnIndex: 0,
      confidence: 1,
    };
  }

  // Build sticky facts
  const stickyFacts: Record<string, StickyFact> = {};
  if (profile.businessSummary) {
    stickyFacts["businessSummary"] = {
      key: "businessSummary",
      value: profile.businessSummary,
      source: "user",
      capturedAt: now,
    };
  }
  if (session.agentConfig?.company) {
    stickyFacts["company"] = {
      key: "company",
      value: session.agentConfig.company,
      source: "user",
      capturedAt: now,
    };
  }

  return {
    phoneNumber: session.phoneNumber,
    contactName: session.contactName,
    linkedUserId: session.userId,
    mode: (session.flowState as AdminMode) || "onboarding",
    onboardingStage: (profile.questionStage as OnboardingStage) || "business",
    capturedSlots,
    stickyFacts,
    agentConfig: session.agentConfig || {},
    workflowKind: (profile.workflowKind as WorkflowKind) || "generic",
    usesScheduling: profile.usesScheduling || false,
    wantsAutoFollowUp: profile.wantsAutoFollowUp || false,
    restaurantOrderMode: profile.restaurantOrderMode as any,
    workDays: profile.workDays,
    workStartTime: profile.workStartTime,
    workEndTime: profile.workEndTime,
    deliveryStatus: "not_started",
    awaitingPaymentProof: session.awaitingPaymentProof || false,
    awaitingPaymentChoice: false,
    pendingMedia: session.pendingMedia,
    uploadedMedia: session.uploadedMedia || [],
    memorySummary: session.memorySummary,
    conversationHistory: (session.conversationHistory || []).map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.getTime() : (m.timestamp as number),
    })),
    turnIndex: session.conversationHistory?.length || 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Verifica se todos os slots obrigatórios do onboarding estão preenchidos */
export function isOnboardingComplete(state: AdminGraphState): boolean {
  const hasBusinessSlot = !!state.capturedSlots["businessSummary"];
  const hasBehaviorSlot = !!state.capturedSlots["desiredAgentBehavior"];
  const hasWorkflowSlot = !!state.capturedSlots["workflowPreference"];

  if (!hasBusinessSlot || !hasBehaviorSlot || !hasWorkflowSlot) return false;

  // Se precisa de horários (scheduling), verificar
  if (state.usesScheduling || state.workflowKind === "scheduling" || state.workflowKind === "salon") {
    if (!state.workDays?.length || !state.workStartTime || !state.workEndTime) return false;
  }

  return true;
}

/** Retorna o próximo estágio pendente no onboarding */
export function getNextPendingStage(state: AdminGraphState): OnboardingStage | null {
  if (!state.capturedSlots["businessSummary"]) return "business";
  if (!state.capturedSlots["desiredAgentBehavior"]) return "behavior";
  if (!state.capturedSlots["workflowPreference"]) return "workflow";
  if (
    (state.usesScheduling || state.workflowKind === "scheduling" || state.workflowKind === "salon") &&
    (!state.workDays?.length || !state.workStartTime || !state.workEndTime)
  ) {
    return "hours";
  }
  return null;
}
