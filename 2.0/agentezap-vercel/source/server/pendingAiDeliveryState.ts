export function isConfirmedOutgoingMessageStatus(status?: string | null): boolean {
  if (!status) return true;

  switch (status.trim().toLowerCase()) {
    case "sent":
    case "delivered":
    case "read":
      return true;
    case "queued":
    case "pending":
    case "pending_delivery":
    case "failed":
      return false;
    default:
      return true;
  }
}

export function isUnconfirmedOutgoingMessageStatus(status?: string | null): boolean {
  if (!status) return false;

  switch (status.trim().toLowerCase()) {
    case "queued":
    case "pending":
    case "pending_delivery":
    case "failed":
      return true;
    default:
      return false;
  }
}

export function shouldRecoverCompletedTimer(params: {
  lastCustomerAt?: Date | null;
  lastAgentAt?: Date | null;
  lastOwnerAt?: Date | null;
  now?: Date;
  maxCustomerSilenceHours?: number;
}): boolean {
  const {
    lastCustomerAt,
    lastAgentAt,
    lastOwnerAt,
    now = new Date(),
    maxCustomerSilenceHours = 24,
  } = params;

  if (!lastCustomerAt) return false;

  const maxAgeMs = maxCustomerSilenceHours * 60 * 60 * 1000;
  if (now.getTime() - lastCustomerAt.getTime() > maxAgeMs) return false;

  if (lastOwnerAt && lastOwnerAt.getTime() >= lastCustomerAt.getTime()) {
    return false;
  }

  if (!lastAgentAt) return true;

  return lastCustomerAt.getTime() > lastAgentAt.getTime();
}
