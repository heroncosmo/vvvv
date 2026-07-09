let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let controllerReloadBound = false;
let refreshTriggersBound = false;
let versionMonitorBound = false;
let versionCheckPromise: Promise<void> | null = null;
let pendingPublishedVersion: string | null = null;
let updateActivationRequested = false;
let automaticUpdatePromise: Promise<void> | null = null;
let automaticUpdateVersion = "";
let lastVersionCheckWarningAt = 0;
let lastVersionCheckWarningSignature = "";
const PWA_BUILD_VERSION = import.meta.env.VITE_PWA_VERSION || "dev";
const PWA_UPDATE_ACTIVATION_MARKER = "PWA_AUTO_UPDATE_V826";
const SERVICE_WORKER_URL = `/sw.js?v=${encodeURIComponent(PWA_BUILD_VERSION)}`;
const PWA_VERSION_INFO_URL = "/pwa-version.json";
const PWA_UPDATE_CHECK_INTERVAL_MS = 60_000;
const PWA_VERSION_WARNING_COOLDOWN_MS = 5 * 60_000;
const PWA_CONTROLLER_CHANGE_RELOAD_TIMEOUT_MS = 8_000;
const PWA_AUTO_UPDATE_RETRY_COOLDOWN_MS = 30 * 60_000;
export const PWA_UPDATE_AVAILABLE_EVENT = "agentezap:pwa-update-available";

if (typeof window !== "undefined") {
  (window as any).__agentezapPwaUpdateActivationMarker = PWA_UPDATE_ACTIVATION_MARKER;
}

export interface RuntimeNotificationOptions {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  url?: string;
  silent?: boolean;
  renotify?: boolean;
  requireInteraction?: boolean;
  vibrate?: number[];
  timestamp?: number;
}

type PublishedPwaVersionPayload = {
  version?: string;
};

type PwaUpdatePhase = "detected" | "updating" | "failed";

function dispatchPwaUpdateAvailable(version: string, source: string, phase: PwaUpdatePhase = "detected") {
  window.dispatchEvent(
    new CustomEvent(PWA_UPDATE_AVAILABLE_EVENT, {
      detail: { version, source, phase },
    }),
  );
}

function getAutoUpdateAttemptKey(version: string) {
  return `agentezap:pwa-auto-update-attempt:${version}`;
}

function readAutoUpdateAttempt(version: string) {
  try {
    const value = window.localStorage.getItem(getAutoUpdateAttemptKey(version));
    const timestamp = value ? Number(value) : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  } catch {
    return 0;
  }
}

function markAutoUpdateAttempt(version: string) {
  try {
    window.localStorage.setItem(getAutoUpdateAttemptKey(version), Date.now().toString());
  } catch {
    // Storage can be unavailable in restricted browser modes.
  }
}

function shouldThrottleAutoUpdate(version: string) {
  const lastAttempt = readAutoUpdateAttempt(version);
  return lastAttempt > 0 && Date.now() - lastAttempt < PWA_AUTO_UPDATE_RETRY_COOLDOWN_MS;
}

function scheduleAutomaticPwaUpdate(version: string, source: string) {
  if (typeof window === "undefined") {
    return;
  }

  const targetVersion = version || pendingPublishedVersion || PWA_BUILD_VERSION;
  if (!targetVersion) {
    return;
  }

  pendingPublishedVersion = targetVersion;

  if (automaticUpdatePromise && automaticUpdateVersion === targetVersion) {
    dispatchPwaUpdateAvailable(targetVersion, source, "updating");
    return;
  }

  if (shouldThrottleAutoUpdate(targetVersion)) {
    return;
  }

  automaticUpdateVersion = targetVersion;
  markAutoUpdateAttempt(targetVersion);
  dispatchPwaUpdateAvailable(targetVersion, source, "updating");

  automaticUpdatePromise = (async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    await activatePendingPwaUpdate();
  })()
    .catch((error) => {
      warnPwaVersionCheckFailure(error);
      dispatchPwaUpdateAvailable(targetVersion, source, "failed");
    })
    .finally(() => {
      automaticUpdatePromise = null;
      automaticUpdateVersion = "";
    });
}

