export type ModuleSlotSuggestionMode = "first_available" | "ask_preference";

export interface ModuleSchedulingSettings {
  require_confirmation: boolean;
  auto_confirm: boolean;
  send_reminder: boolean;
  reminder_hours_before: number;
  reminder_times: number[];
  booking_notification_enabled: boolean;
  booking_notification_phone: string | null;
  slot_suggestion_mode: ModuleSlotSuggestionMode;
}

const DEFAULT_SETTINGS: ModuleSchedulingSettings = {
  require_confirmation: true,
  auto_confirm: false,
  send_reminder: true,
  reminder_hours_before: 24,
  reminder_times: [24],
  booking_notification_enabled: false,
  booking_notification_phone: null,
  slot_suggestion_mode: "first_available",
};

function normalizeReminderTimes(rawValue: unknown, fallbackHour: number): number[] {
  if (!Array.isArray(rawValue)) {
    return [fallbackHour];
  }

  const parsed = rawValue
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value));

  if (parsed.length === 0) {
    return [fallbackHour];
  }

  return Array.from(new Set(parsed)).sort((a, b) => b - a);
}

export function getModuleSchedulingSettings(openingHours?: Record<string, any> | null): ModuleSchedulingSettings {
  const rawSettings = openingHours?.__settings || {};
  const reminderHour = Number(rawSettings.reminder_hours_before);
  const normalizedReminderHour = Number.isFinite(reminderHour) && reminderHour > 0
    ? Math.round(reminderHour)
    : DEFAULT_SETTINGS.reminder_hours_before;
  const reminderTimes = normalizeReminderTimes(rawSettings.reminder_times, normalizedReminderHour);

  return {
    require_confirmation: typeof rawSettings.require_confirmation === "boolean"
      ? rawSettings.require_confirmation
      : DEFAULT_SETTINGS.require_confirmation,
    auto_confirm: typeof rawSettings.auto_confirm === "boolean"
      ? rawSettings.auto_confirm
      : DEFAULT_SETTINGS.auto_confirm,
    send_reminder: typeof rawSettings.send_reminder === "boolean"
      ? rawSettings.send_reminder
      : DEFAULT_SETTINGS.send_reminder,
    reminder_hours_before: reminderTimes[0] || normalizedReminderHour,
    reminder_times: reminderTimes,
    booking_notification_enabled: typeof rawSettings.booking_notification_enabled === "boolean"
      ? rawSettings.booking_notification_enabled
      : DEFAULT_SETTINGS.booking_notification_enabled,
    booking_notification_phone: typeof rawSettings.booking_notification_phone === "string" && rawSettings.booking_notification_phone.trim()
      ? rawSettings.booking_notification_phone.trim()
      : DEFAULT_SETTINGS.booking_notification_phone,
    slot_suggestion_mode: rawSettings.slot_suggestion_mode === "ask_preference"
      ? "ask_preference"
      : DEFAULT_SETTINGS.slot_suggestion_mode,
  };
}

export function applyModuleSchedulingSettings(
  openingHours: Record<string, any> | null | undefined,
  rawPatch: Partial<ModuleSchedulingSettings>,
): Record<string, any> {
  const nextOpeningHours = openingHours && typeof openingHours === "object"
    ? { ...openingHours }
    : {};
  const currentSettings = getModuleSchedulingSettings(nextOpeningHours);
  const reminderHour = Number(rawPatch.reminder_hours_before);
  const reminderHourValue = Number.isFinite(reminderHour) && reminderHour > 0
    ? Math.round(reminderHour)
    : currentSettings.reminder_hours_before;
  const reminderTimes = normalizeReminderTimes(
    rawPatch.reminder_times ?? currentSettings.reminder_times,
    reminderHourValue,
  );

  let requireConfirmation = typeof rawPatch.require_confirmation === "boolean"
    ? rawPatch.require_confirmation
    : currentSettings.require_confirmation;
  let autoConfirm = typeof rawPatch.auto_confirm === "boolean"
    ? rawPatch.auto_confirm
    : currentSettings.auto_confirm;

  if (typeof rawPatch.require_confirmation === "boolean" && rawPatch.auto_confirm === undefined) {
    autoConfirm = !rawPatch.require_confirmation;
  }

  if (typeof rawPatch.auto_confirm === "boolean" && rawPatch.require_confirmation === undefined) {
    requireConfirmation = !rawPatch.auto_confirm;
  }

  nextOpeningHours.__settings = {
    require_confirmation: requireConfirmation,
    auto_confirm: autoConfirm,
    send_reminder: typeof rawPatch.send_reminder === "boolean"
      ? rawPatch.send_reminder
      : currentSettings.send_reminder,
    reminder_hours_before: reminderTimes[0] || reminderHourValue,
    reminder_times: reminderTimes,
    booking_notification_enabled: typeof rawPatch.booking_notification_enabled === "boolean"
      ? rawPatch.booking_notification_enabled
      : currentSettings.booking_notification_enabled,
    booking_notification_phone: rawPatch.booking_notification_phone !== undefined
      ? (rawPatch.booking_notification_phone?.trim() || null)
      : currentSettings.booking_notification_phone,
    slot_suggestion_mode: rawPatch.slot_suggestion_mode === "ask_preference"
      ? "ask_preference"
      : rawPatch.slot_suggestion_mode === "first_available"
        ? "first_available"
        : currentSettings.slot_suggestion_mode,
  };

  return nextOpeningHours;
}

export function getModuleAutoConfirmValue(openingHours?: Record<string, any> | null): boolean {
  const settings = getModuleSchedulingSettings(openingHours);
  return settings.auto_confirm || !settings.require_confirmation;
}
