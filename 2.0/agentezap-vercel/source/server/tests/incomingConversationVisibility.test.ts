import assert from "node:assert/strict";
import { shouldPromoteIncomingMessageToConversationList } from "../incomingConversationVisibility";

assert.equal(shouldPromoteIncomingMessageToConversationList("normal"), true);
assert.equal(shouldPromoteIncomingMessageToConversationList("stub"), true);
assert.equal(shouldPromoteIncomingMessageToConversationList("contact"), true);
assert.equal(shouldPromoteIncomingMessageToConversationList("unsupported"), true);
assert.equal(shouldPromoteIncomingMessageToConversationList("protocol"), false);

console.log("incomingConversationVisibility.test.ts ok");
