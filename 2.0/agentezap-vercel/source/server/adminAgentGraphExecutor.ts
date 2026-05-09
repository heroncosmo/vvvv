/**
 * ========================================================================
 * ADMIN AGENT GRAPH EXECUTOR — Executor de Ações
 * ========================================================================
 * Camada que executa ações decididas pelo StatePolicy.
 * Funciona como "Layer 4" do orquestrador.
 *
 * Responsabilidades:
 *  - Conecta decisões (PolicyDecision) às funções reais do adminAgentService
 *  - Gerencia side effects (DB writes, LLM calls, account creation)
 *  - Retorna resultado estruturado para o orquestrador
 */

import type {
  AdminGraphState,
  PolicyDecision,
  TurnClassification,
  OnboardingStage,
  CapturedSlot,
  StickyFact,
} from "./adminAgentGraphState";

// ============================================================================
// EXECUTION RESULT
// ============================================================================

export interface ExecutionResult {
  /** Texto de resposta para o cliente */
  responseText: string;

  /** Ações para o sistema executar (PIX, credenciais, etc.) */
  actions?: {
    sendPix?: boolean;
    notifyOwner?: boolean;
    startTestMode?: boolean;
    testAccountCredentials?: any;
    demoAssets?: any;
  };

  /** Media actions */
  mediaActions?: Array<{
    type: string;
    media_name: string;
    mediaData?: any;
  }>;

  /** Novos slots capturados neste turno */
  newSlots: Record<string, CapturedSlot>;

  /** Novos sticky facts */
  newFacts: Record<string, StickyFact>;

  /** Novo estágio (se houve transição) */
  newStage?: OnboardingStage;

  /** Se o agente deve ser criado */
  shouldCreateAgent: boolean;

  /** Quantas chamadas LLM foram feitas */
  llmCallCount: number;

  /** Se houve erro */
  error?: string;
}

// ============================================================================
// ONBOARDING QUESTIONS
// ============================================================================

/** Perguntas padrão para cada estágio */
const STAGE_QUESTIONS: Record<OnboardingStage, string> = {
  business:
    "Vamos comecar! Me conta sobre seu negocio:\n\n" +
    "- Qual o *nome* da sua empresa/negocio?\n" +
    "- O que voce *vende ou oferece*?\n" +
    "- Quem e seu *cliente ideal*?\n\n" +
    "Pode me contar tudo de uma vez, sem problema!",
  behavior:
    "Otimo! Agora me diz: como voce quer que seu agente se comporte?\n\n" +
    "Ex: _formal_, _descontraido_, _direto ao ponto_, _amigavel_...\n\n" +
    "Ou me conta o que ele deve fazer quando o cliente entrar em contato.",
  workflow:
    "Perfeito! Sobre o acompanhamento automatico:\n\n" +
    "Voce quer que o agente faca *follow-up automatico* com clientes que nao responderam?\n\n" +
    "Ou prefere que ele *so atenda* quando o cliente entrar em contato?",
  hours:
    "Quase la! Me informa os *horarios de funcionamento*:\n\n" +
    "- Quais *dias* da semana?\n" +
    "- De que *horas* ate que *horas*?\n\n" +
    "Ex: _Segunda a sexta, 8h as 18h_",
  ready: "",
};

/** Retorna a pergunta para o estágio atual */
export function getStageQuestion(stage: OnboardingStage): string {
  return STAGE_QUESTIONS[stage] || STAGE_QUESTIONS.business;
}

// ============================================================================
// SIDE QUESTION HANDLER
// ============================================================================

