import {
  addStatusBrazilDays,
  addStatusBrazilMonths,
  getStatusBrazilWeekday,
  startOfStatusBrazilMinute,
} from "./statusBrazilTime";

function startOfMinute(date: Date) {
  return startOfStatusBrazilMinute(date);
}

export function addDays(date: Date, days: number) {
  return addStatusBrazilDays(date, days);
}

export function normalizeSelectedWeekdays(days: Array<number | null | undefined> | null | undefined) {
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

export function computeNextSelectedWeekday(base: Date, selectedWeekdays: Array<number | null | undefined>) {
  const normalized = normalizeSelectedWeekdays(selectedWeekdays);
  if (normalized.length === 0) {
    return null;
  }

  const safeBase = startOfMinute(base);
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = addDays(safeBase, offset);
    if (normalized.includes(getStatusBrazilWeekday(candidate))) {
      return candidate;
    }
  }

  return addDays(safeBase, 7);
}

export function computeNextStatusSchedule(input: {
  base: Date;
  recurrenceType: string;
  interval?: number | null;
  selectedWeekdays?: Array<number | null | undefined> | null;
}) {
  const safeInterval = Math.max(1, input.interval || 1);

  if (input.recurrenceType === "daily") {
    return addDays(input.base, safeInterval);
  }

  if (input.recurrenceType === "weekly") {
    const selectedWeekdays = normalizeSelectedWeekdays(input.selectedWeekdays);
    if (selectedWeekdays.length > 0) {
      return computeNextSelectedWeekday(input.base, selectedWeekdays);
    }

    return addDays(input.base, safeInterval * 7);
  }

  if (input.recurrenceType === "monthly") {
    return addStatusBrazilMonths(input.base, safeInterval);
  }

  return null;
}
