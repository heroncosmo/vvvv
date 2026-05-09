import type { WhatsappConnection } from "@shared/schema";

import { eq } from "drizzle-orm";
import { whatsappConnections } from "@shared/schema";

import { db } from "./db";
import {
  getGatewayBulkInstanceStatuses,
  getGatewayInstanceDevice,
  getGatewayInstanceStatus,
  isGatewayClientEnabled,
} from "./whatsappGatewayClient";
import type {
  InstanceDevicePayload,
  InstanceStatusPayload,
} from "./whatsappInstanceApiService";

type GatewayStatusLike = {
  instanceId?: string;
  phoneNumber?: string | null;
  isConnected?: boolean;
  qrCode?: string | null;
  provider?: string | null;
  providerStatus?: string | null;
};

function isOfficialProviderConnection(connection: {
  provider?: string | null;
  connectionMethod?: string | null;
}): boolean {
  const provider = String(connection.provider || "").trim().toLowerCase();
  const connectionMethod = String(connection.connectionMethod || "").trim().toLowerCase();
  return provider === "meta_cloud_api" || connectionMethod === "coexistence";
}

function isBaileysQrLikeConnection(connection: {
  provider?: string | null;
  connectionMethod?: string | null;
}): boolean {
  const provider = String(connection.provider || "").trim().toLowerCase();
  const connectionMethod = String(connection.connectionMethod || "").trim().toLowerCase();
  return provider === "baileys" && connectionMethod !== "coexistence";
}

function isOperationallyConnected(connection: WhatsappConnection): boolean {
  if (connection.isConnected === true) {
    return true;
  }

  const normalizedProviderStatus = String(connection.providerStatus || "").trim().toLowerCase();
  if (normalizedProviderStatus !== "connected") {
    return false;
  }

  if (isOfficialProviderConnection(connection)) {
    return true;
  }

  return isBaileysQrLikeConnection(connection);
}

export function buildGatewayRuntimeFallbackStatus(
  connection: WhatsappConnection,
): GatewayStatusLike {
  const isConnected = isOperationallyConnected(connection);
  const persistedProviderStatus = connection.providerStatus || null;
  const providerStatus = isOfficialProviderConnection(connection)
    ? persistedProviderStatus || (isConnected ? "connected" : "inactive")
    : persistedProviderStatus || (isConnected ? "connected" : "disconnected");

  return {
    instanceId: connection.id,
    phoneNumber: connection.phoneNumber || null,
    isConnected,
    qrCode: connection.qrCode || null,
    provider: connection.provider || null,
    providerStatus,
  };
}

async function resolveConnectionSnapshot(
  connectionOrId: string | WhatsappConnection,
): Promise<WhatsappConnection | undefined> {
  if (typeof connectionOrId !== "string") {
    if (
      connectionOrId.provider !== undefined &&
      connectionOrId.providerStatus !== undefined &&
      connectionOrId.connectionMethod !== undefined
    ) {
      return connectionOrId;
    }

    const [fullConnection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connectionOrId.id))
      .limit(1);
    return (fullConnection as WhatsappConnection | undefined) || connectionOrId;
  }

  const [fullConnection] = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.id, connectionOrId))
    .limit(1);
  return fullConnection as WhatsappConnection | undefined;
}

export async function getAppVisibleGatewayInstanceStatus(
  connection: WhatsappConnection,
): Promise<GatewayStatusLike> {
  const snapshot = (await resolveConnectionSnapshot(connection)) || connection;
  if (!isGatewayClientEnabled()) {
    return buildGatewayRuntimeFallbackStatus(snapshot);
  }

  try {
    return await getGatewayInstanceStatus(snapshot.id);
  } catch {
    return buildGatewayRuntimeFallbackStatus(snapshot);
  }
}

