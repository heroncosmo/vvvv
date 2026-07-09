import { repairMojibakeText } from "@shared/mojibake";

type ConversationHistoryItem = {
  text?: string | null;
  mediaCaption?: string | null;
  fromMe?: boolean | null;
  isFromAgent?: boolean | null;
};

type BusinessFaqItem = {
  pergunta?: string | null;
  question?: string | null;
  resposta?: string | null;
  answer?: string | null;
  categoria?: string | null;
  category?: string | null;
  keywords?: unknown;
  directAnswer?: boolean;
  deterministic?: boolean;
  contextualFollowup?: boolean;
  useHistoryForShortReply?: boolean;
  requiresAdult?: boolean;
  requireAdult?: boolean;
  minAge?: number;
  missingRequirementAnswer?: string | null;
  answerIfRequirementMissing?: string | null;
  minorAnswer?: string | null;
};

type BusinessConfigLike = {
  agentName?: string | null;
  agent_name?: string | null;
  faqItems?: unknown;
  faq_items?: unknown;
};

const STOPWORDS = new Set([
  "a",
  "as",
  "ao",
  "aos",
  "da",
  "de",
  "do",
  "dos",
  "das",
  "e",
  "em",
  "eu",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "que",
  "qual",
  "quais",
  "como",
  "com",
  "uma",
  "um",
  "voce",
  "voces",
]);

const TOKEN_CANONICAL_GROUPS: Array<{ canonical: string; aliases: string[] }> = [
  {
    canonical: "gratis",
    aliases: ["gratis", "gratuito", "gratuita", "free"],
  },
  {
    canonical: "preco",
    aliases: [
      "assinar",
      "assinatura",
      "custa",
      "custam",
      "custo",
      "mensal",
      "mensalidade",
      "pagar",
      "pagamento",
      "pago",
      "plano",
      "planos",
      "preco",
      "precos",
      "valor",
      "valores",
    ],
  },
  {
    canonical: "configurar",
    aliases: [
      "ajuda",
      "ajudar",
      "ajude",
      "configura",
      "configuram",
      "configurando",
      "configurarem",
      "configuracao",
      "configurar",
      "configurem",
      "configuro",
      "instalar",
      "montar",
      "pronto",
    ],
  },
  {
    canonical: "comecar",
    aliases: ["cadastro", "cadastrar", "comecar", "conta", "criar", "entrar", "link", "site"],
  },
  {
    canonical: "whatsapp",
    aliases: ["zap", "whats", "whatsapp"],
  },
];

const TOKEN_CANONICAL_MAP = new Map(
  TOKEN_CANONICAL_GROUPS.flatMap((group) => group.aliases.map((alias) => [alias, group.canonical] as const)),
);

const HIGH_CONFIDENCE_SHORT_TOKENS = new Set(["comecar", "configurar", "entrega", "gratis", "preco", "suporte", "whatsapp"]);
const LOW_CONTEXT_TOKENS_FOR_DIRECT_FAQ = new Set([
  "agente",
  "app",
  "basico",
  "conta",
  "hoje",
  "plataforma",
  "preco",
  "sistema",
  "tem",
  "teste",
  "usar",
  "whatsapp",
]);

function canonicalizeToken(token: string): string {
  return TOKEN_CANONICAL_MAP.get(token) || token;
}

function normalizeText(value: unknown): string {
  return repairMojibakeText(String(value || ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: unknown): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .map(canonicalizeToken);
}

function collectKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\n;|]+/g)
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  return [];
}

function extractAges(value: string): number[] {
  const ages: number[] = [];
  for (const match of value.matchAll(/\b(\d{1,2})\s*(?:anos?|ano)?\b/g)) {
    const age = Number(match[1]);
    if (Number.isFinite(age) && age > 0 && age < 100) {
      ages.push(age);
    }
  }
  return Array.from(new Set(ages));
}

function buildRelevantHistoryText(history: ConversationHistoryItem[] | undefined): string {
  return (history || [])
    .slice(-6)
    .filter((entry) => !entry.fromMe && !entry.isFromAgent)
    .map((entry) => [entry.text, entry.mediaCaption].filter(Boolean).join(" "))
    .join(" ");
}

function hasAdultSignal(text: string, minAge: number): boolean {
  const ages = extractAges(text);
  if (ages.some((age) => age >= minAge)) return true;
  return /\b(adulto|adulta|maior de idade|18\+)\b/.test(text);
}

function hasMinorSignal(text: string, minAge: number): boolean {
  const ages = extractAges(text);
  if (ages.some((age) => age > 0 && age < minAge)) return true;
  return /\b(filho|filha|crianca|adolescente|menor|infantil)\b/.test(text);
}

function getFaqItems(config: BusinessConfigLike | null | undefined): BusinessFaqItem[] {
  const raw = config?.faqItems ?? config?.faq_items;
  return Array.isArray(raw) ? raw.filter((item): item is BusinessFaqItem => Boolean(item && typeof item === "object")) : [];
}

