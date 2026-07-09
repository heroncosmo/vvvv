import { getBrazilTimeParts, type BrazilTimeParts } from "./greetingTime";

export const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
export const BRAZIL_UTC_OFFSET = "-03:00";

function buildWallClockDate(parts: BrazilTimeParts): Date {
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

function cloneWallClockDate(value: Date): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    0,
  );
}

function normalizeDateTimeInput(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (!trimmed.includes("T") && trimmed.includes(" ")) {
    return trimmed.replace(" ", "T");
  }

  return trimmed;
}

function hasExplicitTimeZone(value: string): boolean {
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

function parseWallClockParts(value: string): BrazilTimeParts | null {
  const normalized = normalizeDateTimeInput(value);
  if (!normalized) {
    return null;
  }

  const [datePart = "", timePartRaw = "00:00:00"] = normalized.split("T");
  const [yearRaw = "", monthRaw = "", dayRaw = ""] = datePart.split("-");
  const [hourRaw = "00", minuteRaw = "00", secondRaw = "00"] = timePartRaw.split(":");

  const parts = {
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
    hour: Number(hourRaw),
    minute: Number(minuteRaw),
    second: Number((secondRaw || "00").slice(0, 2)),
  } satisfies BrazilTimeParts;

  if (Object.values(parts).some((part) => Number.isNaN(part))) {
    return null;
  }

  return parts;
}

function formatDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

export function toBrazilWallClockDate(reference: Date = new Date()): Date {
  if (!Number.isFinite(reference.getTime())) {
    return new Date(Number.NaN);
  }

  return buildWallClockDate(getBrazilTimeParts(reference));
}

export function getBrazilWallClockNow(reference: Date = new Date()): Date {
  return toBrazilWallClockDate(reference);
}

export function parseBrazilWallClockDateTime(value?: string | Date | null): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? cloneWallClockDate(value) : null;
  }

  const normalized = normalizeDateTimeInput(value);
  if (!normalized) {
    return null;
  }

  if (hasExplicitTimeZone(normalized)) {
    const parsed = new Date(normalized);
    return Number.isFinite(parsed.getTime()) ? toBrazilWallClockDate(parsed) : null;
  }

  const parts = parseWallClockParts(normalized);
  if (!parts) {
    return null;
  }

  return buildWallClockDate(parts);
}

export function formatBrazilWallClockDate(value?: string | Date | null): string | null {
  const parsed = parseBrazilWallClockDateTime(value);
  if (!parsed) {
    return null;
  }

  return [
    parsed.getFullYear().toString().padStart(4, "0"),
    formatDatePart(parsed.getMonth() + 1),
    formatDatePart(parsed.getDate()),
  ].join("-");
}

export function serializeBrazilWallClockDateTime(value?: string | Date | null): string | null {
  const parsed = parseBrazilWallClockDateTime(value);
  if (!parsed) {
    return null;
  }

  const date = formatBrazilWallClockDate(parsed);
  if (!date) {
    return null;
  }

  const time = [
    formatDatePart(parsed.getHours()),
    formatDatePart(parsed.getMinutes()),
    formatDatePart(parsed.getSeconds()),
  ].join(":");

  return `${date}T${time}${BRAZIL_UTC_OFFSET}`;
}
