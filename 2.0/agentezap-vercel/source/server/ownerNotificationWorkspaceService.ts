import crypto from "crypto";
import { desc, eq, sql } from "drizzle-orm";
import { broadcastCampaigns } from "@shared/schema";
import { db, pool } from "./db";
import { storage } from "./storage";
import { generatePixQRCode } from "./pixService";
import { applyAIVariation } from "./notificationSchedulerService";
import { sendMessage } from "./whatsapp";
import * as broadcastService from "./broadcastService";
import { buildOwnerBillingMessageParts } from "./ownerBillingMessageParts";
import {
  OWNER_RODRIGO_GLOBAL_ENGAGEMENT_RETRY_MINUTES,
  OWNER_RODRIGO_PROACTIVE_BATCH_COOLDOWN_MINUTES,
  OWNER_RODRIGO_PROACTIVE_BATCH_SIZE,
  OWNER_RODRIGO_PROACTIVE_MIN_INBOUND_MESSAGES,
  isRodrigoOwnerCheckinRecipientEligible,
  resolveOwnerGlobalProactiveEngagementDecision,
} from "./ownerNotificationWorkspacePolicy";
import {
  canUserAccessOwnerWorkspace,
  getLegacyAdminMatchForOwnerEmail,
  getOwnerWorkspaceUserById,
  getOwnerWorkspaceUsers,
  getPrimaryOwnerWorkspaceUser,
} from "./ownerWorkspaceRegistry";
import { getBillingPaymentActivityWindowStart } from "./ownerBillingPaymentActivityPolicy";

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
  status:
    | "pending"
    | "processing"
    | "sent"
    | "failed"
    | "cancelled"
    | "skipped_disabled"
    | "skipped_duplicate"
    | "skipped_excluded"
    | "skipped_active_plan"
    | "skipped_stale";
  ai_enabled: boolean | null;
  metadata: any;
  final_message?: string | null;
  error_message?: string | null;
  created_at?: string | Date;
  updated_at?: string | Date;
};

type ManagedUserRow = {
  id: string;
  created_at: string | Date | null;
  phone: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  cancelled_at: string | Date | null;
  data_inicio: string | Date | null;
  data_fim: string | Date | null;
  next_payment_date: string | Date | null;
  coupon_price: string | number | null;
  plan_valor: string | number | null;
  plan_nome: string | null;
  whatsapp_connected: boolean;
  connection_phone_number: string | null;
  connection_updated_at: string | Date | null;
  has_subscription_history: boolean;
  has_reseller_access: boolean;
  agent_messages_count: number;
};

type BillingPaymentActivity = {
  source: "payment_receipts" | "payment_history" | "subscription_pending_receipt";
  status: string;
  activityAt: string | Date | null;
};

type OwnerProactiveEngagementGate = {
  allowed: boolean;
  blockedReason: "inbound" | "cooldown" | null;
  requiredInboundMessages: number;
  inboundMessagesSinceWatermark: number;
  consumedInboundMessages: number;
  availableInboundMessages: number;
  remainingInboundMessages: number;
  batchSentCount: number;
  batchSize: number;
  inboundWatermark: Date;
  nextSendAllowedAt: Date | null;
  lastInboundAt: Date | null;
  nextAttemptAt: Date;
};

type OwnerProactiveEngagementState = {
  inboundWatermark: Date;
  consumedInboundMessages: number;
  batchSentCount: number;
  batchWindowStartedAt: Date | null;
  nextSendAllowedAt: Date | null;
};

type OwnerNotificationSendResult = Awaited<ReturnType<typeof sendMessage>>;

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
const OWNER_STALE_DISCONNECTED_NOTIFICATION_MS = 6 * 60 * 60 * 1000;
const OWNER_STALE_OVERDUE_NOTIFICATION_MS = 45 * 24 * 60 * 60 * 1000;
const OWNER_QUEUE_BATCH_SIZE = 10;
const OWNER_QUEUE_BATCH_PAUSE_MIN_SECONDS = 15 * 60;
const OWNER_QUEUE_BATCH_PAUSE_MAX_SECONDS = 20 * 60;
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
      "Oi {cliente_nome}, aqui e o Rodrigo do AgenteZap.\n\nSeu plano vence em {dias_restantes} dia(s), em {data_vencimento}.\nValor: R$ {valor}\n\nPix copia e cola:\n{{pix_copia_cola}}\n\nDepois de pagar, envie o comprovante por aqui para eu validar para voce.",
    paymentReminderAiEnabled: false,
    paymentReminderAiPrompt: "",
    overdueReminderEnabled: true,
    overdueReminderDaysAfter: [1, 3, 7, 14],
    overdueReminderMessageTemplate:
      "Oi {cliente_nome}, aqui e o Rodrigo do AgenteZap.\n\nSeu plano venceu em {data_vencimento}.\nValor: R$ {valor}\n\nPix copia e cola:\n{{pix_copia_cola}}\n\nSe ja pagou, envie o comprovante por aqui para eu validar para voce.",
    overdueReminderAiEnabled: false,
    overdueReminderAiPrompt: "",
    periodicCheckinEnabled: true,
    periodicCheckinMinDays: 7,
    periodicCheckinMaxDays: 15,
    periodicCheckinMessageTemplate:
      "Oi, {cliente_nome}! Aqui e o Rodrigo do AgenteZap.\n\nPassando para saber se esta tudo bem por ai e se o AgenteZap esta funcionando corretamente. Se precisar de ajuda ou quiser ajustar algo, e so me chamar por aqui.",
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
      "Oi, {cliente_nome}! Aqui e o Rodrigo do AgenteZap.\n\nVi que seu WhatsApp ficou desconectado no AgenteZap. Se precisar de ajuda para reconectar e deixar o atendimento ativo novamente, me chame por aqui.",
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
      "Ola {{name}}. Aqui e o Rodrigo do AgenteZap. Vi que voce criou sua conta e estou por aqui para ajudar no que precisar.",
      "Oi {{name}}. Aqui e o Rodrigo do AgenteZap. Bem-vindo ao AgenteZap. Se quiser tirar duvida, configurar algo ou entender a plataforma, pode me chamar por aqui.",
      "Ola {{name}}. Aqui e o Rodrigo do AgenteZap. Que bom ter voce no AgenteZap. Vou te acompanhar por aqui para deixar seu atendimento funcionando bem.",
    ],
    welcomeMessageAiEnabled: false,
    welcomeMessageAiPrompt: "",
    trialLimitReachedEnabled: true,
    trialLimitReachedMessageTemplate:
      "Oi {cliente_nome}, aqui e o Rodrigo do AgenteZap.\n\nAcabaram suas respostas prioritárias. Seu agente agora está em Modo Econômico: ele ainda responde, mas sem prioridade e com respostas mais lentas.\n\nAssine o Plus para voltar ao modo rápido.",
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

