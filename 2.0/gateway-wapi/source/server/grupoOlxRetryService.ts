import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "./db";
import { storage } from "./storage";
import { sendMessage as whatsappSendMessage } from "./whatsapp";
import {
  mergeGrupoOlxLeadWithListingSnapshot,
  renderGrupoOlxAutoReply,
  type GrupoOlxNormalizedLead,
} from "./grupoOlxLeadService";
import {
  grupoOlxIntegrations,
  grupoOlxLeadEvents,
  grupoOlxListings,
  type GrupoOlxIntegration,
  type GrupoOlxLeadEvent,
} from "@shared/schema";

export const GRUPO_OLX_AUTO_RETRY_WINDOW_MS = 15 * 60 * 1000;
const MAX_RETRY_BATCH_SIZE = 10;

export type GrupoOlxRetryTrigger = "initial_send_error" | "connection_open" | "manual";

export type GrupoOlxLeadRetryState = {
  retryable: boolean;
  pendingMessage: string | null;
  autoRetryUntil: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  lastAttemptError: string | null;
  lastSuccessfulSendAt: string | null;
  lastTrigger: GrupoOlxRetryTrigger | null;
};

export type GrupoOlxLeadRetrySummary = GrupoOlxLeadRetryState & {
  autoRetryAllowed: boolean;
};

export type GrupoOlxRetryOutcome = {
  eventId: string;
  status: string;
  retried: boolean;
  conversationId: string | null;
  message: string;
};

type RetryableLeadEvent = Pick<
  GrupoOlxLeadEvent,
  | "id"
  | "status"
  | "conversationId"
  | "contactName"
  | "contactPhone"
  | "contactEmail"
  | "portalSource"
  | "leadType"
  | "clientListingId"
  | "errorMessage"
  | "rawPayload"
  | "createdAt"
> & {
  integrationId: string;
};

