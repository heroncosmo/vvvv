import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync("api/http.ts", "utf8");
const resolverSource = readFileSync("server/promisedMediaResolver.ts", "utf8");

test("web-only simulator can create contextual media candidates from whenToUse", () => {
  assert.match(
    apiSource,
    /resolveContextualMediaWithAISdk/,
    "web-only runtime should use the structured contextual media resolver",
  );
  assert.match(
    apiSource,
    /function hasWebOnlyPotentialContextualMediaConfigMatch/,
    "web-only runtime should prefilter contextual media turns before calling the resolver",
  );
  assert.match(
    apiSource,
    /async function buildWebOnlyStructuredContextualMediaActions/,
    "web-only runtime should build contextual media actions before arbitration",
  );
  assert.match(
    apiSource,
    /const structuredContextualMediaActions = await buildWebOnlyStructuredContextualMediaActions\(\{/,
    "structured contextual media actions should be merged into the normal media pipeline",
  );
  assert.match(
    apiSource,
    /isWebOnlyLocationOrVisitTextOnlyRequest\(params\.message\)\) return false;/,
    "address/location text-only turns should not trigger contextual media prefilter",
  );
});

test("operational media matching does not use captions as address triggers", () => {
  const start = apiSource.indexOf("function buildWebOnlyOperationalMediaActions");
  const end = apiSource.indexOf("const WEB_ONLY_CONFIGURED_FLOW_FALLBACK_TERMS", start);
  const operationalBlock = start >= 0 && end > start ? apiSource.slice(start, end) : "";

  assert.ok(operationalBlock, "buildWebOnlyOperationalMediaActions block should exist");
  assert.doesNotMatch(
    operationalBlock,
    /media\?\.caption/,
    "generic captions can contain addresses/prices and must not trigger operational media by themselves",
  );
});

test("contextual resolver prompt protects product media from operational-only turns", () => {
  assert.match(
    resolverSource,
    /Use SEND quando uma unica candidata combina claramente com a mensagem atual e com o campo whenToUse/,
    "resolver should allow contextual media without explicit photo/video wording",
  );
  assert.match(
    resolverSource,
    /Nao escolha midia de curso, produto, catalogo ou tema comercial para pergunta apenas de endereco/,
    "resolver should block course/product media for address-only turns",
  );
});

test("web-only simulator has generic configured-flow fallback for material/payment turns", () => {
  assert.match(
    apiSource,
    /function buildWebOnlyConfiguredFlowFallbackActions/,
    "web-only runtime should have a generic fallback for tenant-configured flows",
  );
  assert.match(
    apiSource,
    /getWebOnlyConfiguredFlowItems\(media\)/,
    "fallback should read configured flow items instead of hardcoding a tenant",
  );
  assert.match(
    apiSource,
    /const configuredFlowFallback = buildWebOnlyConfiguredFlowFallbackActions\(\{/,
    "configured-flow fallback should be merged into the normal media pipeline",
  );
  assert.match(
    apiSource,
    /configuredFlowFallback: effectiveConfiguredFlowFallback\.selectedFlowName/,
    "configured-flow fallback should be visible in runtime trace for validation",
  );
  assert.match(
    apiSource,
    /function buildWebOnlyConfiguredFlowFallbackPayload/,
    "configured-flow fallback should also be able to build a complete simulator payload",
  );
  assert.match(
    apiSource,
    /catch \(error\) \{\s*const configuredFlowErrorFallback = buildWebOnlyConfiguredFlowFallbackPayload\(\{/s,
    "LLM provider failures should fall back to tenant-configured flow actions when the turn matches",
  );
  assert.match(
    apiSource,
    /return \{ status: 200, payload: configuredFlowErrorFallback \};/,
    "configured-flow provider fallback should keep the simulator response successful instead of returning 500",
  );
  assert.match(
    apiSource,
    /function hasWebOnlyConfiguredFlowConsentPrompt/,
    "configured-flow fallback should detect when the assistant is still asking for explicit confirmation",
  );
  assert.match(
    apiSource,
    /configuredFlowFallbackSuppressedByConsent/,
    "normal pipeline should not send configured-flow actions in the same turn that asks the customer to reply SIM",
  );
  assert.match(
    apiSource,
    /WEB_ONLY_CONFIGURED_FLOW_VIEW_BEFORE_PAYMENT_RE/,
    "view-before-payment turns should be eligible for configured-flow material links",
  );
  assert.match(
    apiSource,
    /Array\.isArray\(mediaItem\.flow_items\)/,
    "flow expansion should tolerate snake_case flow_items from persistence layers",
  );
});
