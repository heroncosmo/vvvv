import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server", "sectorRoutingService.ts"),
  "utf8",
);

assert.equal(
  source.includes("findIntakeFallbackSector"),
  true,
  "sectorRoutingService deve procurar um setor de entrada quando a conversa ainda nao tem setor",
);

assert.equal(
  source.includes("Encaminhamento automatico para o setor de entrada configurado."),
  true,
  "sectorRoutingService deve registrar motivo claro para fallback de setor de entrada",
);

assert.equal(
  source.includes('intent: normalizedIntent === "keep_current" ? "intake_sector_default" : normalizedIntent'),
  true,
  "fallback de entrada deve marcar intent propria em vez de manter keep_current puro",
);

assert.match(
  source,
  /primeiro atendimento\|pre atendimento\|triagem\|entrada/,
  "fallback deve reconhecer pistas genericas de recepcao/primeiro atendimento",
);

console.log("sectorRoutingIntakeFallback.test.ts ok");
