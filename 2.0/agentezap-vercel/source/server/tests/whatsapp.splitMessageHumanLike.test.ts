import assert from "node:assert/strict";
import {
  joinBubbleMessages,
  parseExplicitBubbleMessages,
  sanitizeAgentResponseTail,
} from "../whatsappMessageSplit";

const truncatedListReply = [
  "Entendo sua preocupacao com o tom do audio, docinho. A gente pode ajustar isso para ficar mais natural, com um tom mais proximo do seu jeito de falar. Sobre o recebimento de pagamentos, o AgenteZap nao faz a intermediacao financeira diretamente, mas podemos integrar o processo de geracao do Pix e envio automatico para o cliente. Por exemplo:",
  "1. O AgenteZap envia o valor e a chave Pix para o cliente copiar e colar.",
  "2.",
].join("\n");

const sanitized = sanitizeAgentResponseTail(truncatedListReply);
assert.equal(
  sanitized.includes("\n2."),
  false,
  "nao deve manter marcador de lista incompleto no final da resposta",
);

assert.equal(
  sanitized.endsWith(":"),
  false,
  "nao deve terminar com conector pendurado apos saneamento",
);

const explicitBubbleReply = [
  "Prazer, Alan! Eu me chamo Franciele. 😊",
  "[BOLHA]",
  "É bem simples.",
  "[bolha]",
  "Posso te enviar a ficha agora?",
].join("\n");

const explicitBubbleParts = parseExplicitBubbleMessages(explicitBubbleReply);
assert.equal(
  explicitBubbleParts.hasExplicitBubbles,
  true,
  "deve detectar o marcador explicito de bolha sem depender de regex",
);
assert.deepEqual(
  explicitBubbleParts.parts,
  [
    "Prazer, Alan! Eu me chamo Franciele. 😊",
    "É bem simples.",
    "Posso te enviar a ficha agora?",
  ],
  "deve quebrar a resposta exatamente nas bolhas explicitas e remover o marcador do texto final",
);
assert.equal(
  joinBubbleMessages(explicitBubbleParts.parts),
  "Prazer, Alan! Eu me chamo Franciele. 😊\n\nÉ bem simples.\n\nPosso te enviar a ficha agora?",
  "deve reconstruir o texto normalizado sem vazar o marcador [BOLHA]",
);

console.log("whatsapp.splitMessageHumanLike.test.ts ok");
