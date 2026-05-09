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

export type RealtimeMessageUpdateDecision =
  | { action: "reemit"; reason: string; normalizedMessage?: proto.IMessage | null }
  | { action: "edit"; reason: string; targetMessageId?: string | null; normalizedMessage?: proto.IMessage | null }
  | { action: "revoke"; reason: string; targetMessageId?: string | null }
  | { action: "ignore"; reason: string };

export function shouldProcessRealtimeWhatsappEvent(params: {
  source?: string | null;
  isAppendRecent?: boolean;
  isCTWAResolved?: boolean;
}): boolean {
  return (
    params.source === "notify" ||
    params.isAppendRecent === true ||
    params.isCTWAResolved === true
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
