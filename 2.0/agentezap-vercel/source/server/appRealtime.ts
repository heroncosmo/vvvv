import WebSocket from "ws";

import { buildAdminRealtimeTopic as buildSharedAdminRealtimeTopic, buildUserRealtimeTopic as buildSharedUserRealtimeTopic } from "@shared/realtimeTopics";
import { getSupabaseServiceKey, getSupabaseUrl } from "./supabaseService";
import { isWhatsAppGatewayRuntime } from "./whatsappGatewayOwnership";
import { dispatchGatewayWebhooksForUserEvent } from "./gatewayWebhookService";

const DEFAULT_GATEWAY_EVENT_URL =
  process.env.NODE_ENV === "production"
    ? "https://agentezap.online/api/internal/wa-gateway/events"
    : "http://127.0.0.1:5000/api/internal/wa-gateway/events";
const DEFAULT_GATEWAY_INTERNAL_TOKEN = "agentezap-internal-wa-gateway";

export interface AuthenticatedRealtimeSocket extends WebSocket {
  userId?: string;
  adminId?: string;
}

const userRealtimeClients = new Map<string, Set<AuthenticatedRealtimeSocket>>();
const adminRealtimeClients = new Map<string, Set<AuthenticatedRealtimeSocket>>();

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isSupabaseRealtimeBroadcastEnabled(): boolean {
  return isTruthyFlag(process.env.ENABLE_SUPABASE_REALTIME_BROADCAST);
}

export function buildUserRealtimeTopic(userId: string): string {
  return buildSharedUserRealtimeTopic(userId, process.env.APP_REALTIME_USER_TOPIC_PREFIX);
}

export function buildAdminRealtimeTopic(adminId: string): string {
  return buildSharedAdminRealtimeTopic(adminId, process.env.APP_REALTIME_ADMIN_TOPIC_PREFIX);
}

export function addWebSocketClient(ws: AuthenticatedRealtimeSocket, userId: string) {
  if (!userRealtimeClients.has(userId)) {
    userRealtimeClients.set(userId, new Set());
  }
  userRealtimeClients.get(userId)!.add(ws);

  ws.on("close", () => {
    const userClients = userRealtimeClients.get(userId);
    if (!userClients) {
      return;
    }

    userClients.delete(ws);
    if (userClients.size === 0) {
      userRealtimeClients.delete(userId);
    }
  });
}

export function addAdminWebSocketClient(ws: AuthenticatedRealtimeSocket, adminId: string) {
  if (!adminRealtimeClients.has(adminId)) {
    adminRealtimeClients.set(adminId, new Set());
  }
  adminRealtimeClients.get(adminId)!.add(ws);

  ws.on("close", () => {
    const adminClients = adminRealtimeClients.get(adminId);
    if (!adminClients) {
      return;
    }

    adminClients.delete(ws);
    if (adminClients.size === 0) {
      adminRealtimeClients.delete(adminId);
    }
  });
}

function broadcastToLocalClients(
  clients: Set<AuthenticatedRealtimeSocket> | undefined,
  payload: unknown,
  label: string,
): number {
  if (!clients || clients.size === 0) {
    return 0;
  }

  let sentCount = 0;
  const serializedPayload = JSON.stringify(payload);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serializedPayload);
      sentCount += 1;
    }
  });

  console.log(`[REALTIME] Sent local event to ${sentCount}/${clients.size} ${label} clients`);
  return sentCount;
}

function resolveRealtimeEventName(data: any): string {
  const eventName = String(data?.type || "").trim();
  return eventName || "app-event";
}

async function publishSupabaseRealtimeBroadcast(topic: string, data: unknown): Promise<void> {
  if (!isSupabaseRealtimeBroadcastEnabled()) {
    return;
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseServiceKey = getSupabaseServiceKey();
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[REALTIME] Supabase broadcast skipped: missing SUPABASE_URL or service key");
    return;
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseServiceKey,
      authorization: `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({
      messages: [
        {
          topic,
          event: resolveRealtimeEventName(data),
          payload: data,
          private: false,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.warn(`[REALTIME] Supabase broadcast failed for topic ${topic}: ${response.status}`);
  }
}

async function relayGatewayEventToMainApp(userId: string, data: unknown): Promise<void> {
  try {
    const response = await fetch(process.env.WA_GATEWAY_EVENT_URL || DEFAULT_GATEWAY_EVENT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wa-gateway-token":
          process.env.WA_GATEWAY_INTERNAL_TOKEN || DEFAULT_GATEWAY_INTERNAL_TOKEN,
      },
      body: JSON.stringify({ userId, data }),
    });

    if (!response.ok) {
      console.warn(
        `[REALTIME] Failed to relay gateway event ${resolveRealtimeEventName(data)} for user ${userId}: ${response.status}`,
      );
    }
  } catch (error) {
    console.warn(
      `[REALTIME] Error relaying gateway event ${resolveRealtimeEventName(data)} for user ${userId}:`,
      error,
    );
  }
}

export function broadcastToUser(userId: string, data: any) {
  if (isWhatsAppGatewayRuntime()) {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      void dispatchGatewayWebhooksForUserEvent({
        userId,
        data: data as Record<string, unknown>,
      });
    }
    void relayGatewayEventToMainApp(userId, data);
  }

  broadcastToLocalClients(userRealtimeClients.get(userId), data, `user:${userId}`);
  void publishSupabaseRealtimeBroadcast(buildUserRealtimeTopic(userId), data);
}

export function broadcastToAdmin(adminId: string, data: any) {
  broadcastToLocalClients(adminRealtimeClients.get(adminId), data, `admin:${adminId}`);
  void publishSupabaseRealtimeBroadcast(buildAdminRealtimeTopic(adminId), data);
}
