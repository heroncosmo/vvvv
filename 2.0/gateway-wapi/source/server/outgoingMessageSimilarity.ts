function stripDiacritics(value: string): string {
  const normalized = value.normalize("NFD");
  let result = "";

  for (const char of normalized) {
    const code = char.codePointAt(0) || 0;
    const isCombiningMark = code >= 0x0300 && code <= 0x036f;
    if (!isCombiningMark) {
      result += char;
    }
  }

  return result;
}

function isAsciiLetterOrDigit(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function tokenizeNormalizedMessage(value: string): string[] {
  const tokens: string[] = [];
  let current = "";

  for (const char of value) {
    if (char === " ") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function normalizeOutgoingMessageText(value: string | null | undefined): string {
  const base = stripDiacritics(String(value || "")).toLowerCase();
  let result = "";
  let lastWasSpace = true;

  for (const char of base) {
    const code = char.codePointAt(0) || 0;
    if (isAsciiLetterOrDigit(code)) {
      result += char;
      lastWasSpace = false;
      continue;
    }

    if (!lastWasSpace) {
      result += " ";
      lastWasSpace = true;
    }
  }

  return result.trim();
}

export function buildOutgoingMessageFingerprint(value: string | null | undefined): string {
  return normalizeOutgoingMessageText(value);
}

export function calculateOutgoingMessageSimilarity(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftFingerprint = buildOutgoingMessageFingerprint(left);
  const rightFingerprint = buildOutgoingMessageFingerprint(right);

  if (!leftFingerprint || !rightFingerprint) {
    return 0;
  }

  if (leftFingerprint === rightFingerprint) {
    return 1;
  }

  const shorter =
    leftFingerprint.length <= rightFingerprint.length ? leftFingerprint : rightFingerprint;
  const longer =
    leftFingerprint.length > rightFingerprint.length ? leftFingerprint : rightFingerprint;

  if (shorter.length >= 24 && longer.includes(shorter)) {
    return 0.96;
  }

  const leftTokens = tokenizeNormalizedMessage(leftFingerprint);
  const rightTokens = tokenizeNormalizedMessage(rightFingerprint);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const rightTokenSet = new Set(rightTokens);
  let matches = 0;
  for (const token of new Set(leftTokens)) {
    if (rightTokenSet.has(token)) {
      matches += 1;
    }
  }

  const overlap = matches / Math.max(new Set(leftTokens).size, rightTokenSet.size);

  let prefixMatches = 0;
  const prefixLimit = Math.min(leftTokens.length, rightTokens.length, 8);
  while (
    prefixMatches < prefixLimit &&
    leftTokens[prefixMatches] === rightTokens[prefixMatches]
  ) {
    prefixMatches += 1;
  }

  const prefixScore = prefixLimit > 0 ? prefixMatches / prefixLimit : 0;
  const lengthScore =
    Math.min(leftTokens.length, rightTokens.length) /
    Math.max(leftTokens.length, rightTokens.length);

  return Math.max(overlap * lengthScore, prefixScore * 0.9);
}

export function isOutgoingMessageNearDuplicate(
  left: string | null | undefined,
  right: string | null | undefined,
  threshold = 0.82,
): boolean {
  return calculateOutgoingMessageSimilarity(left, right) >= threshold;
}
