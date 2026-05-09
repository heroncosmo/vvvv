import crypto from "crypto";

import { and, desc, eq, inArray } from "drizzle-orm";
import { google } from "googleapis";

import {
  conversations,
  googleSheetLeadEvents,
  googleSheetLeadIntegrations,
  type GoogleSheetLeadEvent,
  type GoogleSheetLeadIntegration,
  type WhatsappConnection,
} from "@shared/schema";

import { db, pool } from "./db";
import {
  getMetaFormGoogleSheetsClient,
  getMetaFormGoogleStatus,
} from "./metaFormGoogleDriveService";
import { fetchMatonSpreadsheetValues, getMatonApiKey } from "./matonSheetsService";
import { isMetaLeadFormsAllowedEmail } from "./metaLeadFormsAccess";
import { sendMetaLeadWhatsappEvent } from "./metaConversionsApi";
import { storage } from "./storage";
import { isOfficialCoexistenceConnection } from "./whatsappCoexistence";
import { sendGatewayInstanceText } from "./whatsappGatewayClient";
import { isWhatsAppGatewayRuntime, resolveWhatsAppConnectionOwner } from "./whatsappGatewayOwnership";
import { buildBrazilWhatsAppPhoneVariants } from "./whatsappPhoneNumber";
import { sendWhatsAppMessageFromUser } from "./whatsappSender";

const DEFAULT_TARGET_WHATSAPP = "5517981679818";
const DEFAULT_SHEET_NAME = "Pagina1";
export const DEFAULT_POLL_INTERVAL_MINUTES = 5;
export const RECENT_CONVERSATION_WINDOW_HOURS = 4;
export const DEFAULT_SEND_RETRY_ATTEMPTS = 3;
export const MIN_SEND_RETRY_ATTEMPTS = 1;
export const MAX_SEND_RETRY_ATTEMPTS = 5;
export const DEFAULT_ANTI_BAN_DELAY_ENABLED = true;
export const DEFAULT_ANTI_BAN_DELAY_MIN_MINUTES = 3;
export const DEFAULT_ANTI_BAN_DELAY_MAX_MINUTES = 7;
export const MIN_ANTI_BAN_DELAY_MINUTES = 1;
export const MAX_ANTI_BAN_DELAY_MINUTES = 15;
const DEFAULT_MESSAGE_TEMPLATE = [
  "Ola{{first_name_suffix}}! Vi aqui que voce pediu contato pelo formulario do AgenteZap{{company_suffix}}.",
  "Vou continuar seu atendimento por aqui no WhatsApp.",
  "Se preferir, ja me diga qual e a sua principal duvida ou objetivo com a automacao.",
].join("\n");

const SEND_RETRY_WAIT_MS = [15_000, 45_000, 90_000];

const PHONE_KEY_ALIASES = [
  "telefone",
  "numerodetelefone",
  "phone",
  "phonenumber",
  "whatsapp",
  "numerodewhatsapp",
  "celular",
  "mobilephone",
];

const NAME_KEY_ALIASES = [
  "nome",
  "nomecompleto",
  "fullname",
  "fullname",
  "contactname",
];

const EMAIL_KEY_ALIASES = [
  "email",
  "emaildetrabalho",
  "workemail",
  "businessemail",
  "emailaddress",
];

type MetaLeadGoogleSheetsIntegrationRecord = GoogleSheetLeadIntegration & {
  sendRetryAttempts?: number | null;
  antiBanDelayEnabled?: boolean | null;
  antiBanDelayMinMinutes?: number | null;
  antiBanDelayMaxMinutes?: number | null;
};

const META_LEAD_INTEGRATION_SELECT_SQL = `
  SELECT
    id,
    sheet_id AS "sheetId",
    sheet_name AS "sheetName",
    sheet_gid AS "sheetGid",
    maton_connection_id AS "matonConnectionId",
    target_whatsapp_number AS "targetWhatsappNumber",
    user_id AS "userId",
    connection_id AS "connectionId",
    poll_interval_minutes AS "pollIntervalMinutes",
    message_template AS "messageTemplate",
    active,
    last_sync_at AS "lastSyncAt",
    last_sync_status AS "lastSyncStatus",
    last_sync_message AS "lastSyncMessage",
    created_at AS "createdAt",
    updated_at AS "updatedAt",
    send_retry_attempts AS "sendRetryAttempts",
    anti_ban_delay_enabled AS "antiBanDelayEnabled",
    anti_ban_delay_min_minutes AS "antiBanDelayMinMinutes",
    anti_ban_delay_max_minutes AS "antiBanDelayMaxMinutes"
  FROM google_sheet_lead_integrations
`;

const COMPANY_KEY_ALIASES = [
  "empresa",
  "nomeempresa",
  "nomedaempresa",
  "instagram",
  "qualonomedaempresaouinstagram",
];

const SUBMITTED_AT_KEY_ALIASES = [
  "createdtime",
  "submittedat",
  "submissiontime",
  "dataehora",
  "datahora",
  "createdat",
  "timestamp",
  "data",
];

const FORM_ID_KEY_ALIASES = [
  "formid",
  "iddoformulario",
  "identificacaodoformulario",
];

let schedulerStarted = false;
let schedulerTimer: NodeJS.Timeout | null = null;
let syncInProgress = false;
let ensureTablesPromise: Promise<void> | null = null;

type RowMap = Map<string, string>;

interface ExtractedLeadRow {
  sourceSheetName: string;
  sourceRowNumber: number;
  sourceRowHash: string;
  legacySourceRowHash: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  submittedAt: Date | null;
  formId: string | null;
  rawPayload: Record<string, string>;
}

interface ResolvedConnection {
  connectionId: string;
  userId: string;
}

type LeadProcessingResult = {
  inserted: boolean;
  sent: boolean;
  attemptedSend: boolean;
  retried: boolean;
};

type LeadSendResult = {
  sent: boolean;
  attemptsUsed: number;
  transport: "gateway_queue" | "local_sender";
  errorMessage: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  remoteJid?: string | null;
};

type GoogleSheetsClient = ReturnType<typeof google.sheets>;

interface LoadedSheetRows {
  sheetName: string;
  rows: string[][];
  isConfiguredSheet: boolean;
}

