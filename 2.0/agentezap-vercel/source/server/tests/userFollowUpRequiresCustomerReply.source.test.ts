import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const serviceSource = readFileSync(join(process.cwd(), "server", "userFollowUpService.ts"), "utf8");
const httpSource = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8");

assert.match(
  serviceSource,
  /WAITING_FOR_FIRST_CUSTOMER_REPLY_REASON/,
  "service must keep a distinct hold reason for conversations without a customer reply",
);

assert.match(
  serviceSource,
  /hasCustomerReplyInConversation[\s\S]*customerReplyCutoff[\s\S]*conversation_id = \$\{conversationId\}[\s\S]*from_me = false[\s\S]*COALESCE\(timestamp, created_at\) >= \$\{customerReplyCutoff\}::timestamp[\s\S]*LIMIT 1/,
  "service must check customer replies in the conversation after the current owner line was verified",
);

assert.match(
  serviceSource,
  /alignOwnerVerificationWithRecentCustomerReply[\s\S]*OWNER_VERIFICATION_CUSTOMER_REPLY_BRIDGE_MS[\s\S]*ownerPhoneVerifiedAt: customerAt[\s\S]*ensureConversationHasCustomerReplyForFollowUp/,
  "service must bridge only recent customer replies that were followed by a confirmed company reply",
);

assert.match(
  serviceSource,
  /ensureConversationHasCustomerReplyForFollowUp\(conversation, userId, "execucao"\)/,
  "execution must stop before AI analysis when the customer never replied",
);

assert.match(
  serviceSource,
  /ensureConversationHasCustomerReplyForFollowUp\(conversation, userId, "before_send"\)/,
  "send path must revalidate the first customer reply immediately before delivery",
);

assert.match(
  serviceSource,
  /ensureConversationHasCustomerReplyForFollowUp\(conversation, userId, "reorganizacao"\)/,
  "reorganization must keep conversations without customer reply out of the queue",
);

assert.match(
  serviceSource,
  /ensureConversationHasCustomerReplyForFollowUp\(conversation, userId, "reset"\)/,
  "automatic reset after company messages must not schedule cold conversations",
);

assert.match(
  serviceSource,
  /repairMissingSchedules[\s\S]*ownerPhoneVerifiedAt[\s\S]*COALESCE\(m.timestamp, m.created_at\) >= \$\{conversations.ownerPhoneVerifiedAt\}/,
  "stateful missing-schedule repair must require a customer reply after the current owner line was verified",
);

assert.match(
  serviceSource,
  /repairWaitingCompanyReplyStuckSchedules[\s\S]*COALESCE\(m.timestamp, m.created_at\) >= c.owner_phone_verified_at[\s\S]*ensureConversationHasCustomerReplyForFollowUp\(conversation, row.userId, "company_reply_recovery"\)/,
  "stateful waiting-company recovery must not reactivate conversations without a current-line customer reply",
);

assert.match(
  serviceSource,
  /pruneUnsafeScheduledFollowUps[\s\S]*WAITING_FOR_FIRST_CUSTOMER_REPLY_REASON[\s\S]*COALESCE\(m.timestamp, m.created_at\) >= c.owner_phone_verified_at/,
  "stateful prune must remove scheduled conversations that lack a current-line customer reply",
);

assert.match(
  serviceSource,
  /getFollowUpStats[\s\S]*COALESCE\(m.timestamp, m.created_at\) >= \$\{conversations.ownerPhoneVerifiedAt\}/,
  "stateful stats must hide scheduled conversations without a current-line customer reply",
);

assert.match(
  serviceSource,
  /getPendingFollowUps[\s\S]*COALESCE\(m.timestamp, m.created_at\) >= \$\{conversations.ownerPhoneVerifiedAt\}[\s\S]*\$\{conversations.lastMessageTime\} desc nulls last/,
  "stateful pending list must require current-line replies and prioritize recent conversations",
);

assert.match(
  serviceSource,
  /reorganizeAllFollowups[\s\S]*\$\{conversations.lastMessageTime\} desc nulls last[\s\S]*ensureConversationHasCustomerReplyForFollowUp\(conversation, userId, "reorganizacao"\)/,
  "stateful manual reorganization must prioritize recent conversations and keep cold conversations out",
);

assert.match(
  serviceSource,
  /clearConnectionWaitingStatus[\s\S]*WAITING_FOR_FIRST_CUSTOMER_REPLY_REASON[\s\S]*COALESCE\(m.timestamp, m.created_at\) >= conversations.owner_phone_verified_at/,
  "connection reconnect recovery must not schedule follow-ups before the customer replies on the current line",
);

assert.match(
  httpSource,
  /WEB_ONLY_FOLLOWUP_WAITING_CUSTOMER_REPLY_REASON/,
  "web-only follow-up path must expose the same hold reason",
);

assert.match(
  httpSource,
  /hasWebOnlyCustomerReplyInFollowupConversation[\s\S]*customerReplyCutoff[\s\S]*conversation_id = \$1[\s\S]*from_me = false[\s\S]*COALESCE\(timestamp, created_at\) >= \$2::timestamp[\s\S]*LIMIT 1/,
  "web-only path must check customer replies after the current owner line was verified",
);

assert.match(
  httpSource,
  /alignWebOnlyOwnerVerificationWithRecentCustomerReply[\s\S]*WEB_ONLY_FOLLOWUP_OWNER_VERIFICATION_CUSTOMER_BRIDGE_MS[\s\S]*owner_phone_verified_at = \$2/,
  "web-only path must bridge only recent customer replies that were followed by a confirmed company reply",
);

assert.match(
  httpSource,
  /waitingCustomerReply/,
  "web-only reorganize and cron summaries must count missing customer replies",
);

assert.match(
  httpSource,
  /owner_phone_verified_at IS NULL OR COALESCE\(m.timestamp, m.created_at\) >= c.owner_phone_verified_at/,
  "web-only stats, pending list and due queue must hide conversations without customer reply on the current owner line",
);

assert.match(
  httpSource,
  /ORDER BY c.last_message_time DESC NULLS LAST, c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST/,
  "manual reorganization must prioritize recent conversations before old backlog",
);

console.log("userFollowUpRequiresCustomerReply.source.test.ts ok");
