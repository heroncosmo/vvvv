import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const httpSource = readFileSync(new URL("../../api/http.ts", import.meta.url), "utf8");
const routesSource = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
const adminOrdersRecoverySource = readFileSync(new URL("../adminOrdersRecoveryService.ts", import.meta.url), "utf8");

assert.match(
  httpSource,
  /async function persistManualPixPaymentRecord\(/,
  "api/http.ts must persist manual Pix records when checkout generates Pix",
);

assert.match(
  httpSource,
  /INSERT INTO payments \(subscription_id, valor, status, pix_code, pix_qr_code, created_at, updated_at\)/,
  "manual Pix persistence must create a structured payments row when none exists",
);

assert.match(
  httpSource,
  /await persistManualPixPaymentRecord\(client,\s*\{\s*subscriptionId,\s*amount: pixAmount,\s*pixCode,\s*pixQrCode,\s*\}\);/s,
  "manual checkout path must save the same Pix code returned to the customer",
);

assert.match(
  httpSource,
  /WHERE subscription_id = \$1\s+AND status = 'pending'/s,
  "manual Pix regeneration must only update the current pending payment record",
);

const legacyManualPixStart = routesSource.indexOf('if (pixManualEnabled) {');
assert.notEqual(legacyManualPixStart, -1, "server/routes.ts must keep a manual Pix branch");
const legacyManualPixBlock = routesSource.slice(legacyManualPixStart, legacyManualPixStart + 2500);

assert.match(
  legacyManualPixBlock,
  /await storage\.getPaymentBySubscriptionId\(subscriptionId\)/,
  "legacy manual Pix route must look up an existing payment before returning Pix",
);

assert.match(
  legacyManualPixBlock,
  /existingPayment && existingPayment\.status !== "paid"/,
  "legacy manual Pix route must avoid overwriting paid payment records",
);

assert.match(
  legacyManualPixBlock,
  /await storage\.createPayment\(\{/,
  "legacy manual Pix route must create a payments row when none exists",
);

assert.ok(
  routesSource.includes("readEnabledConfig(pixManualConfig?.valor, true)"),
  "checkout/manual Pix config must default to manual Pix when the config is absent",
);

const mySubscriptionPixStart = routesSource.indexOf('app.post("/api/my-subscription/generate-pix"');
const mySubscriptionAnnualPixStart = routesSource.indexOf('app.post("/api/my-subscription/generate-annual-pix"');
const mySubscriptionAnnualCardStart = routesSource.indexOf('app.post("/api/my-subscription/charge-annual-card"');

assert.notEqual(mySubscriptionPixStart, -1, "renewal Pix route must exist");
assert.notEqual(mySubscriptionAnnualPixStart, -1, "annual Pix route must exist");
assert.notEqual(mySubscriptionAnnualCardStart, -1, "annual card route must exist");

const renewalPixBlock = routesSource.slice(mySubscriptionPixStart, mySubscriptionAnnualPixStart);
const annualPixBlock = routesSource.slice(mySubscriptionAnnualPixStart, mySubscriptionAnnualCardStart);

for (const [label, block] of [
  ["renewal", renewalPixBlock],
  ["annual", annualPixBlock],
] as const) {
  assert.ok(
    block.includes('storage.getSystemConfigs(["pix_manual_enabled", "mercadopago_access_token"])'),
    `${label} Pix route must load manual Pix config before Mercado Pago fallback`,
  );
  assert.ok(
    block.includes('readEnabledConfig(configMap.get("pix_manual_enabled"), true)'),
    `${label} Pix route must default to manual Pix when config is absent`,
  );
  assert.ok(
    block.includes("await generatePixQRCode({"),
    `${label} Pix route must generate the QR Code through the internal Pix service`,
  );
  assert.ok(
    block.includes("await upsertPendingManualPixPayment({"),
    `${label} Pix route must persist the returned manual Pix payload`,
  );
  assert.ok(
    block.includes("await recordManualPixPaymentHistory({"),
    `${label} Pix route must record a pending manual Pix history entry`,
  );
  assert.ok(
    block.includes('paymentMethod: "pix_manual"'),
    `${label} Pix route must mark the subscription as manual Pix`,
  );
  assert.ok(
    block.includes("isManualPix: true"),
    `${label} Pix response must identify the internal Pix provider`,
  );

  const manualBranchIndex = block.indexOf("if (pixManualEnabled) {");
  const mercadoPagoFetchIndex = block.indexOf('fetch("https://api.mercadopago.com/v1/payments"');
  assert.ok(manualBranchIndex !== -1, `${label} Pix route must keep a manual Pix branch`);
  assert.ok(mercadoPagoFetchIndex !== -1, `${label} Pix route must keep Mercado Pago fallback`);
  assert.ok(
    manualBranchIndex < mercadoPagoFetchIndex,
    `${label} Pix route must try manual Pix before calling Mercado Pago`,
  );
}

assert.ok(
  renewalPixBlock.includes("parseBillingMoneyAmount(plan.valor)"),
  "renewal Pix must calculate amount from the customer's current plan value",
);
assert.ok(
  annualPixBlock.includes("valorFinal"),
  "annual Pix must keep the calculated annual amount with discount",
);

assert.match(
  adminOrdersRecoverySource,
  /function shouldReusePixPayment\(candidate: OrderCandidate\): boolean/,
  "admin order recovery must validate whether a Pix payment can be reused",
);

assert.match(
  adminOrdersRecoverySource,
  /readEmvTlvField\(candidate\.pix_code, "59"\)/,
  "admin order recovery must inspect EMV merchant name field 59 before reusing Pix",
);

assert.match(
  adminOrdersRecoverySource,
  /merchantName === "RODRIGO MACEDO"/,
  "admin order recovery must refuse legacy Rodrigo merchant Pix payloads",
);

assert.match(
  adminOrdersRecoverySource,
  /FROM payments\s+WHERE status = 'pending'\s+ORDER BY subscription_id, created_at DESC/s,
  "automatic recovery candidate selection must only reuse pending payments",
);

assert.match(
  adminOrdersRecoverySource,
  /WHERE subscription_id = s\.id\s+AND status = 'pending'\s+ORDER BY created_at DESC/s,
  "manual recovery send must only reuse pending payments",
);

console.log("manualPixPersistence.source.test.ts ok");
