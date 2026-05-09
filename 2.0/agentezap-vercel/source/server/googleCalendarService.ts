/**
 * Calendar integration service backed by Maton API Gateway.
 *
 * Mantém a interface histórica de "Google Calendar" porque o restante do
 * sistema já depende desses nomes, mas a autenticação e o roteamento agora
 * usam a chave por cliente do Maton.
 */

import { supabase } from "./supabaseAuth";
import {
  DEFAULT_CALENDAR_TIMEZONE,
  addMinutesToCalendarDateTime,
  buildCalendarDateTime,
  normalizeCalendarTime,
  parseCalendarDateTimeWithTimeZone,
  rangesOverlap,
} from "./calendarDateTime";

const DEFAULT_TIMEZONE = DEFAULT_CALENDAR_TIMEZONE;
const MATON_TOKEN_TYPE = "maton_api_key";

interface GoogleTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
}

interface CalendarEventData {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  attendeeEmail?: string;
  colorId?: string;
}

interface CalendarBusyWindow {
  eventId?: string;
  summary: string;
  startDateTime: string;
  endDateTime: string;
}

interface GoogleOAuthClientValidation {
  ok: boolean;
  code?: string;
  message?: string;
}

interface MatonCalendarEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  timeZone?: string;
  selected?: boolean;
}

interface MatonCalendarEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface MatonCalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  transparency?: string;
  htmlLink?: string;
  start?: MatonCalendarEventDateTime | null;
  end?: MatonCalendarEventDateTime | null;
}

interface StoredMatonMetadata {
  provider: "maton";
  email?: string;
  primaryCalendarId?: string;
  validatedAt?: string;
}

interface StoredMatonConnection {
  apiKey: string;
  metadata: StoredMatonMetadata;
}

interface GoogleCalendarStatus {
  connected: boolean;
  configured: boolean;
  provider: "maton";
  providerLabel: string;
  email?: string;
  selectedCalendarId?: string;
  calendars?: MatonCalendarEntry[];
  checked?: boolean;
  error?: string;
}

