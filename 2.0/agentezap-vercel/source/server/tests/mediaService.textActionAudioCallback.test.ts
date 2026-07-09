import assert from "node:assert/strict";

import { executeMediaActions } from "../mediaService";

const originalFetch = global.fetch;

let fetchCalls = 0;
let firstTextCallbackValue: string | null = null;

global.fetch = (async () => {
  fetchCalls += 1;
  return {
    async json() {
      return { key: { id: `msg-${fetchCalls}` } };
    },
  } as any;
}) as typeof fetch;

try {
  await executeMediaActions({
    userId: "test-user",
    jid: "5511999999999@s.whatsapp.net",
    conversationId: "",
    actions: [
      { type: "send_text", text: "Primeira etapa" } as any,
      { type: "send_text", text: "Segunda etapa" } as any,
    ],
    wapiConfig: {
      apiUrl: "https://example.invalid",
      apiKey: "token",
      instanceId: "instance",
    } as any,
    onFirstTextActionSent: async (text) => {
      firstTextCallbackValue = text;
    },
  });

  assert.equal(firstTextCallbackValue, "Primeira etapa");
  assert.equal(fetchCalls, 2);

  console.log("mediaService.textActionAudioCallback.test.ts ok");
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  global.fetch = originalFetch;
}
