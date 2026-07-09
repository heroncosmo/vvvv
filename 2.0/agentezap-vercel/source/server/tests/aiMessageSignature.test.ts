import assert from "node:assert/strict";

import {
  detectAgentSignatureNameFromPrompt,
  prependWhatsappSignature,
  resolveAgentSignatureName,
  stripWhatsappSignatureForSpeech,
} from "@shared/agentSignature";

assert.equal(
  detectAgentSignatureNameFromPrompt("Voce e **driele**, atendente da AgenteZap."),
  "Driele"
);

assert.equal(
  detectAgentSignatureNameFromPrompt("Voce e um assistente virtual da empresa."),
  null
);

assert.equal(
  resolveAgentSignatureName({
    configuredSignature: "Rodrigo",
    prompt: "Voce e Maria, atendente da Loja Teste.",
  }),
  "Rodrigo"
);

assert.equal(
  prependWhatsappSignature("Oi, tudo bem?", "Rodrigo"),
  "*Rodrigo:*\nOi, tudo bem?"
);

assert.equal(
  prependWhatsappSignature("*Rodrigo:*\nOi, tudo bem?", "Rodrigo"),
  "*Rodrigo:*\nOi, tudo bem?"
);

assert.equal(
  prependWhatsappSignature("*Rodrigo:* Sim, claro! Posso te mostrar.", "Rodrigo"),
  "*Rodrigo:*\nSim, claro! Posso te mostrar."
);

assert.equal(
  prependWhatsappSignature("Rodrigo:*\nOi, tudo bem?", "Rodrigo"),
  "*Rodrigo:*\nOi, tudo bem?"
);

assert.equal(
  prependWhatsappSignature(
    "*Rodrigo:*\nRodrigo:*\nBoa, Teodoro!\n*Rodrigo:*",
    "Rodrigo"
  ),
  "*Rodrigo:*\nBoa, Teodoro!"
);

assert.equal(
  stripWhatsappSignatureForSpeech("*Rodrigo:*\nOi, tudo bem?", "Rodrigo"),
  "Oi, tudo bem?"
);

assert.equal(
  stripWhatsappSignatureForSpeech("Rodrigo:*\nOi, tudo bem?", "Rodrigo"),
  "Oi, tudo bem?"
);

assert.equal(
  stripWhatsappSignatureForSpeech("Rodrigo: Oi, tudo bem?", "Rodrigo"),
  "Oi, tudo bem?"
);

assert.equal(
  stripWhatsappSignatureForSpeech("Importante: confira seu pedido", "Rodrigo"),
  "Importante: confira seu pedido"
);

console.log("aiMessageSignature.test.ts ok");
