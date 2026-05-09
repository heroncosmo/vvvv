import { and, asc, desc, eq, inArray, lte, or, isNull } from "drizzle-orm";
import { db, pool } from "./db";
import { generateWithLLM } from "./llm";
import {
  statusPostItems,
  statusPosts,
  statusPublishJobs,
  statusPublishRunItems,
  statusPublishRuns,
  statusRotationPosts,
  statusRotations,
  whatsappContacts,
  whatsappConnections,
  type StatusJobRecurrenceType,
  type StatusPostItem,
  type StatusRotationSelectionMode,
} from "@shared/schema";
import { ensureUserSessionOperational, getSessions } from "./whatsapp";
import { messageQueueService } from "./messageQueueService";
import {
  previewGatewayStatusAudience,
  sendGatewayStatusPost,
} from "./whatsappGatewayClient";
import {
  isWhatsAppGatewayRuntime,
} from "./whatsappGatewayOwnership";
import { resolveAppVisibleConnectionOwner } from "./whatsappGatewayAppOwnership";
import {
  buildStatusAudienceCandidates,
  describeStatusPrivacyValue,
  normalizeStatusPrivacyValue,
  sendStatusPostToSocket,
  type StatusAudienceEntry,
  type StatusPrivacyValue,
} from "./statusPostingHelpers";
import {
  getStatusSendTimeoutMs,
  withStatusSendTimeout,
} from "./statusProcessingRuntime";
import { getStatusJobFailureState } from "./statusPublishJobState";

const STATUS_JID = "status@broadcast";
const SAO_PAULO_OFFSET_MS = -3 * 60 * 60 * 1000;
const ROTATION_DEFAULT_INTERVAL_MINUTES = 1440;
const RETRY_DELAY_MINUTES = 15;

type PublishParams = {
  userId: string;
  postId: string;
  connectionId?: string | null;
  jobId?: string | null;
  rotationId?: string | null;
  runType: "manual" | "job" | "rotation";
  triggeredBy?: string;
};

type ResolvedSocket = {
  connectionId: string;
  session: any;
  socket: any;
};

type StatusAudienceDiagnostics = {
  statusJidList: string[];
  audienceCount: number;
  audienceSource: "saved_contacts" | "session_contacts" | "none";
  statusPrivacy: StatusPrivacyValue;
  statusPrivacyLabel: string | null;
};

async function resolveStatusGatewayCandidate(
  userId: string,
  preferredConnectionId?: string | null,
) {
  const userConnections = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.userId, userId))
    .orderBy(
      desc(whatsappConnections.isPrimary),
      asc(whatsappConnections.createdAt),
    );

  if (preferredConnectionId) {
    const specific = userConnections.find(
      (connection) => connection.id === preferredConnectionId,
    );
    if (!specific) {
      throw new Error("Conexão informada não pertence ao usuário");
    }
    return specific;
  }

  return (
    userConnections.find((connection) => connection.isConnected === true) || null
  );
}

type HistoryRun = {
  id: string;
  postId: string;
  postName: string;
  jobId: string | null;
  rotationId: string | null;
  connectionId: string | null;
  runType: string;
  triggeredBy: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  items: Array<{
    id: string;
    displayOrder: number;
    type: string;
    textPreview: string | null;
    storageUrl: string | null;
    caption: string | null;
    status: string;
    sentAt: Date | null;
    errorMessage: string | null;
  }>;
};

export type StatusPostContentType = "text" | "image" | "video" | "audio";
export type StatusRequestedAction = "now" | "daily" | "weekdays" | "schedule";

export interface StatusPostPayload {
  kind: "status-post";
  version: 2;
  connectionId?: string | null;
  contentType: StatusPostContentType;
  text?: string;
  caption?: string | null;
  mediaUrl?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  storagePath?: string | null;
  selectedWeekdays?: number[] | null;
  aiVariationEnabled?: boolean;
  aiVariationPrompt?: string | null;
  requestedAction?: StatusRequestedAction | null;
  sendRetryCount?: number | null;
}

const STATUS_POST_KIND = "status-post";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSelectedWeekdays(
  days: Array<number | null | undefined> | null | undefined,
) {
  const unique = new Set<number>();

  for (const value of days || []) {
    if (!Number.isInteger(value)) {
      continue;
    }

    const weekday = Number(value);
    if (weekday >= 0 && weekday <= 6) {
      unique.add(weekday);
    }
  }

  return Array.from(unique).sort((left, right) => left - right);
}

function normalizeStatusPostPayload(
  payload: Partial<StatusPostPayload>,
): StatusPostPayload {
  const contentType = payload.contentType || "text";
  return {
    kind: STATUS_POST_KIND,
    version: 2,
    connectionId: String(payload.connectionId || "").trim() || null,
    contentType,
    text: payload.text?.trim() || "",
    caption: payload.caption?.trim() || null,
    mediaUrl: payload.mediaUrl || null,
    mimeType: payload.mimeType || null,
    fileName: payload.fileName || null,
    storagePath: payload.storagePath || null,
    selectedWeekdays: normalizeSelectedWeekdays(payload.selectedWeekdays),
    aiVariationEnabled: Boolean(payload.aiVariationEnabled),
    aiVariationPrompt: payload.aiVariationPrompt?.trim() || null,
    requestedAction:
      payload.requestedAction === "now" ||
      payload.requestedAction === "daily" ||
      payload.requestedAction === "weekdays" ||
      payload.requestedAction === "schedule"
        ? payload.requestedAction
        : null,
    sendRetryCount: Math.max(0, Number(payload.sendRetryCount || 0)),
  };
}

