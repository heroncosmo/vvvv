import { supabase } from "./supabaseAuth";
import {
  checkCalendarAvailability,
  isGoogleCalendarConnected,
  listCalendarBusyWindows,
  syncAppointmentToCalendar,
  type CalendarBusyWindow,
} from "./googleCalendarService";
import { parseCalendarDateTimeWithTimeZone } from "./calendarDateTime";

interface SchedulingCalendarConfigRow {
  google_calendar_enabled?: boolean | null;
  slot_duration?: number | null;
  service_name?: string | null;
}

export interface SalonGoogleCalendarState {
  enabled: boolean;
  connected: boolean;
  slotDuration: number;
  serviceName: string | null;
}

export interface SalonAppointmentCalendarPayload {
  id: string;
  clientName: string;
  clientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  serviceName?: string | null;
  notes?: string | null;
  googleEventId?: string | null;
}

function normalizeClockValue(time: string): string {
  const parts = String(time || "").split(":");
  const hour = (parts[0] || "00").padStart(2, "0");
  const minute = (parts[1] || "00").padStart(2, "0");
  const second = (parts[2] || "00").padStart(2, "0");
  return `${hour}:${minute}:${second}`;
}

function buildLocalDateTime(date: string, time: string): Date | null {
  const parsed = parseCalendarDateTimeWithTimeZone(`${date}T${normalizeClockValue(time)}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function slotConflictsWithGoogleBusyWindow(
  date: string,
  startTime: string,
  durationMinutes: number,
  busyWindow: CalendarBusyWindow,
): boolean {
  const slotStart = buildLocalDateTime(date, startTime);
  if (!slotStart) {
    return false;
  }

  const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
  const busyStart = new Date(busyWindow.startDateTime);
  const busyEnd = new Date(busyWindow.endDateTime);

  return slotStart.getTime() < busyEnd.getTime() && slotEnd.getTime() > busyStart.getTime();
}

export function filterSlotsAgainstGoogleBusyWindows(
  date: string,
  slots: string[],
  durationMinutes: number,
  busyWindows: CalendarBusyWindow[],
): string[] {
  if (busyWindows.length === 0 || slots.length === 0) {
    return slots;
  }

  return slots.filter((slot) => {
    for (const busyWindow of busyWindows) {
      if (slotConflictsWithGoogleBusyWindow(date, slot, durationMinutes, busyWindow)) {
        return false;
      }
    }

    return true;
  });
}

export async function getSalonGoogleCalendarState(userId: string): Promise<SalonGoogleCalendarState> {
  try {
    const { data, error } = await supabase
      .from("scheduling_config")
      .select("google_calendar_enabled, slot_duration, service_name")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("[SalonCalendarSync] Erro ao buscar scheduling_config:", error);
    }

    const config = (data || {}) as SchedulingCalendarConfigRow;
    const enabled = Boolean(config.google_calendar_enabled);
    const connected = enabled ? await isGoogleCalendarConnected(userId) : false;

    return {
      enabled,
      connected,
      slotDuration: Number(config.slot_duration) || 60,
      serviceName: config.service_name || null,
    };
  } catch (error) {
    console.error("[SalonCalendarSync] Erro ao obter estado do Google Calendar:", error);
    return {
      enabled: false,
      connected: false,
      slotDuration: 60,
      serviceName: null,
    };
  }
}

export async function listSalonGoogleBusyWindows(
  userId: string,
  date: string,
  dayStartTime: string,
  dayEndTime: string,
): Promise<{
  enabled: boolean;
  connected: boolean;
  checked: boolean;
  busyWindows: CalendarBusyWindow[];
  error?: string;
}> {
  const state = await getSalonGoogleCalendarState(userId);

  if (!state.enabled || !state.connected) {
    return {
      enabled: state.enabled,
      connected: state.connected,
      checked: false,
      busyWindows: [],
    };
  }

  const result = await listCalendarBusyWindows(
    userId,
    `${date}T${normalizeClockValue(dayStartTime)}`,
    `${date}T${normalizeClockValue(dayEndTime)}`,
  );

  if (!result.success) {
    return {
      enabled: state.enabled,
      connected: state.connected,
      checked: false,
      busyWindows: [],
      error: result.error || "Falha ao consultar Google Calendar",
    };
  }

  return {
    enabled: state.enabled,
    connected: state.connected,
    checked: true,
    busyWindows: result.windows || [],
  };
}

export async function checkSalonGoogleCalendarAvailability(
  userId: string,
  date: string,
  startTime: string,
  endTime: string,
  options?: {
    excludeEventId?: string;
  },
): Promise<{
  enabled: boolean;
  connected: boolean;
  enforced: boolean;
  available: boolean;
  checked: boolean;
  conflictEvent?: string;
  conflictEventId?: string;
  error?: string;
}> {
  const state = await getSalonGoogleCalendarState(userId);

  if (!state.enabled || !state.connected) {
    return {
      enabled: state.enabled,
      connected: state.connected,
      enforced: false,
      available: true,
      checked: false,
    };
  }

  const availability = await checkCalendarAvailability(
    userId,
    `${date}T${normalizeClockValue(startTime)}`,
    `${date}T${normalizeClockValue(endTime)}`,
    {
      excludeEventId: options?.excludeEventId,
      failOpen: false,
    },
  );

  return {
    enabled: state.enabled,
    connected: state.connected,
    enforced: true,
    available: availability.available,
    checked: availability.checked,
    conflictEvent: availability.conflictEvent,
    conflictEventId: availability.conflictEventId,
    error: availability.error,
  };
}

export async function syncSalonAppointmentWithCalendar(
  userId: string,
  appointment: SalonAppointmentCalendarPayload,
  durationMinutes: number,
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const state = await getSalonGoogleCalendarState(userId);

  if (!state.enabled || !state.connected) {
    return { success: true };
  }

  return syncAppointmentToCalendar(
    userId,
    {
      id: appointment.id,
      clientName: appointment.clientName,
      clientPhone: appointment.clientPhone,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      serviceName: appointment.serviceName || state.serviceName || undefined,
      notes: appointment.notes || undefined,
      googleEventId: appointment.googleEventId || undefined,
    },
    durationMinutes || state.slotDuration || 60,
  );
}
