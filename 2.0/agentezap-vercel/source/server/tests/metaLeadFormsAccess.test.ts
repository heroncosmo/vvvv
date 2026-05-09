import assert from "node:assert/strict";

import { storage } from "../storage.ts";
import {
  assertMetaLeadFormsBetaAccess,
  getMetaLeadFormsBetaStatus,
  isMetaLeadFormsAllowedEmail,
} from "../metaLeadFormsAccess.ts";

const originalGetUser = storage.getUser.bind(storage);

(storage as typeof storage & {
  getUser: typeof storage.getUser;
}).getUser = async (userId: string) =>
  ({
    id: userId,
    email: "cliente@example.com",
  }) as Awaited<ReturnType<typeof storage.getUser>>;

try {
  assert.equal(isMetaLeadFormsAllowedEmail("cliente@example.com"), true);
  assert.equal(isMetaLeadFormsAllowedEmail(""), false);

  const ownerStatus = await getMetaLeadFormsBetaStatus("user-1", { isMember: false });
  assert.deepEqual(ownerStatus, {
    enabled: true,
    userEmail: "cliente@example.com",
  });

  const memberStatus = await getMetaLeadFormsBetaStatus("user-1", { isMember: true });
  assert.deepEqual(memberStatus, {
    enabled: false,
    userEmail: "cliente@example.com",
  });

  await assert.doesNotReject(() => assertMetaLeadFormsBetaAccess("user-1", { isMember: false }));

  await assert.rejects(
    () => assertMetaLeadFormsBetaAccess("user-1", { isMember: true }),
    /Acesso restrito ao dono da conta\./,
  );
} finally {
  (storage as typeof storage & {
    getUser: typeof storage.getUser;
  }).getUser = originalGetUser;
}
