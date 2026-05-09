import {
  extractIdentityPersonKey,
  isLidWhatsAppJid,
  isPersonalWhatsAppJid,
  normalizeWhatsAppIdentity,
} from "./whatsappContactIdentity";

const STATUS_POST_KIND = "status-post";
const STATUS_JID = "status@broadcast";

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

export type StatusAudienceEntry = {
  phoneNumber?: string | null;
  primaryId?: string | null;
  lid?: string | null;
};

export type StatusPrivacyValue =
  | "all"
  | "contacts"
  | "contact_blacklist"
  | "none"
  | null;

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

function normalizeStatusAudienceCandidate(value: string | null | undefined) {
  const normalized = normalizeWhatsAppIdentity(value);
  if (!normalized) {
    return null;
  }

  if (
    normalized === STATUS_JID ||
    normalized.endsWith("@g.us") ||
    normalized.endsWith("@broadcast") ||
    normalized.endsWith("@newsletter") ||
    normalized.endsWith("@bot")
  ) {
    return null;
  }

  return normalized;
}

function buildAudiencePersonKey(value: string | null | undefined) {
  return extractIdentityPersonKey(value);
}

function isExplicitPersonalWhatsAppJid(value: string | null | undefined) {
  const rawValue = String(value || "").trim().toLowerCase();
  if (
    !rawValue.endsWith("@s.whatsapp.net") &&
    !rawValue.endsWith("@c.us")
  ) {
    return false;
  }

  return isPersonalWhatsAppJid(value);
}

function getAudienceCandidatePriority(
  source: "primary" | "lid" | "phone",
  rawValue: string,
  personSignals?: {
    hasLidIdentity: boolean;
    hasExplicitPhoneJid: boolean;
  },
) {
  const normalized = normalizeStatusAudienceCandidate(rawValue);
  const isWhatsappPn = isPersonalWhatsAppJid(normalized);
  const isLid = isLidWhatsAppJid(normalized);

  if (source === "primary" && isWhatsappPn) {
    if (personSignals?.hasLidIdentity && !personSignals.hasExplicitPhoneJid) {
      const rawPhoneValue = String(rawValue || "").trim();
      const rawAtIndex = rawPhoneValue.indexOf("@");
      if (rawAtIndex >= 0 && rawPhoneValue.toLowerCase().endsWith("@s.whatsapp.net")) {
        return 1;
      }
    }
    return 4;
  }

  if (source === "primary" && isLid) {
    return 3;
  }

  if (source === "lid" && isLid) {
    return 2;
  }

  if (source === "phone") {
    return 1;
  }

  return 0;
}

