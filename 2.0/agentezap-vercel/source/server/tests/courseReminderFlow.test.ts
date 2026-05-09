import assert from "node:assert/strict";

import {
  DEFAULT_COURSE_REMINDER_HOURS_BEFORE,
  getDefaultCourseReminderFlowItems,
  normalizeCourseReminderFlowItems,
} from "@shared/courseReminderFlow";

assert.equal(DEFAULT_COURSE_REMINDER_HOURS_BEFORE, 1);

const defaults = getDefaultCourseReminderFlowItems();
assert.equal(defaults.length, 3);
assert.equal(defaults[0].text.includes("{nome}"), true);
assert.equal(defaults[1].text.includes("{referencia_agendamento}"), true);

const normalized = normalizeCourseReminderFlowItems([
  { id: "b", order: 3, type: "text", text: "Terceira" },
  { id: "a", order: 1, type: "text", text: "Primeira" },
  { id: "c", order: 2, type: "text", text: "Segunda" },
  { id: "empty", order: 4, type: "text", text: "   " },
]);

assert.deepEqual(
  normalized.map((item) => item.text),
  ["Primeira", "Segunda", "Terceira"],
);
assert.deepEqual(
  normalized.map((item) => item.order),
  [0, 1, 2],
);

console.log("courseReminderFlow.test.ts ok");
