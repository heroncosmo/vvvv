import type { AdminMedia } from "./adminMediaStore";

type ConversationEntry = {
  role: "user" | "assistant";
  content: string;
};

type ClassifierInput = {
  clientMessage: string;
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>;
  mediaLibrary: Array<{
    name: string;
    type: "audio" | "image" | "video" | "document";
    whenToUse?: string | null;
    isActive?: boolean;
  }>;
  sentMedias?: string[];
  aiResponseText?: string;
};

type ClassifierResult = {
  shouldSend: boolean;
  mediaName: string | null;
  confidence: number;
  reason: string;
};

type ResolveSelectionParams = {
  messageText: string;
  replyText: string;
  conversationHistory: ConversationEntry[];
  mediaLibrary: AdminMedia[];
  classify?: (input: ClassifierInput) => Promise<ClassifierResult>;
};

type SendMediaAction = {
  type: "send_media";
  media_name: string;
  mediaData: AdminMedia;
};

export type AdminContextualMediaSelection = {
  harmonizedText: string;
  mediaAction?: SendMediaAction;
  reason?: string;
};

function normalizeSemanticText(value?: string | null): string {
  const source = String(value || "").toLowerCase().normalize("NFD");
  let result = "";
  let previousWasSpace = true;

  for (const char of source) {
    const code = char.charCodeAt(0);
    const isCombiningMark = code >= 0x0300 && code <= 0x036f;
    if (isCombiningMark) {
      continue;
    }

    const isWhitespace =
      char === " " ||
      char === "\n" ||
      char === "\r" ||
      char === "\t" ||
      char === "\f" ||
      char === "\v";

    if (isWhitespace) {
      if (!previousWasSpace && result.length > 0) {
        result += " ";
      }
      previousWasSpace = true;
      continue;
    }

    result += char;
    previousWasSpace = false;
  }

  return result.trim();
}

function normalizeMediaName(value?: string | null): string {
  const source = String(value || "").trim().toUpperCase();
  let result = "";
  let previousWasSeparator = false;

  for (const char of source) {
    const isWhitespace =
      char === " " ||
      char === "\n" ||
      char === "\r" ||
      char === "\t" ||
      char === "\f" ||
      char === "\v";

    if (isWhitespace) {
      if (!previousWasSeparator && result.length > 0) {
        result += "_";
      }
      previousWasSeparator = true;
      continue;
    }

    result += char;
    previousWasSeparator = false;
  }

  if (result.endsWith("_")) {
    return result.slice(0, -1);
  }

  return result;
}

function messageIncludesAny(message: string, fragments: string[]): boolean {
  for (const fragment of fragments) {
    if (message.includes(fragment)) {
      return true;
    }
  }
  return false;
}

function hasMediaOpportunity(messageText: string, replyText: string): boolean {
  const combined = `${normalizeSemanticText(messageText)} ${normalizeSemanticText(replyText)}`.trim();
  if (!combined) {
    return false;
  }

  const explicitMediaIntent = [
    "video",
    "audio",
    "midia",
    "imagem",
    "foto",
    "print",
    "material",
    "arquivo",
    "pdf",
  ];
  const productVisibilityIntent = [
    "como funciona",
    "funciona",
    "me mostra",
    "mostrar",
    "quero ver",
    "ver por dentro",
    "sistema",
    "cadastro",
    "calibra",
    "calibrar",
    "edita",
    "editar",
    "editar o agente",
    "treinar",
    "melhorar",
    "configurar o agente",
    "agenda",
    "follow up",
    "notificador",
    "kanban",
    "crm",
  ];
  const sendIntent = [
    "vou te mandar",
    "vou te enviar",
    "te mando",
    "te envio",
    "tenho sim",
    "segue",
    "vou te mostrar",
  ];

  return (
    messageIncludesAny(combined, explicitMediaIntent) ||
    messageIncludesAny(combined, productVisibilityIntent) ||
    messageIncludesAny(combined, sendIntent)
  );
}

function extractFirstJsonObject(rawValue: string): string | undefined {
  const source = String(rawValue || "");
  const start = source.indexOf("{");
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  if (depth > 0) {
    return `${source.slice(start)}${"}".repeat(depth)}`;
  }

  return undefined;
}

function extractQuotedField(rawValue: string, fieldName: string): string | undefined {
  const source = String(rawValue || "");
  const quotedKey = `"${fieldName}"`;
  const keyIndex = source.indexOf(quotedKey);
  if (keyIndex === -1) {
    return undefined;
  }

  const colonIndex = source.indexOf(":", keyIndex + quotedKey.length);
  if (colonIndex === -1) {
    return undefined;
  }

  const firstQuote = source.indexOf("\"", colonIndex + 1);
  if (firstQuote === -1) {
    return undefined;
  }

  let value = "";
  let escaping = false;
  for (let index = firstQuote + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaping) {
      value += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === "\"") {
      return value;
    }

    value += char;
  }

  return value || undefined;
}

