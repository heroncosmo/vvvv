import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConversationsListPageState,
  getConversationFilterNumber,
} from "../client/src/components/conversations-list-state";

const sampleConversation = {
  id: "conv-1",
  userId: "user-1",
  connectionId: "conn-1",
  remoteJid: "5511999999999@s.whatsapp.net",
  contactName: "Cliente Teste",
  contactNumber: "5511999999999",
  lastMessageText: "Oi",
  lastMessageTime: new Date("2026-03-12T10:00:00.000Z"),
  unreadCount: 1,
  isArchived: false,
  hasReplied: false,
  createdAt: new Date("2026-03-12T10:00:00.000Z"),
  updatedAt: new Date("2026-03-12T10:00:00.000Z"),
};

test("buildConversationsListPageState hidrata estado a partir da resposta paginada em cache", () => {
  const state = buildConversationsListPageState({
    data: [sampleConversation],
    total: 37,
    hasMore: true,
    offset: 0,
    limit: 50,
  });

  assert.equal(state.conversations.length, 1);
  assert.equal(state.conversations[0]?.id, "conv-1");
  assert.equal(state.totalCount, 37);
  assert.equal(state.hasMore, true);
  assert.equal(state.currentOffset, 1);
});

test("buildConversationsListPageState mantem compatibilidade com resposta legada em array", () => {
  const state = buildConversationsListPageState([sampleConversation]);

  assert.equal(state.conversations.length, 1);
  assert.equal(state.totalCount, 1);
  assert.equal(state.hasMore, false);
  assert.equal(state.currentOffset, 1);
});

test("getConversationFilterNumber usa remoteJid quando WebSocket nao envia contactNumber", () => {
  assert.equal(
    getConversationFilterNumber({
      contactNumber: undefined,
      remoteJid: "5517991956944@s.whatsapp.net",
    }),
    "5517991956944",
  );
});

test("getConversationFilterNumber nao quebra com conversa parcial", () => {
  assert.equal(getConversationFilterNumber({ contactNumber: undefined, remoteJid: undefined }), "");
  assert.equal(getConversationFilterNumber(null), "");
});
