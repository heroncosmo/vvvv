interface ConversationLikeMessage {
  fromMe?: boolean;
  isFromAgent?: boolean;
  text?: string | null;
}

export const INITIAL_META_STUB_FALLBACK_TEXT = "Oi, tenho interesse.";

const TECHNICAL_STUB_MARKERS = [
  "mensagem incompleta",
  "[mensagem de protocolo]",
  "[mensagem nao suportada]",
];

function normalizeStubText(text?: string | null): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isTechnicalStubMessage(text?: string | null): boolean {
  const normalized = normalizeStubText(text);
  if (!normalized) return true;

  return TECHNICAL_STUB_MARKERS.some((marker) => normalized.includes(marker));
}

export function normalizeInitialStubMessageForAI(
  currentText: string,
  conversationHistory: ConversationLikeMessage[],
): { text: string; wasNormalized: boolean; reason: string | null } {
  if (!isTechnicalStubMessage(currentText)) {
    return { text: currentText, wasNormalized: false, reason: null };
  }

  const hasAgentReplies = conversationHistory.some(
    (message) => message.fromMe === true || message.isFromAgent === true,
  );

  if (hasAgentReplies) {
    return { text: currentText, wasNormalized: false, reason: "conversation_already_started" };
  }

  const hasMeaningfulClientText = conversationHistory.some((message) => {
    if (message.fromMe === true || message.isFromAgent === true) return false;
    return !isTechnicalStubMessage(message.text);
  });

  if (hasMeaningfulClientText) {
    return { text: currentText, wasNormalized: false, reason: "real_client_text_already_exists" };
  }

  return {
    text: INITIAL_META_STUB_FALLBACK_TEXT,
    wasNormalized: true,
    reason: "initial_meta_stub",
  };
}
