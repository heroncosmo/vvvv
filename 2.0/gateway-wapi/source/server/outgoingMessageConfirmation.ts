const PENDING_CONFIRMATION_TTL_MS = 10 * 60 * 1000;

const pendingOutgoingConfirmations = new Map<string, Date>();

function cleanupExpiredPendingOutgoingConfirmations(nowMs: number) {
  for (const [messageId, confirmedAt] of pendingOutgoingConfirmations.entries()) {
    if (nowMs - confirmedAt.getTime() > PENDING_CONFIRMATION_TTL_MS) {
      pendingOutgoingConfirmations.delete(messageId);
    }
  }
}

export function rememberOutgoingMessageConfirmation(
  messageId: string | null | undefined,
  confirmedAt: Date,
): void {
  if (!messageId) return;

  const nowMs = Date.now();
  cleanupExpiredPendingOutgoingConfirmations(nowMs);
  pendingOutgoingConfirmations.set(messageId, confirmedAt);
}

export function consumePendingOutgoingMessageConfirmation(
  messageId: string | null | undefined,
): Date | null {
  if (!messageId) return null;

  const confirmedAt = pendingOutgoingConfirmations.get(messageId) ?? null;
  if (!confirmedAt) return null;

  pendingOutgoingConfirmations.delete(messageId);
  return confirmedAt;
}

export function clearPendingOutgoingMessageConfirmations(): void {
  pendingOutgoingConfirmations.clear();
}
