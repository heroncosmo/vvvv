import { isTechnicalStubMessage } from "./incomingStubFallback";

export type PendingFirstMessageRecoverySource = "chat_update_unread" | "stub_unresolved";

export interface PendingFirstMessageRecoveryContext {
  source: PendingFirstMessageRecoverySource;
}

export interface PendingFirstMessageRecoveryMessage {
  fromMe?: boolean | null;
  isFromAgent?: boolean | null;
  text?: string | null;
}

export interface PendingFirstMessageRecoveryDecision {
  eligible: boolean;
  reason: string;
  context?: PendingFirstMessageRecoveryContext;
}

const PENDING_FIRST_MESSAGE_EVENT_PREFIX = "__AGENTEZAP_PENDING_FIRST_MESSAGE_EVENT_V1__";
export const PENDING_FIRST_MESSAGE_INTEREST_TEXT = "Oi, tenho interesse";

export function buildPendingFirstMessagePendingPayload(
  source: PendingFirstMessageRecoverySource,
): string {
  return `${PENDING_FIRST_MESSAGE_EVENT_PREFIX}:${source}`;
}

export function parsePendingFirstMessagePendingPayload(
  value: string | null | undefined,
): PendingFirstMessageRecoveryContext | null {
  const text = String(value || "").trim();
  if (!text.startsWith(`${PENDING_FIRST_MESSAGE_EVENT_PREFIX}:`)) {
    return null;
  }

  const source = text.slice(PENDING_FIRST_MESSAGE_EVENT_PREFIX.length + 1);
  if (source === "chat_update_unread" || source === "stub_unresolved") {
    return { source };
  }

  return null;
}

export function getPendingFirstMessageRecoveryFromMessages(
  messages: Array<string | null | undefined>,
): PendingFirstMessageRecoveryContext | null {
  const nonEmptyMessages = (messages || [])
    .map((message) => String(message || "").trim())
    .filter(Boolean);

  if (nonEmptyMessages.length !== 1) {
    return null;
  }

  return parsePendingFirstMessagePendingPayload(nonEmptyMessages[0]);
}

export function isPendingFirstMessagePendingPayload(value: string | null | undefined): boolean {
  return parsePendingFirstMessagePendingPayload(value) !== null;
}

export function buildPendingFirstMessageAgentText(
  _source: PendingFirstMessageRecoverySource,
): string {
  return PENDING_FIRST_MESSAGE_INTEREST_TEXT;
}

export function buildPendingFirstMessageSystemInstruction(
  source: PendingFirstMessageRecoverySource,
): string {
  const sourceLabel =
    source === "chat_update_unread"
      ? "um sinal de conversa nova nao lida"
      : "uma primeira mensagem que ainda esta carregando";

  return `
CONTEXTO DE PRIMEIRA MENSAGEM PENDENTE

O sistema recebeu ${sourceLabel}, mas o texto real enviado pelo cliente ainda nao ficou disponivel.

Regras obrigatorias para esta resposta:
- Este contexto so e permitido para conversa direta nova, sem historico real anterior.
- Trate a abertura como interesse inicial equivalente a "${PENDING_FIRST_MESSAGE_INTEREST_TEXT}".
- Use o prompt e a configuracao do agente para responder como lead novo interessado.
- Se existir saudacao, funil ou midia inicial configurada, preserve essa abertura.
- Se nao houver contexto suficiente, peca de forma simples para o cliente dizer como pode ajudar.
- Nao mencione erro, sistema, mensagem carregando, API, WhatsApp tecnico ou bastidor.
`.trim();
}

export function shouldReplacePendingFirstMessagePayloadWithRealText(
  messages: Array<string | null | undefined>,
): boolean {
  return getPendingFirstMessageRecoveryFromMessages(messages) !== null;
}

export function decidePendingFirstMessageRecovery(
  params: {
    source: PendingFirstMessageRecoverySource;
    isDirectChat: boolean;
    unreadCount?: number | null;
    conversationWasCreated?: boolean | null;
    existingMessages?: PendingFirstMessageRecoveryMessage[] | null;
    pendingMessages?: Array<string | null | undefined> | null;
  },
): PendingFirstMessageRecoveryDecision {
  if (!params.isDirectChat) {
    return { eligible: false, reason: "not_direct_chat" };
  }

  const existingMessages = params.existingMessages || [];
  const pendingMessages = params.pendingMessages || [];
  const hasOwnerOrAgentReply = existingMessages.some(
    (message) => message?.fromMe === true || message?.isFromAgent === true,
  );

  if (hasOwnerOrAgentReply) {
    return { eligible: false, reason: "conversation_already_replied" };
  }

  const hasMeaningfulClientText = existingMessages.some((message) => {
    if (!message || message.fromMe === true || message.isFromAgent === true) {
      return false;
    }

    const text = String(message.text || "").trim();
    return Boolean(text) && !isTechnicalStubMessage(text);
  });

  if (hasMeaningfulClientText) {
    return { eligible: false, reason: "real_client_text_already_exists" };
  }

  const pendingHasRealText = pendingMessages.some((message) => {
    const text = String(message || "").trim();
    if (!text) return false;
    if (isPendingFirstMessagePendingPayload(text)) return false;
    return !isTechnicalStubMessage(text);
  });

  if (pendingHasRealText) {
    return { eligible: false, reason: "pending_has_real_text" };
  }

  if (params.source === "chat_update_unread") {
    if (Number(params.unreadCount || 0) <= 0) {
      return { eligible: false, reason: "unread_count_missing" };
    }

    if (params.conversationWasCreated !== true) {
      return { eligible: false, reason: "conversation_not_new" };
    }
  }

  if (
    params.source === "stub_unresolved" &&
    params.conversationWasCreated !== true &&
    existingMessages.length > 1
  ) {
    return { eligible: false, reason: "conversation_not_new" };
  }

  const hasTechnicalInbound =
    existingMessages.some((message) => {
      if (!message || message.fromMe === true || message.isFromAgent === true) {
        return false;
      }
      return isTechnicalStubMessage(message.text);
    }) ||
    pendingMessages.some((message) => {
      const text = String(message || "").trim();
      return Boolean(text) && isTechnicalStubMessage(text);
    });

  if (params.source === "stub_unresolved" && !hasTechnicalInbound) {
    return { eligible: false, reason: "stub_signal_missing" };
  }

  return {
    eligible: true,
    reason: "eligible_pending_first_message",
    context: { source: params.source },
  };
}
