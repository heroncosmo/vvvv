import { and, eq, gt, gte, ne, or, sql } from "drizzle-orm";
import { db } from "./db";
import { conversations, whatsappConnections } from "@shared/schema";

export type GuardableOrigin =
  | "follow_up"
  | "user_follow_up"
  | "broadcast"
  | "recovery"
  | "notification"
  | "conversation"
  | "ai_agent"
  | "manual_admin"
  | "whatsapp_sender"
  | "chatbot_flow"
  | "delivery"
  | "catalog"
  | "scheduling"
  | "media"
  | "unknown";

export type GuardablePriority = "low" | "normal" | "high" | "urgent";

const EXPLICIT_PRIORITY_RANK: Record<GuardablePriority, number> = {
  low: 100,
  normal: 200,
  high: 300,
  urgent: 400,
};

const ORIGIN_FLOOR_RANK: Partial<Record<GuardableOrigin, number>> = {
  follow_up: 90,
  user_follow_up: 80,
  broadcast: 70,
  recovery: 85,
  notification: 85,
  conversation: 340,
  ai_agent: 320,
  manual_admin: 340,
  whatsapp_sender: 260,
  chatbot_flow: 260,
  delivery: 250,
  catalog: 240,
  scheduling: 250,
  media: 220,
  unknown: 200,
};

const DEFERRED_ORIGINS = new Set<GuardableOrigin>([
  "follow_up",
  "user_follow_up",
]);

const DEFAULT_PENDING_PRIORITY_WINDOW_MINUTES = 60;

function resolvePendingPriorityWindowMinutes(): number {
  const configured = Number(process.env.PENDING_REPLY_PRIORITY_WINDOW_MINUTES || "");
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(24 * 60, Math.max(5, configured));
  }

  return DEFAULT_PENDING_PRIORITY_WINDOW_MINUTES;
}

export function resolveDispatchPriorityRank(params: {
  origin: GuardableOrigin;
  priority?: GuardablePriority;
  isOwnerInitiated?: boolean;
}): number {
  const explicit = EXPLICIT_PRIORITY_RANK[params.priority || "normal"];
  const floor = ORIGIN_FLOOR_RANK[params.origin] || explicit;
  const ownerBoost = params.isOwnerInitiated ? 380 : 0;
  return Math.max(explicit, floor, ownerBoost);
}

export function shouldDeferAutomatedOrigin(origin: GuardableOrigin): boolean {
  return DEFERRED_ORIGINS.has(origin);
}

export function resolvePendingPriorityWaitMs(pendingCount: number): number {
  const safePendingCount = Math.max(1, pendingCount);
  const baseMs = 2 * 60 * 1000;
  const steppedMs = Math.min(5 * 60 * 1000, baseMs + safePendingCount * 30 * 1000);
  return steppedMs;
}

function buildPendingPriorityConversationFilters() {
  return [
    gte(conversations.lastMessageTime, new Date(Date.now() - resolvePendingPriorityWindowMinutes() * 60 * 1000)),
    eq(conversations.lastMessageFromMe, false),
    or(
      eq(conversations.needsHumanAttention, true),
      gt(conversations.unreadCount, 0),
    ),
  ];
}

export async function countPendingPriorityConversations(
  userId: string,
  excludeConversationId?: string,
): Promise<number> {
  const conversationFilters = [
    eq(whatsappConnections.userId, userId),
    ...buildPendingPriorityConversationFilters(),
  ];

  if (excludeConversationId) {
    conversationFilters.push(ne(conversations.id, excludeConversationId));
  }

  const [result] = await db
    .select({
      total: sql<number>`cast(count(*) as integer)`,
    })
    .from(conversations)
    .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
    .where(and(...conversationFilters));

  return Number(result?.total || 0);
}

export async function isConversationPendingPriority(conversationId: string): Promise<boolean> {
  if (!conversationId) {
    return false;
  }

  const [result] = await db
    .select({
      id: conversations.id,
    })
    .from(conversations)
    .where(and(
      eq(conversations.id, conversationId),
      ...buildPendingPriorityConversationFilters(),
    ))
    .limit(1);

  return Boolean(result?.id);
}
