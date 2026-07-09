import test from "node:test";
import assert from "node:assert/strict";

import { resolveManualMessageSignatureName } from "../manualMessageSignature";

test("usa assinatura do membro quando login e de membro", () => {
  const result = resolveManualMessageSignatureName({
    isMember: true,
    memberSignature: "Karllos | Assistente Juridico",
    memberSignatureEnabled: true,
    ownerSignature: "Dra. Tania",
    ownerSignatureEnabled: true,
  });

  assert.equal(result, "Karllos | Assistente Juridico");
});

test("nao herda assinatura do dono quando membro desabilitou assinatura", () => {
  const result = resolveManualMessageSignatureName({
    isMember: true,
    memberSignature: "Athalyra",
    memberSignatureEnabled: false,
    ownerSignature: "Dra. Tania",
    ownerSignatureEnabled: true,
  });

  assert.equal(result, null);
});

test("mantem assinatura do dono para login principal", () => {
  const result = resolveManualMessageSignatureName({
    isMember: false,
    ownerSignature: "Rodrigo",
    ownerSignatureEnabled: true,
  });

  assert.equal(result, "Rodrigo");
});

test("mantem assinatura manual do dono mesmo quando assinatura da IA esta desativada", () => {
  const result = resolveManualMessageSignatureName({
    isMember: false,
    ownerSignature: "Rodrigo",
    ownerSignatureEnabled: true,
  });

  assert.equal(result, "Rodrigo");
});
