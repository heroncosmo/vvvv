import crypto from "crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Conversation, WhatsappConnection } from "@shared/schema";
import { db } from "./db";
import { messages, whatsappConnections } from "@shared/schema";
import { canSendMessage, type MessageSource, type MessageType } from "./messageDeduplicationService";
import { buildOutgoingMessageFingerprint } from "./outgoingMessageSimilarity";
import {
  WHATSAPP_CONNECTION_PROVIDERS,
  WHATSAPP_PROVIDER_STATUS,
  isOfficialCoexistenceConnection,
} from "./whatsappCoexistence";
import { normalizeOutboundTextForCustomer } from "./outboundTextPolicy";

const GRAPH_VERSION = String(process.env.WHATSAPP_CLOUD_API_VERSION || "v23.0").trim();
const OFFICIAL_AUTOMATED_REPEAT_LOOKBACK_MS = 12 * 60 * 60 * 1000;

type MetaProviderConfig = {
  embeddedSignup?: {
    wabaId?: string;
    businessAccountId?: string;
    phoneNumberId?: string;
    displayPhoneNumber?: string;
    appId?: string;
    configId?: string;
    metadata?: Record<string, unknown>;
  };
  credentials?: {
    accessToken?: string;
    webhookVerifyToken?: string;
    accessTokenExpiresAt?: string;
    tokenType?: string;
  };
  webhook?: {
    url?: string;
    verifiedAt?: string;
    lastEventAt?: string;
    lastPayload?: Record<string, unknown>;
  };
};

export interface MetaCloudMediaPayload {
  type: "audio" | "image" | "video" | "document";
  data: string;
  mimetype?: string;
  filename?: string;
  caption?: string;
  ptt?: boolean;
  seconds?: number;
}

type MetaTextSendOptions = {
  dedupe?: {
    userId: string;
    contactNumber: string;
    content: string;
    conversationId?: string;
    messageType?: MessageType;
    source?: MessageSource;
  };
};

