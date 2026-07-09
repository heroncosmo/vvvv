import assert from "node:assert/strict";
import {
  buildBrazilTemporalPromptBlock,
  buildBrazilTemporalToolContractBlock,
  buildBrazilTemporalToolResult,
  enforceBrazilTemporalConsistency,
  getBrazilTemporalContext,
  shouldUseBrazilTemporalToolContract,
} from "../brazilTemporalContext";

const complaintMoment = new Date("2026-05-13T21:38:00.000Z");
const context = getBrazilTemporalContext(complaintMoment);

assert.equal(context.dateKey, "2026-05-13");
assert.equal(context.datePtBr, "13/05/2026");
assert.equal(context.time, "18:38");
assert.equal(context.weekday, "quarta-feira");
assert.deepEqual(context.tomorrow, {
  dateKey: "2026-05-14",
  datePtBr: "14/05/2026",
  weekday: "quinta-feira",
});
assert.deepEqual(context.dayAfterTomorrow, {
  dateKey: "2026-05-15",
  datePtBr: "15/05/2026",
  weekday: "sexta-feira",
});

const promptBlock = buildBrazilTemporalPromptBlock(complaintMoment);
assert.ok(promptBlock.includes("amanha/amanh\u00e3 = 14/05/2026 (quinta-feira)"));
assert.ok(promptBlock.includes("15/05/2026 (sexta-feira) = depois de amanha/depois de amanh\u00e3"));
assert.ok(promptBlock.includes("Se uma data absoluta do prompt ou historico nao for igual ao mapa de amanha"));

assert.ok(shouldUseBrazilTemporalToolContract("A peneira do dia 15/05 as 17h e amanha?"));
assert.equal(shouldUseBrazilTemporalToolContract("Qual o endereco?"), false);

const temporalToolResult = buildBrazilTemporalToolResult({
  referenceText: "A peneira do dia 15/05 as 17h e amanha?",
  now: complaintMoment,
});
assert.equal(temporalToolResult.toolName, "resolveBrazilTemporalContext");
assert.equal(temporalToolResult.relativeDates.tomorrow.datePtBr, "14/05/2026");
assert.equal(temporalToolResult.dateMentions[0].datePtBr, "15/05/2026");
assert.equal(temporalToolResult.dateMentions[0].relation, "depois de amanh\u00e3");
assert.equal(temporalToolResult.dateMentions[0].isTomorrow, false);

const temporalContract = buildBrazilTemporalToolContractBlock({
  referenceText: "Amanha e que dia?",
  now: complaintMoment,
});
assert.ok(temporalContract.includes("resolveBrazilTemporalContext"));
assert.ok(temporalContract.includes("\"tomorrow\""));
assert.ok(temporalContract.includes("14/05/2026"));

const nearMidnight = getBrazilTemporalContext(new Date("2026-05-14T02:30:00.000Z"));
assert.equal(nearMidnight.datePtBr, "13/05/2026");
assert.equal(nearMidnight.tomorrow.datePtBr, "14/05/2026");

const repairedTomorrowConflict = enforceBrazilTemporalConsistency({
  responseText: "\u00c9 amanh\u00e3 mesmo, Guilherme! Dia *15/05 (sexta-feira)*, \u00e0s *17h*.",
  now: complaintMoment,
});
assert.ok(repairedTomorrowConflict.includes("Amanh\u00e3 \u00e9 14/05/2026 (quinta-feira)."));
assert.ok(repairedTomorrowConflict.includes("O dia 15/05/2026 \u00e9 sexta-feira, depois de amanh\u00e3."));
assert.ok(!repairedTomorrowConflict.includes("\u00c9 amanh\u00e3 mesmo"));

const repairedTodayConflict = enforceBrazilTemporalConsistency({
  responseText: "N\u00e3o, a peneira do Gr\u00eamio Audax \u00e9 *hoje (13/05, quarta-feira)* \u00e0s *17h00*.",
  referenceText: "A peneira do dia 15/05 \u00e0s 17h \u00e9 amanh\u00e3?",
  now: complaintMoment,
});
assert.ok(repairedTodayConflict.includes("Amanh\u00e3 \u00e9 14/05/2026 (quinta-feira)."));
assert.ok(repairedTodayConflict.includes("O dia 15/05/2026 \u00e9 sexta-feira, depois de amanh\u00e3."));

const repairedPromptDateConflict = enforceBrazilTemporalConsistency({
  responseText: "A peneira acontece amanh\u00e3, 14/05/2026 (quinta-feira), \u00e0s 17h.",
  referenceText: "Data do evento: 15/05/2026 (sexta-feira)",
  now: complaintMoment,
});
assert.ok(repairedPromptDateConflict.includes("Amanh\u00e3 \u00e9 14/05/2026 (quinta-feira)."));
assert.ok(repairedPromptDateConflict.includes("O dia 15/05/2026 \u00e9 sexta-feira, depois de amanh\u00e3."));

