export type AdminPlanFocus = "monthly" | "annual" | "both";

export const ADMIN_PLAN_PROMO_MONTHLY_PRICE = "R$49 por mes";
export const ADMIN_PLAN_STANDARD_MONTHLY_PRICE = "R$99 por mes";
export const ADMIN_PLAN_ANNUAL_PRICE = "R$599";
export const ADMIN_PLAN_PROMO_URL = "https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e";
export const ADMIN_PLAN_STANDARD_URL = "https://agentezap.online";

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

export function getAdminMonthlyPlanPrice(promo49 = false): string {
  return promo49 ? ADMIN_PLAN_PROMO_MONTHLY_PRICE : ADMIN_PLAN_STANDARD_MONTHLY_PRICE;
}

export function getAdminPlanDefaultUrl(promo49 = false): string {
  return promo49 ? ADMIN_PLAN_PROMO_URL : ADMIN_PLAN_STANDARD_URL;
}

export function getAdminPlanSummary(
  focus: AdminPlanFocus = "monthly",
  promo49 = false,
): string {
  const monthlyPrice = getAdminMonthlyPlanPrice(promo49);

  switch (focus) {
    case "monthly":
      return `No mensal, fica *${monthlyPrice}*.`;
    case "annual":
      return `No anual promocional, fica *${ADMIN_PLAN_ANNUAL_PRICE}*.`;
    default:
      return `No mensal, fica *${monthlyPrice}*. No anual promocional, fica *${ADMIN_PLAN_ANNUAL_PRICE}*.`;
  }
}

export function buildAdminPlanReplyText(options?: {
  focus?: AdminPlanFocus;
  promo49?: boolean;
  link?: string;
  includeSupportLine?: boolean;
  includeQuestionLine?: boolean;
}): string {
  const focus = options?.focus || "monthly";
  const promo49 = options?.promo49 === true;
  const planLink =
    String(options?.link || getAdminPlanDefaultUrl(promo49)).trim() || getAdminPlanDefaultUrl(promo49);
  const includeSupportLine = options?.includeSupportLine === true;
  const includeQuestionLine = options?.includeQuestionLine !== false;

  let text = `${getAdminPlanSummary(focus, promo49)}\n\nVoce pode ver por aqui:\n${planLink}`;
  if (includeSupportLine) {
    text += "\n\nSe quiser, eu tambem posso te orientar no proximo passo.";
  }
  if (includeQuestionLine) {
    text += "\n\nSe fizer sentido, eu tambem posso te mostrar como testar e conectar o WhatsApp.";
  }

  return text;
}

export function containsLegacyAdminPlanPricing(text?: string | null): boolean {
  const normalized = normalizePlanText(text);
  if (!normalized) return false;

  return [
    "parc2026promo",
    "r$197",
    "r$97",
    "97/mes",
    "99/ano",
    "990",
    "só mensal mesmo",
    "so mensal mesmo",
    "https://agentezap.online/plans",
  ].some((token) => normalized.includes(token));
}

export function getAdminPlanPromptRules(): string {
  return [
    "PLANOS E PRECOS:",
    `- Mensal padrao: ${ADMIN_PLAN_STANDARD_MONTHLY_PRICE}`,
    `- Mensal promocional para lead que citar a oferta de 49: ${ADMIN_PLAN_PROMO_MONTHLY_PRICE}`,
    `- Anual promocional: ${ADMIN_PLAN_ANNUAL_PRICE}`,
    `- Link promocional do mensal 49: ${ADMIN_PLAN_PROMO_URL}`,
    `- Link padrao do sistema: ${ADMIN_PLAN_STANDARD_URL}`,
    "- Se o cliente perguntar so de preco ou plano sem citar anual, responda apenas o mensal.",
    "- Use R$49 por mes somente quando o cliente vier do anuncio/oferta de 49 ou retomar claramente essa oferta na conversa.",
    "- Para os demais leads, o mensal padrao e R$99 por mes.",
    "- So mencione o anual promocional quando o cliente perguntar do anual.",
  ].join("\n");
}
