import test from "node:test";
import assert from "node:assert/strict";

import { setMockMistralClient } from "../mistralClient";
import { transcribeAudio } from "../mediaService";

test("transcribeAudio refaz tentativas automáticas após rate limit temporário", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let attempts = 0;

  globalThis.fetch = async () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "audio/ogg" },
    });

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
            const error: any = new Error("Rate limit per minute");
            error.statusCode = 429;
            throw error;
          }

          return { text: "Quero deixar o agente mais vendedor." };
        },
      },
    },
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    setMockMistralClient(null);
  });

  const transcription = await transcribeAudio("https://example.com/audio.ogg", "audio/ogg");

  assert.equal(transcription, "Quero deixar o agente mais vendedor.");
  assert.equal(attempts, 3);
});
