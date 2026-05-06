import type { WhatsappConnection } from "@shared/schema";

export type ConnectionContinuityCandidate = Pick<
  WhatsappConnection,
  | "id"
  | "userId"
  | "phoneNumber"
  | "isConnected"
  | "providerStatus"
  | "isPrimary"
  | "connectionName"
  | "connectionType"
  | "aiEnabled"
  | "provider"
  | "connectionMethod"
  | "qrCode"
  | "createdAt"
  | "updatedAt"
> & {
  runtimePhoneNumber?: string | null;
  runtimeIsConnected?: boolean;
  conversationCount?: number;
};

function isConnectionOperational(candidate: ConnectionContinuityCandidate): boolean {
  if (typeof candidate.runtimeIsConnected === "boolean") {
    return candidate.runtimeIsConnected;
  }

  return (
    candidate.isConnected === true ||
    String(candidate.providerStatus || "").trim().toLowerCase() === "connected"
  );
}

function compareConnectionSurvivorPriority(
  a: ConnectionContinuityCandidate,
  b: ConnectionContinuityCandidate,
): number {
  const aOperational = isConnectionOperational(a);
  const bOperational = isConnectionOperational(b);
  if (aOperational !== bOperational) {
    return aOperational ? -1 : 1;
  }

  if ((a.isPrimary ?? false) !== (b.isPrimary ?? false)) {
    return a.isPrimary ? -1 : 1;
  }

  const aConversationCount = Number(a.conversationCount || 0);
  const bConversationCount = Number(b.conversationCount || 0);
  if (aConversationCount !== bConversationCount) {
    return bConversationCount - aConversationCount;
  }

  const aUpdatedAt = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const bUpdatedAt = new Date(b.updatedAt || b.createdAt || 0).getTime();
  if (aUpdatedAt !== bUpdatedAt) {
    return bUpdatedAt - aUpdatedAt;
  }

  const aCreatedAt = new Date(a.createdAt || 0).getTime();
  const bCreatedAt = new Date(b.createdAt || 0).getTime();
  return aCreatedAt - bCreatedAt;
}

export function pickPhoneGroupSurvivor(
  candidates: ConnectionContinuityCandidate[],
): ConnectionContinuityCandidate {
  if (candidates.length === 0) {
    throw new Error("Cannot pick survivor from empty candidate list");
  }

  return [...candidates].sort(compareConnectionSurvivorPriority)[0];
}
