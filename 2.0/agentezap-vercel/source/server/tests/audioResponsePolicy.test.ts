import test from "node:test";
import assert from "node:assert/strict";

import { resolveAudioResponseDecision } from "../audioResponsePolicy";

test("novo modo envia texto e audio na primeira resposta do agente", () => {
  const result = resolveAudioResponseDecision({
    responseMode: "first_message_text_audio_then_mirror",
    firstAgentReplyInConversation: true,
    customerMessageWasAudio: false,
  });

  assert.equal(result.shouldSendText, true);
  assert.equal(result.shouldGenerateAudio, true);
  assert.equal(result.fallbackToTextIfAudioFails, false);
});

test("novo modo responde so com texto depois da primeira resposta quando cliente escreveu", () => {
  const result = resolveAudioResponseDecision({
    responseMode: "first_message_text_audio_then_mirror",
    firstAgentReplyInConversation: false,
    customerMessageWasAudio: false,
  });

  assert.equal(result.shouldSendText, true);
  assert.equal(result.shouldGenerateAudio, false);
  assert.equal(result.fallbackToTextIfAudioFails, false);
});

test("novo modo responde so com audio depois da primeira resposta quando cliente manda audio", () => {
  const result = resolveAudioResponseDecision({
    responseMode: "first_message_text_audio_then_mirror",
    firstAgentReplyInConversation: false,
    customerMessageWasAudio: true,
  });

  assert.equal(result.shouldSendText, false);
  assert.equal(result.shouldGenerateAudio, true);
  assert.equal(result.fallbackToTextIfAudioFails, true);
});

test("modo espelhado existente continua enviando texto para mensagem escrita", () => {
  const result = resolveAudioResponseDecision({
    responseMode: "audio_on_customer_audio",
    customerMessageWasAudio: false,
  });

  assert.equal(result.shouldSendText, true);
  assert.equal(result.shouldGenerateAudio, false);
  assert.equal(result.fallbackToTextIfAudioFails, false);
});
