import test from "node:test";
import assert from "node:assert/strict";

import { buildUserFollowUpBacklogDecisions } from "../userFollowUpBacklogGovernor";

test("user follow-up backlog limit is isolated by connection", () => {
  const decisions = buildUserFollowUpBacklogDecisions(
    [
      { conversationId: "a1", userId: "user-a", connectionId: "conn-1", nextFollowupAt: "2026-04-09T20:01:00.000Z" },
      { conversationId: "b1", userId: "user-a", connectionId: "conn-2", nextFollowupAt: "2026-04-09T20:01:30.000Z" },
      { conversationId: "a2", userId: "user-a", connectionId: "conn-1", nextFollowupAt: "2026-04-09T20:02:00.000Z" },
      { conversationId: "b2", userId: "user-a", connectionId: "conn-2", nextFollowupAt: "2026-04-09T20:02:30.000Z" },
      { conversationId: "a3", userId: "user-a", connectionId: "conn-1", nextFollowupAt: "2026-04-09T20:03:00.000Z" },
      { conversationId: "b3", userId: "user-a", connectionId: "conn-2", nextFollowupAt: "2026-04-09T20:03:30.000Z" },
    ],
    2,
  );

  assert.deepEqual(
    decisions.map((decision) => `${decision.conversationId}:${decision.action}:${decision.wave}`),
    [
      "a1:process_now:0",
      "b1:process_now:0",
      "a2:process_now:0",
      "b2:process_now:0",
      "a3:delay:1",
      "b3:delay:1",
    ],
  );
});
