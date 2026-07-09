import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

export interface LocalWhisperTranscriptionOptions {
  fileName?: string;
  mimeType?: string;
  userId?: string;
  language?: string;
  enabled?: boolean;
  ffmpegPath?: string;
  whisperCliPath?: string;
  model?: string;
  modelPath?: string;
  threads?: number;
  timeoutMs?: number;
  maxBytes?: number;
  maxQueueDepth?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  queueWaitMs?: number;
  workDir?: string;
  executeCommand?: CommandRunner;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { timeoutMs: number; cwd?: string },
) => Promise<CommandResult>;

const DEFAULT_LOCAL_WHISPER_MODEL = "base";
const DEFAULT_LOCAL_WHISPER_LANGUAGE = "pt";
const DEFAULT_LOCAL_WHISPER_TIMEOUT_MS = 180_000;
const DEFAULT_LOCAL_WHISPER_MAX_BYTES = 12 * 1024 * 1024;
const DEFAULT_LOCAL_WHISPER_MAX_QUEUE_DEPTH = 4;
const DEFAULT_LOCAL_WHISPER_THREADS = 1;
const DEFAULT_LOCAL_WHISPER_MAX_ATTEMPTS = 3;
const DEFAULT_LOCAL_WHISPER_RETRY_DELAY_MS = 1_500;
const DEFAULT_LOCAL_WHISPER_QUEUE_WAIT_MS = 60_000;

let localWhisperQueue: Promise<void> = Promise.resolve();
let localWhisperQueuedJobs = 0;
const warnedMessages = new Set<string>();

export class LocalWhisperQueueBusyError extends Error {
  code = "LOCAL_WHISPER_QUEUE_BUSY";
  retryable = true;
  retryAfterMs: number;
  statusCode = 503;

  constructor(params: { queued: number; maxQueueDepth: number; queueWaitMs: number; retryAfterMs: number }) {
    super(
      `Local Whisper queue is temporarily busy after ${params.queueWaitMs}ms; retry later.`,
    );
    this.name = "LocalWhisperQueueBusyError";
    this.retryAfterMs = params.retryAfterMs;
  }
}

function isLocalWhisperQueueBusyError(error: unknown): error is LocalWhisperQueueBusyError {
  return error instanceof LocalWhisperQueueBusyError || (error as any)?.code === "LOCAL_WHISPER_QUEUE_BUSY";
}

function resolveQueueBusyRetryAfterMs(queueWaitMs: number): number {
  return Math.min(120_000, Math.max(15_000, queueWaitMs || 15_000));
}

function warnOnce(key: string, message: string, details?: Record<string, unknown>): void {
  if (warnedMessages.has(key)) return;
  warnedMessages.add(key);
  if (details) {
    console.warn(message, details);
  } else {
    console.warn(message);
  }
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  return fallback;
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function firstExistingPath(paths: Array<string | undefined>): string | null {
  for (const candidate of paths) {
    const normalized = String(candidate ?? "").trim();
    if (!normalized) continue;
    if (existsSync(normalized)) return normalized;
  }
  return null;
}

function resolveWhisperCliPath(options: LocalWhisperTranscriptionOptions): string | null {
  if (options.executeCommand && options.whisperCliPath) return options.whisperCliPath;
  return firstExistingPath([
    options.whisperCliPath,
    process.env.LOCAL_WHISPER_CLI_PATH,
    process.env.WHISPER_CPP_CLI_PATH,
    "/opt/agentezap/whisper/whisper-cli",
    "/opt/whisper/whisper-cli",
    join(process.cwd(), "whisper", "whisper-cli"),
  ]);
}

function resolveModelPath(options: LocalWhisperTranscriptionOptions, model: string): string | null {
  if (options.executeCommand && options.modelPath) return options.modelPath;
  const fileName = `ggml-${model}.bin`;
  return firstExistingPath([
    options.modelPath,
    process.env.LOCAL_WHISPER_MODEL_PATH,
    process.env.WHISPER_CPP_MODEL_PATH,
    `/opt/agentezap/whisper/${fileName}`,
    `/opt/whisper/${fileName}`,
    join(process.cwd(), "whisper", fileName),
    join(process.cwd(), "models", fileName),
  ]);
}

function resolveAudioExtension(fileName?: string, mimeType?: string): string {
  const fileExt = extname(String(fileName ?? "")).toLowerCase().replace(".", "");
  if (["ogg", "opus", "wav", "mp3", "m4a", "mp4", "webm"].includes(fileExt)) {
    return fileExt === "opus" ? "ogg" : fileExt;
  }
  const mime = String(mimeType ?? "").toLowerCase();
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("webm")) return "webm";
  return "ogg";
}

