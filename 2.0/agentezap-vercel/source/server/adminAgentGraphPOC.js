"use strict";
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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateGraphState = getOrCreateGraphState;
exports.clearGraphState = clearGraphState;
exports.syncFromLegacySession = syncFromLegacySession;
exports.syncFromLegacySessionIfNew = syncFromLegacySessionIfNew;
exports.processAdminMessageGraph = processAdminMessageGraph;
exports.peekGraphState = peekGraphState;
exports.getGraphStateDebugSummary = getGraphStateDebugSummary;
var adminAgentGraphState_1 = require("./adminAgentGraphState");
var adminAgentGraphClassifier_1 = require("./adminAgentGraphClassifier");
var adminAgentGraphPolicy_1 = require("./adminAgentGraphPolicy");
var adminAgentGraphExecutor_1 = require("./adminAgentGraphExecutor");
var adminAgentOutputSanitizer_1 = require("./adminAgentOutputSanitizer");
var adminAgentGraphValidator_1 = require("./adminAgentGraphValidator");
var adminAgentTurnAuditor_1 = require("./adminAgentTurnAuditor");
// ============================================================================
// GRAPH STATE STORE (em memória, paralelo ao clientSessions legado)
// ============================================================================
var graphStates = new Map();
/** Obtém ou cria estado do grafo para um telefone */
function getOrCreateGraphState(phoneNumber, contactName) {
    var state = graphStates.get(phoneNumber);
    if (!state) {
        state = (0, adminAgentGraphState_1.createInitialGraphState)(phoneNumber, contactName);
        graphStates.set(phoneNumber, state);
    }
    return state;
}
/** Atualiza estado do grafo */
function updateGraphState(phoneNumber, updates) {
    var current = graphStates.get(phoneNumber) || (0, adminAgentGraphState_1.createInitialGraphState)(phoneNumber);
    var updated = __assign(__assign(__assign({}, current), updates), { updatedAt: Date.now() });
    graphStates.set(phoneNumber, updated);
    return updated;
}
/** Limpa estado do grafo */
function clearGraphState(phoneNumber) {
    graphStates.delete(phoneNumber);
}
/** Sincroniza estado do grafo a partir de sessão legada */
function syncFromLegacySession(session) {
    var state = (0, adminAgentGraphState_1.fromLegacySession)(session);
    graphStates.set(state.phoneNumber, state);
    return state;
}
/**
 * Sincroniza a partir da sessão legada APENAS se não existe estado em memória.
 * Uso: antes de processar cada mensagem — preserva o estado acumulado entre turnos.
 */
