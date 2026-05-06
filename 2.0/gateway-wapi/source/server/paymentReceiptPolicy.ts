export interface ManualReceiptPlanLike {
  periodicidade?: string | null;
  frequencia_dias?: string | number | null;
}

export interface ManualReceiptActivationWindow {
  dataInicio: Date;
  dataFim: Date;
  nextPaymentDate: Date;
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
