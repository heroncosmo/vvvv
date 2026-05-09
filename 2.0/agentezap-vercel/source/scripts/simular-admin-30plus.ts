import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  clearClientSession,
  getClientSession,
  getTestToken,
  processAdminMessage,
} from "../server/adminAgentService";
import { storage } from "../server/storage";

type WorkflowKind = "delivery" | "scheduling" | "salon" | "generic";

type Scenario = {
  id: string;
  phone: string;
  contactName: string;
  profile: string;
  workflowKind: WorkflowKind;
  onboardingMessages: string[];
  probeMessages: [string, string];
  expectedPanelPath?: string | string[];
  requiresPixFlow?: boolean;
  requiresDemoAssets?: boolean;
  maxTurns?: number;
};

type TurnResult = {
  turn: number;
  clientMessage: string;
  agentReply: string | null;
  savedClientMessageId?: string;
  savedAgentMessageId?: string;
};

type ValidationItem = {
  id: string;
  ok: boolean;
  details?: string;
};

type ProbeResult = {
  infoOk: boolean;
  message1Ok: boolean;
  message2Ok: boolean;
  noSalesLeak: boolean;
  contextKept: boolean;
  message1Text?: string;
  message2Text?: string;
  errors: string[];
};

type ScenarioResult = {
  id: string;
  phone: string;
  profile: string;
  workflowKind: WorkflowKind;
  resetResult: {
    conversationDeleted: boolean;
    messagesDeleted: number;
    userDeleted: boolean;
    connectionDeleted: boolean;
    subscriptionDeleted: boolean;
    agentConfigDeleted: boolean;
  };
  turns: TurnResult[];
  token?: string;
  expectedEmail: string;
  deterministicDelivery: boolean;
  credentialsActionObserved: boolean;
  readyClaimWithoutToken: boolean;
  panelPathOk: boolean;
  hasDemoScreenshot: boolean;
  hasDemoVideo: boolean;
  pixPayloadDetected: boolean;
  awaitingPaymentProof: boolean;
  reaskEvents: number;
  probe: ProbeResult;
  validations: ValidationItem[];
  success: boolean;
  error?: string;
};

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "rodrigoconexao128@gmail.com").toLowerCase();
const BASE_URL = (process.env.APP_URL || "https://agentezap.online").replace(/\/+$/, "");

const PIX_COPY_PASTE =
  "00020101021126360014br.gov.bcb.pix0114+5517981465183520400005303986540599.995802BR5914RODRIGO MACEDO6009COSMORAMA622905257C07EAC7D06B485DACDC9D83A6304D87D";
const PIX_KEY = "17981465183";
const PIX_OWNER = "maria fernandes";
const PIX_BANK = "nubank";

const realTestLinkPattern = /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;
const tokenPattern = /\/test\/([a-z0-9]{8,})/i;
const canonicalEmailPattern = /\b\d{10,15}@agentezap\.online\b/i;
const placeholderCredentialsPattern = /\b(seu email|senha:\s*123456)\b/i;

const SALES_LEAK_PATTERNS = [
  /\brodrigo\b.+\bagentezap\b/i,
  /\br\$\s*99\b/i,
  /\bagentezap\.online\/pagamento/i,
  /\bplano ilimitado\b/i,
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
  const hasReadyClaim =
    /\b(seu agente ja esta pronto|seu agente esta pronto|prontinho|ja criei|deixei tudo pronto)\b/.test(source);
  return hasReadyClaim && !realTestLinkPattern.test(String(text || ""));
}

function hasPixPayload(text: string | null | undefined): boolean {
  const source = normalize(String(text || ""));
  return (
    source.includes(normalize(PIX_COPY_PASTE)) ||
    source.includes(normalize(PIX_KEY)) ||
    (source.includes(PIX_OWNER) && source.includes(PIX_BANK))
  );
}

