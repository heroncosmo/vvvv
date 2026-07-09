import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("api/http.ts", "utf8");

test("web-only configured flow fast path runs before the LLM call", () => {
  assert.match(
    source,
    /function buildWebOnlyConfiguredFlowFastPathPayload/,
    "runtime should expose a dedicated configured-flow fast path",
  );

  const handlerSource = source.slice(
    source.indexOf("const configuredFlowFastPath = buildWebOnlyConfiguredFlowFastPathPayload"),
    source.indexOf("rawResponseText = await callWebOnlyLlm"),
  );
  assert.match(
    handlerSource,
    /return \{ status: 200, payload: configuredFlowFastPath \};/,
    "high-confidence configured flows should return before calling the LLM",
  );
});

test("configured flow fast path does not use recipe-only interest as a direct send trigger", () => {
  const fastTermsStart = source.indexOf("const WEB_ONLY_CONFIGURED_FLOW_FAST_DIRECT_TERMS");
  const fastTermsEnd = source.indexOf("const WEB_ONLY_CONFIGURED_FLOW_RECIPE_DIRECT_RE");
  assert.notEqual(fastTermsStart, -1, "fast direct terms must exist");
  assert.notEqual(fastTermsEnd, -1, "recipe direct regex must remain separate from fast terms");

  const fastTermsSource = source.slice(fastTermsStart, fastTermsEnd);
  assert.doesNotMatch(
    fastTermsSource,
    /"receita"|"receitas"|"interesse"/,
    "interest in recipes should let the agent ask consent instead of instantly sending the whole flow",
  );
  assert.match(
    fastTermsSource,
    /"pix"[\s\S]*"contribuicao"/,
    "explicit payment/link requests should remain eligible for the fast path",
  );
});

test("configured flow continuation recognizes basta dizer sim consent copy", () => {
  assert.match(
    source,
    /"basta dizer sim"/,
    "short consent continuations should catch the common 'basta dizer SIM' phrasing before the LLM",
  );
});
