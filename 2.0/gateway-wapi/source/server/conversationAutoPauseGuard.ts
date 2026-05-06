import { storage } from "./storage";

export const AUTOMATION_PAUSE_BLOCKED_MESSAGE_ID = "AUTOMATION_PAUSE_BLOCKED";

const MANUAL_ORIGINS = new Set(["manual_admin", "conversation"]);
const FOLLOW_UP_ORIGINS = new Set(["user_follow_up"]);

export interface AutomatedConversationPauseGuardInput {
  userId: string;
  jid: string;
  conversationId?: string | null;
  origin?: string | null;
  isOwnerInitiated?: boolean;
}

export interface AutomatedConversationPauseGuardResult {
  blocked: boolean;
  conversationId: string | null;
  contactNumber: string | null;
  reason?: string;
}

export function normalizeIndividualContactNumberFromJid(jid: string): string | null {
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast")) {
    return null;
  }

  const localPart = jid.split("@")[0]?.trim() || "";
  const digits = localPart.replace(/\D/g, "");
  return digits || null;
}

export async function resolveConversationIdForAutomatedSend(
  userId: string,
  jid: string,
  preferredConversationId?: string | null,
): Promise<{ conversationId: string | null; contactNumber: string | null }> {
  if (preferredConversationId) {
    return {
      conversationId: preferredConversationId,
      contactNumber: null,
    };
  }

  const contactNumber = normalizeIndividualContactNumberFromJid(jid);
  if (!contactNumber) {
    return {
      conversationId: null,
      contactNumber: null,
    };
  }

  const connections = await storage.getConnectionsByUserId(userId);
  for (const connection of connections) {
    const activeConversation = await storage.getActiveConversationByContactNumber(connection.id, contactNumber);
    if (activeConversation?.id) {
      return {
        conversationId: activeConversation.id,
        contactNumber,
      };
    }

    const conversation = await storage.getConversationByContactNumber(connection.id, contactNumber);
    if (conversation?.id) {
      return {
        conversationId: conversation.id,
        contactNumber,
      };
    }
  }

  return {
    conversationId: null,
    contactNumber,
  };
}

export async function shouldBlockAutomatedConversationSend(
  input: AutomatedConversationPauseGuardInput,
): Promise<AutomatedConversationPauseGuardResult> {
  if (input.isOwnerInitiated || (input.origin && MANUAL_ORIGINS.has(input.origin))) {
    return {
      blocked: false,
      conversationId: input.conversationId ?? null,
      contactNumber: normalizeIndividualContactNumberFromJid(input.jid),
    };
  }

  if (input.origin && FOLLOW_UP_ORIGINS.has(input.origin)) {
    return {
      blocked: false,
      conversationId: input.conversationId ?? null,
      contactNumber: normalizeIndividualContactNumberFromJid(input.jid),
    };
  }

  const { conversationId, contactNumber } = await resolveConversationIdForAutomatedSend(
    input.userId,
    input.jid,
    input.conversationId,
  );

  if (!conversationId) {
    return {
      blocked: false,
      conversationId: null,
      contactNumber,
    };
  }

  const isDisabled = await storage.isAgentDisabledForConversation(conversationId);
  if (!isDisabled) {
    return {
      blocked: false,
      conversationId,
      contactNumber,
    };
  }

  return {
    blocked: true,
    conversationId,
    contactNumber,
    reason: "Conversa pausada por resposta manual do dono",
  };
}
