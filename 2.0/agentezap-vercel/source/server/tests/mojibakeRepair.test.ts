import test from "node:test";
import assert from "node:assert/strict";

import { repairMojibakeDeep, repairMojibakeText } from "@shared/mojibake";
import { sanitizeOutput } from "../adminAgentOutputSanitizer";

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

test("sanitizeOutput aplica reparo final na resposta do admin", () => {
  const result = sanitizeOutput("Configura\u00c3\u00a7\u00c3\u00a3o salva. Voc\u00c3\u00aa j\u00c3\u00a1 pode testar.");
  assert.equal(result.text, "Configura\u00e7\u00e3o salva. Voc\u00ea j\u00e1 pode testar.");
});
