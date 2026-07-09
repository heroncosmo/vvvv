import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  conversationLeadIntelligence,
  conversations,
  paymentHistory,
  plans,
  subscriptions,
  users,
  whatsappConnections,
} from "@shared/schema";
import { db, pool } from "./db";
import {
  hasMetaWhatsappClickIdAttribution,
  sendMetaWhatsappBusinessMessagingEvent,
  type MetaBusinessMessagingEventName,
  type MetaCapiResult,
  type MetaWhatsappAdsAttribution,
} from "./metaConversionsApi";
import {
  buildRodrigoSubscriptionPhoneCandidates,
  buildRodrigoMetaFunnelEventKey,
  hasRodrigoMetaFunnelSubscriptionEvidence,
  isUsableRodrigoSubscriptionPhoneCandidateValue,
  normalizeRodrigoWhatsappAdsAttribution,
  pickBestRodrigoWhatsappAdsAttribution,
  shouldSendRodrigoQualifiedLeadEvent,
} from "./rodrigoMetaFunnelHelpers";
import { normalizePhoneToDigits } from "./phoneMatch";

const RODRIGO_META_OWNER_EMAIL = "rodrigo4@gmail.com";
const RODRIGO_META_FUNNEL_VERSION = "rodrigo-meta-funnel-v1";
const PAID_PAYMENT_STATUSES = ["approved", "paid", "confirmed"];
const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "paid", "confirmed"];

export {
  buildRodrigoMetaFunnelEventKey,
  normalizeRodrigoWhatsappAdsAttribution,
  shouldSendRodrigoQualifiedLeadEvent,
} from "./rodrigoMetaFunnelHelpers";

type FunnelStatus = "sent" | "skipped" | "failed";
type ConversationMatchMethod = "conversation_id" | "referenced_conversation" | "subscription_event" | "phone_exact" | "phone_digits";

type FunnelEventRecord = {
  status: FunnelStatus;
  eventName: string;
  eventId: string;
  metaEventId?: string | null;
  reason?: string | null;
  error?: string | null;
  label?: unknown;
  customData?: Record<string, unknown>;
  recordedAt: string;
};

type ConversationMatch = {
  id: string;
  connectionId: string;
  ownerUserId: string;
  contactNumber: string;
  contactName: string | null;
  remoteJid: string | null;
  jidSuffix: string | null;
  rawAnalysis: Record<string, any>;
  matchMethod?: ConversationMatchMethod;
};

type SubscriptionLead = {
  subscriptionId: string;
  userId: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  paymentPayerEmail: string | null;
  planName: string | null;
  planValue: unknown;
  status: string | null;
  createdAt: Date | null;
  metadata: Record<string, any>;
  paymentRawResponse: Record<string, any>;
};

type SubscriptionBackfillRow = {
  subscriptionId: string;
  status: string | null;
  planValue: unknown;
  couponPrice: unknown;
  paymentHistoryId: string | null;
  mpPaymentId: string | null;
  paymentAmount: unknown;
};

type LeadBackfillRow = {
  conversationId: string;
  rawAnalysis: Record<string, any> | null;
  isPotential: boolean | null;
  potentialScore: unknown;
  potentialGrade: string | null;
  businessType: string | null;
  lastAnalyzedAt: Date | null;
  lastMessageTime: Date | null;
};

export type RodrigoMetaFunnelResult =
  | { recorded: true; eventName: string; eventId: string; meta?: MetaCapiResult; label?: unknown }
  | { recorded: false; skipped: string; eventName?: string; eventId?: string; label?: unknown; error?: string };

export type RodrigoMetaFunnelBackfillSummary = {
  success: true;
  ownerEmail: string;
  dryRun: boolean;
  hours: number;
  limit: number;
  inspected: number;
  withCtwaClid: number;
  qualifiedCandidates: number;
  lowQualityCandidates: number;
  neutralSkipped: number;
  missingCtwaClid: number;
  leadSent: number;
  leadAlreadyRecorded: number;
  leadSkipped: number;
  lowQualityLabelApplied: number;
  lowQualityAlreadyRecorded: number;
  lowQualityLabelSkipped: number;
  subscriptionsInspected: number;
  subscriptionMatchesWithCtwa: number;
  subscriptionMissingCtwaClid: number;
  subscriptionConversationNotFound: number;
  subscriptionNeutralSkipped: number;
  checkoutCandidates: number;
  checkoutSent: number;
  checkoutAlreadyRecorded: number;
  checkoutSkipped: number;
  purchaseCandidates: number;
  purchaseSent: number;
  purchaseAlreadyRecorded: number;
  purchaseSkipped: number;
  failed: number;
  failures: Array<{ conversationId?: string; subscriptionId?: string; step: string; reason: string }>;
};

type PaidLeadFollowupCleanupResult = {
  crmConversationsPaused: number;
  adminConversationsPaused: number;
  ownerNotificationsSkipped: number;
  pixRecoveryMessagesSkipped: number;
  phoneDigits: string[];
};

function cleanText(value: unknown, maxLength = 512): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function normalizeDigits(value: unknown): string {
  return normalizePhoneToDigits(String(value || ""));
}

function buildPaidLeadFollowupPhoneDigits(
  lead: SubscriptionLead,
  conversation?: ConversationMatch | null,
): string[] {
  const candidates = buildRodrigoSubscriptionPhoneCandidates(lead, [
    conversation?.contactNumber || "",
    conversation?.remoteJid || "",
  ]);
  for (const value of [
    lead.phone,
    lead.whatsappNumber,
    conversation?.contactNumber,
    conversation?.remoteJid,
  ]) {
    const digits = normalizeDigits(value);
    if (digits) candidates.push(digits);
  }
  return Array.from(new Set(candidates.map(normalizeDigits).filter(Boolean)));
}

function queryRowCount(result: unknown): number {
  const value = Number((result as any)?.rowCount ?? (result as any)?.rows?.length ?? 0);
  return Number.isFinite(value) ? value : 0;
}

async function skipOptionalPaidLeadPixRecoveryMessages(subscriptionId: string): Promise<number> {
  try {
    const result = await pool.query(
      `
        UPDATE admin_pix_recovery_messages
        SET status = 'skipped',
            error = 'skipped_payment_already_recorded',
            updated_at = NOW()
        WHERE subscription_id = $1
          AND status IN ('pending', 'processing', 'failed')
      `,
      [subscriptionId],
    );
    return result.rowCount || 0;
  } catch (error: any) {
    if (error?.code === "42P01") return 0;
    throw error;
  }
}