function normalizeTemplateText(value: string | null | undefined): string {
  const normalized = String(value || "");
  return normalized
    .split("\\r\\n")
    .join("\n")
    .split("\\n")
    .join("\n")
    .trim();
}

function normalizeDigits(value: string | null | undefined): string {
  return String(value || "").replace(/\D+/g, "");
}

function normalizeHeaderKey(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizePhoneForWhatsApp(value: string | null | undefined): string | null {
  const digits = normalizeDigits(value);
  if (!digits) {
    return null;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if (digits.length >= 12) {
    return digits;
  }

  return null;
}

function buildSheetRange(sheetName: string): string {
  const sanitized = String(sheetName || DEFAULT_SHEET_NAME).trim() || DEFAULT_SHEET_NAME;
  if (/[\s'!]/.test(sanitized)) {
    return `'${sanitized.replace(/'/g, "''")}'!A:ZZ`;
  }
  return `${sanitized}!A:ZZ`;
}

function normalizeSheetName(value: string | null | undefined): string {
  return String(value || "").trim();
}

function buildLeadRowHash(input: { sourceSheetName?: string | null; sourceRowNumber: number; values: string[] }): string {
  const sourceSheetName = normalizeSheetName(input.sourceSheetName);
  const payload = sourceSheetName
    ? { sourceSheetName, sourceRowNumber: input.sourceRowNumber, values: input.values }
    : { sourceRowNumber: input.sourceRowNumber, values: input.values };

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function parseOptionalDate(rawValue: string | null | undefined): Date | null {
  if (!rawValue) {
    return null;
  }

  const candidate = new Date(rawValue);
  if (!Number.isNaN(candidate.getTime())) {
    return candidate;
  }

  const match = String(rawValue).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    return null;
  }

  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getFirstName(name: string | null): string | null {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.split(/\s+/)[0] || null;
}

function findValueByAliases(rowMap: RowMap, aliases: string[]): string | null {
  for (const alias of aliases) {
    const exact = rowMap.get(alias);
    if (exact) {
      return exact;
    }
  }

  for (const [key, value] of rowMap.entries()) {
    if (!value) {
      continue;
    }
    if (aliases.some((alias) => key.includes(alias))) {
      return value;
    }
  }

  return null;
}

function renderMessageTemplate(template: string | null | undefined, lead: ExtractedLeadRow): string {
  const baseTemplate = normalizeTemplateText(template || DEFAULT_MESSAGE_TEMPLATE) || DEFAULT_MESSAGE_TEMPLATE;
  const firstName = getFirstName(lead.name);
  const replacements: Record<string, string> = {
    "{{name}}": lead.name || "tudo bem",
    "{{first_name}}": firstName || "",
    "{{first_name_suffix}}": firstName ? `, ${firstName}` : "",
    "{{phone}}": lead.phone || "",
    "{{email}}": lead.email || "",
    "{{company}}": lead.company || "",
    "{{company_suffix}}": lead.company ? ` da empresa ${lead.company}` : "",
  };

  let rendered = baseTemplate;
  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.split(token).join(value);
  }

  while (rendered.includes("\n\n\n")) {
    rendered = rendered.split("\n\n\n").join("\n\n");
  }

  return rendered.trim();
}

function buildRowMap(headers: string[], values: string[]): RowMap {
  const rowMap = new Map<string, string>();
  headers.forEach((header, index) => {
    const normalizedKey = normalizeHeaderKey(header);
    if (!normalizedKey) {
      return;
    }
    const rawValue = String(values[index] || "").trim();
    if (!rawValue) {
      return;
    }
    rowMap.set(normalizedKey, rawValue);
  });
  return rowMap;
}

function extractLeadRow(
  headers: string[],
  values: string[],
  sourceRowNumber: number,
  sourceSheetName: string,
  legacyHashCompatible = false,
): ExtractedLeadRow | null {
  if (!values.some((value) => String(value || "").trim())) {
    return null;
  }

  const rowMap = buildRowMap(headers, values);
  const rawPayload: Record<string, string> = {};
  const normalizedSourceSheetName = normalizeSheetName(sourceSheetName) || DEFAULT_SHEET_NAME;
  headers.forEach((header, index) => {
    const normalizedHeader = String(header || "").trim();
    if (!normalizedHeader) {
      return;
    }
    rawPayload[normalizedHeader] = String(values[index] || "").trim();
  });
  rawPayload._sheet_name = normalizedSourceSheetName;

  const phone = normalizePhoneForWhatsApp(findValueByAliases(rowMap, PHONE_KEY_ALIASES));
  const name = findValueByAliases(rowMap, NAME_KEY_ALIASES);
  const email = findValueByAliases(rowMap, EMAIL_KEY_ALIASES);
  const company = findValueByAliases(rowMap, COMPANY_KEY_ALIASES);
  const submittedAt = parseOptionalDate(findValueByAliases(rowMap, SUBMITTED_AT_KEY_ALIASES));
  const formId = findValueByAliases(rowMap, FORM_ID_KEY_ALIASES);
  const sourceRowHash = buildLeadRowHash({
    sourceSheetName: normalizedSourceSheetName,
    sourceRowNumber,
    values,
  });
  const legacySourceRowHash = legacyHashCompatible
    ? buildLeadRowHash({ sourceRowNumber, values })
    : null;

  return {
    sourceSheetName: normalizedSourceSheetName,
    sourceRowNumber,
    sourceRowHash,
    legacySourceRowHash,
    name: name || null,
    phone,
    email: email || null,
    company: company || null,
    submittedAt,
    formId: formId || null,
    rawPayload,
  };
}

function parseGoogleCredentials():
  | { client_email?: string; private_key?: string; [key: string]: unknown }
  | null {
  const rawEnv =
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    null;

  if (!rawEnv) {
    return null;
  }

  const candidates = [rawEnv];
  try {
    candidates.push(Buffer.from(rawEnv, "base64").toString("utf8"));
  } catch {
    // noop
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        const credentials = parsed as { client_email?: string; private_key?: string };
        if (credentials.private_key && credentials.private_key.includes("\\n")) {
          credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
        }
        return credentials;
      }
    } catch {
      // try next variant
    }
  }

  return null;
}

function getSheetsClient() {
  const credentials = parseGoogleCredentials();
  if (!credentials) {
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

function getMetaFormGoogleOrigin(): string {
  return process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || "https://agentezap.online";
}

function normalizeGoogleAccountEmail(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

export async function ensureMetaLeadGoogleSheetsTables(): Promise<void> {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS google_sheet_lead_integrations (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            sheet_id VARCHAR(255) NOT NULL,
            sheet_name VARCHAR(255) NOT NULL DEFAULT 'Pagina1',
            sheet_gid VARCHAR(64),
            maton_connection_id VARCHAR(255),
            target_whatsapp_number VARCHAR(50) NOT NULL,
            user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
            connection_id VARCHAR REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
            poll_interval_minutes INTEGER NOT NULL DEFAULT 5,
            send_retry_attempts INTEGER NOT NULL DEFAULT 3,
            anti_ban_delay_enabled BOOLEAN NOT NULL DEFAULT true,
            anti_ban_delay_min_minutes INTEGER NOT NULL DEFAULT 3,
            anti_ban_delay_max_minutes INTEGER NOT NULL DEFAULT 7,
            message_template TEXT,
            active BOOLEAN NOT NULL DEFAULT true,
            last_sync_at TIMESTAMP,
            last_sync_status VARCHAR(50) NOT NULL DEFAULT 'idle',
            last_sync_message TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
          CREATE UNIQUE INDEX IF NOT EXISTS idx_google_sheet_lead_integrations_sheet
            ON google_sheet_lead_integrations(sheet_id, sheet_name);
          CREATE INDEX IF NOT EXISTS idx_google_sheet_lead_integrations_active
            ON google_sheet_lead_integrations(active);

          CREATE TABLE IF NOT EXISTS google_sheet_lead_events (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            integration_id VARCHAR NOT NULL REFERENCES google_sheet_lead_integrations(id) ON DELETE CASCADE,
            source_row_number INTEGER NOT NULL,
            source_row_hash VARCHAR(128) NOT NULL,
            lead_name VARCHAR(255),
            lead_phone VARCHAR(50),
            lead_email VARCHAR(255),
            lead_company VARCHAR(255),
            form_id VARCHAR(255),
            submitted_at TIMESTAMP,
            status VARCHAR(50) NOT NULL DEFAULT 'received',
            message_text TEXT,
            error_message TEXT,
            meta_capi_status VARCHAR(50),
            meta_capi_event_name VARCHAR(100),
            meta_capi_event_id VARCHAR(255),
            meta_capi_sent_at TIMESTAMP,
            meta_capi_error TEXT,
            raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            processed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
          );
          CREATE UNIQUE INDEX IF NOT EXISTS idx_google_sheet_lead_events_row_hash
            ON google_sheet_lead_events(integration_id, source_row_hash);
          CREATE INDEX IF NOT EXISTS idx_google_sheet_lead_events_status
            ON google_sheet_lead_events(status);
          CREATE INDEX IF NOT EXISTS idx_google_sheet_lead_events_created
            ON google_sheet_lead_events(created_at);

          ALTER TABLE google_sheet_lead_events
            ADD COLUMN IF NOT EXISTS meta_capi_status VARCHAR(50);
          ALTER TABLE google_sheet_lead_events
            ADD COLUMN IF NOT EXISTS meta_capi_event_name VARCHAR(100);
          ALTER TABLE google_sheet_lead_events
            ADD COLUMN IF NOT EXISTS meta_capi_event_id VARCHAR(255);
          ALTER TABLE google_sheet_lead_events
            ADD COLUMN IF NOT EXISTS meta_capi_sent_at TIMESTAMP;
          ALTER TABLE google_sheet_lead_events
            ADD COLUMN IF NOT EXISTS meta_capi_error TEXT;
          ALTER TABLE google_sheet_lead_integrations
            ADD COLUMN IF NOT EXISTS maton_connection_id VARCHAR(255);
          ALTER TABLE google_sheet_lead_integrations
            ADD COLUMN IF NOT EXISTS google_account_email VARCHAR(255);
          ALTER TABLE google_sheet_lead_integrations
            ADD COLUMN IF NOT EXISTS send_retry_attempts INTEGER NOT NULL DEFAULT 3;
          ALTER TABLE google_sheet_lead_integrations
            ADD COLUMN IF NOT EXISTS anti_ban_delay_enabled BOOLEAN NOT NULL DEFAULT true;
          ALTER TABLE google_sheet_lead_integrations
            ADD COLUMN IF NOT EXISTS anti_ban_delay_min_minutes INTEGER NOT NULL DEFAULT 3;
          ALTER TABLE google_sheet_lead_integrations
            ADD COLUMN IF NOT EXISTS anti_ban_delay_max_minutes INTEGER NOT NULL DEFAULT 7;

          CREATE TABLE IF NOT EXISTS meta_form_google_configs (
            id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            google_api_key TEXT,
            google_client_id TEXT,
            google_client_secret TEXT,
            google_access_token TEXT,
            google_refresh_token TEXT,
            google_token_type VARCHAR(50),
            google_expiry_date TIMESTAMP,
            google_scope TEXT,
            google_email VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_meta_form_google_configs_email
            ON meta_form_google_configs(google_email);
        `);
      } finally {
        client.release();
      }
    })().catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }

  await ensureTablesPromise;
}

async function resolveConnectionForNumber(targetWhatsappNumber: string): Promise<ResolvedConnection | null> {
  const normalized = normalizeDigits(targetWhatsappNumber);
  if (!normalized) {
    return null;
  }

  const result = await pool.query<{
    connectionId: string;
    userId: string;
  }>(
    `
      SELECT
        c.id AS "connectionId",
        c.user_id AS "userId"
      FROM whatsapp_connections c
      WHERE regexp_replace(COALESCE(c.phone_number, ''), '\\D', '', 'g') = $1
      ORDER BY
        CASE
          WHEN c.provider_status = 'connected' THEN 0
          WHEN c.is_connected = true THEN 1
          WHEN c.provider = 'meta_cloud_api' THEN 2
          WHEN c.provider_status = 'pending_setup' THEN 3
          ELSE 4
        END,
        c.is_primary DESC,
        c.updated_at DESC NULLS LAST,
        c.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [normalized],
  );

  return result.rows[0] || null;
}

async function ensureDefaultIntegrationFromEnv(): Promise<void> {
  const sheetId = String(process.env.META_LEADS_SHEET_ID || "").trim();
  if (!sheetId) {
    return;
  }

  const sheetName = String(process.env.META_LEADS_SHEET_NAME || DEFAULT_SHEET_NAME).trim() || DEFAULT_SHEET_NAME;
  const targetWhatsappNumber =
    String(process.env.META_LEADS_TARGET_WHATSAPP || DEFAULT_TARGET_WHATSAPP).trim() || DEFAULT_TARGET_WHATSAPP;
  const pollIntervalMinutes = Math.max(
    1,
    Number.parseInt(process.env.META_LEADS_POLL_MINUTES || String(DEFAULT_POLL_INTERVAL_MINUTES), 10) ||
      DEFAULT_POLL_INTERVAL_MINUTES,
  );
  const messageTemplate = normalizeTemplateText(process.env.META_LEADS_MESSAGE_TEMPLATE || DEFAULT_MESSAGE_TEMPLATE);
  const sheetGid = String(process.env.META_LEADS_SHEET_GID || "").trim() || null;
  const matonConnectionId = String(process.env.META_LEADS_MATON_CONNECTION_ID || "").trim() || null;
  const resolvedConnection = await resolveConnectionForNumber(targetWhatsappNumber);

  const [existing] = await db
    .select()
    .from(googleSheetLeadIntegrations)
    .where(
      and(
        eq(googleSheetLeadIntegrations.sheetId, sheetId),
        eq(googleSheetLeadIntegrations.sheetName, sheetName),
      ),
    )
    .limit(1);

  if (existing) {
    const patch: Partial<GoogleSheetLeadIntegration> = {};
    if (!existing.userId && resolvedConnection?.userId) {
      patch.userId = resolvedConnection.userId;
    }
    if (!existing.connectionId && resolvedConnection?.connectionId) {
      patch.connectionId = resolvedConnection.connectionId;
    }
    if (existing.pollIntervalMinutes !== pollIntervalMinutes) {
      patch.pollIntervalMinutes = pollIntervalMinutes;
    }
    if (!existing.messageTemplate && messageTemplate) {
      patch.messageTemplate = messageTemplate;
    }
    if (!existing.targetWhatsappNumber && targetWhatsappNumber) {
      patch.targetWhatsappNumber = targetWhatsappNumber;
    }
    if (!existing.sheetGid && sheetGid) {
      patch.sheetGid = sheetGid;
    }
    if (!existing.matonConnectionId && matonConnectionId) {
      patch.matonConnectionId = matonConnectionId;
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = new Date();
      await db
        .update(googleSheetLeadIntegrations)
        .set(patch)
        .where(eq(googleSheetLeadIntegrations.id, existing.id));
    }
    return;
  }

  await db.insert(googleSheetLeadIntegrations).values({
    sheetId,
    sheetName,
    sheetGid,
    matonConnectionId,
    targetWhatsappNumber,
    userId: resolvedConnection?.userId || null,
    connectionId: resolvedConnection?.connectionId || null,
    pollIntervalMinutes,
    messageTemplate,
    active: true,
    lastSyncStatus: "idle",
    lastSyncMessage: "Configuracao criada automaticamente por variaveis de ambiente.",
    updatedAt: new Date(),
  });
}

async function updateIntegrationStatus(
  integrationId: string,
  patch: {
    lastSyncStatus: string;
    lastSyncMessage: string;
    lastSyncAt?: Date;
  },
) {
  await db
    .update(googleSheetLeadIntegrations)
    .set({
      lastSyncStatus: patch.lastSyncStatus,
      lastSyncMessage: patch.lastSyncMessage,
      lastSyncAt: patch.lastSyncAt,
      updatedAt: new Date(),
    })
    .where(eq(googleSheetLeadIntegrations.id, integrationId));
}

async function getIntegrationRecordById(
  integrationId: string,
): Promise<MetaLeadGoogleSheetsIntegrationRecord | null> {
  const result = await pool.query<MetaLeadGoogleSheetsIntegrationRecord>(
    `
      ${META_LEAD_INTEGRATION_SELECT_SQL}
      WHERE id = $1
      LIMIT 1
    `,
    [integrationId],
  );

  return result.rows[0] || null;
}

async function listActiveIntegrationRecords(): Promise<MetaLeadGoogleSheetsIntegrationRecord[]> {
  const result = await pool.query<MetaLeadGoogleSheetsIntegrationRecord>(
    `
      ${META_LEAD_INTEGRATION_SELECT_SQL}
      WHERE active = true
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    `,
  );

  return result.rows;
}

async function listGoogleSheetTitles(
  sheets: GoogleSheetsClient,
  spreadsheetId: string,
  fallbackSheetName: string,
): Promise<string[]> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title,index,sheetType,hidden))",
    includeGridData: false,
  });

  const titles = (response.data.sheets || [])
    .map((sheet) => sheet.properties)
    .filter((properties) => {
      const title = normalizeSheetName(properties?.title);
      if (!title) {
        return false;
      }
      if (properties?.hidden) {
        return false;
      }
      return !properties?.sheetType || properties.sheetType === "GRID";
    })
    .sort((left, right) => Number(left?.index || 0) - Number(right?.index || 0))
    .map((properties) => normalizeSheetName(properties?.title))
    .filter(Boolean);

  return titles.length ? titles : [normalizeSheetName(fallbackSheetName) || DEFAULT_SHEET_NAME];
}

