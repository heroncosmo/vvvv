export type AppRuntimeProfile = "full" | "web" | "worker";

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

  if (
    explicitProfile === "worker" ||
    explicitProfile === "jobs" ||
    explicitProfile === "stateful-worker" ||
    explicitProfile === "background"
  ) {
    return "worker";
  }

  return "full";
}

export function isWebOnlyAppRuntime(): boolean {
  return resolveAppRuntimeProfile() === "web";
}

export function isWorkerAppRuntime(): boolean {
  return resolveAppRuntimeProfile() === "worker";
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
  if (profile === "web") {
    return "web-only";
  }

  return profile;
}
