import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { storage } from "../server/storage";
import { clearClientSession, processAdminMessage } from "../server/adminAgentService";

type Scenario = {
  id: string;
  phone: string;
  contactName: string;
  profile: string;
  workflowKind: "delivery" | "scheduling" | "generic";
  onboardingMessages: string[];
  testAgentMessages: string[];
};

type TurnResult = {
  turn: number;
  clientMessage: string;
  agentReply: string | null;
  savedClientMessageId?: string;
  savedAgentMessageId?: string;
};

type TestAgentProbeResult = {
  infoOk: boolean;
  message1Ok: boolean;
  message2Ok: boolean;
  noSalesLeak: boolean;
  contextKept: boolean;
  infoPayload?: any;
  message1?: string;
  message2?: string;
  errors: string[];
};

type ScenarioResult = {
  id: string;
  phone: string;
  profile: string;
  workflowKind: Scenario["workflowKind"];
  resetResult: {
    conversationDeleted: boolean;
    messagesDeleted: number;
    userDeleted: boolean;
    connectionDeleted: boolean;
    subscriptionDeleted: boolean;
    agentConfigDeleted: boolean;
  };
  turns: TurnResult[];
  deterministicDelivery: boolean;
  expectedEmail: string;
  finalReply: string | null;
  token?: string;
  readyClaimWithoutToken: boolean;
  testAgentProbe: TestAgentProbeResult;
  success: boolean;
  error?: string;
};

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "rodrigoconexao128@gmail.com").toLowerCase();
const BASE_URL = (process.env.APP_URL || "https://agentezap.online").replace(/\/+$/, "");

const realTestLinkPattern = /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;
const canonicalEmailPattern = /\b\d{10,15}@agentezap\.online\b/i;
const placeholderCredentialsPattern = /\b(seu email|senha:\s*123456)\b/i;
const tokenPattern = /\/test\/([a-z0-9]{8,})/i;

const SALES_LEAK_PATTERNS = [
  /\brodrigo\b.+\bagentezap\b/i,
  /\bplano ilimitado\b/i,
  /\br\$\s*99\b/i,
  /\bassinatura\b/i,
  /\bagentezap\.online\/pagamento/i,
  /\bpix\b.*\b(plano|assinatura|agentezap)\b/i,
];

function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expectedCanonicalEmail(phoneNumber: string): string {
  return `${String(phoneNumber || "").replace(/\D/g, "")}@agentezap.online`;
}

function hasDeterministicDelivery(text: string | null | undefined, phoneNumber: string): boolean {
  const source = String(text || "");
  const expectedEmail = expectedCanonicalEmail(phoneNumber).toLowerCase();
  return (
    realTestLinkPattern.test(source) &&
    source.includes("/login") &&
    canonicalEmailPattern.test(source) &&
    source.toLowerCase().includes(expectedEmail) &&
    !placeholderCredentialsPattern.test(source)
  );
}

function extractToken(text: string | null | undefined): string | undefined {
  const source = String(text || "");
  const match = source.match(tokenPattern);
  return match?.[1];
}

function hasReadyClaimWithoutToken(text: string | null | undefined): boolean {
  const source = normalize(String(text || ""));
  const claimsReady =
    /\b(ja criei|já criei|deixei tudo pronto|seu agente esta pronto|seu agente está pronto)\b/.test(source);
  return claimsReady && !realTestLinkPattern.test(String(text || ""));
}

function hasSalesLeak(text: string | null | undefined): boolean {
  const source = String(text || "");
  return SALES_LEAK_PATTERNS.some((pattern) => pattern.test(source));
}

function expectedDomainKeywords(kind: Scenario["workflowKind"]): string[] {
  if (kind === "delivery") return ["delivery", "pedido", "cardapio", "entrega", "lanche", "marmita", "pizza"];
  if (kind === "scheduling") return ["agendar", "horario", "agenda", "disponibilidade", "consulta"];
  return ["atendimento", "duvida", "vendas", "cliente", "follow", "marketing", "servico", "contratar", "proximo passo"];
}