async function loadRowsFromGoogleSheetsClient(
  sheets: GoogleSheetsClient,
  integration: GoogleSheetLeadIntegration,
): Promise<LoadedSheetRows[]> {
  const configuredSheetName = normalizeSheetName(integration.sheetName) || DEFAULT_SHEET_NAME;
  const sheetTitles = await listGoogleSheetTitles(sheets, integration.sheetId, configuredSheetName);
  const loadedSheets: LoadedSheetRows[] = [];
  let lastError: unknown = null;

  for (const sheetName of sheetTitles) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: integration.sheetId,
        range: buildSheetRange(sheetName),
        majorDimension: "ROWS",
      });

      loadedSheets.push({
        sheetName,
        rows: response.data.values?.map((row) => row.map((cell) => String(cell || ""))) || [],
        isConfiguredSheet: sheetName === configuredSheetName,
      });
    } catch (error) {
      lastError = error;
      console.warn(`[Meta Leads] Falha ao ler a aba ${sheetName} da planilha ${integration.sheetId}:`, error);
    }
  }

  if (!loadedSheets.length && lastError) {
    throw lastError;
  }

  return loadedSheets;
}

async function loadAllRowsFromGoogleSheets(integration: GoogleSheetLeadIntegration): Promise<LoadedSheetRows[]> {
  const sheets = getSheetsClient();
  if (!sheets) {
    throw new Error(
      "Google Sheets nao configurado. Defina GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON ou GOOGLE_SERVICE_ACCOUNT_JSON.",
    );
  }

  return loadRowsFromGoogleSheetsClient(sheets, integration);
}

