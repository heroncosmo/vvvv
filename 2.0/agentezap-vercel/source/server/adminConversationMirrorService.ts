import { adminConversations, adminWhatsappConnection, conversations, type Conversation, whatsappConnections } from "@shared/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { userFollowUpService } from "./userFollowUpService";

function adminConversationIsVisibleCondition() {
  return sql<boolean>`coalesce(${adminConversations.contextState} -> 'followupMigration' ->> 'migratedBackAt', '') = ''`;
}

export interface MirroredConversationRepairOptions {
  dryRun?: boolean;
  userId?: string;
  connectionId?: string;
  contactNumber?: string;
  adminId?: string;
  limit?: number;
}

export interface MirroredConversationRepairSummary {
  scanned: number;
  repaired: number;
  alreadyNeutralized: number;
  errors: Array<{ conversationId: string; error: string }>;
  conversations: Array<{
    conversationId: string;
    adminConversationId: string;
    userId: string;
    connectionId: string;
    contactNumber: string;
    isArchived: boolean;
    followupActive: boolean;
    unreadCount: number;
    agentDisabled: boolean;
  }>;
}

export interface MirroredConversationReconcileSummary {
  scanned: number;
  restored: number;
  alreadyRestored: number;
  hiddenAdminConversations: number;
  errors: Array<{ conversationId: string; error: string }>;
  conversations: Array<{
    conversationId: string;
    adminConversationId: string;
    userId: string;
    connectionId: string;
    contactNumber: string;
    isArchived: boolean;
    followupActive: boolean;
    followupDisabledReason: string | null;
    unreadCount: number;
    agentDisabled: boolean;
    adminConversationVisible: boolean;
  }>;
}

interface NeutralizeMirroredConversationParams {
  conversation: Conversation;
  adminConversationId: string;
  cancelPendingAIResponse?: (conversationId: string) => Promise<void>;
  broadcast?: (payload: { userId: string; conversationId: string }) => void;
  userId?: string;
}

interface RestoreMirroredConversationParams {
  conversation: Conversation;
  broadcast?: (payload: { userId: string; conversationId: string }) => void;
  userId?: string;
}

export const ADMIN_MIRROR_DISABLED_REASON = "Espelhado com conversa do admin";

function buildDisabledReason(adminConversationId: string): string {
  void adminConversationId;
  return ADMIN_MIRROR_DISABLED_REASON;
}

export async function neutralizeMirroredUserConversation(
  params: NeutralizeMirroredConversationParams,
): Promise<{ changed: boolean; disabledReason: string; agentDisabled: boolean }> {
  const { conversation, adminConversationId, cancelPendingAIResponse, broadcast, userId } = params;
  const disabledReason = buildDisabledReason(adminConversationId);
  const agentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
  const alreadyNeutralized =
    conversation.isArchived === true &&
    conversation.unreadCount === 0 &&
    conversation.followupActive === false &&
    conversation.followupDisabledReason === disabledReason &&
    agentDisabled;

  if (alreadyNeutralized) {
    return {
      changed: false,
      disabledReason,
      agentDisabled,
    };
  }

  if (cancelPendingAIResponse) {
    await cancelPendingAIResponse(conversation.id);
  }

  await storage.disableAgentForConversation(conversation.id, null);

  if (conversation.followupActive || conversation.followupDisabledReason !== disabledReason) {
    await userFollowUpService.disableFollowUp(conversation.id, disabledReason);
  }

  await storage.updateConversation(conversation.id, {
    isArchived: true,
    unreadCount: 0,
    followupDisabledReason: disabledReason,
  });

  if (broadcast && userId) {
    broadcast({
      userId,
      conversationId: conversation.id,
    });
  }

  return {
    changed: true,
    disabledReason,
    agentDisabled,
  };
}

