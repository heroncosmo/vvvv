import { storage } from "./storage";
import { supabase } from "./supabaseAuth";
import { isBase64Url } from "./mediaStorageService";
import { pool } from "./db";

const RODRIGO_PAYMENT_OWNER_EMAIL = "rodrigo4@gmail.com";

function normalizePhoneDigits(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

function matchPhoneSuffix(candidate: string | null | undefined, target: string): boolean {
  const digits = normalizePhoneDigits(candidate);
  if (!digits || !target) return false;
  if (digits.length < 10 || target.length < 10) return false;
  return (
    digits === target ||
    digits.endsWith(target) ||
    target.endsWith(digits) ||
    digits.slice(-11) === target.slice(-11)
  );
}

function readUserPhoneCandidates(candidate: any): string[] {
  return [
    candidate?.phone,
    candidate?.telefone,
    candidate?.whatsappNumber,
    candidate?.whatsapp_number,
  ]
    .map(normalizePhoneDigits)
    .filter((value) => value.length >= 10);
}

async function scoreReceiptUserCandidate(user: any): Promise<number> {
  if (!user?.id) return -1;
  try {
    const subscription = await storage.getUserSubscription(user.id);
    const status = String((subscription as any)?.status || "").trim().toLowerCase();
    const pendingReceipt = (subscription as any)?.pendingReceipt === true || (subscription as any)?.pending_receipt === true;
    if (pendingReceipt || status === "pending_pix" || status === "pending") return 40;
    if (status === "active") return 20;
    if (status) return 5;
  } catch (error) {
    console.warn("[PaymentReceipt] Falha ao pontuar candidato por assinatura:", error);
  }
  return 0;
}

async function findUserByStrongPhoneEvidence(normalizedPhone: string): Promise<any | null> {
  if (normalizedPhone.length < 10) return null;

  const users = await storage.getAllUsers();
  const candidates = users
    .map((candidate: any) => {
      const phones = readUserPhoneCandidates(candidate);
      const exactMatch = phones.some((phone) => phone === normalizedPhone);
      const suffixMatch = phones.some((phone) => matchPhoneSuffix(phone, normalizedPhone));
      return { user: candidate, exactMatch, suffixMatch };
    })
    .filter((candidate) => candidate.exactMatch || candidate.suffixMatch);

  if (candidates.length === 0) return null;

  const scored = await Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      score: (candidate.exactMatch ? 100 : 0) + (candidate.suffixMatch ? 10 : 0) + await scoreReceiptUserCandidate(candidate.user),
    })),
  );

  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best?.user?.id) return null;
  if (!second || best.score > second.score) return best.user;
  return null;
}

async function resolveUserIdForReceipt(params: {
  userId?: string;
  phoneNumber?: string;
}): Promise<string | null> {
  const normalizedPhone = normalizePhoneDigits(params.phoneNumber);
  if (normalizedPhone) {
    const userByPhone = await storage.getUserByPhone(normalizedPhone);
    if (userByPhone?.id) return userByPhone.id;

    const matchedUser = await findUserByStrongPhoneEvidence(normalizedPhone);
    if (matchedUser?.id) return matchedUser.id;

    return null;
  }

  if (params.userId) {
    const user = await storage.getUser(params.userId);
    if (user?.id) return user.id;
  }

  return null;
}

async function ensurePaymentReceiptBucket(): Promise<void> {
  const { error } = await supabase.storage.getBucket("payment-receipts");
  if (error && error.message?.includes("not found")) {
    await supabase.storage.createBucket("payment-receipts", {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
    });
  }
}

function normalizeReceiptMimeType(
  mimeTypeHint?: string | null,
  fetchedMimeType?: string | null,
): string {
  const mimeType = String(mimeTypeHint || fetchedMimeType || "").trim();
  if (mimeType) return mimeType;
  return "application/octet-stream";
}

function extensionFromMimeType(mimeType: string): string {
  const clean = mimeType.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/octet-stream": "bin",
  };
  return map[clean] || "bin";
}

