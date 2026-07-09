/**
 * Módulo de Integração de Agendamento com IA
 * 
 * Este módulo permite que o agente de IA:
 * 1. Detecte intenções de agendamento nas mensagens dos clientes
 * 2. Verifique horários disponíveis automaticamente
 * 3. Crie agendamentos pendentes para confirmação
 * 4. Responda sobre disponibilidade de forma inteligente
 * 
 * OTIMIZAÇÕES:
 * - Cache em memória para configurações (reduz queries ao Supabase)
 * - Verificação de is_enabled ANTES de queries pesadas
 * - TTL de 5 minutos para cache de config
 */

import {
  checkCalendarAvailability,
  isGoogleCalendarConnected,
  listCalendarBusyWindows,
  removeAppointmentFromCalendar,
  syncAppointmentToCalendar,
  type CalendarBusyWindow,
} from "./googleCalendarService";
import { parseCalendarDateTimeWithTimeZone } from "./calendarDateTime";
import { supabase } from "./supabaseAuth";

// ========== CACHE SYSTEM ==========
// Cache em memória para reduzir Disk IO e Egress do Supabase
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const schedulingConfigCache = new Map<string, CacheEntry<SchedulingConfig | null>>();

/**
 * Limpa cache expirado periodicamente
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of schedulingConfigCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      schedulingConfigCache.delete(key);
    }
  }
}

// Limpar cache a cada 10 minutos
setInterval(cleanExpiredCache, 10 * 60 * 1000);

/**
 * Invalida o cache de um usuário específico
 * Chamar quando a configuração for alterada
 */
export function invalidateSchedulingCache(userId: string): void {
  schedulingConfigCache.delete(userId);
  console.log(`🗑️ [Scheduling] Cache invalidado para user ${userId}`);
}

/**
 * Verifica RAPIDAMENTE se o agendamento está habilitado (usa cache)
 * Esta função evita queries desnecessárias ao Supabase
 */
export async function isSchedulingEnabled(userId: string): Promise<boolean> {
  const config = await getSchedulingConfigCached(userId);
  return config?.is_enabled === true;
}

export interface SchedulingConfig {
  id: string;
  user_id: string;
  is_enabled: boolean;
  service_name: string;
  service_duration: number;
  location: string;
  location_type: string;
  available_days: number[];
  work_start_time: string;
  work_end_time: string;
  break_start_time: string;
  break_end_time: string;
  has_break: boolean;
  slot_duration: number;
  buffer_between_appointments: number;
  max_appointments_per_day: number;
  advance_booking_days: number;
  min_booking_notice_hours: number;
  require_confirmation: boolean;
  auto_confirm: boolean;
  allow_cancellation: boolean;
  send_reminder: boolean;
  reminder_hours_before: number;
  reminder_times?: number[] | null;
  google_calendar_enabled: boolean;
  booking_notification_enabled?: boolean;
  booking_notification_phone?: string | null;
  slot_suggestion_mode?: SlotSuggestionMode | null;
  confirmation_message: string;
  reminder_message: string;
  cancellation_message: string;
}

export interface Appointment {
  id: string;
  user_id: string;
  client_name: string;
  client_phone: string;
  client_email?: string;
  service_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  location?: string;
  location_type: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  confirmed_by_client: boolean;
  confirmed_by_business: boolean;
  created_by_ai: boolean;
  client_notes?: string;
  internal_notes?: string;
  google_calendar_event_id?: string;
  google_event_id?: string;
  google_calendar_synced?: boolean;
  reminder_sent: boolean;
  ai_conversation_context?: SchedulingAppointmentContext | Record<string, unknown> | null;
}

export interface SchedulingException {
  id: string;
  user_id: string;
  exception_date: string;
  exception_type: 'blocked' | 'modified_hours' | 'holiday';
  custom_start_time?: string;
  custom_end_time?: string;
  reason?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface SchedulingIntent {
  detected: boolean;
  type: 'check_availability' | 'book_appointment' | 'cancel_appointment' | 'reschedule' | 'info' | null;
  requestedDate?: string;
  requestedTime?: string;
  confidence: number;
}

interface SchedulingTurnHistoryMessage {
  text?: string | null;
  fromMe?: boolean;
}

interface NextAvailableDaySlots {
  date: string;
  slots: TimeSlot[];
}

export interface SchedulingTag {
  raw: string;
  date: string;
  time: string;
  clientName: string;
  serviceName?: string;
  customerAddress?: string;
  approvalToken?: string;
}

interface SchedulingServiceRecord {
  id: string;
  name: string;
  duration_minutes: number | null;
  price?: string | number | null;
  is_active?: boolean | null;
  requires_customer_address?: boolean | null;
}

interface ResolvedSchedulingServiceBundle {
  primaryServiceId?: string;
  combinedServiceName: string;
  totalDurationMinutes: number;
  totalPrice: number | null;
  requiresCustomerAddress: boolean;
  isAmbiguousMatch?: boolean;
  selectedServices: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    price: number | null;
  }>;
}

interface SchedulingAppointmentContext {
  domain: "scheduling";
  selectedServices: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    price: number | null;
  }>;
  totalDurationMinutes: number;
  totalPrice: number | null;
  customerAddress?: string;
  requiresCustomerAddress?: boolean;
}

interface SchedulingConversationState {
  selectedServices?: SchedulingAppointmentContext["selectedServices"];
  totalDurationMinutes?: number;
  totalPrice?: number | null;
  requiresCustomerAddress?: boolean;
  customerName?: string;
  customerAddress?: string;
  selectedDate?: string;
  selectedTime?: string;
  confirmedDate?: string;
  confirmedTime?: string;
  offeredSlots?: RememberedSchedulingOfferedSlot[];
  offeredSlotsServiceKey?: string;
  updatedAt: number;
}

type SlotSuggestionMode = "first_available" | "ask_preference";

interface ValidatedSlotOffer {
  date: string;
  time: string;
  expiresAt: number;
  acceptedAt?: number;
  serviceBundle: ResolvedSchedulingServiceBundle;
}

interface RememberedSchedulingOfferedSlot {
  date: string;
  time: string;
}

const MAX_IMPLICIT_SLOT_DRIFT_MINUTES = 60;

const SAME_DAY_REBOOK_APPROVAL_TTL_MS = 15 * 60 * 1000;
const sameDayRebookingApprovals = new Map<string, { date: string; expiresAt: number }>();
const VALIDATED_SLOT_OFFER_TTL_MS = 20 * 60 * 1000;
const validatedSlotOffers = new Map<string, ValidatedSlotOffer>();
const SCHEDULING_STATE_TTL_MS = 6 * 60 * 60 * 1000;
const schedulingConversationState = new Map<string, SchedulingConversationState>();

type SchedulingPlannerAction =
  | "IGNORE"
  | "QUOTE_ONLY"
  | "LOOKUP_NEXT_SLOTS"
  | "LOOKUP_DATE_AVAILABILITY"
  | "CHECK_EXACT_SLOT"
  | "REQUEST_SLOT_SELECTION"
  | "REQUEST_NAME"
  | "REQUEST_ADDRESS"
  | "READY_TO_BOOK"
  | "CANCEL_NEEDS_TARGET"
  | "CANCEL_READY";

interface SchedulingPlannerDecision {
  shouldHandle: boolean;
  action: SchedulingPlannerAction;
  selectedServiceIds?: string[];
  requestedDate?: string | null;
  requestedTime?: string | null;
  selectedDate?: string | null;
  selectedTime?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  wantsSchedulingNow?: boolean;
  wantsBookingDetails?: boolean;
  confidence?: number;
  reasoning?: string | null;
}

interface SchedulingPlannerTestDependencies {
  callPlanner?: (input: {
    userId: string;
    clientPhone: string;
    messageText: string;
    conversationHistory: SchedulingTurnHistoryMessage[];
    config: SchedulingConfig;
    serviceBundle: ResolvedSchedulingServiceBundle;
    activeServices: SchedulingServiceRecord[];
  }) => Promise<SchedulingPlannerDecision | null>;
  callSchedulingGate?: (input: {
    userId: string;
    clientPhone: string;
    messageText: string;
    conversationHistory: SchedulingTurnHistoryMessage[];
    plannerDecision: SchedulingPlannerDecision;
    serviceBundle: ResolvedSchedulingServiceBundle;
    activeServices: SchedulingServiceRecord[];
  }) => Promise<boolean | null>;
  resolveServiceViaLLM?: (input: {
    userMessage: string;
    catalog: SchedulingServiceRecord[];
  }) => Promise<{ serviceIds: string[]; isAmbiguous: boolean } | null>;
}

let schedulingPlannerTestDependencies: SchedulingPlannerTestDependencies | null = null;

export function setSchedulingOrchestratorTestDependencies(
  deps: SchedulingPlannerTestDependencies | null,
): void {
  schedulingPlannerTestDependencies = deps;
}

function buildSchedulingConversationStateKey(userId: string, clientPhone: string): string {
  return `${userId}:${clientPhone}`;
}

function getSchedulingConversationState(userId: string, clientPhone: string): SchedulingConversationState | null {
  const key = buildSchedulingConversationStateKey(userId, clientPhone);
  const state = schedulingConversationState.get(key);
  if (!state) {
    return null;
  }

  if (state.updatedAt + SCHEDULING_STATE_TTL_MS <= Date.now()) {
    schedulingConversationState.delete(key);
    return null;
  }

  return state;
}

function rememberSchedulingConversationState(
  userId: string,
  clientPhone: string,
  patch: Partial<SchedulingConversationState>,
): SchedulingConversationState | null {
  const cleanedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<SchedulingConversationState>;

  if (Object.keys(cleanedPatch).length === 0) {
    return getSchedulingConversationState(userId, clientPhone);
  }

  const key = buildSchedulingConversationStateKey(userId, clientPhone);
  const currentState = getSchedulingConversationState(userId, clientPhone) || { updatedAt: Date.now() };
  const nextState: SchedulingConversationState = {
    ...currentState,
    ...cleanedPatch,
    updatedAt: Date.now(),
  };

  schedulingConversationState.set(key, nextState);
  return nextState;
}

export function clearSchedulingConversationState(userId: string, clientPhone: string): void {
  schedulingConversationState.delete(buildSchedulingConversationStateKey(userId, clientPhone));
}

export function clearSchedulingConversationStateForTests(): void {
  schedulingConversationState.clear();
}

export function rememberValidatedSlotOfferForTests(
  userId: string,
  clientPhone: string,
  date: string,
  time: string,
  serviceBundle: ResolvedSchedulingServiceBundle,
): void {
  rememberValidatedSlotOffer(userId, clientPhone, date, time, serviceBundle);
}

export function getValidatedSlotOfferForTests(
  userId: string,
  clientPhone: string,
): { date: string; time: string } | null {
  const offer = getValidatedSlotOffer(userId, clientPhone);
  return offer
    ? {
        date: offer.date,
        time: offer.time,
      }
    : null;
}

export function findClosestSchedulingSlotWithinToleranceForTests(
  times: string[],
  targetTime: string,
  maxDiffMinutes = MAX_IMPLICIT_SLOT_DRIFT_MINUTES,
): string | null {
  const slots = times.map((time) => ({
    start: normalizeSchedulingTimeValue(time),
    end: normalizeSchedulingTimeValue(time),
    available: true,
  }));
  return findClosestSchedulingSlotWithinTolerance(slots, targetTime, maxDiffMinutes)?.start || null;
}

export function buildSchedulingNextSlotsReplyWithMemoryForTests(
  userId: string,
  clientPhone: string,
  serviceBundle: ResolvedSchedulingServiceBundle,
  slotsData: NextAvailableDaySlots[],
  options?: {
    requiresCustomerAddress?: boolean;
    unavailableDate?: string;
    confirmedDate?: string;
    confirmedTime?: string;
    requestConfirmationDetails?: boolean;
  },
): string | null {
  return buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, serviceBundle, slotsData, options);
}

function buildSchedulingServiceBundleMemoryKey(bundle: ResolvedSchedulingServiceBundle): string {
  const catalogParts = bundle.selectedServices
    .map((service) => `${String(service.id || "").trim() || normalizeSchedulingMessage(service.name)}:${Number(service.durationMinutes || 0)}`)
    .sort();

  if (catalogParts.length > 0) {
    return catalogParts.join("|");
  }

  return normalizeSchedulingMessage(bundle.combinedServiceName || "");
}

