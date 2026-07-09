import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/agentezap_test";

const {
  DEFAULT_LLM_PROVIDER_ORDER,
  DEFAULT_NVIDIA_FALLBACK_MODELS,
  DEFAULT_OPENROUTER_FALLBACK_MODELS,
  OPENROUTER_MISTRAL_NEMO_CHEAP_PROVIDER_ORDER,
  OPENROUTER_MISTRAL_NEMO_FREE_MODEL,
  OPENROUTER_MISTRAL_NEMO_MODEL,
  buildOpenRouterFreeModelAttemptOrder,
  buildOpenRouterModelAttemptOrder,
  buildOpenRouterPaidModelAttemptOrder,
  buildOpenRouterProviderPreference,
  hasOpenRouterZeroTextPricing,
  isRecommendedOpenRouterAgentModel,
  normalizeAgentLLMConfig,
  normalizeSystemConfigBoolean,
  applyAgentLLMConfigOverride,
  normalizeLLMProviderOrder,
  normalizeNvidiaModels,
  normalizeNvidiaModelsStrict,
  normalizeOpenRouterModels,
  normalizeOpenRouterModelsStrict,
  routeOpenRouterModelForLowestPrice,
  resolveChatProviderOrder,
} = await import("../llmConfigResolver");

test("normalizeLLMProviderOrder preserves configured order and appends defaults", () => {
  assert.deepEqual(
    normalizeLLMProviderOrder(["openrouter", "mistral", "openrouter"], "groq"),
    ["openrouter", "mistral", "groq", "nvidia"],
  );
});

test("normalizeLLMProviderOrder accepts JSON text and legacy provider", () => {
  assert.deepEqual(
    normalizeLLMProviderOrder('["nvidia","openrouter"]', "mistral"),
    ["nvidia", "openrouter", "mistral", "groq"],
  );
});

test("normalizeLLMProviderOrder defaults to OpenRouter, NVIDIA, Mistral, Groq", () => {
  assert.deepEqual(normalizeLLMProviderOrder(undefined), DEFAULT_LLM_PROVIDER_ORDER);
});

test("resolveChatProviderOrder removes Mistral when chat is disabled", () => {
  assert.deepEqual(
    resolveChatProviderOrder(["mistral", "nvidia", "openrouter", "groq"], false),
    ["nvidia", "openrouter", "groq"],
  );
  assert.deepEqual(
    resolveChatProviderOrder(["mistral"], false),
    ["openrouter", "nvidia", "groq"],
  );
});

test("custom tenant override can opt back into Mistral chat without changing global order", () => {
  const resolved = applyAgentLLMConfigOverride(
    {
      provider: "openrouter",
      providerOrder: ["openrouter", "nvidia", "groq"],
      deepinfraApiKey: "",
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      groqApiKey: "",
      groqModel: "openai/gpt-oss-20b",
      openrouterApiKey: "or-key",
      openrouterModel: "openai/gpt-oss-20b:free",
      openrouterModels: ["openai/gpt-oss-20b:free"],
      openrouterProvider: "auto",
      mistralApiKey: "mistral-key",
      mistralApiKeys: ["mistral-key"],
      mistralModel: "mistral-medium-latest",
      mistralChatEnabled: false,
      nvidiaApiKey: "nv-key",
      nvidiaModel: "nvidia/llama-3.3-nemotron-super-49b-v1",
      nvidiaModels: ["nvidia/llama-3.3-nemotron-super-49b-v1"],
      usesUserOverride: false,
    },
    {
      mode: "custom",
      provider: "mistral",
      mistralModel: "mistral-large-latest",
      mistralChatEnabled: true,
    },
    "tenant-1",
  );

  assert.equal(resolved.mistralChatEnabled, true);
  assert.equal(resolved.provider, "mistral");
  assert.equal(resolved.providerOrder[0], "mistral");
  assert.deepEqual(resolved.providerOrder.slice(1), ["openrouter", "nvidia", "groq"]);
});

