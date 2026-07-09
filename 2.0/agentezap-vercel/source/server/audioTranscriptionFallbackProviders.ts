export interface AudioFallbackResolvedLLMConfig {
  deepinfraApiKey: string;
  deepinfraTranscriptionModel?: string;
  deepinfraTranscriptionModels?: string[];
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterModels?: string[];
  nvidiaApiKey: string;
  nvidiaModel: string;
}

export const DEFAULT_DEEPINFRA_STT_MODELS = [
  "mistralai/Voxtral-Mini-3B-2507",
] as const;

export const DEFAULT_OPENROUTER_FREE_AUDIO_MODELS = [
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
] as const;

export const DEFAULT_OPENROUTER_STT_MODELS = [
  "nvidia/parakeet-tdt-0.6b-v3",
  "openai/whisper-large-v3",
  "mistralai/voxtral-mini-transcribe",
] as const;

export const DEFAULT_NVIDIA_FREE_AUDIO_MODELS = [
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
] as const;

const AUDIO_MODEL_HINTS = [
  "audio",
  "voxtral",
  "gemini",
  "omni",
  "gpt-audio",
  "parakeet",
  "canary",
  "whisper",
  "speech",
  "asr",
] as const;

const OPENROUTER_STT_MODEL_HINTS = [
  "transcribe",
  "transcription",
  "stt",
  "voxtral",
  "whisper",
] as const;

export interface AudioFallbackTranscriptionOptions {
  fileName?: string;
  mimeType?: string;
  userId?: string;
  language?: string;
  config?: AudioFallbackResolvedLLMConfig;
  maxAttemptsPerModel?: number;
  deepinfraTimeoutMs?: number;
  stopDeepInfraProviderAfterFirstFailure?: boolean;
  allowConversationalAudioFallback?: boolean;
  providers?: AudioFallbackProvider[];
}

export type AudioFallbackProvider = "deepinfra" | "openrouter_stt" | "openrouter_audio" | "nvidia_audio";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function inferAudioFormat(fileName?: string, mimeType?: string): "wav" | "mp3" | "m4a" | "webm" | "ogg" {
  const combined = `${fileName ?? ""} ${mimeType ?? ""}`.toLowerCase();
  if (combined.includes("wav")) return "wav";
  if (combined.includes("mpeg") || combined.includes("mp3")) return "mp3";
  if (combined.includes("mp4") || combined.includes("m4a")) return "m4a";
  if (combined.includes("webm")) return "webm";
  return "ogg";
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function isLikelyAudioModel(modelId: unknown): boolean {
  const model = normalizeText(modelId).toLowerCase();
  if (!model) return false;
  return AUDIO_MODEL_HINTS.some((hint) => model.includes(hint));
}

export const isLikelyOpenRouterAudioModel = isLikelyAudioModel;

export function isLikelyOpenRouterSttModel(modelId: unknown): boolean {
  const model = normalizeText(modelId).toLowerCase();
  if (!model) return false;
  return OPENROUTER_STT_MODEL_HINTS.some((hint) => model.includes(hint));
}

export function resolveOpenRouterSttModels(config: Pick<AudioFallbackResolvedLLMConfig, "openrouterModel" | "openrouterModels">): string[] {
  const configured = unique([
    ...(config.openrouterModels ?? []),
    config.openrouterModel,
  ]).filter(isLikelyOpenRouterSttModel);

  return unique([
    ...DEFAULT_OPENROUTER_STT_MODELS,
    ...configured,
  ]);
}

export function resolveOpenRouterAudioModels(config: Pick<AudioFallbackResolvedLLMConfig, "openrouterModel" | "openrouterModels">): string[] {
  const configured = unique([
    ...(config.openrouterModels ?? []),
    config.openrouterModel,
  ]).filter(isLikelyOpenRouterAudioModel);

  return unique([
    ...DEFAULT_OPENROUTER_FREE_AUDIO_MODELS,
    ...configured,
  ]);
}

export function resolveNvidiaAudioModels(config: Pick<AudioFallbackResolvedLLMConfig, "nvidiaModel">): string[] {
  const configured = unique([config.nvidiaModel]).filter(isLikelyAudioModel);
  return unique([
    ...DEFAULT_NVIDIA_FREE_AUDIO_MODELS,
    ...configured,
  ]);
}

export function resolveDeepInfraSttModels(
  config: Pick<AudioFallbackResolvedLLMConfig, "deepinfraTranscriptionModel" | "deepinfraTranscriptionModels">,
): string[] {
  return unique([
    config.deepinfraTranscriptionModel || process.env.DEEPINFRA_TRANSCRIPTION_MODEL || process.env.AUDIO_TRANSCRIPTION_DEEPINFRA_MODEL || "",
    ...(config.deepinfraTranscriptionModels ?? []),
    ...DEFAULT_DEEPINFRA_STT_MODELS,
  ]);
}

function extractOpenAICompatibleText(data: any): string | null {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    const text = content.trim();
    return text.length > 0 ? text : null;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        if (typeof part?.content === "string") return part.content;
        return "";
      })
      .join("\n")
      .trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

