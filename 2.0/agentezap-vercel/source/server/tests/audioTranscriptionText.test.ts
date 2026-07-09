import test from "node:test";
import assert from "node:assert/strict";

import {
  formatAudioMessageTextWithTranscription,
  isPendingAudioTranscriptionText,
} from "../audioTranscriptionText";

test("detects pending audio placeholders used by direct and group messages", () => {
  assert.equal(isPendingAudioTranscriptionText("*Audio*"), true);
  assert.equal(isPendingAudioTranscriptionText("[Audio enviado]"), true);
  assert.equal(isPendingAudioTranscriptionText("(audio enviado pelo cliente)"), true);
  assert.equal(isPendingAudioTranscriptionText("*Rodrigo Cooperador*: *Audio*"), true);
  assert.equal(isPendingAudioTranscriptionText("*Rodrigo Cooperador*: [Audio enviado]"), true);

  assert.equal(isPendingAudioTranscriptionText("Quero deixar o agente mais vendedor."), false);
  assert.equal(isPendingAudioTranscriptionText("*Rodrigo Cooperador*: Se tiver bastante coisa ai?"), false);
});

test("keeps group speaker prefix when replacing audio placeholder with transcription", () => {
  assert.equal(
    formatAudioMessageTextWithTranscription(
      "*Rodrigo Cooperador*: *Audio*",
      "Se tiver bastante coisa ai?",
    ),
    "*Rodrigo Cooperador*: Se tiver bastante coisa ai?",
  );

  assert.equal(
    formatAudioMessageTextWithTranscription("*Audio*", "Preciso de ajuda."),
    "Preciso de ajuda.",
  );
});
