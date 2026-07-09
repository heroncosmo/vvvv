import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const whatsappSource = readFileSync(join(process.cwd(), "server", "whatsapp.ts"), "utf8");

assert.match(
  whatsappSource,
  /const MANUAL_DISCONNECT_AUTO_RECONNECT_BLOCK_FLAG = "manualDisconnectAutoReconnectBlocked"/,
  "manual disconnect auto-reconnect flag must exist",
);

assert.match(
  whatsappSource,
  /function buildManualDisconnectProviderConfig[\s\S]*manualDisconnectBlockedAt[\s\S]*manualDisconnectSource/,
  "manual disconnect must persist a providerConfig block with audit metadata",
);

assert.match(
  whatsappSource,
  /buildBaileysConnectionStatePatch\(false,[\s\S]*providerConfig: buildManualDisconnectProviderConfig\(connection, "manual_disconnect"\)/,
  "disconnectWhatsApp must mark manual disconnects so health-check cannot reconnect them",
);

assert.match(
  whatsappSource,
  /if \(isManualDisconnectAutoReconnectBlocked\(connection\)\) \{[\s\S]*shouldRespectManualDisconnectBlock\(connectSource\)[\s\S]*WA_MANUAL_DISCONNECT_BLOCKED[\s\S]*manual_disconnect_blocked[\s\S]*clearManualDisconnectProviderConfig\(connection\)/,
  "connectWhatsApp must block automated reconnects but clear the block on explicit user reconnect",
);

assert.match(
  whatsappSource,
  /if \(isManualDisconnectAutoReconnectBlocked\(connection\)\) \{[\s\S]*auto-reconnect paused until user reconnects[\s\S]*continue;/,
  "connectionHealthCheck must not heal or reconnect manually disconnected connections",
);

assert.match(
  whatsappSource,
  /force_reset[\s\S]*providerConfig: clearManualDisconnectProviderConfig\(connection\)/,
  "force reset/new QR must clear manual disconnect block",
);

console.log("whatsappManualDisconnectGuard.source.test.ts ok");
