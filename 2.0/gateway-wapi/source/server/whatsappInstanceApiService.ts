import type { Conversation, Message, WhatsappConnection, WhatsappContact } from "@shared/schema";

import { storage } from "./storage";
import { prepareOutgoingMediaForSend } from "./outgoingMediaPersistence";
import { ensureManagedPhoneConnectionContinuity } from "./whatsappConnectionContinuity";
import {
  connectWhatsApp,
  fetchUserGroups,
  ensureUserSessionOperational,
  getSession,
  hasPersistedAuthForConnection,
  sendMessage,
  sendMessageToGroups,
  sendUserMediaMessage,
  syncGroupConversationHistoryOnDemand,
} from "./whatsapp";
import { resolveConnectionScopedSession } from "./whatsappConnectionSessionResolver";
import { buildWhatsAppJidFromPhone, normalizeBrazilWhatsAppPhone } from "./whatsappPhoneNumber";
import { isOfficialCoexistenceConnection } from "./whatsappCoexistence";

const INSTANCE_QR_MAX_AGE_MS = Math.max(
  Number(process.env.WA_INSTANCE_QR_MAX_AGE_MS || 60_000),
  30_000,
);
const INSTANCE_STATUS_RECOVERY_OPEN_TIMEOUT_MS = Math.max(
  Number(process.env.WA_INSTANCE_STATUS_RECOVERY_OPEN_TIMEOUT_MS || 45_000),
  10_000,
);
const RECOVERABLE_INSTANCE_PROVIDER_STATUSES = new Set([
  "",
  "close",
  "closed",
  "disconnected",
  "not_connected",
  "open_timeout",
  "reconnecting",
  "recovering",
]);
const statusRecoveryInflight = new Map<string, number>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getConnectionQrCodeGeneratedAt(sessionData: unknown): string | null {
  if (!isRecord(sessionData)) return null;
  const runtimeDiagnostics = sessionData.runtimeDiagnostics;
  if (!isRecord(runtimeDiagnostics)) return null;
  const lastQrCode = runtimeDiagnostics.lastQrCode;
  if (isRecord(lastQrCode) && typeof lastQrCode.at === "string" && lastQrCode.at.trim()) {
    return lastQrCode.at.trim();
  }
  return null;
}

function isFreshConnectionQrCode(qrCode: string | null | undefined, generatedAt: string | null): boolean {
  if (!qrCode || !generatedAt) return false;
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return false;
  return Date.now() - generatedAtMs < INSTANCE_QR_MAX_AGE_MS;
}

function shouldRecoverDisconnectedInstanceStatus(providerStatus?: string | null): boolean {
  return RECOVERABLE_INSTANCE_PROVIDER_STATUSES.has(String(providerStatus || "").trim().toLowerCase());
}

async function hasRecoverablePersistedAuth(connection: WhatsappConnection): Promise<boolean> {
  if (!shouldRecoverDisconnectedInstanceStatus(connection.providerStatus)) {
    return false;
  }

  return hasPersistedAuthForConnection(connection.userId, connection.id).catch(() => false);
}

function scheduleStatusRecovery(connection: WhatsappConnection): void {
  const lastAttempt = statusRecoveryInflight.get(connection.id) || 0;
  if (Date.now() - lastAttempt < 30_000) {
    return;
  }

  statusRecoveryInflight.set(connection.id, Date.now());
  void connectWhatsApp(connection.userId, connection.id, {
    source: "status_recovery",
    openTimeoutMs: INSTANCE_STATUS_RECOVERY_OPEN_TIMEOUT_MS,
  }).catch((error: any) => {
    if (error?.code !== "WA_PAIRING_REQUIRED_COOLDOWN") {
      console.warn(`[instance-status] Falha ao reidratar ${connection.id.substring(0, 8)} via status:`, error?.code || error?.message || error);
    }
  }).finally(() => {
    setTimeout(() => statusRecoveryInflight.delete(connection.id), 30_000).unref?.();
  });
}

export interface InstanceStatusPayload {
  instanceId: string;
  phoneNumber: string | null;
  isConnected: boolean;
  qrCode: string | null;
  qrCodeGeneratedAt?: string | null;
  provider: string | null;
  providerStatus: string | null;
}

