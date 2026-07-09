import type { WhatsappConnection } from "@shared/schema";

export const PAIRING_REQUIRED_RETRY_COOLDOWN_MS = Math.max(
  Number(process.env.WA_PAIRING_REQUIRED_RETRY_COOLDOWN_MS || 15 * 60 * 1000),
  60_000,
);

type PairingStateConnection =
  | Pick<WhatsappConnection, "isConnected" | "qrCode" | "updatedAt">
  | null
  | undefined;

type PendingEntryLike = {
  startedAt: number;
  expiresAt?: number;
};

function getConnectionUpdatedAtMs(connection: PairingStateConnection): number {
  if (!connection?.updatedAt) {
    return 0;
  }
  const value = new Date(connection.updatedAt as any).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function getPairingRequiredCooldownRemainingMs(
  connection: PairingStateConnection,
  now = Date.now(),
  cooldownMs = PAIRING_REQUIRED_RETRY_COOLDOWN_MS,
): number {
  if (!connection || connection.isConnected || !connection.qrCode) {
    return 0;
  }

  const updatedAtMs = getConnectionUpdatedAtMs(connection);
  if (!updatedAtMs) {
    return 0;
  }

  const remaining = updatedAtMs + cooldownMs - now;
  return remaining > 0 ? remaining : 0;
}

export function isPendingConnectionExpired(
  entry: PendingEntryLike,
  now: number,
  baseTtlMs: number,
): boolean {
  const expiresAt =
    typeof entry.expiresAt === "number" && Number.isFinite(entry.expiresAt)
      ? entry.expiresAt
      : entry.startedAt + baseTtlMs;
  return now > expiresAt;
}

export function computePendingConnectionExpiresAt(
  startedAt: number,
  openTimeoutMs: number,
  baseTtlMs: number,
  extraMs: number,
): number {
  return startedAt + Math.max(baseTtlMs, openTimeoutMs + Math.max(extraMs, 0));
}
