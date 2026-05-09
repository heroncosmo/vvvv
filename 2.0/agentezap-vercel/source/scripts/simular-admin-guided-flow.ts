import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { processAdminMessage, clearClientSession } from "../server/adminAgentService";
import { storage } from "../server/storage";
import { supabase } from "../server/supabaseAuth";

const rawLog = console.log.bind(console);
const rawWarn = console.warn.bind(console);
const rawError = console.error.bind(console);
console.log = (...args: any[]) => {
  const text = args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ");
  if (text.startsWith("[check]") || text.startsWith("{")) {
    rawLog(...args);
  }
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
  return `55119977${seed}`;
}

async function sendFlow(label: string, p: string, contactName: string, messages: string[]) {
  clearClientSession(p);
  const transcript: Array<{ input: string; output: string | null }> = [];
  let lastResponse: any = null;
  for (const input of messages) {
    const response = await processAdminMessage(p, input, undefined, undefined, true, contactName);
    transcript.push({ input, output: response?.text || null });
    lastResponse = response;
  }
  const user = await storage.getUserByPhone(p);
  return { label, phone: p, transcript, lastResponse, user };
}

async function getSalonState(userId: string) {
  const { data: salon } = await supabase
    .from("salon_config")
    .select("user_id,is_active,salon_name,salon_type,opening_hours")
    .eq("user_id", userId)
    .maybeSingle();
  const { data: services } = await supabase.from("scheduling_services").select("id,name").eq("user_id", userId);
  const { data: pros } = await supabase.from("scheduling_professionals").select("id,name").eq("user_id", userId);
  return { salon, servicesCount: services?.length || 0, prosCount: pros?.length || 0 };
}

async function getDeliveryState(userId: string) {
  const { data: delivery } = await supabase
    .from("delivery_config")
    .select("user_id,is_active,business_name,opening_hours")
    .eq("user_id", userId)
    .maybeSingle();
  const { data: cats } = await supabase.from("menu_categories").select("id,name").eq("user_id", userId);
  const { data: items } = await supabase.from("menu_items").select("id,name,description").eq("user_id", userId);
  return { delivery, categoriesCount: cats?.length || 0, itemsCount: items?.length || 0, firstItem: items?.[0] || null };
}

async function getSchedulingState(userId: string) {
  const { data: scheduling } = await supabase
    .from("scheduling_config")
    .select("user_id,is_enabled,service_name,available_days,work_start_time,work_end_time")
    .eq("user_id", userId)
    .maybeSingle();
  const usage = await storage.getDailyUsage(userId);
  return { scheduling, usage };
}

async function resetIfExists(p: string) {
  try {
    await storage.resetClientByPhone(p);
  } catch {}
}

const realTestLinkPattern = /https?:\/\/[^\s]*\/test\/[a-z0-9]{8,}/i;
const canonicalEmailPattern = /\b\d{10,15}@agentezap\.online\b/i;
const placeholderCredentialsPattern = /\b(seu email|senha:\s*123456)\b/i;

function expectedCanonicalEmail(phoneNumber: string): string {
  return `${String(phoneNumber || "").replace(/\D/g, "")}@agentezap.online`;
}

function hasDeterministicDeliveryPayload(
  text: string | null | undefined,
  expectedPhoneNumber: string,
): boolean {
  const source = String(text || "");
  const expectedEmail = expectedCanonicalEmail(expectedPhoneNumber).toLowerCase();
  const hasExpectedEmail = source.toLowerCase().includes(expectedEmail);
  return (
    realTestLinkPattern.test(source) &&
    source.includes("/login") &&
    canonicalEmailPattern.test(source) &&
    hasExpectedEmail &&
    !placeholderCredentialsPattern.test(source)
  );
}

