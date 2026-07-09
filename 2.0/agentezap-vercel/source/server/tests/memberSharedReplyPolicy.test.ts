import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const accessSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "conversationAccess.ts"),
  "utf8",
);
const routesSource = fs.readFileSync(
  path.resolve(process.cwd(), "server", "routes.ts"),
  "utf8",
);
const httpSource = fs.readFileSync(
  path.resolve(process.cwd(), "api", "http.ts"),
  "utf8",
);

assert.equal(
  accessSource.includes("export function authorizeMemberReplyToConversation"),
  true,
  "conversationAccess deve centralizar a autorização de reply do membro",
);

assert.equal(
  accessSource.includes('sectorSettings.memberReplyScope === "shared"'),
  true,
  "conversationAccess deve permitir reply compartilhado quando o setor estiver em modo shared",
);

assert.equal(
  accessSource.includes("shouldAutoClaim: assignedToMemberId !== scope.memberId"),
  true,
  "setor compartilhado deve remarcar o responsavel para o membro que respondeu",
);

assert.match(
  routesSource,
  /targetMemberId: memberScope\.memberId/,
  "rotas de reply devem transferir a responsabilidade para o membro que respondeu",
);

assert.equal(
  httpSource.includes("const shouldClaimSharedConversation"),
  true,
  "rota HTTP deve remarcar responsavel em fila compartilhada quando membro responde",
);

assert.equal(
  accessSource.includes("sectorSettings.controlledHandoffEnabled"),
  true,
  "conversationAccess deve considerar controlled_handoff_enabled na visibilidade",
);

assert.equal(
  routesSource.includes("const authorization = authorizeMemberReplyToConversation(conversation, memberScope);"),
  true,
  "rotas de reply devem usar a autorização centralizada antes de assumir a conversa",
);

console.log("memberSharedReplyPolicy.test.ts ok");
