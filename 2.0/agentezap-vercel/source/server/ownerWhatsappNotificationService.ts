import { storage } from "./storage";
import { buildBrazilWhatsAppPhoneVariants, buildWhatsAppJidFromPhone } from "./whatsappPhoneNumber";

const DEFAULT_OWNER_NOTIFICATION_EMAIL = "rodrigo4@gmail.com";
const DEFAULT_OWNER_NOTIFICATION_NUMBER = "5517991956944";

type OwnerNotificationResult = {
  success: boolean;
  error?: string;
  originalPhone: string;
  validatedPhone?: string | null;
  remoteJid?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
};

function firstNonEmptyString(...values: Array<unknown>): string {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

export async function resolveOwnerNotificationEmail(): Promise<string> {
  const config = await storage.getSystemConfig("owner_notification_email").catch(() => undefined);
  return firstNonEmptyString(
    config?.valor,
    process.env.AGENTEZAP_OWNER_NOTIFICATION_EMAIL,
    process.env.AGENTEZAP_POLICY_AUDIT_OWNER_EMAIL,
    process.env.OWNER_NOTIFICATION_EMAIL,
    DEFAULT_OWNER_NOTIFICATION_EMAIL,
  );
}

export async function resolveOwnerNotificationNumber(): Promise<string> {
  const config = await storage.getSystemConfig("owner_notification_number").catch(() => undefined);
  return firstNonEmptyString(
    config?.valor,
    process.env.AGENTEZAP_OWNER_NOTIFICATION_NUMBER,
    process.env.AGENTEZAP_POLICY_AUDIT_OWNER_PHONE,
    process.env.OWNER_NOTIFICATION_NUMBER,
    DEFAULT_OWNER_NOTIFICATION_NUMBER,
  );
}

async function resolveOwnerDeliveryContext(ownerEmail: string): Promise<{
  userId: string;
  connectionId: string;
} | null> {
  const ownerUser = await storage.getUserByEmail(ownerEmail);
  if (!ownerUser?.id) {
    return null;
  }

  const ownerConnection = await storage.getUserActiveConnection?.(ownerUser.id);
  if (!ownerConnection?.id) {
    return null;
  }

  return {
    userId: ownerUser.id,
    connectionId: ownerConnection.id,
  };
}

async function getOrCreateOwnerConversation(
  connectionId: string,
  phone: string,
  contactName?: string | null,
) {
  const phoneVariants = buildBrazilWhatsAppPhoneVariants(phone);
  const canonicalPhone =
    phoneVariants.find((candidate) => candidate.startsWith("55")) ||
    phoneVariants[0];

  if (!canonicalPhone) {
    throw new Error(`Numero invalido: ${phone}`);
  }

  for (const candidate of phoneVariants) {
    const existingConversation = await storage.getActiveConversationByContactNumber(
      connectionId,
      candidate,
    );
    if (existingConversation) {
      return existingConversation;
    }
  }

  return storage.createConversation({
    connectionId,
    contactNumber: canonicalPhone,
    remoteJid: buildWhatsAppJidFromPhone(canonicalPhone) || `${canonicalPhone}@s.whatsapp.net`,
    jidSuffix: "s.whatsapp.net",
    contactName: String(contactName || "").trim() || canonicalPhone,
    contactAvatar: null,
    lastMessageText: null,
    lastMessageTime: null,
    lastMessageFromMe: false,
    unreadCount: 0,
  });
}

export async function sendOwnerPrivateWhatsAppNotification(params: {
  ownerEmail?: string | null;
  phone?: string | null;
  message: string | string[];
  contactName?: string | null;
}): Promise<OwnerNotificationResult> {
  const ownerEmail = firstNonEmptyString(params.ownerEmail, await resolveOwnerNotificationEmail());
  const phone = firstNonEmptyString(params.phone, await resolveOwnerNotificationNumber());
  const outboundMessages = (Array.isArray(params.message) ? params.message : [params.message])
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (!phone) {
    return {
      success: false,
      error: "Owner notification number not configured",
      originalPhone: "",
    };
  }

  if (!ownerEmail) {
    return {
      success: false,
      error: "Owner notification email not configured",
      originalPhone: phone,
    };
  }

  if (outboundMessages.length === 0) {
    return {
      success: false,
      error: "Mensagem vazia",
      originalPhone: phone,
    };
  }

  const deliveryContext = await resolveOwnerDeliveryContext(ownerEmail);
  if (!deliveryContext) {
    return {
      success: false,
      error: "Owner WhatsApp not connected",
      originalPhone: phone,
    };
  }

  const conversation = await getOrCreateOwnerConversation(
    deliveryContext.connectionId,
    phone,
    params.contactName,
  );

  const { sendMessage } = await import("./whatsapp");
  const messageIds: string[] = [];

  for (const outboundMessage of outboundMessages) {
    const sendResult = await sendMessage(deliveryContext.userId, conversation.id, outboundMessage, {
      isFromAgent: true,
      source: "system",
      validateDestination: true,
    });

    if (!sendResult.success) {
      return {
        success: false,
        error: sendResult.reason || "Falha no envio pelo inbox do owner",
        originalPhone: phone,
        remoteJid: conversation.remoteJid || null,
        conversationId: conversation.id,
      };
    }

    if (sendResult.messageId) {
      messageIds.push(sendResult.messageId);
    }
  }

  const refreshedConversation = await storage.getConversation(conversation.id);
  return {
    success: true,
    originalPhone: phone,
    validatedPhone: refreshedConversation?.contactNumber || conversation.contactNumber || phone,
    messageId: messageIds.join(","),
    remoteJid: refreshedConversation?.remoteJid || conversation.remoteJid || null,
    conversationId: conversation.id,
  };
}
