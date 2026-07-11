// ================================================================
// MyDeck — Lojas & Ofertas (lojas.js)
// Aba de indicação de lojas parceiras + rastreador de ofertas no
// Mercado Livre (busca por termo, link de afiliado, histórico de
// preço e cupons). Carregado depois de app.js — reaproveita sbClient,
// currentUser, uid() e USD_BRL já definidos lá.
// ================================================================

// ── CONFIG: lojas parceiras ─────────────────────────────────────
// Edite/preencha os links reais de cada loja aqui.
const STORES = [
  {
    name: 'iWorld TCG',
    city: 'Pereira Barreto · SP',
    logo: 'https://ugc.production.linktr.ee/929ba8e6-3ff8-4f67-8973-e6f071b900cf_8567fd8ded86adcb458e6ac291267689-tplv-tiktokx-cropcenter-1080-1080.jpeg',
    tiktok: 'https://www.tiktok.com/@iworldtcg',
    instagram: '',
    whatsapp: '',
    color: '#22c55e',
    tag: '🤝 Parceria oficial'
  },
  {
    name: 'CoffeeCat - Pokémon TCG',
    city: '', // TODO Eduardo: preencher cidade/região
    logo: '',
    tiktok: '',
    instagram: '', // TODO Eduardo: colar link do Instagram/TikTok da loja
    whatsapp: '',
    color: '#c8960a',
    tag: '⭐ Loja recomendada'
  },
  {
    name: 'TOYBOX POKE CARDS',
    city: '', // TODO Eduardo: preencher cidade/região
    logo: '',
    tiktok: '',
    instagram: '', // TODO Eduardo: colar link do Instagram/TikTok da loja
    whatsapp: '',
    color: '#0e7898',
    tag: '⭐ Loja recomendada'
  }
];

// ── CONFIG: afiliado Mercado Livre ──────────────────────────────
// TODO Eduardo: troque pelos seus parâmetros reais de afiliado
// (o Mercado Livre costuma usar algo como matt_word / matt_tool —
// copie do painel de afiliados dentro do app que você já criou).
const ML_AFFILIATE_PARAMS = 'matt_word=SEU_CODIGO_AQUI&matt_tool=SEU_CODIGO_AQUI';

function toAffiliateLink(url) {
  if (!url) return '#';
  try {
    const u = new URL(url);
    const sep = u.search ? '&' : '?';
    return url + sep + ML_AFFILIATE_PARAMS;
  } catch (e) {
    return url;
  }
}

function mlSearchUrl(term) {
  return 'https://lista.mercadolivre.com.br/' + encodeURIComponent(term).replace(/%20/g, '-');
}

// ── STATE ────────────────────────────────────────────────────────
let _lojasTerms = [];
let _lojasResultsCache = {}; // termId -> [results]

// ── DATA: termos de busca (Supabase) ────────────────────────────
async function loadSearchTerms() {
  if (!sbClient || !uid()) { _lojasTerms = []; return []; }
  const { data, error } = await sbClient
    .from('ml_search_terms')
    .select('*')
    .eq('user_id', uid())
    .order('created_at', { ascending: false });
  if (error) { console.error('loadSearchTerms', error); _lojasTerms = []; return []; }
  _lojasTerms = data || [];
  return _lojasTerms;
}

async function addSearchTerm(term) {
  if (!sbClient || !uid() || !term.trim()) return;
  const { error } = await sbClient
    .from('ml_search_terms')
    .insert({ user_id: uid(), term: term.trim() });
  if (error) { alert('Erro ao salvar termo: ' + error.message); return; }
  await loadSearchTerms();
  renderLojas();
}

async function removeSearchTerm(id) {
  if (!sbClient) return;
  await sbClient.from('ml_search_terms').delete().eq('id', id);
  await loadSearchTerms();
  renderLojas();
}

async function loadPriceHistory(termId) {
  if (!sbClient) return [];
  const { data, error } = await sbClient
    .from('ml_price_history')
    .select('*')
    .eq('term_id', termId)
    .order('found_at', { ascending: true })
    .limit(60);
  if (error) { console.error('loadPriceHistory', error); return []; }
  return data || [];
}

async function insertPriceRecords(termId, results) {
  if (!sbClient || !results.length) return;
  const rows = results.slice(0, 10).map(r => ({
    term_id: termId,
    ml_item_id: r.id,
    title: r.title,
    price: r.price,
    currency: r.currency_id || 'BRL',
    url: r.permalink,
    thumbnail: r.thumbnail,
    seller: r.seller?.nickname || ''
  }));
  const { error } = await sbClient.from('ml_price_history').insert(rows);
  if (error) console.error('insertPriceRecords', error);
}

// ── DATA: cupons (leitura pública) ──────────────────────────────
async function loadCoupons() {
  if (!sbClient) return [];
  const { data, error } = await sbClient
    .from('ml_coupons')
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) { console.error('loadCoupons', error); return []; }
  return data || [];
}

