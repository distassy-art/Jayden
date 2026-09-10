/*
 * Service worker for the bundled Smart Time Clock app.
 *
 * Lifted from the old Core app's worker and rescoped to this app's own folder
 * so it never touches the console at the site root. Two jobs:
 *   1. Show break/meal/clock-out reminders the page posts to it, so a reminder
 *      still pops when the app is in the background — the CA rest and meal
 *      prompts the clock schedules.
 *   2. Cache the app shell so it opens offline at the store.
 */
var CACHE = "ss-timeclock-v1";
var SHELL = [
  "./",
  "core.html",
  "core.css",
  "core.js",
  "core-store.js",
  "smart-time-clock.webmanifest",
  "../assets/logo-mark.png",
  "../assets/logo-wordmark-dark.png",
  "../assets/icon-192.png"
];

self.addEventListener("install", function (ev) {
  ev.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () {
      return self.skipWaiting();
    }).catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache live data feeds — the timesheet must reflect real punches.
  if (url.pathname.indexOf("/data/") !== -1 || url.pathname.indexOf("/api/") !== -1) return;
  ev.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match("core.html"); });
    })
  );
});

self.addEventListener("message", function (ev) {
  var data = ev.data || {};
  if (data.type === "remind" && self.registration && self.registration.showNotification) {
    self.registration.showNotification(data.title || "Smart Time Clock", {
      body: data.body || "Break reminder.",
      icon: "../assets/icon-192.png",
      badge: "../assets/logo-mark.png",
      tag: "ss-timeclock-remind"
    });
  }
});

self.addEventListener("notificationclick", function (ev) {
  ev.notification.close();
  ev.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf("core.html") !== -1 || list[i].url.indexOf("/legacy/") !== -1) {
        return list[i].focus();
      }
    }
    if (clients.openWindow) return clients.openWindow("core.html");
  }));
});
