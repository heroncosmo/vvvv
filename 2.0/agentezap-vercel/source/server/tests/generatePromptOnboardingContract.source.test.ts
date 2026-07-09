import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routesSource = fs.readFileSync(path.resolve(root, "server", "routes.ts"), "utf8");
const httpSource = fs.readFileSync(path.resolve(root, "api", "http.ts"), "utf8");
const calibrationSource = fs.readFileSync(path.resolve(root, "server", "promptCalibrationService.ts"), "utf8");

function blockBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Nao encontrou ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Nao encontrou ${endMarker}`);
  return source.slice(start, end);
}

const generatePromptRoute = blockBetween(
  routesSource,
  'app.post("/api/agent/generate-prompt"',
  "EDITOR DE PROMPTS",
);

const vercelGeneratePromptHandler = blockBetween(
  httpSource,
  "async function handleAgentGeneratePrompt",
  "async function handlePlansAssistantChat",
);

assert.match(
  generatePromptRoute,
  /runWebOnlyCodexPromptTextForUser[\s\S]*task:\s*"prompt_edit_generate_initial"[\s\S]*conversationId:\s*`prompt-generate:\$\{userId\}`[\s\S]*timeoutMs:\s*90_000/,
  "Criacao inicial local deve gerar prompt pelo runtime Codex de prompt com contexto.",
);

assert.doesNotMatch(
  generatePromptRoute,
  /getLLMClient|chatComplete|Mistral|mistral|useOpenCodeMimo|forceOpenCodeGoCli/,
  "Criacao inicial local nao deve manter provider/fallback legado.",
);

assert.match(
  vercelGeneratePromptHandler,
  /runWebOnlyCodexPromptTextForUser[\s\S]*task:\s*"prompt_edit_generate_initial"/,
  "Handler Vercel deve usar o mesmo runtime Codex de prompt da rota local.",
);

assert.match(
  vercelGeneratePromptHandler,
  /conversationId:\s*`prompt-generate:\$\{user\.id\}`[\s\S]*contactName:\s*"Configuracao inicial do agente"/,
  "Handler Vercel deve manter conversationId/contactName especificos da geracao inicial.",
);

assert.match(
  vercelGeneratePromptHandler,
  /timeoutMs:\s*90_000/,
  "Handler Vercel deve manter timeout dedicado para geracao inicial.",
);

assert.match(
  vercelGeneratePromptHandler,
  /contextArtifacts:\s*\{[\s\S]*businessType[\s\S]*businessName[\s\S]*description:\s*description\s*\|\|\s*null[\s\S]*additionalInfo:\s*additionalInfo\s*\|\|\s*null/,
  "Handler Vercel deve preservar contexto de negocio para o Codex.",
);

assert.doesNotMatch(
  vercelGeneratePromptHandler,
  /callWebOnlyLlm\(|Nao consegui criar o agente agora|Tente novamente em instantes|useOpenCodeMimo|forceOpenCodeGoCli|getLLMClient|chatComplete|Mistral|mistral/,
  "Handler Vercel nao deve usar chamada generica nem fallback publico local.",
);

assert.match(
  vercelGeneratePromptHandler,
  /success:\s*false[\s\S]*prompt:\s*""[\s\S]*error:\s*"prompt_generation_failed"/,
  "Falha de geracao Vercel deve ser estruturada e sem texto publico local.",
);

assert.doesNotMatch(
  [generatePromptRoute, vercelGeneratePromptHandler].join("\n"),
  /message:\s*"Failed to generate prompt"/,
  "Catches de generate-prompt nao devem retornar mensagem tecnica local.",
);

assert.match(
  generatePromptRoute,
  /if \(!generatedPrompt\) \{[\s\S]*return res\.status\(503\)\.json\(\{[\s\S]*success:\s*false[\s\S]*prompt:\s*""[\s\S]*error:\s*"prompt_generation_failed"/,
  "Falha local sem prompt deve ser estruturada e nao cair em fallback textual do catch.",
);

assert.match(
  routesSource,
  /PROMPT_GENERATE_CALIBRATION_TIMEOUT_MS\s*=\s*Math\.max\([\s\S]*18_000[\s\S]*45_000/,
  "Criacao inicial deve ter timeout proprio e curto para a validacao opcional.",
);

assert.match(
  generatePromptRoute,
  /numeroCenarios:\s*1[\s\S]*maxTentativasReparo:\s*0[\s\S]*timeoutMs:\s*PROMPT_GENERATE_CALIBRATION_TIMEOUT_MS[\s\S]*maxLlmRetries:\s*1[\s\S]*userId[\s\S]*conversationId:\s*`prompt-generate-calibration:\$\{userId\}`/,
  "Auto-calibracao do onboarding deve ser best-effort e limitada para nao travar conta nova.",
);

assert.doesNotMatch(
  generatePromptRoute,
  /repairPromptWithEditor:\s*createPromptCalibrationRepairEditor/,
  "Criacao inicial nao deve acionar reparo pesado de prompt; Personalize com IA faz a validacao robusta depois.",
);

assert.match(
  calibrationSource,
  /maxLlmRetries\?:\s*number[\s\S]*userId\?:\s*string[\s\S]*conversationId\?:\s*string/,
  "Calibrador deve expor limites e contexto Codex para fluxos auxiliares como onboarding.",
);

assert.match(
  calibrationSource,
  /const maxRetries = Math\.max\(1,[\s\S]*this\.config\.maxLlmRetries[\s\S]*runWebOnlyCodexPromptTextForUser\(\{[\s\S]*task:\s*"prompt_calibration"[\s\S]*timeoutMs/,
  "Calibrador deve respeitar retry configurado e chamar Codex prompt runtime.",
);

assert.doesNotMatch(
  calibrationSource,
  /opencodeCliMinTimeoutMs|useOpenCodeMimo|forceOpenCodeGoCli|getLLMClient|chatComplete|Mistral|mistral/,
  "Calibrador nao deve manter opcoes/fallbacks legados de OpenCode ou providers antigos.",
);

console.log("generatePromptOnboardingContract.source.test.ts: ok");
