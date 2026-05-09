export const DEFAULT_CALENDAR_TIMEZONE = "America/Sao_Paulo";

interface CalendarDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const timeZoneFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimeZoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = timeZoneFormatterCache.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  timeZoneFormatterCache.set(timeZone, formatter);
  return formatter;
}

function readTimeZoneParts(date: Date, timeZone: string): CalendarDateTimeParts {
  const formattedParts = getTimeZoneFormatter(timeZone).formatToParts(date);
  const values: Partial<Record<keyof CalendarDateTimeParts, number>> = {};

  for (const part of formattedParts) {
    if (
      part.type === "year"
      || part.type === "month"
      || part.type === "day"
      || part.type === "hour"
      || part.type === "minute"
      || part.type === "second"
    ) {
      values[part.type] = Number(part.value);
    }
  }

  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function formatCalendarDateTimeParts(parts: CalendarDateTimeParts): string {
  return [
    `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`,
  ].join("T");
}

function hasExplicitTimeZone(value: string): boolean {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  if (normalized.endsWith("Z") || normalized.endsWith("z")) {
    return true;
  }

  const plusIndex = normalized.lastIndexOf("+");
  const minusIndex = normalized.lastIndexOf("-");
  const offsetIndex = Math.max(plusIndex, minusIndex);
  const timeSeparatorIndex = normalized.indexOf("T");

  if (offsetIndex <= timeSeparatorIndex) {
    return false;
  }

  const offset = normalized.slice(offsetIndex);
  return offset.length === 6 && offset[3] === ":";
}

function parseCalendarDateTimeParts(value: string): CalendarDateTimeParts | null {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const [datePart = "", rawTimePart = "00:00:00"] = normalized.split("T");
  const [yearRaw = "", monthRaw = "", dayRaw = ""] = datePart.split("-");
  const [hourRaw = "00", minuteRaw = "00", secondRaw = "00"] = normalizeCalendarTime(rawTimePart).split(":");

  const parts = {
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
    hour: Number(hourRaw),
    minute: Number(minuteRaw),
    second: Number(secondRaw),
  } satisfies CalendarDateTimeParts;

  if (Object.values(parts).some((valuePart) => Number.isNaN(valuePart))) {
    return null;
  }

  return parts;
}

function formatLocalDateTime(date: Date, timeZone: string = DEFAULT_CALENDAR_TIMEZONE): string {
  return formatCalendarDateTimeParts(readTimeZoneParts(date, timeZone));
}

export function normalizeCalendarTime(time: string): string {
  const [rawHour = "00", rawMinute = "00", rawSecond = "00"] = String(time || "").split(":");
  const hour = rawHour.padStart(2, "0");
  const minute = rawMinute.padStart(2, "0");
  const second = rawSecond.padStart(2, "0");
  return `${hour}:${minute}:${second}`;
}

export function buildCalendarDateTime(date: string, time: string): string {
  return `${date}T${normalizeCalendarTime(time)}`;
}

export function parseCalendarDateTimeWithTimeZone(
  value: string,
  timeZone: string = DEFAULT_CALENDAR_TIMEZONE,
): Date {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return new Date(Number.NaN);
  }

  if (hasExplicitTimeZone(normalized)) {
    return new Date(normalized);
  }

  const parts = parseCalendarDateTimeParts(normalized);
  if (!parts) {
    return new Date(normalized);
  }

  const targetUtcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  let candidateUtcTime = targetUtcTime;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observedParts = readTimeZoneParts(new Date(candidateUtcTime), timeZone);
    const observedUtcTime = Date.UTC(
      observedParts.year,
      observedParts.month - 1,
      observedParts.day,
      observedParts.hour,
      observedParts.minute,
      observedParts.second,
    );
    const difference = observedUtcTime - targetUtcTime;

    if (difference === 0) {
      return new Date(candidateUtcTime);
    }

    candidateUtcTime -= difference;
  }

  return new Date(candidateUtcTime);
}

export function addMinutesToCalendarDateTime(date: string, time: string, minutesToAdd: number): string {
  const result = parseCalendarDateTimeWithTimeZone(buildCalendarDateTime(date, time));
  result.setUTCMinutes(result.getUTCMinutes() + minutesToAdd);
  return formatLocalDateTime(result);
}

export function rangesOverlap(start: Date, end: Date, eventStart: Date, eventEnd: Date): boolean {
  return start < eventEnd && end > eventStart;
}
