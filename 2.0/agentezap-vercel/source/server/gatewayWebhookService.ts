import crypto from "crypto";

import type { WhatsappConnection } from "@shared/schema";

import { storage } from "./storage";

export interface GatewayWebhookRecord {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  description: string | null;
  secret: string | null;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
}

interface UpsertGatewayWebhookInput {
  url?: unknown;
  events?: unknown;
  enabled?: unknown;
  description?: unknown;
  secret?: unknown;
}

const GATEWAY_WEBHOOK_NAMESPACE = "gatewayPublicApi";
const MESSAGE_REVOKED_TEXT = "[Mensagem apagada]";

function getProviderConfig(connection: { providerConfig?: unknown } | null | undefined): Record<string, unknown> {
  if (!connection?.providerConfig || typeof connection.providerConfig !== "object" || Array.isArray(connection.providerConfig)) {
    return {};
  }

  return { ...(connection.providerConfig as Record<string, unknown>) };
}

function asWebhookRecordArray(value: unknown): GatewayWebhookRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeWebhookRecord(item))
    .filter((item): item is GatewayWebhookRecord => !!item);
}

function sanitizeWebhookRecord(value: unknown): GatewayWebhookRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const item = value as Record<string, unknown>;
  const id = String(item.id || "").trim();
  const url = String(item.url || "").trim();
  if (!id || !url) {
    return null;
  }

  const events = Array.from(
    new Set(
      (Array.isArray(item.events) ? item.events : [])
        .map((event) => String(event || "").trim())
        .filter(Boolean),
    ),
  );

  return {
    id,
    url,
    events: events.length > 0 ? events : ["*"],
    enabled: item.enabled !== false,
    description: String(item.description || "").trim() || null,
    secret: String(item.secret || "").trim() || null,
    createdAt: String(item.createdAt || new Date().toISOString()),
    updatedAt: String(item.updatedAt || new Date().toISOString()),
    lastTriggeredAt: String(item.lastTriggeredAt || "").trim() || null,
    lastStatusCode:
      typeof item.lastStatusCode === "number" && Number.isFinite(item.lastStatusCode)
        ? item.lastStatusCode
        : null,
    lastError: String(item.lastError || "").trim() || null,
  };
}

function buildProviderConfigWithWebhooks(
  connection: WhatsappConnection,
  webhooks: GatewayWebhookRecord[],
): Record<string, unknown> {
  const providerConfig = getProviderConfig(connection);
  const gatewayNamespace =
    providerConfig[GATEWAY_WEBHOOK_NAMESPACE] &&
    typeof providerConfig[GATEWAY_WEBHOOK_NAMESPACE] === "object" &&
    !Array.isArray(providerConfig[GATEWAY_WEBHOOK_NAMESPACE])
      ? { ...(providerConfig[GATEWAY_WEBHOOK_NAMESPACE] as Record<string, unknown>) }
      : {};

  gatewayNamespace.webhooks = webhooks;
  providerConfig[GATEWAY_WEBHOOK_NAMESPACE] = gatewayNamespace;

  return providerConfig;
}

function generateWebhookId() {
  return `gwh_${crypto.randomBytes(6).toString("hex")}`;
}

function normalizeWebhookUrl(value: unknown): string {
  const url = String(value || "").trim();
  if (!url) {
    const error = new Error("url e obrigatoria");
    (error as any).status = 400;
    throw error;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    const error = new Error("url invalida");
    (error as any).status = 400;
    throw error;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    const error = new Error("url deve usar http ou https");
    (error as any).status = 400;
    throw error;
  }

  return parsed.toString();
}

