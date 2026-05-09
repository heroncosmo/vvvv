import assert from "node:assert/strict";

import { sendMediaUrlViaBaileys, type MediaUrlActionPayload } from "../mediaService";

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
      }) as Response) as typeof fetch;

    const sentPayloads: any[] = [];
    const successSocket = {
      sendMessage: async (_jid: string, payload: any) => {
        sentPayloads.push(payload);
        return { key: { id: "msg-123" } };
      },
    };

    const imageAction: MediaUrlActionPayload = {
      media_url: "https://cdn.exemplo.com/catalogo/produto.jpg",
      media_type: "image",
      caption: "Painel Galaxia",
    };

    const successResult = await sendMediaUrlViaBaileys(
      successSocket,
      "5511999999999@s.whatsapp.net",
      imageAction,
    );

    assert.equal(successResult.success, true);
    assert.equal(successResult.messageId, "msg-123");
    assert.equal(Buffer.isBuffer(sentPayloads[0].image), true);
    assert.equal(sentPayloads[0].caption, "Painel Galaxia");

    const failedSocket = {
      sendMessage: async () => ({}),
    };

    const failedResult = await sendMediaUrlViaBaileys(
      failedSocket,
      "5511999999999@s.whatsapp.net",
      imageAction,
    );

    assert.equal(failedResult.success, false);
    assert.equal(failedResult.error, "No message ID returned");

    console.log("mediaService.sendMediaUrl.test.ts ok");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
