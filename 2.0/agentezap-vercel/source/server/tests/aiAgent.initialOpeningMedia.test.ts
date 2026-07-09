import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

const aiAgentSource = readFileSync(new URL("../aiAgent.ts", import.meta.url), "utf8");
assert.match(
  aiAgentSource,
  /openingFlowAlreadySent:\s*hasGreetingOpeningFlowAction\(mediaActions\)/,
  "midia comum de produto nao pode ser tratada como fluxo de saudacao no finalizador",
);
assert.match(
  aiAgentSource,
  /openingFlowAlreadySent:\s*hasGreetingOpeningFlowAction\(openingMediaActions\)/,
  "midia inicial comum nao pode acionar reescrita de abertura como se fosse saudacao",
);
assert.doesNotMatch(
  aiAgentSource,
  /openingFlowAlreadySent:\s*openingMediaActions\.length\s*>\s*0/,
  "quantidade de midias nao identifica fluxo de saudacao",
);

console.log("aiAgent.initialOpeningMedia.test.ts ok");
