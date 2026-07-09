import assert from "node:assert/strict";

import { antiBanProtectionService, ANTI_BAN_CONFIG } from "../antiBanProtectionService";

const antiBan = antiBanProtectionService as any;

function resetAntiBanState() {
  antiBan.channelStats.clear();
  antiBan.adaptiveDelayPolicies.clear();
  antiBan.adaptiveDelayInflight.clear();
}

async function main() {
  const originalDateNow = Date.now;
  const originalRandomBetween = antiBan.randomBetween;

  let now = Date.parse("2026-03-21T22:00:00.000Z");
  Date.now = () => now;
  antiBan.randomBetween = (min: number) => min;

  try {
    resetAntiBanState();

    for (let index = 0; index < ANTI_BAN_CONFIG.MAX_MESSAGES_PER_MINUTE; index += 1) {
      antiBanProtectionService.registerMessageSent("user-minute", "5511999999999");
    }

    const canSend = antiBanProtectionService.canSendMessage("user-minute");
    assert.equal(canSend.canSend, false);
    assert.match(canSend.reason, /Janela por minuto/);
    assert.ok(canSend.waitMs > 0);

    const delay = antiBanProtectionService.calculateDelay("user-minute", "5511999999999");
    assert.ok(delay >= canSend.waitMs);

    antiBan.adaptiveDelayPolicies.set("user-high-volume", {
      fetchedAt: now,
      appliesHighVolumeDelay: true,
      isDedicatedAiPlan: false,
      uniqueInboundContactsToday: 100,
    });

    const delayedForHighVolume = antiBanProtectionService.calculateDelay("user-high-volume", "5511666666666");
    assert.ok(delayedForHighVolume >= 60_000);
    assert.ok(delayedForHighVolume <= 240_000);

    antiBan.adaptiveDelayPolicies.set("user-high-volume-owner", {
      fetchedAt: now,
      appliesHighVolumeDelay: true,
      isDedicatedAiPlan: false,
      uniqueInboundContactsToday: 125,
    });

    const manualOwnerDelay = antiBanProtectionService.calculateDelay("user-high-volume-owner", "5511666666666", {
      applyHighVolumeDelay: false,
    });
    assert.equal(manualOwnerDelay, ANTI_BAN_CONFIG.MIN_DELAY_MS);

    now += canSend.waitMs + 1;

    const recovered = antiBanProtectionService.canSendMessage("user-minute");
    assert.equal(recovered.canSend, true);

    resetAntiBanState();
    now = Date.parse("2026-03-21T22:10:00.000Z");

    antiBanProtectionService.registerMessageSent("user-stats", "5511888888888");
    now += 10_000;
    antiBanProtectionService.registerMessageSent("user-stats", "5511888888888");

    const stats = antiBanProtectionService.getStats("user-stats");
    assert.equal(stats.minuteCount, 2);
    assert.equal(stats.hourCount, 2);
    assert.equal(stats.isPaused, false);

    resetAntiBanState();
    now = Date.parse("2026-03-21T23:00:00.000Z");

    for (let index = 0; index < ANTI_BAN_CONFIG.BATCH_SIZE; index += 1) {
      antiBanProtectionService.registerMessageSent("user-batch", "5511777777777");
    }

    let batchStats = antiBanProtectionService.getStats("user-batch");
    assert.equal(batchStats.isPaused, true);
    assert.equal(batchStats.batchPauseLevel, 0);
    assert.equal(batchStats.currentPauseDurationMs, ANTI_BAN_CONFIG.BATCH_PAUSE_SEQUENCE_MS[0]);

    now += ANTI_BAN_CONFIG.BATCH_PAUSE_SEQUENCE_MS[0] + 1;
    antiBanProtectionService.canSendMessage("user-batch");

    for (let index = 0; index < ANTI_BAN_CONFIG.BATCH_SIZE; index += 1) {
      antiBanProtectionService.registerMessageSent("user-batch", "5511777777777");
    }

    batchStats = antiBanProtectionService.getStats("user-batch");
    assert.equal(batchStats.isPaused, true);
    assert.equal(batchStats.batchPauseLevel, 1);
    assert.equal(batchStats.currentPauseDurationMs, ANTI_BAN_CONFIG.BATCH_PAUSE_SEQUENCE_MS[1]);

    console.log("antiBanProtectionService.test.ts ok");
  } finally {
    Date.now = originalDateNow;
    antiBan.randomBetween = originalRandomBetween;
    resetAntiBanState();
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
