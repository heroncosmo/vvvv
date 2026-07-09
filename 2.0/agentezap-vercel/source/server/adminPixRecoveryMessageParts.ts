import { buildOwnerBillingMessageParts } from "./ownerBillingMessageParts";

export function buildAdminPixRecoveryMessageParts(message: string, pixCode: string): string[] {
  const parts = buildOwnerBillingMessageParts(message, {
    pix_copia_cola: pixCode,
  });

  if (!parts.pixCopyMessage) {
    return [parts.mainMessage].filter((part) => part.trim().length > 0);
  }

  return [parts.mainMessage, parts.pixCopyMessage].filter((part) => part.trim().length > 0);
}
