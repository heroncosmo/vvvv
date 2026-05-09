/**
 * PROVIDER AI SERVICE v2 - SISTEMA INTELIGENTE DE AGENDAMENTO PARA PRESTADORES DE SERVICO
 *
 * ARQUITETURA (IA + VALIDAÇÃO DETERMINÍSTICA):
 * 1. IA conversa livremente com o cliente (sem menus "digite 1, 2, 3")
 * 2. IA extrai campos estruturados (serviço, profissional, data, hora) via LLM
 * 3. Validação determinística: slots reais, conflitos, horário comercial
 * 4. Confirmação explícita antes de agendar
 * 5. Agendamento seguro com revalidação pré-insert
 */

import { supabase } from "./supabaseAuth";
import { chatComplete } from "./llm";
import {
  getAvailableStartTimes,
  getAvailableStartTimesWindow,
  validateSlot,
  checkOverlapBeforeInsert,
  findAvailableProfessional,
} from "./providerAvailability";
import {
  buildDeterministicSlotSuggestionMessage,
  buildSlotDisplay,
  formatDatePtBr,
  formatProviderContextualDate,
  getBrazilNow,
  getBrazilToday,
  type BreakConfig,
  normalizeProviderDateValue,
  normalizeProviderTimeValue,
} from "./providerFormatting";
import {
  getModuleAutoConfirmValue,
  getModuleSchedulingSettings,
} from "./moduleSchedulingSettings";
import {
  syncProviderAppointmentWithCalendar,
} from "./providerCalendarSync";
import { removeAppointmentFromCalendar } from "./providerGoogleCalendarService";
import { storage } from "./storage";

// ═══════════════════════════════════════════════════════════════════════
// INTERFACES E TIPOS
// ═══════════════════════════════════════════════════════════════════════

export interface OpeningHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

export interface ProviderConfig {
  id: string;
  user_id: string;
  is_active: boolean;
  send_to_ai: boolean;
  salon_name: string | null;
  salon_type: string;
  phone: string | null;
  address: string | null;
  opening_hours?: Record<string, OpeningHoursDay> & { __break?: { enabled: boolean; start: string; end: string } };
  slot_duration: number;
  buffer_between: number;
  max_advance_days: number;
  min_notice_hours?: number;       // LEGADO - manter compatibilidade
  min_notice_minutes?: number;     // NOVO - antecedência em minutos
  allow_cancellation: boolean;
  cancellation_notice_hours: number;
  use_services: boolean;
  use_professionals: boolean;
  allow_multiple_services: boolean;
  welcome_message?: string;
  booking_confirmation_message?: string;
  reminder_message?: string;
  cancellation_message?: string;
  closed_message?: string;
  humanize_responses?: boolean;
  use_customer_name?: boolean;
  response_variation?: boolean;
  response_delay_min?: number;
  response_delay_max?: number;
  ai_instructions?: string;
  display_instructions?: string;
  require_confirmation?: boolean;
  auto_confirm?: boolean;
  send_reminder?: boolean;
  reminder_hours_before?: number;
  reminder_times?: number[];
  booking_notification_enabled?: boolean;
  booking_notification_phone?: string | null;
  slot_suggestion_mode?: "first_available" | "ask_preference";
}

export interface ProviderService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
  color: string | null;
}

export interface ProviderProfessional {
  id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  work_schedule: Record<string, any>;
}

export interface ProviderData {
  config: ProviderConfig;
  services: ProviderService[];
  professionals: ProviderProfessional[];
}

// Keep old types exported for compatibility
export type ProviderIntent = 'GREETING' | 'WANT_SERVICES' | 'WANT_PROFESSIONALS' | 'WANT_TO_BOOK' | 'SELECT_SERVICE' | 'SELECT_PROFESSIONAL' | 'SELECT_DATE' | 'SELECT_TIME' | 'CONFIRM_BOOKING' | 'CANCEL_BOOKING' | 'CHECK_BOOKING' | 'ASK_BUSINESS_HOURS' | 'ASK_PRICES' | 'PROVIDE_NAME' | 'OTHER';

// ═══════════════════════════════════════════════════════════════════════
// ESTADO DO AGENDAMENTO (EM MEMÓRIA)
// ═══════════════════════════════════════════════════════════════════════

interface BookingState {
  service: ProviderService | null;
  professional: ProviderProfessional | null;
  date: string | null;       // YYYY-MM-DD
  time: string | null;       // HH:mm
  customerType: string | null;
  customerName: string | null;
  customerAddress: string | null;
  customerEmail: string | null;
  paymentMethod: string | null;
  customerPhone: string;
  awaitingConfirmation: boolean;
  awaitingAvailabilityConsent: boolean;
  awaitingPaymentMethod: boolean;
  awaitingFinalConfirmation: boolean;
  lastSuggestedDate: string | null;
  lastSuggestedSlots: string[];
  agendaWindowContext: string | null;
  createdAt: Date;
  lastUpdated: Date;
}

interface ProviderAppointmentConversationSnapshot {
  sourceChannel: "simulator" | "whatsapp";
  originalClientPhone: string;
  persistedClientPhone: string;
  requestedConversationId: string | null;
  customerType: string | null;
  customerName: string | null;
  customerAddress: string | null;
  customerEmail: string | null;
  paymentMethod: string | null;
  serviceId: string | null;
  serviceName: string | null;
  professionalId: string | null;
  professionalName: string | null;
  requestedDate: string | null;
  requestedTime: string | null;
  recentConversation: string[];
}

const bookingStates = new Map<string, BookingState>();
const providerAgendaWindowPromptCache = new Map<string, {
  context: string;
  generatedAt: number;
}>();
const STATE_EXPIRY_MS = 2 * 60 * 60 * 1000;
const PROVIDER_AGENDA_WINDOW_PROMPT_TTL_MS = 60 * 1000;
const DEFAULT_PROVIDER_SIMULATOR_PHONE = "5511999999999";
const PROVIDER_APPOINTMENT_CONTEXT_LIMIT = 6;

function cleanOldStates(): void {
  const now = Date.now();
  for (const [key, state] of Array.from(bookingStates.entries())) {
    if (now - state.lastUpdated.getTime() > STATE_EXPIRY_MS) {
      bookingStates.delete(key);
    }
  }
}
setInterval(cleanOldStates, 30 * 60 * 1000);

export function getBookingState(userId: string, customerPhone: string, conversationId?: string): BookingState {
  const keyBase = customerPhone || conversationId || 'default';
  const key = `${userId}:${keyBase}`;
  let state = bookingStates.get(key);
  if (!state) {
    state = {
      service: null,
      professional: null,
      date: null,
      time: null,
      customerType: null,
      customerName: null,
      customerAddress: null,
      customerEmail: null,
      paymentMethod: null,
      customerPhone,
      awaitingConfirmation: false,
      awaitingAvailabilityConsent: false,
      awaitingPaymentMethod: false,
      awaitingFinalConfirmation: false,
      lastSuggestedDate: null,
      lastSuggestedSlots: [],
      agendaWindowContext: null,
      createdAt: new Date(),
      lastUpdated: new Date(),
    };
    bookingStates.set(key, state);
  }
  return state;
}

export function resetBookingState(userId: string, customerPhone: string, conversationId?: string): void {
  const keyBase = customerPhone || conversationId || 'default';
  const key = `${userId}:${keyBase}`;
  bookingStates.delete(key);
  console.log(`💇 [Provider] Estado resetado: ${key}`);
}

function rememberSuggestedSlots(state: BookingState, date: string, slots: string[]): void {
  state.lastSuggestedDate = date;
  state.lastSuggestedSlots = buildSlotDisplay(slots);
  state.lastUpdated = new Date();
}

function clearSuggestedSlots(state: BookingState): void {
  state.lastSuggestedDate = null;
  state.lastSuggestedSlots = [];
}

function buildProviderAgendaWindowPromptCacheKey(params: {
  userId: string;
  professionalId?: string | null;
  durationMinutes: number;
  startDate: string;
  dayCount: number;
}): string {
  return [
    params.userId,
    params.professionalId || "all",
    String(params.durationMinutes),
    params.startDate,
    String(params.dayCount),
  ].join("|");
}

async function buildProviderAgendaWindowPromptContext(params: {
  userId: string;
  providerData: ProviderData;
  bookingState: BookingState;
}): Promise<string | null> {
  const dayCount = Math.max(1, Math.min(params.providerData.config.max_advance_days || 30, 30));
  const startDate = getBrazilToday();
  const durationMinutes = params.bookingState.service?.duration_minutes
    || params.providerData.config.slot_duration
    || 30;
  const professionalId = params.bookingState.professional?.id || null;
  const cacheKey = buildProviderAgendaWindowPromptCacheKey({
    userId: params.userId,
    professionalId,
    durationMinutes,
    startDate,
    dayCount,
  });
  const cached = providerAgendaWindowPromptCache.get(cacheKey);
  if (cached && (Date.now() - cached.generatedAt) < PROVIDER_AGENDA_WINDOW_PROMPT_TTL_MS) {
    return cached.context;
  }

  try {
    const windowResult = await getAvailableStartTimesWindow({
      userId: params.userId,
      startDate,
      dayCount,
      professionalId: professionalId || undefined,
      serviceDurationMinutes: durationMinutes,
      stepMinutes: 15,
    });

    let context: string;
    if (windowResult.enabled && windowResult.connected && !windowResult.checked) {
      context = [
        `JANELA VIVA DE DISPONIBILIDADE DOS PROXIMOS ${dayCount} DIAS:`,
        "- A agenda externa esta conectada, mas esta janela ainda esta sincronizando no espelho local.",
        "- Enquanto a sincronizacao nao concluir, nao ofereca nem agende horario especifico neste turno.",
      ].join("\n");
    } else {
      const snapshotLines = windowResult.snapshots.map((snapshot) => {
        const slots = buildSlotDisplay(snapshot.slots).join(", ");
        return `- ${formatProviderContextualDate(snapshot.date)}: ${slots}`;
      });

      context = [
        `JANELA VIVA DE DISPONIBILIDADE DOS PROXIMOS ${dayCount} DIAS:`,
        "- Esta janela e a memoria factual dos horarios disponiveis neste turno.",
        "- Considere disponivel somente o que estiver listado abaixo.",
        "- Tudo o que nao aparecer abaixo deve ser tratado como indisponivel ate nova consulta operacional.",
        "- Antes de dizer que agendou, responda internamente apenas: o cliente escolheu um horario listado abaixo e confirmou explicitamente? sim ou nao.",
        snapshotLines.length > 0 ? snapshotLines.join("\n") : "- Nenhum horario livre encontrado nesta janela.",
      ].join("\n");
    }

    console.log(
      `[Provider v2][AgendaWindowPrompt] ${JSON.stringify({
        userId: params.userId,
        professionalId,
        durationMinutes,
        startDate,
        dayCount,
        preview: context.slice(0, 500),
      })}`,
    );

    providerAgendaWindowPromptCache.set(cacheKey, {
      context,
      generatedAt: Date.now(),
    });

    return context;
  } catch (error) {
    console.warn("[Provider v2] Falha ao montar a janela viva de disponibilidade para o prompt:", error);
    return null;
  }
}

function formatProviderSlotListForLog(slots: string[], limit = 12): string {
  if (!Array.isArray(slots) || slots.length === 0) {
    return "[]";
  }

  const visibleSlots = slots.slice(0, limit);
  const suffix = slots.length > limit ? ` ... (+${slots.length - limit})` : "";
  return `[${visibleSlots.join(", ")}]${suffix}`;
}

function isProviderSimulatorPhone(phone: string): boolean {
  return String(phone || "").trim().startsWith("sim-");
}

function getProviderPersistedClientPhone(phone: string): string {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) {
    return "";
  }

  if (isProviderSimulatorPhone(normalizedPhone)) {
    return DEFAULT_PROVIDER_SIMULATOR_PHONE;
  }

  return normalizedPhone;
}

function listProviderAppointmentLookupPhones(phone: string): string[] {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone) {
    return [];
  }

  const persistedPhone = getProviderPersistedClientPhone(normalizedPhone);
  if (persistedPhone === normalizedPhone) {
    return [normalizedPhone];
  }

  return [normalizedPhone, persistedPhone];
}

function extractOriginalProviderClientPhoneFromContext(context: unknown): string | null {
  if (!context || typeof context !== "object") {
    return null;
  }

  const originalClientPhone = (context as Record<string, unknown>).originalClientPhone;
  if (typeof originalClientPhone !== "string") {
    return null;
  }

  const normalizedPhone = originalClientPhone.trim();
  return normalizedPhone || null;
}

function providerAppointmentMatchesContact(
  recordPhone: string | null | undefined,
  context: unknown,
  customerPhone: string,
): boolean {
  const normalizedCustomerPhone = String(customerPhone || "").trim();
  if (!normalizedCustomerPhone) {
    return false;
  }

  if (String(recordPhone || "").trim() === normalizedCustomerPhone) {
    return true;
  }

  return extractOriginalProviderClientPhoneFromContext(context) === normalizedCustomerPhone;
}

function buildProviderAppointmentRecentConversation(
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
): string[] {
  const recentTurns = conversationHistory.slice(-PROVIDER_APPOINTMENT_CONTEXT_LIMIT);
  const lines: string[] = [];

  for (const turn of recentTurns) {
    const text = String(turn?.text || "").trim();
    if (!text) {
      continue;
    }

    lines.push(`${turn.fromMe ? "IA" : "Cliente"}: ${text}`);
  }

  return lines;
}

function buildProviderAppointmentConversationSnapshot(
  bookingState: BookingState,
  customerPhone: string,
  conversationId: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
): ProviderAppointmentConversationSnapshot {
  const normalizedPhone = String(customerPhone || "").trim();
  return {
    sourceChannel: isProviderSimulatorPhone(normalizedPhone) ? "simulator" : "whatsapp",
    originalClientPhone: normalizedPhone,
    persistedClientPhone: getProviderPersistedClientPhone(normalizedPhone),
    requestedConversationId: String(conversationId || "").trim() || null,
    customerType: bookingState.customerType || null,
    customerName: bookingState.customerName || null,
    customerAddress: bookingState.customerAddress || null,
    customerEmail: bookingState.customerEmail || null,
    paymentMethod: bookingState.paymentMethod || null,
    serviceId: bookingState.service?.id || null,
    serviceName: bookingState.service?.name || null,
    professionalId: bookingState.professional?.id || null,
    professionalName: bookingState.professional?.name || null,
    requestedDate: bookingState.date || null,
    requestedTime: bookingState.time || null,
    recentConversation: buildProviderAppointmentRecentConversation(conversationHistory),
  };
}

function buildProviderAppointmentExtraDetails(
  snapshot?: ProviderAppointmentConversationSnapshot | null,
): string[] {
  if (!snapshot) {
    return [];
  }

  const details = [
    snapshot.customerType ? `Tipo do cliente: ${snapshot.customerType}` : "",
    snapshot.customerAddress ? `Endereco: ${snapshot.customerAddress}` : "",
    snapshot.customerEmail ? `E-mail: ${snapshot.customerEmail}` : "",
    snapshot.paymentMethod ? `Pagamento: ${snapshot.paymentMethod}` : "",
    snapshot.professionalName ? `Profissional: ${snapshot.professionalName}` : "",
  ].filter(Boolean);

  if (snapshot.sourceChannel === "simulator") {
    details.push(`Origem do contato: simulador (${snapshot.originalClientPhone})`);
  }

  return details;
}

function normalizeSimpleReply(message: string): string {
  const punctuation = new Set(["!", "?", ".", ",", ";", ":", "-", "–", "—"]);
  const decomposed = String(message || "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD");

  let sanitized = "";
  let lastWasSpace = false;

  for (const char of decomposed) {
    const code = char.charCodeAt(0);
    const isAccentMark = code >= 0x0300 && code <= 0x036f;

    if (isAccentMark) {
      continue;
    }

    const nextChar = punctuation.has(char) ? " " : char;
    const isSpace = nextChar === " " || nextChar === "\n" || nextChar === "\t" || nextChar === "\r";

    if (isSpace) {
      if (!lastWasSpace && sanitized.length > 0) {
        sanitized += " ";
      }
      lastWasSpace = true;
      continue;
    }

    sanitized += nextChar;
    lastWasSpace = false;
  }

  return sanitized.trim();
}

function tokenizeNormalizedMessage(message: string): string[] {
  return normalizeSimpleReply(message)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let current = i;
    let diagonal = i - 1;

    for (let j = 1; j <= b.length; j += 1) {
      const upper = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const next = Math.min(previous[j] + 1, current + 1, diagonal + cost);
      previous[j - 1] = current;
      current = next;
      diagonal = upper;
    }

    previous[b.length] = current;
  }

  return previous[b.length];
}

function scoreNormalizedTermOverlap(messageTokens: string[], candidateTokens: string[]): number {
  let score = 0;

  for (const messageToken of messageTokens) {
    for (const candidateToken of candidateTokens) {
      if (messageToken === candidateToken) {
        score = Math.max(score, 1);
        continue;
      }

      if (messageToken.length >= 4 && candidateToken.includes(messageToken)) {
        score = Math.max(score, 0.92);
        continue;
      }

      if (candidateToken.length >= 4 && messageToken.includes(candidateToken)) {
        score = Math.max(score, 0.88);
        continue;
      }

      const maxLength = Math.max(messageToken.length, candidateToken.length);
      if (maxLength < 4) {
        continue;
      }

      const distance = levenshteinDistance(messageToken, candidateToken);
      const similarity = 1 - distance / maxLength;
      if (similarity >= 0.72) {
        score = Math.max(score, similarity);
      }
    }
  }

  return score;
}

function matchesAnyTerm(normalizedMessage: string, terms: string[]): boolean {
  return terms.some((term) => normalizedMessage.includes(term));
}

function addDaysToIsoDate(baseDate: string, days: number): string {
  const candidate = new Date(`${baseDate}T12:00:00`);
  candidate.setDate(candidate.getDate() + days);
  const year = candidate.getFullYear();
  const month = String(candidate.getMonth() + 1).padStart(2, "0");
  const day = String(candidate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findNextWeekdayIsoDate(targetWeekday: number): string {
  const now = getBrazilNow();
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  let offset = (targetWeekday - candidate.getDay() + 7) % 7;
  if (offset === 0) {
    offset = 7;
  }
  candidate.setDate(candidate.getDate() + offset);
  const year = candidate.getFullYear();
  const month = String(candidate.getMonth() + 1).padStart(2, "0");
  const day = String(candidate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shouldIgnoreScheduleExtractionForMessage(message: string): boolean {
  const lines = splitMessageLines(message);
  if (lines.length < 2) {
    return false;
  }

  let hasEmail = false;
  let hasAddress = false;

  for (const line of lines) {
    if (!hasEmail && isLikelyEmail(line)) {
      hasEmail = true;
    }

    if (!hasAddress && isLikelyAddress(line)) {
      hasAddress = true;
    }
  }

  return hasEmail || hasAddress;
}

function extractProviderDateHeuristically(message: string): string | null {
  if (shouldIgnoreScheduleExtractionForMessage(message)) {
    return null;
  }

  const normalizedMessage = normalizeSimpleReply(message);
  if (!normalizedMessage) return null;

  const weekdayChecks: Array<{ terms: string[]; weekday: number }> = [
    { terms: ["segunda feira", "segunda"], weekday: 1 },
    { terms: ["terca feira", "terca"], weekday: 2 },
    { terms: ["quarta feira", "quarta"], weekday: 3 },
    { terms: ["quinta feira", "quinta"], weekday: 4 },
    { terms: ["sexta feira", "sexta"], weekday: 5 },
    { terms: ["sabado"], weekday: 6 },
    { terms: ["domingo"], weekday: 0 },
  ];

  if (normalizedMessage.includes("hoje")) {
    return getBrazilToday();
  }

  if (normalizedMessage.includes("amanha")) {
    return addDaysToIsoDate(getBrazilToday(), 1);
  }

  for (const weekdayCheck of weekdayChecks) {
    if (matchesAnyTerm(normalizedMessage, weekdayCheck.terms)) {
      return findNextWeekdayIsoDate(weekdayCheck.weekday);
    }
  }

  let sanitized = message;
  for (const separator of [",", ";", "\n", "\r", "\t"]) {
    sanitized = sanitized.split(separator).join(" ");
  }

  const tokens = sanitized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (shouldIgnoreHeuristicDateToken(token)) {
      continue;
    }
    const normalizedDate = normalizeProviderDateValue(token);
    if (normalizedDate) {
      return normalizedDate;
    }
  }

  return null;
}

function extractProviderTimeHeuristically(message: string): string | null {
  if (shouldIgnoreScheduleExtractionForMessage(message)) {
    return null;
  }

  const normalizedMessage = normalizeSimpleReply(message);
  if (!normalizedMessage) return null;

  if (normalizedMessage.includes("fim da tarde")) return "16:00";
  if (normalizedMessage.includes("depois do almoco")) return "14:00";
  if (normalizedMessage.includes("meio dia")) return "12:00";
  if (normalizedMessage.includes("manha")) return "09:00";

  let sanitized = message;
  for (const separator of [",", ";", "\n", "\r", "\t"]) {
    sanitized = sanitized.split(separator).join(" ");
  }

  const tokens = sanitized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

  const halfHourTime = extractProviderHalfHourTime(tokens);
  if (halfHourTime) {
    return halfHourTime;
  }

  for (const token of tokens) {
    const normalizedTime = normalizeProviderTimeValue(token);
    if (normalizedTime) {
      return normalizedTime;
    }
  }

  return null;
}

function extractProviderHalfHourTime(tokens: string[]): string | null {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return null;
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const normalizedToken = normalizeSimpleReply(tokens[index]);
    if (normalizedToken !== "meia") {
      continue;
    }

    const previousToken = index > 0 ? tokens[index - 1] : "";
    const normalizedPreviousToken = normalizeSimpleReply(previousToken);

    if (normalizedPreviousToken === "e" && index > 1) {
      const hourToken = tokens[index - 2];
      const halfHourTime = buildProviderHalfHourTime(hourToken);
      if (halfHourTime) {
        return halfHourTime;
      }
    }

    const halfHourTime = buildProviderHalfHourTime(previousToken);
    if (halfHourTime) {
      return halfHourTime;
    }
  }

  return null;
}

function buildProviderHalfHourTime(token: string): string | null {
  const normalizedTime = normalizeProviderTimeValue(token);
  if (!normalizedTime) {
    return null;
  }

  const minutes = parseProviderTimeToMinutes(normalizedTime);
  if (minutes === null) {
    return null;
  }

  const hour = Math.floor(minutes / 60);
  return `${String(hour).padStart(2, "0")}:30`;
}

function shouldIgnoreHeuristicDateToken(token: string): boolean {
  const trimmed = String(token || "").trim();
  if (!trimmed) return true;

  if (trimmed.includes("/") || trimmed.includes("-") || trimmed.includes("T")) {
    return false;
  }

  let hasDigit = false;
  let hasLetter = false;

  for (const char of trimmed) {
    if (char >= "0" && char <= "9") {
      hasDigit = true;
      continue;
    }

    const lower = char.toLowerCase();
    const upper = char.toUpperCase();
    if (lower !== upper) {
      hasLetter = true;
      break;
    }
  }

  return hasDigit && !hasLetter;
}

function isExplicitAffirmative(message: string): boolean {
  const normalized = normalizeSimpleReply(message);
  if (!normalized) return false;

  return [
    "sim",
    "s",
    "ok",
    "okay",
    "pode",
    "pode sim",
    "claro",
    "confirmo",
    "confirmar",
    "pode confirmar",
    "isso",
    "isso mesmo",
    "fechado",
    "combinado",
    "perfeito",
    "quero",
  ].includes(normalized);
}

function messageLooksLikeShortExplicitAffirmative(message: string): boolean {
  const normalized = normalizeSimpleReply(message);
  if (!normalized || !isExplicitAffirmative(message)) {
    return false;
  }

  return normalized.length <= 16 && normalized.split(" ").length <= 3;
}

interface ProviderFlowRequirements {
  requireCustomerType: boolean;
  requireAddress: boolean;
  requireEmail: boolean;
  requirePaymentMethod: boolean;
  requireFinalConfirmationAfterPayment: boolean;
}

function promptMentionsAny(prompt: string, variants: string[]): boolean {
  const normalizedPrompt = normalizeSimpleReply(prompt);
  return variants.some((variant) => normalizedPrompt.includes(variant));
}

function getProviderFlowRequirements(
  config: ProviderConfig,
  promptOverride?: string,
): ProviderFlowRequirements {
  const prompt = String(
    typeof promptOverride === "string"
      ? promptOverride
      : config.ai_instructions || "",
  );
  const requirePaymentMethod = promptMentionsAny(prompt, [
    "forma de pagamento",
    "pix ou cartao",
    "cartao na maquininha",
    "pix",
  ]);

  return {
    requireCustomerType: promptMentionsAny(prompt, [
      "pessoa fisica",
      "pessoa juridica",
      "pessoa fisica ou pessoa juridica",
      "pessoa fisica (residencia)",
      "pessoa juridica (empresa)",
      "atendimento e para",
      "se o atendimento e para",
    ]),
    requireAddress: promptMentionsAny(prompt, [
      "endereco completo",
      "endereco",
    ]),
    requireEmail: promptMentionsAny(prompt, [
      "email",
      "e mail",
    ]),
    requirePaymentMethod,
    requireFinalConfirmationAfterPayment: requirePaymentMethod || promptMentionsAny(prompt, [
      "posso confirmar seu agendamento",
      "posso confirmar o agendamento",
      "somente apos isso",
      "somente após isso",
      "aguarde a confirmacao final",
      "aguarde a confirmação final",
    ]),
  };
}

function buildVirtualProviderService(
  serviceName: string,
  durationMinutes: number,
): ProviderService {
  return {
    id: "",
    name: String(serviceName || "").trim() || "Atendimento",
    description: null,
    duration_minutes: durationMinutes || 30,
    price: null,
    is_active: true,
    color: null,
  };
}

function shouldOfferSingleRealSlot(config: ProviderConfig): boolean {
  return (config.slot_suggestion_mode || "first_available") !== "ask_preference";
}

function sanitizeProviderAssistantText(text: string): string {
  return String(text || "")
    .replaceAll("*", "")
    .replaceAll("_", "")
    .replaceAll("`", "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function inferProviderCustomerType(message: string): string | null {
  const normalized = normalizeSimpleReply(message);
  if (!normalized) return null;

  if (
    normalized.includes("pessoa fisica")
    || normalized.includes("residencia")
    || normalized.includes("casa")
    || normalized.includes("apartamento")
  ) {
    return "Pessoa física";
  }

  if (
    normalized.includes("pessoa juridica")
    || normalized.includes("empresa")
    || normalized.includes("comercio")
    || normalized.includes("loj")
  ) {
    return "Pessoa jurídica";
  }

  return null;
}

function inferProviderPaymentMethod(message: string): string | null {
  const normalized = normalizeSimpleReply(message);
  if (!normalized) return null;

  if (normalized.includes("pix")) {
    return "Pix";
  }

  if (normalized.includes("debito")) {
    return "Cartão - débito";
  }

  if (normalized.includes("credito")) {
    return "Cartão - crédito";
  }

  if (normalized.includes("cartao")) {
    return "Cartão";
  }

  return null;
}

function isLikelyCustomerName(message: string): boolean {
  const trimmed = String(message || "").trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 80) return false;
  if (trimmed.includes("@")) return false;

  const normalized = normalizeSimpleReply(trimmed);
  const tokens = tokenizeNormalizedMessage(trimmed);
  if (tokens.length === 0 || tokens.length > 4) return false;

  if (matchesAnyTerm(normalized, [
    "preciso",
    "quero",
    "agendar",
    "marcar",
    "troca",
    "instalacao",
    "instalacao de",
    "instalar",
    "tomada",
    "chuveiro",
    "visita",
    "atendimento",
    "horario",
    "amanha",
    "hoje",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
    "domingo",
  ])) {
    return false;
  }

  let hasLetter = false;
  for (const char of trimmed) {
    const code = char.normalize("NFD").charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    if (isDigit) return false;
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      hasLetter = true;
    }
  }

  return hasLetter;
}

function shouldAcceptCustomerNameCandidate(candidate: string | null | undefined): boolean {
  const trimmed = String(candidate || "").trim();
  if (!trimmed) return false;
  if (isExplicitAffirmative(trimmed)) return false;
  if (isProviderCustomerTypeLabel(trimmed)) {
    return false;
  }
  return isLikelyCustomerName(trimmed);
}

function shouldAcceptCustomerAddressCandidate(candidate: string | null | undefined): boolean {
  const trimmed = String(candidate || "").trim();
  if (!trimmed) return false;
  if (isProviderCustomerTypeLabel(trimmed)) {
    return false;
  }
  return isLikelyAddress(trimmed);
}

function isProviderCustomerTypeLabel(value: string | null | undefined): boolean {
  const normalized = normalizeSimpleReply(String(value || "").trim());
  if (!normalized) return false;

  if (normalized.includes("pessoa")) {
    return true;
  }

  if (normalized.includes("resid") || normalized.includes("empres") || normalized.includes("comerc")) {
    return true;
  }

  return matchesAnyTerm(normalized, [
    "residencia",
    "residencial",
    "empresa",
    "comercial",
    "pessoa fisica",
    "pessoa juridica",
    "fisica",
    "juridica",
    "pessoa física",
    "pessoa jurídica",
  ]);
}

function splitMessageLines(message: string): string[] {
  return String(message || "")
    .split("\n")
    .map((line) => line.replace("\r", "").trim())
    .filter(Boolean);
}

function extractProviderCustomerBundleFromMessage(message: string): {
  customerName?: string;
  customerAddress?: string;
  customerEmail?: string;
} {
  const lines = splitMessageLines(message);
  if (lines.length < 2) {
    return {};
  }

  let customerEmail: string | undefined;
  let customerName: string | undefined;
  const addressParts: string[] = [];

  for (const line of lines) {
    if (!customerEmail && isLikelyEmail(line)) {
      customerEmail = line;
      continue;
    }

    if (!customerName && shouldAcceptCustomerNameCandidate(line) && !isLikelyAddress(line)) {
      customerName = line;
      continue;
    }

    addressParts.push(line);
  }

  const joinedAddress = addressParts.join(", ").trim();
  const customerAddress = shouldAcceptCustomerAddressCandidate(joinedAddress) ? joinedAddress : undefined;

  return {
    customerName,
    customerAddress,
    customerEmail,
  };
}

function isLikelyAddress(message: string): boolean {
  const trimmed = String(message || "").trim();
  if (!trimmed || trimmed.length < 6) return false;
  const normalized = normalizeSimpleReply(trimmed);
  const timeCandidate = extractProviderTimeHeuristically(trimmed);
  const tokenCount = tokenizeNormalizedMessage(trimmed).length;

  if (
    timeCandidate
    && tokenCount <= 4
    && matchesAnyTerm(normalized, [
      "as",
      "hora",
      "horario",
      "mais tarde",
      "mais cedo",
      "depois",
      "antes",
      "esse horario",
      "outro horario",
    ])
  ) {
    return false;
  }

  const hasSeparator = trimmed.includes(",") || normalized.includes("rua ") || normalized.includes("avenida ") || normalized.includes("av ");
  let hasDigit = false;
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      hasDigit = true;
      break;
    }
  }

  return hasSeparator || (
    hasDigit
    && matchesAnyTerm(normalized, [
      "rua",
      "avenida",
      "av",
      "travessa",
      "alameda",
      "condominio",
      "bairro",
      "casa",
      "apartamento",
      "apto",
      "bloco",
      "sala",
      "numero",
      "n ",
      "nº",
      "cep",
    ])
  );
}

