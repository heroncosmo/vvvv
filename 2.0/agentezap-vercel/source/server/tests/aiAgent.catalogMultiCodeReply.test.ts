import assert from "node:assert/strict";

import {
  buildDeterministicCatalogMultiCodeReply,
  buildDeterministicCatalogSelectionReply,
} from "../aiAgent";
import { MAURICIO_MFC_USER_ID } from "../mauricioMfcCatalogModule";

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
    deterministicReply!.includes(`Código: ${code}`),
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
  /orçamento/i.test(deterministicReply!) && /pedido/i.test(deterministicReply!),
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

const singleImageSelectionReply = buildDeterministicCatalogSelectionReply({
  productsData,
  currentMessage:
    "[IMAGEM ANALISADA: cliente reenviou a foto]\n[CATALOGO_IDENTIFICADO: codigos selecionados 40 | item 1 | produto HULK CATALOGO DE FOTOS | codigo 40 | nome CILINDROS DO HULK | preco 100.00]\nquero esse",
  conversationHistory: [],
  assistantResponse: "Perfeito, vou organizar seu pedido para pagamento.",
});

assert.ok(singleImageSelectionReply, "deve responder de forma deterministica para imagem unica reconhecida");
assert.equal(singleImageSelectionReply!.includes("Código: 40"), true);
assert.equal(/pix|pagamento/i.test(singleImageSelectionReply!), false, "nao deve pular direto para pagamento quando faltam dados");
assert.equal(/Falta: acabamento, quantidade/i.test(singleImageSelectionReply!), true);

const detailContinuationReply = buildDeterministicCatalogSelectionReply({
  productsData,
  currentMessage: "vai ser sem costura, tamanho 50x50, quantidade 1 de cada",
  conversationHistory: [
    { text: "Quero o codigo 33 e o codigo 40", mediaCaption: null, fromMe: false } as any,
  ],
  assistantResponse: "Agora vamos para pagamento: Pix, link, dinheiro ou cartao.",
});

assert.ok(detailContinuationReply, "deve resumir carrinho quando o cliente envia os detalhes depois");
assert.equal(detailContinuationReply!.includes("Código: 33"), true);
assert.equal(detailContinuationReply!.includes("Código: 40"), true);
assert.equal(detailContinuationReply!.includes("Subtotal: R$ 60,00"), true);
assert.equal(detailContinuationReply!.includes("Subtotal: R$ 100,00"), true);
assert.equal(/Total dos itens: R\$ 160,00/i.test(detailContinuationReply!), true);

const artCatalogReply = buildDeterministicCatalogSelectionReply({
  productsData,
  currentMessage:
    "[CATALOGO_IDENTIFICADO: codigos selecionados 31 | item 1 | produto HULK CATALOGO DE FOTOS | codigo 31 | nome CATALOGO DE FOTOS DE ARTES]",
  conversationHistory: [],
  assistantResponse: "Perfeito, vou colocar esse item no carrinho.",
});

assert.ok(artCatalogReply, "deve tratar catalogo de artes como handoff, nao como item fisico");
assert.equal(/marque com um X/i.test(artCatalogReply!), true);
assert.equal(/Item 1/i.test(artCatalogReply!), false);
assert.equal(/pagamento|pix/i.test(artCatalogReply!), false);

