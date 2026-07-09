import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const httpSource = readFileSync(resolve(__dirname, "../../api/http.ts"), "utf8");
const aiAgentSource = readFileSync(resolve(__dirname, "../aiAgent.ts"), "utf8");

assert.ok(
  httpSource.includes("buildNeuropsiRuntimeResponse"),
  "Public/web-only simulator must use the Neuropsi Sheila runtime contract before free LLM text",
);

assert.ok(
  httpSource.includes("buildBusinessFaqDirectAnswer"),
  "Public/web-only simulator must use generic tenant FAQ direct answers before free LLM text",
);

assert.ok(
  httpSource.includes('bac.faq_items AS "businessFaqItems"'),
  "Public/web-only simulator must load tenant FAQ items from business_agent_configs",
);

assert.ok(
  httpSource.includes("mode: \"business_faq_direct_answer\""),
  "Public/web-only simulator must expose generic FAQ direct-answer mode for auditability",
);

assert.ok(
  httpSource.includes("neuropsi_sheila_runtime_contract"),
  "Public/web-only simulator must expose a dedicated Neuropsi contract mode for auditability",
);

assert.ok(
  aiAgentSource.includes("buildNeuropsiRuntimeResponse"),
  "Unified WhatsApp runtime must use the same Neuropsi Sheila runtime contract",
);

console.log("neuropsiWebOnlyContract.source.test.ts ok");
