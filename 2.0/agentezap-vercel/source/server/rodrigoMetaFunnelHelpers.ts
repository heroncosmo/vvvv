import type { MetaWhatsappAdsAttribution } from "./metaConversionsApi";
import { normalizePhoneToDigits } from "./phoneMatch";
import { buildBrazilWhatsAppPhoneVariants } from "./whatsappPhoneNumber";

const DEFAULT_QUALIFIED_LEAD_MIN_SCORE = 80;

function cleanText(value: unknown, maxLength = 512): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

export function isUsableRodrigoSubscriptionPhoneCandidateValue(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/^(sim|test|demo|mock|fake)[-_]/i.test(text)) return false;
  const digits = normalizePhoneToDigits(text);
  return digits.length >= 10;
}

function pushPhoneValue(target: unknown[], value: unknown): void {
  if (isUsableRodrigoSubscriptionPhoneCandidateValue(value)) {
    target.push(value);
  }
}

function collectMetadataPhoneValues(metadata: Record<string, any>): unknown[] {
  const values: unknown[] = [];
  const keys = [
    "phone",
    "phoneNumber",
    "phone_number",
    "telefone",
    "celular",
    "mobile",
    "whatsapp",
    "whatsappNumber",
    "whatsapp_number",
    "customerPhone",
    "customer_phone",
    "checkoutPhone",
    "checkout_phone",
    "payerPhone",
    "payer_phone",
    "contactPhone",
    "contact_phone",
    "leadPhone",
    "lead_phone",
  ];

  for (const key of keys) {
    pushPhoneValue(values, metadata?.[key]);
  }

  return values;
}

function collectPaymentPhoneValues(rawResponse: Record<string, any>): unknown[] {
  const values: unknown[] = [];
  const payerPhone = asRecord(asRecord(rawResponse?.payer).phone);
  const additionalPayerPhone = asRecord(asRecord(asRecord(rawResponse?.additional_info).payer).phone);

  for (const phone of [payerPhone, additionalPayerPhone]) {
    pushPhoneValue(values, phone.number);
    pushPhoneValue(values, phone.phoneNumber);
    pushPhoneValue(values, phone.phone_number);
    const areaCode = cleanText(phone.area_code || phone.areaCode, 8);
    const number = cleanText(phone.number || phone.phoneNumber || phone.phone_number, 32);
    if (areaCode && number) {
      pushPhoneValue(values, `${areaCode}${number}`);
    }
  }

  pushPhoneValue(values, rawResponse?.phone);
  pushPhoneValue(values, rawResponse?.phoneNumber);
  pushPhoneValue(values, rawResponse?.whatsapp);
  pushPhoneValue(values, rawResponse?.whatsappNumber);

  return values;
}

export function buildRodrigoSubscriptionPhoneCandidates(input: {
  phone?: unknown;
  whatsappNumber?: unknown;
  metadata?: Record<string, any> | null;
  paymentRawResponse?: Record<string, any> | null;
}, extraValues: unknown[] = []): string[] {
  const values = [
    input.phone,
    input.whatsappNumber,
    ...collectMetadataPhoneValues(asRecord(input.metadata)),
    ...collectPaymentPhoneValues(asRecord(input.paymentRawResponse)),
    ...extraValues,
  ];
  const candidates = new Set<string>();
  for (const value of values) {
    if (!isUsableRodrigoSubscriptionPhoneCandidateValue(value)) continue;
    const digits = normalizePhoneToDigits(String(value || ""));
    if (digits) {
      candidates.add(digits);
      candidates.add(`+${digits}`);
    }
    for (const variant of buildBrazilWhatsAppPhoneVariants(String(value || ""))) {
      candidates.add(variant);
      candidates.add(`+${variant}`);
    }
  }
  return Array.from(candidates).filter(Boolean);
}

