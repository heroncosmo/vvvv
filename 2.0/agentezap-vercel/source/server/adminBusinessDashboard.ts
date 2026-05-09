import type {
  PaymentHistory,
  Plan,
  Subscription,
  User,
  WhatsappConnection,
} from "@shared/schema";

type SubscriptionRecord = Subscription & { plan: Plan; user: User };

type PaymentHistoryRecord = PaymentHistory & {
  subscription?: Subscription;
  user?: User;
};

type RenewalSample = {
  eligible: number;
  renewed: number;
};

export interface AdminBusinessDashboardReport {
  generatedAt: string;
  overview: {
    totalUsers: number;
    activeSubscribers: number;
    activeConnectedSubscribers: number;
    activeDisconnectedSubscribers: number;
    inactiveConnectedFormerSubscribers: number;
    availablePlans: number;
    pendingReceipts: number;
  };
  revenue: {
    lifetimeGross: number;
    lifetimeNet: number;
    currentMonthGross: number;
    currentMonthNet: number;
    previousMonthGross: number;
    previousMonthNet: number;
    averageMonthlyGrossLast6: number;
    averageMonthlyNetLast6: number;
    monthOverMonthGrowth: number | null;
    averageTicket: number;
  };
  forecast: {
    nextMonthBaseRevenue: number;
    nextMonthWeightedRevenue: number;
    nextMonthBaseSubscribers: number;
    nextMonthWeightedSubscribers: number;
    nextMonthConnectedBaseRevenue: number;
    nextMonthConnectedWeightedRevenue: number;
    nextMonthConnectedSubscribers: number;
    nextMonthDisconnectedBaseRevenue: number;
    nextMonthDisconnectedWeightedRevenue: number;
    nextMonthDisconnectedSubscribers: number;
    expiringThisMonthSubscribers: number;
    atRiskDisconnectedSubscribers: number;
  };
  renewal: {
    overallRate: number;
    connectedRate: number;
    disconnectedRate: number;
    connectedEligible: number;
    disconnectedEligible: number;
    connectedRenewed: number;
    disconnectedRenewed: number;
  };
  monthlySeries: Array<{
    monthKey: string;
    label: string;
    grossRevenue: number;
    netRevenue: number;
    approvedPayments: number;
    recurringPayments: number;
    newSubscribers: number;
  }>;
  upcomingRenewals: Array<{
    subscriptionId: string;
    userId: string;
    userName: string;
    userEmail: string | null;
    planName: string;
    amount: number;
    nextPaymentDate: string | null;
    isConnected: boolean;
    daysUntilCharge: number | null;
    renewalProbability: number;
  }>;
  planMix: Array<{
    planId: string;
    planName: string;
    activeSubscribers: number;
    connectedSubscribers: number;
    scheduledRevenueNextMonth: number;
  }>;
}

export interface BuildAdminBusinessDashboardReportInput {
  users: User[];
  connections: WhatsappConnection[];
  subscriptions: SubscriptionRecord[];
  paymentHistory: PaymentHistoryRecord[];
  pendingReceiptsCount: number;
  activePlansCount: number;
  now?: Date;
}

type ConnectionSummary = {
  isConnected: boolean;
};

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "2-digit",
});

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(value: Date, months: number): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth() + months,
    1,
    0,
    0,
    0,
    0,
  );
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function isWithinRange(
  value: Date | null,
  startInclusive: Date,
  endExclusive: Date,
): boolean {
  if (!value) return false;
  return value >= startInclusive && value < endExclusive;
}

function getCycleDays(subscription: SubscriptionRecord): number {
  const configuredFrequency = Number(subscription.plan?.frequenciaDias);
  if (Number.isFinite(configuredFrequency) && configuredFrequency > 0) {
    return configuredFrequency;
  }
  return subscription.plan?.periodicidade === "anual" ? 365 : 30;
}

function getRecurringAmount(subscription: SubscriptionRecord): number {
  const discounted = toNumber(subscription.couponPrice);
  if (discounted > 0) return discounted;
  return toNumber(subscription.plan?.valor);
}

