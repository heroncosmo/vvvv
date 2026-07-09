import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const quotaSource = readFileSync(resolve(__dirname, "../agentEditQuota.ts"), "utf8");

assert.match(quotaSource, /FREE_AGENT_EDIT_LIMIT\s*=\s*-1/);
assert.match(quotaSource, /allowed:\s*true/);
assert.match(quotaSource, /remaining:\s*-1/);
assert.match(quotaSource, /export async function consumeAgentEditCredit/);
assert.doesNotMatch(
  quotaSource,
  /buildAgentEditLimitReachedMessage|buildAgentEditRemainingMessage|buildAgentEditRuleReply|sem limite diario|ilimitadas em qualquer plano/i,
  "agentEditQuota deve manter apenas quota tecnica, sem builders de mensagem publica local",
);

console.log("agentEditQuota.test.ts ok");
