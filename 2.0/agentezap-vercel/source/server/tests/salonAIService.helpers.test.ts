import assert from "node:assert/strict";

import {
  buildDeterministicSlotSuggestionMessage,
  formatSalonContextualDate,
  normalizeSalonDateValue,
  normalizeSalonTimeValue,
} from "../salonFormatting";

assert.equal(normalizeSalonDateValue("2026-03-12"), "2026-03-12");
assert.equal(normalizeSalonDateValue("2026-03-12T15:00:00.000Z"), "2026-03-12");
assert.equal(normalizeSalonDateValue("12/03/2026"), "2026-03-12");
assert.equal(normalizeSalonDateValue("12/03"), "2026-03-12");
assert.equal(normalizeSalonDateValue(""), null);

assert.equal(normalizeSalonTimeValue("9:5"), "09:05");
assert.equal(normalizeSalonTimeValue("09:05"), "09:05");
assert.equal(normalizeSalonTimeValue("09:05:00"), "09:05");
assert.equal(normalizeSalonTimeValue("2026-03-12T14:30:00"), "14:30");
assert.equal(normalizeSalonTimeValue("14h"), "14:00");
assert.equal(normalizeSalonTimeValue("1h45"), "01:45");
assert.equal(normalizeSalonTimeValue("1345"), "13:45");

assert.equal(
  formatSalonContextualDate("2026-03-10", "2026-03-10"),
  "hoje (terça-feira, 10/03/2026)",
);

assert.equal(
  formatSalonContextualDate("2026-03-11", "2026-03-10"),
  "amanhã (quarta-feira, 11/03/2026)",
);

assert.equal(
  formatSalonContextualDate("2026-03-12", "2026-03-10"),
  "quinta-feira, 12/03/2026",
);

const slotMessage = buildDeterministicSlotSuggestionMessage({
  date: "2026-03-12",
  allowedSlots: ["09:00", "09:30", "10:00", "14:00"],
  serviceName: "Corte",
  breakConfig: { enabled: true, start: "12:00", end: "13:00" },
});

assert.match(slotMessage, /09:00, 09:30, 10:00, 14:00/);
assert.match(slotMessage, /No almoço \(12:00 às 13:00\)/);
assert.match(slotMessage, /Qual horário funciona melhor para você\?/);

console.log("salonAIService.helpers.test.ts ok");
