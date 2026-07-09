import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server", "promptEditService.ts"),
  "utf8",
);

assert.equal(
  source.includes('skipMistralQueue: true'),
  true,
  "promptEditService deve forcar fallback imediato do provider para a edicao estruturada",
);

assert.equal(
  source.includes('llmConfig.provider === "mistral"'),
  true,
  "promptEditService deve condicionar a chamada estruturada direta do Mistral ao provider ativo",
);

assert.equal(
  source.includes("Structured output direto do Mistral pulado"),
  true,
  "promptEditService deve registrar quando pula o caminho direto do Mistral",
);

assert.equal(
  source.includes("repairStructuredTaskOutput"),
  true,
  "promptEditService deve tentar reparar saidas estruturadas invalidas antes de desistir",
);

assert.equal(
  source.includes("describeStructuredSchema(input.schema)"),
  true,
  "promptEditService deve reforcar o schema ao reparar JSON invalido",
);

assert.equal(
  source.includes("A saida estruturada veio incompleta. Reparando automaticamente."),
  true,
  "promptEditService deve emitir progresso quando entrar no reparo automatico",
);

assert.equal(
  source.includes("Instrucao simples detectada. Priorizando reescrita direta antes da orquestracao estruturada."),
  true,
  "promptEditService deve priorizar a reescrita direta em instrucoes simples do quick edit",
);

assert.equal(
  source.includes("shouldPreferDirectPromptRewrite"),
  true,
  "promptEditService deve ter um fast-path explicito para instrucoes simples antes do planner estruturado",
);

console.log("promptEditServiceProviderFallback.test.ts: ok");
