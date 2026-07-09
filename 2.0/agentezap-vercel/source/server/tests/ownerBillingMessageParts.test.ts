import assert from "node:assert/strict";
import { buildOwnerBillingMessageParts } from "../ownerBillingMessageParts";

function testRenderedPixBlockIsSeparated() {
  const pixCode = "00020126360014br.gov.bcb.pix0114+55179999999995204000053039865406199.995802BR";
  const parts = buildOwnerBillingMessageParts(
    [
      "Ola Cliente!",
      "",
      "Seu plano venceu em 18/05/2026.",
      "Valor: R$ 499,99",
      "",
      "Pix copia e cola:",
      pixCode,
      "",
      "Depois de pagar, envie o comprovante por aqui para validarmos.",
    ].join("\n"),
    { pix_copia_cola: pixCode },
  );

  assert.equal(
    parts.mainMessage,
    [
      "Ola Cliente!",
      "",
      "Seu plano venceu em 18/05/2026.",
      "Valor: R$ 499,99",
      "",
      "Depois de pagar, envie o comprovante por aqui para validarmos.",
    ].join("\n"),
  );
  assert.equal(parts.pixCopyMessage, pixCode);
}

function testPlaceholderPixBlockIsSeparated() {
  const parts = buildOwnerBillingMessageParts(
    [
      "Ola Cliente!",
      "",
      "Pix copia e cola:",
      "{{pix_copia_cola}}",
      "",
      "Obrigado.",
    ].join("\n"),
    { pix_copia_cola: "000201ABC" },
  );

  assert.equal(parts.mainMessage, ["Ola Cliente!", "", "Obrigado."].join("\n"));
  assert.equal(parts.pixCopyMessage, "000201ABC");
}

function testPixMetadataStillCreatesSeparateMessageWhenTemplateDoesNotContainPix() {
  const parts = buildOwnerBillingMessageParts("Ola Cliente!\n\nSeu plano venceu.", {
    pixCode: "000201XYZ",
  });

  assert.equal(parts.mainMessage, "Ola Cliente!\n\nSeu plano venceu.");
  assert.equal(parts.pixCopyMessage, "000201XYZ");
}

function testNoPixMetadataKeepsSingleMessage() {
  const parts = buildOwnerBillingMessageParts("Ola Cliente!\n\nSem Pix.", {});

  assert.equal(parts.mainMessage, "Ola Cliente!\n\nSem Pix.");
  assert.equal(parts.pixCopyMessage, null);
}

testRenderedPixBlockIsSeparated();
testPlaceholderPixBlockIsSeparated();
testPixMetadataStillCreatesSeparateMessageWhenTemplateDoesNotContainPix();
testNoPixMetadataKeepsSingleMessage();

console.log("ownerBillingMessageParts tests passed");
