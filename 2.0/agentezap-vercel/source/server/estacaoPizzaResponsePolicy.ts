import { z } from "zod";

import type { MistralResponse } from "@shared/schema";

export const ESTACAO_PIZZA_USER_ID = "c793d6fd-2159-4822-af74-6d95f415f468";
export const ESTACAO_PIZZA_MENU_MEDIA_NAME = "DELIVERY2_CARDAPIO";
export const ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME = "BEBIDAS_DELIVERY2";

export type EstacaoPizzaHistoryEntry = {
  fromMe?: boolean | null;
  role?: string | null;
  text?: string | null;
  content?: string | null;
  mediaCaption?: string | null;
};

export type EstacaoPizzaMediaContextItem = {
  id?: string | null;
  name?: string | null;
  mediaType?: string | null;
  media_type?: string | null;
  type?: string | null;
  description?: string | null;
  whenToUse?: string | null;
  when_to_use?: string | null;
  caption?: string | null;
  transcription?: string | null;
  flowItems?: unknown;
  flow_items?: unknown;
  isActive?: boolean | null;
  is_active?: boolean | null;
};

export type EstacaoPizzaStructuredExecutor = (params: {
  prompt: string;
  mediaCandidates: EstacaoPizzaMediaCandidate[];
}) => Promise<unknown>;

export type EstacaoPizzaQuickReply = {
  text: string;
  mediaActions: MistralResponse["actions"];
  mode: "estacao_pizza_delivery2_contract";
  reason:
    | "pizza_size_without_flavor"
    | "half_half_observation_step"
    | "half_half_missing_flavors"
    | "half_half_observation_recorded";
  source: "structured_executor" | "structured_state_repair";
};

type EstacaoPizzaMediaCandidate = {
  id: string;
  name: string;
  mediaType: string;
  description: string;
  whenToUse: string;
  caption: string;
  transcription: string;
  flowSummary: string;
};

const estacaoPizzaTurnSchema = z.object({
  action: z.enum([
    "ASK_FLAVOR",
    "ASK_HALF_HALF_FLAVORS",
    "ASK_OBSERVATION",
    "OFFER_BEVERAGES",
    "PASS_THROUGH",
  ])
    .describe("Micro-acao do turno atual. Se a mensagem ja trouxer dois sabores para meio a meio, use ASK_OBSERVATION.")
    .default("PASS_THROUGH"),
  confidence: z.coerce.number().min(0).max(100).describe("Confianca de 0 a 100 na micro-acao escolhida.").default(0),
  reason: z.enum([
    "pizza_size_without_flavor",
    "half_half_observation_step",
    "half_half_missing_flavors",
    "half_half_observation_recorded",
    "not_estacao_delivery2_turn",
  ])
    .describe("Motivo estruturado. half_half_missing_flavors so e valido quando ainda nao ha dois sabores informados.")
    .default("not_estacao_delivery2_turn"),
  replyText: z.string().describe("Texto curto que sera enviado ao cliente se a decisao for aceita.").default(""),
  size: z.string().nullable().describe("Tamanho citado, quando houver.").default(null),
  flavors: z.array(z.string()).describe("Sabores de pizza ja informados na mensagem atual e no historico recente.").default([]),
  observation: z.string().nullable().describe("Observacao do pedido ja informada pelo cliente, quando houver.").default(null),
  mediaNames: z.array(z.string()).describe("Nomes exatos de midias candidatas para enviar.").default([]),
});

type EstacaoPizzaTurnDecision = z.infer<typeof estacaoPizzaTurnSchema>;

function clipForPrompt(value: unknown, limit: number): string {
  const text = String(value ?? "").trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
}

function isAssistantHistory(entry: EstacaoPizzaHistoryEntry): boolean {
  return entry.fromMe === true || entry.role === "assistant";
}

function getHistoryText(entry: EstacaoPizzaHistoryEntry): string {
  return clipForPrompt(entry.text || entry.content || entry.mediaCaption || "", 500);
}

function normalizeStateText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getLastAssistantHistoryText(history: EstacaoPizzaHistoryEntry[] = []): string {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (!isAssistantHistory(entry)) continue;
    const text = getHistoryText(entry);
    if (text) return text;
  }
  return "";
}

function buildHistoryBlock(history: EstacaoPizzaHistoryEntry[] = []): string {
  const lines = history
    .slice(-10)
    .map((entry) => {
      const text = getHistoryText(entry);
      if (!text) return "";
      return `${isAssistantHistory(entry) ? "Agente" : "Cliente"}: ${text}`;
    })
    .filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : "(sem historico relevante)";
}