export interface InstanceDevicePayload {
  instanceId: string;
  connectedPhone: string | null;
  name: string | null;
  platform: string | null;
  lid: string | null;
  profilePictureUrl: string | null;
  status: string | null;
  isBusiness: boolean | null;
}

export interface SendTextViaInstanceParams {
  connection: WhatsappConnection;
  text: string;
  conversationId?: string | null;
  to?: string | null;
  contactName?: string | null;
  validateDestination?: boolean;
  isFromAgent?: boolean;
  source?: "owner" | "agent" | "followup" | "system";
  bypassDeduplication?: boolean;
  acceptQueued?: boolean;
  clientMessageId?: string | null;
  existingMessageDbId?: string | null;
}

export interface SendMediaViaInstanceParams {
  connection: WhatsappConnection;
  type: "image" | "audio" | "video" | "document";
  data: string;
  mimetype?: string | null;
  filename?: string | null;
  caption?: string | null;
  trackingMediaName?: string | null;
  ptt?: boolean;
  seconds?: number | null;
  conversationId?: string | null;
  to?: string | null;
  contactName?: string | null;
  validateDestination?: boolean;
  isFromAgent?: boolean;
  source?: "owner" | "agent" | "followup" | "system";
}

interface LiveInstanceSnapshot {
  session: ReturnType<typeof getSession> | undefined;
  connectedPhone: string | null;
  socketName: string | null;
  socketLid: string | null;
  hasOperationalSocket: boolean;
  isConnected: boolean;
  status: "connected" | "disconnected";
}

export function computeLiveInstanceSnapshot(
  connection: WhatsappConnection,
  sessionOverride?: ReturnType<typeof getSession>,
): LiveInstanceSnapshot {
  const session = sessionOverride || resolveConnectionScopedSession(connection, getSession);
  const socketUser = session?.socket?.user as {
    id?: string;
    name?: string;
    lid?: string;
  } | undefined;
  const wsReadyState = (session?.socket as any)?.ws?.readyState;
  const hasOperationalSocket = !!(
    socketUser?.id &&
    (wsReadyState === undefined || wsReadyState === 1)
  );
  const connectedPhone = socketUser?.id ? socketUser.id.split(":")[0] : connection.phoneNumber || null;
  const isConnected = !!connection.isConnected || hasOperationalSocket;

  return {
    session,
    connectedPhone,
    socketName: socketUser?.name || null,
    socketLid: socketUser?.lid || null,
    hasOperationalSocket,
    isConnected,
    status: isConnected ? "connected" : "disconnected",
  };
}

function normalizeApiDestination(to?: string | null): string {
  const normalized = normalizeBrazilWhatsAppPhone(String(to || ""));
  const digits = String(normalized || "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("Numero de destino invalido");
  }
  return digits;
}

function buildBrazilReachablePhoneCandidates(value?: string | null): string[] {
  const normalized = normalizeBrazilWhatsAppPhone(value);
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>([normalized]);
  if (normalized.startsWith("55")) {
    if (normalized.length === 13 && normalized[4] === "9") {
      candidates.add(`${normalized.slice(0, 4)}${normalized.slice(5)}`);
    }

    if (normalized.length === 12) {
      candidates.add(`${normalized.slice(0, 4)}9${normalized.slice(4)}`);
    }
  }

  return Array.from(candidates).filter(Boolean);
}

function extractPhoneDigitsFromJid(value?: string | null): string | null {
  const normalized = String(value || "").split("@")[0]?.split(":")[0] || "";
  const digits = normalized.replace(/\D/g, "");
  return digits || null;
}

function extractJidSuffix(value?: string | null): string {
  return String(value || "").split("@")[1]?.split(":")[0] || "s.whatsapp.net";
}

async function withValidationTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  return new Promise<T>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} excedeu ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        resolve(value);
      },
      (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        reject(error);
      },
    );
  });
}

