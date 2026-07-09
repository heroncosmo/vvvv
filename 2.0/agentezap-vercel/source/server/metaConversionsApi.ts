import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { systemConfig } from "@shared/schema";

type MetaLeadIdentity = {
  eventId: string;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  company?: string | null;
  formId?: string | null;
  submittedAt?: Date | null;
  source?: string;
};

export type MetaBusinessMessagingEventName =
  | "Purchase"
  | "Lead"
  | "LeadSubmitted"
  | "InitiateCheckout"
  | "AddToCart"
  | "ViewContent";

export type MetaWhatsappAdsAttribution = {
  ctwaClid?: string | null;
  sourceId?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  title?: string | null;
  body?: string | null;
  mediaType?: string | null;
  thumbnailUrl?: string | null;
  capturedAt?: string | null;
  messageId?: string | null;
};

export type MetaConversionIdentity = MetaLeadIdentity & {
  eventName?: string | null;
  actionSource?: string | null;
  messagingChannel?: string | null;
  configKey?: string | null;
  value?: number | null;
  currency?: string | null;
  customData?: Record<string, unknown>;
  whatsappAdsAttribution?: MetaWhatsappAdsAttribution | null;
};

type MetaPaidWhatsappIdentity = MetaLeadIdentity & {
  value?: number | null;
  currency?: string | null;
  planName?: string | null;
  subscriptionId?: string | null;
  whatsappAdsAttribution?: MetaWhatsappAdsAttribution | null;
};

export type MetaWhatsappBusinessMessagingIdentity = MetaLeadIdentity & {
  eventName: MetaBusinessMessagingEventName | string;
  value?: number | null;
  currency?: string | null;
  contentName?: string | null;
  subscriptionId?: string | null;
  whatsappAdsAttribution?: MetaWhatsappAdsAttribution | null;
  customData?: Record<string, unknown>;
};

export type MetaCapiResult =
  | {
      sent: true;
      eventId: string;
      eventName: string;
      response: unknown;
    }
  | {
      sent: false;
      skipped: true;
      reason: string;
      eventId: string;
      eventName: string;
    };

const DEFAULT_GRAPH_VERSION = String(process.env.META_CAPI_GRAPH_VERSION || "v25.0").trim() || "v25.0";
const DEFAULT_EVENT_NAME = String(process.env.META_CAPI_WHATSAPP_EVENT_NAME || "Contact").trim() || "Contact";
const DEFAULT_PAID_EVENT_NAME = String(process.env.META_CAPI_WHATSAPP_PAID_EVENT_NAME || "Purchase").trim() || "Purchase";
const DEFAULT_PAID_ACTION_SOURCE =
  String(process.env.META_CAPI_WHATSAPP_ACTION_SOURCE || "business_messaging").trim() || "business_messaging";
const DEFAULT_WHATSAPP_MESSAGING_CHANNEL =
  String(process.env.META_CAPI_WHATSAPP_MESSAGING_CHANNEL || "whatsapp").trim() || "whatsapp";
const RODRIGO_META_CAPI_CONFIG_KEY = "meta_capi_rodrigo_whatsapp_config";
const RODRIGO_META_CAPI_ACCESS_TOKEN_SECRET = "meta_capi_rodrigo_access_token";
const META_CAPI_CONFIG_CACHE_MS = 60_000;

type MetaCapiRuntimeConfig = {
  enabled: boolean;
  pixelId: string;
  accessToken: string;
  graphVersion: string;
  testEventCode: string;
  whatsappBusinessAccountId: string;
  pageId: string;
  defaultEventName: string;
  paidEventName: string;
  paidActionSource: string;
  whatsappMessagingChannel: string;
};

const runtimeConfigCache = new Map<string, { expiresAt: number; config: Partial<MetaCapiRuntimeConfig> & { enabled?: boolean } }>();

function normalizeDigits(value: string | null | undefined): string {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cleanPlainField(value: unknown, maxLength = 512): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function parseConfigJson(rawValue: string | null | undefined): Record<string, unknown> {
  const raw = String(rawValue || "").trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    console.warn("[Meta CAPI] Configuracao Supabase ignorada: JSON invalido.");
    return {};
  }
}

function configString(config: Record<string, unknown>, keys: string[], fallback = "", maxLength = 1024): string {
  for (const key of keys) {
    const value = cleanPlainField(config[key], maxLength);
    if (value) return value;
  }
  return fallback;
}

