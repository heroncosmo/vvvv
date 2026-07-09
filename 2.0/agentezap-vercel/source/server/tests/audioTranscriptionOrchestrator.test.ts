import test from "node:test";
import * as assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isRemoteAudioTranscriptionFallbackEnabled,
  transcribeAudioCostOptimized,
} from "../audioTranscriptionOrchestrator";
import type { CommandRunner } from "../localWhisperTranscription";

async function buildWorkDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agentezap-orchestrator-test-"));
}

test("isRemoteAudioTranscriptionFallbackEnabled defaults to false", () => {
  const original = process.env.AUDIO_TRANSCRIPTION_REMOTE_FALLBACK_ENABLED;
  delete process.env.AUDIO_TRANSCRIPTION_REMOTE_FALLBACK_ENABLED;

  try {
    assert.equal(isRemoteAudioTranscriptionFallbackEnabled(), false);
  } finally {
    if (original === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_REMOTE_FALLBACK_ENABLED;
    } else {
      process.env.AUDIO_TRANSCRIPTION_REMOTE_FALLBACK_ENABLED = original;
    }
  }
});

test("isRemoteAudioTranscriptionFallbackEnabled accepts explicit emergency enable", () => {
  const original = process.env.AUDIO_TRANSCRIPTION_REMOTE_FALLBACK_ENABLED;
  process.env.AUDIO_TRANSCRIPTION_REMOTE_FALLBACK_ENABLED = "true";

  try {
    assert.equal(isRemoteAudioTranscriptionFallbackEnabled(), true);
  } finally {
    if (original === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_REMOTE_FALLBACK_ENABLED;
    } else {
      process.env.AUDIO_TRANSCRIPTION_REMOTE_FALLBACK_ENABLED = original;
    }
  }
});

test("transcribeAudioCostOptimized does not call remote transcription when disabled", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("remote transcription should not be called");
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const transcription = await transcribeAudioCostOptimized(new Uint8Array([1, 2, 3]), {
    localTranscriptionEnabled: false,
    remoteFallbackEnabled: false,
  });

  assert.equal(transcription, null);
});

test("transcribeAudioCostOptimized can use configured remote STT before local Whisper", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalPrimary = process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
  const originalDeepInfraKey = process.env.DEEPINFRA_API_KEY;
  process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = "deepinfra";
  process.env.DEEPINFRA_API_KEY = "di-test-key";

  let requestedUrl = "";
  let requestedModel = "";
  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    const body = init?.body as FormData;
    requestedModel = String(body.get("model") || "");
    return new Response(JSON.stringify({ text: "eu sou uma loja de calcado" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalPrimary === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
    } else {
      process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = originalPrimary;
    }
    if (originalDeepInfraKey === undefined) {
      delete process.env.DEEPINFRA_API_KEY;
    } else {
      process.env.DEEPINFRA_API_KEY = originalDeepInfraKey;
    }
  });

  const transcription = await transcribeAudioCostOptimized(new Uint8Array([1, 2, 3]), {
    localTranscriptionEnabled: true,
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    language: "pt",
    fallbackProviderConfig: {
      deepinfraApiKey: "di-test-key",
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      openrouterApiKey: "",
      openrouterModel: "",
      openrouterModels: [],
      nvidiaApiKey: "",
      nvidiaModel: "",
    },
  });

  assert.equal(requestedUrl, "https://api.deepinfra.com/v1/audio/transcriptions");
  assert.equal(requestedModel, "mistralai/Voxtral-Mini-3B-2507");
  assert.equal(transcription, "eu sou uma loja de calcado");
});

test("transcribeAudioCostOptimized falls back to local Whisper immediately after DeepInfra credit failure", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalPrimary = process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
  process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = "deepinfra";

  const remoteCalls: string[] = [];
  globalThis.fetch = async (url) => {
    remoteCalls.push(String(url));
    return new Response(JSON.stringify({ error: { message: "insufficient credits" } }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
  };

  const localCommands: string[] = [];
  const runner: CommandRunner = async (command, args) => {
    localCommands.push(command);
    if (command === "fake-local-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "transcricao local depois do deepinfra");
    return { stdout: "", stderr: "" };
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalPrimary === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
    } else {
      process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = originalPrimary;
    }
  });

  const transcription = await transcribeAudioCostOptimized(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    language: "pt",
    localTranscriptionEnabled: true,
    localWhisperFfmpegPath: "fake-local-ffmpeg",
    localWhisperCliPath: "fake-whisper",
    localWhisperModelPath: "fake-model",
    localWhisperExecuteCommand: runner,
    localWhisperWorkDir: await buildWorkDir(),
    fallbackProviderConfig: {
      deepinfraApiKey: "di-test-key",
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      openrouterApiKey: "openrouter-should-not-run-before-local",
      openrouterModel: "openai/whisper-large-v3",
      openrouterModels: ["openai/whisper-large-v3"],
      nvidiaApiKey: "nvidia-should-not-run-before-local",
      nvidiaModel: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    },
  });

  assert.deepEqual(remoteCalls, ["https://api.deepinfra.com/v1/audio/transcriptions"]);
  assert.deepEqual(localCommands, ["fake-local-ffmpeg", "fake-whisper"]);
  assert.equal(transcription, "transcricao local depois do deepinfra");
});

