export interface ManualReceiptPlanLike {
  periodicidade?: string | null;
  frequencia_dias?: string | number | null;
}

export type ManualReceiptDateLike = string | Date | null | undefined;

export interface ManualReceiptActivationWindow {
  dataInicio: Date;
  dataFim: Date;
  nextPaymentDate: Date;
}

export interface ManualReceiptCycleAnchorInput {
  currentDataFim?: ManualReceiptDateLike;
  currentNextPaymentDate?: ManualReceiptDateLike;
  previousDataFim?: ManualReceiptDateLike;
  previousNextPaymentDate?: ManualReceiptDateLike;
  receiptCreatedAt?: ManualReceiptDateLike;
  reviewedAt?: ManualReceiptDateLike;
  now?: ManualReceiptDateLike;
}

function toValidManualReceiptDate(value: ManualReceiptDateLike): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveManualReceiptCoverageDate(
  ...values: ManualReceiptDateLike[]
): Date | null {
  let latest: Date | null = null;

  for (const value of values) {
    const parsed = toValidManualReceiptDate(value);
    if (!parsed) continue;
    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed;
    }
  }

  return latest ? new Date(latest) : null;
}

export function resolveManualReceiptCycleAnchor(input: ManualReceiptCycleAnchorInput): Date {
  const coverageDate = resolveManualReceiptCoverageDate(
    input.currentDataFim,
    input.currentNextPaymentDate,
    input.previousDataFim,
    input.previousNextPaymentDate,
  );
  if (coverageDate) return coverageDate;

  return (
    toValidManualReceiptDate(input.receiptCreatedAt) ||
    toValidManualReceiptDate(input.reviewedAt) ||
    toValidManualReceiptDate(input.now) ||
    new Date()
  );
}

export function calculateManualReceiptActivationWindow(
  plan: ManualReceiptPlanLike | null | undefined,
  now: Date = new Date(),
): ManualReceiptActivationWindow {
  const dataInicio = new Date(now);
  const dataFim = new Date(now);
  const periodicidade = String(plan?.periodicidade || "").toLowerCase();
  const frequenciaDias = Number.parseInt(String(plan?.frequencia_dias ?? ""), 10);

  if (periodicidade === "anual") {
    dataFim.setFullYear(dataFim.getFullYear() + 1);
  } else if (periodicidade === "mensal") {
    dataFim.setDate(dataFim.getDate() + 30);
  } else if (Number.isFinite(frequenciaDias) && frequenciaDias > 0) {
    dataFim.setDate(dataFim.getDate() + frequenciaDias);
  } else {
    dataFim.setDate(dataFim.getDate() + 30);
  }

  return {
    dataInicio,
    dataFim,
    nextPaymentDate: new Date(dataFim),
  };
}

export interface ManualReceiptReversalDecision {
  receiptStatus: "rejected" | "cancelled";
  message: string;
}

export function canReverseManualReceipt(currentStatus: string): boolean {
  return currentStatus === "pending" || currentStatus === "approved";
}

export function resolveManualReceiptReversal(currentStatus: string): ManualReceiptReversalDecision {
  if (currentStatus === "pending") {
    return {
      receiptStatus: "rejected",
      message: "Comprovante recusado e plano cancelado",
    };
  }

  if (currentStatus === "approved") {
    return {
      receiptStatus: "cancelled",
      message: "Ativação cancelada e plano cancelado",
    };
  }

  throw new Error(`Unsupported manual receipt status: ${currentStatus}`);
}