function configBoolean(config: Record<string, unknown>, keys: string[], fallback = true): boolean {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
      if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
    }
  }
  return fallback;
}

async function getVaultSecretByName(secretName: string): Promise<string> {
  const safeName = cleanPlainField(secretName, 128);
  if (!safeName) return "";

  try {
    const { db } = await import("./db");
    const result = await db.execute(sql`
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = ${safeName}
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
    `);
    const row = ((result as any)?.rows || [])[0] as { decrypted_secret?: string | null } | undefined;
    return cleanPlainField(row?.decrypted_secret, 4096);
  } catch (error: any) {
    console.warn("[Meta CAPI] Nao foi possivel ler segredo no Supabase Vault:", error?.message || error);
    return "";
  }
}

async function readSupabaseMetaCapiConfig(configKey: string | null | undefined): Promise<Partial<MetaCapiRuntimeConfig> & { enabled?: boolean }> {
  const key = cleanPlainField(configKey, 100);
  if (!key) return {};

  const cached = runtimeConfigCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.config;
  }

  try {
    const { db } = await import("./db");
    const [row] = await db
      .select({ valor: systemConfig.valor })
      .from(systemConfig)
      .where(eq(systemConfig.chave, key))
      .limit(1);
    const parsed = parseConfigJson(row?.valor);
    const accessTokenSecretName = configString(
      parsed,
      ["accessTokenSecretName", "access_token_secret_name", "vaultSecretName", "vault_secret_name"],
      key === RODRIGO_META_CAPI_CONFIG_KEY ? RODRIGO_META_CAPI_ACCESS_TOKEN_SECRET : "",
      128,
    );
    const accessTokenFromVault = accessTokenSecretName ? await getVaultSecretByName(accessTokenSecretName) : "";
    const config: Partial<MetaCapiRuntimeConfig> & { enabled?: boolean } = {
      enabled: configBoolean(parsed, ["enabled", "ativo", "active"], true),
      pixelId: configString(parsed, ["pixelId", "pixel_id", "datasetId", "dataset_id"], "", 128),
      accessToken: accessTokenFromVault || configString(parsed, ["accessToken", "access_token"], "", 4096),
      graphVersion: configString(parsed, ["graphVersion", "graph_version"], "", 32),
      testEventCode: configString(parsed, ["testEventCode", "test_event_code"], "", 128),
      whatsappBusinessAccountId: configString(
        parsed,
        ["whatsappBusinessAccountId", "whatsapp_business_account_id", "wabaId", "waba_id"],
        "",
        64,
      ),
      pageId: configString(parsed, ["pageId", "page_id", "facebookPageId", "facebook_page_id"], "", 64),
      defaultEventName: configString(parsed, ["eventName", "event_name", "defaultEventName", "default_event_name"], "", 64),
      paidEventName: configString(parsed, ["paidEventName", "paid_event_name"], "", 64),
      paidActionSource: configString(parsed, ["actionSource", "action_source", "paidActionSource", "paid_action_source"], "", 64),
      whatsappMessagingChannel: configString(
        parsed,
        ["messagingChannel", "messaging_channel", "whatsappMessagingChannel", "whatsapp_messaging_channel"],
        "",
        64,
      ),
    };

    runtimeConfigCache.set(key, { expiresAt: now + META_CAPI_CONFIG_CACHE_MS, config });
    return config;
  } catch (error: any) {
    console.warn("[Meta CAPI] Nao foi possivel ler configuracao Supabase:", error?.message || error);
    runtimeConfigCache.set(key, { expiresAt: now + 10_000, config: {} });
    return {};
  }
}

async function resolveMetaCapiRuntimeConfig(configKey?: string | null): Promise<MetaCapiRuntimeConfig> {
  const supabaseConfig = await readSupabaseMetaCapiConfig(configKey);

  return {
    enabled: supabaseConfig.enabled ?? true,
    pixelId: supabaseConfig.pixelId || getPixelId(),
    accessToken: supabaseConfig.accessToken || getAccessToken(),
    graphVersion: supabaseConfig.graphVersion || DEFAULT_GRAPH_VERSION,
    testEventCode: supabaseConfig.testEventCode || String(process.env.META_CAPI_TEST_EVENT_CODE || "").trim(),
    whatsappBusinessAccountId:
      supabaseConfig.whatsappBusinessAccountId ||
      cleanPlainField(process.env.META_CAPI_WHATSAPP_BUSINESS_ACCOUNT_ID, 64),
    pageId: supabaseConfig.pageId || cleanPlainField(process.env.META_CAPI_PAGE_ID, 64),
    defaultEventName: supabaseConfig.defaultEventName || DEFAULT_EVENT_NAME,
    paidEventName: supabaseConfig.paidEventName || DEFAULT_PAID_EVENT_NAME,
    paidActionSource: supabaseConfig.paidActionSource || DEFAULT_PAID_ACTION_SOURCE,
    whatsappMessagingChannel: supabaseConfig.whatsappMessagingChannel || DEFAULT_WHATSAPP_MESSAGING_CHANNEL,
  };
}