export function serializeStatusPostPayload(
  payload: Partial<StatusPostPayload>,
): string {
  return JSON.stringify(normalizeStatusPostPayload(payload));
}

export function parseStatusPostPayload(
  rawValue: string | null | undefined,
): StatusPostPayload {
  if (!rawValue) {
    return normalizeStatusPostPayload({ contentType: "text", text: "" });
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && parsed.kind === STATUS_POST_KIND) {
      return normalizeStatusPostPayload(parsed);
    }
  } catch {
    // Legacy plain-text rows fall through to the text payload format.
  }

  return normalizeStatusPostPayload({ contentType: "text", text: rawValue });
}

export function getStatusPostSummary(payload: StatusPostPayload): string {
  if (payload.contentType === "text") {
    return payload.text || "Texto";
  }

  return payload.caption || payload.fileName || payload.mediaUrl || "Midia";
}

export function getStatusPostSession(userId: string) {
  const sessions = Array.from(getSessions().values());

  const openSession = sessions.find((session: any) => {
    return (
      session.userId === userId &&
      session.socket &&
      (session.isOpen || session.socket.user)
    );
  });

  if (openSession) {
    return openSession;
  }

  return (
    sessions.find(
      (session: any) => session.userId === userId && session.socket,
    ) || null
  );
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

async function buildPayloadForSend(payload: StatusPostPayload) {
  if (!payload.aiVariationEnabled || payload.contentType !== "text") {
    return payload;
  }

  const sourceText = String(
    payload.contentType === "text"
      ? payload.text
      : payload.caption || payload.text || "",
  ).trim();
  if (!sourceText) {
    return payload;
  }

  try {
    const weekdayLabel = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const systemPrompt = [
      "Voce cria variacoes curtas para status de WhatsApp.",
      "Mantenha a intencao comercial da mensagem original.",
      "Escreva em portugues do Brasil.",
      "Nao use aspas, hashtags, listas ou explicacoes.",
      "Entregue apenas a versao final pronta para postar.",
    ].join(" ");
    const userPrompt = [
      `Mensagem base: ${sourceText}`,
      payload.aiVariationPrompt
        ? `Instrucao extra: ${payload.aiVariationPrompt}`
        : "",
      `Crie uma nova versao para postar hoje (${weekdayLabel}) sem repetir exatamente a mensagem base.`,
    ]
      .filter(Boolean)
      .join("\n");

    const generatedText = stripWrappingQuotes(
      await generateWithLLM(systemPrompt, userPrompt, {
        maxTokens: 220,
        temperature: 0.9,
      }),
    );

    if (!generatedText) {
      return payload;
    }

    if (payload.contentType === "text") {
      return {
        ...payload,
        text: generatedText,
      };
    }

    return {
      ...payload,
      caption: generatedText,
    };
  } catch (error: any) {
    console.warn(
      "[STATUS POSTS] Failed to generate AI variation:",
      error?.message || error,
    );
    return payload;
  }
}

export async function sendStatusPost(socket: any, payload: StatusPostPayload) {
  const caption = payload.caption || payload.text || undefined;

  switch (payload.contentType) {
    case "image":
      if (!payload.mediaUrl) throw new Error("Media URL not provided");
      return socket.sendMessage(STATUS_JID, {
        image: { url: payload.mediaUrl },
        caption,
      });

    case "video":
      if (!payload.mediaUrl) throw new Error("Media URL not provided");
      return socket.sendMessage(STATUS_JID, {
        video: { url: payload.mediaUrl },
        caption,
      });

    case "audio":
      if (!payload.mediaUrl) throw new Error("Media URL not provided");
      return socket.sendMessage(STATUS_JID, {
        audio: { url: payload.mediaUrl },
        mimetype: payload.mimeType || "audio/mpeg",
        ptt: true,
      });

    case "text":
    default:
      if (!payload.text?.trim()) {
        throw new Error("Status text not provided");
      }
      return socket.sendMessage(STATUS_JID, {
        text: payload.text.trim(),
      });
  }
}

function toPseudoSaoPauloDate(date: Date) {
  return new Date(date.getTime() + SAO_PAULO_OFFSET_MS);
}

function fromSaoPauloParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
) {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - SAO_PAULO_OFFSET_MS,
  );
}

function getSaoPauloParts(date: Date) {
  const pseudo = toPseudoSaoPauloDate(date);
  return {
    year: pseudo.getUTCFullYear(),
    month: pseudo.getUTCMonth() + 1,
    day: pseudo.getUTCDate(),
    hour: pseudo.getUTCHours(),
    minute: pseudo.getUTCMinutes(),
    weekday: pseudo.getUTCDay(),
  };
}

