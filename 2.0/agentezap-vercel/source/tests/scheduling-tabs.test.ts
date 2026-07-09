import assert from "node:assert/strict";
import { buildSchedulingTabUrl, getSchedulingTabFromSearch } from "../client/src/lib/scheduling-tabs.ts";

assert.equal(getSchedulingTabFromSearch("?tab=google-calendar"), "google-calendar");
assert.equal(getSchedulingTabFromSearch("?tab=services"), "services");
assert.equal(getSchedulingTabFromSearch("?tab=invalida"), "appointments");
assert.equal(getSchedulingTabFromSearch(""), "appointments");

assert.equal(buildSchedulingTabUrl("appointments"), "/agendamentos");
assert.equal(buildSchedulingTabUrl("config"), "/agendamentos?tab=config");
assert.equal(buildSchedulingTabUrl("google-calendar"), "/agendamentos?tab=google-calendar");

console.log("scheduling-tabs.test.ts ok");