function reloadToLatestVersion() {
  const url = new URL(window.location.href);
  url.searchParams.set("az_pwa_refresh", Date.now().toString());
  window.location.replace(url.toString());
}

function waitForControllerChange(timeoutMs = PWA_CONTROLLER_CHANGE_RELOAD_TIMEOUT_MS) {
  if (!("serviceWorker" in navigator)) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof window.setTimeout>;
    const finish = (changed: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      resolve(changed);
    };
    const onControllerChange = () => finish(true);
    timeoutId = window.setTimeout(() => finish(false), timeoutMs);

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
  });
}

function waitForInstallingWorker(registration: ServiceWorkerRegistration, timeoutMs = PWA_CONTROLLER_CHANGE_RELOAD_TIMEOUT_MS) {
  const worker = registration.installing;
  if (!worker) {
    return Promise.resolve<ServiceWorker | null>(null);
  }

  if (worker.state === "installed") {
    return Promise.resolve(worker);
  }

  return new Promise<ServiceWorker | null>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof window.setTimeout>;
    const finish = (result: ServiceWorker | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      worker.removeEventListener("statechange", onStateChange);
      resolve(result);
    };
    const onStateChange = () => {
      if (worker.state === "installed") {
        finish(worker);
      } else if (worker.state === "activated" || worker.state === "redundant") {
        finish(null);
      }
    };
    timeoutId = window.setTimeout(() => finish(null), timeoutMs);

    worker.addEventListener("statechange", onStateChange);
  });
}

function warnPwaVersionCheckFailure(error: unknown) {
  const signature = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  const now = Date.now();

  if (
    signature === lastVersionCheckWarningSignature &&
    now - lastVersionCheckWarningAt < PWA_VERSION_WARNING_COOLDOWN_MS
  ) {
    return;
  }

  lastVersionCheckWarningSignature = signature;
  lastVersionCheckWarningAt = now;
  console.warn("[PWA] Falha ao verificar versao publicada:", error);
}

export async function activatePendingPwaUpdate() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    reloadToLatestVersion();
    return;
  }

  updateActivationRequested = true;
  const registration = await registerPwaServiceWorker();
  await registration?.update().catch(() => undefined);
  const waitingWorker = registration?.waiting || (registration ? await waitForInstallingWorker(registration) : null);

  if (waitingWorker) {
    const controllerChanged = waitForControllerChange();
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    if (!(await controllerChanged)) {
      reloadToLatestVersion();
    }
    return;
  }

  reloadToLatestVersion();
}

async function fetchPublishedPwaVersion() {
  const response = await fetch(`${PWA_VERSION_INFO_URL}?t=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar versao do PWA (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Resposta de versao do PWA nao e JSON (${contentType || "sem content-type"})`);
  }

  const payload = (await response.json()) as PublishedPwaVersionPayload;
  const version = typeof payload?.version === "string" ? payload.version.trim() : "";
  return version || null;
}

export async function checkForPublishedPwaUpdate(source = "manual") {
  if (typeof window === "undefined") {
    return;
  }

  if (versionCheckPromise) {
    return versionCheckPromise;
  }

  versionCheckPromise = (async () => {
    try {
      const publishedVersion = await fetchPublishedPwaVersion();
      if (!publishedVersion || publishedVersion === PWA_BUILD_VERSION) {
        pendingPublishedVersion = null;
        return;
      }

      pendingPublishedVersion = publishedVersion;

      const registration = await registerPwaServiceWorker();
      if (registration) {
        await registration.update().catch(() => undefined);
      }

      scheduleAutomaticPwaUpdate(publishedVersion, source);
    } catch (error) {
      warnPwaVersionCheckFailure(error);
    } finally {
      versionCheckPromise = null;
    }
  })();

  return versionCheckPromise;
}

function shouldSkipServiceWorkerRegistration() {
  return (
    isNativeApp() ||
    (import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(window.location.hostname.toLowerCase()))
  );
}

