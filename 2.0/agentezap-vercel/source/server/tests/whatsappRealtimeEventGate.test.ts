import assert from "node:assert/strict";
import { proto } from "@whiskeysockets/baileys";

import {
  classifyRealtimeMessageUpdate,
  getIgnoredRealtimeIncomingReason,
  isRecoverableRealtimeAppendMessage,
  isRecoverableRealtimePlaceholder,
  shouldProcessRealtimeWhatsappEvent,
  shouldReplayRealtimeChatUpdateMessage,
  shouldRequestRealtimeChatHistorySync,
} from "../whatsappRealtimeEventGate";

assert.equal(
  shouldProcessRealtimeWhatsappEvent({ source: "notify" }),
  true,
);

assert.equal(
  shouldProcessRealtimeWhatsappEvent({ source: "append", isAppendRecent: true }),
  true,
);

assert.equal(
  shouldProcessRealtimeWhatsappEvent({ source: "append", isCTWAResolved: true }),
  true,
);

assert.equal(
  shouldProcessRealtimeWhatsappEvent({ source: "append", isRecoverablePlaceholder: true }),
  true,
);

assert.equal(
  shouldProcessRealtimeWhatsappEvent({ source: "append", isRecoverableAppendMessage: true }),
  true,
);

assert.equal(
  shouldProcessRealtimeWhatsappEvent({ source: "append", isAppendRecent: false, isCTWAResolved: false }),
  false,
);

assert.equal(
  shouldProcessRealtimeWhatsappEvent({ source: "history" }),
  false,
);

assert.equal(
  isRecoverableRealtimePlaceholder({
    source: "append",
    remoteJid: "5511965440594@s.whatsapp.net",
    fromMe: false,
    messageId: "lead-placeholder",
    hasMeaningfulContent: false,
  }),
  true,
);

assert.equal(
  isRecoverableRealtimePlaceholder({
    source: "append",
    remoteJid: "120363000000000000@g.us",
    fromMe: false,
    messageId: "group-placeholder",
    hasMeaningfulContent: false,
  }),
  false,
);

assert.equal(
  isRecoverableRealtimePlaceholder({
    source: "append",
    remoteJid: "5511965440594@s.whatsapp.net",
    fromMe: false,
    messageId: "normal-message",
    hasMeaningfulContent: true,
  }),
  false,
);

assert.equal(
  isRecoverableRealtimeAppendMessage({
    source: "append",
    remoteJid: "5511965440594@s.whatsapp.net",
    messageId: "offline-text",
    hasMeaningfulContent: true,
    hasValidTimestamp: true,
    ageMs: 4 * 60 * 60 * 1000,
    maxAgeMs: 72 * 60 * 60 * 1000,
  }),
  true,
);

assert.equal(
  isRecoverableRealtimeAppendMessage({
    source: "append",
    remoteJid: "5511965440594@s.whatsapp.net",
    messageId: "too-old-text",
    hasMeaningfulContent: true,
    hasValidTimestamp: true,
    ageMs: 73 * 60 * 60 * 1000,
    maxAgeMs: 72 * 60 * 60 * 1000,
  }),
  false,
);

assert.equal(
  isRecoverableRealtimeAppendMessage({
    source: "append",
    remoteJid: "120363000000000000@g.us",
    messageId: "group-text",
    hasMeaningfulContent: true,
    hasValidTimestamp: true,
    ageMs: 5 * 60 * 1000,
  }),
  false,
);

assert.equal(
  isRecoverableRealtimeAppendMessage({
    source: "append",
    remoteJid: "5511965440594@s.whatsapp.net",
    messageId: "placeholder",
    hasMeaningfulContent: false,
    hasValidTimestamp: true,
    ageMs: 5 * 60 * 1000,
  }),
  false,
);

assert.equal(
  shouldReplayRealtimeChatUpdateMessage({
    remoteJid: "5511965440594@s.whatsapp.net",
    fromMe: false,
    messageId: "chat-update-msg",
    isRecent: true,
    hasValidTimestamp: true,
  }),
  true,
);

