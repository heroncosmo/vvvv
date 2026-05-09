import assert from "node:assert/strict";

import {
  buildCatalogProductDeliveryActions,
  isCatalogProductAvailable,
} from "../productCatalogMessageActions";
import { buildCatalogProductImageMediaName } from "../productCatalogMediaService";

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
assert.equal(variationCaption.includes("Código 1"), true);
assert.equal(variationCaption.includes("Nome Painel Redondo"), true);
assert.equal(variationCaption.includes("Preço R$"), true);
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
assert.equal(fallbackLines.some((line) => line.includes("Código 40")), true);
assert.equal(fallbackLines.some((line) => line.includes("Nome Cilindros do Hulk")), true);
assert.equal(fallbackLines.some((line) => line.includes("Preço R$")), true);
assert.equal(fallbackLines.some((line) => line.includes("70,00")), true);
assert.equal(fallbackLines.some((line) => line.includes("Estoque 5")), true);

console.log("productCatalogMessageActions.test.ts ok");
