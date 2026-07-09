import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateManualReceiptActivationWindow,
  canReverseManualReceipt,
  resolveManualReceiptCoverageDate,
  resolveManualReceiptCycleAnchor,
  resolveManualReceiptReversal,
} from "../paymentReceiptPolicy";

test("calcula janela mensal padrao para comprovante manual", () => {
  const result = calculateManualReceiptActivationWindow(
    { periodicidade: "mensal" },
    new Date("2026-03-14T12:00:00.000Z"),
  );

  assert.equal(result.dataInicio.toISOString(), "2026-03-14T12:00:00.000Z");
  assert.equal(result.dataFim.toISOString(), "2026-04-13T12:00:00.000Z");
  assert.equal(result.nextPaymentDate.toISOString(), "2026-04-13T12:00:00.000Z");
});

test("calcula janela anual preservando ano civil", () => {
  const result = calculateManualReceiptActivationWindow(
    { periodicidade: "anual" },
    new Date("2028-02-29T08:30:00.000Z"),
  );

  assert.equal(result.dataFim.toISOString(), "2029-03-01T08:30:00.000Z");
});

test("usa frequencia_dias quando nao ha periodicidade conhecida", () => {
  const result = calculateManualReceiptActivationWindow(
    { frequencia_dias: "15" },
    new Date("2026-03-14T12:00:00.000Z"),
  );

  assert.equal(result.dataFim.toISOString(), "2026-03-29T12:00:00.000Z");
});

test("usa vencimento anterior como base quando comprovante foi aprovado depois", () => {
  const anchor = resolveManualReceiptCycleAnchor({
    previousDataFim: "2026-05-10T21:44:59.704Z",
    receiptCreatedAt: "2026-05-11T17:20:11.976Z",
    reviewedAt: "2026-06-03T14:26:31.035Z",
  });
  const result = calculateManualReceiptActivationWindow({ periodicidade: "mensal" }, anchor);

  assert.equal(anchor.toISOString(), "2026-05-10T21:44:59.704Z");
  assert.equal(result.dataInicio.toISOString(), "2026-05-10T21:44:59.704Z");
  assert.equal(result.dataFim.toISOString(), "2026-06-09T21:44:59.704Z");
});

test("preserva maior cobertura para pagamento antecipado", () => {
  const coverage = resolveManualReceiptCoverageDate(
    "2026-06-01T10:00:00.000Z",
    "2026-06-20T10:00:00.000Z",
  );
  const anchor = resolveManualReceiptCycleAnchor({
    currentDataFim: "2026-06-01T10:00:00.000Z",
    currentNextPaymentDate: "2026-06-20T10:00:00.000Z",
    receiptCreatedAt: "2026-06-10T10:00:00.000Z",
  });

  assert.equal(coverage?.toISOString(), "2026-06-20T10:00:00.000Z");
  assert.equal(anchor.toISOString(), "2026-06-20T10:00:00.000Z");
});

test("usa data do comprovante como fallback no primeiro ciclo sem vencimento anterior", () => {
  const anchor = resolveManualReceiptCycleAnchor({
    receiptCreatedAt: "2026-05-11T17:20:11.976Z",
    reviewedAt: "2026-06-03T14:26:31.035Z",
  });

  assert.equal(anchor.toISOString(), "2026-05-11T17:20:11.976Z");
});

test("permite cancelar comprovante pendente ou aprovado", () => {
  assert.equal(canReverseManualReceipt("pending"), true);
  assert.equal(canReverseManualReceipt("approved"), true);
  assert.equal(canReverseManualReceipt("rejected"), false);
});

test("rejeita pendente e cancela aprovado", () => {
  assert.deepEqual(resolveManualReceiptReversal("pending"), {
    receiptStatus: "rejected",
    message: "Comprovante recusado e plano cancelado",
  });

  assert.deepEqual(resolveManualReceiptReversal("approved"), {
    receiptStatus: "cancelled",
    message: "Ativação cancelada e plano cancelado",
  });
});
