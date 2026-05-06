import crypto from "crypto";
import { desc, eq, sql } from "drizzle-orm";
import { broadcastCampaigns } from "@shared/schema";
import { db, pool } from "./db";
import { storage } from "./storage";
import { applyAIVariation } from "./notificationSchedulerService";
import { sendMessage } from "./whatsapp";
import * as broadcastService from "./broadcastService";
import {
  canUserAccessOwnerWorkspace,
  getLegacyAdminMatchForOwnerEmail,
  getOwnerWorkspaceUserById,
  getOwnerWorkspaceUsers,
  getPrimaryOwnerWorkspaceUser,
} from "./ownerWorkspaceRegistry";

export type OwnerNotificationConfig = {
  paymentReminderEnabled: boolean;
  paymentReminderDaysBefore: number[];
  paymentReminderMessageTemplate: string;
  paymentReminderAiEnabled: boolean;
  paymentReminderAiPrompt: string;
  overdueReminderEnabled: boolean;
  overdueReminderDaysAfter: number[];
  overdueReminderMessageTemplate: string;
  overdueReminderAiEnabled: boolean;
  overdueReminderAiPrompt: string;
  periodicCheckinEnabled: boolean;
  periodicCheckinMinDays: number;
  periodicCheckinMaxDays: number;
  periodicCheckinMessageTemplate: string;
  checkinAiEnabled: boolean;
  checkinAiPrompt: string;
  broadcastEnabled: boolean;
  broadcastAntibotVariation: boolean;
  broadcastAiVariation: boolean;
  broadcastMinIntervalSeconds: number;
  broadcastMaxIntervalSeconds: number;
  disconnectedAlertEnabled: boolean;
  disconnectedAlertHours: number;
  disconnectedAlertMessageTemplate: string;
  disconnectedAiEnabled: boolean;
  disconnectedAiPrompt: string;
  aiVariationEnabled: boolean;
  aiVariationPrompt: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  respectBusinessHours: boolean;
  welcomeMessageEnabled: boolean;
  welcomeMessageVariations: string[];
  welcomeMessageAiEnabled: boolean;
  welcomeMessageAiPrompt: string;
  trialLimitReachedEnabled: boolean;
  trialLimitReachedMessageTemplate: string;
  trialLimitReachedAiEnabled: boolean;
  trialLimitReachedAiPrompt: string;
};

type OwnerNotificationRow = {
  id: string;
  owner_user_id: string;
  user_id: string | null;
  notification_type: string;
  recipient_phone: string;
  recipient_name: string | null;
  message_template: string;
  ai_prompt: string | null;
  scheduled_for: string | Date;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  ai_enabled: boolean | null;
  metadata: any;
  final_message?: string | null;
  error_message?: string | null;
};

type ManagedUserRow = {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  subscription_status: string | null;
  data_inicio: string | Date | null;
  data_fim: string | Date | null;
  next_payment_date: string | Date | null;
  plan_valor: string | number | null;
  plan_nome: string | null;
  whatsapp_connected: boolean;
  connection_phone_number: string | null;
  connection_updated_at: string | Date | null;
  has_subscription_history: boolean;
  has_reseller_access: boolean;
  agent_messages_count: number;
};

type HistoryFilters = {
  page: number;
  pageSize: number;
  type?: string;
  status?: string;
};

type BroadcastStatus = "draft" | "scheduled" | "sending" | "completed" | "cancelled";

const OWNER_NOTIFICATION_INTERVAL_MS = 5 * 60 * 1000;
const OWNER_AUTO_REORGANIZE_INTERVAL_MS = 2 * 60 * 60 * 1000;
const OWNER_HORIZON_DAYS = 14;
const OWNER_ALLOWED_EMAIL = "rodrigo4@gmail.com";
const FREE_TRIAL_MESSAGE_LIMIT = 25;

let ownerSchedulerInterval: NodeJS.Timeout | null = null;
const lastOwnerAutoReorganize = new Map<string, number>();
const readyOwners = new Set<string>();
const migrationLocks = new Map<string, Promise<void>>();

function getDefaultConfig(): OwnerNotificationConfig {
  return {
    paymentReminderEnabled: true,
    paymentReminderDaysBefore: [7, 3, 1],
    paymentReminderMessageTemplate:
      "Olá {cliente_nome}! 👋\n\nGostaríamos de lembrar que seu pagamento vence em {dias_restantes} dias.\n\n📅 Vencimento: {data_vencimento}\n💰 Valor: R$ {valor}\n\nQualquer dúvida estamos à disposição! 🙏",
    paymentReminderAiEnabled: false,
    paymentReminderAiPrompt: "",
    overdueReminderEnabled: true,
    overdueReminderDaysAfter: [1, 3, 7, 14],
    overdueReminderMessageTemplate:
      "Olá {cliente_nome}! 👋\n\nIdentificamos que seu pagamento está em atraso há {dias_atraso} dias.\n\n📅 Venceu em: {data_vencimento}\n💰 Valor: R$ {valor}\n\nPor favor, regularize sua situação para continuar aproveitando nossos serviços. 🤝",
    overdueReminderAiEnabled: false,
    overdueReminderAiPrompt: "",
    periodicCheckinEnabled: true,
    periodicCheckinMinDays: 7,
    periodicCheckinMaxDays: 15,
    periodicCheckinMessageTemplate:
      "Olá {cliente_nome}! 👋\n\nPassando para ver se está tudo bem! 😊\n\nPrecisa de alguma coisa? Podemos ajudar em algo?\n\nEstamos aqui para o que precisar! 💪",
    checkinAiEnabled: false,
    checkinAiPrompt: "",
    broadcastEnabled: true,
    broadcastAntibotVariation: true,
    broadcastAiVariation: false,
    broadcastMinIntervalSeconds: 60,
    broadcastMaxIntervalSeconds: 90,
    disconnectedAlertEnabled: true,
    disconnectedAlertHours: 2,
    disconnectedAlertMessageTemplate:
      "Olá {cliente_nome}! 👋\n\nNotamos que seu WhatsApp está desconectado há algumas horas. 📱\n\nEstá acontecendo algo? Podemos ajudar?\n\nFico à disposição! 🙏",
    disconnectedAiEnabled: false,
    disconnectedAiPrompt: "",
    aiVariationEnabled: false,
    aiVariationPrompt: "",
    businessHoursStart: "09:00",
    businessHoursEnd: "18:00",
    businessDays: [1, 2, 3, 4, 5],
    respectBusinessHours: true,
    welcomeMessageEnabled: true,
    welcomeMessageVariations: [
      "Olá {{name}}! 👋 Bem-vindo(a) ao nosso atendimento. Como posso ajudar você hoje?",
      "Oi {{name}}! 😊 É um prazer ter você aqui. Em que posso ser útil?",
      "Bem-vindo(a) {{name}}! Estou aqui para ajudar. O que você precisa?",
      "Olá! Que bom ter você por aqui, {{name}}! Como posso te atender hoje?",
      "👋 Oi {{name}}! Seja muito bem-vindo(a). Estou pronto para te ajudar!",
    ],
    welcomeMessageAiEnabled: false,
    welcomeMessageAiPrompt: "",
    trialLimitReachedEnabled: true,
    trialLimitReachedMessageTemplate:
      "Ola {cliente_nome}!\n\nSeu limite de 25 mensagens do teste gratuito acabou.\n\nSe quiser continuar com mensagens ilimitadas e manter seu atendimento ativo, voce pode assinar um de nossos planos.\n\nComo foi sua experiencia ate aqui?",
    trialLimitReachedAiEnabled: false,
    trialLimitReachedAiPrompt: "",
  };
}

