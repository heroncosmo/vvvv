import assert from "node:assert/strict";
import {
  buildBrazilGreetingPromptInstruction,
  ensureOpeningGreetingForBrazilTime,
  getBrazilOpeningGreetingForHour,
  getBrazilGreetingForHour,
  normalizeConfiguredGreetingByHour,
  normalizeConfiguredGreetingForBrazilTime,
} from "../greetingTime";

assert.equal(getBrazilGreetingForHour(9), "Bom dia");
assert.equal(getBrazilGreetingForHour(15), "Boa tarde");
assert.equal(getBrazilGreetingForHour(21), "Boa noite");
assert.equal(getBrazilOpeningGreetingForHour(2), "Olá, tudo bem?");
assert.equal(getBrazilOpeningGreetingForHour(9), "Bom dia");
assert.equal(getBrazilOpeningGreetingForHour(15), "Boa tarde");
assert.equal(getBrazilOpeningGreetingForHour(21), "Boa noite");

assert.equal(
  normalizeConfiguredGreetingByHour("Boa tarde {nome}, tudo bem?", 9),
  "Bom dia {nome}, tudo bem?",
);

assert.equal(
  normalizeConfiguredGreetingByHour("Bom dia Joao!", 20),
  "Boa noite Joao!",
);

assert.equal(
  normalizeConfiguredGreetingByHour("Oi {nome}, tudo bem?", 20),
  "Oi {nome}, tudo bem?",
);

assert.equal(
  normalizeConfiguredGreetingByHour("  boa noite, Rodrigo da AgenteZap aqui.", 13),
  "  Boa tarde, Rodrigo da AgenteZap aqui.",
);

assert.equal(
  normalizeConfiguredGreetingForBrazilTime("{{saudacao_horario}}\nComo posso te ajudar?", new Date("2026-03-28T13:00:00.000Z")),
  "Bom dia\nComo posso te ajudar?",
);

assert.equal(
  normalizeConfiguredGreetingForBrazilTime("{{saudacao_horario}}\nComo posso te ajudar?", new Date("2026-03-28T06:00:00.000Z")),
  "Olá, tudo bem?\nComo posso te ajudar?",
);

assert.equal(
  ensureOpeningGreetingForBrazilTime("Boa tarde! Seguem as fotos que voce pediu.", new Date("2026-03-29T01:00:00.000Z")),
  "Boa noite! Seguem as fotos que voce pediu.",
);

assert.equal(
  ensureOpeningGreetingForBrazilTime("Boa tarde! Seguem as fotos que voce pediu.", new Date("2026-03-28T15:32:00.000Z")),
  "Boa tarde! Seguem as fotos que voce pediu.",
);

assert.equal(
  ensureOpeningGreetingForBrazilTime("Oi! Seguem as fotos que voce pediu.", new Date("2026-03-29T01:00:00.000Z")),
  "Boa noite! Seguem as fotos que voce pediu.",
);

assert.equal(
  ensureOpeningGreetingForBrazilTime("**Bom dia, Rodrigo!** Seguem as fotos que voce pediu.", new Date("2026-03-28T18:32:00.000Z")),
  "**Boa tarde, Rodrigo!** Seguem as fotos que voce pediu.",
);

assert.equal(
  ensureOpeningGreetingForBrazilTime("Seguem as fotos que voce pediu.", new Date("2026-03-29T01:00:00.000Z")),
  "Boa noite! Seguem as fotos que voce pediu.",
);

assert.equal(
  ensureOpeningGreetingForBrazilTime("", new Date("2026-03-29T01:00:00.000Z")),
  "Boa noite!",
);

const promptInstructionMorning = buildBrazilGreetingPromptInstruction(new Date("2026-03-28T14:32:00.000Z"));
assert.ok(promptInstructionMorning.includes('saudacao correta neste momento e: "Bom dia".'));
assert.ok(promptInstructionMorning.includes('se forem 11:32 em Brasilia e o cliente escrever "boa tarde", responda com "Bom dia".'));

const promptInstructionAfternoon = buildBrazilGreetingPromptInstruction(new Date("2026-03-28T18:32:00.000Z"));
assert.ok(promptInstructionAfternoon.includes('saudacao correta neste momento e: "Boa tarde".'));

console.log("greetingTime.test.ts ok");
