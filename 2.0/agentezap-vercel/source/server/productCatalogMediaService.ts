import { extractFirstJsonObject } from "./blogUtils";
import {
  isMauricioMfcCatalogTenant,
  looksLikeMauricioMfcGenericCatalogPhotoContinuation,
} from "./mauricioMfcCatalogModule";

export interface CatalogProductMediaCandidate {
  id: string;
  storageUrl: string;
  caption?: string | null;
  variationCode?: number | null;
  variationName?: string | null;
  variationPrice?: string | null;
  variationStock?: number | null;
  variationIsActive?: boolean;
  displayOrder?: number | null;
}

export interface CatalogProductCandidate {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  price?: string | null;
  imageVariationsEnabled?: boolean;
  images?: CatalogProductMediaCandidate[];
}

export interface CatalogProductImageSelectionInput {
  userId?: string | null;
  clientMessage: string;
  assistantResponse: string;
  conversationHistory: Array<{ fromMe?: boolean; text?: string | null }>;
  products: CatalogProductCandidate[];
}

export interface CatalogMediaRequestContextMessage {
  fromMe?: boolean;
  text?: string | null;
  timestamp?: string | Date | null;
}

export interface CatalogProductImageSelection {
  shouldSend: boolean;
  productId: string | null;
  productIds?: string[];
  confidence: number;
  reason: string;
}

export interface CatalogProductImageSelectionDeps {
  completeChat?: (params: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    maxTokens?: number;
    temperature?: number;
  }) => Promise<{ choices?: Array<{ message?: { content?: unknown } }> }>;
}

export interface CatalogProductResponseRewriteInput {
  assistantResponse: string;
  productName?: string;
  productLabel?: string;
  imageCount: number;
}

const PRODUCT_IMAGE_MEDIA_PREFIX = "CATALOG_PRODUCT_IMAGE";

export function buildCatalogProductImageMediaName(productId: string, mediaId?: string | null): string {
  const suffix = String(mediaId || "legacy").trim() || "legacy";
  return `${PRODUCT_IMAGE_MEDIA_PREFIX}:${productId}:${suffix}`;
}

function getCatalogContextTimestampMs(message: CatalogMediaRequestContextMessage): number | null {
  const raw = message?.timestamp;
  if (!raw) return null;
  const parsed = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildCatalogMediaRequestContext(params: {
  clientMessage: string | null | undefined;
  conversationHistory: CatalogMediaRequestContextMessage[];
  maxMessages?: number;
  windowMs?: number;
}): string {
  const currentText = String(params.clientMessage || "").trim();
  const history = Array.isArray(params.conversationHistory) ? params.conversationHistory : [];
  const maxMessages = Math.max(1, Math.min(10, params.maxMessages ?? 6));
  const windowMs = Math.max(30_000, params.windowMs ?? 10 * 60_000);

  let latestInboundMs: number | null = null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message || message.fromMe) continue;
    latestInboundMs = getCatalogContextTimestampMs(message);
    break;
  }

  const recentInbound: string[] = [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) continue;
    if (message.fromMe) break;

    const text = String(message.text || "").trim();
    if (!text) continue;

    if (latestInboundMs !== null) {
      const messageMs = getCatalogContextTimestampMs(message);
      if (messageMs !== null && latestInboundMs - messageMs > windowMs) {
        break;
      }
    }

    recentInbound.push(text);
    if (recentInbound.length >= maxMessages) break;
  }

  const orderedInbound = recentInbound.reverse();
  const normalizedCurrent = normalizeCatalogRequestText(currentText);
  const coveredByCurrent = orderedInbound.filter((text) => {
    const normalized = normalizeCatalogRequestText(text);
    return normalized && normalizedCurrent.includes(normalized);
  }).length;

  if (currentText && orderedInbound.length > 1 && coveredByCurrent >= Math.min(2, orderedInbound.length)) {
    return truncateText(currentText, 2000);
  }

  const pieces: string[] = [];
  const seen = new Set<string>();
  const addPiece = (value: string) => {
    const text = String(value || "").trim();
    const key = normalizeCatalogRequestText(text);
    if (!text || !key || seen.has(key)) return;
    seen.add(key);
    pieces.push(text);
  };

  orderedInbound.forEach(addPiece);
  addPiece(currentText);

  return truncateText(pieces.join("\n\n"), 2000);
}

function truncateText(value: string | null | undefined, maxLength: number): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function detectMediaSendingIntent(value: string): boolean {
  const text = normalizeCatalogRequestText(value);
  if (!text) return false;
  return /\b(?:vou|ja|j[aá]|segue|seguem|envio|enviei|mando|mandei|mostro|mostrar|anexo|anexei|abaixo)\b.{0,80}\b(?:foto|fotos|imagem|imagens|video|audio|pdf|catalogo|arquivo|material)\b/.test(text) ||
    /\b(?:foto|fotos|imagem|imagens|video|audio|pdf|catalogo|arquivo|material)\b.{0,80}\b(?:segue|seguem|abaixo|anexo|anexado|enviado|enviadas?)\b/.test(text);
}

