import assert from "node:assert/strict";

import { matchCatalogVariationFromCustomerImage } from "../productCatalogVariationMatcher";

const matched = await matchCatalogVariationFromCustomerImage(
  {
    customerImageDescription: "Painel redondo azul com estrelas e tema galáxia.",
    customerMessage: "quero este painel",
    candidates: [
      {
        mediaId: "media-1",
        productId: "product-1",
        productName: "Painel Galáxia",
        fileName: "painel-redondo-galaxia.jpg",
        variationCode: 1,
        variationName: "Painel Redondo",
        variationPrice: "55.00",
        variationStock: 2,
        variationIsActive: true,
      },
    ],
  },
  {
    completeVariationMatch: async () =>
      ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "MATCH",
                productId: "product-1",
                mediaId: "media-1",
                confidence: 92,
                reason: "Descricao coincide com a variacao cadastrada.",
              }),
            },
          },
        ],
      }) as any,
  },
);

assert.equal(matched?.matched, true);
assert.equal(matched?.productId, "product-1");
assert.equal(matched?.mediaId, "media-1");

const exactCodeMatched = await matchCatalogVariationFromCustomerImage(
  {
    customerImageDescription: "Foto encaminhada pelo cliente com legenda de catálogo.",
    customerMessage: "HULK CATALOGO DE FOTOS\nCódigo 40\nNome CILINDROS DO HULK\nPreço R$ 100,00",
    candidates: [
      {
        mediaId: "media-39",
        productId: "product-hulk",
        productName: "Cilindros Hulk",
        variationCode: 39,
        variationName: "CILINDROS DO HULK",
        variationPrice: "100.00",
        variationIsActive: true,
      },
      {
        mediaId: "media-40",
        productId: "product-hulk",
        productName: "Cilindros Hulk",
        variationCode: 40,
        variationName: "CILINDROS DO HULK",
        variationPrice: "100.00",
        variationIsActive: true,
      },
    ],
  },
  {
    completeVariationMatch: async () => {
      throw new Error("Não deve chamar LLM quando a legenda tem código exato");
    },
  },
);

assert.equal(exactCodeMatched?.matched, true);
assert.equal(exactCodeMatched?.mediaId, "media-40");
assert.deepEqual(exactCodeMatched?.matches?.map((match) => match.mediaId), ["media-40"]);

const tenExactCodesMatched = await matchCatalogVariationFromCustomerImage(
  {
    customerImageDescription: "Print do pedido com codigos selecionados 31, 32, 33, 34, 35, 36, 37, 38, 39 e 40.",
    customerMessage: "quero esses itens do print",
    candidates: Array.from({ length: 10 }, (_, index) => {
      const code = 31 + index;
      return {
        mediaId: `media-${code}`,
        productId: "product-catalog",
        productName: "Catalogo de temas",
        variationCode: code,
        variationName: `ITEM ${code}`,
        variationPrice: "100.00",
        variationIsActive: true,
      };
    }),
  },
  {
    completeVariationMatch: async () => {
      throw new Error("Nao deve chamar LLM quando a imagem/lista tem 10 codigos exatos");
    },
  },
);

assert.equal(tenExactCodesMatched?.matched, true);
assert.equal(tenExactCodesMatched?.mediaId, "media-31");
assert.deepEqual(
  tenExactCodesMatched?.matches?.map((match) => match.mediaId),
  ["media-31", "media-32", "media-33", "media-34", "media-35", "media-36", "media-37", "media-38", "media-39", "media-40"],
);

const priceMustNotBeTreatedAsCode = await matchCatalogVariationFromCustomerImage(
  {
    customerImageDescription: "Foto encaminhada pelo cliente com legenda sem código explícito.",
    customerMessage: "Nome CILINDROS DO HULK\nPreço R$ 100,00",
    candidates: [
      {
        mediaId: "media-100",
        productId: "product-hulk",
        productName: "Cilindros Hulk",
        variationCode: 100,
        variationName: "CILINDROS DO HULK",
        variationPrice: "100.00",
        variationIsActive: true,
      },
    ],
  },
  {
    completeVariationMatch: async () =>
      ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "NO_MATCH",
                productId: null,
                mediaId: null,
                confidence: 20,
                reason: "Preço não é código de variação.",
              }),
            },
          },
        ],
      }) as any,
  },
);

assert.equal(priceMustNotBeTreatedAsCode?.matched, false);

const notMatched = await matchCatalogVariationFromCustomerImage(
  {
    customerImageDescription: "Imagem sem relacao com o catalogo.",
    customerMessage: "quero esse",
    candidates: [
      {
        mediaId: "media-1",
        productId: "product-1",
        productName: "Painel Galáxia",
        variationIsActive: true,
      },
    ],
  },
  {
    completeVariationMatch: async () =>
      ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "NO_MATCH",
                productId: null,
                mediaId: null,
                confidence: 30,
                reason: "Sem correspondencia suficiente.",
              }),
            },
          },
        ],
      }) as any,
  },
);

assert.equal(notMatched?.matched, false);

console.log("productCatalogVariationMatcher.test.ts ok");
