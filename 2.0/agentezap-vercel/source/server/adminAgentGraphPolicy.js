"use strict";
/**
 * ========================================================================
 * ADMIN AGENT STATE POLICY — Política de Estado do Orquestrador
 * ========================================================================
 * Decide o que fazer com base no estado atual + classificação do turno.
 * Funciona como "Layer 3" do orquestrador: decide O QUE FAZER.
 *
 * Regras-chave:
 *  - Nunca re-perguntar algo que já foi respondido (stickyFacts)
 *  - Distinguir side question de stage answer
 *  - Avançar estágio SOMENTE com dados reais (não pular)
 *  - Se onboarding completo → criar agente automaticamente
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePolicy = evaluatePolicy;
exports.wasAlreadyAsked = wasAlreadyAsked;
var adminAgentGraphState_1 = require("./adminAgentGraphState");
// ============================================================================
// POLICY ENGINE
// ============================================================================
/**
 * Avalia a política de estado para o turno atual.
 *
 * @param state           Estado atual do grafo
 * @param classification  Classificação do turno
 * @returns PolicyDecision com ação + motivo
 */
function evaluatePolicy(state, classification) {
    var intent = classification.intent, confidence = classification.confidence;
    // ---- (1) Comandos especiais → execute_command ----
    if (intent === "command") {
        return {
            action: "execute_command",
            reason: "Comando especial detectado: ".concat(classification.originalInput),
            shouldAudit: true,
        };
    }
    // ---- (2) Exit test mode ----
    if (intent === "exit_test") {
        return {
            action: "exit_test_mode",
            reason: "Usuário solicitou sair do modo teste",
            shouldAudit: true,
        };
    }
    // ---- (3) Payment proof ----
    if (intent === "payment_proof") {
        return {
            action: "process_payment",
            reason: "Comprovante de pagamento detectado",
            shouldAudit: true,
        };
    }
    // ---- (4) Media upload ----
    if (intent === "media_upload" && classification.isMediaMessage) {
        return {
            action: "upload_media",
            reason: "Upload de mídia detectado",
            shouldAudit: true,
        };
    }
    // ---- (5) Test request ----
    if (intent === "test_request") {
        // Se onboarding ainda não terminou, continuar onboarding
        if (state.mode === "onboarding" && !(0, adminAgentGraphState_1.isOnboardingComplete)(state)) {
            return {
                action: "stay_stage",
                pendingSlot: (0, adminAgentGraphState_1.getNextPendingStage)(state) || "business",
                reason: "Usuário quer testar mas onboarding ainda não terminou",
                shouldAudit: true,
            };
        }
        return {
            action: "enter_test_mode",
            reason: "Usuário solicitou teste do agente",
            shouldAudit: true,
        };
    }
    // ---- (6) Resume session (followp, fup, continuar) ----
    if (intent === "resume_session") {
        var nextStage = (0, adminAgentGraphState_1.getNextPendingStage)(state);
        if (nextStage) {
            return {
                action: "stay_stage",
                pendingSlot: nextStage,
                reason: "Sessão retomada, continuando do estágio pendente",
                shouldAudit: true,
            };
        }
        return {
            action: "generate_response",
            reason: "Sessão retomada, onboarding já completo",
            shouldAudit: false,
        };
    }
    // ---- (7) Onboarding mode ----
    if (state.mode === "onboarding") {
        return evaluateOnboardingPolicy(state, classification);
    }
    // ---- (8) Test mode ----
    if (state.mode === "test_mode") {
        return {
            action: "generate_response",
            reason: "Modo teste: encaminhar mensagem ao agente simulado",
            shouldAudit: false,
        };
    }
    // ---- (9) Post-test ----
    if (state.mode === "post_test") {
        if (intent === "confirmation") {
            return {
                action: "send_pix",
                reason: "Usuário confirmou após teste, enviar PIX",
                shouldAudit: true,
            };
        }
        return {
            action: "generate_response",
            reason: "Pós-teste: gerar resposta conversacional",
            shouldAudit: false,
        };
    }
    // ---- (10) Payment pending ----
    if (state.mode === "payment_pending") {
        return {
            action: "generate_response",
            reason: "Aguardando pagamento: responder sobre status",
            shouldAudit: false,
        };
    }
    // ---- (11) Active mode ----
    if (state.mode === "active") {
        if (intent === "prompt_edit") {
            return {
                action: "edit_prompt",
                reason: "Usuário quer editar prompt do agente",
                shouldAudit: true,
            };
        }
        return {
            action: "generate_response",
            reason: "Conta ativa: responder via LLM",
            shouldAudit: false,
        };
    }
    // ---- Fallback ----
    return {
        action: "generate_response",
        reason: "Fallback genérico",
        shouldAudit: false,
    };
}
// ============================================================================
// ONBOARDING POLICY
// ============================================================================
function evaluateOnboardingPolicy(state, classification) {
    var intent = classification.intent, confidence = classification.confidence;
    var currentStage = state.onboardingStage;
    var nextPending = (0, adminAgentGraphState_1.getNextPendingStage)(state);
    // Se onboarding já completo → criar agente
    if ((0, adminAgentGraphState_1.isOnboardingComplete)(state)) {
        return {
            action: "create_agent",
            reason: "Todos os slots preenchidos, criar agente automaticamente",
            shouldAudit: true,
        };
    }
    // Side question durante onboarding → responder sem perder estágio
    if (intent === "side_question") {
        return {
            action: "side_question",
            pendingSlot: currentStage,
            reason: "Pergunta lateral detectada no est\u00E1gio ".concat(currentStage),
            shouldAudit: true,
        };
    }
    // Greeting durante onboarding → responder e continuar
    if (intent === "greeting" && currentStage === "business") {
        return {
            action: "stay_stage",
            pendingSlot: "business",
            reason: "Saudação inicial, solicitar dados do negócio",
            shouldAudit: false,
        };
    }
    // Answer stage → validar se corresponde ao estágio atual
    if (intent === "answer_stage" || intent === "confirmation") {
        // REGRA ANTI-REASK: Se o slot já existe em stickyFacts, NÃO re-perguntar
        if (currentStage === "business" && state.stickyFacts["businessSummary"]) {
            // Já temos essa info — avançar para o próximo estágio pendente
            var next = (0, adminAgentGraphState_1.getNextPendingStage)(state);
            if (next && next !== "business") {
                return {
                    action: "advance_stage",
                    nextStage: next,
                    reason: "Business já respondido (stickyFact), avançando para próximo",
                    shouldAudit: true,
                };
            }
        }
        if (currentStage === "behavior" && state.stickyFacts["desiredAgentBehavior"]) {
            var next = (0, adminAgentGraphState_1.getNextPendingStage)(state);
            if (next && next !== "behavior") {
                return {
                    action: "advance_stage",
                    nextStage: next,
                    reason: "Behavior já respondido (stickyFact), avançando para próximo",
                    shouldAudit: true,
                };
            }
        }
        // Resposta válida para o estágio atual → avançar
        switch (currentStage) {
            case "business":
                return {
                    action: "advance_stage",
                    nextStage: "behavior",
                    reason: "Dados do negócio recebidos, avançar para comportamento",
                    shouldAudit: true,
                };
            case "behavior":
                return {
                    action: "advance_stage",
                    nextStage: "workflow",
                    reason: "Comportamento definido, avançar para workflow",
                    shouldAudit: true,
                };
            case "workflow":
                // Verificar se precisa de horários depois
                var needsHours = wouldNeedHours(state, classification);
                return {
                    action: "advance_stage",
                    nextStage: needsHours ? "hours" : "ready",
                    reason: needsHours
                        ? "Workflow definido, precisa de horários"
                        : "Workflow definido, onboarding completo",
                    shouldAudit: true,
                };
            case "hours":
                return {
                    action: "advance_stage",
                    nextStage: "ready",
                    reason: "Horários definidos, onboarding completo",
                    shouldAudit: true,
                };
            case "ready":
                return {
                    action: "create_agent",
                    reason: "Todos os dados coletados, criar agente",
                    shouldAudit: true,
                };
        }
    }
    // Negação → interpretar como "sem follow-up" no estágio workflow
    if (intent === "negation" && currentStage === "workflow") {
        return {
            action: "advance_stage",
            nextStage: wouldNeedHours(state, classification) ? "hours" : "ready",
            reason: "Negação no workflow = sem follow-up, avançando",
            shouldAudit: true,
        };
    }
    // Fallback: permanecer no estágio atual
    return {
        action: "stay_stage",
        pendingSlot: currentStage,
        reason: "N\u00E3o foi poss\u00EDvel interpretar resposta para est\u00E1gio ".concat(currentStage, " (confidence: ").concat(confidence.toFixed(2), ")"),
        shouldAudit: confidence < 0.5,
    };
}
// ============================================================================
// HELPERS
// ============================================================================
/** Verifica se o workflow escolhido requer horários */
function wouldNeedHours(state, classification) {
    var _a;
    // Se tem info de scheduling na classificação
    var workflowSlot = (_a = classification.extractedSlots) === null || _a === void 0 ? void 0 : _a["workflowPreference"];
    if (workflowSlot) {
        try {
            var parsed = JSON.parse(workflowSlot);
            if (parsed.wantsScheduling)
                return true;
        }
        catch (_b) { }
    }
    // Se workflowKind é scheduling ou salon
    if (state.workflowKind === "scheduling" || state.workflowKind === "salon")
        return true;
    if (state.usesScheduling)
        return true;
    return false;
}
/**
 * Verifica se o último turno do assistente já perguntou sobre o slot atual.
 * Usado para prevenir re-asks consecutivos.
 */
function wasAlreadyAsked(state, slot) {
    var history = state.conversationHistory;
    if (history.length < 2)
        return false;
    // Checar as últimas N mensagens do assistente
    var recentAssistant = history
        .filter(function (m) { return m.role === "assistant"; })
        .slice(-2);
    for (var _i = 0, recentAssistant_1 = recentAssistant; _i < recentAssistant_1.length; _i++) {
        var msg = recentAssistant_1[_i];
        var normalized = msg.content.toLowerCase();
        switch (slot) {
            case "business":
                if (normalized.includes("negocio") || normalized.includes("empresa") || normalized.includes("ramo"))
                    return true;
                break;
            case "behavior":
                if (normalized.includes("comportamento") || normalized.includes("personalidade") || normalized.includes("tom"))
                    return true;
                break;
            case "workflow":
                if (normalized.includes("follow") || normalized.includes("agendamento") || normalized.includes("recuperar"))
                    return true;
                break;
            case "hours":
                if (normalized.includes("horario") || normalized.includes("dias") || normalized.includes("funcionamento"))
                    return true;
                break;
        }
    }
    return false;
}