function hasWhatsAppAdAttribution(attribution: MetaWhatsappAdsAttribution | null | undefined): boolean {
  return Boolean(
    cleanPlainField(attribution?.ctwaClid, 1024) ||
      cleanPlainField(attribution?.sourceId, 256) ||
      cleanPlainField(attribution?.sourceUrl, 1024) ||
      cleanPlainField(attribution?.sourceType, 128),
  );
}

function hasWhatsAppAdClickIdAttribution(attribution: MetaWhatsappAdsAttribution | null | undefined): boolean {
  return Boolean(cleanPlainField(attribution?.ctwaClid, 1024));
}

export function hasMetaWhatsappClickIdAttribution(
  attribution: MetaWhatsappAdsAttribution | null | undefined,
): boolean {
  return hasWhatsAppAdClickIdAttribution(attribution);
}

function getPixelId(): string {
  return String(process.env.META_CAPI_PIXEL_ID || "").trim();
}

function getAccessToken(): string {
  return String(process.env.META_CAPI_ACCESS_TOKEN || "").trim();
}

export function isMetaCapiConfigured(): boolean {
  return Boolean(getPixelId() && getAccessToken());
}

export function buildMetaConversionUserData(
  lead: MetaLeadIdentity,
  config: MetaCapiRuntimeConfig,
): Record<string, string[] | string> {
  const userData: Record<string, string[] | string> = {};
  const phone = normalizeDigits(lead.phone);
  const email = normalizeText(lead.email);
  const name = String(lead.name || "").trim();

  if (phone) {
    userData.ph = [sha256(phone)];
  }

  if (email) {
    userData.em = [sha256(email)];
  }

  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts[0]) {
      userData.fn = [sha256(normalizeText(parts[0]))];
    }
    if (parts.length > 1) {
      userData.ln = [sha256(normalizeText(parts.slice(1).join(" ")))];
    }
  }

  const attribution = (lead as MetaConversionIdentity).whatsappAdsAttribution;
  const ctwaClid = cleanPlainField(attribution?.ctwaClid, 1024);
  if (ctwaClid) {
    userData.ctwa_clid = ctwaClid;
  }

  const whatsappBusinessAccountId = cleanPlainField(config.whatsappBusinessAccountId, 64);
  if (whatsappBusinessAccountId) {
    userData.whatsapp_business_account_id = whatsappBusinessAccountId;
  }

  const pageId = cleanPlainField(config.pageId, 64);
  if (pageId && (!ctwaClid || !whatsappBusinessAccountId)) {
    userData.page_id = pageId;
  }

  return userData;
}

