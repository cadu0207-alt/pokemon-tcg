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

// Edge Function (Supabase) que faz a busca autenticada no catálogo do ML.
// Existe porque /products/{id} e /products/{id}/items exigem token OAuth —
// e esse token não pode ficar no JS público, então quem chama a API de
// verdade é a function (server-side), não o navegador.
const ML_CATALOG_FN_URL = SUPABASE_URL + '/functions/v1/ml-catalog';

function extractCatalogId(input) {
  const trimmed = (input || '').trim();
  const pathMatch = trimmed.match(/\/p\/MLB-?(\d{6,})/i);
  if (pathMatch) return 'MLB' + pathMatch[1];
  const bareMatch = trimmed.match(/^MLB-?(\d{6,})$/i);
  if (bareMatch) return 'MLB' + bareMatch[1];
  return null;
}

async function fetchCatalogPreview(catalogIdOrLink) {
  const catalogId = extractCatalogId(catalogIdOrLink);
  if (!catalogId) return { ok: false, error: 'Link/ID de catálogo inválido. Use o formato .../p/MLB1234567 ou MLB1234567.' };
  try {
    const res = await fetch(ML_CATALOG_FN_URL + '?catalogId=' + encodeURIComponent(catalogId), {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: 'Falha ao chamar a busca de catálogo: ' + e.message };
  }
}

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
    name: 'TOYBOX Artes 3D',
    city: 'José Bonifácio · SP',
    logo: 'https://toyboxtcg.netlify.app/assets/logo.jpeg',
    tiktok: 'https://www.tiktok.com/@toyboxtcg',
    instagram: 'https://www.instagram.com/toybox_colecionaveis/',
    whatsapp: 'https://wa.me/5517991620996',
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
  const { data, error } = await withTimeout(
    sbClient.from('ml_search_terms').select('*').eq('active', true)
      .order('featured', { ascending: false }).order('created_at', { ascending: false }),
    10000, 'ml_search_terms'
  );
  if (error) { console.error('loadSearchTerms', error); return []; }
  return data || [];
}

async function addSearchTerm(linkOrId, label, collection) {
  if (!isAdmin() || !linkOrId.trim()) return;
  const preview = await fetchCatalogPreview(linkOrId);
  if (!preview.ok) { alert('Não consegui cadastrar: ' + preview.error); return; }

  const finalLabel = (label || '').trim() || preview.name || preview.catalogId;
  const { data, error } = await sbClient
    .from('ml_search_terms')
    .insert({
      user_id: uid(),
      term: preview.name || preview.catalogId,
      label: finalLabel,
      catalog_product_id: preview.catalogId,
      image_url: preview.image || null,
      collection: (collection || '').trim() || null
    })
    .select()
    .single();
  if (error) { alert('Erro ao salvar produto: ' + error.message); return; }

  if (preview.lowestPrice != null) await insertCatalogPriceRecord(data.id, preview);
  renderLojas();
}

async function saveCollection(id) {
  if (!isAdmin()) return;
  const input = document.getElementById('coll-' + id);
  if (!input) return;
  const val = input.value.trim();
  const { error } = await sbClient.from('ml_search_terms').update({ collection: val || null }).eq('id', id);
  if (error) { alert('Erro ao salvar coleção: ' + error.message); return; }
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
  // Pega os registros mais RECENTES (desc + limit) e depois inverte pra
  // ordem cronológica — antes pegava os mais ANTIGOS (asc + limit), então
  // depois de ~2,5 dias de cron horário os preços de ontem/hoje ficavam
  // de fora e "menor preço já registrado" comparava só dados velhos.
  const { data, error } = await withTimeout(
    sbClient.from('ml_price_history').select('*').eq('term_id', termId)
      .order('found_at', { ascending: false }).limit(500),
    10000, 'ml_price_history'
  );
  if (error) { console.error('loadPriceHistory', error); return []; }
  return (data || []).slice().reverse();
}

async function insertCatalogPriceRecord(termId, preview) {
  if (!sbClient || preview.lowestPrice == null) return;
  const row = {
    term_id: termId,
    ml_item_id: preview.catalogId,
    title: preview.name || preview.catalogId,
    price: preview.lowestPrice,
    currency: 'BRL',
    url: preview.lowestPriceUrl || preview.catalogUrl,
    thumbnail: preview.image || null,
    seller: preview.sellersCount ? preview.sellersCount + ' vendedores' : ''
  };
  const { error } = await sbClient.from('ml_price_history').insert([row]);
  if (error) console.error('insertCatalogPriceRecord', error);
}

