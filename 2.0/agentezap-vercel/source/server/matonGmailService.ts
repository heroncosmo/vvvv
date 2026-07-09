const MATON_HTTP_TIMEOUT_MS = 12_000;
const MATON_MAX_EMAIL_BODY_CHARS = 12_000;

export type MatonConnectionSummary = {
  connectionId: string;
  status: string;
  app: string;
  method: string | null;
  url: string | null;
  email: string | null;
  displayName: string | null;
  metadata: Record<string, unknown>;
};

export type MatonEmailLead = {
  messageId: string;
  threadId: string | null;
  subject: string | null;
  from: string | null;
  receivedAt: Date | null;
  snippet: string | null;
  bodyText: string;
  extracted: {
    portalSource: string | null;
    leadChannel: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    interestSummary: string | null;
    listingCode: string | null;
    listingTitle: string | null;
    city: string | null;
    neighborhood: string | null;
    price: string | null;
    listingUrl: string | null;
    transactionType: string | null;
  };
};

type GmailListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
};

type GmailFullMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: any;
};

type MatonRequestOptions = {
  apiKey: string;
  connectionId?: string | null;
};

type MatonLeadExtraction = MatonEmailLead["extracted"];

function decodeBase64Url(value: string | null | undefined): string {
  if (!value) return "";
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4);
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi, (_match, doubleQuoted, singleQuoted, bare) => {
      const href = decodeUriComponentSafe(decodeHtmlText(String(doubleQuoted || singleQuoted || bare || "")));
      if (!href.trim()) return " ";
      return ` ${href} `;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/tel:/gi, " telefone: ")
    .replace(/mailto:/gi, " email: ")
    .replace(/whatsapp:/gi, " whatsapp: ")
    .replace(/https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s]+/gi, (match) => ` ${decodeUriComponentSafe(match)} `)
    .replace(/%2B/gi, "+")
    .replace(/%20/gi, " ")
    .replace(/%28/gi, "(")
    .replace(/%29/gi, ")")
    .replace(/%2D/gi, "-")
    .replace(/%2F/gi, "/")
    .replace(/%3A/gi, ":")
    .replace(/%40/gi, "@")
    .replace(/%2E/gi, ".")
    .replace(/%5F/gi, "_")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractBodyFromPayload(payload: any): string {
  const candidates: string[] = [];

  const visitPart = (part: any) => {
    if (!part || typeof part !== "object") return;

    const mimeType = String(part.mimeType || "").toLowerCase();
    const bodyData = decodeBase64Url(part.body?.data);

    if (mimeType === "text/plain" && bodyData.trim()) {
      candidates.push(bodyData.trim());
    }

    if (mimeType === "text/html" && bodyData.trim()) {
      candidates.push(stripHtml(bodyData));
    }

    const subParts = Array.isArray(part.parts) ? part.parts : [];
    for (const child of subParts) {
      visitPart(child);
    }
  };

  visitPart(payload);

  const merged = candidates
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return merged;
}

function getHeader(payload: any, name: string): string | null {
  const headers = Array.isArray(payload?.headers) ? payload.headers : [];
  const match = headers.find((header: any) => String(header?.name || "").toLowerCase() === name.toLowerCase());
  const value = String(match?.value || "").trim();
  return value || null;
}

