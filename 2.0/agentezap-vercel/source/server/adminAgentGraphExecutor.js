"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStageQuestion = getStageQuestion;
exports.buildSideQuestionResponse = buildSideQuestionResponse;
exports.captureSlots = captureSlots;
exports.executePolicyDecision = executePolicyDecision;
var adminPlanPricing_1 = require("./adminPlanPricing");
// ============================================================================
// ONBOARDING QUESTIONS
// ============================================================================
/** Perguntas padrão para cada estágio */
var STAGE_QUESTIONS = {
    business: "Vamos comecar! Me conta sobre seu negocio:\n\n" +
        "- Qual o *nome* da sua empresa/negocio?\n" +
        "- O que voce *vende ou oferece*?\n" +
        "- Quem e seu *cliente ideal*?\n\n" +
        "Pode me contar tudo de uma vez, sem problema!",
    behavior: "Otimo! Agora me diz: como voce quer que seu agente se comporte?\n\n" +
        "Ex: _formal_, _descontraido_, _direto ao ponto_, _amigavel_...\n\n" +
        "Ou me conta o que ele deve fazer quando o cliente entrar em contato.",
    workflow: "Perfeito! Sobre o acompanhamento automatico:\n\n" +
        "Voce quer que o agente faca *follow-up automatico* com clientes que nao responderam?\n\n" +
        "Ou prefere que ele *so atenda* quando o cliente entrar em contato?",
    hours: "Quase la! Me informa os *horarios de funcionamento*:\n\n" +
        "- Quais *dias* da semana?\n" +
        "- De que *horas* ate que *horas*?\n\n" +
        "Ex: _Segunda a sexta, 8h as 18h_",
    ready: "",
};
/** Retorna a pergunta para o estágio atual */
function getStageQuestion(stage) {
    return STAGE_QUESTIONS[stage] || STAGE_QUESTIONS.business;
}
// ============================================================================
// SIDE QUESTION HANDLER
// ============================================================================
/** Responde perguntas laterais sem perder o estágio */
function buildSideQuestionResponse(state, classification) {
    var input = classification.normalizedInput;
    // Preço/valor
    if (/\b(preco|valor|custo|quanto)\b/.test(input)) {
        return "".concat((0, adminPlanPricing_1.buildAdminPlanReplyText)(), "\n\nVamos continuar configurando seu agente? ").concat(getStagePromptHint(state.onboardingStage));
    }
    // Funcionalidades
    if (/\b(funcionalidade|recurso|feature|faz o que)\b/.test(input)) {
        return ("O AgentZap pode:\n\n" +
            "- Atender clientes 24/7 no WhatsApp\n" +
            "- Follow-up automatico\n" +
            "- Agendamento inteligente\n" +
            "- Envio de midias (fotos, videos, catalogos)\n" +
            "- Integracoes diversas\n\n" +
            "Vamos continuar? ".concat(getStagePromptHint(state.onboardingStage)));
    }
    // Como funciona
    if (/\b(como funciona|como faz|como configura)\b/.test(input)) {
        return ("E simples! Voce me conta sobre seu negocio, eu crio seu agente, " +
            "voce testa gratis e se gostar, ativa!\n\n" +
            "Vamos la? ".concat(getStagePromptHint(state.onboardingStage)));
    }
    // Genérico
    return ("Boa pergunta! Posso te explicar mais depois. " +
        "Vamos continuar configurando seu agente? ".concat(getStagePromptHint(state.onboardingStage)));
}
function getStagePromptHint(stage) {
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
function captureSlots(state, classification, currentStage) {
    var _a, _b, _c, _d;
    var slots = {};
    var facts = {};
    var now = Date.now();
    // Se estamos no estágio business e tem info de negócio
    if (currentStage === "business") {
        var businessText = ((_a = classification.extractedSlots) === null || _a === void 0 ? void 0 : _a["businessSummary"]) || classification.originalInput;
        if (businessText && businessText.length > 3) {
            slots["businessSummary"] = {
                key: "businessSummary",
                value: businessText,
                capturedAt: now,
                turnIndex: state.turnIndex,
                confidence: classification.hasBusinessInfo ? 0.9 : 0.6,
            };
            facts["businessSummary"] = {
                key: "businessSummary",
                value: businessText,
                source: "user",
                capturedAt: now,
            };
        }
    }
    // Se estamos no estágio behavior
    if (currentStage === "behavior") {
        var behaviorText = ((_b = classification.extractedSlots) === null || _b === void 0 ? void 0 : _b["desiredAgentBehavior"]) || classification.originalInput;
        if (behaviorText && behaviorText.length > 3) {
            slots["desiredAgentBehavior"] = {
                key: "desiredAgentBehavior",
                value: behaviorText,
                capturedAt: now,
                turnIndex: state.turnIndex,
                confidence: classification.hasBehaviorInfo ? 0.9 : 0.6,
            };
            facts["desiredAgentBehavior"] = {
                key: "desiredAgentBehavior",
                value: behaviorText,
                source: "user",
                capturedAt: now,
            };
        }
    }
    // Se estamos no estágio workflow
    if (currentStage === "workflow") {
        var isAffirmative = classification.isAffirmative;
        var isNegative = classification.isNegative;
        var workflowData = (_c = classification.extractedSlots) === null || _c === void 0 ? void 0 : _c["workflowPreference"];
        var value = "unknown";
        if (workflowData) {
            try {
                var parsed = JSON.parse(workflowData);
                if (parsed.wantsFollowUp === true)
                    value = "follow_up";
                else if (parsed.wantsFollowUp === false)
                    value = "no_follow_up";
                else if (parsed.wantsScheduling)
                    value = "scheduling";
            }
            catch (_e) {
                value = isAffirmative ? "follow_up" : isNegative ? "no_follow_up" : "unknown";
            }
        }
        else if (isAffirmative) {
            value = "follow_up";
        }
        else if (isNegative) {
            value = "no_follow_up";
        }
        if (value !== "unknown") {
            slots["workflowPreference"] = {
                key: "workflowPreference",
                value: value,
                capturedAt: now,
                turnIndex: state.turnIndex,
                confidence: classification.hasWorkflowInfo ? 0.9 : 0.7,
            };
            facts["workflowPreference"] = {
                key: "workflowPreference",
                value: value,
                source: "user",
                capturedAt: now,
            };
        }
    }
    // Se estamos no estágio hours
    if (currentStage === "hours") {
        var hoursData = (_d = classification.extractedSlots) === null || _d === void 0 ? void 0 : _d["hoursInfo"];
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
    return { slots: slots, facts: facts };
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
function executePolicyDecision(state, decision, classification) {
    var result = {
        responseText: "",
        newSlots: {},
        newFacts: {},
        shouldCreateAgent: false,
        llmCallCount: 0,
    };
    switch (decision.action) {
        case "advance_stage": {
            var nextStage = decision.nextStage || "business";
            // Capturar slots do turno atual
            var _a = captureSlots(state, classification, state.onboardingStage), slots = _a.slots, facts = _a.facts;
            result.newSlots = slots;
            result.newFacts = facts;
            result.newStage = nextStage;
            // Se próximo estágio é "ready" → criar agente
            if (nextStage === "ready") {
                result.shouldCreateAgent = true;
                result.responseText = "Perfeito! Vou criar seu agente agora...";
            }
            else {
                result.responseText = getStageQuestion(nextStage);
            }
            break;
        }
        case "stay_stage": {
            var pendingSlot = decision.pendingSlot || state.onboardingStage;
            result.responseText = getStageQuestion(pendingSlot);
            break;
        }
        case "side_question": {
            result.responseText = buildSideQuestionResponse(state, classification);
            break;
        }
        case "create_agent": {
            result.shouldCreateAgent = true;
            // Capturar quaisquer slots finais
            var _b = captureSlots(state, classification, state.onboardingStage), slots = _b.slots, facts = _b.facts;
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
