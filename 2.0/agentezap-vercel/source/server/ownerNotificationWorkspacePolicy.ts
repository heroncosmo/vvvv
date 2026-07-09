export const OWNER_RODRIGO_PROACTIVE_MIN_INBOUND_MESSAGES = 5;
export const OWNER_RODRIGO_GLOBAL_ENGAGEMENT_RETRY_MINUTES = 10;
export const OWNER_RODRIGO_PROACTIVE_BATCH_SIZE = 5;
export const OWNER_RODRIGO_PROACTIVE_BATCH_COOLDOWN_MINUTES = 10;
export const OWNER_RODRIGO_CHECKIN_RECENT_COVERAGE_DAYS = 30;

export type RodrigoCheckinEligibilityInput = {
  subscription_status?: string | null;
  has_subscription_history?: boolean | null;
  next_payment_date?: string | Date | null;
  data_fim?: string | Date | null;
};

function parsePolicyDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function latestPolicyDate(...values: Array<string | Date | null | undefined>): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    const date = parsePolicyDate(value);
    if (date && (!latest || date.getTime() > latest.getTime())) {
      latest = date;
    }
  }
  return latest;
}

export function isRodrigoOwnerCheckinRecipientEligible(
  user: RodrigoCheckinEligibilityInput,
  now = new Date(),
): boolean {
  if (!Boolean(user.has_subscription_history)) {
    return false;
  }

  const dueDate = latestPolicyDate(user.next_payment_date, user.data_fim);
  if (String(user.subscription_status || "") === "active") {
    return !dueDate || dueDate.getTime() >= now.getTime();
  }

  if (!dueDate) {
    return false;
  }

  const recentCoverageStart = now.getTime() - OWNER_RODRIGO_CHECKIN_RECENT_COVERAGE_DAYS * 24 * 60 * 60 * 1000;
  return dueDate.getTime() >= recentCoverageStart;
}

export type OwnerGlobalProactiveEngagementInput = {
  inboundMessagesSinceWatermark: number;
  consumedInboundMessages: number;
  requiredInboundMessages?: number;
  nextSendAllowedAt?: string | Date | null;
  now?: string | Date | null;
};

export type OwnerGlobalProactiveEngagementDecision = {
  allowed: boolean;
  blockedReason: "inbound" | "cooldown" | null;
  inboundMessagesSinceWatermark: number;
  consumedInboundMessages: number;
  availableInboundMessages: number;
  requiredInboundMessages: number;
  remainingInboundMessages: number;
  nextSendAllowedAt: Date | null;
};

export function resolveOwnerGlobalProactiveEngagementDecision(
  input: OwnerGlobalProactiveEngagementInput,
): OwnerGlobalProactiveEngagementDecision {
  const inboundCount = Math.max(0, Math.floor(Number(input.inboundMessagesSinceWatermark) || 0));
  const consumedCount = Math.max(0, Math.floor(Number(input.consumedInboundMessages) || 0));
  const availableCount = Math.max(0, inboundCount - consumedCount);
  const nextSendAllowedAt = parsePolicyDate(input.nextSendAllowedAt);
  const now = parsePolicyDate(input.now) || new Date();
  const requiredCount = Math.max(
    1,
    Math.floor(Number(input.requiredInboundMessages ?? OWNER_RODRIGO_PROACTIVE_MIN_INBOUND_MESSAGES) || 1),
  );
  const coolingDown = Boolean(nextSendAllowedAt && nextSendAllowedAt.getTime() > now.getTime());
  const hasInboundCredit = availableCount >= requiredCount;

  return {
    allowed: hasInboundCredit && !coolingDown,
    blockedReason: hasInboundCredit ? (coolingDown ? "cooldown" : null) : "inbound",
    inboundMessagesSinceWatermark: inboundCount,
    consumedInboundMessages: consumedCount,
    availableInboundMessages: availableCount,
    requiredInboundMessages: requiredCount,
    remainingInboundMessages: Math.max(0, requiredCount - availableCount),
    nextSendAllowedAt,
  };
}
