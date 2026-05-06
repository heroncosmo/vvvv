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
  if (!candidate || candidate.length < 8) return;
  target.add(candidate);
}

function removeBrazilMobileNine(number: string): string | null {
  if (number.length !== 11 || number[2] !== "9") return null;
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

  for (const size of [11, 10, 9, 8]) {
    if (digits.length >= size) {
      addKey(keys, digits.slice(-size));
    }
  }

  const last11 = digits.length >= 11 ? digits.slice(-11) : "";
  const last10 = digits.length >= 10 ? digits.slice(-10) : "";

  addKey(keys, removeBrazilMobileNine(last11));
  addKey(keys, addBrazilMobileNine(last10));

  if (last11.length === 11) {
    addKey(keys, last11.slice(2));
    addKey(keys, last11.slice(-8));

    const withoutMobileNine = removeBrazilMobileNine(last11);
    if (withoutMobileNine) {
      addKey(keys, withoutMobileNine);
      addKey(keys, withoutMobileNine.slice(2));
      addKey(keys, withoutMobileNine.slice(-8));
    }
  }

  if (last10.length === 10) {
    addKey(keys, last10.slice(2));
    addKey(keys, last10.slice(-8));

    const withMobileNine = addBrazilMobileNine(last10);
    if (withMobileNine) {
      addKey(keys, withMobileNine);
      addKey(keys, withMobileNine.slice(2));
      addKey(keys, withMobileNine.slice(-8));
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