async function validateConversationDestination(params: {
  connection: WhatsappConnection;
  conversation: Conversation;
  to?: string | null;
  contactName?: string | null;
  validateDestination?: boolean;
}): Promise<Conversation> {
  if (!params.validateDestination) {
    return params.conversation;
  }

  const existingJid = String(params.conversation.remoteJid || "");
  if (existingJid.endsWith("@g.us")) {
    return params.conversation;
  }

  const candidates = buildBrazilReachablePhoneCandidates(
    params.to || params.conversation.contactNumber || params.conversation.remoteJid,
  );
  if (candidates.length === 0) {
    throw new Error("Numero de destino invalido");
  }

  const snapshot = computeLiveInstanceSnapshot(params.connection);
  const socket = snapshot.session?.socket as any;
  if (!socket?.onWhatsApp) {
    throw new Error("Sessao WhatsApp indisponivel para validar o destino");
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const results = await withValidationTimeout(
        socket.onWhatsApp(candidate),
        20_000,
        `Validacao WhatsApp ${candidate}`,
      );
      const found = Array.isArray(results)
        ? results.find((item: any) => item?.exists && item?.jid)
        : null;

      if (!found?.jid) {
        continue;
      }

      const remoteJid = String(found.jid);
      const contactNumber = extractPhoneDigitsFromJid(remoteJid) || candidate;
      const updates: Partial<Conversation> = {};

      if (params.conversation.remoteJid !== remoteJid) {
        updates.remoteJid = remoteJid;
      }

      if (params.conversation.jidSuffix !== "s.whatsapp.net") {
        updates.jidSuffix = "s.whatsapp.net";
      }

      if (params.conversation.contactNumber !== contactNumber) {
        updates.contactNumber = contactNumber;
      }

      if (!params.conversation.contactName && params.contactName) {
        updates.contactName = params.contactName;
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateConversation(params.conversation.id, updates);
        return {
          ...params.conversation,
          ...updates,
        };
      }

      return params.conversation;
    } catch (error) {
      lastError = error;
    }
  }

  const errorDetail = lastError instanceof Error ? ` (${lastError.message})` : "";
  throw new Error(`Numero nao encontrado no WhatsApp: ${candidates.join(", ")}${errorDetail}`);
}

async function resolveValidatedDirectDestination(params: {
  connection: WhatsappConnection;
  to?: string | null;
  contactName?: string | null;
  validateDestination?: boolean;
}): Promise<{ contactNumber: string; remoteJid: string; jidSuffix: string; contactName: string | null }> {
  const digits = normalizeApiDestination(params.to);
  const fallbackJid = buildWhatsAppJidFromPhone(digits) || `${digits}@s.whatsapp.net`;

  if (!params.validateDestination) {
    return {
      contactNumber: digits,
      remoteJid: fallbackJid,
      jidSuffix: extractJidSuffix(fallbackJid),
      contactName: params.contactName || digits,
    };
  }

  const snapshot = computeLiveInstanceSnapshot(params.connection);
  const socket = snapshot.session?.socket as any;
  if (!socket?.onWhatsApp) {
    throw new Error("Sessao WhatsApp indisponivel para validar o destino");
  }

  const candidates = buildBrazilReachablePhoneCandidates(params.to || digits);
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const results = await withValidationTimeout(
        socket.onWhatsApp(candidate),
        20_000,
        `Validacao WhatsApp ${candidate}`,
      );
      const found = Array.isArray(results)
        ? results.find((item: any) => item?.exists && item?.jid)
        : null;

      if (!found?.jid) {
        continue;
      }

      const remoteJid = String(found.jid);
      return {
        contactNumber: extractPhoneDigitsFromJid(remoteJid) || candidate,
        remoteJid,
        jidSuffix: extractJidSuffix(remoteJid),
        contactName: params.contactName || digits,
      };
    } catch (error) {
      lastError = error;
    }
  }

  const errorDetail = lastError instanceof Error ? ` (${lastError.message})` : "";
  throw new Error(`Numero nao encontrado no WhatsApp: ${candidates.join(", ")}${errorDetail}`);
}

