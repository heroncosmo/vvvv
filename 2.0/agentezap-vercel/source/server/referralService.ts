import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  adminAgentMedia,
  broadcastCampaigns,
  conversations,
  messages,
  paymentHistory,
  referralAttributions,
  referralCommissionRequests,
  referralEvents,
  referralLinks,
  referralProfiles,
  referralProgramSettings,
  referralShareLogs,
  referralSupportMaterials,
  referralWalletLedger,
  referralWithdrawalRequests,
  subscriptions,
  users,
  whatsappConnections,
} from "@shared/schema";
import { db } from "./db";
import {
  buildReferralCode,
  buildReferralOutreachFallbackMessage,
  buildReferralSlug,
  buildShareUrl,
  DEFAULT_REFERRAL_COMMISSION_AMOUNT,
  finalizeReferralOutreachMessage,
  formatMoney,
  normalizeMoney,
  OFFICIAL_WHATSAPP,
  parseFlexibleMoney,
  roundMoney,
} from "./referralCore";
import { storage } from "./storage";

const DEFAULT_COMMISSION_AMOUNT = formatMoney(DEFAULT_REFERRAL_COMMISSION_AMOUNT);
const DEFAULT_SHARE_TEMPLATE =
  "Eu uso o AgenteZap para responder clientes com IA, organizar o CRM e fazer follow-up no WhatsApp sem deixar contato esfriar. Se fizer sentido para voce, entra pelo meu link: {{link}}\nWhatsApp oficial: 5517981679818";
const SUPPORT_MATERIAL_DEFAULT_PAGE_SIZE = 6;
const SUPPORT_MATERIAL_ADMIN_PAGE_SIZE = 8;
const SUPPORT_MATERIAL_MAX_PAGE_SIZE = 24;

function normalizePhoneForLookup(phone: string | null | undefined) {
  let digits = "";
  for (const char of String(phone || "")) {
    const isDigit = char >= "0" && char <= "9";
    if (isDigit) {
      digits += char;
    }
  }
  return digits;
}

function normalizeEmailForLookup(email: string | null | undefined) {
  return String(email || "").trim().toLowerCase();
}

function buildReferralShareMessage(template: string | null | undefined, shareUrl: string) {
  const baseTemplate = String(template || DEFAULT_SHARE_TEMPLATE).trim();
  const withLink = baseTemplate.includes("{{link}}")
    ? baseTemplate.split("{{link}}").join(shareUrl)
    : `${baseTemplate}\n${shareUrl}`;
  return withLink.includes(OFFICIAL_WHATSAPP)
    ? withLink
    : `${withLink}\nWhatsApp oficial: ${OFFICIAL_WHATSAPP}`;
}

