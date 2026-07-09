import assert from "node:assert/strict";

import {
  extractFirstJsonObject,
  normalizePotentialGrade,
  parseLeadCatalogProfile,
  parseLeadQualification,
  renderLeadCampaignTemplate,
} from "../leadIntelligenceHelpers";

const wrappedJson = [
  "Analise concluida.",
  "```json",
  '{"isPotentialLead":true,"potentialScore":88,"potentialGrade":"ALTO","businessType":"Clinica","personaType":"Dono","summary":"Lead claramente empresarial.","qualificationReason":"Falou de equipe, atendimento e vendas.","evidence":["Citou equipe comercial","Quer automatizar WhatsApp"],"recommendedApproach":"Abordagem consultiva.","recommendedMessage":"Oi {lead_nome}, tudo bem?","confidence":91}',
  "```",
].join("\n");

assert.equal(
  extractFirstJsonObject(wrappedJson),
  '{"isPotentialLead":true,"potentialScore":88,"potentialGrade":"ALTO","businessType":"Clinica","personaType":"Dono","summary":"Lead claramente empresarial.","qualificationReason":"Falou de equipe, atendimento e vendas.","evidence":["Citou equipe comercial","Quer automatizar WhatsApp"],"recommendedApproach":"Abordagem consultiva.","recommendedMessage":"Oi {lead_nome}, tudo bem?","confidence":91}',
);

const truncatedJson =
  '{"messageTemplate":"Oi {lead_nome}","rationale":"Base em lote","items":[{"leadId":"abc","message":"Oi Marina, tudo bem?","rationale":"Foco em abordagem"}';

assert.equal(
  extractFirstJsonObject(truncatedJson),
  '{"messageTemplate":"Oi {lead_nome}","rationale":"Base em lote","items":[{"leadId":"abc","message":"Oi Marina, tudo bem?","rationale":"Foco em abordagem"}]}',
);

const parsed = parseLeadQualification(wrappedJson);
assert.equal(parsed.isPotentialLead, true);
assert.equal(parsed.potentialGrade, "alto");
assert.equal(parsed.potentialScore, 88);
assert.equal(parsed.confidence, 91);

const coercedNumericPayload = parseLeadQualification(
  '{"isPotentialLead":true,"potentialScore":"84","potentialGrade":"A","businessType":"Clinica","personaType":"Dono","summary":"Lead empresarial.","qualificationReason":"Quer atendimento automatizado.","evidence":["Tem equipe"],"recommendedApproach":"Abordagem consultiva.","recommendedMessage":null,"confidence":"95"}',
);
assert.equal(coercedNumericPayload.potentialScore, 84);
assert.equal(coercedNumericPayload.confidence, 95);
assert.equal(coercedNumericPayload.potentialGrade, "alto");

assert.equal(normalizePotentialGrade("medio", 61, true), "medio");
assert.equal(normalizePotentialGrade("nao", 20, false), "descartar");

const parsedCatalog = parseLeadCatalogProfile(
  '{"isQualifiedLead":true,"qualificationScore":"83","qualificationGrade":"B","segment":"Clinica","persona":"Gestor","region":"Campinas","leadStage":"qualificado","summary":"Clinica com fluxo recorrente de pacientes.","needSummary":"Precisa organizar agendamentos e retorno.","buyerFitSummary":"Bom para vender a operacoes de saude e wellness.","signals":["Tem equipe","Atende por WhatsApp"],"confidence":"89"}',
);
assert.equal(parsedCatalog.isQualifiedLead, true);
assert.equal(parsedCatalog.qualificationScore, 83);
assert.equal(parsedCatalog.qualificationGrade, "medio");
assert.equal(parsedCatalog.leadStage, "qualificado");

const rendered = renderLeadCampaignTemplate(
  "Oi {lead_nome}, vi que voce conhece {cliente_referencia}. Para seu perfil {perfil_detectado}, a dor {dor_lead} combina com {abordagem_sugerida}. Leitura: {leitura_ia}. Persona {persona_tipo}. Score {score_potencial}.",
  {
    phone: "5511999999999",
    name: "Marina",
    sourceAccountName: "Studio Solar",
    businessType: "Clinica estetica",
    personaType: "Gestora comercial",
    qualificationReason: "Quer acelerar atendimento no WhatsApp",
    recommendedApproach: "Mostrar um caso real de cliente usando nossa IA",
    summary: "Clinica com agenda cheia e necessidade de retorno automatico",
    potentialScore: 88,
  },
);

assert.equal(
  rendered,
  "Oi Marina, vi que voce conhece Studio Solar. Para seu perfil Clinica estetica, a dor Quer acelerar atendimento no WhatsApp combina com Mostrar um caso real de cliente usando nossa IA. Leitura: Clinica com agenda cheia e necessidade de retorno automatico. Persona Gestora comercial. Score 88.",
);

console.log("leadIntelligenceHelpers.test.ts ok");
