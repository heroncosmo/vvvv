export const SUBSCRIPTION_PLANS_CLOSE_GRACE_MS = 5_000;
export const SUBSCRIPTION_PLANS_CLOSE_GRACE_KEY = "agentezap:plans-close-grace-until";

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function startSubscriptionPlansCloseGrace(now = Date.now()): number {
  const until = now + SUBSCRIPTION_PLANS_CLOSE_GRACE_MS;
  getSessionStorage()?.setItem(SUBSCRIPTION_PLANS_CLOSE_GRACE_KEY, String(until));
  return until;
}

export function clearSubscriptionPlansCloseGrace() {
  getSessionStorage()?.removeItem(SUBSCRIPTION_PLANS_CLOSE_GRACE_KEY);
}

export function getSubscriptionPlansCloseGraceUntil(now = Date.now()): number {
  const raw = getSessionStorage()?.getItem(SUBSCRIPTION_PLANS_CLOSE_GRACE_KEY);
  const parsed = Number(raw || 0);

  if (!Number.isFinite(parsed) || parsed <= now) {
    clearSubscriptionPlansCloseGrace();
    return 0;
  }

  return parsed;
}