// ── Blindagem: uma query travada (lock no banco, rede lenta etc.)
// não pode congelar a aba inteira de Lojas & Ofertas. Qualquer leitura
// que passar do prazo aqui é tratada como "sem dados" em vez de travar
// o await pra sempre.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => {
      console.error('[lojas] timeout (' + ms + 'ms) em: ' + label);
      resolve({ data: null, error: { message: 'timeout' } });
    }, ms))
  ]);
}

// ── DATA: cupons (leitura pública) ──────────────────────────────
async function loadCoupons() {
  if (!sbClient) return [];
  const { data, error } = await withTimeout(
    sbClient.from('ml_coupons').select('*').eq('active', true).order('created_at', { ascending: false }),
    10000, 'ml_coupons'
  );
  if (error) { console.error('loadCoupons', error); return []; }
  return data || [];
}

function couponForTerm(coupons, termId) {
  return coupons.find(c => c.term_id === termId) || null;
}

// ── CUPONS POR REGRA GERAL ───────────────────────────────────────
// Em vez de vincular um cupom testado a um produto por vez, o admin
// cadastra a regra do cupom (código, %/R$, compra mínima, teto de
// desconto) UMA vez, e ela é aplicada automaticamente em qualquer
// produto rastreado cujo preço bata as condições.
async function loadCouponRules() {
  if (!sbClient) return [];
  const { data, error } = await withTimeout(
    sbClient.from('ml_coupon_rules').select('*').eq('active', true).order('created_at', { ascending: false }),
    10000, 'ml_coupon_rules'
  );
  if (error) { console.error('loadCouponRules', error); return []; }
  return data || [];
}

// Calcula o desconto de UMA regra pra um preço — retorna null se a
// regra não se aplica (preço abaixo da compra mínima, ou expirada).
function ruleDiscountForPrice(rule, price) {
  if (rule.valid_until && new Date(rule.valid_until) < new Date()) return null;
  if (rule.min_purchase != null && price < +rule.min_purchase) return null;
  const value = +rule.discount_value;
  let discount = rule.discount_type === 'percent' ? price * (value / 100) : value;
  if (rule.max_discount != null) discount = Math.min(discount, +rule.max_discount);
  discount = Math.min(discount, price); // nunca passa do preço original
  return discount > 0 ? discount : null;
}

// Entre todas as regras ativas, acha a que dá o MAIOR desconto pra esse preço.
function bestRuleForPrice(rules, price) {
  let best = null, bestDiscount = 0;
  for (const rule of rules) {
    const d = ruleDiscountForPrice(rule, price);
    if (d != null && d > bestDiscount) { best = rule; bestDiscount = d; }
  }
  return best ? { rule: best, discount: bestDiscount, finalPrice: price - bestDiscount } : null;
}

async function saveCouponRule(existingId) {
  if (!isAdmin()) return;
  const code = document.getElementById('rule-code').value.trim();
  const type = document.getElementById('rule-type').value;
  const value = parseFloat(document.getElementById('rule-value').value);
  const minPurchase = parseFloat(document.getElementById('rule-min').value);
  const maxDiscount = parseFloat(document.getElementById('rule-max').value);
  const validUntil = document.getElementById('rule-until').value;
  if (!code || isNaN(value) || value <= 0) {
    alert('Preencha o código do cupom e um valor de desconto válido.');
    return;
  }
  const row = {
    code,
    discount_type: type,
    discount_value: value,
    min_purchase: isNaN(minPurchase) ? null : minPurchase,
    max_discount: isNaN(maxDiscount) ? null : maxDiscount,
    valid_until: validUntil || null,
    active: true
  };
  const { error } = existingId
    ? await sbClient.from('ml_coupon_rules').update(row).eq('id', existingId)
    : await sbClient.from('ml_coupon_rules').insert(row);
  if (error) { alert('Erro ao salvar regra de cupom: ' + error.message); return; }
  renderLojas();
}

