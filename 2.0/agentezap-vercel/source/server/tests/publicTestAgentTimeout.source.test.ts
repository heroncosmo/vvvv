import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const clientSource = readFileSync("client/src/pages/test-agent.tsx", "utf8");
const httpSource = readFileSync("api/http.ts", "utf8");

test("public test agent frontend uses an explicit request timeout", () => {
  assert.match(clientSource, /PUBLIC_TEST_AGENT_MESSAGE_TIMEOUT_MS = 45_000/);
  assert.match(clientSource, /new AbortController\(\)/);
  assert.match(clientSource, /signal: controller\.signal/);
  assert.match(clientSource, /Tempo esgotado no teste do agente/);
});

test("public test agent backend passes abort signal to runtime", () => {
  assert.match(httpSource, /const requestAbort = new AbortController\(\)/);
  assert.match(httpSource, /abortSignal: requestAbort\.signal/);
  assert.match(httpSource, /Tempo esgotado no teste do agente/);
});

test("public test agent serializes requests per persisted session", () => {
  assert.match(httpSource, /function getAgentTestSessionLockKey/);
  assert.match(httpSource, /async function tryClaimAgentTestSessionLock/);
  assert.match(httpSource, /message_deduplication[\s\S]*agent_test_session/);
  assert.match(httpSource, /const publicTestSessionId = resolveAgentTestSessionId/);
  assert.match(httpSource, /tryClaimAgentTestSessionLock\(userId,\s*"public_test",\s*publicTestSessionId\)/);
  assert.match(httpSource, /Teste ainda processando a mensagem anterior/);
  assert.match(httpSource, /publicTestSessionLock\.release\(\)/);
});
