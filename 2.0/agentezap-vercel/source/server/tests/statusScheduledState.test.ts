import test from "node:test";
import assert from "node:assert/strict";
import { getScheduledStatusFailureState, getScheduledStatusSuccessState } from "../statusScheduledState";
import { parseStatusPostPayload, serializeStatusPostPayload } from "../statusPostingHelpers";

test("recorrencia bem-sucedida reseta retry e agenda a proxima execucao", () => {
  const state = getScheduledStatusSuccessState({
    rawStatusText: serializeStatusPostPayload({
      contentType: "text",
      text: "Oferta do dia",
      requestedAction: "daily",
      sendRetryCount: 3,
    }),
    scheduledFor: "2026-03-31T09:00:00.000Z",
    recurrenceType: "daily",
    recurrenceInterval: 1,
    now: new Date("2026-03-31T09:01:00.000Z"),
  });

  assert.equal(state.status, "pending");
  assert.equal(state.scheduledFor?.toISOString(), "2026-04-01T09:00:00.000Z");
  assert.equal(parseStatusPostPayload(state.statusText).sendRetryCount, 0);
});

test("timeout em recorrencia pula a ocorrencia atual sem matar a rotina", () => {
  const state = getScheduledStatusFailureState({
    rawStatusText: serializeStatusPostPayload({
      contentType: "text",
      text: "Campanha semanal",
      requestedAction: "weekdays",
      selectedWeekdays: [2, 4],
      sendRetryCount: 2,
    }),
    scheduledFor: "2026-03-31T14:00:00.000Z",
    recurrenceType: "weekly",
    recurrenceInterval: 1,
    now: new Date("2026-03-31T14:01:00.000Z"),
    errorMessage: "O envio demorou demais e foi interrompido para evitar repostagem automatica duplicada.",
    nextAttempt: 3,
  });

  assert.equal(state.status, "pending");
  assert.equal(state.scheduledFor?.toISOString(), "2026-04-02T14:00:00.000Z");
  assert.equal(parseStatusPostPayload(state.statusText).sendRetryCount, 0);
  assert.match(String(state.errorMessage), /evitar repostagem automatica duplicada/i);
});

test("falha final sem recorrencia continua marcando o item como failed", () => {
  const state = getScheduledStatusFailureState({
    rawStatusText: serializeStatusPostPayload({
      contentType: "text",
      text: "Postagem unica",
      requestedAction: "now",
      sendRetryCount: 1,
    }),
    scheduledFor: "2026-03-31T14:00:00.000Z",
    recurrenceType: "none",
    recurrenceInterval: 1,
    now: new Date("2026-03-31T14:01:00.000Z"),
    errorMessage: "Status send timed out after 90s",
    nextAttempt: 2,
  });

  assert.equal(state.status, "failed");
  assert.equal(parseStatusPostPayload(state.statusText).sendRetryCount, 2);
});
