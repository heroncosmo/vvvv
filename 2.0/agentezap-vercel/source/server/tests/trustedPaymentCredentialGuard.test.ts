import assert from "node:assert/strict";

import { enforceTrustedPaymentCredentialReply } from "../paymentCredentialGuard";

const tvOnPrompt = `
Fluxo Tv On.
Valores: 1 mes R$35.
Fora do script, redirecione para o suporte.
Suporte: 7498817-6272
`;

const untrustedPix = enforceTrustedPaymentCredentialReply({
  text: "Claro, Josue! Segue a chave Pix para pagamento: Danilo ramos da silva. Chave: (69) 99245-6513",
  prompt: tvOnPrompt,
  trustedReferenceText: tvOnPrompt,
  conversationHistory: [
    {
      fromMe: false,
      isFromAgent: false,
      text: "[IMAGEM ANALISADA: comprovante PIX para Danilo Ramos da Silva, Chave PIX: (69) 99245-6513]",
    },
    {
      fromMe: true,
      isFromAgent: true,
      text: "Segue a chave Pix para pagamento: Danilo ramos da silva. Chave: (69) 99245-6513",
    },
  ],
});

assert.equal(untrustedPix.applied, true);
assert.equal(untrustedPix.reason, "untrusted_payment_credential");
assert.match(untrustedPix.text, /suporte: 7498817-6272/i);
assert.doesNotMatch(untrustedPix.text, /99245-6513|Danilo/i);

const leakedSimulatorPix = enforceTrustedPaymentCredentialReply({
  text: "Claro! Para pagar, utilize a chave Pix: *Danilo Ramos da Silva*, telefone *69992456513*.",
  prompt: tvOnPrompt,
  trustedReferenceText: tvOnPrompt,
  conversationHistory: [
    {
      fromMe: false,
      isFromAgent: false,
      text: "Esse print mostra Danilo ramos da silva e telefone 69992456513 como pix",
    },
  ],
});

assert.equal(leakedSimulatorPix.applied, true);
assert.match(leakedSimulatorPix.text, /suporte: 7498817-6272/i);
assert.doesNotMatch(leakedSimulatorPix.text, /69992456513|Danilo/i);

const leakedPixByNameAndPhone = enforceTrustedPaymentCredentialReply({
  text: "Claro! Para fazer o pagamento, o Pix é no nome: Danilo Ramos da Silva ou pelo telefone 69992456513.",
  prompt: tvOnPrompt,
  trustedReferenceText: tvOnPrompt,
  conversationHistory: [
    {
      fromMe: false,
      isFromAgent: false,
      text: "Esse print mostra Danilo ramos da silva e telefone 69992456513 como pix",
    },
  ],
});

assert.equal(leakedPixByNameAndPhone.applied, true);
assert.match(leakedPixByNameAndPhone.text, /suporte: 7498817-6272/i);
assert.doesNotMatch(leakedPixByNameAndPhone.text, /69992456513|Danilo/i);

const trustedPrompt = `
Dados oficiais de pagamento:
Chave Pix: (71) 99729-6648
Destinatario: Loja Exemplo
`;

const trustedPix = enforceTrustedPaymentCredentialReply({
  text: "Pode pagar no Pix. Chave Pix: (71) 99729-6648",
  prompt: trustedPrompt,
  trustedReferenceText: trustedPrompt,
  conversationHistory: [],
});

assert.equal(trustedPix.applied, false);
assert.equal(trustedPix.text, "Pode pagar no Pix. Chave Pix: (71) 99729-6648");

const plainPayment = enforceTrustedPaymentCredentialReply({
  text: "A gente aceita Pix, cartao e dinheiro.",
  prompt: "Formas de pagamento: Pix, cartao e dinheiro.",
  trustedReferenceText: "Formas de pagamento: Pix, cartao e dinheiro.",
  conversationHistory: [],
});

assert.equal(plainPayment.applied, false);
assert.equal(plainPayment.text, "A gente aceita Pix, cartao e dinheiro.");

console.log("trustedPaymentCredentialGuard.test.ts ok");
