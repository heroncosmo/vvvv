import type { Conversation, Message, WhatsappConnection, WhatsappContact } from "@shared/schema";

import { storage } from "./storage";
import { prepareOutgoingMediaForSend } from "./outgoingMediaPersistence";
import centralizedMessageSender from "./centralizedMessageSender";
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
  redownloadMedia,
} from "./whatsapp";
import { resolveConnectionScopedSession } from "./whatsappConnectionSessionResolver";
import { buildWhatsAppJidFromPhone, normalizeBrazilWhatsAppPhone } from "./whatsappPhoneNumber";
import {
  isOfficialCoexistenceConnection,
  isPersistedWhatsAppConnectionOperational,
} from "./whatsappCoexistence";
import { messageQueueService } from "./messageQueueService";
import { groupMetadataCache } from "./antiBanProtectionService";
import {
  buildPlainTextWhatsAppPayload,
  normalizeOutboundTextForCustomer,
} from "./outboundTextPolicy";

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
  if (!shouldRecoverDisconnectedInstanceStatus(connection.providerStatus)) return false;
  return hasPersistedAuthForConnection(connection.userId, connection.id).catch(() => false);
}

function scheduleStatusRecovery(connection: WhatsappConnection): void {
  const lastAttempt = statusRecoveryInflight.get(connection.id) || 0;
  if (Date.now() - lastAttempt < 30_000) return;

  statusRecoveryInflight.set(connection.id, Date.now());
  void connectWhatsApp(connection.userId, connection.id, {
    source: "status_recovery",
    openTimeoutMs: INSTANCE_STATUS_RECOVERY_OPEN_TIMEOUT_MS,
  }).catch((error) => {
    console.warn(
      `[INSTANCE API] Falha ao recuperar status da instancia ${connection.id}:`,
      error?.message || error,
    );
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
}

export interface SendMediaViaInstanceParams {
  connection: WhatsappConnection;
  type: "image" | "audio" | "video" | "document";
  data: string;
  mimetype?: string | null;
  filename?: string | null;
  caption?: string | null;
  ptt?: boolean;
  seconds?: number | null;
  conversationId?: string | null;
  to?: string | null;
  contactName?: string | null;
  validateDestination?: boolean;
}

export interface SendContactViaInstanceParams {
  connection: WhatsappConnection;
  phoneNumber: string;
  displayName?: string | null;
  organization?: string | null;
  email?: string | null;
  url?: string | null;
  conversationId?: string | null;
  to?: string | null;
  contactName?: string | null;
  validateDestination?: boolean;
}

export interface SendLocationViaInstanceParams {
  connection: WhatsappConnection;
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
  conversationId?: string | null;
  to?: string | null;
  contactName?: string | null;
  validateDestination?: boolean;
}

export interface SendButtonsViaInstanceParams {
  connection: WhatsappConnection;
  body: string;
  buttons: Array<{
    id?: string;
    title?: string;
    type?: "reply";
    reply?: { id?: string; title?: string };
  }>;
  header?: { type?: "text"; text?: string | null } | null;
  footer?: { text?: string | null } | null;
  conversationId?: string | null;
  to?: string | null;
  contactName?: string | null;
  validateDestination?: boolean;
}

export interface SendListViaInstanceParams {
  connection: WhatsappConnection;
  body: string;
  buttonText: string;
  sections: Array<{
    title?: string;
    rows?: Array<{
      id?: string;
      title?: string;
      description?: string;
    }>;
  }>;
  header?: { type?: "text"; text?: string | null } | null;
  footer?: { text?: string | null } | null;
  conversationId?: string | null;
  to?: string | null;
  contactName?: string | null;
  validateDestination?: boolean;
}

export interface SendReactionViaInstanceParams {
  connection: WhatsappConnection;
  messageId: string;
  emoji?: string | null;
  conversationId?: string | null;
}

export interface InstanceContactValidationPayload {
  input: string;
  exists: boolean;
  contactNumber: string | null;
  remoteJid: string | null;
  jidSuffix: string | null;
}

export interface InstanceMessageMediaPayload {
  success: boolean;
  instanceId: string;
  conversationId: string;
  messageId: string;
  localMessageId: string;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaCaption: string | null;
  canRedownload: boolean;
  redownloaded: boolean;
}

export interface InstanceQueuePayload {
  success: boolean;
  instanceId: string;
  scope: "account_runtime_shared";
  queueLength: number;
  isProcessing: boolean;
  totalSent: number;
  totalErrors: number;
  lastSentAt: string | null;
  batchCount: number;
  isPaused: boolean;
  pauseRemainingMs: number;
  minuteCount: number;
  hourCount: number;
  dayCount: number;
  batchPauseLevel: number;
  currentPauseDurationMs: number;
  canSendNow: boolean;
  waitMs: number;
  reason: string | null;
}

export interface InstanceGroupParticipantPayload {
  id: string;
  phoneNumber: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface InstanceGroupDetailsPayload {
  success: boolean;
  instanceId: string;
  groupId: string;
  name: string;
  description: string | null;
  owner: string | null;
  createdAt: number | null;
  announce: boolean | null;
  restrict: boolean | null;
  participantsCount: number;
  admins: string[];
  participants: InstanceGroupParticipantPayload[];
}

export interface InstanceGroupParticipantUpdatePayload {
  success: boolean;
  instanceId: string;
  groupId: string;
  action: "add" | "remove" | "promote" | "demote";
  items: Array<{
    jid: string | null;
    status: string;
  }>;
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
  const persistedConnected = isOfficialCoexistenceConnection(connection)
    ? isPersistedWhatsAppConnectionOperational(connection)
    : false;
  const isConnected = hasOperationalSocket || persistedConnected;

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

function formatContactCardPhone(value: string): { waid: string; formatted: string } {
  const normalized = normalizeBrazilWhatsAppPhone(value) || String(value || "").replace(/\D/g, "");
  const digits = String(normalized || "").replace(/\D/g, "");

  if (!digits) {
    throw new Error("Numero do contato invalido");
  }

  return {
    waid: digits,
    formatted: digits.startsWith("+") ? digits : `+${digits}`,
  };
}

function buildContactCardPayload(params: {
  phoneNumber: string;
  displayName?: string | null;
  organization?: string | null;
  email?: string | null;
  url?: string | null;
}) {
  const { waid, formatted } = formatContactCardPhone(params.phoneNumber);
  const displayName = String(params.displayName || params.phoneNumber || "Contato").trim() || "Contato";
  const vcardLines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${displayName}`,
  ];

  if (params.organization) {
    vcardLines.push(`ORG:${String(params.organization).trim()};`);
  }

  vcardLines.push(`TEL;type=CELL;type=VOICE;waid=${waid}:${formatted}`);

  if (params.email) {
    vcardLines.push(`EMAIL;type=INTERNET:${String(params.email).trim()}`);
  }

  if (params.url) {
    vcardLines.push(`URL:${String(params.url).trim()}`);
  }

  vcardLines.push("END:VCARD");

  return {
    displayName,
    contacts: {
      displayName,
      contacts: [{ vcard: vcardLines.join("\n") }],
    },
  };
}

function buildLocationPayload(params: {
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
}) {
  const latitude = Number(params.latitude);
  const longitude = Number(params.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Latitude/longitude invalidas");
  }

  return {
    location: {
      degreesLatitude: latitude,
      degreesLongitude: longitude,
      name: params.name ? String(params.name).trim() : undefined,
      address: params.address ? String(params.address).trim() : undefined,
    },
  };
}

function normalizeButtonsPayload(params: SendButtonsViaInstanceParams) {
  const body = String(params.body || "").trim();
  if (!body) {
    throw new Error("Texto dos botoes e obrigatorio");
  }

  const buttons = Array.isArray(params.buttons)
    ? params.buttons
        .map((button, index) => {
          const title = String(button?.reply?.title || button?.title || "").trim();
          const id = String(button?.reply?.id || button?.id || `option_${index + 1}`).trim();
          if (!title) return null;
          return {
            type: "reply" as const,
            reply: { id, title },
          };
        })
        .filter(Boolean)
    : [];

  if (buttons.length === 0) {
    throw new Error("Lista de botoes e obrigatoria");
  }

  return {
    body,
    buttons,
    header: params.header?.text ? { type: "text" as const, text: String(params.header.text).trim() } : undefined,
    footer: params.footer?.text ? { text: String(params.footer.text).trim() } : undefined,
  };
}

function normalizeListPayload(params: SendListViaInstanceParams) {
  const body = String(params.body || "").trim();
  const buttonText = String(params.buttonText || "").trim();

  if (!body) {
    throw new Error("Texto da lista e obrigatorio");
  }

  if (!buttonText) {
    throw new Error("buttonText e obrigatorio");
  }

  const sections = Array.isArray(params.sections)
    ? params.sections
        .map((section, sectionIndex) => {
          const rows = Array.isArray(section?.rows)
            ? section.rows
                .map((row, rowIndex) => {
                  const title = String(row?.title || "").trim();
                  const id = String(row?.id || `row_${sectionIndex + 1}_${rowIndex + 1}`).trim();
                  if (!title) return null;
                  return {
                    id,
                    title,
                    description: row?.description ? String(row.description).trim() : undefined,
                  };
                })
                .filter(Boolean)
            : [];

          if (rows.length === 0) {
            return null;
          }

          return {
            title: section?.title ? String(section.title).trim() : undefined,
            rows,
          };
        })
        .filter(Boolean)
    : [];

  if (sections.length === 0) {
    throw new Error("Secoes da lista sao obrigatorias");
  }

  return {
    body,
    buttonText,
    sections,
    header: params.header?.text ? { type: "text" as const, text: String(params.header.text).trim() } : undefined,
    footer: params.footer?.text ? { text: String(params.footer.text).trim() } : undefined,
  };
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
    });

  if (!continuityConnection) {
    throw new Error("Esta instancia esta bloqueada porque o numero pertence a outra conta ativa.");
  }

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

async function resolveConversationForInstance(connectionId: string, conversationId: string): Promise<Conversation> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation || conversation.connectionId !== connectionId) {
    throw new Error("Conversa nao encontrada para esta instancia");
  }
  return conversation;
}

async function resolveInstanceMessageRecord(
  connectionId: string,
  conversationId: string,
  messageId: string,
): Promise<Message> {
  await resolveConversationForInstance(connectionId, conversationId);

  const byWhatsAppId = await storage.getMessageByConversationAndMessageId(conversationId, messageId);
  if (byWhatsAppId) {
    return byWhatsAppId;
  }

  const byLocalId = await storage.getMessage(messageId);
  if (byLocalId?.conversationId === conversationId) {
    return byLocalId;
  }

  throw new Error("Mensagem nao encontrada para esta conversa");
}

async function resolveWhatsAppDestination(
  connection: WhatsappConnection,
  socket: any,
  to?: string | null,
): Promise<InstanceContactValidationPayload> {
  const digits = normalizeApiDestination(to);
  const candidates = buildBrazilReachablePhoneCandidates(to || digits);
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
        input: digits,
        exists: true,
        contactNumber: extractPhoneDigitsFromJid(remoteJid) || candidate,
        remoteJid,
        jidSuffix: extractJidSuffix(remoteJid),
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn("[INSTANCE API] Falha ao validar destino no WhatsApp:", lastError);
  }

  return {
    input: digits,
    exists: false,
    contactNumber: null,
    remoteJid: null,
    jidSuffix: null,
  };
}

export async function validateInstanceContact(
  connection: WhatsappConnection,
  to: string,
): Promise<InstanceContactValidationPayload> {
  const { connection: operationalConnection, socket } = await ensureOperationalSocket(
    connection,
    `validateInstanceContact:${connection.id}`,
  );
  return resolveWhatsAppDestination(operationalConnection, socket, to);
}

export async function validateInstanceContactsBatch(
  connection: WhatsappConnection,
  phoneNumbers: string[],
): Promise<InstanceContactValidationPayload[]> {
  const { connection: operationalConnection, socket } = await ensureOperationalSocket(
    connection,
    `validateInstanceContactsBatch:${connection.id}`,
  );

  const uniqueInputs = Array.from(
    new Set(phoneNumbers.map((item) => String(item || "").trim()).filter(Boolean)),
  );

  return Promise.all(
    uniqueInputs.map((phoneNumber) =>
      resolveWhatsAppDestination(operationalConnection, socket, phoneNumber),
    ),
  );
}

export async function getInstanceContactProfilePicture(
  connection: WhatsappConnection,
  to: string,
  pictureType: "preview" | "image" = "preview",
) {
  const { connection: operationalConnection, socket } = await ensureOperationalSocket(
    connection,
    `getInstanceContactProfilePicture:${connection.id}`,
  );
  const destination = await resolveWhatsAppDestination(operationalConnection, socket, to);

  if (!destination.exists || !destination.remoteJid) {
    return {
      success: false,
      exists: false,
      pictureUrl: null,
      contactNumber: destination.input,
      remoteJid: null,
    };
  }

  const pictureUrl = await socket.profilePictureUrl(destination.remoteJid, pictureType).catch(() => null);
  return {
    success: true,
    exists: true,
    pictureUrl: pictureUrl || null,
    contactNumber: destination.contactNumber,
    remoteJid: destination.remoteJid,
  };
}

export async function updateInstanceContactBlockStatus(
  connection: WhatsappConnection,
  to: string,
  action: "block" | "unblock",
) {
  const { connection: operationalConnection, socket } = await ensureOperationalSocket(
    connection,
    `updateInstanceContactBlockStatus:${connection.id}`,
  );
  const destination = await resolveWhatsAppDestination(operationalConnection, socket, to);

  if (!destination.exists || !destination.remoteJid) {
    throw new Error("Numero nao encontrado no WhatsApp");
  }

  await socket.updateBlockStatus(destination.remoteJid, action);
  return {
    success: true,
    action,
    contactNumber: destination.contactNumber,
    remoteJid: destination.remoteJid,
  };
}

export async function sendInstanceContactPresence(
  connection: WhatsappConnection,
  to: string,
  presence: "available" | "unavailable" | "composing" | "recording" | "paused",
) {
  const { connection: operationalConnection, socket } = await ensureOperationalSocket(
    connection,
    `sendInstanceContactPresence:${connection.id}`,
  );
  const destination = await resolveWhatsAppDestination(operationalConnection, socket, to);

  if (!destination.exists || !destination.remoteJid) {
    throw new Error("Numero nao encontrado no WhatsApp");
  }

  await socket.presenceSubscribe(destination.remoteJid).catch(() => undefined);
  await socket.sendPresenceUpdate(presence, destination.remoteJid);

  return {
    success: true,
    presence,
    contactNumber: destination.contactNumber,
    remoteJid: destination.remoteJid,
  };
}

function buildInstanceMessageMediaPayload(
  connection: WhatsappConnection,
  message: Message,
  options?: {
    redownloaded?: boolean;
  },
): InstanceMessageMediaPayload {
  const canRedownload =
    Boolean(message.mediaType) &&
    Boolean(message.mediaMimeType) &&
    Boolean(message.mediaKey) &&
    Boolean(message.directPath);

  return {
    success: true,
    instanceId: connection.id,
    conversationId: message.conversationId,
    messageId: message.messageId,
    localMessageId: message.id,
    mediaType: message.mediaType || null,
    mediaUrl: message.mediaUrl || null,
    mediaMimeType: message.mediaMimeType || null,
    mediaCaption: message.mediaCaption || null,
    canRedownload,
    redownloaded: options?.redownloaded === true,
  };
}

export async function getInstanceMessageMedia(
  connection: WhatsappConnection,
  conversationId: string,
  messageId: string,
): Promise<InstanceMessageMediaPayload> {
  const message = await resolveInstanceMessageRecord(connection.id, conversationId, messageId);
  if (!message.mediaType && !message.mediaUrl) {
    throw new Error("Mensagem nao possui midia");
  }

  return buildInstanceMessageMediaPayload(connection, message);
}

export async function redownloadInstanceMessageMedia(
  connection: WhatsappConnection,
  conversationId: string,
  messageId: string,
): Promise<InstanceMessageMediaPayload> {
  const message = await resolveInstanceMessageRecord(connection.id, conversationId, messageId);
  if (!message.mediaType) {
    throw new Error("Mensagem nao possui midia");
  }

  if (message.mediaUrl) {
    return buildInstanceMessageMediaPayload(connection, message);
  }

  if (!message.mediaKey || !message.directPath || !message.mediaMimeType) {
    throw new Error("Mensagem nao possui metadados suficientes para redownload");
  }

  const result = await redownloadMedia(
    connection.id,
    message.mediaKey,
    message.directPath,
    message.mediaUrlOriginal || undefined,
    message.mediaType,
    message.mediaMimeType,
  );

  if (!result.success || !result.mediaUrl) {
    throw new Error(result.error || "Nao foi possivel rebaixar a midia");
  }

  const updatedMessage = await storage.updateMessage(message.id, {
    mediaUrl: result.mediaUrl,
  });

  return buildInstanceMessageMediaPayload(connection, updatedMessage, {
    redownloaded: true,
  });
}

export async function getInstanceMessageQueue(
  connection: WhatsappConnection,
): Promise<InstanceQueuePayload> {
  const stats = messageQueueService.getUserStats(connection.userId);
  const queueStatus = messageQueueService.canSendNow(connection.userId);

  return {
    success: true,
    instanceId: connection.id,
    scope: "account_runtime_shared",
    ...stats,
    canSendNow: queueStatus.canSend,
    waitMs: queueStatus.waitMs,
    reason: queueStatus.reason || null,
  };
}

export async function clearInstanceMessageQueue(
  connection: WhatsappConnection,
): Promise<InstanceQueuePayload & { cleared: number; wasPending: boolean }> {
  const clearedState = messageQueueService.clearUserQueue(connection.userId);
  const queue = await getInstanceMessageQueue(connection);

  return {
    ...queue,
    cleared: clearedState.cleared,
    wasPending: clearedState.wasPending,
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

  const text = normalizeOutboundTextForCustomer(params.text);
  const sentMessage = await socket.sendMessage(
    destination.remoteJid,
    buildPlainTextWhatsAppPayload(text),
  );

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

export async function sendContactDirectViaInstance(params: SendContactViaInstanceParams) {
  const { connection, socket } = await ensureOperationalSocket(
    params.connection,
    `sendContactDirectViaInstance:${params.connection.id}`,
  );
  const destination = await resolveValidatedDirectDestination({
    connection,
    to: params.to,
    contactName: params.contactName,
    validateDestination: params.validateDestination,
  });

  const sentMessage = await socket.sendMessage(
    destination.remoteJid,
    buildContactCardPayload({
      phoneNumber: params.phoneNumber,
      displayName: params.displayName,
      organization: params.organization,
      email: params.email,
      url: params.url,
    }),
  );

  return {
    success: true,
    messageId: sentMessage?.key?.id || null,
    remoteJid: destination.remoteJid,
    contactNumber: destination.contactNumber,
    jidSuffix: destination.jidSuffix,
  };
}

export async function sendLocationDirectViaInstance(params: SendLocationViaInstanceParams) {
  const { connection, socket } = await ensureOperationalSocket(
    params.connection,
    `sendLocationDirectViaInstance:${params.connection.id}`,
  );
  const destination = await resolveValidatedDirectDestination({
    connection,
    to: params.to,
    contactName: params.contactName,
    validateDestination: params.validateDestination,
  });

  const sentMessage = await socket.sendMessage(
    destination.remoteJid,
    buildLocationPayload({
      latitude: params.latitude,
      longitude: params.longitude,
      name: params.name,
      address: params.address,
    }),
  );

  return {
    success: true,
    messageId: sentMessage?.key?.id || null,
    remoteJid: destination.remoteJid,
    contactNumber: destination.contactNumber,
    jidSuffix: destination.jidSuffix,
  };
}

export async function sendButtonsDirectViaInstance(params: SendButtonsViaInstanceParams) {
  const { connection, socket } = await ensureOperationalSocket(
    params.connection,
    `sendButtonsDirectViaInstance:${params.connection.id}`,
  );
  const destination = await resolveValidatedDirectDestination({
    connection,
    to: params.to,
    contactName: params.contactName,
    validateDestination: params.validateDestination,
  });

  const result = await centralizedMessageSender.sendButtons(
    connection.userId,
    destination.remoteJid,
    normalizeButtonsPayload(params),
    socket as any,
    "manual_admin",
    {
      connectionId: connection.id,
      isOwnerInitiated: true,
    },
  );

  return {
    success: result.success,
    messageId: result.messageId || null,
    remoteJid: destination.remoteJid,
    contactNumber: destination.contactNumber,
    jidSuffix: destination.jidSuffix,
    error: result.error || null,
  };
}

export async function sendListDirectViaInstance(params: SendListViaInstanceParams) {
  const { connection, socket } = await ensureOperationalSocket(
    params.connection,
    `sendListDirectViaInstance:${params.connection.id}`,
  );
  const destination = await resolveValidatedDirectDestination({
    connection,
    to: params.to,
    contactName: params.contactName,
    validateDestination: params.validateDestination,
  });

  const result = await centralizedMessageSender.sendList(
    connection.userId,
    destination.remoteJid,
    normalizeListPayload(params),
    socket as any,
    "manual_admin",
    {
      connectionId: connection.id,
      isOwnerInitiated: true,
    },
  );

  return {
    success: result.success,
    messageId: result.messageId || null,
    remoteJid: destination.remoteJid,
    contactNumber: destination.contactNumber,
    jidSuffix: destination.jidSuffix,
    error: result.error || null,
  };
}

export async function buildLocalInstanceStatus(
  connection: WhatsappConnection,
): Promise<InstanceStatusPayload> {
  const snapshot = computeLiveInstanceSnapshot(connection);
  const isConnected = snapshot.isConnected;
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
        : connection.providerStatus || snapshot.status,
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

function normalizeGroupParticipant(participant: any): InstanceGroupParticipantPayload {
  const id = String(participant?.id || "").trim();
  const phoneNumber = extractPhoneDigitsFromJid(id);
  const adminRole = String(participant?.admin || "").trim();

  return {
    id,
    phoneNumber,
    isAdmin: adminRole === "admin" || adminRole === "superadmin",
    isSuperAdmin: adminRole === "superadmin",
  };
}

function normalizeGroupParticipantTarget(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error("Participante invalido");
  }

  if (trimmed.includes("@")) {
    return trimmed;
  }

  const digits = normalizeApiDestination(trimmed);
  return buildWhatsAppJidFromPhone(digits) || `${digits}@s.whatsapp.net`;
}

function buildInstanceGroupDetailsPayload(
  connection: WhatsappConnection,
  groupId: string,
  metadata: any,
): InstanceGroupDetailsPayload {
  const participants = Array.isArray(metadata?.participants)
    ? metadata.participants.map(normalizeGroupParticipant).filter((participant) => participant.id)
    : [];
  const admins = participants.filter((participant) => participant.isAdmin).map((participant) => participant.id);

  return {
    success: true,
    instanceId: connection.id,
    groupId,
    name: String(metadata?.subject || "Grupo sem nome"),
    description: metadata?.desc ? String(metadata.desc) : null,
    owner: metadata?.owner ? String(metadata.owner) : null,
    createdAt: Number.isFinite(Number(metadata?.creation)) ? Number(metadata.creation) : null,
    announce: typeof metadata?.announce === "boolean" ? metadata.announce : null,
    restrict: typeof metadata?.restrict === "boolean" ? metadata.restrict : null,
    participantsCount: participants.length || Number(metadata?.size || 0),
    admins,
    participants,
  };
}

export async function getInstanceGroupDetails(
  connection: WhatsappConnection,
  groupId: string,
): Promise<InstanceGroupDetailsPayload> {
  const normalizedGroupId = String(groupId || "").trim();
  if (!normalizedGroupId.endsWith("@g.us")) {
    throw new Error("groupId invalido");
  }

  const { socket } = await ensureOperationalSocket(
    connection,
    `getInstanceGroupDetails:${connection.id}`,
  );

  const cachedMetadata = groupMetadataCache.get(normalizedGroupId);
  const metadata = cachedMetadata
    ? {
        id: cachedMetadata.id,
        subject: cachedMetadata.subject,
        participants: cachedMetadata.participants?.map((participantId) => ({
          id: participantId,
          admin: cachedMetadata.admins?.includes(participantId) ? "admin" : undefined,
        })),
      }
    : await socket.groupMetadata(normalizedGroupId);

  if (!cachedMetadata) {
    groupMetadataCache.set(normalizedGroupId, {
      id: normalizedGroupId,
      subject: String(metadata?.subject || "Grupo sem nome"),
      participants: Array.isArray(metadata?.participants)
        ? metadata.participants.map((participant: any) => String(participant?.id || "")).filter(Boolean)
        : [],
      admins: Array.isArray(metadata?.participants)
        ? metadata.participants
            .filter((participant: any) => participant?.admin === "admin" || participant?.admin === "superadmin")
            .map((participant: any) => String(participant?.id || ""))
            .filter(Boolean)
        : [],
    });
  }

  return buildInstanceGroupDetailsPayload(connection, normalizedGroupId, metadata);
}

export async function listInstanceGroupParticipants(
  connection: WhatsappConnection,
  groupId: string,
): Promise<{ success: true; instanceId: string; groupId: string; items: InstanceGroupParticipantPayload[] }> {
  const details = await getInstanceGroupDetails(connection, groupId);
  return {
    success: true,
    instanceId: connection.id,
    groupId: details.groupId,
    items: details.participants,
  };
}

export async function createInstanceGroup(
  connection: WhatsappConnection,
  subject: string,
  participants: string[],
): Promise<InstanceGroupDetailsPayload> {
  const trimmedSubject = String(subject || "").trim();
  if (!trimmedSubject) {
    throw new Error("subject is required");
  }

  const normalizedParticipants = Array.from(
    new Set(participants.map(normalizeGroupParticipantTarget)),
  );
  if (normalizedParticipants.length === 0) {
    throw new Error("participants is required");
  }

  const { socket } = await ensureOperationalSocket(
    connection,
    `createInstanceGroup:${connection.id}`,
  );
  const metadata = await socket.groupCreate(trimmedSubject, normalizedParticipants);
  const groupId = String(metadata?.id || "").trim();
  if (!groupId) {
    throw new Error("Nao foi possivel criar o grupo");
  }

  groupMetadataCache.set(groupId, {
    id: groupId,
    subject: String(metadata?.subject || trimmedSubject),
    participants: Array.isArray(metadata?.participants)
      ? metadata.participants.map((participant: any) => String(participant?.id || "")).filter(Boolean)
      : normalizedParticipants,
    admins: Array.isArray(metadata?.participants)
      ? metadata.participants
          .filter((participant: any) => participant?.admin === "admin" || participant?.admin === "superadmin")
          .map((participant: any) => String(participant?.id || ""))
          .filter(Boolean)
      : [],
  });

  return buildInstanceGroupDetailsPayload(connection, groupId, metadata);
}

export async function leaveInstanceGroup(
  connection: WhatsappConnection,
  groupId: string,
): Promise<{ success: true; instanceId: string; groupId: string }> {
  const details = await getInstanceGroupDetails(connection, groupId);
  const { socket } = await ensureOperationalSocket(
    connection,
    `leaveInstanceGroup:${connection.id}`,
  );
  await socket.groupLeave(details.groupId);
  groupMetadataCache.delete(details.groupId);

  return {
    success: true,
    instanceId: connection.id,
    groupId: details.groupId,
  };
}

export async function updateInstanceGroupSubject(
  connection: WhatsappConnection,
  groupId: string,
  subject: string,
): Promise<InstanceGroupDetailsPayload> {
  const details = await getInstanceGroupDetails(connection, groupId);
  const trimmedSubject = String(subject || "").trim();
  if (!trimmedSubject) {
    throw new Error("subject is required");
  }

  const { socket } = await ensureOperationalSocket(
    connection,
    `updateInstanceGroupSubject:${connection.id}`,
  );
  await socket.groupUpdateSubject(details.groupId, trimmedSubject);
  groupMetadataCache.delete(details.groupId);
  return getInstanceGroupDetails(connection, details.groupId);
}

export async function updateInstanceGroupDescription(
  connection: WhatsappConnection,
  groupId: string,
  description?: string | null,
): Promise<InstanceGroupDetailsPayload> {
  const details = await getInstanceGroupDetails(connection, groupId);
  const { socket } = await ensureOperationalSocket(
    connection,
    `updateInstanceGroupDescription:${connection.id}`,
  );
  await socket.groupUpdateDescription(details.groupId, String(description || "").trim() || undefined);
  groupMetadataCache.delete(details.groupId);
  return getInstanceGroupDetails(connection, details.groupId);
}

export async function updateInstanceGroupParticipants(
  connection: WhatsappConnection,
  groupId: string,
  participants: string[],
  action: "add" | "remove" | "promote" | "demote",
): Promise<InstanceGroupParticipantUpdatePayload> {
  const details = await getInstanceGroupDetails(connection, groupId);
  const normalizedParticipants = Array.from(
    new Set(participants.map(normalizeGroupParticipantTarget)),
  );
  if (normalizedParticipants.length === 0) {
    throw new Error("participants is required");
  }

  const { socket } = await ensureOperationalSocket(
    connection,
    `updateInstanceGroupParticipants:${connection.id}`,
  );
  const updates = await socket.groupParticipantsUpdate(details.groupId, normalizedParticipants, action);
  groupMetadataCache.delete(details.groupId);

  return {
    success: true,
    instanceId: connection.id,
    groupId: details.groupId,
    action,
    items: Array.isArray(updates)
      ? updates.map((item: any) => ({
          jid: item?.jid ? String(item.jid) : null,
          status: String(item?.status || "unknown"),
        }))
      : [],
  };
}

export async function getInstanceGroupInviteCode(
  connection: WhatsappConnection,
  groupId: string,
): Promise<{ success: true; instanceId: string; groupId: string; inviteCode: string | null }> {
  const details = await getInstanceGroupDetails(connection, groupId);
  const { socket } = await ensureOperationalSocket(
    connection,
    `getInstanceGroupInviteCode:${connection.id}`,
  );
  const inviteCode = await socket.groupInviteCode(details.groupId);

  return {
    success: true,
    instanceId: connection.id,
    groupId: details.groupId,
    inviteCode: inviteCode ? String(inviteCode) : null,
  };
}

export async function revokeInstanceGroupInviteCode(
  connection: WhatsappConnection,
  groupId: string,
): Promise<{ success: true; instanceId: string; groupId: string; inviteCode: string | null }> {
  const details = await getInstanceGroupDetails(connection, groupId);
  const { socket } = await ensureOperationalSocket(
    connection,
    `revokeInstanceGroupInviteCode:${connection.id}`,
  );
  const inviteCode = await socket.groupRevokeInvite(details.groupId);

  return {
    success: true,
    instanceId: connection.id,
    groupId: details.groupId,
    inviteCode: inviteCode ? String(inviteCode) : null,
  };
}

export async function joinInstanceGroupByInvite(
  connection: WhatsappConnection,
  inviteCode: string,
): Promise<{ success: true; instanceId: string; groupId: string | null }> {
  const trimmedCode = String(inviteCode || "").trim();
  if (!trimmedCode) {
    throw new Error("inviteCode is required");
  }

  const { socket } = await ensureOperationalSocket(
    connection,
    `joinInstanceGroupByInvite:${connection.id}`,
  );
  const groupId = await socket.groupAcceptInvite(trimmedCode);

  return {
    success: true,
    instanceId: connection.id,
    groupId: groupId ? String(groupId) : null,
  };
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
    });
  if (!continuityConnection) {
    throw new Error("Esta instancia esta bloqueada porque o numero pertence a outra conta ativa.");
  }
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

  const result = await sendMessage(params.connection.userId, conversation.id, normalizeOutboundTextForCustomer(params.text), {
    source: params.source || (params.isFromAgent ? "agent" : "system"),
    isFromAgent: params.isFromAgent === true,
  });

  return {
    success: result.success,
    messageId: result.messageId || null,
    conversationId: conversation.id,
    remoteJid: conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
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
    ptt: params.ptt,
    seconds: params.seconds ?? undefined,
  }, {
    isFromAgent: true,
    yieldQueue: true,
    skipAutoPause: true,
  });

  return {
    success: true,
    conversationId: conversation.id,
    messageId: result?.messageId || null,
    remoteJid: conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
  };
}

export async function sendContactViaInstance(params: SendContactViaInstanceParams) {
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

  const { socket } = await ensureOperationalSocket(
    params.connection,
    `sendContactViaInstance:${params.connection.id}`,
  );
  const sentMessage = await socket.sendMessage(
    conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
    buildContactCardPayload({
      phoneNumber: params.phoneNumber,
      displayName: params.displayName,
      organization: params.organization,
      email: params.email,
      url: params.url,
    }),
  );

  return {
    success: true,
    conversationId: conversation.id,
    messageId: sentMessage?.key?.id || null,
    remoteJid: conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
  };
}

export async function sendLocationViaInstance(params: SendLocationViaInstanceParams) {
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

  const { socket } = await ensureOperationalSocket(
    params.connection,
    `sendLocationViaInstance:${params.connection.id}`,
  );
  const sentMessage = await socket.sendMessage(
    conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
    buildLocationPayload({
      latitude: params.latitude,
      longitude: params.longitude,
      name: params.name,
      address: params.address,
    }),
  );

  return {
    success: true,
    conversationId: conversation.id,
    messageId: sentMessage?.key?.id || null,
    remoteJid: conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
  };
}

export async function sendButtonsViaInstance(params: SendButtonsViaInstanceParams) {
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

  const { socket } = await ensureOperationalSocket(
    params.connection,
    `sendButtonsViaInstance:${params.connection.id}`,
  );
  const result = await centralizedMessageSender.sendButtons(
    params.connection.userId,
    conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
    normalizeButtonsPayload(params),
    socket as any,
    "manual_admin",
    {
      conversationId: conversation.id,
      connectionId: params.connection.id,
      isOwnerInitiated: true,
    },
  );

  return {
    success: result.success,
    conversationId: conversation.id,
    messageId: result.messageId || null,
    remoteJid: conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
    error: result.error || null,
  };
}

export async function sendListViaInstance(params: SendListViaInstanceParams) {
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

  const { socket } = await ensureOperationalSocket(
    params.connection,
    `sendListViaInstance:${params.connection.id}`,
  );
  const result = await centralizedMessageSender.sendList(
    params.connection.userId,
    conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
    normalizeListPayload(params),
    socket as any,
    "manual_admin",
    {
      conversationId: conversation.id,
      connectionId: params.connection.id,
      isOwnerInitiated: true,
    },
  );

  return {
    success: result.success,
    conversationId: conversation.id,
    messageId: result.messageId || null,
    remoteJid: conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber),
    error: result.error || null,
  };
}

export async function sendReactionViaInstance(params: SendReactionViaInstanceParams) {
  const targetMessage = params.conversationId
    ? await resolveInstanceMessageRecord(params.connection.id, params.conversationId, params.messageId)
    : await storage.getMessageByMessageId(params.messageId);

  if (!targetMessage) {
    throw new Error("Mensagem alvo nao encontrada");
  }

  const conversation = await resolveConversationForInstance(
    params.connection.id,
    targetMessage.conversationId,
  );
  const { connection, socket } = await ensureOperationalSocket(
    params.connection,
    `sendReactionViaInstance:${params.connection.id}`,
  );

  const remoteJid = conversation.remoteJid || buildWhatsAppJidFromPhone(conversation.contactNumber);
  const sentMessage = await socket.sendMessage(remoteJid, {
    react: {
      text: String(params.emoji || "").trim(),
      key: {
        id: targetMessage.messageId,
        remoteJid,
        fromMe: targetMessage.fromMe,
      },
    },
  });

  return {
    success: true,
    conversationId: conversation.id,
    targetMessageId: targetMessage.messageId,
    messageId: sentMessage?.key?.id || null,
    remoteJid,
    instanceId: connection.id,
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
