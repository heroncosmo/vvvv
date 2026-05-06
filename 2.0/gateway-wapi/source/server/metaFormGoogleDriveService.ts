import crypto from "crypto";

import { google } from "googleapis";

import { pool } from "./db";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

type GoogleDriveFile = {
  spreadsheetId: string;
  name: string;
  url: string | null;
  modifiedTime: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
};

type ResolvedSpreadsheet = {
  spreadsheetId: string;
  spreadsheetTitle: string;
  defaultSheetName: string;
  defaultSheetGid: string | null;
};

type GoogleConfigStatus = {
  configured: boolean;
  connected: boolean;
  scopeReady: boolean;
  missingScopes: string[];
  maskedApiKey: string | null;
  maskedClientId: string | null;
  maskedClientSecret: string | null;
  connectedEmail: string | null;
};

type MetaFormGoogleConfigRecord = {
  id: string;
  userId: string;
  googleApiKey: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleAccessToken: string | null;
  googleRefreshToken: string | null;
  googleTokenType: string | null;
  googleExpiryDate: Date | null;
  googleScope: string | null;
  googleEmail: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type GoogleOAuthAppConfig = {
  apiKey: string | null;
  clientId: string;
  clientSecret: string;
  source: "env" | "legacy";
};

type MetaFormGoogleAuthMode = "redirect" | "popup";

type GoogleErrorSummary = {
  status: number;
  code: string | null;
  reason: string | null;
  message: string | null;
  details: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function listGrantedScopes(value: string | null | undefined): string[] {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function getMissingDriveScopes(value: string | null | undefined): string[] {
  const granted = new Set(listGrantedScopes(value));
  return GOOGLE_SCOPES.filter((scope) => scope !== "https://www.googleapis.com/auth/userinfo.email").filter(
    (scope) => !granted.has(scope),
  );
}

function maskSecret(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}***`;
  }

  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

function buildGoogleOAuthAppConfig(params: {
  envApiKey?: string | null;
  envClientId?: string | null;
  envClientSecret?: string | null;
  legacyApiKey?: string | null;
  legacyClientId?: string | null;
  legacyClientSecret?: string | null;
}): GoogleOAuthAppConfig | null {
  const envClientId = normalizeText(params.envClientId);
  const envClientSecret = normalizeText(params.envClientSecret);
  if (envClientId && envClientSecret) {
    return {
      apiKey: normalizeText(params.envApiKey),
      clientId: envClientId,
      clientSecret: envClientSecret,
      source: "env",
    };
  }

  const legacyClientId = normalizeText(params.legacyClientId);
  const legacyClientSecret = normalizeText(params.legacyClientSecret);
  if (legacyClientId && legacyClientSecret) {
    return {
      apiKey: normalizeText(params.legacyApiKey),
      clientId: legacyClientId,
      clientSecret: legacyClientSecret,
      source: "legacy",
    };
  }

  return null;
}

function normalizeAuthMode(value: string | null | undefined): MetaFormGoogleAuthMode {
  return String(value || "").trim().toLowerCase() === "popup" ? "popup" : "redirect";
}

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "meta-form-google-state";
}

function encodeState(payload: Record<string, string>): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeState(rawState: string): Record<string, string> | null {
  const value = normalizeText(rawState);
  if (!value) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [body, providedSignature] = parts;
  const expectedSignature = crypto.createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
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

function buildRedirectUri(origin: string): string {
  const normalizedOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${normalizedOrigin}/api/meta-formulario/google/callback`;
}

function escapeDriveQueryValue(value: string): string {
  return value.split("'").join("\\'");
}

function mapConfigRow(row: Record<string, unknown> | undefined | null): MetaFormGoogleConfigRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id || ""),
    userId: String(row.user_id || row.userId || ""),
    googleApiKey: normalizeText(String(row.google_api_key ?? row.googleApiKey ?? "")),
    googleClientId: normalizeText(String(row.google_client_id ?? row.googleClientId ?? "")),
    googleClientSecret: normalizeText(String(row.google_client_secret ?? row.googleClientSecret ?? "")),
    googleAccessToken: normalizeText(String(row.google_access_token ?? row.googleAccessToken ?? "")),
    googleRefreshToken: normalizeText(String(row.google_refresh_token ?? row.googleRefreshToken ?? "")),
    googleTokenType: normalizeText(String(row.google_token_type ?? row.googleTokenType ?? "")),
    googleExpiryDate: row.google_expiry_date
      ? new Date(String(row.google_expiry_date))
      : row.googleExpiryDate
        ? new Date(String(row.googleExpiryDate))
        : null,
    googleScope: normalizeText(String(row.google_scope ?? row.googleScope ?? "")),
    googleEmail: normalizeText(String(row.google_email ?? row.googleEmail ?? "")),
    createdAt: row.created_at ? new Date(String(row.created_at)) : row.createdAt ? new Date(String(row.createdAt)) : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)) : row.updatedAt ? new Date(String(row.updatedAt)) : null,
  };
}