function scoreFaqMatch(messageTokens: Set<string>, item: BusinessFaqItem): { score: number; matchedTokens: Set<string> } {
  const question = item.pergunta || item.question || "";
  const category = item.categoria || item.category || "";
  const keywordPhrases = collectKeywords(item.keywords);
  const candidateTokens = new Set([
    ...tokenize(question),
    ...tokenize(category),
    ...keywordPhrases.flatMap((keyword) => tokenize(keyword)),
  ]);

  let score = 0;
  const matchedTokens = new Set<string>();
  for (const token of candidateTokens) {
    if (messageTokens.has(token)) {
      matchedTokens.add(token);
      score += 1;
    }
  }

  for (const phrase of keywordPhrases) {
    const phraseTokens = tokenize(phrase);
    if (phraseTokens.length > 0 && phraseTokens.every((token) => messageTokens.has(token))) {
      for (const token of phraseTokens) {
        matchedTokens.add(token);
      }
      score += phraseTokens.length + 1;
    }
  }

  return { score, matchedTokens };
}

function isHighConfidenceShortMatch(messageTokens: Set<string>, match: { score: number; matchedTokens: Set<string> }, item: BusinessFaqItem): boolean {
  if (match.score < 1) return false;
  const hasHighConfidenceToken = [...match.matchedTokens].some((token) => HIGH_CONFIDENCE_SHORT_TOKENS.has(token));
  if (hasHighConfidenceToken) {
    if (messageTokens.size <= 2) return true;
    const lowContextTokens = [...messageTokens].filter(
      (token) => !match.matchedTokens.has(token) && !LOW_CONTEXT_TOKENS_FOR_DIRECT_FAQ.has(token),
    );
    if (lowContextTokens.length <= 1 && messageTokens.size <= 5) return true;
  }

  const question = item.pergunta || item.question || "";
  const category = item.categoria || item.category || "";
  const keywordPhrases = collectKeywords(item.keywords);
  const candidateTokens = new Set([
    ...tokenize(question),
    ...tokenize(category),
    ...keywordPhrases.flatMap((keyword) => tokenize(keyword)),
  ]);

  return candidateTokens.size <= 2;
}

function isShortContextualReply(text: string): boolean {
  if (!text || text.length > 48) return false;
  return /^(sim|sim pode|pode|pode sim|pode mandar|pode enviar|manda|envia|quero|quero sim|isso|isso mesmo|claro|ok|okay|certo|perfeito|beleza|por favor)$/.test(text);
}

function hasSpecificMediaRequest(text: string): boolean {
  const hasMediaIntent = /\b(foto|fotos|imagem|imagens|video|videos|midia|midias)\b/.test(text);
  if (!hasMediaIntent) return false;

  return (
    /\b\d+\s*(?:x|por)\s*\d+\b/.test(text) ||
    /\b(com|sem)\s+(?:fechamento|fechamentos|lateral|laterais|balcao|balcoes)\b/.test(text) ||
    /\b(modelo|produto|item|peca|unidade|tamanho|medida|cor)\b/.test(text)
  );
}

function shouldUseHistoryForShortReply(item: BusinessFaqItem): boolean {
  return item.contextualFollowup === true || item.useHistoryForShortReply === true;
}

function formatDirectAnswer(answer: string): string {
  const trimmed = answer.trim();
  if (!trimmed) return "";
  return trimmed;
}

export function buildBusinessFaqDirectAnswer(params: {
  message: unknown;
  conversationHistory?: ConversationHistoryItem[];
  businessConfig?: BusinessConfigLike | null;
}): string | null {
  const messageText = normalizeText(params.message);
  if (!messageText) return null;
  if (hasSpecificMediaRequest(messageText)) return null;

  const faqItems = getFaqItems(params.businessConfig);
  if (faqItems.length === 0) return null;

  const historyText = normalizeText(buildRelevantHistoryText(params.conversationHistory));
  const combinedText = [historyText, messageText].filter(Boolean).join(" ");
  const messageTokens = new Set(tokenize(messageText));
  const historyTokens = new Set(tokenize(historyText));
  const canUseHistoryForShortReply = isShortContextualReply(messageText) && historyTokens.size > 0;

  let best: { item: BusinessFaqItem; score: number } | null = null;
  for (const item of faqItems) {
    if (item.directAnswer !== true && item.deterministic !== true) continue;
    const answer = item.resposta || item.answer || "";
    if (!String(answer || "").trim()) continue;

    let match = scoreFaqMatch(messageTokens, item);
    let usedContextualHistory = false;
    if (canUseHistoryForShortReply && shouldUseHistoryForShortReply(item)) {
      const contextualTokens = new Set([...historyTokens, ...messageTokens]);
      const contextualMatch = scoreFaqMatch(contextualTokens, item);
      if (contextualMatch.score > match.score) {
        match = contextualMatch;
        usedContextualHistory = true;
      }
    }

    const minimumScore = usedContextualHistory ? 2 : isHighConfidenceShortMatch(messageTokens, match, item) ? 1 : 2;
    if (match.score < minimumScore) continue;
    if (!best || match.score > best.score) {
      best = { item, score: match.score };
    }
  }

  if (!best) return null;

  const item = best.item;
  const minAge = Number.isFinite(Number(item.minAge)) ? Number(item.minAge) : 18;
  const requiresAdult = item.requiresAdult === true || item.requireAdult === true;

  if (requiresAdult) {
    if (hasMinorSignal(combinedText, minAge)) {
      const minorAnswer = String(item.minorAnswer || "").trim();
      return minorAnswer ? formatDirectAnswer(minorAnswer) : null;
    }

    if (!hasAdultSignal(combinedText, minAge)) {
      const missingAnswer = String(item.missingRequirementAnswer || item.answerIfRequirementMissing || "").trim();
      return missingAnswer ? formatDirectAnswer(missingAnswer) : null;
    }
  }

  return formatDirectAnswer(String(item.resposta || item.answer || ""));
}
