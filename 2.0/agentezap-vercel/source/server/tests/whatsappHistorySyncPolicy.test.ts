import assert from "node:assert/strict";
import { proto } from "@whiskeysockets/baileys";

import {
  shouldAutoReplyRecoveredHistoryMessage,
  shouldPersistRecoveredHistoryMessage,
} from "../whatsappHistorySyncPolicy";

const RECENT = proto.HistorySync.HistorySyncType.RECENT;
const FULL = proto.HistorySync.HistorySyncType.FULL;

assert.equal(
  shouldPersistRecoveredHistoryMessage({
    syncType: RECENT,
    ageMs: 6 * 60 * 1000,
  }),
  true,
);

assert.equal(
  shouldAutoReplyRecoveredHistoryMessage({
    syncType: RECENT,
    ageMs: 6 * 60 * 1000,
  }),
  true,
);

assert.equal(
  shouldPersistRecoveredHistoryMessage({
    syncType: FULL,
    ageMs: 20 * 24 * 60 * 60 * 1000,
  }),
  true,
);

assert.equal(
  shouldPersistRecoveredHistoryMessage({
    syncType: FULL,
    ageMs: 31 * 24 * 60 * 60 * 1000,
  }),
  false,
);

assert.equal(
  shouldAutoReplyRecoveredHistoryMessage({
    syncType: FULL,
    ageMs: 30 * 60 * 1000,
  }),
  false,
);

assert.equal(
  shouldAutoReplyRecoveredHistoryMessage({
    syncType: null,
    ageMs: 30 * 60 * 1000,
  }),
  false,
);

console.log("whatsappHistorySyncPolicy.test.ts ok");
