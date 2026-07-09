import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serviceSource = readFileSync("server/testAgentService.ts", "utf8");
const routesSource = readFileSync("server/routes.ts", "utf8");
const aiAgentSource = readFileSync("server/aiAgent.ts", "utf8");

test("public test-agent service filters support media on customer media setup turns", () => {
  assert.match(
    serviceSource,
    /AGENTEZAP_SUPPORT_TEST_AGENT_EMAILS/,
    "support simulator guard should be limited to configured support owner emails",
  );
  assert.match(
    serviceSource,
    /isSupportTestAgentCustomerMediaTurn/,
    "guard should detect customer media setup turns",
  );
  assert.match(
    serviceSource,
    /hasSupportTestAgentCustomerSignal/,
    "guard should require a real customer phone or email signal",
  );
  assert.match(
    serviceSource,
    /buildSupportTestAgentCustomerContextBlock/,
    "service should build customer operational context for the legacy simulator path",
  );
  assert.match(
    serviceSource,
    /Midias da biblioteca da conta de suporte nao sao midias da conta do cliente/,
    "legacy simulator context must forbid support media standing in for customer media",
  );
  assert.match(
    serviceSource,
    /const effectiveCustomPrompt = supportCustomerContextBlock/,
    "legacy simulator should inject support customer context into the effective prompt",
  );
  assert.match(
    serviceSource,
    /isSupportTestAgentTutorialMediaAction/,
    "guard may keep explicit support tutorial media",
  );
  assert.match(
    serviceSource,
    /filterSupportTestAgentCustomerMediaActions\(\{/,
    "expanded media actions should pass through the support media guard",
  );
});

test("public test-agent route passes contact identity to the service", () => {
  assert.match(
    routesSource,
    /contactPhone,\s*contactNumber,\s*phone,\s*contactName/,
    "route should read contact identity from the request body",
  );
  assert.match(
    routesSource,
    /\{ message, token, history, userId, sentMedias, sessionId, contactPhone, contactNumber, phone, contactName \}/,
    "route should pass contact identity into handleTestAgentMessage",
  );
});

test("common AI response runtime removes support media when support context is active", () => {
  assert.match(
    aiAgentSource,
    /filterAgenteZapSupportCustomerRuntimeMediaActions/,
    "common generator should have a final support customer media guard",
  );
  assert.match(
    aiAgentSource,
    /CONTEXTO OPERACIONAL DO CLIENTE AGENTEZAP/,
    "common guard should only activate when support customer context is present in the prompt",
  );
  assert.match(
    aiAgentSource,
    /Midia de suporte removida de turno de midia do cliente/,
    "common guard should log dropped support media actions for audit",
  );
});
