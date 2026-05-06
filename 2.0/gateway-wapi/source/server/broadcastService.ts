import { and, asc, desc, eq, inArray, like } from "drizzle-orm";

import { broadcastCampaigns, whatsappConnections } from "../shared/schema";
import type { WhatsappConnection } from "../shared/schema";
import { db } from "./db";
import { prepareOutgoingMediaForSend } from "./outgoingMediaPersistence";
import { storage } from "./storage";
import {
  ensureUserSessionOperational,
  getSession,
  sendMessage as sendConversationMessage,
  sendUserMediaMessage,
} from "./whatsapp";
import { sendGatewayInstanceMedia, sendGatewayInstanceText } from "./whatsappGatewayClient";
import { resolveWhatsAppConnectionOwner, isWhatsAppGatewayRuntime } from "./whatsappGatewayOwnership";
import { isOfficialCoexistenceConnection } from "./whatsappCoexistence";

const BROADCAST_MIN_DELAY_MS = 60_000;
const BROADCAST_MAX_DELAY_MS = 300_000;
const BROADCAST_BATCH_SIZE = 10;
const BROADCAST_BATCH_PAUSE_MIN_MS = 900_000;
const BROADCAST_BATCH_PAUSE_MAX_MS = 1_200_000;
const BROADCAST_RECOVERY_INTERVAL_MS = 60_000;
const LEGACY_BROADCAST_MEDIA_MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const LEGACY_BROADCAST_MEDIA_BATCH_SIZE = 10;
const LEGACY_BROADCAST_MEDIA_MAX_BOOT_ROUNDS = 5;
const SOCKET_WAIT_TIMEOUT_MS = 300_000;
const SOCKET_POLL_INTERVAL_MS = 30_000;
const CANCELLATION_CHECK_INTERVAL_MS = 1_000;
const BRAZIL_UTC_OFFSET = "-03:00";
const ACTIVE_BROADCAST_STATUSES = ["pending", "running", "scheduled"] as const;
const LEGACY_BROADCAST_MEDIA_FINAL_STATUSES = ["completed", "cancelled", "error"] as const;
const BROADCAST_CONNECTION_MODES = ["single", "rotate"] as const;

type CampaignContact = {
  id?: string;
  phone: string;
  name?: string;
  sequenceIndex?: number;
};

type CampaignResult = {
  contactId?: string;
  phone: string;
  name: string;
  status: "sent" | "failed";
  error?: string;
  sentAt?: string;
  message?: string;
  messageId?: string | null;
  remoteJid?: string | null;
};

type MediaType = "image" | "video" | "audio" | "document";

type CreateCampaignPayload = {
  contacts: CampaignContact[];
  messageTemplate: string;
  useAi?: boolean;
  mediaUrl?: string;
  mediaType?: MediaType | string;
  connectionId?: string;
  connectionMode?: BroadcastConnectionMode;
  rotationConnectionIds?: string[];
  strictConnectionSelection?: boolean;
  name?: string;
  campaignType?: string;
  metadataJson?: Record<string, unknown>;
  delayMinMs?: number;
  delayMaxMs?: number;
  scheduledAt?: string | Date | null;
};

type BroadcastTaskTrigger = "create" | "recovery-loop" | "boot" | "manual";
type BroadcastConnectionMode = (typeof BROADCAST_CONNECTION_MODES)[number];
type BroadcastSocketResolution = {
  connection: WhatsappConnection | null;
  connectionId: string | null;
  socket: any;
  useConversationApi: boolean;
};

type PreparedBroadcastMediaSource = {
  mediaType: MediaType;
  mediaUrl: string;
  mimeType: string;
  buffer: Buffer;
};

const activeBroadcastTasks = new Map<string, Promise<void>>();
const activeBroadcastCancels = new Map<string, { requested: boolean }>();
let broadcastRecoveryLoop: NodeJS.Timeout | null = null;
let legacyBroadcastMediaMaintenanceLoop: NodeJS.Timeout | null = null;

export const broadcastServiceDeps = {
  ensureUserSessionOperational,
};

export function isConnectionMarkedActiveForBroadcast(
  connection: Pick<WhatsappConnection, "isConnected" | "providerStatus">,
): boolean {
  const providerStatus = String(connection.providerStatus || "").trim().toLowerCase();
  return !!connection.isConnected || providerStatus === "connected";
}

export async function resolveBaileysBroadcastSocket(
  userId: string,
  connectionId: string,
  source = "broadcast:dispatch",
) {
  const session = await broadcastServiceDeps.ensureUserSessionOperational(userId, connectionId, {
    waitMs: 10_000,
    source,
  });

  return session?.socket || null;
}

function clampDelayMin(delayMinMs?: number) {
  return Math.max(BROADCAST_MIN_DELAY_MS, Number(delayMinMs || 0));
}

function clampDelayMax(delayMaxMs?: number, delayMinMs?: number) {
  const min = clampDelayMin(delayMinMs);
  return Math.max(BROADCAST_MAX_DELAY_MS, Number(delayMaxMs || 0), min);
}

function normalizeBroadcastConnectionMode(mode?: string | null): BroadcastConnectionMode {
  return mode === "rotate" ? "rotate" : "single";
}

function normalizeConnectionId(value?: string | null) {
  return String(value || "").trim();
}

function normalizeConnectionIdList(connectionIds?: string[] | null) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawConnectionId of Array.isArray(connectionIds) ? connectionIds : []) {
    const connectionId = normalizeConnectionId(rawConnectionId);
    if (!connectionId || seen.has(connectionId)) {
      continue;
    }

    seen.add(connectionId);
    normalized.push(connectionId);
  }

  return normalized;
}

function readRotationConnectionIds(metadataJson: unknown) {
  const metadata = (metadataJson || {}) as Record<string, unknown>;
  return normalizeConnectionIdList(
    Array.isArray(metadata.rotationConnectionIds)
      ? metadata.rotationConnectionIds.map((connectionId) => String(connectionId || ""))
      : [],
  );
}

function isRotationalBroadcastCampaign(campaign: { metadataJson?: unknown }) {
  const metadata = (campaign.metadataJson || {}) as Record<string, unknown>;
  return metadata.connectionMode === "rotate" && readRotationConnectionIds(metadata).length > 1;
}

export function selectBroadcastConnectionIdForContact(
  rotationConnectionIds: string[],
  fallbackConnectionId?: string | null,
  contactIndex = 0,
) {
  const normalizedRotationIds = normalizeConnectionIdList(rotationConnectionIds);
  if (normalizedRotationIds.length > 1) {
    const safeIndex = Math.max(0, Math.floor(Number(contactIndex) || 0));
    return normalizedRotationIds[safeIndex % normalizedRotationIds.length];
  }

  return normalizeConnectionId(fallbackConnectionId) || null;
}