async function skipOptionalPaidLeadOwnerNotifications(params: {
  lead: SubscriptionLead;
  phoneDigits: string[];
  reason: string;
}): Promise<number> {
  try {
    const result = await pool.query(
      `
        UPDATE owner_scheduled_notifications osn
        SET status = 'skipped_active_plan',
            error_message = $5,
            sent_at = NULL,
            updated_at = NOW()
        FROM users owner_user
        WHERE osn.owner_user_id = owner_user.id
          AND LOWER(owner_user.email) = LOWER($1)
          AND osn.notification_type IN ('payment_reminder', 'overdue_reminder')
          AND osn.status IN ('pending', 'processing', 'failed')
          AND (
            osn.user_id = $2
            OR COALESCE(osn.metadata->>'subscriptionId', osn.metadata->>'subscription_id') = $3
            OR (
              $4::text[] IS NOT NULL
              AND regexp_replace(COALESCE(osn.recipient_phone, ''), '\\D', '', 'g') = ANY($4::text[])
            )
          )
      `,
      [
        RODRIGO_META_OWNER_EMAIL,
        params.lead.userId,
        params.lead.subscriptionId,
        params.phoneDigits.length ? params.phoneDigits : null,
        params.reason,
      ],
    );
    return queryRowCount(result);
  } catch (error: any) {
    if (error?.code === "42P01") return 0;
    throw error;
  }
}

