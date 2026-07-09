import { db } from "./db";
import {
  aiAgentConfig,
  systemConfig,
  type AgentLlmConfig,
  type LLMProvider,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { getLLMUserContext } from "./llmUserContext";

const LLM_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const GLOBAL_CACHE_KEY = "global";
const GLOBAL_LLM_KEYS = [
  "llm_provider",
  "llm_provider_order",
  "deepinfra_api_key",
  "deepinfra_transcription_model",
  "mistral_chat_enabled",
  "groq_api_key",
  "groq_model",
  "openrouter_api_key",
  "openrouter_model",
  "openrouter_models",
  "openrouter_provider",
  "mistral_api_key",
  "mistral_api_keys",
  "mistral_model",
  "nvidia_api_key",
  "status_nvidia_api_key",
  "blog_nvidia_api_key",
  "nvidia_model",
  "nvidia_models",
] as const;

export const DEFAULT_LLM_PROVIDER_ORDER: LLMProvider[] = ["openrouter", "nvidia", "mistral", "groq"];

export const KNOWN_ZERO_PRICE_OPENROUTER_AGENT_MODELS = [] as const;

export const OPENROUTER_MISTRAL_NEMO_MODEL = "mistralai/mistral-nemo";
export const OPENROUTER_MISTRAL_NEMO_FREE_MODEL = `${OPENROUTER_MISTRAL_NEMO_MODEL}:free`;
export const OPENROUTER_MISTRAL_NEMO_FLOOR_MODEL = `${OPENROUTER_MISTRAL_NEMO_MODEL}:floor`;
export const OPENROUTER_MISTRAL_NEMO_CHEAP_PROVIDER_ORDER = ["dekallm", "deepinfra"] as const;

const OPENROUTER_PAID_AGENT_PRIMARY_MODELS = [
  OPENROUTER_MISTRAL_NEMO_MODEL,
] as const;

export const DEFAULT_OPENROUTER_FALLBACK_MODELS = [
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "openrouter/free",
  OPENROUTER_MISTRAL_NEMO_MODEL,
] as const;

export const DEFAULT_NVIDIA_FALLBACK_MODELS = [
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-ultra-550b-a55b",
] as const;

const OPENROUTER_NON_AGENT_MODEL_TERMS = [
  "audio",
  "content-safety",
  "embed",
  "embedding",
  "guard",
  "image",
  "moderation",
  "rerank",
  "safety",
  "speech",
  "transcription",
  "tts",
  "video",
  "whisper",
] as const;

export interface ResolvedLLMConfig {
  provider: string;
  providerOrder: LLMProvider[];
  deepinfraApiKey: string;
  deepinfraTranscriptionModel: string;
  groqApiKey: string;
  groqModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterModels: string[];
  openrouterProvider: string;
  mistralApiKey: string;
  mistralApiKeys: string[];
  mistralModel: string;
  mistralChatEnabled: boolean;
  nvidiaApiKey: string;
  nvidiaModel: string;
  nvidiaModels: string[];
  resolvedUserId?: string;
  usesUserOverride: boolean;
}

export interface OpenRouterProviderPreference {
  order: string[];
  only?: string[];
  allow_fallbacks: boolean;
}

interface CacheEntry {
  config: ResolvedLLMConfig;
  timestamp: number;
}

const llmConfigCache = new Map<string, CacheEntry>();

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

export function normalizeSystemConfigBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "sim" ||
    normalized === "on" ||
    normalized === "enabled"
  ) {
    return true;
  }

  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "nao" ||
    normalized === "off" ||
    normalized === "disabled"
  ) {
    return false;
  }

  return fallback;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "sim" ||
    normalized === "on" ||
    normalized === "enabled"
  ) {
    return true;
  }

  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "nao" ||
    normalized === "off" ||
    normalized === "disabled"
  ) {
    return false;
  }

  return undefined;
}

export function isOpenRouterFreeFallbackModel(modelId: unknown): boolean {
  const model = String(modelId ?? "").trim().toLowerCase();
  if (model === "openrouter/free") {
    return true;
  }
  if ((KNOWN_ZERO_PRICE_OPENROUTER_AGENT_MODELS as readonly string[]).includes(model)) {
    return true;
  }
  return model.includes("/") && model.endsWith(":free");
}