const mauricioProductsData: any = {
  active: true,
  userId: MAURICIO_MFC_USER_ID,
  instructions: null,
  displayInstructions: null,
  imageVariationsEnabled: true,
  count: 1,
  products: [
    {
      id: "prod-lilo",
      name: "LILO STHIC CATÁLOGO DE FOTOS",
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
        { id: "3", product_id: "prod-lilo", storage_url: "https://img/3", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 3, variation_name: "PAINEL LATERAL DO LILO STHIC", variation_price: "70.00", variation_stock: null, variation_is_active: true, display_order: 0 },
        { id: "14", product_id: "prod-lilo", storage_url: "https://img/14", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 14, variation_name: "CATALOGO DE FOTOS DE ARTES", variation_price: null, variation_stock: null, variation_is_active: true, display_order: 0 },
        { id: "15", product_id: "prod-lilo", storage_url: "https://img/15", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 15, variation_name: "PAINEL REDONDO LILO STHIC", variation_price: "60.00", variation_stock: null, variation_is_active: true, display_order: 0 },
        { id: "20", product_id: "prod-lilo", storage_url: "https://img/20", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 20, variation_name: "CILINDROS DO LILO STHIC", variation_price: "100.00", variation_stock: null, variation_is_active: true, display_order: 1 },
        { id: "27", product_id: "prod-lilo", storage_url: "https://img/27", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 27, variation_name: "PAINEL LATERAL DO LILO STHIC", variation_price: "70.00", variation_stock: null, variation_is_active: true, display_order: 2 },
        { id: "28", product_id: "prod-lilo", storage_url: "https://img/28", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 28, variation_name: "PAINEL LATERAL DO LILO STHIC", variation_price: "70.00", variation_stock: null, variation_is_active: true, display_order: 2 },
        { id: "29", product_id: "prod-lilo", storage_url: "https://img/29", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 29, variation_name: "PAINEL LATERAL DO LILO STHIC", variation_price: "70.00", variation_stock: null, variation_is_active: true, display_order: 3 },
      ],
    },
    {
      id: "prod-hulk-mfc",
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
        { id: "40", product_id: "prod-hulk-mfc", storage_url: "https://img/40", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 40, variation_name: "CILINDROS HULK", variation_price: "100.00", variation_stock: null, variation_is_active: true, display_order: 1 },
        { id: "41", product_id: "prod-hulk-mfc", storage_url: "https://img/41", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 41, variation_name: "PAINEL LATERAL HULK", variation_price: "70.00", variation_stock: null, variation_is_active: true, display_order: 2 },
      ],
    },
  ],
};

const mauricioArtCatalogContinuationReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioProductsData,
  currentMessage: "Gostei do catálogo de fotos de artes, quero usar essa arte",
  conversationHistory: [
    {
      text: "Código 14\nCATALOGO DE FOTOS DE ARTES\nUse o código da foto ou envie a arte escolhida para dar sequência.",
      mediaCaption: null,
      fromMe: true,
    } as any,
  ],
  assistantResponse: "Perfeito, me diga tamanho, acabamento e quantidade.",
});

assert.ok(mauricioArtCatalogContinuationReply, "Mauricio/MFC deve tratar continuacao de catalogo de artes como handoff");
assert.match(mauricioArtCatalogContinuationReply!, /Marque com um X/i);
assert.doesNotMatch(mauricioArtCatalogContinuationReply!, /acabamento|quantidade|tamanho/i);

const mauricioSemCosturaReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioProductsData,
  currentMessage: "vai ser sem costura, quantidade 1 de cada",
  conversationHistory: [
    { text: "Quero o código 20 e o código 28", mediaCaption: null, fromMe: false } as any,
  ],
  assistantResponse: "Perfeito, agora vamos para pagamento.",
});

assert.ok(mauricioSemCosturaReply, "Mauricio/MFC deve recalcular preço sem costura pelo módulo dedicado");
assert.equal(mauricioSemCosturaReply!.includes("Valor: R$ 80,00"), true);
assert.equal(mauricioSemCosturaReply!.includes("Valor: R$ 65,00"), true);
assert.equal(mauricioSemCosturaReply!.includes("Valor: R$ 100,00"), false);
assert.equal(mauricioSemCosturaReply!.includes("Valor: R$ 70,00"), false);
assert.equal(/Total dos itens: R\$ 145,00/i.test(mauricioSemCosturaReply!), true);

const mauricioQuantityIsNotExtraCodeReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioProductsData,
  currentMessage: "quero o codigo 15 painel 50x50 costurado quantidade 3",
  conversationHistory: [],
  assistantResponse: "Perfeito, reconheci os itens escolhidos.",
});

assert.ok(mauricioQuantityIsNotExtraCodeReply, "Mauricio/MFC deve tratar quantidade como quantidade, nao como codigo extra");
assert.match(mauricioQuantityIsNotExtraCodeReply!, /C.digo: 15/);
assert.doesNotMatch(mauricioQuantityIsNotExtraCodeReply!, /C.digo: 3/);
assert.match(mauricioQuantityIsNotExtraCodeReply!, /Quantidade: 3/);
assert.match(mauricioQuantityIsNotExtraCodeReply!, /Subtotal: R\$ 180,00/i);

const mauricioMultiItemScopedDetailsReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioProductsData,
  currentMessage: "quero codigo 40 hulk costurado 1 e codigo 41 hulk sem costura 2",
  conversationHistory: [],
  assistantResponse: "Perfeito, reconheci os itens escolhidos.",
});

