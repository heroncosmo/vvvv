import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { messages, conversations, userFollowupLogs, whatsappConnections } from "@shared/schema";
import { ANTI_BAN_CONFIG, antiBanProtectionService } from "./antiBanProtectionService";
import { centralizedMessageSender } from "./centralizedMessageSender";
import { messageQueueService } from "./messageQueueService";
import { channelDispatchLock } from "./channelDispatchLock";
import { countPendingPriorityConversations } from "./outboundPriorityGuard";
import { memoryCache } from "./storage";

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function normalizeInt(value: unknown): number {
  return Number(value || 0);
}

export async function getOutboundAnalytics(userId: string) {
  const cacheKey = `followup:user:analytics:${userId}`;
  return memoryCache.getOrCompute(cacheKey, async () => {
    const todayStart = startOfToday();

    const [messageAggregate] = await db
      .select({
        totalOutbound: sql<number>`cast(count(*) as integer)`,
        automatedOutbound: sql<number>`cast(coalesce(sum(case when ${messages.isFromAgent} = true then 1 else 0 end), 0) as integer)`,
        manualOutbound: sql<number>`cast(coalesce(sum(case when ${messages.isFromAgent} = false then 1 else 0 end), 0) as integer)`,
        outboundConversations: sql<number>`cast(count(distinct ${messages.conversationId}) as integer)`,
      })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
      .where(
        and(
          eq(whatsappConnections.userId, userId),
          eq(messages.fromMe, true),
          gte(messages.timestamp, todayStart),
        ),
      );

    const [followupAggregate] = await db
      .select({
        total: sql<number>`cast(count(*) as integer)`,
        sent: sql<number>`cast(coalesce(sum(case when ${userFollowupLogs.status} = 'sent' then 1 else 0 end), 0) as integer)`,
        skipped: sql<number>`cast(coalesce(sum(case when ${userFollowupLogs.status} = 'skipped' then 1 else 0 end), 0) as integer)`,
        failed: sql<number>`cast(coalesce(sum(case when ${userFollowupLogs.status} = 'failed' then 1 else 0 end), 0) as integer)`,
      })
      .from(userFollowupLogs)
      .where(
        and(
          eq(userFollowupLogs.userId, userId),
          gte(userFollowupLogs.executedAt, todayStart),
        ),
      );

    const pendingPriorityConversations = await countPendingPriorityConversations(userId);
    const antiBanStats = antiBanProtectionService.getStats(userId);
    const senderStats = centralizedMessageSender.getStats(userId);
    const senderQueueSnapshot = centralizedMessageSender.getQueueSnapshot(userId);
    const legacyQueueSnapshot = messageQueueService.getUserStats(userId);
    const dispatchSnapshot = channelDispatchLock.getSnapshot(userId);

    const liveStatus = pendingPriorityConversations > 0
      ? "priorizando_clientes"
      : antiBanStats.isPaused
        ? "pausado_antiban"
        : dispatchSnapshot.isActive || senderQueueSnapshot.queueSize > 0 || legacyQueueSnapshot.queueLength > 0
          ? "processando_fila"
          : "canal_livre";

    return {
      status: liveStatus,
      live: {
        antiBan: antiBanStats,
        dispatch: dispatchSnapshot,
        centralized: senderQueueSnapshot,
        legacy: legacyQueueSnapshot,
        pendingPriorityConversations,
      },
      daily: {
        totalOutbound: normalizeInt(messageAggregate?.totalOutbound),
        automatedOutbound: normalizeInt(messageAggregate?.automatedOutbound),
        manualOutbound: normalizeInt(messageAggregate?.manualOutbound),
        outboundConversations: normalizeInt(messageAggregate?.outboundConversations),
        followupsProcessed: normalizeInt(followupAggregate?.total),
        followupsSent: normalizeInt(followupAggregate?.sent),
        followupsSkipped: normalizeInt(followupAggregate?.skipped),
        followupsFailed: normalizeInt(followupAggregate?.failed),
      },
      config: {
        minDelayMs: ANTI_BAN_CONFIG.MIN_DELAY_MS,
        maxDelayMs: ANTI_BAN_CONFIG.MAX_DELAY_MS,
        ownerMessageDelayMs: ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS,
        batchSize: ANTI_BAN_CONFIG.BATCH_SIZE,
        batchPauseSequenceMs: ANTI_BAN_CONFIG.BATCH_PAUSE_SEQUENCE_MS,
        maxMessagesPerMinute: ANTI_BAN_CONFIG.MAX_MESSAGES_PER_MINUTE,
        maxMessagesPerHour: ANTI_BAN_CONFIG.MAX_MESSAGES_PER_HOUR,
        typingEnabled: ANTI_BAN_CONFIG.TYPING_ENABLED,
        typingMinMs: ANTI_BAN_CONFIG.TYPING_MIN_MS,
        typingMaxMs: ANTI_BAN_CONFIG.TYPING_MAX_MS,
      },
      senderStats,
    };
  }, 20000);
}