function normalizeEmail(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(phone?: string | null): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

function hashToOffset(seed: string, max: number): number {
  if (max <= 0) return 0;
  const hash = crypto.createHash("sha1").update(seed).digest("hex").slice(0, 8);
  return parseInt(hash, 16) % max;
}

function parseJsonField<T = Record<string, any>>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function parseNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildPgIntArray(values: number[]): string {
  const safeValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
  return `ARRAY[${safeValues.join(",")}]::integer[]`;
}

function escapeSqlText(value: string): string {
  return String(value).replace(/'/g, "''");
}

function buildPgTextArray(values: string[]): string {
  const safeValues = values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => `'${escapeSqlText(value)}'`);
  return safeValues.length > 0 ? `ARRAY[${safeValues.join(",")}]::text[]` : "ARRAY[]::text[]";
}

function mapConfigRowToCamel(row: any): OwnerNotificationConfig {
  const defaults = getDefaultConfig();
  if (!row) return defaults;
  const trialLimitReachedMessageTemplate =
    typeof row.trial_limit_reached_message_template === "string" &&
    row.trial_limit_reached_message_template.trim().length > 0
      ? row.trial_limit_reached_message_template
      : defaults.trialLimitReachedMessageTemplate;

  return {
    paymentReminderEnabled: row.payment_reminder_enabled ?? defaults.paymentReminderEnabled,
    paymentReminderDaysBefore: row.payment_reminder_days_before ?? defaults.paymentReminderDaysBefore,
    paymentReminderMessageTemplate:
      row.payment_reminder_message_template ?? defaults.paymentReminderMessageTemplate,
    paymentReminderAiEnabled: row.payment_reminder_ai_enabled ?? defaults.paymentReminderAiEnabled,
    paymentReminderAiPrompt: row.payment_reminder_ai_prompt ?? defaults.paymentReminderAiPrompt,
    overdueReminderEnabled: row.overdue_reminder_enabled ?? defaults.overdueReminderEnabled,
    overdueReminderDaysAfter: row.overdue_reminder_days_after ?? defaults.overdueReminderDaysAfter,
    overdueReminderMessageTemplate:
      row.overdue_reminder_message_template ?? defaults.overdueReminderMessageTemplate,
    overdueReminderAiEnabled: row.overdue_reminder_ai_enabled ?? defaults.overdueReminderAiEnabled,
    overdueReminderAiPrompt: row.overdue_reminder_ai_prompt ?? defaults.overdueReminderAiPrompt,
    periodicCheckinEnabled: row.periodic_checkin_enabled ?? defaults.periodicCheckinEnabled,
    periodicCheckinMinDays: row.periodic_checkin_min_days ?? defaults.periodicCheckinMinDays,
    periodicCheckinMaxDays: row.periodic_checkin_max_days ?? defaults.periodicCheckinMaxDays,
    periodicCheckinMessageTemplate:
      row.periodic_checkin_message_template ?? defaults.periodicCheckinMessageTemplate,
    checkinAiEnabled: row.checkin_ai_enabled ?? defaults.checkinAiEnabled,
    checkinAiPrompt: row.checkin_ai_prompt ?? defaults.checkinAiPrompt,
    broadcastEnabled: row.broadcast_enabled ?? defaults.broadcastEnabled,
    broadcastAntibotVariation: row.broadcast_antibot_variation ?? defaults.broadcastAntibotVariation,
    broadcastAiVariation: row.broadcast_ai_variation ?? defaults.broadcastAiVariation,
    broadcastMinIntervalSeconds:
      Math.max(row.broadcast_min_interval_seconds ?? defaults.broadcastMinIntervalSeconds, 60),
    broadcastMaxIntervalSeconds:
      Math.max(row.broadcast_max_interval_seconds ?? defaults.broadcastMaxIntervalSeconds, 60),
    disconnectedAlertEnabled: row.disconnected_alert_enabled ?? defaults.disconnectedAlertEnabled,
    disconnectedAlertHours: row.disconnected_alert_hours ?? defaults.disconnectedAlertHours,
    disconnectedAlertMessageTemplate:
      row.disconnected_alert_message_template ?? defaults.disconnectedAlertMessageTemplate,
    disconnectedAiEnabled: row.disconnected_ai_enabled ?? defaults.disconnectedAiEnabled,
    disconnectedAiPrompt: row.disconnected_ai_prompt ?? defaults.disconnectedAiPrompt,
    aiVariationEnabled: row.ai_variation_enabled ?? defaults.aiVariationEnabled,
    aiVariationPrompt: row.ai_variation_prompt ?? defaults.aiVariationPrompt,
    businessHoursStart: row.business_hours_start ?? defaults.businessHoursStart,
    businessHoursEnd: row.business_hours_end ?? defaults.businessHoursEnd,
    businessDays: row.business_days ?? defaults.businessDays,
    respectBusinessHours: row.respect_business_hours ?? defaults.respectBusinessHours,
    welcomeMessageEnabled: row.welcome_message_enabled ?? defaults.welcomeMessageEnabled,
    welcomeMessageVariations: row.welcome_message_variations ?? defaults.welcomeMessageVariations,
    welcomeMessageAiEnabled: row.welcome_message_ai_enabled ?? defaults.welcomeMessageAiEnabled,
    welcomeMessageAiPrompt: row.welcome_message_ai_prompt ?? defaults.welcomeMessageAiPrompt,
    trialLimitReachedEnabled:
      row.trial_limit_reached_enabled ?? defaults.trialLimitReachedEnabled,
    trialLimitReachedMessageTemplate,
    trialLimitReachedAiEnabled:
      row.trial_limit_reached_ai_enabled ?? defaults.trialLimitReachedAiEnabled,
    trialLimitReachedAiPrompt:
      row.trial_limit_reached_ai_prompt ?? defaults.trialLimitReachedAiPrompt,
  };
}

async function ensureOwnerWorkspaceTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS owner_notification_config (
      owner_user_id TEXT PRIMARY KEY,
      legacy_admin_id TEXT,
      payment_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
      payment_reminder_days_before INTEGER[] NOT NULL DEFAULT ARRAY[7,3,1],
      payment_reminder_message_template TEXT NOT NULL DEFAULT '',
      payment_reminder_ai_enabled BOOLEAN NOT NULL DEFAULT false,
      payment_reminder_ai_prompt TEXT NOT NULL DEFAULT '',
      overdue_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
      overdue_reminder_days_after INTEGER[] NOT NULL DEFAULT ARRAY[1,3,7,14],
      overdue_reminder_message_template TEXT NOT NULL DEFAULT '',
      overdue_reminder_ai_enabled BOOLEAN NOT NULL DEFAULT false,
      overdue_reminder_ai_prompt TEXT NOT NULL DEFAULT '',
      periodic_checkin_enabled BOOLEAN NOT NULL DEFAULT true,
      periodic_checkin_min_days INTEGER NOT NULL DEFAULT 7,
      periodic_checkin_max_days INTEGER NOT NULL DEFAULT 15,
      periodic_checkin_message_template TEXT NOT NULL DEFAULT '',
      checkin_ai_enabled BOOLEAN NOT NULL DEFAULT false,
      checkin_ai_prompt TEXT NOT NULL DEFAULT '',
      broadcast_enabled BOOLEAN NOT NULL DEFAULT true,
      broadcast_antibot_variation BOOLEAN NOT NULL DEFAULT true,
      broadcast_ai_variation BOOLEAN NOT NULL DEFAULT false,
      broadcast_min_interval_seconds INTEGER NOT NULL DEFAULT 60,
      broadcast_max_interval_seconds INTEGER NOT NULL DEFAULT 90,
      disconnected_alert_enabled BOOLEAN NOT NULL DEFAULT true,
      disconnected_alert_hours INTEGER NOT NULL DEFAULT 2,
      disconnected_alert_message_template TEXT NOT NULL DEFAULT '',
      disconnected_ai_enabled BOOLEAN NOT NULL DEFAULT false,
      disconnected_ai_prompt TEXT NOT NULL DEFAULT '',
      ai_variation_enabled BOOLEAN NOT NULL DEFAULT false,
      ai_variation_prompt TEXT NOT NULL DEFAULT '',
      business_hours_start TEXT NOT NULL DEFAULT '09:00',
      business_hours_end TEXT NOT NULL DEFAULT '18:00',
      business_days INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
      respect_business_hours BOOLEAN NOT NULL DEFAULT true,
      welcome_message_enabled BOOLEAN NOT NULL DEFAULT true,
      welcome_message_variations TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
      welcome_message_ai_enabled BOOLEAN NOT NULL DEFAULT false,
      welcome_message_ai_prompt TEXT NOT NULL DEFAULT '',
      trial_limit_reached_enabled BOOLEAN NOT NULL DEFAULT true,
      trial_limit_reached_message_template TEXT NOT NULL DEFAULT '',
      trial_limit_reached_ai_enabled BOOLEAN NOT NULL DEFAULT false,
      trial_limit_reached_ai_prompt TEXT NOT NULL DEFAULT '',
      legacy_admin_migrated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS owner_notification_logs (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      legacy_admin_id TEXT,
      user_id TEXT,
      notification_type TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      recipient_name TEXT,
      message_original TEXT,
      message_sent TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS owner_scheduled_notifications (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      legacy_admin_id TEXT,
      user_id TEXT,
      notification_type TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      recipient_name TEXT,
      message_template TEXT NOT NULL,
      ai_prompt TEXT,
      scheduled_for TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      ai_enabled BOOLEAN NOT NULL DEFAULT false,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      final_message TEXT,
      conversation_context TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS owner_broadcast_archives (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      legacy_admin_id TEXT,
      legacy_broadcast_id TEXT,
      name TEXT NOT NULL,
      message_template TEXT,
      target_type TEXT,
      target_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
      ai_variation BOOLEAN NOT NULL DEFAULT false,
      antibot_enabled BOOLEAN NOT NULL DEFAULT true,
      status TEXT NOT NULL DEFAULT 'completed',
      scheduled_at TIMESTAMPTZ,
      total_recipients INTEGER NOT NULL DEFAULT 0,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS owner_broadcast_archive_messages (
      id TEXT PRIMARY KEY,
      archive_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      legacy_admin_id TEXT,
      user_id TEXT,
      recipient_phone TEXT NOT NULL,
      recipient_name TEXT,
      message_original TEXT,
      message_sent TEXT,
      ai_varied BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'sent',
      error_message TEXT,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_owner_notification_logs_owner_created
      ON owner_notification_logs(owner_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_owner_scheduled_notifications_owner_status_date
      ON owner_scheduled_notifications(owner_user_id, status, scheduled_for ASC);
    CREATE INDEX IF NOT EXISTS idx_owner_broadcast_archives_owner_created
      ON owner_broadcast_archives(owner_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_owner_broadcast_archive_messages_archive
      ON owner_broadcast_archive_messages(archive_id, sent_at DESC);

    ALTER TABLE owner_notification_config
      ADD COLUMN IF NOT EXISTS trial_limit_reached_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS trial_limit_reached_message_template TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS trial_limit_reached_ai_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS trial_limit_reached_ai_prompt TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(
    `
      UPDATE owner_notification_config
      SET trial_limit_reached_message_template = $1
      WHERE COALESCE(BTRIM(trial_limit_reached_message_template), '') = ''
    `,
    [getDefaultConfig().trialLimitReachedMessageTemplate],
  );
}

async function getOwnerConfigRow(ownerUserId: string): Promise<any | null> {
  const result = await db.execute(sql`
    SELECT * FROM owner_notification_config
    WHERE owner_user_id = ${ownerUserId}
    LIMIT 1
  `);
  return (result.rows?.[0] as any) || null;
}

async function seedOwnerDefaultConfig(ownerUserId: string, legacyAdminId: string | null): Promise<void> {
  const defaults = getDefaultConfig();
  await db.execute(sql`
    INSERT INTO owner_notification_config (
      owner_user_id,
      legacy_admin_id,
      payment_reminder_enabled,
      payment_reminder_days_before,
      payment_reminder_message_template,
      payment_reminder_ai_enabled,
      payment_reminder_ai_prompt,
      overdue_reminder_enabled,
      overdue_reminder_days_after,
      overdue_reminder_message_template,
      overdue_reminder_ai_enabled,
      overdue_reminder_ai_prompt,
      periodic_checkin_enabled,
      periodic_checkin_min_days,
      periodic_checkin_max_days,
      periodic_checkin_message_template,
      checkin_ai_enabled,
      checkin_ai_prompt,
      broadcast_enabled,
      broadcast_antibot_variation,
      broadcast_ai_variation,
      broadcast_min_interval_seconds,
      broadcast_max_interval_seconds,
      disconnected_alert_enabled,
      disconnected_alert_hours,
      disconnected_alert_message_template,
      disconnected_ai_enabled,
      disconnected_ai_prompt,
      ai_variation_enabled,
      ai_variation_prompt,
      business_hours_start,
      business_hours_end,
      business_days,
      respect_business_hours,
      welcome_message_enabled,
      welcome_message_variations,
      welcome_message_ai_enabled,
      welcome_message_ai_prompt,
      trial_limit_reached_enabled,
      trial_limit_reached_message_template,
      trial_limit_reached_ai_enabled,
      trial_limit_reached_ai_prompt
    ) VALUES (
      ${ownerUserId},
      ${legacyAdminId},
      ${defaults.paymentReminderEnabled},
      ${sql.raw(buildPgIntArray(defaults.paymentReminderDaysBefore))},
      ${defaults.paymentReminderMessageTemplate},
      ${defaults.paymentReminderAiEnabled},
      ${defaults.paymentReminderAiPrompt},
      ${defaults.overdueReminderEnabled},
      ${sql.raw(buildPgIntArray(defaults.overdueReminderDaysAfter))},
      ${defaults.overdueReminderMessageTemplate},
      ${defaults.overdueReminderAiEnabled},
      ${defaults.overdueReminderAiPrompt},
      ${defaults.periodicCheckinEnabled},
      ${defaults.periodicCheckinMinDays},
      ${defaults.periodicCheckinMaxDays},
      ${defaults.periodicCheckinMessageTemplate},
      ${defaults.checkinAiEnabled},
      ${defaults.checkinAiPrompt},
      ${defaults.broadcastEnabled},
      ${defaults.broadcastAntibotVariation},
      ${defaults.broadcastAiVariation},
      ${defaults.broadcastMinIntervalSeconds},
      ${defaults.broadcastMaxIntervalSeconds},
      ${defaults.disconnectedAlertEnabled},
      ${defaults.disconnectedAlertHours},
      ${defaults.disconnectedAlertMessageTemplate},
      ${defaults.disconnectedAiEnabled},
      ${defaults.disconnectedAiPrompt},
      ${defaults.aiVariationEnabled},
      ${defaults.aiVariationPrompt},
      ${defaults.businessHoursStart},
      ${defaults.businessHoursEnd},
      ${sql.raw(buildPgIntArray(defaults.businessDays))},
      ${defaults.respectBusinessHours},
      ${defaults.welcomeMessageEnabled},
      ${sql.raw(buildPgTextArray(defaults.welcomeMessageVariations))},
      ${defaults.welcomeMessageAiEnabled},
      ${defaults.welcomeMessageAiPrompt},
      ${defaults.trialLimitReachedEnabled},
      ${defaults.trialLimitReachedMessageTemplate},
      ${defaults.trialLimitReachedAiEnabled},
      ${defaults.trialLimitReachedAiPrompt}
    )
    ON CONFLICT (owner_user_id) DO NOTHING
  `);
}

function shouldReconcileOwnerLegacyAdmin(
  configRow: any,
  resolvedLegacyAdminId: string | null,
  legacyAdminConfigUpdatedAt?: Date | null,
): boolean {
  const currentLegacyAdminId =
    typeof configRow?.legacy_admin_id === "string" && configRow.legacy_admin_id.trim().length > 0
      ? configRow.legacy_admin_id.trim()
      : null;

  if (!configRow?.legacy_admin_migrated_at) {
    return true;
  }

  if (!resolvedLegacyAdminId) {
    return false;
  }

  if (currentLegacyAdminId !== resolvedLegacyAdminId) {
    return true;
  }

  if (!legacyAdminConfigUpdatedAt) {
    return false;
  }

  const migratedAt = parseDate(configRow?.legacy_admin_migrated_at);
  if (!migratedAt) {
    return true;
  }

  return legacyAdminConfigUpdatedAt.getTime() > migratedAt.getTime();
}

async function getLegacyAdminConfigUpdatedAt(legacyAdminId: string): Promise<Date | null> {
  const result = await db.execute(sql`
    SELECT updated_at
    FROM admin_notification_config
    WHERE admin_id = ${legacyAdminId}
    LIMIT 1
  `);

  return parseDate((result.rows?.[0] as any)?.updated_at ?? null);
}

async function syncOwnerWorkspaceFromLegacyAdmin(
  ownerUserId: string,
  legacyAdminId: string,
): Promise<void> {
  const defaults = getDefaultConfig();

  await db.execute(sql`
    INSERT INTO owner_notification_config (
      owner_user_id,
      legacy_admin_id,
      payment_reminder_enabled,
      payment_reminder_days_before,
      payment_reminder_message_template,
      payment_reminder_ai_enabled,
      payment_reminder_ai_prompt,
      overdue_reminder_enabled,
      overdue_reminder_days_after,
      overdue_reminder_message_template,
      overdue_reminder_ai_enabled,
      overdue_reminder_ai_prompt,
      periodic_checkin_enabled,
      periodic_checkin_min_days,
      periodic_checkin_max_days,
      periodic_checkin_message_template,
      checkin_ai_enabled,
      checkin_ai_prompt,
      broadcast_enabled,
      broadcast_antibot_variation,
      broadcast_ai_variation,
      broadcast_min_interval_seconds,
      broadcast_max_interval_seconds,
      disconnected_alert_enabled,
      disconnected_alert_hours,
      disconnected_alert_message_template,
      disconnected_ai_enabled,
      disconnected_ai_prompt,
      ai_variation_enabled,
      ai_variation_prompt,
      business_hours_start,
      business_hours_end,
      business_days,
      respect_business_hours,
      welcome_message_enabled,
      welcome_message_variations,
      welcome_message_ai_enabled,
      welcome_message_ai_prompt,
      trial_limit_reached_enabled,
      trial_limit_reached_message_template,
      trial_limit_reached_ai_enabled,
      trial_limit_reached_ai_prompt,
      legacy_admin_migrated_at,
      updated_at
    )
    SELECT
      ${ownerUserId},
      ${legacyAdminId},
      anc.payment_reminder_enabled,
      anc.payment_reminder_days_before,
      anc.payment_reminder_message_template,
      anc.payment_reminder_ai_enabled,
      anc.payment_reminder_ai_prompt,
      anc.overdue_reminder_enabled,
      anc.overdue_reminder_days_after,
      anc.overdue_reminder_message_template,
      anc.overdue_reminder_ai_enabled,
      anc.overdue_reminder_ai_prompt,
      anc.periodic_checkin_enabled,
      anc.periodic_checkin_min_days,
      anc.periodic_checkin_max_days,
      anc.periodic_checkin_message_template,
      anc.checkin_ai_enabled,
      anc.checkin_ai_prompt,
      anc.broadcast_enabled,
      anc.broadcast_antibot_variation,
      anc.broadcast_ai_variation,
      anc.broadcast_min_interval_seconds,
      anc.broadcast_max_interval_seconds,
      anc.disconnected_alert_enabled,
      anc.disconnected_alert_hours,
      anc.disconnected_alert_message_template,
      anc.disconnected_ai_enabled,
      anc.disconnected_ai_prompt,
      anc.ai_variation_enabled,
      anc.ai_variation_prompt,
      anc.business_hours_start,
      anc.business_hours_end,
      anc.business_days,
      anc.respect_business_hours,
      anc.welcome_message_enabled,
      anc.welcome_message_variations,
      anc.welcome_message_ai_enabled,
      anc.welcome_message_ai_prompt,
      ${defaults.trialLimitReachedEnabled},
      ${defaults.trialLimitReachedMessageTemplate},
      ${defaults.trialLimitReachedAiEnabled},
      ${defaults.trialLimitReachedAiPrompt},
      NOW(),
      NOW()
    FROM admin_notification_config anc
    WHERE anc.admin_id = ${legacyAdminId}
    ON CONFLICT (owner_user_id) DO UPDATE SET
      legacy_admin_id = EXCLUDED.legacy_admin_id,
      payment_reminder_enabled = EXCLUDED.payment_reminder_enabled,
      payment_reminder_days_before = EXCLUDED.payment_reminder_days_before,
      payment_reminder_message_template = EXCLUDED.payment_reminder_message_template,
      payment_reminder_ai_enabled = EXCLUDED.payment_reminder_ai_enabled,
      payment_reminder_ai_prompt = EXCLUDED.payment_reminder_ai_prompt,
      overdue_reminder_enabled = EXCLUDED.overdue_reminder_enabled,
      overdue_reminder_days_after = EXCLUDED.overdue_reminder_days_after,
      overdue_reminder_message_template = EXCLUDED.overdue_reminder_message_template,
      overdue_reminder_ai_enabled = EXCLUDED.overdue_reminder_ai_enabled,
      overdue_reminder_ai_prompt = EXCLUDED.overdue_reminder_ai_prompt,
      periodic_checkin_enabled = EXCLUDED.periodic_checkin_enabled,
      periodic_checkin_min_days = EXCLUDED.periodic_checkin_min_days,
      periodic_checkin_max_days = EXCLUDED.periodic_checkin_max_days,
      periodic_checkin_message_template = EXCLUDED.periodic_checkin_message_template,
      checkin_ai_enabled = EXCLUDED.checkin_ai_enabled,
      checkin_ai_prompt = EXCLUDED.checkin_ai_prompt,
      broadcast_enabled = EXCLUDED.broadcast_enabled,
      broadcast_antibot_variation = EXCLUDED.broadcast_antibot_variation,
      broadcast_ai_variation = EXCLUDED.broadcast_ai_variation,
      broadcast_min_interval_seconds = EXCLUDED.broadcast_min_interval_seconds,
      broadcast_max_interval_seconds = EXCLUDED.broadcast_max_interval_seconds,
      disconnected_alert_enabled = EXCLUDED.disconnected_alert_enabled,
      disconnected_alert_hours = EXCLUDED.disconnected_alert_hours,
      disconnected_alert_message_template = EXCLUDED.disconnected_alert_message_template,
      disconnected_ai_enabled = EXCLUDED.disconnected_ai_enabled,
      disconnected_ai_prompt = EXCLUDED.disconnected_ai_prompt,
      ai_variation_enabled = EXCLUDED.ai_variation_enabled,
      ai_variation_prompt = EXCLUDED.ai_variation_prompt,
      business_hours_start = EXCLUDED.business_hours_start,
      business_hours_end = EXCLUDED.business_hours_end,
      business_days = EXCLUDED.business_days,
      respect_business_hours = EXCLUDED.respect_business_hours,
      welcome_message_enabled = EXCLUDED.welcome_message_enabled,
      welcome_message_variations = EXCLUDED.welcome_message_variations,
      welcome_message_ai_enabled = EXCLUDED.welcome_message_ai_enabled,
      welcome_message_ai_prompt = EXCLUDED.welcome_message_ai_prompt,
      legacy_admin_migrated_at = NOW(),
      updated_at = NOW()
  `);

  await db.execute(sql`
    INSERT INTO owner_notification_logs (
      id,
      owner_user_id,
      legacy_admin_id,
      user_id,
      notification_type,
      recipient_phone,
      recipient_name,
      message_original,
      message_sent,
      status,
      metadata,
      error_message,
      created_at,
      sent_at
    )
    SELECT
      anl.id,
      ${ownerUserId},
      ${legacyAdminId},
      anl.user_id,
      anl.notification_type,
      anl.recipient_phone,
      anl.recipient_name,
      anl.message_original,
      anl.message_sent,
      anl.status,
      COALESCE(anl.metadata, '{}'::jsonb),
      anl.error_message,
      COALESCE(anl.created_at, NOW()),
      anl.sent_at
    FROM admin_notification_logs anl
    WHERE anl.admin_id = ${legacyAdminId}
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO owner_scheduled_notifications (
      id,
      owner_user_id,
      legacy_admin_id,
      user_id,
      notification_type,
      recipient_phone,
      recipient_name,
      message_template,
      ai_prompt,
      scheduled_for,
      status,
      ai_enabled,
      metadata,
      final_message,
      conversation_context,
      error_message,
      retry_count,
      sent_at,
      created_at,
      updated_at
    )
    SELECT
      sn.id,
      ${ownerUserId},
      ${legacyAdminId},
      sn.user_id,
      sn.notification_type,
      sn.recipient_phone,
      sn.recipient_name,
      sn.message_template,
      sn.ai_prompt,
      sn.scheduled_for,
      sn.status,
      COALESCE(sn.ai_enabled, false),
      COALESCE(sn.metadata, '{}'::jsonb),
      sn.final_message,
      sn.conversation_context,
      sn.error_message,
      COALESCE(sn.retry_count, 0),
      sn.sent_at,
      COALESCE(sn.created_at, NOW()),
      COALESCE(sn.updated_at, NOW())
    FROM scheduled_notifications sn
    WHERE sn.admin_id = ${legacyAdminId}
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO owner_broadcast_archives (
      id,
      owner_user_id,
      legacy_admin_id,
      legacy_broadcast_id,
      name,
      message_template,
      target_type,
      target_filter,
      ai_variation,
      antibot_enabled,
      status,
      scheduled_at,
      total_recipients,
      sent_count,
      failed_count,
      created_at,
      started_at,
      completed_at,
      updated_at
    )
    SELECT
      ab.id,
      ${ownerUserId},
      ${legacyAdminId},
      ab.id,
      COALESCE(ab.name, 'Broadcast legado'),
      ab.message_template,
      ab.target_type,
      COALESCE(ab.target_filter, '{}'::jsonb),
      COALESCE(ab.ai_variation, false),
      COALESCE(ab.antibot_enabled, true),
      COALESCE(ab.status, 'completed'),
      ab.scheduled_at,
      COALESCE(ab.total_recipients, 0),
      COALESCE(ab.sent_count, 0),
      COALESCE(ab.failed_count, 0),
      COALESCE(ab.created_at, NOW()),
      ab.started_at,
      ab.completed_at,
      COALESCE(ab.updated_at, NOW())
    FROM admin_broadcasts ab
    WHERE ab.admin_id = ${legacyAdminId}
    ON CONFLICT (id) DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO owner_broadcast_archive_messages (
      id,
      archive_id,
      owner_user_id,
      legacy_admin_id,
      user_id,
      recipient_phone,
      recipient_name,
      message_original,
      message_sent,
      ai_varied,
      status,
      error_message,
      sent_at
    )
    SELECT
      abm.id,
      abm.broadcast_id,
      ${ownerUserId},
      ${legacyAdminId},
      abm.user_id,
      abm.recipient_phone,
      abm.recipient_name,
      abm.message_original,
      abm.message_sent,
      COALESCE(abm.ai_varied, false),
      COALESCE(abm.status, 'sent'),
      abm.error_message,
      COALESCE(abm.sent_at, NOW())
    FROM admin_broadcast_messages abm
    WHERE abm.admin_id = ${legacyAdminId}
    ON CONFLICT (id) DO NOTHING
  `);
}

async function migrateLegacyAdminData(ownerUserId: string): Promise<void> {
  if (readyOwners.has(ownerUserId)) {
    return;
  }

  let lock = migrationLocks.get(ownerUserId);
  if (!lock) {
    lock = (async () => {
      await ensureOwnerWorkspaceTables();

      const ownerUser = await getOwnerWorkspaceUserById(ownerUserId);
      const legacyAdminMatch = await getLegacyAdminMatchForOwnerEmail(ownerUser?.email);
      const legacyAdminId = legacyAdminMatch?.id || null;
      const legacyAdminConfigUpdatedAt = legacyAdminId
        ? await getLegacyAdminConfigUpdatedAt(legacyAdminId)
        : null;
      let configRow = await getOwnerConfigRow(ownerUserId);
      if (!configRow) {
        await seedOwnerDefaultConfig(ownerUserId, legacyAdminId);
        configRow = await getOwnerConfigRow(ownerUserId);
      }

      if (!shouldReconcileOwnerLegacyAdmin(configRow, legacyAdminId, legacyAdminConfigUpdatedAt)) {
        readyOwners.add(ownerUserId);
        return;
      }

      if (legacyAdminId) {
        await syncOwnerWorkspaceFromLegacyAdmin(ownerUserId, legacyAdminId);
      }

      await db.execute(sql`
        UPDATE owner_notification_config
        SET
          legacy_admin_id = COALESCE(${legacyAdminId}, legacy_admin_id),
          legacy_admin_migrated_at = NOW(),
          updated_at = NOW()
        WHERE owner_user_id = ${ownerUserId}
      `);

      readyOwners.add(ownerUserId);
    })().finally(() => {
      migrationLocks.delete(ownerUserId);
    });
    migrationLocks.set(ownerUserId, lock);
  }

  await lock;
}

export async function ensureOwnerWorkspaceReady(ownerUserId: string): Promise<void> {
  await ensureOwnerWorkspaceTables();
  const allowed = await canUserAccessOwnerWorkspace(ownerUserId);
  if (!allowed) {
    throw new Error("Acesso negado ao workspace do administrador");
  }
  await migrateLegacyAdminData(ownerUserId);
}

export async function syncOwnerWorkspaceForLegacyAdmin(legacyAdminId: string): Promise<number> {
  await ensureOwnerWorkspaceTables();
  const owners = await getOwnerWorkspaceUsers();
  let syncedOwners = 0;

  for (const owner of owners) {
    if (!owner?.id) continue;

    const match = await getLegacyAdminMatchForOwnerEmail(owner.email);
    if (match?.id !== legacyAdminId) {
      continue;
    }

    await syncOwnerWorkspaceFromLegacyAdmin(owner.id, legacyAdminId);
    await db.execute(sql`
      UPDATE owner_notification_config
      SET
        legacy_admin_id = ${legacyAdminId},
        legacy_admin_migrated_at = NOW(),
        updated_at = NOW()
      WHERE owner_user_id = ${owner.id}
    `);
    readyOwners.add(owner.id);
    syncedOwners += 1;
  }

  return syncedOwners;
}

async function getManagedUsers(ownerUserId: string): Promise<ManagedUserRow[]> {
  const result = await db.execute(sql`
    SELECT
      u.id,
      u.phone,
      u.name,
      u.email,
      u.role,
      s.status AS subscription_status,
      s.data_inicio,
      s.data_fim,
      s.next_payment_date,
      p.valor AS plan_valor,
      p.nome AS plan_nome,
      COALESCE(wc.is_connected_effective, false) AS whatsapp_connected,
      wc.phone_number AS connection_phone_number,
      wc.updated_at AS connection_updated_at,
      EXISTS(
        SELECT 1
        FROM subscriptions sub_history
        WHERE sub_history.user_id = u.id
      ) AS has_subscription_history,
      EXISTS(
        SELECT 1
        FROM reseller_clients rc
        WHERE rc.user_id = u.id
      ) AS has_reseller_access,
      COALESCE(msg.agent_messages_count, 0) AS agent_messages_count
    FROM users u
    LEFT JOIN LATERAL (
      SELECT *
      FROM subscriptions sub
      WHERE sub.user_id = u.id
      ORDER BY sub.created_at DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT
        c.id,
        CASE
          WHEN c.provider = 'baileys'
            AND COALESCE(NULLIF(c.connection_method, ''), 'qr') <> 'coexistence'
            AND COALESCE(NULLIF(c.provider_status, ''), 'inactive') = 'connected'
          THEN true
          ELSE COALESCE(c.is_connected, false)
        END AS is_connected_effective,
        c.phone_number,
        c.updated_at
      FROM whatsapp_connections c
      WHERE c.user_id = u.id
      ORDER BY c.created_at DESC
      LIMIT 1
    ) wc ON true
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS agent_messages_count
      FROM messages m
      JOIN conversations conv ON conv.id = m.conversation_id
      WHERE conv.connection_id = wc.id
        AND m.is_from_agent = true
    ) msg ON true
    WHERE u.id <> ${ownerUserId}
      AND COALESCE(u.role, '') NOT IN ('owner', 'admin')
    ORDER BY u.created_at DESC
  `);

  return (result.rows || []) as ManagedUserRow[];
}

function isTrialLimitReachedCandidate(user: ManagedUserRow): boolean {
  return (
    !Boolean(user.has_subscription_history) &&
    !Boolean(user.has_reseller_access) &&
    parseNumber(user.agent_messages_count, 0) >= FREE_TRIAL_MESSAGE_LIMIT
  );
}

function setTimeOnDate(base: Date, hhmm: string, minuteOffset = 0): Date {
  const [hours, minutes] = String(hhmm || "09:00")
    .split(":")
    .map((value) => parseInt(value, 10) || 0);
  const date = new Date(base);
  date.setHours(hours, minutes + minuteOffset, 0, 0);
  return date;
}

function advanceToNextBusinessDay(date: Date, businessDays: number[]): Date {
  const next = new Date(date);
  for (let index = 0; index < 14; index += 1) {
    if (businessDays.includes(next.getDay())) {
      return next;
    }
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
  }
  return next;
}

function coerceToBusinessSlot(
  rawDate: Date,
  config: OwnerNotificationConfig,
  seed: string,
): Date {
  const minuteOffset = hashToOffset(seed, 90);
  const businessDays = Array.isArray(config.businessDays) && config.businessDays.length > 0
    ? config.businessDays
    : [1, 2, 3, 4, 5];

  let date = new Date(rawDate);
  if (!config.respectBusinessHours) {
    date.setSeconds(0, 0);
    return new Date(date.getTime() + minuteOffset * 60 * 1000);
  }

  date = advanceToNextBusinessDay(date, businessDays);
  const start = setTimeOnDate(date, config.businessHoursStart || "09:00");
  const end = setTimeOnDate(date, config.businessHoursEnd || "18:00");

  if (date < start) {
    return setTimeOnDate(date, config.businessHoursStart || "09:00", minuteOffset);
  }

  if (date > end) {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const businessDay = advanceToNextBusinessDay(nextDay, businessDays);
    return setTimeOnDate(businessDay, config.businessHoursStart || "09:00", minuteOffset);
  }

  date.setMinutes(date.getMinutes() + minuteOffset);
  if (date > end) {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const businessDay = advanceToNextBusinessDay(nextDay, businessDays);
    return setTimeOnDate(businessDay, config.businessHoursStart || "09:00", minuteOffset);
  }

  date.setSeconds(0, 0);
  return date;
}

function formatDatePtBr(dateValue?: string | Date | null): string {
  const date = parseDate(dateValue);
  return date ? date.toLocaleDateString("pt-BR") : "";
}

function buildMessageFromTemplate(
  template: string,
  recipientName: string,
  metadata: Record<string, any>,
): string {
  return String(template || "")
    .replace(/\{cliente_nome\}/g, recipientName || "Cliente")
    .replace(/\{nome\}/g, recipientName || "Cliente")
    .replace(/\{\{name\}\}/g, recipientName || "Cliente")
    .replace(/\{dias_restantes\}/g, String(metadata.daysBefore ?? metadata.daysUntilExpiration ?? ""))
    .replace(/\{dias_atraso\}/g, String(metadata.daysAfter ?? metadata.daysOverdue ?? ""))
    .replace(/\{data_vencimento\}/g, formatDatePtBr(metadata.dueDate))
    .replace(/\{valor\}/g, String(metadata.valor ?? ""));
}

function buildNotificationKey(
  userId: string,
  type: string,
  metadata: Record<string, any>,
): string {
  const marker =
    metadata.daysBefore ??
    metadata.daysAfter ??
    metadata.hoursDisconnected ??
    metadata.seed ??
    metadata.messageLimit ??
    metadata.kind ??
    "";
  return `${userId}:${type}:${marker}`;
}

async function createOwnerNotificationLog(input: {
  ownerUserId: string;
  userId?: string | null;
  notificationType: string;
  recipientPhone: string;
  recipientName: string;
  messageOriginal: string;
  messageSent: string;
  status: string;
  metadata?: Record<string, any>;
  errorMessage?: string | null;
}) {
  await db.execute(sql`
    INSERT INTO owner_notification_logs (
      id,
      owner_user_id,
      user_id,
      notification_type,
      recipient_phone,
      recipient_name,
      message_original,
      message_sent,
      status,
      metadata,
      error_message,
      created_at,
      sent_at
    ) VALUES (
      ${crypto.randomUUID()},
      ${input.ownerUserId},
      ${input.userId || null},
      ${input.notificationType},
      ${input.recipientPhone},
      ${input.recipientName},
      ${input.messageOriginal},
      ${input.messageSent},
      ${input.status},
      ${JSON.stringify(input.metadata || {})}::jsonb,
      ${input.errorMessage || null},
      NOW(),
      NOW()
    )
  `);
}

async function ensureOwnerConversation(ownerUserId: string, phone: string, name?: string | null) {
  const connection = await storage.getUserActiveConnection(ownerUserId);
  if (!connection?.id) {
    throw new Error("A conexão principal do proprietário não está conectada");
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error("Telefone do destinatário inválido");
  }

  let conversation = await storage.getActiveConversationByContactNumber(connection.id, normalizedPhone);
  if (!conversation) {
    conversation = await storage.createConversation({
      connectionId: connection.id,
      contactNumber: normalizedPhone,
      remoteJid: `${normalizedPhone}@s.whatsapp.net`,
      jidSuffix: "s.whatsapp.net",
      contactName: name || normalizedPhone,
      contactAvatar: null,
      lastMessageText: null,
      lastMessageTime: new Date(),
      lastMessageFromMe: true,
      unreadCount: 0,
      hasReplied: true,
    });
  }

  return conversation;
}

async function resolveOwnerRecipientName(ownerUserId: string, phone: string): Promise<string> {
  const normalizedPhone = normalizePhone(phone);
  const connection = await storage.getUserActiveConnection(ownerUserId);

  if (connection?.id && normalizedPhone) {
    const activeConversation = await storage.getActiveConversationByContactNumber(connection.id, normalizedPhone);
    const existingConversation =
      activeConversation || (await storage.getConversationByContactNumber(connection.id, normalizedPhone));
    const conversationName = String(existingConversation?.contactName || "").trim();
    if (conversationName) {
      return conversationName;
    }
  }

  if (normalizedPhone) {
    const user = await storage.getUserByPhone(normalizedPhone);
    const userName = String(user?.name || "").trim();
    if (userName) {
      return userName;
    }
  }

  return "Cliente";
}

async function sendOwnerNotificationRow(
  ownerUserId: string,
  row: OwnerNotificationRow,
  options?: { regenerate?: boolean },
) {
  const config = await getOwnerWorkspaceConfig(ownerUserId);
  const recipientName = String(row.recipient_name || "Cliente").trim() || "Cliente";
  const metadata = parseJsonField<Record<string, any>>(row.metadata, {});
  const originalMessage = buildMessageFromTemplate(row.message_template, recipientName, metadata);

  let finalMessage = options?.regenerate
    ? originalMessage
    : String(row.final_message || originalMessage).trim() || originalMessage;

  if ((row.ai_enabled ?? false) && (options?.regenerate || !row.final_message)) {
    const customPrompt = String(row.ai_prompt || config.aiVariationPrompt || "").trim();
    if (customPrompt) {
      finalMessage = await applyAIVariation(finalMessage, customPrompt, recipientName);
      finalMessage = buildMessageFromTemplate(finalMessage, recipientName, metadata);
    }
  }

  const conversation = await ensureOwnerConversation(ownerUserId, row.recipient_phone, recipientName);
  const result = await sendMessage(ownerUserId, conversation.id, finalMessage, { source: "system" });

  const delivery = buildOwnerDeliveryDecision(row, {
    success: result.success === true && !result.blocked,
    blocked: result.blocked === true,
    deferred: result.deferred === true,
    retryAfterMs: result.retryAfterMs,
    reason: result.reason || "Falha ao enviar mensagem",
  });
  const success = delivery.status === "sent";
  const errorMessage = delivery.errorMessage;

  await db.execute(sql`
    UPDATE owner_scheduled_notifications
    SET
      status = ${delivery.status},
      final_message = ${finalMessage},
      error_message = ${errorMessage},
      retry_count = ${delivery.retryCount},
      scheduled_for = ${delivery.nextAttemptAt || row.scheduled_for},
      sent_at = ${delivery.sentAt},
      updated_at = NOW()
    WHERE id = ${row.id}
  `);

  await createOwnerNotificationLog({
    ownerUserId,
    userId: row.user_id,
    notificationType: row.notification_type,
    recipientPhone: row.recipient_phone,
    recipientName,
    messageOriginal: originalMessage,
    messageSent: finalMessage,
    status: delivery.logStatus,
    metadata,
    errorMessage: delivery.errorMessage,
  });

  return {
    success,
    finalMessage,
    requeued: delivery.status === "pending",
    nextAttemptAt: delivery.nextAttemptAt,
    message: success ? "Notificação enviada com sucesso" : errorMessage || "Falha ao enviar",
  };
}

function computeOwnerRetryDelayMs(retryCount: number, requestedRetryAfterMs?: number | null): number {
  if (Number.isFinite(requestedRetryAfterMs) && Number(requestedRetryAfterMs) > 0) {
    return Math.min(Math.max(Number(requestedRetryAfterMs), OWNER_RETRY_BASE_DELAY_MS), OWNER_RETRY_MAX_DELAY_MS);
  }

  const safeRetryCount = Math.max(0, Math.floor(retryCount));
  const delayStepsMs = [
    5 * 60 * 1000,
    10 * 60 * 1000,
    20 * 60 * 1000,
    30 * 60 * 1000,
    45 * 60 * 1000,
    60 * 60 * 1000,
  ];
  return delayStepsMs[Math.min(safeRetryCount, delayStepsMs.length - 1)];
}

function buildOwnerDeliveryDecision(
  row: OwnerNotificationRow,
  outcome: {
    success: boolean;
    blocked?: boolean;
    deferred?: boolean;
    retryAfterMs?: number | null;
    reason?: string | null;
  },
) {
  const retryCount = Math.max(0, Number(row.retry_count || 0));
  const normalizedReason = String(outcome.reason || "").trim();

  if (outcome.success) {
    return {
      status: "sent" as const,
      logStatus: "sent",
      errorMessage: null,
      retryCount,
      sentAt: new Date(),
      nextAttemptAt: null as Date | null,
    };
  }

  if (outcome.blocked && normalizedReason === "Mensagem duplicada recente") {
    return {
      status: "sent" as const,
      logStatus: "sent",
      errorMessage: null,
      retryCount,
      sentAt: new Date(),
      nextAttemptAt: null as Date | null,
    };
  }

  const nextRetryCount = retryCount + 1;
  const retryDelayMs = computeOwnerRetryDelayMs(nextRetryCount, outcome.retryAfterMs);
  return {
    status: "pending" as const,
    logStatus: "failed",
    errorMessage: normalizedReason || "Falha ao enviar mensagem",
    retryCount: nextRetryCount,
    sentAt: null as Date | null,
    nextAttemptAt: new Date(Date.now() + retryDelayMs),
  };
}

async function recoverOwnerFailedNotifications(ownerUserId: string) {
  const failedResult = await db.execute(sql`
    SELECT *
    FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND status = 'failed'
    ORDER BY updated_at ASC
    LIMIT 200
  `);

  const failedRows = (failedResult.rows || []) as OwnerNotificationRow[];
  for (const row of failedRows) {
    const retryCount = Math.max(1, Number(row.retry_count || 0));
    const retryDelayMs = computeOwnerRetryDelayMs(retryCount, null);
    await db.execute(sql`
      UPDATE owner_scheduled_notifications
      SET
        status = 'pending',
        retry_count = ${retryCount},
        scheduled_for = ${new Date(Date.now() + retryDelayMs)},
        updated_at = NOW()
      WHERE id = ${row.id}
    `);
  }

  return failedRows.length;
}

async function sleepRange(minSeconds: number, maxSeconds: number) {
  const safeMin = Math.max(1, Math.floor(minSeconds));
  const safeMax = Math.max(safeMin, Math.floor(maxSeconds));
  const duration = safeMin === safeMax
    ? safeMin
    : Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
  await new Promise((resolve) => setTimeout(resolve, duration * 1000));
}

async function insertScheduledNotification(input: {
  ownerUserId: string;
  userId: string;
  type: string;
  phone: string;
  name: string;
  template: string;
  aiPrompt: string;
  aiEnabled: boolean;
  metadata: Record<string, any>;
  scheduledFor: Date;
}) {
  await db.execute(sql`
    INSERT INTO owner_scheduled_notifications (
      id,
      owner_user_id,
      user_id,
      notification_type,
      recipient_phone,
      recipient_name,
      message_template,
      ai_prompt,
      scheduled_for,
      status,
      ai_enabled,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      ${crypto.randomUUID()},
      ${input.ownerUserId},
      ${input.userId},
      ${input.type},
      ${input.phone},
      ${input.name},
      ${input.template},
      ${input.aiPrompt},
      ${input.scheduledFor},
      'pending',
      ${input.aiEnabled},
      ${JSON.stringify(input.metadata)}::jsonb,
      NOW(),
      NOW()
    )
  `);
}

export async function getOwnerWorkspaceConfig(ownerUserId: string): Promise<OwnerNotificationConfig> {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const row = await getOwnerConfigRow(ownerUserId);
  return mapConfigRowToCamel(row);
}

export async function updateOwnerWorkspaceConfig(
  ownerUserId: string,
  updates: Partial<OwnerNotificationConfig>,
): Promise<void> {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const currentRow = await getOwnerConfigRow(ownerUserId);
  const current = mapConfigRowToCamel(currentRow);
  const legacyAdminId =
    typeof currentRow?.legacy_admin_id === "string" && currentRow.legacy_admin_id.trim().length > 0
      ? currentRow.legacy_admin_id.trim()
      : null;
  const next = {
    ...current,
    ...updates,
    paymentReminderDaysBefore: Array.isArray(updates.paymentReminderDaysBefore)
      ? updates.paymentReminderDaysBefore.map((value) => Number(value)).filter(Number.isFinite)
      : current.paymentReminderDaysBefore,
    overdueReminderDaysAfter: Array.isArray(updates.overdueReminderDaysAfter)
      ? updates.overdueReminderDaysAfter.map((value) => Number(value)).filter(Number.isFinite)
      : current.overdueReminderDaysAfter,
    businessDays: Array.isArray(updates.businessDays)
      ? updates.businessDays.map((value) => Number(value)).filter(Number.isFinite)
      : current.businessDays,
    welcomeMessageVariations: Array.isArray(updates.welcomeMessageVariations)
      ? updates.welcomeMessageVariations.map((value) => String(value || "").trim()).filter(Boolean)
      : current.welcomeMessageVariations,
  } satisfies OwnerNotificationConfig;

  await db.execute(sql`
    UPDATE owner_notification_config
    SET
      payment_reminder_enabled = ${next.paymentReminderEnabled},
      payment_reminder_days_before = ${sql.raw(buildPgIntArray(next.paymentReminderDaysBefore))},
      payment_reminder_message_template = ${next.paymentReminderMessageTemplate},
      payment_reminder_ai_enabled = ${next.paymentReminderAiEnabled},
      payment_reminder_ai_prompt = ${next.paymentReminderAiPrompt},
      overdue_reminder_enabled = ${next.overdueReminderEnabled},
      overdue_reminder_days_after = ${sql.raw(buildPgIntArray(next.overdueReminderDaysAfter))},
      overdue_reminder_message_template = ${next.overdueReminderMessageTemplate},
      overdue_reminder_ai_enabled = ${next.overdueReminderAiEnabled},
      overdue_reminder_ai_prompt = ${next.overdueReminderAiPrompt},
      periodic_checkin_enabled = ${next.periodicCheckinEnabled},
      periodic_checkin_min_days = ${next.periodicCheckinMinDays},
      periodic_checkin_max_days = ${next.periodicCheckinMaxDays},
      periodic_checkin_message_template = ${next.periodicCheckinMessageTemplate},
      checkin_ai_enabled = ${next.checkinAiEnabled},
      checkin_ai_prompt = ${next.checkinAiPrompt},
      broadcast_enabled = ${next.broadcastEnabled},
      broadcast_antibot_variation = ${next.broadcastAntibotVariation},
      broadcast_ai_variation = ${next.broadcastAiVariation},
      broadcast_min_interval_seconds = ${Math.max(next.broadcastMinIntervalSeconds, 60)},
      broadcast_max_interval_seconds = ${Math.max(next.broadcastMaxIntervalSeconds, 60)},
      disconnected_alert_enabled = ${next.disconnectedAlertEnabled},
      disconnected_alert_hours = ${next.disconnectedAlertHours},
      disconnected_alert_message_template = ${next.disconnectedAlertMessageTemplate},
      disconnected_ai_enabled = ${next.disconnectedAiEnabled},
      disconnected_ai_prompt = ${next.disconnectedAiPrompt},
      ai_variation_enabled = ${next.aiVariationEnabled},
      ai_variation_prompt = ${next.aiVariationPrompt},
      business_hours_start = ${next.businessHoursStart},
      business_hours_end = ${next.businessHoursEnd},
      business_days = ${sql.raw(buildPgIntArray(next.businessDays))},
      respect_business_hours = ${next.respectBusinessHours},
      welcome_message_enabled = ${next.welcomeMessageEnabled},
      welcome_message_variations = ${sql.raw(buildPgTextArray(next.welcomeMessageVariations))},
      welcome_message_ai_enabled = ${next.welcomeMessageAiEnabled},
      welcome_message_ai_prompt = ${next.welcomeMessageAiPrompt},
      trial_limit_reached_enabled = ${next.trialLimitReachedEnabled},
      trial_limit_reached_message_template = ${next.trialLimitReachedMessageTemplate},
      trial_limit_reached_ai_enabled = ${next.trialLimitReachedAiEnabled},
      trial_limit_reached_ai_prompt = ${next.trialLimitReachedAiPrompt},
      updated_at = NOW()
    WHERE owner_user_id = ${ownerUserId}
  `);

  if (legacyAdminId && storage.updateAdminNotificationConfig) {
    await storage.updateAdminNotificationConfig(legacyAdminId, next);
  }

  const disabledTypesByModule: Array<{ enabled: boolean; types: string[]; reason: string }> = [
    {
      enabled: next.paymentReminderEnabled,
      types: ["payment_reminder"],
      reason: "Cancelado automaticamente: módulo de pagamento desativado",
    },
    {
      enabled: next.overdueReminderEnabled,
      types: ["overdue_reminder"],
      reason: "Cancelado automaticamente: módulo de cobrança desativado",
    },
    {
      enabled: next.periodicCheckinEnabled,
      types: ["checkin", "periodic_checkin"],
      reason: "Cancelado automaticamente: módulo de check-in desativado",
    },
    {
      enabled: next.disconnectedAlertEnabled,
      types: ["disconnected", "disconnected_alert"],
      reason: "Cancelado automaticamente: módulo de desconectado desativado",
    },
    {
      enabled: next.trialLimitReachedEnabled,
      types: ["trial_limit_reached"],
      reason: "Cancelado automaticamente: modulo de limite de teste desativado",
    },
  ];

  for (const moduleConfig of disabledTypesByModule) {
    if (moduleConfig.enabled) continue;
    for (const type of moduleConfig.types) {
      await db.execute(sql`
        UPDATE owner_scheduled_notifications
        SET
          status = 'cancelled',
          error_message = COALESCE(NULLIF(error_message, ''), ${moduleConfig.reason}),
          updated_at = NOW()
        WHERE owner_user_id = ${ownerUserId}
          AND notification_type = ${type}
          AND status IN ('pending', 'processing')
      `);
    }
  }
}

export async function getOwnerWorkspaceStats(ownerUserId: string) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const users = await getManagedUsers(ownerUserId);
  const total = users.length;
  const withPlan = users.filter((user) => user.subscription_status === "active").length;
  const withoutPlan = total - withPlan;
  const disconnected = users.filter((user) => !user.whatsapp_connected).length;
  const trialLimitReached = users.filter(isTrialLimitReachedCandidate).length;
  const overduePayments = users.filter((user) => {
    const dueDate = parseDate(user.next_payment_date || user.data_fim);
    return !!dueDate && dueDate.getTime() < Date.now();
  }).length;

  return { total, withPlan, withoutPlan, disconnected, overduePayments, trialLimitReached };
}

export async function getOwnerWorkspaceHistory(ownerUserId: string, filters: HistoryFilters) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(filters.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const whereParts: any[] = [sql`owner_user_id = ${ownerUserId}`];
  if (filters.type && filters.type !== "all") {
    whereParts.push(sql`notification_type = ${filters.type}`);
  }
  if (filters.status && filters.status !== "all") {
    whereParts.push(sql`status = ${filters.status}`);
  }
  const whereClause = sql.join(whereParts, sql` AND `);

  const totalResult = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM owner_notification_logs
    WHERE ${whereClause}
  `);

  const rows = await db.execute(sql`
    SELECT *
    FROM owner_notification_logs
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `);

  const total = parseNumber((totalResult.rows?.[0] as any)?.total, 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    logs: rows.rows || [],
    pagination: {
      page,
      limit: pageSize,
      pageSize,
      total,
      totalPages,
    },
  };
}

export async function getOwnerWorkspaceScheduled(
  ownerUserId: string,
  startDate?: string,
  endDate?: string,
) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const hasExplicitDateRange = Boolean(startDate || endDate);
  const startKey = startDate || endDate || new Date().toISOString().slice(0, 10);
  const endKey =
    endDate ||
    startDate ||
    new Date(Date.now() + OWNER_HORIZON_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const result = hasExplicitDateRange
    ? await db.execute(sql`
        SELECT osn.*, u.name AS user_name, u.email AS user_email
        FROM owner_scheduled_notifications osn
        LEFT JOIN users u ON u.id = osn.user_id
        WHERE osn.owner_user_id = ${ownerUserId}
          AND DATE(osn.scheduled_for AT TIME ZONE 'America/Sao_Paulo') >= ${startKey}::date
          AND DATE(osn.scheduled_for AT TIME ZONE 'America/Sao_Paulo') <= ${endKey}::date
        ORDER BY osn.scheduled_for ASC
      `)
    : await db.execute(sql`
        SELECT osn.*, u.name AS user_name, u.email AS user_email
        FROM owner_scheduled_notifications osn
        LEFT JOIN users u ON u.id = osn.user_id
        WHERE osn.owner_user_id = ${ownerUserId}
          AND osn.scheduled_for >= NOW()
          AND DATE(osn.scheduled_for AT TIME ZONE 'America/Sao_Paulo') <= ${endKey}::date
        ORDER BY osn.scheduled_for ASC
      `);

  return result.rows || [];
}

export async function getOwnerWorkspaceCalendar(ownerUserId: string, month: number, year: number) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  const result = await db.execute(sql`
    SELECT
      DATE(scheduled_for AT TIME ZONE 'America/Sao_Paulo') AS day,
      status,
      notification_type,
      COUNT(*) AS total
    FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND scheduled_for >= ${start}
      AND scheduled_for <= ${end}
    GROUP BY 1, 2, 3
    ORDER BY 1 ASC
  `);

  const calendar: Record<string, { total: number; pending: number; sent: number; failed: number; byType: Record<string, number> }> = {};
  for (const row of result.rows as any[]) {
    const rawDay = row.day;
    const dayKey =
      rawDay instanceof Date
        ? rawDay.toISOString().slice(0, 10)
        : String(rawDay || "").slice(0, 10);
    if (!calendar[dayKey]) {
      calendar[dayKey] = { total: 0, pending: 0, sent: 0, failed: 0, byType: {} };
    }
    const total = parseNumber(row.total, 0);
    calendar[dayKey].total += total;
    if (row.status === "pending" || row.status === "processing") {
      calendar[dayKey].pending += total;
    } else if (row.status === "sent") {
      calendar[dayKey].sent += total;
    } else if (row.status === "failed") {
      calendar[dayKey].failed += total;
    }
    calendar[dayKey].byType[String(row.notification_type)] =
      (calendar[dayKey].byType[String(row.notification_type)] || 0) + total;
  }

  return calendar;
}

export async function reorganizeOwnerWorkspaceAgenda(ownerUserId: string) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const config = await getOwnerWorkspaceConfig(ownerUserId);
  const managedUsers = await getManagedUsers(ownerUserId);
  const horizonEnd = new Date(Date.now() + OWNER_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  await db.execute(sql`
    DELETE FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND status IN ('pending', 'processing')
  `);

  const sentResult = await db.execute(sql`
    SELECT user_id, notification_type, metadata, created_at
    FROM owner_notification_logs
    WHERE owner_user_id = ${ownerUserId}
      AND created_at >= NOW() - INTERVAL '45 days'
  `);

  const lastCheckinSent = new Map<string, Date>();
  const sentKeys = new Set<string>();
  for (const row of sentResult.rows as any[]) {
    const metadata = parseJsonField<Record<string, any>>(row.metadata, {});
    if (row.user_id) {
      sentKeys.add(buildNotificationKey(String(row.user_id), String(row.notification_type), metadata));
    }
    if (row.user_id && (row.notification_type === "checkin" || row.notification_type === "periodic_checkin")) {
      const createdAt = parseDate(row.created_at);
      if (createdAt) {
        const current = lastCheckinSent.get(String(row.user_id));
        if (!current || createdAt > current) {
          lastCheckinSent.set(String(row.user_id), createdAt);
        }
      }
    }
  }

  let created = 0;

  for (const user of managedUsers) {
    const phone = normalizePhone(user.phone);
    if (!phone) continue;

    const recipientName = String(user.name || user.email || phone).trim() || "Cliente";
    const dueDate = parseDate(user.next_payment_date || user.data_fim);

    if (config.paymentReminderEnabled && dueDate) {
      const futureDue = dueDate.getTime() >= Date.now();
      for (const daysBefore of [...config.paymentReminderDaysBefore].sort((a, b) => b - a)) {
        if (!futureDue) continue;
        const candidate = new Date(dueDate);
        candidate.setDate(candidate.getDate() - daysBefore);
        const scheduledFor = coerceToBusinessSlot(candidate, config, `${user.id}:payment:${daysBefore}`);
        const metadata = {
          daysBefore,
          dueDate: dueDate.toISOString(),
          valor: user.plan_valor ?? "",
        };
        const key = buildNotificationKey(user.id, "payment_reminder", metadata);
        if (scheduledFor < new Date() || scheduledFor > horizonEnd || sentKeys.has(key)) {
          continue;
        }
        await insertScheduledNotification({
          ownerUserId,
          userId: user.id,
          type: "payment_reminder",
          phone,
          name: recipientName,
          template: config.paymentReminderMessageTemplate,
          aiPrompt: config.paymentReminderAiPrompt,
          aiEnabled: config.paymentReminderAiEnabled,
          metadata,
          scheduledFor,
        });
        created += 1;
      }
    }

    if (config.overdueReminderEnabled && dueDate) {
      for (const daysAfter of [...config.overdueReminderDaysAfter].sort((a, b) => a - b)) {
        const candidate = new Date(dueDate);
        candidate.setDate(candidate.getDate() + daysAfter);
        const scheduledFor = coerceToBusinessSlot(candidate, config, `${user.id}:overdue:${daysAfter}`);
        const metadata = {
          daysAfter,
          dueDate: dueDate.toISOString(),
          valor: user.plan_valor ?? "",
        };
        const key = buildNotificationKey(user.id, "overdue_reminder", metadata);
        if (scheduledFor < new Date() || scheduledFor > horizonEnd || sentKeys.has(key)) {
          continue;
        }
        await insertScheduledNotification({
          ownerUserId,
          userId: user.id,
          type: "overdue_reminder",
          phone,
          name: recipientName,
          template: config.overdueReminderMessageTemplate,
          aiPrompt: config.overdueReminderAiPrompt,
          aiEnabled: config.overdueReminderAiEnabled,
          metadata,
          scheduledFor,
        });
        created += 1;
      }
    }

    if (config.trialLimitReachedEnabled && isTrialLimitReachedCandidate(user)) {
      const metadata = {
        kind: "trial_limit_reached",
        messageLimit: FREE_TRIAL_MESSAGE_LIMIT,
      };
      const key = buildNotificationKey(user.id, "trial_limit_reached", metadata);
      const scheduledFor = coerceToBusinessSlot(new Date(), config, `${user.id}:trial-limit`);

      if (scheduledFor >= new Date() && scheduledFor <= horizonEnd && !sentKeys.has(key)) {
        await insertScheduledNotification({
          ownerUserId,
          userId: user.id,
          type: "trial_limit_reached",
          phone,
          name: recipientName,
          template: config.trialLimitReachedMessageTemplate,
          aiPrompt: config.trialLimitReachedAiPrompt,
          aiEnabled: config.trialLimitReachedAiEnabled,
          metadata,
          scheduledFor,
        });
        created += 1;
      }
    }

    if (config.periodicCheckinEnabled) {
      const lastSent = lastCheckinSent.get(user.id);
      const baseDate = lastSent ? new Date(lastSent) : new Date();
      const intervalDays =
        config.periodicCheckinMinDays +
        hashToOffset(user.id, Math.max(1, config.periodicCheckinMaxDays - config.periodicCheckinMinDays + 1));
      const candidate = new Date(baseDate);
      candidate.setDate(candidate.getDate() + intervalDays);
      const scheduledFor = coerceToBusinessSlot(candidate, config, `${user.id}:checkin:${intervalDays}`);
      const metadata = { seed: intervalDays };
      const key = buildNotificationKey(user.id, "periodic_checkin", metadata);
      if (scheduledFor >= new Date() && scheduledFor <= horizonEnd && !sentKeys.has(key)) {
        await insertScheduledNotification({
          ownerUserId,
          userId: user.id,
          type: "periodic_checkin",
          phone,
          name: recipientName,
          template: config.periodicCheckinMessageTemplate,
          aiPrompt: config.checkinAiPrompt,
          aiEnabled: config.checkinAiEnabled,
          metadata,
          scheduledFor,
        });
        created += 1;
      }
    }

    if (
      config.disconnectedAlertEnabled &&
      !user.whatsapp_connected &&
      user.connection_phone_number &&
      user.connection_updated_at
    ) {
      const disconnectedAt = parseDate(user.connection_updated_at);
      if (disconnectedAt) {
        const candidate = new Date(disconnectedAt);
        candidate.setHours(candidate.getHours() + config.disconnectedAlertHours);
        const scheduledFor = coerceToBusinessSlot(candidate, config, `${user.id}:disconnected`);
        const metadata = {
          hoursDisconnected: config.disconnectedAlertHours,
        };
        const key = buildNotificationKey(user.id, "disconnected", metadata);
        if (scheduledFor >= new Date() && scheduledFor <= horizonEnd && !sentKeys.has(key)) {
          await insertScheduledNotification({
            ownerUserId,
            userId: user.id,
            type: "disconnected",
            phone,
            name: recipientName,
            template: config.disconnectedAlertMessageTemplate,
            aiPrompt: config.disconnectedAiPrompt,
            aiEnabled: config.disconnectedAiEnabled,
            metadata,
            scheduledFor,
          });
          created += 1;
        }
      }
    }
  }

  lastOwnerAutoReorganize.set(ownerUserId, Date.now());
  return { success: true, created };
}

export async function deleteOwnerScheduledNotification(ownerUserId: string, id: string) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  await db.execute(sql`
    DELETE FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND id = ${id}
  `);
}

export async function sendOwnerScheduledNotification(ownerUserId: string, id: string) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const result = await db.execute(sql`
    SELECT *
    FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND id = ${id}
    LIMIT 1
  `);
  const row = (result.rows?.[0] as OwnerNotificationRow | undefined) || undefined;
  if (!row) {
    throw new Error("Notificação agendada não encontrada");
  }
  return sendOwnerNotificationRow(ownerUserId, row, { regenerate: true });
}

export async function resendOwnerScheduledNotification(
  ownerUserId: string,
  id: string,
  regenerate?: boolean,
) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const result = await db.execute(sql`
    SELECT *
    FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND id = ${id}
    LIMIT 1
  `);
  const row = (result.rows?.[0] as OwnerNotificationRow | undefined) || undefined;
  if (!row) {
    throw new Error("Notificação não encontrada");
  }
  return sendOwnerNotificationRow(ownerUserId, row, { regenerate });
}

export async function processOwnerWorkspaceQueue(ownerUserId: string, limit = 50) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const config = await getOwnerWorkspaceConfig(ownerUserId);
  await recoverOwnerFailedNotifications(ownerUserId);

  const result = await db.execute(sql`
    WITH due AS (
      SELECT id
      FROM owner_scheduled_notifications
      WHERE owner_user_id = ${ownerUserId}
        AND status = 'pending'
        AND scheduled_for <= NOW()
      ORDER BY scheduled_for ASC
      LIMIT ${limit}
    )
    UPDATE owner_scheduled_notifications osn
    SET status = 'processing', updated_at = NOW()
    FROM due
    WHERE osn.id = due.id
    RETURNING osn.*
  `);

  const rows = (result.rows || []) as OwnerNotificationRow[];
  let processed = 0;
  let failed = 0;
  let requeued = 0;

  for (let index = 0; index < rows.length; index += 1) {
    try {
      const sent = await sendOwnerNotificationRow(ownerUserId, rows[index]);
      if (sent.success) {
        processed += 1;
      } else {
        requeued += 1;
      }
    } catch (error: any) {
      requeued += 1;
      const recovery = buildOwnerDeliveryDecision(rows[index], {
        success: false,
        reason: error?.message || "Erro ao processar a fila",
      });
      await db.execute(sql`
        UPDATE owner_scheduled_notifications
        SET
          status = ${recovery.status},
          error_message = ${recovery.errorMessage},
          retry_count = ${recovery.retryCount},
          scheduled_for = ${recovery.nextAttemptAt || rows[index].scheduled_for},
          updated_at = NOW()
        WHERE id = ${rows[index].id}
      `);
      await createOwnerNotificationLog({
        ownerUserId,
        userId: rows[index].user_id,
        notificationType: rows[index].notification_type,
        recipientPhone: rows[index].recipient_phone,
        recipientName: String(rows[index].recipient_name || "Cliente").trim() || "Cliente",
        messageOriginal: rows[index].message_template,
        messageSent: rows[index].final_message || rows[index].message_template,
        status: "failed",
        metadata: parseJsonField<Record<string, any>>(rows[index].metadata, {}),
        errorMessage: recovery.errorMessage,
      });
    }

    const isLast = index === rows.length - 1;
    if (!isLast && config.broadcastAntibotVariation) {
      await sleepRange(config.broadcastMinIntervalSeconds, config.broadcastMaxIntervalSeconds);
    }
  }

  return {
    success: true,
    total: rows.length,
    processed,
    failed,
    requeued,
    minDelay: config.broadcastMinIntervalSeconds,
    maxDelay: config.broadcastMaxIntervalSeconds,
  };
}

export async function getOwnerWorkspaceQueueStatus(ownerUserId: string) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const breakdownResult = await db.execute(sql`
    SELECT status, notification_type, COUNT(*) AS count
    FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
    GROUP BY status, notification_type
  `);

  const pendingNowResult = await db.execute(sql`
    SELECT COUNT(*) AS count
    FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND status = 'pending'
      AND scheduled_for <= NOW()
  `);

  const nextResult = await db.execute(sql`
    SELECT *
    FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND status = 'pending'
    ORDER BY scheduled_for ASC
    LIMIT 5
  `);

  return {
    breakdown: breakdownResult.rows || [],
    pendingNow: parseNumber((pendingNowResult.rows?.[0] as any)?.count, 0),
    nextInQueue: nextResult.rows || [],
  };
}

function mapCampaignStatus(status: string): BroadcastStatus {
  switch (status) {
    case "pending":
      return "scheduled";
    case "running":
      return "sending";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "error":
      return "cancelled";
    default:
      return "scheduled";
  }
}

export async function listOwnerWorkspaceBroadcasts(ownerUserId: string) {
  await ensureOwnerWorkspaceReady(ownerUserId);

  const campaignRows = await db
    .select()
    .from(broadcastCampaigns)
    .where(eq(broadcastCampaigns.userId, ownerUserId))
    .orderBy(desc(broadcastCampaigns.createdAt));

  const archiveRows = await db.execute(sql`
    SELECT *
    FROM owner_broadcast_archives
    WHERE owner_user_id = ${ownerUserId}
    ORDER BY created_at DESC
  `);

  const campaigns = campaignRows.map((row: any) => ({
    id: row.id,
    name: row.name,
    messageTemplate: row.messageTemplate,
    targetType: String((row.metadataJson as any)?.targetType || "all"),
    targetFilter: row.metadataJson || {},
    aiVariation: Boolean(row.useAi),
    antibotEnabled: true,
    status: mapCampaignStatus(String(row.status)),
    scheduledAt: row.scheduledAt,
    totalRecipients: row.totalContacts ?? 0,
    sentCount: row.sentCount ?? 0,
    failedCount: row.failedCount ?? 0,
    createdAt: row.createdAt,
    source: "owner",
  }));

  const archives = (archiveRows.rows || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    messageTemplate: row.message_template,
    targetType: row.target_type || "all",
    targetFilter: parseJsonField(row.target_filter, {}),
    aiVariation: Boolean(row.ai_variation),
    antibotEnabled: row.antibot_enabled !== false,
    status: (row.status || "completed") as BroadcastStatus,
    scheduledAt: row.scheduled_at,
    totalRecipients: parseNumber(row.total_recipients, 0),
    sentCount: parseNumber(row.sent_count, 0),
    failedCount: parseNumber(row.failed_count, 0),
    createdAt: row.created_at,
    source: "legacy_admin_archive",
  }));

  return [...campaigns, ...archives].sort((a, b) => {
    const timeA = parseDate(a.createdAt)?.getTime() || 0;
    const timeB = parseDate(b.createdAt)?.getTime() || 0;
    return timeB - timeA;
  });
}

async function buildOwnerBroadcastRecipients(ownerUserId: string, targetType: string) {
  const users = await getManagedUsers(ownerUserId);
  const filtered = users.filter((user) => {
    if (!normalizePhone(user.phone)) return false;
    if (targetType === "with_plan") return user.subscription_status === "active";
    if (targetType === "without_plan") return user.subscription_status !== "active";
    return true;
  });

  return filtered.map((user) => ({
    id: user.id,
    phone: normalizePhone(user.phone),
    name: user.name || user.email || "Cliente",
  }));
}

export async function createAndStartOwnerBroadcast(
  ownerUserId: string,
  payload: {
    name: string;
    messageTemplate: string;
    targetType: string;
    aiVariation?: boolean;
    antibotEnabled?: boolean;
  },
) {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const config = await getOwnerWorkspaceConfig(ownerUserId);
  const connection = await storage.getUserActiveConnection(ownerUserId);
  if (!connection?.id) {
    throw new Error("A conexão principal do proprietário não está conectada");
  }

  const contacts = await buildOwnerBroadcastRecipients(ownerUserId, payload.targetType);
  const result = await broadcastService.createAndRunCampaign(ownerUserId, {
    contacts,
    connectionId: connection.id,
    messageTemplate: payload.messageTemplate,
    name: payload.name,
    useAi: payload.aiVariation === true && config.broadcastAiVariation === true,
    delayMinMs: config.broadcastMinIntervalSeconds * 1000,
    delayMaxMs: config.broadcastMaxIntervalSeconds * 1000,
    campaignType: "owner_workspace_broadcast",
    metadataJson: {
      origin: "owner_workspace",
      targetType: payload.targetType,
      antibotEnabled: payload.antibotEnabled !== false,
    },
  });

  return {
    success: true,
    id: result.campaignId,
  };
}

export async function cancelOwnerBroadcast(ownerUserId: string, broadcastId: string) {
  await ensureOwnerWorkspaceReady(ownerUserId);

  const campaign = await broadcastService.getCampaignStatus(broadcastId, ownerUserId);
  if (campaign) {
    return broadcastService.cancelCampaign(broadcastId, ownerUserId);
  }

  await db.execute(sql`
    UPDATE owner_broadcast_archives
    SET
      status = 'cancelled',
      updated_at = NOW(),
      completed_at = COALESCE(completed_at, NOW())
    WHERE owner_user_id = ${ownerUserId}
      AND id = ${broadcastId}
  `);

  return true;
}

export async function getOwnerBroadcastMessages(ownerUserId: string, broadcastId: string) {
  await ensureOwnerWorkspaceReady(ownerUserId);

  const campaign = await broadcastService.getCampaignStatus(broadcastId, ownerUserId);
  if (campaign) {
    const results = Array.isArray((campaign as any).resultsJson) ? (campaign as any).resultsJson : [];
    return results.map((row: any) => ({
      id: row.contactId || `${broadcastId}:${row.phone}`,
      recipient_name: row.name || "Cliente",
      recipient_phone: row.phone,
      message_original: row.message,
      message_sent: row.message,
      status: row.status,
      error_message: row.error || null,
      sent_at: row.sentAt || null,
    }));
  }

  const archiveRows = await db.execute(sql`
    SELECT *
    FROM owner_broadcast_archive_messages
    WHERE owner_user_id = ${ownerUserId}
      AND archive_id = ${broadcastId}
    ORDER BY sent_at DESC
  `);

  return archiveRows.rows || [];
}

export async function sendOwnerWorkspaceWelcomeMessage(
  ownerUserId: string,
  userPhone: string,
): Promise<boolean> {
  await ensureOwnerWorkspaceReady(ownerUserId);
  const config = await getOwnerWorkspaceConfig(ownerUserId);
  if (!config.welcomeMessageEnabled || config.welcomeMessageVariations.length === 0) {
    return false;
  }

  const connection = await storage.getUserActiveConnection(ownerUserId);
  if (!connection?.id) {
    return false;
  }

  const randomIndex = Math.floor(Math.random() * config.welcomeMessageVariations.length);
  const recipientName = await resolveOwnerRecipientName(ownerUserId, userPhone);
  let message = buildMessageFromTemplate(
    config.welcomeMessageVariations[randomIndex] || "",
    recipientName,
    {},
  ).trim();

  if (config.welcomeMessageAiEnabled && config.welcomeMessageAiPrompt) {
    try {
      message = await applyAIVariation(message, config.welcomeMessageAiPrompt, recipientName);
      message = buildMessageFromTemplate(message, recipientName, {}).trim();
    } catch (error) {
      console.error("[OWNER WORKSPACE] Falha ao variar boas-vindas com IA:", error);
    }
  }

  const conversation = await ensureOwnerConversation(ownerUserId, userPhone, recipientName);
  const result = await sendMessage(ownerUserId, conversation.id, message, { source: "system" });
  return result.success === true && !result.blocked;
}

export async function sendPrimaryOwnerWorkspaceWelcomeMessage(userPhone: string): Promise<boolean> {
  const ownerUser = await getPrimaryOwnerWorkspaceUser();
  if (!ownerUser?.id || normalizeEmail(ownerUser.email) !== OWNER_ALLOWED_EMAIL) {
    return false;
  }

  return sendOwnerWorkspaceWelcomeMessage(ownerUser.id, userPhone);
}

export async function processAllOwnerWorkspaces() {
  const owners = await getOwnerWorkspaceUsers();
  for (const owner of owners) {
    if (!owner?.id) continue;
    try {
      await ensureOwnerWorkspaceReady(owner.id);
      const lastRun = lastOwnerAutoReorganize.get(owner.id) || 0;
      if (Date.now() - lastRun >= OWNER_AUTO_REORGANIZE_INTERVAL_MS) {
        await reorganizeOwnerWorkspaceAgenda(owner.id);
      }
      await processOwnerWorkspaceQueue(owner.id, 50);
    } catch (error) {
      console.error(`[OWNER WORKSPACE] Falha ao processar scheduler do owner ${owner.id}:`, error);
    }
  }
}

export function startOwnerWorkspaceScheduler() {
  if (ownerSchedulerInterval) {
    return;
  }

  void processAllOwnerWorkspaces().catch((error) => {
    console.error("[OWNER WORKSPACE] Falha no processamento inicial:", error);
  });

  ownerSchedulerInterval = setInterval(() => {
    void processAllOwnerWorkspaces().catch((error) => {
      console.error("[OWNER WORKSPACE] Falha no loop do scheduler:", error);
    });
  }, OWNER_NOTIFICATION_INTERVAL_MS);
}

export function stopOwnerWorkspaceScheduler() {
  if (!ownerSchedulerInterval) {
    return;
  }

  clearInterval(ownerSchedulerInterval);
  ownerSchedulerInterval = null;
}
