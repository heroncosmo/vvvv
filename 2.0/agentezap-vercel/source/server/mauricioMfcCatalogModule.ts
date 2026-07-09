export const MAURICIO_MFC_USER_ID = "a7f1edc1-ae45-45a5-b382-2a1024507355";
export const MAURICIO_MFC_EMAIL = "mauriciogomes2650@gmail.com";

export type MauricioMfcCatalogItemKind = "lateral" | "cilindro" | "redondo";
export type MauricioMfcAcabamento = "sem_costura" | "costurado";
export type MauricioMfcRedondoSize = "50x50" | "1,50x1,50";

export interface MauricioMfcCatalogEntryInput {
  userId?: string | null;
  userEmail?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  productDescription?: string | null;
  variationName?: string | null;
  variationCaption?: string | null;
  variationPrice?: string | null;
  contextText?: string | null;
  includeReady50x50Promo?: boolean | null;
  details?: {
    acabamento?: string | null;
    tamanho?: string | null;
    quantidade?: string | null;
  } | null;
}

export interface MauricioMfcResolvedPrice {
  price: number | null;
  kind: MauricioMfcCatalogItemKind | null;
  acabamento: MauricioMfcAcabamento | null;
  tamanho: MauricioMfcRedondoSize | null;
  description: string | null;
}

export const MAURICIO_MFC_READY_50X50_PROMO_LINK = "https://photos.app.goo.gl/sXa7C9AX1BHctpsP7";

export function getMauricioMfcReady50x50PromoPriceDescription(): string {
  return [
    "1 unidade R$ 15,00",
    "3 unidades R$ 12,00 cada",
    "5 unidades R$ 10,00 cada",
    "acima de 10 unidades R$ 8,00 cada a vista",
    "no cartao acrescimo de R$ 1,00 por unidade",
  ].join("; ");
}

export interface MauricioMfcCartItemSnapshot {
  code: number;
  product: string;
  tamanho: string | null;
  acabamento: string | null;
  quantidade: string | null;
  unitPrice: number | null;
  subtotal: number | null;
}

export interface MauricioMfcPendingCartItemSnapshot extends MauricioMfcCartItemSnapshot {
  missing: string[];
}

export interface MauricioMfcHistoryEntry {
  role?: string | null;
  content?: string | null;
  text?: string | null;
  mediaCaption?: string | null;
  media_caption?: string | null;
  fromMe?: boolean | null;
  isFromAgent?: boolean | null;
}

export type MauricioMfcArtReferenceIntent = "none" | "use_art" | "marked_selection";

export interface MauricioMfcArtReferenceContext {
  isTenant: boolean;
  currentMessageIntent: MauricioMfcArtReferenceIntent;
  hasPhysicalOrderDetails: boolean;
  hasRecentArtReferenceCatalog: boolean;
  recentArtReferenceCount: number;
  shouldUseArtReferenceHandoff: boolean;
  contextBlock: string;
}

export type MauricioMfcDedicatedTurnKind =
  | "post_sale_issue"
  | "unsupported_external_file_or_link"
  | "delivery"
  | "address"
  | "pix"
  | "none";

export interface MauricioMfcDedicatedTurnDecision {
  kind: MauricioMfcDedicatedTurnKind;
  confidence: number;
  reason: string;
}

export function normalizeMauricioMfcCatalogText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeMauricioMfcCatalogPhotoRequest(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;

  const hasMediaSignal = /\b(?:foto|fotos|imagem|imagens|catalogo|catalogos)\b/.test(normalized);
  const hasRequestSignal = /\b(?:manda|mandar|envia|enviar|mostra|mostrar|ver|quero|queria)\b/.test(normalized);
  return hasMediaSignal && hasRequestSignal;
}

export function looksLikeMauricioMfcGenericCatalogPhotoContinuation(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!looksLikeMauricioMfcCatalogPhotoRequest(normalized)) return false;

  const hasSpecificAnchor =
    /\b(?:hulk|lilo|sthic|stitch|chito|girassol|galaxia|palavrinhas|baby\s+shark|mario|sao\s+joao)\b/.test(normalized) ||
    /\b(?:codigo|cod)\s*\d{1,4}\b/.test(normalized) ||
    /\b(?:painel|paineis|redondo|lateral|cilindro|cilindros)\b.{0,60}\b(?:hulk|lilo|sthic|stitch|chito|girassol|galaxia|mario)\b/.test(normalized);
  return !hasSpecificAnchor;
}

function shouldBypassMauricioMfcPendingContinuationForCatalogMedia(value: string | null | undefined): boolean {
  if (!looksLikeMauricioMfcCatalogPhotoRequest(value)) return false;
  if (extractMauricioMfcAcabamento(value)) return false;
  if (extractMauricioMfcRedondoSize(value)) return false;
  if (extractMauricioMfcQuantity(value) != null) return false;
  return true;
}

export function isMauricioMfcCatalogTenant(params: {
  userId?: string | null;
  userEmail?: string | null;
}): boolean {
  const userId = String(params.userId || "").trim();
  const userEmail = String(params.userEmail || "").trim().toLowerCase();
  return userId === MAURICIO_MFC_USER_ID || userEmail === MAURICIO_MFC_EMAIL;
}

function buildEntryText(entry: MauricioMfcCatalogEntryInput): string {
  return [
    entry.productName,
    entry.productCategory,
    entry.productDescription,
    entry.variationName,
    entry.variationCaption,
  ]
    .filter(Boolean)
    .join(" ");
}

export function inferMauricioMfcCatalogItemKind(
  entry: MauricioMfcCatalogEntryInput,
): MauricioMfcCatalogItemKind | null {
  const normalized = normalizeMauricioMfcCatalogText(buildEntryText(entry));

  if (!normalized) {
    return null;
  }

  if (/\b(lateral|painel lateral)\b/.test(normalized)) {
    return "lateral";
  }

  if (/\b(cilindro|cilindros|capa de cilindro|capa)\b/.test(normalized)) {
    return "cilindro";
  }

  if (
    /\b(redondo|painel redondo|50x50|1,50x1,50|150x150)\b/.test(normalized) ||
    /\bpain(?:el|eis|eis)\b.{0,30}\b50\b/.test(normalized) ||
    /\b50\b.{0,30}\bpain(?:el|eis|eis)\b/.test(normalized)
  ) {
    return "redondo";
  }

  return null;
}

function inferMauricioMfcContextItemKind(
  value: string | null | undefined,
): MauricioMfcCatalogItemKind | null {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) {
    return null;
  }

  if (/\b(lateral|painel lateral)\b/.test(normalized)) {
    return "lateral";
  }

  if (/\b(cilindro|cilindros|capa de cilindro|capa)\b/.test(normalized)) {
    return "cilindro";
  }

  if (
    /\b(redondo|painel redondo|50x50|1,50x1,50|150x150)\b/.test(normalized) ||
    /\bpain(?:el|eis|eis)\b.{0,30}\b50\b/.test(normalized) ||
    /\b50\b.{0,30}\bpain(?:el|eis|eis)\b/.test(normalized)
  ) {
    return "redondo";
  }

  return null;
}

