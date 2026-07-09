import test from "node:test";
import assert from "node:assert/strict";

import { extractMeaningfulContactName } from "../../shared/contactNameVisibility";

test("preserva nome humano quando o contato tem letras", () => {
  assert.equal(extractMeaningfulContactName("Will"), "Will");
});

test("ignora nome numerico salvo no contato", () => {
  assert.equal(extractMeaningfulContactName("5511939123226"), "");
});

test("ignora nome com simbolos de telefone", () => {
  assert.equal(extractMeaningfulContactName("+55 (11) 93912-3226"), "");
});