async function loadRowsFromGoogleOAuth(integration: GoogleSheetLeadIntegration): Promise<LoadedSheetRows[]> {
  if (!integration.userId) {
    throw new Error("Integracao sem usuario vinculado para leitura Google direta.");
  }

  const sheets = await getMetaFormGoogleSheetsClient(integration.userId, getMetaFormGoogleOrigin());
  if (!sheets) {
    throw new Error("Conecte o Google Drive desta conta antes de sincronizar a planilha.");
  }

  return loadRowsFromGoogleSheetsClient(sheets, integration);
}

async function loadRowsFromMatonSheets(integration: GoogleSheetLeadIntegration): Promise<LoadedSheetRows[]> {
  const apiKey = getMatonApiKey();
  if (!apiKey) {
    throw new Error("Maton nao configurado. Defina META_FORM_MATON_API_KEY ou MATON_API_KEY.");
  }

  const rows = await fetchMatonSpreadsheetValues({
    apiKey,
    connectionId: integration.matonConnectionId || undefined,
    spreadsheetId: integration.sheetId,
    range: buildSheetRange(integration.sheetName),
  });

  return [
    {
      sheetName: normalizeSheetName(integration.sheetName) || DEFAULT_SHEET_NAME,
      rows,
      isConfiguredSheet: true,
    },
  ];
}