function isLikelyEmail(message: string): boolean {
  const trimmed = String(message || "").trim();
  return trimmed.includes("@") && trimmed.includes(".");
}

function extractProviderFieldsHeuristically(
  message: string,
  providerData: ProviderData,
  bookingState: BookingState,
): ExtractedFields {
  const normalizedMessage = normalizeSimpleReply(message);
  const messageTokens = tokenizeNormalizedMessage(message);
  const matchedService = matchService(message, providerData.services);
  const matchedProfessional = matchProfessional(message, providerData.professionals);
  const date = extractProviderDateHeuristically(message);
  const time = extractProviderTimeHeuristically(message);
  const customerType = inferProviderCustomerType(message) || undefined;
  const paymentMethod = inferProviderPaymentMethod(message) || undefined;
  const customerName = !bookingState.customerName && isLikelyCustomerName(message)
    ? String(message || "").trim()
    : undefined;
  const customerAddress = !bookingState.customerAddress && isLikelyAddress(message)
    ? String(message || "").trim()
    : undefined;
  const customerEmail = !bookingState.customerEmail && isLikelyEmail(message)
    ? String(message || "").trim()
    : undefined;

  let intent: ExtractedFields["intent"] = "general";

  if (matchesAnyTerm(normalizedMessage, ["cancelar", "cancela", "desist", "nao quero"])) {
    intent = "cancel";
  } else if (
    isExplicitAffirmative(message)
    && (bookingState.awaitingConfirmation || bookingState.awaitingPaymentMethod || bookingState.awaitingFinalConfirmation)
  ) {
    intent = "confirm";
  } else if (matchedService || matchesAnyTerm(normalizedMessage, [
    "agendar",
    "marcar",
    "preciso de",
    "quero",
    "trocar",
    "instalar",
    "visita",
    "atendimento",
  ])) {
    intent = "booking";
  } else if (matchesAnyTerm(normalizedMessage, [
    "horario disponivel",
    "horarios disponiveis",
    "horario",
    "horarios",
    "tem vaga",
    "tem horario",
    "disponibilidade",
    "agenda",
  ])) {
    intent = "check_availability";
  } else if (matchesAnyTerm(normalizedMessage, ["preco", "precos", "valor", "quanto custa", "quanto fica"])) {
    intent = "info_prices";
  } else if (matchesAnyTerm(normalizedMessage, ["servicos", "servico", "fazem", "faz"])) {
    intent = "info_services";
  } else if (matchesAnyTerm(normalizedMessage, ["horario de funcionamento", "funcionamento", "abrem", "abre", "fecham", "fecha"])) {
    intent = "info_hours";
  } else if (matchesAnyTerm(normalizedMessage, ["oi", "ola", "bom dia", "boa tarde", "boa noite"])) {
    intent = "greeting";
  } else if (
    messageTokens.length <= 3
    && bookingState.service
    && (date || time || isExplicitAffirmative(message))
  ) {
    intent = "booking";
  }

  return {
    intent,
    service: matchedService?.name,
    professional: matchedProfessional?.name,
    date: date || undefined,
    time: time || undefined,
    customerType,
    customerName,
    customerAddress,
    customerEmail,
    paymentMethod,
  };
}

function extractPixInstructions(prompt: string): { keyLine?: string; holderLine?: string } {
  const lines = String(prompt || "")
    .split("\n")
    .map((line) => line.replace("\r", "").trim())
    .filter(Boolean);

  let keyLine: string | undefined;
  let holderLine: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeSimpleReply(lines[index]);

    if (!keyLine && normalized.startsWith("chave pix")) {
      keyLine = lines[index];
      if (index + 1 < lines.length) {
        const nextLine = lines[index + 1].trim();
        if (nextLine && !normalizeSimpleReply(nextLine).startsWith("nome que aparecera")) {
          keyLine = `${keyLine} ${nextLine}`.trim();
        }
      }
    }

    if (!holderLine && normalized.startsWith("nome que aparecera")) {
      if (index + 1 < lines.length) {
        holderLine = `${lines[index]} ${lines[index + 1]}`.trim();
      } else {
        holderLine = lines[index];
      }
    }
  }

  return { keyLine, holderLine };
}

async function findFirstAvailableProviderSlot(
  userId: string,
  serviceDurationMinutes: number,
  professionalId: string | undefined,
  maxAdvanceDays: number,
): Promise<{ date: string; time: string } | null> {
  const maxDays = Math.max(1, Math.min(maxAdvanceDays || 30, 60));
  const baseDate = new Date(`${getBrazilToday()}T12:00:00`);

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const candidateDate = new Date(baseDate);
    candidateDate.setDate(baseDate.getDate() + offset);
    const isoDate = candidateDate.toISOString().slice(0, 10);
    const slots = await getAvailableSlots(userId, isoDate, professionalId, serviceDurationMinutes);

    if (slots.length > 0) {
      return {
        date: isoDate,
        time: slots[0],
      };
    }
  }

  return null;
}

interface ProviderUpcomingAppointment {
  id: string;
  user_id: string;
  client_name: string | null;
  client_phone: string | null;
  service_name: string | null;
  appointment_date: string;
  start_time: string;
  status: string;
  google_event_id?: string | null;
  google_calendar_synced?: boolean | null;
  ai_conversation_context?: Record<string, unknown> | null;
}

async function findUpcomingProviderAppointmentForCustomer(
  userId: string,
  customerPhone: string,
): Promise<ProviderUpcomingAppointment | null> {
  const normalizedPhone = String(customerPhone || "").trim();
  if (!normalizedPhone) {
    return null;
  }

  const lookupPhones = listProviderAppointmentLookupPhones(normalizedPhone);
  let query = supabase
    .from("provider_appointments")
    .select("id, user_id, client_name, client_phone, service_name, appointment_date, start_time, status, google_event_id, google_calendar_synced, ai_conversation_context")
    .eq("user_id", userId)
    .in("status", ["pending", "confirmed"])
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(20);

  if (lookupPhones.length === 1) {
    query = query.eq("client_phone", lookupPhones[0]);
  } else {
    query = query.in("client_phone", lookupPhones);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Provider] Erro ao buscar agendamento futuro para cancelamento:", error);
    return null;
  }

  const now = getBrazilNow();
  for (const appointment of (data || []) as ProviderUpcomingAppointment[]) {
    if (!providerAppointmentMatchesContact(
      appointment.client_phone,
      appointment.ai_conversation_context,
      normalizedPhone,
    )) {
      continue;
    }

    const normalizedTime = normalizeProviderTimeValue(appointment.start_time) || appointment.start_time;
    const startDateTime = new Date(`${appointment.appointment_date}T${normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime}`);
    if (!Number.isNaN(startDateTime.getTime()) && startDateTime.getTime() >= now.getTime() - 60 * 1000) {
      return appointment;
    }
  }

  return null;
}

async function cancelUpcomingProviderAppointmentForCustomer(
  userId: string,
  customerPhone: string,
  config: ProviderConfig,
): Promise<{ handled: boolean; text: string }> {
  const appointment = await findUpcomingProviderAppointmentForCustomer(userId, customerPhone);
  if (!appointment) {
    return { handled: false, text: "" };
  }

  if (!config.allow_cancellation) {
    return {
      handled: true,
      text: "No momento esse agendamento nao pode ser cancelado automaticamente. Me chame por aqui que eu te ajudo.",
    };
  }

  const normalizedStartTime = normalizeProviderTimeValue(appointment.start_time) || appointment.start_time;
  const appointmentStart = new Date(`${appointment.appointment_date}T${normalizedStartTime.length === 5 ? `${normalizedStartTime}:00` : normalizedStartTime}`);
  const noticeHours = Math.max(0, Number(config.cancellation_notice_hours || 0));
  if (!Number.isNaN(appointmentStart.getTime()) && noticeHours > 0) {
    const noticeMs = noticeHours * 60 * 60 * 1000;
    if (appointmentStart.getTime() - getBrazilNow().getTime() < noticeMs) {
      return {
        handled: true,
        text: `Esse agendamento ja esta dentro da janela minima de ${noticeHours} hora(s) para cancelamento automatico. Me avise aqui que eu sigo com voce manualmente.`,
      };
    }
  }

  const { data: cancelledAppointment, error: cancelError } = await supabase
    .from("provider_appointments")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointment.id)
    .eq("user_id", userId)
    .select()
    .single();

  if (cancelError) {
    console.error("[Provider] Erro ao cancelar agendamento do cliente:", cancelError);
    return {
      handled: true,
      text: "Tive um problema ao cancelar seu agendamento agora. Me envie uma nova mensagem que eu tento novamente.",
    };
  }

  if (appointment.google_event_id) {
    const removeResult = await removeAppointmentFromCalendar(userId, appointment.google_event_id);
    if (!removeResult.success) {
      console.error(`[Provider] Falha ao remover evento ${appointment.google_event_id} do Google Calendar no cancelamento por IA:`, removeResult.error);
    }

    await supabase
      .from("provider_appointments")
      .update({
        google_event_id: null,
        google_calendar_synced: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment.id)
      .eq("user_id", userId);
  }

  const contextualDate = formatProviderContextualDate(cancelledAppointment?.appointment_date || appointment.appointment_date);
  const cancellationMessage = String(config.cancellation_message || "").trim();

  return {
    handled: true,
    text: cancellationMessage || `Tudo certo. Cancelei seu agendamento de ${appointment.service_name || "atendimento"} para ${contextualDate}, às ${normalizedStartTime}. Se quiser remarcar, me diga o servico e eu consulto a agenda real para voce.`,
  };
}

function buildFirstAvailableSlotQuestion(bookingState: BookingState): string {
  const contextualDate = formatProviderContextualDate(bookingState.date || "");
  return [
    `O primeiro horário disponível é ${contextualDate}, às ${bookingState.time}.`,
    "",
    "Esse horário fica melhor para você?",
  ].join("\n");
}

function buildValidatedSlotContext(state: BookingState): string {
  if (!state.lastSuggestedDate || state.lastSuggestedSlots.length === 0) {
    return 'Nenhum slot validado recentemente.';
  }

  return [
    `Última data validada no backend: ${state.lastSuggestedDate}`,
    `Horários válidos já oferecidos ao cliente: ${state.lastSuggestedSlots.join(', ')}`,
  ].join('\n');
}

function buildProviderSecondaryAgendaGuidance(
  bookingState: BookingState,
  mode: "reply" | "extract",
): string {
  const currentStateSummary = [
    bookingState.service ? `Servico atual: ${bookingState.service.name}.` : "Servico atual ainda nao fechado.",
    bookingState.date && bookingState.time
      ? `Slot atual em memoria: ${bookingState.date} ${bookingState.time}.`
      : "Ainda nao existe slot validado em memoria.",
  ].join(" ");

  if (mode === "extract") {
    return [
      "SEGUNDA LINHA OPERACIONAL DA AGENDA:",
      `- ${currentStateSummary}`,
      "- O prompt do dono continua mandando na conversa. Esta camada so adiciona memoria factual da agenda e do slot em andamento.",
      "- Pense como um orquestrador vivo: primeiro entenda a intencao da mensagem; depois use o contexto real da agenda para preencher o JSON sem inventar disponibilidade.",
      "- Quando a mensagem tocar agenda, dia, horario, mais cedo, mais tarde, outro dia, esse horario ou disponibilidade, use o snapshot real que vier no contexto como memoria factual.",
      "- Se a mensagem atual so complementar dados, pagamento ou confirmacao curta, preserve o que ja estiver em memoria e extraia no JSON somente o que a mensagem atual realmente acrescentou.",
      "- Se existir snapshot da agenda local espelhada no contexto, use esse snapshot como memoria factual dos horarios disponiveis neste turno.",
      bookingState.agendaWindowContext
        ? "- Se existir uma janela viva de disponibilidade, entenda como disponiveis apenas os horarios listados nela; o restante fica indisponivel ate nova consulta operacional."
        : "",
      "- Se ja existir um slot validado em memoria e a mensagem atual for apenas aceite, dados ou pagamento, preserve esse slot como contexto vivo da conversa.",
    ].join("\n");
  }

  return [
    "SEGUNDA LINHA OPERACIONAL DA AGENDA:",
    `- ${currentStateSummary}`,
    "- O prompt do dono e a conversa continuam naturais. Esta camada so injeta memoria factual da agenda para evitar alucinacao.",
    "- Sempre que o cliente demonstrar intencao de falar de disponibilidade, dia ou horario, fale usando apenas o contexto operacional real deste turno.",
    "- Se o contexto operacional trouxer snapshot, slots reais ou janela viva, trate isso como memoria factual da agenda espelhada.",
    bookingState.agendaWindowContext
      ? "- Se o contexto operacional trouxer uma janela viva de disponibilidade, trate somente os horarios listados nela como agendaveis neste momento."
      : "",
    "- Se o cliente pedir mais tarde, mais cedo, outro horario ou outro dia, responda usando os slots reais que estiverem no contexto operacional, mantendo o mesmo dia quando ainda houver opcoes validas nele.",
    "- Quando o cliente aceitar um horario ja validado, continue a conversa em cima desse mesmo horario como contexto vivo do turno.",
    "- Antes de afirmar que o agendamento foi salvo, responda internamente apenas: o cliente escolheu um horario valido do contexto operacional e confirmou explicitamente? sim ou nao.",
    "- Se a resposta interna for nao, continue a conversa normalmente sem dizer que agendou.",
    "- Se a resposta interna for sim, espere o contexto operacional confirmar que o create real foi salvo antes de comunicar isso ao cliente.",
  ].join("\n");
}

function detectSuggestedSlotSelection(message: string, slots: string[]): string | null {
  const normalizedMessage = message.toLowerCase().trim();
  if (!normalizedMessage) {
    return null;
  }

  const compactMessage = normalizedMessage
    .replaceAll(' ', '')
    .replaceAll('.', '')
    .replaceAll(',', '')
    .replaceAll('às', '')
    .replaceAll('as', '')
    .replaceAll('horas', 'h')
    .replaceAll('hora', 'h');

  for (const slot of slots) {
    const [hourPart, minutePart] = slot.split(':');
    const hourNumber = Number(hourPart);
    const normalizedHour = Number.isFinite(hourNumber) ? String(hourNumber) : hourPart;
    const candidates = [
      slot,
      slot.replace(':', ''),
      `${hourPart}h${minutePart}`,
      `${normalizedHour}h${minutePart}`,
      `${hourPart}h`,
      `${normalizedHour}h`,
    ];

    for (const candidate of candidates) {
      if (normalizedMessage.includes(candidate) || compactMessage.includes(candidate.replace(':', ''))) {
        return slot;
      }
    }
  }

  return null;
}

type RelativeSlotPreference = "later" | "earlier" | "alternate";

function detectRelativeSlotPreference(message: string): RelativeSlotPreference | null {
  const normalizedMessage = normalizeSimpleReply(message);
  if (!normalizedMessage) {
    return null;
  }

  if (matchesAnyTerm(normalizedMessage, [
    "outro dia",
    "outra data",
    "pra outro dia",
    "para outro dia",
    "no outro dia",
  ])) {
    return null;
  }

  if (matchesAnyTerm(normalizedMessage, [
    "mais tarde",
    "depois desse horario",
    "depois deste horario",
    "depois do horario",
    "algo depois",
    "tem mais tarde",
    "horario mais tarde",
    "mais para frente",
    "mais pra frente",
    "mais no fim do dia",
    "apos esse horario",
    "apos este horario",
    "depois das",
  ])) {
    return "later";
  }

  if (matchesAnyTerm(normalizedMessage, [
    "mais cedo",
    "antes desse horario",
    "antes deste horario",
    "antes do horario",
    "algo antes",
    "tem mais cedo",
    "mais no comeco do dia",
  ])) {
    return "earlier";
  }

  if (matchesAnyTerm(normalizedMessage, [
    "outro horario",
    "outra opcao",
    "outra alternativa",
    "tem outro horario",
    "algum outro horario",
    "outra disponibilidade",
    "tem mais algum horario",
    "outra hora",
  ])) {
    return "alternate";
  }

  return null;
}

function resolveRelativeSlotReferenceTime(
  state: BookingState,
  targetDate: string,
  requestedTime?: string | null,
): string | null {
  const normalizedRequestedTime = normalizeProviderTimeValue(requestedTime || "");
  if (normalizedRequestedTime) {
    return normalizedRequestedTime;
  }

  if (state.lastSuggestedDate === targetDate) {
    const normalizedCurrentTime = normalizeProviderTimeValue(state.time || "");
    if (normalizedCurrentTime && state.lastSuggestedSlots.includes(normalizedCurrentTime)) {
      return normalizedCurrentTime;
    }

    if (state.lastSuggestedSlots.length === 1) {
      const suggestedTime = normalizeProviderTimeValue(state.lastSuggestedSlots[0]);
      if (suggestedTime) {
        return suggestedTime;
      }
    }
  }

  if (state.date === targetDate) {
    return normalizeProviderTimeValue(state.time || "");
  }

  return null;
}

