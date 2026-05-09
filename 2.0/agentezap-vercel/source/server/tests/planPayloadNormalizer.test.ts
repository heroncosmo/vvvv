import assert from "node:assert/strict";
import {
  PlanPayloadValidationError,
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

assert.throws(
  () =>
    normalizePlanPayload({
      nome: "Plano sem código",
      valor: "49.99",
      isPersonalizado: true,
      codigoPersonalizado: " ",
    }),
  (error) =>
    error instanceof PlanPayloadValidationError &&
    error.message === "Código personalizado é obrigatório para planos personalizados",
);

console.log("planPayloadNormalizer.test.ts ok");
