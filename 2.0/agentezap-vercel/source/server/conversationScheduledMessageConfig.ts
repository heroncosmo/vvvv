export const CONVERSATION_SCHEDULED_MESSAGES_STATEFUL_MARKER =
  "conversation_scheduled_messages_stateful_sender_v163";

const DEFAULT_BATCH_LIMIT = 25;
const DEFAULT_MAX_OVERDUE_MINUTES = 30;
const DEFAULT_STUCK_PROCESSING_MINUTES = 10;

export type ConversationScheduledMessageCronConfig = {
  batchLimit: number;
  maxOverdueMinutes: number;
  stuckProcessingMinutes: number;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value || "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function resolveConversationScheduledMessageCronConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConversationScheduledMessageCronConfig {
  return {
    batchLimit: parsePositiveInteger(
      env.CONVERSATION_SCHEDULED_MESSAGES_BATCH_LIMIT,
      DEFAULT_BATCH_LIMIT,
    ),
    maxOverdueMinutes: parsePositiveInteger(
      env.CONVERSATION_SCHEDULED_MESSAGES_MAX_OVERDUE_MINUTES,
      DEFAULT_MAX_OVERDUE_MINUTES,
    ),
    stuckProcessingMinutes: parsePositiveInteger(
      env.CONVERSATION_SCHEDULED_MESSAGES_STUCK_PROCESSING_MINUTES,
      DEFAULT_STUCK_PROCESSING_MINUTES,
    ),
  };
}