export async function sendMetaConversionEvent(lead: MetaConversionIdentity): Promise<MetaCapiResult> {
  const config = await resolveMetaCapiRuntimeConfig(lead.configKey);
  const pixelId = config.pixelId;
  const accessToken = config.accessToken;
  const eventName = String(lead.eventName || config.defaultEventName).trim() || config.defaultEventName;
  const eventId = `${lead.eventId}:${eventName}`;

  if (!config.enabled) {
    return {
      sent: false,
      skipped: true,
      reason: "Meta CAPI desativado na configuracao.",
      eventId,
      eventName,
    };
  }

  if (!pixelId || !accessToken) {
    return {
      sent: false,
      skipped: true,
      reason: "Meta CAPI nao configurado.",
      eventId,
      eventName,
    };
  }

  const userData = buildMetaConversionUserData(lead, config);
  if (!Object.keys(userData).length) {
    return {
      sent: false,
      skipped: true,
      reason: "Lead sem identificadores suficientes para envio ao Meta CAPI.",
      eventId,
      eventName,
    };
  }

  const customData = {
    value: lead.value ?? 0,
    currency: lead.currency || "BRL",
    lead_source: lead.source || "meta_instant_form_google_sheet",
    form_id: lead.formId || undefined,
    company: lead.company || undefined,
    ...(lead.customData || {}),
  };

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor((lead.submittedAt || new Date()).getTime() / 1000),
        event_id: eventId,
        action_source: lead.actionSource || "system_generated",
        messaging_channel: cleanPlainField(lead.messagingChannel, 64) || undefined,
        user_data: userData,
        custom_data: customData,
      },
    ],
    test_event_code: config.testEventCode || undefined,
  };

  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${pixelId}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = (json as { error?: Record<string, any> })?.error || {};
    const errorData = errorPayload.error_data && typeof errorPayload.error_data === "object"
      ? errorPayload.error_data as Record<string, unknown>
      : {};
    const message =
      [
        errorPayload.message || `Meta CAPI ${response.status}: falha no envio do evento`,
        errorPayload.code ? `code=${errorPayload.code}` : "",
        errorPayload.error_subcode ? `subcode=${errorPayload.error_subcode}` : "",
        errorPayload.error_user_title ? `title=${errorPayload.error_user_title}` : "",
        errorPayload.error_user_msg ? `user_msg=${errorPayload.error_user_msg}` : "",
        errorData.details ? `details=${String(errorData.details)}` : "",
      ].filter(Boolean).join(" | ");
    throw new Error(message);
  }

  return {
    sent: true,
    eventId,
    eventName,
    response: json,
  };
}

export async function sendMetaLeadWhatsappEvent(lead: MetaLeadIdentity): Promise<MetaCapiResult> {
  return sendMetaConversionEvent({
    ...lead,
    eventName: DEFAULT_EVENT_NAME,
    actionSource: "system_generated",
    value: 0,
    currency: "BRL",
  });
}

export async function sendMetaPaidWhatsappConversion(lead: MetaPaidWhatsappIdentity): Promise<MetaCapiResult> {
  const attribution = lead.whatsappAdsAttribution || null;
  if (!hasWhatsAppAdClickIdAttribution(attribution)) {
    const eventName = DEFAULT_PAID_EVENT_NAME;
    return {
      sent: false,
      skipped: true,
      reason: "Lead sem ctwa_clid da campanha WhatsApp para envio ao Meta CAPI.",
      eventId: `${lead.eventId}:${eventName}`,
      eventName,
    };
  }

  const config = await resolveMetaCapiRuntimeConfig(RODRIGO_META_CAPI_CONFIG_KEY);
  const eventName = config.paidEventName || DEFAULT_PAID_EVENT_NAME;
  return sendMetaWhatsappBusinessMessagingEvent({
    ...lead,
    eventName,
    value: lead.value ?? 0,
    currency: lead.currency || "BRL",
    contentName: lead.planName || "Assinatura AgenteZap",
    source: lead.source || "rodrigo_whatsapp_paid_subscription",
    whatsappAdsAttribution: attribution,
    customData: {
      subscription_id: lead.subscriptionId || undefined,
    },
  });
}

export async function sendMetaWhatsappBusinessMessagingEvent(
  lead: MetaWhatsappBusinessMessagingIdentity,
): Promise<MetaCapiResult> {
  const attribution = lead.whatsappAdsAttribution || null;
  const eventName = String(lead.eventName || "").trim() || DEFAULT_PAID_EVENT_NAME;

  if (!hasWhatsAppAdClickIdAttribution(attribution)) {
    return {
      sent: false,
      skipped: true,
      reason: "Lead sem ctwa_clid da campanha WhatsApp para envio ao Meta CAPI.",
      eventId: `${lead.eventId}:${eventName}`,
      eventName,
    };
  }

  const config = await resolveMetaCapiRuntimeConfig(RODRIGO_META_CAPI_CONFIG_KEY);
  return sendMetaConversionEvent({
    ...lead,
    configKey: RODRIGO_META_CAPI_CONFIG_KEY,
    eventName,
    actionSource: config.paidActionSource || DEFAULT_PAID_ACTION_SOURCE,
    messagingChannel: config.whatsappMessagingChannel || DEFAULT_WHATSAPP_MESSAGING_CHANNEL,
    value: lead.value ?? 0,
    currency: lead.currency || "BRL",
    source: lead.source || "rodrigo_whatsapp_business_messaging",
    whatsappAdsAttribution: attribution,
    customData: {
      content_name: lead.contentName || undefined,
      subscription_id: lead.subscriptionId || undefined,
      lead_source: lead.source || "rodrigo_whatsapp_business_messaging",
      ...(lead.customData || {}),
    },
  });
}
