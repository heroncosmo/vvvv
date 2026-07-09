import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assistantResponsePromisesHumanContinuation,
  buildHumanHandoffRoutingOverride,
} from "../routingHandoffPolicy";

test("detecta promessa de continuidade por humano na resposta do agente", () => {
  assert.equal(
    assistantResponsePromisesHumanContinuation(
      "Perfeito, já tenho os dados. Uma pessoa da equipe vai continuar o atendimento por aqui.",
    ),
    true,
  );

  assert.equal(
    assistantResponsePromisesHumanContinuation("Me passa o CEP para eu continuar o pedido."),
    false,
  );
});

test("alinha keep_current para setor human_only quando a resposta prometeu handoff", () => {
  const override = buildHumanHandoffRoutingOverride({
    responseText: "Pedido confirmado. Nossa equipe responsável dará continuidade ao atendimento.",
    currentRouting: {
      mode: "keep_current",
      targetSectorId: null,
      confidence: 0.21,
      intent: "keep_current",
      reason: "Continuar no fluxo atual.",
    },
    sectors: [
      {
        id: "setor-ia",
        name: "Atendimento IA",
        ai_handoff_mode: "copilot",
      },
      {
        id: "setor-fechamento",
        name: "Fechamento humano",
        description: "Humano assume o fechamento final do pedido.",
        ai_handoff_mode: "human_only",
      },
    ],
  });

  assert.equal(override?.mode, "route_to_sector");
  assert.equal(override?.targetSectorId, "setor-fechamento");
  assert.equal(override?.intent, "handoff_humano_prometido");
});

test("preserva roteamento existente e bloqueios operacionais", () => {
  const routeAlreadyChosen = buildHumanHandoffRoutingOverride({
    responseText: "Uma pessoa da equipe vai continuar.",
    currentRouting: {
      mode: "route_to_sector",
      targetSectorId: "setor-suporte",
      confidence: 0.7,
      intent: "suporte",
      reason: "Roteamento ja escolhido.",
    },
    sectors: [
      { id: "setor-fechamento", name: "Fechamento humano", ai_handoff_mode: "human_only" },
    ],
  });
  assert.equal(routeAlreadyChosen, null);

  const locked = buildHumanHandoffRoutingOverride({
    responseText: "Uma pessoa da equipe vai continuar.",
    sectors: [
      { id: "setor-fechamento", name: "Fechamento humano", ai_handoff_mode: "human_only" },
    ],
    canChangeSector: false,
  });
  assert.equal(locked, null);
});

test("nao inventa handoff quando nao existe setor human_only seguro", () => {
  const override = buildHumanHandoffRoutingOverride({
    responseText: "Uma pessoa da equipe vai continuar o atendimento.",
    sectors: [
      { id: "setor-ia", name: "Atendimento IA", ai_handoff_mode: "copilot" },
    ],
  });

  assert.equal(override, null);
});
