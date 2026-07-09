import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

type CaseResult = {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
};

const fail = (message: string): never => {
  throw new Error(message);
};

const makeImage = (productId: string, id: string, name: string, code: number) => ({
  id,
  product_id: productId,
  storage_url: `https://cdn.example.com/${id}.jpg`,
  storage_path: null,
  file_name: `${id}.jpg`,
  file_size: null,
  mime_type: "image/jpeg",
  caption: null,
  variation_code: code,
  variation_name: name,
  variation_price: "60.00",
  variation_stock: null,
  variation_is_active: true,
  display_order: code,
});

async function main() {
  const { buildMauricioMfcCatalogMediaRecoveryActions } = await import("../server/aiAgent");
  const { MAURICIO_MFC_USER_ID } = await import("../server/mauricioMfcCatalogModule");

  const mfcProductsData: any = {
    active: true,
    userId: MAURICIO_MFC_USER_ID,
    instructions: null,
    displayInstructions: null,
    imageVariationsEnabled: true,
    count: 3,
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
        imageVariationsEnabled: true,
        images: [
          makeImage("prod-lilo", "img-lilo-lateral", "PAINEL LATERAL LILO STITCH", 23),
          makeImage("prod-lilo", "img-lilo-redondo", "PAINEL REDONDO LILO STITCH", 15),
        ],
      },
      {
        id: "prod-girassol",
        name: "GIRASSOL CATALOGO DE FOTOS",
        price: "0",
        stock: 20,
        controlStock: false,
        description: null,
        sendDescriptionWithImages: false,
        category: "catalogo",
        imageVariationsEnabled: true,
        images: [
          makeImage("prod-girassol", "img-girassol-1", "GIRASSOL SIMPLES", 31),
          makeImage("prod-girassol", "img-girassol-2", "GIRASSOL COLORIDO", 32),
        ],
      },
      {
        id: "prod-galaxia",
        name: "GALAXIA CATALOGO DE FOTOS",
        price: "0",
        stock: 20,
        controlStock: false,
        description: null,
        sendDescriptionWithImages: false,
        category: "catalogo",
        imageVariationsEnabled: true,
        images: [makeImage("prod-galaxia", "img-galaxia-1", "GALAXIA PAINEL", 33)],
      },
    ],
  };

  const runCase = async (
    name: string,
    params: Partial<Parameters<typeof buildMauricioMfcCatalogMediaRecoveryActions>[0]>,
    check: (actions: any[]) => void,
    expected: string,
  ): Promise<CaseResult> => {
    try {
      const actions = await buildMauricioMfcCatalogMediaRecoveryActions({
        userId: MAURICIO_MFC_USER_ID,
        clientMessage: "",
        assistantResponse: "",
        conversationHistory: [],
        productsData: mfcProductsData,
        sentMedias: [],
        existingMediaActions: [],
        ...params,
      });
      check(actions || []);
      return {
        name,
        passed: true,
        expected,
        actual: `${actions.length} action(s): ${(actions as any[]).map((action) => action.media_name).join(", ")}`,
      };
    } catch (error: any) {
      return {
        name,
        passed: false,
        expected,
        actual: error?.message || String(error),
      };
    }
  };

  const cases: CaseResult[] = [];

  cases.push(await runCase(
    "girassol_after_agent_acknowledged_theme",
    {
      clientMessage: "Manda as fotos",
      assistantResponse: "Pronto, enviei as fotos das artes do tema Girassol.",
      conversationHistory: [
        { text: "Boa tarde", fromMe: false } as any,
        { text: "Tem painel girassol", fromMe: false } as any,
        { text: "Temos sim painel girassol. Posso te mandar as fotos.", fromMe: true } as any,
      ],
    },
    (actions) => actions.length === 2 || fail("expected 2 girassol media actions"),
    "attach all Girassol images when customer asks photos after theme was acknowledged",
  ));

  cases.push(await runCase(
    "past_tense_enviei_as_fotos_recovers_media",
    {
      clientMessage: "Manda as fotos",
      assistantResponse: "Pronto, enviei as fotos do tema Lilo/Stitch.",
      conversationHistory: [{ text: "Tem painel lilo", fromMe: false } as any],
    },
    (actions) => actions.length === 2 || fail("expected 2 Lilo media actions"),
    "past tense photo promise must still produce media actions",
  ));

  cases.push(await runCase(
    "customer_says_nao_foi_resends_even_if_marked_sent",
    {
      clientMessage: "Nao foi nao, cade as fotos?",
      assistantResponse: "Vou reenviar as fotos do tema Lilo/Stitch agora.",
      conversationHistory: [
        { text: "Tem painel lilo", fromMe: false } as any,
        { text: "Pronto, enviei as fotos do tema Lilo/Stitch.", fromMe: true } as any,
      ],
      sentMedias: ["CATALOG_PRODUCT_IMAGE:prod-lilo:img-lilo-lateral"],
    },
    (actions) => actions.length === 2 || fail("expected resend of both Lilo images"),
    "resend request ignores previous sent media marker",
  ));

  cases.push(await runCase(
    "existing_catalog_action_prevents_duplicate",
    {
      clientMessage: "Manda as fotos do girassol",
      assistantResponse: "Vou te enviar as fotos do Girassol agora.",
      existingMediaActions: [
        {
          type: "send_media_url",
          media_name: "CATALOG_PRODUCT_IMAGE:prod-girassol:img-girassol-1",
          media_url: "https://cdn.example.com/img-girassol-1.jpg",
        } as any,
      ],
    },
    (actions) => actions.length === 0 || fail("expected no duplicate when catalog action already exists"),
    "do not duplicate when current turn already has catalog media action",
  ));

  cases.push(await runCase(
    "other_tenant_does_not_inherit_mfc_recovery",
    {
      userId: "tenant-normal",
      clientMessage: "Manda as fotos do girassol",
      assistantResponse: "Pronto, enviei as fotos do Girassol.",
    },
    (actions) => actions.length === 0 || fail("expected no action for other tenant"),
    "MFC recovery must stay tenant-scoped",
  ));

  cases.push(await runCase(
    "transactional_code_does_not_resend_photos",
    {
      clientMessage: "Quero codigo 23 costurado quantidade 1",
      assistantResponse: "Carrinho do pedido: item codigo 23. Total R$ 70,00.",
      conversationHistory: [{ text: "Tem painel lilo", fromMe: false } as any],
    },
    (actions) => actions.length === 0 || fail("expected no media for transactional order"),
    "order by code should not resend catalog photos",
  ));

  cases.push(await runCase(
    "pix_does_not_resend_catalog_photos",
    {
      clientMessage: "Pode mandar o Pix",
      assistantResponse: "O total ficou R$ 70,00. Pode pagar no Pix.",
      conversationHistory: [{ text: "Tem painel girassol", fromMe: false } as any],
    },
    (actions) => actions.length === 0 || fail("expected no media for Pix turn"),
    "Pix/payment turn must not attach catalog photos",
  ));

  cases.push(await runCase(
    "address_does_not_resend_catalog_photos",
    {
      clientMessage: "Qual o endereco para retirada?",
      assistantResponse: "O endereco para retirada e Rua do Uruguai, Loja 9, Galpao 04.",
      conversationHistory: [{ text: "Tem painel girassol", fromMe: false } as any],
    },
    (actions) => actions.length === 0 || fail("expected no media for address turn"),
    "address/location turn must not attach catalog photos",
  ));

  cases.push(await runCase(
    "multi_theme_recent_inbound_attaches_both",
    {
      clientMessage: "e galaxia",
      assistantResponse: "Tem sim. Vou te enviar as fotos desses temas agora.",
      conversationHistory: [
        { text: "tem painel lilo", fromMe: false, timestamp: "2026-06-09T10:00:00.000Z" } as any,
        { text: "e galaxia", fromMe: false, timestamp: "2026-06-09T10:00:05.000Z" } as any,
      ],
    },
    (actions) => actions.length === 3 || fail("expected Lilo and Galaxia media actions"),
    "recent same-turn theme continuation should attach both requested themes",
  ));

  cases.push(await runCase(
    "ok_after_photos_does_not_trigger_resend",
    {
      clientMessage: "ok",
      assistantResponse: "Perfeito, fico no aguardo da escolha.",
      conversationHistory: [
        { text: "Tem painel girassol", fromMe: false } as any,
        { text: "Pronto, enviei as fotos do Girassol.", fromMe: true } as any,
      ],
    },
    (actions) => actions.length === 0 || fail("expected no media for ok acknowledgement"),
    "simple acknowledgement should not resend photos",
  ));

  const passed = cases.filter((item) => item.passed).length;
  const failed = cases.length - passed;
  const artifact = {
    suite: "mauricio-mfc-media-recovery",
    generatedAt: new Date().toISOString(),
    total: cases.length,
    passed,
    failed,
    cases,
  };
  const artifactDir = path.join(process.cwd(), "validation-artifacts");
  mkdirSync(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `mauricio-mfc-media-recovery-${Date.now()}.json`);
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
  console.log(JSON.stringify({ artifactPath, total: cases.length, passed, failed }, null, 2));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .then(() => {
    if (!process.exitCode) process.exit(0);
    process.exit(process.exitCode);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
