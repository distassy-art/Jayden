/*
 * Service worker — just enough to make the app installable and to keep the
 * shell opening when the phone drops signal.
 *
 * It never caches API or data responses: those are the live books and the crew
 * clock, and they must always be fresh. It is network-first for everything, so
 * an online device always sees the latest deploy; only when the network is gone
 * does it fall back to a cached copy of the static shell. Precaching the shell
 * on install is what lets the browser offer "Install app" on Android/Chrome.
 */

const VERSION = "ssai-app-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/app.js",
  "./assets/base.css",
  "./assets/auth.css",
  "./assets/site.css",
  "./assets/app-mobile.css",
  "./assets/logo-mark.png",
  "./assets/logo-wordmark-dark.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin through untouched
  if (url.pathname.includes("/api/")) return; // never cache live data or the clock

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("./"))),
  );
});