function normalizeCatalogConsistencyText(value: string | null | undefined): string {
  return normalizeCatalogRequestText(value);
}

function normalizeCatalogRequestText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function includesAnyCatalogFragment(text: string, fragments: string[]): boolean {
  return fragments.some((fragment) => text.includes(fragment));
}

function countNumericTokens(text: string): number {
  let count = 0;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char < "0" || char > "9") {
      index += 1;
      continue;
    }

    count += 1;
    while (index < text.length) {
      const digitChar = text[index];
      if (digitChar < "0" || digitChar > "9") {
        break;
      }
      index += 1;
    }
  }

  return count;
}

function looksLikeCompactCatalogCodeSelection(normalizedClientMessage: string): boolean {
  if (!normalizedClientMessage) {
    return false;
  }

  const hasSelectionVerb = includesAnyCatalogFragment(normalizedClientMessage, [
    "quero ",
    "vou querer",
    "pode ser",
    "separa",
    "separe",
    "inclui",
    "inclua",
  ]);

  return hasSelectionVerb && countNumericTokens(normalizedClientMessage) >= 2;
}

function isDetailedCatalogChoiceMessage(normalizedClientMessage: string): boolean {
  return includesAnyCatalogFragment(normalizedClientMessage, [
    "quero esse",
    "quero este",
    "quero o codigo",
    "quero os codigos",
    "quero o cod",
    "quero os cod",
    "codigo ",
    "codigos ",
    "codigos:",
    "cod ",
    "quantidade",
    "costurado",
    "sem costura",
    "orcamento",
    "pedido",
    "pix",
    "cartao",
    "dinheiro",
    "link de pagamento",
    "finalizar",
    "finalizacao",
  ]) || looksLikeCompactCatalogCodeSelection(normalizedClientMessage);
}

function isExplicitCatalogPhotoRequest(normalizedClientMessage: string): boolean {
  return includesAnyCatalogFragment(normalizedClientMessage, [
    "manda foto",
    "manda a foto",
    "manda as fotos",
    "me manda foto",
    "me manda a foto",
    "me manda as fotos",
    "envia foto",
    "envia a foto",
    "envia as fotos",
    "me envia foto",
    "me envia a foto",
    "me envia as fotos",
    "mostra foto",
    "mostra a foto",
    "mostra as fotos",
    "me mostra foto",
    "me mostra a foto",
    "me mostra as fotos",
    "quero ver foto",
    "quero ver as fotos",
    "fotos do tema",
    "foto do tema",
    "foto do codigo",
    "foto do cod",
    "imagem do codigo",
    "imagem do cod",
  ]);
}

function isCatalogLocationOrVisitRequest(normalizedClientMessage: string): boolean {
  if (!normalizedClientMessage) {
    return false;
  }

  return includesAnyCatalogFragment(normalizedClientMessage, [
    "endereco",
    "localizacao",
    "como chegar",
    "onde fica",
    "mapa",
    "horario presencial",
    "atendimento presencial",
    "visita",
    "visitar",
    "ir ver",
    "ver uma tenda",
    "ver a tenda",
    "ver no local",
    "ver pessoalmente",
    "ver na loja",
    "loja fisica",
  ]);
}

function isCatalogTechnicalInfoRequest(normalizedClientMessage: string): boolean {
  if (!normalizedClientMessage) return false;
  if (isExplicitCatalogPhotoRequest(normalizedClientMessage)) return false;

  return includesAnyCatalogFragment(normalizedClientMessage, [
    "qual ",
    "quais ",
    "quanto ",
    "quantos ",
    "vazao",
    "vasao",
    "potencia",
    "consumo",
    "ruido",
    "barulho",
    " db",
    "decibeis",
    "medida",
    "medidas",
    "dimensao",
    "dimensoes",
    "altura",
    "largura",
    "profundidade",
    "alcance",
    "ficha",
    "tecnico",
    "tecnicos",
    "tecnica",
    "tecnicas",
    "dados",
    "especificacao",
    "especificacoes",
    "detalhe",
    "detalhes",
    "descricao",
    "descreve",
    "informacao",
    "informacoes",
    "caracteristica",
    "caracteristicas",
    "voltagem",
  ]);
}

function isCatalogTransactionalReply(normalizedAssistantResponse: string): boolean {
  return includesAnyCatalogFragment(normalizedAssistantResponse, [
    "carrinho do pedido",
    "total geral",
    "subtotal",
    "forma de pagamento",
    "qual sera a forma de pagamento",
    "esta tudo certo com seu pedido",
    "posso seguir para a finalizacao",
    "vou organizar o seu pedido",
    "vou organizar o item no seu orcamento",
    "deseja orcamento de mais algum item",
  ]);
}

function looksLikeCatalogListingReply(normalizedAssistantResponse: string): boolean {
  const hasCode = includesAnyCatalogFragment(normalizedAssistantResponse, [
    "codigo:",
    "codigo ",
    "cod:",
    "cod ",
  ]);
  const hasPrice = includesAnyCatalogFragment(normalizedAssistantResponse, [
    "valor:",
    "valor ",
    "preco:",
    "preco ",
    "r$",
  ]);
  return hasCode && hasPrice;
}

