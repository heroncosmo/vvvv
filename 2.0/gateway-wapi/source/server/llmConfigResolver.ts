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
  "groq_api_key",
  "groq_model",
  "openrouter_api_key",
  "openrouter_model",
  "openrouter_provider",
  "mistral_api_key",
  "mistral_model",
  "nvidia_api_key",
  "nvidia_model",
] as const;

export interface ResolvedLLMConfig {
  provider: string;
  groqApiKey: string;
  groqModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterProvider: string;
  mistralApiKey: string;
  mistralModel: string;
  nvidiaApiKey: string;
  nvidiaModel: string;
  resolvedUserId?: string;
  usesUserOverride: boolean;
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

function sanitizeApiKey(value: unknown): string {
  const raw = String(value ?? "");
  return raw.replaceAll(" ", "").replaceAll("\n", "").replaceAll("\r", "").replaceAll("\t", "");
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

export function normalizeAgentLLMConfig(value: unknown): AgentLlmConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { mode: "global" };
  }

  const candidate = value as Record<string, unknown>;
  const mode = candidate.mode === "custom" ? "custom" : "global";

  return {
    mode,
    provider: candidate.provider ? normalizeProvider(candidate.provider) : undefined,
    mistralApiKey: sanitizeApiKey(candidate.mistralApiKey) || undefined,
    mistralModel: normalizeOptionalText(candidate.mistralModel),
    groqApiKey: sanitizeApiKey(candidate.groqApiKey) || undefined,
    groqModel: normalizeOptionalText(candidate.groqModel),
    openrouterApiKey: sanitizeApiKey(candidate.openrouterApiKey) || undefined,
    openrouterModel: normalizeOptionalText(candidate.openrouterModel),
    openrouterProvider: normalizeOptionalText(candidate.openrouterProvider),
    nvidiaApiKey: sanitizeApiKey(candidate.nvidiaApiKey) || undefined,
    nvidiaModel: normalizeOptionalText(candidate.nvidiaModel),
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

  return {
    provider: normalizeProvider(configMap.get("llm_provider")),
    groqApiKey: sanitizeApiKey(configMap.get("groq_api_key")),
    groqModel: normalizeOptionalText(configMap.get("groq_model")) || "openai/gpt-oss-20b",
    openrouterApiKey: sanitizeApiKey(configMap.get("openrouter_api_key")),
    openrouterModel:
      normalizeOptionalText(configMap.get("openrouter_model")) || "google/gemma-3-4b-it:free",
    openrouterProvider: normalizeOptionalText(configMap.get("openrouter_provider")) || "auto",
    mistralApiKey: sanitizeApiKey(configMap.get("mistral_api_key")),
    mistralModel: normalizeOptionalText(configMap.get("mistral_model")) || "mistral-medium-latest",
    nvidiaApiKey: sanitizeApiKey(configMap.get("nvidia_api_key")),
    nvidiaModel:
      normalizeOptionalText(configMap.get("nvidia_model")) ||
      "nvidia/llama-3.3-nemotron-super-49b-v1",
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

  return {
    provider: overrideConfig.provider || baseConfig.provider,
    groqApiKey: overrideConfig.groqApiKey || baseConfig.groqApiKey,
    groqModel: overrideConfig.groqModel || baseConfig.groqModel,
    openrouterApiKey: overrideConfig.openrouterApiKey || baseConfig.openrouterApiKey,
    openrouterModel: overrideConfig.openrouterModel || baseConfig.openrouterModel,
    openrouterProvider: overrideConfig.openrouterProvider || baseConfig.openrouterProvider,
    mistralApiKey: overrideConfig.mistralApiKey || baseConfig.mistralApiKey,
    mistralModel: overrideConfig.mistralModel || baseConfig.mistralModel,
    nvidiaApiKey: overrideConfig.nvidiaApiKey || baseConfig.nvidiaApiKey,
    nvidiaModel: overrideConfig.nvidiaModel || baseConfig.nvidiaModel,
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