function parseProviderTimeToMinutes(value?: string | null): number | null {
  const normalized = normalizeProviderTimeValue(value || "");
  if (!normalized) return null;
  const [hourPart, minutePart] = normalized.split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function findNearestAvailableSlot(
  availableSlots: string[],
  requestedTime?: string | null,
): string | null {
  if (!Array.isArray(availableSlots) || availableSlots.length === 0) {
    return null;
  }

  const requestedMinutes = parseProviderTimeToMinutes(requestedTime);
  if (requestedMinutes === null) {
    return availableSlots[0] || null;
  }

  let laterSlot: string | null = null;
  let earlierSlot: string | null = null;

  for (const slot of availableSlots) {
    const slotMinutes = parseProviderTimeToMinutes(slot);
    if (slotMinutes === null) {
      continue;
    }

    if (slotMinutes >= requestedMinutes) {
      laterSlot = slot;
      break;
    }

    earlierSlot = slot;
  }

  return laterSlot || earlierSlot || availableSlots[0] || null;
}

function filterSlotsByRelativePreference(
  slots: string[],
  referenceTime: string,
  preference: RelativeSlotPreference,
): string[] {
  const normalizedReferenceTime = normalizeProviderTimeValue(referenceTime);
  if (!normalizedReferenceTime) {
    return [];
  }

  if (preference === "later") {
    return slots.filter((slot) => slot > normalizedReferenceTime);
  }

  if (preference === "earlier") {
    return slots.filter((slot) => slot < normalizedReferenceTime);
  }

  const laterSlots = slots.filter((slot) => slot > normalizedReferenceTime);
  const earlierSlots = slots.filter((slot) => slot < normalizedReferenceTime);
  return [...laterSlots, ...earlierSlots];
}

function buildRelativeSlotCopy(preference: RelativeSlotPreference): {
  promptLabel: string;
  fallbackLead: string;
  emptyLabel: string;
} {
  switch (preference) {
    case "later":
      return {
        promptLabel: "mais tarde",
        fallbackLead: "Depois desse horario",
        emptyLabel: "mais tarde",
      };
    case "earlier":
      return {
        promptLabel: "mais cedo",
        fallbackLead: "Antes desse horario",
        emptyLabel: "mais cedo",
      };
    default:
      return {
        promptLabel: "alternativo",
        fallbackLead: "Encontrei outro horario",
        emptyLabel: "alternativo",
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verifica se o horário atual está dentro do intervalo de almoço configurado.
 * Retorna { isDuringBreak: true, message } se estiver em pausa.
 */
export function isCurrentlyInBreak(openingHours?: Record<string, OpeningHoursDay>): {
  isDuringBreak: boolean;
  message: string;
  breakStart: string;
  breakEnd: string;
} {
  const breakConfig = openingHours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;

  if (!breakConfig || !breakConfig.enabled) {
    return { isDuringBreak: false, message: '', breakStart: '12:00', breakEnd: '13:00' };
  }

  const now = getProviderOperationalNow();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const currentHour = brazilTime.getHours();
  const currentMinute = brazilTime.getMinutes();
  const currentMinutes = currentHour * 60 + currentMinute;

  const [bStartH, bStartM] = breakConfig.start.split(':').map(Number);
  const [bEndH, bEndM] = breakConfig.end.split(':').map(Number);
  const breakStartMin = bStartH * 60 + bStartM;
  const breakEndMin = bEndH * 60 + bEndM;

  const isDuringBreak = currentMinutes >= breakStartMin && currentMinutes < breakEndMin;
  const message = isDuringBreak
    ? `Estamos no horário de almoço (${breakConfig.start} às ${breakConfig.end}). Voltamos em breve! 🍽️`
    : '';

  return { isDuringBreak, message, breakStart: breakConfig.start, breakEnd: breakConfig.end };
}

export function isProviderOpen(openingHours?: Record<string, OpeningHoursDay>): {
  isOpen: boolean;
  isDuringBreak: boolean;
  currentDay: string;
  currentTime: string;
  message: string;
} {
  const now = getProviderOperationalNow();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayNamesPt: Record<string, string> = {
    sunday: 'domingo', monday: 'segunda-feira', tuesday: 'terça-feira',
    wednesday: 'quarta-feira', thursday: 'quinta-feira', friday: 'sexta-feira', saturday: 'sábado'
  };
  const currentDay = dayNames[brazilTime.getDay()];
  const currentHour = brazilTime.getHours().toString().padStart(2, '0');
  const currentMinute = brazilTime.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHour}:${currentMinute}`;

  if (!openingHours || Object.keys(openingHours).length === 0) {
    return { isOpen: true, isDuringBreak: false, currentDay, currentTime, message: '' };
  }
  const todayHours = openingHours[currentDay];
  if (!todayHours || !todayHours.enabled) {
    return { isOpen: false, isDuringBreak: false, currentDay, currentTime, message: `Estamos fechados hoje (${dayNamesPt[currentDay]}).` };
  }
  const openTime = todayHours.open || '09:00';
  const closeTime = todayHours.close || '19:00';
  const currentMinutes = parseInt(currentHour) * 60 + parseInt(currentMinute);
  const openMinutes = parseInt(openTime.split(':')[0]) * 60 + parseInt(openTime.split(':')[1] || '0');
  const closeMinutes = parseInt(closeTime.split(':')[0]) * 60 + parseInt(closeTime.split(':')[1] || '0');
  const isOpenHours = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  if (!isOpenHours) {
    return { isOpen: false, isDuringBreak: false, currentDay, currentTime, message: `Nosso horário hoje é das ${openTime} às ${closeTime}.` };
  }
  // Verificar horário de almoço
  const breakStatus = isCurrentlyInBreak(openingHours);
  if (breakStatus.isDuringBreak) {
    return { isOpen: false, isDuringBreak: true, currentDay, currentTime, message: breakStatus.message };
  }
  return { isOpen: true, isDuringBreak: false, currentDay, currentTime, message: '' };
}

function getProviderOperationalNow(): Date {
  const override = String(process.env.PROVIDER_TEST_NOW || "").trim();
  if (override) {
    const parsed = new Date(override);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function formatProviderHours(openingHours?: Record<string, OpeningHoursDay>): string {
  if (!openingHours || Object.keys(openingHours).length === 0) return 'Horários não informados.';
  const dayNamesPt: Record<string, string> = {
    monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta',
    thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo'
  };
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  let text = '';
  for (const day of dayOrder) {
    const dc = openingHours[day];
    if (dc && dc.enabled) text += `${dayNamesPt[day]}: ${dc.open} às ${dc.close}\n`;
  }
  return text.trim() || 'Horários não informados.';
}

function replaceAllTokens(template: string, replacements: Record<string, string>): string {
  let nextValue = template;

  for (const [token, replacement] of Object.entries(replacements)) {
    nextValue = nextValue.split(`{${token}}`).join(replacement);
  }

  return nextValue;
}

function getProfessionalDisplayName(professional?: ProviderProfessional | null): string {
  return professional?.name || 'nossa equipe';
}

function extractFirstJsonObject(raw: string): string | null {
  const startIndex = raw.indexOf('{');
  const endIndex = raw.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  return raw.slice(startIndex, endIndex + 1);
}

function parseJsonObjectLenient<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    let cleaned = "";
    let insideString = false;
    let escaping = false;

    for (const char of raw) {
      if (escaping) {
        cleaned += char;
        escaping = false;
        continue;
      }

      if (char === "\\") {
        cleaned += char;
        escaping = true;
        continue;
      }

      if (char === "\"") {
        cleaned += char;
        insideString = !insideString;
        continue;
      }

      if (insideString) {
        if (char === "\n") {
          cleaned += "\\n";
          continue;
        }

        if (char === "\r") {
          cleaned += "\\r";
          continue;
        }

        if (char === "\t") {
          cleaned += "\\t";
          continue;
        }
      }

      cleaned += char;
    }

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}

function buildBookingConfirmationQuestion(
  bookingState: BookingState,
): string {
  const contextualDate = formatProviderContextualDate(bookingState.date || '');
  const summaryLines = [
    `Perfeito! Vou separar ${bookingState.service?.name || 'o atendimento'}${bookingState.professional ? ` com ${bookingState.professional.name}` : ''}.`,
    `Data: ${contextualDate}`,
    `Horário: ${bookingState.time}`,
  ];

  if (bookingState.service?.price) {
    summaryLines.push(`Valor: R$ ${bookingState.service.price.toFixed(2).replace('.', ',')}`);
  }

  summaryLines.push('Posso confirmar?');
  return summaryLines.join('\n');
}

function buildCustomerTypeQuestion(): string {
  return [
    "Perfeito.",
    "Esse atendimento será para pessoa física (residência) ou pessoa jurídica (empresa)?",
  ].join("\n");
}

function buildCustomerNameQuestion(
  bookingState: BookingState,
): string {
  const contextualDate = formatProviderContextualDate(bookingState.date || '');

  return [
    `Perfeito! Antes de confirmar ${bookingState.service?.name || 'o atendimento'}${bookingState.professional ? ` com ${bookingState.professional.name}` : ''}, preciso do seu nome.`,
    contextualDate ? `Data escolhida: ${contextualDate}` : '',
    bookingState.time ? `Horario escolhido: ${bookingState.time}` : '',
    'Como posso te chamar para finalizar o agendamento?',
  ].filter(Boolean).join('\n');
}

function buildCustomerAddressQuestion(bookingState: BookingState): string {
  return [
    `Perfeito${bookingState.customerName ? `, ${bookingState.customerName}` : ''}.`,
    "Agora preciso do endereço completo do atendimento.",
    "Me envie rua ou avenida, número, bairro, cidade e complemento se houver.",
  ].join("\n");
}

function buildCustomerEmailQuestion(bookingState: BookingState): string {
  return [
    `Tudo certo${bookingState.customerName ? `, ${bookingState.customerName}` : ''}.`,
    "Qual e-mail devo registrar no atendimento?",
  ].join("\n");
}

function buildProviderCustomerDataQuestion(
  flowRequirements: ProviderFlowRequirements,
  bookingState: BookingState,
): string {
  const requestedFields: string[] = [];

  if (!bookingState.customerName?.trim()) {
    requestedFields.push("Nome completo:");
  }

  if (flowRequirements.requireAddress && !bookingState.customerAddress?.trim()) {
    requestedFields.push("Endereço completo:");
  }

  if (flowRequirements.requireEmail && !bookingState.customerEmail?.trim()) {
    requestedFields.push("E-mail:");
  }

  if (requestedFields.length === 0) {
    return buildCustomerNameQuestion(bookingState);
  }

  return [
    "Para agendarmos, preciso dos seguintes dados:",
    "",
    ...requestedFields,
  ].join("\n");
}

function buildPaymentMethodQuestion(): string {
  return "Qual será a forma de pagamento? Pix ou cartão na maquininha?";
}

function buildProviderPromptDrivenFinalConfirmationMessage(
  providerData: ProviderData,
  bookingState: BookingState,
  instructionPrompt?: string,
): string {
  const { config } = providerData;
  const promptSource = String(typeof instructionPrompt === "string" ? instructionPrompt : "");
  const contextualDate = formatProviderContextualDate(bookingState.date || "");
  const summaryLines = [
    "Vou confirmar os dados do agendamento:",
    bookingState.customerName ? `Nome: ${bookingState.customerName}` : "",
    bookingState.customerAddress ? `Endereço: ${bookingState.customerAddress}` : "",
    bookingState.customerEmail ? `E-mail: ${bookingState.customerEmail}` : "",
    `Serviço: ${bookingState.service?.name || "Atendimento"}`,
    `Data: ${contextualDate}`,
    `Horário: ${bookingState.time || ""}`,
    bookingState.paymentMethod ? `Pagamento: ${bookingState.paymentMethod}` : "",
    bookingState.service?.price ? `Valor: R$ ${bookingState.service.price.toFixed(2).replace(".", ",")}` : "",
    "Posso confirmar seu agendamento?",
  ].filter(Boolean);

  if (bookingState.paymentMethod === "Pix") {
    const pixInstructions = extractPixInstructions(promptSource);
    if (pixInstructions.keyLine) {
      summaryLines.push("", pixInstructions.keyLine);
    }
    if (pixInstructions.holderLine) {
      summaryLines.push(pixInstructions.holderLine);
    }
  }

  return summaryLines.join("\n");
}

function buildProviderFinalConfirmationQuestion(
  bookingState: BookingState,
): string {
  const contextualDate = formatProviderContextualDate(bookingState.date || "");
  const lines = [
    "Perfeito.",
    bookingState.paymentMethod ? `Então o pagamento será via ${bookingState.paymentMethod}.` : "",
    bookingState.service?.price
      ? `Valor final: R$ ${bookingState.service.price.toFixed(2).replace(".", ",")}.`
      : "",
    bookingState.service?.name ? `Serviço: ${bookingState.service.name}` : "",
    contextualDate ? `Data: ${contextualDate}` : "",
    bookingState.time ? `Horário: ${bookingState.time}` : "",
    "Posso confirmar seu agendamento?",
  ].filter(Boolean);

  return lines.join("\n");
}

function buildProviderPriceAndAvailabilityQuestion(
  bookingState: BookingState,
): string {
  return [
    bookingState.service?.price
      ? `A ${bookingState.service.name} fica em R$ ${bookingState.service.price.toFixed(2).replace(".", ",")}.`
      : `Posso te atender com ${bookingState.service?.name || "esse serviço"}.`,
    "Posso verificar um horário disponível para você?",
  ].join("\n");
}

function buildProviderBookingReviewQuestion(
  bookingState: BookingState,
): string {
  const contextualDate = formatProviderContextualDate(bookingState.date || "");
  const summaryLines = [
    "Obrigado pelas informações. Vou confirmar os dados do agendamento:",
  ];

  if (bookingState.customerType) {
    summaryLines.push(`Tipo de atendimento: ${bookingState.customerType}`);
  }

  if (bookingState.customerName) {
    summaryLines.push(`Nome: ${bookingState.customerName}`);
  }

  if (bookingState.customerAddress) {
    summaryLines.push(`Endereço: ${bookingState.customerAddress}`);
  }

  if (bookingState.customerEmail) {
    summaryLines.push(`E-mail: ${bookingState.customerEmail}`);
  }

  summaryLines.push(`Serviço: ${bookingState.service?.name || "Atendimento"}`);
  summaryLines.push(`Data: ${contextualDate}`);
  summaryLines.push(`Horário: ${bookingState.time || ""}`);

  if (bookingState.service?.price) {
    summaryLines.push(`Valor: R$ ${bookingState.service.price.toFixed(2).replace(".", ",")}`);
  }

  summaryLines.push("Está tudo correto?");
  return summaryLines.join("\n");
}

function buildProviderClientNotes(
  bookingState: BookingState,
  snapshot?: ProviderAppointmentConversationSnapshot | null,
): string | null {
  const lines = [
    bookingState.service?.name ? `Servico combinado: ${bookingState.service.name}` : "",
    bookingState.customerType ? `Tipo do cliente: ${bookingState.customerType}` : "",
    bookingState.customerAddress ? `Endereço: ${bookingState.customerAddress}` : "",
    bookingState.customerEmail ? `E-mail: ${bookingState.customerEmail}` : "",
    bookingState.paymentMethod ? `Pagamento: ${bookingState.paymentMethod}` : "",
  ].filter(Boolean);

  lines.push(bookingState.professional?.name ? `Profissional: ${bookingState.professional.name}` : "");
  lines.push(bookingState.date ? `Data combinada: ${formatProviderContextualDate(bookingState.date)}` : "");
  lines.push(bookingState.time ? `Horario combinado: ${bookingState.time}` : "");

  if (snapshot?.sourceChannel === "simulator") {
    lines.push(`Origem do contato: simulador (${snapshot.originalClientPhone})`);
  }

  const recentConversation = Array.isArray(snapshot?.recentConversation)
    ? snapshot.recentConversation
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .slice(-6)
    : [];

  if (recentConversation.length > 0) {
    lines.push("Resumo da conversa recente:");
    lines.push(...recentConversation);
  }

  return lines.filter(Boolean).length > 0 ? lines.filter(Boolean).join("\n") : null;
}

function buildAppointmentFailureMessage(error?: string | null): string {
  const normalizedError = String(error || '').trim();

  return [
    'Desculpa, nao consegui finalizar seu agendamento agora.',
    normalizedError ? `Motivo tecnico: ${normalizedError}.` : '',
    'Se quiser, eu posso tentar novamente a partir do que ja conversamos.',
  ].filter(Boolean).join(' ');
}

function buildAppointmentCreatedMessage(
  providerData: ProviderData,
  bookingState: BookingState,
  instructionPrompt?: string,
): string {
  const { config } = providerData;
  const promptSource = String(typeof instructionPrompt === "string" ? instructionPrompt : "");
  const contextualDate = formatProviderContextualDate(bookingState.date || '');
  const replacements = {
    cliente_nome: bookingState.customerName || 'Cliente',
    data: contextualDate,
    horario: bookingState.time || '',
    servico: bookingState.service?.name || 'Atendimento',
    profissional: getProfessionalDisplayName(bookingState.professional),
    endereco: bookingState.customerAddress || "",
    pagamento: bookingState.paymentMethod || "",
  };

  const template = config.booking_confirmation_message || [
    'Perfeito! Seu agendamento foi confirmado:',
    'Data: {data}',
    'Horário: {horario}',
    'Serviço: {servico}',
    'Profissional: {profissional}',
  ].join('\n');

  const rendered = replaceAllTokens(template, replacements).trim();
  const needsOperationalSummary = !template.includes('{data}') || !template.includes('{horario}');

  if (!needsOperationalSummary) {
    if (bookingState.paymentMethod !== "Pix") {
      return rendered;
    }

    const pixInstructions = extractPixInstructions(promptSource);
    const pixLines = [pixInstructions.keyLine, pixInstructions.holderLine].filter(Boolean);
    return pixLines.length > 0 ? [rendered, "", ...pixLines].join("\n") : rendered;
  }

  const summary = [
    rendered,
    '',
    `Data: ${contextualDate}`,
    `Horário: ${bookingState.time || ''}`,
    `Serviço: ${bookingState.service?.name || 'Atendimento'}`,
    `Profissional: ${getProfessionalDisplayName(bookingState.professional)}`,
    bookingState.customerAddress ? `Endereço: ${bookingState.customerAddress}` : '',
    bookingState.paymentMethod ? `Pagamento: ${bookingState.paymentMethod}` : '',
  ].filter(Boolean);

  if (bookingState.paymentMethod === "Pix") {
    const pixInstructions = extractPixInstructions(promptSource);
    if (pixInstructions.keyLine) {
      summary.push("", pixInstructions.keyLine);
    }
    if (pixInstructions.holderLine) {
      summary.push(pixInstructions.holderLine);
    }
  }

  return summary.join('\n').trim();
}

// ═══════════════════════════════════════════════════════════════════════
// BUSCAR DADOS DO SALÃO
// ═══════════════════════════════════════════════════════════════════════

export async function getProviderConfig(userId: string): Promise<ProviderConfig | null> {
  try {
    const { data, error } = await supabase
      .from('provider_config').select('*').eq('user_id', userId).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('❌ [Provider] Erro ao buscar config:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('❌ [Provider] Erro ao buscar config:', err);
    return null;
  }
}

export async function getProviderData(userId: string): Promise<ProviderData | null> {
  try {
    const config = await getProviderConfig(userId);
    if (!config) return null;
    const { data: services } = await supabase
      .from('provider_services').select('*').eq('user_id', userId).eq('is_active', true).order('display_order');
    const { data: professionals } = await supabase
      .from('provider_professionals').select('*').eq('user_id', userId).eq('is_active', true).order('display_order');
    return { config, services: services || [], professionals: professionals || [] };
  } catch (err) {
    console.error('❌ [Provider] Erro ao buscar dados:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BUSCAR HORÁRIOS DISPONÍVEIS (usa novo módulo)
// ═══════════════════════════════════════════════════════════════════════

async function getProviderInstructionPrompt(
  userId: string,
  config: ProviderConfig,
): Promise<{ prompt: string; source: "agent" | "empty" }> {
  try {
    const agentConfig = await storage.getAgentConfig(userId);
    const agentPrompt = String(agentConfig?.prompt || "").trim();
    if (agentPrompt) {
      return { prompt: agentPrompt, source: "agent" };
    }
  } catch (error) {
    console.error("[Provider] Falha ao carregar prompt do Meu Agente IA:", error);
  }

  return { prompt: "", source: "empty" };
}

interface ProviderPromptDrivenReplyOptions {
  fallbackText?: string;
  forbidBookingClaims?: boolean;
  forbidExclusivityClaims?: boolean;
  forbidConfirmationReview?: boolean;
  requireExplicitFinalConfirmation?: boolean;
  requiredDateTokens?: string[];
  requiredTimeTokens?: string[];
  lockedFacts?: string[];
}

interface ProviderPromptDrivenSemanticAuditResult {
  valid: boolean;
  failureReason: string | null;
  repairInstructions: string | null;
}

type ProviderOperationalAwaitingState =
  | "none"
  | "availability_consent"
  | "payment_method"
  | "confirmation"
  | "final_confirmation";

function buildProviderDateValidationTokens(date: string | null | undefined): string[] {
  const normalizedDate = normalizeProviderDateValue(date);
  if (!normalizedDate) {
    return [];
  }

  const fullDate = formatDatePtBr(normalizedDate);
  const shortDate = fullDate.slice(0, 5);
  return Array.from(new Set([fullDate, shortDate].filter(Boolean)));
}

function buildProviderPromptDrivenLockedFacts(
  providerData: ProviderData,
  bookingState: BookingState,
): string[] {
  const lockedFacts: string[] = [];

  if (bookingState.service?.name) {
    lockedFacts.push(`Serviço atual travado: ${bookingState.service.name}`);
  }

  if (bookingState.customerName?.trim()) {
    lockedFacts.push(`Nome do cliente travado: ${bookingState.customerName}`);
  }

  if (bookingState.customerAddress?.trim()) {
    lockedFacts.push(`Endereço travado: ${bookingState.customerAddress}`);
  }

  if (bookingState.customerEmail?.trim()) {
    lockedFacts.push(`E-mail travado: ${bookingState.customerEmail}`);
  }

  if (bookingState.paymentMethod?.trim()) {
    lockedFacts.push(`Forma de pagamento travada: ${bookingState.paymentMethod}`);
  }

  const resolvedPrice = Number(bookingState.service?.price);
  if (Number.isFinite(resolvedPrice) && resolvedPrice > 0) {
    lockedFacts.push(`Valor atual travado: R$ ${resolvedPrice.toFixed(2).replace(".", ",")}`);
  }

  if (bookingState.date) {
    lockedFacts.push(`Data travada: ${formatProviderContextualDate(bookingState.date)}`);
  }

  if (bookingState.time) {
    lockedFacts.push(`Horário travado: ${bookingState.time}`);
  }

  if (!bookingState.service && providerData.services.length === 1) {
    const singleService = providerData.services[0];
    lockedFacts.push(`Serviço principal cadastrado: ${singleService.name}`);
  }

  return lockedFacts;
}

function providerPromptReplyHasPrematureBookingClaim(text: string): boolean {
  const normalizedText = normalizeSimpleReply(text);
  const forbiddenSignals = [
    "agendado",
    "agendada",
    "agendei",
    "agendamento foi realizado",
    "agendamento foi realizado com sucesso",
    "agendamento confirmado",
    "agendamento esta confirmado",
    "agendamento esta marcado",
    "agendamento esta registrado",
    "agendamento criado",
    "agendamento concluido",
    "seu agendamento esta registrado",
    "seu agendamento esta marcado",
    "vamos agendar",
    "vou agendar",
    "vamos marcar",
    "vou marcar",
    "atendimento confirmado",
    "atendimento esta confirmado",
    "seu atendimento esta confirmado",
    "horario esta confirmado",
    "esse horario esta confirmado",
    "ja esta confirmado",
    "seu horario ficou marcado",
    "sua vaga ficou reservada",
    "confirmei seu agendamento",
    "marquei seu horario",
    "ficou agendado",
  ];

  return forbiddenSignals.some((signal) => normalizedText.includes(signal));
}

function providerPromptReplyHasFalseExclusivityClaim(text: string): boolean {
  const normalizedText = normalizeSimpleReply(text);
  const forbiddenSignals = [
    "unico horario",
    "unica opcao",
    "apenas esse horario",
    "apenas o horario",
    "so tenho",
    "somente tenho",
    "tenho apenas",
  ];

  return forbiddenSignals.some((signal) => normalizedText.includes(signal));
}

function providerPromptReplyHasConfirmationReview(text: string): boolean {
  const normalizedText = normalizeSimpleReply(text);
  const forbiddenSignals = [
    "esta tudo correto",
    "vou confirmar os dados",
    "confirmar os dados do agendamento",
    "obrigado pelas informacoes",
    "posso confirmar seu agendamento",
    "posso confirmar o agendamento",
  ];

  return forbiddenSignals.some((signal) => normalizedText.includes(signal));
}

function evaluateProviderPromptDrivenReply(
  text: string,
  options?: ProviderPromptDrivenReplyOptions,
): string | null {
  if (options?.forbidBookingClaims && providerPromptReplyHasPrematureBookingClaim(text)) {
    return "premature_booking_claim";
  }

  if (options?.forbidExclusivityClaims && providerPromptReplyHasFalseExclusivityClaim(text)) {
    return "false_exclusivity_claim";
  }

  if (options?.forbidConfirmationReview && providerPromptReplyHasConfirmationReview(text)) {
    return "confirmation_review_during_slot_offer";
  }

  return null;
}

function evaluateProviderPromptDrivenRequiredTokens(
  text: string,
  options?: ProviderPromptDrivenReplyOptions,
): string | null {
  if (
    options?.requiredDateTokens
    && options.requiredDateTokens.length > 0
    && !options.requiredDateTokens.some((token) => String(text || "").includes(token))
  ) {
    return `missing_required_date:${options.requiredDateTokens.join("|")}`;
  }

  if (
    options?.requiredTimeTokens
    && options.requiredTimeTokens.length > 0
    && !options.requiredTimeTokens.every((token) => String(text || "").includes(token))
  ) {
    return `missing_required_time:${options.requiredTimeTokens.join("|")}`;
  }

  return null;
}

function buildProviderPromptDrivenRepairContext(
  failureReason: string,
  options?: ProviderPromptDrivenReplyOptions,
  semanticRepairInstructions?: string | null,
): string {
  const instructions: string[] = [
    "AJUSTE OPERACIONAL OBRIGATORIO: reescreva a resposta mantendo o prompt do dono, mas corrigindo agenda e estado operacional.",
    "- Preserve exatamente os valores operacionais ja validados neste turno.",
  ];

  if (failureReason.startsWith("missing_required_date:")) {
    instructions.push(`- Cite explicitamente a data real validada: ${(options?.requiredDateTokens || []).join(" / ")}.`);
  }

  if (failureReason.startsWith("missing_required_time:")) {
    instructions.push(`- Cite explicitamente o horario real validado: ${(options?.requiredTimeTokens || []).join(" / ")}.`);
  }

  if (failureReason === "premature_booking_claim") {
    instructions.push("- Ainda nao diga que o agendamento foi criado, confirmado ou concluido. Apenas ofereca ou confirme o horario.");
    instructions.push("- Evite frases como 'vamos agendar', 'vou agendar', 'marquei' ou qualquer formula que pareca create real antes da ferramenta salvar.");
  }

  if (failureReason === "false_exclusivity_claim") {
    instructions.push("- Nao diga que e o unico horario se existem outras opcoes reais validadas.");
  }

  if (failureReason === "confirmation_review_during_slot_offer") {
    instructions.push("- Ainda nao entre em resumo final ou confirmacao final. Fique somente na etapa atual da agenda.");
  }

  if (failureReason === "missing_explicit_final_confirmation") {
    instructions.push("- A conversa ainda esta na etapa final antes do create real.");
    instructions.push("- Reescreva com resumo final natural, mas termine pedindo um sim explicito do cliente para salvar o agendamento.");
    instructions.push("- Nao agradeca a confirmacao e nao aja como se o agendamento ja estivesse concluido.");
  }

  if (failureReason === "context_mismatch") {
    instructions.push("- Releia o contexto operacional e a agenda espelhada deste turno.");
    instructions.push("- Nao contradiga a data, o horario, a disponibilidade ou a etapa atual ja validados.");
  }

  if (semanticRepairInstructions) {
    instructions.push(`- Ajuste adicional: ${semanticRepairInstructions}`);
  }

  return instructions.join("\n");
}

function contextAllowsProviderCreateClaim(contextMessage: string): boolean {
  const normalized = normalizeSimpleReply(contextMessage);
  if (!normalized) {
    return false;
  }

  return [
    "agendamento foi criado",
    "agendamento acabou de ser salvo",
    "create real aconteceu",
    "agendamento acabou de ser confirmado no sistema",
  ].some((signal) => normalized.includes(signal));
}

function setProviderAwaitingState(
  bookingState: BookingState,
  nextState: ProviderOperationalAwaitingState,
): void {
  bookingState.awaitingAvailabilityConsent = false;
  bookingState.awaitingConfirmation = false;
  bookingState.awaitingPaymentMethod = false;
  bookingState.awaitingFinalConfirmation = false;

  switch (nextState) {
    case "availability_consent":
      bookingState.awaitingAvailabilityConsent = true;
      return;
    case "payment_method":
      bookingState.awaitingPaymentMethod = true;
      return;
    case "confirmation":
      bookingState.awaitingConfirmation = true;
      return;
    case "final_confirmation":
      bookingState.awaitingFinalConfirmation = true;
      return;
    default:
      return;
  }
}

async function inferProviderPromptReplyOperationalStateLLM(
  assistantText: string,
  bookingState: BookingState,
  contextMessage: string,
  instructionPrompt?: string,
): Promise<ProviderOperationalAwaitingState> {
  const ownerPrompt = String(instructionPrompt || "").trim();
  const stateSummary = buildProviderPromptDrivenStateSummary(bookingState);

  const prompt = `Classifique o proximo estado operacional de uma atendente de agendamento.

Responda APENAS em JSON valido:
{
  "nextState": "none|availability_consent|payment_method|confirmation|final_confirmation"
}

Contexto operacional:
${contextMessage || "Sem contexto operacional adicional."}

${ownerPrompt ? `Prompt do dono:\n${ownerPrompt}\n` : ""}

Estado atual:
${stateSummary}

Resposta da atendente:
"""${assistantText}"""

Regras:
- availability_consent: a atendente pediu autorizacao, preferencia ou sinal verde do cliente antes de consultar a agenda.
- payment_method: a atendente pediu a forma de pagamento.
- confirmation: a atendente pediu uma confirmacao/revisao de dados, mas ainda nao e a confirmacao final para salvar.
- final_confirmation: a atendente apresentou o resumo final do agendamento e esta aguardando um sim explicito para salvar.
- none: qualquer outro caso.
- Se a atendente apenas ofereceu horario validado e perguntou se funciona, retorne none.
- Se a atendente apenas continuou a conversa apos um horario ja validado, retorne none.
- Se a atendente resumiu servico, data, horario, valor, pagamento ou dados do cliente e terminou pedindo o ultimo sim para confirmar/salvar, retorne final_confirmation.
- Se a atendente estiver claramente na etapa final pre-save, com resumo final, pagamento final ou "confirmacao final", e ainda nao houver create real no contexto, prefira final_confirmation mesmo se a pergunta final vier curta ou implicita.
- Se a atendente apenas disse que vai seguir para o proximo passo, coletar dados ou perguntar pagamento, retorne none.
- Nunca retorne final_confirmation so porque apareceu a palavra "confirmar" em contexto de horario.`;

  try {
    const result = await chatComplete({
      messages: [
        {
          role: "system",
          content: "Voce classifica o proximo estado operacional de uma atendente. Responda somente JSON valido.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 80,
      temperature: 0.1,
    });

    const raw = result.choices?.[0]?.message?.content || "{}";
    const jsonPayload = extractFirstJsonObject(raw);
    if (!jsonPayload) {
      return "none";
    }

    const parsed = JSON.parse(jsonPayload);
    const nextState = String(parsed?.nextState || "none").trim() as ProviderOperationalAwaitingState;
    if (
      nextState === "availability_consent"
      || nextState === "payment_method"
      || nextState === "confirmation"
      || nextState === "final_confirmation"
      || nextState === "none"
    ) {
      return nextState;
    }
  } catch (error) {
    console.warn("[Provider v2] Falha ao inferir estado operacional da resposta via LLM:", error);
  }

  return "none";
}

function buildProviderPromptDrivenStateSummary(
  bookingState: BookingState,
): string {
  return [
    bookingState.service ? `Servico atual: ${bookingState.service.name}` : "Servico atual: nenhum",
    bookingState.date ? `Data atual: ${bookingState.date}` : "Data atual: nenhuma",
    bookingState.time ? `Horario atual: ${bookingState.time}` : "Horario atual: nenhum",
    bookingState.lastSuggestedDate ? `Ultima data validada: ${bookingState.lastSuggestedDate}` : "",
    bookingState.lastSuggestedSlots.length > 0 ? `Ultimos slots validados: ${bookingState.lastSuggestedSlots.join(", ")}` : "",
    bookingState.agendaWindowContext ? "Janela viva de disponibilidade: carregada" : "",
    bookingState.awaitingAvailabilityConsent ? "Estado: aguardando autorizacao/preferencia para consultar agenda" : "",
    bookingState.awaitingConfirmation ? "Estado: aguardando confirmacao intermediaria" : "",
    bookingState.awaitingPaymentMethod ? "Estado: aguardando forma de pagamento" : "",
    bookingState.awaitingFinalConfirmation ? "Estado: aguardando confirmacao final para create" : "",
  ].filter(Boolean).join("\n");
}

function buildProviderPromptDrivenOperationalBrief(
  bookingState: BookingState,
  contextMessage: string,
): string {
  const lines = [
    "BRIEF OPERACIONAL DO ORQUESTRADOR:",
    "- O prompt do dono continua mandando na conversa. Este brief existe apenas para manter coerencia factual da agenda.",
    bookingState.service ? `- Servico em memoria: ${bookingState.service.name}.` : "- Servico em memoria: ainda nao identificado.",
    bookingState.professional?.name ? `- Profissional em memoria: ${bookingState.professional.name}.` : "",
    bookingState.date ? `- Data em memoria: ${bookingState.date}.` : "- Data em memoria: nenhuma.",
    bookingState.time ? `- Horario em memoria: ${bookingState.time}.` : "- Horario em memoria: nenhum.",
    bookingState.lastSuggestedDate ? `- Ultima data validada neste canal: ${bookingState.lastSuggestedDate}.` : "",
    bookingState.lastSuggestedSlots.length > 0 ? `- Ultimos slots validados neste canal: ${bookingState.lastSuggestedSlots.join(", ")}.` : "",
    "- Quando a conversa tocar agenda, dia, horario, mais tarde, mais cedo ou outro dia, use somente o contexto operacional deste turno antes de citar slot especifico.",
    "- Antes de afirmar que agendou, responda internamente apenas: o cliente escolheu um horario valido do contexto operacional e confirmou explicitamente? sim ou nao.",
    "- So diga que o agendamento foi realizado quando o contexto operacional disser explicitamente que o create real foi salvo.",
  ].filter(Boolean);

  const operationalContext = String(contextMessage || "").trim();
  if (operationalContext) {
    lines.push("CONTEXTO OPERACIONAL DESTE TURNO:");
    lines.push(operationalContext);
  }

  if (bookingState.agendaWindowContext) {
    lines.push("JANELA VIVA DE DISPONIBILIDADE:");
    lines.push(bookingState.agendaWindowContext);
  }

  return lines.join("\n");
}

async function evaluateProviderPromptDrivenReplySemantically(
  assistantText: string,
  bookingState: BookingState,
  contextMessage: string,
  instructionPrompt: string,
  options?: ProviderPromptDrivenReplyOptions,
): Promise<ProviderPromptDrivenSemanticAuditResult | null> {
  const ownerPrompt = String(instructionPrompt || "").trim();
  const stateSummary = buildProviderPromptDrivenStateSummary(bookingState);
  const lockedFactsSummary = (options?.lockedFacts || []).filter(Boolean).join("\n");
  const auditRules = [
    options?.requiredDateTokens?.length
      ? `- A resposta precisa preservar sem ambiguidade a data operacional validada (${options.requiredDateTokens.join(" / ")}).`
      : "",
    options?.requiredTimeTokens?.length
      ? `- A resposta precisa citar o horario operacional validado exatamente como veio do contexto (${options.requiredTimeTokens.join(" / ")}).`
      : "",
    options?.forbidBookingClaims
      ? "- A resposta nao pode dizer nem insinuar que o create real ja aconteceu."
      : "",
    options?.forbidExclusivityClaims
      ? "- A resposta nao pode dizer que e o unico horario ou a unica opcao se houver outras opcoes reais."
      : "",
    options?.forbidConfirmationReview
      ? "- A resposta nao pode pular para revisao final, resumo final ou fechamento do agendamento."
      : "",
    options?.requireExplicitFinalConfirmation
      ? "- A resposta ainda precisa pedir autorizacao explicita do cliente para salvar o agendamento. Sem create real, nao pode encerrar como concluido."
      : "",
    options?.lockedFacts?.length
      ? "- Se a resposta mencionar serviço, cliente, endereço, e-mail, pagamento, valor, data ou horário, esses fatos não podem ser trocados nem inventados."
      : "",
  ].filter(Boolean).join("\n");

  const prompt = `Audite semanticamente a resposta de uma atendente virtual de agenda.

Voce deve decidir se a resposta respeita o contexto operacional e a agenda espelhada deste turno.
Considere semantica, nao palavras exatas.

Responda APENAS em JSON valido:
{
  "valid": true,
  "failureReason": null,
  "repairInstructions": null
}

Campos permitidos em failureReason:
- null
- "missing_required_date:${(options?.requiredDateTokens || []).join("|")}"
- "missing_required_time:${(options?.requiredTimeTokens || []).join("|")}"
- "premature_booking_claim"
- "false_exclusivity_claim"
- "confirmation_review_during_slot_offer"
- "missing_explicit_final_confirmation"
- "context_mismatch"

Prompt do dono:
${ownerPrompt || "Sem prompt adicional."}

Estado atual:
${stateSummary || "Sem estado relevante."}

Contexto operacional:
${contextMessage || "Sem contexto operacional adicional."}

Fatos operacionais travados:
${lockedFactsSummary || "Sem fatos travados adicionais."}

Regras operacionais a auditar:
${auditRules || "- Sem restricoes adicionais alem da consistencia com o contexto."}

Observacao critica:
- Se o contexto operacional nao disser explicitamente que o create real ja aconteceu, frases como "esta confirmado o agendamento", "seu agendamento foi confirmado", "agendamento realizado com sucesso" ou equivalentes contam como premature_booking_claim.

Resposta da atendente:
"""${assistantText}"""

Se a resposta estiver correta, retorne valid=true.
Se estiver errada, retorne valid=false, failureReason com um dos valores permitidos e repairInstructions com uma orientacao curta e concreta para reescrever sem inventar agenda.
Se o contexto operacional ainda nao disser que o create real foi salvo, trate frases como "agendamento realizado", "agendamento confirmado", "ficou agendado", "deixei marcado" ou equivalentes como premature_booking_claim.
Se a resposta estiver apenas em fase de resumo final pedindo o ultimo sim do cliente, isso e permitido; o erro acontece somente quando ela fala como se o create ja tivesse acontecido.
Use missing_required_date ou missing_required_time apenas quando a resposta realmente deixar confuso qual e a data/horario real do turno.
Se a etapa ainda estiver em confirmacao final pre-save e a resposta resumir ou encerrar sem pedir um sim explicito para salvar, use missing_explicit_final_confirmation.
Se a resposta trocar o serviço, o valor, o cliente, o endereço, o e-mail, a forma de pagamento, a data ou o horário já travados no contexto, use context_mismatch.
Se a resposta preservar o slot semantica e naturalmente, considere valida.`;

  try {
    const result = await chatComplete({
      messages: [
        {
          role: "system",
          content: "Voce audita semanticamente respostas de agenda. Responda somente JSON valido.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      maxTokens: 180,
      temperature: 0.1,
    });

    const raw = result.choices?.[0]?.message?.content || "{}";
    const jsonPayload = extractFirstJsonObject(raw);
    if (!jsonPayload) {
      return null;
    }

    const parsed = parseJsonObjectLenient<{
      valid?: boolean;
      failureReason?: string | null;
      repairInstructions?: string | null;
    }>(jsonPayload);
    if (!parsed) {
      return null;
    }
    const valid = parsed?.valid === true;
    const failureReason = parsed?.failureReason == null
      ? null
      : String(parsed.failureReason).trim();
    const repairInstructions = parsed?.repairInstructions == null
      ? null
      : String(parsed.repairInstructions).trim();

    if (valid) {
      return {
        valid: true,
        failureReason: null,
        repairInstructions: null,
      };
    }

    if (
      failureReason === "premature_booking_claim"
      || failureReason === "false_exclusivity_claim"
      || failureReason === "confirmation_review_during_slot_offer"
      || failureReason === "missing_explicit_final_confirmation"
      || failureReason === "context_mismatch"
      || failureReason?.startsWith("missing_required_date:")
      || failureReason?.startsWith("missing_required_time:")
    ) {
      return {
        valid: false,
        failureReason,
        repairInstructions,
      };
    }
  } catch (error) {
    console.warn("[Provider v2] Falha ao auditar semanticamente a resposta prompt-driven:", error);
  }

  return null;
}

function getProviderMissingDataLabels(
  bookingState: BookingState,
  flowRequirements: ProviderFlowRequirements,
): string[] {
  const missing: string[] = [];

  if (!bookingState.service) {
    missing.push("servico");
  }

  if (!bookingState.date) {
    missing.push("data");
  }

  if (!bookingState.time) {
    missing.push("horario");
  }

  if (flowRequirements.requireCustomerType && !bookingState.customerType) {
    missing.push("tipo do cliente");
  }

  if (!bookingState.customerName?.trim()) {
    missing.push("nome completo");
  }

  if (flowRequirements.requireAddress && !bookingState.customerAddress?.trim()) {
    missing.push("endereco completo");
  }

  if (flowRequirements.requireEmail && !bookingState.customerEmail?.trim()) {
    missing.push("email");
  }

  if (flowRequirements.requirePaymentMethod && !bookingState.paymentMethod) {
    missing.push("forma de pagamento");
  }

  return missing;
}

function buildProviderPostSlotAcceptanceFallback(
  bookingState: BookingState,
  flowRequirements: ProviderFlowRequirements,
): string {
  if (flowRequirements.requireCustomerType && !bookingState.customerType) {
    return buildCustomerTypeQuestion();
  }

  if (
    !bookingState.customerName?.trim()
    || (flowRequirements.requireAddress && !bookingState.customerAddress?.trim())
    || (flowRequirements.requireEmail && !bookingState.customerEmail?.trim())
  ) {
    return buildProviderCustomerDataQuestion(flowRequirements, bookingState);
  }

  if (flowRequirements.requirePaymentMethod && !bookingState.paymentMethod) {
    return buildPaymentMethodQuestion();
  }

  if (flowRequirements.requireFinalConfirmationAfterPayment && bookingState.paymentMethod) {
    return buildProviderFinalConfirmationQuestion(bookingState);
  }

  return buildProviderBookingReviewQuestion(bookingState);
}

async function generateProviderPromptDrivenReply(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  providerData: ProviderData,
  bookingState: BookingState,
  contextMessage: string,
  instructionPrompt: string,
  options?: ProviderPromptDrivenReplyOptions,
): Promise<{ text: string }> {
  let fallbackReason: string | null = null;
  let semanticRepairInstructions: string | null = null;
  const hasConcreteBookingContext = Boolean(
    bookingState.service
    && bookingState.date
    && bookingState.time
  );
  const effectiveContextMessage = buildProviderPromptDrivenOperationalBrief(
    bookingState,
    contextMessage,
  );
  const shouldLockConcreteBookingFacts = Boolean(
    hasConcreteBookingContext
    && (
      bookingState.awaitingConfirmation
      || bookingState.awaitingPaymentMethod
      || bookingState.awaitingFinalConfirmation
      || bookingState.lastSuggestedSlots.length > 0
      || bookingState.customerType
      || bookingState.customerName
      || bookingState.customerAddress
      || bookingState.customerEmail
      || bookingState.paymentMethod
    )
  );
  const lockedFacts = options?.lockedFacts && options.lockedFacts.length > 0
    ? options.lockedFacts
    : (
      shouldLockConcreteBookingFacts
        ? buildProviderPromptDrivenLockedFacts(providerData, bookingState)
        : []
    );
  const mustKeepFinalConfirmation =
    !contextAllowsProviderCreateClaim(effectiveContextMessage)
    && hasConcreteBookingContext
    && (
      bookingState.awaitingFinalConfirmation
      || (bookingState.awaitingConfirmation && Boolean(bookingState.paymentMethod))
      || (bookingState.awaitingPaymentMethod && Boolean(bookingState.paymentMethod))
    );
  const hasOperationalSchedulingState = Boolean(
    bookingState.service
    || bookingState.date
    || bookingState.time
    || bookingState.awaitingAvailabilityConsent
    || bookingState.awaitingConfirmation
    || bookingState.awaitingPaymentMethod
    || bookingState.awaitingFinalConfirmation
    || bookingState.lastSuggestedDate
    || bookingState.lastSuggestedSlots.length > 0
  );
  const resolvedFallbackText = options?.fallbackText != null
    ? options.fallbackText
    : (
      mustKeepFinalConfirmation
        ? buildProviderPromptDrivenFinalConfirmationMessage(providerData, bookingState, instructionPrompt)
        : (
          hasOperationalSchedulingState
            ? buildProviderDeterministicFallbackResponse(
              message,
              providerData,
              bookingState,
              effectiveContextMessage,
              instructionPrompt,
            )
            : undefined
        )
    );
  const effectiveOptions: ProviderPromptDrivenReplyOptions = {
    ...options,
    fallbackText: resolvedFallbackText,
    lockedFacts,
    forbidBookingClaims: options?.forbidBookingClaims ?? !contextAllowsProviderCreateClaim(effectiveContextMessage),
    requireExplicitFinalConfirmation: options?.requireExplicitFinalConfirmation ?? mustKeepFinalConfirmation,
  };
  const shouldRunSemanticAudit = Boolean(
    (effectiveOptions.requiredDateTokens && effectiveOptions.requiredDateTokens.length > 0)
    || (effectiveOptions.requiredTimeTokens && effectiveOptions.requiredTimeTokens.length > 0)
    || effectiveOptions.forbidExclusivityClaims
    || effectiveOptions.forbidConfirmationReview
    || effectiveOptions.requireExplicitFinalConfirmation
    || Boolean(effectiveOptions.lockedFacts && effectiveOptions.lockedFacts.length > 0)
    || contextAllowsProviderCreateClaim(effectiveContextMessage)
    || (effectiveOptions.forbidBookingClaims && hasOperationalSchedulingState)
  );
  console.log(
    `[Provider v2][PromptDriven] INPUT ${JSON.stringify({
      messagePreview: String(message || "").slice(0, 120),
      stateDate: bookingState.date,
      stateTime: bookingState.time,
      lastSuggestedDate: bookingState.lastSuggestedDate,
      lastSuggestedSlots: bookingState.lastSuggestedSlots,
      contextPreview: String(effectiveContextMessage || "").slice(0, 240),
      fallbackPreview: String(effectiveOptions.fallbackText || "").slice(0, 240),
      requiredDateTokens: effectiveOptions.requiredDateTokens || [],
      requiredTimeTokens: effectiveOptions.requiredTimeTokens || [],
      lockedFacts: effectiveOptions.lockedFacts || [],
      forbidBookingClaims: effectiveOptions.forbidBookingClaims === true,
      forbidExclusivityClaims: effectiveOptions.forbidExclusivityClaims === true,
      requireExplicitFinalConfirmation: effectiveOptions.requireExplicitFinalConfirmation === true,
    })}`,
  );

  let text = await generateAIResponse(
    message,
    conversationHistory,
    providerData,
    bookingState,
    effectiveContextMessage,
    instructionPrompt,
  );

  const semanticAudit = shouldRunSemanticAudit
    ? await evaluateProviderPromptDrivenReplySemantically(
      text,
      bookingState,
      effectiveContextMessage,
      instructionPrompt,
      effectiveOptions,
    )
    : null;
  let validationFailure = semanticAudit
    ? (
      semanticAudit.valid
        ? null
        : (
          semanticAudit.failureReason
          || "context_mismatch"
        )
    )
    : evaluateProviderPromptDrivenReply(text, effectiveOptions);
  semanticRepairInstructions = semanticAudit?.valid === false
    ? semanticAudit.repairInstructions
    : null;

  if (validationFailure) {
    console.warn(`[Provider v2] Prompt-driven reply precisa de recalibracao operacional: ${validationFailure}`);
    const repairedContext = [
      effectiveContextMessage,
      buildProviderPromptDrivenRepairContext(validationFailure, effectiveOptions, semanticRepairInstructions),
    ]
      .filter(Boolean)
      .join("\n\n");

    const repairedText = await generateAIResponse(
      message,
      conversationHistory,
      providerData,
      bookingState,
      repairedContext,
      instructionPrompt,
    );

    const repairedSemanticAudit = shouldRunSemanticAudit
      ? await evaluateProviderPromptDrivenReplySemantically(
        repairedText,
        bookingState,
        repairedContext,
        instructionPrompt,
        effectiveOptions,
      )
      : null;
    const repairedFailure = repairedSemanticAudit
      ? (
        repairedSemanticAudit.valid
          ? null
          : (
            repairedSemanticAudit.failureReason
            || "context_mismatch"
          )
      )
      : evaluateProviderPromptDrivenReply(repairedText, effectiveOptions);
    if (!repairedFailure) {
      text = repairedText;
      validationFailure = null;
    } else if (effectiveOptions.fallbackText) {
      fallbackReason = repairedFailure;
      console.warn(`[Provider v2] Recalibracao via prompt falhou (${repairedFailure}). Usando fallback deterministico.`);
      text = effectiveOptions.fallbackText;
    } else {
      fallbackReason = repairedFailure;
      text = repairedText;
    }
  }

  const finalHardFailure = evaluateProviderPromptDrivenReply(text, effectiveOptions);
  if (finalHardFailure && effectiveOptions.fallbackText) {
    fallbackReason = finalHardFailure;
    text = effectiveOptions.fallbackText;
  }

  console.log(
    `[Provider v2][PromptDriven] OUTPUT ${JSON.stringify({
      stateDate: bookingState.date,
      stateTime: bookingState.time,
      lastSuggestedDate: bookingState.lastSuggestedDate,
      lastSuggestedSlots: bookingState.lastSuggestedSlots,
      fallbackReason,
      replyPreview: String(text || "").slice(0, 240),
    })}`,
  );

  const nextAwaitingState = await inferProviderPromptReplyOperationalStateLLM(
      text,
      bookingState,
      effectiveContextMessage,
      instructionPrompt,
    );
  setProviderAwaitingState(bookingState, nextAwaitingState);
  console.log(
    `[Provider v2][PromptDriven][OperationalState] ${JSON.stringify({
      nextAwaitingState,
      replyPreview: String(text || "").slice(0, 180),
    })}`,
  );
  bookingState.lastUpdated = new Date();

  return { text };
}

export async function getAvailableSlots(
  userId: string,
  date: string,
  professionalId?: string,
  serviceDuration?: number
): Promise<string[]> {
  try {
    const providerData = await getProviderData(userId);
    if (!providerData) return [];

    const slotDuration = serviceDuration || providerData.config.slot_duration || 30;

    const slots = await getAvailableStartTimes({
      userId,
      date,
      professionalId,
      serviceDurationMinutes: slotDuration,
      stepMinutes: 15,
    });

    console.log(
      `[Provider v2][Slots] ${JSON.stringify({
        userId,
        date,
        professionalId: professionalId || null,
        slotDuration,
        slots,
      })}`,
    );

    return slots;
  } catch (err) {
    console.error('❌ [Provider] Erro ao buscar slots:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CRIAR AGENDAMENTO SEGURO (revalida antes de inserir)
// ═══════════════════════════════════════════════════════════════════════

async function buildProviderAgendaMirrorContext(params: {
  userId: string;
  date: string;
  professionalId?: string;
  serviceDuration?: number;
  availableSlots?: string[];
}): Promise<string> {
  const { userId, date, professionalId, serviceDuration, availableSlots } = params;
  const slots = Array.isArray(availableSlots)
    ? availableSlots
    : await getAvailableSlots(userId, date, professionalId, serviceDuration);

  return [
    `SNAPSHOT DA AGENDA LOCAL ESPELHADA PARA ${date}:`,
    `- Slots livres reais para este servico: ${slots.length > 0 ? buildSlotDisplay(slots).join(", ") : "nenhum slot livre"}`,
    "- Os bloqueios internos e Google/Maton deste dia ja foram considerados no proprio espelho local usado para calcular esses slots.",
    Array.isArray(availableSlots)
      ? "- Fonte: mesmos slots reais consultados neste turno, sem nova releitura do espelho so para montar o contexto."
      : "- Fonte: agenda local sincronizada antes desta resposta.",
  ].join("\n");
}

export async function createProviderAppointment(
  userId: string,
  conversationId: string,
  data: {
    clientName: string;
    clientPhone: string;
    serviceId?: string;
    serviceName: string;
    professionalId?: string;
    professionalName?: string;
    appointmentDate: string;
    startTime: string;
    durationMinutes: number;
  },
  options?: {
    createdByAi?: boolean;
    confirmedByClient?: boolean;
    confirmedByBusiness?: boolean;
    status?: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
    clientNotes?: string | null;
    internalNotes?: string | null;
    source?: string;
    bookingSnapshot?: ProviderAppointmentConversationSnapshot | null;
  },
): Promise<{ success: boolean; appointmentId?: string; error?: string; suggestedSlots?: string[] }> {
  try {
    const normalizedDate = normalizeProviderDateValue(data.appointmentDate);
    const normalizedTime = normalizeProviderTimeValue(data.startTime);
    const providerConfig = await getProviderConfig(userId);
    const persistedClientPhone = getProviderPersistedClientPhone(data.clientPhone);

    console.log(
      `[Provider v2][CreateAppointment] START ${JSON.stringify({
        userId,
        conversationId: String(conversationId || "").trim() || null,
        requestedClientPhone: data.clientPhone,
        persistedClientPhone,
        appointmentDate: normalizedDate,
        startTime: normalizedTime,
        durationMinutes: data.durationMinutes,
        serviceId: data.serviceId || null,
        serviceName: data.serviceName,
        professionalId: data.professionalId || null,
        professionalName: data.professionalName || null,
      })}`,
    );

    if (!normalizedDate || !normalizedTime) {
      return { success: false, error: 'Data ou horário inválido' };
    }

    // Verificar se o profissional foi especificado
    let professionalId = data.professionalId;
    let professionalName = data.professionalName;
    let activeProfessionalCount = 0;

    if (!professionalId) {
      const { count, error: activeProfessionalCountError } = await supabase
        .from('provider_professionals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_active', true);

      if (activeProfessionalCountError) {
        console.error('❌ [Provider] Erro ao contar profissionais ativos:', activeProfessionalCountError);
        return { success: false, error: 'Nao consegui validar os profissionais antes de salvar o agendamento' };
      }

      activeProfessionalCount = count || 0;
    }

    if (!professionalId && activeProfessionalCount > 0) {
      // Buscar um profissional disponível automaticamente
      const availableProfId = await findAvailableProfessional(
        userId, normalizedDate, normalizedTime, data.durationMinutes
      );

      if (!availableProfId) {
        // Nenhum profissional disponível
        const { availableSlots } = await validateSlot(userId, normalizedDate, normalizedTime, undefined, data.durationMinutes);
        return {
          success: false,
          error: 'Nenhum profissional disponível para este horário',
          suggestedSlots: availableSlots.slice(0, 5)
        };
      }

      // Buscar nome do profissional
      const { data: profData } = await supabase
        .from('provider_professionals')
        .select('name')
        .eq('id', availableProfId)
        .single();

      professionalId = availableProfId;
      professionalName = profData?.name || null;
    } else if (!professionalId) {
      console.log(`[Provider v2][CreateAppointment] Nenhum profissional ativo cadastrado para ${userId}; criando sem professionalId.`);
    }

    // REVALIDAR slot antes de inserir (evita race condition)
    const { valid, availableSlots } = await validateSlot(
      userId, normalizedDate, normalizedTime, professionalId, data.durationMinutes
    );
    if (!valid) {
      console.log(`❌ [Provider] Slot ${normalizedTime} em ${normalizedDate} já ocupado! Sugerindo alternativas.`);
      return { success: false, error: 'Horário já ocupado', suggestedSlots: availableSlots.slice(0, 5) };
    }

    const { data: existingAppointments, error: existingAppointmentError } = await supabase
      .from('provider_appointments')
      .select('id, client_name, client_phone, service_name, ai_conversation_context')
      .eq('user_id', userId)
      .eq('client_phone', persistedClientPhone)
      .eq('appointment_date', normalizedDate)
      .eq('start_time', normalizedTime)
      .in('status', ['pending', 'confirmed'])
      .limit(5);

    if (existingAppointmentError) {
      console.error('❌ [Provider] Erro ao verificar idempotência do agendamento:', existingAppointmentError);
    } else if (existingAppointments && existingAppointments.length > 0) {
      const normalizedClientName = (data.clientName || '').trim().toLocaleLowerCase('pt-BR');
      const normalizedServiceName = (data.serviceName || '').trim().toLocaleLowerCase('pt-BR');
      const matchingAppointment = existingAppointments.find((appointment: any) => {
        const sameContact = providerAppointmentMatchesContact(
          appointment.client_phone,
          appointment.ai_conversation_context,
          data.clientPhone,
        );
        const sameName = String(appointment.client_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedClientName;
        const sameService = !normalizedServiceName
          || String(appointment.service_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedServiceName;

        return sameContact && sameName && sameService;
      }) || existingAppointments.find((appointment: any) => providerAppointmentMatchesContact(
        appointment.client_phone,
        appointment.ai_conversation_context,
        data.clientPhone,
      ));

      if (matchingAppointment) {
        console.log(`[Provider] Reaproveitando agendamento existente ${matchingAppointment.id} para ${normalizedDate} ${normalizedTime}`);
        return { success: true, appointmentId: matchingAppointment.id };
      }
    }

    const [startH, startM] = normalizedTime.split(':').map(Number);
    const endMinutes = startH * 60 + startM + data.durationMinutes;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    // ÚLTIMA CHECAGEM DE OVERLAP antes do insert (anti-race)
    const hasOverlap = await checkOverlapBeforeInsert(
      userId, normalizedDate, normalizedTime, endTime, professionalId || null
    );

    if (hasOverlap) {
      console.log(`❌ [Provider] Overlap detectado na checagem final! Abortando insert.`);
      return { success: false, error: 'Conflito de horário detectado', suggestedSlots: availableSlots.slice(0, 5) };
    }

    console.log(
      `[Provider v2][CreateAppointment][MirrorValidated] ${JSON.stringify({
        userId,
        appointmentDate: normalizedDate,
        startTime: normalizedTime,
        endTime,
        durationMinutes: data.durationMinutes,
        professionalId: professionalId || null,
        professionalName: professionalName || null,
        validationSource: "provider_calendar_busy_windows",
      })}`,
    );

    let safeConversationId: string | null = null;
    if (conversationId) {
      const { data: conversationRecord, error: conversationLookupError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .maybeSingle();

      if (conversationLookupError) {
        console.warn('[Provider] Could not validate conversation_id, saving appointment without conversation link:', conversationLookupError);
      } else if (conversationRecord?.id) {
        safeConversationId = conversationRecord.id;
      }
    }

    const { data: appointment, error } = await supabase
      .from('provider_appointments')
      .insert({
        user_id: userId,
        conversation_id: safeConversationId,
        client_name: data.clientName,
        client_phone: persistedClientPhone,
        service_id: data.serviceId || null,
        service_name: data.serviceName,
        professional_id: professionalId || null,
        professional_name: professionalName || null,
        appointment_date: normalizedDate,
        start_time: normalizedTime,
        end_time: endTime,
        duration_minutes: data.durationMinutes,
        status: options?.status || (getModuleAutoConfirmValue(providerConfig?.opening_hours) ? 'confirmed' : 'pending'),
        confirmed_by_client: options?.confirmedByClient ?? true,
        confirmed_by_business: options?.confirmedByBusiness ?? (options?.status ? options.status === 'confirmed' : getModuleAutoConfirmValue(providerConfig?.opening_hours)),
        created_by_ai: options?.createdByAi ?? true,
        client_notes: options?.clientNotes || null,
        internal_notes: options?.internalNotes || null,
        ai_conversation_context: {
          source: options?.source || 'provider_ai_service_v2',
          normalizedDate,
          normalizedTime,
          serviceId: data.serviceId || options?.bookingSnapshot?.serviceId || null,
          serviceName: data.serviceName,
          professionalId: professionalId || null,
          professionalName: professionalName || null,
          conversationId: safeConversationId,
          requestedConversationId: options?.bookingSnapshot?.requestedConversationId || null,
          clientName: data.clientName,
          originalClientPhone: options?.bookingSnapshot?.originalClientPhone || data.clientPhone,
          persistedClientPhone,
          sourceChannel: options?.bookingSnapshot?.sourceChannel || (isProviderSimulatorPhone(data.clientPhone) ? 'simulator' : 'whatsapp'),
          customerType: options?.bookingSnapshot?.customerType || null,
          customerAddress: options?.bookingSnapshot?.customerAddress || null,
          customerEmail: options?.bookingSnapshot?.customerEmail || null,
          paymentMethod: options?.bookingSnapshot?.paymentMethod || null,
          recentConversation: options?.bookingSnapshot?.recentConversation || [],
        },
      })
      .select().single();

    if (error) {
      console.error('❌ [Provider] Erro ao criar agendamento:', error);
      return { success: false, error: error.message };
    }
    console.log(`✅ [Provider] Agendamento criado: ${appointment.id}`);
    console.log(
      `[Provider v2][CreateAppointment] SUCCESS ${JSON.stringify({
        appointmentId: appointment.id,
        appointmentDate: appointment.appointment_date,
        startTime: appointment.start_time,
        persistedClientPhone,
      })}`,
    );
    const syncResult = await syncProviderAppointmentWithCalendar(
      userId,
      {
        id: appointment.id,
        clientName: appointment.client_name,
        clientPhone: appointment.client_phone,
        appointmentDate: appointment.appointment_date,
        appointmentTime: appointment.start_time,
        serviceName: appointment.service_name,
        notes: appointment.client_notes || appointment.internal_notes,
        googleEventId: appointment.google_event_id,
        extraDetails: buildProviderAppointmentExtraDetails(options?.bookingSnapshot),
      },
      appointment.duration_minutes || data.durationMinutes,
    );

    if (!syncResult.success) {
      console.error(`âŒ [Provider] Falha ao sincronizar agendamento ${appointment.id} com Google Calendar:`, syncResult.error);
      await supabase
        .from('provider_appointments')
        .delete()
        .eq('id', appointment.id)
        .eq('user_id', userId);

      return {
        success: false,
        error: syncResult.error || 'Falha ao sincronizar com Google Calendar',
      };
    }

    if (syncResult.eventId) {
      await supabase
        .from('provider_appointments')
        .update({
          google_event_id: syncResult.eventId,
          google_calendar_synced: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.id)
        .eq('user_id', userId);
    }

    const schedulingSettings = getModuleSchedulingSettings(providerConfig?.opening_hours);
    if (schedulingSettings.booking_notification_enabled && schedulingSettings.booking_notification_phone) {
      const { sendSchedulingBookingNotification } = await import("./schedulingNotificationService");
      await sendSchedulingBookingNotification(userId, schedulingSettings.booking_notification_phone, {
        id: appointment.id,
        clientName: appointment.client_name,
        clientPhone: appointment.client_phone,
        appointmentDate: appointment.appointment_date,
        startTime: appointment.start_time,
        endTime: appointment.end_time,
        serviceName: appointment.service_name,
      }).catch((error) => {
        console.error("[Provider] Failed to send booking notification:", error);
      });
    }

    return { success: true, appointmentId: appointment.id };
  } catch (err) {
    console.error('❌ [Provider] Erro ao criar agendamento:', err);
    return { success: false, error: 'Erro interno' };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXTRAÇÃO DE CAMPOS VIA IA (LLM → JSON estruturado)
// ═══════════════════════════════════════════════════════════════════════

interface ExtractedFields {
  intent: 'greeting' | 'booking' | 'check_availability' | 'info_services' | 'info_hours' | 'info_prices' | 'confirm' | 'cancel' | 'check_booking' | 'general';
  service?: string | string[];
  professional?: string;
  date?: string;
  time?: string;
  customerType?: string;
  customerName?: string;
  customerAddress?: string;
  customerEmail?: string;
  paymentMethod?: string;
}

async function inferContextualProviderServiceNameLLM(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  providerData: ProviderData,
  bookingState: BookingState,
  instructionPrompt?: string,
): Promise<string | null> {
  const promptSource = String(instructionPrompt || providerData.config.ai_instructions || "").trim();
  const recentHistory = conversationHistory.slice(-10)
    .map((turn) => `${turn.fromMe ? "Atendente" : "Cliente"}: ${turn.text}`)
    .join("\n");
  const stateSummary = [
    bookingState.date ? `Data atual: ${bookingState.date}` : "",
    bookingState.time ? `Horario atual: ${bookingState.time}` : "",
    bookingState.lastSuggestedDate ? `Ultima data sugerida: ${bookingState.lastSuggestedDate}` : "",
    bookingState.lastSuggestedSlots.length > 0 ? `Ultimos horarios sugeridos: ${bookingState.lastSuggestedSlots.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  try {
    const result = await chatComplete({
      messages: [
        {
          role: "system",
          content: "Voce identifica o nome contextual do atendimento/agendamento. Responda somente JSON valido sem markdown.",
        },
        {
          role: "user",
          content: `Nao ha servicos cadastrados neste prestador.\n\nPrompt do dono:\n${promptSource || "Sem prompt adicional"}\n\nEstado atual:\n${stateSummary || "Sem estado adicional"}\n\nHistorico recente:\n${recentHistory || "Sem historico"}\n\nMensagem atual do cliente: "${message}"\n\nRetorne JSON no formato {"serviceName":"..."}.\nSe o contexto realmente deixar claro qual atendimento, reuniao ou servico esta sendo agendado, preencha serviceName com um nome curto e natural.\nSe nao estiver claro, responda {"serviceName":null}.`,
        },
      ],
      maxTokens: 80,
      temperature: 0.1,
    });

    const raw = result.choices?.[0]?.message?.content || "{}";
    const jsonPayload = extractFirstJsonObject(raw);
    if (!jsonPayload) {
      return null;
    }

    const parsed = JSON.parse(jsonPayload);
    const serviceName = String(parsed?.serviceName || "").trim();
    return serviceName || null;
  } catch (error) {
    console.error("[Provider v2] Falha ao inferir servico contextual via LLM:", error);
    return null;
  }
}

async function inferProviderCustomerNameFromConversationLLM(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  bookingState: BookingState,
): Promise<string | null> {
  const recentHistory = conversationHistory
    .slice(-12)
    .map((turn) => `${turn.fromMe ? "Atendente" : "Cliente"}: ${turn.text}`)
    .join("\n");

  const stateSummary = [
    bookingState.customerName ? `Nome atual no estado: ${bookingState.customerName}` : "",
    bookingState.customerType ? `Tipo do cliente: ${bookingState.customerType}` : "",
    bookingState.customerAddress ? `Endereco atual: ${bookingState.customerAddress}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `Extraia somente o nome do cliente a partir da conversa, sem inventar.

Responda APENAS em JSON valido:
{
  "customerName": "nome do cliente ou null"
}

Estado atual:
${stateSummary || "Sem nome atual no estado."}

Historico recente:
${recentHistory || "Sem historico recente."}

Mensagem atual do cliente:
"""${message}"""

Regras:
- Retorne o nome somente se o cliente realmente tiver informado ou se ele estiver claramente presente no historico como dado do proprio cliente.
- Nunca retorne o nome da atendente, do negocio ou de terceiros.
- Se nao houver confianca suficiente, retorne null.
- Nao invente sobrenome.`;

  try {
    const result = await chatComplete({
      messages: [
        {
          role: "system",
          content: "Voce extrai somente o nome real do cliente a partir da conversa. Responda somente JSON valido.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 80,
      temperature: 0.1,
    });

    const raw = result.choices?.[0]?.message?.content || "{}";
    const jsonPayload = extractFirstJsonObject(raw);
    if (!jsonPayload) {
      return null;
    }

    const parsed = parseJsonObjectLenient<{ customerName?: string }>(jsonPayload);
    if (!parsed) {
      return null;
    }
    const candidate = String(parsed?.customerName || "").trim();
    return shouldAcceptCustomerNameCandidate(candidate) ? candidate : null;
  } catch (error) {
    console.warn("[Provider v2] Falha ao inferir nome do cliente via LLM:", error);
    return null;
  }
}

function normalizeExtractedProviderServiceNames(service: string | string[] | undefined): string[] {
  if (Array.isArray(service)) {
    return service
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  const normalized = String(service || "").trim();
  return normalized ? [normalized] : [];
}

function buildCompositeProviderService(
  matchedServices: ProviderService[],
  fallbackLabel?: string | null,
  fallbackDuration?: number,
): ProviderService | null {
  const dedupedServices = matchedServices.filter(
    (service, index, array) => array.findIndex((entry) => entry.id === service.id) === index,
  );

  if (dedupedServices.length === 0) {
    const virtualName = String(fallbackLabel || "").trim();
    if (!virtualName) {
      return null;
    }

    return buildVirtualProviderService(virtualName, fallbackDuration || 30);
  }

  if (dedupedServices.length === 1) {
    return dedupedServices[0];
  }

  return {
    id: "",
    name: dedupedServices.map((service) => service.name).join(" + "),
    description: "Serviço combinado extraído da conversa",
    duration_minutes: dedupedServices.reduce(
      (total, service) => total + Math.max(0, Number(service.duration_minutes) || 0),
      0,
    ) || (fallbackDuration || 30),
    price: null,
    is_active: true,
    color: null,
  };
}

async function extractProviderFieldsLLM(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  providerData: ProviderData,
  bookingState: BookingState
): Promise<ExtractedFields> {
  const now = getBrazilNow();
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const todayStr = dayNames[now.getDay()];
  const todayDate = getBrazilToday();

  const servicesList = providerData.services.map(s => s.name).join(', ');
  const profList = providerData.professionals.map(p => p.name).join(', ');
  const serviceCatalogGuidance = providerData.services.length > 0
    ? `Serviços disponíveis: ${servicesList}`
    : 'Serviços disponíveis: nenhum cadastrado. Se a conversa ou o prompt do dono já deixarem claro o tipo de reunião, atendimento ou serviço combinado, preencha service com esse nome contextual sem pedir novamente ao cliente.';

  const stateInfo = [
    bookingState.service ? `Serviço já escolhido: ${bookingState.service.name}` : '',
    bookingState.professional ? `Profissional já escolhido: ${bookingState.professional.name}` : '',
    bookingState.date ? `Data já escolhida: ${bookingState.date}` : '',
    bookingState.time ? `Horário já escolhido: ${bookingState.time}` : '',
    bookingState.customerType ? `Tipo do cliente: ${bookingState.customerType}` : '',
    bookingState.customerName ? `Nome do cliente: ${bookingState.customerName}` : '',
    bookingState.customerAddress ? `Endereço já coletado: ${bookingState.customerAddress}` : '',
    bookingState.customerEmail ? `E-mail já coletado: ${bookingState.customerEmail}` : '',
    bookingState.paymentMethod ? `Forma de pagamento já informada: ${bookingState.paymentMethod}` : '',
    bookingState.lastSuggestedDate ? `Última data de slots validados: ${bookingState.lastSuggestedDate}` : '',
    bookingState.lastSuggestedSlots.length > 0 ? `Últimos horários válidos mostrados: ${bookingState.lastSuggestedSlots.join(', ')}` : '',
    bookingState.awaitingConfirmation ? 'AGUARDANDO CONFIRMAÇÃO DO CLIENTE' : '',
    bookingState.awaitingPaymentMethod ? 'AGUARDANDO FORMA DE PAGAMENTO' : '',
    bookingState.awaitingFinalConfirmation ? 'AGUARDANDO CONFIRMAÇÃO FINAL DO AGENDAMENTO' : '',
  ].filter(Boolean).join('\n');

  const recentHistory = conversationHistory.slice(-10)
    .map(m => `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text}`)
    .join('\n');

  const validatedSlotContext = buildValidatedSlotContext(bookingState);
  const secondaryAgendaGuidance = buildProviderSecondaryAgendaGuidance(bookingState, "extract");
  const implicitServiceGuidance = providerData.services.length === 0
    ? 'IMPORTANTE: Nao ha servicos cadastrados. Se a conversa, o historico recente ou o prompt do dono ja deixarem claro qual reuniao, atendimento ou servico foi combinado, extraia esse nome em service sem pedir novamente ao cliente.'
    : '';

  const extractPrompt = `Extraia campos estruturados da mensagem do cliente de um prestador de servicos.

Hoje: ${todayStr}, ${todayDate}
Serviços disponíveis: ${servicesList || 'Nenhum cadastrado'}
Profissionais: ${profList || 'Nenhum cadastrado'}

Estado atual do agendamento:
${stateInfo || 'Nenhum dado coletado ainda'}

Histórico recente:
${recentHistory}

Slots já validados no backend:
${validatedSlotContext}

Mensagem atual do cliente: "${message}"

${implicitServiceGuidance}
${secondaryAgendaGuidance}

Responda APENAS em JSON (sem markdown):
{
  "intent": "greeting|booking|check_availability|info_services|info_hours|info_prices|confirm|cancel|check_booking|general",
  "service": "nome exato do serviço ou null",
  "professional": "nome exato do profissional ou null",
  "date": "YYYY-MM-DD ou null (hoje=${todayDate}, amanhã=calcule, próxima segunda=calcule, etc)",
  "time": "HH:mm ou null (fim da tarde=16:00, manhã=09:00, depois do almoço=14:00, etc)",
  "customerType": "Pessoa física|Pessoa jurídica|null",
  "customerName": "nome do cliente ou null",
  "customerAddress": "endereço informado pelo cliente ou null",
  "customerEmail": "e-mail informado pelo cliente ou null",
  "paymentMethod": "Pix|Cartão|Cartão - débito|Cartão - crédito|null"
}

Regras:
- Se o cliente diz "sim", "confirmo", "pode marcar" e estamos AGUARDANDO CONFIRMAÇÃO, intent="confirm"
- Se o cliente mencionar mais de um serviço na mesma mensagem, retorne service como array com os nomes encontrados, na ordem da conversa
- Se menciona serviço (mesmo parcial), extraia o nome EXATO do serviço disponível mais próximo
- Se menciona profissional, extraia o nome EXATO
- Se nao houver servicos cadastrados, mas o atendimento ja estiver claro no historico, no prompt do dono ou na propria conversa, extraia esse nome contextual em service
- Datas relativas: "amanhã" → calcule a data, "segunda" → próxima segunda, "sábado" → próximo sábado
- Horários vagos: "fim da tarde" → 16:00, "depois do almoço" → 14:00, "manhã" → 09:00, "meio dia" → 12:00
- Se houver um resumo anterior da atendente com data/horário e o cliente apenas confirmar, repita esses mesmos campos no JSON
- Se o cliente informar residência, apartamento, casa ou pessoa física, customerType="Pessoa física"
- Se o cliente informar empresa, comércio ou pessoa jurídica, customerType="Pessoa jurídica"
- Se o cliente enviar endereço completo, preencha customerAddress
- Se o cliente enviar e-mail, preencha customerEmail
- Se o cliente disser pix, cartão, débito ou crédito, preencha paymentMethod
- Se o cliente disser "pessoa física", "pessoa jurídica", "residência" ou "empresa", isso é customerType e nunca customerName
- Se o cliente mandar nome/endereço/e-mail juntos em linhas separadas, extraia os três campos corretamente
- Se estivermos aguardando forma de pagamento e o cliente responder "pix" ou "cartão", isso NÃO confirma o agendamento sozinho
- Quando estivermos aguardando confirmação final do agendamento, só marque intent="confirm" se o cliente disser um "sim" explícito
- Se o estado já estiver em confirmação, forma de pagamento ou confirmação final, e a mensagem atual trouxer só pagamento, nome, endereço, e-mail, tipo do cliente ou um "sim" curto, NÃO reintroduza service, professional, date ou time a partir do histórico
- Se houver slots já validados no backend, nunca invente horário novo fora dessa lista sem o cliente escrever explicitamente outro horário
- Se a data vier em formato brasileiro (ex: 05/03/2026), interprete como DD/MM/YYYY, nunca como MM/DD/YYYY
- "não", "cancelar", "desistir" → intent="cancel"
- Se o cliente quer agendar algo (cortar, pintar, fazer unha, etc) → intent="booking"
- Se o cliente pergunta sobre DISPONIBILIDADE de horários sem mencionar serviço específico ("quais horários tem", "tem horário", "horário disponível", "tem vaga", "o que tem disponível") → intent="check_availability" (com a data se mencionada)
- Se a mensagem vier curta e depender do contexto ("esse horário", "esse dia", "pode ser", "fechado"), use o estado atual e o histórico recente para completar os campos`;

  try {
    const result = await chatComplete({
      messages: [
        { role: 'system', content: 'Você é um extrator de campos para sistema de agendamento. Responda SOMENTE JSON válido, sem markdown.' },
        { role: 'user', content: extractPrompt }
      ],
      maxTokens: 200,
      temperature: 0.1,
    });

    const raw = result.choices?.[0]?.message?.content || '{}';
    const jsonPayload = extractFirstJsonObject(raw);
    if (!jsonPayload) return { intent: 'general' };

    const parsed = JSON.parse(jsonPayload);
    const normalizedDate = normalizeProviderDateValue(parsed.date);
    const normalizedTime = normalizeProviderTimeValue(parsed.time);

    return {
      intent: parsed.intent || 'general',
      service: Array.isArray(parsed.service)
        ? parsed.service.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
        : parsed.service || undefined,
      professional: parsed.professional || undefined,
      date: normalizedDate || undefined,
      time: normalizedTime || undefined,
      customerType: parsed.customerType || undefined,
      customerName: parsed.customerName || undefined,
      customerAddress: parsed.customerAddress || undefined,
      customerEmail: parsed.customerEmail || undefined,
      paymentMethod: parsed.paymentMethod || undefined,
    };
  } catch (err) {
    console.error('❌ [Provider] Erro na extração LLM:', err);
    return extractProviderFieldsHeuristically(message, providerData, bookingState);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RESOLVER SERVIÇO E PROFISSIONAL POR NOME (fuzzy match)
// ═══════════════════════════════════════════════════════════════════════

function matchService(name: string | undefined, services: ProviderService[]): ProviderService | null {
  if (!name || services.length === 0) return null;
  const lower = normalizeSimpleReply(name);
  // Exact match
  const exact = services.find(s => normalizeSimpleReply(s.name) === lower);
  if (exact) return exact;
  // Partial match
  const partial = services.find(s =>
    normalizeSimpleReply(s.name).includes(lower) || lower.includes(normalizeSimpleReply(s.name))
  );
  if (partial) return partial;

  const messageTokens = tokenizeNormalizedMessage(name);
  let bestMatch: ProviderService | null = null;
  let bestScore = 0;

  for (const service of services) {
    const serviceTokens = tokenizeNormalizedMessage(service.name);
    const score = scoreNormalizedTermOverlap(messageTokens, serviceTokens);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = service;
    }
  }

  return bestScore >= 0.72 ? bestMatch : null;
}

function matchProfessional(name: string | undefined, professionals: ProviderProfessional[]): ProviderProfessional | null {
  if (!name || professionals.length === 0) return null;
  const lower = normalizeSimpleReply(name);
  const noPreferenceTerms = ['qualquer', 'tanto faz', 'sem prefer'];
  if (noPreferenceTerms.some(term => lower.includes(term))) return professionals[0];
  const exact = professionals.find(p => normalizeSimpleReply(p.name) === lower);
  if (exact) return exact;
  const partial = professionals.find(p =>
    normalizeSimpleReply(p.name).includes(lower) || lower.includes(normalizeSimpleReply(p.name))
  );
  if (partial) return partial;

  const messageTokens = tokenizeNormalizedMessage(name);
  let bestMatch: ProviderProfessional | null = null;
  let bestScore = 0;

  for (const professional of professionals) {
    const professionalTokens = tokenizeNormalizedMessage(professional.name);
    const score = scoreNormalizedTermOverlap(messageTokens, professionalTokens);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = professional;
    }
  }

  return bestScore >= 0.8 ? bestMatch : null;
}

// ═══════════════════════════════════════════════════════════════════════
// FUNÇÃO ESTRUTURADA PARA SUGESTÃO DE HORÁRIOS (JSON + VALIDAÇÃO)
// ═══════════════════════════════════════════════════════════════════════

interface SlotSuggestionResult {
  messageText: string;
  suggestedSlots: string[];
}

interface SlotSuggestionOptions {
  message: string;
  conversationHistory: Array<{ fromMe: boolean; text: string }>;
  providerData: ProviderData;
  bookingState: BookingState;
  date: string;
  allowedSlots: string[];
  breakConfig?: { enabled: boolean; start: string; end: string };
  serviceName?: string;
  instructionPrompt?: string;
}

/**
 * Gera sugestão de horários via LLM com validação estruturada.
 * A IA retorna JSON com messageText e suggestedSlots, e validamos que
 * suggestedSlots é subconjunto de allowedSlots.
 */
async function generateSlotSuggestionMessageLLM(
  options: SlotSuggestionOptions
): Promise<SlotSuggestionResult> {
  const fallbackSlots = buildSlotDisplay(options.allowedSlots);
  const fallbackMessage = buildDeterministicSlotSuggestionMessage({
    date: options.date,
    allowedSlots: fallbackSlots,
    serviceName: options.serviceName,
    breakConfig: options.breakConfig,
  });
  const ownerPrompt = String(
    options.instructionPrompt
    || options.providerData.config.ai_instructions
    || "",
  ).trim();

  console.log(
    `[Provider v2][SlotSuggestionLLM] INPUT ${JSON.stringify({
      date: options.date,
      serviceName: options.serviceName || null,
      allowedSlots: fallbackSlots,
      messagePreview: String(options.message || "").slice(0, 180),
    })}`,
  );

  if (fallbackSlots.length === 0) {
    return {
      messageText: fallbackMessage,
      suggestedSlots: fallbackSlots,
    };
  }

  const stateInfo = [
    options.bookingState.service ? `Servico atual: ${options.bookingState.service.name}` : "",
    options.bookingState.professional ? `Profissional atual: ${options.bookingState.professional.name}` : "",
    options.bookingState.date ? `Data em memoria: ${options.bookingState.date}` : "",
    options.bookingState.time ? `Horario em memoria: ${options.bookingState.time}` : "",
    options.bookingState.lastSuggestedDate ? `Ultima data validada: ${options.bookingState.lastSuggestedDate}` : "",
    options.bookingState.lastSuggestedSlots.length > 0 ? `Ultimos slots validados: ${options.bookingState.lastSuggestedSlots.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const historyInfo = options.conversationHistory
    .slice(-8)
    .map((entry) => `${entry.fromMe ? "Atendente" : "Cliente"}: ${entry.text}`)
    .join("\n");

  const secondaryAgendaGuidance = buildProviderSecondaryAgendaGuidance(options.bookingState, "reply");

  const prompt = `Redija a resposta de WhatsApp de uma atendente virtual para oferta de horarios reais de agenda.

${ownerPrompt ? `PROMPT DO DONO (preserve estilo e ordem da conversa, sem inventar agenda):\n${ownerPrompt}\n` : ""}
${secondaryAgendaGuidance}

ESTADO OPERACIONAL:
${stateInfo || "Nenhum estado relevante em memoria."}

DATA CONSULTADA: ${options.date}
SERVICO: ${options.serviceName || "Atendimento"}
HORARIOS LIVRES REAIS DESTE TURNO: ${fallbackSlots.join(", ")}
${options.breakConfig?.enabled ? `INTERVALO CONFIGURADO: ${options.breakConfig.start}-${options.breakConfig.end}` : ""}

HISTORICO RECENTE:
${historyInfo || "Sem historico recente."}

MENSAGEM ATUAL DO CLIENTE:
${options.message}

Responda APENAS em JSON valido:
{
  "messageText": "mensagem final para o cliente",
  "suggestedSlots": ["HH:mm"]
}

Regras:
- Use somente horarios da lista HORARIOS LIVRES REAIS DESTE TURNO.
- Nao invente dia, horario, servico, pagamento ou confirmacao.
- Siga o estilo natural do WhatsApp e preserve a conversa do dono, sem menus.
- Se o cliente pediu mais tarde, mais cedo, outro horario ou outro dia, escolha os slots reais mais coerentes com esse pedido.
- Se houver muitos horarios, voce pode destacar um ou poucos, mas suggestedSlots deve conter apenas horarios reais da lista.
- Nao diga que o agendamento foi criado.
- Nao use markdown, emojis ou listas com asterisco.
- Seja breve.`;

  try {
    const result = await chatComplete({
      messages: [
        {
          role: "system",
          content: "Voce gera resposta conversacional de agenda para WhatsApp. Responda somente JSON valido.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      maxTokens: 220,
      temperature: 0.2,
    });

    const raw = result.choices?.[0]?.message?.content || "{}";
    const jsonPayload = extractFirstJsonObject(raw);
    if (!jsonPayload) {
      return {
        messageText: fallbackMessage,
        suggestedSlots: fallbackSlots,
      };
    }

    const parsed = JSON.parse(jsonPayload);
    const parsedSlots = Array.isArray(parsed?.suggestedSlots)
      ? parsed.suggestedSlots
        .map((entry: unknown) => normalizeProviderTimeValue(String(entry || "")))
        .filter((entry: string | null): entry is string => Boolean(entry))
        .filter((entry: string, index: number, array: string[]) => array.indexOf(entry) === index)
        .filter((entry: string) => fallbackSlots.includes(entry))
      : [];

    const messageText = sanitizeProviderAssistantText(String(parsed?.messageText || ""));
    const safeSlots = parsedSlots.length > 0 ? parsedSlots : fallbackSlots;
    const messageMentionsRealSlot = safeSlots.some((slot) => messageText.includes(slot));

    if (!messageText || !messageMentionsRealSlot) {
      return {
        messageText: fallbackMessage,
        suggestedSlots: safeSlots,
      };
    }

    console.log(
      `[Provider v2][SlotSuggestionLLM] OUTPUT ${JSON.stringify({
        messagePreview: messageText.slice(0, 220),
        suggestedSlots: safeSlots,
      })}`,
    );

    return {
      messageText,
      suggestedSlots: safeSlots,
    };
  } catch (error) {
    console.error("[Provider v2] Falha ao gerar sugestao de horarios via LLM:", error);
    return {
      messageText: fallbackMessage,
      suggestedSlots: fallbackSlots,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GERAR RESPOSTA VIA IA (conversacional)
// ═══════════════════════════════════════════════════════════════════════

async function generateAIResponse(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  providerData: ProviderData,
  bookingState: BookingState,
  contextMessage: string,
  instructionPrompt?: string,
): Promise<string> {
  const { config, services, professionals } = providerData;

  const agentPrompt = String(typeof instructionPrompt === "string" ? instructionPrompt : "");

  const servicesInfo = services.length > 0
    ? services.map(s => {
        const price = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'Consulte';
        return `- ${s.name}: ${price} (${s.duration_minutes || 30}min)${s.description ? ' - ' + s.description : ''}`;
      }).join('\n')
    : 'Nenhum serviço cadastrado.';

  const profsInfo = professionals.length > 0
    ? professionals.map(p => `- ${p.name}${p.bio ? ': ' + p.bio : ''}`).join('\n')
    : 'Nenhum profissional cadastrado.';

  const hoursInfo = formatProviderHours(config.opening_hours);
  const secondaryAgendaGuidance = buildProviderSecondaryAgendaGuidance(bookingState, "reply");

  const stateInfo = [
    bookingState.service ? `Serviço escolhido: ${bookingState.service.name}` : '',
    bookingState.professional ? `Profissional: ${bookingState.professional.name}` : '',
    bookingState.date ? `Data: ${formatDatePtBr(bookingState.date)}` : '',
    bookingState.time ? `Horário: ${bookingState.time}` : '',
    bookingState.lastSuggestedDate ? `Últimos slots validados para: ${formatDatePtBr(bookingState.lastSuggestedDate)}` : '',
    bookingState.lastSuggestedSlots.length > 0 ? `Slots validados: ${bookingState.lastSuggestedSlots.join(', ')}` : '',
    bookingState.customerType ? `Tipo do cliente: ${bookingState.customerType}` : '',
    bookingState.customerName ? `Cliente: ${bookingState.customerName}` : '',
    bookingState.customerAddress ? `Endereço: ${bookingState.customerAddress}` : '',
    bookingState.customerEmail ? `E-mail: ${bookingState.customerEmail}` : '',
    bookingState.paymentMethod ? `Pagamento: ${bookingState.paymentMethod}` : '',
    bookingState.awaitingPaymentMethod ? 'Aguardando forma de pagamento.' : '',
  ].filter(Boolean).join(' | ');

  const recentHistory = conversationHistory.slice(-8)
    .map(m => `${m.fromMe ? 'Você' : 'Cliente'}: ${m.text}`)
    .join('\n');

  const systemPrompt = `Voce e a atendente virtual do "${config.salon_name || 'Prestador de Servico'}". Converse naturalmente com o cliente pelo WhatsApp, como uma recepcionista simpatica e profissional.

${agentPrompt ? `INSTRUÇÕES DO DONO:\n${agentPrompt}\n` : ''}
SERVIÇOS DISPONÍVEIS:
${servicesInfo}

PROFISSIONAIS:
${profsInfo}

HORÁRIOS DE FUNCIONAMENTO:
${hoursInfo}

${config.address ? `ENDEREÇO: ${config.address}` : ''}
${config.phone ? `TELEFONE: ${config.phone}` : ''}

ESTADO DO AGENDAMENTO EM ANDAMENTO: ${stateInfo || 'Nenhum'}

${contextMessage ? `CONTEXTO IMPORTANTE: ${contextMessage}` : ''}
${secondaryAgendaGuidance ? `CALIBRACAO OPERACIONAL DA AGENDA:\n${secondaryAgendaGuidance}` : ""}

REGRAS:
- Converse naturalmente, SEM menus "digite 1, 2, 3"
- Se o cliente quer agendar, ajude coletando: serviço, profissional (se tiver), data e horário
- Não invente horários, serviços ou profissionais que não existem
- Se houver slots já validados no contexto, use somente esses horários ao responder
- IMPORTANTE: NUNCA sugira horários específicos (como "12:30", "14:10") a menos que uma lista de horários disponíveis seja fornecida no contexto. Sem lista, pergunte apenas a preferência do cliente.
- NUNCA use markdown, negrito, listas com asterisco ou emojis
- Seja breve (máximo 3-4 linhas por mensagem)
- Use o nome do cliente quando souber
- Se todos os dados estiverem coletados, faça um RESUMO e peça confirmação
- Não confirme agendamento por conta própria, SEMPRE pergunte "Posso confirmar?"`;

  const effectiveSystemPrompt = agentPrompt
    ? `Voce e a atendente virtual do "${config.salon_name || 'Prestador de Servico'}" no WhatsApp.

INSTRUCOES PRINCIPAIS DO DONO (SIGA COMO FONTE PRIORITARIA DE COMPORTAMENTO E ORDEM DA CONVERSA):
${agentPrompt}

SERVICOS DISPONIVEIS:
${servicesInfo}

PROFISSIONAIS:
${profsInfo}

HORARIOS DE FUNCIONAMENTO:
${hoursInfo}

${config.address ? `ENDERECO: ${config.address}` : ''}
${config.phone ? `TELEFONE: ${config.phone}` : ''}

ESTADO DO AGENDAMENTO EM ANDAMENTO: ${stateInfo || 'Nenhum'}

${contextMessage ? `CONTEXTO OPERACIONAL IMPORTANTE: ${contextMessage}` : ''}
${secondaryAgendaGuidance ? `CALIBRACAO OPERACIONAL DA AGENDA:\n${secondaryAgendaGuidance}` : ""}

REGRAS OPERACIONAIS:
- Siga primeiro as instrucoes do dono. Use o contexto operacional apenas para saber o que ja foi validado no sistema.
- Nao invente horarios, servicos, profissionais, pagamentos ou confirmacoes.
- So mencione horario especifico quando o contexto operacional trouxer horario ou lista real de horarios.
- Se o contexto disser que a agenda real foi consultada, use somente os horarios informados ali.
- Se o contexto trouxer uma janela viva de disponibilidade, somente os horarios listados nela podem ser considerados disponiveis.
- Se ja existir data, horario, servico, endereco ou pagamento validados no estado operacional, repita exatamente esses mesmos valores sem alterar nada.
- Nunca diga que o agendamento foi confirmado, criado ou cancelado sem o contexto operacional dizer explicitamente que isso ja aconteceu.
- Antes de falar que agendou, responda internamente apenas: o cliente escolheu um horario valido do contexto e confirmou explicitamente? Se nao, continue a conversa sem afirmar create.
- Se o contexto disser que o agendamento foi criado ou cancelado, apenas comunique isso ao cliente.
- Nao use markdown, negrito, listas com asterisco ou emojis.
- Seja breve, natural e humana.`
    : systemPrompt;
  const calibratedSystemPrompt = `Voce e a atendente virtual do "${config.salon_name || 'Prestador de Servico'}". Converse naturalmente com o cliente pelo WhatsApp, como uma recepcionista simpatica e profissional.

${agentPrompt ? `INSTRUCOES DO DONO:\n${agentPrompt}\n` : ''}
SERVICOS DISPONIVEIS:
${servicesInfo}

PROFISSIONAIS:
${profsInfo}

HORARIOS DE FUNCIONAMENTO:
${hoursInfo}

${config.address ? `ENDERECO: ${config.address}` : ''}
${config.phone ? `TELEFONE: ${config.phone}` : ''}

ESTADO DO AGENDAMENTO EM ANDAMENTO: ${stateInfo || 'Nenhum'}

${contextMessage ? `CONTEXTO OPERACIONAL IMPORTANTE: ${contextMessage}` : ''}
${secondaryAgendaGuidance ? `CALIBRACAO OPERACIONAL DA AGENDA:\n${secondaryAgendaGuidance}` : ""}

CALIBRACAO:
- O prompt do dono continua sendo a fonte principal de comportamento da conversa.
- Quando a conversa tocar agenda, trate o contexto operacional como memoria factual dos horarios reais.
- Se houver slots validados ou janela viva no contexto, use somente esses horarios ao responder.
- Tudo o que nao aparecer como disponivel no contexto operacional deve ser tratado como indisponivel ate nova consulta.
- Antes de dizer que agendou, responda internamente apenas: o cliente escolheu um horario valido do contexto e confirmou explicitamente? sim ou nao.
- So comunique agendamento salvo quando o contexto operacional disser explicitamente que o create real aconteceu.
- Nao use markdown, negrito, listas com asterisco ou emojis.
- Seja breve, natural e humana.`;
  void effectiveSystemPrompt;
  const finalSystemPrompt = calibratedSystemPrompt;

  try {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: finalSystemPrompt },
    ];

    // Add recent history as conversation context
    for (const h of conversationHistory.slice(-6)) {
      messages.push({
        role: h.fromMe ? 'assistant' : 'user',
        content: h.text,
      });
    }
    messages.push({ role: 'user', content: message });

    const result = await chatComplete({
      messages,
      maxTokens: 300,
      temperature: 0.7,
    });

    return sanitizeProviderAssistantText(result.choices?.[0]?.message?.content || 'Como posso ajudar você?');
  } catch (err) {
    console.error('❌ [Provider] Erro ao gerar resposta IA:', err);
    return buildProviderDeterministicFallbackResponse(
      message,
      providerData,
      bookingState,
      contextMessage,
      instructionPrompt,
    );
  }
}

function buildProviderDeterministicFallbackResponse(
  message: string,
  providerData: ProviderData,
  bookingState: BookingState,
  contextMessage: string,
  instructionPrompt?: string,
): string {
  const { config, services } = providerData;
  const flowRequirements = getProviderFlowRequirements(config, instructionPrompt);
  const contextualDate = bookingState.date ? formatProviderContextualDate(bookingState.date) : "";

  if (contextMessage.includes("cancelou o agendamento")) {
    return "Tudo certo. Nao vou confirmar esse agendamento. Se quiser remarcar, me diga o servico e o dia que voce prefere.";
  }

  if (contextMessage.includes("serviços e preços") || contextMessage.includes("servicos e preços") || contextMessage.includes("servicos e precos")) {
    const servicesSummary = services.slice(0, 8).map((service) => {
      const price = service.price ? `R$ ${service.price.toFixed(2).replace(".", ",")}` : "Consulte";
      return `${service.name}: ${price}`;
    }).join("\n");
    return servicesSummary || "No momento nao encontrei servicos cadastrados. Me diga qual atendimento voce precisa.";
  }

  if (contextMessage.includes("horários de funcionamento") || contextMessage.includes("horarios de funcionamento")) {
    const hours = formatProviderHours(config.opening_hours);
    return hours ? `Nosso horario de funcionamento e:\n${hours}` : "Posso confirmar os horarios de atendimento para voce. Qual dia voce quer verificar?";
  }

  if (bookingState.awaitingPaymentMethod && !bookingState.paymentMethod) {
    return buildPaymentMethodQuestion();
  }

  if (bookingState.awaitingFinalConfirmation) {
    return buildProviderFinalConfirmationQuestion(bookingState);
  }

  if (bookingState.awaitingAvailabilityConsent && bookingState.service && !bookingState.date) {
    return buildProviderPriceAndAvailabilityQuestion(bookingState);
  }

  if (!bookingState.customerName?.trim() && bookingState.service && bookingState.date && bookingState.time) {
    return buildProviderCustomerDataQuestion(flowRequirements, bookingState);
  }

  if (flowRequirements.requireCustomerType && !bookingState.customerType && bookingState.service && bookingState.date && bookingState.time) {
    return buildCustomerTypeQuestion();
  }

  if (flowRequirements.requireAddress && !bookingState.customerAddress?.trim() && bookingState.service && bookingState.date && bookingState.time) {
    return buildProviderCustomerDataQuestion(flowRequirements, bookingState);
  }

  if (flowRequirements.requireEmail && !bookingState.customerEmail?.trim() && bookingState.service && bookingState.date && bookingState.time) {
    return buildProviderCustomerDataQuestion(flowRequirements, bookingState);
  }

  if (bookingState.service && bookingState.date && bookingState.time) {
    return buildProviderBookingReviewQuestion(bookingState);
  }

  if (bookingState.service && bookingState.date && !bookingState.time) {
    return `Perfeito. Qual horario voce prefere para ${contextualDate} no servico ${bookingState.service.name}?`;
  }

  if (bookingState.service && !bookingState.date) {
    return buildProviderPriceAndAvailabilityQuestion(bookingState);
  }

  if (!bookingState.service && services.length > 0) {
    const topServices = services.slice(0, 6).map((service) => service.name).join(", ");
    return `Posso te ajudar com o agendamento. Qual servico voce precisa? Temos, por exemplo: ${topServices}.`;
  }

  if (matchesAnyTerm(normalizeSimpleReply(message), ["oi", "ola", "bom dia", "boa tarde", "boa noite"])) {
    return "Oi! Como posso te ajudar com seu atendimento hoje?";
  }

  return "Consigo te ajudar com agendamentos, servicos, horarios e valores. Me diga qual atendimento voce precisa.";
}

// ═══════════════════════════════════════════════════════════════════════
// GERAR RESPOSTA PRINCIPAL DO SALÃO
// ═══════════════════════════════════════════════════════════════════════

export async function generateProviderResponse(
  userId: string,
  conversationId: string,
  customerPhone: string,
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): Promise<{ text: string; shouldSave?: boolean } | null> {
  try {
    const providerData = await getProviderData(userId);
    if (!providerData || !providerData.config.is_active) return null;

    const { config, services, professionals } = providerData;
    const instructionPromptState = await getProviderInstructionPrompt(userId, config);
    const instructionPrompt = instructionPromptState.prompt;
    const promptDrivenMode = instructionPromptState.source === "agent" && Boolean(instructionPrompt.trim());
    const history = conversationHistory || [];
    const state = getBookingState(userId, customerPhone, conversationId);
    const previousServiceId = state.service?.id || null;
    const previousProfessionalId = state.professional?.id || null;
    const previousDate = state.date;

    console.log(`💇 [Provider v2] msg="${message.substring(0, 80)}" phone=${customerPhone}`);
    console.log(`💇 [Provider v2] state: svc=${state.service?.name || '-'} prof=${state.professional?.name || '-'} date=${state.date || '-'} time=${state.time || '-'} confirm=${state.awaitingConfirmation} consent=${state.awaitingAvailabilityConsent} prompt=${instructionPromptState.source}`);

    // 0. VERIFICAR HORÁRIO DE ALMOÇO — bloquear se estiver no intervalo
    const breakStatus = isCurrentlyInBreak(config.opening_hours);
    if (breakStatus.isDuringBreak) {
      console.log(`💇 [Provider v2] ⏸️ HORÁRIO DE ALMOÇO (${breakStatus.breakStart}–${breakStatus.breakEnd}) — bloqueando resposta`);
      return {
        text: breakStatus.message,
      };
    }

    // 1. EXTRAIR CAMPOS VIA IA
    const extracted = await extractProviderFieldsLLM(message, history, providerData, state);
    const heuristicExtracted = extractProviderFieldsHeuristically(message, providerData, state);

    if (extracted.intent === 'general' && heuristicExtracted.intent !== 'general') {
      extracted.intent = heuristicExtracted.intent;
    }

    if (!extracted.service && heuristicExtracted.service) {
      extracted.service = heuristicExtracted.service;
    }

    if (!extracted.professional && heuristicExtracted.professional) {
      extracted.professional = heuristicExtracted.professional;
    }

    if (!extracted.customerType && heuristicExtracted.customerType) {
      extracted.customerType = heuristicExtracted.customerType;
    }

    if (!extracted.customerName && heuristicExtracted.customerName) {
      extracted.customerName = heuristicExtracted.customerName;
    }

    if (!extracted.customerAddress && heuristicExtracted.customerAddress) {
      extracted.customerAddress = heuristicExtracted.customerAddress;
    }

    if (!extracted.customerEmail && heuristicExtracted.customerEmail) {
      extracted.customerEmail = heuristicExtracted.customerEmail;
    }

    if (!extracted.paymentMethod && heuristicExtracted.paymentMethod) {
      extracted.paymentMethod = heuristicExtracted.paymentMethod;
    }

    if (!extracted.date && heuristicExtracted.date) {
      extracted.date = heuristicExtracted.date;
    }

    if (!extracted.time && heuristicExtracted.time) {
      extracted.time = heuristicExtracted.time;
    }

    if (extracted.date && !heuristicExtracted.date && !state.date && !state.lastSuggestedDate) {
      extracted.date = undefined;
    }

    const explicitAffirmative = isExplicitAffirmative(message);
    const shouldInferContextualService =
      services.length === 0
      && !state.service
      && !extracted.service
      && (
        Boolean(heuristicExtracted.date || heuristicExtracted.time)
        || state.awaitingConfirmation
        || state.awaitingFinalConfirmation
        || state.awaitingPaymentMethod
        || (explicitAffirmative && Boolean(state.date && state.time))
      );

    if (shouldInferContextualService) {
      const contextualServiceName = await inferContextualProviderServiceNameLLM(
        message,
        history,
        providerData,
        state,
        instructionPrompt,
      );

      if (contextualServiceName) {
        extracted.service = contextualServiceName;
        console.log(`[Provider v2] Servico contextual inferido via LLM: ${contextualServiceName}`);
      }
    }

    let acceptedSuggestedSlot = false;

    if (extracted.time && !heuristicExtracted.time && !state.time && state.lastSuggestedSlots.length === 0) {
      extracted.time = undefined;
    }

    const selectedSuggestedSlot = !extracted.time
      ? detectSuggestedSlotSelection(message, state.lastSuggestedSlots)
      : null;

    if (selectedSuggestedSlot) {
      extracted.time = selectedSuggestedSlot;
      if (!extracted.date && state.lastSuggestedDate) {
        extracted.date = state.lastSuggestedDate;
      }
      acceptedSuggestedSlot = true;
    }

    if (
      !selectedSuggestedSlot
      && explicitAffirmative
      && !state.time
      && state.lastSuggestedDate
      && state.lastSuggestedSlots.length === 1
    ) {
      extracted.time = state.lastSuggestedSlots[0];
      extracted.date = extracted.date || state.lastSuggestedDate;
      acceptedSuggestedSlot = true;
    }

    console.log(`💇 [Provider v2] extracted:`, JSON.stringify(extracted));

    // 2. ATUALIZAR ESTADO COM CAMPOS EXTRAÍDOS
    const compositeCustomerBundle = extractProviderCustomerBundleFromMessage(message);
    const messageLooksLikeCustomerDataBundle =
      Boolean(compositeCustomerBundle.customerAddress)
      || Boolean(compositeCustomerBundle.customerEmail)
      || (
        Boolean(compositeCustomerBundle.customerName)
        && (String(message || "").includes("\n") || String(message || "").includes(","))
      );
    const messageLooksOperationalForAgenda =
      extracted.intent === "check_availability"
      || heuristicExtracted.intent === "check_availability"
      || Boolean(extracted.date || extracted.time || heuristicExtracted.date || heuristicExtracted.time)
      || (
        messageLooksLikeShortExplicitAffirmative(message)
        && (
          state.lastSuggestedSlots.length > 0
          || state.awaitingAvailabilityConsent
          || state.awaitingConfirmation
          || state.awaitingFinalConfirmation
          || state.awaitingPaymentMethod
        )
      );
    const allowCustomerIdentityUpdateFromMessage =
      messageLooksLikeCustomerDataBundle || !messageLooksOperationalForAgenda;
    const shouldFreezeBookedContextFromMessage =
      state.service
      && state.date
      && state.time
      && !selectedSuggestedSlot
      && (
        messageLooksLikeCustomerDataBundle
        || state.awaitingConfirmation
        || state.awaitingFinalConfirmation
        || state.awaitingPaymentMethod
      )
      && !messageLooksOperationalForAgenda;

    if (shouldFreezeBookedContextFromMessage) {
      extracted.service = undefined;
      extracted.professional = undefined;
      extracted.date = undefined;
      extracted.time = undefined;
    }

    const shouldReplaceCustomerName = !state.customerName || isProviderCustomerTypeLabel(state.customerName);

    if (
      allowCustomerIdentityUpdateFromMessage
      && shouldReplaceCustomerName
      && shouldAcceptCustomerNameCandidate(extracted.customerName)
    ) {
      state.customerName = extracted.customerName;
    }

    if (!state.customerType) {
      const inferredCustomerType = extracted.customerType || inferProviderCustomerType(message);
      if (inferredCustomerType) {
        state.customerType = inferredCustomerType;
      }
    }

    if (
      allowCustomerIdentityUpdateFromMessage
      && !state.customerAddress
      && shouldAcceptCustomerAddressCandidate(extracted.customerAddress)
    ) {
      state.customerAddress = extracted.customerAddress;
    }

    if (extracted.customerEmail && !state.customerEmail) {
      state.customerEmail = extracted.customerEmail;
    }

    if (!state.paymentMethod) {
      const inferredPaymentMethod = extracted.paymentMethod || inferProviderPaymentMethod(message);
      if (inferredPaymentMethod) {
        state.paymentMethod = inferredPaymentMethod;
      }
    }

    if (
      messageLooksLikeCustomerDataBundle
      && shouldReplaceCustomerName
      && shouldAcceptCustomerNameCandidate(compositeCustomerBundle.customerName)
    ) {
      state.customerName = compositeCustomerBundle.customerName || null;
    }

    if (
      messageLooksLikeCustomerDataBundle
      && !state.customerAddress
      && shouldAcceptCustomerAddressCandidate(compositeCustomerBundle.customerAddress)
    ) {
      state.customerAddress = compositeCustomerBundle.customerAddress || null;
    }

    if (!state.customerEmail && compositeCustomerBundle.customerEmail) {
      state.customerEmail = compositeCustomerBundle.customerEmail;
    }

    if (
      allowCustomerIdentityUpdateFromMessage
      && shouldReplaceCustomerName
      && shouldAcceptCustomerNameCandidate(message)
    ) {
      state.customerName = String(message || "").trim();
    }

    if (
      allowCustomerIdentityUpdateFromMessage
      && !state.customerAddress
      && shouldAcceptCustomerAddressCandidate(message)
    ) {
      state.customerAddress = String(message || "").trim();
    }

    if (allowCustomerIdentityUpdateFromMessage && !state.customerEmail && isLikelyEmail(message)) {
      state.customerEmail = String(message || "").trim();
    }

    if (extracted.service) {
      const serviceCandidates = normalizeExtractedProviderServiceNames(extracted.service);
      const matchedServices = serviceCandidates
        .map((candidate) => matchService(candidate, services))
        .filter((service): service is ProviderService => Boolean(service));
      const fallbackServiceLabel = serviceCandidates.join(" + ");

      console.log(
        `[Provider v2][ServiceResolution] ${JSON.stringify({
          rawExtractedService: extracted.service,
          serviceCandidates,
          matchedServices: matchedServices.map((service) => ({
            id: service.id,
            name: service.name,
            durationMinutes: service.duration_minutes,
          })),
        })}`,
      );

      const resolvedService = buildCompositeProviderService(
        matchedServices,
        services.length === 0 ? fallbackServiceLabel : null,
        config.slot_duration || 30,
      );

      if (resolvedService) {
        state.service = resolvedService;
        console.log(`💇 [Provider v2] Serviço resolvido para agenda: ${resolvedService.name} (${resolvedService.duration_minutes}min)`);
      }
    }

    if (extracted.professional) {
      const matched = matchProfessional(extracted.professional, professionals);
      if (matched) {
        state.professional = matched;
        console.log(`💇 [Provider v2] Profissional matched: ${matched.name}`);
      }
    }

    if (extracted.date) {
      const normalizedDate = normalizeProviderDateValue(extracted.date);
      if (normalizedDate) {
        state.date = normalizedDate;
        console.log(`💇 [Provider v2] Data: ${normalizedDate}`);
      }
    }

    if (extracted.time) {
      const normalizedTime = normalizeProviderTimeValue(extracted.time);
      if (normalizedTime) {
        state.time = normalizedTime;
        console.log(`💇 [Provider v2] Hora: ${normalizedTime}`);
      }
    }

    if (state.date || state.time) {
      state.awaitingAvailabilityConsent = false;
    }

    if (
      previousServiceId !== (state.service?.id || null)
      || previousProfessionalId !== (state.professional?.id || null)
      || previousDate !== state.date
    ) {
      clearSuggestedSlots(state);
    }

    state.lastUpdated = new Date();

    const flowRequirements = getProviderFlowRequirements(config, instructionPrompt);

    if (promptDrivenMode) {
      state.agendaWindowContext = await buildProviderAgendaWindowPromptContext({
        userId,
        providerData,
        bookingState: state,
      });
    } else {
      state.agendaWindowContext = null;
    }

    // 3. HANDLE CANCEL
    if (extracted.intent === 'cancel') {
      const cancellationResult = await cancelUpcomingProviderAppointmentForCustomer(userId, customerPhone, config);
      if (cancellationResult.handled) {
        resetBookingState(userId, customerPhone, conversationId);
        return { text: cancellationResult.text };
      }

      resetBookingState(userId, customerPhone, conversationId);
      return { text: await generateAIResponse(message, history, providerData, state, 'O cliente cancelou o agendamento. Confirme o cancelamento de forma amigavel.', instructionPrompt) };
    }

    if (promptDrivenMode) {
      const hasActiveConfirmationStep =
        state.awaitingConfirmation
        || state.awaitingPaymentMethod
        || state.awaitingFinalConfirmation;
      const acceptedValidatedSlotConfirmation =
        !hasActiveConfirmationStep
        && state.service !== null
        && state.date !== null
        && state.time !== null
        && (
          acceptedSuggestedSlot
          || (
            explicitAffirmative
            && state.lastSuggestedDate === state.date
            && state.lastSuggestedSlots.includes(state.time)
          )
        );
      const acceptedOperationalSlot = acceptedValidatedSlotConfirmation;
      const shouldFinalizeConfirmation =
        !acceptedOperationalSlot
        && (
          explicitAffirmative && (
            state.awaitingConfirmation
            || state.awaitingFinalConfirmation
            || (state.awaitingPaymentMethod && !!state.paymentMethod && !flowRequirements.requireFinalConfirmationAfterPayment)
          )
        );
      const relativeAvailabilityPreference = detectRelativeSlotPreference(message);
      const explicitAvailabilityOverride =
        heuristicExtracted.intent === 'check_availability'
        || Boolean(heuristicExtracted.date)
        || Boolean(heuristicExtracted.time)
        || Boolean(relativeAvailabilityPreference)
        || Boolean(selectedSuggestedSlot && !acceptedOperationalSlot)
        || (!explicitAffirmative && Boolean(extracted.date || extracted.time));
      const currentMessageRequestsAvailability =
        extracted.intent === 'check_availability'
        || heuristicExtracted.intent === 'check_availability'
        || Boolean(heuristicExtracted.date)
        || Boolean(heuristicExtracted.time)
        || Boolean(relativeAvailabilityPreference)
        || Boolean(selectedSuggestedSlot && !acceptedOperationalSlot)
        || (!explicitAffirmative && Boolean(extracted.date || extracted.time));
      const isAvailabilityQuery =
        (
          currentMessageRequestsAvailability
          && (!hasActiveConfirmationStep || explicitAvailabilityOverride)
        )
        || (
          !hasActiveConfirmationStep
          && Boolean(state.date)
          && !state.time
          && (explicitAffirmative || extracted.intent === 'booking')
        );

      if (state.awaitingAvailabilityConsent && explicitAffirmative && state.service) {
        const firstAvailableSlot = await findFirstAvailableProviderSlot(
          userId,
          state.service.duration_minutes,
          state.professional?.id,
          config.max_advance_days || 30,
        );

        state.awaitingAvailabilityConsent = false;

        if (firstAvailableSlot) {
          state.date = firstAvailableSlot.date;
          state.time = firstAvailableSlot.time;
          rememberSuggestedSlots(state, firstAvailableSlot.date, [firstAvailableSlot.time]);
          const agendaMirrorContext = await buildProviderAgendaMirrorContext({
            userId,
            date: firstAvailableSlot.date,
            professionalId: state.professional?.id,
            serviceDuration: state.service?.duration_minutes,
            availableSlots: [firstAvailableSlot.time],
          });
          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            `A agenda real acabou de ser consultada com os bloqueios atuais do sistema e do Google/Maton. O primeiro horario realmente livre para ${state.service.name} e ${formatProviderContextualDate(firstAvailableSlot.date)}, as ${firstAvailableSlot.time}. Pergunte ao cliente se esse horario funciona, seguindo o prompt do dono.\n${agendaMirrorContext}`,
            instructionPrompt,
              {
                fallbackText: [
                  `Tenho horario livre para ${formatProviderContextualDate(firstAvailableSlot.date)}, as ${firstAvailableSlot.time}.`,
                  "Se esse horario funcionar para voce, eu sigo com o agendamento.",
                ].join("\n"),
                forbidBookingClaims: true,
                forbidConfirmationReview: true,
                requiredDateTokens: buildProviderDateValidationTokens(firstAvailableSlot.date),
                requiredTimeTokens: [firstAvailableSlot.time],
              },
            );
        }

        rememberSuggestedSlots(state, state.date!, [state.time!]);
        return generateProviderPromptDrivenReply(
          message,
          history,
          providerData,
          state,
          `A agenda real foi consultada agora e nao ha horario livre para ${state.service.name}. Peca outra data ou preferencia ao cliente, seguindo o prompt do dono.\n${agendaMirrorContext}`,
          instructionPrompt,
        );
      }

      if (acceptedOperationalSlot) {
        console.log(
          `[Provider v2][AcceptedOperationalSlot] ${JSON.stringify({
            userId,
            conversationId,
            date: state.date,
            time: state.time,
            lastSuggestedDate: state.lastSuggestedDate,
            lastSuggestedSlots: state.lastSuggestedSlots,
            explicitAffirmative,
            acceptedSuggestedSlot,
          })}`,
        );
        const slotValidation = await validateSlot(
          userId,
          state.date!,
          state.time!,
          state.professional?.id,
          state.service!.duration_minutes,
        );

        if (!slotValidation.valid) {
          state.time = null;
          clearSuggestedSlots(state);

          if (slotValidation.availableSlots.length > 0) {
            const nextSlot = slotValidation.availableSlots[0];
            state.time = nextSlot;
            rememberSuggestedSlots(state, state.date!, [nextSlot]);
            return generateProviderPromptDrivenReply(
              message,
              history,
              providerData,
              state,
              `O horario aceito pelo cliente acabou de ser revalidado na agenda real e nao esta mais livre. O proximo horario realmente disponivel para ${formatProviderContextualDate(state.date!)} e ${nextSlot}. Ofereca somente esse horario e aguarde a confirmacao do cliente, seguindo o prompt do dono.`,
              instructionPrompt,
              {
                fallbackText: [
                  `O horario anterior nao esta mais livre para ${formatProviderContextualDate(state.date!)}.`,
                  `Tenho ${nextSlot} disponivel nesse dia. Se funcionar para voce, me confirme para eu seguir com o agendamento.`,
                ].join("\n"),
                forbidBookingClaims: true,
                forbidConfirmationReview: true,
                requiredDateTokens: buildProviderDateValidationTokens(state.date),
                requiredTimeTokens: [nextSlot],
              },
            );
          }

          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            `O horario aceito pelo cliente nao esta mais livre na agenda real. Peca outra data ou outra preferencia, seguindo o prompt do dono.`,
            instructionPrompt,
          );
        }

        rememberSuggestedSlots(state, state.date!, [state.time!]);
        return generateProviderPromptDrivenReply(
          message,
          history,
          providerData,
          state,
          `O cliente acabou de aceitar o horario ${state.time} em ${formatProviderContextualDate(state.date!)}. Trate isso como aceite operacional do slot ja validado neste turno. Nao reabra a agenda para esse mesmo horario e ainda nao diga que o agendamento foi criado. Continue a conversa a partir do estado atual, seguindo o proximo passo natural do prompt do dono.`,
          instructionPrompt,
          {
            fallbackText: buildProviderPostSlotAcceptanceFallback(state, flowRequirements),
            forbidBookingClaims: true,
            forbidConfirmationReview: true,
            requiredDateTokens: buildProviderDateValidationTokens(state.date),
            requiredTimeTokens: state.time ? [state.time] : [],
          },
        );
      }

      if (state.awaitingConfirmation && flowRequirements.requirePaymentMethod && state.paymentMethod) {
        state.awaitingConfirmation = false;
        state.awaitingPaymentMethod = false;
        state.awaitingFinalConfirmation = true;
        state.lastUpdated = new Date();
        return {
          text: buildProviderPromptDrivenFinalConfirmationMessage(providerData, state, instructionPrompt),
        };
      }

      if (state.awaitingFinalConfirmation && !explicitAffirmative) {
        return generateProviderPromptDrivenReply(
          message,
          history,
          providerData,
          state,
          `Ainda nao houve o sim final do cliente para salvar o agendamento real de ${formatProviderContextualDate(state.date || "")}, as ${state.time || ""}. Se a mensagem atual so complementou pagamento, dados ou alguma duvida curta, mantenha a conversa em confirmacao final e nao diga que o create aconteceu.`,
          instructionPrompt,
          {
            fallbackText: buildProviderPromptDrivenFinalConfirmationMessage(providerData, state, instructionPrompt),
            forbidBookingClaims: true,
            requiredDateTokens: buildProviderDateValidationTokens(state.date),
            requiredTimeTokens: state.time ? [state.time] : [],
          },
        );
      }

      if (state.awaitingPaymentMethod && state.paymentMethod) {
        state.awaitingPaymentMethod = false;
        state.awaitingConfirmation = false;
        state.awaitingFinalConfirmation = true;
        state.lastUpdated = new Date();
        return {
          text: buildProviderPromptDrivenFinalConfirmationMessage(providerData, state, instructionPrompt),
        };
      }

      if (shouldFinalizeConfirmation) {
        console.log(
          `[Provider v2][FinalizeConfirmation] ${JSON.stringify({
            userId,
            conversationId,
            awaitingConfirmation: state.awaitingConfirmation,
            awaitingPaymentMethod: state.awaitingPaymentMethod,
            awaitingFinalConfirmation: state.awaitingFinalConfirmation,
            hasPaymentMethod: Boolean(state.paymentMethod),
            date: state.date,
            time: state.time,
            serviceId: state.service?.id || null,
          })}`,
        );
        const missingData = [
          !state.service ? 'servico' : null,
          !state.date ? 'data' : null,
          !state.time ? 'horario' : null,
        ].filter((value): value is string => Boolean(value));

        if (missingData.length > 0) {
          state.awaitingConfirmation = false;
          state.awaitingFinalConfirmation = false;
          state.awaitingPaymentMethod = false;
          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            `O cliente tentou confirmar, mas ainda faltam estes dados para criar o agendamento real: ${missingData.join(', ')}. Peca somente o que falta, seguindo o prompt do dono.`,
            instructionPrompt,
          );
        }

        const bookingSnapshot = buildProviderAppointmentConversationSnapshot(
          state,
          customerPhone,
          conversationId,
          history,
        );
        const clientNotes = buildProviderClientNotes(state, bookingSnapshot);

        console.log(
          `[Provider v2][FinalizeConfirmation][Payload] ${JSON.stringify({
            userId,
            conversationId,
            clientName: state.customerName || 'Cliente',
            clientPhone: customerPhone,
            serviceName: state.service?.name || null,
            professionalName: state.professional?.name || null,
            appointmentDate: state.date,
            startTime: state.time,
            recentConversationPreview: bookingSnapshot.recentConversation.slice(-3),
            clientNotesPreview: String(clientNotes || '').slice(0, 240),
          })}`,
        );

        const result = await createProviderAppointment(userId, conversationId, {
          clientName: state.customerName || 'Cliente',
          clientPhone: customerPhone,
          serviceId: state.service!.id,
          serviceName: state.service!.name,
          professionalId: state.professional?.id,
          professionalName: state.professional?.name,
          appointmentDate: state.date!,
          startTime: state.time!,
          durationMinutes: state.service!.duration_minutes || 30,
        }, {
          clientNotes,
          bookingSnapshot,
        });

        if (result.success) {
          const confirmationState: BookingState = {
            ...state,
            awaitingConfirmation: false,
            awaitingPaymentMethod: false,
            awaitingFinalConfirmation: false,
            customerPhone,
            createdAt: new Date(),
            lastUpdated: new Date(),
          };
          clearSuggestedSlots(confirmationState);
          resetBookingState(userId, customerPhone, conversationId);

          return {
            text: buildAppointmentCreatedMessage(providerData, confirmationState, instructionPrompt),
            shouldSave: true,
          };
        }

        if (result.suggestedSlots && result.suggestedSlots.length > 0) {
          state.awaitingConfirmation = false;
          state.awaitingFinalConfirmation = false;
          state.awaitingPaymentMethod = false;
          const nextSlot = result.suggestedSlots[0];
          state.time = nextSlot;
          rememberSuggestedSlots(state, state.date!, [nextSlot]);
          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            `O sistema nao conseguiu salvar no horario pedido, mas revalidou a agenda real e encontrou ${nextSlot} como proximo horario livre em ${formatProviderContextualDate(state.date!)}. Ofereca somente esse horario ao cliente.`,
            instructionPrompt,
            {
              fallbackText: [
                `Nao consegui salvar no horario anterior para ${formatProviderContextualDate(state.date!)}.`,
                `Tenho ${nextSlot} disponivel nesse dia. Se funcionar para voce, eu sigo com o agendamento.`,
              ].join("\n"),
              forbidBookingClaims: true,
              forbidConfirmationReview: true,
              requiredDateTokens: buildProviderDateValidationTokens(state.date),
              requiredTimeTokens: [nextSlot],
            },
          );
        }

        return { text: buildAppointmentFailureMessage(result.error) };
      }

      if (isAvailabilityQuery) {
        const requestedDate = relativeAvailabilityPreference
          ? (heuristicExtracted.date || state.lastSuggestedDate || state.date || extracted.date)
          : (heuristicExtracted.date || extracted.date || state.lastSuggestedDate || state.date);
        const requestedTime = heuristicExtracted.time || extracted.time || null;
        const targetDate = normalizeProviderDateValue(requestedDate) || null;

        if (!targetDate) {
          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            'O cliente quer consultar agenda, mas ainda nao informou uma data valida. Peca a data ou preferencia antes de consultar novamente.',
            instructionPrompt,
          );
        }

        state.date = targetDate;
        const slotDuration = state.service?.duration_minutes || config.slot_duration || 30;
        const normalizedRequestedTime = requestedTime
          ? normalizeProviderTimeValue(requestedTime)
          : null;
        const agendaMirrorContext = await buildProviderAgendaMirrorContext({
          userId,
          date: targetDate,
          professionalId: state.professional?.id,
          serviceDuration: slotDuration,
        });

        if (relativeAvailabilityPreference) {
          const referenceTime = resolveRelativeSlotReferenceTime(state, targetDate, normalizedRequestedTime);
          const relativeCopy = buildRelativeSlotCopy(relativeAvailabilityPreference);

          if (!referenceTime) {
            return generateProviderPromptDrivenReply(
              message,
              history,
              providerData,
              state,
              `O cliente pediu um horario ${relativeCopy.promptLabel}, mas ainda nao existe um horario de referencia validado para ${formatProviderContextualDate(targetDate)}. Peca uma data ou um horario especifico antes de consultar novamente.`,
              instructionPrompt,
            );
          }

          const slots = await getAvailableSlots(userId, targetDate, state.professional?.id, slotDuration);
          const filteredSlots = filterSlotsByRelativePreference(slots, referenceTime, relativeAvailabilityPreference);

          console.log(
            `[Provider v2][RelativeAvailability] ${JSON.stringify({
              messagePreview: String(message || "").slice(0, 120),
              targetDate,
              slotDuration,
              referenceTime,
              preference: relativeAvailabilityPreference,
              sourceSlots: slots,
              filteredSlots,
            })}`,
          );

          if (filteredSlots.length === 0) {
            return generateProviderPromptDrivenReply(
              message,
              history,
              providerData,
              state,
              `A agenda real foi reconsultada agora para ${formatProviderContextualDate(targetDate)}. Nao existe horario ${relativeCopy.emptyLabel} do que ${referenceTime} nessa mesma data. Nao invente outro dia. Oriente o cliente a escolher outro periodo ou outra data, seguindo o prompt do dono.\n${agendaMirrorContext}`,
              instructionPrompt,
            );
          }

          if (shouldOfferSingleRealSlot(config)) {
            const nextSlot = filteredSlots[0];
            state.time = nextSlot;
            rememberSuggestedSlots(state, targetDate, [nextSlot]);
            return generateProviderPromptDrivenReply(
              message,
              history,
              providerData,
              state,
              `O cliente pediu um horario ${relativeCopy.promptLabel} em relacao a ${referenceTime} para ${formatProviderContextualDate(targetDate)}. A agenda real foi reconsultada agora e ${nextSlot} e o proximo horario realmente disponivel nessa mesma data. Ofereca somente esse horario ao cliente, seguindo o prompt do dono.\n${agendaMirrorContext}`,
              instructionPrompt,
              {
                fallbackText: [
                  `${relativeCopy.fallbackLead}, tenho ${nextSlot} disponivel para ${formatProviderContextualDate(targetDate)}.`,
                  "Se esse horario funcionar para voce, me confirme para eu seguir com o agendamento.",
                ].join("\n"),
                forbidBookingClaims: true,
                forbidConfirmationReview: true,
                forbidExclusivityClaims: filteredSlots.length > 1,
                requiredDateTokens: buildProviderDateValidationTokens(targetDate),
                requiredTimeTokens: [nextSlot],
              },
            );
          }

          const displayRelativeSlots = buildSlotDisplay(filteredSlots);
          state.time = null;
          rememberSuggestedSlots(state, targetDate, displayRelativeSlots);
          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            `O cliente pediu um horario ${relativeCopy.promptLabel} em relacao a ${referenceTime} para ${formatProviderContextualDate(targetDate)}. A agenda real foi reconsultada agora. Os horarios realmente disponiveis para essa preferencia sao: ${displayRelativeSlots.join(', ')}. Use apenas esses horarios na resposta, seguindo o prompt do dono.\n${agendaMirrorContext}`,
            instructionPrompt,
          );
        }

        if (normalizedRequestedTime) {
          const { valid, availableSlots } = await validateSlot(
            userId,
            targetDate,
            normalizedRequestedTime,
            state.professional?.id,
            slotDuration,
          );

          console.log(
            `[Provider v2][SlotValidation] ${JSON.stringify({
              messagePreview: String(message || "").slice(0, 120),
              targetDate,
              requestedTime: normalizedRequestedTime,
              slotDuration,
              valid,
              availableSlots,
            })}`,
          );

          if (valid) {
            state.time = normalizedRequestedTime;
            rememberSuggestedSlots(state, targetDate, [normalizedRequestedTime]);
            return generateProviderPromptDrivenReply(
              message,
              history,
              providerData,
              state,
              `A agenda real foi consultada agora para ${formatProviderContextualDate(targetDate)} e o horario ${normalizedRequestedTime} esta livre. Confirme esse horario com o cliente, seguindo o prompt do dono.\n${agendaMirrorContext}`,
              instructionPrompt,
              {
                fallbackText: [
                  `Tenho disponibilidade para ${formatProviderContextualDate(targetDate)}, as ${normalizedRequestedTime}.`,
                  "Se esse horario funcionar para voce, me confirme para eu seguir com o agendamento.",
                ].join("\n"),
                forbidBookingClaims: true,
                forbidConfirmationReview: true,
                requiredDateTokens: buildProviderDateValidationTokens(targetDate),
                requiredTimeTokens: [normalizedRequestedTime],
              },
            );
          }

          if (availableSlots.length === 0) {
            clearSuggestedSlots(state);
            state.time = null;
            return generateProviderPromptDrivenReply(
              message,
              history,
              providerData,
              state,
              `A agenda real foi consultada agora para ${formatProviderContextualDate(targetDate)} e o horario ${normalizedRequestedTime} nao esta livre. Tambem nao ha outros horarios disponiveis nesta data. Peca outra data ou preferencia, seguindo o prompt do dono.\n${agendaMirrorContext}`,
              instructionPrompt,
            );
          }

          if (shouldOfferSingleRealSlot(config)) {
            const nextSlot = findNearestAvailableSlot(availableSlots, normalizedRequestedTime);
            if (!nextSlot) {
              clearSuggestedSlots(state);
              state.time = null;
              return generateProviderPromptDrivenReply(
                message,
                history,
                providerData,
                state,
                `A agenda real foi consultada agora para ${formatProviderContextualDate(targetDate)} e o horario ${normalizedRequestedTime} nao esta livre. Peca outra data ou preferencia, seguindo o prompt do dono.\n${agendaMirrorContext}`,
                instructionPrompt,
              );
            }
            state.time = nextSlot;
            rememberSuggestedSlots(state, targetDate, [nextSlot]);
            return generateProviderPromptDrivenReply(
              message,
              history,
              providerData,
              state,
              `A agenda real foi consultada agora para ${formatProviderContextualDate(targetDate)}. O horario ${normalizedRequestedTime} nao esta livre, mas ${nextSlot} e a alternativa real mais proxima nesta mesma data. Ofereca somente esse horario ao cliente, seguindo o prompt do dono.\n${agendaMirrorContext}`,
              instructionPrompt,
              {
                fallbackText: [
                  `O horario ${normalizedRequestedTime} nao esta livre para ${formatProviderContextualDate(targetDate)}.`,
                  `A alternativa mais proxima que tenho nesse dia e ${nextSlot}. Se funcionar para voce, me confirme para eu seguir com o agendamento.`,
                ].join("\n"),
                forbidBookingClaims: true,
                forbidConfirmationReview: true,
                forbidExclusivityClaims: availableSlots.length > 1,
                requiredDateTokens: buildProviderDateValidationTokens(targetDate),
                requiredTimeTokens: [nextSlot],
              },
            );
          }

          const displayAvailableSlots = buildSlotDisplay(availableSlots);
          state.time = null;
          rememberSuggestedSlots(state, targetDate, displayAvailableSlots);
          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            `A agenda real foi consultada agora para ${formatProviderContextualDate(targetDate)}. O horario ${normalizedRequestedTime} nao esta livre. Os horarios realmente disponiveis sao: ${displayAvailableSlots.join(', ')}. Use apenas esses horarios na resposta, seguindo o prompt do dono.\n${agendaMirrorContext}`,
            instructionPrompt,
          );
        }

        const slots = await getAvailableSlots(userId, targetDate, state.professional?.id, slotDuration);

        console.log(
          `[Provider v2][DateAvailability] ${JSON.stringify({
            messagePreview: String(message || "").slice(0, 120),
            targetDate,
            slotDuration,
            slots,
          })}`,
        );

        if (slots.length === 0) {
          clearSuggestedSlots(state);
          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            `A agenda real foi consultada agora para ${formatProviderContextualDate(targetDate)} e nao ha horarios livres. Peca outra data ou outra preferencia, seguindo o prompt do dono.\n${agendaMirrorContext}`,
            instructionPrompt,
          );
        }

        if (shouldOfferSingleRealSlot(config)) {
          const firstSlot = slots[0];
          state.time = firstSlot;
          rememberSuggestedSlots(state, targetDate, [firstSlot]);
          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            `A agenda real foi consultada agora para ${formatProviderContextualDate(targetDate)}. O primeiro horario realmente livre e ${firstSlot}. Use apenas esse horario na resposta e pergunte se ele funciona para o cliente, seguindo o prompt do dono.\n${agendaMirrorContext}`,
            instructionPrompt,
            {
              fallbackText: [
                `O primeiro horario livre para ${formatProviderContextualDate(targetDate)} e ${firstSlot}.`,
                "Se esse horario funcionar para voce, me confirme que eu sigo com o agendamento.",
              ].join("\n"),
              forbidBookingClaims: true,
              forbidConfirmationReview: true,
              forbidExclusivityClaims: slots.length > 1,
              requiredDateTokens: buildProviderDateValidationTokens(targetDate),
              requiredTimeTokens: [firstSlot],
            },
          );
        }

        const displaySlots = buildSlotDisplay(slots);
        rememberSuggestedSlots(state, targetDate, displaySlots);
        return generateProviderPromptDrivenReply(
          message,
          history,
          providerData,
          state,
          `A agenda real foi consultada agora para ${formatProviderContextualDate(targetDate)}. Os horarios realmente livres sao: ${displaySlots.join(', ')}. Use apenas esses horarios na resposta, seguindo o prompt do dono.\n${agendaMirrorContext}`,
          instructionPrompt,
        );
      }

      if (state.service && state.date && state.time) {
        if (!state.awaitingConfirmation && !state.awaitingPaymentMethod && !state.awaitingFinalConfirmation) {
          return generateProviderPromptDrivenReply(
            message,
            history,
            providerData,
            state,
            'Ja existem dados suficientes para revisar o agendamento, mas ele ainda nao foi criado. Continue seguindo o prompt do dono com naturalidade, mas mantenha a conversa em estagio pre-create: revise, complete o que faltar, cobre pagamento se o prompt do dono pedir e so leve para confirmacao final antes de salvar.',
            instructionPrompt,
            {
              fallbackText: buildProviderPostSlotAcceptanceFallback(state, flowRequirements),
              forbidBookingClaims: true,
              requiredDateTokens: buildProviderDateValidationTokens(state.date),
              requiredTimeTokens: state.time ? [state.time] : [],
            },
          );
        }
      }

      if (extracted.intent === 'info_services' || extracted.intent === 'info_prices') {
        const svcInfo = services.map(s => {
          const p = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'Consulte';
          return `${s.name}: ${p} (${s.duration_minutes}min)`;
        }).join(', ');
        return generateProviderPromptDrivenReply(
          message,
          history,
          providerData,
          state,
          `Informe os servicos e precos usando estes dados reais: ${svcInfo}`,
          instructionPrompt,
        );
      }

      if (extracted.intent === 'info_hours') {
        const hours = formatProviderHours(config.opening_hours);
        return generateProviderPromptDrivenReply(
          message,
          history,
          providerData,
          state,
          `Informe os horarios de funcionamento usando estes dados reais:\n${hours}`,
          instructionPrompt,
        );
      }

      let promptDrivenContext = '';

      if (state.service && !state.date && !state.time && !state.awaitingAvailabilityConsent) {
        promptDrivenContext = `O servico ${state.service.name} ja foi identificado. Continue seguindo o prompt do dono normalmente. Se o cliente entrar em intencao de dia, horario ou disponibilidade, consulte a agenda espelhada deste turno antes de citar slot especifico.`;
      } else if (state.awaitingAvailabilityConsent && state.service) {
        promptDrivenContext = `Ja existe uma conversa aberta sobre disponibilidade para o servico ${state.service.name}. Continue seguindo o prompt do dono. Se o cliente confirmar interesse, pedir dia ou horario, use a agenda espelhada deste turno como fonte de verdade antes de responder com slot especifico.`;
      }

      return generateProviderPromptDrivenReply(
        message,
        history,
        providerData,
        state,
        promptDrivenContext,
        instructionPrompt,
      );
    }

    if (state.service && !state.date && !state.time && !state.awaitingConfirmation && !state.awaitingPaymentMethod && !state.awaitingFinalConfirmation) {
      const customerAlreadyAskedAvailability = extracted.intent === "check_availability";
      const customerAlreadyProvidedDateOrTime = Boolean(extracted.date || extracted.time);

      if (state.awaitingAvailabilityConsent && explicitAffirmative) {
        const firstAvailableSlot = await findFirstAvailableProviderSlot(
          userId,
          state.service.duration_minutes,
          state.professional?.id,
          config.max_advance_days || 30,
        );

        state.awaitingAvailabilityConsent = false;

        if (firstAvailableSlot) {
          state.date = firstAvailableSlot.date;
          state.time = firstAvailableSlot.time;
          rememberSuggestedSlots(state, firstAvailableSlot.date, [firstAvailableSlot.time]);
          state.lastUpdated = new Date();
          return { text: buildFirstAvailableSlotQuestion(state) };
        }

        clearSuggestedSlots(state);
        return {
          text: "No momento nao encontrei horario disponivel na agenda real para esse servico. Se quiser, me diga outro dia que eu verifico novamente.",
        };
      }

      if (!state.awaitingAvailabilityConsent && !explicitAffirmative && !customerAlreadyAskedAvailability && !customerAlreadyProvidedDateOrTime) {
        clearSuggestedSlots(state);
        state.awaitingAvailabilityConsent = true;
        state.lastUpdated = new Date();
        return { text: buildProviderPriceAndAvailabilityQuestion(state) };
      }
    }

    // 4. HANDLE CONFIRMATION
    // Allow confirm when: (a) awaitingConfirmation is true OR (b) intent=confirm and all data present
    const hasAllBookingData = state.service && state.date && state.time;
    const readyAfterPayment = state.awaitingPaymentMethod && !!state.paymentMethod;
    if (readyAfterPayment && flowRequirements.requireFinalConfirmationAfterPayment && !state.awaitingFinalConfirmation) {
      state.awaitingPaymentMethod = false;
      state.awaitingConfirmation = false;
      state.awaitingFinalConfirmation = true;
      state.lastUpdated = new Date();
      return { text: buildProviderFinalConfirmationQuestion(state) };
    }

    const shouldConfirm = (
      !flowRequirements.requireFinalConfirmationAfterPayment
      && readyAfterPayment
    ) || (
      explicitAffirmative
      && (state.awaitingConfirmation || state.awaitingFinalConfirmation)
    );
    console.log(`💇 [Provider v2] CONFIRM CHECK: intent=${extracted.intent} awaiting=${state.awaitingConfirmation} hasAllData=${!!hasAllBookingData} shouldConfirm=${shouldConfirm}`);
    if (shouldConfirm) {
      if (state.awaitingConfirmation && flowRequirements.requirePaymentMethod && !state.paymentMethod) {
        state.awaitingConfirmation = false;
        state.awaitingPaymentMethod = true;
        state.lastUpdated = new Date();
        return { text: buildPaymentMethodQuestion() };
      }

      console.log(`💇 [Provider v2] CONFIRM PATH: svc=${state.service?.name} date=${state.date} time=${state.time}`);
      if (!state.service || !state.date || !state.time) {
        state.awaitingConfirmation = false;
        state.awaitingPaymentMethod = false;
        state.awaitingFinalConfirmation = false;
        console.log(`💇 [Provider v2] CONFIRM FAIL: missing data`);
        return { text: await generateAIResponse(message, history, providerData, state, 'Faltam dados para confirmar. Pergunte o que falta.', instructionPrompt) };
      }

      if (!state.customerName?.trim()) {
        if (promptDrivenMode) {
          const inferredCustomerName = await inferProviderCustomerNameFromConversationLLM(
            message,
            history,
            state,
          );
          if (inferredCustomerName) {
            state.customerName = inferredCustomerName;
            console.log(`[Provider v2] Nome inferido via LLM antes do create: ${inferredCustomerName}`);
          } else {
            state.customerName = "Cliente";
            console.log("[Provider v2] Nome ausente no modo prompt-driven; seguindo com nome padrao 'Cliente'.");
          }
        } else {
          state.awaitingConfirmation = false;
          state.awaitingPaymentMethod = false;
          state.awaitingFinalConfirmation = false;
          console.log(`[Provider v2] CONFIRM FAIL: missing customer name`);
          return { text: buildCustomerNameQuestion(state) };
        }
      }

      // REVALIDATE SLOT
      console.log(`💇 [Provider v2] REVALIDATING slot: ${state.date} ${state.time}`);
      const { valid, availableSlots } = await validateSlot(
        userId, state.date, state.time,
        state.professional?.id,
        state.service.duration_minutes
      );

      console.log(`💇 [Provider v2] VALIDATE result: valid=${valid} availableSlots=${availableSlots.length}`);
      if (!valid) {
        state.awaitingConfirmation = false;
        state.awaitingPaymentMethod = false;
        state.awaitingFinalConfirmation = false;
        state.time = null;

        if (shouldOfferSingleRealSlot(config) && availableSlots.length > 0) {
          state.time = availableSlots[0];
          rememberSuggestedSlots(state, state.date!, [availableSlots[0]]);
          state.lastUpdated = new Date();
          return { text: buildFirstAvailableSlotQuestion(state) };
        }

        // USAR FUNÇÃO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          providerData,
          bookingState: state,
          date: state.date!,
          allowedSlots: availableSlots,
          breakConfig,
          serviceName: state.service?.name,
          instructionPrompt,
        });
        rememberSuggestedSlots(state, state.date!, slotResult.suggestedSlots);
        return { text: slotResult.messageText };
      }

      // CREATE APPOINTMENT
      console.log(`💇 [Provider v2] CREATING appointment...`);
      const bookingSnapshot = buildProviderAppointmentConversationSnapshot(
        state,
        customerPhone,
        conversationId,
        history,
      );
      const result = await createProviderAppointment(userId, conversationId, {
        clientName: state.customerName || 'Cliente',
        clientPhone: customerPhone,
        serviceId: state.service.id,
        serviceName: state.service.name,
        professionalId: state.professional?.id,
        professionalName: state.professional?.name,
        appointmentDate: state.date,
        startTime: state.time,
        durationMinutes: state.service.duration_minutes || 30,
      }, {
        clientNotes: buildProviderClientNotes(state, bookingSnapshot),
        bookingSnapshot,
      });

      console.log(`💇 [Provider v2] CREATE result: success=${result.success} id=${result.appointmentId} error=${result.error}`);
      if (result.success) {
        const confirmationState: BookingState = {
          ...state,
          awaitingConfirmation: false,
          awaitingPaymentMethod: false,
          awaitingFinalConfirmation: false,
          customerPhone,
          createdAt: new Date(),
          lastUpdated: new Date(),
        };
        clearSuggestedSlots(confirmationState);
        resetBookingState(userId, customerPhone, conversationId);

        return {
          text: buildAppointmentCreatedMessage(providerData, confirmationState, instructionPrompt),
          shouldSave: true,
        };
      } else if (!result.suggestedSlots || result.suggestedSlots.length === 0) {
        state.awaitingConfirmation = false;
        state.awaitingPaymentMethod = false;
        state.awaitingFinalConfirmation = false;
        return { text: buildAppointmentFailureMessage(result.error) };
      } else if (result.suggestedSlots && result.suggestedSlots.length > 0) {
        state.awaitingConfirmation = false;
        state.awaitingPaymentMethod = false;
        state.awaitingFinalConfirmation = false;
        state.time = null;

        if (shouldOfferSingleRealSlot(config)) {
          const nextSlot = result.suggestedSlots[0];
          state.time = nextSlot;
          rememberSuggestedSlots(state, state.date!, [nextSlot]);
          state.lastUpdated = new Date();
          return { text: buildFirstAvailableSlotQuestion(state) };
        }

        // USAR FUNÇÃO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          providerData,
          bookingState: state,
          date: state.date!,
          allowedSlots: result.suggestedSlots,
          breakConfig,
          serviceName: state.service?.name,
          instructionPrompt,
        });
        rememberSuggestedSlots(state, state.date!, slotResult.suggestedSlots);
        return { text: slotResult.messageText };
      } else {
        return { text: await generateAIResponse(message, history, providerData, state, 'Erro ao criar agendamento. Peca desculpas e peca para tentar novamente.', instructionPrompt) };
      }
    }

    // 4.5. HANDLE CHECK_AVAILABILITY - Mostrar horários ANTES de pedir serviço
    const isAvailabilityQuery = extracted.intent === 'check_availability';
    
    if (isAvailabilityQuery) {
      // Determinar a data alvo
      const targetDate = normalizeProviderDateValue(extracted.date || state.date) || null;

      if (targetDate) {
        // Salvar data no estado
        state.date = targetDate;
        state.lastUpdated = new Date();

        // Buscar slots usando duracao padrao do prestador
        const defaultDuration = state.service?.duration_minutes || config.slot_duration || 30;
        const slots = await getAvailableSlots(userId, targetDate, state.professional?.id, defaultDuration);
        const dateFormatted = formatProviderContextualDate(targetDate);

        console.log(`💇 [Provider v2] AVAILABILITY CHECK: date=${targetDate} slots=${slots.length}`);

        if (slots.length === 0) {
          clearSuggestedSlots(state);
          // Dia lotado - tentar próximo dia útil
          let nextDate = new Date(targetDate + 'T12:00:00');
          let nextSlots: string[] = [];
          let nextDateStr = '';
          for (let i = 1; i <= 7; i++) {
            nextDate.setDate(nextDate.getDate() + 1);
            const y = nextDate.getFullYear();
            const m = (nextDate.getMonth() + 1).toString().padStart(2, '0');
            const d = nextDate.getDate().toString().padStart(2, '0');
            nextDateStr = `${y}-${m}-${d}`;
            nextSlots = await getAvailableSlots(userId, nextDateStr, state.professional?.id, defaultDuration);
            if (nextSlots.length > 0) break;
          }

          if (shouldOfferSingleRealSlot(config) && nextSlots.length > 0) {
            const nextFormatted = formatProviderContextualDate(nextDateStr);
            const nextFirstSlot = nextSlots[0];
            rememberSuggestedSlots(state, nextDateStr, [nextFirstSlot]);
            if (state.service) {
              state.date = nextDateStr;
              state.time = nextFirstSlot;
              state.lastUpdated = new Date();
              return { text: `Para ${dateFormatted}, não encontrei vaga na agenda real. O próximo horário disponível é ${nextFormatted}, às ${nextFirstSlot}.\n\nEsse horário fica melhor para você?` };
            }

            return { text: `Para ${dateFormatted}, não encontrei vaga na agenda real. O próximo horário disponível é ${nextFormatted}, às ${nextFirstSlot}.\n\nQual serviço você precisa?` };
          }

          if (nextSlots.length > 0) {
            const nextFormatted = formatProviderContextualDate(nextDateStr);
            const sampleSlots = nextSlots.slice(0, 6).join(', ');
            return { text: `Infelizmente não temos horários disponíveis para ${dateFormatted} 😔\n\nO próximo dia com vagas é ${nextFormatted}. Alguns horários: ${sampleSlots}\n\nGostaria de agendar nesse dia? Qual serviço deseja?` };
          } else {
            return { text: `Infelizmente não temos horários disponíveis para ${dateFormatted} e nem nos próximos dias. Por favor, entre em contato novamente em breve! 😔` };
          }
        }

        if (shouldOfferSingleRealSlot(config)) {
          const firstSlot = slots[0];
          rememberSuggestedSlots(state, targetDate, [firstSlot]);
          if (state.service) {
            state.time = firstSlot;
            state.lastUpdated = new Date();
            return { text: buildFirstAvailableSlotQuestion(state) };
          }

          const servicesHint = !state.service && services.length > 0
            ? `\n\nQual serviço você gostaria? Temos: ${services.slice(0, 5).map(s => s.name).join(', ')}`
            : '';

          return { text: `Para ${dateFormatted}, o primeiro horário disponível é ${firstSlot}.${servicesHint}` };
        }

        // Mostrar horários disponíveis (5-8 slots espaçados)
        let displaySlots: string[];
        if (slots.length <= 8) {
          displaySlots = slots;
        } else {
          // Selecionar slots espaçados para cobrir o dia todo
          const step = Math.floor(slots.length / 7);
          displaySlots = [];
          for (let i = 0; i < slots.length && displaySlots.length < 8; i += step) {
            displaySlots.push(slots[i]);
          }
          // Garantir o último slot
          if (!displaySlots.includes(slots[slots.length - 1])) {
            displaySlots[displaySlots.length - 1] = slots[slots.length - 1];
          }
        }

        const slotsFormatted = displaySlots.join(', ');
        const totalMsg = slots.length > 8 ? ` (${slots.length} horários no total)` : '';
        rememberSuggestedSlots(state, targetDate, displaySlots);
        
        // Perguntar serviço DEPOIS de mostrar disponibilidade
        const servicesHint = !state.service && services.length > 0
          ? `\n\nQual serviço você gostaria? Temos: ${services.slice(0, 5).map(s => s.name).join(', ')}`
          : '';

        return { text: `Para ${dateFormatted}, temos os seguintes horários disponíveis${totalMsg}:\n\n🕐 ${slotsFormatted}\n${servicesHint}` };
      }

      return {
        text: 'Me diga o dia que você prefere e eu consulto os horários certinhos para você.',
      };
    }

    // 5. CHECK IF WE HAVE ALL DATA FOR BOOKING
    const requirements = flowRequirements;
    const needsService = !state.service && services.length > 0;
    const needsProfessional = !state.professional && config.use_professionals && professionals.length > 0;
    const needsDate = !state.date;
    const needsTime = !state.time;
    const needsCustomerType = requirements.requireCustomerType && !state.customerType;
    const needsCustomerName = !state.customerName?.trim();
    const needsCustomerAddress = requirements.requireAddress && !state.customerAddress?.trim();
    const needsCustomerEmail = requirements.requireEmail && !state.customerEmail?.trim();

    const isBookingIntent = extracted.intent === 'booking' || state.service !== null || state.date !== null;

    if (state.awaitingAvailabilityConsent && extracted.intent === 'cancel') {
      state.awaitingAvailabilityConsent = false;
    }

    if (isBookingIntent && state.service && state.date && state.time && !state.awaitingConfirmation && !state.awaitingPaymentMethod) {
      // All data collected - VALIDATE SLOT then ask confirmation
      const { valid, availableSlots } = await validateSlot(
        userId, state.date, state.time,
        state.professional?.id,
        state.service.duration_minutes
      );

      if (!valid) {
        state.time = null;

        // USAR FUNÇÃO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          providerData,
          bookingState: state,
          date: state.date!,
          allowedSlots: availableSlots,
          breakConfig,
          serviceName: state.service?.name,
          instructionPrompt,
        });
        rememberSuggestedSlots(state, state.date!, slotResult.suggestedSlots);
        return { text: slotResult.messageText };
      }

      if (needsCustomerType) {
        clearSuggestedSlots(state);
        state.lastUpdated = new Date();
        return { text: buildCustomerTypeQuestion() };
      }

      if (needsCustomerName || needsCustomerAddress || needsCustomerEmail) {
        clearSuggestedSlots(state);
        state.lastUpdated = new Date();
        return { text: buildProviderCustomerDataQuestion(requirements, state) };
      }

      // SLOT VALID - ask confirmation
      clearSuggestedSlots(state);
      state.awaitingConfirmation = true;
      state.awaitingFinalConfirmation = false;
      state.lastUpdated = new Date();
      return { text: buildProviderBookingReviewQuestion(state) };
    }

    // 6. IF BOOKING INTENT, CHECK WHAT'S MISSING AND PROVIDE SLOTS IF DATE IS SET
    if (isBookingIntent) {
      let contextMsg = '';

      if (needsService) {
        const svcList = services.map(s => {
          const p = s.price ? ` (R$ ${s.price.toFixed(2).replace('.', ',')})` : '';
          return `${s.name}${p}`;
        }).join(', ');
        contextMsg = `O cliente quer agendar mas não escolheu o serviço ainda. Serviços: ${svcList}. Pergunte qual serviço deseja.`;
      } else if (needsProfessional) {
        const profNames = professionals.map(p => p.name).join(', ');
        contextMsg = `Serviço escolhido: ${state.service!.name}. Profissionais disponíveis: ${profNames}. Pergunte com qual profissional prefere ou se tanto faz.`;
      } else if (needsDate) {
        if (!state.awaitingAvailabilityConsent && state.service) {
          clearSuggestedSlots(state);
          state.awaitingAvailabilityConsent = true;
          state.lastUpdated = new Date();
          return { text: buildProviderPriceAndAvailabilityQuestion(state) };
        }

        contextMsg = `Serviço: ${state.service!.name}${state.professional ? ', Profissional: ' + state.professional.name : ''}. Aguarde a autorizacao do cliente para consultar a agenda real.`;
      } else if (needsTime) {
        // Fetch available slots for the date (já filtrados pelo backend - sem almoço)
        const slots = await getAvailableSlots(
          userId, state.date!, state.professional?.id, state.service!.duration_minutes
        );
        if (slots.length === 0) {
          const requestedDate = state.date || ''; // Salvar antes de limpar
          clearSuggestedSlots(state);
          state.date = null;
          contextMsg = `Não há horários disponíveis para ${formatDatePtBr(requestedDate)}. Peça outra data ao cliente.`;
        } else {
          // USAR FUNÇÃO ESTRUTURADA: IA retorna JSON com validação de slots
          if (shouldOfferSingleRealSlot(config)) {
            state.time = slots[0];
            rememberSuggestedSlots(state, state.date!, [slots[0]]);
            state.lastUpdated = new Date();
            return { text: buildFirstAvailableSlotQuestion(state) };
          }

          const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
          const slotResult = await generateSlotSuggestionMessageLLM({
            message,
            conversationHistory: history,
            providerData,
            bookingState: state,
            date: state.date!,
            allowedSlots: slots,
            breakConfig,
            serviceName: state.service?.name,
            instructionPrompt,
          });
          rememberSuggestedSlots(state, state.date!, slotResult.suggestedSlots);
          // Retornar diretamente a mensagem validada (sem passar por generateAIResponse)
          return { text: slotResult.messageText };
        }
      } else if (needsCustomerType) {
        return { text: buildCustomerTypeQuestion() };
      } else if (needsCustomerName || needsCustomerAddress || needsCustomerEmail) {
        return { text: buildProviderCustomerDataQuestion(requirements, state) };
      } else if (state.awaitingPaymentMethod && !state.paymentMethod) {
        return { text: buildPaymentMethodQuestion() };
      } else if (state.awaitingFinalConfirmation) {
        return { text: buildProviderFinalConfirmationQuestion(state) };
      }

      return { text: await generateAIResponse(message, history, providerData, state, contextMsg, instructionPrompt) };
    }

    // 7. INFO-ONLY INTENTS (services, hours, prices)
    if (extracted.intent === 'info_services' || extracted.intent === 'info_prices') {
      const svcInfo = services.map(s => {
        const p = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'Consulte';
        return `${s.name}: ${p} (${s.duration_minutes}min)`;
      }).join(', ');
      return { text: await generateAIResponse(message, history, providerData, state, `Informe os serviços e preços: ${svcInfo}`, instructionPrompt) };
    }

    if (extracted.intent === 'info_hours') {
      const hours = formatProviderHours(config.opening_hours);
      return { text: await generateAIResponse(message, history, providerData, state, `Informe os horários de funcionamento:\n${hours}`, instructionPrompt) };
    }

    // 8. GENERAL CONVERSATION - AI handles naturally
    return { text: await generateAIResponse(message, history, providerData, state, '', instructionPrompt) };

  } catch (err) {
    console.error('❌ [Provider] Erro ao gerar resposta:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS PARA COMPATIBILIDADE
// ═══════════════════════════════════════════════════════════════════════

export async function isProviderActive(userId: string): Promise<boolean> {
  const config = await getProviderConfig(userId);
  return config?.is_active === true;
}

// Legacy exports (unused but kept for import compatibility)
export function detectProviderIntent(): ProviderIntent { return 'OTHER'; }

