import { Mistral } from "@mistralai/mistralai";
import { getResolvedLLMConfig, mergeMistralApiKeys } from "./llmConfigResolver";

const AUDIO_TRANSCRIPTION_MAX_ATTEMPTS = 6;
const AUDIO_TRANSCRIPTION_INITIAL_DELAY_MS = 8_000;
const AUDIO_TRANSCRIPTION_MAX_DELAY_MS = 20_000;

export class AudioTranscriptionError extends Error {
  statusCode?: number;
  retryable: boolean;
  retryAfterMs?: number;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      retryable?: boolean;
      retryAfterMs?: number;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AudioTranscriptionError";
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAudioTranscriptionStatusCode(error: any): number | undefined {
  const status =
    error?.statusCode ??
    error?.status ??
    error?.response?.status ??
    error?.cause?.statusCode ??
    error?.cause?.status;

  return typeof status === "number" && Number.isFinite(status) ? status : undefined;
}

function parseRetryAfterHeader(rawValue: unknown): number | undefined {
  if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 0) {
    return rawValue * 1000;
  }

  if (typeof rawValue !== "string") {
    return undefined;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return undefined;
  }

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const diffMs = dateMs - Date.now();
    return diffMs > 0 ? diffMs : undefined;
  }

  return undefined;
}

