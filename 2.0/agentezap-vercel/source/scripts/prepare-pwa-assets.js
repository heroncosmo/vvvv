import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { buildVersionedAsset, resolvePwaVersion } from "./pwa-version.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const publicDir = path.resolve(repoRoot, "client", "public");

function createManifest(version) {
  const icon192 = buildVersionedAsset("/pwa-192.png", version);
  const icon512 = buildVersionedAsset("/pwa-512.png", version);
  const faviconSvg = buildVersionedAsset("/favicon.svg", version);

  return {
    name: "AgenteZap",
    short_name: "AgenteZap",
    description: "AgenteZap: CRM, atendimento e IA para WhatsApp em modo app.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0b1220",
    theme_color: "#0f766e",
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: faviconSvg, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      {
        name: "Conversas",
        short_name: "Conversas",
        description: "Abrir a caixa de entrada",
        url: "/conversas",
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Administrador",
        short_name: "Admin",
        description: "Abrir o painel administrativo",
        url: "/administrador",
        icons: [{ src: icon192, sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}

function createServiceWorker(version) {
  const manifestUrl = buildVersionedAsset("/site.webmanifest", version);
  const faviconPngUrl = buildVersionedAsset("/favicon.png", version);
  const faviconSvgUrl = buildVersionedAsset("/favicon.svg", version);
  const icon192Url = buildVersionedAsset("/pwa-192.png", version);
  const icon512Url = buildVersionedAsset("/pwa-512.png", version);
  const badgeUrl = buildVersionedAsset("/pwa-badge.png", version);

  return `const PWA_VERSION = ${JSON.stringify(version)};
const SHELL_CACHE = ${JSON.stringify(`agentezap-shell-${version}`)};
const STATIC_ASSETS = [
  "/",
  ${JSON.stringify(manifestUrl)},
  ${JSON.stringify(faviconPngUrl)},
  ${JSON.stringify(faviconSvgUrl)},
  ${JSON.stringify(icon192Url)},
  ${JSON.stringify(icon512Url)},
  ${JSON.stringify(badgeUrl)},
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE) {
            return caches.delete(key);
          }
          return Promise.resolve();
        }),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function createOfflineShellResponse() {
  return new Response(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AgenteZap</title></head><body><div style="font-family:system-ui;padding:24px">Conexao instavel. Recarregue a pagina em alguns segundos.</div></body></html>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function createNetworkErrorResponse() {
  return Response.error();
}

function isRouteLikeRequest(request, url) {
  const lastSegment = url.pathname.split("/").pop() || "";
  return (
    request.mode === "navigate" ||
    request.destination === "document" ||
    (url.origin === self.location.origin && request.destination === "" && !lastSegment.includes("."))
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname === "/ws" || url.pathname.startsWith("/api/")) {
    return;
  }

  const isBuildAssetRequest =
    url.pathname.startsWith("/assets/");

  if (isBuildAssetRequest) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .catch(async () => (await caches.match(request)) || createNetworkErrorResponse()),
    );
    return;
  }

  const isDocument = request.mode === "navigate";
  if (isDocument) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const cloned = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", cloned));
          return response;
        })
        .catch(async () => (await caches.match("/")) || createOfflineShellResponse()),
    );
    return;
  }

  const isVersionInfoRequest =
    url.pathname === "/pwa-version.json";

  if (isVersionInfoRequest) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  const isVersionedPwaAsset =
    url.searchParams.get("v") === PWA_VERSION &&
    (
      url.pathname === "/site.webmanifest" ||
      url.pathname === "/favicon.png" ||
      url.pathname === "/favicon.svg" ||
      url.pathname === "/pwa-192.png" ||
      url.pathname === "/pwa-512.png" ||
      url.pathname === "/pwa-badge.png"
    );

  if (isVersionedPwaAsset) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || createNetworkErrorResponse()),
    );
    return;
  }

  if (isRouteLikeRequest(request, url)) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => createNetworkErrorResponse()));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const cloned = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || createNetworkErrorResponse()),
  );
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "AgenteZap",
    body: "Voce recebeu uma nova atualizacao.",
    url: "/",
    tag: "agentezap-push",
    icon: ${JSON.stringify(icon192Url)},
    badge: ${JSON.stringify(badgeUrl)},
    data: {},
    renotify: false,
    requireInteraction: false,
    vibrate: [180, 80, 180],
    timestamp: Date.now(),
  };

  let payload = fallback;
  try {
    if (event.data) {
      payload = { ...fallback, ...event.data.json() };
    }
  } catch {
    payload = fallback;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: payload.icon,
      badge: payload.badge,
      data: {
        url: payload.url,
        ...(payload.data || {}),
      },
      renotify: Boolean(payload.renotify),
      requireInteraction: Boolean(payload.requireInteraction),
      vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : undefined,
      timestamp: typeof payload.timestamp === "number" ? payload.timestamp : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => client.url.includes(self.location.origin));
      if (matchingClient) {
        matchingClient.focus();
        matchingClient.navigate(targetUrl);
        return matchingClient;
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
`;
}

export async function preparePwaAssets(mode = process.env.NODE_ENV === "development" ? "development" : "production") {
  const version = resolvePwaVersion(mode);
  const manifest = createManifest(version);
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const serviceWorkerContent = createServiceWorker(version);
  const versionInfoContent = `${JSON.stringify(
    {
      version,
      generatedAt: new Date().toISOString(),
      mode,
    },
    null,
    2,
  )}\n`;

  await fs.writeFile(path.resolve(publicDir, "site.webmanifest"), manifestContent, "utf8");
  await fs.writeFile(path.resolve(publicDir, "sw.js"), serviceWorkerContent, "utf8");
  await fs.writeFile(path.resolve(publicDir, "pwa-version.json"), versionInfoContent, "utf8");

  return version;
}

if (process.argv[1] === __filename) {
  const mode = process.env.NODE_ENV === "development" ? "development" : "production";

  preparePwaAssets(mode)
    .then((version) => {
      console.log(`[PWA] Assets preparados com versao ${version}`);
    })
    .catch((error) => {
      console.error("[PWA] Falha ao preparar assets:", error);
      process.exitCode = 1;
    });
}