function extractNumberField(rawValue: string, fieldName: string): number | undefined {
  const source = String(rawValue || "");
  const quotedKey = `"${fieldName}"`;
  const keyIndex = source.indexOf(quotedKey);
  if (keyIndex === -1) {
    return undefined;
  }

  const colonIndex = source.indexOf(":", keyIndex + quotedKey.length);
  if (colonIndex === -1) {
    return undefined;
  }

  let digits = "";
  for (let index = colonIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    const isDigit = char >= "0" && char <= "9";

    if (isDigit) {
      digits += char;
      continue;
    }

    if (digits.length > 0) {
      break;
    }
  }

  if (!digits) {
    return undefined;
  }

  return Number(digits);
}

function parseClassifierResult(rawValue: string): ClassifierResult {
  const jsonCandidate = extractFirstJsonObject(rawValue);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as {
        decision?: string;
        mediaName?: string | null;
        confidence?: number;
        reason?: string;
      };

      return {
        shouldSend: String(parsed.decision || "").toUpperCase() === "SEND",
        mediaName: parsed.mediaName || null,
        confidence: Number(parsed.confidence || 0),
        reason: parsed.reason || "Sem justificativa",
      };
    } catch (error) {
      console.warn("[ADMIN-MEDIA-ROUTING] JSON invalido na classificacao de midia, tentando leitura tolerante.");
    }
  }

  const decision = extractQuotedField(rawValue, "decision");
  const mediaName = extractQuotedField(rawValue, "mediaName");
  const confidence = extractNumberField(rawValue, "confidence");
  const reason = extractQuotedField(rawValue, "reason");

  return {
    shouldSend: String(decision || "").toUpperCase() === "SEND",
    mediaName: mediaName || null,
    confidence: Number(confidence || 0),
    reason: reason || "Resposta parcial da LLM",
  };
}

async function defaultClassifyMediaSelection(input: ClassifierInput): Promise<ClassifierResult> {
  const { chatComplete } = await import("./llm");
  const availableMedia = input.mediaLibrary.filter((media) => media.isActive !== false);

  if (!availableMedia.length) {
    return {
      shouldSend: false,
      mediaName: null,
      confidence: 0,
      reason: "Nenhuma midia ativa disponivel",
    };
  }

  const recentHistory = input.conversationHistory
    .slice(-8)
    .map((item) => `${item.fromMe ? "Agente" : "Cliente"}: ${String(item.text || "").trim() || "(sem texto)"}`)
    .join("\n");
  const mediaCatalog = availableMedia
    .map(
      (media, index) =>
        `${index + 1}. nome="${media.name}" tipo=${media.type} quando_usar="${String(media.whenToUse || "sem instrucao").trim()}"`,
    )
    .join("\n");

  const response = await chatComplete({
    messages: [
      {
        role: "system",
        content:
          "Voce decide se uma conversa comercial do WhatsApp deve enviar uma midia pronta da biblioteca.\n" +
          "Regras:\n" +
          "- Responda apenas JSON puro em uma linha.\n" +
          '- Formato: {"decision":"SEND|NO_MEDIA","mediaName":"NOME_EXATO_OU_NULL","confidence":0-100,"reason":"motivo curto"}\n' +
          "- Se o cliente pedir para ver o sistema, video, audio, demonstracao, print ou uma funcionalidade visual, prefira SEND.\n" +
          "- Nunca repita uma midia que ja foi enviada.\n" +
          "- Se nenhuma midia encaixar de verdade, use NO_MEDIA.",
      },
      {
        role: "user",
        content:
          `Mensagem do cliente: ${input.clientMessage}\n` +
          `Resposta atual do agente: ${input.aiResponseText || "(sem resposta)"}\n` +
          `Historico recente:\n${recentHistory || "(sem historico)"}\n` +
          `Midias disponiveis:\n${mediaCatalog}\n` +
          `Midias ja enviadas: ${input.sentMedias?.join(", ") || "nenhuma"}`,
      },
    ],
    maxTokens: 180,
    temperature: 0.1,
  });

  const raw =
    typeof response?.choices?.[0]?.message?.content === "string"
      ? response.choices[0].message.content
      : String(response?.choices?.[0]?.message?.content || "");

  return parseClassifierResult(raw);
}