export function normalizeRodrigoWhatsappAdsAttribution(input: unknown): MetaWhatsappAdsAttribution | null {
  const source = asRecord(input);
  const attribution: MetaWhatsappAdsAttribution = {
    ctwaClid: cleanText(source.ctwaClid ?? source.ctwa_clid, 1024),
    sourceId: cleanText(source.sourceId ?? source.source_id, 128),
    sourceUrl: cleanText(source.sourceUrl ?? source.source_url, 1024),
    sourceType: cleanText(source.sourceType ?? source.source_type, 64),
    title: cleanText(source.title ?? source.headline, 256),
    body: cleanText(source.body, 512),
    mediaType: cleanText(source.mediaType ?? source.media_type, 64),
    thumbnailUrl: cleanText(source.thumbnailUrl ?? source.thumbnail_url, 1024),
    capturedAt: cleanText(source.capturedAt ?? source.captured_at, 64),
    messageId: cleanText(source.messageId ?? source.message_id, 128),
  };

  return attribution.ctwaClid || attribution.sourceId || attribution.sourceUrl || attribution.sourceType
    ? attribution
    : null;
}

export function pickBestRodrigoWhatsappAdsAttribution(...candidates: Array<unknown>): MetaWhatsappAdsAttribution | null {
  const normalized = candidates
    .map((candidate) => normalizeRodrigoWhatsappAdsAttribution(candidate))
    .filter(Boolean) as MetaWhatsappAdsAttribution[];
  if (!normalized.length) return null;
  return normalized.find((candidate) => Boolean(candidate.ctwaClid)) || normalized[0];
}

export function buildRodrigoMetaFunnelEventKey(eventName: string, eventId: string): string {
  return `${String(eventName || "").trim()}:${String(eventId || "").trim()}`;
}

export function isRodrigoMetaFunnelRecordLinkedToSubscription(input: {
  eventKey?: unknown;
  eventRecord?: Record<string, any> | null;
  subscriptionId?: unknown;
}): boolean {
  const subscriptionId = cleanText(input.subscriptionId, 128);
  if (!subscriptionId) return false;

  const record = asRecord(input.eventRecord);
  const customData = asRecord(record.customData);
  if (
    cleanText(customData.subscription_id, 128) === subscriptionId ||
    cleanText(customData.subscriptionId, 128) === subscriptionId
  ) {
    return true;
  }

  const eventId = cleanText(record.eventId, 256);
  const eventKey = cleanText(input.eventKey, 384);
  const knownEventIds = new Set([
    `subscription:${subscriptionId}:initiate_checkout`,
    `subscription:${subscriptionId}:paid`,
  ]);
  if (eventId && knownEventIds.has(eventId)) return true;
  if (eventId?.startsWith(`subscription:${subscriptionId}:pix_pending_step_`)) return true;

  const knownEventKeys = new Set([
    buildRodrigoMetaFunnelEventKey("InitiateCheckout", `subscription:${subscriptionId}:initiate_checkout`),
    buildRodrigoMetaFunnelEventKey("Purchase", `subscription:${subscriptionId}:paid`),
  ]);
  if (eventKey && knownEventKeys.has(eventKey)) return true;
  return Boolean(eventKey?.startsWith(`LocalPixPendingLabel:subscription:${subscriptionId}:pix_pending_step_`));
}

export function hasRodrigoMetaFunnelSubscriptionEvidence(
  rawAnalysis: Record<string, any> | null | undefined,
  subscriptionId: unknown,
): boolean {
  const events = asRecord(asRecord(rawAnalysis).metaCapiFunnelEvents);
  return Object.entries(events).some(([eventKey, eventRecord]) =>
    isRodrigoMetaFunnelRecordLinkedToSubscription({
      eventKey,
      eventRecord: asRecord(eventRecord),
      subscriptionId,
    }),
  );
}

export function shouldSendRodrigoQualifiedLeadEvent(input: {
  isPotential?: boolean | null;
  potentialScore?: number | null;
  potentialGrade?: string | null;
}): boolean {
  const minScore = Math.max(
    1,
    Number(process.env.RODRIGO_META_QUALIFIED_LEAD_MIN_SCORE || DEFAULT_QUALIFIED_LEAD_MIN_SCORE),
  );
  const grade = String(input.potentialGrade || "").trim().toLowerCase();
  return Boolean(input.isPotential) && Number(input.potentialScore || 0) >= minScore && grade !== "descartar";
}
