// ================================================================
// MyDeck — Lojas & Ofertas (lojas.js)
// Aba de indicação de lojas parceiras + vitrine de ofertas rastreadas
// no Mercado Livre. O cadastro de termos de busca é restrito ao admin
// (Eduardo) — os demais usuários só veem a vitrine já pronta, com
// imagem do produto, menor preço já registrado e link de afiliado.
//
// IMPORTANTE: o Mercado Livre não tem API pública pra gerar link de
// afiliado — o "Gerador de produtos recomendados" só funciona logado,
// manualmente, dentro da Central de Afiliados e Criadores. Por isso o
// link de afiliado de cada produto é colado à mão pelo admin (campo
// affiliate_url), depois de gerado em:
// https://www.mercadolivre.com.br/l/afiliados-gere-seus-links
//
// Carregado depois de app.js — reaproveita sbClient, currentUser,
// uid() e USD_BRL já definidos lá.
// ================================================================

// ── CONFIG: admin (único que cadastra/edita termos de busca) ────
const ADMIN_UID = 'eb9da0ad-9877-4f17-ac5a-6f1da5eebc9b';
const ADMIN_EMAIL = 'cadu0207@gmail.com';
function isAdmin() {
  return uid() === ADMIN_UID || (currentUser && currentUser.email || '').toLowerCase() === ADMIN_EMAIL;
}

// Link da Central de Afiliados do Mercado Livre (gerador manual de links)
const ML_AFFILIATE_TOOL_URL = 'https://www.mercadolivre.com.br/l/afiliados-gere-seus-links';

// ── CONFIG: lojas parceiras ─────────────────────────────────────
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
    city: '',
    logo: '',
    tiktok: '',
    instagram: '',
    whatsapp: '',
    color: '#c8960a',
    tag: '⭐ Loja recomendada'
  },
  {
    name: 'TOYBOX POKE CARDS',
    city: '',
    logo: '',
    tiktok: '',
    instagram: '',
    whatsapp: '',
    color: '#0e7898',
    tag: '⭐ Loja recomendada'
  }
];

function mlSearchUrl(term) {
  return 'https://lista.mercadolivre.com.br/' + encodeURIComponent(term).replace(/%20/g, '-');
}

function fmtBRLLoja(v) {
  return (+v || 0).toFixed(2).replace('.', ',');
}

function copyToClipboard(text, btn) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      if (btn) { const old = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(() => btn.textContent = old, 1400); }
    }).catch(() => {});
  }
}

// ── DATA: termos de busca (Supabase) — leitura pública, escrita admin ──
async function loadSearchTerms() {
  if (!sbClient) return [];
  const { data, error } = await sbClient
    .from('ml_search_terms')
    .select('*')
    .eq('active', true)
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) { console.error('loadSearchTerms', error); return []; }
  return data || [];
}

async function addSearchTerm(term, label) {
  if (!isAdmin() || !term.trim()) return;
  const { error } = await sbClient
    .from('ml_search_terms')
    .insert({ user_id: uid(), term: term.trim(), label: (label || '').trim() || term.trim() });
  if (error) { alert('Erro ao salvar termo: ' + error.message); return; }
  renderLojas();
}

async function removeSearchTerm(id) {
  if (!isAdmin()) return;
  await sbClient.from('ml_search_terms').delete().eq('id', id);
  renderLojas();
}

async function toggleFeatured(id, current) {
  if (!isAdmin()) return;
  await sbClient.from('ml_search_terms').update({ featured: !current }).eq('id', id);
  renderLojas();
}

