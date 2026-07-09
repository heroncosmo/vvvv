import assert from "node:assert/strict";

import {
  buildCatalogProductDeliveryActions,
  isCatalogProductAvailable,
} from "../productCatalogMessageActions";
import { buildCatalogProductImageMediaName } from "../productCatalogMediaService";
import {
  MAURICIO_MFC_READY_50X50_PROMO_LINK,
  MAURICIO_MFC_USER_ID,
} from "../mauricioMfcCatalogModule";

const baseProduct = {
  id: "product-1",
  name: "Painel Galaxia",
  price: "70.00",
  description: "Descricao completa do produto.",
  images: [
    {
      id: "img-1",
      storage_url: "https://example.com/1.jpg",
      file_name: "1.jpg",
      display_order: 0,
    },
    {
      id: "img-2",
      storage_url: "https://example.com/2.jpg",
      file_name: "2.jpg",
      display_order: 1,
    },
  ],
};

const withDescription = buildCatalogProductDeliveryActions(
  {
    ...baseProduct,
    controlStock: false,
    stock: 0,
    sendDescriptionWithImages: true,
  },
  [],
);

assert.deepEqual(
  withDescription.map((action) => action.type),
  ["send_media_url", "send_media_url", "send_text"],
);
assert.equal(withDescription[0]?.caption, "Painel Galaxia");
assert.equal(withDescription[2]?.type, "send_text");
assert.equal((withDescription[2] as { text: string }).text, "Descricao completa do produto.");

const withoutToggle = buildCatalogProductDeliveryActions(
  {
    ...baseProduct,
    controlStock: false,
    stock: 0,
    sendDescriptionWithImages: false,
  },
  [],
);

assert.deepEqual(
  withoutToggle.map((action) => action.type),
  ["send_media_url", "send_media_url"],
);

const afterAlreadySent = buildCatalogProductDeliveryActions(
  {
    ...baseProduct,
    controlStock: false,
    stock: 0,
    sendDescriptionWithImages: true,
  },
  [
    buildCatalogProductImageMediaName("product-1", "img-1"),
    buildCatalogProductImageMediaName("product-1", "img-2"),
  ],
);

assert.equal(afterAlreadySent.length, 0);

assert.equal(isCatalogProductAvailable({ controlStock: false, stock: 0 }), true);
assert.equal(isCatalogProductAvailable({ controlStock: true, stock: 2 }), true);
assert.equal(isCatalogProductAvailable({ controlStock: true, stock: 0 }), false);

const blockedByStock = buildCatalogProductDeliveryActions(
  {
    ...baseProduct,
    controlStock: true,
    stock: 0,
    sendDescriptionWithImages: true,
  },
  [],
);

assert.equal(blockedByStock.length, 0);

const withImageVariations = buildCatalogProductDeliveryActions(
  {
    ...baseProduct,
    controlStock: false,
    stock: 0,
    imageVariationsEnabled: true,
    images: [
      {
        id: "img-1",
        storage_url: "https://example.com/1.jpg",
        file_name: "1.jpg",
        display_order: 0,
        variation_code: 1,
        variation_name: "Painel Redondo",
        variation_price: "55.00",
        variation_stock: 3,
        variation_is_active: true,
      },
      {
        id: "img-2",
        storage_url: "https://example.com/2.jpg",
        file_name: "2.jpg",
        display_order: 1,
        variation_code: 2,
        variation_price: null,
        variation_stock: null,
        variation_is_active: false,
      },
    ],
  },
  [],
);

assert.equal(withImageVariations.length, 1);
const variationCaption = String((withImageVariations[0] as { caption?: string }).caption || "");
assert.equal(variationCaption.includes("Painel Galaxia"), true);
assert.equal(/C.digo 1/.test(variationCaption), true);
assert.equal(variationCaption.includes("Nome Painel Redondo"), true);
assert.equal(/Pre.o R\$/.test(variationCaption), true);
assert.equal(variationCaption.includes("55,00"), true);
assert.equal(variationCaption.includes("Estoque 3"), true);

const withMetadataButWithoutGlobalFlag = buildCatalogProductDeliveryActions(
  {
    ...baseProduct,
    controlStock: false,
    stock: 0,
    imageVariationsEnabled: false,
    images: [
      {
        id: "img-3",
        storage_url: "https://example.com/3.jpg",
        file_name: "3.jpg",
        display_order: 0,
        variation_code: 40,
        variation_name: "Cilindros do Hulk",
        variation_price: null,
        variation_stock: 5,
        variation_is_active: true,
      },
    ],
  },
  [],
);

assert.equal(withMetadataButWithoutGlobalFlag.length, 1);
const fallbackCaption = String((withMetadataButWithoutGlobalFlag[0] as { caption?: string }).caption || "");
const fallbackLines = fallbackCaption.split("\n").map((line) => line.trim()).filter(Boolean);
assert.equal(fallbackLines[0], "Painel Galaxia");
assert.equal(fallbackLines.some((line) => /C.digo 40/.test(line)), true);
assert.equal(fallbackLines.some((line) => line.includes("Nome Cilindros do Hulk")), true);
assert.equal(fallbackLines.some((line) => /Pre.o R\$/.test(line)), true);
assert.equal(fallbackLines.some((line) => line.includes("70,00")), true);
assert.equal(fallbackLines.some((line) => line.includes("Estoque 5")), true);

