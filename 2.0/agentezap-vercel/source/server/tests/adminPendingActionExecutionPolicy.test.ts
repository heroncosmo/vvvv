import assert from "node:assert/strict";
import {
  buildGenericAssistantFallbackReply,
  buildPendingActionRecoveryReply,
  getPendingActionExecutionPolicy,
  isTechnicalFailureMessage,
} from "../adminPendingActionExecutionPolicy";

assert.equal(isTechnicalFailureMessage("Ocorreu um erro ao editar o prompt. Tente novamente."), true);
assert.equal(isTechnicalFailureMessage("Perfeito. Me confirma so o nome da empresa."), false);

assert.equal(getPendingActionExecutionPolicy("edit_prompt").maxAttempts >= 4, true);
assert.equal(getPendingActionExecutionPolicy("criar_agente").maxAttempts >= 5, true);
assert.equal(getPendingActionExecutionPolicy("save_media").keepPendingAliveMs >= 10 * 60_000, true);

assert.match(buildPendingActionRecoveryReply("registrar_pagamento"), /comprovante/i);
assert.match(buildPendingActionRecoveryReply("criar_agente"), /teste/i);
assert.match(buildGenericAssistantFallbackReply(), /duvida|ajustar/i);

console.log("adminPendingActionExecutionPolicy.test.ts ok");
