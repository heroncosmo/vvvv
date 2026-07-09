import test from "node:test";
import assert from "node:assert/strict";

import { resolveAutomatedSendOrigin } from "../automatedSendOrigin";

test("mantem follow-up do usuario fora da pausa automatica", () => {
  assert.equal(resolveAutomatedSendOrigin("followup"), "user_follow_up");
  assert.equal(resolveAutomatedSendOrigin("userFollowUpService"), "user_follow_up");
  assert.equal(resolveAutomatedSendOrigin("user_follow_up"), "user_follow_up");
});

test("origens restantes continuam como ai_agent", () => {
  assert.equal(resolveAutomatedSendOrigin("agent"), "ai_agent");
  assert.equal(resolveAutomatedSendOrigin("whatsapp.ts"), "ai_agent");
  assert.equal(resolveAutomatedSendOrigin(undefined), "ai_agent");
});
