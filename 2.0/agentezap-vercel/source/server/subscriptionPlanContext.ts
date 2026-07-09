const LIMITED_100K_PLAN_ID = "b93843cd-5261-43ff-b522-7366b3e95509";
const PUBLIC_BASE_PLAN_ID = "f6c55498-7b22-4ac2-9703-bf2bdd0cc431";
const PUBLIC_CONFIGURED_PLAN_ID = "2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function readValue(source: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return null;
}

function readNumber(source: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    const parsed = Number(source[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function inferPlanEntitlementFromCatalog(planId: string) {
  if (planId === LIMITED_100K_PLAN_ID) {
    return {
      planKey: "limited_100k_ai_messages",
      aiMessageTokensMonthlyLimit: 100000,
      aiMessagesUnlimited: false,
      initialSetupIncluded: true,
      recurringTeamEditsIncluded: false,
      preferredUpgradePlanId: PUBLIC_CONFIGURED_PLAN_ID,
      limitedOfferUnlockedByContext: true,
    };
  }

  if (planId === PUBLIC_BASE_PLAN_ID || planId === PUBLIC_CONFIGURED_PLAN_ID) {
    return {
      planKey: "plus_unlimited_ai",
      aiMessageTokensMonthlyLimit: null,
      aiMessagesUnlimited: true,
      recurringTeamEditsIncluded: true,
      responsePriority: "fast",
      intelligenceTier: "plus",
    };
  }

  return null;
}

export function buildSubscriptionPlanContextArtifact(subscriptionLike: unknown) {
  const subscription = asRecord(subscriptionLike);
  if (!Object.keys(subscription).length) {
    return {
      contract: [
        "Contexto neutro de assinatura/plano para o Codex CLI vivo.",
        "Nenhuma regra local deve inferir oferta, intencao comercial ou resposta publica a partir deste pacote.",
        "Se o plano do cliente for relevante, use estes dados como evidencia; se estiver ausente, peca confirmacao ou use action apropriada sem inventar.",
      ].join(" "),
      source: "subscription_plan_context",
      hasSubscription: false,
      subscription: null,
      plan: null,
      planEntitlement: null,
      planEntitlementSource: "none",
    };
  }

  const plan = asRecord(subscription.plan);
  const metadata = asRecord(subscription.metadata);
  const metadataPlanEntitlement = asRecord(metadata.planEntitlement);
  const planId = String(readValue(subscription, "planId", "plan_id") || readValue(plan, "id") || "").trim();
  const inferredPlanEntitlement = inferPlanEntitlementFromCatalog(planId);
  const planEntitlement = Object.keys(metadataPlanEntitlement).length > 0
    ? metadataPlanEntitlement
    : inferredPlanEntitlement;

  return {
    contract: [
      "Contexto neutro de assinatura/plano para o Codex CLI vivo.",
      "Este pacote e evidencia do estado financeiro/comercial da conta, nao detector de texto nem regra global de atendimento.",
      "O Codex deve combinar estes dados com prompt do tenant, conversa completa e side effects auditaveis antes de mencionar plano, limite, upgrade ou pagamento.",
      "O executor SaaS continua validando permissao, ownership, schema, pagamento e side effects; ele nao escreve fala publica por este contexto.",
    ].join(" "),
    source: "subscription_plan_context",
    hasSubscription: true,
    subscription: {
      id: readValue(subscription, "id"),
      userId: readValue(subscription, "userId", "user_id"),
      planId,
      status: readValue(subscription, "status"),
      dataInicio: readIso(readValue(subscription, "dataInicio", "data_inicio")),
      dataFim: readIso(readValue(subscription, "dataFim", "data_fim")),
      nextPaymentDate: readIso(readValue(subscription, "nextPaymentDate", "next_payment_date")),
      pendingReceipt: readValue(subscription, "pendingReceipt", "pending_receipt") === true,
      paymentMethod: readValue(subscription, "paymentMethod", "payment_method"),
      couponPrice: readNumber(subscription, "couponPrice", "coupon_price"),
      checkout: {
        createdFrom: readValue(metadata, "createdFrom"),
        checkoutMode: readValue(metadata, "checkoutMode"),
        checkoutPeriod: readValue(metadata, "checkoutPeriod"),
        checkoutAmount: readNumber(metadata, "checkoutAmount"),
        checkoutAmountAfterCoupon: readNumber(metadata, "checkoutAmountAfterCoupon"),
      },
    },
    plan: {
      id: readValue(plan, "id"),
      nome: readValue(plan, "nome"),
      descricao: readValue(plan, "descricao"),
      periodicidade: readValue(plan, "periodicidade"),
      valor: readNumber(plan, "valor"),
      valorOriginal: readNumber(plan, "valorOriginal", "valor_original"),
      valorPrimeiraCobranca: readNumber(plan, "valorPrimeiraCobranca", "valor_primeira_cobranca"),
      limiteConversas: readNumber(plan, "limiteConversas", "limite_conversas"),
      limiteAgentes: readNumber(plan, "limiteAgentes", "limite_agentes"),
      caracteristicas: Array.isArray(plan.caracteristicas) ? plan.caracteristicas : [],
    },
    planEntitlement,
    planEntitlementSource: Object.keys(metadataPlanEntitlement).length > 0
      ? "subscription.metadata.planEntitlement"
      : inferredPlanEntitlement
        ? "plan_catalog_id"
        : "none",
  };
}
