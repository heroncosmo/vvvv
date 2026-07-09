import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const httpSource = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8").split("\r\n").join("\n");

assert.match(
  httpSource,
  /function hasWebOnlyIncompleteSectionHeading[\s\S]*function assertWebOnlyPublicOutputComplete/,
  "web-only final response must detect incomplete trailing section headings",
);

assert.match(
  httpSource,
  /normalized\.includes\("incomplete_section_heading"\)/,
  "Codex incomplete public output must be treated as an operational fallback error",
);

assert.match(
  httpSource,
  /const codexText = await runWebOnlyCodexCliText[\s\S]*if \(!hasWebOnlyIncompleteSectionHeading\(codexText\)\)[\s\S]*return codexText/,
  "Codex response must be accepted only when it does not end with an incomplete section heading",
);

assert.match(
  httpSource,
  /A resposta anterior terminou em um titulo ou secao incompleta[\s\S]*completion-retry[\s\S]*Math\.max\(params\.maxTokens \?\? 700, 1200\)/,
  "Codex incomplete section heading must trigger a completion retry with larger output budget",
);

assert.match(
  httpSource,
  /return assertWebOnlyPublicOutputComplete\("codex-cli", retryText\)/,
  "Codex completion retry must still reject incomplete public output",
);

assert.match(
  httpSource,
  /return assertWebOnlyPublicOutputComplete\(provider,\s*enforceWebOnlyRecapPendingSignal\(/,
  "direct provider fallback responses must also pass the incomplete-output guard",
);

console.log("webOnlyIncompleteSectionRetry.source.test.ts ok");
