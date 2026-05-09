import type { WhatsappConnection } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "./db";
import { isInternalOnlySimulatorConnection } from "./internalSimulatorConnection";
import { normalizePhoneToDigits } from "./phoneMatch";
import { getAppVisibleGatewayBulkStatusMap } from "./whatsappGatewayAppRuntime";
import { memoryCache, storage } from "./storage";
import {
  agentDisabledConversations,
  appointments,
  conversationLeadIntelligence,
  conversations,
  conversationScheduledMessages,
  conversationTags,
  courseSchedulingInsights,
  customFieldValues,
  messages,
  routingLogs,
  scheduledMessages,
  ticketClosureLogs,
  userFollowupLogs,
  whatsappConnections,
} from "@shared/schema";
import {
  pickPhoneGroupSurvivor,
  type ConnectionContinuityCandidate,
} from "./whatsappConnectionContinuityRules";

type ReconcileResult = {
  changed: boolean;
  survivingConnectionIds: string[];
  removedConnectionIds: string[];
};

const STRUCTURAL_FOLLOWUP_RECOVERY_REASONS = [
  "Conexão removida - sem userId",
  "Conexao removida - sem userId",
] as const;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ConversationConflictRow = {
  sourceId: string;
  sourceContactName: string | null;
  sourceRemoteJid: string | null;
  sourceJidSuffix: string | null;
  sourceContactAvatar: string | null;
  sourceUnreadCount: number | null;
  sourceHasReplied: boolean | null;
  sourceFollowupActive: boolean | null;
  sourceFollowupStage: number | null;
  sourceNextFollowupAt: Date | null;
  sourceFollowupDisabledReason: string | null;
  targetId: string;
};

function normalizeManagedPhoneNumber(phoneNumber?: string | null): string | null {
  const digits = normalizePhoneToDigits(phoneNumber || "");
  return digits || null;
}

function normalizeProviderStatus(status?: string | null): string | null {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized || null;
}

function isConnectionOperational(candidate: ConnectionContinuityCandidate): boolean {
  if (typeof candidate.runtimeIsConnected === "boolean") {
    return candidate.runtimeIsConnected;
  }

  return (
    candidate.isConnected === true ||
    normalizeProviderStatus(candidate.providerStatus) === "connected"
  );
}

function extractRows<T>(result: unknown): T[] {
  if (result && typeof result === "object" && Array.isArray((result as any).rows)) {
    return (result as any).rows as T[];
  }

  return Array.isArray(result) ? (result as T[]) : [];
}

function buildMergedProviderStatus(
  group: ConnectionContinuityCandidate[],
  survivor: ConnectionContinuityCandidate,
  mergedOperational: boolean,
): string | null | undefined {
  if (mergedOperational) {
    return "connected";
  }

  const firstExplicitDisconnected = group
    .map((candidate) => normalizeProviderStatus(candidate.providerStatus))
    .find((status) => status && status !== "connected");

  if (firstExplicitDisconnected) {
    return firstExplicitDisconnected;
  }

  return normalizeProviderStatus(survivor.providerStatus) === "connected"
    ? "inactive"
    : survivor.providerStatus;
}

async function listConversationCountsByConnectionIds(
  connectionIds: string[],
): Promise<Map<string, number>> {
  if (connectionIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      connectionId: conversations.connectionId,
      total: sql<number>`count(*)`,
    })
    .from(conversations)
    .where(inArray(conversations.connectionId, connectionIds))
    .groupBy(conversations.connectionId);

  return new Map(rows.map((row) => [row.connectionId, Number(row.total || 0)]));
}