test("normalizeSystemConfigBoolean accepts admin toggle values", () => {
  assert.equal(normalizeSystemConfigBoolean("false", true), false);
  assert.equal(normalizeSystemConfigBoolean("0", true), false);
  assert.equal(normalizeSystemConfigBoolean("sim", false), true);
  assert.equal(normalizeSystemConfigBoolean(undefined, true), true);
});

test("normalizeOpenRouterModels preserves configured free models and appends Mistral Nemo after free fallbacks", () => {
  const models = normalizeOpenRouterModels([
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-nano-9b-v2:free",
    "invalid-model",
    "openai/gpt-oss-20b:free",
  ]);

  assert.equal(models[0], "openai/gpt-oss-20b:free");
  assert.equal(models[1], "nvidia/nemotron-nano-9b-v2:free");
  assert.equal(models.includes("invalid-model"), false);
  assert.equal(models.includes(DEFAULT_OPENROUTER_FALLBACK_MODELS[0]), true);
  assert.equal(models.includes(OPENROUTER_MISTRAL_NEMO_MODEL), true);
  assert.equal(models[models.length - 1], OPENROUTER_MISTRAL_NEMO_MODEL);
  assert.equal(models.filter((model) => model === "openai/gpt-oss-20b:free").length, 1);
});

test("normalizeOpenRouterModels defaults to tested free fallback order before Mistral Nemo", () => {
  assert.deepEqual(normalizeOpenRouterModels(), [...DEFAULT_OPENROUTER_FALLBACK_MODELS]);
  assert.equal(DEFAULT_OPENROUTER_FALLBACK_MODELS[0], "openai/gpt-oss-20b:free");
  assert.equal(DEFAULT_OPENROUTER_FALLBACK_MODELS[1], "google/gemma-4-31b-it:free");
  assert.equal(DEFAULT_OPENROUTER_FALLBACK_MODELS[DEFAULT_OPENROUTER_FALLBACK_MODELS.length - 1], OPENROUTER_MISTRAL_NEMO_MODEL);
});

test("OpenRouter Mistral Nemo only uses the cheapest providers", () => {
  assert.deepEqual(
    buildOpenRouterProviderPreference(OPENROUTER_MISTRAL_NEMO_MODEL, "auto"),
    {
      order: [...OPENROUTER_MISTRAL_NEMO_CHEAP_PROVIDER_ORDER],
      only: [...OPENROUTER_MISTRAL_NEMO_CHEAP_PROVIDER_ORDER],
      allow_fallbacks: false,
    },
  );
  assert.equal(
    routeOpenRouterModelForLowestPrice(OPENROUTER_MISTRAL_NEMO_MODEL, "auto"),
    OPENROUTER_MISTRAL_NEMO_MODEL,
  );
});

test("OpenRouter Mistral Nemo keeps fallback restricted to DekaLLM and DeepInfra", () => {
  assert.deepEqual(
    buildOpenRouterProviderPreference(OPENROUTER_MISTRAL_NEMO_MODEL, "mistral"),
    {
      order: [...OPENROUTER_MISTRAL_NEMO_CHEAP_PROVIDER_ORDER],
      only: [...OPENROUTER_MISTRAL_NEMO_CHEAP_PROVIDER_ORDER],
      allow_fallbacks: false,
    },
  );
  assert.equal(
    routeOpenRouterModelForLowestPrice(OPENROUTER_MISTRAL_NEMO_MODEL, "mistral"),
    OPENROUTER_MISTRAL_NEMO_MODEL,
  );
});

