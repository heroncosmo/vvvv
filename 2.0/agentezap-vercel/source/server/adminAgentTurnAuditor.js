"use strict";
/**
 * ========================================================================
 * ADMIN AGENT TURN AUDITOR — Auditor de Turnos
 * ========================================================================
 * Registra cada turno processado para análise posterior.
 * Funciona como "Layer 7" do orquestrador (transversal).
 *
 * Características:
 *  - Buffer em memória com flush periódico
 *  - Detecção de anti-padrões (re-ask loop, mojibake, false existing)
 *  - Métricas de performance por sessão
 *  - Log estruturado para debugging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditTurn = auditTurn;
exports.updateLastAuditWithSanitizeResult = updateLastAuditWithSanitizeResult;
exports.getAuditRecords = getAuditRecords;
exports.getRecentAlerts = getRecentAlerts;
exports.getSessionMetrics = getSessionMetrics;
exports.clearAuditRecords = clearAuditRecords;
exports.getAlertSummary = getAlertSummary;
// ============================================================================
// AUDIT BUFFER
// ============================================================================
/** Buffer em memória — last N records per phone */
var auditBuffer = new Map();
var MAX_RECORDS_PER_PHONE = 50;
var MAX_PHONES = 500;
/** Buffer de alertas */
var alertBuffer = [];
var MAX_ALERTS = 200;
/**
 * Detecta re-ask loops: mesmo estágio perguntado 3+ vezes consecutivas.
 */
function detectReAskLoop(records) {
    if (records.length < 3)
        return null;
    var lastThree = records.slice(-3);
    var allSameStage = lastThree.every(function (r) { return r.newStage === lastThree[0].newStage && r.previousStage === lastThree[0].previousStage; });
    var allStayDecisions = lastThree.every(function (r) { return r.decision.action === "stay_stage"; });
    if (allSameStage && allStayDecisions) {
        return {
            type: "re_ask_loop",
            severity: "critical",
            message: "Re-ask loop detectado! Est\u00E1gio \"".concat(lastThree[0].newStage, "\" perguntado ").concat(lastThree.length, "x consecutivas"),
            turnIndex: lastThree[lastThree.length - 1].turnIndex,
            phoneNumber: lastThree[0].phoneNumber,
            timestamp: Date.now(),
        };
    }
    return null;
}
/**
 * Detecta mojibake repetido em respostas consecutivas.
 */
function detectRepeatedMojibake(records) {
    if (records.length < 2)
        return null;
    var recentMojibake = records.slice(-3).filter(function (r) { return r.hadMojibake; });
    if (recentMojibake.length >= 2) {
        return {
            type: "mojibake_repeated",
            severity: "warning",
            message: "Mojibake detectado em ".concat(recentMojibake.length, " respostas consecutivas"),
            turnIndex: records[records.length - 1].turnIndex,
            phoneNumber: records[0].phoneNumber,
            timestamp: Date.now(),
        };
    }
    return null;
}
/**
 * Detecta estágio "stuck" — sem avanço após N turnos.
 */
function detectStuckStage(records) {
    if (records.length < 5)
        return null;
    var lastFive = records.slice(-5);
    var allSameStage = lastFive.every(function (r) { return r.newStage === lastFive[0].newStage; });
    if (allSameStage) {
        return {
            type: "stuck_stage",
            severity: "warning",
            message: "Est\u00E1gio \"".concat(lastFive[0].newStage, "\" sem avan\u00E7o h\u00E1 ").concat(lastFive.length, " turnos"),
            turnIndex: lastFive[lastFive.length - 1].turnIndex,
            phoneNumber: lastFive[0].phoneNumber,
            timestamp: Date.now(),
        };
    }
    return null;
}
// ============================================================================
// MAIN AUDITOR
// ============================================================================
/**
 * Registra um turno processado no buffer de auditoria.
 * Retorna alertas de anti-padrões detectados.
 */