function flattenSchedulingOfferedSlots(slotsData: NextAvailableDaySlots[]): RememberedSchedulingOfferedSlot[] {
  const seen = new Set<string>();
  const flattened: RememberedSchedulingOfferedSlot[] = [];

  for (const dayData of slotsData) {
    const date = String(dayData?.date || "").trim();
    if (!date) {
      continue;
    }

    for (const slot of dayData.slots || []) {
      const time = normalizeSchedulingTimeValue(slot.start);
      if (!time) {
        continue;
      }

      const key = `${date} ${time}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      flattened.push({ date, time });

      if (flattened.length >= 12) {
        return flattened;
      }
    }
  }

  return flattened;
}

function rememberSchedulingOfferedSlots(
  userId: string,
  clientPhone: string,
  serviceBundle: ResolvedSchedulingServiceBundle,
  slotsData: NextAvailableDaySlots[],
): SchedulingConversationState | null {
  const offeredSlots = flattenSchedulingOfferedSlots(slotsData);
  return rememberSchedulingConversationState(userId, clientPhone, {
    offeredSlots,
    offeredSlotsServiceKey: offeredSlots.length > 0
      ? buildSchedulingServiceBundleMemoryKey(serviceBundle)
      : "",
  });
}

function clearRememberedSchedulingOfferedSlots(userId: string, clientPhone: string): SchedulingConversationState | null {
  return rememberSchedulingConversationState(userId, clientPhone, {
    offeredSlots: [],
    offeredSlotsServiceKey: "",
  });
}

function getRememberedOfferedSchedulingSlotsForBundle(
  rememberedState: SchedulingConversationState | null,
  serviceBundle: ResolvedSchedulingServiceBundle,
): RememberedSchedulingOfferedSlot[] {
  if (!rememberedState?.offeredSlots || rememberedState.offeredSlots.length === 0) {
    return [];
  }

  const expectedServiceKey = buildSchedulingServiceBundleMemoryKey(serviceBundle);
  if (rememberedState.offeredSlotsServiceKey && rememberedState.offeredSlotsServiceKey !== expectedServiceKey) {
    return [];
  }

  return rememberedState.offeredSlots
    .map((slot) => ({
      date: String(slot.date || "").trim(),
      time: normalizeSchedulingTimeValue(slot.time),
    }))
    .filter((slot) => Boolean(slot.date) && Boolean(slot.time));
}

function buildRememberedSchedulingSlotsData(
  rememberedState: SchedulingConversationState | null,
  serviceBundle: ResolvedSchedulingServiceBundle,
): NextAvailableDaySlots[] {
  const rememberedSlots = getRememberedOfferedSchedulingSlotsForBundle(rememberedState, serviceBundle);
  if (rememberedSlots.length === 0) {
    return [];
  }

  const groupedSlots = new Map<string, TimeSlot[]>();

  for (const slot of rememberedSlots) {
    const time = normalizeSchedulingTimeValue(slot.time);
    if (!time) {
      continue;
    }

    const daySlots = groupedSlots.get(slot.date) || [];
    if (!daySlots.some((candidate) => candidate.start === time)) {
      daySlots.push({
        start: time,
        end: time,
        available: true,
      });
    }
    groupedSlots.set(slot.date, daySlots);
  }

  return Array.from(groupedSlots.entries()).map(([date, slots]) => ({
    date,
    slots,
  }));
}

function findClosestSchedulingSlotWithinTolerance(
  slots: TimeSlot[],
  targetTime: string,
  maxDiffMinutes = MAX_IMPLICIT_SLOT_DRIFT_MINUTES,
): TimeSlot | null {
  const normalizedTargetTime = normalizeSchedulingTimeValue(targetTime);
  if (!normalizedTargetTime) {
    return null;
  }

  const exactSlot = findExactAvailableSlot(slots, normalizedTargetTime);
  if (exactSlot) {
    return exactSlot;
  }

  const closestSlot = findClosestAvailableSlot(slots, normalizedTargetTime);
  if (!closestSlot) {
    return null;
  }

  const driftMinutes = Math.abs(
    timeToMinutes(closestSlot.start) - timeToMinutes(normalizedTargetTime),
  );
  return driftMinutes <= maxDiffMinutes ? closestSlot : null;
}

function resolveRememberedOfferedSchedulingSlot(
  rememberedState: SchedulingConversationState | null,
  serviceBundle: ResolvedSchedulingServiceBundle,
  targetDate: string | null,
  targetTime: string | null,
): RememberedSchedulingOfferedSlot | null {
  if (!targetDate || !targetTime) {
    return null;
  }

  const rememberedSlots = getRememberedOfferedSchedulingSlotsForBundle(rememberedState, serviceBundle);
  if (rememberedSlots.length === 0) {
    return null;
  }

  const candidateSlots = rememberedSlots
    .filter((slot) => slot.date === targetDate)
    .map((slot) => ({
      start: normalizeSchedulingTimeValue(slot.time),
      end: normalizeSchedulingTimeValue(slot.time),
      available: true,
    }));

  if (candidateSlots.length === 0) {
    return null;
  }

  const matchedSlot = findClosestSchedulingSlotWithinTolerance(candidateSlots, targetTime);

  if (!matchedSlot) {
    return null;
  }

  return {
    date: targetDate,
    time: matchedSlot.start,
  };
}

function resolveImplicitRememberedOfferedSchedulingSlot(
  rememberedState: SchedulingConversationState | null,
  serviceBundle: ResolvedSchedulingServiceBundle,
  targetDate: string | null,
  targetTime: string | null,
): RememberedSchedulingOfferedSlot | null {
  const rememberedSlots = getRememberedOfferedSchedulingSlotsForBundle(rememberedState, serviceBundle);
  if (rememberedSlots.length === 0) {
    return null;
  }

  if (targetDate && targetTime) {
    return resolveRememberedOfferedSchedulingSlot(
      rememberedState,
      serviceBundle,
      targetDate,
      targetTime,
    );
  }

  if (targetDate && !targetTime) {
    const slotsForDate = rememberedSlots.filter((slot) => slot.date === targetDate);
    return slotsForDate.length === 1 ? slotsForDate[0] : null;
  }

  if (!targetTime) {
    return null;
  }

  const uniqueDates = Array.from(new Set(rememberedSlots.map((slot) => slot.date)));
  if (uniqueDates.length === 1) {
    return resolveRememberedOfferedSchedulingSlot(
      rememberedState,
      serviceBundle,
      uniqueDates[0],
      targetTime,
    );
  }

  const normalizedTargetTime = normalizeSchedulingTimeValue(targetTime);
  const exactMatches = rememberedSlots.filter((slot) => normalizeSchedulingTimeValue(slot.time) === normalizedTargetTime);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    return null;
  }

  const closestSlot = findClosestSchedulingSlotWithinTolerance(
    rememberedSlots.map((slot) => ({
      start: normalizeSchedulingTimeValue(slot.time),
      end: normalizeSchedulingTimeValue(slot.time),
      available: true,
    })),
    targetTime,
  );
  if (!closestSlot) {
    return null;
  }

  const closestMatches = rememberedSlots.filter((slot) => normalizeSchedulingTimeValue(slot.time) === normalizeSchedulingTimeValue(closestSlot.start));
  return closestMatches.length === 1 ? closestMatches[0] : null;
}

function schedulingBundleHasResolvedCatalogServices(bundle: ResolvedSchedulingServiceBundle | null | undefined): boolean {
  return Boolean(bundle?.selectedServices?.some((service) => Boolean(service.id)));
}

function buildResolvedBundleFromConversationState(
  config: SchedulingConfig,
  state?: SchedulingConversationState | null,
): ResolvedSchedulingServiceBundle | null {
  if (!state?.selectedServices || state.selectedServices.length === 0) {
    return null;
  }

  const selectedServices = state.selectedServices.map((service) => ({
    ...service,
    durationMinutes: Number(service.durationMinutes || 0) || 0,
    price: typeof service.price === "number" ? service.price : (service.price == null ? null : Number(service.price)),
  }));

  const combinedServiceName = selectedServices.map((service) => service.name).filter(Boolean).join(" + ")
    || config.service_name;
  const totalDurationMinutes = Number(state.totalDurationMinutes || 0)
    || selectedServices.reduce((sum, service) => sum + (service.durationMinutes || 0), 0)
    || config.service_duration;
  const totalPrice = state.totalPrice ?? selectedServices.reduce<number | null>((sum, service) => {
    if (service.price == null) {
      return sum;
    }
    return (sum ?? 0) + service.price;
  }, 0);

  return {
    primaryServiceId: selectedServices.find((service) => service.id)?.id,
    combinedServiceName,
    totalDurationMinutes,
    totalPrice,
    requiresCustomerAddress: Boolean(state.requiresCustomerAddress),
    selectedServices,
  };
}

function chooseEffectiveSchedulingServiceBundle(
  currentBundle: ResolvedSchedulingServiceBundle,
  rememberedBundle?: ResolvedSchedulingServiceBundle | null,
  options?: {
    preferCurrentCatalogMatch?: boolean;
  },
): ResolvedSchedulingServiceBundle {
  if (!rememberedBundle) {
    return currentBundle;
  }

  const currentHasCatalogServices = schedulingBundleHasResolvedCatalogServices(currentBundle);
  const rememberedHasCatalogServices = schedulingBundleHasResolvedCatalogServices(rememberedBundle);

  if (options?.preferCurrentCatalogMatch && currentHasCatalogServices) {
    return currentBundle;
  }

  if (!currentHasCatalogServices && rememberedHasCatalogServices) {
    return rememberedBundle;
  }

  if (
    rememberedHasCatalogServices
    && rememberedBundle.selectedServices.length > currentBundle.selectedServices.length
  ) {
    return rememberedBundle;
  }

  return currentBundle;
}

// Padrões de detecção de intenção de agendamento
const SCHEDULING_PATTERNS = {
  check_availability: [
    /tem hor[aá]rio/i,
    /hor[aá]rio dispon[ií]vel/i,
    /quando (pode|posso|consigo)/i,
    /qual hor[aá]rio/i,
    /tem vaga/i,
    /est[aá] dispon[ií]vel/i,
    /podemos marcar/i,
    /posso agendar/i,
    /agenda livre/i,
    /disponibilidade/i,
  ],
  // IMPORTANTE: reschedule deve vir ANTES de book_appointment para priorizar "reagendar"
  reschedule: [
    /remarcar/i,
    /reagendar/i,
    /trocar o hor[aá]rio/i,
    /mudar o hor[aá]rio/i,
    /alterar (o )?(meu )?agendamento/i,
    /outro hor[aá]rio/i,
  ],
  cancel_appointment: [
    /cancelar/i,
    /desmarcar/i,
    /n[aã]o vou (poder )?(ir|comparecer)/i,
    /n[aã]o posso (ir|comparecer)/i,
    /preciso cancelar/i,
  ],
  book_appointment: [
    /quero agendar/i,
    /quero marcar/i,
    /vou agendar/i,
    /pode agendar/i,
    /pode marcar/i,
    /reservar hor[aá]rio/i,
    /marcar um hor[aá]rio/i,
    /agendar para/i,
    /confirma o hor[aá]rio/i,
    /esse hor[aá]rio/i,
    /pode ser [àa]s/i,
  ],
  info: [
    /onde (fica|é|[eé] o endereço)/i,
    /qual o endereço/i,
    /como funciona/i,
    /quanto tempo (dura|demora)/i,
    /quanto custa/i,
    /pre[çc]o/i,
    /valor/i,
  ],
};

// Padrões para extrair data/hora
const DATE_PATTERNS = {
  today: /hoje/i,
  tomorrow: /amanh[ãa]/i,
  dayAfterTomorrow: /depois de amanh[ãa]/i,
  weekday: /(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)/i,
  specificDate: /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/,
  nextWeek: /semana que vem|pr[óo]xima semana/i,
};

const TIME_PATTERNS = {
  // Captura: 14:00, 14h, 14h30, 14:30, 14 horas
  specific: /(\d{1,2})(?:(?:h|:)(\d{2})|(:(\d{2}))|h)?\s*(hrs?|horas?)?/i,
  // Formato alternativo: 14h30 (sem : )
  withH: /(\d{1,2})h(\d{2})/i,
  morning: /manh[ãa]|de manh[ãa]/i,
  afternoon: /tarde|de tarde/i,
  evening: /noite|de noite/i,
};

const SCHEDULING_INTENT_MARKERS = {
  check_availability: [
    "tem horario",
    "horario disponivel",
    "qual horario",
    "tem vaga",
    "esta disponivel",
    "agenda livre",
    "disponibilidade",
    "primeiro horario",
    "proximo horario",
    "qualquer horario",
    "o que tiver",
  ],
  reschedule: [
    "remarcar",
    "reagendar",
    "trocar o horario",
    "mudar o horario",
    "alterar meu agendamento",
    "alterar o agendamento",
    "outro horario",
  ],
  cancel_appointment: [
    "cancelar",
    "desmarcar",
    "nao vou poder ir",
    "nao posso ir",
    "preciso cancelar",
  ],
  book_appointment: [
    "quero agendar",
    "quero marcar",
    "vou agendar",
    "pode agendar",
    "pode marcar",
    "reservar horario",
    "marcar um horario",
    "agendar para",
    "confirma o horario",
    "esse horario",
    "pode ser as",
  ],
  info: [
    "onde fica",
    "qual o endereco",
    "como funciona",
    "quanto tempo",
    "quanto custa",
    "preco",
    "valor",
  ],
} satisfies Record<Exclude<SchedulingIntent["type"], null>, string[]>;

function messageIncludesAnyMarker(normalizedMessage: string, markers: readonly string[]): boolean {
  return markers.some((marker) => normalizedMessage.includes(marker));
}

/**
 * Detecta se uma mensagem contém intenção de agendamento
 */
export function detectSchedulingIntent(message: string): SchedulingIntent {
  const result: SchedulingIntent = {
    detected: false,
    type: null,
    confidence: 0,
  };

  {
    const normalizedMessage = normalizeTextForComparison(message).trim();
    const orderedIntents: Array<Exclude<SchedulingIntent["type"], null>> = [
      "check_availability",
      "reschedule",
      "cancel_appointment",
      "book_appointment",
      "info",
    ];

    for (const intentType of orderedIntents) {
      if (messageIncludesAnyMarker(normalizedMessage, SCHEDULING_INTENT_MARKERS[intentType])) {
        result.detected = true;
        result.type = intentType;
        result.confidence = 0.8;
        break;
      }
    }

    if (!result.detected) {
      const genericMarkers = ["agend", "marc", "horario", "consulta", "atendimento"];
      if (messageIncludesAnyMarker(normalizedMessage, genericMarkers)) {
        result.detected = true;
        result.type = "info";
        result.confidence = 0.5;
      }
    }

    if (result.detected) {
      result.requestedDate = extractDate(normalizedMessage);
      result.requestedTime = extractTime(normalizedMessage);
      if (result.requestedDate) result.confidence += 0.1;
      if (result.requestedTime) result.confidence += 0.1;
    }

    return result;
  }
  
  const normalizedMsg = message.toLowerCase().trim();
  const requestedDate = extractDate(normalizedMsg);
  const requestedTime = extractTime(normalizedMsg);
  
  // Ordem específica para priorizar reschedule sobre book_appointment
  const orderedIntents: (keyof typeof SCHEDULING_PATTERNS)[] = [
    'check_availability',
    'reschedule', 
    'cancel_appointment',
    'book_appointment',
    'info'
  ];
  
  for (const intentType of orderedIntents) {
    const patterns = SCHEDULING_PATTERNS[intentType];
    for (const pattern of patterns) {
      if (pattern.test(normalizedMsg)) {
        result.detected = true;
        result.type = intentType as SchedulingIntent['type'];
        result.confidence = 0.8; // Base confidence
        break;
      }
    }
    if (result.detected) break;
  }
  
  // Se não detectou intenção específica, verificar menção genérica
  if (!result.detected) {
    const genericPatterns = [
      /agend/i, /marc/i, /hor[áa]rio/i, /consulta/i, /atendimento/i
    ];
    for (const pattern of genericPatterns) {
      if (pattern.test(normalizedMsg)) {
        result.detected = true;
        result.type = 'info';
        result.confidence = 0.5;
        break;
      }
    }
  }
  
  // Extrair data se possível
  if (result.detected) {
    result.requestedDate = requestedDate;
    result.requestedTime = requestedTime;
    
    // Aumentar confiança se tiver data/hora específica
    if (result.requestedDate) result.confidence += 0.1;
    if (result.requestedTime) result.confidence += 0.1;
  }
  
  if (!result.detected) {
    const inferredIntent = inferSchedulingIntentFromSignals(message, requestedDate, requestedTime);
    if (inferredIntent) {
      return inferredIntent;
    }
  }
  
  return result;
}

/**
 * Extrai uma data da mensagem
 * IMPORTANTE: Verificar "depois de amanhã" ANTES de "amanhã" para evitar match parcial
 */
function extractDate(message: string): string | undefined {
  const brazil = getBrazilDateTime();
  const today = brazil.date;
  
  // PRIMEIRO verificar "depois de amanhã" (mais específico)
  if (DATE_PATTERNS.dayAfterTomorrow.test(message)) {
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return formatDate(dayAfter);
  }
  
  // DEPOIS verificar "amanhã"
  if (DATE_PATTERNS.tomorrow.test(message)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }
  
  if (DATE_PATTERNS.today.test(message)) {
    return formatDate(today);
  }
  
  const weekdayMatch = message.match(DATE_PATTERNS.weekday);
  if (weekdayMatch) {
    const weekdays: { [key: string]: number } = {
      'domingo': 0, 'segunda': 1, 'terca': 2, 'terça': 2,
      'quarta': 3, 'quinta': 4, 'sexta': 5, 'sabado': 6, 'sábado': 6
    };
    const targetDay = weekdays[weekdayMatch[1].toLowerCase()];
    if (targetDay !== undefined) {
      const brazil = getBrazilDateTime();
      const date = new Date(brazil.date);
      const currentDay = date.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      date.setDate(date.getDate() + daysToAdd);
      return formatDate(date);
    }
  }
  
  const specificMatch = message.match(DATE_PATTERNS.specificDate);
  if (specificMatch) {
    const brazil = getBrazilDateTime();
    const day = parseInt(specificMatch[1]);
    const month = parseInt(specificMatch[2]) - 1;
    const year = specificMatch[3] ? parseInt(specificMatch[3]) : brazil.date.getFullYear();
    const fullYear = year < 100 ? 2000 + year : year;
    return formatDate(new Date(fullYear, month, day));
  }
  
  if (DATE_PATTERNS.nextWeek.test(message)) {
    const brazil = getBrazilDateTime();
    const nextWeek = new Date(brazil.date);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatDate(nextWeek);
  }
  
  return undefined;
}

/**
 * Extrai uma hora da mensagem
 * Suporta: 14:00, 14h, 14h30, 14:30, 14 horas, manhã, tarde, noite
 */
function extractTime(message: string): string | undefined {
  // Primeiro tentar formato XhYY (ex: 14h30, 10h45)
  const withHMatch = message.match(TIME_PATTERNS.withH);
  if (withHMatch) {
    const hour = parseInt(withHMatch[1]);
    const minutes = parseInt(withHMatch[2]);
    if (hour >= 0 && hour <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  
  // Depois tentar formato geral (14:00, 14h, 14 horas)
  const timeMatch = message.match(TIME_PATTERNS.specific);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    // Capturar minutos de diferentes grupos
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : (timeMatch[4] ? parseInt(timeMatch[4]) : 0);
    if (hour >= 0 && hour <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  
  // Horários aproximados
  if (TIME_PATTERNS.morning.test(message)) {
    return '09:00'; // Padrão para manhã
  }
  if (TIME_PATTERNS.afternoon.test(message)) {
    return '14:00'; // Padrão para tarde
  }
  if (TIME_PATTERNS.evening.test(message)) {
    return '19:00'; // Padrão para noite
  }
  
  return undefined;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function normalizeTextForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeSchedulingMessage(value: string): string {
  return normalizeTextForComparison(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSchedulingMessage(value: string): string[] {
  return normalizeSchedulingMessage(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

const SCHEDULING_AVAILABILITY_TOKENS = new Set([
  "tem",
  "teria",
  "pode",
  "posso",
  "consegue",
  "consigo",
  "livre",
  "vaga",
  "disponivel",
  "disponiveis",
  "horario",
  "horarios",
  "agenda",
  "agendar",
  "marcar",
  "reservar",
]);

const SCHEDULING_BOOKING_TOKENS = new Set([
  "fechar",
  "confirmar",
  "confirmo",
  "confirma",
  "agendar",
  "marcar",
  "reservar",
]);

const SCHEDULING_CONTEXT_HINTS = [
  "agend",
  "horario",
  "dispon",
  "vaga",
  "consulta",
  "visita",
  "orcamento",
  "atendimento",
  "[agendar:",
];

const SCHEDULING_AVAILABILITY_PROMPT_HINTS = [
  "verifique o proximo horario disponivel",
  "verificar o proximo horario disponivel",
  "verifique os horarios",
  "verificar os horarios",
  "posso verificar os proximos horarios",
  "posso verificar os horarios",
  "verificar os proximos horarios",
  "posso verificar a disponibilidade",
  "verificar a disponibilidade",
  "verifique a disponibilidade",
  "disponibilidade para agendamento",
  "verifico a disponibilidade",
  "quer que eu verifique os horarios",
  "deseja que eu verifique",
  "gostaria que eu verifique",
  // Humanized variations (LLM may rephrase "verifique" → "veja", "checar", etc.)
  "veja os proximos horarios",
  "veja os horarios",
  "veja a disponibilidade",
  "ver os proximos horarios",
  "ver os horarios",
  "ver a disponibilidade",
  "checar os horarios",
  "checar a disponibilidade",
  "consultar os horarios",
  "consultar a disponibilidade",
  "horarios disponiveis na agenda",
  "proximos horarios disponiveis",
];

function inferSchedulingIntentFromSignals(
  message: string,
  requestedDate?: string,
  requestedTime?: string,
): SchedulingIntent | null {
  if (!requestedDate && !requestedTime) {
    return null;
  }

  const normalizedMessage = normalizeSchedulingMessage(message);
  const tokens = tokenizeSchedulingMessage(message);
  if (tokens.length === 0) {
    return null;
  }

  const hasAvailabilityCue = tokens.some((token) => SCHEDULING_AVAILABILITY_TOKENS.has(token));
  const hasBookingCue = tokens.some((token) => SCHEDULING_BOOKING_TOKENS.has(token));
  const shortFollowUp = tokens.length <= 4;
  const looksLikeQuestion = message.includes("?") || hasAvailabilityCue;

  if (hasBookingCue && requestedDate && requestedTime) {
    return {
      detected: true,
      type: "book_appointment",
      requestedDate,
      requestedTime,
      confidence: 0.72,
    };
  }

  if (hasAvailabilityCue || looksLikeQuestion || shortFollowUp) {
    return {
      detected: true,
      type: "check_availability",
      requestedDate,
      requestedTime,
      confidence: requestedTime ? 0.8 : 0.7,
    };
  }

  if (normalizedMessage.startsWith("e ") || normalizedMessage.startsWith("na ")) {
    return {
      detected: true,
      type: "check_availability",
      requestedDate,
      requestedTime,
      confidence: 0.65,
    };
  }

  return null;
}

function hasRecentSchedulingContext(conversationHistory: SchedulingTurnHistoryMessage[]): boolean {
  return conversationHistory
    .slice(-6)
    .some((message) => {
      const text = String(message?.text || "").trim();
      if (!text) {
        return false;
      }

      const normalized = normalizeSchedulingMessage(text);
      if (!normalized) {
        return false;
      }

      if (extractDate(normalized) || extractTime(normalized)) {
        return true;
      }

      return SCHEDULING_CONTEXT_HINTS.some((hint) => normalized.includes(hint));
    });
}

function inferSchedulingIntentFromConversation(
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): SchedulingIntent {
  const directIntent = detectSchedulingIntent(messageText);
  if (directIntent.detected) {
    return directIntent;
  }

  const requestedDate = extractDate(messageText.toLowerCase());
  const requestedTime = extractTime(messageText.toLowerCase());
  const signalIntent = inferSchedulingIntentFromSignals(messageText, requestedDate, requestedTime);
  if (signalIntent) {
    return signalIntent;
  }

  if ((requestedDate || requestedTime) && hasRecentSchedulingContext(conversationHistory)) {
    return {
      detected: true,
      type: "check_availability",
      requestedDate,
      requestedTime,
      confidence: 0.68,
    };
  }

  return directIntent;
}

function isAvailabilityLookupFollowUp(
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): boolean {
  if (!looksLikeAffirmativeReply(messageText)) {
    return false;
  }

  const recentAgentMessages = [...conversationHistory]
    .reverse()
    .filter((message) => message?.fromMe && String(message?.text || "").trim().length > 0)
    .slice(0, 4);

  return recentAgentMessages.some((message) => {
    const normalized = normalizeSchedulingMessage(String(message?.text || ""));
    if (!normalized) {
      return false;
    }

    return SCHEDULING_AVAILABILITY_PROMPT_HINTS.some((hint) => normalized.includes(hint));
  });
}

function isGenericAvailabilityLookup(messageText: string): boolean {
  const normalized = normalizeSchedulingMessage(String(messageText || ""));
  if (!normalized) {
    return false;
  }

  const hints = [
    "proximos horarios",
    "horarios disponiveis",
    "quais horarios",
    "qual horario",
    "tem horario",
    "tem vaga",
    "disponibilidade",
    "quero agendar",
    "vamos agendar",
    "bora agendar",
    "pode agendar",
  ];

  return hints.some((hint) => normalized.includes(hint));
}

function buildSchedulingDateReferenceWindow(daysAhead = 14): string {
  const lines: string[] = [];
  const base = getBrazilDateTime().date;

  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + offset);
    const isoDate = formatDate(date);
    const dayLabel = formatSchedulingDayLabel(isoDate);
    lines.push(`${isoDate} = ${dayLabel}`);
  }

  return lines.join("\n");
}

function normalizePlannerAction(value: string | null | undefined): SchedulingPlannerAction {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  switch (normalized) {
    case "QUOTE_ONLY":
    case "LOOKUP_NEXT_SLOTS":
    case "LOOKUP_DATE_AVAILABILITY":
    case "CHECK_EXACT_SLOT":
    case "REQUEST_SLOT_SELECTION":
    case "REQUEST_NAME":
    case "REQUEST_ADDRESS":
    case "READY_TO_BOOK":
    case "CANCEL_NEEDS_TARGET":
    case "CANCEL_READY":
      return normalized;
    default:
      return "IGNORE";
  }
}

function cleanPlannerJson(raw: string): string {
  return String(raw || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseSchedulingPlannerDecision(raw: string): SchedulingPlannerDecision | null {
  const cleaned = cleanPlannerJson(raw);
  if (!cleaned) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned) as Partial<SchedulingPlannerDecision>;
    return {
      shouldHandle: Boolean(parsed.shouldHandle),
      action: normalizePlannerAction(parsed.action),
      selectedServiceIds: Array.isArray(parsed.selectedServiceIds)
        ? parsed.selectedServiceIds.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      requestedDate: parsed.requestedDate || null,
      requestedTime: parsed.requestedTime || null,
      selectedDate: parsed.selectedDate || null,
      selectedTime: parsed.selectedTime || null,
      customerName: parsed.customerName || null,
      customerAddress: parsed.customerAddress || null,
      wantsSchedulingNow: Boolean(parsed.wantsSchedulingNow),
      wantsBookingDetails: Boolean(parsed.wantsBookingDetails),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reasoning: parsed.reasoning || null,
    };
  } catch (error) {
    console.error("[Scheduling] Planner JSON inválido:", error);
    return null;
  }
}

async function getClientActiveAppointments(
  userId: string,
  clientPhone: string,
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("user_id", userId)
    .eq("client_phone", clientPhone)
    .in("status", ["pending", "confirmed"])
    .order("appointment_date", { ascending: true });

  if (error) {
    console.error("[Scheduling] Error fetching active client appointments:", error);
    return [];
  }

  return ((data || []) as Appointment[])
    .sort((left, right) => {
      const leftKey = `${left.appointment_date || ""} ${normalizeSchedulingTimeValue(left.start_time)}`;
      const rightKey = `${right.appointment_date || ""} ${normalizeSchedulingTimeValue(right.start_time)}`;
      return leftKey.localeCompare(rightKey, "pt-BR");
    })
    .slice(0, 8);
}

/**
 * Deterministic ordinal slot extraction: handles "primeiro", "pode ser", "qualquer um",
 * "último", "segundo", "o de manhã", "o mais cedo" without needing an LLM call.
 * Parses the most recent assistant slot listing to find the referenced slot.
 */
function extractOrdinalSlotFromListing(
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[],
): { date: string; time: string } | null {
  const normalized = normalizeSchedulingMessage(String(messageText || ""));
  if (!normalized) return null;

  // If the client typed an explicit time, this is not an ordinal choice like
  // "primeiro" or "qualquer um" — let the exact/approximate slot selection
  // pipeline interpret the requested hour instead of forcing slot #1.
  if (extractTime(normalized)) {
    return null;
  }

  // Determine which ordinal position is requested
  const isFirst = normalized.includes("primeir")
    || normalized.includes("pode ser")
    || normalized.includes("qualquer um")
    || normalized.includes("qualquer hora")
    || normalized.includes("qualquer hor")
    || normalized.includes("mais cedo")
    || normalized.includes("o de manha");
  const isLast = normalized.includes("ultim")
    || normalized.includes("mais tarde")
    || normalized.includes("o de tarde");
  const isSecond = normalized.includes("segund");
  const isThird = normalized.includes("terceir");

  if (!isFirst && !isLast && !isSecond && !isThird) return null;

  // Find the most recent assistant message with slot listings
  const recentAssistantSlotListing = [...conversationHistory]
    .reverse()
    .find((m) => m?.fromMe && /\d{2}[h:]\d{2}/.test(String(m?.text || "")));

  if (!recentAssistantSlotListing?.text) return null;

  const text = String(recentAssistantSlotListing.text);

  // Extract all date+time pairs from the listing
  const slots: { date: string; time: string }[] = [];
  const dateReference = buildSchedulingDateReferenceWindow(14);

  // Find day/date mentions paired with times
  // Pattern: "DayName (DD/MM)" or just "DD/MM" followed by times
  const dayBlockPattern = /(?:(\d{2})\/(\d{2}))[^\d]*?(\d{2})[h:](\d{2})(?:[^\d]*?(?:,|ou|e)\s*(\d{2})[h:](\d{2}))?(?:[^\d]*?(?:,|ou|e)\s*(\d{2})[h:](\d{2}))?/g;
  let match;
  while ((match = dayBlockPattern.exec(text)) !== null) {
    const day = match[1];
    const month = match[2];
    const year = new Date().getFullYear();
    const dateStr = `${year}-${month}-${day}`;

    slots.push({ date: dateStr, time: `${match[3]}:${match[4]}` });
    if (match[5] && match[6]) {
      slots.push({ date: dateStr, time: `${match[5]}:${match[6]}` });
    }
    if (match[7] && match[8]) {
      slots.push({ date: dateStr, time: `${match[7]}:${match[8]}` });
    }
  }

  if (slots.length === 0) return null;

  let index = 0;
  if (isLast) index = slots.length - 1;
  else if (isSecond && slots.length > 1) index = 1;
  else if (isThird && slots.length > 2) index = 2;

  const selected = slots[index];
  if (selected) {
    console.log(`📅 [OrdinalSlot] Deterministic extraction: "${messageText}" → slot #${index + 1}: ${selected.date} ${selected.time}`);
    return selected;
  }

  return null;
}

/**
 * Chamada LLM dedicada para interpretar nome e endereço do cliente
 * quando a extração por cues falha (cliente envia dados soltos sem "nome:", "endereço:", etc).
 * Padrão OpenClaw: micro-LLM call com escopo mínimo.
 */
async function extractCustomerInfoViaLLM(
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[],
  requiresAddress: boolean,
): Promise<{ customerName?: string; customerAddress?: string } | null> {
  const recentAssistantMessages = [...conversationHistory]
    .reverse()
    .filter((m) => m?.fromMe && String(m?.text || "").trim().length > 0)
    .slice(0, 3)
    .map((m) => String(m.text).trim());

  const contextBlock = recentAssistantMessages.length > 0
    ? "ÚLTIMAS MENSAGENS DA ASSISTENTE:\n" + recentAssistantMessages.join("\n---\n")
    : "";

  const systemPrompt = [
    "Você é um extrator de dados de cliente. Analise a mensagem do cliente e extraia nome completo e endereço se presentes.",
    "O cliente pode enviar os dados SEM rótulos (sem 'nome:', sem 'endereço:'). Apenas os dados soltos.",
    "O cliente pode enviar tudo em uma única mensagem com quebras de linha.",
    "O cliente pode enviar nome, endereço e e-mail misturados.",
    "Se a assistente acabou de pedir o endereço, considere que a resposta do cliente é o endereço (mesmo sem 'Rua').",
    "Se a assistente acabou de pedir o nome, considere que a resposta do cliente é o nome.",
    "",
    "REGRAS:",
    "- Nome: geralmente 2-4 palavras, sem números, sem @.",
    "- Endereço: contém rua/avenida/av/número OU é uma localização que faz sentido como endereço de serviço.",
    "- E-mail: ignore, não extraia.",
    "- Se não conseguir identificar com certeza, retorne null para o campo.",
    "",
    contextBlock,
    "",
    `MENSAGEM DO CLIENTE: ${String(messageText).trim()}`,
    "",
    "Responda SOMENTE com JSON:",
    '{ "name": "Nome Completo" ou null, "address": "Endereço completo" ou null }',
    "",
    "Responda só com JSON. Sem explicações.",
  ].join("\n");

  try {
    void systemPrompt;
    const raw = "";
    console.log(`📅 [CustomerInfoLLM] Raw LLM response: ${raw}`);
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { name?: string | null; address?: string | null };
    const result: { customerName?: string; customerAddress?: string } = {};

    if (parsed.name && typeof parsed.name === "string" && parsed.name.trim().length >= 2) {
      result.customerName = parsed.name.trim();
    }
    if (parsed.address && typeof parsed.address === "string" && parsed.address.trim().length >= 3) {
      result.customerAddress = parsed.address.trim();
    }

    if (result.customerName || result.customerAddress) {
      console.log(`📅 [CustomerInfoLLM] Extracted: name=${result.customerName || "(none)"} address=${result.customerAddress || "(none)"} from "${messageText.substring(0, 80)}"`);
      return result;
    }

    return null;
  } catch (error) {
    console.error("[Scheduling] CustomerInfoLLM falhou:", error);
    return null;
  }
}

/**
 * Chamada LLM dedicada e focada para interpretar seleção de horário
 * quando regex falha (typos, linguagem natural como "08 e meia").
 * Padrão OpenClaw: micro-LLM call com escopo mínimo.
 */
async function extractSlotSelectionViaLLM(
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[],
): Promise<{ date: string; time: string } | null> {
  const recentAssistantSlotListing = [...conversationHistory]
    .reverse()
    .find((m) => m?.fromMe && String(m?.text || "").includes(":"));

  if (!recentAssistantSlotListing?.text) {
    return null;
  }

  const dateReference = buildSchedulingDateReferenceWindow(14);
  const systemPrompt = [
    "Você é um extrator de seleção de horário. Analise a mensagem do cliente e a lista de horários que a assistente ofereceu.",
    "O cliente pode ter digitado com ERROS DE DIGITAÇÃO (ex: 'qiunta' = quinta, 'terca' = terça, 'seguda' = segunda).",
    "O cliente pode usar linguagem natural (ex: '08 e meia' = 08:30, 'nove' = 09:00, 'duas da tarde' = 14:00).",
    "O cliente pode usar referências ORDINAIS ou RELATIVAS (ex: 'primeiro horário' = primeiro da lista, 'último' = último da lista, 'o mais cedo' = horário mais cedo, 'qualquer um' = primeiro da lista, 'o de manhã' = primeiro horário do período manhã), mas isso só vale quando NÃO houver uma hora explícita na mesma mensagem.",
    "",
    "REGRA: Resolva APENAS para horários que a assistente realmente ofereceu. Não invente horários.",
    "REGRA: Se a mensagem trouxer uma hora explícita (ex: '9h45', '14:00', '08 e meia'), só retorne um slot se essa hora corresponder de forma compatível a um horário realmente oferecido.",
    "REGRA: Se a mensagem trouxer uma hora explícita e ela NÃO corresponder a nenhum horário oferecido, responda { \"date\": null, \"time\": null }.",
    "REGRA: Só trate 'primeiro', 'pode ser', 'o primeiro disponível' ou 'qualquer um' como o PRIMEIRO horário quando a mensagem NÃO trouxer hora explícita.",
    "",
    "MAPA DE DATAS (São Paulo):",
    dateReference,
    "",
    "LISTA DE HORÁRIOS OFERECIDOS PELA ASSISTENTE:",
    String(recentAssistantSlotListing.text).trim(),
    "",
    `MENSAGEM DO CLIENTE: ${String(messageText).trim()}`,
    "",
    "Se o cliente está selecionando um horário da lista, responda SOMENTE JSON:",
    '{ "date": "YYYY-MM-DD", "time": "HH:MM" }',
    "",
    "Se NÃO está selecionando horário, responda:",
    '{ "date": null, "time": null }',
    "",
    "Responda só com JSON. Sem explicações.",
  ].join("\n");

  try {
    void systemPrompt;
    const raw = "";
    console.log(`📅 [SlotExtractLLM] Raw LLM response: ${raw}`);
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { date?: string | null; time?: string | null };
    if (parsed.date && parsed.time && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) && /^\d{2}:\d{2}$/.test(parsed.time)) {
      console.log(`📅 [SlotExtractLLM] Extracted: date=${parsed.date} time=${parsed.time} from "${messageText}"`);
      return { date: parsed.date, time: parsed.time };
    }

    return null;
  } catch (error) {
    console.error("[Scheduling] SlotExtractLLM falhou:", error);
    return null;
  }
}

function buildSchedulingPlannerSystemPrompt(input: {
  messageText: string;
  conversationHistory: SchedulingTurnHistoryMessage[];
  config: SchedulingConfig;
  serviceBundle: ResolvedSchedulingServiceBundle;
  activeServices: SchedulingServiceRecord[];
  activeAppointments: Appointment[];
  strictSchedulingRecovery?: boolean;
}): string {
  const historyLines = input.conversationHistory
    .slice(-12)
    .map((message) => `${message.fromMe ? "ASSISTENTE" : "CLIENTE"}: ${String(message.text || "").trim()}`)
    .filter(Boolean)
    .join("\n");

  const serviceLines = input.serviceBundle.selectedServices.length > 0
    ? input.serviceBundle.selectedServices.map((service) =>
        `- ${service.name} | ${service.durationMinutes} min | ${service.price !== null ? `R$ ${service.price.toFixed(2).replace(".", ",")}` : "preço não informado"}`,
      ).join("\n")
    : `- ${input.config.service_name}`;

  const appointmentLines = input.activeAppointments.length > 0
    ? input.activeAppointments
        .map((appointment) =>
          `- ${appointment.appointment_date} ${normalizeSchedulingTimeValue(appointment.start_time)} | ${appointment.service_name || "agendamento"} | status=${appointment.status}`,
        )
        .join("\n")
    : "- nenhum";

  const catalogLines = input.activeServices.length > 0
    ? input.activeServices
        .map((service) =>
          `- id=${service.id} | ${service.name} | ${Number(service.duration_minutes || 0)} min | ${service.price !== null && service.price !== undefined ? `R$ ${Number(service.price).toFixed(2).replace(".", ",")}` : "preco nao informado"} | endereco_obrigatorio=${service.requires_customer_address ? "sim" : "nao"}`,
        )
        .join("\n")
    : "- nenhum";

  return [
    "Você é um planner de agendamento com raciocínio de orquestrador LLM no estilo OpenClaw.",
    "Sua função é interpretar a conversa e devolver SOMENTE JSON válido.",
    "Você não inventa horários. Você decide quando o executor deve usar as ferramentas de agenda e quando deve apenas continuar a conversa com base na memória já validada.",
    "Use contexto e continuidade da conversa. Não use atalho de palavra-chave.",
    "",
    "REGRA CRÍTICA: NUNCA invente disponibilidade e NUNCA pule a primeira consulta à agenda real.",
    "- Quando o cliente pedir horários, datas ou disponibilidade para QUALQUER dia, a ação DEVE ser LOOKUP_NEXT_SLOTS ou LOOKUP_DATE_AVAILABILITY ou CHECK_EXACT_SLOT.",
    "- NUNCA assuma que um horário está livre sem consultar. O executor é quem verifica a agenda real (Google Calendar + agendamentos internos).",
    "- Mesmo para dias da semana genéricos ('segunda', 'terça'), use LOOKUP_DATE_AVAILABILITY com a data ISO correspondente.",
    "- Se a assistente JA consultou a agenda real e JA ofereceu horários válidos nesta conversa, e o cliente escolher um desses horários, NÃO peça LOOKUP_* de novo só para repetir a mesma busca.",
    "- Nesse caso, preserve a continuidade: use REQUEST_NAME, REQUEST_ADDRESS ou READY_TO_BOOK conforme o que ainda faltar.",
    "- A validação final de conflito acontece no executor quando ele tenta registrar o agendamento. Só volte a consultar a agenda se o cliente mudar dia/horário ou se o executor disser que houve conflito.",
    "",
    "Se a assistente acabou de oferecer verificar disponibilidade e o cliente confirmou, a ação correta é LOOKUP_NEXT_SLOTS.",
    "Se o cliente respondeu pagamento, CPF/CNPJ, nome, endereço ou outro dado operacional e ainda não existe horário confirmado no histórico, a ação correta é LOOKUP_NEXT_SLOTS.",
    "Se a assistente já coletou nome/endereço e o cliente acabou de responder a última pendência administrativa, o próximo passo é consultar agenda real antes de falar qualquer horário.",
    "Se a assistente já confirmou um horário específico e pediu nome/endereço, e o cliente respondeu com esses dados, a ação correta é READY_TO_BOOK.",
    "Se o cliente trouxe dados pessoais/endereço sem ter escolhido um horário real antes, a ação correta é REQUEST_SLOT_SELECTION.",
    "Se o cliente quer cancelar e o horário já está claro no contexto, use CANCEL_READY. Se não estiver claro, use CANCEL_NEEDS_TARGET.",
    "REGRA DE HORÁRIO APROXIMADO:",
    "- Quando o cliente citar um horário aproximado (ex: 'as 09', 'as 10', 'as 14'), e a assistente acabou de oferecer uma lista de horários, resolva para o horário MAIS PRÓXIMO da lista oferecida.",
    "- Exemplo: se a assistente ofereceu 09:45 e o cliente disse 'quarta as 09', requestedTime deve ser '09:45' (não '09:00').",
    "- Exemplo: se a assistente ofereceu 08:30 e 09:45, e o cliente disse 'as 9', requestedTime deve ser '09:45'.",
    "- Se a assistente ofereceu horários reais de um único dia e o cliente responder apenas com a hora (ex: '9h45', 'pode ser 9h45', 'pode agendar às 9h45'), trate isso como escolha do slot já oferecido nesse mesmo dia.",
    "- Sempre prefira o horário que foi realmente oferecido ao cliente.",
    "",
    "Quando houver dia da semana citado, converta para a data ISO usando a referência abaixo.",
    "Se a conversa não for de agendamento, use IGNORE com shouldHandle=false.",
    "Voce tambem precisa identificar os servicos ativos em contexto e devolver selectedServiceIds.",
    "Se a conversa ainda estiver em fase de orcamento ou explicacao do servico, use QUOTE_ONLY.",
    "So consulte agenda quando o cliente realmente quiser agendar ou quando o fluxo de agendamento ja estiver em andamento.",
    "Se o cliente apenas descreveu o servico, pediu valor, pediu explicacao ou ainda nao aceitou agendar, wantsSchedulingNow deve ser false.",
    "Se o cliente pediu disponibilidade, pediu para agendar, escolheu um horario oferecido ou esta completando nome/endereco depois de um horario validado, wantsSchedulingNow deve ser true.",
    "Se a ultima mensagem do cliente for apenas o nome e o pacote exigir endereco, a acao correta e REQUEST_ADDRESS.",
    "Mantenha os mesmos selectedServiceIds em respostas operacionais curtas como horario, nome, endereco e pagamento.",
    "",
    "REGRA DE COLETA DE ENDEREÇO:",
    "- Se o serviço tem endereco_obrigatorio=sim, o endereço DEVE ser coletado ANTES de usar READY_TO_BOOK.",
    "- Se o endereço ainda não foi informado e o horário já foi confirmado, use REQUEST_ADDRESS.",
    "- Não pule a coleta de endereço para serviços que exigem deslocamento.",
    "",
    "REGRA DO TELEFONE:",
    "- O número do celular do cliente JÁ ESTÁ na conversa (é o número que está falando). NÃO precisa pedir.",
    ...(input.strictSchedulingRecovery
      ? [
          "",
          "MODO DE RECUPERAÇÃO:",
          "- Há forte chance de o fluxo já estar em andamento.",
          "- Se o histórico mostrar orçamento + coleta de dados + pagamento/confirmacao operacional, NÃO use IGNORE: consulte a agenda real com LOOKUP_NEXT_SLOTS.",
          "- Exemplo: cliente respondeu 'Pix' depois de passar endereço e o assistente ainda não confirmou um horário real => LOOKUP_NEXT_SLOTS.",
          "- Exemplo: cliente respondeu apenas o nome/endereço depois que um horário já estava validado => READY_TO_BOOK.",
        ]
      : []),
    "",
    "FORMATO EXATO:",
    "{",
    '  "shouldHandle": true,',
    '  "action": "QUOTE_ONLY",',
    '  "selectedServiceIds": ["svc-1"],',
    '  "requestedDate": null,',
    '  "requestedTime": null,',
    '  "selectedDate": null,',
    '  "selectedTime": null,',
    '  "customerName": null,',
    '  "customerAddress": null,',
    '  "wantsSchedulingNow": false,',
    '  "wantsBookingDetails": false,',
    '  "confidence": 0.0,',
    '  "reasoning": "curta"',
    "}",
    "",
    `DATA ATUAL (São Paulo): ${getBrazilDateTime().dateStr}`,
    "MAPA DE DATAS:",
    buildSchedulingDateReferenceWindow(),
    "",
    "SERVIÇOS EM CONTEXTO:",
    serviceLines,
    "",
    "CATALOGO DE SERVICOS ATIVOS:",
    catalogLines,
    "",
    `TOTAL DO PACOTE: ${input.serviceBundle.totalDurationMinutes} min${input.serviceBundle.totalPrice !== null ? ` | R$ ${input.serviceBundle.totalPrice.toFixed(2).replace(".", ",")}` : ""}`,
    `ENDEREÇO OBRIGATÓRIO: ${input.serviceBundle.requiresCustomerAddress ? "sim" : "não"}`,
    "",
    "AGENDAMENTOS ATIVOS DO CLIENTE:",
    appointmentLines,
    "",
    "ÚLTIMAS MENSAGENS:",
    historyLines || "- sem histórico",
    "",
    `MENSAGEM ATUAL DO CLIENTE: ${String(input.messageText || "").trim()}`,
    "",
    "Responda só com JSON.",
  ].join("\n");
}

