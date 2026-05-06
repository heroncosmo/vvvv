export interface SaaSSubscriptionAccessInput {
  status?: string | null;
  dataFim?: string | Date | null;
  nextPaymentDate?: string | Date | null;
  now?: Date;
}

export interface SaaSSubscriptionAccessResult {
  hasActiveSubscription: boolean;
  isExpired: boolean;
  reason: "active" | "inactive_status" | "expired_by_data_fim" | "expired_by_next_payment";
  daysOverdue: number;
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function evaluateSaaSSubscriptionAccess(
  input: SaaSSubscriptionAccessInput,
): SaaSSubscriptionAccessResult {
  const now = input.now ?? new Date();
  if (input.status !== "active") {
    return {
      hasActiveSubscription: false,
      isExpired: false,
      reason: "inactive_status",
      daysOverdue: 0,
    };
  }

  const dataFim = toValidDate(input.dataFim);
  if (dataFim) {
    const expired = dataFim < now;
    return {
      hasActiveSubscription: !expired,
      isExpired: expired,
      reason: expired ? "expired_by_data_fim" : "active",
      daysOverdue: expired ? Math.max(0, Math.floor((now.getTime() - dataFim.getTime()) / (1000 * 60 * 60 * 24))) : 0,
    };
  }

  const nextPaymentDate = toValidDate(input.nextPaymentDate);
  if (nextPaymentDate) {
    const daysOverdue = Math.floor((now.getTime() - nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
    const expired = daysOverdue > 5;
    return {
      hasActiveSubscription: !expired,
      isExpired: expired,
      reason: expired ? "expired_by_next_payment" : "active",
      daysOverdue: Math.max(0, daysOverdue),
    };
  }

  return {
    hasActiveSubscription: true,
    isExpired: false,
    reason: "active",
    daysOverdue: 0,
  };
}