async function loadSheetRows(integration: GoogleSheetLeadIntegration): Promise<ExtractedLeadRow[]> {
  let loadedSheets: LoadedSheetRows[];
  if (integration.userId) {
    try {
      loadedSheets = await loadRowsFromGoogleOAuth(integration);
    } catch (error) {
      if (integration.matonConnectionId) {
        loadedSheets = await loadRowsFromMatonSheets(integration);
      } else if (parseGoogleCredentials()) {
        loadedSheets = await loadAllRowsFromGoogleSheets(integration);
      } else if (getMatonApiKey()) {
        loadedSheets = await loadRowsFromMatonSheets(integration);
      } else {
        throw error;
      }
    }
  } else if (integration.matonConnectionId) {
    loadedSheets = await loadRowsFromMatonSheets(integration);
  } else if (parseGoogleCredentials()) {
    loadedSheets = await loadAllRowsFromGoogleSheets(integration);
  } else if (getMatonApiKey()) {
    loadedSheets = await loadRowsFromMatonSheets(integration);
  } else {
    throw new Error(
      "Nenhum provedor de planilha configurado. Conecte o Google Drive ou configure um fallback do Google Sheets.",
    );
  }

  const extracted: ExtractedLeadRow[] = [];

  for (const sheet of loadedSheets) {
    if (sheet.rows.length <= 1) {
      continue;
    }

    const headers = sheet.rows[0].map((cell) => String(cell || "").trim());
    for (let index = 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index].map((cell) => String(cell || ""));
      const lead = extractLeadRow(headers, row, index + 1, sheet.sheetName, sheet.isConfiguredSheet);
      if (lead) {
        extracted.push(lead);
      }
    }
  }

  return extracted;
}

async function findExistingConversationForLead(connectionId: string, phone: string) {
  const variants = buildBrazilWhatsAppPhoneVariants(phone);
  if (variants.length === 0) {
    return null;
  }

  const rows = await db
    .select({
      id: conversations.id,
      contactNumber: conversations.contactNumber,
      lastMessageTime: conversations.lastMessageTime,
      updatedAt: conversations.updatedAt,
      createdAt: conversations.createdAt,
      isClosed: conversations.isClosed,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.connectionId, connectionId),
        inArray(conversations.contactNumber, variants),
      ),
    )
    .orderBy(desc(conversations.lastMessageTime), desc(conversations.updatedAt), desc(conversations.createdAt))
    .limit(1);

  return rows[0] || null;
}

function resolveConversationActivityAt(conversation: {
  lastMessageTime?: Date | null;
  updatedAt?: Date | null;
  createdAt?: Date | null;
}) {
  return conversation.lastMessageTime || conversation.updatedAt || conversation.createdAt || null;
}

function isConversationRecent(
  conversation: {
    lastMessageTime?: Date | null;
    updatedAt?: Date | null;
    createdAt?: Date | null;
  },
  referenceDate = new Date(),
) {
  const activityAt = resolveConversationActivityAt(conversation);
  if (!activityAt) {
    return false;
  }

  const diffMs = referenceDate.getTime() - activityAt.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return true;
  }

  return diffMs < RECENT_CONVERSATION_WINDOW_HOURS * 60 * 60 * 1000;
}

function normalizeRetryAttempts(value: number | null | undefined) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SEND_RETRY_ATTEMPTS;
  }

  return Math.min(MAX_SEND_RETRY_ATTEMPTS, Math.max(MIN_SEND_RETRY_ATTEMPTS, parsed));
}

