import assert from "node:assert/strict";

import {
  broadcastServiceDeps,
  resolveBaileysBroadcastSocket,
} from "../broadcastService.ts";

async function main() {
  const originalEnsure = broadcastServiceDeps.ensureUserSessionOperational;

  try {
    const recoveredSocket = {
      sendMessage: async () => ({ key: { id: "msg-broadcast-test" } }),
    };

    const calls: Array<{
      userId: string;
      connectionId?: string;
      options?: {
        waitMs?: number;
        source?: string;
        allowPersistedAuthRecovery?: boolean;
      };
    }> = [];

    broadcastServiceDeps.ensureUserSessionOperational = async (userId, connectionId, options) => {
      calls.push({ userId, connectionId, options });
      return {
        socket: recoveredSocket,
      } as any;
    };

    const resolvedSocket = await resolveBaileysBroadcastSocket(
      "user-broadcast",
      "conn-broadcast",
      "broadcast:test",
    );

    assert.equal(resolvedSocket, recoveredSocket);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      userId: "user-broadcast",
      connectionId: "conn-broadcast",
      options: {
        waitMs: 10_000,
        source: "broadcast:test",
      },
    });

    broadcastServiceDeps.ensureUserSessionOperational = async () => undefined as any;

    const missingSocket = await resolveBaileysBroadcastSocket(
      "user-broadcast",
      "conn-broadcast",
      "broadcast:test:missing",
    );

    assert.equal(missingSocket, null);

    console.log("broadcastService.sessionRecovery.test.ts ok");
  } finally {
    broadcastServiceDeps.ensureUserSessionOperational = originalEnsure;
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