async function ensureOperationalSocket(
  connection: WhatsappConnection,
  source: string,
): Promise<{ connection: WhatsappConnection; socket: any }> {
  const snapshot = computeLiveInstanceSnapshot(connection);
  const continuityConnection =
    await ensureManagedPhoneConnectionContinuity({
      userId: connection.userId,
      connectionId: connection.id,
      runtimePhoneNumber: snapshot.connectedPhone,
      runtimeIsConnected: snapshot.hasOperationalSocket || connection.isConnected === true,
    }) || connection;

  const session = await ensureUserSessionOperational(connection.userId, continuityConnection.id, {
    waitMs: 10_000,
    source,
  });

  if (!session?.socket) {
    throw new Error("WhatsApp nao conectado para esta instancia");
  }

  return {
    connection: continuityConnection,
    socket: session.socket,
  };
}

export async function sendTextDirectViaInstance(params: SendTextViaInstanceParams) {
  const { connection, socket } = await ensureOperationalSocket(
    params.connection,
    `sendTextDirectViaInstance:${params.connection.id}`,
  );
  const destination = await resolveValidatedDirectDestination({
    connection,
    to: params.to,
    contactName: params.contactName,
    validateDestination: params.validateDestination,
  });

  const sentMessage = await socket.sendMessage(destination.remoteJid, {
    text: params.text,
  });

  return {
    success: true,
    messageId: sentMessage?.key?.id || null,
    remoteJid: destination.remoteJid,
    contactNumber: destination.contactNumber,
    jidSuffix: destination.jidSuffix,
  };
}

export async function sendMediaDirectViaInstance(params: SendMediaViaInstanceParams) {
  const { connection, socket } = await ensureOperationalSocket(
    params.connection,
    `sendMediaDirectViaInstance:${params.connection.id}`,
  );
  const destination = await resolveValidatedDirectDestination({
    connection,
    to: params.to,
    contactName: params.contactName,
    validateDestination: params.validateDestination,
  });
  const { buffer } = await prepareOutgoingMediaForSend({
    mediaData: params.data,
    mimeType:
      params.mimetype ||
      (params.type === "image"
        ? "image/jpeg"
        : params.type === "audio"
          ? "audio/ogg; codecs=opus"
          : params.type === "video"
            ? "video/mp4"
            : "application/octet-stream"),
    ownerId: connection.userId,
  });

  let messageContent: any;
  switch (params.type) {
    case "audio":
      messageContent = {
        audio: buffer,
        mimetype: params.mimetype || "audio/ogg; codecs=opus",
        ptt: params.ptt !== false,
        seconds: params.seconds ?? undefined,
      };
      break;
    case "image":
      messageContent = {
        image: buffer,
        mimetype: params.mimetype || "image/jpeg",
        caption: params.caption || undefined,
      };
      break;
    case "video":
      messageContent = {
        video: buffer,
        mimetype: params.mimetype || "video/mp4",
        caption: params.caption || undefined,
      };
      break;
    case "document":
      messageContent = {
        document: buffer,
        mimetype: params.mimetype || "application/octet-stream",
        fileName: params.filename || "document",
        caption: params.caption || undefined,
      };
      break;
    default:
      throw new Error(`Tipo de midia nao suportado: ${params.type}`);
  }

  const sentMessage = await socket.sendMessage(destination.remoteJid, messageContent);

  return {
    success: true,
    messageId: sentMessage?.key?.id || null,
    remoteJid: destination.remoteJid,
    contactNumber: destination.contactNumber,
    jidSuffix: destination.jidSuffix,
  };
}

export async function buildLocalInstanceStatus(
  connection: WhatsappConnection,
): Promise<InstanceStatusPayload> {
  const snapshot = computeLiveInstanceSnapshot(connection);
  const isConnected = snapshot.hasOperationalSocket;
  const hasRecoverableAuth = !isConnected && await hasRecoverablePersistedAuth(connection);
  const qrCodeGeneratedAt = getConnectionQrCodeGeneratedAt(connection.sessionData);
  const qrCode = isFreshConnectionQrCode(connection.qrCode, qrCodeGeneratedAt)
    ? connection.qrCode || null
    : null;
  if (hasRecoverableAuth && !qrCode) {
    scheduleStatusRecovery(connection);
  }

  return {
    instanceId: connection.id,
    phoneNumber: snapshot.connectedPhone,
    isConnected,
    qrCode,
    qrCodeGeneratedAt: qrCode ? qrCodeGeneratedAt : null,
    provider: connection.provider || null,
    providerStatus: isConnected
      ? "connected"
      : hasRecoverableAuth && !qrCode
        ? "recovering"
        : (connection.providerStatus || snapshot.status),
  };
}

