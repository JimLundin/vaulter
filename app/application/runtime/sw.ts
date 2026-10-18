// The service worker: the app itself offline (the notes are offline already, in IndexedDB). Hashed
// assets are cache-first; the page and secrets.json are network-first, so a deploy or a re-seal shows
// as soon as there is a network. Each build has its own cache, and activating it drops the old ones.
/// <reference lib="webworker" />
declare const __BUILD__: string;

const sw = globalThis as unknown as ServiceWorkerGlobalScope;
const CACHE = `app-${__BUILD__}`;

sw.addEventListener('install', () => {
  sw.skipWaiting();
});
sw.addEventListener('activate', (e: ExtendableEvent) =>
  e.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys()).filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await sw.clients.claim();
    })(),
  ),
);

// Only the app's own files: its assets, the page, and the sealed secrets. Anything else (GitHub, OpenAI,
// map tiles, or any other path on this origin) goes straight to the network, never to a cache.
const scope = new URL(sw.registration.scope).pathname;
sw.addEventListener('fetch', (e: FetchEvent) => {
  const url = new URL(e.request.url);
  if (
    e.request.method !== 'GET' ||
    url.origin !== sw.location.origin ||
    !url.pathname.startsWith(scope)
  )
    return;
  const path = url.pathname.slice(scope.length);
  if (path.startsWith('assets/')) e.respondWith(cacheFirst(e.request));
  else if (
    e.request.mode === 'navigate' ||
    path === '' ||
    path === 'index.html' ||
    path === 'secrets.json'
  )
    e.respondWith(networkFirst(e.request));
});

async function cacheFirst(req: Request) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req: Request) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit =
      (await caches.match(req, { ignoreSearch: true })) ??
      (req.mode === 'navigate'
        ? await caches.match(new URL('./', sw.location.href).href)
        : undefined);
    if (hit) return hit;
    throw err;
  }
}