export function inferMauricioMfcSpecificCatalogItemKind(
  entry: MauricioMfcCatalogEntryInput,
): MauricioMfcCatalogItemKind | null {
  const normalized = normalizeMauricioMfcCatalogText([
    entry.productName,
    entry.productCategory,
    entry.variationName,
    entry.variationCaption,
  ].filter(Boolean).join(" "));
  if (!normalized) {
    return null;
  }

  if (/\b(lateral|painel lateral)\b/.test(normalized)) {
    return "lateral";
  }

  if (/\b(cilindro|cilindros|capa de cilindro|capa)\b/.test(normalized)) {
    return "cilindro";
  }

  if (/\b(redondo|painel redondo|50x50|1,50x1,50|150x150)\b/.test(normalized)) {
    return "redondo";
  }

  return null;
}

export function resolveMauricioMfcRequestedLineKind(
  value: string | null | undefined,
): MauricioMfcCatalogItemKind | null {
  return inferMauricioMfcContextItemKind(value);
}

export function mauricioMfcCatalogEntryMatchesLineKind(
  entry: MauricioMfcCatalogEntryInput,
  lineKind: MauricioMfcCatalogItemKind | null | undefined,
): boolean {
  if (!lineKind) {
    return true;
  }
  return inferMauricioMfcSpecificCatalogItemKind(entry) === lineKind;
}

function isMauricioMfcGenericArtCatalogEntry(entry: MauricioMfcCatalogEntryInput): boolean {
  const normalized = normalizeMauricioMfcCatalogText([
    entry.productName,
    entry.productCategory,
    entry.variationName,
    entry.variationCaption,
  ].filter(Boolean).join(" "));
  if (!normalized) {
    return false;
  }

  const isCatalogArtReference =
    /\bcatalogo\b/.test(normalized) &&
    /\b(?:foto|fotos|arte|artes)\b/.test(normalized);
  const alreadySpecificKind = /\b(lateral|cilindro|cilindros|redondo|painel redondo|painel lateral)\b/.test(normalized);
  return isCatalogArtReference && !alreadySpecificKind;
}

export function extractMauricioMfcAcabamento(value: string | null | undefined): MauricioMfcAcabamento | null {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) {
    return null;
  }

  if (/\bsem[- ]?costura\b/.test(normalized)) {
    return "sem_costura";
  }

  if (/\b(costurado|costurada|com costura)\b/.test(normalized)) {
    return "costurado";
  }

  return null;
}

export function extractMauricioMfcRedondoSize(value: string | null | undefined): MauricioMfcRedondoSize | null {
  const normalized = normalizeMauricioMfcCatalogText(value).replace(/\s+/g, "");
  if (!normalized) {
    return null;
  }

  if (/50x50/.test(normalized)) {
    return "50x50";
  }

  if (/(1,?50x1,?50|150x150)/.test(normalized)) {
    return "1,50x1,50";
  }

  return null;
}