function normalizeAntiBanDelayRange(integration: MetaLeadGoogleSheetsIntegrationRecord) {
  const enabled = true;
  const rawMin = Number.parseInt(String(integration.antiBanDelayMinMinutes ?? ""), 10);
  const rawMax = Number.parseInt(String(integration.antiBanDelayMaxMinutes ?? ""), 10);

  const minMinutes = Number.isFinite(rawMin)
    ? Math.min(MAX_ANTI_BAN_DELAY_MINUTES, Math.max(MIN_ANTI_BAN_DELAY_MINUTES, rawMin))
    : DEFAULT_ANTI_BAN_DELAY_MIN_MINUTES;
  const maxMinutes = Number.isFinite(rawMax)
    ? Math.min(MAX_ANTI_BAN_DELAY_MINUTES, Math.max(MIN_ANTI_BAN_DELAY_MINUTES, rawMax))
    : DEFAULT_ANTI_BAN_DELAY_MAX_MINUTES;

  return {
    enabled,
    minMinutes: Math.min(minMinutes, maxMinutes),
    maxMinutes: Math.max(minMinutes, maxMinutes),
  };
}

function pickRandomAntiBanDelayMs(integration: MetaLeadGoogleSheetsIntegrationRecord) {
  const range = normalizeAntiBanDelayRange(integration);
  if (!range.enabled) {
    return 0;
  }

  const minSeconds = range.minMinutes * 60;
  const maxSeconds = range.maxMinutes * 60;
  const randomSeconds = minSeconds + Math.floor(Math.random() * (maxSeconds - minSeconds + 1));
  return randomSeconds * 1000;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function isRetryableLeadEvent(event: Pick<GoogleSheetLeadEvent, "status"> | null | undefined) {
  return event?.status === "failed" || event?.status === "error";
}

async function getLeadEventByHash(integrationId: string, sourceRowHash: string) {
  const [event] = await db
    .select()
    .from(googleSheetLeadEvents)
    .where(
      and(
        eq(googleSheetLeadEvents.integrationId, integrationId),
        eq(googleSheetLeadEvents.sourceRowHash, sourceRowHash),
      ),
    )
    .limit(1);

  return event || null;
}

async function refreshRetryableLeadEvent(
  eventId: string,
  lead: ExtractedLeadRow,
  messageText: string,
) {
  await db
    .update(googleSheetLeadEvents)
    .set({
      sourceRowNumber: lead.sourceRowNumber,
      leadName: lead.name,
      leadPhone: lead.phone,
      leadEmail: lead.email,
      leadCompany: lead.company,
      formId: lead.formId,
      submittedAt: lead.submittedAt,
      messageText,
      rawPayload: lead.rawPayload,
    })
    .where(eq(googleSheetLeadEvents.id, eventId));
}

async function shouldUseGatewayQueueForConnection(connection: WhatsappConnection) {
  if (isWhatsAppGatewayRuntime() || isOfficialCoexistenceConnection(connection)) {
    return false;
  }

  return (await resolveWhatsAppConnectionOwner(connection)) === "gateway";
}

function describeGatewaySendFailure(payload: any) {
  return (
    payload?.reason ||
    payload?.error ||
    payload?.message ||
    "Gateway nao confirmou o envio da mensagem."
  );
}

async function sendLeadMessageOnce(params: {
  userId: string;
  connectionId: string;
  phone: string;
  contactName?: string | null;
  messageText: string;
}): Promise<Omit<LeadSendResult, "attemptsUsed">> {
  const connection = await storage.getConnectionById(params.connectionId);
  if (!connection || connection.userId !== params.userId) {
    return {
      sent: false,
      transport: "local_sender",
      errorMessage: "Conexao do WhatsApp nao encontrada para este usuario.",
    };
  }

  if (await shouldUseGatewayQueueForConnection(connection)) {
    try {
      const result: any = await sendGatewayInstanceText(connection.id, {
        text: params.messageText,
        to: params.phone,
        contactName: params.contactName || undefined,
        validateDestination: true,
        isFromAgent: true,
        source: "system",
      });

      if (result?.success) {
        return {
          sent: true,
          transport: "gateway_queue",
          errorMessage: null,
          messageId: result.messageId || null,
          conversationId: result.conversationId || null,
          remoteJid: result.remoteJid || null,
        };
      }

      return {
        sent: false,
        transport: "gateway_queue",
        errorMessage: describeGatewaySendFailure(result),
      };
    } catch (error) {
      return {
        sent: false,
        transport: "gateway_queue",
        errorMessage: error instanceof Error ? error.message : "Falha desconhecida no gateway.",
      };
    }
  }

  try {
    const sent = await sendWhatsAppMessageFromUser(params.userId, params.phone, params.messageText, "whatsapp_sender");
    return {
      sent,
      transport: "local_sender",
      errorMessage: sent ? null : "Sender local nao confirmou o envio da mensagem.",
    };
  } catch (error) {
    return {
      sent: false,
      transport: "local_sender",
      errorMessage: error instanceof Error ? error.message : "Falha desconhecida no sender local.",
    };
  }
}

async function sendLeadMessageWithRetry(params: {
  userId: string;
  connectionId: string;
  phone: string;
  contactName?: string | null;
  messageText: string;
  maxAttempts: number;
}): Promise<LeadSendResult> {
  let attemptsUsed = 0;
  let lastResult: Omit<LeadSendResult, "attemptsUsed"> | null = null;

  while (attemptsUsed < params.maxAttempts) {
    attemptsUsed += 1;
    lastResult = await sendLeadMessageOnce({
      userId: params.userId,
      connectionId: params.connectionId,
      phone: params.phone,
      contactName: params.contactName,
      messageText: params.messageText,
    });
    if (lastResult.sent) {
      return { ...lastResult, attemptsUsed };
    }

    const waitMs = SEND_RETRY_WAIT_MS[Math.min(attemptsUsed - 1, SEND_RETRY_WAIT_MS.length - 1)] || 0;
    if (attemptsUsed < params.maxAttempts && waitMs > 0) {
      await wait(waitMs);
    }
  }

  return {
    sent: false,
    attemptsUsed,
    transport: lastResult?.transport || "local_sender",
    errorMessage: lastResult?.errorMessage || "Falha no envio automatico pelo WhatsApp.",
  };
}

async function processLeadRow(
  integration: MetaLeadGoogleSheetsIntegrationRecord,
  lead: ExtractedLeadRow,
): Promise<LeadProcessingResult> {
  const messageText = renderMessageTemplate(integration.messageTemplate, lead);
  let event: GoogleSheetLeadEvent | null = null;
  let inserted = false;
  let retried = false;

  if (lead.legacySourceRowHash && lead.legacySourceRowHash !== lead.sourceRowHash) {
    const legacyEvent = await getLeadEventByHash(integration.id, lead.legacySourceRowHash);

    if (legacyEvent) {
      if (!isRetryableLeadEvent(legacyEvent)) {
        return { inserted: false, sent: false, attemptedSend: false, retried: false };
      }

      event = legacyEvent;
      retried = true;
    }
  }

  if (!event) {
    const [createdEvent] = await db
      .insert(googleSheetLeadEvents)
      .values({
        integrationId: integration.id,
        sourceRowNumber: lead.sourceRowNumber,
        sourceRowHash: lead.sourceRowHash,
        leadName: lead.name,
        leadPhone: lead.phone,
        leadEmail: lead.email,
        leadCompany: lead.company,
        formId: lead.formId,
        submittedAt: lead.submittedAt,
        messageText,
        rawPayload: lead.rawPayload,
      })
      .onConflictDoNothing()
      .returning();

    if (createdEvent) {
      event = createdEvent;
      inserted = true;
    } else {
      event = await getLeadEventByHash(integration.id, lead.sourceRowHash);
      if (!event || !isRetryableLeadEvent(event)) {
        return { inserted: false, sent: false, attemptedSend: false, retried: false };
      }
      retried = true;
    }
  }

  if (retried) {
    await refreshRetryableLeadEvent(event.id, lead, messageText);
  }

  if (!lead.phone) {
    await db
      .update(googleSheetLeadEvents)
      .set({
        status: "skipped_no_phone",
        errorMessage: "Linha sem telefone valido para envio automatico.",
        processedAt: new Date(),
      })
      .where(eq(googleSheetLeadEvents.id, event.id));
    return { inserted, sent: false, attemptedSend: false, retried };
  }

  const resolvedConnection =
    integration.userId && integration.connectionId
      ? { userId: integration.userId, connectionId: integration.connectionId }
      : await resolveConnectionForNumber(integration.targetWhatsappNumber);

  if (!resolvedConnection?.userId) {
    await db
      .update(googleSheetLeadEvents)
      .set({
        status: "skipped_missing_connection",
        errorMessage: `Nenhuma conexao encontrada para o numero ${integration.targetWhatsappNumber}.`,
        processedAt: new Date(),
      })
      .where(eq(googleSheetLeadEvents.id, event.id));
    return { inserted, sent: false, attemptedSend: false, retried };
  }

  const existingConversation = await findExistingConversationForLead(resolvedConnection.connectionId, lead.phone);
  if (existingConversation) {
    const activityAt = resolveConversationActivityAt(existingConversation);
    const activityLabel = activityAt ? activityAt.toISOString() : "momento desconhecido";
    const hasRecentConversation = isConversationRecent(existingConversation);
    const contactNumber = existingConversation.contactNumber || lead.phone;
    await db
      .update(googleSheetLeadEvents)
      .set({
        status: hasRecentConversation ? "skipped_recent_conversation" : "skipped_existing_conversation",
        errorMessage: hasRecentConversation
          ? `Ja existe conversa recente para ${contactNumber} nas ultimas ${RECENT_CONVERSATION_WINDOW_HOURS} horas (${activityLabel}). Lead marcado como cliente ja em contato.`
          : `Ja existe conversa com ${contactNumber} nesta conexao desde ${activityLabel}. Lead marcado como cliente ja em contato.`,
        processedAt: new Date(),
      })
      .where(eq(googleSheetLeadEvents.id, event.id));
    return { inserted, sent: false, attemptedSend: false, retried };
  }

  const sendResult = await sendLeadMessageWithRetry({
    userId: resolvedConnection.userId,
    connectionId: resolvedConnection.connectionId,
    phone: lead.phone,
    contactName: lead.name,
    messageText,
    maxAttempts: normalizeRetryAttempts(integration.sendRetryAttempts),
  });
  const sent = sendResult.sent;
  const failureDetail = sendResult.errorMessage ? ` Detalhe: ${sendResult.errorMessage}` : "";

  await db
    .update(googleSheetLeadEvents)
    .set({
      status: sent ? "sent" : "failed",
      errorMessage: sent
        ? null
        : `Falha no envio automatico pelo WhatsApp apos ${sendResult.attemptsUsed} tentativa(s) via ${sendResult.transport}.${failureDetail}`,
      processedAt: new Date(),
    })
    .where(eq(googleSheetLeadEvents.id, event.id));

  if (sent) {
    try {
      const capiResult = await sendMetaLeadWhatsappEvent({
        eventId: event.id,
        phone: lead.phone,
        email: lead.email,
        name: lead.name,
        company: lead.company,
        formId: lead.formId,
        submittedAt: lead.submittedAt,
      });
      let metaCapiStatus: string;
      let metaCapiSentAt: Date | null;
      let metaCapiError: string | null;

      if (capiResult.sent) {
        metaCapiStatus = "sent";
        metaCapiSentAt = new Date();
        metaCapiError = null;
      } else {
        metaCapiStatus = "skipped";
        metaCapiSentAt = null;
        metaCapiError = "reason" in capiResult ? capiResult.reason : "Evento ignorado pela configuracao do Meta CAPI.";
      }

      await db
        .update(googleSheetLeadEvents)
        .set({
          metaCapiStatus,
          metaCapiEventName: capiResult.eventName,
          metaCapiEventId: capiResult.eventId,
          metaCapiSentAt,
          metaCapiError,
        })
        .where(eq(googleSheetLeadEvents.id, event.id));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha desconhecida ao enviar o evento de conversao para a Meta.";

      await db
        .update(googleSheetLeadEvents)
        .set({
          metaCapiStatus: "failed",
          metaCapiError: message,
        })
        .where(eq(googleSheetLeadEvents.id, event.id));

      console.error(`[Meta Leads] Falha ao enviar evento Meta CAPI para o lead ${event.id}:`, error);
    }
  }

  return { inserted, sent, attemptedSend: true, retried };
}

async function isAllowedIntegration(integration: GoogleSheetLeadIntegration): Promise<boolean> {
  if (!integration.userId) {
    return false;
  }

  const user = await storage.getUser(integration.userId).catch(() => undefined);
  return isMetaLeadFormsAllowedEmail(user?.email);
}

async function getBoundGoogleAccountEmail(integrationId: string): Promise<string | null> {
  const result = await pool.query<{ googleAccountEmail: string | null }>(
    `
      SELECT google_account_email AS "googleAccountEmail"
      FROM google_sheet_lead_integrations
      WHERE id = $1
      LIMIT 1
    `,
    [integrationId],
  );

  return normalizeGoogleAccountEmail(result.rows[0]?.googleAccountEmail);
}

async function ensureIntegrationMatchesCurrentGoogleAccount(
  integration: GoogleSheetLeadIntegration,
): Promise<{ integration: GoogleSheetLeadIntegration | null; skippedReason?: string; skippedMessage?: string }> {
  if (!integration.userId) {
    return { integration };
  }

  const googleStatus = await getMetaFormGoogleStatus(integration.userId);
  const currentGoogleEmail = normalizeGoogleAccountEmail(googleStatus.connectedEmail);
  if (!googleStatus.connected || !currentGoogleEmail) {
    return {
      integration: null,
      skippedReason: "google_disconnected",
      skippedMessage: "Conecte novamente o Google desta conta para ler a planilha vinculada.",
    };
  }

  const boundGoogleEmail = await getBoundGoogleAccountEmail(integration.id);
  if (boundGoogleEmail && boundGoogleEmail === currentGoogleEmail) {
    return { integration };
  }

  return {
    integration: null,
    skippedReason: boundGoogleEmail ? "google_account_mismatch" : "google_account_unbound",
    skippedMessage: boundGoogleEmail
      ? "Esta planilha esta vinculada a outra conta Google. Troque a conta Google ou selecione a planilha novamente."
      : "Selecione novamente esta planilha para vincular com a conta Google conectada agora.",
  };
}

export async function runMetaLeadGoogleSheetsSyncForIntegration(
  integration: MetaLeadGoogleSheetsIntegrationRecord,
): Promise<{ processedCount: number; sentCount: number; retryCount: number; skippedReason?: string }> {
  if (!(await isAllowedIntegration(integration))) {
    await updateIntegrationStatus(integration.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: "skipped",
      lastSyncMessage: "Integracao ignorada porque a conta nao tem acesso valido ao modulo Formulario Meta.",
    });
    return { processedCount: 0, sentCount: 0, retryCount: 0, skippedReason: "not_allowed" };
  }

  const googleBinding = await ensureIntegrationMatchesCurrentGoogleAccount(integration);
  if (!googleBinding.integration) {
    await updateIntegrationStatus(integration.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: "skipped",
      lastSyncMessage: googleBinding.skippedMessage || "A planilha nao esta disponivel para a conta Google atual.",
    });
    return {
      processedCount: 0,
      sentCount: 0,
      retryCount: 0,
      skippedReason: googleBinding.skippedReason || "google_account_mismatch",
    };
  }

  const boundIntegration = googleBinding.integration;

  await updateIntegrationStatus(boundIntegration.id, {
    lastSyncStatus: "running",
    lastSyncMessage: "Buscando novos leads na planilha...",
  });

  const leads = await loadSheetRows(boundIntegration);
  let processedCount = 0;
  let sentCount = 0;
  let retryCount = 0;

  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index];
    const result = await processLeadRow(boundIntegration, lead);
    if (result.inserted) {
      processedCount += 1;
    }
    if (result.retried) {
      retryCount += 1;
    }
    if (result.sent) {
      sentCount += 1;
      const isLastLead = index >= leads.length - 1;
      const delayMs = isLastLead ? 0 : pickRandomAntiBanDelayMs(boundIntegration);
      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }

  await updateIntegrationStatus(boundIntegration.id, {
    lastSyncAt: new Date(),
    lastSyncStatus: "success",
    lastSyncMessage: `${processedCount} novos leads processados, ${retryCount} falhas reprocessadas, ${sentCount} mensagens enviadas.`,
  });

  return { processedCount, sentCount, retryCount };
}

