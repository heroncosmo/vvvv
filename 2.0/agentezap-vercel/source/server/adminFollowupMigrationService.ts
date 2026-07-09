import { db } from "./db";
import {
  adminConversations,
  admins,
  conversations,
  followupConfigs,
  followupLogs,
  systemConfig,
  userFollowupLogs,
  users,
  whatsappConnections,
} from "@shared/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { buildMissingFollowUpScheduleDate } from "./userFollowUpScheduling";
import { sanitizeAdminFollowupConfig } from "./adminMessagingFeaturePolicy";

const GLOBAL_FOLLOWUP_CONFIG_KEY = "admin_followup_global_config";

export const LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG = {
  enabled: true,
  maxAttempts: 8,
  intervalsMinutes: [10, 30, 180, 1440, 4320, 10080, 259200, 432000],
  finalMinDays: 15,
  finalMaxDays: 30,
  businessHoursStart: "09:00",
  businessHoursEnd: "18:00",
  businessDays: [1, 2, 3, 4, 5],
  respectBusinessHours: true,
  tone: "friendly",
  formalityLevel: 3,
  useEmojis: true,
  importantInfo: [],
  infiniteLoop: true,
  infiniteLoopMinDays: 15,
  infiniteLoopMaxDays: 30,
};

export type AdminFollowupConfig = typeof LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG;

function normalizeTimeValue(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parts = value.split(":").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return fallback;
  const hour = (parts[0] || "00").padStart(2, "0").slice(0, 2);
  const minute = (parts[1] || "00").padStart(2, "0").slice(0, 2);
  return `${hour}:${minute}`;
}

