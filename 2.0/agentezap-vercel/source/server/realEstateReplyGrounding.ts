import {
  assessRealEstatePropertyLookup,
  getGrupoOlxCatalogForAI,
  type RealEstateCatalogForAI,
  type RealEstateListingForAI,
} from "./realEstateCatalogService";

type MaybeGroundRealEstateReplyParams = {
  customerMessage: string;
  responseText: string;
  catalog: RealEstateCatalogForAI | null | undefined;
  conversationHistory?: RealEstateConversationContextMessage[];
};

export type RealEstateConversationContextMessage = {
  text?: string | null;
  fromMe?: boolean;
  isFromAgent?: boolean;
};

function normalizeGroundingText(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAddressLikeReference(message: string): boolean {
  const normalized = normalizeGroundingText(message);
  if (!normalized) return false;

  const tokens = normalized.split(" ").filter(Boolean);
  const hasStreetToken =
    tokens.includes("rua") ||
    tokens.includes("avenida") ||
    tokens.includes("av") ||
    tokens.includes("travessa") ||
    tokens.includes("alameda") ||
    tokens.includes("praca");
  const hasNumber = tokens.some((token) => /^\d{1,6}$/.test(token));

  return hasStreetToken && hasNumber;
}

function hasLinkIntent(message: string): boolean {
  const normalized = normalizeGroundingText(message);
  return (
    normalized.includes("link") ||
    normalized.includes("url") ||
    normalized.includes("anuncio") ||
    normalized.includes("site")
  );
}

function hasAnyToken(normalizedText: string, tokens: string[]): boolean {
  return tokens.some((token) => normalizedText.includes(token));
}

function shouldRetainManualRealEstateReference(message: string): boolean {
  const normalized = normalizeGroundingText(message);
  if (!normalized) return false;

  return (
    /\b[a-z]{1,4}\d{3,}\b/i.test(message) ||
    /\/detalhes-imovel\//i.test(message) ||
    hasAddressLikeReference(message) ||
    normalized.includes("codigo do imovel") ||
    normalized.includes("url do anuncio") ||
    normalized.includes("link do anuncio")
  );
}

function getRecentUserContextText(
  customerMessage: string,
  conversationHistory: RealEstateConversationContextMessage[] = [],
): string {
  const recentUserMessages = conversationHistory
    .filter((message) => message.fromMe !== true && message.isFromAgent !== true)
    .map((message) => String(message.text || "").trim())
    .filter(Boolean)
    .slice(-4);

  return [...recentUserMessages, String(customerMessage || "").trim()].filter(Boolean).join(" ");
}

function buildRealEstateHumanHandoffReply(reason: "customer_cannot_identify_property" | "missing_required_location_data" | null): string {
  if (reason === "customer_cannot_identify_property") {
    return "Sem problema. Para evitar te passar o imovel errado, vou encaminhar seu atendimento para um corretor humano da equipe continuar essa identificacao com voce.";
  }

  return "Para evitar te passar o imovel errado, vou encaminhar seu atendimento para um corretor humano da equipe, porque ainda faltam dados essenciais para confirmar esse anuncio com seguranca.";
}

function hasAssistantAnchoredListing(
  conversationHistory: RealEstateConversationContextMessage[] = [],
  listing: RealEstateListingForAI | null | undefined,
): boolean {
  if (!listing) return false;

  const normalizedAddress = normalizeGroundingText(listing.address);
  const normalizedCode = normalizeGroundingText(listing.code);

  return conversationHistory
    .filter((message) => message.isFromAgent === true)
    .slice(-4)
    .some((message) => {
      const text = String(message.text || "");
      const normalizedText = normalizeGroundingText(text);
      const assistantLookupAssessment = assessRealEstatePropertyLookup({
        customerMessage: text,
        listings: [listing],
      });
      if (!normalizedText) return false;

      return (
        (normalizedAddress ? normalizedText.includes(normalizedAddress) : false) ||
        (normalizedCode ? normalizedText.includes(normalizedCode) : false) ||
        (listing.detailUrl ? text.includes(listing.detailUrl) : false) ||
        hasStrongListingGrounding(text, listing) ||
        (
          assistantLookupAssessment.hasStreetClues &&
          assistantLookupAssessment.hasNumber &&
          assistantLookupAssessment.hasResolvableLocation
        )
      );
    });
}

function assessGroundedPropertyLookup(
  customerMessage: string,
  conversationHistory: RealEstateConversationContextMessage[] = [],
  catalog: RealEstateCatalogForAI | null | undefined,
) {
  const anchoredListing =
    catalog?.listings?.length === 1 && hasAssistantAnchoredListing(conversationHistory, catalog.listings[0]);
  if (anchoredListing) {
    return {
      shouldEscalateToHuman: false,
      reason: null,
      hasStreetClues: true,
      hasNumber: true,
      hasResolvableLocation: true,
    };
  }

  return assessRealEstatePropertyLookup({
    customerMessage,
    conversationHistory: buildRealEstateConversationContext(conversationHistory),
    listings: catalog?.listings || [],
  });
}

function hasInventoryDisplayIntent(
  customerMessage: string,
  conversationHistory: RealEstateConversationContextMessage[] = [],
): boolean {
  const normalized = normalizeGroundingText(getRecentUserContextText(customerMessage, conversationHistory));
  if (!normalized) return false;

  const hasPropertyContext = hasAnyToken(normalized, [
    "imovel",
    "imoveis",
    "apartamento",
    "apartamentos",
    "casa",
    "casas",
    "cobertura",
    "coberturas",
    "studio",
    "gonzaga",
    "santos",
    "bairro",
    "quarto",
    "quartos",
    "dorm",
    "vaga",
    "vagas",
    "morar",
    "planta",
    "preco",
    "valor",
    "faixa",
    "500k",
    "600k",
  ]);

  if (!hasPropertyContext) {
    return false;
  }

  return hasAnyToken(normalized, [
    "mostra",
    "mostre",
    "mostrar",
    "manda",
    "envia",
    "enviar",
    "link",
    "links",
    "url",
    "site",
    "opcao",
    "opcoes",
    "quero ver",
    "me mostra",
    "me mostre",
    "me manda",
    "sem preferencia",
    "nao tenho preferencia",
    "pronto para morar",
  ]);
}

function hasSpecificPropertyIntent(
  customerMessage: string,
  listing: RealEstateListingForAI,
  conversationHistory: RealEstateConversationContextMessage[] = [],
): boolean {
  const lookupText = getRecentUserContextText(customerMessage, conversationHistory);
  const normalizedMessage = normalizeGroundingText(lookupText);
  if (!normalizedMessage) return false;

  const normalizedCode = normalizeGroundingText(listing.code);
  const normalizedAddress = normalizeGroundingText(listing.address);
  const propertyLookupAssessment = assessRealEstatePropertyLookup({
    customerMessage,
    conversationHistory: buildRealEstateConversationContext(conversationHistory),
    listings: [listing],
  });

  return (
    hasAddressLikeReference(lookupText) ||
    hasLinkIntent(lookupText) ||
    (normalizedCode ? normalizedMessage.includes(normalizedCode) : false) ||
    (normalizedAddress ? normalizedMessage.includes(normalizedAddress) : false) ||
    (
      propertyLookupAssessment.hasStreetClues &&
      propertyLookupAssessment.hasNumber &&
      propertyLookupAssessment.hasResolvableLocation
    ) ||
    normalizedMessage.includes("esse imovel") ||
    normalizedMessage.includes("esse apartamento") ||
    normalizedMessage.includes("essa casa")
  );
}

function isStrongSingleListing(catalog: RealEstateCatalogForAI, listing: RealEstateListingForAI): boolean {
  if (catalog.listings.length !== 1) return false;
  return listing.score >= 45 || Boolean(listing.detailUrl);
}

function isPlaceholderLike(responseText: string): boolean {
  const normalized = normalizeGroundingText(responseText);
  if (!normalized) return true;

  return (
    responseText.includes("[") ||
    responseText.includes("]") ||
    normalized.includes("nome do predio") ||
    normalized.includes("x dormitorios") ||
    normalized.includes("x vagas") ||
    normalized.includes("xm2")
  );
}

function responseMentionsCatalogListings(responseText: string): boolean {
  const normalized = normalizeGroundingText(responseText);
  if (!normalized) return false;

  return (
    responseText.includes("1️⃣") ||
    responseText.includes("2️⃣") ||
    responseText.includes("3️⃣") ||
    responseText.includes("http://") ||
    responseText.includes("https://") ||
    (normalized.includes("tenho") && normalized.includes("opco")) ||
    normalized.includes("aqui estao") ||
    normalized.includes("vou te enviar os links") ||
    normalized.includes("vou confirmar os links") ||
    normalized.includes("vou buscar") ||
    normalized.includes("algumas opcoes")
  );
}

function hasStrongListingGrounding(responseText: string, listing: RealEstateListingForAI): boolean {
  const normalizedResponse = normalizeGroundingText(responseText);
  if (!normalizedResponse) return false;

  const titleTokens = normalizeGroundingText(listing.title)
    .split(" ")
    .filter((token) => token.length >= 4);
  const matchingTitleTokens = titleTokens.filter((token) => normalizedResponse.includes(token)).length;

  return (
    (listing.code ? normalizedResponse.includes(normalizeGroundingText(listing.code)) : false) ||
    (listing.detailUrl ? responseText.includes(listing.detailUrl) : false) ||
    (listing.price ? normalizedResponse.includes(normalizeGroundingText(listing.price)) : false) ||
    matchingTitleTokens >= 2
  );
}

function formatListingHighlights(listing: RealEstateListingForAI): string[] {
  const highlights: string[] = [];

  if (listing.bedrooms) {
    highlights.push(`${listing.bedrooms} dormitorio${listing.bedrooms > 1 ? "s" : ""}`);
  }
  if (listing.bathrooms) {
    highlights.push(`${listing.bathrooms} banheiro${listing.bathrooms > 1 ? "s" : ""}`);
  }
  if (listing.garage) {
    highlights.push(`${listing.garage} vaga${listing.garage > 1 ? "s" : ""}`);
  }
  if (listing.livingArea) {
    highlights.push(listing.livingArea);
  }

  return highlights;
}

function buildResolvedRealEstateReply(customerMessage: string, listing: RealEstateListingForAI): string {
  const normalizedMessage = normalizeGroundingText(customerMessage);
  const linkIntent = hasLinkIntent(customerMessage);
  const addressLine = listing.address
    ? `Encontrei o imovel certo em ${listing.address}.`
    : `Encontrei o imovel certo: ${listing.title}.`;
  const highlights = formatListingHighlights(listing);
  const detailParts = [
    listing.title,
    highlights.length > 0 ? `com ${highlights.join(", ")}` : null,
    listing.price ? `por ${listing.price}` : null,
  ].filter(Boolean);

  if (linkIntent && listing.detailUrl) {
    const lines = [addressLine];
    if (detailParts.length > 0) {
      lines.push(`E o ${detailParts.join(" ")}.`);
    }
    lines.push(`Link do anuncio: ${listing.detailUrl}`);
    lines.push("Se quiser, eu tambem posso te passar mais detalhes ou organizar uma visita.");
    return lines.join("\n");
  }

  const lines = [addressLine];

  if (detailParts.length > 0) {
    lines.push(`E o ${detailParts.join(" ")}.`);
  }

  if (listing.detailUrl) {
    lines.push(`Link do anuncio: ${listing.detailUrl}`);
  }

  if (normalizedMessage.includes("detalhe") || normalizedMessage.includes("informac")) {
    lines.push("Se quiser, eu tambem te passo mais detalhes desse imovel.");
  } else {
    lines.push("Se quiser, eu tambem posso te passar mais detalhes ou organizar uma visita.");
  }

  return lines.join("\n");
}

function appendListingUrl(responseText: string, listing: RealEstateListingForAI): string {
  if (!listing.detailUrl || responseText.includes(listing.detailUrl)) {
    return responseText;
  }

  const trimmed = responseText.trim();
  if (!trimmed) {
    return `Link do anuncio: ${listing.detailUrl}`;
  }

  return `${trimmed}\n\nLink do anuncio: ${listing.detailUrl}`;
}

function buildListingLine(listing: RealEstateListingForAI): string {
  const parts = [
    listing.title,
    listing.price,
    listing.neighborhood ? `${listing.neighborhood}, ${listing.city}` : listing.city,
  ].filter(Boolean) as string[];

  const highlights = formatListingHighlights(listing);
  if (highlights.length > 0) {
    parts.push(highlights.join(", "));
  }

  const lines = [`- ${parts.join(" | ")}`];

  if (listing.code) {
    lines.push(`  Codigo: ${listing.code}`);
  }
  if (listing.address) {
    lines.push(`  Endereco: ${listing.address}`);
  }
  if (listing.detailUrl) {
    lines.push(`  Link do anuncio: ${listing.detailUrl}`);
  } else {
    lines.push("  Link do anuncio: ainda nao confirmado no catalogo");
  }

  return lines.join("\n");
}

function buildMultipleListingReply(catalog: RealEstateCatalogForAI): string {
  const shownListings = catalog.listings.slice(0, 3);
  const listingLines = shownListings.map((listing) => buildListingLine(listing));
  const optionsLabel = shownListings.length > 1 ? "opcoes" : "opcao";
  const confirmedLabel = shownListings.length > 1 ? "confirmadas" : "confirmada";
  const intro =
    catalog.selectionMode === "alternatives" && catalog.selectionExplanation
      ? catalog.selectionExplanation
      : `Encontrei ${shownListings.length} ${optionsLabel} ${confirmedLabel} no catalogo:`;
  const outro =
    catalog.selectionMode === "alternatives"
      ? "Se quiser, eu tambem posso refinar a busca ou te passar mais detalhes destas alternativas reais."
      : "Se quiser, eu tambem posso separar mais detalhes da opcao que voce preferir.";

  return [
    intro,
    ...listingLines,
    outro,
  ].join("\n\n");
}

function buildNoCatalogMatchReply(customerMessage: string, catalog?: RealEstateCatalogForAI | null): string {
  const firstLine = catalog?.selectionExplanation || (
    hasLinkIntent(customerMessage)
      ? "Nao encontrei links confirmados para esse recorte no catalogo agora."
      : "Nao encontrei imoveis confirmados no catalogo para esse recorte agora."
  );

  if (hasLinkIntent(customerMessage)) {
    return [
      firstLine,
      "Se quiser, eu posso ampliar a faixa de valor, buscar em outro bairro ou ajustar o tipo de imovel.",
    ].join("\n");
  }

  return [
    firstLine,
    "Se quiser, eu posso ampliar a faixa de valor, buscar em bairros proximos ou ajustar o tipo de imovel.",
  ].join("\n");
}

export function buildRealEstateConversationContext(
  conversationHistory: RealEstateConversationContextMessage[] = [],
): Array<{ role: "user" | "assistant"; content: string }> {
  return conversationHistory.slice(-20).flatMap((message) => {
    const content = String(message.text || "").trim();
    if (!content) return [];
    if (message.isFromAgent === true) {
      return [{ role: "assistant" as const, content }];
    }
    if (message.fromMe === true && message.isFromAgent === false) {
      return shouldRetainManualRealEstateReference(content)
        ? [{ role: "assistant" as const, content }]
        : [];
    }
    return [{ role: "user" as const, content }];
  });
}

type GroundRealEstateReplyForUserTurnParams = {
  userId: string;
  customerMessage: string;
  responseText: string | null | undefined;
  conversationHistory?: RealEstateConversationContextMessage[];
  loadCatalog?: typeof getGrupoOlxCatalogForAI;
};

export async function groundRealEstateReplyForUserTurn(
  params: GroundRealEstateReplyForUserTurnParams,
): Promise<string | null | undefined> {
  const {
    userId,
    customerMessage,
    responseText,
    conversationHistory = [],
    loadCatalog = getGrupoOlxCatalogForAI,
  } = params;

  if (responseText === null || responseText === undefined) {
    return responseText;
  }

  const catalog = await loadCatalog(userId, customerMessage || "", {
    conversationHistory: buildRealEstateConversationContext(conversationHistory),
  });

  return maybeGroundRealEstateReply({
    customerMessage,
    responseText,
    catalog,
    conversationHistory,
  });
}

export function maybeGroundRealEstateReply(params: MaybeGroundRealEstateReplyParams): string {
  const { customerMessage, responseText, catalog, conversationHistory = [] } = params;
  if (!catalog?.active) return responseText;

  const propertyLookupAssessment = assessGroundedPropertyLookup(
    customerMessage,
    conversationHistory,
    catalog,
  );
  if (propertyLookupAssessment.shouldEscalateToHuman) {
    return buildRealEstateHumanHandoffReply(propertyLookupAssessment.reason);
  }

  const hasDisplayIntent = hasInventoryDisplayIntent(customerMessage, conversationHistory);
  const looksLikeCatalogReply = responseMentionsCatalogListings(responseText);

  if (catalog.listings.length === 0) {
    if (!hasDisplayIntent && !looksLikeCatalogReply) {
      return responseText;
    }

    return buildNoCatalogMatchReply(customerMessage, catalog);
  }

  if (catalog.listings.length > 1) {
    if (!hasDisplayIntent && !looksLikeCatalogReply) {
      return responseText;
    }

    return buildMultipleListingReply(catalog);
  }

  const [listing] = catalog.listings;
  if (!listing || !isStrongSingleListing(catalog, listing)) {
    return responseText;
  }

  if (!hasSpecificPropertyIntent(customerMessage, listing, conversationHistory)) {
    return responseText;
  }

  const missingRequestedLink =
    hasLinkIntent(customerMessage) &&
    Boolean(listing.detailUrl) &&
    !responseText.includes(listing.detailUrl);
  const missingListingUrl = Boolean(listing.detailUrl) && !responseText.includes(listing.detailUrl);
  const weakGrounding = !hasStrongListingGrounding(responseText, listing);

  if (!isPlaceholderLike(responseText) && !missingRequestedLink && !weakGrounding) {
    return missingListingUrl ? appendListingUrl(responseText, listing) : responseText;
  }

  return buildResolvedRealEstateReply(customerMessage, listing);
}
