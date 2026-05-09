import assert from "node:assert/strict";

import { buildDeterministicCatalogMultiCodeReply } from "../aiAgent";

const productsData: any = {
  active: true,
  instructions: null,
  displayInstructions: null,
  imageVariationsEnabled: true,
  count: 1,
  products: [
    {
      id: "prod-hulk",
      name: "HULK CATALOGO DE FOTOS",
      price: null,
      stock: 999,
      controlStock: false,
      description: null,
      sendDescriptionWithImages: false,
      category: "Temas",
      link: null,
      sku: null,
      unit: "un",
      imageVariationsEnabled: true,
      images: [
        { id: "31", product_id: "prod-hulk", storage_url: "https://img/31", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 31, variation_name: "CATALOGO DE FOTOS DE ARTES", variation_price: null, variation_stock: null, variation_is_active: true, display_order: 1 },
        { id: "32", product_id: "prod-hulk", storage_url: "https://img/32", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 32, variation_name: "CATALOGO DE FOTOS DE ARTES", variation_price: null, variation_stock: null, variation_is_active: true, display_order: 2 },
        { id: "33", product_id: "prod-hulk", storage_url: "https://img/33", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 33, variation_name: "PAINEL REDONDO HULK", variation_price: "60.00", variation_stock: null, variation_is_active: true, display_order: 3 },
        { id: "34", product_id: "prod-hulk", storage_url: "https://img/34", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 34, variation_name: "PAINEL REDONDO HULK", variation_price: "60.00", variation_stock: null, variation_is_active: true, display_order: 4 },
        { id: "35", product_id: "prod-hulk", storage_url: "https://img/35", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 35, variation_name: "PAINEL REDONDO HULK", variation_price: "60.00", variation_stock: null, variation_is_active: true, display_order: 5 },
        { id: "36", product_id: "prod-hulk", storage_url: "https://img/36", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 36, variation_name: "PAINEL REDONDO HULK", variation_price: "60.00", variation_stock: null, variation_is_active: true, display_order: 6 },
        { id: "37", product_id: "prod-hulk", storage_url: "https://img/37", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 37, variation_name: "PAINEL REDONDO HULK", variation_price: "60.00", variation_stock: null, variation_is_active: true, display_order: 7 },
        { id: "38", product_id: "prod-hulk", storage_url: "https://img/38", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 38, variation_name: "PAINEL REDONDO HULK", variation_price: "60.00", variation_stock: null, variation_is_active: true, display_order: 8 },
        { id: "39", product_id: "prod-hulk", storage_url: "https://img/39", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 39, variation_name: "CILINDROS DO HULK", variation_price: "100.00", variation_stock: null, variation_is_active: true, display_order: 9 },
        { id: "40", product_id: "prod-hulk", storage_url: "https://img/40", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 40, variation_name: "CILINDROS DO HULK", variation_price: "100.00", variation_stock: null, variation_is_active: true, display_order: 10 },
        { id: "41", product_id: "prod-hulk", storage_url: "https://img/41", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 41, variation_name: "PAINEL LATERAL HULK", variation_price: "70.00", variation_stock: null, variation_is_active: true, display_order: 11 },
      ],
    },
  ],
};

const deterministicReply = buildDeterministicCatalogMultiCodeReply({
  productsData,
  currentMessage: "quero os codigos 31 32 33 34 35 36 37 38 39 40 41",
  conversationHistory: [],
  assistantResponse:
    "Boa tarde! Seguem as fotos dos produtos solicitados:\n\nItem 1 codigo 31\nItem 2 codigo 32\nItem 3 codigo 33\nItem 4 codigo 34",
});

assert.ok(deterministicReply, "deve montar resposta deterministica para selecao longa de catalogo");
for (const code of [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41]) {
  assert.equal(
    deterministicReply!.includes(`Codigo: ${code}`) || deterministicReply!.includes(`Código: ${code}`),
    true,
    `deve listar o codigo ${code} sem cortar a selecao`,
  );
}
assert.equal(
  deterministicReply!.includes("[BOLHA]"),
  true,
  "deve quebrar em bolhas para nao depender de uma unica resposta gigante",
);
assert.equal(
  /orcamento|orçamento/i.test(deterministicReply!) && /pedido/i.test(deterministicReply!),
  true,
  "deve fechar com a pergunta de orcamento ou pedido",
);

const alreadyCompleteReply = buildDeterministicCatalogMultiCodeReply({
  productsData,
  currentMessage: "quero os codigos 31 32 33 34",
  conversationHistory: [],
  assistantResponse:
    "Item 1\nCodigo: 31\nItem 2\nCodigo: 32\nItem 3\nCodigo: 33\nItem 4\nCodigo: 34",
});

assert.equal(
  alreadyCompleteReply,
  null,
  "nao deve sobrescrever quando a resposta ja lista todos os codigos sem sinal de envio de fotos",
);

console.log("aiAgent.catalogMultiCodeReply.test.ts ok");
process.exit(0);
