import assert from "node:assert/strict";
import { buildNeuropsiRuntimeResponse } from "../neuropsiResponsePolicy";

const userId = "760b411d-ba7c-4003-bc5f-2fbd568f571d";
const prompt = "Neuropsicologa Sheila Ribeiro. A agente se chama Regina.";
const detailedOnlinePrompt = [
  prompt,
  "Avaliacao online para adultos: anamnese, link por WhatsApp ou e-mail, video chamada, laudo em PDF e plataforma oficial.",
].join("\n");

function reply(message: string, historyText?: string): string {
  return (
    buildNeuropsiRuntimeResponse({
      userId,
      prompt,
      message,
      conversationHistory: historyText ? [{ text: historyText, fromMe: false }] : [],
    }) || ""
  );
}

function replyWithPrompt(message: string, promptText: string, historyText?: string): string | null {
  return buildNeuropsiRuntimeResponse({
    userId,
    prompt: promptText,
    message,
    conversationHistory: historyText ? [{ text: historyText, fromMe: false }] : [],
  });
}

const indication = reply("Boa tarde, a Evelyn me indicou");
assert.match(indication, /avaliacao neuropsicologica, psicoterapia ou supervisao/i);
assert.doesNotMatch(indication, /idade/i);

const evaluation = reply("Avaliacao neuropsicologico");
assert.match(evaluation, /Qual a idade/i);

const twoChildren = reply("Tenho uma crianca de 8 e uma de 12 anos", "Quero avaliacao neuropsicologica");
assert.match(twoChildren, /sao 2 criancas/i);
assert.match(twoChildren, /8 e 12 anos/i);
assert.match(twoChildren, /todas elas/i);

const documentReply = reply("Segue o encaminhamento em imagem", "Quero avaliacao neuropsicologica");
assert.match(documentReply, /nao consigo validar ou interpretar documento medico/i);
assert.match(documentReply, /motivo principal da avaliacao/i);

const schoolReport = reply("O que e relatorio escolar?");
assert.match(schoolReport, /documento fornecido pela escola/i);
assert.doesNotMatch(schoolReport, /R\$ 200/i);

const supervision = reply("Quais os valores da supervisao?");
assert.match(supervision, /avulsa R\$ 200/i);
assert.match(supervision, /um caso completo R\$ 400/i);
assert.match(supervision, /varios casos R\$ 600/i);
assert.doesNotMatch(supervision, /www\.|http|site\.com/i);

const payment = reply("Faz parcelamento da avaliacao neuropsicologica?");
assert.match(payment, /cartao, Pix ou dinheiro/i);
assert.match(payment, /equipe confirma as condicoes e parcelas/i);
assert.doesNotMatch(payment, /12x|link|sem juros/i);

const phone = reply("Qual telefone para agendar?");
assert.match(phone, /falar por aqui/i);
assert.doesNotMatch(phone, /99999|Rua Campo Grande|1014/i);

const psychotechnical = reply("Voces fazem testes psicotecnicos para carreiras policiais?");
assert.match(psychotechnical, /avaliacao psicologica para concursos/i);
assert.match(psychotechnical, /R\$ 600/i);
assert.match(psychotechnical, /edital, concurso ou outro objetivo/i);
assert.doesNotMatch(psychotechnical, /99999|Rua Campo Grande|1014|link/i);

const howItWorks = reply("Como funciona a avaliacao neuropsicologica?");
assert.match(howItWorks, /1 sessao de anamnese/i);
assert.match(howItWorks, /3 a 5 sessoes de testes/i);
assert.match(howItWorks, /devolutiva/i);

const childOnline = reply("Minha filha tem 12 anos, pode ser online?", "Quero avaliacao neuropsicologica");
assert.match(childOnline, /menores de 18 anos/i);
assert.match(childOnline, /presencial/i);

const adultOnlineLegacy = reply("Tenho 18 anos, a avaliacao pode ser online?");
assert.match(adultOnlineLegacy, /adultos com 18 anos ou mais/i);
assert.match(adultOnlineLegacy, /pode ser online conforme o caso/i);

const adultOnlineWithDetailedPrompt = replyWithPrompt(
  "Tenho 30 anos. Como funciona a avaliacao online?",
  detailedOnlinePrompt,
);
assert.equal(adultOnlineWithDetailedPrompt, null);

const adultOnlineNoAgeWithDetailedPrompt = replyWithPrompt(
  "Como funciona a avaliacao online?",
  detailedOnlinePrompt,
);
assert.equal(adultOnlineNoAgeWithDetailedPrompt, null);

const childOnlineWithDetailedPrompt = replyWithPrompt(
  "Minha filha tem 15 anos, pode ser online?",
  detailedOnlinePrompt,
  "Quero avaliacao neuropsicologica",
);
assert.match(childOnlineWithDetailedPrompt || "", /menores de 18 anos/i);
assert.match(childOnlineWithDetailedPrompt || "", /presencial/i);

assert.equal(
  buildNeuropsiRuntimeResponse({
    userId: "outro-tenant",
    prompt: "Outro agente",
    message: "Avaliacao neuropsicologica",
    conversationHistory: [],
  }),
  null,
);

console.log("neuropsiResponsePolicy.test.ts ok");
