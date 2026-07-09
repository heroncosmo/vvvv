import assert from "node:assert/strict";
import { buildSchoolTriageResponseFromPrompt } from "../schoolTriageGuard";

const prompt = `
[AGENTEZAP_ESCOLA_TRIAGEM]
SETOR_MAITE_ALUNOS:
Enrico Ronchezi Ricardo, Maria Isabel Nassuato Bruno
SETOR_SONIA_ALUNOS:
Arthur Ribeiro Stopa, Annie Martinez Gallo
SETOR_FRANCIELI_ALUNOS:
Alice Manuela Rodrigues Giorgetti, Maria Alice Errera
[/AGENTEZAP_ESCOLA_TRIAGEM]
LISTA DE SETORES E LINKS:
SABRINA (Financeiro/Matrícula): https://wa.me/5514998391204
ALINE (Documentos/Geral): https://wa.me/551438412514
MAITÊ (Educação Infantil): https://wa.me/5514997583372
SONIA (Fundamental I e Médio): https://wa.me/5514996747816
FRANCIELI (Fundamental II): https://wa.me/5514998620954
`;

function decide(message: string) {
  const decision = buildSchoolTriageResponseFromPrompt({ prompt, message });
  assert.ok(decision?.handled, `Expected handled response for ${message}`);
  return decision;
}

{
  const decision = decide("Sou Camila do Grupo Rabbit, consultoria educacional. Temos horarios disponiveis no dia 20/05 para falar sobre o evento online 5 Passos para sua Escola Crescer.");
  assert.equal(decision.reason, "school_triage_external_contact");
  assert.equal(decision.sector, undefined);
  assert.match(decision.text, /contato externo\/comercial/);
  assert.doesNotMatch(decision.text, /Sabrina/);
  assert.doesNotMatch(decision.text, /5514998391204/);
}

{
  const decision = decide("Sou fornecedor da escola e quero apresentar uma proposta comercial.");
  assert.equal(decision.reason, "school_triage_external_contact");
  assert.doesNotMatch(decision.text, /Sabrina/);
}

{
  const decision = decide("Sou mãe do Enrico Ronchezi Ricardo. Ele vai faltar amanhã por viagem.");
  assert.equal(decision.sector, "maite");
  assert.match(decision.text, /Maitê/);
  assert.match(decision.text, /5514997583372/);
}

{
  const decision = decide("Preciso da segunda via da mensalidade da Maria Alice Errera.");
  assert.equal(decision.sector, "sabrina");
  assert.match(decision.text, /Sabrina/);
  assert.match(decision.text, /5514998391204/);
  assert.ok(decision.text.includes("https://wa.me/5514998391204"));
  assert.ok(!decision.text.includes("www.wa.me"));
}

{
  const decision = decide("Preciso pedir historico escolar e declaracao de escolaridade do meu filho.");
  assert.equal(decision.sector, "aline");
  assert.match(decision.text, /Aline/);
  assert.ok(decision.text.includes("https://wa.me/551438412514"));
  assert.ok(!decision.text.includes("www.wa.me"));
}

{
  const decision = decide("Quero remarcar a prova da Alice Manuela Rodrigues Giorgetti.");
  assert.equal(decision.sector, "francieli");
  assert.match(decision.text, /Francieli/);
  assert.match(decision.text, /5514998620954/);
}

{
  const decision = decide("Meu filho vai faltar amanhã.");
  assert.equal(decision.reason, "school_triage_missing_student");
  assert.match(decision.text, /nome completo do aluno/);
}

{
  const decision = buildSchoolTriageResponseFromPrompt({
    prompt: "Prompt comum sem marcador escolar",
    message: "mensalidade",
  });
  assert.equal(decision, null);
}

console.log("schoolTriageGuard.test passed");
