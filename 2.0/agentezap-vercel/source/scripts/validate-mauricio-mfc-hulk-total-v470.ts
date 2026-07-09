import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAURICIO_MFC_USER_ID = "a7f1edc1-ae45-45a5-b382-2a1024507355";
const OTHER_TENANT_USER_ID = "580289af-e54f-4dd8-a2c7-93acf3db2e3b";

const baseUrl = String(process.env.MAURICIO_MFC_VALIDATION_BASE_URL || "https://agentezap.online").replace(/\/+$/, "");
const validationRunLabel = String(
  process.env.MAURICIO_MFC_VALIDATION_RUN_LABEL || "mauricio-mfc-hulk-total-v473",
).trim();
const validationImage = String(
  process.env.MAURICIO_MFC_VALIDATION_IMAGE || "agentezap-app:mauricio-mfc-hulk-total-v473-20260612145000",
).trim();
const outputPath =
  process.env.MAURICIO_MFC_VALIDATION_OUTPUT ||
  path.join("validation-artifacts", `${validationRunLabel}-prod-${Date.now()}.json`);

type HistoryItem = { role: "user" | "assistant"; content: string };
type ValidationCase = {
  id: string;
  label: string;
  userId?: string;
  message: string;
  history?: HistoryItem[];
  validate: (payload: any) => string[];
};

