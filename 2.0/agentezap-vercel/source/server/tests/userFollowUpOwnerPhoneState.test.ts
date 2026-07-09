import assert from "node:assert/strict";

import {
  canBackfillOwnerPhoneFromLinkedConnection,
  normalizeFollowUpOwnerPhone,
} from "../userFollowUpOwnerPhoneState";

assert.equal(normalizeFollowUpOwnerPhone("+55 (17) 99114-0696"), "5517991140696");

assert.deepEqual(
  canBackfillOwnerPhoneFromLinkedConnection({
    ownerPhone: null,
    connectionPhone: "55 17 99114-0696",
    contactNumber: "55 17 99195-6944",
    remoteJid: "5517991956944@s.whatsapp.net",
    jidSuffix: "s.whatsapp.net",
    isConnectionAvailable: true,
  }),
  { ok: true, phone: "5517991140696", reason: "linked_connection" },
);

assert.equal(
  canBackfillOwnerPhoneFromLinkedConnection({
    ownerPhone: null,
    connectionPhone: "5517991140696",
    contactNumber: "5517991140696",
    remoteJid: "5517991140696@s.whatsapp.net",
    jidSuffix: "s.whatsapp.net",
    isConnectionAvailable: true,
  }).reason,
  "self_conversation",
);

assert.equal(
  canBackfillOwnerPhoneFromLinkedConnection({
    ownerPhone: null,
    connectionPhone: "5517991140696",
    contactNumber: "1203631234567890",
    remoteJid: "1203631234567890@g.us",
    jidSuffix: "g.us",
    isConnectionAvailable: true,
  }).reason,
  "group_conversation",
);

assert.equal(
  canBackfillOwnerPhoneFromLinkedConnection({
    ownerPhone: null,
    connectionPhone: "5517991140696",
    contactNumber: "1203631234567890",
    remoteJid: "1203631234567890@s.whatsapp.net",
    jidSuffix: "s.whatsapp.net",
    isConnectionAvailable: true,
  }).reason,
  "group_conversation",
);

assert.equal(
  canBackfillOwnerPhoneFromLinkedConnection({
    ownerPhone: null,
    connectionPhone: "5517991140696",
    liveGatewayPhone: "5517991956944",
    contactNumber: "5517991956944",
    remoteJid: "5517991956944@s.whatsapp.net",
    jidSuffix: "s.whatsapp.net",
    isConnectionAvailable: true,
  }).reason,
  "live_gateway_phone_mismatch",
);

assert.equal(
  canBackfillOwnerPhoneFromLinkedConnection({
    ownerPhone: null,
    connectionPhone: "5517991140696",
    contactNumber: "5517991956944",
    remoteJid: "5517991956944@s.whatsapp.net",
    jidSuffix: "s.whatsapp.net",
    isConnectionAvailable: false,
  }).reason,
  "connection_unavailable",
);

assert.equal(
  canBackfillOwnerPhoneFromLinkedConnection({
    ownerPhone: "5517990000000",
    connectionPhone: "5517991140696",
    contactNumber: "5517991956944",
    remoteJid: "5517991956944@s.whatsapp.net",
    jidSuffix: "s.whatsapp.net",
    isConnectionAvailable: true,
  }).reason,
  "owner_already_set",
);

console.log("userFollowUpOwnerPhoneState.test.ts ok");
