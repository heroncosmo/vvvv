import type { WhatsappConnection } from "@shared/schema";

import { eq } from "drizzle-orm";
import { whatsappConnections } from "@shared/schema";

import { db } from "./db";
import { storage } from "./storage";
import {
  isWhatsAppGatewayRuntime,
  resolveWhatsAppConnectionOwner,
  type WhatsAppConnectionOwner,
} from "./whatsappGatewayOwnership";

function isTruthyFlag(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function hasRemoteGatewayConfigured(): boolean {
  return Boolean(String(process.env.WA_GATEWAY_URL || "").trim());
}

function shouldForceGatewayForCustomerBaileysInApp(connection: WhatsappConnection | undefined): boolean {
  if (!connection || isWhatsAppGatewayRuntime()) {
    return false;
  }

  if (
    !isTruthyFlag(process.env.DISABLE_CUSTOMER_BAILEYS_LOCAL_RUNTIME) &&
    !hasRemoteGatewayConfigured()
  ) {
    return false;
  }

  const provider = String(connection.provider || "baileys").trim().toLowerCase();
  const method = String(connection.connectionMethod || "qr").trim().toLowerCase();
  return provider === "baileys" && method !== "coexistence";
}

async function resolveConnectionRecord(
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
  if (fullConnection) {
    return fullConnection as WhatsappConnection;
  }

  return storage.getConnectionById(connectionOrId);
}

export async function resolveAppVisibleConnectionOwner(
  connectionOrId: string | WhatsappConnection,
): Promise<WhatsAppConnectionOwner> {
  const connection = await resolveConnectionRecord(connectionOrId);
  if (shouldForceGatewayForCustomerBaileysInApp(connection)) {
    return "gateway";
  }

  return resolveWhatsAppConnectionOwner(connectionOrId);
}