test("OpenRouter Mistral Nemo can prioritize a selected cheap provider without leaving the cheap pair", () => {
  assert.deepEqual(
    buildOpenRouterProviderPreference(OPENROUTER_MISTRAL_NEMO_MODEL, "deepinfra"),
    {
      order: ["deepinfra", "dekallm"],
      only: ["deepinfra", "dekallm"],
      allow_fallbacks: false,
    },
  );
  assert.equal(
    routeOpenRouterModelForLowestPrice(OPENROUTER_MISTRAL_NEMO_MODEL, "deepinfra"),
    OPENROUTER_MISTRAL_NEMO_MODEL,
  );
});

test("OpenRouter Mistral Nemo model attempts ignore generic free models before the paid cheap Nemo route", () => {
  const models = buildOpenRouterModelAttemptOrder({
    requestedModel: OPENROUTER_MISTRAL_NEMO_MODEL,
    openrouterModels: ["openai/gpt-oss-120b:free", "nvidia/nemotron-3.5-content-safety:free"],
    openrouterModel: OPENROUTER_MISTRAL_NEMO_MODEL,
    strictPrimaryProvider: true,
  });

  assert.deepEqual(models, [OPENROUTER_MISTRAL_NEMO_MODEL]);
  assert.equal(models.includes("openai/gpt-oss-120b:free"), false);
  assert.equal(models.includes("nvidia/nemotron-3.5-content-safety:free"), false);
  assert.equal(models.filter((model) => model === OPENROUTER_MISTRAL_NEMO_MODEL).length, 1);
});

test("OpenRouter Mistral Nemo attempts only split real Nemo free and paid phases", () => {
  const params = {
    requestedModel: OPENROUTER_MISTRAL_NEMO_MODEL,
    openrouterModels: [
      OPENROUTER_MISTRAL_NEMO_FREE_MODEL,
      "openai/gpt-oss-120b:free",
      "nvidia/nemotron-3.5-content-safety:free",
    ],
    openrouterModel: OPENROUTER_MISTRAL_NEMO_MODEL,
    strictPrimaryProvider: true,
  };

  const freeModels = buildOpenRouterFreeModelAttemptOrder(params);
  assert.deepEqual(freeModels, [OPENROUTER_MISTRAL_NEMO_FREE_MODEL]);
  assert.equal(freeModels.includes(OPENROUTER_MISTRAL_NEMO_MODEL), false);
  assert.deepEqual(buildOpenRouterPaidModelAttemptOrder(params), [OPENROUTER_MISTRAL_NEMO_MODEL]);
});

test("global OpenRouter attempts ignore configured generic free models and go directly to Nemo paid", () => {
  const params = {
    openrouterModel: "openai/gpt-oss-20b:free",
    openrouterModels: [
      "openai/gpt-oss-20b:free",
      "google/gemma-4-31b-it:free",
      "openai/gpt-oss-120b:free",
      "nvidia/nemotron-nano-9b-v2:free",
      "openrouter/free",
    ],
    strictPrimaryProvider: false,
  };

  assert.deepEqual(buildOpenRouterFreeModelAttemptOrder(params), []);
  assert.deepEqual(buildOpenRouterPaidModelAttemptOrder(params), [OPENROUTER_MISTRAL_NEMO_MODEL]);
  assert.deepEqual(buildOpenRouterModelAttemptOrder(params), [OPENROUTER_MISTRAL_NEMO_MODEL]);
});

test("OpenRouter free fallback models keep normal automatic routing", () => {
  assert.equal(buildOpenRouterProviderPreference("openai/gpt-oss-120b:free", "auto"), undefined);
  assert.equal(
    routeOpenRouterModelForLowestPrice("openai/gpt-oss-120b:free", "auto"),
    "openai/gpt-oss-120b:free",
  );
});

test("strict OpenRouter normalization keeps only tenant-selected free models", () => {
  const models = normalizeOpenRouterModelsStrict(
    ["openai/gpt-oss-120b:free", "invalid-model"],
    "openai/gpt-oss-20b:free",
  );

  assert.deepEqual(models, ["openai/gpt-oss-120b:free", "openai/gpt-oss-20b:free"]);
  assert.equal(models.includes(OPENROUTER_MISTRAL_NEMO_MODEL), false);
  assert.equal(models.includes("google/gemma-4-31b-it:free"), false);
});