function looksLikeBusinessAnswer(text: string): boolean {
  const n = normalize(text);
  if (
    /\b(meu negocio e|minha empresa e|minha loja e|sou da|sou do|sou de|somos a|somos o|somos da|somos do|somos de|nos somos|nome da empresa)\b/.test(
      n,
    )
  ) {
    return true;
  }

  if (/\b(nos vendemos|a gente vende|nossa empresa e|nosso negocio e)\b/.test(n)) {
    return true;
  }

  if (/\b(eu vendo|trabalho com)\b/.test(n) && n.split(" ").length >= 5) {
    return true;
  }

  if (
    /\b(tenho uma|tenho um)\b/.test(n) &&
    /\b(restaurante|barbearia|clinica|salao|delivery|consultoria|loja|studio|agencia|petshop|ecommerce)\b/.test(n) &&
    !/\b(quero|preciso|automatizar|entender|funciona)\b/.test(n)
  ) {
    return true;
  }

  return false;
}

function looksLikeBehaviorAnswer(text: string): boolean {
  const n = normalize(text);
  return /\b(quero que|preciso que|responda|atenda|faca|fa[cç]a|follow up|follow-up|natural|tirar duvida|tirar duvidas|cobrar)\b/.test(
    n,
  );
}

function looksLikeWorkflowAnswer(text: string): boolean {
  const n = normalize(text);
  return /\b(agendamento|nao uso agendamento|segunda|terca|quarta|quinta|sexta|sabado|domingo|pedido completo|fechar pedido)\b/.test(n);
}

function asksBusinessQuestion(text: string): boolean {
  const n = normalize(text);
  return (
    n.includes("nome do seu negocio") ||
    n.includes("qual e o nome do seu negocio") ||
    n.includes("me conta sobre o seu negocio")
  );
}

function asksBehaviorQuestion(text: string): boolean {
  const n = normalize(text);
  return n.includes("como voce quer que esse agente") || n.includes("agora me explica melhor");
}

function asksWorkflowQuestion(text: string): boolean {
  const n = normalize(text);
  return (
    n.includes("vai usar agendamento") ||
    n.includes("quer follow up automatico") ||
    n.includes("fechar o pedido ate o final")
  );
}

function countReaskEvents(turns: TurnResult[]): number {
  let businessProvided = false;
  let behaviorProvided = false;
  let workflowProvided = false;
  let reaskEvents = 0;

  for (const turn of turns) {
    const client = String(turn.clientMessage || "");
    const agent = String(turn.agentReply || "");

    if (looksLikeBusinessAnswer(client)) businessProvided = true;
    if (looksLikeBehaviorAnswer(client)) behaviorProvided = true;
    if (looksLikeWorkflowAnswer(client)) workflowProvided = true;

    if (businessProvided && asksBusinessQuestion(agent)) reaskEvents += 1;
    if (behaviorProvided && asksBehaviorQuestion(agent)) reaskEvents += 1;
    if (workflowProvided && asksWorkflowQuestion(agent)) reaskEvents += 1;
  }

  return reaskEvents;
}

function expectedDomainKeywords(kind: WorkflowKind): string[] {
  if (kind === "delivery") return ["pedido", "cardapio", "entrega", "lanche", "marmita", "adicional"];
  if (kind === "scheduling") return ["agendar", "horario", "agenda", "disponivel", "consulta", "avaliacao"];
  if (kind === "salon") return ["corte", "barba", "salao", "barbearia", "horario", "agenda"];
  return ["atendimento", "duvida", "vendas", "cliente", "servico", "follow"];
}

function hasDomainSignal(text: string | null | undefined, kind: WorkflowKind): boolean {
  const source = normalize(String(text || ""));
  if (source.includes("estamos fechados no momento") && source.includes("horario")) {
    return true;
  }
  const keywords = expectedDomainKeywords(kind);
  return keywords.some((keyword) => source.includes(keyword));
}

