export type ResellerReceiptKind =
  | "client_creation"
  | "client_renewal"
  | "reseller_invoice"
  | "reseller_payment"
  | "unknown";

export interface ResellerReceiptContext {
  kind: ResellerReceiptKind;
  resellerId?: string;
  clientId?: string;
  paymentId?: string;
  invoiceId?: number;
}

type LooseRecord = Record<string, unknown>;

const RESELLER_RECEIPT_PREFIX = "Comprovante de revendedor";

function toObject(value: unknown): LooseRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as LooseRecord;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStructuredLine(line: string): Partial<ResellerReceiptContext> {
  const context: Partial<ResellerReceiptContext> = {};
  const segments = line
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = segment.slice(0, separatorIndex).trim();
    const rawValue = segment.slice(separatorIndex + 1).trim();
    if (!rawValue) continue;

    if (key === "kind") {
      context.kind = rawValue as ResellerReceiptKind;
      continue;
    }
    if (key === "resellerId") {
      context.resellerId = rawValue;
      continue;
    }
    if (key === "clientId") {
      context.clientId = rawValue;
      continue;
    }
    if (key === "paymentId") {
      context.paymentId = rawValue;
      continue;
    }
    if (key === "invoiceId") {
      const invoiceId = cleanNumber(rawValue);
      if (invoiceId !== undefined) {
        context.invoiceId = invoiceId;
      }
    }
  }

  return context;
}

function parseLegacyLine(line: string): Partial<ResellerReceiptContext> {
  const normalized = line.trim();
  const context: Partial<ResellerReceiptContext> = {};

  const resellerMarker = "Reseller ID:";
  const resellerIndex = normalized.indexOf(resellerMarker);
  if (resellerIndex >= 0) {
    const resellerValue = normalized
      .slice(resellerIndex + resellerMarker.length)
      .split(" - ")[0]
      .trim();
    if (resellerValue) {
      context.resellerId = resellerValue;
    }
  }

  const clientMarker = "Client ID:";
  const clientIndex = normalized.indexOf(clientMarker);
  if (clientIndex >= 0) {
    const clientValue = normalized
      .slice(clientIndex + clientMarker.length)
      .split(" - ")[0]
      .trim();
    if (clientValue) {
      context.clientId = clientValue;
      context.kind = "client_renewal";
    }
  }

  if (!context.kind && normalized.includes(RESELLER_RECEIPT_PREFIX)) {
    context.kind = "client_creation";
  }

  return context;
}

export function buildResellerReceiptAdminNotes(
  context: ResellerReceiptContext,
  userNotes?: string | null,
): string {
  const segments = [
    RESELLER_RECEIPT_PREFIX,
    `kind=${context.kind}`,
    context.resellerId ? `resellerId=${context.resellerId}` : null,
    context.clientId ? `clientId=${context.clientId}` : null,
    context.paymentId ? `paymentId=${context.paymentId}` : null,
    typeof context.invoiceId === "number" ? `invoiceId=${context.invoiceId}` : null,
  ].filter(Boolean);

  const baseLine = segments.join(" | ");
  const extraNote = cleanString(userNotes);
  return extraNote ? `${baseLine}\n${extraNote}` : baseLine;
}

export function appendAdminReviewNote(existingNotes?: string | null, reviewNote?: string | null): string | null {
  const base = cleanString(existingNotes);
  const note = cleanString(reviewNote);

  if (!base && !note) return null;
  if (!note) return base || null;
  if (!base) return note;
  if (base.includes(note)) return base;
  return `${base}\nAdmin: ${note}`;
}

export function parseResellerReceiptContext(notes?: string | null): ResellerReceiptContext | null {
  const rawNotes = cleanString(notes);
  if (!rawNotes) return null;

  const newlineIndex = rawNotes.indexOf("\n");
  const carriageIndex = rawNotes.indexOf("\r");
  let cutIndex = -1;
  if (newlineIndex >= 0 && carriageIndex >= 0) {
    cutIndex = Math.min(newlineIndex, carriageIndex);
  } else {
    cutIndex = Math.max(newlineIndex, carriageIndex);
  }
  const firstLine = (cutIndex >= 0 ? rawNotes.slice(0, cutIndex) : rawNotes).trim();
  if (!firstLine) return null;

  let parsed: Partial<ResellerReceiptContext> = {};
  if (firstLine.includes("|")) {
    parsed = parseStructuredLine(firstLine);
  } else if (firstLine.includes(RESELLER_RECEIPT_PREFIX)) {
    parsed = parseLegacyLine(firstLine);
  } else {
    return null;
  }

  return {
    kind: parsed.kind || "unknown",
    resellerId: parsed.resellerId,
    clientId: parsed.clientId,
    paymentId: parsed.paymentId,
    invoiceId: parsed.invoiceId,
  };
}

export function parseResellerPaymentStatusDetail(statusDetail?: string | null): LooseRecord | null {
  const raw = cleanString(statusDetail);
  if (!raw) return null;

  try {
    return toObject(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function mergeResellerPaymentStatusDetail(
  existingStatusDetail: string | null | undefined,
  patch: LooseRecord,
): string {
  const existing = parseResellerPaymentStatusDetail(existingStatusDetail);
  if (existing) {
    return JSON.stringify({ ...existing, ...patch });
  }

  const fallback = cleanString(existingStatusDetail);
  return JSON.stringify({
    ...(fallback ? { legacyStatusDetail: fallback } : {}),
    ...patch,
  });
}
