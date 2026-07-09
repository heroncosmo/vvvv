import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const httpSource = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8").split("\r\n").join("\n");

assert.match(
  httpSource,
  /function stripWebOnlyCurrentContextPriorityBlocks/,
  "web-only final response sanitizer must strip current-context priority blocks",
);

assert.match(
  httpSource,
  /prioridade\\s\+do\\s\+contexto\\s\+atual/,
  "web-only leak detection must recognize the current-context priority header",
);

assert.match(
  httpSource,
  /prompt\\\/config\\s\+atual/,
  "web-only leak detection must recognize prompt/config current-context wording",
);

assert.match(
  httpSource,
  /mensagens\\s\+antigas\\s\+do\\s\+assistente/,
  "web-only leak detection must recognize assistant-history internal wording",
);

assert.match(
  httpSource,
  /prioridade\\s\+maxima/,
  "web-only leak detection must drop tenant prompt priority headers from public output",
);

assert.match(
  httpSource,
  /\^#\{1,6\}\\s\*atencao\\s\*:/,
  "web-only leak detection must drop internal attention markdown headers from public output",
);

assert.match(
  httpSource,
  /regras\\s\+a\\s\+serem\\s\+obedecidas\\s\+nesta\\s\+resposta/,
  "web-only leak detection must drop internal planning rules from public output",
);

assert.match(
  httpSource,
  /resposta\\s\+atual\\s\*:/,
  "web-only leak detection must drop internal current-response audit lines",
);

assert.match(
  httpSource,
  /resposta\\s\+ao\\s\+pedido\\s\+concreto/,
  "web-only leak detection must drop concrete-request planning labels",
);

assert.match(
  httpSource,
  /proxima\\s\+acao\\s\+\(\?:esperada\\s\+do\\s\+cliente\|do\\s\+agente\)\\s\*:/,
  "web-only leak detection must drop internal next-action audit lines",
);

assert.match(
  httpSource,
  /para\\s\+atender\\s\+as\\s\+regras\\s\+de\\s\+qualificacao\\s\+inicial/,
  "web-only leak detection must drop qualification-continuation planning labels",
);

assert.match(
  httpSource,
  /to\\s\+do\\s\+atendente\\s\+humano/,
  "web-only leak detection must drop internal human-attendant todo lines",
);

assert.match(
  httpSource,
  /acao\\s\+corretiva\\s\*:/,
  "web-only leak detection must drop corrective-action audit lines",
);

assert.match(
  httpSource,
  /we\\s\+need\\s\+to\\s\+respond/,
  "web-only leak detection must strip English reasoning prefaces before public answers",
);

assert.match(
  httpSource,
  /must\\s\+respond\\s\+exactly/,
  "web-only leak detection must preserve only the exact public answer after reasoning leaks",
);

console.log("webOnlyInternalContextLeakGuard.source.test.ts ok");
