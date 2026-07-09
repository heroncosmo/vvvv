import test from "node:test";
import assert from "node:assert/strict";

import {
  createOpenRouterProviderRoutingFetch,
  injectOpenRouterProviderIntoBody,
} from "../openRouterProviderRouting";
import type { OpenRouterProviderPreference } from "../llmConfigResolver";

const cheapOnlyPreference: OpenRouterProviderPreference = {
  order: ["deepinfra", "dekallm"],
  only: ["deepinfra", "dekallm"],
  allow_fallbacks: false,
};

test("injectOpenRouterProviderIntoBody adds provider routing to JSON request bodies", () => {
  const body = JSON.stringify({
    model: "mistralai/mistral-nemo",
    messages: [{ role: "user", content: "Oi" }],
    tools: [{ type: "function", function: { name: "calc", parameters: { type: "object" } } }],
  });

  const injected = injectOpenRouterProviderIntoBody(body, cheapOnlyPreference);
  assert.equal(typeof injected, "string");

  const parsed = JSON.parse(String(injected));
  assert.equal(parsed.model, "mistralai/mistral-nemo");
  assert.deepEqual(parsed.provider, cheapOnlyPreference);
  assert.deepEqual(parsed.tools[0].function.name, "calc");
});

test("injectOpenRouterProviderIntoBody overwrites stale provider routing for the scoped candidate", () => {
  const body = JSON.stringify({
    model: "mistralai/mistral-nemo",
    provider: {
      order: ["mistral"],
      allow_fallbacks: true,
    },
  });

  const injected = injectOpenRouterProviderIntoBody(body, cheapOnlyPreference);
  const parsed = JSON.parse(String(injected));

  assert.deepEqual(parsed.provider, cheapOnlyPreference);
});

test("injectOpenRouterProviderIntoBody leaves non JSON or missing preference bodies untouched", () => {
  assert.equal(injectOpenRouterProviderIntoBody("not-json", cheapOnlyPreference), "not-json");
  assert.equal(
    injectOpenRouterProviderIntoBody(JSON.stringify({ model: "mistralai/mistral-nemo" }), undefined),
    JSON.stringify({ model: "mistralai/mistral-nemo" }),
  );
});

test("createOpenRouterProviderRoutingFetch injects provider routing before the SDK request is sent", async () => {
  const capturedBodies: string[] = [];
  const fakeFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBodies.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const routedFetch = createOpenRouterProviderRoutingFetch(cheapOnlyPreference, fakeFetch);
  await routedFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "mistralai/mistral-nemo",
      messages: [{ role: "user", content: "Oi" }],
    }),
  });

  assert.equal(capturedBodies.length, 1);
  assert.deepEqual(JSON.parse(capturedBodies[0]).provider, cheapOnlyPreference);
});

console.log("openRouterProviderRouting.test.ts ok");