test("normalizeNvidiaModels preserves configured order and appends fallbacks", () => {
  const models = normalizeNvidiaModels([
    "nvidia/nemotron-3-super-120b-a12b",
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-3-super-120b-a12b",
  ]);

  assert.equal(models[0], "nvidia/nemotron-3-super-120b-a12b");
  assert.equal(models.includes("openai/gpt-oss-20b:free"), false);
  assert.equal(models.includes(DEFAULT_NVIDIA_FALLBACK_MODELS[0]), true);
  assert.equal(models.filter((model) => model === "nvidia/nemotron-3-super-120b-a12b").length, 1);
});

test("strict NVIDIA normalization keeps only tenant-selected NVIDIA models", () => {
  const models = normalizeNvidiaModelsStrict([
    "nvidia/nemotron-3-super-120b-a12b",
    "openai/gpt-oss-20b:free",
  ]);

  assert.deepEqual(models, ["nvidia/nemotron-3-super-120b-a12b"]);
  assert.equal(models.includes(DEFAULT_NVIDIA_FALLBACK_MODELS[0]), false);
});

test("normalizeNvidiaModels rejects non-agent NVIDIA models", () => {
  const models = normalizeNvidiaModels([
    "nvidia/nemotron-3.5-content-safety",
    "nvidia/llama-3.3-nemotron-super-49b-v1",
  ]);

  assert.equal(models.includes("nvidia/nemotron-3.5-content-safety"), false);
  assert.equal(models.includes("nvidia/llama-3.3-nemotron-super-49b-v1"), true);
});

test("normalizeOpenRouterModels only allows the paid Mistral Nemo primary and rejects other paid/non-agent models", () => {
  const models = normalizeOpenRouterModels([
    "openai/gpt-oss-20b",
    "nvidia/nemotron-3.5-content-safety:free",
    "openai/gpt-oss-120b:free",
  ]);

  assert.equal(models.includes("openai/gpt-oss-20b"), false);
  assert.equal(models.includes("nvidia/nemotron-3.5-content-safety:free"), false);
  assert.equal(models.includes(OPENROUTER_MISTRAL_NEMO_MODEL), true);
  assert.equal(models.includes("openai/gpt-oss-120b:free"), true);
  assert.equal(
    models.every(
      (model) =>
        model === OPENROUTER_MISTRAL_NEMO_MODEL ||
        model === "openrouter/free" ||
        model.endsWith(":free"),
    ),
    true,
  );
});

test("isRecommendedOpenRouterAgentModel allows Mistral Nemo primary and free text chat models", () => {
  assert.equal(
    isRecommendedOpenRouterAgentModel({
      id: OPENROUTER_MISTRAL_NEMO_MODEL,
      name: "Mistral Nemo",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    }),
    true,
  );
  assert.equal(
    isRecommendedOpenRouterAgentModel({
      id: "openai/gpt-oss-120b:free",
      name: "OpenAI GPT-OSS 120B",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    }),
    true,
  );
  assert.equal(
    isRecommendedOpenRouterAgentModel({
      id: "openai/gpt-oss-120b",
      name: "OpenAI GPT-OSS 120B",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    }),
    false,
  );
  assert.equal(
    isRecommendedOpenRouterAgentModel({
      id: "mistralai/magistral-medium-2509",
      name: "Mistral Magistral Medium 2509",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    }),
    false,
  );
  assert.equal(
    isRecommendedOpenRouterAgentModel({
      id: "mistralai/magistral-small-latest",
      name: "Mistral Small Latest",
      pricing: { prompt: "0", completion: "0" },
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    }),
    true,
  );
  assert.equal(hasOpenRouterZeroTextPricing({ pricing: { prompt: "0", completion: "0" } }), true);
  assert.equal(
    isRecommendedOpenRouterAgentModel({
      id: "nvidia/nemotron-3.5-content-safety:free",
      name: "NVIDIA Content Safety",
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    }),
    false,
  );
});

