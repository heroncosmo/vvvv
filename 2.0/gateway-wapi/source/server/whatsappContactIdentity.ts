import { jidDecode } from "@whiskeysockets/baileys";

const STATUS_JID = "status@broadcast";

function cleanDigits(value: string) {
  let digits = "";
  for (const char of value) {
    if (char >= "0" && char <= "9") {
      digits += char;
    }
  }
  return digits;
}

function normalizeIdentityServer(server: string) {
  if (server === "c.us") {
    return "s.whatsapp.net";
  }

  return server;
}

export function normalizeWhatsAppIdentity(value: string | null | undefined) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  const normalizedValue = rawValue.toLowerCase();
  if (
    normalizedValue === STATUS_JID ||
    normalizedValue.endsWith("@broadcast") ||
    normalizedValue.endsWith("@newsletter") ||
    normalizedValue.endsWith("@bot")
  ) {
    return null;
  }

  const atIndex = rawValue.indexOf("@");
  if (atIndex < 0) {
    const digits = cleanDigits(rawValue);
    if (digits.length < 8 || digits.length > 15) {
      return null;
    }
    return `${digits}@s.whatsapp.net`;
  }

  const decoded = jidDecode(rawValue);
  if (!decoded?.user || !decoded.server) {
    return null;
  }

  const server = normalizeIdentityServer(String(decoded.server).trim().toLowerCase());
  if (!server) {
    return null;
  }

  return `${decoded.user}@${server}`;
}

export function isPersonalWhatsAppJid(value: string | null | undefined) {
  const normalized = normalizeWhatsAppIdentity(value);
  return normalized ? normalized.endsWith("@s.whatsapp.net") : false;
}

export function isLidWhatsAppJid(value: string | null | undefined) {
  const normalized = normalizeWhatsAppIdentity(value);
  return Boolean(
    normalized &&
      (normalized.endsWith("@lid") || normalized.endsWith("@hosted.lid")),
  );
}

export function isGroupWhatsAppJid(value: string | null | undefined) {
  const normalized = normalizeWhatsAppIdentity(value);
  return Boolean(normalized && normalized.endsWith("@g.us"));
}

export function extractIdentityPersonKey(value: string | null | undefined) {
  const normalized = normalizeWhatsAppIdentity(value);
  if (normalized) {
    const decoded = jidDecode(normalized);
    const user = String(decoded?.user || "").trim();
    const digits = cleanDigits(user);
    return digits || user.toLowerCase();
  }

  return cleanDigits(String(value || "").trim());
}

export function extractPhoneDigitsFromWhatsAppIdentity(
  value: string | null | undefined,
) {
  const normalized = normalizeWhatsAppIdentity(value);
  if (!normalized || !isPersonalWhatsAppJid(normalized)) {
    return "";
  }

  const decoded = jidDecode(normalized);
  return cleanDigits(String(decoded?.user || ""));
}

export function deriveStoredPhoneNumber(
  contactId: string | null | undefined,
  phoneNumber: string | null | undefined,
) {
  const normalizedPhone = normalizeWhatsAppIdentity(phoneNumber);
  if (normalizedPhone && isPersonalWhatsAppJid(normalizedPhone)) {
    return normalizedPhone;
  }

  const normalizedContactId = normalizeWhatsAppIdentity(contactId);
  if (normalizedContactId && isPersonalWhatsAppJid(normalizedContactId)) {
    return normalizedContactId;
  }

  return null;
}

