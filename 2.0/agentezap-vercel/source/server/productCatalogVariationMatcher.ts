import { extractFirstJsonObject } from "./blogUtils";
import { chatComplete, type ChatMessage } from "./llm";

export interface CatalogVariationMatchCandidate {
  mediaId: string;
  productId: string;
  productName: string;
  productCategory?: string | null;
  productPrice?: string | null;
  fileName?: string | null;
  caption?: string | null;
  variationCode?: number | null;
  variationName?: string | null;
  variationPrice?: string | null;
  variationStock?: number | null;
  variationIsActive?: boolean;
}

export interface CatalogVariationMatchInput {
  customerImageDescription: string;
  customerMessage?: string | null;
  conversationHistory?: Array<{ fromMe?: boolean; text?: string | null }>;
  candidates: CatalogVariationMatchCandidate[];
}

export interface CatalogVariationMatchResult {
  matched: boolean;
  productId: string | null;
  mediaId: string | null;
  matches?: CatalogVariationMatchItem[];
  confidence: number;
  reason: string;
}

export interface CatalogVariationMatchItem {
  productId: string;
  mediaId: string;
  confidence?: number;
  reason?: string;
}

interface CatalogVariationMatchDeps {
  chatCompleteFn?: typeof chatComplete;
}

interface ParsedCatalogVariationDecision {
  decision: "MATCH" | "NO_MATCH";
  productId: string | null;
  mediaId: string | null;
  matches: CatalogVariationMatchItem[];
  confidence: number;
  reason: string;
}

const MAX_CATALOG_VARIATION_MATCHES = 10;

function hasCodeLabelBefore(text: string, digitStart: number): boolean {
  const before = text.slice(Math.max(0, digitStart - 18), digitStart).toLowerCase();
  const labels = ["codigo", "código", "cod", "cód"];

  return labels.some((label) => before.includes(label));
}

function extractMentionedVariationCodes(text: string, knownCodes: Set<number>): number[] {
  const codes: number[] = [];
  const seen = new Set<number>();
  let index = 0;
  let listContextBudget = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === "\n" || char === "\r" || char === "." || char === ";" || char === ":") {
      listContextBudget = 0;
      index += 1;
      continue;
    }

    const lowerTail = text.slice(index).toLowerCase();
    if (lowerTail.startsWith("codigos") || lowerTail.startsWith("códigos")) {
      listContextBudget = 96;
      index += 7;
      continue;
    }
    if (lowerTail.startsWith("codigo") || lowerTail.startsWith("código")) {
      listContextBudget = 96;
      index += 6;
      continue;
    }
    if (lowerTail.startsWith("cod") || lowerTail.startsWith("cód")) {
      listContextBudget = 96;
      index += 3;
      continue;
    }

    if (char < "0" || char > "9") {
      if (listContextBudget > 0 && char !== "," && char !== " " && char !== "\t" && char !== "e") {
        listContextBudget = Math.max(0, listContextBudget - 1);
      }
      index += 1;
      continue;
    }

    let digits = "";
    while (index < text.length) {
      const digit = text[index];
      if (digit < "0" || digit > "9") break;
      digits += digit;
      index += 1;
    }

    const code = Number(digits);
    const digitStart = index - digits.length;
    if (
      Number.isInteger(code) &&
      knownCodes.has(code) &&
      (hasCodeLabelBefore(text, digitStart) || listContextBudget > 0) &&
      !seen.has(code)
    ) {
      seen.add(code);
      codes.push(code);
    }

    if (listContextBudget > 0) {
      listContextBudget = Math.max(0, listContextBudget - 1);
    }
  }

  return codes;
}

function parseCatalogVariationMatchItems(value: unknown): CatalogVariationMatchItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: CatalogVariationMatchItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const productId = typeof record.productId === "string" ? record.productId.trim() : "";
    const mediaId = typeof record.mediaId === "string" ? record.mediaId.trim() : "";
    if (!productId || !mediaId) {
      continue;
    }

    items.push({
      productId,
      mediaId,
      confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : undefined,
      reason: typeof record.reason === "string" ? record.reason.trim() : undefined,
    });

    if (items.length >= MAX_CATALOG_VARIATION_MATCHES) {
      break;
    }
  }

  return items;
}

