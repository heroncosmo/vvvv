import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { storage } from "../server/storage";
import { processAdminMessage, clearClientSession } from "../server/adminAgentService";

type Scenario = {
  id: string;
  phone: string;
  contactName: string;
  profile: string;
  messages: string[];
};

type TurnResult = {
  turn: number;
  clientMessage: string;
  agentReply: string | null;
  savedClientMessageId?: string;
  savedAgentMessageId?: string;
};

type ScenarioResult = {
  id: string;
  phone: string;
  profile: string;
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
  success: boolean;
  error?: string;
};

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "rodrigoconexao128@gmail.com").toLowerCase();
const BASE_URL = process.env.APP_URL || "https://agentezap.online";
const TEST_PHONE = "5517991956944";

const realTestLinkPattern = /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;
const canonicalEmailPattern = /\b\d{10,15}@agentezap\.online\b/i;
const placeholderCredentialsPattern = /\b(seu email|senha:\s*123456)\b/i;

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

function createScenarios(): Scenario[] {
  return [
    {
      id: "real-phone-5517991956944",
      phone: TEST_PHONE,
      contactName: "Cliente Real 56944",
      profile: "cliente real solicitado",
      messages: [
        "oi, vim de anuncio e quero automatizar meu whatsapp",
        "minha empresa e studio rota digital e eu vendo servicos de marketing",
        "quero que o agente responda natural, tire duvidas e faça follow-up sem parecer robo",
        "nao uso agendamento, quero atendimento comercial e vendas",
      ],
    },
    {
      id: "curioso-meta",
      phone: "5511998801001",
      contactName: "Maria Curiosa",
      profile: "curioso vindo de anuncio",
      messages: [
        "oi, vi no meta e queria entender como funciona",
        "sou da loja prisma moda e vendo roupa feminina",
        "quero atendimento humano e que faça acompanhamento depois",
        "nao uso agenda, só comercial",
      ],
    },
    {
      id: "muito-interessado",
      phone: "5511998801002",
      contactName: "Carlos Interessado",
      profile: "muito interessado",
      messages: [
        "quero criar agora meu agente no whatsapp",
        "meu negocio e clinica foco e faço avaliacao e retorno",
        "quero que confirme dados e agende somente no horario certo",
        "sim, segunda a sexta das 08:00 as 17:00",
      ],
    },
    {
      id: "sem-grana",
      phone: "5511998801003",
      contactName: "Joao Sem Grana",
      profile: "sem dinheiro",
      messages: [
        "oi, to sem grana mas quero testar primeiro",
        "minha empresa e lanches da vila e vendo lanche e marmita",
        "quero que responda rapido e feche pedido no whatsapp",
        "nao uso agendamento. delivery funciona de segunda a sabado das 09:00 as 22:00 e quero pedido completo ate o final",
      ],
    },
    {
      id: "desconfiado",
      phone: "5511998801004",
      contactName: "Ricardo Desconfiado",
      profile: "desconfiado",
      messages: [
        "isso funciona mesmo? nao quero cair em promessa",
        "tenho uma barbearia alfa com corte e barba",
        "quero atendimento de recepcao, confirmar horario e vender barba",
        "sim, segunda a sabado das 09:00 as 19:00",
      ],
    },
    {
      id: "apressado",
      phone: "5511998801005",
      contactName: "Fernanda Apressada",
      profile: "apressado",
      messages: [
        "to com pressa, cria meu agente e manda link",
        "minha empresa e rota certa consultoria",
        "quero que qualifique lead e feche agendamento",
        "sim, segunda a quinta das 13:00 as 18:00",
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

  const messageId = `manual-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const messageId = `manual-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

async function runScenario(adminId: string, scenario: Scenario): Promise<ScenarioResult> {
  const turns: TurnResult[] = [];
  const expectedEmail = expectedCanonicalEmail(scenario.phone);

  const resetResult = await storage.resetClientByPhone(scenario.phone);
  clearClientSession(scenario.phone);

  let finalReply: string | null = null;
  let deterministicDelivery = false;

  try {
    const retryPrompts = [
      "continua e gera meu teste agora",
      "gera meu teste agora por favor",
      "pode seguir e mandar meu link real",
      "ok, finaliza e manda o link de teste",
    ];
    const queue = [...scenario.messages];
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

      if (hasDeterministicDelivery(agentReply, scenario.phone)) {
        deterministicDelivery = true;
        finalReply = agentReply;
        break;
      }

      finalReply = agentReply;

      if (queue.length === 0) {
        retryIndex += 1;
      }
    }

    const success = deterministicDelivery;

    return {
      id: scenario.id,
      phone: scenario.phone,
      profile: scenario.profile,
      resetResult,
      turns,
      deterministicDelivery,
      expectedEmail,
      finalReply,
      success,
    };
  } catch (error) {
    return {
      id: scenario.id,
      phone: scenario.phone,
      profile: scenario.profile,
      resetResult,
      turns,
      deterministicDelivery,
      expectedEmail,
      finalReply,
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
    console.log(`[real-db-flow] scenario=${scenario.id} phone=${scenario.phone}`);
    const result = await runScenario(adminId, scenario);
    results.push(result);
    console.log(
      `[real-db-flow] result=${scenario.id} success=${result.success} deterministicDelivery=${result.deterministicDelivery}`,
    );
  }

  const successCount = results.filter((item) => item.success).length;
  const summary = {
    adminEmail: ADMIN_EMAIL,
    baseUrl: BASE_URL,
    total: results.length,
    successCount,
    failCount: results.length - successCount,
    successRate: Number(((successCount / Math.max(1, results.length)) * 100).toFixed(2)),
    requiredPhone: TEST_PHONE,
    requiredPhonePassed: Boolean(results.find((item) => item.phone === TEST_PHONE)?.success),
  };

  const report = { summary, results };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `admin-real-db-flow-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf-8");

  console.log(`[real-db-flow] report=${outFile}`);
  console.log(JSON.stringify(summary, null, 2));

  process.exit(summary.failCount > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error("[real-db-flow] failed", error);
  process.exit(1);
});