function parseTimeOfDay(value?: string | null) {
  const safe = String(value || "09:00");
  const [hourRaw, minuteRaw] = safe.split(":");
  return {
    hour: Math.max(0, Math.min(23, Number(hourRaw || 0))),
    minute: Math.max(0, Math.min(59, Number(minuteRaw || 0))),
  };
}

function getLastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeDaysOfWeek(daysOfWeek?: number[] | null, fallback?: number) {
  const normalized = Array.from(
    new Set((daysOfWeek || []).filter((day) => day >= 0 && day <= 6)),
  ).sort();
  if (normalized.length > 0) {
    return normalized;
  }
  return typeof fallback === "number" ? [fallback] : [];
}

export function computeNextRunAt(params: {
  recurrenceType: StatusJobRecurrenceType;
  scheduledFor?: Date | null;
  timeOfDay?: string | null;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  now?: Date;
}) {
  const now = params.now || new Date();
  const recurrenceType = params.recurrenceType || "once";

  if (recurrenceType === "once") {
    return params.scheduledFor || null;
  }

  const time = parseTimeOfDay(params.timeOfDay);
  const currentParts = getSaoPauloParts(now);

  if (recurrenceType === "daily") {
    let candidate = fromSaoPauloParts(
      currentParts.year,
      currentParts.month,
      currentParts.day,
      time.hour,
      time.minute,
    );
    if (candidate <= now) {
      const pseudo = toPseudoSaoPauloDate(now);
      pseudo.setUTCDate(pseudo.getUTCDate() + 1);
      candidate = fromSaoPauloParts(
        pseudo.getUTCFullYear(),
        pseudo.getUTCMonth() + 1,
        pseudo.getUTCDate(),
        time.hour,
        time.minute,
      );
    }
    return candidate;
  }

  if (recurrenceType === "weekdays" || recurrenceType === "weekly") {
    const baseWeekday = params.scheduledFor
      ? getSaoPauloParts(params.scheduledFor).weekday
      : currentParts.weekday;
    const allowedDays = normalizeDaysOfWeek(
      params.daysOfWeek,
      recurrenceType === "weekly" ? baseWeekday : undefined,
    );

    for (let offset = 0; offset <= 14; offset += 1) {
      const pseudo = toPseudoSaoPauloDate(now);
      pseudo.setUTCDate(pseudo.getUTCDate() + offset);
      const weekday = pseudo.getUTCDay();
      if (allowedDays.length > 0 && !allowedDays.includes(weekday)) {
        continue;
      }

      const candidate = fromSaoPauloParts(
        pseudo.getUTCFullYear(),
        pseudo.getUTCMonth() + 1,
        pseudo.getUTCDate(),
        time.hour,
        time.minute,
      );
      if (candidate > now) {
        return candidate;
      }
    }
    return null;
  }

  if (recurrenceType === "monthly") {
    const baseDay =
      params.dayOfMonth ||
      (params.scheduledFor
        ? getSaoPauloParts(params.scheduledFor).day
        : currentParts.day);
    let year = currentParts.year;
    let month = currentParts.month;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const safeDay = Math.min(baseDay, getLastDayOfMonth(year, month));
      const candidate = fromSaoPauloParts(
        year,
        month,
        safeDay,
        time.hour,
        time.minute,
      );
      if (candidate > now) {
        return candidate;
      }
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  return null;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getPreviewText(item: StatusPostItem) {
  const raw = item.type === "text" ? item.text : item.caption || item.text;
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return item.type === "text" ? "[Texto]" : `[${item.type}]`;
  }
  return trimmed.slice(0, 200);
}

async function resolveMediaBuffer(storageUrl: string) {
  if (/^data:/i.test(storageUrl)) {
    const match = storageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error("Data URL inválida");
    }
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], "base64"),
    };
  }

  const response = await fetch(storageUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    mimeType:
      response.headers.get("content-type") || "application/octet-stream",
    buffer: Buffer.from(arrayBuffer),
  };
}

async function buildStatusPayload(item: StatusPostItem) {
  if (item.type === "text") {
    const text = String(item.text || "").trim();
    if (!text) {
      throw new Error("Digite o texto do status");
    }
    return { text };
  }

  const storageUrl = String(item.storageUrl || "").trim();
  if (!storageUrl) {
    throw new Error("Mídia ausente para envio do status");
  }

  const media = await resolveMediaBuffer(storageUrl);
  const caption = String(item.caption || "").trim() || undefined;
  const mimeType = item.mimeType || media.mimeType;

  if (item.type === "image") {
    return { image: media.buffer, mimetype: mimeType || "image/jpeg", caption };
  }
  if (item.type === "video") {
    return { video: media.buffer, mimetype: mimeType || "video/mp4", caption };
  }
  if (item.type === "audio") {
    return {
      audio: media.buffer,
      mimetype: mimeType || "audio/ogg; codecs=opus",
      ptt: false,
    };
  }

  throw new Error(`Tipo de item não suportado: ${item.type}`);
}

