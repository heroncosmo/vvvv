import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeterministicSchedulingDisambiguationChatReply,
  buildDeterministicSchedulingSlotListingChatReply,
  buildSchedulingHumanizationUserInstruction,
  classifySchedulingHumanizationCategory,
  validateSchedulingDisambiguationHumanizedReply,
  validateSchedulingSlotListingHumanizedReply,
} from "../schedulingHumanization.ts";

test.after(() => {
  setImmediate(() => process.exit(process.exitCode ?? 0));
});

const ambiguousSchedulingReply = `PEDIDO AMBIGUO:
O cliente descreveu o servico de forma generica e ainda nao da para assumir qual item do catalogo ele quer.
OPCOES RELACIONADAS:
- Ultrassom abd superior com Doppler (R$ 149,00 | 10 min)
- Ultrassom transvaginal com Doppler (R$ 149,00 | 10 min)
PROXIMO PASSO: confirmar qual servico especifico o cliente deseja antes de seguir para agenda.`;

const ambiguousAssistanceReply = `PEDIDO AMBIGUO:
O cliente descreveu o servico de forma generica e ainda nao da para assumir qual item do catalogo ele quer.
OPCOES RELACIONADAS:
- Instalacao de tomada 127v (R$ 70,00 | 60 min)
- Instalacao de tomada 220v (R$ 80,00 | 60 min)
PROXIMO PASSO: confirmar qual servico especifico o cliente deseja antes de seguir para agenda.`;

const slotListingReply = `HORARIOS DISPONIVEIS:
- Segunda-feira (16/03): 08:30, 09:45 ou 11:00
PROXIMO PASSO: cliente escolhe um horario
DADO NECESSARIO: endereco do local`;

test("classifySchedulingHumanizationCategory prioriza desambiguacao antes de quote", () => {
  assert.equal(
    classifySchedulingHumanizationCategory(ambiguousSchedulingReply),
    "DISAMBIGUATION",
  );
});

test("buildSchedulingHumanizationUserInstruction trava a humanizacao na lista real da desambiguacao", () => {
  const instruction = buildSchedulingHumanizationUserInstruction({
    category: "DISAMBIGUATION",
    schedulingReplyForHumanization: ambiguousSchedulingReply,
    nomeNegocio: "Clinica do Centro",
    promptDoNegocio: "Fale sempre em portugues do Brasil, com tom humano, e pergunte qual ultrassom com Doppler a pessoa precisa.",
  });

  const normalizedInstruction = instruction.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedInstruction, /Use SOMENTE as opcoes listadas no bloco acima/i);
  assert.match(normalizedInstruction, /NAO acrescente outras opcoes, exames, regioes ou nomes de servico/i);
  assert.match(normalizedInstruction, /NAO fale em horarios, datas ou agenda ainda/i);
  assert.match(normalizedInstruction, /Se citar servicos, copie o nome EXATAMENTE como aparece no bloco acima/i);
  assert.match(normalizedInstruction, /NAO resuma, renomeie, agrupe ou misture servicos diferentes/i);
  assert.match(normalizedInstruction, /ALVO DE ESCLARECIMENTO DESTE TURNO: qual ultrassom com doppler/i);
  assert.match(normalizedInstruction, /A pergunta precisa ficar explicitamente no eixo "qual ultrassom com doppler"/i);
  assert.doesNotMatch(normalizedInstruction, /Pergunte se o cliente quer ver os horarios disponiveis para agendar/i);
});

test("buildDeterministicSchedulingDisambiguationChatReply pergunta qual ultrassom com doppler quando o qualificador e compartilhado", () => {
  const reply = buildDeterministicSchedulingDisambiguationChatReply(
    ambiguousSchedulingReply,
    "Voce atende em uma clinica e deve perguntar qual ultrassom com Doppler a pessoa quer fazer quando houver mais de uma opcao.",
  );
  const normalizedReply = reply.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /Ultrassom abd superior com Doppler/i);
  assert.match(normalizedReply, /Ultrassom transvaginal com Doppler/i);
  assert.match(normalizedReply, /qual ultrassom com doppler/i);
  assert.doesNotMatch(normalizedReply, /carotidas/i);
  assert.doesNotMatch(normalizedReply, /mamas/i);
});

