import assert from "node:assert/strict";
import {
  isConfirmedOutgoingMessageStatus,
  isUnconfirmedOutgoingMessageStatus,
  shouldRecoverCompletedTimer,
} from "../pendingAiDeliveryState";

assert.equal(isConfirmedOutgoingMessageStatus("queued"), false);
assert.equal(isConfirmedOutgoingMessageStatus("pending_delivery"), false);
assert.equal(isConfirmedOutgoingMessageStatus("failed"), false);
assert.equal(isConfirmedOutgoingMessageStatus("sent"), true);
assert.equal(isConfirmedOutgoingMessageStatus("delivered"), true);
assert.equal(isConfirmedOutgoingMessageStatus("read"), true);
assert.equal(isConfirmedOutgoingMessageStatus(null), true);
assert.equal(isConfirmedOutgoingMessageStatus(" Queued "), false);
assert.equal(isUnconfirmedOutgoingMessageStatus("queued"), true);
assert.equal(isUnconfirmedOutgoingMessageStatus("pending_delivery"), true);
assert.equal(isUnconfirmedOutgoingMessageStatus("failed"), true);
assert.equal(isUnconfirmedOutgoingMessageStatus("sent"), false);
assert.equal(isUnconfirmedOutgoingMessageStatus(null), false);

const now = new Date("2026-03-14T18:00:00.000Z");

assert.equal(
  shouldRecoverCompletedTimer({
    now,
    lastCustomerAt: new Date("2026-03-14T17:55:00.000Z"),
    lastAgentAt: new Date("2026-03-14T17:50:00.000Z"),
  }),
  true,
);

assert.equal(
  shouldRecoverCompletedTimer({
    now,
    lastCustomerAt: new Date("2026-03-14T17:55:00.000Z"),
    lastAgentAt: new Date("2026-03-14T17:58:00.000Z"),
  }),
  false,
);

assert.equal(
  shouldRecoverCompletedTimer({
    now,
    lastCustomerAt: new Date("2026-03-13T16:59:59.000Z"),
  }),
  false,
);

assert.equal(
  shouldRecoverCompletedTimer({
    now,
    lastCustomerAt: new Date("2026-03-14T17:55:00.000Z"),
  }),
  true,
);

assert.equal(
  shouldRecoverCompletedTimer({
    now,
    lastCustomerAt: new Date("2026-03-14T17:55:00.000Z"),
    lastOwnerAt: new Date("2026-03-14T17:56:00.000Z"),
  }),
  false,
);

console.log("pendingAiDeliveryState.test.ts ok");