async function resolveStatusSocket(
  userId: string,
  preferredConnectionId?: string | null,
): Promise<ResolvedSocket> {
  const userConnections = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.userId, userId))
    .orderBy(
      desc(whatsappConnections.isPrimary),
      asc(whatsappConnections.createdAt),
    );

  if (preferredConnectionId) {
    const specific = userConnections.find(
      (connection) => connection.id === preferredConnectionId,
    );
    if (!specific) {
      throw new Error("Conexão informada não pertence ao usuário");
    }
    const session = await ensureUserSessionOperational(userId, specific.id, {
      source: "status_publish_preferred",
      waitMs: 3_000,
    });
    if (!session?.socket || specific.isConnected !== true) {
      throw new Error("WhatsApp não conectado na conexão selecionada");
    }
    return { connectionId: specific.id, session, socket: session.socket };
  }

  const activeConnections = userConnections.filter(
    (connection) => connection.isConnected === true,
  );

  if (activeConnections.length === 0) {
    throw new Error("WhatsApp não conectado");
  }

  for (const connection of activeConnections) {
    const session = await ensureUserSessionOperational(userId, connection.id, {
      source: connection.isPrimary
        ? "status_publish_primary"
        : "status_publish_fallback",
      waitMs: connection.isPrimary ? 3_000 : 1_500,
      allowPersistedAuthRecovery: false,
    });
    if (session?.socket) {
      return { connectionId: connection.id, session, socket: session.socket };
    }
  }

  if (activeConnections.length === 1) {
    throw new Error("WhatsApp não conectado");
  }

  throw new Error(
    "Nenhuma conexão operacional disponível para publicar o status",
  );
}

async function resolveStatusAudience(
  userId: string,
  connectionId: string,
  session: {
    contactsCache?: Map<
      string,
      { id?: string; phoneNumber?: string; lid?: string }
    >;
  },
): Promise<StatusAudienceDiagnostics> {
  const [connection] = await db
    .select({
      id: whatsappConnections.id,
    })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.userId, userId),
        eq(whatsappConnections.id, connectionId),
      ),
    )
    .limit(1);

  if (!connection) {
    return {
      statusJidList: [],
      audienceCount: 0,
      audienceSource: "none",
      statusPrivacy: null,
      statusPrivacyLabel: null,
    };
  }

  const dbAudience = await db
    .select({
      phoneNumber: whatsappContacts.phoneNumber,
      contactId: whatsappContacts.contactId,
      lid: whatsappContacts.lid,
    })
    .from(whatsappContacts)
    .where(eq(whatsappContacts.connectionId, connection.id));
  const sessionAudience = session.contactsCache
    ? Array.from(session.contactsCache.values())
    : [];

  const savedContactsAudience = buildStatusAudienceCandidates(
    dbAudience.map((contact) => ({
      phoneNumber: contact.phoneNumber,
      primaryId: contact.contactId,
      lid: contact.lid,
    })),
  );

  if (savedContactsAudience.length > 0) {
    return {
      statusJidList: savedContactsAudience,
      audienceCount: savedContactsAudience.length,
      audienceSource: "saved_contacts",
      statusPrivacy: null,
      statusPrivacyLabel: null,
    };
  }

  const sessionContactsAudience = buildStatusAudienceCandidates(
    sessionAudience.map((contact) => ({
      phoneNumber: contact.phoneNumber,
      primaryId: contact.id,
      lid: contact.lid,
    })),
  );

  if (sessionContactsAudience.length > 0) {
    return {
      statusJidList: sessionContactsAudience,
      audienceCount: sessionContactsAudience.length,
      audienceSource: "session_contacts",
      statusPrivacy: null,
      statusPrivacyLabel: null,
    };
  }

  return {
    statusJidList: [],
    audienceCount: 0,
    audienceSource: "none",
    statusPrivacy: null,
    statusPrivacyLabel: null,
  };
}

async function resolveStatusPrivacyDiagnostics(socket: any) {
  if (!socket?.fetchPrivacySettings) {
    return {
      statusPrivacy: null,
      statusPrivacyLabel: null,
    };
  }

  try {
    const privacySettings = await socket.fetchPrivacySettings();
    const statusPrivacy = normalizeStatusPrivacyValue(privacySettings?.status);
    return {
      statusPrivacy,
      statusPrivacyLabel: statusPrivacy
        ? describeStatusPrivacyValue(statusPrivacy)
        : null,
    };
  } catch (error) {
    console.warn(
      "[STATUS POSTS] Failed to read status privacy settings:",
      error,
    );
    return {
      statusPrivacy: null,
      statusPrivacyLabel: null,
    };
  }
}

export async function previewStatusAudienceForUser(
  userId: string,
  preferredConnectionId?: string | null,
) {
  const candidate = await resolveStatusGatewayCandidate(
    userId,
    preferredConnectionId,
  );
  if (candidate) {
    const owner = await resolveAppVisibleConnectionOwner(candidate);
    if (owner === "gateway" && !isWhatsAppGatewayRuntime()) {
      return previewGatewayStatusAudience(candidate.id);
    }
  }

  let resolved: ResolvedSocket;
  try {
    resolved = await resolveStatusSocket(userId, preferredConnectionId);
  } catch {
    return {
      audienceCount: 0,
      connectionId: null,
      isConnected: false,
      audienceSource: "none" as const,
      statusPrivacy: null,
      statusPrivacyLabel: null,
    };
  }

  const [audience, privacy] = await Promise.all([
    resolveStatusAudience(userId, resolved.connectionId, resolved.session),
    resolveStatusPrivacyDiagnostics(resolved.socket),
  ]);
  return {
    audienceCount: audience.audienceCount,
    connectionId: resolved.connectionId,
    isConnected: true,
    audienceSource: audience.audienceSource,
    statusPrivacy: privacy.statusPrivacy,
    statusPrivacyLabel: privacy.statusPrivacyLabel,
  };
}

