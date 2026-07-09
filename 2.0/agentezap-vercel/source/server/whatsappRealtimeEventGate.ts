import { normalizeMessageContent, proto, type WAMessage } from "@whiskeysockets/baileys";

const IGNORED_PROTOCOL_TYPES = new Set<number>([
  Number(proto.Message.ProtocolMessage.Type.REVOKE),
  Number(proto.Message.ProtocolMessage.Type.MESSAGE_EDIT),
  Number(proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING),
  Number(proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE),
  Number(proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION),
  Number(proto.Message.ProtocolMessage.Type.APP_STATE_SYNC_KEY_SHARE),
  Number(proto.Message.ProtocolMessage.Type.LID_MIGRATION_MAPPING_SYNC),
  Number(proto.Message.ProtocolMessage.Type.GROUP_MEMBER_LABEL_CHANGE),
]);

const IGNORED_STUB_TYPES = new Set<number>([
  Number(proto.WebMessageInfo.StubType.CHANGE_EPHEMERAL_SETTING),
  Number(proto.WebMessageInfo.StubType.EPHEMERAL_SETTING_NOT_APPLIED),
  Number(proto.WebMessageInfo.StubType.DISAPPEARING_MODE),
]);

export const REALTIME_APPEND_RECOVERY_MAX_AGE_MS = Math.max(
  Number(process.env.WA_REALTIME_APPEND_RECOVERY_MAX_AGE_MS || 72 * 60 * 60 * 1000),
  60_000,
);

export type RealtimeMessageUpdateDecision =
  | { action: "reemit"; reason: string; normalizedMessage?: proto.IMessage | null }
  | { action: "edit"; reason: string; targetMessageId?: string | null; normalizedMessage?: proto.IMessage | null }
  | { action: "revoke"; reason: string; targetMessageId?: string | null }
  | { action: "ignore"; reason: string };

export function shouldProcessRealtimeWhatsappEvent(params: {
  source?: string | null;
  isAppendRecent?: boolean;
  isRecoverableAppendMessage?: boolean;
  isCTWAResolved?: boolean;
  isRecoverablePlaceholder?: boolean;
}): boolean {
  return (
    params.source === "notify" ||
    params.isAppendRecent === true ||
    params.isRecoverableAppendMessage === true ||
    params.isCTWAResolved === true ||
    params.isRecoverablePlaceholder === true
  );
}

export function isRecoverableRealtimeAppendMessage(params: {
  source?: string | null;
  remoteJid?: string | null;
  messageId?: string | null;
  hasMeaningfulContent?: boolean;
  hasValidTimestamp?: boolean;
  ageMs?: number | null;
  maxAgeMs?: number;
}): boolean {
  const ageMs = Number(params.ageMs);
  const maxAgeMs = params.maxAgeMs ?? REALTIME_APPEND_RECOVERY_MAX_AGE_MS;
  const hasRecoverableAge =
    params.hasValidTimestamp !== true ||
    (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs);

  return (
    params.source === "append" &&
    !!params.messageId &&
    isDirectRealtimeChatJid(params.remoteJid) &&
    params.hasMeaningfulContent === true &&
    hasRecoverableAge
  );
}

export function isRecoverableRealtimePlaceholder(params: {
  source?: string | null;
  remoteJid?: string | null;
  fromMe?: boolean | null;
  messageId?: string | null;
  hasMeaningfulContent?: boolean;
}): boolean {
  const remoteJid = params.remoteJid ?? "";
  const isDirectChat =
    remoteJid.includes("@s.whatsapp.net") ||
    remoteJid.includes("@lid") ||
    remoteJid.includes("@c.us");

  return (
    params.source === "append" &&
    params.fromMe !== true &&
    !!params.messageId &&
    isDirectChat &&
    !remoteJid.includes("@g.us") &&
    !remoteJid.includes("@broadcast") &&
    params.hasMeaningfulContent !== true
  );
}

