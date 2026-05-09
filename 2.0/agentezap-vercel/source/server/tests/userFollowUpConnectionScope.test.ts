import test from "node:test";
import assert from "node:assert/strict";

import { resolveUserFollowUpSocketFromSessions } from "../userFollowUpConnectionState.ts";

test("usa apenas o socket da conexão dona quando há preferredConnectionId", () => {
  const preferredSocket = { user: { id: "preferred" } };
  const otherSocket = { user: { id: "other" } };
  const sessions = new Map<string, any>([
    [
      "conn-preferred",
      {
        userId: "user-1",
        socket: preferredSocket,
      },
    ],
    [
      "conn-other",
      {
        userId: "user-1",
        socket: otherSocket,
      },
    ],
  ]);

  const resolved = resolveUserFollowUpSocketFromSessions(
    sessions,
    "user-1",
    "conn-preferred",
  );

  assert.equal(resolved, preferredSocket);
});

test("não cai para outro socket do usuário quando a conexão dona está ausente", () => {
  const otherSocket = { user: { id: "other" } };
  const sessions = new Map<string, any>([
    [
      "conn-other",
      {
        userId: "user-1",
        socket: otherSocket,
      },
    ],
  ]);

  const resolved = resolveUserFollowUpSocketFromSessions(
    sessions,
    "user-1",
    "conn-preferred",
  );

  assert.equal(resolved, null);
});

test("sem conexão preferida continua podendo usar um socket ativo do usuário", () => {
  const otherSocket = { user: { id: "other" } };
  const sessions = new Map<string, any>([
    [
      "conn-other",
      {
        userId: "user-1",
        socket: otherSocket,
      },
    ],
  ]);

  const resolved = resolveUserFollowUpSocketFromSessions(sessions, "user-1");

  assert.equal(resolved, otherSocket);
});
