import { invalidateEntitlementCache } from "./accessEntitlement";
import { calculateManualReceiptActivationWindow } from "./paymentReceiptPolicy";
import { processReferralCreditForApprovedSubscription } from "./referralService";
import { db } from "./db";
import { paymentReceipts, plans, subscriptions } from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { storage } from "./storage";

interface ApprovedManualReceiptCandidate {
  receiptId: string;
  userId: string;
  subscriptionId: string;
  planId: string;
  receiptAmount: string | number | null;
  receiptApprovedAt: Date | null;
  receiptMpPaymentId: string | null;
  subscriptionStatus: string | null;
  pendingReceipt: boolean;
  paymentMethod: string | null;
  dataInicio: Date | null;
  dataFim: Date | null;
  nextPaymentDate: Date | null;
  planPeriodicity: string | null;
  planFrequencyDays: string | number | null;
}

export interface ManualReceiptRepairOptions {
  dryRun?: boolean;
  userId?: string;
}

export interface ManualReceiptRepairSummary {
  scanned: number;
  eligible: number;
  repairedSubscriptions: number;
  paymentHistoryCreated: number;
  referralsCredited: number;
  skippedExpired: number;
  skippedAlreadyHealthy: number;
  skippedNoAmount: number;
  errors: Array<{ receiptId: string; subscriptionId: string; error: string }>;
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveActivationWindow(candidate: ApprovedManualReceiptCandidate, now: Date) {
  const approvedAt = toValidDate(candidate.receiptApprovedAt) || now;
  const fallback = calculateManualReceiptActivationWindow(
    {
      periodicidade: candidate.planPeriodicity,
      frequencia_dias: candidate.planFrequencyDays,
    },
    approvedAt,
  );

  return {
    dataInicio: toValidDate(candidate.dataInicio) || fallback.dataInicio,
    dataFim: toValidDate(candidate.dataFim) || fallback.dataFim,
    nextPaymentDate:
      toValidDate(candidate.nextPaymentDate) || toValidDate(candidate.dataFim) || fallback.nextPaymentDate,
  };
}

function shouldRepairSubscription(candidate: ApprovedManualReceiptCandidate, now: Date) {
  const activationWindow = resolveActivationWindow(candidate, now);
  if (activationWindow.nextPaymentDate.getTime() <= now.getTime()) {
    return { shouldRepair: false, reason: "expired" as const, activationWindow };
  }

  const status = String(candidate.subscriptionStatus || "").toLowerCase();
  const isHealthy =
    status === "active" &&
    !candidate.pendingReceipt &&
    Boolean(candidate.dataInicio) &&
    Boolean(candidate.dataFim) &&
    Boolean(candidate.nextPaymentDate);

  return {
    shouldRepair: !isHealthy,
    reason: isHealthy ? ("healthy" as const) : ("repair" as const),
    activationWindow,
  };
}

export async function repairApprovedManualReceipts(
  options: ManualReceiptRepairOptions = {},
): Promise<ManualReceiptRepairSummary> {
  const now = new Date();
  const dryRun = options.dryRun !== false;

  const rows = await db
    .select({
      receiptId: paymentReceipts.id,
      userId: paymentReceipts.userId,
      subscriptionId: paymentReceipts.subscriptionId,
      planId: subscriptions.planId,
      receiptAmount: paymentReceipts.amount,
      receiptApprovedAt: sql<Date>`coalesce(${paymentReceipts.reviewedAt}, ${paymentReceipts.updatedAt}, ${paymentReceipts.createdAt})`,
      receiptMpPaymentId: paymentReceipts.mpPaymentId,
      subscriptionStatus: subscriptions.status,
      pendingReceipt: subscriptions.pendingReceipt,
      paymentMethod: subscriptions.paymentMethod,
      dataInicio: subscriptions.dataInicio,
      dataFim: subscriptions.dataFim,
      nextPaymentDate: subscriptions.nextPaymentDate,
      planPeriodicity: plans.periodicidade,
      planFrequencyDays: plans.frequenciaDias,
    })
    .from(paymentReceipts)
    .innerJoin(subscriptions, eq(paymentReceipts.subscriptionId, subscriptions.id))
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(and(
      eq(paymentReceipts.status, "approved"),
      options.userId ? eq(paymentReceipts.userId, options.userId) : sql`true`,
    ))
    .orderBy(desc(paymentReceipts.reviewedAt), desc(paymentReceipts.createdAt));

  const summary: ManualReceiptRepairSummary = {
    scanned: rows.length,
    eligible: 0,
    repairedSubscriptions: 0,
    paymentHistoryCreated: 0,
    referralsCredited: 0,
    skippedExpired: 0,
    skippedAlreadyHealthy: 0,
    skippedNoAmount: 0,
    errors: [],
  };

  for (const row of rows as ApprovedManualReceiptCandidate[]) {
    try {
      const amount = Number.parseFloat(String(row.receiptAmount || ""));
      if (!Number.isFinite(amount) || amount <= 0) {
        summary.skippedNoAmount++;
        continue;
      }

      const decision = shouldRepairSubscription(row, now);
      if (decision.reason === "expired") {
        summary.skippedExpired++;
        continue;
      }

      summary.eligible++;

      if (!dryRun && decision.shouldRepair) {
        await storage.updateSubscription(row.subscriptionId, {
          status: "active",
          pendingReceipt: false,
          dataInicio: decision.activationWindow.dataInicio,
          dataFim: decision.activationWindow.dataFim,
          nextPaymentDate: decision.activationWindow.nextPaymentDate,
          paymentMethod: row.paymentMethod || "pix_manual",
        });
        invalidateEntitlementCache(row.userId);
        summary.repairedSubscriptions++;
      } else if (!decision.shouldRepair) {
        summary.skippedAlreadyHealthy++;
      }

      let paymentHistoryId: string | null = null;
      const existingHistory = row.receiptMpPaymentId
        ? await storage.getPaymentHistoryByMpPaymentId(row.receiptMpPaymentId)
        : undefined;

      if (existingHistory) {
        paymentHistoryId = existingHistory.id;
      } else if (!dryRun) {
        const paymentDate = toValidDate(row.receiptApprovedAt) || now;
        const createdHistory = await storage.createPaymentHistory({
          subscriptionId: row.subscriptionId,
          userId: row.userId,
          mpPaymentId: row.receiptMpPaymentId || `manual_receipt_${row.receiptId}`,
          amount: amount.toFixed(2),
          status: "approved",
          statusDetail: "manual_receipt_approved",
          paymentType: "pix_manual_receipt",
          paymentMethod: "pix_manual",
          paymentDate,
          dueDate: decision.activationWindow.nextPaymentDate,
          payerEmail: null,
          rawResponse: {
            source: "manual_receipt_repair",
            receiptId: row.receiptId,
          },
        });
        paymentHistoryId = createdHistory.id;
        summary.paymentHistoryCreated++;
      }

      if (!dryRun) {
        const referralResult = await processReferralCreditForApprovedSubscription({
          subscriptionId: row.subscriptionId,
          paymentHistoryId,
          amountPaid: amount,
          source: "manual_receipt_repair",
        });
        if (referralResult.credited) {
          summary.referralsCredited++;
        }
      }
    } catch (error: any) {
      summary.errors.push({
        receiptId: row.receiptId,
        subscriptionId: row.subscriptionId,
        error: error?.message || String(error),
      });
    }
  }

  return summary;
}
