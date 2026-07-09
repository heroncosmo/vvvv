import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("storage audio transcription uses the cost-optimized STT orchestrator before failing pending audio", () => {
  const source = readFileSync("server/storage.ts", "utf8");
  const functionStart = source.indexOf("async function resolveAudioTranscriptionForMessage");
  assert.notEqual(functionStart, -1);

  const functionEnd = source.indexOf("type PendingAudioTranscriptionRetryResult", functionStart);
  assert.ok(functionEnd > functionStart);

  const block = source.slice(functionStart, functionEnd);
  const orchestratorIndex = block.indexOf("transcribeAudioCostOptimized");
  const failureIndex = block.indexOf("Transcricao de audio retornou vazia");

  assert.ok(orchestratorIndex > 0);
  assert.ok(failureIndex > orchestratorIndex);
  assert.match(block, /mimeType: params\.mediaMimeType \|\| "audio\/ogg"/);
  assert.match(block, /throwOnFailure: true/);
  assert.doesNotMatch(block, /localWhisperPrompt/);
  assert.doesNotMatch(block, /reviewAudioTranscriptionWithContext/);
  assert.doesNotMatch(block, /loadAudioTranscriptionTenantContext/);
  assert.doesNotMatch(block, /loadAudioTranscriptionConversationContext/);
  assert.doesNotMatch(source, /function buildAudioTranscriptionWhisperPrompt/);
  assert.doesNotMatch(source, /Transcrever literalmente; usar contexto apenas como vocabulario/);
});

test("storage pending audio retry preserves media context for fallback transcription", () => {
  const source = readFileSync("server/storage.ts", "utf8");
  const retryStart = source.indexOf("async retryPendingAudioTranscriptionsForConversation");
  assert.notEqual(retryStart, -1);

  const retryEnd = source.indexOf("async getMessageByMessageId", retryStart);
  assert.ok(retryEnd > retryStart);

  const block = source.slice(retryStart, retryEnd);
  assert.match(block, /mediaMimeType: pendingMessage\.mediaMimeType/);
  assert.match(block, /mediaDuration: pendingMessage\.mediaDuration/);
  assert.match(block, /fromMe: pendingMessage\.fromMe/);
  assert.match(block, /messageTimestamp: pendingMessage\.timestamp/);
});

test("web-only agent media audio transcription uses the shared STT orchestrator", () => {
  const source = readFileSync("api/http.ts", "utf8");
  const functionStart = source.indexOf("async function transcribeAgentAudio");
  assert.notEqual(functionStart, -1);

  const functionEnd = source.indexOf("async function handleAgentMedia", functionStart);
  assert.ok(functionEnd > functionStart);

  const block = source.slice(functionStart, functionEnd);
  assert.match(source.slice(0, functionStart), /transcribeAudioCostOptimized/);
  assert.match(block, /transcribeAudioCostOptimized\(bytes/);
  assert.doesNotMatch(block, /api\.mistral\.ai\/v1\/audio\/transcriptions/);
  assert.doesNotMatch(block, /getWebOnlyMistralKeys/);
});

test("media cleanup transcribes pending audio through the shared STT orchestrator", () => {
  const source = readFileSync("server/mediaCleanupService.ts", "utf8");
  const functionStart = source.indexOf("async function transcribePendingAudios");
  assert.notEqual(functionStart, -1);

  const functionEnd = source.indexOf("export async function forceMediaCleanup", functionStart);
  assert.ok(functionEnd > functionStart);

  const block = source.slice(functionStart, functionEnd);
  assert.match(source.slice(0, functionStart), /transcribeAudioCostOptimized/);
  assert.match(block, /transcribeAudioCostOptimized\(audioBuffer/);
  assert.match(block, /userId: audio\.userId/);
  assert.match(block, /language: "pt"/);
  assert.doesNotMatch(source, /transcribeAudioWithMistral/);
  assert.doesNotMatch(block, /api\.mistral\.ai\/v1\/audio\/transcriptions/);
});