async function getPostWithItems(userId: string, postId: string) {
  const [post] = await db
    .select()
    .from(statusPosts)
    .where(and(eq(statusPosts.id, postId), eq(statusPosts.userId, userId)))
    .limit(1);

  if (!post) {
    throw new Error("Postagem não encontrada");
  }

  const items = await db
    .select()
    .from(statusPostItems)
    .where(
      and(
        eq(statusPostItems.postId, postId),
        eq(statusPostItems.isActive, true),
      ),
    )
    .orderBy(asc(statusPostItems.displayOrder), asc(statusPostItems.createdAt));

  if (items.length === 0) {
    throw new Error("A postagem não possui itens ativos");
  }

  return { post, items };
}

export async function publishStatusPost(params: PublishParams) {
  const { post, items } = await getPostWithItems(params.userId, params.postId);

  const [run] = await db
    .insert(statusPublishRuns)
    .values({
      userId: params.userId,
      postId: params.postId,
      jobId: params.jobId || null,
      rotationId: params.rotationId || null,
      connectionId: params.connectionId || post.connectionId || null,
      runType: params.runType,
      triggeredBy: params.triggeredBy || "system",
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  let resolved: ResolvedSocket;
  try {
    resolved = await resolveStatusSocket(
      params.userId,
      params.connectionId || post.connectionId,
    );
  } catch (error: any) {
    await db
      .update(statusPublishRuns)
      .set({
        status: "failed",
        errorMessage:
          error?.message || "Falha ao localizar conexão do WhatsApp",
        completedAt: new Date(),
        connectionId: params.connectionId || post.connectionId || null,
      })
      .where(eq(statusPublishRuns.id, run.id));
    throw error;
  }

  let failed = false;
  let lastError: string | null = null;
  const audience = await resolveStatusAudience(
    params.userId,
    resolved.connectionId,
    resolved.session,
  );

  if (audience.statusJidList.length === 0) {
    await db
      .update(statusPublishRuns)
      .set({
        status: "failed",
        errorMessage: "Nenhum contato sincronizado para receber o status",
        completedAt: new Date(),
        connectionId: resolved.connectionId,
      })
      .where(eq(statusPublishRuns.id, run.id));

    throw new Error("Nenhum contato sincronizado para receber o status");
  }

  for (const item of items) {
    const [runItem] = await db
      .insert(statusPublishRunItems)
      .values({
        runId: run.id,
        postItemId: item.id,
        displayOrder: item.displayOrder,
        type: item.type,
        textPreview: getPreviewText(item),
        storageUrl: item.storageUrl || null,
        caption: item.caption || null,
        status: "pending",
      })
      .returning();

    try {
      const payload = await buildStatusPayload(item);
      await messageQueueService.executeWithDelay(
        params.userId,
        `status ${item.type}`,
        async () => {
          return await resolved.socket.sendMessage(STATUS_JID, payload, {
            broadcast: true,
            statusJidList: audience.statusJidList,
          });
        },
      );

      await db
        .update(statusPublishRunItems)
        .set({
          status: "sent",
          sentAt: new Date(),
          errorMessage: null,
        })
        .where(eq(statusPublishRunItems.id, runItem.id));

      await sleep(5000);
    } catch (error: any) {
      failed = true;
      lastError = error?.message || "Falha ao publicar item do status";

      await db
        .update(statusPublishRunItems)
        .set({
          status: "failed",
          errorMessage: lastError,
        })
        .where(eq(statusPublishRunItems.id, runItem.id));

      break;
    }
  }

  await db
    .update(statusPublishRuns)
    .set({
      status: failed ? "partial_failed" : "sent",
      errorMessage: lastError,
      completedAt: new Date(),
      connectionId: resolved.connectionId,
    })
    .where(eq(statusPublishRuns.id, run.id));

  if (failed) {
    throw new Error(lastError || "Falha ao publicar status");
  }

  return {
    ...run,
    audienceCount: statusJidList.length,
    connectionId: resolved.connectionId,
    status: failed ? "partial_failed" : "sent",
  };
}

export async function processStatusPublishJobs() {
  const now = new Date();
  const jobs = await db
    .select()
    .from(statusPublishJobs)
    .where(
      and(
        eq(statusPublishJobs.isActive, true),
        eq(statusPublishJobs.status, "active"),
        or(
          isNull(statusPublishJobs.nextRunAt),
          lte(statusPublishJobs.nextRunAt, now),
        ),
      ),
    )
    .orderBy(
      asc(statusPublishJobs.nextRunAt),
      asc(statusPublishJobs.createdAt),
    );

  for (const job of jobs) {
    try {
      await publishStatusPost({
        userId: job.userId,
        postId: job.postId,
        connectionId: job.connectionId,
        jobId: job.id,
        runType: "job",
        triggeredBy: "scheduler",
      });

      const nextRunAt = computeNextRunAt({
        recurrenceType: job.recurrenceType,
        scheduledFor: job.scheduledFor,
        timeOfDay: job.timeOfDay,
        daysOfWeek: job.daysOfWeek,
        dayOfMonth: job.dayOfMonth,
        now: addMinutes(now, 1),
      });

      await db
        .update(statusPublishJobs)
        .set({
          lastRunAt: now,
          nextRunAt,
          lastError: null,
          status: nextRunAt ? "active" : "completed",
          isActive: !!nextRunAt,
          updatedAt: now,
        })
        .where(eq(statusPublishJobs.id, job.id));
    } catch (error: any) {
      await db
        .update(statusPublishJobs)
        .set(
          getStatusJobFailureState({
            recurrenceType: job.recurrenceType,
            now,
            errorMessage: error?.message || "Falha ao publicar status agendado",
          }),
        )
        .where(eq(statusPublishJobs.id, job.id));
    }
  }
}

export function pickRotationPost<
  T extends { id: string; weight?: number | null },
>(
  items: T[],
  selectionMode: StatusRotationSelectionMode,
  lastPostId?: string | null,
) {
  if (items.length === 0) {
    throw new Error("Nenhuma postagem configurada na rotação");
  }

  if (selectionMode === "random") {
    const pool =
      items.length > 1 ? items.filter((item) => item.id !== lastPostId) : items;
    const total = pool.reduce(
      (acc, item) => acc + Math.max(1, item.weight || 1),
      0,
    );
    let random = Math.random() * total;
    for (const item of pool) {
      random -= Math.max(1, item.weight || 1);
      if (random <= 0) {
        return item;
      }
    }
    return pool[0];
  }

  if (!lastPostId) {
    return items[0];
  }
  const index = items.findIndex((item) => item.id === lastPostId);
  if (index === -1) {
    return items[0];
  }
  return items[(index + 1) % items.length];
}

export async function processStatusRotations() {
  const now = new Date();
  const rotations = await db
    .select()
    .from(statusRotations)
    .where(
      and(
        eq(statusRotations.isActive, true),
        or(
          isNull(statusRotations.nextRunAt),
          lte(statusRotations.nextRunAt, now),
        ),
      ),
    )
    .orderBy(asc(statusRotations.nextRunAt), asc(statusRotations.createdAt));

  for (const rotation of rotations) {
    const items = await db
      .select()
      .from(statusRotationPosts)
      .where(
        and(
          eq(statusRotationPosts.rotationId, rotation.id),
          eq(statusRotationPosts.isActive, true),
        ),
      )
      .orderBy(
        asc(statusRotationPosts.displayOrder),
        asc(statusRotationPosts.createdAt),
      );

    if (items.length === 0) {
      await db
        .update(statusRotations)
        .set({
          lastError: "Nenhuma postagem ativa configurada na rotação",
          nextRunAt: addMinutes(now, RETRY_DELAY_MINUTES),
          updatedAt: now,
        })
        .where(eq(statusRotations.id, rotation.id));
      continue;
    }

    try {
      const selected = pickRotationPost(
        items.map((item) => ({ id: item.postId, weight: item.weight })),
        rotation.selectionMode,
        rotation.lastPostId,
      );

      await publishStatusPost({
        userId: rotation.userId,
        postId: selected.id,
        connectionId: rotation.connectionId,
        rotationId: rotation.id,
        runType: "rotation",
        triggeredBy: "rotation",
      });

      await db
        .update(statusRotations)
        .set({
          lastPostId: selected.id,
          lastRunAt: now,
          nextRunAt: addMinutes(
            now,
            Math.max(
              5,
              rotation.intervalMinutes || ROTATION_DEFAULT_INTERVAL_MINUTES,
            ),
          ),
          lastError: null,
          updatedAt: now,
        })
        .where(eq(statusRotations.id, rotation.id));

      await db
        .update(statusRotationPosts)
        .set({
          lastPublishedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(statusRotationPosts.rotationId, rotation.id),
            eq(statusRotationPosts.postId, selected.id),
          ),
        );
    } catch (error: any) {
      await db
        .update(statusRotations)
        .set({
          lastError: error?.message || "Falha ao executar rotação de status",
          nextRunAt: addMinutes(now, RETRY_DELAY_MINUTES),
          updatedAt: now,
        })
        .where(eq(statusRotations.id, rotation.id));
    }
  }
}

export async function listStatusPosts(userId: string) {
  const posts = await db
    .select()
    .from(statusPosts)
    .where(eq(statusPosts.userId, userId))
    .orderBy(desc(statusPosts.updatedAt), desc(statusPosts.createdAt));

  const postIds = posts.map((post) => post.id);
  const items = postIds.length
    ? await db
        .select()
        .from(statusPostItems)
        .where(inArray(statusPostItems.postId, postIds))
        .orderBy(
          asc(statusPostItems.displayOrder),
          asc(statusPostItems.createdAt),
        )
    : [];

  const grouped = new Map<string, StatusPostItem[]>();
  for (const item of items) {
    const list = grouped.get(item.postId) || [];
    list.push(item);
    grouped.set(item.postId, list);
  }

  return posts.map((post) => ({
    ...post,
    items: grouped.get(post.id) || [],
  }));
}

export async function listStatusJobs(userId: string) {
  const jobs = await db
    .select({
      id: statusPublishJobs.id,
      userId: statusPublishJobs.userId,
      postId: statusPublishJobs.postId,
      connectionId: statusPublishJobs.connectionId,
      mode: statusPublishJobs.mode,
      recurrenceType: statusPublishJobs.recurrenceType,
      timezone: statusPublishJobs.timezone,
      scheduledFor: statusPublishJobs.scheduledFor,
      timeOfDay: statusPublishJobs.timeOfDay,
      daysOfWeek: statusPublishJobs.daysOfWeek,
      dayOfMonth: statusPublishJobs.dayOfMonth,
      isActive: statusPublishJobs.isActive,
      status: statusPublishJobs.status,
      nextRunAt: statusPublishJobs.nextRunAt,
      lastRunAt: statusPublishJobs.lastRunAt,
      lastError: statusPublishJobs.lastError,
      createdAt: statusPublishJobs.createdAt,
      updatedAt: statusPublishJobs.updatedAt,
      postName: statusPosts.name,
    })
    .from(statusPublishJobs)
    .innerJoin(statusPosts, eq(statusPosts.id, statusPublishJobs.postId))
    .where(eq(statusPublishJobs.userId, userId))
    .orderBy(desc(statusPublishJobs.createdAt));

  return jobs;
}

export async function listStatusRotations(userId: string) {
  const rotations = await db
    .select()
    .from(statusRotations)
    .where(eq(statusRotations.userId, userId))
    .orderBy(desc(statusRotations.createdAt));

  const rotationIds = rotations.map((rotation) => rotation.id);
  const items = rotationIds.length
    ? await db
        .select({
          id: statusRotationPosts.id,
          rotationId: statusRotationPosts.rotationId,
          postId: statusRotationPosts.postId,
          displayOrder: statusRotationPosts.displayOrder,
          weight: statusRotationPosts.weight,
          isActive: statusRotationPosts.isActive,
          lastPublishedAt: statusRotationPosts.lastPublishedAt,
          createdAt: statusRotationPosts.createdAt,
          updatedAt: statusRotationPosts.updatedAt,
          postName: statusPosts.name,
        })
        .from(statusRotationPosts)
        .innerJoin(statusPosts, eq(statusPosts.id, statusRotationPosts.postId))
        .where(inArray(statusRotationPosts.rotationId, rotationIds))
        .orderBy(
          asc(statusRotationPosts.displayOrder),
          asc(statusRotationPosts.createdAt),
        )
    : [];

  const grouped = new Map<string, any[]>();
  for (const item of items) {
    const list = grouped.get(item.rotationId) || [];
    list.push(item);
    grouped.set(item.rotationId, list);
  }

  return rotations.map((rotation) => ({
    ...rotation,
    items: grouped.get(rotation.id) || [],
  }));
}

export async function listStatusHistory(
  userId: string,
  limit = 50,
): Promise<HistoryRun[]> {
  const runs = await db
    .select({
      id: statusPublishRuns.id,
      postId: statusPublishRuns.postId,
      postName: statusPosts.name,
      jobId: statusPublishRuns.jobId,
      rotationId: statusPublishRuns.rotationId,
      connectionId: statusPublishRuns.connectionId,
      runType: statusPublishRuns.runType,
      triggeredBy: statusPublishRuns.triggeredBy,
      status: statusPublishRuns.status,
      startedAt: statusPublishRuns.startedAt,
      completedAt: statusPublishRuns.completedAt,
      errorMessage: statusPublishRuns.errorMessage,
    })
    .from(statusPublishRuns)
    .innerJoin(statusPosts, eq(statusPosts.id, statusPublishRuns.postId))
    .where(eq(statusPublishRuns.userId, userId))
    .orderBy(desc(statusPublishRuns.startedAt))
    .limit(limit);

  const runIds = runs.map((run) => run.id);
  const items = runIds.length
    ? await db
        .select()
        .from(statusPublishRunItems)
        .where(inArray(statusPublishRunItems.runId, runIds))
        .orderBy(
          desc(statusPublishRunItems.createdAt),
          asc(statusPublishRunItems.displayOrder),
        )
    : [];

  const grouped = new Map<string, HistoryRun["items"]>();
  for (const item of items) {
    const list = grouped.get(item.runId) || [];
    list.push({
      id: item.id,
      displayOrder: item.displayOrder,
      type: item.type,
      textPreview: item.textPreview,
      storageUrl: item.storageUrl,
      caption: item.caption,
      status: item.status,
      sentAt: item.sentAt,
      errorMessage: item.errorMessage,
    });
    grouped.set(item.runId, list);
  }

  return runs.map((run) => ({
    ...run,
    items: grouped.get(run.id) || [],
  }));
}

export async function ensureStatusPostingTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS status_posts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id VARCHAR REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      default_caption TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS status_post_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id VARCHAR NOT NULL REFERENCES status_posts(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL,
      text TEXT,
      storage_url TEXT,
      mime_type VARCHAR(255),
      caption TEXT,
      duration_seconds INTEGER,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS status_publish_jobs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id VARCHAR NOT NULL REFERENCES status_posts(id) ON DELETE CASCADE,
      connection_id VARCHAR REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
      mode VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      recurrence_type VARCHAR(20) NOT NULL DEFAULT 'once',
      timezone VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
      scheduled_for TIMESTAMP,
      time_of_day VARCHAR(5),
      days_of_week JSONB NOT NULL DEFAULT '[]'::jsonb,
      day_of_month INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      next_run_at TIMESTAMP,
      last_run_at TIMESTAMP,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS status_rotations (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id VARCHAR REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      selection_mode VARCHAR(20) NOT NULL DEFAULT 'sequential',
      interval_minutes INTEGER NOT NULL DEFAULT 1440,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      next_run_at TIMESTAMP,
      last_run_at TIMESTAMP,
      last_post_id VARCHAR,
      last_error TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS status_rotation_posts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      rotation_id VARCHAR NOT NULL REFERENCES status_rotations(id) ON DELETE CASCADE,
      post_id VARCHAR NOT NULL REFERENCES status_posts(id) ON DELETE CASCADE,
      display_order INTEGER NOT NULL DEFAULT 0,
      weight INTEGER NOT NULL DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_published_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS status_publish_runs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id VARCHAR NOT NULL REFERENCES status_posts(id) ON DELETE CASCADE,
      job_id VARCHAR REFERENCES status_publish_jobs(id) ON DELETE SET NULL,
      rotation_id VARCHAR REFERENCES status_rotations(id) ON DELETE SET NULL,
      connection_id VARCHAR REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
      run_type VARCHAR(20) NOT NULL,
      triggered_by VARCHAR(50) NOT NULL DEFAULT 'system',
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS status_publish_run_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id VARCHAR NOT NULL REFERENCES status_publish_runs(id) ON DELETE CASCADE,
      post_item_id VARCHAR REFERENCES status_post_items(id) ON DELETE SET NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      type VARCHAR(20) NOT NULL,
      text_preview TEXT,
      storage_url TEXT,
      caption TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMP,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_status_posts_user ON status_posts(user_id);
    CREATE INDEX IF NOT EXISTS idx_status_posts_active ON status_posts(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_status_post_items_post ON status_post_items(post_id);
    CREATE INDEX IF NOT EXISTS idx_status_publish_jobs_status ON status_publish_jobs(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_status_rotations_next_run ON status_rotations(is_active, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_status_publish_runs_user ON status_publish_runs(user_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_status_publish_run_items_run ON status_publish_run_items(run_id, display_order);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_status_rotation_posts_unique ON status_rotation_posts(rotation_id, post_id);
  `);

  console.log("[MIGRATION] Status posts tables ensured");
}

export async function sendStatusPostForUser(
  userId: string,
  payload: StatusPostPayload,
  options?: {
    preferredConnectionId?: string | null;
  },
) {
  const candidate = await resolveStatusGatewayCandidate(
    userId,
    options?.preferredConnectionId,
  );
  if (candidate) {
    const owner = await resolveAppVisibleConnectionOwner(candidate);
    if (owner === "gateway" && !isWhatsAppGatewayRuntime()) {
      return sendGatewayStatusPost(candidate.id, payload as Record<string, unknown>);
    }
  }

  const resolved = await resolveStatusSocket(
    userId,
    options?.preferredConnectionId,
  );

  const [audience, privacy] = await Promise.all([
    resolveStatusAudience(userId, resolved.connectionId, resolved.session),
    resolveStatusPrivacyDiagnostics(resolved.socket),
  ]);
  if (audience.statusJidList.length === 0) {
    throw new Error("Nenhum contato sincronizado para receber o status");
  }

  const resolvedPayload = await buildPayloadForSend(payload);
  const timeoutMs = getStatusSendTimeoutMs();
  console.log(
    `[STATUS POSTS] Sending status for ${userId.slice(0, 8)}... conn=${resolved.connectionId.slice(0, 8)} audience=${audience.audienceCount} source=${audience.audienceSource} privacy=${privacy.statusPrivacy || "unknown"} timeoutMs=${timeoutMs}`,
  );
  const result = await withStatusSendTimeout(
    messageQueueService.executeWithDelay(
      userId,
      "status post",
      async () =>
        sendStatusPostToSocket(
          resolved.socket,
          resolvedPayload,
          audience.statusJidList,
        ),
      { yieldQueue: true },
    ),
    timeoutMs,
  );
  console.log(
    `[STATUS POSTS] Status send finished for ${userId.slice(0, 8)}... conn=${resolved.connectionId.slice(0, 8)} audience=${audience.audienceCount} source=${audience.audienceSource} privacy=${privacy.statusPrivacy || "unknown"}`,
  );

  return {
    result,
    statusJidList: audience.statusJidList,
    audienceCount: audience.audienceCount,
    connectionId: resolved.connectionId,
    audienceSource: audience.audienceSource,
    statusPrivacy: privacy.statusPrivacy,
    statusPrivacyLabel: privacy.statusPrivacyLabel,
  };
}
