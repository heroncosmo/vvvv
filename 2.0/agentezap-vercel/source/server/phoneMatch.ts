function extractDigits(value: string | null | undefined): string {
  const source = String(value || "");
  let digits = "";

  for (const char of source) {
    if (char >= "0" && char <= "9") {
      digits += char;
    }
  }

  return digits;
}

function addKey(target: Set<string>, candidate: string | null | undefined): void {
  if (!candidate) return;
  if (candidate.length < 8) return;
  target.add(candidate);
}

function removeBrazilMobileNine(number: string): string | null {
  if (number.length !== 11) return null;
  if (number[2] !== "9") return null;
  return `${number.slice(0, 2)}${number.slice(3)}`;
}

function addBrazilMobileNine(number: string): string | null {
  if (number.length !== 10) return null;
  return `${number.slice(0, 2)}9${number.slice(2)}`;
}

export function normalizePhoneForComparison(phoneNumber: string | null | undefined): string[] {
  const digits = extractDigits(phoneNumber);
  if (!digits) return [];

  const keys = new Set<string>();
  addKey(keys, digits);

  const nationalCandidates = new Set<string>();
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    nationalCandidates.add(digits.slice(2));
  } else if (digits.length === 10 || digits.length === 11) {
    nationalCandidates.add(digits);
  } else if (digits.length > 13) {
    const last13 = digits.slice(-13);
    const last12 = digits.slice(-12);
    if (last13.startsWith("55")) nationalCandidates.add(last13.slice(2));
    if (last12.startsWith("55")) nationalCandidates.add(last12.slice(2));
  }

  for (const national of nationalCandidates) {
    addKey(keys, national);
    addKey(keys, `55${national}`);

    const withoutMobileNine = removeBrazilMobileNine(national);
    if (withoutMobileNine) {
      addKey(keys, withoutMobileNine);
      addKey(keys, `55${withoutMobileNine}`);
    }

    const withMobileNine = addBrazilMobileNine(national);
    if (withMobileNine) {
      addKey(keys, withMobileNine);
      addKey(keys, `55${withMobileNine}`);
    }
  }

  return [...keys];
}

export function phoneNumbersMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftKeys = normalizePhoneForComparison(left);
  const rightKeys = new Set(normalizePhoneForComparison(right));

  return leftKeys.some((key) => rightKeys.has(key));
}

export function normalizePhoneToDigits(phoneNumber: string | null | undefined): string {
  return extractDigits(phoneNumber);
}