function getMediaType(media: EstacaoPizzaMediaContextItem): string {
  return String(media.mediaType || media.media_type || media.type || "media").trim().toLowerCase() || "media";
}

function getFlowSummary(flowItems: unknown): string {
  const items = Array.isArray(flowItems) ? flowItems : [];
  const pieces = items
    .slice(0, 8)
    .map((item: any) => {
      const type = clipForPrompt(item?.type || "item", 30);
      const label = clipForPrompt(item?.text || item?.caption || item?.fileName || item?.mediaType || "", 120);
      return label ? `${type}: ${label}` : type;
    })
    .filter(Boolean);

  return pieces.join(" | ");
}

function buildMediaCandidates(mediaLibrary: EstacaoPizzaMediaContextItem[] = []): EstacaoPizzaMediaCandidate[] {
  const candidates: EstacaoPizzaMediaCandidate[] = [];
  const seen = new Set<string>();

  for (const media of mediaLibrary) {
    if (media?.isActive === false || media?.is_active === false) continue;
    const name = String(media?.name || "").trim();
    if (!name || seen.has(name.toUpperCase())) continue;
    seen.add(name.toUpperCase());

    candidates.push({
      id: String(media?.id || `media_${candidates.length + 1}`),
      name,
      mediaType: getMediaType(media),
      description: clipForPrompt(media.description, 260),
      whenToUse: clipForPrompt(media.whenToUse || media.when_to_use, 420),
      caption: clipForPrompt(media.caption, 240),
      transcription: clipForPrompt(media.transcription, 300),
      flowSummary: clipForPrompt(getFlowSummary(media.flowItems || media.flow_items), 600),
    });
  }

  return candidates.slice(0, 80);
}

function hasMedia(candidates: EstacaoPizzaMediaCandidate[], mediaName: string): boolean {
  const target = mediaName.trim().toUpperCase();
  return candidates.some((candidate) => candidate.name.trim().toUpperCase() === target);
}

function buildEstacaoPrompt(params: {
  message: string;
  history?: EstacaoPizzaHistoryEntry[];
  mediaCandidates: EstacaoPizzaMediaCandidate[];
}): string {
  const mediaPayload = params.mediaCandidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    type: candidate.mediaType,
    description: candidate.description,
    whenToUse: candidate.whenToUse,
    caption: candidate.caption,
    transcription: candidate.transcription,
    flowSummary: candidate.flowSummary,
  }));

  return [
    "Voce decide um micro-turno do atendimento Delivery 2.0 da Estacao da Pizza.",
    "Retorne somente o objeto do schema. Nao responda fora do schema.",
    "",
    "Objetivo:",
    "- Continuar pedido de pizza quando o cliente ainda esta escolhendo tamanho, sabores meio a meio ou observacao.",
    "- Anexar somente midias ativas recebidas no contexto.",
    "- Usar PASS_THROUGH quando a mensagem for sobre horario, entrega, preco, bebida isolada, pedido completo, suporte ou qualquer assunto fora destes micro-turnos.",
    "",
    "Acoes permitidas:",
    "- ASK_FLAVOR: cliente quer pizza com tamanho, mas ainda nao informou sabor. A resposta deve pedir o sabor e pode lembrar que pode ser inteira ou meio a meio.",
    "- ASK_HALF_HALF_FLAVORS: cliente quer meio a meio, mas faltam os dois sabores claros.",
    "- ASK_OBSERVATION: cliente informou dois sabores de pizza meio a meio e ainda falta perguntar observacao.",
    "- OFFER_BEVERAGES: o agente acabou de perguntar observacao e o cliente respondeu uma observacao curta; a resposta deve registrar a observacao e oferecer bebidas.",
    "- PASS_THROUGH: deixe a IA principal responder; replyText vazio.",
    "",
    "Midias conhecidas:",
    `- Cardapio esperado: ${ESTACAO_PIZZA_MENU_MEDIA_NAME} (${hasMedia(params.mediaCandidates, ESTACAO_PIZZA_MENU_MEDIA_NAME) ? "disponivel" : "nao disponivel"})`,
    `- Bebidas esperado: ${ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME} (${hasMedia(params.mediaCandidates, ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME) ? "disponivel" : "nao disponivel"})`,
    "- mediaNames deve conter apenas nomes exatos de Midias candidatas.",
    "- Em ASK_FLAVOR, use o cardapio se estiver disponivel.",
    "- Em OFFER_BEVERAGES, use a midia de bebidas se estiver disponivel.",
    "",
    "Regras de resposta:",
    "- Texto curto, humano e natural em portugues do Brasil.",
    "- Nao invente preco, taxa, tempo de entrega ou item nao confirmado.",
    "- Nao use palavras tecnicas ou bastidores.",
    "- Se nao tiver certeza, use PASS_THROUGH com confidence menor que 70.",
    "",
    "Exemplos obrigatorios:",
    "- Cliente: 'quero uma pizza grande' => action ASK_FLAVOR, reason pizza_size_without_flavor, mediaNames com DELIVERY2_CARDAPIO.",
    "- Cliente: 'quero meio a meio' => action ASK_HALF_HALF_FLAVORS, reason half_half_missing_flavors.",
    "- Cliente: 'quero uma grande metade calabresa e metade frango' => action ASK_OBSERVATION, reason half_half_observation_step, flavors ['calabresa','frango'].",
    "- Historico agente perguntou observacao e cliente respondeu 'sem cebola' => action OFFER_BEVERAGES, reason half_half_observation_recorded, observation 'sem cebola'.",
    "",
    `Mensagem atual do cliente: ${clipForPrompt(params.message, 700)}`,
    "",
    "Historico recente:",
    buildHistoryBlock(params.history),
    "",
    "Midias candidatas:",
    JSON.stringify(mediaPayload),
  ].join("\n");
}

