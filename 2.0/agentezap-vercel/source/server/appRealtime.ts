import WebSocket from "ws";

import { buildAdminRealtimeTopic as buildSharedAdminRealtimeTopic, buildUserRealtimeTopic as buildSharedUserRealtimeTopic } from "@shared/realtimeTopics";
import { getSupabaseServiceKey, getSupabaseUrl } from "./supabaseService";
import { isWhatsAppGatewayRuntime } from "./whatsappGatewayOwnership";
import { dispatchGatewayWebhooksForUserEvent } from "./gatewayWebhookService";
import { pool } from "./db";

const DEFAULT_GATEWAY_EVENT_URL =
  process.env.NODE_ENV === "production"
    ? "https://agentezap.online/api/internal/wa-gateway/events"
    : "http://127.0.0.1:5000/api/internal/wa-gateway/events";
const DEFAULT_GATEWAY_INTERNAL_TOKEN = "agentezap-internal-wa-gateway";

export interface AuthenticatedRealtimeSocket extends WebSocket {
  userId?: string;
  memberId?: string;
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

export function hasWebSocketClient(userId: string): boolean {
  const clients = userRealtimeClients.get(userId);
  if (!clients || clients.size === 0) {
    return false;
  }
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
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

export function hasAdminWebSocketClient(adminId: string): boolean {
  const clients = adminRealtimeClients.get(adminId);
  if (!clients || clients.size === 0) {
    return false;
  }
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
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

function resolveRealtimeConversationId(data: any): string | null {
  const raw =
    data?.conversationId ||
    data?.conversationUpdate?.id ||
    data?.data?.conversationId ||
    data?.messageData?.conversationId ||
    data?.messageData?.conversation_id ||
    null;
  const conversationId = String(raw || "").trim();
  return conversationId || null;
}

async function canMemberReceiveConversationRealtimeEvent(
  ownerId: string,
  memberId: string,
  conversationId: string,
): Promise<boolean> {
  const conversationResult = await pool.query(
    `
      SELECT
        c.id,
        c.connection_id,
        c.sector_id,
        c.assigned_to_member_id,
        EXISTS (
          SELECT 1
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.from_me = true
            AND COALESCE(m.is_from_agent, false) = false
            AND (c.handed_off_at IS NULL OR m.timestamp >= c.handed_off_at)
        ) AS has_manual_human_reply_since_handoff
      FROM conversations c
      INNER JOIN whatsapp_connections wc
        ON wc.id = c.connection_id
      WHERE c.id = $1
        AND wc.user_id = $2
      LIMIT 1
    `,
    [conversationId, ownerId],
  );

  const conversation = conversationResult.rows[0];
  if (!conversation) {
    return false;
  }

  if (conversation.assigned_to_member_id && String(conversation.assigned_to_member_id) === memberId) {
    return true;
  }

  const scopeResult = await pool.query(
    `
      SELECT
        sm.sector_id,
        COALESCE(s.controlled_handoff_enabled, true) AS controlled_handoff_enabled
      FROM sector_members sm
      JOIN sectors s ON s.id = sm.sector_id
      WHERE sm.member_id = $1
        AND s.owner_id = $2
    `,
    [memberId, ownerId],
  );

  const sectorIds = scopeResult.rows.map((row) => String(row.sector_id)).filter(Boolean);
  const sectorId = String(conversation.sector_id || (sectorIds.length === 1 ? sectorIds[0] : "") || "").trim();
  if (!sectorId || !sectorIds.includes(sectorId)) {
    if (!conversation.sector_id && conversation.connection_id) {
      const connectionScope = await pool.query(
        `
          SELECT 1
          FROM connection_members
          WHERE member_id = $1
            AND connection_id = $2
            AND COALESCE(can_view, true) = true
          LIMIT 1
        `,
        [memberId, conversation.connection_id],
      );

      return connectionScope.rowCount > 0;
    }
    return false;
  }

  const sectorSettings = scopeResult.rows.find((row) => String(row.sector_id) === sectorId);
  if (sectorSettings?.controlled_handoff_enabled === false) {
    return true;
  }

  return conversation.has_manual_human_reply_since_handoff !== true;
}

function broadcastToLocalUserClients(
  userId: string,
  payload: any,
): number {
  const clients = userRealtimeClients.get(userId);
  if (!clients || clients.size === 0) {
    return 0;
  }

  let ownerSentCount = 0;
  const serializedPayload = JSON.stringify(payload);
  const conversationId = resolveRealtimeConversationId(payload);

  clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    if (!client.memberId) {
      client.send(serializedPayload);
      ownerSentCount += 1;
      return;
    }

    if (!conversationId) {
      return;
    }

    void canMemberReceiveConversationRealtimeEvent(userId, client.memberId, conversationId)
      .then((allowed) => {
        if (allowed && client.readyState === WebSocket.OPEN) {
          client.send(serializedPayload);
        }
      })
      .catch((error) => {
        console.warn(
          `[REALTIME] Failed to authorize member realtime event conversation=${conversationId} member=${client.memberId}:`,
          error,
        );
      });
  });

  console.log(`[REALTIME] Sent local event to ${ownerSentCount}/${clients.size} user:${userId} owner clients`);
  return ownerSentCount;
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

  broadcastToLocalUserClients(userId, data);
  void publishSupabaseRealtimeBroadcast(buildUserRealtimeTopic(userId), data);
}

export function broadcastToAdmin(adminId: string, data: any) {
  broadcastToLocalClients(adminRealtimeClients.get(adminId), data, `admin:${adminId}`);
  void publishSupabaseRealtimeBroadcast(buildAdminRealtimeTopic(adminId), data);
}
