import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getPendingActionExecutionPolicy,
  isTechnicalFailureMessage,
} from "../adminPendingActionExecutionPolicy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const policySource = readFileSync(resolve(__dirname, "../adminPendingActionExecutionPolicy.ts"), "utf8");

assert.equal(isTechnicalFailureMessage("Ocorreu um erro ao editar o prompt. Tente novamente."), true);
assert.equal(isTechnicalFailureMessage("Perfeito. Me confirma so o nome da empresa."), false);

assert.equal(getPendingActionExecutionPolicy("edit_prompt").maxAttempts >= 4, true);
assert.equal(getPendingActionExecutionPolicy("codex_create_agent_contract").maxAttempts, 1);
assert.equal(getPendingActionExecutionPolicy("save_media").keepPendingAliveMs >= 10 * 60_000, true);
assert.equal(getPendingActionExecutionPolicy("registrar_pagamento").maxAttempts >= 4, true);

assert.doesNotMatch(policySource, /recoveryReply|buildPendingActionRecoveryReply|buildGenericAssistantFallbackReply/);
assert.doesNotMatch(
  policySource,
  /Estou concluindo isso aqui|Estou aplicando esse ajuste|Estou finalizando o cadastro|Estou validando esse comprovante|te confirmo assim que|Me fala sua/i,
);

console.log("adminPendingActionExecutionPolicy.test.ts ok");
