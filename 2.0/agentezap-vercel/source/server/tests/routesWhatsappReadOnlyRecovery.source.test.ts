import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routesSource = readFileSync(join(process.cwd(), "server", "routes.ts"), "utf8");
const whatsappSource = readFileSync(join(process.cwd(), "server", "whatsapp.ts"), "utf8");

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing end marker: ${endNeedle}`);
  return source.slice(start, end);
}

const routeRecoveryHelper = sliceBetween(
  routesSource,
  "function shouldRouteStartLocalSessionRecovery",
  "import {",
);

assert.match(
  routeRecoveryHelper,
  /!hasPersistedAuth \|\| connection\.isConnected !== true/,
  "route reads must not start a Baileys recovery socket for DB-disconnected QR slots just because creds.json exists",
);

assert.match(
  routeRecoveryHelper,
  /ROUTE_LOCAL_AUTO_RECOVERY_BLOCKED_STATUSES\.has\(providerStatus\)/,
  "route recovery must reject hard-disconnected and QR/pairing statuses",
);

assert.ok(routesSource.includes('"qr_required"'), "QR-required status must be blocked from route-triggered recovery");
assert.ok(routesSource.includes('"open_timeout"'), "open-timeout status must be blocked from route-triggered recovery");
assert.ok(routesSource.includes('"logged_out"'), "logged-out status must be blocked from route-triggered recovery");

assert.match(
  routesSource,
  /const canStartRouteRecovery = shouldRouteStartLocalSessionRecovery\(connection, hasPersistedAuth\);[\s\S]*if \(!hasLocalSocket && canStartRouteRecovery\) \{[\s\S]*source: "api_whatsapp_connection"/,
  "primary connection GET must guard ensureUserSessionOperational with read-only recovery eligibility",
);

assert.match(
  routesSource,
  /const canStartRouteRecovery = shouldRouteStartLocalSessionRecovery\(conn, hasPersistedAuth\);[\s\S]*if \(!hasOperationalLocalSocket && canStartRouteRecovery\) \{[\s\S]*source: "api_whatsapp_connections"/,
  "connection list GET must guard ensureUserSessionOperational with read-only recovery eligibility",
);

assert.doesNotMatch(
  routesSource,
  /if \(!hasLocalSocket && hasPersistedAuth\)[\s\S]*source: "api_whatsapp_connection"/,
  "primary connection GET must not auto-start recovery from hasPersistedAuth alone",
);

assert.doesNotMatch(
  routesSource,
  /if \(!hasOperationalLocalSocket && hasPersistedAuth\)[\s\S]*source: "api_whatsapp_connections"/,
  "connection list GET must not auto-start recovery from hasPersistedAuth alone",
);

assert.match(
  routesSource,
  /const isRecovering = !isReallyConnected && canStartRouteRecovery;/,
  "disconnected QR slots with persisted auth must not be surfaced as recovering/connected",
);

assert.match(
  whatsappSource,
  /function shouldApplyOpenTimeoutCooldown[\s\S]*source\.startsWith\("session_ensure"\)/,
  "session_ensure reconnects started by app reads must respect open-timeout cooldowns",
);

console.log("routesWhatsappReadOnlyRecovery.source.test.ts ok");