export function isOpenRouterPaidAgentPrimaryModel(modelId: unknown): boolean {
  const model = normalizeOpenRouterRoutingModelId(modelId);
  return (OPENROUTER_PAID_AGENT_PRIMARY_MODELS as readonly string[]).includes(model);
}

export function normalizeOpenRouterRoutingModelId(modelId: unknown): string {
  const model = String(modelId ?? "").trim().toLowerCase();
  if (model === OPENROUTER_MISTRAL_NEMO_FLOOR_MODEL) {
    return OPENROUTER_MISTRAL_NEMO_MODEL;
  }
  return model;
}

export function isOpenRouterMistralNemoModel(modelId: unknown): boolean {
  return normalizeOpenRouterRoutingModelId(modelId) === OPENROUTER_MISTRAL_NEMO_MODEL;
}

export function isOpenRouterMistralNemoFreeModel(modelId: unknown): boolean {
  return String(modelId ?? "").trim().toLowerCase() === OPENROUTER_MISTRAL_NEMO_FREE_MODEL;
}

function isOpenRouterMistralNemoAttemptModel(modelId: unknown): boolean {
  return isOpenRouterMistralNemoModel(modelId) || isOpenRouterMistralNemoFreeModel(modelId);
}

function normalizeOpenRouterProviderPreference(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "auto") {
    return "auto";
  }
  return normalized;
}

function buildMistralNemoCheapProviderOrder(openrouterProvider?: unknown): string[] {
  const providerSlug = normalizeOpenRouterProviderPreference(openrouterProvider);
  const cheapProviders = [...OPENROUTER_MISTRAL_NEMO_CHEAP_PROVIDER_ORDER];
  if ((OPENROUTER_MISTRAL_NEMO_CHEAP_PROVIDER_ORDER as readonly string[]).includes(providerSlug)) {
    return [
      providerSlug,
      ...cheapProviders.filter((provider) => provider !== providerSlug),
    ];
  }
  return cheapProviders;
}

export function buildOpenRouterProviderPreference(
  modelId: unknown,
  openrouterProvider?: unknown,
): OpenRouterProviderPreference | undefined {
  const providerSlug = normalizeOpenRouterProviderPreference(openrouterProvider);
  if (isOpenRouterMistralNemoModel(modelId)) {
    const cheapOrder = buildMistralNemoCheapProviderOrder(providerSlug);
    return {
      order: cheapOrder,
      only: cheapOrder,
      allow_fallbacks: false,
    };
  }

  if (providerSlug !== "auto") {
    return {
      order: [providerSlug],
      allow_fallbacks: true,
    };
  }
  return undefined;
}

export function routeOpenRouterModelForLowestPrice(
  modelId: unknown,
  openrouterProvider?: unknown,
): string {
  const model = String(modelId ?? "").trim();
  const providerSlug = normalizeOpenRouterProviderPreference(openrouterProvider);
  if (!model) {
    return model;
  }
  if (isOpenRouterMistralNemoModel(model)) {
    return OPENROUTER_MISTRAL_NEMO_MODEL;
  }
  if (providerSlug !== "auto") {
    return model;
  }
  return model;
}

export function hasOpenRouterZeroTextPricing(model: {
  pricing?: Record<string, unknown> | null;
}): boolean {
  const pricing = model.pricing || {};
  return String(pricing.prompt ?? "") === "0" && String(pricing.completion ?? "") === "0";
}

export function isRecommendedOpenRouterAgentModel(model: {
  id?: unknown;
  name?: unknown;
  pricing?: Record<string, unknown> | null;
  architecture?: {
    input_modalities?: unknown;
    output_modalities?: unknown;
  };
}): boolean {
  const id = normalizeOpenRouterRoutingModelId(model.id);
  if (
    !isOpenRouterPaidAgentPrimaryModel(id) &&
    !isOpenRouterFreeFallbackModel(id) &&
    !hasOpenRouterZeroTextPricing(model)
  ) {
    return false;
  }

  const inputModalities = Array.isArray(model.architecture?.input_modalities)
    ? model.architecture.input_modalities.map((item) => String(item).toLowerCase())
    : ["text"];
  const outputModalities = Array.isArray(model.architecture?.output_modalities)
    ? model.architecture.output_modalities.map((item) => String(item).toLowerCase())
    : ["text"];

  if (!inputModalities.includes("text") || !outputModalities.includes("text")) {
    return false;
  }

  if (id === "openrouter/free") {
    return true;
  }

  const searchable = `${id} ${String(model.name ?? "").toLowerCase()}`;
  return !OPENROUTER_NON_AGENT_MODEL_TERMS.some((term) => searchable.includes(term));
}

