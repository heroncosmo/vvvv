import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const productsPageSource = fs.readFileSync(
  path.resolve(process.cwd(), "client", "src", "pages", "products.tsx"),
  "utf8",
);

assert.equal(
  productsPageSource.includes("isError: isProductsError"),
  true,
  "products.tsx deve observar erro explícito da query de produtos",
);

assert.equal(
  productsPageSource.includes("lastResolvedProductsData"),
  true,
  "products.tsx deve preservar o último catálogo carregado com sucesso",
);

assert.equal(
  productsPageSource.includes("Atualização do catálogo falhou, mantendo a última lista carregada"),
  true,
  "products.tsx deve avisar quando estiver exibindo fallback do último catálogo carregado",
);

assert.equal(
  productsPageSource.includes("Não foi possível carregar o catálogo agora"),
  true,
  "products.tsx deve renderizar estado de erro quando a query falhar sem dados prévios",
);

console.log("productsPageResilience.test.ts ok");
