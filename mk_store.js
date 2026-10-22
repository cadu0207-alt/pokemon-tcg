// ================================================================
// MyDeck — Loja Toybox · vitrine pública (mk_store.js) — 15/10/2026
// Cabeçalho da loja, filtros, grade de produtos e a página do produto. Qualquer visitante vê (aba pública).
// Comprar pelo site (reserva/pagamento) vem na próxima etapa: por enquanto o botão leva ao WhatsApp da loja,
// com o produto já na mensagem. Quem é da loja ganha o botão "Gerenciar loja" (mk_panel.js).
// ================================================================

async function renderMk() {
  const wrap = document.getElementById('mk-wrap');
  if (!wrap) return;
  if (!mk.loaded) wrap.innerHTML = '<div class="mk-empty">Carregando a loja…</div>';
  await mkLoadAll(false);
  if (mk.error) { wrap.innerHTML = '<div class="mk-empty">Não consegui carregar a loja agora. Tente de novo em instantes.<br><button class="btn-mini" onclick="mkReload()">Tentar de novo</button></div>'; return; }
  if (!mk.seller) { wrap.innerHTML = '<div class="mk-empty">A loja ainda não está disponível.</div>'; return; }
  if (mk.view === 'panel' && mk.isMember && typeof mkRenderPanel === 'function') { mkRenderPanel(); return; }
  mk.view = 'store';
  mkRenderStore();
}
window.renderMk = renderMk;

async function mkReload() { await mkLoadAll(true); renderMk(); }
window.mkReload = mkReload;

function mkGoPanel(tab) { mk.view = 'panel'; if (tab) mk.panelTab = tab; renderMk(); window.scrollTo({ top: 0 }); }
function mkGoStore() { mk.view = 'store'; renderMk(); window.scrollTo({ top: 0 }); }
window.mkGoPanel = mkGoPanel; window.mkGoStore = mkGoStore;

// quem NÃO é da loja só vê produto ativo (o banco já garante); membro vê tudo mas a vitrine mostra só ativos
function mkStoreProducts() {
  const f = mk.filters;
  const q = f.q.trim().toLowerCase();
  let list = mk.products.filter(function (p) { return p.status === 'ativo'; });
  if (f.kind !== 'todos') list = list.filter(function (p) { return p.kind === f.kind; });
  if (f.setId) list = list.filter(function (p) { return p.set_id === f.setId; });
  if (q) list = list.filter(function (p) { return (p.title + ' ' + (p.description || '') + ' ' + (p.sku || '')).toLowerCase().indexOf(q) >= 0; });
  if (f.onlyStock) list = list.filter(function (p) { return mkQty(p) > 0; });
  const by = {
    // destaques (⭐) primeiro, depois os publicados há menos tempo
    recentes: function (a, b) {
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at);
    },
    menor: function (a, b) { return a.price - b.price; },
    maior: function (a, b) { return b.price - a.price; },
    az: function (a, b) { return a.title.localeCompare(b.title, 'pt-BR'); },
  };
  list.sort(by[f.sort] || by.recentes);
  return list;
}

