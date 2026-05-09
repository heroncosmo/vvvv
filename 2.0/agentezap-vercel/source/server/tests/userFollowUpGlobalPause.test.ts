import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGlobalFollowUpPauseReason,
  isGlobalFollowUpPauseReason,
  resolveRecoveredGlobalFollowUpDate,
} from "../userFollowUpGlobalPause";

test("preserva a data futura original quando o toggle global volta rapidamente", () => {
  const pausedReason = buildGlobalFollowUpPauseReason({
    currentStage: 2,
    nextFollowupAt: new Date("2026-03-23T15:00:00.000Z"),
    pausedAt: new Date("2026-03-23T12:00:00.000Z"),
  });

  assert.equal(isGlobalFollowUpPauseReason(pausedReason), true);

  const restored = resolveRecoveredGlobalFollowUpDate({
    reason: pausedReason,
    currentStage: 2,
    config: { intervalsMinutes: [10, 180, 1440] },
    now: new Date("2026-03-23T12:05:00.000Z"),
  });

  assert.equal(restored?.toISOString(), "2026-03-23T15:00:00.000Z");
});

test("reconstroi pelo estagio atual quando a agenda antiga ja venceu", () => {
  const pausedReason = buildGlobalFollowUpPauseReason({
    currentStage: 1,
    nextFollowupAt: new Date("2026-03-23T09:00:00.000Z"),
    pausedAt: new Date("2026-03-23T08:00:00.000Z"),
  });

  const restored = resolveRecoveredGlobalFollowUpDate({
    reason: pausedReason,
    currentStage: 1,
    config: { intervalsMinutes: [10, 180, 1440] },
    now: new Date("2026-03-23T12:00:00.000Z"),
    randomFn: () => 0,
  });

  assert.equal(restored?.toISOString(), "2026-03-23T15:00:05.000Z");
});

test("motivo legado sem snapshot ainda volta pelo estagio atual", () => {
  const restored = resolveRecoveredGlobalFollowUpDate({
    reason: "Usuário desativou follow-up global",
    currentStage: 0,
    config: { intervalsMinutes: [10, 180, 1440] },
    now: new Date("2026-03-23T12:00:00.000Z"),
    randomFn: () => 0,
  });

  assert.equal(restored?.toISOString(), "2026-03-23T12:10:05.000Z");
});
