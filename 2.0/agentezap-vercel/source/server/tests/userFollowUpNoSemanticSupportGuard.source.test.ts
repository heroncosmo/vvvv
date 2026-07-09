import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/userFollowUpService.ts", "utf8");

test("user follow-up does not use local semantic guards for public text", () => {
  assert.doesNotMatch(
    source,
    /evaluateUnverifiedAgenteZapSupportActionClaim|supportActionGuard|unverified_support_side_effect_claim/,
    "follow-up must not use local text detectors as the decision authority",
  );
});
