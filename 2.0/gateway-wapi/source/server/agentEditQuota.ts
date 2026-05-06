import { getAccessEntitlement } from "./accessEntitlement";
import { storage } from "./storage";

export const FREE_AGENT_EDIT_LIMIT = 5;

const FORCE_FREE_LIMIT_EMAIL_SUFFIXES = ["@agentezap.online", "@agentezap.com"];

export interface AgentEditQuota {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  hasActiveSubscription: boolean;
  forceFreeLimit: boolean;
}

export async function shouldForceFreeEditLimitForUser(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId).catch(() => undefined);
  const email = String((user as any)?.email || "").toLowerCase();
  return FORCE_FREE_LIMIT_EMAIL_SUFFIXES.some((suffix) => email.endsWith(suffix));
}

export async function getAgentEditQuota(userId: string): Promise<AgentEditQuota> {
  const entitlement = await getAccessEntitlement(userId);
  const forceFreeLimit = await shouldForceFreeEditLimitForUser(userId);

  if (entitlement.hasActiveSubscription && !forceFreeLimit) {
    return {
      allowed: true,
      used: 0,
      limit: FREE_AGENT_EDIT_LIMIT,
      remaining: -1,
      hasActiveSubscription: true,
      forceFreeLimit: false,
    };
  }

  const usage = await storage.getDailyUsage(userId);
  const used = Number(usage.promptEditsCount || 0);

  return {
    allowed: used < FREE_AGENT_EDIT_LIMIT,
    used,
    limit: FREE_AGENT_EDIT_LIMIT,
    remaining: Math.max(0, FREE_AGENT_EDIT_LIMIT - used),
    hasActiveSubscription: false,
    forceFreeLimit,
  };
}

export async function consumeAgentEditCredit(userId: string): Promise<AgentEditQuota> {
  const quota = await getAgentEditQuota(userId);
  if (quota.hasActiveSubscription && !quota.forceFreeLimit) {
    return quota;
  }

  const used = await storage.incrementPromptEdits(userId);
  return {
    ...quota,
    allowed: used < quota.limit,
    used,
    remaining: Math.max(0, quota.limit - used),
    hasActiveSubscription: false,
  };
}

export function buildAgentEditLimitReachedMessage(
  quota: Pick<AgentEditQuota, "used" | "limit">,
): string {
  return `Hoje você já usou as ${quota.limit} alterações do plano gratuito. Amanhã os créditos liberam de novo. Se quiser continuar agora, no plano pago as alterações ficam ilimitadas: https://agentezap.online/plans`;
}

export function buildAgentEditRemainingMessage(
  quota: Pick<AgentEditQuota, "hasActiveSubscription" | "remaining" | "limit">,
): string {
  if (quota.hasActiveSubscription) {
    return "Seu plano está ativo, então as alterações são ilimitadas.";
  }

  if (quota.remaining <= 0) {
    return `0 créditos restantes hoje. No gratuito são ${quota.limit} alterações por dia. Amanhã libera de novo.`;
  }

  const plural = quota.remaining === 1 ? "" : "s";
  return `${quota.remaining} crédito${plural} restante${plural} hoje. No gratuito são ${quota.limit} alterações por dia.`;
}

export function buildAgentEditRuleReply(
  quota: Pick<AgentEditQuota, "hasActiveSubscription" | "remaining" | "limit">,
): string {
  if (quota.hasActiveSubscription) {
    return "No seu plano as alterações são ilimitadas.";
  }

  return `No gratuito são ${quota.limit} alterações por dia. Hoje você ainda tem ${Math.max(0, quota.remaining)}. Quando virar o dia, os créditos liberam de novo. Se assinar, fica ilimitado.`;
}
