import type { Conversation } from "@shared/schema";

export interface ConversationTagSummary {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon?: string | null;
  isDefault: boolean;
  position: number;
  description?: string | null;
}

export interface ConversationWithTags extends Conversation {
  tags?: ConversationTagSummary[];
}

export interface PaginatedConversationsResult {
  data: ConversationWithTags[];
  hasMore?: boolean;
  total?: number;
  offset?: number;
  limit?: number;
}

export type ConversationsQueryResult =
  | PaginatedConversationsResult
  | ConversationWithTags[]
  | null
  | undefined;

export interface ConversationsListPageState {
  conversations: ConversationWithTags[];
  hasMore: boolean;
  totalCount: number;
  currentOffset: number;
}

export function buildConversationsListPageState(
  result: ConversationsQueryResult,
): ConversationsListPageState {
  if (Array.isArray(result)) {
    return {
      conversations: result,
      hasMore: false,
      totalCount: result.length,
      currentOffset: result.length,
    };
  }

  const conversations = Array.isArray(result?.data) ? result.data : [];

  return {
    conversations,
    hasMore: Boolean(result?.hasMore),
    totalCount: typeof result?.total === "number" ? result.total : conversations.length,
    currentOffset: conversations.length,
  };
}
