import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const httpSource = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8");
const routesSource = readFileSync(join(process.cwd(), "server", "routes.ts"), "utf8");

assert.match(
  httpSource,
  /async function supersedeCompetingSubscriptionsForUser/,
  "api/http.ts must keep a centralized supersedence guard for billing activations",
);

assert.match(
  httpSource,
  /function activateSubscriptionFromReceipt[\s\S]*supersedeCompetingSubscriptionsForUser\(\{[\s\S]*source: statusDetail,[\s\S]*receiptId,/,
  "automatic receipt activation must supersede competing subscriptions for the same user",
);

assert.match(
  httpSource,
  /if \(req\.method === "POST" && action === "mark-paid"\)[\s\S]*supersedeCompetingSubscriptionsForUser\(\{[\s\S]*source: "admin_mark_paid"/,
  "admin mark-paid must supersede competing subscriptions for the same user",
);

assert.match(
  httpSource,
  /if \(action === "approve"\)[\s\S]*const activationResult = await getPool\(\)\.query[\s\S]*supersedeCompetingSubscriptionsForUser\(\{[\s\S]*source: "manual_receipt_admin_approved"/,
  "admin receipt approval must supersede competing subscriptions for the same user",
);

assert.match(
  httpSource,
  /status = 'cancelled'[\s\S]*'supersededBySubscriptionId'[\s\S]*old\.id <> activated\.id/,
  "supersedence must cancel only competing rows and preserve an audit marker",
);

assert.match(
  routesSource,
  /app\.post\("\/api\/admin\/payment-receipts\/:id\/approve"[\s\S]*'supersededBySubscriptionId'[\s\S]*old\.id <> activated\.id[\s\S]*"manual_receipt_admin_approved"/,
  "legacy Express admin receipt approval must keep the same competing-subscription supersedence guard",
);

console.log("billingSubscriptionSupersedence.source.test.ts ok");
