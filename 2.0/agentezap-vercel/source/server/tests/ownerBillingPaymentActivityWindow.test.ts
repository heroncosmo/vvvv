import test from "node:test";
import assert from "node:assert/strict";

import { getBillingPaymentActivityWindowStart } from "../ownerBillingPaymentActivityPolicy";

test("janela de pagamento do ciclo ignora comprovante antigo do mes anterior", () => {
  const dueDate = new Date("2026-06-04T17:37:16.214Z");
  const start = getBillingPaymentActivityWindowStart({ daysBefore: 1 }, dueDate);

  assert.equal(start.toISOString(), "2026-05-14T17:37:16.214Z");
  assert.equal(new Date("2026-05-05T17:37:16.214Z") < start, true);
  assert.equal(new Date("2026-06-01T21:24:00.000Z") >= start, true);
});

test("janela considera offsets maiores sem ficar menor que 21 dias", () => {
  const dueDate = new Date("2026-06-30T12:00:00.000Z");
  const start = getBillingPaymentActivityWindowStart({ daysAfter: 30 }, dueDate);

  assert.equal(start.toISOString(), "2026-05-28T12:00:00.000Z");
});

console.log("ownerBillingPaymentActivityWindow.test.ts ok");
