import type { InsertWhatsappConnection, WhatsappConnection } from "@shared/schema";

type ConnectionLike = Partial<
  Pick<
    WhatsappConnection,
    | "phoneNumber"
    | "provider"
    | "connectionMethod"
    | "connectionType"
    | "connectionName"
    | "providerStatus"
    | "providerConfig"
    | "isConnected"
    | "isPrimary"
  >
>;

export const INTERNAL_SIMULATOR_CONNECTION_NAME = "Simulador Estamparia";
export const INTERNAL_SIMULATOR_SOURCE = "estamparia-simulator";

function normalizeText(value?: string | null): string {
  return String(value || "").trim();
}

function normalizeLower(value?: string | null): string {
  return normalizeText(value).toLowerCase();
}

function normalizeProviderConfigSource(providerConfig?: Record<string, unknown> | null): string {
  if (!providerConfig || typeof providerConfig !== "object" || Array.isArray(providerConfig)) {
    return "";
  }

  return normalizeLower(typeof providerConfig.source === "string" ? providerConfig.source : null);
}

export function isSimulatorPhoneNumber(phoneNumber?: string | null): boolean {
  return normalizeLower(phoneNumber).startsWith("sim-");
}

export function hasInternalSimulatorIdentity(connection?: ConnectionLike | null): boolean {
  if (!connection) return false;

  return (
    normalizeLower(connection.provider) === "simulator" ||
    normalizeLower(connection.connectionMethod) === "simulator" ||
    normalizeLower(connection.connectionType) === "simulator" ||
    normalizeLower(connection.connectionName) === INTERNAL_SIMULATOR_CONNECTION_NAME.toLowerCase() ||
    normalizeProviderConfigSource((connection.providerConfig as Record<string, unknown> | null | undefined) || null) ===
      INTERNAL_SIMULATOR_SOURCE
  );
}

export function isInternalOnlySimulatorConnection(connection?: ConnectionLike | null): boolean {
  if (!hasInternalSimulatorIdentity(connection)) return false;

  const hasOperationalSignal =
    connection?.isConnected === true || normalizeLower(connection?.providerStatus) === "connected";
  const phoneNumber = normalizeText(connection?.phoneNumber);

  if (hasOperationalSignal) return false;
  if (!phoneNumber) return true;

  return isSimulatorPhoneNumber(phoneNumber);
}

export function shouldNormalizeRealWhatsappConnection(connection?: ConnectionLike | null): boolean {
  return hasInternalSimulatorIdentity(connection) && !isInternalOnlySimulatorConnection(connection);
}

export function buildInternalSimulatorConnectionInsert(userId: string): InsertWhatsappConnection {
  return {
    userId,
    phoneNumber: `sim-${userId.split("-")[0] || "user"}`,
    isConnected: false,
    provider: "simulator",
    connectionMethod: "simulator",
    providerStatus: "inactive",
    providerConfig: { source: INTERNAL_SIMULATOR_SOURCE },
    connectionName: INTERNAL_SIMULATOR_CONNECTION_NAME,
    connectionType: "simulator",
    isPrimary: false,
    aiEnabled: true,
  };
}

export function buildRealWhatsappConnectionNormalization(
  connection?: ConnectionLike | null,
): Partial<InsertWhatsappConnection> {
  if (!hasInternalSimulatorIdentity(connection)) return {};

  const providerConfig =
    connection?.providerConfig && typeof connection.providerConfig === "object" && !Array.isArray(connection.providerConfig)
      ? { ...(connection.providerConfig as Record<string, unknown>) }
      : null;

  if (providerConfig && Object.prototype.hasOwnProperty.call(providerConfig, "source")) {
    delete providerConfig.source;
  }

  return {
    provider: "baileys",
    connectionMethod: "qr",
    providerStatus:
      connection?.isConnected === true || normalizeLower(connection?.providerStatus) === "connected"
        ? "connected"
        : "inactive",
    connectionType:
      normalizeLower(connection?.connectionType) === "simulator"
        ? connection?.isPrimary
          ? "primary"
          : "secondary"
        : connection?.connectionType || undefined,
    connectionName:
      normalizeLower(connection?.connectionName) === INTERNAL_SIMULATOR_CONNECTION_NAME.toLowerCase()
        ? null
        : connection?.connectionName || undefined,
    providerConfig: providerConfig && Object.keys(providerConfig).length > 0 ? providerConfig : null,
  };
}
