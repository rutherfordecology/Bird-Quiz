// WhatDatBird? Service Worker
// Provides an offline fallback page so the app doesn't show a blank screen with no internet.

const CACHE_NAME = 'whatdatbird-v1';
const OFFLINE_URL = '/WhatDatBird/offline.html';

// Cache the offline page on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll([OFFLINE_URL]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  // Only handle navigation requests (page loads) — let all API/image fetches go through normally
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
  }
});