async function getConfigByUserId(userId: string): Promise<MetaFormGoogleConfigRecord | null> {
  const result = await pool.query(
    `
      SELECT *
      FROM meta_form_google_configs
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
  );

  return mapConfigRow(result.rows[0]);
}

async function ensureConfigByUserId(userId: string): Promise<MetaFormGoogleConfigRecord> {
  const existing = await getConfigByUserId(userId);
  if (existing) {
    return existing;
  }

  const inserted = await pool.query(
    `
      INSERT INTO meta_form_google_configs (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
      RETURNING *
    `,
    [userId],
  );

  const config = mapConfigRow(inserted.rows[0]);
  if (!config) {
    throw new Error("Nao foi possivel preparar a conexao Google desta conta.");
  }

  return config;
}

async function getLegacyGoogleOAuthAppConfig(): Promise<GoogleOAuthAppConfig | null> {
  const result = await pool.query(
    `
      SELECT google_api_key, google_client_id, google_client_secret
      FROM meta_form_google_configs
      WHERE google_client_id IS NOT NULL
        AND google_client_secret IS NOT NULL
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
    `,
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return buildGoogleOAuthAppConfig({
    legacyApiKey: normalizeText(String(row.google_api_key ?? "")),
    legacyClientId: normalizeText(String(row.google_client_id ?? "")),
    legacyClientSecret: normalizeText(String(row.google_client_secret ?? "")),
  });
}

async function getGoogleOAuthAppConfig(): Promise<GoogleOAuthAppConfig | null> {
  const envConfig = buildGoogleOAuthAppConfig({
    envApiKey: process.env.GOOGLE_API_KEY,
    envClientId: process.env.GOOGLE_CLIENT_ID,
    envClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });
  if (envConfig) {
    return envConfig;
  }

  return getLegacyGoogleOAuthAppConfig();
}

async function persistGoogleTokens(
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    token_type?: string | null;
    expiry_date?: number | null;
    scope?: string | null;
  },
) {
  const existing = await getConfigByUserId(userId);
  if (!existing) {
    return;
  }

  const patch = {
    googleAccessToken: normalizeText(tokens.access_token) || existing.googleAccessToken,
    googleRefreshToken: normalizeText(tokens.refresh_token) || existing.googleRefreshToken,
    googleTokenType: normalizeText(tokens.token_type) || existing.googleTokenType,
    googleExpiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : existing.googleExpiryDate,
    googleScope: normalizeText(tokens.scope) || existing.googleScope,
    updatedAt: new Date(),
  };

  await pool.query(
    `
      UPDATE meta_form_google_configs
      SET
        google_access_token = $2,
        google_refresh_token = $3,
        google_token_type = $4,
        google_expiry_date = $5,
        google_scope = $6,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      userId,
      patch.googleAccessToken,
      patch.googleRefreshToken,
      patch.googleTokenType,
      patch.googleExpiryDate,
      patch.googleScope,
    ],
  );
}

