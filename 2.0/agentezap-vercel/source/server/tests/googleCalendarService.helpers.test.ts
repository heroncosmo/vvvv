import assert from "node:assert/strict";
import { __googleCalendarTestUtils } from "../googleCalendarService.ts";

assert.equal(__googleCalendarTestUtils.normalizeCalendarTime("9:5"), "09:05:00");
assert.equal(
  __googleCalendarTestUtils.buildCalendarDateTime("2026-03-10", "14:30"),
  "2026-03-10T14:30:00",
);
assert.equal(
  __googleCalendarTestUtils.addMinutesToCalendarDateTime("2026-03-10", "23:45", 30),
  "2026-03-11T00:15:00",
);
assert.equal(
  __googleCalendarTestUtils.rangesOverlap(
    new Date("2026-03-10T10:00:00-03:00"),
    new Date("2026-03-10T11:00:00-03:00"),
    new Date("2026-03-10T10:30:00-03:00"),
    new Date("2026-03-10T11:30:00-03:00"),
  ),
  true,
);
assert.equal(
  __googleCalendarTestUtils.rangesOverlap(
    new Date("2026-03-10T10:00:00-03:00"),
    new Date("2026-03-10T11:00:00-03:00"),
    new Date("2026-03-10T11:00:00-03:00"),
    new Date("2026-03-10T12:00:00-03:00"),
  ),
  false,
);
assert.deepEqual(
  __googleCalendarTestUtils.parseStoredMetadata('{"provider":"maton","email":"clinic@example.com","primaryCalendarId":"primary"}'),
  {
    provider: "maton",
    email: "clinic@example.com",
    primaryCalendarId: "primary",
    validatedAt: undefined,
  },
);
assert.equal(
  __googleCalendarTestUtils.buildStoredMetadata([
    { id: "readonly@group.calendar.google.com", summary: "Leitura", accessRole: "reader" },
    { id: "clinic@example.com", summary: "clinic@example.com", primary: true, accessRole: "owner" },
  ]).primaryCalendarId,
  "clinic@example.com",
);

console.log("googleCalendarService.helpers.test.ts ok");
