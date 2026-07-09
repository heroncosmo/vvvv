import { supabase } from "./supabaseAuth";
import { getModuleSchedulingSettings } from "./moduleSchedulingSettings";

type LegacyModuleKind = "scheduling" | "salon" | "provider" | "clinic";

type LegacyConfigSnapshot = {
  scheduling?: Record<string, any> | null;
  salon?: Record<string, any> | null;
  provider?: Record<string, any> | null;
  clinic?: Record<string, any> | null;
};

export type Agendamento2MigrationOptions = {
  dryRun?: boolean;
  deactivateLegacyModules?: boolean;
};

export type Agendamento2UserMigrationResult = {
  userId: string;
  sourceModules: LegacyModuleKind[];
  actions: string[];
  warnings: string[];
  migrated: boolean;
};

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function buildAvailableDaysFromOpeningHours(openingHours?: Record<string, any> | null) {
  if (!openingHours || typeof openingHours !== "object") {
    return [1, 2, 3, 4, 5];
  }

  const enabledDays = WEEKDAY_KEYS
    .map((key, index) => ({ key, index }))
    .filter(({ key }) => openingHours[key]?.enabled !== false)
    .map(({ index }) => index);

  return enabledDays.length > 0 ? enabledDays : [1, 2, 3, 4, 5];
}

function resolveWorkWindow(openingHours?: Record<string, any> | null) {
  if (!openingHours || typeof openingHours !== "object") {
    return {
      workStartTime: "09:00",
      workEndTime: "18:00",
      breakStartTime: "12:00",
      breakEndTime: "13:00",
      hasBreak: false,
    };
  }

  const dayEntries = WEEKDAY_KEYS
    .map((key) => openingHours[key])
    .filter((entry) => entry && entry.enabled !== false);

  const firstEnabled = dayEntries[0] || {};
  const breakConfig = openingHours.__break || {};

  return {
    workStartTime: String(firstEnabled.open || "09:00"),
    workEndTime: String(firstEnabled.close || "18:00"),
    breakStartTime: String(breakConfig.start || "12:00"),
    breakEndTime: String(breakConfig.end || "13:00"),
    hasBreak: breakConfig.enabled === true,
  };
}

function formatAgendaHoursContextFromOpeningHours(openingHours?: Record<string, any> | null) {
  if (!openingHours || typeof openingHours !== "object") {
    return "Segunda a sexta: 09:00 as 18:00\nSabado: fechado\nDomingo: fechado";
  }

  const labels = [
    "Domingo",
    "Segunda-feira",
    "Terca-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sabado",
  ];

  const lines = WEEKDAY_KEYS.map((key, index) => {
    const entry = openingHours[key];
    if (!entry || entry.enabled === false) {
      return `${labels[index]}: fechado`;
    }
    return `${labels[index]}: ${String(entry.open || "09:00")} as ${String(entry.close || "18:00")}`;
  });

  return lines.join("\n");
}

function formatAgendaHoursContextFromSchedulingConfig(config?: Record<string, any> | null) {
  if (!config) {
    return "Segunda a sexta: 09:00 as 18:00\nSabado: fechado\nDomingo: fechado";
  }

  const availableDays = Array.isArray(config.available_days) ? config.available_days.map(Number) : [1, 2, 3, 4, 5];
  const start = String(config.work_start_time || "09:00");
  const end = String(config.work_end_time || "18:00");
  const labels = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"];

  return labels
    .map((label, index) =>
      availableDays.includes(index) ? `${label}: ${start} as ${end}` : `${label}: fechado`,
    )
    .join("\n");
}

