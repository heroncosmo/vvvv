import { createHash } from "crypto";
import { supabase } from "./supabaseAuth";
import {
  isGoogleCalendarConnected,
  listCalendarBusyWindows,
  syncAppointmentToCalendar,
  type CalendarBusyWindow,
} from "./providerGoogleCalendarService";
import { parseCalendarDateTimeWithTimeZone } from "./calendarDateTime";

interface ProviderCalendarConfigRow {
  google_calendar_enabled?: boolean | null;
  google_calendar_id?: string | null;
  slot_duration?: number | null;
  service_name?: string | null;
}

export interface ProviderGoogleCalendarState {
  enabled: boolean;
  connected: boolean;
  slotDuration: number;
  serviceName: string | null;
}

export interface ProviderAppointmentCalendarPayload {
  id: string;
  clientName: string;
  clientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  serviceName?: string | null;
  notes?: string | null;
  googleEventId?: string | null;
  location?: string | null;
  extraDetails?: string[];
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

function buildProviderCalendarDateTimeRange(date: string, startTime: string, endTime: string): {
  startDateTime: string;
  endDateTime: string;
} {
  return {
    startDateTime: `${date}T${normalizeClockValue(startTime)}`,
    endDateTime: `${date}T${normalizeClockValue(endTime)}`,
  };
}

function buildProviderCalendarFullDayRange(date: string): {
  startDateTime: string;
  endDateTime: string;
} {
  return {
    startDateTime: `${date}T00:00:00`,
    endDateTime: `${date}T23:59:59`,
  };
}

function buildProviderCalendarMirrorKey(
  userId: string,
  calendarId: string,
  busyWindow: CalendarBusyWindow,
): string {
  const seed = [
    userId,
    calendarId,
    busyWindow.eventId || "",
    busyWindow.startDateTime,
    busyWindow.endDateTime,
    busyWindow.summary || "",
  ].join("|");

  return createHash("sha1").update(seed).digest("hex");
}

async function getSelectedProviderCalendarId(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("provider_config")
      .select("google_calendar_id")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("[ProviderCalendarSync] Erro ao buscar agenda selecionada:", error);
    }

    return typeof data?.google_calendar_id === "string" && data.google_calendar_id.trim()
      ? data.google_calendar_id.trim()
      : "primary";
  } catch (error) {
    console.error("[ProviderCalendarSync] Erro ao resolver agenda selecionada:", error);
    return "primary";
  }
}

async function replaceProviderCalendarBusyWindowMirror(params: {
  userId: string;
  calendarId: string;
  startDateTime: string;
  endDateTime: string;
  busyWindows: CalendarBusyWindow[];
}): Promise<void> {
  const { userId, calendarId, startDateTime, endDateTime, busyWindows } = params;

  const { error: deleteError } = await supabase
    .from("provider_calendar_busy_windows")
    .delete()
    .eq("user_id", userId)
    .eq("calendar_id", calendarId)
    .lt("start_time", endDateTime)
    .gt("end_time", startDateTime);

  if (deleteError) {
    throw new Error(deleteError.message || "Falha ao limpar espelho local da agenda.");
  }

  if (busyWindows.length === 0) {
    return;
  }

  const syncedAt = new Date().toISOString();
  const rows = busyWindows.map((busyWindow) => ({
    mirror_key: buildProviderCalendarMirrorKey(userId, calendarId, busyWindow),
    user_id: userId,
    calendar_id: calendarId,
    external_event_id: busyWindow.eventId || null,
    summary: busyWindow.summary || null,
    start_time: busyWindow.startDateTime,
    end_time: busyWindow.endDateTime,
    source: "maton",
    synced_at: syncedAt,
    updated_at: syncedAt,
  }));

  const { error: insertError } = await supabase
    .from("provider_calendar_busy_windows")
    .upsert(rows, {
      onConflict: "mirror_key",
    });

  if (insertError) {
    throw new Error(insertError.message || "Falha ao atualizar espelho local da agenda.");
  }
}

async function listProviderMirroredBusyWindows(params: {
  userId: string;
  calendarId?: string;
  startDateTime: string;
  endDateTime: string;
  excludeEventId?: string;
}): Promise<CalendarBusyWindow[]> {
  const { userId, calendarId, startDateTime, endDateTime, excludeEventId } = params;
  let query = supabase
    .from("provider_calendar_busy_windows")
    .select("external_event_id, summary, start_time, end_time")
    .eq("user_id", userId)
    .lt("start_time", endDateTime)
    .gt("end_time", startDateTime)
    .order("start_time", { ascending: true });

  if (calendarId) {
    query = query.eq("calendar_id", calendarId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || "Falha ao consultar espelho local da agenda.");
  }

  return (data || [])
    .map((row) => ({
      eventId: row.external_event_id || undefined,
      summary: row.summary || "Evento sem título",
      startDateTime: row.start_time,
      endDateTime: row.end_time,
    }))
    .filter((busyWindow) => busyWindow.eventId !== excludeEventId);
}

