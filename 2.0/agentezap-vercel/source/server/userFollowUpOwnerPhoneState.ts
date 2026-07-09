export const FOLLOWUP_OWNER_PHONE_LINKED_CONNECTION_SOURCE = "linked_connection_recovery";

export function normalizeFollowUpOwnerPhone(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

export function canBackfillOwnerPhoneFromLinkedConnection(params: {
  ownerPhone?: string | null;
  connectionPhone?: string | null;
  liveGatewayPhone?: string | null;
  contactNumber?: string | null;
  remoteJid?: string | null;
  jidSuffix?: string | null;
  isConnectionAvailable?: boolean | null;
}): { ok: boolean; phone: string | null; reason: string } {
  const existingOwnerPhone = normalizeFollowUpOwnerPhone(params.ownerPhone || "");
  const connectionPhone = normalizeFollowUpOwnerPhone(params.connectionPhone || "");
  const liveGatewayPhone = normalizeFollowUpOwnerPhone(params.liveGatewayPhone || "");
  const contactNumber = normalizeFollowUpOwnerPhone(params.contactNumber || "");
  const remoteJid = String(params.remoteJid || "").trim();
  const jidSuffix = String(params.jidSuffix || "").trim();

  if (existingOwnerPhone) {
    return { ok: false, phone: null, reason: "owner_already_set" };
  }

  if (!params.isConnectionAvailable) {
    return { ok: false, phone: null, reason: "connection_unavailable" };
  }

  if (!connectionPhone) {
    return { ok: false, phone: null, reason: "connection_phone_missing" };
  }

  if (liveGatewayPhone && liveGatewayPhone !== connectionPhone) {
    return { ok: false, phone: null, reason: "live_gateway_phone_mismatch" };
  }

  if (
    jidSuffix === "g.us" ||
    remoteJid.endsWith("@g.us") ||
    (contactNumber.startsWith("120363") && contactNumber.length >= 15)
  ) {
    return { ok: false, phone: null, reason: "group_conversation" };
  }

  if (contactNumber && contactNumber === connectionPhone) {
    return { ok: false, phone: null, reason: "self_conversation" };
  }

  return { ok: true, phone: connectionPhone, reason: "linked_connection" };
}