function looksLikeImmediateCatalogPhotoReply(normalizedAssistantResponse: string): boolean {
  if (!normalizedAssistantResponse) {
    return false;
  }

  if (normalizedAssistantResponse.includes("[foto")) {
    return true;
  }

  return includesAnyCatalogFragment(normalizedAssistantResponse, [
    "aqui estao as fotos",
    "aqui estao os produtos",
    "seguem as fotos",
    "segue as fotos",
    "enviei as fotos",
    "ja enviei as fotos",
    "pronto enviei as fotos",
    "estou enviando as fotos",
    "to enviando as fotos",
    "vou te mostrar as fotos",
    "vou mostrar as fotos",
    "fotos do tema",
    "fotos para voce conferir",
  ]);
}

export function shouldAttachCatalogMediaForReply(params: {
  clientMessage: string;
  assistantResponse: string;
  allowExplicitResend?: boolean;
}): boolean {
  if (params.allowExplicitResend) {
    return true;
  }

  const assistantResponse = String(params.assistantResponse || "").trim();
  if (!assistantResponse) {
    return false;
  }

  const normalizedClientMessage = normalizeCatalogRequestText(params.clientMessage);
  const isDetailedChoice = isDetailedCatalogChoiceMessage(normalizedClientMessage);
  const explicitPhotoRequest = isExplicitCatalogPhotoRequest(normalizedClientMessage);

  if (isCatalogLocationOrVisitRequest(normalizedClientMessage) && !explicitPhotoRequest) {
    return false;
  }

  if (isDetailedChoice && !explicitPhotoRequest) {
    return false;
  }

  if (detectMediaSendingIntent(assistantResponse)) {
    return true;
  }

  const normalizedAssistantResponse = normalizeCatalogRequestText(assistantResponse);
  if (looksLikeImmediateCatalogPhotoReply(normalizedAssistantResponse)) {
    return true;
  }

  if (!looksLikeCatalogListingReply(normalizedAssistantResponse)) {
    return false;
  }

  if (isCatalogTransactionalReply(normalizedAssistantResponse)) {
    return false;
  }

  return true;
}

export function shouldForceCatalogMediaForKnownSubject(params: {
  clientMessage: string;
  products: CatalogProductCandidate[];
}): boolean {
  const normalizedClientMessage = normalizeCatalogRequestText(params.clientMessage);
  const products = params.products || [];

  if (!normalizedClientMessage || products.length === 0) {
    return false;
  }

  if (isOperationalCatalogFollowUp(params.clientMessage)) {
    return false;
  }

  if (isCatalogTechnicalInfoRequest(normalizedClientMessage)) {
    return false;
  }

  const explicitPhotoRequest = isExplicitCatalogPhotoRequest(normalizedClientMessage);
  const isDetailedChoice = isDetailedCatalogChoiceMessage(normalizedClientMessage);
  if (isCatalogLocationOrVisitRequest(normalizedClientMessage) && !explicitPhotoRequest) {
    return false;
  }

  if (isDetailedChoice && !explicitPhotoRequest) {
    return false;
  }

  if (isCatalogSwitchRequestWithoutKnownSubject(params.clientMessage, products)) {
    return false;
  }

  if (!messageReferencesKnownCatalogSubject(params.clientMessage, products)) {
    return false;
  }

  const catalogInquirySignals = [
    "tem ",
    "temos ",
    "voces tem",
    "voce tem",
    "trabalha",
    "faz ",
    "tema",
    "catalogo",
    "foto",
    "fotos",
    "imagem",
    "imagens",
    "painel",
    "cilindro",
    "cilindros",
    "capa",
    "me mostra",
    "mostra",
    "me manda",
    "manda",
    "me envia",
    "envia",
    "quero ver",
  ];

  return catalogInquirySignals.some((signal) => normalizedClientMessage.includes(signal));
}

function listCatalogAnchorTerms(product: CatalogProductCandidate): string[] {
  const stopTerms = new Set([
    "de",
    "do",
    "da",
    "das",
    "dos",
    "e",
    "tema",
    "catalogo",
    "fotos",
    "foto",
    "painel",
    "paineis",
    "arte",
    "artes",
    "kit",
    "kits",
    "cilindro",
    "cilindros",
    "lateral",
    "laterais",
    "com",
    "sem",
    "para",
  ]);

  const rawTerms = [
    normalizeCatalogRequestText(product.name),
    normalizeCatalogRequestText(product.category),
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(" "));

  const uniqueTerms = new Set<string>();
  for (const term of rawTerms) {
    const cleanTerm = String(term || "").trim();
    if (!cleanTerm || ((cleanTerm.length < 4 && !/^\d{2,4}$/.test(cleanTerm)) || stopTerms.has(cleanTerm))) {
      continue;
    }
    uniqueTerms.add(cleanTerm);
  }

  return Array.from(uniqueTerms);
}

