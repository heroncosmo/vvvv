import test from "node:test";
import * as assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type CommandRunner,
  transcribeAudioWithLocalWhisper,
} from "../localWhisperTranscription";

async function buildWorkDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agentezap-local-whisper-test-"));
}

test("transcribeAudioWithLocalWhisper returns null when disabled", async () => {
  const transcription = await transcribeAudioWithLocalWhisper(new Uint8Array([1, 2, 3]), {
    enabled: false,
  });

  assert.equal(transcription, null);
});

test("transcribeAudioWithLocalWhisper runs ffmpeg and whisper-cli, then reads transcript file", async () => {
  const calls: Array<{ command: string; args: string[]; timeoutMs: number }> = [];
  const runner: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, timeoutMs: options.timeoutMs });
    if (command === "fake-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "  Oi, quero testar o agente.  \n");
    return { stdout: "", stderr: "" };
  };

  const transcription = await transcribeAudioWithLocalWhisper(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    language: "pt-BR",
    enabled: true,
    ffmpegPath: "fake-ffmpeg",
    whisperCliPath: "fake-whisper",
    modelPath: "fake-model",
    model: "tiny",
    executeCommand: runner,
    workDir: await buildWorkDir(),
  });

  assert.equal(transcription, "Oi, quero testar o agente.");
  assert.equal(calls[0].command, "fake-ffmpeg");
  assert.equal(calls[1].command, "fake-whisper");
  assert.deepEqual(calls[1].args.slice(0, 2), ["-m", "fake-model"]);
  assert.ok(calls[1].args.includes("-otxt"));
  assert.equal(calls[1].args[calls[1].args.indexOf("-l") + 1], "pt");
});

test("transcribeAudioWithLocalWhisper keeps WAV source and converted WAV paths distinct", async () => {
  const calls: Array<{ command: string; args: string[]; timeoutMs: number }> = [];
  const runner: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, timeoutMs: options.timeoutMs });
    if (command === "fake-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "wav normalizado transcrito");
    return { stdout: "", stderr: "" };
  };

  const transcription = await transcribeAudioWithLocalWhisper(new Uint8Array([1, 2, 3]), {
    fileName: "normalized-transcription.wav",
    mimeType: "audio/wav",
    language: "pt-BR",
    enabled: true,
    ffmpegPath: "fake-ffmpeg",
    whisperCliPath: "fake-whisper",
    modelPath: "fake-model",
    executeCommand: runner,
    workDir: await buildWorkDir(),
  });

  const ffmpegArgs = calls[0].args;
  const ffmpegInputPath = String(ffmpegArgs[ffmpegArgs.indexOf("-i") + 1]);
  const ffmpegOutputPath = String(ffmpegArgs.at(-1));
  assert.equal(transcription, "wav normalizado transcrito");
  assert.notEqual(ffmpegInputPath, ffmpegOutputPath);
  assert.match(ffmpegInputPath, /source\.wav$/);
  assert.match(ffmpegOutputPath, /input\.wav$/);
});

test("transcribeAudioWithLocalWhisper defaults to production timeout and Portuguese", async () => {
  const originals = {
    language: process.env.LOCAL_WHISPER_LANGUAGE,
    timeout: process.env.LOCAL_WHISPER_TIMEOUT_MS,
    model: process.env.LOCAL_WHISPER_MODEL,
  };
  delete process.env.LOCAL_WHISPER_LANGUAGE;
  delete process.env.LOCAL_WHISPER_TIMEOUT_MS;
  delete process.env.LOCAL_WHISPER_MODEL;

  const calls: Array<{ command: string; args: string[]; timeoutMs: number }> = [];
  const runner: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, timeoutMs: options.timeoutMs });
    if (command === "fake-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "Audio longo transcrito.");
    return { stdout: "", stderr: "" };
  };

  try {
    const transcription = await transcribeAudioWithLocalWhisper(new Uint8Array([1, 2, 3]), {
      enabled: true,
      ffmpegPath: "fake-ffmpeg",
      whisperCliPath: "fake-whisper",
      modelPath: "fake-model",
      executeCommand: runner,
      workDir: await buildWorkDir(),
    });

    assert.equal(transcription, "Audio longo transcrito.");
    assert.equal(calls[1].timeoutMs, 180_000);
    assert.equal(calls[1].args[calls[1].args.indexOf("-l") + 1], "pt");
  } finally {
    if (originals.language === undefined) delete process.env.LOCAL_WHISPER_LANGUAGE;
    else process.env.LOCAL_WHISPER_LANGUAGE = originals.language;
    if (originals.timeout === undefined) delete process.env.LOCAL_WHISPER_TIMEOUT_MS;
    else process.env.LOCAL_WHISPER_TIMEOUT_MS = originals.timeout;
    if (originals.model === undefined) delete process.env.LOCAL_WHISPER_MODEL;
    else process.env.LOCAL_WHISPER_MODEL = originals.model;
  }
});

