import assert from "node:assert/strict";
import { proto } from "@whiskeysockets/baileys";

import {
  classifyRealtimeMessageUpdate,
  getIgnoredRealtimeIncomingReason,
  shouldProcessRealtimeWhatsappEvent,
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
  shouldProcessRealtimeWhatsappEvent({ source: "append", isAppendRecent: false, isCTWAResolved: false }),
  false,
);

assert.equal(
  shouldProcessRealtimeWhatsappEvent({ source: "history" }),
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
