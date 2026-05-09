export type NormalizeSignupPhoneOptions = {
  phone?: string | null | undefined;
  phoneCountryCode?: string | null | undefined;
  phoneNationalNumber?: string | null | undefined;
  defaultCallingCode?: string | null | undefined;
};

function asTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

export function extractPhoneDigits(value: unknown): string {
  const raw = String(value ?? "");
  let digits = "";

  for (const char of raw) {
    if (char >= "0" && char <= "9") {
      digits += char;
    }
  }

  return digits;
}

export function normalizeCallingCode(value: unknown, fallback = "55"): string {
  const digits = extractPhoneDigits(value);
  if (digits) return digits;
  return extractPhoneDigits(fallback);
}

function isValidCountryCallingCode(value: string): boolean {
  return value.length >= 1 && value.length <= 3 && !value.startsWith("0");
}

function isValidE164Digits(value: string): boolean {
  return value.length >= 8 && value.length <= 15 && !value.startsWith("0");
}

function parseInternationalPhone(rawValue: string): string | null {
  const raw = asTrimmedString(rawValue);
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const digits = extractPhoneDigits(raw.slice(1));
    return isValidE164Digits(digits) ? `+${digits}` : null;
  }

  if (raw.startsWith("00")) {
    const digits = extractPhoneDigits(raw.slice(2));
    return isValidE164Digits(digits) ? `+${digits}` : null;
  }

  return null;
}

export function buildPhoneFromParts(
  phoneCountryCode: unknown,
  phoneNationalNumber: unknown,
): string | null {
  const callingCode = normalizeCallingCode(phoneCountryCode, "");
  const nationalNumber = extractPhoneDigits(phoneNationalNumber);

  if (!isValidCountryCallingCode(callingCode) || !nationalNumber) {
    return null;
  }

  const combinedDigits = `${callingCode}${nationalNumber}`;
  if (!isValidE164Digits(combinedDigits)) {
    return null;
  }

  return `+${combinedDigits}`;
}

export function normalizeSignupPhone(options: NormalizeSignupPhoneOptions): string | null {
  const {
    phone,
    phoneCountryCode,
    phoneNationalNumber,
    defaultCallingCode = "55",
  } = options;

  const nationalRaw = asTrimmedString(phoneNationalNumber);
  if (nationalRaw) {
    const internationalFromNational = parseInternationalPhone(nationalRaw);
    if (internationalFromNational) {
      return internationalFromNational;
    }

    return buildPhoneFromParts(phoneCountryCode || defaultCallingCode, nationalRaw);
  }

  const phoneRaw = asTrimmedString(phone);
  if (!phoneRaw) return null;

  const internationalPhone = parseInternationalPhone(phoneRaw);
  if (internationalPhone) {
    return internationalPhone;
  }

  const digits = extractPhoneDigits(phoneRaw);
  if (!digits) {
    return null;
  }

  const explicitCallingCode = normalizeCallingCode(phoneCountryCode, "");
  if (explicitCallingCode) {
    return buildPhoneFromParts(explicitCallingCode, digits);
  }

  if (isValidE164Digits(digits) && digits.length >= 12) {
    return `+${digits}`;
  }

  return buildPhoneFromParts(defaultCallingCode, digits);
}

export function formatSignupPhoneForDisplay(value: string): string {
  const normalized = normalizeSignupPhone({ phone: value });
  if (!normalized) return value;

  const digits = extractPhoneDigits(normalized);

  if (digits.startsWith("55")) {
    const national = digits.slice(2);
    if (national.length === 10) {
      return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
    }
    if (national.length === 11) {
      return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
    }
  }

  return normalized;
}
