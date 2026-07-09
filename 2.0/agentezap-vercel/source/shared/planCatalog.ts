type PlanCatalogLike = {
  id: string;
  ordem?: number | null;
  ativo?: boolean | null;
  tipo?: string | null;
  isPersonalizado?: boolean | null;
  exibirNaPaginaPlanos?: boolean | null;
};

type PublicCatalogOptions = {
  extraVisiblePlanIds?: readonly string[];
};

export function isPlanVisibleInPublicCatalog(plan: PlanCatalogLike | null | undefined): boolean {
  if (!plan || plan.ativo !== true) {
    return false;
  }

  if (plan.exibirNaPaginaPlanos !== true) {
    return false;
  }

  if (plan.isPersonalizado === true) {
    return false;
  }

  if (plan.tipo === "revenda") {
    return false;
  }

  if (plan.tipo === "implementacao" || plan.tipo === "implementacao_mensal") {
    return false;
  }

  return true;
}

export function sortPlansForPublicCatalog<T extends PlanCatalogLike>(plans: T[]): T[] {
  return [...plans].sort((left, right) => {
    const leftOrder = typeof left.ordem === "number" ? left.ordem : 0;
    const rightOrder = typeof right.ordem === "number" ? right.ordem : 0;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.id.localeCompare(right.id);
  });
}

function isPlanEligibleForContextUnlock(plan: PlanCatalogLike | null | undefined, extraVisiblePlanIds: Set<string>): boolean {
  if (!plan || plan.ativo !== true || !extraVisiblePlanIds.has(plan.id)) {
    return false;
  }

  if (plan.isPersonalizado === true) {
    return false;
  }

  if (plan.tipo === "revenda") {
    return false;
  }

  if (plan.tipo === "implementacao" || plan.tipo === "implementacao_mensal") {
    return false;
  }

  return true;
}

export function getPublicCatalogPlans<T extends PlanCatalogLike>(plans: T[], options: PublicCatalogOptions = {}): T[] {
  const extraVisiblePlanIds = new Set(options.extraVisiblePlanIds || []);
  return sortPlansForPublicCatalog(
    plans.filter((plan) => isPlanVisibleInPublicCatalog(plan) || isPlanEligibleForContextUnlock(plan, extraVisiblePlanIds)),
  );
}
