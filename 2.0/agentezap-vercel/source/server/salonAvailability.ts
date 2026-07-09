/**
 * SALON AVAILABILITY MODULE
 *
 * Módulo unificado para cálculo de disponibilidade de salão com:
 * - Duração real de cada serviço
 * - Antecedência mínima em minutos (compatível com horas antigas)
 * - Bloqueio de horário de almoço (intervalo global)
 * - Exclusividade por profissional (sem overlap)
 * - Overlap real considerando duração + buffer
 */

import { supabase } from "./supabaseAuth";
import {
  filterSlotsAgainstGoogleBusyWindows,
  listSalonGoogleBusyWindows,
} from "./salonCalendarSync";

// ═══════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════

export interface SalonConfig {
  id: string;
  user_id: string;
  is_active: boolean;
  opening_hours?: Record<string, { enabled: boolean; open: string; close: string }>;
  slot_duration: number;
  buffer_between: number;
  max_advance_days: number;
  min_notice_hours?: number;       // LEGADO - manter compatibilidade
  min_notice_minutes?: number;     // NOVO - minutos de antecedência
}

export interface SalonAppointment {
  id: string;
  user_id: string;
  appointment_date: string;        // YYYY-MM-DD
  start_time: string;              // HH:mm
  end_time: string;                // HH:mm
  duration_minutes: number;
  professional_id?: string | null;
  status: string;
}

export interface OpeningHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

export interface BreakTime {
  enabled: boolean;
  start: string;  // HH:mm
  end: string;    // HH:mm
}

export interface TimeWindow {
  openMin: number;  // minutos desde meia-noite
  closeMin: number;
}

export interface AvailableSlotsOptions {
  userId: string;
  date: string;                  // YYYY-MM-DD
  professionalId?: string;       // filtra por profissional se fornecido
  serviceDurationMinutes: number;
  stepMinutes?: number;          // granularidade (padrão 5)
}

// ═══════════════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Converte "HH:mm" para minutos desde meia-noite
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converte minutos desde meia-noite para "HH:mm"
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Retorna a data/hora atual no fuso horário de Brasília
 */
export function getBrazilNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

/**
 * Retorna a data atual no formato YYYY-MM-DD (Brasília)
 */