function buildUniqueCatalogAnchorTerms(products: CatalogProductCandidate[]): Map<string, string[]> {
  const productTerms = new Map<string, string[]>();
  const ownership = new Map<string, Set<string>>();

  for (const product of products) {
    const terms = listCatalogAnchorTerms(product);
    productTerms.set(product.id, terms);
    for (const term of terms) {
      if (!ownership.has(term)) {
        ownership.set(term, new Set());
      }
      ownership.get(term)!.add(product.id);
    }
  }

  const uniqueTermsByProduct = new Map<string, string[]>();
  for (const product of products) {
    uniqueTermsByProduct.set(
      product.id,
      (productTerms.get(product.id) || []).filter((term) => ownership.get(term)?.size === 1),
    );
  }

  return uniqueTermsByProduct;
}

function hasCatalogCodeLabelBefore(text: string, digitStart: number): boolean {
  const before = text.slice(Math.max(0, digitStart - 24), digitStart).toLowerCase();
  const labels = ["codigo", "código", "cod", "cód"];
  return labels.some((label) => before.includes(label));
}

function extractKnownCatalogVariationCodes(
  value: string | null | undefined,
  knownCodes: Set<number>,
): number[] {
  const text = String(value || "");
  if (!text || knownCodes.size === 0) {
    return [];
  }

  const codes: number[] = [];
  const seen = new Set<number>();
  let index = 0;
  let listContextBudget = 0;

  while (index < text.length) {
    const current = text[index];

    if (current === "\n" || current === "\r" || current === "." || current === ";" || current === ":") {
      listContextBudget = 0;
      index += 1;
      continue;
    }

    if (
      (current === "c" || current === "C") &&
      text.slice(index, index + 7).toLowerCase().startsWith("codigo")
    ) {
      listContextBudget = 16;
      index += 6;
      continue;
    }

    if ((current === "c" || current === "C") && text.slice(index, index + 3).toLowerCase().startsWith("cod")) {
      listContextBudget = 16;
      index += 3;
      continue;
    }

    if (current < "0" || current > "9") {
      if (listContextBudget > 0 && current !== "," && current !== " " && current !== "\t" && current !== "e") {
        listContextBudget = Math.max(0, listContextBudget - 1);
      }
      index += 1;
      continue;
    }

    const digitStart = index;
    let digits = "";
    while (index < text.length) {
      const digit = text[index];
      if (digit < "0" || digit > "9") break;
      digits += digit;
      index += 1;
    }

    const parsed = Number(digits);
    const hasDirectLabel = hasCatalogCodeLabelBefore(text, digitStart);
    const inListContext = listContextBudget > 0;

    if (Number.isInteger(parsed) && knownCodes.has(parsed) && !seen.has(parsed) && (hasDirectLabel || inListContext)) {
      seen.add(parsed);
      codes.push(parsed);
    }

    if (inListContext) {
      listContextBudget = Math.max(0, listContextBudget - 1);
    }
  }

  return codes;
}

function collectReferencedProductIdsFromText(
  value: string | null | undefined,
  products: CatalogProductCandidate[],
): string[] {
  const normalizedValue = normalizeCatalogRequestText(value);
  if (!normalizedValue) {
    return [];
  }

  const uniqueTermsByProduct = buildUniqueCatalogAnchorTerms(products);

  return products
    .filter((product) => {
      const fullName = normalizeCatalogRequestText(product.name);
      if (fullName && normalizedValue.includes(fullName)) {
        return true;
      }

      return (uniqueTermsByProduct.get(product.id) || []).some((term) => normalizedValue.includes(term));
    })
    .map((product) => product.id);
}

function inferMauricioMfcRecentCustomerCatalogProductIds(
  input: CatalogProductImageSelectionInput,
  products: CatalogProductCandidate[],
  codesByProductId: Map<number, string>,
  knownCodes: Set<number>,
): string[] {
  if (
    !isMauricioMfcCatalogTenant({ userId: input.userId }) ||
    !looksLikeMauricioMfcGenericCatalogPhotoContinuation(input.clientMessage)
  ) {
    return [];
  }

  const currentKey = normalizeCatalogRequestText(input.clientMessage);
  const entries = Array.isArray(input.conversationHistory) ? input.conversationHistory : [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || entry.fromMe) continue;

    const text = String(entry.text || "").trim();
    const key = normalizeCatalogRequestText(text);
    if (!text || !key || key === currentKey) continue;

    const codes = extractKnownCatalogVariationCodes(text, knownCodes);
    if (codes.length > 0) {
      const ids = Array.from(
        new Set(
          codes
            .map((code) => codesByProductId.get(code))
            .filter((productId): productId is string => Boolean(productId)),
        ),
      );
      if (ids.length > 0) return ids;
    }

    const productIds = collectReferencedProductIdsFromText(text, products);
    if (productIds.length > 0) {
      return Array.from(new Set(productIds));
    }
  }

  return [];
}