async function removeCouponRule(id) {
  if (!isAdmin()) return;
  await sbClient.from('ml_coupon_rules').delete().eq('id', id);
  renderLojas();
}

async function toggleCouponRule(id, current) {
  if (!isAdmin()) return;
  await sbClient.from('ml_coupon_rules').update({ active: !current }).eq('id', id);
  renderLojas();
}

// ── INTEGRAÇÃO: preço real pro Preço Justo / Simulador ──────────
// Exposta globalmente porque ev_calculator.js (Preço Justo) chama isso
// direto — mesmo carregando antes de lojas.js no <head>, essa função só
// é de fato CHAMADA depois (quando o usuário abre a aba), quando lojas.js
// já rodou e já definiu window.mydeckGetRealPrice.
async function saveProductKey(termId) {
  if (!isAdmin()) return;
  const sel = document.getElementById('pkey-' + termId);
  if (!sel) return;
  const val = sel.value || null;
  const { error } = await sbClient.from('ml_search_terms').update({ product_key: val }).eq('id', termId);
  if (error) alert('Erro ao vincular produto: ' + error.message);
}

function productKeyOptionsHtml(selected) {
  const catalog = (typeof CATALOG !== 'undefined') ? CATALOG : [];
  let html = '<option value="">— nenhum —</option>';
  let lastGrupo = null;
  catalog.forEach(p => {
    if (p.grupo !== lastGrupo) {
      if (lastGrupo !== null) html += '</optgroup>';
      html += '<optgroup label="' + p.grupo + '">';
      lastGrupo = p.grupo;
    }
    html += '<option value="' + p.id + '"' + (p.id === selected ? ' selected' : '') + '>' + p.nome + '</option>';
  });
  if (lastGrupo !== null) html += '</optgroup>';
  return html;
}

window.mydeckGetRealPrice = async function(productKey) {
  if (!sbClient || !productKey) return null;
  const { data: term, error: e1 } = await sbClient
    .from('ml_search_terms')
    .select('id')
    .eq('product_key', productKey)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (e1 || !term) return null;
  const { data: rows, error: e2 } = await sbClient
    .from('ml_price_history')
    .select('price, found_at')
    .eq('term_id', term.id)
    .order('price', { ascending: true })
    .limit(1);
  if (e2 || !rows || !rows.length) return null;
  return { price: +rows[0].price, updatedAt: rows[0].found_at };
};

function applyCouponDiscount(price, coupon) {
  if (!coupon || !coupon.discount_type || coupon.discount_value == null) return null;
  const value = +coupon.discount_value;
  if (coupon.discount_type === 'percent') return Math.max(0, price * (1 - value / 100));
  if (coupon.discount_type === 'fixed') return Math.max(0, price - value);
  return null;
}

async function saveProductCoupon(termId) {
  if (!isAdmin()) return;
  const codeEl = document.getElementById('cupom-code-' + termId);
  const typeEl = document.getElementById('cupom-type-' + termId);
  const valueEl = document.getElementById('cupom-value-' + termId);
  const code = codeEl.value.trim();
  const discountType = typeEl.value;
  const discountValue = parseFloat(valueEl.value);
  if (!code || isNaN(discountValue) || discountValue <= 0) {
    alert('Preencha o código do cupom e um valor de desconto válido.');
    return;
  }
  const discountLabel = discountType === 'percent' ? discountValue + '% OFF' : 'R$ ' + fmtBRLLoja(discountValue) + ' OFF';

  const coupons = await loadCoupons();
  const existing = couponForTerm(coupons, termId);
  const row = {
    term_id: termId,
    code,
    description: 'Cupom exclusivo testado neste produto',
    discount: discountLabel,
    discount_type: discountType,
    discount_value: discountValue,
    source: 'manual',
    active: true
  };
  const { error } = existing
    ? await sbClient.from('ml_coupons').update(row).eq('id', existing.id)
    : await sbClient.from('ml_coupons').insert(row);
  if (error) { alert('Erro ao salvar cupom: ' + error.message); return; }
  renderLojas();
}

async function removeProductCoupon(couponId) {
  if (!isAdmin()) return;
  await sbClient.from('ml_coupons').delete().eq('id', couponId);
  renderLojas();
}