async function main() {
  const salonPhone = phone("1001");
  const deliveryPhone = phone("1002");
  const schedulingPhone = phone("1003");

  await resetIfExists(salonPhone);
  await resetIfExists(deliveryPhone);
  await resetIfExists(schedulingPhone);

  const salon = await sendFlow("salon", salonPhone, "Cliente Salao", [
    "oi",
    "barbearia alfa, corte masculino e barba",
    "quero que ele atenda de forma humana, confirme horario, venda barba e corte e fale como recepcao",
    "sim, segunda a sabado das 09:00 as 19:00",
  ]);

  const delivery = await sendFlow("delivery", deliveryPhone, "Cliente Delivery", [
    "oi",
    "restaurante sabor da vila, marmita e lanche",
    "quero que ele responda rapido, apresente cardapio e venda bem",
    "quero que faca o pedido completo ate o final",
  ]);

  const scheduling = await sendFlow("scheduling", schedulingPhone, "Cliente Agenda", [
    "oi",
    "clinica foco, avaliacao e retorno",
    "quero que ele tire duvidas e agende so dentro do horario certo",
    "sim, segunda a sexta das 08:00 as 17:00",
  ]);

  const editMessages = [
    "agora eu trabalho de segunda a sexta das 10:00 as 16:00",
    "agora eu trabalho de segunda a sexta das 10:30 as 16:30",
    "agora eu trabalho de segunda a sexta das 11:00 as 17:00",
    "agora eu trabalho de segunda a sexta das 11:30 as 17:30",
    "agora eu trabalho de segunda a sexta das 12:00 as 18:00",
    "agora eu trabalho de segunda a sexta das 12:30 as 18:30",
  ];

  const editResults: Array<{ input: string; output: string | null }> = [];
  for (const input of editMessages) {
    const response = await processAdminMessage(schedulingPhone, input, undefined, undefined, true, "Cliente Agenda");
    editResults.push({ input, output: response?.text || null });
  }

  const results: any = {
    salon: {
      phone: salon.phone,
      response: salon.lastResponse?.text || null,
      userId: salon.user?.id || null,
      deliveryOk: hasDeterministicDeliveryPayload(salon.lastResponse?.text || null, salon.phone),
      state: salon.user ? await getSalonState(salon.user.id) : null,
      businessType: salon.user?.businessType || null,
    },
    delivery: {
      phone: delivery.phone,
      response: delivery.lastResponse?.text || null,
      userId: delivery.user?.id || null,
      deliveryOk: hasDeterministicDeliveryPayload(delivery.lastResponse?.text || null, delivery.phone),
      state: delivery.user ? await getDeliveryState(delivery.user.id) : null,
      businessType: delivery.user?.businessType || null,
    },
    scheduling: {
      phone: scheduling.phone,
      response: scheduling.lastResponse?.text || null,
      userId: scheduling.user?.id || null,
      deliveryOk: hasDeterministicDeliveryPayload(scheduling.lastResponse?.text || null, scheduling.phone),
      editResults,
      state: scheduling.user ? await getSchedulingState(scheduling.user.id) : null,
      businessType: scheduling.user?.businessType || null,
    },
  };

  const salonOk = Boolean(
    results.salon.userId &&
      results.salon.businessType === "salon" &&
      results.salon.state?.salon?.is_active === true &&
      results.salon.state?.servicesCount >= 1 &&
      results.salon.state?.prosCount >= 1 &&
      results.salon.deliveryOk === true &&
      String(results.salon.response || "").includes("/salon-menu"),
  );

  const deliveryOk = Boolean(
    results.delivery.userId &&
      results.delivery.businessType === "delivery" &&
      results.delivery.state?.delivery?.is_active === true &&
      results.delivery.state?.categoriesCount >= 1 &&
      results.delivery.state?.itemsCount >= 1 &&
      results.delivery.deliveryOk === true &&
      String(results.delivery.response || "").includes("/delivery-cardapio"),
  );

  const schedulingOk = Boolean(
    results.scheduling.userId &&
      results.scheduling.businessType === "agendamento" &&
      results.scheduling.state?.scheduling?.is_enabled === true &&
      String(results.scheduling.state?.scheduling?.work_start_time || "").startsWith("12:00") &&
      String(results.scheduling.state?.scheduling?.work_end_time || "").startsWith("18:00") &&
      results.scheduling.state?.usage?.promptEditsCount === 5 &&
      String(results.scheduling.editResults?.[5]?.output || "").includes("limite de 5") &&
      results.scheduling.deliveryOk === true &&
      String(results.scheduling.response || "").includes("/agendamentos"),
  );

  results.summary = {
    salonOk,
    deliveryOk,
    schedulingOk,
    success: salonOk && deliveryOk && schedulingOk,
  };

  const outDir = path.resolve("test-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `admin-guided-flow-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2), "utf-8");

  rawLog(`[check] admin-guided-flow => salon=${salonOk} delivery=${deliveryOk} scheduling=${schedulingOk}`);
  rawLog(`[check] report => ${outFile}`);
  rawLog(JSON.stringify(results, null, 2));
  process.exit(results.summary.success ? 0 : 2);
}

main().catch((error) => {
  rawError("[check] script failed", error);
  process.exit(1);
});
