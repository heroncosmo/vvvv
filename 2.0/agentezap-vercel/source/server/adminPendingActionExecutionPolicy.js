"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingActionExecutionPolicy = getPendingActionExecutionPolicy;
exports.buildPendingActionRecoveryReply = buildPendingActionRecoveryReply;
exports.isTechnicalFailureMessage = isTechnicalFailureMessage;
exports.buildGenericAssistantFallbackReply = buildGenericAssistantFallbackReply;
var DEFAULT_POLICY = {
    maxAttempts: 2,
    retryBaseDelayMs: 1200,
    keepPendingAliveMs: 10 * 60000,
    recoveryReply: 'Estou concluindo isso aqui e te confirmo assim que terminar.',
};
var POLICIES = {
    edit_prompt: {
        maxAttempts: 4,
        retryBaseDelayMs: 1200,
        keepPendingAliveMs: 10 * 60000,
        recoveryReply: 'Estou aplicando esse ajuste aqui e te confirmo assim que terminar.',
    },
    save_media: {
        maxAttempts: 4,
        retryBaseDelayMs: 1500,
        keepPendingAliveMs: 10 * 60000,
        recoveryReply: 'Estou finalizando o cadastro dessa midia aqui e te confirmo assim que concluir.',
    },
    criar_agente: {
        maxAttempts: 5,
        retryBaseDelayMs: 1500,
        keepPendingAliveMs: 12 * 60000,
        recoveryReply: 'Estou terminando a configuracao do seu teste aqui e te mando o acesso assim que concluir.',
    },
    registrar_pagamento: {
        maxAttempts: 4,
        retryBaseDelayMs: 1500,
        keepPendingAliveMs: 12 * 60000,
        recoveryReply: 'Estou validando esse comprovante aqui e te confirmo assim que terminar.',
    },
};
function getPendingActionExecutionPolicy(type) {
    return POLICIES[type] || DEFAULT_POLICY;
}
function buildPendingActionRecoveryReply(type) {
    return getPendingActionExecutionPolicy(type).recoveryReply;
}
function isTechnicalFailureMessage(text) {
    var normalized = String(text || '').trim().toLowerCase();
    if (!normalized)
        return false;
    return (normalized.startsWith('❌') ||
        normalized.includes('nao foi possivel') ||
        normalized.includes('não foi possível') ||
        normalized.includes('ocorreu um erro') ||
        normalized.includes('erro desconhecido') ||
        normalized.includes('erro interno') ||
        normalized.includes('falha interna') ||
        normalized.includes('temporariamente indisponivel') ||
        normalized.includes('temporariamente indisponível') ||
        normalized.includes('timeout') ||
        normalized.includes('tente novamente'));
}
function buildGenericAssistantFallbackReply() {
    return 'Me fala sua duvida ou o que voce quer ajustar que eu sigo por aqui.';
}
