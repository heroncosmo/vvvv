import assert from "node:assert/strict";
import {
  createPlanLinkSlug,
  preparePlanPayload,
  normalizePlanPayload,
} from "../planPayloadNormalizer";

const standardPlan = normalizePlanPayload({
  nome: " Plano Mensal ",
  valor: " 99.99 ",
  ctaTexto: " Assinar agora ",
  isPersonalizado: false,
  codigoPersonalizado: "   ",
  valorPrimeiraCobranca: "",
  linkSlug: "   ",
});

assert.equal(standardPlan.nome, "Plano Mensal");
assert.equal(standardPlan.valor, "99.99");
assert.equal(standardPlan.ctaTexto, "Assinar agora");
assert.equal(standardPlan.codigoPersonalizado, null);
assert.equal(standardPlan.valorPrimeiraCobranca, null);
assert.equal(standardPlan.linkSlug, null);

const customPlan = normalizePlanPayload({
  nome: "Plano VIP",
  valor: "49.99",
  isPersonalizado: true,
  codigoPersonalizado: " vip2026 ",
});

assert.equal(customPlan.codigoPersonalizado, "VIP2026");

const generatedPlan = preparePlanPayload(
  {
    nome: "Plano Teste 7 dias",
    valor: "49.99",
    isPersonalizado: false,
    codigoPersonalizado: " ",
    linkSlug: " ",
  },
  [
    {
      id: "existing",
      codigoPersonalizado: "PLANOTESTE-ABC123",
      linkSlug: "plano-teste-planoteste-abc123",
    },
  ],
);

assert.equal(typeof generatedPlan.codigoPersonalizado, "string");
assert.match(String(generatedPlan.codigoPersonalizado), /^PLANOTESTE-[A-F0-9]{6}$/);
assert.equal(typeof generatedPlan.linkSlug, "string");
assert.match(String(generatedPlan.linkSlug), /^plano-teste-7-dias-planoteste-[a-f0-9]{6}/);

const preservedPlan = preparePlanPayload(
  {
    nome: "Plano Editado",
    codigoPersonalizado: " ",
    linkSlug: " ",
  },
  [
    {
      id: "same-plan",
      codigoPersonalizado: "VIP2026",
      linkSlug: "plano-vip-vip2026",
    },
  ],
  {
    currentPlan: {
      id: "same-plan",
      nome: "Plano VIP",
      codigoPersonalizado: "VIP2026",
      linkSlug: "plano-vip-vip2026",
    },
  },
);

assert.equal(preservedPlan.codigoPersonalizado, "VIP2026");
assert.equal(preservedPlan.linkSlug, "plano-vip-vip2026");

assert.equal(createPlanLinkSlug("Plano Ágil Premium", "AGIL-123ABC"), "plano-agil-premium-agil-123abc");

console.log("planPayloadNormalizer.test.ts ok");