test("transcribeAudioCostOptimized falls back to local Whisper after DeepInfra timeout", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalPrimary = process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
  process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = "deepinfra";

  let remoteCallCount = 0;
  globalThis.fetch = async (_url, init) => {
    remoteCallCount += 1;
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  };

  const localCommands: string[] = [];
  const runner: CommandRunner = async (command, args) => {
    localCommands.push(command);
    if (command === "fake-local-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "transcricao local depois do timeout");
    return { stdout: "", stderr: "" };
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalPrimary === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
    } else {
      process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = originalPrimary;
    }
  });

  const transcription = await transcribeAudioCostOptimized(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    language: "pt",
    deepinfraTimeoutMs: 5,
    localTranscriptionEnabled: true,
    localWhisperFfmpegPath: "fake-local-ffmpeg",
    localWhisperCliPath: "fake-whisper",
    localWhisperModelPath: "fake-model",
    localWhisperExecuteCommand: runner,
    localWhisperWorkDir: await buildWorkDir(),
    fallbackProviderConfig: {
      deepinfraApiKey: "di-test-key",
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      openrouterApiKey: "",
      openrouterModel: "",
      openrouterModels: [],
      nvidiaApiKey: "",
      nvidiaModel: "",
    },
  });

  assert.equal(remoteCallCount, 1);
  assert.deepEqual(localCommands, ["fake-local-ffmpeg", "fake-whisper"]);
  assert.equal(transcription, "transcricao local depois do timeout");
});

test("transcribeAudioCostOptimized falls back to local Whisper after generic DeepInfra error", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalPrimary = process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
  process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = "deepinfra";

  let remoteCallCount = 0;
  globalThis.fetch = async () => {
    remoteCallCount += 1;
    return new Response(JSON.stringify({ error: { message: "upstream unavailable" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };

  const localCommands: string[] = [];
  const runner: CommandRunner = async (command, args) => {
    localCommands.push(command);
    if (command === "fake-local-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "transcricao local depois do erro generico");
    return { stdout: "", stderr: "" };
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalPrimary === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
    } else {
      process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = originalPrimary;
    }
  });

  const transcription = await transcribeAudioCostOptimized(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    language: "pt",
    localTranscriptionEnabled: true,
    localWhisperFfmpegPath: "fake-local-ffmpeg",
    localWhisperCliPath: "fake-whisper",
    localWhisperModelPath: "fake-model",
    localWhisperExecuteCommand: runner,
    localWhisperWorkDir: await buildWorkDir(),
    fallbackProviderConfig: {
      deepinfraApiKey: "di-test-key",
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      deepinfraTranscriptionModels: ["openai/whisper-large-v3"],
      openrouterApiKey: "",
      openrouterModel: "",
      openrouterModels: [],
      nvidiaApiKey: "",
      nvidiaModel: "",
    },
  });

  assert.equal(remoteCallCount, 1);
  assert.deepEqual(localCommands, ["fake-local-ffmpeg", "fake-whisper"]);
  assert.equal(transcription, "transcricao local depois do erro generico");
});

test("transcribeAudioCostOptimized sends normalized audio to DeepInfra and local Whisper", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalPrimary = process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
  process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = "deepinfra";

  let deepInfraFileName = "";
  let normalizedFilter = "";
  let localInputBytes: number[] = [];

  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.deepinfra.com/v1/audio/transcriptions");
    const body = init?.body as FormData;
    const file = body.get("file") as File;
    deepInfraFileName = file?.name || "";
    return new Response(JSON.stringify({ error: { message: "insufficient credits" } }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
  };

  const normalizer = async (_command: string, args: string[]) => {
    normalizedFilter = String(args[args.indexOf("-af") + 1]);
    await writeFile(String(args.at(-1)), new Uint8Array([9, 8, 7]));
  };

  const localRunner: CommandRunner = async (command, args) => {
    if (command === "fake-local-ffmpeg") {
      const inputPath = String(args[args.indexOf("-i") + 1]);
      localInputBytes = Array.from(await readFile(inputPath));
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "audio normalizado no fallback local");
    return { stdout: "", stderr: "" };
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalPrimary === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
    } else {
      process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = originalPrimary;
    }
  });

  const transcription = await transcribeAudioCostOptimized(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    language: "pt",
    audioNormalizationEnabled: true,
    audioNormalizationFfmpegPath: "fake-normalizer-ffmpeg",
    audioNormalizationExecuteCommand: normalizer,
    localTranscriptionEnabled: true,
    localWhisperFfmpegPath: "fake-local-ffmpeg",
    localWhisperCliPath: "fake-whisper",
    localWhisperModelPath: "fake-model",
    localWhisperExecuteCommand: localRunner,
    localWhisperWorkDir: await buildWorkDir(),
    fallbackProviderConfig: {
      deepinfraApiKey: "di-test-key",
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      openrouterApiKey: "",
      openrouterModel: "",
      openrouterModels: [],
      nvidiaApiKey: "",
      nvidiaModel: "",
    },
  });

  assert.equal(deepInfraFileName, "audio-normalized.wav");
  assert.equal(normalizedFilter, "aresample=16000,highpass=f=80,lowpass=f=7600,loudnorm=I=-16:LRA=11:TP=-1.5");
  assert.deepEqual(localInputBytes, [9, 8, 7]);
  assert.equal(transcription, "audio normalizado no fallback local");
});

