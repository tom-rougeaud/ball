// Abel Run — service worker (v2.9.2)
// Nom du cache = "abelrun-v" + version du jeu (cfg.version de index.html, points remplacés par des tirets).
// À CHAQUE nouvelle version : changer ce nom ET la version dans index.html.
var CACHE = "abelrun-v3-0-1";
var ASSETS = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

// Installation : tous les fichiers sont relus sur le réseau en contournant le cache HTTP du navigateur
// (GitHub Pages en garde une copie ≈ 10 min). Tout ou rien : si un fichier manque, l’ancienne version reste en place.
self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) {
        return fetch(new Request(u, { cache: "reload" })).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status + " : " + u);
          return c.put(u, r);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

// Activation : on supprime les anciens caches et on prend la main sur les pages ouvertes.
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("message", function (e) {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

// Réseau d’abord (toujours la dernière version publiée, sans cache HTTP), cache en secours hors connexion ou si le réseau tarde plus de 4 s.
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || /sw\.js$/.test(url.pathname)) return;
  e.respondWith(new Promise(function (resolve) {
    var done = false, finish = function (r) { if (!done && r) { done = true; resolve(r); } };
    var fromCache = function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("index.html"); });
    };
    var timer = setTimeout(function () { fromCache().then(finish); }, 4000);
    fetch(new Request(req.url, { cache: "no-store", credentials: "same-origin" })).then(function (r) {
      clearTimeout(timer);
      if (r && r.ok && !url.search) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {}); }
      finish(r);
    }, function () {
      clearTimeout(timer);
      fromCache().then(function (hit) { if (hit) finish(hit); else { done = true; resolve(Response.error()); } });
    });
  }));
});
