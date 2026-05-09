import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes.ts"),
  "utf8",
);

assert.equal(
  routesSource.includes('app.post("/api/products/:id/media/upload", isAuthenticated, upload.array(\'files\', 20), async (req: any, res) => {'),
  true,
  "routes.ts deve registrar a rota de upload multiplo da galeria do produto",
);

assert.equal(
  routesSource.includes("productMediaSchema.safeParse(payload)"),
  true,
  "A rota de upload deve validar o payload gerado para product_media",
);

assert.equal(
  routesSource.includes(".from('product-media')"),
  true,
  "A rota de upload/delete deve usar o bucket publico product-media",
);

assert.equal(
  routesSource.includes('app.delete("/api/products/:id/media/:mediaId", isAuthenticated, async (req: any, res) => {'),
  true,
  "routes.ts deve registrar a rota de exclusao individual da galeria do produto",
);

assert.equal(
  routesSource.includes('app.put("/api/products/:id/media/:mediaId", isAuthenticated, async (req: any, res) => {'),
  true,
  "routes.ts deve registrar a rota de atualizacao individual da variacao da imagem",
);

assert.equal(
  routesSource.includes("productMediaUpdateSchema.safeParse(req.body)"),
  true,
  "A rota de update da imagem deve validar o payload com productMediaUpdateSchema",
);

assert.equal(
  routesSource.includes(".from('product_media')"),
  true,
  "As rotas da galeria do produto devem persistir na tabela product_media",
);

console.log("productsRouteMediaUploadDelete.test.ts: ok");