async function resolveBroadcastConnectionSelection(
  userId: string,
  payload: CreateCampaignPayload,
  baseMetadata: Record<string, unknown>,
) {
  const requestedMode = normalizeBroadcastConnectionMode(payload.connectionMode);
  const requestedConnectionId = normalizeConnectionId(payload.connectionId);

  if (requestedMode === "rotate") {
    const requestedRotationIds = normalizeConnectionIdList(payload.rotationConnectionIds);
    if (requestedRotationIds.length < 2) {
      throw new Error("Selecione pelo menos duas conexoes conectadas para o modo rotacional");
    }

    const availableConnections = await db
      .select({
        id: whatsappConnections.id,
        isConnected: whatsappConnections.isConnected,
        providerStatus: whatsappConnections.providerStatus,
      })
      .from(whatsappConnections)
      .where(
        and(
          eq(whatsappConnections.userId, userId),
          inArray(whatsappConnections.id, requestedRotationIds),
        ),
      )
      .orderBy(desc(whatsappConnections.updatedAt));

    const activeById = new Set(
      availableConnections
        .filter((connection) => isConnectionMarkedActiveForBroadcast(connection))
        .map((connection) => connection.id),
    );
    const rotationConnectionIds = requestedRotationIds.filter((connectionId) => activeById.has(connectionId));

    if (rotationConnectionIds.length < 2) {
      throw new Error("O modo rotacional precisa de pelo menos duas conexoes conectadas");
    }

    return {
      connectionId: rotationConnectionIds[0],
      metadataJson: {
        ...baseMetadata,
        connectionMode: "rotate",
        rotationConnectionIds,
        rotationStrategy: "round_robin",
      },
    };
  }

  if (payload.strictConnectionSelection && requestedConnectionId) {
    const [selectedConnection] = await db
      .select({
        id: whatsappConnections.id,
        isConnected: whatsappConnections.isConnected,
        providerStatus: whatsappConnections.providerStatus,
      })
      .from(whatsappConnections)
      .where(
        and(
          eq(whatsappConnections.id, requestedConnectionId),
          eq(whatsappConnections.userId, userId),
        ),
      )
      .limit(1);

    if (!selectedConnection || !isConnectionMarkedActiveForBroadcast(selectedConnection)) {
      throw new Error("A conexao escolhida nao esta conectada ou nao pertence a este cliente");
    }
  }

  return {
    connectionId: requestedConnectionId || null,
    metadataJson: {
      ...baseMetadata,
      connectionMode: "single",
      rotationConnectionIds: [],
      rotationStrategy: null,
    },
  };
}

function applyTemplate(template: string, name?: string) {
  const safeName = String(name || "Cliente").trim() || "Cliente";
  return template.replace(/\[nome\]/gi, safeName);
}

function formatPhoneToJid(phone: string) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (!cleanPhone) {
    throw new Error("Numero de telefone invalido");
  }

  let formattedPhone = cleanPhone;
  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    formattedPhone = `55${cleanPhone}`;
  }

  return `${formattedPhone}@s.whatsapp.net`;
}

function normalizePhone(phone: string) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (!cleanPhone) {
    throw new Error("Numero de telefone invalido");
  }

  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    return `55${cleanPhone}`;
  }

  return cleanPhone;
}

function buildBroadcastPhoneCandidates(phone: string) {
  const normalizedPhone = normalizePhone(phone);
  const candidates = new Set<string>([normalizedPhone]);

  if (normalizedPhone.startsWith("55")) {
    const localPhone = normalizedPhone.slice(2);
    candidates.add(localPhone);

    if (normalizedPhone.length === 13 && normalizedPhone[4] === "9") {
      candidates.add(`${normalizedPhone.slice(0, 4)}${normalizedPhone.slice(5)}`);
    }

    if (normalizedPhone.length === 12) {
      candidates.add(`${normalizedPhone.slice(0, 4)}9${normalizedPhone.slice(4)}`);
    }
  }

  return Array.from(candidates).filter(Boolean);
}

async function resolveReachableBroadcastJid(socket: any, phone: string) {
  if (!socket?.onWhatsApp) {
    return formatPhoneToJid(phone);
  }

  const candidates = buildBroadcastPhoneCandidates(phone);
  for (const candidate of candidates) {
    const [result] = await withBroadcastTimeout(
      socket.onWhatsApp(candidate),
      20_000,
      `Validacao WhatsApp ${candidate}`,
    );
    if (result?.exists && result?.jid) {
      return result.jid;
    }
  }

  throw new Error(`Numero nao encontrado no WhatsApp: ${normalizePhone(phone)}`);
}

async function withBroadcastTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
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

function dedupeCampaignContacts(contacts: CampaignContact[]) {
  const unique = new Map<string, CampaignContact>();

  for (const contact of contacts) {
    const normalizedPhone = normalizePhone(contact.phone);
    const existing = unique.get(normalizedPhone);
    const normalizedName = String(contact.name || "").trim();

    if (!existing) {
      unique.set(normalizedPhone, {
        ...contact,
        phone: normalizedPhone,
        name: normalizedName || "Cliente",
      });
      continue;
    }

    if ((!existing.name || existing.name === "Cliente") && normalizedName) {
      unique.set(normalizedPhone, {
        ...existing,
        name: normalizedName,
      });
    }
  }

  return Array.from(unique.values());
}

function getJidSuffix(jid: string) {
  return jid.split("@")[1]?.split(":")[0] || "s.whatsapp.net";
}

function getMediaFallbackText(mediaType?: string | null) {
  switch (mediaType) {
    case "image":
      return "[Imagem enviada]";
    case "video":
      return "[Video enviado]";
    case "audio":
      return "[Audio enviado]";
    case "document":
      return "[Documento enviado]";
    default:
      return "[Mensagem enviada]";
  }
}

function getPersistedMessageText(messageText: string, mediaType?: string | null) {
  const trimmed = messageText.trim();
  if (trimmed) {
    return trimmed;
  }

  return getMediaFallbackText(mediaType);
}

