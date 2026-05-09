import assert from "node:assert/strict";

import {
  buildGatewayRuntimeFallbackStatus,
  gatewayStatusLooksConnected,
} from "../whatsappGatewayAppRuntime.ts";

const connectedGatewayConnection = {
  id: "conn-gateway",
  phoneNumber: "5511999999999",
  provider: "baileys",
  connectionMethod: "qr",
  providerStatus: "connected",
  isConnected: false,
  qrCode: null,
} as any;

const disconnectedGatewayConnection = {
  id: "conn-offline",
  phoneNumber: "5511888888888",
  provider: "baileys",
  connectionMethod: "qr",
  providerStatus: "inactive",
  isConnected: false,
  qrCode: null,
} as any;

const officialConnection = {
  id: "conn-official",
  phoneNumber: "5511777777777",
  provider: "meta_cloud_api",
  connectionMethod: "coexistence",
  providerStatus: "connected",
  isConnected: false,
  qrCode: null,
} as any;

async function main() {
  const fallbackConnected = buildGatewayRuntimeFallbackStatus(connectedGatewayConnection);
  assert.equal(fallbackConnected.instanceId, "conn-gateway");
  assert.equal(fallbackConnected.isConnected, true);
  assert.equal(fallbackConnected.providerStatus, "connected");
  assert.equal(gatewayStatusLooksConnected(fallbackConnected), true);

  const fallbackDisconnected = buildGatewayRuntimeFallbackStatus(disconnectedGatewayConnection);
  assert.equal(fallbackDisconnected.instanceId, "conn-offline");
  assert.equal(fallbackDisconnected.isConnected, false);
  assert.equal(fallbackDisconnected.providerStatus, "inactive");
  assert.equal(gatewayStatusLooksConnected(fallbackDisconnected), false);

  const officialFallback = buildGatewayRuntimeFallbackStatus(officialConnection);
  assert.equal(officialFallback.isConnected, true);
  assert.equal(officialFallback.providerStatus, "connected");
  assert.equal(gatewayStatusLooksConnected(officialFallback), true);

  console.log("whatsappGatewayAppRuntime.test.ts ok");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
