import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { supabase } from "../server/supabaseAuth";
import {
  generateProviderResponse,
  getAvailableSlots,
  getBookingState,
  resetBookingState,
} from "../server/providerAIService";

const email = "contato@jbeletrica.com.br";
const outputDir = path.join(process.cwd(), "output", "validation");

type HistoryEntry = { fromMe: boolean; text: string };
type AssertionRecord = {
  name: string;
  passed: boolean;
  details?: Record<string, unknown>;
};

type ConversationContext = {
  userId: string;
  phone: string;
  conversationId: string;
  history: HistoryEntry[];
};

function createPhone(suffix: string): string {
  return `551199996${suffix.padStart(3, "0")}`;
}

async function getUserId(): Promise<string> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error(`Usuario nao encontrado: ${email}`);
  return data.id;
}

async function cleanupConversation(userId: string, phone: string, conversationId: string): Promise<void> {
  await supabase
    .from("provider_appointments")
    .delete()
    .eq("user_id", userId)
    .eq("client_phone", phone);

  resetBookingState(userId, phone, conversationId);
}

async function startConversation(userId: string, suffix: string): Promise<ConversationContext> {
  const phone = createPhone(suffix);
  const conversationId = `sim-codex-jb-suite-${suffix}`;
  await cleanupConversation(userId, phone, conversationId);
  return {
    userId,
    phone,
    conversationId,
    history: [],
  };
}

async function sendStep(ctx: ConversationContext, text: string) {
  const result = await generateProviderResponse(
    ctx.userId,
    ctx.conversationId,
    ctx.phone,
    text,
    ctx.history,
  );

  ctx.history.push({ fromMe: false, text });
  ctx.history.push({ fromMe: true, text: result?.text || "" });

  return {
    reply: result?.text || "",
    state: JSON.parse(JSON.stringify(getBookingState(ctx.userId, ctx.phone, ctx.conversationId))),
  };
}