function normalizeLanguage(language?: string): string {
  const normalized = String(language ?? "").trim().toLowerCase();
  if (!normalized) return DEFAULT_LOCAL_WHISPER_LANGUAGE;
  if (normalized === "pt-br" || normalized === "pt_br" || normalized === "portugues" || normalized === "portuguese") return "pt";
  return normalized.slice(0, 8);
}

function normalizeTranscript(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("whisper_"))
    .filter((line) => !line.startsWith("system_info:"));
  const normalized = lines.join("\n").trim();
  return normalized.length > 0 ? normalized : null;
}

function withTimeoutError(command: string, timeoutMs: number): Error {
  const error = new Error(`Local Whisper command timed out after ${timeoutMs}ms: ${basename(command)}`) as any;
  error.code = "LOCAL_WHISPER_TIMEOUT";
  return error;
}

export async function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs: number; cwd?: string },
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(withTimeoutError(command, options.timeoutMs));
    }, options.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolveCommand({ stdout, stderr });
        return;
      }
      const error = new Error(`Local Whisper command failed with exit ${code}: ${basename(command)} ${stderr.slice(0, 400)}`) as any;
      error.code = code;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function waitForLocalWhisperQueueSlot(maxQueueDepth: number, queueWaitMs: number): Promise<boolean> {
  if (localWhisperQueuedJobs < maxQueueDepth) {
    return true;
  }

  const startedAt = Date.now();
  let delayMs = 250;

  while (Date.now() - startedAt < queueWaitMs) {
    const remainingMs = queueWaitMs - (Date.now() - startedAt);
    await sleep(Math.max(1, Math.min(delayMs, remainingMs)));
    if (localWhisperQueuedJobs < maxQueueDepth) {
      return true;
    }
    delayMs = Math.min(1_000, Math.round(delayMs * 1.5));
  }

  console.warn("[LocalWhisperTranscription] Local queue stayed full after wait; deferring audio transcription retry.", {
    queued: localWhisperQueuedJobs,
    maxQueueDepth,
    queueWaitMs,
  });
  return false;
}

async function enqueueLocalWhisper<T>(maxQueueDepth: number, queueWaitMs: number, job: () => Promise<T>): Promise<T> {
  const hasQueueSlot = await waitForLocalWhisperQueueSlot(maxQueueDepth, queueWaitMs);
  if (!hasQueueSlot) {
    throw new LocalWhisperQueueBusyError({
      queued: localWhisperQueuedJobs,
      maxQueueDepth,
      queueWaitMs,
      retryAfterMs: resolveQueueBusyRetryAfterMs(queueWaitMs),
    });
  }

  localWhisperQueuedJobs += 1;
  const run = localWhisperQueue.then(job, job);
  localWhisperQueue = run.then(
    () => undefined,
    () => undefined,
  );

  try {
    return await run;
  } finally {
    localWhisperQueuedJobs = Math.max(0, localWhisperQueuedJobs - 1);
  }
}