function normalizeBusinessDays(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeIntervals(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDateKey(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value as any);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function buildLogDedupKey(data: {
  conversationId?: string | null;
  contactNumber?: string | null;
  status?: string | null;
  stage?: number | null;
  executedAt?: Date | string | null;
  messageContent?: string | null;
  errorReason?: string | null;
}) {
  return [
    data.conversationId || "",
    data.contactNumber || "",
    data.status || "",
    String(data.stage ?? ""),
    normalizeDateKey(data.executedAt),
    normalizeText(data.messageContent),
    normalizeText(data.errorReason),
  ].join("|");
}

type AdminMigrationState = {
  sourceUserId?: string;
  sourceConversationId?: string;
  sourceStage?: number;
  sourceNextFollowupAt?: string | null;
  migratedAt?: string;
  migratedBackAt?: string;
  migratedBackToConversationId?: string;
  migratedBackStrategy?: string;
  migratedBackReason?: string | null;
};

type AdminContextState = {
  followupMigration?: AdminMigrationState;
};

type RestorePlanInput = {
  config: any;
  sourceStage?: unknown;
  sourceNextFollowupAt?: unknown;
  sourceLastMessageTime?: unknown;
  adminStage?: unknown;
  adminNextFollowupAt?: unknown;
  adminFollowupActive?: unknown;
  adminLastMessageTime?: unknown;
  latestLogStatus?: unknown;
  latestLogReason?: unknown;
  paymentStatus?: unknown;
  now?: Date;
  randomFn?: () => number;
};

type RestorePlan = {
  followupActive: boolean;
  followupStage: number;
  nextFollowupAt: Date | null;
  followupDisabledReason: string | null;
  strategy: string;
};

const ADMIN_MIGRATION_STOP_MARKERS = [
  "nao receber",
  "não receber",
  "parar de enviar",
  "parar de mandar",
  "nao quero",
  "não quero",
  "sem interesse",
  "nao tenho interesse",
  "não tenho interesse",
  "nao chamar",
  "não chamar",
  "pare de chamar",
  "pare de mandar",
  "irrita",
  "irritad",
  "opt-out",
];

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAdminMigrationState(contextState: unknown): AdminMigrationState | null {
  if (!contextState || typeof contextState !== "object") {
    return null;
  }

  const migration = (contextState as AdminContextState).followupMigration;
  if (!migration || typeof migration !== "object") {
    return null;
  }

  return migration;
}

export function isAdminConversationMigratedBack(contextState: unknown): boolean {
  return Boolean(normalizeText(getAdminMigrationState(contextState)?.migratedBackAt));
}

export function isSystemAdminMigrationReason(reason: unknown): boolean {
  const normalized = normalizeText(reason).toLowerCase();
  if (!normalized) return false;
  const isConsolidatedMigration =
    normalized.includes("consolidada para admin") &&
    (normalized.includes("migra") || normalized.includes("migracao") || normalized.includes("migração"));

  return (
    normalized.includes("migrado para admin") ||
    isConsolidatedMigration ||
    normalized.includes("prioridade do admin")
  );
}

export function shouldKeepFollowupDisabledAfterAdmin(params: {
  latestLogStatus?: unknown;
  latestLogReason?: unknown;
  paymentStatus?: unknown;
}): boolean {
  const paymentStatus = normalizeText(params.paymentStatus).toLowerCase();
  if (paymentStatus === "paid" || paymentStatus === "pago") {
    return true;
  }

  const latestLogStatus = normalizeText(params.latestLogStatus).toLowerCase();
  const latestLogReason = normalizeText(params.latestLogReason).toLowerCase();
  if (latestLogStatus !== "cancelled" || !latestLogReason) {
    return false;
  }

  return ADMIN_MIGRATION_STOP_MARKERS.some((marker) => latestLogReason.includes(marker));
}

export function resolveRestoredUserFollowupState(params: RestorePlanInput): RestorePlan {
  const now = parseDate(params.now) || new Date();
  const sourceStage = Math.max(0, Number(params.sourceStage || 0));
  const adminStage = Math.max(0, Number(params.adminStage || sourceStage));
  const latestLogReason = normalizeText(params.latestLogReason) || null;

  if (
    shouldKeepFollowupDisabledAfterAdmin({
      latestLogStatus: params.latestLogStatus,
      latestLogReason,
      paymentStatus: params.paymentStatus,
    })
  ) {
    return {
      followupActive: false,
      followupStage: adminStage,
      nextFollowupAt: null,
      followupDisabledReason: latestLogReason || "Follow-up mantido desativado apos migracao do admin",
      strategy: "kept_disabled",
    };
  }

  const adminNextFollowupAt = parseDate(params.adminNextFollowupAt);
  if (
    params.adminFollowupActive === true &&
    adminNextFollowupAt &&
    adminNextFollowupAt.getTime() > now.getTime()
  ) {
    return {
      followupActive: true,
      followupStage: adminStage,
      nextFollowupAt: adminNextFollowupAt,
      followupDisabledReason: null,
      strategy: "admin_schedule",
    };
  }

  const sourceNextFollowupAt = parseDate(params.sourceNextFollowupAt);
  const adminLastMessageTime = parseDate(params.adminLastMessageTime);
  const sourceLastMessageTime = parseDate(params.sourceLastMessageTime);
  const baseDateCandidates = [
    adminLastMessageTime,
    sourceLastMessageTime,
    sourceNextFollowupAt,
  ].filter((entry): entry is Date => Boolean(entry));
  const baseDate = baseDateCandidates.length > 0
    ? new Date(Math.max(...baseDateCandidates.map((entry) => entry.getTime())))
    : now;

  const nextFollowupAt = buildMissingFollowUpScheduleDate({
    config: params.config,
    currentStage: adminStage,
    baseDate,
    now,
    randomFn: params.randomFn,
  });

  if (!nextFollowupAt) {
    return {
      followupActive: false,
      followupStage: adminStage,
      nextFollowupAt: null,
      followupDisabledReason: "Sequencia completa sem agendamento disponivel",
      strategy: "no_schedule_available",
    };
  }

  return {
    followupActive: true,
    followupStage: adminStage,
    nextFollowupAt,
    followupDisabledReason: null,
    strategy: "recalculated",
  };
}

export function normalizeAdminFollowupConfig(raw?: Partial<AdminFollowupConfig> | null): AdminFollowupConfig {
  const fallback = LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG;
  return {
    enabled: raw?.enabled !== false,
    maxAttempts: Number(raw?.maxAttempts) > 0 ? Number(raw?.maxAttempts) : fallback.maxAttempts,
    intervalsMinutes: normalizeIntervals(raw?.intervalsMinutes, fallback.intervalsMinutes),
    finalMinDays: Number(raw?.finalMinDays) > 0 ? Number(raw?.finalMinDays) : fallback.finalMinDays,
    finalMaxDays: Number(raw?.finalMaxDays) > 0 ? Number(raw?.finalMaxDays) : fallback.finalMaxDays,
    businessHoursStart: normalizeTimeValue(raw?.businessHoursStart, fallback.businessHoursStart),
    businessHoursEnd: normalizeTimeValue(raw?.businessHoursEnd, fallback.businessHoursEnd),
    businessDays: normalizeBusinessDays(raw?.businessDays, fallback.businessDays),
    respectBusinessHours: raw?.respectBusinessHours !== false,
    tone: typeof raw?.tone === "string" && raw.tone.trim() ? raw.tone : fallback.tone,
    formalityLevel: Number(raw?.formalityLevel) > 0 ? Number(raw?.formalityLevel) : fallback.formalityLevel,
    useEmojis: raw?.useEmojis !== false,
    importantInfo: Array.isArray(raw?.importantInfo) ? raw.importantInfo : fallback.importantInfo,
    infiniteLoop: raw?.infiniteLoop !== false,
    infiniteLoopMinDays: Number(raw?.infiniteLoopMinDays) > 0 ? Number(raw?.infiniteLoopMinDays) : fallback.infiniteLoopMinDays,
    infiniteLoopMaxDays: Number(raw?.infiniteLoopMaxDays) > 0 ? Number(raw?.infiniteLoopMaxDays) : fallback.infiniteLoopMaxDays,
  };
}

export function isLegacyAdminFollowupConfig(raw?: Partial<AdminFollowupConfig> | null): boolean {
  if (!raw) return true;
  return JSON.stringify(normalizeAdminFollowupConfig(raw)) === JSON.stringify(LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG);
}

export async function getAdminFollowupGlobalConfig(): Promise<AdminFollowupConfig & {
  id: string;
  userId: string;
  isEnabled: boolean;
  followupNonPayersEnabled: boolean;
}> {
  const fallback = sanitizeAdminFollowupConfig({
    id: "global",
    userId: "admin",
    isEnabled: false,
    followupNonPayersEnabled: false,
    ...LEGACY_DEFAULT_ADMIN_FOLLOWUP_CONFIG,
  })!;

  try {
    const row = await db.query.systemConfig.findFirst({
      where: eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
    });

    if (!row?.valor) return fallback;

    const parsed = JSON.parse(row.valor);
    const normalized = normalizeAdminFollowupConfig(parsed);
    return sanitizeAdminFollowupConfig({
      ...fallback,
      ...parsed,
      ...normalized,
      isEnabled: false,
      followupNonPayersEnabled: false,
    })!;
  } catch {
    return fallback;
  }
}

export async function saveAdminFollowupGlobalConfig(data: Record<string, any>) {
  const existing = await db.query.systemConfig.findFirst({
    where: eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
  });

  const current = existing?.valor ? JSON.parse(existing.valor) : {};
  const normalized = normalizeAdminFollowupConfig({ ...current, ...data });
  const merged = sanitizeAdminFollowupConfig({
    id: "global",
    userId: "admin",
    isEnabled: false,
    followupNonPayersEnabled: false,
    ...current,
    ...data,
    ...normalized,
  })!;

  const valor = JSON.stringify(merged);

  if (existing) {
    await db
      .update(systemConfig)
      .set({ valor, updatedAt: new Date() })
      .where(eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY));
  } else {
    await db.insert(systemConfig).values({
      chave: GLOBAL_FOLLOWUP_CONFIG_KEY,
      valor,
    });
  }

  return merged;
}

export function buildAdminFollowupConfigFromUserConfig(userConfig?: any | null): AdminFollowupConfig {
  if (!userConfig) return normalizeAdminFollowupConfig();

  return normalizeAdminFollowupConfig({
    enabled: userConfig.isEnabled !== false,
    maxAttempts: userConfig.maxAttempts,
    intervalsMinutes: userConfig.intervalsMinutes,
    finalMinDays: userConfig.infiniteLoopMinDays,
    finalMaxDays: userConfig.infiniteLoopMaxDays,
    businessHoursStart: userConfig.businessHoursStart,
    businessHoursEnd: userConfig.businessHoursEnd,
    businessDays: userConfig.businessDays,
    respectBusinessHours: userConfig.respectBusinessHours,
    tone: userConfig.tone,
    formalityLevel: userConfig.formalityLevel,
    useEmojis: userConfig.useEmojis,
    importantInfo: userConfig.importantInfo,
    infiniteLoop: userConfig.infiniteLoop,
    infiniteLoopMinDays: userConfig.infiniteLoopMinDays,
    infiniteLoopMaxDays: userConfig.infiniteLoopMaxDays,
  });
}

function shouldSourceWin(sourceStage: number, sourceNext: Date | null, target: any | null): boolean {
  if (!target) return true;
  if (!target.followupActive || !target.nextFollowupAt) return true;

  const targetStage = Number(target.followupStage || 0);
  if (targetStage > sourceStage) return false;
  if (targetStage < sourceStage) return true;

  if (!sourceNext) return false;
  return sourceNext.getTime() < new Date(target.nextFollowupAt).getTime();
}

async function resolveMigrationActors(params: {
  adminId?: string;
  adminEmail?: string;
  sourceUserId?: string;
  sourceEmail?: string;
}) {
  let adminId = params.adminId;
  if (!adminId && params.adminEmail) {
    const admin = await db.query.admins.findFirst({
      where: eq(admins.email, params.adminEmail),
    });
    adminId = admin?.id;
  }

  if (!adminId) {
    throw new Error("Admin de destino nao encontrado");
  }

  let sourceUserId = params.sourceUserId;
  if (!sourceUserId && params.sourceEmail) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, params.sourceEmail),
    });
    sourceUserId = user?.id;
  }

  if (!sourceUserId) {
    throw new Error("Usuario de origem nao encontrado");
  }

  return { adminId, sourceUserId };
}

