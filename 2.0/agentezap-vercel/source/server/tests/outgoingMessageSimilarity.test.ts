import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOutgoingMessageFingerprint,
  calculateOutgoingMessageSimilarity,
  isOutgoingMessageNearDuplicate,
} from "../outgoingMessageSimilarity";

test("normaliza acentos, pontuacao e espacos extras", () => {
  const fingerprint = buildOutgoingMessageFingerprint("Kamila, você está vindo?   ");
  assert.equal(fingerprint, "kamila voce esta vindo");
});

test("detecta duplicidade exata mesmo com pontuacao diferente", () => {
  assert.equal(
    isOutgoingMessageNearDuplicate(
      "kamila você está vindo pelo projeto de cursos gratuitos.",
      "Kamila, voce esta vindo pelo projeto de cursos gratuitos",
    ),
    true,
  );
});

test("detecta quando uma mensagem longa contém integralmente a anterior", () => {
  const similarity = calculateOutgoingMessageSimilarity(
    "Cursos Gratuitos: Área da Saúde. Kamila você está vindo pelo projeto de cursos gratuitos.",
    "Kamila você está vindo pelo projeto de cursos gratuitos",
  );

  assert.equal(similarity >= 0.9, true);
});

test("nao marca textos realmente diferentes como duplicados", () => {
  assert.equal(
    isOutgoingMessageNearDuplicate(
      "Kamila, quer que eu te explique a duração do curso?",
      "Kamila, ainda faz sentido eu te mandar as opções de matrícula?",
    ),
    false,
  );
});