async function readAppointments(userId: string, phone: string) {
  const { data, error } = await supabase
    .from("provider_appointments")
    .select("id, client_name, client_phone, service_name, appointment_date, start_time, status")
    .eq("user_id", userId)
    .eq("client_phone", phone)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function minutesOf(time: string): number {
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  return ((hour || 0) * 60) + (minute || 0);
}

function pickLaterSlot(slots: string[], referenceTime: string): string | null {
  const referenceMinutes = minutesOf(referenceTime);
  return slots.find((slot) => minutesOf(slot) > referenceMinutes) || null;
}

function pickUnavailableTime(slots: string[]): string | null {
  const candidates = [
    "09:00",
    "10:00",
    "11:30",
    "12:00",
    "12:30",
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
  ];

  return candidates.find((candidate) => !slots.includes(candidate)) || null;
}

function recordAssertion(
  assertions: AssertionRecord[],
  name: string,
  passed: boolean,
  details?: Record<string, unknown>,
): void {
  assertions.push({ name, passed, details });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const userId = await getUserId();
  const assertions: AssertionRecord[] = [];

  const flowA = await startConversation(userId, "201");
  const stepA1 = await sendStep(flowA, "quero instalar uma tomada em ponto existente");
  recordAssertion(assertions, "01_servico_identificado", Boolean(stepA1.state.service?.name), {
    state: stepA1.state,
  });
  recordAssertion(assertions, "02_pede_autorizacao_antes_da_agenda", stepA1.state.awaitingAvailabilityConsent === true, {
    reply: stepA1.reply,
    state: stepA1.state,
  });

  const stepA2 = await sendStep(flowA, "sim");
  const offeredDate = String(stepA2.state.date || "");
  const offeredTime = String(stepA2.state.time || "");
  const offeredSlots = offeredDate
    ? await getAvailableSlots(userId, offeredDate, stepA2.state.professional?.id, stepA2.state.service?.duration_minutes)
    : [];

  recordAssertion(assertions, "03_consentimento_traz_slot_real", Boolean(offeredDate && offeredTime && offeredSlots.includes(offeredTime)), {
    offeredDate,
    offeredTime,
    offeredSlots,
  });
  recordAssertion(assertions, "04_disponibilidade_nao_polui_nome_endereco", !stepA2.state.customerName && !stepA2.state.customerAddress, {
    state: stepA2.state,
  });

  const stepA3 = await sendStep(flowA, "pode ser mais tarde");
  const laterTime = String(stepA3.state.time || "");
  const laterDate = String(stepA3.state.date || "");
  const laterSlots = laterDate
    ? await getAvailableSlots(userId, laterDate, stepA3.state.professional?.id, stepA3.state.service?.duration_minutes)
    : [];

  recordAssertion(assertions, "05_mais_tarde_mantem_mesma_data", laterDate === offeredDate, {
    offeredDate,
    laterDate,
    reply: stepA3.reply,
  });
  recordAssertion(assertions, "06_mais_tarde_pega_slot_real_posterior", Boolean(laterTime && laterSlots.includes(laterTime) && minutesOf(laterTime) > minutesOf(offeredTime)), {
    offeredTime,
    laterTime,
    laterSlots,
  });
  recordAssertion(assertions, "07_mais_tarde_ainda_nao_polui_nome_endereco", !stepA3.state.customerName && !stepA3.state.customerAddress, {
    state: stepA3.state,
  });

  const exactRequestedTime = pickLaterSlot(laterSlots, laterTime) || laterTime;
  const stepA4 = await sendStep(flowA, `e as ${exactRequestedTime}?`);
  recordAssertion(assertions, "08_horario_explicito_livre_respeitado", String(stepA4.state.time || "") === exactRequestedTime, {
    exactRequestedTime,
    state: stepA4.state,
    reply: stepA4.reply,
  });
  recordAssertion(assertions, "09_horario_explicito_nao_polui_nome_endereco", !stepA4.state.customerName && !stepA4.state.customerAddress, {
    state: stepA4.state,
  });

  const stepA5 = await sendStep(flowA, "sim");
  const appointmentsA = await readAppointments(userId, flowA.phone);
  const createdA = appointmentsA[0] || null;
  recordAssertion(assertions, "10_confirmacao_cria_agendamento_real", Boolean(createdA), {
    reply: stepA5.reply,
    appointmentsA,
  });
  recordAssertion(assertions, "11_agendamento_salvo_com_slot_correto", Boolean(createdA && createdA.appointment_date === offeredDate && createdA.start_time === exactRequestedTime), {
    createdA,
    offeredDate,
    exactRequestedTime,
  });
  recordAssertion(assertions, "12_nome_nao_herda_frase_de_disponibilidade", Boolean(createdA && createdA.client_name === "Cliente"), {
    createdA,
  });

  const flowB = await startConversation(userId, "202");
  await sendStep(flowB, "quero instalar uma tomada em ponto existente");
  const stepB2 = await sendStep(flowB, "sim");
  const busyDate = String(stepB2.state.date || "");
  const busyTimeReference = String(stepB2.state.time || "");
  const busySlots = busyDate
    ? await getAvailableSlots(userId, busyDate, stepB2.state.professional?.id, stepB2.state.service?.duration_minutes)
    : [];
  const unavailableTime = pickUnavailableTime(busySlots);

  let busyResponseState = stepB2.state;
  let busyResponseReply = stepB2.reply;
  if (unavailableTime) {
    const stepB3 = await sendStep(flowB, `e as ${unavailableTime}?`);
    busyResponseState = stepB3.state;
    busyResponseReply = stepB3.reply;
  }

  recordAssertion(assertions, "13_horario_indisponivel_nao_e_confirmado_como_real", Boolean(
    unavailableTime
    && String(busyResponseState.date || "") === busyDate
    && String(busyResponseState.time || "") !== unavailableTime
    && busySlots.includes(String(busyResponseState.time || ""))
  ), {
    busyDate,
    busyTimeReference,
    unavailableTime,
    busySlots,
    state: busyResponseState,
    reply: busyResponseReply,
  });

  const flowC = await startConversation(userId, "203");
  await sendStep(flowC, "quero instalar uma tomada em ponto existente");
  const stepC2 = await sendStep(flowC, "sim");
  const preservedDate = String(stepC2.state.date || "");
  const preservedTime = String(stepC2.state.time || "");
  const stepC3 = await sendStep(flowC, "Rodrigo\nRua Teste 123, Centro\nrodrigo.teste@example.com");

  recordAssertion(assertions, "14_bloco_de_dados_preserva_slot_validado", Boolean(
    String(stepC3.state.date || "") === preservedDate
    && String(stepC3.state.time || "") === preservedTime
  ), {
    before: { preservedDate, preservedTime },
    after: stepC3.state,
  });
  recordAssertion(assertions, "15_bloco_de_dados_extrai_nome_endereco_email", Boolean(
    stepC3.state.customerName === "Rodrigo"
    && String(stepC3.state.customerAddress || "").includes("Rua Teste 123")
    && stepC3.state.customerEmail === "rodrigo.teste@example.com"
  ), {
    state: stepC3.state,
  });

  await cleanupConversation(userId, flowA.phone, flowA.conversationId);
  await cleanupConversation(userId, flowB.phone, flowB.conversationId);
  await cleanupConversation(userId, flowC.phone, flowC.conversationId);

  const passed = assertions.filter((item) => item.passed).length;
  const total = assertions.length;
  const summary = {
    email,
    userId,
    passed,
    total,
    assertions,
  };

  const outputPath = path.join(outputDir, `provider-jb-local-suite-${Date.now()}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ passed, total, outputPath }, null, 2));
  if (passed !== total) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
