import assert from "assert/strict";
import {
  CONVERSATION_SCHEDULED_MESSAGES_STATEFUL_MARKER,
  resolveConversationScheduledMessageCronConfig,
} from "../conversationScheduledMessageConfig";

assert.equal(
  CONVERSATION_SCHEDULED_MESSAGES_STATEFUL_MARKER,
  "conversation_scheduled_messages_stateful_sender_v163",
);

assert.deepEqual(resolveConversationScheduledMessageCronConfig({}), {
  batchLimit: 25,
  maxOverdueMinutes: 30,
  stuckProcessingMinutes: 10,
});

assert.deepEqual(
  resolveConversationScheduledMessageCronConfig({
    CONVERSATION_SCHEDULED_MESSAGES_BATCH_LIMIT: "7",
    CONVERSATION_SCHEDULED_MESSAGES_MAX_OVERDUE_MINUTES: "12",
    CONVERSATION_SCHEDULED_MESSAGES_STUCK_PROCESSING_MINUTES: "3",
  }),
  {
    batchLimit: 7,
    maxOverdueMinutes: 12,
    stuckProcessingMinutes: 3,
  },
);

assert.deepEqual(
  resolveConversationScheduledMessageCronConfig({
    CONVERSATION_SCHEDULED_MESSAGES_BATCH_LIMIT: "0",
    CONVERSATION_SCHEDULED_MESSAGES_MAX_OVERDUE_MINUTES: "abc",
    CONVERSATION_SCHEDULED_MESSAGES_STUCK_PROCESSING_MINUTES: "-1",
  }),
  {
    batchLimit: 25,
    maxOverdueMinutes: 30,
    stuckProcessingMinutes: 10,
  },
);

console.log("conversationScheduledMessageService.test.ts passed");
