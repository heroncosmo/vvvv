import assert from "node:assert/strict";

import { sanitizeOutgoingLinks } from "../linkSanitizer";

const duplicatedMarkdown = `Link: [https://www.landmarkimoveis.com.br/detalhes-imovel/33](https://www.landmarkimoveis.com.br/detalhes-imovel/33).

https://www.landmarkimoveis.com.br/detalhes-imovel/33]`;

const sanitized = sanitizeOutgoingLinks(duplicatedMarkdown);

assert.match(sanitized, /Link: https:\/\/www\.landmarkimoveis\.com\.br\/detalhes-imovel\/33/);
assert.equal(
  sanitized.includes("](https://www.landmarkimoveis.com.br/detalhes-imovel/33)"),
  false,
);
assert.equal(sanitized.includes("]"), false);
assert.equal(
  sanitized.match(/https:\/\/www\.landmarkimoveis\.com\.br\/detalhes-imovel\/33/g)?.length,
  1,
);

console.log("linkSanitizer.test.ts ok");
