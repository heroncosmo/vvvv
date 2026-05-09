import assert from "node:assert/strict";

import { buildGreetingOpeningFlowActions } from "../aiAgent";

const actions = buildGreetingOpeningFlowActions({
  flowMedia: {
    name: "SAUDACAO_INFO_EXTRA",
    flowItems: [
      {
        id: "step-1",
        type: "text",
        order: 0,
        text: "Oi {nome} tudo bem?",
      },
      {
        id: "step-2",
        type: "media",
        order: 1,
        mediaType: "audio",
        storageUrl: "https://example.com/audio.ogg",
        fileName: "audio.ogg",
      },
    ],
  },
  openingText: null,
  contactName: "Ana",
});

assert.deepEqual(
  actions,
  [
    {
      type: "send_text",
      text: "Oi Ana tudo bem?",
      media_name: "SAUDACAO_INFO_EXTRA",
      opening_flow_source: "greeting",
    },
    {
      type: "send_media_url",
      media_url: "https://example.com/audio.ogg",
      media_type: "audio",
      caption: undefined,
      media_name: "SAUDACAO_INFO_EXTRA",
      file_name: "audio.ogg",
      opening_flow_source: "greeting",
    },
  ],
  "o fluxo de saudacao precisa sair marcado como abertura para impedir texto livre no primeiro turno",
);

console.log("greetingOpeningFlowActions.test.ts ok");
