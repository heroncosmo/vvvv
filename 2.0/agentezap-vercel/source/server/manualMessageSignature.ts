import { normalizeAgentSignatureName } from "@shared/agentSignature";

interface ResolveManualMessageSignatureInput {
  isMember: boolean;
  memberSignature?: string | null;
  memberSignatureEnabled?: boolean | null;
  ownerSignature?: string | null;
  ownerSignatureEnabled?: boolean | null;
}

const OWNER_MANUAL_SIGNATURE_INDEPENDENT_MARKER = "owner_manual_signature_independent_from_ai_signature_v162";

export function resolveManualMessageSignatureName(
  input: ResolveManualMessageSignatureInput,
): string | null {
  void OWNER_MANUAL_SIGNATURE_INDEPENDENT_MARKER;

  if (input.isMember) {
    if (input.memberSignatureEnabled !== true) {
      return null;
    }

    return normalizeAgentSignatureName(input.memberSignature);
  }

  if (input.ownerSignatureEnabled !== true) {
    return null;
  }

  return normalizeAgentSignatureName(input.ownerSignature);
}
