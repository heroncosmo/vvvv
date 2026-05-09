import assert from "node:assert/strict";

import {
  hasActiveTraditionalMediaForOperationalRequest,
  isOperationalTextOnlyFalsePositiveMediaIntent,
  shouldRunTraditionalMediaSemanticRescue,
} from "../aiAgent";

assert.equal(
  shouldRunTraditionalMediaSemanticRescue({
    aiHadMediaIntent: true,
    explicitOperationalMediaRequest: false,
    hasTraditionalMedia: true,
    productsData: null,
  }),
  true,
);

assert.equal(
  shouldRunTraditionalMediaSemanticRescue({
    aiHadMediaIntent: false,
    explicitOperationalMediaRequest: true,
    hasTraditionalMedia: true,
    productsData: null,
  }),
  true,
);

assert.equal(
  shouldRunTraditionalMediaSemanticRescue({
    aiHadMediaIntent: false,
    explicitOperationalMediaRequest: false,
    hasTraditionalMedia: true,
    productsData: {
      active: false,
      count: 0,
      products: [],
      instructions: null,
      displayInstructions: null,
    },
  }),
  false,
);

assert.equal(
  shouldRunTraditionalMediaSemanticRescue({
    aiHadMediaIntent: false,
    explicitOperationalMediaRequest: false,
    hasTraditionalMedia: true,
    productsData: {
      active: true,
      count: 3,
      products: [],
      instructions: null,
      displayInstructions: null,
    },
  }),
  false,
);

assert.equal(
  shouldRunTraditionalMediaSemanticRescue({
    aiHadMediaIntent: false,
    explicitOperationalMediaRequest: false,
    hasTraditionalMedia: false,
    productsData: null,
  }),
  false,
);

assert.equal(
  hasActiveTraditionalMediaForOperationalRequest({
    message: "Me passa a chave Pix",
    mediaLibrary: [
      {
        name: "ENDERECO_DA_LOJA",
        mediaType: "image",
        whenToUse: "Use quando o cliente pedir endereco ou mapa",
        isActive: true,
      },
    ],
  }),
  false,
);

assert.equal(
  hasActiveTraditionalMediaForOperationalRequest({
    message: "Me passa a chave Pix",
    mediaLibrary: [
      {
        name: "ENDERECO_DA_LOJA",
        mediaType: "image",
        description: "Foto da entrada da loja",
        whenToUse:
          "Use somente quando o cliente pedir endereco, localizacao, mapa ou foto da entrada da loja. Nunca use para Pix, catalogo ou tema.",
        isActive: true,
      },
    ],
  }),
  false,
);

assert.equal(
  hasActiveTraditionalMediaForOperationalRequest({
    message: "Me passa a chave Pix",
    mediaLibrary: [
      {
        name: "QR_CODE_PIX",
        mediaType: "image",
        whenToUse: "Use quando o cliente pedir pix ou qr code",
        isActive: true,
      },
    ],
  }),
  true,
);

assert.equal(
  hasActiveTraditionalMediaForOperationalRequest({
    message: "Qual o endereco da loja?",
    mediaLibrary: [
      {
        name: "ENDERECO_DA_LOJA",
        mediaType: "image",
        whenToUse: "Use quando o cliente pedir endereco, mapa ou foto da loja",
        isActive: true,
      },
    ],
  }),
  true,
);

assert.equal(
  isOperationalTextOnlyFalsePositiveMediaIntent({
    customerMessage: "Manda o pix da loja",
    assistantResponse: "Perfeito! Vou te mandar os dados para pagamento agora.",
    mediaLibrary: [
      {
        name: "ENDERECO_DA_LOJA",
        mediaType: "image",
        whenToUse: "Use quando o cliente pedir endereco ou mapa",
        isActive: true,
      },
    ],
  }),
  true,
);

assert.equal(
  isOperationalTextOnlyFalsePositiveMediaIntent({
    customerMessage: "Me manda o QR Code do Pix",
    assistantResponse: "Vou te enviar o QR Code do Pix agora.",
    mediaLibrary: [
      {
        name: "QR_CODE_PIX",
        mediaType: "image",
        whenToUse: "Use quando o cliente pedir pix ou qr code",
        isActive: true,
      },
    ],
  }),
  false,
);

console.log("aiAgent.mediaRescuePolicy.test.ts ok");
process.exit(0);
