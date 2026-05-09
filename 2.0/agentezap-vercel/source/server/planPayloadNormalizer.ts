type PlanPayloadInput = Record<string, unknown>;

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
    normalized.linkSlug = normalizeOptionalString(input.linkSlug)?.toLowerCase() ?? null;
  }

  if (normalized.isPersonalizado === true && normalized.codigoPersonalizado == null) {
    throw new PlanPayloadValidationError("Código personalizado é obrigatório para planos personalizados");
  }

  return normalized;
}
