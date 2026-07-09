import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const httpSource = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8");

const hardStatusesMatch = httpSource.match(
  /const HARD_GATEWAY_DISCONNECTED_PROVIDER_STATUSES = new Set\(\[([\s\S]*?)\]\);/,
);

assert.ok(hardStatusesMatch, "api/http.ts must keep an explicit hard disconnected status set");

const hardStatusesSource = hardStatusesMatch?.[1] || "";
for (const transientStatus of ["close", "closed", "disconnected", "not_connected"]) {
  assert.ok(
    !hardStatusesSource.includes(`"${transientStatus}"`),
    `${transientStatus} must stay recoverable for visible connection status`,
  );
}

assert.match(
  httpSource,
  /function persistedGatewayConnectionLooksConnectedForVisibleStatus[\s\S]*connection\.isConnected === true \|\|[\s\S]*normalizeGatewayVisibleStatus\(connection\.providerStatus\) === "connected"/,
  "api/http.ts must treat persisted provider_status connected as an operational signal",
);

assert.match(
  httpSource,
  /function gatewayStatusLooksConnectedForVisibleStatus[\s\S]*status\.isConnected === true \|\|[\s\S]*normalizeGatewayVisibleStatus\(status\.providerStatus\) === "connected"/,
  "api/http.ts must treat gateway providerStatus connected as connected",
);

assert.match(
  httpSource,
  /function gatewayStatusLooksHardDisconnectedForVisibleStatus[\s\S]*if \(getVisibleGatewayQrCode\(status\)\) \{[\s\S]*return true;/,
  "api/http.ts must only treat a visible fresh QR as a hard QR disconnect signal",
);

const persistedQrGeneratedAtBlock = httpSource.slice(
  httpSource.indexOf("function getVisiblePersistedQrGeneratedAt"),
  httpSource.indexOf("function getVisiblePersistedQrCode"),
);
assert.ok(persistedQrGeneratedAtBlock, "api/http.ts must contain persisted QR freshness helper");
assert.doesNotMatch(
  persistedQrGeneratedAtBlock,
  /updatedAt|connection\.updatedAt/,
  "api/http.ts must not use connection updatedAt as a QR generation timestamp",
);

assert.ok(
  !/function gatewayStatusLooksHardDisconnectedForVisibleStatus[\s\S]*if \(status\.qrCode\) \{[\s\S]*return true;/.test(httpSource),
  "api/http.ts must not treat raw/stale QR fields as hard disconnect signals",
);

console.log("apiHttpConnectionVisibleStatus.source.test.ts ok");