function auditTurn(state, classification, decision, previousMode, previousStage, responseText, processingTimeMs, llmCalls) {
    if (llmCalls === void 0) { llmCalls = 0; }
    var record = {
        turnIndex: state.turnIndex,
        timestamp: Date.now(),
        phoneNumber: state.phoneNumber,
        rawInput: classification.originalInput,
        normalizedInput: classification.normalizedInput,
        mediaType: classification.mediaType,
        classification: classification,
        decision: decision,
        previousMode: previousMode,
        previousStage: previousStage,
        newMode: state.mode,
        newStage: state.onboardingStage,
        responseText: responseText.substring(0, 200), // Limitar tamanho
        responseLength: responseText.length,
        hadMojibake: false, // Será atualizado pelo sanitizer
        hadFalseExisting: false, // Será atualizado pelo sanitizer
        processingTimeMs: processingTimeMs,
        llmCalls: llmCalls,
    };
    // Add to buffer
    var phoneRecords = auditBuffer.get(state.phoneNumber);
    if (!phoneRecords) {
        phoneRecords = [];
        auditBuffer.set(state.phoneNumber, phoneRecords);
    }
    phoneRecords.push(record);
    // Trim to max
    if (phoneRecords.length > MAX_RECORDS_PER_PHONE) {
        phoneRecords.splice(0, phoneRecords.length - MAX_RECORDS_PER_PHONE);
    }
    // Trim phones
    if (auditBuffer.size > MAX_PHONES) {
        var oldest = Array.from(auditBuffer.entries())
            .sort(function (a, b) {
            var _a, _b;
            var aLast = ((_a = a[1][a[1].length - 1]) === null || _a === void 0 ? void 0 : _a.timestamp) || 0;
            var bLast = ((_b = b[1][b[1].length - 1]) === null || _b === void 0 ? void 0 : _b.timestamp) || 0;
            return aLast - bLast;
        })
            .slice(0, auditBuffer.size - MAX_PHONES);
        for (var _i = 0, oldest_1 = oldest; _i < oldest_1.length; _i++) {
            var phone = oldest_1[_i][0];
            auditBuffer.delete(phone);
        }
    }
    // Detect anti-patterns
    var alerts = [];
    var reAsk = detectReAskLoop(phoneRecords);
    if (reAsk)
        alerts.push(reAsk);
    var mojibake = detectRepeatedMojibake(phoneRecords);
    if (mojibake)
        alerts.push(mojibake);
    var stuck = detectStuckStage(phoneRecords);
    if (stuck)
        alerts.push(stuck);
    // Slow response
    if (processingTimeMs > 15000) {
        alerts.push({
            type: "slow_response",
            severity: "warning",
            message: "Resposta lenta: ".concat(processingTimeMs, "ms"),
            turnIndex: state.turnIndex,
            phoneNumber: state.phoneNumber,
            timestamp: Date.now(),
        });
    }
    // Store alerts
    for (var _a = 0, alerts_1 = alerts; _a < alerts_1.length; _a++) {
        var alert_1 = alerts_1[_a];
        alertBuffer.push(alert_1);
        if (alertBuffer.length > MAX_ALERTS) {
            alertBuffer.shift();
        }
        console.log("[AUDITOR] \u26A0 ".concat(alert_1.severity.toUpperCase(), ": ").concat(alert_1.message));
    }
    // Log structured
    if (decision.shouldAudit) {
        console.log("[AUDITOR] Turn ".concat(state.turnIndex, " | ").concat(state.phoneNumber, " | ") +
            "".concat(previousMode, "\u2192").concat(state.mode, " | ").concat(previousStage, "\u2192").concat(state.onboardingStage, " | ") +
            "Intent: ".concat(classification.intent, " (").concat(classification.confidence.toFixed(2), ") | ") +
            "Action: ".concat(decision.action, " | ").concat(processingTimeMs, "ms"));
    }
    return alerts;
}
/**
 * Atualiza o último registro de auditoria com informações do sanitizer.
 */
function updateLastAuditWithSanitizeResult(phoneNumber, hadMojibake, hadFalseExisting) {
    var records = auditBuffer.get(phoneNumber);
    if (!records || records.length === 0)
        return;
    var lastRecord = records[records.length - 1];
    lastRecord.hadMojibake = hadMojibake;
    lastRecord.hadFalseExisting = hadFalseExisting;
}
// ============================================================================
// QUERY FUNCTIONS
// ============================================================================
/** Retorna os registros de auditoria para um telefone */
function getAuditRecords(phoneNumber) {
    return auditBuffer.get(phoneNumber) || [];
}
/** Retorna os alertas recentes */
function getRecentAlerts(limit) {
    if (limit === void 0) { limit = 20; }
    return alertBuffer.slice(-limit);
}
/** Retorna métricas agregadas para um telefone */
function getSessionMetrics(phoneNumber) {
    var records = auditBuffer.get(phoneNumber) || [];
    if (records.length === 0) {
        return {
            totalTurns: 0,
            avgProcessingTime: 0,
            reAskCount: 0,
            mojibakeCount: 0,
            falseExistingCount: 0,
            stageTransitions: [],
            timeInOnboarding: 0,
        };
    }
    var avgTime = records.reduce(function (sum, r) { return sum + r.processingTimeMs; }, 0) / records.length;
    var reAskCount = records.filter(function (r) { return r.decision.action === "stay_stage"; }).length;
    var mojibakeCount = records.filter(function (r) { return r.hadMojibake; }).length;
    var falseExistingCount = records.filter(function (r) { return r.hadFalseExisting; }).length;
    var transitions = records
        .filter(function (r) { return r.previousStage !== r.newStage; })
        .map(function (r) { return "".concat(r.previousStage, "\u2192").concat(r.newStage); });
    var firstOnboarding = records.find(function (r) { return r.previousMode === "onboarding" || r.newMode === "onboarding"; });
    var lastOnboarding = records.filter(function (r) { return r.newMode === "onboarding"; }).pop();
    var timeInOnboarding = firstOnboarding && lastOnboarding
        ? lastOnboarding.timestamp - firstOnboarding.timestamp
        : 0;
    return {
        totalTurns: records.length,
        avgProcessingTime: Math.round(avgTime),
        reAskCount: reAskCount,
        mojibakeCount: mojibakeCount,
        falseExistingCount: falseExistingCount,
        stageTransitions: transitions,
        timeInOnboarding: timeInOnboarding,
    };
}
/** Limpa buffer de auditoria para um telefone */
function clearAuditRecords(phoneNumber) {
    auditBuffer.delete(phoneNumber);
}
/** Retorna contagem global de alertas por tipo */
function getAlertSummary() {
    var summary = {};
    for (var _i = 0, alertBuffer_1 = alertBuffer; _i < alertBuffer_1.length; _i++) {
        var alert_2 = alertBuffer_1[_i];
        summary[alert_2.type] = (summary[alert_2.type] || 0) + 1;
    }
    return summary;
}
