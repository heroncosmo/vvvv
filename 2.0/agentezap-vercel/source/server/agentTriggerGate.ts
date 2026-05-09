export type TriggerMatchLocation = "last" | "history" | "no-filter" | "none";

export interface AgentTriggerMatchResult {
  matched: boolean;
  foundIn: TriggerMatchLocation;
  phrase?: string;
}

export interface AgentTriggerHistoryMessage {
  fromMe?: boolean | null;
  text?: string | null;
}

function normalizeAgentTriggerText(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAgentTriggerText(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeAgentTriggerText(haystack);
  const normalizedNeedle = normalizeAgentTriggerText(needle);
  if (!normalizedNeedle) return false;

  const haystackWithoutSpaces = normalizedHaystack.replace(/\s+/g, "");
  const needleWithoutSpaces = normalizedNeedle.replace(/\s+/g, "");
  return (
    normalizedHaystack.includes(normalizedNeedle) ||
    haystackWithoutSpaces.includes(needleWithoutSpaces)
  );
}

export function evaluateAgentTriggerMatch(params: {
  triggerPhrases?: string[] | null;
  currentMessages?: string[] | string | null;
  conversationHistory?: AgentTriggerHistoryMessage[] | null;
}): AgentTriggerMatchResult {
  const triggerPhrases = (params.triggerPhrases || []).filter(
    (phrase): phrase is string => typeof phrase === "string" && phrase.trim().length > 0,
  );

  if (triggerPhrases.length === 0) {
    return { matched: true, foundIn: "no-filter" };
  }

  const currentMessages = Array.isArray(params.currentMessages)
    ? params.currentMessages
    : [params.currentMessages || ""];
  const currentText = currentMessages.filter(Boolean).join(" ");
  const customerHistoryText = (params.conversationHistory || [])
    .filter((message) => message && message.fromMe !== true)
    .map((message) => message.text || "")
    .filter(Boolean)
    .join(" ");

  for (const phrase of triggerPhrases) {
    const inCurrent = includesAgentTriggerText(currentText, phrase);
    if (inCurrent) {
      return { matched: true, foundIn: "last", phrase };
    }

    const inCustomerHistory = includesAgentTriggerText(customerHistoryText, phrase);
    if (inCustomerHistory) {
      return { matched: true, foundIn: "history", phrase };
    }
  }

  return { matched: false, foundIn: "none" };
}