async function callSchedulingPlanner(
  userId: string,
  clientPhone: string,
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[],
  config: SchedulingConfig,
  serviceBundle: ResolvedSchedulingServiceBundle,
  activeServices: SchedulingServiceRecord[],
): Promise<SchedulingPlannerDecision | null> {
  if (schedulingPlannerTestDependencies?.callPlanner) {
    return schedulingPlannerTestDependencies.callPlanner({
      userId,
      clientPhone,
      messageText,
      conversationHistory,
      config,
      serviceBundle,
      activeServices,
    });
  }

  const activeAppointments = await getClientActiveAppointments(userId, clientPhone);

  for (const strictSchedulingRecovery of [false, true]) {
    const systemPrompt = buildSchedulingPlannerSystemPrompt({
      messageText,
      conversationHistory,
      config,
      serviceBundle,
      activeServices,
      activeAppointments,
      strictSchedulingRecovery,
    });

    try {
      void systemPrompt;
      const raw = "";
      const parsed = parseSchedulingPlannerDecision(raw);
      console.log(`📅 [Planner] action=${parsed?.action} shouldHandle=${parsed?.shouldHandle} wantsSchedulingNow=${parsed?.wantsSchedulingNow} recovery=${strictSchedulingRecovery} reasoning=${parsed?.reasoning}`);

      if (parsed?.shouldHandle && parsed.action !== "IGNORE") {
        return parsed;
      }

      if (strictSchedulingRecovery) {
        return parsed;
      }
    } catch (error) {
      console.error("[Scheduling] Planner LLM falhou:", error);
      if (strictSchedulingRecovery) {
        return null;
      }
    }
  }

  return null;
}

function buildSchedulingExecutionGatePrompt(input: {
  messageText: string;
  conversationHistory: SchedulingTurnHistoryMessage[];
  plannerDecision: SchedulingPlannerDecision;
  serviceBundle: ResolvedSchedulingServiceBundle;
  activeServices: SchedulingServiceRecord[];
}): string {
  const historyLines = input.conversationHistory
    .slice(-10)
    .map((message) => `${message.fromMe ? "ASSISTENTE" : "CLIENTE"}: ${String(message.text || "").trim()}`)
    .filter(Boolean)
    .join("\n");

  const catalogLines = input.activeServices.length > 0
    ? input.activeServices
        .map((service) => `- id=${service.id} | ${service.name}`)
        .join("\n")
    : "- nenhum";

  const selectedLines = input.serviceBundle.selectedServices.length > 0
    ? input.serviceBundle.selectedServices.map((service) => `- ${service.name}`).join("\n")
    : "- nenhum";

  return [
    "Você é um gate semântico do orquestrador de agendamento.",
    "Sua função é decidir se o executor pode assumir a resposta deste turno ou se deve deixar a resposta seguir o prompt livre do cliente.",
    "Responda SOMENTE JSON válido.",
    "",
    "LIBERE allowSchedulingExecution=true apenas quando houver uma destas situações:",
    "- o cliente pediu para agendar",
    "- o cliente pediu horários, datas ou disponibilidade",
    "- o cliente escolheu um horário já oferecido",
    "- o cliente está continuando um fluxo de agendamento já aberto com dados como nome/endereço depois de um horário validado",
    "",
    "BLOQUEIE allowSchedulingExecution=false quando o cliente apenas:",
    "- cumprimentou",
    "- descreveu o serviço ou problema",
    "- pediu orçamento, preço, explicação ou detalhes",
    "- ainda não demonstrou querer consultar agenda agora",
    "",
    "Se houver dúvida entre orçamento e agenda no primeiro turno, bloqueie.",
    "O gate deve ser conservador: sem intenção clara de agenda, não deixe o executor responder.",
    "",
    "FORMATO EXATO:",
    '{ "allowSchedulingExecution": false, "reasoning": "curta" }',
    "",
    "DECISÃO DO PLANNER:",
    JSON.stringify({
      action: input.plannerDecision.action,
      wantsSchedulingNow: Boolean(input.plannerDecision.wantsSchedulingNow),
      requestedDate: input.plannerDecision.requestedDate || null,
      requestedTime: input.plannerDecision.requestedTime || null,
      selectedDate: input.plannerDecision.selectedDate || null,
      selectedTime: input.plannerDecision.selectedTime || null,
      reasoning: input.plannerDecision.reasoning || null,
    }),
    "",
    "SERVIÇOS RESOLVIDOS NO CONTEXTO:",
    selectedLines,
    "",
    "CATÁLOGO DE SERVIÇOS:",
    catalogLines,
    "",
    "ÚLTIMAS MENSAGENS:",
    historyLines || "- sem histórico",
    "",
    `MENSAGEM ATUAL DO CLIENTE: ${String(input.messageText || "").trim()}`,
    "",
    "Responda só com JSON.",
  ].join("\n");
}

async function confirmSchedulingExecutionGate(
  userId: string,
  clientPhone: string,
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[],
  plannerDecision: SchedulingPlannerDecision,
  serviceBundle: ResolvedSchedulingServiceBundle,
  activeServices: SchedulingServiceRecord[],
): Promise<boolean> {
  if (schedulingPlannerTestDependencies?.callSchedulingGate) {
    const mockedDecision = await schedulingPlannerTestDependencies.callSchedulingGate({
      userId,
      clientPhone,
      messageText,
      conversationHistory,
      plannerDecision,
      serviceBundle,
      activeServices,
    });
    if (typeof mockedDecision === "boolean") {
      return mockedDecision;
    }
  }

  if (schedulingPlannerTestDependencies?.callPlanner) {
    return true;
  }

  try {
    void userId;
    void clientPhone;
    void messageText;
    void conversationHistory;
    void plannerDecision;
    void serviceBundle;
    void activeServices;
    return false;
  } catch (error) {
    console.error("[Scheduling] Gate semântico falhou:", error);
    return false;
  }
}

function buildSchedulingServiceContextCandidates(
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): string[] {
  // Only include CUSTOMER messages — assistant messages listing services
  // must not be treated as customer intent (prevents false service resolution
  // when the AI greeting lists available services).
  const recentTexts = conversationHistory
    .filter((message) => !message?.fromMe)
    .map((message) => String(message?.text || "").trim())
    .filter(Boolean)
    .slice(-10);

  return [messageText, ...recentTexts]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function buildSchedulingServiceContextText(
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): string {
  return buildSchedulingServiceContextCandidates(messageText, conversationHistory).join(" | ");
}

function assistantJustAskedForAddress(
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): boolean {
  // Check last 3 assistant messages (handles split messages where address request
  // is in part 1 but part 2 overwrites "most recent" detection).
  const recentAssistantMessages = [...conversationHistory]
    .reverse()
    .filter((message) => message?.fromMe && String(message?.text || "").trim().length > 0)
    .slice(0, 3);

  for (const msg of recentAssistantMessages) {
    const msgText = String(msg.text);
    // Slot listings are long (300+ chars) and just mention address as a reminder;
    // real address prompts are short (under 200 chars).
    if (msgText.length > 200) {
      continue;
    }

    const normalized = normalizeSchedulingMessage(msgText);
    if (
      normalized.includes("nome completo")
      || normalized.includes("seu nome")
      || normalized.includes("preciso do seu nome")
      || normalized.includes("nome para registrar")
      || normalized.includes("nome pra finalizar")
    ) {
      return false;
    }

    if (
      normalized.includes("endereco completo")
      || normalized.includes("qual o endereco")
      || normalized.includes("endereco onde")
      || normalized.includes("preciso do endereco")
      || normalized.includes("rua")
      || normalized.includes("numero")
      || normalized.includes("bairro")
    ) {
      return true;
    }
  }

  return false;
}

function findLastAssistantSchedulingConfirmationPrompt(
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): string | null {
  // Check last 3 assistant messages (handles split messages).
  const recentAssistantMessages = [...conversationHistory]
    .reverse()
    .filter((message) => message?.fromMe && String(message?.text || "").trim().length > 0)
    .slice(0, 3);

  for (const msg of recentAssistantMessages) {
    const normalized = normalizeSchedulingMessage(String(msg.text));
    if (normalized.includes("nome completo") || normalized.includes("seu nome")) {
      return String(msg.text);
    }
  }

  return null;
}

function hasRecentAssistantSchedulingChoicePrompt(
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): boolean {
  const recentAssistantMessages = [...conversationHistory]
    .reverse()
    .filter((message) => message?.fromMe && String(message?.text || "").trim().length > 0)
    .slice(0, 3);

  if (recentAssistantMessages.length === 0) {
    return false;
  }

  for (const recentAssistantMessage of recentAssistantMessages) {
    const text = String(recentAssistantMessage.text);
    const normalized = normalizeSchedulingMessage(text);

    // Original deterministic patterns
    if (normalized.includes("qual desses horarios funciona melhor")
      || normalized.includes("depois que voce escolher o horario")) {
      return true;
    }

    if (
      normalized.includes("horarios disponiveis")
      && normalized.includes("proximo passo cliente escolhe um horario")
    ) {
      return true;
    }

    // Humanized variants the LLM may produce
    if (normalized.includes("qual desses horarios")
      || normalized.includes("qual deles funciona")
      || normalized.includes("qual deles fica")
      || normalized.includes("qual deles e melhor")
      || normalized.includes("qual horario e melhor")
      || normalized.includes("qual horario funciona")
      || normalized.includes("qual funciona melhor")
      || normalized.includes("escolha um dos horarios")
      || normalized.includes("escolha um horario")
      || normalized.includes("qual desses dias")
      || normalized.includes("qual dia funciona")
      || normalized.includes("qual dia e melhor")
      || normalized.includes("qual dia fica melhor")) {
      return true;
    }

    // Robust fallback: if assistant message contains 3+ distinct time references,
    // it's a slot listing regardless of phrasing.
    // Matches both "08:30" (HH:MM) and "08h30" (HHhMM) formats
    const timeMatches = text.match(/\d{2}[h:]\d{2}/g);
    if (timeMatches && new Set(timeMatches).size >= 3) {
      return true;
    }
    // For multi-service where only 1 slot/day exists, check for day+time combinations
    // (e.g., "Segunda (23/03) às 08h30" - multiple days but same time)
    const dayTimeMatches = text.match(/(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)[\s\S]{0,30}?\d{2}[h:]\d{2}/gi);
    if (dayTimeMatches && dayTimeMatches.length >= 2) {
      return true;
    }
  }

  return false;
}

function findRecentAssistantSuggestedSchedulingSlot(
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): { date: string; time: string } | null {
  const recentAssistantMessages = [...conversationHistory]
    .reverse()
    .filter((message) => message?.fromMe && String(message?.text || "").trim().length > 0)
    .slice(0, 3);

  for (const recentAssistantMessage of recentAssistantMessages) {
    const text = String(recentAssistantMessage.text || "");
    const normalized = normalizeSchedulingMessage(text);
    if (!normalized) {
      continue;
    }

    if (
      !normalized.includes("horario")
      && !normalized.includes("agenda")
      && !normalized.includes("agendamento")
      && !normalized.includes("disponivel")
    ) {
      continue;
    }

    const date = extractDate(normalized);
    const time = extractTime(normalized);
    if (!date || !time) {
      continue;
    }

    const timeMatches = text.match(/\d{2}[h:]\d{2}/g);
    if (timeMatches && new Set(timeMatches).size > 1) {
      continue;
    }

    return { date, time };
  }

  return null;
}

export function extractOrdinalSlotFromListingForTests(
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[],
): { date: string; time: string } | null {
  return extractOrdinalSlotFromListing(messageText, conversationHistory);
}

function findRecentRequestedSchedulingSlot(
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): { requestedDate: string; requestedTime: string } | null {
  const recentCustomerMessages = [...conversationHistory]
    .reverse()
    .filter((message) => !message?.fromMe && String(message?.text || "").trim().length > 0);

  for (const message of recentCustomerMessages) {
    const intent = detectSchedulingIntent(String(message.text || ""));
    if (!intent.detected || !intent.requestedDate || !intent.requestedTime) {
      continue;
    }

    if (intent.type === "book_appointment" || intent.type === "reschedule" || intent.type === "check_availability") {
      return {
        requestedDate: intent.requestedDate,
        requestedTime: intent.requestedTime,
      };
    }
  }

  return null;
}

function cleanSchedulingCustomerField(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^[\s,.:;-]+/, "")
    .replace(/[\s,.:;-]+$/, "")
    .trim();
}

function findSchedulingFieldPosition(messageText: string, cues: string[]): { index: number; cue: string } | null {
  const lowerMessage = String(messageText || "").toLocaleLowerCase("pt-BR");
  let bestMatch: { index: number; cue: string } | null = null;

  for (const cue of cues) {
    const index = lowerMessage.indexOf(cue);
    if (index < 0) {
      continue;
    }

    if (!bestMatch || index < bestMatch.index) {
      bestMatch = { index, cue };
    }
  }

  return bestMatch;
}