function sanitizeApiKey(value: unknown): string {
  const raw = String(value ?? "");
  return raw
    .replaceAll(" ", "")
    .replaceAll("\n", "")
    .replaceAll("\r", "")
    .replaceAll("\t", "")
    .replaceAll("\u00A0", "")
    .trim();
}

function splitApiKeyText(value: string): string[] {
  let parts = [value];
  const separators = ["\n", "\r", "\t", ";", ",", " "];

  for (const separator of separators) {
    const nextParts: string[] = [];
    for (const part of parts) {
      nextParts.push(...part.split(separator));
    }
    parts = nextParts;
  }

  return parts;
}

function splitConfigListText(value: string): string[] {
  let parts = [value];
  const separators = ["\n", "\r", "\t", ";", ",", "|"];

  for (const separator of separators) {
    const nextParts: string[] = [];
    for (const part of parts) {
      nextParts.push(...part.split(separator));
    }
    parts = nextParts;
  }

  return parts;
}

export function normalizeMistralApiKeys(value: unknown): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  const addKey = (candidate: unknown) => {
    const apiKey = sanitizeApiKey(candidate);
    if (apiKey.length < 32 || seen.has(apiKey)) {
      return;
    }

    seen.add(apiKey);
    keys.push(apiKey);
  };

  const collect = (candidate: unknown): void => {
    if (candidate === null || candidate === undefined) {
      return;
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        collect(item);
      }
      return;
    }

    if (typeof candidate === "object") {
      const objectCandidate = candidate as Record<string, unknown>;
      collect(objectCandidate.mistralApiKeys);
      collect(objectCandidate.mistralApiKey);
      collect(objectCandidate.keys);
      return;
    }

    const text = String(candidate).trim();
    if (!text) {
      return;
    }

    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        const parsed = JSON.parse(text);
        collect(parsed);
        return;
      } catch {
        // Fall through to plain text parsing.
      }
    }

    for (const part of splitApiKeyText(text)) {
      addKey(part);
    }
  };

  collect(value);
  return keys;
}

export function mergeMistralApiKeys(...values: unknown[]): string[] {
  return normalizeMistralApiKeys(values);
}

function normalizeProvider(value: unknown, fallback: LLMProvider = "mistral"): LLMProvider {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "mistral" ||
    normalized === "groq" ||
    normalized === "openrouter" ||
    normalized === "nvidia"
  ) {
    return normalized;
  }

  return fallback;
}

function normalizeProviderOrNull(value: unknown): LLMProvider | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "mistral" ||
    normalized === "groq" ||
    normalized === "openrouter" ||
    normalized === "nvidia"
  ) {
    return normalized;
  }

  return null;
}

export function normalizeLLMProviderOrder(value: unknown, fallbackProvider?: unknown): LLMProvider[] {
  const providers: LLMProvider[] = [];
  const seen = new Set<LLMProvider>();

  const addProvider = (candidate: unknown) => {
    const provider = normalizeProviderOrNull(candidate);
    if (!provider || seen.has(provider)) {
      return;
    }
    seen.add(provider);
    providers.push(provider);
  };

  const collect = (candidate: unknown): void => {
    if (candidate === null || candidate === undefined) {
      return;
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) collect(item);
      return;
    }

    if (typeof candidate === "object") {
      const objectCandidate = candidate as Record<string, unknown>;
      collect(objectCandidate.providerOrder);
      collect(objectCandidate.llmProviderOrder);
      collect(objectCandidate.order);
      collect(objectCandidate.providers);
      collect(objectCandidate.provider);
      return;
    }

    const text = String(candidate).trim();
    if (!text) {
      return;
    }

    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        collect(JSON.parse(text));
        return;
      } catch {
        // Fall through to plain text parsing.
      }
    }

    for (const part of splitConfigListText(text)) {
      addProvider(part);
    }
  };

  collect(value);

  const fallback = normalizeProviderOrNull(fallbackProvider);
  if (fallback) {
    addProvider(fallback);
  }

  for (const provider of DEFAULT_LLM_PROVIDER_ORDER) {
    addProvider(provider);
  }

  return providers;
}