function getMatonGatewayBaseUrl(): string {
  const raw = (process.env.MATON_GATEWAY_BASE_URL || "https://gateway.maton.ai").trim();
  let normalized = raw;
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function readEventDateTime(eventDateTime?: MatonCalendarEventDateTime | null): Date | null {
  if (!eventDateTime) {
    return null;
  }

  if (eventDateTime.dateTime) {
    return parseCalendarDateTimeWithTimeZone(eventDateTime.dateTime, eventDateTime.timeZone || DEFAULT_TIMEZONE);
  }

  if (eventDateTime.date) {
    return parseCalendarDateTimeWithTimeZone(
      `${eventDateTime.date}T00:00:00`,
      eventDateTime.timeZone || DEFAULT_TIMEZONE,
    );
  }

  return null;
}

function isBusyEvent(event: MatonCalendarEvent): boolean {
  return event.status !== "cancelled" && event.transparency !== "transparent";
}

function parseStoredMetadata(rawScope?: string | null): StoredMatonMetadata {
  if (!rawScope) {
    return { provider: "maton" };
  }

  try {
    const parsed = JSON.parse(rawScope);
    if (parsed && typeof parsed === "object") {
      return {
        provider: "maton",
        email: typeof parsed.email === "string" ? parsed.email : undefined,
        primaryCalendarId: typeof parsed.primaryCalendarId === "string" ? parsed.primaryCalendarId : undefined,
        validatedAt: typeof parsed.validatedAt === "string" ? parsed.validatedAt : undefined,
      };
    }
  } catch {
    return { provider: "maton" };
  }

  return { provider: "maton" };
}

function inferEmailFromCalendars(calendars: MatonCalendarEntry[]): string | undefined {
  const primaryCalendar = calendars.find((calendar) => calendar.primary) || calendars[0];
  if (!primaryCalendar) {
    return undefined;
  }

  if (primaryCalendar.id.includes("@")) {
    return primaryCalendar.id;
  }

  if (primaryCalendar.summary.includes("@")) {
    return primaryCalendar.summary;
  }

  return undefined;
}

function inferPrimaryCalendarId(calendars: MatonCalendarEntry[]): string {
  return calendars.find((calendar) => calendar.primary)?.id || calendars[0]?.id || "primary";
}

function canWriteCalendar(calendar: MatonCalendarEntry): boolean {
  return calendar.accessRole === "owner" || calendar.accessRole === "writer";
}

function pickDefaultWritableCalendarId(calendars: MatonCalendarEntry[]): string {
  return calendars.find((calendar) => calendar.primary && canWriteCalendar(calendar))?.id
    || calendars.find((calendar) => canWriteCalendar(calendar))?.id
    || inferPrimaryCalendarId(calendars);
}

function buildStoredMetadata(calendars: MatonCalendarEntry[]): StoredMatonMetadata {
  return {
    provider: "maton",
    email: inferEmailFromCalendars(calendars),
    primaryCalendarId: inferPrimaryCalendarId(calendars),
    validatedAt: new Date().toISOString(),
  };
}

function parseErrorPayload(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.error === "string") {
        return parsed.error;
      }
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
      if (parsed.error && typeof parsed.error.message === "string") {
        return parsed.error.message;
      }
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

async function matonRequest<T>(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${apiKey}`);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getMatonGatewayBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    const parsedMessage = parseErrorPayload(body);
    const errorMessage = parsedMessage || response.statusText || "Falha na integração com o Maton.";
    throw new Error(`Maton ${response.status}: ${errorMessage}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function listMatonCalendarsWithApiKey(apiKey: string): Promise<MatonCalendarEntry[]> {
  const payload = await matonRequest<{ items?: Array<Record<string, unknown>> }>(
    apiKey,
    "/google-calendar/calendar/v3/users/me/calendarList",
  );

  return (payload.items || [])
    .map((calendar): MatonCalendarEntry | null => {
      const id = typeof calendar.id === "string" ? calendar.id : "";
      const summary = typeof calendar.summary === "string" ? calendar.summary : "";

      if (!id || !summary) {
        return null;
      }

      return {
        id,
        summary,
        primary: calendar.primary === true,
        accessRole: typeof calendar.accessRole === "string" ? calendar.accessRole : undefined,
        timeZone: typeof calendar.timeZone === "string" ? calendar.timeZone : undefined,
        selected: calendar.selected === true,
      };
    })
    .filter((calendar): calendar is MatonCalendarEntry => Boolean(calendar));
}

async function getStoredMatonConnection(userId: string): Promise<StoredMatonConnection | null> {
  const { data, error } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const row = Array.isArray(data) ? data[0] : null;

  if (error || !row || !row.access_token) {
    return null;
  }

  if (row.token_type && row.token_type !== MATON_TOKEN_TYPE) {
    return null;
  }

  return {
    apiKey: row.access_token,
    metadata: parseStoredMetadata(row.scope),
  };
}

async function storeMatonConnection(
  userId: string,
  apiKey: string,
  metadata: StoredMatonMetadata,
): Promise<void> {
  const payload = {
    access_token: apiKey,
    refresh_token: null,
    token_type: MATON_TOKEN_TYPE,
    expiry_date: null,
    scope: JSON.stringify(metadata),
    updated_at: new Date().toISOString(),
  };

  const { data: existingRows, error: existingError } = await supabase
    .from("google_calendar_tokens")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existingError) {
    throw new Error("Não foi possível consultar a chave atual do Maton.");
  }

  if (existingRows && existingRows.length > 0) {
    const { error } = await supabase
      .from("google_calendar_tokens")
      .update(payload)
      .eq("user_id", userId);

    if (error) {
      throw new Error("Não foi possível salvar a chave do Maton.");
    }
    return;
  }

  const { error } = await supabase
    .from("google_calendar_tokens")
    .insert({
      user_id: userId,
      ...payload,
    });

  if (error) {
    throw new Error("Não foi possível salvar a chave do Maton.");
  }
}

async function getSelectedCalendarIdFromConfig(userId: string): Promise<string | undefined> {
  const { data } = await supabase
    .from("scheduling_config")
    .select("google_calendar_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const row = Array.isArray(data) ? data[0] : null;

  return typeof row?.google_calendar_id === "string" && row.google_calendar_id
    ? row.google_calendar_id
    : undefined;
}

async function upsertSchedulingCalendarConfig(
  userId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data: existingRows, error: existingError } = await supabase
    .from("scheduling_config")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existingError) {
    throw new Error("Não foi possível consultar a configuração da agenda.");
  }

  if (existingRows && existingRows.length > 0) {
    const { error } = await supabase
      .from("scheduling_config")
      .update(payload)
      .eq("user_id", userId);

    if (error) {
      throw new Error("Não foi possível atualizar a configuração da agenda.");
    }
    return;
  }

  const { error } = await supabase
    .from("scheduling_config")
    .insert({
      user_id: userId,
      ...payload,
    });

  if (error) {
    throw new Error("Não foi possível atualizar a configuração da agenda.");
  }
}

