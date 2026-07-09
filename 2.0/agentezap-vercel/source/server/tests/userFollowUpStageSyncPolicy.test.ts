import assert from "node:assert/strict";

import {
  resolveStageAfterSentLogSync,
  shouldPreserveStageAfterCompanyReply,
} from "../userFollowUpStageSyncPolicy";

assert.equal(
  shouldPreserveStageAfterCompanyReply({
    maxSentAt: "2026-06-03T23:17:55.000Z",
    latestClientAfterSentAt: "2026-06-03T23:21:34.000Z",
    latestCompanyAfterClientAt: "2026-06-03T23:28:57.000Z",
  }),
  true,
);

assert.equal(
  resolveStageAfterSentLogSync({
    currentStage: 0,
    maxSentStage: 0,
    maxSentAt: "2026-06-03T23:17:55.000Z",
    latestClientAfterSentAt: "2026-06-03T23:21:34.000Z",
    latestCompanyAfterClientAt: "2026-06-03T23:28:57.000Z",
  }),
  0,
);

assert.equal(
  resolveStageAfterSentLogSync({
    currentStage: 0,
    maxSentStage: 0,
    maxSentAt: "2026-06-03T23:17:55.000Z",
    latestClientAfterSentAt: null,
    latestCompanyAfterClientAt: null,
  }),
  1,
);

assert.equal(
  resolveStageAfterSentLogSync({
    currentStage: 2,
    maxSentStage: null,
    maxSentAt: null,
    latestClientAfterSentAt: null,
    latestCompanyAfterClientAt: null,
  }),
  2,
);

assert.equal(
  shouldPreserveStageAfterCompanyReply({
    maxSentAt: "2026-06-03T23:40:00.000Z",
    latestClientAfterSentAt: "2026-06-03T23:21:34.000Z",
    latestCompanyAfterClientAt: "2026-06-03T23:28:57.000Z",
  }),
  false,
);

console.log("userFollowUpStageSyncPolicy.test.ts ok");
