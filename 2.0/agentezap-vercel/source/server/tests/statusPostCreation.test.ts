import test from "node:test";
import assert from "node:assert/strict";
import { resolveStatusNowFollowUp } from "../statusPostCreation";

test("resolveStatusNowFollowUp ignora follow-up quando a confirmacao explicita nao veio", () => {
  assert.equal(
    resolveStatusNowFollowUp({
      continueAutomationAfterNow: false,
      followUpAction: "daily",
      followUpScheduledFor: "2026-03-14T09:00:00.000Z",
    }),
    null,
  );
});

test("resolveStatusNowFollowUp devolve rotina diaria valida", () => {
  assert.deepEqual(
    resolveStatusNowFollowUp({
      continueAutomationAfterNow: true,
      followUpAction: "daily",
      followUpScheduledFor: "2026-03-14T09:00:00.000Z",
    }),
    {
      action: "daily",
      scheduledFor: "2026-03-14T09:00:00.000Z",
      selectedWeekdays: [],
    },
  );
});

test("resolveStatusNowFollowUp exige dias quando a rotina for semanal", () => {
  assert.throws(
    () =>
      resolveStatusNowFollowUp({
        continueAutomationAfterNow: true,
        followUpAction: "weekdays",
        followUpScheduledFor: "2026-03-14T09:00:00.000Z",
        followUpSelectedWeekdays: [],
      }),
    /ao menos um dia/i,
  );
});
