import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const whatsappSource = readFileSync(join(process.cwd(), "server", "whatsapp.ts"), "utf8");
const realtimeSource = readFileSync(join(process.cwd(), "server", "appRealtime.ts"), "utf8");

assert.match(
  realtimeSource,
  /export function hasWebSocketClient\(userId: string\)[\s\S]*userRealtimeClients\.get\(userId\)[\s\S]*readyState === WebSocket\.OPEN/,
  "appRealtime must expose a safe user realtime-client presence helper",
);

assert.match(
  realtimeSource,
  /export function hasAdminWebSocketClient\(adminId: string\)[\s\S]*adminRealtimeClients\.get\(adminId\)[\s\S]*readyState === WebSocket\.OPEN/,
  "appRealtime must expose a safe admin realtime-client presence helper",
);

assert.match(
  whatsappSource,
  /hasWebSocketClient\(userId\)/,
  "WhatsApp logout auto-retry must use the exported realtime helper for user clients",
);

assert.match(
  whatsappSource,
  /hasAdminWebSocketClient\(adminId\)/,
  "Admin WhatsApp logout auto-retry must use the exported realtime helper for admin clients",
);

assert.doesNotMatch(
  whatsappSource,
  /\bwsClients\.has\(|\badminWsClients\.has\(/,
  "WhatsApp runtime must not reference stale wsClients/adminWsClients globals",
);

console.log("whatsappRealtimeClientOwnership.source.test.ts ok");
