import {
  formatSignupPhoneForDisplay,
  normalizeSignupPhone,
  type NormalizeSignupPhoneOptions,
} from "@shared/phone";

export function validateAndFormatPhone(
  phone: string,
  options?: Omit<NormalizeSignupPhoneOptions, "phone">,
): string | null {
  return normalizeSignupPhone({
    phone,
    ...options,
  });
}

export function isValidPhone(phone: string): boolean {
  return validateAndFormatPhone(phone) !== null;
}

export function formatPhoneForDisplay(phone: string): string {
  return formatSignupPhoneForDisplay(phone);
}
