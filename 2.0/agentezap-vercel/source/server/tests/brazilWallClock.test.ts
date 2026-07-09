import assert from "node:assert/strict";
import {
  getBrazilWallClockNow,
  parseBrazilWallClockDateTime,
  serializeBrazilWallClockDateTime,
} from "../brazilWallClock";

const convertedFromIso = parseBrazilWallClockDateTime("2026-04-02T12:00:00.000Z");
assert.ok(convertedFromIso);
assert.equal(convertedFromIso?.getFullYear(), 2026);
assert.equal(convertedFromIso?.getMonth(), 3);
assert.equal(convertedFromIso?.getDate(), 2);
assert.equal(convertedFromIso?.getHours(), 9);
assert.equal(convertedFromIso?.getMinutes(), 0);

const plainWallClock = parseBrazilWallClockDateTime("2026-04-02T09:15");
assert.ok(plainWallClock);
assert.equal(plainWallClock?.getHours(), 9);
assert.equal(plainWallClock?.getMinutes(), 15);

assert.equal(
  serializeBrazilWallClockDateTime(plainWallClock),
  "2026-04-02T09:15:00-03:00",
);

const originalDate = Date;
const fakeNow = new Date("2026-04-02T03:28:00.000Z");

class FakeDate extends Date {
  constructor(...args: ConstructorParameters<typeof Date>) {
    if (args.length === 0) {
      super(fakeNow.toISOString());
      return;
    }

    super(...args);
  }

  static now(): number {
    return fakeNow.getTime();
  }
}

(globalThis as { Date: typeof Date }).Date = FakeDate as unknown as typeof Date;

try {
  const now = getBrazilWallClockNow();
  assert.equal(now.getFullYear(), 2026);
  assert.equal(now.getMonth(), 3);
  assert.equal(now.getDate(), 2);
  assert.equal(now.getHours(), 0);
  assert.equal(now.getMinutes(), 28);
} finally {
  (globalThis as { Date: typeof Date }).Date = originalDate;
}

console.log("brazilWallClock.test.ts ok");
