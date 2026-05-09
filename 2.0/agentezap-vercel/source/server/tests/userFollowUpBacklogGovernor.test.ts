import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUserFollowUpBacklogDecisions,
  sortUserFollowUpBacklogEntries,
} from "../userFollowUpBacklogGovernor";

test("limita backlog por usuário em ondas sequenciais", () => {
  const decisions = buildUserFollowUpBacklogDecisions(
    [
      { conversationId: "a1", userId: "user-a", nextFollowupAt: "2026-04-09T20:01:00.000Z" },
      { conversationId: "a2", userId: "user-a", nextFollowupAt: "2026-04-09T20:02:00.000Z" },
      { conversationId: "a3", userId: "user-a", nextFollowupAt: "2026-04-09T20:03:00.000Z" },
      { conversationId: "a4", userId: "user-a", nextFollowupAt: "2026-04-09T20:04:00.000Z" },
      { conversationId: "a5", userId: "user-a", nextFollowupAt: "2026-04-09T20:05:00.000Z" },
      { conversationId: "a6", userId: "user-a", nextFollowupAt: "2026-04-09T20:06:00.000Z" },
      { conversationId: "a7", userId: "user-a", nextFollowupAt: "2026-04-09T20:07:00.000Z" },
      { conversationId: "a8", userId: "user-a", nextFollowupAt: "2026-04-09T20:08:00.000Z" },
      { conversationId: "a9", userId: "user-a", nextFollowupAt: "2026-04-09T20:09:00.000Z" },
      { conversationId: "a10", userId: "user-a", nextFollowupAt: "2026-04-09T20:10:00.000Z" },
    ],
    4,
  );

  assert.deepEqual(
    decisions.map((decision) => ({
      conversationId: decision.conversationId,
      action: decision.action,
      wave: decision.wave,
      slotInWave: decision.slotInWave,
    })),
    [
      { conversationId: "a1", action: "process_now", wave: 0, slotInWave: 0 },
      { conversationId: "a2", action: "process_now", wave: 0, slotInWave: 1 },
      { conversationId: "a3", action: "process_now", wave: 0, slotInWave: 2 },
      { conversationId: "a4", action: "process_now", wave: 0, slotInWave: 3 },
      { conversationId: "a5", action: "delay", wave: 1, slotInWave: 0 },
      { conversationId: "a6", action: "delay", wave: 1, slotInWave: 1 },
      { conversationId: "a7", action: "delay", wave: 1, slotInWave: 2 },
      { conversationId: "a8", action: "delay", wave: 1, slotInWave: 3 },
      { conversationId: "a9", action: "delay", wave: 2, slotInWave: 0 },
      { conversationId: "a10", action: "delay", wave: 2, slotInWave: 1 },
    ],
  );
});

test("aplica o limite por usuário de forma independente", () => {
  const decisions = buildUserFollowUpBacklogDecisions(
    [
      { conversationId: "a1", userId: "user-a", nextFollowupAt: "2026-04-09T20:01:00.000Z" },
      { conversationId: "b1", userId: "user-b", nextFollowupAt: "2026-04-09T20:01:30.000Z" },
      { conversationId: "a2", userId: "user-a", nextFollowupAt: "2026-04-09T20:02:00.000Z" },
      { conversationId: "b2", userId: "user-b", nextFollowupAt: "2026-04-09T20:02:30.000Z" },
      { conversationId: "a3", userId: "user-a", nextFollowupAt: "2026-04-09T20:03:00.000Z" },
      { conversationId: "b3", userId: "user-b", nextFollowupAt: "2026-04-09T20:03:30.000Z" },
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

test("prioriza conversas mais vencidas antes das mais recentes do mesmo usuário", () => {
  const ordered = sortUserFollowUpBacklogEntries([
    {
      conversationId: "recente",
      userId: "user-a",
      nextFollowupAt: "2026-04-09T21:00:00.000Z",
      lastMessageTime: "2026-04-09T20:55:00.000Z",
    },
    {
      conversationId: "antiga",
      userId: "user-a",
      nextFollowupAt: "2026-04-09T20:00:00.000Z",
      lastMessageTime: "2026-04-08T20:00:00.000Z",
    },
    {
      conversationId: "meio",
      userId: "user-a",
      nextFollowupAt: "2026-04-09T20:30:00.000Z",
      lastMessageTime: "2026-04-09T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(ordered.map((entry) => entry.conversationId), ["antiga", "meio", "recente"]);
});

test("o governor processa primeiro as conversas mais antigas quando o usuário tem backlog grande", () => {
  const decisions = buildUserFollowUpBacklogDecisions(
    [
      {
        conversationId: "recente-1",
        userId: "user-a",
        nextFollowupAt: "2026-04-09T21:10:00.000Z",
        lastMessageTime: "2026-04-09T21:09:00.000Z",
      },
      {
        conversationId: "antiga-1",
        userId: "user-a",
        nextFollowupAt: "2026-04-09T20:10:00.000Z",
        lastMessageTime: "2026-04-08T20:00:00.000Z",
      },
      {
        conversationId: "recente-2",
        userId: "user-a",
        nextFollowupAt: "2026-04-09T21:20:00.000Z",
        lastMessageTime: "2026-04-09T21:19:00.000Z",
      },
      {
        conversationId: "antiga-2",
        userId: "user-a",
        nextFollowupAt: "2026-04-09T20:20:00.000Z",
        lastMessageTime: "2026-04-08T21:00:00.000Z",
      },
      {
        conversationId: "antiga-3",
        userId: "user-a",
        nextFollowupAt: "2026-04-09T20:30:00.000Z",
        lastMessageTime: "2026-04-08T22:00:00.000Z",
      },
    ],
    2,
  );

  assert.deepEqual(
    decisions.map((decision) => `${decision.conversationId}:${decision.action}`),
    [
      "antiga-1:process_now",
      "antiga-2:process_now",
      "antiga-3:delay",
      "recente-1:delay",
      "recente-2:delay",
    ],
  );
});

test("mantém a prioridade temporal mesmo quando o conversationId em ordem lexicográfica sugeriria o contrário", () => {
  const decisions = buildUserFollowUpBacklogDecisions(
    [
      {
        conversationId: "zzz-conversa-recente",
        userId: "user-a",
        nextFollowupAt: "2026-04-09T21:20:00.000Z",
        lastMessageTime: "2026-04-09T21:19:00.000Z",
        updatedAt: "2026-04-09T21:19:30.000Z",
        createdAt: "2026-04-09T21:18:00.000Z",
      },
      {
        conversationId: "aaa-conversa-antiga",
        userId: "user-a",
        nextFollowupAt: "2026-04-09T20:10:00.000Z",
        lastMessageTime: "2026-04-08T20:00:00.000Z",
        updatedAt: "2026-04-08T20:01:00.000Z",
        createdAt: "2026-04-08T19:50:00.000Z",
      },
      {
        conversationId: "mmm-conversa-intermediaria",
        userId: "user-a",
        nextFollowupAt: "2026-04-09T20:40:00.000Z",
        lastMessageTime: "2026-04-09T10:00:00.000Z",
        updatedAt: "2026-04-09T10:10:00.000Z",
        createdAt: "2026-04-09T09:50:00.000Z",
      },
    ],
    2,
  );

  assert.deepEqual(
    decisions.map((decision) => `${decision.conversationId}:${decision.action}`),
    [
      "aaa-conversa-antiga:process_now",
      "mmm-conversa-intermediaria:process_now",
      "zzz-conversa-recente:delay",
    ],
  );
});