// ── BUSCA EM LOTE: atualiza todos os produtos rastreados de uma vez ──
// Botão manual pro admin — evita ter que clicar "Buscar agora" produto
// por produto. Roda em sequência (não em paralelo) com uma pequena
// pausa entre chamadas pra não sobrecarregar a Edge Function/API do ML.
async function refreshAllTerms() {
  if (!isAdmin()) return;
  const btn = document.getElementById('btn-refresh-all');
  const statusEl = document.getElementById('refresh-all-status');
  const terms = await loadSearchTerms();
  if (!terms.length) return;

  if (btn) { btn.disabled = true; }
  let ok = 0, fail = 0;
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    if (statusEl) statusEl.textContent = 'Atualizando ' + (i + 1) + '/' + terms.length + ': ' + (t.label || t.term) + '...';
    try {
      const preview = await fetchCatalogPreview(t.catalog_product_id || t.term);
      if (preview.ok && preview.lowestPrice != null) {
        await insertCatalogPriceRecord(t.id, preview);
        if (preview.image && preview.image !== t.image_url) {
          await sbClient.from('ml_search_terms').update({ image_url: preview.image }).eq('id', t.id);
        }
        ok++;
      } else {
        fail++;
      }
    } catch (e) {
      fail++;
    }
    await new Promise(r => setTimeout(r, 700)); // pausa entre chamadas
  }
  if (statusEl) statusEl.textContent = '✅ Atualizado: ' + ok + ' produto(s)' + (fail ? ' · ⚠️ ' + fail + ' falharam' : '') + '.';
  if (btn) { btn.disabled = false; }
  renderLojas();
}

