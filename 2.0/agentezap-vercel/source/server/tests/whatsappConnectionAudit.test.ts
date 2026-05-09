import assert from "node:assert/strict";

import { mergeConnectionAuditEvent } from "../whatsappConnectionAudit";

const base = mergeConnectionAuditEvent(null, {
  kind: "force_reset",
  at: "2026-04-10T00:00:00.000Z",
  source: "user_panel_connection_reset",
  details: {
    connectionId: "conn-1",
  },
});

assert.equal(
  (base.runtimeDiagnostics as any)?.lastForceReset?.source,
  "user_panel_connection_reset",
);
assert.equal(
  ((base.runtimeDiagnostics as any)?.recentEvents || []).length,
  1,
);

const second = mergeConnectionAuditEvent(base, {
  kind: "logout",
  at: "2026-04-10T00:01:00.000Z",
  source: "baileys_logged_out",
  details: {
    connectionId: "conn-1",
    autoRetryScheduled: false,
  },
});

assert.equal(
  (second.runtimeDiagnostics as any)?.lastLogout?.source,
  "baileys_logged_out",
);
assert.equal(
  ((second.runtimeDiagnostics as any)?.recentEvents || []).length,
  2,
);

console.log("whatsappConnectionAudit.test.ts ok");