export function resolveChatProviderOrder(
  providerOrder: LLMProvider[],
  mistralChatEnabled: boolean,
): LLMProvider[] {
  const filteredOrder = mistralChatEnabled
    ? providerOrder
    : providerOrder.filter((provider) => provider !== "mistral");

  if (filteredOrder.length > 0) {
    return filteredOrder;
  }

  return DEFAULT_LLM_PROVIDER_ORDER.filter((provider) =>
    mistralChatEnabled || provider !== "mistral",
  );
}

function collectOpenRouterModels(values: unknown[], options: { appendFallbacks: boolean }): string[] {
  const models: string[] = [];
  const seen = new Set<string>();

  const addModel = (candidate: unknown) => {
    const model = normalizeOptionalText(candidate);
    if (!model || seen.has(model)) {
      return;
    }
    if (!isRecommendedOpenRouterAgentModel({ id: model })) {
      return;
    }
    seen.add(model);
    models.push(model);
  };

  const collect = (candidate: unknown): void => {
    if (candidate === null || candidate === undefined) {
      return;
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) collect(item);
      return;
    }

    if (typeof candidate === "object") {
      const objectCandidate = candidate as Record<string, unknown>;
      collect(objectCandidate.openrouterModels);
      collect(objectCandidate.openrouterModel);
      collect(objectCandidate.models);
      collect(objectCandidate.model);
      return;
    }

    const text = String(candidate).trim();
    if (!text) {
      return;
    }

    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        collect(JSON.parse(text));
        return;
      } catch {
        // Fall through to plain text parsing.
      }
    }

    for (const part of splitConfigListText(text)) {
      addModel(part);
    }
  };

  for (const value of values) {
    collect(value);
  }

  if (options.appendFallbacks) {
    for (const model of DEFAULT_OPENROUTER_FALLBACK_MODELS) {
      addModel(model);
    }
  }

  return models;
}

export function normalizeOpenRouterModels(...values: unknown[]): string[] {
  return collectOpenRouterModels(values, { appendFallbacks: true });
}

export function normalizeOpenRouterModelsStrict(...values: unknown[]): string[] {
  return collectOpenRouterModels(values, { appendFallbacks: false });
}

export interface OpenRouterModelAttemptParams {
  requestedModel?: unknown;
  openrouterModels?: unknown;
  openrouterModel?: unknown;
  strictPrimaryProvider?: boolean;
}

export function buildOpenRouterModelAttemptOrder(params: OpenRouterModelAttemptParams): string[] {
  const requestedModel = String(params.requestedModel ?? "").trim();
  const requestedModelId = requestedModel.includes("/") ? requestedModel : "";
  const primaryModel = requestedModelId || normalizeOptionalText(params.openrouterModel) || "";
  const strictConfiguredModels = normalizeOpenRouterModelsStrict(
    requestedModelId,
    params.openrouterModels,
    params.openrouterModel,
  );

  if (
    !params.strictPrimaryProvider ||
    isOpenRouterMistralNemoAttemptModel(primaryModel) ||
    strictConfiguredModels.some((model) => isOpenRouterMistralNemoAttemptModel(model))
  ) {
    const models: string[] = [];
    const seen = new Set<string>();
    const addModel = (model: string) => {
      if (!model || seen.has(model)) {
        return;
      }
      seen.add(model);
      models.push(model);
    };

    for (const model of strictConfiguredModels) {
      if (isOpenRouterMistralNemoFreeModel(model)) {
        addModel(model);
      }
    }

    addModel(OPENROUTER_MISTRAL_NEMO_MODEL);
    return models;
  }

  return strictConfiguredModels;
}

export function buildOpenRouterFreeModelAttemptOrder(params: OpenRouterModelAttemptParams): string[] {
  return buildOpenRouterModelAttemptOrder(params).filter((model) =>
    isOpenRouterMistralNemoFreeModel(model) ||
    (params.strictPrimaryProvider === true && isOpenRouterFreeFallbackModel(model)),
  );
}

