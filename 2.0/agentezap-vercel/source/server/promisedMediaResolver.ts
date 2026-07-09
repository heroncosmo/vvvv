type PromisedMediaDecision = {
  decision: "SEND" | "NO_MEDIA";
  candidateId?: string | null;
  mediaName?: string | null;
  confidence: number;
  reason: string;
};

export type PromisedMediaInputItem = {
  name?: string | null;
  mediaType?: string | null;
  media_type?: string | null;
  type?: string | null;
  description?: string | null;
  whenToUse?: string | null;
  when_to_use?: string | null;
  caption?: string | null;
  transcription?: string | null;
  isActive?: boolean | null;
  is_active?: boolean | null;
};

type PromisedMediaCandidate = {
  id: string;
  source: PromisedMediaInputItem;
  name: string;
  normalizedName: string;
  compactName: string;
  mediaType: string;
  description: string;
  whenToUse: string;
  caption: string;
  transcription: string;
};

export type PromisedMediaStructuredExecutor = (params: {
  prompt: string;
  candidates: Array<{
    id: string;
    name: string;
    type: string;
    description: string;
    whenToUse: string;
    caption: string;
    transcription: string;
  }>;
}) => Promise<unknown>;

export type PromisedMediaResolution = {
  shouldSendMedia: boolean;
  mediaName: string | null;
  confidence: number;
  reason: string;
  provider?: string;
  model?: string;
  source: "structured_executor" | "unavailable" | "no_match";
};

function normalizePromisedMediaName(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function compactPromisedMediaName(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

function trimForPrompt(value: unknown, maxLength: number): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function getPromisedMediaType(media: PromisedMediaInputItem): string {
  return String(media.mediaType || media.media_type || media.type || "media").trim().toLowerCase() || "media";
}

function getSentMediaKeys(sentMedias: unknown): Set<string> {
  const keys = new Set<string>();
  const values = Array.isArray(sentMedias) ? sentMedias : [];

  for (const value of values) {
    const name = typeof value === "string"
      ? value
      : (value as any)?.name || (value as any)?.mediaName || (value as any)?.media_name || "";
    const normalized = normalizePromisedMediaName(name);
    const compact = compactPromisedMediaName(name);
    if (normalized) keys.add(normalized);
    if (compact) keys.add(compact);
  }

  return keys;
}

function buildPromisedMediaCandidates(params: {
  mediaLibrary: PromisedMediaInputItem[];
  sentMedias?: unknown;
}): PromisedMediaCandidate[] {
  const sentKeys = getSentMediaKeys(params.sentMedias);
  const seen = new Set<string>();
  const candidates: PromisedMediaCandidate[] = [];

  for (const media of params.mediaLibrary || []) {
    if (media?.isActive === false || media?.is_active === false) continue;

    const name = String(media?.name || "").trim();
    const normalizedName = normalizePromisedMediaName(name);
    const compactName = compactPromisedMediaName(name);
    if (!name || !normalizedName) continue;
    if (sentKeys.has(normalizedName) || sentKeys.has(compactName)) continue;
    if (seen.has(normalizedName) || seen.has(compactName)) continue;

    seen.add(normalizedName);
    if (compactName) seen.add(compactName);

    candidates.push({
      id: `media_${candidates.length + 1}`,
      source: media,
      name,
      normalizedName,
      compactName,
      mediaType: getPromisedMediaType(media),
      description: trimForPrompt(media.description, 320),
      whenToUse: trimForPrompt(media.whenToUse || media.when_to_use, 520),
      caption: trimForPrompt(media.caption, 260),
      transcription: trimForPrompt(media.transcription, 360),
    });

    if (candidates.length >= 80) break;
  }

  return candidates;
}

function buildPromisedMediaPrompt(params: {
  customerMessage: string;
  assistantResponse: string;
  conversationHistory?: Array<{ text?: string | null; content?: string | null; fromMe?: boolean | null; role?: string | null }>;
  candidates: PromisedMediaCandidate[];
}): string {
  const history = (params.conversationHistory || [])
    .slice(-8)
    .map((entry) => {
      const role = entry.fromMe === true || entry.role === "assistant" ? "Agente" : "Cliente";
      return `${role}: ${trimForPrompt(entry.text ?? entry.content, 240)}`;
    })
    .filter((line) => line.trim().length > 9)
    .join("\n");

  const candidatePayload = params.candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    type: candidate.mediaType,
    description: candidate.description,
    whenToUse: candidate.whenToUse,
    caption: candidate.caption,
    transcription: candidate.transcription,
  }));

  return [
    "Voce decide se uma promessa imediata de envio de midia pode ser cumprida com uma midia ativa ja cadastrada.",
    "Retorne somente o objeto do schema. Nao responda ao cliente.",
    "",
    "Regras:",
    "- Use SEND somente quando uma unica candidata combina claramente com a mensagem atual, a resposta do agente e o campo whenToUse.",
    "- Se a resposta do agente prometeu video/foto/audio/material e existe exatamente uma candidata ativa desse tipo que combina com o assunto, escolha essa candidata.",
    "- Se houver mais de uma candidata plausivel sem diferenca clara, use NO_MEDIA.",
    "- Nao invente nome de midia. candidateId deve ser um dos ids fornecidos e mediaName deve ser o nome exato da candidata.",
    "- Nao escolha midia operacional de Pix/endereco/mapa se o assunto atual for produto, tema ou catalogo. Tambem nao escolha midia de produto para Pix/endereco/mapa.",
    "- Se nenhuma candidata ativa combina com o assunto atual, use NO_MEDIA.",
    "- Confidence deve ser 0-100. Use 70 ou mais apenas quando a escolha for clara.",
    "",
    `Mensagem atual do cliente: ${trimForPrompt(params.customerMessage, 800)}`,
    "",
    "Resposta final do agente que sera enviada:",
    trimForPrompt(params.assistantResponse, 1200),
    "",
    "Historico recente:",
    history || "(sem historico relevante)",
    "",
    "Midias candidatas:",
    JSON.stringify(candidatePayload),
  ].join("\n");
}

