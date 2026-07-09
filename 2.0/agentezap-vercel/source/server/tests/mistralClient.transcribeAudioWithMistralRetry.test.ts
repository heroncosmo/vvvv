import test from "node:test";
import assert from "node:assert/strict";

import {
  AudioTranscriptionError,
  setMockMistralClient,
  transcribeAudioWithMistral,
} from "../mistralClient";

test("transcribeAudioWithMistral retries retryable provider failures", async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  let attempts = 0;

  globalThis.setTimeout = (((callback: TimerHandler) => {
    if (typeof callback === "function") {
      callback();
    }
    return 0 as ReturnType<typeof setTimeout>;
  }) as unknown) as typeof setTimeout;

  setMockMistralClient({
    audio: {
      transcriptions: {
        complete: async () => {
          attempts += 1;

          if (attempts < 3) {
            const error: any = new Error("temporarily unavailable");
            error.statusCode = 503;
            throw error;
          }

          return { text: "Quero deixar o agente mais vendedor." };
        },
      },
    },
  });

  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    setMockMistralClient(null);
  });

  const transcription = await transcribeAudioWithMistral(new Uint8Array([1, 2, 3]), {
    fileName: "audio.ogg",
    initialDelayMs: 1,
    maxDelayMs: 1,
  });

  assert.equal(transcription, "Quero deixar o agente mais vendedor.");
  assert.equal(attempts, 3);
});

test("transcribeAudioWithMistral throws retryable failure after exhausted attempts when requested", async (t) => {
  const originalSetTimeout = globalThis.setTimeout;
  let attempts = 0;

  globalThis.setTimeout = (((callback: TimerHandler) => {
    if (typeof callback === "function") {
      callback();
    }
    return 0 as ReturnType<typeof setTimeout>;
  }) as unknown) as typeof setTimeout;

  setMockMistralClient({
    audio: {
      transcriptions: {
        complete: async () => {
          attempts += 1;
          const error: any = new Error("Too Many Requests");
          error.statusCode = 429;
          error.headers = { "retry-after": "7" };
          throw error;
        },
      },
    },
  });

  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    setMockMistralClient(null);
  });

  await assert.rejects(
    () => transcribeAudioWithMistral(new Uint8Array([1, 2, 3]), {
      fileName: "audio.ogg",
      initialDelayMs: 1,
      maxDelayMs: 1,
      maxAttempts: 2,
      throwOnFailure: true,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AudioTranscriptionError);
      assert.equal(error.retryable, true);
      assert.equal(error.statusCode, 429);
      assert.equal(error.retryAfterMs, 7000);
      return true;
    },
  );
  assert.equal(attempts, 2);
});