export function buildOpenRouterPaidModelAttemptOrder(params: OpenRouterModelAttemptParams): string[] {
  return buildOpenRouterModelAttemptOrder(params).filter((model) =>
    isOpenRouterPaidAgentPrimaryModel(model),
  );
}

function isRecommendedNvidiaAgentModel(modelId: unknown): boolean {
  const model = String(modelId ?? "").trim().toLowerCase();
  if (!model.startsWith("nvidia/")) {
    return false;
  }
  return !OPENROUTER_NON_AGENT_MODEL_TERMS.some((term) => model.includes(term));
}

function collectNvidiaModels(values: unknown[], options: { appendFallbacks: boolean }): string[] {
  const models: string[] = [];
  const seen = new Set<string>();

  const addModel = (candidate: unknown) => {
    const model = normalizeOptionalText(candidate);
    if (!model || seen.has(model) || !isRecommendedNvidiaAgentModel(model)) {
      return;
    }
    seen.add(model);
    models.push(model);
  };

  const collect = (candidate: unknown): void => {
    if (candidate === null || candidate === undefined) {
      return;
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) collect(item);
      return;
    }

    if (typeof candidate === "object") {
      const objectCandidate = candidate as Record<string, unknown>;
      collect(objectCandidate.nvidiaModels);
      collect(objectCandidate.nvidiaModel);
      collect(objectCandidate.models);
      collect(objectCandidate.model);
      return;
    }

    const text = String(candidate).trim();
    if (!text) {
      return;
    }

    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        collect(JSON.parse(text));
        return;
      } catch {
        // Fall through to plain text parsing.
      }
    }

    for (const part of splitConfigListText(text)) {
      addModel(part);
    }
  };

  for (const value of values) {
    collect(value);
  }

  if (options.appendFallbacks) {
    for (const model of DEFAULT_NVIDIA_FALLBACK_MODELS) {
      addModel(model);
    }
  }

  return models;
}

export function normalizeNvidiaModels(...values: unknown[]): string[] {
  return collectNvidiaModels(values, { appendFallbacks: true });
}

export function normalizeNvidiaModelsStrict(...values: unknown[]): string[] {
  return collectNvidiaModels(values, { appendFallbacks: false });
}

export function normalizeAgentLLMConfig(value: unknown): AgentLlmConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { mode: "global" };
  }

  const candidate = value as Record<string, unknown>;
  const mode = candidate.mode === "custom" ? "custom" : "global";

  const mistralApiKeys = mergeMistralApiKeys(candidate.mistralApiKeys, candidate.mistralApiKey);
  const mistralChatEnabled = normalizeOptionalBoolean(
    candidate.mistralChatEnabled ??
      candidate.mistral_chat_enabled ??
      candidate.allowMistralChat ??
      candidate.allow_mistral_chat,
  );

  return {
    mode,
    provider: candidate.provider ? normalizeProvider(candidate.provider) : undefined,
    mistralApiKey: sanitizeApiKey(candidate.mistralApiKey) || undefined,
    mistralApiKeys: mistralApiKeys.length > 0 ? mistralApiKeys : undefined,
    mistralModel: normalizeOptionalText(candidate.mistralModel),
    mistralChatEnabled,
    groqApiKey: sanitizeApiKey(candidate.groqApiKey) || undefined,
    groqModel: normalizeOptionalText(candidate.groqModel),
    openrouterApiKey: sanitizeApiKey(candidate.openrouterApiKey) || undefined,
    openrouterModel: normalizeOptionalText(candidate.openrouterModel),
    openrouterModels: Array.isArray(candidate.openrouterModels)
      ? candidate.openrouterModels.map((model) => String(model || "").trim()).filter(Boolean)
      : undefined,
    openrouterProvider: normalizeOptionalText(candidate.openrouterProvider),
    nvidiaApiKey: sanitizeApiKey(candidate.nvidiaApiKey) || undefined,
    nvidiaModel: normalizeOptionalText(candidate.nvidiaModel),
    nvidiaModels: Array.isArray(candidate.nvidiaModels)
      ? candidate.nvidiaModels.map((model) => String(model || "").trim()).filter(Boolean)
      : undefined,
  };
}

