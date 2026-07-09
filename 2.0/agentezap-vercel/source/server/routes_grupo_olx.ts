import type { Express, Request } from "express";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "./db";
import { fetchMatonLeadEmails, findMatonConnection, listMatonGoogleMailConnections } from "./matonGmailService";
import { getPaginatedGrupoOlxListings, syncGrupoOlxCatalogFromFeed } from "./realEstateCatalogService";
import { storage } from "./storage";
import { getUserId, isAuthenticated } from "./supabaseAuth";
import { sendMessage as whatsappSendMessage } from "./whatsapp";
import {
  buildGrupoOlxDealNotes,
  buildGrupoOlxSyntheticMessage,
  extractGrupoOlxLeadPayloads,
  isGrupoOlxRecoverableSendError,
  isValidGrupoOlxAiVariation,
  normalizeGrupoOlxLeadPayload,
  processGrupoOlxLeadCandidate,
  renderGrupoOlxAutoReply,
  type GrupoOlxNormalizedLead,
} from "./grupoOlxLeadService";
import {
  buildBrazilWhatsAppPhoneVariants,
  buildWhatsAppJidFromPhone,
  normalizeBrazilWhatsAppPhone,
} from "./whatsappPhoneNumber";
import {
  dealHistory,
  funnelDeals,
  funnelStages,
  grupoOlxIntegrations,
  grupoOlxLeadEvents,
  grupoOlxListings,
  salesFunnels,
  type GrupoOlxIntegration,
  type GrupoOlxLeadEvent,
  type GrupoOlxListing,
  type InsertGrupoOlxLeadEvent,
} from "@shared/schema";
import {
  canRunGrupoOlxCatalogSync,
  canRunGrupoOlxLeadSync,
  normalizeGrupoOlxToggleState,
} from "@shared/grupoOlxIntegrationRules";

const GRUPO_OLX_RETRY_INTERVAL_MS = 60 * 1000;
const DEFAULT_LISTINGS_PAGE_SIZE = 6;
let grupoOlxRetryInterval: NodeJS.Timeout | null = null;
let grupoOlxRetryRunning = false;

function generateGrupoOlxToken(): string {
  return randomBytes(24).toString("hex");
}

function resolveBaseUrl(req: Request): string {
  const configuredBase = process.env.BASE_URL || process.env.APP_URL;
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }
  return `${req.protocol}://${req.get("host") || "localhost:5000"}`;
}

function buildWebhookUrl(req: Request, token: string): string {
  return `${resolveBaseUrl(req)}/api/integrations/grupo-olx/webhook/${token}`;
}

async function getIntegrationForUser(userId: string): Promise<GrupoOlxIntegration | undefined> {
  const [integration] = await db
    .select()
    .from(grupoOlxIntegrations)
    .where(eq(grupoOlxIntegrations.userId, userId))
    .limit(1);
  return integration;
}

type ListingQueryOptions = {
  page: number;
  pageSize: number;
};

type GrupoOlxLeadRetrySummary = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<{
    eventId: string;
    status: "processed" | "processed_with_send_error" | "skipped";
    message: string | null;
  }>;
};

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  options?: {
    min?: number;
    max?: number;
  },
): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;

  const min = options?.min ?? 1;
  const max = options?.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(parsed, min), max);
}

function resolveListingQueryOptions(req: Request): ListingQueryOptions {
  return {
    page: parsePositiveInteger(req.query?.page, 1, { min: 1, max: 999 }),
    pageSize: parsePositiveInteger(req.query?.pageSize, DEFAULT_LISTINGS_PAGE_SIZE, {
      min: 1,
      max: 24,
    }),
  };
}

async function getRecentEvents(integrationId?: string): Promise<GrupoOlxLeadEvent[]> {
  if (!integrationId) return [];

  const normalizeEventForDisplay = (event: GrupoOlxLeadEvent): GrupoOlxLeadEvent => {
    if (event.status === "pending_retry") {
      return {
        ...event,
        status: "processed_with_send_error",
      };
    }

    return event;
  };

  const rows = await db
    .select()
    .from(grupoOlxLeadEvents)
    .where(eq(grupoOlxLeadEvents.integrationId, integrationId))
    .orderBy(desc(grupoOlxLeadEvents.createdAt))
    .limit(20);
  return rows.map(normalizeEventForDisplay);
}

async function getRecentListings(
  integrationId: string | undefined,
  listingQuery: ListingQueryOptions,
): Promise<{
  items: GrupoOlxListing[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  if (!integrationId) {
    return {
      items: [],
      page: listingQuery.page,
      pageSize: listingQuery.pageSize,
      total: 0,
      totalPages: 1,
    };
  }

  return getPaginatedGrupoOlxListings(integrationId, listingQuery);
}

async function getFirstStageForFunnel(funnelId: string) {
  const [stage] = await db
    .select()
    .from(funnelStages)
    .where(eq(funnelStages.funnelId, funnelId))
    .orderBy(asc(funnelStages.position))
    .limit(1);
  return stage;
}

async function ensureTagIdForUser(
  userId: string,
  cache: Map<string, string>,
  name: string,
  color: string,
): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  const existingTags = await storage.getTagsByUserId(userId);
  const existing = existingTags.find((tag) => tag.name === name);
  if (existing) {
    cache.set(name, existing.id);
    return existing.id;
  }

  const created = await storage.createTag({
    userId,
    name,
    color,
    icon: "tag",
    description: `Etiqueta automatica da integracao Imobiliaria (${name})`,
    position: existingTags.length,
    isDefault: false,
  });
  cache.set(name, created.id);
  return created.id;
}

