// ================================================================
// MyDeck — Loja Toybox · catálogo de importação (aba Atacado) — 22/10/2026
//
// Os produtos vêm de atacado_toybox/catalogo.json (143 itens do catálogo "TOYBOX ATACADO": Especial 30 Anos, China, Japão), com as fotos
// na mesma pasta. NÃO tem preço: a cotação é feita no pedido. A pessoa monta uma lista com as quantidades e envia a cotação pelo WhatsApp
// da loja (login antes, como nos outros botões de WhatsApp). A lista fica guardada no navegador.
// Para atualizar o catálogo: enviar o novo arquivo do catálogo (HTML) — o script de extração (guardado fora do site) regera catalogo.json e as fotos.
// Carrega depois de mk_store.js (a aba Atacado chama mkWhMount()).
// ================================================================

const MK_WH_BASE = 'atacado_toybox/';
const MK_WH_KEY = 'mk_wh_list_v1';
const mkWh = { loaded: false, loading: false, err: false, data: null, cat: 'all', q: '', list: {} };

(function loadList() {
  try { mkWh.list = JSON.parse(localStorage.getItem(MK_WH_KEY) || '{}') || {}; } catch (e) { mkWh.list = {}; }
})();
function mkWhSave() { try { localStorage.setItem(MK_WH_KEY, JSON.stringify(mkWh.list)); } catch (e) { /* sem storage */ } }

function mkWhImg(fn) { return /^[\w.\-]+$/.test(fn || '') ? MK_WH_BASE + fn : ''; }
function mkWhNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function mkWhCount() { return Object.keys(mkWh.list).reduce(function (n, k) { return n + (+mkWh.list[k] || 0); }, 0); }
function mkWhLines() { return Object.keys(mkWh.list).filter(function (k) { return mkWh.list[k] > 0; }); }
function mkWhItem(ref) { return mkWh.data ? mkWh.data.items.find(function (i) { return i.ref === ref; }) : null; }

async function mkWhFetch() {
  if (mkWh.loaded || mkWh.loading) return;
  mkWh.loading = true;
  try {
    const r = await fetch(MK_WH_BASE + 'catalogo.json');
    if (!r.ok) throw new Error('http ' + r.status);
    mkWh.data = await r.json();
    // limpa da lista itens que saíram do catálogo
    Object.keys(mkWh.list).forEach(function (k) { if (!mkWhItem(k)) delete mkWh.list[k]; });
    mkWh.loaded = true; mkWh.err = false;
  } catch (e) { console.warn('[mk] catálogo de atacado:', e); mkWh.err = true; }
  mkWh.loading = false;
}

function mkWhMount() {
  const host = document.getElementById('mk-wh-catalog');
  if (!host) return;
  if (mkWh.loaded) { mkWhRender(); return; }
  host.innerHTML = '<div class="mk-empty">Carregando o catálogo…</div>';
  mkWhFetch().then(function () { mkWhRender(); });
}

function mkWhFiltered() {
  const q = mkWhNorm(mkWh.q.trim());
  return mkWh.data.items.filter(function (i) {
    return (mkWh.cat === 'all' || i.cat === mkWh.cat) && (!q || mkWhNorm(i.name + ' ' + (i.desc || '')).indexOf(q) >= 0);
  });
}

function mkWhCardHtml(i) {
  const q = +mkWh.list[i.ref] || 0, img = mkWhImg(i.images && i.images[0]);
  const off = i.status === 'indisponivel';
  return '<div class="mk-whc' + (q > 0 ? ' on' : '') + '" data-ref="' + mkEsc(i.ref) + '">' +
    '<button type="button" class="mk-whc-img" onclick="mkWhOpen(\'' + mkEsc(i.ref) + '\')" aria-label="Ver detalhes">' +
      (img ? '<img loading="lazy" decoding="async" src="' + mkEsc(img) + '" alt="">' : '🧸') + '</button>' +
    '<button type="button" class="mk-whc-name" onclick="mkWhOpen(\'' + mkEsc(i.ref) + '\')">' + mkEsc(i.name) + '</button>' +
    (off ? '<div class="mk-whc-off">Indisponível</div>' :
      (q > 0
        ? '<div class="mk-whc-qty"><button type="button" onclick="mkWhSet(\'' + mkEsc(i.ref) + '\',' + (q - 1) + ')" aria-label="Diminuir">−</button><b>' + q + '</b><button type="button" onclick="mkWhSet(\'' + mkEsc(i.ref) + '\',' + (q + 1) + ')" aria-label="Aumentar">＋</button></div>'
        : '<button type="button" class="mk-whc-add" onclick="mkWhSet(\'' + mkEsc(i.ref) + '\',1)">＋ Adicionar à lista</button>')) +
    '</div>';
}