assert.equal(
  shouldReplayRealtimeChatUpdateMessage({
    remoteJid: "120363000000000000@g.us",
    fromMe: false,
    messageId: "group-chat-update-msg",
    isRecent: true,
    hasValidTimestamp: true,
  }),
  false,
);

assert.equal(
  shouldReplayRealtimeChatUpdateMessage({
    remoteJid: "5511965440594@s.whatsapp.net",
    fromMe: false,
    messageId: "old-chat-update-msg",
    isRecent: false,
    hasValidTimestamp: true,
  }),
  false,
);

assert.equal(
  shouldReplayRealtimeChatUpdateMessage({
    remoteJid: "5511965440594@s.whatsapp.net",
    fromMe: false,
    messageId: "recoverable-chat-update-msg",
    isRecent: false,
    isRecoverableHistoryWindow: true,
    hasValidTimestamp: true,
  }),
  true,
);

assert.equal(
  shouldReplayRealtimeChatUpdateMessage({
    remoteJid: "5511965440594@s.whatsapp.net",
    fromMe: true,
    messageId: "outgoing-chat-update-msg",
    isRecent: true,
    hasValidTimestamp: true,
  }),
  false,
);

assert.equal(
  shouldRequestRealtimeChatHistorySync({
    remoteJid: "5511965440594@s.whatsapp.net",
    unreadCount: 1,
    isRecent: true,
    hasValidTimestamp: true,
  }),
  true,
);

assert.equal(
  shouldRequestRealtimeChatHistorySync({
    remoteJid: "5511965440594@s.whatsapp.net",
    unreadCount: 0,
    isRecent: true,
    hasValidTimestamp: true,
  }),
  false,
);

assert.equal(
  shouldRequestRealtimeChatHistorySync({
    remoteJid: "5511965440594@s.whatsapp.net",
    unreadCount: 2,
    isRecent: false,
    isRecoverableHistoryWindow: true,
    hasValidTimestamp: true,
  }),
  true,
);

assert.equal(
  shouldRequestRealtimeChatHistorySync({
    remoteJid: "5511965440594@s.whatsapp.net",
    unreadCount: 2,
    isRecent: false,
    isRecoverableHistoryWindow: false,
    hasValidTimestamp: true,
  }),
  false,
);

assert.equal(
  getIgnoredRealtimeIncomingReason({
    message: {
      reactionMessage: {
        key: {
          remoteJid: "5511999999999@s.whatsapp.net",
          fromMe: false,
          id: "reaction-target",
        },
      },
    } as any,
    messageStubType: null as any,
  }),
  "reaction",
);

assert.equal(
  getIgnoredRealtimeIncomingReason({
    message: {
      protocolMessage: {
        type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
      },
    } as any,
    messageStubType: null as any,
  }),
  `protocol:${Number(proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING)}`,
);

assert.deepEqual(
  classifyRealtimeMessageUpdate({
    key: { id: "edit-target" } as any,
    update: {
      message: {
        editedMessage: {
          message: {
            conversation: "texto editado",
          },
        },
      },
    },
  }),
  {
    action: "edit",
    reason: "edited_message",
    targetMessageId: "edit-target",
    normalizedMessage: {
      conversation: "texto editado",
    },
  },
);

assert.deepEqual(
  classifyRealtimeMessageUpdate({
    key: { id: "revoked-target" } as any,
    update: {
      message: null,
      messageStubType: proto.WebMessageInfo.StubType.REVOKE,
    },
  }),
  {
    action: "revoke",
    reason: "revoke_stub",
    targetMessageId: "revoked-target",
  },
);

assert.equal(
  classifyRealtimeMessageUpdate({
    key: { id: "retry-target" } as any,
    update: {
      message: {
        extendedTextMessage: {
          text: "mensagem descriptografada",
        },
      },
    },
  }).action,
  "reemit",
);

console.log("whatsappRealtimeEventGate.test.ts ok");
