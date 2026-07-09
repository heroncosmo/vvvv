import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/agentezap_test";

test("normalizeMistralApiKeys parses json, plain text and removes duplicates", async () => {
  const { normalizeMistralApiKeys } = await import("../llmConfigResolver");
  const first = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const second = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  assert.deepEqual(
    normalizeMistralApiKeys([
      JSON.stringify([first, second]),
      `${first}\n${second}`,
      "short",
    ]),
    [first, second],
  );
});

test("applyAgentLLMConfigOverride keeps legacy first key from custom list", async () => {
  const { applyAgentLLMConfigOverride } = await import("../llmConfigResolver");
  const first = "cccccccccccccccccccccccccccccccc";
  const second = "dddddddddddddddddddddddddddddddd";

  const resolved = applyAgentLLMConfigOverride(
    {
      provider: "mistral",
      providerOrder: ["mistral", "openrouter", "nvidia", "groq"],
      deepinfraApiKey: "",
      deepinfraTranscriptionModel: "mistralai/Voxtral-Mini-3B-2507",
      groqApiKey: "",
      groqModel: "openai/gpt-oss-20b",
      openrouterApiKey: "",
      openrouterModel: "google/gemma-3-4b-it:free",
      openrouterModels: ["google/gemma-3-4b-it:free"],
      openrouterProvider: "auto",
      mistralApiKey: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      mistralApiKeys: ["eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
      mistralModel: "mistral-medium-latest",
      mistralChatEnabled: true,
      nvidiaApiKey: "",
      nvidiaModel: "nvidia/llama-3.3-nemotron-super-49b-v1",
      nvidiaModels: ["nvidia/llama-3.3-nemotron-super-49b-v1"],
      usesUserOverride: false,
    },
    {
      mode: "custom",
      mistralApiKeys: [first, second],
    },
    "user-1",
  );

  assert.equal(resolved.mistralApiKey, first);
  assert.deepEqual(resolved.mistralApiKeys, [first, second]);
  assert.equal(resolved.usesUserOverride, true);
});
