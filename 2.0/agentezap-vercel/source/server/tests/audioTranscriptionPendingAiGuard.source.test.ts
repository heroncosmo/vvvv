import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("pending AI response waits for unresolved inbound audio transcription", () => {
  const source = readFileSync("server/whatsapp.ts", "utf8");
  const processStart = source.indexOf("async function processAccumulatedMessages");
  assert.notEqual(processStart, -1);

  const guardIndex = source.indexOf("retryPendingAudioTranscriptionsForConversation", processStart);
  const automationIndex = source.indexOf("const automationGuardDecision = await evaluateInboundAutomationGuard", processStart);
  assert.ok(guardIndex > processStart);
  assert.ok(automationIndex > guardIndex);

  const guardBlock = source.slice(guardIndex, automationIndex);
  assert.match(guardBlock, /isPendingAudioTranscriptionText/);
  assert.match(guardBlock, /resetPendingAIResponseForRetry/);
  assert.match(guardBlock, /audio_transcription_retry/);
  assert.match(guardBlock, /audio_transcription_unavailable/);
  assert.match(guardBlock, /needsHumanAttention/);
});
