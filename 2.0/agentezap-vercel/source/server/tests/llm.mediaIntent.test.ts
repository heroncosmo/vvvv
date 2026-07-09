import assert from "node:assert/strict";

import { detectMediaSendingIntent } from "../llm";

assert.equal(detectMediaSendingIntent("Essa é a foto do produto:"), true);
assert.equal(detectMediaSendingIntent("Essa ? a foto do produto:"), true);
assert.equal(detectMediaSendingIntent("Aqui está uma imagem do catálogo."), true);
assert.equal(detectMediaSendingIntent("Aqui est? uma imagem do catalogo."), true);
assert.equal(detectMediaSendingIntent("Consigo te explicar como funciona sem enviar nada agora."), false);

console.log("llm.mediaIntent.test.ts ok");
process.exit(0);
