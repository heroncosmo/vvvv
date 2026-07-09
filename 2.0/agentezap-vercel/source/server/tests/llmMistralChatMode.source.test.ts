import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const llmSource = fs.readFileSync(path.resolve(process.cwd(), "server", "llm.ts"), "utf8");
const resolverSource = fs.readFileSync(path.resolve(process.cwd(), "server", "llmConfigResolver.ts"), "utf8");
const routesSource = fs.readFileSync(path.resolve(process.cwd(), "server", "routes.ts"), "utf8");
const webOnlySource = fs.readFileSync(path.resolve(process.cwd(), "api", "http.ts"), "utf8");

assert.equal(
  resolverSource.includes('"mistral_chat_enabled"'),
  true,
  "configuracao global deve persistir a flag mistral_chat_enabled",
);

assert.equal(
  resolverSource.includes("resolveChatProviderOrder(rawProviderOrder, mistralChatEnabled)"),
  true,
  "ordem global de resposta deve passar pelo filtro de Mistral chat",
);

assert.equal(
  llmSource.includes("config.mistralChatEnabled === false"),
  true,
  "servico de LLM deve bloquear Mistral quando estiver somente para transcricao",
);

assert.equal(
  llmSource.includes("hasMistralCredential"),
  true,
  "credencial Mistral deve ser separada da permissao de usar Mistral para chat",
);

assert.equal(
  llmSource.includes("encerrando sem usar chave de transcricao"),
  true,
  "fallback final nao pode usar chave de transcricao para responder",
);

assert.equal(
  routesSource.includes("mistral_chat_enabled"),
  true,
  "Admin API deve ler e salvar a flag mistral_chat_enabled",
);

assert.equal(
  webOnlySource.includes("inferredRequestedProvider === \"mistral\" && !mistralChatEnabled"),
  true,
  "runtime web-only nao pode inferir Mistral pelo model antigo quando chat Mistral esta desligado",
);

assert.equal(
  webOnlySource.includes("strictPrimaryProvider: llmConfig.usesUserOverride === true"),
  true,
  "auditorias estruturadas do tenant customizado devem respeitar o provedor primario do tenant",
);

assert.equal(
  webOnlySource.includes("normalizeOpenRouterModelsStrict"),
  true,
  "tenant customizado OpenRouter deve poder testar somente a lista de modelos escolhida",
);

assert.equal(
  webOnlySource.includes("normalizeNvidiaModelsStrict"),
  true,
  "tenant customizado NVIDIA deve poder testar somente a lista de modelos escolhida",
);

assert.equal(
  webOnlySource.includes("usesUserOverride: (llmConfig as any).usesUserOverride === true"),
  true,
  "loadWebOnlyLlmConfig deve repassar a flag de override do tenant ao runtime web-only",
);

assert.equal(
  webOnlySource.includes("const effectiveProviderOrder = params.strictPrimaryProvider && providerOrder[0]"),
  true,
  "candidate builder deve conseguir limitar auditoria estruturada ao provedor primario",
);

console.log("llmMistralChatMode.source.test.ts: ok");
