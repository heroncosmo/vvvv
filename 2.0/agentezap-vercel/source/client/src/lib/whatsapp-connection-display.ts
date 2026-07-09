import type { WhatsappConnection } from "@shared/schema";

type ConnectionLike = Partial<
  Pick<
    WhatsappConnection,
    | "id"
    | "phoneNumber"
    | "connectionName"
    | "isConnected"
    | "provider"
    | "connectionMethod"
    | "providerStatus"
  >
> & {
  isRecovering?: boolean | null;
};

function normalizeText(value?: string | null): string {
  return String(value || "").trim();
}

export function isSimulatorWhatsappConnection(_connection?: ConnectionLike | null): boolean {
  return false;
}

export function isSimulatorActiveConnection(_connection?: ConnectionLike | null): boolean {
  return false;
}

function isOfficialProviderConnection(connection?: ConnectionLike | null): boolean {
  const provider = normalizeText(connection?.provider).toLowerCase();
  const connectionMethod = normalizeText(connection?.connectionMethod).toLowerCase();
  return provider === "meta_cloud_api" || connectionMethod === "coexistence";
}

export function isAppVisibleOperationalWhatsappConnection(
  connection?: ConnectionLike | null,
): boolean {
  if (!connection) {
    return false;
  }

  if (connection.isRecovering === true) {
    return false;
  }

  if (!isOfficialProviderConnection(connection)) {
    return connection.isConnected === true;
  }

  const providerStatus = normalizeText(connection.providerStatus).toLowerCase();
  return connection.isConnected === true || providerStatus === "connected";
}

export function getConnectionPrimaryLabel(connection?: ConnectionLike | null): string {
  const phoneNumber = normalizeText(connection?.phoneNumber);
  const connectionName = normalizeText(connection?.connectionName);
  const connectionId = normalizeText(connection?.id);

  if (connectionName) {
    return connectionName;
  }

  if (phoneNumber) {
    return `Conexão ${phoneNumber}`;
  }

  return connectionId ? `Conexão ${connectionId.slice(0, 4)}` : "Conexão";
}

export function getConnectionStatusMeta(connection?: ConnectionLike | null): {
  label: string;
  tone: "connected" | "simulator" | "offline" | "recovering";
} {
  if (isAppVisibleOperationalWhatsappConnection(connection)) {
    return { label: "Conectado", tone: "connected" };
  }

  if (connection?.isRecovering === true) {
    return { label: "Reconectando", tone: "recovering" };
  }

  return { label: "Desconectado", tone: "offline" };
}
