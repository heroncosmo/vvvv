import assert from "node:assert/strict";

import { UNRESOLVED_INCOMING_STUB_TEXT } from "../incomingStubFallback";
import {
  buildPendingFirstMessageAgentText,
  buildPendingFirstMessagePendingPayload,
  buildPendingFirstMessageSystemInstruction,
  decidePendingFirstMessageRecovery,
  getPendingFirstMessageRecoveryFromMessages,
  isPendingFirstMessagePendingPayload,
  PENDING_FIRST_MESSAGE_INTEREST_TEXT,
  shouldReplacePendingFirstMessagePayloadWithRealText,
} from "../pendingFirstMessageRecovery";

const chatUpdatePayload = buildPendingFirstMessagePendingPayload("chat_update_unread");
const stubPayload = buildPendingFirstMessagePendingPayload("stub_unresolved");

assert.equal(isPendingFirstMessagePendingPayload(chatUpdatePayload), true);
assert.deepEqual(getPendingFirstMessageRecoveryFromMessages([chatUpdatePayload]), {
  source: "chat_update_unread",
});
assert.deepEqual(getPendingFirstMessageRecoveryFromMessages([chatUpdatePayload, "mensagem real"]), null);
assert.equal(shouldReplacePendingFirstMessagePayloadWithRealText([chatUpdatePayload]), true);
assert.equal(shouldReplacePendingFirstMessagePayloadWithRealText([chatUpdatePayload, "mensagem real"]), false);

assert.deepEqual(
  decidePendingFirstMessageRecovery({
    source: "chat_update_unread",
    isDirectChat: true,
    unreadCount: 1,
    conversationWasCreated: true,
    existingMessages: [{ fromMe: false, text: UNRESOLVED_INCOMING_STUB_TEXT }],
  }),
  {
    eligible: true,
    reason: "eligible_pending_first_message",
    context: { source: "chat_update_unread" },
  },
);

assert.equal(
  decidePendingFirstMessageRecovery({
    source: "chat_update_unread",
    isDirectChat: false,
    unreadCount: 1,
    conversationWasCreated: true,
    existingMessages: [{ fromMe: false, text: UNRESOLVED_INCOMING_STUB_TEXT }],
  }).reason,
  "not_direct_chat",
);

assert.equal(
  decidePendingFirstMessageRecovery({
    source: "chat_update_unread",
    isDirectChat: true,
    unreadCount: 1,
    conversationWasCreated: false,
    existingMessages: [{ fromMe: false, text: UNRESOLVED_INCOMING_STUB_TEXT }],
  }).reason,
  "conversation_not_new",
);

assert.equal(
  decidePendingFirstMessageRecovery({
    source: "chat_update_unread",
    isDirectChat: true,
    unreadCount: 1,
    conversationWasCreated: true,
    existingMessages: [{ fromMe: false, text: "Bom dia, quero comprar" }],
  }).reason,
  "real_client_text_already_exists",
);

assert.equal(
  decidePendingFirstMessageRecovery({
    source: "chat_update_unread",
    isDirectChat: true,
    unreadCount: 1,
    conversationWasCreated: true,
    existingMessages: [{ fromMe: true, isFromAgent: true, text: "Ola! Como posso ajudar?" }],
  }).reason,
  "conversation_already_replied",
);

assert.deepEqual(
  decidePendingFirstMessageRecovery({
    source: "stub_unresolved",
    isDirectChat: true,
    pendingMessages: [UNRESOLVED_INCOMING_STUB_TEXT],
  }),
  {
    eligible: true,
    reason: "eligible_pending_first_message",
    context: { source: "stub_unresolved" },
  },
);

assert.equal(
  decidePendingFirstMessageRecovery({
    source: "stub_unresolved",
    isDirectChat: true,
    conversationWasCreated: false,
    existingMessages: [
      { fromMe: false, text: UNRESOLVED_INCOMING_STUB_TEXT },
      { fromMe: false, text: UNRESOLVED_INCOMING_STUB_TEXT },
    ],
    pendingMessages: [UNRESOLVED_INCOMING_STUB_TEXT],
  }).reason,
  "conversation_not_new",
);

assert.equal(
  decidePendingFirstMessageRecovery({
    source: "stub_unresolved",
    isDirectChat: true,
    conversationWasCreated: true,
    existingMessages: [{ fromMe: false, text: UNRESOLVED_INCOMING_STUB_TEXT }],
    pendingMessages: [UNRESOLVED_INCOMING_STUB_TEXT],
  }).eligible,
  true,
);

assert.equal(
  decidePendingFirstMessageRecovery({
    source: "stub_unresolved",
    isDirectChat: true,
    pendingMessages: [stubPayload],
  }).reason,
  "stub_signal_missing",
);

const agentText = buildPendingFirstMessageAgentText("chat_update_unread");
const systemInstruction = buildPendingFirstMessageSystemInstruction("stub_unresolved");
assert.equal(agentText, PENDING_FIRST_MESSAGE_INTEREST_TEXT);
assert.equal(systemInstruction.includes(PENDING_FIRST_MESSAGE_INTEREST_TEXT), true);
assert.equal(agentText.includes(chatUpdatePayload), false);
assert.equal(systemInstruction.includes(stubPayload), false);

console.log("pendingFirstMessageRecovery.test.ts ok");