function getConversationPreviewText(messageText: string, mediaType?: string | null) {
  const trimmed = messageText.trim();
  if (trimmed) {
    return trimmed;
  }

  return mediaType ? getMediaFallbackText(mediaType).replace("enviado", "").trim() : "[Mensagem]";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneScheduledDate(value: Date) {
  return new Date(value.getTime());
}

function normalizeScheduledAtInput(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (!trimmed.includes("T") && trimmed.includes(" ")) {
    return trimmed.replace(" ", "T");
  }

  return trimmed;
}

function hasExplicitTimeZone(value: string) {
  if (!value) {
    return false;
  }

  if (value.endsWith("Z") || value.endsWith("z")) {
    return true;
  }

  const timeIndex = value.indexOf("T");
  if (timeIndex < 0) {
    return false;
  }

  const tail = value.slice(timeIndex + 1);
  const plusIndex = tail.lastIndexOf("+");
  const minusIndex = tail.lastIndexOf("-");
  const offsetIndex = Math.max(plusIndex, minusIndex);

  if (offsetIndex < 0) {
    return false;
  }

  const offset = tail.slice(offsetIndex);
  return offset.length === 6 && offset[3] === ":";
}

export function parseBroadcastScheduledAt(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? cloneScheduledDate(value) : null;
  }

  const normalized = normalizeScheduledAtInput(value);
  if (!normalized) {
    return null;
  }

  let candidate = normalized;
  const timeIndex = candidate.indexOf("T");
  if (timeIndex >= 0) {
    const tail = candidate.slice(timeIndex + 1);
    const segments = tail.split(":");
    if (segments.length === 2) {
      candidate = `${candidate}:00`;
    }
  }

  if (!hasExplicitTimeZone(candidate) && candidate.includes("T")) {
    candidate = `${candidate}${BRAZIL_UTC_OFFSET}`;
  }

  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function isBroadcastScheduledForFuture(
  scheduledAt?: string | Date | null,
  reference = new Date(),
) {
  const scheduled = parseBroadcastScheduledAt(scheduledAt);
  return Boolean(scheduled && scheduled.getTime() > reference.getTime());
}

function buildCampaignEntityKey(contactId?: string | null, phone?: string | null) {
  const trimmedId = String(contactId || "").trim();
  if (trimmedId) {
    return `id:${trimmedId}`;
  }

  const trimmedPhone = String(phone || "").trim();
  if (!trimmedPhone) {
    return null;
  }

  try {
    return `phone:${normalizePhone(trimmedPhone)}`;
  } catch {
    return `phone:${trimmedPhone}`;
  }
}

export function buildBroadcastResumeState(
  contacts: CampaignContact[],
  persistedResults?: CampaignResult[] | null,
) {
  const safeResults = Array.isArray(persistedResults) ? [...persistedResults] : [];
  const processedKeys = new Set<string>();
  let sentCount = 0;
  let failedCount = 0;

  for (const result of safeResults) {
    const key = buildCampaignEntityKey(result.contactId, result.phone);
    if (key) {
      processedKeys.add(key);
    }

    if (result.status === "sent") {
      sentCount += 1;
      continue;
    }

    if (result.status === "failed") {
      failedCount += 1;
    }
  }

  const pendingContacts = contacts
    .map((contact, index) => ({
      ...contact,
      sequenceIndex: typeof contact.sequenceIndex === "number" ? contact.sequenceIndex : index,
    }))
    .filter((contact) => {
    const key = buildCampaignEntityKey(contact.id, contact.phone);
    return key ? !processedKeys.has(key) : true;
    });

  return {
    results: safeResults,
    sentCount,
    failedCount,
    pendingContacts,
  };
}

function getBroadcastCancelState(campaignId: string) {
  const existing = activeBroadcastCancels.get(campaignId);
  if (existing) {
    return existing;
  }

  const state = { requested: false };
  activeBroadcastCancels.set(campaignId, state);
  return state;
}

function requestBroadcastCancellation(campaignId: string) {
  getBroadcastCancelState(campaignId).requested = true;
}

function isBroadcastCancellationRequested(campaignId: string) {
  return activeBroadcastCancels.get(campaignId)?.requested === true;
}

async function waitForCampaignDelay(campaignId: string, durationMs: number) {
  let remaining = Math.max(0, Math.floor(durationMs));

  while (remaining > 0) {
    if (isBroadcastCancellationRequested(campaignId)) {
      return false;
    }

    const chunk = Math.min(CANCELLATION_CHECK_INTERVAL_MS, remaining);
    await sleep(chunk);
    remaining -= chunk;
  }

  return !isBroadcastCancellationRequested(campaignId);
}

async function sleepRange(campaignId: string, minMs: number, maxMs: number) {
  const delay = minMs >= maxMs ? minMs : Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return waitForCampaignDelay(campaignId, delay);
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function guessMimeTypeFromUrl(url: string, mediaType: MediaType) {
  const lowerUrl = url.toLowerCase();

  if (mediaType === "image") {
    if (lowerUrl.endsWith(".png")) return "image/png";
    if (lowerUrl.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  if (mediaType === "video") {
    if (lowerUrl.endsWith(".webm")) return "video/webm";
    if (lowerUrl.endsWith(".mov")) return "video/quicktime";
    return "video/mp4";
  }

  if (mediaType === "audio") {
    if (lowerUrl.endsWith(".mp3")) return "audio/mpeg";
    if (lowerUrl.endsWith(".wav")) return "audio/wav";
    if (lowerUrl.endsWith(".m4a")) return "audio/mp4";
    return "audio/ogg; codecs=opus";
  }

  if (lowerUrl.endsWith(".pdf")) return "application/pdf";
  if (lowerUrl.endsWith(".doc")) return "application/msword";
  if (lowerUrl.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lowerUrl.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  return "application/octet-stream";
}

function normalizeMediaType(mediaType?: string | null): MediaType | null {
  if (mediaType === "image" || mediaType === "video" || mediaType === "audio" || mediaType === "document") {
    return mediaType;
  }

  return null;
}

function isRemoteMediaUrl(mediaUrl: string) {
  return mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://");
}

function isDataUrlMedia(mediaUrl?: string | null) {
  return String(mediaUrl || "").trim().startsWith("data:");
}

async function persistBroadcastMediaUrlIfNeeded(params: {
  userId: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
}) {
  const normalizedMediaType = normalizeMediaType(params.mediaType);
  const trimmedMediaUrl = String(params.mediaUrl || "").trim();

  if (!trimmedMediaUrl || !normalizedMediaType) {
    return {
      mediaType: normalizedMediaType,
      mediaUrl: trimmedMediaUrl || null,
    };
  }

  if (isRemoteMediaUrl(trimmedMediaUrl)) {
    return {
      mediaType: normalizedMediaType,
      mediaUrl: trimmedMediaUrl,
    };
  }

  const parsedDataUrl = parseDataUrl(trimmedMediaUrl);
  const mimeType = parsedDataUrl?.mimeType || guessMimeTypeFromUrl(trimmedMediaUrl, normalizedMediaType);
  const { persistedMediaUrl } = await prepareOutgoingMediaForSend({
    mediaData: trimmedMediaUrl,
    mimeType,
    ownerId: params.userId,
  });

  return {
    mediaType: normalizedMediaType,
    mediaUrl: String(persistedMediaUrl || trimmedMediaUrl).trim() || null,
  };
}

async function normalizeLegacyBroadcastCampaignMediaBatch(source: "boot" | "interval") {
  const campaigns = await db
    .select({
      id: broadcastCampaigns.id,
      userId: broadcastCampaigns.userId,
      mediaUrl: broadcastCampaigns.mediaUrl,
      mediaType: broadcastCampaigns.mediaType,
      status: broadcastCampaigns.status,
    })
    .from(broadcastCampaigns)
    .where(
      and(
        inArray(broadcastCampaigns.status, [...LEGACY_BROADCAST_MEDIA_FINAL_STATUSES]),
        like(broadcastCampaigns.mediaUrl, "data:%"),
      ),
    )
    .orderBy(asc(broadcastCampaigns.createdAt))
    .limit(LEGACY_BROADCAST_MEDIA_BATCH_SIZE);

  if (campaigns.length === 0) {
    return 0;
  }

  let normalizedCount = 0;

  for (const campaign of campaigns) {
    if (!isDataUrlMedia(campaign.mediaUrl)) {
      continue;
    }

    try {
      const normalized = await persistBroadcastMediaUrlIfNeeded({
        userId: campaign.userId,
        mediaUrl: campaign.mediaUrl,
        mediaType: campaign.mediaType,
      });

      if (!normalized.mediaUrl || normalized.mediaUrl === campaign.mediaUrl) {
        continue;
      }

      await db
        .update(broadcastCampaigns)
        .set(({
          mediaUrl: normalized.mediaUrl,
          mediaType: normalized.mediaType,
          updatedAt: new Date(),
        } as unknown) as any)
        .where(eq(broadcastCampaigns.id, campaign.id));

      normalizedCount += 1;
    } catch (error) {
      console.warn(
        `[BROADCAST ${campaign.id}] Falha ao normalizar media legada da campanha. source=${source} status=${campaign.status}`,
        error,
      );
    }
  }

  if (normalizedCount > 0) {
    console.log(
      `[BROADCAST] Midia legada de campanhas normalizada. source=${source} normalized=${normalizedCount}/${campaigns.length}`,
    );
  }

  return normalizedCount;
}

async function runLegacyBroadcastCampaignMediaMaintenance(source: "boot" | "interval") {
  const maxRounds = source === "boot" ? LEGACY_BROADCAST_MEDIA_MAX_BOOT_ROUNDS : 1;

  for (let round = 0; round < maxRounds; round += 1) {
    const normalizedCount = await normalizeLegacyBroadcastCampaignMediaBatch(source);
    if (normalizedCount < LEGACY_BROADCAST_MEDIA_BATCH_SIZE) {
      return;
    }

    await sleep(1_000);
  }
}

async function prepareCampaignMediaSource(params: {
  userId: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
}): Promise<PreparedBroadcastMediaSource | null> {
  const normalized = await persistBroadcastMediaUrlIfNeeded(params);

  if (!normalized.mediaUrl || !normalized.mediaType) {
    return null;
  }

  const resolved = await resolveMediaSource(normalized.mediaUrl, normalized.mediaType);
  return {
    mediaType: normalized.mediaType,
    mediaUrl: normalized.mediaUrl,
    mimeType: resolved.mimeType,
    buffer: resolved.buffer,
  };
}

function buildMessageContentFromPreparedMedia(
  messageText: string,
  preparedMedia: PreparedBroadcastMediaSource | null,
) {
  if (!preparedMedia) {
    return { text: messageText };
  }

  const caption = messageText.trim() || undefined;

  switch (preparedMedia.mediaType) {
    case "image":
      return {
        image: preparedMedia.buffer,
        mimetype: preparedMedia.mimeType || "image/jpeg",
        caption,
      };
    case "video":
      return {
        video: preparedMedia.buffer,
        mimetype: preparedMedia.mimeType || "video/mp4",
        caption,
      };
    case "audio":
      return {
        audio: preparedMedia.buffer,
        mimetype: preparedMedia.mimeType || "audio/ogg; codecs=opus",
        ptt: false,
      };
    case "document":
      return {
        document: preparedMedia.buffer,
        mimetype: preparedMedia.mimeType || "application/octet-stream",
        fileName: `broadcast-${Date.now()}`,
        caption,
      };
  }
}

async function resolveMediaSource(mediaUrl: string, mediaType: MediaType) {
  const parsed = parseDataUrl(mediaUrl);
  if (parsed) {
    return parsed;
  }

  if (/^https?:\/\//i.test(mediaUrl)) {
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error(`Falha ao baixar midia: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      mimeType: response.headers.get("content-type") || guessMimeTypeFromUrl(mediaUrl, mediaType),
      buffer: Buffer.from(arrayBuffer),
    };
  }

  return {
    mimeType: guessMimeTypeFromUrl(mediaUrl, mediaType),
    buffer: Buffer.from(mediaUrl, "base64"),
  };
}

function applyAiVariation(message: string, index: number) {
  const synonyms: Record<string, string[]> = {
    "ola": ["oi", "e ai", "hey"],
    "oi": ["ola", "e ai", "hey"],
    "tudo bem": ["como vai", "tudo certo", "tudo ok"],
    "obrigado": ["valeu", "agradeco", "muito obrigado"],
    "obrigada": ["valeu", "agradeco", "muito obrigada"],
    "gostaria": ["queria", "preciso", "adoraria"],
    "pode": ["consegue", "poderia", "daria para"],
    "produto": ["item", "artigo", "oferta"],
    "servico": ["atendimento", "solucao", "suporte"],
    "desconto": ["promocao", "oferta especial", "vantagem"],
  };

  const prefixes = ["", "", "", "Oi, ", "Hey, "];
  const suffixes = ["", "", ".", "!", " Abraco!"];

  let varied = message;
  let replacements = 0;
  const maxReplacements = Math.floor(Math.random() * 2) + 1;

  for (const [source, targets] of Object.entries(synonyms)) {
    if (replacements >= maxReplacements) {
      break;
    }

    const regex = new RegExp(`\\b${source}\\b`, "i");
    if (regex.test(varied)) {
      const replacement = targets[Math.floor(Math.random() * targets.length)];
      varied = varied.replace(regex, replacement);
      replacements += 1;
    }
  }

  const prefix = prefixes[index % prefixes.length];
  const suffix = suffixes[(index + 1) % suffixes.length];

  if (prefix && !varied.startsWith(prefix)) {
    varied = `${prefix}${varied}`;
  }

  if (suffix && !varied.endsWith(suffix)) {
    varied = varied.replace(/[.!?]+$/g, "");
    varied = `${varied}${suffix}`;
  }

  return varied;
}

async function resolveActiveConnection(
  userId: string,
  preferredConnectionId?: string | null,
  options?: { strictPreferred?: boolean },
) {
  const availableConnections = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.userId, userId))
    .orderBy(desc(whatsappConnections.updatedAt))
    .limit(20);

  const activeConnections = availableConnections.filter((connection) =>
    isConnectionMarkedActiveForBroadcast(connection),
  );

  if (preferredConnectionId) {
    const specificConnection =
      activeConnections.find((connection) => connection.id === preferredConnectionId) || null;

    if (specificConnection) {
      return specificConnection;
    }

    if (options?.strictPreferred) {
      return null;
    }
  }

  const primaryConnected =
    activeConnections.find((connection) => connection.isPrimary) || null;

  if (primaryConnected) {
    return primaryConnected;
  }

  return activeConnections[0] || null;
}

async function resolveSocket(
  userId: string,
  preferredConnectionId?: string | null,
  options?: { strictPreferred?: boolean },
): Promise<BroadcastSocketResolution> {
  const connection = await resolveActiveConnection(userId, preferredConnectionId, options);
  if (!connection) {
    return { connection: null, connectionId: null, socket: null, useConversationApi: false };
  }

  const owner = await resolveWhatsAppConnectionOwner(connection);
  const useConversationApi =
    isOfficialCoexistenceConnection(connection) ||
    (!isWhatsAppGatewayRuntime() && owner === "gateway");

  if (useConversationApi) {
    return {
      connection,
      connectionId: connection.id,
      socket: null,
      useConversationApi: true,
    };
  }

  let session = getSession(connection.id);
  if (!session?.socket) {
    const recoveredSocket = await resolveBaileysBroadcastSocket(
      userId,
      connection.id,
      `broadcast:${connection.id}`,
    );
    return {
      connection,
      connectionId: connection.id,
      socket: recoveredSocket,
      useConversationApi: false,
    };
  }

  return {
    connection,
    connectionId: connection.id,
    socket: session?.socket || null,
    useConversationApi: false,
  };
}

async function waitForSocket(
  campaignId: string,
  userId: string,
  preferredConnectionId?: string | null,
  options?: { strictPreferred?: boolean },
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SOCKET_WAIT_TIMEOUT_MS) {
    if (isBroadcastCancellationRequested(campaignId)) {
      return { connectionId: null, socket: null };
    }

    const resolved = await resolveSocket(userId, preferredConnectionId, options);
    if (resolved.useConversationApi || resolved.socket) {
      return resolved;
    }

    const keepWaiting = await waitForCampaignDelay(campaignId, SOCKET_POLL_INTERVAL_MS);
    if (!keepWaiting) {
      return { connectionId: null, socket: null };
    }
  }

  return { connection: null, connectionId: null, socket: null, useConversationApi: false };
}

async function ensureBroadcastConversation(
  connectionId: string,
  contact: CampaignContact,
  jid: string,
) {
  const normalizedPhone = normalizePhone(contact.phone);

  const existingConversation = await storage.findConversationByIdentity(connectionId, {
    contactNumber: normalizedPhone,
    remoteJid: jid,
    activeOnly: true,
  });

  if (existingConversation) {
    return existingConversation;
  }

  return storage.createConversation({
    connectionId,
    contactNumber: normalizedPhone,
    remoteJid: jid,
    jidSuffix: getJidSuffix(jid),
    contactName: contact.name || normalizedPhone,
    contactAvatar: null,
    lastMessageText: "",
    lastMessageTime: new Date(),
    lastMessageFromMe: true,
    unreadCount: 0,
    hasReplied: true,
  });
}

async function dispatchBroadcastViaConversationApi(params: {
  userId: string;
  connection: WhatsappConnection;
  contact: CampaignContact;
  jid: string;
  messageText: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
}) {
  const owner = await resolveWhatsAppConnectionOwner(params.connection);
  const shouldUseGatewayDirectSend =
    !isOfficialCoexistenceConnection(params.connection) &&
    owner === "gateway" &&
    !isWhatsAppGatewayRuntime();

  if (shouldUseGatewayDirectSend) {
    if (params.mediaUrl && params.mediaType) {
      const result = await sendGatewayInstanceMedia(params.connection.id, {
        type: params.mediaType,
        data: params.mediaUrl,
        mimetype: guessMimeTypeFromUrl(params.mediaUrl, params.mediaType as MediaType),
        filename: params.mediaType === "document" ? `broadcast-${Date.now()}` : undefined,
        caption: params.messageText.trim() || undefined,
        to: params.contact.phone,
        contactName: params.contact.name || undefined,
        validateDestination: true,
        directByNumber: true,
      });

      return {
        conversationId: null,
        messageId: (result as any)?.messageId || null,
        remoteJid: (result as any)?.remoteJid || params.jid,
        historyPersisted: false,
      };
    }

    const result = await sendGatewayInstanceText(params.connection.id, {
      text: params.messageText,
      to: params.contact.phone,
      contactName: params.contact.name || undefined,
      validateDestination: true,
      directByNumber: true,
    });

    return {
      conversationId: null,
      messageId: (result as any)?.messageId || null,
      remoteJid: (result as any)?.remoteJid || params.jid,
      historyPersisted: false,
    };
  }

  const conversation = await ensureBroadcastConversation(params.connection.id, params.contact, params.jid);

  if (params.mediaUrl && params.mediaType) {
    const normalizedMediaType = params.mediaType as MediaType;
    const parsedMedia = parseDataUrl(params.mediaUrl);

    const result = await sendUserMediaMessage(params.userId, conversation.id, {
      type: normalizedMediaType,
      data: params.mediaUrl,
      mimetype: parsedMedia?.mimeType || guessMimeTypeFromUrl(params.mediaUrl, normalizedMediaType),
      filename: normalizedMediaType === "document" ? `broadcast-${Date.now()}` : undefined,
      caption: params.messageText.trim() || undefined,
      ptt: false,
    }, {
      isFromAgent: true,
      skipAutoPause: true,
      validateDestination: true,
    });

    return {
      conversationId: result?.conversationId || conversation.id,
      messageId: result?.messageId || null,
      remoteJid: (result as any)?.remoteJid || params.jid,
      historyPersisted: true,
    };
  }

  const result = await sendConversationMessage(params.userId, conversation.id, params.messageText, {
    source: "system",
    validateDestination: true,
  } as any);

  return {
    conversationId: conversation.id,
    messageId: result?.messageId || null,
    remoteJid: (result as any)?.remoteJid || params.jid,
    historyPersisted: true,
  };
}

async function persistBroadcastHistory(params: {
  campaignConnectionId?: string | null;
  contact: CampaignContact;
  jid: string;
  messageId: string;
  messageText: string;
  sentAt: Date;
  mediaUrl?: string | null;
  mediaType?: string | null;
}) {
  if (!params.campaignConnectionId) {
    throw new Error("ConnectionId indisponivel para persistir historico do broadcast");
  }

  const normalizedPhone = normalizePhone(params.contact.phone);
  const previewText = getConversationPreviewText(params.messageText, params.mediaType);
  const persistedText = getPersistedMessageText(params.messageText, params.mediaType);
  const jidSuffix = getJidSuffix(params.jid);

  let conversation = await storage.findConversationByIdentity(params.campaignConnectionId, {
    contactNumber: normalizedPhone,
    remoteJid: params.jid,
    activeOnly: true,
  });

  if (!conversation) {
    conversation = await storage.createConversation({
      connectionId: params.campaignConnectionId,
      contactNumber: normalizedPhone,
      remoteJid: params.jid,
      jidSuffix,
      contactName: params.contact.name || normalizedPhone,
      contactAvatar: null,
      lastMessageText: previewText,
      lastMessageTime: params.sentAt,
      lastMessageFromMe: true,
      unreadCount: 0,
      hasReplied: true,
    });
  }

  const existingMessage = await storage.getMessageByMessageId(params.messageId);
  if (!existingMessage) {
    await storage.createMessage({
      conversationId: conversation.id,
      messageId: params.messageId,
      fromMe: true,
      text: persistedText,
      timestamp: params.sentAt,
      status: "sent",
      isFromAgent: true,
      mediaType: params.mediaType || null,
      mediaUrl: params.mediaUrl || null,
      mediaCaption: params.mediaType ? params.messageText.trim() || null : null,
    });
  }

  await storage.updateConversation(conversation.id, {
    remoteJid: params.jid,
    jidSuffix,
    contactName: params.contact.name || conversation.contactName || normalizedPhone,
    lastMessageText: previewText,
    lastMessageTime: params.sentAt,
    lastMessageFromMe: true,
    unreadCount: 0,
    hasReplied: true,
  });
}

async function simulateBroadcastTyping(socket: any, jid: string, messageText: string) {
  if (!socket?.sendPresenceUpdate) {
    return;
  }

  const typingDurationMs = Math.min(8_000, Math.max(2_000, String(messageText || "").length * 45));

  try {
    await socket.presenceSubscribe?.(jid);
    await socket.sendPresenceUpdate("composing", jid);
    await sleep(typingDurationMs);
    await socket.sendPresenceUpdate("paused", jid);
  } catch (error) {
    console.warn("[BROADCAST] Falha ao simular digitando antes do envio:", error);
  }
}

async function isCampaignCancelled(campaignId: string) {
  if (isBroadcastCancellationRequested(campaignId)) {
    return true;
  }

  const [campaign] = await db
    .select({ status: broadcastCampaigns.status })
    .from(broadcastCampaigns)
    .where(eq(broadcastCampaigns.id, campaignId))
    .limit(1);

  return campaign?.status === "cancelled";
}

async function persistProgress(
  campaignId: string,
  values: Record<string, unknown>,
) {
  await db
    .update(broadcastCampaigns)
    .set(({
      ...values,
      updatedAt: new Date(),
    } as unknown) as any)
    .where(eq(broadcastCampaigns.id, campaignId));
}

function resolvePreparedMessage(campaign: typeof broadcastCampaigns.$inferSelect, contact: CampaignContact) {
  if (campaign.campaignType !== "referral_outreach") {
    return null;
  }

  const metadata = (campaign.metadataJson || {}) as Record<string, any>;
  const preparedMessages = (metadata.preparedMessages || {}) as Record<string, { message?: string }>;
  const direct = contact.id ? preparedMessages[contact.id] : null;
  return String(direct?.message || "").trim() || null;
}

export async function createAndRunCampaign(userId: string, payload: CreateCampaignPayload) {
  const normalizedDelayMinMs = clampDelayMin(payload.delayMinMs);
  const normalizedDelayMaxMs = clampDelayMax(payload.delayMaxMs, payload.delayMinMs);
  const uniqueContacts = dedupeCampaignContacts(payload.contacts || []);
  const scheduledAt = parseBroadcastScheduledAt(payload.scheduledAt);
  const shouldScheduleForFuture = isBroadcastScheduledForFuture(scheduledAt);
  const normalizedMedia = await persistBroadcastMediaUrlIfNeeded({
    userId,
    mediaUrl: payload.mediaUrl,
    mediaType: payload.mediaType,
  });

  if (uniqueContacts.length === 0) {
    throw new Error("Nenhum contato valido para a campanha");
  }

  const connectionSelection = await resolveBroadcastConnectionSelection(
    userId,
    payload,
    payload.metadataJson || {},
  );

  const [insertedCampaign] = await db
    .insert(broadcastCampaigns)
    .values(({
      userId,
      connectionId: connectionSelection.connectionId,
      name: payload.name || `Campanha ${new Date().toLocaleString("pt-BR")}`,
      status: shouldScheduleForFuture ? "scheduled" : "pending",
      messageTemplate: payload.messageTemplate,
      mediaUrl: normalizedMedia.mediaUrl,
      mediaType: normalizedMedia.mediaType,
      totalContacts: uniqueContacts.length,
      sentCount: 0,
      failedCount: 0,
      campaignType: payload.campaignType || "broadcast",
      useAi: Boolean(payload.useAi),
      delayMinMs: normalizedDelayMinMs,
      delayMaxMs: normalizedDelayMaxMs,
      batchSize: BROADCAST_BATCH_SIZE,
      batchPauseMs: BROADCAST_BATCH_PAUSE_MAX_MS,
      contactsJson: uniqueContacts.map((contact, index) => ({
        id: contact.id || `${Date.now()}-${Math.random()}`,
        phone: contact.phone,
        name: contact.name || "Cliente",
        sequenceIndex: index,
      })),
      resultsJson: [],
      metadataJson: connectionSelection.metadataJson,
      scheduledAt,
    } as unknown) as any)
    .returning({ id: broadcastCampaigns.id });

  const campaignId = insertedCampaign.id;

  if (!shouldScheduleForFuture) {
    void startBroadcastCampaignRun(campaignId, "create");
  }

  return {
    campaignId,
    total: uniqueContacts.length,
    scheduled: shouldScheduleForFuture,
    status: shouldScheduleForFuture ? "scheduled" : "pending",
  };
}

async function executeCampaign(campaignId: string) {
  const [campaign] = await db
    .select()
    .from(broadcastCampaigns)
    .where(eq(broadcastCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return;
  }

  if (campaign.status === "cancelled") {
    return;
  }

  const contacts = Array.isArray(campaign.contactsJson) ? [...campaign.contactsJson] : [];
  const resumeState = buildBroadcastResumeState(
    contacts,
    Array.isArray(campaign.resultsJson) ? (campaign.resultsJson as CampaignResult[]) : [],
  );
  const results: CampaignResult[] = [...resumeState.results];
  let sentCount = resumeState.sentCount;
  let failedCount = resumeState.failedCount;
  const pendingContacts = resumeState.pendingContacts;
  const rotationConnectionIds = readRotationConnectionIds(campaign.metadataJson);
  const isRotationalCampaign = isRotationalBroadcastCampaign(campaign);

  if (isBroadcastScheduledForFuture(campaign.scheduledAt)) {
    await persistProgress(campaignId, {
      status: "scheduled",
      startedAt: null,
      completedAt: null,
    });
    return;
  }

  const preparedCampaignMedia = await prepareCampaignMediaSource({
    userId: campaign.userId,
    mediaUrl: campaign.mediaUrl,
    mediaType: campaign.mediaType,
  });

  if (preparedCampaignMedia?.mediaUrl !== (campaign.mediaUrl || null) || preparedCampaignMedia?.mediaType !== normalizeMediaType(campaign.mediaType)) {
    await persistProgress(campaignId, {
      mediaUrl: preparedCampaignMedia?.mediaUrl || null,
      mediaType: preparedCampaignMedia?.mediaType || null,
    });
    campaign.mediaUrl = preparedCampaignMedia?.mediaUrl || null;
    campaign.mediaType = preparedCampaignMedia?.mediaType || null;
  } else if (!preparedCampaignMedia && normalizeMediaType(campaign.mediaType) !== campaign.mediaType) {
    campaign.mediaType = normalizeMediaType(campaign.mediaType);
  }

  await persistProgress(campaignId, {
    status: "running",
    startedAt: campaign.startedAt || new Date(),
    sentCount,
    failedCount,
    resultsJson: results,
    completedAt: null,
    errorMessage: null,
  });

  for (let index = 0; index < pendingContacts.length; index += 1) {
    if (await isCampaignCancelled(campaignId)) {
      await persistProgress(campaignId, {
        completedAt: new Date(),
      });
      return;
    }

    const contact = pendingContacts[index];
    const contactSequenceIndex = typeof contact.sequenceIndex === "number" ? contact.sequenceIndex : index;
    const targetConnectionId = isRotationalCampaign
      ? selectBroadcastConnectionIdForContact(rotationConnectionIds, campaign.connectionId, contactSequenceIndex)
      : campaign.connectionId;
    let resolved = await resolveSocket(campaign.userId, targetConnectionId, {
      strictPreferred: isRotationalCampaign,
    });

    if (!resolved.socket) {
      resolved = await waitForSocket(campaignId, campaign.userId, targetConnectionId, {
        strictPreferred: isRotationalCampaign,
      });
    }

    if (await isCampaignCancelled(campaignId)) {
      await persistProgress(campaignId, {
        completedAt: new Date(),
      });
      return;
    }

    if (!isRotationalCampaign && resolved.connectionId && resolved.connectionId !== campaign.connectionId) {
      await persistProgress(campaignId, {
        connectionId: resolved.connectionId,
      });
      campaign.connectionId = resolved.connectionId;
    }

    if (!resolved.useConversationApi && !resolved.socket) {
      failedCount += 1;
      results.push({
        contactId: contact.id,
        phone: contact.phone,
        name: contact.name || "Cliente",
        status: "failed",
        error: "Socket indisponivel apos aguardar reconexao por 5 minutos",
      });

      await persistProgress(campaignId, {
        failedCount,
        resultsJson: results,
      });
    } else {
      try {
        let jid = formatPhoneToJid(contact.phone);
        let messageText = resolvePreparedMessage(campaign, contact) || applyTemplate(campaign.messageTemplate, contact.name);

        if (campaign.useAi && campaign.campaignType !== "referral_outreach") {
          messageText = applyAiVariation(messageText, contactSequenceIndex);
        }

        const sentAt = new Date();
        let messageId = `broadcast_${campaignId}_${contactSequenceIndex}_${sentAt.getTime()}`;

        if (resolved.useConversationApi && resolved.connection) {
          const dispatched = await dispatchBroadcastViaConversationApi({
            userId: campaign.userId,
            connection: resolved.connection,
            contact,
            jid,
            messageText,
            mediaUrl: campaign.mediaUrl,
            mediaType: campaign.mediaType,
          });
          if (dispatched.messageId) {
            messageId = dispatched.messageId;
          }
          if (dispatched.remoteJid) {
            jid = dispatched.remoteJid;
          }
          if (dispatched.historyPersisted !== true) {
            await persistBroadcastHistory({
              campaignConnectionId: resolved.connectionId || campaign.connectionId,
              contact,
              jid,
              messageId,
              messageText,
              sentAt,
              mediaUrl: campaign.mediaUrl,
              mediaType: campaign.mediaType,
            }).catch((error) => {
              console.warn("[BROADCAST] Falha ao persistir historico da mensagem enviada:", error);
            });
          }
        } else if (resolved.socket) {
          jid = await resolveReachableBroadcastJid(resolved.socket, contact.phone);
          const messageContent = buildMessageContentFromPreparedMedia(messageText, preparedCampaignMedia);
          await simulateBroadcastTyping(resolved.socket, jid, messageText);
          const sentMessage = await resolved.socket.sendMessage(jid, messageContent);
          messageId = sentMessage?.key?.id || messageId;

          await persistBroadcastHistory({
            campaignConnectionId: resolved.connectionId || campaign.connectionId,
            contact,
            jid,
            messageId,
            messageText,
            sentAt,
            mediaUrl: campaign.mediaUrl,
            mediaType: campaign.mediaType,
          }).catch((error) => {
            console.warn("[BROADCAST] Falha ao persistir historico da mensagem enviada:", error);
          });
        }

        sentCount += 1;
        results.push({
          contactId: contact.id,
          phone: contact.phone,
          name: contact.name || "Cliente",
          status: "sent",
          sentAt: sentAt.toISOString(),
          message: messageText,
          messageId,
          remoteJid: jid,
        });

        await persistProgress(campaignId, {
          connectionId: !isRotationalCampaign ? resolved.connectionId || campaign.connectionId : campaign.connectionId,
          sentCount,
          failedCount,
          resultsJson: results,
        });
      } catch (error) {
        const failedAt = new Date();
        failedCount += 1;
        results.push({
          contactId: contact.id,
          phone: contact.phone,
          name: contact.name || "Cliente",
          status: "failed",
          error: error instanceof Error ? error.message : "Erro desconhecido",
          sentAt: failedAt.toISOString(),
          message: resolvePreparedMessage(campaign, contact) || applyTemplate(campaign.messageTemplate, contact.name),
        });

        await persistProgress(campaignId, {
          connectionId: !isRotationalCampaign ? resolved.connectionId || campaign.connectionId : campaign.connectionId,
          sentCount,
          failedCount,
          resultsJson: results,
        });
      }
    }

    const isLastContact = index === pendingContacts.length - 1;
    if (isLastContact) {
      continue;
    }

    const processedCount = sentCount + failedCount;
    if (processedCount % BROADCAST_BATCH_SIZE === 0) {
      const keepRunning = await sleepRange(
        campaignId,
        BROADCAST_BATCH_PAUSE_MIN_MS,
        Math.max(Number(campaign.batchPauseMs || 0), BROADCAST_BATCH_PAUSE_MAX_MS),
      );
      if (!keepRunning) {
        await persistProgress(campaignId, {
          completedAt: new Date(),
        });
        return;
      }
      continue;
    }

    const keepRunning = await sleepRange(campaignId, campaign.delayMinMs, campaign.delayMaxMs);
    if (!keepRunning) {
      await persistProgress(campaignId, {
        completedAt: new Date(),
      });
      return;
    }
  }

  if (await isCampaignCancelled(campaignId)) {
    await persistProgress(campaignId, {
      completedAt: new Date(),
    });
    return;
  }

  await persistProgress(campaignId, {
    status: "completed",
    sentCount,
    failedCount,
    resultsJson: results,
    completedAt: new Date(),
    errorMessage: null,
  });
}

export async function getCampaignStatus(campaignId: string, userId: string) {
  const [campaign] = await db
    .select()
    .from(broadcastCampaigns)
    .where(and(eq(broadcastCampaigns.id, campaignId), eq(broadcastCampaigns.userId, userId)))
    .limit(1);

  return campaign || null;
}

export async function cancelCampaign(campaignId: string, userId: string) {
  requestBroadcastCancellation(campaignId);

  const cancelled = await db
    .update(broadcastCampaigns)
    .set(({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
    } as unknown) as any)
    .where(and(eq(broadcastCampaigns.id, campaignId), eq(broadcastCampaigns.userId, userId)))
    .returning({ id: broadcastCampaigns.id });

  return cancelled.length > 0;
}

async function resumePendingBroadcastCampaigns(trigger: BroadcastTaskTrigger) {
  const campaigns = await db
    .select({
      id: broadcastCampaigns.id,
      status: broadcastCampaigns.status,
      scheduledAt: broadcastCampaigns.scheduledAt,
    })
    .from(broadcastCampaigns)
    .where(inArray(broadcastCampaigns.status, [...ACTIVE_BROADCAST_STATUSES]))
    .orderBy(asc(broadcastCampaigns.createdAt))
    .limit(100);

  for (const campaign of campaigns) {
    const isScheduledForFuture = isBroadcastScheduledForFuture(campaign.scheduledAt);

    if (isScheduledForFuture) {
      if (campaign.status !== "scheduled") {
        await persistProgress(campaign.id, {
          status: "scheduled",
          startedAt: null,
          completedAt: null,
        });
      }
      continue;
    }

    startBroadcastCampaignRun(campaign.id, trigger);
  }
}

export function startBroadcastCampaignRun(
  campaignId: string,
  trigger: BroadcastTaskTrigger = "manual",
) {
  const activeTask = activeBroadcastTasks.get(campaignId);
  if (activeTask) {
    return activeTask;
  }

  getBroadcastCancelState(campaignId).requested = false;

  const task = executeCampaign(campaignId)
    .catch(async (error) => {
      console.error(`[BROADCAST ${campaignId}] Runner abortado. trigger=${trigger}`, error);
      await persistProgress(campaignId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      }).catch(() => undefined);
    })
    .finally(() => {
      activeBroadcastTasks.delete(campaignId);
      activeBroadcastCancels.delete(campaignId);
    });

  activeBroadcastTasks.set(campaignId, task);
  return task;
}

export async function runCampaignById(campaignId: string) {
  await startBroadcastCampaignRun(campaignId, "manual");
}

export function startBroadcastCampaignRecoveryLoop() {
  if (broadcastRecoveryLoop) {
    return;
  }

  startLegacyBroadcastCampaignMediaMaintenanceLoop();
  void resumePendingBroadcastCampaigns("boot");
  broadcastRecoveryLoop = setInterval(() => {
    void resumePendingBroadcastCampaigns("recovery-loop");
  }, BROADCAST_RECOVERY_INTERVAL_MS);
}

export function startLegacyBroadcastCampaignMediaMaintenanceLoop() {
  if (legacyBroadcastMediaMaintenanceLoop) {
    return;
  }

  void runLegacyBroadcastCampaignMediaMaintenance("boot");
  legacyBroadcastMediaMaintenanceLoop = setInterval(() => {
    void runLegacyBroadcastCampaignMediaMaintenance("interval");
  }, LEGACY_BROADCAST_MEDIA_MAINTENANCE_INTERVAL_MS);
}

export default {
  createAndRunCampaign,
  getCampaignStatus,
  cancelCampaign,
  runCampaignById,
  startBroadcastCampaignRun,
  startBroadcastCampaignRecoveryLoop,
  startLegacyBroadcastCampaignMediaMaintenanceLoop,
};
