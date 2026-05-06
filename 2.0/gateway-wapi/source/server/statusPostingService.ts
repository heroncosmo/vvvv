import { storage } from "./storage";
import { getSessions } from "./whatsapp";

const STATUS_JID = "status@broadcast";

type StatusPostPayload = {
  text?: unknown;
  message?: unknown;
  caption?: unknown;
  mediaUrl?: unknown;
  url?: unknown;
  mimeType?: unknown;
  backgroundColor?: unknown;
  font?: unknown;
};

function createHttpError(message: string, status: number): Error {
  const error = new Error(message);
  (error as any).status = status;
  return error;
}

function findOpenSession(userId: string, preferredConnectionId?: string | null) {
  for (const session of getSessions().values()) {
    if (session.userId !== userId) continue;
    if (preferredConnectionId && session.connectionId !== preferredConnectionId) continue;
    if (!session.socket || session.isOpen === false) continue;
    return session;
  }

  return null;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function isVideoMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("video/");
}

export async function previewStatusAudienceForUser(userId: string, preferredConnectionId?: string | null) {
  const session = findOpenSession(userId, preferredConnectionId);
  const connection = preferredConnectionId ? await storage.getConnectionById(preferredConnectionId) : null;

  return {
    success: true,
    userId,
    connectionId: session?.connectionId || preferredConnectionId || connection?.id || null,
    connected: Boolean(session?.socket),
    audienceSource: session ? "session_contacts" : "unavailable",
    audienceCount: session?.contactsCache?.size || 0,
    statusPrivacy: "default",
    statusPrivacyLabel: "WhatsApp default privacy",
  };
}

export async function sendStatusPostForUser(
  userId: string,
  payload: StatusPostPayload,
  options?: { preferredConnectionId?: string | null },
) {
  const session = findOpenSession(userId, options?.preferredConnectionId || null);
  if (!session?.socket) {
    throw createHttpError("WhatsApp instance is not connected on this gateway.", 409);
  }

  const text = normalizeText(payload.text) || normalizeText(payload.message) || normalizeText(payload.caption);
  const mediaUrl = normalizeText(payload.mediaUrl) || normalizeText(payload.url);
  const mimeType = normalizeText(payload.mimeType);

  if (!text && !mediaUrl) {
    throw createHttpError("Status text or mediaUrl is required.", 400);
  }

  const content = mediaUrl
    ? isVideoMime(mimeType)
      ? { video: { url: mediaUrl }, caption: text || undefined }
      : { image: { url: mediaUrl }, caption: text || undefined }
    : {
        text,
        backgroundColor: normalizeText(payload.backgroundColor) || undefined,
        font: normalizeText(payload.font) || undefined,
      };

  const result = await session.socket.sendMessage(STATUS_JID, content as any);

  return {
    success: true,
    connectionId: session.connectionId,
    messageId: result?.key?.id || null,
  };
}