async function findUserByNormalizedPhone(normalizedPhone: string) {
  if (!normalizedPhone) return null;
  const candidates = await db
    .select({
      id: users.id,
      phone: users.phone,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(sql`${users.phone} IS NOT NULL`);

  return candidates.find((item) => normalizePhoneForLookup(item.phone) === normalizedPhone) || null;
}

async function findPendingAttributionByContact(params: {
  referralCode?: string | null;
  referredPhone?: string | null;
  referredEmail?: string | null;
}) {
  const normalizedPhone = normalizePhoneForLookup(params.referredPhone);
  const normalizedEmail = normalizeEmailForLookup(params.referredEmail);
  if (!normalizedPhone && !normalizedEmail) return null;

  const conditions = [isNull(referralAttributions.referredUserId)];
  if (params.referralCode) {
    conditions.push(eq(referralAttributions.referralCode, params.referralCode));
  }

  const items = await db
    .select()
    .from(referralAttributions)
    .where(and(...conditions))
    .orderBy(desc(referralAttributions.createdAt));

  return (
    items.find((item) => {
      const samePhone = normalizedPhone && normalizePhoneForLookup(item.referredPhone) === normalizedPhone;
      const sameEmail = normalizedEmail && normalizeEmailForLookup(item.referredEmail) === normalizedEmail;
      return Boolean(samePhone || sameEmail);
    }) || null
  );
}

async function attachAttributionToUser(attributionId: string, userId: string, data: {
  referredPhone?: string | null;
  referredEmail?: string | null;
  sourceChannel?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [updated] = await db
    .update(referralAttributions)
    .set({
      referredUserId: userId,
      referredPhone: data.referredPhone || null,
      referredEmail: data.referredEmail || null,
      sourceChannel: data.sourceChannel || undefined,
      sourceLabel: data.sourceLabel || null,
      sourceUrl: data.sourceUrl || null,
      metadataJson: data.metadata || undefined,
      status: "captured",
      updatedAt: new Date(),
    })
    .where(eq(referralAttributions.id, attributionId))
    .returning();

  return updated;
}

type SupportMaterialMediaType = "audio" | "image" | "video" | "document";

type ReferralSupportMaterialUploadInput = {
  fileUrl: string;
  storagePath: string;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  createdBy: string;
};

type ReferralSupportMaterialPaginationInput = {
  page?: number | string | null;
  limit?: number | string | null;
};

function clampText(value: string, maxLength: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function normalizeSupportMaterialLabel(raw: string) {
  return String(raw || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function detectReferralSupportMaterialMediaType(mimeType?: string | null, fileName?: string | null): SupportMaterialMediaType {
  const normalizedMime = String(mimeType || "").toLowerCase();
  if (normalizedMime.startsWith("image/")) return "image";
  if (normalizedMime.startsWith("video/")) return "video";
  if (normalizedMime.startsWith("audio/")) return "audio";

  const extension = String(fileName || "").split(".").pop()?.toLowerCase();
  if (extension && ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension)) return "image";
  if (extension && ["mp4", "mov", "webm", "avi", "mkv"].includes(extension)) return "video";
  if (extension && ["mp3", "wav", "ogg", "m4a", "aac"].includes(extension)) return "audio";
  return "document";
}

export function buildReferralSupportMaterialTitleFromName(fileName?: string | null) {
  const withoutExtension = String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  const normalized = normalizeSupportMaterialLabel(withoutExtension);
  if (!normalized) {
    return "Material de apoio";
  }
  return clampText(toTitleCase(normalized), 80);
}

export function buildReferralSupportMaterialFallbackMetadata(params: {
  originalFileName?: string | null;
  mimeType?: string | null;
  mediaType?: SupportMaterialMediaType;
}) {
  const mediaType =
    params.mediaType ||
    detectReferralSupportMaterialMediaType(params.mimeType, params.originalFileName);
  const title = buildReferralSupportMaterialTitleFromName(params.originalFileName);
  const extension = String(params.originalFileName || "").split(".").pop()?.toUpperCase();
  const fileLabel = extension ? ` em ${extension}` : "";

  const descriptions: Record<SupportMaterialMediaType, string> = {
    image: `Arte pronta para compartilhar com clientes e apoiar a indicação com contexto visual claro${fileLabel}.`,
    video: `Vídeo de apoio para apresentar a oferta de forma rápida e facilitar o compartilhamento com clientes${fileLabel}.`,
    audio: `Áudio de apoio para encaminhar com explicação direta, sem precisar redigitar a mensagem${fileLabel}.`,
    document: `Arquivo de apoio com informações prontas para download e compartilhamento com clientes${fileLabel}.`,
  };

  const description = clampText(descriptions[mediaType], 220);

  return {
    title,
    description,
    caption: clampText(`Compartilhe ${title.toLowerCase()} com seus clientes quando fizer sentido no atendimento.`, 140),
    aiGenerated: false,
    aiModel: null as string | null,
    metadataJson: {
      source: "fallback_filename",
      mediaType,
    },
  };
}

async function buildReferralSupportMaterialMetadata(input: ReferralSupportMaterialUploadInput & { mediaType: SupportMaterialMediaType }) {
  const fallback = buildReferralSupportMaterialFallbackMetadata({
    originalFileName: input.originalFileName,
    mimeType: input.mimeType,
    mediaType: input.mediaType,
  });

  if (input.mediaType !== "image") {
    return fallback;
  }

  console.warn("[REFERRAL] Legacy vision metadata disabled; using uploaded file metadata.");
  return fallback;
}

export function normalizeReferralSupportMaterialPagination(
  params: ReferralSupportMaterialPaginationInput,
  defaultLimit = SUPPORT_MATERIAL_DEFAULT_PAGE_SIZE,
) {
  const rawPage = Number(params.page);
  const rawLimit = Number(params.limit);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(SUPPORT_MATERIAL_MAX_PAGE_SIZE, Math.floor(rawLimit))
    : defaultLimit;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

async function listReferralSupportMaterials(
  params: ReferralSupportMaterialPaginationInput,
  defaultLimit: number,
) {
  const { page, limit, offset } = normalizeReferralSupportMaterialPagination(params, defaultLimit);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(referralSupportMaterials)
      .orderBy(desc(referralSupportMaterials.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(referralSupportMaterials),
  ]);

  const total = Number(totalRows[0]?.count || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

function getReferralSubscriptionRank(status: string | null | undefined) {
  switch (String(status || "").toLowerCase()) {
    case "active":
      return 5;
    case "pending":
      return 4;
    case "paused":
      return 3;
    case "expired":
      return 2;
    case "cancelled":
      return 1;
    default:
      return 0;
  }
}

function isReferralActiveSubscription(status: string | null | undefined) {
  return String(status || "").toLowerCase() === "active";
}

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function maxIsoDate(values: Array<Date | string | null | undefined>) {
  let best: Date | null = null;
  for (const value of values) {
    if (!value) continue;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) continue;
    if (!best || parsed.getTime() > best.getTime()) {
      best = parsed;
    }
  }
  return best ? best.toISOString() : null;
}

function buildReferralCampaignDetails(campaign: {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  contactsJson: unknown;
  resultsJson: unknown;
  createdAt: Date | null;
  completedAt: Date | null;
}) {
  const contacts = Array.isArray(campaign.contactsJson) ? campaign.contactsJson : [];
  const results = Array.isArray(campaign.resultsJson) ? campaign.resultsJson : [];
  const resultsById = new Map<string, any>();
  const resultsByPhone = new Map<string, any>();

  for (const result of results) {
    const contactId = String((result as any)?.contactId || "").trim();
    if (contactId && !resultsById.has(contactId)) {
      resultsById.set(contactId, result);
    }

    const normalizedPhone = normalizePhoneForLookup((result as any)?.phone);
    if (normalizedPhone && !resultsByPhone.has(normalizedPhone)) {
      resultsByPhone.set(normalizedPhone, result);
    }
  }

  const contactsPreview = contacts.slice(0, 12).map((contact) => {
    const contactId = String((contact as any)?.id || "").trim();
    const normalizedPhone = normalizePhoneForLookup((contact as any)?.phone);
    const result = resultsById.get(contactId) || (normalizedPhone ? resultsByPhone.get(normalizedPhone) : null);
    const status =
      String((result as any)?.status || "").trim() ||
      (campaign.status === "running" || campaign.status === "pending" ? "queued" : "selected");

    return {
      id: contactId || `${campaign.id}:${normalizedPhone}`,
      conversationId: contactId || null,
      name: String((result as any)?.name || (contact as any)?.name || "Sem nome"),
      phone: String((result as any)?.phone || (contact as any)?.phone || ""),
      status,
      sentAt: String((result as any)?.sentAt || "").trim() || null,
      error: String((result as any)?.error || "").trim() || null,
    };
  });

  const totalContacts = Math.max(campaign.totalContacts || 0, contacts.length);
  const sentCount = results.filter((item) => String((item as any)?.status || "").toLowerCase() === "sent").length || campaign.sentCount || 0;
  const failedCount = results.filter((item) => String((item as any)?.status || "").toLowerCase() === "failed").length || campaign.failedCount || 0;
  const queuedCount = Math.max(0, totalContacts - sentCount - failedCount);

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    totalContacts,
    sentCount,
    failedCount,
    queuedCount,
    createdAt: toIsoDate(campaign.createdAt),
    completedAt: toIsoDate(campaign.completedAt),
    contactsPreview,
  };
}

async function callJsonLlm<T>(messagesInput: Array<{ role: "system" | "user" | "assistant"; content: string }>, maxTokens = 300): Promise<T | null> {
  void messagesInput;
  void maxTokens;
  return null;
}

async function ensureReferralProgramSettings() {
  const existing = await db.query.referralProgramSettings.findFirst({
    orderBy: desc(referralProgramSettings.createdAt),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(referralProgramSettings)
    .values({
      defaultCommissionAmount: DEFAULT_COMMISSION_AMOUNT,
      referralHeroTitle: "Transforme contatos em R$50 por assinatura aprovada",
      referralHeroBody: "Escolha quem faz sentido, deixe a IA encaixar sua recomendaÃ§Ã£o no contexto e acumule crÃ©ditos para abater sua assinatura ou sacar via Pix.",
    })
    .returning();

  return created;
}

export async function ensureReferralProfile(userId: string) {
  const programSettings = await ensureReferralProgramSettings();
  const existing = await db.query.referralProfiles.findFirst({
    where: eq(referralProfiles.userId, userId),
  });
  if (existing) {
    const primaryLink = await db.query.referralLinks.findFirst({
      where: and(eq(referralLinks.profileId, existing.id), eq(referralLinks.isPrimary, true)),
    });
    if (primaryLink) {
      return { profile: existing, link: primaryLink };
    }
  }

  const user = await storage.getUser(userId);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const referralCode = buildReferralCode(user.name || user.email || "cliente", user.id);
  const destinationUrl = buildShareUrl(referralCode);

  const profile =
    existing ||
    (
      await db
        .insert(referralProfiles)
        .values({
          userId,
          referralCode,
          commissionDefaultAmount: programSettings.defaultCommissionAmount || DEFAULT_COMMISSION_AMOUNT,
          availableBalance: "0",
          pendingBalance: "0",
          lifetimeBalance: "0",
          totalReferrals: 0,
          convertedReferrals: 0,
        })
        .onConflictDoUpdate({
          target: referralProfiles.userId,
          set: {
            referralCode,
            updatedAt: new Date(),
          },
        })
        .returning()
    )[0];

  const link =
    (
      await db
        .insert(referralLinks)
        .values({
          profileId: profile.id,
          userId,
          referralCode: profile.referralCode,
          slug: buildReferralSlug(profile.referralCode),
          destinationUrl,
          isPrimary: true,
        })
        .onConflictDoUpdate({
          target: referralLinks.slug,
          set: {
            destinationUrl,
            updatedAt: new Date(),
          },
        })
        .returning()
    )[0];

  return { profile, link };
}

async function recalculateProfileBalances(profileId: string) {
  const entries = await db
    .select({
      amount: referralWalletLedger.amount,
      entryType: referralWalletLedger.entryType,
      status: referralWalletLedger.status,
    })
    .from(referralWalletLedger)
    .where(eq(referralWalletLedger.profileId, profileId));

  let availableBalance = 0;
  let pendingBalance = 0;
  let lifetimeBalance = 0;

  for (const entry of entries) {
    const amount = normalizeMoney(entry.amount);
    lifetimeBalance += amount > 0 && entry.entryType === "commission_credit" ? amount : 0;
    if (amount < 0) {
      if (entry.status !== "reversed") {
        availableBalance += amount;
      }
      if (entry.status === "pending") {
        pendingBalance += Math.abs(amount);
      }
      continue;
    }

    if (entry.status === "available") {
      availableBalance += amount;
    } else if (entry.status === "pending") {
      pendingBalance += amount;
    }
  }

  await db
    .update(referralProfiles)
    .set({
      availableBalance: formatMoney(availableBalance),
      pendingBalance: formatMoney(pendingBalance),
      lifetimeBalance: formatMoney(lifetimeBalance),
      updatedAt: new Date(),
    })
    .where(eq(referralProfiles.id, profileId));
}

export async function captureReferralAttribution(params: {
  referralCode: string;
  referredUserId?: string | null;
  referredEmail?: string | null;
  referredPhone?: string | null;
  sourceChannel?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const normalizedCode = String(params.referralCode || "").trim().toLowerCase();
  const normalizedPhone = normalizePhoneForLookup(params.referredPhone);
  const normalizedEmail = normalizeEmailForLookup(params.referredEmail);
  if (!normalizedCode) return null;

  const profile = await db.query.referralProfiles.findFirst({
    where: eq(referralProfiles.referralCode, normalizedCode),
  });
  if (!profile) return null;

  if (params.referredUserId && params.referredUserId === profile.userId) {
    return null;
  }

  const existing = params.referredUserId
    ? await db.query.referralAttributions.findFirst({
        where: eq(referralAttributions.referredUserId, params.referredUserId),
      })
    : null;

  if (existing) {
    return existing;
  }

  const pendingByContact = await findPendingAttributionByContact({
    referralCode: normalizedCode,
    referredPhone: normalizedPhone,
    referredEmail: normalizedEmail,
  });
  if (pendingByContact) {
    if (params.referredUserId) {
      return attachAttributionToUser(pendingByContact.id, params.referredUserId, {
        referredPhone: normalizedPhone,
        referredEmail: normalizedEmail,
        sourceChannel: params.sourceChannel || pendingByContact.sourceChannel,
        sourceLabel: params.sourceLabel || pendingByContact.sourceLabel,
        sourceUrl: params.sourceUrl || pendingByContact.sourceUrl,
        metadata: {
          ...(pendingByContact.metadataJson as Record<string, unknown> | undefined),
          ...(params.metadata || {}),
        },
      });
    }

    const [updatedPending] = await db
      .update(referralAttributions)
      .set({
        referredPhone: normalizedPhone || pendingByContact.referredPhone || null,
        referredEmail: normalizedEmail || pendingByContact.referredEmail || null,
        sourceChannel: params.sourceChannel || pendingByContact.sourceChannel,
        sourceLabel: params.sourceLabel || pendingByContact.sourceLabel,
        sourceUrl: params.sourceUrl || pendingByContact.sourceUrl,
        metadataJson: {
          ...(pendingByContact.metadataJson as Record<string, unknown> | undefined),
          ...(params.metadata || {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(referralAttributions.id, pendingByContact.id))
      .returning();

    return updatedPending;
  }

  const inserted = await db
    .insert(referralAttributions)
    .values({
      referralCode: normalizedCode,
      referrerUserId: profile.userId,
      referredUserId: params.referredUserId || null,
      referredEmail: normalizedEmail || null,
      referredPhone: normalizedPhone || null,
      sourceChannel: params.sourceChannel || "link",
      sourceLabel: params.sourceLabel || null,
      sourceUrl: params.sourceUrl || null,
      metadataJson: params.metadata || {},
      status: "captured",
    })
    .returning();

  await db
    .update(referralProfiles)
    .set({
      totalReferrals: sql`${referralProfiles.totalReferrals} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(referralProfiles.id, profile.id));

  return inserted[0];
}

async function getAttributionForSubscription(subscriptionId: string) {
  const subscription = await storage.getSubscription(subscriptionId) as any;
  if (!subscription) return null;

  const directAttribution = await db.query.referralAttributions.findFirst({
    where: eq(referralAttributions.referredUserId, subscription.userId),
  });
  if (directAttribution) {
    return { attribution: directAttribution, subscription };
  }

  if (subscription.referralCode) {
    const referralByCode = await db.query.referralAttributions.findFirst({
      where: and(
        eq(referralAttributions.referralCode, subscription.referralCode),
        or(eq(referralAttributions.referredUserId, subscription.userId), isNull(referralAttributions.referredUserId)),
      ),
      orderBy: desc(referralAttributions.createdAt),
    });
    if (referralByCode) {
      if (!referralByCode.referredUserId) {
        await db
          .update(referralAttributions)
          .set({
            referredUserId: subscription.userId,
            status: "captured",
            updatedAt: new Date(),
          })
          .where(eq(referralAttributions.id, referralByCode.id));
      }
      return { attribution: { ...referralByCode, referredUserId: subscription.userId }, subscription };
    }
  }

  const referredUser = subscription.userId ? await storage.getUser(subscription.userId) : null;
  const byContact = await findPendingAttributionByContact({
    referredPhone: referredUser?.phone || null,
    referredEmail: referredUser?.email || null,
  });
  if (byContact) {
    const attached = await attachAttributionToUser(byContact.id, subscription.userId, {
      referredPhone: normalizePhoneForLookup(referredUser?.phone),
      referredEmail: normalizeEmailForLookup(referredUser?.email),
      sourceChannel: byContact.sourceChannel,
      sourceLabel: byContact.sourceLabel,
      sourceUrl: byContact.sourceUrl,
      metadata: byContact.metadataJson as Record<string, unknown>,
    });
    return { attribution: attached, subscription };
  }

  return null;
}

async function hasCommissionAlreadyCredited(subscriptionId: string) {
  const existing = await db.query.referralEvents.findFirst({
    where: and(eq(referralEvents.subscriptionId, subscriptionId), eq(referralEvents.eventType, "first_paid_subscription")),
  });
  return Boolean(existing);
}

export async function processReferralCreditForApprovedSubscription(params: {
  subscriptionId: string;
  paymentHistoryId?: string | null;
  amountPaid?: number | string | null;
  source?: string | null;
}) {
  const match = await getAttributionForSubscription(params.subscriptionId);
  if (!match) return { credited: false, reason: "no_attribution" as const };
  if (await hasCommissionAlreadyCredited(params.subscriptionId)) {
    return { credited: false, reason: "duplicate" as const };
  }

  const { attribution, subscription } = match;
  const subscriptionStatus = String(subscription.status || "").toLowerCase();
  if (subscriptionStatus !== "active" || subscription.pendingReceipt) {
    return { credited: false, reason: "subscription_not_active" as const };
  }

  const amountPaid = normalizeMoney(params.amountPaid);
  if (amountPaid <= 0) {
    return { credited: false, reason: "subscription_not_paid" as const };
  }

  const profile = await db.query.referralProfiles.findFirst({
    where: eq(referralProfiles.userId, attribution.referrerUserId),
  });
  if (!profile) {
    return { credited: false, reason: "missing_profile" as const };
  }

  const commissionAmount = normalizeMoney(profile.commissionApprovedAmount || profile.commissionDefaultAmount || DEFAULT_COMMISSION_AMOUNT);
  const event = (
    await db
      .insert(referralEvents)
      .values({
        attributionId: attribution.id,
        referrerUserId: attribution.referrerUserId,
        referredUserId: subscription.userId,
        subscriptionId: subscription.id,
        paymentHistoryId: params.paymentHistoryId || null,
        eventType: "first_paid_subscription",
        amount: formatMoney(commissionAmount),
        metadataJson: {
          source: params.source || "subscription_activation",
          amountPaid,
        },
      })
      .returning()
  )[0];

  await db
    .insert(referralWalletLedger)
    .values({
      profileId: profile.id,
      userId: profile.userId,
      attributionId: attribution.id,
      referralEventId: event.id,
      subscriptionId: subscription.id,
      entryType: "commission_credit",
      status: "available",
      amount: formatMoney(commissionAmount),
      description: `ComissÃ£o por assinatura paga de ${subscription.userId}`,
      metadataJson: {
        source: params.source || "subscription_activation",
      },
      availableAt: new Date(),
    });

  await db
    .update(referralAttributions)
    .set({
      status: "converted",
      convertedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(referralAttributions.id, attribution.id));

  await db
    .update(referralProfiles)
    .set({
      convertedReferrals: sql`${referralProfiles.convertedReferrals} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(referralProfiles.id, profile.id));

  await recalculateProfileBalances(profile.id);
  return { credited: true, amount: commissionAmount, profileId: profile.id };
}

export async function getReferralDashboard(userId: string) {
  const { profile, link } = await ensureReferralProfile(userId);
  const [programSettings, walletEntries, withdrawalRequests, commissionRequests, shareLogs, attributions, outreachCampaigns, supportMaterialsPreview] = await Promise.all([
    ensureReferralProgramSettings(),
    db
      .select()
      .from(referralWalletLedger)
      .where(eq(referralWalletLedger.userId, userId))
      .orderBy(desc(referralWalletLedger.createdAt))
      .limit(20),
    db
      .select()
      .from(referralWithdrawalRequests)
      .where(eq(referralWithdrawalRequests.userId, userId))
      .orderBy(desc(referralWithdrawalRequests.createdAt))
      .limit(10),
    db
      .select()
      .from(referralCommissionRequests)
      .where(eq(referralCommissionRequests.userId, userId))
      .orderBy(desc(referralCommissionRequests.createdAt))
      .limit(10),
    db
      .select()
      .from(referralShareLogs)
      .where(eq(referralShareLogs.userId, userId))
      .orderBy(desc(referralShareLogs.createdAt))
      .limit(20),
    db
      .select()
      .from(referralAttributions)
      .where(eq(referralAttributions.referrerUserId, userId))
      .orderBy(desc(referralAttributions.createdAt))
      .limit(25),
    db
      .select({
        id: broadcastCampaigns.id,
        name: broadcastCampaigns.name,
        status: broadcastCampaigns.status,
        createdAt: broadcastCampaigns.createdAt,
        completedAt: broadcastCampaigns.completedAt,
        contactsJson: broadcastCampaigns.contactsJson,
        resultsJson: broadcastCampaigns.resultsJson,
      })
      .from(broadcastCampaigns)
      .where(and(eq(broadcastCampaigns.userId, userId), eq(broadcastCampaigns.campaignType, "referral_outreach")))
      .orderBy(desc(broadcastCampaigns.createdAt))
      .limit(40),
    db
      .select({
        id: referralSupportMaterials.id,
        title: referralSupportMaterials.title,
        description: referralSupportMaterials.description,
        caption: referralSupportMaterials.caption,
        fileUrl: referralSupportMaterials.fileUrl,
        fileName: referralSupportMaterials.fileName,
        originalFileName: referralSupportMaterials.originalFileName,
        mimeType: referralSupportMaterials.mimeType,
        fileSize: referralSupportMaterials.fileSize,
        mediaType: referralSupportMaterials.mediaType,
        aiGenerated: referralSupportMaterials.aiGenerated,
        createdAt: referralSupportMaterials.createdAt,
      })
      .from(referralSupportMaterials)
      .orderBy(desc(referralSupportMaterials.createdAt))
      .limit(4),
  ]);

  const converted = attributions.filter((item) => item.status === "converted").length;
  const conversionRate = attributions.length > 0 ? roundMoney((converted / attributions.length) * 100) : 0;
  const outreachStatusByConversation: Record<string, {
    status: "sent" | "failed" | "queued";
    campaignId: string;
    campaignName: string;
    sentAt?: string;
    error?: string;
  }> = {};
  const recentOutreach: Array<{
    id: string;
    phone: string;
    name: string;
    status: "sent" | "failed" | "queued";
    campaignId: string;
    campaignName: string;
    timestamp?: string;
    error?: string;
  }> = [];

  for (const campaign of outreachCampaigns) {
    const contacts = Array.isArray(campaign.contactsJson) ? campaign.contactsJson : [];
    const results = Array.isArray(campaign.resultsJson) ? campaign.resultsJson : [];
    const resultsById = new Map<string, any>();
    const resultsByPhone = new Map<string, any>();

    for (const result of results) {
      const contactId = String((result as any)?.contactId || "").trim();
      if (contactId && !resultsById.has(contactId)) {
        resultsById.set(contactId, result);
      }

      const normalizedPhone = normalizePhoneForLookup((result as any)?.phone);
      if (normalizedPhone && !resultsByPhone.has(normalizedPhone)) {
        resultsByPhone.set(normalizedPhone, result);
      }
    }

    for (const contact of contacts) {
      const conversationId = String((contact as any)?.id || "").trim();
      if (!conversationId || outreachStatusByConversation[conversationId]) {
        continue;
      }

      const contactPhone = normalizePhoneForLookup((contact as any)?.phone);
      const result = resultsById.get(conversationId) || (contactPhone ? resultsByPhone.get(contactPhone) : null);
      if (result) {
        outreachStatusByConversation[conversationId] = {
          status: (result.status as "sent" | "failed") || "sent",
          campaignId: campaign.id,
          campaignName: campaign.name,
          sentAt: result.sentAt || campaign.completedAt?.toISOString?.() || campaign.createdAt?.toISOString?.(),
          error: result.error || undefined,
        };
        recentOutreach.push({
          id: `${campaign.id}:${conversationId}`,
          phone: String((result as any)?.phone || (contact as any)?.phone || ""),
          name: String((result as any)?.name || (contact as any)?.name || "Sem nome"),
          status: (result.status as "sent" | "failed") || "sent",
          campaignId: campaign.id,
          campaignName: campaign.name,
          timestamp: result.sentAt || campaign.completedAt?.toISOString?.() || campaign.createdAt?.toISOString?.(),
          error: result.error || undefined,
        });
        continue;
      }

      if (campaign.status === "running" || campaign.status === "pending") {
        outreachStatusByConversation[conversationId] = {
          status: "queued",
          campaignId: campaign.id,
          campaignName: campaign.name,
          sentAt: campaign.createdAt?.toISOString?.(),
        };
        recentOutreach.push({
          id: `${campaign.id}:${conversationId}:queued`,
          phone: String((contact as any)?.phone || ""),
          name: String((contact as any)?.name || "Sem nome"),
          status: "queued",
          campaignId: campaign.id,
          campaignName: campaign.name,
          timestamp: campaign.createdAt?.toISOString?.(),
        });
      }
    }
  }

  recentOutreach.sort((left, right) => {
    const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0;
    const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0;
    return rightTime - leftTime;
  });

  const activeCommissionAmount = normalizeMoney(
    profile.commissionApprovedAmount || profile.commissionDefaultAmount || programSettings.defaultCommissionAmount || DEFAULT_COMMISSION_AMOUNT,
  );
  const shareMessageTemplate = String(profile.shareMessageTemplate || DEFAULT_SHARE_TEMPLATE);
  const manualReferrals = attributions
    .filter((item) => item.sourceChannel === "manual_phone")
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      name: item.sourceLabel || "Contato indicado",
      phone: item.referredPhone || "",
      status: item.status,
      createdAt: item.createdAt?.toISOString?.() || null,
      convertedAt: item.convertedAt?.toISOString?.() || null,
      referredUserId: item.referredUserId || null,
    }));

  return {
    profile,
    program: {
      defaultCommissionAmount: normalizeMoney(programSettings.defaultCommissionAmount || DEFAULT_COMMISSION_AMOUNT),
      heroTitle:
        programSettings.referralHeroTitle ||
        `Receba ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(activeCommissionAmount)} por cliente na primeira assinatura paga`,
      heroBody:
        programSettings.referralHeroBody ||
        "Selecione as conversas certas, deixe a IA encaixar sua recomendacao no contexto e transforme cada indicacao aprovada em credito para abater sua assinatura ou sacar por Pix.",
    },
    link: {
      ...link,
      shareUrl: buildShareUrl(profile.referralCode),
      shareMessageTemplate,
      renderedShareMessage: buildReferralShareMessage(shareMessageTemplate, buildShareUrl(profile.referralCode)),
    },
    walletEntries,
    withdrawalRequests,
    commissionRequests,
    shareLogs,
    attributions,
    outreachStatusByConversation,
    recentOutreach: recentOutreach.slice(0, 20),
    manualReferrals,
    supportMaterialsPreview,
    stats: {
      availableBalance: normalizeMoney(profile.availableBalance),
      pendingBalance: normalizeMoney(profile.pendingBalance),
      lifetimeBalance: normalizeMoney(profile.lifetimeBalance),
      totalReferrals: attributions.length,
      convertedReferrals: converted,
      conversionRate,
      standardCommission: normalizeMoney(profile.commissionDefaultAmount || programSettings.defaultCommissionAmount || DEFAULT_COMMISSION_AMOUNT),
      approvedCommission: activeCommissionAmount,
    },
    faq: [
      {
        question: "Quando o saldo cai?",
        answer: "O credito entra automaticamente quando o indicado conclui a primeira assinatura paga e aprovada. Criar cadastro, testar a ferramenta ou deixar a assinatura pendente nao libera saldo.",
      },
      {
        question: "Posso usar o saldo na minha assinatura?",
        answer: "Sim. O saldo disponivel pode abater sua renovacao antes de gerar cobranca externa.",
      },
      {
        question: "Posso sacar?",
        answer: "Sim. Voce envia sua chave Pix, o pedido vai para revisao e o admin marca como pago quando concluir a transferencia.",
      },
      {
        question: "Posso pedir comissao maior?",
        answer: "Sim. Abra uma proposta com contexto comercial e o admin avalia sem alterar sua comissao atual ate aprovar.",
      },
      {
        question: "Eu ganho todo mes do mesmo cliente?",
        answer: "Nao. O credito entra somente na primeira assinatura paga de cada cliente indicado. Isso deixa a regra clara, previsivel e mais facil de explicar quando voce compartilha.",
      },
      {
        question: "So criar conta ja gera credito?",
        answer: "Nao. O saldo so aparece quando o indicado realmente paga e a primeira assinatura e aprovada. Cadastro sem pagamento nao conta como indicacao convertida.",
      },
      {
        question: "Se o indicado pagar com comprovante manual, quando entra o credito?",
        answer: "Quando o indicado envia comprovante, o acesso dele pode ficar provisoriamente liberado. O seu credito so entra depois que o admin aprova esse comprovante e confirma a primeira assinatura paga.",
      },
    ],
    pitch: {
      headline: `Receba ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(activeCommissionAmount)} na primeira assinatura paga de cada indicacao aprovada.`,
      body: "Use seu proprio WhatsApp para indicar a ferramenta que voce ja usa, espalhe o AgenteZap nas conversas certas e transforme cada indicacao aprovada em credito para abater ou sacar.",
    },
  };
}

export async function createManualReferralAttribution(params: {
  userId: string;
  contactName: string;
  contactPhone: string;
}) {
  const { profile } = await ensureReferralProfile(params.userId);
  const normalizedPhone = normalizePhoneForLookup(params.contactPhone);
  const normalizedName = String(params.contactName || "").trim();

  if (normalizedPhone.length < 10) {
    throw new Error("INVALID_PHONE");
  }

  const referrer = await storage.getUser(params.userId);
  if (normalizePhoneForLookup(referrer?.phone) === normalizedPhone) {
    throw new Error("SELF_REFERRAL");
  }

  const existingUser = await findUserByNormalizedPhone(normalizedPhone);
  if (existingUser) {
    throw new Error("ALREADY_REGISTERED");
  }

  const existingAttribution = await findPendingAttributionByContact({
    referredPhone: normalizedPhone,
  });
  if (existingAttribution) {
    if (existingAttribution.referrerUserId !== params.userId) {
      throw new Error("ALREADY_RESERVED");
    }
    return existingAttribution;
  }

  const [created] = await db
    .insert(referralAttributions)
    .values({
      referralCode: profile.referralCode,
      referrerUserId: params.userId,
      referredPhone: normalizedPhone,
      sourceChannel: "manual_phone",
      sourceLabel: normalizedName || "Contato indicado manualmente",
      metadataJson: {
        createdFrom: "manual_phone",
      },
      status: "captured",
    })
    .returning();

  await db
    .update(referralProfiles)
    .set({
      totalReferrals: sql`${referralProfiles.totalReferrals} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(referralProfiles.id, profile.id));

  return created;
}

export async function applyReferralWalletToSubscription(userId: string, subscriptionId: string, planPrice: number) {
  const profile = await db.query.referralProfiles.findFirst({
    where: eq(referralProfiles.userId, userId),
  });
  if (!profile) {
    return { appliedAmount: 0, remainingAmount: planPrice };
  }

  const availableBalance = normalizeMoney(profile.availableBalance);
  const appliedAmount = Math.min(availableBalance, planPrice);
  const remainingAmount = roundMoney(planPrice - appliedAmount);

  await db
    .update(subscriptions)
    .set({
      referralWalletAppliedAmount: formatMoney(appliedAmount),
      referralWalletAppliedAt: appliedAmount > 0 ? new Date() : null,
    })
    .where(eq(subscriptions.id, subscriptionId));

  return { appliedAmount, remainingAmount };
}

export async function finalizeWalletUsageForSubscription(userId: string, subscriptionId: string) {
  const subscription = await storage.getSubscription(subscriptionId) as any;
  if (!subscription) {
    throw new Error("SUBSCRIPTION_NOT_FOUND");
  }
  const appliedAmount = normalizeMoney(subscription.referralWalletAppliedAmount);
  if (appliedAmount <= 0) {
    return { used: false, amount: 0 };
  }

  const profile = await db.query.referralProfiles.findFirst({
    where: eq(referralProfiles.userId, userId),
  });
  if (!profile) {
    return { used: false, amount: 0 };
  }

  const existing = await db.query.referralWalletLedger.findFirst({
    where: and(
      eq(referralWalletLedger.subscriptionId, subscriptionId),
      eq(referralWalletLedger.entryType, "subscription_discount"),
    ),
  });
  if (existing) {
    return { used: false, amount: appliedAmount };
  }

  await db.insert(referralWalletLedger).values({
    profileId: profile.id,
    userId,
    subscriptionId,
    entryType: "subscription_discount",
    status: "available",
    amount: formatMoney(appliedAmount * -1),
    description: "Saldo usado para abater assinatura",
    metadataJson: { subscriptionId },
    availableAt: new Date(),
  });

  await recalculateProfileBalances(profile.id);
  return { used: true, amount: appliedAmount };
}

export async function createWithdrawalRequest(params: {
  userId: string;
  amount: number | string;
  pixType: string;
  pixKey: string;
  holderName: string;
  documentNumber?: string | null;
}) {
  const { profile } = await ensureReferralProfile(params.userId);
  const amount = roundMoney(parseFlexibleMoney(params.amount));
  const availableBalance = normalizeMoney(profile.availableBalance);

  if (amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }
  if (amount > availableBalance) {
    throw new Error("INSUFFICIENT_BALANCE");
  }

  const [request] = await db
    .insert(referralWithdrawalRequests)
    .values({
      profileId: profile.id,
      userId: params.userId,
      amount: formatMoney(amount),
      pixType: params.pixType,
      pixKey: params.pixKey,
      holderName: params.holderName,
      documentNumber: params.documentNumber || null,
      status: "pending",
    })
    .returning();

  await db.insert(referralWalletLedger).values({
    profileId: profile.id,
    userId: params.userId,
    entryType: "withdrawal_request",
    status: "pending",
    amount: formatMoney(amount * -1),
    description: "SolicitaÃ§Ã£o de saque aguardando revisÃ£o",
    metadataJson: { withdrawalRequestId: request.id },
    availableAt: new Date(),
  });

  await recalculateProfileBalances(profile.id);
  return request;
}

export async function createCommissionRequest(params: {
  userId: string;
  requestedAmount: number | string;
  justification: string;
  attachments?: string[];
}) {
  const { profile } = await ensureReferralProfile(params.userId);
  const requestedAmount = roundMoney(parseFlexibleMoney(params.requestedAmount));
  const currentAmount = normalizeMoney(profile.commissionApprovedAmount || profile.commissionDefaultAmount);
  if (requestedAmount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }
  const [request] = await db
    .insert(referralCommissionRequests)
    .values({
      profileId: profile.id,
      userId: params.userId,
      requestedAmount: formatMoney(requestedAmount),
      currentAmount: formatMoney(currentAmount),
      justification: params.justification,
      attachmentsJson: params.attachments || [],
      status: "pending",
    })
    .returning();

  return request;
}

export async function logShareAction(params: {
  userId: string;
  channel: string;
  contactName?: string | null;
  contactPhone?: string | null;
  targetConversationId?: string | null;
  messagePreview?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { profile, link } = await ensureReferralProfile(params.userId);
  const [log] = await db
    .insert(referralShareLogs)
    .values({
      profileId: profile.id,
      userId: params.userId,
      referralCode: profile.referralCode,
      channel: params.channel,
      contactName: params.contactName || null,
      contactPhone: params.contactPhone || null,
      targetConversationId: params.targetConversationId || null,
      shareUrl: buildShareUrl(profile.referralCode),
      messagePreview: params.messagePreview || null,
      metadataJson: {
        ...(params.metadata || {}),
        slug: link.slug,
      },
    })
    .returning();

  await db
    .update(referralProfiles)
    .set({
      lastShareAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(referralProfiles.id, profile.id));

  return log;
}

export async function getReferralSupportMaterialsPage(params: ReferralSupportMaterialPaginationInput = {}) {
  return listReferralSupportMaterials(params, SUPPORT_MATERIAL_DEFAULT_PAGE_SIZE);
}

export async function getAdminReferralSupportMaterialsPage(params: ReferralSupportMaterialPaginationInput = {}) {
  return listReferralSupportMaterials(params, SUPPORT_MATERIAL_ADMIN_PAGE_SIZE);
}

export async function getReferralSupportMaterialById(id: string) {
  return db.query.referralSupportMaterials.findFirst({
    where: eq(referralSupportMaterials.id, id),
  });
}

export async function updateReferralSupportMaterial(params: {
  id: string;
  title: string;
  description: string;
  caption?: string | null;
}) {
  const [updated] = await db
    .update(referralSupportMaterials)
    .set({
      title: clampText(params.title, 255) || "Material de apoio",
      description: clampText(params.description, 1000) || "Material atualizado manualmente.",
      caption: clampText(params.caption || "", 500) || null,
      updatedAt: new Date(),
    })
    .where(eq(referralSupportMaterials.id, params.id))
    .returning();

  return updated || null;
}

export async function deleteReferralSupportMaterial(id: string) {
  const [deleted] = await db
    .delete(referralSupportMaterials)
    .where(eq(referralSupportMaterials.id, id))
    .returning();

  return deleted || null;
}

export async function createReferralSupportMaterialsBulk(params: {
  files: ReferralSupportMaterialUploadInput[];
}) {
  const created: Array<typeof referralSupportMaterials.$inferSelect> = [];

  for (const file of params.files) {
    const mediaType = detectReferralSupportMaterialMediaType(file.mimeType, file.originalFileName);
    const metadata = await buildReferralSupportMaterialMetadata({
      ...file,
      mediaType,
    });

    const [material] = await db
      .insert(referralSupportMaterials)
      .values({
        title: metadata.title,
        description: metadata.description,
        caption: metadata.caption,
        fileUrl: file.fileUrl,
        storagePath: file.storagePath,
        fileName: file.fileName,
        originalFileName: file.originalFileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        mediaType,
        aiGenerated: metadata.aiGenerated,
        aiModel: metadata.aiModel,
        createdBy: file.createdBy,
        metadataJson: metadata.metadataJson,
      })
      .returning();

    created.push(material);
  }

  return created;
}

export async function getReferralAdminOverview() {
  const [programSettings, profiles, pendingWithdrawals, pendingCommissionRequests, recentEvents, supportMaterialsCount] = await Promise.all([
    ensureReferralProgramSettings(),
    db
      .select({
        id: referralProfiles.id,
        userId: referralProfiles.userId,
        referralCode: referralProfiles.referralCode,
        availableBalance: referralProfiles.availableBalance,
        pendingBalance: referralProfiles.pendingBalance,
        lifetimeBalance: referralProfiles.lifetimeBalance,
        totalReferrals: referralProfiles.totalReferrals,
        convertedReferrals: referralProfiles.convertedReferrals,
        commissionDefaultAmount: referralProfiles.commissionDefaultAmount,
        commissionApprovedAmount: referralProfiles.commissionApprovedAmount,
        userName: users.name,
        userEmail: users.email,
        userPhone: users.phone,
        createdAt: referralProfiles.createdAt,
        updatedAt: referralProfiles.updatedAt,
      })
      .from(referralProfiles)
      .leftJoin(users, eq(users.id, referralProfiles.userId))
      .orderBy(desc(referralProfiles.updatedAt)),
    db
      .select()
      .from(referralWithdrawalRequests)
      .where(eq(referralWithdrawalRequests.status, "pending"))
      .orderBy(desc(referralWithdrawalRequests.createdAt))
      .limit(50),
    db
      .select()
      .from(referralCommissionRequests)
      .where(eq(referralCommissionRequests.status, "pending"))
      .orderBy(desc(referralCommissionRequests.createdAt))
      .limit(50),
    db
      .select()
      .from(referralEvents)
      .orderBy(desc(referralEvents.createdAt))
      .limit(50),
    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(referralSupportMaterials),
  ]);

  const profileUserIds = profiles.map((profile) => profile.userId);
  if (!profileUserIds.length) {
    return {
      programSettings,
      profiles,
      totals: {
        activePartners: 0,
        totalReferrals: 0,
        activeReferrals: 0,
        convertedReferrals: 0,
        campaignsSent: 0,
        contactsReached: 0,
        monthlyRevenue: 0,
        estimatedBalance: 0,
        supportMaterials: Number(supportMaterialsCount[0]?.count || 0),
      },
      partners: [],
      pendingWithdrawals,
      pendingCommissionRequests,
      recentEvents,
    };
  }

  const [attributions, shareLogs, campaigns] = await Promise.all([
    db
      .select()
      .from(referralAttributions)
      .where(inArray(referralAttributions.referrerUserId, profileUserIds))
      .orderBy(desc(referralAttributions.createdAt)),
    db
      .select()
      .from(referralShareLogs)
      .where(inArray(referralShareLogs.userId, profileUserIds))
      .orderBy(desc(referralShareLogs.createdAt)),
    db
      .select({
        id: broadcastCampaigns.id,
        userId: broadcastCampaigns.userId,
        name: broadcastCampaigns.name,
        status: broadcastCampaigns.status,
        totalContacts: broadcastCampaigns.totalContacts,
        sentCount: broadcastCampaigns.sentCount,
        failedCount: broadcastCampaigns.failedCount,
        contactsJson: broadcastCampaigns.contactsJson,
        resultsJson: broadcastCampaigns.resultsJson,
        createdAt: broadcastCampaigns.createdAt,
        completedAt: broadcastCampaigns.completedAt,
      })
      .from(broadcastCampaigns)
      .where(and(inArray(broadcastCampaigns.userId, profileUserIds), eq(broadcastCampaigns.campaignType, "referral_outreach")))
      .orderBy(desc(broadcastCampaigns.createdAt)),
  ]);

  const referredUserIds = Array.from(
    new Set(
      attributions
        .map((item) => item.referredUserId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [referredUsers, referredSubscriptions] = await Promise.all([
    referredUserIds.length
      ? db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            whatsappNumber: users.whatsappNumber,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(inArray(users.id, referredUserIds))
      : Promise.resolve([]),
    referredUserIds.length
      ? db
          .select({
            id: subscriptions.id,
            userId: subscriptions.userId,
            status: subscriptions.status,
            createdAt: subscriptions.createdAt,
            updatedAt: subscriptions.updatedAt,
            dataInicio: subscriptions.dataInicio,
            dataFim: subscriptions.dataFim,
            planName: sql<string>`COALESCE(${subscriptions.planId}::text, '')`,
            planLabel: sql<string>`COALESCE((select nome from plans where plans.id = ${subscriptions.planId}), '')`,
            planValue: sql<string>`COALESCE((select valor::text from plans where plans.id = ${subscriptions.planId}), '0')`,
          })
          .from(subscriptions)
          .where(inArray(subscriptions.userId, referredUserIds))
          .orderBy(desc(subscriptions.createdAt))
      : Promise.resolve([]),
  ]);

  const referredUsersById = new Map(referredUsers.map((item) => [item.id, item]));
  const bestSubscriptionByUserId = new Map<string, (typeof referredSubscriptions)[number]>();

  for (const subscription of referredSubscriptions) {
    const current = bestSubscriptionByUserId.get(subscription.userId);
    if (!current) {
      bestSubscriptionByUserId.set(subscription.userId, subscription);
      continue;
    }

    const nextRank = getReferralSubscriptionRank(subscription.status);
    const currentRank = getReferralSubscriptionRank(current.status);
    const nextTime = new Date(subscription.createdAt || subscription.updatedAt || 0).getTime();
    const currentTime = new Date(current.createdAt || current.updatedAt || 0).getTime();

    if (nextRank > currentRank || (nextRank === currentRank && nextTime > currentTime)) {
      bestSubscriptionByUserId.set(subscription.userId, subscription);
    }
  }

  const attributionsByUserId = new Map<string, typeof attributions>();
  const shareLogsByUserId = new Map<string, typeof shareLogs>();
  const campaignsByUserId = new Map<string, ReturnType<typeof buildReferralCampaignDetails>[]>();

  for (const attribution of attributions) {
    const list = attributionsByUserId.get(attribution.referrerUserId) || [];
    list.push(attribution);
    attributionsByUserId.set(attribution.referrerUserId, list);
  }

  for (const shareLog of shareLogs) {
    const list = shareLogsByUserId.get(shareLog.userId) || [];
    list.push(shareLog);
    shareLogsByUserId.set(shareLog.userId, list);
  }

  for (const campaign of campaigns) {
    const list = campaignsByUserId.get(campaign.userId) || [];
    list.push(buildReferralCampaignDetails(campaign));
    campaignsByUserId.set(campaign.userId, list);
  }

  const partners = profiles.map((profile) => {
    const partnerAttributions = attributionsByUserId.get(profile.userId) || [];
    const partnerShareLogs = shareLogsByUserId.get(profile.userId) || [];
    const partnerCampaigns = campaignsByUserId.get(profile.userId) || [];

    const referrals = partnerAttributions.map((attribution) => {
      const referredUser = attribution.referredUserId ? referredUsersById.get(attribution.referredUserId) : null;
      const currentSubscription = attribution.referredUserId ? bestSubscriptionByUserId.get(attribution.referredUserId) : null;
      const monthlyValue = normalizeMoney(currentSubscription?.planValue || 0);

      return {
        id: attribution.id,
        status: attribution.status,
        sourceChannel: attribution.sourceChannel,
        sourceLabel: attribution.sourceLabel,
        referredUserId: attribution.referredUserId || null,
        name: referredUser?.name || attribution.sourceLabel || "Contato indicado",
        email: referredUser?.email || attribution.referredEmail || null,
        phone: referredUser?.phone || referredUser?.whatsappNumber || attribution.referredPhone || null,
        createdAt: toIsoDate(attribution.createdAt),
        convertedAt: toIsoDate(attribution.convertedAt),
        subscriptionStatus: currentSubscription?.status || null,
        currentPlan: currentSubscription?.planLabel || null,
        monthlyValue,
        isActive: isReferralActiveSubscription(currentSubscription?.status),
      };
    });

    const convertedReferrals = referrals.filter((item) => item.status === "converted" || item.convertedAt).length;
    const activeReferrals = referrals.filter((item) => item.isActive).length;
    const monthlyRevenue = roundMoney(
      referrals.reduce((total, item) => total + (item.isActive ? Number(item.monthlyValue || 0) : 0), 0),
    );
    const totalContactsReached = partnerCampaigns.reduce((total, campaign) => total + campaign.totalContacts, 0);
    const estimatedBalance = roundMoney(normalizeMoney(profile.availableBalance) + normalizeMoney(profile.pendingBalance || 0));

    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.userName || profile.userEmail || profile.userId,
      email: profile.userEmail || "",
      phone: profile.userPhone || "",
      referralCode: profile.referralCode,
      createdAt: toIsoDate(profile.createdAt),
      latestActivityAt: maxIsoDate([
        profile.updatedAt,
        partnerAttributions[0]?.updatedAt,
        partnerShareLogs[0]?.createdAt,
        partnerCampaigns[0]?.createdAt,
      ]),
      balances: {
        available: normalizeMoney(profile.availableBalance),
        lifetime: normalizeMoney(profile.lifetimeBalance),
        estimated: estimatedBalance,
      },
      commissionAmount: normalizeMoney(profile.commissionApprovedAmount || profile.commissionDefaultAmount || programSettings.defaultCommissionAmount || DEFAULT_COMMISSION_AMOUNT),
      metrics: {
        totalReferrals: referrals.length,
        convertedReferrals,
        activeReferrals,
        linkCopies: partnerShareLogs.filter((item) => String(item.channel || "").toLowerCase() === "copy").length,
        campaignsSent: partnerCampaigns.length,
        contactsReached: totalContactsReached,
        monthlyRevenue,
      },
      recentShares: partnerShareLogs.slice(0, 10).map((item) => ({
        id: item.id,
        channel: item.channel,
        contactName: item.contactName || null,
        contactPhone: item.contactPhone || null,
        targetConversationId: item.targetConversationId || null,
        createdAt: toIsoDate(item.createdAt),
      })),
      campaigns: partnerCampaigns.slice(0, 12),
      referrals,
    };
  });

  const totals = partners.reduce(
    (acc, partner) => {
      acc.activePartners += 1;
      acc.totalReferrals += partner.metrics.totalReferrals;
      acc.activeReferrals += partner.metrics.activeReferrals;
      acc.convertedReferrals += partner.metrics.convertedReferrals;
      acc.campaignsSent += partner.metrics.campaignsSent;
      acc.contactsReached += partner.metrics.contactsReached;
      acc.monthlyRevenue += partner.metrics.monthlyRevenue;
      acc.estimatedBalance += partner.balances.estimated;
      return acc;
    },
    {
      activePartners: 0,
      totalReferrals: 0,
      activeReferrals: 0,
      convertedReferrals: 0,
      campaignsSent: 0,
      contactsReached: 0,
      monthlyRevenue: 0,
      estimatedBalance: 0,
      supportMaterials: Number(supportMaterialsCount[0]?.count || 0),
    },
  );

  return {
    programSettings,
    profiles,
    totals: {
      ...totals,
      monthlyRevenue: roundMoney(totals.monthlyRevenue),
      estimatedBalance: roundMoney(totals.estimatedBalance),
    },
    partners,
    pendingWithdrawals,
    pendingCommissionRequests,
    recentEvents,
  };
}

export async function getReferralSupportMaterials(page = 1, limit = 10) {
  return listReferralSupportMaterials({ page, limit }, Math.min(Number(limit) || 10, SUPPORT_MATERIAL_MAX_PAGE_SIZE));
}

export async function updateReferralProgramCommission(params: {
  amount: number | string;
  reviewedBy: string;
}) {
  const amount = roundMoney(parseFlexibleMoney(params.amount));
  if (amount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  const currentSettings = await ensureReferralProgramSettings();
  const nextAmount = formatMoney(amount);
  const previousAmount = String(currentSettings.defaultCommissionAmount || DEFAULT_COMMISSION_AMOUNT);

  await db
    .update(referralProgramSettings)
    .set({
      defaultCommissionAmount: nextAmount,
      updatedAt: new Date(),
    })
    .where(eq(referralProgramSettings.id, currentSettings.id));

  await db
    .update(referralProfiles)
    .set({
      commissionDefaultAmount: nextAmount,
      updatedAt: new Date(),
    })
    .where(sql`true`);

  await db
    .update(referralProfiles)
    .set({
      commissionApprovedAmount: nextAmount,
      commissionApprovedAt: new Date(),
      commissionApprovedBy: params.reviewedBy,
      updatedAt: new Date(),
    })
    .where(
      and(
        sql`${referralProfiles.commissionApprovedAmount} IS NOT NULL`,
        eq(referralProfiles.commissionApprovedAmount, previousAmount),
      ),
    );

  return {
    previousAmount: normalizeMoney(previousAmount),
    amount,
  };
}

export async function approveCommissionRequest(params: {
  requestId: string;
  approvedAmount: number | string;
  reviewedBy: string;
  adminNotes?: string | null;
}) {
  const request = await db.query.referralCommissionRequests.findFirst({
    where: eq(referralCommissionRequests.id, params.requestId),
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");
  const approvedAmount = roundMoney(parseFlexibleMoney(params.approvedAmount));
  if (approvedAmount <= 0) {
    throw new Error("INVALID_AMOUNT");
  }

  await db
    .update(referralCommissionRequests)
    .set({
      status: "approved",
      approvedAmount: formatMoney(approvedAmount),
      reviewedBy: params.reviewedBy,
      reviewedAt: new Date(),
      adminNotes: params.adminNotes || null,
      updatedAt: new Date(),
    })
    .where(eq(referralCommissionRequests.id, params.requestId));

  await db
    .update(referralProfiles)
    .set({
      commissionApprovedAmount: formatMoney(approvedAmount),
      commissionApprovedAt: new Date(),
      commissionApprovedBy: params.reviewedBy,
      updatedAt: new Date(),
    })
    .where(eq(referralProfiles.id, request.profileId));
}

export async function approveWithdrawalRequest(params: {
  requestId: string;
  reviewedBy: string;
  adminNotes?: string | null;
}) {
  const request = await db.query.referralWithdrawalRequests.findFirst({
    where: eq(referralWithdrawalRequests.id, params.requestId),
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");

  await db
    .update(referralWithdrawalRequests)
    .set({
      status: "paid",
      reviewedBy: params.reviewedBy,
      reviewedAt: new Date(),
      paidAt: new Date(),
      adminNotes: params.adminNotes || null,
      updatedAt: new Date(),
    })
    .where(eq(referralWithdrawalRequests.id, params.requestId));

  await db
    .update(referralWalletLedger)
    .set({
      status: "withdrawn",
    })
    .where(
      and(
        eq(referralWalletLedger.userId, request.userId),
        eq(referralWalletLedger.entryType, "withdrawal_request"),
        sql`${referralWalletLedger.metadataJson}->>'withdrawalRequestId' = ${request.id}`,
      ),
    );

  await recalculateProfileBalances(request.profileId);
}

type ReferralOutreachMessageInput = {
  contactName: string;
  conversationSummary?: string | null;
  recentMessages: Array<{ fromMe: boolean; text: string; timestamp?: string }>;
  shareUrl: string;
  baseMessage?: string | null;
};

export async function generateReferralOutreachMessage(input: ReferralOutreachMessageInput) {
  const messagesBundle = input.recentMessages
    .slice(-8)
    .map((message) => `${message.fromMe ? "EU" : "CONTATO"}: ${message.text}`)
    .join("\n");

  const llmResult = await callJsonLlm<{ message?: string }>([
    {
      role: "system",
      content:
        "Voce escreve uma unica mensagem curta de indicacao via WhatsApp, natural, contextual e em primeira pessoa.\n" +
        "Regras:\n" +
        "1. Continue a conversa se ela ja aconteceu hoje.\n" +
        "2. Nao cumprimente de novo se o contexto mostrar conversa no mesmo dia.\n" +
        "3. Preserve a ideia central da mensagem-base fornecida pelo usuario.\n" +
        "4. Escreva como quem esta recomendando uma ferramenta que realmente usa na propria empresa, nunca como vendedor oficial do SaaS.\n" +
        "5. Fale dos beneficios reais: responder clientes com IA, organizar CRM, fazer follow-up e ganhar tempo.\n" +
        "6. Nao mencione preco nem plano por padrao. So fale de valor se a mensagem-base pedir isso explicitamente.\n" +
        `7. Inclua o link ${input.shareUrl} e o WhatsApp oficial ${OFFICIAL_WHATSAPP} sem colocar ponto final colado no link.\n` +
        "8. Nao diga que eh robo, nao use marcacao, nao use aspas, nao escreva mais de 420 caracteres.\n" +
        "9. Retorne JSON puro: {\"message\":\"...\"}.",
    },
    {
      role: "user",
      content:
        `Contato: ${input.contactName}\n` +
        `Mensagem-base: ${String(input.baseMessage || "sem mensagem-base")}\n` +
        `Resumo: ${String(input.conversationSummary || "sem resumo")}\n` +
        `Historico recente:\n${messagesBundle || "sem historico"}\n`,
    },
  ]);

  const fallback = buildReferralOutreachFallbackMessage(input);
  const resolvedMessage = String(llmResult?.message || fallback).trim();
  return finalizeReferralOutreachMessage(resolvedMessage, input.shareUrl);
}

async function buildReferralCampaignContacts(params: {
  userId: string;
  contactIds?: string[];
  conversationIds?: string[];
}) {
  const [connected] = await db
    .select()
    .from(whatsappConnections)
    .where(and(eq(whatsappConnections.userId, params.userId), eq(whatsappConnections.isConnected, true)))
    .limit(1);

  if (!connected) {
    throw new Error("WHATSAPP_NOT_CONNECTED");
  }

  const filters: string[] = [];
  if (params.conversationIds?.length) {
    filters.push("conversation");
  }
  if (params.contactIds?.length) {
    filters.push("contact");
  }

  const conversationsFound = params.conversationIds?.length
    ? await db
        .select({
          id: conversations.id,
          contactName: conversations.contactName,
          contactNumber: conversations.contactNumber,
          memorySummary: conversations.kanbanNotes,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.connectionId, connected.id),
            inArray(conversations.id, params.conversationIds),
          ),
        )
    : [];

  const contactsFound = params.contactIds?.length
    ? await db
        .select({
          id: conversations.id,
          contactName: conversations.contactName,
          contactNumber: conversations.contactNumber,
          memorySummary: conversations.kanbanNotes,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.connectionId, connected.id),
            inArray(conversations.id, params.contactIds),
          ),
        )
    : [];

  return { connection: connected, conversations: [...conversationsFound, ...contactsFound], filters };
}

export async function prepareReferralOutreachCampaign(params: {
  userId: string;
  contactIds?: string[];
  conversationIds?: string[];
  name?: string;
  baseMessage?: string | null;
}) {
  const { profile } = await ensureReferralProfile(params.userId);
  const shareUrl = buildShareUrl(profile.referralCode);
  const { connection, conversations: selectedConversations } = await buildReferralCampaignContacts(params);

  const preparedContacts: Array<{
    id: string;
    phone: string;
    name: string;
    message: string;
    conversationId: string;
  }> = [];

  for (const conversation of selectedConversations) {
    const recentMessages = await storage.getMessagesByConversationId(conversation.id);
    const simplifiedMessages = recentMessages.slice(-8).map((message) => ({
      fromMe: Boolean(message.fromMe),
      text: String(message.text || message.mediaCaption || "").trim(),
      timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : undefined,
    })).filter((item) => item.text);

    const message = await generateReferralOutreachMessage({
      contactName: conversation.contactName || "Cliente",
      conversationSummary: conversation.memorySummary || null,
      recentMessages: simplifiedMessages,
      shareUrl,
      baseMessage: params.baseMessage || null,
    });

    preparedContacts.push({
      id: conversation.id,
      phone: conversation.contactNumber,
      name: conversation.contactName || "Cliente",
      message,
      conversationId: conversation.id,
    });
  }

  const payload = {
    userId: params.userId,
    connectionId: connection.id,
    name: params.name || `Indique e Ganhe ${new Date().toLocaleString("pt-BR")}`,
    messageTemplate: "Mensagem personalizada por contato",
    totalContacts: preparedContacts.length,
    contactsJson: preparedContacts.map((contact) => ({
      id: contact.id,
      phone: contact.phone,
      name: contact.name,
    })),
    resultsJson: [],
    campaignType: "referral_outreach",
    metadataJson: {
      referralCode: profile.referralCode,
      shareUrl,
      officialWhatsapp: OFFICIAL_WHATSAPP,
      baseMessage: params.baseMessage || null,
      preparedMessages: preparedContacts.reduce<Record<string, { message: string; conversationId: string }>>((acc, contact) => {
        acc[contact.id] = { message: contact.message, conversationId: contact.conversationId };
        return acc;
      }, {}),
    },
    useAi: true,
    delayMinMs: 60000,
    delayMaxMs: 300000,
    batchSize: 10,
    batchPauseMs: 600000,
  };

  const [campaign] = await db.insert(broadcastCampaigns).values(payload as any).returning();
  return { campaign, shareUrl, preparedContacts };
}
