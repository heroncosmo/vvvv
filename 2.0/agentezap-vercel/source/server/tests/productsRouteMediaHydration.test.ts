import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes.ts"),
  "utf8",
);

assert.equal(
  routesSource.includes('import { attachMediaToProducts, fetchProductMediaRows } from "./productCatalogAssets";'),
  true,
  "routes.ts deve importar os helpers de hidratacao do catalogo",
);

const productsRouteIndex = routesSource.indexOf('app.get("/api/products", isAuthenticated, async (req: any, res) => {');
assert.notEqual(productsRouteIndex, -1, "Rota /api/products nao encontrada");

const productByIdRouteIndex = routesSource.indexOf('app.get("/api/products/:id", isAuthenticated, async (req: any, res) => {');
assert.notEqual(productByIdRouteIndex, -1, "Rota /api/products/:id nao encontrada");

const productsRouteSnippet = routesSource.slice(productsRouteIndex, productsRouteIndex + 1200);
const productByIdRouteSnippet = routesSource.slice(productByIdRouteIndex, productByIdRouteIndex + 900);

assert.equal(
  productsRouteSnippet.includes("const hydratedProducts = attachMediaToProducts("),
  true,
  "A rota /api/products deve hidratar media_items, image_count e primary_image_url",
);

assert.equal(
  productsRouteSnippet.includes("await fetchProductMediaRows({"),
  true,
  "A rota /api/products deve buscar a galeria real do produto",
);

assert.equal(
  productByIdRouteSnippet.includes("const [hydratedProduct] = attachMediaToProducts("),
  true,
  "A rota /api/products/:id deve hidratar a galeria antes de responder",
);

assert.equal(
  productByIdRouteSnippet.includes("await fetchProductMediaRows({"),
  true,
  "A rota /api/products/:id deve buscar as imagens reais do produto",
);

console.log("productsRouteMediaHydration.test.ts: ok");
