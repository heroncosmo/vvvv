let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let controllerReloadBound = false;
let refreshTriggersBound = false;
let versionMonitorBound = false;
let versionCheckPromise: Promise<void> | null = null;
let pendingPublishedVersion: string | null = null;
const PWA_BUILD_VERSION = import.meta.env.VITE_PWA_VERSION || "dev";
const SERVICE_WORKER_URL = `/sw.js?v=${encodeURIComponent(PWA_BUILD_VERSION)}`;
const PWA_VERSION_INFO_URL = "/pwa-version.json";
const PWA_UPDATE_CHECK_INTERVAL_MS = 60_000;
export const PWA_UPDATE_AVAILABLE_EVENT = "agentezap:pwa-update-available";

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

function hasActiveTextEntry() {
  if (typeof document === "undefined") {
    return false;
  }

  const activeElement = document.activeElement;
  if (!activeElement) {
    return false;
  }

  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    return true;
  }

  return activeElement.getAttribute("contenteditable") === "true";
}

function dispatchPwaUpdateAvailable(version: string, source: string) {
  window.dispatchEvent(
    new CustomEvent(PWA_UPDATE_AVAILABLE_EVENT, {
      detail: { version, source },
    }),
  );
}

function reloadToLatestVersion() {
  window.location.reload();
}

async function fetchPublishedPwaVersion() {
  const response = await fetch(`${PWA_VERSION_INFO_URL}?t=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar versao do PWA (${response.status})`);
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
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      }

      if (document.visibilityState === "visible" && !hasActiveTextEntry()) {
        reloadToLatestVersion();
        return;
      }

      dispatchPwaUpdateAvailable(publishedVersion, source);
    } catch (error) {
      console.warn("[PWA] Falha ao verificar versao publicada:", error);
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
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              registration.waiting?.postMessage({ type: "SKIP_WAITING" });
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

    if (pendingPublishedVersion && !hasActiveTextEntry()) {
      reloadToLatestVersion();
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
    throw new Error("Service worker indisponível");
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
