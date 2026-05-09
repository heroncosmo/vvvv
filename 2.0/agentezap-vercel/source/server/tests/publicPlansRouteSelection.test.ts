import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes.ts"),
  "utf8",
);

const publicPlansRouteIndex = routesSource.indexOf('app.get("/api/plans", async (_req, res) => {');
assert.notEqual(publicPlansRouteIndex, -1, "Rota publica /api/plans nao encontrada");

const publicPlanByIdRouteIndex = routesSource.indexOf('app.get("/api/plans/:id", async (req, res) => {');
assert.notEqual(publicPlanByIdRouteIndex, -1, "Rota publica /api/plans/:id nao encontrada");

const publicPlansRouteSnippet = routesSource.slice(publicPlansRouteIndex, publicPlansRouteIndex + 300);
const publicPlanByIdRouteSnippet = routesSource.slice(publicPlanByIdRouteIndex, publicPlanByIdRouteIndex + 320);

assert.equal(
  publicPlansRouteSnippet.includes("storage.getPublicCatalogPlans()"),
  true,
  "A rota publica /api/plans deve usar somente os planos selecionados no admin",
);

assert.equal(
  publicPlanByIdRouteSnippet.includes("storage.getPublicCatalogPlans()"),
  true,
  "A rota publica /api/plans/:id deve respeitar a mesma selecao publica do admin",
);

console.log("publicPlansRouteSelection.test.ts: ok");