async function enrichCandidatesWithRuntimeState(
  existingConnections: WhatsappConnection[],
  liveCandidates?: ConnectionContinuityCandidate[],
): Promise<ConnectionContinuityCandidate[]> {
  const providedById = new Map((liveCandidates || []).map((item) => [item.id, item]));
  const runtimeStatusMap = await getAppVisibleGatewayBulkStatusMap(existingConnections);

  return existingConnections.map((connection) => {
    const provided = providedById.get(connection.id);
    const runtimeStatus = runtimeStatusMap.get(connection.id);

    return {
      ...connection,
      runtimePhoneNumber:
        runtimeStatus?.phoneNumber ??
        provided?.runtimePhoneNumber ??
        provided?.phoneNumber ??
        connection.phoneNumber,
      runtimeIsConnected:
        typeof runtimeStatus?.isConnected === "boolean"
          ? runtimeStatus.isConnected
          : typeof provided?.runtimeIsConnected === "boolean"
            ? provided.runtimeIsConnected
            : typeof provided?.isConnected === "boolean"
              ? provided.isConnected
              : undefined,
      conversationCount: provided?.conversationCount,
    };
  });
}

async function listActiveConversationConflicts(
  tx: DbTransaction,
  sourceConnectionId: string,
  targetConnectionId: string,
): Promise<ConversationConflictRow[]> {
  const result = await tx.execute(sql`
    SELECT
      source.id AS "sourceId",
      source.contact_name AS "sourceContactName",
      source.remote_jid AS "sourceRemoteJid",
      source.jid_suffix AS "sourceJidSuffix",
      source.contact_avatar AS "sourceContactAvatar",
      source.unread_count AS "sourceUnreadCount",
      source.has_replied AS "sourceHasReplied",
      source.followup_active AS "sourceFollowupActive",
      source.followup_stage AS "sourceFollowupStage",
      source.next_followup_at AS "sourceNextFollowupAt",
      source.followup_disabled_reason AS "sourceFollowupDisabledReason",
      target.id AS "targetId"
    FROM conversations source
    INNER JOIN conversations target
      ON target.connection_id = ${targetConnectionId}
     AND target.contact_number = source.contact_number
     AND (target.is_closed = false OR target.is_closed IS NULL)
    WHERE source.connection_id = ${sourceConnectionId}
      AND (source.is_closed = false OR source.is_closed IS NULL)
  `);

  return extractRows<ConversationConflictRow>(result);
}

