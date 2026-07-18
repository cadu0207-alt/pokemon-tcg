// ================================================================
// MyDeck — Sistema de Destaques Automático (lojas_destaques.js)
// Substitui a ordenação da vitrine de "Lojas & Ofertas" (lojas.js) por
// um ranking baseado em dado real de preço, em vez de data de cadastro:
//
//   0. Produto marcado manualmente como "destaque" (estrela/toggleFeatured,
//      term.featured = true) SEMPRE aparece em "🔥 Ofertas em Destaque",
//      não importa o score — prioridade absoluta sobre o ranking automático.
//   1. Cada produto ganha um "score de desconto" = o quanto o preço
//      MAIS RECENTE está abaixo da MEDIANA do próprio histórico dele
//      (computeDealScore, já definida em lojas.js).
//   2. Depois dos pins manuais, completa até 10 vagas de destaque só com
//      quem tem DESCONTO REAL (score > 0) — em ordem, maior desconto
//      primeiro. Se não tiver 10 produtos com desconto real, o destaque
//      fica com menos de 10 (nunca "estica" com produto sem desconto).
//   2.1. O selo "🔥 OFERTA IMPERDÍVEL" só aparece em quem tem desconto
//      real. Pin manual sem desconto real ainda entra em destaque (regra
//      0), mas ganha o selo neutro "★ EM DESTAQUE" em vez do selo de
//      desconto — pra não prometer economia que não existe.
//   3. Do produto seguinte em diante, ordem aleatória (embaralhada a cada
//      carregamento da aba) — mostra "o resto" sem sempre repetir os
//      mesmos por último.
//   4. Ao clicar num filtro de coleção, os produtos daquela coleção
//      (destaque + resto, juntos) são sempre reordenados por: pin manual
//      primeiro, depois maior desconto — a aleatoriedade só vale pra
//      visão "Todos".
//
// Carregado DEPOIS de lojas.js: sobrescreve window.renderShowcaseSection
// e window.filterLojasByCollection por completo (mesmo padrão de
// monkey-patch já usado em admin_stats.js/xp_system.js) — evita editar
// lojas.js diretamente, arquivo que já teve truncamentos recorrentes
// nesta sessão de trabalho.
// ================================================================

