import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const httpSource = readFileSync(resolve(__dirname, "../../api/http.ts"), "utf8");

assert.ok(
  httpSource.includes("options: { preserveUrlSchemes?: boolean }"),
  "web-only text settings must expose preserveUrlSchemes",
);

assert.match(
  httpSource,
  /const splitResponses = applyWebOnlyTextSettings\(bittencourtDirectResponse\.text,\s*config,\s*\{\s*preserveUrlSchemes:\s*true,\s*\}\);/s,
  "Bittencourt direct web-only response must preserve https:// links",
);

console.log("bittencourtWebOnlyPreserveLinks.source.test.ts ok");
