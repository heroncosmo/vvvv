import assert from "node:assert/strict";
import test from "node:test";

const RODRIGO_EMAIL = "rodrigo4@gmail.com";

type AgenteZapLiveCliActionType =
  | "reply_text"
  | "confirm_pending_action"
  | "cancel_pending_action"
  | "keep_pending_action"
  | "ask_business_context"
  | "summarize_before_create_agent"
  | "prepare_create_agent"
  | "revise_agent_summary"
  | "prepare_prompt_edit"
  | "prepare_save_media"
  | "approve_payment_from_visual_receipt"
  | "request_simulator_test"
  | "prepare_connection_link"
  | "prepare_payment_link"
  | "send_media"
  | "route_sector"
  | "schedule_followup"
  | "handoff_human"
  | "no_send";

type AgenteZapLiveCliScope =
  | "tenant_customer_support"
  | "rodrigo_agent_creator"
  | "rodrigo_existing_account_support"
  | "personalize_prompt"
  | "simulator_validation";

type MatrixScenario = {
  id: string;
  scope: AgenteZapLiveCliScope;
  ownerEmail?: string;
  currentMessage: string;
  pendingAction?: {
    type: string;
    proposedText: string;
    payload?: Record<string, unknown>;
    expiresAt?: number;
    isExpired?: boolean;
  };
  candidate: Record<string, unknown>;
  expectedActions: AgenteZapLiveCliActionType[];
  forbiddenActions?: AgenteZapLiveCliActionType[];
  expectedDecision?: string;
  expectedViolations?: string[];
};

function actionTypes(
  sanitizeAgenteZapLiveCliPlan: (
    candidate: unknown,
    params: { scope: AgenteZapLiveCliScope; ownerEmail?: string },
  ) => {
    plan: { decision: string; actions: Array<{ type: AgenteZapLiveCliActionType }> };
    violations: string[];
  },
  candidate: Record<string, unknown>,
  scenario: MatrixScenario,
) {
  const { plan, violations } = sanitizeAgenteZapLiveCliPlan(candidate, {
    scope: scenario.scope,
    ownerEmail: scenario.ownerEmail,
  });
  return {
    plan,
    violations,
    types: plan.actions.map((action) => action.type),
  };
}

const pendingCreate = {
  type: "criar_agente",
  proposedText:
    "Antes de criar, confirma se ficou assim: empresa Passo Certo, loja de calcados, agente pergunta tamanho, modelo, cor, pagamento e entrega.",
  payload: {
    nomeEmpresa: "Passo Certo",
    ramoAtuacao: "loja de calcados",
    descricaoAtendimento: "perguntar tamanho, modelo, cor, pagamento e entrega",
  },
  expiresAt: Date.now() + 60 * 60 * 1000,
};