function mapReason(decision: EstacaoPizzaTurnDecision): EstacaoPizzaQuickReply["reason"] | null {
  if (decision.action === "ASK_FLAVOR" && decision.reason === "pizza_size_without_flavor") {
    return "pizza_size_without_flavor";
  }
  if (decision.action === "ASK_HALF_HALF_FLAVORS" && decision.reason === "half_half_missing_flavors") {
    return "half_half_missing_flavors";
  }
  if (decision.action === "ASK_OBSERVATION" && decision.reason === "half_half_observation_step") {
    return "half_half_observation_step";
  }
  if (decision.action === "OFFER_BEVERAGES" && decision.reason === "half_half_observation_recorded") {
    return "half_half_observation_recorded";
  }
  return null;
}

function buildMediaActionsFromDecision(
  decision: EstacaoPizzaTurnDecision,
  mediaCandidates: EstacaoPizzaMediaCandidate[],
): MistralResponse["actions"] {
  const available = new Set(mediaCandidates.map((candidate) => candidate.name.trim().toUpperCase()));
  const names = new Set<string>();

  if (decision.action === "ASK_FLAVOR" && available.has(ESTACAO_PIZZA_MENU_MEDIA_NAME)) {
    names.add(ESTACAO_PIZZA_MENU_MEDIA_NAME);
  }
  if (decision.action === "OFFER_BEVERAGES" && available.has(ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME)) {
    names.add(ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME);
  }

  return Array.from(names)
    .filter((mediaName) =>
      mediaName === ESTACAO_PIZZA_MENU_MEDIA_NAME ||
      mediaName === ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME
    )
    .map((mediaName) => ({
      type: "send_media",
      media_name: mediaName,
    }));
}

function normalizeDecisionToReply(params: {
  rawDecision: unknown;
  mediaCandidates: EstacaoPizzaMediaCandidate[];
  source: EstacaoPizzaQuickReply["source"];
  history?: EstacaoPizzaHistoryEntry[];
}): EstacaoPizzaQuickReply | null {
  const decision = estacaoPizzaTurnSchema.parse(params.rawDecision);
  const normalizedFlavors = (decision.flavors || [])
    .map((flavor) => String(flavor || "").trim())
    .filter(Boolean);
  if (
    decision.action === "ASK_HALF_HALF_FLAVORS" &&
    decision.reason === "half_half_missing_flavors" &&
    normalizedFlavors.length >= 2
  ) {
    decision.action = "ASK_OBSERVATION";
    decision.reason = "half_half_observation_step";
    decision.replyText = `Perfeito, pizza meio a meio com ${normalizedFlavors[0]} e ${normalizedFlavors[1]}. Vai querer alguma observacao no pedido?`;
    decision.mediaNames = [];
  }
  const stateRepair = buildStateRepairReply({
    decision,
    message: null,
    history: params.history,
    mediaCandidates: params.mediaCandidates,
  });
  if (stateRepair) return stateRepair;
  if (decision.action === "PASS_THROUGH" || decision.confidence < 70) return null;

  const reason = mapReason(decision);
  const text = decision.replyText.trim();
  if (!reason || !text) return null;

  return {
    text,
    mediaActions: buildMediaActionsFromDecision(decision, params.mediaCandidates),
    mode: "estacao_pizza_delivery2_contract",
    reason,
    source: params.source,
  };
}

