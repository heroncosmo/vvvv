type ContextStateCarrier = {
  contextState?: Record<string, any> | null;
  followupActive?: boolean | null;
};

export function isAdminConversationManuallyPaused(
  conversation?: ContextStateCarrier | null,
): boolean {
  return (conversation?.contextState as any)?.manualAgentPause === true;
}

export function isAdminConversationFollowupManuallyPaused(
  conversation?: ContextStateCarrier | null,
): boolean {
  return (conversation?.contextState as any)?.manualFollowupPause === true;
}

export function shouldAutoReactivateAdminAgent(params: {
  isAgentEnabled: boolean;
  globalAgentEnabled: boolean;
  conversation?: ContextStateCarrier | null;
}): boolean {
  if (params.isAgentEnabled) return false;
  if (!params.globalAgentEnabled) return false;
  if (!params.conversation?.followupActive) return false;
  return !isAdminConversationManuallyPaused(params.conversation);
}

export function shouldAutoRescheduleAdminFollowup(params: {
  conversation?: ContextStateCarrier | null;
  forceRestart?: boolean;
  allowManualResume?: boolean;
  hasScheduledFollowup?: boolean;
}): boolean {
  if (params.allowManualResume) return true;
  if (isAdminConversationFollowupManuallyPaused(params.conversation)) return false;
  if (!params.forceRestart && params.hasScheduledFollowup) return false;
  return true;
}
