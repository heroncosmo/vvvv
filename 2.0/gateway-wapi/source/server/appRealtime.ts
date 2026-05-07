import WebSocket from "ws";

import { buildAdminRealtimeTopic as buildSharedAdminRealtimeTopic, buildUserRealtimeTopic as buildSharedUserRealtimeTopic } from "@shared/realtimeTopics";
import { getSupabaseServiceKey, getSupabaseUrl } from "./supabaseService";
import { isWhatsAppGatewayRuntime } from "./whatsappGatewayOwnership";
import { enqueueGatewayMainAppEvent } from "./gatewayEventOutboxService";

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
    if (!userClients) return;
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
    if (!adminClients) return;
    adminClients.delete(ws);
    if (adminClients.size === 0) {
      adminRealtimeClients.delete(adminId);
    }
  });
}

export function hasUserRealtimeClient(userId: string): boolean {
  return Boolean(userRealtimeClients.get(userId)?.size);
}

export function hasAdminRealtimeClient(adminId: string): boolean {
  return Boolean(adminRealtimeClients.get(adminId)?.size);
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

export function broadcastToUser(userId: string, data: any) {
  if (isWhatsAppGatewayRuntime() && data && typeof data === "object" && !Array.isArray(data)) {
    enqueueGatewayMainAppEvent(userId, data);
  }

  broadcastToLocalClients(userRealtimeClients.get(userId), data, `user:${userId}`);
  void publishSupabaseRealtimeBroadcast(buildUserRealtimeTopic(userId), data);
}

export function broadcastToAdmin(adminId: string, data: any) {
  broadcastToLocalClients(adminRealtimeClients.get(adminId), data, `admin:${adminId}`);
  void publishSupabaseRealtimeBroadcast(buildAdminRealtimeTopic(adminId), data);
}

