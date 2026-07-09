import assert from "node:assert/strict";

import { expandSimulatorMediaAction } from "../simulatorMediaActions";

const mediaLibrary = [
  {
    name: "SAUDACAO_INFO_EXTRA",
    mediaType: "flow",
    flowItems: [
      {
        type: "text",
        order: 0,
        text: "Oi {nome} tudo bem?",
      },
      {
        type: "media",
        order: 1,
        mediaType: "audio",
        storageUrl: "https://example.com/audio.ogg",
        caption: "",
        fileName: "audio.ogg",
      },
    ],
  },
];

assert.deepEqual(
  expandSimulatorMediaAction(
    { type: "send_media", media_name: "SAUDACAO_INFO_EXTRA" },
    mediaLibrary,
    undefined,
  ),
  [
    { type: "send_text", text: "Oi tudo bem?" },
    {
      type: "send_media_url",
      media_url: "https://example.com/audio.ogg",
      media_type: "audio",
      caption: "",
      media_name: "SAUDACAO_INFO_EXTRA",
      file_name: "audio.ogg",
    },
  ],
  "o simulador deve hidratar placeholders do fluxo ao expandir a saudacao",
);

assert.deepEqual(
  expandSimulatorMediaAction(
    { type: "send_text", text: "Oi {nome} tudo bem?" },
    [],
    "Visitante",
  ),
  [{ type: "send_text", text: "Oi tudo bem?" }],
  "fallbacks genericos do simulador nao devem aparecer nas bolhas",
);

console.log("simulatorMediaActions.greetingFlow.test.ts ok");
