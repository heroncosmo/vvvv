interface DispatchState {
  chain?: Promise<void>;
  activeReason: string | null;
  activeStartedAt: number | null;
  lastCompletedAt: number | null;
  waitingCount: number;
  totalRuns: number;
}

function getOrCreateState(map: Map<string, DispatchState>, key: string): DispatchState {
  const existing = map.get(key);
  if (existing) return existing;

  const created: DispatchState = {
    activeReason: null,
    activeStartedAt: null,
    lastCompletedAt: null,
    waitingCount: 0,
    totalRuns: 0,
  };
  map.set(key, created);
  return created;
}

class ChannelDispatchLock {
  private states = new Map<string, DispatchState>();

  async runExclusive<T>(channelKey: string, reason: string, task: () => Promise<T>): Promise<T> {
    const state = getOrCreateState(this.states, channelKey);
    const previous = state.chain || Promise.resolve();
    const hadPendingChain = Boolean(state.chain);

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const chain = previous.catch(() => undefined).then(() => current);
    state.chain = chain;

    if (hadPendingChain || state.activeReason) {
      state.waitingCount += 1;
      console.log(`🔒 [CHANNEL-DISPATCH] ${channelKey.substring(0, 8)} aguardando vez para ${reason}`);
    }

    await previous.catch(() => undefined);

    if (hadPendingChain || state.activeReason) {
      state.waitingCount = Math.max(0, state.waitingCount - 1);
    }

    state.activeReason = reason;
    state.activeStartedAt = Date.now();

    try {
      return await task();
    } finally {
      state.totalRuns += 1;
      state.activeReason = null;
      state.activeStartedAt = null;
      state.lastCompletedAt = Date.now();
      release();

      if (state.chain === chain) {
        state.chain = undefined;
      }

      if (!state.chain && !state.activeReason && state.waitingCount === 0) {
        this.states.set(channelKey, state);
      }
    }
  }

  getSnapshot(channelKey: string): {
    isActive: boolean;
    activeReason: string | null;
    activeForMs: number;
    waitingCount: number;
    lastCompletedAt: number | null;
    totalRuns: number;
  } {
    const state = getOrCreateState(this.states, channelKey);
    const now = Date.now();

    return {
      isActive: Boolean(state.activeReason),
      activeReason: state.activeReason,
      activeForMs: state.activeStartedAt ? Math.max(0, now - state.activeStartedAt) : 0,
      waitingCount: state.waitingCount,
      lastCompletedAt: state.lastCompletedAt,
      totalRuns: state.totalRuns,
    };
  }
}

export const channelDispatchLock = new ChannelDispatchLock();