function extractGoogleErrorSummary(error: any): GoogleErrorSummary {
  const status = Number(error?.status || error?.response?.status || 0);
  const responseData = error?.response?.data;
  const responseError = responseData?.error;
  const responseDescription = responseData?.error_description;
  const nestedError = typeof responseError === "object" && responseError ? responseError : null;
  const nestedErrors = Array.isArray(nestedError?.errors)
    ? nestedError.errors
    : Array.isArray(responseData?.errors)
      ? responseData.errors
      : [];
  const firstNestedError = nestedErrors[0];

  const rawParts = [
    typeof responseData === "string" ? responseData : null,
    typeof error?.message === "string" ? error.message : null,
    typeof error?.error === "string" ? error.error : null,
    typeof error?.cause?.message === "string" ? error.cause.message : null,
    typeof responseDescription === "string" ? responseDescription : null,
    typeof responseError === "string" ? responseError : null,
    typeof responseData?.message === "string" ? responseData.message : null,
    typeof responseData?.reason === "string" ? responseData.reason : null,
    typeof nestedError?.message === "string" ? nestedError.message : null,
    typeof nestedError?.status === "string" ? nestedError.status : null,
    typeof nestedError?.code === "string" ? nestedError.code : null,
    typeof firstNestedError?.reason === "string" ? firstNestedError.reason : null,
    typeof firstNestedError?.message === "string" ? firstNestedError.message : null,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean) as string[];

  return {
    status,
    code:
      normalizeText(
        typeof responseError === "string"
          ? responseError
          : responseError?.code || responseData?.code || error?.code || error?.error,
      ) || null,
    reason:
      normalizeText(
        firstNestedError?.reason || responseData?.reason || nestedError?.status || error?.reason,
      ) || null,
    message:
      normalizeText(
        typeof responseError === "string"
          ? responseDescription || error?.message || responseError
          : responseError?.message || responseDescription || responseData?.message || error?.message,
      ) || null,
    details: normalizeText(rawParts.join(" | ")),
  };
}

function shouldReconnectGoogleSession(error: any): boolean {
  const { status, code, message, details } = extractGoogleErrorSummary(error);
  if (status === 401) {
    return true;
  }

  const haystack = [code, message, details]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    haystack.includes("invalid_grant") ||
    haystack.includes("invalid_token") ||
    haystack.includes("token has been expired or revoked") ||
    haystack.includes("token has been revoked") ||
    haystack.includes("revoked") ||
    haystack.includes("expired")
  );
}

function describeGoogleAccessFailure(error: any): string {
  const { reason, message, details } = extractGoogleErrorSummary(error);
  const normalizedReason = String(reason || "").trim().toLowerCase();
  const normalizedMessage = [message, details]
    .map((value) => String(value || "").trim().toLowerCase())
    .join(" ");

  if (
    normalizedReason === "insufficientpermissions" ||
    normalizedMessage.includes("insufficient authentication scopes")
  ) {
    return "Sua conexao Google ainda nao liberou Google Drive e Google Planilhas. Desconecte e conecte novamente, marcando todas as permissoes pedidas.";
  }

  if (
    normalizedReason === "accessnotconfigured" ||
    normalizedMessage.includes("google drive api has not been used") ||
    normalizedMessage.includes("google sheets api has not been used") ||
    normalizedMessage.includes("has not been used in project") ||
    normalizedMessage.includes("is disabled")
  ) {
    return "O projeto Google deste modulo ainda nao esta com Google Drive e Google Sheets liberados para uso. Habilite as APIs no projeto e tente novamente.";
  }

  if (message) {
    return message;
  }

  return "Nao foi possivel acessar o Google Drive agora. Revise a autorizacao do Google e as APIs do projeto.";
}

