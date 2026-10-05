// The service worker: the kernel's own files offline (ARCHITECTURE.md, "Offline"). Hashed assets never
// change, so they come from the cache first; pages come from the network, and from the cache when there
// is none. Every extension is an asset of the page.
/// <reference lib="webworker" />
const sw = globalThis as unknown as ServiceWorkerGlobalScope;

const CACHE = 'vaulter-kernel-1';

const fetchAndKeep = async (cache: Cache, req: Request) => {
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
};

sw.addEventListener('install', () => void sw.skipWaiting());
sw.addEventListener('activate', (e) => e.waitUntil(sw.clients.claim()));
sw.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      if (url.pathname.includes('/assets/'))
        return (await cache.match(req)) ?? fetchAndKeep(cache, req);
      try {
        return await fetchAndKeep(cache, req);
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) ?? Response.error();
      }
    }),
  );
});
