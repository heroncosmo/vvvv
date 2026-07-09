import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { clearClientSession, processAdminMessage } from "../server/adminAgentService";

type Scenario = {
  id: string;
  contactName?: string;
  messages: string[];
  expectDemoAssets?: boolean;
};

type TurnResult = {
  input: string;
  output: string | null;
  hasCredentials: boolean;
  hasDemoScreenshot: boolean;
  hasDemoVideo: boolean;
  credentials?: {
    email: string;
    hasPassword: boolean;
    simulatorToken?: string;
  };
};

type ScenarioResult = {
  scenarioId: string;
  phone: string;
  contactName: string;
  success: boolean;
  turns: TurnResult[];
  error?: string;
};

const scenarios: Scenario[] = [
  {
    id: "lead-sem-ramo-definido",
    contactName: "Carlos Silva",
    messages: [
      "Oi, eu vi voces no insta. Isso responde cliente mesmo?",
      "Minha empresa e Studio Prisma, e eu vendo roupas femininas.",
      "Quero que ele responda como vendedor, tire duvidas e faca follow-up sem parecer robo.",
      "Nao vai usar agendamento. Quero so atendimento e vendas.",
    ],
  },
  {
    id: "delivery-com-cardapio",
    contactName: "Patricia Delivery",
    messages: [
      "Tenho delivery e quero automatizar pedidos no whatsapp.",
      "Meu negocio e Restaurante Sabor da Vila, e eu vendo marmita e lanche.",
      "Quero que ele responda rapido, apresente cardapio e faca upsell.",
      "Quero que ele feche o pedido ate o final.",
    ],
  },
  {
    id: "retorno-mesmo-numero",
    contactName: "Joao Retorno",
    messages: [
      "Oi, eu quero ver uma demonstracao completa.",
      "Meu negocio e Barbearia Alfa, e meu principal servico e corte e barba.",
      "Quero que ele atenda como recepcao, confirme horarios e fale natural.",
      "Sim, vai trabalhar com agendamento de segunda a sabado das 09:00 as 19:00.",
      "Me manda um print e um video do meu agente funcionando para eu mostrar para minha equipe.",
    ],
    expectDemoAssets: true,
  },
];

function generatePhone(seed: number): string {
  const base = String(Date.now()).slice(-8);
  return `5511${base}${String(seed).padStart(2, "0")}`.slice(0, 13);
}

function includesDemoScreenshot(response: any): boolean {
  if (response?.actions?.demoAssets?.screenshotUrl) return true;
  if (Array.isArray(response?.mediaActions)) {
    return response.mediaActions.some((m: any) => m?.mediaData?.mediaType === "image" && m?.mediaData?.storageUrl);
  }
  return false;
}

function includesDemoVideo(response: any): boolean {
  if (response?.actions?.demoAssets?.videoUrl) return true;
  if (Array.isArray(response?.mediaActions)) {
    return response.mediaActions.some((m: any) => m?.mediaData?.mediaType === "video" && m?.mediaData?.storageUrl);
  }
  return false;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutRef: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutRef = setTimeout(() => reject(new Error(`Timeout em ${label} (${ms}ms)`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutRef) clearTimeout(timeoutRef);
  }
}

async function runScenario(scenario: Scenario, index: number): Promise<ScenarioResult> {
  const phone = generatePhone(index + 1);
  const contactName = scenario.contactName || `Cliente ${index + 1}`;

  clearClientSession(phone);

  const turns: TurnResult[] = [];

  try {
    for (const input of scenario.messages) {
      console.log(`Mensagem cliente: ${input}`);
      const response = await withTimeout(
        processAdminMessage(phone, input, undefined, undefined, true, contactName),
        120000,
        `processAdminMessage ${scenario.id}`,
      );

      if (!response) {
        console.log("Sem resposta (trigger/filter).");
        turns.push({
          input,
          output: null,
          hasCredentials: false,
          hasDemoScreenshot: false,
          hasDemoVideo: false,
        });
        continue;
      }

      const credentials = response.actions?.testAccountCredentials;
      const hasDemoScreenshot = includesDemoScreenshot(response);
      const hasDemoVideo = includesDemoVideo(response);
      console.log(`Resposta agente: ${(response.text || "").slice(0, 180)}...`);
      turns.push({
        input,
        output: response.text,
        hasCredentials: Boolean(credentials?.email),
        hasDemoScreenshot,
        hasDemoVideo,
        credentials: credentials?.email
          ? {
              email: credentials.email,
              hasPassword: Boolean(credentials.password),
              simulatorToken: credentials.simulatorToken,
            }
          : undefined,
      });
    }

    const hasCredentials = turns.some((t) => t.hasCredentials);
    const hasDemoAssets = turns.some((t) => t.hasDemoScreenshot || t.hasDemoVideo);
    const success = scenario.expectDemoAssets ? hasCredentials && hasDemoAssets : hasCredentials;
    return {
      scenarioId: scenario.id,
      phone,
      contactName,
      success,
      turns,
    };
  } catch (error) {
    return {
      scenarioId: scenario.id,
      phone,
      contactName,
      success: false,
      turns,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const results: ScenarioResult[] = [];

  for (let i = 0; i < scenarios.length; i += 1) {
    const scenario = scenarios[i];
    console.log(`\n--- Executando cenario: ${scenario.id} ---`);
    const result = await runScenario(scenario, i);
    results.push(result);
    console.log(`Resultado: ${result.success ? "OK" : "SEM CREDENCIAIS"}`);
  }

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `admin-agent-factory-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2), "utf-8");

  const successCount = results.filter((r) => r.success).length;
  console.log(`\nResumo: ${successCount}/${results.length} cenarios geraram credenciais.`);
  console.log(`Arquivo: ${outFile}`);

  process.exit(successCount < results.length ? 2 : 0);
}

main().catch((error) => {
  console.error("Falha geral na simulacao:", error);
  process.exit(1);
});
