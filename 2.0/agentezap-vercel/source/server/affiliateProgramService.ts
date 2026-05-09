import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";

import {
  adminConversations,
  broadcastCampaigns,
  plans,
  subscriptions,
  users,
  type Plan,
  type Subscription,
  type User,
} from "@shared/schema";

import { db } from "./db";
import { storage } from "./storage";

const AFFILIATE_SETTINGS_KEY = "affiliate_program_settings";
const AFFILIATE_PROFILES_KEY = "affiliate_profiles";
const AFFILIATE_REFERRALS_KEY = "affiliate_referrals";
const AFFILIATE_EVENTS_KEY = "affiliate_activity_log";
const AFFILIATE_CAMPAIGN_PREFIX = "Afiliado:";
const DEFAULT_REWARD_PER_REFERRAL = 50;
const DEFAULT_SUPPORT_WHATSAPP = "5517981679818";
const MAX_AFFILIATE_EVENTS = 5000;

type NullableString = string | null | undefined;

type AffiliateProgramSettings = {
  rewardPerReferral: number;
  supportWhatsapp: string;
  updatedAt: string;
};

type AffiliateProfile = {
  userId: string;
  code: string;
  createdAt: string;
};

type AffiliateReferral = {
  referredUserId: string;
  referrerUserId: string;
  referralCode: string;
  createdAt: string;
};

type AffiliateEventType =
  | "link_copied"
  | "message_copied"
  | "campaign_draft_opened"
  | "campaign_sent";

type AffiliateEvent = {
  id: string;
  userId: string;
  type: AffiliateEventType;
  createdAt: string;
  meta?: Record<string, unknown>;
};

type SubscriptionWithPlan = {
  subscription: Subscription;
  plan: Plan | null;
};

type AdminConversationSummary = {
  id: string;
  contactName: string | null;
  lastMessageText: string | null;
  lastMessageTime: string | null;
  contactNumber: string;
};

type AffiliateClientSummary = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  whatsappNumber: string;
  createdAt: string | null;
  referralCode: string;
  subscriptionStatus: string;
  currentPlan: string;
  monthlyValue: number;
  isActive: boolean;
  conversation: AdminConversationSummary | null;
};

type AffiliateShareAssets = {
  code: string;
  sharePath: string;
  shareMessage: string;
  campaignName: string;
  campaignMessage: string;
};

type AffiliateDashboardData = {
  settings: AffiliateProgramSettings;
  profile: AffiliateProfile;
  assets: AffiliateShareAssets;
  metrics: {
    totalReferrals: number;
    activeReferrals: number;
    linkCopies: number;
    messageCopies: number;
    campaignDrafts: number;
    campaignsSent: number;
    contactsReached: number;
    monthlyRevenue: number;
    estimatedBalance: number;
  };
  referredClients: AffiliateClientSummary[];
  recentEvents: AffiliateEvent[];
};

type AdminAffiliatePartnerSummary = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string | null;
  profile: AffiliateProfile;
  metrics: AffiliateDashboardData["metrics"];
  latestActivityAt: string | null;
  referredClients: AffiliateClientSummary[];
};

type AdminAffiliateOverview = {
  settings: AffiliateProgramSettings;
  totals: {
    activePartners: number;
    totalReferrals: number;
    activeReferrals: number;
    monthlyRevenue: number;
    estimatedBalance: number;
    linkCopies: number;
    campaignsSent: number;
    contactsReached: number;
  };
  partners: AdminAffiliatePartnerSummary[];
};

