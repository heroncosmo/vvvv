/**
 * Cache pre-warming module.
 * Extracted to its own file to avoid circular imports between routes.ts and supabaseAuth.ts.
 */
import { storage, memoryCache } from "./storage";
import { getAccessEntitlement } from "./accessEntitlement";

/**
 * Pre-warm all dashboard caches for a user (fire-and-forget, non-blocking).
 * Called after successful login to ensure the dashboard loads from warm cache.
 */
export function preWarmUserCaches(userId: string): void {
  // Run in background - never let this block or fail the login
  (async () => {
    try {
      // 1. Connection (needed by stats)
      const connection = await storage.getConnectionByUserId(userId);
      const connectionId = connection?.id;
      const connKey = `api:wa-conn:${userId}:default`;
      if (!memoryCache.has(connKey)) {
        memoryCache.set(connKey, connection ? { ...connection, _debugLocalSocket: false } : null, 30_000);
      }

      // 2. Fire all independent cache warmers in parallel
      await Promise.allSettled([
        // Stats
        memoryCache.getOrCompute(`api:stats:${userId}:default`, async () => {
          if (!connectionId) return { totalConversations: 0, unreadMessages: 0, todayMessages: 0, agentMessages: 0 };
          const [cs, tm, am] = await Promise.all([
            storage.getConversationStatsCount(connectionId),
            storage.getTodayMessagesCount(connectionId),
            storage.getAgentMessagesCount(connectionId),
          ]);
          return { totalConversations: cs.total, unreadMessages: cs.unread, todayMessages: tm, agentMessages: am };
        }, 60_000),
        // Access entitlement (feeds access-status + usage)
        getAccessEntitlement(userId),
        // Subscription
        memoryCache.getOrCompute(`api:subscription:${userId}`, async () => {
          return (await storage.getUserSubscription(userId)) || null;
        }, 120_000),
        // Agent config
        memoryCache.getOrCompute(`api:agent-config:${userId}`, async () => {
          return (await storage.getAgentConfig(userId)) || null;
        }, 120_000),
        // Branding
        memoryCache.getOrCompute(`api:branding:${userId}`, async () => {
          const user = await storage.getUser(userId);
          return { companyName: null, logoUrl: null, faviconUrl: null, primaryColor: null, secondaryColor: null };
        }, 600_000),
        // Assigned plan
        memoryCache.getOrCompute(`api:assigned-plan:${userId}`, async () => {
          const user = await storage.getUser(userId);
          if (!user || !(user as any).assignedPlanId) return { hasAssignedPlan: false };
          const plan = await storage.getPlan((user as any).assignedPlanId);
          if (!plan || !plan.ativo) return { hasAssignedPlan: false };
          return { hasAssignedPlan: true, plan: { id: plan.id, nome: plan.nome, descricao: plan.descricao, valor: plan.valor, periodicidade: plan.periodicidade, tipo: plan.tipo, caracteristicas: plan.caracteristicas } };
        }, 300_000),
        // Suspension status
        memoryCache.getOrCompute(`api:suspension:${userId}`, async () => {
          const s = await storage.isUserSuspended(userId);
          return s.suspended ? { suspended: true, reason: s.data?.reason, type: s.data?.type, suspendedAt: s.data?.suspendedAt } : { suspended: false };
        }, 300_000),
        // Reseller status
        memoryCache.getOrCompute(`api:reseller-status:${userId}`, async () => {
          const resellerService = (await import('./resellerService')).resellerService;
          const [hasReseller, reseller] = await Promise.all([
            resellerService.hasResellerPlan(userId),
            storage.getResellerByUserId(userId),
          ]);
          return { hasResellerPlan: hasReseller, reseller: reseller || null };
        }, 300_000),
      ]);
      console.log(`🔥 [CACHE] Pre-warmed caches for user ${userId.substring(0, 8)}...`);
    } catch (err) {
      // Silent fail - pre-warming is best-effort
      console.error(`⚠️ [CACHE] Pre-warm failed for ${userId.substring(0, 8)}:`, err);
    }
  })();
}