async function upsertSchedulingConfig(userId: string, payload: Record<string, unknown>, dryRun: boolean) {
  if (dryRun) {
    return;
  }

  const updatePayload = {
    ...payload,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await supabase
    .from("scheduling_config")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    throw existingError;
  }

  if (existing?.id) {
    const { error } = await supabase.from("scheduling_config").update(updatePayload).eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("scheduling_config").insert({
    user_id: userId,
    ...updatePayload,
  });
  if (error) throw error;
}

async function upsertAgendamento2Config(userId: string, payload: Record<string, unknown>, dryRun: boolean) {
  if (dryRun) {
    return;
  }

  const updatePayload = {
    ...payload,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await supabase
    .from("agendamento2_config")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    throw existingError;
  }

  if (existing?.id) {
    const { error } = await supabase.from("agendamento2_config").update(updatePayload).eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("agendamento2_config").insert({
    user_id: userId,
    is_active: true,
    send_to_ai: true,
    scheduling_tracker_enabled: true,
    display_name: "Agendamento 2.0",
    ...updatePayload,
  });
  if (error) throw error;
}

async function copyRows<T extends Record<string, any>>(
  sourceTable: string,
  targetTable: string,
  userId: string,
  mapRow: (row: Record<string, any>) => T,
  dryRun: boolean,
) {
  const { data, error } = await supabase.from(sourceTable).select("*").eq("user_id", userId);
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length || dryRun) {
    return rows.length;
  }

  const payload = rows.map(mapRow);
  const { error: upsertError } = await supabase.from(targetTable).upsert(payload, { onConflict: "id" });
  if (upsertError) {
    throw upsertError;
  }

  return rows.length;
}

function mapLegacyAppointmentToSharedAppointment(row: Record<string, any>) {
  return {
    id: row.id,
    user_id: row.user_id,
    conversation_id: row.conversation_id,
    client_name: row.client_name,
    client_phone: row.client_phone,
    client_email: row.client_email,
    service_name: row.service_name,
    appointment_date: row.appointment_date,
    start_time: row.start_time,
    end_time: row.end_time,
    duration_minutes: row.duration_minutes || 60,
    service_id: row.service_id,
    professional_id: row.professional_id,
    professional_name: row.professional_name,
    location: row.location,
    location_type: row.location_type || "presencial",
    meeting_link: row.meeting_link,
    status: row.status || "pending",
    confirmed_by_client: row.confirmed_by_client === true,
    confirmed_by_business: row.confirmed_by_business === true,
    confirmed_at: row.confirmed_at,
    cancelled_at: row.cancelled_at,
    cancelled_by: row.cancelled_by,
    cancellation_reason: row.cancellation_reason,
    reminder_sent: row.reminder_sent === true,
    reminder_sent_at: row.reminder_sent_at,
    reminder_times_sent: Array.isArray(row.reminder_times_sent) ? row.reminder_times_sent : [],
    google_event_id: row.google_event_id,
    google_calendar_synced: row.google_calendar_synced === true,
    client_notes: row.client_notes,
    internal_notes: row.internal_notes,
    updated_at: new Date().toISOString(),
  };
}

async function migrateGoogleTokens(
  sourceTable: "provider_google_calendar_tokens" | "clinic_google_calendar_tokens",
  userId: string,
  dryRun: boolean,
) {
  const { data, error } = await supabase.from(sourceTable).select("*").eq("user_id", userId).maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw error;
  }

  if (!data || dryRun) {
    return Boolean(data);
  }

  const payload = {
    user_id: userId,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expiry_date: data.expiry_date,
    scope: data.scope,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("google_calendar_tokens")
    .upsert(payload, { onConflict: "user_id" });
  if (upsertError) {
    throw upsertError;
  }

  return true;
}

function buildSchedulingPayloadFromLegacyConfig(sourceModule: LegacyModuleKind, config: Record<string, any>) {
  if (sourceModule === "scheduling") {
    return {
      is_enabled: true,
      updated_at: new Date().toISOString(),
    };
  }

  const openingHours = (config.opening_hours as Record<string, any> | undefined) || {};
  const settings = getModuleSchedulingSettings(openingHours);
  const workWindow = resolveWorkWindow(openingHours);

  return {
    is_enabled: true,
    service_name: config.service_name || config.salon_name || "Agendamento",
    location: config.address || null,
    location_type: "presencial",
    available_days: buildAvailableDaysFromOpeningHours(openingHours),
    work_start_time: workWindow.workStartTime,
    work_end_time: workWindow.workEndTime,
    break_start_time: workWindow.breakStartTime,
    break_end_time: workWindow.breakEndTime,
    has_break: workWindow.hasBreak,
    slot_duration: Number(config.slot_duration) > 0 ? Number(config.slot_duration) : 60,
    buffer_between_appointments: Number(config.buffer_between) >= 0 ? Number(config.buffer_between) : 15,
    advance_booking_days: Number(config.max_advance_days) > 0 ? Number(config.max_advance_days) : 30,
    min_booking_notice_hours: Number(config.min_notice_hours) > 0 ? Number(config.min_notice_hours) : 2,
    allow_cancellation: config.allow_cancellation !== false,
    send_reminder: settings.send_reminder,
    reminder_hours_before: settings.reminder_hours_before,
    reminder_times: settings.reminder_times,
    google_calendar_enabled: config.google_calendar_enabled === true,
    google_calendar_id: config.google_calendar_id || null,
    use_services: config.use_services !== false,
    use_professionals: config.use_professionals !== false,
    require_confirmation: settings.require_confirmation,
    auto_confirm: settings.auto_confirm,
    booking_notification_enabled: settings.booking_notification_enabled,
    booking_notification_phone: settings.booking_notification_phone,
    slot_suggestion_mode: settings.slot_suggestion_mode,
    confirmation_message: config.booking_confirmation_message || null,
    reminder_message: config.reminder_message || null,
    cancellation_message: config.cancellation_message || null,
    ai_scheduling_enabled: true,
    updated_at: new Date().toISOString(),
  };
}

async function deactivateLegacyConfig(sourceModule: Exclude<LegacyModuleKind, "scheduling">, userId: string, dryRun: boolean) {
  if (dryRun) {
    return;
  }

  const table = sourceModule === "salon" ? "salon_config" : sourceModule === "provider" ? "provider_config" : "clinic_config";
  const { error } = await supabase
    .from(table)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

async function getLegacySnapshots(userId: string): Promise<LegacyConfigSnapshot> {
  const [scheduling, salon, provider, clinic] = await Promise.all([
    supabase.from("scheduling_config").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("salon_config").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("provider_config").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("clinic_config").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  return {
    scheduling: scheduling.data || null,
    salon: salon.data || null,
    provider: provider.data || null,
    clinic: clinic.data || null,
  };
}

export async function migrateLegacyUserToAgendamento2(
  userId: string,
  options: Agendamento2MigrationOptions = {},
): Promise<Agendamento2UserMigrationResult> {
  const dryRun = options.dryRun !== false;
  const deactivateLegacyModules = options.deactivateLegacyModules === true;
  const snapshots = await getLegacySnapshots(userId);
  const sourceModules: LegacyModuleKind[] = [];
  const actions: string[] = [];
  const warnings: string[] = [];

  if (snapshots.scheduling?.is_enabled === true) sourceModules.push("scheduling");
  if (snapshots.salon?.is_active === true) sourceModules.push("salon");
  if (snapshots.provider?.is_active === true) sourceModules.push("provider");
  if (snapshots.clinic?.is_active === true) sourceModules.push("clinic");

  if (!sourceModules.length) {
    return {
      userId,
      sourceModules,
      actions: ["Nenhum modulo legado ativo para migrar."],
      warnings,
      migrated: false,
    };
  }

  const primarySource = sourceModules[0];
  const primaryConfig = snapshots[primarySource];
  if (!primaryConfig) {
    throw new Error(`Configuracao principal ausente para ${primarySource}`);
  }

  const schedulingPayload = buildSchedulingPayloadFromLegacyConfig(primarySource, primaryConfig);
  await upsertSchedulingConfig(userId, schedulingPayload, dryRun);
  actions.push(`Base operacional compartilhada preparada a partir de ${primarySource}.`);

  if (primarySource === "provider") {
    const servicesCount = await copyRows("provider_services", "scheduling_services", userId, (row) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description,
      duration_minutes: row.duration_minutes || 60,
      price: row.price,
      is_active: row.is_active !== false,
      color: row.color || "#3b82f6",
      display_order: row.display_order || 0,
      updated_at: new Date().toISOString(),
    }), dryRun);
    const professionalsCount = await copyRows("provider_professionals", "scheduling_professionals", userId, (row) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      bio: row.bio,
      avatar_url: row.avatar_url,
      is_active: row.is_active !== false,
      work_schedule: row.work_schedule || {},
      display_order: row.display_order || 0,
      updated_at: new Date().toISOString(),
    }), dryRun);
    const appointmentsCount = await copyRows(
      "provider_appointments",
      "appointments",
      userId,
      mapLegacyAppointmentToSharedAppointment,
      dryRun,
    );
    const tokensMigrated = await migrateGoogleTokens("provider_google_calendar_tokens", userId, dryRun);
    actions.push(`Prestador migrado: ${servicesCount} servicos, ${professionalsCount} profissionais, ${appointmentsCount} agendamentos.`);
    if (tokensMigrated) actions.push("Token Google/Maton do prestador copiado para a base compartilhada.");
  }

  if (primarySource === "clinic") {
    const servicesCount = await copyRows("clinic_services", "scheduling_services", userId, (row) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      description: row.description,
      duration_minutes: row.duration_minutes || 60,
      price: row.price,
      is_active: row.is_active !== false,
      color: row.color || "#3b82f6",
      display_order: row.display_order || 0,
      updated_at: new Date().toISOString(),
    }), dryRun);
    const professionalsCount = await copyRows("clinic_professionals", "scheduling_professionals", userId, (row) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      bio: row.bio,
      avatar_url: row.avatar_url,
      is_active: row.is_active !== false,
      work_schedule: row.work_schedule || {},
      display_order: row.display_order || 0,
      updated_at: new Date().toISOString(),
    }), dryRun);
    const appointmentsCount = await copyRows(
      "clinic_appointments",
      "appointments",
      userId,
      mapLegacyAppointmentToSharedAppointment,
      dryRun,
    );
    const tokensMigrated = await migrateGoogleTokens("clinic_google_calendar_tokens", userId, dryRun);
    actions.push(`Clinica migrada: ${servicesCount} servicos, ${professionalsCount} profissionais, ${appointmentsCount} agendamentos.`);
    if (tokensMigrated) actions.push("Token Google/Maton da clinica copiado para a base compartilhada.");
  }

  const hoursContext =
    primarySource === "scheduling"
      ? formatAgendaHoursContextFromSchedulingConfig(primaryConfig)
      : formatAgendaHoursContextFromOpeningHours(primaryConfig.opening_hours);

  await upsertAgendamento2Config(
    userId,
    {
      is_active: true,
      send_to_ai: true,
      scheduling_tracker_enabled: true,
      display_name: "Agendamento 2.0",
      agenda_hours_context: hoursContext,
    },
    dryRun,
  );
  actions.push("Agendamento 2.0 ativado com contexto de horarios do negocio.");

  if (deactivateLegacyModules) {
    for (const sourceModule of sourceModules) {
      if (sourceModule === "scheduling") {
        continue;
      }
      await deactivateLegacyConfig(sourceModule, userId, dryRun);
      actions.push(`Modulo legado ${sourceModule} desativado apos migracao.`);
    }
  }

  if (!dryRun) {
    const { invalidateSchedulingCache } = await import("./schedulingService");
    invalidateSchedulingCache(userId);
  }

  if (sourceModules.includes("salon") && sourceModules.length > 1) {
    warnings.push("Salao estava ativo junto com outro modulo legado; a configuracao operacional principal usada foi a primeira encontrada.");
  }

  return {
    userId,
    sourceModules,
    actions,
    warnings,
    migrated: true,
  };
}

