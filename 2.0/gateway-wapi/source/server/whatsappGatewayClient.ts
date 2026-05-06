const DEFAULT_GATEWAY_URL = "http://127.0.0.1:5001";
const DEFAULT_INTERNAL_TOKEN = "agentezap-internal-wa-gateway";
const DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS = 90_000;

function getGatewayBaseUrl(): string {
  return (process.env.WA_GATEWAY_URL || DEFAULT_GATEWAY_URL).trim().replace(/\/+$/, "");
}

function getInternalToken(): string {
  return (process.env.WA_GATEWAY_INTERNAL_TOKEN || DEFAULT_INTERNAL_TOKEN).trim();
}

function getGatewayRequestTimeoutMs(): number {
  const parsed = Number(process.env.WA_GATEWAY_REQUEST_TIMEOUT_MS || "");

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS;
  }

  return Math.max(1_000, Math.floor(parsed));
}

async function requestGateway<T>(method: string, path: string, body?: unknown): Promise<T> {
  return requestGatewayWithHeaders<T>(method, path, undefined, body);
}

async function requestGatewayWithHeaders<T>(
  method: string,
  path: string,
  extraHeaders?: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const timeoutMs = getGatewayRequestTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  let text: string;

  try {
    response = await fetch(`${getGatewayBaseUrl()}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-wa-gateway-token": getInternalToken(),
        ...(extraHeaders || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    text = await response.text();
  } catch (error) {
    if ((error as any)?.name === "AbortError" || controller.signal.aborted) {
      throw new Error(`Gateway request timed out after ${timeoutMs}ms: ${method} ${path}`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      const preview = text.trim().slice(0, 180);
      throw new Error(`Gateway returned non-JSON response (${response.status}): ${preview}`);
    }
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `Gateway request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export async function getGatewayInstanceStatus(connectionId: string) {
  return requestGateway("GET", `/api/integration/instances/${connectionId}/status`);
}

export async function getGatewayBulkInstanceStatuses(connectionIds: string[]) {
  return requestGateway("POST", "/api/integration/instances/status/bulk", {
    instanceIds: connectionIds,
  });
}

export async function getGatewayInstanceDevice(connectionId: string) {
  return requestGateway("GET", `/api/integration/instances/${connectionId}/device`);
}

export async function connectGatewayInstance(connectionId: string) {
  return requestGateway("POST", `/api/integration/instances/${connectionId}/connect`, {});
}

export async function disconnectGatewayInstance(connectionId: string) {
  return requestGateway("POST", `/api/integration/instances/${connectionId}/disconnect`, {});
}

export async function resetGatewayInstance(
  connectionId: string,
  body?: Record<string, unknown>,
) {
  return requestGateway("POST", `/api/integration/instances/${connectionId}/reset`, body || {});
}

export async function listGatewayInstanceConversations(connectionId: string) {
  return requestGateway("GET", `/api/integration/instances/${connectionId}/conversations`);
}

export async function listGatewayInstanceMessages(connectionId: string, conversationId: string) {
  return requestGateway("GET", `/api/integration/instances/${connectionId}/conversations/${conversationId}/messages`);
}

export async function syncGatewayInstanceGroupHistory(connectionId: string, conversationId: string) {
  return requestGateway(
    "POST",
    `/api/integration/instances/${connectionId}/conversations/${conversationId}/group-history-sync`,
    {},
  );
}

export async function listGatewayInstanceContacts(connectionId: string) {
  return requestGateway("GET", `/api/integration/instances/${connectionId}/contacts`);
}

export async function listGatewayInstanceGroups(connectionId: string) {
  return requestGateway("GET", `/api/integration/instances/${connectionId}/groups`);
}

export async function previewGatewayStatusAudience(connectionId: string) {
  return requestGateway(
    "GET",
    `/api/integration/instances/${connectionId}/status-posts/preview-audience`,
  );
}

export async function sendGatewayStatusPost(
  connectionId: string,
  body: Record<string, unknown>,
) {
  return requestGateway(
    "POST",
    `/api/integration/instances/${connectionId}/status-posts/send`,
    body,
  );
}

export async function sendGatewayInstanceText(
  connectionId: string,
  body: Record<string, unknown>,
) {
  return requestGateway("POST", `/api/integration/instances/${connectionId}/messages/send`, body);
}

export async function sendGatewayInstanceMedia(
  connectionId: string,
  body: Record<string, unknown>,
) {
  return requestGateway("POST", `/api/integration/instances/${connectionId}/messages/send-media`, body);
}

export async function sendGatewayInstanceGroupBulk(
  connectionId: string,
  body: Record<string, unknown>,
) {
  return requestGateway("POST", `/api/integration/instances/${connectionId}/groups/send-bulk`, body);
}

export async function listGatewayManagedInstances(userId: string) {
  return requestGatewayWithHeaders(
    "GET",
    "/api/integration/instances",
    { "x-gateway-user-id": userId },
  );
}

export async function createGatewayManagedInstance(
  userId: string,
  body: Record<string, unknown>,
) {
  return requestGatewayWithHeaders(
    "POST",
    "/api/integration/instances",
    { "x-gateway-user-id": userId },
    body,
  );
}

export async function deleteGatewayManagedInstance(connectionId: string) {
  return requestGateway("DELETE", `/api/integration/instances/${connectionId}`);
}

export async function requestGatewayInstancePairingCode(
  connectionId: string,
  phoneNumber: string,
) {
  return requestGateway("POST", `/api/integration/instances/${connectionId}/pairing-code`, {
    phoneNumber,
  });
}
