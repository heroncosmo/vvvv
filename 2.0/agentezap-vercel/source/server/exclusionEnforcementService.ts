import { conversations, whatsappConnections } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { phoneNumbersMatch } from "./phoneMatch";
import { userFollowUpService } from "./userFollowUpService";

type ExclusionRule = {
  phoneNumber: string;
  excludeFromFollowup: boolean;
};

type UserConversationRow = {
  id: string;
  contactNumber: string;
  followupActive: boolean;
};

async function getUserConversations(userId: string): Promise<UserConversationRow[]> {
  const rows = await db
    .select({
      id: conversations.id,
      contactNumber: conversations.contactNumber,
      followupActive: conversations.followupActive,
    })
    .from(conversations)
    .innerJoin(whatsappConnections, eq(conversations.connectionId, whatsappConnections.id))
    .where(eq(whatsappConnections.userId, userId));

  return rows;
}

export async function enforceExclusionRulesForUser(
  userId: string,
  rules: ExclusionRule[],
): Promise<{
  matchedConversations: number;
  canceledPendingAi: number;
  disabledFollowups: number;
}> {
  const activeRules = rules.filter((rule) => rule.phoneNumber?.trim());
  if (activeRules.length === 0) {
    return {
      matchedConversations: 0,
      canceledPendingAi: 0,
      disabledFollowups: 0,
    };
  }

  const conversationsToCheck = await getUserConversations(userId);
  if (conversationsToCheck.length === 0) {
    return {
      matchedConversations: 0,
      canceledPendingAi: 0,
      disabledFollowups: 0,
    };
  }

  const { cancelPendingAIResponseForConversation } = await import("./whatsapp");

  let matchedConversations = 0;
  let canceledPendingAi = 0;
  let disabledFollowups = 0;

  for (const conversation of conversationsToCheck) {
    const matchingRules = activeRules.filter((rule) =>
      phoneNumbersMatch(conversation.contactNumber, rule.phoneNumber),
    );

    if (matchingRules.length === 0) {
      continue;
    }

    matchedConversations++;

    const canceled = await cancelPendingAIResponseForConversation(
      conversation.id,
      "number_excluded",
    );
    if (canceled) {
      canceledPendingAi++;
    }

    if (conversation.followupActive && matchingRules.some((rule) => rule.excludeFromFollowup)) {
      await userFollowUpService.disableFollowUp(
        conversation.id,
        "Número na lista de exclusão",
      );
      disabledFollowups++;
    }
  }

  return {
    matchedConversations,
    canceledPendingAi,
    disabledFollowups,
  };
}