function createReconnectRequiredError(
  message = "Sua conexao Google expirou ou foi revogada. Desconecte e conecte novamente para continuar.",
) {
  const error = new Error(message) as Error & { statusCode?: number; requiresReconnect?: boolean };
  error.statusCode = 409;
  error.requiresReconnect = true;
  return error;
}

async function clearGoogleTokens(userId: string) {
  await pool.query(
    `
      UPDATE meta_form_google_configs
      SET
        google_access_token = NULL,
        google_refresh_token = NULL,
        google_token_type = NULL,
        google_expiry_date = NULL,
        google_scope = NULL,
        google_email = NULL,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId],
  );
}

function createOAuthClient(
  appConfig: GoogleOAuthAppConfig,
  config: MetaFormGoogleConfigRecord,
  origin: string,
) {
  const oauth2Client = new google.auth.OAuth2(appConfig.clientId, appConfig.clientSecret, buildRedirectUri(origin));
  oauth2Client.setCredentials({
    access_token: normalizeText(config.googleAccessToken) || undefined,
    refresh_token: normalizeText(config.googleRefreshToken) || undefined,
    token_type: normalizeText(config.googleTokenType) || undefined,
    expiry_date: config.googleExpiryDate ? config.googleExpiryDate.getTime() : undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    try {
      await persistGoogleTokens(config.userId, tokens);
    } catch (error) {
      console.error("[Meta Form] Falha ao atualizar tokens Google automaticamente:", error);
    }
  });

  return oauth2Client;
}

async function getAuthenticatedOAuthClient(userId: string, origin: string) {
  const [config, appConfig] = await Promise.all([getConfigByUserId(userId), getGoogleOAuthAppConfig()]);
  if (!config) {
    return null;
  }

  if (!appConfig) {
    throw new Error("A conexao Google deste modulo ainda nao foi configurada no aplicativo.");
  }

  const accessToken = normalizeText(config.googleAccessToken);
  const refreshToken = normalizeText(config.googleRefreshToken);
  if (!accessToken && !refreshToken) {
    return null;
  }

  const oauthClient = createOAuthClient(appConfig, config, origin);

  try {
    const tokenResult = await oauthClient.getAccessToken();
    const resolvedToken =
      typeof tokenResult === "string"
        ? tokenResult
        : normalizeText((tokenResult as { token?: string | null } | null | undefined)?.token);
    if (!resolvedToken && refreshToken) {
      await clearGoogleTokens(userId);
      throw createReconnectRequiredError();
    }
  } catch (error) {
    if ((error as any)?.requiresReconnect) {
      throw error;
    }
    if (shouldReconnectGoogleSession(error)) {
      await clearGoogleTokens(userId);
      throw createReconnectRequiredError();
    }
    console.error("[Meta Form] Falha ao renovar token Google:", error);
  }

  return oauthClient;
}

export async function upsertMetaFormGoogleConfig(
  userId: string,
  input: {
    googleApiKey?: string | null;
    googleClientId?: string | null;
    googleClientSecret?: string | null;
  },
) {
  const existing = await getConfigByUserId(userId);
  const nextApiKey = normalizeText(input.googleApiKey) || existing?.googleApiKey || null;
  const nextClientId = normalizeText(input.googleClientId) || existing?.googleClientId || null;
  const nextClientSecret = normalizeText(input.googleClientSecret) || existing?.googleClientSecret || null;

  const clientChanged =
    (existing?.googleClientId || null) !== nextClientId || (existing?.googleClientSecret || null) !== nextClientSecret;

  if (existing) {
    const result = await pool.query(
      `
        UPDATE meta_form_google_configs
        SET
          google_api_key = $2,
          google_client_id = $3,
          google_client_secret = $4,
          google_access_token = $5,
          google_refresh_token = $6,
          google_token_type = $7,
          google_expiry_date = $8,
          google_scope = $9,
          google_email = $10,
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `,
      [
        userId,
        nextApiKey,
        nextClientId,
        nextClientSecret,
        clientChanged ? null : existing.googleAccessToken,
        clientChanged ? null : existing.googleRefreshToken,
        clientChanged ? null : existing.googleTokenType,
        clientChanged ? null : existing.googleExpiryDate,
        clientChanged ? null : existing.googleScope,
        clientChanged ? null : existing.googleEmail,
      ],
    );

    return mapConfigRow(result.rows[0]);
  }

  const result = await pool.query(
    `
      INSERT INTO meta_form_google_configs (
        user_id,
        google_api_key,
        google_client_id,
        google_client_secret
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [userId, nextApiKey, nextClientId, nextClientSecret],
  );

  return mapConfigRow(result.rows[0]);
}

export async function getMetaFormGoogleStatus(userId: string): Promise<GoogleConfigStatus> {
  const [config, appConfig] = await Promise.all([getConfigByUserId(userId), getGoogleOAuthAppConfig()]);
  const connected = !!(normalizeText(config?.googleAccessToken) || normalizeText(config?.googleRefreshToken));
  const missingScopes = connected ? getMissingDriveScopes(config?.googleScope) : [];
  return {
    configured: !!appConfig,
    connected,
    scopeReady: missingScopes.length === 0,
    missingScopes,
    maskedApiKey: maskSecret(appConfig?.apiKey),
    maskedClientId: maskSecret(appConfig?.clientId),
    maskedClientSecret: maskSecret(appConfig?.clientSecret),
    connectedEmail: normalizeText(config?.googleEmail),
  };
}

export async function createMetaFormGoogleAuthUrl(
  userId: string,
  origin: string,
  options?: {
    returnTo?: string | null;
    mode?: string | null;
    appOrigin?: string | null;
  },
): Promise<string> {
  const appConfig = await getGoogleOAuthAppConfig();
  if (!appConfig) {
    throw new Error("A conexao Google deste modulo ainda nao foi configurada no aplicativo.");
  }

  const config = await ensureConfigByUserId(userId);
  const oauth2Client = createOAuthClient(appConfig, config, origin);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: GOOGLE_SCOPES,
    state: encodeState({
      userId,
      returnTo: normalizeText(options?.returnTo) || "/meta-formulario",
      mode: normalizeAuthMode(options?.mode),
      appOrigin: normalizeText(options?.appOrigin) || origin,
    }),
  });
}