async function matonFetchJson<T>(url: string, options: MatonRequestOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MATON_HTTP_TIMEOUT_MS);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...(options.connectionId ? { "Maton-Connection": options.connectionId } : {}),
    },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Maton HTTP ${response.status}: ${errorText.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

export async function listMatonGoogleMailConnections(apiKey: string): Promise<MatonConnectionSummary[]> {
  const response = await matonFetchJson<{ connections?: any[] }>(
    "https://ctrl.maton.ai/connections?app=google-mail&status=ACTIVE",
    { apiKey },
  );

  return (response.connections || []).map((connection) => ({
    connectionId: String(connection.connection_id || ""),
    status: String(connection.status || ""),
    app: String(connection.app || ""),
    method: connection.method ? String(connection.method) : null,
    url: connection.url ? String(connection.url) : null,
    email:
      typeof connection?.metadata?.email === "string" && connection.metadata.email.trim()
        ? connection.metadata.email.trim().toLowerCase()
        : null,
    displayName:
      typeof connection?.metadata?.name === "string" && connection.metadata.name.trim()
        ? connection.metadata.name.trim()
        : null,
    metadata: connection?.metadata && typeof connection.metadata === "object" ? connection.metadata : {},
  }));
}

export function findMatonConnection(
  connections: MatonConnectionSummary[],
  selectedConnectionId: string | null | undefined,
  selectedEmail: string | null | undefined,
): MatonConnectionSummary | null {
  if (selectedConnectionId) {
    const byId = connections.find((connection) => connection.connectionId === selectedConnectionId);
    if (byId) return byId;
  }

  const normalizedEmail = String(selectedEmail || "").trim().toLowerCase();
  if (normalizedEmail) {
    const byEmail = connections.find((connection) => connection.email === normalizedEmail);
    if (byEmail) return byEmail;
  }

  return connections[0] ?? null;
}

function truncateEmailBodyForExtraction(bodyText: string): string {
  if (bodyText.length <= MATON_MAX_EMAIL_BODY_CHARS) {
    return bodyText;
  }

  return `${bodyText.slice(0, MATON_MAX_EMAIL_BODY_CHARS)}\n\n[conteudo truncado para extracao]`;
}

function normalizeExtractedText(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value)
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function inferPortalSourceFromText(text: string): string | null {
  const normalized = text.toLowerCase();
  if (normalized.includes("vivareal") || normalized.includes("viva real")) return "Viva Real";
  if (normalized.includes("zapimoveis") || normalized.includes("zap imoveis") || normalized.includes("zap imóveis")) {
    return "ZAP Imoveis";
  }
  if (normalized.includes("olx")) return "OLX";
  if (normalized.includes("grupo olx")) return "Grupo OLX";
  return null;
}

function inferLeadChannelFromText(text: string): string | null {
  const normalized = text.toLowerCase();
  if (normalized.includes("whatsapp")) return "WhatsApp";
  if (normalized.includes("telefone") || normalized.includes("ligacao") || normalized.includes("ligação")) {
    return "Telefone";
  }
  if (normalized.includes("chat")) return "Chat";
  if (normalized.includes("email") || normalized.includes("e-mail")) return "Email";
  if (normalized.includes("formulario") || normalized.includes("formulário")) return "Formulario";
  return null;
}

function findFirstRegexGroup(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function cleanContactNameCandidate(value: unknown): string | null {
  const cleaned = normalizeExtractedText(value)
    ?.replace(/^[\s"'`.,;:!?-]+|[\s"'`.,;:!?-]+$/g, "")
    .trim();
  if (!cleaned) return null;

  const normalized = cleaned
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (cleaned.length > 80) return null;
  if (/@|https?:\/\//i.test(cleaned)) return null;
  if (/\d{4,}/.test(cleaned)) return null;
  if (/\b(utm|novolead|feedback|grupozap|zapmais|gestao pro|aplicativo|campanha)\b/.test(normalized)) return null;
  if (/\b(disponivel|palma da mao|clique|acesse|avaliar|experiencia|whatsapp|cliente|imovel|informacao|informacoes|contato)\b/.test(normalized)) {
    return null;
  }
  if (/[a-z]{2,}_[a-z0-9_]{4,}/i.test(cleaned)) return null;

  return cleaned;
}

function extractLeadNameFromEmailText(searchable: string): string | null {
  return cleanContactNameCandidate(
    findFirstRegexGroup(searchable, [
      /(?:via\s+WhatsApp|sobre o im[o\u00f3]vel)\s+([A-Z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff.' -]{1,80}?)\s+se interessou pelo im[o\u00f3]vel/i,
      /(?:^|\n|\s)([A-Z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff.' -]{1,80}?)\s+se interessou pelo im[o\u00f3]vel/i,
      /(?:^|\n|\s)([A-Z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff.' -]{1,80}?)\s+gostaria de mais informa[c\u00e7][o\u00f5]es/i,
      /(?:nome|cliente|lead)\s*[:\-]\s*([^\n\r]+)/i,
    ]),
  );
}

function extractListingDetailsFromSubject(subject: string | null | undefined): Partial<MatonLeadExtraction> {
  const subjectText = normalizeExtractedText(subject);
  if (!subjectText) return {};

  const listingCode = findFirstRegexGroup(subjectText, [
    /(?:C[o\u00f3]D\.?|COD\.?|c[o\u00f3]digo|cod\.?|ref\.?|refer[e\u00ea]ncia|id do im[o\u00f3]vel)\s*[:#.-]?\s*([A-Z]{1,5}\d{2,}(?:-[A-Z0-9]+)?)/i,
    /\b([A-Z]{1,5}\d{4,}(?:-[A-Z0-9]+)?)\b/i,
  ]);

  const listingTitle = normalizeExtractedText(
    findFirstRegexGroup(subjectText, [
      /(?:im[o\u00f3]vel|an[u\u00fa]ncio)\s+em\s+(.+?)(?:\s+C[o\u00f3]D\.?\s*[A-Z0-9-]+|\s+COD\.?\s*[A-Z0-9-]+|$)/i,
    ]),
  );

  const locationMatch = listingTitle?.match(/\s-\s([^,]+),\s*([^,-]+)(?:\s-\s[^-]+)?$/);
  const transactionType = normalizeExtractedText(
    findFirstRegexGroup(subjectText, [/^\s*(Venda|Aluguel|Loca[c\u00e7][a\u00e3]o|Temporada)\s+-/i]),
  );

  return {
    listingCode,
    listingTitle,
    neighborhood: normalizeExtractedText(locationMatch?.[1]),
    city: normalizeExtractedText(locationMatch?.[2]),
    transactionType,
  };
}

function repairExtractedLead(
  email: {
    subject: string | null;
    from: string | null;
    snippet: string | null;
    bodyText: string;
  },
  extracted: MatonLeadExtraction,
): MatonLeadExtraction {
  const searchable = [email.subject || "", email.snippet || "", email.bodyText || ""].join("\n\n");
  const subjectDetails = extractListingDetailsFromSubject(email.subject);

  return {
    ...extracted,
    contactName: cleanContactNameCandidate(extracted.contactName) ?? extractLeadNameFromEmailText(searchable),
    listingCode: normalizeExtractedText(extracted.listingCode) ?? subjectDetails.listingCode ?? null,
    listingTitle: normalizeExtractedText(extracted.listingTitle) ?? subjectDetails.listingTitle ?? null,
    city: normalizeExtractedText(extracted.city) ?? subjectDetails.city ?? null,
    neighborhood: normalizeExtractedText(extracted.neighborhood) ?? subjectDetails.neighborhood ?? null,
    transactionType: normalizeExtractedText(extracted.transactionType) ?? subjectDetails.transactionType ?? null,
    portalSource: normalizeExtractedText(extracted.portalSource) ?? inferPortalSourceFromText(searchable),
    leadChannel: normalizeExtractedText(extracted.leadChannel) ?? inferLeadChannelFromText(searchable),
    contactEmail: normalizeExtractedText(extracted.contactEmail)?.toLowerCase() ?? extractFirstEmail(searchable),
    contactPhone: normalizeExtractedText(extracted.contactPhone) ?? extractFirstPhone(searchable),
    interestSummary: normalizeExtractedText(extracted.interestSummary) ?? buildInterestSummary(email),
    price: normalizeExtractedText(extracted.price),
    listingUrl: normalizeExtractedText(extracted.listingUrl),
  };
}

function extractFirstEmail(text: string): string | null {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const filtered = matches
    .map((value) => value.toLowerCase())
    .filter(
      (value) =>
        !value.includes("zapimoveis.com.br") &&
        !value.includes("olxbrasil.com.br") &&
        !value.includes("olxbr.com") &&
        !value.includes("vivareal.com.br"),
    );

  return filtered[0] ?? matches[0]?.toLowerCase() ?? null;
}

function extractFirstPhone(text: string): string | null {
  const normalizedText = decodeUriComponentSafe(String(text || ""))
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/(?:tel|whatsapp):/gi, " ");
  const matches = normalizedText.match(/(?:\+?55\D{0,4})?(?:\(?\d{2}\)?\D{0,4})?(?:9?\d{4})\D{0,4}\d{4}/g) || [];
  for (const match of matches) {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 13) {
      return digits;
    }
  }

  return null;
}

function buildInterestSummary(email: {
  subject: string | null;
  snippet: string | null;
  bodyText: string;
}): string | null {
  const summary = (email.snippet || email.subject || email.bodyText || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!summary) {
    return null;
  }

  return summary.slice(0, 220);
}

function extractLeadHeuristically(email: {
  subject: string | null;
  from: string | null;
  snippet: string | null;
  bodyText: string;
}): MatonLeadExtraction {
  const bodyText = email.bodyText || "";
  const searchable = [email.subject || "", email.snippet || "", bodyText].join("\n\n");

  return {
    portalSource: inferPortalSourceFromText(searchable),
    leadChannel: inferLeadChannelFromText(searchable),
    contactName: findFirstRegexGroup(searchable, [
      /(?:nome|cliente|lead)\s*[:\-]\s*([^\n\r]+)/i,
    ]),
    contactEmail: extractFirstEmail(searchable),
    contactPhone: extractFirstPhone(searchable),
    interestSummary: buildInterestSummary(email),
    listingCode: findFirstRegexGroup(searchable, [
      /(?:codigo|c[oó]digo|cod\.?|ref\.?|refer[eê]ncia|id do im[oó]vel)\s*[:#-]?\s*([A-Z0-9-]{4,})/i,
    ]),
    listingTitle: findFirstRegexGroup(searchable, [
      /(?:im[oó]vel|an[uú]ncio|titulo)\s*[:\-]\s*([^\n\r]+)/i,
    ]),
    city: findFirstRegexGroup(searchable, [
      /cidade\s*[:\-]\s*([^\n\r]+)/i,
    ]),
    neighborhood: findFirstRegexGroup(searchable, [
      /bairro\s*[:\-]\s*([^\n\r]+)/i,
    ]),
    price: findFirstRegexGroup(searchable, [
      /(R\$\s?[\d\.\,]+)/i,
    ]),
    listingUrl: findFirstRegexGroup(searchable, [
      /(https?:\/\/[^\s"'<>]+)/i,
    ]),
    transactionType: findFirstRegexGroup(searchable, [
      /(?:transa[cç][aã]o|tipo)\s*[:\-]\s*(venda|aluguel|temporada)/i,
    ]),
  };
}

async function extractLeadWithLLM(email: {
  subject: string | null;
  from: string | null;
  snippet: string | null;
  bodyText: string;
}): Promise<MatonLeadExtraction> {
  console.warn(`[Maton] Extracao LLM legada desativada; usando heuristica local (subject="${email.subject || ""}")`);
  return repairExtractedLead(email, extractLeadHeuristically(email));
}

export async function fetchMatonLeadEmails(params: {
  apiKey: string;
  connectionId?: string | null;
  senderFilter: string;
  maxResults?: number;
  newerThanDays?: number;
}): Promise<MatonEmailLead[]> {
  const connections = await listMatonGoogleMailConnections(params.apiKey);
  if (params.connectionId && !connections.some((connection) => connection.connectionId === params.connectionId)) {
    throw new Error("A conexao Google Mail selecionada nao esta mais ativa na Maton");
  }
  const connection = findMatonConnection(connections, params.connectionId, null);
  if (!connection) {
    throw new Error("Nenhuma conexao Google Mail ativa encontrada na Maton");
  }

  const senderFilter = params.senderFilter.trim() || "comunica.zapimoveis.com.br";
  const newerThanDays = Math.max(1, params.newerThanDays || 30);
  const maxResults = Math.max(1, Math.min(20, params.maxResults || 10));
  const query = encodeURIComponent(`in:inbox from:${senderFilter} newer_than:${newerThanDays}d`);
  const listUrl = `https://gateway.maton.ai/google-mail/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${query}`;

  const list = await matonFetchJson<GmailListResponse>(listUrl, {
    apiKey: params.apiKey,
    connectionId: connection.connectionId,
  });
  const messages = list.messages || [];
  const results: MatonEmailLead[] = [];

  for (const messageRef of messages) {
    try {
      const full = await matonFetchJson<GmailFullMessage>(
        `https://gateway.maton.ai/google-mail/gmail/v1/users/me/messages/${messageRef.id}?format=full`,
        {
          apiKey: params.apiKey,
          connectionId: connection.connectionId,
        },
      );

      const subject = getHeader(full.payload, "Subject");
      const from = getHeader(full.payload, "From");
      const bodyText = extractBodyFromPayload(full.payload) || String(full.snippet || "");
      const extracted = await extractLeadWithLLM({
        subject,
        from,
        snippet: full.snippet || null,
        bodyText,
      });

      results.push({
        messageId: full.id,
        threadId: full.threadId || null,
        subject,
        from,
        receivedAt: full.internalDate ? new Date(Number(full.internalDate)) : null,
        snippet: full.snippet || null,
        bodyText,
        extracted,
      });
    } catch (error) {
      console.error(`[Maton] Falha ao processar email ${messageRef.id}. Email ignorado neste ciclo.`, error);
    }
  }

  return results;
}

export const __matonGmailServiceTestInternals = {
  extractBodyFromPayload,
  extractFirstEmail,
  extractFirstPhone,
  repairExtractedLead,
  stripHtml,
};
