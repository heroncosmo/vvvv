import assert from "node:assert/strict";

import {
  calculateHoursUntilReminderAppointment,
  shouldSendReminderForHoursUntilAppointment,
} from "../appointmentReminderService.ts";

const exactOneHourBefore = calculateHoursUntilReminderAppointment(
  "2026-04-13",
  "08:00:00",
  new Date("2026-04-13T10:00:00.000Z"),
);

assert.ok(Math.abs(exactOneHourBefore - 1) < 0.000001);
assert.equal(shouldSendReminderForHoursUntilAppointment(exactOneHourBefore, 1, 60_000), true);

const threeHoursBefore = calculateHoursUntilReminderAppointment(
  "2026-04-13",
  "08:00:00",
  new Date("2026-04-13T08:00:00.000Z"),
);

assert.ok(Math.abs(threeHoursBefore - 3) < 0.000001);
assert.equal(shouldSendReminderForHoursUntilAppointment(threeHoursBefore, 1, 60_000), false);

console.log("appointmentReminderService.courseTiming.test.ts ok");
process.exit(0);
