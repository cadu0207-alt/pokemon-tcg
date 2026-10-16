// ================================================================
// MyDeck — Loja Toybox · banners automáticos (mk_banners.js) — 16/10/2026
//
// Nenhum banner é cadastrado à mão: tudo se monta sozinho com os produtos ATIVOS e COM ESTOQUE da loja
// (os mesmos que o lojista publica no painel). Cadastrou produto → ele aparece; acabou o estoque ou
// pausou → some; nenhum produto → nenhum banner (a loja vazia não é anunciada).
//   • faixa fina no topo (todas as abas, fechável; volta quando chega novidade)
//   • banner grande + 4 produtos no Início
//   • cartão no Fichário quando a coleção aberta tem produto da loja ("faltam cartas?")
//   • cartão no Leilão ("não levou o lote?")
//   • selo NOVO no menu (desktop e celular) enquanto houver novidade da última semana
// Carrega depois de mk_core.js. Uma consulta leve e pública (cache de 5 min); sem login.
// Os produtos "novos" vêm do carimbo published_at (banco: mk_banners_auto_16out2026.sql).
// ================================================================

const MK_PROMO_TTL = 5 * 60 * 1000;
const MK_STRIP_KEY = 'mk_strip_dismissed';
const mkPromo = { loaded: false, loading: false, at: 0, seller: null, items: [], newCount: 0 };

async function mkPromoLoad(force) {
  if (mkPromo.loading || typeof sbClient === 'undefined' || !sbClient) return;
  if (!force && mkPromo.loaded && Date.now() - mkPromo.at < MK_PROMO_TTL) return;
  mkPromo.loading = true;
  try {
    const { data: seller } = await sbClient.from('mk_sellers')
      .select('id,slug,name,city,uf,logo_url,whatsapp,promo_title,promo_text,status').eq('slug', MK_SLUG).maybeSingle();
    let items = [];
    if (seller && seller.status === 'ativa') {
      const { data, error } = await sbClient.from('mk_products')
        .select('id,kind,title,price,compare_at_price,featured,published_at,set_id,card_n,low_stock_alert,images:mk_product_images(url,position),stock:mk_stock(qty_available)')
        .eq('seller_id', seller.id).eq('status', 'ativo').order('published_at', { ascending: false }).limit(80);
      if (error) throw error;
      items = (data || []).map(function (p) {
        if (Array.isArray(p.stock)) p.stock = p.stock[0] || null;
        p.images = (p.images || []).sort(function (a, b) { return a.position - b.position; });
        return p;
      }).filter(function (p) { return mkQty(p) > 0; });
      items.sort(function (a, b) {
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0);
      });
    }
    mkPromo.seller = seller || null; mkPromo.items = items;
    mkPromo.newCount = items.filter(mkIsNew).length;
    mkPromo.loaded = true; mkPromo.at = Date.now();
  } catch (e) {
    console.warn('[mk] banners: sem dados', e);
    mkPromo.items = []; mkPromo.newCount = 0;
  } finally {
    mkPromo.loading = false;
  }
  mkBannersRender();
}

function mkPromoActive() { return !!(mkPromo.seller && mkPromo.items.length); }
function mkItemById(id) { return mkPromo.items.find(function (p) { return p.id === id; }); }

// leva pra loja já com o produto aberto
async function mkGoProduct(id) {
  goToTab('mk');
  await mkLoadAll(false);
  mk.view = 'store'; mkRenderStore();
  mkOpenProduct(id);
}
function mkGoStoreAll() { mk.filters.setId = null; mk.view = 'store'; goToTab('mk'); if (mk.loaded) mkRenderStore(); }
function mkGoStoreSet(setId) {
  mk.filters = { q: '', kind: 'todos', sort: 'recentes', onlyStock: true, setId: setId };
  mk.view = 'store';
  goToTab('mk');
  if (mk.loaded) mkRenderStore();
}
window.mkGoProduct = mkGoProduct; window.mkGoStoreAll = mkGoStoreAll; window.mkGoStoreSet = mkGoStoreSet;

function mkMiniCard(p) {
  const cover = mkSafeUrl(mkCover(p));
  return '<a href="#" class="mkb-mini" onclick="mkGoProduct(' + p.id + ');return false;">' +
    '<span class="mkb-mini-img">' + (cover ? '<img loading="lazy" src="' + mkEsc(cover) + '" alt="">' : (MK_KIND_ICON[p.kind] || '🧸')) +
      (mkIsNew(p) ? '<i class="mkb-new">NOVO</i>' : '') + '</span>' +
    '<span class="mkb-mini-t">' + mkEsc(p.title) + '</span>' +
    '<span class="mkb-mini-p">' + mkMoney(p.price) + '</span></a>';
}

