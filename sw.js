// Service worker v3 - minimal caching to allow auth redirects
const CACHE = 'verdiqt-v9';
const CONTENT_URL = 'https://raw.githubusercontent.com/badenhorstcasper-ops/verdiqt-content/main/verdiqt-content.json';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Don't intercept navigation requests - let auth redirects work
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'api.anthropic.com') return;
});
