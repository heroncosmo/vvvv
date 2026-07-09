import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const testAgentSource = fs.readFileSync(path.resolve(process.cwd(), "client", "src", "pages", "test-agent.tsx"), "utf8");

assert.match(
  testAgentSource,
  /sendPublicTestAgentMessageWithRetry/,
  "teste publico deve usar helper com retry controlado",
);

assert.match(
  testAgentSource,
  /PUBLIC_TEST_AGENT_MESSAGE_MAX_ATTEMPTS\s*=\s*2/,
  "teste publico deve tentar uma vez de novo antes de mostrar erro ao cliente",
);

assert.match(
  testAgentSource,
  /cache:\s*"no-store"[\s\S]*credentials:\s*"same-origin"/,
  "teste publico deve evitar cache/stale bundle em chamada de mensagem",
);

assert.match(
  testAgentSource,
  /Accept:\s*"application\/json"[\s\S]*"Content-Type":\s*"application\/json"/,
  "teste publico deve declarar JSON explicitamente",
);

assert.match(
  testAgentSource,
  /history:\s*messages\.map\(m =>/,
  "teste publico deve enviar o historico completo da sessao atual, nao apenas as ultimas 10 mensagens",
);

assert.doesNotMatch(
  testAgentSource,
  /messages\.slice\(-10\)|Ops! Houve um erro\. Tente novamente\./,
  "teste publico nao deve cortar contexto nem mostrar erro generico antigo",
);

console.log("publicTestAgentClientRetry.source.test.ts: ok");
