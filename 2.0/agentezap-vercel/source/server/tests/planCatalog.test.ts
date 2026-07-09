import assert from "node:assert/strict";
import { getPublicCatalogPlans, isPlanVisibleInPublicCatalog } from "../../shared/planCatalog";

const hiddenPlan = {
  id: "hidden",
  ativo: true,
  exibirNaPaginaPlanos: false,
  isPersonalizado: false,
  tipo: "padrao",
  ordem: 1,
};

const publicSecond = {
  id: "second",
  ativo: true,
  exibirNaPaginaPlanos: true,
  isPersonalizado: false,
  tipo: "anual",
  ordem: 2,
};

const publicFirst = {
  id: "first",
  ativo: true,
  exibirNaPaginaPlanos: true,
  isPersonalizado: false,
  tipo: "padrao",
  ordem: 1,
};

const personalizedPlan = {
  id: "personal",
  ativo: true,
  exibirNaPaginaPlanos: true,
  isPersonalizado: true,
  tipo: "padrao",
  ordem: 0,
};

const resellerPlan = {
  id: "reseller",
  ativo: true,
  exibirNaPaginaPlanos: true,
  isPersonalizado: false,
  tipo: "revenda",
  ordem: 0,
};

const implementationPlan = {
  id: "implementation",
  ativo: true,
  exibirNaPaginaPlanos: true,
  isPersonalizado: false,
  tipo: "implementacao",
  ordem: 0,
};

assert.equal(isPlanVisibleInPublicCatalog(publicFirst), true);
assert.equal(isPlanVisibleInPublicCatalog(hiddenPlan), false);
assert.equal(isPlanVisibleInPublicCatalog(personalizedPlan), false);
assert.equal(isPlanVisibleInPublicCatalog(resellerPlan), false);
assert.equal(isPlanVisibleInPublicCatalog(implementationPlan), false);

const ordered = getPublicCatalogPlans([
  publicSecond,
  hiddenPlan,
  resellerPlan,
  implementationPlan,
  personalizedPlan,
  publicFirst,
]);

assert.deepEqual(
  ordered.map((plan) => plan.id),
  ["first", "second"],
);

const orderedWithContextUnlockedHidden = getPublicCatalogPlans(
  [
    publicSecond,
    hiddenPlan,
    resellerPlan,
    implementationPlan,
    personalizedPlan,
    publicFirst,
  ],
  { extraVisiblePlanIds: ["hidden", "reseller", "implementation", "personal"] },
);

assert.deepEqual(
  orderedWithContextUnlockedHidden.map((plan) => plan.id),
  ["first", "hidden", "second"],
);

console.log("planCatalog.test.ts: ok");
