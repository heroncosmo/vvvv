import assert from "node:assert/strict";

import { isFirstClientMessageForKeywordFallback } from "../mediaService";

assert.equal(
  isFirstClientMessageForKeywordFallback([]),
  true,
);

assert.equal(
  isFirstClientMessageForKeywordFallback([
    { text: "oi", fromMe: false },
    { text: "ola", fromMe: true },
  ]),
  false,
);

assert.equal(
  isFirstClientMessageForKeywordFallback([
    { text: "oi", fromMe: false },
    { text: "ola", fromMe: true },
    { text: "tenho uma duvida", fromMe: false },
    { text: "claro", fromMe: true },
  ]),
  false,
);

console.log("mediaService.keywordFallbackTurnContext.test.ts ok");
process.exit(0);