async function resolveCalendarId(
  userId: string,
  providedCalendarId?: string,
  connection?: StoredMatonConnection | null,
): Promise<string> {
  if (providedCalendarId) {
    return providedCalendarId;
  }

  const configuredCalendarId = await getSelectedCalendarIdFromConfig(userId);
  if (configuredCalendarId) {
    return configuredCalendarId;
  }

  return connection?.metadata.primaryCalendarId || "primary";
}

async function listCalendarEventsWithApiKey(
  apiKey: string,
  calendarId: string,
  startDate: Date,
  endDate: Date,
): Promise<MatonCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: startDate.toISOString(),
    timeMax: endDate.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const payload = await matonRequest<{ items?: MatonCalendarEvent[] }>(
    apiKey,
    `/google-calendar/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  );

  return payload.items || [];
}

async function getValidatedMatonContext(userId: string): Promise<{
  connection: StoredMatonConnection;
  calendars: MatonCalendarEntry[];
  selectedCalendarId: string;
}> {
  const connection = await getStoredMatonConnection(userId);
  if (!connection) {
    throw new Error("Maton não conectado. Adicione sua chave da API primeiro.");
  }

  const calendars = await listMatonCalendarsWithApiKey(connection.apiKey);
  if (!calendars.length) {
    throw new Error("A chave Maton não retornou nenhuma agenda Google disponível.");
  }

  const requestedCalendarId = await getSelectedCalendarIdFromConfig(userId);
  const selectedCalendarId = calendars.some((calendar) => calendar.id === requestedCalendarId)
    ? (requestedCalendarId as string)
    : inferPrimaryCalendarId(calendars);

  return {
    connection,
    calendars,
    selectedCalendarId,
  };
}

export function isGoogleCalendarConfigured(): boolean {
  return true;
}

export function getGoogleAuthUrl(): string {
  throw new Error("A integração direta via OAuth do Google foi removida. Use a chave da API do Maton.");
}

export async function validateGoogleOAuthClient(): Promise<GoogleOAuthClientValidation> {
  return {
    ok: false,
    code: "maton_required",
    message: "A integração direta com Google foi removida. Use sua chave da API do Maton.",
  };
}

export async function handleGoogleCallback(): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error: "A integração direta com Google foi removida. Use sua chave da API do Maton.",
  };
}

export async function connectMatonCalendar(
  userId: string,
  apiKey: string,
  selectedCalendarId?: string,
): Promise<GoogleCalendarStatus> {
  const normalizedApiKey = String(apiKey || "").trim();
  if (!normalizedApiKey) {
    throw new Error("Informe a chave da API do Maton.");
  }

  const calendars = await listMatonCalendarsWithApiKey(normalizedApiKey);
  if (!calendars.length) {
    throw new Error("A chave do Maton não retornou nenhuma agenda conectada.");
  }

  const calendarId = selectedCalendarId && calendars.some((calendar) => calendar.id === selectedCalendarId && canWriteCalendar(calendar))
    ? selectedCalendarId
    : pickDefaultWritableCalendarId(calendars);

  if (!canWriteCalendar(calendars.find((calendar) => calendar.id === calendarId) || { id: "", summary: "" })) {
    throw new Error("A chave do Maton não possui nenhuma agenda Google com permissão de escrita.");
  }

  const metadata = buildStoredMetadata(calendars);
  await storeMatonConnection(userId, normalizedApiKey, metadata);
  await upsertSchedulingCalendarConfig(userId, {
    google_calendar_enabled: true,
    google_calendar_id: calendarId,
  });

  return {
    connected: true,
    configured: true,
    provider: "maton",
    providerLabel: "Maton",
    email: metadata.email,
    selectedCalendarId: calendarId,
    calendars,
    checked: true,
  };
}

export async function updateSelectedCalendar(userId: string, calendarId: string): Promise<GoogleCalendarStatus> {
  const desiredCalendarId = String(calendarId || "").trim();
  if (!desiredCalendarId) {
    throw new Error("Selecione uma agenda válida.");
  }

  const { connection, calendars } = await getValidatedMatonContext(userId);
  if (!calendars.some((calendar) => calendar.id === desiredCalendarId && canWriteCalendar(calendar))) {
    throw new Error("A agenda escolhida não está disponível na chave Maton informada.");
  }

  await upsertSchedulingCalendarConfig(userId, {
    google_calendar_id: desiredCalendarId,
  });

  return {
    connected: true,
    configured: true,
    provider: "maton",
    providerLabel: "Maton",
    email: connection.metadata.email || inferEmailFromCalendars(calendars),
    selectedCalendarId: desiredCalendarId,
    calendars,
    checked: true,
  };
}

export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const connection = await getStoredMatonConnection(userId);
  return Boolean(connection?.apiKey);
}

export async function getGoogleCalendarStatus(userId: string): Promise<GoogleCalendarStatus> {
  const connection = await getStoredMatonConnection(userId);
  if (!connection) {
    return {
      connected: false,
      configured: true,
      provider: "maton",
      providerLabel: "Maton",
      checked: true,
      calendars: [],
    };
  }

  try {
    const calendars = await listMatonCalendarsWithApiKey(connection.apiKey);
    const selectedCalendarId = await resolveCalendarId(userId, undefined, connection);
    const activeCalendarId = calendars.some((calendar) => calendar.id === selectedCalendarId)
      ? selectedCalendarId
      : inferPrimaryCalendarId(calendars);

    return {
      connected: true,
      configured: true,
      provider: "maton",
      providerLabel: "Maton",
      email: connection.metadata.email || inferEmailFromCalendars(calendars),
      selectedCalendarId: activeCalendarId,
      calendars,
      checked: true,
    };
  } catch (error) {
    console.error("[MatonCalendar] Erro ao carregar status:", error);
    return {
      connected: true,
      configured: true,
      provider: "maton",
      providerLabel: "Maton",
      email: connection.metadata.email,
      selectedCalendarId: connection.metadata.primaryCalendarId,
      checked: false,
      error: error instanceof Error ? error.message : "Falha ao validar a conexão com o Maton.",
    };
  }
}

export async function disconnectGoogleCalendar(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("google_calendar_tokens")
      .delete()
      .eq("user_id", userId);

    if (error) {
      return { success: false, error: "Erro ao remover a chave do Maton." };
    }

    await upsertSchedulingCalendarConfig(userId, {
      google_calendar_enabled: false,
      google_calendar_id: null,
    });

    return { success: true };
  } catch (error) {
    console.error("[MatonCalendar] Erro ao desconectar:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao desconectar a agenda do Maton.",
    };
  }
}

export async function createCalendarEvent(
  userId: string,
  eventData: CalendarEventData,
): Promise<{
  success: boolean;
  eventId?: string;
  htmlLink?: string;
  error?: string;
}> {
  try {
    const { connection, selectedCalendarId } = await getValidatedMatonContext(userId);
    const payload = await matonRequest<MatonCalendarEvent>(
      connection.apiKey,
      `/google-calendar/calendar/v3/calendars/${encodeURIComponent(selectedCalendarId)}/events`,
      {
        method: "POST",
        body: JSON.stringify({
          summary: eventData.summary,
          description: eventData.description,
          location: eventData.location,
          start: {
            dateTime: eventData.startDateTime,
            timeZone: DEFAULT_TIMEZONE,
          },
          end: {
            dateTime: eventData.endDateTime,
            timeZone: DEFAULT_TIMEZONE,
          },
          attendees: eventData.attendeeEmail ? [{ email: eventData.attendeeEmail }] : undefined,
          colorId: eventData.colorId,
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 30 },
              { method: "email", minutes: 60 },
            ],
          },
        }),
      },
    );

    return {
      success: true,
      eventId: payload.id,
      htmlLink: payload.htmlLink,
    };
  } catch (error) {
    console.error("[MatonCalendar] Erro ao criar evento:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao criar evento na agenda.",
    };
  }
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  eventData: Partial<CalendarEventData>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { connection, selectedCalendarId } = await getValidatedMatonContext(userId);
    const currentEvent = await matonRequest<MatonCalendarEvent>(
      connection.apiKey,
      `/google-calendar/calendar/v3/calendars/${encodeURIComponent(selectedCalendarId)}/events/${encodeURIComponent(eventId)}`,
    );

    await matonRequest(
      connection.apiKey,
      `/google-calendar/calendar/v3/calendars/${encodeURIComponent(selectedCalendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          ...currentEvent,
          summary: eventData.summary || currentEvent.summary,
          description: eventData.description ?? currentEvent.description,
          location: eventData.location ?? currentEvent.location,
          start: eventData.startDateTime
            ? {
                dateTime: eventData.startDateTime,
                timeZone: DEFAULT_TIMEZONE,
              }
            : currentEvent.start,
          end: eventData.endDateTime
            ? {
                dateTime: eventData.endDateTime,
                timeZone: DEFAULT_TIMEZONE,
              }
            : currentEvent.end,
        }),
      },
    );

    return { success: true };
  } catch (error) {
    console.error("[MatonCalendar] Erro ao atualizar evento:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao atualizar evento na agenda.",
    };
  }
}

