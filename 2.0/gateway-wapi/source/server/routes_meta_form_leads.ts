import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  googleSheetLeadEvents,
  googleSheetLeadIntegrations,
  type GoogleSheetLeadIntegration,
} from "@shared/schema";
import { db, pool } from "./db";
import {
  createMetaFormGoogleAuthUrl,
  disconnectMetaFormGoogle,
  getMetaFormGoogleStatus,
  handleMetaFormGoogleCallback,
  listGoogleSpreadsheetFilesForUser,
  resolveGoogleSpreadsheetForUser,
} from "./metaFormGoogleDriveService";
import {
  assertMetaLeadFormsBetaAccess,
  getMetaLeadFormsBetaStatus,
  getMetaLeadFormsRequestAccessOptions,
} from "./metaLeadFormsAccess";
import {
  DEFAULT_ANTI_BAN_DELAY_ENABLED,
  DEFAULT_ANTI_BAN_DELAY_MAX_MINUTES,
  DEFAULT_ANTI_BAN_DELAY_MIN_MINUTES,
  DEFAULT_POLL_INTERVAL_MINUTES,
  DEFAULT_SEND_RETRY_ATTEMPTS,
  MAX_ANTI_BAN_DELAY_MINUTES,
  MAX_SEND_RETRY_ATTEMPTS,
  MIN_ANTI_BAN_DELAY_MINUTES,
  MIN_SEND_RETRY_ATTEMPTS,
  RECENT_CONVERSATION_WINDOW_HOURS,
  ensureMetaLeadGoogleSheetsTables,
  runMetaLeadGoogleSheetsSyncForIntegrationId,
} from "./metaLeadGoogleSheetsScheduler";
import { getUserId, isAuthenticated } from "./supabaseAuth";
import { storage } from "./storage";

const integrationInputSchema = z.object({
  integrationId: z.string().trim().optional().nullable(),
  sheetId: z.string().trim().min(1, "Selecione uma planilha"),
  sheetName: z.string().trim().optional().nullable(),
  sheetGid: z.string().trim().optional().nullable(),
  connectionId: z.string().trim().min(1, "Selecione a conexao do WhatsApp"),
  pollIntervalMinutes: z.coerce.number().int().min(1).max(60).default(5),
  sendRetryAttempts: z.coerce.number().int().min(MIN_SEND_RETRY_ATTEMPTS).max(MAX_SEND_RETRY_ATTEMPTS).default(
    DEFAULT_SEND_RETRY_ATTEMPTS,
  ),
  antiBanDelayEnabled: z.boolean().default(DEFAULT_ANTI_BAN_DELAY_ENABLED),
  antiBanDelayMinMinutes: z.coerce.number()
    .int()
    .min(MIN_ANTI_BAN_DELAY_MINUTES)
    .max(MAX_ANTI_BAN_DELAY_MINUTES)
    .default(DEFAULT_ANTI_BAN_DELAY_MIN_MINUTES),
  antiBanDelayMaxMinutes: z.coerce.number()
    .int()
    .min(MIN_ANTI_BAN_DELAY_MINUTES)
    .max(MAX_ANTI_BAN_DELAY_MINUTES)
    .default(DEFAULT_ANTI_BAN_DELAY_MAX_MINUTES),
  messageTemplate: z.string().trim().min(1, "Informe a mensagem inicial"),
  active: z.boolean().default(true),
});
const DEFAULT_EVENTS_PAGE_SIZE = 10;
const MAX_EVENTS_PAGE_SIZE = 50;
type MetaFormGoogleSheetIntegration = GoogleSheetLeadIntegration & {
  googleAccountEmail?: string | null;
  sendRetryAttempts?: number | null;
  antiBanDelayEnabled?: boolean | null;
  antiBanDelayMinMinutes?: number | null;
  antiBanDelayMaxMinutes?: number | null;
};

type EventSummary = {
  total: number;
  sent: number;
  skipped: number;
  attention: number;
  recentConversationSkips: number;
};

function buildEmptyEventSummary(): EventSummary {
  return {
    total: 0,
    sent: 0,
    skipped: 0,
    attention: 0,
    recentConversationSkips: 0,
  };
}

function buildEmptyEventBundle(page: number, pageSize: number) {
  return {
    events: [],
    eventPagination: {
      page,
      pageSize,
      total: 0,
      totalPages: 1,
    },
    eventSummary: buildEmptyEventSummary(),
  };
}

