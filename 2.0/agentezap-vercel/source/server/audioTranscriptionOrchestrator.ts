import { transcribeAudioWithLocalWhisper } from "./localWhisperTranscription";
import { normalizeAudioForTranscription } from "./audioTranscriptionPreprocess";
import type { AudioNormalizationCommandRunner } from "./audioTranscriptionPreprocess";
import type { CommandRunner } from "./localWhisperTranscription";
import type { AudioFallbackProvider, AudioFallbackResolvedLLMConfig } from "./audioTranscriptionFallbackProviders";

export interface CostOptimizedAudioTranscriptionOptions {
  fileName?: string;
  mimeType?: string;
  userId?: string;
  language?: string;
  mistralModel?: string;
  maxAttemptsPerModel?: number;
  mistralMaxAttempts?: number;
  mistralInitialDelayMs?: number;
  mistralMaxDelayMs?: number;
  deepinfraTimeoutMs?: number;
  localTranscriptionEnabled?: boolean;
  localWhisperModel?: string;
  localWhisperTimeoutMs?: number;
  localWhisperMaxBytes?: number;
  localWhisperMaxQueueDepth?: number;
  localWhisperThreads?: number;
  localWhisperMaxAttempts?: number;
  localWhisperRetryDelayMs?: number;
  localWhisperQueueWaitMs?: number;
  localWhisperFfmpegPath?: string;
  localWhisperCliPath?: string;
  localWhisperModelPath?: string;
  localWhisperWorkDir?: string;
  localWhisperExecuteCommand?: CommandRunner;
  audioNormalizationEnabled?: boolean;
  audioNormalizationMaxBytes?: number;
  audioNormalizationTimeoutMs?: number;
  audioNormalizationFfmpegPath?: string;
  audioNormalizationFilter?: string;
  audioNormalizationExecuteCommand?: AudioNormalizationCommandRunner;
  remoteFallbackEnabled?: boolean;
  throwOnFailure?: boolean;
  fallbackProviderConfig?: AudioFallbackResolvedLLMConfig;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  return fallback;
}

export function isRemoteAudioTranscriptionFallbackEnabled(
  options: Pick<CostOptimizedAudioTranscriptionOptions, "remoteFallbackEnabled"> = {},
): boolean {
  return options.remoteFallbackEnabled ?? parseBooleanEnv(
    process.env.AUDIO_TRANSCRIPTION_REMOTE_FALLBACK_ENABLED ?? process.env.AUDIO_TRANSCRIPTION_PAID_FALLBACK_ENABLED,
    false,
  );
}

function getPrimaryRemoteAudioTranscriptionProvider(): "deepinfra" | "remote" | null {
  const preferredProvider = String(process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER || "").trim().toLowerCase();
  if (preferredProvider === "deepinfra" || preferredProvider === "remote") return preferredProvider;
  return null;
}

async function transcribeAudioWithConfiguredRemoteProviders(
  audioBuffer: Uint8Array,
  options: CostOptimizedAudioTranscriptionOptions,
  remoteOptions: {
    providers?: AudioFallbackProvider[];
    includeMistralFallback?: boolean;
  } = {},
): Promise<string | null> {
  const { transcribeAudioWithFallbackProviders } = await import("./audioTranscriptionFallbackProviders");
  const fallbackTranscription = await transcribeAudioWithFallbackProviders(audioBuffer, {
    fileName: options.fileName,
    mimeType: options.mimeType,
    userId: options.userId,
    language: options.language,
    config: options.fallbackProviderConfig,
    maxAttemptsPerModel: options.maxAttemptsPerModel,
    deepinfraTimeoutMs: options.deepinfraTimeoutMs,
    stopDeepInfraProviderAfterFirstFailure: remoteOptions.providers?.length === 1 && remoteOptions.providers[0] === "deepinfra",
    allowConversationalAudioFallback: false,
    providers: remoteOptions.providers,
  });

  if (fallbackTranscription && fallbackTranscription.length > 0) {
    return fallbackTranscription;
  }

  if (remoteOptions.includeMistralFallback === false) {
    return null;
  }

  const { transcribeAudioWithMistral } = await import("./mistralClient");
  return transcribeAudioWithMistral(audioBuffer, {
    fileName: options.fileName,
    language: options.language,
    model: options.mistralModel,
    userId: options.userId,
    maxAttempts: options.mistralMaxAttempts,
    initialDelayMs: options.mistralInitialDelayMs,
    maxDelayMs: options.mistralMaxDelayMs,
    throwOnFailure: options.throwOnFailure,
  });
}

