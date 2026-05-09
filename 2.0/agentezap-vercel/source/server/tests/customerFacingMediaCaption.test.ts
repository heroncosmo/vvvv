import assert from "node:assert/strict";

import { resolveCustomerFacingMediaCaption } from "../mediaCustomerCaption";

assert.equal(
  resolveCustomerFacingMediaCaption({
    caption: "  Legenda visivel ao cliente  ",
  }),
  "Legenda visivel ao cliente",
);

assert.equal(
  resolveCustomerFacingMediaCaption({
    caption: "",
  }),
  undefined,
);

assert.equal(
  resolveCustomerFacingMediaCaption({
    caption: undefined,
    description: "Instrucao apenas para a IA",
    whenToUse: "Quando pedirem portfolio",
  } as any),
  undefined,
);

console.log("customerFacingMediaCaption.test.ts ok");