function buildAudioMessages(audioBuffer: Uint8Array, options: AudioFallbackTranscriptionOptions) {
  const base64Audio = Buffer.from(audioBuffer).toString("base64");
  const format = inferAudioFormat(options.fileName, options.mimeType);
  const languageLine = options.language ? `Idioma esperado: ${options.language}.` : "Idioma esperado: portugues do Brasil, salvo se o audio estiver em outro idioma.";

  return [
    {
      role: "system",
      content:
        "Voce e um transcritor literal de audio de WhatsApp. Responda somente com a transcricao, sem comentarios, sem resumo e sem inventar trechos inaudiveis.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Transcreva literalmente este audio para texto. ${languageLine}`,
        },
        {
          type: "input_audio",
          input_audio: {
            data: base64Audio,
            format,
          },
        },
      ],
    },
  ];
}

function extractOpenRouterSttText(data: any): string | null {
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  return text.length > 0 ? text : null;
}

const extractDeepInfraSttText = extractOpenRouterSttText;

async function callDeepInfraSttModel(params: {
  apiKey: string;
  model: string;
  audioBuffer: Uint8Array;
  options: AudioFallbackTranscriptionOptions;
}): Promise<string | null> {
  const timeoutMs = Math.max(1_000, params.options.deepinfraTimeoutMs ?? parseNumberEnv(
    process.env.AUDIO_TRANSCRIPTION_DEEPINFRA_TIMEOUT_MS ?? process.env.AUDIO_TRANSCRIPTION_REMOTE_TIMEOUT_MS,
    30_000,
  ));
  const fileName = params.options.fileName || `audio.${inferAudioFormat(params.options.fileName, params.options.mimeType)}`;
  const mimeType = params.options.mimeType || "audio/ogg";
  const form = new FormData();
  form.append("model", params.model);
  form.append("file", new Blob([Buffer.from(params.audioBuffer)], { type: mimeType }), fileName);
  form.append("response_format", "json");
  form.append("temperature", "0");
  if (params.options.language) {
    form.append("language", params.options.language);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch("https://api.deepinfra.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError" || controller.signal.aborted) {
      const timeoutError = new Error(`DeepInfra STT timed out after ${timeoutMs}ms`) as any;
      timeoutError.code = "DEEPINFRA_STT_TIMEOUT";
      timeoutError.timeout = true;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const error = new Error(`DeepInfra STT failed: ${response.status} ${errorText.slice(0, 400)}`) as any;
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return extractDeepInfraSttText(data);
}

function isTerminalDeepInfraProviderError(error: any): boolean {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  if (status === 401 || status === 402 || status === 403) return true;
  return error?.code === "DEEPINFRA_STT_TIMEOUT" || error?.timeout === true || error?.name === "AbortError";
}

async function callOpenRouterSttModel(params: {
  apiKey: string;
  model: string;
  audioBuffer: Uint8Array;
  options: AudioFallbackTranscriptionOptions;
}): Promise<string | null> {
  const format = inferAudioFormat(params.options.fileName, params.options.mimeType);
  const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://agentezap.online",
      "X-Title": "AgenteZap Audio Transcription",
    },
    body: JSON.stringify({
      model: params.model,
      input_audio: {
        data: Buffer.from(params.audioBuffer).toString("base64"),
        format,
      },
      language: params.options.language,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const error = new Error(`OpenRouter STT failed: ${response.status} ${errorText.slice(0, 400)}`) as any;
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return extractOpenRouterSttText(data);
}

async function callOpenAICompatibleAudioModel(params: {
  endpoint: string;
  apiKey: string;
  model: string;
  audioBuffer: Uint8Array;
  options: AudioFallbackTranscriptionOptions;
  headers?: Record<string, string>;
}): Promise<string | null> {
  const response = await fetch(params.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      ...params.headers,
    },
    body: JSON.stringify({
      model: params.model,
      messages: buildAudioMessages(params.audioBuffer, params.options),
      temperature: 0,
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const error = new Error(`Audio transcription failed: ${response.status} ${errorText.slice(0, 400)}`) as any;
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return extractOpenAICompatibleText(data);
}

async function tryOpenRouterSttModels(params: {
  apiKey: string;
  models: string[];
  audioBuffer: Uint8Array;
  options: AudioFallbackTranscriptionOptions;
}): Promise<string | null> {
  const maxAttemptsPerModel = Math.max(1, params.options.maxAttemptsPerModel ?? 1);
  for (const model of params.models) {
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        console.log(`[AudioTranscriptionFallback] Trying OpenRouter STT model ${model} (${attempt}/${maxAttemptsPerModel}).`);
        const transcription = await callOpenRouterSttModel({
          apiKey: params.apiKey,
          model,
          audioBuffer: params.audioBuffer,
          options: params.options,
        });
        if (transcription) {
          console.log(`[AudioTranscriptionFallback] OpenRouter STT model ${model} transcribed ${transcription.length} chars.`);
          return transcription;
        }
      } catch (error: any) {
        console.warn("[AudioTranscriptionFallback] OpenRouter STT model failed:", {
          model,
          message: error?.message,
          status: error?.status ?? error?.statusCode,
        });
        const status = Number(error?.status ?? error?.statusCode ?? 0);
        if (status === 401 || status === 402 || status === 403 || status === 404) {
          break;
        }
      }
    }
  }
  return null;
}

async function tryDeepInfraSttModels(params: {
  apiKey: string;
  models: string[];
  audioBuffer: Uint8Array;
  options: AudioFallbackTranscriptionOptions;
}): Promise<string | null> {
  const maxAttemptsPerModel = Math.max(1, params.options.maxAttemptsPerModel ?? 1);
  for (const model of params.models) {
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        console.log(`[AudioTranscriptionFallback] Trying DeepInfra STT model ${model} (${attempt}/${maxAttemptsPerModel}).`);
        const transcription = await callDeepInfraSttModel({
          apiKey: params.apiKey,
          model,
          audioBuffer: params.audioBuffer,
          options: params.options,
        });
        if (transcription) {
          console.log(`[AudioTranscriptionFallback] DeepInfra STT model ${model} transcribed ${transcription.length} chars.`);
          return transcription;
        }
        if (params.options.stopDeepInfraProviderAfterFirstFailure) {
          console.warn("[AudioTranscriptionFallback] DeepInfra STT returned no transcript; falling back to the next transcription layer.", {
            model,
          });
          return null;
        }
      } catch (error: any) {
        console.warn("[AudioTranscriptionFallback] DeepInfra STT model failed:", {
          model,
          message: error?.message,
          status: error?.status ?? error?.statusCode,
        });
        const status = Number(error?.status ?? error?.statusCode ?? 0);
        if (params.options.stopDeepInfraProviderAfterFirstFailure || isTerminalDeepInfraProviderError(error)) {
          console.warn("[AudioTranscriptionFallback] DeepInfra provider unavailable; falling back to the next transcription layer.", {
            model,
            status: status || undefined,
            code: error?.code,
          });
          return null;
        }
        if (status === 404) {
          break;
        }
      }
    }
  }
  return null;
}

async function tryModels(params: {
  providerName: string;
  endpoint: string;
  apiKey: string;
  models: string[];
  audioBuffer: Uint8Array;
  options: AudioFallbackTranscriptionOptions;
  headers?: Record<string, string>;
}): Promise<string | null> {
  const maxAttemptsPerModel = Math.max(1, params.options.maxAttemptsPerModel ?? 1);
  for (const model of params.models) {
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        console.log(`[AudioTranscriptionFallback] Trying ${params.providerName} audio model ${model} (${attempt}/${maxAttemptsPerModel}).`);
        const transcription = await callOpenAICompatibleAudioModel({
          endpoint: params.endpoint,
          apiKey: params.apiKey,
          model,
          audioBuffer: params.audioBuffer,
          options: params.options,
          headers: params.headers,
        });
        if (transcription) {
          console.log(`[AudioTranscriptionFallback] ${params.providerName} audio model ${model} transcribed ${transcription.length} chars.`);
          return transcription;
        }
      } catch (error: any) {
        console.warn(`[AudioTranscriptionFallback] ${params.providerName} audio model ${model} failed:`, {
          message: error?.message,
          status: error?.status ?? error?.statusCode,
        });
        const status = Number(error?.status ?? error?.statusCode ?? 0);
        if (status === 401 || status === 402 || status === 403 || status === 404) {
          break;
        }
      }
    }
  }
  return null;
}

