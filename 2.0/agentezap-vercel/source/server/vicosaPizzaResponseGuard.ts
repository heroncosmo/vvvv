export const VICOSA_PIZZA_USER_ID = "49cc61e1-412c-4c5a-a5a6-e64e548443dc";

type VicosaPizzaGuardResult = {
  text: string;
  applied: string[];
  shouldSendMenuMedia?: boolean;
};

type KnownHalfHalfPair = {
  key: string;
  name: string;
  match: string[][];
  smallPrice: string;
  largePrice: string;
};

const KNOWN_HALF_HALF_PAIRS: KnownHalfHalfPair[] = [
  {
    key: "calabresa_carne_do_sol_especial",
    name: "Calabresa + Carne do Sol Especial",
    match: [["calabresa"], ["carne do sol"]],
    smallPrice: "R$34,00",
    largePrice: "R$40,00",
  },
  {
    key: "calabresa_frango_catupiry",
    name: "Calabresa + Frango com Catupiry",
    match: [["calabresa"], ["frango"]],
    smallPrice: "R$26,00",
    largePrice: "R$33,00",
  },
];

function normalizeVicosaText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isVicosaPizzaUser(userId: unknown): boolean {
  return String(userId || "").trim() === VICOSA_PIZZA_USER_ID;
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function hasMenuHandoffMode(params: {
  prompt?: unknown;
  menuHandoffOnly?: boolean;
}): boolean {
  if (params.menuHandoffOnly === true) return true;

  const promptText = normalizeVicosaText(params.prompt);
  return (
    promptText.includes("calibracao_vicosa_menu_humano_2026_05_28") ||
    (
      promptText.includes("somente boas-vindas") &&
      promptText.includes("cardapio") &&
      promptText.includes("equipe humana")
    )
  );
}

function hasMenuWithoutHandoffMode(prompt: unknown): boolean {
  return normalizeVicosaText(prompt).includes("calibracao_vicosa_cardapio_sem_handoff_2026_05_29");
}

function hasMenuHandoffIntent(text: string): boolean {
  return hasAny(text, [
    "oi",
    "ola",
    "bom dia",
    "boa tarde",
    "boa noite",
    "cardapio",
    "menu",
    "opcoes",
    "preco",
    "precos",
    "valor",
    "taxa",
    "entrega",
    "prazo",
    "tempo",
    "demora",
    "delivery",
    "pedido",
    "pedir",
    "pizza",
    "calabresa",
    "hamburguer",
    "lanche",
    "endereco",
    "pagamento",
    "pix",
    "troco",
  ]);
}

function isExplicitMenuResendIntent(text: string): boolean {
  if (!text.includes("cardapio") && !text.includes("menu")) return false;
  return hasAny(text, [
    "de novo",
    "novamente",
    "reenvi",
    "reenvia",
    "manda",
    "mandar",
    "envia",
    "enviar",
    "nao recebi",
    "nao chegou",
    "aguardando",
  ]);
}

function historyContainsVicosaMenu(history: unknown): boolean {
  if (!Array.isArray(history)) return false;
  return history.some((entry: any) => {
    const text = normalizeVicosaText(
      [
        entry?.content,
        entry?.text,
        entry?.message,
        entry?.caption,
        entry?.media_caption,
        entry?.mediaName,
        entry?.media_name,
      ].filter(Boolean).join(" "),
    );
    return (
      text.includes("cardapio vicosa") ||
      text.includes("saudacao_info_extra") ||
      text.includes("cardapio_vicosa")
    );
  });
}

function sentMediasContainVicosaMenu(sentMedias: unknown): boolean {
  if (!Array.isArray(sentMedias)) return false;
  return sentMedias.some((value) => {
    const text = normalizeVicosaText(value);
    return text.includes("saudacao_info_extra") || text.includes("cardapio_vicosa");
  });
}

function buildMenuHandoffReply(params?: { withoutHandoff?: boolean }): string {
  if (params?.withoutHandoff) {
    return "Vou te enviar o cardapio oficial da Vicosa Pizza Burguer.";
  }

  return "Vou te enviar o cardapio oficial da Vicosa Pizza Burguer. A equipe da loja vai continuar o atendimento por aqui e confirmar pedido, valor final e taxa de entrega.";
}

function detectKnownHalfHalfPair(text: string): KnownHalfHalfPair | null {
  return KNOWN_HALF_HALF_PAIRS.find((pair) =>
    pair.match.every((terms) => terms.some((term) => text.includes(term))),
  ) || null;
}

function wantsSmallPizza(text: string): boolean {
  return /\b(p|pequena|peq)\b/.test(text);
}

function wantsLargePizza(text: string): boolean {
  return /\b(g|grande)\b/.test(text);
}

function buildHalfHalfReply(messageText: string, isSummaryTurn: boolean, pair: KnownHalfHalfPair): string {
  const small = wantsSmallPizza(messageText);
  const large = wantsLargePizza(messageText);
  const sizeText = small && !large ? "P/pequena" : "G/grande";
  const priceText = small && !large ? pair.smallPrice : pair.largePrice;

  if (isSummaryTurn) {
    return [
      `Resumo do pedido: 1 pizza ${sizeText} metade ${pair.name}.`,
      `O valor da pizza é ${priceText}, porque no meio a meio vale o sabor de maior valor.`,
      "Para fechar, envie a localização e confirme se quer borda.",
      "Depois disso, a equipe da loja confirma a taxa de entrega e envia o valor final pelo WhatsApp.",
    ].join("\n");
  }

  if (small && !large) {
    return `A pizza P/pequena meio a meio ${pair.name} fica ${pair.smallPrice}, porque no meio a meio vale o sabor de maior valor. Quer confirmar a P mesmo?`;
  }

  if (large && !small) {
    return `A pizza G/grande meio a meio ${pair.name} fica ${pair.largePrice}, porque no meio a meio vale o sabor de maior valor. Quer confirmar a G mesmo?`;
  }

  return `A pizza meio a meio ${pair.name} segue o valor do sabor mais caro. Na G/grande fica ${pair.largePrice}. Na P/pequena fica ${pair.smallPrice}. Qual tamanho você quer confirmar?`;
}

function buildNoMediumReply(messageText: string): string {
  if (messageText.includes("calabresa")) {
    return "Na Viçosa Pizza Burguer não trabalhamos com pizza média. Temos apenas P/pequena (4 fatias) e G/grande (8 fatias). A Calabresa custa R$25,00 na P e R$31,00 na G. Qual tamanho você prefere?";
  }

  return "Na Viçosa Pizza Burguer não trabalhamos com pizza média. Temos apenas P/pequena (4 fatias) e G/grande (8 fatias). Qual tamanho você prefere?";
}

function buildDeliveryFeeReply(): string {
  return "A entrega fica em até 30 minutos depois da confirmação da loja. Para calcular a taxa e o valor final, envie endereço completo, ponto de referência e localização. A equipe da loja confirma tudo pelo WhatsApp.";
}

function buildArtifactFallbackReply(): string {
  return "Para fechar o pedido, me confirme o tamanho, os sabores, a forma de pagamento, o endereço completo, o ponto de referência e a localização. A equipe da loja confirma a taxa de entrega e o valor final pelo WhatsApp.";
}

function hasVicosaMenuMediaAction(mediaActions: unknown[]): boolean {
  return mediaActions.some((action: any) => {
    const mediaName = normalizeVicosaText(action?.media_name || action?.mediaName || "");
    if (mediaName.includes("saudacao_info_extra") || mediaName.includes("cardapio_vicosa")) {
      return true;
    }

    return action?.type === "send_media_url" && normalizeVicosaText(action?.caption).includes("cardapio vicosa");
  });
}

export function ensureVicosaPizzaMenuMediaAction<T extends unknown[]>(
  mediaActions: T,
  guardResult: VicosaPizzaGuardResult,
): T {
  if (guardResult.shouldSendMenuMedia !== true) return mediaActions;
  if (hasVicosaMenuMediaAction(mediaActions)) return mediaActions;

  return [
    ...(mediaActions as unknown[]),
    {
      type: "send_media",
      media_name: "CARDAPIO_VICOSA",
    },
  ] as T;
}

export function applyVicosaPizzaResponseGuard(params: {
  userId: string;
  message: unknown;
  text: unknown;
  prompt?: unknown;
  menuHandoffOnly?: boolean;
  history?: unknown;
  sentMedias?: unknown;
}): VicosaPizzaGuardResult {
  const originalText = String(params.text || "");
  if (!isVicosaPizzaUser(params.userId)) {
    return { text: originalText, applied: [] };
  }

  const messageText = normalizeVicosaText(params.message);
  const responseText = normalizeVicosaText(originalText);
  const combinedText = `${messageText}\n${responseText}`;
  const applied: string[] = [];
  const menuAlreadySent =
    historyContainsVicosaMenu(params.history) ||
    sentMediasContainVicosaMenu(params.sentMedias);
  const explicitMenuResend = isExplicitMenuResendIntent(messageText);

  if (hasMenuHandoffMode(params)) {
    const withoutHandoff = hasMenuWithoutHandoffMode(params.prompt);
    if (menuAlreadySent && !explicitMenuResend) {
      return { text: originalText, applied };
    }

    const shouldReplace =
      hasMenuHandoffIntent(messageText) ||
      hasAny(responseText, [
        "anotad",
        "confirme",
        "qual tamanho",
        "qual sabor",
        "endereco",
        "pagamento",
        "pix",
        "troco",
        "30 minutos",
        "taxa",
        "valor final",
      ]);

    if (shouldReplace) {
      applied.push(explicitMenuResend && menuAlreadySent ? "menu_handoff_resend" : "menu_handoff_only");
      return {
        text: buildMenuHandoffReply({ withoutHandoff }),
        applied,
        shouldSendMenuMedia: true,
      };
    }

    return { text: originalText, applied };
  }

  const mentionsMediumPizza =
    (messageText.includes("pizza") && hasAny(messageText, [" media", "media ", "medio", "média"])) ||
    hasAny(responseText, ["pizza media", "pizza média", "media (g", "média (g", "temos pizza media", "temos pizza média"]);

  if (mentionsMediumPizza) {
    applied.push("no_medium_pizza");
    return { text: buildNoMediumReply(messageText), applied };
  }

  const halfHalfPair = detectKnownHalfHalfPair(combinedText);
  const mentionsHalfHalf =
    hasAny(combinedText, ["meio a meio", "meia", "metade", "1/2", "meio"]) &&
    Boolean(halfHalfPair);
  const hasBadHalfHalfPrice =
    Boolean(halfHalfPair) &&
    (hasAny(responseText, ["69,90", "69.90", "r$69", "soma", "somar", "somando"]) ||
      /r\$\s*x{2}/i.test(originalText) ||
      /r\$\s*y{2}/i.test(originalText));
  const hasOutputArtifact =
    /r\$\s*x{2}/i.test(originalText) ||
    /r\$\s*y{2}/i.test(originalText) ||
    hasAny(responseText, ["formatada de acordo", "suponha", "verifique o cardapio"]);
  const isSummaryTurn = hasAny(messageText, ["resumo", "resuma", "pedido", "rua", "pix", "endereco", "endereço"]);

  if (halfHalfPair && (mentionsHalfHalf || hasBadHalfHalfPrice)) {
    applied.push(`half_half_highest_price:${halfHalfPair.key}`);
    return { text: buildHalfHalfReply(messageText, isSummaryTurn, halfHalfPair), applied };
  }

  const asksDeliveryFeeOrTime = hasAny(messageText, ["taxa", "entrega", "prazo", "tempo", "demora", "delivery"]);
  const claimsFreeOrZeroFee = hasAny(responseText, ["taxa gratis", "taxa grátis", "sem taxa", "r$0,00", "r$ 0,00"]);
  if (asksDeliveryFeeOrTime || claimsFreeOrZeroFee) {
    applied.push("delivery_fee_final_by_store");
    return { text: buildDeliveryFeeReply(), applied };
  }

  if (hasOutputArtifact) {
    applied.push("artifact_fallback");
    return { text: buildArtifactFallbackReply(), applied };
  }

  return { text: originalText, applied };
}
