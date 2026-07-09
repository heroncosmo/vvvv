import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = process.cwd();

test("member realtime websocket uses member token on client and member-aware auth on server", () => {
  const appRealtimeClient = readFileSync(resolve(root, "client/src/lib/app-realtime.ts"), "utf8");
  const routesSource = readFileSync(resolve(root, "server/routes.ts"), "utf8");
  const appRealtimeServer = readFileSync(resolve(root, "server/appRealtime.ts"), "utf8");

  assert.match(
    appRealtimeClient,
    /localStorage\.getItem\("memberToken"\)/,
    "client realtime must prefer the memberToken when a member session is active",
  );
  assert.match(
    routesSource,
    /authenticateRealtimeSocketToken\(token\)/,
    "websocket upgrade must accept the same member token used by HTTP routes",
  );
  assert.match(
    routesSource,
    /realtimeSocket\.memberId = memberId/,
    "member websocket connections must keep memberId for authorization",
  );
  assert.match(
    appRealtimeServer,
    /canMemberReceiveConversationRealtimeEvent/,
    "member websocket broadcasts must be filtered by conversation access",
  );
  assert.match(
    appRealtimeServer,
    /resolveRealtimeConversationId/,
    "member websocket broadcasts must require a conversation id before sending payloads",
  );
  assert.doesNotMatch(
    appRealtimeServer,
    /member_reply_scope\s*={2,3}\s*["']shared["']/,
    "websocket visibility must not be broader than the existing conversation view policy",
  );
});
