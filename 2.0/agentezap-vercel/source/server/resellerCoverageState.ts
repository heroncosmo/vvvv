type ResellerClientLike = {
  status?: string | null;
  isFreeClient?: boolean | null;
  saasPaidUntil?: string | Date | null;
  nextPaymentDate?: string | Date | null;
};

type SubscriptionLike = {
  status?: string | null;
  dataFim?: string | Date | null;
  nextPaymentDate?: string | Date | null;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "suspended",
  "overdue",
  "pending",
  "pending_pix",
]);

function toValidDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveResellerCoverageEnd({
  resellerClient,
  subscription,
}: {
  resellerClient?: ResellerClientLike | null;
  subscription?: SubscriptionLike | null;
}): Date | null {
  if (!resellerClient) return null;

  const candidates: Date[] = [];
  const clientPaidUntil = toValidDate(resellerClient.saasPaidUntil);
  const clientNextPayment = toValidDate(resellerClient.nextPaymentDate);

  if (clientPaidUntil) candidates.push(clientPaidUntil);
  if (clientNextPayment) candidates.push(clientNextPayment);

  if (subscription && ACTIVE_SUBSCRIPTION_STATUSES.has(String(subscription.status || "").toLowerCase())) {
    const subscriptionEnd = toValidDate(subscription.dataFim);
    const subscriptionNextPayment = toValidDate(subscription.nextPaymentDate);

    if (subscriptionEnd) candidates.push(subscriptionEnd);
    if (subscriptionNextPayment) candidates.push(subscriptionNextPayment);
  }

  if (candidates.length === 0) return null;

  return new Date(Math.max(...candidates.map((candidate) => candidate.getTime())));
}

export function resolveResellerNeedsPayment({
  resellerClient,
  subscription,
  now = new Date(),
}: {
  resellerClient?: ResellerClientLike | null;
  subscription?: SubscriptionLike | null;
  now?: Date;
}): boolean {
  if (!resellerClient || resellerClient.isFreeClient) {
    return false;
  }

  const status = String(resellerClient.status || "active").toLowerCase();
  if (status === "cancelled" || status === "blocked" || status === "suspended") {
    return true;
  }

  const coverageEnd = resolveResellerCoverageEnd({ resellerClient, subscription });
  if (!coverageEnd) {
    return status !== "active";
  }

  return coverageEnd.getTime() <= now.getTime();
}