// ── faixa fina no topo ──────────────────────────────────────────────
function mkStripDismissed(latest) {
  try {
    const d = JSON.parse(localStorage.getItem(MK_STRIP_KEY) || 'null');
    if (!d) return false;
    return d.latest === latest && Date.now() - d.t < 7 * 86400000;   // some por 7 dias, a menos que chegue novidade
  } catch (e) { return false; }
}
function mkStripClose() {
  const latest = mkPromo.items.length ? String(mkPromo.items[0].published_at || '') : '';
  const newest = mkPromo.items.reduce(function (m, p) { return Math.max(m, Date.parse(p.published_at || 0) || 0); }, 0);
  try { localStorage.setItem(MK_STRIP_KEY, JSON.stringify({ t: Date.now(), latest: newest ? new Date(newest).toISOString() : latest })); } catch (e) { /* sem storage */ }
  const el = document.getElementById('mk-strip'); if (el) el.remove();
}
window.mkStripClose = mkStripClose;

function mkStripRender() {
  const old = document.getElementById('mk-strip');
  const newest = mkPromo.items.reduce(function (m, p) { return Math.max(m, Date.parse(p.published_at || 0) || 0); }, 0);
  const latestIso = newest ? new Date(newest).toISOString() : '';
  const activePane = document.querySelector('.pane.active');
  const onStore = activePane && activePane.id === 'mk';
  const onInicio = activePane && activePane.id === 'inicio';   // no Início já existe o banner grande
  if (!mkPromoActive() || onStore || onInicio || mkStripDismissed(latestIso)) { if (old) old.remove(); return; }
  const first = mkPromo.items.find(mkIsNew) || mkPromo.items[0];
  const txt = mkPromo.newCount > 0
    ? '<b>' + mkPromo.newCount + ' novidade' + (mkPromo.newCount > 1 ? 's' : '') + ' na Toybox</b> · ' + mkEsc(first.title)
    : '<b>Toybox</b> · ' + mkPromo.items.length + ' produto' + (mkPromo.items.length > 1 ? 's' : '') + ' na loja parceira do MyDeck';
  const html = '<span class="mkb-strip-ic"></span><span class="mkb-strip-tx">' + txt + '</span>' +
    '<a href="#" class="mkb-strip-go" onclick="mkGoStoreAll();return false;">Ver a loja →</a>' +
    '<button type="button" class="mkb-strip-x" aria-label="Fechar aviso" onclick="mkStripClose()">✕</button>';
  if (old) { old.innerHTML = html; return; }
  const host = document.getElementById('pg-app');
  if (!host) return;
  const el = document.createElement('div');
  el.id = 'mk-strip'; el.className = 'mkb-strip'; el.innerHTML = html;
  const anchor = document.getElementById('feedback-bar-wrap') || host.querySelector('.stripe');
  if (anchor && anchor.parentNode === host) anchor.after(el); else host.prepend(el);
}

// ── Início ──────────────────────────────────────────────────────────
function mkHeroRender() {
  const slot = document.getElementById('mk-hero-slot');
  if (!slot) return;
  if (!mkPromoActive()) {
    // 17/10/2026: enquanto o catálogo não existe, a Início ainda apresenta a loja ("em breve") — some sozinho
    // quando o primeiro produto ativo com estoque aparecer (aí vale o banner normal abaixo).
    const t = mkPromo.seller;
    if (!t || t.status !== 'ativa') { slot.innerHTML = ''; return; }
    slot.innerHTML = '<section class="mkb-hero" aria-label="Loja parceira Toybox">' +
      '<div class="mkb-hero-tx"><span class="mkb-seal">Loja parceira</span>' +
        '<h3>Loja Toybox chegando ao MyDeck</h3>' +
        '<p>Cartas, selados e acessórios em 3D direto da Toybox' + ([t.city, t.uf].filter(Boolean).length ? ', de ' + mkEsc([t.city, t.uf].filter(Boolean).join(' ')) : '') + '. O catálogo está sendo montado.</p>' +
        '<div class="mkb-hero-cta"><a href="#" class="mkb-btn" onclick="mkGoStoreAll();return false;">Conhecer a loja →</a>' +
          '<span class="mkb-pill">Em breve</span></div></div>' +
      '<div class="mkb-hero-art" aria-hidden="true"></div>' +
      '</section>';
    return;
  }
  const s = mkPromo.seller;
  const title = s.promo_title || (mkPromo.newCount > 0 ? (mkPromo.newCount + ' novidade' + (mkPromo.newCount > 1 ? 's' : '') + ' na Toybox') : 'Loja Toybox no MyDeck');
  const text = s.promo_text || 'Pokémon TCG, acessórios em 3D e colecionáveis, direto de ' + [s.city, s.uf].filter(Boolean).join(' ') + '.';
  slot.innerHTML = '<section class="mkb-hero" aria-label="Loja parceira Toybox">' +
    '<div class="mkb-hero-tx"><span class="mkb-seal">Loja parceira</span>' +
      '<h3>' + mkEsc(title) + '</h3><p>' + mkEsc(text) + '</p>' +
      '<div class="mkb-hero-cta"><a href="#" class="mkb-btn" onclick="mkGoStoreAll();return false;">Ver a loja →</a>' +
        '<span class="mkb-pill">' + mkPromo.items.length + ' em estoque</span></div></div>' +
    '<div class="mkb-hero-art" aria-hidden="true"></div>' +
    '</section>' +
    '<div class="mkb-row" aria-label="Produtos da Toybox">' + mkPromo.items.slice(0, 4).map(mkMiniCard).join('') + '</div>';
}

