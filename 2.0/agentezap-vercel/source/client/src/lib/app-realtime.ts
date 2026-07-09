import type { RealtimeChannel } from "@supabase/supabase-js";

import { buildAdminRealtimeTopic, buildUserRealtimeTopic } from "@shared/realtimeTopics";

import { buildAppWebSocketUrl } from "./native-runtime";
import { supabase } from "./supabase";

type AppRealtimeEvent = Record<string, any>;

type BaseRealtimeOptions = {
  onEvent: (payload: AppRealtimeEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: unknown) => void;
};

type UserRealtimeOptions = BaseRealtimeOptions & {
  scope: "user";
  getToken: () => Promise<string | null>;
};

type AdminRealtimeOptions = BaseRealtimeOptions & {
  scope: "admin";
  adminId: string;
  getToken?: () => Promise<string | null>;
};

export type AppRealtimeOptions = UserRealtimeOptions | AdminRealtimeOptions;

export type AppRealtimeConnection = {
  provider: "supabase" | "ws";
  close: () => Promise<void>;
  send?: (payload: unknown) => void;
};

function readViteEnv(name: string) {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return String(env?.[name] || "").trim();
}

function isTruthyFlag(value: string | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function shouldUseSupabaseRealtimeBroadcast() {
  return (
    readViteEnv("VITE_REALTIME_PROVIDER").toLowerCase() === "supabase" ||
    isTruthyFlag(readViteEnv("VITE_SUPABASE_REALTIME_BROADCAST"))
  );
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const segments = token.split(".");
    if (segments.length < 2) {
      return null;
    }

    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getUserRealtimeTopicFromToken(token: string): string | null {
  const userId = String(decodeJwtPayload(token)?.sub || "").trim();
  if (!userId) {
    return null;
  }

  return buildUserRealtimeTopic(userId, readViteEnv("VITE_APP_REALTIME_USER_TOPIC_PREFIX"));
}

function getStoredMemberToken(): string | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem("memberToken");
  } catch {
    return null;
  }
}

function getStoredMemberOwnerRealtimeTopic(): string | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem("memberData");
    if (!raw) {
      return null;
    }

    const memberData = JSON.parse(raw);
    const ownerId = String(memberData?.ownerId || memberData?.owner_id || "").trim();
    if (!ownerId) {
      return null;
    }

    return buildUserRealtimeTopic(ownerId, readViteEnv("VITE_APP_REALTIME_USER_TOPIC_PREFIX"));
  } catch {
    return null;
  }
}

async function resolveUserRealtimeToken(getToken: () => Promise<string | null>): Promise<string | null> {
  return getStoredMemberToken() || await getToken();
}

function getAdminRealtimeTopic(adminId: string): string {
  return buildAdminRealtimeTopic(adminId, readViteEnv("VITE_APP_REALTIME_ADMIN_TOPIC_PREFIX"));
}

function normalizeSupabaseBroadcastPayload(payload: any): AppRealtimeEvent {
  const messagePayload = payload?.payload;
  if (messagePayload && typeof messagePayload === "object") {
    return messagePayload;
  }

  return payload;
}

async function maybeSetSupabaseRealtimeAuth(getToken?: (() => Promise<string | null>) | undefined) {
  if (!getToken) {
    return;
  }

  try {
    const token = await getToken();
    if (token) {
      await supabase.realtime.setAuth(token);
    }
  } catch (error) {
    console.warn("[realtime] Falha ao atualizar auth do Supabase Realtime", error);
  }
}

async function openSupabaseRealtimeConnection(options: AppRealtimeOptions): Promise<AppRealtimeConnection | null> {
  let topic: string | null = null;

  if (options.scope === "user") {
    const token = await resolveUserRealtimeToken(options.getToken);
    if (!token) {
      return null;
    }

    topic = getUserRealtimeTopicFromToken(token) || getStoredMemberOwnerRealtimeTopic();
    if (!topic) {
      console.error("[realtime] Nao foi possivel derivar o userId do token para o canal realtime");
      return null;
    }
  } else {
    topic = getAdminRealtimeTopic(options.adminId);
  }

  await maybeSetSupabaseRealtimeAuth(async () => {
    if (options.scope !== "user") {
      return options.getToken ? await options.getToken() : null;
    }

    const token = await resolveUserRealtimeToken(options.getToken);
    return token?.includes(".") ? token : null;
  });

  let closed = false;
  const channel: RealtimeChannel = supabase.channel(topic);

  channel.on("broadcast", { event: "*" }, (payload) => {
    options.onEvent(normalizeSupabaseBroadcastPayload(payload));
  });

  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") {
      options.onOpen?.();
      return;
    }

    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      options.onError?.(error || new Error(`[realtime] Falha no canal ${topic}: ${status}`));
      if (!closed) {
        closed = true;
        void supabase.removeChannel(channel);
        options.onClose?.();
      }
      return;
    }

    if (status === "CLOSED" && !closed) {
      closed = true;
      options.onClose?.();
    }
  });

  return {
    provider: "supabase",
    close: async () => {
      if (closed) {
        return;
      }

      closed = true;
      await supabase.removeChannel(channel);
      options.onClose?.();
    },
  };
}

async function openWebSocketRealtimeConnection(options: AppRealtimeOptions): Promise<AppRealtimeConnection | null> {
  let wsUrl: string;
  if (options.scope === "admin") {
    wsUrl = buildAppWebSocketUrl("/ws", { adminId: options.adminId });
  } else {
    const token = await resolveUserRealtimeToken(options.getToken);
    if (!token) {
      return null;
    }
    wsUrl = buildAppWebSocketUrl("/ws", { token });
  }

  return await new Promise<AppRealtimeConnection | null>((resolve) => {
    const websocket = new WebSocket(wsUrl);
    let closed = false;
    let settled = false;

    const resolveOnce = (value: AppRealtimeConnection | null) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    websocket.onopen = () => {
      options.onOpen?.();
      resolveOnce({
        provider: "ws",
        close: async () => {
          if (closed) {
            return;
          }

          closed = true;
          websocket.close();
        },
        send: (payload: unknown) => {
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify(payload));
          }
        },
      });
    };

    websocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "ping") {
          websocket.send(JSON.stringify({ type: "pong", timestamp: payload.timestamp }));
          return;
        }

        options.onEvent(payload);
      } catch (error) {
        options.onError?.(error);
      }
    };

    websocket.onerror = (error) => {
      options.onError?.(error);
      resolveOnce(null);
    };

    websocket.onclose = () => {
      resolveOnce(null);
      if (closed) {
        return;
      }

      closed = true;
      options.onClose?.();
    };
  });
}

export async function openAppRealtimeConnection(options: AppRealtimeOptions): Promise<AppRealtimeConnection | null> {
  if (shouldUseSupabaseRealtimeBroadcast()) {
    return openSupabaseRealtimeConnection(options);
  }

  return openWebSocketRealtimeConnection(options);
}
