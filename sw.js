/* MyDeck Service Worker — cache-first para assets estáticos, network-first para dados */
const CACHE = 'mydeck-v1';
const STATIC = ['./', './index.html', './style.css', './app.js', './fichario_patch.js', './ev_calculator.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Supabase e APIs: sempre rede (dados frescos)
  if (/supabase|tcgdex|frankfurter/.test(url.hostname)) return;

  // Imagens de cartas: cache-first (imutáveis)
  if (/scrydex|pokemontcg\.io|pkmncards/.test(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit ||
        fetch(e.request).then(r => {
          if (r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); }
          return r;
        })
      )
    );
    return;
  }

  // Assets próprios: network-first com fallback ao cache (funciona offline)
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(r => {
        if (r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); }
        return r;
      }).catch(() => caches.match(e.request))
    );
  }
});
