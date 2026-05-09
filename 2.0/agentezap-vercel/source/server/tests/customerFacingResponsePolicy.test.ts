import assert from "node:assert/strict";

import {
  isExplicitOperationalMediaRequest,
  sanitizeCustomerFacingResponseText,
} from "../customerFacingResponsePolicy";

const leakedPromptReply = sanitizeCustomerFacingResponseText(`
1. Depois que o cliente escolhe um item, a conversa continua aberta.
2. Se o cliente mudar de assunto no meio do catalogo, responda o assunto atual.
[ENVIAR_FOTOS:CAPA_DE_CILINDRO_HULK]
Perfeito! A capa de cilindro do Hulk sem costura fica por R$ 80,00.
Me confirme se voce quer costurado ou sem costura e a quantidade.
`);

assert.equal(
  leakedPromptReply,
  "Perfeito! A capa de cilindro do Hulk sem costura fica por R$ 80,00.\nMe confirme se voce quer costurado ou sem costura e a quantidade.",
);

const leakedHeaderReply = sanitizeCustomerFacingResponseText(`
CALIBRACAO DE CONTINUIDADE OPERACIONAL E MUDANCA DE ASSUNTO - 30/03/2026
MENSAGEM_ATUAL:
manda endereco da loja
Nosso endereco da loja fisica e: Estrada da Liberdade, no 320.
`);

assert.equal(
  leakedHeaderReply,
  "Nosso endereco da loja fisica e: Estrada da Liberdade, no 320.",
);

assert.equal(isExplicitOperationalMediaRequest("Manda o endereco da loja"), true);
assert.equal(isExplicitOperationalMediaRequest("Me manda o QR Code do Pix"), true);
assert.equal(isExplicitOperationalMediaRequest("Tem painel Hulk?"), false);

console.log("customerFacingResponsePolicy.test.ts ok");
