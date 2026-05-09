import assert from "node:assert/strict";

import {
  buildBroadcastResumeState,
  isConnectionMarkedActiveForBroadcast,
  isBroadcastScheduledForFuture,
  parseBroadcastScheduledAt,
  selectBroadcastConnectionIdForContact,
} from "../broadcastService.ts";

async function main() {
  const parsedBrazilSchedule = parseBroadcastScheduledAt("2026-04-07T09:30");
  assert.ok(parsedBrazilSchedule);
  assert.equal(parsedBrazilSchedule?.toISOString(), "2026-04-07T12:30:00.000Z");

  assert.equal(
    isBroadcastScheduledForFuture(
      "2026-04-07T09:30",
      new Date("2026-04-07T12:29:59.000Z"),
    ),
    true,
  );

  assert.equal(
    isBroadcastScheduledForFuture(
      "2026-04-07T09:30:00-03:00",
      new Date("2026-04-07T12:30:00.000Z"),
    ),
    false,
  );

  const resumeState = buildBroadcastResumeState(
    [
      { id: "lead-1", phone: "(41) 99999-0001", name: "Ana" },
      { id: "lead-2", phone: "(41) 99999-0002", name: "Bruno" },
      { phone: "(41) 99999-0003", name: "Carla" },
    ],
    [
      {
        contactId: "lead-1",
        phone: "5541999990001",
        name: "Ana",
        status: "sent",
        sentAt: "2026-04-07T12:00:00.000Z",
      },
      {
        phone: "5541999990003",
        name: "Carla",
        status: "failed",
        error: "Socket indisponível",
      },
    ],
  );

  assert.equal(resumeState.sentCount, 1);
  assert.equal(resumeState.failedCount, 1);
  assert.equal(resumeState.pendingContacts.length, 1);
  assert.equal(resumeState.pendingContacts[0]?.id, "lead-2");
  assert.equal(resumeState.pendingContacts[0]?.phone, "(41) 99999-0002");
  assert.equal(resumeState.pendingContacts[0]?.sequenceIndex, 1);

  assert.equal(
    selectBroadcastConnectionIdForContact(["conn-a", "conn-b"], "fallback", 0),
    "conn-a",
  );
  assert.equal(
    selectBroadcastConnectionIdForContact(["conn-a", "conn-b"], "fallback", 1),
    "conn-b",
  );
  assert.equal(
    selectBroadcastConnectionIdForContact(["conn-a", "conn-b"], "fallback", 2),
    "conn-a",
  );
  assert.equal(selectBroadcastConnectionIdForContact([], "fallback", 2), "fallback");

  assert.equal(
    isConnectionMarkedActiveForBroadcast({
      isConnected: false,
      providerStatus: "connected",
    } as any),
    true,
  );
  assert.equal(
    isConnectionMarkedActiveForBroadcast({
      isConnected: false,
      providerStatus: "inactive",
    } as any),
    false,
  );

  console.log("broadcastService.resumeAndSchedule.test.ts ok");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
