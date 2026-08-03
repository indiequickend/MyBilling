// Minimal, hand-rolled service worker. Scope is deliberately narrow: make the
// installed app feel instant and provide an offline fallback page. It does NOT
// cache API responses, page data, or Next's hashed build chunks (those change
// every deploy and are already served with long-lived immutable HTTP cache
// headers by Next itself) — there is no offline read/write support here, by
// design (see build_phases.md Phase 15 / project_spec.md: no background sync,
// no client-side write queue).
const CACHE_VERSION = "v1";
const CACHE_NAME = `mybilling-shell-${CACHE_VERSION}`;

// Only stable, non-hashed, non-authenticated static assets belong here.
const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: always prefer the network (session/auth state must be
  // checked live); only fall back to the cached offline page if the network
  // is unreachable.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  // The small static shell list: cache-first for instant loads.
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
