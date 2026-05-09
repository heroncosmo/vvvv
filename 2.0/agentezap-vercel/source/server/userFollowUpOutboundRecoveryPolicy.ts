import { canReactivateFollowUpOnCompanyReply } from "./userFollowUpReactivationPolicy";

interface OutboundRecoveryParams {
  followupActive: boolean | null | undefined;
  followupDisabledReason: string | null | undefined;
  isGlobalFollowUpEnabled: boolean | null | undefined;
  lastMessageFromMe: boolean | null | undefined;
  lastCompanyOutboundAt?: Date | string | null | undefined;
  lastCancelledFollowUpAt?: Date | string | null | undefined;
}

function toTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function canRecoverFollowUpAfterCompanyOutbound(
  params: OutboundRecoveryParams,
): boolean {
  if (!params.isGlobalFollowUpEnabled) {
    return false;
  }

  if (!params.lastMessageFromMe) {
    return false;
  }

  const lastCancelledAt = toTimestamp(params.lastCancelledFollowUpAt);
  if (lastCancelledAt) {
    const lastCompanyOutboundAt = toTimestamp(params.lastCompanyOutboundAt);
    if (!lastCompanyOutboundAt || lastCancelledAt >= lastCompanyOutboundAt) {
      return false;
    }
  }

  return canReactivateFollowUpOnCompanyReply({
    followupActive: params.followupActive,
    followupDisabledReason: params.followupDisabledReason,
    isGlobalFollowUpEnabled: params.isGlobalFollowUpEnabled,
  });
}
