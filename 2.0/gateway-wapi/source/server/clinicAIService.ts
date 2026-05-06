/**
 * CLINIC AI SERVICE v2 - SISTEMA INTELIGENTE DE AGENDAMENTO PARA CLINICAS
 *
 * ARQUITETURA (IA + VALIDAÃ‡ÃƒO DETERMINÃSTICA):
 * 1. IA conversa livremente com o cliente (sem menus "digite 1, 2, 3")
 * 2. IA extrai campos estruturados (serviÃ§o, profissional, data, hora) via LLM
 * 3. ValidaÃ§Ã£o determinÃ­stica: slots reais, conflitos, horÃ¡rio comercial
 * 4. ConfirmaÃ§Ã£o explÃ­cita antes de agendar
 * 5. Agendamento seguro com revalidaÃ§Ã£o prÃ©-insert
 */

import { supabase } from "./supabaseAuth";
import { chatComplete } from "./llm";
import {
  getAvailableStartTimes,
  validateSlot,
  checkOverlapBeforeInsert,
  findAvailableProfessional,
} from "./clinicAvailability";
import {
  buildDeterministicSlotSuggestionMessage,
  buildSlotDisplay,
  formatDatePtBr,
  formatClinicContextualDate,
  getBrazilNow,
  getBrazilToday,
  type BreakConfig,
  normalizeClinicDateValue,
  normalizeClinicTimeValue,
} from "./clinicFormatting";
import {
  getModuleAutoConfirmValue,
  getModuleSchedulingSettings,
} from "./moduleSchedulingSettings";
import {
  checkClinicGoogleCalendarAvailability,
  syncClinicAppointmentWithCalendar,
} from "./clinicCalendarSync";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INTERFACES E TIPOS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export interface OpeningHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

export interface ClinicConfig {
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
  min_notice_minutes?: number;     // NOVO - antecedÃªncia em minutos
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

export interface ClinicService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
  color: string | null;
}

export interface ClinicProfessional {
  id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  work_schedule: Record<string, any>;
}

export interface ClinicData {
  config: ClinicConfig;
  services: ClinicService[];
  professionals: ClinicProfessional[];
}

// Keep old types exported for compatibility
export type ClinicIntent = 'GREETING' | 'WANT_SERVICES' | 'WANT_PROFESSIONALS' | 'WANT_TO_BOOK' | 'SELECT_SERVICE' | 'SELECT_PROFESSIONAL' | 'SELECT_DATE' | 'SELECT_TIME' | 'CONFIRM_BOOKING' | 'CANCEL_BOOKING' | 'CHECK_BOOKING' | 'ASK_BUSINESS_HOURS' | 'ASK_PRICES' | 'PROVIDE_NAME' | 'OTHER';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ESTADO DO AGENDAMENTO (EM MEMÃ“RIA)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface BookingState {
  service: ClinicService | null;
  professional: ClinicProfessional | null;
  date: string | null;       // YYYY-MM-DD
  time: string | null;       // HH:mm
  customerName: string | null;
  customerPhone: string;
  awaitingConfirmation: boolean;
  awaitingAvailabilityConsent: boolean;
  lastSuggestedDate: string | null;
  lastSuggestedSlots: string[];
  createdAt: Date;
  lastUpdated: Date;
}

const bookingStates = new Map<string, BookingState>();
const STATE_EXPIRY_MS = 2 * 60 * 60 * 1000;

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
      customerName: null,
      customerPhone,
      awaitingConfirmation: false,
      awaitingAvailabilityConsent: false,
      lastSuggestedDate: null,
      lastSuggestedSlots: [],
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
  console.log(`ðŸ’‡ [Clinic] Estado resetado: ${key}`);
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

function normalizeSimpleReply(message: string): string {
  const punctuation = new Set(["!", "?", ".", ",", ";", ":"]);
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

function extractClinicDateHeuristically(message: string): string | null {
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
    const normalizedDate = normalizeClinicDateValue(token);
    if (normalizedDate) {
      return normalizedDate;
    }
  }

  return null;
}

function extractClinicTimeHeuristically(message: string): string | null {
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

  for (const token of tokens) {
    const normalizedTime = normalizeClinicTimeValue(token);
    if (normalizedTime) {
      return normalizedTime;
    }
  }

  return null;
}

function isLikelyCustomerName(message: string): boolean {
  const trimmed = String(message || "").trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 80) return false;
  if (trimmed.includes("@")) return false;

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

function shouldOfferSingleRealSlot(config: ClinicConfig): boolean {
  return (config.slot_suggestion_mode || "first_available") !== "ask_preference";
}