function normalizeErrorText(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function isRetryableGrupoOlxSendError(errorMessage: string | null | undefined): boolean {
  const normalized = normalizeErrorText(errorMessage);
  if (!normalized) return false;

  return [
    "whatsapp not connected for this connection",
    "whatsapp not connected",
    "connection closed",
    "socket offline",
    "socket closed",
    "websocket",
    "timed out",
  ].some((needle) => normalized.includes(needle));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRawPayload(rawPayload: unknown): Record<string, unknown> {
  if (!isRecord(rawPayload)) return {};
  return { ...rawPayload };
}

function getRetryState(rawPayload: unknown): GrupoOlxLeadRetryState | null {
  if (!isRecord(rawPayload)) return null;
  const retry = rawPayload.retry;
  if (!isRecord(retry)) return null;

  return {
    retryable: retry.retryable === true,
    pendingMessage: typeof retry.pendingMessage === "string" ? retry.pendingMessage : null,
    autoRetryUntil: typeof retry.autoRetryUntil === "string" ? retry.autoRetryUntil : null,
    attempts: Number.isFinite(Number(retry.attempts)) ? Number(retry.attempts) : 0,
    lastAttemptAt: typeof retry.lastAttemptAt === "string" ? retry.lastAttemptAt : null,
    lastAttemptError: typeof retry.lastAttemptError === "string" ? retry.lastAttemptError : null,
    lastSuccessfulSendAt: typeof retry.lastSuccessfulSendAt === "string" ? retry.lastSuccessfulSendAt : null,
    lastTrigger: typeof retry.lastTrigger === "string" ? (retry.lastTrigger as GrupoOlxRetryTrigger) : null,
  };
}

function buildRetryState(
  pendingMessage: string,
  errorMessage: string | null | undefined,
  trigger: GrupoOlxRetryTrigger,
  now: Date,
  previous?: GrupoOlxLeadRetryState | null,
): GrupoOlxLeadRetryState {
  return {
    retryable: true,
    pendingMessage,
    autoRetryUntil:
      trigger === "initial_send_error"
        ? new Date(now.getTime() + GRUPO_OLX_AUTO_RETRY_WINDOW_MS).toISOString()
        : previous?.autoRetryUntil ?? null,
    attempts: previous?.attempts ?? 0,
    lastAttemptAt: now.toISOString(),
    lastAttemptError: errorMessage || null,
    lastSuccessfulSendAt: previous?.lastSuccessfulSendAt ?? null,
    lastTrigger: trigger,
  };
}

function writeRetryState(rawPayload: unknown, retryState: GrupoOlxLeadRetryState): Record<string, unknown> {
  const nextRawPayload = cloneRawPayload(rawPayload);
  nextRawPayload.retry = retryState;
  return nextRawPayload;
}

export function buildRetrySummary(rawPayload: unknown, now: Date = new Date()): GrupoOlxLeadRetrySummary | null {
  const retryState = getRetryState(rawPayload);
  if (!retryState) return null;

  const autoRetryAllowed =
    Boolean(retryState.retryable) &&
    Boolean(retryState.pendingMessage) &&
    Boolean(retryState.autoRetryUntil) &&
    new Date(retryState.autoRetryUntil as string).getTime() >= now.getTime();

  return {
    ...retryState,
    autoRetryAllowed,
  };
}

export function buildGrupoOlxLeadRetryPayload(
  rawPayload: unknown,
  pendingMessage: string,
  errorMessage: string | null | undefined,
  trigger: GrupoOlxRetryTrigger = "initial_send_error",
  now: Date = new Date(),
): Record<string, unknown> {
  const previous = getRetryState(rawPayload);
  return writeRetryState(rawPayload, buildRetryState(pendingMessage, errorMessage, trigger, now, previous));
}

function buildLeadFromEvent(event: RetryableLeadEvent): GrupoOlxNormalizedLead {
  const rawPayload = cloneRawPayload(event.rawPayload);
  const extracted = isRecord(rawPayload.extracted) ? rawPayload.extracted : {};

  return {
    originLeadId: typeof rawPayload.originLeadId === "string" ? rawPayload.originLeadId : event.id,
    clientListingId:
      typeof extracted.listingCode === "string"
        ? extracted.listingCode
        : event.clientListingId,
    portalSource:
      typeof extracted.portalSource === "string"
        ? extracted.portalSource
        : event.portalSource || "Grupo OLX",
    leadType:
      typeof extracted.leadChannel === "string"
        ? extracted.leadChannel
        : event.leadType || "EMAIL_LEAD",
    name:
      typeof extracted.contactName === "string"
        ? extracted.contactName
        : event.contactName,
    phone:
      typeof extracted.contactPhone === "string"
        ? String(extracted.contactPhone).replace(/\D/g, "")
        : event.contactPhone,
    email:
      typeof extracted.contactEmail === "string"
        ? extracted.contactEmail
        : event.contactEmail,
    message:
      typeof extracted.interestSummary === "string"
        ? extracted.interestSummary
        : typeof rawPayload.snippet === "string"
          ? rawPayload.snippet
          : null,
    transactionType:
      typeof extracted.transactionType === "string"
        ? extracted.transactionType
        : null,
    listingTitle:
      typeof extracted.listingTitle === "string"
        ? extracted.listingTitle
        : null,
    listingUrl:
      typeof extracted.listingUrl === "string"
        ? extracted.listingUrl
        : null,
    price:
      typeof extracted.price === "string"
        ? extracted.price
        : null,
    neighborhood:
      typeof extracted.neighborhood === "string"
        ? extracted.neighborhood
        : null,
    city:
      typeof extracted.city === "string"
        ? extracted.city
        : null,
    rawPayload,
  };
}

async function buildLeadWithCatalogContext(
  event: RetryableLeadEvent,
  integration: GrupoOlxIntegration,
): Promise<GrupoOlxNormalizedLead> {
  const lead = buildLeadFromEvent(event);
  if (!lead.clientListingId) return lead;

  const [listing] = await db
    .select({
      clientListingId: grupoOlxListings.listingCode,
      listingTitle: grupoOlxListings.title,
      listingUrl: grupoOlxListings.detailUrl,
      price: grupoOlxListings.price,
      neighborhood: grupoOlxListings.neighborhood,
      city: grupoOlxListings.city,
      transactionType: grupoOlxListings.transactionType,
    })
    .from(grupoOlxListings)
    .where(
      and(
        eq(grupoOlxListings.integrationId, integration.id),
        eq(grupoOlxListings.isActive, true),
        or(
          eq(grupoOlxListings.listingCode, lead.clientListingId),
          eq(grupoOlxListings.externalListingId, lead.clientListingId),
        ),
      ),
    )
    .limit(1);

  return mergeGrupoOlxLeadWithListingSnapshot(lead, listing ?? null);
}

async function resolvePendingMessage(event: RetryableLeadEvent, integration: GrupoOlxIntegration): Promise<string | null> {
  const retryState = getRetryState(event.rawPayload);
  if (integration.autoReplyTemplate) {
    const hydratedLead = await buildLeadWithCatalogContext(event, integration);
    const rebuiltMessage = renderGrupoOlxAutoReply(integration.autoReplyTemplate, hydratedLead);
    if (rebuiltMessage) {
      return rebuiltMessage;
    }
  }

  return retryState?.pendingMessage ?? null;
}

async function updateLeadEventRetryState(
  eventId: string,
  patch: {
    status: string;
    errorMessage: string | null;
    rawPayload: Record<string, unknown>;
    processedAt?: Date;
  },
): Promise<void> {
  await db
    .update(grupoOlxLeadEvents)
    .set({
      status: patch.status,
      errorMessage: patch.errorMessage,
      rawPayload: patch.rawPayload,
      processedAt: patch.processedAt ?? new Date(),
    })
    .where(eq(grupoOlxLeadEvents.id, eventId));
}

async function getLeadEventForUser(userId: string, eventId: string): Promise<{
  integration: GrupoOlxIntegration;
  event: RetryableLeadEvent;
} | null> {
  const rows = await db
    .select({
      integration: grupoOlxIntegrations,
      event: grupoOlxLeadEvents,
    })
    .from(grupoOlxLeadEvents)
    .innerJoin(grupoOlxIntegrations, eq(grupoOlxLeadEvents.integrationId, grupoOlxIntegrations.id))
    .where(and(eq(grupoOlxLeadEvents.id, eventId), eq(grupoOlxIntegrations.userId, userId)))
    .limit(1);

  if (!rows[0]) return null;

  return {
    integration: rows[0].integration,
    event: rows[0].event,
  };
}

export async function retryGrupoOlxLeadEventForUser(
  userId: string,
  eventId: string,
  trigger: GrupoOlxRetryTrigger = "manual",
): Promise<GrupoOlxRetryOutcome> {
  const loaded = await getLeadEventForUser(userId, eventId);
  if (!loaded) {
    throw new Error("Lead nao encontrado");
  }

  const { integration, event } = loaded;
  if (!event.conversationId) {
    throw new Error("Este lead ainda nao possui conversa para reenviar a mensagem");
  }

  const pendingMessage = await resolvePendingMessage(event, integration);
  if (!pendingMessage) {
    throw new Error("Nao foi possivel reconstruir a mensagem inicial desse lead");
  }

  const now = new Date();
  const previousRetry = getRetryState(event.rawPayload);

  try {
    await whatsappSendMessage(userId, event.conversationId, pendingMessage, {
      isFromAgent: true,
      source: "agent",
    });

    const successPayload = writeRetryState(event.rawPayload, {
      retryable: true,
      pendingMessage,
      autoRetryUntil: previousRetry?.autoRetryUntil ?? null,
      attempts: (previousRetry?.attempts ?? 0) + 1,
      lastAttemptAt: now.toISOString(),
      lastAttemptError: null,
      lastSuccessfulSendAt: now.toISOString(),
      lastTrigger: trigger,
    });

    await updateLeadEventRetryState(event.id, {
      status: "processed",
      errorMessage: null,
      rawPayload: successPayload,
      processedAt: now,
    });

    return {
      eventId: event.id,
      status: "processed",
      retried: true,
      conversationId: event.conversationId,
      message: "Mensagem reenviada com sucesso",
    };
  } catch (error) {
    const sendError = error instanceof Error ? error.message : "Erro desconhecido ao reenviar lead";
    const retryable = isRetryableGrupoOlxSendError(sendError);
    const retryPayload = writeRetryState(event.rawPayload, {
      retryable,
      pendingMessage,
      autoRetryUntil: previousRetry?.autoRetryUntil ?? null,
      attempts: (previousRetry?.attempts ?? 0) + 1,
      lastAttemptAt: now.toISOString(),
      lastAttemptError: sendError,
      lastSuccessfulSendAt: previousRetry?.lastSuccessfulSendAt ?? null,
      lastTrigger: trigger,
    });

    await updateLeadEventRetryState(event.id, {
      status: retryable ? "pending_retry" : "processed_with_send_error",
      errorMessage: sendError,
      rawPayload: retryPayload,
      processedAt: now,
    });

    return {
      eventId: event.id,
      status: retryable ? "pending_retry" : "processed_with_send_error",
      retried: false,
      conversationId: event.conversationId,
      message: sendError,
    };
  }
}

async function listPendingRetryEventsForConnection(connectionId: string): Promise<Array<{
  integration: GrupoOlxIntegration;
  event: RetryableLeadEvent;
}>> {
  const integrations = await db
    .select()
    .from(grupoOlxIntegrations)
    .where(and(eq(grupoOlxIntegrations.connectionId, connectionId), eq(grupoOlxIntegrations.active, true)))
    .limit(10);

  if (integrations.length === 0) return [];

  const events = await db
    .select()
    .from(grupoOlxLeadEvents)
    .where(
      and(
        inArray(
          grupoOlxLeadEvents.integrationId,
          integrations.map((integration) => integration.id),
        ),
        eq(grupoOlxLeadEvents.status, "pending_retry"),
      ),
    )
    .orderBy(desc(grupoOlxLeadEvents.createdAt))
    .limit(MAX_RETRY_BATCH_SIZE);

  const integrationById = new Map(integrations.map((integration) => [integration.id, integration]));

  return events
    .map((event) => {
      const integration = integrationById.get(event.integrationId);
      if (!integration) return null;
      return { integration, event };
    })
    .filter((entry): entry is { integration: GrupoOlxIntegration; event: RetryableLeadEvent } => Boolean(entry));
}

export async function retryPendingGrupoOlxLeadEventsForConnection(
  connectionId: string,
  trigger: GrupoOlxRetryTrigger = "connection_open",
): Promise<{ retried: number; skipped: number; outcomes: GrupoOlxRetryOutcome[] }> {
  const entries = await listPendingRetryEventsForConnection(connectionId);
  if (entries.length === 0) {
    return { retried: 0, skipped: 0, outcomes: [] };
  }

  const outcomes: GrupoOlxRetryOutcome[] = [];
  let skipped = 0;

  for (const { integration, event } of entries) {
    const retrySummary = buildRetrySummary(event.rawPayload);
    if (!retrySummary?.pendingMessage) {
      skipped += 1;
      continue;
    }

    if (trigger === "connection_open" && !retrySummary.autoRetryAllowed) {
      skipped += 1;
      continue;
    }

    const outcome = await retryGrupoOlxLeadEventForUser(integration.userId, event.id, trigger);
    outcomes.push(outcome);
  }

  return {
    retried: outcomes.filter((outcome) => outcome.retried).length,
    skipped,
    outcomes,
  };
}
