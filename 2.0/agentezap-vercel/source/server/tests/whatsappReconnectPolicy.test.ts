import assert from "node:assert/strict";

import {
  computePendingConnectionExpiresAt,
  getPairingRequiredCooldownRemainingMs,
  isPendingConnectionExpired,
} from "../whatsappReconnectPolicy";

const now = new Date("2026-04-10T19:05:00.000Z").getTime();

{
  const connection = {
    isConnected: false,
    qrCode: "data:image/png;base64,abc",
    updatedAt: new Date("2026-04-10T19:00:30.000Z"),
  } as const;

  const remaining = getPairingRequiredCooldownRemainingMs(connection, now, 15 * 60 * 1000);
  assert.equal(remaining, 10 * 60 * 1000 + 30 * 1000);
}

{
  const connection = {
    isConnected: false,
    qrCode: null,
    updatedAt: new Date("2026-04-10T19:00:30.000Z"),
  } as const;

  assert.equal(getPairingRequiredCooldownRemainingMs(connection, now, 15 * 60 * 1000), 0);
}

{
  const startedAt = new Date("2026-04-10T19:00:00.000Z").getTime();
  const expiresAt = computePendingConnectionExpiresAt(startedAt, 120_000, 90_000, 30_000);
  assert.equal(expiresAt, startedAt + 150_000);
  assert.equal(
    isPendingConnectionExpired({ startedAt, expiresAt }, startedAt + 149_000, 90_000),
    false,
  );
  assert.equal(
    isPendingConnectionExpired({ startedAt, expiresAt }, startedAt + 151_000, 90_000),
    true,
  );
}