async function isRodrigoOwnerWorkspace(ownerUserId: string): Promise<boolean> {
  const owner = await getOwnerWorkspaceUserById(ownerUserId);
  return normalizeEmail(owner?.email) === OWNER_ALLOWED_EMAIL;
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

function latestDate(...values: Array<string | Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    const date = parseDate(value);
    if (date && (!latest || date.getTime() > latest.getTime())) {
      latest = date;
    }
  }
  return latest;
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
      ADD COLUMN IF NOT EXISTS trial_limit_reached_ai_prompt TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS proactive_engagement_inbound_watermark TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS proactive_engagement_inbound_consumed INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS proactive_engagement_batch_sent_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS proactive_engagement_batch_window_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS proactive_engagement_next_send_allowed_at TIMESTAMPTZ;
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
      u.created_at,
      u.phone,
      u.name,
      u.email,
      u.role,
      s.id AS subscription_id,
      s.status AS subscription_status,
      s.cancelled_at,
      s.data_inicio,
      s.data_fim,
      s.next_payment_date,
      s.coupon_price,
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

function parseBillingAmount(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatAmountForMessage(value: unknown): string {
  const amount = parseBillingAmount(value, Number.NaN);
  if (!Number.isFinite(amount)) {
    return String(value ?? "");
  }
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function firstPositiveBillingAmount(...values: unknown[]): number {
  for (const value of values) {
    const amount = parseBillingAmount(value, Number.NaN);
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }
  return 0;
}

function getManagedUserBillingAmount(user: ManagedUserRow): number {
  return firstPositiveBillingAmount(user.coupon_price, user.plan_valor);
}

function getBillingSnapshotAmount(
  snapshot: Record<string, any> | null,
  metadata: Record<string, any>,
): number {
  return firstPositiveBillingAmount(
    snapshot?.coupon_price,
    metadata.valor,
    metadata.amount,
    snapshot?.plan_valor,
  );
}

function getManagedUserDueDate(user: ManagedUserRow): Date | null {
  return latestDate(user.next_payment_date, user.data_fim);
}

function isManagedUserCurrentlyActive(user: ManagedUserRow, now = new Date()): boolean {
  if (user.subscription_status !== "active") {
    return false;
  }

  const dueDate = getManagedUserDueDate(user);
  return !dueDate || dueDate.getTime() >= now.getTime();
}

function isManagedUserBillingOverdue(user: ManagedUserRow, now = new Date()): boolean {
  const dueDate = getManagedUserDueDate(user);
  return Boolean(dueDate && dueDate.getTime() < now.getTime() && user.has_subscription_history);
}

function isManagedUserCancellationRequested(user: ManagedUserRow): boolean {
  return Boolean(parseDate(user.cancelled_at));
}

function getManagedUserInitialCheckinBaseDate(user: ManagedUserRow, now = new Date()): Date {
  const createdAt = parseDate(user.created_at);
  if (createdAt && createdAt.getTime() <= now.getTime()) {
    return createdAt;
  }
  return now;
}

function shouldUseOwnerLogForDedupe(status?: string | null): boolean {
  return status === "sent" || status === "skipped_active_plan" || status === "skipped_stale" || status === "skipped_duplicate";
}

function isWithinOwnerHorizon(date: Date, horizonEnd: Date): boolean {
  return date.getTime() <= horizonEnd.getTime();
}

function rebaseMissedOwnerNotification(
  rawScheduledFor: Date,
  config: OwnerNotificationConfig,
  seed: string,
  catchupIndex: number,
  now = new Date(),
): Date {
  if (rawScheduledFor.getTime() >= now.getTime()) {
    return rawScheduledFor;
  }

  const base = new Date(now.getTime() + Math.max(0, catchupIndex) * 2 * 60 * 1000);
  return coerceToBusinessSlot(base, config, `${seed}:catchup:${catchupIndex}`);
}

function buildMessageFromTemplate(
  template: string,
  recipientName: string,
  metadata: Record<string, any>,
): string {
  const valor = metadata.valorFormatado ?? metadata.valor_formatado ?? metadata.valor;
  const pixCode =
    metadata.pix_copia_cola ??
    metadata.pixCopiaCola ??
    metadata.pixCode ??
    metadata.codigoPix ??
    metadata.codigo_pix ??
    "";
  const replacements: Record<string, string> = {
    cliente_nome: recipientName || "Cliente",
    nome: recipientName || "Cliente",
    name: recipientName || "Cliente",
    dias_restantes: String(metadata.daysBefore ?? metadata.daysUntilExpiration ?? ""),
    dias_atraso: String(metadata.daysAfter ?? metadata.daysOverdue ?? ""),
    data_vencimento: formatDatePtBr(metadata.dueDate),
    valor: valor === undefined || valor === null || valor === "" ? "" : formatAmountForMessage(valor),
    plano: String(metadata.planName ?? metadata.plan_nome ?? metadata.plano ?? ""),
    pix_copia_cola: String(pixCode || ""),
    codigo_pix: String(pixCode || ""),
    link_pagamento: String(metadata.link_pagamento ?? metadata.paymentLink ?? "https://agentezap.online/plans"),
  };

  let output = String(template || "");
  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(`{{${key}}}`).join(value);
    output = output.split(`{${key}}`).join(value);
  }
  return output;
}

function isAcceptedOwnerNotificationSendResult(result: OwnerNotificationSendResult): boolean {
  if (result.success === true && result.blocked !== true) {
    return true;
  }
  return result.blocked === true && String(result.reason || "").trim() === "Mensagem duplicada recente";
}

function getOwnerNotificationSendResultMessageId(result?: OwnerNotificationSendResult | null): string {
  return String(result?.messageId || "").trim();
}

function buildOwnerNotificationAuditMessage(mainMessage: string, pixCopyMessage?: string | null): string {
  const parts = [String(mainMessage || "").trim()];
  const pixMessage = String(pixCopyMessage || "").trim();
  if (pixMessage) {
    parts.push(pixMessage);
  }
  return parts.filter((part) => part.length > 0).join("\n\n");
}

function buildNotificationKey(
  userId: string,
  type: string,
  metadata: Record<string, any>,
): string {
  const markerParts: string[] = [];
  const primaryMarker =
    metadata.daysBefore ??
    metadata.daysAfter ??
    metadata.hoursDisconnected ??
    metadata.seed ??
    metadata.messageLimit ??
    metadata.kind ??
    "";

  if (primaryMarker !== "") {
    markerParts.push(String(primaryMarker));
  }

  const cycleMarker =
    metadata.billingCycleDate ??
    metadata.dueDate ??
    metadata.checkinCycleDate ??
    metadata.disconnectedSince ??
    metadata.connectionUpdatedAt ??
    "";

  if (cycleMarker !== "") {
    markerParts.push(String(cycleMarker).slice(0, 10));
  }

  return `${userId}:${type}:${markerParts.join(":")}`;
}

function isBillingNotificationType(type: string): boolean {
  return type === "payment_reminder" || type === "overdue_reminder";
}

function getStaleOwnerNotificationSkipReason(
  row: OwnerNotificationRow,
  notificationType: string,
  metadata: Record<string, any>,
): string | null {
  const scheduledFor = parseDate(row.scheduled_for);
  if (
    (notificationType === "disconnected" || notificationType === "disconnected_alert") &&
    scheduledFor &&
    scheduledFor.getTime() < Date.now() - OWNER_STALE_DISCONNECTED_NOTIFICATION_MS
  ) {
    return "Envio bloqueado: alerta de desconexao ficou antigo.";
  }

  if (notificationType === "overdue_reminder") {
    const dueDate = parseDate(metadata.dueDate);
    if (dueDate && dueDate.getTime() < Date.now() - OWNER_STALE_OVERDUE_NOTIFICATION_MS) {
      return "Envio bloqueado: cobranca antiga fora da agenda atual.";
    }
  }

  return null;
}

function serializeOwnerEngagementGate(gate: OwnerProactiveEngagementGate) {
  return {
    blockedReason: gate.blockedReason,
    requiredInboundMessages: gate.requiredInboundMessages,
    inboundMessagesSinceWatermark: gate.inboundMessagesSinceWatermark,
    consumedInboundMessages: gate.consumedInboundMessages,
    availableInboundMessages: gate.availableInboundMessages,
    remainingInboundMessages: gate.remainingInboundMessages,
    batchSentCount: gate.batchSentCount,
    batchSize: gate.batchSize,
    inboundWatermark: gate.inboundWatermark.toISOString(),
    nextSendAllowedAt: gate.nextSendAllowedAt ? gate.nextSendAllowedAt.toISOString() : null,
    lastInboundAt: gate.lastInboundAt ? gate.lastInboundAt.toISOString() : null,
    nextAttemptAt: gate.nextAttemptAt.toISOString(),
  };
}

function buildOwnerEngagementWaitMessage(gate: OwnerProactiveEngagementGate): string {
  if (gate.blockedReason === "cooldown" && gate.nextSendAllowedAt) {
    return "Aguardando pausa de 10 minutos entre lotes de envios automaticos.";
  }

  return gate.remainingInboundMessages > 0
    ? `Aguardando ${gate.remainingInboundMessages} mensagem(ns) recebida(s) dos clientes antes do proximo envio automatico.`
    : "Aguardando mensagens recebidas dos clientes antes do proximo envio automatico.";
}

async function getOwnerProactiveEngagementState(ownerUserId: string): Promise<OwnerProactiveEngagementState> {
  const result = await db.execute(sql`
    SELECT
      proactive_engagement_inbound_watermark,
      proactive_engagement_inbound_consumed,
      proactive_engagement_batch_sent_count,
      proactive_engagement_batch_window_started_at,
      proactive_engagement_next_send_allowed_at
    FROM owner_notification_config
    WHERE owner_user_id = ${ownerUserId}
    LIMIT 1
  `);

  const row = (result.rows?.[0] as any) || {};
  const inboundWatermark = parseDate(row.proactive_engagement_inbound_watermark) || new Date();
  return {
    inboundWatermark,
    consumedInboundMessages: Math.max(0, Math.floor(parseNumber(row.proactive_engagement_inbound_consumed, 0))),
    batchSentCount: Math.max(0, Math.floor(parseNumber(row.proactive_engagement_batch_sent_count, 0))),
    batchWindowStartedAt: parseDate(row.proactive_engagement_batch_window_started_at),
    nextSendAllowedAt: parseDate(row.proactive_engagement_next_send_allowed_at),
  };
}

async function countRodrigoOwnerGlobalInboundSinceWatermark(ownerUserId: string, watermark: Date) {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS inbound_count, MAX(m.timestamp) AS last_inbound_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN whatsapp_connections wc ON wc.id = c.connection_id
    WHERE wc.user_id = ${ownerUserId}
      AND c.jid_suffix = 's.whatsapp.net'
      AND m.from_me = false
      AND m.timestamp > ${watermark}
  `);

  const row = (result.rows?.[0] as any) || {};
  return {
    inboundMessagesSinceWatermark: Math.max(0, Math.floor(parseNumber(row.inbound_count, 0))),
    lastInboundAt: parseDate(row.last_inbound_at),
  };
}

async function resolveRodrigoOwnerProactiveEngagementGate(input: {
  ownerUserId: string;
  notificationType: string;
  config: OwnerNotificationConfig;
}): Promise<OwnerProactiveEngagementGate> {
  const state = await getOwnerProactiveEngagementState(input.ownerUserId);
  const inbound = await countRodrigoOwnerGlobalInboundSinceWatermark(input.ownerUserId, state.inboundWatermark);
  const now = new Date();
  const decision = resolveOwnerGlobalProactiveEngagementDecision({
    inboundMessagesSinceWatermark: inbound.inboundMessagesSinceWatermark,
    consumedInboundMessages: state.consumedInboundMessages,
    nextSendAllowedAt: state.nextSendAllowedAt,
    now,
  });
  const retryBase =
    decision.blockedReason === "cooldown" && decision.nextSendAllowedAt
      ? decision.nextSendAllowedAt
      : new Date(now.getTime() + OWNER_RODRIGO_GLOBAL_ENGAGEMENT_RETRY_MINUTES * 60 * 1000);
  const nextAttemptAt = coerceToBusinessSlot(
    retryBase,
    input.config,
    `${input.ownerUserId}:${input.notificationType}:global-engagement`,
  );

  return {
    ...decision,
    batchSentCount: state.batchSentCount,
    batchSize: OWNER_RODRIGO_PROACTIVE_BATCH_SIZE,
    inboundWatermark: state.inboundWatermark,
    lastInboundAt: inbound.lastInboundAt,
    nextAttemptAt,
  };
}

async function recordRodrigoOwnerProactiveSend(ownerUserId: string): Promise<void> {
  const state = await getOwnerProactiveEngagementState(ownerUserId);
  const now = new Date();
  const nextBatchCount = state.batchSentCount + 1;
  const completedBatch = nextBatchCount >= OWNER_RODRIGO_PROACTIVE_BATCH_SIZE;
  const nextSendAllowedAt = completedBatch
    ? new Date(now.getTime() + OWNER_RODRIGO_PROACTIVE_BATCH_COOLDOWN_MINUTES * 60 * 1000)
    : null;
  const batchWindowStartedAt = completedBatch ? null : state.batchWindowStartedAt || now;

  await db.execute(sql`
    UPDATE owner_notification_config
    SET
      proactive_engagement_inbound_consumed =
        GREATEST(0, proactive_engagement_inbound_consumed) + ${OWNER_RODRIGO_PROACTIVE_MIN_INBOUND_MESSAGES},
      proactive_engagement_batch_sent_count = ${completedBatch ? 0 : nextBatchCount},
      proactive_engagement_batch_window_started_at = ${batchWindowStartedAt},
      proactive_engagement_next_send_allowed_at = ${nextSendAllowedAt},
      updated_at = NOW()
    WHERE owner_user_id = ${ownerUserId}
  `);
}

function getMetadataText(metadata: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function getBillingCycleDateFromMetadata(metadata: Record<string, any>): string {
  const cycle = getMetadataText(metadata, ["billingCycleDate"]);
  if (cycle) {
    return cycle.slice(0, 10);
  }
  const dueDate = getMetadataText(metadata, ["dueDate"]);
  return dueDate ? dueDate.slice(0, 10) : "";
}

function getBillingDaysAfterFromMetadata(metadata: Record<string, any>): number | null {
  const raw = metadata.daysAfter;
  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() && String(Number.parseInt(raw, 10)) === raw.trim()) {
    return Number.parseInt(raw, 10);
  }
  return null;
}

function buildOverdueCycleDedupeKey(userId: string, cycleDate: string): string {
  return `${userId}:${cycleDate}`;
}

async function getSentOverdueDaysAfterAtOrAbove(
  row: OwnerNotificationRow,
  metadata: Record<string, any>,
): Promise<number | null> {
  if (!row.user_id) return null;
  const cycleDate = getBillingCycleDateFromMetadata(metadata);
  const daysAfter = getBillingDaysAfterFromMetadata(metadata);
  if (!cycleDate || daysAfter === null) return null;

  const result = await db.execute(sql`
    SELECT (metadata->>'daysAfter')::int AS days_after
    FROM owner_notification_logs
    WHERE owner_user_id = ${row.owner_user_id}
      AND user_id = ${row.user_id}
      AND notification_type = 'overdue_reminder'
      AND status IN ('sent', 'skipped_duplicate')
      AND COALESCE(metadata->>'billingCycleDate', LEFT(COALESCE(metadata->>'dueDate', ''), 10)) = ${cycleDate}
      AND jsonb_typeof(metadata->'daysAfter') = 'number'
      AND (metadata->>'daysAfter')::int >= ${daysAfter}
    ORDER BY (metadata->>'daysAfter')::int DESC
    LIMIT 1
  `);

  const found = Number(result.rows?.[0]?.days_after);
  return Number.isFinite(found) ? found : null;
}

async function getBillingSubscriptionSnapshot(
  row: OwnerNotificationRow,
  metadata: Record<string, any>,
): Promise<Record<string, any> | null> {
  const metadataSubscriptionId = getMetadataText(metadata, ["subscriptionId", "subscription_id"]);
  const rowUserId = row.user_id || null;
  if (metadataSubscriptionId) {
    const result = await db.execute(sql`
      SELECT
        s.id,
        s.user_id,
        s.status,
        s.pending_receipt,
        s.updated_at,
        s.data_fim,
        s.next_payment_date,
        s.coupon_price,
        p.nome AS plan_nome,
        p.valor AS plan_valor
      FROM subscriptions s
      LEFT JOIN plans p ON p.id = s.plan_id
      WHERE s.id = ${metadataSubscriptionId}
        AND (${rowUserId}::text IS NULL OR s.user_id = ${rowUserId})
      LIMIT 1
    `);
    return (result.rows?.[0] as Record<string, any> | undefined) || null;
  }

  if (!row.user_id) return null;
  const result = await db.execute(sql`
    SELECT
      s.id,
      s.user_id,
      s.status,
      s.pending_receipt,
      s.updated_at,
      s.data_fim,
      s.next_payment_date,
      s.coupon_price,
      p.nome AS plan_nome,
      p.valor AS plan_valor
    FROM subscriptions s
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = ${row.user_id}
    ORDER BY s.created_at DESC
    LIMIT 1
  `);
  return (result.rows?.[0] as Record<string, any> | undefined) || null;
}

async function getRecordedBillingPaymentActivity(
  row: OwnerNotificationRow,
  metadata: Record<string, any>,
  snapshot: Record<string, any> | null,
): Promise<BillingPaymentActivity | null> {
  if (snapshot?.pending_receipt === true) {
    return {
      source: "subscription_pending_receipt",
      status: "pending",
      activityAt: snapshot.updated_at || null,
    };
  }

  const subscriptionId =
    getMetadataText(metadata, ["subscriptionId", "subscription_id"]) ||
    String(snapshot?.id || "");
  const userId = row.user_id || String(snapshot?.user_id || "");
  if (!subscriptionId && !userId) {
    return null;
  }

  const dueDate = latestDate(snapshot?.next_payment_date, snapshot?.data_fim) || parseDate(metadata.dueDate);
  if (!dueDate) {
    return null;
  }

  const windowStart = getBillingPaymentActivityWindowStart(metadata, dueDate);
  const windowEnd = new Date(dueDate.getTime() + 3 * 24 * 60 * 60 * 1000);
  const amount = getBillingSnapshotAmount(snapshot, metadata);

  const result = await db.execute(sql`
    WITH params AS (
      SELECT
        ${subscriptionId || null}::text AS subscription_id,
        ${userId || null}::text AS user_id,
        ${windowStart}::timestamp AS window_start,
        ${windowEnd}::timestamp AS window_end,
        ${Number.isFinite(amount) && amount > 0 ? amount : null}::numeric AS expected_amount
    ),
    receipt_matches AS (
      SELECT
        'payment_receipts'::text AS source,
        pr.status::text AS status,
        COALESCE(pr.reviewed_at, pr.updated_at, pr.created_at) AS activity_at
      FROM payment_receipts pr, params p
      WHERE pr.status IN ('pending', 'approved')
        AND (
          (p.subscription_id IS NOT NULL AND pr.subscription_id = p.subscription_id)
          OR (p.user_id IS NOT NULL AND pr.user_id = p.user_id)
        )
        AND COALESCE(pr.reviewed_at, pr.updated_at, pr.created_at) >= p.window_start
        AND COALESCE(pr.created_at, pr.updated_at, pr.reviewed_at) <= p.window_end
        AND (
          p.expected_amount IS NULL
          OR pr.amount IS NULL
          OR pr.amount <= 0
          OR ABS(pr.amount::numeric - p.expected_amount) <= 0.02
        )
      ORDER BY COALESCE(pr.reviewed_at, pr.updated_at, pr.created_at) DESC
      LIMIT 1
    ),
    payment_matches AS (
      SELECT
        'payment_history'::text AS source,
        ph.status::text AS status,
        COALESCE(ph.payment_date, ph.created_at) AS activity_at
      FROM payment_history ph, params p
      WHERE ph.status = 'approved'
        AND (
          (p.subscription_id IS NOT NULL AND ph.subscription_id = p.subscription_id)
          OR (p.user_id IS NOT NULL AND ph.user_id = p.user_id)
        )
        AND COALESCE(ph.payment_date, ph.created_at) >= p.window_start
        AND COALESCE(ph.payment_date, ph.created_at) <= p.window_end
        AND (
          p.expected_amount IS NULL
          OR ph.amount IS NULL
          OR ph.amount <= 0
          OR ABS(ph.amount::numeric - p.expected_amount) <= 0.02
        )
      ORDER BY COALESCE(ph.payment_date, ph.created_at) DESC
      LIMIT 1
    )
    SELECT source, status, activity_at
    FROM receipt_matches
    UNION ALL
    SELECT source, status, activity_at
    FROM payment_matches
    ORDER BY activity_at DESC
    LIMIT 1
  `);

  const match = result.rows?.[0] as any;
  return match
    ? {
        source: match.source,
        status: match.status,
        activityAt: match.activity_at,
      }
    : null;
}

async function getBillingNotificationSkipReason(
  row: OwnerNotificationRow,
  notificationType: string,
  metadata: Record<string, any>,
): Promise<string | null> {
  if (notificationType === "overdue_reminder") {
    const snapshot = await getBillingSubscriptionSnapshot(row, metadata);
    const paymentActivity = await getRecordedBillingPaymentActivity(row, metadata, snapshot);
    if (paymentActivity) {
      return "Envio bloqueado: pagamento ou comprovante ja registrado para este ciclo.";
    }

    return (await hasActiveSubscriptionForUser(row.user_id)) ||
      (await hasActiveSubscriptionForRecipientPhone(row.recipient_phone))
      ? "Envio bloqueado: cliente ja possui assinatura ativa."
      : null;
  }

  if (notificationType !== "payment_reminder") {
    return null;
  }

  const snapshot = await getBillingSubscriptionSnapshot(row, metadata);
  if (!snapshot?.id) {
    return (await hasActiveSubscriptionForUser(row.user_id))
      ? "Envio bloqueado: lembrete antigo sem assinatura de referencia."
      : "Envio bloqueado: assinatura de cobranca nao encontrada.";
  }

  if (String(snapshot.status || "") !== "active") {
    return "Envio bloqueado: plano de cobranca nao esta ativo.";
  }

  const paymentActivity = await getRecordedBillingPaymentActivity(row, metadata, snapshot);
  if (paymentActivity) {
    return "Envio bloqueado: pagamento ou comprovante ja registrado para este ciclo.";
  }

  const snapshotDueDate = latestDate(snapshot.next_payment_date, snapshot.data_fim);
  const metadataDueDate = parseDate(metadata.dueDate);
  if (
    notificationType === "payment_reminder" &&
    snapshotDueDate &&
    metadataDueDate &&
    metadataDueDate.getTime() < snapshotDueDate.getTime() - 24 * 60 * 60 * 1000
  ) {
    return "Envio bloqueado: lembrete antigo de ciclo ja renovado.";
  }

  const dueDate = snapshotDueDate || metadataDueDate;
  if (dueDate && dueDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    return "Envio bloqueado: lembrete antes do vencimento ficou antigo.";
  }

  return null;
}

async function enrichBillingNotificationMetadata(
  row: OwnerNotificationRow,
  notificationType: string,
  metadata: Record<string, any>,
): Promise<Record<string, any>> {
  if (!isBillingNotificationType(notificationType)) {
    return metadata;
  }

  const existingPixCode = getMetadataText(metadata, [
    "pix_copia_cola",
    "pixCopiaCola",
    "pixCode",
    "codigoPix",
    "codigo_pix",
  ]);
  if (existingPixCode) {
    return metadata;
  }

  const snapshot = await getBillingSubscriptionSnapshot(row, metadata);
  const subscriptionId =
    getMetadataText(metadata, ["subscriptionId", "subscription_id"]) ||
    String(snapshot?.id || "");
  const planName =
    getMetadataText(metadata, ["planName", "plan_nome", "plano"]) ||
    String(snapshot?.plan_nome || "Plano AgenteZap");
  const amount = getBillingSnapshotAmount(snapshot, metadata);

  if (!subscriptionId || !Number.isFinite(amount) || amount <= 0) {
    return metadata;
  }

  const { pixCode } = await generatePixQRCode({
    planNome: planName,
    valor: amount,
    subscriptionId,
  });

  return {
    ...metadata,
    subscriptionId,
    subscription_id: subscriptionId,
    planName,
    plan_nome: planName,
    plano: planName,
    valor: amount.toFixed(2),
    valorFormatado: formatAmountForMessage(amount),
    pix_copia_cola: pixCode,
    pixCopiaCola: pixCode,
    pixCode,
    codigoPix: pixCode,
    codigo_pix: pixCode,
    link_pagamento: metadata.link_pagamento ?? metadata.paymentLink ?? "https://agentezap.online/plans",
    pixSource: "plans_manual_pix",
    pixGeneratedAt: new Date().toISOString(),
  };
}

function isOwnerNotificationModuleEnabled(type: string, config: OwnerNotificationConfig): boolean {
  switch (type) {
    case "payment_reminder":
      return config.paymentReminderEnabled !== false;
    case "overdue_reminder":
      return config.overdueReminderEnabled !== false;
    case "checkin":
    case "periodic_checkin":
      return config.periodicCheckinEnabled !== false;
    case "disconnected":
    case "disconnected_alert":
      return config.disconnectedAlertEnabled !== false;
    case "trial_limit_reached":
      return config.trialLimitReachedEnabled !== false;
    default:
      return true;
  }
}

async function hasActiveSubscriptionForUser(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  const result = await db.execute(sql`
    SELECT 1
    FROM subscriptions
    WHERE user_id = ${userId}
      AND status = 'active'
      AND (
        (next_payment_date IS NULL AND data_fim IS NULL)
        OR GREATEST(
          COALESCE(next_payment_date, '-infinity'::timestamp),
          COALESCE(data_fim, '-infinity'::timestamp)
        ) >= NOW()
      )
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

async function hasActiveSubscriptionForRecipientPhone(phone?: string | null): Promise<boolean> {
  const phoneKey = normalizePhone(phone).slice(-11);
  if (phoneKey.length < 10) return false;

  const result = await db.execute(sql`
    SELECT 1
    FROM users u
    JOIN subscriptions s ON s.user_id = u.id
    WHERE RIGHT(regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g'), 11) = ${phoneKey}
      AND s.status = 'active'
      AND (
        (s.next_payment_date IS NULL AND s.data_fim IS NULL)
        OR GREATEST(
          COALESCE(s.next_payment_date, '-infinity'::timestamp),
          COALESCE(s.data_fim, '-infinity'::timestamp)
        ) >= NOW()
      )
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
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

function isDirectOwnerNotificationConversation(conversation?: any): boolean {
  if (!conversation) return false;
  const jidSuffix = String(conversation.jidSuffix || conversation.jid_suffix || "").trim();
  if (jidSuffix) {
    return jidSuffix === "s.whatsapp.net";
  }
  const remoteJid = String(conversation.remoteJid || conversation.remote_jid || "").trim();
  return !remoteJid || remoteJid.endsWith("@s.whatsapp.net");
}

async function findExistingDirectConversationForConnection(connectionId: string, normalizedPhone: string) {
  const activeConversation = await storage.getActiveConversationByContactNumber(connectionId, normalizedPhone);
  if (isDirectOwnerNotificationConversation(activeConversation)) {
    return activeConversation;
  }

  const existingConversation = await storage.getConversationByContactNumber(connectionId, normalizedPhone);
  if (isDirectOwnerNotificationConversation(existingConversation)) {
    return existingConversation;
  }

  return undefined;
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

  let conversation = await findExistingDirectConversationForConnection(connection.id, normalizedPhone);
  if (!conversation) {
    conversation = await storage.createConversation({
      connectionId: connection.id,
      contactNumber: normalizedPhone,
      remoteJid: `${normalizedPhone}@s.whatsapp.net`,
      jidSuffix: "s.whatsapp.net",
      contactName: name || normalizedPhone,
      contactAvatar: null,
      lastMessageText: null,
      lastMessageTime: null,
      lastMessageFromMe: null,
      unreadCount: 0,
      hasReplied: false,
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

async function isOwnerNotificationRecipientExcluded(ownerUserId: string, phone: string): Promise<boolean> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return false;
  }

  try {
    const exactResult = await db.execute(sql`
      SELECT 1
      FROM exclusion_list
      WHERE user_id = ${ownerUserId}
        AND phone_number = ${normalizedPhone}
        AND is_active = true
      LIMIT 1
    `);
    if ((exactResult.rows || []).length > 0) {
      return true;
    }

    if (await storage.isNumberExcluded(ownerUserId, normalizedPhone)) {
      return true;
    }
    return await storage.isNumberExcludedFromFollowup(ownerUserId, normalizedPhone);
  } catch (error) {
    console.warn("[OWNER-NOTIFICATIONS] Falha ao verificar lista de exclusao:", error);
    return false;
  }
}

async function sendOwnerNotificationRow(
  ownerUserId: string,
  row: OwnerNotificationRow,
  options?: { regenerate?: boolean },
) {
  const config = await getOwnerWorkspaceConfig(ownerUserId);
  const isRodrigoOwner = await isRodrigoOwnerWorkspace(ownerUserId);
  const recipientName = String(row.recipient_name || "Cliente").trim() || "Cliente";
  let metadata = parseJsonField<Record<string, any>>(row.metadata, {});
  const notificationType = String(row.notification_type || "");
  let originalMessage = buildMessageFromTemplate(row.message_template, recipientName, metadata);

  const skip = async (
    status: "skipped_disabled" | "skipped_excluded" | "skipped_active_plan" | "skipped_stale" | "skipped_duplicate",
    reason: string,
  ) => {
    await db.execute(sql`
      UPDATE owner_scheduled_notifications
      SET
        status = ${status},
        final_message = ${originalMessage},
        error_message = ${reason},
        sent_at = NULL,
        updated_at = NOW()
      WHERE id = ${row.id}
    `);

    await createOwnerNotificationLog({
      ownerUserId,
      userId: row.user_id,
      notificationType,
      recipientPhone: row.recipient_phone,
      recipientName,
      messageOriginal: originalMessage,
      messageSent: "",
      status,
      metadata,
      errorMessage: reason,
    });

    return {
      success: false,
      finalMessage: "",
      requeued: false,
      nextAttemptAt: null,
      message: reason,
    };
  };

  if (!isOwnerNotificationModuleEnabled(notificationType, config)) {
    return skip("skipped_disabled", "Envio bloqueado: modulo desativado no painel.");
  }

  const staleReason = getStaleOwnerNotificationSkipReason(row, notificationType, metadata);
  if (staleReason) {
    return skip("skipped_stale", staleReason);
  }

  if (await isOwnerNotificationRecipientExcluded(ownerUserId, row.recipient_phone)) {
    return skip("skipped_excluded", "Numero na lista de exclusao. Envio automatico bloqueado.");
  }

  if (isBillingNotificationType(notificationType)) {
    if (notificationType === "overdue_reminder") {
      const sentDaysAfter = await getSentOverdueDaysAfterAtOrAbove(row, metadata);
      if (sentDaysAfter !== null) {
        return skip(
          "skipped_duplicate",
          `Envio bloqueado: ja existe lembrete de atraso de ${sentDaysAfter} dia(s) ou mais para este ciclo.`,
        );
      }
    }

    const skipReason = await getBillingNotificationSkipReason(row, notificationType, metadata);
    if (skipReason) {
      return skip("skipped_active_plan", skipReason);
    }

    const nextMetadata = await enrichBillingNotificationMetadata(row, notificationType, metadata);
    if (JSON.stringify(nextMetadata) !== JSON.stringify(metadata)) {
      metadata = nextMetadata;
      originalMessage = buildMessageFromTemplate(row.message_template, recipientName, metadata);
      await db.execute(sql`
        UPDATE owner_scheduled_notifications
        SET metadata = ${JSON.stringify(metadata)}::jsonb, updated_at = NOW()
        WHERE id = ${row.id}
      `);
    }
  }

  if (isRodrigoOwner) {
    const engagementGate = await resolveRodrigoOwnerProactiveEngagementGate({
      ownerUserId,
      notificationType,
      config,
    });

    if (!engagementGate.allowed) {
      const reason = buildOwnerEngagementWaitMessage(engagementGate);
      const gateMetadata = {
        ...metadata,
        rodrigoOwnerEngagementGate: serializeOwnerEngagementGate(engagementGate),
      };

      await db.execute(sql`
        UPDATE owner_scheduled_notifications
        SET
          status = 'pending',
          final_message = ${originalMessage},
          error_message = ${reason},
          retry_count = 0,
          scheduled_for = ${engagementGate.nextAttemptAt},
          metadata = ${JSON.stringify(gateMetadata)}::jsonb,
          sent_at = NULL,
          updated_at = NOW()
        WHERE id = ${row.id}
      `);

      await createOwnerNotificationLog({
        ownerUserId,
        userId: row.user_id,
        notificationType,
        recipientPhone: row.recipient_phone,
        recipientName,
        messageOriginal: originalMessage,
        messageSent: "",
        status: "skipped_engagement",
        metadata: gateMetadata,
        errorMessage: reason,
      });

      return {
        success: false,
        finalMessage: "",
        requeued: true,
        nextAttemptAt: engagementGate.nextAttemptAt,
        message: reason,
      };
    }
  }

  let finalMessage = options?.regenerate
    ? originalMessage
    : String(row.final_message || originalMessage).trim() || originalMessage;
  finalMessage = buildMessageFromTemplate(finalMessage, recipientName, metadata).trim() || originalMessage;

  if ((row.ai_enabled ?? false) && (options?.regenerate || !row.final_message)) {
    const customPrompt = String(row.ai_prompt || config.aiVariationPrompt || "").trim();
    if (customPrompt) {
      finalMessage = await applyAIVariation(finalMessage, customPrompt, recipientName);
      finalMessage = buildMessageFromTemplate(finalMessage, recipientName, metadata);
    }
  }

  const messageParts = isBillingNotificationType(notificationType)
    ? buildOwnerBillingMessageParts(finalMessage, metadata)
    : { mainMessage: finalMessage, pixCopyMessage: null };
  const messageToSend = messageParts.mainMessage.trim() || finalMessage;

  const conversation = await ensureOwnerConversation(ownerUserId, row.recipient_phone, recipientName);
  const primaryResult = await sendMessage(ownerUserId, conversation.id, messageToSend, { source: "system" });
  const primaryAccepted = isAcceptedOwnerNotificationSendResult(primaryResult);
  let pixCopyResult: OwnerNotificationSendResult | null = null;
  let pixCopyAccepted = !messageParts.pixCopyMessage;

  if (primaryAccepted && messageParts.pixCopyMessage) {
    pixCopyResult = await sendMessage(ownerUserId, conversation.id, messageParts.pixCopyMessage, { source: "system" });
    pixCopyAccepted = isAcceptedOwnerNotificationSendResult(pixCopyResult);
  }

  const outcomeResult = !primaryAccepted
    ? primaryResult
    : pixCopyResult && !pixCopyAccepted
      ? pixCopyResult
      : primaryResult;
  const sentMessageForAudit = buildOwnerNotificationAuditMessage(messageToSend, messageParts.pixCopyMessage);

  const delivery = buildOwnerDeliveryDecision(row, {
    success: primaryAccepted && pixCopyAccepted,
    blocked: outcomeResult.blocked === true,
    deferred: outcomeResult.deferred === true,
    retryAfterMs: outcomeResult.retryAfterMs,
    reason: outcomeResult.reason || (messageParts.pixCopyMessage ? "Falha ao enviar Pix copia e cola" : "Falha ao enviar mensagem"),
  });
  const success = delivery.status === "sent";
  const errorMessage = delivery.errorMessage;
  const resultMessageId = getOwnerNotificationSendResultMessageId(primaryResult);
  const pixCopyMessageId = getOwnerNotificationSendResultMessageId(pixCopyResult);
  const deliveryMetadata = resultMessageId || messageParts.pixCopyMessage
    ? {
        delivery: {
          ...(resultMessageId
            ? {
                messageId: resultMessageId,
                localRecovery: resultMessageId.startsWith("local_recovered:"),
              }
            : {}),
          ...(messageParts.pixCopyMessage
            ? {
                pixCopySeparated: true,
                pixCopyAccepted,
                pixCopyMessageId: pixCopyMessageId || null,
                pixCopyLocalRecovery: pixCopyMessageId.startsWith("local_recovered:"),
              }
            : {}),
        },
      }
    : {};
  const logMetadata = {
    ...metadata,
    ...deliveryMetadata,
  };

  await db.execute(sql`
    UPDATE owner_scheduled_notifications
    SET
      status = ${delivery.status},
      final_message = ${sentMessageForAudit},
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
    messageSent: sentMessageForAudit,
    status: delivery.logStatus,
    metadata: logMetadata,
    errorMessage: delivery.errorMessage,
  });

  if (isRodrigoOwner && success) {
    await recordRodrigoOwnerProactiveSend(ownerUserId);
  }

  return {
    success,
    finalMessage: sentMessageForAudit,
    requeued: delivery.status === "pending",
    nextAttemptAt: delivery.nextAttemptAt,
    message: success ? "Notificacao enviada com sucesso" : errorMessage || "Falha ao enviar",
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
  const now = new Date();
  const total = users.length;
  const withPlan = users.filter((user) => isManagedUserCurrentlyActive(user, now)).length;
  const withoutPlan = total - withPlan;
  const disconnected = users.filter((user) => !user.whatsapp_connected).length;
  const trialLimitReached = users.filter(isTrialLimitReachedCandidate).length;
  const overduePayments = users.filter((user) => isManagedUserBillingOverdue(user, now)).length;

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
  const isRodrigoOwner = await isRodrigoOwnerWorkspace(ownerUserId);
  const managedUsers = await getManagedUsers(ownerUserId);
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + OWNER_HORIZON_DAYS * 24 * 60 * 60 * 1000);
  let catchupIndex = 0;

  const existingPendingCheckinsResult = await db.execute(sql`
    SELECT DISTINCT ON (user_id)
      user_id,
      scheduled_for,
      metadata
    FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND user_id IS NOT NULL
      AND notification_type IN ('checkin', 'periodic_checkin')
      AND status IN ('pending', 'processing')
      AND scheduled_for > NOW()
    ORDER BY user_id, scheduled_for ASC
  `);

  const existingPendingCheckins = new Map<string, { scheduledFor: Date; metadata: Record<string, any> }>();
  for (const row of existingPendingCheckinsResult.rows as any[]) {
    const userId = String(row.user_id || "");
    const scheduledFor = parseDate(row.scheduled_for);
    if (!userId || !scheduledFor) continue;
    existingPendingCheckins.set(userId, {
      scheduledFor,
      metadata: parseJsonField<Record<string, any>>(row.metadata, {}),
    });
  }

  await db.execute(sql`
    DELETE FROM owner_scheduled_notifications
    WHERE owner_user_id = ${ownerUserId}
      AND status IN ('pending', 'processing')
  `);

  const sentResult = await db.execute(sql`
    SELECT user_id, notification_type, metadata, status, created_at
    FROM owner_notification_logs
    WHERE owner_user_id = ${ownerUserId}
      AND created_at >= NOW() - INTERVAL '45 days'
  `);

  const lastCheckinSent = new Map<string, Date>();
  const sentKeys = new Set<string>();
  const sentOverdueMaxDaysAfterByCycle = new Map<string, number>();
  for (const row of sentResult.rows as any[]) {
    const metadata = parseJsonField<Record<string, any>>(row.metadata, {});
    const notificationType = String(row.notification_type || "");
    const status = String(row.status || "");
    if (row.user_id && shouldUseOwnerLogForDedupe(String(row.status || ""))) {
      sentKeys.add(buildNotificationKey(String(row.user_id), notificationType, metadata));
    }
    if (row.user_id && notificationType === "overdue_reminder" && shouldUseOwnerLogForDedupe(status)) {
      const cycleDate = getBillingCycleDateFromMetadata(metadata);
      const daysAfter = getBillingDaysAfterFromMetadata(metadata);
      if (cycleDate && daysAfter !== null) {
        const key = buildOverdueCycleDedupeKey(String(row.user_id), cycleDate);
        const current = sentOverdueMaxDaysAfterByCycle.get(key);
        if (current === undefined || daysAfter > current) {
          sentOverdueMaxDaysAfterByCycle.set(key, daysAfter);
        }
      }
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
  const activeBillingPhones = new Set(
    managedUsers
      .filter((user) => isManagedUserCurrentlyActive(user, now))
      .map((user) => normalizePhone(user.phone))
      .filter(Boolean),
  );

  for (const user of managedUsers) {
    const phone = normalizePhone(user.phone);
    if (!phone) continue;
    if (await isOwnerNotificationRecipientExcluded(ownerUserId, phone)) {
      continue;
    }

    const recipientName = String(user.name || user.email || phone).trim() || "Cliente";
    const dueDate = getManagedUserDueDate(user);
    const hasActivePlan = isManagedUserCurrentlyActive(user, now);
    const hasActivePlanForSamePhone = activeBillingPhones.has(phone);
    const hasOverdueBilling = isManagedUserBillingOverdue(user, now);
    const cancellationRequested = isManagedUserCancellationRequested(user);

    if (!cancellationRequested && hasActivePlan && config.paymentReminderEnabled && dueDate) {
      let insertedFuturePayment = false;
      const missedPaymentCandidates: Array<{
        daysBefore: number;
        scheduledFor: Date;
        metadata: Record<string, any>;
        key: string;
      }> = [];
      const billingAmount = getManagedUserBillingAmount(user);
      const billingAmountText = billingAmount > 0 ? billingAmount.toFixed(2) : "";
      const billingAmountFormatted = billingAmount > 0 ? formatAmountForMessage(billingAmount) : "";

      for (const daysBefore of [...config.paymentReminderDaysBefore].sort((a, b) => b - a)) {
        const candidate = new Date(dueDate);
        candidate.setDate(candidate.getDate() - daysBefore);
        const scheduledFor = coerceToBusinessSlot(candidate, config, `${user.id}:payment:${daysBefore}`);
        const metadata = {
          daysBefore,
          dueDate: dueDate.toISOString(),
          billingCycleDate: dueDate.toISOString().slice(0, 10),
          valor: billingAmountText,
          valorFormatado: billingAmountFormatted,
          couponPrice: user.coupon_price ?? "",
          planBaseValor: user.plan_valor ?? "",
          planName: user.plan_nome ?? "",
          subscriptionId: user.subscription_id ?? "",
          subscriptionStatus: user.subscription_status ?? "",
          billingKind: "active_renewal",
        };
        const key = buildNotificationKey(user.id, "payment_reminder", metadata);
        if (sentKeys.has(key)) {
          continue;
        }
        if (scheduledFor.getTime() < now.getTime()) {
          missedPaymentCandidates.push({ daysBefore, scheduledFor, metadata, key });
          continue;
        }
        if (!isWithinOwnerHorizon(scheduledFor, horizonEnd)) continue;
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
        insertedFuturePayment = true;
        sentKeys.add(key);
      }

      if (!insertedFuturePayment && missedPaymentCandidates.length > 0) {
        const selected = missedPaymentCandidates.sort((a, b) => a.daysBefore - b.daysBefore)[0];
        const scheduledFor = rebaseMissedOwnerNotification(
          selected.scheduledFor,
          config,
          `${user.id}:payment:${selected.daysBefore}`,
          catchupIndex++,
          now,
        );
        if (isWithinOwnerHorizon(scheduledFor, horizonEnd)) {
          await insertScheduledNotification({
            ownerUserId,
            userId: user.id,
            type: "payment_reminder",
            phone,
            name: recipientName,
            template: config.paymentReminderMessageTemplate,
            aiPrompt: config.paymentReminderAiPrompt,
            aiEnabled: config.paymentReminderAiEnabled,
            metadata: {
              ...selected.metadata,
              catchup: true,
              originalScheduledFor: selected.scheduledFor.toISOString(),
            },
            scheduledFor,
          });
          created += 1;
          sentKeys.add(selected.key);
        }
      }
    }

    if (!cancellationRequested && !hasActivePlanForSamePhone && hasOverdueBilling && config.overdueReminderEnabled && dueDate) {
      const isRecentOverdue = dueDate.getTime() >= now.getTime() - OWNER_STALE_OVERDUE_NOTIFICATION_MS;
      let insertedFutureOverdue = false;
      const missedOverdueCandidates: Array<{
        daysAfter: number;
        scheduledFor: Date;
        metadata: Record<string, any>;
        key: string;
      }> = [];
      const billingAmount = getManagedUserBillingAmount(user);
      const billingAmountText = billingAmount > 0 ? billingAmount.toFixed(2) : "";
      const billingAmountFormatted = billingAmount > 0 ? formatAmountForMessage(billingAmount) : "";

      for (const daysAfter of [...config.overdueReminderDaysAfter].sort((a, b) => a - b)) {
        const candidate = new Date(dueDate);
        candidate.setDate(candidate.getDate() + daysAfter);
        const scheduledFor = coerceToBusinessSlot(candidate, config, `${user.id}:overdue:${daysAfter}`);
        const metadata = {
          daysAfter,
          dueDate: dueDate.toISOString(),
          billingCycleDate: dueDate.toISOString().slice(0, 10),
          valor: billingAmountText,
          valorFormatado: billingAmountFormatted,
          couponPrice: user.coupon_price ?? "",
          planBaseValor: user.plan_valor ?? "",
          planName: user.plan_nome ?? "",
          subscriptionId: user.subscription_id ?? "",
          subscriptionStatus: user.subscription_status ?? "",
          billingKind: user.subscription_status === "active" ? "active_overdue" : "overdue",
        };
        const cycleDate = getBillingCycleDateFromMetadata(metadata);
        const sentMaxDaysAfter = cycleDate
          ? sentOverdueMaxDaysAfterByCycle.get(buildOverdueCycleDedupeKey(user.id, cycleDate))
          : undefined;
        if (sentMaxDaysAfter !== undefined && sentMaxDaysAfter >= daysAfter) {
          continue;
        }
        const key = buildNotificationKey(user.id, "overdue_reminder", metadata);
        if (sentKeys.has(key)) {
          continue;
        }
        if (scheduledFor.getTime() < now.getTime()) {
          if (isRecentOverdue) {
            missedOverdueCandidates.push({ daysAfter, scheduledFor, metadata, key });
          }
          continue;
        }
        if (!isWithinOwnerHorizon(scheduledFor, horizonEnd)) continue;
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
        insertedFutureOverdue = true;
        sentKeys.add(key);
      }

      if (!insertedFutureOverdue && missedOverdueCandidates.length > 0) {
        const selected = missedOverdueCandidates.sort((a, b) => b.daysAfter - a.daysAfter)[0];
        const scheduledFor = rebaseMissedOwnerNotification(
          selected.scheduledFor,
          config,
          `${user.id}:overdue:${selected.daysAfter}`,
          catchupIndex++,
          now,
        );
        if (isWithinOwnerHorizon(scheduledFor, horizonEnd)) {
          await insertScheduledNotification({
            ownerUserId,
            userId: user.id,
            type: "overdue_reminder",
            phone,
            name: recipientName,
            template: config.overdueReminderMessageTemplate,
            aiPrompt: config.overdueReminderAiPrompt,
            aiEnabled: config.overdueReminderAiEnabled,
            metadata: {
              ...selected.metadata,
              catchup: true,
              originalScheduledFor: selected.scheduledFor.toISOString(),
            },
            scheduledFor,
          });
          created += 1;
          sentKeys.add(selected.key);
        }
      }
    }

    if (!cancellationRequested && config.trialLimitReachedEnabled && isTrialLimitReachedCandidate(user)) {
      const metadata = {
        kind: "trial_limit_reached",
        messageLimit: FREE_TRIAL_MESSAGE_LIMIT,
      };
      const key = buildNotificationKey(user.id, "trial_limit_reached", metadata);
      const rawScheduledFor = coerceToBusinessSlot(now, config, `${user.id}:trial-limit`);
      const scheduledFor = rebaseMissedOwnerNotification(
        rawScheduledFor,
        config,
        `${user.id}:trial-limit`,
        catchupIndex++,
        now,
      );

      if (isWithinOwnerHorizon(scheduledFor, horizonEnd) && !sentKeys.has(key)) {
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
        sentKeys.add(key);
      }
    }

    if (
      !cancellationRequested &&
      config.periodicCheckinEnabled &&
      (!isRodrigoOwner || isRodrigoOwnerCheckinRecipientEligible(user, now))
    ) {
      const lastSent = lastCheckinSent.get(user.id);
      const intervalDays =
        config.periodicCheckinMinDays +
        hashToOffset(user.id, Math.max(1, config.periodicCheckinMaxDays - config.periodicCheckinMinDays + 1));
      const storedPendingCheckin = existingPendingCheckins.get(user.id);
      const existingPendingCheckin =
        isRodrigoOwner && storedPendingCheckin?.metadata?.rodrigoSafeCheckin !== true
          ? undefined
          : storedPendingCheckin;
      let rawScheduledFor: Date;
      let scheduledFor: Date;
      let metadata: Record<string, any>;

      if (existingPendingCheckin) {
        scheduledFor = existingPendingCheckin.scheduledFor;
        rawScheduledFor = scheduledFor;
        metadata = {
          seed: existingPendingCheckin.metadata.seed ?? intervalDays,
          checkinCycleDate:
            existingPendingCheckin.metadata.checkinCycleDate ?? scheduledFor.toISOString().slice(0, 10),
          ...existingPendingCheckin.metadata,
        };
      } else {
        const baseDate = isRodrigoOwner
          ? now
          : lastSent
            ? new Date(lastSent)
            : getManagedUserInitialCheckinBaseDate(user, now);
        const candidate = new Date(baseDate);
        candidate.setDate(candidate.getDate() + intervalDays);
        rawScheduledFor = coerceToBusinessSlot(candidate, config, `${user.id}:checkin:${intervalDays}`);
        scheduledFor = rebaseMissedOwnerNotification(
          rawScheduledFor,
          config,
          `${user.id}:checkin:${intervalDays}`,
          catchupIndex++,
          now,
        );
        metadata = {
          seed: intervalDays,
          checkinCycleDate: scheduledFor.toISOString().slice(0, 10),
          ...(isRodrigoOwner
            ? {
                rodrigoSafeCheckin: true,
                checkinAudience: "paid_or_recent_coverage_30d",
              }
            : {}),
          ...(rawScheduledFor.getTime() < now.getTime()
            ? { catchup: true, originalScheduledFor: rawScheduledFor.toISOString() }
            : {}),
        };
      }

      const key = buildNotificationKey(user.id, "periodic_checkin", metadata);
      if (isWithinOwnerHorizon(scheduledFor, horizonEnd) && !sentKeys.has(key)) {
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
        sentKeys.add(key);
      }
    }

    if (
      !cancellationRequested &&
      config.disconnectedAlertEnabled &&
      !user.whatsapp_connected &&
      user.connection_phone_number &&
      user.connection_updated_at
    ) {
      const disconnectedAt = parseDate(user.connection_updated_at);
      if (disconnectedAt) {
        const candidate = new Date(disconnectedAt);
        candidate.setHours(candidate.getHours() + config.disconnectedAlertHours);
        const rawScheduledFor = coerceToBusinessSlot(candidate, config, `${user.id}:disconnected`);
        if (rawScheduledFor.getTime() < now.getTime() - OWNER_STALE_DISCONNECTED_NOTIFICATION_MS) {
          continue;
        }
        const scheduledFor = rebaseMissedOwnerNotification(
          rawScheduledFor,
          config,
          `${user.id}:disconnected`,
          catchupIndex++,
          now,
        );
        const metadata = {
          hoursDisconnected: config.disconnectedAlertHours,
          disconnectedSince: disconnectedAt.toISOString(),
          ...(rawScheduledFor.getTime() < now.getTime()
            ? { catchup: true, originalScheduledFor: rawScheduledFor.toISOString() }
            : {}),
        };
        const key = buildNotificationKey(user.id, "disconnected", metadata);
        if (isWithinOwnerHorizon(scheduledFor, horizonEnd) && !sentKeys.has(key)) {
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
          sentKeys.add(key);
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
      const processedInBatch = index + 1;
      if (processedInBatch % OWNER_QUEUE_BATCH_SIZE === 0) {
        await sleepRange(OWNER_QUEUE_BATCH_PAUSE_MIN_SECONDS, OWNER_QUEUE_BATCH_PAUSE_MAX_SECONDS);
        continue;
      }
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
    batchSize: OWNER_QUEUE_BATCH_SIZE,
    batchPauseMinSeconds: OWNER_QUEUE_BATCH_PAUSE_MIN_SECONDS,
    batchPauseMaxSeconds: OWNER_QUEUE_BATCH_PAUSE_MAX_SECONDS,
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
    if (targetType === "with_plan") return isManagedUserCurrentlyActive(user);
    if (targetType === "without_plan") return !isManagedUserCurrentlyActive(user);
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
    scheduledAt?: string | Date | null;
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
    scheduledAt: payload.scheduledAt || null,
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
    scheduled: result.scheduled,
    total: result.total,
    status: result.status,
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
  const isRodrigoOwner = await isRodrigoOwnerWorkspace(ownerUserId);
  if (!config.welcomeMessageEnabled || config.welcomeMessageVariations.length === 0) {
    return false;
  }

  const randomIndex = Math.floor(Math.random() * config.welcomeMessageVariations.length);
  const recipientName = await resolveOwnerRecipientName(ownerUserId, userPhone);
  let message = buildMessageFromTemplate(
    config.welcomeMessageVariations[randomIndex] || "",
    recipientName,
    {},
  ).trim();

  if (isRodrigoOwner) {
    const engagementGate = await resolveRodrigoOwnerProactiveEngagementGate({
      ownerUserId,
      notificationType: "welcome",
      config,
    });

    if (!engagementGate.allowed) {
      await createOwnerNotificationLog({
        ownerUserId,
        userId: null,
        notificationType: "welcome",
        recipientPhone: normalizePhone(userPhone),
        recipientName,
        messageOriginal: message,
        messageSent: "",
        status: "skipped_engagement",
        metadata: {
          rodrigoOwnerEngagementGate: serializeOwnerEngagementGate(engagementGate),
        },
        errorMessage: buildOwnerEngagementWaitMessage(engagementGate),
      });
      return false;
    }
  }

  if (config.welcomeMessageAiEnabled && config.welcomeMessageAiPrompt) {
    try {
      message = await applyAIVariation(message, config.welcomeMessageAiPrompt, recipientName);
      message = buildMessageFromTemplate(message, recipientName, {}).trim();
    } catch (error) {
      console.error("[OWNER WORKSPACE] Falha ao variar boas-vindas com IA:", error);
    }
  }

  let result: OwnerNotificationSendResult;
  try {
    const conversation = await ensureOwnerConversation(ownerUserId, userPhone, recipientName);
    result = await sendMessage(ownerUserId, conversation.id, message, { source: "system" });
  } catch {
    return false;
  }

  const success = result.success === true && !result.blocked;

  if (isRodrigoOwner) {
    await createOwnerNotificationLog({
      ownerUserId,
      userId: null,
      notificationType: "welcome",
      recipientPhone: normalizePhone(userPhone),
      recipientName,
      messageOriginal: message,
      messageSent: success ? message : "",
      status: success ? "sent" : "failed",
      metadata: {
        delivery: {
          messageId: getOwnerNotificationSendResultMessageId(result),
          blocked: result.blocked === true,
          deferred: result.deferred === true,
        },
      },
      errorMessage: success ? null : result.reason || "Falha ao enviar boas-vindas",
    });

    if (success) {
      await recordRodrigoOwnerProactiveSend(ownerUserId);
    }
  }

  return success;
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
