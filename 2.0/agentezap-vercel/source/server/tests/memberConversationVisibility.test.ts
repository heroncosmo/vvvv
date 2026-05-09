import test from "node:test";
import assert from "node:assert/strict";

import { canViewPhoneNumbersFromPermissions } from "../memberPhoneVisibility";

test("oculta telefone quando membro nao tem permissao para ver numeros", () => {
  assert.equal(
    canViewPhoneNumbersFromPermissions({
      canViewPhoneNumbers: false,
    }),
    false,
  );
});

test("preserva telefone quando membro tem permissao para ver numeros", () => {
  assert.equal(
    canViewPhoneNumbersFromPermissions({
      canViewPhoneNumbers: true,
    }),
    true,
  );
});
