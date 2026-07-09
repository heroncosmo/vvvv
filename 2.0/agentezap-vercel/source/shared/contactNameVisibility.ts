function isDigitCharacter(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function hasAlphabeticCharacter(value: string): boolean {
  for (const char of value) {
    if (char.toLowerCase() !== char.toUpperCase()) {
      return true;
    }
  }

  return false;
}

export function extractMeaningfulContactName(value?: string | null): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  const lowered = trimmed.toLocaleLowerCase("pt-BR");
  if (
    lowered.includes("visitante") ||
    lowered.includes("visitor") ||
    lowered.includes("guest")
  ) {
    return "";
  }

  if (!hasAlphabeticCharacter(trimmed)) {
    let digitCount = 0;

    for (const char of trimmed) {
      if (isDigitCharacter(char)) {
        digitCount += 1;
      }
    }

    if (digitCount > 0) {
      return "";
    }
  }

  return trimmed;
}
