export const DEFAULT_PLAN_PRICE = 99;
export const OFFICIAL_WHATSAPP = "5517981679818";
export const DEFAULT_PUBLIC_APP_URL = "https://agentezap.online";
export const DEFAULT_REFERRAL_COMMISSION_AMOUNT = 50;

export function normalizeMoney(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function parseFlexibleMoney(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const source = String(value || "").trim();
  if (!source) return 0;

  let normalized = "";
  let decimalSeen = false;

  for (let index = source.length - 1; index >= 0; index -= 1) {
    const char = source[index];
    const isDigit = char >= "0" && char <= "9";
    if (isDigit) {
      normalized = char + normalized;
      continue;
    }

    if (!decimalSeen && (char === "," || char === ".")) {
      normalized = `.${normalized}`;
      decimalSeen = true;
    }
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatMoney(value: number) {
  return roundMoney(value).toFixed(2);
}

export function slugifyReferral(input: string) {
  const normalized = String(input || "")
    .normalize("NFD")
    .toLowerCase();
  let withoutMarks = "";
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    const isCombiningMark = code >= 0x0300 && code <= 0x036f;
    if (!isCombiningMark) {
      withoutMarks += char;
    }
  }
  const alnum = Array.from(withoutMarks)
    .map((char) => {
      const code = char.charCodeAt(0);
      const isAsciiLetter = code >= 97 && code <= 122;
      const isDigit = code >= 48 && code <= 57;
      return isAsciiLetter || isDigit ? char : "-";
    })
    .join("");
  let collapsed = "";
  let lastWasDash = false;
  for (const char of alnum) {
    if (char === "-") {
      if (collapsed.length === 0 || lastWasDash) {
        continue;
      }
      lastWasDash = true;
      collapsed += char;
      continue;
    }
    lastWasDash = false;
    collapsed += char;
  }

  while (collapsed.endsWith("-")) {
    collapsed = collapsed.slice(0, -1);
  }

  return collapsed || "cliente";
}

export function buildReferralCode(name: string, userId: string) {
  const base = slugifyReferral(name).slice(0, 18);
  let suffixSource = "";
  for (const char of String(userId || "").toLowerCase()) {
    if (char !== "-") {
      suffixSource += char;
    }
  }
  const suffix = suffixSource.slice(0, 8);
  return `${base}-${suffix}`;
}

export function buildReferralSlug(referralCode: string) {
  return `indique-${referralCode}`;
}

export function buildShareUrl(referralCode: string, baseUrl?: string | null) {
  let appBase = String(baseUrl || process.env.APP_BASE_URL || process.env.BASE_URL || DEFAULT_PUBLIC_APP_URL);
  while (appBase.endsWith("/")) {
    appBase = appBase.slice(0, -1);
  }
  return `${appBase}/?ref=${encodeURIComponent(referralCode)}`;
}

function replaceLocalhostShareUrl(text: string, shareUrl: string) {
  const localhostBase = "http://localhost:5000";
  if (!text.includes(localhostBase)) {
    return text;
  }

  const start = text.indexOf(localhostBase);
  if (start === -1) {
    return text;
  }

  let end = text.indexOf(" ", start);
  if (end === -1) {
    end = text.length;
  }

  const before = text.slice(0, start).trimEnd();
  const after = text.slice(end).trimStart();
  return [before, shareUrl, after].filter(Boolean).join(" ").trim();
}

function trimTrailingLinkPunctuation(text: string, shareUrl: string) {
  const linkIndex = text.indexOf(shareUrl);
  if (linkIndex === -1) {
    return text;
  }

  const punctuation = [".", ",", ";", ":", "!", "?"];
  const afterIndex = linkIndex + shareUrl.length;
  const nextChar = text[afterIndex];
  if (!nextChar || !punctuation.includes(nextChar)) {
    return text;
  }

  return `${text.slice(0, afterIndex)}${text.slice(afterIndex + 1)}`.trim();
}

export function finalizeReferralOutreachMessage(rawMessage: string, shareUrl: string) {
  let text = String(rawMessage || "").trim();
  text = replaceLocalhostShareUrl(text, shareUrl);
  text = trimTrailingLinkPunctuation(text, shareUrl);
  return text;
}

export function buildReferralOutreachFallbackMessage(input: {
  contactName?: string | null;
  recentMessages: Array<{ fromMe: boolean; text: string; timestamp?: string }>;
  shareUrl: string;
  baseMessage?: string | null;
}) {
  const sameDayContinuation = input.recentMessages.some((message) => {
    if (!message.timestamp) return false;
    const sentAt = new Date(message.timestamp);
    const now = new Date();
    return sentAt.getFullYear() === now.getFullYear() &&
      sentAt.getMonth() === now.getMonth() &&
      sentAt.getDate() === now.getDate();
  });

  const intro = sameDayContinuation ? "Seguindo o que te falei" : `Oi${input.contactName ? ` ${input.contactName}` : ""}`;
  const trimmedBaseMessage = String(input.baseMessage || "").trim();
  const defaultPitch =
    "estou usando uma inteligencia artificial no WhatsApp que me ajuda a responder mais rapido, organizar o CRM e fazer follow-up sem deixar cliente esfriar. Como funcionou bem para mim, achei que poderia ser util no seu negocio tambem.";
  const messageBody = trimmedBaseMessage || defaultPitch;
  const finalMessage = `${intro}, ${messageBody}\nLink: ${input.shareUrl}\nWhatsApp: ${OFFICIAL_WHATSAPP}`;
  return finalizeReferralOutreachMessage(finalMessage, input.shareUrl);
}
