import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routesSource = readFileSync(join(process.cwd(), "server", "routes.ts"), "utf8");

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing end marker: ${endNeedle}`);
  return source.slice(start, end);
}

const persistedQrBlock = sliceBetween(
  routesSource,
  "function getVisiblePersistedConnectionQr",
  "function sanitizePersistedQrForRoute",
);

assert.match(
  routesSource,
  /const ROUTE_WHATSAPP_QR_MAX_AGE_MS = Math\.max\([\s\S]*WHATSAPP_QR_MAX_AGE_MS/,
  "routes.ts must define the same QR freshness TTL used by visible connection payloads",
);

assert.match(
  routesSource,
  /function isFreshRouteQrCode[\s\S]*Date\.now\(\) - generatedAtMs < ROUTE_WHATSAPP_QR_MAX_AGE_MS/,
  "routes.ts must reject persisted QR codes outside the freshness window",
);

assert.match(
  routesSource,
  /function getVisiblePersistedConnectionQr[\s\S]*getConnectionQrGeneratedAtFromSessionData\(connection\.sessionData\)[\s\S]*isFreshRouteQrCode\(qrCode, generatedAt\)/,
  "persisted QR codes must be shown only when the stored lastQrCode timestamp is fresh",
);

assert.doesNotMatch(
  persistedQrBlock,
  /getConnectionUpdatedAtIso|connection\.updatedAt|updatedAt \|\| null/,
  "routes.ts must not treat connection updatedAt as a QR generation timestamp",
);

assert.match(
  routesSource,
  /function sanitizePersistedQrForRoute[\s\S]*qrCode: null,[\s\S]*qrCodeGeneratedAt: null/,
  "local route payloads must null stale persisted QR fields",
);

assert.match(
  routesSource,
  /const routeConnection = sanitizePersistedQrForRoute\(connection\);[\s\S]*\.\.\.routeConnection/,
  "primary connection payload must sanitize persisted QR before returning it",
);

assert.match(
  routesSource,
  /const routeLiveConn = sanitizePersistedQrForRoute\(liveConn\);[\s\S]*\.\.\.routeLiveConn/,
  "connection list payload must sanitize persisted QR before returning it",
);

assert.doesNotMatch(
  routesSource,
  /const visibleQrCode = gatewayStatus\?\.qrCode \|\| conn\.qrCode \|\| null/,
  "gateway/list payload must not blindly fall back to persisted QR without freshness checks",
);

assert.match(
  routesSource,
  /function getVisibleGatewayOrPersistedQr[\s\S]*const statusGeneratedAt[\s\S]*isFreshRouteQrCode\(statusQrCode, statusGeneratedAt\)/,
  "runtime QR payloads must also have a fresh/verifiable generation timestamp before being shown",
);

console.log("routesWhatsappQrFreshness.source.test.ts ok");