// 17/10/2026: o lojista cola texto em Markdown (títulos #, **negrito**, listas -) na descrição e na política de trocas e
// aparecia tudo cru, com asteriscos. Renderizador mínimo e SEGURO: escapa o texto ANTES de qualquer marcação, então
// nada digitado vira HTML/JS; só viram tag os poucos padrões abaixo.
function mkMdInline(t) {
  return mkEsc(t).replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
}
function mkMd(src) {
  const out = [];
  let list = false, para = [];
  const flushPara = function () { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
  const closeList = function () { if (list) { out.push('</ul>'); list = false; } };
  String(src || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); closeList(); return; }
    if ((m = line.match(/^(#{1,4})\s+(.+)$/))) { flushPara(); closeList(); out.push('<h4>' + mkMdInline(m[2]) + '</h4>'); return; }
    if ((m = line.match(/^[-*•]\s+(.+)$/))) { flushPara(); if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + mkMdInline(m[1]) + '</li>'); return; }
    closeList(); para.push(mkMdInline(line));
  });
  flushPara(); closeList();
  return out.join('');
}

function mkStoreHeaderHtml() {
  const s = mk.seller;
  const logo = mkSafeUrl(s.logo_url);
  const banner = mkSafeUrl(s.banner_url);
  const links = [];
  const wa = mkDigits(s.whatsapp);
  if (wa) links.push('<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">💬 WhatsApp</a>');
  if (mkSafeUrl(s.instagram)) links.push('<a href="' + mkEsc(mkSafeUrl(s.instagram)) + '" target="_blank" rel="noopener">📸 Instagram</a>');
  if (mkSafeUrl(s.tiktok)) links.push('<a href="' + mkEsc(mkSafeUrl(s.tiktok)) + '" target="_blank" rel="noopener">🎵 TikTok</a>');
  if (mkSafeUrl(s.website)) links.push('<a href="' + mkEsc(mkSafeUrl(s.website)) + '" target="_blank" rel="noopener">🌐 Site</a>');
  const place = [s.city, s.uf].filter(Boolean).join(' · ');
  const info = [];
  info.push('<li><b>Postagem:</b> em até ' + s.handling_days + ' dia' + (s.handling_days === 1 ? '' : 's') + ' útil' + (s.handling_days === 1 ? '' : 'eis') + ' após o pagamento.</li>');
  if (s.flat_shipping != null) info.push('<li><b>Frete:</b> ' + mkMoney(s.flat_shipping) + (s.free_shipping_over != null ? ' (grátis acima de ' + mkMoney(s.free_shipping_over) + ')' : '') + '.</li>');
  else if (s.free_shipping_over != null) info.push('<li><b>Frete grátis</b> acima de ' + mkMoney(s.free_shipping_over) + '.</li>');
  if (s.pickup_enabled) info.push('<li><b>Retirada em mãos:</b> ' + mkEsc(s.pickup_note || 'combine com a loja') + '</li>');
  if (s.return_policy) info.push('<li><details class="mk-policy"><summary><b>Trocas e devoluções</b> — ler a política completa</summary><div class="mk-md">' + mkMd(s.return_policy) + '</div></details></li>');
  return '<div class="mk-hero"' + (banner ? ' style="background-image:linear-gradient(rgba(10,14,25,.2),rgba(10,14,25,.45)),url(\'' + mkEsc(banner) + '\')"' : '') + '>' +
    (logo ? '<img class="mk-logo" src="' + mkEsc(logo) + '" alt="" onerror="this.style.display=\'none\'">' : '<div class="mk-logo mk-logo-fb">🧸</div>') +
    '<div class="mk-hero-txt">' +
      '<h2 class="mk-hero-name">' + mkEsc(s.name) + '</h2>' +
      (place ? '<div class="mk-hero-place">📍 ' + mkEsc(place) + '</div>' : '') +
      (s.description ? '<div class="mk-hero-desc mk-md" onclick="this.classList.toggle(\'mk-open\')" title="Clique para ' + 'ver tudo / recolher' + '">' + mkMd(s.description) + '</div>' : '') +
      (links.length ? '<div class="mk-hero-links">' + links.join('') + '</div>' : '') +
    '</div>' +
    '<div class="mk-hero-btns">' +
      (typeof mkCartHeroBtnHtml === 'function' ? mkCartHeroBtnHtml() : '') +
      (mk.isMember ? '<button type="button" class="mk-manage-btn" onclick="mkGoPanel()">⚙️ Gerenciar loja</button>' : '') +
      (s.checkout_enabled && !mk.isMember && typeof mkOpenMyOrders === 'function' ? '<button type="button" class="mk-manage-btn" onclick="mkOpenMyOrders()">📦 Meus pedidos</button>' : '') +
    '</div>' +
  '</div>' +
  (s.status !== 'ativa' ? '<div class="mk-note mk-note-warn">Esta loja está <b>' + mkEsc(s.status) + '</b>: só quem é da equipe consegue vê-la.</div>' : '') +
  '<details class="mk-info"><summary>ℹ️ Entrega, frete e trocas</summary><ul>' + info.join('') + '</ul></details>';
}

function mkStoreFiltersHtml() {
  const f = mk.filters;
  const present = {};
  mk.products.forEach(function (p) { if (p.status === 'ativo') present[p.kind] = true; });
  const chips = ['todos'].concat(Object.keys(MK_KIND_LBL).filter(function (k) { return present[k]; }));
  return '<div class="mk-filters">' +
    '<input type="search" id="mk-q" class="mk-search" placeholder="Buscar produto…" value="' + mkEsc(f.q) + '" oninput="mkSetFilter(\'q\',this.value)">' +
    '<select class="mk-select" onchange="mkSetFilter(\'sort\',this.value)">' +
      [['recentes', 'Novidades e destaques'], ['menor', 'Menor preço'], ['maior', 'Maior preço'], ['az', 'A–Z']].map(function (o) {
        return '<option value="' + o[0] + '"' + (f.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
    '<label class="mk-check"><input type="checkbox"' + (f.onlyStock ? ' checked' : '') + ' onchange="mkSetFilter(\'onlyStock\',this.checked)"> Só com estoque</label>' +
    (f.setId ? '<button type="button" class="filter-chip filter-chip-active" title="Tirar o filtro" onclick="mkSetFilter(\'setId\',null)">Coleção ' + mkEsc(String(f.setId).toUpperCase()) + ' ✕</button>' : '') +
    '<div class="mk-chips">' + chips.map(function (k) {
      return '<button type="button" class="filter-chip' + (f.kind === k ? ' filter-chip-active' : '') + '" onclick="mkSetFilter(\'kind\',\'' + k + '\')">' +
        (k === 'todos' ? 'Todos' : (MK_KIND_ICON[k] + ' ' + MK_KIND_LBL[k])) + '</button>';
    }).join('') + '</div>' +
  '</div>';
}

let mkSearchTimer = null;
function mkSetFilter(key, val) {
  mk.filters[key] = val;
  if (key === 'q') {   // não redesenha o campo enquanto digita
    clearTimeout(mkSearchTimer);
    mkSearchTimer = setTimeout(mkRenderGridOnly, 180);
    return;
  }
  mkRenderStore();
}
window.mkSetFilter = mkSetFilter;

function mkCardHtml(p) {
  const cover = mkSafeUrl(mkCover(p));
  const qty = mkQty(p);
  const off = p.compare_at_price && p.compare_at_price > p.price ? Math.round((1 - p.price / p.compare_at_price) * 100) : 0;
  let badge = '';
  if (qty <= 0) badge = '<span class="mk-badge mk-badge-out">Esgotado</span>';
  else if (qty <= Math.max(2, p.low_stock_alert || 0)) badge = '<span class="mk-badge mk-badge-low">' + (qty === 1 ? 'Última unidade' : 'Últimas ' + qty) + '</span>';
  else if (mkIsNew(p)) badge = '<span class="mk-badge mk-badge-new">Novo</span>';
  else if (p.featured) badge = '<span class="mk-badge mk-badge-new">⭐ Destaque</span>';
  const tags = [];
  if (p.kind === 'carta') {
    if (p.condition) tags.push(MK_COND_LBL[p.condition] || p.condition);
    if (p.language) tags.push(MK_LANG_LBL[p.language] || p.language);
    if (p.version) tags.push(MK_VER_LBL[p.version] || p.version);
  }
  return '<article class="mk-card' + (qty <= 0 ? ' mk-card-out' : '') + '" tabindex="0" onclick="mkOpenProduct(' + p.id + ')" onkeydown="if(event.key===\'Enter\')mkOpenProduct(' + p.id + ')">' +
    '<div class="mk-card-img">' + (cover ? '<img loading="lazy" src="' + mkEsc(cover) + '" alt="' + mkEsc(p.title) + '">' : '<span class="mk-card-noimg">' + (MK_KIND_ICON[p.kind] || '🧸') + '</span>') +
      badge + (off >= 5 ? '<span class="mk-badge mk-badge-off">-' + off + '%</span>' : '') +
      (qty > 0 ? '<button type="button" class="mk-add-btn" aria-label="Adicionar ' + mkEsc(p.title) + ' ao carrinho" title="Adicionar ao carrinho" onclick="event.stopPropagation();mkCartAdd(' + p.id + ')" onkeydown="event.stopPropagation()">＋</button>' : '') + '</div>' +
    '<div class="mk-card-body">' +
      '<div class="mk-card-title">' + mkEsc(p.title) + '</div>' +
      (tags.length ? '<div class="mk-card-tags">' + tags.map(mkEsc).join(' · ') + '</div>' : '') +
      '<div class="mk-card-price">' + mkMoney(p.price) +
        (off >= 5 ? ' <s class="mk-card-old">' + mkMoney(p.compare_at_price) + '</s>' : '') + '</div>' +
    '</div></article>';
}

function mkGridHtml() {
  const list = mkStoreProducts();
  if (!list.length) {
    const total = mk.products.filter(function (p) { return p.status === 'ativo'; }).length;
    return '<div class="mk-empty">' + (total ? 'Nada encontrado com esses filtros.' : 'A loja ainda não publicou produtos. Volte em breve!') +
      (!total && mk.isMember ? '<br><button class="btn-mini" onclick="mkGoPanel(\'produtos\')">➕ Cadastrar o primeiro produto</button>' : '') + '</div>';
  }
  return '<div class="mk-grid">' + list.map(mkCardHtml).join('') + '</div>' +
    '<div class="mk-count">' + list.length + ' produto' + (list.length === 1 ? '' : 's') + '</div>';
}
function mkRenderGridOnly() {
  const g = document.getElementById('mk-grid-holder');
  if (g) g.innerHTML = mkGridHtml();
}

// 22/10/2026: aba "Atacado" na página da loja (condições de estoque/importação). O texto é do lojista (Markdown simples, painel →
// Dados da loja → Atacado); sem texto, a aba não existe.
function mkHasWholesale() { return !!(mk.seller && mk.seller.wholesale_info && String(mk.seller.wholesale_info).trim()); }
function mkSetTab(t) { mk.tab = t === 'atacado' && mkHasWholesale() ? 'atacado' : 'produtos'; mkRenderStore(); window.scrollTo(0, 0); }
window.mkSetTab = mkSetTab;
function mkTabsHtml() {
  if (!mkHasWholesale()) return '';
  const on = mk.tab === 'atacado' ? 'atacado' : 'produtos';
  return '<div class="mk-tabs" role="tablist">' +
    '<button type="button" role="tab" class="mk-tab' + (on === 'produtos' ? ' on' : '') + '" aria-selected="' + (on === 'produtos') + '" onclick="mkSetTab(\'produtos\')">🛍️ Produtos</button>' +
    '<button type="button" role="tab" class="mk-tab' + (on === 'atacado' ? ' on' : '') + '" aria-selected="' + (on === 'atacado') + '" onclick="mkSetTab(\'atacado\')">📦 Atacado</button></div>';
}
function mkWholesaleHtml() {
  const s = mk.seller, wa = mkDigits(s.whatsapp), url = mkSafeUrl(s.wholesale_url);
  const msg = 'Oi! Vi a aba de atacado da ' + s.name + ' no MyDeck e quero pedir uma cotação. https://mydecktcg.com.br/#mk';
  return '<section class="mk-wh"><div class="mk-md">' + mkMd(s.wholesale_info) + '</div>' +
    '<div class="mk-wh-actions">' +
      (url ? '<a class="mk-buy-btn mk-buy-site" target="_blank" rel="noopener" href="' + mkEsc(url) + '">📄 Ver catálogo de importação</a>' : '') +
      (wa ? '<a class="mk-buy-btn mk-buy-alt" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(msg) + '" onclick="return typeof mkWaGate === \'function\' ? mkWaGate() : true">💬 Pedir cotação pelo WhatsApp</a>' : '') +
    '</div></section>';
}

function mkRenderStore() {
  const wrap = document.getElementById('mk-wrap');
  if (!wrap || !mk.seller) return;
  const atacado = mk.tab === 'atacado' && mkHasWholesale();
  wrap.innerHTML = '<div class="mk-page">' + mkStoreHeaderHtml() + mkTabsHtml() +
    (atacado ? mkWholesaleHtml()
             : mkStoreFiltersHtml() + '<div id="mk-grid-holder">' + mkGridHtml() + '</div>' + (typeof mkCartBarHtml === 'function' ? mkCartBarHtml() : '')) +
    '</div>';
  if (typeof mkCartRefreshUI === 'function') mkCartRefreshUI();
}

// ── página do produto ──────────────────────────────────────────────────
function mkOpenProduct(id) {
  const p = mk.products.find(function (x) { return x.id === id; });
  if (!p) return;
  const imgs = (p.images || []).map(function (i) { return mkSafeUrl(i.url); }).filter(Boolean);
  const qty = mkQty(p);
  const rows = [];
  rows.push(['Tipo', MK_KIND_LBL[p.kind] || p.kind]);
  if (p.kind === 'carta') {
    if (p.condition) rows.push(['Condição', MK_COND_LBL[p.condition] || p.condition]);
    if (p.language) rows.push(['Idioma', MK_LANG_LBL[p.language] || p.language]);
    if (p.version) rows.push(['Versão', MK_VER_LBL[p.version] || p.version]);
    if (p.set_id && p.card_n) rows.push(['Coleção / nº', p.set_id.toUpperCase() + ' · ' + p.card_n]);
  }
  if (p.sku) rows.push(['Código', p.sku]);
  const wa = mkDigits(mk.seller.whatsapp);
  const msg = 'Oi! Vi "' + p.title + '" (' + mkMoney(p.price) + ') na loja de vocês no MyDeck e tenho interesse. https://mydecktcg.com.br/#mk';
  const off = p.compare_at_price && p.compare_at_price > p.price;
  const html =
    '<div class="mk-prod">' +
      '<div class="mk-prod-gallery">' +
        (imgs.length ? '<img id="mk-prod-main" class="mk-prod-main" src="' + mkEsc(imgs[0]) + '" alt="' + mkEsc(p.title) + '">' : '<div class="mk-prod-main mk-prod-noimg">' + (MK_KIND_ICON[p.kind] || '🧸') + '</div>') +
        (imgs.length > 1 ? '<div class="mk-thumbs">' + imgs.map(function (u, i) {
          return '<img class="mk-thumb' + (i === 0 ? ' on' : '') + '" src="' + mkEsc(u) + '" alt="Foto ' + (i + 1) + '" onclick="mkPickPhoto(this)">';
        }).join('') + '</div>' : '') +
      '</div>' +
      '<div class="mk-prod-info">' +
        (p.status !== 'ativo' ? '<div class="mk-note mk-note-warn">Produto <b>' + mkEsc(MK_STATUS_LBL[p.status] || p.status) + '</b> — só a equipe da loja vê.</div>' : '') +
        '<h3 class="mk-prod-title">' + mkEsc(p.title) + '</h3>' +
        '<div class="mk-prod-price">' + mkMoney(p.price) + (off ? ' <s class="mk-card-old">' + mkMoney(p.compare_at_price) + '</s>' : '') + '</div>' +
        '<div class="mk-prod-stock ' + (qty <= 0 ? 'out' : 'ok') + '">' + (qty <= 0 ? 'Esgotado' : qty + ' em estoque') + '</div>' +
        (p.description ? '<p class="mk-prod-desc">' + mkEsc(p.description).replace(/\n/g, '<br>') + '</p>' : '') +
        '<table class="mk-prod-table">' + rows.map(function (r) { return '<tr><th>' + mkEsc(r[0]) + '</th><td>' + mkEsc(r[1]) + '</td></tr>'; }).join('') + '</table>' +
        (typeof mkShipBoxHtml === 'function' ? mkShipBoxHtml(p) : '') +
        (qty > 0 && p.status === 'ativo' ? '<button type="button" class="mk-buy-btn mk-add-cart" onclick="mkCartAdd(' + p.id + ')">🛒 Adicionar ao carrinho</button>' : '') +
        (typeof mkBuyBtnHtml === 'function' ? mkBuyBtnHtml(p) : '') +
        (wa && qty > 0 ? '<a class="mk-buy-btn' + (mk.seller.checkout_enabled ? ' mk-buy-alt' : '') + '" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(msg) + '" onclick="return mkProductWaClicked(' + p.id + ')">💬 Chamar a loja no WhatsApp</a>' +
          (mk.seller.checkout_enabled ? '' : '<div class="mk-prod-hint">A compra direto pelo site chega em breve. Por enquanto a loja combina pagamento e envio pelo WhatsApp.</div>') : '') +
        (qty <= 0 ? '<div class="mk-prod-hint">Produto esgotado no momento. Pergunte à loja se vai repor.</div>' : '') +
        (mk.isMember ? '<button type="button" class="btn-mini" style="margin-top:12px" onclick="mkCloseModal();mkGoPanel(\'produtos\');setTimeout(function(){mkOpenProductForm(' + p.id + ')},60)">✏️ Editar este produto</button>' : '') +
      '</div>' +
    '</div>';
  mkOpenModal(html, { wide: true });
}
window.mkOpenProduct = mkOpenProduct;

function mkPickPhoto(el) {
  const main = document.getElementById('mk-prod-main');
  if (main) main.src = el.src;
  document.querySelectorAll('.mk-thumb').forEach(function (t) { t.classList.toggle('on', t === el); });
}
window.mkPickPhoto = mkPickPhoto;

// depois de login/logout a carga refaz (o papel de "membro" muda)
document.addEventListener('DOMContentLoaded', function () {
  const pane = document.getElementById('mk');
  if (pane && pane.classList.contains('active')) renderMk();
});
