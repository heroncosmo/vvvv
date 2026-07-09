import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "server", "whatsapp.ts"), "utf8");

test("incoming WhatsApp text path does not wait for avatar or presence before persistence", () => {
  assert.match(source, /function refreshIncomingContactAvatarInBackground/);
  assert.match(source, /function sendNewContactPresenceInBackground/);

  const handlerStart = source.indexOf("async function handleIncomingMessage");
  assert.notEqual(handlerStart, -1);

  const firstPersist = source.indexOf("savedMessage = await storage.createMessage", handlerStart);
  assert.notEqual(firstPersist, -1);

  const prePersistencePath = source.slice(handlerStart, firstPersist);
  assert.doesNotMatch(prePersistencePath, /await\s+session\.socket\.profilePictureUrl/);
  assert.doesNotMatch(prePersistencePath, /await\s+session\.socket\.sendPresenceUpdate\(/);
  assert.doesNotMatch(prePersistencePath, /await\s+session\.socket\.presenceSubscribe\(/);
  assert.doesNotMatch(prePersistencePath, /isCatalogModuleActiveForAi/);
  assert.doesNotMatch(prePersistencePath, /pauseFollowUpUntilCompanyReply/);

  const firstRealtime = source.indexOf('type: "new_message"', firstPersist);
  assert.notEqual(firstRealtime, -1);
  assert.ok(firstPersist < firstRealtime);
});
