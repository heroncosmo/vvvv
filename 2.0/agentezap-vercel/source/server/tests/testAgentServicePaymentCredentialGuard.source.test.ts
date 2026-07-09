import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("server/testAgentService.ts", "utf8");

assert.match(source, /enforceTrustedPaymentCredentialReply/);
assert.match(source, /Guarda financeiro aplicado no simulador/);
assert.match(source, /trustedReferenceText:\s*\[agentConfig\.prompt,\s*effectiveCustomPrompt\]/);
assert.match(source, /conversationHistory/);

console.log("testAgentServicePaymentCredentialGuard.source.test.ts ok");
