import assert from "node:assert/strict";
import {
  ADMIN_PLAN_PROMO_URL,
  ADMIN_PLAN_STANDARD_URL,
  buildAdminPlanReplyText,
  detectAdminPlanFocusFromText,
  getAdminPlanSummary,
  isAdminPlanRequest,
  isDescribingOwnSalesFlow,
} from "../adminPlanPricing";

const promoMonthlyReply = buildAdminPlanReplyText({
  focus: "monthly",
  promo49: true,
  link: ADMIN_PLAN_PROMO_URL,
});
assert.match(promoMonthlyReply, /R\$49/i);
assert.match(promoMonthlyReply, /plano-promo-ilimitado-mensal/i);
assert.doesNotMatch(promoMonthlyReply, /R\$99/i);

const standardMonthlyReply = buildAdminPlanReplyText({
  focus: "monthly",
  promo49: false,
  link: ADMIN_PLAN_STANDARD_URL,
});
assert.match(standardMonthlyReply, /R\$99/i);
assert.match(standardMonthlyReply, /agentezap\.online/i);
assert.doesNotMatch(standardMonthlyReply, /plano-promo-ilimitado-mensal/i);

const annualReply = buildAdminPlanReplyText({
  focus: "annual",
  promo49: false,
  link: ADMIN_PLAN_STANDARD_URL,
});
assert.match(annualReply, /R\$599/i);
assert.equal(getAdminPlanSummary("monthly", true).includes("R$49"), true);
assert.equal(getAdminPlanSummary("monthly", false).includes("R$99"), true);

assert.equal(detectAdminPlanFocusFromText("qual o valor mensal"), "monthly");
assert.equal(detectAdminPlanFocusFromText("e no anual?"), "annual");
assert.equal(detectAdminPlanFocusFromText("qual o mensal e anual"), "both");
assert.equal(isAdminPlanRequest("qual o valor mensal"), true);
assert.equal(
  isDescribingOwnSalesFlow("Hoje esse e o meu funil, primeiro eu mando um audio, depois video, depoimentos, fotos do produto e no final pergunto se quer receber o valor."),
  true,
);
assert.equal(
  isAdminPlanRequest("Hoje esse e o meu funil, primeiro eu mando um audio, depois video, depoimentos, fotos do produto e no final pergunto se quer receber o valor."),
  false,
);

console.log("adminPlanPricing.test.ts ok");
