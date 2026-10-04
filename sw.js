/* 记账本 · Service Worker
   把页面本体缓存下来，飞机上 / 没信号的地方也能打开记账。
   改了 index.html / style.css / app.js 之后，记得把下面的 VERSION 加一，
   否则手机上还会用旧的缓存。 */
const VERSION = 'kakeibo-v6';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (x) { return; }

  // 同步用的请求一律走网络，不缓存：
  // GitHub API、局域网服务器的 /api/*
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') >= 0) return;

  // 网页本体（html / js / css）：有网就拿最新的，没网才用缓存。
  // 以前是反过来的「缓存优先」，结果传了新版手机还在跑旧的，很难刷掉。
  if (/\.(?:html|js|css)$|\/$/.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await fetch(new Request(req.url, { cache:'no-store', credentials:'same-origin' }));
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        return hit || (await cache.match('./index.html')) ||
          new Response('离线，且没有缓存。请联网打开一次。', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  // 图标之类不会变的东西：缓存优先就够了
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 503 });
    }
  })());
});
