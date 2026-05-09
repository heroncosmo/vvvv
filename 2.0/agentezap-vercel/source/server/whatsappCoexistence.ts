import type { WhatsappConnection } from "@shared/schema";
import { storage } from "./storage";

export const WHATSAPP_CONNECTION_PROVIDERS = {
  BAILEYS: "baileys",
  META_CLOUD_API: "meta_cloud_api",
} as const;

export const WHATSAPP_CONNECTION_METHODS = {
  QR: "qr",
  PAIRING: "pairing",
  COEXISTENCE: "coexistence",
} as const;

export const WHATSAPP_PROVIDER_STATUS = {
  INACTIVE: "inactive",
  PENDING_SETUP: "pending_setup",
  AWAITING_WEBHOOK: "awaiting_webhook",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  ERROR: "error",
} as const;

const DEFAULT_BETA_EMAILS = ["rodrigo4@gmail.com"];
const DEFAULT_ONBOARDING_DOC_URL =
  "https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/";

function normalizeEmail(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function getWhatsappCoexistenceBetaEmails(): string[] {
  const raw = process.env.WHATSAPP_COEXISTENCE_BETA_EMAILS;
  if (!raw?.trim()) {
    return DEFAULT_BETA_EMAILS;
  }

  return raw
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

export function getWhatsappCoexistenceLaunchConfig() {
  const appId = String(process.env.WHATSAPP_COEXISTENCE_APP_ID || "").trim();
  const configId = String(process.env.WHATSAPP_COEXISTENCE_CONFIG_ID || "").trim();
  const setupUrl = String(process.env.WHATSAPP_COEXISTENCE_SETUP_URL || "").trim();
  const redirectUri = String(process.env.WHATSAPP_COEXISTENCE_REDIRECT_URI || "").trim();

  return {
    appId,
    configId,
    setupUrl,
    redirectUri,
    docsUrl: DEFAULT_ONBOARDING_DOC_URL,
    isConfigured: !!appId && !!configId,
  };
}

export function buildPendingCoexistenceProviderConfig(
  existingConfig: Record<string, unknown> | null | undefined,
  extras?: Record<string, unknown>,
) {
  return {
    ...(existingConfig || {}),
    onboardingSource: "embedded_signup_business_app_users",
    betaOnly: true,
    launchConfig: getWhatsappCoexistenceLaunchConfig(),
    updatedAt: new Date().toISOString(),
    ...(extras || {}),
  };
}

export async function getWhatsappCoexistenceBetaStatus(userId: string): Promise<{
  enabled: boolean;
  userEmail: string | null;
  launchConfig: ReturnType<typeof getWhatsappCoexistenceLaunchConfig>;
}> {
  const user = await storage.getUser(userId);
  const userEmail = normalizeEmail(user?.email);
  const enabled = !!userEmail && getWhatsappCoexistenceBetaEmails().includes(userEmail);

  return {
    enabled,
    userEmail: userEmail || null,
    launchConfig: getWhatsappCoexistenceLaunchConfig(),
  };
}

export async function assertWhatsappCoexistenceBetaAccess(userId: string) {
  const status = await getWhatsappCoexistenceBetaStatus(userId);
  if (!status.enabled) {
    const error = new Error("Coexistência Oficial disponível apenas para a beta allowlist.");
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }

  return status;
}

export function isOfficialCoexistenceConnection(
  connection: Pick<WhatsappConnection, "provider" | "connectionMethod"> | null | undefined,
) {
  return (
    connection?.provider === WHATSAPP_CONNECTION_PROVIDERS.META_CLOUD_API ||
    connection?.connectionMethod === WHATSAPP_CONNECTION_METHODS.COEXISTENCE
  );
}

export function isWhatsAppProviderStatusConnected(providerStatus?: string | null): boolean {
  return String(providerStatus || "").trim().toLowerCase() === WHATSAPP_PROVIDER_STATUS.CONNECTED;
}

export function isPersistedWhatsAppConnectionOperational(
  connection:
    | Pick<WhatsappConnection, "isConnected" | "providerStatus" | "provider" | "connectionMethod">
    | null
    | undefined,
): boolean {
  if (!connection) {
    return false;
  }

  if (!isOfficialCoexistenceConnection(connection)) {
    const normalizedStatus = String(connection.providerStatus || "").trim().toLowerCase();
    return (
      connection.isConnected === true &&
      (!normalizedStatus || normalizedStatus === WHATSAPP_PROVIDER_STATUS.CONNECTED)
    );
  }

  return connection.isConnected === true || isWhatsAppProviderStatusConnected(connection.providerStatus);
}