function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

async function buildConfigResponse(req: Request, integration: GrupoOlxIntegration | undefined) {
  const listingQuery = resolveListingQueryOptions(req);
  const events = await getRecentEvents(integration?.id);
  const listings = await getRecentListings(integration?.id, listingQuery);

  if (!integration) {
    return {
      integration: null,
      events,
      listings: listings.items,
      listingPagination: {
        page: listings.page,
        pageSize: listings.pageSize,
        total: listings.total,
        totalPages: listings.totalPages,
      },
      matonConnections: [],
    };
  }

  const { matonApiKey: _matonApiKey, ...safeIntegration } = integration;

  let matonConnections: Array<{
    connectionId: string;
    email: string | null;
    displayName: string | null;
    status: string;
    method: string | null;
  }> = [];
  if (integration.matonApiKey) {
    try {
      const connections = await listMatonGoogleMailConnections(integration.matonApiKey);
      matonConnections = connections.map((connection) => ({
        connectionId: connection.connectionId,
        email: connection.email,
        displayName: connection.displayName,
        status: connection.status,
        method: connection.method,
      }));
    } catch {
      matonConnections = [];
    }
  }

  return {
    integration: {
      ...safeIntegration,
      webhookUrl: buildWebhookUrl(req, integration.token),
      hasMatonApiKey: Boolean(integration.matonApiKey),
      maskedMatonApiKey: maskSecret(integration.matonApiKey),
      listingCount: listings.total,
      matonConnectionCount: matonConnections.length,
    },
    events,
    listings: listings.items,
    listingPagination: {
      page: listings.page,
      pageSize: listings.pageSize,
      total: listings.total,
      totalPages: listings.totalPages,
    },
    matonConnections,
  };
}

async function updateCatalogSyncStatus(
  integrationId: string,
  patch: Partial<Pick<GrupoOlxIntegration, "lastCatalogSyncAt" | "lastCatalogSyncStatus" | "lastCatalogSyncMessage" | "updatedAt">>,
) {
  await db.update(grupoOlxIntegrations).set(patch).where(eq(grupoOlxIntegrations.id, integrationId));
}

async function updateLeadSyncStatus(
  integrationId: string,
  patch: Partial<Pick<GrupoOlxIntegration, "lastLeadSyncAt" | "lastLeadSyncStatus" | "lastLeadSyncMessage" | "updatedAt">>,
) {
  await db.update(grupoOlxIntegrations).set(patch).where(eq(grupoOlxIntegrations.id, integrationId));
}

