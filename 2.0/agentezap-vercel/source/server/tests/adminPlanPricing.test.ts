import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  containsLegacyAdminPlanPricing,
  detectAdminPlanFocusFromText,
  isAdminPlanRequest,
  isDescribingOwnSalesFlow,
} from "../adminPlanPricing";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pricingSource = readFileSync(resolve(__dirname, "../adminPlanPricing.ts"), "utf8");

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
assert.equal(containsLegacyAdminPlanPricing("Oferta antiga R$49 com plano-promo-ilimitado-mensal"), true);
assert.equal(containsLegacyAdminPlanPricing("Plus atual R$99,90"), false);

assert.doesNotMatch(
  pricingSource,
  /buildAdminPlanReplyText|getAdminPlanSummary|getAdminPlanPromptRules|Crie ou acesse sua conta|PLANOS E PRECOS|Se fizer sentido/i,
  "adminPlanPricing deve manter apenas detectores/dados neutros, sem builder local de fala publica",
);

console.log("adminPlanPricing.test.ts ok");
