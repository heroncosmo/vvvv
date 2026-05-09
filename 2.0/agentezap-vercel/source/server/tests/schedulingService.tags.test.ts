import assert from "node:assert/strict";
import {
  buildFailedSchedulingResponseText,
  extractSchedulingTags,
  findExactAvailableSlot,
  getNextAppointmentDateValue,
  normalizeAppointmentDateValue,
  responseLooksLikeSuccessfulScheduling,
  stripSchedulingTagArtifacts,
  toDatabaseTimeString,
  type TimeSlot,
} from "../schedulingService";

const parsedTags = extractSchedulingTags(
  `Roberta, confirmado!\n[AGENDAR: DATA=2026-03-06, HORA=15:30, NOME="Roberta Moraes ✨", SERVICO=]`,
);
assert.equal(parsedTags.length, 1);
assert.deepEqual(parsedTags[0], {
  raw: `[AGENDAR: DATA=2026-03-06, HORA=15:30, NOME="Roberta Moraes ✨", SERVICO=]`,
  date: "2026-03-06",
  time: "15:30",
  clientName: "Roberta Moraes ✨",
  serviceName: undefined,
  customerAddress: undefined,
  approvalToken: undefined,
});

const advancedTags = extractSchedulingTags(
  `[AGENDAR: DATA=2026-03-06, HORA=16:30, NOME="Ana", SERVICO="Corte + Escova", ENDERECO="Rua A, 10", CONFIRMACAO_DIA=SIM]`,
);
assert.deepEqual(advancedTags[0], {
  raw: `[AGENDAR: DATA=2026-03-06, HORA=16:30, NOME="Ana", SERVICO="Corte + Escova", ENDERECO="Rua A, 10", CONFIRMACAO_DIA=SIM]`,
  date: "2026-03-06",
  time: "16:30",
  clientName: "Ana",
  serviceName: "Corte + Escova",
  customerAddress: "Rua A, 10",
  approvalToken: "SIM",
});

const slots: TimeSlot[] = [
  { start: "14:15", end: "15:15", available: true },
  { start: "15:30", end: "16:30", available: true },
];
assert.equal(findExactAvailableSlot(slots, "14:30"), undefined);
assert.deepEqual(findExactAvailableSlot(slots, "15:30"), slots[1]);

const stripped = stripSchedulingTagArtifacts(
  `Vou registrar agora:\n[AGENDAR: DATA=2026-03-06, HORA=14:30, NOME="\nTudo certo!`,
);
assert.equal(stripped.includes("[AGENDAR:"), false);
assert.match(stripped, /Tudo certo!/);

assert.equal(toDatabaseTimeString("9:5"), "09:05:00");
assert.equal(normalizeAppointmentDateValue("2026-03-06T03:00:00.000Z"), "2026-03-06");
assert.equal(normalizeAppointmentDateValue("2026-03-06"), "2026-03-06");
assert.equal(getNextAppointmentDateValue("2026-03-06T03:00:00.000Z"), "2026-03-07");

assert.equal(
  responseLooksLikeSuccessfulScheduling(
    "Seu agendamento está 100% confirmado e registrado na agenda.",
  ),
  true,
);

assert.equal(
  responseLooksLikeSuccessfulScheduling(
    "Acabei de verificar e o horário das 14:30 está disponível! Vou registrar na agenda agora mesmo.",
  ),
  true,
);

assert.equal(
  responseLooksLikeSuccessfulScheduling(
    "Opa! Esse horário não está disponível. Pode me informar outro?",
  ),
  false,
);

assert.equal(
  buildFailedSchedulingResponseText(
    "Perfeito! Seu horario esta confirmado.\n\n[AGENDAR: DATA=2026-03-06, HORA=14:30, NOME=Roberta]",
    "Puxa, tive um problema tecnico ao registrar o horario 14:30 de 2026-03-06.",
  ),
  "Puxa, tive um problema tecnico ao registrar o horario 14:30 de 2026-03-06.",
);

assert.equal(
  buildFailedSchedulingResponseText(
    "Vou revisar um detalhe com a equipe.\n\n[AGENDAR: DATA=2026-03-06, HORA=14:30, NOME=Roberta]",
    "Puxa, tive um problema tecnico ao registrar o horario 14:30 de 2026-03-06.",
  ),
  "Vou revisar um detalhe com a equipe.\n\nPuxa, tive um problema tecnico ao registrar o horario 14:30 de 2026-03-06.",
);

console.log("schedulingService.tags.test.ts ok");
process.exit(0);
