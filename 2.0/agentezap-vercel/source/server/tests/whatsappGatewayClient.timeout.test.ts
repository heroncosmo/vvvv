import assert from "node:assert/strict";

import { sendGatewayInstanceText } from "../whatsappGatewayClient.ts";

async function main() {
  const originalFetch = globalThis.fetch;
  const originalTimeout = process.env.WA_GATEWAY_REQUEST_TIMEOUT_MS;

  try {
    process.env.WA_GATEWAY_REQUEST_TIMEOUT_MS = "20";

    globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          (error as any).name = "AbortError";
          reject(error);
        }, { once: true });
      })) as typeof fetch;

    await assert.rejects(
      () => sendGatewayInstanceText("conn-timeout", { text: "teste" }),
      (error: any) => {
        assert.match(
          error?.message || "",
          /Gateway request timed out after 1000ms: POST \/internal\/instances\/conn-timeout\/messages\/send/,
        );
        return true;
      },
    );

    console.log("whatsappGatewayClient.timeout.test.ts ok");
  } finally {
    globalThis.fetch = originalFetch;

    if (originalTimeout === undefined) {
      delete process.env.WA_GATEWAY_REQUEST_TIMEOUT_MS;
    } else {
      process.env.WA_GATEWAY_REQUEST_TIMEOUT_MS = originalTimeout;
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