assert.ok(mauricioMultiItemScopedDetailsReply, "Mauricio/MFC deve aplicar acabamento e quantidade por codigo");
assert.match(mauricioMultiItemScopedDetailsReply!, /C.digo: 40/);
assert.match(mauricioMultiItemScopedDetailsReply!, /C.digo: 41/);
assert.match(mauricioMultiItemScopedDetailsReply!, /Produto: CILINDROS HULK[\s\S]*Acabamento: Costurado[\s\S]*Quantidade: 1[\s\S]*Subtotal: R\$ 100,00/i);
assert.match(mauricioMultiItemScopedDetailsReply!, /Produto: PAINEL LATERAL HULK[\s\S]*Acabamento: Sem costura[\s\S]*Quantidade: 2[\s\S]*Subtotal: R\$ 130,00/i);
assert.match(mauricioMultiItemScopedDetailsReply!, /Total dos itens: R\$ 230,00/i);

const mauricioAppendCartReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioProductsData,
  currentMessage:
    "[CATALOGO_IDENTIFICADO: codigos selecionados 20, 27 | item 1 | produto LILO STHIC CATALOGO DE FOTOS | codigo 20 | nome CILINDROS DO LILO STHIC | preco 100.00 ; item 2 | produto LILO STHIC CATALOGO DE FOTOS | codigo 27 | nome PAINEL LATERAL DO LILO STHIC | preco 70.00]\nquero esses sem costura, quantidade 1 de cada",
  conversationHistory: [
    {
      fromMe: true,
      mediaCaption: null,
      text: [
        "Perfeito, reconheci 3 itens escolhidos no catalogo:",
        "",
        "Item 1",
        "Produto: Painel Lateral do Lilo STHIC",
        "Codigo: 29",
        "Acabamento: Sem costura",
        "Quantidade: 1",
        "Valor: R$ 65,00",
        "Subtotal: R$ 65,00",
        "",
        "Item 2",
        "Produto: Cilindros do Lilo STHIC",
        "Codigo: 22",
        "Acabamento: Sem costura",
        "Quantidade: 1",
        "Valor: R$ 80,00",
        "Subtotal: R$ 80,00",
        "",
        "Item 3",
        "Produto: Cilindros do Lilo STHIC",
        "Codigo: 21",
        "Acabamento: Sem costura",
        "Quantidade: 1",
        "Valor: R$ 80,00",
        "Subtotal: R$ 80,00",
        "",
        "Total dos itens: R$ 225,00",
      ].join("\n"),
    } as any,
  ],
  assistantResponse: "Perfeito, vou colocar esses itens no carrinho.",
});

assert.ok(mauricioAppendCartReply, "Mauricio/MFC deve manter carrinho anterior ao adicionar novos itens");
for (const code of [29, 22, 21, 20, 27]) {
  assert.match(mauricioAppendCartReply!, new RegExp(`C.digo: ${code}`));
}
assert.match(mauricioAppendCartReply!, /Item 5/);
assert.match(mauricioAppendCartReply!, /Total dos itens: R\$ 370,00/i);
assert.doesNotMatch(mauricioAppendCartReply!, /Marque com um X/i);
assert.doesNotMatch(mauricioAppendCartReply!, /designer/i);

const mauricioMixedProductAndArtReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioProductsData,
  currentMessage:
    "[CATALOGO_IDENTIFICADO: codigos selecionados 14, 27, 28, 29 | item 1 | produto LILO STHIC CATALOGO DE FOTOS | codigo 14 | nome CATALOGO DE FOTOS DE ARTES ; item 2 | produto LILO STHIC CATALOGO DE FOTOS | codigo 27 | nome PAINEL LATERAL DO LILO STHIC | preco 70.00 ; item 3 | produto LILO STHIC CATALOGO DE FOTOS | codigo 28 | nome PAINEL LATERAL DO LILO STHIC | preco 70.00 ; item 4 | produto LILO STHIC CATALOGO DE FOTOS | codigo 29 | nome PAINEL LATERAL DO LILO STHIC | preco 70.00]\nsem costura",
  conversationHistory: [],
  assistantResponse: "Marque com um X na arte escolhida.",
});

assert.ok(mauricioMixedProductAndArtReply, "Mauricio/MFC deve tratar produto reconhecido como carrinho, nao como arte");
assert.match(mauricioMixedProductAndArtReply!, /C.digo: 27/);
assert.match(mauricioMixedProductAndArtReply!, /Valor: R\$ 65,00/);
assert.doesNotMatch(mauricioMixedProductAndArtReply!, /Marque com um X/i);
assert.doesNotMatch(mauricioMixedProductAndArtReply!, /designer/i);

