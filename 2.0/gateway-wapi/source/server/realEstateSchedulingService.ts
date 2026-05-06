import { and, desc, eq } from "drizzle-orm";

import { db } from "./db";
import { getLLMClient } from "./llm";
import { supabase } from "./supabaseAuth";
import { getGrupoOlxCatalogForAI } from "./realEstateCatalogService";
import { grupoOlxIntegrations, grupoOlxLeadEvents } from "@shared/schema";

const REAL_ESTATE_APPOINTMENT_TYPES = [
  "visita_presencial",
  "visita_virtual",
  "ligacao_corretor",
  "retorno_proposta",
  "envio_documentacao",
  "outro",
] as const;

type RealEstateAppointmentType = (typeof REAL_ESTATE_APPOINTMENT_TYPES)[number];

type RealEstateListingCandidate = {
  code: string | null;
  title: string | null;
  transactionType: string | null;
  city: string | null;
  neighborhood: string | null;
  price: string | null;
  detailUrl: string | null;
};

export type RealEstateAppointmentContext = {
  domain: "real_estate";
  appointmentType: RealEstateAppointmentType;
  appointmentTypeLabel: string;
  source: "lead_event" | "catalog" | "llm" | "fallback";
  listingCode: string | null;
  listingTitle: string | null;
  listingUrl: string | null;
  transactionType: string | null;
  city: string | null;
  neighborhood: string | null;
  price: string | null;
  portalSource: string | null;
  leadType: string | null;
  summary: string | null;
};

type InferRealEstateContextParams = {
  userId: string;
  appointmentId: string;
  conversationId?: string | null;
  appointmentServiceName?: string | null;
  appointmentClientNotes?: string | null;
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>;
  newMessageText: string;
};

function appointmentTypeLabel(type: RealEstateAppointmentType): string {
  switch (type) {
    case "visita_presencial":
      return "Visita presencial";
    case "visita_virtual":
      return "Visita virtual";
    case "ligacao_corretor":
      return "Ligação com corretor";
    case "retorno_proposta":
      return "Retorno de proposta";
    case "envio_documentacao":
      return "Envio de documentação";
    default:
      return "Atendimento imobiliário";
  }
}