function parseJson<T>(value: NullableString, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function readConfigJson<T>(key: string, fallback: T): Promise<T> {
  const config = await storage.getSystemConfig(key);
  return parseJson(config?.valor, fallback);
}

async function saveConfigJson(key: string, value: unknown): Promise<void> {
  await storage.updateSystemConfig(key, JSON.stringify(value));
}

function digitsOnly(value: NullableString): string {
  const source = String(value || "");
  let result = "";

  for (const character of source) {
    if (character >= "0" && character <= "9") {
      result += character;
    }
  }

  return result;
}

function cleanCodeFragment(value: NullableString): string {
  const source = String(value || "").toUpperCase();
  let result = "";

  for (const character of source) {
    const isLetter = character >= "A" && character <= "Z";
    const isDigit = character >= "0" && character <= "9";

    if (isLetter || isDigit) {
      result += character;
    }
  }

  return result;
}

function buildAffiliateSeed(user: Pick<User, "id" | "name" | "email">): string {
  const source = cleanCodeFragment(user.name || user.email || "CLIENTE");
  const prefix = source.slice(0, 6) || "AGENTE";
  const suffix = cleanCodeFragment(user.id).slice(0, 4) || "2026";
  return `${prefix}${suffix}`;
}

function buildUniqueAffiliateCode(seed: string, allProfiles: AffiliateProfile[]): string {
  const usedCodes = new Set(allProfiles.map((profile) => profile.code.toUpperCase()));
  const normalizedSeed = cleanCodeFragment(seed) || "AGENTE2026";

  if (!usedCodes.has(normalizedSeed)) {
    return normalizedSeed;
  }

  for (let attempt = 2; attempt < 999; attempt += 1) {
    const candidate = `${normalizedSeed}${attempt}`;
    if (!usedCodes.has(candidate)) {
      return candidate;
    }
  }

  return `${normalizedSeed}${Date.now()}`;
}

function parseCurrency(value: NullableString | number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const source = String(value || "").trim();
  if (!source) {
    return 0;
  }

  const normalized = source.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isActiveSubscription(status: NullableString): boolean {
  const normalized = String(status || "").toLowerCase();

  return (
    normalized === "active" ||
    normalized === "approved" ||
    normalized === "authorized" ||
    normalized === "trialing" ||
    normalized === "trial"
  );
}

function isAffiliateCampaignName(name: NullableString): boolean {
  const normalized = String(name || "").trim().toLowerCase();
  return normalized.startsWith(AFFILIATE_CAMPAIGN_PREFIX.toLowerCase());
}

async function loadAffiliateSettings(): Promise<AffiliateProgramSettings> {
  const stored = await readConfigJson<Partial<AffiliateProgramSettings>>(AFFILIATE_SETTINGS_KEY, {});

  return {
    rewardPerReferral:
      typeof stored.rewardPerReferral === "number" && Number.isFinite(stored.rewardPerReferral)
        ? stored.rewardPerReferral
        : DEFAULT_REWARD_PER_REFERRAL,
    supportWhatsapp: stored.supportWhatsapp || DEFAULT_SUPPORT_WHATSAPP,
    updatedAt: stored.updatedAt || new Date(0).toISOString(),
  };
}

async function loadAffiliateProfiles(): Promise<AffiliateProfile[]> {
  const profiles = await readConfigJson<AffiliateProfile[]>(AFFILIATE_PROFILES_KEY, []);
  return Array.isArray(profiles) ? profiles : [];
}

async function loadAffiliateReferrals(): Promise<AffiliateReferral[]> {
  const referrals = await readConfigJson<AffiliateReferral[]>(AFFILIATE_REFERRALS_KEY, []);
  return Array.isArray(referrals) ? referrals : [];
}

async function loadAffiliateEvents(): Promise<AffiliateEvent[]> {
  const events = await readConfigJson<AffiliateEvent[]>(AFFILIATE_EVENTS_KEY, []);
  return Array.isArray(events) ? events : [];
}

function buildSharePath(code: string): string {
  return `/indicacoes?ref=${encodeURIComponent(code)}`;
}

function buildShareMessage(rewardPerReferral: number, sharePath: string): string {
  return [
    `Uso o AgenteZap para automatizar meu WhatsApp e eles pagam R$ ${rewardPerReferral.toFixed(2).replace(".", ",")} por indicacao aprovada.`,
    `Se quiser ver como funciona e criar sua conta, entra aqui: ${sharePath}`,
    "Se precisar, eu te explico o passo a passo.",
  ].join(" ");
}

function buildCampaignMessage(rewardPerReferral: number, sharePath: string): string {
  return [
    "Oi! Estou usando o AgenteZap para vendas e atendimento no WhatsApp e vale a pena conhecer.",
    `Se voce criar sua conta por este link, eu ganho R$ ${rewardPerReferral.toFixed(2).replace(".", ",")} e voce conhece a plataforma completa: ${sharePath}`,
    "Se quiser, te mostro como conectar e deixar rodando rapido.",
  ].join(" ");
}

function buildShareAssets(profile: AffiliateProfile, settings: AffiliateProgramSettings): AffiliateShareAssets {
  const sharePath = buildSharePath(profile.code);

  return {
    code: profile.code,
    sharePath,
    shareMessage: buildShareMessage(settings.rewardPerReferral, sharePath),
    campaignName: `${AFFILIATE_CAMPAIGN_PREFIX} indique e ganhe`,
    campaignMessage: buildCampaignMessage(settings.rewardPerReferral, sharePath),
  };
}

async function ensureAffiliateProfile(user: Pick<User, "id" | "name" | "email">): Promise<AffiliateProfile> {
  const profiles = await loadAffiliateProfiles();
  const existing = profiles.find((profile) => profile.userId === user.id);

  if (existing) {
    return existing;
  }

  const created: AffiliateProfile = {
    userId: user.id,
    code: buildUniqueAffiliateCode(buildAffiliateSeed(user), profiles),
    createdAt: new Date().toISOString(),
  };

  profiles.push(created);
  await saveConfigJson(AFFILIATE_PROFILES_KEY, profiles);
  return created;
}

async function getProfilesByUserIds(userIds: string[]): Promise<Map<string, AffiliateProfile>> {
  const profiles = await loadAffiliateProfiles();
  const profileMap = new Map<string, AffiliateProfile>();

  for (const profile of profiles) {
    if (userIds.includes(profile.userId)) {
      profileMap.set(profile.userId, profile);
    }
  }

  return profileMap;
}

async function getSubscriptionMapForUsers(userIds: string[]): Promise<Map<string, SubscriptionWithPlan>> {
  const result = new Map<string, SubscriptionWithPlan>();

  if (userIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      subscription: subscriptions,
      plan: plans,
    })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(inArray(subscriptions.userId, userIds))
    .orderBy(desc(subscriptions.createdAt));

  for (const row of rows) {
    if (!result.has(row.subscription.userId)) {
      result.set(row.subscription.userId, {
        subscription: row.subscription,
        plan: row.plan,
      });
    }
  }

  return result;
}

async function getConversationMaps(userIds: string[], usersById: Map<string, User>) {
  const byUserId = new Map<string, AdminConversationSummary>();
  const byDigits = new Map<string, AdminConversationSummary>();

  if (userIds.length === 0) {
    return { byUserId, byDigits };
  }

  const rows = await db
    .select()
    .from(adminConversations)
    .orderBy(desc(adminConversations.updatedAt))
    .limit(1500);

  const relevantDigitSet = new Set<string>();
  for (const userId of userIds) {
    const user = usersById.get(userId);
    if (!user) {
      continue;
    }

    const phoneDigits = digitsOnly(user.phone);
    const whatsappDigits = digitsOnly(user.whatsappNumber);

    if (phoneDigits) {
      relevantDigitSet.add(phoneDigits);
    }
    if (whatsappDigits) {
      relevantDigitSet.add(whatsappDigits);
    }
  }

  for (const row of rows) {
    const summary: AdminConversationSummary = {
      id: row.id,
      contactName: row.contactName,
      lastMessageText: row.lastMessageText,
      lastMessageTime: row.lastMessageTime ? row.lastMessageTime.toISOString() : null,
      contactNumber: row.contactNumber,
    };

    if (row.linkedUserId && userIds.includes(row.linkedUserId) && !byUserId.has(row.linkedUserId)) {
      byUserId.set(row.linkedUserId, summary);
    }

    const digits = digitsOnly(row.contactNumber);
    if (digits && relevantDigitSet.has(digits) && !byDigits.has(digits)) {
      byDigits.set(digits, summary);
    }
  }

  return { byUserId, byDigits };
}

async function getAffiliateCampaigns(userIds: string[]) {
  if (userIds.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(broadcastCampaigns)
    .where(inArray(broadcastCampaigns.userId, userIds))
    .orderBy(desc(broadcastCampaigns.createdAt));

  return rows.filter((campaign) => isAffiliateCampaignName(campaign.name));
}

function pickConversationForUser(
  user: User,
  byUserId: Map<string, AdminConversationSummary>,
  byDigits: Map<string, AdminConversationSummary>,
): AdminConversationSummary | null {
  const direct = byUserId.get(user.id);
  if (direct) {
    return direct;
  }

  const phoneDigits = digitsOnly(user.phone);
  if (phoneDigits && byDigits.has(phoneDigits)) {
    return byDigits.get(phoneDigits) || null;
  }

  const whatsappDigits = digitsOnly(user.whatsappNumber);
  if (whatsappDigits && byDigits.has(whatsappDigits)) {
    return byDigits.get(whatsappDigits) || null;
  }

  return null;
}

function buildClientSummary(
  referredUser: User,
  referral: AffiliateReferral,
  subscriptionWithPlan: SubscriptionWithPlan | undefined,
  conversation: AdminConversationSummary | null,
): AffiliateClientSummary {
  const monthlyValue = subscriptionWithPlan
    ? parseCurrency(subscriptionWithPlan.subscription.couponPrice) || parseCurrency(subscriptionWithPlan.plan?.valor)
    : 0;
  const subscriptionStatus = subscriptionWithPlan?.subscription.status || "lead";

  return {
    userId: referredUser.id,
    name: referredUser.name,
    email: referredUser.email || "",
    phone: referredUser.phone || "",
    whatsappNumber: referredUser.whatsappNumber || "",
    createdAt: referredUser.createdAt ? referredUser.createdAt.toISOString() : null,
    referralCode: referral.referralCode,
    subscriptionStatus,
    currentPlan: subscriptionWithPlan?.plan?.nome || "Sem assinatura",
    monthlyValue,
    isActive: isActiveSubscription(subscriptionStatus),
    conversation,
  };
}

function eventCount(events: AffiliateEvent[], type: AffiliateEventType): number {
  let total = 0;
  for (const event of events) {
    if (event.type === type) {
      total += 1;
    }
  }
  return total;
}

function lastEventAt(events: AffiliateEvent[]): string | null {
  if (events.length === 0) {
    return null;
  }

  const ordered = [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return ordered[0]?.createdAt || null;
}

function buildMetrics(
  referredClients: AffiliateClientSummary[],
  events: AffiliateEvent[],
  campaigns: Array<(typeof broadcastCampaigns.$inferSelect)>,
  settings: AffiliateProgramSettings,
): AffiliateDashboardData["metrics"] {
  let activeReferrals = 0;
  let monthlyRevenue = 0;

  for (const client of referredClients) {
    if (client.isActive) {
      activeReferrals += 1;
      monthlyRevenue += client.monthlyValue;
    }
  }

  let contactsReached = 0;
  for (const campaign of campaigns) {
    contactsReached += campaign.sentCount || 0;
  }

  return {
    totalReferrals: referredClients.length,
    activeReferrals,
    linkCopies: eventCount(events, "link_copied"),
    messageCopies: eventCount(events, "message_copied"),
    campaignDrafts: eventCount(events, "campaign_draft_opened"),
    campaignsSent: campaigns.length,
    contactsReached,
    monthlyRevenue,
    estimatedBalance: activeReferrals * settings.rewardPerReferral,
  };
}

async function buildAffiliateDashboardInternal(user: User): Promise<AffiliateDashboardData> {
  const settings = await loadAffiliateSettings();
  const profile = await ensureAffiliateProfile(user);
  const referrals = await loadAffiliateReferrals();
  const events = (await loadAffiliateEvents()).filter((event) => event.userId === user.id);
  const affiliateCampaignRows = await getAffiliateCampaigns([user.id]);

  const ownReferrals = referrals.filter((referral) => referral.referrerUserId === user.id);
  const referredIds = ownReferrals.map((referral) => referral.referredUserId);

  const referredUsers =
    referredIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, referredIds))
      : [];

  const usersById = new Map<string, User>(referredUsers.map((item) => [item.id, item]));
  const subscriptionMap = await getSubscriptionMapForUsers(referredIds);
  const conversationMaps = await getConversationMaps(referredIds, usersById);

  const referredClients = ownReferrals
    .map((referral) => {
      const referredUser = usersById.get(referral.referredUserId);
      if (!referredUser) {
        return null;
      }

      return buildClientSummary(
        referredUser,
        referral,
        subscriptionMap.get(referredUser.id),
        pickConversationForUser(referredUser, conversationMaps.byUserId, conversationMaps.byDigits),
      );
    })
    .filter((item): item is AffiliateClientSummary => Boolean(item))
    .sort((left, right) => right.monthlyValue - left.monthlyValue || left.name.localeCompare(right.name));

  return {
    settings,
    profile,
    assets: buildShareAssets(profile, settings),
    metrics: buildMetrics(referredClients, events, affiliateCampaignRows, settings),
    referredClients,
    recentEvents: [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 10),
  };
}

export async function getAffiliateDashboard(userId: string): Promise<AffiliateDashboardData> {
  const user = await storage.getUser(userId);

  if (!user) {
    throw new Error("Usuario nao encontrado");
  }

  return buildAffiliateDashboardInternal(user);
}

export async function trackAffiliateEvent(
  userId: string,
  type: AffiliateEventType,
  meta?: Record<string, unknown>,
): Promise<AffiliateEvent> {
  const events = await loadAffiliateEvents();
  const created: AffiliateEvent = {
    id: randomUUID(),
    userId,
    type,
    createdAt: new Date().toISOString(),
    meta,
  };

  events.push(created);

  if (events.length > MAX_AFFILIATE_EVENTS) {
    const trimmed = events.slice(events.length - MAX_AFFILIATE_EVENTS);
    await saveConfigJson(AFFILIATE_EVENTS_KEY, trimmed);
  } else {
    await saveConfigJson(AFFILIATE_EVENTS_KEY, events);
  }

  return created;
}

export async function attachAffiliateReferralByCode(
  referredUserId: string,
  referralCode: string,
): Promise<AffiliateReferral | null> {
  const normalizedCode = cleanCodeFragment(referralCode);
  if (!normalizedCode) {
    return null;
  }

  const profiles = await loadAffiliateProfiles();
  const referrerProfile = profiles.find((profile) => profile.code.toUpperCase() === normalizedCode.toUpperCase());
  if (!referrerProfile || referrerProfile.userId === referredUserId) {
    return null;
  }

  const referrals = await loadAffiliateReferrals();
  const existing = referrals.find((referral) => referral.referredUserId === referredUserId);
  if (existing) {
    return existing;
  }

  const created: AffiliateReferral = {
    referredUserId,
    referrerUserId: referrerProfile.userId,
    referralCode: referrerProfile.code,
    createdAt: new Date().toISOString(),
  };

  referrals.push(created);
  await saveConfigJson(AFFILIATE_REFERRALS_KEY, referrals);
  return created;
}

export async function getAffiliatePublicConfig(): Promise<AffiliateProgramSettings> {
  return loadAffiliateSettings();
}

export async function updateAffiliateProgramSettings(
  partial: Partial<Pick<AffiliateProgramSettings, "rewardPerReferral" | "supportWhatsapp">>,
): Promise<AffiliateProgramSettings> {
  const current = await loadAffiliateSettings();
  const next: AffiliateProgramSettings = {
    rewardPerReferral:
      typeof partial.rewardPerReferral === "number" && Number.isFinite(partial.rewardPerReferral)
        ? partial.rewardPerReferral
        : current.rewardPerReferral,
    supportWhatsapp: partial.supportWhatsapp || current.supportWhatsapp,
    updatedAt: new Date().toISOString(),
  };

  await saveConfigJson(AFFILIATE_SETTINGS_KEY, next);
  return next;
}

export async function getAdminAffiliateOverview(): Promise<AdminAffiliateOverview> {
  const settings = await loadAffiliateSettings();
  const profiles = await loadAffiliateProfiles();
  const referrals = await loadAffiliateReferrals();
  const events = await loadAffiliateEvents();

  const candidateIds = new Set<string>();
  for (const profile of profiles) {
    candidateIds.add(profile.userId);
  }
  for (const referral of referrals) {
    candidateIds.add(referral.referrerUserId);
  }
  for (const event of events) {
    candidateIds.add(event.userId);
  }

  const userIds = Array.from(candidateIds);
  const partnerUsers =
    userIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, userIds))
      : [];

  const partnerById = new Map<string, User>(partnerUsers.map((item) => [item.id, item]));
  const ensuredProfiles = await getProfilesByUserIds(userIds);
  const allAffiliateCampaigns = await getAffiliateCampaigns(userIds);

  const referredIds = referrals.map((referral) => referral.referredUserId);
  const referredUsers =
    referredIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, referredIds))
      : [];
  const referredUsersById = new Map<string, User>(referredUsers.map((item) => [item.id, item]));
  const subscriptionMap = await getSubscriptionMapForUsers(referredIds);
  const conversationMaps = await getConversationMaps(referredIds, referredUsersById);

  const partners: AdminAffiliatePartnerSummary[] = [];

  for (const partnerId of userIds) {
    const partnerUser = partnerById.get(partnerId);
    if (!partnerUser) {
      continue;
    }

    const profile = ensuredProfiles.get(partnerId) || (await ensureAffiliateProfile(partnerUser));
    const partnerEvents = events.filter((event) => event.userId === partnerId);
    const partnerCampaigns = allAffiliateCampaigns.filter((campaign) => campaign.userId === partnerId);
    const partnerReferrals = referrals.filter((referral) => referral.referrerUserId === partnerId);

    const referredClients = partnerReferrals
      .map((referral) => {
        const referredUser = referredUsersById.get(referral.referredUserId);
        if (!referredUser) {
          return null;
        }

        return buildClientSummary(
          referredUser,
          referral,
          subscriptionMap.get(referredUser.id),
          pickConversationForUser(referredUser, conversationMaps.byUserId, conversationMaps.byDigits),
        );
      })
      .filter((item): item is AffiliateClientSummary => Boolean(item))
      .sort((left, right) => right.monthlyValue - left.monthlyValue || left.name.localeCompare(right.name));

    const metrics = buildMetrics(referredClients, partnerEvents, partnerCampaigns, settings);

    partners.push({
      userId: partnerUser.id,
      name: partnerUser.name,
      email: partnerUser.email || "",
      phone: partnerUser.phone || "",
      createdAt: partnerUser.createdAt ? partnerUser.createdAt.toISOString() : null,
      profile,
      metrics,
      latestActivityAt: lastEventAt(partnerEvents),
      referredClients,
    });
  }

  partners.sort(
    (left, right) =>
      right.metrics.estimatedBalance - left.metrics.estimatedBalance ||
      right.metrics.totalReferrals - left.metrics.totalReferrals ||
      left.name.localeCompare(right.name),
  );

  const totals = partners.reduce(
    (accumulator, partner) => {
      accumulator.activePartners += 1;
      accumulator.totalReferrals += partner.metrics.totalReferrals;
      accumulator.activeReferrals += partner.metrics.activeReferrals;
      accumulator.monthlyRevenue += partner.metrics.monthlyRevenue;
      accumulator.estimatedBalance += partner.metrics.estimatedBalance;
      accumulator.linkCopies += partner.metrics.linkCopies;
      accumulator.campaignsSent += partner.metrics.campaignsSent;
      accumulator.contactsReached += partner.metrics.contactsReached;
      return accumulator;
    },
    {
      activePartners: 0,
      totalReferrals: 0,
      activeReferrals: 0,
      monthlyRevenue: 0,
      estimatedBalance: 0,
      linkCopies: 0,
      campaignsSent: 0,
      contactsReached: 0,
    },
  );

  return {
    settings,
    totals,
    partners,
  };
}