// ── BUSCA no catálogo do Mercado Livre (via Edge Function) — admin ──
async function runSearchForTerm(termObj, containerEl) {
  if (!isAdmin()) return;
  const label = termObj.label || termObj.term;
  containerEl.innerHTML = '<div class="ml-loading">🔎 Buscando vendedores para "' + label + '"...</div>';

  const preview = await fetchCatalogPreview(termObj.catalog_product_id || termObj.term);
  if (!preview.ok) {
    containerEl.innerHTML = '<div class="ml-loading">⚠️ ' + preview.error + '</div>';
    return;
  }
  if (!preview.sellersCount) {
    containerEl.innerHTML = '<div class="ml-loading">Nenhum vendedor encontrado agora para "' + label + '".</div>';
    return;
  }

  await insertCatalogPriceRecord(termObj.id, preview);
  if (preview.image && preview.image !== termObj.image_url) {
    await sbClient.from('ml_search_terms').update({ image_url: preview.image }).eq('id', termObj.id);
  }

  const rows = preview.sellers.slice(0, 6).map(s => (
    '<div class="ml-admin-result">' +
      '<div class="ml-admin-result-info">' +
        '<div class="ml-result-title">Vendedor #' + s.seller_id + (s.free_shipping ? ' · frete grátis' : '') + '</div>' +
        '<div class="ml-result-price">R$ ' + fmtBRLLoja(s.price) + '</div>' +
      '</div>' +
    '</div>'
  )).join('');
  containerEl.innerHTML =
    '<div class="ml-loading">✅ ' + preview.sellersCount + ' vendedores encontrados — menor preço agora: R$ ' + fmtBRLLoja(preview.lowestPrice) + '</div>' +
    '<div class="ml-admin-results">' + rows + '</div>' +
    '<div class="ml-admin-hint">Copie o link do catálogo (' +
      '<button class="btn-mini" onclick="copyToClipboard(' + JSON.stringify(preview.catalogUrl) + ', this)">📋 Copiar link</button>' +
      '), cole em <a href="' + ML_AFFILIATE_TOOL_URL + '" target="_blank" rel="noopener">Central de Afiliados → Gerador de links</a>, e cole o link meli.la gerado no campo "Link de afiliado" abaixo.</div>';
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
function computePriceStats(history) {
  const prices = (history || [])
    .map(r => +r.price)
    .filter(p => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  const n = prices.length;
  const sum = prices.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const median = n % 2 === 1 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2;
  return { min: prices[0], max: prices[n - 1], avg, median, count: n };
}

// ── SISTEMA DE DESTAQUES AUTOMÁTICO ─────────────────────────────
// "Desconto real" de um produto = o quanto o preço mais recente está
// abaixo da MEDIANA do próprio histórico dele (não comparado a outros
// produtos — cada um só compete com o próprio passado). Precisa de
// pelo menos 2 registros de preço pra fazer sentido (senão não há
// "normal" pra comparar) — com só 1 registro, retorna null e o produto
// não entra no ranking por desconto até o cron rodar mais vezes.
function computeDealScore(history) {
  const stats = computePriceStats(history);
  if (!stats || stats.count < 2) return null;
  const latest = latestRecord(history);
  if (!latest) return null;
  const current = +latest.price;
  if (!Number.isFinite(current) || current <= 0) return null;
  const basis = stats.median || stats.avg;
  if (!basis) return null;
  return (basis - current) / basis; // >0 = mais barato que o normal agora; <0 = mais caro
}

// Fisher-Yates — usado pra embaralhar os produtos que não entraram
// no top de desconto (a partir do 10º), pra não sempre mostrar os
// mesmos produtos "de baixo" na mesma ordem.
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

function renderProductCard(term, history, featured, coupon, rules, dealScore) {
  const best = bestRecord(history);
  const latest = latestRecord(history);
  const label = term.label || term.term;
  const linkUrl = term.affiliate_url || (best ? best.url : null);

  const collectionAttr = ' data-collection="' + (term.collection || '').replace(/"/g, '&quot;') + '"';
  const scoreAttr = ' data-deal-score="' + (dealScore == null ? '' : dealScore) + '"';

  if (!best) {
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

  const updatedStr = latest && latest.found_at ? new Date(latest.found_at).toLocaleDateString('pt-BR') : '';
  const imgSrc = term.image_url || best.thumbnail;

  // Compara o cupom vinculado direto ao produto (manual) com a melhor
  // regra geral aplicável ao preço — usa o que der mais desconto.
  const productCouponDiscount = coupon ? applyCouponDiscount(+best.price, coupon) : null;
  const ruleMatch = (rules && rules.length) ? bestRuleForPrice(rules, +best.price) : null;

  let discounted = null, badgeCode = null, badgeLabel = null;
  const productSaved = productCouponDiscount != null ? (+best.price - productCouponDiscount) : null;
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
          '<span class="product-price-old">R$ ' + fmtBRLLoja(best.price) + '</span>' +
          '<span class="product-price-new">R$ ' + fmtBRLLoja(discounted) + '</span>' +
        '</div>' +
        '<div class="product-coupon-badge">🎟️ Cupom <code>' + badgeCode + '</code> · ' + badgeLabel + '</div>'
      )
    : '<div class="product-price">R$ ' + fmtBRLLoja(best.price) + '</div>';
  return (
    '<a class="product-card' + (featured ? ' product-card-featured' : '') + '"' + collectionAttr + scoreAttr + ' href="' + linkUrl + '" target="_blank" rel="noopener' + (term.affiliate_url ? ' sponsored' : '') + '">' +
      (featured ? '<div class="product-badge">🔥 OFERTA IMPERDÍVEL</div>' : '') +
      '<img class="product-img" src="' + imgSrc + '" alt="' + label + '">' +
      '<div class="product-info">' +
        '<div class="product-name">' + label + '</div>' +
        priceHtml +
        '<div class="product-note">menor preço já registrado' + (updatedStr ? ' · atualizado ' + updatedStr : '') + '</div>' +
        '<div class="product-note-warn">💡 Se o preço na página não bater, veja "Outras opções de compra"/"Mais vendedores" ao lado do produto — o valor listado costuma estar lá.</div>' +
        statsHtml +
      '</div>' +
    '</a>'
  );
}

// Filtro por coleção (Caos Ascendente, Inglês etc.) — 100% client-side:
// já temos todos os cards renderizados no DOM, então filtrar é só
// mostrar/esconder por data-collection, sem nova consulta ao banco.
function renderCollectionFilterBar(terms) {
  const set = new Set();
  terms.forEach(function(t) { if (t.collection) set.add(t.collection); });
  if (!set.size) return '';
  const options = Array.from(set).sort();
  const chips = ['<button class="filter-chip filter-chip-active" data-filter="" onclick="filterLojasByCollection(\'\', this)">Todos</button>']
    .concat(options.map(function(c) {
      return '<button class="filter-chip" data-filter="' + c.replace(/"/g, '&quot;') + '" onclick="filterLojasByCollection(\'' + c.replace(/'/g, "\\'") + '\', this)">' + c + '</button>';
    }));
  return '<div class="collection-filter-bar">' + chips.join('') + '</div>';
}

function filterLojasByCollection(collection, btn) {
  const bar = btn ? btn.closest('.collection-filter-bar') : null;
  if (bar) {
    bar.querySelectorAll('.filter-chip').forEach(function(el) { el.classList.remove('filter-chip-active'); });
    btn.classList.add('filter-chip-active');
  }
  document.querySelectorAll('#lojas-showcase .product-card').forEach(function(card) {
    const match = !collection || card.getAttribute('data-collection') === collection;
    card.classList.toggle('product-card-hidden', !match);
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
  const featuredCards = [];
  const normalCards = [];
  terms.forEach((t, i) => {
    const html = renderProductCard(t, histories[i], !!t.featured, couponForTerm(coupons, t.id), rules);
    if (t.featured) featuredCards.push(html); else normalCards.push(html);
  });

  let html = '<div class="ml-price-warning">⚠️ Os preços aqui mostram sempre o <strong>menor valor encontrado entre todos os vendedores</strong> do produto no Mercado Livre — mesmo que esse vendedor tenha poucas vendas ou pouca reputação ainda. Antes de comprar, confira a avaliação e o histórico do vendedor na página do anúncio. Preços são atualizados a cada hora — mudanças recentes no ML podem levar até 1h pra aparecer aqui.</div>';
  html += renderCollectionFilterBar(terms);
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

  const [terms, coupons, rules] = await Promise.all([loadSearchTerms(), loadCoupons(), loadCouponRules()]);
  const termsListHtml = terms.length
    ? terms.map(t => {
        const coupon = couponForTerm(coupons, t.id);
        return (
        '<div class="ml-term-card">' +
          '<div class="ml-term-hdr">' +
            '<span class="ml-term-name">' + (t.featured ? '🔥 ' : '🔎 ') + (t.label || t.term) + '</span>' +
            '<span class="ml-term-actions">' +
              '<button class="btn-mini" onclick="runSearchForTerm(' + JSON.stringify(t).replace(/"/g, '&quot;') + ', document.getElementById(\'res-' + t.id + '\'))">Buscar agora</button>' +
              '<button class="btn-mini' + (t.featured ? ' btn-mini-active' : '') + '" onclick="toggleFeatured(' + t.id + ',' + (!!t.featured) + ')">' + (t.featured ? '★ Destaque' : '☆ Destacar') + '</button>' +
              '<button class="btn-mini btn-mini-danger" onclick="removeSearchTerm(' + t.id + ')">✕</button>' +
            '</span>' +
          '</div>' +
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
    '<div class="ml-terms-list">' + termsListHtml + '</div>';
}

function collectionsDatalistHtml(terms) {
  const set = new Set();
  (terms || []).forEach(function(t) { if (t.collection) set.add(t.collection); });
  return Array.from(set).sort().map(function(c) { return '<option value="' + c + '">'; }).join('');
}

async function onAddCatalogClick() {
  const btn = document.getElementById('btn-add-ml-term');
  const labelEl = document.getElementById('new-ml-label');
  const linkEl = document.getElementById('new-ml-term');
  const collEl = document.getElementById('new-ml-collection');
  if (!linkEl.value.trim()) return;
  const oldText = btn.textContent;
  btn.textContent = 'Buscando...';
  btn.disabled = true;
  await addSearchTerm(linkEl.value, labelEl.value, collEl ? collEl.value : '');
  linkEl.value = '';
  labelEl.value = '';
  if (collEl) collEl.value = '';
  btn.textContent = oldText;
  btn.disabled = false;
}

// ── RENDER: cupons ───────────────────────────────────────────────
function renderCouponsBlock(allCoupons) {
  const coupons = allCoupons.filter(c => !c.term_id); // cupons de produto aparecem no card dele
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
    '<div class="affiliate-disclosure">🔗 Esta aba contém links de afiliado do Mercado Livre — ao comprar por eles, o MyDeck pode receber uma pequena comissão, sem custo adicional para você.</div>' +
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
