function normalizePaymentGuardText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractFinancialCredentialTokens(value: unknown): string[] {
  const text = String(value || "");
  const tokens = new Set<string>();
  const phoneLikeMatches = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  for (const match of phoneLikeMatches) {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 8) tokens.add(digits);
  }

  const emailMatches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  for (const match of emailMatches) {
    tokens.add(match.toLowerCase());
  }

  const evpMatches = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) || [];
  for (const match of evpMatches) {
    tokens.add(match.toLowerCase());
  }

  return Array.from(tokens);
}

function hasFinancialCredentialLanguage(value: unknown): boolean {
  const normalized = normalizePaymentGuardText(value);
  return (
    /\bchave\s+pix\b/.test(normalized) ||
    /\bpix\s*(?:copia\s+e\s+cola|copia\s+cola|:|-)/.test(normalized) ||
    /\bqr\s*code\s*(?:do\s*)?pix\b/.test(normalized) ||
    /\bdados\s+(?:do|para)\s+pagamento\b/.test(normalized) ||
    /\b(?:conta\s+bancaria|agencia|destinatario)\b/.test(normalized)
  );
}

function looksLikePaymentCredentialResponse(value: unknown): boolean {
  const text = String(value || "");
  if (!text.trim()) return false;

  const normalized = normalizePaymentGuardText(text);
  const credentialTokens = extractFinancialCredentialTokens(text);
  const hasCredentialPhrase =
    hasFinancialCredentialLanguage(text) ||
    /\bsegue\s+(?:a\s+)?chave\b/.test(normalized) ||
    /\b(?:chave|destinatario)\s*:/.test(normalized) ||
    (/\bpix\b/.test(normalized) &&
      (credentialTokens.length > 0 || /\b(?:nome|telefone|cpf|cnpj|recebedor|titular)\b/.test(normalized)));
  if (!hasCredentialPhrase) return false;

  return credentialTokens.length > 0 ||
    /\b(?:cpf|cnpj|conta|agencia|banco|instituicao)\b/.test(normalized);
}

function buildTrustedFinancialReferenceText(params: {
  trustedReferenceText?: unknown;
  conversationHistory?: Array<{ fromMe?: boolean; isFromAgent?: boolean; text?: string | null; mediaCaption?: string | null }>;
}): string {
  const manualCompanyText = (params.conversationHistory || [])
    .filter((message) => message.fromMe === true && message.isFromAgent !== true)
    .slice(-8)
    .map((message) => message.text || message.mediaCaption || "")
    .filter(Boolean)
    .join("\n");

  return [
    String(params.trustedReferenceText || ""),
    manualCompanyText,
  ].filter(Boolean).join("\n");
}

function hasTrustedFinancialCredentialSource(params: {
  responseText: string;
  trustedReferenceText?: unknown;
  conversationHistory?: Array<{ fromMe?: boolean; isFromAgent?: boolean; text?: string | null; mediaCaption?: string | null }>;
}): boolean {
  const trustedText = buildTrustedFinancialReferenceText({
    trustedReferenceText: params.trustedReferenceText,
    conversationHistory: params.conversationHistory,
  });
  if (!trustedText.trim()) return false;
  if (!hasFinancialCredentialLanguage(trustedText)) return false;

  const responseTokens = extractFinancialCredentialTokens(params.responseText);
  if (responseTokens.length === 0) return false;

  const trustedLower = trustedText.toLowerCase();
  const trustedDigits = trustedText.replace(/\D/g, "");

  return responseTokens.every((token) => {
    if (/^\d+$/.test(token)) {
      return trustedDigits.includes(token);
    }
    return trustedLower.includes(token.toLowerCase());
  });
}

function extractSupportContactFromPrompt(value: unknown): string | null {
  const text = String(value || "").replace(/\r\n/g, "\n");
  const supportMatch = text.match(
    /(?:suporte|atendimento|humano|pessoa|falar\s+com).{0,120}?((?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4})/i,
  );
  if (supportMatch?.[1]) return supportMatch[1].trim();

  const phoneMatch = text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  return phoneMatch?.[0]?.trim() || null;
}

export function enforceTrustedPaymentCredentialReply(params: {
  text: string;
  prompt?: unknown;
  trustedReferenceText?: unknown;
  conversationHistory?: Array<{ fromMe?: boolean; isFromAgent?: boolean; text?: string | null; mediaCaption?: string | null }>;
}): { text: string; applied: boolean; reason: string | null } {
  const text = String(params.text || "").trim();
  if (!looksLikePaymentCredentialResponse(text)) {
    return { text: params.text, applied: false, reason: null };
  }

  if (hasTrustedFinancialCredentialSource({
    responseText: text,
    trustedReferenceText: params.trustedReferenceText,
    conversationHistory: params.conversationHistory,
  })) {
    return { text: params.text, applied: false, reason: null };
  }

  const supportContact = extractSupportContactFromPrompt(params.prompt || params.trustedReferenceText);
  const fallback = supportContact
    ? `Para pagamento ou chave Pix, confirma direto com o suporte: ${supportContact}. Assim você recebe a informação correta.`
    : "Para pagamento ou chave Pix, eu preciso confirmar com o suporte antes de passar qualquer dado. Vou validar e te aviso por aqui.";

  return {
    text: fallback,
    applied: true,
    reason: "untrusted_payment_credential",
  };
}