const scenarios: MatrixScenario[] = [
  {
    id: "shoe_store_audio_context_summarizes_before_create",
    scope: "rodrigo_agent_creator",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "entao eu quero eu sou uma loja de calcado ne, vendo tenis e chinelo no WhatsApp",
    candidate: {
      decision: "propose_action",
      confidence: 0.86,
      customerFacingMessages: ["Entendi. Vou resumir seu atendimento antes de criar o teste."],
      actions: [
        {
          type: "summarize_before_create_agent",
          requiresConfirmation: true,
          arguments: {
            nomeEmpresa: "loja de calcados",
            ramoAtuacao: "calcados",
            descricaoAtendimento: "atender clientes de tenis e chinelos no WhatsApp",
          },
        },
      ],
      evidence: { contextUsed: ["mensagem atual", "historico recente"] },
    },
    expectedActions: ["summarize_before_create_agent"],
    forbiddenActions: ["confirm_pending_action"],
    expectedDecision: "propose_action",
  },
  {
    id: "clinic_missing_details_asks_context",
    scope: "rodrigo_agent_creator",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Tenho uma clinica e queria automatizar o atendimento.",
    candidate: {
      decision: "ask_more_context",
      confidence: 0.72,
      customerFacingMessages: ["Me manda o nome da clinica, especialidades, horarios e como agenda hoje."],
      actions: [{ type: "ask_business_context" }],
      evidence: { contextUsed: ["mensagem atual"] },
    },
    expectedActions: ["ask_business_context"],
    expectedDecision: "ask_more_context",
  },
  {
    id: "delivery_complete_brief_summarizes",
    scope: "rodrigo_agent_creator",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Meu delivery vende marmita, aceita pix e entrega nos bairros Centro e Vila Nova.",
    candidate: {
      decision: "propose_action",
      confidence: 0.8,
      customerFacingMessages: ["Perfeito. Vou confirmar o resumo do agente antes de criar."],
      actions: [
        {
          type: "summarize_before_create_agent",
          requiresConfirmation: true,
          arguments: {
            nomeEmpresa: "delivery de marmita",
            ramoAtuacao: "delivery",
            descricaoAtendimento: "mostrar cardapio, confirmar pix e entrega por bairro",
          },
        },
      ],
      evidence: { contextUsed: ["mensagem atual"] },
    },
    expectedActions: ["summarize_before_create_agent"],
  },
  {
    id: "clean_pending_confirmation_executes_existing_pending",
    scope: "rodrigo_agent_creator",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Isso mesmo, pode criar.",
    pendingAction: pendingCreate,
    candidate: {
      decision: "propose_action",
      confidence: 0.92,
      customerFacingMessages: ["Perfeito, vou criar com esse resumo."],
      actions: [{ type: "confirm_pending_action" }],
      evidence: { contextUsed: ["pendingAction", "mensagem atual"] },
    },
    expectedActions: ["confirm_pending_action"],
  },
  {
    id: "mixed_confirmation_with_change_revises_instead_of_execute",
    scope: "rodrigo_agent_creator",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Pode criar, mas antes muda uma coisa: nao promete entrega no mesmo dia.",
    pendingAction: pendingCreate,
    candidate: {
      decision: "propose_action",
      confidence: 0.88,
      customerFacingMessages: ["Entendi o ajuste. Vou atualizar o resumo e pedir sua confirmacao de novo."],
      actions: [
        {
          type: "revise_agent_summary",
          requiresConfirmation: true,
          arguments: {
            descricaoAtendimento: "nao prometer entrega no mesmo dia; avisar que a loja vai verificar",
          },
        },
      ],
      evidence: { contextUsed: ["pendingAction", "mensagem atual"] },
    },
    expectedActions: ["revise_agent_summary"],
    forbiddenActions: ["confirm_pending_action"],
  },
  {
    id: "pending_cancel_clears_action",
    scope: "rodrigo_agent_creator",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Cancela isso, ainda nao quero criar.",
    pendingAction: pendingCreate,
    candidate: {
      decision: "respond",
      confidence: 0.9,
      customerFacingMessages: ["Beleza, nao vou criar agora."],
      actions: [{ type: "cancel_pending_action" }],
      evidence: { contextUsed: ["pendingAction", "mensagem atual"] },
    },
    expectedActions: ["cancel_pending_action"],
  },
  {
    id: "existing_rodrigo_account_can_prepare_prompt_edit",
    scope: "rodrigo_existing_account_support",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "No meu agente atual, muda para ele perguntar cidade antes de passar preco.",
    candidate: {
      decision: "propose_action",
      confidence: 0.84,
      customerFacingMessages: ["Vou preparar essa alteracao para voce confirmar."],
      actions: [
        {
          type: "prepare_prompt_edit",
          requiresConfirmation: true,
          arguments: { descricaoMudanca: "perguntar cidade antes de passar preco" },
        },
      ],
      evidence: { contextUsed: ["prompt do tenant", "mensagem atual"] },
    },
    expectedActions: ["prepare_prompt_edit"],
  },
  {
    id: "existing_rodrigo_account_can_update_agent_demo",
    scope: "rodrigo_existing_account_support",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Quero testar de novo, agora cria para meu escritorio contabil perguntando CNPJ, regime tributario e cidade.",
    candidate: {
      decision: "propose_action",
      confidence: 0.86,
      customerFacingMessages: ["Entendi. Vou confirmar o novo resumo antes de atualizar seu agente de teste."],
      actions: [
        {
          type: "summarize_before_create_agent",
          requiresConfirmation: true,
          arguments: {
            nomeEmpresa: "escritorio contabil",
            ramoAtuacao: "contabilidade",
            descricaoAtendimento: "perguntar CNPJ, regime tributario e cidade",
          },
        },
      ],
      evidence: { contextUsed: ["conta vinculada", "mensagem atual"] },
    },
    expectedActions: ["summarize_before_create_agent"],
  },
  {
    id: "tenant_customer_cannot_receive_rodrigo_create_action",
    scope: "tenant_customer_support",
    ownerEmail: "cliente@example.com",
    currentMessage: "Cria um agente novo para mim.",
    candidate: {
      decision: "propose_action",
      confidence: 0.7,
      customerFacingMessages: ["Vou criar o agente."],
      actions: [{ type: "prepare_create_agent", arguments: { nomeEmpresa: "Tenant" } }],
      evidence: { contextUsed: ["mensagem atual"] },
    },
    expectedActions: [],
    expectedViolations: ["rodrigo_only_action_blocked:prepare_create_agent"],
  },
  {
    id: "existing_rodrigo_account_can_approve_visual_receipt",
    scope: "rodrigo_existing_account_support",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Segue o comprovante pago hoje.",
    candidate: {
      decision: "propose_action",
      confidence: 0.84,
      customerFacingMessages: ["Recebi o comprovante e vou validar a liberacao do plano por aqui."],
      actions: [
        {
          type: "approve_payment_from_visual_receipt",
          requiresConfirmation: false,
          reason: "currentMediaEvidence indica comprovante pago com valor e data visiveis",
          arguments: {
            valorPago: "99,90",
            dataPagamento: "08/07/2026",
            statusComprovante: "pago",
            recebedor: "Maria Fernandes de Bessa Macedo",
            instituicaoRecebedor: "Nu Pagamentos",
            subscriptionId: "sub_123",
            evidenceSummary: "Comprovante Pix pago, valor R$ 99,90, data 08/07/2026.",
          },
        },
      ],
      evidence: { contextUsed: ["currentMediaEvidence", "assinatura vinculada"] },
    },
    expectedActions: ["approve_payment_from_visual_receipt"],
  },
  {
    id: "tenant_customer_cannot_approve_rodrigo_visual_receipt",
    scope: "tenant_customer_support",
    ownerEmail: "cliente@example.com",
    currentMessage: "Segue comprovante pago.",
    candidate: {
      decision: "propose_action",
      confidence: 0.8,
      customerFacingMessages: ["Vou liberar seu plano."],
      actions: [
        {
          type: "approve_payment_from_visual_receipt",
          requiresConfirmation: false,
          arguments: {
            valorPago: "99,90",
            dataPagamento: "08/07/2026",
            statusComprovante: "pago",
            recebedor: "Maria Fernandes de Bessa Macedo",
            instituicaoRecebedor: "Nu Pagamentos",
            subscriptionId: "sub_123",
          },
        },
      ],
      evidence: { contextUsed: ["mensagem atual"] },
    },
    expectedActions: [],
    expectedViolations: ["rodrigo_only_action_blocked:approve_payment_from_visual_receipt"],
  },
  {
    id: "simulator_validation_can_request_simulator_test",
    scope: "simulator_validation",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Teste como o agente responde quando o cliente pede valor.",
    candidate: {
      decision: "propose_action",
      confidence: 0.78,
      customerFacingMessages: ["Vou validar esse teste no simulador."],
      actions: [{ type: "request_simulator_test" }],
      evidence: { contextUsed: ["simulador", "mensagem atual"] },
    },
    expectedActions: ["request_simulator_test"],
  },
  {
    id: "normal_price_question_stays_text_only",
    scope: "rodrigo_agent_creator",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Quanto custa depois do teste?",
    candidate: {
      decision: "respond",
      confidence: 0.75,
      customerFacingMessages: ["Voce pode testar primeiro; depois eu te explico o plano que fizer sentido."],
      actions: [{ type: "reply_text" }],
      evidence: { contextUsed: ["mensagem atual"] },
    },
    expectedActions: ["reply_text"],
    forbiddenActions: ["prepare_create_agent", "confirm_pending_action"],
  },
  {
    id: "existing_rodrigo_account_can_prepare_connection_link",
    scope: "rodrigo_existing_account_support",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Me manda o link para conectar o WhatsApp.",
    candidate: {
      decision: "propose_action",
      confidence: 0.81,
      customerFacingMessages: ["Vou gerar o link de conexao."],
      actions: [{ type: "prepare_connection_link" }],
      evidence: { contextUsed: ["conta existente", "mensagem atual"] },
    },
    expectedActions: ["prepare_connection_link"],
  },
  {
    id: "existing_rodrigo_account_can_prepare_payment_link",
    scope: "rodrigo_existing_account_support",
    ownerEmail: RODRIGO_EMAIL,
    currentMessage: "Onde eu pago para continuar?",
    candidate: {
      decision: "propose_action",
      confidence: 0.8,
      customerFacingMessages: ["Vou te enviar a rota certa dos planos."],
      actions: [{ type: "prepare_payment_link" }],
      evidence: { contextUsed: ["conta existente", "mensagem atual"] },
    },
    expectedActions: ["prepare_payment_link"],
  },
];

