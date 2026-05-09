import assert from "node:assert/strict";

import {
  isPublicInstanceApiCanaryEnabledForConnection,
  resolveWhatsAppConnectionOwner,
} from "../whatsappGatewayOwnership.ts";

const baileysConnection = {
  id: "conn-baileys",
  userId: "user-baileys",
  provider: "baileys",
  connectionMethod: "qr",
} as any;

const officialConnection = {
  id: "conn-official",
  userId: "user-official",
  provider: "meta_cloud_api",
  connectionMethod: "coexistence",
} as any;

async function main() {
  const originalRouteAll = process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS;
  const originalPublicAll = process.env.WA_PUBLIC_INSTANCE_API_ENABLE_ALL_BAILEYS;
  const originalAllowed = process.env.WA_GATEWAY_ALLOWED_EMAILS;
  const originalRouted = process.env.WA_GATEWAY_ROUTED_EMAILS;
  const originalCanary = process.env.WA_PUBLIC_INSTANCE_API_CANARY_EMAILS;
  const originalDisableProcessing = process.env.DISABLE_WHATSAPP_PROCESSING;
  const originalGatewayUrl = process.env.WA_GATEWAY_URL;
  const originalServiceMode = process.env.SERVICE_MODE;

  try {
    process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS = "1";
    process.env.WA_PUBLIC_INSTANCE_API_ENABLE_ALL_BAILEYS = "1";
    process.env.WA_GATEWAY_ALLOWED_EMAILS = "";
    process.env.WA_GATEWAY_ROUTED_EMAILS = "";
    process.env.WA_PUBLIC_INSTANCE_API_CANARY_EMAILS = "";

    assert.equal(await resolveWhatsAppConnectionOwner(baileysConnection), "gateway");
    assert.equal(await isPublicInstanceApiCanaryEnabledForConnection(baileysConnection), true);

    assert.equal(await resolveWhatsAppConnectionOwner(officialConnection), "local");
    assert.equal(await isPublicInstanceApiCanaryEnabledForConnection(officialConnection), false);

    process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS = "0";
    process.env.WA_GATEWAY_URL = "http://gateway:5001";
    process.env.DISABLE_WHATSAPP_PROCESSING = "true";
    process.env.SERVICE_MODE = "api";

    assert.equal(await resolveWhatsAppConnectionOwner(baileysConnection), "gateway");
    assert.equal(await resolveWhatsAppConnectionOwner(officialConnection), "local");

    console.log("whatsappGatewayOwnership.test.ts ok");
  } finally {
    process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS = originalRouteAll;
    process.env.WA_PUBLIC_INSTANCE_API_ENABLE_ALL_BAILEYS = originalPublicAll;
    process.env.WA_GATEWAY_ALLOWED_EMAILS = originalAllowed;
    process.env.WA_GATEWAY_ROUTED_EMAILS = originalRouted;
    process.env.WA_PUBLIC_INSTANCE_API_CANARY_EMAILS = originalCanary;
    process.env.DISABLE_WHATSAPP_PROCESSING = originalDisableProcessing;
    process.env.WA_GATEWAY_URL = originalGatewayUrl;
    process.env.SERVICE_MODE = originalServiceMode;
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
