// ================================================================
// MyDeck — Preço velho não aparece como preço atual (lojas_precos_velhos.js)
//
// 26/11/2026: o Mercado Livre passou a recusar (403) a consulta de vendedores/preços desde 23/11 e a vitrine seguia
// mostrando o último preço lido como se valesse. Agora, produto cuja última leitura tem mais de 24 h:
//   • não mostra preço, cupom, valor por booster, estatísticas, selo de oferta, alerta nem "Enviar pro grupo";
//   • mostra "Ver preço no Mercado Livre", com o mesmo link (de afiliado) de sempre;
//   • não entra nos destaques por desconto.
// Se nenhum produto tiver preço recente, aparece um aviso no topo da aba. É automático: quando as leituras voltarem,
// os preços voltam sozinhos, sem publicar nada.
//
// Carregar DEPOIS de todos os outros lojas_*.js (envolve renderProductCard e renderShowcaseSection por fora).
// ================================================================

const LOJAS_PRECO_VALIDADE_H = 24;

function lojasPrecoVelho(history) {
  const latest = history && history.length ? history[history.length - 1] : null;
  if (!latest || !latest.found_at) return false; // sem leitura nenhuma: o card original já diz isso
  return Date.now() - new Date(latest.found_at).getTime() > LOJAS_PRECO_VALIDADE_H * 3600000;
}

// contagem da montagem atual da vitrine (para o aviso do topo)
let _lojasVelhos = { total: 0, velhos: 0, datas: [] };

function lojasCardSemPreco(term, history, featured) {
  const latest = history[history.length - 1];
  const label = esc(term.label || term.term);
  const safeUrl = function (u) { return (typeof u === 'string' && /^https:\/\//i.test(u)) ? u.replace(/"/g, '%22') : null; };
  const link = safeUrl(term.affiliate_url) || safeUrl(latest.url) ||
    (/^MLB\d+$/.test(term.catalog_product_id || '') ? 'https://www.mercadolivre.com.br/p/' + term.catalog_product_id : null);
  const img = safeUrl(term.image_url) || safeUrl(latest.thumbnail);
  const quando = new Date(latest.found_at).toLocaleDateString('pt-BR');
  const name = label.replace(/"/g, '&quot;');
  return (
    '<a class="product-card product-card-sem-preco' + (featured && term.featured ? ' product-card-featured' : '') + '"' +
      ' data-collection="' + String(term.collection || '').replace(/"/g, '&quot;') + '" data-deal-score=""' +
      ' data-lo-price="" data-lo-ppb="" data-lo-msrp="" data-lo-name="' + name + '"' +
      ' href="' + (link || '#') + '" target="_blank" rel="noopener' + (term.affiliate_url ? ' sponsored' : '') + '"' +
      ' onclick="if(typeof logProductRedirect===\'function\')logProductRedirect(' + (+term.id) + ')">' +
      (img ? '<img class="product-img" src="' + img + '" alt="' + name + '" loading="lazy" decoding="async">' : '<div class="product-img product-img-empty">📦</div>') +
      '<div class="product-info">' +
        '<div class="product-name">' + label + '</div>' +
        '<div class="product-ver-preco">Ver preço no Mercado Livre →</div>' +
        '<div class="product-note">sem preço atualizado desde ' + quando + '</div>' +
      '</div>' +
    '</a>'
  );
}

if (typeof window.renderProductCard === 'function') {
  const _origRenderProductCardVelho = window.renderProductCard;
  window.renderProductCard = function (term, history, featured) {
    if (term && history && history.length) {
      _lojasVelhos.total++;
      _lojasVelhos.datas.push(new Date(history[history.length - 1].found_at).getTime() || 0);
      if (lojasPrecoVelho(history)) {
        _lojasVelhos.velhos++;
        return lojasCardSemPreco(term, history, featured);
      }
    }
    return _origRenderProductCardVelho.apply(this, arguments);
  };
}

// produto sem preço recente não disputa destaque por desconto
if (typeof window.computeDealScore === 'function') {
  const _origDealScoreVelho = window.computeDealScore;
  window.computeDealScore = function (history) {
    return lojasPrecoVelho(history) ? null : _origDealScoreVelho.apply(this, arguments);
  };
}

if (typeof window.renderShowcaseSection === 'function') {
  const _origRenderShowcaseVelho = window.renderShowcaseSection;
  window.renderShowcaseSection = async function () {
    _lojasVelhos = { total: 0, velhos: 0, datas: [] };
    const r = await _origRenderShowcaseVelho.apply(this, arguments);
    const holder = document.getElementById('lojas-showcase');
    if (!holder || !_lojasVelhos.total || _lojasVelhos.velhos < _lojasVelhos.total) return r;
    // nenhum preço recente: troca o texto do topo e dá nome neutro às seções
    // data do meio da lista: uma leitura isolada mais nova não representa a vitrine
    const datas = _lojasVelhos.datas.slice().sort(function (a, b) { return a - b; });
    const desde = new Date(datas[Math.floor(datas.length / 2)]).toLocaleDateString('pt-BR');
    const aviso = holder.querySelector('.ml-price-warning');
    const texto = '⚠️ <strong>Preços temporariamente indisponíveis.</strong> O Mercado Livre parou de liberar a consulta de preços para o MyDeck (última atualização em ' + desde + '). Os links continuam funcionando: toque no produto para ver o preço atual no Mercado Livre.';
    if (aviso) aviso.innerHTML = texto;
    else holder.insertAdjacentHTML('afterbegin', '<div class="ml-price-warning">' + texto + '</div>');
    holder.querySelectorAll('.sec-title').forEach(function (t) {
      if (t.textContent.indexOf('Ofertas em Destaque') >= 0) t.textContent = '⭐ Produtos em destaque';
    });
    return r;
  };
}

(function injectPrecoVelhoStyle() {
  const style = document.createElement('style');
  style.textContent = '.product-ver-preco{margin-top:8px;font-weight:700;font-size:14px;color:var(--teal,#06d6a0)}';
  document.head.appendChild(style);
})();
