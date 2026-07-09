import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../aiAgent.ts", import.meta.url), "utf8");

const mainLlmSection = source.slice(
  source.indexOf("// 🚀 SISTEMA DE LLM MULTI-PROVIDER"),
  source.indexOf("// ════════════════════════════════════════════════════════════════════════════", source.indexOf("// 🚀 SISTEMA DE LLM MULTI-PROVIDER")),
);

assert.match(
  mainLlmSection,
  /const llmClient = await getLLMClient\(userId\);/,
  "generateAIResponse must resolve the LLM client with the tenant userId",
);

assert.match(
  mainLlmSection,
  /const currentProvider = await getCurrentProvider\(userId\);/,
  "generateAIResponse must resolve the current provider with the tenant userId",
);

const simulatorRepairSection = source.slice(
  source.indexOf("repairFirstConcreteOpeningReply({"),
  source.indexOf("console.log(`🧪 [SIMULADOR] ✅ Resposta gerada", source.indexOf("repairFirstConcreteOpeningReply({")),
);

assert.match(
  simulatorRepairSection,
  /const llmClient = await getLLMClient\(userId\);/,
  "simulator opening repair must resolve the LLM client with the tenant userId",
);

assert.match(
  simulatorRepairSection,
  /const currentProvider = await getCurrentProvider\(userId\);/,
  "simulator opening repair must resolve the current provider with the tenant userId",
);

const openingOnlySection = source.slice(
  source.indexOf("async function generateOpeningOnlyResponse"),
  source.indexOf("export async function repairFirstConcreteOpeningReply"),
);

assert.match(
  openingOnlySection,
  /async function generateOpeningOnlyResponse\(openingRule: AgentOpeningRule, userId\?: string\)/,
  "opening-only variation must accept the tenant userId",
);

assert.match(
  openingOnlySection,
  /const llmClient = await getLLMClient\(userId\);/,
  "opening-only variation must resolve the LLM client with the tenant userId",
);

assert.match(
  openingOnlySection,
  /openingVariationPreservesIdentity\(fallback, responseText\)/,
  "opening-only variation must reject identity shifts introduced by the model",
);

assert.ok(
  source.includes("generateOpeningOnlyResponse(initialOpeningRule, userId)") &&
    source.includes("generateOpeningOnlyResponse(openingRuleForCurrentTurn, userId)") &&
    !source.includes("generateOpeningOnlyResponse(initialOpeningRule)") &&
    !source.includes("generateOpeningOnlyResponse(openingRuleForCurrentTurn)"),
  "all opening-only variation call sites must pass userId",
);

console.log("aiAgentLlmUserContext.source.test passed");