function inferCatalogProductIdsFromContext(
  input: CatalogProductImageSelectionInput,
  products: CatalogProductCandidate[],
): string[] {
  const codesByProductId = new Map<number, string>();
  for (const product of products) {
    for (const image of product.images || []) {
      if (typeof image.variationCode === "number" && Number.isFinite(image.variationCode)) {
        codesByProductId.set(image.variationCode, product.id);
      }
    }
  }

  const knownCodes = new Set(codesByProductId.keys());
  const currentMessageCodes = extractKnownCatalogVariationCodes(input.clientMessage, knownCodes);
  if (currentMessageCodes.length > 0) {
    return Array.from(
      new Set(
        currentMessageCodes
          .map((code) => codesByProductId.get(code))
          .filter((productId): productId is string => Boolean(productId)),
      ),
    );
  }

  const currentMessageProductIds = collectReferencedProductIdsFromText(input.clientMessage, products);
  if (currentMessageProductIds.length > 0) {
    return Array.from(new Set(currentMessageProductIds));
  }

  const mauricioMfcCustomerAnchoredIds = inferMauricioMfcRecentCustomerCatalogProductIds(
    input,
    products,
    codesByProductId,
    knownCodes,
  );
  if (mauricioMfcCustomerAnchoredIds.length > 0) {
    return mauricioMfcCustomerAnchoredIds;
  }

  const ignoreAssistantCatalogInference =
    isMauricioMfcCatalogTenant({ userId: input.userId }) &&
    looksLikeMauricioMfcGenericCatalogPhotoContinuation(input.clientMessage);

  if (!ignoreAssistantCatalogInference) {
    const assistantResponseCodes = extractKnownCatalogVariationCodes(input.assistantResponse, knownCodes);
    if (assistantResponseCodes.length > 0) {
      return Array.from(
        new Set(
          assistantResponseCodes
            .map((code) => codesByProductId.get(code))
            .filter((productId): productId is string => Boolean(productId)),
        ),
      );
    }

    if (
      detectMediaSendingIntent(input.assistantResponse) ||
      looksLikeImmediateCatalogPhotoReply(normalizeCatalogRequestText(input.assistantResponse)) ||
      looksLikeCatalogListingReply(normalizeCatalogRequestText(input.assistantResponse))
    ) {
      const assistantResponseProductIds = collectReferencedProductIdsFromText(input.assistantResponse, products);
      if (assistantResponseProductIds.length > 0) {
        return Array.from(new Set(assistantResponseProductIds));
      }
    }
  }

  const recentInboundHistory = (input.conversationHistory || [])
    .slice(-20)
    .filter((message) => !message.fromMe)
    .map((message) => String(message.text || "").trim())
    .filter(Boolean);

  if (isExplicitCatalogMediaResendRequest(input.clientMessage)) {
    const historyCodes = extractKnownCatalogVariationCodes(recentInboundHistory.join("\n"), knownCodes);
    if (historyCodes.length > 0) {
      return Array.from(
        new Set(
          historyCodes
            .map((code) => codesByProductId.get(code))
            .filter((productId): productId is string => Boolean(productId)),
        ),
      );
    }

    const historyProductIds = recentInboundHistory.flatMap((text) => collectReferencedProductIdsFromText(text, products));
    if (historyProductIds.length > 0) {
      return Array.from(new Set(historyProductIds));
    }
  }

  return [];
}

function messageReferencesKnownCatalogSubject(
  value: string | null | undefined,
  products: CatalogProductCandidate[],
): boolean {
  const normalizedValue = normalizeCatalogRequestText(value);
  if (!normalizedValue) {
    return false;
  }

  const uniqueTermsByProduct = buildUniqueCatalogAnchorTerms(products);

  return products.some((product) => {
    const fullName = normalizeCatalogRequestText(product.name);
    if (fullName && normalizedValue.includes(fullName)) {
      return true;
    }

    return (uniqueTermsByProduct.get(product.id) || []).some((term) => normalizedValue.includes(term));
  });
}

function isOperationalCatalogFollowUp(value: string | null | undefined): boolean {
  const normalizedValue = normalizeCatalogRequestText(value);
  if (!normalizedValue) {
    return false;
  }

  const operationalSignals = [
    "pix",
    "qr code",
    "qrcode",
    "comprovante",
    "pagamento",
    "pagar",
    "endereco",
    "localizacao",
    "como chegar",
    "onde fica",
    "mapa",
    "horario",
    "funcionamento",
  ];

  return operationalSignals.some((signal) => normalizedValue.includes(signal));
}

function isCatalogSwitchRequestWithoutKnownSubject(
  value: string | null | undefined,
  products: CatalogProductCandidate[],
): boolean {
  const normalizedValue = normalizeCatalogRequestText(value);
  if (!normalizedValue) {
    return false;
  }

  if (messageReferencesKnownCatalogSubject(normalizedValue, products)) {
    return false;
  }

  const switchSignals = [
    "outro tema",
    "outra tema",
    "tema do",
    "tema de",
    "tem outro tema",
    "tem outro item",
    "outro item",
    "outra arte",
    "quero outro tema",
  ];

  return switchSignals.some((signal) => normalizedValue.includes(signal));
}