// ── BUSCA no Mercado Livre (API pública) ────────────────────────
async function searchMercadoLivre(term) {
  try {
    const url = 'https://api.mercadolibre.com/sites/MLB/search?q=' + encodeURIComponent(term) + '&limit=12';
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return (json.results || []).sort((a, b) => a.price - b.price);
  } catch (e) {
    console.warn('searchMercadoLivre falhou (provável bloqueio de CORS no navegador):', e);
    return null; // null = falhou, diferente de [] = busca ok sem resultados
  }
}

async function runSearchForTerm(termObj, containerEl) {
  containerEl.innerHTML = '<div class="ml-loading">🔎 Buscando ofertas para "' + termObj.term + '"...</div>';
  const results = await searchMercadoLivre(termObj.term);
  if (results === null) {
    containerEl.innerHTML =
      '<div class="ml-loading">⚠️ Não consegui buscar direto (bloqueio do navegador). ' +
      '<a href="' + toAffiliateLink(mlSearchUrl(termObj.term)) + '" target="_blank" rel="noopener">Abrir busca no Mercado Livre →</a></div>';
    return;
  }
  _lojasResultsCache[termObj.id] = results;
  if (results.length) await insertPriceRecords(termObj.id, results);
  const history = await loadPriceHistory(termObj.id);
  containerEl.innerHTML = renderResultsBlock(termObj, results, history);
}

// ── RENDER: cartão de loja ───────────────────────────────────────
function renderStoreCard(s) {
  const links = [];
  if (s.tiktok) links.push('<a href="' + s.tiktok + '" target="_blank" rel="noopener">🎵 TikTok</a>');
  if (s.instagram) links.push('<a href="' + s.instagram + '" target="_blank" rel="noopener">📸 Instagram</a>');
  if (s.whatsapp) links.push('<a href="' + s.whatsapp + '" target="_blank" rel="noopener">💬 WhatsApp</a>');
  const linksHtml = links.length ? links.join(' &nbsp;·&nbsp; ') : '<span style="opacity:.5">links em breve</span>';
  return (
    '<div class="store-card" style="--store-color:' + s.color + '">' +
      (s.logo ? '<img class="store-logo" src="' + s.logo + '" alt="' + s.name + '">' : '<div class="store-logo store-logo-fallback">🛍️</div>') +
      '<div class="store-info">' +
        '<div class="store-tag">' + s.tag + '</div>' +
        '<div class="store-name">' + s.name + '</div>' +
        (s.city ? '<div class="store-city">📍 ' + s.city + '</div>' : '') +
        '<div class="store-links">' + linksHtml + '</div>' +
      '</div>' +
    '</div>'
  );
}

// ── RENDER: bloco de resultados de uma busca ────────────────────
function renderResultsBlock(termObj, results, history) {
  if (!results.length) {
    return '<div class="ml-loading">Nenhum resultado encontrado agora para "' + termObj.term + '".</div>';
  }
  const best = results[0];
  const cards = results.slice(0, 6).map(r => (
    '<a class="ml-result" href="' + toAffiliateLink(r.permalink) + '" target="_blank" rel="noopener">' +
      '<img src="' + r.thumbnail + '" alt="">' +
      '<div class="ml-result-info">' +
        '<div class="ml-result-title">' + (r.title || '').slice(0, 60) + '</div>' +
        '<div class="ml-result-price">R$ ' + fmtBRLLoja(r.price) + '</div>' +
        '<div class="ml-result-seller">' + (r.seller?.nickname || '') + '</div>' +
      '</div>' +
    '</a>'
  )).join('');

  const chartHtml = history.length > 1 ? renderPriceSparkline(history) : '';
  const lowest = history.length ? Math.min(...history.map(h => +h.price)) : best.price;

  return (
    '<div class="ml-summary">Menor preço já registrado: <b>R$ ' + fmtBRLLoja(lowest) + '</b> · Melhor preço agora: <b>R$ ' + fmtBRLLoja(best.price) + '</b></div>' +
    chartHtml +
    '<div class="ml-results-grid">' + cards + '</div>'
  );
}

function fmtBRLLoja(v) {
  return (+v || 0).toFixed(2).replace('.', ',');
}

// ── RENDER: mini gráfico de histórico de preço (canvas) ─────────
function renderPriceSparkline(history) {
  const id = 'spark-' + Math.random().toString(36).slice(2);
  setTimeout(() => drawSparkline(id, history), 0);
  return '<canvas id="' + id + '" class="price-sparkline" width="600" height="90"></canvas>';
}

