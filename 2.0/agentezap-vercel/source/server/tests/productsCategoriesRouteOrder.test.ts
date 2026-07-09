import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes.ts"),
  "utf8",
);

const categoriesRouteIndex = routesSource.indexOf('app.get("/api/products/categories", isAuthenticated, async (req: any, res) => {');
assert.notEqual(categoriesRouteIndex, -1, "Rota /api/products/categories nao encontrada");

const productByIdRouteIndex = routesSource.indexOf('app.get("/api/products/:id", isAuthenticated, async (req: any, res) => {');
assert.notEqual(productByIdRouteIndex, -1, "Rota /api/products/:id nao encontrada");

assert.equal(
  categoriesRouteIndex < productByIdRouteIndex,
  true,
  "A rota estatica /api/products/categories deve vir antes de /api/products/:id para nao cair no matcher dinamico",
);

console.log("productsCategoriesRouteOrder.test.ts: ok");
