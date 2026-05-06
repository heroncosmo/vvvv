import { normalizeAgentSignatureName } from "@shared/agentSignature";

interface ResolveManualMessageSignatureInput {
  isMember: boolean;
  memberSignature?: string | null;
  memberSignatureEnabled?: boolean | null;
  ownerSignature?: string | null;
  ownerSignatureEnabled?: boolean | null;
}

export function resolveManualMessageSignatureName(
  input: ResolveManualMessageSignatureInput,
): string | null {
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
