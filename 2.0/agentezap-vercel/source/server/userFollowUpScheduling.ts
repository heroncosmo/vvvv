import { BRAZIL_UTC_OFFSET } from "./brazilWallClock";
import { getBrazilTimeParts, type BrazilTimeParts } from "./greetingTime";

export interface UserFollowUpScheduleConfig {
  intervalsMinutes?: number[] | null;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
  businessDays?: number[] | null;
  respectBusinessHours?: boolean | null;
  infiniteLoop?: boolean | null;
  infiniteLoopMinDays?: number | null;
  infiniteLoopMaxDays?: number | null;
}

export const USER_FOLLOWUP_DEFAULT_INTERVALS = [10, 30, 180, 1440, 2880, 4320, 10080, 21600];

function getIntervals(config: UserFollowUpScheduleConfig | null | undefined): number[] {
  const intervals = config?.intervalsMinutes?.filter((value) => Number.isFinite(value) && value > 0);
  return intervals && intervals.length > 0 ? intervals : USER_FOLLOWUP_DEFAULT_INTERVALS;
}

function getBusinessDays(config: UserFollowUpScheduleConfig | null | undefined): number[] {
  const days = config?.businessDays?.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return days && days.length > 0 ? days : [1, 2, 3, 4, 5];
}

function parseTime(value: string | null | undefined, fallback: string): [number, number] {
  const source = String(value || fallback).slice(0, 5);
  const [hoursRaw, minutesRaw] = source.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return parseTime(fallback, fallback);
  }

  return [Math.max(0, Math.min(23, hours)), Math.max(0, Math.min(59, minutes))];
}

export function addRandomSeconds(date: Date, randomFn: () => number = Math.random): Date {
  const randomSeconds = Math.floor(randomFn() * 45) + 5;
  return new Date(date.getTime() + randomSeconds * 1000);
}

function formatDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function buildBrazilInstant(parts: BrazilTimeParts): Date {
  const isoDate = [
    String(parts.year).padStart(4, "0"),
    formatDatePart(parts.month),
    formatDatePart(parts.day),
  ].join("-");
  const isoTime = [
    formatDatePart(parts.hour),
    formatDatePart(parts.minute),
    formatDatePart(parts.second),
  ].join(":");

  return new Date(`${isoDate}T${isoTime}${BRAZIL_UTC_OFFSET}`);
}

function getBrazilCalendarCursor(reference: Date): Date {
  const parts = getBrazilTimeParts(reference);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0));
}

function getCursorParts(cursor: Date): Pick<BrazilTimeParts, "year" | "month" | "day"> {
  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
  };
}

export function isWithinBusinessHours(
  config: UserFollowUpScheduleConfig | null | undefined,
  reference: Date = new Date(),
): boolean {
  if (!config?.respectBusinessHours) {
    return true;
  }

  const local = getBrazilTimeParts(reference);
  const businessDays = getBusinessDays(config);
  const localDay = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  if (!businessDays.includes(localDay)) {
    return false;
  }

  const [startHour, startMinute] = parseTime(config.businessHoursStart, "09:00");
  const [endHour, endMinute] = parseTime(config.businessHoursEnd, "18:00");
  const currentMinutes = local.hour * 60 + local.minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export function getNextBusinessTime(
  config: UserFollowUpScheduleConfig | null | undefined,
  reference: Date = new Date(),
): Date {
  if (!config?.respectBusinessHours) {
    return reference;
  }

  const businessDays = getBusinessDays(config);
  const [startHour, startMinute] = parseTime(config.businessHoursStart, "09:00");
  const local = getBrazilTimeParts(reference);
  const currentMinutes = local.hour * 60 + local.minute;
  const startMinutes = startHour * 60 + startMinute;
  const cursor = getBrazilCalendarCursor(reference);
  const currentDay = cursor.getUTCDay();

  if (!businessDays.includes(currentDay) || currentMinutes >= startMinutes) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  while (!businessDays.includes(cursor.getUTCDay())) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const dateParts = getCursorParts(cursor);
  return buildBrazilInstant({
    ...dateParts,
    hour: startHour,
    minute: startMinute,
    second: 0,
  });
}

export function alignDateToBusinessWindow(
  candidate: Date,
  config: UserFollowUpScheduleConfig | null | undefined,
): Date {
  if (!config?.respectBusinessHours) {
    return candidate;
  }

  const businessDays = getBusinessDays(config);
  const [startHour, startMinute] = parseTime(config.businessHoursStart, "09:00");
  const [endHour, endMinute] = parseTime(config.businessHoursEnd, "18:00");
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  const local = getBrazilTimeParts(candidate);
  const currentMinutes = local.hour * 60 + local.minute;
  const cursor = getBrazilCalendarCursor(candidate);

  while (true) {
    const isAllowedDay = businessDays.includes(cursor.getUTCDay());
    const isAllowedTime = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

    if (isAllowedDay && isAllowedTime) {
      return candidate;
    }

    if (!isAllowedDay || currentMinutes > endMinutes) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    while (!businessDays.includes(cursor.getUTCDay())) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const dateParts = getCursorParts(cursor);
    return buildBrazilInstant({
      ...dateParts,
      hour: startHour,
      minute: startMinute,
      second: 0,
    });
  }
}

export function buildFollowUpStageScheduleDate(params: {
  config: UserFollowUpScheduleConfig | null | undefined;
  stageIndex: number;
  now?: Date;
  randomFn?: () => number;
}): Date | null {
  const { config, stageIndex, now = new Date(), randomFn = Math.random } = params;
  const intervals = getIntervals(config);
  let candidate: Date;

  if (stageIndex >= intervals.length) {
    if (!config?.infiniteLoop) {
      return null;
    }

    const minDays = Math.max(1, Number(config.infiniteLoopMinDays) || 15);
    const maxDays = Math.max(minDays, Number(config.infiniteLoopMaxDays) || minDays);
    const randomDays = Math.floor(randomFn() * (maxDays - minDays + 1)) + minDays;
    candidate = new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000);
  } else {
    const delayMinutes = intervals[stageIndex] || intervals[0] || USER_FOLLOWUP_DEFAULT_INTERVALS[0];
    candidate = new Date(now.getTime() + delayMinutes * 60 * 1000);
  }

  return addRandomSeconds(alignDateToBusinessWindow(candidate, config), randomFn);
}

export function buildMissingFollowUpScheduleDate(params: {
  config: UserFollowUpScheduleConfig | null | undefined;
  currentStage: number;
  baseDate: Date;
  now?: Date;
  randomFn?: () => number;
}): Date | null {
  const { config, currentStage, baseDate, now = new Date(), randomFn = Math.random } = params;
  const intervals = getIntervals(config);
  let candidate: Date;

  if (currentStage >= intervals.length) {
    if (!config?.infiniteLoop) {
      return null;
    }

    const minDays = Math.max(1, Number(config.infiniteLoopMinDays) || 15);
    const maxDays = Math.max(minDays, Number(config.infiniteLoopMaxDays) || minDays);
    const randomDays = Math.floor(randomFn() * (maxDays - minDays + 1)) + minDays;
    candidate = new Date(baseDate.getTime() + randomDays * 24 * 60 * 60 * 1000);
  } else {
    const delayMinutes = intervals[currentStage] || intervals[0] || USER_FOLLOWUP_DEFAULT_INTERVALS[0];
    candidate = new Date(baseDate.getTime() + delayMinutes * 60 * 1000);
  }

  if (candidate < now) {
    candidate = new Date(now.getTime() + 60 * 1000);
  }

  return addRandomSeconds(alignDateToBusinessWindow(candidate, config), randomFn);
}
