import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes.ts"),
  "utf8",
);

assert.equal(
  routesSource.includes('app.put("/api/products/:id/media/reorder", isAuthenticated, async (req: any, res) => {'),
  true,
  "routes.ts deve registrar a rota de reorder da galeria do produto",
);

assert.equal(
  routesSource.includes("const parseResult = productMediaReorderSchema.safeParse(req.body);"),
  true,
  "A rota de reorder deve validar o payload com productMediaReorderSchema",
);

assert.equal(
  routesSource.includes(".from('product_media')"),
  true,
  "A rota de reorder deve atualizar a tabela product_media",
);

const reorderRouteIndex = routesSource.indexOf(
  'app.put("/api/products/:id/media/reorder", isAuthenticated, async (req: any, res) => {',
);
const updateRouteIndex = routesSource.indexOf(
  'app.put("/api/products/:id/media/:mediaId", isAuthenticated, async (req: any, res) => {',
);

assert.notEqual(
  reorderRouteIndex,
  -1,
  "A rota de reorder precisa existir para evitar conflito com a rota generica de media",
);

assert.notEqual(
  updateRouteIndex,
  -1,
  "A rota generica de update da media precisa continuar existindo",
);

assert.equal(
  reorderRouteIndex < updateRouteIndex,
  true,
  "A rota de reorder deve vir antes da rota generica de media para nao capturar /media/reorder como :mediaId",
);

console.log("productsRouteMediaReorder.test.ts: ok");
