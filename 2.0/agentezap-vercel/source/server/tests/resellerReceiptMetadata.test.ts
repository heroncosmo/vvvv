import test from "node:test";
import assert from "node:assert/strict";

import {
  appendAdminReviewNote,
  buildResellerReceiptAdminNotes,
  mergeResellerPaymentStatusDetail,
  parseResellerPaymentStatusDetail,
  parseResellerReceiptContext,
} from "../resellerReceiptMetadata";

test("preserva clientData ao anexar receipt em reseller payment", () => {
  const existing = JSON.stringify({
    clientData: {
      name: "Cliente Teste",
      email: "cliente@example.com",
    },
    externalReference: "ref_123",
  });

  const merged = mergeResellerPaymentStatusDetail(existing, {
    receiptId: "receipt_1",
  });

  const parsed = parseResellerPaymentStatusDetail(merged);
  assert.equal((parsed?.clientData as { email?: string } | undefined)?.email, "cliente@example.com");
  assert.equal(parsed?.receiptId, "receipt_1");
});

test("parseia contexto estruturado de comprovante da revenda", () => {
  const notes = buildResellerReceiptAdminNotes({
    kind: "client_renewal",
    resellerId: "res_1",
    clientId: "client_1",
    paymentId: "pay_1",
    invoiceId: 42,
  });

  const parsed = parseResellerReceiptContext(notes);
  assert.deepEqual(parsed, {
    kind: "client_renewal",
    resellerId: "res_1",
    clientId: "client_1",
    paymentId: "pay_1",
    invoiceId: 42,
  });
});

test("mantem nota de contexto e anexa observacao do admin", () => {
  const base = buildResellerReceiptAdminNotes({
    kind: "client_creation",
    resellerId: "res_1",
    paymentId: "pay_1",
  });

  const merged = appendAdminReviewNote(base, "Liberado manualmente no admin");
  assert.ok(merged?.includes("Comprovante de revendedor"));
  assert.ok(merged?.includes("Liberado manualmente no admin"));
});
