import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const httpSource = fs.readFileSync(path.resolve(root, "api", "http.ts"), "utf8");
const codexRuntimeSource = fs.readFileSync(path.resolve(root, "server", "agenteZapCodexCliRuntime.ts"), "utf8");
const jobsSource = fs.readFileSync(path.resolve(root, "server", "statefulAppJobs.ts"), "utf8");
const paritySource = fs.readFileSync(path.resolve(root, "server", "vercelHttpParity.ts"), "utf8");

assert.doesNotMatch(jobsSource, /userFollowUpService\.runCycleOnce/);
assert.doesNotMatch(jobsSource, /userFollowUpService\.start\s*\(/);
assert.match(jobsSource, /runVpsCronHttpPath\("\/api\/cron\/stateful-jobs\/user-followup"/);
assert.match(
  paritySource,
  /app\.all\("\/api\/followup\/conversation\/:id\/trigger",\s*delegateToVercelHttpHandler\)/,
);

assert.match(httpSource, /async function runWebOnlyFollowupProviderTask/);
assert.match(httpSource, /const config = await getResolvedLLMConfig\(params\.userId\)/);
assert.match(httpSource, /https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/);
assert.match(httpSource, /https:\/\/integrate\.api\.nvidia\.com\/v1\/chat\/completions/);
assert.match(httpSource, /isOpenRouterFreeFallbackModel\(model\)/);
assert.match(httpSource, /routeOpenRouterModelForLowestPrice\(params\.attempt\.model,\s*params\.config\.openrouterProvider\)/);

const followupGeneratorStart = httpSource.indexOf("async function generateWebOnlyAgenticFollowupPlan");
const followupGeneratorEnd = httpSource.indexOf("function resolveWebOnlyNextFollowupDate", followupGeneratorStart);
assert.ok(followupGeneratorStart >= 0 && followupGeneratorEnd > followupGeneratorStart, "gerador de follow-up deve existir");
const followupGeneratorBlock = httpSource.slice(followupGeneratorStart, followupGeneratorEnd);
assert.match(followupGeneratorBlock, /runWebOnlyFollowupProviderTask\(\{/);
assert.doesNotMatch(followupGeneratorBlock, /runWebOnlyAgenticTask\(\{/);
assert.doesNotMatch(followupGeneratorBlock, /runWebOnlyCodexCliText/);
assert.match(followupGeneratorBlock, /mediaActions/);

assert.doesNotMatch(codexRuntimeSource, /function isCodexFollowupPlanTask/);
assert.doesNotMatch(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_FOLLOWUP_MODEL/);
assert.doesNotMatch(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_FOLLOWUP_REASONING_EFFORT/);

console.log("userFollowUpCodexExclusion.source.test.ts: ok");