function mkWhBarHtml() {
  const n = mkWhCount();
  if (!n) return '';
  return '<span><b>' + n + '</b> ite' + (n === 1 ? 'm' : 'ns') + ' na lista (' + mkWhLines().length + ' produto' + (mkWhLines().length === 1 ? '' : 's') + ')</span>' +
    '<span class="mk-wh-bar-act"><button type="button" class="mk-wh-bar-clear" onclick="mkWhClear()">Limpar</button>' +
    '<a class="mk-wh-bar-go" href="#" target="_blank" rel="noopener" onclick="return mkWhQuote(this)">💬 Pedir cotação</a></span>';
}
function mkWhRefreshBar() {
  const bar = document.getElementById('mk-wh-bar'); if (!bar) return;
  const html = mkWhBarHtml();
  bar.innerHTML = html; bar.hidden = !html;
}

function mkWhRender() {
  const host = document.getElementById('mk-wh-catalog');
  if (!host) return;
  if (mkWh.err || !mkWh.data) { host.innerHTML = '<div class="mk-empty">Não consegui carregar o catálogo agora. Tente de novo em instantes.</div>'; return; }
  const d = mkWh.data, secs = d.sections || {};
  const counts = { all: d.items.length };
  d.items.forEach(function (i) { counts[i.cat] = (counts[i.cat] || 0) + 1; });
  const catLbl = { ESP30: '🎉 Especial 30 Anos', CHN: '🇨🇳 China', JAP: '🇯🇵 Japão' };
  const chips = ['all', 'ESP30', 'CHN', 'JAP'].filter(function (c) { return c === 'all' || counts[c]; }).map(function (c) {
    return '<button type="button" class="filter-chip' + (mkWh.cat === c ? ' filter-chip-active' : '') + '" onclick="mkWhSetCat(\'' + c + '\')">' +
      (c === 'all' ? 'Todos' : catLbl[c]) + ' <small>' + counts[c] + '</small></button>';
  }).join('');
  host.innerHTML =
    '<h3 class="mk-whc-h">📋 Catálogo de importação</h3>' +
    '<div class="mk-prod-hint" style="margin:0 0 10px">Sem valores: a cotação é feita no pedido. Monte a lista com as quantidades e peça a cotação pelo WhatsApp.</div>' +
    '<div class="mk-chips" style="margin-bottom:8px">' + chips + '</div>' +
    '<input type="search" id="mk-wh-q" class="mk-search" placeholder="Buscar no catálogo…" value="' + mkEsc(mkWh.q) + '" oninput="mkWhSetQ(this.value)">' +
    (mkWh.cat !== 'all' && secs[mkWh.cat] ? '<div class="mk-prod-hint" style="margin:8px 0 0">' + mkEsc(secs[mkWh.cat].sub) + '</div>' : '') +
    '<div id="mk-wh-grid" class="mk-whc-grid"></div>' +
    '<div id="mk-wh-bar" class="mk-wh-bar" hidden></div>';
  mkWhRenderGrid();
  mkWhRefreshBar();
}
function mkWhRenderGrid() {
  const g = document.getElementById('mk-wh-grid'); if (!g || !mkWh.data) return;
  const items = mkWhFiltered();
  g.innerHTML = items.length ? items.map(mkWhCardHtml).join('') : '<div class="mk-empty" style="grid-column:1/-1">Nenhum produto encontrado.</div>';
}

let mkWhTimer = null;
function mkWhSetCat(c) { mkWh.cat = c; mkWhRender(); }
function mkWhSetQ(v) { mkWh.q = v; clearTimeout(mkWhTimer); mkWhTimer = setTimeout(mkWhRenderGrid, 160); }
function mkWhSet(ref, n) {
  n = Math.max(0, Math.min(999, n | 0));
  if (n > 0) mkWh.list[ref] = n; else delete mkWh.list[ref];
  mkWhSave();
  const card = document.querySelector('.mk-whc[data-ref="' + ref + '"]');
  const it = mkWhItem(ref);
  if (card && it) card.outerHTML = mkWhCardHtml(it);
  mkWhRefreshBar();
  const m = document.getElementById('mk-wh-modal-q'); if (m) mkWhModalRefresh(ref);
}
function mkWhClear() {
  if (!confirm('Esvaziar a lista de cotação?')) return;
  mkWh.list = {}; mkWhSave(); mkWhRender();
}