export function normalizeStatusAudienceCandidates(
  values: Array<string | null | undefined>,
) {
  const unique = new Set<string>();

  for (const value of values) {
    const normalized = normalizeStatusAudienceCandidate(value);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

function chunkStatusAudience(values: string[], chunkSize: number) {
  const chunks: string[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

async function resolveReachableStatusJidList(socket: any, statusJidList: string[]) {
  const normalizedAudience = normalizeStatusAudienceCandidates(statusJidList);
  if (!socket?.onWhatsApp) {
    return normalizedAudience;
  }

  const lidAudience: string[] = [];
  const phoneAudience: string[] = [];

  for (const jid of normalizedAudience) {
    if (isLidWhatsAppJid(jid)) {
      lidAudience.push(jid);
      continue;
    }

    if (isPersonalWhatsAppJid(jid)) {
      phoneAudience.push(jid);
    }
  }

  if (phoneAudience.length === 0) {
    return normalizedAudience;
  }

  const validatedAudience = new Set<string>(lidAudience);

  for (const chunk of chunkStatusAudience(phoneAudience, 250)) {
    const results = await socket.onWhatsApp(...chunk);
    for (const entry of results || []) {
      if (!entry?.exists) {
        continue;
      }

      const normalizedJid = normalizeStatusAudienceCandidate(entry.jid);
      if (normalizedJid && isPersonalWhatsAppJid(normalizedJid)) {
        validatedAudience.add(normalizedJid);
      }
    }
  }

  return Array.from(validatedAudience);
}

export function buildStatusAudienceCandidates(entries: StatusAudienceEntry[]) {
  const personSignals = new Map<
    string,
    {
      hasLidIdentity: boolean;
      hasExplicitPhoneJid: boolean;
    }
  >();

  for (const entry of entries) {
    const personKey =
      buildAudiencePersonKey(entry.primaryId) ||
      buildAudiencePersonKey(entry.lid) ||
      buildAudiencePersonKey(entry.phoneNumber);

    if (!personKey) {
      continue;
    }

    const current = personSignals.get(personKey) || {
      hasLidIdentity: false,
      hasExplicitPhoneJid: false,
    };
    if (isLidWhatsAppJid(entry.primaryId) || isLidWhatsAppJid(entry.lid)) {
      current.hasLidIdentity = true;
    }
    if (isExplicitPersonalWhatsAppJid(entry.phoneNumber)) {
      current.hasExplicitPhoneJid = true;
    }
    personSignals.set(personKey, current);
  }

  const personMap = new Map<
    string,
    {
      candidate: string;
      priority: number;
    }
  >();

  for (const entry of entries) {
    const primaryId = String(entry.primaryId || "").trim();
    const lid = String(entry.lid || "").trim();
    const phoneNumber = String(entry.phoneNumber || "").trim();
    const normalizedPrimary = normalizeStatusAudienceCandidate(primaryId);
    const normalizedLid = normalizeStatusAudienceCandidate(lid);
    const normalizedPhone = normalizeStatusAudienceCandidate(phoneNumber);

    const personKey =
      buildAudiencePersonKey(primaryId) ||
      buildAudiencePersonKey(lid) ||
      buildAudiencePersonKey(phoneNumber);

    if (!personKey) {
      continue;
    }

    const candidates: Array<{
      value: string | null;
      priority: number;
    }> = [
      {
        value: normalizedPrimary,
        priority: getAudienceCandidatePriority(
          "primary",
          primaryId,
          personSignals.get(personKey),
        ),
      },
      {
        value: normalizedLid,
        priority: getAudienceCandidatePriority(
          "lid",
          lid,
          personSignals.get(personKey),
        ),
      },
      {
        value: normalizedPhone,
        priority: getAudienceCandidatePriority(
          "phone",
          phoneNumber,
          personSignals.get(personKey),
        ),
      },
    ];

    for (const candidate of candidates) {
      if (!candidate.value || candidate.priority <= 0) {
        continue;
      }

      const existing = personMap.get(personKey);
      if (!existing || candidate.priority > existing.priority) {
        personMap.set(personKey, {
          candidate: candidate.value,
          priority: candidate.priority,
        });
      }
    }
  }

  return Array.from(personMap.values()).map((entry) => entry.candidate);
}

export function normalizeStatusPrivacyValue(
  rawValue: unknown,
): StatusPrivacyValue {
  const value = String(rawValue || "")
    .trim()
    .toLowerCase();

  if (
    value === "all" ||
    value === "contacts" ||
    value === "contact_blacklist" ||
    value === "none"
  ) {
    return value;
  }

  return null;
}

export function describeStatusPrivacyValue(value: StatusPrivacyValue) {
  if (value === "all") {
    return "todos";
  }

  if (value === "contacts") {
    return "meus contatos";
  }

  if (value === "contact_blacklist") {
    return "meus contatos, exceto alguns";
  }

  if (value === "none") {
    return "lista restrita";
  }

  return "privacidade desconhecida";
}

function normalizeStatusPostPayload(
  payload: Partial<StatusPostPayload>,
): StatusPostPayload {
  return {
    kind: STATUS_POST_KIND,
    version: 2,
    connectionId: String(payload.connectionId || "").trim() || null,
    contentType: payload.contentType || "text",
    text: String(payload.text || "").trim(),
    caption: String(payload.caption || "").trim() || null,
    mediaUrl: String(payload.mediaUrl || "").trim() || null,
    mimeType: String(payload.mimeType || "").trim() || null,
    fileName: String(payload.fileName || "").trim() || null,
    storagePath: String(payload.storagePath || "").trim() || null,
    selectedWeekdays: normalizeSelectedWeekdays(payload.selectedWeekdays),
    aiVariationEnabled: Boolean(payload.aiVariationEnabled),
    aiVariationPrompt: String(payload.aiVariationPrompt || "").trim() || null,
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
) {
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
    if (parsed?.kind === STATUS_POST_KIND) {
      return normalizeStatusPostPayload(parsed);
    }
  } catch {
    // Plain text legacy payload.
  }

  return normalizeStatusPostPayload({ contentType: "text", text: rawValue });
}

export function getStatusPostSummary(payload: StatusPostPayload) {
  if (payload.contentType === "text") {
    return payload.text || "Texto";
  }

  return payload.caption || payload.fileName || payload.mediaUrl || "Midia";
}

async function resolveMediaBuffer(mediaUrl: string) {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar a midia (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType:
      response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function buildStatusMessageContent(payload: StatusPostPayload) {
  const caption = payload.caption || payload.text || undefined;

  if (payload.contentType === "text") {
    const text = String(payload.text || "").trim();
    if (!text) {
      throw new Error("Digite o texto do status");
    }
    return { text };
  }

  const mediaUrl = String(payload.mediaUrl || "").trim();
  if (!mediaUrl) {
    throw new Error("Midia ausente para o status");
  }

  const media = await resolveMediaBuffer(mediaUrl);
  const mimeType = payload.mimeType || media.mimeType;

  if (payload.contentType === "image") {
    return {
      image: media.buffer,
      mimetype: mimeType || "image/png",
      caption,
    };
  }

  if (payload.contentType === "video") {
    return {
      video: media.buffer,
      mimetype: mimeType || "video/mp4",
      caption,
    };
  }

  return {
    audio: media.buffer,
    mimetype: mimeType || "audio/ogg; codecs=opus",
    ptt: false,
  };
}

export async function sendStatusPostToSocket(
  socket: any,
  payload: StatusPostPayload,
  statusJidList: string[],
) {
  if (statusJidList.length === 0) {
    throw new Error("Nenhum contato sincronizado para receber o status");
  }

  const reachableAudience = await resolveReachableStatusJidList(
    socket,
    statusJidList,
  );
  if (reachableAudience.length === 0) {
    throw new Error("Nenhum contato válido para receber o status");
  }

  const content = await buildStatusMessageContent(payload);
  return socket.sendMessage(STATUS_JID, content, {
    broadcast: true,
    statusJidList: reachableAudience,
    useUserDevicesCache: false,
  });
}
