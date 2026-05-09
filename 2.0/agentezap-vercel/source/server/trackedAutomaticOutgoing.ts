export interface TrackedSharedAutomaticOutgoingMessage {
  messageId: string;
  contactNumber: string;
  conversationId?: string;
  text?: string;
  mediaType?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  isFromAgent: boolean;
  source: string;
  createdAt: number;
}

interface ConversationLike {
  id: string;
  contactNumber: string;
  contactName?: string | null;
}

interface SavedMessageLike {
  id: string | number;
  messageId: string;
  text?: string | null;
  timestamp?: Date | string | null;
  mediaType?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaDuration?: number | null;
  mediaCaption?: string | null;
}

interface PersistTrackedSharedAutomaticOutgoingMessageParams {
  baseConversation: ConversationLike;
  trackedMessage: TrackedSharedAutomaticOutgoingMessage;
  userId: string;
  fallbackMessageText?: string | null;
  waMessageId?: string | null;
  waMessageTimestamp?: unknown;
  mediaType?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaKey?: string | null;
  directPath?: string | null;
  mediaUrlOriginal?: string | null;
  loadConversation: (conversationId: string) => Promise<ConversationLike | null | undefined>;
  createMessage: (payload: Record<string, unknown>) => Promise<SavedMessageLike>;
  updateConversation: (conversationId: string, payload: Record<string, unknown>) => Promise<unknown>;
  scheduleFollowUp: (conversationId: string, options: { forceRestart: boolean }) => Promise<unknown>;
  broadcastToUser: (userId: string, payload: Record<string, unknown>) => void;
  onFollowUpError?: (error: unknown) => void;
}

function resolveTrackedTimestamp(rawTimestamp?: unknown): Date {
  const numericTimestamp = Number(rawTimestamp);
  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) {
    return new Date(numericTimestamp * 1000);
  }

  return new Date();
}

export async function persistTrackedSharedAutomaticOutgoingMessage(
  params: PersistTrackedSharedAutomaticOutgoingMessageParams,
): Promise<{
  trackedConversation: ConversationLike;
  savedMessage: SavedMessageLike;
  previewText: string;
}> {
  const trackedConversation =
    params.trackedMessage.conversationId &&
    params.trackedMessage.conversationId !== params.baseConversation.id
      ? (await params.loadConversation(params.trackedMessage.conversationId)) || params.baseConversation
      : params.baseConversation;

  const trackedTimestamp = resolveTrackedTimestamp(params.waMessageTimestamp);
  const trackedText = params.trackedMessage.text || params.fallbackMessageText || "";

  const savedMessage = await params.createMessage({
    conversationId: trackedConversation.id,
    messageId: params.waMessageId || `tracked_${Date.now()}`,
    fromMe: true,
    text: trackedText,
    timestamp: trackedTimestamp,
    status: "sent",
    isFromAgent: params.trackedMessage.isFromAgent,
    mediaType: params.mediaType || params.trackedMessage.mediaType || null,
    mediaUrl: params.mediaUrl || null,
    mediaMimeType: params.mediaMimeType || params.trackedMessage.mediaMimeType || null,
    mediaCaption: params.trackedMessage.mediaCaption || null,
    mediaKey: params.mediaKey || null,
    directPath: params.directPath || null,
    mediaUrlOriginal: params.mediaUrlOriginal || null,
  });

  const previewText = String(savedMessage?.text || trackedText || params.fallbackMessageText || "").substring(0, 255);

  await params.updateConversation(trackedConversation.id, {
    lastMessageText: previewText,
    lastMessageTime: trackedTimestamp,
    lastMessageFromMe: true,
    hasReplied: true,
    unreadCount: 0,
  });

  try {
    await params.scheduleFollowUp(trackedConversation.id, { forceRestart: true });
  } catch (error) {
    params.onFollowUpError?.(error);
  }

  params.broadcastToUser(params.userId, {
    type: "new_message",
    conversationId: trackedConversation.id,
    message: savedMessage?.text || trackedText || params.fallbackMessageText || "",
    mediaType: params.mediaType || params.trackedMessage.mediaType || null,
    messageData: {
      id: savedMessage.id,
      conversationId: trackedConversation.id,
      messageId: savedMessage.messageId,
      fromMe: true,
      text: savedMessage.text,
      timestamp:
        savedMessage.timestamp instanceof Date
          ? savedMessage.timestamp.toISOString()
          : savedMessage.timestamp || trackedTimestamp.toISOString(),
      isFromAgent: params.trackedMessage.isFromAgent,
      status: "sent",
      mediaType: savedMessage.mediaType || params.trackedMessage.mediaType || null,
      mediaUrl: savedMessage.mediaUrl || null,
      mediaMimeType: savedMessage.mediaMimeType || params.trackedMessage.mediaMimeType || null,
      mediaDuration: savedMessage.mediaDuration || null,
      mediaCaption: savedMessage.mediaCaption || params.trackedMessage.mediaCaption || null,
    },
    conversationUpdate: {
      id: trackedConversation.id,
      contactNumber: trackedConversation.contactNumber,
      contactName: trackedConversation.contactName || null,
      lastMessageText: previewText,
      lastMessageTime: trackedTimestamp.toISOString(),
      lastMessageFromMe: true,
      unreadCount: 0,
    },
  });

  return {
    trackedConversation,
    savedMessage,
    previewText,
  };
}