export async function getAppVisibleGatewayBulkStatusMap(
  connections: Array<WhatsappConnection | { id: string; phoneNumber?: string | null; qrCode?: string | null; provider?: string | null; providerStatus?: string | null; isConnected?: boolean | null; connectionMethod?: string | null }>,
): Promise<Map<string, GatewayStatusLike>> {
  const validConnections = connections
    .map((connection) => ({
      id: String(connection.id || "").trim(),
      phoneNumber: connection.phoneNumber || null,
      qrCode: connection.qrCode || null,
      provider: connection.provider || null,
      connectionMethod: connection.connectionMethod || null,
      providerStatus: connection.providerStatus || null,
      isConnected: connection.isConnected === true,
    }))
    .filter((connection) => connection.id);

  if (validConnections.length === 0) {
    return new Map();
  }

  if (!isGatewayClientEnabled()) {
    return new Map(
      validConnections.map((connection) => [
        connection.id,
        buildGatewayRuntimeFallbackStatus({
          id: connection.id,
          phoneNumber: connection.phoneNumber,
          qrCode: connection.qrCode,
          provider: connection.provider,
          connectionMethod: connection.connectionMethod,
          providerStatus: connection.providerStatus,
          isConnected: connection.isConnected,
        } as WhatsappConnection),
      ]),
    );
  }

  try {
    const response = await getGatewayBulkInstanceStatuses(validConnections.map((connection) => connection.id)) as
      | { items?: GatewayStatusLike[] }
      | GatewayStatusLike[];
    const items = Array.isArray(response)
      ? response
      : Array.isArray(response?.items)
        ? response.items
        : [];

    const map = new Map<string, GatewayStatusLike>();
    for (const connection of validConnections) {
      const found = items.find((item) => item && item.instanceId === connection.id);
      map.set(
        connection.id,
        found ||
          buildGatewayRuntimeFallbackStatus({
            id: connection.id,
            phoneNumber: connection.phoneNumber,
            qrCode: connection.qrCode,
            provider: connection.provider,
            connectionMethod: connection.connectionMethod,
            providerStatus: connection.providerStatus,
            isConnected: connection.isConnected,
          } as WhatsappConnection),
      );
    }
    return map;
  } catch {
    return new Map(
      validConnections.map((connection) => [
        connection.id,
        buildGatewayRuntimeFallbackStatus({
          id: connection.id,
          phoneNumber: connection.phoneNumber,
          qrCode: connection.qrCode,
          provider: connection.provider,
          connectionMethod: connection.connectionMethod,
          providerStatus: connection.providerStatus,
          isConnected: connection.isConnected,
        } as WhatsappConnection),
      ]),
    );
  }
}

export async function getAppVisibleGatewayInstanceDevice(
  connection: WhatsappConnection,
): Promise<InstanceDevicePayload> {
  const snapshot = (await resolveConnectionSnapshot(connection)) || connection;
  if (!isGatewayClientEnabled()) {
    const isConnected = isOperationallyConnected(snapshot);
    return {
      instanceId: snapshot.id,
      connectedPhone: snapshot.phoneNumber || null,
      name: null,
      platform: "baileys",
      lid: null,
      profilePictureUrl: null,
      status: isConnected ? "connected" : "disconnected",
      isBusiness: null,
    };
  }

  try {
    return await getGatewayInstanceDevice(snapshot.id);
  } catch {
    const isConnected = isOperationallyConnected(snapshot);
    return {
      instanceId: snapshot.id,
      connectedPhone: snapshot.phoneNumber || null,
      name: null,
      platform: "baileys",
      lid: null,
      profilePictureUrl: null,
      status: isConnected ? "connected" : "disconnected",
      isBusiness: null,
    };
  }
}

export function gatewayStatusLooksConnected(status: GatewayStatusLike | null | undefined): boolean {
  if (!status) {
    return false;
  }

  if (status.isConnected === true) {
    return true;
  }

  const provider = String(status.provider || "").trim().toLowerCase();
  const providerStatus = String(status.providerStatus || "").trim().toLowerCase();
  if (providerStatus !== "connected") {
    return false;
  }

  return provider === "meta_cloud_api" || provider === "baileys";
}

export type { GatewayStatusLike };
