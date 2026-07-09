export const PUBLIC_BASE_PLAN_ID = "f6c55498-7b22-4ac2-9703-bf2bdd0cc431";
export const PUBLIC_CONFIGURED_PLAN_ID = "2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f";
export const PUBLIC_PRO_PLAN_ID = "c7a0cbe2-c7b8-4f18-b6d2-aad40d95bb65";
export const PUBLIC_LIMITED_100K_PLAN_ID = "b93843cd-5261-43ff-b522-7366b3e95509";
export const PUBLIC_PRO_PLAN_OFFER_AMOUNT = 300;
export const PUBLIC_LIMITED_100K_PLAN_AMOUNT = 49.99;
export const PUBLIC_MAIN_PLUS_PLAN_AMOUNT = 99.99;
export const PUBLIC_LIMITED_100K_PLAN_QUERY_PARAM = "plano49";
export const PUBLIC_LIMITED_100K_PLAN_API_PARAM = "includeLimited100kPlan";
export const PUBLIC_LIMITED_100K_PLAN_STORAGE_KEY = "agentezap:limited-100k-plan-unlocked";

export const PUBLIC_VISIBLE_PLAN_IDS = new Set([
  PUBLIC_CONFIGURED_PLAN_ID,
]);

export const PUBLIC_LIMITED_OFFER_PLAN_IDS = new Set([
  PUBLIC_LIMITED_100K_PLAN_ID,
]);

export type PublicPlanLike = {
  id: string;
  valor?: string | number | null;
};

export type PublicCheckoutRenewalPricingLike = {
  source?: string | null;
  monthlyPrice?: number | null;
  lockedRenewalPrice?: boolean | null;
};

export function getPublicPlanBaseOfferAmount(planId: string): number {
  if (planId === PUBLIC_LIMITED_100K_PLAN_ID) return PUBLIC_LIMITED_100K_PLAN_AMOUNT;
  if (planId === PUBLIC_BASE_PLAN_ID) return PUBLIC_MAIN_PLUS_PLAN_AMOUNT;
  if (planId === PUBLIC_CONFIGURED_PLAN_ID) return PUBLIC_MAIN_PLUS_PLAN_AMOUNT;
  if (planId === PUBLIC_PRO_PLAN_ID) return PUBLIC_PRO_PLAN_OFFER_AMOUNT;
  return 0;
}

function getReferralPlanOfferAmount(planId: string): number {
  if (planId === PUBLIC_LIMITED_100K_PLAN_ID) return PUBLIC_LIMITED_100K_PLAN_AMOUNT;
  if (planId === PUBLIC_BASE_PLAN_ID) return PUBLIC_MAIN_PLUS_PLAN_AMOUNT;
  if (planId === PUBLIC_CONFIGURED_PLAN_ID) return PUBLIC_MAIN_PLUS_PLAN_AMOUNT;
  if (planId === PUBLIC_PRO_PLAN_ID) return PUBLIC_PRO_PLAN_OFFER_AMOUNT;
  return 0;
}

export function getPublicPlanRecurringAmount(plan: PublicPlanLike): number {
  const planValue = Number(plan.valor || 0);
  if (Number.isFinite(planValue) && planValue > 0) {
    return planValue;
  }

  if (plan.id === PUBLIC_LIMITED_100K_PLAN_ID) return PUBLIC_LIMITED_100K_PLAN_AMOUNT;
  if (plan.id === PUBLIC_BASE_PLAN_ID) return PUBLIC_MAIN_PLUS_PLAN_AMOUNT;
  if (plan.id === PUBLIC_CONFIGURED_PLAN_ID) return PUBLIC_MAIN_PLUS_PLAN_AMOUNT;
  if (plan.id === PUBLIC_PRO_PLAN_ID) return 499.99;
  return 0;
}

export function getPublicPlanDisplayPriority(planId: string): number {
  if (planId === PUBLIC_CONFIGURED_PLAN_ID) return 10;
  if (planId === PUBLIC_LIMITED_100K_PLAN_ID) return 20;
  if (planId === PUBLIC_BASE_PLAN_ID) return 30;
  if (planId === PUBLIC_PRO_PLAN_ID) return 40;
  return 100;
}

export function canShowPublicPlanForLockedRenewal(plan: PublicPlanLike, lockedRenewalPrice: number): boolean {
  if (!Number.isFinite(lockedRenewalPrice) || lockedRenewalPrice <= 0) {
    return true;
  }

  return getPublicPlanRecurringAmount(plan) >= lockedRenewalPrice;
}

export function shouldUseHistoricalCheckoutPresentation(
  plan: PublicPlanLike,
  pricing?: PublicCheckoutRenewalPricingLike | null,
): boolean {
  const lockedPrice = Number(pricing?.monthlyPrice || 0);
  return Boolean(
    pricing?.lockedRenewalPrice &&
    lockedPrice > getPublicPlanBaseOfferAmount(plan.id) &&
    (
      !canShowPublicPlanForLockedRenewal(plan, lockedPrice) ||
      (plan.id === PUBLIC_CONFIGURED_PLAN_ID && lockedPrice > getPublicPlanBaseOfferAmount(PUBLIC_CONFIGURED_PLAN_ID))
    ),
  );
}

export function getCheckoutOfferAmountForPlan(
  plan: PublicPlanLike,
  pricing?: PublicCheckoutRenewalPricingLike | null,
): number {
  const referralAmount = pricing?.source === "referral_first_subscription"
    ? getReferralPlanOfferAmount(plan.id)
    : 0;
  const publicAmount = referralAmount > 0 ? referralAmount : getPublicPlanBaseOfferAmount(plan.id);

  if (shouldUseHistoricalCheckoutPresentation(plan, pricing)) {
    return Number(pricing?.monthlyPrice || 0);
  }

  return publicAmount;
}
