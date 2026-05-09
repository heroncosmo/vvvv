export interface UserFollowUpBacklogEntry {
  conversationId: string;
  userId: string;
  connectionId?: string | null;
  nextFollowupAt?: Date | string | null;
  lastMessageTime?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface UserFollowUpBacklogDecision extends UserFollowUpBacklogEntry {
  action: "process_now" | "delay";
  wave: number;
  slotInWave: number;
}

function toMillis(value: Date | string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sortUserFollowUpBacklogEntries<T extends UserFollowUpBacklogEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const aNext = toMillis(a.nextFollowupAt, Number.MAX_SAFE_INTEGER);
    const bNext = toMillis(b.nextFollowupAt, Number.MAX_SAFE_INTEGER);
    if (aNext !== bNext) {
      return aNext - bNext;
    }

    const aLast = toMillis(a.lastMessageTime, Number.MIN_SAFE_INTEGER);
    const bLast = toMillis(b.lastMessageTime, Number.MIN_SAFE_INTEGER);
    if (aLast !== bLast) {
      return aLast - bLast;
    }

    const aUpdated = toMillis(a.updatedAt, Number.MIN_SAFE_INTEGER);
    const bUpdated = toMillis(b.updatedAt, Number.MIN_SAFE_INTEGER);
    if (aUpdated !== bUpdated) {
      return aUpdated - bUpdated;
    }

    const aCreated = toMillis(a.createdAt, Number.MIN_SAFE_INTEGER);
    const bCreated = toMillis(b.createdAt, Number.MIN_SAFE_INTEGER);
    if (aCreated !== bCreated) {
      return aCreated - bCreated;
    }

    return a.conversationId.localeCompare(b.conversationId);
  });
}

export function buildUserFollowUpBacklogDecisions(
  entries: UserFollowUpBacklogEntry[],
  perUserCap: number,
): UserFollowUpBacklogDecision[] {
  const safeCap = Math.max(1, Math.floor(perUserCap));
  const positionsByScope = new Map<string, number>();
  const orderedEntries = sortUserFollowUpBacklogEntries(entries);

  return orderedEntries.map((entry) => {
    const scopeKey = entry.connectionId
      ? `${entry.userId}:${entry.connectionId}`
      : entry.userId;
    const currentPosition = positionsByScope.get(scopeKey) ?? 0;
    positionsByScope.set(scopeKey, currentPosition + 1);

    if (currentPosition < safeCap) {
      return {
        ...entry,
        action: "process_now",
        wave: 0,
        slotInWave: currentPosition,
      };
    }

    const overflowIndex = currentPosition - safeCap;
    return {
      ...entry,
      action: "delay",
      wave: Math.floor(overflowIndex / safeCap) + 1,
      slotInWave: overflowIndex % safeCap,
    };
  });
}
