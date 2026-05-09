import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes.ts"),
  "utf8",
);

const aiAgentSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "aiAgent.ts"),
  "utf8",
);

const productsPageSource = fs.readFileSync(
  path.resolve(process.cwd(), "client", "src", "pages", "products.tsx"),
  "utf8",
);

assert.equal(
  routesSource.includes("controlStock,"),
  true,
  "routes.ts deve aceitar o campo camelCase controlStock no CRUD de produtos",
);

assert.equal(
  routesSource.includes("control_stock,"),
  true,
  "routes.ts deve aceitar o campo snake_case control_stock no CRUD de produtos",
);

assert.equal(
  routesSource.includes(".select('name, price, stock, control_stock, description, category, link, sku, unit')"),
  true,
  "A rota /api/products/for-ai deve expor control_stock para o catálogo da IA",
);

assert.equal(
  aiAgentSource.includes(".select('id, name, price, stock, control_stock, description, send_description_with_images, category, link, sku, unit, image_url')"),
  true,
  "aiAgent.ts deve buscar control_stock ao montar o contexto do catálogo",
);

assert.equal(
  aiAgentSource.includes("isCatalogProductAvailable(product)"),
  true,
  "aiAgent.ts deve bloquear envio de mídia de produto sem estoque controlado disponível",
);

assert.equal(
  productsPageSource.includes("const PRODUCT_TAB_QUERY_KEY = \"tab\";"),
  true,
  "products.tsx deve sincronizar a aba com a URL via query param",
);

assert.equal(
  productsPageSource.includes("Controlar estoque neste produto"),
  true,
  "products.tsx deve exibir o toggle de controle de estoque no modal do produto",
);

console.log("productsStockControlFlow.test.ts ok");