test("custom tenant OpenRouter override uses strict model list without fallback fanout", () => {
  const resolved = applyAgentLLMConfigOverride(
    {
      provider: "nvidia",
      providerOrder: ["nvidia", "openrouter", "groq"],
      deepinfraApiKey: "",
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      groqApiKey: "",
      groqModel: "openai/gpt-oss-20b",
      openrouterApiKey: "or-key",
      openrouterModel: "openai/gpt-oss-20b:free",
      openrouterModels: ["openai/gpt-oss-20b:free", "google/gemma-4-31b-it:free"],
      openrouterProvider: "auto",
      mistralApiKey: "mistral-key",
      mistralApiKeys: ["mistral-key"],
      mistralModel: "mistral-medium-latest",
      mistralChatEnabled: false,
      nvidiaApiKey: "nv-key",
      nvidiaModel: "nvidia/llama-3.3-nemotron-super-49b-v1",
      nvidiaModels: ["nvidia/llama-3.3-nemotron-super-49b-v1"],
      usesUserOverride: false,
    },
    {
      mode: "custom",
      provider: "openrouter",
      openrouterModel: "openai/gpt-oss-120b:free",
      openrouterModels: ["openai/gpt-oss-120b:free"],
      mistralChatEnabled: false,
    },
    "tenant-openrouter",
  );

  assert.equal(resolved.provider, "openrouter");
  assert.deepEqual(resolved.openrouterModels, ["openai/gpt-oss-120b:free"]);
  assert.equal(resolved.openrouterModel, "openai/gpt-oss-120b:free");
  assert.equal(resolved.openrouterModels.includes("openai/gpt-oss-20b:free"), false);
  assert.equal(resolved.providerOrder.includes("mistral"), false);
});

test("custom tenant NVIDIA override uses strict model list without fallback fanout", () => {
  const resolved = applyAgentLLMConfigOverride(
    {
      provider: "openrouter",
      providerOrder: ["openrouter", "nvidia", "groq"],
      deepinfraApiKey: "",
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      groqApiKey: "",
      groqModel: "openai/gpt-oss-20b",
      openrouterApiKey: "or-key",
      openrouterModel: "openai/gpt-oss-20b:free",
      openrouterModels: ["openai/gpt-oss-20b:free"],
      openrouterProvider: "auto",
      mistralApiKey: "mistral-key",
      mistralApiKeys: ["mistral-key"],
      mistralModel: "mistral-medium-latest",
      mistralChatEnabled: false,
      nvidiaApiKey: "nv-key",
      nvidiaModel: "nvidia/llama-3.3-nemotron-super-49b-v1",
      nvidiaModels: ["nvidia/llama-3.3-nemotron-super-49b-v1", "nvidia/nemotron-3-super-120b-a12b"],
      usesUserOverride: false,
    },
    {
      mode: "custom",
      provider: "nvidia",
      nvidiaModel: "nvidia/nemotron-3-super-120b-a12b",
      nvidiaModels: ["nvidia/nemotron-3-super-120b-a12b"],
      mistralChatEnabled: false,
    },
    "tenant-nvidia",
  );

  assert.equal(resolved.provider, "nvidia");
  assert.deepEqual(resolved.nvidiaModels, ["nvidia/nemotron-3-super-120b-a12b"]);
  assert.equal(resolved.nvidiaModel, "nvidia/nemotron-3-super-120b-a12b");
  assert.equal(resolved.nvidiaModels.includes(DEFAULT_NVIDIA_FALLBACK_MODELS[0]), false);
  assert.equal(resolved.providerOrder.includes("mistral"), false);
});
