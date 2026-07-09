function firstReadableName(value: unknown): string {
  const first = String(value || "").trim().split(/\s+/)[0] || "";
  if (!first || first.length < 2 || first.length > 18) {
    return "";
  }

  if (/[0-9@]/.test(first)) {
    return "";
  }

  return first;
}

export function buildSafeTechnicalFallbackFollowUpMessage(params: {
  clientName?: string | null;
  askedQuestion?: boolean;
  offeredPrice?: boolean;
  offeredDemo?: boolean;
  conversedToday?: boolean;
  stage?: number | null;
}): string {
  const name = firstReadableName(params.clientName);
  const prefix = params.conversedToday
    ? name ? `${name}, ` : ""
    : name ? `Oi, ${name}, ` : "Oi, ";

  const stage = Math.max(0, Number(params.stage || 0) || 0);
  const body = params.askedQuestion
    ? "conseguiu ver minha ultima mensagem ou ficou alguma duvida?"
    : params.offeredPrice
      ? "quer que eu te ajude a escolher a melhor opcao?"
      : params.offeredDemo
        ? "quer que eu te mostre o proximo passo?"
        : stage >= 2
          ? "ainda faz sentido continuar com isso ou prefere que eu pare por aqui?"
          : "conseguiu ver o que te mandei ou ficou alguma duvida?";

  if (prefix) {
    return `${prefix}${body}`;
  }

  return `${body.charAt(0).toUpperCase()}${body.slice(1)}`;
}
