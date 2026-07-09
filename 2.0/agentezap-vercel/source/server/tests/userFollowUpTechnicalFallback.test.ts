import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("follow-up manual e cron usam provider API normal e falham fechados sem mensagem publica local", () => {
  const httpSource = fs.readFileSync(path.resolve(process.cwd(), "api", "http.ts"), "utf8");
  const paritySource = fs.readFileSync(path.resolve(process.cwd(), "server", "vercelHttpParity.ts"), "utf8");

  assert.match(
    paritySource,
    /app\.all\("\/api\/followup\/conversation\/:id\/trigger",\s*delegateToVercelHttpHandler\)/,
    "trigger manual /api/followup deve delegar ao api/http antes do Express legado",
  );
  assert.doesNotMatch(
    paritySource,
    /app\.all\("\/api\/followup\/\*",\s*delegateToVercelHttpHandler\)/,
    "nao delegar o prefixo inteiro enquanto /reset nao tiver handler web-only equivalente",
  );

  const triggerStart = httpSource.indexOf("async function handleFollowupConversationTrigger");
  const triggerEnd = httpSource.indexOf("async function handleFollowupStats", triggerStart);
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart, "trigger manual web-only deve existir");
  const triggerBlock = httpSource.slice(triggerStart, triggerEnd);
  assert.match(triggerBlock, /runWebOnlyUserFollowupJob\(\{\s*conversationId\s*\}\)/);
  assert.doesNotMatch(triggerBlock, /userFollowUpService\.runCycleOnce/);

  const followupProviderStart = httpSource.indexOf("async function runWebOnlyFollowupProviderTask");
  const followupProviderEnd = httpSource.indexOf("async function generateWebOnlyAgenticFollowupPlan", followupProviderStart);
  assert.ok(followupProviderStart >= 0 && followupProviderEnd > followupProviderStart, "provider normal do follow-up deve existir");
  const followupProviderBlock = httpSource.slice(followupProviderStart, followupProviderEnd);
  assert.match(followupProviderBlock, /getResolvedLLMConfig\(params\.userId\)/);
  assert.doesNotMatch(followupProviderBlock, /runWebOnlyAgenticTask|runWebOnlyCodexCliText/);

  const providerCallStart = httpSource.indexOf("async function callWebOnlyFollowupProviderAttempt");
  const providerCallEnd = httpSource.indexOf("async function runWebOnlyFollowupProviderTask", providerCallStart);
  assert.ok(providerCallStart >= 0 && providerCallEnd > providerCallStart, "call provider do follow-up deve existir");
  const providerCallBlock = httpSource.slice(providerCallStart, providerCallEnd);
  assert.match(providerCallBlock, /https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/);
  assert.match(providerCallBlock, /https:\/\/integrate\.api\.nvidia\.com\/v1\/chat\/completions/);
  assert.match(providerCallBlock, /Authorization:\s*`Bearer \$\{params\.config\.openrouterApiKey\}`/);
  assert.match(providerCallBlock, /Authorization:\s*`Bearer \$\{params\.config\.nvidiaApiKey\}`/);

  const followupGeneratorStart = httpSource.indexOf("async function generateWebOnlyAgenticFollowupPlan");
  const followupGeneratorEnd = httpSource.indexOf("function resolveWebOnlyNextFollowupDate", followupGeneratorStart);
  assert.ok(followupGeneratorStart >= 0 && followupGeneratorEnd > followupGeneratorStart, "gerador de follow-up deve existir");
  const followupGeneratorBlock = httpSource.slice(followupGeneratorStart, followupGeneratorEnd);
  assert.match(followupGeneratorBlock, /runWebOnlyFollowupProviderTask\(\{/);
  assert.doesNotMatch(followupGeneratorBlock, /runWebOnlyAgenticTask\(\{/);

  const fallbackStart = httpSource.indexOf("function buildWebOnlyTechnicalFollowupFallbackPlan");
  const fallbackEnd = httpSource.indexOf("function extractWebOnlyFollowupSentMediaNames", fallbackStart);
  assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart, "fallback tecnico do follow-up deve existir");
  const fallbackBlock = httpSource.slice(fallbackStart, fallbackEnd);

  assert.match(fallbackBlock, /sem autoria publica/);
  assert.doesNotMatch(fallbackBlock, /action:\s*["']send["']/);
  assert.match(fallbackBlock, /action:\s*["']wait["']/);
  assert.match(fallbackBlock, /message:\s*["']["']/);
});
