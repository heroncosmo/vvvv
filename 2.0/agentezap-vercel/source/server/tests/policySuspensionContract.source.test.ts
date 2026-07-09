import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const httpSource = readFileSync(join(root, "api", "http.ts"), "utf8");
const storageSource = readFileSync(join(root, "server", "storage.ts"), "utf8");
const aiAgentSource = readFileSync(join(root, "server", "aiAgent.ts"), "utf8");
const followUpSource = readFileSync(join(root, "server", "userFollowUpService.ts"), "utf8");

function sliceBetween(source: string, startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

const webOnlyTestSource = sliceBetween(
  httpSource,
  "async function runWebOnlyAgentTestForUserInternal",
  "const history = Array.isArray(body.history)",
);

const suspensionCheckIndex = webOnlyTestSource.indexOf("buildUserSuspensionStatusPayload(userId)");
const skipAccessCheckIndex = webOnlyTestSource.indexOf("body.skipAccessCheck !== true");
const subscriptionAccessIndex = webOnlyTestSource.indexOf("buildAccessStatusPayloadForUser(userId)");

assert.ok(suspensionCheckIndex >= 0, "web-only public test must check user suspension explicitly");
assert.ok(
  skipAccessCheckIndex > suspensionCheckIndex,
  "account suspension must not be bypassed by skipAccessCheck",
);
assert.ok(
  subscriptionAccessIndex > suspensionCheckIndex,
  "account suspension must be checked before subscription/access status",
);

assert.match(
  webOnlyTestSource,
  /suspension_check_failed[\s\S]{0,900}buildAccountSuspendedAgentPayload\(suspensionStatus\)/,
  "web-only public test must fail closed with an empty agent payload if the suspension check fails",
);

const suspendedPayloadSource = sliceBetween(
  httpSource,
  "function buildAccountSuspendedAgentPayload",
  "async function handleUserSuspensionStatus",
);

for (const requiredFragment of [
  'response: ""',
  "splitResponses: []",
  "mediaActions: []",
  "wouldSendAudio: false",
  "wouldSendText: false",
  'blockReason: "account_suspended"',
] as const) {
  assert.ok(
    suspendedPayloadSource.includes(requiredFragment),
    `suspended account payload must include ${requiredFragment}`,
  );
}

const adminSuspendSource = sliceBetween(
  httpSource,
  'if (action === "suspend" && req.method === "POST")',
  'if (action === "unsuspend" && req.method === "POST")',
);

for (const requiredPattern of [
  /await client\.query\("BEGIN"\)/,
  /UPDATE users[\s\S]*suspended_at = NOW\(\)[\s\S]*suspension_reason = \$2[\s\S]*suspension_type = \$3/,
  /INSERT INTO policy_violations[\s\S]*resulted_in_suspension/,
  /UPDATE ai_agent_config SET is_active = false/,
  /UPDATE whatsapp_connections SET ai_enabled = false/,
  /UPDATE conversations c[\s\S]*followup_active = false[\s\S]*next_followup_at = NULL[\s\S]*followup_disabled_reason = \$2/,
  /await client\.query\("COMMIT"\)/,
  /await client\.query\("ROLLBACK"\)/,
] as const) {
  assert.match(adminSuspendSource, requiredPattern);
}

const suspendedUsersSource = sliceBetween(
  httpSource,
  'if (pathname === "/api/admin/suspended-users")',
  "if (req.method === \"GET\")",
);

assert.match(
  suspendedUsersSource,
  /LEFT JOIN LATERAL[\s\S]*policy_violations[\s\S]*resulted_in_suspension = true/,
  "admin suspended-users list must expose latest suspension evidence/description",
);

const storageSuspendSource = sliceBetween(
  storageSource,
  "async suspendUser(",
  "async getSuspendedUsers",
);

for (const requiredPattern of [
  /INSERT INTO policy_violations/,
  /db\.update\(aiAgentConfig\)[\s\S]*isActive: false/,
  /db\.update\(whatsappConnections\)[\s\S]*aiEnabled: false/,
  /db\.update\(conversations\)[\s\S]*followupActive: false[\s\S]*nextFollowupAt: null[\s\S]*followupDisabledReason: "Conta suspensa por violacao de politicas"/,
] as const) {
  assert.match(storageSuspendSource, requiredPattern);
}

const aiAgentSuspensionSource = sliceBetween(
  aiAgentSource,
  "async function checkUserSuspension",
  "function getBrazilGreeting",
);

assert.match(
  aiAgentSuspensionSource,
  /catch \(error\)[\s\S]*return true;[\s\S]*sem verificacao de suspensao/,
  "AI response generation must fail closed if account suspension cannot be checked",
);

const followUpSuspensionSource = sliceBetween(
  followUpSource,
  "async function checkUserSuspensionForFollowUp",
  "interface CacheEntry",
);

assert.match(
  followUpSuspensionSource,
  /if \(suspensionStatus\.suspended\)[\s\S]*return true;[\s\S]*return false;[\s\S]*catch \(error\)[\s\S]*return true;/,
  "follow-up must continue normally when not suspended, but fail closed if suspension cannot be checked",
);

assert.doesNotMatch(
  webOnlyTestSource + adminSuspendSource + storageSuspendSource + aiAgentSuspensionSource + followUpSuspensionSource,
  /996838f7-124d-456e-ae62-5be50a95d9eb|rafaelbueno0801|rodrigo4@gmail\.com/,
  "policy suspension code must not hardcode conversation ids or tenant emails",
);

console.log("policySuspensionContract source contract ok");
