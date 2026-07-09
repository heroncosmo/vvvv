import assert from "node:assert/strict";

import { MAURICIO_MFC_USER_ID } from "../mauricioMfcCatalogModule";

process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

const mfcProductsData = {
  active: true,
  userId: MAURICIO_MFC_USER_ID,
  instructions: null,
  displayInstructions: null,
  imageVariationsEnabled: true,
  count: 1,
  products: [
    {
      id: "prod-lilo",
      name: "LILO STITCH CHITO CATALOGO DE FOTOS",
      price: "0",
      stock: 20,
      controlStock: false,
      description: null,
      sendDescriptionWithImages: false,
      category: "catalogo",
      link: null,
      sku: null,
      unit: "unidade",
      imageVariationsEnabled: true,
      images: [
        {
          id: "img-lateral-23",
          product_id: "prod-lilo",
          storage_url: "https://cdn.example.com/lilo-lateral-23.jpg",
          storage_path: null,
          file_name: "lilo-lateral-23.jpg",
          file_size: null,
          mime_type: "image/jpeg",
          caption: null,
          variation_code: 23,
          variation_name: "PAINEL LATERAL LILO STITCH",
          variation_price: "70.00",
          variation_stock: null,
          variation_is_active: true,
          display_order: 0,
        },
        {
          id: "img-redondo-15",
          product_id: "prod-lilo",
          storage_url: "https://cdn.example.com/lilo-redondo-15.jpg",
          storage_path: null,
          file_name: "lilo-redondo-15.jpg",
          file_size: null,
          mime_type: "image/jpeg",
          caption: null,
          variation_code: 15,
          variation_name: "PAINEL REDONDO LILO STITCH",
          variation_price: "60.00",
          variation_stock: null,
          variation_is_active: true,
          display_order: 1,
        },
      ],
    },
  ],
} as any;

async function run() {
  const {
    buildMauricioMfcCatalogMediaRecoveryActions,
  } = await import("../aiAgent");

  const recovered = await buildMauricioMfcCatalogMediaRecoveryActions({
    userId: MAURICIO_MFC_USER_ID,
    clientMessage: "4",
    assistantResponse:
      "Pronto, Mauricio! Aqui estao as fotos dos paineis do tema Lilo/Stitch: Codigo 23, Codigo 15.",
    conversationHistory: [
      { text: "boa tarde tem painel lilo", mediaCaption: null, fromMe: false } as any,
      {
        text: "Bom dia! Pronto, enviei as fotos dos paineis do tema Lilo/Stitch.",
        mediaCaption: null,
        fromMe: true,
      } as any,
      { text: "cade as fotos", mediaCaption: null, fromMe: false } as any,
    ],
    productsData: mfcProductsData,
    sentMedias: [],
    existingMediaActions: [],
  });

  assert.equal(recovered.length, 2, "MFC deve recuperar imagens quando texto promete fotos sem acao real");
  assert.deepEqual(
    recovered.map((action: any) => action.type),
    ["send_media_url", "send_media_url"],
  );

  const girassolAfterAgentAcknowledgedTheme = await buildMauricioMfcCatalogMediaRecoveryActions({
    userId: MAURICIO_MFC_USER_ID,
    clientMessage: "Manda as fotos",
    assistantResponse:
      "Pronto, enviei as fotos das artes do tema Girassol. Escolha o numero da foto que mais gostou.",
    conversationHistory: [
      { text: "Boa tarde", mediaCaption: null, fromMe: false } as any,
      { text: "Tem painel girassol", mediaCaption: null, fromMe: false } as any,
      {
        text: "Temos sim painel girassol. Posso te mandar as fotos.",
        mediaCaption: null,
        fromMe: true,
      } as any,
    ],
    productsData: {
      ...mfcProductsData,
      products: [
        {
          ...mfcProductsData.products[0],
          id: "prod-girassol",
          name: "GIRASSOL CATALOGO DE FOTOS",
          images: [
            {
              ...mfcProductsData.products[0].images[0],
              id: "img-girassol-1",
              product_id: "prod-girassol",
              storage_url: "https://cdn.example.com/girassol-1.jpg",
              variation_name: "GIRASSOL SIMPLES",
            },
          ],
        },
      ],
    },
    sentMedias: [],
    existingMediaActions: [],
  });

  assert.equal(
    girassolAfterAgentAcknowledgedTheme.length,
    1,
    "MFC deve recuperar fotos quando cliente pede fotos apos agente reconhecer o tema",
  );

  const resendWhenCustomerSaysItDidNotArrive = await buildMauricioMfcCatalogMediaRecoveryActions({
    userId: MAURICIO_MFC_USER_ID,
    clientMessage: "Nao foi nao, cade as fotos?",
    assistantResponse: "Vou te reenviar as fotos do tema Lilo/Stitch agora.",
    conversationHistory: [
      { text: "Tem painel lilo", mediaCaption: null, fromMe: false } as any,
      {
        text: "Pronto, enviei as fotos do tema Lilo/Stitch.",
        mediaCaption: null,
        fromMe: true,
      } as any,
    ],
    productsData: mfcProductsData,
    sentMedias: ["CATALOG_PRODUCT_IMAGE:prod-lilo:img-lateral-23"],
    existingMediaActions: [],
  });

  assert.equal(
    resendWhenCustomerSaysItDidNotArrive.length,
    2,
    "MFC deve reenviar fotos quando cliente diz que nao recebeu, mesmo se ja havia midia marcada como enviada",
  );

  const otherTenant = await buildMauricioMfcCatalogMediaRecoveryActions({
    userId: "tenant-normal",
    clientMessage: "me manda fotos do lilo",
    assistantResponse: "Aqui estao as fotos do tema Lilo.",
    conversationHistory: [],
    productsData: { ...mfcProductsData, userId: "tenant-normal" },
    sentMedias: [],
    existingMediaActions: [],
  });

  assert.equal(otherTenant.length, 0, "outro tenant nao deve herdar recuperacao MFC");

  const alreadyHasCatalogAction = await buildMauricioMfcCatalogMediaRecoveryActions({
    userId: MAURICIO_MFC_USER_ID,
    clientMessage: "me manda fotos do lilo",
    assistantResponse: "Aqui estao as fotos do tema Lilo.",
    conversationHistory: [],
    productsData: mfcProductsData,
    sentMedias: [],
    existingMediaActions: [
      {
        type: "send_media_url",
        media_name: "CATALOG_PRODUCT_IMAGE:prod-lilo:img-lateral-23",
        media_url: "https://cdn.example.com/lilo-lateral-23.jpg",
        media_type: "image",
      } as any,
    ],
  });

  assert.equal(alreadyHasCatalogAction.length, 0, "nao deve duplicar imagens ja planejadas");

  const transactional = await buildMauricioMfcCatalogMediaRecoveryActions({
    userId: MAURICIO_MFC_USER_ID,
    clientMessage: "quero codigo 23 costurado quantidade 1",
    assistantResponse: "Carrinho do pedido: Item 1 Codigo 23. Total geral R$ 70,00.",
    conversationHistory: [],
    productsData: mfcProductsData,
    sentMedias: [],
    existingMediaActions: [],
  });

  assert.equal(transactional.length, 0, "pedido transacional nao deve reenviar fotos por recuperacao");

  console.log("mauricioMfcCatalogMediaRecovery.test.ts ok");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