function extractSchedulingCustomerInfo(
  messageText: string,
  requiresCustomerAddress: boolean,
): { customerName?: string; customerAddress?: string } {
  const originalText = String(messageText || "").trim();
  if (!originalText) {
    return {};
  }

  const nameCue = findSchedulingFieldPosition(originalText, [
    "meu nome completo é ",
    "meu nome completo e ",
    "meu nome é ",
    "meu nome e ",
    "no nome ",
    "nome completo é ",
    "nome completo e ",
    "nome é ",
    "nome e ",
    "nome: ",
  ]);

  const addressCue = findSchedulingFieldPosition(originalText, [
    "e o endereco completo é ",
    "e o endereco completo e ",
    "o endereco completo é ",
    "o endereco completo e ",
    "endereco completo é ",
    "endereco completo e ",
    "e o endereco é ",
    "e o endereco e ",
    "o endereco é ",
    "o endereco e ",
    "endereco é ",
    "endereco e ",
    "endereco: ",
  ]);

  let customerName: string | undefined;
  let customerAddress: string | undefined;

  if (nameCue) {
    const nameStart = nameCue.index + nameCue.cue.length;
    const nameEnd = addressCue && addressCue.index > nameStart ? addressCue.index : originalText.length;
    customerName = cleanSchedulingCustomerField(originalText.slice(nameStart, nameEnd));
  }

  if (addressCue) {
    const addressStart = addressCue.index + addressCue.cue.length;
    customerAddress = cleanSchedulingCustomerField(originalText.slice(addressStart));
  } else if (requiresCustomerAddress) {
    const lowered = originalText.toLocaleLowerCase("pt-BR");
    const looksLikeStandaloneAddress = lowered.startsWith("rua ")
      || lowered.startsWith("avenida ")
      || lowered.startsWith("av ")
      || lowered.startsWith("travessa ")
      || lowered.startsWith("alameda ")
      || lowered.startsWith("estrada ");

    if (looksLikeStandaloneAddress) {
      customerAddress = cleanSchedulingCustomerField(originalText);
    }
  }

  return {
    customerName: customerName || undefined,
    customerAddress: customerAddress || undefined,
  };
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getSchedulingAddressPrompt(): string {
  return "DADO NECESSÁRIO: endereço completo do local onde será realizado o serviço";
}

function getSchedulingNamePrompt(): string {
  return "DADO NECESSÁRIO: nome completo do cliente para registrar no agendamento";
}

function messageLooksLikeStandaloneSchedulingName(messageText: string): boolean {
  const trimmed = String(messageText || "").trim();
  if (!trimmed) {
    return false;
  }

  const normalized = normalizeSchedulingMessage(trimmed);
  if (!normalized) {
    return false;
  }

  if (["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "sim", "nao", "não"].includes(normalized)) {
    return false;
  }

  const tokens = tokenizeSchedulingMessage(trimmed);
  if (tokens.length === 0 || tokens.length > 5) {
    return false;
  }

  if (tokens.some((token) => /\d/.test(token))) {
    return false;
  }

  const addressPrefixes = ["rua", "avenida", "av", "travessa", "alameda", "estrada"];
  if (addressPrefixes.includes(tokens[0])) {
    return false;
  }

  return tokens.every((token) => token.length >= 1);
}

function buildDeterministicSchedulingCreationReply(
  appointmentDate: string,
  appointmentTime: string,
  clientName: string,
  serviceName: string,
  customerAddress?: string,
  options?: {
    approvalToken?: string;
  },
): string {
  const tagParts = [
    `DATA=${appointmentDate}`,
    `HORA=${appointmentTime}`,
    `NOME="${clientName}"`,
    `SERVICO="${serviceName}"`,
  ];

  if (customerAddress) {
    tagParts.push(`ENDERECO="${customerAddress}"`);
  }

  if (options?.approvalToken) {
    tagParts.push(`CONFIRMACAO_DIA=${options.approvalToken}`);
  }

  const dateLabel = formatSchedulingDayLabel(appointmentDate);
  const normalizedTime = normalizeSchedulingTimeValue(appointmentTime);
  return `[AGENDAR: ${tagParts.join(", ")}]\nAGENDAMENTO CONFIRMADO: ${dateLabel} às ${normalizedTime} — ${serviceName} para ${clientName} ✅`;
}

function formatSchedulingDayLabel(date: string): string {
  const dateObj = new Date(`${date}T12:00:00`);
  const dayNames = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  const dayName = dayNames[dateObj.getDay()] || date;
  const formattedDate = `${dateObj.getDate().toString().padStart(2, "0")}/${(dateObj.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
  return `${dayName} (${formattedDate})`;
}

function formatSchedulingTimeChoices(times: string[]): string {
  const normalizedTimes = times
    .map((time) => normalizeSchedulingTimeValue(time))
    .filter(Boolean);

  if (normalizedTimes.length === 0) {
    return "";
  }

  if (normalizedTimes.length === 1) {
    return normalizedTimes[0];
  }

  if (normalizedTimes.length === 2) {
    return `${normalizedTimes[0]} ou ${normalizedTimes[1]}`;
  }

  return `${normalizedTimes.slice(0, -1).join(", ")} ou ${normalizedTimes[normalizedTimes.length - 1]}`;
}

function buildSchedulingNextSlotsReply(
  slotsData: NextAvailableDaySlots[],
  options?: {
    requiresCustomerAddress?: boolean;
    unavailableDate?: string;
    confirmedDate?: string;
    confirmedTime?: string;
    requestConfirmationDetails?: boolean;
  },
): string | null {
  const {
    requiresCustomerAddress = false,
    unavailableDate,
    confirmedDate,
    confirmedTime,
    requestConfirmationDetails = false,
  } = options || {};
  const normalizedConfirmedTime = confirmedTime ? normalizeSchedulingTimeValue(confirmedTime) : "";

  if (confirmedDate && normalizedConfirmedTime) {
    const dateLabel = formatSchedulingDayLabel(confirmedDate);
    const confirmLines: string[] = [
      `HORÁRIO CONFIRMADO: ${dateLabel} às ${normalizedConfirmedTime}`,
      `STATUS: disponível`,
    ];
    if (requestConfirmationDetails) {
      confirmLines.push(`DADOS NECESSÁRIOS: nome completo do cliente${requiresCustomerAddress ? " e endereço do local" : ""}`);
    } else if (requiresCustomerAddress) {
      confirmLines.push(`DADO NECESSÁRIO: endereço do local`);
    }
    return confirmLines.join("\n");
  }

  const lines: string[] = [];

  if (unavailableDate) {
    lines.push(`DATA INDISPONÍVEL: ${formatSchedulingDayLabel(unavailableDate)} — sem horário para esse atendimento`);
  }

  if (!slotsData.length) {
    lines.push("DISPONIBILIDADE: nenhum horário encontrado nos próximos dias pelo sistema online");
    lines.push("ORIENTAÇÃO: sugerir contato direto para verificar outras possibilidades");
    return lines.join("\n").trim() || null;
  }

  lines.push("HORÁRIOS DISPONÍVEIS:");

  for (const dayData of slotsData) {
    const timeChoices = formatSchedulingTimeChoices(dayData.slots.map((slot) => slot.start));
    if (!timeChoices) {
      continue;
    }
    lines.push(`- ${formatSchedulingDayLabel(dayData.date)}: ${timeChoices}`);
  }

  lines.push("PRÓXIMO PASSO: cliente escolhe um horário");

  if (requiresCustomerAddress) {
    lines.push("DADO NECESSÁRIO: endereço do local");
  }

  return lines.join("\n").trim();
}

function buildSchedulingNextSlotsReplyWithMemory(
  userId: string,
  clientPhone: string,
  serviceBundle: ResolvedSchedulingServiceBundle,
  slotsData: NextAvailableDaySlots[],
  options?: {
    requiresCustomerAddress?: boolean;
    unavailableDate?: string;
    confirmedDate?: string;
    confirmedTime?: string;
    requestConfirmationDetails?: boolean;
  },
): string | null {
  if (options?.confirmedDate && options?.confirmedTime) {
    clearRememberedSchedulingOfferedSlots(userId, clientPhone);
    clearValidatedSlotOffer(userId, clientPhone);
  } else if (slotsData.length > 0) {
    rememberSchedulingOfferedSlots(userId, clientPhone, serviceBundle, slotsData);
    const singleDayWithSlots = slotsData.find((day) => day.slots.length > 0);
    const totalSlotCount = slotsData.reduce((count, day) => count + day.slots.length, 0);
    if (totalSlotCount === 1 && singleDayWithSlots?.slots[0]) {
      rememberValidatedSlotOffer(
        userId,
        clientPhone,
        singleDayWithSlots.date,
        singleDayWithSlots.slots[0].start,
        serviceBundle,
      );
    } else {
      clearValidatedSlotOffer(userId, clientPhone);
    }
  } else {
    clearRememberedSchedulingOfferedSlots(userId, clientPhone);
    clearValidatedSlotOffer(userId, clientPhone);
  }

  return buildSchedulingNextSlotsReply(slotsData, options);
}

async function buildSchedulingSlotSelectionReminderReply(input: {
  userId: string;
  clientPhone: string;
  serviceBundle: ResolvedSchedulingServiceBundle;
  rememberedState: SchedulingConversationState | null;
  leadingText: string;
}): Promise<string> {
  const rememberedSlotsData = buildRememberedSchedulingSlotsData(
    input.rememberedState,
    input.serviceBundle,
  );

  if (rememberedSlotsData.length > 0) {
    const rememberedReply = buildSchedulingNextSlotsReply(rememberedSlotsData, {
      requiresCustomerAddress: input.serviceBundle.requiresCustomerAddress,
    });
    return rememberedReply
      ? `${input.leadingText}\n${rememberedReply}`
      : input.leadingText;
  }

  const nextSlots = await getNextAvailableSlots(input.userId, 1, {
    serviceDurationMinutes: input.serviceBundle.totalDurationMinutes,
  });
  const nextSlotsReply = buildSchedulingNextSlotsReplyWithMemory(
    input.userId,
    input.clientPhone,
    input.serviceBundle,
    nextSlots,
    {
      requiresCustomerAddress: input.serviceBundle.requiresCustomerAddress,
    },
  );

  return nextSlotsReply
    ? `${input.leadingText}\n${nextSlotsReply}`
    : input.leadingText;
}

function buildSameDayApprovalKey(userId: string, clientPhone: string, date: string): string {
  return `${userId}:${clientPhone}:${date}`;
}

function rememberSameDayRebookingApproval(userId: string, clientPhone: string, date: string): void {
  sameDayRebookingApprovals.set(buildSameDayApprovalKey(userId, clientPhone, date), {
    date,
    expiresAt: Date.now() + SAME_DAY_REBOOK_APPROVAL_TTL_MS,
  });
}

function hasSameDayRebookingApproval(userId: string, clientPhone: string, date: string): boolean {
  const key = buildSameDayApprovalKey(userId, clientPhone, date);
  const approval = sameDayRebookingApprovals.get(key);
  if (!approval) {
    return false;
  }
  if (approval.expiresAt <= Date.now()) {
    sameDayRebookingApprovals.delete(key);
    return false;
  }
  return true;
}

function consumeSameDayRebookingApproval(userId: string, clientPhone: string, date: string): void {
  sameDayRebookingApprovals.delete(buildSameDayApprovalKey(userId, clientPhone, date));
}

function findPendingSameDayApprovalDate(userId: string, clientPhone: string): string | null {
  const prefix = `${userId}:${clientPhone}:`;
  for (const [key, approval] of sameDayRebookingApprovals.entries()) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    if (approval.expiresAt <= Date.now()) {
      sameDayRebookingApprovals.delete(key);
      continue;
    }
    return approval.date;
  }
  return null;
}

function buildValidatedSlotOfferKey(userId: string, clientPhone: string): string {
  return `${userId}:${clientPhone}`;
}

function rememberValidatedSlotOffer(
  userId: string,
  clientPhone: string,
  date: string,
  time: string,
  serviceBundle: ResolvedSchedulingServiceBundle,
): void {
  validatedSlotOffers.set(buildValidatedSlotOfferKey(userId, clientPhone), {
    date,
    time,
    expiresAt: Date.now() + VALIDATED_SLOT_OFFER_TTL_MS,
    serviceBundle,
  });
}

function getValidatedSlotOffer(userId: string, clientPhone: string): ValidatedSlotOffer | null {
  const key = buildValidatedSlotOfferKey(userId, clientPhone);
  const offer = validatedSlotOffers.get(key);
  if (!offer) {
    return null;
  }
  if (offer.expiresAt <= Date.now()) {
    validatedSlotOffers.delete(key);
    return null;
  }
  return offer;
}

function markValidatedSlotOfferAccepted(userId: string, clientPhone: string): ValidatedSlotOffer | null {
  const offer = getValidatedSlotOffer(userId, clientPhone);
  if (!offer) {
    return null;
  }
  offer.acceptedAt = Date.now();
  offer.expiresAt = Date.now() + VALIDATED_SLOT_OFFER_TTL_MS;
  validatedSlotOffers.set(buildValidatedSlotOfferKey(userId, clientPhone), offer);
  return offer;
}

function rememberAcceptedValidatedSlotOffer(
  userId: string,
  clientPhone: string,
  offer: ValidatedSlotOffer,
  patch?: Partial<SchedulingConversationState>,
): SchedulingConversationState | null {
  const nextState = rememberSchedulingConversationState(userId, clientPhone, {
    confirmedDate: offer.date,
    confirmedTime: offer.time,
    selectedDate: offer.date,
    selectedTime: offer.time,
    selectedServices: offer.serviceBundle.selectedServices,
    totalDurationMinutes: offer.serviceBundle.totalDurationMinutes,
    totalPrice: offer.serviceBundle.totalPrice,
    requiresCustomerAddress: offer.serviceBundle.requiresCustomerAddress,
    offeredSlots: [],
    offeredSlotsServiceKey: "",
    ...patch,
  });
  clearValidatedSlotOffer(userId, clientPhone);
  return nextState;
}

function clearValidatedSlotOffer(userId: string, clientPhone: string): void {
  validatedSlotOffers.delete(buildValidatedSlotOfferKey(userId, clientPhone));
}

function getSlotSuggestionMode(config: SchedulingConfig): SlotSuggestionMode {
  return config.slot_suggestion_mode === "ask_preference" ? "ask_preference" : "first_available";
}

function messageRequestsAutomaticSlotSearch(messageText: string): boolean {
  const normalized = normalizeTextForComparison(messageText);
  const markers = [
    "primeiro horario",
    "primeiro horario disponivel",
    "primeiro disponivel",
    "proximo horario",
    "qualquer horario",
    "o que tiver",
    "o primeiro que tiver",
  ];

  return markers.some((marker) => normalized.includes(marker));
}

function messageMentionsSchedulingNeed(messageText: string): boolean {
  const normalized = normalizeTextForComparison(messageText);
  const markers = [
    "agend",
    "marc",
    "horario",
    "vaga",
    "dispon",
    "atendimento",
    "consulta",
  ];

  return markers.some((marker) => normalized.includes(marker));
}

function shouldAutoOfferValidatedSlot(intent: SchedulingIntent, messageText: string, config: SchedulingConfig): boolean {
  if (intent.requestedDate) {
    return false;
  }

  if (intent.type === "cancel_appointment") {
    return false;
  }

  const automaticSlotSearch = messageRequestsAutomaticSlotSearch(messageText);
  const schedulingLead =
    intent.detected
    || automaticSlotSearch
    || messageMentionsSchedulingNeed(messageText);

  if (!schedulingLead) {
    return false;
  }

  if (getSlotSuggestionMode(config) === "first_available") {
    return true;
  }

  return automaticSlotSearch;
}

function normalizeServiceNameForLookup(value: string): string {
  return normalizeTextForComparison(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeServiceRequestTokens(serviceName?: string): string[] {
  const raw = String(serviceName || "").trim();
  if (!raw) {
    return [];
  }

  // Pre-split on literal "+" before normalization removes it.
  // Combined service names use " + " as separator (e.g. "Chuveiro + Tomada").
  return raw
    .split(/\s*\+\s*/)
    .flatMap((part) => {
      const normalized = normalizeServiceNameForLookup(part);
      if (!normalized) return [];
      return normalized
        .split(/\s+(?:e|com)\s+|,/i)
        .map((token) => token.trim())
        .filter(Boolean);
    });
}

const SCHEDULING_GREETING_MESSAGES = new Set([
  "oi",
  "ola",
  "olá",
  "bom dia",
  "boa tarde",
  "boa noite",
  "opa",
  "e ai",
  "e aí",
]);

function isGreetingOnlySchedulingMessage(messageText: string): boolean {
  const normalized = normalizeSchedulingMessage(String(messageText || ""));
  return Boolean(normalized) && SCHEDULING_GREETING_MESSAGES.has(normalized);
}

const SERVICE_LOOKUP_STOPWORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "no",
  "nos",
  "na",
  "nas",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "pra",
  "pro",
  "um",
  "uma",
  "uns",
  "umas",
  "me",
  "meu",
  "minha",
  "preciso",
  "quero",
  "gostaria",
  "tem",
  "tenho",
  "temos",
  "faz",
  "fazer",
  "fazem",
  "queria",
  "voce",
  "voces",
  "vocês",
  "favor",
]);

const GENERIC_SERVICE_TERMS = new Set([
  "agendamento",
  "assistencia",
  "atendimento",
  "avaliacao",
  "avaliar",
  "cliente",
  "completo",
  "completa",
  "conserto",
  "deslocamento",
  "endereco",
  "execucao",
  "fiacao",
  "fio",
  "instalacao",
  "instalar",
  "instalacaoo",
  "local",
  "manutencao",
  "orcamento",
  "passagem",
  "pedido",
  "pronto",
  "realizar",
  "reparo",
  "retirada",
  "servico",
  "simples",
  "tecnica",
  "tecnico",
  "troca",
  "trocar",
  "verificacao",
  "visita",
]);

const SERVICE_LOOKUP_TERM_ALIASES: Record<string, string> = {
  usg: "ultrassom",
  ultrassonografia: "ultrassom",
  ultrassonografico: "ultrassom",
  ultrassonografica: "ultrassom",
};

const BROAD_SERVICE_FAMILY_TERMS = new Set([
  "agendamento",
  "atendimento",
  "consulta",
  "exame",
  "servico",
  "ultrassom",
]);

function singularizeServiceToken(token: string): string {
  const value = String(token || "").trim();
  if (value.length <= 3) {
    return value;
  }

  if (value.endsWith("oes")) {
    return `${value.slice(0, -3)}ao`;
  }

  if (value.endsWith("ais")) {
    return `${value.slice(0, -3)}al`;
  }

  if (value.endsWith("eis")) {
    return `${value.slice(0, -3)}el`;
  }

  if (value.endsWith("is")) {
    return `${value.slice(0, -2)}il`;
  }

  if (value.endsWith("ns")) {
    return `${value.slice(0, -2)}m`;
  }

  if (value.endsWith("s") && !value.endsWith("us") && !value.endsWith("ss")) {
    return value.slice(0, -1);
  }

  return value;
}

function canonicalizeServiceLookupTerm(token: string): string {
  const singular = singularizeServiceToken(token);
  return SERVICE_LOOKUP_TERM_ALIASES[singular] || singular;
}

function buildMeaningfulServiceTerms(value: string): string[] {
  const normalized = normalizeServiceNameForLookup(value);
  if (!normalized) {
    return [];
  }

  const uniqueTerms = new Set<string>();
  for (const rawPart of normalized.split(" ")) {
    const part = rawPart.trim();
    if (!part || SERVICE_LOOKUP_STOPWORDS.has(part)) {
      continue;
    }

    const singular = canonicalizeServiceLookupTerm(part);
    if (!singular || SERVICE_LOOKUP_STOPWORDS.has(singular)) {
      continue;
    }

    uniqueTerms.add(singular);
  }

  return Array.from(uniqueTerms);
}

function buildServiceAnchorTerms(serviceName: string): string[] {
  const terms = buildMeaningfulServiceTerms(serviceName)
    .filter((term) => !GENERIC_SERVICE_TERMS.has(term));

  return terms.length > 0 ? terms : buildMeaningfulServiceTerms(serviceName);
}

function buildServiceLookupTermSet(value: string): Set<string> {
  return new Set(buildMeaningfulServiceTerms(value));
}

function buildCatalogServiceTermFrequency(catalog: SchedulingServiceRecord[]): Map<string, number> {
  const frequency = new Map<string, number>();

  for (const service of catalog) {
    const uniqueTerms = buildServiceLookupTermSet(service.name);
    for (const term of uniqueTerms) {
      frequency.set(term, (frequency.get(term) || 0) + 1);
    }
  }

  return frequency;
}

function extractCatalogRelevantRequestTerms(
  candidate: string,
  catalog: SchedulingServiceRecord[],
): string[] {
  const catalogTermFrequency = buildCatalogServiceTermFrequency(catalog);
  return buildMeaningfulServiceTerms(candidate).filter((term) => catalogTermFrequency.has(term));
}

function findDirectRelevantCatalogServices(
  candidate: string,
  catalog: SchedulingServiceRecord[],
): SchedulingServiceRecord[] {
  const relevantTerms = extractCatalogRelevantRequestTerms(candidate, catalog);
  if (relevantTerms.length === 0) {
    return [];
  }

  const broadTerms = relevantTerms.filter((term) => BROAD_SERVICE_FAMILY_TERMS.has(term));
  const specificTerms = relevantTerms.filter((term) => !BROAD_SERVICE_FAMILY_TERMS.has(term));

  const directMatches = catalog.filter((service) => {
    const serviceTerms = buildServiceLookupTermSet(service.name);

    if (specificTerms.length > 0 && !specificTerms.every((term) => serviceTerms.has(term))) {
      return false;
    }

    if (broadTerms.length > 0 && !broadTerms.every((term) => serviceTerms.has(term))) {
      return false;
    }

    return true;
  });

  if (directMatches.length > 0) {
    return directMatches;
  }

  if (specificTerms.length > 0) {
    return catalog.filter((service) => {
      const serviceTerms = buildServiceLookupTermSet(service.name);
      return specificTerms.every((term) => serviceTerms.has(term));
    });
  }

  return [];
}

function buildRelevantSchedulingDisambiguationServices(
  messageText: string,
  activeServices: SchedulingServiceRecord[],
  selectedServiceIds: string[] = [],
): SchedulingServiceRecord[] {
  const directMatches = findDirectRelevantCatalogServices(messageText, activeServices);
  if (directMatches.length > 0) {
    return directMatches;
  }

  const selectedIds = new Set(selectedServiceIds.filter(Boolean));
  if (selectedIds.size === 0) {
    return [];
  }

  return activeServices.filter((service) => selectedIds.has(service.id));
}

function scoreSchedulingServiceCandidate(
  service: SchedulingServiceRecord,
  requestSegment: string,
): number {
  const serviceAnchorTerms = buildServiceAnchorTerms(service.name);
  const requestAnchorTerms = buildServiceAnchorTerms(requestSegment);
  if (serviceAnchorTerms.length === 0 || requestAnchorTerms.length === 0) {
    return 0;
  }

  const serviceMeaningfulTerms = new Set(buildMeaningfulServiceTerms(service.name));
  const requestMeaningfulTerms = new Set(buildMeaningfulServiceTerms(requestSegment));
  const normalizedServiceName = normalizeServiceNameForLookup(service.name);
  const normalizedRequestSegment = normalizeServiceNameForLookup(requestSegment);

  let score = 0;
  for (const requestAnchor of requestAnchorTerms) {
    if (serviceAnchorTerms.includes(requestAnchor)) {
      score += 100;
    }
  }

  for (const requestTerm of requestMeaningfulTerms) {
    if (serviceMeaningfulTerms.has(requestTerm)) {
      score += GENERIC_SERVICE_TERMS.has(requestTerm) ? 5 : 15;
    }
  }

  if (normalizedRequestSegment && normalizedServiceName.includes(normalizedRequestSegment)) {
    score += 25;
  }

  const unmatchedServiceAnchorTerms = serviceAnchorTerms.filter((term) => !requestAnchorTerms.includes(term));
  score -= unmatchedServiceAnchorTerms.length * 60;

  return score;
}

function serviceMatchesContextCandidate(serviceName: string, candidate: string): boolean {
  const normalizedName = normalizeServiceNameForLookup(serviceName);
  const normalizedCandidate = normalizeServiceNameForLookup(candidate);

  if (!normalizedName || !normalizedCandidate) {
    return false;
  }

  const candidateMeaningfulTerms = buildMeaningfulServiceTerms(candidate);
  if (
    candidateMeaningfulTerms.length >= 2
    && (normalizedCandidate.includes(normalizedName) || normalizedName.includes(normalizedCandidate))
  ) {
    return true;
  }

  const anchorTerms = buildServiceAnchorTerms(serviceName);
  const candidateTerms = new Set(buildServiceAnchorTerms(candidate));

  if (anchorTerms.length > 0 && anchorTerms.some((term) => candidateTerms.has(term))) {
    return true;
  }

  const nameTerms = new Set(anchorTerms);
  let overlap = 0;
  for (const term of candidateTerms) {
    if (nameTerms.has(term)) {
      overlap += 1;
    }
  }

  return overlap >= 1;
}

function isLikelySchedulingServiceDescriptionMessage(
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): boolean {
  const normalized = normalizeSchedulingMessage(String(messageText || ""));
  if (!normalized || isGreetingOnlySchedulingMessage(normalized)) {
    return false;
  }

  if (looksLikeAffirmativeReply(messageText) || isGenericAvailabilityLookup(messageText)) {
    return false;
  }

  const currentIntent = inferSchedulingIntentFromConversation(messageText, conversationHistory);
  if (
    currentIntent.type === "check_availability"
    || currentIntent.type === "book_appointment"
    || currentIntent.type === "reschedule"
    || currentIntent.type === "cancel_appointment"
    || currentIntent.requestedDate
    || currentIntent.requestedTime
  ) {
    return false;
  }

  const extractedInfo = extractSchedulingCustomerInfo(messageText, true);
  if (extractedInfo.customerAddress || extractedInfo.customerName || messageLooksLikeStandaloneSchedulingName(messageText)) {
    return false;
  }

  return buildServiceAnchorTerms(messageText).length > 0;
}

function coerceServicePrice(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const normalized = Number(value.replace(",", "."));
    return Number.isFinite(normalized) ? normalized : null;
  }
  return null;
}

async function listActiveSchedulingServices(userId: string): Promise<SchedulingServiceRecord[]> {
  const { data, error } = await supabase
    .from("scheduling_services")
    .select("id, name, duration_minutes, price, is_active, requires_customer_address")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[Scheduling] Error fetching active services:", error);
    return [];
  }

  return (data || []) as SchedulingServiceRecord[];
}

/**
 * Usa LLM para interpretar qual(is) serviço(s) o cliente deseja a partir do catálogo.
 * Retorna array de IDs dos serviços identificados. Fallback: array vazio.
 */
async function resolveServiceViaLLM(
  userMessage: string,
  catalog: SchedulingServiceRecord[],
): Promise<{ serviceIds: string[]; isAmbiguous: boolean }> {
  if (!userMessage?.trim() || catalog.length === 0) return { serviceIds: [], isAmbiguous: false };

  if (schedulingPlannerTestDependencies?.resolveServiceViaLLM) {
    const mocked = await schedulingPlannerTestDependencies.resolveServiceViaLLM({
      userMessage,
      catalog,
    });

    if (!mocked) {
      return { serviceIds: [], isAmbiguous: false };
    }

    const validIds = Array.isArray(mocked.serviceIds)
      ? mocked.serviceIds.filter((id) => catalog.some((service) => service.id === id))
      : [];

    return {
      serviceIds: validIds,
      isAmbiguous: mocked.isAmbiguous === true,
    };
  }

  const catalogText = catalog
    .map((s) => `- ID: ${s.id} | Nome: ${s.name} | R$${s.price ?? "?"} | ${s.duration_minutes ?? "?"}min`)
    .join("\n");

  const prompt = `Você é um assistente que identifica serviços a partir de um catálogo.

CATÁLOGO DE SERVIÇOS:
${catalogText}

MENSAGEM DO CLIENTE:
"${userMessage}"

TAREFA: Identifique qual(is) serviço(s) do catálogo o cliente deseja.
- Se o cliente mencionar mais de um serviço, retorne todos.
- Se nenhum serviço corresponder, retorne array vazio.
- Não invente serviços que não existam no catálogo.
- isAmbiguous = true quando o cliente usou um termo genérico/vago que corresponde a VÁRIOS serviços (ex: "ultrassom" com 5 tipos, "consulta" com 3 tipos).
- isAmbiguous = false quando o cliente nomeou EXPLICITAMENTE os serviços que quer (ex: "corte e escova", "ultrassom abdominal").

Responda APENAS com JSON válido, sem markdown:
{"serviceIds": ["id1", "id2"], "isAmbiguous": false, "reasoning": "breve explicação"}`;

  try {
    void prompt;
    const text = "";
    if (!text) return { serviceIds: [], isAmbiguous: false };

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { serviceIds: [], isAmbiguous: false };

    const parsed = JSON.parse(jsonMatch[0]);
    const ids: string[] = Array.isArray(parsed.serviceIds) ? parsed.serviceIds : [];
    const validIds = ids.filter((id) => catalog.some((s) => s.id === id));
    const isAmbiguous = parsed.isAmbiguous === true;

    if (validIds.length > 0) {
      console.log(`📅 [ServiceLLM] Identificou ${validIds.length} serviço(s)${isAmbiguous ? ' (AMBÍGUO)' : ''}: ${parsed.reasoning || "sem razão"}`);
    }

    return { serviceIds: validIds, isAmbiguous };
  } catch (err) {
    console.error("📅 [ServiceLLM] Erro:", err);
    return { serviceIds: [], isAmbiguous: false };
  }
}

async function resolveSchedulingServiceBundle(
  userId: string,
  requestedServiceName: string | undefined,
  config: SchedulingConfig,
  options?: {
    activeServices?: SchedulingServiceRecord[];
    selectedServiceIds?: string[];
    contextCandidates?: string[];
  },
): Promise<ResolvedSchedulingServiceBundle> {
  const activeServices = options?.activeServices || await listActiveSchedulingServices(userId);
  const uniqueActiveServices: SchedulingServiceRecord[] = [];
  const seenNormalizedServiceNames = new Set<string>();

  for (const service of activeServices) {
    const normalizedName = normalizeServiceNameForLookup(service.name);
    const dedupeKey = normalizedName || service.id;
    if (seenNormalizedServiceNames.has(dedupeKey)) {
      continue;
    }
    seenNormalizedServiceNames.add(dedupeKey);
    uniqueActiveServices.push(service);
  }

  const selectedServiceIds = (options?.selectedServiceIds || []).filter(Boolean);
  const matchedById = selectedServiceIds.length > 0
    ? uniqueActiveServices.filter((service) => selectedServiceIds.includes(service.id))
    : [];

  // Prioridade 1: IDs explícitos do planner
  if (matchedById.length > 0) {
    // pular LLM e token, já temos IDs
  }

  // Prioridade 2: LLM interpreta o pedido do cliente vs catálogo
  let llmMatched: SchedulingServiceRecord[] = [];
  let llmIsAmbiguous = false;
  if (matchedById.length === 0 && requestedServiceName?.trim() && uniqueActiveServices.length > 0) {
    const llmResult = await resolveServiceViaLLM(requestedServiceName, uniqueActiveServices);
    llmIsAmbiguous = llmResult.isAmbiguous;
    llmMatched = llmResult.serviceIds
      .map((id) => uniqueActiveServices.find((s) => s.id === id))
      .filter((s): s is SchedulingServiceRecord => Boolean(s));
  }

  const directCandidate = String(options?.contextCandidates?.[0] || requestedServiceName || "").trim();
  const directRelevantMatches = directCandidate
    ? findDirectRelevantCatalogServices(directCandidate, uniqueActiveServices)
    : [];
  const shouldPreferDirectRelevantMatches = matchedById.length === 0
    && directRelevantMatches.length > 0
    && (
      llmMatched.length === 0
      || !llmMatched.every((service) => directRelevantMatches.some((candidate) => candidate.id === service.id))
      || directRelevantMatches.length > llmMatched.length
    );

  if (matchedById.length === 0 && directRelevantMatches.length > 1) {
    llmIsAmbiguous = true;
  }

  if (shouldPreferDirectRelevantMatches) {
    llmMatched = directRelevantMatches;
  }

  // Prioridade 3: Fallback token scoring (caso LLM não encontre)
  const contextCandidates = (options?.contextCandidates || [requestedServiceName || ""])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const requestedTokens = contextCandidates.flatMap((candidate) => normalizeServiceRequestTokens(candidate));
  const bestServicesByToken = (matchedById.length === 0 && llmMatched.length === 0)
    ? requestedTokens
        .map((token) => {
          const rankedCandidates = uniqueActiveServices
            .map((service) => ({
              service,
              score: scoreSchedulingServiceCandidate(service, token),
            }))
            .filter((candidate) => candidate.score > 0)
            .sort((left, right) => right.score - left.score);

          return rankedCandidates[0]?.service || null;
        })
        .filter((service): service is SchedulingServiceRecord => Boolean(service))
    : [];
  const matchedServices = matchedById.length > 0
    ? matchedById
    : llmMatched.length > 0
      ? llmMatched
      : bestServicesByToken.length > 0
        ? Array.from(new Map(bestServicesByToken.map((service) => [service.id, service])).values())
        : requestedTokens.length > 0
          ? uniqueActiveServices.filter((service) =>
              contextCandidates.some((candidate) => serviceMatchesContextCandidate(service.name, candidate)),
            )
          : [];

  const selectedServices = matchedServices.length > 0
    ? matchedServices
    : [{
        id: "",
        name: requestedServiceName || config.service_name || "Agendamento",
        duration_minutes: config.slot_duration || config.service_duration || 60,
        price: null,
        requires_customer_address: false,
      }];

  const selectedServicePayload = selectedServices.map((service) => ({
    id: service.id,
    name: service.name,
    durationMinutes: Number(service.duration_minutes || config.slot_duration || 60),
    price: coerceServicePrice(service.price),
  }));

  const totalDurationMinutes = Math.max(
    selectedServicePayload.reduce((sum, service) => sum + (service.durationMinutes || 0), 0),
    Number(config.slot_duration || config.service_duration || 60),
  );

  const totalPrice = selectedServicePayload.reduce<number | null>((sum, service) => {
    if (service.price === null || service.price === undefined) {
      return sum;
    }
    return (sum || 0) + service.price;
  }, 0);

  return {
    primaryServiceId: selectedServices.length === 1 && selectedServices[0].id ? selectedServices[0].id : undefined,
    combinedServiceName: selectedServicePayload.map((service) => service.name).join(" + "),
    totalDurationMinutes,
    totalPrice: totalPrice && totalPrice > 0 ? totalPrice : null,
    requiresCustomerAddress: selectedServices.some((service) => Boolean(service.requires_customer_address)),
    isAmbiguousMatch: llmIsAmbiguous,
    selectedServices: selectedServicePayload,
  };
}

function formatServiceBreakdownLines(context: SchedulingAppointmentContext): string[] {
  const lines = context.selectedServices.map((service) => {
    const extras: string[] = [];
    if (service.durationMinutes > 0) {
      extras.push(`${service.durationMinutes} min`);
    }
    if (service.price !== null && service.price !== undefined) {
      extras.push(`R$ ${service.price.toFixed(2).replace(".", ",")}`);
    }
    return `Serviço: ${service.name}${extras.length ? ` (${extras.join(" | ")})` : ""}`;
  });

  if (context.totalPrice !== null && context.totalPrice !== undefined) {
    lines.push(`Total combinado: R$ ${context.totalPrice.toFixed(2).replace(".", ",")}`);
  }

  return lines;
}

function buildSchedulingContextFromBundle(
  serviceBundle: ResolvedSchedulingServiceBundle,
  customerAddress?: string,
): SchedulingAppointmentContext {
  return {
    domain: "scheduling",
    selectedServices: serviceBundle.selectedServices,
    totalDurationMinutes: serviceBundle.totalDurationMinutes,
    totalPrice: serviceBundle.totalPrice,
    customerAddress: customerAddress?.trim() || undefined,
  };
}

function formatValidatedSlotHeading(date: string, time: string): string {
  const dateObj = new Date(`${date}T12:00:00`);
  const dayNames = ["domingo", "segunda-feira", "terca-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sabado"];
  const dayName = dayNames[dateObj.getDay()] || date;
  const formattedDate = `${dateObj.getDate().toString().padStart(2, "0")}/${(dateObj.getMonth() + 1).toString().padStart(2, "0")}`;
  return `${dayName} (${formattedDate}) as ${time}`;
}

interface RealSlotSuggestion {
  date: string;
  time: string;
}

async function findNextRealAvailableSlot(
  userId: string,
  config: SchedulingConfig,
  serviceBundle: ResolvedSchedulingServiceBundle,
): Promise<RealSlotSuggestion | null> {
  const brazil = getBrazilDateTime();
  const maxDays = Math.max(1, Math.min(config.advance_booking_days || 30, 60));

  for (let offset = 0; offset < maxDays; offset += 1) {
    const date = new Date(brazil.date);
    date.setDate(date.getDate() + offset);
    const dateStr = formatDate(date);
    const slots = await getAvailableSlots(userId, dateStr, config, {
      serviceDurationMinutes: serviceBundle.totalDurationMinutes,
    });
    const firstAvailable = slots.find((slot) => slot.available);
    if (firstAvailable) {
      return {
        date: dateStr,
        time: firstAvailable.start,
      };
    }
  }

  return null;
}

function looksLikeAffirmativeReply(messageText: string): boolean {
  const normalized = normalizeTextForComparison(messageText);
  return /^(sim|pode|pode sim|claro|confirmo|ok|beleza|isso|isso mesmo)\b/.test(normalized);
}

function readTagField(rawTag: string, fieldName: string): string | undefined {
  const marker = `${fieldName}=`;
  const startIndex = rawTag.indexOf(marker);
  if (startIndex < 0) {
    return undefined;
  }

  const valueStart = startIndex + marker.length;
  let cursor = valueStart;
  let inQuotes = false;

  while (cursor < rawTag.length) {
    const current = rawTag[cursor];

    if (current === '"') {
      inQuotes = !inQuotes;
      cursor += 1;
      continue;
    }

    if (!inQuotes && (current === "," || current === "]")) {
      break;
    }

    cursor += 1;
  }

  return rawTag.slice(valueStart, cursor).trim().replace(/^"|"$/g, "") || undefined;
}

export function extractSchedulingTags(text: string): SchedulingTag[] {
  const tags: SchedulingTag[] = [];
  const marker = "[AGENDAR:";
  let searchIndex = text.indexOf(marker);

  while (searchIndex >= 0) {
    const endIndex = text.indexOf("]", searchIndex);
    const raw = endIndex >= 0 ? text.slice(searchIndex, endIndex + 1) : text.slice(searchIndex);
    const date = readTagField(raw, "DATA");
    const time = readTagField(raw, "HORA");
    const clientName = readTagField(raw, "NOME");
    const serviceName = readTagField(raw, "SERVICO");
    const customerAddress = readTagField(raw, "ENDERECO");
    const approvalToken = readTagField(raw, "CONFIRMACAO_DIA");

    if (date && time && clientName) {
      tags.push({
        raw,
        date,
        time,
        clientName,
        serviceName,
        customerAddress,
        approvalToken,
      });
    }

    searchIndex = text.indexOf(marker, searchIndex + marker.length);
  }

  return tags;
}

export function stripSchedulingTagArtifacts(text: string): string {
  const marker = "[AGENDAR:";
  let result = text;
  let searchIndex = result.indexOf(marker);

  while (searchIndex >= 0) {
    const endIndex = result.indexOf("]", searchIndex);
    const lineBreakIndex = result.indexOf("\n", searchIndex);
    const removeUntil = endIndex >= 0
      ? endIndex + 1
      : lineBreakIndex >= 0
        ? lineBreakIndex
        : result.length;
    result = `${result.slice(0, searchIndex)}${result.slice(removeUntil)}`;
    searchIndex = result.indexOf(marker);
  }

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function findExactAvailableSlot(slots: TimeSlot[], requestedTime: string): TimeSlot | undefined {
  const normalizedRequestedTime = normalizeSchedulingTimeValue(requestedTime);
  return slots.find((slot) => normalizeSchedulingTimeValue(slot.start) === normalizedRequestedTime);
}

/**
 * Encontra o slot disponível mais próximo do horário solicitado,
 * dentro de uma tolerância em minutos. Usado quando o usuário diz
 * algo aproximado como "09" e o slot real é "09:45".
 * Prefere slots APÓS o horário solicitado (forward matching),
 * pois o usuário geralmente arredonda para baixo ("09" = "09:xx").
 */
export function findClosestAvailableSlot(
  slots: TimeSlot[],
  requestedTime: string,
  toleranceMinutes = 59,
): TimeSlot | undefined {
  const requestedMinutes = timeToMinutes(normalizeSchedulingTimeValue(requestedTime) || requestedTime);
  let bestForward: TimeSlot | undefined;
  let bestForwardDiff = Infinity;
  let bestBackward: TimeSlot | undefined;
  let bestBackwardDiff = Infinity;

  for (const slot of slots) {
    if (!slot.available) continue;
    const slotMinutes = timeToMinutes(normalizeSchedulingTimeValue(slot.start));
    const diff = slotMinutes - requestedMinutes;
    const absDiff = Math.abs(diff);
    if (absDiff > toleranceMinutes) continue;
    if (diff >= 0 && absDiff < bestForwardDiff) {
      bestForwardDiff = absDiff;
      bestForward = slot;
    } else if (diff < 0 && absDiff < bestBackwardDiff) {
      bestBackwardDiff = absDiff;
      bestBackward = slot;
    }
  }

  return bestForward || bestBackward;
}

export function responseLooksLikeSuccessfulScheduling(text: string): boolean {
  const normalized = normalizeTextForComparison(text);
  const negativeHints = [
    "nao esta disponivel",
    "nao está disponivel",
    "nao disponivel",
    "horario ocupado",
    "horario indisponivel",
    "erro ao agendar",
    "falha ao agendar",
    "pode me informar outro",
  ];

  if (negativeHints.some((hint) => normalized.includes(hint))) {
    return false;
  }

  const positiveHints = [
    "agendamento esta",
    "agendamento foi",
    "agendamento confirmado",
    "agendamento registrado",
    "horario esta confirmado",
    "seu horario esta confirmado",
    "seu horario foi reservado",
    "ficou reservado",
    "registrado na agenda",
    "vou registrar na agenda",
    "horario esta disponivel",
    "horario disponível",
    "reservei seu horario",
    "reserva confirmada",
  ];

  return positiveHints.some((hint) => normalized.includes(hint));
}

function splitResponseIntoBlocks(text: string): string[] {
  const lines = String(text || "").split("\n");
  const blocks: string[] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join("\n").trim());
        currentBlock = [];
      }
      continue;
    }

    currentBlock.push(trimmedLine);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join("\n").trim());
  }

  return blocks;
}

export function buildFailedSchedulingResponseText(responseText: string, errorMessage: string): string {
  const sanitizedText = stripSchedulingTagArtifacts(responseText).trim();
  if (!sanitizedText) {
    return errorMessage;
  }

  const safeBlocks = splitResponseIntoBlocks(sanitizedText)
    .filter((block) => !responseLooksLikeSuccessfulScheduling(block));

  const safeText = safeBlocks.join("\n\n").trim();
  if (!safeText || responseLooksLikeSuccessfulScheduling(safeText)) {
    return errorMessage;
  }

  if (safeText.includes(errorMessage)) {
    return safeText;
  }

  return `${safeText}\n\n${errorMessage}`.trim();
}

export function normalizeAppointmentDateValue(value: string | Date | null | undefined): string {
  if (value instanceof Date) {
    return formatDate(value);
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (raw.length >= 10 && raw[4] === "-" && raw[7] === "-") {
    return raw.slice(0, 10);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDate(parsed);
  }

  return raw;
}

export function getNextAppointmentDateValue(value: string | Date | null | undefined): string {
  const normalizedDate = normalizeAppointmentDateValue(value);
  const parsed = new Date(`${normalizedDate}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return normalizedDate;
  }

  parsed.setDate(parsed.getDate() + 1);
  return formatDate(parsed);
}

export function toDatabaseTimeString(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) {
    return "00:00:00";
  }

  const sanitized = raw.replace("h", ":").replace("H", ":").replace(" horas", "").replace(" hora", "");
  const [hourPart = "00", minutePart = "00", secondPart = "00"] = sanitized.split(":");
  const hour = hourPart.padStart(2, "0");
  const minute = minutePart.padStart(2, "0");
  const second = secondPart.padStart(2, "0");
  return `${hour}:${minute}:${second}`;
}