export async function transcribeAudioCostOptimized(
  audioBuffer: Uint8Array,
  options: CostOptimizedAudioTranscriptionOptions = {},
): Promise<string | null> {
  let localTranscription: string | null = null;
  let localTranscriptionError: unknown = null;
  let remoteTranscriptionError: unknown = null;

  const normalizedAudio = await normalizeAudioForTranscription(audioBuffer, {
    fileName: options.fileName,
    mimeType: options.mimeType,
    enabled: options.audioNormalizationEnabled,
    maxBytes: options.audioNormalizationMaxBytes,
    timeoutMs: options.audioNormalizationTimeoutMs,
    ffmpegPath: options.audioNormalizationFfmpegPath,
    filter: options.audioNormalizationFilter,
    executeCommand: options.audioNormalizationExecuteCommand,
  });
  const transcriptionAudioBuffer = normalizedAudio.audioBuffer;
  const transcriptionOptions: CostOptimizedAudioTranscriptionOptions = {
    ...options,
    fileName: normalizedAudio.fileName ?? options.fileName,
    mimeType: normalizedAudio.mimeType ?? options.mimeType,
  };

  const primaryRemoteProvider = getPrimaryRemoteAudioTranscriptionProvider();
  const remoteFallbackEnabled = isRemoteAudioTranscriptionFallbackEnabled(options);
  if (primaryRemoteProvider) {
    try {
      const remoteTranscription = await transcribeAudioWithConfiguredRemoteProviders(transcriptionAudioBuffer, transcriptionOptions, {
        providers: primaryRemoteProvider === "deepinfra" ? ["deepinfra"] : undefined,
        includeMistralFallback: primaryRemoteProvider !== "deepinfra",
      });
      if (remoteTranscription && remoteTranscription.length > 0) {
        return remoteTranscription;
      }
    } catch (error) {
      remoteTranscriptionError = error;
      console.warn("[AudioTranscriptionOrchestrator] Primary remote audio transcription unavailable.", {
        fileName: options.fileName,
        mimeType: options.mimeType,
        userId: options.userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    localTranscription = await transcribeAudioWithLocalWhisper(transcriptionAudioBuffer, {
      fileName: transcriptionOptions.fileName,
      mimeType: transcriptionOptions.mimeType,
      userId: options.userId,
      language: options.language,
      enabled: options.localTranscriptionEnabled,
      model: options.localWhisperModel,
      modelPath: options.localWhisperModelPath,
      timeoutMs: options.localWhisperTimeoutMs,
      maxBytes: options.localWhisperMaxBytes,
      maxQueueDepth: options.localWhisperMaxQueueDepth,
      threads: options.localWhisperThreads,
      maxAttempts: options.localWhisperMaxAttempts,
      retryDelayMs: options.localWhisperRetryDelayMs,
      queueWaitMs: options.localWhisperQueueWaitMs,
      ffmpegPath: options.localWhisperFfmpegPath,
      whisperCliPath: options.localWhisperCliPath,
      workDir: options.localWhisperWorkDir,
      executeCommand: options.localWhisperExecuteCommand,
    });
  } catch (error) {
    localTranscriptionError = error;
    console.warn("[AudioTranscriptionOrchestrator] Local audio transcription unavailable.", {
      fileName: options.fileName,
      mimeType: options.mimeType,
      userId: options.userId,
      message: error instanceof Error ? error.message : String(error),
      retryAfterMs: typeof (error as any)?.retryAfterMs === "number" ? (error as any).retryAfterMs : undefined,
    });
  }

  if (localTranscription && localTranscription.length > 0) {
    return localTranscription;
  }

  if (!remoteFallbackEnabled) {
    if (localTranscriptionError && options.throwOnFailure) {
      throw localTranscriptionError;
    }
    console.warn("[AudioTranscriptionOrchestrator] Remote audio transcription fallback disabled; local transcript unavailable.", {
      fileName: options.fileName,
      mimeType: options.mimeType,
      userId: options.userId,
    });
    return null;
  }

  try {
    return await transcribeAudioWithConfiguredRemoteProviders(transcriptionAudioBuffer, transcriptionOptions);
  } catch (error) {
    if (remoteTranscriptionError && options.throwOnFailure) {
      throw remoteTranscriptionError;
    }
    throw error;
  }
}
