import assert from "node:assert/strict";

import { selectCatalogCodesFromConversation } from "../aiAgent";

const knownCodes = new Set([40, 41, 42, 43, 44, 45, 46, 47, 48, 49]);

const fiveInboundSelections = [
  { text: "Quero o codigo 40", mediaCaption: null, fromMe: false },
  { text: "Tambem o codigo 41", mediaCaption: null, fromMe: false },
  { text: "Pode incluir o codigo 42", mediaCaption: null, fromMe: false },
  { text: "E o codigo 43", mediaCaption: null, fromMe: false },
  { text: "Mais o codigo 44", mediaCaption: null, fromMe: false },
];

assert.deepEqual(
  selectCatalogCodesFromConversation({
    currentMessage: "Quero os codigos 40 41 42 43 44",
    conversationHistory: [],
    knownCodes,
  }),
  [40, 41, 42, 43, 44],
  "deve reconhecer todos os codigos citados na mensagem atual sem cortar apos 3 ou 4 itens",
);

assert.deepEqual(
  selectCatalogCodesFromConversation({
    currentMessage: "Quero os codigos 40 41 42 43 44 45 46 47 48 49",
    conversationHistory: [],
    knownCodes,
  }),
  [40, 41, 42, 43, 44, 45, 46, 47, 48, 49],
  "deve reconhecer 10 codigos validos na mesma mensagem sem truncar a selecao",
);

assert.deepEqual(
  selectCatalogCodesFromConversation({
    currentMessage: "quero 40,41,42,43,44,45,46,47,48,49",
    conversationHistory: [],
    knownCodes,
  }),
  [40, 41, 42, 43, 44, 45, 46, 47, 48, 49],
  "deve reconhecer lista longa de codigos mesmo quando o cliente nao escreve a palavra codigo antes de cada item",
);

assert.deepEqual(
  selectCatalogCodesFromConversation({
    currentMessage: "quero esses",
    conversationHistory: fiveInboundSelections,
    knownCodes,
  }),
  [40, 41, 42, 43, 44],
  "deve reaproveitar todas as selecoes recentes do cliente quando ele responder 'esses'",
);

const elevenAssistantSelections = [
  { text: "[FOTO 1]\nCodigo 31\nNome CATALOGO DE FOTOS DE ARTES", mediaCaption: null, fromMe: true },
  { text: "[FOTO 2]\nCodigo 32\nNome CATALOGO DE FOTOS DE ARTES", mediaCaption: null, fromMe: true },
  { text: "[FOTO 3]\nCodigo 33\nNome PAINEL REDONDO HULK\nPreco R$ 60,00", mediaCaption: null, fromMe: true },
  { text: "[FOTO 4]\nCodigo 34\nNome PAINEL REDONDO HULK\nPreco R$ 60,00", mediaCaption: null, fromMe: true },
  { text: "[FOTO 5]\nCodigo 35\nNome PAINEL REDONDO HULK\nPreco R$ 60,00", mediaCaption: null, fromMe: true },
  { text: "[FOTO 6]\nCodigo 36\nNome PAINEL REDONDO HULK\nPreco R$ 60,00", mediaCaption: null, fromMe: true },
  { text: "[FOTO 7]\nCodigo 37\nNome PAINEL REDONDO HULK\nPreco R$ 60,00", mediaCaption: null, fromMe: true },
  { text: "[FOTO 8]\nCodigo 38\nNome PAINEL REDONDO HULK\nPreco R$ 60,00", mediaCaption: null, fromMe: true },
  { text: "[FOTO 9]\nCodigo 39\nNome CILINDROS DO HULK\nPreco R$ 100,00", mediaCaption: null, fromMe: true },
  { text: "[FOTO 10]\nCodigo 40\nNome CILINDROS DO HULK\nPreco R$ 100,00", mediaCaption: null, fromMe: true },
  { text: "[FOTO 11]\nCodigo 41\nNome PAINEL LATERAL HULK\nPreco R$ 70,00", mediaCaption: null, fromMe: true },
];

assert.deepEqual(
  selectCatalogCodesFromConversation({
    currentMessage: "quero esses",
    conversationHistory: elevenAssistantSelections,
    knownCodes: new Set([31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41]),
  }),
  [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41],
  "deve reaproveitar todos os codigos recentes enviados pelo assistente quando o cliente responder 'quero esses'",
);

assert.deepEqual(
  selectCatalogCodesFromConversation({
    currentMessage: "codigo 45",
    conversationHistory: fiveInboundSelections,
    knownCodes,
  }),
  [45],
  "a mensagem atual com codigo explicito continua tendo prioridade sobre o historico",
);

console.log("aiAgent.catalogCodeSelection.test.ts ok");
process.exit(0);
