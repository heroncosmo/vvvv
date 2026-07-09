import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPromptDailyRentalGroupList,
  buildPromptDailyRentalQuote,
  extractPromptDailyRentalGroups,
} from "../promptDailyRentalQuote";
import { parseExplicitBubbleMessages } from "../whatsappMessageSplit";

const prompt = `
VOCE E A LUIZA, CONSULTORA VIRTUAL DA CEARA RENT A CAR EM FORTALEZA/CE.

FONTE OFICIAL UNICA DE CARROS E VALORES

Grupo A - R$129/dia
Modelos: Fiat Mobi, Ford Ka, Renault Kwid.

Grupo B - R$149/dia
Modelos: Hyundai HB20, Chevrolet Onix, Fiat Argo, Volkswagen Polo.

Grupo C - R$169/dia
Modelos: Chevrolet Onix Plus, Fiat Cronos, Hyundai HB20S.

Grupo D - R$349/dia
Modelos: Jeep Renegade, Hyundai Creta, Nissan Kicks.

Grupo G - R$299/dia
Modelo: Chevrolet Spin 7 lugares.

Grupo H - R$570/dia
Modelo: Toyota Hilux 4x4.

MAPEAMENTO OBRIGATORIO
- Mobi, Ka ou Kwid => Grupo A.
- HB20, Onix, Argo ou Polo => Grupo B.
- Onix Plus, Cronos ou HB20S => Grupo C.
- SUV, Renegade, Creta ou Kicks => Grupo D.
- Spin, 7 lugares ou minivan => Grupo G.
- Hilux, 4x4, picape ou caminhonete => Grupo H.
- Se o cliente pedir S10, L200, L200 Triton, Toro ou outra picape fora da tabela, redirecione para Grupo H.

Taxa de lavagem fixa: R$60
`;

const groups = extractPromptDailyRentalGroups(prompt);
assert.equal(groups.length, 6);
assert.equal(groups.find((group) => group.group === "H")?.dailyRate, 570);

const colonPrompt = `
VALORES POR GRUPO
- Grupo A: R$ 129,00 por diária. Exemplos: Fiat Mobi, Ford Ka, Renault Kwid.
- Grupo B: R$ 149,00 por diária. Exemplos: Hyundai HB20, Chevrolet Onix, Fiat Argo, Volkswagen Polo.
- Grupo C: R$ 169,00 por diária. Exemplos: Chevrolet Onix Plus, Fiat Cronos, Hyundai HB20S.
- Grupo D: R$ 349,00 por diária. Exemplos: Jeep Renegade, Hyundai Creta, Nissan Kicks.
- Grupo G: R$ 299,00 por diária. Exemplo: Chevrolet Spin.
- Grupo H: R$ 570,00 por diária. Exemplo: Toyota Hilux.

TAXA DE LAVAGEM
Taxa de lavagem fixa: R$ 60,00
`;

const colonGroups = extractPromptDailyRentalGroups(colonPrompt);
assert.equal(colonGroups.length, 6);
assert.equal(colonGroups.find((group) => group.group === "H")?.dailyRate, 570);

const groupList = buildPromptDailyRentalGroupList({
  prompt: colonPrompt,
  message: "1",
});
assert.ok(groupList);
assert.match(groupList.text, /Valores por grupo:/);
assert.match(groupList.text, /Grupo A: R\$ 129,00\/dia - Fiat Mobi, Ford Ka, Renault Kwid/);
assert.match(groupList.text, /Grupo H: R\$ 570,00\/dia - Toyota Hilux/);
assert.match(groupList.text, /Taxa de lavagem: R\$ 60,00 por orcamento\./);
assert.match(groupList.text, /grupo, data e horario de retirada e devolucao/);
assert.doesNotMatch(groupList.text, /Pagamento:|Caucao:|Requisitos:/);
const parsedGroupList = parseExplicitBubbleMessages(groupList.text);
assert.equal(parsedGroupList.hasExplicitBubbles, true);
assert.equal(parsedGroupList.parts.length, 3);
assert.doesNotMatch(parsedGroupList.parts.join("\n"), /\[BOLHA\]/);