export async function deleteCalendarEvent(
  userId: string,
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { connection, selectedCalendarId } = await getValidatedMatonContext(userId);
    await matonRequest(
      connection.apiKey,
      `/google-calendar/calendar/v3/calendars/${encodeURIComponent(selectedCalendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
      },
    );

    return { success: true };
  } catch (error) {
    console.error("[MatonCalendar] Erro ao deletar evento:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao remover evento da agenda.",
    };
  }
}

export async function listCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  success: boolean;
  events?: MatonCalendarEvent[];
  error?: string;
}> {
  try {
    const { connection, selectedCalendarId } = await getValidatedMatonContext(userId);
    const events = await listCalendarEventsWithApiKey(connection.apiKey, selectedCalendarId, startDate, endDate);

    return {
      success: true,
      events,
    };
  } catch (error) {
    console.error("[MatonCalendar] Erro ao listar eventos:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao listar eventos da agenda.",
    };
  }
}

export async function listCalendarBusyWindows(
  userId: string,
  startDateTime: string,
  endDateTime: string,
  options?: {
    excludeEventId?: string;
  },
): Promise<{
  success: boolean;
  windows?: CalendarBusyWindow[];
  error?: string;
}> {
  try {
    const start = parseCalendarDateTimeWithTimeZone(startDateTime);
    const end = parseCalendarDateTimeWithTimeZone(endDateTime);
    const { success, events, error } = await listCalendarEvents(userId, start, end);

    if (!success || error) {
      return { success: false, error: error || "Falha ao consultar agenda via Maton." };
    }

    const windows = (events || [])
      .filter(isBusyEvent)
      .filter((event) => event.id !== options?.excludeEventId)
      .map((event) => {
        const eventStart = readEventDateTime(event.start);
        const eventEnd = readEventDateTime(event.end);

        if (!eventStart || !eventEnd || !rangesOverlap(start, end, eventStart, eventEnd)) {
          return null;
        }

        return {
          eventId: event.id,
          summary: event.summary || "Evento sem título",
          startDateTime: eventStart.toISOString(),
          endDateTime: eventEnd.toISOString(),
        } satisfies CalendarBusyWindow;
      })
      .filter((window): window is CalendarBusyWindow => Boolean(window));

    return { success: true, windows };
  } catch (error) {
    console.error("[MatonCalendar] Erro ao listar janelas ocupadas:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao consultar agenda via Maton.",
    };
  }
}

export async function checkCalendarAvailability(
  userId: string,
  startDateTime: string,
  endDateTime: string,
  options?: {
    excludeEventId?: string;
    failOpen?: boolean;
  },
): Promise<{ available: boolean; checked: boolean; conflictEvent?: string; conflictEventId?: string; error?: string }> {
  try {
    const { success, windows, error } = await listCalendarBusyWindows(userId, startDateTime, endDateTime, {
      excludeEventId: options?.excludeEventId,
    });

    if (!success || error) {
      const availableOnError = options?.failOpen !== false;
      return {
        available: availableOnError,
        checked: false,
        error: error || "Falha ao consultar a agenda via Maton.",
      };
    }

    if (windows && windows.length > 0) {
      const conflict = windows[0];
      return {
        available: false,
        checked: true,
        conflictEvent: conflict.summary,
        conflictEventId: conflict.eventId,
      };
    }

    return { available: true, checked: true };
  } catch (error) {
    console.error("[MatonCalendar] Erro ao verificar disponibilidade:", error);
    const availableOnError = options?.failOpen !== false;
    return {
      available: availableOnError,
      checked: false,
      error: error instanceof Error ? error.message : "Falha ao consultar a agenda via Maton.",
    };
  }
}

export async function syncAppointmentToCalendar(
  userId: string,
  appointment: {
    id: string;
    clientName: string;
    clientPhone: string;
    appointmentDate: string;
    appointmentTime: string;
    serviceName?: string;
    notes?: string;
    googleEventId?: string;
    location?: string;
    extraDetails?: string[];
  },
  serviceDurationMinutes = 60,
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const startDateTime = buildCalendarDateTime(appointment.appointmentDate, appointment.appointmentTime);
    const endDateTime = addMinutesToCalendarDateTime(
      appointment.appointmentDate,
      appointment.appointmentTime,
      serviceDurationMinutes,
    );

    const eventData: CalendarEventData = {
      summary: `Agendamento - ${appointment.clientName}`,
      description: [
        `Cliente: ${appointment.clientName}`,
        `Telefone: ${appointment.clientPhone}`,
        appointment.serviceName ? `Serviço: ${appointment.serviceName}` : "",
        appointment.location ? `Endereço: ${appointment.location}` : "",
        appointment.notes ? `Notas: ${appointment.notes}` : "",
        ...(appointment.extraDetails || []),
        "--- Agendado via AgentZap ---",
        `ID interno: ${appointment.id}`,
      ]
        .filter(Boolean)
        .join("\n"),
      startDateTime,
      endDateTime,
      location: appointment.location,
      colorId: "2",
    };

    if (appointment.googleEventId) {
      const result = await updateCalendarEvent(userId, appointment.googleEventId, eventData);
      return {
        success: result.success,
        eventId: appointment.googleEventId,
        error: result.error,
      };
    }

    return createCalendarEvent(userId, eventData);
  } catch (error) {
    console.error("[MatonCalendar] Erro ao sincronizar agendamento:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao sincronizar o agendamento na agenda.",
    };
  }
}

export async function removeAppointmentFromCalendar(
  userId: string,
  googleEventId: string,
): Promise<{ success: boolean; error?: string }> {
  return deleteCalendarEvent(userId, googleEventId);
}

export const __googleCalendarTestUtils = {
  normalizeCalendarTime,
  buildCalendarDateTime,
  addMinutesToCalendarDateTime,
  rangesOverlap,
  parseCalendarDateTimeWithTimeZone,
  parseStoredMetadata,
  buildStoredMetadata,
};

export type {
  CalendarEventData,
  GoogleTokens,
  CalendarBusyWindow,
  MatonCalendarEntry,
  GoogleCalendarStatus,
};
