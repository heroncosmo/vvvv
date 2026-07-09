import assert from "node:assert/strict";
import { shouldSkipBillingNotificationsForSubscription } from "../subscriptionBillingNotificationPolicy";

function testSupportRecoveryWindowSkipsBilling() {
  assert.equal(
    shouldSkipBillingNotificationsForSubscription({
      supportRecoveryWindow: {
        source: "mission_recuperacao_clientes",
      },
    }),
    true,
  );
}

function testMissionRecoveryDeclinedSkipsBillingFromJsonString() {
  assert.equal(
    shouldSkipBillingNotificationsForSubscription(JSON.stringify({
      missionRecoveryDeclined: {
        reason: "customer_declined",
      },
    })),
    true,
  );
}

function testRegularSubscriptionKeepsBillingEnabled() {
  assert.equal(
    shouldSkipBillingNotificationsForSubscription({
      mercadoPago: {
        subscriptionId: "sub_123",
      },
    }),
    false,
  );
}

function testInvalidMetadataKeepsBillingEnabled() {
  assert.equal(shouldSkipBillingNotificationsForSubscription("not-json"), false);
  assert.equal(shouldSkipBillingNotificationsForSubscription(null), false);
}

testSupportRecoveryWindowSkipsBilling();
testMissionRecoveryDeclinedSkipsBillingFromJsonString();
testRegularSubscriptionKeepsBillingEnabled();
testInvalidMetadataKeepsBillingEnabled();

console.log("notificationSchedulerRecoveryBilling tests passed");