export function normalizeSchedulingTimeValue(value: string | null | undefined): string {
  return toDatabaseTimeString(value).slice(0, 5);
}

/**
 * Busca a configuração de agendamento do usuário COM CACHE
 * Reduz Disk IO e Egress do Supabase
 */
export async function getSchedulingConfigCached(userId: string): Promise<SchedulingConfig | null> {
  // Verificar cache primeiro
  const cached = schedulingConfigCache.get(userId);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }
  
  // Cache miss ou expirado - buscar do banco
  try {
    const { data, error } = await supabase
      .from('scheduling_config')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    const config = (error || !data) ? null : data as SchedulingConfig;
    
    // Salvar no cache
    schedulingConfigCache.set(userId, {
      data: config,
      timestamp: Date.now()
    });
    
    return config;
  } catch (error) {
    console.error('[Scheduling] Error fetching config:', error);
    return null;
  }
}

/**
 * Busca a configuração de agendamento do usuário (sem cache - para compatibilidade)
 * @deprecated Use getSchedulingConfigCached para melhor performance
 */
export async function getSchedulingConfig(userId: string): Promise<SchedulingConfig | null> {
  return getSchedulingConfigCached(userId);
}

/**
 * Busca exceções de agendamento para uma data
 */
export async function getExceptionForDate(userId: string, date: string): Promise<SchedulingException | null> {
  try {
    const { data, error } = await supabase
      .from('scheduling_exceptions')
      .select('*')
      .eq('user_id', userId)
      .eq('exception_date', date)
      .single();
    
    if (error || !data) return null;
    return data as SchedulingException;
  } catch (error) {
    console.error('[Scheduling] Error fetching exception:', error);
    return null;
  }
}

/**
 * Busca agendamentos existentes para uma data
 */
export async function getAppointmentsForDate(userId: string, date: string): Promise<Appointment[]> {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('user_id', userId)
      .eq('appointment_date', date)
      .in('status', ['pending', 'confirmed'])
      .order('start_time', { ascending: true });
    
    if (error) {
      console.error('[Scheduling] Error fetching appointments:', error);
      return [];
    }
    
    return (data || []) as Appointment[];
  } catch (error) {
    console.error('[Scheduling] Error fetching appointments:', error);
    return [];
  }
}

/**
 * Verifica se um dia específico está disponível para agendamento
 */
export function isDayAvailable(date: string, config: SchedulingConfig, exception?: SchedulingException | null): boolean {
  const dateObj = new Date(date + 'T12:00:00');
  const dayOfWeek = dateObj.getDay();
  
  // Verificar se é um dia de exceção bloqueado
  if (exception && (exception.exception_type === 'blocked' || exception.exception_type === 'holiday')) {
    return false;
  }
  
  // Verificar se o dia da semana está nos dias disponíveis
  if (!config.available_days.includes(dayOfWeek)) {
    return false;
  }
  
  // Verificar se é futuro (não permitir agendamentos no passado) - usando timezone de São Paulo
  const brazil = getBrazilDateTime();
  const todayBrazil = new Date(brazil.dateStr + 'T00:00:00');
  const targetDate = new Date(date + 'T00:00:00');
  if (targetDate < todayBrazil) {
    return false;
  }
  
  // Verificar limite de antecedência
  const maxDate = new Date(todayBrazil);
  maxDate.setDate(maxDate.getDate() + config.advance_booking_days);
  if (targetDate > maxDate) {
    return false;
  }
  
  return true;
}

/**
 * Gera os slots de horário disponíveis para uma data
 * @param userId - ID do usuário
 * @param date - Data no formato YYYY-MM-DD
 * @param providedConfig - Config já buscada (opcional, evita query duplicada)
 */
export async function getAvailableSlots(
  userId: string, 
  date: string,
  providedConfig?: SchedulingConfig | null,
  options?: {
    serviceDurationMinutes?: number;
    bufferBetweenAppointments?: number;
  },
): Promise<TimeSlot[]> {
  // Usar config fornecida ou buscar do cache
  const config = providedConfig ?? await getSchedulingConfigCached(userId);
  console.log(`📅 [getAvailableSlots] Config para ${userId}:`, {
    is_enabled: config?.is_enabled,
    work_start_time: config?.work_start_time,
    work_end_time: config?.work_end_time,
    available_days: config?.available_days,
    slot_duration: config?.slot_duration,
    has_break: config?.has_break,
    break_start: config?.break_start_time,
    break_end: config?.break_end_time
  });
  
  if (!config || !config.is_enabled) {
    console.log(`📅 [getAvailableSlots] ❌ Config não habilitada ou não encontrada`);
    return [];
  }
  
  const exception = await getExceptionForDate(userId, date);
  if (!isDayAvailable(date, config, exception)) {
    return [];
  }
  
  const existingAppointments = await getAppointmentsForDate(userId, date);
  if (existingAppointments.length > 0) {
    console.log(`📅 [getAvailableSlots] ${date}: ${existingAppointments.length} agendamentos existentes:`, existingAppointments.map(a => `${a.start_time}-${a.end_time} (${a.status})`));
  }
  let googleBusyWindows: CalendarBusyWindow[] = [];

  if (config.google_calendar_enabled) {
    const googleCalendarConnected = await isGoogleCalendarConnected(userId);
    if (googleCalendarConnected) {
      const googleBusyResult = await listCalendarBusyWindows(
        userId,
        `${date}T00:00:00`,
        `${date}T23:59:59`,
      );

      if (!googleBusyResult.success) {
        console.error('[Scheduling] Error fetching Google Calendar busy windows:', googleBusyResult.error);
        return [];
      }

      googleBusyWindows = googleBusyResult.windows || [];
      console.log(`📅 [getAvailableSlots] ${date}: ${googleBusyWindows.length} Google busy windows${googleBusyWindows.length > 0 ? ':' : ' (calendar empty)'}`, googleBusyWindows.length > 0 ? googleBusyWindows.map(w => `${w.startDateTime} → ${w.endDateTime}`) : '');
    }
  }
  
  // Determinar horários de início e fim (considerar exceção com horário modificado)
  let startTime = config.work_start_time;
  let endTime = config.work_end_time;
  
  if (exception?.exception_type === 'modified_hours') {
    startTime = exception.custom_start_time || startTime;
    endTime = exception.custom_end_time || endTime;
  }
  
  const slots: TimeSlot[] = [];
  const slotDuration = config.slot_duration;
  const appointmentDuration = options?.serviceDurationMinutes || config.slot_duration;
  const buffer = options?.bufferBetweenAppointments ?? config.buffer_between_appointments;
  console.log(`📅 [getAvailableSlots] ${date}: appointmentDuration=${appointmentDuration}, slotDuration=${slotDuration}, buffer=${buffer}, step=${slotDuration + buffer}, serviceDurationFromOptions=${options?.serviceDurationMinutes}, startTime=${startTime}, endTime=${endTime}`);
  
  // Converter horários para minutos
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  // IMPORTANTE: Se end_time é 00:00 (meia-noite), tratar como 24:00 (1440 minutos)
  // Isso permite horários até meia-noite, ex: 09:00-00:00
  let endMinutes = endH * 60 + endM;
  if (endMinutes === 0 || (endMinutes > 0 && endMinutes <= startMinutes)) {
    // Se end_time é 00:00 ou menor/igual ao start (ex: trabalhar até meia-noite)
    endMinutes = 24 * 60; // 1440 = meia-noite
  }
  
  // Horário de pausa (almoço)
  let breakStartMinutes = 0;
  let breakEndMinutes = 0;
  if (config.has_break && config.break_start_time && config.break_end_time) {
    const [bsH, bsM] = config.break_start_time.split(':').map(Number);
    const [beH, beM] = config.break_end_time.split(':').map(Number);
    breakStartMinutes = bsH * 60 + bsM;
    breakEndMinutes = beH * 60 + beM;
  }
  
  // Verificar horário mínimo de antecedência (usando timezone de São Paulo)
  const brazil = getBrazilDateTime();
  const today = brazil.dateStr;
  let minSlotMinutes = 0;
  
  if (date === today) {
    const currentMinutes = brazil.date.getHours() * 60 + brazil.date.getMinutes();
    minSlotMinutes = currentMinutes + (config.min_booking_notice_hours * 60);
  }
  
  // Gerar slots
  let currentMinutes = startMinutes;
  let appointmentCount = existingAppointments.length;
  
  while (currentMinutes + appointmentDuration <= endMinutes) {
    const slotEndMinutes = currentMinutes + appointmentDuration;
    
    // Verificar se está dentro do horário de pausa
    const isInBreak = config.has_break && 
      currentMinutes < breakEndMinutes && 
      slotEndMinutes > breakStartMinutes;
    
    // Verificar se respeita antecedência mínima
    const respectsMinNotice = currentMinutes >= minSlotMinutes;
    
    // Verificar se já atingiu limite diário
    const underDailyLimit = appointmentCount < config.max_appointments_per_day;
    
    // Verificar conflito com agendamentos existentes
    const slotStartStr = minutesToTime(currentMinutes);
    const slotEndStr = minutesToTime(slotEndMinutes);
    const slotStartDate = parseCalendarDateTimeWithTimeZone(`${date}T${slotStartStr}:00`);
    const slotEndDate = parseCalendarDateTimeWithTimeZone(`${date}T${slotEndStr}:00`);
    
    const hasConflict = existingAppointments.some(apt => {
      const aptStart = timeToMinutes(apt.start_time);
      const aptEnd = timeToMinutes(apt.end_time);
      return currentMinutes < aptEnd && slotEndMinutes > aptStart;
    });

    const hasGoogleConflict = googleBusyWindows.some((busyWindow) => {
      const busyStart = new Date(busyWindow.startDateTime);
      const busyEnd = new Date(busyWindow.endDateTime);
      return slotStartDate < busyEnd && slotEndDate > busyStart;
    });
    
    const available = !isInBreak && !hasConflict && !hasGoogleConflict && respectsMinNotice && underDailyLimit;
    
    if (!available) {
      console.log(`📅 [getAvailableSlots] ${date} slot ${slotStartStr}-${slotEndStr} BLOQUEADO: break=${isInBreak}, conflict=${hasConflict}, google=${hasGoogleConflict}, notice=${!respectsMinNotice}, dailyLimit=${!underDailyLimit}`);
    }
    
    slots.push({
      start: slotStartStr,
      end: slotEndStr,
      available
    });
    
    currentMinutes += slotDuration + buffer;
  }
  
  const availableSlots = slots.filter(s => s.available);
  console.log(`📅 [getAvailableSlots] ${date}: Gerados ${slots.length} slots, ${availableSlots.length} disponíveis`);
  console.log(`📅 [getAvailableSlots] Slots disponíveis:`, availableSlots.map(s => s.start).slice(0, 10), availableSlots.length > 10 ? '...' : '');
  
  return slots;
}

/**
 * Cria um agendamento pendente (para confirmação)
 * @param providedConfig - Config já buscada (opcional, evita query duplicada)
 */