test("buildDeterministicSchedulingDisambiguationChatReply evita frase clinica em clientes de assistencia", () => {
  const reply = buildDeterministicSchedulingDisambiguationChatReply(
    ambiguousAssistanceReply,
    "Voce atende uma assistencia tecnica residencial e precisa esclarecer o tipo de servico antes de seguir para agenda.",
  );
  const normalizedReply = reply.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /Instalacao de tomada 127v/i);
  assert.match(normalizedReply, /Instalacao de tomada 220v/i);
  assert.match(normalizedReply, /qual tipo de instalacao/i);
  assert.doesNotMatch(normalizedReply, /qual ultrassom/i);
});

test("buildSchedulingHumanizationUserInstruction respeita prompt que pede um unico horario por vez", () => {
  const instruction = buildSchedulingHumanizationUserInstruction({
    category: "SLOT_LISTING",
    schedulingReplyForHumanization: slotListingReply,
    nomeNegocio: "JB Eletrica",
    promptDoNegocio: "Ofereca apenas o primeiro horario disponivel e nunca mostre lista de horarios.",
  });
  const normalizedInstruction = instruction.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedInstruction, /apenas um horario por vez/i);
  assert.match(normalizedInstruction, /Use somente o primeiro horario cronologico/i);
  assert.match(normalizedInstruction, /Nao peca endereco, nome ou pagamento antes de o cliente aceitar esse horario/i);
});

test("buildDeterministicSchedulingSlotListingChatReply usa o primeiro horario real quando o prompt pede um horario unico", () => {
  const reply = buildDeterministicSchedulingSlotListingChatReply(
    slotListingReply,
    "Ofereca apenas o primeiro horario disponivel e nunca mostre lista de horarios.",
  );
  const normalizedReply = reply.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  assert.match(normalizedReply, /primeiro horario disponivel/i);
  assert.match(normalizedReply, /08h30/i);
  assert.doesNotMatch(normalizedReply, /09h45/i);
  assert.doesNotMatch(normalizedReply, /11h00/i);
});

test("validateSchedulingDisambiguationHumanizedReply rejeita resposta que puxa agenda cedo demais", () => {
  const validation = validateSchedulingDisambiguationHumanizedReply({
    replyText: "Claro! Temos transvaginal com Doppler e eu ja posso verificar os horarios disponiveis para voce.",
    structuredReply: ambiguousSchedulingReply,
    promptDoNegocio: "Pergunte qual ultrassom a pessoa precisa antes de falar de agenda.",
  });

  assert.equal(validation.isValid, false);
  assert.match(validation.issues.join(","), /scheduling_offer_before_disambiguation/i);
  assert.match(validation.fallbackReply, /qual ultrassom/i);
});

test("validateSchedulingDisambiguationHumanizedReply aceita resposta guiada pelo prompt do cliente", () => {
  const validation = validateSchedulingDisambiguationHumanizedReply({
    replyText: "Claro. Qual ultrassom voce precisa com Doppler? Se quiser, pode me dizer a regiao.",
    structuredReply: ambiguousSchedulingReply,
    promptDoNegocio: "Pergunte qual ultrassom com Doppler a pessoa precisa antes de falar de agenda.",
  });

  assert.equal(validation.isValid, true);
  assert.equal(validation.issues.length, 0);
});

test("validateSchedulingDisambiguationHumanizedReply rejeita exemplos parafraseados fora do catalogo real", () => {
  const validation = validateSchedulingDisambiguationHumanizedReply({
    replyText: "Qual ultrassom voce precisa? Por exemplo, *ultrassom de mamas com Doppler* ou *doppler de carotidas*.",
    structuredReply: ambiguousSchedulingReply,
    promptDoNegocio: "Pergunte qual ultrassom a pessoa precisa antes de falar de agenda.",
  });

  assert.equal(validation.isValid, false);
  assert.match(validation.issues.join(","), /mentioned_service_not_in_catalog/i);
});

test("validateSchedulingSlotListingHumanizedReply rejeita horario inventado e aplica fallback seguro", () => {
  const validation = validateSchedulingSlotListingHumanizedReply({
    replyText: "O primeiro horario disponivel e segunda-feira, dia 16/03, as 14h45. Posso agendar para voce nesse horario?",
    structuredReply: slotListingReply,
    promptDoNegocio: "Ofereca apenas o primeiro horario disponivel e nunca mostre lista de horarios.",
  });
  const normalizedFallback = validation.fallbackReply.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  assert.equal(validation.isValid, false);
  assert.match(validation.issues.join(","), /invented_slot_time|single_slot_mode_mismatch/i);
  assert.match(normalizedFallback, /08h30/i);
  assert.doesNotMatch(normalizedFallback, /14h45/i);
});