async function mergeConversationIntoTarget(
  tx: DbTransaction,
  sourceConversation: ConversationConflictRow,
  targetConnectionId: string,
) {
  const sourceConversationId = sourceConversation.sourceId;
  const targetConversationId = sourceConversation.targetId;

  if (!sourceConversationId || !targetConversationId || sourceConversationId === targetConversationId) {
    return;
  }

  await tx.execute(sql`
    DELETE FROM messages source
    USING messages target
    WHERE source.conversation_id = ${sourceConversationId}
      AND target.conversation_id = ${targetConversationId}
      AND target.message_id = source.message_id
  `);

  await tx
    .update(messages)
    .set({ conversationId: targetConversationId })
    .where(eq(messages.conversationId, sourceConversationId));

  await tx.execute(sql`
    DELETE FROM conversation_tags source
    USING conversation_tags target
    WHERE source.conversation_id = ${sourceConversationId}
      AND target.conversation_id = ${targetConversationId}
      AND target.tag_id = source.tag_id
  `);

  await tx
    .update(conversationTags)
    .set({ conversationId: targetConversationId })
    .where(eq(conversationTags.conversationId, sourceConversationId));

  await tx.execute(sql`
    DELETE FROM custom_field_values source
    USING custom_field_values target
    WHERE source.conversation_id = ${sourceConversationId}
      AND target.conversation_id = ${targetConversationId}
      AND target.field_definition_id = source.field_definition_id
  `);

  await tx
    .update(customFieldValues)
    .set({ conversationId: targetConversationId, updatedAt: new Date() })
    .where(eq(customFieldValues.conversationId, sourceConversationId));

  await tx
    .update(routingLogs)
    .set({ conversationId: targetConversationId })
    .where(eq(routingLogs.conversationId, sourceConversationId));

  await tx
    .update(ticketClosureLogs)
    .set({ conversationId: targetConversationId })
    .where(eq(ticketClosureLogs.conversationId, sourceConversationId));

  await tx
    .update(scheduledMessages)
    .set({
      conversationId: targetConversationId,
      connectionId: targetConnectionId,
      updatedAt: new Date(),
    })
    .where(eq(scheduledMessages.conversationId, sourceConversationId));

  await tx
    .update(conversationScheduledMessages)
    .set({ conversationId: targetConversationId })
    .where(eq(conversationScheduledMessages.conversationId, sourceConversationId));

  await tx
    .update(appointments)
    .set({ conversationId: targetConversationId })
    .where(eq(appointments.conversationId, sourceConversationId));

  await tx
    .update(userFollowupLogs)
    .set({ conversationId: targetConversationId })
    .where(eq(userFollowupLogs.conversationId, sourceConversationId));

  await tx.execute(sql`
    UPDATE delivery_orders
    SET conversation_id = ${targetConversationId}
    WHERE conversation_id = ${sourceConversationId}
  `);

  await tx.execute(sql`
    UPDATE delivery_pedidos
    SET conversation_id = ${targetConversationId}
    WHERE conversation_id = ${sourceConversationId}
  `);

  await tx.execute(sql`
    UPDATE funnel_deals
    SET conversation_id = ${targetConversationId}
    WHERE conversation_id = ${sourceConversationId}
  `);

  await tx.execute(sql`
    UPDATE grupo_olx_lead_events
    SET conversation_id = ${targetConversationId}
    WHERE conversation_id = ${sourceConversationId}
  `);

  await tx.execute(sql`
    UPDATE referral_share_logs
    SET target_conversation_id = ${targetConversationId}
    WHERE target_conversation_id = ${sourceConversationId}
  `);

  await tx.execute(sql`
    DELETE FROM conversation_lead_intelligence source
    USING conversation_lead_intelligence target
    WHERE source.conversation_id = ${sourceConversationId}
      AND target.conversation_id = ${targetConversationId}
  `);

  await tx
    .update(conversationLeadIntelligence)
    .set({
      conversationId: targetConversationId,
      connectionId: targetConnectionId,
      updatedAt: new Date(),
    })
    .where(eq(conversationLeadIntelligence.conversationId, sourceConversationId));

  await tx.execute(sql`
    DELETE FROM course_scheduling_insights source
    USING course_scheduling_insights target
    WHERE source.conversation_id = ${sourceConversationId}
      AND target.conversation_id = ${targetConversationId}
  `);

  await tx
    .update(courseSchedulingInsights)
    .set({
      conversationId: targetConversationId,
      connectionId: targetConnectionId,
      updatedAt: new Date(),
    })
    .where(eq(courseSchedulingInsights.conversationId, sourceConversationId));

  await tx.execute(sql`
    DELETE FROM conversation_flow_states source
    USING conversation_flow_states target
    WHERE source.conversation_id = ${sourceConversationId}
      AND target.conversation_id = ${targetConversationId}
  `);

  await tx.execute(sql`
    UPDATE conversation_flow_states
    SET conversation_id = ${targetConversationId}
    WHERE conversation_id = ${sourceConversationId}
  `);

  await tx.execute(sql`
    DELETE FROM agendamento2_insights source
    USING agendamento2_insights target
    WHERE source.conversation_id = ${sourceConversationId}
      AND target.conversation_id = ${targetConversationId}
  `);

  await tx.execute(sql`
    UPDATE agendamento2_insights
    SET conversation_id = ${targetConversationId}
    WHERE conversation_id = ${sourceConversationId}
  `);

  await tx.execute(sql`
    INSERT INTO agent_disabled_conversations (
      conversation_id,
      owner_last_reply_at,
      auto_reactivate_after_minutes,
      client_has_pending_message,
      client_last_message_at,
      created_at
    )
    SELECT
      ${targetConversationId},
      owner_last_reply_at,
      auto_reactivate_after_minutes,
      client_has_pending_message,
      client_last_message_at,
      created_at
    FROM agent_disabled_conversations
    WHERE conversation_id = ${sourceConversationId}
    ON CONFLICT (conversation_id) DO UPDATE
    SET owner_last_reply_at = GREATEST(
          COALESCE(agent_disabled_conversations.owner_last_reply_at, EXCLUDED.owner_last_reply_at),
          COALESCE(EXCLUDED.owner_last_reply_at, agent_disabled_conversations.owner_last_reply_at)
        ),
        auto_reactivate_after_minutes = COALESCE(
          agent_disabled_conversations.auto_reactivate_after_minutes,
          EXCLUDED.auto_reactivate_after_minutes
        ),
        client_has_pending_message = COALESCE(agent_disabled_conversations.client_has_pending_message, false)
          OR COALESCE(EXCLUDED.client_has_pending_message, false),
        client_last_message_at = GREATEST(
          COALESCE(agent_disabled_conversations.client_last_message_at, EXCLUDED.client_last_message_at),
          COALESCE(EXCLUDED.client_last_message_at, agent_disabled_conversations.client_last_message_at)
        )
  `);

  await tx
    .delete(agentDisabledConversations)
    .where(eq(agentDisabledConversations.conversationId, sourceConversationId));

  await tx.execute(sql`
    UPDATE conversations
    SET connection_id = ${targetConnectionId},
        contact_name = COALESCE(contact_name, ${sourceConversation.sourceContactName}),
        remote_jid = COALESCE(remote_jid, ${sourceConversation.sourceRemoteJid}),
        jid_suffix = COALESCE(jid_suffix, ${sourceConversation.sourceJidSuffix}),
        contact_avatar = COALESCE(contact_avatar, ${sourceConversation.sourceContactAvatar}),
        unread_count = COALESCE(unread_count, 0) + ${Number(sourceConversation.sourceUnreadCount || 0)},
        has_replied = COALESCE(has_replied, false) OR ${sourceConversation.sourceHasReplied === true},
        followup_active = COALESCE(followup_active, true) AND ${sourceConversation.sourceFollowupActive !== false},
        followup_stage = GREATEST(COALESCE(followup_stage, 0), ${Number(sourceConversation.sourceFollowupStage || 0)}),
        next_followup_at = COALESCE(next_followup_at, ${sourceConversation.sourceNextFollowupAt}),
        followup_disabled_reason = CASE
          WHEN (COALESCE(followup_active, true) AND ${sourceConversation.sourceFollowupActive !== false}) = false
            THEN COALESCE(followup_disabled_reason, ${sourceConversation.sourceFollowupDisabledReason})
          ELSE followup_disabled_reason
        END,
        updated_at = NOW()
    WHERE id = ${targetConversationId}
  `);

  await tx.execute(sql`
    WITH latest_message AS (
      SELECT text, timestamp, from_me
      FROM messages
      WHERE conversation_id = ${targetConversationId}
      ORDER BY timestamp DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
    )
    UPDATE conversations
    SET last_message_text = COALESCE(latest_message.text, conversations.last_message_text),
        last_message_time = COALESCE(latest_message.timestamp, conversations.last_message_time),
        last_message_from_me = COALESCE(latest_message.from_me, conversations.last_message_from_me),
        updated_at = NOW()
    FROM latest_message
    WHERE conversations.id = ${targetConversationId}
  `);

  await tx
    .delete(conversations)
    .where(eq(conversations.id, sourceConversationId));
}