const mfcGenericArtProduct = {
  ...baseProduct,
  id: "mfc-product",
  name: "LILO STHIC CATALOGO DE FOTOS",
  category: "catalogo",
  description: `Promocao painel 50x50. Fotos e temas: ${MAURICIO_MFC_READY_50X50_PROMO_LINK}`,
  controlStock: false,
  stock: 0,
  sendDescriptionWithImages: true,
  imageVariationsEnabled: true,
  images: [
    {
      id: "mfc-img-1",
      storage_url: "https://example.com/mfc-1.jpg",
      file_name: "mfc-1.jpg",
      display_order: 0,
      variation_code: 14,
      variation_name: "CATALOGO DE FOTOS DE ARTES",
      variation_price: null,
      variation_stock: null,
      variation_is_active: true,
    },
    {
      id: "mfc-img-2",
      storage_url: "https://example.com/mfc-2.jpg",
      file_name: "mfc-2.jpg",
      display_order: 1,
      variation_code: 15,
      variation_name: "PAINEL REDONDO LILO STHIC",
      variation_price: null,
      variation_stock: null,
      variation_is_active: true,
    },
    {
      id: "mfc-img-3",
      storage_url: "https://example.com/mfc-3.jpg",
      file_name: "mfc-3.jpg",
      display_order: 2,
      variation_code: 23,
      variation_name: "PAINEL LATERAL DO LILO STHIC",
      variation_price: null,
      variation_stock: null,
      variation_is_active: true,
    },
  ],
};

const mfcArtReferenceActions = buildCatalogProductDeliveryActions(
  {
    ...mfcGenericArtProduct,
    id: "mfc-art-reference-product",
    name: "TRES PALAVRINHAS CATALOGO FOTOS",
    price: "70.00",
    description: null,
    sendDescriptionWithImages: false,
    images: [
      {
        id: "mfc-art-reference-img",
        storage_url: "https://example.com/mfc-art-reference.jpg",
        file_name: "mfc-art-reference.jpg",
        display_order: 0,
        variation_code: 1,
        variation_name: "CATALOGO DE FOTOS DE ARTES",
        variation_price: null,
        variation_stock: null,
        variation_is_active: true,
      },
    ],
  },
  [],
  {
    userId: MAURICIO_MFC_USER_ID,
    contextText: "quero fotos do tema tres palavrinhas",
  },
);

assert.equal(mfcArtReferenceActions.length, 1, "arte de referencia MFC deve enviar a foto cadastrada");
const mfcArtReferenceCaption = String((mfcArtReferenceActions[0] as { caption?: string }).caption || "");
assert.match(mfcArtReferenceCaption, /CATALOGO DE FOTOS DE ARTES/i);
assert.doesNotMatch(mfcArtReferenceCaption, /Pre.o R\$ 70,00/i);
assert.doesNotMatch(mfcArtReferenceCaption, /costurado|sem costura|acabamento/i);

const mfcLateralActions = buildCatalogProductDeliveryActions(mfcGenericArtProduct, [], {
  userId: MAURICIO_MFC_USER_ID,
  contextText: "quero painel lateral do lilo",
  mauricioMfcIncludeReady50x50Promo: false,
});

assert.equal(mfcLateralActions.length, 1, "pedido lateral MFC deve enviar somente midia lateral e sem descricao promocional");
const mfcLateralCaption = String((mfcLateralActions[0] as { caption?: string }).caption || "");
assert.match(mfcLateralCaption, /costurado R\$ 70,00; sem costura R\$ 65,00/);
assert.match(mfcLateralCaption, /PAINEL LATERAL/i);
assert.doesNotMatch(mfcLateralCaption, /promocional|photos\.app\.goo\.gl/i);

const mfcReady50Actions = buildCatalogProductDeliveryActions(mfcGenericArtProduct, [], {
  userId: MAURICIO_MFC_USER_ID,
  contextText: "quero painel lilo de 50",
  mauricioMfcIncludeReady50x50Promo: true,
});

assert.equal(mfcReady50Actions.length, 2, "pedido 50x50 MFC deve enviar midia redonda e permitir descricao promocional");
const mfcReady50Caption = String((mfcReady50Actions[0] as { caption?: string }).caption || "");
assert.match(mfcReady50Caption, /50x50 costurado promocional/);
assert.match(mfcReady50Caption, /PAINEL REDONDO/i);
assert.equal((mfcReady50Actions[1] as { text?: string }).text?.includes(MAURICIO_MFC_READY_50X50_PROMO_LINK), true);

console.log("productCatalogMessageActions.test.ts ok");
