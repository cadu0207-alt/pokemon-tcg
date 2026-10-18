// ================================================================
// MyDeck — Ordenar as promoções da aba "Busca de Promoções ML" (18/10/2026)
//
// Seletor "Ordenar por": padrão (destaques), menor valor por booster, menor/maior preço, maior desconto (vs. histórico do
// próprio produto), mais perto do preço sugerido da Copag e nome. 100% no navegador: reordena os cards que já estão na tela.
//   • Ordem padrão: restaura exatamente como o carregamento deixou (destaques no topo + resto embaralhado).
//   • Qualquer outra ordem: junta destaques e resto numa lista só e esconde o título "Ofertas em Destaque".
//   • O filtro por coleção continua valendo junto (os escondidos seguem escondidos).
// Carrega DEPOIS de lojas_destaques.js e lojas_alertas.js (encadeia por cima de renderProductCard, renderLojas e
// filterLojasByCollection).
// ================================================================

let loSort = 'padrao';   // ordem escolhida (mantida enquanto a aba não for recarregada)

const LO_OPTIONS = [
  ['padrao', 'Padrão (destaques primeiro)'],
  ['booster', '🃏 Menor valor por booster'],
  ['menor', 'Menor preço'],
  ['maior', 'Maior preço'],
  ['desconto', '🔥 Maior desconto (vs. histórico)'],
  ['sugerido', '🏷️ Mais perto do preço sugerido (Copag)'],
  ['nome', 'Nome (A–Z)'],
];

// ── cada card carrega os números que as ordens precisam ──
if (typeof window.renderProductCard === 'function') {
  const _origRenderProductCardSort = window.renderProductCard;
  window.renderProductCard = function (term, history) {
    const html = _origRenderProductCardSort.apply(this, arguments);
    const latest = history && history.length ? history[history.length - 1] : null;
    if (!term || !latest) return html;
    const price = +latest.price;
    const ppb = term.boosters > 0 ? price / term.boosters : '';
    const pct = term.msrp > 0 ? price / term.msrp : '';
    const name = String(term.label || term.term || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const i = html.indexOf('>');
    if (i < 0) return html;
    const attrs = ' data-lo-price="' + price + '" data-lo-ppb="' + ppb + '" data-lo-msrp="' + pct + '" data-lo-name="' + name + '"';
    return html.slice(0, i) + attrs + html.slice(i);
  };
}

function loNum(card, attr) {
  const v = card.getAttribute(attr);
  return v === '' || v == null ? null : +v;
}

// chave de ordenação: [valor|null, direção]; null (sem dado) vai sempre pro fim
function loKey(card, mode) {
  switch (mode) {
    case 'booster': return [loNum(card, 'data-lo-ppb'), 1];
    case 'menor': return [loNum(card, 'data-lo-price'), 1];
    case 'maior': return [loNum(card, 'data-lo-price'), -1];
    case 'desconto': { const s = card.dataset.dealScore; return [s === '' || s == null ? null : +s, -1]; }
    case 'sugerido': return [loNum(card, 'data-lo-msrp'), 1];
    default: return [null, 1];
  }
}

function loApply() {
  const holder = document.getElementById('lojas-showcase');
  if (!holder) return;
  const grids = Array.from(holder.querySelectorAll('.products-grid'));
  const featuredGrid = holder.querySelector('.products-grid-featured');
  const mainGrid = grids.find(function (g) { return g !== featuredGrid; });
  if (!mainGrid) return;

  // guarda a "casa" original de cada card na primeira vez
  grids.forEach(function (g) {
    Array.from(g.querySelectorAll('.product-card')).forEach(function (c) { if (!c._loHome) c._loHome = g; });
  });

  if (loSort === 'padrao') {
    // devolve cada card pro seu grid de origem, na ordem inicial gravada por lojas_destaques.js
    grids.forEach(function (g) { (g._initialOrder || []).forEach(function (c) { g.appendChild(c); }); });
    Array.from(holder.querySelectorAll('.product-card')).forEach(function (c) { if (c._loHome && c.parentNode !== c._loHome) c._loHome.appendChild(c); });
    if (featuredGrid) {
      featuredGrid.classList.remove('lo-off');
      if (featuredGrid.previousElementSibling && featuredGrid.previousElementSibling.classList.contains('sec-title')) featuredGrid.previousElementSibling.classList.remove('lo-off');
    }
    loNote('');
    return;
  }

  const all = Array.from(holder.querySelectorAll('.product-card'));
  const withKey = all.map(function (c, i) { return { c: c, i: i, k: loKey(c, loSort), name: c.getAttribute('data-lo-name') || '' }; });
  withKey.sort(function (a, b) {
    if (loSort === 'nome') return a.name.localeCompare(b.name, 'pt-BR');
    const av = a.k[0], bv = b.k[0], dir = a.k[1];
    if (av == null && bv == null) return a.i - b.i;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av === bv ? a.i - b.i : (av - bv) * dir;
  });
  withKey.forEach(function (x) { mainGrid.appendChild(x.c); });
  if (featuredGrid) {
    featuredGrid.classList.add('lo-off');
    if (featuredGrid.previousElementSibling && featuredGrid.previousElementSibling.classList.contains('sec-title')) featuredGrid.previousElementSibling.classList.add('lo-off');
  }
  const semDado = withKey.filter(function (x) { return loSort !== 'nome' && x.k[0] == null; }).length;
  const notes = {
    booster: 'Só entram na ordem os produtos com o nº de boosters conhecido; os outros (' + semDado + ') ficam no fim.',
    desconto: 'Compara o preço de agora com a mediana do histórico do próprio produto. Sem histórico suficiente fica no fim (' + semDado + ').',
    sugerido: 'Quanto menor a proporção do preço sugerido pela Copag, mais acima. Produtos sem preço sugerido (' + semDado + ') ficam no fim.',
  };
  loNote(notes[loSort] || '');
}

function loNote(txt) { const n = document.getElementById('lo-note'); if (n) { n.textContent = txt; n.style.display = txt ? '' : 'none'; } }

function loChange(v) { loSort = v; loApply(); }
window.loChange = loChange;

function loEnsureBar() {
  const holder = document.getElementById('lojas-showcase');
  if (!holder || document.getElementById('lo-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'lo-bar'; bar.className = 'lo-bar';
  bar.innerHTML = '<label for="lo-select">Ordenar por</label>' +
    '<select id="lo-select" onchange="loChange(this.value)">' +
    LO_OPTIONS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === loSort ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
    '</select><span id="lo-note" class="lo-note" style="display:none"></span>';
  const filter = holder.querySelector('.collection-filter-bar');
  if (filter && filter.parentNode) filter.parentNode.insertBefore(bar, filter.nextSibling);
  else holder.insertBefore(bar, holder.firstChild);
}

if (typeof window.renderLojas === 'function') {
  const _origRenderLojasSort = window.renderLojas;
  window.renderLojas = async function () {
    const r = await _origRenderLojasSort.apply(this, arguments);
    try { loEnsureBar(); if (loSort !== 'padrao') loApply(); } catch (e) { /* ordenar nunca pode quebrar a aba */ }
    return r;
  };
}

if (typeof window.filterLojasByCollection === 'function') {
  const _origFilterSort = window.filterLojasByCollection;
  window.filterLojasByCollection = function () {
    const r = _origFilterSort.apply(this, arguments);
    try { if (loSort !== 'padrao') loApply(); } catch (e) { /* ok */ }
    return r;
  };
}
