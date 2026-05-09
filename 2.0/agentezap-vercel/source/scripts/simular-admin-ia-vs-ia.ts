import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { clearClientSession, processAdminMessage } from "../server/adminAgentService";
import { chatComplete } from "../server/llm";

type Scenario = {
  id: string;
  contactName: string;
  objective: string;
  requireDemoAssets?: boolean;
  businessReply: string;
  behaviorReply: string;
  workflowReply: string;
};

const skipDemoAssetsValidation = process.env.ADMIN_BENCHMARK_SKIP_DEMO === "1";

type TurnLog = {
  turn: number;
  client: string;
  agent: string;
  hasCredentials: boolean;
  hasDeterministicDelivery: boolean;
  hasDemoScreenshot: boolean;
  hasDemoVideo: boolean;
};

type ScenarioResult = {
  scenarioId: string;
  phone: string;
  success: boolean;
  hasCredentials: boolean;
  hasDeterministicDelivery: boolean;
  hasDemoScreenshot: boolean;
  hasDemoVideo: boolean;
  turns: TurnLog[];
  error?: string;
};

function normalizeText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const scenarios: Scenario[] = [
  {
    id: "ia-vs-ia-lead-leigo",
    contactName: "Cliente Leigo",
    objective:
      "Voce e um cliente leigo e curioso. Quer atendimento automatico no WhatsApp, tem duvidas sobre configuracao e quer que montem tudo para voce.",
    businessReply: "Minha empresa e Studio Prisma e eu vendo roupas femininas.",
    behaviorReply: "Quero que ele responda como vendedor, tire duvidas e faca follow-up sem parecer robo.",
    workflowReply: "Nao vai usar agendamento. Quero so atendimento e vendas.",
  },
  {
    id: "ia-vs-ia-delivery",
    contactName: "Cliente Delivery",
    objective:
      "Voce tem delivery com cardapio e quer automatizar pedidos e upsell. Questione se da para ajustar produtos e horarios depois.",
    businessReply: "Meu negocio e Restaurante Sabor da Vila e eu vendo marmita e lanche.",
    behaviorReply: "Quero que ele responda rapido, mostre cardapio e faca upsell.",
    workflowReply: "Quero que ele feche o pedido ate o final.",
  },
  {
    id: "ia-vs-ia-demo-midia",
    contactName: "Cliente Demonstracao",
    objective:
      "Voce quer prova visual antes de pagar. Durante a conversa, peca print e video da demonstracao funcionando.",
    requireDemoAssets: true,
    businessReply: "Meu negocio e Barbearia Alfa e meu principal servico e corte e barba.",
    behaviorReply: "Quero que ele atenda como recepcao, confirme horarios e fale natural.",
    workflowReply: "Sim, vai trabalhar com agendamento de segunda a sabado das 09:00 as 19:00.",
  },
];

function generatePhone(seed: number): string {
  const now = String(Date.now()).slice(-8);
  return `5511${now}${String(seed).padStart(2, "0")}`.slice(0, 13);
}

function hasDemoScreenshot(text: string, actionDemoScreenshot?: string | null): boolean {
  const normalized = text.toLowerCase();
  return Boolean(actionDemoScreenshot) || normalized.includes("print da demonstracao") || normalized.includes("screenshot");
}

function hasDemoVideo(text: string, actionDemoVideo?: string | null): boolean {
  const normalized = text.toLowerCase();
  return Boolean(actionDemoVideo) || normalized.includes("video da demonstracao") || normalized.includes("demo em video");
}

const realTestLinkPattern = /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;
const canonicalEmailPattern = /\b\d{10,15}@agentezap\.online\b/i;
const placeholderCredentialsPattern = /\b(seu email|senha:\s*123456)\b/i;

function expectedCanonicalEmail(phoneNumber: string): string {
  return `${String(phoneNumber || "").replace(/\D/g, "")}@agentezap.online`;
}

function hasDeterministicDelivery(text: string, phoneNumber: string): boolean {
  const source = String(text || "");
  const expectedEmail = expectedCanonicalEmail(phoneNumber).toLowerCase();
  const hasExpectedEmail = source.toLowerCase().includes(expectedEmail);
  return (
    realTestLinkPattern.test(source) &&
    source.includes("/login") &&
    canonicalEmailPattern.test(source) &&
    hasExpectedEmail &&
    !placeholderCredentialsPattern.test(source)
  );
}

