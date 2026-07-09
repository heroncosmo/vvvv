interface ConversationLikeMessage {
  fromMe?: boolean;
  isFromAgent?: boolean;
  text?: string | null;
}

export const UNRESOLVED_INCOMING_STUB_TEXT = "Mensagem recebida ainda carregando.";
export const INITIAL_META_STUB_FALLBACK_TEXT = UNRESOLVED_INCOMING_STUB_TEXT;

const TECHNICAL_STUB_MARKERS = [
  "mensagem incompleta",
  "mensagem recebida ainda carregando",
  "[mensagem de protocolo]",
  "[mensagem nao suportada]",
  "[mensagem nao suportada:",
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

export function isInitialMetaStubFallbackCandidate(text?: string | null): boolean {
  const normalized = normalizeStubText(text);
  if (!normalized) return false;

  if (!normalized.includes("mensagem incompleta")) {
    return false;
  }

  return (
    normalized.includes("stubtype=2") ||
    normalized.startsWith("[whatsapp] mensagem incompleta") ||
    normalized.startsWith("whatsapp mensagem incompleta") ||
    normalized === "mensagem incompleta"
  );
}

export function normalizeInitialStubMessageForAI(
  currentText: string,
  conversationHistory: ConversationLikeMessage[],
): { text: string; wasNormalized: boolean; reason: string | null } {
  if (!isTechnicalStubMessage(currentText)) {
    return { text: currentText, wasNormalized: false, reason: null };
  }

  if (!isInitialMetaStubFallbackCandidate(currentText)) {
    return { text: currentText, wasNormalized: false, reason: "not_initial_meta_stub" };
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

  return { text: currentText, wasNormalized: false, reason: "initial_meta_stub_unresolved" };
}
