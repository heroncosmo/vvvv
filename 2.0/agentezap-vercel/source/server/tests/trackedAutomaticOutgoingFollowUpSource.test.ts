import assert from "node:assert/strict";

import { shouldScheduleFollowUpForTrackedSharedAutomaticSource } from "../trackedAutomaticOutgoing";

assert.equal(shouldScheduleFollowUpForTrackedSharedAutomaticSource("customer_ai_text"), true);
assert.equal(shouldScheduleFollowUpForTrackedSharedAutomaticSource("customer_media_service"), true);
assert.equal(shouldScheduleFollowUpForTrackedSharedAutomaticSource("customer_system_owner"), true);

assert.equal(shouldScheduleFollowUpForTrackedSharedAutomaticSource("customer_system_followup"), false);
assert.equal(shouldScheduleFollowUpForTrackedSharedAutomaticSource("user_follow_up"), false);
assert.equal(shouldScheduleFollowUpForTrackedSharedAutomaticSource("userFollowUpService"), false);
assert.equal(shouldScheduleFollowUpForTrackedSharedAutomaticSource("followup"), false);
assert.equal(shouldScheduleFollowUpForTrackedSharedAutomaticSource("admin_followup_text"), false);

console.log("trackedAutomaticOutgoingFollowUpSource.test.ts ok");