test("transcribeAudioCostOptimized preserves original audio when normalization is disabled", async (t) => {
  const originalPrimary = process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
  delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;

  let localInputBytes: number[] = [];
  const localRunner: CommandRunner = async (command, args) => {
    if (command === "fake-local-ffmpeg") {
      const inputPath = String(args[args.indexOf("-i") + 1]);
      localInputBytes = Array.from(await readFile(inputPath));
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "audio bruto transcrito");
    return { stdout: "", stderr: "" };
  };

  t.after(() => {
    if (originalPrimary === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
    } else {
      process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = originalPrimary;
    }
  });

  const transcription = await transcribeAudioCostOptimized(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    audioNormalizationEnabled: false,
    localTranscriptionEnabled: true,
    localWhisperFfmpegPath: "fake-local-ffmpeg",
    localWhisperCliPath: "fake-whisper",
    localWhisperModelPath: "fake-model",
    localWhisperExecuteCommand: localRunner,
    localWhisperWorkDir: await buildWorkDir(),
  });

  assert.deepEqual(localInputBytes, [1, 2, 3]);
  assert.equal(transcription, "audio bruto transcrito");
});

test("transcribeAudioCostOptimized skips normalization for audio above normalization limit", async (t) => {
  const originalPrimary = process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
  delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;

  let normalizationCommandCalled = false;
  let localInputBytes: number[] = [];
  const localRunner: CommandRunner = async (command, args) => {
    if (command === "fake-local-ffmpeg") {
      const inputPath = String(args[args.indexOf("-i") + 1]);
      localInputBytes = Array.from(await readFile(inputPath));
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "audio grande transcrito");
    return { stdout: "", stderr: "" };
  };

  t.after(() => {
    if (originalPrimary === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
    } else {
      process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = originalPrimary;
    }
  });

  const transcription = await transcribeAudioCostOptimized(new Uint8Array([1, 2, 3, 4]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    audioNormalizationEnabled: true,
    audioNormalizationMaxBytes: 3,
    audioNormalizationExecuteCommand: async () => {
      normalizationCommandCalled = true;
    },
    localTranscriptionEnabled: true,
    localWhisperFfmpegPath: "fake-local-ffmpeg",
    localWhisperCliPath: "fake-whisper",
    localWhisperModelPath: "fake-model",
    localWhisperExecuteCommand: localRunner,
    localWhisperWorkDir: await buildWorkDir(),
  });

  assert.equal(normalizationCommandCalled, false);
  assert.deepEqual(localInputBytes, [1, 2, 3, 4]);
  assert.equal(transcription, "audio grande transcrito");
});

test("transcribeAudioCostOptimized fails closed when local Whisper is unavailable and remote fallback is disabled", async (t) => {
  const originalPrimary = process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
  delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;

  t.after(() => {
    if (originalPrimary === undefined) {
      delete process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER;
    } else {
      process.env.AUDIO_TRANSCRIPTION_PRIMARY_PROVIDER = originalPrimary;
    }
  });

  const transcription = await transcribeAudioCostOptimized(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    mimeType: "audio/ogg",
    localTranscriptionEnabled: true,
    remoteFallbackEnabled: false,
  });

  assert.equal(transcription, null);
});
