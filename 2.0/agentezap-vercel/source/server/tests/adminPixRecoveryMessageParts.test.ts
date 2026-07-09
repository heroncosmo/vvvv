import assert from "node:assert/strict";
import { buildAdminPixRecoveryMessageParts } from "../adminPixRecoveryMessageParts";

function testPixCopyCodeIsSentAloneAfterMainMessage() {
  const pixCode = "00020126360014br.gov.bcb.pix0114+5517999999999520400005303986540599.995802BR";
  const parts = buildAdminPixRecoveryMessageParts(
    [
      "Oi, JOAO. Vi que o Pix do IA configurada e pronta ficou pendente.",
      "",
      "Falta so o pagamento para liberar seu acesso.",
      "",
      "Pix copia e cola:",
      pixCode,
      "",
      "Se ja pagou, envie o comprovante por aqui que eu confiro.",
    ].join("\n"),
    pixCode,
  );

  assert.deepEqual(parts, [
    [
      "Oi, JOAO. Vi que o Pix do IA configurada e pronta ficou pendente.",
      "",
      "Falta so o pagamento para liberar seu acesso.",
      "",
      "Se ja pagou, envie o comprovante por aqui que eu confiro.",
    ].join("\n"),
    pixCode,
  ]);
}

function testMessageWithoutPixCodeStaysSingle() {
  const parts = buildAdminPixRecoveryMessageParts(
    "Oi, JOAO. Abra o link de pagamento para continuar.",
    "",
  );

  assert.deepEqual(parts, ["Oi, JOAO. Abra o link de pagamento para continuar."]);
}

testPixCopyCodeIsSentAloneAfterMainMessage();
testMessageWithoutPixCodeStaysSingle();

console.log("adminPixRecoveryMessageParts tests passed");
