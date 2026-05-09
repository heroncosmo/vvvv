import { calculateManualReceiptActivationWindow } from "./paymentReceiptPolicy";

export interface SubscriptionSelectionCandidate {
  id: string;
  status?: string | null;
  createdAt?: string | Date | null;
  dataInicio?: string | Date | null;
  dataFim?: string | Date | null;
  nextPaymentDate?: string | Date | null;
  pendingReceipt?: boolean | null;
  approvedReceiptAt?: string | Date | null;
  planPeriodicity?: string | null;
  planFrequencyDays?: string | number | null;
}

export interface ApprovedReceiptActivationWindow {
  dataInicio: Date;
  dataFim: Date;
  nextPaymentDate: Date;
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveCoverageEnd(candidate: SubscriptionSelectionCandidate): Date | null {
  return toValidDate(candidate.nextPaymentDate) || toValidDate(candidate.dataFim);
}

export function resolveApprovedReceiptActivationWindow(
  candidate: SubscriptionSelectionCandidate,
  now: Date = new Date(),
): ApprovedReceiptActivationWindow {
  const approvedReceiptAt = toValidDate(candidate.approvedReceiptAt) || now;
  const fallbackWindow = calculateManualReceiptActivationWindow(
    {
      periodicidade: candidate.planPeriodicity,
      frequencia_dias: candidate.planFrequencyDays,
    },
    approvedReceiptAt,
  );

  const dataInicio = toValidDate(candidate.dataInicio) || fallbackWindow.dataInicio;
  const dataFim = toValidDate(candidate.dataFim) || fallbackWindow.dataFim;
  const nextPaymentDate =
    toValidDate(candidate.nextPaymentDate) || toValidDate(candidate.dataFim) || fallbackWindow.nextPaymentDate;

  return {
    dataInicio,
    dataFim,
    nextPaymentDate,
  };
}

export function shouldAutoActivateSubscriptionFromApprovedReceipt(
  candidate: SubscriptionSelectionCandidate,
  now: Date = new Date(),
): boolean {
  const status = String(candidate.status || "").toLowerCase();
  if (!candidate.approvedReceiptAt) return false;
  if (status === "active" || status === "cancelled" || status === "canceled") {
    return false;
  }

  const activationWindow = resolveApprovedReceiptActivationWindow(candidate, now);
  return activationWindow.nextPaymentDate.getTime() > now.getTime();
}

function buildPriority(candidate: SubscriptionSelectionCandidate, now: Date): number {
  const status = String(candidate.status || "").toLowerCase();
  const coverageEnd = resolveCoverageEnd(candidate);
  const hasFutureCoverage = Boolean(coverageEnd && coverageEnd.getTime() > now.getTime());

  if (status === "active") return 600;
  if (shouldAutoActivateSubscriptionFromApprovedReceipt(candidate, now)) return 550;
  if (status === "pending_payment" && candidate.pendingReceipt) return 500;
  if (status === "pending_pix" && hasFutureCoverage) return 450;
  if ((status === "pending" || status === "overdue") && hasFutureCoverage) return 400;
  if (hasFutureCoverage) return 350;
  if (status === "pending_pix") return 300;
  if (status === "pending_payment") return 250;
  if (status === "pending") return 200;
  return 0;
}

export function pickPreferredSubscriptionCandidate<T extends SubscriptionSelectionCandidate>(
  candidates: T[],
  now: Date = new Date(),
): T | undefined {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return undefined;
  }

  const ranked = [...candidates].sort((left, right) => {
    const priorityDiff = buildPriority(right, now) - buildPriority(left, now);
    if (priorityDiff !== 0) return priorityDiff;

    const coverageDiff =
      (resolveCoverageEnd(right)?.getTime() || 0) - (resolveCoverageEnd(left)?.getTime() || 0);
    if (coverageDiff !== 0) return coverageDiff;

    const approvedDiff =
      (toValidDate(right.approvedReceiptAt)?.getTime() || 0) -
      (toValidDate(left.approvedReceiptAt)?.getTime() || 0);
    if (approvedDiff !== 0) return approvedDiff;

    return (toValidDate(right.createdAt)?.getTime() || 0) - (toValidDate(left.createdAt)?.getTime() || 0);
  });

  return ranked[0];
}
