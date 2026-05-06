import { storage, memoryCache } from "./storage";
import { evaluateSaaSSubscriptionAccess } from "./subscriptionAccessPolicy";

/**
 * Canonical entitlement check - single source of truth for "is user paid/active?"
 * Mirrors the full logic of /api/access-status so that /api/usage, /api/daily-limits,
 * and any other endpoint that needs to know "paid vs free" all agree.
 *
 * PERFORMANCE: Results cached for 30s per userId. In-flight deduplication prevents
 * thundering herd when multiple endpoints call this simultaneously on page load.
 */

export interface AccessEntitlement {
  hasActiveSubscription: boolean;  // effectively unlimited (don't show CTA)
  isExpired: boolean;              // effectively expired
  isPendingReceiptAccess: boolean; // receipt exists but still needs approval
  source: 'saas' | 'reseller' | 'none';
  planName: string | null;         // "Plano Revenda" or SaaS plan name
}

const ENTITLEMENT_CACHE_TTL = 30_000; // 30 seconds
// In-flight request deduplication (thundering herd protection)
const _inflightEntitlements = new Map<string, Promise<AccessEntitlement>>();

export async function getAccessEntitlement(userId: string): Promise<AccessEntitlement> {
  const cacheKey = `entitlement:${userId}`;

  // Check memory cache first
  const cached = memoryCache.get<AccessEntitlement>(cacheKey);
  if (cached) return cached;

  // In-flight deduplication: if another call for same userId is running, wait for it
  const inflight = _inflightEntitlements.get(userId);
  if (inflight) return inflight;

  const promise = _computeEntitlement(userId).then(result => {
    memoryCache.set(cacheKey, result, ENTITLEMENT_CACHE_TTL);
    _inflightEntitlements.delete(userId);
    return result;
  }).catch(err => {
    _inflightEntitlements.delete(userId);
    throw err;
  });

  _inflightEntitlements.set(userId, promise);
  return promise;
}

/** Invalidate entitlement cache for a user (call after subscription/plan changes) */
export function invalidateEntitlementCache(userId: string): void {
  memoryCache.invalidate(`entitlement:${userId}`);
}

export function invalidateUserAccessCaches(userId: string): void {
  invalidateEntitlementCache(userId);
  memoryCache.invalidate(`api:access-status:${userId}`);
}

async function _computeEntitlement(userId: string): Promise<AccessEntitlement> {
  // Parallelize the two independent DB calls
  const [subscription, resellerClient] = await Promise.all([
    storage.getUserSubscription(userId),
    storage.getResellerClientByUserId(userId),
  ]);

  const now = new Date();

  // ---- SaaS evaluation ----
  const hasPendingReceiptAccess = Boolean(subscription?.pendingReceipt) && subscription?.status !== 'cancelled';
  const saasEvaluation = evaluateSaaSSubscriptionAccess({
    status: subscription?.status,
    dataFim: subscription?.dataFim,
    nextPaymentDate: subscription?.nextPaymentDate,
    now,
  });
  const saasHasActive = saasEvaluation.hasActiveSubscription;

  // ---- Reseller evaluation (takes priority if exists) ----
  if (resellerClient) {
    let reseller: any = null;
    try {
      reseller = await storage.getReseller(resellerClient.resellerId);
    } catch (e) {
      // If reseller lookup fails, fall through to SaaS logic
    }

    // Cascading block: reseller itself is blocked
    if (reseller?.resellerStatus === 'blocked') {
      return {
        hasActiveSubscription: false,
        isExpired: true,
        isPendingReceiptAccess: false,
        source: 'reseller',
        planName: 'Plano Revenda',
      };
    }

    // Free client of reseller is always active (unless reseller blocked - handled above)
    if (resellerClient.isFreeClient) {
      return {
        hasActiveSubscription: true,
        isExpired: false,
        isPendingReceiptAccess: false,
        source: 'reseller',
        planName: 'Plano Revenda',
      };
    }

    // Reseller client with suspended/cancelled/blocked status
    if (
      resellerClient.status === 'suspended' ||
      resellerClient.status === 'cancelled' ||
      resellerClient.status === 'blocked'
    ) {
      return {
        hasActiveSubscription: false,
        isExpired: true,
        isPendingReceiptAccess: false,
        source: 'reseller',
        planName: 'Plano Revenda',
      };
    }

    // Reseller client with active status - check payment dates
    if (resellerClient.status === 'active') {
      // PRIORITY: Check saasPaidUntil (granular payments)
      if (resellerClient.saasPaidUntil) {
        const paidUntil = new Date(resellerClient.saasPaidUntil);
        const expired = now > paidUntil;
        return {
          hasActiveSubscription: !expired,
          isExpired: expired,
          isPendingReceiptAccess: false,
          source: 'reseller',
          planName: 'Plano Revenda',
        };
      }

      // FALLBACK: Check nextPaymentDate with 5-day tolerance
      if (resellerClient.nextPaymentDate) {
        const nextPayment = new Date(resellerClient.nextPaymentDate);
        const daysOverdue = Math.floor(
          (now.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24)
        );
        const expired = daysOverdue > 5;
        return {
          hasActiveSubscription: !expired,
          isExpired: expired,
          isPendingReceiptAccess: false,
          source: 'reseller',
          planName: 'Plano Revenda',
        };
      }

      // No payment date info - permissive fallback (same spirit as /api/access-status)
      return {
        hasActiveSubscription: true,
        isExpired: false,
        isPendingReceiptAccess: false,
        source: 'reseller',
        planName: 'Plano Revenda',
      };
    }
  }

  // ---- SaaS only (no reseller) ----
  if (saasHasActive) {
    return {
      hasActiveSubscription: true,
      isExpired: false,
      isPendingReceiptAccess: hasPendingReceiptAccess,
      source: 'saas',
      planName: subscription?.plan?.nome ?? null,
    };
  }

  // Subscription exists but is expired or inactive
  if (subscription) {
    return {
      hasActiveSubscription: false,
      isExpired: saasEvaluation.isExpired,
      isPendingReceiptAccess: hasPendingReceiptAccess,
      source: 'saas',
      planName: subscription?.plan?.nome ?? null,
    };
  }

  // No subscription at all, no reseller - free/trial user
  return {
    hasActiveSubscription: false,
    isExpired: false,
    isPendingReceiptAccess: false,
    source: 'none',
    planName: null,
  };
}
