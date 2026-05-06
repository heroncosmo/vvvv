/**
 * ========================================================================
 * ADMIN AGENT GRAPH POC — Orquestrador com Grafo de Estado
 * ========================================================================
 * POC do novo orquestrador modular para o admin agent.
 * Substitui a lógica monolítica do processAdminMessage por um pipeline
 * de 7 camadas: Input → Classify → Policy → Execute → Validate → Sanitize → Audit.
 *
 * USO:
 *   import { processAdminMessageGraph } from "./adminAgentGraphPOC";
 *   const result = await processAdminMessageGraph(phone, text, media?, url?);
 *
 * INTEGRAÇÃO:
 *   O orquestrador usa funções existentes do adminAgentService para
 *   ações "pesadas" (LLM, DB, account creation) mas o FLUXO de decisão
 *   é controlado pelo grafo.
 */

import type {
  AdminGraphState,
  TurnClassification,
  PolicyDecision,
  AdminMode,
  OnboardingStage,
} from "./adminAgentGraphState";
import {
  createInitialGraphState,
  fromLegacySession,
  isOnboardingComplete,
  getNextPendingStage,
} from "./adminAgentGraphState";
import { classifyTurn } from "./adminAgentGraphClassifier";
import { evaluatePolicy } from "./adminAgentGraphPolicy";
import {
  executePolicyDecision,
  getStageQuestion,
  captureSlots,
} from "./adminAgentGraphExecutor";
import { sanitizeOutput, type SanitizeResult } from "./adminAgentOutputSanitizer";
import { validateDelivery, type DeliveryValidationResult } from "./adminAgentGraphValidator";
import {
  auditTurn,
  updateLastAuditWithSanitizeResult,
  type AntiPatternAlert,
} from "./adminAgentTurnAuditor";

// ============================================================================
// GRAPH STATE STORE (em memória, paralelo ao clientSessions legado)
// ============================================================================

const graphStates = new Map<string, AdminGraphState>();

/** Obtém ou cria estado do grafo para um telefone */
export function getOrCreateGraphState(
  phoneNumber: string,
  contactName?: string,
): AdminGraphState {
  let state = graphStates.get(phoneNumber);
  if (!state) {
    state = createInitialGraphState(phoneNumber, contactName);
    graphStates.set(phoneNumber, state);
  }
  return state;
}

/** Atualiza estado do grafo */
function updateGraphState(phoneNumber: string, updates: Partial<AdminGraphState>): AdminGraphState {
  const current = graphStates.get(phoneNumber) || createInitialGraphState(phoneNumber);
  const updated = { ...current, ...updates, updatedAt: Date.now() };
  graphStates.set(phoneNumber, updated);
  return updated;
}

/** Limpa estado do grafo */
export function clearGraphState(phoneNumber: string): void {
  graphStates.delete(phoneNumber);
}

/** Sincroniza estado do grafo a partir de sessão legada */
export function syncFromLegacySession(session: any): AdminGraphState {
  const state = fromLegacySession(session);
  graphStates.set(state.phoneNumber, state);
  return state;
}

/**
 * Sincroniza a partir da sessão legada APENAS se não existe estado em memória.
 * Uso: antes de processar cada mensagem — preserva o estado acumulado entre turnos.
 */
export function syncFromLegacySessionIfNew(session: any): AdminGraphState {
  const cleanPhone = String(session.phoneNumber || '').replace(/\D/g, '');
  if (graphStates.has(cleanPhone)) {
    // Estado já existe — não sobrescrever; retornar o acumulado
    return graphStates.get(cleanPhone)!;
  }
  // Primeira mensagem desta phone — inicializar a partir da sessão legada
  return syncFromLegacySession(session);
}

// ============================================================================
// GRAPH PIPELINE RESULT
// ============================================================================

export interface GraphPipelineResult {
  /** Texto final sanitizado para enviar ao cliente */
  text: string;

  /** Ações do sistema */
  actions?: Record<string, any>;

  /** Media actions */
  mediaActions?: Array<any>;

  /** Se o agente deve ser criado */
  shouldCreateAgent: boolean;

  /** Classificação do turno */
  classification: TurnClassification;

  /** Decisão do policy */
  decision: PolicyDecision;

  /** Resultado da sanitização */
  sanitizeResult: SanitizeResult;

  /** Alertas de anti-padrões */
  alerts: AntiPatternAlert[];

  /** Validation result (se houve delivery) */
  deliveryValidation?: DeliveryValidationResult;

  /** Novo estado após processamento */
  newState: AdminGraphState;