export async function restoreMirroredUserConversation(
  params: RestoreMirroredConversationParams,
): Promise<{ changed: boolean; agentDisabled: boolean }> {
  const { conversation, broadcast, userId } = params;
  const agentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
  const shouldEnableFollowUp = conversation.followupDisabledReason === ADMIN_MIRROR_DISABLED_REASON;
  const alreadyRestored =
    conversation.isArchived !== true &&
    !agentDisabled &&
    !shouldEnableFollowUp;

  if (alreadyRestored) {
    return {
      changed: false,
      agentDisabled,
    };
  }

  if (agentDisabled) {
    await storage.enableAgentForConversation(conversation.id);
  }

  if (conversation.isArchived || shouldEnableFollowUp) {
    await storage.updateConversation(conversation.id, {
      isArchived: false,
      followupDisabledReason: shouldEnableFollowUp ? null : conversation.followupDisabledReason,
    });
  }

  if (shouldEnableFollowUp) {
    await userFollowUpService.enableFollowUp(conversation.id);
  }

  if (broadcast && userId) {
    broadcast({
      userId,
      conversationId: conversation.id,
    });
  }

  return {
    changed: true,
    agentDisabled,
  };
}

export async function repairAdminMirroredUserConversations(
  options: MirroredConversationRepairOptions = {},
): Promise<MirroredConversationRepairSummary> {
  const rawRows = await db
    .select({
      conversationId: conversations.id,
      connectionId: conversations.connectionId,
      userId: whatsappConnections.userId,
      contactNumber: conversations.contactNumber,
      adminConversationId: adminConversations.id,
      isArchived: conversations.isArchived,
      followupActive: conversations.followupActive,
      unreadCount: conversations.unreadCount,
    })
    .from(conversations)
    .innerJoin(whatsappConnections, eq(conversations.connectionId, whatsappConnections.id))
    .innerJoin(
      adminWhatsappConnection,
      eq(adminWhatsappConnection.phoneNumber, whatsappConnections.phoneNumber),
    )
    .innerJoin(
      adminConversations,
      and(
        eq(adminConversations.adminId, adminWhatsappConnection.adminId),
        eq(adminConversations.contactNumber, conversations.contactNumber),
        adminConversationIsVisibleCondition(),
      ),
    )
    .where(
      and(
        isNotNull(whatsappConnections.phoneNumber),
        options.userId ? eq(whatsappConnections.userId, options.userId) : sql`true`,
        options.connectionId ? eq(conversations.connectionId, options.connectionId) : sql`true`,
        options.contactNumber ? eq(conversations.contactNumber, options.contactNumber) : sql`true`,
        options.adminId ? eq(adminConversations.adminId, options.adminId) : sql`true`,
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(options.limit ?? 500);

  const rows = Array.from(
    rawRows.reduce((map, row) => {
      if (!map.has(row.adminConversationId)) {
        map.set(row.adminConversationId, row);
      }
      return map;
    }, new Map<string, (typeof rawRows)[number]>()),
  ).map(([, row]) => row);

  const summary: MirroredConversationRepairSummary = {
    scanned: rows.length,
    repaired: 0,
    alreadyNeutralized: 0,
    errors: [],
    conversations: [],
  };

  for (const row of rows) {
    try {
      const conversation = await storage.getConversation(row.conversationId);
      if (!conversation) {
        summary.errors.push({
          conversationId: row.conversationId,
          error: "Conversa nao encontrada no storage",
        });
        continue;
      }

      const agentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
      summary.conversations.push({
        conversationId: conversation.id,
        adminConversationId: row.adminConversationId,
        userId: row.userId,
        connectionId: row.connectionId,
        contactNumber: row.contactNumber,
        isArchived: row.isArchived,
        followupActive: row.followupActive,
        unreadCount: row.unreadCount,
        agentDisabled,
      });

      if (options.dryRun !== false) {
        const disabledReason = buildDisabledReason(row.adminConversationId);
        const alreadyNeutralized =
          conversation.isArchived === true &&
          conversation.unreadCount === 0 &&
          conversation.followupActive === false &&
          conversation.followupDisabledReason === disabledReason &&
          agentDisabled;

        if (alreadyNeutralized) {
          summary.alreadyNeutralized++;
        }
        continue;
      }

      const result = await neutralizeMirroredUserConversation({
        conversation,
        adminConversationId: row.adminConversationId,
      });

      if (result.changed) {
        summary.repaired++;
      } else {
        summary.alreadyNeutralized++;
      }
    } catch (error: any) {
      summary.errors.push({
        conversationId: row.conversationId,
        error: error?.message || String(error),
      });
    }
  }

  return summary;
}

export async function reconcileAdminNotificationOwnerMirrors(
  options: MirroredConversationRepairOptions = {},
): Promise<MirroredConversationReconcileSummary> {
  const rawRows = await db
    .select({
      conversationId: conversations.id,
      connectionId: conversations.connectionId,
      userId: whatsappConnections.userId,
      contactNumber: conversations.contactNumber,
      adminConversationId: adminConversations.id,
      adminContextState: adminConversations.contextState,
      isArchived: conversations.isArchived,
      followupActive: conversations.followupActive,
      followupDisabledReason: conversations.followupDisabledReason,
      unreadCount: conversations.unreadCount,
    })
    .from(conversations)
    .innerJoin(whatsappConnections, eq(conversations.connectionId, whatsappConnections.id))
    .innerJoin(
      adminWhatsappConnection,
      eq(adminWhatsappConnection.phoneNumber, whatsappConnections.phoneNumber),
    )
    .innerJoin(
      adminConversations,
      and(
        eq(adminConversations.adminId, adminWhatsappConnection.adminId),
        eq(adminConversations.contactNumber, conversations.contactNumber),
        adminConversationIsVisibleCondition(),
      ),
    )
    .where(
      and(
        isNotNull(whatsappConnections.phoneNumber),
        options.userId ? eq(whatsappConnections.userId, options.userId) : sql`true`,
        options.connectionId ? eq(conversations.connectionId, options.connectionId) : sql`true`,
        options.contactNumber ? eq(conversations.contactNumber, options.contactNumber) : sql`true`,
        options.adminId ? eq(adminConversations.adminId, options.adminId) : sql`true`,
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(options.limit ?? 500);

  const rows = Array.from(
    rawRows.reduce((map, row) => {
      if (!map.has(row.conversationId)) {
        map.set(row.conversationId, row);
      }
      return map;
    }, new Map<string, (typeof rawRows)[number]>()),
  ).map(([, row]) => row);

  const summary: MirroredConversationReconcileSummary = {
    scanned: rows.length,
    restored: 0,
    alreadyRestored: 0,
    hiddenAdminConversations: 0,
    errors: [],
    conversations: [],
  };

  for (const row of rows) {
    try {
      const conversation = await storage.getConversation(row.conversationId);
      if (!conversation) {
        summary.errors.push({
          conversationId: row.conversationId,
          error: "Conversa nao encontrada no storage",
        });
        continue;
      }

      const agentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
      const adminConversationVisible =
        !row.adminContextState?.followupMigration?.migratedBackAt;

      summary.conversations.push({
        conversationId: conversation.id,
        adminConversationId: row.adminConversationId,
        userId: row.userId,
        connectionId: row.connectionId,
        contactNumber: row.contactNumber,
        isArchived: row.isArchived,
        followupActive: row.followupActive,
        followupDisabledReason: row.followupDisabledReason,
        unreadCount: row.unreadCount,
        agentDisabled,
        adminConversationVisible,
      });

      const needsRestore =
        conversation.isArchived === true ||
        agentDisabled ||
        conversation.followupDisabledReason === ADMIN_MIRROR_DISABLED_REASON;

      if (options.dryRun !== false) {
        if (!needsRestore) {
          summary.alreadyRestored++;
        }
        if (adminConversationVisible) {
          summary.hiddenAdminConversations++;
        }
        continue;
      }

      if (needsRestore) {
        const result = await restoreMirroredUserConversation({
          conversation,
        });

        if (result.changed) {
          summary.restored++;
        } else {
          summary.alreadyRestored++;
        }
      } else {
        summary.alreadyRestored++;
      }

      if (adminConversationVisible) {
        const nextContextState = {
          ...(row.adminContextState || {}),
          followupMigration: {
            ...(row.adminContextState?.followupMigration || {}),
            migratedBackAt: new Date().toISOString(),
            migratedBackReason: "Continuidade movida para inbox do usuario dono",
            ownerInboxUserId: row.userId,
            ownerInboxConnectionId: row.connectionId,
          },
        };

        await db
          .update(adminConversations)
          .set({
            contextState: nextContextState as any,
            updatedAt: new Date(),
          })
          .where(eq(adminConversations.id, row.adminConversationId));

        summary.hiddenAdminConversations++;
      }
    } catch (error: any) {
      summary.errors.push({
        conversationId: row.conversationId,
        error: error?.message || String(error),
      });
    }
  }

  return summary;
}