export async function runMetaLeadGoogleSheetsSyncForIntegrationId(integrationId: string) {
  await ensureMetaLeadGoogleSheetsTables();
  const integration = await getIntegrationRecordById(integrationId);

  if (!integration) {
    throw new Error("Integracao de Formulario Meta nao encontrada.");
  }

  return runMetaLeadGoogleSheetsSyncForIntegration(integration);
}

export async function runMetaLeadGoogleSheetsSyncCycle(): Promise<void> {
  if (syncInProgress) {
    console.log("[Meta Leads] Sincronizacao ignorada porque a execucao anterior ainda esta em andamento.");
    return;
  }

  syncInProgress = true;

  try {
    await ensureMetaLeadGoogleSheetsTables();
    await ensureDefaultIntegrationFromEnv();

    const integrations = await listActiveIntegrationRecords();

    if (!integrations.length) {
      console.log("[Meta Leads] Nenhuma integracao ativa de Google Sheets configurada.");
      return;
    }

    for (const integration of integrations) {
      try {
        await runMetaLeadGoogleSheetsSyncForIntegration(integration);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido ao sincronizar a planilha";
        await updateIntegrationStatus(integration.id, {
          lastSyncAt: new Date(),
          lastSyncStatus: "error",
          lastSyncMessage: message,
        });
        console.error(`[Meta Leads] Erro ao sincronizar a integracao ${integration.id}:`, error);
      }
    }
  } finally {
    syncInProgress = false;
  }
}

export function startMetaLeadGoogleSheetsScheduler(): void {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;

  void runMetaLeadGoogleSheetsSyncCycle();
  const intervalMinutes = Math.max(
    1,
    Number.parseInt(process.env.META_LEADS_POLL_MINUTES || String(DEFAULT_POLL_INTERVAL_MINUTES), 10) ||
      DEFAULT_POLL_INTERVAL_MINUTES,
  );

  schedulerTimer = setInterval(() => {
    void runMetaLeadGoogleSheetsSyncCycle();
  }, intervalMinutes * 60 * 1000);

  console.log(`[Meta Leads] Scheduler iniciado com intervalo de ${intervalMinutes} minuto(s).`);
}

export function stopMetaLeadGoogleSheetsScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerStarted = false;
}
