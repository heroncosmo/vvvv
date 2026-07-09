export const QR_RECONNECT_CUTOFF_DRIFT_MS = 5_000;
export const QR_RECONNECT_PERSISTED_QR_HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;
export const AI_MANUAL_REENABLE_BACKLOG_CUTOFF_REASON = "ai_manual_reenable_backlog_cutoff";

type SessionDataConnectionLike = {
  sessionData?: unknown;
} | null | undefined;

type RuntimeSessionLike = {
  qrIssuedAt?: number | null;
  connectedAt?: number | null;
} | null | undefined;

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTimestampMs(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value < 10_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getRuntimeDiagnostics(sessionData: unknown): Record<string, unknown> | null {
  if (!isRecordValue(sessionData)) {
    return null;
  }

  return isRecordValue(sessionData.runtimeDiagnostics)
    ? sessionData.runtimeDiagnostics
    : null;
}

export function getLastQrCodeIssuedAtMsFromSessionData(sessionData: unknown): number | null {
  const runtimeDiagnostics = getRuntimeDiagnostics(sessionData);
  const lastQrCode = runtimeDiagnostics && isRecordValue(runtimeDiagnostics.lastQrCode)
    ? runtimeDiagnostics.lastQrCode
    : null;

  return lastQrCode ? parseTimestampMs(lastQrCode.at) : null;
}

export function getQrReconnectCutoffMsFromSessionData(sessionData: unknown): number | null {
  const runtimeDiagnostics = getRuntimeDiagnostics(sessionData);
  if (!runtimeDiagnostics) {
    return null;
  }

  const explicitCutoffValues = [
    runtimeDiagnostics.lastQrReconnectCutoff,
    runtimeDiagnostics.lastManualReconnectCutoff,
    runtimeDiagnostics.lastAiManualReenabledCutoff,
  ]
    .map((entry) => (isRecordValue(entry) ? parseTimestampMs(entry.at) : null))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

  if (explicitCutoffValues.length > 0) {
    return Math.max(...explicitCutoffValues);
  }

  // If a QR was issued but the open cutoff was not persisted yet, the QR
  // timestamp is still the safest boundary for imported WhatsApp backlog.
  return getLastQrCodeIssuedAtMsFromSessionData(sessionData);
}

export function mergeAiManualReenabledCutoffSessionData(
  sessionData: unknown,
  event: {
    at: string;
    source?: string;
    details?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const root = isRecordValue(sessionData) ? { ...sessionData } : {};
  const runtimeDiagnostics = isRecordValue(root.runtimeDiagnostics)
    ? { ...root.runtimeDiagnostics }
    : {};

  runtimeDiagnostics.lastAiManualReenabledCutoff = {
    at: event.at,
    reason: AI_MANUAL_REENABLE_BACKLOG_CUTOFF_REASON,
    source: event.source || null,
    details: event.details ? { ...event.details } : {},
  };

  root.runtimeDiagnostics = runtimeDiagnostics;
  return root;
}

export function getQrReconnectCutoffMs(
  connection?: SessionDataConnectionLike,
  session?: RuntimeSessionLike,
): number | null {
  const persistedCutoff = getQrReconnectCutoffMsFromSessionData(connection?.sessionData);
  if (persistedCutoff) {
    return persistedCutoff;
  }

  const sessionQrIssuedAt = session?.qrIssuedAt;
  if (typeof sessionQrIssuedAt !== "number" || !Number.isFinite(sessionQrIssuedAt) || sessionQrIssuedAt <= 0) {
    return null;
  }

  const sessionCutoff = session?.connectedAt || sessionQrIssuedAt;
  return typeof sessionCutoff === "number" && Number.isFinite(sessionCutoff) && sessionCutoff > 0
    ? sessionCutoff
    : null;
}

export function shouldSuppressAutoReplyForQrReconnectBacklog(
  connection: SessionDataConnectionLike,
  eventTs: Date,
  session?: RuntimeSessionLike,
): boolean {
  const cutoffMs = getQrReconnectCutoffMs(connection, session);
  const eventMs = parseTimestampMs(eventTs);
  return !!cutoffMs && !!eventMs && eventMs < cutoffMs - QR_RECONNECT_CUTOFF_DRIFT_MS;
}

export function getMessageTimestampMs(message: unknown): number | null {
  if (!isRecordValue(message)) {
    return null;
  }

  return parseTimestampMs(message.timestamp ?? message.createdAt ?? message.created_at);
}

export function getInboundMessageTextsAtOrAfterQrReconnectCutoff(
  messages: unknown[],
  cutoffMs: number,
): string[] {
  const threshold = cutoffMs - QR_RECONNECT_CUTOFF_DRIFT_MS;
  return messages
    .filter((message) => {
      if (!isRecordValue(message) || message.fromMe === true) {
        return false;
      }
      const timestampMs = getMessageTimestampMs(message);
      return timestampMs !== null && timestampMs >= threshold;
    })
    .map((message) => {
      const text = isRecordValue(message) ? message.text : null;
      return typeof text === "string" && text.trim() ? text : "[mensagem recebida]";
    });
}

export function hasInboundMessageAtOrAfterQrReconnectCutoff(
  messages: unknown[],
  cutoffMs: number,
): boolean {
  return getInboundMessageTextsAtOrAfterQrReconnectCutoff(messages, cutoffMs).length > 0;
}

export function getUnansweredInboundTextsAtOrAfterQrReconnectCutoff(
  messages: unknown[],
  cutoffMs: number,
): string[] {
  const threshold = cutoffMs - QR_RECONNECT_CUTOFF_DRIFT_MS;
  const texts: string[] = [];

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!isRecordValue(message)) {
      continue;
    }

    if (message.fromMe === true) {
      break;
    }

    const timestampMs = getMessageTimestampMs(message);
    if (timestampMs === null || timestampMs < threshold) {
      continue;
    }

    const text = message.text;
    texts.unshift(typeof text === "string" && text.trim() ? text : "[mensagem recebida]");
  }

  return texts;
}
