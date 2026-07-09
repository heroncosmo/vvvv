import assert from "node:assert/strict";
import {
  joinBubbleMessages,
  normalizeInlineNumberedListBreaks,
  parseExplicitBubbleMessages,
  sanitizeAgentResponseTail,
} from "../whatsappMessageSplit";
import { normalizeOutboundTextForCustomer } from "../outboundTextPolicy";

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

const danglingHeadingReply = [
  "Valores oficiais:",
  "1 gel R$90",
  "2 gels R$180",
  "Promocao do Facebook:",
].join("\n");

const sanitizedDanglingHeading = sanitizeAgentResponseTail(danglingHeadingReply);
assert.equal(
  sanitizedDanglingHeading.includes("Promocao do Facebook"),
  false,
  "nao deve manter cabecalho final solto sem conteudo depois",
);
assert.equal(
  sanitizedDanglingHeading,
  "Valores oficiais:\n1 gel R$90\n2 gels R$180",
  "deve preservar o conteudo anterior ao remover o cabecalho final pendurado",
);

const explicitBubbleReply = [
  "Prazer, Alan! Eu me chamo Franciele.",
  "[BOLHA]",
  "E bem simples.",
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
    "Prazer, Alan! Eu me chamo Franciele.",
    "E bem simples.",
    "Posso te enviar a ficha agora?",
  ],
  "deve quebrar a resposta exatamente nas bolhas explicitas e remover o marcador do texto final",
);
assert.equal(
  joinBubbleMessages(explicitBubbleParts.parts),
  "Prazer, Alan! Eu me chamo Franciele.\n\nE bem simples.\n\nPosso te enviar a ficha agora?",
  "deve reconstruir o texto normalizado sem vazar o marcador [BOLHA]",
);

const outboundWithBubbleMarker = normalizeOutboundTextForCustomer(
  "Pode testar por aqui:[BOLHA]https://agentezap.online Depois me chama.",
);
assert.equal(
  outboundWithBubbleMarker.includes("[BOLHA]"),
  false,
  "o normalizador final de envio nunca deve vazar o marcador interno",
);
assert.equal(
  outboundWithBubbleMarker.includes("https://www.agentezap.online"),
  true,
  "o normalizador final deve continuar preservando URL segura para WhatsApp",
);

const inlineNumberedList = "Grupos disponiveis: 1. Grupo A\nValor diaria: R$ 129,00 2. Grupo B\nValor diaria: R$ 149,00 3. Grupo C";
const normalizedInlineList = normalizeInlineNumberedListBreaks(inlineNumberedList);
assert.equal(
  normalizedInlineList.includes("disponiveis:\n1. Grupo A"),
  true,
  "deve mover o primeiro item numerado para uma linha propria depois de dois-pontos",
);
assert.equal(
  normalizedInlineList.includes("R$ 129,00\n2. Grupo B"),
  true,
  "deve mover o segundo item numerado para o inicio da linha",
);
assert.equal(
  normalizedInlineList.includes("R$ 149,00\n3. Grupo C"),
  true,
  "deve mover o terceiro item numerado para o inicio da linha",
);

console.log("whatsapp.splitMessageHumanLike.test.ts ok");
