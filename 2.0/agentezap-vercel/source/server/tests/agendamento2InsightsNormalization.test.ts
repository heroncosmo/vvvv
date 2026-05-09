import assert from "node:assert/strict";

type ExistingAgendamento2InsightRow = {
  status: string | null;
  agreed_schedule: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  summary: string | null;
};

function trimText(value: string, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeParsedAgendamento2Insight(
  parsed: {
    status: "scheduled" | "not_scheduled" | "cancelled";
    agreedSchedule: string | null;
    scheduledDate: string | null;
    scheduledTime: string | null;
    summary: string;
  },
  previousInsight: ExistingAgendamento2InsightRow | null,
) {
  if (previousInsight?.status === "scheduled" && parsed.status === "not_scheduled") {
    return {
      ...parsed,
      status: "scheduled" as const,
      agreedSchedule: parsed.agreedSchedule || previousInsight.agreed_schedule || null,
      summary:
        parsed.summary ||
        trimText(previousInsight.summary || "Agendamento confirmado anteriormente nesta conversa.", 260),
      scheduledDate: parsed.scheduledDate || previousInsight.scheduled_date || null,
      scheduledTime: parsed.scheduledTime || previousInsight.scheduled_time || null,
    };
  }

  if (parsed.status === "scheduled" && !parsed.agreedSchedule && previousInsight?.agreed_schedule) {
    return {
      ...parsed,
      agreedSchedule: trimText(previousInsight.agreed_schedule, 180) || null,
      scheduledDate: parsed.scheduledDate || previousInsight.scheduled_date || null,
      scheduledTime: parsed.scheduledTime || previousInsight.scheduled_time || null,
    };
  }

  return {
    ...parsed,
    agreedSchedule:
      parsed.agreedSchedule ||
      previousInsight?.agreed_schedule ||
      null,
    scheduledDate:
      parsed.status === "scheduled"
        ? parsed.scheduledDate || previousInsight?.scheduled_date || null
        : null,
    scheduledTime:
      parsed.status === "scheduled"
        ? parsed.scheduledTime || previousInsight?.scheduled_time || null
        : null,
  };
}

const preserved = normalizeParsedAgendamento2Insight(
  {
    status: "not_scheduled",
    agreedSchedule: null,
    scheduledDate: null,
    scheduledTime: null,
    summary: "Conversa seguiu depois do fechamento.",
  },
  {
    status: "scheduled",
    agreed_schedule: "Instalação em 2026-04-02 às 09:00",
    scheduled_date: "2026-04-02",
    scheduled_time: "09:00",
    summary: "Agendamento confirmado.",
  },
);

assert.equal(preserved.status, "scheduled");
assert.equal(preserved.agreedSchedule, "Instalação em 2026-04-02 às 09:00");
assert.equal(preserved.scheduledDate, "2026-04-02");
assert.equal(preserved.scheduledTime, "09:00");

const backfilled = normalizeParsedAgendamento2Insight(
  {
    status: "scheduled",
    agreedSchedule: null,
    scheduledDate: null,
    scheduledTime: null,
    summary: "Agendamento mantido.",
  },
  {
    status: "scheduled",
    agreed_schedule: "Instalação em 2026-04-02 às 09:00",
    scheduled_date: "2026-04-02",
    scheduled_time: "09:00",
    summary: "Agendamento confirmado.",
  },
);

assert.equal(backfilled.status, "scheduled");
assert.equal(backfilled.agreedSchedule, "Instalação em 2026-04-02 às 09:00");
assert.equal(backfilled.scheduledDate, "2026-04-02");
assert.equal(backfilled.scheduledTime, "09:00");

console.log("agendamento2InsightsNormalization.test.ts ok");