async function processNormalizedLead(
  integration: GrupoOlxIntegration,
  normalizedLead: GrupoOlxNormalizedLead,
) {
  const connection = integration.connectionId ? await storage.getConnectionById(integration.connectionId) : undefined;
  const [funnel] = integration.createDealEnabled && integration.funnelId
    ? await db
        .select()
        .from(salesFunnels)
        .where(and(eq(salesFunnels.id, integration.funnelId), eq(salesFunnels.userId, integration.userId)))
        .limit(1)
    : [];
  const [stage] = integration.createDealEnabled && integration.stageId && integration.funnelId
    ? await db
        .select()
        .from(funnelStages)
        .where(and(eq(funnelStages.id, integration.stageId), eq(funnelStages.funnelId, integration.funnelId)))
        .limit(1)
    : [];

  const operationalIntegration: GrupoOlxIntegration = {
    ...integration,
    connectionId: connection?.id ?? null,
    funnelId: integration.createDealEnabled ? funnel?.id ?? null : null,
    stageId: integration.createDealEnabled ? stage?.id ?? null : null,
  };

  const tagCache = new Map<string, string>();

  return processGrupoOlxLeadCandidate(
    normalizedLead,
    {
      integration: operationalIntegration,
      autoReplyTemplate: integration.autoReplyTemplate ?? "",
    },
    {
      createLeadEvent: async (lead) => {
        const [created] = await db
          .insert(grupoOlxLeadEvents)
          .values({
            integrationId: integration.id,
            originLeadId: lead.originLeadId,
            clientListingId: lead.clientListingId,
            portalSource: lead.portalSource,
            leadType: lead.leadType,
            contactName: lead.name,
            contactPhone: lead.phone,
            contactEmail: lead.email,
            status: "received",
            rawPayload: lead.rawPayload,
          })
          .onConflictDoNothing()
          .returning({
            id: grupoOlxLeadEvents.id,
            status: grupoOlxLeadEvents.status,
          });

        if (created) {
          return { kind: "created" as const, event: created };
        }

        const [existingEvent] = await db
          .select({
            id: grupoOlxLeadEvents.id,
            status: grupoOlxLeadEvents.status,
          })
          .from(grupoOlxLeadEvents)
          .where(
            and(
              eq(grupoOlxLeadEvents.integrationId, integration.id),
              eq(grupoOlxLeadEvents.originLeadId, lead.originLeadId),
            ),
          )
          .limit(1);

        if (!existingEvent) {
          throw new Error("Lead duplicado nao pode ser carregado");
        }

        return { kind: "duplicate" as const, event: existingEvent };
      },
      updateLeadEvent: async (eventId, patch) => {
        const updateData: Partial<InsertGrupoOlxLeadEvent> = {};
        if (patch.status !== undefined) updateData.status = patch.status;
        if (patch.errorMessage !== undefined) updateData.errorMessage = patch.errorMessage;
        if (patch.conversationId !== undefined) updateData.conversationId = patch.conversationId;
        if (patch.dealId !== undefined) updateData.dealId = patch.dealId;
        if (patch.processedAt !== undefined) updateData.processedAt = patch.processedAt;

        await db.update(grupoOlxLeadEvents).set(updateData).where(eq(grupoOlxLeadEvents.id, eventId));
      },
      createDeal: async (lead, conversationId) => {
        const [deal] = await db
          .insert(funnelDeals)
          .values({
            stageId: operationalIntegration.stageId!,
            contactName: lead.name || lead.phone || lead.email || "Lead Imobiliaria",
            companyName: lead.portalSource,
            value: "0",
            valuePeriod: "mensal",
            priority: "Media",
            contactPhone: lead.phone,
            contactEmail: lead.email,
            notes: buildGrupoOlxDealNotes(lead),
            conversationId: conversationId ?? null,
            lastContactAt: new Date(),
          })
          .returning({ id: funnelDeals.id });

        await db.insert(dealHistory).values({
          dealId: deal.id,
          toStageId: operationalIntegration.stageId!,
          action: "created",
          notes: `Deal criado via ${lead.portalSource} (${lead.leadType})`,
        });

        return deal.id;
      },
      ensureConversation: async (lead) => {
        const normalizedNumber = normalizeBrazilWhatsAppPhone(lead.phone)!;
        let existingConversation: Awaited<ReturnType<typeof storage.getConversationByContactNumber>> | undefined;

        for (const candidateNumber of buildBrazilWhatsAppPhoneVariants(normalizedNumber)) {
          existingConversation =
            (await storage.getActiveConversationByContactNumber(operationalIntegration.connectionId!, candidateNumber)) ||
            (await storage.getConversationByContactNumber(operationalIntegration.connectionId!, candidateNumber));
          if (existingConversation) {
            break;
          }
        }

        if (existingConversation) {
          const normalizedRemoteJid = buildWhatsAppJidFromPhone(normalizedNumber)!;
          if (
            existingConversation.contactNumber !== normalizedNumber ||
            existingConversation.remoteJid !== normalizedRemoteJid
          ) {
            await storage.updateConversation(existingConversation.id, {
              contactNumber: normalizedNumber,
              remoteJid: normalizedRemoteJid,
              contactName: lead.name || existingConversation.contactName || normalizedNumber,
            });
          }
          return existingConversation.id;
        }

        const createdConversation = await storage.createConversation({
          connectionId: operationalIntegration.connectionId!,
          contactNumber: normalizedNumber,
          remoteJid: buildWhatsAppJidFromPhone(normalizedNumber)!,
          contactName: lead.name || normalizedNumber,
          lastMessageText: null,
          lastMessageTime: null,
          unreadCount: 0,
        });

        return createdConversation.id;
      },
      createSyntheticMessage: async (conversationId, lead) => {
        const text = buildGrupoOlxSyntheticMessage(lead);
        await storage.createMessage({
          conversationId,
          messageId: `grupoolx:${lead.originLeadId}`,
          fromMe: false,
          text,
          timestamp: new Date(),
          status: "received",
          isFromAgent: false,
        });
        await storage.updateConversation(conversationId, {
          lastMessageText: text,
          lastMessageTime: new Date(),
          lastMessageFromMe: false,
        });
      },
      ensureTags: async (conversationId, lead) => {
        const tagSpecs = [
          { name: "Imobiliaria", color: "#0f766e" },
          { name: "Lead Portal", color: "#1d4ed8" },
          { name: lead.portalSource, color: "#7c3aed" },
          { name: lead.leadType, color: "#c2410c" },
        ];

        for (const tag of tagSpecs) {
          const tagId = await ensureTagIdForUser(integration.userId, tagCache, tag.name, tag.color);
          await storage.addTagToConversation(conversationId, tagId);
        }
      },
      sendAutoReply: async (conversationId, message) => {
        const conversation = await storage.getConversation(conversationId);
        const normalizedNumber = normalizeBrazilWhatsAppPhone(
          conversation?.contactNumber || conversation?.remoteJid || null,
        );
        const normalizedRemoteJid = buildWhatsAppJidFromPhone(
          conversation?.remoteJid || conversation?.contactNumber || null,
        );

        if (conversation && normalizedNumber && normalizedRemoteJid) {
          if (
            conversation.contactNumber !== normalizedNumber ||
            conversation.remoteJid !== normalizedRemoteJid
          ) {
            await storage.updateConversation(conversationId, {
              contactNumber: normalizedNumber,
              remoteJid: normalizedRemoteJid,
              contactName: conversation.contactName || normalizedNumber,
            });
          }
        }

        await whatsappSendMessage(integration.userId, conversationId, message, {
          isFromAgent: true,
          source: "agent",
        });
      },
    },
  );
}