async function syncProviderCalendarMirror(params: {
  userId: string;
  startDateTime: string;
  endDateTime: string;
  excludeEventId?: string;
}): Promise<{
  enabled: boolean;
  connected: boolean;
  checked: boolean;
  busyWindows: CalendarBusyWindow[];
  error?: string;
}> {
  const { userId, startDateTime, endDateTime, excludeEventId } = params;
  const state = await getProviderGoogleCalendarState(userId);

  if (!state.enabled || !state.connected) {
    return {
      enabled: state.enabled,
      connected: state.connected,
      checked: false,
      busyWindows: [],
    };
  }

  const calendarId = await getSelectedProviderCalendarId(userId);
  const remoteResult = await listCalendarBusyWindows(
    userId,
    startDateTime,
    endDateTime,
    { excludeEventId },
  );

  if (!remoteResult.success) {
    return {
      enabled: state.enabled,
      connected: state.connected,
      checked: false,
      busyWindows: [],
      error: remoteResult.error || "Falha ao sincronizar a agenda do Maton.",
    };
  }

  try {
    await replaceProviderCalendarBusyWindowMirror({
      userId,
      calendarId,
      startDateTime,
      endDateTime,
      busyWindows: remoteResult.windows || [],
    });

    const mirroredBusyWindows = await listProviderMirroredBusyWindows({
      userId,
      calendarId,
      startDateTime,
      endDateTime,
      excludeEventId,
    });

    return {
      enabled: state.enabled,
      connected: state.connected,
      checked: true,
      busyWindows: mirroredBusyWindows,
    };
  } catch (error) {
    return {
      enabled: state.enabled,
      connected: state.connected,
      checked: false,
      busyWindows: [],
      error: error instanceof Error ? error.message : "Falha ao atualizar o espelho local da agenda.",
    };
  }
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

export async function getProviderGoogleCalendarState(userId: string): Promise<ProviderGoogleCalendarState> {
  try {
    const { data, error } = await supabase
      .from("provider_config")
      .select("google_calendar_enabled, google_calendar_id, slot_duration, service_name")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("[ProviderCalendarSync] Erro ao buscar provider_config:", error);
    }

    const config = (data || {}) as ProviderCalendarConfigRow;
    const enabled = Boolean(config.google_calendar_enabled);
    const connected = enabled ? await isGoogleCalendarConnected(userId) : false;

    return {
      enabled,
      connected,
      slotDuration: Number(config.slot_duration) || 60,
      serviceName: config.service_name || null,
    };
  } catch (error) {
    console.error("[ProviderCalendarSync] Erro ao obter estado do Google Calendar:", error);
    return {
      enabled: false,
      connected: false,
      slotDuration: 60,
      serviceName: null,
    };
  }
}

export async function listProviderGoogleBusyWindows(
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
  const range = buildProviderCalendarDateTimeRange(date, dayStartTime, dayEndTime);
  return syncProviderCalendarMirror({
    userId,
    startDateTime: range.startDateTime,
    endDateTime: range.endDateTime,
  });
}

export async function syncProviderCalendarMirrorRange(params: {
  userId: string;
  startDateTime: string;
  endDateTime: string;
  excludeEventId?: string;
}): Promise<{
  enabled: boolean;
  connected: boolean;
  checked: boolean;
  busyWindows: CalendarBusyWindow[];
  error?: string;
}> {
  return syncProviderCalendarMirror(params);
}

export async function listProviderMirroredBusyWindowsRange(params: {
  userId: string;
  startDateTime: string;
  endDateTime: string;
  excludeEventId?: string;
}): Promise<CalendarBusyWindow[]> {
  const calendarId = await getSelectedProviderCalendarId(params.userId);
  return listProviderMirroredBusyWindows({
    userId: params.userId,
    calendarId,
    startDateTime: params.startDateTime,
    endDateTime: params.endDateTime,
    excludeEventId: params.excludeEventId,
  });
}

export async function checkProviderGoogleCalendarAvailability(
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
  const dayRange = buildProviderCalendarFullDayRange(date);
  const slotRange = buildProviderCalendarDateTimeRange(date, startTime, endTime);
  const syncResult = await syncProviderCalendarMirror({
    userId,
    startDateTime: dayRange.startDateTime,
    endDateTime: dayRange.endDateTime,
    excludeEventId: options?.excludeEventId,
  });

  if (!syncResult.enabled || !syncResult.connected) {
    return {
      enabled: syncResult.enabled,
      connected: syncResult.connected,
      enforced: false,
      available: true,
      checked: false,
    };
  }

  if (!syncResult.checked) {
    return {
      enabled: syncResult.enabled,
      connected: syncResult.connected,
      enforced: true,
      available: false,
      checked: false,
      error: syncResult.error || "Falha ao atualizar o espelho local da agenda.",
    };
  }

  try {
    const calendarId = await getSelectedProviderCalendarId(userId);
    const slotBusyWindows = await listProviderMirroredBusyWindows({
      userId,
      calendarId,
      startDateTime: slotRange.startDateTime,
      endDateTime: slotRange.endDateTime,
      excludeEventId: options?.excludeEventId,
    });

    if (slotBusyWindows.length > 0) {
      const conflict = slotBusyWindows[0];
      return {
        enabled: syncResult.enabled,
        connected: syncResult.connected,
        enforced: true,
        available: false,
        checked: true,
        conflictEvent: conflict.summary,
        conflictEventId: conflict.eventId,
      };
    }
  } catch (error) {
    return {
      enabled: syncResult.enabled,
      connected: syncResult.connected,
      enforced: true,
      available: false,
      checked: false,
      error: error instanceof Error ? error.message : "Falha ao consultar o espelho local da agenda.",
    };
  }

  return {
    enabled: syncResult.enabled,
    connected: syncResult.connected,
    enforced: true,
    available: true,
    checked: true,
  };
}

export async function syncProviderAppointmentWithCalendar(
  userId: string,
  appointment: ProviderAppointmentCalendarPayload,
  durationMinutes: number,
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  const state = await getProviderGoogleCalendarState(userId);

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
      location: appointment.location || undefined,
      extraDetails: appointment.extraDetails,
    },
    durationMinutes || state.slotDuration || 60,
  );
}
