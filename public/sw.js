/*
 * Cutout Studio service worker.
 *
 * - App shell: network-first (fresh HTML) with a cached fallback, so the app
 *   opens offline.
 * - Build assets and icons: cache-first, immutable thanks to content hashes.
 * - /imgly/*: cached on demand (the AI model + WASM shards are large and only
 *   useful once downloaded), which makes background removal work offline.
 * - /api/*: never cached; HEIC/TIFF decoding and AVIF encoding need the server.
 */

const SHELL_CACHE = "cutout-shell";
const ASSET_CACHE = "cutout-assets";
const MODEL_CACHE = "cutout-models";
const KEEP = new Set([SHELL_CACHE, ASSET_CACHE, MODEL_CACHE]);

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("cutout-") && !KEEP.has(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function put(cache, request, response) {
  if (!response.ok) return;
  try {
    await cache.put(request, response.clone());
  } catch {
    /* quota exceeded or opaque response — serve it anyway */
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await put(cache, request, response);
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      await put(cache, request, response);
      return response;
    })
    .catch(() => null);
  return cached ?? (await network) ?? Response.error();
}

async function navigate(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    await put(cache, request, response);
    return response;
  } catch {
    const cached = (await cache.match(request)) ?? (await cache.match("/"));
    if (cached) return cached;
    return new Response(
      "<!doctype html><html><head><meta charset=utf-8><title>Offline</title></head>" +
        "<body style=\"font-family:system-ui;background:#09090b;color:#ececf2;display:grid;place-items:center;height:100vh;margin:0\">" +
        "<p>Cutout Studio is offline and no cached copy is available yet. Reconnect and reload.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/imgly/")) {
    event.respondWith(cacheFirst(request, MODEL_CACHE));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});