export function isExplicitCatalogMediaResendRequest(value: string | null | undefined): boolean {
  const normalized = normalizeCatalogRequestText(value);
  if (!normalized) return false;

  const resendPhrases = [
    "manda de novo",
    "manda novamente",
    "me manda de novo",
    "me manda novamente",
    "envia de novo",
    "envia novamente",
    "me envia de novo",
    "me envia novamente",
    "reenvia",
    "reenvie",
    "quero ver de novo",
    "quero ver novamente",
    "me mostra de novo",
    "me mostra novamente",
    "mostra de novo",
    "mostra novamente",
    "nao foi",
    "nao veio",
    "nao recebi",
    "nao chegou",
    "cade as fotos",
    "cade a foto",
    "nao abriu",
    "nao carregou",
  ];

  return resendPhrases.some((phrase) => normalized.includes(phrase));
}

function catalogResponseContradictsAttachedImages(value: string | null | undefined): boolean {
  const text = normalizeCatalogConsistencyText(value);
  if (!text) return false;

  const contradictionPhrases = [
    "nao esta cadastrado",
    "nao está cadastrado",
    "não está cadastrado",
    "ainda nao esta cadastrado",
    "ainda nao está cadastrado",
    "ainda não está cadastrado",
    "nao encontrei esse produto",
    "não encontrei esse produto",
    "nao achei esse produto",
    "não achei esse produto",
    "nao temos esse produto",
    "não temos esse produto",
    "nao tenho esse produto",
    "nao posso enviar imagens",
    "nao consigo enviar imagens",
    "nao posso enviar fotos",
    "nao consigo enviar fotos",
    "nao tenho acesso a um catalogo visual",
    "nao tenho acesso ao catalogo visual",
    "nao tenho capacidade de enviar arquivos",
    "nao tenho capacidade de enviar imagens",
    "sem acesso a um catalogo visual",
    "sou uma ia sem acesso",
    "como uma ia nao tenho acesso",
    "não tenho esse produto",
    "vou encaminhar para um humano",
    "vou encaminhar para uma pessoa",
    "vou passar para um humano",
    "vou passar para uma pessoa",
    "assim que cadastrar",
    "quando cadastrar",
  ];

  return contradictionPhrases.some((phrase) => text.includes(phrase));
}

function getFirstMeaningfulLine(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const firstLineBreak = trimmed.indexOf("\n");
  if (firstLineBreak < 0) {
    return trimmed;
  }

  return trimmed.slice(0, firstLineBreak).trim();
}

function startsWithBrazilGreeting(line: string): boolean {
  const rawLine = String(line || "").trim();
  if (!rawLine) {
    return false;
  }

  let startIndex = 0;
  while (startIndex < rawLine.length) {
    const current = rawLine[startIndex];
    if (
      current === "*" ||
      current === "_" ||
      current === "~" ||
      current === "`" ||
      current === " " ||
      current === "\t"
    ) {
      startIndex += 1;
      continue;
    }
    break;
  }

  const lowered = rawLine.slice(startIndex).toLocaleLowerCase("pt-BR");
  if (!lowered) {
    return false;
  }

  return (
    lowered.startsWith("bom dia") ||
    lowered.startsWith("boa tarde") ||
    lowered.startsWith("boa noite") ||
    lowered.startsWith("olá") ||
    lowered.startsWith("ola") ||
    lowered.startsWith("oi")
  );
}

function preserveGreetingLineWhenMissing(originalResponse: string, rewrittenResponse: string): string {
  const originalGreetingLine = getFirstMeaningfulLine(originalResponse);
  if (!startsWithBrazilGreeting(originalGreetingLine)) {
    return rewrittenResponse;
  }

  const rewrittenFirstLine = getFirstMeaningfulLine(rewrittenResponse);
  if (startsWithBrazilGreeting(rewrittenFirstLine)) {
    return rewrittenResponse;
  }

  return `${originalGreetingLine}\n${rewrittenResponse}`.trim();
}

function getOrderedImages(product: CatalogProductCandidate): CatalogProductMediaCandidate[] {
  return [...(product.images || [])]
    .filter((image) => String(image?.storageUrl || "").trim())
    .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
}

