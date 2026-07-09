import assert from "node:assert/strict";

import { isGrupoOlxMatonLeadSyncEligible } from "../grupoOlxLeadSyncEligibility";

const baseCandidate = {
  active: true,
  leadEmailSyncEnabled: true,
  matonApiKey: "maton-key",
  matonConnectionId: "gmail-box",
  connectionId: "whatsapp-connection",
};

assert.equal(
  isGrupoOlxMatonLeadSyncEligible({
    ...baseCandidate,
    googleAccessToken: "google-access",
    googleRefreshToken: "google-refresh",
  }),
  true,
  "direct Google tokens must not disable the Maton lead sync path used by the monolith",
);

assert.equal(
  isGrupoOlxMatonLeadSyncEligible({
    ...baseCandidate,
    matonConnectionId: null,
  }),
  false,
  "a selected Gmail mailbox is required",
);

assert.equal(
  isGrupoOlxMatonLeadSyncEligible({
    ...baseCandidate,
    active: false,
  }),
  false,
  "inactive integrations must not run",
);

console.log("grupoOlxLeadSyncScheduler.test.ts ok");
