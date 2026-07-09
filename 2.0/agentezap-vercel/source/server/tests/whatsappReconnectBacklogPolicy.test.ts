import assert from "node:assert/strict";

import {
  getQrReconnectCutoffMs,
  getQrReconnectCutoffMsFromSessionData,
  getUnansweredInboundTextsAtOrAfterQrReconnectCutoff,
  mergeAiManualReenabledCutoffSessionData,
  parseTimestampMs,
  shouldSuppressAutoReplyForQrReconnectBacklog,
} from "../whatsappReconnectBacklogPolicy";

const qrIssuedAt = "2026-05-27T20:36:50.040Z";
const openedAt = "2026-05-27T20:37:18.000Z";

const qrOnlySessionData = {
  runtimeDiagnostics: {
    lastQrCode: {
      at: qrIssuedAt,
      source: "baileys_qr",
    },
  },
};

assert.equal(
  getQrReconnectCutoffMsFromSessionData(qrOnlySessionData),
  Date.parse(qrIssuedAt),
  "QR issued time is a conservative cutoff when explicit reconnect cutoff is missing",
);

assert.equal(
  shouldSuppressAutoReplyForQrReconnectBacklog(
    { sessionData: qrOnlySessionData },
    new Date("2026-05-27T01:26:33.000Z"),
  ),
  true,
  "old imported WhatsApp messages before QR must not auto-reply",
);

assert.equal(
  shouldSuppressAutoReplyForQrReconnectBacklog(
    { sessionData: qrOnlySessionData },
    new Date("2026-05-27T20:37:10.000Z"),
  ),
  false,
  "live messages after QR remain eligible for auto-reply",
);

assert.equal(
  getQrReconnectCutoffMsFromSessionData({
    runtimeDiagnostics: {
      lastQrCode: { at: qrIssuedAt },
      lastQrReconnectCutoff: { at: openedAt },
    },
  }),
  Date.parse(openedAt),
  "explicit reconnect cutoff wins over QR-issued fallback",
);

const aiReenabledAt = "2026-06-03T18:45:00.000Z";
const aiReenabledSessionData = mergeAiManualReenabledCutoffSessionData(
  { runtimeDiagnostics: { lastQrCode: { at: qrIssuedAt } } },
  {
    at: aiReenabledAt,
    source: "connection_ai_toggle",
    details: { connectionId: "connection-1" },
  },
);

assert.equal(
  getQrReconnectCutoffMsFromSessionData(aiReenabledSessionData),
  Date.parse(aiReenabledAt),
  "manual AI re-enable cutoff is part of the same auto-reply backlog boundary",
);

assert.equal(
  shouldSuppressAutoReplyForQrReconnectBacklog(
    { sessionData: aiReenabledSessionData },
    new Date("2026-06-03T18:07:00.000Z"),
  ),
  true,
  "messages older than the AI re-enable cutoff must not be auto-replied",
);

assert.equal(
  shouldSuppressAutoReplyForQrReconnectBacklog(
    { sessionData: aiReenabledSessionData },
    new Date("2026-06-03T18:46:00.000Z"),
  ),
  false,
  "messages after the AI re-enable cutoff remain eligible",
);

assert.deepEqual(
  getUnansweredInboundTextsAtOrAfterQrReconnectCutoff(
    [
      { fromMe: false, text: "old backlog", timestamp: "2026-06-03T18:07:00.000Z" },
      { fromMe: false, text: "new live message", timestamp: "2026-06-03T18:46:00.000Z" },
    ],
    Date.parse(aiReenabledAt),
  ),
  ["new live message"],
  "pending AI should keep only unanswered inbound text after AI re-enable",
);

assert.equal(
  getQrReconnectCutoffMs(
    null,
    { qrIssuedAt: Date.parse(qrIssuedAt), connectedAt: Date.parse(openedAt) },
  ),
  Date.parse(openedAt),
  "in-memory open time is used when no persisted session data exists",
);

assert.deepEqual(
  getUnansweredInboundTextsAtOrAfterQrReconnectCutoff(
    [
      { fromMe: false, text: "old imported", timestamp: "2026-05-27T01:26:33.000Z" },
      { fromMe: false, text: "after qr", timestamp: "2026-05-27T20:37:10.000Z" },
    ],
    Date.parse(qrIssuedAt),
  ),
  ["after qr"],
  "pending AI should keep only unanswered inbound text at or after cutoff",
);

assert.equal(parseTimestampMs(1_779_918_000), 1_779_918_000_000);
assert.equal(parseTimestampMs(1_779_918_000_000), 1_779_918_000_000);

console.log("whatsappReconnectBacklogPolicy.test.ts ok");
