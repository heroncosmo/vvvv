import assert from "node:assert/strict";

import {
  BITTENCOURT_USER_ID,
  bittencourtPolicyTexts,
  resolveBittencourtDirectResponse,
} from "../bittencourtResponsePolicy";

const otherTenant = resolveBittencourtDirectResponse({
  userId: "outro-tenant",
  message: "Qual e o link da area de membros?",
});
assert.equal(otherTenant, null);

const greeting = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Oi, bom dia",
});
assert.equal(greeting?.text, bittencourtPolicyTexts.greeting);
assert.deepEqual(greeting?.applied, ["greeting"]);

const boleto = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Preciso da segunda via do boleto",
});
assert.equal(boleto?.text, bittencourtPolicyTexts.boleto);
assert.equal(boleto?.text.includes("portal"), false);
assert.equal(boleto?.text.includes("SMS"), false);
assert.deepEqual(boleto?.applied, ["boleto_minimal"]);

const memberArea = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Qual e o link da area de membros?",
});
assert.equal(memberArea?.text, bittencourtPolicyTexts.memberArea);
assert.equal(memberArea?.text.includes("https://ead.institutobittencourt.psc.br/ead/"), true);
assert.deepEqual(memberArea?.applied, ["member_area_link"]);

const ampMonthly = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Quero informacoes sobre AMP mensal",
});
assert.equal(ampMonthly?.text, bittencourtPolicyTexts.ampMonthly);
assert.equal(ampMonthly?.text.includes("https://www.asaas.com/c/hxyma7z46vwdj6pi"), true);
assert.deepEqual(ampMonthly?.applied, ["amp_monthly"]);

const ampAnnual = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Tem AMP anual?",
});
assert.equal(ampAnnual?.text, bittencourtPolicyTexts.ampAnnual);
assert.equal(ampAnnual?.text.includes("https://www.asaas.com/c/qhcsdbcha4nv2v1f"), true);
assert.deepEqual(ampAnnual?.applied, ["amp_annual"]);

const ampGeneric = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Como funciona a AMP?",
});
assert.equal(ampGeneric?.text, bittencourtPolicyTexts.ampOptions);
assert.deepEqual(ampGeneric?.applied, ["amp_options"]);

const clinicAppointment = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Quero saber sobre a clinica",
});
assert.equal(clinicAppointment?.text, bittencourtPolicyTexts.clinicAppointment);
assert.equal(clinicAppointment?.text.includes("https://www.institutobittencourt.psc.br/agendar-consulta/"), true);
assert.deepEqual(clinicAppointment?.applied, ["clinic_appointment_link"]);

const psychoanalysisFormation = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Gostaria de mais informacoes sobre a formacao em psicanalise",
});
assert.equal(
  psychoanalysisFormation,
  null,
  "formation/course requests must not be forced into the clinic appointment direct response",
);

const courseWithMonthlyValue = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Qual e o valor da mensalidade do curso de formacao em psicanalise?",
});
assert.equal(
  courseWithMonthlyValue,
  null,
  "course monthly value requests must not be treated as boleto or clinic appointment",
);

const psychoanalysisConsultation = resolveBittencourtDirectResponse({
  userId: BITTENCOURT_USER_ID,
  message: "Gostaria de marcar uma consulta de psicanalise",
});
assert.equal(psychoanalysisConsultation?.text, bittencourtPolicyTexts.clinicAppointment);
assert.deepEqual(psychoanalysisConsultation?.applied, ["clinic_appointment_link"]);

console.log("bittencourtResponsePolicy.test.ts ok");
