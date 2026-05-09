import assert from "node:assert/strict";
import {
  buildAgentEditLimitReachedMessage,
  buildAgentEditRemainingMessage,
  buildAgentEditRuleReply,
  FREE_AGENT_EDIT_LIMIT,
} from "../agentEditQuota";

const limitMessage = buildAgentEditLimitReachedMessage({
  used: FREE_AGENT_EDIT_LIMIT,
  limit: FREE_AGENT_EDIT_LIMIT,
});
assert.match(limitMessage, /Amanhã os créditos liberam de novo/i);
assert.match(limitMessage, /ilimitadas/i);

const remainingMessage = buildAgentEditRemainingMessage({
  hasActiveSubscription: false,
  remaining: 4,
  limit: FREE_AGENT_EDIT_LIMIT,
});
assert.match(remainingMessage, /4 crédito/i);
assert.match(remainingMessage, /por dia/i);

const ruleReply = buildAgentEditRuleReply({
  hasActiveSubscription: false,
  remaining: 2,
  limit: FREE_AGENT_EDIT_LIMIT,
});
assert.match(ruleReply, /5 alterações por dia/i);
assert.match(ruleReply, /Hoje você ainda tem 2/i);

const unlimitedReply = buildAgentEditRuleReply({
  hasActiveSubscription: true,
  remaining: -1,
  limit: FREE_AGENT_EDIT_LIMIT,
});
assert.match(unlimitedReply, /ilimitadas/i);

console.log("agentEditQuota.test.ts ok");
