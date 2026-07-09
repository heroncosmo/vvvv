/**
 * SALON AI SERVICE v2 - SISTEMA INTELIGENTE DE AGENDAMENTO PARA SALÕES
 *
 * ARQUITETURA (IA + VALIDAÇÃO DETERMINÍSTICA):
 * 1. IA conversa livremente com o cliente (sem menus "digite 1, 2, 3")
 * 2. IA extrai campos estruturados (serviço, profissional, data, hora) via LLM
 * 3. Validação determinística: slots reais, conflitos, horário comercial
 * 4. Confirmação explícita antes de agendar
 * 5. Agendamento seguro com revalidação pré-insert
 */

import { supabase } from "./supabaseAuth";
import {
  getAvailableStartTimes,
  validateSlot,
  checkOverlapBeforeInsert,
  findAvailableProfessional,
} from "./salonAvailability";
import {
  buildDeterministicSlotSuggestionMessage,
  buildSlotDisplay,
  formatDatePtBr,
  formatSalonContextualDate,
  getBrazilNow,
  getBrazilToday,
  type BreakConfig,
  normalizeSalonDateValue,
  normalizeSalonTimeValue,
} from "./salonFormatting";
import {
  getModuleAutoConfirmValue,
  getModuleSchedulingSettings,
} from "./moduleSchedulingSettings";
import {
  checkSalonGoogleCalendarAvailability,
  syncSalonAppointmentWithCalendar,
} from "./salonCalendarSync";

// ═══════════════════════════════════════════════════════════════════════
// INTERFACES E TIPOS
// ═══════════════════════════════════════════════════════════════════════

export interface OpeningHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

export interface SalonConfig {
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

export interface SalonService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  is_active: boolean;
  color: string | null;
}

export interface SalonProfessional {
  id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  work_schedule: Record<string, any>;
}

export interface SalonData {
  config: SalonConfig;
  services: SalonService[];
  professionals: SalonProfessional[];
}

// Keep old types exported for compatibility
export type SalonIntent = 'GREETING' | 'WANT_SERVICES' | 'WANT_PROFESSIONALS' | 'WANT_TO_BOOK' | 'SELECT_SERVICE' | 'SELECT_PROFESSIONAL' | 'SELECT_DATE' | 'SELECT_TIME' | 'CONFIRM_BOOKING' | 'CANCEL_BOOKING' | 'CHECK_BOOKING' | 'ASK_BUSINESS_HOURS' | 'ASK_PRICES' | 'PROVIDE_NAME' | 'OTHER';

// ═══════════════════════════════════════════════════════════════════════
// ESTADO DO AGENDAMENTO (EM MEMÓRIA)
// ═══════════════════════════════════════════════════════════════════════