// ── detalhes do produto ──
function mkWhOpen(ref) {
  const i = mkWhItem(ref); if (!i) return;
  const imgs = (i.images || []).map(mkWhImg).filter(Boolean);
  mkOpenModal('<div class="mk-prod"><div class="mk-prod-gallery">' +
    (imgs.length ? '<img id="mk-prod-main" class="mk-prod-main" src="' + mkEsc(imgs[0]) + '" alt="' + mkEsc(i.name) + '">' : '<div class="mk-prod-main mk-prod-noimg">🧸</div>') +
    (imgs.length > 1 ? '<div class="mk-thumbs">' + imgs.map(function (u, k) { return '<img class="mk-thumb' + (k === 0 ? ' on' : '') + '" src="' + mkEsc(u) + '" alt="Foto ' + (k + 1) + '" onclick="mkPickPhoto(this)">'; }).join('') + '</div>' : '') +
    '</div><div class="mk-prod-info"><h3 class="mk-prod-title">' + mkEsc(i.name) + '</h3>' +
    '<div class="mk-prod-stock ok">Importação · sob cotação</div>' +
    (i.desc ? '<p class="mk-prod-desc">' + mkEsc(i.desc).replace(/\n/g, '<br>') + '</p>' : '') +
    '<div id="mk-wh-modal-q" class="mk-wh-modal-q"></div></div></div>', { wide: true });
  mkWhModalRefresh(ref);
}
function mkWhModalRefresh(ref) {
  const box = document.getElementById('mk-wh-modal-q'); if (!box) return;
  const q = +mkWh.list[ref] || 0;
  box.innerHTML = q > 0
    ? '<div class="mk-whc-qty mk-whc-qty-lg"><button type="button" onclick="mkWhSet(\'' + mkEsc(ref) + '\',' + (q - 1) + ')">−</button><b>' + q + '</b><button type="button" onclick="mkWhSet(\'' + mkEsc(ref) + '\',' + (q + 1) + ')">＋</button></div>' +
      '<button type="button" class="mk-buy-btn mk-add-cart" onclick="mkCloseModal()">Ver minha lista</button>'
    : '<button type="button" class="mk-buy-btn mk-buy-site" style="border:0;cursor:pointer;font-family:inherit" onclick="mkWhSet(\'' + mkEsc(ref) + '\',1)">＋ Adicionar à lista de cotação</button>';
}

// ── cotação pelo WhatsApp (login antes) ──
function mkWhQuote(a) {
  if (typeof mkWaGate === 'function' && !mkWaGate()) return false;
  const wa = mk.seller && mkDigits(mk.seller.whatsapp);
  if (!wa) { mkToast('A loja ainda não informou o WhatsApp.', true); return false; }
  const lines = mkWhLines().map(function (k) { const it = mkWhItem(k); return '• ' + mkWh.list[k] + '× ' + (it ? it.name : k); });
  let shown = lines, extra = '';
  while (shown.join('\n').length > 1400 && shown.length > 3) shown = shown.slice(0, -1);
  if (shown.length < lines.length) extra = '\n… e mais ' + (lines.length - shown.length) + ' produto(s) (peço o restante na conversa)';
  const msg = 'Oi! Quero uma cotação de importação (atacado) destes itens:\n' + shown.join('\n') + extra + '\nhttps://mydecktcg.com.br/#mk';
  a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(msg);
  if (typeof gtag === 'function') { try { gtag('event', 'mk_wh_quote', { itens: mkWhCount() }); } catch (e) { /* ok */ } }
  return true;
}

window.mkWhMount = mkWhMount; window.mkWhSetCat = mkWhSetCat; window.mkWhSetQ = mkWhSetQ; window.mkWhSet = mkWhSet;
window.mkWhClear = mkWhClear; window.mkWhOpen = mkWhOpen; window.mkWhQuote = mkWhQuote;
