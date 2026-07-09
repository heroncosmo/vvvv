import { phoneNumbersMatch, normalizePhoneToDigits } from "./phoneMatch";
import { isInternalOnlySimulatorConnection } from "./internalSimulatorConnection";

const INBOUND_GUARD_WHATSAPP_CONNECTION_METHODS = {
  QR: "qr",
  COEXISTENCE: "coexistence",
} as const;

const INBOUND_GUARD_WHATSAPP_CONNECTION_PROVIDERS = {
  BAILEYS: "baileys",
} as const;

const INBOUND_GUARD_WHATSAPP_PROVIDER_STATUS = {
  CONNECTED: "connected",
} as const;

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
  kind: "saas_channel" | "external_automation_notice" | null;
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

interface InboundAutomationGuardConnectionRow {
  id: string;
  userId: string;
  phoneNumber?: string | null;
  connectionName?: string | null;
  isConnected?: boolean | null;
  aiEnabled?: boolean | null;
  provider?: string | null;
  connectionMethod?: string | null;
  providerStatus?: string | null;
}

interface InboundAutomationGuardUserRow {
  email?: string | null;
}

interface InboundAutomationGuardDeps {
  listAllConnections: () => Promise<InboundAutomationGuardConnectionRow[]>;
  getUser: (userId: string) => Promise<InboundAutomationGuardUserRow | null | undefined>;
  now: () => number;
}

const CONNECTION_SNAPSHOT_TTL_MS = 60 * 1000;
const SUPPORT_OWNER_CACHE_TTL_MS = 5 * 60 * 1000;

