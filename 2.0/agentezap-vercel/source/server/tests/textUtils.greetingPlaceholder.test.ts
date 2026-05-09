import assert from "node:assert/strict";

import { processResponsePlaceholders } from "../textUtils";

assert.equal(
  processResponsePlaceholders("Oi {nome} tudo bem?", "Ana"),
  "Oi Ana tudo bem?",
  "deve substituir {nome} quando houver nome valido",
);

assert.equal(
  processResponsePlaceholders("Oi {nome} tudo bem?", undefined),
  "Oi tudo bem?",
  "na ausencia de nome o placeholder nao deve virar 'cliente'",
);

assert.equal(
  processResponsePlaceholders("Oi {nome} tudo bem?", "Visitante"),
  "Oi tudo bem?",
  "fallback generico do simulador nao deve aparecer para o cliente",
);

const saudacaoProcessada = processResponsePlaceholders("{{saudacao_inicial_horario}}", "Ana");

assert.equal(
  /\{\{saudacao_inicial_horario\}\}/.test(saudacaoProcessada),
  false,
  "o placeholder de saudacao por horario deve ser resolvido no simulador",
);

console.log("textUtils.greetingPlaceholder.test.ts ok");
