"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialGraphState = createInitialGraphState;
exports.fromLegacySession = fromLegacySession;
exports.isOnboardingComplete = isOnboardingComplete;
exports.getNextPendingStage = getNextPendingStage;
// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================
/** Cria um AdminGraphState inicial para novo cliente */
function createInitialGraphState(phoneNumber, contactName) {
    var now = Date.now();
    return {
        phoneNumber: phoneNumber,
        contactName: contactName,
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
function fromLegacySession(session) {
    var _a, _b;
    var now = Date.now();
    var profile = session.setupProfile || {};
    // Map captured slots from rawAnswers + answered flags
    var capturedSlots = {};
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
    var stickyFacts = {};
    if (profile.businessSummary) {
        stickyFacts["businessSummary"] = {
            key: "businessSummary",
            value: profile.businessSummary,
            source: "user",
            capturedAt: now,
        };
    }
    if ((_a = session.agentConfig) === null || _a === void 0 ? void 0 : _a.company) {
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
        mode: session.flowState || "onboarding",
        onboardingStage: profile.questionStage || "business",
        capturedSlots: capturedSlots,
        stickyFacts: stickyFacts,
        agentConfig: session.agentConfig || {},
        workflowKind: profile.workflowKind || "generic",
        usesScheduling: profile.usesScheduling || false,
        wantsAutoFollowUp: profile.wantsAutoFollowUp || false,
        restaurantOrderMode: profile.restaurantOrderMode,
        workDays: profile.workDays,
        workStartTime: profile.workStartTime,
        workEndTime: profile.workEndTime,
        deliveryStatus: "not_started",
        awaitingPaymentProof: session.awaitingPaymentProof || false,
        awaitingPaymentChoice: false,
        pendingMedia: session.pendingMedia,
        uploadedMedia: session.uploadedMedia || [],
        memorySummary: session.memorySummary,
        conversationHistory: (session.conversationHistory || []).map(function (m) { return ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp instanceof Date ? m.timestamp.getTime() : m.timestamp,
        }); }),
        turnIndex: ((_b = session.conversationHistory) === null || _b === void 0 ? void 0 : _b.length) || 0,
        createdAt: now,
        updatedAt: now,
    };
}
/** Verifica se todos os slots obrigatórios do onboarding estão preenchidos */
function isOnboardingComplete(state) {
    var _a;
    var hasBusinessSlot = !!state.capturedSlots["businessSummary"];
    var hasBehaviorSlot = !!state.capturedSlots["desiredAgentBehavior"];
    var hasWorkflowSlot = !!state.capturedSlots["workflowPreference"];
    if (!hasBusinessSlot || !hasBehaviorSlot || !hasWorkflowSlot)
        return false;
    // Se precisa de horários (scheduling), verificar
    if (state.usesScheduling || state.workflowKind === "scheduling" || state.workflowKind === "salon") {
        if (!((_a = state.workDays) === null || _a === void 0 ? void 0 : _a.length) || !state.workStartTime || !state.workEndTime)
            return false;
    }
    return true;
}
/** Retorna o próximo estágio pendente no onboarding */
function getNextPendingStage(state) {
    var _a;
    if (!state.capturedSlots["businessSummary"])
        return "business";
    if (!state.capturedSlots["desiredAgentBehavior"])
        return "behavior";
    if (!state.capturedSlots["workflowPreference"])
        return "workflow";
    if ((state.usesScheduling || state.workflowKind === "scheduling" || state.workflowKind === "salon") &&
        (!((_a = state.workDays) === null || _a === void 0 ? void 0 : _a.length) || !state.workStartTime || !state.workEndTime)) {
        return "hours";
    }
    return null;
}