function normalizeSpace(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildTranscript(
  history: Array<{ text?: string | null; fromMe?: boolean }>,
  newMessageText: string,
  appointmentServiceName?: string | null,
  appointmentClientNotes?: string | null,
): string {
  const transcriptLines = history
    .slice(-10)
    .map((message) => {
      const role = message.fromMe ? "AGENTE" : "CLIENTE";
      return `${role}: ${normalizeSpace(message.text)}`;
    })
    .filter((line) => line.endsWith(": ") === false);

  if (normalizeSpace(newMessageText)) {
    transcriptLines.push(`CLIENTE: ${normalizeSpace(newMessageText)}`);
  }

  if (normalizeSpace(appointmentServiceName)) {
    transcriptLines.push(`SERVICO_ESCOLHIDO: ${normalizeSpace(appointmentServiceName)}`);
  }

  if (normalizeSpace(appointmentClientNotes)) {
    transcriptLines.push(`OBSERVACOES_AGENDAMENTO: ${normalizeSpace(appointmentClientNotes)}`);
  }

  return transcriptLines.join("\n").trim();
}

function buildFallbackAppointmentType(text: string): RealEstateAppointmentType {
  const normalized = text.toLowerCase();
  if (normalized.includes("virtual") || normalized.includes("video")) return "visita_virtual";
  if (normalized.includes("liga") || normalized.includes("telefone") || normalized.includes("chamada")) {
    return "ligacao_corretor";
  }
  if (normalized.includes("proposta")) return "retorno_proposta";
  if (normalized.includes("document")) return "envio_documentacao";
  if (normalized.includes("visita")) return "visita_presencial";
  return "outro";
}

function buildCandidatesText(candidates: RealEstateListingCandidate[]): string {
  if (candidates.length === 0) return "Nenhum imóvel candidato disponível.";

  return candidates
    .map((candidate) =>
      [
        `codigo=${candidate.code || "null"}`,
        `titulo=${candidate.title || "null"}`,
        `bairro=${candidate.neighborhood || "null"}`,
        `cidade=${candidate.city || "null"}`,
        `transacao=${candidate.transactionType || "null"}`,
        `preco=${candidate.price || "null"}`,
      ].join(" | "),
    )
    .join("\n");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.startsWith("```") ? trimmed.slice(trimmed.indexOf("\n") + 1).replace("```", "").trim() : trimmed;
  try {
    const parsed = JSON.parse(fenced);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function inferWithLlm(params: {
  transcript: string;
  candidates: RealEstateListingCandidate[];
}): Promise<{
  appointmentType: RealEstateAppointmentType;
  listingCode: string | null;
  summary: string | null;
} | null> {
  if (!params.transcript) return null;

  try {
    const client = await getLLMClient();
    const response = await client.chat.complete({
      model: "mistral-small-latest",
      temperature: 0.1,
      maxTokens: 400,
      messages: [
        {
          role: "system",
          content: [
            "Você extrai o contexto de um compromisso imobiliário já decidido pela IA.",
            "Responda SOMENTE um JSON puro com o formato:",
            '{"appointmentType":"visita_presencial|visita_virtual|ligacao_corretor|retorno_proposta|envio_documentacao|outro","listingCode":"codigo ou null","summary":"resumo curto ou null"}',
            "Regras:",
            "- listingCode deve ser um dos códigos candidatos se houver correspondência clara.",
            "- appointmentType descreve o tipo do compromisso, não o imóvel.",
            "- summary deve ser curto e fiel ao diálogo.",
            "- Se não souber o código, use null.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "CANDIDATOS:",
            buildCandidatesText(params.candidates),
            "",
            "TRANSCRICAO:",
            params.transcript,
          ].join("\n"),
        },
      ],
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : String(rawContent || "");
    const parsed = parseJsonObject(content);
    if (!parsed) return null;

    const appointmentType = String(parsed.appointmentType || "").trim() as RealEstateAppointmentType;
    const listingCode = typeof parsed.listingCode === "string" ? parsed.listingCode.trim() || null : null;
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() || null : null;

    return {
      appointmentType: REAL_ESTATE_APPOINTMENT_TYPES.includes(appointmentType) ? appointmentType : "outro",
      listingCode,
      summary,
    };
  } catch (error) {
    console.warn("[Imobiliaria/Scheduling] Falha ao inferir contexto via LLM:", error);
    return null;
  }
}

async function getLatestLeadEvent(conversationId: string | null | undefined) {
  if (!conversationId) return null;

  const [leadEvent] = await db
    .select()
    .from(grupoOlxLeadEvents)
    .where(eq(grupoOlxLeadEvents.conversationId, conversationId))
    .orderBy(desc(grupoOlxLeadEvents.createdAt))
    .limit(1);

  return leadEvent ?? null;
}

async function getActiveRealEstateIntegration(userId: string) {
  const [integration] = await db
    .select()
    .from(grupoOlxIntegrations)
    .where(and(eq(grupoOlxIntegrations.userId, userId), eq(grupoOlxIntegrations.active, true)))
    .limit(1);

  return integration ?? null;
}

export async function generateRealEstateSchedulingPromptBlock(userId: string): Promise<string> {
  const integration = await getActiveRealEstateIntegration(userId);
  if (!integration?.active) return "";

  return [
    "======================================================================",
    "IMOBILIARIA - AGENDAMENTOS",
    "======================================================================",
    "Quando a ferramenta Imobiliaria estiver ativa, continue usando o MESMO sistema de agendamento da plataforma.",
    "Regras de dominio:",
    "1. O imovel NAO e o servico. O servico representa o tipo de compromisso.",
    "2. Para agendar, use servicos como: Visita presencial, Visita virtual, Ligacao com corretor, Retorno de proposta, Envio de documentacao.",
    "3. Se o cliente estiver falando de um imovel especifico, preserve esse imovel como contexto do compromisso.",
    "4. Quando chegar a hora de usar [AGENDAR:], o campo SERVICO deve descrever o tipo de compromisso, nunca o codigo do imovel sozinho.",
    "5. Se o cliente pedir visita ou retorno sobre um imovel, voce deve consultar primeiro o catalogo imobiliario e depois conduzir o agendamento.",
    "======================================================================",
  ].join("\n");
}

export async function attachRealEstateContextToAppointment(
  params: InferRealEstateContextParams,
): Promise<RealEstateAppointmentContext | null> {
  const integration = await getActiveRealEstateIntegration(params.userId);
  if (!integration?.active) return null;

  const transcript = buildTranscript(
    params.conversationHistory,
    params.newMessageText,
    params.appointmentServiceName,
    params.appointmentClientNotes,
  );
  const leadEvent = await getLatestLeadEvent(params.conversationId);
  const catalog = await getGrupoOlxCatalogForAI(params.userId, transcript || params.newMessageText || "");
  const candidates: RealEstateListingCandidate[] = (catalog?.listings || []).slice(0, 3).map((listing) => ({
    code: listing.code,
    title: listing.title,
    transactionType: listing.transactionType,
    city: listing.city,
    neighborhood: listing.neighborhood,
    price: listing.price,
    detailUrl: listing.detailUrl,
  }));

  const llmContext = await inferWithLlm({ transcript, candidates });
  const selectedListing =
    candidates.find((candidate) => candidate.code && candidate.code === llmContext?.listingCode) ||
    candidates.find((candidate) => candidate.code && candidate.code === leadEvent?.clientListingId) ||
    candidates[0] ||
    null;

  const fallbackText = [params.appointmentServiceName, params.appointmentClientNotes, transcript].join(" ");
  const appointmentType = llmContext?.appointmentType || buildFallbackAppointmentType(fallbackText);
  const source = llmContext?.listingCode
    ? "llm"
    : leadEvent?.clientListingId
      ? "lead_event"
      : selectedListing
        ? "catalog"
        : "fallback";

  const context: RealEstateAppointmentContext = {
    domain: "real_estate",
    appointmentType,
    appointmentTypeLabel: appointmentTypeLabel(appointmentType),
    source,
    listingCode: selectedListing?.code || leadEvent?.clientListingId || null,
    listingTitle: selectedListing?.title || null,
    listingUrl: selectedListing?.detailUrl || null,
    transactionType: selectedListing?.transactionType || null,
    city: selectedListing?.city || null,
    neighborhood: selectedListing?.neighborhood || null,
    price: selectedListing?.price || null,
    portalSource: leadEvent?.portalSource || null,
    leadType: leadEvent?.leadType || null,
    summary: llmContext?.summary || null,
  };

  const { error } = await supabase
    .from("appointments")
    .update({
      ai_conversation_context: context,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.appointmentId)
    .eq("user_id", params.userId);

  if (error) {
    console.error("[Imobiliaria/Scheduling] Falha ao anexar contexto ao agendamento:", error);
    return null;
  }

  return context;
}

export async function isRealEstateSchedulingActive(userId: string): Promise<boolean> {
  const integration = await getActiveRealEstateIntegration(userId);
  return Boolean(integration?.active);
}

export async function getRealEstateSchedulingPreview(userId: string): Promise<{
  active: boolean;
  selectedInbox: string | null;
  connectionId: string | null;
} | null> {
  const integration = await getActiveRealEstateIntegration(userId);
  if (!integration) return null;

  return {
    active: integration.active,
    selectedInbox: integration.matonInboxEmail,
    connectionId: integration.connectionId,
  };
}
