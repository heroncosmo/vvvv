import { parseStatusPostPayload, serializeStatusPostPayload } from "./statusPostingHelpers";
import { computeNextStatusSchedule } from "./statusRecurrence";

type ScheduledStatusStateInput = {
  rawStatusText: string;
  scheduledFor: Date | string;
  recurrenceType: string | null | undefined;
  recurrenceInterval?: number | null;
  now: Date;
  errorMessage?: string | null;
  nextAttempt?: number;
};

function parseScheduledDate(value: Date | string) {
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Data invalida no agendamento de status");
  }
  return parsed;
}

export function getScheduledStatusSuccessState(input: ScheduledStatusStateInput) {
  const payload = parseStatusPostPayload(input.rawStatusText);
  const baseDate = parseScheduledDate(input.scheduledFor);
  const nextSchedule = computeNextStatusSchedule({
    base: baseDate,
    recurrenceType: input.recurrenceType || "none",
    interval: input.recurrenceInterval,
    selectedWeekdays: payload.selectedWeekdays,
  });
  const resetStatusText = serializeStatusPostPayload({
    ...payload,
    sendRetryCount: 0,
  });

  if (nextSchedule) {
    return {
      status: "pending" as const,
      scheduledFor: nextSchedule,
      lastSentAt: input.now,
      errorMessage: null,
      updatedAt: input.now,
      statusText: resetStatusText,
    };
  }

  return {
    status: "sent" as const,
    lastSentAt: input.now,
    errorMessage: null,
    updatedAt: input.now,
    statusText: resetStatusText,
  };
}

export function getScheduledStatusFailureState(input: ScheduledStatusStateInput) {
  const payload = parseStatusPostPayload(input.rawStatusText);
  const baseDate = parseScheduledDate(input.scheduledFor);
  const nextSchedule = computeNextStatusSchedule({
    base: baseDate,
    recurrenceType: input.recurrenceType || "none",
    interval: input.recurrenceInterval,
    selectedWeekdays: payload.selectedWeekdays,
  });

  if (nextSchedule) {
    return {
      status: "pending" as const,
      scheduledFor: nextSchedule,
      errorMessage: input.errorMessage || null,
      updatedAt: input.now,
      statusText: serializeStatusPostPayload({
        ...payload,
        sendRetryCount: 0,
      }),
    };
  }

  return {
    status: "failed" as const,
    errorMessage: input.errorMessage || null,
    updatedAt: input.now,
    statusText: serializeStatusPostPayload({
      ...payload,
      sendRetryCount: Math.max(0, Number(input.nextAttempt ?? payload.sendRetryCount ?? 0)),
    }),
  };
}
