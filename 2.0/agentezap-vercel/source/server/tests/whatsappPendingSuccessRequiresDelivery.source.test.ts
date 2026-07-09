import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/whatsapp.ts", "utf8");

test("pending AI timer success requires actual outbound delivery", () => {
  assert.match(
    source,
    /responseSuccessful = textSentToCustomer \|\| audioSent \|\| mediaActionsSent/,
    "timer must not be completed only because the LLM generated text or media actions",
  );
  assert.match(
    source,
    /no_outbound_delivered_after_ai_response/,
    "missing outbound delivery must leave an explicit retry reason",
  );
});

test("WhatsApp auto-reply does not use local semantic guards for public text", () => {
  assert.doesNotMatch(
    source,
    /evaluateUnverifiedAgenteZapSupportActionClaim|supportActionGuard|unverified_support_side_effect_claim/,
    "Codex live runtime must not use local text detectors as the decision authority",
  );
});