function normalizeWebhookEvents(value: unknown): string[] {
  const events = Array.from(
    new Set(
      (Array.isArray(value) ? value : [value])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );

  return events.length > 0 ? events : ["*"];
}

export function listConnectionGatewayWebhooks(connection: WhatsappConnection): GatewayWebhookRecord[] {
  const providerConfig = getProviderConfig(connection);
  const namespace =
    providerConfig[GATEWAY_WEBHOOK_NAMESPACE] &&
    typeof providerConfig[GATEWAY_WEBHOOK_NAMESPACE] === "object" &&
    !Array.isArray(providerConfig[GATEWAY_WEBHOOK_NAMESPACE])
      ? (providerConfig[GATEWAY_WEBHOOK_NAMESPACE] as Record<string, unknown>)
      : {};

  return asWebhookRecordArray(namespace.webhooks);
}

export async function createConnectionGatewayWebhook(
  connection: WhatsappConnection,
  input: UpsertGatewayWebhookInput,
): Promise<GatewayWebhookRecord> {
  const webhooks = listConnectionGatewayWebhooks(connection);
  const now = new Date().toISOString();

  const record: GatewayWebhookRecord = {
    id: generateWebhookId(),
    url: normalizeWebhookUrl(input.url),
    events: normalizeWebhookEvents(input.events),
    enabled: input.enabled !== false,
    description: String(input.description || "").trim() || null,
    secret: String(input.secret || "").trim() || null,
    createdAt: now,
    updatedAt: now,
    lastTriggeredAt: null,
    lastStatusCode: null,
    lastError: null,
  };

  await storage.updateConnection(connection.id, {
    providerConfig: buildProviderConfigWithWebhooks(connection, [...webhooks, record]) as any,
  });

  return record;
}

export async function updateConnectionGatewayWebhook(
  connection: WhatsappConnection,
  webhookId: string,
  input: UpsertGatewayWebhookInput,
): Promise<GatewayWebhookRecord> {
  const webhooks = listConnectionGatewayWebhooks(connection);
  const current = webhooks.find((item) => item.id === webhookId);
  if (!current) {
    const error = new Error("Webhook nao encontrado");
    (error as any).status = 404;
    throw error;
  }

  const updated: GatewayWebhookRecord = {
    ...current,
    url: input.url === undefined ? current.url : normalizeWebhookUrl(input.url),
    events: input.events === undefined ? current.events : normalizeWebhookEvents(input.events),
    enabled: input.enabled === undefined ? current.enabled : input.enabled !== false,
    description: input.description === undefined ? current.description : String(input.description || "").trim() || null,
    secret: input.secret === undefined ? current.secret : String(input.secret || "").trim() || null,
    updatedAt: new Date().toISOString(),
  };

  await storage.updateConnection(connection.id, {
    providerConfig: buildProviderConfigWithWebhooks(
      connection,
      webhooks.map((item) => (item.id === webhookId ? updated : item)),
    ) as any,
  });

  return updated;
}

export async function deleteConnectionGatewayWebhook(
  connection: WhatsappConnection,
  webhookId: string,
): Promise<boolean> {
  const webhooks = listConnectionGatewayWebhooks(connection);
  const nextWebhooks = webhooks.filter((item) => item.id !== webhookId);
  if (nextWebhooks.length === webhooks.length) {
    return false;
  }

  await storage.updateConnection(connection.id, {
    providerConfig: buildProviderConfigWithWebhooks(connection, nextWebhooks) as any,
  });

  return true;
}

function isWebhookSubscribed(webhook: GatewayWebhookRecord, eventTypes: string[]): boolean {
  return webhook.events.includes("*") || eventTypes.some((eventType) => webhook.events.includes(eventType));
}

function normalizeGatewayWebhookDispatch(params: {
  connection: WhatsappConnection;
  data: Record<string, unknown>;
}) {
  const rawEventType = String(params.data.type || "").trim();
  const baseData: Record<string, unknown> = {
    ...params.data,
    instanceId:
      String(params.data.instanceId || params.data.connectionId || params.connection.id).trim() || params.connection.id,
  };

  let eventType = rawEventType;

  if (rawEventType === "connected") {
    eventType = "connection.connected";
  } else if (rawEventType === "connecting") {
    eventType = "connection.connecting";
  } else if (rawEventType === "disconnected") {
    eventType = "connection.disconnected";
  } else if (rawEventType === "qr") {
    eventType = "connection.qr";
  } else if (rawEventType === "pairing_restarting") {
    eventType = "connection.pairing_restarting";
  } else if (rawEventType === "new_message") {
    const messageData =
      baseData.messageData && typeof baseData.messageData === "object" && !Array.isArray(baseData.messageData)
        ? (baseData.messageData as Record<string, unknown>)
        : null;
    const isFromMe = messageData?.fromMe === true;
    eventType = isFromMe ? "message.sent" : "message.received";
  } else if (rawEventType === "message_sent") {
    eventType = "message.sent";
  } else if (rawEventType === "message_updated") {
    eventType = String(baseData.text || "").trim() === MESSAGE_REVOKED_TEXT ? "message.revoked" : "message.updated";
  } else if (rawEventType === "message_status_updated" || rawEventType === "message_receipt_updated") {
    const statusCanonical = String(baseData.statusCanonical || "").trim().toLowerCase();
    const fallbackStatus = String(baseData.status || "").trim().toLowerCase();
    const effectiveStatus =
      statusCanonical ||
      (fallbackStatus === "played"
        ? "played"
        : fallbackStatus === "read"
          ? "read"
          : fallbackStatus === "delivered"
            ? "delivered"
            : fallbackStatus === "failed"
              ? "failed"
              : fallbackStatus === "sent"
                ? "server_ack"
                : "");

    if (effectiveStatus === "failed") {
      eventType = "message.failed";
    } else if (effectiveStatus === "played") {
      eventType = "message.played";
    } else if (effectiveStatus === "read") {
      eventType = "message.read";
    } else if (effectiveStatus === "delivered") {
      eventType = "message.delivered";
    } else if (effectiveStatus === "server_ack") {
      eventType = "message.server_ack";
    }
  } else if (rawEventType === "presence") {
    eventType = "presence.updated";
  } else if (rawEventType === "conversation_updated") {
    eventType = "conversation.updated";
  } else if (rawEventType === "conversation_attention_updated") {
    eventType = "conversation.attention_updated";
  }

  const aliases = Array.from(
    new Set(
      [eventType, rawEventType].map((value) => String(value || "").trim()).filter(Boolean),
    ),
  );

  return {
    eventType,
    rawEventType,
    aliases,
    data: {
      ...baseData,
      webhookEvent: eventType,
      rawEventType,
    },
  };
}

async function persistWebhookDeliveryResult(
  connection: WhatsappConnection,
  webhookId: string,
  result: {
    lastTriggeredAt: string;
    lastStatusCode: number | null;
    lastError: string | null;
  },
) {
  const webhooks = listConnectionGatewayWebhooks(connection);
  const updatedWebhooks = webhooks.map((item) =>
    item.id === webhookId
      ? {
          ...item,
          lastTriggeredAt: result.lastTriggeredAt,
          lastStatusCode: result.lastStatusCode,
          lastError: result.lastError,
          updatedAt: new Date().toISOString(),
        }
      : item,
  );

  await storage.updateConnection(connection.id, {
    providerConfig: buildProviderConfigWithWebhooks(connection, updatedWebhooks) as any,
  });
}

function buildWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function dispatchConnectionGatewayWebhooks(params: {
  connection: WhatsappConnection;
  userId: string;
  eventType: string;
  rawEventType?: string | null;
  eventAliases?: string[];
  data: Record<string, unknown>;
}) {
  const webhooks = listConnectionGatewayWebhooks(params.connection).filter(
    (item) =>
      item.enabled &&
      isWebhookSubscribed(
        item,
        Array.from(
          new Set(
            [params.eventType, params.rawEventType, ...(params.eventAliases || [])]
              .map((value) => String(value || "").trim())
              .filter(Boolean),
          ),
        ),
      ),
  );

  if (webhooks.length === 0) {
    return;
  }

  const eventPayload = {
    event: params.eventType,
    rawEvent: String(params.rawEventType || "").trim() || params.eventType,
    aliases: Array.from(
      new Set(
        [params.eventType, params.rawEventType, ...(params.eventAliases || [])]
          .map((value) => String(value || "").trim())
          .filter(Boolean),
      ),
    ),
    instanceId: params.connection.id,
    userId: params.userId,
    timestamp: new Date().toISOString(),
    data: params.data,
  };

  const serializedPayload = JSON.stringify(eventPayload);

  await Promise.allSettled(
    webhooks.map(async (webhook) => {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-agentezap-event": params.eventType,
        "x-agentezap-raw-event": String(params.rawEventType || "").trim() || params.eventType,
        "x-agentezap-instance-id": params.connection.id,
        "x-agentezap-webhook-id": webhook.id,
      };

      if (webhook.secret) {
        headers["x-agentezap-signature"] = buildWebhookSignature(serializedPayload, webhook.secret);
      }

      const triggeredAt = new Date().toISOString();

      try {
        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body: serializedPayload,
        });

        const responsePreview = await response.text().catch(() => "");

        await persistWebhookDeliveryResult(params.connection, webhook.id, {
          lastTriggeredAt: triggeredAt,
          lastStatusCode: response.status,
          lastError:
            response.ok
              ? null
              : `HTTP ${response.status}${responsePreview ? `: ${responsePreview.slice(0, 180)}` : ""}`,
        });
      } catch (error) {
        await persistWebhookDeliveryResult(params.connection, webhook.id, {
          lastTriggeredAt: triggeredAt,
          lastStatusCode: null,
          lastError: error instanceof Error ? error.message : "Erro desconhecido ao enviar webhook",
        });
      }
    }),
  );
}

export async function dispatchGatewayWebhooksForUserEvent(params: {
  userId: string;
  data: Record<string, unknown>;
}) {
  const normalized = normalizeGatewayWebhookDispatch({
    connection: { id: String(params.data.connectionId || params.data.instanceId || "").trim() || "" } as WhatsappConnection,
    data: params.data,
  });
  const eventType = normalized.eventType;
  const instanceId = String(normalized.data.instanceId || "").trim() || null;

  if (!eventType || !instanceId) {
    return;
  }

  const connection = await storage.getConnectionById(instanceId);
  if (!connection || connection.userId !== params.userId) {
    return;
  }

  await dispatchConnectionGatewayWebhooks({
    connection,
    userId: params.userId,
    eventType,
    rawEventType: normalized.rawEventType,
    eventAliases: normalized.aliases,
    data: normalized.data,
  });
}
