const CACHE_NAME = "stikmania-motor-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// INSTALACIÓN: Cachea shell de la app
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn("Algunos assets no cachearon:", err);
        return cache.add("./index.html");
      });
    })
  );
  self.skipWaiting();
});

// ACTIVACIÓN: Limpia caches viejos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// FETCH: Network-first para HTML, cache-first para assets
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Para navegación HTML: siempre intenta red primero, fallback a cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Para assets (imágenes, CSS, JS): cache-first, fallback a red
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});

// Mensaje desde la app para forzar actualización
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});