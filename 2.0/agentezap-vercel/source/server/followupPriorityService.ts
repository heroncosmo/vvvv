import { db } from "./db";
import {
  adminConversations,
  admins,
  conversations,
  users,
  whatsappConnections,
} from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export const FOLLOWUP_PRIORITY_EMAIL = "rodrigo4@gmail.com";

let cachedPriorityUserId: string | null | undefined;
let cachedPriorityAdminId: string | null | undefined;

export function normalizePriorityPhoneDigits(value: string | null | undefined): string {
  if (!value) return "";

  let normalized = "";
  for (const char of value) {
    if (char >= "0" && char <= "9") {
      normalized += char;
    }
  }

  return normalized;
}

export async function getFollowupPriorityUserId(): Promise<string | null> {
  if (cachedPriorityUserId !== undefined) {
    return cachedPriorityUserId;
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, FOLLOWUP_PRIORITY_EMAIL))
    .limit(1);

  cachedPriorityUserId = user?.id ?? null;
  return cachedPriorityUserId;
}

export async function getFollowupPriorityAdminId(): Promise<string | null> {
  if (cachedPriorityAdminId !== undefined) {
    return cachedPriorityAdminId;
  }

  const [admin] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, FOLLOWUP_PRIORITY_EMAIL))
    .limit(1);

  cachedPriorityAdminId = admin?.id ?? null;
  return cachedPriorityAdminId;
}

export function buildAdminPriorityConflictReason(keepConversationId: string) {
  return `priority_followup_claimed:${FOLLOWUP_PRIORITY_EMAIL}:admin:${keepConversationId}`;
}

export function buildUserPriorityConflictReason(keepConversationId: string) {
  return `priority_followup_claimed:${FOLLOWUP_PRIORITY_EMAIL}:user:${keepConversationId}`;
}

function rankPriorityUserConversation(
  conversation: typeof conversations.$inferSelect,
  connection?: typeof whatsappConnections.$inferSelect | null,
) {
  return (
    Number(conversation.followupActive === true) * 1_000_000 +
    (conversation.nextFollowupAt ? 10_000 : 0) +
    Math.max(0, Number(conversation.followupStage || 0)) * 100 +
    Number(connection?.isConnected === true) * 10 +
    new Date(
      conversation.lastMessageTime || conversation.updatedAt || conversation.createdAt || new Date(0),
    ).getTime()
  );
}

export async function listPriorityUserConversations(
  limit: number = 5000,
  options?: { activeOnly?: boolean },
) {
  const priorityUserId = await getFollowupPriorityUserId();
  if (!priorityUserId) {
    return [];
  }

  const rows = await db
    .select({
      conversation: conversations,
      connection: whatsappConnections,
    })
    .from(conversations)
    .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
    .where(
      and(
        eq(whatsappConnections.userId, priorityUserId),
        options?.activeOnly ? eq(conversations.followupActive, true) : sql`true`,
      ),
    )
    .orderBy(desc(conversations.lastMessageTime), desc(conversations.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row.conversation,
    connection: row.connection,
  }));
}

export async function listActivePriorityUserFollowups(limit: number = 5000) {
  return listPriorityUserConversations(limit, { activeOnly: true });
}

export async function mapPriorityUserConversationsByContact(
  limit: number = 5000,
  options?: { activeOnly?: boolean },
) {
  const conversationsByPhone = new Map<string, Awaited<ReturnType<typeof listPriorityUserConversations>>[number]>();
  const candidates = await listPriorityUserConversations(limit, options);

  for (const candidate of candidates) {
    const normalizedPhone = normalizePriorityPhoneDigits(candidate.contactNumber);
    if (!normalizedPhone) {
      continue;
    }

    const currentBest = conversationsByPhone.get(normalizedPhone);
    if (!currentBest) {
      conversationsByPhone.set(normalizedPhone, candidate);
      continue;
    }

    if (
      rankPriorityUserConversation(candidate, candidate.connection) >
      rankPriorityUserConversation(currentBest, currentBest.connection)
    ) {
      conversationsByPhone.set(normalizedPhone, candidate);
    }
  }

  return conversationsByPhone;
}

export async function findPriorityUserConversationByContact(
  contactNumber: string,
  excludeConversationId?: string,
  options?: { activeOnly?: boolean },
) {
  const priorityUserId = await getFollowupPriorityUserId();
  if (!priorityUserId) {
    return null;
  }

  const normalizedTarget = normalizePriorityPhoneDigits(contactNumber);
  if (!normalizedTarget) {
    return null;
  }

  const exactCandidates = await db.query.conversations.findMany({
    where: eq(conversations.contactNumber, contactNumber),
    with: {
      connection: true,
    },
    orderBy: (table, { desc: orderDesc }) => [orderDesc(table.lastMessageTime), orderDesc(table.createdAt)],
    limit: 200,
  });

  const exactMatches = exactCandidates.filter((candidate) => {
    if (candidate.connection?.userId !== priorityUserId) {
      return false;
    }

    if (excludeConversationId && candidate.id === excludeConversationId) {
      return false;
    }

    if (options?.activeOnly && candidate.followupActive !== true) {
      return false;
    }

    return normalizePriorityPhoneDigits(candidate.contactNumber) === normalizedTarget;
  });

  if (exactMatches.length > 0) {
    exactMatches.sort((left, right) => {
      return rankPriorityUserConversation(right, right.connection) - rankPriorityUserConversation(left, left.connection);
    });

    return exactMatches[0];
  }

  const candidates = await listPriorityUserConversations(50000, options);
  const matches = candidates.filter((candidate) => {
    if (excludeConversationId && candidate.id === excludeConversationId) {
      return false;
    }

    return normalizePriorityPhoneDigits(candidate.contactNumber) === normalizedTarget;
  });

  if (matches.length === 0) {
    return null;
  }

  matches.sort((left, right) => {
    return rankPriorityUserConversation(right, right.connection) - rankPriorityUserConversation(left, left.connection);
  });

  return matches[0];
}

export async function findActivePriorityUserFollowupByContact(
  contactNumber: string,
  excludeConversationId?: string,
) {
  return findPriorityUserConversationByContact(contactNumber, excludeConversationId, { activeOnly: true });
}

export async function findActiveAdminFollowupsByContact(
  contactNumber: string,
  excludeConversationId?: string,
) {
  const normalizedTarget = normalizePriorityPhoneDigits(contactNumber);
  if (!normalizedTarget) {
    return [];
  }

  const candidates = await db.query.adminConversations.findMany({
    where: eq(adminConversations.followupActive, true),
    orderBy: (table, { desc: orderDesc }) => [orderDesc(table.lastMessageTime), orderDesc(table.createdAt)],
    limit: 5000,
  });

  return candidates.filter((candidate) => {
    if (excludeConversationId && candidate.id === excludeConversationId) {
      return false;
    }

    return normalizePriorityPhoneDigits(candidate.contactNumber) === normalizedTarget;
  });
}

export async function disableAdminFollowupsForPriorityUser(
  contactNumber: string,
  keepConversationId: string,
  excludeConversationId?: string,
) {
  const reason = buildUserPriorityConflictReason(keepConversationId);
  const conflicts = await findActiveAdminFollowupsByContact(contactNumber, excludeConversationId);

  let disabled = 0;
  for (const conflict of conflicts) {
    await db.update(adminConversations)
      .set({
        followupActive: false,
        nextFollowupAt: null,
        followupDisabledReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(adminConversations.id, conflict.id));

    disabled += 1;
  }

  return { disabled, reason };
}