async function generateInitialClientMessage(objective: string): Promise<string> {
  try {
    const response = await chatComplete({
      messages: [
        {
          role: "system",
          content:
            "Voce simula um cliente real em conversa de WhatsApp. Responda sempre em portugues do Brasil, com 1 frase curta.",
        },
        {
          role: "user",
          content: `${objective}\n\nEnvie a PRIMEIRA mensagem agora, curta e natural.`,
        },
      ],
      maxTokens: 120,
      temperature: 0.8,
    });

    const text = String(response.choices?.[0]?.message?.content || "").trim();
    return text || "Oi, queria entender como funciona.";
  } catch {
    return "Oi, queria entender como funciona.";
  }
}

async function generateNextClientMessage(
  objective: string,
  transcript: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  const compactHistory = transcript.slice(-10);
  try {
    const response = await chatComplete({
      messages: [
        {
          role: "system",
          content:
            "Voce simula um cliente real no WhatsApp. Fale curto, natural e sem repetir frases. Nao use listas. Sempre faca uma pergunta ou avancar a conversa.",
        },
        {
          role: "user",
          content:
            `${objective}\n\nContexto recente:\n${compactHistory
              .map((m) => `${m.role === "user" ? "Cliente" : "Atendente"}: ${m.content}`)
              .join("\n")}\n\nEscreva a proxima mensagem do cliente em ate 2 frases.`,
        },
      ],
      maxTokens: 140,
      temperature: 0.9,
    });

    const text = String(response.choices?.[0]?.message?.content || "").trim();
    return text || "Consegue me mandar o link para eu testar agora?";
  } catch {
    return "Consegue me mandar o link para eu testar agora?";
  }
}

function detectGuidedStep(agentMessage: string): "business" | "behavior" | "workflow" | null {
  const normalized = agentMessage
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    normalized.includes("1) qual e o nome do seu negocio") ||
    normalized.includes("nome do seu negocio") ||
    normalized.includes("nome do seu negocio e qual e o principal")
  ) {
    return "business";
  }

  if (
    normalized.includes("2) como voce quer que esse agente trabalhe") ||
    normalized.includes("como voce quer que esse agente trabalhe")
  ) {
    return "behavior";
  }

  if (
    normalized.includes("3)") ||
    normalized.includes("vai realmente fechar agendamentos") ||
    normalized.includes("quer que ele feche o pedido ate o final") ||
    normalized.includes("vai usar agendamento")
  ) {
    return "workflow";
  }

  return null;
}

