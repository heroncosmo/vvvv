import test from "node:test";
import assert from "node:assert/strict";

import { repairMojibakeDeep, repairMojibakeText } from "@shared/mojibake";

test("repairMojibakeText corrige portugues quebrado", () => {
  assert.equal(
    repairMojibakeText("Voc\u00c3\u00aa j\u00c3\u00a1 pode testar o sistema."),
    "Voc\u00ea j\u00e1 pode testar o sistema.",
  );
});

test("repairMojibakeText corrige acentos comuns", () => {
  assert.equal(
    repairMojibakeText("Configura\u00c3\u00a7\u00c3\u00a3o salva"),
    "Configura\u00e7\u00e3o salva",
  );
  assert.equal(
    repairMojibakeText("Cart\u00c3\u00a3o inv\u00c3\u00a1lido"),
    "Cart\u00e3o inv\u00e1lido",
  );
  assert.equal(
    repairMojibakeText("Pagamento confirmado \u00c3\u00a0 vista."),
    "Pagamento confirmado \u00e0 vista.",
  );
  assert.equal(
    repairMojibakeText("Pagamento via PIX, instant\u00c3\u00a2neo e seguro."),
    "Pagamento via PIX, instant\u00e2neo e seguro.",
  );
});

test("repairMojibakeText corrige mojibake Windows-1252 de saida publica", () => {
  assert.equal(
    repairMojibakeText("ASSISTENTE VIRTUAL MFC SUBLIMA\u00c3\u2021\u00c3\u0192O"),
    "ASSISTENTE VIRTUAL MFC SUBLIMA\u00c7\u00c3O",
  );
  assert.equal(
    repairMojibakeText("Valor R$\u00e2\u20ac\u00af100,00"),
    "Valor R$ 100,00",
  );
  assert.equal(
    repairMojibakeText("Valor R$\u00e2\u0080\u00af100,00"),
    "Valor R$ 100,00",
  );
  assert.equal(
    repairMojibakeText("Valor R$\u202f100,00"),
    "Valor R$ 100,00",
  );
});

test("repairMojibakeDeep corrige objetos aninhados", () => {
  const payload = {
    title: "Configura\u00c3\u00a7\u00c3\u00a3o salva",
    nested: {
      message: "Voc\u00c3\u00aa pode continuar.",
    },
  };

  assert.deepEqual(repairMojibakeDeep(payload), {
    title: "Configura\u00e7\u00e3o salva",
    nested: {
      message: "Voc\u00ea pode continuar.",
    },
  });
});

