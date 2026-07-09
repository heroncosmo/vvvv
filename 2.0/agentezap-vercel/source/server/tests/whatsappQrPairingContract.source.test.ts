import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const whatsappSource = readFileSync("server/whatsapp.ts", "utf8");
const connectionPanelSource = readFileSync("client/src/components/connection-panel.tsx", "utf8");

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing end marker: ${endNeedle}`);
  return source.slice(start, end);
}

test("primary fresh QR request uses reset instead of reconnect", () => {
  const requestFreshQrBlock = sliceBetween(
    connectionPanelSource,
    "const requestFreshPrimaryQr = useCallback(() => {",
    "useEffect(() => {",
  );

  assert.match(requestFreshQrBlock, /resetMutation\.mutate\(\)/);
  assert.doesNotMatch(requestFreshQrBlock, /connectMutation\.mutate\(\)/);
});

test("expired QR auto-refresh forces reset for primary and additional connections", () => {
  const autoRefreshBlock = sliceBetween(
    connectionPanelSource,
    "const refreshExpiredQrCodes = () => {",
    "const interval = setInterval(refreshExpiredQrCodes",
  );

  assert.match(
    autoRefreshBlock,
    /Primary QR expired[\s\S]*resetMutation\.mutate\(\)/,
    "primary QR auto-refresh must invalidate stale auth before generating another QR",
  );
  assert.match(
    autoRefreshBlock,
    /Connection QR expired[\s\S]*resetConnectionMutation\.mutate\(connectionId\)/,
    "additional connection QR auto-refresh must call the reset endpoint",
  );
});

test("open timeout clears QR because the pairing socket is closed", () => {
  assert.doesNotMatch(whatsappSource, /QR_OPEN_TIMEOUT_PRESERVE_MS/);
  assert.doesNotMatch(whatsappSource, /buildOpenTimeoutQrPreservationPatch/);
  assert.doesNotMatch(whatsappSource, /baileys_qr_open_timeout_preserved/);
  assert.doesNotMatch(whatsappSource, /Preserved fresh QR after open_timeout/);
  assert.match(
    whatsappSource,
    /sock\.end\(timeoutError\);[\s\S]*sessions\.delete\(session\.connectionId\);[\s\S]*buildBaileysConnectionStatePatch\(false, \{ qrCode: null \}\)/,
    "open_timeout must not rebroadcast or persist a QR after closing the socket",
  );
  assert.match(
    whatsappSource,
    /broadcastToUser\(userId, \{[\s\S]*type: "disconnected",[\s\S]*reason: "open_timeout",[\s\S]*qrCode: null,[\s\S]*qrCodeGeneratedAt: null,/,
    "open_timeout must notify the UI to clear any QR already displayed",
  );
  assert.match(
    whatsappSource,
    /memoryCache\.invalidate\(`api:wa-conn:\$\{userId\}:\$\{session\.connectionId\}`\)/,
    "open_timeout must invalidate cached connection payloads for the affected connection",
  );
});

test("client does not use connection updatedAt as QR freshness fallback", () => {
  const qrGeneratedAtBlock = sliceBetween(
    connectionPanelSource,
    "function getQrGeneratedAtFromConnection",
    "function isFreshQrCode",
  );

  assert.doesNotMatch(qrGeneratedAtBlock, /updatedAt/);
  assert.match(qrGeneratedAtBlock, /return null;/);
});

test("QR and pairing sockets use current WhatsApp Web version instead of stale fixed version", () => {
  assert.match(whatsappSource, /fetchLatestWaWebVersion/);
  assert.match(whatsappSource, /async function resolveWaSocketVersion/);
  assert.match(whatsappSource, /WA_WEB_VERSION_OVERRIDE \|\| process\.env\.WA_SOCKET_VERSION_OVERRIDE/);
  assert.doesNotMatch(whatsappSource, /fetchLatestBaileysVersion/);
  assert.doesNotMatch(whatsappSource, /version:\s*\[2,\s*3000,\s*1033893291\]/);
  assert.match(
    whatsappSource,
    /const waSocketVersion = await resolveWaSocketVersion\("connectWhatsApp"\);[\s\S]*version: waSocketVersion/,
  );
  assert.match(
    whatsappSource,
    /const waSocketVersion = await resolveWaSocketVersion\("connectAdminWhatsApp"\);[\s\S]*version: waSocketVersion/,
  );
  assert.match(
    whatsappSource,
    /const version = await resolveWaSocketVersion\("createPairingSocket"\);[\s\S]*version,/,
  );
  assert.match(
    whatsappSource,
    /const restartVersion = await resolveWaSocketVersion\("pairingRestartSocket"\);[\s\S]*version: restartVersion/,
  );
});

test("pairing code attempts are scoped by connection when connectionId is provided", () => {
  const pairingBlock = sliceBetween(
    whatsappSource,
    "export async function requestClientPairingCode",
    "type AdminAutoSendState = {",
  );

  assert.match(pairingBlock, /const pairingRequestKey = targetConnectionId \|\| userId/);
  assert.match(pairingBlock, /auth_pairing_\$\{pairingRequestKey\}/);
  assert.match(pairingBlock, /pendingPairingRequests\.set\(pairingRequestKey, requestPromise\)/);
  assert.match(pairingBlock, /pairingSessions\.set\(pairingRequestKey,/);
  assert.match(pairingBlock, /if \(!connection \|\| connection\.userId !== userId\)/);
  assert.match(pairingBlock, /const resolvedMainAuth = await resolveConnectionAuthScope\(userId, connection, connection\.id\)/);
  assert.doesNotMatch(pairingBlock, /pendingPairingRequests\.(get|set|delete)\(userId\)/);
});