export async function listLegacySchedulingUsers(): Promise<Array<{ userId: string; sourceModules: LegacyModuleKind[] }>> {
  const [scheduling, salon, provider, clinic] = await Promise.all([
    supabase.from("scheduling_config").select("user_id").eq("is_enabled", true),
    supabase.from("salon_config").select("user_id").eq("is_active", true),
    supabase.from("provider_config").select("user_id").eq("is_active", true),
    supabase.from("clinic_config").select("user_id").eq("is_active", true),
  ]);

  const registry = new Map<string, Set<LegacyModuleKind>>();
  const register = (rows: Array<Record<string, any>> | null | undefined, kind: LegacyModuleKind) => {
    for (const row of rows || []) {
      const userId = String(row.user_id || "").trim();
      if (!userId) continue;
      const current = registry.get(userId) || new Set<LegacyModuleKind>();
      current.add(kind);
      registry.set(userId, current);
    }
  };

  register(scheduling.data as Array<Record<string, any>> | undefined, "scheduling");
  register(salon.data as Array<Record<string, any>> | undefined, "salon");
  register(provider.data as Array<Record<string, any>> | undefined, "provider");
  register(clinic.data as Array<Record<string, any>> | undefined, "clinic");

  return Array.from(registry.entries()).map(([userId, sourceSet]) => ({
    userId,
    sourceModules: Array.from(sourceSet.values()),
  }));
}

export async function migrateAllLegacyUsersToAgendamento2(
  options: Agendamento2MigrationOptions = {},
): Promise<Agendamento2UserMigrationResult[]> {
  const users = await listLegacySchedulingUsers();
  const results: Agendamento2UserMigrationResult[] = [];

  for (const user of users) {
    results.push(await migrateLegacyUserToAgendamento2(user.userId, options));
  }

  return results;
}