export async function createPendingAppointment(
  userId: string,
  clientName: string,
  clientPhone: string,
  appointmentDate: string,
  startTime: string,
  clientNotes?: string,
  providedConfig?: SchedulingConfig | null,
  serviceName?: string,
  conversationId?: string,
  customerAddress?: string,
  approvalToken?: string,
  professionalId?: string,
  professionalName?: string,
): Promise<{ success: boolean; appointment?: Appointment; error?: string; adjustedTime?: string }> {
  const config = providedConfig ?? await getSchedulingConfigCached(userId);
  if (!config || !config.is_enabled) {
    return { success: false, error: 'Sistema de agendamento desativado' };
  }

  const serviceBundle = await resolveSchedulingServiceBundle(userId, serviceName, config);
  const effectiveServiceName = serviceBundle.combinedServiceName || serviceName || config.service_name;
  const normalizedAddress = String(customerAddress || "").trim();

  if (serviceBundle.requiresCustomerAddress && !normalizedAddress) {
    return { success: false, error: "MISSING_CUSTOMER_ADDRESS" };
  }

  const { data: existingAppointments, error: existingAppointmentsError } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .eq('client_phone', clientPhone)
    .eq('appointment_date', appointmentDate)
    .eq('start_time', `${startTime}:00`)
    .in('status', ['pending', 'confirmed'])
    .limit(5);

  if (existingAppointmentsError) {
    console.error('[Scheduling] Error checking existing appointment:', existingAppointmentsError);
  } else if (existingAppointments && existingAppointments.length > 0) {
    const normalizedClientName = String(clientName || '').trim().toLocaleLowerCase('pt-BR');
    const normalizedServiceName = String(effectiveServiceName || '').trim().toLocaleLowerCase('pt-BR');
    const matchedAppointment = existingAppointments.find((appointment: any) => {
      const sameName = String(appointment.client_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedClientName;
      const sameService = !normalizedServiceName
        || String(appointment.service_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedServiceName;

      return sameName && sameService;
    }) || existingAppointments.find((appointment: any) =>
      String(appointment.client_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedClientName,
    ) || existingAppointments[0];

    console.log(
      `[Scheduling] Reusing existing appointment ${matchedAppointment.id} for ${clientPhone} at ${appointmentDate} ${startTime}`,
    );

    clearValidatedSlotOffer(userId, clientPhone);
    return { success: true, appointment: matchedAppointment as Appointment };
  }

  const { data: sameDayAppointments, error: sameDayAppointmentsError } = await supabase
    .from("appointments")
    .select("id, appointment_date, start_time, service_name")
    .eq("user_id", userId)
    .eq("client_phone", clientPhone)
    .eq("appointment_date", appointmentDate)
    .in("status", ["pending", "confirmed"]);

  if (sameDayAppointmentsError) {
    console.error("[Scheduling] Error checking same-day appointments:", sameDayAppointmentsError);
  } else if ((sameDayAppointments || []).length > 0) {
    const approved = String(approvalToken || "").trim().toUpperCase() === "SIM"
      && hasSameDayRebookingApproval(userId, clientPhone, appointmentDate);
    if (!approved) {
      return { success: false, error: "CLIENT_ALREADY_HAS_APPOINTMENT_SAME_DAY" };
    }
  }

  const slots = await getAvailableSlots(userId, appointmentDate, config, {
    serviceDurationMinutes: serviceBundle.totalDurationMinutes,
  });
  
  // Tentar encontrar slot exato primeiro
  let selectedSlot = slots.find(s => s.start === startTime && s.available);
  let adjustedTime: string | undefined;
  
  // Se não encontrou slot exato, procurar o mais próximo disponível
  if (!selectedSlot) {
    const requestedMinutes = timeToMinutes(startTime);
    const availableSlots = slots.filter(s => s.available);
    
    if (availableSlots.length > 0) {
      // Encontrar slot mais próximo (dentro de 30 minutos de tolerância)
      const TOLERANCE_MINUTES = 30;
      let closestSlot: TimeSlot | null = null;
      let minDiff = Infinity;
      
      for (const slot of availableSlots) {
        const slotMinutes = timeToMinutes(slot.start);
        const diff = Math.abs(slotMinutes - requestedMinutes);
        
        if (diff <= TOLERANCE_MINUTES && diff < minDiff) {
          minDiff = diff;
          closestSlot = slot;
        }
      }
      
      if (closestSlot) {
        selectedSlot = closestSlot;
        adjustedTime = closestSlot.start;
        console.log(`📅 [Scheduling] Horário ${startTime} não disponível, ajustado para ${adjustedTime} (diferença: ${minDiff}min)`);
      }
    }
  }
  
  if (!selectedSlot) {
    // Log para debug: mostrar quais slots existem
    const availableSlots = slots.filter(s => s.available).map(s => s.start).join(', ');
    console.log(`📅 [Scheduling] Slot ${startTime} não encontrado. Slots disponíveis: ${availableSlots || 'nenhum'}`);
    return { success: false, error: 'Horário não disponível' };
  }
  
  // Usar o horário do slot selecionado (pode ser ajustado)
  const finalStartTime = selectedSlot.start;
  
  // Calcular horário de término
  const startMinutes = timeToMinutes(finalStartTime);
  const endMinutes = startMinutes + serviceBundle.totalDurationMinutes;
  const endTime = minutesToTime(endMinutes);
  const googleCalendarConnected = config.google_calendar_enabled
    ? await isGoogleCalendarConnected(userId)
    : false;

  if (googleCalendarConnected) {
    const googleAvailability = await checkCalendarAvailability(
        userId,
        `${appointmentDate}T${finalStartTime}:00`,
        `${appointmentDate}T${endTime}:00`,
        { failOpen: false },
    );

    if (!googleAvailability.checked) {
      return { success: false, error: 'Não foi possível validar a agenda do Google' };
    }

    if (!googleAvailability.available) {
      return {
        success: false,
        error: googleAvailability.conflictEvent
          ? `Horário em conflito com Google Agenda: ${googleAvailability.conflictEvent}`
          : 'Horário em conflito com Google Agenda',
      };
    }
  }
  
  // Criar o agendamento
  const status = config.auto_confirm ? 'confirmed' : 'pending';
  
  try {
    let safeConversationId: string | null = null;
    if (conversationId) {
      const { data: conversationRecord, error: conversationLookupError } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();

      if (conversationLookupError) {
        console.warn("[Scheduling] Could not validate conversation_id, saving appointment without conversation link:", conversationLookupError);
      } else if (conversationRecord?.id) {
        safeConversationId = conversationRecord.id;
      }
    }

    const location = serviceBundle.requiresCustomerAddress ? normalizedAddress : config.location;
    const locationType = serviceBundle.requiresCustomerAddress ? "endereco_cliente" : config.location_type;
    const schedulingContext = buildSchedulingContextFromBundle(serviceBundle, normalizedAddress);

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        user_id: userId,
        client_name: clientName,
        client_phone: clientPhone,
        service_name: effectiveServiceName,
        service_id: serviceBundle.primaryServiceId || null,
        professional_id: professionalId || null,
        professional_name: professionalName || null,
        appointment_date: appointmentDate,
        start_time: finalStartTime,
        end_time: endTime,
        duration_minutes: serviceBundle.totalDurationMinutes,
        location,
        location_type: locationType,
        conversation_id: safeConversationId,
        status,
        confirmed_by_client: false,
        confirmed_by_business: config.auto_confirm,
        created_by_ai: true,
        client_notes: clientNotes,
        reminder_sent: false,
        ai_conversation_context: schedulingContext,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[Scheduling] Error creating appointment:', error);
      return { success: false, error: 'Erro ao criar agendamento' };
    }
    
    let appointment = data as Appointment;

    if (googleCalendarConnected) {
      const syncResult = await syncAppointmentToCalendar(
        userId,
        {
          id: appointment.id,
          clientName: appointment.client_name,
          clientPhone: appointment.client_phone,
          appointmentDate: appointment.appointment_date,
          appointmentTime: appointment.start_time,
          serviceName: appointment.service_name || effectiveServiceName,
          notes: appointment.client_notes,
          googleEventId: appointment.google_event_id,
          location: appointment.location || location,
          extraDetails: formatServiceBreakdownLines(schedulingContext),
        },
        appointment.duration_minutes || serviceBundle.totalDurationMinutes,
      );

      if (!syncResult.success || !syncResult.eventId) {
        await supabase
          .from('appointments')
          .delete()
          .eq('id', appointment.id);

        return {
          success: false,
          error: syncResult.error || 'Falha ao sincronizar com Google Agenda',
        };
      }

      const { data: syncedAppointment } = await supabase
        .from('appointments')
        .update({
          google_event_id: syncResult.eventId,
          google_calendar_synced: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.id)
        .select()
        .single();

      if (syncedAppointment) {
        appointment = syncedAppointment as Appointment;
      }
    }

    if ((sameDayAppointments || []).length > 0) {
      consumeSameDayRebookingApproval(userId, clientPhone, appointmentDate);
    }

    clearValidatedSlotOffer(userId, clientPhone);

    if (config.booking_notification_enabled && config.booking_notification_phone) {
      const { sendSchedulingBookingNotification } = await import("./schedulingNotificationService");
      await sendSchedulingBookingNotification(userId, config.booking_notification_phone, {
        id: appointment.id,
        clientName: appointment.client_name,
        clientPhone: appointment.client_phone,
        appointmentDate: appointment.appointment_date,
        startTime: appointment.start_time,
        endTime: appointment.end_time,
        location: appointment.location,
        serviceName: appointment.service_name,
        selectedServices: schedulingContext.selectedServices,
        totalPrice: schedulingContext.totalPrice,
      }).catch((error) => {
        console.error("[Scheduling] Failed to send booking notification:", error);
      });
    }

    return { success: true, appointment, adjustedTime };
  } catch (error) {
    console.error('[Scheduling] Error creating appointment:', error);
    return { success: false, error: 'Erro ao criar agendamento' };
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Gera o bloco de prompt para o agente de IA sobre agendamentos
 */
// Helper para obter data/hora no timezone de São Paulo
function getBrazilDateTime(): { date: Date; dateStr: string; timeStr: string } {
  const now = new Date();
  // Converte para São Paulo (UTC-3)
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dateStr = `${brazilTime.getFullYear()}-${(brazilTime.getMonth() + 1).toString().padStart(2, '0')}-${brazilTime.getDate().toString().padStart(2, '0')}`;
  const timeStr = `${String(brazilTime.getHours()).padStart(2, '0')}:${String(brazilTime.getMinutes()).padStart(2, '0')}`;
  return { date: brazilTime, dateStr, timeStr };
}

async function getClientAppointmentsForDate(
  userId: string,
  clientPhone: string,
  appointmentDate: string,
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("user_id", userId)
    .eq("client_phone", clientPhone)
    .eq("appointment_date", appointmentDate)
    .in("status", ["pending", "confirmed"])
    .order("start_time", { ascending: true });

  if (error) {
    console.error("[Scheduling] Error fetching client appointments for date:", error);
    return [];
  }

  return (data || []) as Appointment[];
}

function buildSchedulingQuoteReply(context: SchedulingAppointmentContext): string {
  const hasSingleService = context.selectedServices.length === 1;
  const lines: string[] = [];

  if (hasSingleService) {
    const service = context.selectedServices[0];
    lines.push(`SERVIÇO: ${service.name}`);
    if (service.price !== null && service.price !== undefined) {
      lines.push(`PREÇO: R$ ${service.price.toFixed(2).replace(".", ",")}`);
    }
    if (service.durationMinutes > 0) {
      lines.push(`DURAÇÃO: ${service.durationMinutes} min`);
    }
  } else {
    lines.push("SERVIÇOS IDENTIFICADOS:");

    for (const service of context.selectedServices) {
      const detailParts: string[] = [];
      if (service.price !== null && service.price !== undefined) {
        detailParts.push(`R$ ${service.price.toFixed(2).replace(".", ",")}`);
      }
      if (service.durationMinutes > 0) {
        detailParts.push(`${service.durationMinutes} min`);
      }
      lines.push(`- ${service.name}${detailParts.length ? ` (${detailParts.join(" | ")})` : ""}`);
    }

    if (context.totalPrice !== null && context.totalPrice !== undefined) {
      lines.push(`TOTAL COMBINADO: R$ ${context.totalPrice.toFixed(2).replace(".", ",")}`);
    }
  }

  if (context.customerAddress !== undefined) {
    lines.push(`ENDEREÇO INFORMADO: ${context.customerAddress}`);
  }

  lines.push("PRÓXIMO PASSO: verificar horários disponíveis na agenda");

  return lines.join("\n");
}

function formatSchedulingDisambiguationServiceLine(
  service: Pick<SchedulingServiceRecord, "name" | "duration_minutes" | "price">,
): string {
  const detailParts: string[] = [];

  if (service.price !== null && service.price !== undefined) {
    detailParts.push(`R$ ${Number(service.price).toFixed(2).replace(".", ",")}`);
  }

  if (service.duration_minutes) {
    detailParts.push(`${Number(service.duration_minutes)} min`);
  }

  return `- ${service.name}${detailParts.length ? ` (${detailParts.join(" | ")})` : ""}`;
}

function buildSchedulingDisambiguationReply(services: SchedulingServiceRecord[]): string {
  const limitedServices = services.slice(0, 6);
  const lines = [
    "PEDIDO AMBIGUO:",
    "O cliente descreveu o servico de forma generica e ainda nao da para assumir qual item do catalogo ele quer.",
    "OPCOES RELACIONADAS:",
    ...limitedServices.map((service) => formatSchedulingDisambiguationServiceLine(service)),
  ];

  if (services.length > limitedServices.length) {
    lines.push(`- ... e mais ${services.length - limitedServices.length} opcao(oes) parecida(s) no catalogo`);
  }

  lines.push("PROXIMO PASSO: confirmar qual servico especifico o cliente deseja antes de seguir para agenda.");

  return lines.join("\n");
}

function buildSchedulingDisambiguationTurnRule(services: SchedulingServiceRecord[]): string {
  const disambiguationReply = buildSchedulingDisambiguationReply(services);
  return `\nREGRA EXTRA DESTE TURNO:\n- O cliente descreveu o servico de forma generica e ainda NAO ha contexto suficiente para escolher um item especifico do catalogo.\n- NAO assuma um servico por conta propria.\n- Use SOMENTE as opcoes relacionadas abaixo como base para pedir esclarecimento.\n- Pergunte de forma natural qual exame/servico/regiao ele quer antes de falar em agenda.\n- Se houver muitas opcoes, cite so algumas representativas e convide o cliente a dizer qual delas faz sentido.\n- NAO use frases template.\n${disambiguationReply}\n`;
}

function buildSchedulingDisambiguationTurnRuleFromReply(disambiguationReply: string): string {
  const trimmedReply = String(disambiguationReply || "").trim();
  if (!trimmedReply) {
    return "";
  }

  return `\nREGRA EXTRA DESTE TURNO:\n- O cliente descreveu o servico de forma generica e ainda NAO ha contexto suficiente para escolher um item especifico do catalogo.\n- NAO assuma um servico por conta propria.\n- Use SOMENTE as opcoes relacionadas abaixo como base para pedir esclarecimento.\n- Pergunte de forma natural qual exame/servico/regiao ele quer antes de falar em agenda.\n- Se houver muitas opcoes, cite so algumas representativas e convide o cliente a dizer qual delas faz sentido.\n- NAO use frases template.\n${trimmedReply}\n`;
}

export function isSchedulingDisambiguationReply(reply: string): boolean {
  const normalized = normalizeTextForComparison(reply);
  return normalized.includes("pedido ambiguo") && normalized.includes("opcoes relacionadas");
}

function isSchedulingQuoteStructuredReply(reply: string): boolean {
  const normalized = normalizeTextForComparison(reply);
  return normalized.includes("servico:")
    || normalized.includes("servicos identificados:")
    || normalized.includes("proximo passo: verificar horarios disponiveis na agenda");
}

function resolvePlannerSlotSelection(
  decision: SchedulingPlannerDecision,
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
  rememberedState?: SchedulingConversationState | null,
): { date: string | null; time: string | null } {
  const currentTurnIntent = inferSchedulingIntentFromConversation(messageText, conversationHistory);
  const recentRequestedSlot = findRecentRequestedSchedulingSlot(conversationHistory);
  return {
    date: decision.selectedDate
      || decision.requestedDate
      || currentTurnIntent.requestedDate
      || rememberedState?.confirmedDate
      || rememberedState?.selectedDate
      || recentRequestedSlot?.requestedDate
      || null,
    time: decision.selectedTime
      || decision.requestedTime
      || currentTurnIntent.requestedTime
      || rememberedState?.confirmedTime
      || rememberedState?.selectedTime
      || recentRequestedSlot?.requestedTime
      || null,
  };
}

async function resolveRecentCustomerServiceBundle(
  userId: string,
  conversationHistory: SchedulingTurnHistoryMessage[],
  config: SchedulingConfig,
  activeServices: SchedulingServiceRecord[],
): Promise<ResolvedSchedulingServiceBundle | null> {
  const recentCustomerMessages = [...conversationHistory]
    .reverse()
    .filter((message) =>
      !message?.fromMe
      && String(message?.text || "").trim().length > 0
      && isLikelySchedulingServiceDescriptionMessage(String(message?.text || ""), conversationHistory),
    )
    .slice(0, 8);

  for (const message of recentCustomerMessages) {
    const bundle = await resolveSchedulingServiceBundle(userId, String(message.text || ""), config, {
      activeServices,
      contextCandidates: [String(message.text || "")],
    });

    if (schedulingBundleHasResolvedCatalogServices(bundle)) {
      return bundle;
    }
  }

  return null;
}

async function resolvePlannerCustomerInfo(
  decision: SchedulingPlannerDecision,
  messageText: string,
  requiresCustomerAddress: boolean,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
  rememberedState?: SchedulingConversationState | null,
): Promise<{ customerName?: string; customerAddress?: string }> {
  const extractedInfo = extractSchedulingCustomerInfo(messageText, requiresCustomerAddress);
  const recentAssistantPrompt = findLastAssistantSchedulingConfirmationPrompt(conversationHistory);
  const recentAssistantPromptNormalized = normalizeSchedulingMessage(recentAssistantPrompt || "");
  const hasConfirmedSchedulingProgress = Boolean(
    rememberedState?.confirmedDate
    && rememberedState?.confirmedTime,
  );
  const inferredStandaloneName = !decision.customerName
    && !extractedInfo.customerName
    && messageLooksLikeStandaloneSchedulingName(messageText)
    && (
      recentAssistantPromptNormalized.includes("nome completo")
      || recentAssistantPromptNormalized.includes("seu nome")
      || hasConfirmedSchedulingProgress
    )
    ? cleanSchedulingCustomerField(messageText)
    : "";
  const customerName = cleanSchedulingCustomerField(
    decision.customerName
      || extractedInfo.customerName
      || inferredStandaloneName
      || rememberedState?.customerName
      || "",
  );
  // If the assistant just asked for the address, accept whatever the user typed
  const justAskedAddress = assistantJustAskedForAddress(conversationHistory);
  const inferredStandaloneAddress = !decision.customerAddress
    && !extractedInfo.customerAddress
    && justAskedAddress
    && requiresCustomerAddress
    && String(messageText || "").trim().length > 0
    ? cleanSchedulingCustomerField(messageText)
    : "";

  const customerAddress = cleanSchedulingCustomerField(
    decision.customerAddress
      || extractedInfo.customerAddress
      || inferredStandaloneAddress
      || rememberedState?.customerAddress
      || "",
  );

  // LLM fallback: if rigid extraction failed AND we have scheduling context that needs info,
  // use LLM to interpret natural language (e.g., user sends "Name\nAddress\nEmail" without cues).
  const needsLLMFallback = (!customerName || (requiresCustomerAddress && !customerAddress))
    && hasConfirmedSchedulingProgress
    && String(messageText || "").trim().length > 3
    && (justAskedAddress || Boolean(recentAssistantPrompt) || hasConfirmedSchedulingProgress);

  if (needsLLMFallback) {
    console.log(`📅 [CustomerInfo] Rigid extraction incomplete (name=${customerName || "(none)"}, addr=${customerAddress || "(none)"}) — trying LLM fallback`);
    const llmInfo = await extractCustomerInfoViaLLM(messageText, conversationHistory, requiresCustomerAddress);
    if (llmInfo) {
      return {
        customerName: customerName || llmInfo.customerName || undefined,
        customerAddress: customerAddress || llmInfo.customerAddress || undefined,
      };
    }
  }

  return {
    customerName: customerName || undefined,
    customerAddress: customerAddress || undefined,
  };
}

async function validateExactSchedulingSlot(
  userId: string,
  date: string,
  time: string,
  config: SchedulingConfig,
  serviceBundle: ResolvedSchedulingServiceBundle,
): Promise<{ available: true; slot: TimeSlot } | { available: false; alternatives: NextAvailableDaySlots[] }> {
  const slotsForRequestedDate = await getAvailableSlots(userId, date, config, {
    serviceDurationMinutes: serviceBundle.totalDurationMinutes,
  });
  const availableSlots = slotsForRequestedDate.filter((slot) => slot.available);
  const matchedSlot = findClosestSchedulingSlotWithinTolerance(availableSlots, time);

  if (matchedSlot) {
    return {
      available: true,
      slot: matchedSlot,
    };
  }

  const alternatives = availableSlots.length > 0
    ? [{ date, slots: availableSlots.slice(0, 6) }]
    : await getNextAvailableSlots(userId, 1, {
        serviceDurationMinutes: serviceBundle.totalDurationMinutes,
      });

  return {
    available: false,
    alternatives,
  };
}

async function ensureConfirmedSchedulingSlot(
  userId: string,
  clientPhone: string,
  config: SchedulingConfig,
  serviceBundle: ResolvedSchedulingServiceBundle,
  rememberedState: SchedulingConversationState | null,
  targetDate: string | null,
  targetTime: string | null,
): Promise<
  | {
      ok: true;
      rememberedState: SchedulingConversationState | null;
      confirmedDate: string | null;
      confirmedTime: string | null;
    }
  | {
      ok: false;
      reply: string;
    }
> {
  if (rememberedState?.confirmedDate && rememberedState?.confirmedTime) {
    return {
      ok: true,
      rememberedState,
      confirmedDate: rememberedState.confirmedDate,
      confirmedTime: rememberedState.confirmedTime,
    };
  }

  if (!targetDate || !targetTime) {
    return {
      ok: true,
      rememberedState,
      confirmedDate: null,
      confirmedTime: null,
    };
  }

  const rememberedOfferedSlot = resolveRememberedOfferedSchedulingSlot(
    rememberedState,
    serviceBundle,
    targetDate,
    targetTime,
  );
  if (rememberedOfferedSlot) {
    const nextState = rememberSchedulingConversationState(userId, clientPhone, {
      confirmedDate: rememberedOfferedSlot.date,
      confirmedTime: rememberedOfferedSlot.time,
      selectedDate: rememberedOfferedSlot.date,
      selectedTime: rememberedOfferedSlot.time,
      offeredSlots: [],
      offeredSlotsServiceKey: "",
    });

    return {
      ok: true,
      rememberedState: nextState || rememberedState,
      confirmedDate: rememberedOfferedSlot.date,
      confirmedTime: rememberedOfferedSlot.time,
    };
  }

  const exactValidation = await validateExactSchedulingSlot(
    userId,
    targetDate,
    targetTime,
    config,
    serviceBundle,
  );

  if (!exactValidation.available) {
    return {
      ok: false,
      reply: buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, serviceBundle, exactValidation.alternatives, {
        requiresCustomerAddress: serviceBundle.requiresCustomerAddress,
        unavailableDate: targetDate,
      }) || "Não encontrei esse horário disponível agora. Posso te mostrar outros horários reais.",
    };
  }

  const nextState = rememberSchedulingConversationState(userId, clientPhone, {
    confirmedDate: targetDate,
    confirmedTime: exactValidation.slot.start,
    selectedDate: targetDate,
    selectedTime: exactValidation.slot.start,
    offeredSlots: [],
    offeredSlotsServiceKey: "",
  });

  return {
    ok: true,
    rememberedState: nextState || rememberedState,
    confirmedDate: targetDate,
    confirmedTime: exactValidation.slot.start,
  };
}

function buildFallbackSchedulingPlannerDecision(input: {
  messageText: string;
  conversationHistory: SchedulingTurnHistoryMessage[];
  rememberedState: SchedulingConversationState | null;
  serviceBundle: ResolvedSchedulingServiceBundle;
}): SchedulingPlannerDecision | null {
  const currentIntent = inferSchedulingIntentFromConversation(input.messageText, input.conversationHistory);
  const extractedInfo = extractSchedulingCustomerInfo(
    input.messageText,
    input.serviceBundle.requiresCustomerAddress,
  );
  const standaloneName = messageLooksLikeStandaloneSchedulingName(input.messageText)
    ? cleanSchedulingCustomerField(input.messageText)
    : "";
  const selectedServiceIds = (input.rememberedState?.selectedServices || input.serviceBundle.selectedServices)
    .map((service) => String(service.id || "").trim())
    .filter(Boolean);

  if (
    hasRecentAssistantSchedulingChoicePrompt(input.conversationHistory)
    && currentIntent.requestedDate
    && currentIntent.requestedTime
  ) {
    return {
      shouldHandle: true,
      action: "READY_TO_BOOK",
      selectedServiceIds,
      requestedDate: currentIntent.requestedDate,
      requestedTime: currentIntent.requestedTime,
      selectedDate: currentIntent.requestedDate,
      selectedTime: currentIntent.requestedTime,
      customerName: null,
      customerAddress: null,
      wantsSchedulingNow: true,
      wantsBookingDetails: true,
      confidence: 0.99,
      reasoning: "fallback deterministico: cliente escolheu um horario oferecido",
    };
  }

  if (input.rememberedState?.confirmedDate && input.rememberedState?.confirmedTime) {
    const hasOperationalPayload = Boolean(
      extractedInfo.customerAddress
      || extractedInfo.customerName
      || standaloneName,
    );

    if (hasOperationalPayload) {
      return {
        shouldHandle: true,
        action: "READY_TO_BOOK",
        selectedServiceIds,
        requestedDate: input.rememberedState.confirmedDate,
        requestedTime: input.rememberedState.confirmedTime,
        selectedDate: input.rememberedState.confirmedDate,
        selectedTime: input.rememberedState.confirmedTime,
        customerName: extractedInfo.customerName || standaloneName || null,
        customerAddress: extractedInfo.customerAddress || null,
        wantsSchedulingNow: true,
        wantsBookingDetails: true,
        confidence: 0.99,
        reasoning: "fallback deterministico: cliente respondeu dado operacional apos horario travado",
      };
    }
  }

  const hasOperationalPayloadWithoutConfirmedSlot = Boolean(
    selectedServiceIds.length > 0
    && (
      extractedInfo.customerAddress
      || extractedInfo.customerName
      || standaloneName
    )
    && !input.rememberedState?.confirmedDate
    && !input.rememberedState?.confirmedTime
    && hasRecentSchedulingContext(input.conversationHistory),
  );

  if (hasOperationalPayloadWithoutConfirmedSlot) {
    return {
      shouldHandle: true,
      action: "REQUEST_SLOT_SELECTION",
      selectedServiceIds,
      requestedDate: currentIntent.requestedDate || null,
      requestedTime: currentIntent.requestedTime || null,
      selectedDate: null,
      selectedTime: null,
      customerName: extractedInfo.customerName || standaloneName || null,
      customerAddress: extractedInfo.customerAddress || null,
      wantsSchedulingNow: true,
      wantsBookingDetails: false,
      confidence: 0.99,
      reasoning: "fallback deterministico: cliente enviou dado operacional sem horario confirmado",
    };
  }

  return null;
}

function shouldPreferFallbackSchedulingDecision(
  primaryDecision: SchedulingPlannerDecision | null,
  fallbackDecision: SchedulingPlannerDecision | null,
): boolean {
  if (!fallbackDecision?.shouldHandle || fallbackDecision.action === "IGNORE") {
    return false;
  }

  if (!primaryDecision?.shouldHandle || primaryDecision.action === "IGNORE") {
    return true;
  }

  // NUNCA permitir que fallback override ações de cancelamento do planner LLM
  if (primaryDecision.action === "CANCEL_READY" || primaryDecision.action === "CANCEL_NEEDS_TARGET") {
    return false;
  }

  if (fallbackDecision.wantsSchedulingNow && !primaryDecision.wantsSchedulingNow) {
    return true;
  }

  if (
    fallbackDecision.action === "READY_TO_BOOK"
    && primaryDecision.action !== "READY_TO_BOOK"
  ) {
    return true;
  }

  if (
    fallbackDecision.action === "REQUEST_SLOT_SELECTION"
    && (
      primaryDecision.action === "QUOTE_ONLY"
      || primaryDecision.action === "LOOKUP_NEXT_SLOTS"
      || primaryDecision.action === "LOOKUP_DATE_AVAILABILITY"
      || primaryDecision.action === "CHECK_EXACT_SLOT"
    )
  ) {
    return true;
  }

  return false;
}

function buildSchedulingValidatedTurnRule(validatedReply: string): string {
  const trimmedReply = String(validatedReply || "").trim();
  if (!trimmedReply) {
    return "";
  }

  return `\nREGRA EXTRA DESTE TURNO (OBRIGATÓRIA — resultado da consulta real à agenda):\n- A decisão de agendamento deste turno já foi validada pelo executor com consulta real ao Google Calendar e agendamentos internos.\n- SIGA EXATAMENTE o resultado abaixo. Estes são os ÚNICOS horários reais disponíveis.\n- NÃO invente, adicione ou sugira outros horários além dos listados abaixo.\n- Se o bloco abaixo listar horários reais e o cliente escolher um deles nos próximos turnos, trate esse horário como memória válida da conversa e continue o atendimento sem mandar pesquisar tudo de novo.\n- Se a lista validada trouxer horários reais de um único dia e o cliente responder só com a hora (ex: '9h45' ou 'pode ser 9h45'), trate isso como escolha válida do slot já oferecido.\n- A agenda só deve ser consultada novamente se o cliente pedir outro dia/horário ou se o executor avisar que houve conflito ao registrar.\n- NÃO pule etapas: se o sistema pede nome/endereço, peça ao cliente antes de confirmar.\n- Se o serviço exige ir até o local do cliente (EXIGE ENDEREÇO), colete o endereço ANTES de usar a tag [AGENDAR:].\n- O telefone do cliente já está na conversa — NÃO pergunte o telefone.\n${trimmedReply}\n`;
}

/**
 * Detects whether the resolved service bundle represents an ambiguous query
 * (e.g., "Faz ultrassom?" matching 5 ultrasound types) that should be
 * delegated to the main LLM to ask the client which specific service they want.
 */
function isAmbiguousServiceQuery(
  serviceBundle: ResolvedSchedulingServiceBundle,
): boolean {
  // Confia na decisão do LLM: se ele disse que é ambíguo, é ambíguo.
  // Não exige length > 1 porque o LLM pode retornar 1 "best guess" mesmo sendo ambíguo.
  return serviceBundle.isAmbiguousMatch === true;
}

function buildSchedulingQuoteTurnRule(quoteReply: string): string {
  const trimmedReply = String(quoteReply || "").trim();
  if (!trimmedReply) {
    return "";
  }

  return `\nREGRA EXTRA DESTE TURNO:\n- A conversa ainda está em fase de orçamento/descrição do serviço.\n- NÃO responda com horários nem tente agendar ainda.\n- NUNCA invente ou sugira horários específicos. Se o cliente perguntar sobre disponibilidade, diga que vai verificar na agenda.\n- Use os DADOS ESTRUTURADOS abaixo como verdade deste turno. Responda de forma NATURAL e CONVERSACIONAL, como uma IA inteligente conversando pelo WhatsApp.\n- NÃO copie os dados no formato listado — transforme-os em uma resposta fluida e humana seguindo o prompt principal do cliente.\n- NUNCA use frases template como "Encontrei essa opção pra você" ou "Separei estas possibilidades" — fale com suas próprias palavras.\n${trimmedReply}\n`;
}

async function generateStateFirstSchedulingReply(input: {
  userId: string;
  clientPhone: string;
  messageText: string;
  conversationHistory: SchedulingTurnHistoryMessage[];
  config: SchedulingConfig;
  serviceBundle: ResolvedSchedulingServiceBundle;
  rememberedState: SchedulingConversationState | null;
  pendingApprovalDate: string | null;
  shouldPersistCurrentBundle: boolean;
  ambiguousServices?: SchedulingServiceRecord[];
}): Promise<string | null> {
  const {
    userId,
    clientPhone,
    messageText,
    conversationHistory,
    config,
    serviceBundle,
    pendingApprovalDate,
    shouldPersistCurrentBundle,
    ambiguousServices,
  } = input;
  let rememberedState = input.rememberedState;

  if (!schedulingBundleHasResolvedCatalogServices(serviceBundle)) {
    console.log(`📅 [StateFirst] EARLY EXIT — no catalog services in bundle. Bundle: ${serviceBundle.combinedServiceName}, services: ${JSON.stringify(serviceBundle.selectedServices.map(s => ({ id: s.id, name: s.name })))}`);
    return null;
  }

  const currentIntent = inferSchedulingIntentFromConversation(messageText, conversationHistory);

  // Se o cliente quer cancelar, deixar o planner LLM decidir — não interceptar aqui
  if (currentIntent.type === 'cancel_appointment') {
    console.log(`📅 [StateFirst] Cancel intent detected — delegating to planner`);
    return null;
  }

  const recentChoicePrompt = hasRecentAssistantSchedulingChoicePrompt(conversationHistory);
  const recentRequestedSlot = findRecentRequestedSchedulingSlot(conversationHistory);
  const noopDecision: SchedulingPlannerDecision = {
    shouldHandle: false,
    action: "IGNORE",
    selectedServiceIds: [],
    requestedDate: null,
    requestedTime: null,
    selectedDate: null,
    selectedTime: null,
    customerName: null,
    customerAddress: null,
    wantsSchedulingNow: false,
    wantsBookingDetails: false,
    confidence: 0,
    reasoning: null,
  };
  const customerInfo = await resolvePlannerCustomerInfo(
    noopDecision,
    messageText,
    serviceBundle.requiresCustomerAddress,
    conversationHistory,
    rememberedState,
  );
  const hasConfirmedSlot = Boolean(rememberedState?.confirmedDate && rememberedState?.confirmedTime);
  const hasStandaloneNamePayload = Boolean(
    recentChoicePrompt
    && messageLooksLikeStandaloneSchedulingName(messageText),
  );
  const hasOperationalPayload = Boolean(
    customerInfo.customerAddress
    || customerInfo.customerName
    || hasStandaloneNamePayload,
  );
  const hasRememberedServiceContext = Boolean(rememberedState?.selectedServices?.length);
  const isAffirmativeSchedulingFollowUp = Boolean(
    looksLikeAffirmativeReply(messageText)
    && hasRememberedServiceContext
    && !hasConfirmedSlot
    && !hasOperationalPayload,
  );
  const wantsAvailabilityLookup = Boolean(
    isAvailabilityLookupFollowUp(messageText, conversationHistory)
    || isAffirmativeSchedulingFollowUp
    || isGenericAvailabilityLookup(messageText)
    || currentIntent.type === "check_availability"
    || currentIntent.type === "reschedule"
    || (currentIntent.type === "book_appointment" && !currentIntent.requestedDate && !currentIntent.requestedTime)
  );

  rememberSchedulingConversationState(userId, clientPhone, {
    selectedServices: shouldPersistCurrentBundle ? serviceBundle.selectedServices : undefined,
    totalDurationMinutes: shouldPersistCurrentBundle ? serviceBundle.totalDurationMinutes : undefined,
    totalPrice: shouldPersistCurrentBundle ? serviceBundle.totalPrice : undefined,
    requiresCustomerAddress: shouldPersistCurrentBundle ? serviceBundle.requiresCustomerAddress : undefined,
    customerName: customerInfo.customerName,
    customerAddress: customerInfo.customerAddress,
  });
  rememberedState = getSchedulingConversationState(userId, clientPhone);
  const rememberedSlotFromOfferedContext = !hasConfirmedSlot
    ? resolveImplicitRememberedOfferedSchedulingSlot(
        rememberedState,
        serviceBundle,
        currentIntent.requestedDate || null,
        currentIntent.requestedTime || null,
      )
    : null;
  const assistantSuggestedSlot = (
    !hasConfirmedSlot
    && !rememberedSlotFromOfferedContext
    && hasOperationalPayload
  )
    ? findRecentAssistantSuggestedSchedulingSlot(conversationHistory)
    : null;
  const slotSelectionDate = currentIntent.requestedDate
    || rememberedSlotFromOfferedContext?.date
    || assistantSuggestedSlot?.date
    || null;
  const slotSelectionTime = currentIntent.requestedTime
    || rememberedSlotFromOfferedContext?.time
    || assistantSuggestedSlot?.time
    || null;
  const slotSelectionNeedsRecentChoicePrompt = Boolean(
    (rememberedSlotFromOfferedContext || assistantSuggestedSlot)
    && !currentIntent.requestedDate,
  );
  const hasSlotSelectionContext = slotSelectionNeedsRecentChoicePrompt
    ? (recentChoicePrompt || Boolean(assistantSuggestedSlot))
    : (recentChoicePrompt || hasRememberedServiceContext);

  if (
    !hasConfirmedSlot
    && slotSelectionDate
    && slotSelectionTime
    && hasSlotSelectionContext
  ) {
    console.log(`📅 [StateFirst] Slot selection path: date=${slotSelectionDate} time=${slotSelectionTime} remembered=${rememberedSlotFromOfferedContext ? "yes" : "no"}`);
    const lockedSlot = await ensureConfirmedSchedulingSlot(
      userId,
      clientPhone,
      config,
      serviceBundle,
      rememberedState,
      slotSelectionDate,
      slotSelectionTime,
    );
    if (!lockedSlot.ok) {
      return lockedSlot.reply;
    }
    rememberedState = lockedSlot.rememberedState;

    if (serviceBundle.requiresCustomerAddress && !customerInfo.customerAddress) {
      return getSchedulingAddressPrompt();
    }

    if (!customerInfo.customerName) {
      return getSchedulingNamePrompt();
    }
  }

  if (hasConfirmedSlot || (rememberedState?.confirmedDate && rememberedState?.confirmedTime)) {
    const confirmedDate = rememberedState?.confirmedDate || null;
    const confirmedTime = rememberedState?.confirmedTime || null;

    if (serviceBundle.requiresCustomerAddress && !customerInfo.customerAddress) {
      return getSchedulingAddressPrompt();
    }

    if (!customerInfo.customerName) {
      return getSchedulingNamePrompt();
    }

    if (!confirmedDate || !confirmedTime) {
      return null;
    }

    const existingSameDayAppointments = await getClientAppointmentsForDate(userId, clientPhone, confirmedDate);
    const approvalToken = pendingApprovalDate && pendingApprovalDate === confirmedDate ? "SIM" : undefined;
    if (existingSameDayAppointments.length > 0 && approvalToken !== "SIM") {
      rememberSameDayRebookingApproval(userId, clientPhone, confirmedDate);
      const appointmentSummary = existingSameDayAppointments
        .map((appointment) => `${normalizeSchedulingTimeValue(appointment.start_time)} (${appointment.service_name || "agendamento"})`)
        .join(", ");
      return `Você já possui agendamento no dia ${formatSchedulingDayLabel(confirmedDate)}: ${appointmentSummary}. Quer mesmo criar mais um horário nesse mesmo dia?`;
    }

    return buildDeterministicSchedulingCreationReply(
      confirmedDate,
      confirmedTime,
      customerInfo.customerName,
      serviceBundle.combinedServiceName || "Agendamento",
      customerInfo.customerAddress,
      { approvalToken },
    );
  }

  if (hasOperationalPayload && !hasConfirmedSlot) {
    return buildSchedulingSlotSelectionReminderReply({
      userId,
      clientPhone,
      serviceBundle,
      rememberedState,
      leadingText: "Antes de eu finalizar, preciso que você escolha um dos horários disponíveis primeiro.",
    });
  }

  if (
    recentChoicePrompt
    && !hasConfirmedSlot
    && currentIntent.requestedTime
    && !currentIntent.requestedDate
    && !rememberedSlotFromOfferedContext
  ) {
    console.log(`📅 [StateFirst] explicit time ${currentIntent.requestedTime} does not match remembered offered slots — asking for a real listed slot`);
    return buildSchedulingSlotSelectionReminderReply({
      userId,
      clientPhone,
      serviceBundle,
      rememberedState,
      leadingText: "Preciso que você escolha um dia e horário específico da lista abaixo:",
    });
  }

  // Se a assistente acabou de mostrar horários e o regex não extraiu data+hora completa,
  // usar LLM dedicada (estilo OpenClaw) para interpretar typos e linguagem natural.
  if (recentChoicePrompt && !hasConfirmedSlot && !(currentIntent.requestedDate && currentIntent.requestedTime)) {
    console.log(`📅 [StateFirst] recentChoicePrompt=true but regex failed (date=${currentIntent.requestedDate}, time=${currentIntent.requestedTime}) — trying deterministic ordinal + LLM slot extraction`);

    // DETERMINISTIC ORDINAL: Handle "primeiro", "pode ser", "qualquer um", etc. without LLM
    const ordinalSlot = extractOrdinalSlotFromListing(messageText, conversationHistory);

    const llmSlot = ordinalSlot || await extractSlotSelectionViaLLM(messageText, conversationHistory);
    if (llmSlot) {
      console.log(`📅 [StateFirst] LLM extracted slot: date=${llmSlot.date} time=${llmSlot.time}`);
      const lockedSlot = await ensureConfirmedSchedulingSlot(
        userId,
        clientPhone,
        config,
        serviceBundle,
        rememberedState,
        llmSlot.date,
        llmSlot.time,
      );
      if (!lockedSlot.ok) {
        return lockedSlot.reply;
      }
      rememberedState = lockedSlot.rememberedState;

      if (serviceBundle.requiresCustomerAddress && !customerInfo.customerAddress) {
        return getSchedulingAddressPrompt();
      }

      if (!customerInfo.customerName) {
        return getSchedulingNamePrompt();
      }

      // Slot locked + name + address present: proceed to booking
      const cd = lockedSlot.confirmedDate;
      const ct = lockedSlot.confirmedTime;
      if (cd && ct) {
        const existingSameDay = await getClientAppointmentsForDate(userId, clientPhone, cd);
        const approvalToken = pendingApprovalDate && pendingApprovalDate === cd ? "SIM" : undefined;
        if (existingSameDay.length > 0 && approvalToken !== "SIM") {
          rememberSameDayRebookingApproval(userId, clientPhone, cd);
          const summary = existingSameDay
            .map((a) => `${normalizeSchedulingTimeValue(a.start_time)} (${a.service_name || "agendamento"})`)
            .join(", ");
          return `Você já possui agendamento no dia ${formatSchedulingDayLabel(cd)}: ${summary}. Quer mesmo criar mais um horário nesse mesmo dia?`;
        }
        return buildDeterministicSchedulingCreationReply(
          cd,
          ct,
          customerInfo.customerName,
          serviceBundle.combinedServiceName || "Agendamento",
          customerInfo.customerAddress,
          { approvalToken },
        );
      }
    }

    // Se a LLM também não conseguiu, re-mostrar os slots com pedido explícito
    // (NÃO delegar ao planner geral que repetiria slots sem orientação)
    console.log(`📅 [StateFirst] LLM extraction also failed — re-showing slots with specific request`);
    return buildSchedulingSlotSelectionReminderReply({
      userId,
      clientPhone,
      serviceBundle,
      rememberedState,
      leadingText: "Preciso que você escolha um dia e horário específico da lista abaixo:",
    });
  }

  // Quando a assistente acabou de mostrar slots, NÃO re-buscar (o cliente pode estar selecionando)
  if (wantsAvailabilityLookup && !hasConfirmedSlot && !recentChoicePrompt) {
    const nextSlots = await getNextAvailableSlots(userId, 1, {
      serviceDurationMinutes: serviceBundle.totalDurationMinutes,
    });
    return buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, serviceBundle, nextSlots, {
      requiresCustomerAddress: serviceBundle.requiresCustomerAddress,
    });
  }

  if (
    !hasConfirmedSlot
    && !wantsAvailabilityLookup
    && !recentChoicePrompt
    && !recentRequestedSlot
    && !currentIntent.requestedDate
    && !currentIntent.requestedTime
  ) {
    // Se a pergunta é ambígua (LLM decidiu), delegar ao LLM principal
    if (isAmbiguousServiceQuery(serviceBundle)) {
      console.log(`📅 [StateFirst] Pergunta ambígua detectada — retornando desambiguação do catálogo`);
      return ambiguousServices && ambiguousServices.length > 0
        ? buildSchedulingDisambiguationReply(ambiguousServices)
        : null;
    }

    return buildSchedulingQuoteReply({
      domain: "scheduling",
      selectedServices: serviceBundle.selectedServices,
      totalDurationMinutes: serviceBundle.totalDurationMinutes,
      totalPrice: serviceBundle.totalPrice,
      customerAddress: customerInfo.customerAddress,
      requiresCustomerAddress: serviceBundle.requiresCustomerAddress,
    });
  }

  return null;
}

async function generatePlannerDrivenSchedulingReply(
  userId: string,
  clientPhone: string,
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): Promise<string | null> {
  const config = await getSchedulingConfigCached(userId);
  if (!config || !config.is_enabled) {
    return null;
  }

  const pendingApprovalDate = looksLikeAffirmativeReply(messageText)
    ? findPendingSameDayApprovalDate(userId, clientPhone)
    : null;
  const activeServices = await listActiveSchedulingServices(userId);
  const currentMessageLooksLikeServiceDescription = isLikelySchedulingServiceDescriptionMessage(
    messageText,
    conversationHistory,
  );
  const serviceContextCandidates = buildSchedulingServiceContextCandidates(messageText, conversationHistory);
  const serviceContextText = buildSchedulingServiceContextText(messageText, conversationHistory);
  let rememberedState = getSchedulingConversationState(userId, clientPhone);
  const currentMessageServiceBundle = await resolveSchedulingServiceBundle(userId, messageText, config, {
    activeServices,
    contextCandidates: [messageText],
  });
  const preliminaryServiceBundle = await resolveSchedulingServiceBundle(userId, serviceContextText, config, {
    activeServices,
    contextCandidates: serviceContextCandidates,
  });
  const recentCustomerServiceBundle = await resolveRecentCustomerServiceBundle(
    userId,
    conversationHistory,
    config,
    activeServices,
  );
  const ambiguousCurrentServices = buildRelevantSchedulingDisambiguationServices(
    messageText,
    activeServices,
    currentMessageServiceBundle.selectedServices.map((service) => service.id).filter(Boolean),
  );

  // ─── AMBIGUITY CHECK ─────────────────────────────────────────────────
  // If the current message matches multiple catalog services and there's
  // no prior scheduling progress (date/time selected), this is a vague
  // query like "Faz ultrassom?" — delegate to the main LLM so it can
  // present options and ask which specific service the client wants.
  const earlySchedulingProgress = Boolean(
    rememberedState?.confirmedDate || rememberedState?.confirmedTime
    || rememberedState?.selectedDate || rememberedState?.selectedTime,
  );
  if (
    isAmbiguousServiceQuery(currentMessageServiceBundle)
    && !earlySchedulingProgress
  ) {
    console.log(
      `📅 [Planner] AMBIGUOUS SERVICE QUERY — "${messageText}" matched `
      + `${currentMessageServiceBundle.selectedServices.length} services: `
      + `${currentMessageServiceBundle.selectedServices.map(s => s.name).join(', ')}. `
      + `Returning deterministic disambiguation.`,
    );
    return ambiguousCurrentServices.length > 0
      ? buildSchedulingDisambiguationReply(ambiguousCurrentServices)
      : null;
  }

  if (
    currentMessageLooksLikeServiceDescription
    && schedulingBundleHasResolvedCatalogServices(currentMessageServiceBundle)
  ) {
    rememberSchedulingConversationState(userId, clientPhone, {
      selectedServices: currentMessageServiceBundle.selectedServices,
      totalDurationMinutes: currentMessageServiceBundle.totalDurationMinutes,
      totalPrice: currentMessageServiceBundle.totalPrice,
      requiresCustomerAddress: currentMessageServiceBundle.requiresCustomerAddress,
    });
    rememberedState = getSchedulingConversationState(userId, clientPhone);
  }
  const shouldPreferCurrentMessageBundle = Boolean(
    currentMessageLooksLikeServiceDescription
    && schedulingBundleHasResolvedCatalogServices(currentMessageServiceBundle),
  );
  const rememberedBundle = buildResolvedBundleFromConversationState(config, rememberedState);
  const shouldFreezeRememberedBundle = Boolean(rememberedBundle)
    && !shouldPreferCurrentMessageBundle
    && !schedulingBundleHasResolvedCatalogServices(currentMessageServiceBundle);
  const hasRealSchedulingContext = Boolean(
    rememberedBundle
    || schedulingBundleHasResolvedCatalogServices(recentCustomerServiceBundle)
    || currentMessageLooksLikeServiceDescription,
  );
  const hasRememberedSchedulingProgress = Boolean(
    rememberedState?.confirmedDate
    || rememberedState?.confirmedTime
    || rememberedState?.selectedDate
    || rememberedState?.selectedTime,
  );
  if (!hasRealSchedulingContext && !hasRememberedSchedulingProgress) {
    return null;
  }
  const prePlannerCandidateBundle = shouldPreferCurrentMessageBundle
    ? currentMessageServiceBundle
    : (recentCustomerServiceBundle || preliminaryServiceBundle);
  const historyBundle = chooseEffectiveSchedulingServiceBundle(
    prePlannerCandidateBundle,
    rememberedBundle,
    { preferCurrentCatalogMatch: shouldPreferCurrentMessageBundle },
  );
  const effectivePrePlannerBundle = shouldFreezeRememberedBundle && rememberedBundle
    ? rememberedBundle
    : historyBundle;
  const stateFirstReply = await generateStateFirstSchedulingReply({
    userId,
    clientPhone,
    messageText,
    conversationHistory,
    config,
    serviceBundle: effectivePrePlannerBundle,
    rememberedState,
    pendingApprovalDate,
    shouldPersistCurrentBundle: schedulingBundleHasResolvedCatalogServices(currentMessageServiceBundle),
    ambiguousServices: ambiguousCurrentServices,
  });
  if (stateFirstReply) {
    return stateFirstReply;
  }
  const plannerDecision = await callSchedulingPlanner(
    userId,
    clientPhone,
    messageText,
    conversationHistory,
    config,
    preliminaryServiceBundle,
    activeServices,
  );
  let resolvedPlannerDecision = plannerDecision;
  const serviceBundle = await resolveSchedulingServiceBundle(userId, serviceContextText, config, {
    activeServices,
    selectedServiceIds: resolvedPlannerDecision?.selectedServiceIds,
    contextCandidates: serviceContextCandidates,
  });
  const plannerResolvedBundle = shouldPreferCurrentMessageBundle
    && !schedulingBundleHasResolvedCatalogServices(serviceBundle)
    ? currentMessageServiceBundle
    : serviceBundle;
  const effectiveServiceBundle = shouldFreezeRememberedBundle && rememberedBundle
    ? rememberedBundle
    : chooseEffectiveSchedulingServiceBundle(plannerResolvedBundle, rememberedBundle, {
        preferCurrentCatalogMatch: shouldPreferCurrentMessageBundle,
      });

  const fallbackPlannerDecision = buildFallbackSchedulingPlannerDecision({
    messageText,
    conversationHistory,
    rememberedState,
    serviceBundle: effectiveServiceBundle,
  });

  if (shouldPreferFallbackSchedulingDecision(resolvedPlannerDecision, fallbackPlannerDecision)) {
    resolvedPlannerDecision = fallbackPlannerDecision;
  }

  if (!resolvedPlannerDecision?.shouldHandle || resolvedPlannerDecision.action === "IGNORE") {
    return null;
  }

  const { date: targetDate, time: targetTime } = resolvePlannerSlotSelection(
    resolvedPlannerDecision,
    messageText,
    conversationHistory,
    rememberedState,
  );
  const customerInfo = await resolvePlannerCustomerInfo(
    resolvedPlannerDecision,
    messageText,
    effectiveServiceBundle.requiresCustomerAddress,
    conversationHistory,
    rememberedState,
  );
  const recentRequestedSlot = findRecentRequestedSchedulingSlot(conversationHistory);
  const hasConfirmedBookingContext = Boolean(findLastAssistantSchedulingConfirmationPrompt(conversationHistory));
  const hasChoicePromptContext = hasRecentAssistantSchedulingChoicePrompt(conversationHistory);
  const hasExplicitRequestedSlot = Boolean(
    hasConfirmedBookingContext
    || (resolvedPlannerDecision.requestedDate && resolvedPlannerDecision.requestedTime)
    || recentRequestedSlot,
  );
  const hasSchedulingProgress = hasConfirmedBookingContext || hasChoicePromptContext || hasExplicitRequestedSlot;
  const hasMatchedCatalogServices = effectiveServiceBundle.selectedServices.some((service) => Boolean(service.id));
  const catalogIsConfigured = activeServices.length > 0;
  const quoteContext: SchedulingAppointmentContext = {
    domain: "scheduling",
    selectedServices: effectiveServiceBundle.selectedServices,
    totalDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
    totalPrice: effectiveServiceBundle.totalPrice,
    customerAddress: customerInfo.customerAddress,
    requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
  };

  const updatedConversationState = rememberSchedulingConversationState(userId, clientPhone, {
    selectedServices: hasMatchedCatalogServices ? effectiveServiceBundle.selectedServices : rememberedState?.selectedServices,
    totalDurationMinutes: hasMatchedCatalogServices ? effectiveServiceBundle.totalDurationMinutes : rememberedState?.totalDurationMinutes,
    totalPrice: hasMatchedCatalogServices ? effectiveServiceBundle.totalPrice : rememberedState?.totalPrice,
    requiresCustomerAddress: hasMatchedCatalogServices ? effectiveServiceBundle.requiresCustomerAddress : rememberedState?.requiresCustomerAddress,
    customerName: customerInfo.customerName,
    customerAddress: customerInfo.customerAddress,
    selectedDate: targetDate || rememberedState?.selectedDate,
    selectedTime: targetTime || rememberedState?.selectedTime,
  });
  rememberedState = updatedConversationState || rememberedState;
  const confirmedDate = rememberedState?.confirmedDate || null;
  const confirmedTime = rememberedState?.confirmedTime || null;

  if (
    catalogIsConfigured
    && !hasMatchedCatalogServices
    && !hasSchedulingProgress
    && resolvedPlannerDecision.wantsSchedulingNow !== true
    && resolvedPlannerDecision.action !== "CANCEL_READY"
    && resolvedPlannerDecision.action !== "CANCEL_NEEDS_TARGET"
  ) {
    return null;
  }

  if (
    resolvedPlannerDecision.wantsSchedulingNow === false
    && !hasSchedulingProgress
    && (
      resolvedPlannerDecision.action === "LOOKUP_NEXT_SLOTS"
      || resolvedPlannerDecision.action === "LOOKUP_DATE_AVAILABILITY"
      || resolvedPlannerDecision.action === "CHECK_EXACT_SLOT"
      || resolvedPlannerDecision.action === "REQUEST_SLOT_SELECTION"
      || resolvedPlannerDecision.action === "REQUEST_NAME"
      || resolvedPlannerDecision.action === "REQUEST_ADDRESS"
      || resolvedPlannerDecision.action === "READY_TO_BOOK"
    )
  ) {
    return null;
  }

  const actionNeedsRealSchedulingExecution =
    resolvedPlannerDecision.action === "LOOKUP_NEXT_SLOTS"
    || resolvedPlannerDecision.action === "LOOKUP_DATE_AVAILABILITY"
    || resolvedPlannerDecision.action === "CHECK_EXACT_SLOT"
    || resolvedPlannerDecision.action === "REQUEST_SLOT_SELECTION"
    || resolvedPlannerDecision.action === "REQUEST_NAME"
    || resolvedPlannerDecision.action === "REQUEST_ADDRESS"
    || resolvedPlannerDecision.action === "READY_TO_BOOK";

  if (actionNeedsRealSchedulingExecution && !hasSchedulingProgress) {
    const allowSchedulingExecution = await confirmSchedulingExecutionGate(
      userId,
      clientPhone,
      messageText,
      conversationHistory,
      resolvedPlannerDecision,
      serviceBundle,
      activeServices,
    );

    if (!allowSchedulingExecution) {
      return null;
    }
  }

  switch (resolvedPlannerDecision.action) {
    case "QUOTE_ONLY":
      return null;

    case "LOOKUP_NEXT_SLOTS": {
      // GUARD: Don't re-list slots when a slot is already confirmed in memory.
      // This prevents the loop where planner keeps showing slots even after user confirmed.
      if (confirmedDate && confirmedTime) {
        console.log(`📅 [Planner] GUARD: slot already confirmed (${confirmedDate} ${confirmedTime}) — overriding LOOKUP_NEXT_SLOTS`);
        if (effectiveServiceBundle.requiresCustomerAddress && !customerInfo.customerAddress) {
          return getSchedulingAddressPrompt();
        }
        if (!customerInfo.customerName) {
          return getSchedulingNamePrompt();
        }
        return buildDeterministicSchedulingCreationReply(
          confirmedDate,
          confirmedTime,
          customerInfo.customerName,
          effectiveServiceBundle.combinedServiceName || "Agendamento",
          customerInfo.customerAddress,
        );
      }

      const nextSlots = await getNextAvailableSlots(userId, 1, {
        serviceDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
      });
      return buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, nextSlots, {
        requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
      });
    }

    case "LOOKUP_DATE_AVAILABILITY": {
      // GUARD: Don't re-list slots when already confirmed
      if (confirmedDate && confirmedTime) {
        console.log(`📅 [Planner] GUARD: slot already confirmed (${confirmedDate} ${confirmedTime}) — overriding LOOKUP_DATE_AVAILABILITY`);
        if (effectiveServiceBundle.requiresCustomerAddress && !customerInfo.customerAddress) {
          return getSchedulingAddressPrompt();
        }
        if (!customerInfo.customerName) {
          return getSchedulingNamePrompt();
        }
        return buildDeterministicSchedulingCreationReply(
          confirmedDate,
          confirmedTime,
          customerInfo.customerName,
          effectiveServiceBundle.combinedServiceName || "Agendamento",
          customerInfo.customerAddress,
        );
      }

      if (!targetDate) {
      const nextSlots = await getNextAvailableSlots(userId, 1, {
        serviceDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
      });
      return buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, nextSlots, {
        requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
      });
    }

      const slotsForRequestedDate = await getAvailableSlots(userId, targetDate, config, {
        serviceDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
      });
      const availableSlots = slotsForRequestedDate.filter((slot) => slot.available);

      if (availableSlots.length === 0) {
        const nextSlots = await getNextAvailableSlots(userId, 1, {
          serviceDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
        });
        return buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, nextSlots, {
          requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
          unavailableDate: targetDate,
        });
      }

      return buildSchedulingNextSlotsReplyWithMemory(
        userId,
        clientPhone,
        effectiveServiceBundle,
        [{ date: targetDate, slots: availableSlots.slice(0, 8) }],
        {
          requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
        },
      );
    }

    case "CHECK_EXACT_SLOT": {
      if (!targetDate || !targetTime) {
        const nextSlots = await getNextAvailableSlots(userId, 1, {
          serviceDurationMinutes: serviceBundle.totalDurationMinutes,
        });
        return buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, serviceBundle, nextSlots, {
          requiresCustomerAddress: serviceBundle.requiresCustomerAddress,
        });
      }

      const slotsForRequestedDate = await getAvailableSlots(userId, targetDate, config, {
        serviceDurationMinutes: serviceBundle.totalDurationMinutes,
      });
      const availableSlots = slotsForRequestedDate.filter((slot) => slot.available);
      const matchedSlot = findExactAvailableSlot(availableSlots, targetTime)
        || findClosestAvailableSlot(availableSlots, targetTime);

      if (matchedSlot) {
        const nextState = rememberSchedulingConversationState(userId, clientPhone, {
          confirmedDate: targetDate,
          confirmedTime: matchedSlot.start,
          selectedDate: targetDate,
          selectedTime: matchedSlot.start,
        });
        rememberedState = nextState || rememberedState;

        if (resolvedPlannerDecision.wantsBookingDetails) {
          const dateLabel = formatSchedulingDayLabel(targetDate);
          const normalizedExactTime = normalizeSchedulingTimeValue(matchedSlot.start);

          if (effectiveServiceBundle.requiresCustomerAddress) {
            return `${dateLabel} às ${normalizedExactTime} está disponível! Pra finalizar, preciso do endereço do local.`;
          }

          return `${dateLabel} às ${normalizedExactTime} está disponível! Pra finalizar, preciso do seu nome completo.`;
        }

        return buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, [], {
          requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
          confirmedDate: targetDate,
          confirmedTime: matchedSlot.start,
          requestConfirmationDetails: false,
        });
      }

      const alternativeSlots = availableSlots.length > 0
        ? [{ date: targetDate, slots: availableSlots.slice(0, 6) }]
        : await getNextAvailableSlots(userId, 1, {
            serviceDurationMinutes: serviceBundle.totalDurationMinutes,
          });

      return buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, alternativeSlots, {
        requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
        unavailableDate: targetDate,
      });
    }

    case "REQUEST_SLOT_SELECTION": {
      // GUARD: Don't re-list slots when already confirmed
      if (confirmedDate && confirmedTime) {
        console.log(`📅 [Planner] GUARD: slot already confirmed (${confirmedDate} ${confirmedTime}) — overriding REQUEST_SLOT_SELECTION`);
        if (effectiveServiceBundle.requiresCustomerAddress && !customerInfo.customerAddress) {
          return getSchedulingAddressPrompt();
        }
        if (!customerInfo.customerName) {
          return getSchedulingNamePrompt();
        }
        return buildDeterministicSchedulingCreationReply(
          confirmedDate,
          confirmedTime,
          customerInfo.customerName,
          effectiveServiceBundle.combinedServiceName || "Agendamento",
          customerInfo.customerAddress,
        );
      }

      const nextSlots = await getNextAvailableSlots(userId, 1, {
        serviceDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
      });
      const nextSlotsReply = buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, nextSlots, {
        requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
      });

      if (!nextSlotsReply) {
        return "Antes de eu finalizar, preciso que você escolha um horário disponível primeiro.";
      }

      return `Antes de eu finalizar, preciso que você escolha um dos horários disponíveis primeiro.\n${nextSlotsReply}`;
    }

    case "REQUEST_NAME": {
      if (!hasExplicitRequestedSlot) {
        const nextSlots = await getNextAvailableSlots(userId, 1, {
          serviceDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
        });
        const nextSlotsReply = buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, nextSlots, {
          requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
        });
        return nextSlotsReply
          ? `Antes de eu pedir seus dados, preciso validar um horário real para você.\n${nextSlotsReply}`
          : "Antes de eu pedir seus dados, preciso validar um horário disponível primeiro.";
      }

      const lockedSlot = await ensureConfirmedSchedulingSlot(
        userId,
        clientPhone,
        config,
        effectiveServiceBundle,
        rememberedState,
        targetDate,
        targetTime,
      );
      if (!lockedSlot.ok) {
        return lockedSlot.reply;
      }
      rememberedState = lockedSlot.rememberedState;

      if (effectiveServiceBundle.requiresCustomerAddress && !customerInfo.customerAddress) {
        return getSchedulingAddressPrompt();
      }

      return getSchedulingNamePrompt();
    }

    case "REQUEST_ADDRESS": {
      if (!hasExplicitRequestedSlot) {
        const nextSlots = await getNextAvailableSlots(userId, 1, {
          serviceDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
        });
        const nextSlotsReply = buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, nextSlots, {
          requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
        });
        return nextSlotsReply
          ? `Antes de eu pedir o endereço, preciso validar um horário real para você.\n${nextSlotsReply}`
          : "Antes de eu pedir o endereço, preciso validar um horário disponível primeiro.";
      }

      const lockedSlot = await ensureConfirmedSchedulingSlot(
        userId,
        clientPhone,
        config,
        effectiveServiceBundle,
        rememberedState,
        targetDate,
        targetTime,
      );
      if (!lockedSlot.ok) {
        return lockedSlot.reply;
      }
      rememberedState = lockedSlot.rememberedState;

      return getSchedulingAddressPrompt();
    }

    case "READY_TO_BOOK": {
      const lockedSlot = await ensureConfirmedSchedulingSlot(
        userId,
        clientPhone,
        config,
        effectiveServiceBundle,
        rememberedState,
        targetDate,
        targetTime,
      );
      if (!lockedSlot.ok) {
        return lockedSlot.reply;
      }
      rememberedState = lockedSlot.rememberedState;
      const finalDate = lockedSlot.confirmedDate || targetDate;
      const finalTime = lockedSlot.confirmedTime || targetTime;

      if (!hasExplicitRequestedSlot && !(finalDate && finalTime)) {
        const nextSlots = await getNextAvailableSlots(userId, 1, {
          serviceDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
        });
        return buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, nextSlots, {
          requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
        });
      }

      if (!finalDate || !finalTime) {
        const nextSlots = await getNextAvailableSlots(userId, 1, {
          serviceDurationMinutes: effectiveServiceBundle.totalDurationMinutes,
        });
        const nextSlotsReply = buildSchedulingNextSlotsReplyWithMemory(userId, clientPhone, effectiveServiceBundle, nextSlots, {
          requiresCustomerAddress: effectiveServiceBundle.requiresCustomerAddress,
        });
        return nextSlotsReply
          ? `Antes de eu finalizar, preciso que você escolha um dos horários disponíveis primeiro.\n${nextSlotsReply}`
          : "Antes de eu finalizar, preciso que você escolha um horário disponível primeiro.";
      }

      const lockedDate = rememberedState?.confirmedDate || finalDate;
      const lockedTime = rememberedState?.confirmedTime || finalTime;

      if (!customerInfo.customerName) {
        if (effectiveServiceBundle.requiresCustomerAddress && !customerInfo.customerAddress) {
          return getSchedulingAddressPrompt();
        }

        return getSchedulingNamePrompt();
      }

      if (effectiveServiceBundle.requiresCustomerAddress && !customerInfo.customerAddress) {
        return getSchedulingAddressPrompt();
      }

      const existingSameDayAppointments = await getClientAppointmentsForDate(userId, clientPhone, lockedDate);
      const approvalToken = pendingApprovalDate && pendingApprovalDate === lockedDate ? "SIM" : undefined;

      if (existingSameDayAppointments.length > 0 && approvalToken !== "SIM") {
        rememberSameDayRebookingApproval(userId, clientPhone, lockedDate);
        const appointmentSummary = existingSameDayAppointments
          .map((appointment) => `${normalizeSchedulingTimeValue(appointment.start_time)} (${appointment.service_name || "agendamento"})`)
          .join(", ");
        return `Você já possui agendamento no dia ${formatSchedulingDayLabel(lockedDate)}: ${appointmentSummary}. Quer mesmo criar mais um horário nesse mesmo dia?`;
      }

      return buildDeterministicSchedulingCreationReply(
        lockedDate,
        lockedTime,
        customerInfo.customerName,
        effectiveServiceBundle.combinedServiceName || "Agendamento",
        customerInfo.customerAddress,
        {
          approvalToken,
        },
      );
    }

    case "CANCEL_NEEDS_TARGET":
      return "Para cancelar certinho, me confirme a data e o horário do agendamento que você quer cancelar.";

    case "CANCEL_READY": {
      // Se a data/hora não foi explicitada, buscar o agendamento mais recente do cliente
      let effectiveCancelDate = targetDate;
      let effectiveCancelTime = targetTime;

      if (!effectiveCancelDate) {
        // Tentar extrair data/hora do histórico da conversa (ex: booking confirmation)
        const recentBookingConf = [...conversationHistory].reverse().find((m) =>
          m.fromMe && /agendad[oa]|confirmad[oa]|marcad[oa]/i.test(String(m.text || "")),
        );
        if (recentBookingConf) {
          const dateMatch = String(recentBookingConf.text).match(/(\d{2})\/(\d{2})/);
          const timeMatch = String(recentBookingConf.text).match(/(\d{2})[h:](\d{2})/);
          if (dateMatch) {
            const now = new Date();
            effectiveCancelDate = `${now.getFullYear()}-${dateMatch[2]}-${dateMatch[1]}`;
          }
          if (timeMatch) {
            effectiveCancelTime = `${timeMatch[1]}:${timeMatch[2]}`;
          }
        }
      }

      if (!effectiveCancelDate) {
        // Último recurso: buscar agendamentos futuros mais próximos deste cliente
        const today = new Date().toISOString().slice(0, 10);
        const { data: futureAppointments } = await supabase
          .from("appointments")
          .select("*")
          .eq("user_id", userId)
          .eq("client_phone", clientPhone)
          .gte("appointment_date", today)
          .in("status", ["pending", "confirmed"])
          .order("appointment_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(1);

        if (futureAppointments && futureAppointments.length > 0) {
          const apt = futureAppointments[0];
          const clientName = apt.client_name || customerInfo.customerName || "Cliente";
          return `[CANCELAR: DATA=${apt.appointment_date}, HORA=${normalizeSchedulingTimeValue(apt.start_time)}, NOME="${clientName}"]\nEntendido. Vou cancelar o agendamento para você.`;
        }

        return "Para cancelar certinho, me confirme a data e o horário do agendamento que você quer cancelar.";
      }

      const appointmentsForDate = await getClientAppointmentsForDate(userId, clientPhone, effectiveCancelDate);
      let appointmentToCancel: Appointment | undefined;

      if (effectiveCancelTime) {
        appointmentToCancel = appointmentsForDate.find((appointment) =>
          normalizeSchedulingTimeValue(appointment.start_time) === normalizeSchedulingTimeValue(effectiveCancelTime!),
        );
      } else if (appointmentsForDate.length === 1) {
        appointmentToCancel = appointmentsForDate[0];
      }

      if (!appointmentToCancel) {
        // Se não encontrou pelo time exato, tentar o primeiro do dia
        if (appointmentsForDate.length > 0) {
          appointmentToCancel = appointmentsForDate[0];
        }
      }

      if (!appointmentToCancel) {
        // Último recurso: buscar qualquer agendamento futuro do cliente
        const today = new Date().toISOString().slice(0, 10);
        const { data: anyAppointments } = await supabase
          .from("appointments")
          .select("*")
          .eq("user_id", userId)
          .eq("client_phone", clientPhone)
          .gte("appointment_date", today)
          .in("status", ["pending", "confirmed"])
          .order("appointment_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(1);

        if (anyAppointments && anyAppointments.length > 0) {
          appointmentToCancel = anyAppointments[0] as Appointment;
        }
      }

      if (!appointmentToCancel) {
        if (effectiveCancelTime) {
          return `Não encontrei um agendamento ativo em ${formatSchedulingDayLabel(effectiveCancelDate)} às ${normalizeSchedulingTimeValue(effectiveCancelTime)} para este número.`;
        }
        return "Não encontrei nenhum agendamento ativo para cancelar neste número.";
      }

      const clientName = appointmentToCancel.client_name || customerInfo.customerName || "Cliente";
      return `[CANCELAR: DATA=${appointmentToCancel.appointment_date}, HORA=${normalizeSchedulingTimeValue(appointmentToCancel.start_time)}, NOME="${clientName}"]\nEntendido. Vou cancelar o agendamento para você.`;
    }

    default:
      return null;
  }
}