function syncFromLegacySessionIfNew(session) {
    var cleanPhone = String(session.phoneNumber || '').replace(/\D/g, '');
    if (graphStates.has(cleanPhone)) {
        // Estado já existe — não sobrescrever; retornar o acumulado
        return graphStates.get(cleanPhone);
    }
    // Primeira mensagem desta phone — inicializar a partir da sessão legada
    return syncFromLegacySession(session);
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
function processAdminMessageGraph(phoneNumber, messageText, mediaType, mediaUrl, contactName) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, cleanPhone, state, previousMode, previousStage, cleanMessage, classification, decision, execResult, updatedHistory, deliveryValidation, sanitizeResult, processingTimeMs, alerts;
        var _a;
        return __generator(this, function (_b) {
            startTime = Date.now();
            cleanPhone = phoneNumber.replace(/\D/g, "");
            state = getOrCreateGraphState(cleanPhone, contactName);
            previousMode = state.mode;
            previousStage = state.onboardingStage;
            cleanMessage = (messageText || "").trim();
            if (!cleanMessage && !mediaType) {
                // Mensagem vazia
                return [2 /*return*/, buildEmptyResult(state, startTime)];
            }
            classification = (0, adminAgentGraphClassifier_1.classifyTurn)(cleanMessage, state, mediaType, mediaUrl);
            decision = (0, adminAgentGraphPolicy_1.evaluatePolicy)(state, classification);
            execResult = (0, adminAgentGraphExecutor_1.executePolicyDecision)(state, decision, classification);
            // ---- (4b) Aplicar novos slots e facts ao estado ----
            if (Object.keys(execResult.newSlots).length > 0) {
                state = updateGraphState(cleanPhone, {
                    capturedSlots: __assign(__assign({}, state.capturedSlots), execResult.newSlots),
                    stickyFacts: __assign(__assign({}, state.stickyFacts), execResult.newFacts),
                });
            }
            // ---- (4c) Atualizar estágio se houve transição ----
            if (execResult.newStage) {
                state = updateGraphState(cleanPhone, {
                    onboardingStage: execResult.newStage,
                });
            }
            updatedHistory = __spreadArray(__spreadArray([], state.conversationHistory, true), [
                { role: "user", content: cleanMessage, timestamp: Date.now() },
            ], false);
            state = updateGraphState(cleanPhone, {
                conversationHistory: updatedHistory,
                turnIndex: state.turnIndex + 1,
            });
            if (execResult.shouldCreateAgent && state.testAccountCredentials) {
                deliveryValidation = (0, adminAgentGraphValidator_1.validateDelivery)(state, execResult.responseText, state.testAccountCredentials);
            }
            sanitizeResult = (0, adminAgentOutputSanitizer_1.sanitizeOutput)(execResult.responseText, {
                isExistingAccount: (_a = state.testAccountCredentials) === null || _a === void 0 ? void 0 : _a.isExistingAccount,
                maxLength: 4000,
                convertMarkdown: true,
                removeLLMArtefacts: true,
            });
            processingTimeMs = Date.now() - startTime;
            alerts = (0, adminAgentTurnAuditor_1.auditTurn)(state, classification, decision, previousMode, previousStage, sanitizeResult.text, processingTimeMs, execResult.llmCallCount);
            // Atualizar auditor com resultado do sanitizer
            (0, adminAgentTurnAuditor_1.updateLastAuditWithSanitizeResult)(cleanPhone, sanitizeResult.hadMojibake, sanitizeResult.hadFalseExisting);
            // ---- (7b) Adicionar resposta ao histórico ----
            if (sanitizeResult.text) {
                state = updateGraphState(cleanPhone, {
                    conversationHistory: __spreadArray(__spreadArray([], state.conversationHistory, true), [
                        { role: "assistant", content: sanitizeResult.text, timestamp: Date.now() },
                    ], false),
                });
            }
            return [2 /*return*/, {
                    text: sanitizeResult.text,
                    actions: execResult.actions,
                    mediaActions: execResult.mediaActions,
                    shouldCreateAgent: execResult.shouldCreateAgent,
                    classification: classification,
                    decision: decision,
                    sanitizeResult: sanitizeResult,
                    alerts: alerts,
                    deliveryValidation: deliveryValidation,
                    newState: state,
                    processingTimeMs: processingTimeMs,
                }];
        });
    });
}
// ============================================================================
// HELPERS
// ============================================================================
function buildEmptyResult(state, startTime) {
    var emptyClassification = {
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
    var emptyDecision = {
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
function peekGraphState(phoneNumber) {
    return graphStates.get(phoneNumber);
}
/** Retorna resumo rápido do estado para debug */
function getGraphStateDebugSummary(phoneNumber) {
    var state = graphStates.get(phoneNumber);
    if (!state)
        return "[".concat(phoneNumber, "] Sem estado no grafo");
    var slotsCollected = Object.keys(state.capturedSlots).join(", ") || "(nenhum)";
    var isComplete = (0, adminAgentGraphState_1.isOnboardingComplete)(state);
    var nextPending = (0, adminAgentGraphState_1.getNextPendingStage)(state);
    return ("[".concat(phoneNumber, "] Mode: ").concat(state.mode, " | Stage: ").concat(state.onboardingStage, " | ") +
        "Slots: [".concat(slotsCollected, "] | Complete: ").concat(isComplete, " | ") +
        "NextPending: ".concat(nextPending || "none", " | Turns: ").concat(state.turnIndex, " | ") +
        "Delivery: ".concat(state.deliveryStatus));
}