export async function buildLocalInstanceDevice(
  connection: WhatsappConnection,
): Promise<InstanceDevicePayload> {
  const snapshot = computeLiveInstanceSnapshot(connection);

  return {
    instanceId: connection.id,
    connectedPhone: snapshot.connectedPhone,
    name: snapshot.socketName,
    platform: isOfficialCoexistenceConnection(connection) ? "meta_cloud_api" : "baileys",
    lid: snapshot.socketLid,
    profilePictureUrl: null,
    status: snapshot.status,
    isBusiness: null,
  };
}

export async function listInstanceConversations(connectionId: string): Promise<Conversation[]> {
  return storage.getConversationsByConnectionId(connectionId);
}

export async function listInstanceMessages(
  connectionId: string,
  conversationId: string,
): Promise<Message[]> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation || conversation.connectionId !== connectionId) {
    throw new Error("Conversa nao encontrada para esta instancia");
  }
  return storage.getMessagesByConversationId(conversationId);
}

export async function syncInstanceGroupHistory(
  connectionId: string,
  conversationId: string,
) {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation || conversation.connectionId !== connectionId) {
    throw new Error("Conversa nao encontrada para esta instancia");
  }

  return syncGroupConversationHistoryOnDemand({
    connectionId,
    conversationId,
  });
}

export async function listInstanceContacts(connectionId: string): Promise<WhatsappContact[]> {
  return storage.getContactsByConnectionId(connectionId);
}

export async function listInstanceGroups(connection: WhatsappConnection) {
  return fetchUserGroups(connection.userId, connection.id);
}

async function ensureConversationForDestination(
  connection: WhatsappConnection,
  to: string,
  contactName?: string | null,
): Promise<Conversation> {
  const digits = normalizeApiDestination(to);
  const snapshot = computeLiveInstanceSnapshot(connection);
  const continuityConnection =
    await ensureManagedPhoneConnectionContinuity({
      userId: connection.userId,
      connectionId: connection.id,
      runtimePhoneNumber: snapshot.connectedPhone,
      runtimeIsConnected: snapshot.hasOperationalSocket || connection.isConnected === true,
    }) || connection;
  const targetJid = buildWhatsAppJidFromPhone(digits);
  const existing =
    (await storage.findConversationByIdentity(continuityConnection.id, {
      contactNumber: digits,
      remoteJid: targetJid,
      activeOnly: true,
    })) ||
    (await storage.findConversationByIdentity(continuityConnection.id, {
      contactNumber: digits,
      remoteJid: targetJid,
    }));

  if (existing) {
    return existing;
  }

  return storage.createConversation({
    connectionId: continuityConnection.id,
    contactNumber: digits,
    remoteJid: buildWhatsAppJidFromPhone(digits),
    jidSuffix: "s.whatsapp.net",
    contactName: contactName || digits,
    unreadCount: 0,
    hasReplied: false,
  });
}