interface BookingState {
  service: SalonService | null;
  professional: SalonProfessional | null;
  date: string | null;       // YYYY-MM-DD
  time: string | null;       // HH:mm
  customerName: string | null;
  customerPhone: string;
  awaitingConfirmation: boolean;
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
  console.log(`💇 [Salon] Estado resetado: ${key}`);
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

function buildValidatedSlotContext(state: BookingState): string {
  if (!state.lastSuggestedDate || state.lastSuggestedSlots.length === 0) {
    return 'Nenhum slot validado recentemente.';
  }

  return [
    `Última data validada no backend: ${state.lastSuggestedDate}`,
    `Horários válidos já oferecidos ao cliente: ${state.lastSuggestedSlots.join(', ')}`,
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
    ? `Estamos no horário de almoço (${breakConfig.start} às ${breakConfig.end}). Voltamos em breve! 🍽️`
    : '';

  return { isDuringBreak, message, breakStart: breakConfig.start, breakEnd: breakConfig.end };
}

export function isSalonOpen(openingHours?: Record<string, OpeningHoursDay>): {
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

function formatSalonHours(openingHours?: Record<string, OpeningHoursDay>): string {
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

function getProfessionalDisplayName(professional?: SalonProfessional | null): string {
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
  const contextualDate = formatSalonContextualDate(bookingState.date || '');
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

function buildCustomerNameQuestion(
  bookingState: BookingState,
): string {
  const contextualDate = formatSalonContextualDate(bookingState.date || '');

  return [
    `Perfeito! Antes de confirmar ${bookingState.service?.name || 'o atendimento'}${bookingState.professional ? ` com ${bookingState.professional.name}` : ''}, preciso do seu nome.`,
    contextualDate ? `Data escolhida: ${contextualDate}` : '',
    bookingState.time ? `Horario escolhido: ${bookingState.time}` : '',
    'Como posso te chamar para finalizar o agendamento?',
  ].filter(Boolean).join('\n');
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
  salonData: SalonData,
  bookingState: BookingState,
): string {
  const { config } = salonData;
  const contextualDate = formatSalonContextualDate(bookingState.date || '');
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
    'Horário: {horario}',
    'Serviço: {servico}',
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
    `Horário: ${bookingState.time || ''}`,
    `Serviço: ${bookingState.service?.name || 'Atendimento'}`,
    `Profissional: ${getProfessionalDisplayName(bookingState.professional)}`,
  ].join('\n').trim();
}

// ═══════════════════════════════════════════════════════════════════════
// BUSCAR DADOS DO SALÃO
// ═══════════════════════════════════════════════════════════════════════

export async function getSalonConfig(userId: string): Promise<SalonConfig | null> {
  try {
    const { data, error } = await supabase
      .from('salon_config').select('*').eq('user_id', userId).maybeSingle();
    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('❌ [Salon] Erro ao buscar config:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('❌ [Salon] Erro ao buscar config:', err);
    return null;
  }
}

export async function getSalonData(userId: string): Promise<SalonData | null> {
  try {
    const config = await getSalonConfig(userId);
    if (!config) return null;
    const { data: services } = await supabase
      .from('scheduling_services').select('*').eq('user_id', userId).eq('is_active', true).order('display_order');
    const { data: professionals } = await supabase
      .from('scheduling_professionals').select('*').eq('user_id', userId).eq('is_active', true).order('display_order');
    return { config, services: services || [], professionals: professionals || [] };
  } catch (err) {
    console.error('❌ [Salon] Erro ao buscar dados:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BUSCAR HORÁRIOS DISPONÍVEIS (usa novo módulo)
// ═══════════════════════════════════════════════════════════════════════

export async function getAvailableSlots(
  userId: string,
  date: string,
  professionalId?: string,
  serviceDuration?: number
): Promise<string[]> {
  try {
    const salonData = await getSalonData(userId);
    if (!salonData) return [];

    const slotDuration = serviceDuration || salonData.config.slot_duration || 30;

    return await getAvailableStartTimes({
      userId,
      date,
      professionalId,
      serviceDurationMinutes: slotDuration,
      stepMinutes: 5,
    });
  } catch (err) {
    console.error('❌ [Salon] Erro ao buscar slots:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CRIAR AGENDAMENTO SEGURO (revalida antes de inserir)
// ═══════════════════════════════════════════════════════════════════════

export async function createSalonAppointment(
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
    const normalizedDate = normalizeSalonDateValue(data.appointmentDate);
    const normalizedTime = normalizeSalonTimeValue(data.startTime);
    const salonConfig = await getSalonConfig(userId);

    if (!normalizedDate || !normalizedTime) {
      return { success: false, error: 'Data ou horário inválido' };
    }

    // Verificar se o profissional foi especificado
    let professionalId = data.professionalId;
    let professionalName = data.professionalName;

    if (!professionalId) {
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
        .from('scheduling_professionals')
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
      console.log(`❌ [Salon] Slot ${normalizedTime} em ${normalizedDate} já ocupado! Sugerindo alternativas.`);
      return { success: false, error: 'Horário já ocupado', suggestedSlots: availableSlots.slice(0, 5) };
    }

    const { data: existingAppointments, error: existingAppointmentError } = await supabase
      .from('appointments')
      .select('id, client_name, service_name')
      .eq('user_id', userId)
      .eq('client_phone', data.clientPhone)
      .eq('appointment_date', normalizedDate)
      .eq('start_time', normalizedTime)
      .in('status', ['pending', 'confirmed'])
      .limit(5);

    if (existingAppointmentError) {
      console.error('❌ [Salon] Erro ao verificar idempotência do agendamento:', existingAppointmentError);
    } else if (existingAppointments && existingAppointments.length > 0) {
      const normalizedClientName = (data.clientName || '').trim().toLocaleLowerCase('pt-BR');
      const normalizedServiceName = (data.serviceName || '').trim().toLocaleLowerCase('pt-BR');
      const matchingAppointment = existingAppointments.find((appointment: any) => {
        const sameName = String(appointment.client_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedClientName;
        const sameService = !normalizedServiceName
          || String(appointment.service_name || '').trim().toLocaleLowerCase('pt-BR') === normalizedServiceName;

        return sameName && sameService;
      }) || existingAppointments[0];

      console.log(`💇 [Salon] Reaproveitando agendamento existente ${matchingAppointment.id} para ${normalizedDate} ${normalizedTime}`);
      return { success: true, appointmentId: matchingAppointment.id };
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
      console.log(`❌ [Salon] Overlap detectado na checagem final! Abortando insert.`);
      return { success: false, error: 'Conflito de horário detectado', suggestedSlots: availableSlots.slice(0, 5) };
    }

    const googleAvailability = await checkSalonGoogleCalendarAvailability(
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
        console.warn('[Salon] Could not validate conversation_id, saving appointment without conversation link:', conversationLookupError);
      } else if (conversationRecord?.id) {
        safeConversationId = conversationRecord.id;
      }
    }

    const { data: appointment, error } = await supabase
      .from('appointments')
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
        status: options?.status || (getModuleAutoConfirmValue(salonConfig?.opening_hours) ? 'confirmed' : 'pending'),
        confirmed_by_client: options?.confirmedByClient ?? true,
        confirmed_by_business: options?.confirmedByBusiness ?? (options?.status ? options.status === 'confirmed' : getModuleAutoConfirmValue(salonConfig?.opening_hours)),
        created_by_ai: options?.createdByAi ?? true,
        client_notes: options?.clientNotes || null,
        internal_notes: options?.internalNotes || null,
        ai_conversation_context: {
          source: options?.source || 'salon_ai_service_v2',
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
      console.error('❌ [Salon] Erro ao criar agendamento:', error);
      return { success: false, error: error.message };
    }
    console.log(`✅ [Salon] Agendamento criado: ${appointment.id}`);
    const syncResult = await syncSalonAppointmentWithCalendar(
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
      console.error(`âŒ [Salon] Falha ao sincronizar agendamento ${appointment.id} com Google Calendar:`, syncResult.error);
      await supabase
        .from('appointments')
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
        .from('appointments')
        .update({
          google_event_id: syncResult.eventId,
          google_calendar_synced: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.id)
        .eq('user_id', userId);
    }

    const schedulingSettings = getModuleSchedulingSettings(salonConfig?.opening_hours);
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
        console.error("[Salon] Failed to send booking notification:", error);
      });
    }

    return { success: true, appointmentId: appointment.id };
  } catch (err) {
    console.error('❌ [Salon] Erro ao criar agendamento:', err);
    return { success: false, error: 'Erro interno' };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXTRAÇÃO DE CAMPOS VIA IA (LLM → JSON estruturado)
// ═══════════════════════════════════════════════════════════════════════

interface ExtractedFields {
  intent: 'greeting' | 'booking' | 'check_availability' | 'info_services' | 'info_hours' | 'info_prices' | 'confirm' | 'cancel' | 'check_booking' | 'general';
  service?: string;
  professional?: string;
  date?: string;
  time?: string;
  customerName?: string;
}

async function extractSalonFieldsLLM(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  salonData: SalonData,
  bookingState: BookingState
): Promise<ExtractedFields> {
  const now = getBrazilNow();
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const todayStr = dayNames[now.getDay()];
  const todayDate = getBrazilToday();

  const servicesList = salonData.services.map(s => s.name).join(', ');
  const profList = salonData.professionals.map(p => p.name).join(', ');

  const stateInfo = [
    bookingState.service ? `Serviço já escolhido: ${bookingState.service.name}` : '',
    bookingState.professional ? `Profissional já escolhido: ${bookingState.professional.name}` : '',
    bookingState.date ? `Data já escolhida: ${bookingState.date}` : '',
    bookingState.time ? `Horário já escolhido: ${bookingState.time}` : '',
    bookingState.lastSuggestedDate ? `Última data de slots validados: ${bookingState.lastSuggestedDate}` : '',
    bookingState.lastSuggestedSlots.length > 0 ? `Últimos horários válidos mostrados: ${bookingState.lastSuggestedSlots.join(', ')}` : '',
    bookingState.awaitingConfirmation ? 'AGUARDANDO CONFIRMAÇÃO DO CLIENTE' : '',
  ].filter(Boolean).join('\n');

  const recentHistory = conversationHistory.slice(-10)
    .map(m => `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text}`)
    .join('\n');

  const validatedSlotContext = buildValidatedSlotContext(bookingState);

  const extractPrompt = `Extraia campos estruturados da mensagem do cliente de um salão de beleza.

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

Responda APENAS em JSON (sem markdown):
{
  "intent": "greeting|booking|check_availability|info_services|info_hours|info_prices|confirm|cancel|check_booking|general",
  "service": "nome exato do serviço ou null",
  "professional": "nome exato do profissional ou null",
  "date": "YYYY-MM-DD ou null (hoje=${todayDate}, amanhã=calcule, próxima segunda=calcule, etc)",
  "time": "HH:mm ou null (fim da tarde=16:00, manhã=09:00, depois do almoço=14:00, etc)",
  "customerName": "nome do cliente ou null"
}

Regras:
- Se o cliente diz "sim", "confirmo", "pode marcar" e estamos AGUARDANDO CONFIRMAÇÃO, intent="confirm"
- Se menciona serviço (mesmo parcial), extraia o nome EXATO do serviço disponível mais próximo
- Se menciona profissional, extraia o nome EXATO
- Datas relativas: "amanhã" → calcule a data, "segunda" → próxima segunda, "sábado" → próximo sábado
- Horários vagos: "fim da tarde" → 16:00, "depois do almoço" → 14:00, "manhã" → 09:00, "meio dia" → 12:00
- Use a hora atual de São Paulo como referência viva para não considerar horário passado como opção válida de hoje
- Nunca trate como horário de hoje algo que já passou no Brasil
- Se houver um resumo anterior da atendente com data/horário e o cliente apenas confirmar, repita esses mesmos campos no JSON
- Se houver slots já validados no backend, nunca invente horário novo fora dessa lista sem o cliente escrever explicitamente outro horário
- Se a data vier em formato brasileiro (ex: 05/03/2026), interprete como DD/MM/YYYY, nunca como MM/DD/YYYY
- "não", "cancelar", "desistir" → intent="cancel"
- Se o cliente quer agendar algo (cortar, pintar, fazer unha, etc) → intent="booking"
- Se o cliente pergunta sobre DISPONIBILIDADE de horários sem mencionar serviço específico ("quais horários tem", "tem horário", "horário disponível", "tem vaga", "o que tem disponível") → intent="check_availability" (com a data se mencionada)
- Se a mensagem vier curta e depender do contexto ("esse horário", "esse dia", "pode ser", "fechado"), use o estado atual e o histórico recente para completar os campos`;

  try {
    const result: any = await Promise.resolve({ choices: [] });
    void ({
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
    const normalizedDate = normalizeSalonDateValue(parsed.date);
    const normalizedTime = normalizeSalonTimeValue(parsed.time);

    return {
      intent: parsed.intent || 'general',
      service: parsed.service || undefined,
      professional: parsed.professional || undefined,
      date: normalizedDate || undefined,
      time: normalizedTime || undefined,
      customerName: parsed.customerName || undefined,
    };
  } catch (err) {
    console.error('❌ [Salon] Erro na extração LLM:', err);
    return { intent: 'general' };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RESOLVER SERVIÇO E PROFISSIONAL POR NOME (fuzzy match)
// ═══════════════════════════════════════════════════════════════════════

function matchService(name: string | undefined, services: SalonService[]): SalonService | null {
  if (!name || services.length === 0) return null;
  const lower = name.toLowerCase().trim();
  // Exact match
  const exact = services.find(s => s.name.toLowerCase() === lower);
  if (exact) return exact;
  // Partial match
  const partial = services.find(s =>
    s.name.toLowerCase().includes(lower) || lower.includes(s.name.toLowerCase())
  );
  return partial || null;
}

function matchProfessional(name: string | undefined, professionals: SalonProfessional[]): SalonProfessional | null {
  if (!name || professionals.length === 0) return null;
  const lower = name.toLowerCase().trim();
  const noPreferenceTerms = ['qualquer', 'tanto faz', 'sem prefer'];
  if (noPreferenceTerms.some(term => lower.includes(term))) return professionals[0];
  const exact = professionals.find(p => p.name.toLowerCase() === lower);
  if (exact) return exact;
  const partial = professionals.find(p =>
    p.name.toLowerCase().includes(lower) || lower.includes(p.name.toLowerCase())
  );
  return partial || null;
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
  salonData: SalonData;
  bookingState: BookingState;
  date: string;
  allowedSlots: string[];
  breakConfig?: { enabled: boolean; start: string; end: string };
  serviceName?: string;
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

// ═══════════════════════════════════════════════════════════════════════
// GERAR RESPOSTA VIA IA (conversacional)
// ═══════════════════════════════════════════════════════════════════════

async function generateAIResponse(
  message: string,
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  salonData: SalonData,
  bookingState: BookingState,
  contextMessage: string
): Promise<string> {
  const { config, services, professionals } = salonData;

  const agentPrompt = config.ai_instructions || '';

  const servicesInfo = services.length > 0
    ? services.map(s => {
        const price = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'Consulte';
        return `- ${s.name}: ${price} (${s.duration_minutes || 30}min)${s.description ? ' - ' + s.description : ''}`;
      }).join('\n')
    : 'Nenhum serviço cadastrado.';

  const profsInfo = professionals.length > 0
    ? professionals.map(p => `- ${p.name}${p.bio ? ': ' + p.bio : ''}`).join('\n')
    : 'Nenhum profissional cadastrado.';

  const hoursInfo = formatSalonHours(config.opening_hours);

  const stateInfo = [
    bookingState.service ? `Serviço escolhido: ${bookingState.service.name}` : '',
    bookingState.professional ? `Profissional: ${bookingState.professional.name}` : '',
    bookingState.date ? `Data: ${formatDatePtBr(bookingState.date)}` : '',
    bookingState.time ? `Horário: ${bookingState.time}` : '',
    bookingState.lastSuggestedDate ? `Últimos slots validados para: ${formatDatePtBr(bookingState.lastSuggestedDate)}` : '',
    bookingState.lastSuggestedSlots.length > 0 ? `Slots validados: ${bookingState.lastSuggestedSlots.join(', ')}` : '',
    bookingState.customerName ? `Cliente: ${bookingState.customerName}` : '',
  ].filter(Boolean).join(' | ');

  const recentHistory = conversationHistory.slice(-8)
    .map(m => `${m.fromMe ? 'Você' : 'Cliente'}: ${m.text}`)
    .join('\n');

  const systemPrompt = `Você é a atendente virtual do "${config.salon_name || 'Salão'}". Converse naturalmente com o cliente pelo WhatsApp, como uma recepcionista simpática e profissional.

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

REGRAS:
- Converse naturalmente, SEM menus "digite 1, 2, 3"
- Se o cliente quer agendar, ajude coletando: serviço, profissional (se tiver), data e horário
- Não invente horários, serviços ou profissionais que não existem
- Se houver slots já validados no contexto, use somente esses horários ao responder
- IMPORTANTE: NUNCA sugira horários específicos (como "12:30", "14:10") a menos que uma lista de horários disponíveis seja fornecida no contexto. Sem lista, pergunte apenas a preferência do cliente.
- Seja breve (máximo 3-4 linhas por mensagem)
- Use o nome do cliente quando souber
- Se todos os dados estiverem coletados, faça um RESUMO e peça confirmação
- Não confirme agendamento por conta própria, SEMPRE pergunte "Posso confirmar?"`;

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

    const result: any = await Promise.resolve({ choices: [] });
    void ({
      messages,
      maxTokens: 300,
      temperature: 0.7,
    });

    return result.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error('❌ [Salon] Erro ao gerar resposta IA:', err);
    return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GERAR RESPOSTA PRINCIPAL DO SALÃO
// ═══════════════════════════════════════════════════════════════════════

export async function generateSalonResponse(
  userId: string,
  conversationId: string,
  customerPhone: string,
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): Promise<{ text: string; shouldSave?: boolean } | null> {
  try {
    const salonData = await getSalonData(userId);
    if (!salonData || !salonData.config.is_active) return null;

    const { config, services, professionals } = salonData;
    const history = conversationHistory || [];
    const state = getBookingState(userId, customerPhone, conversationId);
    const previousServiceId = state.service?.id || null;
    const previousProfessionalId = state.professional?.id || null;
    const previousDate = state.date;

    console.log(`💇 [Salon v2] msg="${message.substring(0, 80)}" phone=${customerPhone}`);
    console.log(`💇 [Salon v2] state: svc=${state.service?.name || '-'} prof=${state.professional?.name || '-'} date=${state.date || '-'} time=${state.time || '-'} confirm=${state.awaitingConfirmation}`);

    // 0. VERIFICAR HORÁRIO DE ALMOÇO — bloquear se estiver no intervalo
    const breakStatus = isCurrentlyInBreak(config.opening_hours);
    if (breakStatus.isDuringBreak) {
      console.log(`💇 [Salon v2] ⏸️ HORÁRIO DE ALMOÇO (${breakStatus.breakStart}–${breakStatus.breakEnd}) — bloqueando resposta`);
      return {
        text: breakStatus.message,
      };
    }

    // 1. EXTRAIR CAMPOS VIA IA
    const extracted = await extractSalonFieldsLLM(message, history, salonData, state);
    const selectedSuggestedSlot = !extracted.time
      ? detectSuggestedSlotSelection(message, state.lastSuggestedSlots)
      : null;

    if (selectedSuggestedSlot) {
      extracted.time = selectedSuggestedSlot;
      if (!extracted.date && state.lastSuggestedDate) {
        extracted.date = state.lastSuggestedDate;
      }
    }

    console.log(`💇 [Salon v2] extracted:`, JSON.stringify(extracted));

    // 2. ATUALIZAR ESTADO COM CAMPOS EXTRAÍDOS
    if (extracted.customerName && !state.customerName) {
      state.customerName = extracted.customerName;
    }

    if (extracted.service) {
      const matched = matchService(extracted.service, services);
      if (matched) {
        state.service = matched;
        console.log(`💇 [Salon v2] Serviço matched: ${matched.name}`);
      }
    }

    if (extracted.professional) {
      const matched = matchProfessional(extracted.professional, professionals);
      if (matched) {
        state.professional = matched;
        console.log(`💇 [Salon v2] Profissional matched: ${matched.name}`);
      }
    }

    if (extracted.date) {
      const normalizedDate = normalizeSalonDateValue(extracted.date);
      if (normalizedDate) {
        state.date = normalizedDate;
        console.log(`💇 [Salon v2] Data: ${normalizedDate}`);
      }
    }

    if (extracted.time) {
      const normalizedTime = normalizeSalonTimeValue(extracted.time);
      if (normalizedTime) {
        state.time = normalizedTime;
        console.log(`💇 [Salon v2] Hora: ${normalizedTime}`);
      }
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
      return { text: await generateAIResponse(message, history, salonData, state, 'O cliente cancelou o agendamento. Confirme o cancelamento de forma amigável.') };
    }

    // 4. HANDLE CONFIRMATION
    // Allow confirm when: (a) awaitingConfirmation is true OR (b) intent=confirm and all data present
    const hasAllBookingData = state.service && state.date && state.time;
    const shouldConfirm = extracted.intent === 'confirm' && (state.awaitingConfirmation || hasAllBookingData);
    console.log(`💇 [Salon v2] CONFIRM CHECK: intent=${extracted.intent} awaiting=${state.awaitingConfirmation} hasAllData=${!!hasAllBookingData} shouldConfirm=${shouldConfirm}`);
    if (shouldConfirm) {
      console.log(`💇 [Salon v2] CONFIRM PATH: svc=${state.service?.name} date=${state.date} time=${state.time}`);
      if (!state.service || !state.date || !state.time) {
        state.awaitingConfirmation = false;
        console.log(`💇 [Salon v2] CONFIRM FAIL: missing data`);
        return { text: await generateAIResponse(message, history, salonData, state, 'Faltam dados para confirmar. Pergunte o que falta.') };
      }

      if (!state.customerName?.trim()) {
        state.awaitingConfirmation = false;
        console.log(`[Salon v2] CONFIRM FAIL: missing customer name`);
        return { text: buildCustomerNameQuestion(state) };
      }

      // REVALIDATE SLOT
      console.log(`💇 [Salon v2] REVALIDATING slot: ${state.date} ${state.time}`);
      const { valid, availableSlots } = await validateSlot(
        userId, state.date, state.time,
        state.professional?.id,
        state.service.duration_minutes
      );

      console.log(`💇 [Salon v2] VALIDATE result: valid=${valid} availableSlots=${availableSlots.length}`);
      if (!valid) {
        state.awaitingConfirmation = false;
        state.time = null;

        // USAR FUNÇÃO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          salonData,
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
      console.log(`💇 [Salon v2] CREATING appointment...`);
      const result = await createSalonAppointment(userId, conversationId, {
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

      console.log(`💇 [Salon v2] CREATE result: success=${result.success} id=${result.appointmentId} error=${result.error}`);
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
          text: buildAppointmentCreatedMessage(salonData, confirmationState),
          shouldSave: true,
        };
      } else if (!result.suggestedSlots || result.suggestedSlots.length === 0) {
        state.awaitingConfirmation = false;
        return { text: buildAppointmentFailureMessage(result.error) };
      } else if (result.suggestedSlots && result.suggestedSlots.length > 0) {
        state.awaitingConfirmation = false;
        state.time = null;

        // USAR FUNÇÃO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          salonData,
          bookingState: state,
          date: state.date!,
          allowedSlots: result.suggestedSlots,
          breakConfig,
          serviceName: state.service?.name,
        });
        rememberSuggestedSlots(state, state.date!, slotResult.suggestedSlots);
        return { text: slotResult.messageText };
      } else {
        return { text: await generateAIResponse(message, history, salonData, state, 'Erro ao criar agendamento. Peça desculpas e peça para tentar novamente.') };
      }
    }

    // 4.5. HANDLE CHECK_AVAILABILITY - Mostrar horários ANTES de pedir serviço
    const isAvailabilityQuery = extracted.intent === 'check_availability';
    
    if (isAvailabilityQuery) {
      // Determinar a data alvo
      const targetDate = normalizeSalonDateValue(extracted.date || state.date) || null;

      if (targetDate) {
        // Salvar data no estado
        state.date = targetDate;
        state.lastUpdated = new Date();

        // Buscar slots usando duração padrão do salão
        const defaultDuration = config.slot_duration || 30;
        const slots = await getAvailableSlots(userId, targetDate, state.professional?.id, defaultDuration);
        const dateFormatted = formatSalonContextualDate(targetDate);

        console.log(`💇 [Salon v2] AVAILABILITY CHECK: date=${targetDate} slots=${slots.length}`);

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
            nextSlots = await getAvailableSlots(userId, nextDateStr, undefined, defaultDuration);
            if (nextSlots.length > 0) break;
          }

          if (nextSlots.length > 0) {
            const nextFormatted = formatSalonContextualDate(nextDateStr);
            const sampleSlots = nextSlots.slice(0, 6).join(', ');
            return { text: `Infelizmente não temos horários disponíveis para ${dateFormatted} 😔\n\nO próximo dia com vagas é ${nextFormatted}. Alguns horários: ${sampleSlots}\n\nGostaria de agendar nesse dia? Qual serviço deseja?` };
          } else {
            return { text: `Infelizmente não temos horários disponíveis para ${dateFormatted} e nem nos próximos dias. Por favor, entre em contato novamente em breve! 😔` };
          }
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

        // USAR FUNÇÃO ESTRUTURADA para sugerir alternativas
        const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
        const slotResult = await generateSlotSuggestionMessageLLM({
          message,
          conversationHistory: history,
          salonData,
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
        contextMsg = `O cliente quer agendar mas não escolheu o serviço ainda. Serviços: ${svcList}. Pergunte qual serviço deseja.`;
      } else if (needsProfessional) {
        const profNames = professionals.map(p => p.name).join(', ');
        contextMsg = `Serviço escolhido: ${state.service!.name}. Profissionais disponíveis: ${profNames}. Pergunte com qual profissional prefere ou se tanto faz.`;
      } else if (needsDate) {
        contextMsg = `Serviço: ${state.service!.name}${state.professional ? ', Profissional: ' + state.professional.name : ''}. Pergunte qual dia/data o cliente prefere.`;
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
          const breakConfig = config.opening_hours?.['__break'] as { enabled: boolean; start: string; end: string } | undefined;
          const slotResult = await generateSlotSuggestionMessageLLM({
            message,
            conversationHistory: history,
            salonData,
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

      return { text: await generateAIResponse(message, history, salonData, state, contextMsg) };
    }

    // 7. INFO-ONLY INTENTS (services, hours, prices)
    if (extracted.intent === 'info_services' || extracted.intent === 'info_prices') {
      const svcInfo = services.map(s => {
        const p = s.price ? `R$ ${s.price.toFixed(2).replace('.', ',')}` : 'Consulte';
        return `${s.name}: ${p} (${s.duration_minutes}min)`;
      }).join(', ');
      return { text: await generateAIResponse(message, history, salonData, state, `Informe os serviços e preços: ${svcInfo}`) };
    }

    if (extracted.intent === 'info_hours') {
      const hours = formatSalonHours(config.opening_hours);
      return { text: await generateAIResponse(message, history, salonData, state, `Informe os horários de funcionamento:\n${hours}`) };
    }

    // 8. GENERAL CONVERSATION - AI handles naturally
    return { text: await generateAIResponse(message, history, salonData, state, '') };

  } catch (err) {
    console.error('❌ [Salon] Erro ao gerar resposta:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS PARA COMPATIBILIDADE
// ═══════════════════════════════════════════════════════════════════════

export async function isSalonActive(userId: string): Promise<boolean> {
  const config = await getSalonConfig(userId);
  return config?.is_active === true;
}

// Legacy exports (unused but kept for import compatibility)
export function detectSalonIntent(): SalonIntent { return 'OTHER'; }
