import test from "node:test";
import assert from "node:assert/strict";

import { evaluateSaaSSubscriptionAccess } from "../subscriptionAccessPolicy";

test("mantem assinatura ativa quando dataFim ainda cobre o periodo", () => {
  const result = evaluateSaaSSubscriptionAccess({
    status: "active",
    dataFim: "2026-03-20T05:27:15.240Z",
    nextPaymentDate: "2026-02-14T21:54:42.202Z",
    now: new Date("2026-03-09T19:03:56.000Z"),
  });

  assert.equal(result.hasActiveSubscription, true);
  assert.equal(result.isExpired, false);
  assert.equal(result.reason, "active");
});

test("usa nextPaymentDate como fallback quando nao ha dataFim", () => {
  const result = evaluateSaaSSubscriptionAccess({
    status: "active",
    nextPaymentDate: "2026-02-14T21:54:42.202Z",
    now: new Date("2026-03-09T19:03:56.000Z"),
  });

  assert.equal(result.hasActiveSubscription, false);
  assert.equal(result.isExpired, true);
  assert.equal(result.reason, "expired_by_next_payment");
  assert.equal(result.daysOverdue, 22);
});

test("status pending_payment nao libera acesso enquanto aguarda aprovacao", () => {
  const result = evaluateSaaSSubscriptionAccess({
    status: "pending_payment",
    dataFim: "2026-03-20T05:27:15.240Z",
    nextPaymentDate: "2026-03-20T05:27:15.240Z",
    now: new Date("2026-03-09T19:03:56.000Z"),
  });

  assert.equal(result.hasActiveSubscription, false);
  assert.equal(result.isExpired, false);
  assert.equal(result.reason, "inactive_status");
});

test("status expired explicito bloqueia como vencido", () => {
  const result = evaluateSaaSSubscriptionAccess({
    status: "expired",
    dataFim: "2026-03-01T00:00:00.000Z",
    now: new Date("2026-03-09T19:03:56.000Z"),
  });

  assert.equal(result.hasActiveSubscription, false);
  assert.equal(result.isExpired, true);
  assert.equal(result.reason, "expired_status");
  assert.equal(result.daysOverdue, 8);
});

test("assinatura active sem data de cobertura nao libera acesso sem prazo", () => {
  const result = evaluateSaaSSubscriptionAccess({
    status: "active",
    dataFim: null,
    nextPaymentDate: null,
    now: new Date("2026-06-11T19:30:00.000Z"),
  });

  assert.equal(result.hasActiveSubscription, false);
  assert.equal(result.isExpired, true);
  assert.equal(result.reason, "missing_coverage_dates");
  assert.equal(result.daysOverdue, 0);
});