export async function selectCatalogProductImage(
  input: CatalogProductImageSelectionInput,
  deps: CatalogProductImageSelectionDeps = {},
): Promise<CatalogProductImageSelection> {
  const visualProducts = input.products
    .map((product) => ({
      ...product,
      images: getOrderedImages(product),
    }))
    .filter((product) => product.images.length > 0);

  if (visualProducts.length === 0) {
    return {
      shouldSend: false,
      productId: null,
      productIds: [],
      confidence: 0,
      reason: "Nenhum produto com imagem disponivel no catalogo.",
    };
  }

  const normalizedClientMessage = normalizeCatalogRequestText(input.clientMessage);
  const explicitPhotoRequest = isExplicitCatalogPhotoRequest(normalizedClientMessage);

  if (
    isCatalogLocationOrVisitRequest(normalizedClientMessage) &&
    !explicitPhotoRequest &&
    !isExplicitCatalogMediaResendRequest(input.clientMessage)
  ) {
    return {
      shouldSend: false,
      productId: null,
      productIds: [],
      confidence: 100,
      reason: "Mensagem atual pede endereco, localizacao ou visita presencial, nao fotos do catalogo.",
    };
  }

  const currentTurnReferencesKnownProduct =
    messageReferencesKnownCatalogSubject(input.clientMessage, visualProducts) ||
    messageReferencesKnownCatalogSubject(input.assistantResponse, visualProducts);

  if (
    isOperationalCatalogFollowUp(input.clientMessage) &&
    !currentTurnReferencesKnownProduct &&
    !isExplicitCatalogMediaResendRequest(input.clientMessage)
  ) {
    return {
      shouldSend: false,
      productId: null,
      productIds: [],
      confidence: 100,
      reason: "Mensagem atual mudou para assunto operacional sem pedido de fotos do catalogo.",
    };
  }

  if (
    isCatalogSwitchRequestWithoutKnownSubject(input.clientMessage, visualProducts) &&
    !isExplicitCatalogMediaResendRequest(input.clientMessage)
  ) {
    return {
      shouldSend: false,
      productId: null,
      productIds: [],
      confidence: 100,
      reason: "Mensagem atual pede outro tema/item sem ancoragem em produto existente do catalogo.",
    };
  }

  if (isCatalogTechnicalInfoRequest(normalizedClientMessage)) {
    return {
      shouldSend: false,
      productId: null,
      productIds: [],
      confidence: 100,
      reason: "Mensagem atual pede dados tecnicos do produto, nao fotos do catalogo.",
    };
  }

  if (
    !catalogResponseContradictsAttachedImages(input.assistantResponse) &&
    !isDetailedCatalogChoiceMessage(normalizedClientMessage)
  ) {
    const inferredProductIds = inferCatalogProductIdsFromContext(input, visualProducts);
    if (inferredProductIds.length > 0) {
      return {
        shouldSend: true,
        productId: inferredProductIds[0] || null,
        productIds: inferredProductIds,
        confidence: 100,
        reason: "Produtos do catálogo identificados por código exato ou assunto citado no turno atual.",
      };
    }
  }

  const recentHistory = input.conversationHistory
    .slice(-20)
    .map((message) => `${message.fromMe ? "Agente" : "Cliente"}: ${truncateText(message.text, 240) || "(sem texto)"}`)
    .join("\n");

  const catalogText = visualProducts
    .slice(0, 120)
    .map((product, index) => {
      const variationSummary =
        product.imageVariationsEnabled === true
          ? product.images
              .filter((image) => image.variationIsActive !== false)
              .map((image) => {
                const parts: string[] = [];
                if (typeof image.variationCode === "number") {
                  parts.push(`COD=${image.variationCode}`);
                }
                if (image.variationName) {
                  parts.push(`NOME_VARIACAO=${image.variationName}`);
                }
                if (image.variationPrice) {
                  parts.push(`PRECO_VARIACAO=${image.variationPrice}`);
                }
                return parts.join(" | ");
              })
              .filter(Boolean)
              .join(" ; ")
          : "";
      const parts = [
        `ID=${product.id}`,
        `NOME=${product.name}`,
        product.category ? `CATEGORIA=${product.category}` : null,
        product.price ? `PRECO=${product.price}` : null,
        product.description ? `DESCRICAO=${truncateText(product.description, 160)}` : null,
        `FOTOS=${product.images.length}`,
        variationSummary ? `VARIACOES=${variationSummary}` : null,
      ].filter(Boolean);
      return `${index + 1}. ${parts.join(" | ")}`;
    })
    .join("\n");

  const systemPrompt = `Voce decide se o agente deve enviar AS FOTOS de um ou mais produtos do catalogo.

Regras:
- Envie as fotos somente quando a conversa estiver claramente focada em um ou mais produtos especificos do catalogo.
- Se decidir enviar, o sistema mandara todas as fotos de cada produto escolhido na ordem cadastrada.
- So envie varios produtos quando a mensagem atual trouxer dois ou mais temas ou itens explicitos e identificaveis na lista recebida.
- Quando a mensagem ou o historico citar CODIGO/COD de variacao, escolha somente produto que contenha esse codigo exato.
- Nunca troque COD 40 por COD 39, COD 41 por COD 40, nem escolha codigo vizinho por sequencia, tema parecido ou aproximacao.
- Se varios codigos forem citados, preserve todos os codigos exatos na decisao e nao deixe nenhum de fora por inferencia.
- Nao envie fotos para pedidos genericos de catalogo, listas amplas ou saudacao sem pedido concreto.
- A MENSAGEM_ATUAL tem prioridade total sobre o historico antigo.
- Se a mensagem atual for sobre Pix, endereco, horario, funcionamento, pagamento, comprovante, localizacao ou mapa, responda NO_IMAGE mesmo que o historico anterior tenha fotos ou um tema em andamento.
- Se a mensagem atual pedir outro tema ou outro item e voce nao conseguir ancorar esse novo pedido a produtos reais da lista recebida, responda NO_IMAGE.
- Considere a mensagem do cliente, o historico recente e a resposta textual do agente.
- Nunca invente produto. So escolha IDs existentes na lista recebida.
- Se nao houver seguranca suficiente, responda NO_IMAGE.

Responda APENAS em JSON com este formato:
{"decision":"SEND"|"NO_IMAGE","productId":"id-ou-null","productIds":["id1","id2"],"confidence":0-100,"reason":"motivo curto"}`;

  const userPrompt = `MENSAGEM_ATUAL:
${truncateText(input.clientMessage, 500)}

RESPOSTA_DO_AGENTE:
${truncateText(input.assistantResponse, 500) || "(sem resposta textual)"}

HISTORICO_RECENTE:
${recentHistory || "(sem historico)"}

PRODUTOS_COM_FOTO:
${catalogText}
`;

  try {
    const completeChat = deps.completeChat;
    if (!completeChat) {
      return {
        shouldSend: false,
        productId: null,
        productIds: [],
        confidence: 0,
        reason: "Selecao de midia do catalogo requer action explicita do Codex.",
      };
    }
    const response = await completeChat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 180,
      temperature: 0.1,
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : String(rawContent || "");
    const parsed = extractFirstJsonObject(content) as {
      decision?: string;
      productId?: string | null;
      productIds?: unknown;
      confidence?: number;
      reason?: string;
    };

    const confidence = Number.isFinite(parsed.confidence) ? Number(parsed.confidence) : 0;
    const validProductIds = new Set(visualProducts.map((product) => String(product.id)));
    const parsedProductIds = Array.isArray(parsed.productIds)
      ? parsed.productIds
          .map((productId) => (typeof productId === "string" ? productId.trim() : ""))
          .filter((productId) => productId && validProductIds.has(productId))
      : [];
    const fallbackProductId = typeof parsed.productId === "string" && parsed.productId.trim()
      ? parsed.productId.trim()
      : null;
    const selectedProductIds = Array.from(
      new Set([
        ...parsedProductIds,
        ...(fallbackProductId && validProductIds.has(fallbackProductId) ? [fallbackProductId] : []),
      ]),
    );
    const shouldSend = parsed.decision === "SEND" && confidence >= 60 && selectedProductIds.length > 0;

    return {
      shouldSend,
      productId: shouldSend ? selectedProductIds[0] || null : null,
      productIds: shouldSend ? selectedProductIds : [],
      confidence,
      reason: parsed.reason || "Sem motivo informado.",
    };
  } catch (error: any) {
    console.error("[ProductCatalogMedia] Falha ao selecionar imagens do catalogo:", error);
    return {
      shouldSend: false,
      productId: null,
      productIds: [],
      confidence: 0,
      reason: error?.message || "Erro ao interpretar imagens do catalogo.",
    };
  }
}