export async function handleMetaFormGoogleCallback(params: {
  code: string;
  state: string;
  origin: string;
}) {
  const decodedState = decodeState(params.state);
  const userId = normalizeText(decodedState?.userId);
  if (!userId) {
    throw new Error("Estado da autorizacao Google invalido.");
  }

  const [config, appConfig] = await Promise.all([ensureConfigByUserId(userId), getGoogleOAuthAppConfig()]);
  if (!appConfig) {
    throw new Error("A conexao Google deste modulo ainda nao foi configurada no aplicativo.");
  }

  const oauth2Client = createOAuthClient(appConfig, config, params.origin);
  let tokenResponse;
  try {
    tokenResponse = await oauth2Client.getToken(params.code);
  } catch (error) {
    if (shouldReconnectGoogleSession(error)) {
      throw createReconnectRequiredError("A autorizacao Google expirou antes de concluir. Clique em conectar novamente.");
    }
    throw error;
  }
  const tokens = tokenResponse.tokens;
  const nextAccessToken = normalizeText(tokens.access_token);
  const nextRefreshToken = normalizeText(tokens.refresh_token) || config.googleRefreshToken;
  const nextTokenType = normalizeText(tokens.token_type);
  const nextScope = normalizeText(tokens.scope);
  const nextExpiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  await pool.query(
    `
      UPDATE meta_form_google_configs
      SET
        google_access_token = $2,
        google_refresh_token = $3,
        google_token_type = $4,
        google_expiry_date = $5,
        google_scope = $6,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId, nextAccessToken, nextRefreshToken, nextTokenType, nextExpiryDate, nextScope],
  );

  const authClient = createOAuthClient(appConfig, config, params.origin);
  authClient.setCredentials({
    access_token: nextAccessToken || undefined,
    refresh_token: nextRefreshToken || undefined,
    token_type: nextTokenType || undefined,
    expiry_date: tokens.expiry_date || undefined,
  });

  let googleEmail = config.googleEmail;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: authClient });
    const userInfo = await oauth2.userinfo.get();
    googleEmail = normalizeText(userInfo.data.email);
  } catch (error) {
    console.error("[Meta Form] Falha ao ler email da conta Google apos callback:", error);
  }

  await pool.query(
    `
      UPDATE meta_form_google_configs
      SET
        google_access_token = $2,
        google_refresh_token = $3,
        google_token_type = $4,
        google_expiry_date = $5,
        google_scope = $6,
        google_email = $7,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      userId,
      nextAccessToken,
      nextRefreshToken,
      nextTokenType,
      nextExpiryDate,
      nextScope,
      googleEmail,
    ],
  );

  return {
    userId,
    returnTo: normalizeText(decodedState?.returnTo) || "/meta-formulario",
    mode: normalizeAuthMode(decodedState?.mode),
    appOrigin: normalizeText(decodedState?.appOrigin) || params.origin,
    googleEmail,
  };
}