async function runScenario(scenario: Scenario, index: number): Promise<ScenarioResult> {
  const phone = generatePhone(index + 1);
  clearClientSession(phone);

  const turns: TurnLog[] = [];
  const transcript: Array<{ role: "user" | "assistant"; content: string }> = [];

  let hasCredentials = false;
  let hasDeterministicDeliveryPayload = false;
  let demoScreenshot = false;
  let demoVideo = false;

  try {
    let clientMessage = await generateInitialClientMessage(scenario.objective);

    const sentBusinessReply = () =>
      transcript.some((m) => m.role === "user" && normalizeText(m.content) === normalizeText(scenario.businessReply));
    const sentBehaviorReply = () =>
      transcript.some((m) => m.role === "user" && normalizeText(m.content) === normalizeText(scenario.behaviorReply));
    const sentWorkflowReply = () =>
      transcript.some((m) => m.role === "user" && normalizeText(m.content) === normalizeText(scenario.workflowReply));

    for (let turn = 1; turn <= 10; turn += 1) {
      const response = await processAdminMessage(phone, clientMessage, undefined, undefined, true, scenario.contactName);
      if (!response) {
        turns.push({
          turn,
          client: clientMessage,
          agent: "[sem resposta - trigger]",
          hasCredentials,
          hasDeterministicDelivery: hasDeterministicDeliveryPayload,
          hasDemoScreenshot: demoScreenshot,
          hasDemoVideo: demoVideo,
        });

        if (!hasCredentials && !sentBusinessReply()) {
          clientMessage = scenario.businessReply;
        } else if (!hasCredentials && !sentBehaviorReply()) {
          clientMessage = scenario.behaviorReply;
        } else if (!hasCredentials && !sentWorkflowReply()) {
          clientMessage = scenario.workflowReply;
        } else {
          clientMessage = await generateNextClientMessage(scenario.objective, transcript);
        }
        continue;
      }

      const agentText = response.text || "";
      const credentials = response.actions?.testAccountCredentials;
      const demoAssets = response.actions?.demoAssets;

      hasCredentials = hasCredentials || Boolean(credentials?.email && credentials?.simulatorToken);
      hasDeterministicDeliveryPayload =
        hasDeterministicDeliveryPayload || hasDeterministicDelivery(agentText, phone);
      demoScreenshot = demoScreenshot || hasDemoScreenshot(agentText, demoAssets?.screenshotUrl || null);
      demoVideo = demoVideo || hasDemoVideo(agentText, demoAssets?.videoUrl || null);

      turns.push({
        turn,
        client: clientMessage,
        agent: agentText,
        hasCredentials,
        hasDeterministicDelivery: hasDeterministicDeliveryPayload,
        hasDemoScreenshot: demoScreenshot,
        hasDemoVideo: demoVideo,
      });

      transcript.push({ role: "user", content: clientMessage });
      transcript.push({ role: "assistant", content: agentText });

      const requiresDemoAssets = Boolean(scenario.requireDemoAssets) && !skipDemoAssetsValidation;
      const doneByCredentials =
        hasCredentials && hasDeterministicDeliveryPayload && !requiresDemoAssets;
      const doneByDemo =
        hasCredentials &&
        hasDeterministicDeliveryPayload &&
        requiresDemoAssets &&
        (demoScreenshot || demoVideo);
      if (doneByCredentials || doneByDemo) {
        break;
      }

      const guidedStep = detectGuidedStep(agentText);
      if (guidedStep === "business") {
        clientMessage = scenario.businessReply;
        continue;
      }
      if (guidedStep === "behavior") {
        clientMessage = scenario.behaviorReply;
        continue;
      }
      if (guidedStep === "workflow") {
        clientMessage = scenario.workflowReply;
        continue;
      }
      if (hasCredentials && requiresDemoAssets && !(demoScreenshot || demoVideo)) {
        clientMessage = "Me manda um print e um video do meu agente funcionando.";
        continue;
      }

      if (!hasCredentials && !sentBusinessReply()) {
        clientMessage = scenario.businessReply;
        continue;
      }
      if (!hasCredentials && !sentBehaviorReply()) {
        clientMessage = scenario.behaviorReply;
        continue;
      }
      if (!hasCredentials && !sentWorkflowReply()) {
        clientMessage = scenario.workflowReply;
        continue;
      }

      clientMessage = await generateNextClientMessage(scenario.objective, transcript);
    }

    const requiresDemoAssets = Boolean(scenario.requireDemoAssets) && !skipDemoAssetsValidation;
    const success = requiresDemoAssets
      ? hasCredentials && hasDeterministicDeliveryPayload && (demoScreenshot || demoVideo)
      : hasCredentials && hasDeterministicDeliveryPayload;

    return {
      scenarioId: scenario.id,
      phone,
      success,
      hasCredentials,
      hasDeterministicDelivery: hasDeterministicDeliveryPayload,
      hasDemoScreenshot: demoScreenshot,
      hasDemoVideo: demoVideo,
      turns,
    };
  } catch (error) {
    return {
      scenarioId: scenario.id,
      phone,
      success: false,
      hasCredentials,
      hasDeterministicDelivery: hasDeterministicDeliveryPayload,
      hasDemoScreenshot: demoScreenshot,
      hasDemoVideo: demoVideo,
      turns,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const results: ScenarioResult[] = [];

  for (let i = 0; i < scenarios.length; i += 1) {
    const scenario = scenarios[i];
    console.log(`\n--- IA vs IA: ${scenario.id} ---`);
    const result = await runScenario(scenario, i);
    results.push(result);

    console.log(
      `Resultado ${scenario.id}: ${result.success ? "OK" : "FALHOU"} | credenciais=${result.hasCredentials} | entrega=${result.hasDeterministicDelivery} | print=${result.hasDemoScreenshot} | video=${result.hasDemoVideo}`,
    );
  }

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `admin-agent-ia-vs-ia-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2), "utf-8");

  const successCount = results.filter((r) => r.success).length;
  console.log(`\nResumo IA vs IA: ${successCount}/${results.length} cenarios aprovados.`);
  console.log(`Arquivo: ${outFile}`);

  process.exit(successCount < results.length ? 2 : 0);
}

main().catch((error) => {
  console.error("Falha geral IA vs IA:", error);
  process.exit(1);
});
