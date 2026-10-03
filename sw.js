/* MyDeck Service Worker — cache-first para assets estaticos, network-first para dados */
// v3 (09/07/2026): fetch() por padrao respeita o cache HTTP do navegador -- mesmo
// em modo "network-first" ele podia devolver uma resposta antiga do disk cache
// sem nunca ir na rede de verdade. Isso deixou o fichario/app.js presos numa
// versao velha por dias mesmo depois de pushes corrigindo bugs (ver feedback_coding).
// Fix: {cache:'no-store'} forca ida real a rede pros assets proprios.
// Bump de versao (v2 para v3) tambem limpa o cache antigo de quem ja tinha instalado o SW.
// v4 (18/08/2026): bump por causa da troca large->small/medium nas imagens de
// carta (home + fichario + impressao) -- forca quem ja tinha SW instalado a
// pegar a versao nova do app.js/fichario_patch.js em vez de servir a versao
// antiga (que ainda pedia /large em varios lugares) do cache local.
// v5 (01/10/2026): mesmo motivo de sempre -- usuario com SW ja instalado de
// antes ficou preso numa versao velha do fichario_patch.js/app.js (fichario
// JP/CN do cel30 clicava mas continuava mostrando os dados do cel30 em
// ingles/portugues, com a imagem tentando a pasta errada no CDN). Hard
// refresh normal nao forca o browser a trocar um Service Worker ja ativo —
// só o bump de CACHE (que muda o conteudo do proprio sw.js) faz o browser
// perceber a atualização, instalar a nova versao e limpar o cache antigo
// (activate acima já faz isso). Ver [[feedback_coding]].
const CACHE = 'mydeck-v5';
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
      // 03/10/2026: 'no-store' -> 'no-cache'. no-store ignorava o cache do navegador de vez: toda visita
      // rebaixava ~550 KB (53 scripts + CSS + HTML) mesmo sem nada ter mudado. no-cache REVALIDA com o
      // servidor (ETag -> 304, sem corpo) a cada carga: continua sempre fresco (nunca serve versão
      // velha, o bug que o no-store resolveu) e só rebaixa o que mudou.
      fetch(e.request, { cache: 'no-cache' }).then(r => {
        // 03/10/2026: só o HTML (navegação) vai pro Cache Storage, como fallback offline. Antes TODO
        // arquivo same-origin era gravado ali (53 scripts + CSS a cada visita): medido em produção, a
        // carga com o SW no controle terminava escalonada (~58 ms por arquivo, DCL ≈ 3,6 s) enquanto
        // sem o SW, com o cache HTTP morno, o DCL era ≈ 0,16 s. JS/CSS seguem revalidados (no-cache)
        // e o cache HTTP do navegador guarda o corpo (304 = sem rebaixar).
        if (r.ok && e.request.mode === 'navigate') { const cl = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); }
        return r;
      }).catch(() => caches.match(e.request))
    );
  }
});

// ── PUSH (02/10/2026) — avisos do leilao com o app fechado ─────────────
// Sem bump de CACHE de proposito: o navegador troca o SW sozinho quando os
// bytes deste arquivo mudam (install -> skipWaiting -> claim), e bump faria o
// activate acima apagar o cache de imagens de carta de todo mundo sem
// necessidade. Payload vem da Edge Function notify-dispatch:
// {id, title, body, url, auctionId, tag}.
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (_) { data = { body: e.data ? e.data.text() : '' }; }

  e.waitUntil((async () => {
    // App aberto e em foco: o aviso ao vivo do proprio app (notificacoes.js)
    // ja cobre — mostrar tambem na bandeja do sistema seria duplicado. O
    // Chrome aceita nao mostrar quando ha uma janela visivel e focada.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible' && w.focused)) return;

    await self.registration.showNotification(data.title || 'MyDeck', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      // mesmo tag por leilao: "coberto" e depois "encerrado" substituem o
      // aviso anterior na bandeja em vez de empilhar; renotify avisa de novo
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || '/', notificationId: data.id || null, auctionId: data.auctionId || null },
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  const target = new URL(d.url || '/', self.location.origin).href;

  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find(w => new URL(w.url).origin === self.location.origin);
    if (open) {
      // App ja aberto (aba em segundo plano): traz pra frente e pede pra
      // abrir o leilao sem recarregar (notificacoes.js escuta a mensagem).
      await open.focus();
      open.postMessage({ type: 'notif-click', auctionId: d.auctionId, notificationId: d.notificationId, url: target });
      return;
    }
    // App fechado: o link ?leilao=<id> ja e tratado na abertura (leilao.js)
    await self.clients.openWindow(target);
  })());
});
