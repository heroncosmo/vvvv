import assert from "node:assert/strict";
import { messageQueueService } from "../messageQueueService";
import { antiBanProtectionService } from "../antiBanProtectionService";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await sleep(25);
  }

  throw new Error("Timed out waiting for test condition");
}

async function main() {
  messageQueueService.clearAllQueues();
  (messageQueueService as any).directExecutionChains.clear();

  const antiBan = antiBanProtectionService as any;
  const originals = {
    canSendMessage: antiBan.canSendMessage,
    calculateDelay: antiBan.calculateDelay,
    prepareAdaptiveDelayPolicy: antiBan.prepareAdaptiveDelayPolicy,
    registerMessageSent: antiBan.registerMessageSent,
    resetBatchCounter: antiBan.resetBatchCounter,
  };

  const order: string[] = [];
  let releaseFirstQueuedSend!: () => void;

  antiBan.canSendMessage = () => ({ canSend: true, waitMs: 0, reason: "OK" });
  antiBan.calculateDelay = () => 0;
  antiBan.prepareAdaptiveDelayPolicy = async () => undefined;
  antiBan.registerMessageSent = () => ({ shouldPause: false, pauseDuration: 0 });
  antiBan.resetBatchCounter = () => undefined;

  try {
    messageQueueService.registerSendCallback(async (_userId, _jid, text) => {
      if (text === "queued-1") {
        order.push("queued-1:start");
        await new Promise<void>((resolve) => {
          releaseFirstQueuedSend = resolve;
        });
        order.push("queued-1:end");
        return "queued-1-id";
      }

      order.push(text);
      return `${text}-id`;
    });

    const firstQueued = messageQueueService.enqueue("user-1", "5511999999999@s.whatsapp.net", "queued-1");
    const secondQueued = messageQueueService.enqueue("user-1", "5511888888888@s.whatsapp.net", "queued-2");

    await waitFor(() => typeof releaseFirstQueuedSend === "function" && order.includes("queued-1:start"));

    const directSend = messageQueueService.executeWithDelay(
      "user-1",
      "status post",
      async () => {
        order.push("direct-status");
        return "direct-status-id";
      },
      { yieldQueue: true },
    );

    await sleep(25);
    releaseFirstQueuedSend();

    await firstQueued;
    await directSend;
    await secondQueued;

    assert.deepEqual(order, [
      "queued-1:start",
      "queued-1:end",
      "direct-status",
      "queued-2",
    ]);

    console.log("messageQueueService priority test passed");
  } finally {
    antiBan.canSendMessage = originals.canSendMessage;
    antiBan.calculateDelay = originals.calculateDelay;
    antiBan.prepareAdaptiveDelayPolicy = originals.prepareAdaptiveDelayPolicy;
    antiBan.registerMessageSent = originals.registerMessageSent;
    antiBan.resetBatchCounter = originals.resetBatchCounter;
    messageQueueService.clearAllQueues();
    (messageQueueService as any).directExecutionChains.clear();
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