function buildContextualMediaPrompt(params: {
  customerMessage: string;
  assistantResponse?: string;
  conversationHistory?: Array<{ text?: string | null; content?: string | null; fromMe?: boolean | null; role?: string | null }>;
  candidates: PromisedMediaCandidate[];
}): string {
  const history = (params.conversationHistory || [])
    .slice(-8)
    .map((entry) => {
      const role = entry.fromMe === true || entry.role === "assistant" ? "Agente" : "Cliente";
      return `${role}: ${trimForPrompt(entry.text ?? entry.content, 240)}`;
    })
    .filter((line) => line.trim().length > 9)
    .join("\n");

  const candidatePayload = params.candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    type: candidate.mediaType,
    description: candidate.description,
    whenToUse: candidate.whenToUse,
    caption: candidate.caption,
    transcription: candidate.transcription,
  }));

  return [
    "Voce decide se uma midia ativa ja cadastrada deve ser enviada neste turno pelo contrato whenToUse.",
    "Retorne somente o objeto do schema. Nao responda ao cliente.",
    "",
    "Regras:",
    "- Use SEND quando uma unica candidata combina claramente com a mensagem atual e com o campo whenToUse, mesmo que o cliente nao use palavras como foto, imagem ou video.",
    "- Use NO_MEDIA quando o cliente pedir apenas texto, endereco, localizacao, horario, agendamento, forma de pagamento, suporte, plano, preco ou dados operacionais, a menos que a candidata tenha whenToUse especifico para esse mesmo pedido operacional.",
    "- Nao escolha midia de curso, produto, catalogo ou tema comercial para pergunta apenas de endereco, localizacao, agenda ou pagamento.",
    "- Nao escolha midia operacional de Pix, endereco ou mapa para pergunta sobre curso, produto, catalogo ou tema comercial.",
    "- Se houver mais de uma candidata plausivel sem diferenca clara, use NO_MEDIA.",
    "- Nao invente nome de midia. candidateId deve ser um dos ids fornecidos e mediaName deve ser o nome exato da candidata.",
    "- Se nenhuma candidata ativa combina diretamente com o assunto atual, use NO_MEDIA.",
    "- Confidence deve ser 0-100. Use 78 ou mais apenas quando a escolha for clara.",
    "",
    `Mensagem atual do cliente: ${trimForPrompt(params.customerMessage, 800)}`,
    "",
    "Resposta final do agente que sera enviada:",
    trimForPrompt(params.assistantResponse, 1200) || "(sem texto)",
    "",
    "Historico recente:",
    history || "(sem historico relevante)",
    "",
    "Midias candidatas:",
    JSON.stringify(candidatePayload),
  ].join("\n");
}

function resolveCandidateFromDecision(
  decision: PromisedMediaDecision,
  candidates: PromisedMediaCandidate[],
): PromisedMediaCandidate | null {
  const candidateId = String(decision.candidateId || "").trim();
  if (candidateId) {
    const byId = candidates.find((candidate) => candidate.id === candidateId);
    if (byId) return byId;
  }

  const normalizedName = normalizePromisedMediaName(decision.mediaName);
  const compactName = compactPromisedMediaName(decision.mediaName);
  if (!normalizedName && !compactName) return null;

  return candidates.find((candidate) =>
    candidate.normalizedName === normalizedName ||
    candidate.compactName === compactName
  ) || null;
}

function parsePromisedMediaDecision(rawDecision: unknown): PromisedMediaDecision {
  const raw = rawDecision && typeof rawDecision === "object"
    ? rawDecision as Record<string, unknown>
    : {};
  const decision = raw.decision === "SEND" ? "SEND" : "NO_MEDIA";
  const confidence = Math.max(0, Math.min(100, Number(raw.confidence || 0) || 0));
  return {
    decision,
    candidateId: raw.candidateId == null ? null : String(raw.candidateId),
    mediaName: raw.mediaName == null ? null : String(raw.mediaName),
    confidence,
    reason: String(raw.reason || ""),
  };
}

