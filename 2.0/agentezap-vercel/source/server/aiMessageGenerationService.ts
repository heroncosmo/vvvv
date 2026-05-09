import { chatComplete, type ChatMessage } from "./llm";

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

export type AIMessageLLMExecutor = typeof chatComplete;

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
      describeContextValue("Últimas mensagens", record.lastMessages, nestedLines);
      describeContextValue("Histórico recente", record.history, nestedLines);
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
  pushContextLine(contextLines, "Última mensagem da conversa", conversation?.lastMessageText);
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
    "Você é um assistente de atendimento ao cliente operando dentro de um orquestrador conversacional stateful.",
    "Considere memória recente, contexto da conversa e continuidade do atendimento antes de responder.",
    hasBaseMessage
      ? "Sua tarefa é melhorar a mensagem base mantendo a intenção original, deixando-a mais natural, clara e pronta para envio no WhatsApp."
      : "Sua tarefa é gerar uma única mensagem pronta para envio no WhatsApp a partir da instrução solicitada pelo atendente.",
    "Responda apenas com o texto final da mensagem.",
    "Não explique seu raciocínio, não liste opções e não use marcadores.",
    "Se faltar contexto, seja prudente e não invente fatos.",
    "Mantenha português do Brasil natural, humano e objetivo.",
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
      sections.push("INSTRUÇÃO COMPLEMENTAR:");
      sections.push(normalized.prompt);
    }
  } else if (normalized.prompt) {
    sections.push("INSTRUÇÃO DO ATENDENTE:");
    sections.push(normalized.prompt);
  }

  sections.push("Gere somente a mensagem final.");

  return sections.join("\n\n");
}

function extractGeneratedMessage(
  response: Awaited<ReturnType<typeof chatComplete>>,
  fallback?: string,
): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }

  if (fallback) {
    return fallback;
  }

  throw new Error("LLM retornou uma resposta vazia para geração de mensagem.");
}

export async function generateAIMessage(
  input: AIMessageGenerationRequest,
  conversation?: AIMessageConversationSnapshot | null,
  executeLLM: AIMessageLLMExecutor = chatComplete,
): Promise<AIMessageGenerationResult> {
  const normalized = normalizeAIMessageRequest(input, conversation);

  if (!normalized.originalMessage) {
    throw new Error("Informe uma instrução ou mensagem base para gerar a resposta.");
  }

  const hasBaseMessage = Boolean(normalized.baseMessage);
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(hasBaseMessage) },
    { role: "user", content: buildUserPrompt(normalized, hasBaseMessage) },
  ];

  const response = await executeLLM({
    messages,
    maxTokens: 400,
    temperature: hasBaseMessage ? 0.5 : 0.7,
  });

  return {
    generatedMessage: extractGeneratedMessage(response, normalized.baseMessage),
    originalMessage: normalized.originalMessage,
    model: "llm-unified",
  };
}
