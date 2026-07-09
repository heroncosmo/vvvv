export interface AIMessageGenerationRequest {
  conversationId?: string;
  baseMessage?: string;
  prompt?: string;
  context?: unknown;
  contactName?: string;
}

export interface AIMessageConversationSnapshot {
  contactName?: string | null;
  contactNumber?: string | null;
  lastMessageText?: string | null;
}

export interface AIMessageGenerationResult {
  generatedMessage: string;
  originalMessage: string;
  model: string;
}

export interface AIMessageCodexExecutorInput {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  message: string;
  conversationId?: string | null;
  contactName?: string;
  maxTokens?: number;
  timeoutMs?: number;
  contextArtifacts?: Record<string, unknown>;
}

export type AIMessageCodexExecutor = (input: AIMessageCodexExecutorInput) => Promise<string>;

interface NormalizedAIMessageRequest {
  conversationId?: string;
  baseMessage?: string;
  prompt?: string;
  originalMessage: string;
  contextSummary: string;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pushContextLine(target: string[], label: string, value: unknown): void {
  const normalized = normalizeOptionalText(value);
  if (normalized) {
    target.push(`${label}: ${normalized}`);
  }
}

function describeContextValue(label: string, value: unknown, lines: string[]): void {
  if (value == null) {
    return;
  }

  const asText = normalizeOptionalText(value);
  if (asText) {
    lines.push(label ? `${label}: ${asText}` : asText);
    return;
  }

  if (Array.isArray(value)) {
    const collectedItems: string[] = [];
    for (const item of value) {
      const itemText = normalizeOptionalText(item);
      if (itemText) {
        collectedItems.push(itemText);
      }
    }

    if (collectedItems.length > 0) {
      lines.push(`${label}: ${collectedItems.join(" | ")}`);
    }
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nestedLines: string[] = [];

    if (label === "contexto" || label === "context") {
      pushContextLine(nestedLines, "Nome do contato", record.contactName);
      describeContextValue("Ultimas mensagens", record.lastMessages, nestedLines);
      describeContextValue("Historico recente", record.history, nestedLines);
      describeContextValue("Contexto adicional", record.context, nestedLines);
    }

    for (const [key, nestedValue] of Object.entries(record)) {
      if (
        key === "contactName" ||
        key === "lastMessages" ||
        key === "history" ||
        key === "context"
      ) {
        continue;
      }

      describeContextValue(key, nestedValue, nestedLines);
    }

    if (nestedLines.length > 0) {
      lines.push(...nestedLines);
    }
  }
}

export function normalizeAIMessageRequest(
  input: AIMessageGenerationRequest,
  conversation?: AIMessageConversationSnapshot | null,
): NormalizedAIMessageRequest {
  const baseMessage = normalizeOptionalText(input.baseMessage);
  const prompt = normalizeOptionalText(input.prompt);
  const contactName =
    normalizeOptionalText(input.contactName) ||
    normalizeOptionalText(conversation?.contactName);

  const contextLines: string[] = [];

  if (contactName) {
    contextLines.push(`Nome do contato: ${contactName}`);
  }

  pushContextLine(contextLines, "Telefone do contato", conversation?.contactNumber);
  pushContextLine(contextLines, "Ultima mensagem da conversa", conversation?.lastMessageText);
  describeContextValue("contexto", input.context, contextLines);

  const dedupedLines = Array.from(
    new Set(
      contextLines
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  );

  const originalMessage = baseMessage || prompt || "";

  return {
    conversationId: normalizeOptionalText(input.conversationId),
    baseMessage,
    prompt,
    originalMessage,
    contextSummary:
      dedupedLines.length > 0
        ? dedupedLines.join("\n")
        : "Sem contexto adicional informado.",
  };
}

function buildSystemPrompt(hasBaseMessage: boolean): string {
  return [
    "Voce e um assistente de atendimento ao cliente operando dentro de um orquestrador conversacional stateful.",
    "Considere memoria recente, contexto da conversa e continuidade do atendimento antes de responder.",
    hasBaseMessage
      ? "Sua tarefa e melhorar a mensagem base mantendo a intencao original, deixando-a mais natural, clara e pronta para envio no WhatsApp."
      : "Sua tarefa e gerar uma unica mensagem pronta para envio no WhatsApp a partir da instrucao solicitada pelo atendente.",
    "Responda apenas com o texto final da mensagem.",
    "Nao explique seu raciocinio, nao liste opcoes e nao use marcadores.",
    "Se faltar contexto, seja prudente e nao invente fatos.",
    "Mantenha portugues do Brasil natural, humano e objetivo.",
  ].join("\n");
}

function buildUserPrompt(
  normalized: NormalizedAIMessageRequest,
  hasBaseMessage: boolean,
): string {
  const sections: string[] = [
    "CONTEXTO DA CONVERSA:",
    normalized.contextSummary,
  ];

  if (hasBaseMessage && normalized.baseMessage) {
    sections.push("MENSAGEM BASE:");
    sections.push(normalized.baseMessage);

    if (normalized.prompt && normalized.prompt !== normalized.baseMessage) {
      sections.push("INSTRUCAO COMPLEMENTAR:");
      sections.push(normalized.prompt);
    }
  } else if (normalized.prompt) {
    sections.push("INSTRUCAO DO ATENDENTE:");
    sections.push(normalized.prompt);
  }

  sections.push("Gere somente a mensagem final.");

  return sections.join("\n\n");
}

function extractGeneratedMessage(response: string): string {
  const content = typeof response === "string" ? response.trim() : "";
  if (content.length > 0) {
    return content;
  }

  throw new Error("Codex CLI retornou uma resposta vazia para geracao de mensagem.");
}

export async function generateAIMessage(
  input: AIMessageGenerationRequest,
  conversation?: AIMessageConversationSnapshot | null,
  executeCodex?: AIMessageCodexExecutor,
): Promise<AIMessageGenerationResult> {
  const normalized = normalizeAIMessageRequest(input, conversation);

  if (!normalized.originalMessage) {
    throw new Error("Informe uma instrucao ou mensagem base para gerar a resposta.");
  }

  if (!executeCodex) {
    throw new Error("Geracao de mensagem exige Codex CLI context-only.");
  }

  const hasBaseMessage = Boolean(normalized.baseMessage);
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: buildSystemPrompt(hasBaseMessage) },
    { role: "user", content: buildUserPrompt(normalized, hasBaseMessage) },
  ];

  const response = await executeCodex({
    messages,
    message: normalized.originalMessage,
    conversationId: normalized.conversationId,
    contactName:
      normalizeOptionalText(input.contactName) ||
      normalizeOptionalText(conversation?.contactName),
    maxTokens: 400,
    timeoutMs: 45_000,
    contextArtifacts: {
      source: "aiMessageGenerationService",
      hasBaseMessage,
      contextSummary: normalized.contextSummary,
      conversationSnapshot: conversation || null,
      requestContext: input.context ?? null,
    },
  });

  return {
    generatedMessage: extractGeneratedMessage(response),
    originalMessage: normalized.originalMessage,
    model: "codex-cli",
  };
}
