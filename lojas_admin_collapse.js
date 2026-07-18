// ================================================================
// MyDeck — Painel Admin Colapsável (lojas_admin_collapse.js)
// O painel "Cadastrar Produto Rastreado" (lojas.js/renderAdminPanel)
// vira uma rolagem enorme conforme o catálogo cresce (25 produtos ×
// ~200px de card = +5000px). Esta patch:
//   1. Adiciona uma busca por nome/coleção que filtra os cards na hora.
//   2. Coloca cada card de produto FECHADO por padrão — só nome, coleção,
//      estrela de destaque e os botões de ação ficam visíveis; o resto
//      (link de afiliado, cupom, vínculo com Preço Justo, campo de
//      coleção, resultado de busca) fica escondido até clicar no card.
//
// Sobrescreve só window.renderAdminPanel (mesmo padrão de monkey-patch
// de lojas_destaques.js/admin_stats.js/xp_system.js) — reaproveita todo
// o resto de lojas.js (loadSearchTerms, loadCoupons, fmtBRLLoja,
// productKeyOptionsHtml, collectionsDatalistHtml, runSearchForTerm etc.)
// sem tocar no arquivo grande.
// ================================================================

(function injectAdminCollapseStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .ml-term-card-collapsible { padding: 0; overflow: hidden; }
    .ml-term-hdr-toggle {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; padding: 10px 14px; cursor: pointer; flex-wrap: wrap;
    }
    .ml-term-hdr-toggle:hover { background: rgba(0,0,0,.03); }
    .ml-term-hdr-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
    .ml-term-caret { font-size: 11px; opacity: .55; transition: transform .15s; flex-shrink: 0; }
    .ml-term-card-collapsible.ml-term-expanded .ml-term-caret { transform: rotate(90deg); }
    .ml-term-hdr-collection { font-size: 11px; opacity: .6; white-space: nowrap; }
    .ml-term-body { padding: 0 14px 14px; display: none; }
    .ml-term-card-collapsible.ml-term-expanded .ml-term-body { display: block; }
    #ml-admin-term-search {
      width: 100%; box-sizing: border-box; margin: 10px 0 14px; padding: 9px 12px;
      border-radius: 8px; border: 1px solid rgba(0,0,0,.15); font-size: 13px;
    }
    .ml-term-card-hidden-by-search { display: none !important; }
    .ml-admin-count { font-size: 11px; opacity: .6; margin: 0 0 8px; }
  `;
  document.head.appendChild(style);
})();

function toggleTermCard(id) {
  const card = document.getElementById('term-card-' + id);
  if (!card) return;
  card.classList.toggle('ml-term-expanded');
}

function expandTermCard(id) {
  const card = document.getElementById('term-card-' + id);
  if (card && !card.classList.contains('ml-term-expanded')) card.classList.add('ml-term-expanded');
}

function filterAdminTerms(query) {
  const q = (query || '').trim().toLowerCase();
  const cards = document.querySelectorAll('#ml-admin-terms-list .ml-term-card-collapsible');
  let visible = 0;
  cards.forEach(function(card) {
    const haystack = card.getAttribute('data-search') || '';
    const match = !q || haystack.indexOf(q) !== -1;
    card.classList.toggle('ml-term-card-hidden-by-search', !match);
    if (match) visible++;
    // Já filtrando, abre automaticamente se tiver poucos resultados —
    // facilita quando a busca já é específica o bastante.
    if (q && match && visible <= 3) card.classList.add('ml-term-expanded');
    else if (!q) card.classList.remove('ml-term-expanded');
  });
  const countEl = document.getElementById('ml-admin-count');
  if (countEl) countEl.textContent = visible + ' de ' + cards.length + ' produto(s)';
}

async function renderAdminPanel() {
  const holder = document.getElementById('lojas-admin');
  if (!holder) return;
  if (!isAdmin()) { holder.innerHTML = ''; return; }

  const [terms, coupons, rules] = await Promise.all([loadSearchTerms(), loadCoupons(), loadCouponRules()]);

  const termsListHtml = terms.length
    ? terms.map(t => {
        const coupon = couponForTerm(coupons, t.id);
        const searchKey = ((t.label || t.term || '') + ' ' + (t.collection || '')).toLowerCase().replace(/"/g, '&quot;');
        return (
        '<div class="ml-term-card ml-term-card-collapsible" id="term-card-' + t.id + '" data-search="' + searchKey + '">' +
          '<div class="ml-term-hdr-toggle" onclick="toggleTermCard(' + t.id + ')">' +
            '<span class="ml-term-hdr-left">' +
              '<span class="ml-term-caret">▶</span>' +
              '<span class="ml-term-name">' + (t.featured ? '🔥 ' : '🔎 ') + (t.label || t.term) + '</span>' +
              (t.collection ? '<span class="ml-term-hdr-collection">· ' + t.collection + '</span>' : '') +
            '</span>' +
            '<span class="ml-term-actions">' +
              '<button class="btn-mini" onclick="event.stopPropagation(); expandTermCard(' + t.id + '); runSearchForTerm(' + JSON.stringify(t).replace(/"/g, '&quot;') + ', document.getElementById(\'res-' + t.id + '\'))">Buscar agora</button>' +
              '<button class="btn-mini' + (t.featured ? ' btn-mini-active' : '') + '" onclick="event.stopPropagation(); toggleFeatured(' + t.id + ',' + (!!t.featured) + ')">' + (t.featured ? '★ Destaque' : '☆ Destacar') + '</button>' +
              '<button class="btn-mini btn-mini-danger" onclick="event.stopPropagation(); removeSearchTerm(' + t.id + ')">✕</button>' +
            '</span>' +
          '</div>' +
          '<div class="ml-term-body">' +
            '<div class="ml-term-sub">catálogo: <code>' + (t.catalog_product_id || t.term) + '</code>' +
              ' · <a href="https://www.mercadolivre.com.br/p/' + (t.catalog_product_id || '') + '" target="_blank" rel="noopener">ver no ML →</a></div>' +
            '<div class="ml-aff-row">' +
              '<input id="aff-' + t.id + '" placeholder="Cole aqui o link meli.la gerado" value="' + (t.affiliate_url || '') + '">' +
              '<button class="btn-mini" onclick="saveAffiliateUrl(' + t.id + ')">Salvar link</button>' +
            '</div>' +
            '<div class="ml-coupon-row">' +
              '<input id="cupom-code-' + t.id + '" placeholder="Código do cupom testado" value="' + (coupon ? coupon.code : '') + '">' +
              '<select id="cupom-type-' + t.id + '">' +
                '<option value="percent"' + (coupon && coupon.discount_type === 'fixed' ? '' : ' selected') + '>%</option>' +
                '<option value="fixed"' + (coupon && coupon.discount_type === 'fixed' ? ' selected' : '') + '>R$</option>' +
              '</select>' +
              '<input id="cupom-value-' + t.id + '" type="number" step="0.01" min="0" placeholder="Valor" value="' + (coupon ? coupon.discount_value : '') + '">' +
              '<button class="btn-mini" onclick="saveProductCoupon(' + t.id + ')">' + (coupon ? 'Atualizar cupom' : 'Salvar cupom') + '</button>' +
              (coupon ? '<button class="btn-mini btn-mini-danger" onclick="removeProductCoupon(' + coupon.id + ')">Remover</button>' : '') +
            '</div>' +
            '<div class="ml-coupon-row">' +
              '<span style="font-size:11px;color:var(--muted);white-space:nowrap">Vincular ao Preço Justo/Simulador:</span>' +
              '<select id="pkey-' + t.id + '" onchange="saveProductKey(' + t.id + ')">' + productKeyOptionsHtml(t.product_key) + '</select>' +
            '</div>' +
            '<div class="ml-coupon-row">' +
              '<span style="font-size:11px;color:var(--muted);white-space:nowrap">Coleção/filtro:</span>' +
              '<input id="coll-' + t.id + '" list="ml-collections-datalist" placeholder="ex: Caos Ascendente, Inglês" value="' + (t.collection || '') + '">' +
              '<button class="btn-mini" onclick="saveCollection(' + t.id + ')">Salvar</button>' +
            '</div>' +
            '<div id="res-' + t.id + '" class="ml-term-results"></div>' +
          '</div>' +
        '</div>'
        );
      }).join('')
    : '<div class="ml-loading">Nenhum termo cadastrado ainda — adicione um acima.</div>';

  const rulesListHtml = rules.length
    ? rules.map(function(r) {
        return (
          '<div class="ml-term-card">' +
            '<div class="ml-term-hdr">' +
              '<span class="ml-term-name">🎟️ ' + r.code + '</span>' +
              '<span class="ml-term-actions">' +
                '<button class="btn-mini' + (r.active ? ' btn-mini-active' : '') + '" onclick="toggleCouponRule(' + r.id + ',' + (!!r.active) + ')">' + (r.active ? '✓ Ativo' : '✕ Pausado') + '</button>' +
                '<button class="btn-mini btn-mini-danger" onclick="removeCouponRule(' + r.id + ')">✕</button>' +
              '</span>' +
            '</div>' +
            '<div class="ml-term-sub">' +
              (r.discount_type === 'percent' ? (+r.discount_value) + '% OFF' : 'R$ ' + fmtBRLLoja(r.discount_value) + ' OFF') +
              (r.min_purchase != null ? ' · compra mínima R$ ' + fmtBRLLoja(r.min_purchase) : '') +
              (r.max_discount != null ? ' · teto R$ ' + fmtBRLLoja(r.max_discount) : '') +
              (r.valid_until ? ' · até ' + new Date(r.valid_until).toLocaleDateString('pt-BR') : '') +
            '</div>' +
          '</div>'
        );
      }).join('')
    : '<div class="ml-loading">Nenhuma regra geral cadastrada ainda.</div>';

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:28px">🎟️ Admin · Regra Geral de Cupom</div>' +
    '<div class="ml-add-hint">Cadastre a regra do cupom UMA vez (ex: "20% OFF acima de R$79, teto R$50") — o site calcula sozinho, em cada produto rastreado, se ela se aplica e mostra o preço com desconto automaticamente. Não precisa vincular produto por produto.</div>' +
    '<div class="ml-coupon-row">' +
      '<input id="rule-code" placeholder="Código do cupom (ex: VALEOFERTA)">' +
      '<select id="rule-type">' +
        '<option value="percent">%</option>' +
        '<option value="fixed">R$</option>' +
      '</select>' +
      '<input id="rule-value" type="number" step="0.01" min="0" placeholder="Valor (ex: 20)">' +
    '</div>' +
    '<div class="ml-coupon-row">' +
      '<input id="rule-min" type="number" step="0.01" min="0" placeholder="Compra mínima R$ (opcional)">' +
      '<input id="rule-max" type="number" step="0.01" min="0" placeholder="Teto de desconto R$ (opcional)">' +
      '<input id="rule-until" type="date" title="Válido até (opcional)">' +
      '<button class="btn-mini" onclick="saveCouponRule()">+ Adicionar regra</button>' +
    '</div>' +
    '<div class="ml-terms-list">' + rulesListHtml + '</div>' +
    '<div class="sec-title" style="margin-top:28px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
      '<span>⚙️ Admin · Cadastrar Produto Rastreado</span>' +
      '<span style="display:flex;align-items:center;gap:10px">' +
        '<button class="btn-mini" id="btn-refresh-all" onclick="refreshAllTerms()">🔄 Atualizar todos agora</button>' +
        '<span id="refresh-all-status" style="font-size:11px;color:var(--muted)"></span>' +
      '</span>' +
    '</div>' +
    '<div class="ml-add-term">' +
      '<input id="new-ml-label" placeholder="Nome do produto (opcional — puxa do ML se deixar em branco)">' +
      '<input id="new-ml-term" placeholder="Link de catálogo do ML (.../p/MLB1234567) ou o ID (MLB1234567)">' +
      '<input id="new-ml-collection" list="ml-collections-datalist" placeholder="Coleção/filtro (ex: Caos Ascendente, Inglês)">' +
      '<button class="btn-add" id="btn-add-ml-term" onclick="onAddCatalogClick()">+ RASTREAR PRODUTO</button>' +
    '</div>' +
    '<datalist id="ml-collections-datalist">' + collectionsDatalistHtml(terms) + '</datalist>' +
    '<div class="ml-add-hint">Cole o link da página de catálogo do produto (a que junta os vários vendedores) — o nome, a imagem e o menor preço são carregados automaticamente. O campo "Coleção/filtro" alimenta o filtro que aparece pros usuários na aba Lojas.</div>' +
    '<input id="ml-admin-term-search" type="text" placeholder="🔎 Filtrar por nome ou coleção..." oninput="filterAdminTerms(this.value)">' +
    '<div class="ml-admin-count" id="ml-admin-count">' + terms.length + ' de ' + terms.length + ' produto(s)</div>' +
    '<div class="ml-terms-list" id="ml-admin-terms-list">' + termsListHtml + '</div>';
}