/** Responde perguntas laterais sem perder o estágio */
export function buildSideQuestionResponse(
  state: AdminGraphState,
  classification: TurnClassification,
): string {
  const input = classification.normalizedInput;

  // Preço/valor
  if (/\b(preco|valor|custo|quanto)\b/.test(input)) {
    return (
      "O plano do AgentZap e:\n\n" +
      "- *Mensal*: R$ 197/mes\n" +
      "- *Anual*: R$ 97/mes (economia de 51%!)\n\n" +
      "Voce pode assine e testar GRATIS antes de decidir! " +
      "Acesse: https://agentezap.online/plans\n\n" +
      `Vamos continuar configurando seu agente? ${getStagePromptHint(state.onboardingStage)}`
    );
  }

  // Funcionalidades
  if (/\b(funcionalidade|recurso|feature|faz o que)\b/.test(input)) {
    return (
      "O AgentZap pode:\n\n" +
      "- Atender clientes 24/7 no WhatsApp\n" +
      "- Follow-up automatico\n" +
      "- Agendamento inteligente\n" +
      "- Envio de midias (fotos, videos, catalogos)\n" +
      "- Integracoes diversas\n\n" +
      `Vamos continuar? ${getStagePromptHint(state.onboardingStage)}`
    );
  }

  // Como funciona
  if (/\b(como funciona|como faz|como configura)\b/.test(input)) {
    return (
      "E simples! Voce me conta sobre seu negocio, eu crio seu agente, " +
      "voce testa gratis e se gostar, ativa!\n\n" +
      `Vamos la? ${getStagePromptHint(state.onboardingStage)}`
    );
  }

  // Genérico
  return (
    "Boa pergunta! Posso te explicar mais depois. " +
    `Vamos continuar configurando seu agente? ${getStagePromptHint(state.onboardingStage)}`
  );
}

function getStagePromptHint(stage: OnboardingStage): string {
  switch (stage) {
    case "business": return "Me conta sobre seu negocio!";
    case "behavior": return "Como voce quer que o agente se comporte?";
    case "workflow": return "Quer follow-up automatico?";
    case "hours": return "Quais seus horarios de funcionamento?";
    default: return "";
  }
}

// ============================================================================
// SLOT CAPTURE
// ============================================================================

/**
 * Captura slots do turno atual com base na classificação.
 * Cria CapturedSlot e StickyFact para cada dado extraído.
 */
export function captureSlots(
  state: AdminGraphState,
  classification: TurnClassification,
  currentStage: OnboardingStage,
): { slots: Record<string, CapturedSlot>; facts: Record<string, StickyFact> } {
  const slots: Record<string, CapturedSlot> = {};
  const facts: Record<string, StickyFact> = {};
  const now = Date.now();
  const rememberSlot = (key: string, value: string, confidence: number) => {
    if (!value || slots[key]) return;
    slots[key] = {
      key,
      value,
      capturedAt: now,
      turnIndex: state.turnIndex,
      confidence,
    };
    facts[key] = {
      key,
      value,
      source: "user",
      capturedAt: now,
    };
  };

  // Se estamos no estágio business e tem info de negócio
  if (currentStage === "business") {
    const businessText = classification.extractedSlots?.["businessSummary"] || classification.originalInput;
    if (businessText && businessText.length > 3) {
      rememberSlot("businessSummary", businessText, classification.hasBusinessInfo ? 0.9 : 0.6);
    }
  }

  // Se estamos no estágio behavior
  if (currentStage === "behavior") {
    const behaviorText = classification.extractedSlots?.["desiredAgentBehavior"] || classification.originalInput;
    if (behaviorText && behaviorText.length > 3) {
      rememberSlot("desiredAgentBehavior", behaviorText, classification.hasBehaviorInfo ? 0.9 : 0.6);
    }
  }

  // Se estamos no estágio workflow
  if (currentStage === "workflow") {
    const isAffirmative = classification.isAffirmative;
    const isNegative = classification.isNegative;
    const workflowData = classification.extractedSlots?.["workflowPreference"];

    let value = "unknown";
    if (workflowData) {
      try {
        const parsed = JSON.parse(workflowData);
        if (parsed.wantsFollowUp === true) value = "follow_up";
        else if (parsed.wantsFollowUp === false) value = "no_follow_up";
        else if (parsed.wantsScheduling) value = "scheduling";
      } catch {
        value = isAffirmative ? "follow_up" : isNegative ? "no_follow_up" : "unknown";
      }
    } else if (isAffirmative) {
      value = "follow_up";
    } else if (isNegative) {
      value = "no_follow_up";
    }

    if (value !== "unknown") {
      rememberSlot("workflowPreference", value, classification.hasWorkflowInfo ? 0.9 : 0.7);
    }
  }

  // Se estamos no estágio hours
  if (currentStage === "hours") {
    const hoursData = classification.extractedSlots?.["hoursInfo"];
    if (hoursData || classification.hasHoursInfo) {
      slots["hoursInfo"] = {
        key: "hoursInfo",
        value: classification.originalInput,
        capturedAt: now,
        turnIndex: state.turnIndex,
        confidence: classification.hasHoursInfo ? 0.9 : 0.5,
      };
    }
  }

  const inferredBusiness = classification.extractedSlots?.["businessSummary"];
  if (inferredBusiness && inferredBusiness.length > 3) {
    rememberSlot("businessSummary", inferredBusiness, classification.hasBusinessInfo ? 0.9 : 0.6);
  }

  const inferredBehavior = classification.extractedSlots?.["desiredAgentBehavior"];
  if (inferredBehavior && inferredBehavior.length > 3) {
    rememberSlot("desiredAgentBehavior", inferredBehavior, classification.hasBehaviorInfo ? 0.9 : 0.6);
  }

  const inferredWorkflow = classification.extractedSlots?.["workflowPreference"];
  if (inferredWorkflow && inferredWorkflow.length > 0) {
    rememberSlot("workflowPreference", inferredWorkflow, classification.hasWorkflowInfo ? 0.9 : 0.7);
  }

  return { slots, facts };
}

