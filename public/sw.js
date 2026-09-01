/*
 * Aurelia service worker — app-shell caching only.
 *
 * SAFETY FIRST. This shop records money, so the service worker must never make
 * a financial action *appear* to succeed while offline. It therefore:
 *   • never caches API responses, auth, or any Supabase traffic
 *   • never intercepts non-GET requests
 *   • uses network-first for navigations (so data is always fresh online)
 *     and only falls back to a clearly-labelled offline page when truly offline
 *   • uses cache-first only for static, versioned build assets and icons
 */

const VERSION = "aurelia-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isSupabase(url) {
  return url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.in");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch GET. Sales, purchases, auth — anything that mutates — is
  // left entirely to the network.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache cross-origin API/auth/data traffic.
  if (url.origin !== self.location.origin) return;
  if (isSupabase(url)) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth")) return;

  // Navigations: network-first, offline fallback to a labelled page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html").then((r) => r ?? Response.error())),
    );
    return;
  }

  // Static build assets & icons: cache-first (they are content-hashed).
  const isAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|webp|avif|svg)$/.test(url.pathname);

  if (isAsset) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return cached ?? Response.error();
        }
      }),
    );
  }
});

// Let the page trigger an immediate update after a new deploy.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
