import assert from "node:assert/strict";

import {
  getDefaultAgendamento2ReminderFlowItems,
  normalizeAgendamento2ReminderFlowItems,
} from "../../shared/agendamento2ReminderFlow";

const defaults = getDefaultAgendamento2ReminderFlowItems();
assert.equal(defaults.length > 0, true);

const normalized = normalizeAgendamento2ReminderFlowItems([
  { id: "b", order: 3, text: "Segunda mensagem" },
  { id: "a", order: 0, text: "Primeira mensagem" },
  { id: "empty", order: 2, text: "   " },
]);

assert.deepEqual(
  normalized.map((item) => ({ id: item.id, order: item.order, text: item.text })),
  [
    { id: "a", order: 0, text: "Primeira mensagem" },
    { id: "b", order: 1, text: "Segunda mensagem" },
  ],
);

const fallback = normalizeAgendamento2ReminderFlowItems(null);
assert.deepEqual(fallback, defaults);

console.log("agendamento2ReminderFlow.test.ts: ok");
