import test from "node:test";
import { strict as assert } from "node:assert";

import {
  isWebOnlyFollowupClientReplyResetReason,
  resolveWebOnlyFollowupTargetStage,
} from "../webOnlyFollowupStagePolicy";

const CLIENT_LAST_REASON = "Cliente foi o ultimo a falar - aguardar resposta da empresa antes de follow-up.";
const CLIENT_LAST_REASON_ACCENTED = "Cliente foi o \u00faltimo a falar - aguardar resposta da empresa antes de follow-up";
const LEGACY_CLIENT_REPLY_REASON = "Cliente respondeu - aguardando resposta da empresa";

test("volta para stage 0 quando cliente respondeu e a conversa foi resetada", () => {
  assert.equal(
    resolveWebOnlyFollowupTargetStage({
      currentStage: 0,
      maxSentStage: 3,
      disabledReason: CLIENT_LAST_REASON,
      resetReasons: [CLIENT_LAST_REASON],
    }),
    0,
  );
});

test("reconhece motivo acentuado ou legado como reset por resposta do cliente", () => {
  assert.equal(isWebOnlyFollowupClientReplyResetReason(CLIENT_LAST_REASON), true);
  assert.equal(isWebOnlyFollowupClientReplyResetReason(CLIENT_LAST_REASON_ACCENTED), true);
  assert.equal(isWebOnlyFollowupClientReplyResetReason(LEGACY_CLIENT_REPLY_REASON), true);
  assert.equal(
    resolveWebOnlyFollowupTargetStage({
      currentStage: 0,
      maxSentStage: 5,
      disabledReason: CLIENT_LAST_REASON_ACCENTED,
      resetReasons: [CLIENT_LAST_REASON],
    }),
    0,
  );
});

test("preserva avanco antigo quando nao ha reset por resposta do cliente", () => {
  assert.equal(
    resolveWebOnlyFollowupTargetStage({
      currentStage: 0,
      maxSentStage: 3,
      disabledReason: null,
      resetReasons: [CLIENT_LAST_REASON],
    }),
    4,
  );
});

test("usa stage atual quando ainda nao ha follow-up enviado", () => {
  assert.equal(
    resolveWebOnlyFollowupTargetStage({
      currentStage: 2,
      maxSentStage: -1,
      disabledReason: null,
      resetReasons: [CLIENT_LAST_REASON],
    }),
    2,
  );
});