export async function harmonizeCatalogProductResponseForSentImages(
  input: CatalogProductResponseRewriteInput,
  deps: CatalogProductImageSelectionDeps = {},
): Promise<string> {
  const originalResponse = String(input.assistantResponse || "").trim();
  const productName = String(input.productLabel || input.productName || "").trim() || "produto";
  const imageCount = Math.max(1, Number(input.imageCount || 0));

  if (!originalResponse) {
    return "";
  }

  if (!deps.completeChat) {
    return originalResponse;
  }

  const systemPrompt = `Voce reescreve uma mensagem de atendimento para ficar coerente com o fato de que as fotos do produto ou dos produtos JA serao enviadas nesta mesma resposta.

Regras:
- Preserve os fatos principais da mensagem original.
- Deixe claro que as fotos estao sendo enviadas agora ou que seguem logo abaixo.
- Nao pergunte se o cliente quer ver, quer receber ou se voce pode enviar as fotos depois.
- Se as fotos estao sendo enviadas agora, remova qualquer frase que diga que o produto nao existe, nao esta cadastrado, nao foi encontrado ou que sera preciso encaminhar para humano por falta de material.
- Nao invente preco, estoque ou detalhes novos.
- Mantenha o tom natural de WhatsApp e seja objetivo.
- Responda SOMENTE com o texto final reescrito.`;

  const userPrompt = `PRODUTO: ${productName}
QUANTIDADE_DE_FOTOS: ${imageCount}

MENSAGEM_ORIGINAL:
${truncateText(originalResponse, 800)}`;

  try {
    const completeChat = deps.completeChat;
    if (!completeChat) {
      return originalResponse;
    }
    const response = await completeChat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 180,
      temperature: 0.1,
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent.trim() : String(rawContent || "").trim();
    if (content) {
      const finalContent = preserveGreetingLineWhenMissing(originalResponse, content);
      if (catalogResponseContradictsAttachedImages(finalContent)) return originalResponse;
      return finalContent;
    }
  } catch (error: any) {
    console.error("[ProductCatalogMedia] Falha ao harmonizar texto com imagens anexadas:", error);
  }

  return originalResponse;
}
