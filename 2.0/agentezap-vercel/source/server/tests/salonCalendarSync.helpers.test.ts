import assert from "node:assert/strict";

import {
  filterSlotsAgainstGoogleBusyWindows,
  slotConflictsWithGoogleBusyWindow,
} from "../salonCalendarSync";
import type { CalendarBusyWindow } from "../googleCalendarService";

const busyWindows: CalendarBusyWindow[] = [
  {
    summary: "Evento externo",
    startDateTime: "2026-03-12T12:00:00.000Z",
    endDateTime: "2026-03-12T13:00:00.000Z",
  },
];

assert.equal(
  slotConflictsWithGoogleBusyWindow("2026-03-12", "09:00", 60, busyWindows[0]),
  true,
);

assert.equal(
  slotConflictsWithGoogleBusyWindow("2026-03-12", "10:00", 30, busyWindows[0]),
  false,
);

assert.deepEqual(
  filterSlotsAgainstGoogleBusyWindows(
    "2026-03-12",
    ["08:30", "09:00", "09:30", "10:00"],
    30,
    busyWindows,
  ),
  ["08:30", "10:00"],
);

console.log("salonCalendarSync.helpers.test.ts ok");
