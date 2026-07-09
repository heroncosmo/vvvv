import assert from "node:assert/strict";

function prepareIsolatedRuntimeEnv() {
  process.env.NODE_ENV ||= "test";
  process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
  process.env.SUPABASE_SERVICE_KEY ||= process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.DATABASE_URL ||= "postgres://postgres:postgres@127.0.0.1:5432/postgres";
  process.env.ENABLE_RUNTIME_AUTO_MIGRATIONS ||= "false";
  process.env.RUN_RUNTIME_AUTO_MIGRATIONS ||= "false";
  process.env.DB_CONNECTION_TIMEOUT_MS ||= "250";
}

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
  prepareIsolatedRuntimeEnv();

  const [
    { messageQueueService, shouldInterruptPendingReplyYield },
    { antiBanProtectionService },
    { messageDeduplicationService },
  ] = await Promise.all([
    import("../messageQueueService"),
    import("../antiBanProtectionService"),
    import("../messageDeduplicationService"),
  ]);

  const yieldedLow = { priority: "low" as const };
  assert.equal(shouldInterruptPendingReplyYield([yieldedLow], yieldedLow), false);
  assert.equal(
    shouldInterruptPendingReplyYield([{ priority: "high" as const }, yieldedLow], yieldedLow),
    true,
  );
  assert.equal(
    shouldInterruptPendingReplyYield([{ priority: "normal" as const }, yieldedLow], yieldedLow),
    true,
  );

  messageQueueService.clearAllQueues();
  (messageQueueService as any).directExecutionChains.clear();

  const antiBan = antiBanProtectionService as any;
  const originals = {
    canSendMessage: antiBan.canSendMessage,
    calculateDelay: antiBan.calculateDelay,
    prepareAdaptiveDelayPolicy: antiBan.prepareAdaptiveDelayPolicy,
    registerMessageSent: antiBan.registerMessageSent,
    registerOwnerManualMessage: antiBan.registerOwnerManualMessage,
    resetBatchCounter: antiBan.resetBatchCounter,
    dedupCanSendMessage: (messageDeduplicationService as any).canSendMessage,
  };

  const order: string[] = [];
  let releaseFirstQueuedSend!: () => void;

  antiBan.canSendMessage = () => ({ canSend: true, waitMs: 0, reason: "OK" });
  antiBan.calculateDelay = () => 0;
  antiBan.prepareAdaptiveDelayPolicy = async () => undefined;
  antiBan.registerMessageSent = () => ({ shouldPause: false, pauseDuration: 0 });
  antiBan.resetBatchCounter = () => undefined;
  (messageDeduplicationService as any).canSendMessage = async () => true;

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

    order.length = 0;
    messageQueueService.clearAllQueues();
    (messageQueueService as any).directExecutionChains.clear();

    let ownerManualRegistered = false;
    antiBan.calculateDelay = () => 60_000;
    antiBan.registerOwnerManualMessage = () => {
      ownerManualRegistered = true;
    };

    const manualFastLane = messageQueueService.enqueue(
      "user-1",
      "5511999999999@s.whatsapp.net",
      "manual-fast-lane",
      {
        priority: "high",
        messageType: "manual",
        source: "whatsapp.ts" as any,
        skipDelay: true,
        skipTyping: true,
      },
    );

    const manualResult = await Promise.race([
      manualFastLane,
      sleep(250).then(() => "timeout" as const),
    ]);

    assert.notEqual(manualResult, "timeout");
    assert.equal(ownerManualRegistered, true);

    ownerManualRegistered = false;
    const mediaResult = await Promise.race([
      messageQueueService.executeWithDelay(
        "user-1",
        "manual media",
        async () => "manual-media-id",
        {
          yieldQueue: true,
          skipDelay: true,
          ownerManualContactNumber: "5511999999999",
        },
      ),
      sleep(250).then(() => "timeout" as const),
    ]);

    assert.equal(mediaResult, "manual-media-id");
    assert.equal(ownerManualRegistered, true);

    console.log("messageQueueService priority test passed");
  } finally {
    antiBan.canSendMessage = originals.canSendMessage;
    antiBan.calculateDelay = originals.calculateDelay;
    antiBan.prepareAdaptiveDelayPolicy = originals.prepareAdaptiveDelayPolicy;
    antiBan.registerMessageSent = originals.registerMessageSent;
    antiBan.registerOwnerManualMessage = originals.registerOwnerManualMessage;
    antiBan.resetBatchCounter = originals.resetBatchCounter;
    (messageDeduplicationService as any).canSendMessage = originals.dedupCanSendMessage;
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
