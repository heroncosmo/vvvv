import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { systemConfig, webPushSubscriptions } from "@shared/schema";

type StoredVapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type PushNotificationPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  renotify?: boolean;
  requireInteraction?: boolean;
  vibrate?: number[];
  timestamp?: number;
  ttlSeconds?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  topic?: string;
};

const VAPID_PUBLIC_KEY = "pwa_vapid_public_key";
const VAPID_PRIVATE_KEY = "pwa_vapid_private_key";
const VAPID_SUBJECT_KEY = "pwa_vapid_subject";
const DEFAULT_VAPID_SUBJECT = process.env.WEB_PUSH_SUBJECT || "mailto:suporte@agentezap.online";

let configuredVapidFingerprint: string | null = null;
const DEFAULT_PUSH_TTL_SECONDS = 6 * 60 * 60;

function sanitizePushTopic(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  let safe = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isNumber = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    const isDash = char === "-";
    const isUnderscore = char === "_";
    if (isNumber || isUpper || isLower || isDash || isUnderscore) {
      safe += char;
    }
    if (safe.length >= 32) {
      break;
    }
  }

  return safe || undefined;
}

async function getConfigMap(keys: string[]) {
  const rows = await db
    .select()
    .from(systemConfig)
    .where(inArray(systemConfig.chave, keys));

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.valor) {
      map.set(row.chave, row.valor);
    }
  }
  return map;
}

async function setConfigValue(key: string, value: string) {
  await db
    .insert(systemConfig)
    .values({
      chave: key,
      valor: value,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfig.chave,
      set: {
        valor: value,
        updatedAt: new Date(),
      },
    });
}

async function getOrCreateVapidKeys(): Promise<StoredVapidKeys> {
  const config = await getConfigMap([VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT_KEY]);
  const existingPublic = config.get(VAPID_PUBLIC_KEY);
  const existingPrivate = config.get(VAPID_PRIVATE_KEY);
  const existingSubject = config.get(VAPID_SUBJECT_KEY) || DEFAULT_VAPID_SUBJECT;

  if (existingPublic && existingPrivate) {
    return {
      publicKey: existingPublic,
      privateKey: existingPrivate,
      subject: existingSubject,
    };
  }

  const generated = webpush.generateVAPIDKeys();
  const stored: StoredVapidKeys = {
    publicKey: existingPublic || generated.publicKey,
    privateKey: existingPrivate || generated.privateKey,
    subject: existingSubject,
  };

  await Promise.all([
    setConfigValue(VAPID_PUBLIC_KEY, stored.publicKey),
    setConfigValue(VAPID_PRIVATE_KEY, stored.privateKey),
    setConfigValue(VAPID_SUBJECT_KEY, stored.subject),
  ]);

  return stored;
}

async function ensureWebPushConfigured() {
  const vapid = await getOrCreateVapidKeys();
  const fingerprint = `${vapid.publicKey}:${vapid.subject}`;
  if (configuredVapidFingerprint !== fingerprint) {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    configuredVapidFingerprint = fingerprint;
  }
  return vapid;
}

export async function getWebPushPublicKey() {
  const vapid = await ensureWebPushConfigured();
  return vapid.publicKey;
}

type SubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function upsertWebPushSubscription(params: {
  userId: string;
  subscription: SubscriptionInput;
  userAgent?: string;
  deviceLabel?: string | null;
}) {
  const endpoint = String(params.subscription?.endpoint || "").trim();
  const p256dh = String(params.subscription?.keys?.p256dh || "").trim();
  const auth = String(params.subscription?.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription incompleta");
  }

  await db
    .insert(webPushSubscriptions)
    .values({
      userId: params.userId,
      endpoint,
      p256dh,
      auth,
      userAgent: params.userAgent || null,
      deviceLabel: params.deviceLabel || null,
      isActive: true,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: webPushSubscriptions.endpoint,
      set: {
        userId: params.userId,
        p256dh,
        auth,
        userAgent: params.userAgent || null,
        deviceLabel: params.deviceLabel || null,
        isActive: true,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function removeWebPushSubscription(userId: string, endpoint?: string | null) {
  if (endpoint) {
    await db
      .delete(webPushSubscriptions)
      .where(and(eq(webPushSubscriptions.userId, userId), eq(webPushSubscriptions.endpoint, endpoint)));
    return;
  }

  await db.delete(webPushSubscriptions).where(eq(webPushSubscriptions.userId, userId));
}

export async function syncWebPushHeartbeat(userId: string, endpoint: string) {
  await db
    .update(webPushSubscriptions)
    .set({
      isActive: true,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(webPushSubscriptions.userId, userId), eq(webPushSubscriptions.endpoint, endpoint)));
}

export async function getWebPushSubscriptionStatus(params: {
  userId: string;
  endpoint?: string | null;
}) {
  const subscriptions = await db
    .select()
    .from(webPushSubscriptions)
    .where(eq(webPushSubscriptions.userId, params.userId));

  const activeSubscriptions = subscriptions.filter((subscription) => subscription.isActive);
  const matchedSubscription = params.endpoint
    ? subscriptions.find((subscription) => subscription.endpoint === params.endpoint) || null
    : null;

  if (matchedSubscription?.isActive) {
    await syncWebPushHeartbeat(params.userId, matchedSubscription.endpoint);
  }

  return {
    totalSubscriptions: subscriptions.length,
    totalActiveSubscriptions: activeSubscriptions.length,
    currentEndpointRegistered: Boolean(matchedSubscription),
    currentEndpointActive: Boolean(matchedSubscription?.isActive),
    currentDeviceLabel: matchedSubscription?.deviceLabel || null,
    currentUserAgent: matchedSubscription?.userAgent || null,
    currentLastSeenAt: matchedSubscription?.lastSeenAt?.toISOString?.() || null,
  };
}

export async function sendWebPushToUser(userId: string, payload: PushNotificationPayload) {
  await ensureWebPushConfigured();

  const subscriptions = await db
    .select()
    .from(webPushSubscriptions)
    .where(and(eq(webPushSubscriptions.userId, userId), eq(webPushSubscriptions.isActive, true)));

  if (subscriptions.length === 0) {
    return { attempted: 0, delivered: 0 };
  }

  let delivered = 0;
  const staleEndpoints: string[] = [];
  const serializedPayload = JSON.stringify({
    title: payload.title,
    body: payload.body || "",
    tag: payload.tag || "agentezap-push",
    icon: payload.icon || "/pwa-192.png",
    badge: payload.badge || "/pwa-badge.png",
    url: payload.url || "/",
    data: payload.data || {},
    renotify: payload.renotify ?? false,
    requireInteraction: payload.requireInteraction ?? false,
    vibrate: payload.vibrate || [],
    timestamp: payload.timestamp ?? Date.now(),
  });
  const topic = sanitizePushTopic(payload.topic);
  const ttlSeconds = Number.isFinite(payload.ttlSeconds) ? Math.max(0, Math.trunc(payload.ttlSeconds as number)) : DEFAULT_PUSH_TTL_SECONDS;
  const urgency = payload.urgency || "normal";

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          serializedPayload,
          {
            TTL: ttlSeconds,
            urgency,
            topic,
            timeout: 15_000,
          },
        );
        delivered += 1;
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(subscription.endpoint);
          return;
        }

        console.error(`[WEB PUSH] Falha ao enviar push para user ${userId}:`, error?.message || error);
      }
    }),
  );

  if (staleEndpoints.length > 0) {
    await db
      .delete(webPushSubscriptions)
      .where(and(eq(webPushSubscriptions.userId, userId), inArray(webPushSubscriptions.endpoint, staleEndpoints)));
  }

  return { attempted: subscriptions.length, delivered };
}
