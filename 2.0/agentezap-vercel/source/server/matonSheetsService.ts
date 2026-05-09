const MATON_HTTP_TIMEOUT_MS = 12_000;

export type MatonSheetsConnectionSummary = {
  connectionId: string;
  status: string;
  app: string;
  method: string | null;
  url: string | null;
  email: string | null;
  displayName: string | null;
  metadata: Record<string, unknown>;
};

export type MatonSpreadsheetFileSummary = {
  spreadsheetId: string;
  name: string;
  url: string | null;
  modifiedTime: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
};

type MatonRequestOptions = {
  apiKey: string;
  connectionId?: string | null;
  method?: string;
  body?: unknown;
};

type MatonBatchGetResponse = {
  valueRanges?: Array<{
    values?: unknown[][];
  }>;
};

type MatonDriveFilesResponse = {
  files?: Array<{
    id?: string;
    name?: string;
    webViewLink?: string;
    modifiedTime?: string;
    owners?: Array<{
      displayName?: string;
      emailAddress?: string;
    }>;
  }>;
  nextPageToken?: string;
};

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function normalizeText(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

async function matonFetchJson<T>(url: string, options: MatonRequestOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MATON_HTTP_TIMEOUT_MS);
  const hasBody = options.body !== undefined;

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...(options.connectionId ? { "Maton-Connection": options.connectionId } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Maton HTTP ${response.status}: ${errorText.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

function buildDriveSpreadsheetQuery(searchTerm: string): string {
  const clauses = ["mimeType='application/vnd.google-apps.spreadsheet'", "trashed=false"];
  const term = String(searchTerm || "").trim();
  if (term) {
    let escaped = "";
    for (const character of term) {
      if (character === "\\") {
        escaped += "\\\\";
      } else if (character === "'") {
        escaped += "\\'";
      } else {
        escaped += character;
      }
    }
    clauses.push(`name contains '${escaped}'`);
  }

  return clauses.join(" and ");
}

export function getMatonApiKey(): string {
  return String(process.env.META_FORM_MATON_API_KEY || process.env.MATON_API_KEY || "").trim();
}

export function getMaskedMatonApiKey(): string | null {
  const apiKey = getMatonApiKey();
  if (!apiKey) {
    return null;
  }

  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`;
  }

  return `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}`;
}

export async function listMatonGoogleSheetsConnections(apiKey: string): Promise<MatonSheetsConnectionSummary[]> {
  return listMatonConnections(apiKey, "google-sheets");
}

export async function listMatonGoogleDriveConnections(apiKey: string): Promise<MatonSheetsConnectionSummary[]> {
  return listMatonConnections(apiKey, "google-drive");
}

async function listMatonConnections(apiKey: string, app: "google-sheets" | "google-drive"): Promise<MatonSheetsConnectionSummary[]> {
  const response = await matonFetchJson<{ connections?: any[] }>(
    `https://ctrl.maton.ai/connections?app=${app}&status=ACTIVE`,
    { apiKey },
  );

  return (response.connections || []).map((connection) => ({
    connectionId: String(connection.connection_id || ""),
    status: String(connection.status || ""),
    app: String(connection.app || ""),
    method: normalizeText(connection.method),
    url: normalizeText(connection.url),
    email: normalizeEmail(typeof connection?.metadata?.email === "string" ? connection.metadata.email : null),
    displayName: normalizeText(connection?.metadata?.name),
    metadata: connection?.metadata && typeof connection.metadata === "object" ? connection.metadata : {},
  }));
}

export async function createMatonGoogleDriveConnection(apiKey: string): Promise<{ url: string | null; connectionId: string | null }> {
  const response = await matonFetchJson<{ connection?: any }>("https://ctrl.maton.ai/connections", {
    apiKey,
    method: "POST",
    body: { app: "google-drive" },
  });

  return {
    url: normalizeText(response.connection?.url),
    connectionId: normalizeText(response.connection?.connection_id),
  };
}

export async function searchMatonSpreadsheetFiles(params: {
  apiKey: string;
  connectionId?: string | null;
  query?: string | null;
  pageSize?: number;
}): Promise<MatonSpreadsheetFileSummary[]> {
  const pageSize = Math.min(25, Math.max(1, Number(params.pageSize || 10)));
  const query = buildDriveSpreadsheetQuery(params.query || "");
  const fields = "files(id,name,webViewLink,modifiedTime,owners(displayName,emailAddress)),nextPageToken";
  const url = new URL("https://gateway.maton.ai/google-drive/drive/v3/files");
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("fields", fields);
  url.searchParams.set("q", query);
  url.searchParams.set("orderBy", "modifiedTime desc");

  const response = await matonFetchJson<MatonDriveFilesResponse>(url.toString(), {
    apiKey: params.apiKey,
    connectionId: params.connectionId || undefined,
  });

  return (response.files || [])
    .filter((file) => file.id && file.name)
    .map((file) => ({
      spreadsheetId: String(file.id || ""),
      name: String(file.name || ""),
      url: normalizeText(file.webViewLink),
      modifiedTime: normalizeText(file.modifiedTime),
      ownerEmail: normalizeEmail(file.owners?.[0]?.emailAddress),
      ownerName: normalizeText(file.owners?.[0]?.displayName),
    }));
}

export async function fetchMatonSpreadsheetValues(params: {
  apiKey: string;
  connectionId?: string | null;
  spreadsheetId: string;
  range: string;
}): Promise<string[][]> {
  const spreadsheetId = String(params.spreadsheetId || "").trim();
  const range = String(params.range || "").trim();
  if (!spreadsheetId || !range) {
    return [];
  }

  const rangeCandidates: string[] = [];
  const pushCandidate = (candidate: string) => {
    const normalized = String(candidate || "").trim();
    if (!normalized || rangeCandidates.includes(normalized)) {
      return;
    }
    rangeCandidates.push(normalized);
  };

  pushCandidate(range);

  const bangIndex = range.indexOf("!");
  if (bangIndex >= 0 && bangIndex < range.length - 1) {
    pushCandidate(range.slice(bangIndex + 1));
  }

  let lastError: unknown = null;

  for (const candidate of rangeCandidates) {
    try {
      const response = await matonFetchJson<MatonBatchGetResponse>(
        `https://gateway.maton.ai/google-sheets/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${encodeURIComponent(candidate)}`,
        {
          apiKey: params.apiKey,
          connectionId: params.connectionId || undefined,
        },
      );

      const rows = response.valueRanges?.[0]?.values || [];
      return rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Falha ao ler dados do Google Sheets via Maton.");
}
