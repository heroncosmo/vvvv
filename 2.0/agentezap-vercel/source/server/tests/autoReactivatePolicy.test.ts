import assert from "node:assert/strict";
import {
  getManualAgentToggleAutoReactivateMinutes,
  getAutoReactivatePendingReplyStaleWindowMinutes,
  shouldSkipStaleAutoReactivateReply,
} from "../autoReactivatePolicy";

const now = new Date("2026-05-23T12:00:00.000Z");

assert.equal(
  getManualAgentToggleAutoReactivateMinutes(),
  null,
  "manual per-conversation toggle must never inherit the tenant auto-reactivation timer",
);

assert.equal(getAutoReactivatePendingReplyStaleWindowMinutes(30), 60);
assert.equal(getAutoReactivatePendingReplyStaleWindowMinutes(120), 240);
assert.equal(getAutoReactivatePendingReplyStaleWindowMinutes(null), 60);

assert.equal(
  shouldSkipStaleAutoReactivateReply({
    autoReactivateAfterMinutes: 30,
    conversationLastMessageAt: "2026-05-23T11:20:00.000Z",
    now,
  }),
  false,
  "recent pending customer message should still be answered",
);

assert.equal(
  shouldSkipStaleAutoReactivateReply({
    autoReactivateAfterMinutes: 30,
    conversationLastMessageAt: "2026-05-23T10:30:00.000Z",
    now,
  }),
  true,
  "old pending customer message should not be answered after auto reactivation",
);

assert.equal(
  shouldSkipStaleAutoReactivateReply({
    autoReactivateAfterMinutes: 120,
    conversationLastMessageAt: "2026-05-23T09:00:00.000Z",
    now,
  }),
  false,
  "longer tenant reactivation windows should preserve a larger pending-message window",
);

assert.equal(
  shouldSkipStaleAutoReactivateReply({
    autoReactivateAfterMinutes: 30,
    clientLastMessageAt: "2026-05-23T11:55:00.000Z",
    now,
  }),
  false,
  "client pending timestamp is used when conversation timestamp is unavailable",
);

console.log("autoReactivatePolicy.test passed");