function extractMeaningfulTokens(text: string): string[] {
  const stopwords = new Set([
    "oi",
    "ola",
    "bom",
    "boa",
    "tudo",
    "como",
    "quero",
    "preciso",
    "sobre",
    "com",
    "para",
    "pra",
    "voces",
    "vocês",
    "voce",
    "você",
    "falar",
    "me",
    "eu",
    "de",
    "do",
    "da",
    "das",
    "dos",
    "um",
    "uma",
    "seria",
    "qual",
    "quais",
    "isso",
    "esse",
    "essa",
    "agora",
    "depois",
    "entao",
    "então",
  ]);

  return normalize(text)
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !stopwords.has(token));
}

function hasProbeOverlap(response: string, probes: [string, string]): boolean {
  const normalizedResponse = normalize(response);
  const tokens = [...extractMeaningfulTokens(probes[0]), ...extractMeaningfulTokens(probes[1])];
  if (tokens.length === 0) return false;
  return tokens.some((token) => normalizedResponse.includes(token));
}

async function resolveAdminIdByEmail(email: string): Promise<string> {
  const admins = await storage.getAllAdmins();
  const admin = admins.find((item: any) => String(item.email || "").toLowerCase() === email);
  if (!admin?.id) {
    throw new Error(`Admin nao encontrado para email: ${email}`);
  }
  return String(admin.id);
}

async function saveClientMessage(
  adminId: string,
  phone: string,
  contactName: string,
  text: string,
): Promise<{ conversationId: string; messageId: string }> {
  const now = new Date();
  const conversation = await storage.getOrCreateAdminConversation(
    adminId,
    phone,
    `${phone}@s.whatsapp.net`,
    contactName,
  );

  const messageId = `stress-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const messageId = `stress-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    return { error: String((payload as any)?.error || `HTTP_${response.status}`) };
  }

  return { response: String((payload as any)?.response || "") };
}