test("transcribeAudioWithLocalWhisper serializes local jobs through the queue", async () => {
  let runningWhisperJobs = 0;
  let maxRunningWhisperJobs = 0;

  const runner: CommandRunner = async (command, args) => {
    if (command === "fake-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    runningWhisperJobs += 1;
    maxRunningWhisperJobs = Math.max(maxRunningWhisperJobs, runningWhisperJobs);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, `transcricao ${runningWhisperJobs}`);
    runningWhisperJobs -= 1;
    return { stdout: "", stderr: "" };
  };

  const workDir = await buildWorkDir();
  const [first, second] = await Promise.all([
    transcribeAudioWithLocalWhisper(new Uint8Array([1]), {
      enabled: true,
      ffmpegPath: "fake-ffmpeg",
      whisperCliPath: "fake-whisper",
      modelPath: "fake-model",
      executeCommand: runner,
      workDir,
      maxQueueDepth: 4,
    }),
    transcribeAudioWithLocalWhisper(new Uint8Array([2]), {
      enabled: true,
      ffmpegPath: "fake-ffmpeg",
      whisperCliPath: "fake-whisper",
      modelPath: "fake-model",
      executeCommand: runner,
      workDir,
      maxQueueDepth: 4,
    }),
  ]);

  assert.equal(first, "transcricao 1");
  assert.equal(second, "transcricao 1");
  assert.equal(maxRunningWhisperJobs, 1);
});

test("transcribeAudioWithLocalWhisper waits for a local queue slot instead of returning null immediately", async () => {
  let runningWhisperJobs = 0;
  let maxRunningWhisperJobs = 0;
  let whisperCalls = 0;

  const runner: CommandRunner = async (command, args) => {
    if (command === "fake-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    runningWhisperJobs += 1;
    whisperCalls += 1;
    maxRunningWhisperJobs = Math.max(maxRunningWhisperJobs, runningWhisperJobs);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, `audio ${whisperCalls}`);
    runningWhisperJobs -= 1;
    return { stdout: "", stderr: "" };
  };

  const workDir = await buildWorkDir();
  const [first, second] = await Promise.all([
    transcribeAudioWithLocalWhisper(new Uint8Array([1]), {
      enabled: true,
      ffmpegPath: "fake-ffmpeg",
      whisperCliPath: "fake-whisper",
      modelPath: "fake-model",
      executeCommand: runner,
      workDir,
      maxQueueDepth: 1,
      queueWaitMs: 500,
      maxAttempts: 1,
    }),
    transcribeAudioWithLocalWhisper(new Uint8Array([2]), {
      enabled: true,
      ffmpegPath: "fake-ffmpeg",
      whisperCliPath: "fake-whisper",
      modelPath: "fake-model",
      executeCommand: runner,
      workDir,
      maxQueueDepth: 1,
      queueWaitMs: 500,
      maxAttempts: 1,
    }),
  ]);

  assert.equal(first, "audio 1");
  assert.equal(second, "audio 2");
  assert.equal(maxRunningWhisperJobs, 1);
  assert.equal(whisperCalls, 2);
});