function parseCatalogVariationDecision(rawResponse: string): ParsedCatalogVariationDecision | null {
  const parsed = extractFirstJsonObject(String(rawResponse || "").trim()) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") return null;

  try {
    return {
      decision: parsed?.decision === "MATCH" ? "MATCH" : "NO_MATCH",
      productId: typeof parsed?.productId === "string" && parsed.productId.trim() ? parsed.productId.trim() : null,
      mediaId: typeof parsed?.mediaId === "string" && parsed.mediaId.trim() ? parsed.mediaId.trim() : null,
      matches: parseCatalogVariationMatchItems(parsed?.matches),
      confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : 0,
      reason: typeof parsed?.reason === "string" ? parsed.reason.trim() : "",
    };
  } catch (error) {
    console.warn("[CatalogVariationMatcher] Falha ao parsear resposta:", error);
    return null;
  }
}

export async function matchCatalogVariationFromCustomerImage(
  input: CatalogVariationMatchInput,
  deps: CatalogVariationMatchDeps = {},
): Promise<CatalogVariationMatchResult | null> {
  const description = String(input.customerImageDescription || "").trim();
  const activeCandidates = (input.candidates || []).filter(
    (candidate) =>
      String(candidate.mediaId || "").trim() &&
      String(candidate.productId || "").trim() &&
      String(candidate.productName || "").trim() &&
      candidate.variationIsActive !== false,
  );

  if (!description || activeCandidates.length === 0) {
    return null;
  }

  const candidatesByCode = new Map<number, CatalogVariationMatchCandidate>();
  for (const candidate of activeCandidates) {
    if (typeof candidate.variationCode === "number" && !candidatesByCode.has(candidate.variationCode)) {
      candidatesByCode.set(candidate.variationCode, candidate);
    }
  }

  const mentionedCodes = extractMentionedVariationCodes(
    [
      input.customerMessage,
      description,
      ...(input.conversationHistory || []).map((message) => message.text),
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n"),
    new Set(candidatesByCode.keys()),
  );

  if (mentionedCodes.length > 1) {
    const exactMatches = mentionedCodes
      .slice(0, MAX_CATALOG_VARIATION_MATCHES)
      .map((code) => candidatesByCode.get(code))
      .filter((candidate): candidate is CatalogVariationMatchCandidate => Boolean(candidate))
      .map((candidate) => ({
        productId: candidate.productId,
        mediaId: candidate.mediaId,
        confidence: 100,
        reason: `Codigo ${candidate.variationCode} informado no contexto da imagem do cliente.`,
      }));

    if (exactMatches.length > 0) {
      return {
        matched: true,
        productId: exactMatches[0].productId,
        mediaId: exactMatches[0].mediaId,
        matches: exactMatches,
        confidence: 100,
        reason: `${exactMatches.length} codigos informados no contexto da imagem do cliente.`,
      };
    }
  }

  if (mentionedCodes.length === 1) {
    const candidate = candidatesByCode.get(mentionedCodes[0]);
    if (candidate) {
      return {
        matched: true,
        productId: candidate.productId,
        mediaId: candidate.mediaId,
        matches: [{ productId: candidate.productId, mediaId: candidate.mediaId, confidence: 100 }],
        confidence: 100,
        reason: `Código ${mentionedCodes[0]} informado no contexto da imagem do cliente.`,
      };
    }
  }

  const recentHistory = (input.conversationHistory || [])
    .slice(-6)
    .map((message) => `${message.fromMe ? "Atendente" : "Cliente"}: ${String(message.text || "").trim()}`)
    .filter((line) => !line.endsWith(":"))
    .join("\n");

  const candidateList = activeCandidates.slice(0, 80).map((candidate) => ({
    mediaId: candidate.mediaId,
    productId: candidate.productId,
    productName: candidate.productName,
    category: candidate.productCategory || "",
    productPrice: candidate.productPrice || "",
    fileName: candidate.fileName || "",
    caption: candidate.caption || "",
    variationCode: candidate.variationCode ?? null,
    variationName: candidate.variationName || "",
    variationPrice: candidate.variationPrice || "",
    variationStock: candidate.variationStock ?? null,
  }));

  const systemPrompt = `Voce decide se a imagem enviada pelo cliente corresponde a uma ou mais variacoes ja cadastradas no catalogo.

Regras:
- Use a descricao visual da imagem enviada pelo cliente como fonte principal.
- Compare com os candidatos do catalogo e escolha somente se houver correspondencia realmente forte.
- Leve em conta nome do produto, nome do arquivo, caption, categoria, nome da variacao, preco da variacao e codigo da variacao.
- Se a imagem/legenda trouxer varios itens ou codigos, preserve ate ${MAX_CATALOG_VARIATION_MATCHES} correspondencias exatas em "matches", na mesma ordem.
- Se houver duvida real, responda NO_MATCH.
- Responda apenas JSON valido no formato:
{"decision":"MATCH|NO_MATCH","productId":"primeiro-produto-ou-null","mediaId":"primeira-midia-ou-null","matches":[{"productId":"...","mediaId":"...","confidence":0-100,"reason":"..."}],"confidence":0-100,"reason":"..."}
`;

  const userPrompt = `DESCRIÇÃO DA IMAGEM DO CLIENTE:
${description}

MENSAGEM ATUAL DO CLIENTE:
${String(input.customerMessage || "").trim() || "(sem texto adicional)"}

HISTÓRICO RECENTE:
${recentHistory || "(sem histórico relevante)"}

CANDIDATOS DO CATÁLOGO:
${JSON.stringify(candidateList, null, 2)}`;

  const chatCompleteFn = deps.chatCompleteFn || chatComplete;

  try {
    const response = await chatCompleteFn({
      messages: [
        { role: "system", content: systemPrompt } satisfies ChatMessage,
        { role: "user", content: userPrompt } satisfies ChatMessage,
      ],
      temperature: 0,
      maxTokens: 220,
    });

    const raw = String(response.choices?.[0]?.message?.content || "").trim();
    const parsed = parseCatalogVariationDecision(raw);
    if (!parsed) {
      return null;
    }

    const validMediaIds = new Set(activeCandidates.map((candidate) => candidate.mediaId));
    const validProductIds = new Set(activeCandidates.map((candidate) => candidate.productId));
    const parsedMatches = parsed.matches.filter(
      (match) => validMediaIds.has(match.mediaId) && validProductIds.has(match.productId),
    );
    const hasValidIds =
      parsed.mediaId &&
      parsed.productId &&
      validMediaIds.has(parsed.mediaId) &&
      validProductIds.has(parsed.productId);
    const fallbackMatches = hasValidIds
      ? [{ productId: parsed.productId!, mediaId: parsed.mediaId!, confidence: parsed.confidence, reason: parsed.reason }]
      : [];
    const matches = Array.from(
      new Map(
        [...parsedMatches, ...fallbackMatches]
          .slice(0, MAX_CATALOG_VARIATION_MATCHES)
          .map((match) => [`${match.productId}:${match.mediaId}`, match]),
      ).values(),
    );

    const matched = parsed.decision === "MATCH" && parsed.confidence >= 70 && matches.length > 0;

    return {
      matched,
      productId: matched ? matches[0]?.productId || null : null,
      mediaId: matched ? matches[0]?.mediaId || null : null,
      matches: matched ? matches : [],
      confidence: parsed.confidence,
      reason: parsed.reason || "",
    };
  } catch (error) {
    console.warn("[CatalogVariationMatcher] Falha ao identificar variação por imagem:", error);
    return null;
  }
}
