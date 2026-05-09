const PWA_VERSION = "build-1778349371381";
const SHELL_CACHE = "agentezap-shell-build-1778349371381";
const STATIC_ASSETS = [
  "/",
  "/site.webmanifest?v=build-1778349371381",
  "/favicon.png?v=build-1778349371381",
  "/favicon.svg?v=build-1778349371381",
  "/pwa-192.png?v=build-1778349371381",
  "/pwa-512.png?v=build-1778349371381",
  "/pwa-badge.png?v=build-1778349371381",
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
    icon: "/pwa-192.png?v=build-1778349371381",
    badge: "/pwa-badge.png?v=build-1778349371381",
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
