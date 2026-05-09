import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const schemaSource = fs.readFileSync(
  path.resolve(process.cwd(), "shared", "schema.ts"),
  "utf8",
);
const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes_user_sectors.ts"),
  "utf8",
);
const uiSource = fs.readFileSync(
  path.resolve(process.cwd(), "client", "src", "components", "sectors-manager.tsx"),
  "utf8",
);

assert.equal(
  schemaSource.includes('controlledHandoffEnabled: boolean("controlled_handoff_enabled")'),
  true,
  "schema de sectors deve expor controlled_handoff_enabled",
);

assert.equal(
  schemaSource.includes('memberReplyScope: varchar("member_reply_scope"'),
  true,
  "schema de sectors deve expor member_reply_scope",
);

assert.equal(
  routesSource.includes("controlled_handoff_enabled"),
  true,
  "rotas de setor devem persistir controlled_handoff_enabled",
);

assert.equal(
  routesSource.includes("member_reply_scope"),
  true,
  "rotas de setor devem persistir member_reply_scope",
);

assert.equal(
  uiSource.includes("Handoff controlado"),
  true,
  "modal de setor deve exibir o controle de handoff",
);

assert.equal(
  uiSource.includes("Colaboração entre membros"),
  true,
  "modal de setor deve exibir a configuração de colaboração",
);

console.log("sectorCollaborationControls.test.ts ok");
