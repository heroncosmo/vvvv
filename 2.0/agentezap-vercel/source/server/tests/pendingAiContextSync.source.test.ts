import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  executeRetryableCodexNoSend,
  readPositiveIntegerEnv,
  resolveRetryableCodexNoSendFailure,
} from "../codexNoSendRetry";

test("pending AI response refreshes current payload from latest unanswered inbound history before generation", () => {
  const source = readFileSync("server/whatsapp.ts", "utf8");
  const processStart = source.indexOf("async function processAccumulatedMessages");
  assert.notEqual(processStart, -1);

  const conditionIndex = source.indexOf("if (!pendingFirstMessageRecovery && !pending.isCTWAFallback", processStart);
  const syncIndex = source.indexOf("const latestUnansweredTextsForAI = resolveLatestUnansweredTextsForPending", processStart);
  const guardIndex = source.indexOf("const automationGuardDecision = await evaluateInboundAutomationGuard", processStart);
  const generationIndex = source.indexOf("const aiResult = await generateAIResponse", processStart);
  const combinedTextIndex = source.indexOf("const combinedText = pendingMessagesForAI.join", processStart);

  assert.ok(conditionIndex > processStart, "deve proteger casos especiais antes da sincronizacao");
  assert.ok(syncIndex > processStart, "deve sincronizar o payload pendente dentro do processamento acumulado");
  assert.ok(syncIndex > conditionIndex, "deve sincronizar dentro da condicao protegida");
  assert.ok(guardIndex > syncIndex, "deve sincronizar antes do guard de automacao");
  assert.ok(generationIndex > syncIndex, "deve sincronizar antes da chamada da IA");
  assert.ok(combinedTextIndex > syncIndex, "deve sincronizar antes de montar a mensagem atual final");

  const syncBlock = source.slice(conditionIndex, guardIndex);
  assert.match(syncBlock, /!pending\.isCTWAFallback/);
  assert.match(syncBlock, /!pending\.forceRespond/);
  assert.match(syncBlock, /arePendingMessageBatchesEquivalent/);
  assert.match(syncBlock, /pendingMessagesForAI = latestUnansweredTextsForAI/);
  assert.match(syncBlock, /replacePendingAIResponseMessages/);
  assert.match(syncBlock, /pendingMutationGuard\.expectedMessages/);
  assert.match(
    source,
    /const pendingInboundRecordSignatureForAI = resolveLatestUnansweredInboundBatchForPending\([\s\S]*conversationHistory[\s\S]*qrReconnectCutoffMsForPending[\s\S]*\)\.signatures/,
    "deve capturar a assinatura record-level do lote inbound usado pela IA",
  );
});

test("WhatsApp human split sanitizes the final outgoing bubble in production path", () => {
  const source = readFileSync("server/whatsapp.ts", "utf8");
  const splitStart = source.indexOf("export function splitMessageHumanLike");
  const nextFunction = source.indexOf("function splitSectionIntoChunks", splitStart);
  assert.notEqual(splitStart, -1);
  assert.ok(nextFunction > splitStart);

  const splitBlock = source.slice(splitStart, nextFunction);
  assert.match(splitBlock, /sanitizeFinalMessageParts/);
  assert.match(splitBlock, /sanitizeAgentResponseTail/);
});

