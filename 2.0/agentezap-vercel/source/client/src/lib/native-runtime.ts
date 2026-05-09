import { Capacitor } from "@capacitor/core";

const DEFAULT_PUBLIC_APP_ORIGIN = "https://agentezap.online";
const NATIVE_FETCH_BRIDGE_FLAG = "__agentezapNativeFetchBridgeInstalled";
const DEFAULT_ANDROID_APP_DOWNLOAD_PATH = "/downloads/agentezap-android.apk";
const DEFAULT_API_PATH = "/api";

function readViteEnv(name: string) {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return String(env?.[name] || "").trim();
}

function normalizeOrigin(origin: string | undefined | null) {
  const trimmed = String(origin || "").trim();
  if (!trimmed) return DEFAULT_PUBLIC_APP_ORIGIN;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function isVercelAppOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function normalizePublicAppOrigin(origin: string | undefined | null) {
  const normalizedOrigin = normalizeOrigin(origin);
  return isVercelAppOrigin(normalizedOrigin) ? DEFAULT_PUBLIC_APP_ORIGIN : normalizedOrigin;
}

function normalizeUrlBase(value: string | undefined | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function isAbsoluteNetworkUrl(value: string) {
  return /^(https?|wss?):\/\//i.test(value);
}

function readWindowOrigin() {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "";
  }

  return normalizeOrigin(window.location.origin);
}

function resolveRuntimeOrigin() {
  const configuredOrigin = readViteEnv("VITE_PUBLIC_APP_URL");
  if (configuredOrigin) {
    return normalizePublicAppOrigin(configuredOrigin);
  }

  return DEFAULT_PUBLIC_APP_ORIGIN;
}

function joinOriginAndPath(origin: string, path: string) {
  if (!path) return origin;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const url = new URL(path);
      if (isVercelAppOrigin(url.origin)) {
        return `${DEFAULT_PUBLIC_APP_ORIGIN}${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return path;
    }

    return path;
  }
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function readUserAgent() {
  if (typeof navigator === "undefined") return "";
  return String(navigator.userAgent || "").toLowerCase();
}

function readPlatform() {
  if (typeof navigator === "undefined") return "";
  return String(navigator.platform || "").toLowerCase();
}

function readUserAgentDataPlatform() {
  if (typeof navigator === "undefined") return "";

  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };

  return String(navigatorWithUserAgentData.userAgentData?.platform || "").toLowerCase();
}

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function isAndroidDevice() {
  if (isNativeApp()) {
    return Capacitor.getPlatform() === "android";
  }

  const userAgent = readUserAgent();
  if (userAgent.includes("android")) {
    return true;
  }

  return readUserAgentDataPlatform() === "android";
}

export function isIosDevice() {
  if (isNativeApp()) {
    return Capacitor.getPlatform() === "ios";
  }

  const userAgent = readUserAgent();
  const platform = readPlatform();

  if (userAgent.includes("iphone") || userAgent.includes("ipad") || userAgent.includes("ipod")) {
    return true;
  }

  return platform === "iphone" || platform === "ipad" || platform === "ipod";
}

export function shouldOfferAndroidNativeInstall() {
  return !isNativeApp() && isAndroidDevice();
}

export function getPublicAppOrigin() {
  return resolveRuntimeOrigin();
}

export function buildPublicAppUrl(path = "/") {
  return joinOriginAndPath(getPublicAppOrigin(), path);
}

export function getAndroidAppDownloadUrl() {
  const configuredPath = readViteEnv("VITE_ANDROID_APP_DOWNLOAD_URL") || DEFAULT_ANDROID_APP_DOWNLOAD_PATH;
  return buildPublicAppUrl(configuredPath || DEFAULT_ANDROID_APP_DOWNLOAD_PATH);
}

export function resolveApiBaseUrl() {
  const configuredApiBaseUrl = normalizeUrlBase(readViteEnv("VITE_API_URL"));

  if (!isNativeApp()) {
    return configuredApiBaseUrl || DEFAULT_API_PATH;
  }

  return configuredApiBaseUrl || buildPublicAppUrl(DEFAULT_API_PATH);
}

function resolveRealtimeBaseUrl() {
  const configuredRealtimeBaseUrl = normalizeUrlBase(
    readViteEnv("VITE_REALTIME_URL") || readViteEnv("VITE_WS_URL"),
  );

  if (configuredRealtimeBaseUrl) {
    return configuredRealtimeBaseUrl;
  }

  const apiBaseUrl = resolveApiBaseUrl();
  if (isAbsoluteNetworkUrl(apiBaseUrl)) {
    const realtimeUrl = new URL(apiBaseUrl);
    realtimeUrl.protocol =
      realtimeUrl.protocol === "https:"
        ? "wss:"
        : realtimeUrl.protocol === "http:"
          ? "ws:"
          : realtimeUrl.protocol;
    realtimeUrl.pathname = "/";
    realtimeUrl.search = "";
    realtimeUrl.hash = "";
    return realtimeUrl.toString();
  }

  const runtimeOrigin = readWindowOrigin();
  if (runtimeOrigin) {
    return runtimeOrigin;
  }

  return buildPublicAppUrl("/");
}

export function buildAppWebSocketUrl(path = "/ws", searchParams?: URLSearchParams | Record<string, string>) {
  const realtimeBaseUrl = resolveRealtimeBaseUrl();
  const normalizedBaseUrl = realtimeBaseUrl.endsWith("/") ? realtimeBaseUrl : `${realtimeBaseUrl}/`;
  const targetUrl = new URL(path.startsWith("/") ? path : `/${path}`, normalizedBaseUrl);

  if (targetUrl.protocol === "https:") {
    targetUrl.protocol = "wss:";
  } else if (targetUrl.protocol === "http:") {
    targetUrl.protocol = "ws:";
  }

  if (searchParams instanceof URLSearchParams) {
    searchParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });
  } else if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      targetUrl.searchParams.set(key, value);
    });
  }

  return targetUrl.toString();
}

function shouldRewriteNativeRequest(url: URL) {
  return url.origin === window.location.origin && url.pathname.startsWith("/api");
}

export function installNativeFetchBridge() {
  if (typeof window === "undefined" || !isNativeApp()) return;

  const windowWithFlag = window as Window & { __agentezapNativeFetchBridgeInstalled?: boolean };
  if (windowWithFlag[NATIVE_FETCH_BRIDGE_FLAG as "__agentezapNativeFetchBridgeInstalled"]) return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let request = input;

    if (typeof input === "string" || input instanceof URL) {
      const absoluteUrl = new URL(String(input), window.location.origin);
      if (shouldRewriteNativeRequest(absoluteUrl)) {
        request = joinOriginAndPath(getPublicAppOrigin(), `${absoluteUrl.pathname}${absoluteUrl.search}`);
      }
    } else if (input instanceof Request) {
      const absoluteUrl = new URL(input.url, window.location.origin);
      if (shouldRewriteNativeRequest(absoluteUrl)) {
        request = new Request(
          joinOriginAndPath(getPublicAppOrigin(), `${absoluteUrl.pathname}${absoluteUrl.search}`),
          input,
        );
      }
    }

    return nativeFetch(request as RequestInfo, init);
  };

  windowWithFlag.__agentezapNativeFetchBridgeInstalled = true;
}

export async function initializeNativeAppShell() {
  if (!isNativeApp()) return;

  try {
    const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
    ]);

    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0b1220" });
    await StatusBar.setOverlaysWebView({ overlay: false });
    await SplashScreen.hide();
  } catch (error) {
    console.warn("[native-runtime] Falha ao inicializar shell nativo", error);
  }
}