function parseReceiptMoneyAmount(value: unknown): number {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[R$]/gi, "");
  if (!text) return NaN;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseReceiptEvidenceDate(value: unknown): Date | null {
  const text = String(value || "").trim();
  if (!text) return null;

  const direct = new Date(text);
  if (Number.isFinite(direct.getTime())) return direct;

  const brazilMatch = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!brazilMatch) return null;
  const day = Number(brazilMatch[1]);
  const month = Number(brazilMatch[2]);
  const rawYear = Number(brazilMatch[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const hour = Number(brazilMatch[4] || 12);
  const minute = Number(brazilMatch[5] || 0);
  const second = Number(brazilMatch[6] || 0);
  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (!Number.isFinite(parsed.getTime())) return null;
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return parsed;
}

function receiptDateIsAcceptable(paymentDate: Date, now = new Date()): boolean {
  const maxPastDays = Number(process.env.AGENTEZAP_VISUAL_RECEIPT_MAX_PAST_DAYS || "90");
  const maxFutureDays = Number(process.env.AGENTEZAP_VISUAL_RECEIPT_MAX_FUTURE_DAYS || "1");
  const pastMs = Math.max(1, Number.isFinite(maxPastDays) ? maxPastDays : 90) * 24 * 60 * 60 * 1000;
  const futureMs = Math.max(0, Number.isFinite(maxFutureDays) ? maxFutureDays : 1) * 24 * 60 * 60 * 1000;
  const diff = paymentDate.getTime() - now.getTime();
  return diff <= futureMs && diff >= -pastMs;
}

async function resolveExpectedSubscriptionAmount(subscription: any): Promise<number> {
  const candidates = [
    subscription?.couponPrice,
    subscription?.coupon_price,
    subscription?.plan?.valor_primeira_cobranca,
    subscription?.plan?.valorPrimeiraCobranca,
    subscription?.plan?.valor,
    subscription?.plan?.preco,
  ];
  for (const candidate of candidates) {
    const parsed = parseReceiptMoneyAmount(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const planId = String(subscription?.planId || subscription?.plan_id || "").trim();
  if (planId) {
    const planResult = await pool.query(
      `
        SELECT
          valor_primeira_cobranca,
          valor
        FROM plans
        WHERE id = $1
        LIMIT 1
      `,
      [planId],
    );
    const plan = planResult.rows[0] || null;
    for (const candidate of [plan?.valor_primeira_cobranca, plan?.valor]) {
      const parsed = parseReceiptMoneyAmount(candidate);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return NaN;
}

function visualReceiptStatusLooksPaid(value: unknown): boolean {
  const text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(pago|paga|aprovad[oa]|confirmad[oa]|concluid[oa]|efetivad[oa]|realizad[oa]|paid|approved|confirmed|completed)\b/.test(text);
}

function normalizeReceiptMatchText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function configuredReceiptMatchList(envName: string, defaults: string[]): string[] {
  const configured = String(process.env[envName] || "").trim();
  const values = configured ? configured.split(/[|,;]/) : defaults;
  return values
    .map((value) => normalizeReceiptMatchText(value))
    .filter(Boolean);
}

function visualReceiptMatchesExpectedText(value: unknown, expectedValues: string[]): boolean {
  const normalized = normalizeReceiptMatchText(value);
  if (!normalized) return false;
  return expectedValues.some((expected) => expected && normalized.includes(expected));
}

function validateVisualReceiptReceiver(params: {
  receiverName: unknown;
  receiverInstitution: unknown;
}): void {
  const expectedNames = configuredReceiptMatchList(
    "AGENTEZAP_VISUAL_RECEIPT_EXPECTED_RECEIVER_NAMES",
    ["Maria Fernandes de Bessa Macedo", "Maria F Bessa Macedo"],
  );
  const expectedInstitutions = configuredReceiptMatchList(
    "AGENTEZAP_VISUAL_RECEIPT_EXPECTED_RECEIVER_INSTITUTIONS",
    ["Nu Pagamentos", "Nubank"],
  );

  if (!visualReceiptMatchesExpectedText(params.receiverName, expectedNames)) {
    throw new Error("Recebedor do comprovante visual nao confere com o favorecido esperado");
  }
  if (!visualReceiptMatchesExpectedText(params.receiverInstitution, expectedInstitutions)) {
    throw new Error("Instituicao do recebedor no comprovante visual nao confere com o favorecido esperado");
  }
}

function buildVisualReceiptApprovalNotes(params: {
  paymentDate: Date;
  amountPaid: number;
  expectedAmount: number;
  evidenceSummary?: string | null;
  receiptStatus?: string | null;
  receiverName?: string | null;
  receiverInstitution?: string | null;
}): string {
  const summary = String(params.evidenceSummary || "").trim().slice(0, 500);
  const visibleStatus = String(params.receiptStatus || "").trim().slice(0, 80);
  const receiverName = String(params.receiverName || "").trim().slice(0, 120);
  const receiverInstitution = String(params.receiverInstitution || "").trim().slice(0, 120);
  return [
    "Aprovado automaticamente pelo Codex com evidencia visual do comprovante.",
    `Valor visual: ${params.amountPaid.toFixed(2)}; esperado: ${params.expectedAmount.toFixed(2)}.`,
    `Data visual: ${params.paymentDate.toISOString()}.`,
    visibleStatus ? `Status visual: ${visibleStatus}.` : "",
    receiverName ? `Recebedor visual: ${receiverName}.` : "",
    receiverInstitution ? `Instituicao visual: ${receiverInstitution}.` : "",
    summary ? `Evidencia: ${summary}` : "",
  ].filter(Boolean).join(" ");
}

async function publicTableExists(client: any, tableName: string): Promise<boolean> {
  const result = await client.query("SELECT to_regclass($1) AS table_name", [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

function buildReceiptPhoneDigits(phoneNumber?: string | null): string[] {
  const digits = normalizePhoneDigits(phoneNumber);
  return Array.from(new Set([
    digits,
    digits.length > 11 ? digits.slice(-11) : "",
    digits.length > 10 ? digits.slice(-10) : "",
  ].filter((value) => value.length >= 10)));
}

async function cleanupRodrigoPaidLeadFollowupInTransaction(client: any, params: {
  userId: string;
  subscriptionId: string;
  phoneNumber?: string | null;
}): Promise<{
  crmConversationsPaused: number;
  adminConversationsPaused: number;
  ownerNotificationsSkipped: number;
  pixRecoveryMessagesSkipped: number;
}> {
  const reason = "Pagamento aprovado - follow-up pausado automaticamente.";
  const phoneDigits = buildReceiptPhoneDigits(params.phoneNumber);
  const phoneDigitsParam = phoneDigits.length ? phoneDigits : null;

  const crmResult = await client.query(
    `
      UPDATE conversations c
      SET followup_active = false,
          followup_stage = 0,
          next_followup_at = NULL,
          followup_disabled_reason = $3,
          updated_at = NOW()
      FROM whatsapp_connections wc
      JOIN users owner_user ON owner_user.id = wc.user_id
      WHERE c.connection_id = wc.id
        AND LOWER(owner_user.email) = LOWER($1)
        AND $2::text[] IS NOT NULL
        AND regexp_replace(COALESCE(c.contact_number, ''), '\\D', '', 'g') = ANY($2::text[])
    `,
    [RODRIGO_PAYMENT_OWNER_EMAIL, phoneDigitsParam, reason],
  );

  const adminResult = await client.query(
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
    [RODRIGO_PAYMENT_OWNER_EMAIL, params.userId, phoneDigitsParam],
  );

  let ownerNotificationsSkipped = 0;
  if (await publicTableExists(client, "owner_scheduled_notifications")) {
    const ownerResult = await client.query(
      `
        UPDATE owner_scheduled_notifications osn
        SET status = 'skipped_active_plan',
            error_message = $5,
            metadata = COALESCE(osn.metadata, '{}'::jsonb) || jsonb_build_object(
              'skippedReason', 'payment_already_approved',
              'subscriptionId', $3,
              'source', 'codex_visual_receipt'
            ),
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
      [RODRIGO_PAYMENT_OWNER_EMAIL, params.userId, params.subscriptionId, phoneDigitsParam, reason],
    );
    ownerNotificationsSkipped = ownerResult.rowCount || 0;
  }

  let pixRecoveryMessagesSkipped = 0;
  if (await publicTableExists(client, "admin_pix_recovery_messages")) {
    const pixResult = await client.query(
      `
        UPDATE admin_pix_recovery_messages
        SET status = 'skipped',
            error = 'skipped_payment_already_recorded',
            updated_at = NOW()
        WHERE subscription_id = $1
          AND status IN ('pending', 'processing', 'failed')
      `,
      [params.subscriptionId],
    );
    pixRecoveryMessagesSkipped = pixResult.rowCount || 0;
  }

  return {
    crmConversationsPaused: crmResult.rowCount || 0,
    adminConversationsPaused: adminResult.rowCount || 0,
    ownerNotificationsSkipped,
    pixRecoveryMessagesSkipped,
  };
}

function guessOriginalFileName(sourceUrl: string, mimeType: string): string {
  if (!isBase64Url(sourceUrl)) {
    try {
      const url = new URL(sourceUrl);
      const lastSegment = url.pathname.split("/").pop();
      if (lastSegment) {
        return decodeURIComponent(lastSegment);
      }
    } catch {
      // fall through
    }
  }

  return `comprovante-${Date.now()}.${extensionFromMimeType(mimeType)}`;
}

async function downloadReceiptBuffer(params: {
  sourceUrl: string;
  mimeTypeHint?: string;
}): Promise<{ buffer: Buffer; mimeType: string; originalFileName: string }> {
  const { sourceUrl, mimeTypeHint } = params;

  if (isBase64Url(sourceUrl)) {
    const matches = sourceUrl.match(/^data:([^,]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Formato de comprovante invalido");
    }

    const mimeType = normalizeReceiptMimeType(mimeTypeHint, matches[1]);
    return {
      buffer: Buffer.from(matches[2], "base64"),
      mimeType,
      originalFileName: guessOriginalFileName(sourceUrl, mimeType),
    };
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar comprovante: ${response.status} ${response.statusText}`);
  }

  const mimeType = normalizeReceiptMimeType(mimeTypeHint, response.headers.get("content-type"));
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType,
    originalFileName: guessOriginalFileName(sourceUrl, mimeType),
  };
}

async function resolveSubscriptionForReceipt(userId: string) {
  let subscription = await storage.getUserSubscription(userId);

  if (!subscription) {
    const activePlans = await storage.getActivePlans();
    const selectedPlan = [...activePlans].sort(
      (a: any, b: any) => Number(a.preco || 0) - Number(b.preco || 0),
    )[0];

    if (!selectedPlan) {
      throw new Error("Nao ha plano ativo para vincular o comprovante");
    }

    await storage.createSubscription({
      userId,
      planId: selectedPlan.id,
      status: "pending",
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paymentMethod: "pix_manual",
    });

    subscription = await storage.getUserSubscription(userId);
  }

  if (!subscription) {
    throw new Error("Nao consegui preparar a assinatura para registrar o comprovante");
  }

  return subscription;
}

export async function registerPaymentReceiptFromWhatsApp(params: {
  userId?: string;
  phoneNumber?: string;
  sourceUrl: string;
  amount?: string | number | null;
  paymentId?: string | null;
  mimeTypeHint?: string | null;
}): Promise<{
  receiptId: string;
  receiptUrl: string;
  subscriptionId: string;
  userId: string;
  amount: number;
}> {
  const sourceUrl = String(params.sourceUrl || "").trim();
  if (!sourceUrl) {
    throw new Error("Comprovante nao informado");
  }

  const userId = await resolveUserIdForReceipt({
    userId: params.userId,
    phoneNumber: params.phoneNumber,
  });

  if (!userId) {
    throw new Error("Nao achei a conta para vincular esse comprovante");
  }

  const subscription = await resolveSubscriptionForReceipt(userId);
  const providedPaymentId = String(params.paymentId || "").trim();
  const paymentId = providedPaymentId || `whatsapp_receipt_${userId}_${Date.now()}`;

  const parsedAmount = Number.parseFloat(String(params.amount || ""));
  const fallbackAmount = Number.parseFloat(String((subscription.plan as any)?.preco || 99.99));
  const amount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : fallbackAmount;

  let duplicatesQuery = supabase
    .from("payment_receipts")
    .select("id, receipt_url")
    .eq("subscription_id", subscription.id)
    .eq("status", "pending");

  if (providedPaymentId) {
    duplicatesQuery = duplicatesQuery.eq("mp_payment_id", providedPaymentId);
  }

  const { data: duplicateReceipts } = await duplicatesQuery;
  if (duplicateReceipts && duplicateReceipts.length > 0) {
    const pathsToRemove = duplicateReceipts
      .map((receipt: any) => {
        const url = String(receipt.receipt_url || "");
        if (url.startsWith("receipts/")) return url;
        const marker = "/payment-receipts/";
        const markerIndex = url.indexOf(marker);
        return markerIndex === -1 ? null : url.slice(markerIndex + marker.length);
      })
      .filter(Boolean) as string[];

    if (pathsToRemove.length > 0) {
      await supabase.storage.from("payment-receipts").remove(pathsToRemove);
    }

    await supabase
      .from("payment_receipts")
      .delete()
      .in("id", duplicateReceipts.map((receipt: any) => receipt.id));
  }

  await ensurePaymentReceiptBucket();

  const { buffer, mimeType, originalFileName } = await downloadReceiptBuffer({
    sourceUrl,
    mimeTypeHint: params.mimeTypeHint || undefined,
  });

  const safeOriginalName = originalFileName.replace(/[^\w.\-]+/g, "_");
  const fileName = `receipts/whatsapp/${userId}/${Date.now()}_${safeOriginalName}`;
  const { error: uploadError } = await supabase.storage
    .from("payment-receipts")
    .upload(fileName, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Erro ao fazer upload do comprovante: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(fileName);
  const receiptUrl = urlData?.publicUrl || fileName;

  const { data: receipt, error: insertError } = await supabase
    .from("payment_receipts")
    .insert({
      user_id: userId,
      subscription_id: subscription.id,
      plan_id: subscription.planId,
      amount,
      receipt_url: receiptUrl,
      receipt_filename: originalFileName,
      receipt_mime_type: mimeType,
      status: "pending",
      mp_payment_id: paymentId,
    })
    .select()
    .single();

  if (insertError || !receipt) {
    throw new Error(insertError?.message || "Erro ao salvar comprovante");
  }

  await supabase
    .from("subscriptions")
    .update({
      status: "pending_payment",
      pending_receipt: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription.id);

  return {
    receiptId: receipt.id,
    receiptUrl,
    subscriptionId: subscription.id,
    userId,
    amount,
  };
}

export async function approveVisualPaymentReceiptFromWhatsApp(params: {
  userId?: string;
  phoneNumber?: string;
  sourceUrl: string;
  subscriptionId: string;
  amountPaid: string | number;
  paymentDate: string;
  receiptStatus: string;
  receiverName: string;
  receiverInstitution: string;
  evidenceSummary?: string | null;
  paymentId?: string | null;
  mimeTypeHint?: string | null;
}): Promise<{
  receiptId: string;
  subscriptionId: string;
  userId: string;
  amountPaid: number;
  expectedAmount: number;
}> {
  const sourceUrl = String(params.sourceUrl || "").trim();
  if (!sourceUrl) throw new Error("Comprovante visual nao informado");

  const amountPaid = parseReceiptMoneyAmount(params.amountPaid);
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    throw new Error("Valor pago ausente ou invalido no comprovante visual");
  }

  const paymentDate = parseReceiptEvidenceDate(params.paymentDate);
  if (!paymentDate || !receiptDateIsAcceptable(paymentDate)) {
    throw new Error("Data do comprovante ausente, invalida ou fora da janela aceitavel");
  }

  if (!visualReceiptStatusLooksPaid(params.receiptStatus)) {
    throw new Error("Status visual do comprovante nao indica pagamento concluido");
  }
  validateVisualReceiptReceiver({
    receiverName: params.receiverName,
    receiverInstitution: params.receiverInstitution,
  });

  const resolvedUserId = await resolveUserIdForReceipt({
    userId: params.userId,
    phoneNumber: params.phoneNumber,
  });
  if (!resolvedUserId) {
    throw new Error("Nao achei a conta para vincular esse comprovante");
  }

  const subscription = await resolveSubscriptionForReceipt(resolvedUserId);
  const requestedSubscriptionId = String(params.subscriptionId || "").trim();
  if (!requestedSubscriptionId || requestedSubscriptionId !== String(subscription.id || "").trim()) {
    throw new Error("Assinatura do contrato Codex nao confere com a conta resolvida");
  }
  const expectedAmount = await resolveExpectedSubscriptionAmount(subscription);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    throw new Error("Valor esperado do plano indisponivel para aprovacao automatica");
  }
  const amountTolerance = Number(process.env.AGENTEZAP_VISUAL_RECEIPT_AMOUNT_TOLERANCE || "1");
  const minimumAmount = expectedAmount - Math.max(0, Number.isFinite(amountTolerance) ? amountTolerance : 1);
  const maximumAmount = expectedAmount + Math.max(0, Number.isFinite(amountTolerance) ? amountTolerance : 1);
  if (amountPaid < minimumAmount) {
    throw new Error("Valor do comprovante abaixo do valor esperado do plano");
  }
  if (amountPaid > maximumAmount) {
    throw new Error("Valor do comprovante acima do valor esperado do plano");
  }

  const receipt = await registerPaymentReceiptFromWhatsApp({
    userId: resolvedUserId,
    phoneNumber: params.phoneNumber,
    sourceUrl,
    amount: amountPaid,
    paymentId: params.paymentId || undefined,
    mimeTypeHint: params.mimeTypeHint || undefined,
  });

  const notes = buildVisualReceiptApprovalNotes({
    paymentDate,
    amountPaid,
    expectedAmount: Number.isFinite(expectedAmount) ? expectedAmount : amountPaid,
    evidenceSummary: params.evidenceSummary,
    receiptStatus: params.receiptStatus,
    receiverName: params.receiverName,
    receiverInstitution: params.receiverInstitution,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE payment_receipts
        SET status = 'approved',
            reviewed_by = 'codex_visual_receipt',
            reviewed_at = NOW(),
            admin_notes = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [receipt.receiptId, notes],
    );

    const activationResult = await client.query(
      `
        WITH receipt_context AS (
          SELECT
            pr.id AS receipt_id,
            pr.subscription_id,
            pr.user_id,
            pr.created_at,
            s.data_inicio,
            s.data_fim,
            s.next_payment_date,
            COALESCE(s.pending_receipt, false) AS pending_receipt,
            CASE
              WHEN LOWER(COALESCE(p.periodicidade, '')) = 'anual' THEN INTERVAL '1 year'
              WHEN LOWER(COALESCE(p.periodicidade, '')) = 'mensal' THEN INTERVAL '30 days'
              WHEN COALESCE(NULLIF(p.frequencia_dias, 0), 0) > 0 THEN COALESCE(NULLIF(p.frequencia_dias, 0), 30)::int * INTERVAL '1 day'
              ELSE INTERVAL '30 days'
            END AS cycle_interval,
            CASE
              WHEN COALESCE(s.pending_receipt, false) = true THEN NULL::timestamp
              WHEN s.next_payment_date IS NOT NULL AND s.data_fim IS NOT NULL THEN GREATEST(s.next_payment_date, s.data_fim)
              ELSE COALESCE(s.next_payment_date, s.data_fim)
            END AS current_due_at,
            (
              SELECT MAX(previous_due.due_at)
              FROM (
                SELECT
                  CASE
                    WHEN previous_s.next_payment_date IS NOT NULL AND previous_s.data_fim IS NOT NULL THEN GREATEST(previous_s.next_payment_date, previous_s.data_fim)
                    ELSE COALESCE(previous_s.next_payment_date, previous_s.data_fim)
                  END AS due_at
                FROM subscriptions previous_s
                WHERE previous_s.user_id = pr.user_id
                  AND previous_s.id <> s.id
                  AND COALESCE(previous_s.metadata->>'checkoutMode', '') <> 'addon_upsell'

                UNION ALL

                SELECT ph.due_date AS due_at
                FROM payment_history ph
                WHERE ph.user_id = pr.user_id
                  AND ph.status IN ('approved', 'paid')
                  AND ph.due_date IS NOT NULL
              ) previous_due
              WHERE previous_due.due_at IS NOT NULL
            ) AS previous_due_at
          FROM payment_receipts pr
          JOIN subscriptions s ON s.id = pr.subscription_id
          LEFT JOIN plans p ON p.id = COALESCE(pr.plan_id, s.plan_id)
          WHERE pr.id = $1
        ),
        activation_window AS (
          SELECT
            receipt_context.*,
            COALESCE(
              CASE
                WHEN previous_due_at IS NOT NULL AND current_due_at IS NOT NULL THEN GREATEST(previous_due_at, current_due_at)
                ELSE NULL::timestamp
              END,
              previous_due_at,
              current_due_at,
              created_at,
              NOW()
            ) AS cycle_anchor
          FROM receipt_context
        )
        UPDATE subscriptions s
        SET
          status = 'active',
          pending_receipt = false,
          data_inicio = aw.cycle_anchor,
          data_fim = aw.cycle_anchor + aw.cycle_interval,
          next_payment_date = aw.cycle_anchor + aw.cycle_interval,
          payment_method = COALESCE(s.payment_method, 'pix_manual'),
          updated_at = NOW()
        FROM activation_window aw
        WHERE s.id = aw.subscription_id
        RETURNING
          s.id,
          s.user_id AS "userId",
          s.data_inicio AS "dataInicio",
          s.data_fim AS "dataFim",
          s.next_payment_date AS "nextPaymentDate",
          s.payer_email AS "payerEmail"
      `,
      [receipt.receiptId],
    );
    const activated = activationResult.rows[0] || null;
    if (!activated?.id) {
      throw new Error("Assinatura nao foi ativada pelo comprovante visual");
    }

    await client.query(
      `
        INSERT INTO payment_history (
          subscription_id,
          user_id,
          mp_payment_id,
          amount,
          status,
          status_detail,
          payment_type,
          payment_method,
          payment_date,
          due_date,
          payer_email,
          raw_response,
          created_at,
          updated_at
        )
        SELECT
          pr.subscription_id,
          pr.user_id,
          COALESCE(pr.mp_payment_id, 'manual_receipt_' || pr.id),
          pr.amount,
          'approved',
          'manual_receipt_visual_approved',
          'pix_manual_receipt',
          'pix_manual',
          $2::timestamp,
          CASE
            WHEN s.next_payment_date IS NOT NULL AND s.data_fim IS NOT NULL THEN GREATEST(s.next_payment_date, s.data_fim)
            ELSE COALESCE(s.next_payment_date, s.data_fim)
          END,
          s.payer_email,
          jsonb_build_object(
            'receiptId', pr.id,
            'source', 'payment_receipts',
            'approvedBy', 'codex_visual_receipt',
            'visualEvidenceSummary', $3::text
          ),
          NOW(),
          NOW()
        FROM payment_receipts pr
        LEFT JOIN subscriptions s ON s.id = pr.subscription_id
        WHERE pr.id = $1
          AND pr.subscription_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM payment_history ph
            WHERE ph.subscription_id = pr.subscription_id
              AND (
                ph.mp_payment_id = COALESCE(pr.mp_payment_id, 'manual_receipt_' || pr.id)
                OR ph.mp_payment_id = 'manual_receipt_' || pr.id
              )
          )
      `,
      [receipt.receiptId, paymentDate.toISOString(), String(params.evidenceSummary || "").slice(0, 500)],
    );

    await client.query(
      `
        UPDATE payments pay
        SET status = 'paid',
            data_pagamento = COALESCE(pay.data_pagamento, $2::timestamp, NOW()),
            updated_at = NOW()
        FROM payment_receipts pr
        WHERE pr.id = $1
          AND pay.subscription_id = pr.subscription_id
          AND LOWER(COALESCE(pay.status, '')) IN ('pending', 'pending_pix', 'pending_payment')
      `,
      [receipt.receiptId, paymentDate.toISOString()],
    );

    const cleanupResult = await cleanupRodrigoPaidLeadFollowupInTransaction(client, {
      userId: receipt.userId,
      subscriptionId: receipt.subscriptionId,
      phoneNumber: params.phoneNumber,
    });
    console.log("[PaymentReceipt] Limpeza transacional de follow-up apos comprovante visual", {
      receiptId: receipt.receiptId,
      subscriptionId: receipt.subscriptionId,
      crmConversationsPaused: cleanupResult.crmConversationsPaused,
      adminConversationsPaused: cleanupResult.adminConversationsPaused,
      ownerNotificationsSkipped: cleanupResult.ownerNotificationsSkipped,
      pixRecoveryMessagesSkipped: cleanupResult.pixRecoveryMessagesSkipped,
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  return {
    receiptId: receipt.receiptId,
    subscriptionId: receipt.subscriptionId,
    userId: receipt.userId,
    amountPaid,
    expectedAmount: Number.isFinite(expectedAmount) ? expectedAmount : amountPaid,
  };
}
