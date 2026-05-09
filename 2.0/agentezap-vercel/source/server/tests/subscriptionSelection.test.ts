import test from "node:test";
import assert from "node:assert/strict";

import {
  pickPreferredSubscriptionCandidate,
  resolveApprovedReceiptActivationWindow,
  shouldAutoActivateSubscriptionFromApprovedReceipt,
} from "../subscriptionSelection";

test("prefere assinatura ativa mesmo se existir pendencia mais nova", () => {
  const preferred = pickPreferredSubscriptionCandidate([
    {
      id: "sub-pending",
      status: "pending_pix",
      createdAt: "2026-03-22T03:23:00.000Z",
      approvedReceiptAt: null,
    },
    {
      id: "sub-active",
      status: "active",
      createdAt: "2026-02-25T16:54:08.000Z",
      dataFim: "2026-03-27T19:12:26.722Z",
      nextPaymentDate: "2026-03-27T19:12:26.722Z",
    },
  ], new Date("2026-03-22T12:00:00.000Z"));

  assert.equal(preferred?.id, "sub-active");
});

test("prefere assinatura com comprovante aprovado e cobertura futura sobre pending_pix vazia mais nova", () => {
  const preferred = pickPreferredSubscriptionCandidate([
    {
      id: "sub-new-empty",
      status: "pending_pix",
      createdAt: "2026-03-22T03:23:00.000Z",
    },
    {
      id: "sub-approved",
      status: "pending_pix",
      createdAt: "2026-02-25T16:54:08.000Z",
      dataInicio: "2026-02-25T19:12:26.722Z",
      dataFim: "2026-03-27T19:12:26.722Z",
      nextPaymentDate: "2026-03-27T19:12:26.722Z",
      approvedReceiptAt: "2026-02-25T19:12:26.058Z",
      planPeriodicity: "mensal",
      planFrequencyDays: 30,
    },
  ], new Date("2026-03-22T12:00:00.000Z"));

  assert.equal(preferred?.id, "sub-approved");
});

test("reativa automaticamente comprovante aprovado quando a janela ainda esta valida", () => {
  const shouldActivate = shouldAutoActivateSubscriptionFromApprovedReceipt(
    {
      id: "sub-approved",
      status: "pending_pix",
      approvedReceiptAt: "2026-02-25T19:12:26.058Z",
      dataFim: "2026-03-27T19:12:26.722Z",
      nextPaymentDate: "2026-03-27T19:12:26.722Z",
      planPeriodicity: "mensal",
    },
    new Date("2026-03-22T12:00:00.000Z"),
  );

  assert.equal(shouldActivate, true);
});

test("nao reativa comprovante aprovado cuja janela ja venceu", () => {
  const shouldActivate = shouldAutoActivateSubscriptionFromApprovedReceipt(
    {
      id: "sub-old-approved",
      status: "pending_pix",
      approvedReceiptAt: "2026-01-01T10:00:00.000Z",
      planPeriodicity: "mensal",
    },
    new Date("2026-03-22T12:00:00.000Z"),
  );

  assert.equal(shouldActivate, false);
});

test("preserva datas existentes ao montar janela de reativacao", () => {
  const window = resolveApprovedReceiptActivationWindow(
    {
      id: "sub-approved",
      status: "pending_pix",
      approvedReceiptAt: "2026-02-25T19:12:26.058Z",
      dataInicio: "2026-02-25T19:12:26.722Z",
      dataFim: "2026-03-27T19:12:26.722Z",
      nextPaymentDate: "2026-03-27T19:12:26.722Z",
      planPeriodicity: "mensal",
    },
    new Date("2026-03-22T12:00:00.000Z"),
  );

  assert.equal(window.dataInicio.toISOString(), "2026-02-25T19:12:26.722Z");
  assert.equal(window.dataFim.toISOString(), "2026-03-27T19:12:26.722Z");
  assert.equal(window.nextPaymentDate.toISOString(), "2026-03-27T19:12:26.722Z");
});

console.log("subscriptionSelection.test.ts ok");