const alreadyCorrect = "Amanh\u00e3 \u00e9 quinta-feira, 14/05/2026.";
assert.equal(enforceBrazilTemporalConsistency({ responseText: alreadyCorrect, now: complaintMoment }), alreadyCorrect);

const may28Moment = new Date("2026-05-28T13:00:00.000Z");
const repairedRelativeWeekdayOnly = enforceBrazilTemporalConsistency({
  responseText: "Amanha e quinta-feira, entao posso deixar como pre-agendamento.",
  now: may28Moment,
});
assert.ok(repairedRelativeWeekdayOnly.includes("Amanha e sexta-feira"));
assert.ok(repairedRelativeWeekdayOnly.includes("pre-agendamento"));
assert.ok(!repairedRelativeWeekdayOnly.includes("quinta-feira, entao"));

const repairedRelativeDateForSchedulingRequest = enforceBrazilTemporalConsistency({
  responseText: "Amanha, 30/05/2026 (sabado), consigo deixar como pre-agendamento a partir das 13h.",
  referenceText: "Quero nutricionista amanha as 10h",
  now: may28Moment,
});
assert.ok(repairedRelativeDateForSchedulingRequest.includes("29/05/2026"));
assert.ok(repairedRelativeDateForSchedulingRequest.includes("sexta-feira"));
assert.ok(repairedRelativeDateForSchedulingRequest.includes("pre-agendamento"));
assert.ok(!repairedRelativeDateForSchedulingRequest.includes("30/05/2026"));

const repairedAccentedRelativeWeekday = enforceBrazilTemporalConsistency({
  responseText: "Amanhã é quinta-feira, mas consigo deixar como pré-agendamento das 13h às 18h.",
  referenceText: "Quero nutricionista amanha as 10h",
  now: may28Moment,
});
assert.ok(repairedAccentedRelativeWeekday.includes("Amanhã é sexta-feira"));
assert.ok(repairedAccentedRelativeWeekday.includes("pré-agendamento"));
assert.ok(!repairedAccentedRelativeWeekday.includes("quinta-feira"));

const repairedSchedulingRelationMismatch = enforceBrazilTemporalConsistency({
  responseText: "Você prefere algum horário da tarde hoje (quinta-feira) para eu deixar como pre-agendamento?",
  referenceText: "Quero nutricionista amanha as 10h",
  now: may28Moment,
});
assert.ok(repairedSchedulingRelationMismatch.includes("amanhã (sexta-feira)"));
assert.ok(repairedSchedulingRelationMismatch.includes("pre-agendamento"));
assert.ok(!repairedSchedulingRelationMismatch.includes("hoje"));

const preservedSchedulingOfferWithBackgroundPromptDate = enforceBrazilTemporalConsistency({
  responseText: "Amanha consigo deixar como pre-agendamento das 13h as 18h.",
  referenceText: "Quero nutricionista amanha as 10h\nPlano ativo ate 10/06/2026.\nVersao do prompt 27/05/2026.",
  now: may28Moment,
});
assert.equal(
  preservedSchedulingOfferWithBackgroundPromptDate,
  "Amanha consigo deixar como pre-agendamento das 13h as 18h.",
);
assert.ok(!preservedSchedulingOfferWithBackgroundPromptDate.includes("Corrigindo a data"));

const correctRelativeWeekdayOnly = "Amanha e sexta-feira, entao posso deixar como pre-agendamento.";
assert.equal(
  enforceBrazilTemporalConsistency({ responseText: correctRelativeWeekdayOnly, now: may28Moment }),
  correctRelativeWeekdayOnly,
);

const preservedCommercialDeliveryWhenWeekdayRepairIsUnsafe = enforceBrazilTemporalConsistency({
  responseText: "Para sua regiao, frete gratis e prazo de ate 3 dias uteis. Qual kit voce prefere amanha (quinta-feira)?",
  referenceText: "Chega amanha?",
  now: may28Moment,
});

assert.ok(!preservedCommercialDeliveryWhenWeekdayRepairIsUnsafe.includes("Corrigindo a data"));
assert.ok(preservedCommercialDeliveryWhenWeekdayRepairIsUnsafe.includes("Para sua regiao"));
assert.ok(preservedCommercialDeliveryWhenWeekdayRepairIsUnsafe.includes("Qual kit"));

console.log("brazilTemporalContext.test.ts ok");
