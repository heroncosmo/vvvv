import assert from "node:assert/strict";
import {
  PUBLIC_BASE_PLAN_ID,
  PUBLIC_CONFIGURED_PLAN_ID,
  PUBLIC_LIMITED_100K_PLAN_AMOUNT,
  PUBLIC_LIMITED_100K_PLAN_ID,
  PUBLIC_MAIN_PLUS_PLAN_AMOUNT,
  PUBLIC_PRO_PLAN_OFFER_AMOUNT,
  PUBLIC_PRO_PLAN_ID,
  canShowPublicPlanForLockedRenewal,
  getPublicPlanBaseOfferAmount,
  getPublicPlanDisplayPriority,
  getCheckoutOfferAmountForPlan,
  shouldUseHistoricalCheckoutPresentation,
} from "./public-plan-pricing";

const lockedPricing = {
  source: "highest_paid_amount",
  monthlyPrice: 249.98,
  lockedRenewalPrice: true,
};

const basePlan = { id: PUBLIC_BASE_PLAN_ID, valor: "199.99" };
const configuredPlan = { id: PUBLIC_CONFIGURED_PLAN_ID, valor: "299.99" };
const limited100kPlan = { id: PUBLIC_LIMITED_100K_PLAN_ID, valor: "49.99" };
const proPlan = { id: PUBLIC_PRO_PLAN_ID, valor: "499.99" };

assert.equal(canShowPublicPlanForLockedRenewal(basePlan, lockedPricing.monthlyPrice), false);
assert.equal(canShowPublicPlanForLockedRenewal(configuredPlan, lockedPricing.monthlyPrice), true);
assert.equal(canShowPublicPlanForLockedRenewal(proPlan, lockedPricing.monthlyPrice), true);

assert.equal(getCheckoutOfferAmountForPlan(configuredPlan, lockedPricing), 249.98);
assert.equal(getCheckoutOfferAmountForPlan(proPlan, lockedPricing), PUBLIC_PRO_PLAN_OFFER_AMOUNT);
assert.equal(getCheckoutOfferAmountForPlan(limited100kPlan, null), PUBLIC_LIMITED_100K_PLAN_AMOUNT);
assert.equal(getCheckoutOfferAmountForPlan(limited100kPlan, {
  source: "highest_paid_amount",
  monthlyPrice: PUBLIC_LIMITED_100K_PLAN_AMOUNT,
  lockedRenewalPrice: true,
}), PUBLIC_LIMITED_100K_PLAN_AMOUNT);
assert.equal(getPublicPlanBaseOfferAmount(PUBLIC_BASE_PLAN_ID), PUBLIC_MAIN_PLUS_PLAN_AMOUNT);
assert.equal(getPublicPlanBaseOfferAmount(PUBLIC_CONFIGURED_PLAN_ID), PUBLIC_MAIN_PLUS_PLAN_AMOUNT);
assert.equal(getPublicPlanBaseOfferAmount(PUBLIC_LIMITED_100K_PLAN_ID), PUBLIC_LIMITED_100K_PLAN_AMOUNT);
assert.equal(getPublicPlanBaseOfferAmount(PUBLIC_PRO_PLAN_ID), PUBLIC_PRO_PLAN_OFFER_AMOUNT);
assert.equal(getPublicPlanDisplayPriority(PUBLIC_CONFIGURED_PLAN_ID) < getPublicPlanDisplayPriority(PUBLIC_LIMITED_100K_PLAN_ID), true);

assert.equal(shouldUseHistoricalCheckoutPresentation(basePlan, lockedPricing), true);
assert.equal(shouldUseHistoricalCheckoutPresentation(configuredPlan, lockedPricing), true);

console.log("public-plan-pricing ok");
