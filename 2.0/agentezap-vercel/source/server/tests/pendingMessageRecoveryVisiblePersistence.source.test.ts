import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const recoverySource = readFileSync("server/pendingMessageRecoveryService.ts", "utf8");
const whatsappSource = readFileSync("server/whatsapp.ts", "utf8");

test("pending recovery verifies visible persistence before marking inbound as processed", () => {
  assert.match(
    recoverySource,
    /private async hasPersistedVisibleMessage\(whatsappMessageId: string\)/,
    "recovery must query persisted visible messages by WhatsApp message id",
  );
  assert.match(
    recoverySource,
    /message_processor_completed_without_visible_message/,
    "message processor success without a visible messages row must be treated as a retryable failure",
  );
  assert.match(
    recoverySource,
    /await this\.markAsProcessed\(pending\.whatsapp_message_id\)/,
    "pending rows should only be marked processed after visibility checks pass",
  );
});

test("pending recovery duplicate lookup uses message_id range instead of unbounded like", () => {
  const fn = recoverySource.match(
    /private async hasPersistedVisibleMessage\(whatsappMessageId: string\): Promise<boolean> \{([\s\S]*?)\n  \}/,
  )?.[1] || "";

  assert.match(fn, /const duplicatePrefix = `\$\{whatsappMessageId\}_dup_`/);
  assert.match(fn, /\.gte\('message_id', duplicatePrefix\)/);
  assert.match(fn, /\.lt\('message_id', duplicateUpperBound\)/);
  assert.doesNotMatch(fn, /\.like\('message_id'/);
});

test("pending recovery only requires visible messages for supported conversation JIDs", () => {
  const fn = recoverySource.match(
    /private shouldRequireVisibleMessage\(pending: PendingMessage\): boolean \{([\s\S]*?)\n  \}/,
  )?.[1] || "";

  assert.match(fn, /@s\.whatsapp\.net/, "direct WhatsApp contacts must require visible persistence");
  assert.match(fn, /@lid/, "LID contacts must require visible persistence");
  assert.match(fn, /@g\.us/, "groups must require visible persistence");
  assert.doesNotMatch(fn, /@newsletter/, "newsletters should not be treated as visible conversations");
  assert.match(fn, /messageType !== 'protocol'/, "protocol events should not require a visible user message");
});

test("pending recovery bypasses stale incoming dedupe while reprocessing captured inbound", () => {
  assert.match(
    whatsappSource,
    /bypassIncomingDedupe\?: boolean/,
    "handleIncomingMessage must accept an explicit recovery dedupe bypass",
  );
  assert.match(
    whatsappSource,
    /opts\?\.bypassIncomingDedupe !== true/,
    "normal inbound should keep dedupe, recovery can bypass stale log-only dedupe",
  );

  const recoveryRegistrations = whatsappSource.match(/bypassIncomingDedupe: true/g) || [];
  assert.ok(
    recoveryRegistrations.length >= 1,
    "registered pending-message recovery processor must bypass stale incoming dedupe",
  );
});
