// ================================================================
// MyDeck — Botão "Enviar pro grupo" no WhatsApp (lojas_whatsapp.js)
//
// Adiciona um botão em CADA card de oferta (aba "Lojas & Ofertas") que
// monta uma mensagem formatada (produto, preço atual, comparação com a
// média de preço dos últimos 60 dias, cupom aplicável e valor final com
// cupom, link de afiliado) e abre o WhatsApp com o texto já pronto —
// o Eduardo confere e aperta enviar manualmente pro grupo dele.
//
// Decisão (23/08/2026, confirmada com o Eduardo): NÃO usa a API oficial
// do WhatsApp Business/Cloud (ela não posta em grupo nenhum, só 1:1 com
// template pré-aprovado pela Meta) nem automação não-oficial tipo
// Baileys/whatsapp-web.js (risco real de o número ser banido, frágil a
// qualquer mudança do WhatsApp Web). É só um link `wa.me` com o texto
// pronto — 100% dentro das regras do WhatsApp, zero custo, e o envio
// final continua sendo decisão manual dele.
//
// Carregado DEPOIS de lojas_fix_latest_price.js (é essa a versão de
// renderProductCard() realmente ativa hoje — sobrescreve a de lojas.js)
// e depois de lojas_destaques.js. Redefine renderProductCard() de novo,
// chamando a versão anterior (seja ela qual for) e só injetando o botão
// no HTML retornado, sem duplicar a lógica de montagem do card — mesmo
// padrão de monkey-patch em camadas já usado no projeto (marketplace.js
// → price_history.js sobre openBinderModal).
// ================================================================

window._lojasWhatsappMsgs = window._lojasWhatsappMsgs || {};

// Preço médio dos ÚLTIMOS 60 DIAS — diferente de computePriceStats()
// (lojas.js), que usa o histórico INTEIRO do produto (até 500 registros,
// podendo ter meses). Pedido explícito do Eduardo: a mensagem precisa
// comparar com "o normal recente" (60 dias), não com um preço de muito
// tempo atrás que já não representa o mercado hoje.
function avgPriceLast60Days(history) {
  const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
  const prices = (history || [])
    .filter(function (r) { return r.found_at && new Date(r.found_at).getTime() >= cutoff; })
    .map(function (r) { return +r.price; })
    .filter(function (p) { return Number.isFinite(p) && p > 0; });
  if (!prices.length) return null;
  return prices.reduce(function (a, b) { return a + b; }, 0) / prices.length;
}

// Monta o texto da mensagem. Retorna null se o produto ainda não tem
// nenhum preço registrado (mesmo caso em que renderProductCard() mostra
// "Ainda sem preços registrados" em vez do card completo) — nesse caso
// não faz sentido nenhum ter botão de enviar.
function buildWhatsappMessage(term, history, coupon, rules) {
  const latest = (history && history.length) ? history[history.length - 1] : null;
  if (!latest) return null;
  const label = term.label || term.term;
  const linkUrl = term.affiliate_url || latest.url;
  if (!linkUrl) return null;
  const price = +latest.price;
  if (!Number.isFinite(price) || price <= 0) return null;
  const avg60 = avgPriceLast60Days(history);

  // Mesmo cálculo de cupom/regra que renderProductCard() já faz (ver
  // lojas_fix_latest_price.js) — duplicado aqui de propósito, pra este
  // arquivo-patch ficar isolado e não criar acoplamento direto com o
  // outro patch (se um dos dois for removido/mudar no futuro, o outro
  // continua funcionando sozinho).
  const couponDiscount = coupon ? applyCouponDiscount(price, coupon) : null;
  const ruleMatch = (rules && rules.length) ? bestRuleForPrice(rules, price) : null;
  let finalWithCoupon = null, couponCode = null;
  const productSaved = couponDiscount != null ? (price - couponDiscount) : null;
  if (productSaved != null && (!ruleMatch || productSaved <= ruleMatch.finalPrice)) {
    finalWithCoupon = productSaved;
    couponCode = coupon.code;
  } else if (ruleMatch) {
    finalWithCoupon = ruleMatch.finalPrice;
    couponCode = ruleMatch.rule.code;
  }

  let msg = '🔥 *' + label + '*\n\n';
  msg += '💰 Preço atual: R$ ' + fmtBRLLoja(price) + '\n';
  if (avg60 != null) {
    if (avg60 > price) {
      const pct = ((avg60 - price) / avg60) * 100;
      msg += '📊 Média dos últimos 60 dias: R$ ' + fmtBRLLoja(avg60) + ' — ' + pct.toFixed(0) + '% mais barato agora!\n';
    } else {
      msg += '📊 Média dos últimos 60 dias: R$ ' + fmtBRLLoja(avg60) + '\n';
    }
  }
  if (finalWithCoupon != null && couponCode) {
    msg += '🎟️ Com o cupom ' + couponCode + ': R$ ' + fmtBRLLoja(finalWithCoupon);
    if (avg60 != null && avg60 > finalWithCoupon) {
      const pctC = ((avg60 - finalWithCoupon) / avg60) * 100;
      msg += ' (' + pctC.toFixed(0) + '% abaixo da média)';
    }
    msg += '\n';
  }
  msg += '\n🔗 ' + linkUrl;
  return msg;
}

function sendDestaqueToWhatsApp(termId) {
  const msg = window._lojasWhatsappMsgs[termId];
  if (!msg) { alert('Não consegui montar a mensagem dessa oferta.'); return; }
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

if (typeof window.renderProductCard === 'function') {
  const _origRenderProductCardForWhatsapp = window.renderProductCard;
  window.renderProductCard = function (term, history, featured, coupon, rules, dealScore) {
    const html = _origRenderProductCardForWhatsapp(term, history, featured, coupon, rules, dealScore);
    const msg = buildWhatsappMessage(term, history, coupon, rules);
    if (!msg) return html; // produto sem preço registrado ainda — sem botão, sem quebrar o card
    window._lojasWhatsappMsgs[term.id] = msg;
    const btn = '<button type="button" class="product-whatsapp-btn" onclick="event.preventDefault();event.stopPropagation();sendDestaqueToWhatsApp(' + term.id + ')">📱 Enviar pro grupo</button>';
    // O card inteiro é um <a> clicável (linka pro anúncio do ML) — o
    // botão entra como último filho, logo antes do </a> de fechamento,
    // com preventDefault+stopPropagation pro clique nele não também
    // abrir o link do produto por baixo.
    const closeIdx = html.lastIndexOf('</a>');
    if (closeIdx === -1) return html; // formato inesperado (ex: card "sem preço ainda") — não injeta, não quebra
    return html.slice(0, closeIdx) + btn + html.slice(closeIdx);
  };
}

// ── ESTILO DO BOTÃO (injetado via <style>, sem tocar style.css) ────
(function injectWhatsappBtnStyle() {
  const css =
    '.product-whatsapp-btn{' +
      'display:block;width:100%;margin-top:8px;padding:7px 10px;' +
      'background:#25D366;color:#fff;border:none;border-radius:6px;' +
      "font-family:'Space Mono',monospace;font-size:10.5px;font-weight:700;" +
      'letter-spacing:0.3px;cursor:pointer;text-align:center;' +
      'transition:background 0.15s;' +
    '}' +
    '.product-whatsapp-btn:hover{background:#1ebe57}';
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();
