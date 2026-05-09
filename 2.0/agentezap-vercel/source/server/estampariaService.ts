import crypto from "crypto";

import { sql } from "drizzle-orm";

import { db } from "./db";
import { chatComplete } from "./llm";
import { generateNvidiaImage } from "./nvidiaImageService";

export type EstampariaProfile = {
  id: string;
  userId: string;
  isActive: boolean;
  businessName: string;
  instagramUrl: string | null;
  addressText: string | null;
  businessHoursText: string | null;
  catalogSummary: string | null;
  serviceRules: string | null;
  artGenerationGuide: string | null;
  aiPromptText: string | null;
  greetingText: string | null;
  sizingTablesJson: unknown;
};

export type EstampariaRequestRecord = {
  id: string;
  conversationId: string;
  connectionId: string;
  userId: string;
  contactNumber: string;
  contactName: string | null;
  requestCode: string;
  status: string;
  productType: string | null;
  requestTitle: string | null;
  briefingSummary: string | null;
  extractedFields: Record<string, unknown>;
  artDirectionPrompt: string | null;
  customerApprovalCaption: string | null;
  aiGeneratedArtUrl: string | null;
  reviewerArtUrl: string | null;
  currentArtUrl: string | null;
  currentArtSource: string | null;
  reviewerNotes: string | null;
  customerFeedback: string | null;
  confidence: number;
  briefingConfirmed: boolean;
  sourceConnectionName: string | null;
  approvedAt: string | null;
  sentToCustomerAt: string | null;
  lastGeneratedAt: string | null;
  lastAnalyzedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ConversationRow = {
  conversation_id: string;
  connection_id: string;
  user_id: string;
  contact_number: string;
  contact_name: string | null;
  connection_name: string | null;
  source_phone_number: string | null;
  source_account_name: string | null;
  source_account_email: string | null;
};

type MessageRow = {
  from_me: boolean;
  is_from_agent: boolean;
  text: string | null;
  media_caption: string | null;
  timestamp: Date | string;
};

type ExistingRequestRow = {
  id: string;
  request_code: string | null;
  status: string | null;
  product_type: string | null;
  request_title: string | null;
  briefing_summary: string | null;
  extracted_fields: Record<string, unknown> | null;
  art_direction_prompt: string | null;
  customer_approval_caption: string | null;
  ai_generated_art_url: string | null;
  reviewer_art_url: string | null;
  current_art_url: string | null;
  current_art_source: string | null;
  customer_feedback: string | null;
  briefing_confirmed: boolean | null;
  last_generated_at: Date | string | null;
  updated_at: Date | string | null;
};

type ListParams = {
  userId: string;
  connectionIds: string[];
  query?: string;
  status?: string;
  day?: string;
  limit?: number;
  offset?: number;
};

type UpdateInput = {
  status?: string;
  reviewerNotes?: string | null;
  customerFeedback?: string | null;
  customerApprovalCaption?: string | null;
  reviewerArtUrl?: string | null;
  currentArtUrl?: string | null;
  currentArtSource?: string | null;
  requestTitle?: string | null;
  briefingSummary?: string | null;
  artDirectionPrompt?: string | null;
  sentToCustomer?: boolean;
};

const ESTAMPARIA_ANALYSIS_VERSION = "estamparia-v1";
const pending = new Map<string, Promise<EstampariaRequestRecord | null>>();
const artGenerationPending = new Map<string, Promise<EstampariaRequestRecord | null>>();
const artGenerationCooldownUntil = new Map<string, number>();

function textOrNull(value: unknown, maxLength = 5000) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function numericPercent(value: unknown) {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function booleanLike(value: unknown) {
  if (value === true) return true;
  if (value === false || value == null) return false;

  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "sim" || normalized === "yes" || normalized === "1";
}

function parseLenientJsonCandidate(candidate: string) {
  try {
    return JSON.parse(candidate);
  } catch {
    let cleaned = "";
    let insideString = false;
    let escaping = false;

    for (const char of candidate) {
      if (escaping) {
        cleaned += char;
        escaping = false;
        continue;
      }

      if (char === "\\") {
        cleaned += char;
        escaping = true;
        continue;
      }

      if (char === "\"") {
        cleaned += char;
        insideString = !insideString;
        continue;
      }

      if (insideString) {
        if (char === "\n") {
          cleaned += "\\n";
          continue;
        }

        if (char === "\r") {
          cleaned += "\\r";
          continue;
        }

        if (char === "\t") {
          cleaned += "\\t";
          continue;
        }
      }

      cleaned += char;
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function parseJsonObject(text: string) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const candidates: string[] = [];
  const seen = new Set<string>();
  const addCandidate = (value: string) => {
    const candidate = String(value || "").trim();
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };

  addCandidate(raw);

  if (raw.startsWith("```")) {
    const firstLineBreak = raw.indexOf("\n");
    const withoutOpeningFence = firstLineBreak >= 0 ? raw.slice(firstLineBreak + 1) : raw;
    const closingFence = withoutOpeningFence.lastIndexOf("```");
    addCandidate(closingFence >= 0 ? withoutOpeningFence.slice(0, closingFence) : withoutOpeningFence);
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    addCandidate(raw.slice(first, last + 1));
  }

  for (const candidate of candidates) {
    const parsed = parseLenientJsonCandidate(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  }

  return null;
}

function formatWhen(value?: Date | string | null) {
  if (!value) return "sem horario";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem horario";
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function transcript(messages: MessageRow[]) {
  return messages
    .map((message) => {
      const speaker = message.from_me ? (message.is_from_agent ? "IA" : "DONO") : "CLIENTE";
      return `[${formatWhen(message.timestamp)}] ${speaker}: ${String(message.text || message.media_caption || "(sem texto)").trim()}`;
    })
    .join("\n");
}

function mapProfile(row: Record<string, any>): EstampariaProfile {
  return {
    id: String(row.id || ""),
    userId: String(row.user_id || ""),
    isActive: row.is_active === true,
    businessName: String(row.business_name || "Estamparia"),
    instagramUrl: textOrNull(row.instagram_url, 500),
    addressText: textOrNull(row.address_text, 500),
    businessHoursText: textOrNull(row.business_hours_text, 500),
    catalogSummary: textOrNull(row.catalog_summary, 12000),
    serviceRules: textOrNull(row.service_rules, 12000),
    artGenerationGuide: textOrNull(row.art_generation_guide, 12000),
    aiPromptText: textOrNull(row.ai_prompt_text, 24000),
    greetingText: textOrNull(row.greeting_text, 4000),
    sizingTablesJson: row.sizing_tables_json ?? null,
  };
}

function mapRequest(row: Record<string, any>): EstampariaRequestRecord {
  return {
    id: String(row.id || ""),
    conversationId: String(row.conversation_id || ""),
    connectionId: String(row.connection_id || ""),
    userId: String(row.user_id || ""),
    contactNumber: String(row.contact_number || ""),
    contactName: textOrNull(row.contact_name, 255),
    requestCode: String(row.request_code || ""),
    status: String(row.status || "needs_briefing"),
    productType: textOrNull(row.product_type, 255),
    requestTitle: textOrNull(row.request_title, 255),
    briefingSummary: textOrNull(row.briefing_summary, 5000),
    extractedFields: jsonObject(row.extracted_fields),
    artDirectionPrompt: textOrNull(row.art_direction_prompt, 6000),
    customerApprovalCaption: textOrNull(row.customer_approval_caption, 5000),
    aiGeneratedArtUrl: textOrNull(row.ai_generated_art_url, 5_000_000),
    reviewerArtUrl: textOrNull(row.reviewer_art_url, 5_000_000),
    currentArtUrl: textOrNull(row.current_art_url, 5_000_000),
    currentArtSource: textOrNull(row.current_art_source, 80),
    reviewerNotes: textOrNull(row.reviewer_notes, 5000),
    customerFeedback: textOrNull(row.customer_feedback, 5000),
    confidence: numericPercent(row.confidence),
    briefingConfirmed: row.briefing_confirmed === true,
    sourceConnectionName: textOrNull(row.source_connection_name, 255),
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    sentToCustomerAt: row.sent_to_customer_at ? new Date(row.sent_to_customer_at).toISOString() : null,
    lastGeneratedAt: row.last_generated_at ? new Date(row.last_generated_at).toISOString() : null,
    lastAnalyzedAt: row.last_analyzed_at ? new Date(row.last_analyzed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function formatPromptValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const text = value
      .map((item) => formatPromptValue(item))
      .filter(Boolean)
      .join(", ");
    return text || null;
  }
  if (typeof value === "object") {
    const text = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const formatted = formatPromptValue(item);
        return formatted ? `${key}: ${formatted}` : null;
      })
      .filter(Boolean)
      .join("; ");
    return text || null;
  }
  return null;
}

function requestPromptSeed(
  request:
    | EstampariaRequestRecord
    | Pick<
        ExistingRequestRow,
        | "request_title"
        | "product_type"
        | "briefing_summary"
        | "art_direction_prompt"
        | "customer_feedback"
        | "extracted_fields"
      >,
) {
  const extractedFields =
    "extractedFields" in request
      ? request.extractedFields
      : jsonObject(request.extracted_fields);

  const extractedSummary = Object.entries(extractedFields)
    .map(([key, value]) => {
      const formatted = formatPromptValue(value);
      return formatted ? `${key}: ${formatted}` : null;
    })
    .filter(Boolean)
    .join(" | ");

  const parts = [
    "Arte comercial para estamparia personalizada, pronta para aprovacao do cliente.",
    request.requestTitle ? `Pedido: ${request.requestTitle}` : null,
    "productType" in request && request.productType ? `Produto: ${request.productType}` : null,
    "product_type" in request && request.product_type ? `Produto: ${request.product_type}` : null,
    request.briefingSummary ? `Resumo: ${request.briefingSummary}` : null,
    request.artDirectionPrompt ? `Direcao da arte: ${request.artDirectionPrompt}` : null,
    request.customerFeedback ? `Ajustes pedidos pelo cliente: ${request.customerFeedback}` : null,
    "customer_feedback" in request && request.customer_feedback
      ? `Ajustes pedidos pelo cliente: ${request.customer_feedback}`
      : null,
    extractedSummary ? `Campos do pedido: ${extractedSummary}` : null,
    "Estilo: visual profissional, legivel, vendavel, sem mockup, sem marcas d'agua, composicao final de arte.",
  ]
    .map((item) => textOrNull(item, 6000))
    .filter(Boolean);

  return parts.length > 0 ? parts.join("\n") : null;
}

function countDigits(value: string) {
  let total = 0;
  for (const char of String(value || "")) {
    if (char >= "0" && char <= "9") total += 1;
  }
  return total;
}

function describePalette(colors: string | null, summaryContext: string) {
  const normalizedColors = String(colors || "").toLowerCase();
  const normalizedSummary = String(summaryContext || "").toLowerCase();

  if (
    normalizedSummary.includes("rosa-claro") ||
    normalizedSummary.includes("rosa claro") ||
    normalizedSummary.includes("azul-bebê") ||
    normalizedSummary.includes("azul-bebe")
  ) {
    return "rosa-claro e azul-bebe";
  }

  if (normalizedColors.includes("#")) {
    return "tons pastel suaves";
  }

  return colors;
}

function buildEstampariaImagePromptFallback(request: EstampariaRequestRecord) {
  const extracted = jsonObject(request.extractedFields);
  const productContext = [
    textOrNull(request.requestTitle, 255),
    textOrNull(request.productType, 255),
    textOrNull(request.briefingSummary, 1200),
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  const isWindBanner = productContext.includes("wind banner");
  const isWearable =
    productContext.includes("camiseta") ||
    productContext.includes("pesca") ||
    productContext.includes("uniforme") ||
    productContext.includes("abada") ||
    productContext.includes("ciclista");

  const colors =
    formatPromptValue(extracted.cores_primarias) ||
    formatPromptValue(extracted.cor_camisa) ||
    formatPromptValue(extracted.cores) ||
    null;
  const visualIdea = formatPromptValue(extracted.ideia_arte) || null;
  const safeVisualIdea =
    visualIdea &&
    !visualIdea.toLowerCase().includes("telefone") &&
    !visualIdea.includes("@") &&
    countDigits(visualIdea) < 6
      ? visualIdea
      : null;
  const positioning = formatPromptValue(extracted.posicionamento) || null;
  const logoReceived = extracted.logo_recebida === true;
  const summaryContext = [
    request.briefingSummary,
    request.customerFeedback,
    visualIdea,
    positioning,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const highlightName =
    summaryContext.includes(" nome ") ||
    summaryContext.includes("'joao'") ||
    summaryContext.includes("'joão'") ||
    summaryContext.includes("destaque") ||
    productContext.includes("joao") ||
    productContext.includes("joão");
  const needsPhoneArea = summaryContext.includes("telefone");
  const needsInstagramArea =
    summaryContext.includes("instagram") || summaryContext.includes("@");
  const paletteLabel = describePalette(colors, summaryContext);

  if (isWindBanner) {
    const bannerParts = [
      "Crie uma arte vertical plana de wind banner modelo pena para pastelaria, pronta para aprovacao comercial.",
      "Mantenha identidade visual delicada, comercial e acolhedora de pastelaria.",
      paletteLabel ? `Fundo em degrade suave com ${paletteLabel}.` : null,
      logoReceived ? "Reserve uma area nobre para o logotipo no topo." : null,
      highlightName ? "Deixe o nome principal em grande destaque na metade inferior." : null,
      needsPhoneArea || needsInstagramArea
        ? "Inclua areas secundarias e discretas para telefone e Instagram no rodape."
        : null,
      "Priorize design grafico 2D para impressao, boa leitura a distancia e visual clean.",
      "Nao mostrar suporte fisico, pedestal, tecido pendurado, parede, sala, fotografia de produto ou mockup.",
      "Evite excesso de texto pequeno; use poucos blocos de informacao com hierarquia clara.",
    ]
      .map((item) => textOrNull(item, 220))
      .filter(Boolean);

    return bannerParts.join(" ");
  }

  const parts = [
    isWindBanner
      ? "Crie uma arte vertical plana de wind banner modelo pena, vista frontal, pronta para aprovacao comercial."
      : isWearable
        ? "Crie uma arte plana de estamparia para vestuario personalizado, sem mockup humano, com foco na composicao final."
        : "Crie uma arte comercial plana para estamparia personalizada, pronta para aprovacao do cliente.",
    productContext.includes("pastelaria")
      ? "Mantenha identidade visual delicada, comercial e acolhedora de pastelaria."
      : null,
    safeVisualIdea ? `Tema visual principal: ${safeVisualIdea}.` : null,
    paletteLabel ? `Use cores principais ${paletteLabel}.` : null,
    logoReceived ? "Reserve area nobre para logo no topo." : null,
    highlightName ? "Deixe o nome principal em grande destaque na metade inferior." : "Destaque o elemento principal com leitura imediata.",
    needsPhoneArea ? "Reserve uma area menor para telefone no rodape." : null,
    needsInstagramArea ? "Reserve uma area menor para Instagram no rodape." : null,
    positioning && !isWindBanner ? `Mantenha esta composicao geral: ${positioning}` : null,
    request.customerFeedback && summaryContext.includes("aument")
      ? "Nesta versao, aumente o destaque visual do elemento principal."
      : null,
    isWindBanner
      ? "Visual grafico impresso, elegante, com boa leitura a distancia e sem mockup."
      : "Arte plana, comercial, com poucos elementos de texto e pronta para aprovacao.",
  ]
    .map((item) => textOrNull(item, 320))
    .filter(Boolean);

  let prompt = parts.join(" ");
  if (prompt.length > 520 && safeVisualIdea) {
    prompt = parts.filter((item) => item !== `Tema visual principal: ${safeVisualIdea}.`).join(" ");
  }
  if (prompt.length > 520 && positioning && !isWindBanner) {
    prompt = prompt.replace(` Mantenha esta composicao geral: ${positioning}`, "");
  }

  return prompt.trim() || null;
}

async function buildEstampariaImagePrompt(request: EstampariaRequestRecord) {
  return buildEstampariaImagePromptFallback(request);
}

function shouldAutoGenerateArt(
  request:
    | EstampariaRequestRecord
    | Pick<
        ExistingRequestRow,
        | "briefing_confirmed"
        | "briefing_summary"
        | "request_title"
        | "product_type"
        | "art_direction_prompt"
        | "status"
        | "current_art_source"
        | "last_generated_at"
        | "updated_at"
        | "current_art_url"
        | "extracted_fields"
      >,
) {
  const briefingConfirmed =
    "briefingConfirmed" in request ? request.briefingConfirmed : request.briefing_confirmed === true;
  const currentArtUrl = "currentArtUrl" in request ? request.currentArtUrl : request.current_art_url;
  const status = "status" in request ? request.status : request.status;
  const currentArtSource =
    "currentArtSource" in request ? request.currentArtSource : request.current_art_source;
  const lastGeneratedAt =
    "lastGeneratedAt" in request ? request.lastGeneratedAt : request.last_generated_at;
  const updatedAt = "updatedAt" in request ? request.updatedAt : request.updated_at;

  if (!briefingConfirmed) return false;
  if (!textOrNull(currentArtUrl, 5_000_000)) {
    return Boolean(requestPromptSeed(request as any));
  }

  if (status !== "changes_requested" || currentArtSource !== "ai") return false;

  const updatedAtMs = updatedAt ? new Date(updatedAt).getTime() : 0;
  const lastGeneratedAtMs = lastGeneratedAt ? new Date(lastGeneratedAt).getTime() : 0;
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(lastGeneratedAtMs)) return false;
  if (updatedAtMs <= lastGeneratedAtMs) return false;

  return Boolean(requestPromptSeed(request as any));
}

function queueAutomaticEstampariaArtGeneration(params: { requestId: string; userId: string }) {
  const key = `${params.userId}:${params.requestId}`;
  const cooldownUntil = artGenerationCooldownUntil.get(key) || 0;
  if (cooldownUntil > Date.now()) {
    return Promise.resolve(null);
  }
  if (artGenerationPending.has(key)) return artGenerationPending.get(key)!;

  const promise = (async () => {
    try {
      const generated = await generateEstampariaRequestArt(params);
      artGenerationCooldownUntil.delete(key);
      return generated;
    } catch (error) {
      artGenerationCooldownUntil.set(key, Date.now() + 60_000);
      console.error("[ESTAMPARIA] Falha na geracao automatica da arte:", error);
      return null;
    } finally {
      artGenerationPending.delete(key);
    }
  })();

  artGenerationPending.set(key, promise);
  return promise;
}

async function getConversationContext(conversationId: string) {
  const convo = await db.execute(sql`
    SELECT
      c.id AS conversation_id,
      c.connection_id,
      wc.user_id,
      c.contact_number,
      c.contact_name,
      wc.connection_name,
      wc.phone_number AS source_phone_number,
      u.name AS source_account_name,
      u.email AS source_account_email
    FROM conversations c
    INNER JOIN whatsapp_connections wc ON wc.id = c.connection_id
    INNER JOIN users u ON u.id = wc.user_id
    WHERE c.id = ${conversationId}
    LIMIT 1
  `);
  const conversation = (convo as any)?.rows?.[0] as ConversationRow | undefined;
  if (!conversation) return null;

  const messageResult = await db.execute(sql`
    SELECT from_me, is_from_agent, text, media_caption, timestamp
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY timestamp DESC
    LIMIT 40
  `);

  return {
    conversation,
    messages: (((messageResult as any)?.rows || []) as MessageRow[]).reverse(),
  };
}

async function getExistingRequest(conversationId: string) {
  const result = await db.execute(sql`
    SELECT
      id,
      request_code,
      status,
      product_type,
      request_title,
      briefing_summary,
      extracted_fields,
      art_direction_prompt,
      customer_approval_caption,
      ai_generated_art_url,
      reviewer_art_url,
      current_art_url,
      current_art_source,
      customer_feedback,
      briefing_confirmed,
      last_generated_at,
      updated_at
    FROM estamparia_requests
    WHERE conversation_id = ${conversationId}
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  return ((result as any)?.rows?.[0] || null) as ExistingRequestRow | null;
}

export async function getEstampariaPromptContext(userId: string): Promise<EstampariaProfile | null> {
  const result = await db.execute(sql`
    SELECT
      id,
      user_id,
      is_active,
      business_name,
      instagram_url,
      address_text,
      business_hours_text,
      catalog_summary,
      sizing_tables_json,
      service_rules,
      art_generation_guide,
      ai_prompt_text,
      greeting_text
    FROM estamparia_profiles
    WHERE user_id = ${userId}
      AND is_active = true
    LIMIT 1
  `);

  const row = (result as any)?.rows?.[0];
  return row ? mapProfile(row) : null;
}

export async function getEstampariaProfileConfig(userId: string): Promise<EstampariaProfile | null> {
  const result = await db.execute(sql`
    SELECT
      id,
      user_id,
      is_active,
      business_name,
      instagram_url,
      address_text,
      business_hours_text,
      catalog_summary,
      sizing_tables_json,
      service_rules,
      art_generation_guide,
      ai_prompt_text,
      greeting_text
    FROM estamparia_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `);

  const row = (result as any)?.rows?.[0];
  return row ? mapProfile(row) : null;
}

export async function updateEstampariaProfileConfig(
  userId: string,
  input: { isActive?: boolean },
): Promise<EstampariaProfile | null> {
  const existing = await getEstampariaProfileConfig(userId);
  if (!existing) return null;

  const result = await db.execute(sql`
    UPDATE estamparia_profiles
    SET
      is_active = ${input.isActive === true},
      updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING
      id,
      user_id,
      is_active,
      business_name,
      instagram_url,
      address_text,
      business_hours_text,
      catalog_summary,
      sizing_tables_json,
      service_rules,
      art_generation_guide,
      ai_prompt_text,
      greeting_text
  `);

  const row = (result as any)?.rows?.[0];
  return row ? mapProfile(row) : null;
}

function buildAnalysisPrompt(params: {
  profile: EstampariaProfile;
  conversation: ConversationRow;
  messages: MessageRow[];
  latestAgentReply: string;
  existingRequest: ExistingRequestRow | null;
}) {
  return [
    "Analise esta conversa de estamparia personalizada e responda apenas JSON válido.",
    "Interprete contexto, intenção, briefing, revisão e aprovação. Não use regra mecânica.",
    "Use shouldTrack=true quando a conversa tratar de orçamento, briefing, pedido, arte, uniforme, wind banner, tecido, estampa, revisão, aprovação ou fechamento ligado a estamparia.",
    "Não crie solicitação quando houver apenas saudação inicial, menu de produtos, mensagem institucional, mídia de boas-vindas ou pergunta genérica sem escolha de produto, orçamento, arte ou briefing do cliente.",
    "Se ainda for apenas abertura de atendimento, responda shouldTrack=false, status needs_briefing e explique em evidence que ainda não existe pedido real para o arte-finalista.",
    "Quando o atendimento da estamparia estiver ativo e a transcrição contiver pedido, orçamento, produto personalizado ou ideia de arte, crie ou atualize a solicitação mesmo que ainda faltem detalhes.",
    "Não espere pagamento, PIX, romaneio ou aprovação final para shouldTrack=true; isso é etapa posterior ao briefing de arte.",
    "Se a transcrição vier do simulador e tiver somente falas do CLIENTE, interprete normalmente e extraia o pedido a partir delas.",
    "Quando houver produto, quantidade/tamanho e ideia de arte claros o suficiente para o arte-finalista começar, use status pending_review e briefingConfirmed=true.",
    "Retorne apenas um unico objeto JSON valido, minificado, sem markdown, sem comentarios e sem texto fora do JSON.",
    "Mantenha briefingSummary, artDirectionPrompt, customerApprovalCaption, customerFeedback, lastCustomerMessage e lastAgentMessage como frases curtas em uma linha, sem listas, sem quebras de linha e sem aspas duplas internas.",
    "Se precisar citar uma fala do cliente dentro de uma string, use apostrofos simples, nao aspas duplas.",
    "Status permitidos: needs_briefing, pending_review, awaiting_customer, changes_requested, approved.",
    "briefingConfirmed=true quando o briefing estiver claro o suficiente para gerar a arte.",
    "Monte extractedFields livremente com quantidade, modelo, tamanhos, prazo, tecido, ideia_arte, logo_recebida e outros campos relevantes.",
    "",
    `NEGOCIO: ${params.profile.businessName}`,
    `INSTAGRAM: ${params.profile.instagramUrl || "(nao informado)"}`,
    `ENDERECO: ${params.profile.addressText || "(nao informado)"}`,
    `HORÁRIO: ${params.profile.businessHoursText || "(não informado)"}`,
    `CATALOGO:\n${params.profile.catalogSummary || "(vazio)"}`,
    `REGRAS:\n${params.profile.serviceRules || "(vazio)"}`,
    `GUIA DE ARTE:\n${params.profile.artGenerationGuide || "(vazio)"}`,
    `PROMPT BASE:\n${params.profile.aiPromptText || "(vazio)"}`,
    `TABELAS DE MEDIDA:\n${params.profile.sizingTablesJson ? JSON.stringify(params.profile.sizingTablesJson).slice(0, 4000) : "(vazio)"}`,
    `CONTATO: ${params.conversation.contact_name || params.conversation.contact_number}`,
    `ULTIMA RESPOSTA DA IA: ${params.latestAgentReply}`,
    `ESTADO ANTERIOR: ${JSON.stringify(params.existingRequest || null)}`,
    "",
    "TRANSCRICAO:",
    transcript(params.messages) || "(sem historico)",
    "",
    JSON.stringify({
      shouldTrack: true,
      status: "pending_review",
      productType: "wind banner",
      requestTitle: "Wind banner pastelaria",
      briefingSummary: "Resumo do pedido e da arte.",
      extractedFields: { quantidade: "1", modelo: "3m", ideia_arte: "logo, telefone e instagram" },
      artDirectionPrompt: "Prompt pronto para IA de imagem.",
      customerApprovalCaption: "Segue a arte para sua aprovação.",
      customerFeedback: "Cliente pediu troca de cor.",
      evidence: ["Cliente confirmou o briefing."],
      confidence: 92,
      briefingConfirmed: true,
      lastCustomerMessage: "Mensagem-chave do cliente",
      lastAgentMessage: "Mensagem-chave da IA",
    }),
  ].join("\n");
}

async function nextRequestCode(profileId: string) {
  const result = await db.execute(sql`
    UPDATE estamparia_profiles
    SET request_counter = COALESCE(request_counter, 0) + 1, updated_at = NOW()
    WHERE id = ${profileId}
    RETURNING request_counter
  `);
  const counter = Number((result as any)?.rows?.[0]?.request_counter || 1);
  return `EST-${String(counter).padStart(4, "0")}`;
}

export async function queueConversationEstampariaRequest(params: { conversationId: string; latestAgentReply: string; forceFresh?: boolean }) {
  const key = `${params.conversationId}:${params.latestAgentReply.slice(0, 120)}`;
  if (params.forceFresh) pending.delete(key);
  if (pending.has(key)) return pending.get(key)!;

  const promise = (async () => {
    const context = await getConversationContext(params.conversationId);
    if (!context) return null;

    const profile = await getEstampariaPromptContext(context.conversation.user_id);
    if (!profile) return null;

    const existingRequest = await getExistingRequest(params.conversationId);
    const response = await chatComplete({
      userId: context.conversation.user_id,
      messages: [
        { role: "system", content: "Voce extrai contexto operacional de estamparia. Retorne apenas um unico objeto JSON valido, minificado, sem markdown e sem comentarios." },
        {
          role: "user",
          content: buildAnalysisPrompt({
            profile,
            conversation: context.conversation,
            messages: context.messages,
            latestAgentReply: params.latestAgentReply,
            existingRequest,
          }),
        },
      ],
      maxTokens: 1400,
      temperature: 0.1,
    });

    const parsed = parseJsonObject(String(response?.choices?.[0]?.message?.content || "").trim());
    if (!parsed || typeof parsed !== "object") return null;

    const shouldTrack = booleanLike(parsed.shouldTrack ?? parsed.should_track);
    if (!shouldTrack && !existingRequest) return null;

    const requestId = existingRequest?.id || crypto.randomUUID();
    const requestCode = existingRequest?.request_code || (await nextRequestCode(profile.id));
    const requestStatus = textOrNull(parsed.status, 80) || existingRequest?.status || "needs_briefing";
    const requestTitle = textOrNull(parsed.requestTitle, 255) || existingRequest?.request_title || null;
    const productType = textOrNull(parsed.productType, 255) || existingRequest?.product_type || null;
    const briefingSummary = textOrNull(parsed.briefingSummary, 5000) || existingRequest?.briefing_summary || null;
    const parsedExtractedFields = jsonObject(parsed.extractedFields);
    const extractedFields =
      Object.keys(parsedExtractedFields).length > 0
        ? parsedExtractedFields
        : jsonObject(existingRequest?.extracted_fields);
    const artDirectionPrompt =
      textOrNull(parsed.artDirectionPrompt, 6000) || existingRequest?.art_direction_prompt || null;
    const customerApprovalCaption =
      textOrNull(parsed.customerApprovalCaption, 5000) || existingRequest?.customer_approval_caption || null;
    const customerFeedback =
      textOrNull(parsed.customerFeedback, 5000) ||
      (requestStatus === "changes_requested" ? textOrNull(parsed.lastCustomerMessage, 2000) : null) ||
      existingRequest?.customer_feedback ||
      null;

    const result = await db.execute(sql`
      INSERT INTO estamparia_requests (
        id, conversation_id, connection_id, user_id, contact_number, contact_name,
        request_code, status, product_type, request_title, briefing_summary, extracted_fields,
        art_direction_prompt, customer_approval_caption, customer_feedback, evidence_json,
        confidence, briefing_confirmed, last_customer_message, last_agent_message, last_analyzed_at,
        raw_analysis, analysis_version, source_connection_name, source_connection_phone,
        source_account_name, source_account_email, current_art_url, current_art_source,
        created_at, updated_at
      ) VALUES (
        ${requestId},
        ${context.conversation.conversation_id},
        ${context.conversation.connection_id},
        ${context.conversation.user_id},
        ${context.conversation.contact_number},
        ${context.conversation.contact_name},
        ${requestCode},
        ${requestStatus},
        ${productType},
        ${requestTitle},
        ${briefingSummary},
        CAST(${JSON.stringify(extractedFields)} AS jsonb),
        ${artDirectionPrompt},
        ${customerApprovalCaption},
        ${customerFeedback},
        CAST(${JSON.stringify(safeArray(parsed.evidence))} AS jsonb),
        ${numericPercent(parsed.confidence)},
        ${booleanLike(parsed.briefingConfirmed ?? parsed.briefing_confirmed)},
        ${textOrNull(parsed.lastCustomerMessage, 2000)},
        ${textOrNull(parsed.lastAgentMessage, 2000) || textOrNull(params.latestAgentReply, 2000)},
        NOW(),
        CAST(${JSON.stringify(jsonObject(parsed))} AS jsonb),
        ${ESTAMPARIA_ANALYSIS_VERSION},
        ${context.conversation.connection_name},
        ${context.conversation.source_phone_number},
        ${context.conversation.source_account_name},
        ${context.conversation.source_account_email},
        ${existingRequest?.current_art_url || null},
        ${existingRequest?.current_art_source || null},
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        product_type = COALESCE(EXCLUDED.product_type, estamparia_requests.product_type),
        request_title = COALESCE(EXCLUDED.request_title, estamparia_requests.request_title),
        briefing_summary = COALESCE(EXCLUDED.briefing_summary, estamparia_requests.briefing_summary),
        extracted_fields = CASE
          WHEN EXCLUDED.extracted_fields = '{}'::jsonb THEN estamparia_requests.extracted_fields
          ELSE EXCLUDED.extracted_fields
        END,
        art_direction_prompt = COALESCE(EXCLUDED.art_direction_prompt, estamparia_requests.art_direction_prompt),
        customer_approval_caption = COALESCE(EXCLUDED.customer_approval_caption, estamparia_requests.customer_approval_caption),
        customer_feedback = COALESCE(EXCLUDED.customer_feedback, estamparia_requests.customer_feedback),
        evidence_json = EXCLUDED.evidence_json,
        confidence = EXCLUDED.confidence,
        briefing_confirmed = EXCLUDED.briefing_confirmed,
        last_customer_message = COALESCE(EXCLUDED.last_customer_message, estamparia_requests.last_customer_message),
        last_agent_message = COALESCE(EXCLUDED.last_agent_message, estamparia_requests.last_agent_message),
        last_analyzed_at = NOW(),
        raw_analysis = EXCLUDED.raw_analysis,
        analysis_version = EXCLUDED.analysis_version,
        source_connection_name = EXCLUDED.source_connection_name,
        source_connection_phone = EXCLUDED.source_connection_phone,
        source_account_name = EXCLUDED.source_account_name,
        source_account_email = EXCLUDED.source_account_email,
        updated_at = NOW()
      RETURNING *
    `);

    const row = (result as any)?.rows?.[0];
    const mapped = row ? mapRequest(row) : null;
    if (mapped && shouldAutoGenerateArt(mapped)) {
      void queueAutomaticEstampariaArtGeneration({ requestId: mapped.id, userId: mapped.userId });
    }
    return mapped;
  })()
    .catch((error) => {
      console.error("[ESTAMPARIA] Falha ao analisar conversa:", error);
      return null;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, promise);
  return promise;
}

export async function listEstampariaRequests(params: ListParams) {
  const query = String(params.query || "").trim().toLowerCase();
  const status = String(params.status || "all").trim().toLowerCase();
  const day = String(params.day || "all").trim();
  const limit = Math.max(1, Math.min(params.limit || 50, 200));
  const offset = Math.max(0, params.offset || 0);
  const connectionIds = params.connectionIds.length > 0 ? params.connectionIds : ["__none__"];
  const connectionIdList = sql.join(
    connectionIds.map((connectionId) => sql`${connectionId}`),
    sql`, `,
  );
  const activityAt = sql`GREATEST(
    COALESCE(updated_at, TIMESTAMP 'epoch'),
    COALESCE(sent_to_customer_at, TIMESTAMP 'epoch'),
    COALESCE(approved_at, TIMESTAMP 'epoch'),
    COALESCE(last_generated_at, TIMESTAMP 'epoch'),
    COALESCE(last_analyzed_at, TIMESTAMP 'epoch'),
    COALESCE(created_at, TIMESTAMP 'epoch')
  )`;

  const rows = await db.execute(sql`
    SELECT *
    FROM estamparia_requests
    WHERE user_id = ${params.userId}
      AND connection_id IN (${connectionIdList})
      AND (${status} = 'all' OR LOWER(COALESCE(status, '')) = ${status})
      AND (${day} = 'all' OR TO_CHAR(${activityAt}, 'YYYY-MM-DD') = ${day})
      AND (
        ${query} = ''
        OR LOWER(COALESCE(contact_name, '')) LIKE ${`%${query}%`}
        OR LOWER(COALESCE(request_code, '')) LIKE ${`%${query}%`}
        OR LOWER(COALESCE(product_type, '')) LIKE ${`%${query}%`}
        OR LOWER(COALESCE(request_title, '')) LIKE ${`%${query}%`}
      )
    ORDER BY ${activityAt} DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const count = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM estamparia_requests
    WHERE user_id = ${params.userId}
      AND connection_id IN (${connectionIdList})
      AND (${status} = 'all' OR LOWER(COALESCE(status, '')) = ${status})
      AND (${day} = 'all' OR TO_CHAR(${activityAt}, 'YYYY-MM-DD') = ${day})
      AND (
        ${query} = ''
        OR LOWER(COALESCE(contact_name, '')) LIKE ${`%${query}%`}
        OR LOWER(COALESCE(request_code, '')) LIKE ${`%${query}%`}
        OR LOWER(COALESCE(product_type, '')) LIKE ${`%${query}%`}
        OR LOWER(COALESCE(request_title, '')) LIKE ${`%${query}%`}
      )
  `);

  const data = (((rows as any)?.rows || []) as Record<string, unknown>[]).map(mapRequest);
  for (const request of data) {
    if (shouldAutoGenerateArt(request)) {
      void queueAutomaticEstampariaArtGeneration({ requestId: request.id, userId: request.userId });
    }
  }
  const total = Number((count as any)?.rows?.[0]?.total || 0);
  return { data, total, hasMore: offset + data.length < total, offset, limit };
}

export async function getEstampariaRequestById(requestId: string, userId: string) {
  const result = await db.execute(sql`
    SELECT *
    FROM estamparia_requests
    WHERE id = ${requestId}
      AND user_id = ${userId}
    LIMIT 1
  `);

  const row = (result as any)?.rows?.[0];
  const mapped = row ? mapRequest(row) : null;
  if (mapped && shouldAutoGenerateArt(mapped)) {
    void queueAutomaticEstampariaArtGeneration({ requestId: mapped.id, userId: mapped.userId });
  }
  return mapped;
}

export async function updateEstampariaRequest(requestId: string, userId: string, input: UpdateInput) {
  const existing = await getEstampariaRequestById(requestId, userId);
  if (!existing) return null;

  const reviewerArtUrl = input.reviewerArtUrl !== undefined ? textOrNull(input.reviewerArtUrl, 5_000_000) : existing.reviewerArtUrl;
  const currentArtUrl = input.currentArtUrl !== undefined
    ? textOrNull(input.currentArtUrl, 5_000_000)
    : input.reviewerArtUrl !== undefined
      ? reviewerArtUrl
      : existing.currentArtUrl;
  const currentArtSource = input.currentArtSource !== undefined
    ? textOrNull(input.currentArtSource, 80)
    : input.reviewerArtUrl !== undefined
      ? "reviewer"
      : existing.currentArtSource;
  const status = textOrNull(input.status, 80) || existing.status;

  const result = await db.execute(sql`
    UPDATE estamparia_requests
    SET
      status = ${status},
      reviewer_notes = ${input.reviewerNotes !== undefined ? textOrNull(input.reviewerNotes, 5000) : existing.reviewerNotes},
      customer_feedback = ${input.customerFeedback !== undefined ? textOrNull(input.customerFeedback, 5000) : existing.customerFeedback},
      customer_approval_caption = ${input.customerApprovalCaption !== undefined ? textOrNull(input.customerApprovalCaption, 5000) : existing.customerApprovalCaption},
      reviewer_art_url = ${reviewerArtUrl},
      current_art_url = ${currentArtUrl},
      current_art_source = ${currentArtSource},
      request_title = ${input.requestTitle !== undefined ? textOrNull(input.requestTitle, 255) : existing.requestTitle},
      briefing_summary = ${input.briefingSummary !== undefined ? textOrNull(input.briefingSummary, 5000) : existing.briefingSummary},
      art_direction_prompt = ${input.artDirectionPrompt !== undefined ? textOrNull(input.artDirectionPrompt, 6000) : existing.artDirectionPrompt},
      approved_at = CASE WHEN ${status} = 'approved' THEN NOW() ELSE approved_at END,
      sent_to_customer_at = CASE WHEN ${input.sentToCustomer === true} THEN NOW() ELSE sent_to_customer_at END,
      updated_at = NOW()
    WHERE id = ${requestId}
      AND user_id = ${userId}
    RETURNING *
  `);

  const row = (result as any)?.rows?.[0];
  return row ? mapRequest(row) : null;
}

export async function generateEstampariaRequestArt(params: { requestId: string; userId: string }) {
  const request = await getEstampariaRequestById(params.requestId, params.userId);
  if (!request) return null;

  const prompt = await buildEstampariaImagePrompt(request);

  if (!prompt) {
    throw new Error("Ainda não existe briefing suficiente para gerar a arte por IA");
  }

  const image = await generateNvidiaImage(prompt, {
    filePrefix: "estamparia",
    useCase: "estamparia",
  });
  const result = await db.execute(sql`
    UPDATE estamparia_requests
    SET
      ai_generated_art_url = ${image.dataUrl},
      current_art_url = ${image.dataUrl},
      current_art_source = 'ai',
      last_generated_at = NOW(),
      status = CASE WHEN status IN ('approved', 'awaiting_customer') THEN status ELSE 'pending_review' END,
      updated_at = NOW()
    WHERE id = ${params.requestId}
      AND user_id = ${params.userId}
    RETURNING *
  `);

  const row = (result as any)?.rows?.[0];
  return row ? mapRequest(row) : null;
}

export function resolveMimeTypeFromMediaUrl(value: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "image/png";
  if (raw.startsWith("data:image/jpeg") || raw.endsWith(".jpg") || raw.endsWith(".jpeg")) return "image/jpeg";
  if (raw.startsWith("data:image/webp") || raw.endsWith(".webp")) return "image/webp";
  if (raw.startsWith("data:image/gif") || raw.endsWith(".gif")) return "image/gif";
  return "image/png";
}
