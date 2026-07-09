import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const mistralClientSource = fs.readFileSync(path.resolve(process.cwd(), "server", "mistralClient.ts"), "utf8");
const llmSource = fs.readFileSync(path.resolve(process.cwd(), "server", "llm.ts"), "utf8");

function blockBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Nao encontrou bloco ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Nao encontrou fim ${endMarker}`);
  return source.slice(start, end);
}

const fallbackBlock = blockBetween(
  mistralClientSource,
  "async function analyzeImageWithVisionFallbacks",
  "let globalMockClient",
);

const nvidiaIndex = fallbackBlock.indexOf("analyzeImageWithNvidia");
const openRouterIndex = fallbackBlock.indexOf("analyzeImageWithOpenRouter");
const directMistralIndex = fallbackBlock.indexOf("analyzeImageWithDirectMistral");

assert.ok(nvidiaIndex >= 0, "imagem deve tentar NVIDIA primeiro");
assert.ok(openRouterIndex > nvidiaIndex, "OpenRouter barato deve vir depois da NVIDIA");
assert.ok(directMistralIndex > openRouterIndex, "Mistral direto deve ser ultimo fallback de visao");

assert.match(
  mistralClientSource,
  /DEFAULT_OPENROUTER_VISION_MODELS[\s\S]*"nvidia\/nemotron-nano-12b-v2-vl:free"[\s\S]*"openrouter\/free"[\s\S]*"mistralai\/mistral-small-3\.2-24b-instruct"/,
  "fallback OpenRouter de imagem deve priorizar gratuito/barato e modelo de visao",
);

assert.match(
  blockBetween(mistralClientSource, "async function analyzeImageWithNvidia", "async function analyzeImageWithOpenRouter"),
  /https:\/\/integrate\.api\.nvidia\.com\/v1\/chat\/completions[\s\S]*image_url[\s\S]*max_tokens:\s*300/,
  "NVIDIA vision deve usar endpoint OpenAI-compatible com image_url",
);

assert.match(
  blockBetween(mistralClientSource, "async function analyzeImageWithOpenRouter", "async function analyzeImageWithDirectMistral"),
  /provider:\s*\{[\s\S]*sort:\s*"price"[\s\S]*allow_fallbacks:\s*true/,
  "OpenRouter vision deve priorizar menor preco",
);

assert.match(
  llmSource,
  /legacy_llm_provider_disabled_codex_contract_required/,
  "chatComplete legado sem userId deve continuar bloqueado pelo contrato Codex",
);

console.log("imageVisionProviderOrder.source.test.ts: ok");