test("AgenteZap live CLI scenario matrix keeps sensitive decisions in structured actions", async () => {
  process.env.DATABASE_URL ||= "postgres://postgres:postgres@127.0.0.1:5432/postgres";
  process.env.ENABLE_RUNTIME_AUTO_MIGRATIONS = "0";
  process.env.RUN_RUNTIME_AUTO_MIGRATIONS = "0";
  const {
    AGENTEZAP_LIVE_CLI_SCHEMA_VERSION,
    buildAgenteZapLiveCliPrompt,
    sanitizeAgenteZapLiveCliPlan,
  } = await import("../agenteZapLiveCliRuntime");

  for (const scenario of scenarios) {
    const prompt = buildAgenteZapLiveCliPrompt({
      scope: scenario.scope,
      ownerEmail: scenario.ownerEmail,
      currentMessage: scenario.currentMessage,
      messageCount: 18,
      pendingAction: scenario.pendingAction,
    });

    assert.ok(prompt.includes(AGENTEZAP_LIVE_CLI_SCHEMA_VERSION), scenario.id);
    assert.ok(prompt.includes("Nao execute efeito externo direto"), scenario.id);
    assert.ok(prompt.includes("O Codex decide em JSON; o executor SaaS aplica"), scenario.id);
    assert.ok(prompt.includes(scenario.currentMessage), scenario.id);
    if (scenario.scope === "rodrigo_agent_creator" && scenario.ownerEmail === RODRIGO_EMAIL) {
      assert.ok(prompt.includes("Contrato Rodrigo/agente novo"), scenario.id);
      assert.ok(prompt.includes("prompt/config do tenant"), scenario.id);
      assert.ok(prompt.includes("Identidade, tom, oferta, ordem de perguntas"), scenario.id);
      assert.ok(prompt.includes("Se a conversa ja trouxe dados do negocio"), scenario.id);
      assert.ok(prompt.includes("approve_payment_from_visual_receipt"), scenario.id);
      assert.ok(prompt.includes("midia atual tiver evidencia visual/OCR/PDF suficiente"), scenario.id);
      assert.ok(prompt.includes("arguments.subscriptionId"), scenario.id);
      assert.ok(prompt.includes("arguments.recebedor"), scenario.id);
      assert.ok(prompt.includes("arguments.instituicaoRecebedor"), scenario.id);
      assert.ok(prompt.includes("sem currentMediaEvidence ok"), scenario.id);
      assert.ok(prompt.includes("O executor de pagamento pausara follow-up e filas abertas como side effect auditavel"), scenario.id);
      assert.ok(!prompt.includes("caminho padrao e assistido pelo WhatsApp"), scenario.id);
      assert.ok(!prompt.includes("Nao jogue o cliente para site"), scenario.id);
    }
    if (scenario.scope === "tenant_customer_support") {
      assert.ok(prompt.includes("Contrato tenant normal"), scenario.id);
      assert.ok(prompt.includes("Nao ofereca capacidades internas do Rodrigo"), scenario.id);
    }
    if (scenario.scope === "rodrigo_existing_account_support" && scenario.ownerEmail === RODRIGO_EMAIL) {
      assert.ok(prompt.includes("Contrato Rodrigo/conta vinculada"), scenario.id);
      assert.ok(prompt.includes("criar, atualizar, editar, testar"), scenario.id);
      assert.ok(prompt.includes("Nao trate conta vinculada como motivo para mandar o cliente criar conta no site"), scenario.id);
      assert.ok(prompt.includes("approve_payment_from_visual_receipt"), scenario.id);
      assert.ok(prompt.includes("midia atual tiver evidencia visual/OCR/PDF suficiente"), scenario.id);
      assert.ok(prompt.includes("arguments.subscriptionId"), scenario.id);
      assert.ok(prompt.includes("arguments.recebedor"), scenario.id);
      assert.ok(prompt.includes("arguments.instituicaoRecebedor"), scenario.id);
      assert.ok(prompt.includes("sem currentMediaEvidence ok"), scenario.id);
      assert.ok(prompt.includes("O executor de pagamento pausara follow-up e filas abertas como side effect auditavel"), scenario.id);
    }
    if (scenario.pendingAction) {
      assert.ok(prompt.includes("pendingAction atual"), scenario.id);
      assert.ok(prompt.includes(scenario.pendingAction.proposedText), scenario.id);
      assert.ok(prompt.includes("Nunca trate uma confirmacao misturada com correcao como confirm_pending_action"), scenario.id);
    }

    const { plan, violations, types } = actionTypes(sanitizeAgenteZapLiveCliPlan, scenario.candidate, scenario);

    assert.deepEqual(types, scenario.expectedActions, scenario.id);
    if (scenario.expectedDecision) {
      assert.equal(plan.decision, scenario.expectedDecision, scenario.id);
    }
    for (const forbidden of scenario.forbiddenActions || []) {
      assert.equal(types.includes(forbidden), false, `${scenario.id} must not include ${forbidden}`);
    }
    for (const expectedViolation of scenario.expectedViolations || []) {
      assert.ok(violations.includes(expectedViolation), `${scenario.id} missing violation ${expectedViolation}`);
    }
  }
});
