import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { canViewPhoneNumbersFromPermissions } from "../memberPhoneVisibility";

test("oculta telefone quando membro nao tem permissao para ver numeros", () => {
  assert.equal(
    canViewPhoneNumbersFromPermissions({
      canViewPhoneNumbers: false,
    }),
    false,
  );
});

test("preserva telefone quando membro tem permissao para ver numeros", () => {
  assert.equal(
    canViewPhoneNumbersFromPermissions({
      canViewPhoneNumbers: true,
    }),
    true,
  );
});

test("conversas sem setor continuam visiveis para membros vinculados a linha", () => {
  const root = process.cwd();
  const httpSource = readFileSync(resolve(root, "api/http.ts"), "utf8");
  const accessSource = readFileSync(resolve(root, "server/conversationAccess.ts"), "utf8");
  const realtimeSource = readFileSync(resolve(root, "server/appRealtime.ts"), "utf8");
  const storageSource = readFileSync(resolve(root, "server/storage.ts"), "utf8");

  assert.match(
    httpSource,
    /c\.connection_id = \$\$\{params\.length\} AND c\.sector_id IS NULL/,
    "a listagem deve incluir conversas sem setor quando o membro tem acesso a linha",
  );
  assert.match(
    httpSource,
    /canClaimUnroutedConnection/,
    "o envio manual deve assumir conversa sem setor vinculada a linha do membro",
  );
  assert.match(
    accessSource,
    /isMemberConnectionScopedUnroutedConversation/,
    "a politica central deve reconhecer conversa sem setor pelo vinculo da linha",
  );
  assert.match(
    realtimeSource,
    /connection_members[\s\S]*COALESCE\(can_view, true\) = true/,
    "realtime de membro deve seguir a mesma regra de linha para conversa sem setor",
  );
  assert.match(
    storageSource,
    /attachAssignedMemberMetadata[\s\S]*assignedMemberName[\s\S]*getConversationsByConnectionId/,
    "lista principal deve devolver o nome do responsavel atribuido",
  );
});

test("kanban do monolito usa escopo de quadros acessiveis por membro", () => {
  const root = process.cwd();
  const httpSource = readFileSync(resolve(root, "api/http.ts"), "utf8");
  const routesSource = readFileSync(resolve(root, "server/routes.ts"), "utf8");
  const kanbanBoardsSource = readFileSync(resolve(root, "server/kanbanBoards.ts"), "utf8");

  assert.match(
    httpSource,
    /async function handleKanbanBoards[\s\S]*requireUserOrTeamMember/,
    "listagem de quadros do Kanban deve aceitar sessao de membro",
  );
  assert.match(
    httpSource,
    /async function handleKanbanStages[\s\S]*requireUserOrTeamMember/,
    "listagem de etapas do Kanban deve aceitar sessao de membro",
  );
  assert.match(
    httpSource,
    /listAccessibleKanbanBoards\(req\)/,
    "quadros do Kanban devem ser filtrados pelo helper de acesso compartilhado",
  );
  assert.match(
    httpSource,
    /resolveKanbanBoardForRequest\(req, requestedBoardId\)/,
    "etapas e cartoes devem resolver apenas Kanban acessivel ao ator",
  );
  assert.match(
    httpSource,
    /resolveKanbanMoveDestinationForRequest\(req, requestedBoardId, stageId\)/,
    "movimento no handler HTTP deve resolver o destino real da etapa",
  );
  assert.match(
    httpSource,
    /const ownerId = String\(resolvedBoard\?\.board\?\.owner_id \|\| user\.id\);[\s\S]*const params: unknown\[\] = \[ownerId, boardId\]/,
    "cards do Kanban devem consultar conversas pelo owner_id do quadro, nao pelo ator membro",
  );
  assert.match(
    httpSource,
    /assignedMemberName: repairWebOnlyOutgoingText\(row\.assignedMemberName\)/,
    "payload normalizado de conversa deve preservar o responsavel atribuido para a lista",
  );
  assert.match(
    httpSource,
    /resolvedBoard\.memberAccess\?\.canMoveCards === false/,
    "membro nao pode mover cartao em quadro sem permissao de movimento",
  );
  assert.match(
    routesSource,
    /async function getBoardKanbanStageIds\(boardId: string\): Promise<Set<string>> \{[\s\S]*pool\.query/,
    "runtime monolitico deve buscar etapas do Kanban pelo pool Postgres",
  );
  assert.match(
    routesSource,
    /app\.get\("\/api\/kanban\/stages"[\s\S]*SELECT \*, position AS "order"[\s\S]*FROM kanban_stages[\s\S]*resolvedBoard\.board\.owner_id/,
    "rota Express de etapas deve usar o board/owner autorizados",
  );
  assert.match(
    routesSource,
    /app\.put\("\/api\/kanban\/conversations\/:id\/move"[\s\S]*resolvedBoard\.memberAccess\?\.canMoveCards === false/,
    "runtime monolitico tambem deve negar movimento quando o quadro nao permite mover cartoes",
  );
  assert.match(
    routesSource,
    /resolveKanbanMoveDestinationForRequest\([\s\S]*parseKanbanBoardFilter\(req\.body\?\.boardId \?\? req\.query\.boardId\)[\s\S]*stageId/,
    "runtime monolitico deve usar o resolvedor compartilhado de destino do Kanban",
  );
  assert.match(
    kanbanBoardsSource,
    /resolveKanbanMoveDestinationForRequest[\s\S]*ks\.board_id = ANY\(\$2::text\[\]\)[\s\S]*kb\.owner_id = \$3::text/,
    "destino do Kanban deve validar a etapa somente em quadros acessiveis do owner/membro",
  );
});
