import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isRodrigoOwnerCheckinRecipientEligible,
  resolveOwnerGlobalProactiveEngagementDecision,
} from "../ownerNotificationWorkspacePolicy";

describe("owner workspace Rodrigo engagement policy", () => {
  it("requires five inbound customer messages before a proactive owner send", () => {
    const blocked = resolveOwnerGlobalProactiveEngagementDecision({
      inboundMessagesSinceWatermark: 4,
      consumedInboundMessages: 0,
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remainingInboundMessages, 1);
    assert.equal(blocked.blockedReason, "inbound");

    const allowed = resolveOwnerGlobalProactiveEngagementDecision({
      inboundMessagesSinceWatermark: 5,
      consumedInboundMessages: 0,
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.remainingInboundMessages, 0);
  });

  it("consumes the global inbound bucket and respects the batch cooldown", () => {
    const allowedAfterOneConsumed = resolveOwnerGlobalProactiveEngagementDecision({
      inboundMessagesSinceWatermark: 11,
      consumedInboundMessages: 5,
      now: "2026-06-04T12:00:00.000Z",
    });
    assert.equal(allowedAfterOneConsumed.allowed, true);
    assert.equal(allowedAfterOneConsumed.availableInboundMessages, 6);

    const blockedByCooldown = resolveOwnerGlobalProactiveEngagementDecision({
      inboundMessagesSinceWatermark: 30,
      consumedInboundMessages: 25,
      nextSendAllowedAt: "2026-06-04T12:10:00.000Z",
      now: "2026-06-04T12:05:00.000Z",
    });
    assert.equal(blockedByCooldown.allowed, false);
    assert.equal(blockedByCooldown.blockedReason, "cooldown");
    assert.equal(blockedByCooldown.remainingInboundMessages, 0);
  });

  it("allows Rodrigo check-in only for active or recently covered paid users", () => {
    const now = new Date("2026-06-04T12:00:00.000Z");

    assert.equal(
      isRodrigoOwnerCheckinRecipientEligible(
        {
          has_subscription_history: true,
          subscription_status: "active",
          next_payment_date: "2026-07-01T00:00:00.000Z",
        },
        now,
      ),
      true,
    );

    assert.equal(
      isRodrigoOwnerCheckinRecipientEligible(
        {
          has_subscription_history: true,
          subscription_status: "expired",
          data_fim: "2026-05-20T00:00:00.000Z",
        },
        now,
      ),
      true,
    );

    assert.equal(
      isRodrigoOwnerCheckinRecipientEligible(
        {
          has_subscription_history: true,
          subscription_status: "expired",
          data_fim: "2026-04-01T00:00:00.000Z",
        },
        now,
      ),
      false,
    );

    assert.equal(
      isRodrigoOwnerCheckinRecipientEligible(
        {
          has_subscription_history: false,
          subscription_status: null,
          data_fim: null,
        },
        now,
      ),
      false,
    );
  });
});