function cleanDigits(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

function getGraphBaseUrl() {
  return `https://graph.facebook.com/${GRAPH_VERSION}`;
}

function getMetaProviderConfig(connection: WhatsappConnection): MetaProviderConfig {
  return ((connection.providerConfig as MetaProviderConfig | null | undefined) || {}) as MetaProviderConfig;
}

function getMetaAccessToken(connection: WhatsappConnection): string {
  const token = getMetaProviderConfig(connection)?.credentials?.accessToken;
  if (!token) {
    throw new Error("Access token da Cloud API não configurado para esta conexão.");
  }
  return token;
}

function getMetaPhoneNumberId(connection: WhatsappConnection): string {
  const phoneNumberId = getMetaProviderConfig(connection)?.embeddedSignup?.phoneNumberId;
  if (!phoneNumberId) {
    throw new Error("phoneNumberId da Cloud API não configurado para esta conexão.");
  }
  return phoneNumberId;
}

function getRecipientPhone(conversation: Conversation): string {
  const digits = cleanDigits(conversation.contactNumber || conversation.remoteJid);
  if (!digits) {
    throw new Error("Número do contato inválido para envio via Cloud API.");
  }
  return digits;
}

async function parseGraphError(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.error?.message || payload?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function graphRequest<T = any>(
  connection: WhatsappConnection,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const accessToken = getMetaAccessToken(connection);
  const response = await fetch(`${getGraphBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseGraphError(response));
  }

  return response.json() as Promise<T>;
}

async function maybeCheckDeduplication(options?: MetaTextSendOptions["dedupe"]) {
  if (!options) return;
  const allowed = await canSendMessage(options);
  if (!allowed) {
    const error = new Error("Mensagem bloqueada por deduplicação");
    (error as Error & { blocked?: boolean }).blocked = true;
    throw error;
  }
}

async function maybeBlockRepeatedAutomatedOfficialText(
  connection: WhatsappConnection,
  conversation: Conversation,
  text: string,
  options?: MetaTextSendOptions,
) {
  if (options?.dedupe) return;
  if (!connection.userId || !conversation.id) return;

  const currentFingerprint = buildOutgoingMessageFingerprint(text);
  if (!currentFingerprint) return;

  const lookbackDate = new Date(Date.now() - OFFICIAL_AUTOMATED_REPEAT_LOOKBACK_MS);
  const recentMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.conversationId, conversation.id),
      gte(messages.timestamp, lookbackDate),
    ),
    orderBy: (message, { desc }) => [desc(message.timestamp)],
    columns: {
      text: true,
      fromMe: true,
      isFromAgent: true,
      timestamp: true,
    },
    limit: 40,
  });

  let customerRepliedAfterPreviousAutomation = false;

  for (const recentMessage of recentMessages) {
    if (!recentMessage.fromMe) {
      customerRepliedAfterPreviousAutomation = true;
      continue;
    }

    if (recentMessage.isFromAgent !== true) {
      continue;
    }

    if (buildOutgoingMessageFingerprint(recentMessage.text || "") !== currentFingerprint) {
      continue;
    }

    if (!customerRepliedAfterPreviousAutomation) {
      const error = new Error("Mensagem automática oficial repetida sem resposta do cliente");
      (error as Error & { blocked?: boolean }).blocked = true;
      throw error;
    }

    return;
  }
}

async function uploadMediaToMeta(connection: WhatsappConnection, media: MetaCloudMediaPayload): Promise<string> {
  const phoneNumberId = getMetaPhoneNumberId(connection);
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");

  let buffer: Buffer;
  if (media.data.startsWith("data:")) {
    const [, base64Part = ""] = media.data.split(",", 2);
    buffer = Buffer.from(base64Part, "base64");
  } else if (media.data.startsWith("http://") || media.data.startsWith("https://")) {
    const mediaResponse = await fetch(media.data);
    if (!mediaResponse.ok) {
      throw new Error(`Falha ao baixar mídia remota: ${mediaResponse.status}`);
    }
    buffer = Buffer.from(await mediaResponse.arrayBuffer());
  } else {
    buffer = Buffer.from(media.data, "base64");
  }

  const blob = new Blob([buffer], {
    type: media.mimetype || "application/octet-stream",
  });

  formData.append("file", blob, media.filename || `upload-${Date.now()}`);
  formData.append("type", media.mimetype || "application/octet-stream");

  const uploadResponse = await fetch(`${getGraphBaseUrl()}/${phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getMetaAccessToken(connection)}`,
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error(await parseGraphError(uploadResponse));
  }

  const uploadPayload = await uploadResponse.json();
  if (!uploadPayload?.id) {
    throw new Error("Meta não retornou media id para o upload.");
  }

  return uploadPayload.id;
}

export async function sendMetaCloudTextMessage(
  connection: WhatsappConnection,
  conversation: Conversation,
  text: string,
  options?: MetaTextSendOptions,
): Promise<{ messageId?: string }> {
  if (!isOfficialCoexistenceConnection(connection)) {
    throw new Error("Conexão não usa provider oficial Meta Cloud API.");
  }

  await maybeCheckDeduplication(options?.dedupe);
  const normalizedText = normalizeOutboundTextForCustomer(text);
  await maybeBlockRepeatedAutomatedOfficialText(connection, conversation, normalizedText, options);

  const payload = await graphRequest<any>(connection, `/${getMetaPhoneNumberId(connection)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: getRecipientPhone(conversation),
      type: "text",
      text: { body: normalizedText, preview_url: false },
    }),
  });

  return { messageId: payload?.messages?.[0]?.id };
}

export async function sendMetaCloudButtonsMessage(
  connection: WhatsappConnection,
  conversation: Conversation,
  payload: {
    body: string;
    buttons: Array<{ type: "reply"; reply: { id: string; title: string } }>;
    header?: { type: "text"; text: string };
    footer?: { text: string };
  },
  options?: MetaTextSendOptions,
): Promise<{ messageId?: string }> {
  await maybeCheckDeduplication(options?.dedupe);
  await maybeBlockRepeatedAutomatedOfficialText(connection, conversation, payload.body, options);
  const response = await graphRequest<any>(connection, `/${getMetaPhoneNumberId(connection)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: getRecipientPhone(conversation),
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: payload.body },
        ...(payload.header?.text ? { header: { type: "text", text: payload.header.text } } : {}),
        ...(payload.footer?.text ? { footer: { text: payload.footer.text } } : {}),
        action: {
          buttons: payload.buttons.slice(0, 3).map((button) => ({
            type: "reply",
            reply: button.reply,
          })),
        },
      },
    }),
  });
  return { messageId: response?.messages?.[0]?.id };
}

export async function sendMetaCloudListMessage(
  connection: WhatsappConnection,
  conversation: Conversation,
  payload: {
    body: string;
    buttonText: string;
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
  },
  options?: MetaTextSendOptions,
): Promise<{ messageId?: string }> {
  await maybeCheckDeduplication(options?.dedupe);
  await maybeBlockRepeatedAutomatedOfficialText(connection, conversation, payload.body, options);
  const response = await graphRequest<any>(connection, `/${getMetaPhoneNumberId(connection)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: getRecipientPhone(conversation),
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: payload.body },
        action: {
          button: payload.buttonText,
          sections: payload.sections,
        },
      },
    }),
  });
  return { messageId: response?.messages?.[0]?.id };
}

