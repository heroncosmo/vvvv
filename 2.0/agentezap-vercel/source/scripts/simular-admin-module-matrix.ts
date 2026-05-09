import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { clearClientSession, getTestToken, processAdminMessage } from "../server/adminAgentService";
import { storage } from "../server/storage";

type Scenario = {
  label: string;
  phone: string;
  contactName: string;
  messages: string[];
  expectedBusinessType: "delivery" | "agendamento";
  expectedPanelPath: string;
};

const rawLog = console.log.bind(console);
const rawWarn = console.warn.bind(console);
const rawError = console.error.bind(console);

console.log = (...args: any[]) => {
  const text = args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ");
  if (text.startsWith("[check]") || text.startsWith("{")) rawLog(...args);
};
console.warn = (...args: any[]) => {
  const text = args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ");
  if (text.startsWith("[check]")) rawWarn(...args);
};
console.error = (...args: any[]) => {
  const text = args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ");
  if (text.startsWith("[check]")) rawError(...args);
};

function phone(seed: string) {
  return `55119888${seed}`;
}

async function resetPhone(phoneNumber: string) {
  try {
    await storage.resetTestAccountSafely(phoneNumber, { forceAnyAccount: true });
  } catch {
    // Ignore reset failures during setup; the assertions below validate the final state.
  }
  clearClientSession(phoneNumber);
}

async function runScenario(scenario: Scenario) {
  await resetPhone(scenario.phone);

  const transcript: Array<{ input: string; output: string | null }> = [];
  let lastText = "";

  for (const input of scenario.messages) {
    const response = await processAdminMessage(
      scenario.phone,
      input,
      undefined,
      undefined,
      true,
      scenario.contactName,
    );
    lastText = response?.text || "";
    transcript.push({ input, output: lastText || null });
  }

  const user = await storage.getUserByPhone(scenario.phone);
  const tokenMatch = lastText.match(/\/test\/([a-f0-9]{16,})/i);
  const token = tokenMatch?.[1];
  const tokenInfo = token ? await getTestToken(token) : undefined;
  const agentConfig = user ? await storage.getAgentConfig(user.id) : null;
  const prompt = String(agentConfig?.prompt || "");

  return {
    label: scenario.label,
    phone: scenario.phone,
    response: lastText,
    transcript,
    userId: user?.id || null,
    email: user?.email || null,
    businessType: (user as any)?.businessType || null,
    token: token || null,
    tokenInfo: tokenInfo || null,
    promptPreview: prompt.slice(0, 260),
    promptMentionsAgenteZap: /AgenteZap/i.test(prompt),
    promptHasCompany:
      !!tokenInfo?.company && new RegExp(String(tokenInfo.company).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(prompt),
    hasExpectedPanelPath: lastText.includes(scenario.expectedPanelPath),
  };
}

async function main() {
  const scenarios: Scenario[] = [
    {
      label: "delivery_full_order",
      phone: phone("2101"),
      contactName: "Cliente Delivery 1",
      messages: [
        "oi",
        "Restaurante Sabor da Vila. Vendo marmita, lanche e suco.",
        "Quero que ele atenda rapido, apresente cardapio, confirme os itens e feche o pedido.",
        "Quero que ele conclua o pedido ate o final no WhatsApp.",
      ],
      expectedBusinessType: "delivery",
      expectedPanelPath: "/delivery-cardapio",
    },
    {
      label: "delivery_first_contact",
      phone: phone("2102"),
      contactName: "Cliente Delivery 2",
      messages: [
        "oi",
        "Pizzaria Noite Boa. Vendo pizza e bebida.",
        "Quero que ele responda como atendente, mostre opcoes e deixe o cliente aquecido.",
        "Quero so o primeiro atendimento e depois eu assumo.",
      ],
      expectedBusinessType: "delivery",
      expectedPanelPath: "/delivery-cardapio",
    },
    {
      label: "scheduling_explicit_hours",
      phone: phone("2201"),
      contactName: "Cliente Agenda 1",
      messages: [
        "oi",
        "Clinica Foco. Faço avaliacao e retorno.",
        "Quero que ele tire duvidas, confirme dados e agende so dentro do horario certo.",
        "Sim, segunda a sexta das 08:00 as 17:00.",
      ],
      expectedBusinessType: "agendamento",
      expectedPanelPath: "/agendamentos",
    },
    {
      label: "scheduling_natural_hours",
      phone: phone("2202"),
      contactName: "Cliente Agenda 2",
      messages: [
        "oi",
        "Consultoria Rota Certa. Faço diagnostico e reunioes.",
        "Quero que ele qualifique, responda objecoes e feche o agendamento.",
        "Sim, de segunda a quinta das 13h as 18h.",
      ],
      expectedBusinessType: "agendamento",
      expectedPanelPath: "/agendamentos",
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }

  const validations = results.map((result, index) => {
    const scenario = scenarios[index];
    const tokenInfo = result.tokenInfo as any;
    const company = String(tokenInfo?.company || "");
    const ok = Boolean(
      result.userId &&
        result.token &&
        tokenInfo?.userId === result.userId &&
        result.businessType === scenario.expectedBusinessType &&
        result.hasExpectedPanelPath &&
        !result.promptMentionsAgenteZap &&
        result.promptHasCompany &&
        company &&
        !/AgenteZap/i.test(company),
    );

    return {
      label: scenario.label,
      ok,
      company,
    };
  });

  const report = {
    validations,
    success: validations.every((item) => item.ok),
    results,
  };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `admin-module-matrix-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf-8");

  rawLog(`[check] admin-module-matrix => ${validations.map((item) => `${item.label}=${item.ok}`).join(" ")}`);
  rawLog(`[check] report => ${outFile}`);
  rawLog(JSON.stringify(report, null, 2));

  process.exit(report.success ? 0 : 2);
}

main().catch((error) => {
  rawError("[check] script failed", error);
  process.exit(1);
});