export function supportsWebPush() {
  return (
    !isNativeApp() &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as any)?.standalone === true
  );
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export async function registerPwaServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  if (shouldSkipServiceWorkerRegistration()) {
    return null;
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (!controllerReloadBound) {
          controllerReloadBound = true;
          let refreshed = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (!updateActivationRequested) return;
            if (refreshed) return;
            refreshed = true;
            window.location.reload();
          });
        }

        if (!refreshTriggersBound) {
          refreshTriggersBound = true;
          const refreshRegistration = () => {
            void registration.update().catch(() => undefined);
          };

          window.addEventListener("focus", refreshRegistration);
          window.addEventListener("online", refreshRegistration);
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
              refreshRegistration();
            }
          });
        }

        if (registration.waiting) {
          scheduleAutomaticPwaUpdate(pendingPublishedVersion || PWA_BUILD_VERSION, "service-worker-waiting");
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              scheduleAutomaticPwaUpdate(pendingPublishedVersion || PWA_BUILD_VERSION, "service-worker-installed");
            }
          });
        });

        window.setTimeout(() => {
          void registration.update().catch(() => undefined);
        }, 3000);

        return registration;
      })
      .catch((error) => {
        console.error("[PWA] Falha ao registrar service worker:", error);
        return null;
      });
  }

  return registrationPromise;
}

export function startPwaVersionMonitor() {
  if (typeof window === "undefined" || versionMonitorBound || isNativeApp()) {
    return;
  }

  versionMonitorBound = true;

  const handleVisibleState = () => {
    if (document.visibilityState !== "visible") {
      return;
    }

    if (pendingPublishedVersion) {
      scheduleAutomaticPwaUpdate(pendingPublishedVersion, "visible");
      return;
    }

    void checkForPublishedPwaUpdate("visible");
  };

  window.addEventListener("focus", () => {
    void checkForPublishedPwaUpdate("focus");
  });
  window.addEventListener("online", () => {
    void checkForPublishedPwaUpdate("online");
  });
  document.addEventListener("visibilitychange", handleVisibleState);
  window.setInterval(() => {
    void checkForPublishedPwaUpdate("interval");
  }, PWA_UPDATE_CHECK_INTERVAL_MS);

  window.setTimeout(() => {
    void checkForPublishedPwaUpdate("startup");
  }, 4_000);
}

export async function getPushSubscription() {
  const registration = await registerPwaServiceWorker();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function ensurePushSubscription(vapidPublicKey: string) {
  const registration = await registerPwaServiceWorker();
  if (!registration) {
    throw new Error("Service worker indisponivel");
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    return existingSubscription;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export async function removePushSubscription() {
  const existingSubscription = await getPushSubscription();
  if (!existingSubscription) {
    return null;
  }

  const endpoint = existingSubscription.endpoint;
  await existingSubscription.unsubscribe();
  return endpoint;
}

export async function showRuntimeNotification(options: RuntimeNotificationOptions) {
  const {
    title,
    body,
    tag,
    icon,
    badge,
    url,
    silent = false,
    renotify = false,
    requireInteraction = false,
    vibrate,
    timestamp,
  } = options;

  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  const registration = await registerPwaServiceWorker();
  const notificationOptions: NotificationOptions = {
    body,
    tag: tag || "agentezap-msg",
    icon: icon || "/pwa-192.png",
    badge: badge || "/pwa-badge.png",
    data: { url: url || "/" },
    renotify,
    requireInteraction,
    silent,
  };

  if (Array.isArray(vibrate) && vibrate.length > 0) {
    notificationOptions.vibrate = vibrate;
  }

  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    notificationOptions.timestamp = timestamp;
  }

  if (registration && typeof registration.showNotification === "function") {
    await registration.showNotification(title, notificationOptions);
    return true;
  }

  const notification = new Notification(title, notificationOptions);
  notification.onclick = () => {
    window.focus();
    if (url) {
      window.location.href = url;
    }
    notification.close();
  };
  window.setTimeout(() => notification.close(), 5000);
  return true;
}
import { isNativeApp } from "./native-runtime";
