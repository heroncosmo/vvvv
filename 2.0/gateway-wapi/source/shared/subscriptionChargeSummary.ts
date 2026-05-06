type NullableMoney = string | number | null | undefined;

type PlanChargeLike = {
  valor?: NullableMoney;
  price?: NullableMoney;
  valorPrimeiraCobranca?: NullableMoney;
  frequenciaDias?: number | null;
  tipo?: string | null;
};

type SubscriptionChargeLike = {
  couponPrice?: NullableMoney;
};

function toMoney(value: NullableMoney): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const normalized = value.trim().replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSubscriptionChargeSummary(
  plan?: PlanChargeLike | null,
  subscription?: SubscriptionChargeLike | null,
) {
  const setupFee = toMoney(plan?.valorPrimeiraCobranca);
  const recurringAmount = toMoney(
    subscription?.couponPrice ?? plan?.valor ?? plan?.price,
  );
  const hasSetupFee = setupFee > 0 && setupFee !== recurringAmount;
  const initialAmount = hasSetupFee ? setupFee : recurringAmount;

  const frequencyDays =
    typeof plan?.frequenciaDias === "number" && plan.frequenciaDias > 0
      ? plan.frequenciaDias
      : 30;
  const isAnnual = frequencyDays >= 360 || plan?.tipo === "anual";
  const periodLabel = isAnnual ? "ano" : "mes";

  return {
    setupFee,
    recurringAmount,
    initialAmount,
    hasSetupFee,
    frequencyDays,
    isAnnual,
    periodLabel,
  };
}