export function extractSentAdminMediaNames(
  conversationHistory: ConversationEntry[],
  mediaLibrary: AdminMedia[],
): string[] {
  const sent = new Set<string>();

  for (const message of conversationHistory) {
    if (message.role !== "assistant") {
      continue;
    }

    const normalizedContent = normalizeSemanticText(message.content);
    const rawContent = String(message.content || "");

    for (const media of mediaLibrary) {
      const normalizedName = normalizeSemanticText(media.name);
      if (!normalizedName) {
        continue;
      }

      if (normalizedContent.includes(normalizedName)) {
        sent.add(normalizeMediaName(media.name));
        continue;
      }

      if (media.storageUrl && rawContent.includes(media.storageUrl)) {
        sent.add(normalizeMediaName(media.name));
        continue;
      }

      const normalizedCaption = normalizeSemanticText(media.caption);
      if (normalizedCaption && normalizedContent.includes(normalizedCaption)) {
        sent.add(normalizeMediaName(media.name));
      }
    }
  }

  return Array.from(sent);
}

function resolveMediaByClassifierName(mediaLibrary: AdminMedia[], mediaName?: string | null): AdminMedia | undefined {
  const normalizedTarget = normalizeMediaName(mediaName);
  if (!normalizedTarget) {
    return undefined;
  }

  for (const media of mediaLibrary) {
    if (normalizeMediaName(media.name) === normalizedTarget) {
      return media;
    }
  }

  for (const media of mediaLibrary) {
    const normalizedCandidate = normalizeMediaName(media.name);
    if (
      normalizedCandidate.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedCandidate)
    ) {
      return media;
    }
  }

  return undefined;
}

function buildMediaReply(media: AdminMedia): string {
  const normalizedName = normalizeMediaName(media.name);

  if (media.mediaType === "video") {
    if (
      normalizedName.includes("CALIBRAR") ||
      normalizedName.includes("EDITAR") ||
      normalizedName.includes("AGENTE")
    ) {
      return "Vou te mandar um video mostrando essa parte de calibrar e editar o agente.";
    }

    if (
      normalizedName.includes("DETALHES_DO_SISTEMA") ||
      normalizedName.includes("CADASTRO") ||
      normalizedName.includes("COMO_FUNCIONA")
    ) {
      return "Vou te mandar um video do sistema para voce ver por dentro.";
    }

    return "Vou te mandar um video aqui para voce ver melhor.";
  }

  if (media.mediaType === "audio") {
    return "Vou te mandar um audio explicando essa parte.";
  }

  if (media.mediaType === "image") {
    return "Vou te mandar uma imagem aqui para voce ver melhor.";
  }

  return "Vou te mandar esse material aqui.";
}

function collectSemanticTokens(value?: string | null): string[] {
  const normalized = normalizeSemanticText(value);
  if (!normalized) {
    return [];
  }

  let sanitized = "";
  for (const char of normalized) {
    const isLetter =
      (char >= "a" && char <= "z") ||
      (char >= "0" && char <= "9") ||
      char === " ";

    if (char === "_") {
      sanitized += " ";
      continue;
    }

    sanitized += isLetter ? char : " ";
  }

  const stopWords = new Set([
    "para",
    "quando",
    "cliente",
    "sobre",
    "midia",
    "video",
    "audio",
    "imagem",
    "usar",
    "enviar",
    "apenas",
    "quiser",
    "falar",
    "perguntar",
    "geral",
    "sistema",
    "dele",
    "dela",
  ]);

  return sanitized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token));
}

function selectMetadataDrivenMedia(
  mediaLibrary: AdminMedia[],
  messageText: string,
  replyText: string,
  sentMedias: string[],
): AdminMedia | undefined {
  const source = `${normalizeSemanticText(messageText)} ${normalizeSemanticText(replyText)}`.trim();
  if (!source) {
    return undefined;
  }

  const sourceTokens = collectSemanticTokens(source);

  const sentSet = new Set(sentMedias.map((item) => normalizeMediaName(item)));
  const askedForVideo = source.includes("video");
  const askedForAudio = source.includes("audio");
  const askedForImage = source.includes("imagem") || source.includes("print") || source.includes("foto");

  let bestMatch: { media: AdminMedia; score: number } | undefined;

  for (const media of mediaLibrary) {
    if (sentSet.has(normalizeMediaName(media.name))) {
      continue;
    }

    let score = 0;
    const tokens = collectSemanticTokens(
      `${media.name} ${media.description || ""} ${media.whenToUse || ""} ${media.caption || ""}`,
    );

    for (const token of tokens) {
      if (source.includes(token)) {
        score += 2;
        continue;
      }

      for (const sourceToken of sourceTokens) {
        const sameToken = sourceToken === token;
        const tokenContains = sourceToken.includes(token) || token.includes(sourceToken);
        const sharesLongPrefix =
          sourceToken.length >= 6 &&
          token.length >= 6 &&
          sourceToken.slice(0, 6) === token.slice(0, 6);

        if (sameToken || tokenContains || sharesLongPrefix) {
          score += 2;
          break;
        }
      }
    }

    if (askedForVideo && media.mediaType === "video") {
      score += 3;
    }
    if (askedForAudio && media.mediaType === "audio") {
      score += 3;
    }
    if (askedForImage && media.mediaType === "image") {
      score += 3;
    }

    if (score < 4) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { media, score };
    }
  }

  return bestMatch?.media;
}

