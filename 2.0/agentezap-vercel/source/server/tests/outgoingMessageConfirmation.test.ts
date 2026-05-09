import assert from "node:assert/strict";

import {
  clearPendingOutgoingMessageConfirmations,
  consumePendingOutgoingMessageConfirmation,
  rememberOutgoingMessageConfirmation,
} from "../outgoingMessageConfirmation";

clearPendingOutgoingMessageConfirmations();

const confirmedAt = new Date("2026-03-18T22:07:35.589Z");
rememberOutgoingMessageConfirmation("msg-1", confirmedAt);

assert.equal(
  consumePendingOutgoingMessageConfirmation("msg-1")?.toISOString(),
  confirmedAt.toISOString(),
);

assert.equal(consumePendingOutgoingMessageConfirmation("msg-1"), null);
assert.equal(consumePendingOutgoingMessageConfirmation("missing"), null);

clearPendingOutgoingMessageConfirmations();

console.log("outgoingMessageConfirmation.test.ts ok");
