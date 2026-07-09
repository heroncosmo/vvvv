import { joinBubbleMessages, parseExplicitBubbleMessages } from "./whatsappMessageSplit";

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

function shouldPrefixWww(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (!lower || lower.startsWith("www.")) return false;
  if (lower === "localhost") return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(lower)) return false;

  const labels = lower.split(".").filter(Boolean);
  return labels.length === 2;
}

function normalizeUrlForCustomer(rawUrl: string): string {
  let trailing = "";
  let candidate = rawUrl;

  while (/[.,;:!?]$/.test(candidate)) {
    trailing = candidate.slice(-1) + trailing;
    candidate = candidate.slice(0, -1);
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    if (shouldPrefixWww(parsed.hostname)) {
      parsed.hostname = `www.${parsed.hostname}`;
    }
    return parsed.toString() + trailing;
  } catch {
    return rawUrl;
  }
}

export function normalizeOutboundTextForCustomer(text: string): string {
  const explicitBubbles = parseExplicitBubbleMessages(text || "");
  const safeText = explicitBubbles.hasExplicitBubbles
    ? joinBubbleMessages(explicitBubbles.parts)
    : text;

  if (!safeText || !URL_PATTERN.test(safeText)) {
    URL_PATTERN.lastIndex = 0;
    return safeText;
  }

  URL_PATTERN.lastIndex = 0;
  return safeText.replace(URL_PATTERN, (url) => normalizeUrlForCustomer(url));
}

export function buildPlainTextWhatsAppPayload(text: string) {
  return {
    text: normalizeOutboundTextForCustomer(text),
    linkPreview: false,
    detectLinks: false,
  };
}

export function buildGatewayTextSendBody(body: Record<string, unknown>) {
  const text = typeof body.text === "string" ? body.text : "";
  return {
    ...body,
    text: normalizeOutboundTextForCustomer(text),
    linkPreview: false,
    preview: false,
    detectLinks: false,
  };
}
