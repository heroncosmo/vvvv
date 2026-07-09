import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const serverRoot = process.cwd();
const adminOrdersRecoverySource = readFileSync(join(serverRoot, "server", "adminOrdersRecoveryService.ts"), "utf8");
const httpSource = readFileSync(join(serverRoot, "api", "http.ts"), "utf8");
const routesSource = readFileSync(join(serverRoot, "server", "routes.ts"), "utf8");
const paymentReceiptServiceSource = readFileSync(join(serverRoot, "server", "paymentReceiptService.ts"), "utf8");
const actionExecutorSource = readFileSync(join(serverRoot, "server", "actionExecutorV2.ts"), "utf8");

assert.match(
  adminOrdersRecoverySource,
  /AND COALESCE\(s\.pending_receipt, false\) = false[\s\S]*FROM payment_receipts pr[\s\S]*pr\.status IN \('pending', 'approved'\)[\s\S]*FROM payment_history ph[\s\S]*ph\.status IN \('approved', 'paid'\)/,
  "automatic Pix recovery candidate selection must exclude subscriptions with pending receipts, approved receipts or payment history",
);

assert.match(
  adminOrdersRecoverySource,
  /async function getPixRecoveryBlockReason[\s\S]*subscription_pending_receipt[\s\S]*payment_receipt_recorded[\s\S]*payment_recorded[\s\S]*payment_history_recorded/,
  "Pix recovery must keep a late pre-send blocker for recorded payment activity",
);

assert.match(
  adminOrdersRecoverySource,
  /FROM payments pay[\s\S]*pay\.subscription_id = s\.id[\s\S]*pay\.status IN \('paid', 'approved'\)/,
  "Pix recovery must also block when the legacy payments table already records a paid or approved payment",
);

assert.match(
  adminOrdersRecoverySource,
  /const reserved = await reserveMessage[\s\S]*const preSendBlockReason = await getPixRecoveryBlockReason\(candidate\)[\s\S]*await finishMessage\(candidate, step, "skipped", \{ error: preSendBlockReason \}\)[\s\S]*sendOwnerWhatsAppNotification/,
  "Pix recovery must re-check receipt/payment state after reserving and before sending WhatsApp",
);

assert.match(
  adminOrdersRecoverySource,
  /export async function skipOpenAdminPixRecoveryMessagesForSubscription[\s\S]*status IN \('processing', 'failed', 'skipped'\)/,
  "payment activation must have a reusable cleanup path for open Pix recovery messages",
);

for (const [label, source] of [
  ["api/http.ts", httpSource],
  ["server/routes.ts", routesSource],
] as const) {
  assert.match(
    source,
    /UPDATE payments pay[\s\S]*SET status = 'paid'[\s\S]*data_pagamento = COALESCE\(pay\.data_pagamento, pr\.created_at, NOW\(\)\)/,
    `${label} must synchronize the legacy payments row when a receipt activates a subscription`,
  );
  assert.match(
    source,
    /UPDATE admin_pix_recovery_messages[\s\S]*skipped_payment_already_recorded[\s\S]*status IN \('processing', 'failed', 'skipped'\)/,
    `${label} must close open Pix recovery messages when a receipt activates a subscription`,
  );
}

const resolverStart = paymentReceiptServiceSource.indexOf("async function resolveUserIdForReceipt");
const resolverEnd = paymentReceiptServiceSource.indexOf("async function ensurePaymentReceiptBucket");
assert.ok(resolverStart >= 0 && resolverEnd > resolverStart, "payment receipt resolver must exist");
const resolverBlock = paymentReceiptServiceSource.slice(resolverStart, resolverEnd);
assert.ok(
  resolverBlock.indexOf("const normalizedPhone") < resolverBlock.indexOf("if (params.userId)"),
  "WhatsApp receipt registration must resolve the customer's phone before falling back to the owner/admin user id",
);

assert.match(
  resolverBlock,
  /if \(normalizedPhone\) \{[\s\S]*findUserByStrongPhoneEvidence\(normalizedPhone\)[\s\S]*return null;[\s\S]*\}\s*if \(params\.userId\)/,
  "WhatsApp receipt registration must fail closed when a provided phone number has no strong user match",
);

assert.doesNotMatch(
  actionExecutorSource,
  /seu acesso ficou liberado/,
  "legacy payment receipt executor must not promise account activation before verified approval",
);

assert.doesNotMatch(
  actionExecutorSource,
  /Para registrar o pagamento oficialmente|Registrei seu comprovante oficialmente|Ocorreu um erro ao registrar o pagamento/,
  "legacy payment receipt executor must not author customer-facing payment receipt text; Codex must write public replies from tenant context",
);

console.log("adminPixRecoveryReceiptGuard.source.test.ts ok");
