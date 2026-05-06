const ADMIN_MIN_GAP_MS = 60_000;
const ADMIN_BATCH_SIZE = 10;
const ADMIN_BATCH_PAUSE_MS = 10 * 60_000;

type AdminThrottleState = {
  lastReservedAt: number;
  reservedCount: number;
};

const adminThrottleLocks = new Map<string, Promise<void>>();
const adminThrottleStates = new Map<string, AdminThrottleState>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function waitForAdminBulkSendWindow(
  adminId: string,
  options?: {
    minIntervalSeconds?: number;
    maxIntervalSeconds?: number;
    batchSize?: number;
    batchPauseMs?: number;
    scope?: string;
  },
): Promise<{ reservedIndex: number; waitMs: number; batchPauseApplied: boolean }> {
  const scope = options?.scope || "default";
  const lockKey = `${adminId}:${scope}`;
  const previousLock = adminThrottleLocks.get(lockKey) || Promise.resolve();

  let releaseLock!: () => void;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  adminThrottleLocks.set(lockKey, previousLock.then(() => currentLock));

  await previousLock;

  try {
    const state = adminThrottleStates.get(lockKey) || {
      lastReservedAt: 0,
      reservedCount: 0,
    };

    const minIntervalMs = Math.max((options?.minIntervalSeconds || 0) * 1000, ADMIN_MIN_GAP_MS);
    const rawMaxIntervalMs = Math.max((options?.maxIntervalSeconds || 0) * 1000, minIntervalMs);
    const batchSize = Math.max(Number(options?.batchSize || ADMIN_BATCH_SIZE), 1);
    const batchPauseMs = Math.max(Number(options?.batchPauseMs || ADMIN_BATCH_PAUSE_MS), 0);
    const waitIntervalMs =
      state.lastReservedAt > 0 ? randomBetween(minIntervalMs, rawMaxIntervalMs) : 0;

    let totalWaitMs = 0;
    let batchPauseApplied = false;

    if (state.lastReservedAt > 0) {
      const sinceLast = Date.now() - state.lastReservedAt;
      const gapWaitMs = Math.max(0, waitIntervalMs - sinceLast);
      if (gapWaitMs > 0) {
        await sleep(gapWaitMs);
        totalWaitMs += gapWaitMs;
      }
    }

    if (state.reservedCount > 0 && state.reservedCount % batchSize === 0) {
      await sleep(batchPauseMs);
      totalWaitMs += batchPauseMs;
      batchPauseApplied = true;
    }

    const nextState: AdminThrottleState = {
      lastReservedAt: Date.now(),
      reservedCount: state.reservedCount + 1,
    };
    adminThrottleStates.set(lockKey, nextState);

    return {
      reservedIndex: nextState.reservedCount,
      waitMs: totalWaitMs,
      batchPauseApplied,
    };
  } finally {
    releaseLock();
    if (adminThrottleLocks.get(lockKey) === currentLock) {
      adminThrottleLocks.delete(lockKey);
    }
  }
}

