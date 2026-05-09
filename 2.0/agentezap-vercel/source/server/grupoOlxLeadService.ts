import type { GrupoOlxIntegration } from "@shared/schema";
import { normalizeBrazilWhatsAppPhone } from "./whatsappPhoneNumber";

export type GrupoOlxProcessingStatus =
  | "processed"
  | "pending_retry"
  | "processed_with_send_error"
  | "missing_phone"
  | "duplicate"
  | "config_error";

export type GrupoOlxAiVariation = "consultivo" | "acolhedor" | "objetivo" | "premium";

export type GrupoOlxNormalizedLead = {
  originLeadId: string;
  clientListingId: string | null;
  portalSource: string;
  leadType: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  transactionType: string | null;
  listingTitle: string | null;
  listingUrl: string | null;
  price: string | null;
  neighborhood: string | null;
  city: string | null;
  rawPayload: Record<string, unknown>;
};

export type GrupoOlxLeadEventRef = {
  id: string;
  status: string;
};

export type GrupoOlxProcessingResult = {
  eventId: string;
  status: GrupoOlxProcessingStatus;
  conversationId?: string | null;
  dealId?: string | null;
  message?: string;
};

export type GrupoOlxProcessingResources = {
  integration: GrupoOlxIntegration;
  autoReplyTemplate: string;
};

export type GrupoOlxProcessingDeps = {
  createLeadEvent: (
    lead: GrupoOlxNormalizedLead,
  ) => Promise<{ kind: "created"; event: GrupoOlxLeadEventRef } | { kind: "duplicate"; event: GrupoOlxLeadEventRef }>;
  updateLeadEvent: (
    eventId: string,
    patch: {
      status?: string;
      errorMessage?: string | null;
      conversationId?: string | null;
      dealId?: string | null;
      retryCount?: number;
      nextRetryAt?: Date | null;
      lastRetryAt?: Date | null;
      processedAt?: Date | null;
    },
  ) => Promise<void>;
  createDeal: (lead: GrupoOlxNormalizedLead, conversationId?: string | null) => Promise<string>;
  ensureConversation: (lead: GrupoOlxNormalizedLead) => Promise<string>;
  createSyntheticMessage: (conversationId: string, lead: GrupoOlxNormalizedLead) => Promise<void>;
  ensureTags: (conversationId: string, lead: GrupoOlxNormalizedLead) => Promise<void>;
  sendAutoReply: (conversationId: string, message: string) => Promise<void>;
  scheduleRetry?: (args: { error: unknown; conversationId: string; dealId?: string | null }) => Promise<{
    nextRetryAt: Date;
    retryCount?: number;
  } | null>;
};

export function isGrupoOlxRecoverableSendError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return [
    "not connected",
    "socket",
    "connection closed",
    "disconnected",
    "connection errored",
    "connection lost",
    "transport",
    "timed out",
  ].some((token) => message.includes(token));
}

const GRUPO_OLX_AI_VARIATIONS: GrupoOlxAiVariation[] = ["consultivo", "acolhedor", "objetivo", "premium"];

