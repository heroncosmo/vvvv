import test from "node:test";
import assert from "node:assert/strict";
import {
  mapAdminSetupStatusToCustomerReply,
  normalizeAdminSetupPlan,
} from "../adminSetupRequestHelpers";

test("normalizeAdminSetupPlan aplica defaults coerentes e corrige tipos inválidos", () => {
  const normalized = normalizeAdminSetupPlan({
    workflowKind: "delivery",
    companyName: "Oficina Alpha",
    modules: ["crm", "", null, "kanban"],
    mediaSuggestions: [
      {
        name: "Boas-vindas",
        type: "audio",
        description: "Áudio inicial",
        whenToUse: "primeiro contato",
      },
      {
        name: "Resumo",
        type: "text",
        description: "Documento de resumo",
        whenToUse: "quando pedir detalhes",
      },
      {
        name: "",
        type: "video",
        description: "",
        whenToUse: "",
      },
    ],
    workDays: [1, "2", 9, -1],
  });

  assert.equal(normalized.workflowKind, "delivery");
  assert.equal(normalized.companyName, "Oficina Alpha");
  assert.deepEqual(normalized.modules, ["crm", "kanban"]);
  assert.equal(normalized.mediaSuggestions.length, 2);
  assert.equal(normalized.mediaSuggestions[0]?.type, "audio");
  assert.equal(normalized.mediaSuggestions[1]?.type, "document");
  assert.deepEqual(normalized.workDays, [1, 2]);
  assert.equal(normalized.agentNameSuggestion, "Atendente");
  assert.equal(normalized.usesScheduling, null);
});

test("mapAdminSetupStatusToCustomerReply mantém resposta curta por estágio", () => {
  const openReply = mapAdminSetupStatusToCustomerReply({
    status: "open",
  } as any);
  const executingReply = mapAdminSetupStatusToCustomerReply({
    status: "executing",
  } as any);
  const createdReply = mapAdminSetupStatusToCustomerReply({
    status: "created",
  } as any);

  assert.match(openReply, /pedido de configuração assistida/i);
  assert.match(executingReply, /finalizando a sua configuração/i);
  assert.match(createdReply, /ficou pronta/i);
});