// ============================================================================
// MAIN EXECUTOR (Deterministic — sem LLM)
// ============================================================================

/**
 * Executa a decisão do policy de forma determinística.
 * Para ações que requerem LLM ou DB, retorna um placeholder
 * que o orquestrador deve completar com as funções reais do adminAgentService.
 *
 * @param state           Estado atual
 * @param decision        Decisão do policy
 * @param classification  Classificação do turno
 * @returns ExecutionResult
 */
export function executePolicyDecision(
  state: AdminGraphState,
  decision: PolicyDecision,
  classification: TurnClassification,
): ExecutionResult {
  const result: ExecutionResult = {
    responseText: "",
    newSlots: {},
    newFacts: {},
    shouldCreateAgent: false,
    llmCallCount: 0,
  };

  switch (decision.action) {
    case "advance_stage": {
      const nextStage = decision.nextStage || "business";

      // Capturar slots do turno atual
      const { slots, facts } = captureSlots(state, classification, state.onboardingStage);
      result.newSlots = slots;
      result.newFacts = facts;
      result.newStage = nextStage;

      // Se próximo estágio é "ready" → criar agente
      if (nextStage === "ready") {
        result.shouldCreateAgent = true;
        result.responseText = "Perfeito! Vou criar seu agente agora...";
      } else {
        result.responseText = getStageQuestion(nextStage);
      }
      break;
    }

    case "stay_stage": {
      const pendingSlot = decision.pendingSlot || state.onboardingStage;
      result.responseText = getStageQuestion(pendingSlot as OnboardingStage);
      break;
    }

    case "side_question": {
      result.responseText = buildSideQuestionResponse(state, classification);
      break;
    }

    case "create_agent": {
      result.shouldCreateAgent = true;
      // Capturar quaisquer slots finais
      const { slots, facts } = captureSlots(state, classification, state.onboardingStage);
      result.newSlots = slots;
      result.newFacts = facts;
      result.responseText = "Perfeito! Criando seu agente de atendimento...";
      break;
    }

    case "enter_test_mode": {
      result.actions = { startTestMode: true };
      result.responseText = "Entrando no modo de teste...";
      break;
    }

    case "exit_test_mode": {
      result.responseText = "Saindo do modo teste...";
      break;
    }

    case "send_pix": {
      result.actions = { sendPix: true };
      result.responseText = "Gerando seu PIX...";
      break;
    }

    case "process_payment": {
      result.responseText = "Analisando comprovante...";
      break;
    }

    case "upload_media": {
      result.responseText = "Processando sua midia...";
      break;
    }

    case "edit_prompt": {
      result.responseText = "Vamos editar as instrucoes do agente...";
      break;
    }

    case "execute_command": {
      result.responseText = "Executando comando...";
      break;
    }

    case "generate_response": {
      // Placeholder — orquestrador deve chamar LLM
      result.responseText = "__LLM_REQUIRED__";
      result.llmCallCount = 1;
      break;
    }

    case "noop": {
      result.responseText = "";
      break;
    }

    default: {
      result.responseText = "__LLM_REQUIRED__";
      result.llmCallCount = 1;
    }
  }

  return result;
}