const AGENTEZAP_SUPPORT_CONTEXT_EMAILS = new Set(
  String(process.env.AGENTEZAP_SUPPORT_CONTEXT_EMAILS || "rodrigo4@gmail.com,agentezapsuporte@agentezap.online")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

let connectionSnapshotCache:
  | {
      expiresAt: number;
      rows: SsoConnectionSnapshot[];
    }
  | null = null;

let supportOwnerCache = new Map<string, { expiresAt: number; value: boolean }>();

function buildNoBlockDecision(): InboundAutomationGuardDecision {
  return {
    shouldBlock: false,
    kind: null,
    reasonCode: null,
    reason: "",
    confidence: 0,
  };
}

function buildDefaultDeps(overrides: Partial<InboundAutomationGuardDeps>): InboundAutomationGuardDeps {
  return {
    listAllConnections:
      overrides.listAllConnections ||
      (async () => {
        const { storage } = await import("./storage");
        return storage.getAllConnections();
      }),
    getUser:
      overrides.getUser ||
      (async (userId: string) => {
        const { storage } = await import("./storage");
        return storage.getUser(userId);
      }),
    now: overrides.now || (() => Date.now()),
  };
}

function normalizeConnectionMethod(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || INBOUND_GUARD_WHATSAPP_CONNECTION_METHODS.QR;
}

function normalizeProviderStatus(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeAutomationNoticeText(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isExternalAutomationTransferNotice(text: string | null | undefined): boolean {
  const normalized = normalizeAutomationNoticeText(text);
  if (!normalized || normalized.length > 180) {
    return false;
  }

  return /^aguarde[,.!\s]+voce esta sendo transferido para (o )?(departamento|setor)\b/.test(normalized);
}

export function isExternalAutoResponderNotice(
  text: string | null | undefined,
  conversationHistory: InboundAutomationGuardMessage[] = [],
): boolean {
  const normalized = normalizeAutomationNoticeText(text);
  if (!normalized || normalized.length > 520) {
    return false;
  }

  const directAutomationPatterns = [
    /\b(esse|este)\s+e\s+um\s+atendimento\s+automatico\b/,
    /\bsou\s+a?\s*(assistente|atendente)\s+virtual\b/,
    /\bnao\s+(estamos|esta|estou)\s+disponivel(?:es)?\s+no\s+momento\b/,
    /\b(agradece|agradecemos)\s+(o\s+)?(seu\s+)?contato\b.*\bcomo\s+podemos\s+ajudar\b/,
    /\bdeixe\s+(seu\s+)?recado\b/,
    /\bposso\s+deixar\s+um\s+recado\b/,
    /\bassim\s+que\s+possivel\s+(ele|ela|nos|a gente)\s+(retornara|retorna|entraremos|entrara)\b/,
  ];

  if (directAutomationPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const recentHistory = (conversationHistory || []).slice(-8);
  const recentAgentReplies = recentHistory.filter((message) => message.fromMe === true).length;
  const recentInboundReplies = recentHistory.filter((message) => message.fromMe !== true).length;
  const looksLikeCourtesyClosure =
    /\b(obrigado|obrigada|agradeco|agradecemos|valeu|ate\s+mais|sucesso|bom\s+trabalho|ficamos?\s+a\s+disposicao|estamos\s+a\s+disposicao|qualquer\s+coisa\s+(me\s+chama|estamos\s+por\s+aqui|entraremos\s+em\s+contato))\b/.test(
      normalized,
    ) &&
    !/\?/.test(normalized);

  return looksLikeCourtesyClosure && recentAgentReplies >= 2 && recentInboundReplies >= 2;
}

function isConnectionOperationalForInboundGuard(connection: SsoConnectionSnapshot): boolean {
  if (connection.aiEnabled !== true) {
    return false;
  }

  const provider = String(connection.provider || "").trim().toLowerCase();
  const connectionMethod = normalizeConnectionMethod(connection.connectionMethod);
  const providerStatus = normalizeProviderStatus(connection.providerStatus);

  if (
    provider === INBOUND_GUARD_WHATSAPP_CONNECTION_PROVIDERS.BAILEYS &&
    connectionMethod !== INBOUND_GUARD_WHATSAPP_CONNECTION_METHODS.COEXISTENCE
  ) {
    return providerStatus === INBOUND_GUARD_WHATSAPP_PROVIDER_STATUS.CONNECTED;
  }

  return connection.isConnected === true || providerStatus === INBOUND_GUARD_WHATSAPP_PROVIDER_STATUS.CONNECTED;
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

async function isSupportOwnerWorkspace(
  userId: string,
  deps: InboundAutomationGuardDeps,
): Promise<boolean> {
  const cleanUserId = String(userId || "").trim();
  if (!cleanUserId || AGENTEZAP_SUPPORT_CONTEXT_EMAILS.size === 0) {
    return false;
  }

  const now = deps.now();
  const cached = supportOwnerCache.get(cleanUserId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let value = false;
  try {
    const user = await deps.getUser(cleanUserId);
    const email = String(user?.email || "").trim().toLowerCase();
    value = Boolean(email && AGENTEZAP_SUPPORT_CONTEXT_EMAILS.has(email));
  } catch (error) {
    console.warn("[INBOUND AUTOMATION GUARD] Falha ao verificar workspace de suporte:", error);
  }

  supportOwnerCache.set(cleanUserId, {
    expiresAt: now + SUPPORT_OWNER_CACHE_TTL_MS,
    value,
  });

  return value;
}

export async function evaluateInboundAutomationGuard(
  input: InboundAutomationGuardInput,
  deps: Partial<InboundAutomationGuardDeps> = {},
): Promise<InboundAutomationGuardDecision> {
  const mergedDeps = buildDefaultDeps(deps);

  const internalMatch = await resolveConnectedSaasChannelMatch(input, mergedDeps);
  if (internalMatch) {
    if (await isSupportOwnerWorkspace(input.userId, mergedDeps)) {
      return buildNoBlockDecision();
    }
    return internalMatch;
  }

  // Codex live context-only: textual automation notices are context for the model,
  // not a local reason to pause the conversation before Codex sees the turn.
  if (
    isExternalAutomationTransferNotice(input.inboundText) ||
    isExternalAutoResponderNotice(input.inboundText, input.conversationHistory)
  ) {
    return buildNoBlockDecision();
  }

  return buildNoBlockDecision();
}

export function clearInboundAutomationGuardCaches(): void {
  connectionSnapshotCache = null;
  supportOwnerCache = new Map();
}
