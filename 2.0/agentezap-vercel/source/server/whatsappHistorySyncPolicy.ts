import { proto } from "@whiskeysockets/baileys";

type HistorySyncTypeLike =
  | proto.HistorySync.HistorySyncType
  | proto.Message.HistorySyncType
  | null
  | undefined;

const RECOVERABLE_HISTORY_SYNC_TYPES = new Set<number>([
  Number(proto.HistorySync.HistorySyncType.RECENT),
  Number(proto.HistorySync.HistorySyncType.ON_DEMAND),
]);

export const HISTORY_SYNC_RECOVERY_MAX_AGE_MS = Math.max(
  Number(process.env.WA_HISTORY_SYNC_RECOVERY_MAX_AGE_MS || 72 * 60 * 60 * 1000),
  60_000,
);

export const HISTORY_SYNC_DISPLAY_MAX_AGE_MS = Math.max(
  Number(process.env.WA_HISTORY_SYNC_DISPLAY_MAX_AGE_MS || 30 * 24 * 60 * 60 * 1000),
  HISTORY_SYNC_RECOVERY_MAX_AGE_MS,
);

export const HISTORY_SYNC_AUTOREPLY_MAX_AGE_MS = Math.max(
  Number(process.env.WA_HISTORY_SYNC_AUTOREPLY_MAX_AGE_MS || 24 * 60 * 60 * 1000),
  0,
);

export const HISTORY_SYNC_RECENT_FALLBACK_AUTOREPLY_MAX_AGE_MS = Math.max(
  Number(process.env.WA_HISTORY_SYNC_RECENT_FALLBACK_AUTOREPLY_MAX_AGE_MS || 15 * 60 * 1000),
  0,
);

export function normalizeHistorySyncType(syncType: HistorySyncTypeLike): number | null {
  const parsed = Number(syncType);
  return Number.isFinite(parsed) ? parsed : null;
}

export function shouldSyncHistoryMessageType(
  syncType: HistorySyncTypeLike,
  allowFullHistorySync: boolean,
): boolean {
  const normalized = normalizeHistorySyncType(syncType);
  if (normalized === null) {
    return allowFullHistorySync;
  }

  if (normalized === Number(proto.HistorySync.HistorySyncType.FULL)) {
    return allowFullHistorySync;
  }

  return true;
}

export function shouldPersistRecoveredHistoryMessage(params: {
  syncType: HistorySyncTypeLike;
  ageMs: number;
  maxAgeMs?: number;
  recentFallbackMaxAgeMs?: number;
}): boolean {
  return params.ageMs <= (params.maxAgeMs ?? HISTORY_SYNC_DISPLAY_MAX_AGE_MS);
}

export function shouldAutoReplyRecoveredHistoryMessage(params: {
  syncType: HistorySyncTypeLike;
  ageMs: number;
  maxAgeMs?: number;
  recentFallbackMaxAgeMs?: number;
}): boolean {
  const normalized = normalizeHistorySyncType(params.syncType);
  if (normalized !== null && RECOVERABLE_HISTORY_SYNC_TYPES.has(normalized)) {
    return params.ageMs <= (params.maxAgeMs ?? HISTORY_SYNC_AUTOREPLY_MAX_AGE_MS);
  }

  return params.ageMs <= (
    params.recentFallbackMaxAgeMs ?? HISTORY_SYNC_RECENT_FALLBACK_AUTOREPLY_MAX_AGE_MS
  );
}

export function describeHistorySyncType(syncType: HistorySyncTypeLike): string {
  const normalized = normalizeHistorySyncType(syncType);
  if (normalized === null) {
    return "unknown";
  }

  return proto.HistorySync.HistorySyncType[normalized] || `unknown(${normalized})`;
}
