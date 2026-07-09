const MIN_PENDING_REPLY_STALE_WINDOW_MINUTES = 60;

export function getManualAgentToggleAutoReactivateMinutes(): null {
  return null;
}

function toTimestampMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : null;
}

export function getAutoReactivatePendingReplyStaleWindowMinutes(autoReactivateAfterMinutes: unknown): number {
  const configuredMinutes = Number(autoReactivateAfterMinutes);
  if (!Number.isFinite(configuredMinutes) || configuredMinutes <= 0) {
    return MIN_PENDING_REPLY_STALE_WINDOW_MINUTES;
  }

  return Math.max(MIN_PENDING_REPLY_STALE_WINDOW_MINUTES, configuredMinutes * 2);
}

export function shouldSkipStaleAutoReactivateReply(params: {
  autoReactivateAfterMinutes?: unknown;
  clientLastMessageAt?: unknown;
  conversationLastMessageAt?: unknown;
  now?: unknown;
}): boolean {
  const messageAt =
    toTimestampMs(params.conversationLastMessageAt) ??
    toTimestampMs(params.clientLastMessageAt);

  if (!messageAt) return false;

  const now = toTimestampMs(params.now) ?? Date.now();
  const staleWindowMinutes = getAutoReactivatePendingReplyStaleWindowMinutes(
    params.autoReactivateAfterMinutes,
  );

  return now - messageAt > staleWindowMinutes * 60_000;
}
