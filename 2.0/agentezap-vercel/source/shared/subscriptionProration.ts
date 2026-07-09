type NullableMoney = string | number | null | undefined;

export type SubscriptionProrationLike = {
  status?: unknown;
  dataFim?: unknown;
  data_fim?: unknown;
  nextPaymentDate?: unknown;
  next_payment_date?: unknown;
  couponPrice?: NullableMoney;
  coupon_price?: NullableMoney;
  metadata?: Record<string, unknown> | null;
  plan?: Record<string, unknown> | null;
};

export type UpgradeProrationQuote = {
  applied: boolean;
  targetAmount: number;
  payableAmount: number;
  creditAmount: number;
  currentPaidAmount: number;
  remainingDays: number;
  periodDays: number;
  currentPeriodEnd: string | null;
};

const DEFAULT_PRORATION_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function toMoney(value: NullableMoney): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const normalized = value.trim().replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function getMetadata(subscription: SubscriptionProrationLike | null | undefined): Record<string, unknown> {
  const metadata = subscription?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

export function getSubscriptionProrationPaidAmount(
  subscription: SubscriptionProrationLike | null | undefined,
): number {
  if (!subscription) {
    return 0;
  }

  const metadata = getMetadata(subscription);
  const candidates: NullableMoney[] = [
    metadata.checkoutRecurringAmount as NullableMoney,
    metadata.checkout_recurring_amount as NullableMoney,
    metadata.checkoutAmountAfterCoupon as NullableMoney,
    metadata.checkout_amount_after_coupon as NullableMoney,
    metadata.checkoutAmount as NullableMoney,
    metadata.checkout_amount as NullableMoney,
    subscription.couponPrice,
    subscription.coupon_price,
    subscription.plan?.valor as NullableMoney,
    subscription.plan?.price as NullableMoney,
  ];

  for (const candidate of candidates) {
    const amount = toMoney(candidate);
    if (amount > 0) {
      return roundCurrency(amount);
    }
  }

  return 0;
}

export function getUpgradeProrationQuote(
  currentSubscription: SubscriptionProrationLike | null | undefined,
  targetAmountInput: NullableMoney,
  nowInput: Date | string | number = new Date(),
): UpgradeProrationQuote | null {
  const targetAmount = roundCurrency(toMoney(targetAmountInput));
  if (!currentSubscription || targetAmount <= 0) {
    return null;
  }

  const status = String(currentSubscription.status || "").trim().toLowerCase();
  if (status !== "active") {
    return null;
  }

  const currentPaidAmount = getSubscriptionProrationPaidAmount(currentSubscription);
  if (currentPaidAmount <= 0 || targetAmount <= currentPaidAmount + 0.009) {
    return null;
  }

  const endDateRaw = currentSubscription.nextPaymentDate ?? currentSubscription.next_payment_date ?? currentSubscription.dataFim ?? currentSubscription.data_fim;
  const endTime = new Date(String(endDateRaw || "")).getTime();
  const nowTime = new Date(nowInput).getTime();
  if (!Number.isFinite(endTime) || !Number.isFinite(nowTime) || endTime <= nowTime) {
    return null;
  }

  const periodDays = DEFAULT_PRORATION_PERIOD_DAYS;
  const remainingDays = Math.min(periodDays, Math.max(0, (endTime - nowTime) / DAY_MS));
  const creditAmount = roundCurrency(Math.min(targetAmount, (currentPaidAmount / periodDays) * remainingDays));
  if (creditAmount <= 0) {
    return null;
  }

  return {
    applied: true,
    targetAmount,
    payableAmount: roundCurrency(Math.max(0.01, targetAmount - creditAmount)),
    creditAmount,
    currentPaidAmount,
    remainingDays: Math.round(remainingDays * 100) / 100,
    periodDays,
    currentPeriodEnd: new Date(endTime).toISOString(),
  };
}
