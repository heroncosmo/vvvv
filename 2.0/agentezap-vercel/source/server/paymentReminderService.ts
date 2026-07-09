import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { paymentReminders, resellerClients, resellers, users } from "@shared/schema";
import { storage } from "./storage";
import { shouldBlockAutomatedConversationSend } from "./conversationAutoPauseGuard";
import { sendMessage as whatsappSendMessage } from "./whatsapp";

const CHECK_INTERVAL_MS = 60 * 1000;
const RUN_HOUR_BRT = 9;
const BEFORE_OFFSETS = [7, 3, 1];
const AFTER_OFFSETS = [1, 3, 7, 14];

type ReminderKind = "before_due" | "after_due";

interface ReminderCandidate {
  resellerId: string;
  resellerUserId: string;
  resellerName: string;
  resellerCompanyName: string | null;
  resellerPixKey: string | null;
  resellerPixKeyType: string | null;
  resellerPixHolderName: string | null;
  resellerPixBankName: string | null;
  clientId: string;
  clientUserId: string;
  clientName: string;
  clientPhone: string | null;
  clientPrice: string | null;
  monthlyCost: string | null;
  clientStatus: string;
  isFreeClient: boolean;
  billingDay: number | null;
  nextPaymentDate: Date | null;
  saasPaidUntil: Date | null;
}

interface SendResult {
  success: boolean;
  message?: string;
  aiUsed?: boolean;
  aiPrompt?: string;
  error?: string;
}

type PaymentReminderRecord = typeof paymentReminders.$inferSelect;

function getBrazilNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function startOfBrazilDay(date: Date): Date {
  const br = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return new Date(br.getFullYear(), br.getMonth(), br.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatBrazilDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function normalizeBillingDay(day?: number | null): number {
  const safe = day ?? 1;
  return Math.min(Math.max(safe, 1), 28);
}

function resolveDueDate(candidate: ReminderCandidate, today: Date): Date | null {
  if (candidate.nextPaymentDate) {
    return new Date(candidate.nextPaymentDate);
  }
  if (candidate.saasPaidUntil) {
    return new Date(candidate.saasPaidUntil);
  }

  const billingDay = normalizeBillingDay(candidate.billingDay);
  const dueThisMonth = new Date(today.getFullYear(), today.getMonth(), billingDay);
  if (dueThisMonth >= today) {
    return dueThisMonth;
  }
  return new Date(today.getFullYear(), today.getMonth() + 1, billingDay);
}

function diffInDays(dueDate: Date, today: Date): number {
  const due = startOfBrazilDay(dueDate).getTime();
  const now = startOfBrazilDay(today).getTime();
  return Math.round((due - now) / (1000 * 60 * 60 * 24));
}

function formatCurrency(rawAmount: string | null): string | null {
  if (!rawAmount) return null;
  const value = Number(rawAmount);
  if (Number.isNaN(value)) return null;
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildReminderKey(candidate: ReminderCandidate, dueDate: Date, kind: ReminderKind, offset: number): string {
  const dueKey = startOfBrazilDay(dueDate).toISOString().split("T")[0];
  return `${candidate.clientId}:${kind}:${offset}:${dueKey}`;
}

async function hasActivePlatformSubscription(userId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1
    FROM subscriptions
    WHERE user_id = ${userId}
      AND status = 'active'
    LIMIT 1
  `);
  return (result.rows || []).length > 0;
}

function buildTemplate(candidate: ReminderCandidate, dueDate: Date, kind: ReminderKind, offset: number, amountText: string | null): string {
  const dueDateText = formatBrazilDate(dueDate);
  const amountLine = amountText ? `Valor: R$ ${amountText}.` : "Valor pendente.";
  const pixLine = candidate.resellerPixKey
    ? `Chave PIX: ${candidate.resellerPixKey}${candidate.resellerPixKeyType ? ` (${candidate.resellerPixKeyType})` : ""}.`
    : "";

  if (kind === "before_due") {
    return `Oi ${candidate.clientName}! Tudo bem? Passando para lembrar que sua mensalidade vence em ${offset} dia(s) (${dueDateText}). ${amountLine} ${pixLine}Se ja tiver pago, desconsidere. Posso ajudar?`;
  }

  return `Oi ${candidate.clientName}! Notamos que sua mensalidade venceu em ${dueDateText} (${offset} dia(s) de atraso). ${amountLine} ${pixLine}Se ja tiver regularizado, desconsidere. Posso ajudar?`;
}

function buildAIPrompt(candidate: ReminderCandidate, dueDate: Date, kind: ReminderKind, offset: number, amountText: string | null, history: string): { systemPrompt: string; userPrompt: string } {
  const dueDateText = formatBrazilDate(dueDate);
  const companyName = candidate.resellerCompanyName || candidate.resellerName || "AgenteZap";
  const amountLine = amountText ? `Valor: R$ ${amountText}` : "Valor: nao informado";
  const kindLabel = kind === "before_due" ? "lembrete antes do vencimento" : "lembrete de atraso";

  const systemPrompt = `Voce e um especialista em retencao de clientes. Escreva mensagens curtas, humanas e empaticas.
Evite soar como cobranca agressiva. Seja direto e amigavel. Mantenha 1 a 3 frases.
Inclua data, valor e deixe claro que se o cliente ja pagou pode desconsiderar.
Se houver chave PIX, pode mencionar de forma natural.`;

  const userPrompt = `Contexto:
- Empresa: ${companyName}
- Cliente: ${candidate.clientName}
- Telefone: ${candidate.clientPhone || "nao informado"}
- Tipo: ${kindLabel}
- Dias: ${offset}
- Vencimento: ${dueDateText}
- ${amountLine}
- Chave PIX: ${candidate.resellerPixKey || "nao informada"}
- Titular PIX: ${candidate.resellerPixHolderName || "nao informado"}
- Banco PIX: ${candidate.resellerPixBankName || "nao informado"}

Historico recente (se houver):
${history || "Sem historico recente."}

Escreva a mensagem final para enviar ao cliente.`;

  return { systemPrompt, userPrompt };
}

async function generatePaymentReminderWithCodex(params: {
  candidate: ReminderCandidate;
  dueDate: Date;
  kind: ReminderKind;
  offset: number;
  amountText: string | null;
  historyText: string;
  referenceTemplate: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string | null> {
  const { runWebOnlyCodexPromptTextForUser } = await import("../api/http");
  const text = await runWebOnlyCodexPromptTextForUser({
    userId: params.candidate.resellerUserId,
    task: "payment_reminder_message",
    messages: [
      {
        role: "system",
        content: [
          params.systemPrompt,
          "A mensagem publica deve vir apenas do Codex. Se faltar contexto, retorne vazio/no_send; nao gere texto fora do Codex.",
        ].join("\n\n"),
      },
      {
        role: "user",
        content: [
          params.userPrompt,
          "Template local apenas como referencia/auditoria, nao como texto obrigatorio:",
          params.referenceTemplate,
        ].join("\n\n"),
      },
    ],
    message: params.userPrompt,
    contactName: params.candidate.clientName,
    maxTokens: 220,
    timeoutMs: 90_000,
    contextArtifacts: {
      source: "paymentReminderService",
      messageKind: "payment_reminder",
      publicMessageAuthor: "codex_cli",
      candidate: params.candidate,
      dueDate: params.dueDate.toISOString(),
      kind: params.kind,
      offset: params.offset,
      amountText: params.amountText,
      historyText: params.historyText,
      referenceTemplate: params.referenceTemplate,
    },
  });
  const trimmed = String(text || "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class PaymentReminderService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;
  private lastRunDate: string | null = null;

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[PAYMENT REMINDER] Service started");

    this.timer = setInterval(() => this.tick(), CHECK_INTERVAL_MS);
    setTimeout(() => this.tick(), 30 * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  async runCycleOnce(_options?: { force?: boolean }): Promise<{ accepted: boolean; skipped?: string }> {
    if (this.isProcessing) {
      return { accepted: false, skipped: "busy" };
    }
    this.isProcessing = true;
    try {
      await this.processDailyReminders();
      return { accepted: true };
    } finally {
      this.isProcessing = false;
    }
  }

  private shouldRunToday(now: Date): boolean {
    const nowBrt = getBrazilNow();
    const todayKey = nowBrt.toISOString().split("T")[0];
    if (this.lastRunDate === todayKey) return false;
    if (nowBrt.getHours() < RUN_HOUR_BRT) return false;
    this.lastRunDate = todayKey;
    return true;
  }

  private async tick(): Promise<void> {
    if (this.isProcessing) return;
    if (!this.shouldRunToday(new Date())) return;
    this.isProcessing = true;
    try {
      await this.processDailyReminders();
    } catch (error) {
      console.error("[PAYMENT REMINDER] Error processing daily reminders:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processDailyReminders(): Promise<void> {
    const todayBrt = startOfBrazilDay(getBrazilNow());
    const maxBefore = Math.max(...BEFORE_OFFSETS);
    const maxAfter = Math.max(...AFTER_OFFSETS);

    const minDate = addDays(todayBrt, -maxAfter);
    const maxDate = addDays(todayBrt, maxBefore);

    const existing = await db
      .select({
        id: paymentReminders.id,
        resellerClientId: paymentReminders.resellerClientId,
        reminderType: paymentReminders.reminderType,
        daysOffset: paymentReminders.daysOffset,
        dueDate: paymentReminders.dueDate,
      })
      .from(paymentReminders)
      .where(and(gte(paymentReminders.dueDate, minDate), lte(paymentReminders.dueDate, maxDate)));

    const existingKeys = new Set(
      existing.map((row) => {
        if (!row.resellerClientId || !row.dueDate || row.daysOffset === null) return "";
        const dueKey = startOfBrazilDay(new Date(row.dueDate)).toISOString().split("T")[0];
        return `${row.resellerClientId}:${row.reminderType}:${row.daysOffset}:${dueKey}`;
      })
    );

    const candidates = await db
      .select({
        resellerId: resellers.id,
        resellerUserId: resellers.userId,
        resellerName: users.name,
        resellerCompanyName: resellers.companyName,
        resellerPixKey: resellers.pixKey,
        resellerPixKeyType: resellers.pixKeyType,
        resellerPixHolderName: resellers.pixHolderName,
        resellerPixBankName: resellers.pixBankName,
        clientId: resellerClients.id,
        clientUserId: resellerClients.userId,
        clientName: users.name,
        clientPhone: users.phone,
        clientPrice: resellerClients.clientPrice,
        monthlyCost: resellerClients.monthlyCost,
        clientStatus: resellerClients.status,
        isFreeClient: resellerClients.isFreeClient,
        billingDay: resellerClients.billingDay,
        nextPaymentDate: resellerClients.nextPaymentDate,
        saasPaidUntil: resellerClients.saasPaidUntil,
      })
      .from(resellerClients)
      .innerJoin(resellers, eq(resellerClients.resellerId, resellers.id))
      .innerJoin(users, eq(resellerClients.userId, users.id))
      .where(
        and(
          eq(resellers.isActive, true),
          eq(resellers.resellerStatus, "active"),
          eq(resellerClients.isFreeClient, false),
          eq(resellerClients.status, "active")
        )
      );

    for (const candidate of candidates) {
      if (!candidate.clientPhone) continue;
      if (await hasActivePlatformSubscription(candidate.clientUserId)) continue;
      const dueDate = resolveDueDate(candidate as ReminderCandidate, todayBrt);
      if (!dueDate) continue;

      const daysUntil = diffInDays(dueDate, todayBrt);
      const reminderPlans: Array<{ kind: ReminderKind; offset: number }> = [];

      if (daysUntil >= 0 && BEFORE_OFFSETS.includes(daysUntil)) {
        reminderPlans.push({ kind: "before_due", offset: daysUntil });
      }

      const daysOverdue = Math.abs(daysUntil);
      if (daysUntil < 0 && AFTER_OFFSETS.includes(daysOverdue)) {
        reminderPlans.push({ kind: "after_due", offset: daysOverdue });
      }

      for (const plan of reminderPlans) {
        const key = buildReminderKey(candidate as ReminderCandidate, dueDate, plan.kind, plan.offset);
        if (!key || existingKeys.has(key)) continue;
        existingKeys.add(key);
        await this.sendReminder(candidate as ReminderCandidate, dueDate, plan.kind, plan.offset);
      }
    }
  }

  private async sendReminder(candidate: ReminderCandidate, dueDate: Date, kind: ReminderKind, offset: number): Promise<void> {
    const amount = candidate.clientPrice || candidate.monthlyCost || null;
    const formattedAmount = formatCurrency(amount);
    const template = buildTemplate(candidate, dueDate, kind, offset, formattedAmount);

    const reminder = await this.reserveReminderSend(candidate, dueDate, kind, offset, amount, template);

    if (!reminder) return;

    const sendResult = await this.deliverMessage(candidate, template, dueDate, kind, offset, formattedAmount);

    if (sendResult.success) {
      await db
        .update(paymentReminders)
        .set({
          status: "sent",
          messageFinal: sendResult.message,
          aiPrompt: sendResult.aiPrompt,
          aiUsed: sendResult.aiUsed ?? false,
          sentAt: new Date(),
          updatedAt: new Date(),
          errorMessage: null,
        })
        .where(eq(paymentReminders.id, reminder.id));
    } else {
      await db
        .update(paymentReminders)
        .set({
          status: "failed",
          messageFinal: sendResult.message,
          aiPrompt: sendResult.aiPrompt,
          aiUsed: sendResult.aiUsed ?? false,
          updatedAt: new Date(),
          errorMessage: sendResult.error || "Failed to send",
        })
        .where(eq(paymentReminders.id, reminder.id));
    }
  }

  private async deliverMessage(
    candidate: ReminderCandidate,
    template: string,
    dueDate: Date,
    kind: ReminderKind,
    offset: number,
    formattedAmount: string | null
  ): Promise<SendResult> {
    const connection = await storage.getConnectionByUserId(candidate.resellerUserId);
    if (!connection) {
      return { success: false, error: "WhatsApp connection not found" };
    }

    let conversation = await storage.getConversationByContactNumber(connection.id, candidate.clientPhone || "");
    if (!conversation) {
      conversation = await storage.createConversation({
        connectionId: connection.id,
        contactNumber: candidate.clientPhone || "",
        contactName: candidate.clientName,
        lastMessageText: null,
        lastMessageTime: null,
        lastMessageFromMe: true,
      });
    }

    let historyText = "";
    if (conversation) {
      const history = await storage.getMessagesByConversationId(conversation.id);
      const recent = history.slice(-8);
      historyText = recent
        .map((msg) => `${msg.fromMe ? "Atendente" : "Cliente"}: ${msg.text || "[midia]"}`)
        .join("\n");
    }

    const { systemPrompt, userPrompt } = buildAIPrompt(candidate, dueDate, kind, offset, formattedAmount, historyText);

    let finalMessage = "";
    let aiUsed = false;
    try {
      const codexMessage = await generatePaymentReminderWithCodex({
        candidate,
        dueDate,
        kind,
        offset,
        amountText: formattedAmount,
        historyText,
        referenceTemplate: template,
        systemPrompt,
        userPrompt,
      });
      finalMessage = codexMessage || "";
      aiUsed = Boolean(finalMessage);
    } catch (error) {
      return {
        success: false,
        message: "",
        aiUsed: false,
        aiPrompt: systemPrompt,
        error: error instanceof Error ? error.message : "Codex payment reminder generation failed",
      };
    }

    if (!finalMessage) {
      return {
        success: false,
        message: "",
        aiUsed: false,
        aiPrompt: systemPrompt,
        error: "Codex returned empty payment reminder",
      };
    }

    const jid = conversation?.remoteJid || `${candidate.clientPhone}@s.whatsapp.net`;

    try {
      const recheck = await shouldBlockAutomatedConversationSend({
        userId: candidate.resellerUserId,
        jid,
        conversationId: conversation.id,
        origin: "notification",
      });
      if (recheck.blocked) {
        throw new Error("AUTOMATION_PAUSE_BLOCKED");
      }

      const sentResult = await whatsappSendMessage(
        candidate.resellerUserId,
        conversation.id,
        finalMessage,
        { source: "system" },
      );

      if (!sentResult.success) {
        return {
          success: false,
          message: finalMessage,
          aiUsed,
          aiPrompt: systemPrompt,
          error: sentResult.reason || "Send failed",
        };
      }

      return { success: true, message: finalMessage, aiUsed, aiPrompt: systemPrompt };
    } catch (error: any) {
      return { success: false, message: finalMessage, aiUsed, aiPrompt: systemPrompt, error: error?.message || "Send failed" };
    }
  }

  private async reserveReminderSend(
    candidate: ReminderCandidate,
    dueDate: Date,
    kind: ReminderKind,
    offset: number,
    amount: string | null,
    template: string
  ): Promise<PaymentReminderRecord | null> {
    const reminderKey = buildReminderKey(candidate, dueDate, kind, offset);
    const dueDayStart = startOfBrazilDay(dueDate);
    const dueDayEnd = addDays(dueDayStart, 1);

    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${reminderKey}, 0)) AS acquired
      `);
      const acquired = Boolean((lockResult as any)?.rows?.[0]?.acquired);

      if (!acquired) {
        console.log(`[PAYMENT REMINDER] Duplicate reminder in progress, skipping ${reminderKey}`);
        return null;
      }

      const [existingReminder] = await tx
        .select({ id: paymentReminders.id })
        .from(paymentReminders)
        .where(
          and(
            eq(paymentReminders.resellerClientId, candidate.clientId),
            eq(paymentReminders.reminderType, kind),
            eq(paymentReminders.daysOffset, offset),
            gte(paymentReminders.dueDate, dueDayStart),
            lt(paymentReminders.dueDate, dueDayEnd)
          )
        )
        .limit(1);

      if (existingReminder) {
        return null;
      }

      const [reminder] = await tx
        .insert(paymentReminders)
        .values({
          resellerId: candidate.resellerId,
          resellerClientId: candidate.clientId,
          userId: candidate.resellerUserId,
          scheduledFor: new Date(),
          dueDate,
          amount: amount ?? undefined,
          status: "pending",
          reminderType: kind,
          daysOffset: offset,
          messageTemplate: template,
          aiUsed: true,
          metadata: {
            daysOffset: offset,
            dueDate: dueDate.toISOString(),
            kind,
            reminderKey,
          },
        })
        .returning();

      return reminder ?? null;
    });
  }
}

export const paymentReminderService = new PaymentReminderService();
