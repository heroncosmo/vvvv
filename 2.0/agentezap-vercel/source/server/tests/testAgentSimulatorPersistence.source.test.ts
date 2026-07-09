import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicTestSource = fs.readFileSync(path.resolve(root, "client", "src", "pages", "test-agent.tsx"), "utf8");
const myAgentSource = fs.readFileSync(path.resolve(root, "client", "src", "pages", "my-agent.tsx"), "utf8");
const agentStudioUnifiedSource = fs.readFileSync(path.resolve(root, "client", "src", "components", "agent-studio-unified.tsx"), "utf8");
const httpSource = fs.readFileSync(path.resolve(root, "api", "http.ts"), "utf8");
const routesSource = fs.readFileSync(path.resolve(root, "server", "routes.ts"), "utf8");
const paritySource = fs.readFileSync(path.resolve(root, "server", "vercelHttpParity.ts"), "utf8");
const codexRuntimeSource = fs.readFileSync(path.resolve(root, "server", "agenteZapCodexCliRuntime.ts"), "utf8");
const adminToolCallingSource = fs.readFileSync(path.resolve(root, "server", "adminAgentToolCalling.ts"), "utf8");
const actionExecutorSource = fs.readFileSync(path.resolve(root, "server", "actionExecutorV2.ts"), "utf8");
const adminAgentServiceSource = fs.readFileSync(path.resolve(root, "server", "adminAgentService.ts"), "utf8");
const testSessionMigrationSource = fs.readFileSync(
  path.resolve(root, "server", "migrations", "20260702_create_agent_test_session_messages.sql"),
  "utf8",
);
const testSessionRlsMigrationSource = fs.readFileSync(
  path.resolve(root, "server", "migrations", "20260702_agent_test_session_messages_client_deny_policies.sql"),
  "utf8",
);