async function saveAffiliateUrl(id) {
  if (!isAdmin()) return;
  const input = document.getElementById('aff-' + id);
  if (!input) return;
  const val = input.value.trim();
  const { error } = await sbClient.from('ml_search_terms').update({ affiliate_url: val || null }).eq('id', id);
  if (error) { alert('Erro ao salvar link de afiliado: ' + error.message); return; }
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
    seller: r.seller && r.seller.nickname ? r.seller.nickname : ''
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

// ── BUSCA no Mercado Livre (API pública) — só o admin dispara ──
async function searchMercadoLivre(term) {
  try {
    const url = 'https://api.mercadolibre.com/sites/MLB/search?q=' + encodeURIComponent(term) + '&limit=12';
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return (json.results || []).sort((a, b) => a.price - b.price);
  } catch (e) {
    console.warn('searchMercadoLivre falhou (provável bloqueio de CORS no navegador):', e);
    return null;
  }
}

async function runSearchForTerm(termObj, containerEl) {
  if (!isAdmin()) return;
  containerEl.innerHTML = '<div class="ml-loading">🔎 Buscando ofertas para "' + termObj.term + '"...</div>';
  const results = await searchMercadoLivre(termObj.term);
  if (results === null) {
    containerEl.innerHTML =
      '<div class="ml-loading">⚠️ Não consegui buscar direto (bloqueio do navegador). ' +
      '<a href="' + mlSearchUrl(termObj.term) + '" target="_blank" rel="noopener">Abrir busca no Mercado Livre →</a></div>';
    return;
  }
  if (results.length) await insertPriceRecords(termObj.id, results);
  if (!results.length) {
    containerEl.innerHTML = '<div class="ml-loading">Nenhum resultado encontrado agora para "' + termObj.term + '".</div>';
    return;
  }
  const rows = results.slice(0, 6).map(r => (
    '<div class="ml-admin-result">' +
      '<img src="' + r.thumbnail + '" alt="">' +
      '<div class="ml-admin-result-info">' +
        '<div class="ml-result-title">' + (r.title || '').slice(0, 55) + '</div>' +
        '<div class="ml-result-price">R$ ' + fmtBRLLoja(r.price) + '</div>' +
      '</div>' +
      '<button class="btn-mini" onclick="copyToClipboard(' + JSON.stringify(r.permalink) + ', this)">📋 Copiar URL</button>' +
    '</div>'
  )).join('');
  containerEl.innerHTML =
    '<div class="ml-loading">✅ ' + results.length + ' ofertas registradas — menor preço agora: R$ ' + fmtBRLLoja(results[0].price) + '</div>' +
    '<div class="ml-admin-results">' + rows + '</div>' +
    '<div class="ml-admin-hint">Copie a URL do produto que quer indicar, cole em <a href="' + ML_AFFILIATE_TOOL_URL + '" target="_blank" rel="noopener">Central de Afiliados → Gerador de links</a>, e cole o link meli.la gerado no campo "Link de afiliado" abaixo.</div>';
  renderShowcaseSection();
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

// ── RENDER: vitrine pública de produtos rastreados ──────────────
function bestRecord(history) {
  if (!history.length) return null;
  return history.reduce((min, r) => (+r.price < +min.price ? r : min), history[0]);
}
function latestRecord(history) {
  return history.length ? history[history.length - 1] : null;
}

function renderProductCard(term, history, featured) {
  const best = bestRecord(history);
  const latest = latestRecord(history);
  const label = term.label || term.term;
  const linkUrl = term.affiliate_url || (best ? best.url : null);

  if (!best) {
    return (
      '<div class="product-card' + (featured ? ' product-card-featured' : '') + '">' +
        '<div class="product-img product-img-empty">📦</div>' +
        '<div class="product-info">' +
          '<div class="product-name">' + label + '</div>' +
          '<div class="product-empty-note">Ainda sem preços registrados — em breve.</div>' +
        '</div>' +
      '</div>'
    );
  }

  const updatedStr = latest && latest.found_at ? new Date(latest.found_at).toLocaleDateString('pt-BR') : '';
  return (
    '<a class="product-card' + (featured ? ' product-card-featured' : '') + '" href="' + linkUrl + '" target="_blank" rel="noopener' + (term.affiliate_url ? ' sponsored' : '') + '">' +
      (featured ? '<div class="product-badge">🔥 OFERTA IMPERDÍVEL</div>' : '') +
      '<img class="product-img" src="' + best.thumbnail + '" alt="' + label + '">' +
      '<div class="product-info">' +
        '<div class="product-name">' + label + '</div>' +
        '<div class="product-price">R$ ' + fmtBRLLoja(best.price) + '</div>' +
        '<div class="product-note">menor preço já registrado' + (updatedStr ? ' · atualizado ' + updatedStr : '') + '</div>' +
      '</div>' +
    '</a>'
  );
}

async function renderShowcaseSection() {
  const holder = document.getElementById('lojas-showcase');
  if (!holder) return;
  const terms = await loadSearchTerms();
  if (!terms.length) {
    holder.innerHTML = '<div class="ml-loading">Nenhuma oferta cadastrada ainda.</div>';
    return;
  }
  const histories = await Promise.all(terms.map(t => loadPriceHistory(t.id)));
  const featuredCards = [];
  const normalCards = [];
  terms.forEach((t, i) => {
    const html = renderProductCard(t, histories[i], !!t.featured);
    if (t.featured) featuredCards.push(html); else normalCards.push(html);
  });

  let html = '';
  if (featuredCards.length) {
    html += '<div class="sec-title" style="margin-top:8px">🔥 Ofertas em Destaque</div>';
    html += '<div class="products-grid products-grid-featured">' + featuredCards.join('') + '</div>';
  }
  html += '<div class="sec-title" style="margin-top:24px">🛒 Ofertas Rastreadas · Mercado Livre</div>';
  html += '<div class="products-grid">' + (normalCards.join('') || '<div class="ml-loading">Nenhuma outra oferta cadastrada.</div>') + '</div>';

  holder.innerHTML = html;
}

// ── RENDER: painel do admin (só aparece para o Eduardo logado) ──
async function renderAdminPanel() {
  const holder = document.getElementById('lojas-admin');
  if (!holder) return;
  if (!isAdmin()) { holder.innerHTML = ''; return; }

  const terms = await loadSearchTerms();
  const termsListHtml = terms.length
    ? terms.map(t => (
        '<div class="ml-term-card">' +
          '<div class="ml-term-hdr">' +
            '<span class="ml-term-name">' + (t.featured ? '🔥 ' : '🔎 ') + (t.label || t.term) + '</span>' +
            '<span class="ml-term-actions">' +
              '<button class="btn-mini" onclick="runSearchForTerm(' + JSON.stringify(t).replace(/"/g, '&quot;') + ', document.getElementById(\'res-' + t.id + '\'))">Buscar agora</button>' +
              '<button class="btn-mini' + (t.featured ? ' btn-mini-active' : '') + '" onclick="toggleFeatured(' + t.id + ',' + (!!t.featured) + ')">' + (t.featured ? '★ Destaque' : '☆ Destacar') + '</button>' +
              '<button class="btn-mini btn-mini-danger" onclick="removeSearchTerm(' + t.id + ')">✕</button>' +
            '</span>' +
          '</div>' +
          '<div class="ml-term-sub">termo de busca: <code>' + t.term + '</code></div>' +
          '<div class="ml-aff-row">' +
            '<input id="aff-' + t.id + '" placeholder="Cole aqui o link meli.la gerado" value="' + (t.affiliate_url || '') + '">' +
            '<button class="btn-mini" onclick="saveAffiliateUrl(' + t.id + ')">Salvar link</button>' +
          '</div>' +
          '<div id="res-' + t.id + '" class="ml-term-results"></div>' +
        '</div>'
      )).join('')
    : '<div class="ml-loading">Nenhum termo cadastrado ainda — adicione um acima.</div>';

  holder.innerHTML =
    '<div class="sec-title" style="margin-top:28px">⚙️ Admin · Cadastrar Produto Rastreado</div>' +
    '<div class="ml-add-term">' +
      '<input id="new-ml-label" placeholder="Nome do produto (ex: Booster Box ME04)">' +
      '<input id="new-ml-term" placeholder="Termo de busca no ML (ex: booster box pokemon me04)">' +
      '<button class="btn-add" onclick="var l=document.getElementById(&quot;new-ml-label&quot;).value;var v=document.getElementById(&quot;new-ml-term&quot;).value;if(v.trim())addSearchTerm(v,l);document.getElementById(&quot;new-ml-term&quot;).value=&quot;&quot;;document.getElementById(&quot;new-ml-label&quot;).value=&quot;&quot;;">+ RASTREAR PRODUTO</button>' +
    '</div>' +
    '<div class="ml-terms-list">' + termsListHtml + '</div>';
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
  const coupons = await loadCoupons();

  wrap.innerHTML =
    '<div class="sec-title" style="margin:0 0 4px">🛍️ Lojas Recomendadas</div>' +
    '<div class="stores-grid">' + storesHtml + '</div>' +
    '<div id="lojas-showcase"></div>' +
    '<div id="lojas-admin"></div>' +
    renderCouponsBlock(coupons);

  await renderShowcaseSection();
  await renderAdminPanel();
}

// Auto-render se a aba já estiver ativa no load (ex: refresh na URL)
document.addEventListener('DOMContentLoaded', () => {
  const pane = document.getElementById('lojas');
  if (pane && pane.classList.contains('active')) renderLojas();
});