async function runLocalWhisperJob(
  audioBuffer: Uint8Array,
  options: LocalWhisperTranscriptionOptions,
  resolved: {
    ffmpegPath: string;
    whisperCliPath: string;
    modelPath: string;
    model: string;
    language: string;
    timeoutMs: number;
    threads: number;
  },
): Promise<string | null> {
  const root = await mkdtemp(join(resolve(options.workDir || tmpdir()), "agentezap-whisper-"));
  try {
    const inputExtension = resolveAudioExtension(options.fileName, options.mimeType);
    const inputPath = join(root, `${inputExtension === "wav" ? "source" : "input"}.${inputExtension}`);
    const wavPath = join(root, "input.wav");
    const outputBase = join(root, "transcript");
    const outputTextPath = `${outputBase}.txt`;

    await writeFile(inputPath, audioBuffer);
    const runner = options.executeCommand ?? runCommand;
    await runner(resolved.ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      wavPath,
    ], { timeoutMs: Math.min(resolved.timeoutMs, 45_000), cwd: root });

    const whisperArgs = [
      "-m",
      resolved.modelPath,
      "-f",
      wavPath,
      "-l",
      resolved.language,
      "-t",
      String(resolved.threads),
      "-nt",
      "-np",
      "-otxt",
      "-of",
      outputBase,
    ];

    const whisperResult = await runner(resolved.whisperCliPath, whisperArgs, { timeoutMs: resolved.timeoutMs, cwd: root });

    const textFromFile = await readFile(outputTextPath, "utf8").catch(() => "");
    return normalizeTranscript(textFromFile || whisperResult.stdout);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function transcribeAudioWithLocalWhisper(
  audioBuffer: Uint8Array,
  options: LocalWhisperTranscriptionOptions = {},
): Promise<string | null> {
  const enabled = options.enabled ?? parseBooleanEnv(
    process.env.LOCAL_WHISPER_TRANSCRIPTION_ENABLED ?? process.env.AUDIO_TRANSCRIPTION_LOCAL_ENABLED,
    true,
  );
  if (!enabled) return null;

  const maxBytes = Math.max(1024, options.maxBytes ?? parseNumberEnv(process.env.LOCAL_WHISPER_MAX_BYTES, DEFAULT_LOCAL_WHISPER_MAX_BYTES));
  if (audioBuffer.byteLength > maxBytes) {
    console.warn("[LocalWhisperTranscription] Audio exceeds local limit; local transcription skipped.", {
      bytes: audioBuffer.byteLength,
      maxBytes,
    });
    return null;
  }

  const model = String(options.model || process.env.LOCAL_WHISPER_MODEL || DEFAULT_LOCAL_WHISPER_MODEL).trim() || DEFAULT_LOCAL_WHISPER_MODEL;
  const language = normalizeLanguage(options.language || process.env.LOCAL_WHISPER_LANGUAGE || process.env.AUDIO_TRANSCRIPTION_LANGUAGE);
  const whisperCliPath = resolveWhisperCliPath(options);
  const modelPath = resolveModelPath(options, model);
  if (!whisperCliPath || !modelPath) {
    warnOnce("missing-local-whisper", "[LocalWhisperTranscription] Local Whisper binary/model not available; local transcription skipped.", {
      model,
      hasCli: Boolean(whisperCliPath),
      hasModel: Boolean(modelPath),
    });
    return null;
  }

  const ffmpegPath = options.ffmpegPath || process.env.LOCAL_WHISPER_FFMPEG_PATH || "ffmpeg";
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? parseNumberEnv(process.env.LOCAL_WHISPER_TIMEOUT_MS, DEFAULT_LOCAL_WHISPER_TIMEOUT_MS));
  const maxQueueDepth = Math.max(1, options.maxQueueDepth ?? parseNumberEnv(process.env.LOCAL_WHISPER_MAX_QUEUE_DEPTH, DEFAULT_LOCAL_WHISPER_MAX_QUEUE_DEPTH));
  const threads = Math.max(1, Math.min(4, options.threads ?? parseNumberEnv(process.env.LOCAL_WHISPER_THREADS, DEFAULT_LOCAL_WHISPER_THREADS)));
  const maxAttempts = Math.max(1, options.maxAttempts ?? parseNumberEnv(process.env.LOCAL_WHISPER_MAX_ATTEMPTS, DEFAULT_LOCAL_WHISPER_MAX_ATTEMPTS));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? parseNumberEnv(process.env.LOCAL_WHISPER_RETRY_DELAY_MS, DEFAULT_LOCAL_WHISPER_RETRY_DELAY_MS));
  const queueWaitMs = Math.max(0, options.queueWaitMs ?? parseNumberEnv(process.env.LOCAL_WHISPER_QUEUE_WAIT_MS, DEFAULT_LOCAL_WHISPER_QUEUE_WAIT_MS));

  const startedAt = Date.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const transcription = await enqueueLocalWhisper(maxQueueDepth, queueWaitMs, () => runLocalWhisperJob(audioBuffer, options, {
        ffmpegPath,
        whisperCliPath,
        modelPath,
        model,
        language,
        timeoutMs,
        threads,
      }));
      if (transcription) {
        console.log("[LocalWhisperTranscription] Local Whisper transcribed audio.", {
          model,
          language,
          attempt,
          chars: transcription.length,
          elapsedMs: Date.now() - startedAt,
        });
        return transcription;
      }
      console.warn("[LocalWhisperTranscription] Local Whisper returned no transcript; retrying locally when attempts remain.", {
        model,
        language,
        attempt,
        maxAttempts,
      });
    } catch (error: any) {
      if (isLocalWhisperQueueBusyError(error)) {
        throw error;
      }
      console.warn("[LocalWhisperTranscription] Local Whisper attempt failed; retrying locally when attempts remain.", {
        model,
        language,
        attempt,
        maxAttempts,
        message: error?.message,
        code: error?.code,
      });
    }

    if (attempt < maxAttempts && retryDelayMs > 0) {
      await sleep(Math.min(15_000, retryDelayMs * attempt));
    }
  }

  console.warn("[LocalWhisperTranscription] Local Whisper did not produce a transcript after retries.", {
    model,
    language,
    maxAttempts,
    elapsedMs: Date.now() - startedAt,
  });
  return null;
}
