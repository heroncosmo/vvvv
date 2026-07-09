import { isAdminLiveAiEnabled } from "./adminMessagingFeaturePolicy";

interface AdminInboundAutomationInput {
  isAgentEnabled: boolean;
  isConnectionAiEnabled?: boolean;
  followupActive?: boolean;
}

// Follow-up continua permitido em callbacks dedicados. Esta regra vale
// apenas para respostas automáticas geradas a partir de novas mensagens.
export function shouldProcessInboundAdminAutomation(
  input: AdminInboundAutomationInput,
): boolean {
  return (
    isAdminLiveAiEnabled() &&
    input.isConnectionAiEnabled !== false &&
    input.isAgentEnabled === true
  );
}
