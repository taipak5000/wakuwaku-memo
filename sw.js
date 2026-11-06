// オフライン対応（stale-while-revalidate）
// キャッシュがあれば即座に返し、裏でネットワークから最新版を取ってキャッシュを更新する。
// そのため、サイトを更新しても CACHE_NAME を変える必要はない（一度開けば次回から最新になる）。

const CACHE_NAME = 'wakuwaku-memo';

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 名前の違う古いキャッシュが残っていれば消す
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 同一オリジンのみ対象

  event.respondWith((async () => {
    const cached = await caches.match(req);
    const revalidate = (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return cached; // オフライン等はキャッシュへフォールバック
      }
    })();
    if (cached) {
      event.waitUntil(revalidate); // 裏側の更新はレスポンスを待たせず継続させる
      return cached;
    }
    return revalidate; // キャッシュが無い初回はネットワークの完了を待つ
  })());
});