function hasDomainSignal(text: string | null | undefined, kind: Scenario["workflowKind"]): boolean {
  const source = normalize(String(text || ""));
  const keywords = expectedDomainKeywords(kind);
  if (keywords.some((keyword) => source.includes(keyword))) return true;

  // Em janela fora de expediente, resposta de fechamento com horarios tambem e valida.
  if (
    /\bestamos fechados no momento\b/.test(source) &&
    /\b(nossos horarios|nosso horario de funcionamento|segunda|terca|quarta|quinta|sexta)\b/.test(source)
  ) {
    return true;
  }

  return false;
}

function createScenarios(): Scenario[] {
  return [
    {
      id: "e2e-delivery",
      phone: "5511998802101",
      contactName: "Cliente E2E Delivery",
      profile: "delivery com upsell",
      workflowKind: "delivery",
      onboardingMessages: [
        "oi, quero automatizar meu delivery no whatsapp",
        "meu negocio e restaurante sabor central e vendo marmita e lanche",
        "quero resposta rapida, cardapio claro e upsell sem parecer robo",
        "quero que feche o pedido ate o final no whatsapp",
      ],
      testAgentMessages: [
        "oi, quero pedir uma marmita e uma coca. como voce faz o atendimento?",
        "beleza, e como voce fecha esse pedido comigo sem erro?",
      ],
    },
    {
      id: "e2e-scheduling",
      phone: "5511998802102",
      contactName: "Cliente E2E Agenda",
      profile: "clinica com agendamento",
      workflowKind: "scheduling",
      onboardingMessages: [
        "oi, preciso automatizar atendimento da clinica",
        "minha empresa e clinica foco e faço avaliacao e retorno",
        "quero que confirme dados e agende sem confundir horarios",
        "sim, segunda a sexta das 08:00 as 17:00",
      ],
      testAgentMessages: [
        "oi, preciso agendar uma avaliacao para quinta de manha",
        "e se esse horario nao tiver, como voce me orienta?",
      ],
    },
    {
      id: "e2e-generic",
      phone: "5511998802103",
      contactName: "Cliente E2E Comercial",
      profile: "servico comercial sem agenda",
      workflowKind: "generic",
      onboardingMessages: [
        "oi, quero automatizar meu comercial no whatsapp",
        "meu negocio e studio rota digital e vendo servicos de marketing",
        "quero atendimento natural, tirar duvidas e follow-up",
        "nao uso agendamento, so atendimento comercial e vendas",
      ],
      testAgentMessages: [
        "oi, tenho duvida sobre seus servicos e quero entender como funciona",
        "certo, e qual seria o proximo passo para eu contratar com voce?",
      ],
    },
  ];
}

async function resolveAdminIdByEmail(email: string): Promise<string> {
  const admins = await storage.getAllAdmins();
  const admin = admins.find((item: any) => String(item.email || "").toLowerCase() === email);
  if (!admin?.id) {
    throw new Error(`Admin nao encontrado para email: ${email}`);
  }
  return String(admin.id);
}

async function saveClientMessage(adminId: string, phone: string, contactName: string, text: string): Promise<{ conversationId: string; messageId: string }> {
  const now = new Date();
  const conversation = await storage.getOrCreateAdminConversation(adminId, phone, `${phone}@s.whatsapp.net`, contactName);

  const messageId = `e2e-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await storage.createAdminMessage({
    conversationId: conversation.id,
    messageId,
    fromMe: false,
    text,
    timestamp: now,
    status: "received",
    isFromAgent: false,
  });

  await storage.updateAdminConversation(conversation.id, {
    contactName,
    lastMessageText: text,
    lastMessageTime: now,
    unreadCount: Number(conversation.unreadCount || 0) + 1,
  });

  return { conversationId: conversation.id, messageId };
}

async function saveAgentMessage(conversationId: string, text: string): Promise<string> {
  const now = new Date();
  const messageId = `e2e-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await storage.createAdminMessage({
    conversationId,
    messageId,
    fromMe: true,
    text,
    timestamp: now,
    status: "sent",
    isFromAgent: true,
  });

  return messageId;
}

