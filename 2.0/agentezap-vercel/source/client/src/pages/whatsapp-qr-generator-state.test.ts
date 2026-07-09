import assert from "node:assert/strict";

import type { SmartQrcode } from "@shared/schema";

import {
  pickInitialSavedQrcode,
  WHATSAPP_QR_LAST_SELECTED_STORAGE_KEY,
} from "./whatsapp-qr-generator-state";

const baseQrcode = {
  userId: "user-1",
  description: null,
  slug: null,
  whatsappNumber: "5511999999999",
  welcomeMessage: "Ola!",
  templateId: "barbearia",
  templateName: "Barbearia",
  foregroundColor: "#111827",
  backgroundColor: "#ffffff",
  logoUrl: null,
  logoSize: 20,
  cornerRadius: 0,
  errorCorrection: "H",
  targetUrl: "https://wa.me/5511999999999?text=Ola!",
  qrData: null,
  qrGeneratedAt: null,
  qrSize: 1024,
  isActive: true,
  scanCount: 0,
  lastScannedAt: null,
} satisfies Omit<SmartQrcode, "id" | "name" | "createdAt" | "updatedAt">;

const olderQrcode: SmartQrcode = {
  ...baseQrcode,
  id: "qr-old",
  name: "QR antigo",
  createdAt: new Date("2026-03-10T10:00:00.000Z"),
  updatedAt: new Date("2026-03-10T10:00:00.000Z"),
};

const newerQrcode: SmartQrcode = {
  ...baseQrcode,
  id: "qr-new",
  name: "QR novo",
  createdAt: new Date("2026-03-11T10:00:00.000Z"),
  updatedAt: new Date("2026-03-12T10:00:00.000Z"),
};

assert.equal(WHATSAPP_QR_LAST_SELECTED_STORAGE_KEY, "agentezap:last-whatsapp-qrcode-id");
assert.equal(pickInitialSavedQrcode([], null), null);
assert.equal(
  pickInitialSavedQrcode([olderQrcode, newerQrcode], null)?.id,
  "qr-new"
);
assert.equal(
  pickInitialSavedQrcode([olderQrcode, newerQrcode], "qr-old")?.id,
  "qr-old"
);
assert.equal(
  pickInitialSavedQrcode([olderQrcode, newerQrcode], "missing-id")?.id,
  "qr-new"
);

console.log("whatsapp-qr-generator-state.test.ts ok");
