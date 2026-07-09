import { memoryCache, storage } from "./storage";
import { broadcastToUser, triggerAgentResponseForConversation } from "./whatsapp";
import { isIncomingMessageProcessed, markIncomingMessageProcessed } from "./messageDeduplicationService";
import { sendWebPushToUser } from "./webPushService";
import { ensureManagedPhoneConnectionContinuity } from "./whatsappConnectionContinuity";
import {
  findOfficialConnectionByPhoneNumberId,
  markOfficialConnectionWebhookVerified,
  updateOfficialMessageStatus,
} from "./metaCloudApi";

type MetaWebhookChangeValue = {
  metadata?: {
    phone_number_id?: string;
    display_phone_number?: string;
  };
  contacts?: Array<{
    wa_id?: string;
    profile?: { name?: string };
  }>;
  messages?: Array<Record<string, any>>;
  statuses?: Array<Record<string, any>>;
};

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: MetaWebhookChangeValue;
    }>;
  }>;
};

function cleanDigits(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

function extractInboundText(message: Record<string, any>) {
  if (typeof message?.text?.body === "string" && message.text.body.trim()) {
    return { text: message.text.body.trim(), mediaType: null as string | null };
  }
  if (typeof message?.button?.text === "string" && message.button.text.trim()) {
    return { text: message.button.text.trim(), mediaType: null as string | null };
  }
  if (typeof message?.interactive?.button_reply?.title === "string") {
    return { text: message.interactive.button_reply.title, mediaType: null as string | null };
  }
  if (typeof message?.interactive?.list_reply?.title === "string") {
    return { text: message.interactive.list_reply.title, mediaType: null as string | null };
  }
  if (message?.audio) return { text: "[Áudio recebido]", mediaType: "audio" };
  if (message?.image) return { text: message?.image?.caption || "[Imagem recebida]", mediaType: "image" };
  if (message?.video) return { text: message?.video?.caption || "[Vídeo recebido]", mediaType: "video" };
  if (message?.document) return { text: message?.document?.caption || "[Documento recebido]", mediaType: "document" };
  return { text: "[Mensagem recebida via Cloud API]", mediaType: null as string | null };
}

function toMessageStatus(status: string) {
  switch (String(status || "").toLowerCase()) {
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "failed":
      return "failed";
    default:
      return "sent";
  }
}

function buildPushPreview(text: string | null | undefined, fallback: string) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return fallback;
  }
  if (normalized.length <= 160) {
    return normalized;
  }
  return `${normalized.slice(0, 157)}...`;
}

async function processMetaStatusChange(changeValue: MetaWebhookChangeValue | undefined) {
  for (const status of changeValue?.statuses || []) {
    if (status?.id && status?.status) {
      await updateOfficialMessageStatus(String(status.id), toMessageStatus(status.status));
    }
  }
}