function normalizePromisedMediaResolution(params: {
  rawDecision: unknown;
  candidates: PromisedMediaCandidate[];
  minimumConfidence: number;
  source: "structured_executor";
  provider?: string;
  model?: string;
}): PromisedMediaResolution {
  const decision = parsePromisedMediaDecision(params.rawDecision);
  const confidence = Number(decision.confidence || 0);
  const candidate = resolveCandidateFromDecision(decision, params.candidates);
  const reason = decision.reason || "structured_decision";

  if (
    decision.decision === "SEND" &&
    candidate &&
    confidence >= params.minimumConfidence
  ) {
    return {
      shouldSendMedia: true,
      mediaName: candidate.name,
      confidence,
      reason,
      provider: params.provider,
      model: params.model,
      source: params.source,
    };
  }

  return {
    shouldSendMedia: false,
    mediaName: null,
    confidence,
    reason: candidate ? reason : `sem_candidata_exata:${reason}`,
    provider: params.provider,
    model: params.model,
    source: "no_match",
  };
}

export async function resolvePromisedMediaWithCodexContract(params: {
  userId?: string;
  customerMessage: string;
  assistantResponse: string;
  conversationHistory?: Array<{ text?: string | null; content?: string | null; fromMe?: boolean | null; role?: string | null }>;
  mediaLibrary: PromisedMediaInputItem[];
  sentMedias?: unknown;
  minimumConfidence?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  structuredExecutor?: PromisedMediaStructuredExecutor;
}): Promise<PromisedMediaResolution> {
  const candidates = buildPromisedMediaCandidates({
    mediaLibrary: params.mediaLibrary || [],
    sentMedias: params.sentMedias,
  });
  if (candidates.length === 0) {
    return {
      shouldSendMedia: false,
      mediaName: null,
      confidence: 0,
      reason: "sem_midias_candidatas",
      source: "unavailable",
    };
  }

  const prompt = buildPromisedMediaPrompt({
    customerMessage: params.customerMessage,
    assistantResponse: params.assistantResponse,
    conversationHistory: params.conversationHistory,
    candidates,
  });
  const minimumConfidence = Math.max(50, Math.min(95, params.minimumConfidence ?? 70));

  if (params.structuredExecutor) {
    const executorPayload = candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      type: candidate.mediaType,
      description: candidate.description,
      whenToUse: candidate.whenToUse,
      caption: candidate.caption,
      transcription: candidate.transcription,
    }));
    const rawDecision = await params.structuredExecutor({
      prompt,
      candidates: executorPayload,
    });
    return normalizePromisedMediaResolution({
      rawDecision,
      candidates,
      minimumConfidence,
      source: "structured_executor",
    });
  }

  return {
    shouldSendMedia: false,
    mediaName: null,
    confidence: 0,
    reason: "media_selection_requires_codex_contract",
    source: "unavailable",
  };
}

export async function resolveContextualMediaWithCodexContract(params: {
  userId?: string;
  customerMessage: string;
  assistantResponse?: string;
  conversationHistory?: Array<{ text?: string | null; content?: string | null; fromMe?: boolean | null; role?: string | null }>;
  mediaLibrary: PromisedMediaInputItem[];
  sentMedias?: unknown;
  minimumConfidence?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  structuredExecutor?: PromisedMediaStructuredExecutor;
}): Promise<PromisedMediaResolution> {
  const candidates = buildPromisedMediaCandidates({
    mediaLibrary: params.mediaLibrary || [],
    sentMedias: params.sentMedias,
  });
  if (candidates.length === 0) {
    return {
      shouldSendMedia: false,
      mediaName: null,
      confidence: 0,
      reason: "sem_midias_candidatas",
      source: "unavailable",
    };
  }

  const prompt = buildContextualMediaPrompt({
    customerMessage: params.customerMessage,
    assistantResponse: params.assistantResponse,
    conversationHistory: params.conversationHistory,
    candidates,
  });
  const minimumConfidence = Math.max(60, Math.min(95, params.minimumConfidence ?? 78));

  if (params.structuredExecutor) {
    const executorPayload = candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      type: candidate.mediaType,
      description: candidate.description,
      whenToUse: candidate.whenToUse,
      caption: candidate.caption,
      transcription: candidate.transcription,
    }));
    const rawDecision = await params.structuredExecutor({
      prompt,
      candidates: executorPayload,
    });
    return normalizePromisedMediaResolution({
      rawDecision,
      candidates,
      minimumConfidence,
      source: "structured_executor",
    });
  }

  return {
    shouldSendMedia: false,
    mediaName: null,
    confidence: 0,
    reason: "media_selection_requires_codex_contract",
    source: "unavailable",
  };
}
