import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { basename, join, resolve } from "path";
import { tmpdir } from "os";

export type AudioNormalizationCommandRunner = (
  command: string,
  args: string[],
  options: { timeoutMs: number; cwd: string },
) => Promise<void>;

export interface AudioTranscriptionNormalizationOptions {
  fileName?: string;
  mimeType?: string;
  enabled?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  ffmpegPath?: string;
  filter?: string;
  executeCommand?: AudioNormalizationCommandRunner;
}

export interface AudioTranscriptionNormalizationResult {
  audioBuffer: Uint8Array;
  fileName?: string;
  mimeType?: string;
  normalized: boolean;
}

export type RemoteAudioNormalizationOptions = AudioTranscriptionNormalizationOptions;
export type RemoteAudioNormalizationResult = AudioTranscriptionNormalizationResult;

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  return fallback;
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function inferInputExtension(fileName?: string, mimeType?: string): string {
  const combined = `${fileName || ""} ${mimeType || ""}`.toLowerCase();
  if (combined.includes("wav")) return ".wav";
  if (combined.includes("mp3") || combined.includes("mpeg")) return ".mp3";
  if (combined.includes("m4a") || combined.includes("mp4")) return ".m4a";
  if (combined.includes("webm")) return ".webm";
  return ".ogg";
}

function runCommand(command: string, args: string[], timeoutMs: number, cwd: string): Promise<void> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Audio normalization timed out after ${timeoutMs}ms: ${basename(command)}`));
    }, timeoutMs);

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolveCommand();
        return;
      }
      reject(new Error(`Audio normalization failed with exit ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

export function isAudioTranscriptionNormalizationEnabled(options: Pick<AudioTranscriptionNormalizationOptions, "enabled"> = {}): boolean {
  return options.enabled ?? parseBooleanEnv(
    process.env.AUDIO_TRANSCRIPTION_NORMALIZE_ENABLED ?? process.env.AUDIO_TRANSCRIPTION_REMOTE_NORMALIZE_ENABLED,
    false,
  );
}

export const isRemoteAudioNormalizationEnabled = isAudioTranscriptionNormalizationEnabled;

export async function normalizeAudioForTranscription(
  audioBuffer: Uint8Array,
  options: AudioTranscriptionNormalizationOptions = {},
): Promise<AudioTranscriptionNormalizationResult> {
  if (!isAudioTranscriptionNormalizationEnabled(options)) {
    return {
      audioBuffer,
      fileName: options.fileName,
      mimeType: options.mimeType,
      normalized: false,
    };
  }

  const maxBytes = options.maxBytes ?? parseNumberEnv(
    process.env.AUDIO_TRANSCRIPTION_NORMALIZE_MAX_BYTES ?? process.env.AUDIO_TRANSCRIPTION_REMOTE_NORMALIZE_MAX_BYTES,
    25 * 1024 * 1024,
  );
  if (audioBuffer.length > maxBytes) {
    console.warn("[AudioTranscriptionPreprocess] Audio normalization skipped because audio exceeds limit.", {
      bytes: audioBuffer.length,
      maxBytes,
    });
    return {
      audioBuffer,
      fileName: options.fileName,
      mimeType: options.mimeType,
      normalized: false,
    };
  }

  const timeoutMs = options.timeoutMs ?? parseNumberEnv(
    process.env.AUDIO_TRANSCRIPTION_NORMALIZE_TIMEOUT_MS ?? process.env.AUDIO_TRANSCRIPTION_REMOTE_NORMALIZE_TIMEOUT_MS,
    30_000,
  );
  const ffmpegPath = options.ffmpegPath || process.env.AUDIO_TRANSCRIPTION_FFMPEG_PATH || process.env.FFMPEG_PATH || "ffmpeg";
  const filter = options.filter || process.env.AUDIO_TRANSCRIPTION_NORMALIZE_FILTER || "aresample=16000,highpass=f=80,lowpass=f=7600,loudnorm=I=-16:LRA=11:TP=-1.5";
  const root = await mkdtemp(join(resolve(tmpdir()), "agentezap-audio-normalize-"));
  const inputPath = join(root, `input${inferInputExtension(options.fileName, options.mimeType)}`);
  const outputPath = join(root, "normalized.wav");

  try {
    await writeFile(inputPath, Buffer.from(audioBuffer));
    const runner = options.executeCommand ?? ((command, args, runnerOptions) => runCommand(command, args, runnerOptions.timeoutMs, runnerOptions.cwd));
    await runner(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-af",
      filter,
      outputPath,
    ], { timeoutMs, cwd: root });

    const normalizedAudio = await readFile(outputPath);
    if (!normalizedAudio.length) {
      throw new Error("Audio normalization produced an empty file.");
    }

    return {
      audioBuffer: normalizedAudio,
      fileName: "audio-normalized.wav",
      mimeType: "audio/wav",
      normalized: true,
    };
  } catch (error) {
    console.warn("[AudioTranscriptionPreprocess] Audio normalization failed; using original audio.", {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      audioBuffer,
      fileName: options.fileName,
      mimeType: options.mimeType,
      normalized: false,
    };
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const normalizeAudioForRemoteTranscription = normalizeAudioForTranscription;
