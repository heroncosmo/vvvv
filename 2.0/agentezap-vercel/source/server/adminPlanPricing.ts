export type AdminPlanFocus = "monthly" | "annual" | "both";

export const ADMIN_PLAN_PROMO_MONTHLY_PRICE = "R$99,99 por mes";
export const ADMIN_PLAN_STANDARD_MONTHLY_PRICE = "R$99,99 por mes";
export const ADMIN_PLAN_ANNUAL_PRICE = "consulte no painel";
export const ADMIN_PLAN_PROMO_URL = "https://www.agentezap.online";
export const ADMIN_PLAN_STANDARD_URL = "https://www.agentezap.online";

function normalizePlanText(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,:;()"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPlanTokens(value: string): Set<string> {
  return new Set(value.split(" ").map((token) => token.trim()).filter(Boolean));
}

function countNormalizedIncludes(source: string, candidates: string[]): number {
  let hits = 0;
  for (const candidate of candidates) {
    if (source.includes(candidate)) {
      hits += 1;
    }
  }
  return hits;
}

export function isDescribingOwnSalesFlow(value?: string | null): boolean {
  const normalized = normalizePlanText(value);
  if (!normalized) return false;

  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 25) return false;

  const explicitCommercialQuestionSignals = [
    "quanto custa",
    "qual o valor",
    "qual valor",
    "qual o preco",
    "qual preco",
    "me passa o valor",
    "me manda o valor",
    "me fala o valor",
    "me fala o preco",
    "valor mensal",
    "valor anual",
    "quero assinar",
    "quero contratar",
    "quero ativar",
    "plano mensal",
    "plano anual",
    "link de planos",
    "link do plano",
  ];
  if (explicitCommercialQuestionSignals.some((signal) => normalized.includes(signal))) {
    return false;
  }

  const flowSignals = [
    "funil",
    "fluxo",
    "sequencia",
    "roteiro",
    "automatizar",
    "automacao",
    "video",
    "videos",
    "audio",
    "audios",
    "depoimento",
    "depoimentos",
    "foto",
    "fotos",
    "saudacao",
    "facebook",
    "instagram",
    "whatsapp",
    "cliente chegou",
    "manda o audio",
    "manda o video",
    "depois",
    "no final",
  ];

  const ownershipSignals = [
    "eu quero",
    "eu queria",
    "eu mando",
    "quero fazer",
    "quero colocar",
    "meu audio",
    "meu video",
    "meu funil",
    "hoje esse e o meu funil",
    "a pessoa vai",
    "eu ja mando",
    "eu vou falar",
  ];

  return countNormalizedIncludes(normalized, flowSignals) >= 3
    && countNormalizedIncludes(normalized, ownershipSignals) >= 1;
}

export function detectAdminPlanFocusFromText(value?: string | null): AdminPlanFocus {
  const normalized = normalizePlanText(value);
  if (!normalized) return "monthly";
  const tokens = buildPlanTokens(normalized);

  const asksAnnual =
    normalized.includes("12 meses") ||
    tokens.has("anual") ||
    tokens.has("ano") ||
    tokens.has("12x");
  const asksMonthly =
    normalized.includes("por mes") ||
    tokens.has("mensal") ||
    tokens.has("mensalidade") ||
    tokens.has("mes");

  if (asksAnnual && asksMonthly) return "both";
  if (asksAnnual) return "annual";
  return "monthly";
}

export function isAdminPlanRequest(value?: string | null): boolean {
  const normalized = normalizePlanText(value);
  if (!normalized) return false;

  if (isDescribingOwnSalesFlow(normalized)) {
    return false;
  }

  return [
    "plano",
    "preco",
    "precos",
    "valor",
    "valores",
    "mensal",
    "mensalidade",
    "anual",
    "assinatura",
    "assinar",
    "contratar",
    "ativar",
    "fechar",
    "quanto custa",
    "quanto e",
    "quanto por mes",
    "quanto por ano",
  ].some((token) => normalized.includes(token));
}

export function containsLegacyAdminPlanPricing(text?: string | null): boolean {
  const normalized = normalizePlanText(text);
  if (!normalized) return false;
  const compact = normalized.replace(/[^a-z0-9]+/g, "");

  const normalizedTokens = [
    "parc2026promo",
    "r$197",
    "r$97",
    "97/mes",
    "99/ano",
    "990",
    "so mensal mesmo",
    "https://agentezap.online/plans",
  ];

  const compactTokens = [
    "parc2026promo",
    "r197",
    "r97",
    "r49",
    "r599",
    "97mes",
    "99ano",
    "somensalmesmo",
    "httpsagentezaponlineplans",
    "planopromoilimitadomensal",
  ];

  return normalizedTokens.some((token) => normalized.includes(token))
    || compactTokens.some((token) => compact.includes(token));
}
