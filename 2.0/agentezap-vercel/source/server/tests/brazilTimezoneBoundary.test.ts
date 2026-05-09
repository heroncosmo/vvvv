import assert from "node:assert/strict";
import { getBrazilTimeDate, getBrazilTimeParts } from "../greetingTime";
import { getBrazilNow, getBrazilToday } from "../providerFormatting";

const nearMidnightBrazil = new Date("2026-04-02T03:28:00.000Z");
const morningBrazil = new Date("2026-04-02T11:30:00.000Z");

const nearMidnightParts = getBrazilTimeParts(nearMidnightBrazil);
assert.deepEqual(nearMidnightParts, {
  year: 2026,
  month: 4,
  day: 2,
  hour: 0,
  minute: 28,
  second: 0,
});

const nearMidnightDate = getBrazilTimeDate(nearMidnightBrazil);
assert.equal(nearMidnightDate.getFullYear(), 2026);
assert.equal(nearMidnightDate.getMonth(), 3);
assert.equal(nearMidnightDate.getDate(), 2);
assert.equal(nearMidnightDate.getHours(), 0);
assert.equal(nearMidnightDate.getMinutes(), 28);

const morningDate = getBrazilTimeDate(morningBrazil);
assert.equal(morningDate.getDate(), 2);
assert.equal(morningDate.getHours(), 8);
assert.equal(morningDate.getMinutes(), 30);

const originalDateNow = Date;

class FakeDate extends Date {
  constructor(...args: ConstructorParameters<typeof Date>) {
    if (args.length === 0) {
      super(nearMidnightBrazil.toISOString());
      return;
    }

    super(...args);
  }

  static now(): number {
    return nearMidnightBrazil.getTime();
  }
}

(globalThis as { Date: typeof Date }).Date = FakeDate as unknown as typeof Date;

try {
  const providerNow = getBrazilNow();
  assert.equal(providerNow.getDate(), 2);
  assert.equal(providerNow.getHours(), 0);
  assert.equal(providerNow.getMinutes(), 28);
  assert.equal(getBrazilToday(), "2026-04-02");
} finally {
  (globalThis as { Date: typeof Date }).Date = originalDateNow;
}

console.log("brazilTimezoneBoundary.test.ts ok");
