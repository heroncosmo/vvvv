import assert from "node:assert/strict";
import { shouldSendReminderForHoursUntilAppointment } from "../appointmentReminderService.ts";

assert.equal(shouldSendReminderForHoursUntilAppointment(1, 1, 60_000), true);
assert.equal(shouldSendReminderForHoursUntilAppointment(0.99, 1, 60_000), true);
assert.equal(shouldSendReminderForHoursUntilAppointment(0.97, 1, 60_000), false);
assert.equal(shouldSendReminderForHoursUntilAppointment(2, 1, 60_000), false);
assert.equal(shouldSendReminderForHoursUntilAppointment(24, 24, 60_000), true);

console.log("appointmentReminderService.window.test.ts ok");
process.exit(0);