function normalizeValue(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeTemplateInput(value: string | null | undefined): string {
  return String(value || "")
    .split("\\r\\n")
    .join("\n")
    .split("\\n")
    .join("\n")
    .trim();
}

function maskWhatsapp(value: string | null | undefined): string | null {
  const digits = String(value || "").trim();
  if (!digits) {
    return null;
  }

  if (digits.length <= 4) {
    return digits;
  }

  return `${digits.slice(0, 4)}***${digits.slice(-4)}`;
}

function parsePaginationValue(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRequestOrigin(req: Request): string {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || req.get("host") || "agentezap.online";
  return `${protocol}://${host}`;
}

function getMetaFormGoogleStateSigningSecret(): string {
  return process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "meta-form-google-state";
}

function decodeMetaFormGoogleStateForUi(rawState: string | null | undefined) {
  const value = normalizeValue(rawState);
  if (!value) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [body, providedSignature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", getMetaFormGoogleStateSigningSecret())
    .update(body)
    .digest("base64url");

  if (providedSignature !== expectedSignature) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function decodeMetaFormGoogleStateHint(rawState: string | null | undefined) {
  const value = normalizeValue(rawState);
  if (!value) {
    return null;
  }

  const body = value.split(".")[0];
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function buildMetaFormGooglePopupHtml(params: {
  success: boolean;
  message?: string | null;
  returnTo: string;
  appOrigin: string;
  googleEmail?: string | null;
}) {
  const payload = {
    source: "meta-form-google-oauth",
    success: params.success,
    message: normalizeValue(params.message || "") || null,
    returnTo: params.returnTo,
    googleEmail: normalizeValue(params.googleEmail || "") || null,
  };
  const redirectUrl = params.success
    ? `${params.returnTo}?googleConnected=1`
    : `${params.returnTo}?googleError=${encodeURIComponent(payload.message || "Erro na conexao Google")}`;

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Conexão Google</title>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 24px; color: #0f172a;">
    <p>${params.success ? "Conexao com Google concluida. Voce ja pode voltar ao AgenteZap." : "Nao foi possivel concluir a conexao com Google."}</p>
    <script>
      (function () {
        const payload = ${JSON.stringify(payload)};
        const targetOrigin = ${JSON.stringify(params.appOrigin)};
        const redirectUrl = ${JSON.stringify(redirectUrl)};

        try {
          if (window.opener && typeof window.opener.postMessage === "function") {
            window.opener.postMessage(payload, targetOrigin);
            window.close();
            setTimeout(function () {
              window.location.replace(redirectUrl);
            }, 400);
            return;
          }
        } catch (error) {
          console.error(error);
        }

        window.location.replace(redirectUrl);
      })();
    </script>
  </body>
</html>`;
}

async function listIntegrationsForUser(userId: string) {
  const result = await pool.query<MetaFormGoogleSheetIntegration>(
    `
      SELECT
        id,
        sheet_id AS "sheetId",
        sheet_name AS "sheetName",
        sheet_gid AS "sheetGid",
        google_account_email AS "googleAccountEmail",
        maton_connection_id AS "matonConnectionId",
        target_whatsapp_number AS "targetWhatsappNumber",
        user_id AS "userId",
        connection_id AS "connectionId",
        poll_interval_minutes AS "pollIntervalMinutes",
        send_retry_attempts AS "sendRetryAttempts",
        anti_ban_delay_enabled AS "antiBanDelayEnabled",
        anti_ban_delay_min_minutes AS "antiBanDelayMinMinutes",
        anti_ban_delay_max_minutes AS "antiBanDelayMaxMinutes",
        message_template AS "messageTemplate",
        active,
        last_sync_at AS "lastSyncAt",
        last_sync_status AS "lastSyncStatus",
        last_sync_message AS "lastSyncMessage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM google_sheet_lead_integrations
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    `,
    [userId],
  );

  return result.rows;
}

function normalizeGoogleAccountEmail(value: string | null | undefined): string | null {
  const normalized = normalizeValue(value);
  return normalized ? normalized.toLowerCase() : null;
}

async function bindIntegrationToGoogleAccount(
  integration: MetaFormGoogleSheetIntegration,
  googleAccountEmail: string,
): Promise<MetaFormGoogleSheetIntegration> {
  const result = await pool.query<MetaFormGoogleSheetIntegration>(
    `
      UPDATE google_sheet_lead_integrations
      SET
        google_account_email = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        sheet_id AS "sheetId",
        sheet_name AS "sheetName",
        sheet_gid AS "sheetGid",
        google_account_email AS "googleAccountEmail",
        maton_connection_id AS "matonConnectionId",
        target_whatsapp_number AS "targetWhatsappNumber",
        user_id AS "userId",
        connection_id AS "connectionId",
        poll_interval_minutes AS "pollIntervalMinutes",
        send_retry_attempts AS "sendRetryAttempts",
        anti_ban_delay_enabled AS "antiBanDelayEnabled",
        anti_ban_delay_min_minutes AS "antiBanDelayMinMinutes",
        anti_ban_delay_max_minutes AS "antiBanDelayMaxMinutes",
        message_template AS "messageTemplate",
        active,
        last_sync_at AS "lastSyncAt",
        last_sync_status AS "lastSyncStatus",
        last_sync_message AS "lastSyncMessage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [integration.id, googleAccountEmail],
  );

  return result.rows[0] || { ...integration, googleAccountEmail };
}

async function filterIntegrationsForCurrentGoogleAccount(params: {
  userId: string;
  origin: string;
  integrations: MetaFormGoogleSheetIntegration[];
  googleStatus: Awaited<ReturnType<typeof getMetaFormGoogleStatus>>;
}) {
  const currentGoogleEmail = normalizeGoogleAccountEmail(params.googleStatus.connectedEmail);
  if (!params.googleStatus.connected || !currentGoogleEmail) {
    return [] as GoogleSheetLeadIntegration[];
  }

  const visibleIntegrations: MetaFormGoogleSheetIntegration[] = [];

  for (const integration of params.integrations) {
    const boundGoogleEmail = normalizeGoogleAccountEmail(integration.googleAccountEmail);
    if (boundGoogleEmail && boundGoogleEmail === currentGoogleEmail) {
      visibleIntegrations.push(integration);
    }
  }

  return visibleIntegrations;
}

async function getIntegrationByIdForUser(userId: string, integrationId: string) {
  const result = await pool.query<MetaFormGoogleSheetIntegration>(
    `
      SELECT
        id,
        sheet_id AS "sheetId",
        sheet_name AS "sheetName",
        sheet_gid AS "sheetGid",
        google_account_email AS "googleAccountEmail",
        maton_connection_id AS "matonConnectionId",
        target_whatsapp_number AS "targetWhatsappNumber",
        user_id AS "userId",
        connection_id AS "connectionId",
        poll_interval_minutes AS "pollIntervalMinutes",
        send_retry_attempts AS "sendRetryAttempts",
        anti_ban_delay_enabled AS "antiBanDelayEnabled",
        anti_ban_delay_min_minutes AS "antiBanDelayMinMinutes",
        anti_ban_delay_max_minutes AS "antiBanDelayMaxMinutes",
        message_template AS "messageTemplate",
        active,
        last_sync_at AS "lastSyncAt",
        last_sync_status AS "lastSyncStatus",
        last_sync_message AS "lastSyncMessage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM google_sheet_lead_integrations
      WHERE user_id = $1 AND id = $2
      LIMIT 1
    `,
    [userId, integrationId],
  );

  return result.rows[0] || null;
}

async function getIntegrationBySheetForUser(userId: string, sheetId: string, sheetName: string) {
  const result = await pool.query<MetaFormGoogleSheetIntegration>(
    `
      SELECT
        id,
        sheet_id AS "sheetId",
        sheet_name AS "sheetName",
        sheet_gid AS "sheetGid",
        google_account_email AS "googleAccountEmail",
        maton_connection_id AS "matonConnectionId",
        target_whatsapp_number AS "targetWhatsappNumber",
        user_id AS "userId",
        connection_id AS "connectionId",
        poll_interval_minutes AS "pollIntervalMinutes",
        send_retry_attempts AS "sendRetryAttempts",
        anti_ban_delay_enabled AS "antiBanDelayEnabled",
        anti_ban_delay_min_minutes AS "antiBanDelayMinMinutes",
        anti_ban_delay_max_minutes AS "antiBanDelayMaxMinutes",
        message_template AS "messageTemplate",
        active,
        last_sync_at AS "lastSyncAt",
        last_sync_status AS "lastSyncStatus",
        last_sync_message AS "lastSyncMessage",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM google_sheet_lead_integrations
      WHERE user_id = $1 AND sheet_id = $2 AND sheet_name = $3
      LIMIT 1
    `,
    [userId, sheetId, sheetName],
  );

  return result.rows[0] || null;
}

async function listEventsForIntegration(integrationId: string, page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(MAX_EVENTS_PAGE_SIZE, Math.max(1, pageSize));
  const offset = (safePage - 1) * safePageSize;

  const [events, totalRows, statusRows] = await Promise.all([
    db
      .select()
      .from(googleSheetLeadEvents)
      .where(eq(googleSheetLeadEvents.integrationId, integrationId))
      .orderBy(desc(googleSheetLeadEvents.createdAt))
      .limit(safePageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(googleSheetLeadEvents)
      .where(eq(googleSheetLeadEvents.integrationId, integrationId)),
    db
      .select({
        status: googleSheetLeadEvents.status,
        total: sql<number>`count(*)::int`,
      })
      .from(googleSheetLeadEvents)
      .where(eq(googleSheetLeadEvents.integrationId, integrationId))
      .groupBy(googleSheetLeadEvents.status),
  ]);

  const total = totalRows[0]?.total ?? 0;
  const counts = new Map(statusRows.map((row) => [row.status || "unknown", row.total ?? 0]));

  return {
    events,
    eventPagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    },
    eventSummary: {
      total,
      sent: counts.get("sent") ?? 0,
      skipped: Array.from(counts.entries())
        .filter(([status]) => status.startsWith("skipped_"))
        .reduce((acc, [, amount]) => acc + amount, 0),
      attention: (counts.get("failed") ?? 0) + (counts.get("error") ?? 0),
      recentConversationSkips: counts.get("skipped_recent_conversation") ?? 0,
    },
  };
}

async function listIntegrationSummaries(integrationIds: string[]) {
  if (!integrationIds.length) {
    return new Map<string, EventSummary>();
  }

  const rows = await db
    .select({
      integrationId: googleSheetLeadEvents.integrationId,
      status: googleSheetLeadEvents.status,
      total: sql<number>`count(*)::int`,
    })
    .from(googleSheetLeadEvents)
    .where(inArray(googleSheetLeadEvents.integrationId, integrationIds))
    .groupBy(googleSheetLeadEvents.integrationId, googleSheetLeadEvents.status);

  const summaryMap = new Map<string, EventSummary>();

  for (const integrationId of integrationIds) {
    summaryMap.set(integrationId, buildEmptyEventSummary());
  }

  for (const row of rows) {
    const summary = summaryMap.get(row.integrationId) || buildEmptyEventSummary();
    const total = row.total ?? 0;

    summary.total += total;
    if (row.status === "sent") {
      summary.sent += total;
    }
    if (String(row.status || "").startsWith("skipped_")) {
      summary.skipped += total;
    }
    if (row.status === "failed" || row.status === "error") {
      summary.attention += total;
    }
    if (row.status === "skipped_recent_conversation") {
      summary.recentConversationSkips += total;
    }

    summaryMap.set(row.integrationId, summary);
  }

  return summaryMap;
}

async function buildMetaFormResponse(
  userId: string,
  integrations: MetaFormGoogleSheetIntegration[],
  options?: {
    eventPage?: number;
    eventPageSize?: number;
    origin?: string;
    access?: ReturnType<typeof getMetaLeadFormsRequestAccessOptions>;
  },
  selectedIntegrationId?: string | null,
) {
  const eventPage = parsePaginationValue(options?.eventPage, 1);
  const eventPageSize = parsePaginationValue(options?.eventPageSize, DEFAULT_EVENTS_PAGE_SIZE);
  const googleStatus = await getMetaFormGoogleStatus(userId);
  const visibleIntegrations = await filterIntegrationsForCurrentGoogleAccount({
    userId,
    origin: normalizeValue(options?.origin) || "https://agentezap.online",
    integrations,
    googleStatus,
  });
  const selectedIntegration =
    visibleIntegrations.find((integration) => integration.id === selectedIntegrationId) ||
    visibleIntegrations[0] ||
    null;
  const integrationSummaries = await listIntegrationSummaries(visibleIntegrations.map((integration) => integration.id));

  const [connections, betaStatus, user, eventBundle] = await Promise.all([
    storage.getConnectionsByUserId(userId),
    getMetaLeadFormsBetaStatus(userId, options?.access),
    storage.getUser(userId),
    selectedIntegration
      ? listEventsForIntegration(selectedIntegration.id, eventPage, eventPageSize)
      : Promise.resolve(buildEmptyEventBundle(eventPage, eventPageSize)),
  ]);

  const overallSummary = visibleIntegrations.reduce((acc, integration) => {
    const summary = integrationSummaries.get(integration.id) || buildEmptyEventSummary();
    acc.total += summary.total;
    acc.sent += summary.sent;
    acc.skipped += summary.skipped;
    acc.attention += summary.attention;
    acc.recentConversationSkips += summary.recentConversationSkips;
    return acc;
  }, buildEmptyEventSummary());

  return {
    beta: betaStatus,
    selectedIntegrationId: selectedIntegration?.id || null,
    integration: selectedIntegration,
    integrations: visibleIntegrations.map((integration) => ({
      ...integration,
      summary: integrationSummaries.get(integration.id) || buildEmptyEventSummary(),
    })),
    events: eventBundle.events,
    eventPagination: eventBundle.eventPagination,
    eventSummary: eventBundle.eventSummary,
    overallSummary,
    automationRules: {
      recentConversationWindowHours: RECENT_CONVERSATION_WINDOW_HOURS,
      defaultPollIntervalMinutes: DEFAULT_POLL_INTERVAL_MINUTES,
      defaultSendRetryAttempts: DEFAULT_SEND_RETRY_ATTEMPTS,
      defaultAntiBanDelayEnabled: DEFAULT_ANTI_BAN_DELAY_ENABLED,
      defaultAntiBanDelayMinMinutes: DEFAULT_ANTI_BAN_DELAY_MIN_MINUTES,
      defaultAntiBanDelayMaxMinutes: DEFAULT_ANTI_BAN_DELAY_MAX_MINUTES,
      minAntiBanDelayMinutes: MIN_ANTI_BAN_DELAY_MINUTES,
      maxAntiBanDelayMinutes: MAX_ANTI_BAN_DELAY_MINUTES,
    },
    connections: connections.map((connection) => ({
      id: connection.id,
      connectionName: connection.connectionName || "Sem nome",
      phoneNumber: connection.phoneNumber,
      phoneNumberMasked: maskWhatsapp(connection.phoneNumber),
      isConnected: connection.isConnected,
      provider: connection.provider,
      providerStatus: connection.providerStatus,
    })),
    google: googleStatus,
    user: {
      id: user?.id || userId,
      email: user?.email || null,
    },
  };
}

export function registerMetaFormLeadRoutes(app: Express) {
  app.get("/api/meta-formulario/beta", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const status = await getMetaLeadFormsBetaStatus(userId, getMetaLeadFormsRequestAccessOptions(req));
      return res.json(status);
    } catch (error) {
      console.error("[Meta Form] Falha ao consultar beta:", error);
      return res.status(500).json({ message: "Erro ao consultar acesso do Formulario Meta" });
    }
  });

  app.get("/api/meta-formulario", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const access = getMetaLeadFormsRequestAccessOptions(req);
      await assertMetaLeadFormsBetaAccess(userId, access);
      await ensureMetaLeadGoogleSheetsTables();

      const integrations = await listIntegrationsForUser(userId);
      return res.json(
        await buildMetaFormResponse(
          userId,
          integrations,
          {
            eventPage: req.query.page,
            eventPageSize: req.query.pageSize,
            origin: getRequestOrigin(req),
            access,
          },
          normalizeValue(String(req.query.integrationId || "")),
        ),
      );
    } catch (error: any) {
      console.error("[Meta Form] Falha ao carregar configuracao:", error);
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao carregar configuracao do Formulario Meta",
      });
    }
  });

  app.post("/api/meta-formulario/google-config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      await assertMetaLeadFormsBetaAccess(userId, getMetaLeadFormsRequestAccessOptions(req));
      await ensureMetaLeadGoogleSheetsTables();
      return res.status(409).json({
        message:
          "Este modulo agora usa a credencial central do aplicativo. Atualize a pagina e use apenas o botao Conectar com Google.",
      });
    } catch (error: any) {
      console.error("[Meta Form] Falha ao bloquear configuracao Google legada:", error);
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao validar configuracao Google do Formulario Meta",
      });
    }
  });

  app.post("/api/meta-formulario/google/connect", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      await assertMetaLeadFormsBetaAccess(userId, getMetaLeadFormsRequestAccessOptions(req));
      await ensureMetaLeadGoogleSheetsTables();

      const origin = getRequestOrigin(req);
      const url = await createMetaFormGoogleAuthUrl(userId, origin, {
        returnTo: "/meta-formulario",
        mode: normalizeValue(String((req as any).body?.mode || "")) || "redirect",
        appOrigin: origin,
      });
      return res.json({ url });
    } catch (error: any) {
      console.error("[Meta Form] Falha ao iniciar conexao Google Drive:", error);
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao iniciar conexao com Google Drive",
      });
    }
  });

  app.get("/api/meta-formulario/google/callback", async (req: Request, res: Response) => {
    try {
      await ensureMetaLeadGoogleSheetsTables();

      const code = normalizeValue(String(req.query.code || ""));
      const state = normalizeValue(String(req.query.state || ""));
      if (!code || !state) {
        return res.status(400).send("Parametros do callback Google invalidos.");
      }

      const result = await handleMetaFormGoogleCallback({
        code,
        state,
        origin: getRequestOrigin(req),
      });

      return res
        .status(200)
        .type("html")
        .send(
          buildMetaFormGooglePopupHtml({
            success: true,
            returnTo: result.returnTo,
            appOrigin: result.appOrigin,
            googleEmail: result.googleEmail,
          }),
        );
    } catch (error: any) {
      console.error("[Meta Form] Falha no callback Google:", error);
      const decodedState =
        decodeMetaFormGoogleStateForUi(String(req.query.state || "")) ||
        decodeMetaFormGoogleStateHint(String(req.query.state || ""));
      return res
        .status(200)
        .type("html")
        .send(
          buildMetaFormGooglePopupHtml({
            success: false,
            message: error?.message || "Erro na conexao Google",
            returnTo: normalizeValue(decodedState?.returnTo) || "/meta-formulario",
            appOrigin: normalizeValue(decodedState?.appOrigin) || getRequestOrigin(req),
          }),
        );
    }
  });

  app.post("/api/meta-formulario/google/disconnect", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      await assertMetaLeadFormsBetaAccess(userId, getMetaLeadFormsRequestAccessOptions(req));
      await ensureMetaLeadGoogleSheetsTables();

      await disconnectMetaFormGoogle(userId);
      const integrations = await listIntegrationsForUser(userId);
      return res.json(
        await buildMetaFormResponse(
          userId,
          integrations,
          {
            eventPage: req.query.page,
            eventPageSize: req.query.pageSize,
            origin: getRequestOrigin(req),
          },
          normalizeValue(String(req.query.integrationId || "")),
        ),
      );
    } catch (error: any) {
      console.error("[Meta Form] Falha ao desconectar Google:", error);
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao desconectar Google Drive",
      });
    }
  });

  app.get("/api/meta-formulario/spreadsheets/search", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      await assertMetaLeadFormsBetaAccess(userId, getMetaLeadFormsRequestAccessOptions(req));
      await ensureMetaLeadGoogleSheetsTables();

      const result = await listGoogleSpreadsheetFilesForUser({
        userId,
        origin: getRequestOrigin(req),
        query: normalizeValue(String(req.query.q || "")),
        pageSize: 20,
      });

      return res.json(result);
    } catch (error: any) {
      console.error("[Meta Form] Falha ao buscar planilhas Google:", error);
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao buscar planilhas do Google Drive",
      });
    }
  });

  app.get("/api/meta-formulario/spreadsheets/resolve", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      await assertMetaLeadFormsBetaAccess(userId, getMetaLeadFormsRequestAccessOptions(req));
      await ensureMetaLeadGoogleSheetsTables();

      const spreadsheetId = normalizeValue(String(req.query.spreadsheetId || ""));
      if (!spreadsheetId) {
        return res.status(400).json({ message: "Selecione uma planilha para continuar" });
      }

      const spreadsheet = await resolveGoogleSpreadsheetForUser({
        userId,
        origin: getRequestOrigin(req),
        spreadsheetId,
      });

      return res.json(spreadsheet);
    } catch (error: any) {
      console.error("[Meta Form] Falha ao resolver planilha Google:", error);
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao carregar os detalhes da planilha",
      });
    }
  });

  app.post("/api/meta-formulario", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const access = getMetaLeadFormsRequestAccessOptions(req);
      await assertMetaLeadFormsBetaAccess(userId, access);
      await ensureMetaLeadGoogleSheetsTables();

      const parsed = integrationInputSchema.safeParse((req as any).body || {});
      if (!parsed.success) {
        return res.status(400).json({
          message: "Dados invalidos para salvar o Formulario Meta",
          issues: parsed.error.flatten(),
        });
      }

      const input = parsed.data;
      const requestedIntegrationId = normalizeValue(input.integrationId);
      const connectionId = normalizeValue(input.connectionId);
      const googleStatus = await getMetaFormGoogleStatus(userId);
      const currentGoogleEmail = normalizeGoogleAccountEmail(googleStatus.connectedEmail);
      const connection = connectionId ? await storage.getConnectionById(connectionId) : null;

      if (!connectionId || !connection || connection.userId !== userId) {
        return res.status(404).json({ message: "Conexao do WhatsApp nao encontrada para esta conta" });
      }

      if (!googleStatus.connected || !currentGoogleEmail) {
        return res.status(409).json({
          message: "Conecte a conta Google que tem acesso a esta planilha antes de salvar.",
        });
      }

      const resolvedSheet = await resolveGoogleSpreadsheetForUser({
        userId,
        origin: getRequestOrigin(req),
        spreadsheetId: input.sheetId,
      });

      const sheetName = normalizeValue(input.sheetName) || resolvedSheet?.defaultSheetName || "Página1";
      const sheetGid = normalizeValue(input.sheetGid) || resolvedSheet?.defaultSheetGid || null;
      const existing =
        (requestedIntegrationId
          ? await getIntegrationByIdForUser(userId, requestedIntegrationId)
          : await getIntegrationBySheetForUser(userId, input.sheetId, sheetName)) || null;
      const existingGoogleEmail = normalizeGoogleAccountEmail(existing?.googleAccountEmail);

      if (requestedIntegrationId && existingGoogleEmail && existingGoogleEmail !== currentGoogleEmail) {
        return res.status(409).json({
          message: "Esta planilha esta vinculada a outra conta Google. Busque e salve a planilha pela conta conectada agora.",
        });
      }

      const targetWhatsappNumber = normalizeValue(connection.phoneNumber) || normalizeValue(existing?.targetWhatsappNumber);

      if (!targetWhatsappNumber) {
        return res.status(400).json({
          message: "A conexao selecionada precisa ter um numero configurado para receber os leads",
        });
      }

      const patch = {
        userId,
        sheetId: input.sheetId,
        sheetName,
        sheetGid,
        matonConnectionId: null,
        targetWhatsappNumber,
        connectionId,
        pollIntervalMinutes: input.pollIntervalMinutes,
        sendRetryAttempts: input.sendRetryAttempts,
        antiBanDelayEnabled: input.antiBanDelayEnabled,
        antiBanDelayMinMinutes: Math.min(input.antiBanDelayMinMinutes, input.antiBanDelayMaxMinutes),
        antiBanDelayMaxMinutes: Math.max(input.antiBanDelayMinMinutes, input.antiBanDelayMaxMinutes),
        messageTemplate: normalizeTemplateInput(input.messageTemplate),
        active: input.active,
        updatedAt: new Date(),
      };

      let integration: MetaFormGoogleSheetIntegration | null = null;

      if (existing) {
        const result = await pool.query<MetaFormGoogleSheetIntegration>(
          `
            UPDATE google_sheet_lead_integrations
            SET
              user_id = $2,
              sheet_id = $3,
              sheet_name = $4,
              sheet_gid = $5,
              maton_connection_id = $6,
              target_whatsapp_number = $7,
              connection_id = $8,
              poll_interval_minutes = $9,
              send_retry_attempts = $10,
              anti_ban_delay_enabled = $11,
              anti_ban_delay_min_minutes = $12,
              anti_ban_delay_max_minutes = $13,
              message_template = $14,
              active = $15,
              updated_at = $16
            WHERE id = $1 AND user_id = $2
            RETURNING
              id,
              sheet_id AS "sheetId",
              sheet_name AS "sheetName",
              sheet_gid AS "sheetGid",
              google_account_email AS "googleAccountEmail",
              maton_connection_id AS "matonConnectionId",
              target_whatsapp_number AS "targetWhatsappNumber",
              user_id AS "userId",
              connection_id AS "connectionId",
              poll_interval_minutes AS "pollIntervalMinutes",
              send_retry_attempts AS "sendRetryAttempts",
              anti_ban_delay_enabled AS "antiBanDelayEnabled",
              anti_ban_delay_min_minutes AS "antiBanDelayMinMinutes",
              anti_ban_delay_max_minutes AS "antiBanDelayMaxMinutes",
              message_template AS "messageTemplate",
              active,
              last_sync_at AS "lastSyncAt",
              last_sync_status AS "lastSyncStatus",
              last_sync_message AS "lastSyncMessage",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
          `,
          [
            existing.id,
            patch.userId,
            patch.sheetId,
            patch.sheetName,
            patch.sheetGid,
            patch.matonConnectionId,
            patch.targetWhatsappNumber,
            patch.connectionId,
            patch.pollIntervalMinutes,
            patch.sendRetryAttempts,
            patch.antiBanDelayEnabled,
            patch.antiBanDelayMinMinutes,
            patch.antiBanDelayMaxMinutes,
            patch.messageTemplate,
            patch.active,
            patch.updatedAt,
          ],
        );

        integration = result.rows[0] || null;
      } else {
        const result = await pool.query<MetaFormGoogleSheetIntegration>(
          `
            INSERT INTO google_sheet_lead_integrations (
              user_id,
              sheet_id,
              sheet_name,
              sheet_gid,
              maton_connection_id,
              target_whatsapp_number,
              connection_id,
              poll_interval_minutes,
              send_retry_attempts,
              anti_ban_delay_enabled,
              anti_ban_delay_min_minutes,
              anti_ban_delay_max_minutes,
              message_template,
              active,
              last_sync_status,
              last_sync_message,
              updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
            )
            RETURNING
              id,
              sheet_id AS "sheetId",
              sheet_name AS "sheetName",
              sheet_gid AS "sheetGid",
              google_account_email AS "googleAccountEmail",
              maton_connection_id AS "matonConnectionId",
              target_whatsapp_number AS "targetWhatsappNumber",
              user_id AS "userId",
              connection_id AS "connectionId",
              poll_interval_minutes AS "pollIntervalMinutes",
              send_retry_attempts AS "sendRetryAttempts",
              anti_ban_delay_enabled AS "antiBanDelayEnabled",
              anti_ban_delay_min_minutes AS "antiBanDelayMinMinutes",
              anti_ban_delay_max_minutes AS "antiBanDelayMaxMinutes",
              message_template AS "messageTemplate",
              active,
              last_sync_at AS "lastSyncAt",
              last_sync_status AS "lastSyncStatus",
              last_sync_message AS "lastSyncMessage",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
          `,
          [
            patch.userId,
            patch.sheetId,
            patch.sheetName,
            patch.sheetGid,
            patch.matonConnectionId,
            patch.targetWhatsappNumber,
            patch.connectionId,
            patch.pollIntervalMinutes,
            patch.sendRetryAttempts,
            patch.antiBanDelayEnabled,
            patch.antiBanDelayMinMinutes,
            patch.antiBanDelayMaxMinutes,
            patch.messageTemplate,
            patch.active,
            "idle",
            "Configuracao salva manualmente no modulo Formulario Meta.",
            patch.updatedAt,
          ],
        );

        integration = result.rows[0] || null;
      }

      if (integration) {
        integration = await bindIntegrationToGoogleAccount(integration, currentGoogleEmail);
      }

      const integrations = await listIntegrationsForUser(userId);
      return res.json(
        await buildMetaFormResponse(
          userId,
          integrations,
          {
            eventPage: req.query.page,
            eventPageSize: req.query.pageSize,
            origin: getRequestOrigin(req),
            access,
          },
          integration?.id || requestedIntegrationId,
        ),
      );
    } catch (error: any) {
      console.error("[Meta Form] Falha ao salvar configuracao:", error);
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao salvar configuracao do Formulario Meta",
      });
    }
  });

  app.delete("/api/meta-formulario/:integrationId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const access = getMetaLeadFormsRequestAccessOptions(req);
      await assertMetaLeadFormsBetaAccess(userId, access);
      await ensureMetaLeadGoogleSheetsTables();

      const integrationId = normalizeValue(String(req.params.integrationId || ""));
      if (!integrationId) {
        return res.status(400).json({ message: "Informe a planilha que deseja remover." });
      }

      const existing = await getIntegrationByIdForUser(userId, integrationId);
      if (!existing) {
        return res.status(404).json({ message: "Planilha nao encontrada para esta conta." });
      }

      await db
        .delete(googleSheetLeadIntegrations)
        .where(and(eq(googleSheetLeadIntegrations.id, integrationId), eq(googleSheetLeadIntegrations.userId, userId)));

      const integrations = await listIntegrationsForUser(userId);
      return res.json(
        await buildMetaFormResponse(
          userId,
          integrations,
          {
            eventPage: req.query.page,
            eventPageSize: req.query.pageSize,
            origin: getRequestOrigin(req),
            access,
          },
          null,
        ),
      );
    } catch (error: any) {
      console.error("[Meta Form] Falha ao remover configuracao:", error);
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao remover a planilha do Formulario Meta",
      });
    }
  });

  app.post("/api/meta-formulario/sync", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req as any);
      const access = getMetaLeadFormsRequestAccessOptions(req);
      await assertMetaLeadFormsBetaAccess(userId, access);
      await ensureMetaLeadGoogleSheetsTables();

      const requestedIntegrationId = normalizeValue(
        String(req.query.integrationId || (req as any).body?.integrationId || ""),
      );
      const allIntegrations = await listIntegrationsForUser(userId);
      if (!allIntegrations.length) {
        return res.status(404).json({ message: "Configuracao do Formulario Meta nao encontrada" });
      }

      const googleStatus = await getMetaFormGoogleStatus(userId);
      const integrations = await filterIntegrationsForCurrentGoogleAccount({
        userId,
        origin: getRequestOrigin(req),
        integrations: allIntegrations,
        googleStatus,
      });

      const integrationsToSync = requestedIntegrationId
        ? integrations.filter((integration) => integration.id === requestedIntegrationId && integration.active)
        : integrations.filter((integration) => integration.active);

      if (!integrationsToSync.length) {
        return res.status(409).json({
          message: "Nenhuma planilha ativa visivel para a conta Google conectada.",
        });
      }

      let processedCount = 0;
      let sentCount = 0;
      let retryCount = 0;
      for (const integration of integrationsToSync) {
        const result = await runMetaLeadGoogleSheetsSyncForIntegrationId(integration.id);
        processedCount += result.processedCount;
        sentCount += result.sentCount;
        retryCount += result.retryCount;
      }

      const refreshed = await listIntegrationsForUser(userId);
      return res.json({
        syncResult: {
          processedCount,
          sentCount,
          retryCount,
          integrationsProcessed: integrationsToSync.length,
        },
        ...(await buildMetaFormResponse(
          userId,
          refreshed,
          {
            eventPage: req.query.page,
            eventPageSize: req.query.pageSize,
            origin: getRequestOrigin(req),
            access,
          },
          requestedIntegrationId,
        )),
      });
    } catch (error: any) {
      console.error("[Meta Form] Falha ao sincronizar:", error);
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Erro ao sincronizar leads do Formulario Meta",
      });
    }
  });
}