function buildStateRepairReply(params: {
  decision?: EstacaoPizzaTurnDecision;
  message: string | null;
  history?: EstacaoPizzaHistoryEntry[];
  mediaCandidates: EstacaoPizzaMediaCandidate[];
}): EstacaoPizzaQuickReply | null {
  const lastAssistant = normalizeStateText(getLastAssistantHistoryText(params.history || []));
  const currentMessage = normalizeStateText(params.message);
  if (params.message != null) {
    if (!currentMessage || currentMessage.length > 160 || currentMessage.includes("?")) return null;
    if (/\b(cancelar|cancela|desistir|desisti|parar|para)\b/i.test(currentMessage)) return null;
  }

  const assistantAskedObservation =
    lastAssistant.includes("observacao") ||
    lastAssistant.includes("alguma observ") ||
    lastAssistant.includes("sem cebola") ||
    lastAssistant.includes("tirar cebola");
  if (
    assistantAskedObservation &&
    (
      !params.decision ||
      params.decision.action === "ASK_OBSERVATION" ||
      params.decision.reason === "half_half_observation_step"
    )
  ) {
    const observed = params.message != null ? clipForPrompt(params.message, 80) : "";
    const decision = estacaoPizzaTurnSchema.parse({
      action: "OFFER_BEVERAGES",
      confidence: 95,
      reason: "half_half_observation_recorded",
      replyText: observed
        ? `Anotado: ${observed}. Quer escolher alguma bebida para acompanhar?`
        : "Anotado. Quer escolher alguma bebida para acompanhar?",
      mediaNames: [ESTACAO_PIZZA_BEVERAGES_MEDIA_NAME],
    });
    return {
      text: decision.replyText,
      mediaActions: buildMediaActionsFromDecision(decision, params.mediaCandidates),
      mode: "estacao_pizza_delivery2_contract",
      reason: "half_half_observation_recorded",
      source: "structured_state_repair",
    };
  }

  const assistantAskedHalfHalfFlavors =
    lastAssistant.includes("quais sabores") ||
    lastAssistant.includes("dois sabores") ||
    lastAssistant.includes("cada metade") ||
    lastAssistant.includes("primeiro sabor");
  if (assistantAskedHalfHalfFlavors && !params.decision) {
    return {
      text: "Perfeito, anotei os sabores do meio a meio. Vai querer alguma observacao no pedido?",
      mediaActions: [],
      mode: "estacao_pizza_delivery2_contract",
      reason: "half_half_observation_step",
      source: "structured_state_repair",
    };
  }

  return null;
}

export async function buildEstacaoPizzaDelivery2StructuredReply(params: {
  userId: string;
  message: string;
  history?: EstacaoPizzaHistoryEntry[];
  mediaLibrary?: EstacaoPizzaMediaContextItem[];
  timeoutMs?: number;
  structuredExecutor?: EstacaoPizzaStructuredExecutor;
}): Promise<EstacaoPizzaQuickReply | null> {
  if (params.userId !== ESTACAO_PIZZA_USER_ID) return null;
  if (!String(params.message || "").trim()) return null;

  const mediaCandidates = buildMediaCandidates(params.mediaLibrary || []);
  const prompt = buildEstacaoPrompt({
    message: params.message,
    history: params.history,
    mediaCandidates,
  });

  const earlyStateRepair = buildStateRepairReply({
    message: params.message,
    history: params.history,
    mediaCandidates,
  });
  if (earlyStateRepair) return earlyStateRepair;

  if (params.structuredExecutor) {
    return normalizeDecisionToReply({
      rawDecision: await params.structuredExecutor({ prompt, mediaCandidates }),
      mediaCandidates,
      source: "structured_executor",
      history: params.history,
    });
  }

  const fallbackStateRepair = buildStateRepairReply({
    message: params.message,
    history: params.history,
    mediaCandidates,
  });
  if (fallbackStateRepair) return fallbackStateRepair;
  return null;
}
