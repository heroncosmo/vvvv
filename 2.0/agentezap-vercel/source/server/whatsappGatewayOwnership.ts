import type { WhatsappConnection } from "@shared/schema";

import { storage } from "./storage";

export type WhatsAppConnectionOwner = "local" | "gateway";

const EMAIL_CACHE_TTL_MS = 60_000;
const userEmailCache = new Map<string, { email: string | null; expiresAt: number }>();

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseEmailList(raw: string | undefined): string[] {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((item) => normalizeEmail(item))
        .filter(Boolean),
    ),
  );
}

export function isWhatsAppGatewayRuntime(): boolean {
  return (process.env.SERVICE_MODE || "").trim() === "wa-gateway";
}

function isMonolithRuntime(): boolean {
  return (process.env.SERVICE_MODE || "").trim().toLowerCase() === "monolith";
}

export function getWhatsAppGatewayAllowedEmails(): string[] {
  return parseEmailList(process.env.WA_GATEWAY_ALLOWED_EMAILS);
}

export function getWhatsAppGatewayRoutedEmails(): string[] {
  return parseEmailList(process.env.WA_GATEWAY_ROUTED_EMAILS);
}

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function hasRemoteGatewayConfigured(): boolean {
  return Boolean(String(process.env.WA_GATEWAY_URL || "").trim());
}

function shouldForceGatewayForDisabledLocalRuntime(): boolean {
  if (isWhatsAppGatewayRuntime() || !hasRemoteGatewayConfigured()) {
    return false;
  }

  return (
    isTruthyFlag(process.env.DISABLE_WHATSAPP_PROCESSING) ||
    isTruthyFlag(process.env.DISABLE_LOCAL_WHATSAPP_RUNTIME) ||
    isTruthyFlag(process.env.DISABLE_LEGACY_WHATSAPP_RUNTIME) ||
    isTruthyFlag(process.env.DISABLE_CUSTOMER_BAILEYS_LOCAL_RUNTIME) ||
    isTruthyFlag(process.env.SKIP_WHATSAPP_RESTORE)
  );
}

export function shouldRouteAllBaileysConnectionsToGateway(): boolean {
  return isTruthyFlag(process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS);
}

export function shouldEnablePublicInstanceApiForAllBaileys(): boolean {
  return isTruthyFlag(process.env.WA_PUBLIC_INSTANCE_API_ENABLE_ALL_BAILEYS);
}

export function getPublicInstanceApiCanaryEmails(): string[] {
  const configured = parseEmailList(process.env.WA_PUBLIC_INSTANCE_API_CANARY_EMAILS);
  if (configured.length > 0) {
    return configured;
  }

  const routed = getWhatsAppGatewayRoutedEmails();
  if (routed.length > 0) {
    return routed;
  }

  return getWhatsAppGatewayAllowedEmails();
}

async function getCachedUserEmail(userId: string): Promise<string | null> {
  const cached = userEmailCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.email;
  }

  const user = await storage.getUser(userId);
  const email = user?.email ? normalizeEmail(user.email) : null;
  userEmailCache.set(userId, {
    email,
    expiresAt: Date.now() + EMAIL_CACHE_TTL_MS,
  });
  return email;
}

async function resolveConnectionRecord(
  connectionOrId: string | WhatsappConnection,
): Promise<WhatsappConnection | undefined> {
  if (typeof connectionOrId !== "string") {
    return connectionOrId;
  }
  return storage.getConnectionById(connectionOrId);
}

function isGatewayEligibleConnection(connection: WhatsappConnection | undefined): boolean {
  if (!connection) {
    return false;
  }

  const provider = String(connection.provider || "baileys").trim().toLowerCase();
  const method = String(connection.connectionMethod || "qr").trim().toLowerCase();
  return provider === "baileys" && method !== "coexistence";
}

export async function isPublicInstanceApiCanaryEnabledForUser(userId: string): Promise<boolean> {
  const canaryEmails = getPublicInstanceApiCanaryEmails();
  if (canaryEmails.length === 0) {
    return false;
  }
  const email = await getCachedUserEmail(userId);
  return !!email && canaryEmails.includes(email);
}

export async function isPublicInstanceApiCanaryEnabledForConnection(
  connectionOrId: string | WhatsappConnection,
): Promise<boolean> {
  const connection = await resolveConnectionRecord(connectionOrId);
  if (!connection?.userId || !isGatewayEligibleConnection(connection)) {
    return false;
  }
  if (shouldEnablePublicInstanceApiForAllBaileys()) {
    return true;
  }
  return isPublicInstanceApiCanaryEnabledForUser(connection.userId);
}

export async function resolveWhatsAppConnectionOwner(
  connectionOrId: string | WhatsappConnection,
): Promise<WhatsAppConnectionOwner> {
  const connection = await resolveConnectionRecord(connectionOrId);
  if (!connection?.userId || !isGatewayEligibleConnection(connection)) {
    return "local";
  }

  if (shouldForceGatewayForDisabledLocalRuntime()) {
    return "gateway";
  }

  if (isMonolithRuntime() && !hasRemoteGatewayConfigured()) {
    return "local";
  }

  if (shouldRouteAllBaileysConnectionsToGateway()) {
    return "gateway";
  }

  const canaryEmails = new Set([
    ...getWhatsAppGatewayAllowedEmails(),
    ...getWhatsAppGatewayRoutedEmails(),
  ]);

  if (canaryEmails.size === 0) {
    return "local";
  }

  const email = await getCachedUserEmail(connection.userId);
  if (email && canaryEmails.has(email)) {
    return "gateway";
  }

  return "local";
}

export async function isConnectionOwnedByCurrentProcess(
  connectionOrId: string | WhatsappConnection,
): Promise<boolean> {
  const owner = await resolveWhatsAppConnectionOwner(connectionOrId);
  return isWhatsAppGatewayRuntime() ? owner === "gateway" : owner === "local";
}
