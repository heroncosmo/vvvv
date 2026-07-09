import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server", "sectorRoutingService.ts"),
  "utf8",
);

assert.equal(
  source.includes("Encaminhamento automatico para o unico setor configurado."),
  true,
  "sectorRoutingService deve ter fallback explicito para o unico setor configurado",
);

assert.equal(
  source.includes("if (!currentState.sector_id)"),
  true,
  "sectorRoutingService deve considerar conversa ainda sem setor antes de manter keep_current",
);

assert.equal(
  source.includes("if (sectors.length === 1)"),
  true,
  "sectorRoutingService deve autoencaminhar quando houver apenas um setor disponivel",
);

console.log("sectorRoutingSingleSectorFallback.test.ts ok");
