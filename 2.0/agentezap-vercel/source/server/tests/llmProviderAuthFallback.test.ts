import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server", "llm.ts"), "utf8");

assert.equal(
  source.includes("export function isLLMProviderAuthError"),
  true,
  "llm.ts deve expor o classificador de erro de autenticacao de provider",
);

assert.equal(
  source.includes("status === 401 || status === 403"),
  true,
  "erros 401/403 devem ser tratados como falha de credencial",
);

assert.equal(
  source.includes('message.includes("unauthorized")'),
  true,
  "mensagem Unauthorized sem status preservado tambem deve ser tratada como falha de credencial",
);

assert.equal(
  source.includes("const shouldFallbackImmediately = isLLMProviderAuthError(lastMistralError);"),
  false,
  "a decisao final nao pode depender apenas do erro final, porque o caminho real pode entrar na fila antes disso",
);

assert.equal(
  source.includes("let mistralAuthErrorDetected = false;"),
  true,
  "o catch de cada tentativa Mistral deve guardar que a falha foi de autenticacao",
);

assert.equal(
  source.includes("if (isLLMProviderAuthError(mistralError))"),
  true,
  "erro de autenticacao precisa ser reconhecido dentro do catch da tentativa Mistral",
);

assert.equal(
  source.includes("mistralAuthErrorDetected = true;"),
  true,
  "erro de autenticacao deve marcar fallback imediato antes da fila",
);

assert.equal(
  source.includes("const shouldFallbackImmediately = mistralAuthErrorDetected || isLLMProviderAuthError(lastMistralError);"),
  true,
  "falha de credencial do Mistral deve habilitar fallback imediato",
);

assert.equal(
  source.includes("!shouldFallbackImmediately && !params.skipMistralQueue && !canFallbackToExternal()"),
  true,
  "erro de autenticacao nao deve aguardar a fila do Mistral",
);

assert.equal(
  source.includes("forceOpenCircuitBreaker(\"erro de autenticacao do provider\")"),
  true,
  "erro de autenticacao deve abrir o circuito do Mistral para reduzir retries",
);

console.log("llmProviderAuthFallback.test.ts: ok");
