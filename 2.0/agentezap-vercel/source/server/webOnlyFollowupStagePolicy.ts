type ResolveWebOnlyFollowupTargetStageInput = {
  currentStage: unknown;
  maxSentStage: unknown;
  disabledReason?: unknown;
  resetReasons?: string[];
};

const DIACRITIC_CHAR_MAP: Record<string, string> = {
  á: "a",
  à: "a",
  â: "a",
  ã: "a",
  ä: "a",
  é: "e",
  è: "e",
  ê: "e",
  ë: "e",
  í: "i",
  ì: "i",
  î: "i",
  ï: "i",
  ó: "o",
  ò: "o",
  ô: "o",
  õ: "o",
  ö: "o",
  ú: "u",
  ù: "u",
  û: "u",
  ü: "u",
  ç: "c",
};

function parseStage(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function parseSentStage(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function normalizeFollowupReason(value: unknown): string {
  let normalized = "";
  let previousWasSpace = false;
  for (const rawChar of Array.from(String(value || "").trim().toLowerCase())) {
    const char = DIACRITIC_CHAR_MAP[rawChar] || rawChar;
    const code = char.charCodeAt(0);
    const isAlphaNumeric =
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57);
    if (isAlphaNumeric) {
      normalized += char;
      previousWasSpace = false;
      continue;
    }
    if (!previousWasSpace) {
      normalized += " ";
      previousWasSpace = true;
    }
  }
  return normalized.trim();
}

export function isWebOnlyFollowupClientReplyResetReason(disabledReason: unknown): boolean {
  const reason = normalizeFollowupReason(disabledReason);
  if (!reason) return false;

  if (
    reason.includes("cliente foi o ultimo") &&
    reason.includes("resposta da empresa")
  ) {
    return true;
  }

  if (
    reason.includes("cliente respondeu") &&
    reason.includes("aguard") &&
    reason.includes("empresa")
  ) {
    return true;
  }

  return false;
}

function hasResetReason(disabledReason: unknown, resetReasons: string[] | undefined): boolean {
  const reason = normalizeFollowupReason(disabledReason);
  if (!reason || !Array.isArray(resetReasons) || resetReasons.length === 0) {
    return isWebOnlyFollowupClientReplyResetReason(disabledReason);
  }
  return (
    isWebOnlyFollowupClientReplyResetReason(disabledReason) ||
    resetReasons.some((candidate) => reason === normalizeFollowupReason(candidate))
  );
}

export function resolveWebOnlyFollowupTargetStage(
  input: ResolveWebOnlyFollowupTargetStageInput,
): number {
  const currentStage = parseStage(input.currentStage);
  const maxSentStage = parseSentStage(input.maxSentStage);

  if (currentStage === 0 && hasResetReason(input.disabledReason, input.resetReasons)) {
    return 0;
  }

  return maxSentStage !== null ? maxSentStage + 1 : currentStage ?? 0;
}
