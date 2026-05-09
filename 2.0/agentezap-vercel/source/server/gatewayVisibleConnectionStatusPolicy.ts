type GatewayVisibleConnection = {
  isConnected?: boolean | null;
  providerStatus?: string | null;
  qrCode?: string | null;
  provider?: string | null;
  connectionMethod?: string | null;
};

type GatewayVisibleStatus = {
  isConnected?: boolean | null;
  providerStatus?: string | null;
  qrCode?: string | null;
  provider?: string | null;
};

const HARD_DISCONNECTED_PROVIDER_STATUSES = new Set([
  "auth_failed",
  "deleted",
  "invalid_session",
  "logged_out",
  "logout",
  "pairing_required",
  "qr_required",
  "removed",
]);

function normalizeStatus(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function isBaileysGatewayConnection(connection: GatewayVisibleConnection): boolean {
  const provider = normalizeStatus(connection.provider || "baileys");
  const method = normalizeStatus(connection.connectionMethod || "qr");
  return provider === "baileys" && method !== "coexistence";
}

export function persistedGatewayConnectionLooksConnected(connection: GatewayVisibleConnection): boolean {
  if (!isBaileysGatewayConnection(connection)) {
    return false;
  }

  return (
    connection.isConnected === true ||
    normalizeStatus(connection.providerStatus) === "connected"
  );
}

export function gatewayStatusLooksConnected(status?: GatewayVisibleStatus | null): boolean {
  if (!status) {
    return false;
  }

  return (
    status.isConnected === true ||
    normalizeStatus(status.providerStatus) === "connected"
  );
}

export function gatewayStatusLooksHardDisconnected(status?: GatewayVisibleStatus | null): boolean {
  if (!status) {
    return false;
  }

  if (status.qrCode) {
    return true;
  }

  return HARD_DISCONNECTED_PROVIDER_STATUSES.has(normalizeStatus(status.providerStatus));
}

export function shouldHoldGatewayConnectionAsRecovering(
  connection: GatewayVisibleConnection,
  status?: GatewayVisibleStatus | null,
): boolean {
  if (!status || gatewayStatusLooksConnected(status)) {
    return false;
  }

  if (!persistedGatewayConnectionLooksConnected(connection)) {
    return false;
  }

  return !gatewayStatusLooksHardDisconnected(status);
}

export type { GatewayVisibleConnection, GatewayVisibleStatus };
