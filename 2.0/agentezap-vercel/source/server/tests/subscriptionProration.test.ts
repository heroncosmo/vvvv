import assert from "node:assert/strict";

import {
  getSubscriptionProrationPaidAmount,
  getUpgradeProrationQuote,
} from "../../shared/subscriptionProration";

const now = new Date("2026-05-23T12:00:00.000Z");

const currentSubscription = {
  status: "active",
  dataFim: "2026-06-19T12:00:00.000Z",
  couponPrice: null,
  metadata: {
    checkoutAmountAfterCoupon: "49.99",
  },
  plan: {
    valor: "199.99",
  },
};

const paidAmount = getSubscriptionProrationPaidAmount(currentSubscription);
assert.equal(paidAmount, 49.99);

const quote = getUpgradeProrationQuote(currentSubscription, 99.99, now);
assert.ok(quote?.applied);
assert.equal(quote?.currentPaidAmount, 49.99);
assert.equal(quote?.remainingDays, 27);
assert.equal(quote?.creditAmount, 44.99);
assert.equal(quote?.payableAmount, 55);

const currentFromProratedUpgrade = {
  status: "active",
  nextPaymentDate: "2026-06-22T12:00:00.000Z",
  metadata: {
    checkoutRecurringAmount: "99.99",
    checkoutAmountAfterCoupon: "55.00",
  },
  plan: {
    valor: "299.99",
  },
};

assert.equal(getSubscriptionProrationPaidAmount(currentFromProratedUpgrade), 99.99);

assert.equal(getUpgradeProrationQuote({ ...currentSubscription, status: "pending_pix" }, 99.99, now), null);
assert.equal(getUpgradeProrationQuote(currentSubscription, 49.99, now), null);

console.log("subscriptionProration tests passed");
