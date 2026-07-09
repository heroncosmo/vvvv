import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStageCooldownDeadline,
  buildResetFollowUpSchedule,
  getConfiguredDelayMinutesForStage,
  resolveUserFollowUpDecisionWindow,
} from "../userFollowUpTiming";

test("reinicia o ciclo usando o primeiro intervalo configurado", () => {
  const referenceTime = new Date("2026-03-12T01:26:30.000Z");
  const schedule = buildResetFollowUpSchedule(
    { intervalsMinutes: [15, 180, 1440] },
    referenceTime,
  );

  assert.equal(schedule.followupStage, 0);
  assert.equal(schedule.delayMinutes, 15);
  assert.equal(schedule.nextFollowupAt.toISOString(), "2026-03-12T01:41:30.000Z");
});

test("reinicia o ciclo respeitando a janela comercial configurada", () => {
  const referenceTime = new Date("2026-03-10T02:55:00.000Z");
  const schedule = buildResetFollowUpSchedule(
    {
      intervalsMinutes: [10, 180, 1440],
      respectBusinessHours: true,
      businessHoursStart: "07:00",
      businessHoursEnd: "23:59",
      businessDays: [0, 1, 2, 3, 4, 5, 6],
    },
    referenceTime,
  );

  assert.equal(schedule.followupStage, 0);
  assert.equal(schedule.delayMinutes, 10);
  assert.equal(schedule.nextFollowupAt.toISOString(), "2026-03-10T10:00:00.000Z");
});

test("usa o intervalo do estágio atual e reaproveita o último valor quando passa do limite", () => {
  const config = { intervalsMinutes: [10, 30, 180] };

  assert.equal(getConfiguredDelayMinutesForStage(config, 0), 10);
  assert.equal(getConfiguredDelayMinutesForStage(config, 1), 30);
  assert.equal(getConfiguredDelayMinutesForStage(config, 9), 180);
});

test("cooldown respeita o intervalo completo do estágio atual", () => {
  const referenceTime = new Date("2026-03-16T22:59:53.000Z");
  const cooldown = buildStageCooldownDeadline(
    { intervalsMinutes: [10, 180, 1440] },
    1,
    referenceTime,
  );

  assert.equal(cooldown.delayMinutes, 180);
  assert.equal(cooldown.nextAllowedAt.toISOString(), "2026-03-17T01:59:53.000Z");
});

test("bloqueia follow-up quando o cliente falou por ultimo", () => {
  const window = resolveUserFollowUpDecisionWindow({
    lastMessageWasOurs: false,
    minutesSinceOur: 9999,
    minutesSinceClient: 7,
    thresholdMinutes: 10,
  });

  assert.equal(window.state, "awaiting_company_reply");
  assert.equal(window.authoritativeSilenceMinutes, 7);
  assert.deepEqual(window.allowedActions, ["wait"]);
});

test("mantem wait disponivel enquanto a ultima resposta da empresa ainda esta em cooldown", () => {
  const window = resolveUserFollowUpDecisionWindow({
    lastMessageWasOurs: true,
    minutesSinceOur: 6,
    minutesSinceClient: 40,
    thresholdMinutes: 10,
  });

  assert.equal(window.state, "cooldown_after_company_reply");
  assert.equal(window.authoritativeSilenceMinutes, 6);
  assert.deepEqual(window.allowedActions, ["wait", "abort", "schedule"]);
});

test("remove WAIT quando a empresa ja respondeu e a janela de follow-up venceu", () => {
  const window = resolveUserFollowUpDecisionWindow({
    lastMessageWasOurs: true,
    minutesSinceOur: 12,
    minutesSinceClient: 20,
    thresholdMinutes: 10,
  });

  assert.equal(window.state, "eligible_after_company_reply");
  assert.equal(window.authoritativeSilenceMinutes, 12);
  assert.deepEqual(window.allowedActions, ["send", "abort", "schedule"]);
});