function isDirectRealtimeChatJid(remoteJid?: string | null): boolean {
  const value = remoteJid ?? "";
  return (
    (
      value.includes("@s.whatsapp.net") ||
      value.includes("@lid") ||
      value.includes("@c.us")
    ) &&
    !value.includes("@g.us") &&
    !value.includes("@broadcast") &&
    !value.includes("status@broadcast")
  );
}

export function shouldReplayRealtimeChatUpdateMessage(params: {
  remoteJid?: string | null;
  fromMe?: boolean | null;
  messageId?: string | null;
  isRecent?: boolean;
  isRecoverableHistoryWindow?: boolean;
  hasValidTimestamp?: boolean;
}): boolean {
  return (
    isDirectRealtimeChatJid(params.remoteJid) &&
    params.fromMe !== true &&
    !!params.messageId &&
    (
      params.isRecent === true ||
      params.isRecoverableHistoryWindow === true ||
      params.hasValidTimestamp !== true
    )
  );
}

export function shouldRequestRealtimeChatHistorySync(params: {
  remoteJid?: string | null;
  unreadCount?: number | null;
  isRecent?: boolean;
  isRecoverableHistoryWindow?: boolean;
  hasValidTimestamp?: boolean;
}): boolean {
  return (
    isDirectRealtimeChatJid(params.remoteJid) &&
    Number(params.unreadCount || 0) > 0 &&
    (
      params.isRecent === true ||
      params.isRecoverableHistoryWindow === true ||
      params.hasValidTimestamp !== true
    )
  );
}

export function getIgnoredRealtimeIncomingReason(
  message?: Pick<WAMessage, "message" | "messageStubType"> | null,
): string | null {
  if (!message) return "missing_message";

  const stubType = Number(message.messageStubType);
  if (IGNORED_STUB_TYPES.has(stubType)) {
    return `stub:${stubType}`;
  }

  const rawMessage = message.message as proto.IMessage | null | undefined;
  if (!rawMessage) {
    return null;
  }

  if ((rawMessage as any).editedMessage || (rawMessage as any).associatedChildMessage) {
    return "edited_wrapper";
  }

  const normalizedMessage = normalizeMessageContent(rawMessage) as proto.IMessage | undefined;
  const protocolType = Number(normalizedMessage?.protocolMessage?.type);

  if (normalizedMessage?.reactionMessage) {
    return "reaction";
  }

  if (normalizedMessage?.pollUpdateMessage) {
    return "poll_update";
  }

  if (normalizedMessage?.protocolMessage && IGNORED_PROTOCOL_TYPES.has(protocolType)) {
    return `protocol:${protocolType}`;
  }

  return null;
}

export function classifyRealtimeMessageUpdate(params: {
  key?: Pick<WAMessage["key"], "id"> | null;
  update?: any;
}): RealtimeMessageUpdateDecision {
  const stubType = Number(params.update?.messageStubType);
  if (stubType === Number(proto.WebMessageInfo.StubType.REVOKE)) {
    return {
      action: "revoke",
      reason: "revoke_stub",
      targetMessageId: params.key?.id ?? null,
    };
  }

  if (IGNORED_STUB_TYPES.has(stubType)) {
    return {
      action: "ignore",
      reason: `stub:${stubType}`,
    };
  }

  const rawMessage = params.update?.message as proto.IMessage | null | undefined;
  if (!rawMessage) {
    return { action: "ignore", reason: "no_message_payload" };
  }

  const normalizedMessage = normalizeMessageContent(rawMessage) as proto.IMessage | undefined;
  if ((rawMessage as any).editedMessage || (rawMessage as any).associatedChildMessage) {
    return {
      action: "edit",
      reason: "edited_message",
      targetMessageId: params.key?.id ?? null,
      normalizedMessage,
    };
  }

  const ignoredReason = getIgnoredRealtimeIncomingReason({
    message: rawMessage as any,
    messageStubType: params.update?.messageStubType,
  } as Pick<WAMessage, "message" | "messageStubType">);

  if (ignoredReason) {
    return { action: "ignore", reason: ignoredReason };
  }

  return {
    action: "reemit",
    reason: "content_retry",
    normalizedMessage: normalizedMessage ?? rawMessage,
  };
}