function getChargeDate(subscription: SubscriptionRecord): Date | null {
  return (
    asDate(subscription.nextPaymentDate) ||
    asDate(subscription.dataFim) ||
    null
  );
}

function roundTo(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildConnectionSummary(
  users: User[],
  connections: WhatsappConnection[],
): Map<string, ConnectionSummary> {
  const summary = new Map<string, ConnectionSummary>();

  for (const user of users) {
    summary.set(user.id, { isConnected: false });
  }

  for (const connection of connections) {
    const current = summary.get(connection.userId) || { isConnected: false };
    current.isConnected = current.isConnected || Boolean(connection.isConnected);
    summary.set(connection.userId, current);
  }

  return summary;
}

function smoothRate(
  sample: RenewalSample,
  fallbackRate: number,
  priorWeight: number,
): number {
  if (sample.eligible <= 0) return fallbackRate;
  return (sample.renewed + fallbackRate * priorWeight) / (sample.eligible + priorWeight);
}

function buildRenewalSamples(
  subscriptions: SubscriptionRecord[],
  approvedPayments: PaymentHistoryRecord[],
  connectionSummary: Map<string, ConnectionSummary>,
  now: Date,
): {
  overall: RenewalSample;
  connected: RenewalSample;
  disconnected: RenewalSample;
} {
  const paymentsBySubscription = new Map<string, PaymentHistoryRecord[]>();

  for (const payment of approvedPayments) {
    const bucket = paymentsBySubscription.get(payment.subscriptionId) || [];
    bucket.push(payment);
    paymentsBySubscription.set(payment.subscriptionId, bucket);
  }

  const overall: RenewalSample = { eligible: 0, renewed: 0 };
  const connected: RenewalSample = { eligible: 0, renewed: 0 };
  const disconnected: RenewalSample = { eligible: 0, renewed: 0 };

  for (const subscription of subscriptions) {
    if (subscription.user?.role === "admin" || subscription.user?.role === "owner") {
      continue;
    }

    const approvedForSubscription = (paymentsBySubscription.get(subscription.id) || [])
      .map((payment) => ({
        ...payment,
        effectiveDate: asDate(payment.paymentDate) || asDate(payment.createdAt),
      }))
      .filter((payment) => payment.effectiveDate)
      .sort(
        (left, right) =>
          left.effectiveDate!.getTime() - right.effectiveDate!.getTime(),
      );

    if (approvedForSubscription.length === 0) continue;

    const firstChargeDate = approvedForSubscription[0].effectiveDate!;
    const cycleDays = getCycleDays(subscription);
    if (firstChargeDate > addDays(now, -cycleDays)) continue;

    const renewalThreshold = addDays(firstChargeDate, Math.max(7, cycleDays - 5));
    const renewed = approvedForSubscription.some(
      (payment, index) =>
        index > 0 && payment.effectiveDate! >= renewalThreshold,
    );

    overall.eligible += 1;
    overall.renewed += renewed ? 1 : 0;

    const target = connectionSummary.get(subscription.userId)?.isConnected
      ? connected
      : disconnected;

    target.eligible += 1;
    target.renewed += renewed ? 1 : 0;
  }

  return { overall, connected, disconnected };
}

export function buildAdminBusinessDashboardReport({
  users,
  connections,
  subscriptions,
  paymentHistory,
  pendingReceiptsCount,
  activePlansCount,
  now = new Date(),
}: BuildAdminBusinessDashboardReportInput): AdminBusinessDashboardReport {
  const monthStart = startOfMonth(now);
  const previousMonthStart = addMonths(monthStart, -1);
  const nextMonthStart = addMonths(monthStart, 1);
  const monthAfterNextStart = addMonths(monthStart, 2);
  const sixMonthStart = addMonths(monthStart, -5);
  const connectionSummary = buildConnectionSummary(users, connections);

  const approvedPayments = paymentHistory.filter(
    (payment) => payment.status === "approved",
  );

  const activeSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.status === "active" &&
      subscription.user?.role !== "admin" &&
      subscription.user?.role !== "owner",
  );

  const latestSubscriptionByUser = new Map<string, SubscriptionRecord>();
  for (const subscription of subscriptions) {
    const existing = latestSubscriptionByUser.get(subscription.userId);
    const currentDate =
      asDate(subscription.updatedAt) ||
      asDate(subscription.createdAt) ||
      asDate(subscription.dataFim) ||
      new Date(0);
    const existingDate =
      asDate(existing?.updatedAt) ||
      asDate(existing?.createdAt) ||
      asDate(existing?.dataFim) ||
      new Date(0);

    if (!existing || currentDate >= existingDate) {
      latestSubscriptionByUser.set(subscription.userId, subscription);
    }
  }

  const inactiveConnectedFormerSubscribers = Array.from(
    latestSubscriptionByUser.values(),
  ).filter((subscription) => {
    const isFormer =
      subscription.status === "cancelled" || subscription.status === "expired";
    return isFormer && Boolean(connectionSummary.get(subscription.userId)?.isConnected);
  }).length;

  const currentMonthPayments = approvedPayments.filter((payment) =>
    isWithinRange(
      asDate(payment.paymentDate) || asDate(payment.createdAt),
      monthStart,
      nextMonthStart,
    ),
  );

  const previousMonthPayments = approvedPayments.filter((payment) =>
    isWithinRange(
      asDate(payment.paymentDate) || asDate(payment.createdAt),
      previousMonthStart,
      monthStart,
    ),
  );

  const lifetimeGross = approvedPayments.reduce(
    (sum, payment) => sum + toNumber(payment.amount),
    0,
  );
  const lifetimeNet = approvedPayments.reduce(
    (sum, payment) => sum + (toNumber(payment.netAmount) || toNumber(payment.amount)),
    0,
  );
  const currentMonthGross = currentMonthPayments.reduce(
    (sum, payment) => sum + toNumber(payment.amount),
    0,
  );
  const currentMonthNet = currentMonthPayments.reduce(
    (sum, payment) => sum + (toNumber(payment.netAmount) || toNumber(payment.amount)),
    0,
  );
  const previousMonthGross = previousMonthPayments.reduce(
    (sum, payment) => sum + toNumber(payment.amount),
    0,
  );
  const previousMonthNet = previousMonthPayments.reduce(
    (sum, payment) => sum + (toNumber(payment.netAmount) || toNumber(payment.amount)),
    0,
  );

  const monthlySeries = Array.from({ length: 6 }, (_, index) => {
    const month = addMonths(sixMonthStart, index);
    const monthEnd = addMonths(month, 1);
    const paymentsForMonth = approvedPayments.filter((payment) =>
      isWithinRange(
        asDate(payment.paymentDate) || asDate(payment.createdAt),
        month,
        monthEnd,
      ),
    );
    const subscriptionsForMonth = subscriptions.filter((subscription) =>
      isWithinRange(asDate(subscription.createdAt), month, monthEnd),
    );

    return {
      monthKey: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
      label: MONTH_LABEL_FORMATTER.format(month).replace(".", ""),
      grossRevenue: roundTo(
        paymentsForMonth.reduce((sum, payment) => sum + toNumber(payment.amount), 0),
      ),
      netRevenue: roundTo(
        paymentsForMonth.reduce(
          (sum, payment) =>
            sum + (toNumber(payment.netAmount) || toNumber(payment.amount)),
          0,
        ),
      ),
      approvedPayments: paymentsForMonth.length,
      recurringPayments: paymentsForMonth.filter(
        (payment) => payment.paymentType === "recurring",
      ).length,
      newSubscribers: subscriptionsForMonth.length,
    };
  });

  const sixMonthGross = monthlySeries.reduce(
    (sum, point) => sum + point.grossRevenue,
    0,
  );
  const sixMonthNet = monthlySeries.reduce(
    (sum, point) => sum + point.netRevenue,
    0,
  );

  const renewalSamples = buildRenewalSamples(
    subscriptions,
    approvedPayments,
    connectionSummary,
    now,
  );

  const rawOverallRate =
    renewalSamples.overall.eligible > 0
      ? renewalSamples.overall.renewed / renewalSamples.overall.eligible
      : 0.68;
  const connectedFallback = Math.min(0.95, Math.max(rawOverallRate + 0.08, 0.72));
  const disconnectedFallback = Math.max(0.25, Math.min(rawOverallRate - 0.12, 0.58));

  const overallRate = smoothRate(renewalSamples.overall, 0.68, 2);
  const connectedRate = smoothRate(renewalSamples.connected, connectedFallback, 2);
  const disconnectedRate = smoothRate(
    renewalSamples.disconnected,
    disconnectedFallback,
    2,
  );

  const nextMonthSubscriptions = activeSubscriptions
    .map((subscription) => ({
      subscription,
      chargeDate: getChargeDate(subscription),
      isConnected: Boolean(connectionSummary.get(subscription.userId)?.isConnected),
      amount: getRecurringAmount(subscription),
    }))
    .filter(({ chargeDate }) => isWithinRange(chargeDate, nextMonthStart, monthAfterNextStart))
    .sort((left, right) => left.chargeDate!.getTime() - right.chargeDate!.getTime());

  const expiringThisMonthSubscribers = activeSubscriptions.filter((subscription) =>
    isWithinRange(getChargeDate(subscription), monthStart, nextMonthStart),
  ).length;

  const nextMonthBaseRevenue = nextMonthSubscriptions.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const nextMonthConnectedBaseRevenue = nextMonthSubscriptions
    .filter((item) => item.isConnected)
    .reduce((sum, item) => sum + item.amount, 0);
  const nextMonthDisconnectedBaseRevenue = nextMonthSubscriptions
    .filter((item) => !item.isConnected)
    .reduce((sum, item) => sum + item.amount, 0);

  const nextMonthWeightedRevenue = nextMonthSubscriptions.reduce((sum, item) => {
    const probability = item.isConnected ? connectedRate : disconnectedRate;
    return sum + item.amount * probability;
  }, 0);

  const nextMonthConnectedWeightedRevenue = nextMonthSubscriptions
    .filter((item) => item.isConnected)
    .reduce((sum, item) => sum + item.amount * connectedRate, 0);

  const nextMonthDisconnectedWeightedRevenue = nextMonthSubscriptions
    .filter((item) => !item.isConnected)
    .reduce((sum, item) => sum + item.amount * disconnectedRate, 0);

  const activeConnectedSubscribers = activeSubscriptions.filter((subscription) =>
    Boolean(connectionSummary.get(subscription.userId)?.isConnected),
  ).length;

  const activeDisconnectedSubscribers =
    activeSubscriptions.length - activeConnectedSubscribers;

  const atRiskDisconnectedSubscribers = nextMonthSubscriptions.filter(
    (item) => !item.isConnected,
  ).length;

  const planMixMap = new Map<
    string,
    {
      planId: string;
      planName: string;
      activeSubscribers: number;
      connectedSubscribers: number;
      scheduledRevenueNextMonth: number;
    }
  >();

  for (const subscription of activeSubscriptions) {
    const existing = planMixMap.get(subscription.planId) || {
      planId: subscription.planId,
      planName: subscription.plan?.nome || "Plano",
      activeSubscribers: 0,
      connectedSubscribers: 0,
      scheduledRevenueNextMonth: 0,
    };

    existing.activeSubscribers += 1;
    if (connectionSummary.get(subscription.userId)?.isConnected) {
      existing.connectedSubscribers += 1;
    }

    if (
      isWithinRange(
        getChargeDate(subscription),
        nextMonthStart,
        monthAfterNextStart,
      )
    ) {
      existing.scheduledRevenueNextMonth += getRecurringAmount(subscription);
    }

    planMixMap.set(subscription.planId, existing);
  }

  const upcomingRenewals = nextMonthSubscriptions.slice(0, 8).map((item) => ({
    subscriptionId: item.subscription.id,
    userId: item.subscription.userId,
    userName: item.subscription.user?.name || "Cliente",
    userEmail: item.subscription.user?.email || null,
    planName: item.subscription.plan?.nome || "Plano",
    amount: roundTo(item.amount),
    nextPaymentDate: item.chargeDate?.toISOString() || null,
    isConnected: item.isConnected,
    daysUntilCharge: item.chargeDate
      ? Math.max(
          0,
          Math.ceil(
            (item.chargeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
      : null,
    renewalProbability: roundTo(
      item.isConnected ? connectedRate : disconnectedRate,
      4,
    ),
  }));

  return {
    generatedAt: now.toISOString(),
    overview: {
      totalUsers: users.filter(
        (user) => user.role !== "admin" && user.role !== "owner",
      ).length,
      activeSubscribers: activeSubscriptions.length,
      activeConnectedSubscribers,
      activeDisconnectedSubscribers,
      inactiveConnectedFormerSubscribers,
      availablePlans: activePlansCount,
      pendingReceipts: pendingReceiptsCount,
    },
    revenue: {
      lifetimeGross: roundTo(lifetimeGross),
      lifetimeNet: roundTo(lifetimeNet),
      currentMonthGross: roundTo(currentMonthGross),
      currentMonthNet: roundTo(currentMonthNet),
      previousMonthGross: roundTo(previousMonthGross),
      previousMonthNet: roundTo(previousMonthNet),
      averageMonthlyGrossLast6: roundTo(sixMonthGross / monthlySeries.length),
      averageMonthlyNetLast6: roundTo(sixMonthNet / monthlySeries.length),
      monthOverMonthGrowth:
        previousMonthGross > 0
          ? roundTo(((currentMonthGross - previousMonthGross) / previousMonthGross) * 100, 2)
          : currentMonthGross > 0
            ? 100
            : null,
      averageTicket:
        approvedPayments.length > 0
          ? roundTo(lifetimeGross / approvedPayments.length)
          : 0,
    },
    forecast: {
      nextMonthBaseRevenue: roundTo(nextMonthBaseRevenue),
      nextMonthWeightedRevenue: roundTo(nextMonthWeightedRevenue),
      nextMonthBaseSubscribers: nextMonthSubscriptions.length,
      nextMonthWeightedSubscribers: roundTo(
        nextMonthSubscriptions.reduce(
          (sum, item) => sum + (item.isConnected ? connectedRate : disconnectedRate),
          0,
        ),
        2,
      ),
      nextMonthConnectedBaseRevenue: roundTo(nextMonthConnectedBaseRevenue),
      nextMonthConnectedWeightedRevenue: roundTo(nextMonthConnectedWeightedRevenue),
      nextMonthConnectedSubscribers: nextMonthSubscriptions.filter(
        (item) => item.isConnected,
      ).length,
      nextMonthDisconnectedBaseRevenue: roundTo(nextMonthDisconnectedBaseRevenue),
      nextMonthDisconnectedWeightedRevenue: roundTo(
        nextMonthDisconnectedWeightedRevenue,
      ),
      nextMonthDisconnectedSubscribers: nextMonthSubscriptions.filter(
        (item) => !item.isConnected,
      ).length,
      expiringThisMonthSubscribers,
      atRiskDisconnectedSubscribers,
    },
    renewal: {
      overallRate: roundTo(overallRate * 100, 2),
      connectedRate: roundTo(connectedRate * 100, 2),
      disconnectedRate: roundTo(disconnectedRate * 100, 2),
      connectedEligible: renewalSamples.connected.eligible,
      disconnectedEligible: renewalSamples.disconnected.eligible,
      connectedRenewed: renewalSamples.connected.renewed,
      disconnectedRenewed: renewalSamples.disconnected.renewed,
    },
    monthlySeries,
    upcomingRenewals,
    planMix: Array.from(planMixMap.values())
      .map((item) => ({
        ...item,
        scheduledRevenueNextMonth: roundTo(item.scheduledRevenueNextMonth),
      }))
      .sort((left, right) => right.activeSubscribers - left.activeSubscribers),
  };
}
