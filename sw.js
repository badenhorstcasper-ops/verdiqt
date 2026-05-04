const CACHE = 'verdiqt-v1';
const CONTENT_URL = 'https://raw.githubusercontent.com/badenhorstcasper-ops/verdiqt-content/main/verdiqt-content.json';

const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/src/css/app.css',
  '/src/js/app.js',
  '/src/js/db.js',
  '/src/js/router.js',
  '/src/js/modules/cases.js',
  '/src/js/modules/clients.js',
  '/src/js/modules/charges.js',
  '/src/js/modules/hearing.js',
  '/src/js/modules/decision.js',
  '/src/js/modules/findings.js',
  '/src/js/modules/documents.js',
  '/src/js/modules/ccma.js',
  '/src/js/modules/invoice.js',
  '/src/js/modules/ai.js',
  '/src/js/modules/settings.js',
  '/src/js/content.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname === 'api.anthropic.com' || url.hostname === 'api.openai.com') {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        if (e.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'CHECK_UPDATE') checkForUpdate(e.source);
  if (e.data === 'INSTALL_UPDATE') installUpdate(e.source);
});

async function checkForUpdate(client) {
  try {
    const res = await fetch(CONTENT_URL + '?t=' + Date.now());
    const remote = await res.json();
    const cache = await caches.open(CACHE);
    const cached = await cache.match('/src/js/content.js');
    const local = cached ? await cached.text() : '';
    const localVersion = (local.match(/"version":"([^"]+)"/) || [])[1] || '0.0.0';
    client.postMessage({ type: 'UPDATE_STATUS', hasUpdate: remote.version !== localVersion, remote });
  } catch {
    client.postMessage({ type: 'UPDATE_STATUS', hasUpdate: false });
  }
}

async function installUpdate(client) {
  try {
    const res = await fetch(CONTENT_URL + '?t=' + Date.now());
    const json = await res.json();
    const cache = await caches.open(CACHE);
    const blob = new Blob([`export const CONTENT = ${JSON.stringify(json)};`], { type: 'application/javascript' });
    await cache.put('/src/js/content.js', new Response(blob));
    client.postMessage({ type: 'UPDATE_COMPLETE', version: json.version });
  } catch (err) {
    client.postMessage({ type: 'UPDATE_ERROR', error: err.message });
  }
}