function buildCacheKey(userId?: string): string {
  return userId ? `user:${userId}` : GLOBAL_CACHE_KEY;
}

function readCachedConfig(cacheKey: string): ResolvedLLMConfig | null {
  const cached = llmConfigCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp > LLM_CONFIG_CACHE_TTL_MS) {
    llmConfigCache.delete(cacheKey);
    return null;
  }

  return cached.config;
}

function writeCachedConfig(cacheKey: string, config: ResolvedLLMConfig): ResolvedLLMConfig {
  llmConfigCache.set(cacheKey, {
    config,
    timestamp: Date.now(),
  });

  return config;
}

async function loadGlobalLLMConfig(): Promise<ResolvedLLMConfig> {
  const rows = await db
    .select()
    .from(systemConfig)
    .where(inArray(systemConfig.chave, [...GLOBAL_LLM_KEYS]));

  const configMap = new Map(rows.map((row) => [row.chave, row.valor || ""]));

  const mistralApiKeys = mergeMistralApiKeys(
    configMap.get("mistral_api_keys"),
    configMap.get("mistral_api_key"),
  );
  const provider = normalizeProvider(configMap.get("llm_provider"));
  const mistralChatEnabled = normalizeSystemConfigBoolean(
    configMap.get("mistral_chat_enabled"),
    true,
  );
  const rawProviderOrder = normalizeLLMProviderOrder(configMap.get("llm_provider_order"), provider);
  const providerOrder = resolveChatProviderOrder(rawProviderOrder, mistralChatEnabled);
  const openrouterModels = normalizeOpenRouterModels(
    configMap.get("openrouter_models"),
    configMap.get("openrouter_model"),
  );
  const nvidiaModels = normalizeNvidiaModels(
    configMap.get("nvidia_models"),
    configMap.get("nvidia_model"),
  );

  return {
    provider: providerOrder[0] || provider,
    providerOrder,
    deepinfraApiKey: sanitizeApiKey(configMap.get("deepinfra_api_key")) || sanitizeApiKey(process.env.DEEPINFRA_API_KEY),
    deepinfraTranscriptionModel:
      normalizeOptionalText(configMap.get("deepinfra_transcription_model")) ||
      normalizeOptionalText(process.env.DEEPINFRA_TRANSCRIPTION_MODEL) ||
      normalizeOptionalText(process.env.AUDIO_TRANSCRIPTION_DEEPINFRA_MODEL) ||
      "mistralai/Voxtral-Mini-3B-2507",
    groqApiKey: sanitizeApiKey(configMap.get("groq_api_key")),
    groqModel: normalizeOptionalText(configMap.get("groq_model")) || "openai/gpt-oss-20b",
    openrouterApiKey: sanitizeApiKey(configMap.get("openrouter_api_key")),
    openrouterModel: openrouterModels[0] || DEFAULT_OPENROUTER_FALLBACK_MODELS[0],
    openrouterModels,
    openrouterProvider: normalizeOptionalText(configMap.get("openrouter_provider")) || "auto",
    mistralApiKey: mistralApiKeys[0] || "",
    mistralApiKeys,
    mistralModel: normalizeOptionalText(configMap.get("mistral_model")) || "mistral-medium-latest",
    mistralChatEnabled,
    nvidiaApiKey:
      sanitizeApiKey(configMap.get("nvidia_api_key")) ||
      sanitizeApiKey(configMap.get("status_nvidia_api_key")) ||
      sanitizeApiKey(configMap.get("blog_nvidia_api_key")),
    nvidiaModel:
      nvidiaModels[0] ||
      DEFAULT_NVIDIA_FALLBACK_MODELS[0],
    nvidiaModels,
    usesUserOverride: false,
  };
}

async function loadAgentLLMConfig(userId: string): Promise<AgentLlmConfig> {
  const row = await db.query.aiAgentConfig.findFirst({
    columns: { llmConfig: true },
    where: eq(aiAgentConfig.userId, userId),
  });

  return normalizeAgentLLMConfig(row?.llmConfig);
}

