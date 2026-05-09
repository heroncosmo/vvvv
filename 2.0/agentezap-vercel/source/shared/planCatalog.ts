type PlanCatalogLike = {
  id: string;
  ordem?: number | null;
  ativo?: boolean | null;
  tipo?: string | null;
  isPersonalizado?: boolean | null;
  exibirNaPaginaPlanos?: boolean | null;
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

export function getPublicCatalogPlans<T extends PlanCatalogLike>(plans: T[]): T[] {
  return sortPlansForPublicCatalog(plans.filter((plan) => isPlanVisibleInPublicCatalog(plan)));
}
