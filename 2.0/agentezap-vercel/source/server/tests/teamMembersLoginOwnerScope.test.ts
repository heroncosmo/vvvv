import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes.ts"),
  "utf8",
);

assert.equal(
  source.includes("await storage.getTeamMemberByEmail(normalizedOwnerId, email)"),
  true,
  "login de membro deve respeitar ownerId quando ele for enviado",
);

assert.equal(
  source.includes("await storage.getTeamMemberByEmailGlobal(email)"),
  true,
  "login de membro deve manter fallback global para compatibilidade",
);

console.log("teamMembersLoginOwnerScope.test.ts ok");
