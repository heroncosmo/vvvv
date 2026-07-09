import assert from "node:assert/strict";
import { resolvePendingAIResponseRetryDelaySeconds } from "../pendingAiRetryPolicy";

assert.equal(
  resolvePendingAIResponseRetryDelaySeconds({ retryCount: 1, responseDelaySeconds: 3 }),
  5,
  "fast tenants should not wait 30s after the first transient response failure",
);

assert.equal(
  resolvePendingAIResponseRetryDelaySeconds({ retryCount: 2, responseDelaySeconds: 3 }),
  10,
  "fast tenants should recover from a second transient response failure quickly",
);

assert.equal(
  resolvePendingAIResponseRetryDelaySeconds({ retryCount: 4, responseDelaySeconds: 3 }),
  30,
  "fast tenant retry backoff remains capped",
);

assert.equal(
  resolvePendingAIResponseRetryDelaySeconds({ retryCount: 1, responseDelaySeconds: 8 }),
  10,
  "moderate response delays use a moderate retry base",
);

assert.equal(
  resolvePendingAIResponseRetryDelaySeconds({ retryCount: 2, responseDelaySeconds: 30 }),
  60,
  "default response delays preserve the existing broad backoff behavior",
);

assert.equal(
  resolvePendingAIResponseRetryDelaySeconds({ retryCount: 3, responseDelaySeconds: 3, connectionClosed: true }),
  20,
  "connection closed retry behavior stays on the existing quick socket backoff",
);

console.log("pendingAiRetryPolicy.test passed");
