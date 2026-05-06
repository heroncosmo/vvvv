export type AppRuntimeProfile = "full" | "web";

function normalizeProfile(value: string | undefined | null): string {
  return String(value || "").trim().toLowerCase();
}

export function resolveAppRuntimeProfile(): AppRuntimeProfile {
  const explicitProfile = normalizeProfile(
    process.env.APP_RUNTIME_PROFILE ||
    process.env.RUNTIME_PROFILE ||
    process.env.APP_ROLE,
  );

  if (
    explicitProfile === "web" ||
    explicitProfile === "web-only" ||
    explicitProfile === "frontend" ||
    explicitProfile === "ui"
  ) {
    return "web";
  }

  return "full";
}

export function isWebOnlyAppRuntime(): boolean {
  return resolveAppRuntimeProfile() === "web";
}

export function areStatefulAppServicesEnabled(): boolean {
  if (process.env.DISABLE_BACKGROUND_SERVICES === "true") {
    return false;
  }

  if (process.env.DISABLE_BACKGROUND_JOBS === "true") {
    return false;
  }

  if (process.env.DISABLE_WHATSAPP_PROCESSING === "true") {
    return false;
  }

  return !isWebOnlyAppRuntime();
}

export function describeAppRuntimeProfile(): string {
  const profile = resolveAppRuntimeProfile();
  return profile === "web" ? "web-only" : "full";
}