async function cleanupRodrigoPaidLeadFollowup(params: {
  lead: SubscriptionLead;
  conversation?: ConversationMatch | null;
  paymentId?: string | null;
}): Promise<PaidLeadFollowupCleanupResult> {
  const reason = "Pagamento aprovado - follow-up pausado automaticamente.";
  const phoneDigits = buildPaidLeadFollowupPhoneDigits(params.lead, params.conversation);

  const crmResult = params.conversation?.id
    ? await pool.query(
        `
          UPDATE conversations
          SET followup_active = false,
              followup_stage = 0,
              next_followup_at = NULL,
              followup_disabled_reason = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
        [params.conversation.id, reason],
      )
    : null;

  const adminResult = await pool.query(
    `
      UPDATE admin_conversations ac
      SET payment_status = 'paid',
          followup_for_non_payers = false,
          followup_active = false,
          followup_stage = 0,
          next_followup_at = NULL,
          updated_at = NOW()
      FROM admins a
      WHERE ac.admin_id = a.id
        AND LOWER(a.email) = LOWER($1)
        AND (
          ac.linked_user_id = $2
          OR (
            $3::text[] IS NOT NULL
            AND regexp_replace(COALESCE(ac.contact_number, ''), '\\D', '', 'g') = ANY($3::text[])
          )
        )
    `,
    [RODRIGO_META_OWNER_EMAIL, params.lead.userId, phoneDigits.length ? phoneDigits : null],
  );

  const ownerNotificationsSkipped = await skipOptionalPaidLeadOwnerNotifications({
    lead: params.lead,
    phoneDigits,
    reason,
  });
  const pixRecoveryMessagesSkipped = await skipOptionalPaidLeadPixRecoveryMessages(params.lead.subscriptionId);

  const summary = {
    crmConversationsPaused: queryRowCount(crmResult),
    adminConversationsPaused: queryRowCount(adminResult),
    ownerNotificationsSkipped,
    pixRecoveryMessagesSkipped,
    phoneDigits,
  };

  console.log("[Rodrigo Paid Lead] Follow-up cleanup after approved payment", {
    subscriptionId: params.lead.subscriptionId,
    paymentId: params.paymentId || null,
    crmConversationsPaused: summary.crmConversationsPaused,
    adminConversationsPaused: summary.adminConversationsPaused,
    ownerNotificationsSkipped: summary.ownerNotificationsSkipped,
    pixRecoveryMessagesSkipped: summary.pixRecoveryMessagesSkipped,
    phoneDigitsCount: summary.phoneDigits.length,
  });

  return summary;
}

export async function cleanupRodrigoPaidLeadFollowupFromSubscription(params: {
  subscriptionId: string;
  paymentId?: string | null;
}): Promise<PaidLeadFollowupCleanupResult | null> {
  const subscriptionId = cleanText(params.subscriptionId, 128);
  if (!subscriptionId) return null;
  const lead = await loadSubscriptionLead(subscriptionId);
  if (!lead) return null;
  const conversation = await findRodrigoConversationBySubscription(lead);
  return cleanupRodrigoPaidLeadFollowup({
    lead,
    conversation,
    paymentId: params.paymentId || null,
  });
}


function getFunnelEvents(rawAnalysis: Record<string, any>): Record<string, FunnelEventRecord> {
  return asRecord(rawAnalysis.metaCapiFunnelEvents) as Record<string, FunnelEventRecord>;
}

function mergeFunnelEventRecord(
  rawAnalysis: Record<string, any>,
  eventKey: string,
  record: FunnelEventRecord,
): Record<string, any> {
  return {
    ...rawAnalysis,
    metaCapiFunnelEvents: {
      ...getFunnelEvents(rawAnalysis),
      [eventKey]: record,
    },
  };
}


function parseMoney(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isPaidSubscriptionBackfillCandidate(row: Pick<SubscriptionBackfillRow, "status" | "paymentHistoryId" | "planValue" | "couponPrice" | "paymentAmount">): boolean {
  const status = normalizeStatus(row.status);
  const value = getSubscriptionBackfillValue(row);
  return value > 0 && (Boolean(row.paymentHistoryId) || status === "active" || status === "paid" || status === "confirmed");
}

function isCheckoutSubscriptionBackfillCandidate(row: Pick<SubscriptionBackfillRow, "status" | "paymentHistoryId">): boolean {
  return !row.paymentHistoryId && normalizeStatus(row.status) === "pending_pix";
}

function getSubscriptionBackfillValue(row: Pick<SubscriptionBackfillRow, "paymentAmount" | "couponPrice" | "planValue">): number {
  return parseMoney(row.paymentAmount) || parseMoney(row.couponPrice) || parseMoney(row.planValue);
}

function getSubscriptionBackfillPaymentId(row: Pick<SubscriptionBackfillRow, "mpPaymentId" | "paymentHistoryId">): string | null {
  return cleanText(row.mpPaymentId, 128) || cleanText(row.paymentHistoryId, 128);
}

async function getRodrigoOwnerUserId(): Promise<string | null> {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, RODRIGO_META_OWNER_EMAIL))
    .limit(1);
  return owner?.id || null;
}

async function loadSubscriptionLead(subscriptionId: string): Promise<SubscriptionLead | null> {
  const [row] = await db
    .select({
      subscriptionId: subscriptions.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      whatsappNumber: users.whatsappNumber,
      planName: plans.nome,
      planValue: plans.valor,
      status: subscriptions.status,
      createdAt: subscriptions.createdAt,
      metadata: subscriptions.metadata,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.id, subscriptionId))
    .limit(1);

  if (!row?.subscriptionId) return null;
  const [latestPayment] = await db
    .select({
      payerEmail: paymentHistory.payerEmail,
      rawResponse: paymentHistory.rawResponse,
    })
    .from(paymentHistory)
    .where(eq(paymentHistory.subscriptionId, subscriptionId))
    .orderBy(desc(paymentHistory.paymentDate), desc(paymentHistory.updatedAt), desc(paymentHistory.createdAt))
    .limit(1);

  return {
    ...row,
    metadata: asRecord(row.metadata),
    paymentPayerEmail: latestPayment?.payerEmail || null,
    paymentRawResponse: asRecord(latestPayment?.rawResponse),
  };
}

async function loadBuyerConnectionPhoneValues(userId: string): Promise<string[]> {
  const rows = await db
    .select({ phoneNumber: whatsappConnections.phoneNumber })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.userId, userId))
    .orderBy(desc(whatsappConnections.isConnected), desc(whatsappConnections.updatedAt))
    .limit(20);

  return rows.map((row) => row.phoneNumber || "").filter((value) => isUsableRodrigoSubscriptionPhoneCandidateValue(value));
}

function collectReferencedConversationIds(...records: Array<Record<string, any> | null | undefined>): string[] {
  const ids = new Set<string>();
  const keys = [
    "conversationId",
    "conversation_id",
    "crmConversationId",
    "crm_conversation_id",
    "adminConversationId",
    "admin_conversation_id",
    "supportConversationId",
    "support_conversation_id",
    "receiptConversationId",
    "receipt_conversation_id",
  ];

  const visit = (record: Record<string, any> | null | undefined) => {
    if (!record || typeof record !== "object") return;
    for (const key of keys) {
      const value = cleanText(record[key], 128);
      if (value) ids.add(value);
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        visit(value as Record<string, any>);
      }
    }
  };

  for (const record of records) visit(record);
  return Array.from(ids);
}

async function loadReferencedConversationPhoneValues(lead: SubscriptionLead): Promise<string[]> {
  const conversationIds = collectReferencedConversationIds(lead.metadata, lead.paymentRawResponse);
  if (!conversationIds.length) return [];

  const rows = await db
    .select({ contactNumber: conversations.contactNumber })
    .from(conversations)
    .where(inArray(conversations.id, conversationIds))
    .limit(20);

  return rows
    .map((row) => row.contactNumber || "")
    .filter((value) => isUsableRodrigoSubscriptionPhoneCandidateValue(value));
}

function conversationHasCtwaClickId(row: { rawAnalysis?: unknown }): boolean {
  const rawAnalysis = asRecord(row.rawAnalysis);
  const attribution = pickBestRodrigoWhatsappAdsAttribution(rawAnalysis.whatsappAdsAttribution);
  return hasMetaWhatsappClickIdAttribution(attribution);
}

async function findReferencedRodrigoConversationBySubscription(
  lead: SubscriptionLead,
  ownerUserId: string,
  connectionIds: string[],
): Promise<ConversationMatch | null> {
  const conversationIds = collectReferencedConversationIds(lead.metadata, lead.paymentRawResponse);
  if (!conversationIds.length) return null;

  const rows = await db
    .select({
      id: conversations.id,
      connectionId: conversations.connectionId,
      contactNumber: conversations.contactNumber,
      contactName: conversations.contactName,
      remoteJid: conversations.remoteJid,
      jidSuffix: conversations.jidSuffix,
      rawAnalysis: conversationLeadIntelligence.rawAnalysis,
    })
    .from(conversations)
    .leftJoin(conversationLeadIntelligence, eq(conversationLeadIntelligence.conversationId, conversations.id))
    .where(and(inArray(conversations.connectionId, connectionIds), inArray(conversations.id, conversationIds)))
    .limit(50);

  for (const conversationId of conversationIds) {
    const row = rows.find((candidate) => candidate.id === conversationId);
    if (row && conversationHasCtwaClickId(row)) {
      return {
        ...row,
        ownerUserId,
        rawAnalysis: asRecord(row.rawAnalysis),
        matchMethod: "referenced_conversation",
      };
    }
  }

  return null;
}

async function findRodrigoConversationByRecordedSubscriptionEvent(
  lead: SubscriptionLead,
  ownerUserId: string,
  connectionIds: string[],
): Promise<ConversationMatch | null> {
  const rows = await db
    .select({
      id: conversations.id,
      connectionId: conversations.connectionId,
      contactNumber: conversations.contactNumber,
      contactName: conversations.contactName,
      remoteJid: conversations.remoteJid,
      jidSuffix: conversations.jidSuffix,
      rawAnalysis: conversationLeadIntelligence.rawAnalysis,
    })
    .from(conversations)
    .leftJoin(conversationLeadIntelligence, eq(conversationLeadIntelligence.conversationId, conversations.id))
    .where(inArray(conversations.connectionId, connectionIds))
    .orderBy(desc(conversations.lastMessageTime), desc(conversations.updatedAt))
    .limit(5000);

  const row = rows.find((candidate) => {
    const rawAnalysis = asRecord(candidate.rawAnalysis);
    return (
      hasRodrigoMetaFunnelSubscriptionEvidence(rawAnalysis, lead.subscriptionId) &&
      conversationHasCtwaClickId(candidate)
    );
  });

  return row
    ? {
        ...row,
        ownerUserId,
        rawAnalysis: asRecord(row.rawAnalysis),
        matchMethod: "subscription_event",
      }
    : null;
}

async function findRodrigoConversationBySubscription(lead: SubscriptionLead): Promise<ConversationMatch | null> {
  const ownerUserId = await getRodrigoOwnerUserId();
  if (!ownerUserId) return null;

  const ownerConnections = await db
    .select({ id: whatsappConnections.id })
    .from(whatsappConnections)
    .where(and(eq(whatsappConnections.userId, ownerUserId), eq(whatsappConnections.isConnected, true)))
    .orderBy(desc(whatsappConnections.updatedAt));
  const connectionIds = ownerConnections.map((connection) => connection.id);
  if (!connectionIds.length) return null;

  const referencedConversation = await findReferencedRodrigoConversationBySubscription(lead, ownerUserId, connectionIds);
  if (referencedConversation) return referencedConversation;

  const recordedSubscriptionConversation = await findRodrigoConversationByRecordedSubscriptionEvent(lead, ownerUserId, connectionIds);
  if (recordedSubscriptionConversation) return recordedSubscriptionConversation;

  const buyerConnectionPhoneValues = await loadBuyerConnectionPhoneValues(lead.userId);
  const referencedConversationPhoneValues = await loadReferencedConversationPhoneValues(lead);
  const phoneCandidates = buildRodrigoSubscriptionPhoneCandidates(lead, [
    ...buyerConnectionPhoneValues,
    ...referencedConversationPhoneValues,
  ]);
  if (!phoneCandidates.length) return null;

  const exactRows = await db
    .select({
      id: conversations.id,
      connectionId: conversations.connectionId,
      contactNumber: conversations.contactNumber,
      contactName: conversations.contactName,
      remoteJid: conversations.remoteJid,
      jidSuffix: conversations.jidSuffix,
      rawAnalysis: conversationLeadIntelligence.rawAnalysis,
    })
    .from(conversations)
    .leftJoin(conversationLeadIntelligence, eq(conversationLeadIntelligence.conversationId, conversations.id))
    .where(and(inArray(conversations.connectionId, connectionIds), inArray(conversations.contactNumber, phoneCandidates)))
    .orderBy(desc(conversations.lastMessageTime), desc(conversations.updatedAt))
    .limit(1);

  const row = exactRows[0] || null;
  if (row) {
    return { ...row, ownerUserId, rawAnalysis: asRecord(row.rawAnalysis), matchMethod: "phone_exact" };
  }

  const candidateDigits = new Set(phoneCandidates.map(normalizeDigits).filter(Boolean));
  const recentRows = await db
    .select({
      id: conversations.id,
      connectionId: conversations.connectionId,
      contactNumber: conversations.contactNumber,
      contactName: conversations.contactName,
      remoteJid: conversations.remoteJid,
      jidSuffix: conversations.jidSuffix,
      rawAnalysis: conversationLeadIntelligence.rawAnalysis,
    })
    .from(conversations)
    .leftJoin(conversationLeadIntelligence, eq(conversationLeadIntelligence.conversationId, conversations.id))
    .where(inArray(conversations.connectionId, connectionIds))
    .orderBy(desc(conversations.lastMessageTime), desc(conversations.updatedAt))
    .limit(2000);

  const fallback = recentRows.find((candidate) => {
    const contactDigits = normalizeDigits(candidate.contactNumber);
    const jidDigits = normalizeDigits(candidate.remoteJid);
    return (contactDigits && candidateDigits.has(contactDigits)) || (jidDigits && candidateDigits.has(jidDigits));
  });

  return fallback
    ? { ...fallback, ownerUserId, rawAnalysis: asRecord(fallback.rawAnalysis), matchMethod: "phone_digits" }
    : null;
}

async function findRodrigoConversationById(conversationId: string): Promise<ConversationMatch | null> {
  const [row] = await db
    .select({
      id: conversations.id,
      connectionId: conversations.connectionId,
      contactNumber: conversations.contactNumber,
      contactName: conversations.contactName,
      remoteJid: conversations.remoteJid,
      jidSuffix: conversations.jidSuffix,
      ownerUserId: users.id,
      ownerEmail: users.email,
      rawAnalysis: conversationLeadIntelligence.rawAnalysis,
    })
    .from(conversations)
    .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
    .innerJoin(users, eq(users.id, whatsappConnections.userId))
    .leftJoin(conversationLeadIntelligence, eq(conversationLeadIntelligence.conversationId, conversations.id))
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!row || row.ownerEmail !== RODRIGO_META_OWNER_EMAIL) return null;
  return { ...row, rawAnalysis: asRecord(row.rawAnalysis), matchMethod: "conversation_id" };
}

function getRodrigoMetaAttributionMetadata(metadata: Record<string, any>): Record<string, any> {
  const camel = asRecord(metadata.rodrigoMetaAttribution);
  if (Object.keys(camel).length) return camel;
  return asRecord(metadata.rodrigo_meta_attribution);
}

async function persistRodrigoMetaSubscriptionAttribution(params: {
  lead: SubscriptionLead;
  conversation: ConversationMatch;
  eventName: string;
}): Promise<void> {
  const attribution = pickBestRodrigoWhatsappAdsAttribution(params.conversation.rawAnalysis.whatsappAdsAttribution);
  if (!hasMetaWhatsappClickIdAttribution(attribution)) return;

  const existing = getRodrigoMetaAttributionMetadata(params.lead.metadata);
  const existingCtwaClid = cleanText(existing.ctwaClid ?? existing.ctwa_clid, 1024);
  const ctwaClid = cleanText(attribution?.ctwaClid, 1024);
  if (existingCtwaClid && existingCtwaClid !== ctwaClid) {
    return;
  }

  const now = new Date().toISOString();
  const nextAttribution = {
    ...existing,
    source: "rodrigo_whatsapp_business_messaging",
    conversationId: params.conversation.id,
    connectionId: params.conversation.connectionId,
    contactNumber: params.conversation.contactNumber || null,
    contactName: params.conversation.contactName || null,
    ctwaClid,
    sourceId: attribution?.sourceId || null,
    sourceUrl: attribution?.sourceUrl || null,
    sourceType: attribution?.sourceType || null,
    capturedAt: attribution?.capturedAt || null,
    messageId: attribution?.messageId || null,
    firstLinkedAt: cleanText(existing.firstLinkedAt ?? existing.linkedAt, 64) || now,
    lastLinkedAt: now,
    linkedByEventName: params.eventName,
    matchMethod: params.conversation.matchMethod || null,
    version: RODRIGO_META_FUNNEL_VERSION,
  };

  const nextMetadata = {
    ...params.lead.metadata,
    rodrigoMetaAttribution: nextAttribution,
  };

  await db
    .update(subscriptions)
    .set({
      metadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, params.lead.subscriptionId));

  params.lead.metadata = nextMetadata;
}

function isExistingCustomerCheckoutMetadata(metadata: Record<string, any>): boolean {
  const checkoutMode = String(metadata.checkoutMode || "").trim().toLowerCase();
  const checkoutTargetSubscriptionId = cleanText(metadata.checkoutTargetSubscriptionId ?? metadata.targetSubscriptionId, 128);
  const checkoutProration = asRecord(metadata.checkoutProration);
  const prorationSourceSubscriptionId = cleanText(checkoutProration.sourceSubscriptionId, 128);
  return checkoutMode === "addon_upsell" || Boolean(checkoutTargetSubscriptionId || prorationSourceSubscriptionId);
}

async function shouldReportRodrigoPurchaseForSubscription(lead: SubscriptionLead): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (isExistingCustomerCheckoutMetadata(lead.metadata)) {
    return { allowed: false, reason: "existing_customer_checkout" };
  }

  const priorPaymentsByUser = await db
    .select({ id: paymentHistory.id })
    .from(paymentHistory)
    .where(and(
      eq(paymentHistory.userId, lead.userId),
      inArray(paymentHistory.status, PAID_PAYMENT_STATUSES),
      sql`${paymentHistory.subscriptionId} <> ${lead.subscriptionId}`,
    ))
    .limit(1);
  if (priorPaymentsByUser[0]) {
    return { allowed: false, reason: "existing_paid_customer" };
  }

  const priorSubscriptionsByUser = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(
      eq(subscriptions.userId, lead.userId),
      inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
      sql`${subscriptions.id} <> ${lead.subscriptionId}`,
    ))
    .limit(1);
  if (priorSubscriptionsByUser[0]) {
    return { allowed: false, reason: "existing_active_subscription" };
  }

  const email = cleanText(lead.email || lead.paymentPayerEmail, 255);
  if (email) {
    const priorPaymentsByEmail = await db
      .select({ id: paymentHistory.id })
      .from(paymentHistory)
      .leftJoin(users, eq(users.id, paymentHistory.userId))
      .where(and(
        inArray(paymentHistory.status, PAID_PAYMENT_STATUSES),
        sql`${paymentHistory.subscriptionId} <> ${lead.subscriptionId}`,
        sql`lower(coalesce(${paymentHistory.payerEmail}, ${users.email}, '')) = lower(${email})`,
      ))
      .limit(1);
    if (priorPaymentsByEmail[0]) {
      return { allowed: false, reason: "existing_paid_email" };
    }
  }

  return { allowed: true };
}

async function saveFunnelRecord(
  conversation: ConversationMatch,
  eventKey: string,
  record: FunnelEventRecord,
): Promise<void> {
  const nextRawAnalysis = mergeFunnelEventRecord(conversation.rawAnalysis, eventKey, record);
  await db
    .insert(conversationLeadIntelligence)
    .values({
      conversationId: conversation.id,
      connectionId: conversation.connectionId,
      userId: conversation.ownerUserId,
      contactNumber: conversation.contactNumber,
      contactName: conversation.contactName || null,
      rawAnalysis: nextRawAnalysis,
      analysisVersion: RODRIGO_META_FUNNEL_VERSION,
    })
    .onConflictDoUpdate({
      target: conversationLeadIntelligence.conversationId,
      set: {
        rawAnalysis: nextRawAnalysis,
        updatedAt: new Date(),
      },
    });
}

async function applyNativeLabelBestEffort(
  conversation: ConversationMatch,
  labelName: string | null | undefined,
  labelId: string,
  color: number,
): Promise<unknown> {
  const cleanName = String(labelName || "").trim();
  if (!cleanName) return null;

  try {
    const { applyNativeWhatsappChatLabel } = await import("./whatsapp");
    return await applyNativeWhatsappChatLabel({
      connectionId: conversation.connectionId,
      userId: conversation.ownerUserId,
      remoteJid: conversation.remoteJid,
      contactNumber: conversation.contactNumber,
      jidSuffix: conversation.jidSuffix,
      labelId,
      labelName: cleanName,
      color,
    });
  } catch (error) {
    return {
      applied: false,
      skipped: "native_label_import_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function sendAndRecordFunnelEvent(params: {
  conversation: ConversationMatch;
  eventName: MetaBusinessMessagingEventName;
  eventId: string;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  value?: number | null;
  currency?: string | null;
  contentName?: string | null;
  source: string;
  customData?: Record<string, unknown>;
  labelName?: string | null;
  labelId?: string;
  labelColor?: number;
}): Promise<RodrigoMetaFunnelResult> {
  const eventKey = buildRodrigoMetaFunnelEventKey(params.eventName, params.eventId);
  const previous = getFunnelEvents(params.conversation.rawAnalysis)[eventKey];
  const attribution = pickBestRodrigoWhatsappAdsAttribution(params.conversation.rawAnalysis.whatsappAdsAttribution);
  const customData = params.customData ? { ...params.customData } : undefined;
  if (!hasMetaWhatsappClickIdAttribution(attribution)) {
    await saveFunnelRecord(params.conversation, eventKey, {
      status: "skipped",
      eventName: params.eventName,
      eventId: params.eventId,
      reason: "missing_ctwa_clid",
      ...(customData ? { customData } : {}),
      recordedAt: new Date().toISOString(),
    });
    return { recorded: false, skipped: "missing_ctwa_clid", eventName: params.eventName, eventId: params.eventId };
  }

  const label = await applyNativeLabelBestEffort(
    params.conversation,
    params.labelName,
    params.labelId || `agentezap_${params.eventName}`,
    params.labelColor ?? 0,
  );

  if (previous?.status === "sent") {
    return { recorded: false, skipped: "already_sent", eventName: params.eventName, eventId: params.eventId, label };
  }

  try {
    const meta = await sendMetaWhatsappBusinessMessagingEvent({
      eventName: params.eventName,
      eventId: params.eventId,
      phone: params.phone || params.conversation.contactNumber,
      email: params.email || null,
      name: params.name || params.conversation.contactName,
      submittedAt: new Date(),
      value: params.value ?? 0,
      currency: params.currency || "BRL",
      contentName: params.contentName || null,
      subscriptionId: cleanText(params.customData?.subscription_id, 128),
      source: params.source,
      whatsappAdsAttribution: attribution,
      customData: {
        conversation_id: params.conversation.id,
        connection_id: params.conversation.connectionId,
        ...(params.customData || {}),
      },
    });

    await saveFunnelRecord(params.conversation, eventKey, {
      status: meta.sent ? "sent" : "skipped",
      eventName: params.eventName,
      eventId: params.eventId,
      metaEventId: meta.eventId,
      reason: "reason" in meta ? meta.reason : null,
      label,
      ...(customData ? { customData } : {}),
      recordedAt: new Date().toISOString(),
    });
    return { recorded: true, eventName: params.eventName, eventId: params.eventId, meta, label };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await saveFunnelRecord(params.conversation, eventKey, {
      status: "failed",
      eventName: params.eventName,
      eventId: params.eventId,
      error: message,
      label,
      ...(customData ? { customData } : {}),
      recordedAt: new Date().toISOString(),
    });
    return { recorded: false, skipped: "meta_capi_failed", eventName: params.eventName, eventId: params.eventId, label, error: message };
  }
}

async function recordLocalFunnelLabel(params: {
  conversation: ConversationMatch;
  eventName: string;
  eventId: string;
  reason: string;
  customData?: Record<string, unknown>;
  labelName: string;
  labelId: string;
  labelColor: number;
}): Promise<RodrigoMetaFunnelResult> {
  const eventKey = buildRodrigoMetaFunnelEventKey(params.eventName, params.eventId);
  const previous = getFunnelEvents(params.conversation.rawAnalysis)[eventKey];
  const label = await applyNativeLabelBestEffort(
    params.conversation,
    params.labelName,
    params.labelId,
    params.labelColor,
  );

  if (previous?.status === "sent") {
    return { recorded: false, skipped: "already_labeled", eventName: params.eventName, eventId: params.eventId, label };
  }

  const labelDetails = asRecord(label);
  const labelApplied = labelDetails.applied === true;
  const labelSkippedReason = cleanText(labelDetails.skipped, 128) || "native_label_not_applied";

  await saveFunnelRecord(params.conversation, eventKey, {
    status: labelApplied ? "sent" : "skipped",
    eventName: params.eventName,
    eventId: params.eventId,
    reason: labelApplied ? params.reason : `${params.reason}:${labelSkippedReason}`,
    label,
    recordedAt: new Date().toISOString(),
    ...(params.customData ? { customData: params.customData } : {}),
  });

  if (!labelApplied) {
    return {
      recorded: false,
      skipped: labelSkippedReason,
      eventName: params.eventName,
      eventId: params.eventId,
      label,
    };
  }

  return { recorded: true, eventName: params.eventName, eventId: params.eventId, label };
}

export async function recordRodrigoWhatsappQualifiedLeadFromConversation(params: {
  conversationId: string;
  isPotential: boolean;
  potentialScore: number;
  potentialGrade?: string | null;
  businessType?: string | null;
}): Promise<RodrigoMetaFunnelResult> {
  if (!shouldSendRodrigoQualifiedLeadEvent(params)) {
    return { recorded: false, skipped: "not_qualified" };
  }

  const conversation = await findRodrigoConversationById(params.conversationId);
  if (!conversation) return { recorded: false, skipped: "conversation_not_found_or_not_rodrigo" };

  return sendAndRecordFunnelEvent({
    conversation,
    eventName: "LeadSubmitted",
    eventId: `conversation:${params.conversationId}:lead_submitted`,
    source: "rodrigo_whatsapp_qualified_lead",
    value: 0,
    contentName: "Lead qualificado WhatsApp",
    labelName: "Qualificado",
    labelId: "agentezap_qualificado",
    labelColor: 2,
    customData: {
      potential_score: params.potentialScore,
      potential_grade: params.potentialGrade || null,
      business_type: params.businessType || null,
    },
  });
}

export async function recordRodrigoWhatsappLowQualityLeadLabelFromConversation(params: {
  conversationId: string;
  isPotential: boolean;
  potentialScore: number;
  potentialGrade?: string | null;
  businessType?: string | null;
}): Promise<RodrigoMetaFunnelResult> {
  const grade = String(params.potentialGrade || "").trim().toLowerCase();
  const isLowQuality =
    !params.isPotential ||
    Number(params.potentialScore || 0) < 45 ||
    grade === "descartar";
  if (!isLowQuality) {
    return { recorded: false, skipped: "not_low_quality" };
  }

  const conversation = await findRodrigoConversationById(params.conversationId);
  if (!conversation) return { recorded: false, skipped: "conversation_not_found_or_not_rodrigo" };

  const attribution = pickBestRodrigoWhatsappAdsAttribution(conversation.rawAnalysis.whatsappAdsAttribution);
  if (!hasMetaWhatsappClickIdAttribution(attribution)) {
    return { recorded: false, skipped: "missing_ctwa_clid" };
  }

  return recordLocalFunnelLabel({
    conversation,
    eventName: "LocalLowQualityLeadLabel",
    eventId: `conversation:${params.conversationId}:low_quality`,
    reason: "local_label_only_not_meta_conversion",
    labelName: "Baixa qualidade",
    labelId: "agentezap_baixa_qualidade",
    labelColor: 14,
    customData: {
      potential_score: params.potentialScore,
      potential_grade: params.potentialGrade || null,
      business_type: params.businessType || null,
    },
  });
}

async function recordSubscriptionFunnelEvent(params: {
  subscriptionId: string;
  eventName: MetaBusinessMessagingEventName;
  eventIdSuffix: string;
  value?: number | null;
  source: string;
  labelName?: string | null;
  labelId: string;
  labelColor: number;
  customData?: Record<string, unknown>;
}): Promise<RodrigoMetaFunnelResult> {
  const lead = await loadSubscriptionLead(params.subscriptionId);
  if (!lead) return { recorded: false, skipped: "subscription_not_found" };

  const eventId = `subscription:${params.subscriptionId}:${params.eventIdSuffix}`;
  const conversation = await findRodrigoConversationBySubscription(lead);
  if (params.eventName === "Purchase") {
    const purchaseGuard = await shouldReportRodrigoPurchaseForSubscription(lead);
    if (!purchaseGuard.allowed) {
      return {
        recorded: false,
        skipped: purchaseGuard.reason,
        eventName: params.eventName,
        eventId,
      };
    }
  }

  if (!conversation) return { recorded: false, skipped: "rodrigo_conversation_not_found" };
  await persistRodrigoMetaSubscriptionAttribution({
    lead,
    conversation,
    eventName: params.eventName,
  });

  const value = params.value ?? parseMoney(lead.planValue);
  return sendAndRecordFunnelEvent({
    conversation,
    eventName: params.eventName,
    eventId,
    phone: lead.phone || lead.whatsappNumber,
    email: lead.email || lead.paymentPayerEmail,
    name: lead.name,
    value,
    currency: "BRL",
    contentName: lead.planName || "Assinatura AgenteZap",
    source: params.source,
    labelName: params.labelName,
    labelId: params.labelId,
    labelColor: params.labelColor,
    customData: {
      subscription_id: params.subscriptionId,
      plan_name: lead.planName || null,
      ...(params.customData || {}),
    },
  });
}

export function recordRodrigoWhatsappInitiateCheckoutFromSubscription(params: {
  subscriptionId: string;
  value?: number | null;
  pixProvider?: string | null;
  paymentId?: string | null;
}): Promise<RodrigoMetaFunnelResult> {
  return recordSubscriptionFunnelEvent({
    subscriptionId: params.subscriptionId,
    eventName: "InitiateCheckout",
    eventIdSuffix: "initiate_checkout",
    value: params.value,
    source: "rodrigo_whatsapp_pix_checkout",
    labelName: "Pix enviado",
    labelId: "agentezap_pix_enviado",
    labelColor: 13,
    customData: {
      pix_provider: params.pixProvider || null,
      payment_id: params.paymentId || null,
    },
  });
}

export function recordRodrigoWhatsappPurchaseFromSubscription(params: {
  subscriptionId: string;
  value?: number | null;
  paymentId?: string | null;
}): Promise<RodrigoMetaFunnelResult> {
  return recordSubscriptionFunnelEvent({
    subscriptionId: params.subscriptionId,
    eventName: "Purchase",
    eventIdSuffix: "paid",
    value: params.value,
    source: "rodrigo_whatsapp_paid_subscription",
    labelName: "Pago",
    labelId: "agentezap_pago",
    labelColor: 2,
    customData: {
      payment_id: params.paymentId || null,
    },
  });
}

export async function recordRodrigoWhatsappPendingPixLabelFromSubscription(params: {
  subscriptionId: string;
  step?: number | null;
  value?: number | null;
  paymentId?: string | null;
}): Promise<RodrigoMetaFunnelResult> {
  const lead = await loadSubscriptionLead(params.subscriptionId);
  if (!lead) return { recorded: false, skipped: "subscription_not_found" };

  const conversation = await findRodrigoConversationBySubscription(lead);
  if (!conversation) return { recorded: false, skipped: "rodrigo_conversation_not_found" };
  await persistRodrigoMetaSubscriptionAttribution({
    lead,
    conversation,
    eventName: "LocalPixPendingLabel",
  });

  const step = Number(params.step || 1);
  return recordLocalFunnelLabel({
    conversation,
    eventName: "LocalPixPendingLabel",
    eventId: `subscription:${params.subscriptionId}:pix_pending_step_${Number.isFinite(step) ? step : 1}`,
    reason: "local_label_only_not_meta_conversion",
    labelName: "Pix pendente",
    labelId: "agentezap_pix_pendente",
    labelColor: 14,
    customData: {
      subscription_id: params.subscriptionId,
      plan_name: lead.planName || null,
      value: params.value ?? parseMoney(lead.planValue),
      recovery_step: Number.isFinite(step) ? step : 1,
      payment_id: params.paymentId || null,
    },
  });
}

async function loadRecentSubscriptionBackfillRows(since: Date, limit: number): Promise<SubscriptionBackfillRow[]> {
  const rows = await db
    .select({
      subscriptionId: subscriptions.id,
      status: subscriptions.status,
      planValue: plans.valor,
      couponPrice: subscriptions.couponPrice,
      paymentHistoryId: paymentHistory.id,
      mpPaymentId: paymentHistory.mpPaymentId,
      paymentAmount: paymentHistory.amount,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .leftJoin(
      paymentHistory,
      and(
        eq(paymentHistory.subscriptionId, subscriptions.id),
        inArray(paymentHistory.status, ["approved", "paid", "confirmed"]),
      ),
    )
    .where(sql`(
      ${subscriptions.createdAt} >= ${since}
      OR ${subscriptions.updatedAt} >= ${since}
      OR ${paymentHistory.paymentDate} >= ${since}
    )`)
    .orderBy(desc(sql`COALESCE(${paymentHistory.paymentDate}, ${subscriptions.updatedAt}, ${subscriptions.createdAt})`))
    .limit(Math.max(limit * 3, limit));

  const unique = new Map<string, SubscriptionBackfillRow>();
  for (const row of rows) {
    if (!row.subscriptionId || unique.has(row.subscriptionId)) continue;
    unique.set(row.subscriptionId, row);
    if (unique.size >= limit) break;
  }
  return Array.from(unique.values());
}

async function backfillRodrigoSubscriptionFunnelEvents(
  summary: RodrigoMetaFunnelBackfillSummary,
  since: Date,
  limit: number,
  dryRun: boolean,
): Promise<void> {
  const rows = await loadRecentSubscriptionBackfillRows(since, limit);
  summary.subscriptionsInspected = rows.length;

  for (const row of rows) {
    const isPurchaseCandidate = isPaidSubscriptionBackfillCandidate(row);
    const isCheckoutCandidate = isCheckoutSubscriptionBackfillCandidate(row);
    if (!isPurchaseCandidate && !isCheckoutCandidate) {
      summary.subscriptionNeutralSkipped += 1;
      continue;
    }

    const lead = await loadSubscriptionLead(row.subscriptionId);
    if (!lead) {
      summary.subscriptionConversationNotFound += 1;
      continue;
    }

    const conversation = await findRodrigoConversationBySubscription(lead);
    if (!conversation) {
      summary.subscriptionConversationNotFound += 1;
      continue;
    }

    const attribution = pickBestRodrigoWhatsappAdsAttribution(conversation.rawAnalysis.whatsappAdsAttribution);
    if (!hasMetaWhatsappClickIdAttribution(attribution)) {
      summary.subscriptionMissingCtwaClid += 1;
      continue;
    }

    summary.subscriptionMatchesWithCtwa += 1;
    const value = getSubscriptionBackfillValue(row);

    if (isPurchaseCandidate) {
      summary.purchaseCandidates += 1;
      if (dryRun) continue;

      const result = await recordRodrigoWhatsappPurchaseFromSubscription({
        subscriptionId: row.subscriptionId,
        value,
        paymentId: getSubscriptionBackfillPaymentId(row),
      });

      if (result.recorded && result.meta && "sent" in result.meta && result.meta.sent) {
        summary.purchaseSent += 1;
      } else if (!result.recorded && result.skipped === "already_sent") {
        summary.purchaseAlreadyRecorded += 1;
      } else if (!result.recorded && result.error) {
        summary.failed += 1;
        summary.failures.push({
          conversationId: conversation.id,
          subscriptionId: row.subscriptionId,
          step: "purchase",
          reason: result.error,
        });
      } else {
        summary.purchaseSkipped += 1;
      }
      continue;
    }

    summary.checkoutCandidates += 1;
    if (dryRun) continue;

    const result = await recordRodrigoWhatsappInitiateCheckoutFromSubscription({
      subscriptionId: row.subscriptionId,
      value,
      pixProvider: "backfill_pending_pix",
      paymentId: getSubscriptionBackfillPaymentId(row),
    });

    if (result.recorded && result.meta && "sent" in result.meta && result.meta.sent) {
      summary.checkoutSent += 1;
    } else if (!result.recorded && result.skipped === "already_sent") {
      summary.checkoutAlreadyRecorded += 1;
    } else if (!result.recorded && result.error) {
      summary.failed += 1;
      summary.failures.push({
        conversationId: conversation.id,
        subscriptionId: row.subscriptionId,
        step: "checkout",
        reason: result.error,
      });
    } else {
      summary.checkoutSkipped += 1;
    }
  }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isLowQualityLead(input: {
  isPotential?: boolean | null;
  potentialScore?: number | null;
  potentialGrade?: string | null;
}): boolean {
  const grade = String(input.potentialGrade || "").trim().toLowerCase();
  return !input.isPotential || Number(input.potentialScore || 0) < 45 || grade === "descartar";
}

export async function backfillRodrigoMetaFunnelFromRecentConversations(options?: {
  hours?: unknown;
  limit?: unknown;
  dryRun?: boolean | null;
}): Promise<RodrigoMetaFunnelBackfillSummary> {
  const hours = clampInteger(options?.hours, 72, 1, 168);
  const limit = clampInteger(options?.limit, 200, 1, 500);
  const dryRun = options?.dryRun !== false;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const ownerUserId = await getRodrigoOwnerUserId();
  const ownerConnectionRows = ownerUserId
    ? await db
        .select({ id: whatsappConnections.id })
        .from(whatsappConnections)
        .where(eq(whatsappConnections.userId, ownerUserId))
    : [];
  const ownerConnectionIds = ownerConnectionRows.map((connection) => connection.id).filter(Boolean);

  let rows: LeadBackfillRow[] = [];
  if (ownerConnectionIds.length) {
    rows = await db
      .select({
        conversationId: conversationLeadIntelligence.conversationId,
        rawAnalysis: conversationLeadIntelligence.rawAnalysis,
        isPotential: conversationLeadIntelligence.isPotential,
        potentialScore: conversationLeadIntelligence.potentialScore,
        potentialGrade: conversationLeadIntelligence.potentialGrade,
        businessType: conversationLeadIntelligence.businessType,
        lastAnalyzedAt: conversationLeadIntelligence.lastAnalyzedAt,
        lastMessageTime: conversations.lastMessageTime,
      })
      .from(conversations)
      .innerJoin(conversationLeadIntelligence, eq(conversationLeadIntelligence.conversationId, conversations.id))
      .where(and(
        inArray(conversations.connectionId, ownerConnectionIds),
        sql`COALESCE(${conversations.lastMessageTime}, ${conversations.updatedAt}, ${conversations.createdAt}) >= ${since}`,
      ))
      .orderBy(desc(conversations.lastMessageTime), desc(conversations.updatedAt), desc(conversations.createdAt))
      .limit(limit);
  }

  const summary: RodrigoMetaFunnelBackfillSummary = {
    success: true,
    ownerEmail: RODRIGO_META_OWNER_EMAIL,
    dryRun,
    hours,
    limit,
    inspected: rows.length,
    withCtwaClid: 0,
    qualifiedCandidates: 0,
    lowQualityCandidates: 0,
    neutralSkipped: 0,
    missingCtwaClid: 0,
    leadSent: 0,
    leadAlreadyRecorded: 0,
    leadSkipped: 0,
    lowQualityLabelApplied: 0,
    lowQualityAlreadyRecorded: 0,
    lowQualityLabelSkipped: 0,
    subscriptionsInspected: 0,
    subscriptionMatchesWithCtwa: 0,
    subscriptionMissingCtwaClid: 0,
    subscriptionConversationNotFound: 0,
    subscriptionNeutralSkipped: 0,
    checkoutCandidates: 0,
    checkoutSent: 0,
    checkoutAlreadyRecorded: 0,
    checkoutSkipped: 0,
    purchaseCandidates: 0,
    purchaseSent: 0,
    purchaseAlreadyRecorded: 0,
    purchaseSkipped: 0,
    failed: 0,
    failures: [],
  };

  for (const row of rows) {
    const rawAnalysis = asRecord(row.rawAnalysis);
    const attribution = pickBestRodrigoWhatsappAdsAttribution(rawAnalysis.whatsappAdsAttribution);
    const hasCtwaClid = hasMetaWhatsappClickIdAttribution(attribution);
    if (hasCtwaClid) {
      summary.withCtwaClid += 1;
    } else {
      summary.missingCtwaClid += 1;
      continue;
    }

    const candidate = {
      isPotential: row.isPotential,
      potentialScore: Number(row.potentialScore || 0),
      potentialGrade: row.potentialGrade,
      businessType: row.businessType,
    };

    if (shouldSendRodrigoQualifiedLeadEvent(candidate)) {
      summary.qualifiedCandidates += 1;
      if (dryRun) continue;

      const result = await recordRodrigoWhatsappQualifiedLeadFromConversation({
        conversationId: row.conversationId,
        ...candidate,
      });

      if (result.recorded && result.meta && "sent" in result.meta && result.meta.sent) {
        summary.leadSent += 1;
      } else if (!result.recorded && result.skipped === "already_sent") {
        summary.leadAlreadyRecorded += 1;
      } else if (!result.recorded && result.error) {
        summary.failed += 1;
        summary.failures.push({
          conversationId: row.conversationId,
          step: "lead",
          reason: result.error,
        });
      } else {
        summary.leadSkipped += 1;
      }
      continue;
    }

    if (isLowQualityLead(candidate)) {
      summary.lowQualityCandidates += 1;
      if (dryRun) continue;

      const result = await recordRodrigoWhatsappLowQualityLeadLabelFromConversation({
        conversationId: row.conversationId,
        ...candidate,
      });

      if (result.recorded) {
        summary.lowQualityLabelApplied += 1;
      } else if (result.skipped === "already_labeled") {
        summary.lowQualityAlreadyRecorded += 1;
      } else {
        summary.lowQualityLabelSkipped += 1;
        if (result.error) {
          summary.failed += 1;
          summary.failures.push({
            conversationId: row.conversationId,
            step: "low_quality_label",
            reason: result.error,
          });
        }
      }
      continue;
    }

    summary.neutralSkipped += 1;
  }

  await backfillRodrigoSubscriptionFunnelEvents(summary, since, limit, dryRun);

  return summary;
}