function sanitizeClinicAssistantText(text: string): string {
  return String(text || "")
    .replaceAll("*", "")
    .replaceAll("_", "")
    .replaceAll("`", "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

async function findFirstAvailableClinicSlot(
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

function buildFirstAvailableSlotQuestion(bookingState: BookingState): string {
  const contextualDate = formatClinicContextualDate(bookingState.date || "");
  return [
    `O primeiro horÃ¡rio disponÃ­vel Ã© ${contextualDate}, Ã s ${bookingState.time}.`,
    "",
    "Esse horÃ¡rio fica melhor para vocÃª?",
  ].join("\n");
}

function buildValidatedSlotContext(state: BookingState): string {
  if (!state.lastSuggestedDate || state.lastSuggestedSlots.length === 0) {
    return 'Nenhum slot validado recentemente.';
  }

  return [
    `Ãšltima data validada no backend: ${state.lastSuggestedDate}`,
    `HorÃ¡rios vÃ¡lidos jÃ¡ oferecidos ao cliente: ${state.lastSuggestedSlots.join(', ')}`,
  ].join('\n');
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
    .replaceAll('Ã s', '')
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FUNÃ‡Ã•ES AUXILIARES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Verifica se o horÃ¡rio atual estÃ¡ dentro do intervalo de almoÃ§o configurado.
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

  const now = new Date();
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
    ? `Estamos no horÃ¡rio de almoÃ§o (${breakConfig.start} Ã s ${breakConfig.end}). Voltamos em breve! ðŸ½ï¸`
    : '';

  return { isDuringBreak, message, breakStart: breakConfig.start, breakEnd: breakConfig.end };
}

export function isClinicOpen(openingHours?: Record<string, OpeningHoursDay>): {
  isOpen: boolean;
  isDuringBreak: boolean;
  currentDay: string;
  currentTime: string;
  message: string;
} {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayNamesPt: Record<string, string> = {
    sunday: 'domingo', monday: 'segunda-feira', tuesday: 'terÃ§a-feira',
    wednesday: 'quarta-feira', thursday: 'quinta-feira', friday: 'sexta-feira', saturday: 'sÃ¡bado'
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
    return { isOpen: false, isDuringBreak: false, currentDay, currentTime, message: `Nosso horÃ¡rio hoje Ã© das ${openTime} Ã s ${closeTime}.` };
  }
  // Verificar horÃ¡rio de almoÃ§o
  const breakStatus = isCurrentlyInBreak(openingHours);
  if (breakStatus.isDuringBreak) {
    return { isOpen: false, isDuringBreak: true, currentDay, currentTime, message: breakStatus.message };
  }
  return { isOpen: true, isDuringBreak: false, currentDay, currentTime, message: '' };
}

function formatClinicHours(openingHours?: Record<string, OpeningHoursDay>): string {
  if (!openingHours || Object.keys(openingHours).length === 0) return 'HorÃ¡rios nÃ£o informados.';
  const dayNamesPt: Record<string, string> = {
    monday: 'Segunda', tuesday: 'TerÃ§a', wednesday: 'Quarta',
    thursday: 'Quinta', friday: 'Sexta', saturday: 'SÃ¡bado', sunday: 'Domingo'
  };
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  let text = '';
  for (const day of dayOrder) {
    const dc = openingHours[day];
    if (dc && dc.enabled) text += `${dayNamesPt[day]}: ${dc.open} Ã s ${dc.close}\n`;
  }
  return text.trim() || 'HorÃ¡rios nÃ£o informados.';
}

function replaceAllTokens(template: string, replacements: Record<string, string>): string {
  let nextValue = template;

  for (const [token, replacement] of Object.entries(replacements)) {
    nextValue = nextValue.split(`{${token}}`).join(replacement);
  }

  return nextValue;
}

function getProfessionalDisplayName(professional?: ClinicProfessional | null): string {
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

function buildBookingConfirmationQuestion(
  bookingState: BookingState,
): string {
  const contextualDate = formatClinicContextualDate(bookingState.date || '');
  const summaryLines = [
    `Perfeito! Vou separar ${bookingState.service?.name || 'o atendimento'}${bookingState.professional ? ` com ${bookingState.professional.name}` : ''}.`,
    `Data: ${contextualDate}`,
    `HorÃ¡rio: ${bookingState.time}`,
  ];

  if (bookingState.service?.price) {
    summaryLines.push(`Valor: R$ ${bookingState.service.price.toFixed(2).replace('.', ',')}`);
  }

  summaryLines.push('Posso confirmar?');
  return summaryLines.join('\n');
}

function buildCustomerNameQuestion(
  bookingState: BookingState,
): string {
  const contextualDate = formatClinicContextualDate(bookingState.date || '');

  return [
    `Perfeito! Antes de confirmar ${bookingState.service?.name || 'o atendimento'}${bookingState.professional ? ` com ${bookingState.professional.name}` : ''}, preciso do seu nome.`,
    contextualDate ? `Data escolhida: ${contextualDate}` : '',
    bookingState.time ? `Horario escolhido: ${bookingState.time}` : '',
    'Como posso te chamar para finalizar o agendamento?',
  ].filter(Boolean).join('\n');
}

function buildClinicPriceAndAvailabilityQuestion(
  bookingState: BookingState,
): string {
  return [
    bookingState.service?.price
      ? `A ${bookingState.service.name} fica em R$ ${bookingState.service.price.toFixed(2).replace(".", ",")}.`
      : `Posso te atender com ${bookingState.service?.name || "esse serviço"}.`,
    "Posso verificar um horário disponível para você?",
  ].join("\n");
}

function buildAppointmentFailureMessage(error?: string | null): string {
  const normalizedError = String(error || '').trim();

  return [
    'Desculpa, nao consegui finalizar seu agendamento agora.',
    normalizedError ? `Motivo tecnico: ${normalizedError}.` : '',
    'Me confirma seu nome, o servico, a data e o horario para eu tentar novamente.',
  ].filter(Boolean).join(' ');
}

function buildAppointmentCreatedMessage(
  clinicData: ClinicData,
  bookingState: BookingState,
): string {
  const { config } = clinicData;
  const contextualDate = formatClinicContextualDate(bookingState.date || '');
  const replacements = {
    cliente_nome: bookingState.customerName || 'Cliente',
    data: contextualDate,
    horario: bookingState.time || '',
    servico: bookingState.service?.name || 'Atendimento',
    profissional: getProfessionalDisplayName(bookingState.professional),
  };

  const template = config.booking_confirmation_message || [
    'Perfeito! Seu agendamento foi confirmado:',
    'Data: {data}',
    'HorÃ¡rio: {horario}',
    'ServiÃ§o: {servico}',
    'Profissional: {profissional}',
  ].join('\n');

  const rendered = replaceAllTokens(template, replacements).trim();
  const needsOperationalSummary = !template.includes('{data}') || !template.includes('{horario}');

  if (!needsOperationalSummary) {
    return rendered;
  }

  return [
    rendered,
    '',
    `Data: ${contextualDate}`,
    `HorÃ¡rio: ${bookingState.time || ''}`,
    `ServiÃ§o: ${bookingState.service?.name || 'Atendimento'}`,
    `Profissional: ${getProfessionalDisplayName(bookingState.professional)}`,
  ].join('\n').trim();
}

function extractClinicFieldsHeuristically(
  message: string,
  clinicData: ClinicData,
  bookingState: BookingState,
): ExtractedFields {
  const normalizedMessage = normalizeSimpleReply(message);
  const messageTokens = tokenizeNormalizedMessage(message);
  const matchedService = matchService(message, clinicData.services);
  const matchedProfessional = matchProfessional(message, clinicData.professionals);
  const date = extractClinicDateHeuristically(message);
  const time = extractClinicTimeHeuristically(message);
  const customerName = !bookingState.customerName && isLikelyCustomerName(message)
    ? String(message || "").trim()
    : undefined;

  let intent: ExtractedFields["intent"] = "general";

  if (matchesAnyTerm(normalizedMessage, ["cancelar", "cancela", "desist", "nao quero"])) {
    intent = "cancel";
  } else if (isExplicitAffirmative(message) && bookingState.awaitingConfirmation) {
    intent = "confirm";
  } else if (matchedService || matchesAnyTerm(normalizedMessage, [
    "agendar",
    "marcar",
    "consulta",
    "atendimento",
    "exame",
    "retorno",
    "quero",
    "preciso de",
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
  } else if (matchesAnyTerm(normalizedMessage, ["servicos", "servico", "especialidades", "atendimentos"])) {
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
    customerName,
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BUSCAR DADOS DO SALÃƒO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export async function getClinicConfig(userId: string): Promise<ClinicConfig | null> {
  try {
    const { data, error } = await supabase
      .from('clinic_config').select('*').eq('user_id', userId).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('âŒ [Clinic] Erro ao buscar config:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('âŒ [Clinic] Erro ao buscar config:', err);
    return null;
  }
}

export async function getClinicData(userId: string): Promise<ClinicData | null> {
  try {
    const config = await getClinicConfig(userId);
    if (!config) return null;
    const { data: services } = await supabase
      .from('clinic_services').select('*').eq('user_id', userId).eq('is_active', true).order('display_order');
    const { data: professionals } = await supabase
      .from('clinic_professionals').select('*').eq('user_id', userId).eq('is_active', true).order('display_order');
    return { config, services: services || [], professionals: professionals || [] };
  } catch (err) {
    console.error('âŒ [Clinic] Erro ao buscar dados:', err);
    return null;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BUSCAR HORÃRIOS DISPONÃVEIS (usa novo mÃ³dulo)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export async function getAvailableSlots(
  userId: string,
  date: string,
  professionalId?: string,
  serviceDuration?: number
): Promise<string[]> {
  try {
    const clinicData = await getClinicData(userId);
    if (!clinicData) return [];

    const slotDuration = serviceDuration || clinicData.config.slot_duration || 30;

    return await getAvailableStartTimes({
      userId,
      date,
      professionalId,
      serviceDurationMinutes: slotDuration,
      stepMinutes: 15,
    });
  } catch (err) {
    console.error('âŒ [Clinic] Erro ao buscar slots:', err);
    return [];
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CRIAR AGENDAMENTO SEGURO (revalida antes de inserir)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export async function createClinicAppointment(
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
  },
): Promise<{ success: boolean; appointmentId?: string; error?: string; suggestedSlots?: string[] }> {
  try {
    const normalizedDate = normalizeClinicDateValue(data.appointmentDate);
    const normalizedTime = normalizeClinicTimeValue(data.startTime);
    const clinicConfig = await getClinicConfig(userId);

    if (!normalizedDate || !normalizedTime) {
      return { success: false, error: 'Data ou horÃ¡rio invÃ¡lido' };
    }

    // Verificar se o profissional foi especificado
    let professionalId = data.professionalId;
    let professionalName = data.professionalName;

    if (!professionalId) {
      // Buscar um profissional disponÃ­vel automaticamente
      const availableProfId = await findAvailableProfessional(
        userId, normalizedDate, normalizedTime, data.durationMinutes
      );

      if (!availableProfId) {
        // Nenhum profissional disponÃ­vel
        const { availableSlots } = await validateSlot(userId, normalizedDate, normalizedTime, undefined, data.durationMinutes);
        return {
          success: false,
          error: 'Nenhum profissional disponÃ­vel para este horÃ¡rio',
          suggestedSlots: availableSlots.slice(0, 5)
        };
      }

      // Buscar nome do profissional
      const { data: profData } = await supabase
        .from('clinic_professionals')
        .select('name')
        .eq('id', availableProfId)
        .single();

      professionalId = availableProfId;
      professionalName = profData?.name || null;
    }

    // REVALIDAR slot antes de inserir (evita race condition)
    const { valid, availableSlots } = await validateSlot(
      userId, normalizedDate, normalizedTime, professionalId, data.durationMinutes
    );
    if (!valid) {
      console.log(`âŒ [Clinic] Slot ${normalizedTime} em ${normalizedDate} jÃ¡ ocupado! Sugerindo alternativas.`);
      return { success: false, error: 'HorÃ¡rio jÃ¡ ocupado', suggestedSlots: availableSlots.slice(0, 5) };
    }

    const { data: existingAppointments, error: existingAppointmentError } = await supabase
      .from('clinic_appointments')
      .select('id, client_name, service_name')
      .eq('user_id', userId)
      .eq('client_phone', data.clientPhone)
      .eq('appointment_date', normalizedDate)
      .eq('start_time', normalizedTime)
      .in('status', ['pending', 'confirmed'])
      .limit(5);

    if (existingAppointmentError) {
      console.error('âŒ [Clinic] Erro ao verificar idempotÃªncia do agendamento:', existingAppointmentError);
    } else if (existingAppointments && existingAppointments.length > 0) {
      const normalizedClientName = (data.clientName || '').trim().toLocaleLowerCase('pt-BR');
      const normalizedServiceName = (data.serviceName || '').trim().toLocaleLowerCase('pt-BR');
      const matchingAppointment = existingAppointments.find((appointment: any) => {
        const sameName = String(appointment.client_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedClientName;
        const sameService = !normalizedServiceName
          || String(appointment.service_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedServiceName;

        return sameName && sameService;
      }) || existingAppointments[0];

      console.log(`ðŸ’‡ [Clinic] Reaproveitando agendamento existente ${matchingAppointment.id} para ${normalizedDate} ${normalizedTime}`);
      return { success: true, appointmentId: matchingAppointment.id };
    }

    const [startH, startM] = normalizedTime.split(':').map(Number);
    const endMinutes = startH * 60 + startM + data.durationMinutes;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;
    const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    // ÃšLTIMA CHECAGEM DE OVERLAP antes do insert (anti-race)
    const hasOverlap = await checkOverlapBeforeInsert(
      userId, normalizedDate, normalizedTime, endTime, professionalId || null
    );

    if (hasOverlap) {
      console.log(`âŒ [Clinic] Overlap detectado na checagem final! Abortando insert.`);
      return { success: false, error: 'Conflito de horÃ¡rio detectado', suggestedSlots: availableSlots.slice(0, 5) };
    }

    const googleAvailability = await checkClinicGoogleCalendarAvailability(
      userId,
      normalizedDate,
      normalizedTime,
      endTime,
    );

    if (googleAvailability.enforced) {
      if (!googleAvailability.checked) {
        return {
          success: false,
          error: googleAvailability.error || "Nao foi possivel validar a agenda Google agora",
        };
      }

      if (!googleAvailability.available) {
        return {
          success: false,
          error: googleAvailability.conflictEvent
            ? `Horario conflita com o Google Calendar: ${googleAvailability.conflictEvent}`
            : "Horario conflita com evento ja existente no Google Calendar",
        };
      }
    }

    let safeConversationId: string | null = null;
    if (conversationId) {
      const { data: conversationRecord, error: conversationLookupError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .maybeSingle();

      if (conversationLookupError) {
        console.warn('[Clinic] Could not validate conversation_id, saving appointment without conversation link:', conversationLookupError);
      } else if (conversationRecord?.id) {
        safeConversationId = conversationRecord.id;
      }
    }

    const { data: appointment, error } = await supabase
      .from('clinic_appointments')
      .insert({
        user_id: userId,
        conversation_id: safeConversationId,
        client_name: data.clientName,
        client_phone: data.clientPhone,
        service_id: data.serviceId || null,
        service_name: data.serviceName,
        professional_id: professionalId || null,
        professional_name: professionalName || null,
        appointment_date: normalizedDate,
        start_time: normalizedTime,
        end_time: endTime,
        duration_minutes: data.durationMinutes,
        status: options?.status || (getModuleAutoConfirmValue(clinicConfig?.opening_hours) ? 'confirmed' : 'pending'),
        confirmed_by_client: options?.confirmedByClient ?? true,
        confirmed_by_business: options?.confirmedByBusiness ?? (options?.status ? options.status === 'confirmed' : getModuleAutoConfirmValue(clinicConfig?.opening_hours)),
        created_by_ai: options?.createdByAi ?? true,
        client_notes: options?.clientNotes || null,
        internal_notes: options?.internalNotes || null,
        ai_conversation_context: {
          source: options?.source || 'clinic_ai_service_v2',
          normalizedDate,
          normalizedTime,
          serviceName: data.serviceName,
          professionalId: professionalId || null,
          professionalName: professionalName || null,
          conversationId: safeConversationId,
        },
      })
      .select().single();

    if (error) {
      console.error('âŒ [Clinic] Erro ao criar agendamento:', error);
      return { success: false, error: error.message };
    }
    console.log(`âœ… [Clinic] Agendamento criado: ${appointment.id}`);
    const syncResult = await syncClinicAppointmentWithCalendar(
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
      },
      appointment.duration_minutes || data.durationMinutes,
    );

    if (!syncResult.success) {
      console.error(`Ã¢ÂÅ’ [Clinic] Falha ao sincronizar agendamento ${appointment.id} com Google Calendar:`, syncResult.error);
      await supabase
        .from('clinic_appointments')
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
        .from('clinic_appointments')
        .update({
          google_event_id: syncResult.eventId,
          google_calendar_synced: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.id)
        .eq('user_id', userId);
    }

    const schedulingSettings = getModuleSchedulingSettings(clinicConfig?.opening_hours);
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
        console.error("[Clinic] Failed to send booking notification:", error);
      });
    }

    return { success: true, appointmentId: appointment.id };
  } catch (err) {
    console.error('âŒ [Clinic] Erro ao criar agendamento:', err);
    return { success: false, error: 'Erro interno' };
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EXTRAÃ‡ÃƒO DE CAMPOS VIA IA (LLM â†’ JSON estruturado)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface ExtractedFields {
  intent: 'greeting' | 'booking' | 'check_availability' | 'info_services' | 'info_hours' | 'info_prices' | 'confirm' | 'cancel' | 'check_booking' | 'general';
  service?: string;
  professional?: string;
  date?: string;
  time?: string;
  customerName?: string;
}

async function extractClinicFieldsLLM(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  clinicData: ClinicData,
  bookingState: BookingState
): Promise<ExtractedFields> {
  const now = getBrazilNow();
  const dayNames = ['domingo', 'segunda-feira', 'terÃ§a-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sÃ¡bado'];
  const todayStr = dayNames[now.getDay()];
  const todayDate = getBrazilToday();

  const servicesList = clinicData.services.map(s => s.name).join(', ');
  const profList = clinicData.professionals.map(p => p.name).join(', ');

  const stateInfo = [
    bookingState.service ? `ServiÃ§o jÃ¡ escolhido: ${bookingState.service.name}` : '',
    bookingState.professional ? `Profissional jÃ¡ escolhido: ${bookingState.professional.name}` : '',
    bookingState.date ? `Data jÃ¡ escolhida: ${bookingState.date}` : '',
    bookingState.time ? `HorÃ¡rio jÃ¡ escolhido: ${bookingState.time}` : '',
    bookingState.lastSuggestedDate ? `Ãšltima data de slots validados: ${bookingState.lastSuggestedDate}` : '',
    bookingState.lastSuggestedSlots.length > 0 ? `Ãšltimos horÃ¡rios vÃ¡lidos mostrados: ${bookingState.lastSuggestedSlots.join(', ')}` : '',
    bookingState.awaitingConfirmation ? 'AGUARDANDO CONFIRMAÃ‡ÃƒO DO CLIENTE' : '',
  ].filter(Boolean).join('\n');

  const recentHistory = conversationHistory.slice(-10)
    .map(m => `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text}`)
    .join('\n');

  const validatedSlotContext = buildValidatedSlotContext(bookingState);

  const extractPrompt = `Extraia campos estruturados da mensagem do cliente de uma clinica.

Hoje: ${todayStr}, ${todayDate}
ServiÃ§os disponÃ­veis: ${servicesList || 'Nenhum cadastrado'}
Profissionais: ${profList || 'Nenhum cadastrado'}

Estado atual do agendamento:
${stateInfo || 'Nenhum dado coletado ainda'}

HistÃ³rico recente:
${recentHistory}

Slots jÃ¡ validados no backend:
${validatedSlotContext}

Mensagem atual do cliente: "${message}"

Responda APENAS em JSON (sem markdown):
{
  "intent": "greeting|booking|check_availability|info_services|info_hours|info_prices|confirm|cancel|check_booking|general",
  "service": "nome exato do serviÃ§o ou null",
  "professional": "nome exato do profissional ou null",
  "date": "YYYY-MM-DD ou null (hoje=${todayDate}, amanhÃ£=calcule, prÃ³xima segunda=calcule, etc)",
  "time": "HH:mm ou null (fim da tarde=16:00, manhÃ£=09:00, depois do almoÃ§o=14:00, etc)",
  "customerName": "nome do cliente ou null"
}

Regras:
- Se o cliente diz "sim", "confirmo", "pode marcar" e estamos AGUARDANDO CONFIRMAÃ‡ÃƒO, intent="confirm"
- Se menciona serviÃ§o (mesmo parcial), extraia o nome EXATO do serviÃ§o disponÃ­vel mais prÃ³ximo
- Se menciona profissional, extraia o nome EXATO
- Datas relativas: "amanhÃ£" â†’ calcule a data, "segunda" â†’ prÃ³xima segunda, "sÃ¡bado" â†’ prÃ³ximo sÃ¡bado
- HorÃ¡rios vagos: "fim da tarde" â†’ 16:00, "depois do almoÃ§o" â†’ 14:00, "manhÃ£" â†’ 09:00, "meio dia" â†’ 12:00
- Use a hora atual de SÃ£o Paulo como referÃªncia viva para nÃ£o considerar horÃ¡rio passado como opÃ§Ã£o vÃ¡lida de hoje
- Nunca trate como horÃ¡rio de hoje algo que jÃ¡ passou no Brasil
- Se houver um resumo anterior da atendente com data/horÃ¡rio e o cliente apenas confirmar, repita esses mesmos campos no JSON
- Se houver slots jÃ¡ validados no backend, nunca invente horÃ¡rio novo fora dessa lista sem o cliente escrever explicitamente outro horÃ¡rio
- Se a data vier em formato brasileiro (ex: 05/03/2026), interprete como DD/MM/YYYY, nunca como MM/DD/YYYY
- "nÃ£o", "cancelar", "desistir" â†’ intent="cancel"
- Se o cliente quer agendar algo (cortar, pintar, fazer unha, etc) â†’ intent="booking"
- Se o cliente pergunta sobre DISPONIBILIDADE de horÃ¡rios sem mencionar serviÃ§o especÃ­fico ("quais horÃ¡rios tem", "tem horÃ¡rio", "horÃ¡rio disponÃ­vel", "tem vaga", "o que tem disponÃ­vel") â†’ intent="check_availability" (com a data se mencionada)
- Se a mensagem vier curta e depender do contexto ("esse horÃ¡rio", "esse dia", "pode ser", "fechado"), use o estado atual e o histÃ³rico recente para completar os campos`;

  try {
    const result = await chatComplete({
      messages: [
        { role: 'system', content: 'VocÃª Ã© um extrator de campos para sistema de agendamento. Responda SOMENTE JSON vÃ¡lido, sem markdown.' },
        { role: 'user', content: extractPrompt }
      ],
      maxTokens: 200,
      temperature: 0.1,
    });

    const raw = result.choices?.[0]?.message?.content || '{}';
    const jsonPayload = extractFirstJsonObject(raw);
    if (!jsonPayload) return { intent: 'general' };

    const parsed = JSON.parse(jsonPayload);
    const normalizedDate = normalizeClinicDateValue(parsed.date);
    const normalizedTime = normalizeClinicTimeValue(parsed.time);

    return {
      intent: parsed.intent || 'general',
      service: parsed.service || undefined,
      professional: parsed.professional || undefined,
      date: normalizedDate || undefined,
      time: normalizedTime || undefined,
      customerName: parsed.customerName || undefined,
    };
  } catch (err) {
    console.error('âŒ [Clinic] Erro na extraÃ§Ã£o LLM:', err);
    return extractClinicFieldsHeuristically(message, clinicData, bookingState);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RESOLVER SERVIÃ‡O E PROFISSIONAL POR NOME (fuzzy match)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function matchService(name: string | undefined, services: ClinicService[]): ClinicService | null {
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
  let bestMatch: ClinicService | null = null;
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

function matchProfessional(name: string | undefined, professionals: ClinicProfessional[]): ClinicProfessional | null {
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
  let bestMatch: ClinicProfessional | null = null;
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FUNÃ‡ÃƒO ESTRUTURADA PARA SUGESTÃƒO DE HORÃRIOS (JSON + VALIDAÃ‡ÃƒO)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

interface SlotSuggestionResult {
  messageText: string;
  suggestedSlots: string[];
}

interface SlotSuggestionOptions {
  message: string;
  conversationHistory: Array<{ fromMe: boolean; text: string }>;
  clinicData: ClinicData;
  bookingState: BookingState;
  date: string;
  allowedSlots: string[];
  breakConfig?: { enabled: boolean; start: string; end: string };
  serviceName?: string;
}

/**
 * Gera sugestÃ£o de horÃ¡rios via LLM com validaÃ§Ã£o estruturada.
 * A IA retorna JSON com messageText e suggestedSlots, e validamos que
 * suggestedSlots Ã© subconjunto de allowedSlots.
 */
async function generateSlotSuggestionMessageLLM(
  options: SlotSuggestionOptions
): Promise<SlotSuggestionResult> {
  const fallbackSlots = buildSlotDisplay(options.allowedSlots);
  return {
    messageText: buildDeterministicSlotSuggestionMessage({
      date: options.date,
      allowedSlots: fallbackSlots,
      serviceName: options.serviceName,
      breakConfig: options.breakConfig,
    }),
    suggestedSlots: fallbackSlots
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GERAR RESPOSTA VIA IA (conversacional)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function generateAIResponse(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  clinicData: ClinicData,
  bookingState: BookingState,
  contextMessage: string
): Promise<string> {
  const { config, services, professionals } = clinicData;

  const agentPrompt = config.ai_instructions || '';

  const servicesInfo = services.length > 0
    ? services.map(s => {
        const price = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'Consulte';
        return `- ${s.name}: ${price} (${s.duration_minutes || 30}min)${s.description ? ' - ' + s.description : ''}`;
      }).join('\n')
    : 'Nenhum serviÃ§o cadastrado.';

  const profsInfo = professionals.length > 0
    ? professionals.map(p => `- ${p.name}${p.bio ? ': ' + p.bio : ''}`).join('\n')
    : 'Nenhum profissional cadastrado.';

  const hoursInfo = formatClinicHours(config.opening_hours);

  const stateInfo = [
    bookingState.service ? `ServiÃ§o escolhido: ${bookingState.service.name}` : '',
    bookingState.professional ? `Profissional: ${bookingState.professional.name}` : '',
    bookingState.date ? `Data: ${formatDatePtBr(bookingState.date)}` : '',
    bookingState.time ? `HorÃ¡rio: ${bookingState.time}` : '',
    bookingState.lastSuggestedDate ? `Ãšltimos slots validados para: ${formatDatePtBr(bookingState.lastSuggestedDate)}` : '',
    bookingState.lastSuggestedSlots.length > 0 ? `Slots validados: ${bookingState.lastSuggestedSlots.join(', ')}` : '',
    bookingState.customerName ? `Cliente: ${bookingState.customerName}` : '',
  ].filter(Boolean).join(' | ');

  const recentHistory = conversationHistory.slice(-8)
    .map(m => `${m.fromMe ? 'VocÃª' : 'Cliente'}: ${m.text}`)
    .join('\n');

  const systemPrompt = `Voce e a atendente virtual do "${config.salon_name || 'Clinica'}". Converse naturalmente com o cliente pelo WhatsApp, como uma recepcionista simpatica e profissional.

${agentPrompt ? `INSTRUÃ‡Ã•ES DO DONO:\n${agentPrompt}\n` : ''}
SERVIÃ‡OS DISPONÃVEIS:
${servicesInfo}

PROFISSIONAIS:
${profsInfo}

HORÃRIOS DE FUNCIONAMENTO:
${hoursInfo}

${config.address ? `ENDEREÃ‡O: ${config.address}` : ''}
${config.phone ? `TELEFONE: ${config.phone}` : ''}

ESTADO DO AGENDAMENTO EM ANDAMENTO: ${stateInfo || 'Nenhum'}

${contextMessage ? `CONTEXTO IMPORTANTE: ${contextMessage}` : ''}

REGRAS:
- Converse naturalmente, SEM menus "digite 1, 2, 3"
- Se o cliente quer agendar, ajude coletando: serviÃ§o, profissional (se tiver), data e horÃ¡rio
- NÃ£o invente horÃ¡rios, serviÃ§os ou profissionais que nÃ£o existem
- Se houver slots jÃ¡ validados no contexto, use somente esses horÃ¡rios ao responder
- IMPORTANTE: NUNCA sugira horÃ¡rios especÃ­ficos (como "12:30", "14:10") a menos que uma lista de horÃ¡rios disponÃ­veis seja fornecida no contexto. Sem lista, pergunte apenas a preferÃªncia do cliente.
- NUNCA use markdown, negrito, listas com asterisco ou emojis
- Seja breve (mÃ¡ximo 3-4 linhas por mensagem)
- Use o nome do cliente quando souber
- Se todos os dados estiverem coletados, faÃ§a um RESUMO e peÃ§a confirmaÃ§Ã£o
- NÃ£o confirme agendamento por conta prÃ³pria, SEMPRE pergunte "Posso confirmar?"`;

  try {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
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

    return sanitizeClinicAssistantText(result.choices?.[0]?.message?.content || 'Como posso ajudar vocÃª?');
  } catch (err) {
    console.error('âŒ [Clinic] Erro ao gerar resposta IA:', err);
    return buildClinicDeterministicFallbackResponse(message, clinicData, bookingState, contextMessage);
  }
}

function buildClinicDeterministicFallbackResponse(
  message: string,
  clinicData: ClinicData,
  bookingState: BookingState,
  contextMessage: string,
): string {
  const { config, services } = clinicData;
  const contextualDate = bookingState.date ? formatClinicContextualDate(bookingState.date) : "";

  if (contextMessage.includes("cancelou o agendamento")) {
    return "Tudo certo. Nao vou confirmar esse agendamento. Se quiser remarcar, me diga o servico e o dia que voce prefere.";
  }

  if (contextMessage.includes("serviços e preços") || contextMessage.includes("servicos e preços") || contextMessage.includes("servicos e precos")) {
    const servicesSummary = services.slice(0, 8).map((service) => {
      const price = service.price ? `R$ ${service.price.toFixed(2).replace(".", ",")}` : "Consulte";
      return `${service.name}: ${price}`;
    }).join("\n");
    return servicesSummary || "Posso te ajudar com os atendimentos da clinica. Me diga qual servico voce procura.";
  }

  if (contextMessage.includes("horários de funcionamento") || contextMessage.includes("horarios de funcionamento")) {
    const hours = formatClinicHours(config.opening_hours);
    return hours ? `Nosso horario de funcionamento e:\n${hours}` : "Posso confirmar os horarios de atendimento para voce. Qual dia voce quer verificar?";
  }

  if (bookingState.awaitingAvailabilityConsent && bookingState.service && !bookingState.date) {
    return buildClinicPriceAndAvailabilityQuestion(bookingState);
  }

  if (!bookingState.customerName?.trim() && bookingState.service && bookingState.date && bookingState.time) {
    return buildCustomerNameQuestion(bookingState);
  }

  if (bookingState.service && bookingState.date && bookingState.time) {
    return buildBookingConfirmationQuestion(bookingState);
  }

  if (bookingState.service && bookingState.date && !bookingState.time) {
    return `Perfeito. Qual horario voce prefere para ${contextualDate} no servico ${bookingState.service.name}?`;
  }

  if (bookingState.service && !bookingState.date) {
    return buildClinicPriceAndAvailabilityQuestion(bookingState);
  }

  if (!bookingState.service && services.length > 0) {
    const topServices = services.slice(0, 6).map((service) => service.name).join(", ");
    return `Posso te ajudar com o agendamento. Qual servico voce deseja? Temos, por exemplo: ${topServices}.`;
  }

  if (matchesAnyTerm(normalizeSimpleReply(message), ["oi", "ola", "bom dia", "boa tarde", "boa noite"])) {
    return "Oi! Como posso te ajudar com seu atendimento hoje?";
  }

  return "Consigo te ajudar com agendamentos, servicos, horarios e valores. Me diga qual atendimento voce precisa.";
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GERAR RESPOSTA PRINCIPAL DO SALÃƒO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export async function generateClinicResponse(
  userId: string,
  conversationId: string,
  customerPhone: string,
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): Promise<{ text: string; shouldSave?: boolean } | null> {
  try {
    const clinicData = await getClinicData(userId);
    if (!clinicData || !clinicData.config.is_active) return null;

    const { config, services, professionals } = clinicData;
    const history = conversationHistory || [];
    const state = getBookingState(userId, customerPhone, conversationId);
    const previousServiceId = state.service?.id || null;
    const previousProfessionalId = state.professional?.id || null;
    const previousDate = state.date;

    console.log(`ðŸ’‡ [Clinic v2] msg="${message.substring(0, 80)}" phone=${customerPhone}`);
    console.log(`ðŸ’‡ [Clinic v2] state: svc=${state.service?.name || '-'} prof=${state.professional?.name || '-'} date=${state.date || '-'} time=${state.time || '-'} confirm=${state.awaitingConfirmation} consent=${state.awaitingAvailabilityConsent}`);

    // 0. VERIFICAR HORÃRIO DE ALMOÃ‡O â€” bloquear se estiver no intervalo
    const breakStatus = isCurrentlyInBreak(config.opening_hours);
    if (breakStatus.isDuringBreak) {
      console.log(`ðŸ’‡ [Clinic v2] â¸ï¸ HORÃRIO DE ALMOÃ‡O (${breakStatus.breakStart}â€“${breakStatus.breakEnd}) â€” bloqueando resposta`);
      return {
        text: breakStatus.message,
      };
    }

    // 1. EXTRAIR CAMPOS VIA IA
    const extracted = await extractClinicFieldsLLM(message, history, clinicData, state);
    const heuristicExtracted = extractClinicFieldsHeuristically(message, clinicData, state);

    if (extracted.intent === 'general' && heuristicExtracted.intent !== 'general') {
      extracted.intent = heuristicExtracted.intent;
    }

    if (!extracted.service && heuristicExtracted.service) {
      extracted.service = heuristicExtracted.service;
    }

    if (!extracted.professional && heuristicExtracted.professional) {
      extracted.professional = heuristicExtracted.professional;
    }

    if (!extracted.customerName && heuristicExtracted.customerName) {
      extracted.customerName = heuristicExtracted.customerName;
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
    }

    console.log(`ðŸ’‡ [Clinic v2] extracted:`, JSON.stringify(extracted));

    // 2. ATUALIZAR ESTADO COM CAMPOS EXTRAÃDOS
    if (extracted.customerName && !state.customerName) {
      state.customerName = extracted.customerName;
    }

    if (extracted.service) {
      const matched = matchService(extracted.service, services);
      if (matched) {
        state.service = matched;
        console.log(`ðŸ’‡ [Clinic v2] ServiÃ§o matched: ${matched.name}`);
      }
    }

    if (extracted.professional) {
      const matched = matchProfessional(extracted.professional, professionals);
      if (matched) {
        state.professional = matched;
        console.log(`ðŸ’‡ [Clinic v2] Profissional matched: ${matched.name}`);
      }
    }

    if (extracted.date) {
      const normalizedDate = normalizeClinicDateValue(extracted.date);
      if (normalizedDate) {
        state.date = normalizedDate;
        console.log(`ðŸ’‡ [Clinic v2] Data: ${normalizedDate}`);
      }
    }

    if (extracted.time) {
      const normalizedTime = normalizeClinicTimeValue(extracted.time);
      if (normalizedTime) {
        state.time = normalizedTime;
        console.log(`ðŸ’‡ [Clinic v2] Hora: ${normalizedTime}`);
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

    // 3. HANDLE CANCEL
    if (extracted.intent === 'cancel') {
      resetBookingState(userId, customerPhone, conversationId);
      return { text: await generateAIResponse(message, history, clinicData, state, 'O cliente cancelou o agendamento. Confirme o cancelamento de forma amigÃ¡vel.') };
    }

    // 4. HANDLE CONFIRMATION
    // Allow confirm when: (a) awaitingConfirmation is true OR (b) intent=confirm and all data present
    const hasAllBookingData = state.service && state.date && state.time;
    const explicitAffirmative = isExplicitAffirmative(message);
    const shouldConfirm = explicitAffirmative && (state.awaitingConfirmation || !!hasAllBookingData);

    if (state.awaitingAvailabilityConsent && extracted.intent === 'cancel') {
      state.awaitingAvailabilityConsent = false;
    }

    if (state.awaitingAvailabilityConsent && explicitAffirmative && state.service && !state.date) {
      const firstAvailableSlot = await findFirstAvailableClinicSlot(
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

    console.log(`ðŸ’‡ [Clinic v2] CONFIRM CHECK: intent=${extracted.intent} awaiting=${state.awaitingConfirmation} hasAllData=${!!hasAllBookingData} shouldConfirm=${shouldConfirm}`);
    if (shouldConfirm) {
      console.log(`ðŸ’‡ [Clinic v2] CONFIRM PATH: svc=${state.service?.name} date=${state.date} time=${state.time}`);
      if (!state.service || !state.date || !state.time) {
        state.awaitingConfirmation = false;
        console.log(`ðŸ’‡ [Clinic v2] CONFIRM FAIL: missing data`);
        return { text: await generateAIResponse(message, history, clinicData, state, 'Faltam dados para confirmar. Pergunte o que falta.') };
      }

      if (!state.customerName?.trim()) {
        state.awaitingConfirmation = false;
        console.log(`[Clinic v2] CONFIRM FAIL: missing customer name`);
        return { text: buildCustomerNameQuestion(state) };
      }

      // REVALIDATE SLOT
      console.log(`ðŸ’‡ [Clinic v2] REVALIDATING slot: ${state.date} ${state.time}`);
      const { valid, availableSlots } = await validateSlot(
        userId, state.date, state.time,
        state.professional?.id,
        state.service.duration_minutes
      );

      console.log(`ðŸ’‡ [Clinic v2] VALIDATE result: valid=${valid} availableSlots=${availableSlots.length}`);
      if (!valid) {
        state.awaitingConfirmation = false;
        state.time = null;

        if (shouldOfferSingleRealSlot(config) && availableSlots.length > 0) {
          state.time = availableSlots[0];
          rememberSuggestedSlots(state, state.date!, [availableSlots[0]]);
          state.lastUpdated = new Date();
          return { text: buildFirstAvailableSlotQuestion(state) };
        }

        // USAR FUNÃ‡ÃƒO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          clinicData,
          bookingState: state,
          date: state.date!,
          allowedSlots: availableSlots,
          breakConfig,
          serviceName: state.service?.name,
        });
        rememberSuggestedSlots(state, state.date!, slotResult.suggestedSlots);
        return { text: slotResult.messageText };
      }

      // CREATE APPOINTMENT
      console.log(`ðŸ’‡ [Clinic v2] CREATING appointment...`);
      const result = await createClinicAppointment(userId, conversationId, {
        clientName: state.customerName || 'Cliente',
        clientPhone: customerPhone,
        serviceId: state.service.id,
        serviceName: state.service.name,
        professionalId: state.professional?.id,
        professionalName: state.professional?.name,
        appointmentDate: state.date,
        startTime: state.time,
        durationMinutes: state.service.duration_minutes || 30,
      });

      console.log(`ðŸ’‡ [Clinic v2] CREATE result: success=${result.success} id=${result.appointmentId} error=${result.error}`);
      if (result.success) {
        const confirmationState: BookingState = {
          ...state,
          awaitingConfirmation: false,
          customerPhone,
          createdAt: new Date(),
          lastUpdated: new Date(),
        };
        clearSuggestedSlots(confirmationState);
        resetBookingState(userId, customerPhone, conversationId);

        return {
          text: buildAppointmentCreatedMessage(clinicData, confirmationState),
          shouldSave: true,
        };
      } else if (!result.suggestedSlots || result.suggestedSlots.length === 0) {
        state.awaitingConfirmation = false;
        return { text: buildAppointmentFailureMessage(result.error) };
      } else if (result.suggestedSlots && result.suggestedSlots.length > 0) {
        state.awaitingConfirmation = false;
        state.time = null;

        if (shouldOfferSingleRealSlot(config)) {
          const nextSlot = result.suggestedSlots[0];
          state.time = nextSlot;
          rememberSuggestedSlots(state, state.date!, [nextSlot]);
          state.lastUpdated = new Date();
          return { text: buildFirstAvailableSlotQuestion(state) };
        }

        // USAR FUNÃ‡ÃƒO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          clinicData,
          bookingState: state,
          date: state.date!,
          allowedSlots: result.suggestedSlots,
          breakConfig,
          serviceName: state.service?.name,
        });
        rememberSuggestedSlots(state, state.date!, slotResult.suggestedSlots);
        return { text: slotResult.messageText };
      } else {
        return { text: await generateAIResponse(message, history, clinicData, state, 'Erro ao criar agendamento. PeÃ§a desculpas e peÃ§a para tentar novamente.') };
      }
    }

    // 4.5. HANDLE CHECK_AVAILABILITY - Mostrar horÃ¡rios ANTES de pedir serviÃ§o
    const isAvailabilityQuery = extracted.intent === 'check_availability';
    
    if (isAvailabilityQuery) {
      // Determinar a data alvo
      const targetDate = normalizeClinicDateValue(extracted.date || state.date) || null;

      if (targetDate) {
        // Salvar data no estado
        state.date = targetDate;
        state.lastUpdated = new Date();

        // Buscar slots usando duracao padrao da clinica
        const defaultDuration = config.slot_duration || 30;
        const slots = await getAvailableSlots(userId, targetDate, state.professional?.id, defaultDuration);
        const dateFormatted = formatClinicContextualDate(targetDate);

        console.log(`ðŸ’‡ [Clinic v2] AVAILABILITY CHECK: date=${targetDate} slots=${slots.length}`);

        if (slots.length === 0) {
          clearSuggestedSlots(state);
          // Dia lotado - tentar prÃ³ximo dia Ãºtil
          let nextDate = new Date(targetDate + 'T12:00:00');
          let nextSlots: string[] = [];
          let nextDateStr = '';
          for (let i = 1; i <= 7; i++) {
            nextDate.setDate(nextDate.getDate() + 1);
            const y = nextDate.getFullYear();
            const m = (nextDate.getMonth() + 1).toString().padStart(2, '0');
            const d = nextDate.getDate().toString().padStart(2, '0');
            nextDateStr = `${y}-${m}-${d}`;
            nextSlots = await getAvailableSlots(userId, nextDateStr, undefined, defaultDuration);
            if (nextSlots.length > 0) break;
          }

          if (shouldOfferSingleRealSlot(config) && nextSlots.length > 0) {
            const nextFormatted = formatClinicContextualDate(nextDateStr);
            const nextFirstSlot = nextSlots[0];
            rememberSuggestedSlots(state, nextDateStr, [nextFirstSlot]);
            if (state.service) {
              state.date = nextDateStr;
              state.time = nextFirstSlot;
              state.lastUpdated = new Date();
              return { text: `Para ${dateFormatted}, nÃ£o encontrei vaga na agenda real. O prÃ³ximo horÃ¡rio disponÃ­vel Ã© ${nextFormatted}, Ã s ${nextFirstSlot}.\n\nEsse horÃ¡rio fica melhor para vocÃª?` };
            }

            return { text: `Para ${dateFormatted}, nÃ£o encontrei vaga na agenda real. O prÃ³ximo horÃ¡rio disponÃ­vel Ã© ${nextFormatted}, Ã s ${nextFirstSlot}.\n\nQual serviÃ§o vocÃª precisa?` };
          }

          if (nextSlots.length > 0) {
            const nextFormatted = formatClinicContextualDate(nextDateStr);
            const sampleSlots = nextSlots.slice(0, 6).join(', ');
            return { text: `Infelizmente nÃ£o temos horÃ¡rios disponÃ­veis para ${dateFormatted} ðŸ˜”\n\nO prÃ³ximo dia com vagas Ã© ${nextFormatted}. Alguns horÃ¡rios: ${sampleSlots}\n\nGostaria de agendar nesse dia? Qual serviÃ§o deseja?` };
          } else {
            return { text: `Infelizmente nÃ£o temos horÃ¡rios disponÃ­veis para ${dateFormatted} e nem nos prÃ³ximos dias. Por favor, entre em contato novamente em breve! ðŸ˜”` };
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
            ? `\n\nQual serviÃ§o vocÃª gostaria? Temos: ${services.slice(0, 5).map(s => s.name).join(', ')}`
            : '';

          return { text: `Para ${dateFormatted}, o primeiro horÃ¡rio disponÃ­vel Ã© ${firstSlot}.${servicesHint}` };
        }

        // Mostrar horÃ¡rios disponÃ­veis (5-8 slots espaÃ§ados)
        let displaySlots: string[];
        if (slots.length <= 8) {
          displaySlots = slots;
        } else {
          // Selecionar slots espaÃ§ados para cobrir o dia todo
          const step = Math.floor(slots.length / 7);
          displaySlots = [];
          for (let i = 0; i < slots.length && displaySlots.length < 8; i += step) {
            displaySlots.push(slots[i]);
          }
          // Garantir o Ãºltimo slot
          if (!displaySlots.includes(slots[slots.length - 1])) {
            displaySlots[displaySlots.length - 1] = slots[slots.length - 1];
          }
        }

        const slotsFormatted = displaySlots.join(', ');
        const totalMsg = slots.length > 8 ? ` (${slots.length} horÃ¡rios no total)` : '';
        rememberSuggestedSlots(state, targetDate, displaySlots);
        
        // Perguntar serviÃ§o DEPOIS de mostrar disponibilidade
        const servicesHint = !state.service && services.length > 0
          ? `\n\nQual serviÃ§o vocÃª gostaria? Temos: ${services.slice(0, 5).map(s => s.name).join(', ')}`
          : '';

        return { text: `Para ${dateFormatted}, temos os seguintes horÃ¡rios disponÃ­veis${totalMsg}:\n\nðŸ• ${slotsFormatted}\n${servicesHint}` };
      }

      return {
        text: 'Me diga o dia que vocÃª prefere e eu consulto os horÃ¡rios certinhos para vocÃª.',
      };
    }

    // 5. CHECK IF WE HAVE ALL DATA FOR BOOKING
    const needsService = !state.service && services.length > 0;
    const needsProfessional = !state.professional && config.use_professionals && professionals.length > 0;
    const needsDate = !state.date;
    const needsTime = !state.time;
    const needsCustomerName = !state.customerName?.trim();

    const isBookingIntent = extracted.intent === 'booking' || state.service !== null || state.date !== null;

    if (isBookingIntent && state.service && state.date && state.time && !state.awaitingConfirmation) {
      // All data collected - VALIDATE SLOT then ask confirmation
      const { valid, availableSlots } = await validateSlot(
        userId, state.date, state.time,
        state.professional?.id,
        state.service.duration_minutes
      );

      if (!valid) {
        state.time = null;

        // USAR FUNÃ‡ÃƒO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          clinicData,
          bookingState: state,
          date: state.date!,
          allowedSlots: availableSlots,
          breakConfig,
          serviceName: state.service?.name,
        });
        rememberSuggestedSlots(state, state.date!, slotResult.suggestedSlots);
        return { text: slotResult.messageText };
      }

      if (needsCustomerName) {
        clearSuggestedSlots(state);
        state.lastUpdated = new Date();
        return { text: buildCustomerNameQuestion(state) };
      }

      // SLOT VALID - ask confirmation
      clearSuggestedSlots(state);
      state.awaitingConfirmation = true;
      state.lastUpdated = new Date();
      return { text: buildBookingConfirmationQuestion(state) };
    }

    // 6. IF BOOKING INTENT, CHECK WHAT'S MISSING AND PROVIDE SLOTS IF DATE IS SET
    if (isBookingIntent) {
      let contextMsg = '';

      if (needsService) {
        const svcList = services.map(s => {
          const p = s.price ? ` (R$ ${s.price.toFixed(2).replace('.', ',')})` : '';
          return `${s.name}${p}`;
        }).join(', ');
        contextMsg = `O cliente quer agendar mas nÃ£o escolheu o serviÃ§o ainda. ServiÃ§os: ${svcList}. Pergunte qual serviÃ§o deseja.`;
      } else if (needsProfessional) {
        const profNames = professionals.map(p => p.name).join(', ');
        contextMsg = `ServiÃ§o escolhido: ${state.service!.name}. Profissionais disponÃ­veis: ${profNames}. Pergunte com qual profissional prefere ou se tanto faz.`;
      } else if (needsDate) {
        if (!state.awaitingAvailabilityConsent && state.service) {
          clearSuggestedSlots(state);
          state.awaitingAvailabilityConsent = true;
          state.lastUpdated = new Date();
          return { text: buildClinicPriceAndAvailabilityQuestion(state) };
        }

        contextMsg = `ServiÃ§o: ${state.service!.name}${state.professional ? ', Profissional: ' + state.professional.name : ''}. Aguarde a autorizacao do cliente para consultar a agenda real.`;
      } else if (needsTime) {
        // Fetch available slots for the date (jÃ¡ filtrados pelo backend - sem almoÃ§o)
        const slots = await getAvailableSlots(
          userId, state.date!, state.professional?.id, state.service!.duration_minutes
        );
        if (slots.length === 0) {
          const requestedDate = state.date || ''; // Salvar antes de limpar
          clearSuggestedSlots(state);
          state.date = null;
          contextMsg = `NÃ£o hÃ¡ horÃ¡rios disponÃ­veis para ${formatDatePtBr(requestedDate)}. PeÃ§a outra data ao cliente.`;
        } else {
          if (shouldOfferSingleRealSlot(config)) {
            state.time = slots[0];
            rememberSuggestedSlots(state, state.date!, [slots[0]]);
            state.lastUpdated = new Date();
            return { text: buildFirstAvailableSlotQuestion(state) };
          }

          // USAR FUNÃ‡ÃƒO ESTRUTURADA: IA retorna JSON com validaÃ§Ã£o de slots
          const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
          const slotResult = await generateSlotSuggestionMessageLLM({
            message,
            conversationHistory: history,
            clinicData,
            bookingState: state,
            date: state.date!,
            allowedSlots: slots,
            breakConfig,
            serviceName: state.service?.name,
          });
          rememberSuggestedSlots(state, state.date!, slotResult.suggestedSlots);
          // Retornar diretamente a mensagem validada (sem passar por generateAIResponse)
          return { text: slotResult.messageText };
        }
      } else if (needsCustomerName) {
        return { text: buildCustomerNameQuestion(state) };
      }

      return { text: await generateAIResponse(message, history, clinicData, state, contextMsg) };
    }

    // 7. INFO-ONLY INTENTS (services, hours, prices)
    if (extracted.intent === 'info_services' || extracted.intent === 'info_prices') {
      const svcInfo = services.map(s => {
        const p = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'Consulte';
        return `${s.name}: ${p} (${s.duration_minutes}min)`;
      }).join(', ');
      return { text: await generateAIResponse(message, history, clinicData, state, `Informe os serviÃ§os e preÃ§os: ${svcInfo}`) };
    }

    if (extracted.intent === 'info_hours') {
      const hours = formatClinicHours(config.opening_hours);
      return { text: await generateAIResponse(message, history, clinicData, state, `Informe os horÃ¡rios de funcionamento:\n${hours}`) };
    }

    // 8. GENERAL CONVERSATION - AI handles naturally
    return { text: await generateAIResponse(message, history, clinicData, state, '') };

  } catch (err) {
    console.error('âŒ [Clinic] Erro ao gerar resposta:', err);
    return null;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EXPORTS PARA COMPATIBILIDADE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export async function isClinicActive(userId: string): Promise<boolean> {
  const config = await getClinicConfig(userId);
  return config?.is_active === true;
}

// Legacy exports (unused but kept for import compatibility)
export function detectClinicIntent(): ClinicIntent { return 'OTHER'; }