async function processMetaInboundMessage(changeValue: MetaWebhookChangeValue | undefined) {
  const phoneNumberId = String(changeValue?.metadata?.phone_number_id || "").trim();
  if (!phoneNumberId) return;

  const connection = await findOfficialConnectionByPhoneNumberId(phoneNumberId);
  if (!connection) return;

  await markOfficialConnectionWebhookVerified(connection, {
    lastEventAt: new Date().toISOString(),
    lastPayload: {
      phoneNumberId,
      displayPhoneNumber: changeValue?.metadata?.display_phone_number || null,
    },
  });
  memoryCache.invalidate(`api:wa-conn:${connection.userId}`);
  memoryCache.invalidate(`api:wa-conn:${connection.userId}:default`);
  const continuityConnection =
    await ensureManagedPhoneConnectionContinuity({
      userId: connection.userId,
      connectionId: connection.id,
      runtimePhoneNumber: changeValue?.metadata?.display_phone_number || connection.phoneNumber,
      runtimeIsConnected: true,
    }) || connection;

  for (const inbound of changeValue?.messages || []) {
    const inboundMessageId = String(inbound?.id || "").trim();
    const contactNumber = cleanDigits(inbound?.from);
    if (!inboundMessageId || !contactNumber) continue;

    const alreadyProcessed = await isIncomingMessageProcessed({
      whatsappMessageId: inboundMessageId,
      userId: connection.userId,
      contactNumber,
    });
    if (alreadyProcessed) continue;

    const contactProfile = (changeValue?.contacts || []).find((contact: { wa_id?: string; profile?: { name?: string } }) => cleanDigits(contact?.wa_id) === contactNumber);
    const extracted = extractInboundText(inbound);
    const eventTimestamp = inbound?.timestamp ? new Date(Number(inbound.timestamp) * 1000) : new Date();

    let conversation =
      await storage.getActiveConversationByContactNumber(continuityConnection.id, contactNumber) ||
      await storage.getConversationByContactNumber(continuityConnection.id, contactNumber);

    if (!conversation) {
      conversation = await storage.createConversation({
        connectionId: continuityConnection.id,
        contactNumber,
        remoteJid: `${contactNumber}@s.whatsapp.net`,
        contactName: contactProfile?.profile?.name || contactNumber,
        lastMessageText: extracted.text,
        lastMessageTime: eventTimestamp,
        lastMessageFromMe: false,
        unreadCount: 1,
      });
    } else {
      conversation = await storage.updateConversation(conversation.id, {
        contactName: contactProfile?.profile?.name || conversation.contactName,
        lastMessageText: extracted.text,
        lastMessageTime: eventTimestamp,
        lastMessageFromMe: false,
        unreadCount: (conversation.unreadCount || 0) + 1,
      });
    }

    const savedMessage = await storage.createMessage({
      conversationId: conversation.id,
      messageId: inboundMessageId,
      fromMe: false,
      text: extracted.text,
      timestamp: eventTimestamp,
      status: "received",
      isFromAgent: false,
      mediaType: extracted.mediaType,
      mediaUrl: null,
      mediaMimeType: null,
      mediaCaption: extracted.mediaType ? extracted.text : null,
    });

    await markIncomingMessageProcessed({
      whatsappMessageId: inboundMessageId,
      userId: connection.userId,
      contactNumber,
      conversationId: conversation.id,
    });

    broadcastToUser(connection.userId, {
      type: "new_message",
      conversationId: conversation.id,
      message: savedMessage.text || extracted.text,
      messageData: {
        id: savedMessage.id,
        conversationId: conversation.id,
        messageId: savedMessage.messageId,
        fromMe: false,
        text: savedMessage.text || extracted.text,
        timestamp: eventTimestamp.toISOString(),
        isFromAgent: false,
        mediaType: savedMessage.mediaType || null,
        mediaUrl: savedMessage.mediaUrl || null,
        mediaMimeType: savedMessage.mediaMimeType || null,
        mediaDuration: savedMessage.mediaDuration || null,
        mediaCaption: savedMessage.mediaCaption || null,
      },
      conversationUpdate: {
        id: conversation.id,
        connectionId: continuityConnection.id,
        contactNumber: conversation.contactNumber,
        contactName: conversation.contactName,
        contactAvatar: conversation.contactAvatar,
        lastMessageText: extracted.text,
        lastMessageTime: eventTimestamp.toISOString(),
        lastMessageFromMe: false,
        unreadCount: conversation.unreadCount || 1,
      },
    });

    void sendWebPushToUser(connection.userId, {
      title: conversation.contactName || conversation.contactNumber || "Nova mensagem",
      body: buildPushPreview(savedMessage.text || extracted.text, "Voce recebeu uma nova mensagem."),
      url: `/conversas/${conversation.id}`,
      tag: `conversation-${conversation.id}`,
      topic: `conv-${conversation.id}`,
      urgency: "high",
      ttlSeconds: 6 * 60 * 60,
      renotify: true,
      vibrate: [180, 80, 180],
      timestamp: Date.now(),
      data: {
        conversationId: conversation.id,
        kind: "incoming_message",
      },
    }).catch((error) => {
      console.error("[META CLOUD] Erro ao enviar web push:", error);
    });

    try {
      await triggerAgentResponseForConversation(connection.userId, conversation.id);
    } catch (error) {
      console.error("[META CLOUD] Erro ao disparar IA para conversa oficial:", error);
    }
  }
}

export async function processMetaCloudWebhookPayload(payload: MetaWebhookPayload) {
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages" || !change.value) continue;
      await processMetaStatusChange(change.value);
      await processMetaInboundMessage(change.value);
    }
  }
}
