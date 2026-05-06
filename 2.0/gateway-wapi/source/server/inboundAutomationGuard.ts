import { phoneNumbersMatch, normalizePhoneToDigits } from "./phoneMatch";
import { isInternalOnlySimulatorConnection } from "./internalSimulatorConnection";
import { storage } from "./storage";
import {
  WHATSAPP_CONNECTION_METHODS,
  WHATSAPP_CONNECTION_PROVIDERS,
  WHATSAPP_PROVIDER_STATUS,
} from "./whatsappCoexistence";

export interface InboundAutomationGuardMessage {
  fromMe: boolean;
  isFromAgent?: boolean | null;
  text?: string | null;
  mediaType?: string | null;
}

export interface InboundAutomationGuardInput {
  userId: string;
  connectionId: string;
  conversationId: string;
  contactNumber: string;
  contactName?: string | null;
  inboundText: string;
  conversationHistory: InboundAutomationGuardMessage[];
}

export interface InboundAutomationGuardDecision {
  shouldBlock: boolean;
  kind: "saas_channel" | null;
  reasonCode: string | null;
  reason: string;
  confidence: number;
  matchedConnectionId?: string | null;
  matchedUserId?: string | null;
}

interface SsoConnectionSnapshot {
  id: string;
  userId: string;
  phoneNumber: string | null;
  connectionName: string | null;
  isConnected: boolean;
  aiEnabled: boolean;
  provider: string | null;
  connectionMethod: string | null;
  providerStatus: string | null;
}

interface InboundAutomationGuardDeps {
  listAllConnections: typeof storage.getAllConnections;
  now: () => number;
}

const CONNECTION_SNAPSHOT_TTL_MS = 60 * 1000;

let connectionSnapshotCache:
  | {
      expiresAt: number;
      rows: SsoConnectionSnapshot[];
    }
  | null = null;

function buildNoBlockDecision(): InboundAutomationGuardDecision {
  return {
    shouldBlock: false,
    kind: null,
    reasonCode: null,
    reason: "",
    confidence: 0,
  };
}

const defaultDeps: InboundAutomationGuardDeps = {
  listAllConnections: storage.getAllConnections.bind(storage),
  now: () => Date.now(),
};

function normalizeConnectionMethod(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || WHATSAPP_CONNECTION_METHODS.QR;
}

function normalizeProviderStatus(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function isConnectionOperationalForInboundGuard(connection: SsoConnectionSnapshot): boolean {
  if (connection.aiEnabled !== true) {
    return false;
  }

  const provider = String(connection.provider || "").trim().toLowerCase();
  const connectionMethod = normalizeConnectionMethod(connection.connectionMethod);
  const providerStatus = normalizeProviderStatus(connection.providerStatus);

  if (
    provider === WHATSAPP_CONNECTION_PROVIDERS.BAILEYS &&
    connectionMethod !== WHATSAPP_CONNECTION_METHODS.COEXISTENCE
  ) {
    return providerStatus === WHATSAPP_PROVIDER_STATUS.CONNECTED;
  }

  return connection.isConnected === true || providerStatus === WHATSAPP_PROVIDER_STATUS.CONNECTED;
}

async function getConnectedConnectionSnapshot(
  deps: InboundAutomationGuardDeps,
): Promise<SsoConnectionSnapshot[]> {
  const now = deps.now();
  if (connectionSnapshotCache && connectionSnapshotCache.expiresAt > now) {
    return connectionSnapshotCache.rows;
  }

  const rows = (await deps.listAllConnections())
    .filter((connection) => !isInternalOnlySimulatorConnection(connection))
    .filter((connection) => connection.aiEnabled !== false)
    .map((connection) => ({
      id: connection.id,
      userId: connection.userId,
      phoneNumber: connection.phoneNumber || null,
      connectionName: connection.connectionName || null,
      isConnected: connection.isConnected === true,
      aiEnabled: connection.aiEnabled !== false,
      provider: connection.provider || null,
      connectionMethod: connection.connectionMethod || null,
      providerStatus: connection.providerStatus || null,
    }));

  connectionSnapshotCache = {
    expiresAt: now + CONNECTION_SNAPSHOT_TTL_MS,
    rows,
  };

  return rows;
}

async function resolveConnectedSaasChannelMatch(
  input: InboundAutomationGuardInput,
  deps: InboundAutomationGuardDeps,
): Promise<InboundAutomationGuardDecision | null> {
  const contactDigits = normalizePhoneToDigits(input.contactNumber);
  if (!contactDigits) {
    return null;
  }

  const connections = await getConnectedConnectionSnapshot(deps);
  const match = connections.find((connection) => {
    if (connection.id === input.connectionId) {
      return false;
    }
    if (!connection.phoneNumber) {
      return false;
    }
    if (!isConnectionOperationalForInboundGuard(connection)) {
      return false;
    }
    return phoneNumbersMatch(connection.phoneNumber, input.contactNumber);
  });

  if (!match) {
    return null;
  }

  return {
    shouldBlock: true,
    kind: "saas_channel",
    reasonCode: "saas_connected_channel",
    reason:
      match.connectionName?.trim()
        ? `Numero pertence a outro canal conectado do SaaS (${match.connectionName.trim()})`
        : "Numero pertence a outro canal conectado do SaaS",
    confidence: 1,
    matchedConnectionId: match.id,
    matchedUserId: match.userId,
  };
}

export async function evaluateInboundAutomationGuard(
  input: InboundAutomationGuardInput,
  deps: Partial<InboundAutomationGuardDeps> = {},
): Promise<InboundAutomationGuardDecision> {
  const mergedDeps: InboundAutomationGuardDeps = {
    ...defaultDeps,
    ...deps,
  };

  const internalMatch = await resolveConnectedSaasChannelMatch(input, mergedDeps);
  if (internalMatch) {
    return internalMatch;
  }

  return buildNoBlockDecision();
}

export function clearInboundAutomationGuardCaches(): void {
  connectionSnapshotCache = null;
}