function buildLeadFromMatonEmail(emailLead: Awaited<ReturnType<typeof fetchMatonLeadEmails>>[number]): GrupoOlxNormalizedLead {
  return {
    originLeadId: `email:${emailLead.messageId}`,
    clientListingId: emailLead.extracted.listingCode,
    portalSource: emailLead.extracted.portalSource || "Grupo OLX",
    leadType: (emailLead.extracted.leadChannel || "EMAIL_LEAD").toUpperCase().replace(/\s+/g, "_"),
    name: emailLead.extracted.contactName,
    phone: normalizeBrazilWhatsAppPhone(emailLead.extracted.contactPhone),
    email: emailLead.extracted.contactEmail,
    message: emailLead.extracted.interestSummary || emailLead.snippet || emailLead.subject,
    transactionType: emailLead.extracted.transactionType,
    listingTitle: emailLead.extracted.listingTitle,
    listingUrl: emailLead.extracted.listingUrl,
    price: emailLead.extracted.price,
    neighborhood: emailLead.extracted.neighborhood,
    city: emailLead.extracted.city,
    rawPayload: {
      source: "maton-email",
      messageId: emailLead.messageId,
      threadId: emailLead.threadId,
      subject: emailLead.subject,
      from: emailLead.from,
      receivedAt: emailLead.receivedAt?.toISOString() || null,
      snippet: emailLead.snippet,
      bodyText: emailLead.bodyText,
      extracted: emailLead.extracted,
    },
  };
}

export async function syncMatonLeadEmailsForIntegration(
  integration: GrupoOlxIntegration,
  options?: {
    maxResults?: number;
    newerThanDays?: number;
  },
) {
  if (!integration.matonApiKey) {
    throw new Error("Chave da Maton nao configurada");
  }

  if (!integration.matonConnectionId) {
    throw new Error("Nenhuma caixa do Gmail foi selecionada na Maton");
  }

  const emails = await fetchMatonLeadEmails({
    apiKey: integration.matonApiKey,
    connectionId: integration.matonConnectionId,
    senderFilter: integration.matonSenderFilter || "comunica.zapimoveis.com.br",
    maxResults: options?.maxResults ?? 10,
    newerThanDays: options?.newerThanDays ?? 30,
  });

  const results = [];
  for (const email of emails) {
    const lead = buildLeadFromMatonEmail(email);
    const processed = await processNormalizedLead(integration, lead);
    results.push({
      originLeadId: lead.originLeadId,
      status: processed.status,
      eventId: processed.eventId,
      conversationId: processed.conversationId ?? null,
      dealId: processed.dealId ?? null,
      subject: email.subject,
    });
  }

  const retried = await retryFailedLeadEventsForIntegration(integration, {
    limit: Math.max(results.length, 6),
  });

  return {
    processed: results.length,
    results,
    retried,
  };
}

function buildLeadFromStoredPayload(event: GrupoOlxLeadEvent): GrupoOlxNormalizedLead {
  const payload = event.rawPayload as Record<string, any>;
  if (payload?.source === "maton-email" && payload?.messageId) {
    const extracted = payload.extracted ?? {};
    return {
      originLeadId: `email:${payload.messageId}`,
      clientListingId: extracted.listingCode ?? event.clientListingId ?? null,
      portalSource: extracted.portalSource || event.portalSource || "Grupo OLX",
      leadType: (extracted.leadChannel || event.leadType || "EMAIL_LEAD").toUpperCase().replace(/\s+/g, "_"),
      name: extracted.contactName || event.contactName || null,
      phone: normalizeBrazilWhatsAppPhone(extracted.contactPhone) ?? normalizeBrazilWhatsAppPhone(event.contactPhone),
      email: extracted.contactEmail || event.contactEmail || null,
      message: extracted.interestSummary || payload.snippet || payload.subject || null,
      transactionType: extracted.transactionType || null,
      listingTitle: extracted.listingTitle || null,
      listingUrl: extracted.listingUrl || null,
      price: extracted.price || null,
      neighborhood: extracted.neighborhood || null,
      city: extracted.city || null,
      rawPayload: payload,
    };
  }

  try {
    return normalizeGrupoOlxLeadPayload(payload);
  } catch {
    return {
      originLeadId: event.originLeadId,
      clientListingId: event.clientListingId,
      portalSource: event.portalSource,
      leadType: event.leadType || "UNKNOWN",
      name: event.contactName,
      phone: event.contactPhone,
      email: event.contactEmail,
      message: null,
      transactionType: null,
      listingTitle: null,
      listingUrl: null,
      price: null,
      neighborhood: null,
      city: null,
      rawPayload: payload,
    };
  }
}

async function hasMatchingAutoReplyInConversation(
  conversationId: string,
  message: string,
  createdAt: Date | null | undefined,
): Promise<boolean> {
  const normalizedReply = message.trim();
  if (!normalizedReply) return false;

  const history = await storage.getMessagesByConversationId(conversationId);
  const floorTime = createdAt ? new Date(createdAt.getTime() - 60_000) : null;

  return history.some((item) => {
    if (!item.fromMe) return false;
    if (item.text?.trim() !== normalizedReply) return false;
    if (!floorTime || !item.timestamp) return true;
    return new Date(item.timestamp) >= floorTime;
  });
}

