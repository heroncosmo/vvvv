import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeIndividualContactNumberFromJid,
  shouldBlockAutomatedConversationSend,
} from "../conversationAutoPauseGuard";
import { storage } from "../storage";

type StorageOverrides = Partial<Record<
  | "getConnectionsByUserId"
  | "getActiveConversationByContactNumber"
  | "getConversationByContactNumber"
  | "isAgentDisabledForConversation",
  any
>>;

async function withMockedStorage<T>(
  overrides: StorageOverrides,
  run: () => Promise<T>,
): Promise<T> {
  const storageAny = storage as any;
  const originals = new Map<string, any>();

  for (const [key, value] of Object.entries(overrides)) {
    originals.set(key, storageAny[key]);
    storageAny[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of originals.entries()) {
      storageAny[key] = value;
    }
  }
}

test("normaliza jid individual e ignora grupos/status", () => {
  assert.equal(normalizeIndividualContactNumberFromJid("5511999999999@s.whatsapp.net"), "5511999999999");
  assert.equal(normalizeIndividualContactNumberFromJid("5511999999999@lid"), "5511999999999");
  assert.equal(normalizeIndividualContactNumberFromJid("120363047523247890@g.us"), null);
  assert.equal(normalizeIndividualContactNumberFromJid("status@broadcast"), null);
});

test("bloqueia envio automático quando a conversa explícita está pausada", async () => {
  const result = await withMockedStorage(
    {
      isAgentDisabledForConversation: async (conversationId: string) => conversationId === "conv-1",
    },
    async () =>
      shouldBlockAutomatedConversationSend({
        userId: "user-1",
        jid: "5511999999999@s.whatsapp.net",
        conversationId: "conv-1",
        origin: "ai_agent",
      }),
  );

  assert.equal(result.blocked, true);
  assert.equal(result.conversationId, "conv-1");
});

test("resolve pela conexão do usuário e bloqueia quando a conversa encontrada está pausada", async () => {
  const result = await withMockedStorage(
    {
      getConnectionsByUserId: async () => [{ id: "conn-1" }, { id: "conn-2" }],
      getActiveConversationByContactNumber: async (connectionId: string, contactNumber: string) => {
        if (connectionId === "conn-2" && contactNumber === "5511888888888") {
          return { id: "conv-2" };
        }
        return undefined;
      },
      getConversationByContactNumber: async () => undefined,
      isAgentDisabledForConversation: async (conversationId: string) => conversationId === "conv-2",
    },
    async () =>
      shouldBlockAutomatedConversationSend({
        userId: "user-1",
        jid: "5511888888888@s.whatsapp.net",
        origin: "chatbot_flow",
      }),
  );

  assert.equal(result.blocked, true);
  assert.equal(result.conversationId, "conv-2");
});

test("não bloqueia mensagem manual do dono nem número sem conversa correspondente", async () => {
  const manualResult = await withMockedStorage(
    {
      getConnectionsByUserId: async () => [{ id: "conn-1" }],
      getActiveConversationByContactNumber: async () => ({ id: "conv-manual" }),
      getConversationByContactNumber: async () => ({ id: "conv-manual" }),
      isAgentDisabledForConversation: async () => true,
    },
    async () =>
      shouldBlockAutomatedConversationSend({
        userId: "user-1",
        jid: "5511777777777@s.whatsapp.net",
        origin: "conversation",
        isOwnerInitiated: true,
      }),
  );

  assert.equal(manualResult.blocked, false);

  const noConversationResult = await withMockedStorage(
    {
      getConnectionsByUserId: async () => [{ id: "conn-1" }],
      getActiveConversationByContactNumber: async () => undefined,
      getConversationByContactNumber: async () => undefined,
      isAgentDisabledForConversation: async () => false,
    },
    async () =>
      shouldBlockAutomatedConversationSend({
        userId: "user-1",
        jid: "5511666666666@s.whatsapp.net",
        origin: "notification",
      }),
  );

  assert.equal(noConversationResult.blocked, false);
  assert.equal(noConversationResult.conversationId, null);
});

test("nao bloqueia follow-up do usuario mesmo com IA pausada na conversa", async () => {
  const result = await withMockedStorage(
    {
      isAgentDisabledForConversation: async () => true,
    },
    async () =>
      shouldBlockAutomatedConversationSend({
        userId: "user-1",
        jid: "5511999999999@s.whatsapp.net",
        conversationId: "conv-followup",
        origin: "user_follow_up",
      }),
  );

  assert.equal(result.blocked, false);
  assert.equal(result.conversationId, "conv-followup");
});
