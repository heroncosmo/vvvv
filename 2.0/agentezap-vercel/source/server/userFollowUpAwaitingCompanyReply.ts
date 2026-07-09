export const WAITING_FOR_COMPANY_REPLY_REASON =
  "Cliente foi o \u00faltimo a falar - aguardar resposta da empresa antes de follow-up";

const LEGACY_WAITING_FOR_COMPANY_REPLY_REASON =
  "Cliente respondeu - aguardando resposta da empresa";

const MOJIBAKE_WAITING_FOR_COMPANY_REPLY_REASON =
  "Cliente foi o \u00c3\u00baltimo a falar - aguardar resposta da empresa antes de follow-up";

const NORMALIZE_CHAR_MAP: Record<string, string> = {
  "\u00e1": "a",
  "\u00e0": "a",
  "\u00e2": "a",
  "\u00e3": "a",
  "\u00e4": "a",
  "\u00e9": "e",
  "\u00ea": "e",
  "\u00eb": "e",
  "\u00ed": "i",
  "\u00ee": "i",
  "\u00ef": "i",
  "\u00f3": "o",
  "\u00f4": "o",
  "\u00f5": "o",
  "\u00f6": "o",
  "\u00fa": "u",
  "\u00fc": "u",
  "\u00e7": "c",
};

const WAITING_FOR_COMPANY_REPLY_REASON_KEYS = [
  WAITING_FOR_COMPANY_REPLY_REASON,
  MOJIBAKE_WAITING_FOR_COMPANY_REPLY_REASON,
  LEGACY_WAITING_FOR_COMPANY_REPLY_REASON,
].map(normalizeWaitingReasonKey);

type AwaitingCompanyReplyConversation = {
  followupStage?: number | null;
  lastMessageFromMe?: boolean | null;
  followupDisabledReason?: string | null;
};

function normalizeWaitingReasonKey(value: string): string {
  const normalized: string[] = [];

  for (const char of value.trim().toLowerCase()) {
    const mapped = NORMALIZE_CHAR_MAP[char] || char;

    for (const mappedChar of mapped) {
      const code = mappedChar.charCodeAt(0);
      const isDigit = code >= 48 && code <= 57;
      const isAsciiLower = code >= 97 && code <= 122;

      if (isDigit || isAsciiLower) {
        normalized.push(mappedChar);
      }
    }
  }

  return normalized.join("");
}

export function isWaitingForCompanyReplyReason(reason: string | null | undefined): boolean {
  if (!reason) {
    return false;
  }

  const key = normalizeWaitingReasonKey(reason);
  return WAITING_FOR_COMPANY_REPLY_REASON_KEYS.includes(key);
}

export function shouldHoldFollowUpUntilCompanyReply(
  conversation: AwaitingCompanyReplyConversation,
): boolean {
  const stage = Number.isFinite(Number(conversation.followupStage))
    ? Number(conversation.followupStage)
    : 0;

  if (stage < 0) {
    return false;
  }

  if (conversation.lastMessageFromMe === false) {
    return true;
  }

  if (conversation.lastMessageFromMe === true) {
    return false;
  }

  return isWaitingForCompanyReplyReason(conversation.followupDisabledReason);
}