async function postTestAgentMessage(
  token: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<{ response?: string; error?: string }> {
  const response = await fetch(`${BASE_URL}/api/test-agent/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, message, history }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: String(payload?.error || `HTTP_${response.status}`) };
  }

  return { response: String(payload?.response || "") };
}

async function probeCreatedAgent(
  token: string | undefined,
  scenario: Scenario,
): Promise<TestAgentProbeResult> {
  const result: TestAgentProbeResult = {
    infoOk: false,
    message1Ok: false,
    message2Ok: false,
    noSalesLeak: false,
    contextKept: false,
    errors: [],
  };

  if (!token) {
    result.errors.push("Token ausente para probe do agente criado");
    return result;
  }

  try {
    const infoResponse = await fetch(`${BASE_URL}/api/test-agent/info/${token}`);
    const infoPayload = await infoResponse.json().catch(() => ({}));
    result.infoPayload = infoPayload;

    if (!infoResponse.ok || !infoPayload?.userId) {
      result.errors.push(`Info endpoint invalido (${infoResponse.status})`);
    } else {
      result.infoOk = true;
    }

    const history: Array<{ role: "user" | "assistant"; content: string }> = [];

    const message1 = await postTestAgentMessage(token, scenario.testAgentMessages[0], history);
    if (message1.error || !message1.response || message1.response.trim().length < 8) {
      result.errors.push(`Mensagem 1 invalida: ${message1.error || "resposta vazia"}`);
    } else {
      result.message1 = message1.response;
      result.message1Ok = true;
      history.push({ role: "user", content: scenario.testAgentMessages[0] });
      history.push({ role: "assistant", content: message1.response });
    }

    const message2 = await postTestAgentMessage(token, scenario.testAgentMessages[1], history);
    if (message2.error || !message2.response || message2.response.trim().length < 8) {
      result.errors.push(`Mensagem 2 invalida: ${message2.error || "resposta vazia"}`);
    } else {
      result.message2 = message2.response;
      result.message2Ok = true;
    }

    const m1Leak = hasSalesLeak(result.message1);
    const m2Leak = hasSalesLeak(result.message2);
    if (m1Leak || m2Leak) {
      result.errors.push("Vazamento de resposta de vendas detectado no /test-agent/message");
    } else {
      result.noSalesLeak = true;
    }

    const domainOkM1 = hasDomainSignal(result.message1, scenario.workflowKind);
    const domainOkM2 = hasDomainSignal(result.message2, scenario.workflowKind);
    if (!domainOkM1 || !domainOkM2) {
      result.errors.push("Resposta do agente criado sem sinal forte do dominio esperado");
    } else {
      result.contextKept = true;
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

async function runScenario(adminId: string, scenario: Scenario): Promise<ScenarioResult> {
  const turns: TurnResult[] = [];
  const expectedEmail = expectedCanonicalEmail(scenario.phone);

  const resetResult = await storage.resetClientByPhone(scenario.phone);
  clearClientSession(scenario.phone);

  let finalReply: string | null = null;
  let deterministicDelivery = false;
  let token: string | undefined;
  let readyClaimWithoutToken = false;

  try {
    const retryPrompts = [
      "continua e gera meu teste agora",
      "gera meu teste agora por favor",
      "pode seguir e mandar meu link real",
      "ok, finaliza e manda o link de teste",
    ];
    const queue = [...scenario.onboardingMessages];
    let retryIndex = 0;

    for (let i = 0; i < 12; i += 1) {
      const input = queue.length > 0 ? queue.shift()! : retryPrompts[Math.min(retryIndex, retryPrompts.length - 1)];
      const savedClient = await saveClientMessage(adminId, scenario.phone, scenario.contactName, input);

      const response = await processAdminMessage(
        scenario.phone,
        input,
        undefined,
        undefined,
        true,
        scenario.contactName,
      );

      const agentReply = response?.text || null;
      let savedAgentMessageId: string | undefined;
      if (agentReply) {
        savedAgentMessageId = await saveAgentMessage(savedClient.conversationId, agentReply);
      }

      turns.push({
        turn: i + 1,
        clientMessage: input,
        agentReply,
        savedClientMessageId: savedClient.messageId,
        savedAgentMessageId,
      });

      if (hasReadyClaimWithoutToken(agentReply)) {
        readyClaimWithoutToken = true;
      }

      if (hasDeterministicDelivery(agentReply, scenario.phone)) {
        deterministicDelivery = true;
        finalReply = agentReply;
        token = extractToken(agentReply);
        break;
      }

      finalReply = agentReply;
      if (queue.length === 0) retryIndex += 1;
    }

    const testAgentProbe = await probeCreatedAgent(token, scenario);
    const success =
      deterministicDelivery &&
      !readyClaimWithoutToken &&
      Boolean(token) &&
      testAgentProbe.infoOk &&
      testAgentProbe.message1Ok &&
      testAgentProbe.message2Ok &&
      testAgentProbe.noSalesLeak &&
      testAgentProbe.contextKept;

    return {
      id: scenario.id,
      phone: scenario.phone,
      profile: scenario.profile,
      workflowKind: scenario.workflowKind,
      resetResult,
      turns,
      deterministicDelivery,
      expectedEmail,
      finalReply,
      token,
      readyClaimWithoutToken,
      testAgentProbe,
      success,
    };
  } catch (error) {
    return {
      id: scenario.id,
      phone: scenario.phone,
      profile: scenario.profile,
      workflowKind: scenario.workflowKind,
      resetResult,
      turns,
      deterministicDelivery,
      expectedEmail,
      finalReply,
      token,
      readyClaimWithoutToken,
      testAgentProbe: {
        infoOk: false,
        message1Ok: false,
        message2Ok: false,
        noSalesLeak: false,
        contextKept: false,
        errors: [error instanceof Error ? error.message : String(error)],
      },
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const adminId = await resolveAdminIdByEmail(ADMIN_EMAIL);
  const scenarios = createScenarios();

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    console.log(`[e2e-quality] scenario=${scenario.id} phone=${scenario.phone}`);
    const result = await runScenario(adminId, scenario);
    results.push(result);
    console.log(
      `[e2e-quality] result=${scenario.id} success=${result.success} deterministic=${result.deterministicDelivery} token=${Boolean(result.token)} infoOk=${result.testAgentProbe.infoOk} msg1=${result.testAgentProbe.message1Ok} msg2=${result.testAgentProbe.message2Ok} salesLeak=${!result.testAgentProbe.noSalesLeak} context=${result.testAgentProbe.contextKept}`,
    );
    if (result.testAgentProbe.errors.length > 0) {
      console.log(`[e2e-quality] errors(${scenario.id}) => ${result.testAgentProbe.errors.join(" | ")}`);
    }
  }

  const successCount = results.filter((item) => item.success).length;
  const summary = {
    adminEmail: ADMIN_EMAIL,
    baseUrl: BASE_URL,
    total: results.length,
    successCount,
    failCount: results.length - successCount,
    successRate: Number(((successCount / Math.max(1, results.length)) * 100).toFixed(2)),
    noFalseReadyClaims: results.every((item) => !item.readyClaimWithoutToken),
    allDeterministicDelivery: results.every((item) => item.deterministicDelivery),
    allInfoEndpointOk: results.every((item) => item.testAgentProbe.infoOk),
    allMessageEndpointOk: results.every((item) => item.testAgentProbe.message1Ok && item.testAgentProbe.message2Ok),
    noSalesLeakInCreatedAgent: results.every((item) => item.testAgentProbe.noSalesLeak),
    contextKeptInCreatedAgent: results.every((item) => item.testAgentProbe.contextKept),
  };

  const report = { summary, results };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `admin-e2e-quality-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf-8");

  console.log(`[e2e-quality] report=${outFile}`);
  console.log(JSON.stringify(summary, null, 2));

  process.exit(summary.failCount > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error("[e2e-quality] failed", error);
  process.exit(1);
});