export async function sendMetaCloudMediaMessage(
  connection: WhatsappConnection,
  conversation: Conversation,
  media: MetaCloudMediaPayload,
): Promise<{ messageId?: string; uploadedMediaId?: string }> {
  const mediaId = await uploadMediaToMeta(connection, media);
  const recipient = getRecipientPhone(conversation);

  let body: Record<string, unknown>;
  if (media.type === "audio") {
    body = { messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "audio", audio: { id: mediaId } };
  } else if (media.type === "image") {
    body = { messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "image", image: { id: mediaId, ...(media.caption ? { caption: media.caption } : {}) } };
  } else if (media.type === "video") {
    body = { messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "video", video: { id: mediaId, ...(media.caption ? { caption: media.caption } : {}) } };
  } else {
    body = { messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "document", document: { id: mediaId, filename: media.filename || "documento", ...(media.caption ? { caption: media.caption } : {}) } };
  }

  const response = await graphRequest<any>(connection, `/${getMetaPhoneNumberId(connection)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return { messageId: response?.messages?.[0]?.id, uploadedMediaId: mediaId };
}

export async function exchangeMetaEmbeddedSignupCode(params: {
  code: string;
  redirectUri?: string | null;
}): Promise<{ accessToken: string; expiresIn?: number; tokenType?: string }> {
  const appId = String(process.env.WHATSAPP_COEXISTENCE_APP_ID || "").trim();
  const appSecret = String(process.env.WHATSAPP_COEXISTENCE_APP_SECRET || "").trim();
  if (!appId || !appSecret) {
    throw new Error("WHATSAPP_COEXISTENCE_APP_ID e WHATSAPP_COEXISTENCE_APP_SECRET são obrigatórios para trocar o code por token.");
  }

  const url = new URL(`${getGraphBaseUrl()}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", params.code);
  if (params.redirectUri) {
    url.searchParams.set("redirect_uri", params.redirectUri);
  }

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(await parseGraphError(response));
  }

  const payload = await response.json();
  if (!payload?.access_token) {
    throw new Error("Meta não retornou access_token na troca do code.");
  }

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    tokenType: payload.token_type,
  };
}

export function buildOfficialWebhookUrl(): string {
  const baseUrl = String(process.env.BASE_URL || "").trim();
  if (!baseUrl) {
    return "/api/webhooks/whatsapp/cloud-api";
  }
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/whatsapp/cloud-api`;
}

export function createWebhookVerifyToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export async function findOfficialConnectionByPhoneNumberId(phoneNumberId: string): Promise<WhatsappConnection | undefined> {
  if (!phoneNumberId) return undefined;
  const [connection] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.provider, WHATSAPP_CONNECTION_PROVIDERS.META_CLOUD_API),
        sql`${whatsappConnections.providerConfig} -> 'embeddedSignup' ->> 'phoneNumberId' = ${phoneNumberId}`,
      ),
    )
    .limit(1);
  return connection;
}

export async function findOfficialConnectionByVerifyToken(verifyToken: string): Promise<WhatsappConnection | undefined> {
  if (!verifyToken) return undefined;
  const [connection] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.provider, WHATSAPP_CONNECTION_PROVIDERS.META_CLOUD_API),
        sql`${whatsappConnections.providerConfig} -> 'credentials' ->> 'webhookVerifyToken' = ${verifyToken}`,
      ),
    )
    .limit(1);
  return connection;
}

export async function markOfficialConnectionWebhookVerified(
  connection: WhatsappConnection,
  extras?: Record<string, unknown>,
): Promise<WhatsappConnection> {
  const providerConfig = getMetaProviderConfig(connection);
  const updatedProviderConfig: MetaProviderConfig = {
    ...providerConfig,
    webhook: {
      ...(providerConfig.webhook || {}),
      url: buildOfficialWebhookUrl(),
      verifiedAt: new Date().toISOString(),
      ...(extras || {}),
    },
  };

  const [updated] = await db
    .update(whatsappConnections)
    .set({
      providerStatus: WHATSAPP_PROVIDER_STATUS.CONNECTED,
      isConnected: true,
      providerConfig: updatedProviderConfig as any,
    })
    .where(eq(whatsappConnections.id, connection.id))
    .returning();

  return updated;
}

export async function updateOfficialMessageStatus(messageId: string, status: string) {
  const [message] = await db.select().from(messages).where(eq(messages.messageId, messageId)).limit(1);
  if (!message) return;
  await db.update(messages).set({ status }).where(eq(messages.id, message.id));
}