export async function generateSchedulingTurnPrompt(
  userId: string,
  clientPhone: string,
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): Promise<string> {
  const isAffirmativeReply = looksLikeAffirmativeReply(messageText);
  const intent = detectSchedulingIntent(messageText);
  const rememberedStateBeforeValidatedOffer = getSchedulingConversationState(userId, clientPhone);

  // Clear validated slot offer on new date/time/reschedule requests
  if (intent.requestedDate || intent.requestedTime || intent.type === "reschedule") {
    clearValidatedSlotOffer(userId, clientPhone);
  }

  const activeValidatedOffer = getValidatedSlotOffer(userId, clientPhone);
  let acceptedValidatedOffer: ValidatedSlotOffer | null = null;
  let validatedOfferOperationalPayload = false;
  if (activeValidatedOffer) {
    const operationalPayloadInfo = await resolvePlannerCustomerInfo(
      {
        shouldHandle: false,
        action: "IGNORE",
        selectedServiceIds: activeValidatedOffer.serviceBundle.selectedServices
          .map((service) => service.id)
          .filter(Boolean),
        requestedDate: null,
        requestedTime: null,
        selectedDate: null,
        selectedTime: null,
        customerName: null,
        customerAddress: null,
        wantsSchedulingNow: true,
        wantsBookingDetails: true,
        confidence: 0,
        reasoning: "turn prompt: payload after validated slot offer",
      },
      messageText,
      activeValidatedOffer.serviceBundle.requiresCustomerAddress,
      conversationHistory,
      rememberedStateBeforeValidatedOffer,
    );
    validatedOfferOperationalPayload = Boolean(
      operationalPayloadInfo.customerAddress
      || operationalPayloadInfo.customerName,
    );
    if (isAffirmativeReply || validatedOfferOperationalPayload) {
      acceptedValidatedOffer = markValidatedSlotOfferAccepted(userId, clientPhone) || activeValidatedOffer;
      rememberAcceptedValidatedSlotOffer(userId, clientPhone, acceptedValidatedOffer, {
        customerName: operationalPayloadInfo.customerName || rememberedStateBeforeValidatedOffer?.customerName,
        customerAddress: operationalPayloadInfo.customerAddress || rememberedStateBeforeValidatedOffer?.customerAddress,
      });
    }
  }

  // If client accepts a validated slot offer with "sim", inject a direct rule for this turn.
  if (acceptedValidatedOffer && isAffirmativeReply && !validatedOfferOperationalPayload) {
    const acceptedOffer = acceptedValidatedOffer;
    const slotLabel = formatValidatedSlotHeading(acceptedOffer.date, acceptedOffer.time);
    const serviceLines = formatServiceBreakdownLines(
      buildSchedulingContextFromBundle(acceptedOffer.serviceBundle),
    )
      .map((line) => `- ${line}`)
      .join("\n");

    return `
REGRA EXTRA DESTE TURNO:
- O cliente acabou de ACEITAR o horario validado em tempo real: ${slotLabel}.
- Mantenha exatamente esta mesma data e hora; nao troque para outro horario.
- Antes de usar [AGENDAR:], finalize apenas o que faltar: nome do cliente, forma de pagamento e endereco se o servico exigir.
- Se esses dados ja estiverem fechados, use [AGENDAR:] agora com DATA=${acceptedOffer.date}, HORA=${acceptedOffer.time} e SERVICO="${acceptedOffer.serviceBundle.combinedServiceName}".
- Nao consulte nem ofereca outro horario neste turno.
${serviceLines ? `${serviceLines}
` : ""}`;
  }

  const pendingApprovalDate = isAffirmativeReply
    ? findPendingSameDayApprovalDate(userId, clientPhone)
    : null;

  if (pendingApprovalDate) {
    return `\nREGRA EXTRA DESTE TURNO:\n- O cliente acabou de autorizar um novo agendamento no mesmo dia (${pendingApprovalDate}).\n- Se você for realmente criar esse novo agendamento, inclua CONFIRMACAO_DIA=SIM na tag [AGENDAR:].\n- Não use essa confirmação para outro dia.\n`;
  }
  const validatedReply = await generatePlannerDrivenSchedulingReply(
    userId,
    clientPhone,
    messageText,
    conversationHistory,
  );

  if (validatedReply) {
    if (isSchedulingDisambiguationReply(validatedReply)) {
      return buildSchedulingDisambiguationTurnRuleFromReply(validatedReply);
    }

    if (isSchedulingQuoteStructuredReply(validatedReply)) {
      return buildSchedulingQuoteTurnRule(validatedReply);
    }

    return buildSchedulingValidatedTurnRule(validatedReply);
  }

  // Greeting-only messages with no scheduling progress should never trigger
  // service resolution — bail out early to avoid false positives when the AI
  // previously listed service names in its greeting.
  const normalizedForGreeting = normalizeSchedulingMessage(messageText);
  if (normalizedForGreeting && isGreetingOnlySchedulingMessage(normalizedForGreeting)) {
    const greetingState = getSchedulingConversationState(userId, clientPhone);
    const hasProgressOnGreeting = Boolean(
      greetingState?.confirmedDate || greetingState?.confirmedTime
      || greetingState?.selectedDate || greetingState?.selectedTime
    );
    if (!hasProgressOnGreeting) {
      return "";
    }
  }

  const config = await getSchedulingConfigCached(userId);

  if (!config || !config.is_enabled) {
    return "";
  }

  const activeServices = await listActiveSchedulingServices(userId);
  if (activeServices.length === 0) {
    return "";
  }

  const rememberedState = getSchedulingConversationState(userId, clientPhone);
  const serviceContextCandidates = buildSchedulingServiceContextCandidates(messageText, conversationHistory);
  const serviceContextText = buildSchedulingServiceContextText(messageText, conversationHistory);
  const currentIntent = inferSchedulingIntentFromConversation(messageText, conversationHistory);
  const requestedBundle = await resolveSchedulingServiceBundle(userId, serviceContextText, config, {
    activeServices,
    contextCandidates: serviceContextCandidates,
  });
  const rememberedBundle = buildResolvedBundleFromConversationState(config, rememberedState);
  const shouldPreferCurrentMessageBundle = Boolean(
    isLikelySchedulingServiceDescriptionMessage(messageText, conversationHistory)
    && schedulingBundleHasResolvedCatalogServices(requestedBundle),
  );
  const effectiveBundle = chooseEffectiveSchedulingServiceBundle(requestedBundle, rememberedBundle, {
    preferCurrentCatalogMatch: shouldPreferCurrentMessageBundle,
  });
  const hasMatchedCatalogServices = schedulingBundleHasResolvedCatalogServices(effectiveBundle);

  if (!hasMatchedCatalogServices) {
    return "";
  }

  const hasSchedulingProgress = Boolean(
    rememberedState?.confirmedDate
    || rememberedState?.confirmedTime
    || rememberedState?.selectedDate
    || rememberedState?.selectedTime
    || hasRecentAssistantSchedulingChoicePrompt(conversationHistory),
  );
  const wantsSchedulingNow = Boolean(
    isAvailabilityLookupFollowUp(messageText, conversationHistory)
    || isGenericAvailabilityLookup(messageText)
    || currentIntent.type === "book_appointment"
    || currentIntent.type === "check_availability"
    || currentIntent.type === "reschedule"
    || currentIntent.type === "cancel_appointment",
  );

  if (hasSchedulingProgress || wantsSchedulingNow) {
    return "";
  }

  // ─── AMBIGUITY CHECK ─────────────────────────────────────────────────
  // Multiple catalog services matched and no scheduling progress:
  // return a disambiguation turn rule so the LLM asks which service.
  if (isAmbiguousServiceQuery(effectiveBundle)) {
    const relevantServices = buildRelevantSchedulingDisambiguationServices(
      messageText,
      activeServices,
      effectiveBundle.selectedServices.map((service) => service.id).filter(Boolean),
    );
    console.log(
      `📅 [TurnPrompt] AMBIGUOUS — LLM flagged query as ambiguous. `
      + `Showing ${relevantServices.length} services for disambiguation.`,
    );
    return relevantServices.length > 0
      ? buildSchedulingDisambiguationTurnRule(relevantServices)
      : "";
  }

  rememberSchedulingConversationState(userId, clientPhone, {
    selectedServices: effectiveBundle.selectedServices,
    totalDurationMinutes: effectiveBundle.totalDurationMinutes,
    totalPrice: effectiveBundle.totalPrice,
    requiresCustomerAddress: effectiveBundle.requiresCustomerAddress,
    customerAddress: rememberedState?.customerAddress,
    customerName: rememberedState?.customerName,
  });

  const quoteContext: SchedulingAppointmentContext = {
    domain: "scheduling",
    selectedServices: effectiveBundle.selectedServices,
    totalDurationMinutes: effectiveBundle.totalDurationMinutes,
    totalPrice: effectiveBundle.totalPrice,
    customerAddress: rememberedState?.customerAddress,
    requiresCustomerAddress: effectiveBundle.requiresCustomerAddress,
  };

  return buildSchedulingQuoteTurnRule(buildSchedulingQuoteReply(quoteContext));
}

