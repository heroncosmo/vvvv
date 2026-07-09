import assert from "node:assert/strict";

import { resolveAppVisibleConnectionOwner } from "../whatsappGatewayAppOwnership.ts";

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

const incompleteConnection = {
  id: "conn-baileys",
  userId: "user-baileys",
} as any;

async function main() {
  const originalDisableLocalRuntime = process.env.DISABLE_CUSTOMER_BAILEYS_LOCAL_RUNTIME;
  const originalServiceMode = process.env.SERVICE_MODE;
  const originalRouteAll = process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS;
  const originalAllowed = process.env.WA_GATEWAY_ALLOWED_EMAILS;
  const originalRouted = process.env.WA_GATEWAY_ROUTED_EMAILS;
  const originalGatewayUrl = process.env.WA_GATEWAY_URL;

  try {
    process.env.DISABLE_CUSTOMER_BAILEYS_LOCAL_RUNTIME = "1";
    process.env.SERVICE_MODE = "monolith";
    process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS = "0";
    process.env.WA_GATEWAY_ALLOWED_EMAILS = "";
    process.env.WA_GATEWAY_ROUTED_EMAILS = "";

    assert.equal(await resolveAppVisibleConnectionOwner(baileysConnection), "gateway");
    assert.equal(await resolveAppVisibleConnectionOwner(incompleteConnection), "gateway");
    assert.equal(await resolveAppVisibleConnectionOwner(officialConnection), "local");

    process.env.DISABLE_CUSTOMER_BAILEYS_LOCAL_RUNTIME = "0";
    process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS = "1";

    assert.equal(await resolveAppVisibleConnectionOwner(baileysConnection), "gateway");

    process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS = "0";
    process.env.WA_GATEWAY_URL = "https://gateway-interno.exemplo";

    assert.equal(await resolveAppVisibleConnectionOwner(baileysConnection), "gateway");

    console.log("whatsappGatewayAppOwnership.test.ts ok");
  } finally {
    process.env.DISABLE_CUSTOMER_BAILEYS_LOCAL_RUNTIME = originalDisableLocalRuntime;
    process.env.SERVICE_MODE = originalServiceMode;
    process.env.WA_GATEWAY_ROUTE_ALL_BAILEYS = originalRouteAll;
    process.env.WA_GATEWAY_ALLOWED_EMAILS = originalAllowed;
    process.env.WA_GATEWAY_ROUTED_EMAILS = originalRouted;
    process.env.WA_GATEWAY_URL = originalGatewayUrl;
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
