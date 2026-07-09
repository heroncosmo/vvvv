function digitsOnly(value: unknown): string {
  return String(value ?? "")
    .split(":")[0]
    .replace(/\D/g, "");
}

export function normalizeBrazilWhatsAppPhone(value: unknown): string | null {
  const digits = digitsOnly(value);
  if (!digits) return null;

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits.length >= 8 ? digits : null;
}

export function buildBrazilWhatsAppPhoneVariants(value: unknown): string[] {
  const normalized = normalizeBrazilWhatsAppPhone(value);
  if (!normalized) return [];

  const variants = new Set<string>();
  variants.add(normalized);

  const nationalNumber = normalized.startsWith("55") ? normalized.slice(2) : normalized;
  if (nationalNumber) {
    variants.add(nationalNumber);
  }

  if (nationalNumber.length === 11 && nationalNumber[2] === "9") {
    const withoutMobileNine = `${nationalNumber.slice(0, 2)}${nationalNumber.slice(3)}`;
    variants.add(withoutMobileNine);
    variants.add(`55${withoutMobileNine}`);
  }

  if (nationalNumber.length === 10) {
    const withMobileNine = `${nationalNumber.slice(0, 2)}9${nationalNumber.slice(2)}`;
    variants.add(withMobileNine);
    variants.add(`55${withMobileNine}`);
  }

  return Array.from(variants).filter(Boolean);
}

export function buildWhatsAppJidFromPhone(
  value: unknown,
  suffix = "s.whatsapp.net",
): string | null {
  const normalized = normalizeBrazilWhatsAppPhone(value);
  if (!normalized) return null;
  return `${normalized}@${suffix}`;
}
