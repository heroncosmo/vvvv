import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const webOnlySource = fs.readFileSync(path.resolve(process.cwd(), "api", "http.ts"), "utf8");
const mistralClientSource = fs.readFileSync(path.resolve(process.cwd(), "server", "mistralClient.ts"), "utf8");

function blockBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Nao encontrou bloco ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Nao encontrou fim ${endMarker}`);
  return source.slice(start, end);
}

assert.equal(
  webOnlySource.includes("function getWebOnlyMistralVisionKeys"),
  true,
  "web-only deve ter helper separado para Mistral em imagem/visao",
);

assert.match(
  blockBetween(webOnlySource, "async function analyzeWebOnlyIncomingImageWithVision", "const webOnlyCatalogImageMatchSchema"),
  /analyzeImageWithMistral\([\s\S]*params\.imageUrl[\s\S]*params\.prompt[\s\S]*params\.userId/,
  "leitura de imagem recebida deve usar a cadeia compartilhada de visao com fallbacks",
);

assert.equal(
  webOnlySource.includes("const directMistralApiKeys = llmConfig ? getWebOnlyMistralVisionKeys(llmConfig) : [];"),
  true,
  "comparacao visual direta de catalogo deve usar helper de visao, nao helper de chat",
);

assert.match(
  blockBetween(webOnlySource, "function getWebOnlyMistralChatKeys", "function getWebOnlyMistralVisionKeys"),
  /mistralChatEnabled === false[\s\S]*return \[\];/,
  "helper de chat precisa continuar bloqueando Mistral quando a flag esta falsa",
);

assert.match(
  blockBetween(mistralClientSource, "async function analyzeImageWithDirectMistral", "async function analyzeImageWithVisionFallbacks"),
  /allowWhenChatDisabled:\s*true/,
  "Mistral direto deve continuar liberado somente dentro da frente de imagem",
);

assert.match(
  blockBetween(mistralClientSource, "export async function analyzeImageForAdmin", "// ==================== MEDIA CLASSIFICATION WITH AI"),
  /analyzeImageWithVisionFallbacks\(imageUrl, userPrompt, userId\)/,
  "analyzeImageForAdmin deve usar a cadeia compartilhada de visao",
);

assert.doesNotMatch(
  blockBetween(mistralClientSource, "export async function classifyMediaWithAI", "// ==================== TEXT GENERATION"),
  /allowWhenChatDisabled:\s*true/,
  "classificacao textual de midia nao deve reativar Mistral chat",
);

assert.doesNotMatch(
  mistralClientSource.slice(mistralClientSource.indexOf("export async function generateWithMistral")),
  /allowWhenChatDisabled:\s*true/,
  "geracao de texto nao deve reativar Mistral chat",
);

assert.equal(
  mistralClientSource.includes("Mistral reservado para transcricao de audio e leitura de imagem"),
  true,
  "mensagem interna deve refletir que Mistral fica reservado para audio e imagem",
);

console.log("mistralImageVisionScope.source.test.ts: ok");
