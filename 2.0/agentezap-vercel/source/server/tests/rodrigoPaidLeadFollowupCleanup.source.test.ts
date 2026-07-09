import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "server", "rodrigoMetaFunnelService.ts"), "utf8");
const httpSource = readFileSync(join(process.cwd(), "api", "http.ts"), "utf8");

function assertSource(pattern: RegExp, message: string) {
  assert.match(source, pattern, message);
}

assertSource(
  /import \{ db, pool \} from "\.\/db";/,
  "Rodrigo funnel service must use pool for payment-approved follow-up cleanup queries",
);

assertSource(
  /async function cleanupRodrigoPaidLeadFollowup[\s\S]*Pagamento aprovado - follow-up pausado automaticamente/,
  "approved payment must have a dedicated follow-up cleanup helper with an audit reason",
);

assertSource(
  /export async function cleanupRodrigoPaidLeadFollowupFromSubscription[\s\S]*loadSubscriptionLead[\s\S]*findRodrigoConversationBySubscription[\s\S]*cleanupRodrigoPaidLeadFollowup/,
  "payment-approved cleanup must be exported as an awaited operational side effect, not only hidden behind Meta tracking",
);

assertSource(
  /UPDATE conversations[\s\S]*followup_active = false[\s\S]*followup_stage = 0[\s\S]*next_followup_at = NULL[\s\S]*followup_disabled_reason = \$2/,
  "paid Rodrigo CRM conversation must be paused immediately after approved payment",
);

assertSource(
  /UPDATE admin_conversations ac[\s\S]*payment_status = 'paid'[\s\S]*followup_for_non_payers = false[\s\S]*followup_active = false[\s\S]*next_followup_at = NULL[\s\S]*LOWER\(a\.email\) = LOWER\(\$1\)/,
  "Rodrigo admin conversation must be marked paid and non-payer follow-up must be disabled under Rodrigo ownership",
);

assertSource(
  /UPDATE owner_scheduled_notifications osn[\s\S]*status = 'skipped_active_plan'[\s\S]*notification_type IN \('payment_reminder', 'overdue_reminder'\)[\s\S]*status IN \('pending', 'processing', 'failed'\)/,
  "open Rodrigo billing notifications must be skipped when the payment is approved",
);

assertSource(
  /async function skipOptionalPaidLeadOwnerNotifications[\s\S]*UPDATE owner_scheduled_notifications osn[\s\S]*if \(error\?\.code === "42P01"\) return 0/,
  "optional owner notification cleanup must tolerate a missing notification table without turning approved payment into a false failure",
);

assertSource(
  /UPDATE admin_pix_recovery_messages[\s\S]*skipped_payment_already_recorded[\s\S]*status IN \('pending', 'processing', 'failed'\)/,
  "open Pix recovery rows must be skipped after approved payment",
);

const sideEffectsBlock = httpSource.slice(
  httpSource.indexOf("async function handleRodrigoApprovedPaymentSideEffects"),
  httpSource.indexOf("async function handleCheckPixStatus", httpSource.indexOf("async function handleRodrigoApprovedPaymentSideEffects")),
);

assert.ok(
  sideEffectsBlock.includes("await cleanupRodrigoPaidLeadFollowupFromSubscription"),
  "payment approval side effects must await follow-up cleanup before scheduling Meta tracking",
);
assert.ok(
  sideEffectsBlock.indexOf("await cleanupRodrigoPaidLeadFollowupFromSubscription") < sideEffectsBlock.indexOf("waitUntil(recordRodrigoWhatsappPurchaseFromSubscription"),
  "follow-up cleanup must happen before waitUntil Meta tracking",
);

assert.match(
  httpSource,
  /await handleRodrigoApprovedPaymentSideEffects\(\{[\s\S]*source: "admin_mark_paid"/,
  "admin mark-paid must await Rodrigo follow-up cleanup",
);

assert.match(
  httpSource,
  /await handleRodrigoApprovedPaymentSideEffects\(\{[\s\S]*source: "manual_receipt_approved"/,
  "manual receipt approval must await Rodrigo follow-up cleanup",
);

assert.doesNotMatch(
  httpSource,
  /function trackRodrigoMetaPurchaseFromSubscription/,
  "old best-effort-only tracker wrapper must not remain as the payment side-effect entrypoint",
);

console.log("rodrigoPaidLeadFollowupCleanup.source.test.ts ok");