const colonQuote = buildPromptDailyRentalQuote({
  prompt: colonPrompt,
  message: "Ola, queria alugar uma Hilux do dia 18/07 as 08h ate 20/07 as 20h. Quanto fica?",
  now: new Date(2026, 5, 25),
});
assert.ok(colonQuote);
assert.equal(colonQuote.group.group, "H");
assert.equal(colonQuote.days, 3);
assert.equal(colonQuote.total, 1770);
assert.match(colonQuote.text, /Grupo: H - Toyota Hilux/);
assert.match(colonQuote.text, /Retirada: 18\/07\/2026 as 08:00/);
assert.match(colonQuote.text, /Devolucao: 20\/07\/2026 as 20:00/);
assert.match(colonQuote.text, /Total: R\$ 1\.770,00/);
assert.doesNotMatch(colonQuote.text, /\[BOLHA\]/);
assert.doesNotMatch(colonQuote.text, /Pagamento:|Caucao:|Requisitos:/);

const l200Quote = buildPromptDailyRentalQuote({
  prompt,
  message: "Tem L200 de 18/07 08:00 ate 20/07 20:00?",
  now: new Date(2026, 5, 25),
});
assert.ok(l200Quote);
assert.equal(l200Quote.group.group, "H");
assert.equal(l200Quote.days, 3);
assert.equal(l200Quote.total, 1770);
assert.match(l200Quote.text, /Grupo: H - Toyota Hilux 4x4/);
assert.match(l200Quote.text, /Total: R\$ 1\.770,00/);
assert.doesNotMatch(l200Quote.text, /nao trabalhamos|nao temos|nao esta disponivel/i);

const pickupQuote = buildPromptDailyRentalQuote({
  prompt,
  message: "picape ou 4x4 18/07 08:00 ate 20/07 20:00",
  now: new Date(2026, 5, 25),
});
assert.ok(pickupQuote);
assert.equal(pickupQuote.group.group, "H");
assert.equal(pickupQuote.total, 1770);

const onixQuote = buildPromptDailyRentalQuote({
  prompt,
  message: "Onix de 11/07 09:00 ate 02/08 09:00",
  now: new Date(2026, 5, 25),
});
assert.ok(onixQuote);
assert.equal(onixQuote.group.group, "B");
assert.equal(onixQuote.days, 22);
assert.equal(onixQuote.total, 3338);

const onixPlusQuote = buildPromptDailyRentalQuote({
  prompt,
  message: "Onix Plus de 11/07 09:00 ate 02/08 09:00",
  now: new Date(2026, 5, 25),
});
assert.ok(onixPlusQuote);
assert.equal(onixPlusQuote.group.group, "C");

const fractionalQuote = buildPromptDailyRentalQuote({
  prompt,
  message: "Grupo A de 01/07 10:00 ate 02/07 11:00",
  now: new Date(2026, 5, 25),
});
assert.ok(fractionalQuote);
assert.equal(fractionalQuote.days, 2);
assert.equal(fractionalQuote.total, 318);

const bareHQuote = buildPromptDailyRentalQuote({
  prompt,
  message: "h 15/10 as 02 ate 20/10 as 20",
  now: new Date(2026, 5, 25),
});
assert.ok(bareHQuote);
assert.equal(bareHQuote.group.group, "H");
assert.equal(bareHQuote.days, 6);
assert.equal(bareHQuote.total, 3480);
assert.match(bareHQuote.text, /Orcamento/);
assert.match(bareHQuote.text, /Grupo: H - Toyota Hilux 4x4/);
assert.match(bareHQuote.text, /Retirada: 15\/10\/2026 as 02:00/);
assert.match(bareHQuote.text, /Devolucao: 20\/10\/2026 as 20:00/);
assert.match(bareHQuote.text, /Diarias: 6 diarias/);
assert.match(bareHQuote.text, /Valor da diaria: R\$ 570,00/);
assert.match(bareHQuote.text, /Subtotal: R\$ 3\.420,00 \(6 x R\$ 570,00\)/);
assert.match(bareHQuote.text, /Total: R\$ 3\.480,00/);
assert.ok(bareHQuote.text.split("\n").length >= 10);
assert.doesNotMatch(bareHQuote.text, /\[BOLHA\]/);
const parsedBareHQuote = parseExplicitBubbleMessages(bareHQuote.text);
assert.equal(parsedBareHQuote.parts.length, 1);
assert.doesNotMatch(parsedBareHQuote.parts[0] || "", /x\n\d+\)/);

