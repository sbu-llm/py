/* Service Worker for Python Runner
   - Caches Pyodide + packages for offline + fast reload
   - Sets COOP/COEP headers so SharedArrayBuffer works (required by Pyodide)
*/

const CACHE = 'python-runner-v1';

const ASSETS = [
  './',
  './index.html',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(
        ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('SW: skip', url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === location.origin;
  const isJsdelivr = url.hostname === 'cdn.jsdelivr.net';
  if (!isSameOrigin && !isJsdelivr) return;

  const isHeavy =
    /\.(wasm|whl|zip|js|css|json|data)$/i.test(url.pathname) ||
    url.pathname.includes('/pyodide/');

  if (isHeavy) {
    event.respondWith(
      caches.match(req).then(hit => {
        if (hit) return withHeaders(hit);
        return fetch(req).then(res => {
          if (res && res.status === 200){
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return withHeaders(res);
        });
      })
    );
  } else {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200 && res.type === 'basic'){
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return withHeaders(res);
        })
        .catch(() => caches.match(req).then(hit => hit ? withHeaders(hit) : hit))
    );
  }
});

/* Inject COOP/COEP headers on every response so Pyodide can use
   SharedArrayBuffer. Without this, input() and some packages break. */
function withHeaders(response){
  if (!response) return response;
  try {
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
}
