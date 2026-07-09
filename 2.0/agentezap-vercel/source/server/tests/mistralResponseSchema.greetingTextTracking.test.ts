import assert from "node:assert/strict";

import { mistralResponseSchema } from "@shared/schema";

const parsed = mistralResponseSchema.parse({
  messages: [],
  actions: [
    {
      type: "send_text",
      text: "Olá, seja bem-vindo.",
      media_name: "SAUDACAO_INFO_EXTRA",
      opening_flow_source: "greeting",
    },
  ],
});

assert.deepEqual(
  parsed.actions,
  [
    {
      type: "send_text",
      text: "Olá, seja bem-vindo.",
      media_name: "SAUDACAO_INFO_EXTRA",
      opening_flow_source: "greeting",
    },
  ],
  "o parser precisa preservar a tag de mídia no texto da saudação",
);

console.log("mistralResponseSchema.greetingTextTracking.test.ts ok");