async function retryLeadEventSend(
  integration: GrupoOlxIntegration,
  event: GrupoOlxLeadEvent,
): Promise<GrupoOlxLeadRetrySummary["results"][number]> {
  if (!integration.active || !integration.connectionId) {
    await db.update(grupoOlxLeadEvents).set({
      status: "processed_with_send_error",
      errorMessage: "Integracao inativa ou sem conexao WhatsApp configurada",
      processedAt: new Date(),
    }).where(eq(grupoOlxLeadEvents.id, event.id));

    return {
      eventId: event.id,
      status: "processed_with_send_error",
      message: "Integracao inativa ou sem conexao WhatsApp configurada",
    };
  }

  if (!event.conversationId) {
    await db.update(grupoOlxLeadEvents).set({
      status: "processed_with_send_error",
      errorMessage: "Conversa de destino nao encontrada para reenviar o lead",
      processedAt: new Date(),
    }).where(eq(grupoOlxLeadEvents.id, event.id));

    return {
      eventId: event.id,
      status: "processed_with_send_error",
      message: "Conversa de destino nao encontrada para reenviar o lead",
    };
  }

  const lead = buildLeadFromStoredPayload(event);
  const finalMessage = renderGrupoOlxAutoReply(integration.autoReplyTemplate || "", lead);
  if (!finalMessage) {
    await db.update(grupoOlxLeadEvents).set({
      status: "processed_with_send_error",
      errorMessage: "Template de resposta vazio",
      processedAt: new Date(),
    }).where(eq(grupoOlxLeadEvents.id, event.id));

    return {
      eventId: event.id,
      status: "processed_with_send_error",
      message: "Template de resposta vazio",
    };
  }

  if (await hasMatchingAutoReplyInConversation(event.conversationId, finalMessage, event.createdAt)) {
    await db.update(grupoOlxLeadEvents).set({
      status: "processed",
      errorMessage: null,
      processedAt: new Date(),
    }).where(eq(grupoOlxLeadEvents.id, event.id));

    return {
      eventId: event.id,
      status: "skipped",
      message: "A resposta automatica ja constava no historico da conversa",
    };
  }

  try {
    await whatsappSendMessage(integration.userId, event.conversationId, finalMessage, {
      isFromAgent: true,
      source: "agent",
    });

    await db.update(grupoOlxLeadEvents).set({
      status: "processed",
      errorMessage: null,
      processedAt: new Date(),
    }).where(eq(grupoOlxLeadEvents.id, event.id));

    return {
      eventId: event.id,
      status: "processed",
      message: "Lead reenviado com sucesso",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao reenviar lead";
    await db.update(grupoOlxLeadEvents).set({
      status: "processed_with_send_error",
      errorMessage: message,
      processedAt: new Date(),
    }).where(eq(grupoOlxLeadEvents.id, event.id));

    return {
      eventId: event.id,
      status: "processed_with_send_error",
      message,
    };
  }
}

export async function retryFailedLeadEventsForIntegration(
  integration: GrupoOlxIntegration,
  options?: {
    eventId?: string;
    limit?: number;
  },
): Promise<GrupoOlxLeadRetrySummary> {
  const candidates = await db
    .select()
    .from(grupoOlxLeadEvents)
    .where(eq(grupoOlxLeadEvents.integrationId, integration.id))
    .orderBy(desc(grupoOlxLeadEvents.createdAt))
    .limit(options?.eventId ? 40 : 120);

  const retryable = candidates
    .filter((event) => {
      if (options?.eventId && event.id !== options.eventId) {
        return false;
      }

      if (event.status !== "pending_retry" && event.status !== "processed_with_send_error") {
        return false;
      }

      return isGrupoOlxRecoverableSendError(event.errorMessage || "");
    })
    .slice(0, Math.max(options?.limit ?? 6, 1));

  const results: GrupoOlxLeadRetrySummary["results"] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of retryable) {
    const result = await retryLeadEventSend(integration, event);
    results.push(result);

    if (result.status === "processed") {
      succeeded++;
      continue;
    }

    if (result.status === "skipped") {
      skipped++;
      continue;
    }

    failed++;
  }

  return {
    attempted: retryable.length,
    succeeded,
    failed,
    skipped,
    results,
  };
}

async function processGrupoOlxLeadRetryQueue(): Promise<void> {
  if (grupoOlxRetryRunning) {
    return;
  }

  grupoOlxRetryRunning = true;
  try {
    const integrations = await db
      .select()
      .from(grupoOlxIntegrations)
      .where(and(eq(grupoOlxIntegrations.active, true), eq(grupoOlxIntegrations.leadEmailSyncEnabled, true)));

    for (const integration of integrations) {
      const result = await retryFailedLeadEventsForIntegration(integration, { limit: 10 });
      if (result.attempted > 0) {
        console.log(
          `[Imobiliaria] Retry automatico de leads: integration=${integration.id} attempted=${result.attempted} succeeded=${result.succeeded} failed=${result.failed} skipped=${result.skipped}`,
        );
      }
    }
  } catch (error) {
    console.error("[Imobiliaria] Error processing retry queue:", error);
  } finally {
    grupoOlxRetryRunning = false;
  }
}

export function startGrupoOlxRetryService(): void {
  if (grupoOlxRetryInterval) {
    return;
  }

  void processGrupoOlxLeadRetryQueue();
  grupoOlxRetryInterval = setInterval(() => {
    void processGrupoOlxLeadRetryQueue();
  }, GRUPO_OLX_RETRY_INTERVAL_MS);
}

