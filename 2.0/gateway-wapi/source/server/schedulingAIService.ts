import { chatComplete } from "./llm";
import {
  createPendingAppointment,
  getAvailableSlots,
  getSchedulingConfig,
  normalizeSchedulingTimeValue,
  type Appointment,
  type SchedulingConfig,
} from "./schedulingService";
import { storage } from "./storage";
import { supabase } from "./supabaseAuth";

interface SchedulingAiService {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number | null;
  requiresCustomerAddress: boolean;
}

interface SchedulingAiProfessional {
  id: string;
  name: string;
  bio: string | null;
}

interface SchedulingAiData {
  config: SchedulingConfig;
  services: SchedulingAiService[];
  professionals: SchedulingAiProfessional[];
  agentPrompt: string;
}

interface SchedulingBookingState {
  selectedServices: SchedulingAiService[];
  professional: SchedulingAiProfessional | null;
  date: string | null;
  time: string | null;
  customerName: string | null;
  customerAddress: string | null;
  awaitingConfirmation: boolean;
  lastSuggestedDate: string | null;
  lastSuggestedSlots: string[];
  createdAt: Date;
  lastUpdated: Date;
}

interface ExtractedSchedulingFields {
  intent:
    | "greeting"
    | "booking"
    | "check_availability"
    | "info_services"
    | "info_hours"
    | "info_prices"
    | "confirm"
    | "cancel"
    | "check_booking"
    | "general";
  serviceNames?: string[];
  service?: string;
  professional?: string;
  date?: string;
  time?: string;
  customerName?: string;
  customerAddress?: string;
}

const schedulingBookingStates = new Map<string, SchedulingBookingState>();
const STATE_EXPIRY_MS = 2 * 60 * 60 * 1000;

function cleanOldSchedulingAiStates(): void {
  const now = Date.now();
  for (const [key, state] of Array.from(schedulingBookingStates.entries())) {
    if (now - state.lastUpdated.getTime() > STATE_EXPIRY_MS) {
      schedulingBookingStates.delete(key);
    }
  }
}

setInterval(cleanOldSchedulingAiStates, 30 * 60 * 1000);

function buildSchedulingStateKey(userId: string, customerPhone: string, conversationId?: string): string {
  const keyBase = customerPhone || conversationId || "default";
  return `${userId}:${keyBase}`;
}

function getSchedulingBookingState(userId: string, customerPhone: string, conversationId?: string): SchedulingBookingState {
  const key = buildSchedulingStateKey(userId, customerPhone, conversationId);
  let state = schedulingBookingStates.get(key);

  if (!state) {
    state = {
      selectedServices: [],
      professional: null,
      date: null,
      time: null,
      customerName: null,
      customerAddress: null,
      awaitingConfirmation: false,
      lastSuggestedDate: null,
      lastSuggestedSlots: [],
      createdAt: new Date(),
      lastUpdated: new Date(),
    };
    schedulingBookingStates.set(key, state);
  }

  return state;
}

function resetSchedulingBookingState(userId: string, customerPhone: string, conversationId?: string): void {
  const key = buildSchedulingStateKey(userId, customerPhone, conversationId);
  schedulingBookingStates.delete(key);
}

function getBrazilNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function getBrazilToday(): string {
  const now = getBrazilNow();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDatePtBr(date: string): string {
  if (!date) return "";
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatContextualDate(date: string): string {
  if (!date) return "";

  const today = getBrazilToday();
  const tomorrowDate = new Date(`${today}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = [
    tomorrowDate.getFullYear(),
    String(tomorrowDate.getMonth() + 1).padStart(2, "0"),
    String(tomorrowDate.getDate()).padStart(2, "0"),
  ].join("-");

  if (date === today) {
    return `hoje (${formatDatePtBr(date)})`;
  }

  if (date === tomorrow) {
    return `amanhã (${formatDatePtBr(date)})`;
  }

  return formatDatePtBr(date);
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function extractFirstJsonObject(raw: string): string | null {
  const startIndex = raw.indexOf("{");
  const endIndex = raw.lastIndexOf("}");

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  return raw.slice(startIndex, endIndex + 1);
}

function rememberSuggestedSlots(state: SchedulingBookingState, date: string, slots: string[]): void {
  state.lastSuggestedDate = date;
  state.lastSuggestedSlots = slots;
  state.lastUpdated = new Date();
}

function clearSuggestedSlots(state: SchedulingBookingState): void {
  state.lastSuggestedDate = null;
  state.lastSuggestedSlots = [];
}

function detectSuggestedSlotSelection(message: string, slots: string[]): string | null {
  const normalizedMessage = normalizeText(message).replaceAll(" ", "").replaceAll(".", "").replaceAll(",", "");
  if (!normalizedMessage) {
    return null;
  }

  for (const slot of slots) {
    const [hourPart, minutePart] = slot.split(":");
    const hourNumber = Number(hourPart);
    const normalizedHour = Number.isFinite(hourNumber) ? String(hourNumber) : hourPart;
    const candidates = [
      slot,
      slot.replace(":", ""),
      `${hourPart}h${minutePart}`,
      `${normalizedHour}h${minutePart}`,
      `${hourPart}h`,
      `${normalizedHour}h`,
    ];

    for (const candidate of candidates) {
      const compactCandidate = normalizeText(candidate).replaceAll(" ", "").replaceAll(".", "").replaceAll(",", "");
      if (compactCandidate && normalizedMessage.includes(compactCandidate)) {
        return slot;
      }
    }
  }

  return null;
}

function getLastAssistantMessage(conversationHistory: Array<{ fromMe: boolean; text: string }>): string {
  for (let index = conversationHistory.length - 1; index >= 0; index -= 1) {
    const entry = conversationHistory[index];
    if (entry?.fromMe && entry.text) {
      return entry.text;
    }
  }

  return "";
}

function assistantJustAskedCustomerName(conversationHistory: Array<{ fromMe: boolean; text: string }>): boolean {
  const lastAssistantMessage = normalizeText(getLastAssistantMessage(conversationHistory));
  if (!lastAssistantMessage) {
    return false;
  }

  return lastAssistantMessage.includes("preciso do seu nome")
    || lastAssistantMessage.includes("como posso te chamar");
}

function assistantJustAskedCustomerAddress(conversationHistory: Array<{ fromMe: boolean; text: string }>): boolean {
  const lastAssistantMessage = normalizeText(getLastAssistantMessage(conversationHistory));
  if (!lastAssistantMessage) {
    return false;
  }

  return lastAssistantMessage.includes("endereco completo")
    || lastAssistantMessage.includes("rua, numero e bairro")
    || lastAssistantMessage.includes("me envie rua")
    || lastAssistantMessage.includes("preciso do endereco");
}

function isGenericAffirmativeReply(message: string): boolean {
  const normalized = normalizeText(message);
  return normalized === "sim"
    || normalized === "ok"
    || normalized === "okay"
    || normalized === "blz"
    || normalized === "beleza"
    || normalized === "pode"
    || normalized === "confirmo";
}

function inferCustomerNameFromReply(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
): string | null {
  if (!assistantJustAskedCustomerName(conversationHistory)) {
    return null;
  }

  const trimmed = String(message || "").trim();
  if (trimmed.length < 2 || isGenericAffirmativeReply(trimmed)) {
    return null;
  }

  if (trimmed.includes("\n") || trimmed.includes("@") || trimmed.includes(",")) {
    return null;
  }

  return trimmed;
}

function inferCustomerAddressFromReply(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
): string | null {
  if (!assistantJustAskedCustomerAddress(conversationHistory)) {
    return null;
  }

  const trimmed = String(message || "").trim();
  if (!trimmed || isGenericAffirmativeReply(trimmed)) {
    return null;
  }

  return trimmed;
}

function buildValidatedSlotContext(state: SchedulingBookingState): string {
  if (!state.lastSuggestedDate || state.lastSuggestedSlots.length === 0) {
    return "Nenhum slot validado recentemente.";
  }

  return [
    `Última data validada no backend: ${state.lastSuggestedDate}`,
    `Horários válidos já oferecidos ao cliente: ${state.lastSuggestedSlots.join(", ")}`,
  ].join("\n");
}

function buildSchedulingHoursText(config: SchedulingConfig): string {
  const daysMap: Record<number, string> = {
    0: "domingo",
    1: "segunda-feira",
    2: "terça-feira",
    3: "quarta-feira",
    4: "quinta-feira",
    5: "sexta-feira",
    6: "sábado",
  };

  const availableDays = Array.isArray(config.available_days)
    ? config.available_days.map((day) => daysMap[Number(day)]).filter(Boolean)
    : [];

  const breakText = config.has_break && config.break_start_time && config.break_end_time
    ? ` com pausa de ${config.break_start_time} às ${config.break_end_time}`
    : "";

  return `${availableDays.join(", ")} das ${config.work_start_time} às ${config.work_end_time}${breakText}`.trim();
}

function buildServiceSummary(services: SchedulingAiService[]): string {
  if (services.length === 0) {
    return "Atendimento";
  }

  return services.map((service) => service.name).join(" + ");
}

function getTotalDuration(services: SchedulingAiService[], fallbackMinutes: number): number {
  const total = services.reduce((sum, service) => sum + (service.durationMinutes || 0), 0);
  return total > 0 ? total : fallbackMinutes;
}

function getTotalPrice(services: SchedulingAiService[]): number | null {
  const prices = services.map((service) => service.price).filter((value): value is number => typeof value === "number");
  if (prices.length === 0) {
    return null;
  }

  return prices.reduce((sum, value) => sum + value, 0);
}

function requiresCustomerAddress(config: SchedulingConfig, services: SchedulingAiService[]): boolean {
  if (services.some((service) => service.requiresCustomerAddress)) {
    return true;
  }

  return String(config.location_type || "").toLowerCase().includes("endereco");
}

function buildCustomerNameQuestion(state: SchedulingBookingState): string {
  const contextualDate = formatContextualDate(state.date || "");
  return [
    `Perfeito! Antes de confirmar ${buildServiceSummary(state.selectedServices)}, preciso do seu nome.`,
    contextualDate ? `Data escolhida: ${contextualDate}` : "",
    state.time ? `Horário escolhido: ${state.time}` : "",
    "Como posso te chamar para finalizar o agendamento?",
  ].filter(Boolean).join("\n");
}

function buildCustomerAddressQuestion(state: SchedulingBookingState): string {
  const contextualDate = formatContextualDate(state.date || "");
  return [
    `Perfeito! Antes de confirmar ${buildServiceSummary(state.selectedServices)}, preciso do endereço completo do atendimento.`,
    contextualDate ? `Data escolhida: ${contextualDate}` : "",
    state.time ? `Horário escolhido: ${state.time}` : "",
    "Me envie rua, número e bairro para eu finalizar certinho.",
  ].filter(Boolean).join("\n");
}

function buildBookingConfirmationQuestion(state: SchedulingBookingState): string {
  const contextualDate = formatContextualDate(state.date || "");
  const totalPrice = getTotalPrice(state.selectedServices);

  return [
    `Perfeito! Vou separar ${buildServiceSummary(state.selectedServices)}${state.professional ? ` com ${state.professional.name}` : ""}.`,
    contextualDate ? `Data: ${contextualDate}` : "",
    state.time ? `Horário: ${state.time}` : "",
    totalPrice !== null ? `Valor: R$ ${totalPrice.toFixed(2).replace(".", ",")}` : "",
    "Posso confirmar?",
  ].filter(Boolean).join("\n");
}

function buildAppointmentFailureMessage(error?: string | null): string {
  const normalizedError = String(error || "").trim();

  return [
    "Desculpa, não consegui finalizar seu agendamento agora.",
    normalizedError ? `Motivo técnico: ${normalizedError}.` : "",
    "Me confirma nome, serviço, data e horário para eu tentar novamente.",
  ].filter(Boolean).join(" ");
}

function applyTemplateTokens(template: string, replacements: Record<string, string>): string {
  let nextValue = template;

  for (const [token, replacement] of Object.entries(replacements)) {
    nextValue = nextValue.split(`{${token}}`).join(replacement);
  }

  return nextValue;
}

function buildAppointmentCreatedMessage(data: SchedulingAiData, state: SchedulingBookingState): string {
  const replacements = {
    cliente_nome: state.customerName || "Cliente",
    data: formatContextualDate(state.date || ""),
    horario: state.time || "",
    servico: buildServiceSummary(state.selectedServices),
    profissional: state.professional?.name || "",
  };

  const template = data.config.confirmation_message || [
    "Perfeito! Seu agendamento foi confirmado.",
    "Data: {data}",
    "Horário: {horario}",
    "Serviço: {servico}",
  ].join("\n");

  const rendered = applyTemplateTokens(template, replacements).trim();
  const needsSummary = !template.includes("{data}") || !template.includes("{horario}");

  if (!needsSummary) {
    return rendered;
  }

  return [
    rendered,
    "",
    `Data: ${formatContextualDate(state.date || "")}`,
    `Horário: ${state.time || ""}`,
    `Serviço: ${buildServiceSummary(state.selectedServices)}`,
    state.professional ? `Profissional: ${state.professional.name}` : "",
  ].filter(Boolean).join("\n");
}

async function getSchedulingAiData(userId: string): Promise<SchedulingAiData | null> {
  const config = await getSchedulingConfig(userId);
  if (!config || !config.is_enabled || config.ai_scheduling_enabled === false) {
    return null;
  }

  const [agentConfig, servicesResult, professionalsResult] = await Promise.all([
    storage.getAgentConfig(userId).catch(() => undefined),
    supabase
      .from("scheduling_services")
      .select("id, name, description, duration_minutes, price, requires_customer_address")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("scheduling_professionals")
      .select("id, name, bio")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
  ]);

  const services = (servicesResult.data || []).map((service: any) => ({
    id: String(service.id),
    name: String(service.name || ""),
    description: service.description ? String(service.description) : null,
    durationMinutes: Number(service.duration_minutes || config.service_duration || config.slot_duration || 60),
    price: service.price !== null && service.price !== undefined ? Number(service.price) : null,
    requiresCustomerAddress: service.requires_customer_address === true,
  }));

  if (services.length === 0) {
    services.push({
      id: "default-config-service",
      name: String(config.service_name || "Atendimento"),
      description: null,
      durationMinutes: Number(config.service_duration || config.slot_duration || 60),
      price: null,
      requiresCustomerAddress: String(config.location_type || "").toLowerCase().includes("endereco"),
    });
  }

  const professionals = (professionalsResult.data || []).map((professional: any) => ({
    id: String(professional.id),
    name: String(professional.name || ""),
    bio: professional.bio ? String(professional.bio) : null,
  }));

  return {
    config,
    services,
    professionals,
    agentPrompt: String(agentConfig?.prompt || "").trim(),
  };
}

function matchProfessional(name: string | undefined, professionals: SchedulingAiProfessional[]): SchedulingAiProfessional | null {
  const normalizedTarget = normalizeText(name);
  if (!normalizedTarget) {
    return null;
  }

  return professionals.find((professional) => normalizeText(professional.name) === normalizedTarget)
    || professionals.find((professional) => normalizeText(professional.name).includes(normalizedTarget))
    || professionals.find((professional) => normalizedTarget.includes(normalizeText(professional.name)))
    || null;
}

function tokenizeServiceMatchingText(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  let compact = "";
  for (const char of normalized) {
    const isLetter = char >= "a" && char <= "z";
    const isNumber = char >= "0" && char <= "9";
    compact += isLetter || isNumber ? char : " ";
  }

  return compact
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function tokensRoughlyMatch(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  if (left.length >= 4 && right.startsWith(left)) {
    return true;
  }

  if (right.length >= 4 && left.startsWith(right)) {
    return true;
  }

  return false;
}

function scoreServiceMatchAgainstMessage(service: SchedulingAiService, message: string): number {
  const messageTokens = tokenizeServiceMatchingText(message);
  const serviceTokens = tokenizeServiceMatchingText(service.name);

  if (messageTokens.length === 0 || serviceTokens.length === 0) {
    return 0;
  }

  let score = 0;
  for (const serviceToken of serviceTokens) {
    if (messageTokens.some((messageToken) => tokensRoughlyMatch(serviceToken, messageToken))) {
      score += serviceToken.length >= 6 ? 3 : 2;
    }
  }

  const normalizedMessage = normalizeText(message);
  const normalizedServiceName = normalizeText(service.name);

  if (normalizedMessage.includes(normalizedServiceName) || normalizedServiceName.includes(normalizedMessage)) {
    score += 5;
  }

  return score;
}

function inferServicesFromMessage(message: string, services: SchedulingAiService[]): SchedulingAiService[] {
  const scoredServices = services
    .map((service) => ({
      service,
      score: scoreServiceMatchAgainstMessage(service, message),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scoredServices.length === 0) {
    return [];
  }

  const bestScore = scoredServices[0].score;
  if (bestScore < 3) {
    return [];
  }

  return scoredServices
    .filter((entry) => entry.score === bestScore)
    .map((entry) => entry.service);
}

function matchServices(
  extracted: ExtractedSchedulingFields,
  services: SchedulingAiService[],
  config: SchedulingConfig,
  rawMessage?: string,
): SchedulingAiService[] {
  const explicitNames = Array.isArray(extracted.serviceNames) && extracted.serviceNames.length > 0
    ? extracted.serviceNames
    : (extracted.service ? [extracted.service] : []);

  const matched = explicitNames
    .map((candidate) => {
      const normalizedCandidate = normalizeText(candidate);
      if (!normalizedCandidate) {
        return null;
      }

      return services.find((service) => normalizeText(service.name) === normalizedCandidate)
        || services.find((service) => normalizeText(service.name).includes(normalizedCandidate))
        || services.find((service) => normalizedCandidate.includes(normalizeText(service.name)))
        || null;
    })
    .filter((service, index, array): service is SchedulingAiService => Boolean(service) && array.findIndex((candidate) => candidate?.id === service.id) === index);

  if (matched.length > 0) {
    return matched;
  }

  if (config.use_services === false && services.length > 0) {
    return [services[0]];
  }

  if (rawMessage) {
    const inferred = inferServicesFromMessage(rawMessage, services);
    if (inferred.length > 0) {
      return inferred;
    }
  }

  return [];
}

async function extractSchedulingFieldsLLM(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  data: SchedulingAiData,
  state: SchedulingBookingState,
): Promise<ExtractedSchedulingFields> {
  const today = getBrazilToday();
  const now = getBrazilNow();
  const servicesList = data.services.map((service) => service.name).join(", ");
  const professionalsList = data.professionals.map((professional) => professional.name).join(", ");
  const selectedServiceNames = state.selectedServices.map((service) => service.name).join(", ");
  const recentHistory = conversationHistory.slice(-8).map((entry) => `${entry.fromMe ? "Atendente" : "Cliente"}: ${entry.text}`).join("\n");

  const prompt = [
    "Você extrai dados estruturados de uma conversa de agendamento por WhatsApp.",
    "Retorne SOMENTE JSON válido, sem markdown e sem texto extra.",
    `Hoje em São Paulo é ${today}. Hora atual aproximada: ${now.toTimeString().slice(0, 5)}.`,
    "",
    "Catálogo oficial de serviços:",
    servicesList || "Nenhum serviço cadastrado.",
    "",
    "Profissionais oficiais:",
    professionalsList || "Nenhum profissional cadastrado.",
    "",
    "Estado atual do agendamento:",
    `Serviços já escolhidos: ${selectedServiceNames || "nenhum"}`,
    `Profissional já escolhido: ${state.professional?.name || "nenhum"}`,
    `Data já escolhida: ${state.date || "nenhuma"}`,
    `Horário já escolhido: ${state.time || "nenhum"}`,
    `Nome do cliente já coletado: ${state.customerName || "nenhum"}`,
    `Endereço já coletado: ${state.customerAddress || "nenhum"}`,
    buildValidatedSlotContext(state),
    "",
    "Histórico recente:",
    recentHistory || "Sem histórico.",
    "",
    "Mensagem atual do cliente:",
    message,
    "",
    "JSON esperado:",
    '{"intent":"greeting|booking|check_availability|info_services|info_hours|info_prices|confirm|cancel|check_booking|general","serviceNames":["nomes exatos ou []"],"service":"texto livre ou null","professional":"nome exato ou null","date":"YYYY-MM-DD ou null","time":"HH:mm ou null","customerName":"nome ou null","customerAddress":"texto ou null"}',
    "",
    "Regras:",
    "- Use serviceNames com nomes exatos do catálogo quando houver correspondência clara.",
    "- Se o cliente pedir mais de um serviço, preencha serviceNames com todos os nomes identificados.",
    "- Resolva referências relativas de data como hoje, amanhã e dia da semana para YYYY-MM-DD.",
    "- Use a hora atual de São Paulo como referência viva para não tratar horário passado como opção válida de hoje.",
    "- Nunca extraia como confirmação de hoje um horário que já ficou no passado em relação ao momento atual em São Paulo.",
    "- Se o cliente só escolheu um horário entre slots já oferecidos, retorne esse horário em HH:mm.",
    "- Se a mensagem for uma confirmação curta como sim, pode ser intent=confirm.",
    "- Se não houver dado, use null ou [].",
  ].join("\n");

  try {
    const result = await chatComplete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 260,
      randomSeed: 42,
    });

    const raw = String(result.choices?.[0]?.message?.content || "{}");
    const jsonPayload = extractFirstJsonObject(raw);
    if (!jsonPayload) {
      return { intent: "general" };
    }

    const parsed = JSON.parse(jsonPayload);
    const normalizedTime = normalizeSchedulingTimeValue(parsed.time || undefined);

    return {
      intent: parsed.intent || "general",
      serviceNames: Array.isArray(parsed.serviceNames)
        ? parsed.serviceNames.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : undefined,
      service: parsed.service ? String(parsed.service).trim() : undefined,
      professional: parsed.professional ? String(parsed.professional).trim() : undefined,
      date: parsed.date ? String(parsed.date).trim() : undefined,
      time: normalizedTime || undefined,
      customerName: parsed.customerName ? String(parsed.customerName).trim() : undefined,
      customerAddress: parsed.customerAddress ? String(parsed.customerAddress).trim() : undefined,
    };
  } catch (error) {
    console.error("[SchedulingAI] Erro na extração LLM:", error);
    return { intent: "general" };
  }
}

async function generateSchedulingConversationalReply(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  data: SchedulingAiData,
  state: SchedulingBookingState,
  contextMessage: string,
): Promise<string> {
  const { config, services, professionals, agentPrompt } = data;
  const serviceCatalogForPrompt = services.length > 20 ? services.slice(0, 20) : services;
  const servicesInfo = serviceCatalogForPrompt.map((service) => {
    const price = service.price !== null ? `R$ ${service.price.toFixed(2).replace(".", ",")}` : "Consulte";
    return `- ${service.name}: ${price} (${service.durationMinutes}min)${service.description ? ` - ${service.description}` : ""}`;
  }).join("\n");
  const servicesInfoFooter = services.length > serviceCatalogForPrompt.length
    ? `\n- ... e mais ${services.length - serviceCatalogForPrompt.length} serviços no catálogo.`
    : "";
  const professionalsInfo = professionals.length > 0
    ? professionals.map((professional) => `- ${professional.name}${professional.bio ? ` - ${professional.bio}` : ""}`).join("\n")
    : "Nenhum profissional específico cadastrado.";
  const stateInfo = [
    `Serviços escolhidos: ${buildServiceSummary(state.selectedServices)}`,
    `Profissional: ${state.professional?.name || "nenhum"}`,
    `Data: ${state.date || "nenhuma"}`,
    `Horário: ${state.time || "nenhum"}`,
    `Nome do cliente: ${state.customerName || "não informado"}`,
    `Endereço do cliente: ${state.customerAddress || "não informado"}`,
    `Aguardando confirmação: ${state.awaitingConfirmation ? "sim" : "não"}`,
    buildValidatedSlotContext(state),
  ].join("\n");

  const systemPrompt = [
    "Você é o atendente virtual do negócio do cliente, conversando por WhatsApp de forma humana, profissional e natural.",
    "",
    agentPrompt ? `INSTRUÇÕES DO DONO:\n${agentPrompt}\n` : "",
    "CONTEXTO DO AGENDAMENTO:",
    `Serviço padrão configurado: ${config.service_name || "Atendimento"}`,
    `Horários de funcionamento: ${buildSchedulingHoursText(config)}`,
    config.location ? `Local: ${config.location}` : "",
    config.location_type ? `Tipo de atendimento: ${config.location_type}` : "",
    "",
    "SERVIÇOS DISPONÍVEIS:",
    `${servicesInfo || "Nenhum serviço cadastrado."}${servicesInfoFooter}`,
    "",
    "PROFISSIONAIS DISPONÍVEIS:",
    professionalsInfo,
    "",
    "ESTADO DO AGENDAMENTO:",
    stateInfo,
    "",
    contextMessage ? `CONTEXTO IMPORTANTE DESTE TURNO:\n${contextMessage}\n` : "",
    "REGRAS:",
    "- Fale como uma pessoa real no WhatsApp, sem parecer robô.",
    "- Não invente disponibilidade, horário ou data.",
    "- Se faltarem dados para concluir, peça só o próximo dado necessário.",
    "- Não confirme agendamento sem nome do cliente.",
    "- Se o serviço exigir endereço, peça o endereço antes da confirmação final.",
    "- Se houver slots já validados no estado, use apenas esses slots como referência.",
    "- Seja breve, clara e humana.",
  ].filter(Boolean).join("\n");

  try {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-6).map((entry) => ({
        role: entry.fromMe ? "assistant" : "user" as const,
        content: entry.text,
      })),
      { role: "user", content: message },
    ];

    const result = await chatComplete({
      messages,
      maxTokens: 320,
      temperature: 0.7,
    });

    return String(result.choices?.[0]?.message?.content || "Como posso te ajudar com seu agendamento?");
  } catch (error) {
    console.error("[SchedulingAI] Erro ao gerar resposta conversacional:", error);
    return "Desculpa, tive um problema agora. Pode repetir por favor?";
  }
}

function buildAvailabilityMessage(
  targetDate: string,
  slots: string[],
  services: SchedulingAiService[],
  options?: {
    shouldAskForService?: boolean;
  },
): string {
  const contextualDate = formatContextualDate(targetDate);
  const displaySlots = slots.length <= 8
    ? slots
    : slots.filter((_, index) => index % Math.max(1, Math.floor(slots.length / 8)) === 0).slice(0, 8);
  const totalMsg = slots.length > displaySlots.length ? ` (${slots.length} horários no total)` : "";
  const shouldAskForService = options?.shouldAskForService !== false;
  const servicesHint = shouldAskForService && services.length > 0
    ? `\n\nQual serviço você gostaria? Temos: ${services.slice(0, 5).map((service) => service.name).join(", ")}`
    : "";

  return `Para ${contextualDate}, tenho estes horários disponíveis${totalMsg}:\n${displaySlots.join(", ")}${servicesHint}`;
}

function buildUnavailableDateMessage(targetDate: string): string {
  return `Não encontrei horários disponíveis para ${formatContextualDate(targetDate)}. Me fala outra data que eu verifico na agenda real para você.`;
}

function addDays(date: string, daysToAdd: number): string {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + daysToAdd);
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

async function findNextAvailableSchedulingSlot(
  userId: string,
  config: SchedulingConfig,
  selectedServices: SchedulingAiService[],
  maxDaysAhead: number = 14,
): Promise<{ date: string; time: string } | null> {
  const serviceDurationMinutes = getTotalDuration(
    selectedServices,
    Number(config.service_duration || config.slot_duration || 60),
  );

  for (let dayOffset = 0; dayOffset < maxDaysAhead; dayOffset += 1) {
    const targetDate = addDays(getBrazilToday(), dayOffset);
    const slots = await getAvailableSlots(userId, targetDate, config, { serviceDurationMinutes });
    const firstAvailable = slots.find((slot) => slot.available);
    if (firstAvailable?.start) {
      return {
        date: targetDate,
        time: firstAvailable.start,
      };
    }
  }

  return null;
}

function buildSingleSlotOfferMessage(date: string, time: string): string {
  return [
    `O primeiro horário disponível é ${formatContextualDate(date)}, às ${time}.`,
    "Esse horário fica melhor para você?",
  ].join("\n\n");
}

export async function generateSchedulingAiResponse(
  userId: string,
  conversationId: string,
  customerPhone: string,
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>,
): Promise<{ text: string; appointmentCreated?: Appointment } | null> {
  const data = await getSchedulingAiData(userId);
  if (!data) {
    return null;
  }

  const history = conversationHistory || [];
  const state = getSchedulingBookingState(userId, customerPhone, conversationId);
  const previousDate = state.date;
  const previousServiceSummary = buildServiceSummary(state.selectedServices);

  const extracted = await extractSchedulingFieldsLLM(message, history, data, state);

  if (extracted.intent === "cancel" || extracted.intent === "check_booking") {
    return null;
  }

  const selectedSuggestedSlot = !extracted.time
    ? detectSuggestedSlotSelection(message, state.lastSuggestedSlots)
    : null;
  const assistantAskedName = assistantJustAskedCustomerName(history);
  const assistantAskedAddress = assistantJustAskedCustomerAddress(history);
  const shouldLockOperationalSelection = assistantAskedName || assistantAskedAddress;
  let acceptedSuggestedSlot = false;

  if (selectedSuggestedSlot) {
    extracted.time = selectedSuggestedSlot;
    if (!extracted.date && state.lastSuggestedDate) {
      extracted.date = state.lastSuggestedDate;
    }
    acceptedSuggestedSlot = true;
  }

  if (
    isGenericAffirmativeReply(message)
    && state.lastSuggestedSlots.length === 1
    && state.lastSuggestedDate
  ) {
    extracted.time = state.lastSuggestedSlots[0];
    extracted.date = extracted.date || state.lastSuggestedDate;
    extracted.intent = "confirm";
    acceptedSuggestedSlot = true;
  }

  if (!extracted.customerName && !state.customerName) {
    const inferredCustomerName = inferCustomerNameFromReply(message, history);
    if (inferredCustomerName) {
      extracted.customerName = inferredCustomerName;
    }
  }

  if (!extracted.customerAddress && !state.customerAddress) {
    const inferredCustomerAddress = inferCustomerAddressFromReply(message, history);
    if (inferredCustomerAddress) {
      extracted.customerAddress = inferredCustomerAddress;
    }
  }

  if (extracted.customerName && !state.customerName) {
    state.customerName = extracted.customerName;
  }

  if (extracted.customerAddress && !state.customerAddress) {
    state.customerAddress = extracted.customerAddress;
  }

  const matchedServices = matchServices(extracted, data.services, data.config, message);
  if (matchedServices.length > 0 && (!shouldLockOperationalSelection || state.selectedServices.length === 0)) {
    state.selectedServices = matchedServices;
  }

  if (data.config.use_professionals && data.professionals.length === 1 && !state.professional) {
    state.professional = data.professionals[0];
  } else if (extracted.professional && (!shouldLockOperationalSelection || !state.professional)) {
    const matchedProfessional = matchProfessional(extracted.professional, data.professionals);
    if (matchedProfessional) {
      state.professional = matchedProfessional;
    }
  }

  if (extracted.date && (!shouldLockOperationalSelection || !state.date)) {
    state.date = extracted.date;
  }

  if (extracted.time && (!shouldLockOperationalSelection || !state.time)) {
    state.time = extracted.time;
  }

  const currentServiceSummary = buildServiceSummary(state.selectedServices);
  if (previousDate !== state.date || previousServiceSummary !== currentServiceSummary) {
    clearSuggestedSlots(state);
    if (previousDate !== state.date && !acceptedSuggestedSlot) {
      state.time = null;
    }
    if (previousServiceSummary !== currentServiceSummary) {
      state.time = null;
    }
    state.awaitingConfirmation = false;
  }

  state.lastUpdated = new Date();

  const hasService = state.selectedServices.length > 0;
  const hasDate = Boolean(state.date);
  const hasTime = Boolean(state.time);
  const hasName = Boolean(state.customerName?.trim());
  const needsAddress = requiresCustomerAddress(data.config, state.selectedServices);
  const hasAddress = Boolean(state.customerAddress?.trim());
  const hasAllBookingData = hasService && hasDate && hasTime;
  const isCollectingBookingDetails = hasAllBookingData && (!hasName || (needsAddress && !hasAddress));
  const shouldConfirm = state.awaitingConfirmation && (extracted.intent === "confirm" || isGenericAffirmativeReply(message));

  if (shouldConfirm) {
    if (!hasAllBookingData) {
      state.awaitingConfirmation = false;
      return {
        text: await generateSchedulingConversationalReply(message, history, data, state, "Faltam dados para confirmar o agendamento. Pergunte o próximo dado necessário."),
      };
    }

    if (!hasName) {
      state.awaitingConfirmation = false;
      return { text: buildCustomerNameQuestion(state) };
    }

    if (needsAddress && !hasAddress) {
      state.awaitingConfirmation = false;
      return { text: buildCustomerAddressQuestion(state) };
    }

    const slots = await getAvailableSlots(userId, state.date!, data.config, {
      serviceDurationMinutes: getTotalDuration(state.selectedServices, Number(data.config.service_duration || data.config.slot_duration || 60)),
    });
    const availableSlots = slots.filter((slot) => slot.available).map((slot) => slot.start);

    if (!availableSlots.includes(state.time!)) {
      state.awaitingConfirmation = false;
      state.time = null;
      rememberSuggestedSlots(state, state.date!, availableSlots.slice(0, 8));
      return {
        text: buildAvailabilityMessage(state.date!, availableSlots, data.services, {
          shouldAskForService: state.selectedServices.length === 0,
        }),
      };
    }

    const serviceLabel = buildServiceSummary(state.selectedServices);
    const result = await createPendingAppointment(
      userId,
      state.customerName!.trim(),
      customerPhone,
      state.date!,
      state.time!,
      undefined,
      data.config,
      serviceLabel,
      conversationId,
      state.customerAddress || undefined,
      undefined,
      state.professional?.id,
      state.professional?.name,
    );

    if (result.success && result.appointment) {
      const confirmationState: SchedulingBookingState = {
        ...state,
        awaitingConfirmation: false,
        createdAt: new Date(),
        lastUpdated: new Date(),
      };
      clearSuggestedSlots(confirmationState);
      resetSchedulingBookingState(userId, customerPhone, conversationId);

      return {
        text: buildAppointmentCreatedMessage(data, confirmationState),
        appointmentCreated: result.appointment,
      };
    }

    if (result.error === "Horário não disponível") {
      const refreshedSlots = await getAvailableSlots(userId, state.date!, data.config, {
        serviceDurationMinutes: getTotalDuration(state.selectedServices, Number(data.config.service_duration || data.config.slot_duration || 60)),
      });
      const availableTimes = refreshedSlots.filter((slot) => slot.available).map((slot) => slot.start);
      state.awaitingConfirmation = false;
      state.time = null;
      rememberSuggestedSlots(state, state.date!, availableTimes.slice(0, 8));
      return {
        text: buildAvailabilityMessage(state.date!, availableTimes, data.services, {
          shouldAskForService: state.selectedServices.length === 0,
        }),
      };
    }

    state.awaitingConfirmation = false;
    return { text: buildAppointmentFailureMessage(result.error) };
  }

  if (extracted.intent === "check_availability") {
    if (hasAllBookingData) {
      if (!hasName) {
        clearSuggestedSlots(state);
        return { text: buildCustomerNameQuestion(state) };
      }

      if (needsAddress && !hasAddress) {
        clearSuggestedSlots(state);
        return { text: buildCustomerAddressQuestion(state) };
      }

      state.awaitingConfirmation = true;
      clearSuggestedSlots(state);
      return { text: buildBookingConfirmationQuestion(state) };
    }

    if (isCollectingBookingDetails) {
      if (!hasName) {
        clearSuggestedSlots(state);
        return { text: buildCustomerNameQuestion(state) };
      }

      if (needsAddress && !hasAddress) {
        clearSuggestedSlots(state);
        return { text: buildCustomerAddressQuestion(state) };
      }
    }

    const targetDate = extracted.date || state.date;
    if (!targetDate) {
      return {
        text: await generateSchedulingConversationalReply(message, history, data, state, "O cliente quer consultar disponibilidade, mas ainda não informou a data. Pergunte qual dia ele prefere."),
      };
    }

    state.date = targetDate;
    const slots = await getAvailableSlots(userId, targetDate, data.config, {
      serviceDurationMinutes: getTotalDuration(state.selectedServices, Number(data.config.service_duration || data.config.slot_duration || 60)),
    });
    const availableTimes = slots.filter((slot) => slot.available).map((slot) => slot.start);
    if (availableTimes.length === 0) {
      clearSuggestedSlots(state);
      return { text: buildUnavailableDateMessage(targetDate) };
    }

    rememberSuggestedSlots(state, targetDate, availableTimes.slice(0, 8));
    return {
      text: buildAvailabilityMessage(targetDate, availableTimes, data.services, {
        shouldAskForService: state.selectedServices.length === 0,
      }),
    };
  }

  if (isCollectingBookingDetails) {
    if (!hasName) {
      clearSuggestedSlots(state);
      return { text: buildCustomerNameQuestion(state) };
    }

    if (needsAddress && !hasAddress) {
      clearSuggestedSlots(state);
      return { text: buildCustomerAddressQuestion(state) };
    }
  }

  const isBookingIntent = extracted.intent === "booking" || hasService || hasDate || hasTime;
  if (isBookingIntent) {
    if (!hasService) {
      return {
        text: await generateSchedulingConversationalReply(message, history, data, state, `O cliente quer agendar mas ainda não definiu o serviço. Serviços disponíveis: ${data.services.map((service) => service.name).join(", ")}. Pergunte qual serviço ele quer.`),
      };
    }

    if (data.config.use_professionals && data.professionals.length > 1 && !state.professional) {
      return {
        text: await generateSchedulingConversationalReply(message, history, data, state, `O cliente já escolheu o serviço ${buildServiceSummary(state.selectedServices)}. Profissionais disponíveis: ${data.professionals.map((professional) => professional.name).join(", ")}. Pergunte com quem ele prefere agendar.`),
      };
    }

    if (!hasDate) {
      if (extracted.intent === "confirm") {
        const nextSlot = await findNextAvailableSchedulingSlot(userId, data.config, state.selectedServices);
        if (nextSlot) {
          clearSuggestedSlots(state);
          rememberSuggestedSlots(state, nextSlot.date, [nextSlot.time]);
          return { text: buildSingleSlotOfferMessage(nextSlot.date, nextSlot.time) };
        }

        return {
          text: "Não consegui encontrar um horário livre agora. Me fala um dia que eu consulto novamente para você.",
        };
      }

      return {
        text: await generateSchedulingConversationalReply(message, history, data, state, `O cliente já escolheu o serviço ${buildServiceSummary(state.selectedServices)}. Pergunte qual dia ele prefere.`),
      };
    }

    if (!hasTime) {
      const requestedDate = state.date!;
      const slots = await getAvailableSlots(userId, requestedDate, data.config, {
        serviceDurationMinutes: getTotalDuration(state.selectedServices, Number(data.config.service_duration || data.config.slot_duration || 60)),
      });
      const availableTimes = slots.filter((slot) => slot.available).map((slot) => slot.start);
      if (availableTimes.length === 0) {
        clearSuggestedSlots(state);
        state.date = null;
        return { text: buildUnavailableDateMessage(requestedDate) };
      }

      rememberSuggestedSlots(state, requestedDate, availableTimes.slice(0, 8));
      return {
        text: buildAvailabilityMessage(requestedDate, availableTimes, data.services, {
          shouldAskForService: state.selectedServices.length === 0,
        }),
      };
    }

    if (!hasName) {
      clearSuggestedSlots(state);
      return { text: buildCustomerNameQuestion(state) };
    }

    if (needsAddress && !hasAddress) {
      clearSuggestedSlots(state);
      return { text: buildCustomerAddressQuestion(state) };
    }

    state.awaitingConfirmation = true;
    clearSuggestedSlots(state);
    return { text: buildBookingConfirmationQuestion(state) };
  }

  if (extracted.intent === "info_services" || extracted.intent === "info_prices") {
    const catalogSummary = data.services.map((service) => {
      const price = service.price !== null ? `R$ ${service.price.toFixed(2).replace(".", ",")}` : "Consulte";
      return `${service.name}: ${price} (${service.durationMinutes}min)`;
    }).join(", ");

    return {
      text: await generateSchedulingConversationalReply(message, history, data, state, `Informe os serviços e preços disponíveis: ${catalogSummary}`),
    };
  }

  if (extracted.intent === "info_hours") {
    return {
      text: await generateSchedulingConversationalReply(message, history, data, state, `Informe os horários de funcionamento: ${buildSchedulingHoursText(data.config)}`),
    };
  }

  return {
    text: await generateSchedulingConversationalReply(message, history, data, state, ""),
  };
}
