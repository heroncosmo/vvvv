import crypto from "crypto";

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

type MetaCapiResult =
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

function normalizeDigits(value: string | null | undefined): string {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function buildUserData(lead: MetaLeadIdentity): Record<string, string[] | string> {
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

  return userData;
}

export async function sendMetaLeadWhatsappEvent(lead: MetaLeadIdentity): Promise<MetaCapiResult> {
  const pixelId = getPixelId();
  const accessToken = getAccessToken();
  const eventName = DEFAULT_EVENT_NAME;
  const eventId = `${lead.eventId}:${eventName}`;

  if (!pixelId || !accessToken) {
    return {
      sent: false,
      skipped: true,
      reason: "Meta CAPI nao configurado.",
      eventId,
      eventName,
    };
  }

  const userData = buildUserData(lead);
  if (!Object.keys(userData).length) {
    return {
      sent: false,
      skipped: true,
      reason: "Lead sem identificadores suficientes para envio ao Meta CAPI.",
      eventId,
      eventName,
    };
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor((lead.submittedAt || new Date()).getTime() / 1000),
        event_id: eventId,
        action_source: "system_generated",
        user_data: userData,
        custom_data: {
          value: 0,
          currency: "BRL",
          lead_source: lead.source || "meta_instant_form_google_sheet",
          form_id: lead.formId || undefined,
          company: lead.company || undefined,
        },
      },
    ],
    test_event_code: String(process.env.META_CAPI_TEST_EVENT_CODE || "").trim() || undefined,
  };

  const response = await fetch(`https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}/${pixelId}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (json as { error?: { message?: string } })?.error?.message ||
      `Meta CAPI ${response.status}: falha no envio do evento`;
    throw new Error(message);
  }

  return {
    sent: true,
    eventId,
    eventName,
    response: json,
  };
}
