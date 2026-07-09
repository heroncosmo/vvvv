import test from "node:test";
import { strict as assert } from "node:assert";

import { normalizeUserFollowUpAiDecisionPayload } from "../userFollowUpAiDecisionSchema";

test("aceita decisao estruturada valida de follow-up", () => {
  const result = normalizeUserFollowUpAiDecisionPayload({
    action: "send",
    reason: "cliente demonstrou interesse",
    message: "Ficou alguma duvida sobre o que te mandei?",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.decision.action, "send");
    assert.equal(result.decision.message, "Ficou alguma duvida sobre o que te mandei?");
  }
});

test("rejeita action fora do contrato do follow-up", () => {
  const result = normalizeUserFollowUpAiDecisionPayload({
    action: "continue",
    reason: "fora do schema",
    message: "texto",
  });

  assert.equal(result.ok, false);
});