export async function disconnectMetaFormGoogle(userId: string) {
  const config = await getConfigByUserId(userId);
  if (!config) {
    return;
  }

  await pool.query(
    `
      UPDATE meta_form_google_configs
      SET
        google_access_token = NULL,
        google_refresh_token = NULL,
        google_token_type = NULL,
        google_expiry_date = NULL,
        google_scope = NULL,
        google_email = NULL,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId],
  );
}

export async function listGoogleSpreadsheetFilesForUser(params: {
  userId: string;
  origin: string;
  query?: string | null;
  pageSize?: number;
}) {
  const [config, appConfig] = await Promise.all([getConfigByUserId(params.userId), getGoogleOAuthAppConfig()]);
  if (!appConfig) {
    return {
      connected: false,
      requiresReconnect: false,
      spreadsheets: [] as GoogleDriveFile[],
      message: "A conexao Google deste modulo ainda nao foi configurada no aplicativo.",
    };
  }

  const connected = !!(normalizeText(config?.googleAccessToken) || normalizeText(config?.googleRefreshToken));
  if (!connected) {
    return {
      connected: false,
      requiresReconnect: false,
      spreadsheets: [] as GoogleDriveFile[],
      message: "Conecte o Google Drive para buscar planilhas pelo nome.",
    };
  }

  const missingScopes = getMissingDriveScopes(config?.googleScope);
  if (missingScopes.length) {
    return {
      connected: true,
      requiresReconnect: true,
      spreadsheets: [] as GoogleDriveFile[],
      message:
        "Sua conexao Google ainda nao liberou Google Drive e Google Planilhas. Desconecte e conecte novamente, marcando todas as permissoes pedidas.",
    };
  }

  let authClient;
  try {
    authClient = await getAuthenticatedOAuthClient(params.userId, params.origin);
  } catch (error) {
    if ((error as any)?.requiresReconnect) {
      return {
        connected: true,
        requiresReconnect: true,
        spreadsheets: [] as GoogleDriveFile[],
        message: error instanceof Error ? error.message : "Reconecte o Google para continuar.",
      };
    }
    throw error;
  }

  if (!authClient) {
    return {
      connected: false,
      requiresReconnect: false,
      spreadsheets: [] as GoogleDriveFile[],
      message: "Conecte o Google Drive para buscar planilhas pelo nome.",
    };
  }

  const drive = google.drive({ version: "v3", auth: authClient });
  const queryParts = ["mimeType='application/vnd.google-apps.spreadsheet'", "trashed=false"];
  const normalizedQuery = normalizeText(params.query);
  if (normalizedQuery) {
    queryParts.push(`name contains '${escapeDriveQueryValue(normalizedQuery)}'`);
  }

  let response;
  try {
    response = await drive.files.list({
      q: queryParts.join(" and "),
      pageSize: params.pageSize || 20,
      orderBy: "modifiedTime desc,name_natural",
      fields: "files(id,name,modifiedTime,owners(displayName,emailAddress),webViewLink)",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
  } catch (error: any) {
    if (shouldReconnectGoogleSession(error)) {
      await clearGoogleTokens(params.userId);
      return {
        connected: true,
        requiresReconnect: true,
        spreadsheets: [] as GoogleDriveFile[],
        message:
          "Nao foi possivel validar a sessao do Google Drive agora. Desconecte e conecte novamente para renovar a autorizacao.",
      };
    }
    return {
      connected: true,
      requiresReconnect: false,
      spreadsheets: [] as GoogleDriveFile[],
      message: describeGoogleAccessFailure(error),
    };
  }

  const files = response.data.files || [];
  return {
    connected: true,
    requiresReconnect: false,
    spreadsheets: files
      .filter((file) => normalizeText(file.id) && normalizeText(file.name))
      .map((file) => ({
        spreadsheetId: String(file.id),
        name: String(file.name),
        url: normalizeText(file.webViewLink),
        modifiedTime: normalizeText(file.modifiedTime),
        ownerEmail: normalizeText(file.owners?.[0]?.emailAddress),
        ownerName: normalizeText(file.owners?.[0]?.displayName),
      })),
  };
}

export async function resolveGoogleSpreadsheetForUser(params: {
  userId: string;
  origin: string;
  spreadsheetId: string;
}): Promise<ResolvedSpreadsheet> {
  let authClient;
  try {
    authClient = await getAuthenticatedOAuthClient(params.userId, params.origin);
  } catch (error) {
    if ((error as any)?.requiresReconnect) {
      throw createReconnectRequiredError();
    }
    throw error;
  }

  if (!authClient) {
    throw new Error("Conecte o Google Drive antes de selecionar uma planilha.");
  }

  const sheets = google.sheets({ version: "v4", auth: authClient });
  let response;
  try {
    response = await sheets.spreadsheets.get({
      spreadsheetId: params.spreadsheetId,
      fields: "properties(title),sheets(properties(sheetId,title,index))",
      includeGridData: false,
    });
  } catch (error) {
    if (shouldReconnectGoogleSession(error)) {
      await clearGoogleTokens(params.userId);
      throw createReconnectRequiredError();
    }
    throw error;
  }

  const spreadsheetTitle = normalizeText(response.data.properties?.title) || "Planilha Google";
  const sheetsList = response.data.sheets || [];
  const firstSheet =
    sheetsList
      .map((sheet) => sheet.properties)
      .filter((properties) => properties?.title)
      .sort((left, right) => Number(left?.index || 0) - Number(right?.index || 0))[0] || null;

  return {
    spreadsheetId: params.spreadsheetId,
    spreadsheetTitle,
    defaultSheetName: normalizeText(firstSheet?.title) || "Página1",
    defaultSheetGid:
      firstSheet?.sheetId === undefined || firstSheet?.sheetId === null ? null : String(firstSheet.sheetId),
  };
}

export async function getMetaFormGoogleSheetsClient(userId: string, origin: string) {
  const authClient = await getAuthenticatedOAuthClient(userId, origin);
  if (!authClient) {
    return null;
  }

  return google.sheets({ version: "v4", auth: authClient });
}

export const __metaFormGoogleDriveTestUtils = {
  buildGoogleOAuthAppConfig,
  describeGoogleAccessFailure,
  normalizeAuthMode,
  shouldReconnectGoogleSession,
  extractGoogleErrorSummary,
};
