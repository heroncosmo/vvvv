import type { SmartQrcode } from "@shared/schema";

export const WHATSAPP_QR_LAST_SELECTED_STORAGE_KEY = "agentezap:last-whatsapp-qrcode-id";

function toTimestamp(value?: string | Date | null): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function pickInitialSavedQrcode(
  qrcodes: SmartQrcode[],
  preferredId: string | null
): SmartQrcode | null {
  if (!qrcodes.length) return null;

  if (preferredId) {
    const preferredQrcode = qrcodes.find((qrcode) => qrcode.id === preferredId);
    if (preferredQrcode) return preferredQrcode;
  }

  return qrcodes
    .slice()
    .sort((left, right) => {
      const rightTime = Math.max(toTimestamp(right.updatedAt), toTimestamp(right.createdAt));
      const leftTime = Math.max(toTimestamp(left.updatedAt), toTimestamp(left.createdAt));
      return rightTime - leftTime;
    })[0] || null;
}