export async function transcribeAudioWithFallbackProviders(
  audioBuffer: Uint8Array,
  options: AudioFallbackTranscriptionOptions = {},
): Promise<string | null> {
  const config: AudioFallbackResolvedLLMConfig = options.config ?? await import("./llmConfigResolver")
    .then((module) => module.getResolvedLLMConfig(options.userId) as Promise<AudioFallbackResolvedLLMConfig>);
  const allowConversationalAudioFallback = options.allowConversationalAudioFallback ?? true;
  const isProviderEnabled = (provider: AudioFallbackProvider): boolean => !options.providers || options.providers.includes(provider);

  if (isProviderEnabled("deepinfra") && config.deepinfraApiKey) {
    const deepInfraSttModels = resolveDeepInfraSttModels(config);
    if (deepInfraSttModels.length > 0) {
      const deepInfraTranscription = await tryDeepInfraSttModels({
        apiKey: config.deepinfraApiKey,
        models: deepInfraSttModels,
        audioBuffer,
        options,
      });
      if (deepInfraTranscription) return deepInfraTranscription;
    }
  } else if (isProviderEnabled("deepinfra")) {
    console.warn("[AudioTranscriptionFallback] DeepInfra API key not configured; skipping DeepInfra STT fallback.");
  }

  if ((isProviderEnabled("openrouter_stt") || isProviderEnabled("openrouter_audio")) && config.openrouterApiKey) {
    const openRouterSttModels = resolveOpenRouterSttModels(config);
    if (isProviderEnabled("openrouter_stt") && openRouterSttModels.length > 0) {
      const openRouterSttTranscription = await tryOpenRouterSttModels({
        apiKey: config.openrouterApiKey,
        models: openRouterSttModels,
        audioBuffer,
        options,
      });
      if (openRouterSttTranscription) return openRouterSttTranscription;
    }

    if (!allowConversationalAudioFallback && isProviderEnabled("openrouter_audio")) {
      console.warn("[AudioTranscriptionFallback] Conversational audio fallbacks disabled for this path.");
      return null;
    }

    const openRouterModels = resolveOpenRouterAudioModels(config);
    if (isProviderEnabled("openrouter_audio") && allowConversationalAudioFallback && openRouterModels.length > 0) {
      const openRouterTranscription = await tryModels({
        providerName: "OpenRouter",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: config.openrouterApiKey,
        models: openRouterModels,
        audioBuffer,
        options,
        headers: {
          "HTTP-Referer": "https://agentezap.online",
          "X-Title": "AgenteZap Audio Transcription",
        },
      });
      if (openRouterTranscription) return openRouterTranscription;
    } else if (isProviderEnabled("openrouter_audio") && allowConversationalAudioFallback) {
      console.warn("[AudioTranscriptionFallback] No OpenRouter audio-capable models configured/detected.");
    }
  } else if (isProviderEnabled("openrouter_stt") || isProviderEnabled("openrouter_audio")) {
    console.warn("[AudioTranscriptionFallback] OpenRouter API key not configured; skipping OpenRouter audio fallback.");
  }

  if (!allowConversationalAudioFallback && isProviderEnabled("nvidia_audio")) {
    console.warn("[AudioTranscriptionFallback] Conversational audio fallbacks disabled for this path.");
    return null;
  }

  if (isProviderEnabled("nvidia_audio") && allowConversationalAudioFallback && config.nvidiaApiKey) {
    const nvidiaModels = resolveNvidiaAudioModels(config);
    if (nvidiaModels.length > 0) {
      const nvidiaTranscription = await tryModels({
        providerName: "NVIDIA",
        endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
        apiKey: config.nvidiaApiKey,
        models: nvidiaModels,
        audioBuffer,
        options,
      });
      if (nvidiaTranscription) return nvidiaTranscription;
    } else {
      console.warn("[AudioTranscriptionFallback] No NVIDIA audio-capable/free models configured/detected.");
    }
  } else if (isProviderEnabled("nvidia_audio") && allowConversationalAudioFallback) {
    console.warn("[AudioTranscriptionFallback] NVIDIA API key not configured; skipping NVIDIA audio fallback.");
  }

  return null;
}
