import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFile), "..", "..");

test("mantem a sequencia correta mesmo quando o runtime roda em UTC", () => {
  const script = `
import { buildFollowUpStageScheduleDate } from "./server/userFollowUpScheduling.ts";
import { buildResetFollowUpSchedule } from "./server/userFollowUpTiming.ts";

const config = {
  intervalsMinutes: [10, 180, 720, 1440, 2880, 10080, 21600],
  respectBusinessHours: true,
  businessHoursStart: "07:00",
  businessHoursEnd: "23:59",
  businessDays: [0, 1, 2, 3, 4, 5, 6],
};

const stageOne = buildFollowUpStageScheduleDate({
  config,
  stageIndex: 1,
  now: new Date("2026-04-10T18:38:30.000Z"),
  randomFn: () => 0,
});

const reset = buildResetFollowUpSchedule(
  config,
  new Date("2026-04-10T02:55:00.000Z"),
);

console.log(JSON.stringify({
  stageOne: stageOne?.toISOString() || null,
  reset: reset.nextFollowupAt.toISOString(),
}));
`;

  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "-e", script],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        TZ: "UTC",
      },
      encoding: "utf8",
    },
  ).trim();

  const parsed = JSON.parse(output) as {
    stageOne: string | null;
    reset: string;
  };

  assert.equal(parsed.stageOne, "2026-04-10T21:38:35.000Z");
  assert.equal(parsed.reset, "2026-04-10T10:00:00.000Z");
});
