"use strict";
var CACHE = "jlpt-n2-v18";
var FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./sw.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./data/combos.js",
  "./data/reading.js",
  "./data/listening.js",
  "./data/mock.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(FILES); }));
  self.skipWaiting();
});

/* Asset cache only. Never touch localStorage or IndexedDB progress. */
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var sameOrigin = new URL(req.url).origin === self.location.origin;
  /* Never touch GitHub sync calls or any other site: let the browser handle them directly. */
  if (!sameOrigin) return;
  /* Network first so a new app.js is picked up right away; cache is only the offline fallback. */
  event.respondWith(
    fetch(req, { cache: "no-cache" }).then(function (res) {
      if (res && res.ok && sameOrigin) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match("./index.html"); });
    })
  );
});