test("transcribeAudioWithLocalWhisper reports local queue saturation as retryable", async () => {
  let whisperCalls = 0;
  let releaseWhisperJob!: () => void;
  let markWhisperStarted!: () => void;
  const whisperStarted = new Promise<void>((resolveStarted) => {
    markWhisperStarted = resolveStarted;
  });

  const runner: CommandRunner = async (command, args) => {
    if (command === "fake-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    whisperCalls += 1;
    markWhisperStarted();
    await new Promise<void>((resolveRelease) => {
      releaseWhisperJob = resolveRelease;
    });
    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "primeiro audio");
    return { stdout: "", stderr: "" };
  };

  const workDir = await buildWorkDir();
  const firstTranscription = transcribeAudioWithLocalWhisper(new Uint8Array([1]), {
    enabled: true,
    ffmpegPath: "fake-ffmpeg",
    whisperCliPath: "fake-whisper",
    modelPath: "fake-model",
    executeCommand: runner,
    workDir,
    maxQueueDepth: 1,
    queueWaitMs: 500,
    maxAttempts: 1,
  });

  await whisperStarted;

  await assert.rejects(
    () => transcribeAudioWithLocalWhisper(new Uint8Array([2]), {
      enabled: true,
      ffmpegPath: "fake-ffmpeg",
      whisperCliPath: "fake-whisper",
      modelPath: "fake-model",
      executeCommand: runner,
      workDir,
      maxQueueDepth: 1,
      queueWaitMs: 10,
      maxAttempts: 3,
      retryDelayMs: 0,
    }),
    (error: any) => {
      assert.equal(error?.code, "LOCAL_WHISPER_QUEUE_BUSY");
      assert.equal(error?.retryable, true);
      assert.equal(error?.statusCode, 503);
      assert.equal(error?.retryAfterMs, 15_000);
      return true;
    },
  );

  assert.equal(whisperCalls, 1);
  releaseWhisperJob();
  assert.equal(await firstTranscription, "primeiro audio");
});

test("transcribeAudioWithLocalWhisper retries locally after a failed attempt", async () => {
  let whisperCalls = 0;
  const runner: CommandRunner = async (command, args) => {
    if (command === "fake-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    whisperCalls += 1;
    if (whisperCalls === 1) {
      throw new Error("temporary local whisper failure");
    }

    const outputBase = String(args[args.indexOf("-of") + 1]);
    await writeFile(`${outputBase}.txt`, "agora transcreveu localmente");
    return { stdout: "", stderr: "" };
  };

  const transcription = await transcribeAudioWithLocalWhisper(new Uint8Array([1, 2, 3]), {
    enabled: true,
    ffmpegPath: "fake-ffmpeg",
    whisperCliPath: "fake-whisper",
    modelPath: "fake-model",
    executeCommand: runner,
    workDir: await buildWorkDir(),
    maxAttempts: 2,
    retryDelayMs: 0,
  });

  assert.equal(transcription, "agora transcreveu localmente");
  assert.equal(whisperCalls, 2);
});

test("transcribeAudioWithLocalWhisper returns null after local retry attempts are exhausted", async () => {
  let whisperCalls = 0;
  const runner: CommandRunner = async (command, args) => {
    if (command === "fake-ffmpeg") {
      await writeFile(String(args.at(-1)), new Uint8Array([0, 1, 2]));
      return { stdout: "", stderr: "" };
    }

    whisperCalls += 1;
    throw new Error("local whisper unavailable");
  };

  const transcription = await transcribeAudioWithLocalWhisper(new Uint8Array([1, 2, 3]), {
    enabled: true,
    ffmpegPath: "fake-ffmpeg",
    whisperCliPath: "fake-whisper",
    modelPath: "fake-model",
    executeCommand: runner,
    workDir: await buildWorkDir(),
    maxAttempts: 2,
    retryDelayMs: 0,
  });

  assert.equal(transcription, null);
  assert.equal(whisperCalls, 2);
});

test("transcribeAudioWithLocalWhisper skips local work when audio exceeds limit", async () => {
  let called = false;
  const runner: CommandRunner = async () => {
    called = true;
    return { stdout: "nao deveria rodar", stderr: "" };
  };

  const transcription = await transcribeAudioWithLocalWhisper(new Uint8Array(1025), {
    enabled: true,
    whisperCliPath: "fake-whisper",
    modelPath: "fake-model",
    executeCommand: runner,
    maxBytes: 1024,
  });

  assert.equal(transcription, null);
  assert.equal(called, false);
});
