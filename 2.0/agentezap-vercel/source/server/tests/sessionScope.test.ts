import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAdminSessionScope,
  applyUserSessionScope,
  clearAdminSessionScope,
  clearUserSessionScope,
  getAdminSessionScope,
  getActiveAppSessionKeys,
  getUserSessionScope,
  hasAdminSessionScope,
  hasActiveAppSessionState,
  hasUserSessionScope,
} from "../sessionScope";

test("logout do usuário remove apenas o escopo do usuário e preserva admin", () => {
  const session = {
    user: { id: "user-1" },
    userId: "user-1",
    assignedPlanId: "plan-1",
    impersonatedBy: "admin-1",
    adminId: "admin-1",
    adminRole: "owner",
  };

  clearUserSessionScope(session);

  assert.deepEqual(getActiveAppSessionKeys(session), ["adminId", "adminRole"]);
  assert.equal(hasActiveAppSessionState(session), true);
});

test("logout do admin remove apenas o escopo do admin e preserva usuário", () => {
  const session = {
    user: { id: "user-1" },
    userId: "user-1",
    adminId: "admin-1",
    adminRole: "owner",
  };

  clearAdminSessionScope(session);

  assert.deepEqual(getActiveAppSessionKeys(session), ["user", "userId"]);
  assert.equal(hasActiveAppSessionState(session), true);
});

test("sessão sem outros escopos ativos pode ser destruída depois do logout", () => {
  const session = {
    user: { id: "user-1" },
    userId: "user-1",
  };

  clearUserSessionScope(session);

  assert.deepEqual(getActiveAppSessionKeys(session), []);
  assert.equal(hasActiveAppSessionState(session), false);
});

test("captura e reaplica apenas o escopo admin", () => {
  const original = {
    user: { id: "user-1" },
    userId: "user-1",
    adminId: "admin-1",
    adminRole: "owner",
  };

  const adminScope = getAdminSessionScope(original);
  assert.equal(hasAdminSessionScope(adminScope), true);

  const regenerated: Record<string, unknown> = {};
  applyAdminSessionScope(regenerated, adminScope);

  assert.deepEqual(regenerated, {
    adminId: "admin-1",
    adminRole: "owner",
  });
});

test("captura e reaplica apenas o escopo do usuário", () => {
  const original = {
    user: { id: "user-1" },
    userId: "user-1",
    assignedPlanId: "plan-1",
    impersonatedBy: "admin-1",
    adminId: "admin-1",
  };

  const userScope = getUserSessionScope(original);
  assert.equal(hasUserSessionScope(userScope), true);

  const regenerated: Record<string, unknown> = {};
  applyUserSessionScope(regenerated, userScope);

  assert.deepEqual(regenerated, {
    user: { id: "user-1" },
    userId: "user-1",
    assignedPlanId: "plan-1",
    impersonatedBy: "admin-1",
  });
});
