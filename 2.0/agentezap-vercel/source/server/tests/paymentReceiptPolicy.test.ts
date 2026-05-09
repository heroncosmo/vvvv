import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateManualReceiptActivationWindow,
  canReverseManualReceipt,
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
