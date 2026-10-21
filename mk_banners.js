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
  // 21/10/2026: a faixa roxa no topo de todas as abas foi removida (feedback: propaganda demais, "cara de cassino")
  const old = document.getElementById('mk-strip'); if (old) old.remove();
}

// ── Início ──────────────────────────────────────────────────────────
// 21/10/2026: antes eram um banner grande + 4 produtos + selos "NOVO". O feedback foi de propaganda demais (parecia cassino),
// então agora é UM cartão pequeno, nas cores do site, com 1 produto sorteado (dá preferência a quem está em promoção) e um ✕
// que oculta por 7 dias. Some sozinho se a loja não tiver produto em estoque.
const MK_LITE_KEY = 'mk_lite_dismissed';
function mkLiteDismissed() {
  try { const t = +localStorage.getItem(MK_LITE_KEY) || 0; return Date.now() - t < 7 * 86400000; } catch (e) { return false; }
}
function mkLiteClose() {
  try { localStorage.setItem(MK_LITE_KEY, String(Date.now())); } catch (e) { /* sem storage */ }
  const slot = document.getElementById('mk-hero-slot'); if (slot) slot.innerHTML = '';
}
window.mkLiteClose = mkLiteClose;
function mkLitePick() {
  const cur = mkPromo.items.find(function (p) { return p.id === mkPromo.pickId; });
  if (cur) return cur;
  const deals = mkPromo.items.filter(function (p) { return p.compare_at_price && p.compare_at_price > p.price; });
  const pool = deals.length ? deals : mkPromo.items;
  const p = pool[Math.floor(Math.random() * pool.length)];
  mkPromo.pickId = p ? p.id : null;
  return p;
}
function mkHeroRender() {
  const slot = document.getElementById('mk-hero-slot');
  if (!slot) return;
  if (!mkPromoActive() || mkLiteDismissed()) { slot.innerHTML = ''; return; }
  const p = mkLitePick();
  if (!p) { slot.innerHTML = ''; return; }
  const cover = mkSafeUrl(mkCover(p));
  const off = p.compare_at_price && p.compare_at_price > p.price;
  slot.innerHTML = '<section class="mkb-lite" aria-label="Loja parceira Toybox">' +
    '<a href="#" class="mkb-lite-main" onclick="mkGoProduct(' + p.id + ');return false;">' +
      '<span class="mkb-lite-img">' + (cover ? '<img loading="lazy" src="' + mkEsc(cover) + '" alt="">' : (MK_KIND_ICON[p.kind] || '🧸')) + '</span>' +
      '<span class="mkb-lite-tx"><small>Da loja parceira Toybox</small><b>' + mkEsc(p.title) + '</b>' +
        '<em>' + mkMoney(p.price) + (off ? ' <s>' + mkMoney(p.compare_at_price) + '</s>' : '') + '</em></span></a>' +
    '<a href="#" class="mkb-lite-go" onclick="mkGoStoreAll();return false;">Ver loja</a>' +
    '<button type="button" class="mkb-lite-x" aria-label="Ocultar por alguns dias" title="Ocultar" onclick="mkLiteClose()">✕</button>' +
    '</section>';
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
// 21/10/2026: o cartão "Não levou o lote?" saiu (era mais uma propaganda da loja, fora do contexto do que a pessoa estava fazendo)
function mkLeilaoRender() {
  const slot = document.getElementById('mk-leilao-slot'); if (slot) slot.innerHTML = '';
}

// ── selo NOVO no menu ───────────────────────────────────────────────
function mkNavBadges() {
  document.querySelectorAll('.mk-nav-badge').forEach(function (b) { b.hidden = true; });   // 21/10/2026: sem selo/ponto chamando atenção no menu
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
