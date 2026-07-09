import assert from "node:assert/strict";

import {
  buildCatalogMediaRequestContext,
  buildCatalogProductImageMediaName,
  harmonizeCatalogProductResponseForSentImages,
  isExplicitCatalogMediaResendRequest,
  selectCatalogProductImage,
  shouldAttachCatalogMediaForReply,
  shouldForceCatalogMediaForKnownSubject,
} from "../productCatalogMediaService";
import { MAURICIO_MFC_USER_ID } from "../mauricioMfcCatalogModule";

async function run() {
  const selected = await selectCatalogProductImage(
    {
      clientMessage: "Qual o preco do tenis azul? Me manda a foto dele tambem.",
      assistantResponse: "O tenis azul custa R$ 199,90. Vou te enviar a foto agora.",
      conversationHistory: [
        { fromMe: false, text: "Oi" },
        { fromMe: true, text: "Oi, como posso ajudar?" },
      ],
      products: [
        {
          id: "prod-azul",
          name: "Tenis Azul Runner",
          price: "199.90",
          images: [
            { id: "img-1", storageUrl: "https://cdn.exemplo.com/tenis-azul-1.jpg", displayOrder: 0 },
            { id: "img-2", storageUrl: "https://cdn.exemplo.com/tenis-azul-2.jpg", displayOrder: 1 },
          ],
        },
        {
          id: "prod-verde",
          name: "Tenis Verde Trail",
          price: "219.90",
          images: [
            { id: "img-3", storageUrl: "https://cdn.exemplo.com/tenis-verde.jpg", displayOrder: 0 },
          ],
        },
      ],
    },
    {
      completeChat: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "SEND",
                productId: "prod-azul",
                confidence: 92,
                reason: "cliente pediu a foto de um produto especifico",
              }),
            },
          },
        ],
      }),
    },
  );

  assert.equal(selected.shouldSend, true);
  assert.equal(selected.productId, "prod-azul");
  assert.deepEqual(selected.productIds, ["prod-azul"]);
  assert.equal(buildCatalogProductImageMediaName("prod-azul", "img-1"), "CATALOG_PRODUCT_IMAGE:prod-azul:img-1");

  const notSelected = await selectCatalogProductImage(
    {
      clientMessage: "Me mostra o catalogo completo.",
      assistantResponse: "Posso listar os produtos para voce.",
      conversationHistory: [],
      products: [
        {
          id: "prod-1",
          name: "Camisa Dry Fit",
          price: "89.90",
          images: [
            { id: "img-10", storageUrl: "https://cdn.exemplo.com/camisa.jpg", displayOrder: 0 },
          ],
        },
      ],
    },
    {
      completeChat: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "NO_IMAGE",
                productId: null,
                confidence: 18,
                reason: "pedido generico",
              }),
            },
          },
        ],
      }),
    },
  );

  assert.equal(notSelected.shouldSend, false);
  assert.equal(notSelected.productId, null);
  assert.deepEqual(notSelected.productIds, []);

  const withoutImages = await selectCatalogProductImage({
    clientMessage: "me manda a foto",
    assistantResponse: "Vou verificar.",
    conversationHistory: [],
    products: [{ id: "sem-foto", name: "Produto sem foto", images: [] }],
  });

  assert.equal(withoutImages.shouldSend, false);
  assert.equal(withoutImages.productId, null);
  assert.deepEqual(withoutImages.productIds, []);

  const pixFollowUp = await selectCatalogProductImage(
    {
      clientMessage: "Me manda o pix",
      assistantResponse: "Segue a chave Pix da loja.",
      conversationHistory: [
        { fromMe: false, text: "Tem painel Hulk?" },
        { fromMe: true, text: "Temos sim. Vou te mostrar as fotos." },
      ],
      products: [
        {
          id: "prod-hulk",
          name: "HULK CATALOGO DE FOTOS",
          images: [{ id: "img-hulk-1", storageUrl: "https://cdn.exemplo.com/hulk.jpg", displayOrder: 0 }],
        },
      ],
    },
    {
      completeChat: async () => {
        throw new Error("nao deveria consultar o classificador para follow-up operacional");
      },
    },
  );

  assert.equal(pixFollowUp.shouldSend, false);
  assert.equal(pixFollowUp.productId, null);
  assert.deepEqual(pixFollowUp.productIds, []);

  const unknownThemeSwitch = await selectCatalogProductImage(
    {
      clientMessage: "Tem outro tema do homem aranha?",
      assistantResponse: "Vou verificar para voce.",
      conversationHistory: [
        { fromMe: false, text: "Tem painel Hulk?" },
        { fromMe: true, text: "Temos sim. Vou te mostrar as fotos." },
      ],
      products: [
        {
          id: "prod-hulk",
          name: "HULK CATALOGO DE FOTOS",
          images: [{ id: "img-hulk-1", storageUrl: "https://cdn.exemplo.com/hulk.jpg", displayOrder: 0 }],
        },
      ],
    },
    {
      completeChat: async () => {
        throw new Error("nao deveria consultar o classificador para tema sem ancoragem no catalogo");
      },
    },
  );

  assert.equal(unknownThemeSwitch.shouldSend, false);
  assert.equal(unknownThemeSwitch.productId, null);
  assert.deepEqual(unknownThemeSwitch.productIds, []);

  const multiThemeSelection = await selectCatalogProductImage(
    {
      clientMessage: "Bom dia. Tem painel Hulk e tres palavrinhas? Quero costurado.",
      assistantResponse: "Bom dia! Temos sim esses dois temas e vou te mostrar as fotos em sequencia.",
      conversationHistory: [
        { fromMe: false, text: "Bom dia" },
        { fromMe: false, text: "Tem painel Hulk" },
        { fromMe: false, text: "E tres palavrinhas" },
        { fromMe: false, text: "Quero costurado" },
      ],
      products: [
        {
          id: "prod-hulk",
          name: "HULK CATALOGO DE FOTOS",
          images: [{ id: "img-hulk-1", storageUrl: "https://cdn.exemplo.com/hulk-1.jpg", displayOrder: 0 }],
        },
        {
          id: "prod-tres-palavrinhas",
          name: "TRES PALAVRINHAS CATALOGO DE FOTOS",
          images: [{ id: "img-tres-1", storageUrl: "https://cdn.exemplo.com/tres-1.jpg", displayOrder: 0 }],
        },
      ],
    },
    {
      completeChat: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "SEND",
                productIds: ["prod-hulk", "prod-tres-palavrinhas"],
                confidence: 94,
                reason: "cliente pediu dois temas especificos no mesmo turno",
              }),
            },
          },
        ],
      }),
    },
  );

  assert.equal(multiThemeSelection.shouldSend, true);
  assert.equal(multiThemeSelection.productId, "prod-hulk");
  assert.deepEqual(multiThemeSelection.productIds, ["prod-hulk", "prod-tres-palavrinhas"]);

  const explicitThemePhotoRequest = await selectCatalogProductImage(
    {
      clientMessage: "me manda as fotos do hulk",
      assistantResponse:
        "Temos sim as fotos do Hulk. Codigo 33 Painel redondo Hulk. Codigo 39 Cilindros do Hulk. Codigo 41 Painel lateral Hulk.",
      conversationHistory: [],
      products: [
        {
          id: "prod-hulk",
          name: "HULK CATALOGO DE FOTOS",
          images: [
            { id: "img-hulk-33", storageUrl: "https://cdn.exemplo.com/hulk-33.jpg", displayOrder: 0, variationCode: 33 },
            { id: "img-hulk-39", storageUrl: "https://cdn.exemplo.com/hulk-39.jpg", displayOrder: 1, variationCode: 39 },
            { id: "img-hulk-41", storageUrl: "https://cdn.exemplo.com/hulk-41.jpg", displayOrder: 2, variationCode: 41 },
          ],
        },
        {
          id: "prod-mario",
          name: "SUPER MARIO",
          images: [{ id: "img-mario-46", storageUrl: "https://cdn.exemplo.com/mario-46.jpg", displayOrder: 0, variationCode: 46 }],
        },
      ],
    },
    {
      completeChat: async () => {
        throw new Error("nao deveria consultar o classificador quando o tema do catalogo esta explicitamente ancorado");
      },
    },
  );

  assert.equal(explicitThemePhotoRequest.shouldSend, true);
  assert.equal(explicitThemePhotoRequest.productId, "prod-hulk");
  assert.deepEqual(explicitThemePhotoRequest.productIds, ["prod-hulk"]);

  const tenThemeSelection = await selectCatalogProductImage(
    {
      clientMessage: "me manda as fotos de alfa, bravo, charlie, delta, echo, foxtrot, golf, hotel, india e juliet",
      assistantResponse: "Vou te mostrar as fotos desses temas agora.",
      conversationHistory: [],
      products: Array.from({ length: 10 }, (_, index) => {
        const names = ["ALFA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET"];
        const name = names[index];
        return {
          id: `prod-${name.toLowerCase()}`,
          name: `${name} CATALOGO DE FOTOS`,
          images: [{ id: `img-${name.toLowerCase()}`, storageUrl: `https://cdn.exemplo.com/${name.toLowerCase()}.jpg`, displayOrder: 0 }],
        };
      }),
    },
    {
      completeChat: async () => {
        throw new Error("nao deveria consultar o classificador quando 10 temas foram explicitamente citados");
      },
    },
  );

  assert.equal(tenThemeSelection.shouldSend, true);
  assert.deepEqual(tenThemeSelection.productIds, [
    "prod-alfa",
    "prod-bravo",
    "prod-charlie",
    "prod-delta",
    "prod-echo",
    "prod-foxtrot",
    "prod-golf",
    "prod-hotel",
    "prod-india",
    "prod-juliet",
  ]);

  const rewritten = await harmonizeCatalogProductResponseForSentImages(
    {
      assistantResponse: "O produto custa R$ 199,90. Posso te enviar as fotos agora mesmo? Quer que eu mostre?",
      productLabel: "Tenis Azul Runner",
      imageCount: 2,
    },
    {
      completeChat: async () => ({
        choices: [
          {
            message: {
              content: "O Tenis Azul Runner custa R$ 199,90. Estou te enviando agora as 2 fotos dele logo abaixo.",
            },
          },
        ],
      }),
    },
  );

  assert.equal(
    rewritten,
    "O Tenis Azul Runner custa R$ 199,90. Estou te enviando agora as 2 fotos dele logo abaixo.",
  );

  const rewrittenWithGreetingPreserved = await harmonizeCatalogProductResponseForSentImages(
    {
      assistantResponse: "Boa noite, Mauricio\nTemos sim o tema Hulk!\nVou te enviar as fotos em sequencia.",
      productLabel: "HULK CATALOGO DE FOTOS",
      imageCount: 12,
    },
    {
      completeChat: async () => ({
        choices: [
          {
            message: {
              content: "Temos sim o tema Hulk! Seguem as fotos em sequencia:",
            },
          },
        ],
      }),
    },
  );

  assert.equal(
    rewrittenWithGreetingPreserved,
    "Boa noite, Mauricio\nTemos sim o tema Hulk! Seguem as fotos em sequencia:",
  );

  const contradictionRewritten = await harmonizeCatalogProductResponseForSentImages(
    {
      assistantResponse: "Esse tema ainda nao esta cadastrado aqui, mas ja vou te mandar as fotos.",
      productLabel: "Baby Shark",
      imageCount: 2,
    },
    {
      completeChat: async () => ({
        choices: [
          {
            message: {
              content: "Esse tema ainda nao esta cadastrado aqui, mas estou enviando as fotos agora.",
            },
          },
        ],
      }),
    },
  );

  assert.equal(
    contradictionRewritten,
    "Separei 2 foto(s) de Baby Shark e estou enviando agora logo abaixo para você ver.",
  );

  const multiProductRewrite = await harmonizeCatalogProductResponseForSentImages(
    {
      assistantResponse: "Temos sim os dois temas. Posso mandar as fotos depois se voce quiser.",
      productLabel: "Hulk e Tres Palavrinhas",
      imageCount: 6,
    },
    {
      completeChat: async () => ({
        choices: [
          {
            message: {
              content: "Temos sim Hulk e Tres Palavrinhas. Estou te enviando agora as fotos dos dois temas em sequencia.",
            },
          },
        ],
      }),
    },
  );

  assert.equal(
    multiProductRewrite,
    "Temos sim Hulk e Tres Palavrinhas. Estou te enviando agora as fotos dos dois temas em sequencia.",
  );

  assert.equal(isExplicitCatalogMediaResendRequest("manda de novo as fotos do hulk"), true);
  assert.equal(isExplicitCatalogMediaResendRequest("nao abriu, me mostra novamente"), true);
  assert.equal(isExplicitCatalogMediaResendRequest("qual o valor desse material?"), false);
  assert.equal(
    shouldAttachCatalogMediaForReply({
      clientMessage: "Tem painel hulk",
      assistantResponse:
        "Bom dia! Encontrei os produtos do tema HULK para você: PAINEL REDONDO HULK Código: 33 Valor: R$ 60,00",
    }),
    true,
  );
  assert.equal(
    shouldAttachCatalogMediaForReply({
      clientMessage: "quero fazer pedido do codigo 40 costurado quantidade 1",
      assistantResponse:
        "Perfeito! Vou organizar o seu pedido: Carrinho do pedido: Item 1 Produto: CILINDROS DO HULK Código: 40 Subtotal: R$ 100,00 Total geral: R$ 100,00",
    }),
    false,
  );
  assert.equal(
    shouldAttachCatalogMediaForReply({
      clientMessage: "quero ver de novo",
      assistantResponse: "Posso reenviar as fotos para você agora.",
      allowExplicitResend: true,
    }),
    true,
  );

  assert.equal(
    shouldAttachCatalogMediaForReply({
      clientMessage: "me manda as fotos do lilo sthic",
      assistantResponse:
        "Boa tarde! Aqui estão as fotos do tema LILO STHIC para você conferir: [FOTO 1] [FOTO 2] [FOTO 3]",
    }),
    true,
  );
  assert.equal(
    shouldAttachCatalogMediaForReply({
      clientMessage: "me manda as fotos do hulk",
      assistantResponse: "Seguem as fotos do tema Hulk para você conferir.",
    }),
    true,
  );
  assert.equal(
    shouldForceCatalogMediaForKnownSubject({
      clientMessage: "Oi tudo bem\nTem cilindros do Hulk e galaxia?",
      products: [
        {
          id: "prod-hulk",
          name: "HULK CATALOGO DE FOTOS",
          images: [{ id: "img-hulk", storageUrl: "https://cdn.exemplo.com/hulk.jpg" }],
        },
        {
          id: "prod-galaxia",
          name: "GALAXIA CATALOGO FOTOS",
          images: [{ id: "img-galaxia", storageUrl: "https://cdn.exemplo.com/galaxia.jpg" }],
        },
      ],
    }),
    true,
    "deve permitir anexar fotos quando a LLM so respondeu saudacao, mas o cliente citou temas reais",
  );
  assert.equal(
    shouldForceCatalogMediaForKnownSubject({
      clientMessage: "tyem painel lateral e girassol",
      products: [
        {
          id: "prod-girassol",
          name: "GIRASSOL CATALOGO DE FOTOS",
          images: [{ id: "img-girassol", storageUrl: "https://cdn.exemplo.com/girassol.jpg" }],
        },
      ],
    }),
    true,
    "deve anexar fotos quando o cliente cita painel e tema real mesmo com erro de digitacao em 'tem'",
  );
  assert.equal(
    shouldAttachCatalogMediaForReply({
      clientMessage: "Quero ir ver uma tenda no local. Onde fica?",
      assistantResponse:
        "Endereco: Rua Najib Raduan, numero 130, Distrito Industrial Adail Vitorazo, Sao Jose do Rio Preto/SP.",
    }),
    false,
    "nao deve anexar foto quando o cliente quer visita presencial ou endereco",
  );
  assert.equal(
    shouldForceCatalogMediaForKnownSubject({
      clientMessage: "Quero ir ver uma tenda no local. Onde fica?",
      products: [
        {
          id: "prod-tenda",
          name: "TENDA 10X10 COM FECHAMENTO",
          images: [{ id: "img-tenda", storageUrl: "https://cdn.exemplo.com/tenda.jpg" }],
        },
      ],
    }),
    false,
    "nao deve forcar foto por assunto conhecido quando a intencao e visita presencial",
  );
  assert.equal(
    shouldForceCatalogMediaForKnownSubject({
      clientMessage: "quero fazer pedido do codigo 40 costurado quantidade 1",
      products: [
        {
          id: "prod-hulk",
          name: "HULK CATALOGO DE FOTOS",
          images: [{ id: "img-hulk", storageUrl: "https://cdn.exemplo.com/hulk.jpg", variationCode: 40 }],
        },
      ],
    }),
    false,
    "nao deve reenviar fotos quando o cliente ja esta montando pedido por codigo",
  );

  const recentCatalogContext = buildCatalogMediaRequestContext({
    clientMessage: "e galaxia",
    conversationHistory: [
      { fromMe: false, text: "bo bom dia", timestamp: "2026-05-15T18:26:50.000Z" },
      { fromMe: false, text: "tudo bem", timestamp: "2026-05-15T18:26:54.000Z" },
      { fromMe: false, text: "tem painel lilo", timestamp: "2026-05-15T18:27:00.000Z" },
      { fromMe: false, text: "e galaxia", timestamp: "2026-05-15T18:27:05.000Z" },
    ],
  });
  assert.equal(
    recentCatalogContext,
    "bo bom dia\n\ntudo bem\n\ntem painel lilo\n\ne galaxia",
    "deve usar o bloco recente de mensagens do cliente para selecionar fotos",
  );

  const separatedTurnSelection = await selectCatalogProductImage(
    {
      clientMessage: recentCatalogContext,
      assistantResponse: "Tem sim. Vou te enviar as fotos desse tema agora.",
      conversationHistory: [],
      products: [
        {
          id: "prod-lilo",
          name: "LILO STHIC CATALOGO DE FOTOS",
          images: [{ id: "img-lilo", storageUrl: "https://cdn.exemplo.com/lilo.jpg", variationCode: 15 }],
        },
        {
          id: "prod-galaxia",
          name: "GALAXIA CATALOGO FOTOS",
          images: [{ id: "img-galaxia", storageUrl: "https://cdn.exemplo.com/galaxia.jpg", variationCode: 3 }],
        },
      ],
    },
    {
      completeChat: async () => {
        throw new Error("nao deveria chamar classificador para temas conhecidos no bloco recente");
      },
    },
  );
  assert.equal(separatedTurnSelection.shouldSend, true);
  assert.deepEqual(separatedTurnSelection.productIds, ["prod-lilo", "prod-galaxia"]);

  const visitLocationSelection = await selectCatalogProductImage(
    {
      clientMessage: "Quero ir ver uma tenda no local. Onde fica?",
      assistantResponse:
        "Endereco: Rua Najib Raduan, numero 130, Distrito Industrial Adail Vitorazo, Sao Jose do Rio Preto/SP.",
      conversationHistory: [],
      products: [
        {
          id: "prod-tenda",
          name: "TENDA 10X10 COM FECHAMENTO",
          images: [{ id: "img-tenda", storageUrl: "https://cdn.exemplo.com/tenda.jpg" }],
        },
      ],
    },
    {
      completeChat: async () => {
        throw new Error("nao deveria chamar classificador para visita presencial");
      },
    },
  );
  assert.equal(visitLocationSelection.shouldSend, false);
  assert.deepEqual(visitLocationSelection.productIds, []);

  const mauricioGenericPhotoContinuation = await selectCatalogProductImage(
    {
      userId: MAURICIO_MFC_USER_ID,
      clientMessage: "Quero fotos",
      assistantResponse:
        "Segue abaixo as fotos do catalogo do Hulk: codigo 40, codigo 41, codigo 46 e codigo 47.",
      conversationHistory: [
        { fromMe: false, text: "Quanto fica esses eu pedi" },
        { fromMe: false, text: "Manda foto do painéis hulk" },
        { fromMe: true, text: "Vou enviar agora." },
        { fromMe: false, text: "Quero fotos" },
      ],
      products: [
        {
          id: "prod-hulk",
          name: "HULK CATALOGO DE FOTOS",
          imageVariationsEnabled: true,
          images: [
            { id: "img-hulk-39", storageUrl: "https://cdn.exemplo.com/hulk-39.jpg", variationCode: 39, variationName: "CILINDROS DO HULK" },
            { id: "img-hulk-40", storageUrl: "https://cdn.exemplo.com/hulk-40.jpg", variationCode: 40, variationName: "CILINDROS DO HULK" },
            { id: "img-hulk-41", storageUrl: "https://cdn.exemplo.com/hulk-41.jpg", variationCode: 41, variationName: "PAINEL LATERAL HULK" },
          ],
        },
        {
          id: "prod-mario",
          name: "SUPER MARIO CATALOGO DE FOTOS",
          imageVariationsEnabled: true,
          images: [{ id: "img-mario-46", storageUrl: "https://cdn.exemplo.com/mario-46.jpg", variationCode: 46 }],
        },
        {
          id: "prod-sao-joao",
          name: "painel redondo sao Joao",
          imageVariationsEnabled: true,
          images: [{ id: "img-sao-joao-47", storageUrl: "https://cdn.exemplo.com/sao-joao-47.jpg", variationCode: 47 }],
        },
      ],
    },
    {
      completeChat: async () => {
        throw new Error("nao deve chamar classificador nem usar codigos inventados pela resposta");
      },
    },
  );
  assert.equal(mauricioGenericPhotoContinuation.shouldSend, true);
  assert.deepEqual(mauricioGenericPhotoContinuation.productIds, ["prod-hulk"]);

  let capturedExactCodeUserPrompt = "";
  let capturedExactCodeSystemPrompt = "";
  const hulkVariations = Array.from({ length: 9 }, (_, index) => {
    const code = 33 + index;
    return {
      id: `img-hulk-${code}`,
      storageUrl: `https://cdn.exemplo.com/hulk-${code}.jpg`,
      displayOrder: index,
      variationCode: code,
      variationName: code === 41 ? "PAINEL LATERAL HULK" : "CILINDROS DO HULK",
      variationPrice: code === 41 ? "70.00" : "100.00",
      variationIsActive: true,
    };
  });

  const exactCodeSelection = await selectCatalogProductImage(
    {
      clientMessage: "Quero o codigo 40 e o codigo 41",
      assistantResponse: "Vou separar os itens pelo codigo informado.",
      conversationHistory: [
        { fromMe: true, text: "Codigo 40\nNome CILINDROS DO HULK\nPreco R$ 100,00" },
        { fromMe: true, text: "Codigo 41\nNome PAINEL LATERAL HULK\nPreco R$ 70,00" },
      ],
      products: [
        {
          id: "prod-hulk",
          name: "HULK CATALOGO DE FOTOS",
          imageVariationsEnabled: true,
          images: hulkVariations,
        },
      ],
    },
    {
      completeChat: async ({ messages }) => {
        capturedExactCodeSystemPrompt = String(messages[0]?.content || "");
        capturedExactCodeUserPrompt = String(messages[1]?.content || "");
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: "SEND",
                  productId: "prod-hulk",
                  productIds: ["prod-hulk"],
                  confidence: 96,
                  reason: "cliente citou codigos exatos do produto",
                }),
              },
            },
          ],
        };
      },
    },
  );

  assert.equal(exactCodeSelection.shouldSend, true);
  assert.equal(capturedExactCodeUserPrompt.includes("COD=39"), true);
  assert.equal(capturedExactCodeUserPrompt.includes("COD=40"), true);
  assert.equal(capturedExactCodeUserPrompt.includes("COD=41"), true);
  assert.equal(capturedExactCodeUserPrompt.includes("NOME_VARIACAO=PAINEL LATERAL HULK"), true);
  assert.equal(capturedExactCodeSystemPrompt.includes("codigo vizinho"), true);

  console.log("productCatalogMediaService.test.ts ok");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