export async function migrateUserFollowupsToAdmin(params: {
  adminId?: string;
  adminEmail?: string;
  sourceUserId?: string;
  sourceEmail?: string;
}) {
  const { adminId, sourceUserId } = await resolveMigrationActors(params);

  const sourceConfig = await db.query.followupConfigs.findFirst({
    where: eq(followupConfigs.userId, sourceUserId),
  });

  const mappedConfig = buildAdminFollowupConfigFromUserConfig(sourceConfig);
  const globalConfig = await saveAdminFollowupGlobalConfig({
    ...mappedConfig,
    isEnabled: sourceConfig?.isEnabled !== false,
  });

  const sourceConversations = await db
    .select({
      id: conversations.id,
      contactNumber: conversations.contactNumber,
      contactName: conversations.contactName,
      remoteJid: conversations.remoteJid,
      followupStage: conversations.followupStage,
      nextFollowupAt: conversations.nextFollowupAt,
      lastMessageText: conversations.lastMessageText,
      lastMessageTime: conversations.lastMessageTime,
    })
    .from(conversations)
    .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
    .where(and(
      eq(whatsappConnections.userId, sourceUserId),
      eq(conversations.followupActive, true),
      isNotNull(conversations.nextFollowupAt),
    ));

  const targetConversations = await db.query.adminConversations.findMany({
    where: eq(adminConversations.adminId, adminId),
  });
  const targetMap = new Map(targetConversations.map((conv) => [conv.contactNumber, conv]));

  let created = 0;
  let updated = 0;
  let keptTarget = 0;
  let disabledSource = 0;

  for (const source of sourceConversations) {
    const sourceStage = Number(source.followupStage || 0);
    const sourceNext = source.nextFollowupAt ? new Date(source.nextFollowupAt) : null;
    const existingTarget = targetMap.get(source.contactNumber) || null;

    if (!existingTarget) {
      const [createdConversation] = await db
        .insert(adminConversations)
        .values({
          adminId,
          contactNumber: source.contactNumber,
          remoteJid: source.remoteJid,
          contactName: source.contactName,
          lastMessageText: source.lastMessageText,
          lastMessageTime: source.lastMessageTime,
          unreadCount: 0,
          isAgentEnabled: true,
          followupActive: true,
          followupStage: sourceStage,
          nextFollowupAt: sourceNext,
          followupConfig: mappedConfig as any,
          contextState: {
            followupMigration: {
              sourceUserId,
              sourceConversationId: source.id,
              migratedAt: new Date().toISOString(),
              sourceStage,
              sourceNextFollowupAt: sourceNext?.toISOString() || null,
            },
          },
        })
        .returning();
      targetMap.set(source.contactNumber, createdConversation);
      created += 1;
    } else if (shouldSourceWin(sourceStage, sourceNext, existingTarget)) {
      const currentState = (existingTarget as any).contextState || {};
      const [updatedConversation] = await db
        .update(adminConversations)
        .set({
          remoteJid: existingTarget.remoteJid || source.remoteJid,
          contactName: existingTarget.contactName || source.contactName,
          lastMessageText: source.lastMessageText || existingTarget.lastMessageText,
          lastMessageTime: source.lastMessageTime || existingTarget.lastMessageTime,
          followupActive: true,
          followupStage: sourceStage,
          nextFollowupAt: sourceNext,
          followupConfig: mappedConfig as any,
          contextState: {
            ...currentState,
            followupMigration: {
              sourceUserId,
              sourceConversationId: source.id,
              migratedAt: new Date().toISOString(),
              sourceStage,
              sourceNextFollowupAt: sourceNext?.toISOString() || null,
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(adminConversations.id, existingTarget.id))
        .returning();
      targetMap.set(source.contactNumber, updatedConversation);
      updated += 1;
    } else {
      keptTarget += 1;
    }

    await db
      .update(conversations)
      .set({
        followupActive: false,
        nextFollowupAt: null,
        followupDisabledReason: `Migrado para admin ${adminId} em ${new Date().toISOString()}`,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, source.id));
    disabledSource += 1;
  }

  return {
    sourceUserId,
    adminId,
    sourceConfigApplied: mappedConfig,
    globalConfigSaved: globalConfig,
    scanned: sourceConversations.length,
    created,
    updated,
    keptTarget,
    disabledSource,
  };
}

export async function migrateUserFollowupLogsToAdmin(params: {
  adminId?: string;
  adminEmail?: string;
  sourceUserId?: string;
  sourceEmail?: string;
}) {
  const { adminId, sourceUserId } = await resolveMigrationActors(params);
  const globalConfig = await getAdminFollowupGlobalConfig();

  const targetConversations = await db.query.adminConversations.findMany({
    where: eq(adminConversations.adminId, adminId),
  });

  const targetByPhone = new Map<string, typeof targetConversations[number]>();
  const targetBySourceConversationId = new Map<string, typeof targetConversations[number]>();

  for (const conversation of targetConversations) {
    if (conversation.contactNumber && !targetByPhone.has(conversation.contactNumber)) {
      targetByPhone.set(conversation.contactNumber, conversation);
    }

    const sourceConversationId = (conversation.contextState as any)?.followupMigration?.sourceConversationId;
    if (sourceConversationId && !targetBySourceConversationId.has(sourceConversationId)) {
      targetBySourceConversationId.set(sourceConversationId, conversation);
    }
  }

  const targetConversationIds = targetConversations.map((conversation) => conversation.id);
  const existingLogs = targetConversationIds.length > 0
    ? await db.query.followupLogs.findMany({
        where: inArray(followupLogs.conversationId, targetConversationIds),
      })
    : [];

  const existingKeys = new Set(
    existingLogs.map((entry) =>
      buildLogDedupKey({
        conversationId: entry.conversationId,
        contactNumber: entry.contactNumber,
        status: entry.status,
        stage: entry.stage,
        executedAt: entry.executedAt,
        messageContent: entry.messageContent,
        errorReason: entry.errorReason,
      }),
    ),
  );

  const sourceLogs = await db.query.userFollowupLogs.findMany({
    where: eq(userFollowupLogs.userId, sourceUserId),
    orderBy: (table, { asc }) => [asc(table.executedAt), asc(table.id)],
  });

  const sourceConversationIds = Array.from(
    new Set(sourceLogs.map((entry) => entry.conversationId).filter((entry): entry is string => Boolean(entry))),
  );

  const sourceConversations = sourceConversationIds.length > 0
    ? await db
        .select({
          id: conversations.id,
          contactNumber: conversations.contactNumber,
          contactName: conversations.contactName,
          remoteJid: conversations.remoteJid,
          followupActive: conversations.followupActive,
          followupStage: conversations.followupStage,
          nextFollowupAt: conversations.nextFollowupAt,
          lastMessageText: conversations.lastMessageText,
          lastMessageTime: conversations.lastMessageTime,
        })
        .from(conversations)
        .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
        .where(and(
          eq(whatsappConnections.userId, sourceUserId),
          inArray(conversations.id, sourceConversationIds),
        ))
    : [];

  const sourceConversationById = new Map(sourceConversations.map((entry) => [entry.id, entry]));
  const sourceConversationByPhone = new Map<string, typeof sourceConversations[number]>();
  for (const entry of sourceConversations) {
    if (entry.contactNumber && !sourceConversationByPhone.has(entry.contactNumber)) {
      sourceConversationByPhone.set(entry.contactNumber, entry);
    }
  }

  let migrated = 0;
  let skippedExisting = 0;
  let skippedWithoutTarget = 0;
  let createdFromHistory = 0;

  for (const sourceLog of sourceLogs) {
    let targetConversation =
      (sourceLog.conversationId ? targetBySourceConversationId.get(sourceLog.conversationId) : null) ||
      targetByPhone.get(sourceLog.contactNumber);

    if (!targetConversation) {
      const sourceConversation =
        (sourceLog.conversationId ? sourceConversationById.get(sourceLog.conversationId) : null) ||
        sourceConversationByPhone.get(sourceLog.contactNumber);

      if (!sourceConversation) {
        skippedWithoutTarget += 1;
        continue;
      }

      const [createdConversation] = await db
        .insert(adminConversations)
        .values({
          adminId,
          contactNumber: sourceConversation.contactNumber,
          remoteJid: sourceConversation.remoteJid,
          contactName: sourceConversation.contactName,
          lastMessageText: sourceConversation.lastMessageText || sourceLog.messageContent,
          lastMessageTime: sourceConversation.lastMessageTime || sourceLog.executedAt,
          unreadCount: 0,
          isAgentEnabled: true,
          followupActive: Boolean(sourceConversation.followupActive && sourceConversation.nextFollowupAt),
          followupStage: Number(sourceConversation.followupStage || sourceLog.stage || 0),
          nextFollowupAt: sourceConversation.nextFollowupAt,
          followupConfig: normalizeAdminFollowupConfig(globalConfig as any) as any,
          contextState: {
            followupMigration: {
              sourceUserId,
              sourceConversationId: sourceConversation.id,
              migratedAt: new Date().toISOString(),
              sourceStage: Number(sourceConversation.followupStage || sourceLog.stage || 0),
              sourceNextFollowupAt: sourceConversation.nextFollowupAt?.toISOString?.() || null,
              historyOnly: true,
            },
          },
        })
        .returning();

      targetConversation = createdConversation;
      targetByPhone.set(createdConversation.contactNumber, createdConversation);
      targetBySourceConversationId.set(sourceConversation.id, createdConversation);
      createdFromHistory += 1;
    }

    const aiDecisionReason =
      sourceLog.aiDecision && typeof sourceLog.aiDecision === "object"
        ? normalizeText((sourceLog.aiDecision as any).reason)
        : "";
    const errorReason = normalizeText(sourceLog.errorReason) || aiDecisionReason || undefined;
    const stage = Number(sourceLog.stage || 0);
    const effectiveConfig = normalizeAdminFollowupConfig((targetConversation.followupConfig as any) || null);
    const followupType = stage >= effectiveConfig.intervalsMinutes.length ? "final" : "regular";

    const dedupKey = buildLogDedupKey({
      conversationId: targetConversation.id,
      contactNumber: sourceLog.contactNumber,
      status: sourceLog.status,
      stage,
      executedAt: sourceLog.executedAt,
      messageContent: sourceLog.messageContent,
      errorReason,
    });

    if (existingKeys.has(dedupKey)) {
      skippedExisting += 1;
      continue;
    }

    await db.insert(followupLogs).values({
      conversationId: targetConversation.id,
      contactNumber: sourceLog.contactNumber,
      status: sourceLog.status,
      messageContent: sourceLog.messageContent,
      executedAt: sourceLog.executedAt,
      errorReason,
      paymentStatus: targetConversation.paymentStatus || "pending",
      followupType,
      stage,
    });

    existingKeys.add(dedupKey);
    migrated += 1;
  }

  return {
    sourceUserId,
    adminId,
    scanned: sourceLogs.length,
    migrated,
    skippedExisting,
    skippedWithoutTarget,
    createdFromHistory,
  };
}

export async function repairAdminFailedFollowupRetries(params: {
  adminId?: string;
  adminEmail?: string;
}) {
  let adminId = params.adminId;
  if (!adminId && params.adminEmail) {
    const admin = await db.query.admins.findFirst({
      where: eq(admins.email, params.adminEmail),
    });
    adminId = admin?.id;
  }

  if (!adminId) {
    throw new Error("Admin de destino nao encontrado");
  }

  const globalConfig = await getAdminFollowupGlobalConfig();
  const failedRows = await db.execute(sql`
    with latest_log as (
      select distinct on (l.conversation_id)
        l.id,
        l.conversation_id,
        l.status,
        l.executed_at
      from followup_logs l
      inner join admin_conversations c on c.id = l.conversation_id
      where c.admin_id = ${adminId}
      order by l.conversation_id, l.executed_at desc, l.id desc
    )
    select c.id, c.followup_stage, c.followup_config
    from latest_log
    inner join admin_conversations c on c.id = latest_log.conversation_id
    where latest_log.status = 'failed'
      and c.followup_active = true
      and c.next_followup_at is null
  `);

  let repaired = 0;
  let nextAtBase = Date.now();

  for (const row of failedRows.rows as Array<any>) {
    const stage = Number(row.followup_stage || 0);
    const effectiveConfig = normalizeAdminFollowupConfig({
      ...(globalConfig as any),
      ...((row.followup_config as any) || {}),
    });
    const delayMinutes = effectiveConfig.intervalsMinutes[Math.min(stage, effectiveConfig.intervalsMinutes.length - 1)] || 10;
    nextAtBase += 60 * 1000;
    const scheduledFor = new Date(nextAtBase + delayMinutes * 60 * 1000);

    await db
      .update(adminConversations)
      .set({
        nextFollowupAt: scheduledFor,
        updatedAt: new Date(),
      })
      .where(eq(adminConversations.id, row.id));

    repaired += 1;
  }

  return {
    adminId,
    repaired,
  };
}

export async function migrateAdminFollowupsBackToUser(params: {
  adminId?: string;
  adminEmail?: string;
  sourceUserId?: string;
  sourceEmail?: string;
}) {
  const { adminId, sourceUserId } = await resolveMigrationActors(params);
  const sourceConfig = await db.query.followupConfigs.findFirst({
    where: eq(followupConfigs.userId, sourceUserId),
  });

  const sourceConversations = await db
    .select({
      id: conversations.id,
      connectionId: conversations.connectionId,
      contactNumber: conversations.contactNumber,
      contactName: conversations.contactName,
      remoteJid: conversations.remoteJid,
      lastMessageTime: conversations.lastMessageTime,
      followupActive: conversations.followupActive,
      followupStage: conversations.followupStage,
      nextFollowupAt: conversations.nextFollowupAt,
      followupDisabledReason: conversations.followupDisabledReason,
      isClosed: conversations.isClosed,
    })
    .from(conversations)
    .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
    .where(and(
      eq(whatsappConnections.userId, sourceUserId),
      eq(conversations.isClosed, false),
      sql<boolean>`(
        lower(coalesce(${conversations.followupDisabledReason}, '')) like '%migrado para admin%'
        or (
          lower(coalesce(${conversations.followupDisabledReason}, '')) like '%consolidada para admin%'
          and lower(coalesce(${conversations.followupDisabledReason}, '')) like '%migra%'
        )
        or lower(coalesce(${conversations.followupDisabledReason}, '')) like '%prioridade do admin%'
      )`,
    ));

  const allAdminConversations = await db.query.adminConversations.findMany({
    where: eq(adminConversations.adminId, adminId),
  });
  const relevantSourceConversationIds = Array.from(
    new Set(
      allAdminConversations
        .map((conversation) => getAdminMigrationState(conversation.contextState)?.sourceConversationId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const sourceConversationsById = new Map<string, any>();
  if (relevantSourceConversationIds.length > 0) {
    const relatedSourceConversations = await db
      .select({
        id: conversations.id,
        contactNumber: conversations.contactNumber,
        followupActive: conversations.followupActive,
        followupDisabledReason: conversations.followupDisabledReason,
        isClosed: conversations.isClosed,
      })
      .from(conversations)
      .innerJoin(whatsappConnections, eq(whatsappConnections.id, conversations.connectionId))
      .where(and(
        eq(whatsappConnections.userId, sourceUserId),
        inArray(conversations.id, relevantSourceConversationIds),
      ));

    for (const conversation of relatedSourceConversations) {
      sourceConversationsById.set(conversation.id, conversation);
    }
  }

  const adminBySourceConversationId = new Map<string, typeof allAdminConversations[number]>();
  const adminByPhone = new Map<string, typeof allAdminConversations[number]>();

  for (const conversation of allAdminConversations) {
    const migration = getAdminMigrationState(conversation.contextState);
    if (migration?.sourceUserId !== sourceUserId) {
      continue;
    }

    if (migration.sourceConversationId && !adminBySourceConversationId.has(migration.sourceConversationId)) {
      adminBySourceConversationId.set(migration.sourceConversationId, conversation);
    }

    if (conversation.contactNumber && !adminByPhone.has(conversation.contactNumber)) {
      adminByPhone.set(conversation.contactNumber, conversation);
    }
  }

  const relevantAdminConversationIds = Array.from(
    new Set(
      [
        ...adminBySourceConversationId.values(),
        ...adminByPhone.values(),
      ].map((conversation) => conversation.id),
    ),
  );

  const latestLogByConversationId = new Map<string, { status: string | null; errorReason: string | null }>();
  if (relevantAdminConversationIds.length > 0) {
    const adminLogs = await db.query.followupLogs.findMany({
      where: inArray(followupLogs.conversationId, relevantAdminConversationIds),
      orderBy: (table, { asc, desc }) => [asc(table.conversationId), desc(table.executedAt), desc(table.id)],
    });

    for (const row of adminLogs) {
      if (latestLogByConversationId.has(row.conversationId)) {
        continue;
      }

      latestLogByConversationId.set(String(row.conversationId), {
        status: row.status || null,
        errorReason: row.errorReason || null,
      });
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  let scanned = 0;
  let restoredUsingAdminSchedule = 0;
  let restoredRecalculated = 0;
  let keptDisabled = 0;
  let hiddenAdmin = 0;
  let missingAdminMatch = 0;

  await db.transaction(async (tx) => {
    const hideAdminConversation = async (linkedAdminConversation: typeof allAdminConversations[number], sourceConversationId: string, restorePlan: Pick<RestorePlan, "strategy" | "followupDisabledReason">) => {
      const currentState = (linkedAdminConversation.contextState as Record<string, any>) || {};
      const currentMigration = getAdminMigrationState(currentState) || {};

      await tx
        .update(adminConversations)
        .set({
          followupActive: false,
          nextFollowupAt: null,
          isAgentEnabled: false,
          contextState: {
            ...currentState,
            followupMigration: {
              ...currentMigration,
              migratedBackAt: nowIso,
              migratedBackToConversationId: sourceConversationId,
              migratedBackStrategy: restorePlan.strategy,
              migratedBackReason: restorePlan.followupDisabledReason,
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(adminConversations.id, linkedAdminConversation.id));

      hiddenAdmin += 1;
    };

    for (const sourceConversation of sourceConversations) {
      scanned += 1;

      const linkedAdminConversation =
        adminBySourceConversationId.get(sourceConversation.id) ||
        adminByPhone.get(sourceConversation.contactNumber) ||
        null;

      if (!linkedAdminConversation) {
        missingAdminMatch += 1;
      }

      const latestLog = linkedAdminConversation
        ? latestLogByConversationId.get(linkedAdminConversation.id) || null
        : null;

      const restorePlan = resolveRestoredUserFollowupState({
        config: sourceConfig,
        sourceStage: sourceConversation.followupStage,
        sourceNextFollowupAt: sourceConversation.nextFollowupAt,
        sourceLastMessageTime: sourceConversation.lastMessageTime,
        adminStage: linkedAdminConversation?.followupStage,
        adminNextFollowupAt: linkedAdminConversation?.nextFollowupAt,
        adminFollowupActive: linkedAdminConversation?.followupActive,
        adminLastMessageTime: linkedAdminConversation?.lastMessageTime,
        latestLogStatus: latestLog?.status,
        latestLogReason: latestLog?.errorReason,
        paymentStatus: linkedAdminConversation?.paymentStatus,
        now,
      });

      await tx
        .update(conversations)
        .set({
          followupActive: restorePlan.followupActive,
          followupStage: restorePlan.followupStage,
          nextFollowupAt: restorePlan.nextFollowupAt,
          followupDisabledReason: restorePlan.followupDisabledReason,
          remoteJid: sourceConversation.remoteJid || linkedAdminConversation?.remoteJid || null,
          contactName: sourceConversation.contactName || linkedAdminConversation?.contactName || null,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, sourceConversation.id));

      if (restorePlan.followupActive) {
        if (restorePlan.strategy === "admin_schedule") {
          restoredUsingAdminSchedule += 1;
        } else {
          restoredRecalculated += 1;
        }
      } else {
        keptDisabled += 1;
      }

      sourceConversationsById.set(sourceConversation.id, {
        id: sourceConversation.id,
        contactNumber: sourceConversation.contactNumber,
        followupActive: restorePlan.followupActive,
        followupDisabledReason: restorePlan.followupDisabledReason,
        isClosed: false,
      });

      if (linkedAdminConversation && !isAdminConversationMigratedBack(linkedAdminConversation.contextState)) {
        await hideAdminConversation(linkedAdminConversation, sourceConversation.id, restorePlan);
      }
    }

    for (const linkedAdminConversation of allAdminConversations) {
      const migration = getAdminMigrationState(linkedAdminConversation.contextState);
      if (!migration?.sourceConversationId || migration.sourceUserId !== sourceUserId) {
        continue;
      }

      if (isAdminConversationMigratedBack(linkedAdminConversation.contextState)) {
        continue;
      }

      const sourceConversation = sourceConversationsById.get(migration.sourceConversationId);
      if (!sourceConversation || sourceConversation.isClosed) {
        continue;
      }

      const sourceAlreadyOwnsFollowup =
        sourceConversation.followupActive === true ||
        !isSystemAdminMigrationReason(sourceConversation.followupDisabledReason);

      if (!sourceAlreadyOwnsFollowup) {
        continue;
      }

      await hideAdminConversation(linkedAdminConversation, migration.sourceConversationId, {
        strategy: "admin_cleanup",
        followupDisabledReason: normalizeText(sourceConversation.followupDisabledReason) || null,
      });
    }
  });

  return {
    sourceUserId,
    adminId,
    scanned,
    restoredUsingAdminSchedule,
    restoredRecalculated,
    keptDisabled,
    hiddenAdmin,
    missingAdminMatch,
  };
}
