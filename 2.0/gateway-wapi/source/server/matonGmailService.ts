import { getLLMClient } from "./llm";

const MATON_HTTP_TIMEOUT_MS = 12_000;
const MATON_LLM_TIMEOUT_MS = 15_000;
const MATON_LLM_RETRY_DELAY_MS = 750;
const MATON_LLM_MAX_ATTEMPTS = 2;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeBase64Url(value: string | null | undefined): string {
  if (!value) return "";
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = padded + "=".repeat((4 - (padded.length % 4 || 4)) % 4);
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
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

function normalizeExtractedLead(parsed: Record<string, unknown>): MatonLeadExtraction {
  return {
    portalSource: typeof parsed.portalSource === "string" ? parsed.portalSource : null,
    leadChannel: typeof parsed.leadChannel === "string" ? parsed.leadChannel : null,
    contactName: typeof parsed.contactName === "string" ? parsed.contactName : null,
    contactEmail: typeof parsed.contactEmail === "string" ? parsed.contactEmail.toLowerCase() : null,
    contactPhone: typeof parsed.contactPhone === "string" ? parsed.contactPhone : null,
    interestSummary: typeof parsed.interestSummary === "string" ? parsed.interestSummary : null,
    listingCode: typeof parsed.listingCode === "string" ? parsed.listingCode : null,
    listingTitle: typeof parsed.listingTitle === "string" ? parsed.listingTitle : null,
    city: typeof parsed.city === "string" ? parsed.city : null,
    neighborhood: typeof parsed.neighborhood === "string" ? parsed.neighborhood : null,
    price: typeof parsed.price === "string" ? parsed.price : null,
    listingUrl: typeof parsed.listingUrl === "string" ? parsed.listingUrl : null,
    transactionType: typeof parsed.transactionType === "string" ? parsed.transactionType : null,
  };
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

function extractFirstEmail(text: string): string | null {
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const filtered = matches
    .map((value) => value.toLowerCase())
    .filter((value) => !value.includes("zapimoveis.com.br") && !value.includes("olxbrasil.com.br"));

  return filtered[0] ?? matches[0]?.toLowerCase() ?? null;
}

function extractFirstPhone(text: string): string | null {
  const matches = text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-\s]?\d{4}/g) || [];
  for (const match of matches) {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 10) {
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

async function extractLeadWithLLMOnce(email: {
  subject: string | null;
  from: string | null;
  snippet: string | null;
  bodyText: string;
}): Promise<MatonLeadExtraction> {
  const client = await getLLMClient();
  const response = await Promise.race([
    client.chat.complete({
      model: "mistral-small-latest",
      temperature: 0.1,
      maxTokens: 600,
      messages: [
        {
          role: "system",
          content: `Voce extrai dados de leads imobiliarios vindos por e-mail do Grupo OLX/ZAP/Viva Real.

Retorne APENAS um JSON puro com este formato:
{
  "portalSource": "ZAP Imoveis|Viva Real|OLX|Grupo OLX|null",
  "leadChannel": "WhatsApp|Formulario|Chat|Telefone|Email|null",
  "contactName": "nome do lead",
  "contactEmail": "email do lead",
  "contactPhone": "telefone do lead com DDD",
  "interestSummary": "resumo curto do interesse",
  "listingCode": "codigo do imovel",
  "listingTitle": "titulo do imovel",
  "city": "cidade do imovel",
  "neighborhood": "bairro do imovel",
  "price": "preco se estiver no email",
  "listingUrl": "url do anuncio",
  "transactionType": "venda|aluguel|temporada|null"
}

Regras:
- Use null quando um campo nao estiver claro.
- Nao invente nenhum dado.
- Se o email disser que o cliente entrou em contato via WhatsApp, leadChannel deve ser WhatsApp.
- Se houver codigo do imovel, preserve como aparece no email.
- O resumo deve ser curto e fiel ao email.
- Responda somente JSON.`,
        },
        {
          role: "user",
          content: [
            `ASSUNTO: ${email.subject || ""}`,
            `REMETENTE: ${email.from || ""}`,
            `SNIPPET: ${email.snippet || ""}`,
            `CORPO:\n${truncateEmailBodyForExtraction(email.bodyText || "")}`,
          ].join("\n\n"),
        },
      ],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("MATON_EMAIL_EXTRACT_TIMEOUT")), MATON_LLM_TIMEOUT_MS),
    ),
  ]);

  const raw = response.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw : String(raw || "");
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  return normalizeExtractedLead(parsed);
}

async function extractLeadWithLLM(email: {
  subject: string | null;
  from: string | null;
  snippet: string | null;
  bodyText: string;
}): Promise<MatonLeadExtraction> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MATON_LLM_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await extractLeadWithLLMOnce(email);
    } catch (error) {
      lastError = error;
      if (attempt < MATON_LLM_MAX_ATTEMPTS) {
        await delay(MATON_LLM_RETRY_DELAY_MS * attempt);
      }
    }
  }

  console.warn(
    `[Maton] Fallback heuristico acionado apos falha na extracao LLM (subject="${email.subject || ""}")`,
    lastError,
  );
  return extractLeadHeuristically(email);
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
