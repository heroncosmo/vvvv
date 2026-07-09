import assert from "node:assert/strict";

import {
  buildGrupoOlxLeadRetryPayload,
  buildRetrySummary,
  isRetryableGrupoOlxSendError,
} from "../grupoOlxRetryService";

const now = new Date("2026-03-11T12:00:00.000Z");
const payload = buildGrupoOlxLeadRetryPayload(
  {
    source: "maton-email",
    extracted: {
      contactName: "Selma",
    },
  },
  "Ola Selma, recebi seu interesse e vou te passar os detalhes.",
  "WhatsApp not connected for this connection",
  "initial_send_error",
  now,
);

assert.equal(isRetryableGrupoOlxSendError("socket offline"), true);
assert.equal(isRetryableGrupoOlxSendError("template vazio"), false);

const retrySummary = buildRetrySummary(payload, new Date("2026-03-11T12:10:00.000Z"));
assert.ok(retrySummary);
assert.equal(retrySummary?.retryable, true);
assert.equal(retrySummary?.autoRetryAllowed, true);
assert.equal(retrySummary?.attempts, 0);
assert.match(String(retrySummary?.pendingMessage || ""), /Selma/);

const expiredSummary = buildRetrySummary(payload, new Date("2026-03-11T12:20:00.000Z"));
assert.ok(expiredSummary);
assert.equal(expiredSummary?.autoRetryAllowed, false);

console.log("grupoOlxRetryService.test.ts ok");
process.exit(0);