export async function generateDeterministicSchedulingReply(
  userId: string,
  clientPhone: string,
  messageText: string,
  conversationHistory: SchedulingTurnHistoryMessage[] = [],
): Promise<string | null> {
  return generatePlannerDrivenSchedulingReply(
    userId,
    clientPhone,
    messageText,
    conversationHistory,
  );
}

export async function generateSchedulingPromptBlock(userId: string): Promise<string> {
  // Usa cache para evitar query duplicada
  const config = await getSchedulingConfigCached(userId);
  
  if (!config || !config.is_enabled) {
    return '';
  }
  
  const daysMap: { [key: number]: string } = {
    0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta',
    4: 'Quinta', 5: 'Sexta', 6: 'Sábado'
  };
  
  const availableDaysText = config.available_days.map(d => daysMap[d]).join(', ');
  
  let breakText = '';
  if (config.has_break) {
    breakText = ` (pausa ${config.break_start_time}-${config.break_end_time})`;
  }

  {
    const brazilNow = getBrazilDateTime();
    const promptTodayStr = brazilNow.dateStr;
    const promptCurrentTime = brazilNow.timeStr;
    const promptTomorrow = new Date(brazilNow.date);
    promptTomorrow.setDate(promptTomorrow.getDate() + 1);
    const promptTomorrowStr = `${promptTomorrow.getFullYear()}-${(promptTomorrow.getMonth() + 1).toString().padStart(2, '0')}-${promptTomorrow.getDate().toString().padStart(2, '0')}`;
    const cancellationInfo = config.allow_cancellation
      ? 'O cliente pode cancelar seu agendamento a qualquer momento.'
      : 'O cliente NAO pode cancelar pelo chat. Para cancelamentos, deve entrar em contato por outro meio.';

    let servicesGuardrailText = '';
    try {
      const { data: services } = await supabase
        .from('scheduling_services')
        .select('name, description, duration_minutes, price, is_active, requires_customer_address')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (services && services.length > 0) {
        servicesGuardrailText = `\n\nSERVICOS DISPONIVEIS:\n${services.map((service) => {
          let line = `- ${service.name}`;
          if (service.duration_minutes) line += ` (${service.duration_minutes} min)`;
          if (service.price) line += ` - R$ ${Number(service.price).toFixed(2).replace('.', ',')}`;
          if (service.description) line += ` - ${service.description}`;
          if ((service as any).requires_customer_address) line += ` - exige endereco do cliente`;
          return line;
        }).join('\n')}\nConfirme sempre qual servico o cliente quer. Se houver mais de um servico, some tempos e valores no mesmo agendamento.`;
      }
    } catch (error) {
      // Services are optional for the guard-rail prompt.
    }

    const currentMinutes = brazilNow.date.getHours() * 60 + brazilNow.date.getMinutes();
    const minBookingMinutes = currentMinutes + (config.min_booking_notice_hours * 60);
    const minBookingTime = minutesToTime(minBookingMinutes > 24 * 60 ? 24 * 60 : minBookingMinutes);
    const noticeText = config.min_booking_notice_hours > 0
      ? `\nANTECEDENCIA MINIMA: ${config.min_booking_notice_hours}h (para hoje, apenas horarios a partir de ${minBookingTime})`
      : '';

    return `
---
RECURSO DE AGENDAMENTO ATIVO
Agora: ${promptTodayStr} ${promptCurrentTime} | Atendimento: ${availableDaysText}, ${config.work_start_time}-${config.work_end_time}${breakText}${noticeText}
${servicesGuardrailText}

REGRAS DE ORQUESTRACAO OPENCLAW:
- Voce nunca pode inventar horario, data ou disponibilidade.
- Voce nunca pode responder com horario exato usando memoria, chute, exemplo ou regra estatica.
- Horario exato so pode ser citado quando vier validado na REGRA EXTRA DESTE TURNO.
- Se a REGRA EXTRA DESTE TURNO nao trouxer horario validado, nao informe horario exato.
- Antes de qualquer horario exato, consulte a agenda real com Google/Maton.
- Pense em agenda e agendamento como ferramentas do orquestrador: converse normalmente e so use a ferramenta quando a intencao do cliente realmente pedir isso.
- Se a REGRA EXTRA DESTE TURNO trouxer uma lista de horarios reais e o cliente escolher um deles depois, continue a conversa com base nessa memoria validada e nao volte a pesquisar o mesmo horario por habito.
- Se a lista validada trouxer horarios reais de um unico dia e o cliente responder so com a hora (ex: "9h45" ou "pode ser 9h45"), isso ja conta como escolha do slot oferecido.
- So volte a consultar a agenda se o cliente mudar dia/horario ou se o sistema informar conflito ao registrar o agendamento.
- Antes de pedir endereco, forma de pagamento ou outros dados finais, primeiro feche o horario validado.
- So depois de o cliente aceitar o horario validado e permitido pedir endereco, pagamento, nome final e usar [AGENDAR:].
- Se o servico exigir atendimento no endereco do cliente, colete o endereco apenas depois de o horario estar aceito e antes da tag.
- Se o cliente pedir "primeiro horario", "proximo horario" ou "qualquer horario", consulte a agenda real e responda somente com slot realmente livre.
- Se nao houver horario validado no turno, pergunte o dia ou periodo preferido. Nao improvise agenda.

POLITICA DE CANCELAMENTO:
${cancellationInfo}

REGRA CRITICA DE AGENDAMENTO:
PARA CADA CLIENTE diferente que quiser agendar, voce DEVE usar a tag [AGENDAR:].
A tag e o que realmente cria o agendamento no sistema.
Sem a tag = sem agendamento = cliente nao vai receber confirmacao/lembrete.

COMO USAR:
[AGENDAR: DATA=YYYY-MM-DD, HORA=HH:MM, NOME=Nome do Cliente, SERVICO=Nome do Servico]
- Se houver atendimento no local do cliente, inclua ENDERECO="Rua, numero, bairro".
- Se houver mais de um servico, coloque todos em SERVICO separados por " + ".
- Se o cliente autorizou outro agendamento no mesmo dia, inclua CONFIRMACAO_DIA=SIM.

Exemplos:
- Hoje: DATA=${promptTodayStr}
- Amanha: DATA=${promptTomorrowStr}

FLUXO DE AGENDAMENTO:
1. Cliente pergunta agenda ou pede horario -> consulte e valide primeiro.
2. So depois de validar -> ofereca o horario validado e pergunte se quer fechar esse horario.
3. So depois da aceitacao do horario -> colete nome final, pagamento e endereco se necessario.
4. Tem horario aceito + dados finais -> USE A TAG.
Ex.: [AGENDAR: DATA=${promptTomorrowStr}, HORA=10:15, NOME=Joao, SERVICO=Consulta]
Ex. com endereco: [AGENDAR: DATA=${promptTomorrowStr}, HORA=14:00, NOME=Maria, SERVICO=Instalacao, ENDERECO="Rua Exemplo, 123"]
Ex. com dois servicos: [AGENDAR: DATA=${promptTomorrowStr}, HORA=10:15, NOME=Joao, SERVICO=Corte + Escova]

REGRA CRITICA DE CANCELAMENTO:
Quando o cliente pedir para CANCELAR um agendamento, voce DEVE usar a tag [CANCELAR:].
Sem a tag = o agendamento nao sera realmente cancelado no sistema.

COMO USAR:
[CANCELAR: DATA=YYYY-MM-DD, HORA=HH:MM, NOME=Nome do Cliente]

FLUXO DE CANCELAMENTO:
1. Cliente pede para cancelar -> confirme os dados do agendamento.
2. Apos confirmacao -> USE A TAG. Ex: [CANCELAR: DATA=${promptTomorrowStr}, HORA=10:15, NOME=Joao]
3. Apos a tag, ofereca remarcar somente depois de consultar a agenda real.
---
`;
  }
}

/**
 * Processa tags de agendamento na resposta da IA
 */
export async function processSchedulingTags(
  responseText: string,
  userId: string,
  clientPhone: string,
  conversationId?: string
): Promise<{ text: string; appointmentCreated?: Appointment }> {
  let modifiedText = responseText;
  let appointmentCreated: Appointment | undefined;
  const schedulingTags = extractSchedulingTags(responseText);
  
  // Buscar configuração de agendamento para saber se precisa confirmação
  let schedulingConfig: SchedulingConfig | null = null;
  try {
    schedulingConfig = await getSchedulingConfigCached(userId);
  } catch (e) {
    console.error('📅 [Scheduling] Error fetching config:', e);
  }
  
  for (const tag of schedulingTags) {
    const { raw: fullMatch, date, time, clientName, serviceName, customerAddress, approvalToken } = tag;
    
    const result = await createPendingAppointment(
      userId,
      clientName.trim(),
      clientPhone,
      date,
      time,
      undefined,
      schedulingConfig,
      serviceName?.trim(),
      conversationId,
      customerAddress?.trim(),
      approvalToken?.trim(),
    );
    
    if (result.success && result.appointment) {
      console.log(`✅ [Scheduling] Appointment created: ${result.appointment.id}`);
      appointmentCreated = result.appointment;
      
      // ABORDAGEM: Agendamento Invisível
      // A IA já escreveu a confirmação naturalmente, apenas removemos a tag
      // e adicionamos um ✅ discreto no final (se a IA não tiver colocado)
      
      // Remover a tag da resposta
      modifiedText = modifiedText.replace(fullMatch, '');
      
      // Adicionar checkmark discreto apenas se a resposta não terminar com emoji de sucesso
      const trimmed = stripSchedulingTagArtifacts(modifiedText).trim();
      if (!trimmed.endsWith('✅') && !trimmed.endsWith('📅') && !trimmed.endsWith('👍') && !trimmed.endsWith('😊')) {
        modifiedText = trimmed + ' ✅';
      }
    } else {
      console.log(`❌ [Scheduling] Failed to create appointment: ${result.error}`);
      
      // Remove a tag da resposta
      modifiedText = modifiedText.replace(fullMatch, '');
      const trimmedMsg = stripSchedulingTagArtifacts(modifiedText).trim();
      
      // Detectar frases de confirmação de agendamento que a IA pode ter escrito
      // Se a IA escreveu confirmação mas o agendamento falhou, precisamos corrigir a mensagem
      // para não mentir ao cliente sobre um agendamento que não existe
      const confirmacaoPatterns = [
        /reservei\s+seu\s+hor[aá]rio/i,
        /agendei\s+(para|seu)/i,
        /hor[aá]rio\s+(confirmado|reservado|agendado)/i,
        /agendamento\s+(realizado|confirmado|feito)/i,
        /ficou\s+(agendado|marcado|reservado)/i,
        /confirmei\s+seu\s+hor[aá]rio/i,
        /vou\s+reservar\s+seu\s+hor[aá]rio/i,
        /reservando\s+seu\s+hor[aá]rio/i,
        /seu\s+hor[aá]rio\s+(está|foi)\s+(reservado|marcado|agendado)/i,
      ];
      
      const mensagemParecioConfirmacao = confirmacaoPatterns.some(p => p.test(trimmedMsg))
        || responseLooksLikeSuccessfulScheduling(trimmedMsg);
      
      // Mensagem de erro baseada no tipo de falha
      let errorMessage: string;
      if (result.error === 'Horário não disponível') {
        errorMessage = `Opa! Infelizmente esse horário (${time} de ${date}) não está disponível para agendamento. 😕 Pode me informar outro horário ou data de preferência? Vou verificar a disponibilidade! 😊`;
      } else if (result.error === 'CLIENT_ALREADY_HAS_APPOINTMENT_SAME_DAY') {
        errorMessage = `Vi que você já tem um agendamento nesse mesmo dia. Se quiser marcar outro horário no mesmo dia, me confirme isso antes que eu verifico e registro certinho.`;
      } else if (result.error === 'MISSING_CUSTOMER_ADDRESS') {
        errorMessage = `Para esse serviço eu preciso primeiro do endereço completo onde o atendimento será feito. Me manda rua, número e bairro que eu continuo o agendamento.`;
      } else if (result.error === 'Sistema de agendamento desativado') {
        errorMessage = `O sistema de agendamento está desativado no momento. Por favor, entre em contato diretamente para marcar seu horário! 😊`;
      } else {
        errorMessage = `Puxa, tive um problema técnico ao registrar o horário ${time} de ${date}. 😅 Por favor, confirme a data e horário novamente para eu tentar salvar!`;
      }
      
      if (trimmedMsg === '' || mensagemParecioConfirmacao) {
        // Mensagem era uma confirmação falsa — substituir completamente para não enganar o cliente
        modifiedText = errorMessage;
        console.log(`📅 [Scheduling] ⚠️ Mensagem de confirmação falsa detectada e substituída por erro`);
      } else {
        // Mensagem tinha outro conteúdo — só anexar aviso de erro
        modifiedText = trimmedMsg + `\n\n⚠️ ${errorMessage}`;
      }
    }
  }
  
  return { text: stripSchedulingTagArtifacts(modifiedText).trim(), appointmentCreated };
}

/**
 * Processa tags de cancelamento na resposta da IA
 */
export async function processSchedulingCancelTags(
  responseText: string,
  userId: string,
  clientPhone: string
): Promise<{ text: string; appointmentCancelled?: boolean }> {
  const cancelTagRegex = /\[CANCELAR:\s*DATA=(\d{4}-\d{2}-\d{2}),\s*HORA=(\d{2}:\d{2}),\s*NOME=([^\]]+)\]/gi;
  
  let match = cancelTagRegex.exec(responseText);
  let modifiedText = responseText;
  let appointmentCancelled = false;
  
  while (match) {
    const [fullMatch, date, time, clientName] = match;
    
    console.log(`📅 [Scheduling] Detected cancellation tag: ${fullMatch}`);
    
    try {
      // Find the appointment by date, time… and optionally client name/phone
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', userId)
        .eq('appointment_date', date)
        .eq('start_time', `${time}:00`)
        .in('status', ['pending', 'confirmed'])
        .limit(5);
      
      if (error) {
        console.error(`❌ [Scheduling] Error finding appointment to cancel:`, error);
        modifiedText = modifiedText.replace(fullMatch, '');
        match = cancelTagRegex.exec(responseText);
        continue;
      }
      
      // Try to match by client name or phone
      let appointmentToCancel = appointments?.find(a => 
        a.client_name?.toLowerCase().trim() === clientName.trim().toLowerCase() ||
        a.client_phone === clientPhone
      );
      
      // If no name/phone match, take the first one for that date/time
      if (!appointmentToCancel && appointments && appointments.length > 0) {
        appointmentToCancel = appointments[0];
      }
      
      if (appointmentToCancel) {
        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: 'client',
            cancellation_reason: 'Cancelado pelo cliente via IA',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointmentToCancel.id);
        
        if (!updateError) {
          console.log(`✅ [Scheduling] Appointment cancelled: ${appointmentToCancel.id}`);
          appointmentCancelled = true;
          modifiedText = modifiedText.replace(fullMatch, '');

          const googleEventId = (appointmentToCancel as any).google_event_id || (appointmentToCancel as any).google_calendar_event_id;
          if (googleEventId) {
            const removalResult = await removeAppointmentFromCalendar(userId, googleEventId);

            if (removalResult.success) {
              await supabase
                .from('appointments')
                .update({
                  google_event_id: null,
                  google_calendar_synced: false,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', appointmentToCancel.id);
            } else {
              console.error(`❌ [Scheduling] Error removing Google Calendar event ${googleEventId}:`, removalResult.error);
            }
          }
        } else {
          console.error(`❌ [Scheduling] Error cancelling appointment:`, updateError);
          modifiedText = modifiedText.replace(fullMatch, '');
        }
      } else {
        console.log(`⚠️ [Scheduling] No matching appointment found to cancel for ${date} ${time} ${clientName}`);
        modifiedText = modifiedText.replace(fullMatch, '');
      }
    } catch (err) {
      console.error(`❌ [Scheduling] Exception cancelling appointment:`, err);
      modifiedText = modifiedText.replace(fullMatch, '');
    }
    
    match = cancelTagRegex.exec(responseText);
  }
  
  return { text: modifiedText.trim(), appointmentCancelled };
}

/**
 * Busca próximos horários disponíveis para sugerir ao cliente
 */
export async function getNextAvailableSlots(
  userId: string,
  maxSlots: number = 1,
  options?: {
    serviceDurationMinutes?: number;
  },
): Promise<{ date: string; slots: TimeSlot[] }[]> {
  const result: { date: string; slots: TimeSlot[] }[] = [];
  // Usar horário do Brasil (não do servidor)
  const brazilNow = getBrazilDateTime();
  const todayStr = brazilNow.dateStr;
  const todayDate = new Date(`${todayStr}T12:00:00`);
  
  for (let i = 0; i < 14 && result.length < maxSlots; i++) {
    const date = new Date(todayDate);
    date.setDate(date.getDate() + i);
    const dateStr = formatDate(date);
    
    const slots = await getAvailableSlots(userId, dateStr, undefined, {
      serviceDurationMinutes: options?.serviceDurationMinutes,
    });
    const availableSlots = slots.filter(s => s.available);
    
    if (availableSlots.length > 0) {
      result.push({
        date: dateStr,
        slots: availableSlots.slice(0, 3) // Max 3 slots por dia
      });
    }
  }
  
  if (result.length === 0) {
    console.log(`📅 [getNextAvailableSlots] NENHUM horário encontrado em 14 dias (userId=${userId}, serviceDuration=${options?.serviceDurationMinutes})`);
  }
  
  return result;
}

/**
 * Formata sugestões de horários disponíveis para resposta da IA
 */
export function formatAvailableSlotsForAI(
  slotsData: { date: string; slots: TimeSlot[] }[]
): string {
  if (slotsData.length === 0) {
    return 'No momento, não encontrei horários disponíveis nos próximos dias pelo sistema online. Mas pode ser que tenhamos alguma disponibilidade — entre em contato diretamente para verificar!';
  }
  
  const lines: string[] = ['📅 *Horários disponíveis:*'];
  
  for (const dayData of slotsData) {
    const dateObj = new Date(dayData.date + 'T12:00:00');
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const dayName = dayNames[dateObj.getDay()];
    const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
    
    const times = dayData.slots.map(s => s.start).join(', ');
    lines.push(`• *${dayName} (${formattedDate}):* ${times}`);
  }
  
  lines.push('\nQual horário fica melhor para você?');
  
  return lines.join('\n');
}
