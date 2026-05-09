import assert from "node:assert/strict";

import { mergeInitialOpeningMediaActions } from "../initialOpeningMediaActions";

const openingMediaOnly = [
  {
    type: "send_media",
    media_name: "KIT_LEN_OL_E_FRONHAS_CASAL",
  },
];

const llmActions = [
  {
    type: "send_text",
    text: "Perfeito! Vou te mostrar as opcoes do kit casal agora.",
  },
  {
    type: "send_media",
    media_name: "KIT_LEN_OL_E_FRONHAS_CASAL",
  },
  {
    type: "send_media",
    media_name: "KIT_LEN_OL_E_FRONHAS_KING",
  },
];

const merged = mergeInitialOpeningMediaActions(openingMediaOnly as any, llmActions as any);

assert.deepEqual(merged, [
  {
    type: "send_media",
    media_name: "KIT_LEN_OL_E_FRONHAS_CASAL",
  },
  {
    type: "send_text",
    text: "Perfeito! Vou te mostrar as opcoes do kit casal agora.",
  },
  {
    type: "send_media",
    media_name: "KIT_LEN_OL_E_FRONHAS_KING",
  },
]);

assert.deepEqual(
  mergeInitialOpeningMediaActions([], llmActions as any),
  llmActions,
);

console.log("aiAgent.initialOpeningMedia.test.ts ok");
