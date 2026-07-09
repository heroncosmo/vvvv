import { XMLParser } from "fast-xml-parser";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import crypto from "node:crypto";

import { db } from "./db";
import {
  grupoOlxIntegrations,
  grupoOlxListings,
  type GrupoOlxIntegration,
  type GrupoOlxListing,
} from "@shared/schema";
import { canExposeGrupoOlxCatalogToAi } from "@shared/grupoOlxIntegrationRules";

type RawListingNode = Record<string, any>;

export type RealEstateCatalogSyncResult = {
  synced: number;
  inserted: number;
  updated: number;
  deactivated: number;
  totalActive: number;
};

export type PaginatedGrupoOlxListingsResult = {
  items: GrupoOlxListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RealEstateListingForAI = {
  code: string;
  title: string;
  transactionType: string | null;
  propertyType: string | null;
  price: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  garage: number | null;
  livingArea: string | null;
  detailUrl: string | null;
  description: string | null;
  score: number;
  inventoryStatus?: "active_xml" | "conversation_anchor";
};

export type RealEstateCatalogForAI = {
  active: boolean;
  totalCount: number;
  retrievedCount: number;
  feedUrl: string | null;
  listings: RealEstateListingForAI[];
  inventoryListings?: RealEstateListingForAI[];
  specialInstructions: string[];
  requiresPropertyIdentificationFirst?: boolean;
  selectionMode?: "direct" | "alternatives" | "no_match";
  selectionExplanation?: string | null;
};

type RealEstateCatalogContextTurn = {
  role: "user" | "assistant";
  content: string;
};

type ConversationAnchorSignals = {
  codes: string[];
  urls: string[];
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const STOPWORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "qual",
  "quais",
  "que",
  "tem",
  "tenho",
  "um",
  "uma",
  "umas",
  "uns",
  "sobre",
  "procuro",
  "busco",
  "quero",
  "imovel",
  "imoveis",
  "apartamento",
  "apartamentos",
  "casa",
  "casas",
]);

const ADDRESS_STREET_TYPE_STOPWORDS = new Set([
  "alameda",
  "al",
  "avenida",
  "av",
  "estrada",
  "est",
  "praca",
  "praça",
  "rodovia",
  "rua",
  "r",
  "travessa",
  "tv",
  "via",
  "viela",
]);

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  "for sale": "Venda",
  "for rent": "Aluguel",
  sale: "Venda",
  rent: "Aluguel",
  aluguel: "Aluguel",
  venda: "Venda",
  temporada: "Temporada",
};

const REAL_ESTATE_DETAIL_LINK_PATTERN = /\/detalhes-imovel\/|landmarkimoveis\.com\.br\/detalhes-imovel\//i;
const REAL_ESTATE_LISTING_CODE_PATTERN = /\b[a-z]{1,4}\d{3,}\b/i;
const REAL_ESTATE_INVENTORY_REQUEST_PATTERN =
  /\b(lista|opcoes|opções|sugestoes|sugestões|imoveis disponiveis|imóveis disponíveis|quais imoveis|quais imóveis|tem algum imovel|tem algum imóvel|mostrar imoveis|mostrar imóveis|me envie opcoes|me envie opções)\b/i;
const REAL_ESTATE_GENERIC_OPENING_PATTERN =
  /\b(placa|qr\s*code|qrcode|em frente|mais informac|tenho interesse|quero saber mais|quero mais detalhes|vim pela placa|estou no imovel|estou no imóvel)\b/i;
const REAL_ESTATE_LOCATION_OR_FILTER_PATTERN =
  /\b(santos|sao vicente|são vicente|praia grande|gonzaga|aparecida|canto do forte|ponta da praia|cai[cç]ara|aviacao|aviação|tupi|boqueirao|boqueirão|aluguel|loca[cç][aã]o|venda|comprar|quartos?|dorm|suite|su[íi]te|vaga|garagem|cobertura|casa|apartamento)\b|\b\d+\s*(dorm|quarto|suite|su[íi]te|vaga|m2)\b/i;

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function cleanListingText(value: string | null | undefined): string | null {
  const rawValue = unwrapNodeValue(value);
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  const decoded = decodeHtmlEntities(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/Â/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return decoded || null;
}

function humanizeTransactionType(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return TRANSACTION_TYPE_LABELS[normalized] || String(value).trim();
}

function humanizePropertyType(value: string | null | undefined): string | null {
  const cleaned = cleanListingText(value);
  if (!cleaned) return null;
  const normalized = cleaned.replace(/^residential\s*\/\s*/i, "").replace(/^commercial\s*\/\s*/i, "").trim();
  return normalized || cleaned;
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function unwrapNodeValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const node = value as Record<string, unknown>;
    if (node["#text"] != null && node["#text"] !== "") {
      return node["#text"];
    }
  }

  return value;
}

