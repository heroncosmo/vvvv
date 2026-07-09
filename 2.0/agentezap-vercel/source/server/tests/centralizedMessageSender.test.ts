import assert from "node:assert/strict";

import { centralizedMessageSender } from "../centralizedMessageSender";
import { antiBanProtectionService, ANTI_BAN_CONFIG } from "../antiBanProtectionService";
import { channelDispatchLock } from "../channelDispatchLock";

const antiBan = antiBanProtectionService as any;
const sender = centralizedMessageSender as any;
const dispatchLock = channelDispatchLock as any;

async function main() {
  const originals = {
    canSendMessage: antiBan.canSendMessage,
    calculateDelay: antiBan.calculateDelay,
    prepareAdaptiveDelayPolicy: antiBan.prepareAdaptiveDelayPolicy,
    registerMessageSent: antiBan.registerMessageSent,
    ownerDelay: ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS,
  };

  sender.stats.clear();
  sender.processing.clear();
  sender.queues.clear();
  dispatchLock.states.clear();

  const registered: Array<{ userId: string; contactNumber: string }> = [];

  antiBan.canSendMessage = () => ({ canSend: true, waitMs: 0, reason: "OK" });
  antiBan.calculateDelay = () => 0;
  antiBan.prepareAdaptiveDelayPolicy = async () => undefined;
  antiBan.registerMessageSent = (userId: string, contactNumber: string) => {
    registered.push({ userId, contactNumber });
    return { shouldPause: false, pauseDuration: 0 };
  };
  ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS = 0;

  try {
    const socket = {
      sendMessage: async () => ({ key: { id: "msg-priority-1" } }),
      sendPresenceUpdate: async () => undefined,
    };

    const result = await centralizedMessageSender.sendText(
      "user-priority",
      "5511999999999@s.whatsapp.net",
      "Mensagem manual urgente",
      socket as any,
      "manual_admin",
      {
        priority: "urgent",
        isOwnerInitiated: true,
        skipTyping: true,
      },
    );

    assert.equal(result.success, true);
    assert.deepEqual(registered, [
      {
        userId: "user-priority",
        contactNumber: "5511999999999",
      },
    ]);

    registered.length = 0;

    let activeSends = 0;
    let maxActiveSends = 0;
    let sequence = 0;
    const concurrentSocket = {
      sendMessage: async () => {
        sequence += 1;
        activeSends += 1;
        maxActiveSends = Math.max(maxActiveSends, activeSends);
        await new Promise((resolve) => setTimeout(resolve, 25));
        activeSends -= 1;
        return { key: { id: `msg-priority-${sequence}` } };
      },
      sendPresenceUpdate: async () => undefined,
    };

    const [firstConcurrent, secondConcurrent] = await Promise.all([
      centralizedMessageSender.sendText(
        "user-priority",
        "5511999999998@s.whatsapp.net",
        "Primeira mensagem urgente",
        concurrentSocket as any,
        "manual_admin",
        {
          priority: "urgent",
          isOwnerInitiated: true,
          skipTyping: true,
        },
      ),
      centralizedMessageSender.sendText(
        "user-priority",
        "5511999999997@s.whatsapp.net",
        "Segunda mensagem urgente",
        concurrentSocket as any,
        "manual_admin",
        {
          priority: "urgent",
          isOwnerInitiated: true,
          skipTyping: true,
        },
      ),
    ]);

    assert.equal(firstConcurrent.success, true);
    assert.equal(secondConcurrent.success, true);
    assert.equal(maxActiveSends, 1);
    assert.deepEqual(
      registered.map((entry) => entry.contactNumber),
      ["5511999999998", "5511999999997"],
    );

    console.log("centralizedMessageSender.test.ts ok");
  } finally {
    antiBan.canSendMessage = originals.canSendMessage;
    antiBan.calculateDelay = originals.calculateDelay;
    antiBan.prepareAdaptiveDelayPolicy = originals.prepareAdaptiveDelayPolicy;
    antiBan.registerMessageSent = originals.registerMessageSent;
    ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS = originals.ownerDelay;
    sender.stats.clear();
    sender.processing.clear();
    sender.queues.clear();
    dispatchLock.states.clear();
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
