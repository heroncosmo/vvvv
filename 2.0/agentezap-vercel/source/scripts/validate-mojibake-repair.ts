import assert from "node:assert/strict";
import { repairMojibakeDeep, repairMojibakeText } from "../shared/mojibake";

const cases: Array<[string, string]> = [
  ["Você pode testar a Biblioteca de Mídias.", "Você pode testar a Biblioteca de Mídias."],
  ["VocÃª pode testar a Biblioteca de MÃ­dias.", "Você pode testar a Biblioteca de Mídias."],
  ["VocÃƒÂª pode testar a Biblioteca de MÃ­dias.", "Você pode testar a Biblioteca de Mídias."],
  ["ðŸŽ‰ Agente criado!", "🎉 Agente criado!"],
  ["AÃ§Ã£o desconhecida.", "Ação desconhecida."],
  ["NÃƒO force follow-up.", "NÃO force follow-up."],
  ["Pergunta â†’ resposta", "Pergunta → resposta"],
];

for (const [input, expected] of cases) {
  assert.equal(repairMojibakeText(input), expected, `repairMojibakeText failed for: ${input}`);
}

const deepInput = {
  prompt: "VocÃª Ã© um agente.",
  nested: {
    title: "Biblioteca de MÃ­dias",
    items: ["ðŸŽ‰ Agente criado!", "Você já está correto"],
  },
};

assert.deepEqual(repairMojibakeDeep(deepInput), {
  prompt: "Você é um agente.",
  nested: {
    title: "Biblioteca de Mídias",
    items: ["🎉 Agente criado!", "Você já está correto"],
  },
});

console.log("mojibake repair checks passed");