function fold(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function visibleText(payload: any) {
  const parts: string[] = [];
  for (const key of ["response", "message", "error"]) {
    if (typeof payload?.[key] === "string") parts.push(payload[key]);
  }
  if (Array.isArray(payload?.splitResponses)) {
    for (const item of payload.splitResponses) {
      if (typeof item === "string") parts.push(item);
    }
  }
  if (Array.isArray(payload?.mediaActions)) {
    for (const action of payload.mediaActions) {
      for (const key of ["media_name", "mediaName", "product_name", "variation_name", "caption", "file_name", "text"]) {
        if (typeof action?.[key] === "string") parts.push(action[key]);
      }
    }
  }
  return parts.join("\n");
}

function responseText(payload: any) {
  return String(payload?.response || "");
}

function mediaActions(payload: any) {
  return Array.isArray(payload?.mediaActions) ? payload.mediaActions : [];
}

function hasMojibake(text: string) {
  if (
    /\u00c3[\u0080-\u00bf\u0192\u2021\u2030\u0161\u0152]|\u00c2[\u0080-\u00bf]|\u00e2[\u0080-\u00bf\u20ac]|\u00ef\u00bf\u00bd|\ufffd|\u00f0[\u0080-\u00bf\u0178]/i.test(text)
  ) {
    return true;
  }
  return /voc\?|n\?o|cat\?logo|produ\?\?|Ã[^A-Z\s]|Â[^A-Z\s]|â[^\sA-Za-z]|�|ð/i.test(text);
}

function commonChecks(payload: any) {
  const errors: string[] = [];
  const text = visibleText(payload);
  const actions = mediaActions(payload);
  if (!responseText(payload).trim() && actions.length === 0) errors.push("empty_output");
  if (text.includes("[BOLHA]")) errors.push("bubble_marker_leak");
  if (hasMojibake(text)) errors.push("mojibake");
  if (fold(text).includes("codex")) errors.push("internal_tool_name_leak");
  return errors;
}

function signatureErrors(payload: any) {
  const response = responseText(payload);
  const count = (response.match(/ASSISTENTE VIRTUAL MFC/gi) || []).length;
  return count > 1 ? [`duplicated_signature:${count}`] : [];
}

function hasText(payload: any, ...needles: string[]) {
  const text = fold(visibleText(payload));
  return needles.every((needle) => text.includes(fold(needle)));
}

function hasMoney(payload: any, value: number) {
  const text = fold(visibleText(payload)).replace(/\s+/g, " ");
  const reais = String(value);
  return (
    text.includes(`r$ ${reais},00`) ||
    text.includes(`r$${reais},00`) ||
    text.includes(`r$ ${reais}.00`) ||
    text.includes(`r$${reais}.00`)
  );
}

function catalogMediaText(payload: any) {
  return mediaActions(payload)
    .map((action: any) =>
      [
        action?.media_name,
        action?.mediaName,
        action?.product_name,
        action?.variation_name,
        action?.caption,
        action?.file_name,
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
}

function expectHulkOnlyMedia(payload: any, minimum = 1) {
  const errors: string[] = [];
  const actions = mediaActions(payload);
  if (actions.length < minimum) errors.push(`expected_hulk_media_min_${minimum}_got_${actions.length}`);
  const mediaText = fold(catalogMediaText(payload));
  if (!mediaText.includes("hulk")) errors.push("missing_hulk_media");
  if (/\b(mario|super mario|sao joao|saojoao)\b/.test(mediaText)) errors.push("unexpected_other_theme_media");
  for (const action of actions) {
    const code = Number(action?.variation_code ?? String(action?.media_name || "").match(/CODIGO_(\d+)/i)?.[1]);
    if (Number.isFinite(code) && (code < 31 || code > 41)) {
      errors.push(`unexpected_hulk_code_${code}`);
    }
  }
  return errors;
}

function expectNoCatalogMedia(payload: any) {
  const actions = mediaActions(payload);
  return actions.some((action: any) => String(action?.media_name || "").startsWith("CODIGO_"))
    ? ["unexpected_catalog_media"]
    : [];
}

const liloSelectionHistory: HistoryItem[] = [
  {
    role: "user",
    content: "Codigo 21 CILINDROS DO LILO STHIC. Costurado R$ 100,00; sem costura R$ 80,00.",
  },
  {
    role: "user",
    content: "Codigo 28 PAINEL LATERAL DO LILO STHIC. Costurado R$ 70,00; sem costura R$ 65,00.",
  },
  {
    role: "user",
    content: "Codigo 27 PAINEL LATERAL DO LILO STHIC. Costurado R$ 70,00; sem costura R$ 65,00.",
  },
  { role: "user", content: "1 de cada" },
];

const hulkFollowupHistory: HistoryItem[] = [
  ...liloSelectionHistory,
  { role: "user", content: "Manda foto do paineis hulk" },
  {
    role: "assistant",
    content:
      "Vou enviar as fotos do Hulk. No catalogo tambem existem Super Mario codigo 46 e Sao Joao codigo 47.",
  },
];

const cases: ValidationCase[] = [
  {
    id: "line_price_no_duplicate_signature",
    label: "Preco por linha sem assinatura duplicada",
    message: "Quanto fica painel lateral?",
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...(hasText(payload, "costurado", "sem costura") && hasMoney(payload, 70) && hasMoney(payload, 65)
        ? []
        : ["missing_lateral_prices"]),
      ...expectNoCatalogMedia(payload),
    ],
  },
  {
    id: "pending_total_asks_finish",
    label: "Total dos itens pendentes pede acabamento",
    message: "Quanto fica esses eu pedi",
    history: liloSelectionHistory,
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...(hasText(payload, "acabamento") ? [] : ["missing_finish_request"]),
      ...(hasText(payload, "21", "27", "28") ? [] : ["missing_selected_codes"]),
      ...expectNoCatalogMedia(payload),
    ],
  },
  {
    id: "hulk_photo_request_with_pending_cart",
    label: "Pedido de foto Hulk nao e bloqueado por carrinho pendente",
    message: "Manda foto dos paineis hulk",
    history: liloSelectionHistory,
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...expectHulkOnlyMedia(payload, 1),
    ],
  },
  {
    id: "combined_total_and_hulk_photo",
    label: "Mensagem combinada total + foto Hulk",
    message: "Quanto fica esses eu pedi. Manda foto dos paineis Hulk",
    history: liloSelectionHistory,
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...expectHulkOnlyMedia(payload, 1),
      ...(hasText(payload, "acabamento") ? [] : ["missing_pending_finish_text"]),
    ],
  },
  {
    id: "generic_quero_fotos_anchors_to_hulk",
    label: "Quero fotos continua Hulk sem puxar outros temas",
    message: "Quero fotos",
    history: hulkFollowupHistory,
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...expectHulkOnlyMedia(payload, 1),
    ],
  },
  {
    id: "sem_costura_total_210",
    label: "Acabamento sem costura calcula total correto",
    message: "sem costura",
    history: [
      ...liloSelectionHistory,
      {
        role: "assistant",
        content: "Para calcular o valor total, preciso saber qual acabamento voce prefere: costurado ou sem costura.",
      },
    ],
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...(hasMoney(payload, 210) ? [] : ["missing_total_210"]),
      ...(hasText(payload, "sem costura") ? [] : ["missing_sem_costura"]),
      ...expectNoCatalogMedia(payload),
    ],
  },
  {
    id: "costurado_total_240",
    label: "Acabamento costurado calcula total correto",
    message: "costurado",
    history: [
      ...liloSelectionHistory,
      {
        role: "assistant",
        content: "Para calcular o valor total, preciso saber qual acabamento voce prefere: costurado ou sem costura.",
      },
    ],
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...(hasMoney(payload, 240) ? [] : ["missing_total_240"]),
      ...(hasText(payload, "costurado") ? [] : ["missing_costurado"]),
      ...expectNoCatalogMedia(payload),
    ],
  },
  {
    id: "girassol_photos_regression",
    label: "Regressao Girassol envia midias corretas",
    message: "Manda foto dos paineis girassol",
    validate: (payload) => {
      const mediaText = fold(catalogMediaText(payload));
      return [
        ...commonChecks(payload),
        ...signatureErrors(payload),
        ...(mediaActions(payload).length > 0 ? [] : ["missing_girassol_media"]),
        ...(mediaText.includes("girassol") ? [] : ["missing_girassol_name"]),
        ...(mediaText.includes("hulk") ? ["unexpected_hulk_in_girassol"] : []),
      ];
    },
  },
  {
    id: "external_link_not_delivery",
    label: "Link externo nao vira entrega",
    message: "segue o arquivo https://minha-arte.netlify.app/modelo",
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...(payload?.mode === "mauricio_mfc_external_material" ? [] : [`unexpected_mode_${payload?.mode || "none"}`]),
      ...expectNoCatalogMedia(payload),
    ],
  },
  {
    id: "delivery_motoboy_regression",
    label: "Pedido de motoboy continua entrega",
    message: "Voces fazem entrega por motoboy?",
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...(payload?.mode === "mauricio_mfc_delivery" ? [] : [`unexpected_mode_${payload?.mode || "none"}`]),
      ...(hasText(payload, "motoboy") ? [] : ["missing_motoboy_text"]),
      ...expectNoCatalogMedia(payload),
    ],
  },
  {
    id: "address_pickup_regression",
    label: "Endereco de retirada preservado",
    message: "Qual endereco para retirar na loja?",
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...(payload?.mode === "mauricio_mfc_address" ? [] : [`unexpected_mode_${payload?.mode || "none"}`]),
      ...(hasText(payload, "Estrada da Liberdade", "Salvador") ? [] : ["missing_address_text"]),
    ],
  },
  {
    id: "product_code_selection_regression",
    label: "Codigo 27 sem costura nao vira entrega nem midia",
    message: "Codigo 27 sem costura 1 unidade",
    validate: (payload) => [
      ...commonChecks(payload),
      ...signatureErrors(payload),
      ...(hasMoney(payload, 65) ? [] : ["missing_code_27_price"]),
      ...expectNoCatalogMedia(payload),
      ...(payload?.mode === "mauricio_mfc_external_material" || payload?.mode === "mauricio_mfc_delivery"
        ? [`unexpected_mode_${payload.mode}`]
        : []),
    ],
  },
  {
    id: "other_tenant_does_not_inherit_hulk_module",
    label: "Outro tenant nao herda midias/regras MFC",
    userId: OTHER_TENANT_USER_ID,
    message: "Quero fotos dos paineis Hulk",
    history: [{ role: "user", content: "Manda foto dos paineis Hulk" }],
    validate: (payload) => {
      const text = fold(visibleText(payload));
      return [
        ...commonChecks(payload),
        ...(payload?.mode && String(payload.mode).startsWith("mauricio_mfc") ? [`unexpected_mfc_mode_${payload.mode}`] : []),
        ...(text.includes("assistente virtual mfc") ? ["unexpected_mfc_signature"] : []),
        ...(fold(catalogMediaText(payload)).includes("hulk") ? ["unexpected_hulk_media_other_tenant"] : []),
      ];
    },
  },
];