test("public test chat keeps session/history across refresh and clears only by trash action", () => {
  assert.match(publicTestSource, /PUBLIC_TEST_CHAT_STORAGE_PREFIX\s*=\s*"agentezap:public-test-chat:v1:"/);
  assert.match(publicTestSource, /browserCrypto\?\.randomUUID/);
  assert.match(publicTestSource, /browserCrypto\?\.getRandomValues/);
  assert.match(publicTestSource, /function canUsePublicTestServerSession/);
  assert.match(publicTestSource, /!\s*\/\^\[0-9a-f\]\{8\}/);
  assert.match(publicTestSource, /fetchPublicTestSession\(\{/);
  assert.match(publicTestSource, /\/api\/test-agent\/session\?\$\{searchParams\.toString\(\)\}/);
  assert.match(publicTestSource, /restorePublicTestMessagesFromServer\(data\?\.messages\)/);
  assert.match(publicTestSource, /!serverChatHydrated/);
  assert.match(publicTestSource, /clearPublicTestSession\(\{/);
  assert.match(publicTestSource, /window\.localStorage\.setItem\(storageKey,\s*JSON\.stringify\(value\)\)/);
  assert.match(publicTestSource, /window\.localStorage\.removeItem\(storageKey\)/);
  assert.match(publicTestSource, /simulatorSessionIdRef\.current\s*=\s*stored\?\.sessionId\s*\|\|\s*createPublicTestSessionId\(\)/);
  assert.match(publicTestSource, /messages\.length\s*>\s*0[\s\S]*autoStartedStorageKeyRef/);
  assert.match(publicTestSource, /sendMessageMutation\.reset\(\)/);
  assert.match(publicTestSource, /<Trash2 className="h-5 w-5" \/>/);
});

test("authenticated simulator persists history per tenant user and trash starts a new session", () => {
  assert.match(myAgentSource, /AUTH_AGENT_SIMULATOR_CHAT_STORAGE_PREFIX\s*=\s*"agentezap:auth-agent-simulator-chat:v1:"/);
  assert.match(myAgentSource, /config\?\.userId \? buildAuthAgentSimulatorChatStorageKey\(config\.userId\) : null/);
  assert.match(myAgentSource, /window\.localStorage\.setItem\(storageKey,\s*JSON\.stringify\(value\)\)/);
  assert.match(myAgentSource, /window\.localStorage\.removeItem\(storageKey\)/);
  assert.match(myAgentSource, /simulatorSessionIdRef\.current\s*=\s*stored\?\.sessionId\s*\|\|\s*createAuthAgentSimulatorSessionId\(\)/);
  assert.match(myAgentSource, /chatHistory:\s*chatHistory\.slice\(-AUTH_AGENT_SIMULATOR_CHAT_MAX_STORED_MESSAGES\)/);
  assert.match(myAgentSource, /removeAuthAgentSimulatorChatStorage\(simulatorChatStorageKey\)/);
  assert.match(myAgentSource, /simulatorSessionIdRef\.current\s*=\s*createAuthAgentSimulatorSessionId\(\)/);
});

test("agent studio right-side simulator persists visible chat per agent config", () => {
  assert.match(agentStudioUnifiedSource, /AGENT_STUDIO_SIMULATOR_CHAT_STORAGE_PREFIX\s*=\s*"agentezap:agent-studio-simulator-chat:v1:"/);
  assert.match(agentStudioUnifiedSource, /browserCrypto\?\.randomUUID/);
  assert.match(agentStudioUnifiedSource, /browserCrypto\?\.getRandomValues/);
  assert.match(agentStudioUnifiedSource, /config\?\.id\s*\?\s*`\$\{AGENT_STUDIO_SIMULATOR_CHAT_STORAGE_PREFIX\}\$\{config\.id\}`\s*:\s*null/);
  assert.match(agentStudioUnifiedSource, /readAgentStudioSimulatorChatStorage\(agentStudioSimulatorChatStorageKey\)/);
  assert.match(agentStudioUnifiedSource, /fetchAgentStudioSimulatorSession\(sessionId\)/);
  assert.match(agentStudioUnifiedSource, /\/api\/agent\/test-session\?sessionId=/);
  assert.match(agentStudioUnifiedSource, /restoreAgentStudioSimulatorMessagesFromServer\(data\?\.messages\)/);
  assert.match(agentStudioUnifiedSource, /writeAgentStudioSimulatorChatStorage\(agentStudioSimulatorChatStorageKey/);
  assert.match(agentStudioUnifiedSource, /removeAgentStudioSimulatorChatStorage\(agentStudioSimulatorChatStorageKey\)/);
  assert.match(agentStudioUnifiedSource, /clearAgentStudioSimulatorSession\(previousSessionId\)/);
  assert.match(agentStudioUnifiedSource, /simulatorSessionIdRef\.current\s*=\s*stored\.sessionId/);
  assert.match(agentStudioUnifiedSource, /messages:\s*payload\.messages\.slice\(-AGENT_STUDIO_SIMULATOR_CHAT_MAX_STORED_MESSAGES\)/);
  assert.match(agentStudioUnifiedSource, /aria-label="Limpar conversa do simulador"/);
});

test("public and authenticated simulator routes remain on the web-only Codex parity runtime", () => {
  assert.match(paritySource, /app\.all\("\/api\/test-agent\/message",\s*delegateToVercelHttpHandler\)/);
  assert.match(paritySource, /app\.all\("\/api\/test-agent\/session",\s*delegateToVercelHttpHandler\)/);
  assert.match(paritySource, /app\.all\("\/api\/agent\/test",\s*delegateToVercelHttpHandler\)/);
  assert.match(paritySource, /app\.all\("\/api\/agent\/test-session",\s*delegateToVercelHttpHandler\)/);
  assert.match(httpSource, /async function handlePublicTestAgentMessage/);
  assert.match(httpSource, /async function resolvePublicTestAgentSessionUserId/);
  assert.match(httpSource, /const userId = await resolvePublicTestAgentSessionUserId\(query\)/);
  assert.doesNotMatch(httpSource, /handlePublicTestAgentSession[\s\S]{0,220}resolvePublicTestAgentUserId\(query\)/);
  assert.match(httpSource, /const trustedPublicSessionUserId = await resolvePublicTestAgentSessionUserId\(body\)/);
  assert.match(httpSource, /const hasTrustedPublicTestToken = trustedPublicSessionUserId === userId/);
  assert.doesNotMatch(httpSource, /const hasTrustedPublicTestToken =\s*Boolean\(rawToken\)/);
  assert.match(httpSource, /body\.webOnlyPersistedCustomerMessage = message/);
  assert.match(httpSource, /body\?\.webOnlyPersistedCustomerMessage \|\| body\?\.message/);
  assert.match(httpSource, /webOnlyTestSessionChannel:\s*"public_test"/);
  assert.match(httpSource, /persistTestSession:\s*hasTrustedPublicTestToken/);
  assert.match(httpSource, /const result = await runWebOnlyAgentTestForUser\(userId,\s*\{/);
  assert.match(httpSource, /await persistAgentTestSessionTurn\(userId,\s*sessionBody,\s*payload\)/);
  assert.match(httpSource, /async function handleAgentTest/);
  assert.match(httpSource, /async function resolveTechnicalAccessBlockForBillableAction/);
  assert.match(httpSource, /reseller_status AS "resellerStatus"/);
  assert.match(httpSource, /const technicalAccessBlock = await resolveTechnicalAccessBlockForBillableAction\(user\.id\)/);
  assert.match(httpSource, /async function consumeAuthenticatedSimulatorDailyLimit/);
  assert.match(httpSource, /const simulatorLimit = await consumeAuthenticatedSimulatorDailyLimit\(user\.id\)/);
  assert.match(httpSource, /FREE_DAILY_SIMULATOR_LIMIT/);
  assert.match(httpSource, /webOnlyTestSessionChannel:\s*"authenticated_simulator"/);
  assert.match(httpSource, /const result = await runWebOnlyAgentTestForUser\(user\.id,\s*sessionBody\)/);
  assert.match(httpSource, /await persistAgentTestSessionTurn\(user\.id,\s*sessionBody,\s*result\.payload\)/);
  assert.match(httpSource, /pathname === "\/api\/agent\/test-session"/);
  assert.match(httpSource, /pathname === "\/api\/test-agent\/session"/);
});

test("authenticated simulator daily limit is structured without backend-authored upgrade copy", () => {
  const forbiddenBackendCopy = /Voce atingiu o limite de \$\{FREE_DAILY_SIMULATOR_LIMIT\} mensagens do simulador por dia|Assine um plano para uso ilimitado/;
  assert.doesNotMatch(httpSource, forbiddenBackendCopy);
  assert.doesNotMatch(routesSource, forbiddenBackendCopy);
  assert.match(
    httpSource,
    /limitReached:\s*true[\s\S]*response:\s*""[\s\S]*mediaActions:\s*\[\][\s\S]*splitResponses:\s*\[\][\s\S]*used:\s*simulatorLimit\.used[\s\S]*limit:\s*simulatorLimit\.limit/,
  );
  assert.match(
    routesSource,
    /limitReached:\s*true[\s\S]*used:\s*dailyUsage\.simulatorMessagesCount[\s\S]*limit:\s*FREE_DAILY_SIMULATOR_LIMIT/,
  );
});

test("test and simulator sessions use Supabase table as persisted source of truth", () => {
  assert.match(testSessionMigrationSource, /CREATE TABLE IF NOT EXISTS agent_test_session_messages/);
  assert.match(testSessionMigrationSource, /user_id text NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(testSessionMigrationSource, /channel text NOT NULL CHECK \(channel IN \('public_test', 'authenticated_simulator'\)\)/);
  assert.match(testSessionMigrationSource, /ALTER TABLE agent_test_session_messages ENABLE ROW LEVEL SECURITY/);
  assert.match(testSessionRlsMigrationSource, /agent_test_session_messages_no_direct_client_access/);
  assert.match(testSessionRlsMigrationSource, /TO anon, authenticated/);
  assert.match(testSessionRlsMigrationSource, /USING \(false\)/);
  assert.match(testSessionRlsMigrationSource, /WITH CHECK \(false\)/);
  assert.match(httpSource, /async function loadPersistedAgentTestSessionHistoryFromDb/);
  assert.match(httpSource, /FROM agent_test_session_messages/);
  assert.match(httpSource, /mapAgentTestSessionRowsToHistory\(rows\)/);
  assert.match(httpSource, /conversationHistory = await loadPersistedAgentTestSessionHistoryFromDb\(userId,\s*body,\s*conversationHistory\)/);
  assert.match(httpSource, /async function clearAgentTestSession/);
  assert.match(httpSource, /DELETE FROM agent_test_session_messages/);
});

test("Rodrigo Codex owner keeps gpt-5.5 with xhigh reasoning while normal tenants use gpt-5.4-mini", () => {
  assert.match(codexRuntimeSource, /RODRIGO_AGENT_CREATOR_EMAIL\s*=\s*'rodrigo4@gmail\.com'/);
  assert.match(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_RODRIGO_MODEL \|\| 'gpt-5\.5'/);
  assert.match(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_RODRIGO_REASONING_EFFORT \|\| process\.env\.AGENTEZAP_CODEX_CLI_REASONING_EFFORT \|\| 'xhigh'/);
  assert.match(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_TENANT_MODEL \|\| 'gpt-5\.4-mini'/);
  assert.match(codexRuntimeSource, /AGENTEZAP_CODEX_CLI_TENANT_FALLBACK_MODEL \|\| 'gpt-5\.4-mini'/);
});

test("Rodrigo agent creation preserves the customer's raw briefing as tenant context", () => {
  assert.match(codexRuntimeSource, /'sourceCustomerBrief'/);
  assert.match(codexRuntimeSource, /briefing original completo informado pelo cliente/);
  assert.match(adminToolCallingSource, /function buildCreateAgentSourceBriefFromHistory/);
  assert.match(adminToolCallingSource, /args\.sourceCustomerBrief/);
  assert.match(adminToolCallingSource, /sourceCustomerBrief,\s*\n\s*originalCustomerBrief: sourceCustomerBrief/);
  assert.match(actionExecutorSource, /function buildCreateAgentPromptContext/);
  assert.match(actionExecutorSource, /<briefing_original_cliente>/);
  assert.match(actionExecutorSource, /payload\.sourceCustomerBrief/);
  assert.match(actionExecutorSource, /payload\.originalCustomerBrief/);
  assert.match(adminAgentServiceSource, /function preserveOriginalInstructionsInPrompt/);
  assert.match(adminAgentServiceSource, /<contexto_original_cliente>/);
});
