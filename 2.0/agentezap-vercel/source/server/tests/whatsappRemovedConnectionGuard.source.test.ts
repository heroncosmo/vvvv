import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const whatsappSource = readFileSync(join(process.cwd(), "server", "whatsapp.ts"), "utf8");

assert.match(
  whatsappSource,
  /if \(isUserRemovedConnection\(connection\)\) \{[\s\S]*removed from the app; skipping reconnect[\s\S]*clearPendingConnectionLock\(lockKey, "removed_connection"\);[\s\S]*settleConnectionPromise\([\s\S]*"reject",[\s\S]*"removed_connection"/,
  "connectWhatsApp must reject reconnect attempts for connections removed from the app",
);

assert.match(
  whatsappSource,
  /await storage\.getConnectionById\(targetConnectionId\)[\s\S]*if \(isUserRemovedConnection\(connection\)\)/,
  "removed-connection guard must run after loading the requested connection record",
);

console.log("whatsappRemovedConnectionGuard.source.test.ts ok");
