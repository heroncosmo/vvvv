import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../whatsapp.ts", import.meta.url), "utf8");
const instanceApiSource = readFileSync(new URL("../whatsappInstanceApiService.ts", import.meta.url), "utf8");

assert.match(
  source,
  /updateDisabledConversationOwnerReply\(\s*conversationId,\s*autoReactivateMinutes\s*\)/,
  "linked owner manual pauses must reset the tenant auto-reactivation timer",
);

assert.match(
  source,
  /updateDisabledConversationOwnerReply\(\s*conversation\.id,\s*autoReactivateMinutes\s*\)/,
  "WhatsApp owner manual replies must reset the tenant auto-reactivation timer",
);

assert.doesNotMatch(
  source,
  /updateDisabledConversationOwnerReply\(\s*conversationId\s*\)/,
  "manual reply reset must not drop the configured auto-reactivation timer",
);

assert.doesNotMatch(
  source,
  /updateDisabledConversationOwnerReply\(\s*conversation\.id\s*\)/,
  "manual reply reset must not leave existing paused rows without a timer",
);

assert.match(
  source,
  /messageSource === "owner" && options\?\.isFromAgent !== true[\s\S]*applyLinkedOwnerManualPause\(\{[\s\S]*conversationId,[\s\S]*contactNumber: destinationDigits/s,
  "direct owner sends through sendMessage must also pause the agent when source=owner",
);

assert.match(
  instanceApiSource,
  /const isOwnerManualSend = source === "owner" && params\.isFromAgent !== true;[\s\S]*skipAutoPause: !isOwnerManualSend/s,
  "owner media sends through the instance API must not skip auto-pause",
);

console.log("whatsappManualAutoReactivate.source.test passed");