function normalizeWhitespace(value: string | null | undefined): string | null {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function getByPath(source: unknown, path: Array<string | number>): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (current == null) return undefined;
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function getFirstString(source: unknown, paths: Array<Array<string | number>>): string | null {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (typeof value === "string") {
      const normalized = normalizeWhitespace(value);
      if (normalized) return normalized;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return null;
}

function getArrayValues(source: unknown, paths: Array<Array<string | number>>): unknown[] {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizePhone(value: unknown): string | null {
  return normalizeBrazilWhatsAppPhone(value);
}

function extractPhone(source: unknown): string | null {
  const directPhone = getFirstString(source, [
    ["phone"],
    ["phoneNumber"],
    ["contactPhone"],
    ["lead", "phone"],
    ["lead", "phoneNumber"],
    ["customer", "phone"],
    ["contact", "phone"],
    ["client", "phone"],
  ]);

  const directDigits = normalizePhone(directPhone);
  if (directDigits) return directDigits;

  const phoneCollections = getArrayValues(source, [
    ["phones"],
    ["contactPhones"],
    ["customer", "phones"],
    ["contact", "phones"],
    ["client", "phones"],
  ]);

  for (const item of phoneCollections) {
    if (typeof item === "string") {
      const digits = normalizePhone(item);
      if (digits) return digits;
      continue;
    }
    if (item && typeof item === "object") {
      const digits = normalizePhone(
        (item as Record<string, unknown>).number ??
          (item as Record<string, unknown>).phone ??
          (item as Record<string, unknown>).value,
      );
      if (digits) return digits;
    }
  }

  return null;
}

function extractEmail(source: unknown): string | null {
  const directEmail = getFirstString(source, [
    ["email"],
    ["contactEmail"],
    ["lead", "email"],
    ["customer", "email"],
    ["contact", "email"],
    ["client", "email"],
  ]);
  if (directEmail) return directEmail.toLowerCase();

  const emailCollections = getArrayValues(source, [["emails"], ["customer", "emails"], ["contact", "emails"]]);
  for (const item of emailCollections) {
    if (typeof item === "string" && item.includes("@")) return item.toLowerCase();
    if (item && typeof item === "object") {
      const value = (item as Record<string, unknown>).email ?? (item as Record<string, unknown>).value;
      if (typeof value === "string" && value.includes("@")) return value.toLowerCase();
    }
  }

  return null;
}

export function isValidGrupoOlxAiVariation(value: unknown): value is GrupoOlxAiVariation {
  return typeof value === "string" && GRUPO_OLX_AI_VARIATIONS.includes(value as GrupoOlxAiVariation);
}

export function inferGrupoOlxPortalSource(source: unknown): string {
  const direct = getFirstString(source, [
    ["portalSource"],
    ["portal_source"],
    ["leadOrigin"],
    ["lead_origin"],
    ["source"],
    ["origin"],
    ["publisher"],
  ]);

  const searchable = `${direct ?? ""} ${getFirstString(source, [["listingUrl"], ["listing", "url"], ["url"]]) ?? ""} ${JSON.stringify(source)}`.toLowerCase();

  if (searchable.includes("vivareal") || searchable.includes("viva real")) return "Viva Real";
  if (searchable.includes("zapimoveis") || searchable.includes("zap imoveis") || searchable.includes("zap im")) return "ZAP Imoveis";
  if (searchable.includes("olx")) return "OLX";
  return "Grupo OLX";
}

function normalizeLeadType(value: string | null): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return "UNKNOWN";
  return normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function extractGrupoOlxLeadPayloads(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidate = payload as Record<string, unknown>;
  if (Array.isArray(candidate.leads)) {
    return candidate.leads.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }

  if (Array.isArray(candidate.data)) {
    return candidate.data.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }

  return [candidate];
}

export function normalizeGrupoOlxLeadPayload(payload: Record<string, unknown>): GrupoOlxNormalizedLead {
  const originLeadId = getFirstString(payload, [
    ["originLeadId"],
    ["origin_lead_id"],
    ["lead", "originLeadId"],
    ["lead", "origin_lead_id"],
    ["data", "originLeadId"],
    ["id"],
  ]);

  if (!originLeadId) {
    throw new Error("originLeadId is required");
  }

  const clientListingId = getFirstString(payload, [
    ["clientListingId"],
    ["client_listing_id"],
    ["listing", "clientListingId"],
    ["listing", "client_listing_id"],
    ["listingId"],
    ["listing", "listingId"],
  ]);

  const leadType = normalizeLeadType(
    getFirstString(payload, [
      ["extraData", "leadType"],
      ["extraData", "lead_type"],
      ["leadType"],
      ["lead_type"],
      ["type"],
    ]),
  );

  return {
    originLeadId,
    clientListingId,
    portalSource: inferGrupoOlxPortalSource(payload),
    leadType,
    name: getFirstString(payload, [
      ["name"],
      ["customer", "name"],
      ["contact", "name"],
      ["client", "name"],
      ["lead", "name"],
    ]),
    phone: extractPhone(payload),
    email: extractEmail(payload),
    message: getFirstString(payload, [
      ["message"],
      ["comments"],
      ["contact", "message"],
      ["lead", "message"],
      ["description"],
    ]),
    transactionType: getFirstString(payload, [
      ["transactionType"],
      ["transaction_type"],
      ["listing", "transactionType"],
      ["listing", "transaction_type"],
    ]),
    listingTitle: getFirstString(payload, [
      ["listingTitle"],
      ["listing_title"],
      ["listing", "title"],
      ["title"],
    ]),
    listingUrl: getFirstString(payload, [
      ["listingUrl"],
      ["listing_url"],
      ["listing", "url"],
      ["url"],
    ]),
    price: getFirstString(payload, [["price"], ["listing", "price"], ["listingPrice"]]),
    neighborhood: getFirstString(payload, [["neighborhood"], ["listing", "neighborhood"], ["address", "neighborhood"]]),
    city: getFirstString(payload, [["city"], ["listing", "city"], ["address", "city"]]),
    rawPayload: payload,
  };
}

export function renderGrupoOlxAutoReply(template: string, lead: GrupoOlxNormalizedLead): string {
  const fallback = normalizeWhitespace(template) ?? "";
  const replacements: Record<string, string> = {
    nome: lead.name ?? "cliente",
    portal: lead.portalSource,
    lead_type: lead.leadType,
    imovel_codigo: lead.clientListingId ?? "",
    imovel_titulo: lead.listingTitle ?? "",
    cidade: lead.city ?? "",
    bairro: lead.neighborhood ?? "",
    preco: lead.price ?? "",
    tipo_transacao: lead.transactionType ?? "",
    url_anuncio: lead.listingUrl ?? "",
    telefone: lead.phone ?? "",
    email: lead.email ?? "",
    mensagem: lead.message ?? "",
  };

  return fallback
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
      const normalizedKey = String(key).trim();
      return replacements[normalizedKey] ?? "";
    })
    .trim();
}

export function buildGrupoOlxSyntheticMessage(lead: GrupoOlxNormalizedLead): string {
  const lines = [
    `Lead recebido via ${lead.portalSource} (${lead.leadType}).`,
    lead.name ? `Nome: ${lead.name}` : null,
    lead.phone ? `Telefone: ${lead.phone}` : null,
    lead.email ? `E-mail: ${lead.email}` : null,
    lead.clientListingId ? `Codigo do imovel: ${lead.clientListingId}` : null,
    lead.listingTitle ? `Imovel: ${lead.listingTitle}` : null,
    lead.city ? `Cidade: ${lead.city}` : null,
    lead.neighborhood ? `Bairro: ${lead.neighborhood}` : null,
    lead.transactionType ? `Transacao: ${lead.transactionType}` : null,
    lead.price ? `Preco: ${lead.price}` : null,
    lead.listingUrl ? `URL do anuncio: ${lead.listingUrl}` : null,
    lead.message ? `Mensagem do lead: ${lead.message}` : "Mensagem do lead: nao informada",
  ];

  return lines.filter(Boolean).join("\n");
}

export function buildGrupoOlxDealNotes(lead: GrupoOlxNormalizedLead): string {
  return [
    `Origem: ${lead.portalSource}`,
    `Canal: ${lead.leadType}`,
    lead.clientListingId ? `Codigo do imovel: ${lead.clientListingId}` : null,
    lead.listingTitle ? `Imovel: ${lead.listingTitle}` : null,
    lead.city ? `Cidade: ${lead.city}` : null,
    lead.message ? `Mensagem: ${lead.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function processGrupoOlxLeadCandidate(
  lead: GrupoOlxNormalizedLead,
  resources: GrupoOlxProcessingResources,
  deps: GrupoOlxProcessingDeps,
): Promise<GrupoOlxProcessingResult> {
  const eventCreation = await deps.createLeadEvent(lead);
  if (eventCreation.kind === "duplicate") {
    return {
      eventId: eventCreation.event.id,
      status: "duplicate",
      message: "Lead already processed",
    };
  }

  const eventId = eventCreation.event.id;
  const requiresDeal = resources.integration.createDealEnabled === true;

  if (!resources.integration.connectionId) {
    await deps.updateLeadEvent(eventId, {
      status: "config_error",
      errorMessage: "Integracao sem conexao WhatsApp configurada",
      processedAt: new Date(),
    });
    return {
      eventId,
      status: "config_error",
      message: "Integration is not operational",
    };
  }

  if (requiresDeal && (!resources.integration.funnelId || !resources.integration.stageId)) {
    await deps.updateLeadEvent(eventId, {
      status: "config_error",
      errorMessage: "Integracao com CRM ativo, mas sem funil ou etapa configurados",
      processedAt: new Date(),
    });
    return {
      eventId,
      status: "config_error",
      message: "Integration is not operational",
    };
  }

  if (!lead.phone) {
    const dealId = requiresDeal ? await deps.createDeal(lead, null) : null;
    await deps.updateLeadEvent(eventId, {
      status: "missing_phone",
      dealId: dealId ?? null,
      processedAt: new Date(),
    });
    return {
      eventId,
      status: "missing_phone",
      dealId: dealId ?? null,
      message: requiresDeal ? "Lead stored without phone" : "Lead stored without phone and without CRM deal",
    };
  }

  const conversationId = await deps.ensureConversation(lead);
  const dealId = requiresDeal ? await deps.createDeal(lead, conversationId) : null;
  await deps.createSyntheticMessage(conversationId, lead);
  await deps.ensureTags(conversationId, lead);

  await deps.updateLeadEvent(eventId, {
    dealId: dealId ?? null,
    conversationId,
  });

  const renderedReply = renderGrupoOlxAutoReply(resources.autoReplyTemplate, lead);
  if (!renderedReply) {
    await deps.updateLeadEvent(eventId, {
      status: "processed_with_send_error",
      errorMessage: "Template de resposta vazio",
      dealId: dealId ?? null,
      conversationId,
      processedAt: new Date(),
    });
    return {
      eventId,
      status: "processed_with_send_error",
      dealId: dealId ?? null,
      conversationId,
      message: "Lead stored but auto-reply template is empty",
    };
  }

  try {
    await deps.sendAutoReply(conversationId, renderedReply);
    await deps.updateLeadEvent(eventId, {
      status: "processed",
      dealId: dealId ?? null,
      conversationId,
      processedAt: new Date(),
    });
    return {
      eventId,
      status: "processed",
      dealId: dealId ?? null,
      conversationId,
      message: "Lead processed",
    };
  } catch (error) {
    const sendError = error instanceof Error ? error.message : "Unknown auto-reply error";
    const retryPlan = deps.scheduleRetry
      ? await deps.scheduleRetry({ error, conversationId, dealId: dealId ?? null })
      : null;
    await deps.updateLeadEvent(eventId, {
      status: retryPlan ? "pending_retry" : "processed_with_send_error",
      errorMessage: sendError,
      dealId: dealId ?? null,
      conversationId,
      retryCount: retryPlan?.retryCount ?? 0,
      nextRetryAt: retryPlan?.nextRetryAt ?? null,
      lastRetryAt: null,
      processedAt: retryPlan ? null : new Date(),
    });
    return {
      eventId,
      status: retryPlan ? "pending_retry" : "processed_with_send_error",
      dealId: dealId ?? null,
      conversationId,
      message: sendError,
    };
  }
}