export function getBrazilToday(): string {
  const d = getBrazilNow();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Calcula minutos desde meia-noite da data/hora atual (Brasília)
 */
export function getBrazilNowMinutes(): number {
  const now = getBrazilNow();
  return now.getHours() * 60 + now.getMinutes();
}

// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO DE ANTECEDÊNCIA MÍNIMA
// ═══════════════════════════════════════════════════════════════════════

/**
 * Retorna a antecedência mínima em MINUTOS.
 * Compatível com config antiga (min_notice_hours) e nova (min_notice_minutes).
 */
export function computeMinNoticeMinutes(config: SalonConfig): number {
  // Se tiver o novo campo, usa ele
  if (config.min_notice_minutes !== undefined && config.min_notice_minutes !== null) {
    return config.min_notice_minutes;
  }
  // Senão, converte de horas para minutos (legado)
  const hours = config.min_notice_hours ?? 2;
  return hours * 60;
}

// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO DE JANELA DE ATENDIMENTO (DIA)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calcula a janela de atendimento (abertura/fechamento) para uma data.
 * Retorna null se o dia estiver desabilitado.
 */
export function computeDayWindow(
  openingHours: Record<string, OpeningHoursDay> | undefined,
  date: string
): TimeWindow | null {
  const dateObj = new Date(date + 'T12:00:00');
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dateObj.getDay()];

  const dayHours = openingHours?.[dayName];
  if (!dayHours || !dayHours.enabled) {
    return null;
  }

  return {
    openMin: timeToMinutes(dayHours.open || '09:00'),
    closeMin: timeToMinutes(dayHours.close || '19:00'),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO DE INTERVALO DE ALMOÇO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extrai a configuração de almoço do opening_hours.
 * Formato esperado: opening_hours.__break = { enabled: true, start: "12:00", end: "13:00" }
 */
export function computeBreakWindow(
  openingHours: Record<string, OpeningHoursDay> | undefined
): { breakStartMin: number; breakEndMin: number } | null {
  const breakConfig = openingHours?.['__break'] as BreakTime | undefined;

  if (!breakConfig || !breakConfig.enabled) {
    return null;
  }

  const startMin = timeToMinutes(breakConfig.start || '12:00');
  const endMin = timeToMinutes(breakConfig.end || '13:00');

  return { breakStartMin: startMin, breakEndMin: endMin };
}

// ═══════════════════════════════════════════════════════════════════════
// BUSCAR AGENDAMENTOS EXISTENTES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Busca agendamentos não cancelados para uma data e usuário.
 * Opcionalmente filtra por profissional.
 */
export async function listAppointmentsForDate(
  userId: string,
  date: string,
  professionalId?: string
): Promise<SalonAppointment[]> {
  try {
    let query = supabase
      .from('appointments')
      .select('id, user_id, appointment_date, start_time, end_time, duration_minutes, professional_id, status')
      .eq('user_id', userId)
      .eq('appointment_date', date)
      .neq('status', 'cancelled');

    if (professionalId) {
      query = query.eq('professional_id', professionalId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as SalonAppointment[];
  } catch (err) {
    console.error('❌ [SalonAvailability] Erro ao buscar agendamentos:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════
// VERIFICAÇÃO DE OVERLAP
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verifica se dois intervalos de tempo se sobrepõem.
 * Overlap ocorre quando: startA < endB E endA > startB
 */
export function isOverlapping(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && endA > startB;
}

/**
 * Verifica se um agendamento específico conflita com agendamentos existentes.
 * Considera o buffer_before e buffer_after como "folga" ao redor do agendamento.
 */
export function hasConflictWithAppointments(
  startMin: number,
  endMin: number,
  appointments: SalonAppointment[],
  bufferMinutes: number
): boolean {
  for (const appt of appointments) {
    const apptStart = timeToMinutes(appt.start_time);
    const apptEnd = timeToMinutes(appt.end_time);

    // Verifica overlap considerando o buffer
    // O buffer é tratado como extensão do agendamento existente
    if (isOverlapping(startMin, endMin, apptStart - bufferMinutes, apptEnd + bufferMinutes)) {
      return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// VERIFICAÇÃO DE ALMOÇO
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verifica se um intervalo intersecta o horário de almoço.
 */
export function intersectsBreak(
  startMin: number,
  endMin: number,
  breakWindow: { breakStartMin: number; breakEndMin: number } | null
): boolean {
  if (!breakWindow) return false;
  return isOverlapping(startMin, endMin, breakWindow.breakStartMin, breakWindow.breakEndMin);
}

// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO DE SLOTS DISPONÍVEIS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Calcula horários disponíveis para agendamento.
 *
 * Algoritmo:
 * 1. Calcula janela de atendimento (open/close)
 * 2. Gera candidatos a cada stepMinutes (padrão 5)
 * 3. Filtra candidatos que:
 *    - Ultrapassam o horário de fechamento (considerando duração)
 *    - Violam antecedência mínima
 *    - Intersectam almoço
 *    - Conflitam com agendamentos do profissional
 */
export async function getAvailableStartTimes(options: AvailableSlotsOptions): Promise<string[]> {
  const {
    userId,
    date,
    professionalId,
    serviceDurationMinutes,
    stepMinutes = 5,
  } = options;

  // 1. Buscar configuração
  const { data: config } = await supabase
    .from('salon_config')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!config) {
    console.warn('⚠️ [SalonAvailability] Config não encontrada para userId:', userId);
    return [];
  }

  // 2. Calcular janela do dia
  const dayWindow = computeDayWindow(config.opening_hours, date);
  if (!dayWindow) {
    // Dia desabilitado
    return [];
  }

  // 3. Calcular janela de almoço
  const breakWindow = computeBreakWindow(config.opening_hours);

  // 4. Calcular limites de tempo
  const buffer = config.buffer_between || 0;
  const minNoticeMinutes = computeMinNoticeMinutes(config);
  const maxAdvanceDays = config.max_advance_days || 30;

  // Verificar max_advance_days
  const today = getBrazilToday();
  const todayDate = new Date(today);
  const targetDate = new Date(date);
  const diffDays = Math.floor((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > maxAdvanceDays) {
    return []; // Data muito futura
  }

  // Calcular horário mínimo permitido (antecedência)
  let minAllowedMinutes = 0; // Padrão: meia-noite (sem restrição)
  if (diffDays === 0) {
    // Hoje: aplicar antecedência mínima
    const nowMinutes = getBrazilNowMinutes();
    minAllowedMinutes = nowMinutes + minNoticeMinutes;
  }

  // 5. Buscar agendamentos existentes (do mesmo profissional, se especificado)
  const existingAppointments = await listAppointmentsForDate(userId, date, professionalId);

  // 6. Gerar candidatos
  const availableSlots: string[] = [];
  const openMin = dayWindow.openMin;
  const closeMin = dayWindow.closeMin;
  const googleBusyWindowsResult = await listSalonGoogleBusyWindows(
    userId,
    date,
    minutesToTime(openMin),
    minutesToTime(closeMin),
  );

  if (googleBusyWindowsResult.error) {
    console.warn("⚠️ [SalonAvailability] Google Calendar indisponível para filtro de slots:", googleBusyWindowsResult.error);
  }

  // Itera de stepMinutes em stepMinutes
  for (let start = openMin; start + serviceDurationMinutes <= closeMin; start += stepMinutes) {
    const end = start + serviceDurationMinutes;

    // Verifica antecedência mínima
    if (start < minAllowedMinutes) {
      continue;
    }

    // Verifica almoço
    if (intersectsBreak(start, end, breakWindow)) {
      continue;
    }

    // Verifica conflito com agendamentos existentes
    if (hasConflictWithAppointments(start, end, existingAppointments, buffer)) {
      continue;
    }

    // Slot disponível!
    availableSlots.push(minutesToTime(start));
  }

  return filterSlotsAgainstGoogleBusyWindows(
    date,
    availableSlots,
    serviceDurationMinutes,
    googleBusyWindowsResult.busyWindows,
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VALIDAÇÃO DE SLOT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Valida se um horário específico está disponível.
 * Retorna o slot validado e os slots alternativos.
 */
export async function validateSlot(
  userId: string,
  date: string,
  time: string,
  professionalId: string | undefined,
  serviceDurationMinutes: number
): Promise<{ valid: boolean; availableSlots: string[] }> {
  const slots = await getAvailableStartTimes({
    userId,
    date,
    professionalId,
    serviceDurationMinutes,
  });

  const valid = slots.includes(time);
  return { valid, availableSlots: slots };
}

// ═══════════════════════════════════════════════════════════════════════
// ENCONTRAR PROFISSIONAL DISPONÍVEL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Encontra um profissional disponível para um horário.
 * Útil quando o cliente não escolheu profissional específico.
 */
export async function findAvailableProfessional(
  userId: string,
  date: string,
  time: string,
  serviceDurationMinutes: number
): Promise<string | null> {
  // Buscar profissionais ativos
  const { data: professionals } = await supabase
    .from('scheduling_professionals')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!professionals || professionals.length === 0) {
    return null;
  }

  // Verificar disponibilidade para cada profissional
  for (const prof of professionals) {
    const { valid } = await validateSlot(userId, date, time, prof.id, serviceDurationMinutes);
    if (valid) {
      return prof.id;
    }
  }

  return null; // Nenhum profissional disponível
}

// ═══════════════════════════════════════════════════════════════════════
// SEGUNDA CHECAGEM ANTI-RACE (para usar antes do insert)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verificação final de overlap antes de inserir no banco.
 * Deve ser usada dentro da transação de criação de agendamento.
 */
export async function checkOverlapBeforeInsert(
  userId: string,
  date: string,
  startTime: string,
  endTime: string,
  professionalId: string | null,
  excludeAppointmentId?: string
): Promise<boolean> {
  try {
    let query = supabase
      .from('appointments')
      .select('id, start_time, end_time')
      .eq('user_id', userId)
      .eq('appointment_date', date)
      .neq('status', 'cancelled');

    if (professionalId) {
      query = query.eq('professional_id', professionalId);
    }

    if (excludeAppointmentId) {
      query = query.neq('id', excludeAppointmentId);
    }

    const { data: existing } = await query;

    if (!existing || existing.length === 0) {
      return false; // Sem conflito
    }

    const newStart = timeToMinutes(startTime);
    const newEnd = timeToMinutes(endTime);

    for (const appt of existing) {
      const apptStart = timeToMinutes(appt.start_time);
      const apptEnd = timeToMinutes(appt.end_time);

      if (isOverlapping(newStart, newEnd, apptStart, apptEnd)) {
        return true; // Conflito detectado!
      }
    }

    return false; // Sem conflito
  } catch (err) {
    console.error('❌ [SalonAvailability] Erro na checagem de overlap:', err);
    return false; // Em caso de erro, assume sem conflito (não bloqueia)
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER: encontrar slot mais próximo
// ═══════════════════════════════════════════════════════════════════════

export function findClosestSlot(targetTime: string, availableSlots: string[]): string | null {
  if (availableSlots.length === 0) return null;

  const targetMin = timeToMinutes(targetTime);
  let closest = availableSlots[0];
  let minDiff = Math.abs(timeToMinutes(availableSlots[0]) - targetMin);

  for (const slot of availableSlots) {
    const diff = Math.abs(timeToMinutes(slot) - targetMin);
    if (diff < minDiff) {
      minDiff = diff;
      closest = slot;
    }
  }

  return closest;
}