function replyNeedsMediaAlignment(replyText: string, media: AdminMedia): boolean {
  const normalizedReply = normalizeSemanticText(replyText);
  if (!normalizedReply) {
    return true;
  }

  const denialPhrases = [
    "nao temos",
    "nao tenho",
    "ainda nao temos",
    "ainda nao tenho",
    "nao consigo te mandar",
    "nao consigo te enviar",
  ];
  const mediaTerms = [
    "video",
    "audio",
    "midia",
    "imagem",
    "print",
    "demonstracao",
    "demonstrativo",
  ];
  const deferralPhrases = [
    "posso criar um teste",
    "teste pratico",
    "teste pra voce",
    "gerar um teste",
  ];
  const sendPhrases = [
    "vou te mandar",
    "vou te enviar",
    "te mando",
    "te envio",
    "segue",
  ];

  const deniesMedia =
    messageIncludesAny(normalizedReply, denialPhrases) &&
    messageIncludesAny(normalizedReply, mediaTerms);

  if (deniesMedia) {
    return true;
  }

  if (messageIncludesAny(normalizedReply, sendPhrases)) {
    return false;
  }

  if (messageIncludesAny(normalizedReply, deferralPhrases)) {
    return true;
  }

  const normalizedMediaName = normalizeSemanticText(media.name);
  return normalizedMediaName.length > 0 && !normalizedReply.includes(normalizedMediaName);
}

export function alignReplyTextToSelectedMedia(replyText: string, media: AdminMedia): string {
  if (!replyNeedsMediaAlignment(replyText, media)) {
    return replyText;
  }

  return buildMediaReply(media);
}

export function mediaActionsCoverDemoRequest(
  demoRequest: { wantsScreenshot: boolean; wantsVideo: boolean },
  mediaActions: Array<{ mediaData?: AdminMedia }>,
): boolean {
  let hasRequestedVideo = !demoRequest.wantsVideo;
  let hasRequestedScreenshot = !demoRequest.wantsScreenshot;

  for (const action of mediaActions) {
    const type = action.mediaData?.mediaType;
    if (type === "video") {
      hasRequestedVideo = true;
    }
    if (type === "image") {
      hasRequestedScreenshot = true;
    }
  }

  return hasRequestedVideo && hasRequestedScreenshot;
}

export async function resolveAdminContextualMediaSelection(
  params: ResolveSelectionParams,
): Promise<AdminContextualMediaSelection> {
  const activeMedia = params.mediaLibrary.filter((media) => media.isActive !== false);
  if (!activeMedia.length) {
    return { harmonizedText: params.replyText };
  }

  if (!hasMediaOpportunity(params.messageText, params.replyText)) {
    return { harmonizedText: params.replyText };
  }

  const sentMedias = extractSentAdminMediaNames(params.conversationHistory, activeMedia);
  const classifier = params.classify || defaultClassifyMediaSelection;

  try {
    const decision = await classifier({
      clientMessage: params.messageText,
      conversationHistory: params.conversationHistory.map((item) => ({
        text: item.content,
        fromMe: item.role === "assistant",
      })),
      mediaLibrary: activeMedia.map((media) => ({
        name: media.name,
        type: media.mediaType,
        whenToUse: media.whenToUse || undefined,
        isActive: media.isActive,
      })),
      sentMedias,
      aiResponseText: params.replyText,
    });

    const media =
      (decision.shouldSend && decision.mediaName
        ? resolveMediaByClassifierName(activeMedia, decision.mediaName)
        : undefined) ||
      selectMetadataDrivenMedia(activeMedia, params.messageText, params.replyText, sentMedias);

    if (!media) {
      return {
        harmonizedText: params.replyText,
        reason: decision.reason,
      };
    }

    return {
      harmonizedText: alignReplyTextToSelectedMedia(params.replyText, media),
      mediaAction: {
        type: "send_media",
        media_name: media.name,
        mediaData: media,
      },
      reason: decision.reason,
    };
  } catch (error) {
    console.error("[ADMIN-MEDIA-ROUTING] Falha ao classificar midia contextual:", error);
    return { harmonizedText: params.replyText };
  }
}