const mauricioMarkedImageProductsData: any = {
  active: true,
  userId: MAURICIO_MFC_USER_ID,
  instructions: null,
  displayInstructions: null,
  imageVariationsEnabled: true,
  count: 3,
  products: [
    {
      id: "prod-palavrinhas",
      name: "TRES PALAVRINHAS CATALOGO FOTOS",
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
        { id: "1", product_id: "prod-palavrinhas", storage_url: "https://img/1", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 1, variation_name: "CATALOGO DE FOTOS DE ARTES", variation_price: null, variation_stock: null, variation_is_active: true, display_order: 1 },
        { id: "3", product_id: "prod-palavrinhas", storage_url: "https://img/3", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 3, variation_name: "PAINEL LATERAL", variation_price: "70.00", variation_stock: null, variation_is_active: true, display_order: 2 },
        { id: "4", product_id: "prod-palavrinhas", storage_url: "https://img/4", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 4, variation_name: "PAINEL REDONDO - INFORMAR TAMANHO", variation_price: "60.00", variation_stock: null, variation_is_active: true, display_order: 3 },
      ],
    },
    {
      id: "prod-lilo-old-context",
      name: "LILO STHIC CATALOGO DE FOTOS",
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
        { id: "20", product_id: "prod-lilo-old-context", storage_url: "https://img/20", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 20, variation_name: "CILINDROS DO LILO STHIC", variation_price: "100.00", variation_stock: null, variation_is_active: true, display_order: 1 },
      ],
    },
    {
      id: "prod-hulk-old-context",
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
        { id: "33", product_id: "prod-hulk-old-context", storage_url: "https://img/33", storage_path: null, file_name: null, file_size: null, mime_type: null, caption: null, variation_code: 33, variation_name: "PAINEL REDONDO HULK", variation_price: "60.00", variation_stock: null, variation_is_active: true, display_order: 1 },
      ],
    },
  ],
};

const mauricioMarkedImageText = [
  "[IMAGEM ANALISADA: lista de arquivos relacionados a capas e paineis com temas de palavrinhas. Codigo: 1. Codigo: 4. Produto 20 - TRES PALAVRINHAS - CATALOGO FOTOS. Produto 33 - GALAXIA - CATALOGO FOTOS.]",
  "[CATALOGO_IDENTIFICADO: codigos selecionados 1, 3 | item 1 | produto 20 - TRES PALAVRINHAS - CATALOGO FOTOS | codigo 1 | nome CATALOGO DE FOTOS DE ARTES ; item 2 | produto 33 - GALAXIA - CATALOGO FOTOS | codigo 3 | nome PAINEL LATERAL | preco 70 | estoque 0]",
].join("\n");

const mauricioMarkedImageSelectionReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioMarkedImageProductsData,
  currentMessage: `${mauricioMarkedImageText}\nQuero essa ultima foto\nDessa arte`,
  conversationHistory: [],
  assistantResponse: "Perfeito, reconheci 4 itens escolhidos no catalogo.",
});

assert.ok(mauricioMarkedImageSelectionReply, "Mauricio/MFC deve usar apenas codigos selecionados na imagem marcada");
assert.match(mauricioMarkedImageSelectionReply!, /C.digo: 3/);
assert.doesNotMatch(mauricioMarkedImageSelectionReply!, /C.digo: 4/);
assert.doesNotMatch(mauricioMarkedImageSelectionReply!, /C.digo: 20/);
assert.doesNotMatch(mauricioMarkedImageSelectionReply!, /C.digo: 33/);
assert.doesNotMatch(mauricioMarkedImageSelectionReply!, /Marque com um X/i);

const mauricioMarkedImageContinuationReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioMarkedImageProductsData,
  currentMessage: "Dessa arte",
  conversationHistory: [
    { text: mauricioMarkedImageText, mediaCaption: null, fromMe: false } as any,
    { text: "Quero essa ultima foto", mediaCaption: null, fromMe: false } as any,
  ],
  assistantResponse: "Perfeito, reconheci 4 itens escolhidos no catalogo.",
});

assert.ok(mauricioMarkedImageContinuationReply, "Mauricio/MFC deve continuar a imagem marcada sem carregar codigo antigo");
assert.match(mauricioMarkedImageContinuationReply!, /C.digo: 3/);
assert.doesNotMatch(mauricioMarkedImageContinuationReply!, /C.digo: 4/);
assert.doesNotMatch(mauricioMarkedImageContinuationReply!, /C.digo: 20/);
assert.doesNotMatch(mauricioMarkedImageContinuationReply!, /C.digo: 33/);

const mauricioOneEachAfterImagesReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioProductsData,
  currentMessage: "quero 1 de cada",
  conversationHistory: [
    { text: "[CATALOGO_IDENTIFICADO: codigos selecionados 14 | item 1 | produto LILO STHIC CATALOGO DE FOTOS | codigo 14 | nome CATALOGO DE FOTOS DE ARTES]", mediaCaption: null, fromMe: false } as any,
    { text: "[CATALOGO_IDENTIFICADO: codigos selecionados 29 | item 1 | produto LILO STHIC CATALOGO DE FOTOS | codigo 29 | nome PAINEL LATERAL DO LILO STHIC | preco 70.00]", mediaCaption: null, fromMe: false } as any,
    { text: "[CATALOGO_IDENTIFICADO: codigos selecionados 28 | item 1 | produto LILO STHIC CATALOGO DE FOTOS | codigo 28 | nome PAINEL LATERAL DO LILO STHIC | preco 70.00]", mediaCaption: null, fromMe: false } as any,
    { text: "[CATALOGO_IDENTIFICADO: codigos selecionados 27 | item 1 | produto LILO STHIC CATALOGO DE FOTOS | codigo 27 | nome PAINEL LATERAL DO LILO STHIC | preco 70.00]", mediaCaption: null, fromMe: false } as any,
    { text: "sem costura", mediaCaption: null, fromMe: false } as any,
  ],
  assistantResponse: "Perfeito, vou encaminhar a arte.",
});

assert.ok(mauricioOneEachAfterImagesReply, "Mauricio/MFC deve fechar quantidade depois das imagens reconhecidas");
assert.match(mauricioOneEachAfterImagesReply!, /C.digo: 29/);
assert.match(mauricioOneEachAfterImagesReply!, /Quantidade: 1/);
assert.match(mauricioOneEachAfterImagesReply!, /Total dos itens: R\$ 195,00/i);
assert.doesNotMatch(mauricioOneEachAfterImagesReply!, /Marque com um X/i);
assert.doesNotMatch(mauricioOneEachAfterImagesReply!, /designer/i);

const mauricioMissingFinishReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioProductsData,
  currentMessage:
    "[CATALOGO_IDENTIFICADO: codigos selecionados 27 | item 1 | produto LILO STHIC CATALOGO DE FOTOS | codigo 27 | nome PAINEL LATERAL DO LILO STHIC | preco 70.00]\nquero codigo 27 quantidade 1",
  conversationHistory: [],
  assistantResponse: "Perfeito, vou organizar o pedido.",
});

assert.ok(mauricioMissingFinishReply, "Mauricio/MFC deve pedir acabamento antes de calcular lateral");
assert.match(mauricioMissingFinishReply!, /Falta: acabamento/i);
assert.match(mauricioMissingFinishReply!, /Valores: costurado R\$ 70,00; sem costura R\$ 65,00/i);
assert.doesNotMatch(mauricioMissingFinishReply!, /Valor: R\$ 70,00/i);
assert.doesNotMatch(mauricioMissingFinishReply!, /Subtotal:/i);

const mauricioMissingSizeReply = buildDeterministicCatalogSelectionReply({
  productsData: mauricioProductsData,
  currentMessage:
    "[CATALOGO_IDENTIFICADO: codigos selecionados 15 | item 1 | produto LILO STHIC CATALOGO DE FOTOS | codigo 15 | nome PAINEL REDONDO LILO STHIC | preco 60.00]\nquero codigo 15 costurado quantidade 3",
  conversationHistory: [],
  assistantResponse: "Perfeito, vou organizar o pedido.",
});

assert.ok(mauricioMissingSizeReply, "Mauricio/MFC deve pedir tamanho antes de calcular painel redondo");
assert.match(mauricioMissingSizeReply!, /Falta: tamanho/i);
assert.match(mauricioMissingSizeReply!, /Valores: painel redondo por foto\/codigo R\$ 60,00/i);
assert.doesNotMatch(mauricioMissingSizeReply!, /Valor: R\$ 12,00/i);
assert.doesNotMatch(mauricioMissingSizeReply!, /Subtotal:/i);

console.log("aiAgent.catalogMultiCodeReply.test.ts ok");
process.exit(0);