export async function sendTextViaInstance(params: SendTextViaInstanceParams) {
  let conversation =
    params.conversationId
      ? await storage.getConversation(params.conversationId)
      : await ensureConversationForDestination(params.connection, params.to || "", params.contactName);

  if (!conversation || conversation.connectionId !== params.connection.id) {
    throw new Error("Conversa nao encontrada para esta instancia");
  }

  conversation = await validateConversationDestination({
    connection: params.connection,
    conversation,
    to: params.to,
    contactName: params.contactName,
    validateDestination: params.validateDestination,
  });

  if (params.acceptQueued === true) {
    if (params.existingMessageDbId) {
      await storage.updateMessage(params.existingMessageDbId, {
        status: "queued",
        ...(params.clientMessageId ? { messageId: params.clientMessageId } : {}),
      }).catch((error) => {
        console.warn("[instance-api] Falha ao marcar mensagem aceita na fila:", error);
        return null;
      });
    }

    void sendMessage(params.connection.userId, conversation.id, params.text, {
      source: params.source || (params.isFromAgent ? "agent" : "system"),
      isFromAgent: params.isFromAgent === true,
      bypassDeduplication: params.bypassDeduplication === true,
      clientMessageId: params.clientMessageId || undefined,
      existingMessageDbId: params.existingMessageDbId || undefined,
    }).then(async (result) => {
      if (result.success === false && params.existingMessageDbId) {
        await storage.updateMessage(params.existingMessageDbId, { status: "failed" }).catch((error) => {
          console.warn("[instance-api] Falha ao marcar mensagem aceita como falha:", error);
        });
      }
    }).catch(async (error) => {
      console.error("[instance-api] Falha no envio aceito em background:", error);
      if (params.existingMessageDbId) {
        await storage.updateMessage(params.existingMessageDbId, { status: "failed" }).catch((updateError) => {
          console.warn("[instance-api] Falha ao marcar mensagem aceita como falha:", updateError);
        });
      }
    });

    return {
      success: true,
      queued: true,
      messageId: params.clientMessageId || null,
      conversationId: conversation.id,
      remoteJid: conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
      blocked: false,
      reason: null,
    };
  }

  const result = await sendMessage(params.connection.userId, conversation.id, params.text, {
    source: params.source || (params.isFromAgent ? "agent" : "system"),
    isFromAgent: params.isFromAgent === true,
    bypassDeduplication: params.bypassDeduplication === true,
    clientMessageId: params.clientMessageId || undefined,
    existingMessageDbId: params.existingMessageDbId || undefined,
  });

  return {
    success: result.success,
    messageId: result.messageId || null,
    conversationId: conversation.id,
    remoteJid: conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
    blocked: result.blocked === true,
    reason: result.reason || null,
  };
}

export async function sendMediaViaInstance(params: SendMediaViaInstanceParams) {
  let conversation =
    params.conversationId
      ? await storage.getConversation(params.conversationId)
      : await ensureConversationForDestination(params.connection, params.to || "", params.contactName);

  if (!conversation || conversation.connectionId !== params.connection.id) {
    throw new Error("Conversa nao encontrada para esta instancia");
  }

  conversation = await validateConversationDestination({
    connection: params.connection,
    conversation,
    to: params.to,
    contactName: params.contactName,
    validateDestination: params.validateDestination,
  });

  const normalizedSource = params.source || (params.isFromAgent === true ? "agent" : "system");
  const isAutomatedMedia =
    params.isFromAgent === true ||
    normalizedSource !== "owner" ||
    Boolean(String(params.trackingMediaName || "").trim());

  const result = await sendUserMediaMessage(params.connection.userId, conversation.id, {
    type: params.type,
    data: params.data,
    mimetype:
      params.mimetype ||
      (params.type === "image"
        ? "image/jpeg"
        : params.type === "audio"
          ? "audio/ogg; codecs=opus"
          : params.type === "video"
            ? "video/mp4"
            : "application/octet-stream"),
    filename: params.filename || undefined,
    caption: params.caption || undefined,
    trackingMediaName: params.trackingMediaName || undefined,
    ptt: params.ptt,
    seconds: params.seconds ?? undefined,
  }, {
    isFromAgent: isAutomatedMedia,
    source: normalizedSource,
    yieldQueue: true,
    skipAutoPause: isAutomatedMedia || normalizedSource === "system",
  });

  return {
    success: true,
    conversationId: conversation.id,
    messageId: result?.messageId || null,
    remoteJid: conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
  };
}

export async function sendGroupBulkViaInstance(params: {
  connection: WhatsappConnection;
  groupIds: string[];
  message: string;
  settings?: {
    delayMin?: number;
    delayMax?: number;
    useAI?: boolean;
  } | null;
}) {
  return sendMessageToGroups(params.connection.userId, params.groupIds, params.message, {
    connectionId: params.connection.id,
    delayMin: Number(params.settings?.delayMin || 0) * 1000,
    delayMax: Number(params.settings?.delayMax || 0) * 1000,
    useAI: Boolean(params.settings?.useAI),
  });
}