function drawSparkline(canvasId, history) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height, pad = 10;
  const prices = history.map(p => +p.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = (max - min) || 1;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.strokeStyle = '#e63946';
  ctx.lineWidth = 2;
  history.forEach((p, i) => {
    const x = pad + (i / (history.length - 1 || 1)) * (w - pad * 2);
    const y = h - pad - ((+p.price - min) / range) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  // pontos
  ctx.fillStyle = '#e63946';
  history.forEach((p, i) => {
    const x = pad + (i / (history.length - 1 || 1)) * (w - pad * 2);
    const y = h - pad - ((+p.price - min) / range) * (h - pad * 2);
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  });
}

// ── RENDER: cupons ───────────────────────────────────────────────
function renderCouponsBlock(coupons) {
  const query = encodeURIComponent('cupom mercado livre pokemon tcg');
  const extLinks = (
    '<a href="https://www.pelando.com.br/busca?q=' + query + '" target="_blank" rel="noopener">Pelando</a> · ' +
    '<a href="https://www.cuponomia.com.br/busca?q=' + query + '" target="_blank" rel="noopener">Cuponomia</a> · ' +
    '<a href="https://www.google.com/search?q=' + query + '" target="_blank" rel="noopener">Google</a>'
  );
  const list = coupons.length
    ? coupons.map(c => (
        '<div class="coupon-card">' +
          '<div class="coupon-code">' + (c.code || '🎟️') + '</div>' +
          '<div class="coupon-desc">' + (c.description || '') + '</div>' +
          '<div class="coupon-discount">' + (c.discount || '') + '</div>' +
          (c.valid_until ? '<div class="coupon-valid">até ' + new Date(c.valid_until).toLocaleDateString('pt-BR') + '</div>' : '') +
        '</div>'
      )).join('')
    : '<div class="ml-loading">Nenhum cupom cadastrado ainda.</div>';

  return (
    '<div class="sec-title" style="margin-top:28px">🎟️ Cupons</div>' +
    '<div class="coupons-grid">' + list + '</div>' +
    '<div class="coupon-search-more">Não achou um cupom aqui? Verifique cupons atualizados: ' + extLinks + '</div>'
  );
}

// ── RENDER PRINCIPAL ─────────────────────────────────────────────
async function renderLojas() {
  const wrap = document.getElementById('lojas-wrap');
  if (!wrap) return;

  const storesHtml = STORES.map(renderStoreCard).join('');

  let termsSectionHtml;
  if (!uid()) {
    termsSectionHtml = '<div class="ml-loading">Faça login para cadastrar termos de busca e acompanhar histórico de preço.</div>';
  } else {
    await loadSearchTerms();
    const termsListHtml = _lojasTerms.length
      ? _lojasTerms.map(t => (
          '<div class="ml-term-card">' +
            '<div class="ml-term-hdr">' +
              '<span class="ml-term-name">🔎 ' + t.term + '</span>' +
              '<span class="ml-term-actions">' +
                '<button class="btn-mini" onclick="runSearchForTerm(' + JSON.stringify(t).replace(/"/g, '&quot;') + ', document.getElementById(\'res-' + t.id + '\'))">Buscar agora</button>' +
                '<button class="btn-mini btn-mini-danger" onclick="removeSearchTerm(' + t.id + ')">✕</button>' +
              '</span>' +
            '</div>' +
            '<div id="res-' + t.id + '" class="ml-term-results"></div>' +
          '</div>'
        )).join('')
      : '<div class="ml-loading">Nenhum termo cadastrado ainda — adicione um acima (ex: "booster me04", "etb charizard").</div>';

    termsSectionHtml =
      '<div class="ml-add-term">' +
        '<input id="new-ml-term" placeholder="Ex: booster pokemon me04, etb charizard...">' +
        '<button class="btn-add" onclick="const v=document.getElementById(\'new-ml-term\').value;if(v.trim())addSearchTerm(v);document.getElementById(\'new-ml-term\').value=\'\'">+ RASTREAR TERMO</button>' +
      '</div>' +
      '<div class="ml-terms-list">' + termsListHtml + '</div>';
  }

  const coupons = await loadCoupons();

  wrap.innerHTML =
    '<div class="sec-title" style="margin:0 0 4px">🛍️ Lojas Recomendadas</div>' +
    '<div class="stores-grid">' + storesHtml + '</div>' +

    '<div class="sec-title" style="margin-top:28px">🛒 Rastreador de Ofertas · Mercado Livre</div>' +
    '<div class="ml-tracker-intro">Cadastre um termo de busca e acompanhe o menor preço encontrado ao longo do tempo. Os links abrem com seu código de afiliado.</div>' +
    termsSectionHtml +

    renderCouponsBlock(coupons);
}

// Auto-render se a aba já estiver ativa no load (ex: refresh na URL)
document.addEventListener('DOMContentLoaded', () => {
  const pane = document.getElementById('lojas');
  if (pane && pane.classList.contains('active')) renderLojas();
});
