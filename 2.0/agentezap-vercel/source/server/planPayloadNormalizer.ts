import { randomBytes } from "crypto";

type PlanPayloadInput = Record<string, unknown>;

type ExistingPlanIdentifier = {
  id?: unknown;
  nome?: unknown;
  codigoPersonalizado?: unknown;
  codigo_personalizado?: unknown;
  linkSlug?: unknown;
  link_slug?: unknown;
};

export class PlanPayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanPayloadValidationError";
  }
}

function hasOwn(input: PlanPayloadInput, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return value == null ? null : String(value).trim() || null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalUppercaseString(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeSlugString(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;

  const slug = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return slug || null;
}

function normalizeCodeForSlug(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCodePrefix(value: unknown): string {
  const normalized = normalizeOptionalUppercaseString(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10);

  return normalized || "PLANO";
}

function getExistingCode(plan: ExistingPlanIdentifier): string | null {
  return normalizeOptionalUppercaseString(plan.codigoPersonalizado ?? plan.codigo_personalizado);
}

function getExistingSlug(plan: ExistingPlanIdentifier): string | null {
  return normalizeSlugString(plan.linkSlug ?? plan.link_slug);
}

function getExistingId(plan: ExistingPlanIdentifier | null | undefined): string | null {
  const value = plan?.id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildIdentifierSets(existingPlans: ExistingPlanIdentifier[], currentPlan?: ExistingPlanIdentifier | null) {
  const currentId = getExistingId(currentPlan);
  const codes = new Set<string>();
  const slugs = new Set<string>();

  for (const plan of existingPlans) {
    if (currentId && getExistingId(plan) === currentId) {
      continue;
    }

    const code = getExistingCode(plan);
    if (code) codes.add(code);

    const slug = getExistingSlug(plan);
    if (slug) slugs.add(slug);
  }

  return { codes, slugs };
}

export function createRandomPlanCode(seedName?: unknown): string {
  const prefix = normalizeCodePrefix(seedName);
  const suffix = randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${suffix}`.slice(0, 50);
}

export function createPlanLinkSlug(seedName: unknown, code: string): string {
  const base = normalizeSlugString(seedName) || "plano";
  const codeSlug = normalizeCodeForSlug(code) || randomBytes(3).toString("hex");
  return `${base}-${codeSlug}`.slice(0, 100).replace(/-+$/g, "");
}

function uniquePlanCode(seedName: unknown, existingCodes: Set<string>): string {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = createRandomPlanCode(seedName);
    if (!existingCodes.has(code)) {
      existingCodes.add(code);
      return code;
    }
  }

  const fallback = `PLANO-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`.slice(0, 50);
  existingCodes.add(fallback);
  return fallback;
}

function uniquePlanSlug(seedName: unknown, code: string, existingSlugs: Set<string>): string {
  const baseSlug = createPlanLinkSlug(seedName, code);

  if (!existingSlugs.has(baseSlug)) {
    existingSlugs.add(baseSlug);
    return baseSlug;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = randomBytes(2).toString("hex");
    const slug = `${baseSlug.slice(0, Math.max(1, 95 - suffix.length))}-${suffix}`;
    if (!existingSlugs.has(slug)) {
      existingSlugs.add(slug);
      return slug;
    }
  }

  const fallback = `${baseSlug.slice(0, 88)}-${Date.now().toString(36)}`.slice(0, 100);
  existingSlugs.add(fallback);
  return fallback;
}

export function normalizePlanPayload(input: PlanPayloadInput): PlanPayloadInput {
  const normalized: PlanPayloadInput = { ...input };

  if (hasOwn(input, "nome")) {
    normalized.nome = normalizeOptionalString(input.nome) ?? "";
  }

  if (hasOwn(input, "valor")) {
    normalized.valor = normalizeOptionalString(input.valor) ?? "";
  }

  if (hasOwn(input, "descricao")) {
    normalized.descricao = normalizeOptionalString(input.descricao);
  }

  if (hasOwn(input, "badge")) {
    normalized.badge = normalizeOptionalString(input.badge);
  }

  if (hasOwn(input, "ctaTexto")) {
    normalized.ctaTexto = normalizeOptionalString(input.ctaTexto);
  }

  if (hasOwn(input, "valorOriginal")) {
    normalized.valorOriginal = normalizeOptionalString(input.valorOriginal);
  }

  if (hasOwn(input, "valorPrimeiraCobranca")) {
    normalized.valorPrimeiraCobranca = normalizeOptionalString(input.valorPrimeiraCobranca);
  }

  if (hasOwn(input, "codigoPersonalizado")) {
    normalized.codigoPersonalizado = normalizeOptionalUppercaseString(input.codigoPersonalizado);
  }

  if (hasOwn(input, "linkSlug")) {
    normalized.linkSlug = normalizeSlugString(input.linkSlug);
  }

  return normalized;
}

export function preparePlanPayload(
  input: PlanPayloadInput,
  existingPlans: ExistingPlanIdentifier[] = [],
  options: { currentPlan?: ExistingPlanIdentifier | null } = {},
): PlanPayloadInput {
  const normalized = normalizePlanPayload(input);
  const currentPlan = options.currentPlan ?? null;
  const { codes, slugs } = buildIdentifierSets(existingPlans, currentPlan);

  const currentCode = getExistingCode(currentPlan || {});
  const requestedCode = normalizeOptionalUppercaseString(normalized.codigoPersonalizado);
  const code = requestedCode || currentCode || uniquePlanCode(normalized.nome ?? currentPlan?.nome, codes);

  normalized.codigoPersonalizado = code;

  const currentSlug = getExistingSlug(currentPlan || {});
  const requestedSlug = normalizeSlugString(normalized.linkSlug);
  normalized.linkSlug = requestedSlug || currentSlug || uniquePlanSlug(normalized.nome ?? currentPlan?.nome, code, slugs);

  return normalized;
}