function parseInteger(value: unknown): number | null {
  const rawValue = unwrapNodeValue(value);
  if (rawValue == null || rawValue === "") return null;
  const cleaned = String(rawValue).replace(",", ".").trim();
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDecimal(value: unknown): string | null {
  const rawValue = unwrapNodeValue(value);
  if (rawValue == null || rawValue === "") return null;
  const cleaned = String(rawValue).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : null;
}

function getPrimaryImage(mediaNode: any): string | null {
  const items = asArray(mediaNode?.Item);
  const imageItems = items.filter((item) => String(item?.["@_medium"] || "").toLowerCase() === "image");
  const primary = imageItems.find((item) => String(item?.["@_primary"] || "").toLowerCase() === "true");
  const chosen = primary || imageItems[0];
  const raw = chosen?.["#text"] || chosen;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parseFeatureList(rawListing: RawListingNode): string[] {
  const features = asArray(rawListing?.Details?.Features?.Feature);
  return features
    .map((feature) => (typeof feature === "string" ? cleanListingText(feature) || "" : ""))
    .filter(Boolean);
}

function buildSearchableText(input: {
  code: string | null;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  propertyType: string | null;
  transactionType: string | null;
  description: string | null;
  features: string[];
}): string {
  return [
    input.code,
    input.title,
    input.city,
    input.neighborhood,
    input.address,
    input.propertyType,
    input.transactionType,
    input.description,
    input.features.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function parseListing(rawListing: RawListingNode) {
  const code = String(rawListing?.ListingID || "").trim() || null;
  const title = cleanListingText(rawListing?.Title) || "Imovel sem titulo";
  const city = cleanListingText(rawListing?.Location?.City);
  const state = cleanListingText(rawListing?.Location?.State);
  const neighborhood = cleanListingText(rawListing?.Location?.Neighborhood);
  const street = cleanListingText(rawListing?.Location?.Address);
  const streetNumber = cleanListingText(rawListing?.Location?.StreetNumber);
  const address = [street, streetNumber].filter(Boolean).join(", ") || null;
  const features = parseFeatureList(rawListing);
  const propertyType = humanizePropertyType(rawListing?.Details?.PropertyType);
  const transactionType = humanizeTransactionType(rawListing?.TransactionType);
  const description = cleanListingText(rawListing?.Details?.Description || rawListing?.Description);

  return {
    externalListingId: code || crypto.randomUUID(),
    listingCode: code,
    title,
    transactionType,
    propertyType,
    publicationType: cleanListingText(rawListing?.PublicationType),
    description,
    detailUrl: cleanListingText(rawListing?.DetailViewUrl),
    imageUrl: getPrimaryImage(rawListing?.Media),
    price: parseDecimal(rawListing?.Details?.ListPrice),
    condoFee: parseDecimal(rawListing?.Details?.PropertyAdministrationFee),
    yearlyTax: parseDecimal(rawListing?.Details?.YearlyTax),
    bedrooms: parseInteger(rawListing?.Details?.Bedrooms),
    bathrooms: parseInteger(rawListing?.Details?.Bathrooms),
    suites: parseInteger(rawListing?.Details?.Suites),
    garage: parseInteger(rawListing?.Details?.Garage),
    livingArea: parseDecimal(rawListing?.Details?.LivingArea),
    lotArea: parseDecimal(rawListing?.Details?.LotArea),
    city,
    state,
    neighborhood,
    address,
    features,
    searchableText: buildSearchableText({
      code,
      title,
      city,
      neighborhood,
      address,
      propertyType,
      transactionType,
      description,
      features,
    }),
    rawPayload: rawListing,
  };
}

export function parseGrupoOlxXmlFeed(xml: string) {
  const parsed = xmlParser.parse(xml);
  return asArray(parsed?.ListingDataFeed?.Listings?.Listing).map((rawListing) => parseListing(rawListing));
}

export async function syncGrupoOlxCatalogFromFeed(integration: GrupoOlxIntegration): Promise<RealEstateCatalogSyncResult> {
  if (!integration.xmlFeedUrl) {
    throw new Error("URL do feed XML nao configurada");
  }

  const response = await fetch(integration.xmlFeedUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar feed XML: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const parsedListings = parseGrupoOlxXmlFeed(xml);

  if (parsedListings.length === 0) {
    throw new Error("Nenhum imovel encontrado no feed XML");
  }

  const existing = await db
    .select()
    .from(grupoOlxListings)
    .where(eq(grupoOlxListings.integrationId, integration.id));

  const existingByExternalId = new Map(existing.map((item) => [item.externalListingId, item]));
  const seenExternalIds = new Set<string>();

  let inserted = 0;
  let updated = 0;

  for (const parsedListing of parsedListings) {
    seenExternalIds.add(parsedListing.externalListingId);

    const payload = {
      integrationId: integration.id,
      externalListingId: parsedListing.externalListingId,
      listingCode: parsedListing.listingCode,
      title: parsedListing.title,
      transactionType: parsedListing.transactionType,
      propertyType: parsedListing.propertyType,
      publicationType: parsedListing.publicationType,
      description: parsedListing.description,
      detailUrl: parsedListing.detailUrl,
      imageUrl: parsedListing.imageUrl,
      price: parsedListing.price,
      condoFee: parsedListing.condoFee,
      yearlyTax: parsedListing.yearlyTax,
      bedrooms: parsedListing.bedrooms,
      bathrooms: parsedListing.bathrooms,
      suites: parsedListing.suites,
      garage: parsedListing.garage,
      livingArea: parsedListing.livingArea,
      lotArea: parsedListing.lotArea,
      city: parsedListing.city,
      state: parsedListing.state,
      neighborhood: parsedListing.neighborhood,
      address: parsedListing.address,
      searchableText: parsedListing.searchableText,
      features: parsedListing.features,
      rawPayload: parsedListing.rawPayload,
      isActive: true,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    };

    const current = existingByExternalId.get(parsedListing.externalListingId);
    if (!current) {
      await db.insert(grupoOlxListings).values(payload);
      inserted++;
      continue;
    }

    await db
      .update(grupoOlxListings)
      .set(payload)
      .where(eq(grupoOlxListings.id, current.id));
    updated++;
  }

  let deactivated = 0;
  for (const listing of existing) {
    if (seenExternalIds.has(listing.externalListingId) || listing.isActive === false) continue;
    await db
      .update(grupoOlxListings)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(grupoOlxListings.id, listing.id));
    deactivated++;
  }

  const activeListings = await db
    .select({ id: grupoOlxListings.id })
    .from(grupoOlxListings)
    .where(and(eq(grupoOlxListings.integrationId, integration.id), eq(grupoOlxListings.isActive, true)));

  return {
    synced: parsedListings.length,
    inserted,
    updated,
    deactivated,
    totalActive: activeListings.length,
  };
}

type ListingScoreCandidate = {
  listing: GrupoOlxListing;
  score: number;
};

type AddressReference = {
  streetTokens: string[];
  canonicalStreetTokens: string[];
  numbers: string[];
};

type RealEstateSearchCriteria = {
  propertyType: "apartment" | "house" | "penthouse" | null;
  city: string | null;
  neighborhood: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  broadInventoryIntent: boolean;
};

type RealEstateStructuredSelection = {
  matches: RealEstateListingForAI[];
  mode: "direct" | "alternatives" | "no_match" | null;
  explanation: string | null;
};

type RealEstateLookupAssessmentListing = {
  code?: string | null;
  externalListingId?: string | null;
  detailUrl?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  address?: string | null;
};

type ListingIdentifierHit = {
  code: string;
  matchedByUrl: boolean;
};

export type RealEstatePropertyLookupAssessment = {
  shouldEscalateToHuman: boolean;
  reason: "customer_cannot_identify_property" | "missing_required_location_data" | null;
  hasStreetClues: boolean;
  hasNumber: boolean;
  hasResolvableLocation: boolean;
};

const REAL_ESTATE_HUMAN_HANDOFF_PHRASES = [
  "nao consigo ver",
  "nao da para ver",
  "nao da pra ver",
  "nao consigo visualizar",
  "nao consigo identificar",
  "nao da para identificar",
  "nao da pra identificar",
  "nao sei o numero",
  "nao vejo o numero",
  "numero nao aparece",
  "nao consigo ler",
  "nao da para ler",
  "nao da pra ler",
];

function canonicalizeAddressToken(value: string): string {
  return normalizeText(value)
    .replace(/([a-z])\1+/g, "$1")
    .trim();
}

function buildUniqueCatalogTerms<T>(
  listings: T[],
  selector: (listing: T) => string | null | undefined,
): string[] {
  return Array.from(
    new Set(
      listings
        .map((listing) => normalizeText(selector(listing)))
        .filter((value) => value.length >= 3),
    ),
  ).sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function includesCatalogTerm(normalizedText: string, term: string): boolean {
  if (!normalizedText || !term) return false;
  if (normalizedText === term) return true;
  return normalizedText.includes(` ${term} `) || normalizedText.startsWith(`${term} `) || normalizedText.endsWith(` ${term}`);
}

function resolveLocationFromCatalog<T>(
  normalizedText: string,
  listings: T[],
  selector: (listing: T) => string | null | undefined,
): string | null {
  const terms = buildUniqueCatalogTerms(listings, selector);
  return terms.find((term) => includesCatalogTerm(normalizedText, term)) || null;
}

function parseScaledBudgetValue(token: string, nextToken?: string | null): { value: number | null; consumedNext: boolean } {
  const normalizedToken = normalizeText(token);
  const normalizedNext = normalizeText(nextToken);
  if (!normalizedToken) {
    return { value: null, consumedNext: false };
  }

  const suffixMap: Array<{ suffix: string; multiplier: number }> = [
    { suffix: "milhoes", multiplier: 1_000_000 },
    { suffix: "milhao", multiplier: 1_000_000 },
    { suffix: "milhaoes", multiplier: 1_000_000 },
    { suffix: "mi", multiplier: 1_000_000 },
    { suffix: "kk", multiplier: 1_000_000 },
    { suffix: "k", multiplier: 1_000 },
  ];

  for (const { suffix, multiplier } of suffixMap) {
    if (normalizedToken.endsWith(suffix) && normalizedToken.length > suffix.length) {
      const numericPart = normalizedToken.slice(0, -suffix.length).replace(",", ".");
      const parsed = Number.parseFloat(numericPart);
      if (Number.isFinite(parsed)) {
        return { value: parsed * multiplier, consumedNext: false };
      }
    }
  }

  const numericToken = normalizedToken.replace(",", ".");
  const parsed = Number.parseFloat(numericToken);
  if (!Number.isFinite(parsed)) {
    return { value: null, consumedNext: false };
  }

  if (parsed >= 100_000) {
    return { value: parsed, consumedNext: false };
  }

  if (normalizedNext === "mil") {
    return { value: parsed * 1_000, consumedNext: true };
  }

  if (normalizedNext === "milhao" || normalizedNext === "milhoes" || normalizedNext === "mi") {
    return { value: parsed * 1_000_000, consumedNext: true };
  }

  return { value: null, consumedNext: false };
}

function extractBudgetRange(normalizedText: string): { minPrice: number | null; maxPrice: number | null } {
  const tokens = normalizedText.split(" ").filter(Boolean);
  const values: number[] = [];
  const budgetIdentifierStopwords = new Set(["id", "codigo", "anuncio", "oferta", "zap"]);

  for (let index = 0; index < tokens.length; index++) {
    const current = tokens[index];
    const previous = tokens[index - 1] || null;
    const previousTwo = tokens[index - 2] || null;
    const next = tokens[index + 1];

    if (
      isNumericTextToken(current) &&
      (
        current.length >= 8 ||
        budgetIdentifierStopwords.has(normalizeText(previous)) ||
        budgetIdentifierStopwords.has(normalizeText(previousTwo))
      )
    ) {
      continue;
    }

    const parsed = parseScaledBudgetValue(current, next);
    if (parsed.value != null) {
      values.push(parsed.value);
      if (parsed.consumedNext) {
        index += 1;
      }
    }
  }

  if (values.length === 0) {
    return { minPrice: null, maxPrice: null };
  }

  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) {
    return { minPrice: sorted[0], maxPrice: sorted[0] };
  }

  return {
    minPrice: sorted[0],
    maxPrice: sorted[sorted.length - 1],
  };
}

function resolvePropertyTypeFromText(normalizedText: string): RealEstateSearchCriteria["propertyType"] {
  const hasApartment =
    includesCatalogTerm(normalizedText, "apartamento") ||
    includesCatalogTerm(normalizedText, "apartamentos") ||
    includesCatalogTerm(normalizedText, "apto");
  if (hasApartment) return "apartment";

  if (includesCatalogTerm(normalizedText, "cobertura") || includesCatalogTerm(normalizedText, "coberturas")) {
    return "penthouse";
  }

  if (includesCatalogTerm(normalizedText, "casa") || includesCatalogTerm(normalizedText, "casas") || includesCatalogTerm(normalizedText, "sobrado")) {
    return "house";
  }

  return null;
}

function listingMatchesPropertyType(
  listing: GrupoOlxListing,
  propertyType: RealEstateSearchCriteria["propertyType"],
): boolean {
  if (!propertyType) return true;

  const normalizedType = normalizeText([listing.propertyType, listing.title].filter(Boolean).join(" "));
  if (propertyType === "apartment") {
    return normalizedType.includes("apartment") || normalizedType.includes("apartamento") || normalizedType.includes("apto");
  }

  if (propertyType === "penthouse") {
    return normalizedType.includes("cobertura") || normalizedType.includes("penthouse");
  }

  if (propertyType === "house") {
    return normalizedType.includes("casa") || normalizedType.includes("sobrado") || normalizedType.includes("house");
  }

  return true;
}

function listingPriceValue(listing: GrupoOlxListing): number | null {
  if (listing.price == null) return null;
  const parsed = Number.parseFloat(String(listing.price));
  return Number.isFinite(parsed) ? parsed : null;
}

function listingMatchesPriceRange(listing: GrupoOlxListing, criteria: RealEstateSearchCriteria): boolean {
  if (criteria.minPrice == null && criteria.maxPrice == null) return true;
  const price = listingPriceValue(listing);
  if (price == null) return false;
  if (criteria.minPrice != null && price < criteria.minPrice) return false;
  if (criteria.maxPrice != null && price > criteria.maxPrice) return false;
  return true;
}

function listingMatchesLocation(listing: GrupoOlxListing, criteria: RealEstateSearchCriteria): boolean {
  if (criteria.city && normalizeText(listing.city) !== criteria.city) {
    return false;
  }
  if (criteria.neighborhood && normalizeText(listing.neighborhood) !== criteria.neighborhood) {
    return false;
  }
  return true;
}

function inferRealEstateSearchCriteria(
  listings: GrupoOlxListing[],
  customerMessage: string,
  conversationHistory: RealEstateCatalogContextTurn[] = [],
): RealEstateSearchCriteria {
  const retrievalText = buildRetrievalText(customerMessage, conversationHistory, listings);
  const normalizedText = normalizeText(retrievalText);
  const { minPrice, maxPrice } = extractBudgetRange(normalizedText);

  return {
    propertyType: resolvePropertyTypeFromText(normalizedText),
    city: resolveLocationFromCatalog(normalizedText, listings, (listing) => listing.city),
    neighborhood: resolveLocationFromCatalog(normalizedText, listings, (listing) => listing.neighborhood),
    minPrice,
    maxPrice,
    broadInventoryIntent:
      isBroadInventoryRequest(retrievalText) ||
      hasRealEstateLocationOrFilter(retrievalText) ||
      normalizedText.includes("nao tenho preferencia") ||
      normalizedText.includes("sem preferencia") ||
      normalizedText.includes("me mostre") ||
      normalizedText.includes("me mostra"),
  };
}

function scoreStructuredListingMatch(listing: GrupoOlxListing, criteria: RealEstateSearchCriteria): number {
  let score = 0;

  if (criteria.propertyType && listingMatchesPropertyType(listing, criteria.propertyType)) score += 12;
  if (criteria.city && normalizeText(listing.city) === criteria.city) score += 10;
  if (criteria.neighborhood && normalizeText(listing.neighborhood) === criteria.neighborhood) score += 16;
  if (listingMatchesPriceRange(listing, criteria)) score += 14;

  return score;
}

function formatCurrencyLabel(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatLocationLabel(value: string | null): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return normalized
    .split(" ")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function humanizeCriteria(criteria: RealEstateSearchCriteria): string {
  const parts: string[] = [];

  if (criteria.propertyType === "apartment") parts.push("apartamentos");
  if (criteria.propertyType === "penthouse") parts.push("coberturas");
  if (criteria.propertyType === "house") parts.push("casas");
  if (criteria.neighborhood) parts.push(`em ${formatLocationLabel(criteria.neighborhood)}`);
  else if (criteria.city) parts.push(`em ${formatLocationLabel(criteria.city)}`);

  if (criteria.minPrice != null && criteria.maxPrice != null && criteria.minPrice !== criteria.maxPrice) {
    parts.push(`entre ${formatCurrencyLabel(criteria.minPrice)} e ${formatCurrencyLabel(criteria.maxPrice)}`);
  } else if (criteria.minPrice != null) {
    parts.push(`por ${formatCurrencyLabel(criteria.minPrice)}`);
  }

  return parts.join(" ").trim();
}

function selectStructuredGrupoOlxListings(
  listings: GrupoOlxListing[],
  customerMessage: string,
  limit = 8,
  conversationHistory: RealEstateCatalogContextTurn[] = [],
): RealEstateStructuredSelection {
  const criteria = inferRealEstateSearchCriteria(listings, customerMessage, conversationHistory);
  if (!criteria.broadInventoryIntent) {
    return { matches: [], mode: null, explanation: null };
  }

  const exactMatches = listings
    .filter((listing) => listingMatchesPropertyType(listing, criteria.propertyType))
    .filter((listing) => listingMatchesLocation(listing, criteria))
    .filter((listing) => listingMatchesPriceRange(listing, criteria))
    .map((listing) => ({ listing, score: scoreStructuredListingMatch(listing, criteria) }))
    .sort((a, b) => b.score - a.score || a.listing.title.localeCompare(b.listing.title))
    .slice(0, limit)
    .map(mapListingForAI);

  if (exactMatches.length > 0) {
    return {
      matches: exactMatches,
      mode: "direct",
      explanation: null,
    };
  }

  const relaxedCity =
    criteria.city ||
    (criteria.neighborhood
      ? normalizeText(
          listings.find((listing) => normalizeText(listing.neighborhood) === criteria.neighborhood)?.city,
        )
      : null);

  const alternativeMatches = listings
    .filter((listing) => listingMatchesPropertyType(listing, criteria.propertyType))
    .filter((listing) => listingMatchesPriceRange(listing, criteria))
    .filter((listing) => (relaxedCity ? normalizeText(listing.city) === relaxedCity : true))
    .filter((listing) => (criteria.neighborhood ? normalizeText(listing.neighborhood) !== criteria.neighborhood : true))
    .map((listing) => ({ listing, score: scoreStructuredListingMatch(listing, { ...criteria, neighborhood: null, city: relaxedCity }) }))
    .sort((a, b) => b.score - a.score || a.listing.title.localeCompare(b.listing.title))
    .slice(0, limit)
    .map(mapListingForAI);

  if (alternativeMatches.length > 0) {
    const requestedSummary = humanizeCriteria(criteria);
    const relaxedCityLabel = formatLocationLabel(relaxedCity || criteria.city);
    const explanation = requestedSummary
      ? `Nao encontrei opcoes confirmadas exatamente para ${requestedSummary}, mas encontrei alternativas reais${relaxedCityLabel ? ` em ${relaxedCityLabel}` : ""}.`
      : "Nao encontrei opcoes confirmadas exatamente para esse recorte, mas encontrei alternativas reais no catalogo.";

    return {
      matches: alternativeMatches,
      mode: "alternatives",
      explanation,
    };
  }

  const noMatchSummary = humanizeCriteria(criteria);
  return {
    matches: [],
    mode: "no_match",
    explanation: noMatchSummary
      ? `Nao encontrei imoveis confirmados para ${noMatchSummary} no catalogo atual.`
      : "Nao encontrei imoveis confirmados para esse recorte no catalogo atual.",
  };
}

function tokenizeAddressReference(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => (
      token.length > 1 &&
      !/^\d+$/.test(token) &&
      !STOPWORDS.has(token) &&
      !ADDRESS_STREET_TYPE_STOPWORDS.has(token)
    ));
}

function extractAddressReference(customerMessage: string): AddressReference | null {
  const normalizedMessage = normalizeText(customerMessage);
  if (!normalizedMessage) return null;

  const normalizedTokens = normalizedMessage.split(" ").map((token) => token.trim()).filter(Boolean);
  const numberIndex = normalizedTokens.findIndex((token) => isNumericTextToken(token));
  const numbers = normalizedTokens.filter((token) => isNumericTextToken(token) && token.length <= 6);
  const streetTokenSource = numberIndex > 0
    ? normalizedTokens.slice(0, numberIndex).join(" ")
    : customerMessage;
  const streetTokens = tokenizeAddressReference(streetTokenSource);
  if (numbers.length === 0 || streetTokens.length === 0) {
    return null;
  }

  return {
    streetTokens,
    canonicalStreetTokens: streetTokens.map(canonicalizeAddressToken),
    numbers,
  };
}

function scoreAddressReference(listing: GrupoOlxListing, addressReference: AddressReference | null): number {
  if (!addressReference || !listing.address) return 0;

  const normalizedAddress = normalizeText(listing.address);
  const canonicalAddressTokens = new Set(
    tokenizeAddressReference(listing.address).map(canonicalizeAddressToken),
  );
  const matchedStreetTokens = addressReference.canonicalStreetTokens.filter((token) =>
    canonicalAddressTokens.has(token),
  );
  const streetMatchRatio = addressReference.canonicalStreetTokens.length > 0
    ? matchedStreetTokens.length / addressReference.canonicalStreetTokens.length
    : 0;
  const numberMatches = addressReference.numbers.filter((number) => normalizedAddress.includes(number));

  if (numberMatches.length > 0 && streetMatchRatio === 1) {
    return 80;
  }

  if (numberMatches.length > 0 && streetMatchRatio >= 0.67) {
    return 45;
  }

  if (streetMatchRatio === 1) {
    return 18;
  }

  if (numberMatches.length > 0) {
    return 8;
  }

  return 0;
}

function scoreListing(
  listing: GrupoOlxListing,
  tokens: string[],
  normalizedMessage: string,
  addressReference: AddressReference | null,
): number {
  const searchable = normalizeText(listing.searchableText || "");
  const title = normalizeText(listing.title);
  const codeTokens = new Set(tokenize([listing.listingCode, listing.externalListingId].filter(Boolean).join(" ")));

  let score = scoreAddressReference(listing, addressReference);

  for (const token of tokens) {
    if (codeTokens.has(token)) {
      score += 16;
      continue;
    }
    if (searchable.includes(token)) {
      score += 3;
    }
    if (title.includes(token)) {
      score += 2;
    }
    if (normalizeText(listing.city).includes(token)) {
      score += 2;
    }
    if (normalizeText(listing.neighborhood).includes(token)) {
      score += 4;
    }
  }

  if (listing.listingCode && normalizedMessage.includes(normalizeText(listing.listingCode))) {
    score += 20;
  }

  if (listing.neighborhood && normalizedMessage.includes(normalizeText(listing.neighborhood))) {
    score += 8;
  }

  if (listing.city && normalizedMessage.includes(normalizeText(listing.city))) {
    score += 5;
  }

  return score;
}

function mapListingRecordToAI(
  listing: GrupoOlxListing,
  score: number,
  inventoryStatus: "active_xml" | "conversation_anchor" = listing.isActive ? "active_xml" : "conversation_anchor",
): RealEstateListingForAI {
  return {
    code: listing.listingCode || listing.externalListingId,
    title: listing.title,
    transactionType: listing.transactionType,
    propertyType: listing.propertyType,
    price: listing.price ? Number(listing.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null,
    city: listing.city,
    neighborhood: listing.neighborhood,
    address: listing.address,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    garage: listing.garage,
    livingArea: listing.livingArea ? `${Number(listing.livingArea)} m2` : null,
    detailUrl: listing.detailUrl,
    description: listing.description,
    score,
    inventoryStatus,
  };
}

function mapListingForAI(candidate: ListingScoreCandidate): RealEstateListingForAI {
  return mapListingRecordToAI(candidate.listing, candidate.score);
}

function resolveMostRecentDirectListingMatch(
  listings: GrupoOlxListing[],
  customerMessage: string,
  conversationHistory: RealEstateCatalogContextTurn[] = [],
): RealEstateListingForAI | null {
  const recentTexts = [
    String(customerMessage || "").trim(),
    ...getFocusedConversationHistory(customerMessage, conversationHistory, listings, 6)
      .slice()
      .reverse()
      .map((item) => String(item.content || "").trim()),
  ].filter(Boolean);

  for (const text of recentTexts) {
    const matchedIdentifiers = extractMatchedListingIdentifiers(text, listings);
    if (matchedIdentifiers.size !== 1) {
      continue;
    }

    const [matchedCode] = Array.from(matchedIdentifiers);
    const matchedListing = listings.find((listing) => {
      const listingCode = normalizeText(listing.listingCode);
      const externalListingId = normalizeText(listing.externalListingId);
      return listingCode === matchedCode || externalListingId === matchedCode;
    });

    if (matchedListing) {
      return mapListingRecordToAI(matchedListing, 100);
    }
  }

  return null;
}

function buildRetrievalText(
  customerMessage: string,
  conversationHistory: RealEstateCatalogContextTurn[] = [],
  listings: RealEstateLookupAssessmentListing[] = [],
): string {
  const recentContext = getFocusedConversationHistory(customerMessage, conversationHistory, listings, 6)
    .map((item) => String(item.content || "").trim())
    .filter(Boolean);

  return [customerMessage, ...recentContext].filter(Boolean).join(" ");
}

function isNumericTextToken(token: string): boolean {
  if (!token) return false;

  for (const character of token) {
    if (character < "0" || character > "9") {
      return false;
    }
  }

  return true;
}

function textIncludesAnySnippet(normalizedText: string, snippets: string[]): boolean {
  return snippets.some((snippet) => normalizedText.includes(snippet));
}

function extractNumericTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && isNumericTextToken(token));
}

function normalizeComparableUrl(value: string | null | undefined): string {
  let normalized = String(value || "").trim();
  while (normalized.length > 0) {
    const lastCharacter = normalized[normalized.length - 1];
    if (![".", ",", ";", ")", "]", "}", "\"", "'"].includes(lastCharacter)) {
      break;
    }
    normalized = normalized.slice(0, -1).trimEnd();
  }
  return normalized;
}

function extractConversationAnchorSignals(
  customerMessage: string,
  conversationHistory: RealEstateCatalogContextTurn[] = [],
): ConversationAnchorSignals {
  const rawContext = [
    String(customerMessage || "").trim(),
    ...conversationHistory.slice(-30).map((item) => String(item.content || "").trim()),
  ]
    .filter(Boolean)
    .join("\n");

  const codes = Array.from(
    new Set(
      (rawContext.match(/\b[a-z]{1,4}\d{3,}\b/gi) || []).map((value) => String(value).toUpperCase()),
    ),
  );

  const urls = Array.from(
    new Set(
      (rawContext.match(/https?:\/\/[^\s)>"']+/gi) || [])
        .map((value) => normalizeComparableUrl(value))
        .filter((value) => value.length > 0 && REAL_ESTATE_DETAIL_LINK_PATTERN.test(value)),
    ),
  );

  return { codes, urls };
}

function dedupeListingsByIdentity(listings: GrupoOlxListing[]): GrupoOlxListing[] {
  const seen = new Set<string>();
  const deduped: GrupoOlxListing[] = [];

  for (const listing of listings) {
    const identity = [
      listing.id,
      normalizeText(listing.listingCode),
      normalizeText(listing.externalListingId),
      normalizeComparableUrl(listing.detailUrl),
    ]
      .filter(Boolean)
      .join("|");

    if (!identity || seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    deduped.push(listing);
  }

  return deduped;
}

async function loadConversationAnchoredListings(
  integrationId: string,
  signals: ConversationAnchorSignals,
): Promise<GrupoOlxListing[]> {
  const clauses = [
    ...(signals.codes.length > 0
      ? [
          inArray(grupoOlxListings.listingCode, signals.codes),
          inArray(grupoOlxListings.externalListingId, signals.codes),
        ]
      : []),
    ...(signals.urls.length > 0 ? [inArray(grupoOlxListings.detailUrl, signals.urls)] : []),
  ];

  if (clauses.length === 0) {
    return [];
  }

  return db
    .select()
    .from(grupoOlxListings)
    .where(and(eq(grupoOlxListings.integrationId, integrationId), or(...clauses)!))
    .orderBy(desc(grupoOlxListings.updatedAt))
    .limit(12);
}

function buildKnownListingIdentifierMap(
  listings: RealEstateLookupAssessmentListing[] = [],
): Map<string, ListingIdentifierHit> {
  const identifierMap = new Map<string, ListingIdentifierHit>();

  for (const listing of listings) {
    const codeCandidates = [
      normalizeText(listing.code),
      normalizeText(listing.externalListingId),
    ].filter(Boolean);
    const canonicalCode = codeCandidates[0];
    if (!canonicalCode) {
      continue;
    }

    for (const code of codeCandidates) {
      identifierMap.set(code, {
        code: canonicalCode,
        matchedByUrl: false,
      });
    }

    const detailUrl = normalizeComparableUrl(listing.detailUrl);
    if (detailUrl) {
      identifierMap.set(detailUrl, {
        code: canonicalCode,
        matchedByUrl: true,
      });
    }
  }

  return identifierMap;
}

function extractMatchedListingIdentifiers(
  value: string | null | undefined,
  listings: RealEstateLookupAssessmentListing[] = [],
): Set<string> {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return new Set();
  }

  const lookupTokens = buildLookupTokenSet(rawValue);
  const identifierMap = buildKnownListingIdentifierMap(listings);
  const matches = new Set<string>();

  for (const token of lookupTokens) {
    const match = identifierMap.get(token);
    if (match?.code) {
      matches.add(match.code);
    }
  }

  const comparableRawValue = normalizeComparableUrl(rawValue);
  if (comparableRawValue) {
    for (const [identifier, match] of identifierMap.entries()) {
      if (!match.matchedByUrl) {
        continue;
      }
      if (comparableRawValue.includes(identifier)) {
        matches.add(match.code);
      }
    }
  }

  return matches;
}

function hasIdentifierIntersection(first: Set<string>, second: Set<string>): boolean {
  if (first.size === 0 || second.size === 0) {
    return false;
  }

  for (const value of first) {
    if (second.has(value)) {
      return true;
    }
  }

  return false;
}

function getFocusedConversationHistory(
  customerMessage: string,
  conversationHistory: RealEstateCatalogContextTurn[] = [],
  listings: RealEstateLookupAssessmentListing[] = [],
  limit = 6,
): RealEstateCatalogContextTurn[] {
  const recentTurns = conversationHistory.slice(-limit);
  const turnsWithIdentifiers = conversationHistory.filter((item) =>
    extractMatchedListingIdentifiers(item.content, listings).size > 0,
  );
  const recentIdentifierTurns = turnsWithIdentifiers.slice(-limit);
  const currentIdentifiers = extractMatchedListingIdentifiers(customerMessage, listings);

  if (currentIdentifiers.size === 0) {
    return recentIdentifierTurns.length > 0 ? recentIdentifierTurns : recentTurns;
  }

  const focusedTurns = turnsWithIdentifiers.filter((item) =>
    hasIdentifierIntersection(
      currentIdentifiers,
      extractMatchedListingIdentifiers(item.content, listings),
    ),
  );

  if (focusedTurns.length > 0) {
    return focusedTurns.slice(-limit);
  }

  return recentIdentifierTurns.length > 0 ? recentIdentifierTurns : [];
}

function buildRecentCustomerLookupContext(
  customerMessage: string,
  conversationHistory: RealEstateCatalogContextTurn[] = [],
  listings: RealEstateLookupAssessmentListing[] = [],
): string {
  const recentUserMessages = conversationHistory
    .filter((item) => item.role === "user")
    .slice(-4)
    .map((item) => String(item.content || "").trim())
    .filter(Boolean);

  return [...recentUserMessages, String(customerMessage || "").trim()].filter(Boolean).join(" ");
}

function buildLookupTokenSet(value: string | null | undefined): Set<string> {
  return new Set(tokenize(value));
}

function hasMatchingListingIdentifier(
  contextText: string,
  listings: RealEstateLookupAssessmentListing[] = [],
): boolean {
  return extractMatchedListingIdentifiers(contextText, listings).size > 0;
}

export function assessRealEstatePropertyLookup(params: {
  customerMessage: string;
  conversationHistory?: RealEstateCatalogContextTurn[];
  listings?: RealEstateLookupAssessmentListing[];
}): RealEstatePropertyLookupAssessment {
  const { customerMessage, conversationHistory = [], listings = [] } = params;
  const contextText = buildRecentCustomerLookupContext(customerMessage, conversationHistory, listings);
  const normalizedContext = normalizeText(contextText);

  if (!normalizedContext) {
    return {
      shouldEscalateToHuman: false,
      reason: null,
      hasStreetClues: false,
      hasNumber: false,
      hasResolvableLocation: false,
    };
  }

  const streetTokens = tokenizeAddressReference(contextText);
  const canonicalStreetTokens = streetTokens.map(canonicalizeAddressToken);
  const listingAddressTokens = new Set(
    listings
      .flatMap((listing) => tokenizeAddressReference(listing.address))
      .map(canonicalizeAddressToken),
  );
  const matchedStreetTokens = Array.from(
    new Set(canonicalStreetTokens.filter((token) => listingAddressTokens.has(token))),
  );
  const numericTokens = extractNumericTokens(contextText);
  const hasNumber = numericTokens.length > 0;
  const hasResolvableLocation = Boolean(
    resolveLocationFromCatalog(normalizedContext, listings, (listing) => listing.city) ||
    resolveLocationFromCatalog(normalizedContext, listings, (listing) => listing.neighborhood),
  );
  const hasStreetClues =
    matchedStreetTokens.length >= 2 ||
    (matchedStreetTokens.length >= 1 && hasNumber && hasResolvableLocation);
  const explicitCannotIdentify = textIncludesAnySnippet(normalizedContext, REAL_ESTATE_HUMAN_HANDOFF_PHRASES);
  const hasTrustedListingIdentifier = hasMatchingListingIdentifier(contextText, listings);
  const hasConcreteAddressSignal = hasStreetClues || hasNumber;
  const isPropertyIdentificationAttempt =
    explicitCannotIdentify ||
    hasConcreteAddressSignal ||
    hasTrustedListingIdentifier;

  if (!isPropertyIdentificationAttempt) {
    return {
      shouldEscalateToHuman: false,
      reason: null,
      hasStreetClues,
      hasNumber,
      hasResolvableLocation,
    };
  }

  const hasEnoughToResolve =
    hasTrustedListingIdentifier ||
    (hasStreetClues && hasNumber && hasResolvableLocation);

  if (explicitCannotIdentify && !hasTrustedListingIdentifier) {
    return {
      shouldEscalateToHuman: true,
      reason: "customer_cannot_identify_property",
      hasStreetClues,
      hasNumber,
      hasResolvableLocation,
    };
  }

  if (!hasEnoughToResolve) {
    return {
      shouldEscalateToHuman: true,
      reason: "missing_required_location_data",
      hasStreetClues,
      hasNumber,
      hasResolvableLocation,
    };
  }

  return {
    shouldEscalateToHuman: false,
    reason: null,
    hasStreetClues,
    hasNumber,
    hasResolvableLocation,
  };
}

function rankGrupoOlxListingCandidates(
  listings: GrupoOlxListing[],
  customerMessage: string,
  conversationHistory: RealEstateCatalogContextTurn[] = [],
): ListingScoreCandidate[] {
  const retrievalText = buildRetrievalText(customerMessage, conversationHistory, listings);
  const normalizedMessage = normalizeText(retrievalText);
  const tokens = tokenize(retrievalText);
  const addressReference = extractAddressReference(customerMessage);

  return listings
    .map((listing) => ({
      listing,
      score: scoreListing(listing, tokens, normalizedMessage, addressReference),
    }))
    .sort((a, b) => b.score - a.score || a.listing.title.localeCompare(b.listing.title));
}

async function resolveGrupoOlxListingWithLLM(params: {
  customerMessage: string;
  conversationHistory?: RealEstateCatalogContextTurn[];
  candidates: ListingScoreCandidate[];
}): Promise<RealEstateListingForAI[] | null> {
  void params;
  return null;
}

export function selectRelevantGrupoOlxListings(
  listings: GrupoOlxListing[],
  customerMessage: string,
  limit = 8,
  conversationHistory: RealEstateCatalogContextTurn[] = [],
): RealEstateListingForAI[] {
  const directMatch = resolveMostRecentDirectListingMatch(listings, customerMessage, conversationHistory);
  if (directMatch) {
    return [directMatch];
  }

  const addressReference = extractAddressReference(customerMessage);
  if (addressReference) {
    const scoredByAddress = rankGrupoOlxListingCandidates(listings, customerMessage, conversationHistory);
    const strongAddressMatches = scoredByAddress
      .filter((item) => scoreAddressReference(item.listing, addressReference) >= 45)
      .slice(0, Math.min(limit, 1));

    if (strongAddressMatches.length > 0) {
      return strongAddressMatches.map(mapListingForAI);
    }

    return [];
  }

  const allowFallback = !hasSpecificRealEstateReference(customerMessage) && !addressReference;
  const structuredSelection = selectStructuredGrupoOlxListings(listings, customerMessage, limit, conversationHistory);
  if (structuredSelection.mode) {
    return structuredSelection.matches;
  }
  const scored = rankGrupoOlxListingCandidates(listings, customerMessage, conversationHistory);

  const topMatches = scored.filter((item) => item.score > 0).slice(0, limit);
  const fallbackMatches = scored.slice(0, Math.min(limit, 6));
  return (topMatches.length > 0 ? topMatches : (allowFallback ? fallbackMatches : [])).map(mapListingForAI);
}

function hasSpecificRealEstateReference(customerMessage: string): boolean {
  const rawMessage = String(customerMessage || "");
  const normalizedMessage = normalizeText(customerMessage);
  return (
    Boolean(extractAddressReference(customerMessage)) ||
    REAL_ESTATE_DETAIL_LINK_PATTERN.test(rawMessage) ||
    REAL_ESTATE_LISTING_CODE_PATTERN.test(rawMessage) ||
    /\bcodigo\b|\bcódigo\b/.test(normalizedMessage)
  );
}

function isBroadInventoryRequest(customerMessage: string): boolean {
  return REAL_ESTATE_INVENTORY_REQUEST_PATTERN.test(normalizeText(customerMessage));
}

function hasRealEstateLocationOrFilter(customerMessage: string): boolean {
  return REAL_ESTATE_LOCATION_OR_FILTER_PATTERN.test(normalizeText(customerMessage));
}

function shouldSuppressListingInjection(customerMessage: string): boolean {
  const normalizedMessage = normalizeText(customerMessage);
  if (!normalizedMessage) return false;
  if (hasSpecificRealEstateReference(customerMessage)) return false;
  if (isBroadInventoryRequest(customerMessage)) return false;
  if (hasRealEstateLocationOrFilter(customerMessage)) return false;
  return REAL_ESTATE_GENERIC_OPENING_PATTERN.test(normalizedMessage);
}

function resolveListingInjectionLimit(customerMessage: string): number {
  if (shouldSuppressListingInjection(customerMessage)) {
    return 0;
  }
  if (hasSpecificRealEstateReference(customerMessage)) {
    return 1;
  }
  return 3;
}

export async function getGrupoOlxCatalogForAI(
  userId: string,
  customerMessage: string,
  options?: {
    conversationHistory?: RealEstateCatalogContextTurn[];
  },
): Promise<RealEstateCatalogForAI | null> {
  const [integration] = await db
    .select()
    .from(grupoOlxIntegrations)
    .where(and(eq(grupoOlxIntegrations.userId, userId), eq(grupoOlxIntegrations.active, true)))
    .limit(1);

  if (!integration || !canExposeGrupoOlxCatalogToAi({
    active: integration.active,
    catalogSyncEnabled: integration.catalogSyncEnabled,
    leadEmailSyncEnabled: integration.leadEmailSyncEnabled,
    syncToAi: integration.syncToAi,
    createDealEnabled: integration.createDealEnabled,
  })) {
    return null;
  }

  const activeListings = await db
    .select()
    .from(grupoOlxListings)
    .where(and(eq(grupoOlxListings.integrationId, integration.id), eq(grupoOlxListings.isActive, true)))
    .orderBy(desc(grupoOlxListings.updatedAt))
    .limit(250);

  const anchorSignals = extractConversationAnchorSignals(customerMessage, options?.conversationHistory);
  const anchoredConversationListings = await loadConversationAnchoredListings(integration.id, anchorSignals);
  const lookupListings = dedupeListingsByIdentity([
    ...anchoredConversationListings,
    ...activeListings,
  ]);

  if (lookupListings.length === 0) {
    return null;
  }

  const specialInstructions: string[] = [
    "Se o cliente ainda nao informou codigo, link, rua, numero, bairro ou criterios claros, responda de forma curta e faca apenas uma pergunta objetiva por vez.",
    "Sem pedido explicito por lista de opcoes, nunca mostre mais de 3 imoveis na mesma resposta.",
    "Se o cliente mandar link ou codigo do anuncio, foque somente nesse imovel e nao ofereca lista paralela.",
  ];
  const retrievalText = buildRetrievalText(customerMessage, options?.conversationHistory, lookupListings);
  const propertyLookupAssessment = assessRealEstatePropertyLookup({
    customerMessage,
    conversationHistory: options?.conversationHistory,
    listings: lookupListings,
  });
  const directResolvedListing = resolveMostRecentDirectListingMatch(
    lookupListings,
    customerMessage,
    options?.conversationHistory,
  );
  const addressReference = extractAddressReference(customerMessage);
  const rankedCandidates = rankGrupoOlxListingCandidates(
    lookupListings,
    customerMessage,
    options?.conversationHistory,
  );
  const listingLimit = resolveListingInjectionLimit(customerMessage);
  const structuredSelection = selectStructuredGrupoOlxListings(
    lookupListings,
    customerMessage,
    listingLimit > 0 ? listingLimit : 3,
    options?.conversationHistory,
  );
  let finalMatches = listingLimit > 0
    ? (
        directResolvedListing
          ? [directResolvedListing]
          : (
              structuredSelection.mode
                ? structuredSelection.matches
                : selectRelevantGrupoOlxListings(lookupListings, customerMessage, listingLimit, options?.conversationHistory)
            )
      )
    : [];

  const shouldUseLlmResolver = rankedCandidates.length > 0 && (
    Boolean(addressReference) ||
    hasSpecificRealEstateReference(customerMessage)
  );

  if (listingLimit > 0 && shouldUseLlmResolver) {
    const llmResolvedMatches = await resolveGrupoOlxListingWithLLM({
      customerMessage,
      conversationHistory: options?.conversationHistory,
      candidates: rankedCandidates,
    });

    if (llmResolvedMatches) {
      finalMatches = llmResolvedMatches.slice(0, listingLimit);
    }
  }

  const anchoredConversationCodes = new Set(
    anchoredConversationListings
      .filter((listing) => !listing.isActive)
      .map((listing) => normalizeText(listing.listingCode || listing.externalListingId))
      .filter(Boolean),
  );

  if (propertyLookupAssessment.shouldEscalateToHuman) {
    finalMatches = [];
    specialInstructions.push(
      propertyLookupAssessment.reason === "customer_cannot_identify_property"
        ? "O cliente deixou claro que nao consegue visualizar ou identificar o imovel com seguranca."
        : "O cliente ainda nao informou rua, numero e cidade suficientes para identificar um anuncio com seguranca.",
      "Para evitar indicar o imovel errado, nao invente endereco, nao ofereca outras opcoes, nao peca foto, nao peca fachada, nao peca placa e nao use ponto de referencia para adivinhar o anuncio.",
      "Responda de forma curta dizendo que vai encaminhar o atendimento para um corretor humano da equipe continuar a identificacao correta do imovel.",
    );
  }

  if (addressReference && finalMatches.length === 0) {
    specialInstructions.push(
      "O cliente informou rua e numero, mas nenhum imovel do catalogo bateu com seguranca. Nao invente outro apartamento.",
      "Nessa situacao, diga claramente que ainda nao conseguiu confirmar esse endereco exato no catalogo e peca a cidade junto com bairro ou ponto de referencia.",
    );
  } else if (addressReference && finalMatches.length > 0) {
    specialInstructions.push(
      "O cliente informou rua e numero e voce encontrou um match forte. Ao responder, cite o endereco confirmado do imovel antes dos detalhes para deixar claro que e o anuncio certo.",
    );
  }

  if (finalMatches.length === 1 && hasSpecificRealEstateReference(retrievalText)) {
    specialInstructions.push(
      "O cliente ja trouxe identificadores fortes do anuncio no contexto recente, como codigo, link ou endereco. Trate o imovel confirmado acima como o anuncio certo e responda diretamente com os dados desse imovel.",
      "Nao encaminhe para corretor humano nem diga que faltam dados se o imovel confirmado acima ja estiver coerente com o codigo, link ou endereco informado pelo cliente.",
    );
  }

  const anchoredConversationMatch = finalMatches.find((listing) =>
    anchoredConversationCodes.has(normalizeText(listing.code)),
  );

  if (anchoredConversationMatch) {
    specialInstructions.push(
      "O imovel confirmado acima veio ancorado pelo proprio historico da conversa ou pelo lead original, mesmo fora do inventario ativo atual.",
      "Nao troque esse anuncio por outro imovel do mesmo bairro, faixa ou perfil sem o cliente pedir alternativas de forma explicita.",
      "Use somente os dados confirmados do anuncio ancorado. Se faltarem disponibilidade atual ou algum detalhe nao mostrado acima, diga que vai confirmar a atualizacao sem inventar.",
    );
  }

  if (listingLimit === 0) {
    specialInstructions.push(
      "Esta mensagem parece ser a abordagem inicial de alguem interessado em um imovel sem identificar qual anuncio e. Na primeira resposta, use no maximo 2 frases curtas e 1 pergunta.",
      "Nao liste imoveis, nao envie links, nao peca foto, nao fale de placa e nao peca codigo nessa abertura.",
      "Peca diretamente o nome da rua, o numero do imovel e a cidade. Se o cliente disser que nao consegue ver esses dados ou continuar sem eles, diga que vai encaminhar para um corretor humano continuar a identificacao correta do imovel.",
    );
  }

  if (!directResolvedListing && structuredSelection.mode === "alternatives" && structuredSelection.explanation) {
    specialInstructions.push(
      structuredSelection.explanation,
      "Deixe claro que estas opcoes sao alternativas reais do catalogo para o mesmo perfil/faixa, e nao anuncios no bairro exato que o cliente pediu.",
    );
  }

  if (!directResolvedListing && structuredSelection.mode === "no_match" && structuredSelection.explanation) {
    specialInstructions.push(
      structuredSelection.explanation,
      "Se o cliente quiser continuar, ofereca somente ampliar faixa de valor, cidade, bairro ou tipo do imovel. Nao invente opcoes.",
    );
  }

  const normalizedCustomerMessage = normalizeText(customerMessage);
  const isLinkRequest =
    normalizedCustomerMessage.includes("link") ||
    normalizedCustomerMessage.includes("anuncio") ||
    normalizedCustomerMessage.includes("site") ||
    normalizedCustomerMessage.includes("url");

  if (isLinkRequest) {
    if (finalMatches.length === 1 && finalMatches[0].detailUrl) {
      specialInstructions.push(
        "O cliente pediu o link do anuncio. Copie exatamente o Link confirmado do imovel acima, sem adaptar, resumir ou montar outra URL.",
        "Quando enviar a URL do anuncio, devolva o link em texto puro, sem markdown, sem colchetes e sem parenteses.",
      );
    } else {
      specialInstructions.push(
        "Se o cliente pedir link mas nenhum Link confirmado aparecer acima, diga que vai confirmar o anuncio certo antes de enviar a URL. Nunca invente ou monte um link.",
      );
    }
  }

  const effectiveSelectionMode =
    directResolvedListing
      ? "direct"
      : structuredSelection.mode === "alternatives" && finalMatches.length > 0
      ? "alternatives"
      : finalMatches.length > 0
        ? "direct"
        : (structuredSelection.mode || "no_match");
  const effectiveSelectionExplanation =
    effectiveSelectionMode === "direct"
      ? null
      : structuredSelection.explanation;

  return {
    active: true,
    totalCount: activeListings.length,
    retrievedCount: finalMatches.length,
    feedUrl: integration.xmlFeedUrl,
    listings: finalMatches,
    inventoryListings: activeListings.map((listing) => mapListingRecordToAI(listing, 0, "active_xml")),
    specialInstructions,
    requiresPropertyIdentificationFirst: listingLimit === 0,
    selectionMode: effectiveSelectionMode,
    selectionExplanation: effectiveSelectionExplanation,
  };
}

export function generateGrupoOlxCatalogPromptBlock(catalog: RealEstateCatalogForAI): string {
  const inventoryListings = (catalog.inventoryListings?.length ? catalog.inventoryListings : catalog.listings) || [];
  if (!catalog.listings.length && !inventoryListings.length && catalog.specialInstructions.length === 0) return "";

  const listingsText = catalog.listings.length > 0
    ? catalog.listings
      .map((listing) => {
        const attributes = [
          listing.transactionType,
          listing.propertyType,
          listing.city,
          listing.neighborhood,
          listing.bedrooms ? `${listing.bedrooms} dorm` : null,
          listing.bathrooms ? `${listing.bathrooms} banheiros` : null,
          listing.garage ? `${listing.garage} vagas` : null,
          listing.livingArea,
        ]
          .filter(Boolean)
          .join(" | ");

        return [
          `- Codigo: ${listing.code}`,
          `  Titulo: ${listing.title}`,
          attributes ? `  Perfil: ${attributes}` : null,
          listing.address ? `  Endereco: ${listing.address}` : null,
          listing.inventoryStatus === "conversation_anchor"
            ? "  Contexto: anuncio ancorado na conversa/lead. Nao troque por outro imovel sem pedido explicito."
            : "  Estoque: ativo na ultima sincronizacao do XML",
          listing.price ? `  Preco: ${listing.price}` : null,
          listing.detailUrl ? `  Link confirmado: ${listing.detailUrl}` : null,
          listing.description ? `  Resumo: ${listing.description.slice(0, 240)}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n")
    : "- Nenhum imovel foi separado como principal para esta mensagem ainda. Use o inventario sincronizado completo abaixo antes de dizer que faltam dados.";
  const inventoryText = inventoryListings.length > 0
    ? inventoryListings
      .map((listing) => {
        const compactParts = [
          `Codigo: ${listing.code}`,
          listing.title ? `Titulo: ${listing.title}` : null,
          listing.address ? `Endereco: ${listing.address}` : null,
          listing.neighborhood ? `Bairro: ${listing.neighborhood}` : null,
          listing.city ? `Cidade: ${listing.city}` : null,
          listing.price ? `Preco: ${listing.price}` : null,
          listing.detailUrl ? `Link: ${listing.detailUrl}` : null,
        ].filter(Boolean);

        return `- ${compactParts.join(" | ")}`;
      })
      .join("\n")
    : "- Inventario sincronizado indisponivel nesta mensagem.";

  const hasConversationAnchoredListing = catalog.listings.some((listing) => listing.inventoryStatus === "conversation_anchor");
  const specialRulesText = catalog.specialInstructions.length > 0
    ? `\n${catalog.specialInstructions.map((instruction, index) => `${index + 6}. ${instruction}`).join("\n")}`
    : "";

  return `
======================================================================
IMOBILIARIA - CATALOGO DE IMOVEIS (${catalog.totalCount} ativos)
======================================================================

Esta ferramenta esta ativa para o cliente.
  Use somente dados confirmados do catalogo. Se faltar confirmacao, admita que vai validar antes de responder com valor ou disponibilidade.
  ${hasConversationAnchoredListing ? "Quando houver anuncio ancorado pela conversa/lead, ele tem prioridade total sobre alternativas do inventario ativo." : ""}

Estes sao os imoveis mais relevantes para a mensagem atual do cliente.
Se o cliente pedir disponibilidade, detalhes, bairro, codigo, perfil do imovel ou comparacao, use primeiro esta base.

${listingsText}

INVENTARIO SINCRONIZADO COMPLETO:
Use esta base como segundo contexto fixo do modo imobiliaria.
Quando o cliente citar codigo, link, rua, numero, bairro ou cidade, confira primeiro neste inventario antes de dizer que faltam dados.

${inventoryText}

REGRAS PARA O CATALOGO IMOBILIARIO:
  1. Se um imovel aparece acima, trate o status descrito logo abaixo dele como a fonte de verdade para esta resposta.
2. Se o cliente citar codigo, bairro ou cidade, priorize o imovel correspondente.
3. Se um anuncio puder ser resolvido por codigo, link ou endereco coerente com o inventario sincronizado completo, trate esse imovel como confirmado e responda com os dados dele.
4. Se nenhum imovel listado bater com o pedido, diga que vai confirmar outras opcoes do catalogo em vez de inventar.
5. Nunca invente preco, metragem, vagas, dormitorios ou link. Se algum dado nao vier acima, diga que vai confirmar o detalhe atualizado.
6. Se houver "Link confirmado" acima e o cliente pedir a URL, copie exatamente esse campo em texto puro e nada diferente.
7. Em follow-up, nao passe valor de imovel sem confirmacao explicita no catalogo ou no historico da conversa.${specialRulesText}

======================================================================
`.trim();
}

export async function getGrupoOlxListingsPreview(integrationId: string, limit = 8): Promise<GrupoOlxListing[]> {
  return db
    .select()
    .from(grupoOlxListings)
    .where(and(eq(grupoOlxListings.integrationId, integrationId), eq(grupoOlxListings.isActive, true)))
    .orderBy(desc(grupoOlxListings.updatedAt))
    .limit(limit);
}

export async function getPaginatedGrupoOlxListings(
  integrationId: string,
  options?: {
    page?: number;
    pageSize?: number;
  },
): Promise<PaginatedGrupoOlxListingsResult> {
  const pageSize = Math.min(Math.max(options?.pageSize ?? 6, 1), 24);
  const requestedPage = Math.max(options?.page ?? 1, 1);

  const activeListings = await db
    .select()
    .from(grupoOlxListings)
    .where(and(eq(grupoOlxListings.integrationId, integrationId), eq(grupoOlxListings.isActive, true)))
    .orderBy(desc(grupoOlxListings.updatedAt), desc(grupoOlxListings.createdAt));

  const total = activeListings.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    items: activeListings.slice(startIndex, startIndex + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}
