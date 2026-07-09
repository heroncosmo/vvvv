export const STATUS_BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const STATUS_BRAZIL_UTC_OFFSET = "-03:00";

type StatusBrazilParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeDateTimeInput(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (!trimmed.includes("T") && trimmed.includes(" ")) {
    const parts = trimmed.split(" ");
    const datePart = parts.shift() || "";
    return [datePart, parts.join(" ")].filter(Boolean).join("T");
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

export function getStatusBrazilParts(reference: Date = new Date()): StatusBrazilParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STATUS_BRAZIL_TIME_ZONE,
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

export function fromStatusBrazilParts(parts: StatusBrazilParts) {
  return new Date(
    `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}T${padDatePart(parts.hour)}:${padDatePart(parts.minute)}:${padDatePart(parts.second)}${STATUS_BRAZIL_UTC_OFFSET}`,
  );
}

export function parseStatusBrazilDateTime(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value) : null;
  }

  const normalized = normalizeDateTimeInput(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(
    hasExplicitTimeZone(normalized)
      ? normalized
      : `${normalized}${STATUS_BRAZIL_UTC_OFFSET}`,
  );
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function formatStatusBrazilTime(value: Date | string | null | undefined) {
  const parsed = parseStatusBrazilDateTime(value);
  if (!parsed) {
    return "-";
  }

  return parsed.toLocaleTimeString("pt-BR", {
    timeZone: STATUS_BRAZIL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function startOfStatusBrazilMinute(date: Date) {
  const parts = getStatusBrazilParts(date);
  return fromStatusBrazilParts({ ...parts, second: 0 });
}

export function getStatusBrazilWeekday(date: Date) {
  const parts = getStatusBrazilParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function addStatusBrazilDays(date: Date, days: number) {
  const parts = getStatusBrazilParts(date);
  const pseudo = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  pseudo.setUTCDate(pseudo.getUTCDate() + days);

  return fromStatusBrazilParts({
    year: pseudo.getUTCFullYear(),
    month: pseudo.getUTCMonth() + 1,
    day: pseudo.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  });
}

function getLastBrazilMonthDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addStatusBrazilMonths(date: Date, months: number) {
  const parts = getStatusBrazilParts(date);
  const pseudo = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  pseudo.setUTCMonth(pseudo.getUTCMonth() + months);
  const year = pseudo.getUTCFullYear();
  const month = pseudo.getUTCMonth() + 1;

  return fromStatusBrazilParts({
    year,
    month,
    day: Math.min(parts.day, getLastBrazilMonthDay(year, month)),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  });
}
