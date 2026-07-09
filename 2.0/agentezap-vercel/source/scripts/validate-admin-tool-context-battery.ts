import dotenv from "dotenv";
import { type PendingAction } from "../server/actionExecutorV2";
import {
  type PendingToolCallingMedia,
  type RecentToolCallingMedia,
} from "../server/adminAgentToolCalling";

dotenv.config({ path: ".env.runtime.local", override: true });
dotenv.config({ path: ".env.local", override: false });

type HistoryItem = { role: "user" | "assistant"; content: string };

type Scenario = {
  id: string;
  contactName: string;
  businessContext: string;
  details: string;
  correction: string;
};

type TurnResult = {
  input: string;
  reply: string;
  pendingType: string | null;
  created: boolean;
  askedConfirmation: boolean;
};

const scenarios: Scenario[] = [
  {
    id: "loja-calcados",
    contactName: "Rodrigo Cliente",
    businessContext: "Então eu quero, eu sou uma loja de calçado, né.",
    details:
      "A loja chama Passo Certo. Vendemos tênis, sandálias e sapato social. Quero que o agente pergunte tamanho, modelo, cor, forma de pagamento e se quer retirar ou entregar.",
    correction:
      "Pode criar, mas antes muda uma coisa: não quero que ele prometa entrega no mesmo dia, só confirma que a loja vai verificar.",
  },
  {
    id: "clinica-estetica",
    contactName: "Marina",
    businessContext: "Tenho uma clínica de estética e quero automatizar o WhatsApp.",
    details:
      "Minha clínica se chama Pele Viva. Fazemos limpeza de pele, botox e depilação. Quero que o agente tire dúvidas, explique cuidados e peça nome e melhor horário.",
    correction:
      "Pode criar sim, mas troca o tom para mais elegante e não fala preço sem eu passar antes.",
  },
  {
    id: "delivery-marmita",
    contactName: "Ana",
    businessContext: "Eu tenho um delivery de marmita e lanche.",
    details:
      "O nome é Sabor da Vila. Quero que o agente explique cardápio, pegue endereço, forma de pagamento, observações do pedido e ofereça bebida.",
    correction:
      "Pode montar, mas coloca também que domingo a gente atende só almoço.",
  },
  {
    id: "imobiliaria",
    contactName: "Fernando",
    businessContext: "Quero um agente para imobiliária, para responder lead de imóvel.",
    details:
      "A empresa é Prime Lar Imóveis. Quero que pergunte cidade, bairro, valor máximo, tipo de imóvel e se é compra ou aluguel antes de chamar corretor.",
    correction:
      "Pode fazer, mas na verdade não quero que agende visita sozinho, só passar para o corretor confirmar.",
  },
];

function hasCreatedSignal(text: string): boolean {
  const source = String(text || "").toLowerCase();
  return /\/test\/[a-z0-9]{8,}/i.test(source) || source.includes("agente foi criado") || source.includes("teste foi criado");
}

function asksForConfirmation(text: string): boolean {
  const source = String(text || "").toLowerCase();
  return source.includes("posso prosseguir") || source.includes("me confirma") || source.includes("confirma?");
}

function makePhone(index: number): string {
  const stamp = String(Date.now()).slice(-7);
  return `551199${stamp}${String(index).padStart(2, "0")}`.slice(0, 13);
}

async function runTurn(params: {
  phone: string;
  input: string;
  contactName: string;
  history: HistoryItem[];
  pendingAction?: PendingAction;
  userId?: string;
  agentConfig?: { name?: string; company?: string; role?: string; prompt?: string };
  mediaType?: string;
  mediaUrl?: string;
  pendingMedia?: PendingToolCallingMedia;
  recentMediaBuffer?: RecentToolCallingMedia[];
}): Promise<{ result: TurnResult; pendingAction?: PendingAction; history: HistoryItem[] }> {
  const { processToolCallingMessage } = await import("../server/adminAgentToolCalling");
  const nextHistory = [...params.history, { role: "user" as const, content: params.input }];
  const response = await processToolCallingMessage(
    params.phone,
    params.input,
    params.userId,
    params.history,
    params.pendingAction,
    params.agentConfig,
    params.contactName,
    params.mediaType,
    params.mediaUrl,
    undefined,
    params.pendingMedia,
    params.recentMediaBuffer,
  );
  const reply = String(response.responseText || "").trim();
  if (reply) {
    nextHistory.push({ role: "assistant", content: reply });
  }
  return {
    result: {
      input: params.input,
      reply,
      pendingType: response.newPendingAction?.type || null,
      created: hasCreatedSignal(reply),
      askedConfirmation: asksForConfirmation(reply),
    },
    pendingAction: response.newPendingAction,
    history: nextHistory,
  };
}

async function cleanup(phone: string): Promise<void> {
  const { clearClientSession } = await import("../server/adminAgentService");
  const { storage } = await import("../server/storage");
  clearClientSession(phone);
  try {
    await storage.resetClientByPhone(phone);
  } catch {
    // Test cleanup is best-effort; failures are reported by the caller if state leaks into assertions.
  }
}

async function runScenario(scenario: Scenario, index: number) {
  const phone = makePhone(index);
  await cleanup(phone);
  const turns: TurnResult[] = [];
  let history: HistoryItem[] = [];
  let pendingAction: PendingAction | undefined;

  try {
    let turn = await runTurn({
      phone,
      input: "Oi, quero entender como funciona para criar um agente no WhatsApp.",
      contactName: scenario.contactName,
      history,
    });
    turns.push(turn.result);
    history = turn.history;
    pendingAction = turn.pendingAction;

    turn = await runTurn({
      phone,
      input: scenario.businessContext,
      contactName: scenario.contactName,
      history,
      pendingAction,
    });
    turns.push(turn.result);
    history = turn.history;
    pendingAction = turn.pendingAction;

    turn = await runTurn({
      phone,
      input: scenario.details,
      contactName: scenario.contactName,
      history,
      pendingAction,
    });
    turns.push(turn.result);
    history = turn.history;
    pendingAction = turn.pendingAction;

    const pendingBeforeCorrection = pendingAction?.type || null;
    turn = await runTurn({
      phone,
      input: scenario.correction,
      contactName: scenario.contactName,
      history,
      pendingAction,
    });
    turns.push(turn.result);
    history = turn.history;
    pendingAction = turn.pendingAction;

    const correctionDidNotCreate = !turn.result.created;
    const stillPendingAfterCorrection = Boolean(turn.pendingAction);

    turn = await runTurn({
      phone,
      input: "Agora sim, confirmo. Pode criar.",
      contactName: scenario.contactName,
      history,
      pendingAction,
    });
    turns.push(turn.result);

    const success = Boolean(
      pendingBeforeCorrection === "criar_agente" &&
        correctionDidNotCreate &&
        stillPendingAfterCorrection &&
        turn.result.created,
    );

    return {
      scenario: scenario.id,
      phone,
      success,
      pendingBeforeCorrection,
      correctionDidNotCreate,
      stillPendingAfterCorrection,
      finalCreated: turn.result.created,
      turns,
    };
  } finally {
    await cleanup(phone);
  }
}

async function main() {
  const startedAt = Date.now();
  const results = [];
  for (let i = 0; i < scenarios.length; i += 1) {
    results.push(await runScenario(scenarios[i], i + 1));
  }
  const summary = {
    success: results.every((item) => item.success),
    durationMs: Date.now() - startedAt,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.success) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
