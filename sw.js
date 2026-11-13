// Abel Run — service worker (v2.9.2)
// Nom du cache = "abelrun-v" + version du jeu (cfg.version de index.html, points remplacés par des tirets).
// À CHAQUE nouvelle version : changer ce nom ET la version dans index.html.
var CACHE = "abelrun-v3-50";
// Musique du Paradis : cache à part, jamais effacé lors d’une mise à jour (le fichier porte un numéro dans son nom : paradis-1.mp3).
var MUSIC = "abelrun-musique";
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
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== MUSIC; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("message", function (e) {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

// Réseau d’abord (toujours la dernière version publiée, sans cache HTTP), cache en secours hors connexion ou si le réseau tarde plus de 4 s.
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || /sw\.js$/.test(url.pathname)) return;
  if (/(paradis|intro)-\d+\.mp3$/.test(url.pathname)) { e.respondWith(musique(req)); return; }
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


// Musique : si le fichier est déjà en cache, on le sert (avec les tranches « Range » que les lecteurs audio réclament, surtout Safari) ;
// sinon réseau direct, et une demande complète (sans Range) est gardée en cache pour jouer hors connexion.
function musique(req) {
  return caches.open(MUSIC).then(function (c) {
    return c.match(req.url).then(function (hit) {
      var rg = req.headers.get("range");
      if (hit) {
        if (!rg) return hit;
        return hit.arrayBuffer().then(function (buf) {
          var n = buf.byteLength, m = /bytes=(\d*)-(\d*)/.exec(rg), s = 0, en = n - 1;
          if (m && m[1]) { s = parseInt(m[1], 10); if (m[2]) en = parseInt(m[2], 10); }
          else if (m && m[2]) { s = Math.max(0, n - parseInt(m[2], 10)); }
          en = Math.min(en, n - 1);
          if (s > en) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + n } });
          return new Response(buf.slice(s, en + 1), { status: 206, statusText: "Partial Content", headers: {
            "Content-Type": "audio/mpeg", "Content-Length": String(en - s + 1),
            "Content-Range": "bytes " + s + "-" + en + "/" + n, "Accept-Ranges": "bytes" } });
        });
      }
      if (rg) return fetch(req);
      return fetch(req).then(function (r) {
        if (r && r.status === 200) c.put(req.url, r.clone()).catch(function () {});
        return r;
      });
    });
  });
}