async function renderShowcaseSection() {
  const holder = document.getElementById('lojas-showcase');
  if (!holder) return;
  const terms = await loadSearchTerms();
  if (!terms.length) {
    holder.innerHTML = '<div class="ml-loading">Nenhuma oferta cadastrada ainda.</div>';
    return;
  }
  const [histories, coupons, rules] = await Promise.all([
    Promise.all(terms.map(t => loadPriceHistory(t.id))),
    loadCoupons(),
    loadCouponRules()
  ]);

  // Score de desconto por produto (null = histórico insuficiente,
  // menos de 2 registros de preço — ainda não dá pra comparar).
  const scored = terms.map((t, i) => ({
    term: t,
    history: histories[i],
    score: computeDealScore(histories[i])
  }));

  const byScoreDesc = function(a, b) {
    const sa = a.score == null ? -Infinity : a.score;
    const sb = b.score == null ? -Infinity : b.score;
    return sb - sa;
  };

  // Pin manual (estrela do admin, term.featured) SEMPRE entra em destaque,
  // não importa quantos sejam nem qual o score — prioridade absoluta.
  // Já a vaga AUTOMÁTICA só é preenchida por quem tem desconto REAL
  // (score > 0 — preço atual genuinamente abaixo da mediana/média do
  // próprio histórico). Sem isso, produto com preço "normal" (score 0
  // ou negativo) não ocupa vaga de destaque nem ganha selo de oferta.
  const pinned = scored.filter(x => x.term.featured).sort(byScoreDesc);
  const autoPool = scored.filter(x => !x.term.featured && x.score > 0).sort(byScoreDesc);

  const DESTAQUE_SIZE = 10; // teto — pode ter MENOS se faltar desconto real pra preencher
  const autoSlots = Math.max(0, DESTAQUE_SIZE - pinned.length);
  const destaqueList = pinned.concat(autoPool.slice(0, autoSlots));
  const destaqueIds = new Set(destaqueList.map(x => x.term.id));
  const restList = scored.filter(x => !destaqueIds.has(x.term.id));
  shuffleInPlace(restList);

  // Selo de desconto ("🔥 OFERTA IMPERDÍVEL") só quando o desconto é real.
  // Pin manual sem desconto real ainda aparece em destaque (regra acima),
  // mas com selo neutro — sem alegar economia que não existe.
  const featuredCards = destaqueList.map(x => {
    const html = renderProductCard(x.term, x.history, true, couponForTerm(coupons, x.term.id), rules, x.score);
    const hasRealDiscount = x.score != null && x.score > 0;
    return hasRealDiscount ? html : html.replace('🔥 OFERTA IMPERDÍVEL', '★ EM DESTAQUE');
  });
  const normalCards = restList.map(x =>
    renderProductCard(x.term, x.history, false, couponForTerm(coupons, x.term.id), rules, x.score)
  );

  let html = '<div class="ml-price-warning">⚠️ Os preços aqui mostram sempre o <strong>menor valor encontrado entre todos os vendedores</strong> do produto no Mercado Livre — mesmo que esse vendedor tenha poucas vendas ou pouca reputação ainda. Antes de comprar, confira a avaliação e o histórico do vendedor na página do anúncio.</div>';
  html += renderCollectionFilterBar(terms);
  if (featuredCards.length) {
    html += '<div class="sec-title" style="margin-top:8px">🔥 Ofertas em Destaque</div>';
    html += '<div class="products-grid products-grid-featured">' + featuredCards.join('') + '</div>';
  }
  html += '<div class="sec-title" style="margin-top:24px">🛒 Ofertas Rastreadas · Mercado Livre</div>';
  html += '<div class="products-grid">' + (normalCards.join('') || '<div class="ml-loading">Nenhuma outra oferta cadastrada.</div>') + '</div>';

  holder.innerHTML = html;

  // Marca cada card já renderizado com metadado que não dá pra tirar só do
  // HTML (se veio de pin manual) — usado depois pro re-sort ao filtrar por
  // coleção. Propriedade JS direta no elemento (não atributo), sobrevive
  // a appendChild (mover o nó no DOM não apaga propriedades já setadas).
  const featuredGrid = holder.querySelector('.products-grid-featured');
  if (featuredGrid) {
    Array.from(featuredGrid.querySelectorAll('.product-card')).forEach(function(el, i) {
      el._pinned = !!(destaqueList[i] && destaqueList[i].term.featured);
    });
  }
  const normalGrids = Array.from(holder.querySelectorAll('.products-grid')).filter(g => g !== featuredGrid);
  normalGrids.forEach(function(grid) {
    Array.from(grid.querySelectorAll('.product-card')).forEach(function(el, i) {
      el._pinned = !!(restList[i] && restList[i].term.featured); // sempre false aqui, mas mantém consistência
    });
  });

  // Guarda a ordem inicial (pin manual + destaque por score + resto
  // embaralhado) pra poder restaurar exatamente essa ordem quando o
  // filtro voltar pra "Todos".
  holder.querySelectorAll('.products-grid').forEach(function(grid) {
    grid._initialOrder = Array.from(grid.querySelectorAll('.product-card'));
  });
}

function filterLojasByCollection(collection, btn) {
  const bar = btn ? btn.closest('.collection-filter-bar') : null;
  if (bar) {
    bar.querySelectorAll('.filter-chip').forEach(function(el) { el.classList.remove('filter-chip-active'); });
    if (btn) btn.classList.add('filter-chip-active');
  }

  document.querySelectorAll('#lojas-showcase .products-grid').forEach(function(grid) {
    const cards = Array.from(grid.querySelectorAll('.product-card'));
    cards.forEach(function(card) {
      const match = !collection || card.getAttribute('data-collection') === collection;
      card.classList.toggle('product-card-hidden', !match);
    });

    if (collection) {
      // Filtro ativo: pin manual primeiro, depois SEMPRE maior desconto
      // (sem aleatoriedade), só entre os cards que batem com a coleção.
      const matching = cards.filter(function(c) { return c.getAttribute('data-collection') === collection; });
      matching.sort(function(a, b) {
        const pa = a._pinned ? 1 : 0, pb = b._pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        const sa = a.dataset.dealScore === '' || a.dataset.dealScore == null ? -Infinity : +a.dataset.dealScore;
        const sb = b.dataset.dealScore === '' || b.dataset.dealScore == null ? -Infinity : +b.dataset.dealScore;
        return sb - sa;
      });
      matching.forEach(function(c) { grid.appendChild(c); });
    } else {
      // "Todos": restaura a ordem original do carregamento da aba
      // (pin manual + destaque por score + resto na ordem embaralhada).
      const original = grid._initialOrder || cards;
      original.forEach(function(c) { grid.appendChild(c); });
    }
  });

  // Some seção some se nenhum card dela sobreviveu ao filtro.
  document.querySelectorAll('#lojas-showcase .products-grid').forEach(function(grid) {
    const visible = grid.querySelectorAll('.product-card:not(.product-card-hidden)').length;
    const title = grid.previousElementSibling;
    const hide = visible === 0;
    grid.classList.toggle('products-grid-hidden', hide);
    if (title && title.classList.contains('sec-title')) title.classList.toggle('products-grid-hidden', hide);
  });
}
