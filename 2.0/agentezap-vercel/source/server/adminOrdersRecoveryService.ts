import { pool } from "./db";
import { storage } from "./storage";
import { generatePixQRCode } from "./pixService";
import { buildBrazilWhatsAppPhoneVariants, buildWhatsAppJidFromPhone } from "./whatsappPhoneNumber";
import {
  buildPublicDestinationUrl,
  generateAutologinLinkWithRetry,
} from "./autologinService";

const OWNER_ADMIN_EMAIL = "rodrigo4@gmail.com";
const CONFIG_KEY = "admin_orders_recovery_config";
const CHECK_INTERVAL_MS = 60 * 1000;

export type AdminOrdersRecoveryConfig = {
  enabled: boolean;
  firstDelayMinutes: number;
  secondDelayMinutes: number;
  includePixCodeFirstMessage: boolean;
  sendSecondReminder: boolean;
  firstMessageTemplate: string;
  secondMessageTemplate: string;
  activatedAt: string;
};

type OrderCandidate = {
  subscription_id: string;
  user_id: string;
  user_name: string | null;
  email: string | null;
  phone: string | null;
  subscription_status: string;
  payment_method: string | null;
  data_inicio: Date;
  plan_name: string;
  plan_value: string;
  coupon_price: string | null;
  payment_id: string | null;
  pix_code: string | null;
  pix_qr_code: string | null;
};

type RecoveryStep = 1 | 2;

let initialized = false;
let timer: NodeJS.Timeout | null = null;
let processing = false;

function brazilWallClockIso(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .replace(" ", "T");
}

export const DEFAULT_ADMIN_ORDERS_RECOVERY_CONFIG: AdminOrdersRecoveryConfig = {
  enabled: true,
  firstDelayMinutes: 10,
  secondDelayMinutes: 120,
  includePixCodeFirstMessage: true,
  sendSecondReminder: true,
  firstMessageTemplate:
    "Oi, {{nome}}. Vi que seu Pix do {{plano}} ficou pendente.\n\nFalta só o pagamento para liberar seu acesso.\n\nCódigo Pix:\n{{pix_copia_cola}}\n\nSe tiver qualquer dificuldade, me chama aqui que eu te ajudo.",
  secondMessageTemplate:
    "{{nome}}, passando só para lembrar que seu Pix do {{plano}} ainda está pendente.\n\nQuer que eu te envie o código Pix novamente por aqui?",
  activatedAt: brazilWallClockIso(),
};

