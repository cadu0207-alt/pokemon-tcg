// ================================================================
// MyDeck — Corrige o preço/link exibido nos cards de produto
// (lojas_fix_latest_price.js)
//
// Antes: renderProductCard() usava bestRecord() — o MENOR preço de
// TODO o histórico já raspado, com o link salvo NAQUELE momento
// específico. Isso nunca expira: uma promoção pontual de semanas
// atrás continuava marcada como preço válido, com um link que já não
// reflete mais aquela oferta → usuário clica e o preço bate diferente
// no Mercado Livre. Reportado pelo Eduardo em 29/07/2026.
//
// Agora: preço + link + imagem principais vêm do registro MAIS
// RECENTE (latestRecord), que é sempre a raspagem mais nova (cron
// roda de hora em hora) — então o que aparece no card bate com o que
// tem no ML agora (ou no máximo com ~1h de defasagem).
//
// A intenção original de mostrar o "menor preço" não foi perdida —
// só virou selo secundário, dentro do bloco de estatísticas que já
// existia (Menor / Mediana / Média / Maior, computePriceStats), em
// vez de ser o preço principal clicável.
//
// Não edita lojas.js diretamente (arquivo grande, histórico de
// truncamento no mount do sandbox — ver feedback de coding do
// projeto). Precisa carregar DEPOIS de lojas.js.
// ================================================================

function renderProductCard(term, history, featured, coupon, rules, dealScore) {
  const latest = latestRecord(history);
  const label = term.label || term.term;
  const linkUrl = term.affiliate_url || (latest ? latest.url : null);

  const collectionAttr = ' data-collection="' + (term.collection || '').replace(/"/g, '&quot;') + '"';
  const scoreAttr = ' data-deal-score="' + (dealScore == null ? '' : dealScore) + '"';

  if (!latest) {
    return (
      '<div class="product-card' + (featured ? ' product-card-featured' : '') + '"' + collectionAttr + scoreAttr + '>' +
        '<div class="product-img product-img-empty">📦</div>' +
        '<div class="product-info">' +
          '<div class="product-name">' + label + '</div>' +
          '<div class="product-empty-note">Ainda sem preços registrados — em breve.</div>' +
        '</div>' +
      '</div>'
    );
  }

  const updatedStr = latest.found_at ? new Date(latest.found_at).toLocaleDateString('pt-BR') : '';
  const imgSrc = term.image_url || latest.thumbnail;

  // Compara o cupom vinculado direto ao produto (manual) com a melhor
  // regra geral aplicável ao preço — usa o que der mais desconto.
  // Agora calculado em cima do preço MAIS RECENTE, não do menor histórico.
  const productCouponDiscount = coupon ? applyCouponDiscount(+latest.price, coupon) : null;
  const ruleMatch = (rules && rules.length) ? bestRuleForPrice(rules, +latest.price) : null;

  let discounted = null, badgeCode = null, badgeLabel = null;
  const productSaved = productCouponDiscount != null ? (+latest.price - productCouponDiscount) : null;
  if (productSaved != null && (!ruleMatch || productSaved <= ruleMatch.finalPrice)) {
    discounted = productSaved;
    badgeCode = coupon.code;
    badgeLabel = coupon.discount || '';
  } else if (ruleMatch) {
    discounted = ruleMatch.finalPrice;
    badgeCode = ruleMatch.rule.code;
    const r = ruleMatch.rule;
    badgeLabel = r.discount_type === 'percent' ? (+r.discount_value) + '% OFF' : 'R$ ' + fmtBRLLoja(r.discount_value) + ' OFF';
  }

  const stats = computePriceStats(history);
  const statsHtml = (stats && stats.count > 1)
    ? (
        '<div class="product-stats">' +
          '<div class="product-stat"><span class="product-stat-lbl">Menor</span><span class="product-stat-val">R$ ' + fmtBRLLoja(stats.min) + '</span></div>' +
          '<div class="product-stat"><span class="product-stat-lbl">Mediana</span><span class="product-stat-val">R$ ' + fmtBRLLoja(stats.median) + '</span></div>' +
          '<div class="product-stat"><span class="product-stat-lbl">Média</span><span class="product-stat-val">R$ ' + fmtBRLLoja(stats.avg) + '</span></div>' +
          '<div class="product-stat"><span class="product-stat-lbl">Maior</span><span class="product-stat-val">R$ ' + fmtBRLLoja(stats.max) + '</span></div>' +
        '</div>'
      )
    : '';

  const priceHtml = discounted != null
    ? (
        '<div class="product-price product-price-with-coupon">' +
          '<span class="product-price-old">R$ ' + fmtBRLLoja(latest.price) + '</span>' +
          '<span class="product-price-new">R$ ' + fmtBRLLoja(discounted) + '</span>' +
        '</div>' +
        '<div class="product-coupon-badge">🎟️ Cupom <code>' + badgeCode + '</code> · ' + badgeLabel + '</div>'
      )
    : '<div class="product-price">R$ ' + fmtBRLLoja(latest.price) + '</div>';
  return (
    '<a class="product-card' + (featured ? ' product-card-featured' : '') + '"' + collectionAttr + scoreAttr + ' href="' + linkUrl + '" target="_blank" rel="noopener' + (term.affiliate_url ? ' sponsored' : '') + '">' +
      (featured ? '<div class="product-badge">🔥 OFERTA IMPERDÍVEL</div>' : '') +
      '<img class="product-img" src="' + imgSrc + '" alt="' + label + '">' +
      '<div class="product-info">' +
        '<div class="product-name">' + label + '</div>' +
        priceHtml +
        // AUDITORIA 03/08/2026: o aviso de raspagem repetia em TODOS os cards
        // (ruído visual) — a informação já está no aviso amarelo global no topo
        // da aba. Aqui fica só o "atualizado em", com tooltip pra quem quiser.
        '<div class="product-note" title="Raspagem de preço roda a cada hora — pode levar até 1h pra refletir mudanças do Mercado Livre.">' + (updatedStr ? 'atualizado ' + updatedStr : 'preço atual') + '</div>' +
        statsHtml +
      '</div>' +
    '</a>'
  );
}
