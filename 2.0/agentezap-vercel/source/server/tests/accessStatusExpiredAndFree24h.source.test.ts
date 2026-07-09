import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const httpSource = fs.readFileSync(path.resolve(root, "api", "http.ts"), "utf8");
const whatsappSource = fs.readFileSync(path.resolve(root, "server", "whatsapp.ts"), "utf8");
const routesSource = fs.readFileSync(path.resolve(root, "server", "routes.ts"), "utf8");
const policySource = fs.readFileSync(path.resolve(root, "server", "subscriptionAccessPolicy.ts"), "utf8");
const entitlementSource = fs.readFileSync(path.resolve(root, "server", "accessEntitlement.ts"), "utf8");

assert.match(
  httpSource,
  /FREE_PRIORITY_GRACE_HOURS\s*=\s*24/,
  "Gratis priority window must last 24h.",
);

assert.match(
  httpSource,
  /getFreePriorityAnchorAtForUser[\s\S]*whatsapp_connections[\s\S]*freeTrial,firstConnectedAt/,
  "Gratis 24h clock must be anchored to WhatsApp connection metadata.",
);

assert.doesNotMatch(
  httpSource,
  /const accountCreatedAt = hasActiveSubscription \? null : await getUserCreatedAtForAccess\(userId\)/,
  "Gratis 24h clock must not start from user account creation.",
);

assert.match(
  httpSource,
  /isSubscriptionPendingPaymentForAccess[\s\S]*\["pending", "pending_pix", "pending_payment"\][\s\S]*return true;/,
  "Pending Pix/payment subscriptions must not fall back to Gratis.",
);

assert.match(
  httpSource,
  /subscriptionAccessBlocked[\s\S]*\?\s*"expired"/,
  "Expired or pending-payment subscriptions must not become free/economy access.",
);

assert.match(
  httpSource,
  /shouldBlock:\s*hardAccessBlocked\s*\|\|\s*subscriptionAccessBlocked/,
  "HTTP access status must hard-block expired or pending-payment subscriptions.",
);

assert.match(
  httpSource,
  /resolveTechnicalAccessBlockForBillableAction[\s\S]*subscription_pending_payment[\s\S]*subscription_expired/,
  "Authenticated simulator billable guard must block pending and expired subscriptions.",
);

for (const runtimeName of [
  "WEB_ONLY_AGENTIC_SDK_TIMEOUT_MS",
  "WEB_ONLY_MEDIA_ARBITRATOR_TIMEOUT_MS",
  "WEB_ONLY_AGENTIC_AUDIT_TIMEOUT_MS",
  "PROMPT_EDIT_CODEX_CLI_TIMEOUT_MS",
  "PROMPT_EDIT_AGENTIC_TASK_TIMEOUT_MS",
]) {
  assert.match(
    httpSource,
    new RegExp(`const\\s+${runtimeName}\\b`),
    `${runtimeName} must be defined before web-only simulator runtime uses it.`,
  );
}

assert.match(
  httpSource,
  /function resolveWebOnlySimulatorLlmProviderTimeoutMs[\s\S]*WEB_ONLY_SIMULATOR_LLM_PROVIDER_TIMEOUT_MS[\s\S]*WEB_ONLY_AGENTIC_SDK_TIMEOUT_MS/,
  "Public/free web-only simulator must resolve LLM provider timeout without throwing a runtime ReferenceError.",
);

assert.match(
  httpSource,
  /syncConnectionStateFromGatewayStatus[\s\S]*'\{freeTrial\}'[\s\S]*freeTrial,firstConnectedAt[\s\S]*freeTrial,lastConnectedAt/,
  "Gateway connection sync must create freeTrial metadata and persist the Gratis 24h connection anchor.",
);

assert.match(
  whatsappSource,
  /mergeConnectionFreeTrialConnectionMetadata[\s\S]*firstConnectedAt[\s\S]*lastConnectedAt/,
  "Local Baileys open path must persist the Gratis 24h connection anchor.",
);

assert.match(
  whatsappSource,
  /const isSubscriptionExpired = entitlement\.isExpired[\s\S]*subscription_expired[\s\S]*return;/,
  "Real WhatsApp AI processing must stop before generation when the subscription is expired.",
);

assert.match(
  whatsappSource,
  /const isSubscriptionPendingPayment = entitlement\.isPendingReceiptAccess && !hasActiveSubscription[\s\S]*subscription_pending_payment[\s\S]*return;/,
  "Real WhatsApp AI processing must stop before generation when payment is pending.",
);

assert.doesNotMatch(
  whatsappSource,
  /Plano vencido segue no Gratis\/Modo Economico/,
  "Real WhatsApp source must not document expired plans as Gratis/economy.",
);

assert.match(
  routesSource,
  /subscriptionPendingPaymentBlocked[\s\S]*const shouldBlock = hardAccessBlocked\s*\|\|\s*subscriptionAccessBlocked/,
  "Legacy access-status route must block expired and pending-payment subscriptions instead of returning free.",
);

assert.match(
  routesSource,
  /resolveUserAccessBlockForBillableAction[\s\S]*subscription_expired/,
  "Legacy billable action guard must block expired subscriptions.",
);

assert.match(
  policySource,
  /"expired_status"[\s\S]*\["expired", "overdue", "blocked", "suspended"\]/,
  "Canonical subscription policy must treat explicit expired/overdue statuses as expired.",
);

assert.match(
  entitlementSource,
  /function isPendingPaymentStatus[\s\S]*pending_pix[\s\S]*hasPendingReceiptAccess \|\| hasPendingPaymentAccess/,
  "Canonical entitlement must expose pending payment statuses as blocking pending access.",
);

console.log("accessStatusExpiredAndFree24h.source.test.ts ok");