async function mergeConnectionReferences(sourceConnectionId: string, targetConnectionId: string) {
  if (sourceConnectionId === targetConnectionId) {
    return;
  }

  await db.transaction(async (tx) => {
    const conflicts = await listActiveConversationConflicts(tx, sourceConnectionId, targetConnectionId);
    for (const conflict of conflicts) {
      await mergeConversationIntoTarget(tx, conflict, targetConnectionId);
    }

    await tx
      .update(conversations)
      .set({ connectionId: targetConnectionId, updatedAt: new Date() })
      .where(eq(conversations.connectionId, sourceConnectionId));

    await tx.execute(sql`
      DELETE FROM whatsapp_contacts source
      USING whatsapp_contacts target
      WHERE source.connection_id = ${sourceConnectionId}
        AND target.connection_id = ${targetConnectionId}
        AND target.contact_id = source.contact_id
    `);

    await tx.execute(sql`
      UPDATE whatsapp_contacts
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      INSERT INTO connection_agents (connection_id, agent_id, is_active, assigned_at, assigned_by)
      SELECT
        ${targetConnectionId},
        agent_id,
        is_active,
        assigned_at,
        assigned_by
      FROM connection_agents
      WHERE connection_id = ${sourceConnectionId}
      ON CONFLICT (connection_id, agent_id) DO UPDATE
      SET is_active = connection_agents.is_active OR EXCLUDED.is_active,
          assigned_by = COALESCE(connection_agents.assigned_by, EXCLUDED.assigned_by)
    `);

    await tx.execute(sql`
      DELETE FROM connection_agents
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      INSERT INTO connection_members (connection_id, member_id, can_view, can_respond, can_manage, assigned_at)
      SELECT
        ${targetConnectionId},
        member_id,
        can_view,
        can_respond,
        can_manage,
        assigned_at
      FROM connection_members
      WHERE connection_id = ${sourceConnectionId}
      ON CONFLICT (connection_id, member_id) DO UPDATE
      SET can_view = connection_members.can_view OR EXCLUDED.can_view,
          can_respond = connection_members.can_respond OR EXCLUDED.can_respond,
          can_manage = connection_members.can_manage OR EXCLUDED.can_manage
    `);

    await tx.execute(sql`
      DELETE FROM connection_members
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE conversation_lead_intelligence
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE course_scheduling_insights
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE scheduled_messages
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE broadcast_campaigns
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE grupo_olx_integrations
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE google_sheet_lead_integrations
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE status_posts
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE status_publish_jobs
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE status_rotations
      SET connection_id = ${targetConnectionId},
          updated_at = NOW()
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx.execute(sql`
      UPDATE status_publish_runs
      SET connection_id = ${targetConnectionId}
      WHERE connection_id = ${sourceConnectionId}
    `);

    await tx
      .delete(whatsappConnections)
      .where(eq(whatsappConnections.id, sourceConnectionId));
  });

  await recoverStructuralFollowUpsForConnection(targetConnectionId);
}

export async function recoverStructuralFollowUpsForConnection(
  connectionId: string,
): Promise<number> {
  const recovered = await db
    .update(conversations)
    .set({
      followupActive: true,
      nextFollowupAt: null,
      followupDisabledReason: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conversations.connectionId, connectionId),
        eq(conversations.followupActive, false),
        inArray(conversations.followupDisabledReason, [...STRUCTURAL_FOLLOWUP_RECOVERY_REASONS]),
      ),
    )
    .returning({ id: conversations.id });

  return recovered.length;
}

export async function countConnectionConversations(connectionId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(conversations)
    .where(eq(conversations.connectionId, connectionId));
  return Number(row?.total || 0);
}

export async function findSamePhoneSiblingConnection(
  connection: Pick<WhatsappConnection, "id" | "userId" | "phoneNumber">,
): Promise<WhatsappConnection | undefined> {
  const normalizedPhone = normalizeManagedPhoneNumber(connection.phoneNumber);
  if (!normalizedPhone) {
    return undefined;
  }

  const siblings = await storage.getConnectionsByUserId(connection.userId);
  return siblings.find((candidate) => {
    if (candidate.id === connection.id) {
      return false;
    }
    if (isInternalOnlySimulatorConnection(candidate)) {
      return false;
    }

    return normalizeManagedPhoneNumber(candidate.phoneNumber) === normalizedPhone;
  });
}

export async function findReusableDisconnectedConnectionForCreation(
  userId: string,
): Promise<WhatsappConnection | undefined> {
  const connections = (await storage.getConnectionsByUserId(userId)).filter(
    (connection) => !isInternalOnlySimulatorConnection(connection),
  );
  if (connections.length !== 1) {
    return undefined;
  }

  const [onlyConnection] = connections;
  if (onlyConnection.isConnected) {
    return undefined;
  }

  const historyCount = await countConnectionConversations(onlyConnection.id);
  if (historyCount === 0) {
    return undefined;
  }

  return onlyConnection;
}

export async function ensureManagedPhoneConnectionContinuity(params: {
  userId: string;
  connectionId: string;
  runtimePhoneNumber?: string | null;
  runtimeIsConnected?: boolean;
}): Promise<WhatsappConnection | null> {
  const currentConnection = await storage.getConnectionById(params.connectionId);
  if (!currentConnection || currentConnection.userId !== params.userId) {
    return null;
  }

  const normalizedRuntimePhone =
    normalizeManagedPhoneNumber(params.runtimePhoneNumber) ||
    normalizeManagedPhoneNumber(currentConnection.phoneNumber);

  if (!normalizedRuntimePhone) {
    return currentConnection;
  }

  const shouldRefreshCurrentConnection =
    normalizedRuntimePhone !== normalizeManagedPhoneNumber(currentConnection.phoneNumber) ||
    (params.runtimeIsConnected === true && currentConnection.isConnected !== true);

  const continuityBaseConnection = shouldRefreshCurrentConnection
    ? await storage.updateConnection(currentConnection.id, {
        phoneNumber: normalizedRuntimePhone,
        isConnected:
          typeof params.runtimeIsConnected === "boolean"
            ? params.runtimeIsConnected
            : currentConnection.isConnected,
        providerStatus:
          params.runtimeIsConnected === true
            ? "connected"
            : currentConnection.providerStatus,
      })
    : currentConnection;

  await reconcileDuplicatePhoneConnectionsForUser(params.userId, [
    {
      ...continuityBaseConnection,
      runtimePhoneNumber: normalizedRuntimePhone,
      runtimeIsConnected:
        typeof params.runtimeIsConnected === "boolean"
          ? params.runtimeIsConnected
          : continuityBaseConnection.isConnected,
    },
  ]);

  return (await storage.getConnectionById(continuityBaseConnection.id)) || continuityBaseConnection;
}

export async function reconcileDuplicatePhoneConnectionsForUser(
  userId: string,
  liveCandidates?: ConnectionContinuityCandidate[],
): Promise<ReconcileResult> {
  const existingConnections = (await storage.getConnectionsByUserId(userId)).filter(
    (connection) => !isInternalOnlySimulatorConnection(connection),
  );
  if (existingConnections.length < 2) {
    return {
      changed: false,
      survivingConnectionIds: existingConnections.map((item) => item.id),
      removedConnectionIds: [],
    };
  }

  const connectionCounts = await listConversationCountsByConnectionIds(
    existingConnections.map((item) => item.id),
  );
  const mergedCandidates = await enrichCandidatesWithRuntimeState(existingConnections, liveCandidates);
  for (const candidate of mergedCandidates) {
    candidate.conversationCount = connectionCounts.get(candidate.id) || 0;
  }

  const groupedByPhone = new Map<string, ConnectionContinuityCandidate[]>();
  for (const candidate of mergedCandidates) {
    const normalizedPhone =
      normalizeManagedPhoneNumber(candidate.runtimePhoneNumber) ||
      normalizeManagedPhoneNumber(candidate.phoneNumber);
    if (!normalizedPhone) {
      continue;
    }

    const bucket = groupedByPhone.get(normalizedPhone) || [];
    bucket.push(candidate);
    groupedByPhone.set(normalizedPhone, bucket);
  }

  const survivingConnectionIds = new Set<string>(existingConnections.map((item) => item.id));
  const removedConnectionIds: string[] = [];
  let changed = false;

  for (const [normalizedPhone, group] of groupedByPhone.entries()) {
    if (group.length < 2) {
      continue;
    }

    const survivor = pickPhoneGroupSurvivor(group);
    const duplicates = group.filter((candidate) => candidate.id !== survivor.id);
    if (duplicates.length === 0) {
      continue;
    }

    const shouldPromoteToPrimary =
      group.some((candidate) => candidate.isPrimary) ||
      existingConnections.length === 2;

    const mergedConnectionName =
      survivor.connectionName ||
      duplicates.find((candidate) => candidate.connectionName)?.connectionName ||
      null;
    const mergedConnectionType =
      shouldPromoteToPrimary
        ? "primary"
        : survivor.connectionType ||
          duplicates.find((candidate) => candidate.connectionType)?.connectionType ||
          "secondary";
    const mergedOperational = group.some((candidate) => isConnectionOperational(candidate));
    const mergedProviderStatus = buildMergedProviderStatus(group, survivor, mergedOperational);

    await storage.updateConnection(survivor.id, {
      phoneNumber: normalizedPhone,
      connectionName: mergedConnectionName,
      connectionType: mergedConnectionType,
      isPrimary: shouldPromoteToPrimary,
      isConnected: mergedOperational,
      providerStatus: mergedProviderStatus,
      aiEnabled: group.some((candidate) => candidate.aiEnabled),
    });

    for (const duplicate of duplicates) {
      await mergeConnectionReferences(duplicate.id, survivor.id);
      survivingConnectionIds.delete(duplicate.id);
      removedConnectionIds.push(duplicate.id);
      changed = true;
    }
  }

  if (changed) {
    memoryCache.invalidate(`connByUser:${userId}`);
    memoryCache.invalidate(`api:wa-conn:${userId}`);
    memoryCache.invalidate(`api:wa-conn:${userId}:default`);
  }

  return {
    changed,
    survivingConnectionIds: [...survivingConnectionIds],
    removedConnectionIds,
  };
}

export async function deleteConnectionSafely(connectionId: string): Promise<{
  deleted: boolean;
  mergedIntoConnectionId?: string;
  blockedByHistory?: boolean;
}> {
  const connection = await storage.getConnectionById(connectionId);
  if (!connection) {
    return { deleted: false };
  }

  const mergeTarget = await findSamePhoneSiblingConnection(connection);
  if (mergeTarget) {
    const connectionCounts = await listConversationCountsByConnectionIds([
      connection.id,
      mergeTarget.id,
    ]);
    const candidates = await enrichCandidatesWithRuntimeState([
      connection as WhatsappConnection,
      mergeTarget,
    ]);
    const survivor = pickPhoneGroupSurvivor(
      candidates.map((candidate) => ({
        ...candidate,
        conversationCount: connectionCounts.get(candidate.id) || 0,
      })),
    );

    const sourceId = survivor.id === connection.id ? mergeTarget.id : connection.id;
    const targetId = survivor.id;
    await mergeConnectionReferences(sourceId, targetId);
    memoryCache.invalidate(`connByUser:${connection.userId}`);
    memoryCache.invalidate(`api:wa-conn:${connection.userId}`);
    memoryCache.invalidate(`api:wa-conn:${connection.userId}:default`);
    return { deleted: true, mergedIntoConnectionId: targetId };
  }

  const historyCount = await countConnectionConversations(connection.id);
  if (historyCount > 0) {
    return { deleted: false, blockedByHistory: true };
  }

  await storage.deleteConnection(connection.id);
  return { deleted: true };
}