export function stopGrupoOlxRetryService(): void {
  if (grupoOlxRetryInterval) {
    clearInterval(grupoOlxRetryInterval);
    grupoOlxRetryInterval = null;
  }
}

export function registerGrupoOlxRoutes(app: Express): void {
  app.get("/api/integrations/grupo-olx", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const integration = await getIntegrationForUser(userId);
      res.json(await buildConfigResponse(req, integration));
    } catch (error) {
      console.error("[Imobiliaria] Error fetching integration config:", error);
      res.status(500).json({ message: "Erro ao carregar configuracao de Imobiliaria" });
    }
  });

  app.post("/api/integrations/grupo-olx/maton-connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const integration = await getIntegrationForUser(userId);
      const requestedApiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
      const apiKey = requestedApiKey || integration?.matonApiKey || "";

      if (!apiKey) {
        return res.status(400).json({ message: "Informe a chave da Maton para listar as caixas conectadas." });
      }

      const connections = await listMatonGoogleMailConnections(apiKey);
      res.json({
        connections: connections.map((connection) => ({
          connectionId: connection.connectionId,
          email: connection.email,
          displayName: connection.displayName,
          status: connection.status,
          method: connection.method,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao listar conexoes da Maton";
      console.error("[Imobiliaria] Error loading Maton connections:", error);
      res.status(500).json({ message });
    }
  });

  app.put("/api/integrations/grupo-olx", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const existing = await getIntegrationForUser(userId);

      const requestedConnectionId = typeof req.body?.connectionId === "string" ? req.body.connectionId : null;
      const requestedXmlFeedUrl = typeof req.body?.xmlFeedUrl === "string" ? req.body.xmlFeedUrl.trim() : "";
      const requestedMatonApiKey = typeof req.body?.matonApiKey === "string" ? req.body.matonApiKey.trim() : "";
      const clearMatonApiKey = req.body?.clearMatonApiKey === true;
      const requestedMatonConnectionId =
        typeof req.body?.matonConnectionId === "string" ? req.body.matonConnectionId.trim() : "";
      const requestedMatonSenderFilter =
        typeof req.body?.matonSenderFilter === "string" ? req.body.matonSenderFilter.trim() : "";
      const requestedFunnelId = typeof req.body?.funnelId === "string" ? req.body.funnelId : null;
      const requestedStageId = typeof req.body?.stageId === "string" ? req.body.stageId : null;
      const requestedCreateDealEnabled = req.body?.createDealEnabled === true;
      const normalizedToggles = normalizeGrupoOlxToggleState({
        active: req.body?.active === true,
        catalogSyncEnabled: req.body?.catalogSyncEnabled !== false,
        leadEmailSyncEnabled: req.body?.leadEmailSyncEnabled === true,
        syncToAi: req.body?.syncToAi !== false,
        createDealEnabled: req.body?.createDealEnabled === true,
      });
      const { active, catalogSyncEnabled, leadEmailSyncEnabled, syncToAi } = normalizedToggles;
      const requestedAiVariation = typeof req.body?.aiVariation === "string" ? req.body.aiVariation.trim() : "";
      const aiVariation = isValidGrupoOlxAiVariation(requestedAiVariation) ? requestedAiVariation : "consultivo";
      const autoReplyTemplate = typeof req.body?.autoReplyTemplate === "string" ? req.body.autoReplyTemplate.trim() : "";

      let validatedConnectionId: string | null = null;
      if (requestedConnectionId) {
        const connection = await storage.getConnectionByUserId(userId, requestedConnectionId);
        if (!connection) {
          return res.status(400).json({ message: "Conexao WhatsApp invalida" });
        }
        validatedConnectionId = connection.id;
      } else if (existing?.connectionId) {
        validatedConnectionId = existing.connectionId;
      }

      let validatedFunnelId: string | null = null;
      if (requestedFunnelId) {
        const [funnel] = await db
          .select()
          .from(salesFunnels)
          .where(and(eq(salesFunnels.id, requestedFunnelId), eq(salesFunnels.userId, userId)))
          .limit(1);
        if (!funnel) {
          return res.status(400).json({ message: "Funil invalido" });
        }
        validatedFunnelId = funnel.id;
      } else if (existing?.funnelId && requestedCreateDealEnabled) {
        validatedFunnelId = existing.funnelId;
      }

      let resolvedStageId: string | null = null;
      if (validatedFunnelId) {
        if (requestedStageId) {
          const [stage] = await db
            .select()
            .from(funnelStages)
            .where(and(eq(funnelStages.id, requestedStageId), eq(funnelStages.funnelId, validatedFunnelId)))
            .limit(1);
          if (!stage) {
            return res.status(400).json({ message: "Etapa invalida para o funil selecionado" });
          }
          resolvedStageId = stage.id;
        } else if (existing?.stageId && requestedCreateDealEnabled) {
          resolvedStageId = existing.stageId;
        } else {
          const firstStage = await getFirstStageForFunnel(validatedFunnelId);
          resolvedStageId = firstStage?.id ?? null;
        }
      }

      const xmlFeedUrl = requestedXmlFeedUrl || existing?.xmlFeedUrl || null;
      const matonApiKey = clearMatonApiKey
        ? null
        : requestedMatonApiKey || existing?.matonApiKey || null;
      const matonSenderFilter = requestedMatonSenderFilter || existing?.matonSenderFilter || "comunica.zapimoveis.com.br";
      const createDealEnabled = normalizedToggles.createDealEnabled;
      let matonConnectionId =
        requestedMatonConnectionId || (clearMatonApiKey ? "" : existing?.matonConnectionId || "");
      let matonInboxEmail = clearMatonApiKey ? "" : existing?.matonInboxEmail || "";

      if (matonApiKey) {
        const connections = await listMatonGoogleMailConnections(matonApiKey);
        const requestedSelection = Boolean(matonConnectionId || matonInboxEmail);

        if (requestedMatonConnectionId && !connections.some((connection) => connection.connectionId === requestedMatonConnectionId)) {
          return res.status(400).json({ message: "A caixa selecionada nao esta mais ativa na Maton." });
        }

        if (leadEmailSyncEnabled && connections.length > 1 && !requestedSelection) {
          return res.status(400).json({ message: "Escolha qual caixa conectada na Maton deve ser usada." });
        }

        const selectedConnection = findMatonConnection(
          connections,
          matonConnectionId || null,
          matonInboxEmail || null,
        );

        if (leadEmailSyncEnabled && !selectedConnection) {
          return res.status(400).json({ message: "Conecte pelo menos um Gmail ativo na Maton antes de ativar os leads." });
        }

        if (selectedConnection) {
          matonConnectionId = selectedConnection.connectionId;
          matonInboxEmail = selectedConnection.email || matonInboxEmail;
        }
      } else {
        matonConnectionId = "";
        matonInboxEmail = "";
      }

      if (active && catalogSyncEnabled && !xmlFeedUrl) {
        return res.status(400).json({ message: "Informe a URL do feed XML para ativar a Imobiliaria." });
      }

      if (active && leadEmailSyncEnabled && !matonApiKey) {
        return res.status(400).json({ message: "Informe a chave da Maton para ativar a captura de leads por e-mail." });
      }

      if (active && leadEmailSyncEnabled && !matonConnectionId) {
        return res.status(400).json({ message: "Escolha qual caixa conectada na Maton deve ser usada." });
      }

      if (active && leadEmailSyncEnabled && !validatedConnectionId) {
        return res.status(400).json({ message: "Selecione um WhatsApp para receber os leads do e-mail." });
      }

      if (active && leadEmailSyncEnabled && !autoReplyTemplate) {
        return res.status(400).json({ message: "Preencha a mensagem inicial para os leads do e-mail." });
      }

      if (active && leadEmailSyncEnabled && createDealEnabled && (!validatedFunnelId || !resolvedStageId)) {
        return res.status(400).json({ message: "Com Kanban ativo, selecione funil e etapa." });
      }

      const token = existing?.token || generateGrupoOlxToken();
      const payload = {
        userId,
        status: active ? "active" : "inactive",
        token,
        connectionId: validatedConnectionId,
        xmlFeedUrl,
        catalogSyncEnabled,
        leadEmailSyncEnabled,
        matonApiKey,
        matonConnectionId: matonConnectionId || null,
        matonInboxEmail: matonInboxEmail || null,
        matonSenderFilter,
        syncToAi,
        createDealEnabled,
        funnelId: createDealEnabled ? validatedFunnelId : null,
        stageId: createDealEnabled ? resolvedStageId : null,
        aiVariation,
        autoReplyTemplate: autoReplyTemplate || null,
        active,
        updatedAt: new Date(),
      };

      let integration: GrupoOlxIntegration;
      if (existing) {
        const [updated] = await db
          .update(grupoOlxIntegrations)
          .set(payload)
          .where(eq(grupoOlxIntegrations.id, existing.id))
          .returning();
        integration = updated;
      } else {
        const [created] = await db
          .insert(grupoOlxIntegrations)
          .values(payload)
          .returning();
        integration = created;
      }

      res.json(await buildConfigResponse(req, integration));
    } catch (error) {
      console.error("[Imobiliaria] Error saving integration config:", error);
      res.status(500).json({ message: "Erro ao salvar configuracao da Imobiliaria" });
    }
  });

  app.post("/api/integrations/grupo-olx/sync-catalog", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const integration = await getIntegrationForUser(userId);
      if (!integration) {
        return res.status(404).json({ message: "Configuracao da Imobiliaria nao encontrada" });
      }

      if (!canRunGrupoOlxCatalogSync({
        active: integration.active,
        catalogSyncEnabled: integration.catalogSyncEnabled,
        leadEmailSyncEnabled: integration.leadEmailSyncEnabled,
        syncToAi: integration.syncToAi,
        createDealEnabled: integration.createDealEnabled,
      })) {
        return res.status(409).json({ message: "Ative a ferramenta e o XML antes de sincronizar o catalogo." });
      }

      await updateCatalogSyncStatus(integration.id, {
        lastCatalogSyncStatus: "running",
        lastCatalogSyncMessage: "Sincronizando feed XML...",
        updatedAt: new Date(),
      });

      const result = await syncGrupoOlxCatalogFromFeed(integration);

      await updateCatalogSyncStatus(integration.id, {
        lastCatalogSyncAt: new Date(),
        lastCatalogSyncStatus: "success",
        lastCatalogSyncMessage: `Catalogo sincronizado com ${result.totalActive} imoveis ativos.`,
        updatedAt: new Date(),
      });

      const refreshed = await getIntegrationForUser(userId);
      res.json({
        result,
        ...(await buildConfigResponse(req, refreshed)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao sincronizar catalogo";
      const userId = getUserId(req);
      const integration = await getIntegrationForUser(userId);
      if (integration) {
        await updateCatalogSyncStatus(integration.id, {
          lastCatalogSyncAt: new Date(),
          lastCatalogSyncStatus: "error",
          lastCatalogSyncMessage: message,
          updatedAt: new Date(),
        });
      }
      console.error("[Imobiliaria] Error syncing catalog:", error);
      res.status(500).json({ message });
    }
  });

  app.post("/api/integrations/grupo-olx/sync-email-leads", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const integration = await getIntegrationForUser(userId);
      if (!integration) {
        return res.status(404).json({ message: "Configuracao da Imobiliaria nao encontrada" });
      }

      if (!canRunGrupoOlxLeadSync({
        active: integration.active,
        catalogSyncEnabled: integration.catalogSyncEnabled,
        leadEmailSyncEnabled: integration.leadEmailSyncEnabled,
        syncToAi: integration.syncToAi,
        createDealEnabled: integration.createDealEnabled,
      })) {
        return res.status(409).json({ message: "Ative a ferramenta e os leads por e-mail antes de buscar novos contatos." });
      }

      if (!integration.matonApiKey) {
        return res.status(400).json({ message: "Chave da Maton nao configurada" });
      }

      if (!integration.matonConnectionId) {
        return res.status(400).json({ message: "Nenhuma caixa do Gmail foi selecionada na Maton" });
      }

      await updateLeadSyncStatus(integration.id, {
        lastLeadSyncStatus: "running",
        lastLeadSyncMessage: "Buscando leads no Gmail via Maton...",
        updatedAt: new Date(),
      });

      const result = await syncMatonLeadEmailsForIntegration(integration, {
        maxResults: 10,
        newerThanDays: 30,
      });
      const retrySuffix = result.retried.attempted > 0
        ? ` ${result.retried.succeeded} leads com erro foram reenviados com sucesso.`
        : "";

      await updateLeadSyncStatus(integration.id, {
        lastLeadSyncAt: new Date(),
        lastLeadSyncStatus: "success",
        lastLeadSyncMessage: `${result.processed} e-mails processados na sincronizacao.${retrySuffix}`,
        updatedAt: new Date(),
      });

      const refreshed = await getIntegrationForUser(userId);
      res.json({
        processed: result.processed,
        results: result.results,
        retried: result.retried,
        ...(await buildConfigResponse(req, refreshed)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao buscar leads por e-mail";
      const userId = getUserId(req);
      const integration = await getIntegrationForUser(userId);
      if (integration) {
        await updateLeadSyncStatus(integration.id, {
          lastLeadSyncAt: new Date(),
          lastLeadSyncStatus: "error",
          lastLeadSyncMessage: message,
          updatedAt: new Date(),
        });
      }
      console.error("[Imobiliaria] Error syncing email leads:", error);
      res.status(500).json({ message });
    }
  });

  app.post("/api/integrations/grupo-olx/retry-failed-leads", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const integration = await getIntegrationForUser(userId);
      if (!integration) {
        return res.status(404).json({ message: "Configuracao da Imobiliaria nao encontrada" });
      }

      const result = await retryFailedLeadEventsForIntegration(integration, {
        eventId: typeof req.body?.eventId === "string" ? req.body.eventId : undefined,
        limit: typeof req.body?.eventId === "string" ? 1 : 10,
      });

      const refreshed = await getIntegrationForUser(userId);
      res.json({
        retried: result,
        ...(await buildConfigResponse(req, refreshed)),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao reenviar leads com falha";
      console.error("[Imobiliaria] Error retrying failed leads:", error);
      res.status(500).json({ message });
    }
  });

  app.post("/api/integrations/grupo-olx/webhook/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "");
      const [integration] = await db
        .select()
        .from(grupoOlxIntegrations)
        .where(eq(grupoOlxIntegrations.token, token))
        .limit(1);

      if (!integration) {
        return res.status(404).json({ message: "Integracao nao encontrada" });
      }

      if (!integration.active) {
        return res.status(409).json({ message: "Integracao inativa" });
      }

      if (!integration.leadEmailSyncEnabled) {
        return res.status(409).json({ message: "Captura de leads por e-mail desativada" });
      }

      const payloads = extractGrupoOlxLeadPayloads(req.body);
      if (payloads.length === 0) {
        return res.status(400).json({ message: "Payload de lead invalido" });
      }

      const results = [];
      for (const payload of payloads) {
        const normalizedLead = normalizeGrupoOlxLeadPayload(payload);
        const result = await processNormalizedLead(integration, normalizedLead);
        results.push({
          originLeadId: normalizedLead.originLeadId,
          status: result.status,
          eventId: result.eventId,
          conversationId: result.conversationId ?? null,
          dealId: result.dealId ?? null,
          message: result.message ?? null,
        });
      }

      res.status(200).json({
        processed: results.length,
        results,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado";
      if (message === "originLeadId is required") {
        return res.status(400).json({ message: "originLeadId e obrigatorio" });
      }
      console.error("[Imobiliaria] Error processing webhook:", error);
      res.status(500).json({ message: "Erro ao processar lead da Imobiliaria" });
    }
  });
}
