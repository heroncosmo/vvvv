const ADMIN_DISABLED_AI_BOOLEAN_FIELDS = [
  "paymentReminderAiEnabled",
  "payment_reminder_ai_enabled",
  "overdueReminderAiEnabled",
  "overdue_reminder_ai_enabled",
  "checkinAiEnabled",
  "checkin_ai_enabled",
  "broadcastAiVariation",
  "broadcast_ai_variation",
  "disconnectedAiEnabled",
  "disconnected_ai_enabled",
  "aiVariationEnabled",
  "ai_variation_enabled",
  "welcomeMessageAiEnabled",
  "welcome_message_ai_enabled",
] as const;

const ADMIN_DISABLED_AI_TEXT_FIELDS = [
  "paymentReminderAiPrompt",
  "payment_reminder_ai_prompt",
  "overdueReminderAiPrompt",
  "overdue_reminder_ai_prompt",
  "checkinAiPrompt",
  "checkin_ai_prompt",
  "disconnectedAiPrompt",
  "disconnected_ai_prompt",
  "aiVariationPrompt",
  "ai_variation_prompt",
  "welcomeMessageAiPrompt",
  "welcome_message_ai_prompt",
] as const;

export function isAdminAiSendingEnabled(): boolean {
  return false;
}

export function isAdminLiveAiEnabled(): boolean {
  return false;
}

export function isAdminFollowupEnabled(): boolean {
  return false;
}

export function sanitizeAdminNotificationConfig<T extends Record<string, any> | null | undefined>(
  raw: T,
): T {
  if (!raw) {
    return raw;
  }

  const sanitized = { ...raw } as Record<string, any>;

  for (const field of ADMIN_DISABLED_AI_BOOLEAN_FIELDS) {
    sanitized[field] = false;
  }

  for (const field of ADMIN_DISABLED_AI_TEXT_FIELDS) {
    sanitized[field] = "";
  }

  return sanitized as T;
}

export function sanitizeAdminBroadcast<T extends Record<string, any> | null | undefined>(
  raw: T,
): T {
  if (!raw) {
    return raw;
  }

  return {
    ...raw,
    aiVariation: false,
    ai_variation: false,
  } as T;
}

export function sanitizeAdminWhatsappConnection<T extends Record<string, any> | null | undefined>(
  raw: T,
): T {
  if (!raw) {
    return raw;
  }

  return {
    ...raw,
    aiEnabled: false,
    ai_enabled: false,
  } as T;
}

export function sanitizeAdminFollowupConfig<T extends Record<string, any> | null | undefined>(
  raw: T,
): T {
  if (!raw) {
    return raw;
  }

  return {
    ...raw,
    enabled: false,
    isEnabled: false,
    followupNonPayersEnabled: false,
    followup_non_payers_enabled: false,
  } as T;
}