function getRetryAfterMsFromError(error: any): number | undefined {
  if (typeof error?.retryAfterMs === "number" && Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0) {
    return error.retryAfterMs;
  }

  const candidates = [
    error?.retryAfter,
    error?.response?.headers?.get?.("retry-after"),
    error?.response?.headers?.["retry-after"],
    error?.headers?.get?.("retry-after"),
    error?.headers?.["retry-after"],
    error?.cause?.response?.headers?.get?.("retry-after"),
  ];

  for (const candidate of candidates) {
    const parsed = parseRetryAfterHeader(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function normalizeAudioTranscriptionErrorMessage(error: any): string {
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Falha ao transcrever o audio.";
}

export function isRetryableAudioTranscriptionError(error: unknown): boolean {
  if (error instanceof AudioTranscriptionError) {
    return error.retryable;
  }

  const statusCode = getAudioTranscriptionStatusCode(error);
  const message = normalizeAudioTranscriptionErrorMessage(error).toLowerCase();

  return (
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    statusCode === 520 ||
    statusCode === 521 ||
    statusCode === 522 ||
    statusCode === 523 ||
    statusCode === 524 ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("temporarily unavailable") ||
    message.includes("temporarily busy") ||
    message.includes("temporariamente indisponivel") ||
    message.includes("temporariamente ocupado") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection") ||
    message.includes("overloaded")
  );
}

export function getAudioTranscriptionRetryAfterMs(error: unknown): number | undefined {
  if (error instanceof AudioTranscriptionError) {
    return error.retryAfterMs;
  }

  return getRetryAfterMsFromError(error);
}

export function resolveAudioTranscriptionHttpStatus(error: unknown): number {
  if (error instanceof AudioTranscriptionError && typeof error.statusCode === "number") {
    return error.statusCode;
  }

  const statusCode = getAudioTranscriptionStatusCode(error);
  if (typeof statusCode === "number") {
    return statusCode;
  }

  return isRetryableAudioTranscriptionError(error) ? 503 : 500;
}

export function formatAudioTranscriptionErrorMessage(error: unknown): string {
  const rawMessage = normalizeAudioTranscriptionErrorMessage(error);
  if (isRetryableAudioTranscriptionError(error)) {
    return "O provedor de audio esta temporariamente ocupado. O sistema tentou novamente sozinho e ainda esta aguardando uma janela livre.";
  }

  return rawMessage || "Falha ao transcrever o audio.";
}

/**
 * Invalida o cache da API key (usar quando a key for atualizada)
 */
export function invalidateMistralKeyCache(): void {
  mistralApiKeyRotationIndex.clear();
  console.log(`[Mistral] Cache da API key invalidado`);
}

/**
 * Limpa a chave removendo espacos, quebras de linha e caracteres invisiveis
 */
function sanitizeApiKey(key: string): string {
  return key
    .trim()
    .replaceAll(" ", "")
    .replaceAll("\n", "")
    .replaceAll("\r", "")
    .replaceAll("\t", "");
}

export type MistralApiKeyCandidate = {
  apiKey: string;
  source: string;
};

export type MistralApiKeyValidationStatus = "valid" | "invalid" | "rate_limited" | "error" | "empty";

export type MistralApiKeyValidationResult = {
  index: number;
  status: MistralApiKeyValidationStatus;
  statusCode?: number;
  message: string;
  keyLength: number;
  retryAfterMs?: number;
  source?: string;
};

const mistralApiKeyRotationIndex = new Map<string, number>();

function buildMistralApiKeyValidationResult(
  options: {
    index: number;
    source?: string;
    keyLength: number;
    status: MistralApiKeyValidationStatus;
    statusCode?: number;
    message: string;
    retryAfterMs?: number;
  },
): MistralApiKeyValidationResult {
  return {
    index: options.index,
    status: options.status,
    statusCode: options.statusCode,
    message: options.message,
    keyLength: options.keyLength,
    retryAfterMs: options.retryAfterMs,
    source: options.source,
  };
}

export function classifyMistralApiKeyValidationError(
  error: unknown,
  options?: {
    index?: number;
    source?: string;
    keyLength?: number;
  },
): MistralApiKeyValidationResult {
  const statusCode = getAudioTranscriptionStatusCode(error);
  const retryAfterMs = getRetryAfterMsFromError(error);
  const message = normalizeAudioTranscriptionErrorMessage(error).toLowerCase();
  const index = options?.index ?? 0;
  const keyLength = options?.keyLength ?? 0;

  if (statusCode === 401 || statusCode === 403 || message.includes("invalid api key") || message.includes("invalid token")) {
    return buildMistralApiKeyValidationResult({
      index,
      source: options?.source,
      keyLength,
      status: "invalid",
      statusCode,
      message: "Chave invalida ou expirada.",
      retryAfterMs,
    });
  }

  if (statusCode === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return buildMistralApiKeyValidationResult({
      index,
      source: options?.source,
      keyLength,
      status: "rate_limited",
      statusCode,
      message: "Limite temporario atingido. A chave pode voltar a funcionar depois da janela de uso.",
      retryAfterMs,
    });
  }

  if (statusCode === 402) {
    return buildMistralApiKeyValidationResult({
      index,
      source: options?.source,
      keyLength,
      status: "error",
      statusCode,
      message: "A chave existe, mas a conta nao liberou uso agora.",
      retryAfterMs,
    });
  }

  return buildMistralApiKeyValidationResult({
    index,
    source: options?.source,
    keyLength,
    status: "error",
    statusCode,
    message: "Nao foi possivel verificar esta chave agora.",
    retryAfterMs,
  });
}

export async function validateMistralApiKey(
  rawKey: unknown,
  options?: {
    index?: number;
    source?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<MistralApiKeyValidationResult> {
  const apiKey = sanitizeApiKey(String(rawKey || ""));
  const index = options?.index ?? 0;
  const keyLength = apiKey.length;

  if (!apiKey) {
    return buildMistralApiKeyValidationResult({
      index,
      source: options?.source,
      keyLength,
      status: "empty",
      message: "Sem chave para testar.",
    });
  }

  if (keyLength < 32) {
    return buildMistralApiKeyValidationResult({
      index,
      source: options?.source,
      keyLength,
      status: "invalid",
      message: "Formato curto demais para uma chave Mistral.",
    });
  }

  const fetchImpl = options?.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return buildMistralApiKeyValidationResult({
      index,
      source: options?.source,
      keyLength,
      status: "error",
      message: "Verificacao indisponivel neste ambiente.",
    });
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 12_000);
    const response = await fetchImpl("https://api.mistral.ai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    const retryAfterMs = parseRetryAfterHeader(response.headers.get("retry-after"));
    if (response.ok) {
      return buildMistralApiKeyValidationResult({
        index,
        source: options?.source,
        keyLength,
        status: "valid",
        statusCode: response.status,
        message: "Chave valida.",
        retryAfterMs,
      });
    }

    const error: any = new Error(`Mistral validation failed with status ${response.status}`);
    error.statusCode = response.status;
    error.retryAfterMs = retryAfterMs;
    return classifyMistralApiKeyValidationError(error, {
      index,
      source: options?.source,
      keyLength,
    });
  } catch (error) {
    return classifyMistralApiKeyValidationError(error, {
      index,
      source: options?.source,
      keyLength,
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function addMistralApiKeyCandidate(
  candidates: MistralApiKeyCandidate[],
  source: string,
  rawKey: unknown,
): void {
  const apiKey = sanitizeApiKey(String(rawKey || ""));
  if (apiKey.length < 32) {
    return;
  }

  if (candidates.some((candidate) => candidate.apiKey === apiKey)) {
    return;
  }

  candidates.push({ apiKey, source });
}

function addMistralApiKeyCandidates(
  candidates: MistralApiKeyCandidate[],
  source: string,
  rawKeys: unknown,
): void {
  const keys = mergeMistralApiKeys(rawKeys);
  for (let index = 0; index < keys.length; index++) {
    addMistralApiKeyCandidate(candidates, `${source} #${index + 1}`, keys[index]);
  }
}

function rotateMistralApiKeyCandidates(
  candidates: MistralApiKeyCandidate[],
  scope: string,
): MistralApiKeyCandidate[] {
  if (candidates.length <= 1) {
    return candidates;
  }

  const currentIndex = mistralApiKeyRotationIndex.get(scope) || 0;
  const normalizedIndex = currentIndex % candidates.length;
  mistralApiKeyRotationIndex.set(scope, (normalizedIndex + 1) % candidates.length);

  return [
    ...candidates.slice(normalizedIndex),
    ...candidates.slice(0, normalizedIndex),
  ];
}

export async function resolveApiKeyCandidates(userId?: string): Promise<MistralApiKeyCandidate[]> {
  if (globalMockClient) {
    return [{ apiKey: "mock-key", source: "MOCK" }];
  }

  const config = await getResolvedLLMConfig(userId);
  const candidates: MistralApiKeyCandidate[] = [];
  const envKeys = mergeMistralApiKeys(process.env.MISTRAL_API_KEYS, process.env.MISTRAL_API_KEY);
  const configKeys = mergeMistralApiKeys(config.mistralApiKeys, config.mistralApiKey);
  const configSource = config.usesUserOverride
    ? `USER ${config.resolvedUserId}`
    : "GLOBAL CONFIG";

  if (config.usesUserOverride) {
    addMistralApiKeyCandidates(candidates, configSource, configKeys);
    addMistralApiKeyCandidates(candidates, "ENVIRONMENT", envKeys);
  } else {
    addMistralApiKeyCandidates(candidates, configSource, configKeys);
    addMistralApiKeyCandidates(candidates, "ENVIRONMENT", envKeys);
  }

  const rotationScope = config.usesUserOverride && config.resolvedUserId
    ? `user:${config.resolvedUserId}`
    : "global";
  return rotateMistralApiKeyCandidates(candidates, rotationScope);
}

export async function resolveApiKey(userId?: string): Promise<string> {
  const candidates = await resolveApiKeyCandidates(userId);
  const selected = candidates[0];
  if (selected) {
    console.log(`[Mistral] Using API key from ${selected.source} (${selected.apiKey.length} chars)`);
    return selected.apiKey;
  }

  // Allow empty key for testing if mock is set
  if (globalMockClient) return "mock-key";
  
  throw new Error("Mistral API Key not configured or invalid (must be at least 32 chars)");
}

async function resolveOpenRouterKey(userId?: string): Promise<string | null> {
  const config = await getResolvedLLMConfig(userId);
  const fromConfig = sanitizeApiKey(config.openrouterApiKey);
  if (fromConfig.length > 20) {
    console.log(
      `[OpenRouter] Using API key from ${config.usesUserOverride ? `USER ${config.resolvedUserId}` : "GLOBAL CONFIG"} (${fromConfig.length} chars)`,
    );
    return fromConfig;
  }

  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 20) {
    const envKey = sanitizeApiKey(process.env.OPENROUTER_API_KEY);
    console.log(`[OpenRouter] Using API key from ENVIRONMENT (${envKey.length} chars)`);
    return envKey;
  }

  return null;
}

const DEFAULT_NVIDIA_VISION_MODELS = [
  "nvidia/nemotron-nano-12b-v2-vl",
  "nvidia/llama-3.2-11b-vision-instruct",
  "nvidia/llama-3.2-90b-vision-instruct",
] as const;

const DEFAULT_OPENROUTER_VISION_MODELS = [
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "openrouter/free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "mistralai/mistral-small-3.2-24b-instruct",
  "qwen/qwen3-vl-8b-instruct",
] as const;

const DEFAULT_MISTRAL_DIRECT_VISION_MODELS = [
  "ministral-14b-latest",
  "pixtral-12b-2409",
] as const;

function splitVisionModelList(rawValue?: string | null): string[] {
  return String(rawValue || "")
    .split(/[,\n;]/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function uniqueVisionModelOrder(...groups: Array<readonly string[] | string[]>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const group of groups) {
    for (const model of group) {
      const normalized = String(model || "").trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      ordered.push(normalized);
    }
  }
  return ordered;
}

function getVisionRequestTimeoutMs(): number {
  const parsed = Number(process.env.IMAGE_VISION_PROVIDER_TIMEOUT_MS || "");
  return Number.isFinite(parsed) && parsed >= 5_000 ? Math.min(parsed, 90_000) : 35_000;
}

function extractChatContentText(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed ? trimmed : null;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        if (part && typeof part === "object" && "content" in part && typeof part.content === "string") {
          return part.content;
        }
        return "";
      })
      .join("\n")
      .trim();
    return text || null;
  }

  return null;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getVisionRequestTimeoutMs());
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeImageWithNvidia(imageUrl: string, prompt: string, userId?: string): Promise<string | null> {
  const config = await getResolvedLLMConfig(userId);
  const apiKey =
    sanitizeApiKey(config.nvidiaApiKey) ||
    sanitizeApiKey(process.env.NVIDIA_API_KEY) ||
    sanitizeApiKey(process.env.NVIDIA_NIM_API_KEY);

  if (!apiKey || apiKey.length <= 20) {
    return null;
  }

  const candidateModels = uniqueVisionModelOrder(
    splitVisionModelList(process.env.NVIDIA_VISION_MODELS || process.env.NVIDIA_IMAGE_ANALYSIS_MODELS),
    DEFAULT_NVIDIA_VISION_MODELS,
  );

  for (const model of candidateModels) {
    try {
      console.log(`[NVIDIA Vision] Trying image analysis with model: ${model}`);
      const response = await fetchJsonWithTimeout("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          temperature: 0.0,
          max_tokens: 300,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[NVIDIA Vision] Image analysis failed on ${model}: ${response.status} - ${errorText}`);
        if (response.status === 401 || response.status === 403) {
          return null;
        }
        continue;
      }

      const data = await response.json();
      const content = extractChatContentText(data?.choices?.[0]?.message?.content);
      if (content) {
        console.log(`[NVIDIA Vision] Image analysis succeeded with model: ${model}`);
        return content;
      }
    } catch (error) {
      console.warn(`[NVIDIA Vision] Image analysis exception on ${model}:`, formatProviderLogError(error));
    }
  }

  return null;
}

async function analyzeImageWithOpenRouter(imageUrl: string, prompt: string, userId?: string): Promise<string | null> {
  const apiKey = await resolveOpenRouterKey(userId);
  if (!apiKey) {
    return null;
  }

  const candidateModels = uniqueVisionModelOrder(
    splitVisionModelList(process.env.OPENROUTER_VISION_MODELS || process.env.OPENROUTER_IMAGE_ANALYSIS_MODELS),
    DEFAULT_OPENROUTER_VISION_MODELS,
  );

  for (const model of candidateModels) {
    try {
      console.log(`[OpenRouter] Trying vision fallback with model: ${model}`);

      const response = await fetchJsonWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://agentezap.online",
          "X-Title": "AgenteZap",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
          temperature: 0.0,
          max_tokens: 300,
          provider: {
            sort: "price",
            allow_fallbacks: true,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenRouter] Vision fallback failed on ${model}: ${response.status} - ${errorText}`);
        continue;
      }

      const data = await response.json();
      const content = extractChatContentText(data?.choices?.[0]?.message?.content);
      if (content) {
        console.log(`[OpenRouter] Vision fallback succeeded with model: ${model}`);
        return content;
      }
    } catch (error) {
      console.error(`[OpenRouter] Vision fallback exception on ${model}:`, formatProviderLogError(error));
    }
  }

  return null;
}

async function analyzeImageWithDirectMistral(imageUrl: string, prompt: string, userId?: string): Promise<string | null> {
  void imageUrl;
  void prompt;
  void userId;
  return null;

  const candidateModels = uniqueVisionModelOrder(
    splitVisionModelList(process.env.MISTRAL_VISION_MODELS || process.env.MISTRAL_IMAGE_ANALYSIS_MODELS),
    DEFAULT_MISTRAL_DIRECT_VISION_MODELS,
  );

  let lastError: unknown;
  for (const model of candidateModels) {
    try {
      console.log(`[Mistral Vision] Trying direct image analysis with model: ${model}`);
      const response = await withMistralClientFallback((mistral) =>
        mistral["chat"]["complete"]({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", imageUrl },
              ],
            },
          ],
          maxTokens: 300,
          temperature: 0.0,
        }),
        { userId, operationName: "image analysis", allowWhenChatDisabled: true },
      );

      const content = extractChatContentText(response?.choices?.[0]?.message?.content);
      if (content) {
        console.log(`[Mistral Vision] Direct image analysis succeeded with model: ${model}`);
        return content;
      }
    } catch (error) {
      lastError = error;
      console.warn(`[Mistral Vision] Direct image analysis failed on ${model}:`, formatProviderLogError(error));
    }
  }

  if (lastError) {
    console.error("[Mistral Vision] Direct image analysis failed after all models:", formatProviderLogError(lastError));
  }
  return null;
}

async function analyzeImageWithVisionFallbacks(imageUrl: string, prompt: string, userId?: string): Promise<string | null> {
  const nvidiaResult = await analyzeImageWithNvidia(imageUrl, prompt, userId);
  if (nvidiaResult) return nvidiaResult;

  const openRouterResult = await analyzeImageWithOpenRouter(imageUrl, prompt, userId);
  if (openRouterResult) return openRouterResult;

  return await analyzeImageWithDirectMistral(imageUrl, prompt, userId);
}

let globalMockClient: any = null;

export function setMockMistralClient(mock: any) {
  globalMockClient = mock;
}

export async function getMistralClient(
  userId?: string,
  options?: { allowWhenChatDisabled?: boolean },
): Promise<Mistral> {
  if (globalMockClient) return globalMockClient as unknown as Mistral;
  if (options?.allowWhenChatDisabled !== true) {
    const llmConfig = await getResolvedLLMConfig(userId);
    if (llmConfig.mistralChatEnabled === false) {
      throw new Error("Mistral reservado para transcricao de audio e leitura de imagem");
    }
  }
  const apiKey = await resolveApiKey(userId);
  return new Mistral({ apiKey });
}

function createMistralClientFromCandidate(candidate: MistralApiKeyCandidate): Mistral {
  if (globalMockClient) {
    return globalMockClient as unknown as Mistral;
  }

  console.log(`[Mistral] Using API key from ${candidate.source} (${candidate.apiKey.length} chars)`);
  return new Mistral({ apiKey: candidate.apiKey });
}

export function isMistralKeyFallbackError(error: unknown): boolean {
  const statusCode = getAudioTranscriptionStatusCode(error);
  if (
    statusCode === 401 ||
    statusCode === 402 ||
    statusCode === 403 ||
    statusCode === 408 ||
    statusCode === 409 ||
    statusCode === 425 ||
    statusCode === 429 ||
    (typeof statusCode === "number" && statusCode >= 500)
  ) {
    return true;
  }

  const message = normalizeAudioTranscriptionErrorMessage(error).toLowerCase();
  return (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("invalid api key") ||
    message.includes("invalid token") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("temporarily unavailable") ||
    message.includes("temporarily busy") ||
    message.includes("temporariamente indisponivel") ||
    message.includes("temporariamente ocupado") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("abort") ||
    message.includes("connection") ||
    message.includes("overloaded")
  );
}

export async function withMistralClientFallback<T>(
  operation: (
    client: Mistral,
    candidate: MistralApiKeyCandidate,
    candidateIndex: number,
  ) => Promise<T>,
  options?: {
    userId?: string;
    operationName?: string;
    allowWhenChatDisabled?: boolean;
  },
): Promise<T> {
  if (options?.allowWhenChatDisabled !== true) {
    const llmConfig = await getResolvedLLMConfig(options?.userId);
    if (llmConfig.mistralChatEnabled === false) {
      throw new Error("Mistral reservado para transcricao de audio e leitura de imagem");
    }
  }

  const apiKeyCandidates = await resolveApiKeyCandidates(options?.userId);
  if (apiKeyCandidates.length === 0) {
    throw new Error("Mistral API Key not configured or invalid (must be at least 32 chars)");
  }

  let lastError: unknown;
  for (let candidateIndex = 0; candidateIndex < apiKeyCandidates.length; candidateIndex++) {
    const candidate = apiKeyCandidates[candidateIndex];
    try {
      const client = createMistralClientFromCandidate(candidate);
      return await operation(client, candidate, candidateIndex);
    } catch (error) {
      lastError = error;
      const hasNextCandidate = candidateIndex < apiKeyCandidates.length - 1;
      if (hasNextCandidate && isMistralKeyFallbackError(error)) {
        console.warn(
          `[Mistral] ${options?.operationName || "request"} failed for ${candidate.source}; trying next configured key.`,
          formatProviderLogError(error),
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Mistral request failed with all configured keys");
}

function formatAudioTranscriptionLogError(error: AudioTranscriptionError): Record<string, unknown> {
  return {
    message: error.message,
    statusCode: error.statusCode,
    retryable: error.retryable,
    retryAfterMs: error.retryAfterMs,
  };
}

function formatProviderLogError(error: unknown): Record<string, unknown> {
  return {
    message: normalizeAudioTranscriptionErrorMessage(error),
    statusCode: getAudioTranscriptionStatusCode(error),
    retryable: isRetryableAudioTranscriptionError(error),
    retryAfterMs: getRetryAfterMsFromError(error),
  };
}

export async function transcribeAudioWithMistral(
  audioBuffer: Uint8Array,
  options?: {
    fileName?: string;
    language?: string;
    model?: string;
    userId?: string;
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    throwOnFailure?: boolean;
  },
): Promise<string | null> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? AUDIO_TRANSCRIPTION_MAX_ATTEMPTS);
  const initialDelayMs = Math.max(0, options?.initialDelayMs ?? AUDIO_TRANSCRIPTION_INITIAL_DELAY_MS);
  const maxDelayMs = Math.max(initialDelayMs, options?.maxDelayMs ?? AUDIO_TRANSCRIPTION_MAX_DELAY_MS);
  const model =
    options?.model ||
    process.env.MISTRAL_TRANSCRIPTION_MODEL ||
    "voxtral-mini-latest";
  const apiKeyCandidates = await resolveApiKeyCandidates(options?.userId);
  if (apiKeyCandidates.length === 0) {
    const error = new AudioTranscriptionError(
      "Mistral API Key not configured or invalid (must be at least 32 chars)",
      { retryable: false },
    );
    if (options?.throwOnFailure) {
      throw error;
    }
    console.error("[Mistral] Audio transcription failed before request:", formatAudioTranscriptionLogError(error));
    return null;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (let candidateIndex = 0; candidateIndex < apiKeyCandidates.length; candidateIndex++) {
      const candidate = apiKeyCandidates[candidateIndex];

      try {
        const mistral = createMistralClientFromCandidate(candidate);

        const response = await mistral.audio.transcriptions.complete({
          model,
          file: {
            fileName: options?.fileName || "audio.ogg",
            content: audioBuffer,
          },
          language: options?.language ?? undefined,
        });

        if (!response || typeof response.text !== "string") {
          return null;
        }

        const text = response.text.trim();
        return text.length > 0 ? text : null;
      } catch (error) {
        const statusCode = getAudioTranscriptionStatusCode(error);
        const shouldTryNextCandidate =
          candidateIndex < apiKeyCandidates.length - 1 &&
          isMistralKeyFallbackError(error);
        if (shouldTryNextCandidate) {
          console.warn(
            `[Mistral] Audio transcription failed for ${candidate.source}; trying next configured key.`,
            formatProviderLogError(error),
          );
          continue;
        }

        const retryAfterMs = getRetryAfterMsFromError(error);
        const retryable = isRetryableAudioTranscriptionError(error);
        const wrappedError = new AudioTranscriptionError(
          normalizeAudioTranscriptionErrorMessage(error),
          {
            statusCode,
            retryable,
            retryAfterMs,
            cause: error,
          },
        );

        if (!retryable || attempt >= maxAttempts) {
          console.error(
            `[Mistral] Audio transcription failed after ${attempt}/${maxAttempts} attempt(s):`,
            formatAudioTranscriptionLogError(wrappedError),
          );
          if (options?.throwOnFailure) {
            throw wrappedError;
          }
          return null;
        }

        const backoffMs = Math.min(initialDelayMs * attempt, maxDelayMs);
        const delayMs = Math.max(retryAfterMs ?? 0, backoffMs);
        console.warn(
          `[Mistral] Audio transcription temporary failure (${attempt}/${maxAttempts}); retrying in ${delayMs}ms.`,
        );
        await sleep(delayMs);
      }
    }
  }

  return null;
}

export async function analyzeImageWithMistral(
  imageUrl: string,
  prompt: string = "Descreva esta imagem detalhadamente para que eu possa entender o que e (ex: cardapio, produto, tabela de precos, etc).",
  userId?: string,
): Promise<string | null> {
  if (globalMockClient && globalMockClient.analyzeImageWithMistral) {
    return globalMockClient.analyzeImageWithMistral(imageUrl);
  }

  return await analyzeImageWithVisionFallbacks(imageUrl, prompt, userId);
}

// Retorna resumo curto (uma etiqueta) e descricao detalhada para uso na conversa com o admin
export async function analyzeImageForAdmin(
  imageUrl: string,
  userId?: string,
): Promise<{ summary: string; description: string } | null> {
  try {
    if (globalMockClient && globalMockClient.analyzeImageForAdmin) {
      return globalMockClient.analyzeImageForAdmin(imageUrl);
    }

    const userPrompt = `Por favor, analise a imagem fornecida e responda em JSON com duas chaves: ` +
      `"summary" (uma etiqueta curta, 2-4 palavras, sem pontuacao, ex: cardapio, foto_produto, logo) e ` +
      `"description" (uma frase curta descrevendo o conteudo, em portugues). Responda apenas o JSON.`;

    const raw = await analyzeImageWithVisionFallbacks(imageUrl, userPrompt, userId);
    if (!raw || typeof raw !== "string") return null;

    const jsonTextMatch = raw.match(/\{[\s\S]*\}/);
    const jsonText = jsonTextMatch ? jsonTextMatch[0] : raw;
    try {
      const parsed = JSON.parse(jsonText);
      return {
        summary: String(parsed.summary || parsed.tag || "").trim(),
        description: String(parsed.description || parsed.desc || "").trim(),
      };
    } catch {
      const description = raw.trim();
      const summary = description.split(/[.,;\n]/)[0].split(" ").slice(0, 3).join("_").toLowerCase();
      return { summary, description };
    }
  } catch (error) {
    console.error("[Vision] Admin image analysis failed:", formatProviderLogError(error));
    return null;
  }
}

// ==================== MEDIA CLASSIFICATION WITH AI ====================

/**
 * ðŸŽ¯ CLASSIFICAÃ‡ÃƒO DE MÃDIA COM IA
 * 
 * Esta funÃ§Ã£o usa uma chamada de IA DEDICADA para analisar:
 * 1. A mensagem atual do cliente
 * 2. O histÃ³rico recente da conversa
 * 3. A biblioteca de mÃ­dias disponÃ­veis (com descriÃ§Ãµes whenToUse)
 * 
 * E decide de forma INTELIGENTE se deve enviar mÃ­dia e qual.
 * 
 * FUNCIONA PARA QUALQUER CONTA - independente de keywords hardcoded!
 */

interface MediaClassificationInput {
  clientMessage: string;
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>;
  mediaLibrary: Array<{ 
    name: string; 
    type: string; 
    whenToUse: string | null;
    isActive?: boolean;
  }>;
  sentMedias?: string[];
}

interface MediaClassificationResult {
  shouldSend: boolean;
  mediaName: string | null;
  confidence: number; // 0-100
  reason: string;
}

export async function classifyMediaWithAI(
  input: MediaClassificationInput
): Promise<MediaClassificationResult> {
  void input;
  return { shouldSend: false, mediaName: null, confidence: 0, reason: "media_classifier_requires_codex_contract" };
}
// ==================== TEXT GENERATION ====================

/**
 * Gera texto usando a API Mistral
 * Ãštil para geraÃ§Ã£o de mensagens, respostas rÃ¡pidas, etc.
 */
export async function generateWithMistral(
  systemPrompt: string,
  userMessage: string,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  void systemPrompt;
  void userMessage;
  void options;
  throw new Error("mistral_text_generation_requires_codex_contract");
}

