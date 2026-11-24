/* sw.js - offline play. Caches every game file on install, then serves them
 * from the cache. Bump VERSION whenever any cached file changes, so phones
 * pick up the new version (it applies on the next launch). */
'use strict';

var VERSION = 'bella-next-3';
var FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/art.js',
  'js/art-town.js',
  'js/characters.js',
  'js/audio.js',
  'js/core.js',
  'js/backdrop.js',
  'js/scenes/title.js',
  'js/scenes/street.js',
  'js/scenes/stars.js',
  'assets/fonts/title.woff2',
  'assets/icons/favicon-16.png',
  'assets/icons/favicon-32.png',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

// Only delete our own old caches: the live game and the preview share one origin.
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k.indexOf('bella-next-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Cache first; fall back to the network (and to the start page when offline).
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(e.request).catch(function () {
      if (e.request.mode === 'navigate') return caches.match('./');
      return Response.error();
    });
  }));
});