// ── Fichário (coleção aberta) ───────────────────────────────────────
function mkFicRender() {
  let slot = document.getElementById('mk-fic-slot');
  const anchor = document.getElementById('fic-set-info');
  if (!anchor) return;
  if (!slot) { slot = document.createElement('div'); slot.id = 'mk-fic-slot'; anchor.parentNode.insertBefore(slot, anchor); }
  const setId = typeof currentSet !== 'undefined' ? currentSet : null;
  const hits = mkPromoActive() && setId ? mkPromo.items.filter(function (p) { return p.set_id === setId; }) : [];
  if (!hits.length) { slot.innerHTML = ''; return; }
  const label = (typeof SET_META !== 'undefined' && SET_META[setId] && SET_META[setId].label) ? SET_META[setId].label.replace(/^\S+\s/, '') : String(setId).toUpperCase();
  slot.innerHTML = '<div class="mkb-card"><span class="mkb-card-ic"></span><div class="mkb-card-tx"><b>Faltam cartas desta coleção?</b>' +
    '<span>A Toybox tem ' + hits.length + ' produto' + (hits.length > 1 ? 's' : '') + ' de ' + mkEsc(label) + ' em estoque.</span></div>' +
    '<a href="#" class="mkb-btn mkb-btn-sm" onclick="mkGoStoreSet(\'' + mkEsc(setId) + '\');return false;">Ver</a></div>';
}

// ── Leilão ──────────────────────────────────────────────────────────
function mkLeilaoRender() {
  const pane = document.getElementById('leilao');
  if (!pane) return;
  let slot = document.getElementById('mk-leilao-slot');
  if (!slot) {
    const title = pane.querySelector('.sec-title');
    if (!title) return;
    slot = document.createElement('div'); slot.id = 'mk-leilao-slot'; title.after(slot);
  }
  if (!mkPromoActive()) { slot.innerHTML = ''; return; }
  slot.innerHTML = '<div class="mkb-card"><span class="mkb-card-ic"></span><div class="mkb-card-tx"><b>Não levou o lote?</b>' +
    '<span>Veja o que a Toybox, loja parceira, tem pronto para envio.</span></div>' +
    '<a href="#" class="mkb-btn mkb-btn-sm" onclick="mkGoStoreAll();return false;">Ver loja</a></div>';
}

// ── selo NOVO no menu ───────────────────────────────────────────────
function mkNavBadges() {
  document.querySelectorAll('.mk-nav-badge').forEach(function (b) { b.hidden = !(mkPromoActive() && mkPromo.newCount > 0); });
}

function mkBannersRender() {
  mkStripRender(); mkHeroRender(); mkFicRender(); mkLeilaoRender(); mkNavBadges();
}
window.mkBannersRender = mkBannersRender;

// ganchos: cada troca de aba atualiza o que precisa (sem redesenhar tudo) e o Fichário refaz o cartão ao trocar de coleção
(function hook() {
  if (typeof window.go !== 'function') { setTimeout(hook, 80); return; }
  if (window.go.__mkBanners) return;
  const originalGo = window.go;
  window.go = function (id) {
    const r = originalGo.apply(this, arguments);
    try {
      if (id === 'mk') mkPromoLoad(true);          // a vitrine mostra o estado real
      else mkPromoLoad(false);
      mkStripRender();
      if (id === 'leilao') mkLeilaoRender();
      if (id === 'inicio') mkHeroRender();
    } catch (e) { /* banner nunca derruba a navegação */ }
    return r;
  };
  window.go.__mkBanners = true;
  const rb = window.renderBinder;
  if (typeof rb === 'function' && !rb.__mkBanners) {
    window.renderBinder = function () { const r = rb.apply(this, arguments); try { mkFicRender(); } catch (e) { /* idem */ } return r; };
    window.renderBinder.__mkBanners = true;
  }
})();

document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { mkPromoLoad(false); }, 600); });
// depois de login/logout a lista pública continua a mesma; só renova o cache de tempos em tempos
setInterval(function () { if (!document.hidden) mkPromoLoad(false); }, MK_PROMO_TTL);