async function callCase(testCase: ValidationCase) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/test-agent/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: testCase.userId || MAURICIO_MFC_USER_ID,
        message: testCase.message,
        history: testCase.history || [],
        sentMedias: [],
        sessionId: `${testCase.id}-${Date.now()}`,
        clearCart: true,
        contactName: "Cliente teste",
      }),
      signal: AbortSignal.timeout(Number(process.env.MAURICIO_MFC_VALIDATION_TIMEOUT_MS || 240_000)),
    });
    const raw = await response.text();
    let payload: any;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { rawText: raw };
    }
    const errors = response.ok ? testCase.validate(payload) : [`http_${response.status}`];
    return {
      id: testCase.id,
      label: testCase.label,
      userId: testCase.userId || MAURICIO_MFC_USER_ID,
      status: response.status,
      passed: errors.length === 0,
      errors,
      elapsedMs: Date.now() - startedAt,
      mode: payload?.mode || null,
      responsePreview: responseText(payload).trim().slice(0, 500),
      mediaCount: mediaActions(payload).length,
      mediaNames: mediaActions(payload).map((action: any) => String(action?.media_name || action?.mediaName || "")),
      raw: payload,
    };
  } catch (error: any) {
    return {
      id: testCase.id,
      label: testCase.label,
      userId: testCase.userId || MAURICIO_MFC_USER_ID,
      status: 0,
      passed: false,
      errors: [`exception_${error?.name || "error"}:${error?.message || String(error)}`],
      elapsedMs: Date.now() - startedAt,
      mode: null,
      responsePreview: "",
      mediaCount: 0,
      mediaNames: [],
      raw: null,
    };
  }
}

async function main() {
  const results = [];
  for (const testCase of cases) {
    const result = await callCase(testCase);
    results.push(result);
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.id} mode=${result.mode || "none"} media=${result.mediaCount}`);
    if (!result.passed) {
      console.log(`  ${result.errors.join(", ")}`);
    }
  }

  const artifact = {
    runId: `${validationRunLabel}-prod-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    baseUrl,
    image: validationImage,
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    results,
  };
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(artifact, null, 2), "utf8");
  console.log(`RESULT_FILE=${outputPath}`);
  if (artifact.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
