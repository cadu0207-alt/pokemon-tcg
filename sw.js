/* MyDeck Service Worker — cache-first para assets estaticos, network-first para dados */
// v3 (09/07/2026): fetch() por padrao respeita o cache HTTP do navegador -- mesmo
// em modo "network-first" ele podia devolver uma resposta antiga do disk cache
// sem nunca ir na rede de verdade. Isso deixou o fichario/app.js presos numa
// versao velha por dias mesmo depois de pushes corrigindo bugs (ver feedback_coding).
// Fix: {cache:'no-store'} forca ida real a rede pros assets proprios.
// Bump de versao (v2 para v3) tambem limpa o cache antigo de quem ja tinha instalado o SW.
const CACHE = 'mydeck-v3';
const STATIC = ['./', './index.html', './style.css', './app.js', './fichario_patch.js', './ev_calculator.js',
  './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

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

  if (/supabase|tcgdex|frankfurter/.test(url.hostname)) return;

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

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(r => {
        if (r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); }
        return r;
      }).catch(() => caches.match(e.request))
    );
  }
});
