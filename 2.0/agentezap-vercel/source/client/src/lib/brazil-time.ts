const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const BRAZIL_UTC_OFFSET = "-03:00";

function normalizeBrazilDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const hasOffset = /([zZ]|[+\-]\d{2}:\d{2})$/.test(normalized);
  return hasOffset ? normalized : `${normalized}${BRAZIL_UTC_OFFSET}`;
}

function getBrazilParts(reference: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(reference);

  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.get("year") || "0"),
    month: Number(byType.get("month") || "0"),
    day: Number(byType.get("day") || "0"),
    hour: Number(byType.get("hour") || "0"),
    minute: Number(byType.get("minute") || "0"),
    second: Number(byType.get("second") || "0"),
  };
}

export function parseBrazilDateTime(value?: string | Date | null) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const normalized = normalizeBrazilDateInput(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function formatBrazilDateTime(
  value?: string | Date | null,
  options?: Intl.DateTimeFormatOptions,
) {
  const parsed = parseBrazilDateTime(value);
  if (!parsed) return "-";

  return parsed.toLocaleString("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

export function formatBrazilDate(value?: string | Date | null, options?: Intl.DateTimeFormatOptions) {
  const parsed = parseBrazilDateTime(value);
  if (!parsed) return "-";

  return parsed.toLocaleDateString("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  });
}

export function formatBrazilTime(value?: string | Date | null, options?: Intl.DateTimeFormatOptions) {
  const parsed = parseBrazilDateTime(value);
  if (!parsed) return "-";

  return parsed.toLocaleTimeString("pt-BR", {
    timeZone: BRAZIL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

export function getBrazilNowDate(reference: Date = new Date()) {
  const parts = getBrazilParts(reference);
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
}

export function getBrazilDateInputValue(reference: Date = new Date()) {
  const brazilNow = getBrazilNowDate(reference);
  const year = brazilNow.getFullYear().toString().padStart(4, "0");
  const month = String(brazilNow.getMonth() + 1).padStart(2, "0");
  const day = String(brazilNow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getBrazilDateTimeLocalInputValue(reference: Date = new Date()) {
  const brazilNow = getBrazilNowDate(reference);
  const date = getBrazilDateInputValue(brazilNow);
  const hours = String(brazilNow.getHours()).padStart(2, "0");
  const minutes = String(brazilNow.getMinutes()).padStart(2, "0");
  return `${date}T${hours}:${minutes}`;
}

export function buildBrazilDateTimeRequest(date: string, time: string) {
  const safeTime = String(time || "").trim();
  if (!date || !safeTime) {
    return "";
  }

  const normalizedTime = safeTime.length === 5 ? `${safeTime}:00` : safeTime;
  return `${date}T${normalizedTime}`;
}