test("pending AI response refreshes latest inbound context again immediately before sending", () => {
  const source = readFileSync("server/whatsapp.ts", "utf8");
  const helperStart = source.indexOf("async function refreshPendingAIResponseBeforeSend");
  assert.notEqual(helperStart, -1, "deve existir helper de freshness final antes do envio");
  const helperEnd = source.indexOf("function hasPendingInboundAudioTranscription", helperStart);
  assert.ok(helperEnd > helperStart, "deve encontrar fim do helper de freshness final");
  const helperBlock = source.slice(helperStart, helperEnd);

  assert.match(helperBlock, /storage\.getMessagesByConversationId\(params\.conversationId\)/);
  assert.match(helperBlock, /resolveLatestUnansweredInboundBatchForPending/);
  assert.match(helperBlock, /arePendingMessageBatchesEquivalent/);
  assert.match(helperBlock, /arePendingInboundRecordBatchesEquivalent/);
  assert.match(helperBlock, /pendingInboundRecordSignatureForAI/);
  assert.match(source, /function buildPendingInboundFreshnessSignature[\s\S]*mediaType[\s\S]*media_type/);
  assert.match(helperBlock, /storage\.updatePendingAIResponseMessages\([\s\S]*\{ resetRetry: true \}/);
  assert.match(helperBlock, /schedulePendingResponseProcessing/);
  assert.match(helperBlock, /fresh_inbound_before_send/);

  const outboundStart = source.indexOf("const aiResponse = aiResult?.text || null");
  assert.notEqual(outboundStart, -1, "deve encontrar inicio da saida da IA");
  const sendStart = source.indexOf("if (aiResponse) {", outboundStart);
  const notificationIndex = source.indexOf("NOTIFICATION SYSTEM UNIVERSAL", outboundStart);
  const cacheIndex = source.indexOf("registerSentMessageCache(conversationId, aiResponse)", outboundStart);
  const enqueueIndex = source.indexOf("messageQueueService.enqueue", outboundStart);
  const mediaExecuteIndex = source.indexOf("await executeMediaActions({", outboundStart);
  const refreshCallIndex = source.indexOf("await ensureFreshnessBeforeFirstOutbound()", outboundStart);
  const requeueFlagIndex = source.indexOf("responseRequeuedForFreshInbound = true", refreshCallIndex);

  assert.ok(refreshCallIndex > outboundStart, "deve chamar freshness final depois de gerar resposta/midias");
  assert.ok(refreshCallIndex < notificationIndex, "freshness final deve rodar antes de notificacao externa");
  assert.ok(refreshCallIndex < sendStart, "freshness final deve rodar antes do bloco de texto");
  assert.ok(refreshCallIndex < cacheIndex, "freshness final deve rodar antes do cache anti-duplicacao");
  assert.ok(refreshCallIndex < enqueueIndex, "freshness final deve rodar antes do primeiro enqueue WhatsApp");
  assert.ok(refreshCallIndex < mediaExecuteIndex, "freshness final deve rodar antes de envio media-only");
  assert.ok(requeueFlagIndex > refreshCallIndex, "deve marcar reprocessamento para o finally nao tratar como falha");

  const finallyIndex = source.indexOf("} else if (responseRequeuedForFreshInbound)", outboundStart);
  const retryResetIndex = source.indexOf("resetPendingAIResponseForRetry(conversationId, backoffSec", finallyIndex);
  assert.ok(finallyIndex > refreshCallIndex, "finally deve reconhecer requeue por mensagem nova");
  assert.ok(finallyIndex < retryResetIndex, "requeue por mensagem nova deve evitar retry de falha generico");

  const freshnessGateSnippet = source.slice(Math.max(0, refreshCallIndex - 80), refreshCallIndex + 80);
  assert.doesNotMatch(
    freshnessGateSnippet,
    /\(aiResponse \|\| mediaActions\.length > 0\) &&/,
    "freshness antes de notificacao nao pode depender de haver texto/midia publica",
  );
});

test("pending AI retry records operational reason instead of clearing last_error silently", () => {
  const source = readFileSync("server/whatsapp.ts", "utf8");

  assert.match(source, /session_unavailable_db_connected_retry/);
  assert.match(source, /socket_not_open_retry readyState=/);
  assert.match(source, /responseRequeuedForTransportRetry = true/);
  assert.match(
    source,
    /resetPendingAIResponseForRetry\(conversationId, backoffSec, pendingMutationGuard, \{\s*lastError:/,
    "retry generico deve persistir last_error quando houver motivo operacional",
  );

  const sessionRetryStart = source.indexOf("session_unavailable_db_connected_retry");
  const sessionRetryEnd = source.indexOf("conversationsBeingProcessed.delete(conversationId);", sessionRetryStart);
  const sessionRetryBlock = source.slice(sessionRetryStart, sessionRetryEnd);
  assert.match(sessionRetryBlock, /resetPendingAIResponseForRetry\(conversationId, retryDelaySec, pendingMutationGuard, \{\s*lastError:/);
  assert.doesNotMatch(sessionRetryBlock, /updatePendingAIResponseMessages/);

  const socketRetryStart = source.indexOf("socket_not_open_retry readyState=");
  const socketRetryEnd = source.indexOf("conversationsBeingProcessed.delete(conversationId);", socketRetryStart);
  const socketRetryBlock = source.slice(socketRetryStart, socketRetryEnd);
  assert.match(socketRetryBlock, /resetPendingAIResponseForRetry\(conversationId, retryDelaySec, pendingMutationGuard, \{\s*lastError:/);
  assert.doesNotMatch(socketRetryBlock, /updatePendingAIResponseMessages/);
});

test("Codex no_send finalizes pending response as skipped after final freshness check", () => {
  const whatsappSource = readFileSync("server/whatsapp.ts", "utf8");
  const storageSource = readFileSync("server/storage.ts", "utf8");

  assert.match(
    storageSource,
    /markPendingAIResponseSkipped\(conversationId: string, reason: string, guard\?: PendingAIResponseMutationGuard\): Promise<void>;/,
    "contrato do storage deve expor skipped para a fila nao depender de completed/failure generico",
  );
  assert.match(
    storageSource,
    /SET status = 'completed',[\s\S]*failure_reason = \$\{`skipped:\$\{reason\}`\},[\s\S]*last_error = NULL,/,
    "fallback completed para skipped deve limpar last_error antigo",
  );
  assert.match(
    storageSource,
    /SET status = 'skipped',[\s\S]*failure_reason = \$\{reason\},[\s\S]*last_error = NULL,/,
    "status skipped nativo deve limpar last_error antigo",
  );

  const outboundStart = whatsappSource.indexOf("const aiResponse = aiResult?.text || null");
  assert.notEqual(outboundStart, -1, "deve encontrar bloco de saida da IA");
  const noSendStart = whatsappSource.indexOf("if (!aiResponse && mediaActions.length === 0 && aiResult?.skipAutoReplyReason)", outboundStart);
  assert.ok(noSendStart > outboundStart, "deve tratar no_send explicitamente antes do envio");
  const noSendFinalizeIndex = whatsappSource.indexOf('await finalizePendingState("skipped", aiResult.skipAutoReplyReason)', noSendStart);
  assert.ok(noSendFinalizeIndex > noSendStart, "deve finalizar no_send como skipped");
  const noSendEnd = whatsappSource.indexOf("if (await ensureFreshnessBeforeFirstOutbound())", noSendFinalizeIndex);
  assert.ok(noSendEnd > noSendFinalizeIndex, "deve encontrar gate geral depois do bloco no_send");
  const noSendBlock = whatsappSource.slice(noSendStart, noSendEnd);

  assert.match(noSendBlock, /await ensureFreshnessBeforeFirstOutbound\(\)/);
  assert.match(noSendBlock, /responseRequeuedForFreshInbound = true/);
  assert.match(noSendBlock, /await finalizePendingState\("skipped", aiResult\.skipAutoReplyReason\)/);

  const lastErrorStart = whatsappSource.indexOf("if (!aiResponse && mediaActions.length === 0", outboundStart);
  const lastErrorEnd = whatsappSource.indexOf("let freshnessCheckedBeforeFirstOutbound = false", lastErrorStart);
  const lastErrorBlock = whatsappSource.slice(lastErrorStart, lastErrorEnd);
  assert.match(lastErrorBlock, /!aiResult\?\.skipAutoReplyReason/);
  assert.match(lastErrorBlock, /ai_result_without_text_or_media/);
});

test("technical Codex no_send is retried instead of being silently skipped", () => {
  const whatsappSource = readFileSync("server/whatsapp.ts", "utf8");
  const aiAgentSource = readFileSync("server/aiAgent.ts", "utf8");
  const codexRetrySource = readFileSync("server/codexNoSendRetry.ts", "utf8");

  assert.match(
    aiAgentSource,
    /skipAutoReplyViolations\?: string\[\];/,
    "AI result must preserve Codex runtime violations for queue retry decisions",
  );
  assert.match(
    aiAgentSource,
    /skipAutoReplyViolations: codexResult\?\.violations \|\| \[\]/,
    "Codex no_send must carry violations back to WhatsApp queue",
  );

  const envParserStart = codexRetrySource.indexOf("function readPositiveIntegerEnv");
  assert.notEqual(envParserStart, -1, "must parse retry limit env safely");
  const envParserEnd = codexRetrySource.indexOf("function resolveRetryableCodexNoSendFailure", envParserStart);
  const envParserBlock = codexRetrySource.slice(envParserStart, envParserEnd);
  assert.match(envParserBlock, /Number\.isFinite\(parsed\)/);
  assert.doesNotMatch(envParserBlock, /Math\.max\(1,\s*Number\(process\.env\.AGENTEZAP_CODEX_NO_SEND_MAX_RETRIES/);

  const helperStart = codexRetrySource.indexOf("function resolveRetryableCodexNoSendFailure");
  assert.notEqual(helperStart, -1, "must classify retryable technical Codex no_send reasons");
  const helperEnd = codexRetrySource.indexOf("export async function executeRetryableCodexNoSend", helperStart);
  const helperBlock = codexRetrySource.slice(helperStart, helperEnd);
  assert.match(helperBlock, /codex_cli_failed_closed/);
  assert.match(helperBlock, /codex_cli_retry_after_timeout_before_final_json/);
  assert.match(helperBlock, /codex_cli_retry_after_sandbox_read_failure/);
  assert.match(helperBlock, /codex_cli_missing_public_output_fail_closed/);
  assert.doesNotMatch(
    helperBlock,
    /comprovante|pagamento|plano|pre[cç]o|funil|seguro|confirmou|cadastro/i,
    "technical retry classifier must not become a semantic/business-flow detector",
  );

  const noSendStart = whatsappSource.indexOf("if (!aiResponse && mediaActions.length === 0 && aiResult?.skipAutoReplyReason)");
  assert.notEqual(noSendStart, -1, "must find no_send branch");
  const retryableIndex = whatsappSource.indexOf("const codexNoSendRetry = await executeRetryableCodexNoSend", noSendStart);
  const skippedIndex = whatsappSource.indexOf('await finalizePendingState("skipped", aiResult.skipAutoReplyReason)', noSendStart);

  assert.ok(retryableIndex > noSendStart, "no_send branch must inspect technical Codex failure before skipped");
  assert.ok(retryableIndex < skippedIndex, "technical no_send retry helper must run before skipped fallback");
  assert.match(
    codexRetrySource,
    /resetPendingAIResponseForRetry\(/,
    "technical no_send must reset pending timer before skipped fallback",
  );
  assert.match(
    codexRetrySource,
    /finalizePendingState\("failed", failureReason, retryableReason\)/,
    "technical no_send max retries must become failed before skipped fallback",
  );
  assert.match(
    codexRetrySource,
    /needsHumanAttention:\s*true/,
    "after max technical retries, the conversation must be raised to human attention",
  );
  assert.match(
    whatsappSource.slice(retryableIndex, skippedIndex),
    /responseRequeuedForTransportRetry = true/,
    "technical Codex retry must prevent finally from treating the turn as generic failure",
  );
});

test("Codex no_send retry helper applies queue side effects without customer-facing fallback", async () => {
  assert.equal(
    resolveRetryableCodexNoSendFailure({
      skipAutoReplyReason: "codex_no_send",
      skipAutoReplyViolations: ["codex_cli_retry_after_timeout_before_final_json"],
    }),
    "codex_no_send | codex_cli_retry_after_timeout_before_final_json",
  );
  assert.equal(
    resolveRetryableCodexNoSendFailure({
      skipAutoReplyReason: "codex_no_send",
      skipAutoReplyViolations: ["cliente pediu plano e comprovante"],
    }),
    null,
    "business/conversation terms must not trigger retry classification",
  );

  const originalEnv = process.env.AGENTEZAP_CODEX_NO_SEND_MAX_RETRIES;
  process.env.AGENTEZAP_CODEX_NO_SEND_MAX_RETRIES = "NaN";
  assert.equal(readPositiveIntegerEnv("AGENTEZAP_CODEX_NO_SEND_MAX_RETRIES", 3), 3);
  process.env.AGENTEZAP_CODEX_NO_SEND_MAX_RETRIES = "2.9";
  assert.equal(readPositiveIntegerEnv("AGENTEZAP_CODEX_NO_SEND_MAX_RETRIES", 3), 2);
  if (originalEnv === undefined) {
    delete process.env.AGENTEZAP_CODEX_NO_SEND_MAX_RETRIES;
  } else {
    process.env.AGENTEZAP_CODEX_NO_SEND_MAX_RETRIES = originalEnv;
  }

  const calls: Array<{ name: string; args: unknown[] }> = [];
  const retryCounter = new Map<string, number>();
  const pending = { retryCount: 0 };
  const requeue = await executeRetryableCodexNoSend({
    aiResult: {
      skipAutoReplyReason: "codex_no_send",
      skipAutoReplyViolations: ["codex_cli_failed_closed"],
    },
    conversationId: "conv-1",
    pending,
    pendingMutationGuard: { expectedMessages: ["oi"] },
    pendingRetryCounter: retryCounter,
    maxRetries: 3,
    responseDelaySecondsForRetry: 5,
    resolveDelaySeconds: ({ retryCount, responseDelaySeconds }) => retryCount + responseDelaySeconds,
    resetPendingAIResponseForRetry: async (...args) => calls.push({ name: "reset", args }),
    updateConversation: async (...args) => calls.push({ name: "attention", args }),
    finalizePendingState: async (...args) => calls.push({ name: "finalize", args }),
  });

  assert.equal(requeue?.status, "requeued");
  assert.equal(pending.retryCount, 1);
  assert.equal(retryCounter.get("conv-1"), 1);
  assert.deepEqual(calls.map((call) => call.name), ["reset"]);
  assert.deepEqual(calls[0].args.slice(0, 2), ["conv-1", 6]);
  assert.deepEqual(calls[0].args[3], { lastError: "codex_no_send | codex_cli_failed_closed" });

  calls.length = 0;
  pending.retryCount = 3;
  retryCounter.set("conv-1", 3);
  const failed = await executeRetryableCodexNoSend({
    aiResult: {
      skipAutoReplyReason: "codex_no_send",
      skipAutoReplyViolations: ["codex_cli_failed_closed"],
    },
    conversationId: "conv-1",
    pending,
    pendingMutationGuard: { expectedMessages: ["oi"] },
    pendingRetryCounter: retryCounter,
    maxRetries: 3,
    responseDelaySecondsForRetry: 5,
    resolveDelaySeconds: ({ retryCount, responseDelaySeconds }) => retryCount + responseDelaySeconds,
    resetPendingAIResponseForRetry: async (...args) => calls.push({ name: "reset", args }),
    updateConversation: async (...args) => calls.push({ name: "attention", args }),
    finalizePendingState: async (...args) => calls.push({ name: "finalize", args }),
  });

  assert.equal(failed?.status, "failed");
  assert.equal(failed?.failureReason, "codex_no_send_max_retries_4");
  assert.equal(retryCounter.has("conv-1"), false);
  assert.deepEqual(calls.map((call) => call.name), ["attention", "finalize"]);
  assert.equal((calls[0].args[1] as any).needsHumanAttention, true);
  assert.deepEqual(calls[1].args, [
    "failed",
    "codex_no_send_max_retries_4",
    "codex_no_send | codex_cli_failed_closed",
  ]);
});

test("storage SQL supports Codex no_send retry and failed attention state", () => {
  const storageSource = readFileSync("server/storage.ts", "utf8");

  const resetStart = storageSource.indexOf("async resetPendingAIResponseForRetry");
  assert.notEqual(resetStart, -1, "must find pending retry reset storage method");
  const resetEnd = storageSource.indexOf("async getFailedTransientTimers", resetStart);
  const resetBlock = storageSource.slice(resetStart, resetEnd);
  assert.match(resetBlock, /SET status = 'pending'/);
  assert.match(resetBlock, /execute_at = NOW\(\) \+ \(\$\{delaySec\} \|\| ' seconds'\)::interval/);
  assert.match(resetBlock, /retry_count = \$\{options\?\.resetRetryCount \? 0 : sql`COALESCE\(retry_count, 0\) \+ 1`\}/);
  assert.match(resetBlock, /last_error = \$\{options\?\.lastError \?\? null\}/);

  const failedStart = storageSource.indexOf("async markPendingAIResponseFailed");
  assert.notEqual(failedStart, -1, "must find pending failed storage method");
  const failedEnd = storageSource.indexOf("async markPendingAIResponseSkipped", failedStart);
  const failedBlock = storageSource.slice(failedStart, failedEnd);
  assert.match(failedBlock, /SET status = 'failed'/);
  assert.match(failedBlock, /failure_reason = \$\{reason\}/);
  assert.match(failedBlock, /last_error = \$\{lastError \|\| null\}/);
  assert.match(failedBlock, /last_attempt_at = NOW\(\)/);
});

test("deploy source archive policy can include working-tree runtime files", () => {
  const deploySource = readFileSync("scripts/deploy_safe_release.py", "utf8");

  assert.match(
    deploySource,
    /SOURCE_ARCHIVE_MODE = os\.getenv\("AGENTEZAP_DEPLOY_SOURCE_ARCHIVE_MODE", "working-tree"\)/,
    "deploy must default to working-tree archive in this mostly-untracked workspace",
  );
  assert.match(
    deploySource,
    /source_archive_mode = os\.getenv\("AGENTEZAP_DEPLOY_SOURCE_ARCHIVE_MODE", "working-tree"\)\.strip\(\)\.lower\(\)[\s\S]*?if source_archive_mode in \{"working-tree", "worktree", "workspace"\}:[\s\S]*?return/,
    "working-tree deploy must not re-exec the stale HEAD copy of this ignored deploy script",
  );
  assert.match(deploySource, /def required_source_archive_files\(\)/);
  assert.match(deploySource, /"server\/whatsapp\.ts"/);
  assert.match(deploySource, /"server\/codexNoSendRetry\.ts"/);
  assert.match(deploySource, /def create_working_tree_source_archive/);
  assert.match(deploySource, /def ensure_archive_contains_required_files/);
  assert.match(deploySource, /Use AGENTEZAP_DEPLOY_SOURCE_ARCHIVE_MODE=working-tree/);
  assert.match(deploySource, /source_mode=SOURCE_ARCHIVE_MODE/);
  assert.match(deploySource, /first\.startswith\("tmp-"\)/);
  assert.ok(deploySource.includes('rel.endswith((".tgz", ".tar.gz", ".zip", ".log"))'));
});
