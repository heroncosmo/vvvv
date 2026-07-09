import { getAccessEntitlement } from "./accessEntitlement";

export const FREE_AGENT_EDIT_LIMIT = -1;

export interface AgentEditQuota {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  hasActiveSubscription: boolean;
  forceFreeLimit: boolean;
}

export async function shouldForceFreeEditLimitForUser(userId: string): Promise<boolean> {
  void userId;
  return false;
}

export async function getAgentEditQuota(userId: string): Promise<AgentEditQuota> {
  const entitlement = await getAccessEntitlement(userId);

  return {
    allowed: true,
    used: 0,
    limit: FREE_AGENT_EDIT_LIMIT,
    remaining: -1,
    hasActiveSubscription: entitlement.hasActiveSubscription,
    forceFreeLimit: false,
  };
}

export async function consumeAgentEditCredit(userId: string): Promise<AgentEditQuota> {
  return getAgentEditQuota(userId);
}