  /** Tempo total de processamento (ms) */
  processingTimeMs: number;
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Processa uma mensagem do admin usando o pipeline de grafo.
 * Esta é a função principal do POC — pode ser usada em paralelo
 * com processAdminMessage() para comparação A/B.
 *
 * Pipeline:
 *  1. InputNormalizer (inline)
 *  2. TurnClassifier → TurnClassification
 *  3. StatePolicy → PolicyDecision
 *  4. ActionExecutor → ExecutionResult
 *  5. DeliveryValidator (se aplicável)
 *  6. OutputSanitizer → SanitizeResult
 *  7. TurnAuditor → AntiPatternAlert[]
 *
 * @param phoneNumber  Telefone do cliente
 * @param messageText  Texto da mensagem
 * @param mediaType    Tipo de mídia (opcional)
 * @param mediaUrl     URL da mídia (opcional)
 * @param contactName  Nome do contato (opcional)
 * @returns GraphPipelineResult
 */
export async function processAdminMessageGraph(
  phoneNumber: string,
  messageText: string,
  mediaType?: string,
  mediaUrl?: string,
  contactName?: string,
): Promise<GraphPipelineResult> {
  const startTime = Date.now();
  const cleanPhone = phoneNumber.replace(/\D/g, "");

  // ---- (0) Obter estado ----
  let state = getOrCreateGraphState(cleanPhone, contactName);
  const previousMode: AdminMode = state.mode;
  const previousStage: OnboardingStage = state.onboardingStage;

  // ---- (1) INPUT NORMALIZER ----
  const cleanMessage = (messageText || "").trim();
  if (!cleanMessage && !mediaType) {
    // Mensagem vazia
    return buildEmptyResult(state, startTime);
  }

  // ---- (2) TURN CLASSIFIER ----
  const classification = classifyTurn(cleanMessage, state, mediaType, mediaUrl);

  // ---- (3) STATE POLICY ----
  const decision = evaluatePolicy(state, classification);

  // ---- (4) ACTION EXECUTOR ----
  const execResult = executePolicyDecision(state, decision, classification);

  // ---- (4b) Aplicar novos slots e facts ao estado ----
  if (Object.keys(execResult.newSlots).length > 0) {
    state = updateGraphState(cleanPhone, {
      capturedSlots: { ...state.capturedSlots, ...execResult.newSlots },
      stickyFacts: { ...state.stickyFacts, ...execResult.newFacts },
    });
  }

  // ---- (4c) Atualizar estágio se houve transição ----
  if (execResult.newStage) {
    state = updateGraphState(cleanPhone, {
      onboardingStage: execResult.newStage,
    });
  }

  // ---- (4d) Adicionar turno ao histórico ----
  const updatedHistory = [
    ...state.conversationHistory,
    { role: "user" as const, content: cleanMessage, timestamp: Date.now() },
  ];
  state = updateGraphState(cleanPhone, {
    conversationHistory: updatedHistory,
    turnIndex: state.turnIndex + 1,
  });

  // ---- (5) DELIVERY VALIDATOR (se shouldCreateAgent) ----
  let deliveryValidation: DeliveryValidationResult | undefined;
  if (execResult.shouldCreateAgent && state.testAccountCredentials) {
    deliveryValidation = validateDelivery(
      state,
      execResult.responseText,
      state.testAccountCredentials,
    );
  }

  // ---- (6) OUTPUT SANITIZER ----
  const sanitizeResult = sanitizeOutput(execResult.responseText, {
    isExistingAccount: state.testAccountCredentials?.isExistingAccount,
    maxLength: 4000,
    convertMarkdown: true,
    removeLLMArtefacts: true,
  });

  // ---- (7) TURN AUDITOR ----
  const processingTimeMs = Date.now() - startTime;
  const alerts = auditTurn(
    state,
    classification,
    decision,
    previousMode,
    previousStage,
    sanitizeResult.text,
    processingTimeMs,
    execResult.llmCallCount,
  );

  // Atualizar auditor com resultado do sanitizer
  updateLastAuditWithSanitizeResult(
    cleanPhone,
    sanitizeResult.hadMojibake,
    sanitizeResult.hadFalseExisting,
  );

  // ---- (7b) Adicionar resposta ao histórico ----
  if (sanitizeResult.text) {
    state = updateGraphState(cleanPhone, {
      conversationHistory: [
        ...state.conversationHistory,
        { role: "assistant" as const, content: sanitizeResult.text, timestamp: Date.now() },
      ],
    });
  }

  return {
    text: sanitizeResult.text,
    actions: execResult.actions,
    mediaActions: execResult.mediaActions,
    shouldCreateAgent: execResult.shouldCreateAgent,
    classification,
    decision,
    sanitizeResult,
    alerts,
    deliveryValidation,
    newState: state,
    processingTimeMs,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function buildEmptyResult(state: AdminGraphState, startTime: number): GraphPipelineResult {
  const emptyClassification: TurnClassification = {
    intent: "unclear",
    confidence: 0,
    hasBusinessInfo: false,
    hasBehaviorInfo: false,
    hasWorkflowInfo: false,
    hasHoursInfo: false,
    isAffirmative: false,
    isNegative: false,
    isMediaMessage: false,
    normalizedInput: "",
    originalInput: "",
  };

  const emptyDecision: PolicyDecision = {
    action: "noop",
    reason: "Mensagem vazia",
    shouldAudit: false,
  };

  return {
    text: "",
    shouldCreateAgent: false,
    classification: emptyClassification,
    decision: emptyDecision,
    sanitizeResult: {
      text: "",
      hadMojibake: false,
      hadFalseExisting: false,
      mojibakeResidualScore: 0,
      charsRemoved: 0,
    },
    alerts: [],
    newState: state,
    processingTimeMs: Date.now() - startTime,
  };
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/** Retorna estado do grafo sem modificar */
export function peekGraphState(phoneNumber: string): AdminGraphState | undefined {
  return graphStates.get(phoneNumber);
}

/** Retorna resumo rápido do estado para debug */
export function getGraphStateDebugSummary(phoneNumber: string): string {
  const state = graphStates.get(phoneNumber);
  if (!state) return `[${phoneNumber}] Sem estado no grafo`;

  const slotsCollected = Object.keys(state.capturedSlots).join(", ") || "(nenhum)";
  const isComplete = isOnboardingComplete(state);
  const nextPending = getNextPendingStage(state);

  return (
    `[${phoneNumber}] Mode: ${state.mode} | Stage: ${state.onboardingStage} | ` +
    `Slots: [${slotsCollected}] | Complete: ${isComplete} | ` +
    `NextPending: ${nextPending || "none"} | Turns: ${state.turnIndex} | ` +
    `Delivery: ${state.deliveryStatus}`
  );
}
