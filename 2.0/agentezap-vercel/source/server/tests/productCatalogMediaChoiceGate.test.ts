import assert from "node:assert/strict";

import { shouldAttachCatalogMediaForReply } from "../productCatalogMediaService";

assert.equal(
  shouldAttachCatalogMediaForReply({
    clientMessage: "quero os codigos 15 16 17 18 19 20 21 22 23 24",
    assistantResponse: "Segue abaixo os itens do seu pedido com as fotos dos produtos.",
  }),
  false,
  "lista de codigos escolhidos nao deve disparar reenvio automatico de fotos do catalogo",
);

assert.equal(
  shouldAttachCatalogMediaForReply({
    clientMessage: "me manda as fotos do codigo 40",
    assistantResponse: "Vou te mostrar as fotos agora.",
  }),
  true,
  "pedido explicito de foto por codigo continua podendo anexar imagem",
);

assert.equal(
  shouldAttachCatalogMediaForReply({
    clientMessage: "quero 31,32,33,34,35,36,37,38,39,40",
    assistantResponse: "Segue abaixo os itens do seu pedido com os codigos e valores.",
  }),
  false,
  "lista longa de codigos em formato curto tambem nao deve disparar reenvio automatico de fotos",
);

console.log("productCatalogMediaChoiceGate.test.ts ok");
process.exit(0);