async function probeCreatedAgent(
  token: string | undefined,
  scenario: Scenario,
  expectedUserId?: string,
): Promise<ProbeResult> {
  const result: ProbeResult = {
    infoOk: false,
    message1Ok: false,
    message2Ok: false,
    noSalesLeak: false,
    contextKept: false,
    message1Text: undefined,
    message2Text: undefined,
    errors: [],
  };

  if (!token) {
    result.errors.push("Token ausente para probe do agente criado");
    return result;
  }

  try {
    const infoResponse = await fetch(`${BASE_URL}/api/test-agent/info/${token}`);
    const infoPayload = await infoResponse.json().catch(() => ({}));

    if (!infoResponse.ok || !(infoPayload as any)?.userId) {
      result.errors.push(`Info endpoint invalido (${infoResponse.status})`);
    } else if (expectedUserId && String((infoPayload as any).userId) !== String(expectedUserId)) {
      result.errors.push("Info endpoint com userId divergente do usuario vinculado");
    } else {
      result.infoOk = true;
    }

    const history: Array<{ role: "user" | "assistant"; content: string }> = [];

    const message1 = await postTestAgentMessage(token, scenario.probeMessages[0], history);
    if (message1.error || !message1.response || message1.response.trim().length < 8) {
      result.errors.push(`Mensagem 1 invalida: ${message1.error || "resposta vazia"}`);
    } else {
      result.message1Ok = true;
      result.message1Text = message1.response;
      history.push({ role: "user", content: scenario.probeMessages[0] });
      history.push({ role: "assistant", content: message1.response });
    }

    const message2 = await postTestAgentMessage(token, scenario.probeMessages[1], history);
    if (message2.error || !message2.response || message2.response.trim().length < 8) {
      result.errors.push(`Mensagem 2 invalida: ${message2.error || "resposta vazia"}`);
    } else {
      result.message2Ok = true;
      result.message2Text = message2.response;
    }

    const m1Text = message1.response || "";
    const m2Text = message2.response || "";

    const m1Leak = SALES_LEAK_PATTERNS.some((pattern) => pattern.test(m1Text));
    const m2Leak = SALES_LEAK_PATTERNS.some((pattern) => pattern.test(m2Text));
    if (m1Leak || m2Leak) {
      result.errors.push("Vazamento de discurso comercial do admin no endpoint /test-agent/message");
    } else {
      result.noSalesLeak = true;
    }

    const domainOkM1 = hasDomainSignal(m1Text, scenario.workflowKind) || hasProbeOverlap(m1Text, scenario.probeMessages);
    const domainOkM2 = hasDomainSignal(m2Text, scenario.workflowKind) || hasProbeOverlap(m2Text, scenario.probeMessages);
    const respondsDifferently = normalize(m1Text).slice(0, 220) !== normalize(m2Text).slice(0, 220);
    const closedHoursMode =
      normalize(m1Text).includes("estamos fechados no momento") &&
      normalize(m2Text).includes("estamos fechados no momento");
    const conversationalQualityOk = m1Text.trim().length >= 40 && m2Text.trim().length >= 40;
    const domainOrQualityOk = (domainOkM1 && domainOkM2) || conversationalQualityOk;

    if (!domainOrQualityOk || (!respondsDifferently && !closedHoursMode)) {
      result.errors.push("Respostas do agente criado sem sinal suficiente de dominio");
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
  const maxTurns = scenario.maxTurns ?? 14;

  const resetResult = await storage.resetClientByPhone(scenario.phone);
  clearClientSession(scenario.phone);

  let deterministicDelivery = false;
  let credentialsActionObserved = false;
  let readyClaimWithoutToken = false;
  let token: string | undefined;
  let hasDemoScreenshot = false;
  let hasDemoVideo = false;
  let pixPayloadDetected = false;
  let pixPromptInjected = false;
  let mediaPromptInjected = false;

  const queue = [...scenario.onboardingMessages];
  const retryPrompts = [
    "continua e gera meu teste agora",
    "gera meu teste agora por favor",
    "ok, finaliza e manda o link de teste",
  ];
  let retryIndex = 0;

  try {
    for (let i = 0; i < maxTurns; i += 1) {
      if (deterministicDelivery && scenario.requiresPixFlow && !pixPromptInjected) {
        queue.push("prefiro pagar pelo pix manual no whatsapp");
        queue.push("ja fiz o pix, como envio comprovante?");
        pixPromptInjected = true;
      }
      if (deterministicDelivery && scenario.requiresDemoAssets && !mediaPromptInjected) {
        queue.push("me manda um print e um video da demonstracao do meu agente");
        mediaPromptInjected = true;
      }

      const input =
        queue.length > 0 ? queue.shift()! : retryPrompts[Math.min(retryIndex, retryPrompts.length - 1)];
      if (queue.length === 0) retryIndex += 1;

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

      if (response?.actions?.testAccountCredentials?.email) {
        credentialsActionObserved = true;
      }
      if (response?.actions?.demoAssets?.screenshotUrl || normalize(String(agentReply)).includes("print")) {
        hasDemoScreenshot = true;
      }
      if (response?.actions?.demoAssets?.videoUrl || normalize(String(agentReply)).includes("video")) {
        hasDemoVideo = true;
      }
      if (hasPixPayload(agentReply)) {
        pixPayloadDetected = true;
      }
      if (hasReadyClaimWithoutToken(agentReply)) {
        readyClaimWithoutToken = true;
      }
      if (!deterministicDelivery && hasDeterministicDelivery(agentReply, scenario.phone)) {
        deterministicDelivery = true;
        token = extractToken(agentReply);
      }

      const doneWithFlow =
        deterministicDelivery &&
        (!scenario.requiresPixFlow || pixPayloadDetected) &&
        (!scenario.requiresDemoAssets || hasDemoScreenshot || hasDemoVideo);
      if (doneWithFlow && i >= scenario.onboardingMessages.length - 1) {
        break;
      }
    }

    const session = getClientSession(scenario.phone);
    const awaitingPaymentProof = Boolean(session?.awaitingPaymentProof);
    const reaskEvents = countReaskEvents(turns);

    const allReplies = turns.map((turn) => String(turn.agentReply || "")).join("\n");
    const panelPathOk = (() => {
      if (!scenario.expectedPanelPath) return true;
      if (Array.isArray(scenario.expectedPanelPath)) {
        return scenario.expectedPanelPath.some((pathPart) => allReplies.includes(pathPart));
      }
      return allReplies.includes(scenario.expectedPanelPath);
    })();

    const linkedUser = await storage.getUserByPhone(scenario.phone);
    const emailDbOk =
      Boolean(linkedUser?.email) && String(linkedUser?.email || "").toLowerCase() === expectedEmail.toLowerCase();
    const emailInReplyOk = allReplies.toLowerCase().includes(expectedEmail.toLowerCase());
    const tokenInfo = token ? await getTestToken(token) : undefined;
    const tokenBindingOk =
      Boolean(tokenInfo?.userId) && Boolean(linkedUser?.id) && String(tokenInfo?.userId) === String(linkedUser?.id);

    const probe = await probeCreatedAgent(token, scenario, linkedUser?.id);

    const validations: ValidationItem[] = [
      { id: "deterministic_delivery", ok: deterministicDelivery },
      { id: "credentials_action_observed", ok: credentialsActionObserved || Boolean(token) },
      { id: "canonical_email_in_reply", ok: emailInReplyOk },
      { id: "canonical_email_in_db", ok: emailDbOk },
      { id: "token_user_binding", ok: tokenBindingOk },
      { id: "no_false_ready_claim", ok: !readyClaimWithoutToken },
      { id: "panel_path_expected", ok: panelPathOk },
      { id: "no_unnecessary_reask", ok: reaskEvents === 0, details: `reaskEvents=${reaskEvents}` },
      { id: "probe_info_ok", ok: probe.infoOk },
      { id: "probe_message1_ok", ok: probe.message1Ok },
      { id: "probe_message2_ok", ok: probe.message2Ok },
      { id: "probe_no_sales_leak", ok: probe.noSalesLeak },
      { id: "probe_context_kept", ok: probe.contextKept },
      {
        id: "demo_assets_if_required",
        ok: !scenario.requiresDemoAssets || hasDemoScreenshot || hasDemoVideo,
        details: `required=${Boolean(scenario.requiresDemoAssets)} screenshot=${hasDemoScreenshot} video=${hasDemoVideo}`,
      },
      {
        id: "pix_payload_if_required",
        ok: !scenario.requiresPixFlow || pixPayloadDetected,
        details: `required=${Boolean(scenario.requiresPixFlow)} pixPayloadDetected=${pixPayloadDetected}`,
      },
      {
        id: "awaiting_payment_proof_if_pix",
        ok: !scenario.requiresPixFlow || awaitingPaymentProof || normalize(allReplies).includes("comprovante"),
        details: `required=${Boolean(scenario.requiresPixFlow)} awaitingPaymentProof=${awaitingPaymentProof}`,
      },
    ];

    const success = validations.every((item) => item.ok);

    return {
      id: scenario.id,
      phone: scenario.phone,
      profile: scenario.profile,
      workflowKind: scenario.workflowKind,
      resetResult,
      turns,
      token,
      expectedEmail,
      deterministicDelivery,
      credentialsActionObserved,
      readyClaimWithoutToken,
      panelPathOk,
      hasDemoScreenshot,
      hasDemoVideo,
      pixPayloadDetected,
      awaitingPaymentProof,
      reaskEvents,
      probe,
      validations,
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
      token,
      expectedEmail,
      deterministicDelivery,
      credentialsActionObserved,
      readyClaimWithoutToken,
      panelPathOk: false,
      hasDemoScreenshot,
      hasDemoVideo,
      pixPayloadDetected,
      awaitingPaymentProof: false,
      reaskEvents: countReaskEvents(turns),
      probe: {
        infoOk: false,
        message1Ok: false,
        message2Ok: false,
        noSalesLeak: false,
        contextKept: false,
        errors: [error instanceof Error ? error.message : String(error)],
      },
      validations: [{ id: "scenario_error", ok: false, details: error instanceof Error ? error.message : String(error) }],
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildScenarios(): Scenario[] {
  return [
    {
      id: "real-phone-5517991956944-curioso-meta",
      phone: "5517991956944",
      contactName: "Cliente Real 56944",
      profile: "curioso vindo do anuncio com interrupcao de preco",
      workflowKind: "generic",
      onboardingMessages: [
        "oi vim do anuncio e quero entender como funciona",
        "minha empresa e studio rota digital e vendo servicos de marketing",
        "quanto custa o plano mensal",
        "quero que o agente responda natural e faca follow-up sem parecer robo",
        "nao uso agendamento, quero atendimento comercial e vendas",
      ],
      probeMessages: [
        "oi, queria entender seu servico e como voces atendem",
        "legal, e como voces conduzem para fechar comigo?",
      ],
    },
    {
      id: "delivery-curioso-cardapio",
      phone: "5511998803101",
      contactName: "Maria Delivery",
      profile: "delivery curioso",
      workflowKind: "delivery",
      expectedPanelPath: "/delivery-cardapio",
      onboardingMessages: [
        "oi, tenho delivery e quero automatizar",
        "meu negocio e restaurante sabor da vila e vendo marmita e lanche",
        "como funciona para mostrar cardapio",
        "quero que responda rapido e faca upsell",
        "quero que feche o pedido ate o final no whatsapp",
      ],
      probeMessages: [
        "oi, queria pedir uma marmita e bebida",
        "e como voce confirma meu pedido ate finalizar?",
      ],
    },
    {
      id: "real-410dd-somos-vendemos-no-reask",
      phone: "5511998803112",
      contactName: "Vander Danone",
      profile: "mensagem real com nos vendemos + somos a",
      workflowKind: "generic",
      onboardingMessages: [
        "oi",
        "nos vendemos danone e derivados. somos a vander danone e pode se identificar como vander",
        "quero que responda natural, tire duvidas e converta sem parecer robo",
        "nao uso agendamento, foco em atendimento e vendas",
      ],
      probeMessages: [
        "oi, queria saber quais produtos voces vendem",
        "e como voces conduzem para fechar pedido comigo?",
      ],
    },
    {
      id: "delivery-apressado",
      phone: "5511998803102",
      contactName: "Fernanda Apressada",
      profile: "apressado alternando preco e onboarding",
      workflowKind: "delivery",
      expectedPanelPath: "/delivery-cardapio",
      onboardingMessages: [
        "to com pressa, cria meu agente e manda link",
        "me fala o preco primeiro",
        "minha empresa e lanches rota e vendo lanche e marmita",
        "quero resposta objetiva e fechar pedido",
        "nao uso agendamento, quero pedido completo no whatsapp",
      ],
      probeMessages: [
        "quero pedir lanche com batata e refri",
        "como fica a confirmacao e entrega?",
      ],
    },
    {
      id: "clinica-agendamento",
      phone: "5511998803103",
      contactName: "Dr Carlos",
      profile: "clinica com agenda",
      workflowKind: "scheduling",
      expectedPanelPath: ["/agendamentos", "/my-agent-ia", "/meu-agente-ia"],
      onboardingMessages: [
        "oi, preciso automatizar meu atendimento da clinica",
        "minha empresa e clinica foco e faco avaliacao e retorno",
        "quero que tire duvidas e agende sem confundir horarios",
        "sim, segunda a sexta das 08:00 as 17:00",
      ],
      probeMessages: [
        "oi, quero agendar uma avaliacao quinta de manha",
        "se nao tiver horario, qual alternativa voce me oferece?",
      ],
    },
    {
      id: "consultoria-agendamento",
      phone: "5511998803104",
      contactName: "Ricardo Consultor",
      profile: "consultoria que fecha reunioes",
      workflowKind: "scheduling",
      expectedPanelPath: ["/agendamentos", "/my-agent-ia", "/meu-agente-ia"],
      onboardingMessages: [
        "oi, quero um agente para meu comercial",
        "minha empresa e rota certa consultoria",
        "quero que qualifique lead e feche reuniao",
        "sim, de segunda a quinta das 13:00 as 18:00",
      ],
      probeMessages: [
        "quero marcar uma reuniao para amanha 14h",
        "se esse horario estiver cheio, pode sugerir outro?",
      ],
    },
    {
      id: "barbearia-salao",
      phone: "5511998803105",
      contactName: "Barbearia Alfa",
      profile: "salao/barbearia com agenda",
      workflowKind: "salon",
      expectedPanelPath: "/salon-menu",
      onboardingMessages: [
        "oi, quero automatizar minha barbearia",
        "tenho uma barbearia alfa com corte e barba",
        "quero atendimento como recepcao e confirmar horarios",
        "sim, segunda a sabado das 09:00 as 19:00",
      ],
      probeMessages: [
        "oi, queria agendar corte e barba para sabado",
        "quais horarios voce tem disponivel?",
      ],
    },
    {
      id: "leigo-com-interrupcao",
      phone: "5511998803106",
      contactName: "Cliente Leigo",
      profile: "leigo que pergunta no meio e retoma",
      workflowKind: "generic",
      onboardingMessages: [
        "oi, sou leigo nisso, funciona mesmo?",
        "antes, me explica como funciona o teste",
        "minha empresa e loja prisma moda e vendo roupa feminina",
        "quero que responda humano e faca follow-up",
        "nao uso agendamento, e atendimento e vendas",
      ],
      probeMessages: [
        "oi, tenho duvida de tamanho e troca",
        "como eu finalizo a compra com voces?",
      ],
    },
    {
      id: "desconfiado-validacao-link",
      phone: "5511998803107",
      contactName: "Cliente Desconfiado",
      profile: "desconfiado cobrando prova",
      workflowKind: "generic",
      onboardingMessages: [
        "isso funciona mesmo ou e promessa?",
        "minha empresa e oficina turbo e eu vendo manutencao automotiva",
        "quero respostas objetivas e sem enrolacao",
        "nao uso agendamento",
        "me manda o link de teste real agora",
      ],
      probeMessages: [
        "oi, preciso revisar meu carro, como funciona o atendimento",
        "e qual e o proximo passo para agendar ou fechar?",
      ],
    },
    {
      id: "sem-grana-pix-manual",
      phone: "5511998803108",
      contactName: "Joao Sem Grana",
      profile: "sem grana, quer pix no whatsapp",
      workflowKind: "generic",
      requiresPixFlow: true,
      onboardingMessages: [
        "oi, to sem grana e queria testar antes",
        "minha empresa e studio social media e vendo servicos de marketing",
        "quero que responda natural e converta sem parecer robo",
        "nao uso agendamento",
      ],
      probeMessages: [
        "oi, queria saber como voces atendem cliente novo",
        "e como voces conduzem para fechar proposta?",
      ],
    },
    {
      id: "demo-midia-obrigatoria",
      phone: "5511998803109",
      contactName: "Cliente Midia",
      profile: "cliente exige print e video demo",
      workflowKind: "scheduling",
      expectedPanelPath: "/agendamentos",
      requiresDemoAssets: true,
      onboardingMessages: [
        "oi, quero ver prova visual antes de pagar",
        "minha empresa e clinica viva e faco avaliacao e retorno",
        "quero que atenda como recepcao e agende",
        "sim, segunda a sexta das 09:00 as 18:00",
      ],
      probeMessages: [
        "oi, quero agendar avaliacao para sexta",
        "se eu nao puder esse dia, qual alternativa voce oferece?",
      ],
    },
    {
      id: "ecommerce-generic-vendas",
      phone: "5511998803110",
      contactName: "Loja Ecom",
      profile: "ecommerce sem agenda",
      workflowKind: "generic",
      onboardingMessages: [
        "oi, tenho ecommerce e quero automatizar whatsapp",
        "minha empresa e urban fit e vendo roupas esportivas",
        "quero atendimento rapido e follow-up inteligente",
        "nao uso agendamento, so comercial",
      ],
      probeMessages: [
        "oi, como funciona troca de roupa se nao servir",
        "e como fecho meu pedido com voces?",
      ],
    },
    {
      id: "petshop-atendimento",
      phone: "5511998803111",
      contactName: "PetShop Central",
      profile: "petshop com atendimento e venda",
      workflowKind: "generic",
      onboardingMessages: [
        "oi, quero atendimento automatico para meu petshop",
        "minha empresa e petshop central e vendo racao, banho e tosa",
        "quero que tire duvidas e conduza para fechar servico",
        "nao uso agendamento por enquanto",
      ],
      probeMessages: [
        "oi, queria saber sobre banho e tosa",
        "e como eu confirmo esse atendimento com voces?",
      ],
    },
  ];
}

async function main(): Promise<void> {
  const adminId = await resolveAdminIdByEmail(ADMIN_EMAIL);
  const scenarios = buildScenarios();
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    console.log(`[30plus] scenario=${scenario.id} phone=${scenario.phone}`);
    const result = await runScenario(adminId, scenario);
    results.push(result);

    const passed = result.validations.filter((item) => item.ok).length;
    const total = result.validations.length;
    console.log(
      `[30plus] result=${scenario.id} success=${result.success} validations=${passed}/${total} deterministic=${result.deterministicDelivery} token=${Boolean(result.token)} reask=${result.reaskEvents}`,
    );
    if (result.probe.errors.length > 0) {
      console.log(`[30plus] probe-errors(${scenario.id}) => ${result.probe.errors.join(" | ")}`);
    }
  }

  const totalScenarios = results.length;
  const successScenarios = results.filter((item) => item.success).length;
  const totalValidations = results.reduce((sum, item) => sum + item.validations.length, 0);
  const passedValidations = results.reduce(
    (sum, item) => sum + item.validations.filter((validation) => validation.ok).length,
    0,
  );
  const failedValidations = totalValidations - passedValidations;

  const failedScenarioSummaries = results
    .filter((item) => !item.success)
    .map((item) => ({
      id: item.id,
      phone: item.phone,
      failed: item.validations.filter((validation) => !validation.ok),
      error: item.error,
    }));

  const summary = {
    adminEmail: ADMIN_EMAIL,
    baseUrl: BASE_URL,
    totalScenarios,
    successScenarios,
    failedScenarios: totalScenarios - successScenarios,
    scenarioSuccessRate: Number(((successScenarios / Math.max(1, totalScenarios)) * 100).toFixed(2)),
    totalValidations,
    passedValidations,
    failedValidations,
    validationPassRate: Number(((passedValidations / Math.max(1, totalValidations)) * 100).toFixed(2)),
    passedOver30Validations: totalValidations >= 30,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    failedScenarioSummaries,
    results,
  };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `admin-30plus-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf-8");

  console.log(`[30plus] report=${outFile}`);
  console.log(JSON.stringify(summary, null, 2));

  const hardFail = summary.failedScenarios > 0 || summary.failedValidations > 0;
  process.exit(hardFail ? 2 : 0);
}

main().catch((error) => {
  console.error("[30plus] failed", error);
  process.exit(1);
});