function normalizeEmail(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

export function isOwnerAdminEmail(email?: string | null): boolean {
  return normalizeEmail(email) === OWNER_ADMIN_EMAIL;
}

function clampDelay(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function normalizeConfig(raw: Partial<AdminOrdersRecoveryConfig> | null | undefined): AdminOrdersRecoveryConfig {
  const base = DEFAULT_ADMIN_ORDERS_RECOVERY_CONFIG;
  return {
    enabled: raw?.enabled !== false,
    firstDelayMinutes: clampDelay(raw?.firstDelayMinutes, base.firstDelayMinutes, 1, 240),
    secondDelayMinutes: clampDelay(raw?.secondDelayMinutes, base.secondDelayMinutes, 15, 1440),
    includePixCodeFirstMessage: raw?.includePixCodeFirstMessage !== false,
    sendSecondReminder: raw?.sendSecondReminder !== false,
    firstMessageTemplate: String(raw?.firstMessageTemplate || base.firstMessageTemplate).trim() || base.firstMessageTemplate,
    secondMessageTemplate: String(raw?.secondMessageTemplate || base.secondMessageTemplate).trim() || base.secondMessageTemplate,
    activatedAt: raw?.activatedAt || brazilWallClockIso(),
  };
}

async function ensureTables(): Promise<void> {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_pix_recovery_messages (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      subscription_id text NOT NULL,
      user_id text NOT NULL,
      admin_id text NOT NULL,
      step integer NOT NULL,
      channel text NOT NULL DEFAULT 'whatsapp_admin',
      status text NOT NULL,
      phone text,
      message text,
      error text,
      message_id text,
      remote_jid text,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now(),
      UNIQUE(subscription_id, step)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_pix_recovery_messages_subscription
    ON admin_pix_recovery_messages(subscription_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_pix_recovery_messages_created
    ON admin_pix_recovery_messages(created_at DESC)
  `);
  initialized = true;
}

export async function getAdminOrdersRecoveryConfig(): Promise<AdminOrdersRecoveryConfig> {
  await ensureTables();
  const existing = await storage.getSystemConfig(CONFIG_KEY);
  if (existing?.valor) {
    try {
      return normalizeConfig(JSON.parse(String(existing.valor)));
    } catch {
      return normalizeConfig(null);
    }
  }

  const config = normalizeConfig({ activatedAt: brazilWallClockIso() });
  await storage.updateSystemConfig(CONFIG_KEY, JSON.stringify(config));
  return config;
}

export async function saveAdminOrdersRecoveryConfig(input: Partial<AdminOrdersRecoveryConfig>): Promise<AdminOrdersRecoveryConfig> {
  const current = await getAdminOrdersRecoveryConfig();
  const shouldResetActivation = current.enabled === false && input.enabled === true;
  const config = normalizeConfig({
    ...current,
    ...input,
    activatedAt: shouldResetActivation ? brazilWallClockIso() : current.activatedAt,
  });
  await storage.updateSystemConfig(CONFIG_KEY, JSON.stringify(config));
  return config;
}

export async function getOwnerAdminRecord(): Promise<{ id: string; email: string } | null> {
  const result = await pool.query(
    "SELECT id, email FROM admins WHERE lower(email) = $1 ORDER BY created_at ASC LIMIT 1",
    [OWNER_ADMIN_EMAIL],
  );
  return result.rows[0] || null;
}

async function isOwnerPaymentRecoveryAllowed(adminId: string): Promise<boolean> {
  const result = await pool.query(
    `
    WITH admin_owner AS (
      SELECT a.id AS admin_id, u.id AS owner_user_id
      FROM admins a
      LEFT JOIN users u ON lower(u.email) = lower(a.email)
      WHERE a.id = $1
      LIMIT 1
    )
    SELECT
      onc.payment_reminder_enabled AS owner_payment_reminder_enabled,
      anc.payment_reminder_enabled AS legacy_payment_reminder_enabled
    FROM admin_owner ao
    LEFT JOIN owner_notification_config onc ON onc.owner_user_id = ao.owner_user_id
    LEFT JOIN admin_notification_config anc ON anc.admin_id = ao.admin_id
    LIMIT 1
    `,
    [adminId],
  );
  const row = result.rows[0];
  if (!row) return true;
  if (row.owner_payment_reminder_enabled === false) return false;
  if (row.legacy_payment_reminder_enabled === false) return false;
  return true;
}

async function hasAnyActiveSubscription(userId: string, excludeSubscriptionId?: string | null): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT 1
    FROM subscriptions
    WHERE user_id = $1
      AND status = 'active'
      AND ($2::text IS NULL OR id <> $2::text)
    LIMIT 1
    `,
    [userId, excludeSubscriptionId || null],
  );
  return (result.rowCount || 0) > 0;
}

function isLikelyTestAccount(candidate: { email?: string | null; user_name?: string | null }): boolean {
  const email = normalizeEmail(candidate.email);
  const name = String(candidate.user_name || "").trim().toLowerCase();
  return email.includes("teste") || email.includes("rodrigo") || name.includes("teste");
}

function formatCurrency(value: string | number | null | undefined): string {
  const amount = Number(value || 0);
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function firstName(name: string | null | undefined): string {
  const clean = String(name || "").trim();
  return clean.split(" ").filter(Boolean)[0] || "tudo bem";
}

function renderTemplate(template: string, candidate: OrderCandidate, pixCode: string, paymentLink: string): string {
  const amount = candidate.coupon_price || candidate.plan_value;
  const replacements: Record<string, string> = {
    nome: firstName(candidate.user_name),
    nome_completo: String(candidate.user_name || "").trim() || "cliente",
    plano: candidate.plan_name,
    valor: formatCurrency(amount),
    pix_copia_cola: pixCode || "Abra o link abaixo para copiar o Pix.",
    link_pagamento: paymentLink,
  };

  let rendered = template;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  return rendered;
}

async function getOrCreatePixPayment(candidate: OrderCandidate): Promise<{ pixCode: string; pixQrCode: string; paymentId: string }> {
  if (candidate.payment_id && candidate.pix_code) {
    return {
      paymentId: candidate.payment_id,
      pixCode: candidate.pix_code,
      pixQrCode: candidate.pix_qr_code || "",
    };
  }

  const amount = Number(candidate.coupon_price || candidate.plan_value || 0);
  const { pixCode, pixQrCode } = await generatePixQRCode({
    planNome: candidate.plan_name,
    valor: amount,
    subscriptionId: candidate.subscription_id,
  });

  if (candidate.payment_id) {
    const updated = await storage.updatePayment(candidate.payment_id, {
      pixCode,
      pixQrCode,
      valor: amount.toFixed(2),
      status: "pending",
    } as any);
    return { paymentId: updated.id, pixCode, pixQrCode };
  }

  const payment = await storage.createPayment({
    subscriptionId: candidate.subscription_id,
    valor: amount.toFixed(2),
    status: "pending",
    pixCode,
    pixQrCode,
  } as any);

  return { paymentId: payment.id, pixCode, pixQrCode };
}

async function buildPaymentLink(userId: string): Promise<string> {
  try {
    return await generateAutologinLinkWithRetry(userId, "/plans");
  } catch (error) {
    console.warn("[Admin Orders] Falha ao gerar link de pagamento com auto-login:", error);
    return buildPublicDestinationUrl("/plans");
  }
}

async function loadDueCandidates(config: AdminOrdersRecoveryConfig): Promise<Array<OrderCandidate & { due_step: RecoveryStep }>> {
  const result = await pool.query(
    `
    WITH latest_payment AS (
      SELECT DISTINCT ON (subscription_id)
        id, subscription_id, pix_code, pix_qr_code, status, created_at
      FROM payments
      ORDER BY subscription_id, created_at DESC
    ), sent AS (
      SELECT subscription_id, step, status
      FROM admin_pix_recovery_messages
      WHERE status = 'sent'
    ), candidates AS (
      SELECT
        s.id AS subscription_id,
        s.user_id,
        u.name AS user_name,
        u.email,
        coalesce(nullif(u.phone, ''), nullif(u.telefone, ''), nullif(u.whatsapp_number, '')) AS phone,
        s.status AS subscription_status,
        s.payment_method,
        s.data_inicio,
        p.nome AS plan_name,
        p.valor AS plan_value,
        s.coupon_price,
        lp.id AS payment_id,
        lp.pix_code,
        lp.pix_qr_code,
        CASE
          WHEN s.data_inicio <= (now() AT TIME ZONE 'America/Sao_Paulo') - ($1::int * interval '1 minute')
            AND NOT EXISTS (SELECT 1 FROM sent WHERE sent.subscription_id = s.id AND sent.step = 1)
            THEN 1
          WHEN $2::boolean = true
            AND s.data_inicio <= (now() AT TIME ZONE 'America/Sao_Paulo') - ($3::int * interval '1 minute')
            AND EXISTS (SELECT 1 FROM sent WHERE sent.subscription_id = s.id AND sent.step = 1)
            AND NOT EXISTS (SELECT 1 FROM sent WHERE sent.subscription_id = s.id AND sent.step = 2)
            THEN 2
          ELSE NULL
        END AS due_step
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN plans p ON p.id = s.plan_id
      LEFT JOIN latest_payment lp ON lp.subscription_id = s.id
      WHERE s.status = 'pending_pix'
        AND coalesce(s.payment_method, 'pix_manual') = 'pix_manual'
        AND s.data_inicio >= $4::timestamp
        AND s.data_inicio >= (now() AT TIME ZONE 'America/Sao_Paulo') - interval '7 days'
        AND coalesce(p.valor, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM subscriptions active_sub
          WHERE active_sub.user_id = s.user_id
            AND active_sub.status = 'active'
            AND active_sub.id <> s.id
        )
    )
    SELECT *
    FROM candidates
    WHERE due_step IS NOT NULL
    ORDER BY data_inicio ASC
    LIMIT 20
    `,
    [
      config.firstDelayMinutes,
      config.sendSecondReminder,
      config.secondDelayMinutes,
      config.activatedAt,
    ],
  );

  return result.rows.filter((row) => row.phone && !isLikelyTestAccount(row));
}

async function reserveMessage(
  candidate: OrderCandidate,
  adminId: string,
  step: RecoveryStep,
  message: string,
  channel = "whatsapp_owner_inbox",
): Promise<boolean> {
  const result = await pool.query(
    `
    INSERT INTO admin_pix_recovery_messages
      (subscription_id, user_id, admin_id, step, channel, status, phone, message, updated_at)
    VALUES ($1, $2, $3, $4, $5, 'processing', $6, $7, now())
    ON CONFLICT (subscription_id, step) DO UPDATE
      SET admin_id = EXCLUDED.admin_id,
          channel = EXCLUDED.channel,
          status = 'processing',
          phone = EXCLUDED.phone,
          message = EXCLUDED.message,
          error = NULL,
          message_id = NULL,
          remote_jid = NULL,
          updated_at = now()
      WHERE admin_pix_recovery_messages.status IN ('failed', 'skipped')
    RETURNING id
    `,
    [candidate.subscription_id, candidate.user_id, adminId, step, channel, candidate.phone, message],
  );
  return result.rowCount === 1;
}

async function finishMessage(
  candidate: OrderCandidate,
  step: RecoveryStep,
  status: "sent" | "failed" | "skipped",
  data: { error?: string; messageId?: string; remoteJid?: string },
): Promise<void> {
  await pool.query(
    `
    UPDATE admin_pix_recovery_messages
    SET status = $3,
        error = $4,
        message_id = $5,
        remote_jid = $6,
        updated_at = now()
    WHERE subscription_id = $1 AND step = $2
    `,
    [candidate.subscription_id, step, status, data.error || null, data.messageId || null, data.remoteJid || null],
  );
}

async function isStillPending(subscriptionId: string): Promise<boolean> {
  const result = await pool.query("SELECT status FROM subscriptions WHERE id = $1 LIMIT 1", [subscriptionId]);
  return result.rows[0]?.status === "pending_pix";
}

async function resolveOwnerDeliveryContext(adminId: string): Promise<{
  userId: string;
  connectionId: string;
} | null> {
  const admin = await storage.getAdminById(adminId);
  if (!admin?.email) {
    return null;
  }

  const ownerUser = await storage.getUserByEmail(admin.email);
  if (!ownerUser?.id) {
    return null;
  }

  const ownerConnection = await storage.getUserActiveConnection?.(ownerUser.id);
  if (!ownerConnection?.id) {
    return null;
  }

  return {
    userId: ownerUser.id,
    connectionId: ownerConnection.id,
  };
}

async function getOrCreateOwnerConversation(
  connectionId: string,
  phone: string,
  contactName?: string | null,
) {
  const phoneVariants = buildBrazilWhatsAppPhoneVariants(phone);
  const canonicalPhone =
    phoneVariants.find((candidate) => candidate.startsWith("55")) ||
    phoneVariants[0];

  if (!canonicalPhone) {
    throw new Error(`Numero invalido: ${phone}`);
  }

  for (const candidate of phoneVariants) {
    const existingConversation = await storage.getActiveConversationByContactNumber(
      connectionId,
      candidate,
    );
    if (existingConversation) {
      return existingConversation;
    }
  }

  return storage.createConversation({
    connectionId,
    contactNumber: canonicalPhone,
    remoteJid: buildWhatsAppJidFromPhone(canonicalPhone) || `${canonicalPhone}@s.whatsapp.net`,
    jidSuffix: "s.whatsapp.net",
    contactName: String(contactName || "").trim() || canonicalPhone,
    contactAvatar: null,
    lastMessageText: null,
    lastMessageTime: null,
    lastMessageFromMe: false,
    unreadCount: 0,
  });
}

async function sendOwnerWhatsAppNotification(
  adminId: string,
  phone: string,
  message: string,
  contactName?: string | null,
) {
  const deliveryContext = await resolveOwnerDeliveryContext(adminId);
  if (!deliveryContext) {
    return {
      success: false,
      error: "Owner WhatsApp not connected",
      originalPhone: phone,
    };
  }

  const conversation = await getOrCreateOwnerConversation(
    deliveryContext.connectionId,
    phone,
    contactName,
  );

  const { sendMessage } = await import("./whatsapp");
  const sendResult = await sendMessage(deliveryContext.userId, conversation.id, message, {
    isFromAgent: true,
    source: "followup",
    validateDestination: true,
  });

  if (!sendResult.success) {
    return {
      success: false,
      error: sendResult.reason || "Falha no envio pelo inbox do owner",
      originalPhone: phone,
      remoteJid: conversation.remoteJid || null,
      conversationId: conversation.id,
    };
  }

  const refreshedConversation = await storage.getConversation(conversation.id);
  return {
    success: true,
    originalPhone: phone,
    validatedPhone: refreshedConversation?.contactNumber || conversation.contactNumber || phone,
    messageId: sendResult.messageId,
    remoteJid: refreshedConversation?.remoteJid || conversation.remoteJid || null,
    conversationId: conversation.id,
  };
}

export async function processAdminOrdersRecoveryOnce(): Promise<{ processed: number; sent: number; failed: number }> {
  await ensureTables();
  const config = await getAdminOrdersRecoveryConfig();
  if (!config.enabled) return { processed: 0, sent: 0, failed: 0 };

  const admin = await getOwnerAdminRecord();
  if (!admin) return { processed: 0, sent: 0, failed: 0 };
  if (!(await isOwnerPaymentRecoveryAllowed(admin.id))) {
    console.log("[Admin Orders] Recuperação de Pix pulada: lembrete de pagamento desativado no painel.");
    return { processed: 0, sent: 0, failed: 0 };
  }

  const candidates = await loadDueCandidates(config);
  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const step = candidate.due_step;
    try {
      if (!(await isStillPending(candidate.subscription_id))) continue;
      if (await hasAnyActiveSubscription(candidate.user_id, candidate.subscription_id)) {
        console.log(`[Admin Orders] Pulando Pix de ${candidate.email || candidate.user_id}: cliente já possui assinatura ativa.`);
        continue;
      }

      const paymentLink = await buildPaymentLink(candidate.user_id);
      const pix = step === 1 && config.includePixCodeFirstMessage
        ? await getOrCreatePixPayment(candidate)
        : { pixCode: candidate.pix_code || "", pixQrCode: candidate.pix_qr_code || "", paymentId: candidate.payment_id || "" };

      const template = step === 1 ? config.firstMessageTemplate : config.secondMessageTemplate;
      const message = renderTemplate(template, candidate, pix.pixCode, paymentLink).trim();
      const reserved = await reserveMessage(candidate, admin.id, step, message);
      if (!reserved) continue;

      processed++;
      if (!(await isStillPending(candidate.subscription_id))) {
        await finishMessage(candidate, step, "skipped", { error: "Assinatura deixou de estar pendente antes do envio" });
        continue;
      }

      const result = await sendOwnerWhatsAppNotification(admin.id, candidate.phone || "", message, candidate.user_name);
      if (result.success) {
        sent++;
        await finishMessage(candidate, step, "sent", {
          messageId: result.messageId,
          remoteJid: result.remoteJid,
        });
      } else {
        failed++;
        await finishMessage(candidate, step, "failed", { error: result.error || "Falha no envio" });
      }
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      await finishMessage(candidate, step, "failed", { error: message }).catch(() => {});
    }
  }

  return { processed, sent, failed };
}

export function startAdminOrdersRecoveryService(): void {
  if (timer) return;
  if (process.env.NODE_ENV !== "production") {
    console.log("[Admin Orders] Automação de pedidos não inicia fora de produção.");
    return;
  }

  console.log("[Admin Orders] Automação de recuperação de Pix iniciada.");
  timer = setInterval(() => {
    if (processing) return;
    processing = true;
    processAdminOrdersRecoveryOnce()
      .catch((error) => console.error("[Admin Orders] Erro na automação de pedidos:", error))
      .finally(() => {
        processing = false;
      });
  }, CHECK_INTERVAL_MS);

  setTimeout(() => {
    if (processing) return;
    processing = true;
    processAdminOrdersRecoveryOnce()
      .catch((error) => console.error("[Admin Orders] Erro na primeira varredura:", error))
      .finally(() => {
        processing = false;
      });
  }, 30 * 1000);
}

export async function getAdminOrdersReport(days = 7, includeTests = false) {
  await ensureTables();
  const safeDays = Math.min(Math.max(Math.round(Number(days) || 7), 1), 30);
  const result = await pool.query(
    `
    WITH params AS (
      SELECT
        (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - (($1::int - 1) * interval '1 day'))::timestamp AS start_at,
        (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 day')::timestamp AS end_at
    ), generated AS (
      SELECT s.*
      FROM subscriptions s, params p
      WHERE s.data_inicio IS NOT NULL
        AND s.data_inicio >= p.start_at
        AND s.data_inicio < p.end_at
    ), latest_overall AS (
      SELECT DISTINCT ON (s.user_id)
        s.user_id,
        s.status AS latest_status
      FROM subscriptions s
      ORDER BY s.user_id, s.created_at DESC
    ), per_user_period AS (
      SELECT
        g.*,
        bool_or(g.status = 'active') OVER (PARTITION BY g.user_id) AS had_active,
        count(*) OVER (PARTITION BY g.user_id) AS attempts_in_period,
        row_number() OVER (
          PARTITION BY g.user_id
          ORDER BY
            CASE WHEN g.status = 'active' THEN 0 WHEN g.status = 'pending_pix' THEN 1 ELSE 2 END,
            g.data_inicio DESC NULLS LAST,
            g.created_at DESC
        ) AS rn
      FROM generated g
    ), latest_payment AS (
      SELECT DISTINCT ON (subscription_id)
        subscription_id,
        id AS payment_id,
        status AS payment_status,
        pix_code,
        created_at AS payment_created_at
      FROM payments
      ORDER BY subscription_id, created_at DESC
    ), classified AS (
      SELECT
        b.id AS subscription_id,
        b.user_id,
        u.name,
        u.email,
        coalesce(nullif(u.phone, ''), nullif(u.telefone, ''), nullif(u.whatsapp_number, '')) AS phone,
        u.created_at AS account_created_at,
        b.status AS period_status,
        lo.latest_status,
        b.payment_method,
        b.data_inicio,
        b.created_at AS subscription_created_at,
        b.updated_at AS subscription_updated_at,
        b.attempts_in_period,
        p.nome AS plan_name,
        p.valor AS plan_value,
        b.coupon_price,
        lp.payment_id,
        lp.payment_status,
        length(coalesce(lp.pix_code, '')) > 0 AS has_pix_code,
        CASE
          WHEN lower(coalesce(u.email, '')) LIKE '%teste%'
            OR lower(coalesce(u.name, '')) LIKE '%teste%'
            OR lower(coalesce(u.email, '')) LIKE '%rodrigo%'
          THEN true ELSE false
        END AS likely_test_account,
        CASE
          WHEN lo.latest_status = 'active' OR b.had_active THEN 'paid_active'
          WHEN lo.latest_status IN ('pending_pix', 'pending_payment', 'pending', 'cancelled')
            OR b.status IN ('pending_pix', 'pending_payment', 'pending', 'cancelled')
          THEN 'generated_not_paid'
          ELSE coalesce(lo.latest_status, b.status, 'other')
        END AS outcome
      FROM per_user_period b
      JOIN users u ON u.id = b.user_id
      JOIN plans p ON p.id = b.plan_id
      LEFT JOIN latest_overall lo ON lo.user_id = b.user_id
      LEFT JOIN latest_payment lp ON lp.subscription_id = b.id
      WHERE b.rn = 1
        AND ($2::boolean = true OR NOT (
          lower(coalesce(u.email, '')) LIKE '%teste%'
          OR lower(coalesce(u.name, '')) LIKE '%teste%'
          OR lower(coalesce(u.email, '')) LIKE '%rodrigo%'
        ))
        AND coalesce(p.valor, 0) > 0
    ), message_summary AS (
      SELECT
        subscription_id,
        count(*) FILTER (WHERE status = 'sent') AS sent_count,
        max(created_at) FILTER (WHERE status = 'sent') AS last_sent_at,
        max(error) FILTER (WHERE status = 'failed') AS last_error
      FROM admin_pix_recovery_messages
      GROUP BY subscription_id
    )
    SELECT json_build_object(
      'summary', (
        SELECT json_build_object(
          'uniqueClientsGenerated', count(*),
          'uniqueClientsPaid', count(*) FILTER (WHERE outcome = 'paid_active'),
          'uniqueClientsNotPaid', count(*) FILTER (WHERE outcome = 'generated_not_paid'),
          'conversionPercent', round((count(*) FILTER (WHERE outcome = 'paid_active')::numeric / nullif(count(*), 0)) * 100, 1),
          'abandonmentPercent', round((count(*) FILTER (WHERE outcome = 'generated_not_paid')::numeric / nullif(count(*), 0)) * 100, 1),
          'rawSubscriptionRecords', (SELECT count(*) FROM generated),
          'rawActiveRecords', (SELECT count(*) FROM generated WHERE status = 'active'),
          'rawPendingPixRecords', (SELECT count(*) FROM generated WHERE status = 'pending_pix')
        )
        FROM classified
      ),
      'byDay', (
        SELECT coalesce(json_agg(row_to_json(day_rows) ORDER BY day_rows.day), '[]'::json)
        FROM (
          SELECT
            data_inicio::date::text AS day,
            count(*) AS generated,
            count(*) FILTER (WHERE outcome = 'paid_active') AS paid,
            count(*) FILTER (WHERE outcome = 'generated_not_paid') AS not_paid,
            round((count(*) FILTER (WHERE outcome = 'paid_active')::numeric / nullif(count(*), 0)) * 100, 1) AS conversion_percent
          FROM classified
          GROUP BY data_inicio::date
        ) day_rows
      ),
      'byPlan', (
        SELECT coalesce(json_agg(row_to_json(plan_rows) ORDER BY plan_rows.generated DESC, plan_rows.plan_name), '[]'::json)
        FROM (
          SELECT
            plan_name,
            count(*) AS generated,
            count(*) FILTER (WHERE outcome = 'paid_active') AS paid,
            count(*) FILTER (WHERE outcome = 'generated_not_paid') AS not_paid,
            round((count(*) FILTER (WHERE outcome = 'paid_active')::numeric / nullif(count(*), 0)) * 100, 1) AS conversion_percent
          FROM classified
          GROUP BY plan_name
        ) plan_rows
      ),
      'orders', (
        SELECT coalesce(json_agg(row_to_json(order_rows) ORDER BY order_rows.data_inicio DESC), '[]'::json)
        FROM (
          SELECT
            c.*,
            round((extract(epoch FROM (c.data_inicio - c.account_created_at)) / 3600.0)::numeric, 2) AS hours_account_to_generate,
            coalesce(ms.sent_count, 0) AS recovery_sent_count,
            ms.last_sent_at,
            ms.last_error
          FROM classified c
          LEFT JOIN message_summary ms ON ms.subscription_id = c.subscription_id
          ORDER BY c.data_inicio DESC
          LIMIT 80
        ) order_rows
      ),
      'recentMessages', (
        SELECT coalesce(json_agg(row_to_json(message_rows) ORDER BY message_rows.created_at DESC), '[]'::json)
        FROM (
          SELECT
            m.id,
            m.subscription_id,
            m.user_id,
            m.step,
            m.status,
            m.phone,
            m.error,
            m.created_at,
            u.name,
            u.email
          FROM admin_pix_recovery_messages m
          LEFT JOIN users u ON u.id = m.user_id
          ORDER BY m.created_at DESC
          LIMIT 20
        ) message_rows
      )
    ) AS data
    `,
    [safeDays, includeTests],
  );

  return result.rows[0]?.data || {};
}

export async function sendAdminOrderRecoveryNow(subscriptionId: string, step: RecoveryStep = 1) {
  await ensureTables();
  const admin = await getOwnerAdminRecord();
  if (!admin) {
    throw new Error("Admin owner não encontrado");
  }

  const result = await pool.query(
    `
    SELECT
      s.id AS subscription_id,
      s.user_id,
      u.name AS user_name,
      u.email,
      coalesce(nullif(u.phone, ''), nullif(u.telefone, ''), nullif(u.whatsapp_number, '')) AS phone,
      s.status AS subscription_status,
      s.payment_method,
      s.data_inicio,
      p.nome AS plan_name,
      p.valor AS plan_value,
      s.coupon_price,
      lp.id AS payment_id,
      lp.pix_code,
      lp.pix_qr_code
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    JOIN plans p ON p.id = s.plan_id
    LEFT JOIN LATERAL (
      SELECT id, pix_code, pix_qr_code
      FROM payments
      WHERE subscription_id = s.id
      ORDER BY created_at DESC
      LIMIT 1
    ) lp ON true
    WHERE s.id = $1
    LIMIT 1
    `,
    [subscriptionId],
  );

  const candidate = result.rows[0] as OrderCandidate | undefined;
  if (!candidate) throw new Error("Pedido não encontrado");
  if (candidate.subscription_status !== "pending_pix") throw new Error("Pedido não está pendente de Pix");
  if (!candidate.phone) throw new Error("Cliente sem telefone cadastrado");
  if (!(await isOwnerPaymentRecoveryAllowed(admin.id))) {
    throw new Error("Lembrete de pagamento está desativado no painel");
  }
  if (await hasAnyActiveSubscription(candidate.user_id, candidate.subscription_id)) {
    throw new Error("Cliente já possui assinatura ativa");
  }

  const config = await getAdminOrdersRecoveryConfig();
  const pix = step === 1 ? await getOrCreatePixPayment(candidate) : { pixCode: candidate.pix_code || "", pixQrCode: "", paymentId: "" };
  const paymentLink = await buildPaymentLink(candidate.user_id);
  const template = step === 1 ? config.firstMessageTemplate : config.secondMessageTemplate;
  const message = renderTemplate(template, candidate, pix.pixCode, paymentLink).trim();
  const reserved = await reserveMessage(candidate, admin.id, step, message);
  if (!reserved) throw new Error(`Lembrete ${step} já foi registrado para este pedido`);

  const sendResult = await sendOwnerWhatsAppNotification(admin.id, candidate.phone, message, candidate.user_name);
  if (!sendResult.success) {
    await finishMessage(candidate, step, "failed", { error: sendResult.error || "Falha no envio" });
    throw new Error(sendResult.error || "Falha no envio");
  }

  await finishMessage(candidate, step, "sent", {
    messageId: sendResult.messageId,
    remoteJid: sendResult.remoteJid,
  });

  return { success: true, messageId: sendResult.messageId };
}