export function formatMauricioMfcCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function parseMauricioMfcCurrencyNumber(value: string | null | undefined): number | null {
  const match = String(value || "").match(/(\d{1,6}(?:[,.]\d{1,2})?)/);
  if (!match?.[1]) return null;
  const raw = match[1];
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /\.\d{1,2}$/.test(raw)
      ? raw
      : raw.replace(/\./g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractMauricioMfcQuantity(value: string | null | undefined): number | null {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return null;

  if (/^\d{1,3}$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const explicit = normalized.match(/\b(?:quantidade|qtd|qtde)\s*:?\s*(\d{1,3})\b/);
  if (explicit?.[1]) {
    const parsed = Number(explicit[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const units = normalized.match(/\b(\d{1,3})\s*(?:unidade|unidades|und|un|peca|pecas|p[ée]ca|p[ée]cas)\b/);
  if (units?.[1]) {
    const parsed = Number(units[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  if (/\b(?:uma|um)\s+de\s+cada\b/.test(normalized)) {
    return 1;
  }

  return null;
}

function readMauricioMfcCartField(block: string, labelPattern: string): string | null {
  const fieldNames = [
    "Produto",
    "C[oó]digo",
    "Codigo",
    "Cod",
    "Tamanho",
    "Acabamento",
    "Quantidade",
    "Valor(?:\\s+unit[aá]rio)?",
    "Subtotal",
    "Falta",
    "Total dos itens",
  ].join("|");
  const match = new RegExp(
    `(?:^|\\n|\\s+-\\s+)(?:${labelPattern})\\s*:?\\s*([\\s\\S]*?)(?=(?:\\n|\\s+-\\s+)\\s*(?:${fieldNames})\\s*:|(?:\\n|\\s+-\\s+)\\s*(?:\\d+\\.\\s*)?Item\\s+\\d+\\b|$)`,
    "i",
  ).exec(block);
  const text = match?.[1]
    ?.replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s*$/g, "")
    .trim();
  return text || null;
}

export function extractMauricioMfcPriorCartItems(
  value: string | null | undefined,
  options: { limit?: number } = {},
): MauricioMfcCartItemSnapshot[] {
  const limit = Math.max(1, Math.min(10, Number(options.limit || 10)));
  const source = String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/\s+(\d+\.\s*Item\s+\d+\s+-)/gi, "\n$1")
    .replace(/\n{2,}/g, "\n");

  const blocks = source
    .split(/(?=(?:^|\n)\s*(?:\d+\.\s*)?Item\s+\d+\b)/i)
    .map((part) => part.trim())
    .filter((part) => /\bItem\s+\d+\b/i.test(part));

  const items: MauricioMfcCartItemSnapshot[] = [];
  for (const block of blocks) {
    const codeRaw = readMauricioMfcCartField(block, "C[oó]digo|Codigo|Cod");
    const code = Number(String(codeRaw || "").match(/\d+/)?.[0]);
    if (!Number.isInteger(code) || code <= 0) continue;

    const product = readMauricioMfcCartField(block, "Produto") || `Codigo ${code}`;
    const tamanho = readMauricioMfcCartField(block, "Tamanho");
    const acabamento = readMauricioMfcCartField(block, "Acabamento");
    const quantidadeRaw = readMauricioMfcCartField(block, "Quantidade");
    const quantidadeMatch = String(quantidadeRaw || "").match(/\d{1,3}/);
    const quantidade = quantidadeMatch ? String(Number(quantidadeMatch[0])) : null;
    const unitPrice = parseMauricioMfcCurrencyNumber(
      readMauricioMfcCartField(block, "Valor(?:\\s+unit[aá]rio)?"),
    );
    const subtotal =
      parseMauricioMfcCurrencyNumber(readMauricioMfcCartField(block, "Subtotal")) ??
      (unitPrice != null && quantidade ? unitPrice * Number(quantidade) : null);

    if (!quantidade || unitPrice == null) continue;
    items.push({
      code,
      product,
      tamanho,
      acabamento,
      quantidade,
      unitPrice,
      subtotal,
    });
    if (items.length >= limit) break;
  }
  return items;
}

function parseMauricioMfcMissingFields(value: string | null | undefined): string[] {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return [];

  const missing = new Set<string>();
  if (/\b(tamanho|medida|50x50|1,50x1,50|150x150)\b/.test(normalized)) missing.add("tamanho");
  if (/\b(acabamento|costura|costurado|sem costura)\b/.test(normalized)) missing.add("acabamento");
  if (/\b(quantidade|qtd|qtde|unidade|unidades)\b/.test(normalized)) missing.add("quantidade");
  return Array.from(missing);
}

function inferMauricioMfcPendingItemKind(params: {
  product?: string | null;
  tamanho?: string | null;
  block?: string | null;
}): MauricioMfcCatalogItemKind | null {
  const productText = [params.product, params.tamanho, params.block].filter(Boolean).join(" ");
  return inferMauricioMfcContextItemKind(productText);
}

function computeMauricioMfcMissingFields(item: {
  kind?: MauricioMfcCatalogItemKind | null;
  tamanho?: string | null;
  acabamento?: string | null;
  quantidade?: string | null;
  missing?: string[] | null;
}): string[] {
  const missing = new Set<string>(item.missing || []);

  if (item.kind === "redondo" && !extractMauricioMfcRedondoSize(item.tamanho)) {
    missing.add("tamanho");
  } else if (item.kind !== "redondo") {
    missing.delete("tamanho");
  }

  if (!extractMauricioMfcAcabamento(item.acabamento)) {
    missing.add("acabamento");
  } else {
    missing.delete("acabamento");
  }

  if (!extractMauricioMfcQuantity(item.quantidade)) {
    missing.add("quantidade");
  } else {
    missing.delete("quantidade");
  }

  return ["tamanho", "acabamento", "quantidade"].filter((field) => missing.has(field));
}

export function extractMauricioMfcPendingCartItems(
  value: string | null | undefined,
  options: { limit?: number } = {},
): MauricioMfcPendingCartItemSnapshot[] {
  const limit = Math.max(1, Math.min(10, Number(options.limit || 10)));
  const source = String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\*\*/g, "")
    .replace(/\s+(\d+\.\s*Item\s+\d+\s*-)/gi, "\n$1")
    .replace(/\n{2,}/g, "\n");

  const blocks = source
    .split(/(?=(?:^|\n)\s*(?:\d+\.\s*)?Item\s+\d+\b)/i)
    .map((part) => part.trim())
    .filter((part) => /\bItem\s+\d+\b/i.test(part));

  const items: MauricioMfcPendingCartItemSnapshot[] = [];
  for (const block of blocks) {
    const codeRaw = readMauricioMfcCartField(block, "C[oó]digo|Codigo|Cod");
    const code = Number(String(codeRaw || "").match(/\d+/)?.[0]);
    if (!Number.isInteger(code) || code <= 0) continue;

    const product = readMauricioMfcCartField(block, "Produto") || `Codigo ${code}`;
    const tamanho = readMauricioMfcCartField(block, "Tamanho");
    const acabamento = readMauricioMfcCartField(block, "Acabamento");
    const quantidadeRaw = readMauricioMfcCartField(block, "Quantidade");
    const quantidadeValue = extractMauricioMfcQuantity(quantidadeRaw);
    const quantidade = quantidadeValue != null ? String(quantidadeValue) : null;
    const unitPrice = parseMauricioMfcCurrencyNumber(
      readMauricioMfcCartField(block, "Valor(?:\\s+unit[aá]rio)?"),
    );
    const subtotal =
      parseMauricioMfcCurrencyNumber(readMauricioMfcCartField(block, "Subtotal")) ??
      (unitPrice != null && quantidade ? unitPrice * Number(quantidade) : null);
    const kind = inferMauricioMfcPendingItemKind({ product, tamanho, block });
    const missing = computeMauricioMfcMissingFields({
      kind,
      tamanho,
      acabamento,
      quantidade,
      missing: parseMauricioMfcMissingFields(readMauricioMfcCartField(block, "Falta")),
    });

    if (missing.length === 0 && quantidade && unitPrice != null) continue;

    items.push({
      code,
      product,
      tamanho,
      acabamento,
      quantidade,
      unitPrice,
      subtotal,
      missing,
    });
    if (items.length >= limit) break;
  }
  return items;
}

function getMauricioMfcHistoryText(entry: MauricioMfcHistoryEntry): string {
  return String(
    entry.content ??
    entry.text ??
    entry.mediaCaption ??
    entry.media_caption ??
    "",
  ).trim();
}

function isMauricioMfcHistoryAgentEntry(entry: MauricioMfcHistoryEntry): boolean {
  return entry.role === "assistant" || entry.fromMe === true || entry.isFromAgent === true;
}

function hasMauricioMfcArtReferencePhysicalOrderDetails(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  return (
    /\b(?:painel|paineis|cilindro|cilindros|redondo|lateral|costura|costurado|acabamento|quantidade|qtd|valor|preco)\b/.test(normalized) ||
    /\b(?:50x50|150x150|1,50x1,50)\b/.test(normalized) ||
    /r\s*\$/.test(normalized)
  );
}

export function isMauricioMfcArtReferenceCatalogText(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;
  const hasArtCatalog =
    normalized.includes("catalogo") &&
    /\b(?:arte|artes|arte personalizada|designer)\b/.test(normalized);
  return hasArtCatalog && !hasMauricioMfcArtReferencePhysicalOrderDetails(normalized);
}

function classifyMauricioMfcArtReferenceIntent(value: string | null | undefined): MauricioMfcArtReferenceIntent {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized || hasMauricioMfcArtReferencePhysicalOrderDetails(normalized)) {
    return "none";
  }

  const hasArtReference =
    /\b(?:arte|artes|foto|fotos|imagem|imagens|catalogo)\b/.test(normalized) ||
    /\b(?:essa|esta|a)\s+(?:marcada|escolhida)\b/.test(normalized);
  const hasSelectionReference =
    /\b(?:gostei|quero|usar|escolhi|escolhida|marquei|marcado|marcada|numero|nome)\b/.test(normalized) ||
    /\bx\b/.test(normalized);

  if (!hasArtReference || !hasSelectionReference) {
    return "none";
  }

  if (/\b(?:marquei|marcado|marcada|x)\b/.test(normalized)) {
    return "marked_selection";
  }

  return "use_art";
}

function countMauricioMfcArtReferenceItemsFromHistory(entries: MauricioMfcHistoryEntry[]): number {
  const recentAgentText = (entries || [])
    .slice(-12)
    .filter(isMauricioMfcHistoryAgentEntry)
    .map(getMauricioMfcHistoryText)
    .filter(Boolean)
    .join("\n");

  if (!isMauricioMfcArtReferenceCatalogText(recentAgentText)) {
    return 0;
  }

  const codeMatches = normalizeMauricioMfcCatalogText(recentAgentText).match(/\b(?:codigo|cod)\s*[:#-]?\s*\d{1,4}\b/g) || [];
  return Math.max(1, Math.min(10, codeMatches.length || 1));
}

export function buildMauricioMfcArtReferenceContext(params: {
  userId?: string | null;
  userEmail?: string | null;
  currentMessage?: string | null;
  conversationHistory?: MauricioMfcHistoryEntry[];
}): MauricioMfcArtReferenceContext {
  const isTenant = isMauricioMfcCatalogTenant(params);
  const currentMessageIntent = classifyMauricioMfcArtReferenceIntent(params.currentMessage);
  const hasPhysicalOrderDetails = hasMauricioMfcArtReferencePhysicalOrderDetails(params.currentMessage);
  const recentArtReferenceCount = isTenant
    ? countMauricioMfcArtReferenceItemsFromHistory(params.conversationHistory || [])
    : 0;
  const hasRecentArtReferenceCatalog = recentArtReferenceCount > 0;
  const shouldUseArtReferenceHandoff =
    isTenant &&
    !hasPhysicalOrderDetails &&
    currentMessageIntent !== "none" &&
    hasRecentArtReferenceCatalog;
  const contextBlock = shouldUseArtReferenceHandoff
    ? [
        "CONTEXTO OPERACIONAL MFC - CATALOGO DE ARTES:",
        `- Intencao atual: ${currentMessageIntent}.`,
        `- Catalogo de artes recente encontrado: ${recentArtReferenceCount} item(ns).`,
        "- Proximo passo correto: pedir para marcar/enviar numero ou nome da arte.",
        "- Nao pedir tamanho, acabamento ou quantidade neste turno de escolha de arte.",
      ].join("\n")
    : "";

  return {
    isTenant,
    currentMessageIntent,
    hasPhysicalOrderDetails,
    hasRecentArtReferenceCatalog,
    recentArtReferenceCount,
    shouldUseArtReferenceHandoff,
    contextBlock,
  };
}

export function buildMauricioMfcArtReferenceHandoffReply(count: number): string {
  const plural = count > 1;
  return [
    plural
      ? "Perfeito, entendi que voce quer usar artes do catalogo de fotos."
      : "Perfeito, entendi que voce quer usar uma arte do catalogo de fotos.",
    "",
    "Marque com um X na foto escolhida, ou me envie o numero/nome da arte. Depois eu encaminho para o atendimento dar sequencia com a producao.",
    "",
    "A producao costuma levar 24h depois que a arte for enviada. Se preferir criar uma arte diferente, posso te passar contatos de designers.",
  ].join("\n");
}

function findLatestMauricioMfcPendingItems(
  history: MauricioMfcHistoryEntry[],
): MauricioMfcPendingCartItemSnapshot[] {
  for (const entry of [...(history || [])].slice(-40).reverse()) {
    if (!isMauricioMfcHistoryAgentEntry(entry)) continue;
    const items = extractMauricioMfcPendingCartItems(getMauricioMfcHistoryText(entry), { limit: 5 });
    if (items.length > 0) return items;
  }
  return [];
}

function formatMauricioMfcAcabamentoLabel(value: string | null | undefined): string | null {
  const acabamento = extractMauricioMfcAcabamento(value);
  if (acabamento === "sem_costura") return "Sem costura";
  if (acabamento === "costurado") return "Costurado";
  return value?.trim() || null;
}

function formatMauricioMfcMissingList(missing: string[]): string {
  const labels = missing.map((field) => {
    if (field === "tamanho") return "tamanho do painel";
    if (field === "acabamento") return "acabamento";
    return "quantidade";
  });
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

function buildMauricioMfcPendingItemLines(
  item: MauricioMfcPendingCartItemSnapshot,
  index: number,
): string[] {
  const lines = [`Item ${index + 1}`];
  lines.push(`Produto: ${item.product}`);
  lines.push(`Codigo: ${item.code}`);
  if (item.tamanho) lines.push(`Tamanho: ${item.tamanho}`);
  if (item.acabamento) lines.push(`Acabamento: ${formatMauricioMfcAcabamentoLabel(item.acabamento)}`);
  if (item.quantidade) lines.push(`Quantidade: ${item.quantidade}`);
  if (item.unitPrice != null) lines.push(`Valor: ${formatMauricioMfcCurrency(item.unitPrice)}`);
  if (item.subtotal != null) lines.push(`Subtotal: ${formatMauricioMfcCurrency(item.subtotal)}`);
  if (item.missing.length > 0) lines.push(`Falta: ${formatMauricioMfcMissingList(item.missing)}`);
  return lines;
}

function completeMauricioMfcPendingItem(
  item: MauricioMfcPendingCartItemSnapshot,
  currentMessage: string,
): MauricioMfcPendingCartItemSnapshot {
  const suppliedAcabamento = extractMauricioMfcAcabamento(currentMessage);
  const suppliedTamanho = extractMauricioMfcRedondoSize(currentMessage);
  const suppliedQuantidade = extractMauricioMfcQuantity(currentMessage);
  const kind = inferMauricioMfcPendingItemKind({
    product: item.product,
    tamanho: item.tamanho,
    block: currentMessage,
  });
  const acabamento =
    item.acabamento ||
    (suppliedAcabamento === "sem_costura" ? "Sem costura" : suppliedAcabamento === "costurado" ? "Costurado" : null);
  const tamanho = item.tamanho || suppliedTamanho;
  const quantidade = item.quantidade || (suppliedQuantidade != null ? String(suppliedQuantidade) : null);
  const missing = computeMauricioMfcMissingFields({
    kind,
    tamanho,
    acabamento,
    quantidade,
    missing: item.missing,
  });
  const resolved = resolveMauricioMfcCatalogUnitPrice({
    userId: MAURICIO_MFC_USER_ID,
    productName: item.product,
    variationName: item.product,
    contextText: [item.product, tamanho, acabamento, quantidade ? `quantidade ${quantidade}` : ""].filter(Boolean).join(" "),
    details: {
      tamanho,
      acabamento,
      quantidade,
    },
  });
  const unitPrice = resolved.price ?? item.unitPrice;
  const subtotal = unitPrice != null && quantidade ? unitPrice * Number(quantidade) : item.subtotal;

  return {
    ...item,
    tamanho,
    acabamento,
    quantidade,
    unitPrice,
    subtotal,
    missing,
  };
}

function looksLikeMauricioMfcExplicitNewSelection(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;
  if (looksLikeMauricioMfcCartResetIntent(value)) return true;
  if (/\b(?:codigo|cod)\s*\d{1,4}\b/.test(normalized)) return true;
  return /\b(?:novo pedido|outro pedido)\b/.test(normalized);
}

function looksLikeMauricioMfcThemeCorrection(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;
  if (!/\b(?:lilo|sthic|stich|stitch|chito)\b/.test(normalized)) return false;
  if (/\b(?:codigo|cod|pix|pagar|pagamento|sem costura|costurado|quantidade|qtd|unidade|unidades)\b/.test(normalized)) {
    return false;
  }
  return normalized.length <= 80;
}

function hasRecentMauricioMfcPanelAssumption(history: MauricioMfcHistoryEntry[]): boolean {
  const recentAgentText = [...(history || [])]
    .slice(-8)
    .filter(isMauricioMfcHistoryAgentEntry)
    .map(getMauricioMfcHistoryText)
    .join("\n");
  const normalized = normalizeMauricioMfcCatalogText(recentAgentText);
  if (!normalized) return false;
  const mentionsLilo = /\b(?:lilo|sthic|stich|stitch|chito)\b/.test(normalized);
  const assumedPanel =
    /\bassumindo\b/.test(normalized) ||
    /\bpainel redondo\b/.test(normalized) ||
    /\btamanho do painel\b/.test(normalized) ||
    /\b50x50\b/.test(normalized) ||
    /\b1,50x1,50\b/.test(normalized);
  return mentionsLilo && assumedPanel;
}

function looksLikeMauricioMfcAcabamentoOnlyContinuation(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized || normalized.length > 80) return false;
  if (!extractMauricioMfcAcabamento(normalized)) return false;
  return !/\b(?:foto|fotos|imagem|imagens|catalogo|codigo|cod|pix|pagar|pagamento|entrega|endereco)\b/.test(normalized);
}

function looksLikeMauricioMfcPriorSelectionTotalInquiry(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized || normalized.length > 140) return false;
  if (looksLikeMauricioMfcCatalogPhotoRequest(value)) return false;
  if (/\b(?:pix|pagar|pagamento|entrega|endereco|retirada|motoboy)\b/.test(normalized)) return false;
  const asksValue = /\b(?:quanto|valor|preco|preco|total|orcamento|fica|ficaria|calcula|calcular)\b/.test(normalized);
  const referencesPriorSelection = /\b(?:esse|essa|esses|essas|este|esta|estes|estas|isso|itens?|pedido|pedi|escolhi|escolhidos|marquei|separei)\b/.test(normalized);
  return asksValue && referencesPriorSelection;
}

function buildMauricioMfcCartItemsFromRecentCaptionHistory(params: {
  currentMessage: string;
  conversationHistory: MauricioMfcHistoryEntry[];
}): MauricioMfcPendingCartItemSnapshot[] {
  const acabamentoContinuation = looksLikeMauricioMfcAcabamentoOnlyContinuation(params.currentMessage);
  const priorSelectionTotalInquiry = looksLikeMauricioMfcPriorSelectionTotalInquiry(params.currentMessage);
  if (!acabamentoContinuation && !priorSelectionTotalInquiry) {
    return [];
  }

  const acabamento = extractMauricioMfcAcabamento(params.currentMessage);
  if (acabamentoContinuation && !acabamento) {
    return [];
  }

  const inboundText = (params.conversationHistory || [])
    .slice(-20)
    .filter((entry) => !isMauricioMfcHistoryAgentEntry(entry))
    .map(getMauricioMfcHistoryText)
    .filter(Boolean)
    .join("\n");
  const normalizedInbound = normalizeMauricioMfcCatalogText(inboundText);
  const quantityMatch = normalizedInbound.match(/\b(\d{1,3})\s+de\s+cada\b/);
  const quantity = quantityMatch?.[1] ? Number(quantityMatch[1]) : null;
  if (!quantity || !Number.isFinite(quantity) || quantity <= 0) {
    return [];
  }

  const items: MauricioMfcPendingCartItemSnapshot[] = [];
  const seenCodes = new Set<number>();
  const lines = inboundText
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const codeMatch = line.match(/\b(?:c[oó]digo|codigo|cod)\s*\.?\s*(\d{1,4})\b/i);
    const code = Number(codeMatch?.[1]);
    if (!Number.isInteger(code) || code <= 0 || seenCodes.has(code)) {
      continue;
    }

    const kind = inferMauricioMfcContextItemKind(line);
    if (!kind) {
      continue;
    }

    const unitPrice = acabamento ? getMauricioMfcPrice({ kind, acabamento, quantidade: quantity }) : null;
    if (acabamento && unitPrice == null) {
      continue;
    }

    seenCodes.add(code);
    const product =
      line
        .replace(/^.*?\b(?:c[oó]digo|codigo|cod)\s*\.?\s*\d{1,4}\s*/i, "")
        .replace(/\b(?:costurado|sem[- ]?costura)\b[\s\S]*$/i, "")
        .replace(/\s+/g, " ")
        .trim() || `Codigo ${code}`;
    items.push({
      code,
      product,
      tamanho: null,
      acabamento: acabamento ? acabamento === "sem_costura" ? "Sem costura" : "Costurado" : null,
      quantidade: String(quantity),
      unitPrice,
      subtotal: unitPrice != null ? unitPrice * quantity : null,
      missing: acabamento ? [] : ["acabamento"],
    });
  }

  return items;
}

function buildMauricioMfcCompletedCartReply(items: MauricioMfcPendingCartItemSnapshot[]): string | null {
  if (items.length === 0) {
    return null;
  }

  const lines = [
    "Perfeito, vou continuar o pedido que ficou pendente:",
    "",
    ...items.flatMap((item, index) => [
      ...buildMauricioMfcPendingItemLines(item, index),
      "",
    ]),
  ];
  const total = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const missing = Array.from(new Set(items.flatMap((item) => item.missing || [])));
  if (missing.length > 0) {
    lines.push(`Me envie ${formatMauricioMfcMissingList(missing)} para eu fechar certinho.`);
  } else if (total > 0) {
    lines.push(`Total dos itens: ${formatMauricioMfcCurrency(total)}`);
    lines.push("Se estiver tudo certo, me diga a forma de pagamento para finalizar.");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildMauricioMfcPendingItemContinuationReply(params: {
  currentMessage: string;
  conversationHistory: MauricioMfcHistoryEntry[];
}): string | null {
  const currentMessage = String(params.currentMessage || "").trim();
  if (!currentMessage) return null;
  if (looksLikeMauricioMfcExplicitNewSelection(currentMessage)) return null;
  if (shouldBypassMauricioMfcPendingContinuationForCatalogMedia(currentMessage)) return null;

  const pendingItems = findLatestMauricioMfcPendingItems(params.conversationHistory || []);
  if (pendingItems.length > 0) {
    const updatedItems = pendingItems.map((item) => completeMauricioMfcPendingItem(item, currentMessage));
    const completed = updatedItems.every((item) => item.missing.length === 0);
    const lines = [
      completed
        ? "Perfeito, vou continuar o pedido que ficou pendente:"
        : "Vamos continuar do item que ficou pendente:",
      "",
      ...updatedItems.flatMap((item, index) => [
        ...buildMauricioMfcPendingItemLines(item, index),
        "",
      ]),
    ];
    const total = updatedItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    if (completed && total > 0) {
      lines.push(`Total dos itens: ${formatMauricioMfcCurrency(total)}`);
      lines.push("Se estiver tudo certo, me diga a forma de pagamento para finalizar.");
    } else {
      const missing = Array.from(new Set(updatedItems.flatMap((item) => item.missing)));
      lines.push(`Me envie ${formatMauricioMfcMissingList(missing)} para eu fechar certinho.`);
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const captionCartReply = buildMauricioMfcCompletedCartReply(
    buildMauricioMfcCartItemsFromRecentCaptionHistory({
      currentMessage,
      conversationHistory: params.conversationHistory || [],
    }),
  );
  if (captionCartReply) {
    return captionCartReply;
  }

  if (
    looksLikeMauricioMfcThemeCorrection(currentMessage) &&
    hasRecentMauricioMfcPanelAssumption(params.conversationHistory || [])
  ) {
    return [
      "Certo, vou tratar como tema Lilo STHIC.",
      "Para seguir certo, me diga se voce quer ver as fotos do tema ou se ja escolheu a foto/codigo.",
      "Tambem preciso saber se e painel lateral, painel redondo ou cilindro. Se for redondo, confirmo o tamanho depois.",
    ].join("\n");
  }

  return null;
}

export function looksLikeMauricioMfcCartResetIntent(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;
  return /\b(?:limpa|limpar|apaga|apagar|zera|zerar|novo pedido|outro pedido|troca tudo|trocar tudo|substitui|substituir|esquece o carrinho|cancela o carrinho)\b/.test(normalized);
}

function getMauricioMfcPrice(params: {
  kind: MauricioMfcCatalogItemKind;
  acabamento: MauricioMfcAcabamento;
  tamanho?: MauricioMfcRedondoSize | null;
  quantidade?: number | null;
}): number | null {
  if (params.kind === "lateral") {
    return params.acabamento === "sem_costura" ? 65 : 70;
  }

  if (params.kind === "cilindro") {
    return params.acabamento === "sem_costura" ? 80 : 100;
  }

  if (params.kind === "redondo") {
    return 60;
  }

  return null;
}

export function looksLikeMauricioMfcReady50x50PromoRequest(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;

  const mentionsPanel = /\b(?:painel|paineis|pain[eé]is)\b/.test(normalized);
  const mentions50x50 =
    /\b50\s*x\s*50\b/.test(normalized) ||
    /\b50x50\b/.test(normalized) ||
    /\bpain(?:el|eis|eis)\b.{0,30}\b50\b/.test(normalized) ||
    /\b50\b.{0,30}\bpain(?:el|eis|eis)\b/.test(normalized);
  if (!mentionsPanel || !mentions50x50) return false;

  const asksInfoOrPromo = /\b(?:promocao|promo|promocional|pronto|prontos|prontinho|prontinhos|costurado|costurados|tem|temos|quais|qual|preco|precos|valor|valores|link|foto|fotos|tema|temas|catalogo|opcoes|opcao)\b/.test(normalized);
  const asksToMakePanel50 = /\b(?:quero|preciso|vou|fazer|faz|montar|manda|mostra|envia)\b/.test(normalized);
  if (!asksInfoOrPromo && !asksToMakePanel50) return false;

  return !/\b(?:codigo|cod|item|itens|escolhi|vou querer|quero esse|quero essa|separe|separa|fechar|finalizar|pix|pagar|pagamento)\b/.test(normalized);
}

export function shouldIncludeMauricioMfcReady50x50Promo(
  entry: MauricioMfcCatalogEntryInput,
): boolean {
  if (!isMauricioMfcCatalogTenant(entry)) {
    return false;
  }
  if (entry.includeReady50x50Promo === true) {
    return true;
  }
  return looksLikeMauricioMfcReady50x50PromoRequest(entry.contextText);
}

export function containsMauricioMfcReady50x50PromoText(value: string | null | undefined): boolean {
  const raw = String(value || "");
  if (!raw.trim()) {
    return false;
  }
  if (raw.includes(MAURICIO_MFC_READY_50X50_PROMO_LINK)) {
    return true;
  }
  const normalized = normalizeMauricioMfcCatalogText(raw);
  return (
    /\b50\s*x\s*50\b.{0,120}\b(?:promocao|promo|promocional|pronto|prontos)\b/.test(normalized) ||
    /\b(?:promocao|promo|promocional|pronto|prontos)\b.{0,120}\b50\s*x\s*50\b/.test(normalized) ||
    /\b3\s+unidades\b.{0,40}\br\$\s*12/.test(normalized) ||
    /\b5\s+unidades\b.{0,40}\br\$\s*10/.test(normalized)
  );
}

export function buildMauricioMfcReady50x50PromoReply(): string {
  return [
    "Temos paineis 50x50 costurados prontos para uso nessa promocao:",
    "1 unidade R$ 15,00",
    "3 unidades R$ 12,00 cada",
    "5 unidades R$ 10,00 cada",
    "Acima de 10 unidades R$ 8,00 cada a vista",
    "No cartao tem acrescimo de R$ 1,00 por unidade.",
    `Fotos e temas: ${MAURICIO_MFC_READY_50X50_PROMO_LINK}`,
    "Tambem posso te enviar as fotos de um tema especifico, como Lilo/Stitch, Girassol, Galaxia, Hulk, Baby Shark, Tres Palavrinhas ou Super Mario.",
  ].join("\n");
}

export function getMauricioMfcCatalogPriceDescription(
  entry: MauricioMfcCatalogEntryInput,
): string | null {
  if (!isMauricioMfcCatalogTenant(entry)) {
    return null;
  }

  const isGenericArt = isMauricioMfcGenericArtCatalogEntry(entry);
  const specificKind = inferMauricioMfcSpecificCatalogItemKind(entry);
  const contextKind = isGenericArt ? inferMauricioMfcContextItemKind(entry.contextText) : null;
  const inferredKind = isGenericArt ? null : inferMauricioMfcCatalogItemKind(entry);
  const kind = specificKind || contextKind || inferredKind;

  if (kind === "lateral") {
    return `costurado ${formatMauricioMfcCurrency(70)}; sem costura ${formatMauricioMfcCurrency(65)}`;
  }

  if (kind === "cilindro") {
    return `costurado ${formatMauricioMfcCurrency(100)}; sem costura ${formatMauricioMfcCurrency(80)}`;
  }

  if (kind === "redondo") {
    const redondoPrices = shouldIncludeMauricioMfcReady50x50Promo(entry)
      ? [
          `painel redondo por foto/codigo ${formatMauricioMfcCurrency(60)}`,
          `50x50 costurado promocional pronto: ${getMauricioMfcReady50x50PromoPriceDescription()}`,
        ]
      : [`painel redondo por foto/codigo ${formatMauricioMfcCurrency(60)}`];
    return redondoPrices.join("; ");
  }

  return null;
}

export function buildMauricioMfcCatalogCaptionPriceLine(
  entry: MauricioMfcCatalogEntryInput,
): string | null {
  const description = getMauricioMfcCatalogPriceDescription(entry);
  return description ? `Valores: ${description}.` : null;
}

function looksLikeMauricioMfcPriceInquiry(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;
  return /\b(preco|precos|valor|valores|quanto fica|quanto custa|custa|fica|tabela)\b/.test(normalized);
}

export function buildMauricioMfcLinePriceInquiryReply(
  message: string | null | undefined,
): string | null {
  if (looksLikeMauricioMfcReady50x50PromoRequest(message)) {
    return null;
  }

  if (!looksLikeMauricioMfcPriceInquiry(message)) {
    return null;
  }

  const kind = resolveMauricioMfcRequestedLineKind(message);
  if (!kind) {
    return null;
  }

  if (kind === "redondo") {
    return [
      `Painel redondo por foto/codigo fica ${formatMauricioMfcCurrency(60)}.`,
      "Para fechar certinho, me envie o codigo da foto, quantidade e confirme se e esse item mesmo.",
      "Se voce estiver falando da promocao de painel 50x50 pronto, me avise que eu passo a tabela promocional separada.",
    ].join("\n");
  }

  if (kind === "cilindro") {
    return [
      `Cilindros ficam: costurado ${formatMauricioMfcCurrency(100)}; sem costura ${formatMauricioMfcCurrency(80)}.`,
      "Para fechar, me envie o codigo da foto, acabamento e quantidade.",
    ].join("\n");
  }

  if (kind === "lateral") {
    return [
      `Painel lateral fica: costurado ${formatMauricioMfcCurrency(70)}; sem costura ${formatMauricioMfcCurrency(65)}.`,
      "Para fechar, me envie o codigo da foto, acabamento e quantidade.",
    ].join("\n");
  }

  return null;
}

export function resolveMauricioMfcCatalogUnitPrice(
  entry: MauricioMfcCatalogEntryInput,
): MauricioMfcResolvedPrice {
  const kind = isMauricioMfcCatalogTenant(entry)
    ? inferMauricioMfcCatalogItemKind(entry)
    : null;
  const context = [
    entry.details?.acabamento,
    entry.details?.tamanho,
    entry.contextText,
    entry.variationCaption,
    entry.productDescription,
  ]
    .filter(Boolean)
    .join(" ");
  const acabamento = extractMauricioMfcAcabamento(entry.details?.acabamento || context);
  const tamanho = extractMauricioMfcRedondoSize(entry.details?.tamanho || context);
  const quantidade = extractMauricioMfcQuantity(entry.details?.quantidade || context);
  const description = getMauricioMfcCatalogPriceDescription(entry);

  if (!kind || !acabamento) {
    return {
      price: null,
      kind,
      acabamento,
      tamanho,
      description,
    };
  }

  return {
    price: getMauricioMfcPrice({ kind, acabamento, tamanho, quantidade }),
    kind,
    acabamento,
    tamanho,
    description,
  };
}

export function looksLikeMauricioMfcCatalogThemeContinuation(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;

  const hasContinuationSignal =
    /^(?:e|mais|tambem|tbm)\b/.test(normalized) ||
    /\b(?:tambem|tbm|mais um|mais uma|outro tema|outra tema|outro modelo|outra arte)\b/.test(normalized);
  if (!hasContinuationSignal) return false;

  return /\b(lilo|sthic|stich|stitch|chito|hulk|girassol|galaxia|galaxy|baby shark|shark|mario|super mario|tres palavrinhas|3 palavrinhas|abelhinha)\b/.test(normalized);
}

export function looksLikeMauricioMfcPixNegation(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized || !/\b(pix|pagar|pagamento|fechar|finalizar)\b/.test(normalized)) return false;

  return (
    /\bnao\b.{0,40}\b(?:manda|mande|mandar|envia|envie|enviar|passa|passe)\b.{0,40}\bpix\b/.test(normalized) ||
    /\bpix\b.{0,40}\b(?:nao|ainda nao|agora nao|depois|mais tarde)\b/.test(normalized) ||
    /\b(?:sem|nao)\s+pix\b/.test(normalized) ||
    /\bnao\b.{0,40}\b(?:vou|quero|posso)\b.{0,40}\b(?:pagar|fechar|finalizar)\b/.test(normalized) ||
    /\bainda\s+nao\b.{0,40}\b(?:pagar|fechar|finalizar|pix)\b/.test(normalized)
  );
}

export function looksLikeMauricioMfcPixPaymentRequest(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized || looksLikeMauricioMfcPixNegation(value)) return false;

  return (
    /\b(?:pix|chave pix|qr code|qrcode|qr pix)\b/.test(normalized) ||
    /\b(?:pode|quero|vou|vamos)\b.{0,40}\b(?:fechar|finalizar|pagar)\b/.test(normalized) ||
    /\b(?:fechar|finalizar|pagar)\b.{0,40}\b(?:pix|pedido|compra)\b/.test(normalized)
  );
}

const MAURICIO_MFC_EXTERNAL_FILE_EXTENSIONS = [
  ".apk",
  ".exe",
  ".msi",
  ".dmg",
  ".ipa",
  ".zip",
  ".rar",
  ".7z",
];

function isMauricioMfcWhitespace(value: string): boolean {
  return value === " " || value === "\n" || value === "\r" || value === "\t";
}

function trimMauricioMfcUrlToken(value: string): string {
  let end = value.length;
  while (end > 0 && ".,;:!?)]}\"'".includes(value[end - 1])) {
    end -= 1;
  }
  return value.slice(0, end);
}

export function extractMauricioMfcHttpUrls(value: string | null | undefined): string[] {
  const text = String(value || "");
  const urls: string[] = [];
  let index = 0;

  while (index < text.length) {
    const httpIndex = text.indexOf("http", index);
    if (httpIndex < 0) break;
    let end = httpIndex;
    while (end < text.length && !isMauricioMfcWhitespace(text[end])) {
      end += 1;
    }
    const token = trimMauricioMfcUrlToken(text.slice(httpIndex, end));
    if (token.startsWith("http://") || token.startsWith("https://")) {
      urls.push(token);
    }
    index = Math.max(end, httpIndex + 4);
  }

  return urls;
}

function hasMauricioMfcExternalFileExtension(value: string | null | undefined): boolean {
  const lower = String(value || "").toLowerCase();
  return MAURICIO_MFC_EXTERNAL_FILE_EXTENSIONS.some((extension) => lower.includes(extension));
}

function isMauricioMfcKnownCatalogUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      url === MAURICIO_MFC_READY_50X50_PROMO_LINK ||
      host === "photos.app.goo.gl" ||
      host.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
}

export function looksLikeMauricioMfcUnsupportedExternalFileOrLink(value: string | null | undefined): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;

  if (hasMauricioMfcExternalFileExtension(raw)) {
    return true;
  }

  const urls = extractMauricioMfcHttpUrls(raw);
  if (urls.length === 0) return false;
  return urls.some((url) => !isMauricioMfcKnownCatalogUrl(url));
}

export function looksLikeMauricioMfcPostSaleIssue(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;

  return (
    /\b(?:danificado|danificada|avariado|avariada|defeito|defeituoso|defeituosa|quebrado|quebrada|rasgado|rasgada)\b/.test(normalized) ||
    /\b(?:furo|furado|furada|buraco|buracos)\b/.test(normalized) ||
    /\b(?:tamanho|medida)\b.{0,40}\b(?:diferente|errado|errada|veio|recebi|chegou)\b/.test(normalized) ||
    /\b(?:veio|recebi|chegou)\b.{0,50}\b(?:errado|errada|diferente|com problema|problema)\b/.test(normalized) ||
    /\b(?:imagem|impressao|foto|arte)\b.{0,50}\b(?:ruim|falhada|borrada|torta|apagada|manchada|nao ficou legal|n[aã]o ficou boa)\b/.test(normalized) ||
    /\b(?:material|painel|produto|pedido)\b.{0,50}\b(?:problema|errado|errada|danificado|danificada|defeito)\b/.test(normalized) ||
    /\b(?:nao gostei do resultado|n[aã]o gostei do resultado|ficou ruim|ficou errado|ficou errada|quero resolver)\b/.test(normalized)
  );
}

export function looksLikeMauricioMfcNormalCatalogTurn(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;
  if (looksLikeMauricioMfcPostSaleIssue(value)) return false;
  if (looksLikeMauricioMfcUnsupportedExternalFileOrLink(value)) return false;
  if (looksLikeMauricioMfcDeliveryHandoffRequest(value)) return false;
  if (looksLikeMauricioMfcAddressRequest(value)) return false;
  if (looksLikeMauricioMfcPixPaymentRequest(value)) return false;

  return (
    /\b(?:quanto fica|quanto custa|preco|precos|valor|valores|orcamento|orcamentos|tabela|custa|fica|ficaria)\b/.test(normalized) ||
    /\b(?:tema|temas|catalogo|catalogos|foto|fotos|imagem|imagens|codigo|cod|painel|redondo|cilindro|lateral|acabamento|quantidade)\b/.test(normalized)
  );
}

export function buildMauricioMfcPostSaleIssueReply(params: {
  alreadySentEvidence?: boolean | null;
} = {}): string {
  if (params.alreadySentEvidence) {
    return [
      "Recebemos as imagens, obrigado.",
      "Vamos encaminhar para a equipe responsável analisar o material e retornar com uma posição.",
    ].join("\n");
  }

  return [
    "Olá! Pedimos desculpas pelo transtorno.",
    "",
    "Para que possamos verificar o ocorrido e encontrar uma solução, por favor envie fotos e/ou vídeos mostrando o problema do material ou painel recebido.",
    "",
    "Após o recebimento, vamos encaminhar as informações para a equipe responsável analisar e retornar com uma posição.",
    "",
    "Ficamos no aguardo das imagens. Obrigado!",
  ].join("\n");
}

export function buildMauricioMfcUnsupportedExternalFileOrLinkReply(): string {
  return [
    "Recebi o arquivo/link, mas nao consigo analisar esse tipo de material por aqui.",
    "Para eu te ajudar no pedido da MFC, me diga qual tema, painel, codigo, acabamento ou duvida voce quer tratar.",
    "Se for uma referencia visual, envie uma imagem do modelo ou descreva o que precisa.",
  ].join("\n");
}

export function looksLikeMauricioMfcDeliveryHandoffRequest(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;
  if (looksLikeMauricioMfcUnsupportedExternalFileOrLink(value)) return false;

  const isProductSelection =
    /\b(?:codigo|cod|item|itens|foto|fotos|arte|artes|painel|lateral|cilindro|redondo|acabamento|quantidade|sem costura|costurado|pix|pagamento|pagar)\b/.test(normalized);
  if (isProductSelection) return false;

  const asksDelivery =
    /\b(?:motoboy|moto boy|entrega|entregar|delivery|frete|taxa|prazo|uber flash|uber|aplicativo)\b/.test(normalized) ||
    (/\bapp\b/.test(normalized) && /\b(?:entrega|entregar|retirada|retirar|uber|motoboy|moto boy|frete)\b/.test(normalized));
  const asksCourierForPickup =
    /\b(?:retirada|retirar)\b/.test(normalized) &&
    /\b(?:uber|uber flash|motoboy|moto boy|aplicativo|app|entrega|frete)\b/.test(normalized);

  return asksDelivery || asksCourierForPickup;
}

export function looksLikeMauricioMfcAddressRequest(value: string | null | undefined): boolean {
  const normalized = normalizeMauricioMfcCatalogText(value);
  if (!normalized) return false;
  if (looksLikeMauricioMfcDeliveryHandoffRequest(value)) return false;

  return /\b(?:endereco|localizacao|loja|retirada|retirar|como chegar|onde fica|fachada|entrada da loja|ponto de referencia)\b/.test(normalized);
}

export function buildMauricioMfcDedicatedAddressReply(): string {
  return [
    "Pode retirar na loja. O endereco e Estrada da Liberdade, 320, bairro Liberdade, Salvador.",
    "Referencia: em frente ao Magazine Luiza e ao lado da Biju Glamour.",
    "Atendimento da loja: segunda a sabado, das 8h as 17h.",
  ].join("\n");
}

export function buildMauricioMfcDeliveryHandoffReply(): string {
  return [
    "A loja nao tem motoboy proprio e nao faz entrega propria.",
    "Para receber em casa, voce pode pedir Uber Flash/aplicativo ou combinar direto com um motoboy terceirizado.",
    "Contatos de motoboys terceirizados: Leo (71) 98784-0840; Jorge (71) 99346-5814; Danilo (moto e carro) (71) 98113-7563 ou (71) 98538-5093; Cris (71) 99958-2664; Marcelo (71) 98360-7178.",
    "Valor e prazo da corrida devem ser combinados direto com o motoboy ou aplicativo.",
    "Se preferir retirar na loja: Estrada da Liberdade, 320, bairro Liberdade, Salvador. Atendimento de segunda a sabado, das 8h as 17h.",
  ].join("\n");
}

export function resolveMauricioMfcDedicatedTurnFallback(params: {
  message: string | null | undefined;
}): MauricioMfcDedicatedTurnDecision {
  if (looksLikeMauricioMfcPostSaleIssue(params.message)) {
    return {
      kind: "post_sale_issue",
      confidence: 96,
      reason: "cliente relatou problema de pos-venda com material, painel ou produto",
    };
  }
  if (looksLikeMauricioMfcUnsupportedExternalFileOrLink(params.message)) {
    return {
      kind: "unsupported_external_file_or_link",
      confidence: 95,
      reason: "arquivo ou link externo recebido no atendimento MFC",
    };
  }
  if (looksLikeMauricioMfcDeliveryHandoffRequest(params.message)) {
    return {
      kind: "delivery",
      confidence: 92,
      reason: "cliente perguntou sobre motoboy, entrega, frete ou Uber Flash",
    };
  }
  if (looksLikeMauricioMfcAddressRequest(params.message)) {
    return {
      kind: "address",
      confidence: 92,
      reason: "cliente pediu endereco, loja, retirada ou como chegar",
    };
  }
  if (looksLikeMauricioMfcPixPaymentRequest(params.message)) {
    return {
      kind: "pix",
      confidence: 90,
      reason: "cliente pediu Pix ou finalizacao de pagamento",
    };
  }
  return {
    kind: "none",
    confidence: 80,
    reason: "turno deve seguir o fluxo normal do agente",
  };
}

export function buildMauricioMfcCatalogPromptBlock(params: {
  userId?: string | null;
  userEmail?: string | null;
}): string {
  if (!isMauricioMfcCatalogTenant(params)) {
    return "";
  }

  return `
**CALIBRACAO MFC 50X50 PROMO 2026-05-29:**
- Nao monte carrinho so porque o cliente pediu fotos, valores, promocao ou opcoes. Carrinho comeca quando ele escolher codigos, imagens ou itens.
- Se o cliente pedir painel 50x50, painel de 50, painel pronto, promocao ou link das fotos, informe a promocao dos paineis 50x50 costurados prontos e envie o link ${MAURICIO_MFC_READY_50X50_PROMO_LINK}.
- Promocao painel 50x50 costurado pronto: ${getMauricioMfcReady50x50PromoPriceDescription()}.
- Lilo, Stitch, Stich, Sthic e Chito sao o mesmo tema Lilo/Stitch. Se o cliente pedir Chito ou Stitch, envie o tema Lilo/Stitch.

**REGRAS DO CATALOGO MFC SUBLIMACAO:**
- Quando o cliente pedir um ou mais temas, responda naturalmente e envie todas as fotos cadastradas de cada tema pedido. Nao diga que recebeu fotos se foi o agente que enviou.
- Depois de enviar fotos de tema, peca para o cliente informar o codigo, nome da arte ou reenviar a foto escolhida, junto com acabamento, tamanho quando houver e quantidade.
- Nao monte carrinho so porque o cliente pediu para ver fotos. Carrinho comeca quando ele escolher codigos, imagens ou itens.
- Painel lateral e cilindros precisam de acabamento e quantidade. Nao precisam de tamanho.
- Painel redondo precisa de tamanho, acabamento e quantidade.
- Tabela MFC: painel lateral costurado R$ 70,00 e sem costura R$ 65,00.
- Tabela MFC: cilindro/capa de cilindro costurado R$ 100,00 e sem costura R$ 80,00.
- Tabela MFC: painel redondo por foto/codigo R$ 60,00. Nao use a tabela antiga de R$ 15,00, R$ 25,00 ou R$ 55,00 quando o cliente estiver falando do catalogo por foto/codigo.
- A promocao de painel 50x50 pronto so deve aparecer quando o cliente pedir explicitamente promocao, painel 50 pronto ou o link/fotos da promocao.
- Se o cliente informar sem costura, use sempre o valor sem costura da tabela MFC, mesmo que a foto tenha um valor base cadastrado.
- So envie Pix, QR Code ou formas de pagamento depois que os itens estiverem completos e o cliente escolher ou pedir pagamento.
- So envie endereco ou foto da loja quando o cliente pedir endereco, localizacao, loja, retirada ou como chegar.
- O atendimento da loja e de segunda a sabado, das 08h as 17h. Domingo e fechado. Nao informe retorno apenas na segunda quando o proximo dia de atendimento for sabado.
- Orientacao sobre arte personalizada/designer so entra quando o cliente escolher "catalogo de fotos de artes" ou pedir arte personalizada. Se o cliente escolheu painel, cilindro ou item por codigo/foto, trate como produto do pedido e monte carrinho, nao como pedido de arte.
`;
}