export function applyAgentLLMConfigOverride(
  baseConfig: ResolvedLLMConfig,
  overrideConfig: AgentLlmConfig,
  userId?: string,
): ResolvedLLMConfig {
  if (overrideConfig.mode !== "custom") {
    return {
      ...baseConfig,
      resolvedUserId: userId,
      usesUserOverride: false,
    };
  }

  const overrideMistralApiKeys = mergeMistralApiKeys(
    overrideConfig.mistralApiKeys,
    overrideConfig.mistralApiKey,
  );
  const mistralApiKeys = overrideMistralApiKeys.length > 0
    ? overrideMistralApiKeys
    : baseConfig.mistralApiKeys;
  const mistralChatEnabled = overrideConfig.mistralChatEnabled ?? baseConfig.mistralChatEnabled;

  const baseProviderOrder = Array.isArray(baseConfig.providerOrder) && baseConfig.providerOrder.length > 0
    ? baseConfig.providerOrder
    : normalizeLLMProviderOrder(baseConfig.provider);
  const rawProviderOrder = overrideConfig.provider
    ? normalizeLLMProviderOrder([overrideConfig.provider, ...baseProviderOrder])
    : baseProviderOrder;
  const providerOrder = resolveChatProviderOrder(rawProviderOrder, mistralChatEnabled);
  const hasOpenRouterOverride = Boolean(overrideConfig.openrouterModel || overrideConfig.openrouterModels?.length);
  const strictOpenRouterModels = hasOpenRouterOverride
    ? normalizeOpenRouterModelsStrict(overrideConfig.openrouterModels, overrideConfig.openrouterModel)
    : [];
  const hasNvidiaOverride = Boolean(overrideConfig.nvidiaModel || overrideConfig.nvidiaModels?.length);
  const strictNvidiaModels = hasNvidiaOverride
    ? normalizeNvidiaModelsStrict(overrideConfig.nvidiaModels, overrideConfig.nvidiaModel)
    : [];

  return {
    provider: providerOrder[0] || baseConfig.provider,
    providerOrder,
    deepinfraApiKey: baseConfig.deepinfraApiKey,
    deepinfraTranscriptionModel: baseConfig.deepinfraTranscriptionModel,
    groqApiKey: overrideConfig.groqApiKey || baseConfig.groqApiKey,
    groqModel: overrideConfig.groqModel || baseConfig.groqModel,
    openrouterApiKey: overrideConfig.openrouterApiKey || baseConfig.openrouterApiKey,
    openrouterModel: strictOpenRouterModels[0] || baseConfig.openrouterModel,
    openrouterModels: hasOpenRouterOverride && strictOpenRouterModels.length > 0
      ? strictOpenRouterModels
      : baseConfig.openrouterModels,
    openrouterProvider: overrideConfig.openrouterProvider || baseConfig.openrouterProvider,
    mistralApiKey: mistralApiKeys[0] || "",
    mistralApiKeys,
    mistralModel: overrideConfig.mistralModel || baseConfig.mistralModel,
    mistralChatEnabled,
    nvidiaApiKey: overrideConfig.nvidiaApiKey || baseConfig.nvidiaApiKey,
    nvidiaModel: strictNvidiaModels[0] || baseConfig.nvidiaModel,
    nvidiaModels: hasNvidiaOverride && strictNvidiaModels.length > 0
      ? strictNvidiaModels
      : baseConfig.nvidiaModels,
    resolvedUserId: userId,
    usesUserOverride: true,
  };
}

export async function getResolvedLLMConfig(userId?: string): Promise<ResolvedLLMConfig> {
  const effectiveUserId = normalizeOptionalText(userId) || getLLMUserContext();
  const cacheKey = buildCacheKey(effectiveUserId);
  const cached = readCachedConfig(cacheKey);
  if (cached) {
    return cached;
  }

  const globalConfig = await loadGlobalLLMConfig();
  if (!effectiveUserId) {
    return writeCachedConfig(cacheKey, globalConfig);
  }

  const overrideConfig = await loadAgentLLMConfig(effectiveUserId);
  const resolvedConfig = applyAgentLLMConfigOverride(globalConfig, overrideConfig, effectiveUserId);
  return writeCachedConfig(cacheKey, resolvedConfig);
}

export function invalidateResolvedLLMConfigCache(userId?: string): void {
  if (userId) {
    llmConfigCache.delete(buildCacheKey(userId));
    return;
  }

  llmConfigCache.clear();
}