const trailingHQuote = buildPromptDailyRentalQuote({
  prompt,
  message: "13/12 as 20 ate 20/12 as 07:00 h",
  now: new Date(2026, 5, 25),
});
assert.ok(trailingHQuote);
assert.equal(trailingHQuote.group.group, "H");
assert.equal(trailingHQuote.days, 7);
assert.equal(trailingHQuote.total, 4050);
assert.match(trailingHQuote.text, /Grupo: H - Toyota Hilux 4x4/);
assert.match(trailingHQuote.text, /Retirada: 13\/12\/2026 as 20:00/);
assert.match(trailingHQuote.text, /Devolucao: 20\/12\/2026 as 07:00/);
assert.match(trailingHQuote.text, /Total: R\$ 4\.050,00/);

assert.equal(
  buildPromptDailyRentalQuote({
    prompt,
    message: "13/12 as 20 ate 20/12 as 07:00",
    now: new Date(2026, 5, 25),
  }),
  null,
);

const missingGroupList = buildPromptDailyRentalGroupList({
  prompt: colonPrompt,
  message: "13/12 as 20 ate 20/12 as 07:00",
});
assert.ok(missingGroupList);
assert.equal(missingGroupList.reason, "prompt_daily_rental_group_list:missing_group_for_complete_period");
assert.match(missingGroupList.text, /falta o grupo do carro/);
assert.match(missingGroupList.text, /Grupo H: R\$ 570,00\/dia - Toyota Hilux/);
assert.match(missingGroupList.text, /Qual grupo voce quer/);
assert.doesNotMatch(missingGroupList.text, /Total: R\$/);
const parsedMissingGroupList = parseExplicitBubbleMessages(missingGroupList.text);
assert.equal(parsedMissingGroupList.hasExplicitBubbles, true);
assert.equal(parsedMissingGroupList.parts.length, 3);

const bareCQuote = buildPromptDailyRentalQuote({
  prompt,
  message: "c 01/09 as 11 ate 05/09 as 23",
  now: new Date(2026, 5, 25),
});
assert.ok(bareCQuote);
assert.equal(bareCQuote.group.group, "C");
assert.equal(bareCQuote.days, 5);
assert.equal(bareCQuote.total, 905);

assert.equal(
  buildPromptDailyRentalQuote({
    prompt,
    message: "a diaria de 15/10 as 02 ate 20/10 as 20",
    now: new Date(2026, 5, 25),
  }),
  null,
);

const historyContinuationQuote = buildPromptDailyRentalQuote({
  prompt,
  message: "C",
  history: [
    { role: "assistant", content: "Para calcular o orcamento, me envie grupo, retirada e devolucao." },
    { role: "user", content: "01/09 as 11 ate 05/09 as 23" },
  ],
  now: new Date(2026, 5, 25),
});
assert.ok(historyContinuationQuote);
assert.equal(historyContinuationQuote.group.group, "C");
assert.equal(historyContinuationQuote.days, 5);
assert.equal(historyContinuationQuote.total, 905);

assert.equal(
  buildPromptDailyRentalQuote({
    prompt,
    message: "sim",
    history: [{ role: "user", content: "h 15/10 as 02 ate 20/10 as 20" }],
  }),
  null,
);

assert.equal(
  buildPromptDailyRentalQuote({ prompt, message: "quais grupos voces tem?" }),
  null,
);

const httpSource = readFileSync(new URL("../../api/http.ts", import.meta.url), "utf8");
const aiAgentSource = readFileSync(new URL("../aiAgent.ts", import.meta.url), "utf8");
const moduleSource = readFileSync(new URL("../promptDailyRentalQuote.ts", import.meta.url), "utf8");

assert.match(httpSource, /buildPromptDailyRentalQuote\(\{\s*prompt:\s*activePrompt,\s*message,/s);
assert.match(httpSource, /mode:\s*"prompt_daily_rental_quote"/);
assert.match(httpSource, /buildPromptDailyRentalGroupList\(\{\s*prompt:\s*activePrompt,\s*message,/s);
assert.match(httpSource, /mode:\s*"prompt_daily_rental_group_list"/);
assert.match(aiAgentSource, /buildPromptDailyRentalQuote\(\{\s*prompt:\s*agentConfig\.prompt,\s*message:\s*newMessageText,/s);
assert.match(aiAgentSource, /buildPromptDailyRentalGroupList\(\{\s*prompt:\s*agentConfig\.prompt,\s*message:\s*newMessageText,/s);
assert.doesNotMatch(moduleSource, /7ef781da|contato@ceararentacar|ceararentacar\.com\.br|Ceara Rent A Car/i);

console.log("promptDailyRentalQuote.test.ts ok");
